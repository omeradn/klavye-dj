import { $, setText } from './util';
import { Knob, Fader } from './ui/controls';
import { Deck } from './engine/deck';
import { engine, ensureCtx, onCtxCreated, ramp } from './engine/context';
import { Mixer } from './engine/mixer';
import { setupKeyboard } from './input/keyboard';
import { setupBadges } from './ui/badges';
import { buildHelpTable, toggleHelp } from './ui/help';
import { audioSettings } from './engine/settings';
import { buildOutput, outputNodes, phones, setCueMix, setPhonesLevel, setSplit } from './engine/output';
import { settingsOpen, setupSettings, toggleSettings } from './ui/settings';
import { rememberAnalysis, setupLibrary } from './library/library';

let started = false;

/** Wire everything to the static markup rendered by App.svelte. */
export function initApp(): void {
  if (started) return;
  started = true;

  const masterK = new Knob($('#masterK'), {
    min: 0, max: 1, def: 0.85,
    onchange: v => { if (engine.master) ramp(engine.master.gain, v); },
  });
  $('#masterK').dataset.a = 'master';

  const decks = [new Deck('A', 0), new Deck('B', 1)];
  decks[0].other = decks[1];
  decks[1].other = decks[0];

  const mixer = new Mixer(decks);
  const xf = new Fader($('#xf'), { vertical: false, min: -1, max: 1, def: 0, onchange: v => mixer.setXF(v) });
  $('#xf').classList.add('tick');

  // headphones: cue/master blend, level, split
  const cueMixK = new Knob($('#cueMixK'), { min: 0, max: 1, def: 0.5, label: 'CUE ⟷ MST', onchange: setCueMix });
  cueMixK.set(audioSettings.cueMix);
  const phLevelK = new Knob($('#phLevelK'), { min: 0, max: 1, def: 0.8, label: 'SEVİYE', onchange: setPhonesLevel });
  phLevelK.set(audioSettings.phonesLevel);
  const splitBtn = $('#splitBtn');
  splitBtn.onclick = () => { ensureCtx(); setSplit(!phones.split); splitBtn.classList.toggle('on', phones.split); };

  // output first: decks connect to the cue bus it listens to
  onCtxCreated(ctx => buildOutput(ctx));
  onCtxCreated(async () => {
    engine.master!.gain.value = masterK.v;
    await Promise.all(decks.map(d => d.wire()));
    mixer.apply();
  });

  const resize = () => document.querySelectorAll('canvas').forEach(c => {
    c.width = c.clientWidth * devicePixelRatio;
    c.height = c.clientHeight * devicePixelRatio;
  });
  addEventListener('resize', resize);
  resize();

  const led = $('#limLed'), grBar = $('#grBar'), grTxt = $('#grTxt');
  const meter = (now: number) => {
    const m = engine.meter, active = !!engine.limiter;
    const grDb = active ? -20 * Math.log10(m.gr) : 0;
    led.className = !active ? '' : now - m.overAt < 1500 ? 'over' : now - m.limitAt < 400 ? 'limit' : 'ok';
    grBar.style.width = Math.min(100, grDb / 12 * 100) + '%';
    setText(grTxt, (grDb > 0.05 ? '-' : '') + grDb.toFixed(1) + ' dB');
  };
  const loop = (now: number) => { decks.forEach(d => d.frame(now)); meter(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  setupKeyboard(decks, {
    ArrowLeft: e => xf.set(e.shiftKey ? -1 : xf.v - 0.1),
    ArrowRight: e => xf.set(e.shiftKey ? 1 : xf.v + 0.1),
    ArrowDown: () => xf.set(0),
    PageUp: () => masterK.nudge(1),
    PageDown: () => masterK.nudge(-1),
    Escape: () => { if (settingsOpen()) toggleSettings(false); else toggleHelp(); },
    F1: () => toggleHelp(),
    F2: () => toggleSettings(),
  });

  // dev-only handle for debugging in the browser console (not in production builds)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).kdj = { decks, engine, mixer, out: outputNodes };

  setupBadges(decks);
  setupSettings();
  decks.forEach(d => { d.onAnalyzed = rememberAnalysis; });
  void setupLibrary(decks);
  buildHelpTable();
  $('#keysBtn').onclick = () => document.body.classList.toggle('nokeys');
  $('#helpBtn').onclick = () => toggleHelp();
  $('#helpClose').onclick = () => toggleHelp(false);
}
