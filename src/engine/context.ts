/** Shared AudioContext + master bus. Created lazily on the first user gesture (browser autoplay rules). */
export const engine: { ctx: AudioContext | null; master: GainNode | null } = { ctx: null, master: null };

const hooks: ((ctx: AudioContext) => void)[] = [];

/** Run `fn` once the AudioContext exists (deck wiring, mixer, etc.). */
export function onCtxCreated(fn: (ctx: AudioContext) => void): void {
  hooks.push(fn);
}

export function ensureCtx(): AudioContext {
  if (engine.ctx) {
    if (engine.ctx.state === 'suspended') void engine.ctx.resume();
    return engine.ctx;
  }
  const ctx = new AudioContext();
  engine.ctx = ctx;
  engine.master = ctx.createGain();
  engine.master.connect(ctx.destination);
  hooks.forEach(h => h(ctx));
  return ctx;
}
