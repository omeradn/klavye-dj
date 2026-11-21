import deckWorkletUrl from './worklets/deck-processor.ts?worker&url';
import limiterWorkletUrl from './worklets/limiter-processor.ts?worker&url';
import type { LimiterStats } from './worklets/protocol';

/**
 * Shared AudioContext + master bus:
 *   decks -> bus -> master (volume) -> limiter (worklet) -> speakers
 * Created lazily on the first user gesture (browser autoplay rules).
 */
export const engine: {
  ctx: AudioContext | null;
  bus: GainNode | null;
  master: GainNode | null;
  limiter: AudioWorkletNode | null;
  ready: Promise<void> | null;
  meter: { gr: number; peakIn: number; peakOut: number; overAt: number; limitAt: number };
} = {
  ctx: null, bus: null, master: null, limiter: null, ready: null,
  meter: { gr: 1, peakIn: 0, peakOut: 0, overAt: -1e9, limitAt: -1e9 },
};

const hooks: ((ctx: AudioContext) => void)[] = [];

/** Run `fn` once the AudioContext and its worklets are ready (deck wiring, mixer, etc.). */
export function onCtxCreated(fn: (ctx: AudioContext) => void): void {
  hooks.push(fn);
}

export function ensureCtx(): AudioContext {
  if (engine.ctx) {
    if (engine.ctx.state === 'suspended') void engine.ctx.resume();
    return engine.ctx;
  }
  const ctx = new AudioContext({ latencyHint: 'interactive' });
  engine.ctx = ctx;
  engine.bus = ctx.createGain();
  engine.master = ctx.createGain();
  engine.bus.connect(engine.master);
  engine.ready = (async () => {
    await ctx.audioWorklet.addModule(deckWorkletUrl);
    await ctx.audioWorklet.addModule(limiterWorkletUrl);
    const lim = new AudioWorkletNode(ctx, 'limiter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    lim.port.onmessage = e => {
      const s = e.data as LimiterStats, m = engine.meter, now = performance.now();
      m.gr = s.gr; m.peakIn = s.peakIn; m.peakOut = s.peakOut;
      if (s.peakIn > 1) m.overAt = now;          // would have clipped without the limiter
      if (s.gr < 0.89) m.limitAt = now;          // more than 1 dB of limiting
    };
    engine.master!.connect(lim).connect(ctx.destination);
    engine.limiter = lim;
    hooks.forEach(h => h(ctx));
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
