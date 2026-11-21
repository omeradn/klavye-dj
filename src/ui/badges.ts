import type { Deck } from '../engine/deck';
import { BIND, HOT_KEYS } from '../input/keyboard';
import { $, keyLabel } from '../util';

function badge(el: Element | null, txt: string): void {
  if (!el) return;
  const s = document.createElement('span');
  s.className = 'k'; s.textContent = txt;
  el.appendChild(s);
}

/** Small key labels on every control ("Tuş etiketleri" toggles them). */
export function setupBadges(decks: Deck[]): void {
  decks.forEach((d, i) => {
    const kk = (a: string, sh: 0 | 1) => {
      const b = BIND.find(x => x[0] === a && x[3] === sh);
      return b ? (sh ? '⇧' : '') + keyLabel(i ? b[2] : b[1]) : '';
    };
    const q = (a: string) => d.el.querySelector(`[data-a="${a}"]`);
    badge(q('play'), kk('play', 0)); badge(q('load'), kk('load', 1)); badge(q('cue'), kk('cue', 0)); badge(q('sync'), kk('sync', 0));
    badge(q('keylock'), kk('keylock', 1)); badge(q('loop'), kk('loop', 0)); badge(q('loopDouble'), kk('loopDouble', 0)); badge(q('loopHalf'), kk('loopHalf', 1));
    badge(q('tempoReset'), kk('tempoReset', 0)); badge(q('bendDown'), kk('bendDown', 0)); badge(q('bendUp'), kk('bendUp', 0));
    badge(q('tempo'), kk('tempoDown', 0) + '/' + kk('tempoUp', 0));
    badge(q('jumpFwd'), kk('jumpFwd', 0)); badge(q('jumpBack'), kk('jumpBack', 1));
    badge(q('vinyl'), kk('vinyl', 1)); badge(q('slip'), kk('slip', 1)); badge(q('reverse'), kk('reverse', 0));
    badge(q('censor'), kk('censor', 0)); badge(q('brake'), kk('brake', 1)); badge(q('spinback'), kk('spinback', 1));
    badge(q('keyUp'), kk('keyUp', 0)); badge(q('keyDown'), kk('keyDown', 1));
    badge(q('jog'), '🖱 çevir');
    for (let n = 0; n < 4; n++) badge(q('hot' + (n + 1)), keyLabel(HOT_KEYS[i][n]));
    const cq = (a: string) => d.ch.querySelector(`[data-a="${a}"]`);
    badge(cq('killHigh'), kk('killHigh', 0)); badge(cq('killMid'), kk('killMid', 0)); badge(cq('killLow'), kk('killLow', 0));
    badge(cq('filter'), kk('filterDown', 1) + '/' + kk('filterUp', 1).replace('⇧', ''));
    badge(cq('fx'), kk('fx', 0));
    badge(cq('fader'), kk('faderDown', 1) + '/' + kk('faderUp', 1).replace('⇧', ''));
  });
  badge($('#masterK'), 'PgUp/PgDn');
}
