import { describe, it, expect } from 'vitest';
import { padLabel, sliceBase, LOOP_BEATS, JUMP_BEATS, ROLL_BEATS, KEY_SEMIS, PAD_MODES } from '../src/engine/padmodes';
import { SOUNDS } from '../src/demo/sounds';
import { buildKeymap } from '../src/input/keymap';

describe('pad modes', () => {
  it('has 7 modes and 8 values per mode', () => {
    expect(PAD_MODES.map(m => m.id)).toEqual(['hot', 'loop', 'jump', 'slicer', 'roll', 'sampler', 'key']);
    for (const a of [LOOP_BEATS, JUMP_BEATS, ROLL_BEATS, KEY_SEMIS]) expect(a).toHaveLength(8);
  });
  it('labels pads', () => {
    expect(padLabel('loop', 0)).toBe('LOOP 1/4');
    expect(padLabel('jump', 2)).toBe('◀ 4');
    expect(padLabel('jump', 7)).toBe('32 ▶');
    expect(padLabel('roll', 1)).toBe('ROLL 1/8');
    expect(padLabel('key', 4)).toBe('TON 0');
    expect(padLabel('key', 6)).toBe('−2');
    expect(padLabel('sampler', 3, { sample: 'Korna' })).toBe('Korna');
  });
  it('slicer windows are 8 beats', () => {
    expect(sliceBase(0)).toBe(0);
    expect(sliceBase(7)).toBe(0);
    expect(sliceBase(8)).toBe(8);
    expect(sliceBase(-1)).toBe(-8);
  });
});

describe('keyboard pads', () => {
  it('digits are pads 1-4, Shift+digits pads 5-8, 5/6 switch the pad mode', () => {
    const K = buildKeymap();
    expect(K['Digit1']).toMatchObject({ d: 0, a: 'pad', arg: 0, mode: 'h' });
    expect(K['Digit4+S']).toMatchObject({ d: 0, a: 'pad', arg: 7 });
    expect(K['Digit0']).toMatchObject({ d: 1, a: 'pad', arg: 3 });
    expect(K['Digit5']).toMatchObject({ d: 0, a: 'padModeNext' });
    expect(K['Digit6+S']).toMatchObject({ d: 1, a: 'padModePrev' });
  });
});

describe('sampler sounds', () => {
  it('8 synthesised sounds, short, never above 0.8, no click at the edges', () => {
    expect(SOUNDS).toHaveLength(8);
    for (const s of SOUNDS) {
      const x = s.render(22050);
      expect(x.length).toBeGreaterThan(1000);
      expect(x.length / 22050).toBeLessThan(2.5);
      let m = 0;
      for (const v of x) m = Math.max(m, Math.abs(v));
      expect(m).toBeLessThanOrEqual(0.8001);
      expect(m).toBeGreaterThan(0.5);
      expect(Math.abs(x[0])).toBeLessThan(0.01);
      expect(Math.abs(x[x.length - 1])).toBeLessThan(0.01);
    }
  });
});

describe('beat labels', () => {
  it('writes fractions of a beat', async () => {
    const { beatsLabel } = await import('../src/engine/padmodes');
    expect([1 / 16, 0.25, 0.5, 0.75, 1, 16].map(beatsLabel)).toEqual(['1/16', '1/4', '1/2', '3/4', '1', '16']);
  });
});
