/// <reference path="./worklet-env.d.ts" />
import type { DeckIn, DeckState } from './protocol';

/**
 * Deck playback engine on the audio thread.
 * - variable-speed playback (forward / reverse / scratch) with cubic interpolation
 * - sample-accurate loops; every jump (loop wrap, seek, beat jump, slip return) is crossfaded -> no clicks
 * - slip mode: a shadow playhead keeps running; when the slip action ends we return to it
 * - censor = reverse + slip while held; vinyl brake / spinback
 */

const XF = 256;            // crossfade length for jumps (~5 ms)
const GAIN_A = 0.01;       // declick envelope coefficient (~2 ms)
const SCRATCH_A = 0.004;   // platter inertia while scratching (~5 ms)

function hermite(b: Float32Array, p: number): number {
  const i = Math.floor(p), n = b.length;
  if (i < 1 || i + 2 >= n) return i >= 0 && i < n ? b[i] : 0;
  const f = p - i, y0 = b[i - 1], y1 = b[i], y2 = b[i + 1], y3 = b[i + 2];
  const c1 = 0.5 * (y2 - y0);
  const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
  const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
  return ((c3 * f + c2) * f + c1) * f + y1;
}

class DeckProcessor extends AudioWorkletProcessor {
  private L: Float32Array = new Float32Array(0);
  private R: Float32Array = new Float32Array(0);
  private len = 0;
  private pos = 0;
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
  private gain = 0;
  private xfLeft = 0;
  private xfPos = 0;
  private wasSlipping = false;
  private blocks = 0;

  constructor() {
    super();
    this.port.onmessage = e => this.onMsg(e.data as DeckIn);
  }

  /** Move the read head; crossfade from the old position if we are audible. */
  private jump(to: number): void {
    to = Math.max(0, Math.min(this.len - 1, to));
    if (this.gain > 0.001) { this.xfPos = this.pos; this.xfLeft = XF; }
    this.pos = to;
  }

  private onMsg(m: DeckIn): void {
    switch (m.t) {
      case 'load':
        this.L = m.L; this.R = m.R; this.len = m.L.length;
        this.pos = this.shadow = 0; this.playing = false; this.loopOn = false;
        this.reverse = this.censor = this.scratching = false; this.vfx = 0;
        this.xfLeft = 0; this.gain = 0; this.rate = 0;
        break;
      case 'play': this.playing = m.on; if (m.on) this.vfx = 0; break;
      case 'seek': this.jump(m.pos); this.shadow = this.pos; break;
      case 'jump':
        this.jump(this.pos + m.d); this.shadow += m.d;
        if (this.loopOn) { this.loopS += m.d; this.loopE += m.d; }
        break;
      case 'tempo': this.tempo = m.v; break;
      case 'loop': this.loopOn = m.on; if (m.on) { this.loopS = m.s; this.loopE = m.e; } break;
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
    }
  }

  process(_in: Float32Array[][], outputs: Float32Array[][]): boolean {
    const out = outputs[0], oL = out[0], oR = out[1] ?? out[0], n = oL.length;
    if (!this.len) { oL.fill(0); oR.fill(0); return true; }

    const slipping = this.censor || (this.slip && (this.loopOn || this.reverse || this.scratching));
    if (this.wasSlipping && !slipping) this.jump(this.shadow);
    this.wasSlipping = slipping;
    const back = this.reverse || this.censor;
    const L = this.L, R = this.R;

    for (let i = 0; i < n; i++) {
      const audible = this.playing || this.scratching || this.vfx !== 0;
      if (!audible && this.gain < 1e-4) { this.gain = 0; this.rate = 0; oL[i] = oR[i] = 0; continue; }

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

      // declick envelope
      this.gain += ((audible ? 1 : 0) - this.gain) * GAIN_A;

      // read (+ crossfade from the previous head after a jump)
      let l = hermite(L, this.pos), r = hermite(R, this.pos);
      if (this.xfLeft > 0) {
        const w = 0.5 - 0.5 * Math.cos(Math.PI * (1 - this.xfLeft / XF));
        l = l * w + hermite(L, this.xfPos) * (1 - w);
        r = r * w + hermite(R, this.xfPos) * (1 - w);
        this.xfPos += this.rate;
        this.xfLeft--;
      }
      oL[i] = l * this.gain;
      oR[i] = r * this.gain;

      // advance
      const prev = this.pos;
      this.pos += this.rate;
      if (slipping) { if (this.playing) this.shadow += this.tempo; }
      else this.shadow = this.pos;

      if (this.loopOn) {
        if (this.rate > 0 && prev < this.loopE && this.pos >= this.loopE) this.jump(this.loopS + (this.pos - this.loopE));
        else if (this.rate < 0 && prev >= this.loopS && this.pos < this.loopS) this.jump(this.loopE - (this.loopS - this.pos));
      }
      if (this.pos >= this.len - 1) { this.pos = this.len - 1; if (this.rate > 0) this.playing = false; }
      else if (this.pos < 0) this.pos = 0;
    }

    if (++this.blocks % 3 === 0) {
      const s: DeckState = {
        t: 'state', pos: this.pos, rate: this.gain > 0 ? this.rate : 0,
        playing: this.playing, audible: this.playing || this.scratching || this.vfx !== 0, at: currentTime,
      };
      this.port.postMessage(s);
    }
    return true;
  }
}

registerProcessor('deck', DeckProcessor);
