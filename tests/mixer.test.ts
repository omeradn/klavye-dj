import { describe, it, expect } from 'vitest';
import { xfGains, chGain, isoGain } from '../src/engine/mixercfg';

describe('crossfader curves', () => {
  it('all curves: full A at the left, full B at the right', () => {
    for (const c of ['smooth', 'flat', 'sharp'] as const) {
      expect(xfGains(c, 0)).toMatchObject({ a: 1, b: 0 });
      const r = xfGains(c, 1);
      expect(r.a).toBeCloseTo(0, 9); expect(r.b).toBe(1);
    }
  });
  it('smooth keeps the power constant, flat keeps both full in the middle, sharp opens almost at once', () => {
    for (const x of [0.2, 0.5, 0.8]) { const g = xfGains('smooth', x); expect(g.a ** 2 + g.b ** 2).toBeCloseTo(1, 9); }
    expect(xfGains('flat', 0.5)).toEqual({ a: 1, b: 1 });
    expect(xfGains('sharp', 0.06)).toMatchObject({ a: 1, b: 1 });
    expect(xfGains('sharp', 0.03).b).toBeCloseTo(0.5, 9);
  });
});

describe('channel fader curves', () => {
  it('maps 0..1 to a gain', () => {
    expect([chGain('smooth', 0.5), chGain('linear', 0.5), chGain('sharp', 0.5)]).toEqual([0.25, 0.5, 1]);
    for (const c of ['smooth', 'linear', 'sharp'] as const) { expect(chGain(c, 0)).toBe(0); expect(chGain(c, 1)).toBe(1); }
  });
});

describe('isolator', () => {
  it('knob fully down removes the band, 0 dB passes it, +6 boosts', () => {
    expect(isoGain(-26)).toBe(0);
    expect(isoGain(0)).toBe(1);
    expect(isoGain(6)).toBeCloseTo(1.995, 2);
    expect(isoGain(-20)).toBeCloseTo(0.1, 3);
  });
});
