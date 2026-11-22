import type { Grid } from '../analysis/grid';
import { dbGet, dbPut } from './db';

/** What is saved with a song: the (possibly hand-corrected) grid, cue point and hot cues. */
export interface TrackMeta {
  grid: Grid | null;
  cue: number;
  hot: (number | null)[];
}

export async function loadMeta(sig: string): Promise<TrackMeta | undefined> {
  try { return await dbGet<TrackMeta>('tracks', sig); } catch { return undefined; }
}

const pending = new Map<string, ReturnType<typeof setTimeout>>();

/** Save (debounced, so dragging a grid does not write on every step). */
export function saveMeta(sig: string, m: TrackMeta): void {
  clearTimeout(pending.get(sig));
  pending.set(sig, setTimeout(() => {
    pending.delete(sig);
    void dbPut('tracks', structuredClone(m), sig).catch(() => undefined);
  }, 400));
}
