/// <reference path="./worklet-env.d.ts" />
import type { BeatFxIn } from './protocol';

/**
 * Beat-synced effects that need sample-level work: ROLL, GATE, BRAKE (tape stop) and PITCH.
 * Input is always written into a 8 s ring buffer, so ROLL can start on the beat line that just passed.
 * Output = dry·(1−m) + effect·m, with m gliding in 5 ms (no clicks when switching on/off).
 * Timing: `anchor` is the AudioContext time of a beat line, `beat` the beat length in seconds.
 */

const RING = 8;          // seconds of history
const FADE = 0.005;      // on/off glide
const XF = 96;           // crossfade at roll wraps (samples)
const GRAIN = 0.04;      // pitch shifter window (s)

class BeatFxProcessor extends AudioWorkletProcessor {
  private mode: BeatFxIn['mode'] = 'gate';
  private on = false;
  private beat = 0.5;
  private anchor = 0;
  private len = 1;        // in beats
  private amount = 1;
  private m = 0;          // effect mix (glides)
  private readonly n = Math.ceil(RING * sampleRate);
  private readonly bL = new Float32Array(this.n);
  private readonly bR = new Float32Array(this.n);
  private w = 0;          // write index (total samples written)
  // roll
  private rollStart = -1; // absolute sample index where the repeated segment starts
  private rollLen = 0;
  private rollT0 = 0;     // absolute output sample index matching rollStart
  // brake
  private bPos = -1;
  private bRate = 1;
  // pitch
  private pPhase = 0;
  private env = 1;        // gate envelope

  constructor() {
    super();
    this.port.onmessage = e => this.msg(e.data as BeatFxIn);
  }

  private msg(m: BeatFxIn): void {
    const wasOn = this.on, oldMode = this.mode;
    this.mode = m.mode; this.beat = m.beat; this.anchor = m.anchor; this.len = m.len; this.amount = m.amount;
    this.on = m.on;
    if (this.on && (!wasOn || oldMode !== m.mode)) { this.rollStart = -1; this.bPos = -1; this.pPhase = 0; }
    if (this.on && this.mode === 'roll' && this.rollStart >= 0 && Math.round(this.len * this.beat * sampleRate) !== this.rollLen) this.rollStart = -1;
  }

  private read(buf: Float32Array, abs: number): number {
    const i = Math.floor(abs), f = abs - i, n = this.n;
    const a = buf[((i % n) + n) % n], b = buf[(((i + 1) % n) + n) % n];
    return a + (b - a) * f;
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0], out = outputs[0], oL = out[0], oR = out[1] ?? out[0], N = oL.length;
    const iL = inp?.[0], iR = inp?.[1] ?? iL;
    const sr = sampleRate, n = this.n, dm = 1 / (FADE * sr);
    const t0 = currentTime;
    for (let i = 0; i < N; i++) {
      const xL = iL ? iL[i] : 0, xR = iR ? iR[i] : 0;
      const wi = this.w % n;
      this.bL[wi] = xL; this.bR[wi] = xR;
      const abs = this.w;
      this.w++;
      const target = this.on ? 1 : 0;
      this.m += target > this.m ? Math.min(dm, target - this.m) : -Math.min(dm, this.m - target);
      if (this.m <= 0) { oL[i] = xL; oR[i] = xR; this.rollStart = -1; this.bPos = -1; this.env = 1; continue; }

      const T = t0 + i / sr;
      let yL = xL, yR = xR;
      switch (this.mode) {
        case 'gate': {
          // open for the first half of every step, closed for the second half
          const step = this.beat * this.len, ph = (((T - this.anchor) / step) % 1 + 1) % 1;
          const want = ph < 0.5 ? 1 : 1 - this.amount;
          this.env += (want - this.env) * Math.min(1, 1 / (0.0015 * sr));
          yL = xL * this.env; yR = xR * this.env;
          break;
        }
        case 'roll': {
          if (this.rollStart < 0) {
            // repeat the segment that started on the last grid line (it is already in the ring buffer)
            const seg = this.beat * this.len;
            const back = (((T - this.anchor) % seg) + seg) % seg;
            this.rollLen = Math.max(64, Math.round(seg * sr));
            const backS = Math.min(Math.round(back * sr), this.n - this.rollLen - 1, abs);
            this.rollStart = abs - backS;
            this.rollT0 = abs - backS;
          }
          const k = (abs - this.rollT0) % this.rollLen, p = this.rollStart + k;
          yL = this.read(this.bL, p); yR = this.read(this.bR, p);
          // crossfade the end of each repeat into its start
          // (the audio just before the segment start leads smoothly into the wrap)
          if (k > this.rollLen - XF) {
            const f = (k - (this.rollLen - XF)) / XF, q = this.rollStart - (this.rollLen - k);
            yL = yL * (1 - f) + this.read(this.bL, q) * f;
            yR = yR * (1 - f) + this.read(this.bR, q) * f;
          }
          break;
        }
        case 'brake': {
          if (this.bPos < 0) { this.bPos = abs; this.bRate = 1; }
          const total = Math.max(1, this.len * this.beat * sr);
          yL = this.read(this.bL, this.bPos) * Math.min(1, this.bRate * 4);
          yR = this.read(this.bR, this.bPos) * Math.min(1, this.bRate * 4);
          this.bPos += this.bRate;
          this.bRate = Math.max(0, this.bRate - 1 / total);
          break;
        }
        case 'pitch': {
          // two read taps sliding through a short window, crossfaded with a triangle: classic delay-line shifter
          const ratio = Math.pow(2, this.amount / 12), win = GRAIN * sr;
          this.pPhase = (((this.pPhase + (1 - ratio) / win) % 1) + 1) % 1;
          let sL = 0, sR = 0;
          for (const o of [0, 0.5]) {
            const ph = (this.pPhase + o) % 1, d = ph * win + 2, g = 1 - Math.abs(2 * ph - 1);
            sL += this.read(this.bL, abs - d) * g; sR += this.read(this.bR, abs - d) * g;
          }
          yL = sL; yR = sR;
          break;
        }
      }
      oL[i] = xL + (yL - xL) * this.m;
      oR[i] = xR + (yR - xR) * this.m;
    }
    return true;
  }
}

registerProcessor('beatfx', BeatFxProcessor);

export {};
