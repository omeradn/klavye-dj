/** "🎛️ Kontrol" window: MIDI Learn (two tabs: MIDI and TUŞLAR). */
import type { Deck } from '../engine/deck';
import { $, keyLabel, setLabelLayout, toast } from '../util';
import { BIND, applyKey, keymapCfg, resetKeys, sanitize, setKeymap, slots } from '../input/keymap';
import {
  cancelLearn, exportMidi, importMidi, midiCfg, onMidiChange, openMidi, removeBinding, startLearn,
  targetChoices, targetLabel, setMidiDecks,
} from '../midi/midi';
import { buildHelpTable } from './help';
import { refreshBadges } from './badges';

type Tab = 'midi' | 'keys';
let tab: Tab = 'midi';
let decksRef: Deck[] = [];
/** key-map slot id waiting for a key press, or null */
let capturing: string | null = null;
let learnPick = '';

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** "cc:0:7" -> "CC 7 · kanal 1" */
function keyText(key: string): string {
  const p = key.split(':');
  if (p[0] === 'pb') return `pitch bend · kanal ${+p[1] + 1}`;
  const kind = p[0] === 'note' ? 'nota' : 'CC';
  return `${kind} ${p[2]} · kanal ${+p[1] + 1}`;
}

function renderMidi(): void {
  const choices = targetChoices();
  const picked = learnPick || choices[0].items[0]?.[0] || '';
  const learning = midiCfg.learn != null;
  $('#ctrlBody').innerHTML = `
    <p class="cStatus">${esc(midiCfg.status)}</p>
    <div class="cRow">
      <button class="hbtn" id="midiOpen">MIDI'yi aç</button>
      <span class="note">Son gelen: <code>${esc(midiCfg.last || '—')}</code></span>
    </div>
    <fieldset><legend>MIDI Learn · 3 adım</legend>
      <div class="cRow">
        <select id="learnSel">${choices.map(g => `<optgroup label="${esc(g.group)}">${g.items.map(([v, l]) =>
          `<option value="${esc(v)}"${v === picked ? ' selected' : ''}>${esc(l)}</option>`).join('')}</optgroup>`).join('')}</select>
        ${learning
          ? `<button class="hbtn primary" id="learnBtn">✋ Kontrole dokun…</button><button class="hbtn" id="learnCancel">İptal</button>`
          : `<button class="hbtn primary" id="learnBtn">1 · Öğren</button>`}
      </div>
      <p class="note">1) Listeden kontrolü seç (ör. "Tempo · Deck A") &nbsp; 2) "Öğren"e bas &nbsp; 3) Kontrolcüde o knob'u çevir ya da düğmeye bas.</p>
    </fieldset>
    <table class="cTable">
      <tr><th>Kontrol</th><th>Kontrolcüdeki</th><th></th></tr>
      ${midiCfg.bindings.length ? midiCfg.bindings.map(b => `<tr><td>${esc(targetLabel(b.target))}</td><td>${esc(keyText(b.key))}</td>
        <td><button class="hbtn" data-unbind="${esc(b.target)}" title="Bağlantıyı kaldır">×</button></td></tr>`).join('')
        : '<tr><td colspan="3" class="note">Henüz bağlı kontrol yok.</td></tr>'}
    </table>
    <fieldset><legend>Dosya olarak sakla / yükle</legend>
      <div class="cRow"><button class="hbtn" id="midiExp">Dışa aktar</button><button class="hbtn" id="midiImp">İçe aktar</button></div>
      <textarea id="ctrlTxt" rows="4" placeholder="Dışa aktarılan metin burada görünür; yüklemek için metni buraya yapıştır"></textarea>
    </fieldset>`;
}

function renderKeys(): void {
  const ov = keymapCfg.ov, all = slots(ov);
  const cell = (id: string, code: string) => {
    if (capturing === id) return `<button class="kc waiting" data-id="${esc(id)}">… bas</button>`;
    return `<button class="kc" data-id="${esc(id)}">${code ? `<kbd>${esc(keyLabel(code))}</kbd>` : '<span class="note">—</span>'}</button>`;
  };
  const rows = BIND.filter(r => !/^pad[1-37]$/.test(r[0]) && r[0] !== 'pad5' && r[0] !== 'pad6').map(r => {
    const id = (d: number) => `${r[0]}|${r[3]}|${d}`;
    const code = (d: number) => all.find(s => s.id === id(d))?.code ?? '';
    return `<tr><td>${r[3] ? '⇧ ' : ''}${esc(r[4])}</td>${[0, 1, 2, 3].map(d => `<td>${cell(id(d), code(d))}</td>`).join('')}</tr>`;
  }).join('');
  $('#ctrlBody').innerHTML = `
    <div class="cRow">
      <label>Etiketler: <select id="layoutSel">
        <option value="tr"${ov.layout === 'tr' ? ' selected' : ''}>Türkçe Q</option>
        <option value="us"${ov.layout === 'us' ? ' selected' : ''}>US</option></select></label>
      <button class="hbtn" id="keysReset">Varsayılana dön</button>
    </div>
    <p class="note">Bir hücreye tıkla, yeni tuşa bas. <b>Esc</b> iptal, <b>Delete</b> tuşu kaldırır. Tuş başka bir kontrolde varsa onay sorulur; o kontrolün tuşu kalkar.</p>
    <table class="cTable kmap"><tr><th>Kontrol</th><th>Deck A</th><th>Deck B</th><th>Deck C</th><th>Deck D</th></tr>${rows}</table>
    <fieldset><legend>Dosya olarak sakla / yükle</legend>
      <div class="cRow"><button class="hbtn" id="keysExp">Dışa aktar</button><button class="hbtn" id="keysImp">İçe aktar</button></div>
      <textarea id="ctrlTxt" rows="4" placeholder="Dışa aktarılan metin burada görünür; yüklemek için metni buraya yapıştır"></textarea>
    </fieldset>`;
}

