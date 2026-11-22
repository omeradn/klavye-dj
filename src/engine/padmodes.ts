/** The 8 performance pads: modes, and what each pad does in each mode (pure data, unit-tested). */

export type PadMode = 'hot' | 'loop' | 'jump' | 'slicer' | 'roll' | 'sampler' | 'key';

export const PAD_MODES: { id: PadMode; label: string; help: string }[] = [
  { id: 'hot', label: 'HOT CUE', help: 'Boş pad: o anı kaydeder · dolu pad: oraya atlar · silmek: Backspace basılıyken pad, ya da ⇧+tık / sağ tık' },
  { id: 'loop', label: 'LOOP', help: 'Her pad farklı uzunlukta loop açar (¼ vuruştan 32 vuruşa); aynı pad tekrar = kapat' },
  { id: 'jump', label: 'JUMP', help: 'Şarkıda vuruş sayısı kadar geri (◀) ya da ileri (▶) atlar; ritim kaymaz' },
  { id: 'slicer', label: 'SLICER', help: 'Çalan 8 vuruş 8 dilime bölünür; basılı tuttuğun dilim tekrar eder, bırakınca şarkı kaldığı yerden devam eder' },
  { id: 'roll', label: 'ROLL', help: 'Basılı tuttuğun sürece çok kısa bir loop "trrrr" diye tekrar eder; bırakınca şarkı kaldığı yerden devam eder' },
  { id: 'sampler', label: 'SAMPLER', help: 'Her pad bir ses çalar (korna, siren, darbuka…) · kendi sesini yüklemek: ⇧+tık / sağ tık' },
  { id: 'key', label: 'TON', help: 'Şarkının tonunu pad\'deki kadar yarım ses kaydırır (0 = orijinal)' },
];

/** Beat lengths of the 8 pads in LOOP mode. */
export const LOOP_BEATS = [0.25, 0.5, 1, 2, 4, 8, 16, 32];
/** Beats to jump (negative = back) in JUMP mode: top row back/forward 1 and 4, bottom row 16 and 32. */
export const JUMP_BEATS = [-1, 1, -4, 4, -16, 16, -32, 32];
/** Roll lengths in beats. */
export const ROLL_BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8];
/** Semitone shift per pad in TON mode: top row up, bottom row 0 and down. */
export const KEY_SEMIS = [1, 2, 3, 4, 0, -1, -2, -3];
/** Slicer: 8 slices of 1 beat each. */
export const SLICES = 8;

export const beatsLabel = (b: number): string => b >= 1 ? String(b) : Math.abs(b - 0.75) < 1e-6 ? '3/4' : '1/' + Math.round(1 / b);

export function padLabel(mode: PadMode, i: number, extra?: { sample?: string }): string {
  switch (mode) {
    case 'hot': return `HOT CUE ${i + 1}`;
    case 'loop': return `LOOP ${beatsLabel(LOOP_BEATS[i])}`;
    case 'jump': { const b = JUMP_BEATS[i]; return b < 0 ? `◀ ${-b}` : `${b} ▶`; }
    case 'slicer': return `DİLİM ${i + 1}`;
    case 'roll': return `ROLL ${beatsLabel(ROLL_BEATS[i])}`;
    case 'sampler': return extra?.sample ?? `SES ${i + 1}`;
    case 'key': { const s = KEY_SEMIS[i]; return s === 0 ? 'TON 0' : (s > 0 ? '+' : '−') + Math.abs(s); }
  }
}

/** Start of the slicer's 8-beat window that contains `pulse` (pulse index since the grid offset). */
export const sliceBase = (pulse: number): number => Math.floor(pulse / SLICES) * SLICES;
