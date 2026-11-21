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
