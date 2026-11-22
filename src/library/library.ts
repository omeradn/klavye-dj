import { $, fmt, toast } from '../util';
import { ensureCtx } from '../engine/context';
import type { Deck } from '../engine/deck';
import { DEMOS } from '../demo/synth';
import { detectBPM } from '../analysis/bpm';
import { dbAll, dbDelete, dbGet, dbPut } from './db';
import { AUDIO_EXT, fileSig, matches, sortTracks, stripExt, type SortKey, type Track } from './model';

/* File System Access API bits missing from the TS DOM lib */
type PermState = 'granted' | 'denied' | 'prompt';
interface PermHandle { queryPermission?(o: { mode: 'read' }): Promise<PermState>; requestPermission?(o: { mode: 'read' }): Promise<PermState> }
type DirHandle = FileSystemDirectoryHandle & PermHandle & { values(): AsyncIterable<FileSystemHandle> };
type FileHandle = FileSystemFileHandle & PermHandle;
type Picker = {
  showDirectoryPicker?(o?: { id?: string; mode?: 'read' }): Promise<DirHandle>;
  showOpenFilePicker?(o?: { multiple?: boolean; types?: { description: string; accept: Record<string, string[]> }[] }): Promise<FileHandle[]>;
};
const W = window as unknown as Picker;

interface Root { id?: number; kind: 'dir' | 'file'; name: string; handle: DirHandle | FileHandle }
interface RootState { root: Root; perm: PermState; tracks: Track[] }
interface Cached { bpm: number | null; dur: number }

const MAX_DEPTH = 6;
const MAX_ROWS = 600;

let decks: Deck[] = [];
let roots: RootState[] = [];
/** files added without a saveable handle (fallback browsers) — only for this session */
let loose: Track[] = [];
let demoTracks: Track[] = [];
let query = '';
let sortKey: SortKey = 'folder';
let sortDir: 1 | -1 = 1;
let analyzing = false;
let nextId = 0;

const allTracks = (): Track[] => [...demoTracks, ...roots.flatMap(r => r.tracks), ...loose];

/* ---------- scanning ---------- */

async function scanDir(dir: DirHandle, folder: string, out: Track[], depth = 0): Promise<void> {
  if (depth > MAX_DEPTH) return;
  for await (const h of dir.values()) {
    if (h.kind === 'directory') await scanDir(h as DirHandle, h.name, out, depth + 1);
    else if (AUDIO_EXT.test(h.name)) out.push({ id: 't' + nextId++, name: stripExt(h.name), folder, handle: h as FileSystemFileHandle });
  }
}

async function loadRoot(rs: RootState): Promise<void> {
  const h = rs.root.handle;
  rs.perm = (await h.queryPermission?.({ mode: 'read' })) ?? 'granted';
  if (rs.perm !== 'granted') { rs.tracks = []; return; }
  const out: Track[] = [];
  try {
    if (rs.root.kind === 'dir') await scanDir(h as DirHandle, rs.root.name, out);
    else out.push({ id: 't' + nextId++, name: stripExt(h.name), folder: 'Tek dosyalar', handle: h as FileSystemFileHandle });
  } catch {
    toast(`"${rs.root.name}" okunamadı (taşınmış ya da silinmiş olabilir)`);
  }
  rs.tracks = out;
  await applyCache(out);
}

/** Fill BPM / duration from the analysis cache. */
async function applyCache(list: Track[]): Promise<void> {
  for (const t of list) {
    const f = await trackFile(t);
    if (!f) continue;
    t.sig = fileSig(f);
    const c = await dbGet<Cached>('analysis', t.sig).catch(() => undefined);
    if (c) { t.bpm = c.bpm; t.dur = c.dur; }
  }
}

async function trackFile(t: Track): Promise<File | null> {
  if (t.file) return t.file;
  try { return t.handle ? await t.handle.getFile() : null; } catch { return null; }
}

/* ---------- adding / removing ---------- */

async function addFolder(): Promise<void> {
  if (!W.showDirectoryPicker) { $<HTMLInputElement>('#libDirInput').click(); return; }
  let h: DirHandle;
  try { h = await W.showDirectoryPicker({ id: 'kdj-music', mode: 'read' }); } catch { return; } // cancelled
  await addRoot({ kind: 'dir', name: h.name, handle: h });
}

