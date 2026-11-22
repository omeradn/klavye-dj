import { PPS } from './peaks';

/**
 * 3-band waveform data: for every 1/PPS s, the peak of the low (< 200 Hz), mid and high (> 2.5 kHz) part.
 * Values are scaled so that the loudest moment of the whole song is 1.
 */
export function computeBands(ch: Float32Array, sr: number): Float32Array {
  const hop = Math.floor(sr / PPS), n = Math.floor(ch.length / hop), out = new Float32Array(n * 3);
  const aL = 1 - Math.exp(-2 * Math.PI * 200 / sr), aH = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
  let lp = 0, lp2 = 0, mx = 0;
  for (let i = 0; i < n; i++) {
    let l = 0, m = 0, h = 0, f = 0;
    for (let j = i * hop, e = j + hop; j < e; j++) {
      const x = ch[j];
      lp += aL * (x - lp); lp2 += aH * (x - lp2);
      const a = Math.abs(lp), b = Math.abs(lp2 - lp), c = Math.abs(x - lp2), d = Math.abs(x);
      if (a > l) l = a; if (b > m) m = b; if (c > h) h = c; if (d > f) f = d;
    }
    out[i * 3] = l; out[i * 3 + 1] = m; out[i * 3 + 2] = h;
    if (f > mx) mx = f;
  }
  if (mx) for (let i = 0; i < out.length; i++) out[i] /= mx;
  return out;
}

/**
 * Energy 1–10: how "full on" a song feels — loudness, how busy the rhythm is, brightness and tempo.
 * A rough guide for building a set (calm dinner music ≈ 2–4, peak-time dance ≈ 7–9).
 */
export function energyRating(ch: Float32Array, sr: number, bpm?: number | null): number {
  const hop = 512, n = Math.floor(ch.length / hop);
  if (n < 50) return 1;
  const aH = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
  let lp = 0, sum = 0, hiSum = 0, prev = 0, onsets = 0, envMean = 0;
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0, hs = 0;
    for (let j = i * hop, e = j + hop; j < e; j++) {
      const x = ch[j];
      lp += aH * (x - lp);
      s += x * x; hs += (x - lp) * (x - lp);
    }
    sum += s; hiSum += hs;
    env[i] = Math.sqrt(s / hop); envMean += env[i];
  }
  envMean /= n;
  // onsets: energy jumps clearly above the average level
  for (let i = 1; i < n; i++) {
    const d = env[i] - prev;
    if (d > envMean * 0.35 && env[i] > envMean * 0.6) onsets++;
    prev = env[i];
  }
  const rmsDb = 10 * Math.log10(sum / (n * hop) + 1e-12);
  const loud = Math.min(1, Math.max(0, (rmsDb + 26) / 16));          // −26 dB → 0, −10 dB → 1
  const dens = Math.min(1, onsets / (n * hop / sr) / 6);              // 6 hits per second → busy
  const bright = Math.min(1, Math.sqrt(hiSum / (sum || 1)) * 3);
  // tempo folded into 80–160 (half/double time counts the same); unknown tempo = neutral
  let b = bpm ?? 120;
  while (b > 160) b /= 2;
  while (b < 80 && b > 0) b *= 2;
  const fast = Math.min(1, Math.max(0, (b - 85) / 50));               // 85 → 0, 135 → 1
  return Math.max(1, Math.min(10, Math.round(1 + 9 * (0.35 * loud + 0.25 * dens + 0.15 * bright + 0.25 * fast))));
}
