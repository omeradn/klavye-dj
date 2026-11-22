import type { Deck } from '../engine/deck';
import { ensureCtx } from '../engine/context';

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
  ['jumpFwd', 'Digit5', 'Digit6', 0, 'Beat jump ileri (loop boyu kadar)'], ['jumpBack', 'Digit5', 'Digit6', 1, 'Beat jump geri'],
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
  ['hot0', 'Digit1', 'Digit7', 0, 'Hot cue 1 (boşsa kaydet)'], ['hot1', 'Digit2', 'Digit8', 0, 'Hot cue 2'],
  ['hot2', 'Digit3', 'Digit9', 0, 'Hot cue 3'], ['hot3', 'Digit4', 'Digit0', 0, 'Hot cue 4'],
  ['hotDel', 'Digit1', 'Digit7', 1, 'Hot cue sil (Shift + 1-4 / 7-0)'],
];

export const HOT_KEYS = [['Digit1', 'Digit2', 'Digit3', 'Digit4'], ['Digit7', 'Digit8', 'Digit9', 'Digit0']];

interface KEntry { d: number; a: string; arg?: number; mode?: KeyMode }

/** code (+ "+S" for the shift layer) -> action */
export function buildKeymap(): Record<string, KEntry> {
  const K: Record<string, KEntry> = {};
  for (const [a, ka, kb, sh, , mode] of BIND) {
    const sfx = sh ? '+S' : '';
    if (a === 'hotDel') {
      for (let i = 0; i < 4; i++) {
        K[HOT_KEYS[0][i] + '+S'] = { d: 0, a: 'hotDel', arg: i };
        K[HOT_KEYS[1][i] + '+S'] = { d: 1, a: 'hotDel', arg: i };
      }
    } else if (a.startsWith('hot')) {
      const i = +a[3];
      K[ka + sfx] = { d: 0, a: 'hot', arg: i, mode };
      K[kb + sfx] = { d: 1, a: 'hot', arg: i, mode };
    } else {
      K[ka + sfx] = { d: 0, a, mode };
      K[kb + sfx] = { d: 1, a, mode };
    }
  }
  return K;
}

function isTyping(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !['radio', 'checkbox', 'range', 'button'].includes((el as HTMLInputElement).type)));
}

export function setupKeyboard(decks: Deck[], global: Record<string, (e: KeyboardEvent) => void>): void {
  const KMAP = buildKeymap();

  // A mouse click leaves the button focused; Space/Enter would then re-trigger it
  // (e.g. click PLAY, press Space -> music stops). Drop focus right after a click.
  document.addEventListener('pointerup', e => {
    const b = (e.target as Element | null)?.closest?.('button');
    if (b) setTimeout(() => b.blur(), 0);
  });

  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (isTyping(e.target)) return;   // typing in the library search box
    if ((e.code === 'Space' || e.code === 'Enter') && (e.target as Element)?.closest?.('button')) { e.preventDefault(); return; }
    if (global[e.code]) { e.preventDefault(); ensureCtx(); global[e.code](e); return; }
    // Shift + a key without a shift function falls back to its normal function
    const m = KMAP[e.code + (e.shiftKey ? '+S' : '')] ?? (e.shiftKey ? KMAP[e.code] : undefined);
    if (!m) return;
    e.preventDefault(); ensureCtx();
    if (e.repeat && m.mode !== 'r') return;
    const d = decks[m.d];
    if (m.mode === 'h') d.hold(m.a, true); else d.act(m.a, m.arg);
  });

  document.addEventListener('keyup', e => {
    if (isTyping(e.target)) return;
    const m = KMAP[e.code];
    if (m && m.mode === 'h') decks[m.d].hold(m.a, false);
    if (e.key === 'Shift') decks.forEach(d => { if (d.bend) d.setBend(0); });
  });
}
