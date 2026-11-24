/**
 * Controllers: MIDI (Web MIDI) and gamepads. Any knob, fader, button or jog wheel can be bound to a
 * control ("MIDI Learn"); the controller's lights (LEDs) follow the state of bound buttons.
 * A target is either a key-map control (slot:<id>, runs exactly like the keyboard key), or a
 * continuous control the app registers (cont:<id>): a knob / fader with its range, or a relative
 * control such as a jog wheel. Pure parts (parsing, keys, binding rules) are unit-tested.
 */
import type { Deck } from '../engine/deck';
import { slots, keymapCfg, slotById } from '../input/keymap';
import { pressSlot } from '../input/keyboard';

/**
 * note: value = velocity (0 = off) · cc: 0..127 · pb (pitch bend): 0..16383
 * axis (gamepad stick / trigger): value 0..1 · gbtn (gamepad button): 0 or 127
 */
export interface MidiMsg { kind: 'note' | 'cc' | 'pb' | 'axis' | 'gbtn'; ch: number; num: number; value: number }

export function parseMidi(b: ArrayLike<number>): MidiMsg | null {
  const st = b[0] ?? 0, type = st & 0xf0, ch = st & 0x0f;
  if (type === 0x90) return { kind: 'note', ch, num: b[1] ?? 0, value: b[2] ?? 0 };
  if (type === 0x80) return { kind: 'note', ch, num: b[1] ?? 0, value: 0 };
  if (type === 0xb0) return { kind: 'cc', ch, num: b[1] ?? 0, value: b[2] ?? 0 };
  if (type === 0xe0) return { kind: 'pb', ch, num: 0, value: ((b[2] ?? 0) << 7) | (b[1] ?? 0) };
  return null;
}

/** Identity of a physical control: the same knob always gives the same key. */
export const msgKey = (m: MidiMsg): string => m.kind === 'pb' ? `pb:${m.ch}` : `${m.kind}:${m.ch}:${m.num}`;

/** 0..1 position of a knob / fader / stick message. */
export const normalized = (m: MidiMsg): number => {
  if (m.kind === 'axis') return Math.min(1, Math.max(0, m.value));
  return Math.min(1, m.value / (m.kind === 'pb' ? 16383 : 127));
};

/** Is a button pressed by this message? (notes: velocity > 0; CC buttons: value ≥ 64) */
export const isOn = (m: MidiMsg): boolean =>
  m.kind === 'cc' ? m.value >= 64 : m.kind === 'note' ? m.value > 0 : m.kind === 'gbtn' ? m.value > 0 : m.kind === 'pb' ? m.value >= 8192 : false;

/** Relative encoders (jog wheels): 1–63 turn right by that many steps, 65–127 turn left; 0 / 64 = still. */
export const relDelta = (v: number): number => (v === 0 || v === 64 ? 0 : v < 64 ? v : v - 128);

export function describe(m: MidiMsg): string {
  if (m.kind === 'axis') return `pad eksen ${m.num} · ${Math.round(m.value * 100)}%`;
  if (m.kind === 'gbtn') return `pad düğme ${m.num} · ${m.value ? 'basıldı' : 'bırakıldı'}`;
  const kind = m.kind === 'note' ? 'nota' : m.kind === 'cc' ? 'CC' : 'pitch bend';
  return m.kind === 'pb' ? `${kind} · kanal ${m.ch + 1} · ${m.value}` : `${kind} ${m.num} · kanal ${m.ch + 1} · ${m.value}`;
}

export interface MidiBinding { key: string; target: string }

/**
 * A continuous control the app exposes. `set` takes a value in [min, max] (knob, fader);
 * `rel` takes a step (jog wheel). A control has one of the two.
 */
export interface ContTarget { id: string; label: string; min?: number; max?: number; set?(v: number): void; rel?(step: number): void }

const conts = new Map<string, ContTarget>();
export function registerCont(t: ContTarget): void { conts.set(t.id, t); }
export const contList = (): ContTarget[] => [...conts.values()];

/**
 * Apply a binding: one control per key and one key per target. Binding a target again moves it;
 * a key already used by another target is taken over (returns the displaced target, if any).
 */
export function bindRules(list: MidiBinding[], key: string, target: string): { list: MidiBinding[]; displaced: string | null } {
  const old = list.find(b => b.key === key);
  const rest = list.filter(b => b.key !== key && b.target !== target);
  return { list: [...rest, { key, target }], displaced: old && old.target !== target ? old.target : null };
}

const KEY = 'klavye-dj.midi';

export const midiCfg = {
  bindings: load(),
  /** target waiting for the next message (MIDI Learn) */
  learn: null as string | null,
  last: '',
  status: 'Kontrolcü kapalı — "MIDI\'yi aç" ile bağla',
  listeners: [] as (() => void)[],
};

