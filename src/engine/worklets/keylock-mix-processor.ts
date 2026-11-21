/// <reference path="./worklet-env.d.ts" />

/**
 * Key lock mixer: input 0 = deck main output (L, R, wet-weight), input 1 = pitch-shifter output (L, R).
 * Both are sample-aligned (the deck feeds the shifter from a look-ahead head), so a plain linear
 * crossfade driven by the per-sample weight is seamless.
 */
class KeylockMixProcessor extends AudioWorkletProcessor {
  process(inputs: Float32Array[][], outputs: Float32Array[][]): boolean {
    const a = inputs[0], b = inputs[1], o = outputs[0], oL = o[0], oR = o[1] ?? o[0], n = oL.length;
    if (!a || a.length < 2) { oL.fill(0); oR.fill(0); return true; }
    const dL = a[0], dR = a[1], w = a[2], wL = b?.[0], wR = b?.[1] ?? wL;
    for (let i = 0; i < n; i++) {
      const k = w ? w[i] : 0;
      if (k <= 0 || !wL) { oL[i] = dL[i]; oR[i] = dR[i]; continue; }
      oL[i] = dL[i] + (wL[i] - dL[i]) * k;
      oR[i] = dR[i] + (wR![i] - dR[i]) * k;
    }
    return true;
  }
}

registerProcessor('keylock-mix', KeylockMixProcessor);

export {};
