/**
 * RESTORAN MODU runtime: the automix plays the next song on its own, on the phrase line,
 * with a 32-bar crossfade and a bass swap in the middle. It also holds the lock (no accidental
 * stop) and the quiet / volume ceiling.
 */
import type { Deck } from '../engine/deck';
import type { Track } from '../library/model';
import { phraseOffset, barTime, audible } from '../academy/mixhelp';
import { dayPartAt, istanbulHour, pickNext, type Cand } from './schedule';

export const rest = {
  on: false,
  /** no accidental stop of a playing deck */
  lock: false,
  /** "acil kıs": master down to a whisper until switched off */
  quiet: false,
  /** the volume ceiling the user sets (0–1) */
  userCap: 0.85,
  /** follow the day part's volume ceiling too */
  autoCap: true,
  stage: 'idle' as 'idle' | 'loading' | 'wait' | 'fade',
  /** title of the song that comes next (empty when none) */
  next: '',
  note: '',
  listeners: [] as (() => void)[],
};

/** Effective master gain for a knob value: quiet, then the ceilings. */
export function masterLimit(v: number): number {
  if (rest.quiet) return Math.min(v, 0.15);
  const dayCap = rest.on && rest.autoCap ? dayPartAt(istanbulHour()).cap : 1;
  return Math.min(v, rest.userCap, dayCap);
}

interface Deps {
  decks: Deck[];
  xfVal(): number;
  setXf(v: number): void;
  pool(): Track[];
  load(t: Track, d: Deck): Promise<void>;
  applyMaster(): void;
}

let deps: Deps | null = null;
let out: Deck | null = null, inc: Deck | null = null;
let busy = false, prevOff = NaN, fadeT0 = 0, fadeLen = 0, xf0 = 0, xf1 = 0, bassSwapped = false;
const used = new Set<string>();

export function setupRestaurant(d: Deps): void {
  deps = d;
  setInterval(tick, 50);
  setInterval(() => { for (const f of rest.listeners) f(); }, 500);
}

export function setRestaurant(on: boolean): void {
  rest.on = on;
  if (!on) abort(true);
  deps?.applyMaster();
  notify();
}

export function setLock(on: boolean): void { rest.lock = on; notify(); }
export function setQuiet(on: boolean): void { rest.quiet = on; deps?.applyMaster(); notify(); }
export function setUserCap(v: number): void { rest.userCap = v; deps?.applyMaster(); notify(); }

export function locked(): boolean { return rest.lock; }

function notify(): void { for (const f of rest.listeners) f(); }

function onAir(): Deck | null {
  if (!deps) return null;
  const p = deps.decks.filter(d => d.playing && d.has);
  if (!p.length) return null;
  return p.reduce((a, b) => (audible(b, deps!.xfVal()) > audible(a, deps!.xfVal()) ? b : a));
}

/** Give up the current transition; `stopIncoming` also stops a song that already started. */
function abort(stopIncoming = false): void {
  if (inc) { inc.kills.lo = false; inc.applyEQ(); if (stopIncoming && inc.playing) inc.stop(); }
  if (out) { out.kills.lo = false; out.applyEQ(); }
  out = null; inc = null; busy = false; rest.stage = 'idle'; rest.next = ''; bassSwapped = false;
  notify();
}

function tick(): void {
  if (!rest.on || !deps) return;
  if (rest.stage === 'idle') idleTick();
  else if (rest.stage === 'wait') waitTick();
  else if (rest.stage === 'fade') fadeTick();
}

