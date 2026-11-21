# Değişiklik günlüğü

## Yol haritası (onaylanan sıra)
0. Kurulum ve taşıma ✅
1. Ses motoru (AudioWorklet, kulaklık cue, limiter)
2. Analiz ve kütüphane (beatgrid, gerçek SYNC, ton, Türk ritimleri, IndexedDB)
3. Akademi (dersler, beatmatch antrenörü, geçiş sınavı)
4. Restoran Modu, set kaydı, canlı koç, geçiş asistanı
5. Gelişmiş FX ve pad modları
6. MIDI ve tuş değiştirme
7. Reels çıktısı, hayalet mod, set planlayıcı
8. Cila ve yayın

## 0.1.0 — Faz 0 · Kurulum ve taşıma (2026-11-21)
### Eklendi
- Vite + TypeScript + Svelte 5 projesi; kod `engine`, `analysis`, `input`, `ui` modüllerine bölündü.
- `npm run build:single` ile tek dosya HTML çıktısı (vite-plugin-singlefile).
- Vitest: sentetik ritimlerle BPM tespiti testleri (90, 100, 124, 128, 140, 174 BPM; hepsi ±1 içinde).
- Türkçe README.

### Düzeltildi
- ECHO artık tempo değişince ritimden kaymıyor (yankı süresi tempoyla güncelleniyor).
- Mouse ile bir butona tıkladıktan sonra Space/Enter o butonu tekrar tetiklemiyor (yanlışlıkla durdurma riski).
- Shift + Shift'li karşılığı olmayan tuş (ör. ⇧W) artık normal görevini yapıyor.
- Fader, knob, jog ve bend butonları dokunma yarıda kesilince "yapışık" kalmıyor.
- EQ knob'una çift tıklayınca o bandın kill'i de kapanıyor.
- Her karede yapılan gereksiz ekran güncellemeleri azaltıldı (yalnızca değişen yazılar yenileniyor).

### Bilinen eksikler (Faz 1'de)
- Loop'lar hâlâ ekran döngüsüne bağlı (kayma, tık sesi, arka planda durma).
- Ses değişimleri ani (çıt sesi), master limiter yok.
