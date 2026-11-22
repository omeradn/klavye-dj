import { $, toast } from '../util';
import { engine, ensureCtx } from '../engine/context';
import { audioSettings, saveAudioSettings, type Latency, type PhonesMode } from '../engine/settings';
import { activeMode, measuredLatencyMs, outputSupport, setMasterDevice, setPhonesMode } from '../engine/output';

const LAT: [Latency, string, string][] = [
  ['low', 'Düşük (önerilen)', 'Tuşlar en hızlı tepki verir.'],
  ['mid', 'Orta', 'Ses ara ara takılıyorsa dene.'],
  ['safe', 'Güvenli', 'Zayıf bilgisayarlar için; tuş tepkisi gözle görülür gecikir.'],
];

const MODES: [PhonesMode, string, string][] = [
  ['single', 'Tek çıkış', 'Hoparlör ve kulaklık aynı yerden çıkar (laptop, tek ses kartı). Kulaklıkta CUE için mikserdeki SPLIT: sol kulak CUE, sağ kulak master.'],
  ['quad', '4 kanallı ses kartı', 'Çıkış 1-2 = master (hoparlör), çıkış 3-4 = kulaklık. DJ kontrolcülerinin ve harici ses kartlarının çoğu böyle çalışır.'],
  ['device', 'Ayrı cihaz', 'Kulaklık başka bir ses cihazına (ör. USB kulaklık) gider. Kulaklık sesi hoparlörden biraz geride kalabilir.'],
];

let timer: ReturnType<typeof setInterval> | undefined;
/** latency setting the running AudioContext was created with */
let latencyAtStart: Latency = audioSettings.latency;

async function outputs(): Promise<MediaDeviceInfo[]> {
  try {
    return (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audiooutput');
  } catch { return []; }
}

function deviceSelect(list: MediaDeviceInfo[], current: string, withDefault: boolean): string {
  const opts = list
    // without permission the browser hides ids ('') — only the default output can be picked then
    .filter(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
    .map((d, i) => `<option value="${esc(d.deviceId)}"${d.deviceId === current ? ' selected' : ''}>${esc(d.label || `Ses çıkışı ${i + 1}`)}</option>`);
  if (withDefault) opts.unshift(`<option value=""${current === '' ? ' selected' : ''}>Sistem varsayılanı</option>`);
  return opts.join('');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

async function render(): Promise<void> {
  const list = await outputs();
  const s = audioSettings, noNames = list.length > 0 && list.every(d => !d.label);
  const ch = engine.ctx?.destination.maxChannelCount ?? 2;
  const mode = activeMode();
  const radio = (name: string, v: string, on: boolean, t: string, sub: string) =>
    `<label><input type="radio" name="${name}" value="${v}"${on ? ' checked' : ''}><span>${t}<small>${sub}</small></span></label>`;

  $('#setBody').innerHTML = `
    <fieldset><legend>ANA ÇIKIŞ (hoparlör / mikser)</legend>
      ${outputSupport.masterDevice
        ? `<select id="sMaster">${deviceSelect(list, s.masterSink, true)}</select>`
        : '<span class="warn">Bu tarayıcı çıkış cihazı seçmeyi desteklemiyor (Chrome ya da Edge kullan).</span>'}
      <div class="note" style="margin-top:6px">Bu çıkış <b>${ch}</b> kanallı.</div>
    </fieldset>
    <fieldset><legend>KULAKLIK</legend>
      ${MODES.map(([v, t, sub]) => radio('pm', v, s.phonesMode === v, t, sub)).join('')}
      <div id="pDevRow" style="margin:4px 0 0 24px;${s.phonesMode === 'device' ? '' : 'display:none'}">
        <select id="sPhones">${deviceSelect(list, s.phonesSink, true)}</select></div>
      ${s.phonesMode !== mode ? `<div class="warn">Seçilen mod kullanılamadı, şu an <b>${MODES.find(m => m[0] === mode)![1]}</b> çalışıyor.</div>` : ''}
    </fieldset>
    <fieldset><legend>GECİKME</legend>
      ${LAT.map(([v, t, sub]) => radio('lat', v, s.latency === v, t, sub)).join('')}
      <div>Ölçülen çıkış gecikmesi: <span class="meas" id="latMeas">—</span></div>
      <div id="latWarn" class="warn" style="${s.latency !== latencyAtStart ? '' : 'display:none'}">
        Yeni gecikme ayarı sayfa yenilenince geçerli olur (yüklü şarkılar kapanır).
        <button class="hbtn" id="reloadBtn">Şimdi yenile</button></div>
    </fieldset>
    ${noNames ? `<p class="note">Cihaz adları görünmüyor: tarayıcı adları ancak izin verince gösterir.
      <button class="hbtn" id="namesBtn">Cihaz adlarını göster</button>
      (mikrofon izni sorulur; mikrofon kullanılmaz, hemen kapatılır)</p>` : ''}`;

  $<HTMLSelectElement>('#sMaster')?.addEventListener('change', async e => {
    await engine.ready;
    if (await setMasterDevice((e.target as HTMLSelectElement).value)) toast('Ana çıkış değişti');
    void render();
  });
  $<HTMLSelectElement>('#sPhones')?.addEventListener('change', async e => {
    await engine.ready;
    await setPhonesMode('device', (e.target as HTMLSelectElement).value);
    toast('Kulaklık çıkışı değişti');
  });
  document.querySelectorAll<HTMLInputElement>('#setBody input[name=pm]').forEach(r => r.addEventListener('change', async () => {
    await engine.ready;
    let sink = s.phonesSink;
    if (r.value === 'device' && !sink) sink = list.find(d => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications' && d.deviceId !== s.masterSink)?.deviceId ?? '';
    await setPhonesMode(r.value as PhonesMode, sink);
    void render();
  }));
  document.querySelectorAll<HTMLInputElement>('#setBody input[name=lat]').forEach(r => r.addEventListener('change', () => {
    s.latency = r.value as Latency; saveAudioSettings();
    $('#latWarn').style.display = s.latency !== latencyAtStart ? '' : 'none';
  }));
  $('#reloadBtn')?.addEventListener('click', () => location.reload());
  $('#namesBtn')?.addEventListener('click', async () => {
    try {
      const st = await navigator.mediaDevices.getUserMedia({ audio: true });
      st.getTracks().forEach(t => t.stop());
    } catch { toast('İzin verilmedi; cihazlar numarayla gösterilecek'); }
    void render();
  });
}

function showLatency(): void {
  const ms = measuredLatencyMs(), el = document.getElementById('latMeas');
  if (el) el.textContent = ms == null ? '—' : `~${ms} ms`;
}

export function toggleSettings(v?: boolean): void {
  const el = $('#settings'), show = v ?? !el.classList.contains('show');
  el.classList.toggle('show', show);
  clearInterval(timer);
  if (!show) return;
  ensureCtx();
  void (engine.ready ?? Promise.resolve()).then(render).then(showLatency);
  timer = setInterval(showLatency, 1000);
}

export function settingsOpen(): boolean { return $('#settings').classList.contains('show'); }

export function setupSettings(): void {
  latencyAtStart = audioSettings.latency;
  $('#setBtn').onclick = () => toggleSettings();
  $('#setClose').onclick = () => toggleSettings(false);
  navigator.mediaDevices?.addEventListener?.('devicechange', () => { if (settingsOpen()) void render(); });
}
