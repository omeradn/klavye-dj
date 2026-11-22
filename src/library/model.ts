/** Pure library helpers (no DOM / storage) so they can be unit-tested. */
import type { Grid } from '../analysis/grid';

export const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|oga|opus|flac|aiff?|webm)$/i;

export interface Track {
  id: string;
  name: string;
  /** folder name shown in the list ("Demo" for the built-in tracks) */
  folder: string;
  /** analysis cache key */
  sig?: string;
  bpm?: number | null;
  grid?: Grid | null;
  dur?: number;
  /** built-in demo index */
  demo?: number;
  handle?: FileSystemFileHandle;
  file?: File;
  /** loaded on a deck in this session */
  played?: boolean;
}

export type SortKey = 'name' | 'folder' | 'bpm' | 'dur';

/** Cache key for a file: same name + size + date = same song (re-analysis not needed). */
export const fileSig = (f: { name: string; size: number; lastModified: number }): string =>
  `${f.name}|${f.size}|${f.lastModified}`;

export const stripExt = (n: string): string => n.replace(/\.[^.]+$/, '');

/** Turkish-aware, accent-insensitive lowercase ("Şarkı" matches "sarki"). */
export function fold(s: string): string {
  return s.toLocaleLowerCase('tr')
    .replace(/[çğıöşü]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' })[c]!)
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Search: every word must appear in the name or folder.
 * A number (e.g. "124") also matches tracks within ±2 BPM.
 */
export function matches(t: Track, q: string): boolean {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = fold(t.name + ' ' + t.folder);
  return words.every(w => {
    if (hay.includes(w)) return true;
    const n = Number(w.replace(',', '.'));
    return n >= 40 && n <= 250 && t.bpm != null && Math.abs(t.bpm - n) <= 2;
  });
}

export function sortTracks(list: Track[], key: SortKey, dir: 1 | -1): Track[] {
  const val = (t: Track): string | number => {
    switch (key) {
      case 'bpm': return t.bpm ?? (dir > 0 ? Infinity : -Infinity);   // unknown BPM always last
      case 'dur': return t.dur ?? (dir > 0 ? Infinity : -Infinity);
      case 'folder': return fold(t.folder + ' ' + t.name);
      default: return fold(t.name);
    }
  };
  return [...list].sort((a, b) => {
    const x = val(a), y = val(b);
    if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir || 0;
    return String(x).localeCompare(String(y), 'tr') * dir;
  });
}
