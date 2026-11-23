import { describe, it, expect } from 'vitest';
import { DEMOS, renderDemo, type Section } from '../src/demo/synth';
import { detectBPM } from '../src/analysis/bpm';

const SR = 22050;
// shorter structure for fast tests (same musical content per bar)
const SHORT: Section[] = [{ name: 'intro', bars: 8 }, { name: 'build', bars: 8 }, { name: 'drop', bars: 16 }];

describe('demo tracks', () => {
  for (const spec of DEMOS) {
    it(`${spec.name}: BPM detected within ±1, no clipping`, () => {
      const { L, R } = renderDemo(spec, SR, SHORT);
      const bars = SHORT.reduce((s, x) => s + x.bars, 0);
      expect(L.length).toBeGreaterThanOrEqual(Math.floor(bars * 4 * 60 / spec.bpm * SR));
      let peak = 0;
      for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
      expect(peak).toBeLessThanOrEqual(0.9);
      expect(peak).toBeGreaterThan(0.5);
      const bpm = detectBPM(L, SR)!;
      expect(Math.abs(bpm - spec.bpm)).toBeLessThanOrEqual(1);
    });
  }

  it('is deterministic', () => {
    const a = renderDemo(DEMOS[0], SR, SHORT).L, b = renderDemo(DEMOS[0], SR, SHORT).L;
    expect(a.length).toBe(b.length);
    expect(a[12345]).toBe(b[12345]);
  });
});

import { renderAksak, AKSAK } from '../src/demo/aksak';
import { ALL_DEMOS, AKSAK_DEMO } from '../src/demo/demos';

describe('aksak demo (9/8)', () => {
  it('has darbuka hits on the 2+2+2+3 grid and never clips', { timeout: 30000 }, () => {
    const { L } = renderAksak(SR);
    const e = 60 / AKSAK.eighthsPerMin, bar = 9 * e;
    let peak = 0;
    for (const v of L) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.9);
    expect(L.length / SR).toBeGreaterThan(48 * bar);
    // energy right after each "düm" (eighth 0 of a bar) is far above the energy just before it
    const rms = (t: number, d: number) => { let s = 0; const a = Math.floor(t * SR), n = Math.floor(d * SR); for (let i = a; i < a + n; i++) s += L[i] * L[i]; return Math.sqrt(s / n); };
    for (const b of [9, 20, 33]) expect(rms(b * bar + 0.005, 0.03)).toBeGreaterThan(rms(b * bar - 0.035, 0.03) * 2);
  });
  it('is listed with a 9/8 grid', () => {
    expect(ALL_DEMOS[AKSAK_DEMO]).toMatchObject({ meter: '9/8', bpm: 270 });
  });
});
