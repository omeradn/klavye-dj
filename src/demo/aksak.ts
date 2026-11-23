/**
 * Procedural 9/8 "karşılama" style demo (aksak: 2+2+2+3 eighths), no samples, no copyrighted material.
 * Darbuka (düm / tek, synthesised), a drone, and a reed-like lead in A hicaz.
 * Structure (bars of 9 eighths): intro 8 · A 16 · B 16 · outro 8 — phrases of 8 bars.
 */
import { SOUNDS } from './sounds';

export const AKSAK = { name: 'Demo 5 · Karşılama · 9/8 aksak · A hicaz', eighthsPerMin: 270, root: 57 };

const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
/** A hicaz (approximated in equal temperament): A Bb C# D E F G A */
const HICAZ = [0, 1, 4, 5, 7, 8, 10, 12];
const SECTIONS = [{ n: 'intro', bars: 8 }, { n: 'A', bars: 16 }, { n: 'B', bars: 16 }, { n: 'outro', bars: 8 }];

/** Melody per bar: [scale degree, start eighth, length in eighths] — follows the 2+2+2+3 grouping. */
const PHRASE_A: number[][][] = [
  [[4, 0, 2], [5, 2, 2], [4, 4, 2], [2, 6, 3]],
  [[3, 0, 2], [2, 2, 2], [1, 4, 2], [2, 6, 3]],
  [[4, 0, 2], [5, 2, 2], [6, 4, 2], [7, 6, 3]],
  [[6, 0, 2], [5, 2, 2], [4, 4, 2], [4, 6, 3]],
];
const PHRASE_B: number[][][] = [
  [[7, 0, 3], [6, 3, 1], [5, 4, 2], [4, 6, 3]],
  [[5, 0, 2], [4, 2, 2], [3, 4, 2], [2, 6, 3]],
  [[2, 0, 2], [1, 2, 2], [2, 4, 2], [4, 6, 3]],
  [[3, 0, 2], [2, 2, 2], [1, 4, 2], [0, 6, 3]],
];

export function renderAksak(sr: number): { L: Float32Array; R: Float32Array } {
  const e = 60 / AKSAK.eighthsPerMin, bar = 9 * e;
  const bars = SECTIONS.reduce((s, x) => s + x.bars, 0);
  const N = Math.ceil((bars * bar + 2) * sr);
  const L = new Float32Array(N), R = new Float32Array(N);
  const dum = SOUNDS.find(s => s.name === 'Darbuka düm')!.render(sr);
  const tek = SOUNDS.find(s => s.name === 'Darbuka tek')!.render(sr);
  const hit = (t: number, x: Float32Array, g: number, pan: number) => {
    const s0 = Math.floor(t * sr);
    for (let i = 0; i < x.length && s0 + i < N; i++) { L[s0 + i] += x[i] * g * (1 - pan); R[s0 + i] += x[i] * g * (1 + pan); }
  };
  const note = (t: number, dur: number, midi: number, g: number) => {
    const s0 = Math.floor(t * sr), len = Math.floor((dur + 0.08) * sr), f = mtof(midi);
    let ph = 0, lp = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const tt = i / sr, vib = 1 + 0.006 * Math.sin(TAU * 5.5 * tt) * Math.min(1, tt / 0.15);
      ph = (ph + f * vib / sr) % 1;
      const raw = (ph * 2 - 1) * 0.6 + (ph < 0.5 ? 0.4 : -0.4);              // buzzy reed: saw + square
      lp += 0.12 * (raw - lp);
      const env = Math.min(1, tt / 0.03) * (tt > dur ? Math.max(0, 1 - (tt - dur) / 0.08) : 1);
      const v = lp * env * g;
      L[s0 + i] += v * 0.9; R[s0 + i] += v;
    }
  };
  const drone = (t: number, dur: number, g: number) => {
    const s0 = Math.floor(t * sr), len = Math.floor(dur * sr);
    for (let i = 0; i < len && s0 + i < N; i++) {
      const tt = i / sr, a = Math.min(1, tt / 0.3, (dur - tt) / 0.3);
      const v = (Math.sin(TAU * mtof(AKSAK.root - 24) * tt) + 0.5 * Math.sin(TAU * mtof(AKSAK.root - 17) * tt)) * a * g;
      L[s0 + i] += v; R[s0 + i] += v;
    }
  };

  let b = 0;
  for (const sec of SECTIONS) {
    for (let k = 0; k < sec.bars; k++, b++) {
      const t0 = b * bar;
      // karşılama darbuka: DÜM . tek . DÜM . tek . tek (eighths 0, 2, 4, 6, 7) + soft ornaments
      hit(t0, dum, 0.9, 0); hit(t0 + 2 * e, tek, 0.55, 0.2); hit(t0 + 4 * e, dum, 0.75, 0);
      hit(t0 + 6 * e, tek, 0.6, -0.2); hit(t0 + 7 * e, tek, 0.45, 0.2);
      if (sec.n !== 'intro') { hit(t0 + 1 * e, tek, 0.18, -0.4); hit(t0 + 8 * e, tek, 0.25, 0.4); }
      if (k === 0 || sec.n !== 'intro') drone(t0, bar, sec.n === 'outro' ? 0.12 : 0.18);
      if (sec.n === 'A' || sec.n === 'B') {
        const ph = (sec.n === 'A' ? PHRASE_A : PHRASE_B)[k % 4];
        for (const [deg, st, ln] of ph) note(t0 + st * e, ln * e * 0.92, AKSAK.root + 12 + HICAZ[deg], sec.n === 'B' ? 0.32 : 0.26);
      }
    }
  }
  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak ? 0.89 / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}
