/**
 * Restoran Modu schedule (pure logic, unit-tested): which part of the day we are in, and which
 * next track fits it best. Times are Istanbul time.
 */
import { compat, type Key } from '../analysis/key';

export interface DayPart {
  name: string;
  /** hours [from, to) on a 24 h clock; `from` > `to` wraps past midnight */
  from: number;
  to: number;
  /** energy window of the songs played then (1–10) */
  energy: [number, number];
  /** the energy the automix aims for */
  target: number;
  /** master volume ceiling for this part of the day (0–1) */
  cap: number;
}

export const DAY_PARTS: DayPart[] = [
  { name: 'Kapanış', from: 23, to: 11, energy: [1, 5], target: 3, cap: 0.6 },
  { name: 'Öğle · sakin', from: 11, to: 15, energy: [2, 5], target: 3.5, cap: 0.7 },
  { name: 'Öğleden sonra', from: 15, to: 18, energy: [3, 6], target: 4.5, cap: 0.75 },
  { name: 'Akşam · hareketli', from: 18, to: 23, energy: [5, 8], target: 6.5, cap: 0.8 },
];

/** Istanbul hour as a decimal (e.g. 14.5 = 14:30). */
export function istanbulHour(d = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d);
  const h = +(parts.find(p => p.type === 'hour')?.value ?? 0), m = +(parts.find(p => p.type === 'minute')?.value ?? 0);
  return h + m / 60;
}

export function dayPartAt(hour: number): DayPart {
  const h = ((hour % 24) + 24) % 24;
  return DAY_PARTS.find(p => (p.from < p.to ? h >= p.from && h < p.to : h >= p.from || h < p.to)) ?? DAY_PARTS[0];
}

/** A song the automix may play next. */
export interface Cand { sig: string; bpm: number | null; key: Key | null; energy?: number }

/** Tempo fits: within ±6 %, half- or double-time counts. */
export function tempoFits(a: number, b: number): boolean {
  return [1, 2, 0.5].some(f => Math.abs(a * f / b - 1) <= 0.06);
}

/**
 * Score a candidate for the current song and day part (lower = better), or null when it does not fit.
 * Tempo and key must fit the song that is playing; energy must sit in the day part's window
 * (unknown energy is accepted but ranks lower).
 */
export function scoreNext(c: Cand, cur: { bpm: number; key: Key | null }, part: DayPart): number | null {
  if (c.bpm == null || !tempoFits(c.bpm, cur.bpm)) return null;
  const mix = c.key && cur.key ? compat(cur.key, c.key) : 1;
  if (cur.key && c.key && mix === 0) return null;
  let e = 2;                                                  // unknown energy: a middle score
  if (c.energy != null) {
    if (c.energy < part.energy[0] || c.energy > part.energy[1]) return null;
    e = Math.abs(c.energy - part.target);
  }
  const drift = Math.abs(c.bpm / cur.bpm - 1) * 100;          // % tempo change (half/double folded)
  return e * 2 + drift * 0.5 + (2 - mix) * 1.5;
}

/** The best candidate, not in `exclude`. */
export function pickNext(cands: Cand[], cur: { bpm: number; key: Key | null }, part: DayPart, exclude: Set<string>): Cand | null {
  let best: Cand | null = null, bs = Infinity;
  for (const c of cands) {
    if (exclude.has(c.sig)) continue;
    const s = scoreNext(c, cur, part);
    if (s != null && s < bs) { bs = s; best = c; }
  }
  return best;
}
