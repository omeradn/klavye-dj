/**
 * Beatgrid: tempo, beat phase, bar start (downbeat) and phrase start, plus meters
 * (including Turkish aksak meters, where the beats of a bar are not equal).
 *
 * Time model: a grid is a stream of equal "pulses" (60 / bpm seconds each).
 *   4/4:  1 pulse per beat, 4 beats per bar
 *   x/8:  1 pulse = one eighth note; the bar groups eighths into beats, e.g. 9/8 = 2+2+2+3
 * `offset` is the time (s) of a bar start; any bar start works (the grid extends both ways).
 */

export type MeterId = '4/4' | '6/8' | '7/8' | '9/8' | '10/8';

export const METERS: Record<MeterId, { groups: number[]; label: string }> = {
  '4/4': { groups: [1, 1, 1, 1], label: '4/4' },
  '6/8': { groups: [3, 3], label: '6/8' },
  '7/8': { groups: [2, 2, 3], label: '7/8 aksak' },
  '9/8': { groups: [2, 2, 2, 3], label: '9/8 aksak' },
  '10/8': { groups: [3, 2, 2, 3], label: '10/8 aksak' },
};
export const METER_ORDER: MeterId[] = ['4/4', '6/8', '7/8', '9/8', '10/8'];

export interface Grid {
  /** pulses per minute (4/4: beats per minute · x/8: eighth notes per minute) */
  bpm: number;
  /** time (s) of a bar start */
  offset: number;
  meter: MeterId;
  /** index of the bar (relative to `offset`) where a phrase starts */
  phraseBar: number;
}

export const pulseLen = (g: Grid): number => 60 / g.bpm;
export const barPulses = (g: Grid): number => METERS[g.meter].groups.reduce((a, b) => a + b, 0);
const mod = (a: number, n: number) => ((a % n) + n) % n;

/** Position in pulses since `offset` (fractional). */
export const pulseAt = (g: Grid, t: number): number => (t - g.offset) / pulseLen(g);

/** Phase within the current pulse, 0..1. */
export const phaseAt = (g: Grid, t: number): number => mod(pulseAt(g, t), 1);

/** Nearest grid line (pulse) to t. */
export const snap = (g: Grid, t: number): number => g.offset + Math.round(pulseAt(g, t)) * pulseLen(g);

/** Wrap a phase difference into −0.5…+0.5. */
export const wrapHalf = (x: number): number => x - Math.round(x);

export interface BarPos {
  /** bar index since offset (can be negative) */
  bar: number;
  /** beat (group) index inside the bar, 0-based */
  beat: number;
  beatsInBar: number;
  /** 1-based phrase number and 1-based bar inside the phrase */
  phrase: number;
  barInPhrase: number;
}

export function barPos(g: Grid, t: number, phraseBars: number): BarPos {
  const groups = METERS[g.meter].groups, bp = barPulses(g);
  const p = Math.floor(pulseAt(g, t) + 1e-6);
  const bar = Math.floor(p / bp), inBar = p - bar * bp;
  let beat = 0, acc = 0;
  for (let i = 0; i < groups.length; i++) { if (inBar >= acc) beat = i; acc += groups[i]; }
  const rb = bar - g.phraseBar;
  return { bar, beat, beatsInBar: groups.length, phrase: Math.floor(rb / phraseBars) + 1, barInPhrase: mod(rb, phraseBars) + 1 };
}

/** Kind of grid line at pulse index k: 3 = phrase start, 2 = bar start, 1 = beat (group) start, 0 = plain pulse. */
export function lineKind(g: Grid, k: number, phraseBars: number): 0 | 1 | 2 | 3 {
  const bp = barPulses(g), inBar = mod(k, bp);
  if (inBar === 0) return mod(Math.floor(k / bp) - g.phraseBar, phraseBars) === 0 ? 3 : 2;
  let acc = 0;
  for (const n of METERS[g.meter].groups) { if (acc === inBar) return 1; acc += n; }
  return 0;
}

/** Change BPM while keeping the grid line under time `t` in place. */
export function setBpmAt(g: Grid, bpm: number, t: number): Grid {
  const k = pulseAt(g, t);
  return { ...g, bpm, offset: t - k * 60 / bpm };
}

/** Make the grid line nearest to t the first beat of bar 1 of a phrase. */
export function downbeatAt(g: Grid, t: number): Grid {
  return { ...g, offset: snap(g, t), phraseBar: 0 };
}

/* ---------------- analysis ---------------- */

const HOP = 128;

interface Onsets { t: Float64Array; w: Float32Array }

/** Onset events (local maxima of the energy rise), with sub-frame timing. */
function onsets(ch: Float32Array, sr: number): Onsets {
  const n = Math.floor(ch.length / HOP);
  const env = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let j = i * HOP, e = j + HOP; j < e; j++) s += ch[j] * ch[j];
    env[i] = Math.sqrt(s / HOP);
  }
  const on = new Float32Array(n);
  let mean = 0;
  for (let i = 1; i < n; i++) { on[i] = Math.max(0, env[i] - env[i - 1]); mean += on[i]; }
  mean /= n || 1;
  const ts: number[] = [], ws: number[] = [];
  for (let i = 1; i < n - 1; i++) {
    const a = on[i - 1], b = on[i], c = on[i + 1];
    if (b > mean * 1.5 && b >= a && b > c) {
      const d = a - 2 * b + c, frac = d ? 0.5 * (a - c) / d : 0;
      // energy frame i covers samples [i*HOP, (i+1)*HOP); the rise is centred on the frame boundary
      ts.push((i + frac) * HOP / sr);
      ws.push(b);
    }
  }
  return { t: Float64Array.from(ts), w: Float32Array.from(ws) };
}

