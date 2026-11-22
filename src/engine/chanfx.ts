/**
 * KANAL FX: what each channel's FX knob (formerly FILTER) does. One type for both channels,
 * like the colour-effect selector on a mixer. Knob in the middle = off; left/right = more effect
 * (left darker / low-pass, right brighter / high-pass).
 */
export type ChanFxId = 'filter' | 'space' | 'noise' | 'crush';

export const CHAN_FX: { id: ChanFxId; label: string; help: string }[] = [
  { id: 'filter', label: 'FİLTRE', help: 'Sola: bas kalır (low-pass) · sağa: tiz kalır (high-pass)' },
  { id: 'space', label: 'SPACE', help: 'Yankılı geniş bir boşluk ekler; sola koyu, sağa parlak' },
  { id: 'noise', label: 'NOISE', help: 'Rüzgâr gibi beyaz gürültü ekler (geçişlerde gerilim)' },
  { id: 'crush', label: 'CRUSH', help: 'Sesi bozar, eski oyun konsolu gibi kırar' },
];

export const chanFx = {
  type: 'filter' as ChanFxId,
  listeners: [] as (() => void)[],
};

export function setChanFx(id: ChanFxId): void {
  chanFx.type = id;
  for (const f of chanFx.listeners) f();
}

export function cycleChanFx(dir: number): ChanFxId {
  const i = CHAN_FX.findIndex(c => c.id === chanFx.type);
  const next = CHAN_FX[(i + dir + CHAN_FX.length) % CHAN_FX.length].id;
  setChanFx(next);
  return next;
}

/** Stepped transfer curve for the CRUSH effect: fewer steps = rougher sound. */
export function crushCurve(steps: number, n = 4096): Float32Array {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1) * 2 - 1;
    c[i] = Math.round(x * steps) / steps;
  }
  return c;
}

/** Filter cutoff for a knob value: −1 → 150 Hz low-pass … +1 → 6 kHz high-pass (same as the old FILTER). */
export function cutoff(v: number): { type: BiquadFilterType; f: number } {
  if (Math.abs(v) < 0.03) return { type: 'lowpass', f: 22000 };
  return v < 0 ? { type: 'lowpass', f: 20000 * Math.pow(150 / 20000, -v) } : { type: 'highpass', f: 20 * Math.pow(6000 / 20, v) };
}
