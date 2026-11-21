import type { Deck } from './deck';
import { ramp } from './context';

/** Crossfader (equal-power curve). */
export class Mixer {
  xfVal = 0;
  readonly decks: Deck[];

  constructor(decks: Deck[]) { this.decks = decks; }

  setXF(v: number): void { this.xfVal = v; this.apply(); }

  apply(): void {
    const x = (this.xfVal + 1) / 2;
    const [a, b] = this.decks;
    if (a.xfG && b.xfG) {
      ramp(a.xfG.gain, Math.cos(x * Math.PI / 2), 0.005);
      ramp(b.xfG.gain, Math.sin(x * Math.PI / 2), 0.005);
    }
  }
}
