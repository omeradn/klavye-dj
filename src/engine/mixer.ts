import type { Deck } from './deck';
import { ramp } from './context';
import { mixerCfg, xfGains } from './mixercfg';

/** Crossfader with a selectable curve (YUMUŞAK / DÜZ / KESKİN). */
export class Mixer {
  xfVal = 0;
  readonly decks: Deck[];

  constructor(decks: Deck[]) {
    this.decks = decks;
    mixerCfg.listeners.push(() => this.apply());
    for (const d of decks) d.onSide = () => this.apply();
  }

  setXF(v: number): void { this.xfVal = v; this.apply(); }

  apply(): void {
    const g = xfGains(mixerCfg.xf, (this.xfVal + 1) / 2);
    for (const d of this.decks) {
      if (!d.xfG) continue;
      ramp(d.xfG.gain, d.xfSide === 'L' ? g.a : d.xfSide === 'R' ? g.b : 1, 0.003);
    }
  }
}
