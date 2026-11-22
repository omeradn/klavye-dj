import deckWorkletUrl from './worklets/deck-processor.ts?worker&url';
import limiterWorkletUrl from './worklets/limiter-processor.ts?worker&url';
import keylockMixWorkletUrl from './worklets/keylock-mix-processor.ts?worker&url';
import beatFxWorkletUrl from './worklets/beatfx-processor.ts?worker&url';
import type { LimiterStats } from './worklets/protocol';
import { audioSettings, LATENCY_HINT } from './settings';

/**
 * Shared AudioContext + master bus:
 *   decks -> bus -> master (volume) -> limiter (worklet) -> output routing (src/engine/output.ts)
 *   decks (pre-fader CUE) -> cueBus -> headphone mix (src/engine/output.ts)
 * Created lazily on the first user gesture (browser autoplay rules).
 */
export const engine: {
  ctx: AudioContext | null;
  bus: GainNode | null;
  /** sum of the channels whose headphone CUE is on (pre-fader) */
  cueBus: GainNode | null;
  /** master insert point for the Ritim FX unit (bus -> fxIn -> fxOut -> master) */
  fxIn: GainNode | null;
  fxOut: GainNode | null;
  /** music level under the microphone (ducking); the mic itself joins after this, at the master */
  duck: GainNode | null;
  master: GainNode | null;
  limiter: AudioWorkletNode | null;
  ready: Promise<void> | null;
  meter: { gr: number; peakIn: number; peakOut: number; overAt: number; limitAt: number };
} = {
  ctx: null, bus: null, cueBus: null, fxIn: null, fxOut: null, duck: null, master: null, limiter: null, ready: null,
  meter: { gr: 1, peakIn: 0, peakOut: 0, overAt: -1e9, limitAt: -1e9 },
};

const hooks: ((ctx: AudioContext) => void | Promise<void>)[] = [];

/** Run `fn` once the AudioContext and its worklets are ready (deck wiring, mixer, etc.). `engine.ready` waits for it. */
export function onCtxCreated(fn: (ctx: AudioContext) => void | Promise<void>): void {
  hooks.push(fn);
}

export function ensureCtx(): AudioContext {
  if (engine.ctx) {
    if (engine.ctx.state === 'suspended') void engine.ctx.resume();
    return engine.ctx;
  }
  const ctx = new AudioContext({ latencyHint: LATENCY_HINT[audioSettings.latency] });
  engine.ctx = ctx;
  engine.bus = ctx.createGain();
  engine.cueBus = ctx.createGain();
  engine.master = ctx.createGain();
  engine.fxIn = ctx.createGain();
  engine.fxOut = ctx.createGain();
  engine.duck = ctx.createGain();
  engine.bus.connect(engine.fxIn).connect(engine.fxOut).connect(engine.duck).connect(engine.master);
  engine.ready = (async () => {
    await ctx.audioWorklet.addModule(deckWorkletUrl);
    await ctx.audioWorklet.addModule(limiterWorkletUrl);
    await ctx.audioWorklet.addModule(keylockMixWorkletUrl);
    await ctx.audioWorklet.addModule(beatFxWorkletUrl);
    const lim = new AudioWorkletNode(ctx, 'limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    lim.port.onmessage = e => {
      const s = e.data as LimiterStats, m = engine.meter, now = performance.now();
      m.gr = s.gr; m.peakIn = s.peakIn; m.peakOut = s.peakOut;
      if (s.peakIn > 1) m.overAt = now;          // would have clipped without the limiter
      if (s.gr < 0.89) m.limitAt = now;          // more than 1 dB of limiting
    };
    engine.master!.connect(lim);   // the output hook connects the limiter to the speakers
    engine.limiter = lim;
    for (const h of hooks) await h(ctx);
  })();
  return ctx;
}

/** Click-free parameter change (short exponential glide instead of a jump). */
export function ramp(p: AudioParam, v: number, tc = 0.008): void {
  const c = engine.ctx;
  if (!c) { p.value = v; return; }
  p.cancelScheduledValues(c.currentTime);
  p.setTargetAtTime(v, c.currentTime, tc);
}
