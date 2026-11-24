import { clamp } from '../util';

export interface KnobOpts {
  min?: number; max?: number; def?: number; label?: string; step?: number | null;
  onchange?: (v: number) => void;
  /** Called after a double-click reset (e.g. to clear an EQ kill). */
  onreset?: () => void;
}

export class Knob {
  min = 0; max = 1; def = 0; label = ''; step: number | null = null;
  onchange?: (v: number) => void;
  onreset?: () => void;
  v = 0;
  readonly w: HTMLDivElement;
  readonly el: HTMLDivElement;
  readonly ind: HTMLElement;
  private y0: number | null = null;
  private v0 = 0;

  constructor(host: HTMLElement, o: KnobOpts) {
    Object.assign(this, o);
    this.w = document.createElement('div'); this.w.className = 'kwrap';
    this.el = document.createElement('div'); this.el.className = 'knob'; this.el.innerHTML = '<i></i>';
    this.ind = this.el.firstChild as HTMLElement;
    this.w.appendChild(this.el);
    if (this.label) { const s = document.createElement('span'); s.textContent = this.label; this.w.appendChild(s); }
    host.appendChild(this.w);
    const end = () => { this.y0 = null; };
    this.el.addEventListener('pointerdown', e => { e.preventDefault(); this.el.setPointerCapture(e.pointerId); this.y0 = e.clientY; this.v0 = this.v; });
    this.el.addEventListener('pointermove', e => { if (this.y0 == null) return; this.set(this.v0 + (this.y0 - e.clientY) / 160 * (this.max - this.min)); });
    this.el.addEventListener('pointerup', end);
    this.el.addEventListener('pointercancel', end);
    this.el.addEventListener('dblclick', () => { this.set(this.def); this.onreset?.(); });
    this.el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); this.nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.2 : 1)); }, { passive: false });
    this.set(this.def);
  }

  nudge(dir: number): void { this.set(this.v + dir * (this.step || (this.max - this.min) / 40)); }

  set(v: number): void {
    this.v = clamp(v, this.min, this.max);
    this.ind.style.transform = `rotate(${-135 + (this.v - this.min) / (this.max - this.min) * 270}deg)`;
    this.onchange?.(this.v);
  }
}

export interface FaderOpts {
  min?: number; max?: number; def?: number; vertical?: boolean; step?: number | null;
  onchange?: (v: number) => void;
}

export class Fader {
  min = 0; max = 1; def = 0; vertical = true; step: number | null = null;
  onchange?: (v: number) => void;
  v = 0;
  readonly el: HTMLElement;
  readonly cap: HTMLDivElement;
  private drag = false;

  constructor(el: HTMLElement, o: FaderOpts) {
    Object.assign(this, o);
    this.el = el; el.classList.add('fader', this.vertical ? 'v' : 'h');
    this.cap = document.createElement('div'); this.cap.className = 'cap'; el.appendChild(this.cap);
    const pos = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const f = this.vertical ? 1 - (e.clientY - r.top - 6) / (r.height - 12) : (e.clientX - r.left - 6) / (r.width - 12);
      this.set(this.min + clamp(f, 0, 1) * (this.max - this.min));
    };
    const end = () => { this.drag = false; };
    el.addEventListener('pointerdown', e => { e.preventDefault(); el.setPointerCapture(e.pointerId); this.drag = true; pos(e); });
    el.addEventListener('pointermove', e => { if (this.drag) pos(e); });
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    el.addEventListener('dblclick', () => this.set(this.def));
    el.addEventListener('wheel', e => { e.preventDefault(); e.stopPropagation(); this.nudge((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 0.2 : 1)); }, { passive: false });
    this.set(this.def);
  }

  nudge(dir: number): void { this.set(this.v + dir * (this.step || (this.max - this.min) / 40)); }

  set(v: number): void {
    this.v = clamp(v, this.min, this.max);
    const f = (this.v - this.min) / (this.max - this.min);
    if (this.vertical) this.cap.style.top = `calc(6px + ${(1 - f) * 100}% - ${(1 - f) * 12}px)`;
    else this.cap.style.left = `calc(6px + ${f * 100}% - ${f * 12}px)`;
    this.onchange?.(this.v);
  }
}