async function addFiles(): Promise<void> {
  if (!W.showOpenFilePicker) { $<HTMLInputElement>('#libFileInput').click(); return; }
  let hs: FileHandle[];
  try {
    hs = await W.showOpenFilePicker({ multiple: true, types: [{ description: 'Ses dosyaları', accept: { 'audio/*': ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.aiff', '.opus'] } }] });
  } catch { return; }
  for (const h of hs) await addRoot({ kind: 'file', name: h.name, handle: h }, false);
  render(); void analyzeAll();
}

async function addRoot(root: Root, rerender = true): Promise<void> {
  for (const r of roots) if (await r.root.handle.isSameEntry(root.handle)) { toast(`"${root.name}" zaten kütüphanede`); return; }
  try { root.id = await dbPut('roots', root) as number; } catch { toast('Tarayıcı bu klasörü hatırlayamayacak (yalnız bu oturum)'); }
  const rs: RootState = { root, perm: 'granted', tracks: [] };
  roots.push(rs);
  setStat('Taranıyor…');
  await loadRoot(rs);
  if (rerender) { render(); toast(`"${root.name}": ${rs.tracks.length} şarkı eklendi`); void analyzeAll(); }
}

async function removeRoot(rs: RootState): Promise<void> {
  if (!confirm(`"${rs.root.name}" kütüphaneden kaldırılsın mı? (Dosyalar silinmez, sadece listeden çıkar.)`)) return;
  roots = roots.filter(r => r !== rs);
  if (rs.root.id != null) await dbDelete('roots', rs.root.id).catch(() => undefined);
  render();
}

async function grant(rs: RootState): Promise<void> {
  rs.perm = (await rs.root.handle.requestPermission?.({ mode: 'read' })) ?? 'granted';
  if (rs.perm === 'granted') { await loadRoot(rs); render(); void analyzeAll(); }
}

/** Fallback (no File System Access API): <input> files, kept for this session only. */
function addLoose(files: FileList | null, folderOf: (f: File) => string): void {
  for (const f of files ?? []) {
    if (!AUDIO_EXT.test(f.name)) continue;
    loose.push({ id: 't' + nextId++, name: stripExt(f.name), folder: folderOf(f), file: f, sig: fileSig(f) });
  }
  void applyCache(loose).then(() => { render(); void analyzeAll(); });
}

/* ---------- analysis (BPM + duration, cached) ---------- */

async function analyzeAll(): Promise<void> {
  if (analyzing) return;
  analyzing = true;
  try {
    const todo = () => allTracks().filter(t => t.demo == null && t.dur == null && !t.played);
    let done = 0;
    for (let t = todo()[0]; t; t = todo()[0]) {
      setStat(`Analiz: ${done + 1} / ${done + todo().length}`);
      await analyze(t);
      done++;
      if (done % 3 === 0) render();
      await new Promise(r => setTimeout(r, 0));
    }
    if (done) render();
  } finally { analyzing = false; setStat(); }
}

async function analyze(t: Track): Promise<void> {
  const f = await trackFile(t);
  if (!f) { t.dur = 0; return; }
  t.sig = fileSig(f);
  try {
    // offline context = decoding works before any user click, independent of the live engine
    const oc = new OfflineAudioContext(1, 1, 44100);
    const buf = await oc.decodeAudioData(await f.arrayBuffer());
    t.dur = buf.duration;
    t.bpm = detectBPM(buf.getChannelData(0), buf.sampleRate);
  } catch {
    t.dur = 0; t.bpm = null;   // undecodable: mark so it is not retried every time
  }
  await dbPut('analysis', { bpm: t.bpm ?? null, dur: t.dur } satisfies Cached, t.sig).catch(() => undefined);
}

/** A deck analysed a song itself: remember the result. */
export function rememberAnalysis(f: File, bpm: number | null, dur: number): void {
  const sig = fileSig(f);
  void dbPut('analysis', { bpm, dur } satisfies Cached, sig).catch(() => undefined);
  for (const t of allTracks()) if (t.sig === sig) { t.bpm = bpm; t.dur = dur; }
  render();
}

/* ---------- loading onto a deck ---------- */

async function loadTo(t: Track, d: Deck): Promise<void> {
  ensureCtx();
  if (t.demo != null) { await d.loadDemo(t.demo); t.played = true; render(); return; }
  const f = await trackFile(t);
  if (!f) { toast('Dosya açılamadı (taşınmış ya da izin gerekiyor)'); return; }
  t.played = true;
  render();
  await d.load(f, t.dur ? t.bpm ?? null : undefined);
}

/* ---------- UI ---------- */

function setStat(s?: string): void {
  const n = allTracks().length - demoTracks.length;
  $('#libStat').textContent = s ?? (n ? `${n} şarkı` : '');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function render(): void {
  // folders / permission chips
  $('#libRoots').innerHTML = roots.map((r, i) => r.perm === 'granted'
    ? `<span class="chip">${r.root.kind === 'dir' ? '📁' : '🎵'} ${esc(r.root.name)} <small>${r.tracks.length}</small><button data-rm="${i}" title="Listeden kaldır">×</button></span>`
    : `<span class="chip need">📁 ${esc(r.root.name)} <button data-grant="${i}">erişim ver</button><button data-rm="${i}" title="Listeden kaldır">×</button></span>`).join('');

  const list = sortTracks(allTracks().filter(t => matches(t, query)), sortKey, sortDir);
  const rows = list.slice(0, MAX_ROWS).map(t => `
    <tr data-id="${t.id}" class="${t.played ? 'played' : ''}${t.demo != null ? ' demo' : ''}">
      <td class="nm">${esc(t.name)}</td><td class="fd">${esc(t.folder)}</td>
      <td class="num">${t.bpm ? t.bpm.toFixed(t.bpm % 1 ? 1 : 0) : t.dur === 0 ? '?' : t.dur == null ? '…' : '—'}</td>
      <td class="num">${t.dur ? fmt(t.dur) : ''}</td>
      <td class="ld"><button class="la" data-to="0">A</button><button class="lb" data-to="1">B</button></td>
    </tr>`).join('');
  $('#libBody').innerHTML = rows || `<tr><td colspan="5" class="empty">${query ? 'Aramaya uyan şarkı yok' : 'Henüz şarkı yok: "+ Klasör" ile müzik klasörünü ekle'}</td></tr>`;
  $('#libMore').textContent = list.length > MAX_ROWS ? `İlk ${MAX_ROWS} şarkı gösteriliyor (${list.length} sonuç) — aramayı daralt` : '';
  document.querySelectorAll<HTMLElement>('#libT th[data-k]').forEach(th => {
    th.classList.toggle('on', th.dataset.k === sortKey);
    th.dataset.dir = th.dataset.k === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
  });
  if (!analyzing) setStat();
}

export async function setupLibrary(ds: Deck[]): Promise<void> {
  decks = ds;
  demoTracks = DEMOS.map((s, i) => ({ id: 'demo' + i, name: s.name, folder: 'Demo (kodla üretildi)', bpm: s.bpm, dur: undefined, demo: i }));

  $('#libDir').onclick = () => void addFolder();
  $('#libFiles').onclick = () => void addFiles();
  const dirIn = $<HTMLInputElement>('#libDirInput'), fileIn = $<HTMLInputElement>('#libFileInput');
  dirIn.onchange = () => { addLoose(dirIn.files, f => (f.webkitRelativePath.split('/').slice(-2, -1)[0]) || 'Klasör'); dirIn.value = ''; };
  fileIn.onchange = () => { addLoose(fileIn.files, () => 'Tek dosyalar'); fileIn.value = ''; };

  const search = $<HTMLInputElement>('#libSearch');
  search.oninput = () => { query = search.value; render(); };
  search.onkeydown = e => { if (e.key === 'Escape') { search.value = ''; query = ''; render(); search.blur(); } };

  $('#libT thead').addEventListener('click', e => {
    const k = (e.target as HTMLElement).closest<HTMLElement>('th[data-k]')?.dataset.k as SortKey | undefined;
    if (!k) return;
    if (k === sortKey) sortDir = sortDir > 0 ? -1 : 1; else { sortKey = k; sortDir = 1; }
    render();
  });
  $('#libBody').addEventListener('click', e => {
    const el = e.target as HTMLElement, tr = el.closest<HTMLElement>('tr[data-id]');
    const t = tr && allTracks().find(x => x.id === tr.dataset.id);
    if (!t) return;
    const to = el.closest<HTMLElement>('button[data-to]')?.dataset.to;
    if (to != null) void loadTo(t, decks[+to]);
  });
  $('#libBody').addEventListener('dblclick', e => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    const t = tr && allTracks().find(x => x.id === tr.dataset.id);
    if (!t || (e.target as HTMLElement).closest('button')) return;
    // double click: the deck that is not playing (A if both are free)
    const d = !decks[0].playing ? decks[0] : !decks[1].playing ? decks[1] : null;
    if (d) void loadTo(t, d); else toast('İki deck de çalıyor: A ya da B butonuyla seç');
  });
  $('#libRoots').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.rm != null) void removeRoot(roots[+b.dataset.rm]);
    if (b.dataset.grant != null) void grant(roots[+b.dataset.grant]);
  });

  render();
  try {
    const saved = await dbAll<Root>('roots');
    roots = saved.map(root => ({ root, perm: 'prompt' as PermState, tracks: [] }));
    for (const rs of roots) await loadRoot(rs);
  } catch { /* IndexedDB unavailable (private mode) */ }
  render();
  void analyzeAll();
}
