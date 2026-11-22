/** Mixer character: fader curves and EQ type (kept in the browser between sessions). Pure functions are unit-tested. */

export type XfCurve = 'smooth' | 'flat' | 'sharp';
export type ChCurve = 'smooth' | 'linear' | 'sharp';
export type EqMode = 'eq' | 'iso';

export const XF_CURVES: { id: XfCurve; label: string; help: string }[] = [
  { id: 'smooth', label: 'YUMUŞAK', help: 'Uzun, akıcı geçişler için: ortada iki şarkı da biraz kısık (ses yüksekliği sabit kalır)' },
  { id: 'flat', label: 'DÜZ', help: 'Ortada iki şarkı da tam seste; kenara yaklaştıkça diğeri kısılır' },
  { id: 'sharp', label: 'KESKİN', help: 'Scratch ve hızlı kesmeler için: çok az hareketle diğer şarkı tamamen açılır' },
];
export const CH_CURVES: { id: ChCurve; label: string; help: string }[] = [
  { id: 'smooth', label: 'YUMUŞAK', help: 'Ses alttan yavaş, üstte hızlı açılır (kulağa en doğal gelen)' },
  { id: 'linear', label: 'DÜZ', help: 'Fader yarıdaysa ses de yarı' },
  { id: 'sharp', label: 'KESKİN', help: 'Fader biraz kalkınca ses tam açılır (kesme ve scratch için)' },
];

/** Crossfader gains; x = 0 fully A … 1 fully B. */
export function xfGains(curve: XfCurve, x: number): { a: number; b: number } {
  x = Math.min(1, Math.max(0, x));
  switch (curve) {
    case 'flat': return { a: Math.min(1, 2 * (1 - x)), b: Math.min(1, 2 * x) };
    case 'sharp': { const w = 0.06; return { a: Math.min(1, (1 - x) / w), b: Math.min(1, x / w) }; }
    default: return { a: Math.cos(x * Math.PI / 2), b: Math.sin(x * Math.PI / 2) };
  }
}

/** Channel fader position 0…1 → gain. */
export function chGain(curve: ChCurve, v: number): number {
  v = Math.min(1, Math.max(0, v));
  switch (curve) {
    case 'linear': return v;
    case 'sharp': return Math.min(1, v * 8);
    default: return v * v;
  }
}

/** Isolator band gain for a knob value in dB (−26…+6): fully down = band completely gone. */
export const isoGain = (db: number): number => db <= -25.5 ? 0 : Math.pow(10, db / 20);

const KEY = 'klavye-dj.mixer';

export const mixerCfg = { xf: 'smooth' as XfCurve, ch: 'smooth' as ChCurve, eq: 'eq' as EqMode, listeners: [] as (() => void)[] };

try {
  const o = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<typeof mixerCfg>;
  if (XF_CURVES.some(c => c.id === o.xf)) mixerCfg.xf = o.xf!;
  if (CH_CURVES.some(c => c.id === o.ch)) mixerCfg.ch = o.ch!;
  if (o.eq === 'eq' || o.eq === 'iso') mixerCfg.eq = o.eq;
} catch { /* no storage (tests, private mode) */ }

export function setMixerCfg(p: Partial<Pick<typeof mixerCfg, 'xf' | 'ch' | 'eq'>>): void {
  Object.assign(mixerCfg, p);
  try { localStorage.setItem(KEY, JSON.stringify({ xf: mixerCfg.xf, ch: mixerCfg.ch, eq: mixerCfg.eq })); } catch { /* ignore */ }
  for (const f of mixerCfg.listeners) f();
}