function idleTick(): void {
  if (busy || !deps) return;
  const on = onAir();
  if (!on || !on.grid) { rest.note = 'Çalan şarkı yok: bir deck\'te şarkı çal'; return; }
  const bar = 4 * 60 / on.grid.bpm, remain = on.duration - on.currentTime();
  const part = dayPartAt(istanbulHour());
  if (remain > 40 * bar) { rest.note = `${part.name} · geçiş ~${Math.round((remain - 40 * bar))} sn sonra hazırlanır`; return; }
  // the incoming deck sits on the other side of the crossfader (a "through" deck is never used)
  const free = deps.decks.filter(d => d !== on && !d.playing && d.xfSide !== 'T');
  const other = free.find(d => d.xfSide !== on.xfSide) ?? free[0];
  if (!other) { rest.note = 'Boş deck yok'; return; }
  const pool = deps.pool();
  const cands: Cand[] = pool.filter(t => t.sig && t.sig !== on.sig && t.bpm != null)
    .map(t => ({ sig: t.sig!, bpm: t.bpm ?? null, key: t.key ?? null, energy: t.energy }));
  const cur = { bpm: on.bpm!, key: on.playingKey() };
  const best = pickNext(cands, cur, part, used);
  if (!best) { rest.note = 'Uygun şarkı yok: "Restoran" listesine şarkı ekle ya da kütüphaneyi genişlet'; return; }
  const track = pool.find(t => t.sig === best.sig)!;
  busy = true; out = on; inc = other; rest.stage = 'loading'; rest.next = track.name;
  notify();
  deps.load(track, other).then(() => {
    busy = false;
    if (!inc || !inc.has || !inc.grid || !out) { abort(); return; }
    const ratio = cur.bpm / inc.grid.bpm - 1;
    if (Math.abs(ratio) > 0.16) { abort(); return; }
    inc.tempoF.set(ratio);
    used.add(track.sig!);
    inc.seek(barTime(inc.grid, 0));           // the song starts on its first bar
    inc.kills.lo = true; inc.applyEQ();        // no bass until the swap
    prevOff = NaN;
    rest.stage = 'wait';
    notify();
  }).catch(() => abort());
}

function waitTick(): void {
  if (!out || !inc || !out.grid) { abort(); return; }
  if (!out.playing) { abort(); return; }      // the outgoing song was stopped by hand
  const off = phraseOffset(out.grid, out.currentTime(), out.phraseBars);
  const crossed = !Number.isNaN(prevOff) && prevOff < 0 && off >= 0 && off < 1;
  prevOff = off;
  if (!crossed) return;
  // the phrase line: start the incoming song and begin the 32-bar crossfade
  if (!inc.playing) inc.act('play');
  fadeLen = 32 * 4 * 60 / out.grid.bpm * 1000;
  fadeT0 = performance.now();
  xf0 = deps!.xfVal();
  xf1 = inc.xfSide === 'R' ? 1 : -1;
  bassSwapped = false;
  rest.stage = 'fade';
  notify();
}

function fadeTick(): void {
  if (!out || !inc || !deps) { abort(); return; }
  const t = Math.min(1, (performance.now() - fadeT0) / fadeLen);
  const s = t * t * (3 - 2 * t);               // smooth start and end
  deps.setXf(xf0 + (xf1 - xf0) * s);
  if (t >= 0.5 && !bassSwapped) {               // bass swap: outgoing bass off, incoming bass on
    bassSwapped = true;
    out.kills.lo = true; out.applyEQ();
    inc.kills.lo = false; inc.applyEQ();
  }
  if (t >= 1) {
    out.stop(); out.kills.lo = false; out.applyEQ();
    deps.setXf(xf1);
    out = null; inc = null; busy = false;
    rest.stage = 'idle'; rest.next = ''; bassSwapped = false;
    notify();
  }
}

/** Status text for the panel. */
export function restStatus(): string {
  const part = dayPartAt(istanbulHour());
  if (!rest.on) return `Kapalı · ${part.name} · tavan ${Math.round(Math.min(rest.userCap, part.cap) * 100)}%`;
  if (rest.quiet) return 'ACİL KIS: ses çok düşük';
  if (rest.stage === 'fade') return `Geçiş: ${rest.next}`;
  if (rest.stage === 'wait' || rest.stage === 'loading') return `Sıradaki: ${rest.next} · phrase başında girecek`;
  return rest.note;
}
