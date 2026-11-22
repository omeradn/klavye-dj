import { $, setText, toast } from '../util';
import { Knob } from './controls';
import { engine, ensureCtx } from '../engine/context';
import { FX_BEATS, FX_LIST, levelText, ritimFx, type FxTarget } from '../engine/beatfx';
import { CHAN_FX, chanFx, cycleChanFx } from '../engine/chanfx';
import { beatsLabel } from '../engine/padmodes';
import { phaseAt, pulseLen } from '../analysis/grid';
import type { Deck } from '../engine/deck';

/** The RİTİM FX / KANAL FX bar under the decks, plus its keyboard actions. */

let decks: Deck[] = [];
let levelK: Knob;

const fxInfo = () => FX_LIST.find(f => f.id === ritimFx.fx)!;

export function fxNext(dir: number): void {
  const i = FX_LIST.findIndex(f => f.id === ritimFx.fx);
  ritimFx.setFx(FX_LIST[(i + dir + FX_LIST.length) % FX_LIST.length].id);
  toast(`RİTİM FX: ${fxInfo().label} — ${fxInfo().help}`);
}

export function fxBeats(dir: number): void {
  const i = FX_BEATS.findIndex(b => Math.abs(b - ritimFx.beats) < 1e-6);
  const j = Math.max(0, Math.min(FX_BEATS.length - 1, (i < 0 ? 5 : i) + dir));
  ritimFx.setBeats(FX_BEATS[j]);
}

export function fxToggle(): void {
  ensureCtx();
  ritimFx.setOn(!ritimFx.on);
}

export function fxTarget(t?: FxTarget): void {
  const order: FxTarget[] = ['A', 'B', 'M'];
  ritimFx.setTarget(t ?? order[(order.indexOf(ritimFx.target) + 1) % 3]);
  toast(`RİTİM FX hedefi: ${ritimFx.target === 'M' ? 'MASTER (tüm ses)' : 'Deck ' + ritimFx.target}`);
}

export function fxLevel(dir: number): void { levelK.nudge(dir); }

export function chanFxNext(dir: number): void {
  const id = cycleChanFx(dir), c = CHAN_FX.find(x => x.id === id)!;
  toast(`KANAL FX: ${c.label} — ${c.help}`);
}

/** Tempo for the effect: the target deck, or for MASTER the deck the audience hears. */
function tempoSource(): Deck | null {
  if (ritimFx.target === 'A') return decks[0];
  if (ritimFx.target === 'B') return decks[1];
  const p = decks.filter(d => d.playing && d.has);
  if (p.length === 2) return (p[0].xfG?.gain.value ?? 1) >= (p[1].xfG?.gain.value ?? 1) ? p[0] : p[1];
  return p[0] ?? (decks.find(d => d.has) ?? null);
}

/** Called every animation frame. */
export function fxFrame(): void {
  const ctx = engine.ctx, d = tempoSource();
  let beat = 0.5, anchor = 0, bpmTxt = '120.0';
  if (ctx && d?.grid) {
    beat = pulseLen(d.grid) / Math.max(0.25, d.speed());
    anchor = ctx.currentTime - phaseAt(d.grid, d.currentTime()) * beat;
    bpmTxt = (60 / beat).toFixed(1);
  }
  if (ritimFx.ready) ritimFx.setTempo(beat, anchor);
  setText($('#fxName'), fxInfo().label);
  setText($('#fxBeats'), beatsLabel(ritimFx.beats));
  setText($('#fxVal'), levelText(ritimFx.fx, ritimFx.level));
  setText($('#fxBpm'), bpmTxt + ' BPM' + (d ? ' · ' + d.id : ''));
  $('#fxOn').classList.toggle('on', ritimFx.on);
  document.querySelectorAll<HTMLElement>('#fxTarget [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === ritimFx.target));
  setText($('#cfxName'), CHAN_FX.find(c => c.id === chanFx.type)!.label);
  // beat light
  const led = $('#fxLed');
  const on = ctx ? (((ctx.currentTime - anchor) / beat) % 1 + 1) % 1 < 0.15 : false;
  led.classList.toggle('on', on);
}

export function setupFxBar(ds: Deck[]): void {
  decks = ds;
  levelK = new Knob($('#fxLevelK'), { min: 0, max: 1, def: 0.6, label: 'SEVİYE', onchange: v => ritimFx.setLevel(v) });
  $('#fxPrev').onclick = () => fxNext(-1);
  $('#fxNext').onclick = () => fxNext(1);
  $('#fxHalf').onclick = () => fxBeats(-1);
  $('#fxDouble').onclick = () => fxBeats(1);
  $('#fxOn').onclick = () => fxToggle();
  $('#fxTarget').onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t as FxTarget | undefined;
    if (t) { ensureCtx(); fxTarget(t); }
  };
  $('#cfxPrev').onclick = () => chanFxNext(-1);
  $('#cfxNext').onclick = () => chanFxNext(1);
  $('#fxName').title = FX_LIST.map(f => `${f.label}: ${f.help}`).join('\n');
  $('#cfxName').title = CHAN_FX.map(c => `${c.label}: ${c.help}`).join('\n');
}

/** Once the audio graph exists: insert points for both decks + master, then wire the unit. */
export function wireFx(): void {
  for (const [i, t] of [[0, 'A'], [1, 'B']] as const) {
    const d = decks[i];
    if (d.insIn && d.insOut) ritimFx.points[t] = { in: d.insIn, out: d.insOut };
  }
  ritimFx.setTarget(ritimFx.target);
}
