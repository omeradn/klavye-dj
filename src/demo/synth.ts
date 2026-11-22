/**
 * Procedural demo tracks (no samples, no copyrighted material).
 * House/techno style, 4/4, phrase structure in multiples of 8 bars:
 * intro 16 · build 16 · drop 32 · break 8 · drop 16 · outro 16.
 */

export interface DemoSpec {
  name: string;
  bpm: number;
  /** MIDI note of the key root (57 = A3) */
  root: number;
  minor: boolean;
  seed: number;
}

export interface Section { name: 'intro' | 'build' | 'drop' | 'break' | 'outro'; bars: number }

export const DEMO_SECTIONS: Section[] = [
  { name: 'intro', bars: 16 }, { name: 'build', bars: 16 }, { name: 'drop', bars: 32 },
  { name: 'break', bars: 8 }, { name: 'drop', bars: 16 }, { name: 'outro', bars: 16 },
];

export const DEMOS: DemoSpec[] = [
  { name: 'Demo 1 · Gün Batımı · 122 BPM · Am', bpm: 122, root: 57, minor: true, seed: 11 },
  { name: 'Demo 2 · Gece Yolu · 126 BPM · Cm', bpm: 126, root: 60, minor: true, seed: 22 },
  { name: 'Demo 3 · Sakin Öğle · 112 BPM · D', bpm: 112, root: 62, minor: false, seed: 33 },
  { name: 'Demo 4 · Hızlı Çıkış · 128 BPM · Gm', bpm: 128, root: 55, minor: true, seed: 44 },
];

const TAU = Math.PI * 2;
const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

