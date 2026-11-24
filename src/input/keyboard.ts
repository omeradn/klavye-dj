import type { Deck } from '../engine/deck';
import { ensureCtx } from '../engine/context';
import { buildKeymap, keymapCfg, onKeymapChange, type KEntry } from './keymap';

export { BIND, HOT_KEYS, type Bind, type KeyMode, type KEntry } from './keymap';

/** Run one control (keyboard or MIDI). `on` = pressed / released. `alt` = Backspace held (pads' second function). */
export function pressSlot(decks: Deck[], m: KEntry, on: boolean, alt = false): void {
  const d = decks[m.d];
  if (m.a === 'pad') {
    if (on && alt) d.padAlt(m.arg!);
    else if (on || !alt) d.pad(m.arg!, on);
  } else if (m.mode === 'h') d.hold(m.a, on);
  else if (on) d.act(m.a, m.arg);
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button'].includes((el as HTMLInputElement).type)));
}

export function setupKeyboard(decks: Deck[], global: Record<string, (e: KeyboardEvent) => void>): void {
  let KMAP = buildKeymap(keymapCfg.ov);
  onKeymapChange(() => { KMAP = buildKeymap(keymapCfg.ov); });

  // A mouse click leaves the button focused; Space/Enter would then re-trigger it
  // (e.g. click PLAY, press Space -> music stops). Drop focus right after a click.
  document.addEventListener('pointerup', e => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b) setTimeout(() => b.blur(), 0);
  });

  // keys held down: the release goes to whatever the key started (even if Shift changed meanwhile)
  const held = new Map<string, KEntry>();
  /** Backspace held = pads do their second function (delete hot cue / load own sampler sound) */
  let alt = false;

  document.addEventListener('keydown', e => {
    if (keymapCfg.capturing) return;  // the control panel is asking for a new key
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;   // typing in the library search box
    if (e.code === 'Backspace') { alt = true; e.preventDefault(); return; }
    if ((e.code === 'Space' || e.code === 'Enter') && (e.target as Element)?.closest?.('button')) { e.preventDefault(); return; }
    if (global[e.code]) { e.preventDefault(); ensureCtx(); global[e.code](e); return; }
    // Shift + a key without a shift function falls back to its normal function
    const m = KMAP[e.code + (e.shiftKey ? '+S' : '')] ?? (e.shiftKey ? KMAP[e.code] : undefined);
    if (!m) return;
    e.preventDefault(); ensureCtx();
    if (e.repeat && m.mode !== 'r') return;
    if (m.mode === 'h') held.set(e.code, m);
    pressSlot(decks, m, true, alt);
  });

  document.addEventListener('keyup', e => {
    if (e.code === 'Backspace') { alt = false; return; }
    const m = held.get(e.code);
    if (m) { held.delete(e.code); pressSlot(decks, m, false, alt); }
    if (e.key === 'Shift') decks.forEach(d => { if (d.bend) d.setBend(0); });
  });
  // window lost focus with keys down: release everything (no stuck rolls / bends)
  addEventListener('blur', () => { for (const m of held.values()) pressSlot(decks, m, false, alt); held.clear(); alt = false; });
}
