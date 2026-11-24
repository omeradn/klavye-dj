/**
 * MIDI: parse messages, bind any knob / fader / button to a control ("MIDI Learn"), and run it.
 * Targets are either a key-map control (slot:<id>, runs exactly like the keyboard key) or a
 * continuous control registered by the app (cont:<id>, a knob or fader with its range).
 * Pure parts (parse, keys, binding rules) are unit-tested.
 */
import type { Deck } from '../engine/deck';
import { slots, keymapCfg, slotById } from '../input/keymap';
import { pressSlot } from '../input/keyboard';

export interface MidiMsg { kind: 'note' | 'cc' | 'pb'; ch: number; num: number; value: number }

/** note: value = velocity (0 = off) · cc: 0..127 · pb (pitch bend): 0..16383 */
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

/** 0..1 position of a knob / fader message. */
export const normalized = (m: MidiMsg): number => Math.min(1, m.value / (m.kind === 'pb' ? 16383 : 127));

/** Is a button pressed by this message? (notes: velocity > 0; CC buttons: value ≥ 64) */
export const isOn = (m: MidiMsg): boolean => m.kind === 'cc' ? m.value >= 64 : m.kind === 'note' ? m.value > 0 : m.value >= 8192;

export function describe(m: MidiMsg): string {
  const kind = m.kind === 'note' ? 'nota' : m.kind === 'cc' ? 'CC' : 'pitch bend';
  return m.kind === 'pb' ? `${kind} · kanal ${m.ch + 1} · ${m.value}` : `${kind} ${m.num} · kanal ${m.ch + 1} · ${m.value}`;
}

export interface MidiBinding { key: string; target: string }

/** A continuous control the app exposes (knob or fader), with its range. */
export interface ContTarget { id: string; label: string; min: number; max: number; set(v: number): void }

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
  status: 'MIDI kapalı — "MIDI\'yi aç" ile kontrolcüyü bağla',
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
  midiCfg.status = 'Şimdi kontrole dokun (knob, fader ya da tuş)…';
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
    return s ? `${s.label} · Deck ${s.d ? 'B' : 'A'}` : '(silinmiş tuş)';
  }
  return conts.get(target.slice(5))?.label ?? '(bilinmeyen kontrol)';
}

/** Everything that can be learned, grouped for the picker. */
export function targetChoices(): { group: string; items: [string, string][] }[] {
  const btn = slots(keymapCfg.ov).map(s => [`slot:${s.id}`, `${s.label} · Deck ${s.d ? 'B' : 'A'}`] as [string, string]);
  return [
    { group: 'Düğmeler (tuş karşılığı)', items: btn },
    { group: 'Kaydırıcılar ve knob\'lar', items: contList().map(c => [`cont:${c.id}`, c.label] as [string, string]) },
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
      if (c) c.set(c.min + normalized(m) * (c.max - c.min));
    }
  }
  notify();
}

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

interface MidiInputLike { name?: string | null; onmidimessage: ((e: { data: Uint8Array }) => void) | null }
interface MidiAccessLike { inputs: Map<string, MidiInputLike>; onstatechange: (() => void) | null }

function attach(acc: MidiAccessLike): void {
  const names: string[] = [];
  acc.inputs.forEach(inp => {
    inp.onmidimessage = e => { const m = parseMidi(e.data); if (m) handleMidi(m); };
    names.push(inp.name ?? 'MIDI cihazı');
  });
  midiCfg.status = names.length ? `Bağlı: ${names.join(', ')}` : 'Kontrolcü bulunamadı — tak ve tekrar dene.';
  notify();
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
