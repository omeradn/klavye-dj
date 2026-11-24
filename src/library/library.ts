import { $, fmt, toast } from '../util';
import { ensureCtx } from '../engine/context';
import type { Deck, TrackInfo } from '../engine/deck';
import { ALL_DEMOS } from '../demo/demos';
import { detectBPM } from '../analysis/bpm';
import { analyzeGrid } from '../analysis/grid';
import { compat, detectKey, keyName, wheelCode, type Key } from '../analysis/key';
import { energyRating } from '../analysis/features';
import { dbAll, dbDelete, dbGet, dbPut } from './db';
import { allMeta, saveMeta } from './trackmeta';
import { AUDIO_EXT, fileSig, fitsNext, matches, sortTracks, stripExt, type SortKey, type Track } from './model';

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
interface Playlist { id?: number; name: string; items: { sig: string; name: string }[] }
interface HistoryEntry { id?: number; sig: string; name: string; at: number }
/** which list is shown: all songs, play history, or a playlist id */
type View = 'all' | 'history' | number;

const MAX_DEPTH = 6;
const MAX_ROWS = 600;

let decks: Deck[] = [];
let roots: RootState[] = [];
/** files added without a saveable handle (fallback browsers) — only for this session */
let loose: Track[] = [];
let demoTracks: Track[] = [];
let playlists: Playlist[] = [];
let history: HistoryEntry[] = [];
let tagsBySig = new Map<string, string[]>();
let view: View = 'all';
let query = '';
let onlyFits = false;
let sortKey: SortKey | null = 'folder';
let sortDir: 1 | -1 = 1;
let analyzing = false;
let nextId = 0;

const allTracks = (): Track[] => [...demoTracks, ...roots.flatMap(r => r.tracks), ...loose];
const demoSig = (name: string) => 'demo:' + name;
const bySig = (sig: string) => allTracks().find(t => t.sig === sig);

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

function setInfo(t: Track, c: Partial<TrackInfo>): void {
  if (c.bpm !== undefined) t.bpm = c.bpm;
  if (c.dur !== undefined) t.dur = c.dur;
  if (c.grid !== undefined) t.grid = c.grid;
  if (c.key !== undefined) t.key = c.key;
  if (c.energy !== undefined) t.energy = c.energy;
}

