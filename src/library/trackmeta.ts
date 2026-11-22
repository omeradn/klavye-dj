import type { Grid } from '../analysis/grid';
import { dbAll, dbGet, dbKeys, dbPut } from './db';

/** What is saved with a song: the (possibly hand-corrected) grid, cue point and hot cues. */
export interface TrackMeta {
  grid: Grid | null;
  cue: number;
  hot: (number | null)[];
  tags?: string[];
}

export async function loadMeta(sig: string): Promise<TrackMeta | undefined> {
  try { return await dbGet<TrackMeta>('tracks', sig); } catch { return undefined; }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

const queued = new Map<string, Partial<TrackMeta>>();

/** Save some fields (merged with what is stored; debounced, so dragging a grid does not write on every step). */
export function saveMeta(sig: string, m: Partial<TrackMeta>): void {
  queued.set(sig, { ...queued.get(sig), ...structuredClone(m) });
  clearTimeout(pending.get(sig));
  pending.set(sig, setTimeout(() => {
    pending.delete(sig);
    const part = queued.get(sig)!;
    queued.delete(sig);
    void (async () => {
      const old = await loadMeta(sig);
      await dbPut('tracks', { grid: null, cue: 0, hot: [null, null, null, null], ...old, ...part }, sig);
    })().catch(() => undefined);
  }, 400));
}

export async function allMeta(): Promise<Map<string, TrackMeta>> {
  const m = new Map<string, TrackMeta>();
  try {
    const [keys, vals] = await Promise.all([dbKeys('tracks'), dbAll<TrackMeta>('tracks')]);
    keys.forEach((k, i) => m.set(String(k), vals[i]));
  } catch { /* no storage */ }
  return m;
}