function load(): MidiBinding[] {
  try {
    const o = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return Array.isArray(o) ? o.filter(b => typeof b?.key === 'string' && typeof b?.target === 'string') : [];
  } catch { return []; }
}

function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(midiCfg.bindings)); } catch { /* private mode */ }
}

function notify(): void { for (const f of midiCfg.listeners) f(); }
export function onMidiChange(fn: () => void): void { midiCfg.listeners.push(fn); }

let decksRef: Deck[] = [];
export function setMidiDecks(ds: Deck[]): void { decksRef = ds; }

export function startLearn(target: string): void {
  midiCfg.learn = target;
  midiCfg.status = 'Şimdi kontrole dokun (knob, fader, düğme, jog ya da pad)…';
  notify();
}
export function cancelLearn(): void { midiCfg.learn = null; notify(); }

export function setBinding(key: string, target: string): void {
  const r = bindRules(midiCfg.bindings, key, target);
  midiCfg.bindings = r.list;
  save();
}

export function removeBinding(target: string): void {
  midiCfg.bindings = midiCfg.bindings.filter(b => b.target !== target);
  save();
}

/** Human name of a target (for the lists). */
export function targetLabel(target: string): string {
  if (target.startsWith('slot:')) {
    const s = slotById(target.slice(5), keymapCfg.ov);
    return s ? `${s.label} · Deck ${'ABCD'[s.d]}` : '(silinmiş tuş)';
  }
  return conts.get(target.slice(5))?.label ?? '(bilinmeyen kontrol)';
}

/** Everything that can be learned, grouped for the picker. */
export function targetChoices(): { group: string; items: [string, string][] }[] {
  const btn = slots(keymapCfg.ov).map(s => [`slot:${s.id}`, `${s.label} · Deck ${'ABCD'[s.d]}`] as [string, string]);
  return [
    { group: 'Düğmeler (tuş karşılığı)', items: btn },
    { group: 'Kaydırıcılar, knob\'lar ve jog', items: contList().map(c => [`cont:${c.id}`, c.label] as [string, string]) },
  ];
}

/** Handle one incoming message: learn it, or run the bound control. */
export function handleMidi(m: MidiMsg): void {
  midiCfg.last = describe(m);
  const key = msgKey(m);
  if (midiCfg.learn) {
    const target = midiCfg.learn;
    midiCfg.learn = null;
    setBinding(key, target);
    midiCfg.status = `Bağlandı: ${targetLabel(target)} ← ${describe(m)}`;
    notify();
    return;
  }
  const b = midiCfg.bindings.find(x => x.key === key);
  if (b) {
    if (b.target.startsWith('slot:')) {
      const s = slotById(b.target.slice(5), keymapCfg.ov);
      // pad0..pad7 are pads; padModeNext / padModePrev are ordinary actions
      if (s && decksRef.length) pressSlot(decksRef, { d: s.d, a: /^pad\d$/.test(s.a) ? 'pad' : s.a, arg: s.arg, mode: s.mode }, isOn(m));
    } else {
      const c = conts.get(b.target.slice(5));
      if (c?.rel) { if (m.kind === 'cc') c.rel(relDelta(m.value)); }
      else if (c?.set && c.min != null && c.max != null) c.set(c.min + normalized(m) * (c.max - c.min));
    }
  }
  notify();
}

/* ---------- MIDI devices ---------- */

interface MidiInputLike { name?: string | null; onmidimessage: ((e: { data: Uint8Array }) => void) | null }
interface MidiOutputLike { name?: string | null; send(data: number[]): void }
interface MidiAccessLike { inputs: Map<string, MidiInputLike>; outputs: Map<string, MidiOutputLike>; onstatechange: (() => void) | null }

let outputs: MidiOutputLike[] = [];

/** Ask the browser for MIDI inputs (needs a user click; Chrome / Edge). */
export async function openMidi(): Promise<void> {
  const nav = navigator as Navigator & { requestMIDIAccess?: (o?: { sysex?: boolean }) => Promise<MidiAccessLike> };
  if (!nav.requestMIDIAccess) {
    midiCfg.status = 'Bu tarayıcı MIDI desteklemiyor (Chrome ya da Edge kullan).';
    notify(); return;
  }
  try {
    const acc = (await nav.requestMIDIAccess({ sysex: false })) as unknown as MidiAccessLike;
    attach(acc);
    acc.onstatechange = () => attach(acc);
  } catch {
    midiCfg.status = 'MIDI izni verilmedi.';
    notify();
  }
}