/** Fill analysis results and tags from storage. */
async function applyCache(list: Track[]): Promise<void> {
  for (const t of list) {
    const f = await trackFile(t);
    if (!f) continue;
    t.sig = fileSig(f);
    t.tags = tagsBySig.get(t.sig);
    const c = await dbGet<TrackInfo>('analysis', t.sig).catch(() => undefined);
    if (c) setInfo(t, c);
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

/* ---------- analysis (BPM, grid, key, energy, duration — cached) ---------- */

const needsAnalysis = (t: Track) => t.demo == null && !t.played && (t.dur == null || (t.dur > 0 && (t.key === undefined || t.energy === undefined)));

async function analyzeAll(): Promise<void> {
  if (analyzing) return;
  analyzing = true;
  try {
    const todo = () => allTracks().filter(needsAnalysis);
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
  const info: TrackInfo = { bpm: null, dur: 0, grid: null, key: null, energy: 1 };
  try {
    // offline context = decoding works before any user click, independent of the live engine
    const oc = new OfflineAudioContext(1, 1, 44100);
    const buf = await oc.decodeAudioData(await f.arrayBuffer());
    const ch = buf.getChannelData(0), sr = buf.sampleRate;
    info.dur = buf.duration;
    info.grid = t.grid ?? (() => { const g = detectBPM(ch, sr); return g ? analyzeGrid(ch, sr, g) : null; })();
    info.bpm = info.grid?.bpm ?? t.bpm ?? null;
    info.key = detectKey(ch, sr);
    info.energy = energyRating(ch, sr, info.bpm);
  } catch { /* undecodable: stored as dur 0 so it is not retried every time */ }
  setInfo(t, info);
  await dbPut('analysis', info, t.sig).catch(() => undefined);
}

/** A deck analysed a song itself (or its grid was edited): remember the result. */
export function rememberAnalysis(f: File, info: TrackInfo): void {
  const sig = fileSig(f);
  void dbPut('analysis', info, sig).catch(() => undefined);
  for (const t of allTracks()) if (t.sig === sig) setInfo(t, info);
  render();
}

/** A deck started playing a song: add it to the history. */
export function logPlay(sig: string, name: string): void {
  if (!sig) return;
  const e: HistoryEntry = { sig, name, at: Date.now() };
  history.unshift(e);
  void dbPut('history', e).then(id => { e.id = id as number; }).catch(() => undefined);
  if (view === 'history') render();
}

/* ---------- loading onto a deck ---------- */

async function loadTo(t: Track, d: Deck): Promise<void> {
  ensureCtx();
  if (t.demo != null) { await d.loadDemo(t.demo); t.played = true; render(); return; }
  const f = await trackFile(t);
  if (!f) { toast('Dosya açılamadı (taşınmış ya da izin gerekiyor)'); return; }
  t.played = true;
  render();
  await d.load(f, t.dur ? { bpm: t.bpm ?? null, grid: t.grid ?? null, key: t.key, energy: t.energy } : undefined);
}

/* ---------- playlists & tags ---------- */

async function newPlaylist(): Promise<void> {
  const name = prompt('Yeni liste adı (ör. "Akşam yemeği", "Cuma gecesi"):')?.trim();
  if (!name) return;
  const pl: Playlist = { name, items: [] };
  try { pl.id = await dbPut('playlists', pl) as number; } catch { pl.id = -Date.now(); }
  playlists.push(pl);
  view = pl.id!;
  render();
}

function addToPlaylist(pl: Playlist, t: Track): void {
  if (!t.sig) { toast('Bu şarkı henüz okunmadı, biraz sonra tekrar dene'); return; }
  if (pl.items.some(i => i.sig === t.sig)) { toast(`Zaten "${pl.name}" listesinde`); return; }
  pl.items.push({ sig: t.sig, name: t.name });
  void dbPut('playlists', pl).catch(() => undefined);
  toast(`"${t.name}" → ${pl.name}`);
  render();
}

function editTags(t: Track): void {
  if (!t.sig) return;
  const v = prompt(`"${t.name}" etiketleri (virgülle ayır, ör. akşam, sakin, türkçe):`, (t.tags ?? []).join(', '));
  if (v == null) return;
  t.tags = [...new Set(v.split(',').map(x => x.trim()).filter(Boolean))];
  tagsBySig.set(t.sig, t.tags);
  saveMeta(t.sig, { tags: t.tags });
  render();
}

/* ---------- UI ---------- */

function setStat(s?: string): void {
  const n = allTracks().length - demoTracks.length;
  $('#libStat').textContent = s ?? (n ? `${n} şarkı` : '');
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** The deck the audience hears now (playing, crossfader towards it) — reference for "fits next". */
function onAir(): Deck | null {
  const p = decks.filter(d => d.playing && d.has);
  if (p.length < 2) return p[0] ?? null;
  return (p[0].xfG?.gain.value ?? 1) >= (p[1].xfG?.gain.value ?? 1) ? p[0] : p[1];
}

const placeholder = (sig: string, name: string, folder: string): Track => ({ id: 'x' + sig, name, folder, sig });

function viewRows(): Track[] {
  if (view === 'all') return allTracks();
  if (view === 'history') {
    return history.slice(0, 300).map((h, i) => {
      const t = bySig(h.sig) ?? placeholder(h.sig, h.name, '');
      const d = new Date(h.at);
      return { ...t, id: t.id + '|h' + i, folder: `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' })} ${d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}` };
    });
  }
  const pl = playlists.find(p => p.id === view);
  return pl ? pl.items.map(i => bySig(i.sig) ?? placeholder(i.sig, i.name, 'bulunamadı')) : [];
}

/** Track behind a row id (history rows carry a suffix). */
const rowTrack = (id: string): Track | undefined => {
  const base = id.split('|h')[0];
  return allTracks().find(t => t.id === base) ?? viewRows().find(t => t.id === id);
};

function render(): void {
  $('#libRoots').innerHTML = roots.map((r, i) => r.perm === 'granted'
    ? `<span class="chip">${r.root.kind === 'dir' ? '📁' : '🎵'} ${esc(r.root.name)} <small>${r.tracks.length}</small><button data-rm="${i}" title="Listeden kaldır">×</button></span>`
    : `<span class="chip need">📁 ${esc(r.root.name)} <button data-grant="${i}">erişim ver</button><button data-rm="${i}" title="Listeden kaldır">×</button></span>`).join('');

  // sidebar
  const item = (v: View, label: string, n: number, extra = '') =>
    `<li data-v="${v}" class="${view === v ? 'on' : ''}">${label} <small>${n}</small>${extra}</li>`;
  $('#libSide').innerHTML = `<ul>
    ${item('all', '🎵 Tüm şarkılar', allTracks().length)}
    ${item('history', '🕘 Geçmiş', history.length)}
    ${playlists.map(p => item(p.id!, '≡ ' + esc(p.name), p.items.length, `<button data-del="${p.id}" title="Listeyi sil">×</button>`)).join('')}
    </ul><button class="hbtn" id="libNewPl">+ Liste</button>
    <p class="note">Şarkıyı listeye eklemek için satırı buraya sürükle.</p>`;

  const ref = onAir(), refKey = ref?.playingKey() ?? null, refBpm = ref?.bpm ? ref.bpm * (1 + ref.tempo) : null;
  $('#libFits').classList.toggle('on', onlyFits);
  $('#libFits').title = ref
    ? `Sadece Deck ${ref.id}'den sonra uyumlu çalacak şarkılar (ton uyumlu, tempo ±%6)`
    : 'Bir deck çalarken, ondan sonra uyumlu çalacak şarkıları gösterir';

  let list = viewRows().filter(t => matches(t, query));
  if (onlyFits && ref) list = list.filter(t => t.sig !== ref.sig && fitsNext(t, refKey, refBpm));
  const natural = view !== 'all' && sortKey == null;
  if (!natural && sortKey) list = sortTracks(list, sortKey, sortDir);

  const inPl = typeof view === 'number';
  const rows = list.slice(0, MAX_ROWS).map((t, i) => {
    const kc = t.key && refKey ? ' c' + compat(refKey, t.key) : '';
    const canLoad = t.demo != null || t.handle || t.file;
    return `
    <tr data-id="${t.id}" data-i="${i}" draggable="true" class="${t.played ? 'played' : ''}${t.demo != null ? ' demo' : ''}${canLoad ? '' : ' gone'}">
      <td class="nm">${esc(t.name)}</td><td class="fd">${esc(t.folder)}</td>
      <td class="num">${t.bpm ? t.bpm.toFixed(t.bpm % 1 ? 1 : 0) : t.dur === 0 ? '?' : t.dur == null ? '…' : '—'}</td>
      <td class="ky${kc}">${t.key ? `${keyName(t.key)} <small>${wheelCode(t.key)}</small>` : t.key === undefined && t.demo == null ? '…' : '—'}</td>
      <td class="num en">${t.energy ? `<i style="width:${t.energy * 10}%"></i><span>${t.energy}</span>` : ''}</td>
      <td class="num">${t.dur ? fmt(t.dur) : ''}</td>
      <td class="tg" title="Etiketleri düzenlemek için tıkla">${(t.tags ?? []).map(x => `<span>${esc(x)}</span>`).join('') || '<em>+</em>'}</td>
      <td class="ld">${canLoad ? '<button class="la" data-to="0">A</button><button class="lb" data-to="1">B</button><button class="lc" data-to="2">C</button><button class="ld4" data-to="3">D</button>' : ''}${inPl ? '<button class="rm" data-out="1" title="Listeden çıkar">×</button>' : ''}</td>
    </tr>`;
  }).join('');
  const empty = view === 'history' ? 'Henüz çalınan şarkı yok'
    : inPl ? 'Liste boş: soldaki "Tüm şarkılar"dan satırları bu listenin adının üstüne sürükle'
    : onlyFits ? 'Çalan şarkıyla uyumlu şarkı bulunamadı' : query ? 'Aramaya uyan şarkı yok' : 'Henüz şarkı yok: "+ Klasör" ile müzik klasörünü ekle';
  $('#libBody').innerHTML = rows || `<tr><td colspan="8" class="empty">${empty}</td></tr>`;
  $('#libMore').textContent = list.length > MAX_ROWS ? `İlk ${MAX_ROWS} şarkı gösteriliyor (${list.length} sonuç) — aramayı daralt` : '';
  $('#libFolderTh').textContent = view === 'history' ? 'Çalındı' : 'Klasör';
  document.querySelectorAll<HTMLElement>('#libT th[data-k]').forEach(th => {
    th.classList.toggle('on', th.dataset.k === sortKey);
    th.dataset.dir = th.dataset.k === sortKey ? (sortDir > 0 ? '▲' : '▼') : '';
  });
  if (!analyzing) setStat();
}

export async function setupLibrary(ds: Deck[]): Promise<void> {
  decks = ds;
  demoTracks = ALL_DEMOS.map((s, i) => ({
    id: 'demo' + i, name: s.name, folder: 'Demo (kodla üretildi)', bpm: s.bpm, demo: i, sig: demoSig(s.name),
    key: s.key as Key | null,
  }));
  decks.forEach(d => { d.onAnalyzed = rememberAnalysis; d.onPlayed = logPlay; });

  $('#libDir').onclick = () => void addFolder();
  $('#libFiles').onclick = () => void addFiles();
  $('#libFits').onclick = () => {
    onlyFits = !onlyFits;
    if (onlyFits && !onAir()) toast('Önce bir deck\'te şarkı çal: uyumlu şarkılar ona göre seçilir');
    render();
  };
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
  const body = $('#libBody');
  body.addEventListener('click', e => {
    const el = e.target as HTMLElement, tr = el.closest<HTMLElement>('tr[data-id]');
    const t = tr && rowTrack(tr.dataset.id!);
    if (!t || !tr) return;
    const to = el.closest<HTMLElement>('button[data-to]')?.dataset.to;
    if (to != null) { void loadTo(t, decks[+to]); return; }
    if (el.closest('button[data-out]')) {
      const pl = playlists.find(p => p.id === view);
      if (pl) { pl.items.splice(+tr.dataset.i!, 1); void dbPut('playlists', pl).catch(() => undefined); render(); }
      return;
    }
    if (el.closest('td.tg')) editTags(t);
  });
  body.addEventListener('dblclick', e => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    const t = tr && rowTrack(tr.dataset.id!);
    if (!t || (e.target as HTMLElement).closest('button, td.tg')) return;
    // double click: the deck that is not playing (A if both are free)
    const d = !decks[0].playing ? decks[0] : !decks[1].playing ? decks[1] : null;
    if (d) void loadTo(t, d); else toast('İki deck de çalıyor: A ya da B butonuyla seç');
  });
  body.addEventListener('dragstart', e => {
    const tr = (e.target as HTMLElement).closest<HTMLElement>('tr[data-id]');
    if (tr && e.dataTransfer) { e.dataTransfer.setData('text/x-kdj-row', tr.dataset.id!); e.dataTransfer.effectAllowed = 'copy'; }
  });

  const side = $('#libSide');
  side.addEventListener('click', e => {
    const el = e.target as HTMLElement;
    if (el.id === 'libNewPl') { void newPlaylist(); return; }
    const del = el.closest<HTMLElement>('button[data-del]')?.dataset.del;
    if (del != null) {
      const pl = playlists.find(p => p.id === +del);
      if (pl && confirm(`"${pl.name}" listesi silinsin mi? (Şarkılar silinmez.)`)) {
        playlists = playlists.filter(p => p !== pl);
        void dbDelete('playlists', pl.id!).catch(() => undefined);
        if (view === pl.id) view = 'all';
        render();
      }
      return;
    }
    const v = el.closest<HTMLElement>('li[data-v]')?.dataset.v;
    if (v == null) return;
    view = v === 'all' || v === 'history' ? v : +v;
    sortKey = view === 'all' ? sortKey ?? 'folder' : null;    // lists and history keep their own order
    render();
  });
  side.addEventListener('dragover', e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-v]');
    if (li && !isNaN(+li.dataset.v!)) { e.preventDefault(); li.classList.add('drop'); }
  });
  side.addEventListener('dragleave', e => (e.target as HTMLElement).closest('li')?.classList.remove('drop'));
  side.addEventListener('drop', e => {
    const li = (e.target as HTMLElement).closest<HTMLElement>('li[data-v]');
    li?.classList.remove('drop');
    const id = e.dataTransfer?.getData('text/x-kdj-row'), pl = li && playlists.find(p => p.id === +li.dataset.v!);
    const t = id && rowTrack(id);
    if (pl && t) { e.preventDefault(); addToPlaylist(pl, t); }
  });

  $('#libRoots').addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('button');
    if (!b) return;
    if (b.dataset.rm != null) void removeRoot(roots[+b.dataset.rm]);
    if (b.dataset.grant != null) void grant(roots[+b.dataset.grant]);
  });

  // "fits next" follows the music: refresh while that filter is on
  setInterval(() => { if (onlyFits) render(); }, 2000);

  render();
  try {
    const meta = await allMeta();
    tagsBySig = new Map([...meta].filter(([, m]) => m.tags?.length).map(([k, m]) => [k, m.tags!]));
    for (const t of demoTracks) t.tags = tagsBySig.get(t.sig!);
    playlists = await dbAll<Playlist>('playlists');
    history = (await dbAll<HistoryEntry>('history')).sort((a, b) => b.at - a.at);
    const saved = await dbAll<Root>('roots');
    roots = saved.map(root => ({ root, perm: 'prompt' as PermState, tracks: [] }));
    for (const rs of roots) await loadRoot(rs);
  } catch { /* IndexedDB unavailable (private mode) */ }
  render();
  void analyzeAll();
}

/**
 * Songs the Restoran Modu automix may play: the "Restoran" playlist when it exists,
 * otherwise every analysed song (demos included).
 */
export function poolTracks(): Track[] {
  const pl = playlists.find(p => p.name === 'Restoran');
  if (pl) return pl.items.map(i => bySig(i.sig)).filter((t): t is Track => !!t && t.bpm != null);
  return allTracks().filter(t => t.bpm != null && (t.demo != null || t.handle || t.file));
}

/** Load a song onto a deck (the same path as the A / B buttons). */
export const loadTrackTo = (t: Track, d: Deck): Promise<void> => loadTo(t, d);
