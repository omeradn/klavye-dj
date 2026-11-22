import { describe, it, expect, beforeAll } from 'vitest';

/**
 * Runs the real AudioWorklet processors in Node with a tiny fake of the worklet globals.
 */
const SR = 48000;
const registry: Record<string, new () => any> = {};

beforeAll(async () => {
  const g = globalThis as any;
  g.sampleRate = SR;
  g.currentTime = 0;
  g.AudioWorkletProcessor = class {
    port: any = { onmessage: null, sent: [] as any[], postMessage(m: any) { this.sent.push(m); } };
  };
  g.registerProcessor = (name: string, ctor: any) => { registry[name] = ctor; };
  await import('../src/engine/worklets/deck-processor');
  await import('../src/engine/worklets/limiter-processor');
  await import('../src/engine/worklets/keylock-mix-processor');
});

/** Render with all deck outputs: main L, wet weight, look-ahead L. */
function renderAll(p: any, blocks: number) {
  const main = new Float32Array(blocks * 128), w = new Float32Array(blocks * 128), ah = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) {
    const o0 = [new Float32Array(128), new Float32Array(128), new Float32Array(128)];
    const o1 = [new Float32Array(128), new Float32Array(128)];
    p.process([], [o0, o1], {});
    main.set(o0[0], b * 128); w.set(o0[2], b * 128); ah.set(o1[0], b * 128);
  }
  return { main, w, ah };
}

const send = (p: any, data: any) => p.port.onmessage({ data });

/** Render `blocks` × 128 frames, return left channel. */
function render(p: any, blocks: number, input?: (i: number) => number): Float32Array {
  const out = new Float32Array(blocks * 128);
  for (let b = 0; b < blocks; b++) {
    const oL = new Float32Array(128), oR = new Float32Array(128);
    let inputs: Float32Array[][] = [[]];
    if (input) {
      const x = new Float32Array(128);
      for (let i = 0; i < 128; i++) x[i] = input(b * 128 + i);
      inputs = [[x, x]];
    }
    p.process(inputs, [[oL, oR]], {});
    out.set(oL, b * 128);
  }
  return out;
}

const maxStep = (a: Float32Array, from = 0) => {
  let m = 0;
  for (let i = from + 1; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - a[i - 1]));
  return m;
};

describe('deck processor', () => {
  // 220 Hz sine, 10 s. A loop length that is NOT a whole number of cycles makes a hard click without crossfade.
  const f = 220, len = SR * 10;
  const sine = () => { const s = new Float32Array(len); for (let i = 0; i < len; i++) s[i] = 0.8 * Math.sin(2 * Math.PI * f * i / SR); return s; };
  const naturalStep = 0.8 * 2 * Math.PI * f / SR; // largest sample-to-sample change of the sine itself

  it('plays forward at tempo', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 99); // state is reported every 3 blocks
    const st = p.port.sent.at(-1);
    expect(st.playing).toBe(true);
    expect(Math.abs(st.pos - 99 * 128)).toBeLessThan(2);
  });

  it('1-beat loop wraps without clicks', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 50);
    const s = 50 * 128 + 37.3, beat = 60 / 124 * SR; // 124 BPM, odd start
    send(p, { t: 'loop', on: true, s, e: s + beat });
    const out = render(p, 2000);                      // ~5.3 s = ~10 loop passes
    const st = p.port.sent.at(-1);
    expect(st.pos).toBeGreaterThanOrEqual(s - 1);
    expect(st.pos).toBeLessThan(s + beat + 1);
    expect(maxStep(out, 500)).toBeLessThan(naturalStep * 1.6);
  });

  it('seek, beat jump and reverse stay click-free', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 100);
    send(p, { t: 'seek', pos: SR * 3.3333 });
    let out = render(p, 100);
    expect(maxStep(out)).toBeLessThan(naturalStep * 1.6);
    send(p, { t: 'jump', d: -SR * 0.97 });
    out = render(p, 100);
    expect(maxStep(out)).toBeLessThan(naturalStep * 1.6);
    const before = p.port.sent.at(-1).pos;
    send(p, { t: 'reverse', on: true });
    render(p, 99);
    expect(p.port.sent.at(-1).pos).toBeLessThan(before);
  });

  it('slip: after a reverse the playhead returns to where the track would be', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'slip', on: true });
    send(p, { t: 'play', on: true });
    render(p, 30);
    const start = p.port.sent.at(-1).pos;
    send(p, { t: 'reverse', on: true });
    render(p, 300);
    send(p, { t: 'reverse', on: false });
    render(p, 3);
    const end = p.port.sent.at(-1).pos;
    expect(Math.abs(end - (start + 303 * 128))).toBeLessThan(400);
  });

  it('roll loops while held and then continues where the song would be (no slip needed)', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 30);
    const start = p.port.sent.at(-1).pos, len = SR * 0.06;      // 1/8 beat at 125 BPM
    send(p, { t: 'roll', on: true, s: start, e: start + len });
    const out = render(p, 300);
    const mid = p.port.sent.at(-1).pos;
    expect(mid).toBeGreaterThanOrEqual(start - 1);
    expect(mid).toBeLessThan(start + len + 1);
    expect(maxStep(out, 10)).toBeLessThan(naturalStep * 1.6);
    send(p, { t: 'roll', on: false, s: 0, e: 0 });
    render(p, 3);
    expect(Math.abs(p.port.sent.at(-1).pos - (start + 303 * 128))).toBeLessThan(400);
  });

  it('slicer jumps into a slice, repeats it, and returns on release', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 60);
    const start = p.port.sent.at(-1).pos, s = SR * 4, e = s + SR * 0.24;
    send(p, { t: 'roll', on: true, s, e, jump: true });
    const out = render(p, 150);
    const mid = p.port.sent.at(-1).pos;
    expect(mid).toBeGreaterThanOrEqual(s - 1);
    expect(mid).toBeLessThan(e + 1);
    expect(maxStep(out)).toBeLessThan(naturalStep * 1.6);
    send(p, { t: 'roll', on: false, s: 0, e: 0 });
    render(p, 3);
    expect(Math.abs(p.port.sent.at(-1).pos - (start + 153 * 128))).toBeLessThan(400);
  });

  it('brake slows to a stop', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sine(), R: sine() });
    send(p, { t: 'play', on: true });
    render(p, 30);
    send(p, { t: 'vinyl', fx: 'brake', dur: 0.5 });
    render(p, Math.ceil(SR * 0.6 / 128));
    const st = p.port.sent.at(-1);
    expect(st.playing).toBe(false);
  });
});

