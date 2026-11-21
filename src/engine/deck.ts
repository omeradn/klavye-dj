import { $, clamp, fmt, toast, setText } from '../util';
import { Knob, Fader } from '../ui/controls';
import { engine, ensureCtx } from './context';
import { detectBPM } from '../analysis/bpm';
import { computePeaks, PPS } from '../analysis/peaks';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i;

type PitchAudio = HTMLAudioElement & { mozPreservesPitch?: boolean; webkitPreservesPitch?: boolean };

/**
 * One deck: transport, tempo, cues, loops + its mixer channel strip.
 * Phase 0: still uses <audio> + MediaElementSource (moves to an AudioWorklet engine in phase 1).
 */
export class Deck {
  readonly id: string;
  readonly i: number;
  readonly color: string;
  readonly el: HTMLElement;
  readonly ch: HTMLElement;
  readonly audio: PitchAudio = new Audio();
  /** The opposite deck (used by SYNC). */
  other!: Deck;

  tempo = 0; bend = 0; jogBend = 0; jogStamp = 0;
  cuePt = 0;
  hot: (number | null)[] = [null, null, null, null];
  bpm: number | null = null;
  loopOn = false; loopBeats = 4; loopS = 0; loopE = 0;
  kills = { lo: false, mid: false, hi: false };
  fxOn = false; keyLock = true;
  peaks: Float32Array | null = null;
  ovImg: HTMLCanvasElement | null = null;
  url: string | null = null;
  vu = 0;
  wired = false;

  // controls
  tempoF!: Fader; chF!: Fader;
  trimK!: Knob; hiK!: Knob; midK!: Knob; loK!: Knob; filK!: Knob; fxK!: Knob;
  fxBtn!: HTMLButtonElement;
  file!: HTMLInputElement;
  readonly ws: HTMLCanvasElement;
  readonly wo: HTMLCanvasElement;
  private ui!: Record<string, HTMLElement>;
  private vuEl: HTMLElement;

  // audio graph
  src?: MediaElementAudioSourceNode;
  trim?: GainNode;
  lo?: BiquadFilterNode; mid?: BiquadFilterNode; hi?: BiquadFilterNode; fil?: BiquadFilterNode;
  chGain?: GainNode; xfG?: GainNode; fxSend?: GainNode; fb?: GainNode;
  delay?: DelayNode;
  an?: AnalyserNode;
  anBuf = new Float32Array(1024);

  constructor(id: string, i: number) {
    this.id = id; this.i = i; this.color = i ? '#38c6ff' : '#ff8a3d';
    this.el = $('#deck' + id); this.ch = $('#ch' + id);
    this.audio.preload = 'auto';
    this.setKeyLock(true);
    this.buildDeck(); this.buildChannel();
    this.ws = $<HTMLCanvasElement>('#ws' + id); this.wo = $<HTMLCanvasElement>('#wo' + id);
    this.vuEl = $('#vu' + id);
    this.wo.addEventListener('click', e => {
      if (!this.audio.duration) return;
      const r = this.wo.getBoundingClientRect();
      this.seek((e.clientX - r.left) / r.width * this.audio.duration);
    });
    [this.el, this.ws.parentNode as HTMLElement].forEach(z => {
      z.addEventListener('dragover', e => { e.preventDefault(); this.el.classList.add('drag'); });
      z.addEventListener('dragleave', () => this.el.classList.remove('drag'));
      z.addEventListener('drop', e => {
        e.preventDefault(); this.el.classList.remove('drag');
        const f = [...(e.dataTransfer?.files ?? [])].find(f => f.type.startsWith('audio') || AUDIO_EXT.test(f.name));
        if (f) void this.load(f);
      });
    });
    // wheel anywhere on deck (not on a control) = tempo
    this.el.addEventListener('wheel', e => { e.preventDefault(); this.tempoF.nudge(e.deltaY < 0 ? 1 : -1); }, { passive: false });
  }

  /** Element with data-a="…" inside this deck. */
  q(a: string): HTMLElement { return this.el.querySelector<HTMLElement>(`[data-a="${a}"]`)!; }

