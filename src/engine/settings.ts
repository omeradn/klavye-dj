/** Audio settings kept in the browser (localStorage) between sessions. */

export type Latency = 'low' | 'mid' | 'safe';
/** single = one stereo output · quad = 4-channel interface (1-2 master, 3-4 phones) · device = phones on a second device */
export type PhonesMode = 'single' | 'quad' | 'device';

export interface AudioSettings {
  latency: Latency;
  /** output device id for the master ('' = system default) */
  masterSink: string;
  phonesMode: PhonesMode;
  /** output device id for the headphones in 'device' mode */
  phonesSink: string;
  /** 0 = only cue, 1 = only master */
  cueMix: number;
  phonesLevel: number;
}

export const DEFAULT_SETTINGS: AudioSettings = {
  latency: 'low', masterSink: '', phonesMode: 'single', phonesSink: '', cueMix: 0.5, phonesLevel: 0.8,
};

/** AudioContext latencyHint for each setting (only applied when the context is created). */
export const LATENCY_HINT: Record<Latency, AudioContextLatencyCategory | number> = {
  low: 'interactive', mid: 0.05, safe: 'playback',
};

const KEY = 'klavye-dj.audio';

/** Parse stored JSON, keeping only valid fields (anything broken falls back to the defaults). */
export function parseSettings(raw: string | null): AudioSettings {
  const s: AudioSettings = { ...DEFAULT_SETTINGS };
  if (!raw) return s;
  let o: Record<string, unknown>;
  try { o = JSON.parse(raw) as Record<string, unknown>; } catch { return s; }
  if (!o || typeof o !== 'object') return s;
  if (o.latency === 'low' || o.latency === 'mid' || o.latency === 'safe') s.latency = o.latency;
  if (o.phonesMode === 'single' || o.phonesMode === 'quad' || o.phonesMode === 'device') s.phonesMode = o.phonesMode;
  if (typeof o.masterSink === 'string') s.masterSink = o.masterSink;
  if (typeof o.phonesSink === 'string') s.phonesSink = o.phonesSink;
  const num = (v: unknown, d: number) => typeof v === 'number' && v >= 0 && v <= 1 ? v : d;
  s.cueMix = num(o.cueMix, s.cueMix);
  s.phonesLevel = num(o.phonesLevel, s.phonesLevel);
  return s;
}

function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export const audioSettings: AudioSettings = parseSettings(typeof localStorage === 'undefined' ? null : read());

export function saveAudioSettings(): void {
  try { localStorage.setItem(KEY, JSON.stringify(audioSettings)); } catch { /* private mode: keep in memory only */ }
}
