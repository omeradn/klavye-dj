import { $, clamp, fmt, toast, setText } from '../util';
import { Knob, Fader } from '../ui/controls';
import { engine, ensureCtx, ramp } from './context';
import { detectBPM } from '../analysis/bpm';
import { computePeaks, PPS } from '../analysis/peaks';
import { DEMOS, renderDemo } from '../demo/synth';
import type { DeckIn, DeckState } from './worklets/protocol';

const AUDIO_EXT = /\.(mp3|wav|m4a|aac|ogg|flac|aiff?)$/i;
/** One platter revolution = 1.8 s of audio (33 1/3 rpm vinyl). */
const SEC_PER_REV = 1.8;
/** Jog ring (outer part) = nudge; inner part = scratch (when VINYL is on). */
const JOG_RING = 0.8;

/**
 * One deck: transport, tempo, cues, loops + its mixer channel strip.
 * Audio is played by the 'deck' AudioWorklet (src/engine/worklets/deck-processor.ts);
 * this class keeps a mirror of its state for the UI.
 */
export class Deck {
  readonly id: string;
  readonly i: number;
  readonly color: string;
  readonly el: HTMLElement;
  readonly ch: HTMLElement;
  /** The opposite deck (used by SYNC). */
  other!: Deck;

  // track
  len = 0;           // samples
  sr = 48000;
  title = '';
  // mirror of the worklet state
  pos = 0; posAt = 0; rateNow = 0; playing = false; audible = false;

  tempo = 0; bend = 0; jogBend = 0; jogStamp = 0;
  cuePt = 0; cuePreview = false;
  hot: (number | null)[] = [null, null, null, null];
  bpm: number | null = null;
  loopOn = false; loopBeats = 4; loopS = 0; loopE = 0;
  kills = { lo: false, mid: false, hi: false };
  fxOn = false; keyLock = false;
  reverse = false; slip = false; censor = false; vinyl = true;
  scratching = false; scratchLast = 0; scratchIdle = true;
  peaks: Float32Array | null = null;
  ovImg: HTMLCanvasElement | null = null;
  demoIdx: number;
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
  node?: AudioWorkletNode;
  trim?: GainNode;
  lo?: BiquadFilterNode; mid?: BiquadFilterNode; hi?: BiquadFilterNode; fil?: BiquadFilterNode;
  chGain?: GainNode; xfG?: GainNode; fxSend?: GainNode; fb?: GainNode;
  delay?: DelayNode;
  an?: AnalyserNode;
  anBuf = new Float32Array(1024);

