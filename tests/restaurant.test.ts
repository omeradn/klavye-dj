import { describe, it, expect } from 'vitest';
import { dayPartAt, scoreNext, pickNext, tempoFits, DAY_PARTS, type Cand } from '../src/restaurant/schedule';
import type { Key } from '../src/analysis/key';

const am: Key = { tonic: 9, minor: true };

describe('day parts', () => {
  it('finds the part for an hour, including the wrap past midnight', () => {
    expect(dayPartAt(12).name).toBe('Öğle · sakin');
    expect(dayPartAt(16).name).toBe('Öğleden sonra');
    expect(dayPartAt(20.5).name).toBe('Akşam · hareketli');
    expect(dayPartAt(23.5).name).toBe('Kapanış');
    expect(dayPartAt(2).name).toBe('Kapanış');
    expect(dayPartAt(-1).name).toBe('Kapanış');
  });
  it('the evening is busier than lunch, and the cap grows with it', () => {
    const lunch = DAY_PARTS.find(p => p.name.startsWith('Öğle'))!, evening = DAY_PARTS.find(p => p.name.startsWith('Akşam'))!;
    expect(evening.target).toBeGreaterThan(lunch.target);
    expect(evening.cap).toBeGreaterThan(lunch.cap);
  });
});

describe('next track', () => {
  const lunch = dayPartAt(12), evening = dayPartAt(20);
  const cur = { bpm: 122, key: am };
  it('tempo: within 6 %, half and double time count', () => {
    expect(tempoFits(122, 126)).toBe(true);
    expect(tempoFits(122, 140)).toBe(false);
    expect(tempoFits(61, 122)).toBe(true);
    expect(tempoFits(244, 122)).toBe(true);
  });
  it('rejects clashing keys and songs outside the energy window', () => {
    const clash: Cand = { sig: 'x', bpm: 122, key: { tonic: 3, minor: true } };       // Ebm vs Am
    expect(scoreNext(clash, cur, lunch)).toBeNull();
    const loud: Cand = { sig: 'y', bpm: 122, key: am, energy: 9 };
    expect(scoreNext(loud, cur, lunch)).toBeNull();
  });
  it('prefers the energy the day part asks for', () => {
    const calm: Cand = { sig: 'calm', bpm: 122, key: am, energy: 3 };
    const mid: Cand = { sig: 'mid', bpm: 122, key: am, energy: 6 };
    expect(pickNext([calm, mid], cur, lunch, new Set())?.sig).toBe('calm');
    expect(pickNext([calm, mid], cur, evening, new Set())?.sig).toBe('mid');
  });
  it('does not repeat songs already played, and returns nothing when nothing fits', () => {
    const a: Cand = { sig: 'a', bpm: 122, key: am, energy: 3 };
    const b: Cand = { sig: 'b', bpm: 123, key: am, energy: 4 };
    expect(pickNext([a, b], cur, lunch, new Set(['a']))?.sig).toBe('b');
    expect(pickNext([a], cur, lunch, new Set(['a']))).toBeNull();
    expect(pickNext([], cur, lunch, new Set())).toBeNull();
  });
});
