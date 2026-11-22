/**
 * HAYALET ELLER: a hand that moves to a control, "presses" it and says why — so you can watch first, then do it yourself.
 * The same script runner will drive the Agent DJ later: steps can wait for real time or for the next beat / bar of a deck.
 */
import type { Deck } from '../engine/deck';
import { barPulses, pulseLen } from '../analysis/grid';

export interface GhostStep {
  /** control to point at (element or CSS selector); none = just talk */
  at?: string | (() => Element | null);
  /** what the hand says (shown in the coach card) */
  say?: string;
  /** the action itself */
  run?: () => void;
  /** wait before the next step: milliseconds, or until the next beat/bar of a deck */
  wait?: number | { deck: Deck; beats?: number; bars?: number };
}

let hand: HTMLElement | null = null;
let ring: HTMLElement | null = null;
let cancelled = false;

function ensure(): void {
  if (hand) return;
  hand = document.createElement('div'); hand.id = 'ghostHand'; hand.textContent = '👆';
  ring = document.createElement('div'); ring.id = 'ghostRing';
  document.body.append(ring, hand);
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Milliseconds until `n` beats (or bars) from now on this deck's grid; 0 when it is not playing. */
export function msUntil(deck: Deck, beats = 0, bars = 0): number {
  const g = deck.grid;
  if (!g || !deck.playing) return beats * 500 + bars * 2000;
  const unit = bars ? barPulses(g) : 1, n = bars || beats || 1;
  const p = pulseLen(g), t = deck.currentTime(), k = (t - g.offset) / p;
  const target = Math.floor(k / unit + 1e-6) * unit + unit * n;       // next line, then n-1 more
  return Math.max(0, (target - k) * p / deck.speed() * 1000);
}

function point(el: Element): void {
  ensure();
  const r = el.getBoundingClientRect();
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  hand!.style.transform = `translate(${x - 8}px, ${y - 2}px)`;
  ring!.style.transform = `translate(${x - 22}px, ${y - 22}px)`;
  hand!.classList.add('show');
}

function tap(): void {
  ring!.classList.remove('tap'); void ring!.offsetWidth; ring!.classList.add('tap');
}

export function hideHand(): void { hand?.classList.remove('show'); }

/** Play a script. `say` is called with each line (the coach card shows it). Resolves when done or stopped. */
export async function runGhost(steps: GhostStep[], say: (s: string) => void): Promise<void> {
  cancelled = false;
  ensure();
  for (const s of steps) {
    if (cancelled) break;
    const el = typeof s.at === 'function' ? s.at() : s.at ? document.querySelector(s.at) : null;
    if (s.say) say(s.say);
    if (el) { point(el); await sleep(550); }
    if (cancelled) break;
    if (s.run) { if (el) tap(); s.run(); }
    const w = s.wait ?? 900;
    await sleep(typeof w === 'number' ? w : msUntil(w.deck, w.beats, w.bars));
  }
  hideHand();
}

export function stopGhost(): void { cancelled = true; hideHand(); }
