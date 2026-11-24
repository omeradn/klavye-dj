/**
 * Key map: the default table (BIND), the user's changes to it (rebinding, saved in the browser),
 * and the label layout. Pure logic only, so it can be unit-tested.
 */

/** r = key repeat allowed, h = hold (active while pressed) */
export type KeyMode = 'r' | 'h';
/** [action, key on deck A, key on deck B, shift layer?, help label, mode] — keys are physical KeyboardEvent.code values */
export type Bind = [action: string, keyA: string, keyB: string, shift: 0 | 1, label: string, mode?: KeyMode];

export const BIND: Bind[] = [
  ['play', 'KeyQ', 'KeyY', 0, 'Çal / Durdur'], ['load', 'KeyQ', 'KeyY', 1, 'Şarkı yükle'],
  ['cue', 'KeyW', 'KeyU', 0, 'CUE (dururken koy · çalarken dön · cue üstünde basılı tut = dinle)', 'h'],
  ['brake', 'KeyW', 'KeyU', 1, 'BRAKE (plak gibi yavaşça dur)'],
  ['vinyl', 'KeyR', 'KeyO', 1, 'VINYL modu (jog ile scratch)'],
  ['reverse', 'Tab', 'BracketLeft', 0, 'REV (ters çal)'], ['slip', 'Tab', 'BracketLeft', 1, 'SLIP modu'],
  ['censor', 'IntlBackslash', 'Slash', 0, 'CENSOR (basılı tut)', 'h'], ['spinback', 'IntlBackslash', 'Slash', 1, 'SPIN (geri savurup dur)'],
  ['keyUp', 'Backquote', 'BracketRight', 0, 'Ton +1 yarım ses'], ['keyDown', 'Backquote', 'BracketRight', 1, 'Ton −1 yarım ses'],
  ['padModeNext', 'Digit5', 'Digit6', 0, 'Pad modu: sonraki (HOT CUE → LOOP → JUMP → SLICER → ROLL → SAMPLER → TON)'],
  ['padModePrev', 'Digit5', 'Digit6', 1, 'Pad modu: önceki'],
  ['sync', 'KeyE', 'KeyI', 0, 'SYNC (tempo + vuruş kilidi · tekrar bas = kapat)'], ['keylock', 'KeyE', 'KeyI', 1, 'Key Lock'],
  ['loop', 'KeyR', 'KeyO', 0, 'Loop aç / kapat'], ['loopDouble', 'KeyT', 'KeyP', 0, 'Loop ×2'], ['loopHalf', 'KeyT', 'KeyP', 1, 'Loop ½'],
  ['tempoDown', 'KeyA', 'KeyH', 0, 'Tempo −', 'r'], ['tempoUp', 'KeyS', 'KeyJ', 0, 'Tempo +', 'r'],
  ['bendDown', 'KeyD', 'KeyK', 0, 'Pitch bend − (basılı tut)', 'h'], ['bendUp', 'KeyF', 'KeyL', 0, 'Pitch bend + (basılı tut)', 'h'],
  ['tempoReset', 'KeyG', 'Semicolon', 0, 'Tempo sıfırla'],
  ['faderDown', 'KeyA', 'KeyH', 1, 'Kanal fader −', 'r'], ['faderUp', 'KeyS', 'KeyJ', 1, 'Kanal fader +', 'r'],
  ['filterDown', 'KeyD', 'KeyK', 1, 'Filtre ← (low-pass)', 'r'], ['filterUp', 'KeyF', 'KeyL', 1, 'Filtre → (high-pass)', 'r'],
  ['filterReset', 'KeyG', 'Semicolon', 1, 'Filtre ortala'],
  ['killLow', 'KeyZ', 'KeyN', 0, 'LOW kill'], ['killMid', 'KeyX', 'KeyM', 0, 'MID kill'], ['killHigh', 'KeyC', 'Comma', 0, 'HI kill'],
  ['eqReset', 'KeyZ', 'KeyN', 1, 'EQ sıfırla'], ['fx', 'KeyV', 'Period', 0, 'ECHO aç / kapat'],
  ['pfl', 'KeyV', 'Period', 1, 'Kulaklık CUE (bu kanalı kulaklıkta dinle)'],
  ['fxDown', 'KeyX', 'KeyM', 1, 'ECHO seviye −', 'r'], ['fxUp', 'KeyC', 'Comma', 1, 'ECHO seviye +', 'r'],
  ['pad0', 'Digit1', 'Digit7', 0, 'Pad 1', 'h'], ['pad1', 'Digit2', 'Digit8', 0, 'Pad 2', 'h'],
  ['pad2', 'Digit3', 'Digit9', 0, 'Pad 3', 'h'], ['pad3', 'Digit4', 'Digit0', 0, 'Pad 4', 'h'],
  ['pad4', 'Digit1', 'Digit7', 1, 'Pad 5', 'h'], ['pad5', 'Digit2', 'Digit8', 1, 'Pad 6', 'h'],
  ['pad6', 'Digit3', 'Digit9', 1, 'Pad 7', 'h'], ['pad7', 'Digit4', 'Digit0', 1, 'Pad 8', 'h'],
];

