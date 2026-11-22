import { engine, ramp } from './context';
import type { BeatFxIn } from './worklets/protocol';

/**
 * RİTİM FX: one beat-synced effect unit, inserted on deck A, deck B or the master.
 *
 *   target in ─┬─ dry ───────────────────────────────┬─► target out
 *              ├─ send ► echo / reverb / spiral ► wet ┤   (sends: the tail keeps ringing after OFF)
 *              ├─ send ► flanger / phaser ► wet ──────┤
 *              ├─ send ► sweep filter ► wet ──────────┤   (replaces the dry signal while on)
 *              └─ beatfx worklet (roll, gate, brake, pitch) ┘  (mixes dry itself)
 *
 * Every time value follows the tempo: `beat` (seconds per beat, real time) and `anchor`
 * (AudioContext time of a beat line) come from the target deck's beatgrid every frame.
 */

export type FxId = 'echo' | 'reverb' | 'flanger' | 'phaser' | 'roll' | 'gate' | 'spiral' | 'sweep' | 'pitch' | 'brake';
export type FxTarget = 'A' | 'B' | 'M';

export const FX_LIST: { id: FxId; label: string; beats: number; help: string }[] = [
  { id: 'echo', label: 'ECHO', beats: 0.75, help: 'Vuruşa oturan yankı; kapatınca kuyruğu doğal söner' },
  { id: 'reverb', label: 'REVERB', beats: 2, help: 'Salon yankısı; vuruş uzunluğu yankının süresi' },
  { id: 'flanger', label: 'FLANGER', beats: 4, help: 'Jet uçağı gibi süzülen ses; vuruş = bir tur süresi' },
  { id: 'phaser', label: 'PHASER', beats: 4, help: 'Dönen, su altı gibi ses; vuruş = bir tur süresi' },
  { id: 'roll', label: 'ROLL', beats: 0.5, help: 'Son vuruştaki parçayı tekrar eder; kapatınca müzik akışına döner' },
  { id: 'gate', label: 'GATE', beats: 0.25, help: 'Sesi vuruşa göre aç-kapa keser (trans etkisi)' },
  { id: 'spiral', label: 'SPİRAL', beats: 0.5, help: 'Kendi içine dönen, dalgalanan yankı' },
  { id: 'sweep', label: 'SWEEP', beats: 4, help: 'Filtre vuruşla birlikte aşağı yukarı gezinir' },
  { id: 'pitch', label: 'PITCH', beats: 1, help: 'Sesin tonunu değiştirir; SEVİYE = −12…+12 yarım ses' },
  { id: 'brake', label: 'FREN', beats: 2, help: 'Plak çalar kapanır gibi yavaşlayıp durur; kapatınca geri gelir' },
];
export const FX_BEATS = [1 / 16, 1 / 8, 1 / 4, 1 / 2, 3 / 4, 1, 2, 4, 8, 16];

const WORKLET_FX: FxId[] = ['roll', 'gate', 'brake', 'pitch'];
const isWorklet = (id: FxId) => WORKLET_FX.includes(id);

/** What the SEVİYE knob means for each effect, as shown next to it. */
export function levelText(id: FxId, level: number): string {
  if (id === 'pitch') { const s = pitchSemis(level); return (s > 0 ? '+' : s < 0 ? '−' : '') + Math.abs(s) + ' yarım ses'; }
  if (id === 'brake' || id === 'roll') return '—';
  return '%' + Math.round(level * 100);
}
export const pitchSemis = (level: number): number => Math.round(level * 24 - 12);

/** Stereo reverb impulse: decaying noise, a little different in each ear. */
export function impulse(ctx: BaseAudioContext, sec: number): AudioBuffer {
  const n = Math.max(1, Math.floor(sec * ctx.sampleRate)), b = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = b.getChannelData(c);
    let s = 1234 + c * 999;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      d[i] = ((s / 2147483647) * 2 - 1) * Math.pow(1 - i / n, 2.5) * 0.5;
    }
  }
  return b;
}

class Lfo {
  private osc?: OscillatorNode;
  readonly out: GainNode;
  constructor(private ctx: AudioContext, depth: number, private targets: AudioParam[]) {
    this.out = ctx.createGain(); this.out.gain.value = depth;
    for (const t of targets) this.out.connect(t);
  }
  /** (Re)start at the next beat line so the sweep is in phase with the music. */
  start(period: number, anchor: number): void {
    this.stop();
    const c = this.ctx, o = c.createOscillator();
    o.frequency.value = 1 / period;
    const now = c.currentTime, k = Math.ceil((now - anchor) / period + 1e-6);
    o.connect(this.out);
    o.start(Math.max(now, anchor + k * period));
    this.osc = o;
  }
  setPeriod(p: number): void { if (this.osc) ramp(this.osc.frequency, 1 / p, 0.05); }
  stop(): void { try { this.osc?.stop(); } catch { /* not started */ } this.osc?.disconnect(); this.osc = undefined; }
}