/** Circular alignment of the onsets with a pulse train: magnitude (score) and phase (radians). */
function align(o: Onsets, period: number): { mag: number; ph: number } {
  let re = 0, im = 0;
  const k = 2 * Math.PI / period;
  for (let i = 0; i < o.t.length; i++) { const a = o.t[i] * k; re += o.w[i] * Math.cos(a); im += o.w[i] * Math.sin(a); }
  return { mag: Math.hypot(re, im), ph: Math.atan2(im, re) };
}

/** Refine a rough BPM to ~0.01 and find the beat phase. */
function fitTempo(o: Onsets, guess: number): { bpm: number; beat0: number } {
  let best = guess, bestMag = -1;
  const scan = (from: number, to: number, step: number) => {
    for (let b = from; b <= to + 1e-9; b += step) {
      const m = align(o, 60 / b).mag;
      if (m > bestMag) { bestMag = m; best = b; }
    }
  };
  scan(guess - 1.5, guess + 1.5, 0.02);
  // fine: the right tempo stacks every kick of the track onto one sharp peak
  let fine = best, fh = -1;
  for (let b = best - 0.04; b <= best + 0.04 + 1e-9; b += 0.001) {
    const f = foldPeak(o, 60 / b);
    if (f.height > fh) { fh = f.height; fine = b; }
  }
  return { bpm: Math.round(fine * 1000) / 1000, beat0: foldPeak(o, 60 / fine).pos };
}

/**
 * Beat phase = where onsets pile up most when folded onto one beat (the mode, not the mean:
 * a sidechain "pump" or off-beat hats would pull an average away from the kick).
 */
function foldPeak(o: Onsets, p: number): { pos: number; height: number } {
  const nb = Math.max(16, Math.round(p / 0.002)), h = new Float64Array(nb);
  for (let i = 0; i < o.t.length; i++) {
    const x = (o.t[i] / p % 1) * nb, k = Math.floor(x), f = x - k;
    h[k % nb] += o.w[i] * (1 - f); h[(k + 1) % nb] += o.w[i] * f;
  }
  // smooth ±4 ms so a slightly wobbly kick still forms one peak
  const sm = new Float64Array(nb), r = 2;
  for (let k = 0; k < nb; k++) for (let j = -r; j <= r; j++) sm[k] += h[(k + j + nb) % nb] * (r + 1 - Math.abs(j));
  let best = 0;
  for (let k = 1; k < nb; k++) if (sm[k] > sm[best]) best = k;
  const a = sm[(best - 1 + nb) % nb], b = sm[best], c = sm[(best + 1) % nb], d = a - 2 * b + c;
  const frac = d ? 0.5 * (a - c) / d : 0;
  return { pos: (((best + frac) / nb) * p % p + p) % p, height: b };
}

/**
 * Per-beat change in 3 frequency bands (log energy). Bars, phrases and chord changes
 * start where the sound changes most.
 */
function beatNovelty(ch: Float32Array, sr: number, beat0: number, p: number): Float32Array {
  const nb = Math.floor((ch.length / sr - beat0) / p);
  if (nb < 2) return new Float32Array(0);
  const aL = 1 - Math.exp(-2 * Math.PI * 200 / sr), aH = 1 - Math.exp(-2 * Math.PI * 2500 / sr);
  const E = new Float32Array(nb * 3);
  let lp = 0, lp2 = 0;
  let b = -1, nextT = beat0 * sr;
  // skip audio before the first beat (only warm up the filters)
  for (let i = 0; i < ch.length; i++) {
    const x = ch[i];
    lp += aL * (x - lp); lp2 += aH * (x - lp2);
    if (i >= nextT) { b++; nextT = (beat0 + (b + 1) * p) * sr; if (b >= nb) break; }
    if (b < 0) continue;
    const lo = lp, hi = x - lp2, mid = lp2 - lp;
    E[b * 3] += lo * lo; E[b * 3 + 1] += mid * mid; E[b * 3 + 2] += hi * hi;
  }
  const nov = new Float32Array(nb);
  for (let k = 1; k < nb; k++) {
    let s = 0;
    for (let j = 0; j < 3; j++) s += Math.abs(Math.log10(E[k * 3 + j] + 1e-9) - Math.log10(E[(k - 1) * 3 + j] + 1e-9));
    nov[k] = s;
  }
  return nov;
}

/** Pick the residue r (0..n-1, step `step`) whose indices k ≡ r (mod n) carry the most novelty. */
function bestResidue(nov: Float32Array, n: number, step = 1, start = 0): number {
  let best = start, bs = -1;
  for (let r = start; r < n; r += step) {
    let s = 0;
    for (let k = r; k < nov.length; k += n) s += nov[k];
    if (s > bs) { bs = s; best = r; }
  }
  return best;
}

/**
 * Full beatgrid analysis (4/4): precise tempo, beat phase, downbeat and 8-bar phrase start.
 * `guess` comes from detectBPM. Returns null if there are not enough beats.
 */
export function analyzeGrid(ch: Float32Array, sr: number, guess: number): Grid | null {
  const o = onsets(ch, sr);
  if (o.t.length < 16) return null;
  const { bpm, beat0 } = fitTempo(o, guess);
  const p = 60 / bpm;
  const nov = beatNovelty(ch, sr, beat0, p);
  if (nov.length < 8) return { bpm, offset: beat0, meter: '4/4', phraseBar: 0 };
  const down = bestResidue(nov, 4);                       // which beat of 4 starts the bar
  const phraseBeat = bestResidue(nov, 32, 4, down) - down;  // which bar of 8 starts the phrase
  const offset = beat0 + down * p;
  return { bpm, offset, meter: '4/4', phraseBar: phraseBeat / 4 };
}