export function renderDemo(spec: DemoSpec, sr: number, sections: Section[] = DEMO_SECTIONS): { L: Float32Array; R: Float32Array } {
  const beat = 60 / spec.bpm, bar = 4 * beat;
  const totalBars = sections.reduce((s, x) => s + x.bars, 0);
  const N = Math.ceil((totalBars * bar + 2) * sr);
  const L = new Float32Array(N), R = new Float32Array(N);       // drums
  const mL = new Float32Array(N), mR = new Float32Array(N);     // music (gets sidechained)
  const noise = rng(spec.seed);
  const prog = spec.minor
    ? [[0, 3, 7], [8, 12, 15], [10, 14, 17], [0, 3, 7]]
    : [[0, 4, 7], [7, 11, 14], [9, 12, 16], [5, 9, 12]];
  const kicks: number[] = [];

  const at = (sec: number) => Math.floor(sec * sr);

  const kick = (t0: number) => {
    const s0 = at(t0), len = at(0.35);
    let ph = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const t = i / sr, f = 45 + 120 * Math.exp(-t / 0.025);
      ph += TAU * f / sr;
      const v = Math.sin(ph) * Math.exp(-t / 0.11) * 0.95 + (i < sr * 0.002 ? noise() * 0.25 : 0);
      L[s0 + i] += v; R[s0 + i] += v;
    }
    kicks.push(t0);
  };

  const hat = (t0: number, amp: number, pan: number) => {
    const s0 = at(t0), len = at(0.06);
    let last = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const n = noise(), v = (n - last) * Math.exp(-i / sr / 0.015) * amp;
      last = n;
      L[s0 + i] += v * (1 - pan); R[s0 + i] += v * (1 + pan);
    }
  };

  const clap = (t0: number) => {
    const s0 = at(t0), len = at(0.25);
    let a = 0, b = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const n = noise();
      a += (n - a) * 0.5; b += (n - b) * 0.08;
      const t = i / sr, env = Math.exp(-t / 0.07) * (t < 0.02 ? 0.6 + 0.4 * Math.cos(t * TAU * 150) : 1);
      const v = (a - b) * env * 0.9;
      L[s0 + i] += v; R[s0 + i] += v;
    }
  };

  const bass = (t0: number, note: number) => {
    const s0 = at(t0), len = at(0.22), w = TAU * mtof(note) / sr;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const ph = w * i, t = i / sr;
      const v = (Math.sin(ph) + 0.4 * Math.sin(2 * ph) + 0.2 * Math.sin(3 * ph)) * Math.min(1, t / 0.005) * Math.exp(-t / 0.15) * 0.33;
      mL[s0 + i] += v; mR[s0 + i] += v;
    }
  };

  const pad = (t0: number, notes: number[], dur: number) => {
    const s0 = at(t0), len = at(dur + 0.4);
    for (const note of notes) {
      for (const [buf, det] of [[mL, 1.0012], [mR, 0.9988]] as const) {
        const w = TAU * mtof(note) * det / sr, c = Math.cos(w), s = Math.sin(w);
        let x = 1, y = 0;
        for (let i = 0; i < len && s0 + i < N; i++) {
          const t = i / sr, env = Math.min(1, t / 0.4) * (t > dur ? Math.max(0, 1 - (t - dur) / 0.4) : 1);
          buf[s0 + i] += y * env * 0.05;
          const nx = x * c - y * s; y = x * s + y * c; x = nx;
        }
      }
    }
  };

  const pluck = (t0: number, note: number, pan: number) => {
    const s0 = at(t0), len = at(0.15), w = TAU * mtof(note) / sr;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const t = i / sr, v = (Math.sin(w * i) + 0.3 * Math.sin(3 * w * i)) * Math.exp(-t / 0.05) * 0.07;
      mL[s0 + i] += v * (1 - pan); mR[s0 + i] += v * (1 + pan);
    }
  };

  const riser = (t0: number, dur: number) => {
    const s0 = at(t0), len = at(dur);
    let lp = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const p = i / len, n = noise();
      lp += (n - lp) * (0.02 + 0.6 * p * p);
      const v = lp * p * 0.3;
      L[s0 + i] += v; R[s0 + i] += v;
    }
  };

  const crash = (t0: number) => {
    const s0 = at(t0), len = at(2);
    let last = 0;
    for (let i = 0; i < len && s0 + i < N; i++) {
      const n = noise(), v = (n - last) * Math.exp(-i / sr / 0.7) * 0.12;
      last = n;
      L[s0 + i] += v; R[s0 + i] -= v * 0.5;
    }
  };

  let barNo = 0;
  for (const sec of sections) {
    for (let b = 0; b < sec.bars; b++, barNo++) {
      const t0 = barNo * bar, chord = prog[barNo % 4], nm = sec.name;
      const isDrop = nm === 'drop';
      const kickOn = nm !== 'break';
      const hatOn = nm !== 'break' && !(nm === 'intro' && b < 8);
      const clapOn = nm === 'build' || isDrop;
      const bassOn = (nm === 'build' && b >= 8) || isDrop || (nm === 'outro' && b < 8);
      const padOn = nm === 'build' || isDrop || nm === 'break';
      if (padOn) pad(t0, chord.map(c => spec.root + c), bar);
      if (isDrop && b === 0) crash(t0);
      if ((nm === 'build' || nm === 'break') && b === sec.bars - 4) riser(t0, 4 * bar);
      for (let k = 0; k < 4; k++) {
        const tb = t0 + k * beat;
        if (kickOn) kick(tb);
        if (hatOn) hat(tb + beat / 2, 0.2, 0.15);
        if (isDrop) { hat(tb + beat / 4, 0.07, -0.3); hat(tb + 3 * beat / 4, 0.07, 0.3); }
        if (clapOn && (k === 1 || k === 3)) clap(tb);
        if (bassOn) bass(tb + beat / 2, spec.root - 24 + chord[0]);
        if (isDrop) for (let s = 0; s < 4; s++) {
          const step = k * 4 + s;
          pluck(tb + s * beat / 4, spec.root + 12 + chord[step % 3] + (step % 8 >= 4 ? 12 : 0), step % 2 ? 0.4 : -0.4);
        }
      }
    }
  }

  // sidechain the music to the kick, then mix
  let ki = 0, last = -10;
  for (let i = 0; i < N; i++) {
    const t = i / sr;
    while (ki < kicks.length && kicks[ki] <= t) last = kicks[ki++];
    const duck = 1 - 0.55 * Math.exp(-(t - last) / 0.09);
    L[i] += mL[i] * duck; R[i] += mR[i] * duck;
  }

  let peak = 0;
  for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak ? 0.89 / peak : 1;
  for (let i = 0; i < N; i++) { L[i] *= g; R[i] *= g; }
  return { L, R };
}
