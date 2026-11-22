import type { Deck } from './deck';
import { ramp } from './context';
import { mixerCfg, xfGains } from './mixercfg';

/** Crossfader with a selectable curve (YUMUŞAK / DÜZ / KESKİN). */
export class Mixer {
  xfVal = 0;
  readonly decks: Deck[];

  constructor(decks: Deck[]) { this.decks = decks; mixerCfg.listeners.push(() => this.apply()); }

  setXF(v: number): void { this.xfVal = v; this.apply(); }

  apply(): void {
    const g = xfGains(mixerCfg.xf, (this.xfVal + 1) / 2);
    const [a, b] = this.decks;
    if (a.xfG && b.xfG) {
      ramp(a.xfG.gain, g.a, 0.003);
      ramp(b.xfG.gain, g.b, 0.003);
    }
  }
}
