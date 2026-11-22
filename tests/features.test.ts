import { describe, it, expect } from 'vitest';
import { computeBands, energyRating } from '../src/analysis/features';
import { PPS } from '../src/analysis/peaks';
import { DEMOS, renderDemo } from '../src/demo/synth';
import { fitsNext, sortTracks, type Track } from '../src/library/model';

const SR = 22050;
const sine = (f: number, sec: number, a = 0.5) => Float32Array.from({ length: sec * SR }, (_, i) => a * Math.sin(2 * Math.PI * f * i / SR));

describe('3-band waveform', () => {
  it('puts a bass tone in the low band and a hiss-like tone in the high band', () => {
    const lo = computeBands(sine(60, 2), SR), hi = computeBands(sine(6000, 2), SR);
    expect(lo.length).toBe(2 * PPS * 3);
    const mid = (b: Float32Array, k: number) => b[100 * 3 + k];
    expect(mid(lo, 0)).toBeGreaterThan(mid(lo, 2) * 5);
    expect(mid(hi, 2)).toBeGreaterThan(mid(hi, 0) * 5);
  });
});

/** Kick every beat + hats every 16th (busy) or a soft kick every bar (calm), at a given level. */
function groove(bpm: number, busy: boolean, level: number, sec = 30): Float32Array {
  const out = new Float32Array(sec * SR), beat = 60 / bpm;
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0; t < sec; t += busy ? beat / 4 : beat * 4) {
    const s0 = Math.floor(t * SR), kick = !busy || Math.round(t / beat * 4) % 4 === 0;
    for (let i = 0; i < SR * 0.12 && s0 + i < out.length; i++) {
      out[s0 + i] += kick ? Math.sin(2 * Math.PI * 55 * i / SR) * Math.exp(-i / (SR * 0.05)) * level : 0;
      if (busy) out[s0 + i] += rnd() * Math.exp(-i / (SR * 0.01)) * level * 0.4;
    }
  }
  return out;
}

describe('energy', () => {
  it('rates a soft sparse groove low and a loud busy fast one high', { timeout: 30000 }, () => {
    const calm = energyRating(groove(95, false, 0.15), SR, 95), hot = energyRating(groove(128, true, 0.9), SR, 128);
    expect(calm).toBeLessThanOrEqual(3);
    expect(hot).toBeGreaterThanOrEqual(7);
    expect(energyRating(sine(220, 30, 0.02), SR, 90)).toBeLessThanOrEqual(2);
  });
  it('never rates the calm demo above the fast one', { timeout: 30000 }, () => {
    const e = (i: number) => energyRating(renderDemo(DEMOS[i], SR).L, SR, DEMOS[i].bpm);
    expect(e(2)).toBeLessThanOrEqual(e(3));
  });
});

describe('fits next', () => {
  const T = (bpm: number, tonic: number, minor: boolean): Track => ({ id: 'x', name: 'x', folder: '', bpm, key: { tonic, minor } });
  const am = { tonic: 9, minor: true };
  it('needs a safe key and a close tempo (half/double time ok)', () => {
    expect(fitsNext(T(124, 4, true), am, 122)).toBe(true);     // Em, close tempo
    expect(fitsNext(T(124, 3, true), am, 122)).toBe(false);    // Ebm clashes
    expect(fitsNext(T(140, 9, true), am, 122)).toBe(false);    // too fast
    expect(fitsNext(T(62, 0, false), am, 122)).toBe(true);     // C at half time
  });
  it('sorts by wheel position', () => {
    const l = [T(1, 7, false), T(1, 9, true), T(1, 0, false)];
    expect(sortTracks(l, 'key', 1).map(t => t.key!.tonic)).toEqual([9, 0, 7]);   // 1m, 1M, 2M
  });
});
