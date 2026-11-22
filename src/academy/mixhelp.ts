/** Measurements the mixing lessons and the transition exam use (pure parts are unit-tested). */
import { barPulses, pulseAt, type Grid } from '../analysis/grid';
import type { Deck } from '../engine/deck';
import { chGain, mixerCfg, xfGains } from '../engine/mixercfg';

/** Signed distance in beats from time t to the nearest phrase start (negative = just before it). */
export function phraseOffset(g: Grid, t: number, phraseBars: number): number {
  const bp = barPulses(g), len = bp * phraseBars;
  const rel = pulseAt(g, t) - g.phraseBar * bp;
  const k = rel / len;
  return (k - Math.round(k)) * len;
}

/** Time (s) of bar `bar` (0-based from the grid offset). */
export const barTime = (g: Grid, bar: number): number => g.offset + bar * barPulses(g) * 60 / g.bpm;

/** How loud a deck is in the master right now: channel fader × crossfader (0…1), 0 when stopped. */
export function audible(d: Deck, xfVal: number): number {
  if (!d.playing || !d.has) return 0;
  const x = xfGains(mixerCfg.xf, (xfVal + 1) / 2);
  return chGain(mixerCfg.ch, d.chF.v) * (d.i === 0 ? x.a : x.b);
}

/** Is the deck's bass (low band) on? */
export const bassOn = (d: Deck): boolean => !d.kills.lo && d.loK.v > -15;

/** Watches a deck start playing; returns the phrase offset (beats, vs. `ref` deck) once, at the moment it starts. */
export function startWatch(): (d: Deck, ref: Deck) => number | null {
  let was = true;
  return (d, ref) => {
    const now = d.playing;
    const started = now && !was;
    was = now;
    if (!started || !ref.grid) return null;
    return phraseOffset(ref.grid, ref.currentTime(), ref.phraseBars);
  };
}
