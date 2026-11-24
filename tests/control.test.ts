import { describe, it, expect } from 'vitest';
import { parseMidi, msgKey, normalized, isOn, bindRules, describe as describeMsg } from '../src/midi/midi';
import { BIND, slots, codeOf, applyKey, buildKeymap, sanitize, resetKeys, bindId, EMPTY, type Overrides } from '../src/input/keymap';

describe('MIDI parsing', () => {
  it('reads note on, note off (and note on with velocity 0), CC and pitch bend', () => {
    expect(parseMidi([0x90, 60, 100])).toEqual({ kind: 'note', ch: 0, num: 60, value: 100 });
    expect(parseMidi([0x81, 60, 40])).toEqual({ kind: 'note', ch: 1, num: 60, value: 0 });
    expect(parseMidi([0x90, 60, 0])).toMatchObject({ kind: 'note', value: 0 });
    expect(parseMidi([0xb3, 7, 127])).toEqual({ kind: 'cc', ch: 3, num: 7, value: 127 });
    // pitch bend: LSB first, then MSB; centre = 8192
    expect(parseMidi([0xe0, 0, 64])).toMatchObject({ kind: 'pb', value: 8192 });
    expect(parseMidi([0xf8])).toBeNull();                       // clock: ignored
  });

  it('gives every physical control a stable key and a 0..1 position', () => {
    expect(msgKey(parseMidi([0xb0, 7, 10])!)).toBe('cc:0:7');
    expect(msgKey(parseMidi([0xe2, 0, 0])!)).toBe('pb:2');
    expect(normalized(parseMidi([0xb0, 7, 127])!)).toBe(1);
    expect(normalized(parseMidi([0xe0, 0, 64])!)).toBeCloseTo(0.5, 2);
  });

  it('treats CC values from 64 as a pressed button, notes with velocity as pressed', () => {
    expect(isOn(parseMidi([0xb0, 20, 63])!)).toBe(false);
    expect(isOn(parseMidi([0xb0, 20, 64])!)).toBe(true);
    expect(isOn(parseMidi([0x90, 36, 1])!)).toBe(true);
    expect(isOn(parseMidi([0x80, 36, 0])!)).toBe(false);
  });

  it('describes messages for the monitor', () => {
    expect(describeMsg(parseMidi([0xb0, 7, 10])!)).toBe('CC 7 · kanal 1 · 10');
  });
});

describe('MIDI binding rules', () => {
  it('a key binds one target, a target has one key', () => {
    let r = bindRules([], 'cc:0:7', 'cont:tempo:0');
    expect(r.list).toEqual([{ key: 'cc:0:7', target: 'cont:tempo:0' }]);
    // move the same target to another knob: the old key is freed
    r = bindRules(r.list, 'cc:0:8', 'cont:tempo:0');
    expect(r.list).toEqual([{ key: 'cc:0:8', target: 'cont:tempo:0' }]);
    // a knob already used elsewhere is taken over, and we are told who lost it
    r = bindRules([{ key: 'cc:0:8', target: 'cont:tempo:0' }], 'cc:0:8', 'cont:xf');
    expect(r.list).toEqual([{ key: 'cc:0:8', target: 'cont:xf' }]);
    expect(r.displaced).toBe('cont:tempo:0');
  });
});

describe('key map', () => {
  it('has the same controls as before: deck A and B for every row, pads included', () => {
    const all = slots();
    expect(all.length).toBe(BIND.length * 2);
    expect(codeOf(BIND.find(r => r[0] === 'play')!, 0)).toBe('KeyQ');
    expect(codeOf(BIND.find(r => r[0] === 'play')!, 1)).toBe('KeyY');
    expect(all.find(s => s.id === bindId('pad4', 1, 0))!.code).toBe('Digit1');
  });

  it('rebinding a key takes it from the other control on the same deck and shift layer', () => {
    const r = applyKey(EMPTY, bindId('play', 0, 0), 'KeyW');     // W is CUE on deck A
    expect(r.displaced?.id).toBe(bindId('cue', 0, 0));
    const K = buildKeymap(r.ov);
    expect(K['KeyW']).toMatchObject({ d: 0, a: 'play' });
    expect(codeOf(BIND.find(x => x[0] === 'cue')!, 0, r.ov)).toBe('');
    expect(K['KeyQ']).toBeUndefined();                          // play's old key is free now
  });

  it('the shift layer is a separate space: same key on Shift does not clash', () => {
    const r = applyKey(EMPTY, bindId('load', 1, 0), 'Digit1');   // ⇧1 is pad 5 on deck A
    expect(r.displaced?.id).toBe(bindId('pad4', 1, 0));
    expect(applyKey(EMPTY, bindId('play', 0, 0), 'Digit1').displaced?.id).toBe(bindId('pad0', 0, 0));
    expect(applyKey(EMPTY, bindId('play', 0, 0), 'KeyW').displaced?.id).toBe(bindId('cue', 0, 0));
  });

  it('one keyboard for both decks: a key used by deck A is not free for deck B', () => {
    // P is deck B's "loop ×2": giving it to deck A's play must take it from deck B
    const r = applyKey(EMPTY, bindId('play', 0, 0), 'KeyP');
    expect(r.displaced?.id).toBe(bindId('loopDouble', 0, 1));
    expect(buildKeymap(r.ov)['KeyP']).toMatchObject({ d: 0, a: 'play' });
    // and deck B's CUE (U) clashes with deck A's play if A takes U
    expect(applyKey(EMPTY, bindId('play', 0, 0), 'KeyU').displaced?.id).toBe(bindId('cue', 0, 1));
  });

  it('clearing a key leaves the control without one', () => {
    const r = applyKey(EMPTY, bindId('play', 0, 0), '');
    expect(codeOf(BIND.find(x => x[0] === 'play')!, 0, r.ov)).toBe('');
    expect(buildKeymap(r.ov)['KeyQ']).toBeUndefined();
  });

  it('saved changes: sanitize drops unknown ids and bad codes, keeps the layout', () => {
    const o = sanitize({ keys: { [bindId('play', 0, 0)]: 'KeyP', 'nope|0|0': 'KeyZ', [bindId('cue', 0, 0)]: 'bad code!' }, layout: 'us' });
    expect(o.keys).toEqual({ [bindId('play', 0, 0)]: 'KeyP' });
    expect(o.layout).toBe('us');
    expect(sanitize('garbage')).toEqual({ keys: {}, layout: 'tr' });
  });

  it('reset returns to the defaults and keeps the layout', () => {
    const r: Overrides = resetKeys({ keys: { [bindId('play', 0, 0)]: 'KeyP' }, layout: 'us' });
    expect(r).toEqual({ keys: {}, layout: 'us' });
    expect(codeOf(BIND.find(x => x[0] === 'play')!, 0, r)).toBe('KeyQ');
  });
});
