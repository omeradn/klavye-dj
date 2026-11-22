import { BIND } from '../input/keyboard';
import { $, keyLabel } from '../util';

export function buildHelpTable(): void {
  const kb = (c: string) => `<kbd>${keyLabel(c)}</kbd>`;
  let h = '<tr><th>Kontrol</th><th>Deck A</th><th>Deck B</th></tr>';
  for (const [a, ka, kb2, sh, lab] of BIND) {
    if (/^pad[1-37]$/.test(a) || a === 'pad5' || a === 'pad6') continue;
    if (a === 'pad0') { h += `<tr><td>Pad 1–4 (üst sıra; ne yaptığı pad moduna göre)</td><td>${kb('Digit1')}–${kb('Digit4')}</td><td>${kb('Digit7')}–${kb('Digit0')}</td></tr>`; continue; }
    if (a === 'pad4') {
      h += `<tr><td>Pad 5–8 (alt sıra)</td><td>⇧ + ${kb('Digit1')}–${kb('Digit4')}</td><td>⇧ + ${kb('Digit7')}–${kb('Digit0')}</td></tr>`;
      h += `<tr><td>Hot cue sil / sampler'a kendi sesini yükle</td><td colspan="2"><kbd>Backspace</kbd> basılıyken pad tuşu (mouse: ⇧+tık ya da sağ tık)</td></tr>`;
      continue;
    }
    const p = sh ? '⇧ + ' : '';
    h += `<tr><td>${lab}</td><td>${p}${kb(ka)}</td><td>${p}${kb(kb2)}</td></tr>`;
  }
  h += `<tr><td>Crossfader sol / sağ / orta (⇧ = tam uç)</td><td colspan="2"><kbd>←</kbd> <kbd>→</kbd> <kbd>↓</kbd></td></tr>
        <tr><td>Master ses</td><td colspan="2"><kbd>PgUp</kbd> <kbd>PgDn</kbd></td></tr>
        <tr><td>Tempo (mouse)</td><td colspan="2">Deck üzerinde tekerlek</td></tr>
        <tr><td>Ses ayarları (çıkış, kulaklık, gecikme)</td><td colspan="2"><kbd>F2</kbd></td></tr>
        <tr><td>Kulaklık: SPLIT (sol kulak CUE, sağ kulak master)</td><td colspan="2">Mikserdeki SPLIT butonu</td></tr>
        <tr><td>Bu pencere</td><td colspan="2"><kbd>Esc</kbd> / <kbd>F1</kbd></td></tr>`;
  $('#helpT').innerHTML = h;
}

export function toggleHelp(v?: boolean): void {
  const el = $('#help');
  el.classList.toggle('show', v ?? !el.classList.contains('show'));
}
