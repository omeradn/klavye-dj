import { describe, it, expect } from 'vitest';
import { detectBPM } from '../src/analysis/bpm';
import { computePeaks, PPS } from '../src/analysis/peaks';

const SR = 22050;

/** Synthetic four-on-the-floor: decaying 55 Hz kick on every beat + quiet offbeat hat noise. */
function clickTrack(bpm: number, seconds = 75, sr = SR): Float32Array {
  const out = new Float32Array(Math.floor(seconds * sr));
  const beat = 60 / bpm;
  let seed = 1;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (let t = 0; t < seconds; t += beat) {
    const s0 = Math.floor(t * sr);
    for (let i = 0; i < sr * 0.15 && s0 + i < out.length; i++) {
      out[s0 + i] += Math.sin(2 * Math.PI * 55 * i / sr) * Math.exp(-i / (sr * 0.04)) * 0.9;
    }
    const h0 = Math.floor((t + beat / 2) * sr);
    for (let i = 0; i < sr * 0.02 && h0 + i < out.length; i++) out[h0 + i] += rnd() * 0.15 * Math.exp(-i / (sr * 0.005));
  }
  return out;
}

describe('detectBPM', () => {
  for (const bpm of [90, 100, 124, 128, 140, 174]) {
    it(`finds ${bpm} BPM within ±1`, () => {
      const got = detectBPM(clickTrack(bpm), SR);
      expect(got).not.toBeNull();
      expect(Math.abs(got! - bpm)).toBeLessThanOrEqual(1);
    });
  }

  it('returns null for very short audio', () => {
    expect(detectBPM(new Float32Array(SR), SR)).toBeNull();
  });
});

describe('computePeaks', () => {
  it('produces PPS peaks per second, normalised to 1', () => {
    const p = computePeaks(clickTrack(120, 10), SR);
    expect(p.length).toBe(Math.floor(10 * SR / Math.floor(SR / PPS)));
    expect(Math.max(...p)).toBeCloseTo(1, 5);
  });
});
