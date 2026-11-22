/// <reference path="./worklet-env.d.ts" />
import type { DeckIn, DeckState } from './protocol';

/**
 * Deck playback engine on the audio thread.
 * - variable-speed playback (forward / reverse / scratch) with cubic interpolation
 * - sample-accurate loops; every jump (loop wrap, seek, beat jump, slip return) is crossfaded -> no clicks
 * - slip mode: a shadow playhead keeps running; when the slip action ends we return to it
 * - censor = reverse + slip while held; vinyl brake / spinback
 *
 * Key lock (look-ahead): a second read head runs `lookahead` output-samples *ahead* of the main head
 * and feeds the pitch-shifter (output 1). The shifter delays by exactly that amount, so its output lines
 * up sample-for-sample with the main head (output 0, channels 0-1). Channel 2 of output 0 carries the
 * wet/dry weight for the keylock mixer: dry right after any discontinuity (until the shifter has caught
 * up) and during scratch/reverse/brake; wet in normal playback when pitch correction is wanted.
 */

const XF = 256;            // crossfade length for jumps (~5 ms)
const GAIN_A = 0.01;       // declick envelope coefficient (~2 ms)
const SCRATCH_A = 0.004;   // platter inertia while scratching (~5 ms)
const W_IN = 1 / 256;      // wet fade-in step
const W_OUT = 1 / 64;      // wet fade-out step (fast, at discontinuities)

function hermite(b: Float32Array, p: number): number {
  const i = Math.floor(p), n = b.length;
  if (i < 1 || i + 2 >= n) return i >= 0 && i < n ? b[i] : 0;
  const f = p - i, y0 = b[i - 1], y1 = b[i], y2 = b[i + 1], y3 = b[i + 2];
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * f + c2) * f + c1) * f + y1;
}

/** A read head with click-free jumps. */
class Head {
  pos = 0;
  xfPos = 0;
  xfLeft = 0;
  l = 0;
  r = 0;

  jump(to: number, smooth: boolean): void {
    if (smooth) { this.xfPos = this.pos; this.xfLeft = XF; } else this.xfLeft = 0;
    this.pos = to;
  }

  read(L: Float32Array, R: Float32Array, rate: number): void {
    let l = hermite(L, this.pos), r = hermite(R, this.pos);
    if (this.xfLeft > 0) {
      const w = 0.5 - 0.5 * Math.cos(Math.PI * (1 - this.xfLeft / XF));
      l = l * w + hermite(L, this.xfPos) * (1 - w);
      r = r * w + hermite(R, this.xfPos) * (1 - w);
      this.xfPos += rate;
      this.xfLeft--;
    }
    this.l = l; this.r = r;
  }
}

class DeckProcessor extends AudioWorkletProcessor {
  private L: Float32Array = new Float32Array(0);
  private R: Float32Array = new Float32Array(0);
  private len = 0;
  private main = new Head();
  private shadow = 0;
  private playing = false;
  private tempo = 1;
  private rate = 0;
  private reverse = false;
  private slip = false;
  private censor = false;
  private scratching = false;
  private scratchRate = 0;
  private smoothRate = false;
  private vfx = 0;          // 0 none, 1 brake, 2 spinback
  private vfxRate = 0;
  private vfxStep = 0;
  private loopOn = false;
  private loopS = 0;
  private loopE = 0;
  private rollOn = false;
  private rollS = 0;
  private rollE = 0;
  private gain = 0;
  private wasSlipping = false;
  private blocks = 0;
  // key lock look-ahead
  private ahead = new Head();
  private lookahead = 0;    // output samples the pitch-shifter lags behind
  private wetWanted = false;
  private aheadOn = false;
  private wetHold = 0;      // samples until the shifter output is valid again
  private w = 0;            // current wet weight

  constructor() {
    super();
    this.port.onmessage = e => this.onMsg(e.data as DeckIn);
  }

  private get pos(): number { return this.main.pos; }

  /** Move the main read head (crossfaded if audible); the look-ahead head must resync. */
  private jump(to: number): void {
    to = Math.max(0, Math.min(this.len - 1, to));
    this.main.jump(to, this.gain > 0.001);
    this.aheadOn = false;
  }

  /** Active loop: a roll overrides the normal loop while it is held. */
  private get lOn(): boolean { return this.rollOn || this.loopOn; }
  private get lS(): number { return this.rollOn ? this.rollS : this.loopS; }
  private get lE(): number { return this.rollOn ? this.rollE : this.loopE; }

  private wrapLoop(p: number): number {
    if (!this.lOn) return p;
    const s = this.lS, e = this.lE, n = e - s;
    if (n <= 0 || p < e) return p;
    return s + ((p - s) % n);
  }

