/**
 * Built-in sampler sounds, synthesised in code (no recordings, no copyrighted samples).
 * Every sound is mono, peak-normalised to 0.8.
 */

export interface SoundSpec { name: string; render: (sr: number) => Float32Array }

const TAU = Math.PI * 2;

function noiseGen(seed: number): () => number {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
}

function normalize(x: Float32Array, peak = 0.8): Float32Array {
  let m = 0;
  for (const v of x) m = Math.max(m, Math.abs(v));
  if (m) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  // 3 ms fade in/out: never a click at the start or end
  const f = Math.min(x.length >> 1, 150);
  for (let i = 0; i < f; i++) { x[i] *= i / f; x[x.length - 1 - i] *= i / f; }
  return x;
}

/** Simple state-variable band-pass, returns a processing function. */
function bandpass(sr: number) {
  let lo = 0, bp = 0;
  return (x: number, f: number, q = 2) => {
    const k = 2 * Math.sin(Math.PI * Math.min(f, sr / 6) / sr);
    lo += k * bp; const hi = x - lo - bp / q; bp += k * hi;
    return bp;
  };
}

/** Stadium-style horn: three detuned buzzy tones, "daa-da-daaa". */
function horn(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 1.25)), bpf = bandpass(sr);
  const blasts = [[0, 0.16], [0.22, 0.32], [0.4, 1.2]];
  const ph = [0, 0, 0], fr = [466, 469, 699];
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    const on = blasts.find(([a, b]) => t >= a && t < b);
    let v = 0;
    for (let k = 0; k < 3; k++) { ph[k] = (ph[k] + fr[k] / sr) % 1; v += (ph[k] * 2 - 1) * (k === 2 ? 0.5 : 1); }
    const env = on ? Math.min(1, (t - on[0]) / 0.015) * Math.min(1, (on[1] - t) / 0.03) : 0;
    out[i] = bpf(v, 1400, 1.2) * env;
  }
  return normalize(out);
}

function siren(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 1.8));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, f = 900 + 350 * Math.sin(TAU * 2.6 * t);
    ph += f / sr;
    out[i] = (Math.sin(TAU * ph) + 0.25 * Math.sin(TAU * 2 * ph)) * Math.min(1, t / 0.05) * Math.min(1, (1.8 - t) / 0.2);
  }
  return normalize(out);
}

function laser(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 0.45));
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, f = 3000 * Math.exp(-t * 9) + 150;
    ph += f / sr;
    out[i] = (ph % 1 < 0.5 ? 1 : -1) * 0.6 * Math.exp(-t * 5);
  }
  return normalize(out);
}

/** Noise sweep rising over 2 s (build-up before a drop). */
function riser(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 2.2)), n = noiseGen(5), bpf = bandpass(sr);
  let ph = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, p = Math.min(1, t / 2);
    ph += (200 + 1600 * p * p) / sr;
    out[i] = (bpf(n(), 300 + 7000 * p * p, 3) * 1.5 + 0.25 * Math.sin(TAU * ph)) * p * p * Math.min(1, (2.2 - t) / 0.08);
  }
  return normalize(out);
}

/** Big low boom with a noise hit (drop impact). */
function impact(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 1.6)), n = noiseGen(9);
  let ph = 0, lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, f = 35 + 60 * Math.exp(-t * 6);
    ph += f / sr;
    lp += 0.08 * (n() - lp);
    out[i] = Math.sin(TAU * ph) * Math.exp(-t * 2.2) + lp * 2.5 * Math.exp(-t * 7);
  }
  return normalize(out);
}

/** A few hands clapping together. */
function clap(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 0.5)), n = noiseGen(3), bpf = bandpass(sr);
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    let env = 0;
    for (const d of [0, 0.011, 0.023, 0.031]) if (t >= d) env += Math.exp(-(t - d) / (d === 0.031 ? 0.09 : 0.008));
    out[i] = bpf(n(), 1300, 1.5) * env;
  }
  return normalize(out);
}

/** Darbuka "düm": deep, round centre stroke. */
function dum(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 0.6)), n = noiseGen(11);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr, f = 95 + 60 * Math.exp(-t * 30);
    ph += f / sr; ph2 += f * 2.3 / sr;
    out[i] = Math.sin(TAU * ph) * Math.exp(-t * 6) + 0.25 * Math.sin(TAU * ph2) * Math.exp(-t * 14) + n() * 0.15 * Math.exp(-t * 80);
  }
  return normalize(out);
}

/** Darbuka "tek": bright, short rim stroke. */
function tek(sr: number): Float32Array {
  const out = new Float32Array(Math.floor(sr * 0.25)), n = noiseGen(13), bpf = bandpass(sr);
  let ph = 0, ph2 = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / sr;
    ph += 720 / sr; ph2 += 1630 / sr;
    out[i] = (Math.sin(TAU * ph) * 0.8 + Math.sin(TAU * ph2) * 0.4) * Math.exp(-t * 32) + bpf(n(), 4000, 2) * 1.2 * Math.exp(-t * 60);
  }
  return normalize(out);
}

export const SOUNDS: SoundSpec[] = [
  { name: 'Korna', render: horn },
  { name: 'Siren', render: siren },
  { name: 'Lazer', render: laser },
  { name: 'Yükseliş', render: riser },
  { name: 'Patlama', render: impact },
  { name: 'Alkış', render: clap },
  { name: 'Darbuka düm', render: dum },
  { name: 'Darbuka tek', render: tek },
];
