/** Every built-in demo track (4/4 house demos + the 9/8 aksak demo), with what the app needs to know about it. */
import type { MeterId } from '../analysis/grid';
import type { Key } from '../analysis/key';
import { DEMOS, renderDemo } from './synth';
import { AKSAK, renderAksak } from './aksak';

export interface DemoTrack {
  name: string;
  /** grid tempo: beats per minute (4/4) or eighths per minute (x/8) */
  bpm: number;
  meter: MeterId;
  key: Key | null;
  render: (sr: number) => { L: Float32Array; R: Float32Array };
}

export const ALL_DEMOS: DemoTrack[] = [
  ...DEMOS.map(d => ({ name: d.name, bpm: d.bpm, meter: '4/4' as MeterId, key: { tonic: d.root % 12, minor: d.minor }, render: (sr: number) => renderDemo(d, sr) })),
  // hicaz is not a major/minor key: no key shown (the tone wheel is for western keys)
  { name: AKSAK.name, bpm: AKSAK.eighthsPerMin, meter: '9/8', key: null, render: renderAksak },
];

/** Index of the aksak demo in ALL_DEMOS. */
export const AKSAK_DEMO = ALL_DEMOS.length - 1;
