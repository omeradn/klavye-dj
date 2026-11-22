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
import { setupLibrary } from './library/library';
import { buildSampler, sampler, setSamplerLevel } from './engine/sampler';
import { buildFxPoints } from './engine/beatfx';
import { setupAcademy, toggleAcademy } from './academy/panel';
import { inLesson, stopLesson } from './academy/engine';
import { chanFxNext, fxBeats, fxFrame, fxLevel, fxNext, fxTarget, fxToggle, mixerFrame, setupFxBar, setupMixerBar, wireFx } from './ui/fxbar';

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
  onCtxCreated(ctx => buildSampler(ctx));
  onCtxCreated(() => buildFxPoints());
  new Knob($('#sampK'), { min: 0, max: 1, def: sampler.level, onchange: setSamplerLevel });
  onCtxCreated(async () => {
    engine.master!.gain.value = masterK.v;
    await Promise.all(decks.map(d => d.wire()));
    mixer.apply();
    wireFx();
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
  // wheel on the scrolling waveforms = zoom (both decks together, so beats stay comparable)
  document.querySelector('.waves')!.addEventListener('wheel', e => {
    const w = e as WheelEvent;
    w.preventDefault();
    Deck.span = Math.min(40, Math.max(2, Deck.span * (w.deltaY > 0 ? 1.2 : 1 / 1.2)));
  }, { passive: false });

  // phase meter: how far deck B's beats are from deck A's (in ms of real time)
  const phI = $('#phI'), phT = $('#phT');
  const phase = () => {
    const a = decks[0], e = a.phaseDiff();
    if (e == null || !a.grid) { phI.style.display = 'none'; setText(phT, '—'); return; }
    const ms = e * 60 / a.grid.bpm / a.speed() * 1000, ok = Math.abs(ms) < 8;
    phI.style.display = '';
    phI.style.left = 50 + e * 100 + '%';
    phI.className = ok ? 'ok' : Math.abs(ms) < 25 ? 'near' : '';
    setText(phT, ok ? 'hizalı' : `B ${Math.abs(ms).toFixed(0)} ms ${ms > 0 ? 'önde' : 'geride'}`);
  };
  const loop = (now: number) => { decks.forEach(d => d.frame(now)); meter(now); phase(); fxFrame(); mixerFrame(now); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);

  setupKeyboard(decks, {
    ArrowLeft: e => xf.set(e.shiftKey ? -1 : xf.v - 0.1),
    ArrowRight: e => xf.set(e.shiftKey ? 1 : xf.v + 0.1),
    ArrowDown: () => xf.set(0),
    PageUp: () => masterK.nudge(1),
    PageDown: () => masterK.nudge(-1),
    Escape: () => {
      if (settingsOpen()) toggleSettings(false);
      else if (document.querySelector('#academy.show')) toggleAcademy(false);
      else toggleHelp();
    },
    F4: () => { if (inLesson()) stopLesson(); else toggleAcademy(); },
    F1: () => toggleHelp(),
    F2: () => toggleSettings(),
    // RİTİM FX / KANAL FX (keys between and around the decks)
    KeyB: e => { if (e.repeat) return; if (e.shiftKey) fxTarget(); else fxToggle(); },
    Backslash: e => { if (!e.repeat) fxNext(e.shiftKey ? -1 : 1); },
    Minus: e => { if (!e.repeat) fxBeats(-1); },
    Equal: e => { if (!e.repeat) fxBeats(1); },
    Quote: e => fxLevel(e.shiftKey ? -1 : 1),
    ArrowUp: e => { if (!e.repeat) chanFxNext(e.shiftKey ? -1 : 1); },
  });

  // dev-only handle for debugging in the browser console (not in production builds)
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).kdj = { decks, engine, mixer, out: outputNodes };

  setupFxBar(decks);
  setupMixerBar();
  setupAcademy({ decks, mixer, xf });
  setupBadges(decks);
  setupSettings();
  void setupLibrary(decks);
  buildHelpTable();
  $('#keysBtn').onclick = () => document.body.classList.toggle('nokeys');
  $('#helpBtn').onclick = () => toggleHelp();
  $('#helpClose').onclick = () => toggleHelp(false);
}