function render(): void {
  document.querySelectorAll<HTMLElement>('#ctrlTabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === tab));
  if (tab === 'midi') renderMidi(); else renderKeys();
}

/** Ask for the new key of a slot, then store it (asks before taking a key from another control). */
function captureKey(id: string): void {
  capturing = id;
  keymapCfg.capturing = true;
  render();
  const finish = () => {
    window.removeEventListener('keydown', onKey, true);
    capturing = null;
    keymapCfg.capturing = false;
    render();
  };
  const onKey = (e: KeyboardEvent) => {
    e.preventDefault(); e.stopPropagation();
    if (e.code === 'Escape') { finish(); return; }
    if (/^(Shift|Control|Alt|Meta|AltGraph)/.test(e.code)) return;   // modifiers alone are not keys
    const code = e.code === 'Delete' ? '' : e.code;
    const r = applyKey(keymapCfg.ov, id, code);
    if (code && r.displaced && !confirm(`${keyLabel(code)} tuşu şu an "${r.displaced.label}" için kullanılıyor. Yine de bu kontrole atansın mı? (Onun tuşu kalkar)`)) {
      finish(); return;
    }
    setKeymap(r.ov);
    if (r.displaced) toast(`"${r.displaced.label}" tuşu kaldırıldı`);
    buildHelpTable();
    refreshBadges(decksRef);
    finish();
  };
  window.addEventListener('keydown', onKey, true);
}

export function toggleControl(v?: boolean): void {
  const el = $('#control'), show = v ?? !el.classList.contains('show');
  el.classList.toggle('show', show);
  if (!show && capturing) { capturing = null; keymapCfg.capturing = false; }
  if (show) render();
}

export function controlOpen(): boolean { return $('#control').classList.contains('show'); }

export function setupControl(decks: Deck[]): void {
  decksRef = decks;
  setMidiDecks(decks);
  setLabelLayout(keymapCfg.ov.layout);
  $('#ctrlBtn').onclick = () => toggleControl();
  $('#ctrlClose').onclick = () => toggleControl(false);
  $('#ctrlTabs').onclick = e => {
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-t]')?.dataset.t as Tab | undefined;
    if (!t) return;
    if (capturing) { capturing = null; keymapCfg.capturing = false; }
    tab = t; render();
  };
  $('#ctrlBody').addEventListener('click', e => {
    const el = e.target as HTMLElement;
    const btn = el.closest<HTMLElement>('button');
    const id = btn?.dataset.id;
    if (btn?.classList.contains('kc') && id) { captureKey(id); return; }
    if (el.closest('#midiOpen')) { void openMidi(); return; }
    if (el.closest('#learnBtn')) { if (midiCfg.learn) cancelLearn(); else startLearn(($('#learnSel') as HTMLSelectElement).value); return; }
    if (el.closest('#learnCancel')) { cancelLearn(); return; }
    if (btn?.dataset.unbind) { removeBinding(btn.dataset.unbind); return; }
    if (el.closest('#midiExp')) { ($('#ctrlTxt') as HTMLTextAreaElement).value = exportMidi(); return; }
    if (el.closest('#midiImp')) {
      if (importMidi(($('#ctrlTxt') as HTMLTextAreaElement).value)) toast('Kontrol bağlantıları yüklendi');
      else toast('Bu metin geçerli bir bağlantı listesi değil');
      return;
    }
    if (el.closest('#keysReset')) {
      if (!confirm('Tüm tuşlar varsayılana dönsün mü? (Bağlantıların kaybolur)')) return;
      setKeymap(resetKeys(keymapCfg.ov)); buildHelpTable(); refreshBadges(decksRef); render(); return;
    }
    if (el.closest('#keysExp')) { ($('#ctrlTxt') as HTMLTextAreaElement).value = JSON.stringify(keymapCfg.ov, null, 2); return; }
    if (el.closest('#keysImp')) {
      try {
        const ov = sanitize(JSON.parse(($('#ctrlTxt') as HTMLTextAreaElement).value));
        setKeymap(ov); setLabelLayout(ov.layout); buildHelpTable(); refreshBadges(decksRef); render();
        toast('Tuş haritası yüklendi');
      } catch { toast('Bu metin geçerli bir tuş haritası değil'); }
    }
  });
  $('#ctrlBody').addEventListener('change', e => {
    const el = e.target as HTMLElement;
    if (el.id === 'layoutSel') {
      const l = (el as HTMLSelectElement).value === 'us' ? 'us' : 'tr';
      setKeymap({ ...keymapCfg.ov, layout: l });
      setLabelLayout(l);
      buildHelpTable(); refreshBadges(decksRef); render();
    }
  });
  // MIDI messages arrive many times a second: only touch the status line, and redraw the list
  // when the learn state or the bindings change (the picker keeps what the user chose)
  let learnWas = midiCfg.learn != null, bindsWas = JSON.stringify(midiCfg.bindings);
  onMidiChange(() => {
    if (!controlOpen() || tab !== 'midi' || capturing) return;
    const learnNow = midiCfg.learn != null, bindsNow = JSON.stringify(midiCfg.bindings);
    if (learnNow !== learnWas || bindsNow !== bindsWas) { learnWas = learnNow; bindsWas = bindsNow; renderMidi(); return; }
    const st = document.querySelector('#ctrlBody .cStatus'), last = document.querySelector('#ctrlBody code');
    if (st) st.textContent = midiCfg.status;
    if (last) last.textContent = midiCfg.last || '—';
  });
}
