/// <reference path="./worklet-env.d.ts" />
import type { LimiterIn, LimiterStats } from './protocol';

/**
 * Look-ahead brick-wall limiter on the master bus.
 * Gain = sliding minimum (over the look-ahead window) of the gain each sample needs,
 * smoothed (fast attack inside the window, slow release), then a hard clamp at the
 * ceiling as a final guarantee: the output can never exceed the ceiling.
 */
const LOOK_S = 0.003;
const RELEASE_S = 0.15;

class LimiterProcessor extends AudioWorkletProcessor {
  private ceiling = Math.pow(10, -1 / 20); // -1 dBFS
  private readonly look = Math.max(1, Math.round(LOOK_S * sampleRate));
  private readonly dL = new Float32Array(this.look);
  private readonly dR = new Float32Array(this.look);
  private w = 0;
  // monotonic deque (ring buffer) for the sliding window minimum
  private readonly cap = this.look + 2;
  private readonly qv = new Float32Array(this.cap);
  private readonly qi = new Float64Array(this.cap);
  private qh = 0;
  private qn = 0;
  private idx = 0;
  private g = 1;
  private readonly aAtt = 1 - Math.exp(-1 / (this.look * 0.3));
  private readonly aRel = 1 - Math.exp(-1 / (RELEASE_S * sampleRate));
  private stGr = 1;
  private stIn = 0;
  private stOut = 0;
  private stN = 0;

  constructor() {
    super();
    this.port.onmessage = e => {
      const m = e.data as LimiterIn;
      if (m.t === 'ceiling') this.ceiling = Math.pow(10, Math.min(0, m.db) / 20);
    };
  }

  private windowMin(v: number): number {
    const cap = this.cap, i = this.idx++;
    while (this.qn > 0 && this.qv[(this.qh + this.qn - 1) % cap] >= v) this.qn--;
    const back = (this.qh + this.qn) % cap;
    this.qv[back] = v; this.qi[back] = i; this.qn++;
    while (this.qi[this.qh] <= i - (this.look + 1)) { this.qh = (this.qh + 1) % cap; this.qn--; }
    return this.qv[this.qh];
  }

  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const inp = inputs[0], out = outputs[0], oL = out[0], oR = out[1] ?? out[0], n = oL.length;
    const iL = inp && inp[0], iR = inp && (inp[1] ?? inp[0]);
    const c = this.ceiling;
    for (let i = 0; i < n; i++) {
      const xL = iL ? iL[i] : 0, xR = iR ? iR[i] : 0;
      const peak = Math.max(Math.abs(xL), Math.abs(xR));
      if (peak > this.stIn) this.stIn = peak;
      const m = this.windowMin(peak > c ? c / peak : 1);
      this.g += (m - this.g) * (m < this.g ? this.aAtt : this.aRel);
      const w = this.w;
      let yL = this.dL[w] * this.g, yR = this.dR[w] * this.g;
      this.dL[w] = xL; this.dR[w] = xR;
      this.w = (w + 1) % this.look;
      if (yL > c) yL = c; else if (yL < -c) yL = -c;
      if (yR > c) yR = c; else if (yR < -c) yR = -c;
      oL[i] = yL; oR[i] = yR;
      const po = Math.max(Math.abs(yL), Math.abs(yR));
      if (po > this.stOut) this.stOut = po;
      if (this.g < this.stGr) this.stGr = this.g;
    }
    this.stN += n;
    if (this.stN >= 2048) {
      const s: LimiterStats = { t: 'stats', gr: this.stGr, peakIn: this.stIn, peakOut: this.stOut };
      this.port.postMessage(s);
      this.stN = 0; this.stGr = 1; this.stIn = 0; this.stOut = 0;
    }
    return true;
  }
}

registerProcessor('limiter', LimiterProcessor);
