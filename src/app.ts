import { $ } from './util';
import { Knob, Fader } from './ui/controls';
import { Deck } from './engine/deck';
import { engine, onCtxCreated } from './engine/context';
import { Mixer } from './engine/mixer';
import { setupKeyboard } from './input/keyboard';
import { setupBadges } from './ui/badges';
import { buildHelpTable, toggleHelp } from './ui/help';

let started = false;

/** Wire everything to the static markup rendered by App.svelte. */
export function initApp(): void {
  if (started) return;
  started = true;

  const masterK = new Knob($('#masterK'), {
    min: 0, max: 1, def: 0.85,
    onchange: v => { if (engine.master) engine.master.gain.value = v; },
  });
  $('#masterK').dataset.a = 'master';

  const decks = [new Deck('A', 0), new Deck('B', 1)];
  decks[0].other = decks[1];
  decks[1].other = decks[0];

  const mixer = new Mixer(decks);
  const xf = new Fader($('#xf'), { vertical: false, min: -1, max: 1, def: 0, onchange: v => mixer.setXF(v) });
  $('#xf').classList.add('tick');

  onCtxCreated(() => {
    engine.master!.gain.value = masterK.v;
    decks.forEach(d => d.wire());
    mixer.apply();
  });

  const resize = () => document.querySelectorAll('canvas').forEach(c => {
    c.width = c.clientWidth * devicePixelRatio;
    c.height = c.clientHeight * devicePixelRatio;
  });
  addEventListener('resize', resize);
  resize();

  const loop = (now: number) => { decks.forEach(d => d.frame(now)); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  setupKeyboard(decks, {
    ArrowLeft: e => xf.set(e.shiftKey ? -1 : xf.v - 0.1),
    ArrowRight: e => xf.set(e.shiftKey ? 1 : xf.v + 0.1),
    ArrowDown: () => xf.set(0),
    PageUp: () => masterK.nudge(1),
    PageDown: () => masterK.nudge(-1),
    Escape: () => toggleHelp(),
    F1: () => toggleHelp(),
  });

  setupBadges(decks);
  buildHelpTable();
  $('#keysBtn').onclick = () => document.body.classList.toggle('nokeys');
  $('#helpBtn').onclick = () => toggleHelp();
  $('#helpClose').onclick = () => toggleHelp(false);
}
