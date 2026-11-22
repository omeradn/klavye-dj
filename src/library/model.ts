/** Pure library helpers (no DOM / storage) so they can be unit-tested. */
import type { Grid } from '../analysis/grid';
import { compat, wheelNo, type Key } from '../analysis/key';

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
  /** undefined = not analysed yet, null = no clear key */
  key?: Key | null;
  /** 1–10 */
  energy?: number;
  tags?: string[];
  dur?: number;
  /** built-in demo index */
  demo?: number;
  handle?: FileSystemFileHandle;
  file?: File;
  /** loaded on a deck in this session */
  played?: boolean;
}

export type SortKey = 'name' | 'folder' | 'bpm' | 'dur' | 'key' | 'energy';

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
  const hay = fold(t.name + ' ' + t.folder + ' ' + (t.tags ?? []).join(' '));
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
      case 'energy': return t.energy ?? (dir > 0 ? Infinity : -Infinity);
      case 'key': return t.key ? wheelNo(t.key) * 2 + (t.key.minor ? 0 : 1) : (dir > 0 ? Infinity : -Infinity);
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

/**
 * Good next song for a deck playing `key` at `bpm`: harmonically safe (same / relative / neighbour on the wheel)
 * and within ±6 % tempo (half / double time counts too).
 */
export function fitsNext(t: Track, key: Key | null, bpm: number | null): boolean {
  if (bpm && t.bpm && ![1, 2, 0.5].some(f => Math.abs(t.bpm! * f / bpm - 1) <= 0.06)) return false;
  if (key && t.key) return compat(key, t.key) === 2;
  return !key || !!t.key;
}