  private onMsg(m: DeckIn): void {
    switch (m.t) {
      case 'load':
        this.L = m.L; this.R = m.R; this.len = m.L.length;
        this.main.jump(0, false); this.shadow = 0; this.playing = false; this.loopOn = false;
        this.reverse = this.censor = this.scratching = false; this.vfx = 0;
        this.gain = 0; this.rate = 0; this.aheadOn = false; this.w = 0;
        break;
      case 'play': this.playing = m.on; if (m.on) this.vfx = 0; break;
      case 'seek': this.jump(m.pos); this.shadow = this.pos; break;
      case 'jump':
        this.jump(this.pos + m.d); this.shadow += m.d;
        if (this.loopOn) { this.loopS += m.d; this.loopE += m.d; }
        break;
      case 'tempo': this.tempo = m.v; break;
      case 'loop':
        this.loopOn = m.on;
        if (m.on) { this.loopS = m.s; this.loopE = m.e; }
        this.aheadOn = false;
        break;
      case 'roll':
        this.rollOn = m.on;
        if (m.on) { this.rollS = m.s; this.rollE = m.e; if (m.jump) this.jump(m.s); }
        this.aheadOn = false;
        break;
      case 'reverse': this.reverse = m.on; break;
      case 'slip': this.slip = m.on; break;
      case 'censor': this.censor = m.on; break;
      case 'scratch':
        if (m.on !== this.scratching) { this.scratching = m.on; this.smoothRate = true; }
        this.scratchRate = m.rate;
        break;
      case 'vinyl': {
        if (!this.playing) break;
        const steps = Math.max(1, m.dur * sampleRate);
        if (m.fx === 'brake') { this.vfx = 1; this.vfxRate = this.rate; }
        else { this.vfx = 2; this.vfxRate = -3; }
        this.vfxStep = Math.abs(this.vfxRate) / steps;
        this.smoothRate = true;
        break;
      }
      case 'keylock': this.lookahead = Math.max(0, Math.round(m.lookahead)); this.wetWanted = m.wet; break;
    }
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0], oL = out[0], oR = out[1], oW = out[2];
    const ahead = outputs[1], aL = ahead?.[0], aR = ahead?.[1];
    const n = oL.length;
    if (!this.len) {
      for (const c of out) c.fill(0);
      if (ahead) for (const c of ahead) c.fill(0);
      return true;
    }

    const slipping = this.censor || this.rollOn || (this.slip && (this.loopOn || this.reverse || this.scratching));
    const lOn = this.lOn, lS = this.lS, lE = this.lE;
    if (this.wasSlipping && !slipping) this.jump(this.shadow);
    this.wasSlipping = slipping;
    const back = this.reverse || this.censor;
    const L = this.L, R = this.R, main = this.main, ah = this.ahead, la = this.lookahead;

    for (let i = 0; i < n; i++) {
      const audible = this.playing || this.scratching || this.vfx !== 0;
      if (!audible && this.gain < 1e-4) {
        this.gain = 0; this.rate = 0; this.aheadOn = false; this.w = 0;
        oL[i] = oR[i] = 0; if (oW) oW[i] = 0;
        if (aL) aL[i] = 0; if (aR) aR[i] = 0;
        continue;
      }

      // target speed
      let target: number;
      if (this.vfx) {
        this.vfxRate = this.vfxRate > 0 ? Math.max(0, this.vfxRate - this.vfxStep) : Math.min(0, this.vfxRate + this.vfxStep);
        target = this.vfxRate;
        if (this.vfxRate === 0) { this.vfx = 0; this.playing = false; }
      } else if (this.scratching) target = this.scratchRate;
      else if (this.playing) target = back ? -this.tempo : this.tempo;
      else target = this.rate; // fading out: keep moving
      if (this.vfx) this.rate = target;
      else if (this.scratching || this.smoothRate) {
        this.rate += (target - this.rate) * SCRATCH_A;
        if (!this.scratching && Math.abs(target - this.rate) < 1e-3) this.smoothRate = false;
      } else this.rate = target;
      const rate = this.rate;

      // declick envelope
      this.gain += ((audible ? 1 : 0) - this.gain) * GAIN_A;
      const g = this.gain;

      // main head
      main.read(L, R, rate);
      oL[i] = main.l * g;
      oR[i] = main.r * g;

      // look-ahead head (key lock) — only in plain forward playback
      const normal = this.playing && !this.scratching && !this.vfx && !back && !this.smoothRate && la > 0;
      let wTarget = 0;
      if (normal) {
        if (!this.aheadOn) {
          ah.jump(this.wrapLoop(main.pos + la * rate), false);
          this.aheadOn = true;
          this.wetHold = la + XF;
        }
        ah.read(L, R, rate);
        if (aL) aL[i] = ah.l * g;
        if (aR) aR[i] = ah.r * g;
        const prevA = ah.pos;
        ah.pos += rate;
        if (lOn) {
          if (prevA < lE && ah.pos >= lE) ah.jump(lS + (ah.pos - lE), true);
        } else {
          // keep the offset exact when the tempo changes
          // (main has not advanced yet this sample, the look-ahead head has)
          const err = main.pos + rate + la * rate - ah.pos;
          if (Math.abs(err) > la * 0.25 + 64) this.aheadOn = false;
          else ah.pos += err * 0.001;
        }
        if (this.wetHold > 0) this.wetHold--;
        else if (this.wetWanted) wTarget = 1;
      } else {
        this.aheadOn = false;
        if (aL) aL[i] = 0;
        if (aR) aR[i] = 0;
      }
      if (!this.aheadOn && !normal) wTarget = 0;
      this.w += wTarget > this.w ? Math.min(W_IN, wTarget - this.w) : -Math.min(W_OUT, this.w - wTarget);
      if (oW) oW[i] = this.w;

      // advance main head
      const prev = main.pos;
      main.pos += rate;
      if (slipping) { if (this.playing) this.shadow += this.tempo; }
      else this.shadow = main.pos;

      if (lOn) {
        if (rate > 0 && prev < lE && main.pos >= lE) main.jump(lS + (main.pos - lE), this.gain > 0.001);
        else if (rate < 0 && prev >= lS && main.pos < lS) this.jump(lE - (lS - main.pos));
      }
      if (main.pos >= this.len - 1) { main.pos = this.len - 1; if (rate > 0) this.playing = false; }
      else if (main.pos < 0) main.pos = 0;
    }

    if (++this.blocks % 3 === 0) {
      const s: DeckState = {
        t: 'state', pos: main.pos, rate: this.gain > 0 ? this.rate : 0,
        playing: this.playing, audible: this.playing || this.scratching || this.vfx !== 0, at: currentTime,
        wet: this.w,
      };
      this.port.postMessage(s);
    }
    return true;
  }
}

registerProcessor('deck', DeckProcessor);