  constructor(id: string, i: number) {
    this.id = id; this.i = i; this.color = i ? '#38c6ff' : '#ff8a3d';
    this.demoIdx = i;
    this.el = $('#deck' + id); this.ch = $('#ch' + id);
    this.buildDeck(); this.buildChannel();
    this.ws = $<HTMLCanvasElement>('#ws' + id); this.wo = $<HTMLCanvasElement>('#wo' + id);
    this.vuEl = $('#vu' + id);
    this.wo.addEventListener('click', e => {
      if (!this.len) return;
      const r = this.wo.getBoundingClientRect();
      this.seek((e.clientX - r.left) / r.width * this.duration);
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

  get has(): boolean { return this.len > 0; }
  get duration(): number { return this.len / this.sr; }

  /** Current play position in seconds (worklet snapshot + extrapolation). */
  currentTime(): number {
    if (!this.len) return 0;
    let p = this.pos;
    if (this.audible && engine.ctx) p += this.rateNow * (engine.ctx.currentTime - this.posAt) * this.sr;
    return clamp(p, 0, this.len) / this.sr;
  }

  private post(m: DeckIn, transfer: Transferable[] = []): void { this.node?.port.postMessage(m, transfer); }

  /** Element with data-a="…" inside this deck. */
  q(a: string): HTMLElement { return this.el.querySelector<HTMLElement>(`[data-a="${a}"]`)!; }

  private buildDeck(): void {
    const L = this.id;
    this.el.innerHTML = `
      <div class="dtop"><div class="dname">${L}</div><div class="dtitle">Şarkı yok — sürükle bırak, LOAD ya da DEMO</div>
        <div class="dbpm" title="Tık: ×2 · Shift+tık: ½">— <small>BPM</small></div></div>
      <div class="dinfo"><span class="rem">-0:00</span><span class="tp">±0.00%</span><span class="kl">KEY LOCK</span><span class="lp"></span></div>
      <div class="dbody">
        <div class="jogwrap"><div class="jog" data-a="jog" title="İç kısım: scratch (VINYL açıkken) · Dış halka: tempo dürtme"><div class="platter"><i></i></div><div class="jogc"><div><b class="jt">0:00</b><span class="jr">-0:00</span></div></div></div></div>
        <div class="tcol"><span class="lbl">TEMPO</span><div class="tf" data-a="tempo"></div>
          <button class="b" data-a="tempoReset">0%</button></div>
      </div>
      <div class="row">
        <button class="b amber" data-a="sync">SYNC</button>
        <button class="b" data-a="keylock">KEY</button>
        <button class="b" data-a="loop">LOOP</button>
        <button class="b" data-a="loopHalf">½</button>
        <button class="b" data-a="loopDouble">×2</button>
        <button class="b" data-a="jumpBack" title="Beat jump geri (loop boyu kadar)">◀◀</button>
        <button class="b" data-a="jumpFwd" title="Beat jump ileri (loop boyu kadar)">▶▶</button>
        <button class="b" data-a="load">LOAD</button>
        <button class="b" data-a="demo" title="Kodla üretilmiş demo parça yükle">DEMO</button>
        <input type="file" accept="audio/*" hidden>
      </div>
      <div class="row">
        <button class="b" data-a="vinyl" title="Açık: jog'un iç kısmı plak gibi scratch yapar">VINYL</button>
        <button class="b" data-a="slip" title="Loop/ters/scratch bitince şarkı kaldığı yerden değil, olması gereken yerden devam eder">SLIP</button>
        <button class="b red" data-a="reverse">REV</button>
        <button class="b red" data-a="censor" title="Basılı tut: ters çalar, bırakınca şarkı kaldığı yerden devam eder">CENSOR</button>
        <button class="b" data-a="brake" title="Plak çaları kapatır gibi yavaşça durur">BRAKE</button>
        <button class="b" data-a="spinback" title="Plağı geri savurup durdurur">SPIN</button>
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
    for (const a of ['play', 'sync', 'keylock', 'loop', 'loopHalf', 'loopDouble', 'jumpBack', 'jumpFwd', 'load', 'demo',
      'tempoReset', 'vinyl', 'slip', 'reverse', 'brake', 'spinback']) click(a, () => this.act(a));
    [1, 2, 3, 4].forEach((n, i) => click('hot' + n, e => this.act(e.shiftKey ? 'hotDel' : 'hot', i)));
    [1, 2, 4, 8].forEach(n => click('bl' + n, () => this.beatLoop(n)));

    // press-and-hold buttons
    for (const a of ['cue', 'censor', 'bendDown', 'bendUp']) {
      const b = q(a);
      let down = false;
      b.onpointerdown = e => { e.preventDefault(); ensureCtx(); down = true; this.hold(a, true); };
      b.onpointerup = b.onpointerleave = b.onpointercancel = () => { if (down) { down = false; this.hold(a, false); } };
    }

    this.ui.bpm.onclick = e => {
      if (!this.bpm) return;
      this.bpm = e.shiftKey ? this.bpm / 2 : this.bpm * 2;
      if (this.bpm > 200) this.bpm /= 4;
      this.updLoop();
    };

    this.buildJog(q('jog'));
  }

  /** Jog wheel: inner part scratches like vinyl (VINYL on); outer ring nudges while playing / scrubs while paused. */
  private buildJog(jog: HTMLElement): void {
    let last: number | null = null, lastT = 0, mode: 'scratch' | 'nudge' = 'nudge';
    const geo = (e: PointerEvent) => {
      const r = jog.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2;
      return { a: Math.atan2(dy, dx), d: Math.hypot(dx, dy) / (r.width / 2) };
    };
    jog.addEventListener('pointerdown', e => {
      ensureCtx(); jog.setPointerCapture(e.pointerId);
      const g = geo(e);
      last = g.a; lastT = performance.now();
      mode = this.vinyl && g.d < JOG_RING ? 'scratch' : 'nudge';
      if (mode === 'scratch' && this.has) this.setScratch(true, 0);
    });
    jog.addEventListener('pointermove', e => {
      if (last == null) return;
      const a = geo(e).a;
      let d = a - last;
      if (d > Math.PI) d -= 2 * Math.PI;
      if (d < -Math.PI) d += 2 * Math.PI;
      last = a;
      if (!this.has) return;
      const now = performance.now(), dt = Math.max(4, now - lastT);
      lastT = now;
      if (mode === 'scratch') this.setScratch(true, clamp(d / (2 * Math.PI) * SEC_PER_REV / (dt / 1000), -8, 8));
      else if (!this.playing) this.seek(this.currentTime() + d / (2 * Math.PI) * SEC_PER_REV);
      else { this.jogBend = clamp(d / dt * 60, -0.5, 0.5); this.jogStamp = now; this.applyRate(); }
    });
    const end = () => {
      if (last == null) return;
      last = null;
      if (mode === 'scratch') this.setScratch(false, 0);
      else { this.jogBend = 0; this.applyRate(); }
    };
    jog.addEventListener('pointerup', end);
    jog.addEventListener('pointercancel', end);
  }

  private setScratch(on: boolean, rate: number): void {
    this.scratching = on;
    this.scratchLast = performance.now();
    this.scratchIdle = rate === 0;
    this.post({ t: 'scratch', on, rate });
  }

  private buildChannel(): void {
    const c = this.ch;
    const clearKill = (k: 'lo' | 'mid' | 'hi') => () => { this.kills[k] = false; this.applyEQ(); };
    this.trimK = new Knob(c, { min: 0, max: 2, def: 1, label: 'TRIM', onchange: v => { if (this.trim) ramp(this.trim.gain, v); } });
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
    this.chF = new Fader(fd, { min: 0, max: 1, def: 0.85, onchange: v => { if (this.chGain) ramp(this.chGain.gain, v * v); } });
    fd.style.height = '150px';

    this.hiK.w.dataset.a = 'killHigh'; this.midK.w.dataset.a = 'killMid'; this.loK.w.dataset.a = 'killLow';
    this.filK.w.dataset.a = 'filter'; this.trimK.w.dataset.a = 'trim';
  }

  /**
   * Build the audio graph (once, after the worklets are loaded):
   * deck worklet -> trim -> EQ -> filter -> channel fader -> crossfader -> bus
   *                                                       crossfader -> echo send -> delay -> bus
   * (echo is post-crossfader so its tail keeps ringing after an "echo out" with the crossfader)
   */
  wire(): void {
    if (this.wired || !engine.ctx || !engine.bus) return;
    this.wired = true;
    const C = engine.ctx;
    this.node = new AudioWorkletNode(C, 'deck', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
    this.node.port.onmessage = e => {
      const s = e.data as DeckState;
      this.pos = s.pos; this.posAt = s.at; this.rateNow = s.rate; this.playing = s.playing; this.audible = s.audible;
    };
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
    this.node.connect(this.trim).connect(this.lo).connect(this.mid).connect(this.hi).connect(this.fil).connect(this.chGain);
    this.chGain.connect(this.xfG); this.chGain.connect(this.an);
    this.xfG.connect(engine.bus);
    this.xfG.connect(this.fxSend).connect(this.delay);
    this.delay.connect(this.fb).connect(this.delay);
    this.delay.connect(engine.bus);
    this.applyEQ(); this.applyFilter(this.filK.v); this.applyFX(); this.applyRate();
    this.post({ t: 'slip', on: this.slip });
  }

  /* ---------- loading ---------- */
  async load(f: File): Promise<void> {
    const ctx = ensureCtx();
    if (this.playing && !confirm(`Deck ${this.id} şu an çalıyor. Yine de yeni şarkı yüklensin mi?`)) return;
    this.ui.title.textContent = f.name.replace(/\.[^.]+$/, '');
    toast(`Deck ${this.id}: analiz ediliyor…`);
    try {
      const buf = await ctx.decodeAudioData(await f.arrayBuffer());
      const L = buf.getChannelData(0), R = buf.numberOfChannels > 1 ? buf.getChannelData(1) : L;
      this.peaks = computePeaks(L, buf.sampleRate);
      const bpm = detectBPM(L, buf.sampleRate);
      await this.setTrack(f.name.replace(/\.[^.]+$/, ''), new Float32Array(L), new Float32Array(R), buf.sampleRate, bpm);
    } catch {
      toast('Bu dosya açılamadı (desteklenmeyen biçim olabilir)');
    }
  }

  async loadDemo(): Promise<void> {
    const ctx = ensureCtx();
    if (this.playing && !confirm(`Deck ${this.id} şu an çalıyor. Yine de demo yüklensin mi?`)) return;
    const spec = DEMOS[this.demoIdx % DEMOS.length];
    this.demoIdx += 2;
    toast(`Deck ${this.id}: demo hazırlanıyor…`);
    await new Promise(r => setTimeout(r, 30)); // let the toast paint
    const { L, R } = renderDemo(spec, ctx.sampleRate);
    this.peaks = computePeaks(L, ctx.sampleRate);
    await this.setTrack(spec.name, L, R, ctx.sampleRate, spec.bpm);
  }

  private async setTrack(name: string, L: Float32Array, R: Float32Array, sr: number, bpm: number | null): Promise<void> {
    await engine.ready;
    this.wire();
    this.len = L.length; this.sr = sr; this.title = name;
    Object.assign(this, { pos: 0, posAt: 0, playing: false, audible: false, cuePt: 0, cuePreview: false,
      hot: [null, null, null, null], bpm, loopOn: false, reverse: false, censor: false, ovImg: null });
    this.post({ t: 'load', L, R }, [L.buffer, R.buffer]);
    this.applyRate();
    this.ui.title.textContent = name;
    this.buildOverview(); this.updLoop();
    toast(`Deck ${this.id} hazır${bpm ? ' · ' + bpm + ' BPM' : ''}`);
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
  private setPlaying(on: boolean): void {
    this.playing = on;
    this.audible = on || this.audible;
    this.post({ t: 'play', on });
  }

  act(a: string, arg = 0): void {
    const has = this.has;
    switch (a) {
      case 'play':
        if (!has) return;
        if (this.cuePreview) { this.cuePreview = false; return; } // CUE held + PLAY = keep playing
        this.setPlaying(!this.playing);
        break;
      case 'sync': this.sync(); break;
      case 'keylock': toast('Key lock yeni ses motoruna Faz 1b\'de ekleniyor'); break;
      case 'loop': if (this.loopOn) this.loopOff(); else this.beatLoop(this.loopBeats); break;
      case 'loopHalf': this.resizeLoop(0.5); break;
      case 'loopDouble': this.resizeLoop(2); break;
      case 'jumpFwd': case 'jumpBack': this.beatJump(a === 'jumpFwd' ? 1 : -1); break;
      case 'load': this.file.click(); break;
      case 'demo': void this.loadDemo(); break;
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
      case 'vinyl': this.vinyl = !this.vinyl; toast(this.vinyl ? 'VINYL açık: jog ile scratch' : 'VINYL kapalı: jog sadece tempo dürtme'); break;
      case 'slip': this.slip = !this.slip; this.post({ t: 'slip', on: this.slip }); break;
      case 'reverse': if (!has) return; this.reverse = !this.reverse; this.post({ t: 'reverse', on: this.reverse }); break;
      case 'brake': if (has && this.playing) this.post({ t: 'vinyl', fx: 'brake', dur: 1.2 }); break;
      case 'spinback': if (has && this.playing) this.post({ t: 'vinyl', fx: 'spin', dur: 1.0 }); break;
      case 'hot': {
        if (!has) return;
        const h = this.hot[arg];
        if (h == null) this.hot[arg] = this.currentTime();
        else { this.seek(h); if (!this.playing) this.setPlaying(true); }
        break;
      }
      case 'hotDel': this.hot[arg] = null; break;
    }
  }

  /** Press-and-hold controls (keyboard keydown/keyup or pointer down/up). */
  hold(a: string, on: boolean): void {
    switch (a) {
      case 'cue': if (on) this.cueDown(); else this.cueUp(); break;
      case 'censor': if (this.has || !on) { this.censor = on; this.post({ t: 'censor', on }); } break;
      case 'bendDown': this.setBend(on ? -0.04 : 0); break;
      case 'bendUp': this.setBend(on ? 0.04 : 0); break;
    }
  }

  /**
   * CUE like a CDJ: while playing -> back to the cue point and stop.
   * Paused away from the cue -> set a new cue here. Paused on the cue -> play while held (preview).
   */
  private cueDown(): void {
    if (!this.has) return;
    if (this.playing && !this.cuePreview) { this.setPlaying(false); this.seek(this.cuePt); return; }
    const t = this.currentTime();
    if (Math.abs(t - this.cuePt) < 0.02) { this.cuePreview = true; this.setPlaying(true); }
    else this.cuePt = t;
  }

  private cueUp(): void {
    if (!this.cuePreview) return;
    this.cuePreview = false;
    this.setPlaying(false);
    this.seek(this.cuePt);
  }

  seek(t: number): void {
    if (!this.len) return;
    const p = clamp(t, 0, this.duration - 0.05) * this.sr;
    this.pos = p; this.posAt = engine.ctx?.currentTime ?? 0;
    this.post({ t: 'seek', pos: p });
  }

  setBend(v: number): void { this.bend = v; this.applyRate(); }

  applyRate(): void { this.post({ t: 'tempo', v: clamp(1 + this.tempo + this.bend + this.jogBend, 0.25, 3) }); }

  beatLen(): number { return 60 / (this.bpm || 120); }

  beatLoop(beats: number): void {
    if (!this.has) return;
    ensureCtx();
    if (this.loopOn && this.loopBeats === beats) { this.loopOff(); return; }
    this.loopBeats = beats;
    this.loopS = this.currentTime();
    this.loopE = this.loopS + beats * this.beatLen();
    this.loopOn = true;
    this.sendLoop();
    this.updLoop();
  }

  private loopOff(): void { this.loopOn = false; this.sendLoop(); this.updLoop(); }

  private sendLoop(): void { this.post({ t: 'loop', on: this.loopOn, s: this.loopS * this.sr, e: this.loopE * this.sr }); }

  resizeLoop(f: number): void {
    this.loopBeats = clamp(this.loopBeats * f, 0.125, 32);
    if (this.loopOn) { this.loopE = this.loopS + this.loopBeats * this.beatLen(); this.sendLoop(); }
    this.updLoop();
  }

  /** Jump by the current loop size (in beats); an active loop moves along. */
  beatJump(dir: number): void {
    if (!this.has) return;
    const d = dir * this.loopBeats * this.beatLen();
    if (this.loopOn) { this.loopS += d; this.loopE += d; }
    this.pos = clamp(this.pos + d * this.sr, 0, this.len - 1);
    this.post({ t: 'jump', d: d * this.sr });
  }

  updLoop(): void {
    const b = this.loopBeats, s = b < 1 ? '1/' + Math.round(1 / b) : String(b);
    if (this.ui) this.ui.lp.textContent = this.loopOn ? `LOOP ${s} beat` : `loop/jump: ${s}`;
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
    ramp(this.hi.gain, k.hi ? -40 : this.hiK.v, 0.005);
    ramp(this.mid.gain, k.mid ? -40 : this.midK.v, 0.005);
    ramp(this.lo.gain, k.lo ? -40 : this.loK.v, 0.005);
  }

  applyFilter(v: number): void {
    const f = this.fil;
    if (!f) return;
    if (Math.abs(v) < 0.03) { f.type = 'lowpass'; ramp(f.frequency, 22000); f.Q.value = 0.7; }
    else if (v < 0) { f.type = 'lowpass'; ramp(f.frequency, 20000 * Math.pow(150 / 20000, -v)); f.Q.value = 1.2; }
    else { f.type = 'highpass'; ramp(f.frequency, 20 * Math.pow(6000 / 20, v)); f.Q.value = 1.2; }
  }

  applyFX(): void {
    this.fxBtn?.classList.toggle('on', this.fxOn);
    if (!this.fxSend || !this.delay) return;
    ramp(this.fxSend.gain, this.fxOn ? this.fxK.v : 0, 0.01);
    ramp(this.delay.delayTime, clamp(this.beatLen() * 0.75 / (1 + this.tempo), 0.05, 3.9), 0.05);
  }

  /* ---------- per-frame UI ---------- */
  frame(now: number): void {
    const dur = this.duration, t = this.currentTime(), ui = this.ui;
    if (this.jogBend && now - this.jogStamp > 90) { this.jogBend = 0; this.applyRate(); }
    // a scratching hand that stops moving holds the record still
    if (this.scratching && !this.scratchIdle && now - this.scratchLast > 35) this.setScratch(true, 0);
    ui.platter.style.transform = `rotate(${t * 360 / SEC_PER_REV}deg)`;
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
    pl.classList.toggle('on', this.playing);
    pl.classList.toggle('blink', !this.playing && this.has);
    this.q('cue').classList.toggle('on', !this.playing && this.has && Math.abs(t - this.cuePt) < 0.05);
    this.q('keylock').classList.toggle('on', this.keyLock);
    this.q('loop').classList.toggle('on', this.loopOn);
    this.q('vinyl').classList.toggle('on', this.vinyl);
    this.q('slip').classList.toggle('on', this.slip);
    this.q('reverse').classList.toggle('on', this.reverse);
    this.q('censor').classList.toggle('on', this.censor);
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