function attach(acc: MidiAccessLike): void {
  const names: string[] = [];
  acc.inputs.forEach(inp => {
    inp.onmidimessage = e => { const m = parseMidi(e.data); if (m) handleMidi(m); };
    names.push(inp.name ?? 'MIDI cihazı');
  });
  outputs = [...acc.outputs.values()];
  midiCfg.status = names.length ? `Bağlı: ${names.join(', ')}` : 'Kontrolcü bulunamadı — tak ve tekrar dene.';
  notify();
}

/* ---------- gamepads (sticks, triggers, buttons) ---------- */

const axisLast = new Map<string, number>(), btnLast = new Map<string, boolean>();
let padRunning = false;

/** Poll connected gamepads; sticks and buttons go through the same binding path as MIDI. */
export function startGamepads(): void {
  if (padRunning) return;
  padRunning = true;
  const pads = () => navigator.getGamepads?.() ?? [];
  const loop = () => {
    for (const gp of pads()) {
      if (!gp) continue;
      gp.axes.forEach((v, i) => {
        const k = `${gp.index}:${i}`, prev = axisLast.get(k);
        const dead = Math.abs(v) < 0.04 ? 0 : v;                 // centre dead zone
        if (prev === undefined ? dead !== 0 : Math.abs(dead - prev) > 0.01) {
          axisLast.set(k, dead);
          handleMidi({ kind: 'axis', ch: gp.index, num: i, value: (dead + 1) / 2 });   // −1..1 → 0..1
        }
      });
      gp.buttons.forEach((b, i) => {
        const k = `${gp.index}:${i}`, was = btnLast.get(k) ?? false;
        if (b.pressed !== was) {
          btnLast.set(k, b.pressed);
          handleMidi({ kind: 'gbtn', ch: gp.index, num: i, value: b.pressed ? 127 : 0 });
        }
      });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.addEventListener('gamepadconnected', e => {
    midiCfg.status = `Gamepad bağlandı: ${(e as GamepadEvent).gamepad.id.slice(0, 40)}`;
    notify();
  });
}

/* ---------- controller lights (LEDs) ---------- */

/** Is the action's light on right now? (only the actions that have a visible state) */
function litOf(s: { a: string; d: number; arg?: number }): boolean | null {
  const d = decksRef[s.d];
  if (!d) return null;
  const pad = /^pad\d$/.test(s.a);
  if (pad) return d.hot[s.arg ?? 0] != null && d.padMode === 'hot';
  switch (s.a) {
    case 'play': return d.playing;
    case 'sync': return d.syncOn;
    case 'keylock': return d.keyLock;
    case 'loop': return d.loopOn;
    case 'vinyl': return d.vinyl;
    case 'slip': return d.slip;
    case 'reverse': return d.reverse;
    case 'censor': return d.censor;
    case 'fx': return d.fxOn;
    case 'pfl': return d.pfl;
    case 'quantize': return d.quantize;
    default: return null;
  }
}

const lastLit = new Map<string, boolean>();

/** Send the light state of every bound button to the controller (only when it changes). */
function ledTick(): void {
  if (!outputs.length) return;
  for (const b of midiCfg.bindings) {
    if (!b.target.startsWith('slot:')) continue;
    const p = b.key.split(':');
    if (p[0] !== 'note' && p[0] !== 'cc') continue;
    const s = slotById(b.target.slice(5), keymapCfg.ov);
    if (!s) continue;
    const lit = litOf({ a: s.a, d: s.d, arg: s.arg });
    if (lit == null || lastLit.get(b.key) === lit) continue;
    lastLit.set(b.key, lit);
    const ch = +p[1], num = +p[2], v = lit ? 127 : 0;
    const msg = p[0] === 'note' ? [0x90 | ch, num, v] : [0xb0 | ch, num, v];
    for (const o of outputs) { try { o.send(msg); } catch { /* device went away */ } }
  }
}

/** Testing and tools: use these outputs instead of the browser's (e.g. a fake one). */
export function setLedOutputs(list: MidiOutputLike[]): void { outputs = list; lastLit.clear(); }

let started = false;
/** Start the background loops (light updates). Gamepads start with startGamepads(). */
export function startControllers(ds: Deck[]): void {
  setMidiDecks(ds);
  if (started) return;
  started = true;
  setInterval(ledTick, 60);
}

/* ---------- save / load as a file-like text ---------- */

export function exportMidi(): string { return JSON.stringify(midiCfg.bindings, null, 2); }

export function importMidi(text: string): boolean {
  try {
    const o = JSON.parse(text);
    if (!Array.isArray(o) || !o.every(b => typeof b?.key === 'string' && typeof b?.target === 'string')) return false;
    midiCfg.bindings = o; save(); notify();
    return true;
  } catch { return false; }
}
