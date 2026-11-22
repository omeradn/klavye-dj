import { describe, it, expect } from 'vitest';
import { analyzeGrid, barPos, lineKind, snap, phaseAt, setBpmAt, downbeatAt, wrapHalf, type Grid } from '../src/analysis/grid';
import { DEMOS, renderDemo } from '../src/demo/synth';
import { detectBPM } from '../src/analysis/bpm';

const SR = 22050;

/** Kick on every beat starting at `start`, louder accent + open hat on bar starts, chord-like tone change every bar. */
function track(bpm: number, start: number, seconds = 90): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR)), beat = 60 / bpm;
  for (let k = 0; start + k * beat < seconds; k++) {
    const s0 = Math.floor((start + k * beat) * SR), acc = k % 4 === 0;
    for (let i = 0; i < SR * 0.15 && s0 + i < out.length; i++) out[s0 + i] += Math.sin(2 * Math.PI * 55 * i / SR) * Math.exp(-i / (SR * 0.04)) * (acc ? 0.9 : 0.6);
    if (acc) {
      const f = [220, 262, 330, 196][(k / 4) % 4];
      for (let i = 0; i < beat * 4 * SR && s0 + i < out.length; i++) out[s0 + i] += Math.sin(2 * Math.PI * f * i / SR) * 0.08;
    }
  }
  return out;
}

const err = (g: Grid, trueStart: number) => {
  const p = 60 / g.bpm;
  return Math.abs(wrapHalf((g.offset - trueStart) / p)) * p;
};

describe('analyzeGrid', () => {
  for (const [bpm, start] of [[124, 0.37], [97.5, 1.12], [140, 0.05]] as const) {
    it(`locks ${bpm} BPM (beat 1 at ${start}s) to ±0.02 BPM and ±5 ms`, () => {
      const ch = track(bpm, start);
      const g = analyzeGrid(ch, SR, detectBPM(ch, SR)!)!;
      expect(Math.abs(g.bpm - bpm)).toBeLessThan(0.02);
      expect(err(g, start)).toBeLessThan(0.005);
      // downbeat: offset is a bar start (multiple of 4 beats from the real one)
      const beats = (g.offset - start) / (60 / g.bpm);
      expect(Math.abs(beats / 4 - Math.round(beats / 4))).toBeLessThan(0.01);
    });
  }

  it('finds the bar and phrase start of a demo track', () => {
    const spec = DEMOS[1];
    const { L } = renderDemo(spec, SR);
    const g = analyzeGrid(L, SR, spec.bpm)!;
    expect(Math.abs(g.bpm - spec.bpm)).toBeLessThan(0.02);
    expect(err(g, 0)).toBeLessThan(0.005);
    const bar = 4 * 60 / g.bpm, bars = g.offset / bar;
    expect(Math.abs(bars - Math.round(bars))).toBeLessThan(0.01);
    expect(((Math.round(bars) + g.phraseBar) % 8 + 8) % 8).toBe(0);
  });
});

describe('grid math', () => {
  const g: Grid = { bpm: 120, offset: 1, meter: '4/4', phraseBar: 0 };
  it('snaps and measures phase', () => {
    expect(snap(g, 1.26)).toBeCloseTo(1.5, 9);
    expect(phaseAt(g, 1.25)).toBeCloseTo(0.5, 9);
  });
  it('counts bars and phrases', () => {
    const p = barPos(g, 1 + 9 * 2 + 0.5 * 2, 8);     // 9 bars + 2 beats after offset
    expect(p).toMatchObject({ bar: 9, beat: 2, phrase: 2, barInPhrase: 2 });
    expect(barPos(g, 0.99, 8)).toMatchObject({ bar: -1, beat: 3, phrase: 0, barInPhrase: 8 });
  });
  it('knows aksak beats (9/8 = 2+2+2+3)', () => {
    const a: Grid = { ...g, meter: '9/8' };
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(k => lineKind(a, k, 8))).toEqual([3, 0, 1, 0, 1, 0, 1, 0, 0, 2]);
    expect(barPos(a, 1 + 7 * 0.5, 8).beat).toBe(3);
  });
  it('keeps the line under the playhead when BPM changes', () => {
    const h = setBpmAt(g, 121, 30.25);
    expect(phaseAt(h, 30.25)).toBeCloseTo(phaseAt(g, 30.25), 9);
    const d = downbeatAt(g, 7.27);
    expect(d.offset).toBeCloseTo(7.5, 9);
    expect(barPos(d, 7.5, 8)).toMatchObject({ bar: 0, beat: 0, phrase: 1, barInPhrase: 1 });
  });
});