export class RitimFx {
  fx: FxId = 'echo';
  beats = 0.75;
  level = 0.6;
  on = false;
  target: FxTarget = 'M';
  beat = 0.5;
  anchor = 0;

  private ctx!: AudioContext;
  private input!: GainNode; private output!: GainNode; private dry!: GainNode;
  private node!: AudioWorkletNode;
  private paths = new Map<FxId, { send: GainNode; wet: GainNode; lfo?: Lfo; delay?: DelayNode; conv?: ConvolverNode; filt?: BiquadFilterNode }>();
  private wiredTo: { in: AudioNode; out: AudioNode } | null = null;
  private irLen = 0;
  private irTimer?: ReturnType<typeof setTimeout>;
  /** where the unit can be inserted */
  points: Record<FxTarget, { in: GainNode; out: GainNode } | null> = { A: null, B: null, M: null };

  build(ctx: AudioContext): void {
    this.ctx = ctx;
    const g = (v = 0) => { const x = ctx.createGain(); x.gain.value = v; return x; };
    this.input = g(1); this.output = g(1); this.dry = g(1);
    this.input.connect(this.dry).connect(this.output);

    const add = (id: FxId, send: GainNode, wet: GainNode, extra: object = {}) => {
      this.input.connect(send); wet.connect(this.output);
      this.paths.set(id, { send, wet, ...extra });
    };
    // echo
    {
      const send = g(), wet = g(), d = ctx.createDelay(8), fb = g(0.5), lp = ctx.createBiquadFilter();
      lp.frequency.value = 7000;
      send.connect(d); d.connect(lp).connect(fb).connect(d); d.connect(wet);
      add('echo', send, wet, { delay: d });
    }
    // reverb
    {
      const send = g(), wet = g(), conv = ctx.createConvolver();
      send.connect(conv).connect(wet);
      add('reverb', send, wet, { conv });
    }
    // spiral: feedback echo whose time wobbles, so every repeat bends in pitch
    {
      const send = g(), wet = g(), d = ctx.createDelay(8), fb = g(0.72), hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 250;
      send.connect(d); d.connect(hp).connect(fb).connect(d); d.connect(wet);
      add('spiral', send, wet, { delay: d, lfo: new Lfo(ctx, 0.004, [d.delayTime]) });
    }
    // flanger
    {
      const send = g(), wet = g(), d = ctx.createDelay(0.05), fb = g(0.55);
      d.delayTime.value = 0.004;
      send.connect(d); d.connect(fb).connect(d); d.connect(wet);
      add('flanger', send, wet, { delay: d, lfo: new Lfo(ctx, 0.0032, [d.delayTime]) });
    }
    // phaser: 6 all-pass stages swept together
    {
      const send = g(), wet = g(), stages: BiquadFilterNode[] = [];
      let prev: AudioNode = send;
      for (let i = 0; i < 6; i++) {
        const ap = ctx.createBiquadFilter(); ap.type = 'allpass'; ap.frequency.value = 900; ap.Q.value = 0.7;
        prev.connect(ap); prev = ap; stages.push(ap);
      }
      prev.connect(wet);
      add('phaser', send, wet, { lfo: new Lfo(ctx, 1800, stages.map(s => s.detune)) });
    }
    // sweep: resonant low-pass moving with the beat
    {
      const send = g(), wet = g(), f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 1500; f.Q.value = 5;
      send.connect(f).connect(wet);
      add('sweep', send, wet, { filt: f, lfo: new Lfo(ctx, 2400, [f.detune]) });
    }
    // worklet effects
    this.node = new AudioWorkletNode(ctx, 'beatfx', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    const wSend = g(), wWet = g();
    wSend.connect(this.node).connect(wWet);
    add('roll', wSend, wWet);
    for (const id of ['gate', 'brake', 'pitch'] as FxId[]) this.paths.set(id, this.paths.get('roll')!);
    this.apply();
  }

  get ready(): boolean { return !!this.ctx; }

  /** Insert the unit at deck A, deck B or the master. */
  setTarget(t: FxTarget): void {
    this.target = t;
    if (!this.ctx) return;
    const p = this.points[t];
    if (!p) return;
    if (this.wiredTo) {
      const old = this.wiredTo;
      old.in.disconnect(this.input); this.output.disconnect(old.out); old.in.connect(old.out);
    }
    p.in.disconnect(p.out);
    p.in.connect(this.input); this.output.connect(p.out);
    this.wiredTo = p;
  }

  /** Tempo of the music the effect sits on (called every frame; cheap when nothing changed). */
  setTempo(beat: number, anchor: number): void {
    const d = (anchor - this.anchor) / beat;
    const moved = Math.abs(beat - this.beat) > this.beat * 0.002 || Math.abs(d - Math.round(d)) > 0.01;
    if (!moved) return;
    this.beat = beat; this.anchor = anchor;
    this.apply(false);
  }

  setFx(id: FxId): void {
    const wasOn = this.on;
    if (wasOn) { this.on = false; this.apply(); }
    this.fx = id;
    this.beats = FX_LIST.find(f => f.id === id)!.beats;
    if (wasOn) this.on = true;
    this.apply();
  }

  setBeats(b: number): void { this.beats = b; this.apply(); }
  setLevel(v: number): void { this.level = v; this.apply(false); }
  setOn(on: boolean): void { this.on = on; this.apply(); }

  private period(): number { return this.beat * this.beats; }

  /** Push the whole state into the audio graph. `restart` = re-align LFOs to the beat. */
  private apply(restart = true): void {
    if (!this.ctx) return;
    const id = this.fx, on = this.on, lv = this.level, per = this.period(), tc = 0.01;
    for (const [pid, p] of this.paths) {
      const active = pid === id || (isWorklet(pid) && isWorklet(id));
      if (!active) {
        // tails (echo, reverb, spiral) keep ringing: only stop feeding them
        ramp(p.send.gain, 0, tc);
        if (!['echo', 'reverb', 'spiral'].includes(pid)) ramp(p.wet.gain, 0, tc);
        if (pid !== id) p.lfo?.stop();
      }
    }
    const p = this.paths.get(id)!;
    const sendOnly = id === 'echo' || id === 'reverb' || id === 'spiral';
    if (isWorklet(id)) {
      ramp(this.dry.gain, 0, tc); ramp(p.send.gain, 1, tc); ramp(p.wet.gain, 1, tc);
      const amount = id === 'pitch' ? pitchSemis(lv) : id === 'gate' ? Math.min(1, 0.3 + lv) : 1;
      const m: BeatFxIn = { mode: id as BeatFxIn['mode'], on, beat: this.beat, anchor: this.anchor, len: this.beats, amount };
      this.node.port.postMessage(m);
      return;
    }
    if (sendOnly) {
      ramp(this.dry.gain, 1, tc);
      ramp(p.send.gain, on ? 1 : 0, tc);
      ramp(p.wet.gain, lv, tc);
      if (p.delay) ramp(p.delay.delayTime, Math.min(7.9, per), 0.03);
      if (id === 'reverb') this.updateReverb(Math.min(8, Math.max(0.6, per * 1.5)));
      if (id === 'spiral' && p.lfo) { if (on && restart) p.lfo.start(this.beat * 4, this.anchor); else p.lfo.setPeriod(this.beat * 4); }
      return;
    }
    // modulation effects: flanger, phaser (blended), sweep (replaces dry)
    const replace = id === 'sweep';
    ramp(this.dry.gain, replace && on ? 0 : 1, tc);
    ramp(p.send.gain, on ? 1 : 0, tc);
    ramp(p.wet.gain, on ? (replace ? 1 : 0.4 + 0.6 * lv) : 0, tc);
    if (p.lfo) {
      const depth = id === 'sweep' ? 600 + 3000 * lv : id === 'phaser' ? 600 + 2400 * lv : 0.0008 + 0.0032 * lv;
      ramp(p.lfo.out.gain, depth, 0.03);
      if (on && restart) p.lfo.start(per, this.anchor); else if (on) p.lfo.setPeriod(per); else p.lfo.stop();
    }
  }

  private updateReverb(sec: number): void {
    if (Math.abs(sec - this.irLen) < 0.05) return;
    this.irLen = sec;
    clearTimeout(this.irTimer);
    // rebuilding the impulse is a bit heavy: wait until the length stops changing
    this.irTimer = setTimeout(() => { const c = this.paths.get('reverb')!.conv!; c.buffer = impulse(this.ctx, sec); }, 120);
  }
}

export const ritimFx = new RitimFx();

/** Make master insert points once the context exists. */
export function buildFxPoints(): void {
  const c = engine.ctx!;
  ritimFx.points.M = { in: engine.fxIn!, out: engine.fxOut! };
  ritimFx.build(c);
}