describe('key lock look-ahead', () => {
  const LA = 3840; // 80 ms at 48 kHz
  // non-periodic test signal so a wrong offset can't line up by accident
  const sig = () => {
    const s = new Float32Array(SR * 10);
    for (let i = 0; i < s.length; i++) s[i] = 0.5 * Math.sin(2 * Math.PI * 220 * i / SR) * Math.sin(2 * Math.PI * 0.7 * i / SR) + 0.2 * Math.sin(2 * Math.PI * 1234 * i * i / SR / SR / 20);
    return s;
  };
  const maxDiff = (a: Float32Array, b: Float32Array, from: number, to: number, shift: number) => {
    let m = 0;
    for (let i = from; i < to; i++) m = Math.max(m, Math.abs(a[i] - b[i + shift]));
    return m;
  };

  it('look-ahead output is exactly the main output LA samples later (tempo +5 %)', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sig(), R: sig() });
    send(p, { t: 'keylock', lookahead: LA, wet: true });
    send(p, { t: 'tempo', v: 1.05 });
    send(p, { t: 'play', on: true });
    const { main, w, ah } = renderAll(p, 400);
    expect(maxDiff(ah, main, 2000, 40000, LA)).toBeLessThan(1e-3);
    expect(w[LA + 1000]).toBe(1);   // wet engaged once the shifter has caught up
    expect(w[LA - 500]).toBe(0);    // dry before that
  });

  it('stays aligned through loop wraps, and falls back to dry after a seek', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sig(), R: sig() });
    send(p, { t: 'keylock', lookahead: LA, wet: true });
    send(p, { t: 'play', on: true });
    renderAll(p, 100);
    const s = 100 * 128 + 5000;
    send(p, { t: 'loop', on: true, s, e: s + 23000 });
    const a = renderAll(p, 1000);
    expect(maxDiff(a.ah, a.main, 10000, 100000, LA)).toBeLessThan(1e-3);
    send(p, { t: 'seek', pos: SR * 6 });
    const b = renderAll(p, 60);
    expect(b.w[100]).toBe(0);
    expect(b.w[LA + 2000]).toBe(1);
  });

  it('stays dry while scratching or in reverse', () => {
    const p = new registry.deck();
    send(p, { t: 'load', L: sig(), R: sig() });
    send(p, { t: 'keylock', lookahead: LA, wet: true });
    send(p, { t: 'play', on: true });
    renderAll(p, 100);
    send(p, { t: 'reverse', on: true });
    expect(renderAll(p, 10).w[1000]).toBe(0);
  });

  it('mixer crossfades by the weight channel', () => {
    const m = new registry['keylock-mix']();
    const d = new Float32Array(128).fill(0.2), wv = new Float32Array(128).fill(0.25), wet = new Float32Array(128).fill(0.6);
    const oL = new Float32Array(128), oR = new Float32Array(128);
    m.process([[d, d, wv], [wet, wet]], [[oL, oR]], {});
    expect(oL[5]).toBeCloseTo(0.2 + (0.6 - 0.2) * 0.25, 6);
  });
});

describe('limiter', () => {
  it('never exceeds the ceiling, even with a +6 dB input', () => {
    const p = new registry.limiter();
    const ceil = Math.pow(10, -1 / 20);
    const out = render(p, 400, i => 2 * Math.sin(2 * Math.PI * 100 * i / SR) * (i % 9000 < 50 ? 1.5 : 1));
    let peak = 0;
    for (const v of out) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(ceil + 1e-6);
    expect(peak).toBeGreaterThan(ceil * 0.9);
  });

  it('leaves quiet audio untouched (after the look-ahead delay)', () => {
    const p = new registry.limiter();
    const x = (i: number) => 0.5 * Math.sin(2 * Math.PI * 300 * i / SR);
    const out = render(p, 50, x);
    const look = Math.round(0.003 * SR);
    for (let i = 1000; i < 1100; i++) expect(out[i]).toBeCloseTo(x(i - look), 5);
  });
});
