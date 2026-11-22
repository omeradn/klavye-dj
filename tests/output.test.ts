import { describe, it, expect } from 'vitest';
import { parseSettings, DEFAULT_SETTINGS } from '../src/engine/settings';
import { cueMixGains } from '../src/engine/output';

describe('audio settings', () => {
  it('falls back to defaults on missing or broken data', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('42')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid fields and drops invalid ones', () => {
    const s = parseSettings(JSON.stringify({ latency: 'safe', phonesMode: 'quad', cueMix: 0.2, phonesLevel: 7, masterSink: 'abc', phonesSink: 3 }));
    expect(s.latency).toBe('safe');
    expect(s.phonesMode).toBe('quad');
    expect(s.cueMix).toBe(0.2);
    expect(s.phonesLevel).toBe(DEFAULT_SETTINGS.phonesLevel);
    expect(s.masterSink).toBe('abc');
    expect(s.phonesSink).toBe('');
  });
});

describe('cue / master blend', () => {
  it('is equal-power and reaches both ends', () => {
    expect(cueMixGains(0)).toEqual({ cue: 1, master: 0 });
    expect(cueMixGains(1).cue).toBeCloseTo(0, 9);
    expect(cueMixGains(1).master).toBeCloseTo(1, 9);
    for (const x of [0.1, 0.5, 0.9]) {
      const g = cueMixGains(x);
      expect(g.cue ** 2 + g.master ** 2).toBeCloseTo(1, 9);
    }
  });
});