  private buildDeck(): void {
    const L = this.id;
    this.el.innerHTML = `
      <div class="dtop"><div class="dname">${L}</div><div class="dtitle">Şarkı yok — sürükle bırak ya da LOAD</div>
        <div class="dbpm" title="Tık: ×2 · Shift+tık: ½">— <small>BPM</small></div></div>
      <div class="dinfo"><span class="rem">-0:00</span><span class="tp">±0.00%</span><span class="kl">KEY LOCK</span><span class="lp"></span></div>
      <div class="dbody">
        <div class="jogwrap"><div class="jog" data-a="jog"><div class="platter"><i></i></div><div class="jogc"><div><b class="jt">0:00</b><span class="jr">-0:00</span></div></div></div></div>
        <div class="tcol"><span class="lbl">TEMPO</span><div class="tf" data-a="tempo"></div>
          <button class="b" data-a="tempoReset">0%</button></div>
      </div>
      <div class="row">
        <button class="b amber" data-a="sync">SYNC</button>
        <button class="b" data-a="keylock">KEY</button>
        <button class="b" data-a="loop">LOOP</button>
        <button class="b" data-a="loopHalf">½</button>
        <button class="b" data-a="loopDouble">×2</button>
        <button class="b" data-a="load">LOAD</button>
        <input type="file" accept="audio/*" hidden>
      </div>
      <div class="pads">
        ${[1, 2, 3, 4].map(n => `<button class="pad hc" data-a="hot${n}">HOT CUE ${n}</button>`).join('')}
        ${[1, 2, 4, 8].map(n => `<button class="pad lp" data-a="bl${n}">LOOP ${n}</button>`).join('')}
      </div>
      <div class="transport">
        <button class="round cue" data-a="cue">CUE</button>
        <button class="round play" data-a="play">▶❚❚</button>
        <div class="sp"></div>
        <button class="b" data-a="bendDown">◀ BEND</button>
        <button class="b" data-a="bendUp">BEND ▶</button>
      </div>`;
    const q = (a: string) => this.q(a);
    const sel = (s: string) => this.el.querySelector<HTMLElement>(s)!;
    this.ui = {
      title: sel('.dtitle'), bpm: sel('.dbpm'), rem: sel('.rem'), tp: sel('.tp'), kl: sel('.kl'), lp: sel('.lp'),
      jt: sel('.jt'), jr: sel('.jr'), platter: sel('.platter'),
    };

    this.tempoF = new Fader(q('tempo'), {
      min: -0.16, max: 0.16, def: 0, step: 0.001,
      // applyFX keeps the echo time locked to the current tempo
      onchange: v => { this.tempo = v; this.applyRate(); this.applyFX(); },
    });
    q('tempo').classList.add('tick');

    const file = this.el.querySelector<HTMLInputElement>('input[type=file]')!;
    file.onchange = () => { if (file.files?.[0]) void this.load(file.files[0]); file.value = ''; };
    this.file = file;

    const click = (a: string, fn: (e: MouseEvent) => void) => q(a).addEventListener('click', e => { ensureCtx(); fn(e); });
    for (const a of ['play', 'cue', 'sync', 'keylock', 'loop', 'loopHalf', 'loopDouble', 'load', 'tempoReset']) click(a, () => this.act(a));
    [1, 2, 3, 4].forEach((n, i) => click('hot' + n, e => this.act(e.shiftKey ? 'hotDel' : 'hot', i)));
    [1, 2, 4, 8].forEach(n => click('bl' + n, () => this.beatLoop(n)));

    const hold = (a: string, v: number) => {
      const b = q(a);
      b.onpointerdown = () => { ensureCtx(); this.setBend(v); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => this.setBend(0);
    };
    hold('bendDown', -0.04); hold('bendUp', 0.04);

    this.ui.bpm.onclick = e => {
      if (!this.bpm) return;
      this.bpm = e.shiftKey ? this.bpm / 2 : this.bpm * 2;
      if (this.bpm > 200) this.bpm /= 4;
      this.updLoop();
    };

    // jog: while playing = nudge (pitch bend), while paused = scrub
    const jog = q('jog');
    let last: number | null = null, lastT = 0;
    const ang = (e: PointerEvent) => {
      const r = jog.getBoundingClientRect();
      return Math.atan2(e.clientY - r.top - r.height / 2, e.clientX - r.left - r.width / 2);
    };
    jog.addEventListener('pointerdown', e => { ensureCtx(); jog.setPointerCapture(e.pointerId); last = ang(e); lastT = performance.now(); });
    jog.addEventListener('pointermove', e => {
      if (last == null) return;
      const a = ang(e);
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      if (!this.audio.src) return;
      if (this.audio.paused) this.seek(this.audio.currentTime + d / (2 * Math.PI) * 1.8);
      else {
        const now = performance.now(), dt = Math.max(8, now - lastT);
        lastT = now;
        this.jogBend = clamp(d / dt * 60, -0.5, 0.5); this.jogStamp = now; this.applyRate();
      }
    });
    const jogEnd = () => { last = null; this.jogBend = 0; this.applyRate(); };
    jog.addEventListener('pointerup', jogEnd);
    jog.addEventListener('pointercancel', jogEnd);
  }

  private buildChannel(): void {
    const c = this.ch;
    const clearKill = (k: 'lo' | 'mid' | 'hi') => () => { this.kills[k] = false; this.applyEQ(); };
    this.trimK = new Knob(c, { min: 0, max: 2, def: 1, label: 'TRIM', onchange: v => { if (this.trim) this.trim.gain.value = v; } });
    this.hiK = new Knob(c, { min: -26, max: 6, def: 0, label: 'HI', onchange: () => this.applyEQ(), onreset: clearKill('hi') });
    this.midK = new Knob(c, { min: -26, max: 6, def: 0, label: 'MID', onchange: () => this.applyEQ(), onreset: clearKill('mid') });
    this.loK = new Knob(c, { min: -26, max: 6, def: 0, label: 'LOW', onchange: () => this.applyEQ(), onreset: clearKill('lo') });
    this.filK = new Knob(c, { min: -1, max: 1, def: 0, label: 'FILTER', onchange: v => this.applyFilter(v) });

    const fx = document.createElement('div'); fx.className = 'fxrow'; c.appendChild(fx);
    this.fxBtn = document.createElement('button'); this.fxBtn.className = 'b'; this.fxBtn.dataset.a = 'fx'; this.fxBtn.textContent = 'ECHO';
    this.fxBtn.onclick = () => { ensureCtx(); this.act('fx'); };
    fx.appendChild(this.fxBtn);
    this.fxK = new Knob(fx, { min: 0, max: 1, def: 0.5, onchange: () => this.applyFX() });
    this.fxK.el.style.width = this.fxK.el.style.height = '34px';
    this.fxK.ind.style.transformOrigin = '50% 13px'; this.fxK.ind.style.height = '9px';

    const fd = document.createElement('div'); fd.dataset.a = 'fader'; c.appendChild(fd);
    const lb = document.createElement('div'); lb.className = 'lbl2'; lb.textContent = 'KANAL'; c.appendChild(lb);
    this.chF = new Fader(fd, { min: 0, max: 1, def: 0.85, onchange: v => { if (this.chGain) this.chGain.gain.value = v * v; } });
    fd.style.height = '150px';

    this.hiK.w.dataset.a = 'killHigh'; this.midK.w.dataset.a = 'killMid'; this.loK.w.dataset.a = 'killLow';
    this.filK.w.dataset.a = 'filter'; this.trimK.w.dataset.a = 'trim';
  }

  /** Build the Web Audio graph (once, after the AudioContext exists). */
  wire(): void {
    if (this.wired || !engine.ctx || !engine.master) return;
    this.wired = true;
    const C = engine.ctx;
    this.src = C.createMediaElementSource(this.audio);
    this.trim = C.createGain(); this.trim.gain.value = this.trimK.v;
    this.lo = C.createBiquadFilter(); this.lo.type = 'lowshelf'; this.lo.frequency.value = 220;
    this.mid = C.createBiquadFilter(); this.mid.type = 'peaking'; this.mid.frequency.value = 1000; this.mid.Q.value = 0.7;
    this.hi = C.createBiquadFilter(); this.hi.type = 'highshelf'; this.hi.frequency.value = 3800;
    this.fil = C.createBiquadFilter();
    this.chGain = C.createGain(); this.chGain.gain.value = this.chF.v ** 2;
    this.xfG = C.createGain();
    this.fxSend = C.createGain(); this.fxSend.gain.value = 0;
    this.delay = C.createDelay(4); this.fb = C.createGain(); this.fb.gain.value = 0.45;
    this.an = C.createAnalyser(); this.an.fftSize = 1024;
    this.src.connect(this.trim).connect(this.lo).connect(this.mid).connect(this.hi).connect(this.fil).connect(this.chGain);
    this.chGain.connect(this.xfG); this.chGain.connect(this.an);
    this.chGain.connect(this.fxSend).connect(this.delay);
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(this.xfG);
    this.xfG.connect(engine.master);
    this.applyEQ(); this.applyFilter(this.filK.v); this.applyFX();
  }

  async load(f: File): Promise<void> {
    const ctx = ensureCtx();
    if (this.url) URL.revokeObjectURL(this.url);
    this.audio.pause();
    this.url = URL.createObjectURL(f);
    this.audio.src = this.url;
    Object.assign(this, { cuePt: 0, hot: [null, null, null, null], bpm: null, loopOn: false, peaks: null, ovImg: null });
    this.ui.title.textContent = f.name.replace(/\.[^.]+$/, '');
    this.updLoop();
    toast(`Deck ${this.id}: analiz ediliyor…`);
    try {
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const ch = buf.getChannelData(0);
      this.peaks = computePeaks(ch, buf.sampleRate);
      this.bpm = detectBPM(ch, buf.sampleRate);
      this.buildOverview(); this.updLoop();
      toast(`Deck ${this.id} hazır${this.bpm ? ' · ' + this.bpm + ' BPM' : ''}`);
    } catch {
      toast('Dalga formu çıkarılamadı, şarkı yine de çalar');
    }
  }

  private buildOverview(): void {
    const c = document.createElement('canvas'), W = 1600, H = 44;
    c.width = W; c.height = H;
    const g = c.getContext('2d')!;
    const p = this.peaks!, n = p.length;
    g.fillStyle = this.color;
    for (let x = 0; x < W; x++) {
      const a = Math.floor(x / W * n), b = Math.floor((x + 1) / W * n);
      let m = 0;
      for (let i = a; i < b; i++) if (p[i] > m) m = p[i];
      const h = m * H * 0.95;
      g.fillRect(x, (H - h) / 2, 1, h || 1);
    }
    this.ovImg = c;
  }

  /* ---------- actions ---------- */
  act(a: string, arg = 0): void {
    const au = this.audio, has = !!au.src;
    switch (a) {
      case 'play': if (!has) return; if (au.paused) au.play().catch(() => {}); else au.pause(); break;
      case 'cue': if (!has) return; if (au.paused) this.cuePt = au.currentTime; else { au.pause(); this.seek(this.cuePt); } break;
      case 'sync': this.sync(); break;
      case 'keylock': this.setKeyLock(!this.keyLock); break;
      case 'loop': if (this.loopOn) { this.loopOn = false; this.updLoop(); } else this.beatLoop(this.loopBeats); break;
      case 'loopHalf': this.resizeLoop(0.5); break;
      case 'loopDouble': this.resizeLoop(2); break;
      case 'load': this.file.click(); break;
      case 'tempoDown': this.tempoF.nudge(-1); break;
      case 'tempoUp': this.tempoF.nudge(1); break;
      case 'tempoReset': this.tempoF.set(0); break;
      case 'faderDown': this.chF.nudge(-1); break;
      case 'faderUp': this.chF.nudge(1); break;
      case 'filterDown': this.filK.nudge(-1); break;
      case 'filterUp': this.filK.nudge(1); break;
      case 'filterReset': this.filK.set(0); break;
      case 'killLow': this.kills.lo = !this.kills.lo; this.applyEQ(); break;
      case 'killMid': this.kills.mid = !this.kills.mid; this.applyEQ(); break;
      case 'killHigh': this.kills.hi = !this.kills.hi; this.applyEQ(); break;
      case 'eqReset': this.hiK.set(0); this.midK.set(0); this.loK.set(0); this.kills = { lo: false, mid: false, hi: false }; this.applyEQ(); break;
      case 'fx': this.fxOn = !this.fxOn; this.applyFX(); break;
      case 'fxDown': this.fxK.nudge(-1); break;
      case 'fxUp': this.fxK.nudge(1); break;
      case 'hot': {
        if (!has) return;
        const h = this.hot[arg];
        if (h == null) this.hot[arg] = au.currentTime;
        else { this.seek(h); if (au.paused) au.play().catch(() => {}); }
        break;
      }
      case 'hotDel': this.hot[arg] = null; break;
    }
  }

  seek(t: number): void {
    if (!this.audio.duration) return;
    this.audio.currentTime = clamp(t, 0, this.audio.duration - 0.05);
  }

  setKeyLock(on: boolean): void {
    this.keyLock = on;
    const a = this.audio;
    a.preservesPitch = a.mozPreservesPitch = a.webkitPreservesPitch = on;
  }

  setBend(v: number): void { this.bend = v; this.applyRate(); }

  applyRate(): void { this.audio.playbackRate = clamp(1 + this.tempo + this.bend + this.jogBend, 0.25, 3); }

  beatLen(): number { return 60 / (this.bpm || 120); }

  beatLoop(beats: number): void {
    if (!this.audio.src) return;
    ensureCtx();
    if (this.loopOn && this.loopBeats === beats) { this.loopOn = false; this.updLoop(); return; }
    this.loopBeats = beats;
    this.loopS = this.audio.currentTime;
    this.loopE = this.loopS + beats * this.beatLen();
    this.loopOn = true;
    this.updLoop();
  }

  resizeLoop(f: number): void {
    this.loopBeats = clamp(this.loopBeats * f, 0.125, 32);
    if (this.loopOn) this.loopE = this.loopS + this.loopBeats * this.beatLen();
    this.updLoop();
  }

  updLoop(): void {
    const b = this.loopBeats, s = b < 1 ? '1/' + Math.round(1 / b) : String(b);
    if (this.ui) this.ui.lp.textContent = this.loopOn ? `LOOP ${s} beat` : `loop: ${s}`;
    this.applyFX();
  }

  sync(): void {
    const o = this.other, target = o.bpm ? o.bpm * (1 + o.tempo) : null;
    if (!target || !this.bpm) { toast('SYNC için iki deck\'te de BPM gerekli'); return; }
    const t = target / this.bpm - 1;
    if (Math.abs(t) > 0.16) { toast('Tempo farkı ±%16 dışında (BPM\'e tıklayıp ×2/½ dene)'); return; }
    this.tempoF.set(t);
    toast(`Deck ${this.id} → ${target.toFixed(1)} BPM`);
  }

  applyEQ(): void {
    const k = this.kills;
    if (!this.loK) return;
    this.hiK.el.classList.toggle('kill', k.hi);
    this.midK.el.classList.toggle('kill', k.mid);
    this.loK.el.classList.toggle('kill', k.lo);
    if (!this.hi || !this.mid || !this.lo) return;
    this.hi.gain.value = k.hi ? -40 : this.hiK.v;
    this.mid.gain.value = k.mid ? -40 : this.midK.v;
    this.lo.gain.value = k.lo ? -40 : this.loK.v;
  }

  applyFilter(v: number): void {
    const f = this.fil;
    if (!f) return;
    if (Math.abs(v) < 0.03) { f.type = 'lowpass'; f.frequency.value = 22000; f.Q.value = 0.7; }
    else if (v < 0) { f.type = 'lowpass'; f.frequency.value = 20000 * Math.pow(150 / 20000, -v); f.Q.value = 1.2; }
    else { f.type = 'highpass'; f.frequency.value = 20 * Math.pow(6000 / 20, v); f.Q.value = 1.2; }
  }

  applyFX(): void {
    this.fxBtn?.classList.toggle('on', this.fxOn);
    if (!this.fxSend || !this.delay) return;
    this.fxSend.gain.value = this.fxOn ? this.fxK.v : 0;
    this.delay.delayTime.value = clamp(this.beatLen() * 0.75 / (1 + this.tempo), 0.05, 3.9);
  }

  /* ---------- per-frame UI ---------- */
  frame(now: number): void {
    const au = this.audio, dur = au.duration || 0, t = au.currentTime, ui = this.ui;
    if (this.loopOn && t >= this.loopE) this.seek(this.loopS + (t - this.loopE));
    if (this.jogBend && now - this.jogStamp > 90) { this.jogBend = 0; this.applyRate(); }
    ui.platter.style.transform = `rotate(${t * 200}deg)`; // ~33 1/3 rpm
    setText(ui.jt, fmt(t));
    setText(ui.jr, '-' + fmt(dur - t));
    setText(ui.rem, '-' + fmt(dur - t));
    const tp = this.tempo * 100;
    setText(ui.tp, (tp >= 0 ? '+' : '') + tp.toFixed(2) + '%');
    ui.kl.style.color = this.keyLock ? 'var(--green)' : '';
    const bpm = this.bpm ? (this.bpm * (1 + this.tempo)).toFixed(1) : '—';
    const bpmHtml = `${bpm} <small>BPM</small>`;
    if (ui.bpm.innerHTML !== bpmHtml) ui.bpm.innerHTML = bpmHtml;

    // LEDs
    const pl = this.q('play');
    pl.classList.toggle('on', !au.paused);
    pl.classList.toggle('blink', au.paused && !!au.src);
    this.q('cue').classList.toggle('on', au.paused && !!au.src && Math.abs(t - this.cuePt) < 0.05);
    this.q('keylock').classList.toggle('on', this.keyLock);
    this.q('loop').classList.toggle('on', this.loopOn);
    this.hot.forEach((h, i) => this.q('hot' + (i + 1)).classList.toggle('set', h != null));
    [1, 2, 4, 8].forEach(n => this.q('bl' + n).classList.toggle('on', this.loopOn && this.loopBeats === n));

    // VU
    if (this.an) {
      this.an.getFloatTimeDomainData(this.anBuf);
      let m = 0;
      for (const v of this.anBuf) { const a = Math.abs(v); if (a > m) m = a; }
      const db = 20 * Math.log10(m || 1e-6);
      this.vu = Math.max(this.vu * 0.9, clamp((db + 48) / 48, 0, 1));
      this.vuEl.style.height = this.vu * 100 + '%';
    }
    this.drawWaves(t, dur);
  }

  private drawWaves(t: number, dur: number): void {
    const c = this.ws, g = c.getContext('2d')!, W = c.width, H = c.height, dpr = devicePixelRatio;
    g.fillStyle = '#0f1114'; g.fillRect(0, 0, W, H);
    const span = 7, x0 = W / 2, sx = W / span;
    if (this.peaks) {
      const p = this.peaks, n = p.length, step = Math.max(1, Math.floor(W / 900));
      for (let x = 0; x < W; x += step) {
        const tt = t + (x - x0) / sx, i = Math.floor(tt * PPS);
        if (i < 0 || i >= n) continue;
        const h = p[i] * H * 0.92;
        g.fillStyle = tt < t ? this.color + '88' : this.color;
        g.fillRect(x, (H - h) / 2, step, h);
      }
      if (this.bpm) {
        g.fillStyle = '#ffffff22';
        const bl = this.beatLen(), first = Math.ceil((t - span / 2) / bl);
        for (let k = first; k * bl < t + span / 2; k++) g.fillRect(x0 + (k * bl - t) * sx, 0, 1, H);
      }
    } else { g.fillStyle = '#ffffff22'; g.fillRect(0, H / 2, W, 1); }
    if (this.loopOn) { g.fillStyle = '#3ce37a30'; g.fillRect(x0 + (this.loopS - t) * sx, 0, (this.loopE - this.loopS) * sx, H); }
    const mark = (tt: number, col: string, w: number) => {
      const x = x0 + (tt - t) * sx;
      if (x >= -2 && x <= W + 2) { g.fillStyle = col; g.fillRect(x - w / 2, 0, w, H); }
    };
    if (dur) {
      mark(this.cuePt, '#ffb020', 2 * dpr);
      this.hot.forEach(h => { if (h != null) mark(h, '#b98bff', 2 * dpr); });
    }
    g.fillStyle = '#fff'; g.fillRect(x0 - dpr, 0, 2 * dpr, H);

    // overview
    const o = this.wo, og = o.getContext('2d')!, OW = o.width, OH = o.height;
    og.fillStyle = '#0f1114'; og.fillRect(0, 0, OW, OH);
    if (this.ovImg) og.drawImage(this.ovImg, 0, 0, OW, OH);
    if (dur) {
      const px = t / dur * OW;
      og.fillStyle = '#0f1114aa'; og.fillRect(0, 0, px, OH);
      og.fillStyle = '#ffb020'; og.fillRect(this.cuePt / dur * OW - 1, 0, 2, OH);
      og.fillStyle = '#b98bff';
      this.hot.forEach(h => { if (h != null) og.fillRect(h / dur * OW - 1, 0, 2, OH); });
      og.fillStyle = '#fff'; og.fillRect(px - 1, 0, 2, OH);
    }
  }
}
