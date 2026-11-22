/**
 * Musical key detection (chroma + key profiles) and the "Ton Çarkı" (tone wheel):
 * keys placed on the circle of fifths, numbered 1–12 starting at C major = 1M / A minor = 1m.
 * Neighbours on the wheel (same number, or ±1 with the same mode) mix without clashing.
 */

export interface Key {
  /** pitch class of the tonic, 0 = C */
  tonic: number;
  minor: boolean;
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const mod12 = (n: number) => ((n % 12) + 12) % 12;

/** "Am", "F#", "Ebm" … */
export const keyName = (k: Key): string => NAMES[k.tonic] + (k.minor ? 'm' : '');

/** Wheel number 1–12 (relative major/minor share a number). */
export function wheelNo(k: Key): number {
  const major = k.minor ? mod12(k.tonic + 3) : k.tonic;
  return mod12(major * 7) + 1;
}

/** "1m", "8M" … */
export const wheelCode = (k: Key): string => wheelNo(k) + (k.minor ? 'm' : 'M');

/** Key after transposing by `semis` semitones (rounded). */
export const shiftKey = (k: Key, semis: number): Key => ({ tonic: mod12(k.tonic + Math.round(semis)), minor: k.minor });

/**
 * How well two keys mix: 2 = same / relative / wheel neighbour (safe),
 * 1 = two steps or diagonal (can work, sounds like an energy change), 0 = clash.
 */
export function compat(a: Key, b: Key): 0 | 1 | 2 {
  const na = wheelNo(a), nb = wheelNo(b), d = Math.min(mod12(na - nb), mod12(nb - na));
  if (d === 0) return 2;                       // same key or relative major/minor
  if (a.minor === b.minor && d === 1) return 2;
  if (d === 1 || (a.minor === b.minor && d === 2)) return 1;
  return 0;
}

/* ---------------- detection ---------------- */

// Krumhansl–Kessler key profiles
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function fft(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const xr = re[b] * cr - im[b] * ci, xi = re[b] * ci + im[b] * cr;
        re[b] = re[a] - xr; im[b] = im[a] - xi; re[a] += xr; im[a] += xi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
}

/** Average chroma (12 pitch-class weights) over up to `frames` windows spread over the track. */
export function chroma(ch: Float32Array, sr: number, frames = 160): Float64Array {
  const dec = Math.max(1, Math.floor(sr / 11025)), fs = sr / dec, N = 8192;
  const len = Math.floor(ch.length / dec);
  const out = new Float64Array(12);
  if (len < N) return out;
  const win = new Float64Array(N);
  for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N);
  // pitch class of every useful FFT bin (80 Hz – 2 kHz: bass line, chords, melody; above the kick)
  const lo = Math.ceil(80 * N / fs), hi = Math.min(N / 2 - 26, Math.floor(2000 * N / fs));
  const pc = new Int8Array(hi + 1);
  for (let k = lo; k <= hi; k++) pc[k] = mod12(Math.round(12 * Math.log2(k * fs / N / 261.6256)));
  const a = Math.floor(len * 0.05), b = len * 0.95 - N, cnt = Math.max(1, Math.min(frames, Math.floor((b - a) / N)));
  const re = new Float64Array(N), im = new Float64Array(N), c = new Float64Array(12), mag = new Float64Array(N / 2);
  for (let f = 0; f < cnt; f++) {
    const s = Math.floor(a + (b - a) * (cnt > 1 ? f / (cnt - 1) : 0.5));
    for (let i = 0; i < N; i++) {
      let v = 0;
      for (let j = 0, o = (s + i) * dec; j < dec; j++) v += ch[o + j];
      re[i] = v / dec * win[i]; im[i] = 0;
    }
    fft(re, im);
    for (let k = lo - 24; k <= hi + 24; k++) mag[k] = Math.sqrt(re[k] * re[k] + im[k] * im[k]);
    c.fill(0);
    // only tonal peaks count: local maxima clearly above their neighbourhood (drops hats, claps, noise)
    let run = 0;
    for (let k = lo - 24; k < lo + 24; k++) run += mag[k];
    for (let k = lo; k <= hi; k++) {
      const m = mag[k], avg = run / 48;
      run += mag[k + 24] - mag[k - 24];
      if (m > avg * 2 && m >= mag[k - 1] && m >= mag[k + 1] && m >= mag[k - 2] && m >= mag[k + 2]) c[pc[k]] += m - avg;
    }
    let m = 0;
    for (let i = 0; i < 12; i++) if (c[i] > m) m = c[i];
    if (m > 1e-6) for (let i = 0; i < 12; i++) out[i] += c[i] / m;   // every frame counts the same
  }
  return out;
}

function corr(x: ArrayLike<number>, y: number[], rot: number): number {
  let mx = 0, my = 0;
  for (let i = 0; i < 12; i++) { mx += x[i]; my += y[i]; }
  mx /= 12; my /= 12;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < 12; i++) {
    const a = x[mod12(i + rot)] - mx, b = y[i] - my;
    sxy += a * b; sxx += a * a; syy += b * b;
  }
  return sxy / Math.sqrt(sxx * syy || 1);
}

/** Most likely key, or null for silence / no tonal content. */
export function detectKey(ch: Float32Array, sr: number): Key | null {
  const c = chroma(ch, sr);
  if (c.every(v => v === 0)) return null;
  let best: Key | null = null, bs = -2;
  for (let t = 0; t < 12; t++) {
    const ma = corr(c, MAJ, t), mi = corr(c, MIN, t);
    if (ma > bs) { bs = ma; best = { tonic: t, minor: false }; }
    if (mi > bs) { bs = mi; best = { tonic: t, minor: true }; }
  }
  return bs > 0.2 ? best : null;
}