export const HOT_KEYS = [['Digit1', 'Digit2', 'Digit3', 'Digit4'], ['Digit7', 'Digit8', 'Digit9', 'Digit0']];

/** What a key does: deck, action (pad keys use 'pad'), pad index, mode */
export interface KEntry { d: number; a: string; arg?: number; mode?: KeyMode }

/** One bindable control on one deck (a row of BIND, for deck A or B). */
export interface Slot { id: string; d: number; sh: 0 | 1; a: string; arg?: number; mode?: KeyMode; label: string; code: string }

export interface Overrides { keys: Record<string, string>; layout: 'tr' | 'us' }

export const bindId = (a: string, sh: number, d: number): string => `${a}|${sh}|${d}`;

const ALL_IDS = new Set<string>();
for (const r of BIND) { ALL_IDS.add(bindId(r[0], r[3], 0)); ALL_IDS.add(bindId(r[0], r[3], 1)); }

/** Keys held by the user: id -> code ('' = unbound). */
export const EMPTY: Overrides = { keys: {}, layout: 'tr' };

/** Keep only valid entries (ids that exist, codes that look like key codes). */
export function sanitize(o: unknown): Overrides {
  const r = (o && typeof o === 'object' ? o : {}) as { keys?: unknown; layout?: unknown };
  const keys: Record<string, string> = {};
  if (r.keys && typeof r.keys === 'object') {
    for (const [k, v] of Object.entries(r.keys as Record<string, unknown>)) {
      if (ALL_IDS.has(k) && typeof v === 'string' && /^[A-Za-z0-9]*$/.test(v)) keys[k] = v;
    }
  }
  return { keys, layout: r.layout === 'us' ? 'us' : 'tr' };
}

/** The code a slot uses now (user's choice, or the default). */
export function codeOf(row: Bind, d: number, ov: Overrides = EMPTY): string {
  const id = bindId(row[0], row[3], d);
  return id in ov.keys ? ov.keys[id] : (d ? row[2] : row[1]);
}

/** Every bindable control with its current key. */
export function slots(ov: Overrides = EMPTY): Slot[] {
  const out: Slot[] = [];
  for (const r of BIND) {
    for (const d of [0, 1]) {
      const pad = /^pad\d$/.test(r[0]);
      out.push({
        id: bindId(r[0], r[3], d), d, sh: r[3], a: r[0], label: r[4], mode: r[5],
        arg: pad ? +r[0].slice(3) : undefined, code: codeOf(r, d, ov),
      });
    }
  }
  return out;
}

export const slotById = (id: string, ov: Overrides = EMPTY): Slot | undefined => slots(ov).find(s => s.id === id);

/** code (+ "+S" on the shift layer) -> what it does. Empty codes are skipped. */
export function buildKeymap(ov: Overrides = EMPTY): Record<string, KEntry> {
  const K: Record<string, KEntry> = {};
  for (const s of slots(ov)) {
    if (!s.code) continue;
    const key = s.code + (s.sh ? '+S' : '');
    K[key] = s.arg != null ? { d: s.d, a: 'pad', arg: s.arg, mode: s.mode } : { d: s.d, a: s.a, mode: s.mode };
  }
  return K;
}

/**
 * Set a slot's key. The keyboard is one shared table (key -> action) for both decks, so a key
 * can do one thing in total per shift layer: the other slot that had it loses its key
 * (returned as `displaced`, so the UI can say so).
 */
export function applyKey(ov: Overrides, id: string, code: string): { ov: Overrides; displaced: Slot | null } {
  const all = slots(ov), me = all.find(s => s.id === id);
  if (!me) return { ov, displaced: null };
  const other = code ? all.find(s => s.id !== id && s.sh === me.sh && s.code === code) ?? null : null;
  const keys = { ...ov.keys, [id]: code };
  if (other) keys[other.id] = '';
  return { ov: { ...ov, keys }, displaced: other };
}

/** Back to the default key table (layout kept). */
export const resetKeys = (ov: Overrides): Overrides => ({ keys: {}, layout: ov.layout });

/* ---------------- saved state ---------------- */

const KEY = 'klavye-dj.keys';

function load(): Overrides {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) ?? 'null')); } catch { return { ...EMPTY, keys: {} }; }
}

export const keymapCfg = {
  ov: load(),
  /** true while the control panel is waiting for a key: the keyboard handler stays quiet */
  capturing: false,
  listeners: [] as (() => void)[],
};

export function setKeymap(ov: Overrides): void {
  keymapCfg.ov = ov;
  try { localStorage.setItem(KEY, JSON.stringify(ov)); } catch { /* private mode: keep in memory */ }
  for (const f of keymapCfg.listeners) f();
}

export function onKeymapChange(fn: () => void): void { keymapCfg.listeners.push(fn); }
