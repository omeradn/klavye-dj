import { describe, it, expect } from 'vitest';
import { detectKey, keyName, wheelCode, compat, shiftKey, type Key } from '../src/analysis/key';
import { DEMOS, renderDemo } from '../src/demo/synth';

const SR = 22050;

/** I–IV–V–I style chord loop in a key, with a bass note, 2 s per chord. */
function chords(tonic: number, minor: boolean, seconds = 40): Float32Array {
  const out = new Float32Array(seconds * SR);
  const third = minor ? 3 : 4;
  const prog = [[0, third, 7], [5, minor ? 8 : 9, 12], [7, 11, 14], [0, third, 7]];
  for (let s = 0; s < seconds / 2; s++) {
    const ch = prog[s % 4], s0 = s * 2 * SR;
    for (const iv of [...ch, ch[0] - 12]) {
      const f = 261.63 * Math.pow(2, (tonic + iv - 12) / 12);
      for (let i = 0; i < 2 * SR; i++) out[s0 + i] += Math.sin(2 * Math.PI * f * i / SR) * 0.1 * Math.exp(-i / SR);
    }
  }
  return out;
}

describe('detectKey', () => {
  for (const [t, m] of [[0, false], [9, true], [7, false], [4, true], [2, false], [10, true]] as [number, boolean][]) {
    it(`finds ${keyName({ tonic: t, minor: m })} in a chord loop`, () => {
      expect(detectKey(chords(t, m), SR)).toEqual({ tonic: t, minor: m });
    });
  }
  it('finds the key of every demo track', { timeout: 30000 }, () => {
    for (const d of DEMOS) {
      const k = detectKey(renderDemo(d, SR).L, SR)!;
      expect({ name: d.name, key: keyName(k) }).toEqual({ name: d.name, key: d.name.split('· ').pop() });
    }
  });
  it('returns null for silence', () => {
    expect(detectKey(new Float32Array(SR * 10), SR)).toBeNull();
  });
});

describe('tone wheel', () => {
  const K = (tonic: number, minor: boolean): Key => ({ tonic, minor });
  it('numbers keys on the circle of fifths', () => {
    expect(wheelCode(K(0, false))).toBe('1M');   // C
    expect(wheelCode(K(9, true))).toBe('1m');    // Am (relative of C)
    expect(wheelCode(K(7, false))).toBe('2M');   // G
    expect(wheelCode(K(5, false))).toBe('12M');  // F
    expect(wheelCode(K(4, true))).toBe('2m');    // Em
  });
  it('rates mixes', () => {
    expect(compat(K(9, true), K(0, false))).toBe(2);   // Am – C (relative)
    expect(compat(K(9, true), K(4, true))).toBe(2);    // Am – Em (neighbour)
    expect(compat(K(9, true), K(7, false))).toBe(1);   // Am – G (diagonal)
    expect(compat(K(9, true), K(3, true))).toBe(0);    // Am – Ebm (opposite)
  });
  it('transposes', () => {
    expect(keyName(shiftKey(K(9, true), 2))).toBe('Bm');
    expect(keyName(shiftKey(K(0, false), -1.2))).toBe('B');
  });
});
