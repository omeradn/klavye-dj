/** Waveform peaks per second. */
export const PPS = 150;

/** Normalised (0..1) absolute peaks, PPS values per second of audio. */
export function computePeaks(ch: Float32Array, sr: number): Float32Array {
  const hop = Math.floor(sr / PPS), n = Math.floor(ch.length / hop), p = new Float32Array(n);
  let mx = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * hop, e = j + hop; j < e; j += 4) { const v = Math.abs(ch[j]); if (v > m) m = v; }
    p[i] = m;
    if (m > mx) mx = m;
  }
  if (mx) for (let i = 0; i < n; i++) p[i] /= mx;
  return p;
}
