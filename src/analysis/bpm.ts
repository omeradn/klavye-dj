/**
 * Tempo estimate from onset-envelope autocorrelation.
 * Looks at up to 40 s starting at min(25 % of the track, 30 s).
 * Returns BPM folded into 85–175, rounded to 0.1, or null if the audio is too short.
 */
export function detectBPM(ch: Float32Array, sr: number): number | null {
  const hop = 256;
  const start = Math.floor(Math.min(ch.length * 0.25, sr * 30));
  const len = Math.min(ch.length - start, sr * 40);
  const n = Math.floor(len / hop);
  if (n < 400) return null;

  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = start + i * hop, e = j + hop; j < e; j += 2) s += ch[j] * ch[j];
    env[i] = Math.sqrt(s);
  }
  const on = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) { on[i] = Math.max(0, env[i] - env[i - 1]); mean += on[i]; }
  mean /= n;
  for (let i = 0; i < n; i++) on[i] -= mean;

  const fps = sr / hop, lo = Math.floor(fps * 60 / 185), hi = Math.ceil(fps * 60 / 68);
  const sc: number[] = [];
  for (let lag = lo; lag <= hi; lag++) {
    let s = 0;
    for (let i = 0; i + lag < n; i++) s += on[i] * on[i + lag];
    sc[lag] = s;
  }
  let best = lo;
  for (let l = lo; l <= hi; l++) if (sc[l] > sc[best]) best = l;

  // parabolic interpolation around the peak for sub-frame accuracy
  let lag = best;
  if (best > lo && best < hi) {
    const a = sc[best - 1], b = sc[best], c = sc[best + 1];
    const d = a - 2 * b + c;
    if (d) lag = best + 0.5 * (a - c) / d;
  }
  let bpm = 60 * fps / lag;
  while (bpm < 85) bpm *= 2;
  while (bpm > 175) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}
