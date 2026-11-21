declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    active?: boolean;
    outputTime?: number;
    input?: number;
    rate?: number;
    semitones?: number;
    tonalityHz?: number;
    formantSemitones?: number;
    formantCompensation?: boolean;
    formantBaseHz?: number;
    loopStart?: number;
    loopEnd?: number;
  }
  export interface StretchNode extends AudioWorkletNode {
    inputTime: number;
    schedule(s: StretchSchedule, adjustPrevious?: boolean): Promise<unknown>;
    start(when?: number | StretchSchedule): Promise<unknown>;
    stop(when?: number): Promise<unknown>;
    configure(c: { blockMs?: number; intervalMs?: number; splitComputation?: boolean; preset?: 'default' | 'cheaper' }): Promise<void>;
    /** seconds */
    latency(): Promise<number>;
  }
  export default function SignalsmithStretch(ctx: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>;
}
