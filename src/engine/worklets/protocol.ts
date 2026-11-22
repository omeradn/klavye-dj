/** Messages between the main thread and the audio-thread processors. Positions are in samples. */

export type DeckIn =
  | { t: 'load'; L: Float32Array; R: Float32Array }
  | { t: 'play'; on: boolean }
  | { t: 'seek'; pos: number }
  | { t: 'jump'; d: number }
  | { t: 'tempo'; v: number }
  | { t: 'loop'; on: boolean; s: number; e: number }
  | { t: 'reverse'; on: boolean }
  | { t: 'slip'; on: boolean }
  | { t: 'censor'; on: boolean }
  | { t: 'scratch'; on: boolean; rate: number }
  | { t: 'vinyl'; fx: 'brake' | 'spin'; dur: number }
  /**
   * Roll / slicer: a temporary loop that always slips (on release the song continues where it would have been).
   * jump = start playing at `s` right away (slicer); otherwise the loop starts where the playhead already is.
   */
  | { t: 'roll'; on: boolean; s: number; e: number; jump?: boolean }
  /** lookahead = pitch-shifter latency in output samples; wet = use the pitch-corrected signal when possible */
  | { t: 'keylock'; lookahead: number; wet: boolean };

export interface DeckState {
  t: 'state';
  pos: number;
  rate: number;
  playing: boolean;
  audible: boolean;
  /** AudioContext time of this snapshot */
  at: number;
  /** 0 = original signal, 1 = pitch-corrected (key lock / key shift) */
  wet: number;
}

export type LimiterIn = { t: 'ceiling'; db: number };

export interface LimiterStats {
  t: 'stats';
  /** smallest gain applied in this period (1 = no limiting) */
  gr: number;
  /** highest pre-limiter peak (linear; > 1 would have clipped) */
  peakIn: number;
  peakOut: number;
}
