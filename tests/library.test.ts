import { describe, it, expect } from 'vitest';
import { fold, matches, sortTracks, fileSig, AUDIO_EXT, type Track } from '../src/library/model';

const T = (name: string, folder: string, bpm?: number | null, dur?: number): Track => ({ id: name, name, folder, bpm, dur });

describe('library search', () => {
  it('ignores Turkish characters and case', () => {
    expect(fold('ŞARKI Çığlık Öğle Ü')).toBe('sarki ciglik ogle u');
    expect(matches(T('Sezen Aksu - Şarkı Söylemek Lazım', 'Pop'), 'sarki soylemek')).toBe(true);
    expect(matches(T('Tarkan - Kuzu Kuzu', 'Pop'), 'İSTANBUL')).toBe(false);
  });
  it('matches the folder and BPM ±2', () => {
    const t = T('Parça', 'Akşam Seti', 124);
    expect(matches(t, 'aksam')).toBe(true);
    expect(matches(t, '126')).toBe(true);
    expect(matches(t, '127')).toBe(false);
    expect(matches(t, '')).toBe(true);
  });
});

describe('library sort', () => {
  const list = [T('b', 'x', 128, 200), T('a', 'y', null, 100), T('c', 'x', 100, 300)];
  it('sorts by BPM with unknown BPM last in both directions', () => {
    expect(sortTracks(list, 'bpm', 1).map(t => t.name)).toEqual(['c', 'b', 'a']);
    expect(sortTracks(list, 'bpm', -1).map(t => t.name)).toEqual(['b', 'c', 'a']);
  });
  it('sorts by name and folder', () => {
    expect(sortTracks(list, 'name', 1).map(t => t.name)).toEqual(['a', 'b', 'c']);
    expect(sortTracks(list, 'folder', 1).map(t => t.name)).toEqual(['b', 'c', 'a']);
  });
});

describe('library files', () => {
  it('recognises audio extensions and builds a stable signature', () => {
    expect(AUDIO_EXT.test('şarkı.MP3')).toBe(true);
    expect(AUDIO_EXT.test('kapak.jpg')).toBe(false);
    expect(fileSig({ name: 'a.mp3', size: 10, lastModified: 5 })).toBe('a.mp3|10|5');
  });
});
