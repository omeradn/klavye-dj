# Değişiklik günlüğü

## Yol haritası (onaylanan sıra)
0. Kurulum ve taşıma ✅
1. Ses motoru ✅ — 1a (worklet, limiter, demo) · 1b key lock · 1c kulaklık cue
2. Analiz ve kütüphane (beatgrid, gerçek SYNC, ton, Türk ritimleri, IndexedDB)
3. Akademi (dersler, beatmatch antrenörü, geçiş sınavı)
4. Restoran Modu, set kaydı, canlı koç, geçiş asistanı
5. Gelişmiş FX ve pad modları
6. MIDI ve tuş değiştirme
7. Reels çıktısı, hayalet mod, set planlayıcı
8. Cila ve yayın

## 0.4.0 — Faz 1c · Kulaklık cue ve çıkış ayarları (2026-11-22)
### Eklendi
- **Kulaklık CUE**: her kanalda `🎧 CUE` butonu (klavye ⇧V / ⇧Ç). Kanal fader'ı ve crossfader kapalıyken de o şarkıyı kulaklıkta dinlersin (EQ ve filtre dahil, fader öncesi).
- Mikserin altında **🎧 KULAKLIK** bölümü: `CUE ⟷ MST` (kulaklıkta cue ile master karışımı), `SEVİYE`, `SPLIT`.
- **SPLIT**: sol kulak CUE, sağ kulak master (ikisi de mono). Tek çıkışlı bilgisayarda bir kulaklıkla mix çalışmak için.
- **Ses ayarları** penceresi (`Ses ayarları` butonu / F2):
  - Ana çıkış cihazı seçimi.
  - Kulaklık modu: **Tek çıkış**, **4 kanallı ses kartı** (1-2 master, 3-4 kulaklık), **Ayrı cihaz** (kulaklık ikinci bir ses cihazında).
  - Gecikme: Düşük / Orta / Güvenli, ölçülen gecikme gösterilir (değişiklik sayfa yenilenince geçerli olur).
  - Cihaz adları gizliyse "Cihaz adlarını göster" (tarayıcı izin isteyince gösterir; mikrofon kullanılmaz).
- Kulaklık sinyalinin de kendi limiter'ı var: iki şarkı birden cue'dayken de clip olmaz.
- Ayarlar tarayıcıda saklanır (sayfa yenilenince kaybolmaz). SPLIT bilerek saklanmaz.
- Testler: ayar okuma/bozuk veri, cue/master karışımının eşit güçte olduğu (toplam 27 test).

### Ölçüldü (tarayıcıda)
- SPLIT açık, A cue'da, crossfader B'de: sol kulak 0,44, sağ kulak 0,00 (master sessiz). Crossfader A'ya gelince sağ kulak 0,27.
- 4 kanal seçilip kart 2 kanallıysa uyarı verip tek çıkışa dönüyor. Ayrı cihaz modunda kulaklık sesi ikinci çıkışa akıyor.
- Ölçülen çıkış gecikmesi (Düşük ayar, bu bilgisayar): ~50 ms.

### Doğrulanamadı
- Gerçek 4 kanallı ses kartı ve ikinci kulaklık cihazı burada yok; bu iki modu sen kendi donanımınla denemelisin.

## 0.3.0 — Faz 1b · Key lock ve ton kaydırma (2026-11-21)
### Eklendi
- **Key lock** yeni motorda: tempo değişse de ton aynı kalır (varsayılan açık; KEY butonu / ⇧E, ⇧I).
- **Ton kaydırma (TON)** ±12 yarım ses: tempo fader'ının altındaki ♯ / ♭ butonları, klavyede `"` / `⇧"` (A) ve `Ü` / `⇧Ü` (B). Değere tıklayınca sıfırlanır.
- Gecikmesiz tasarım: ton düzeltici (Signalsmith Stretch, MIT) 120 ms gecikmeli çalışır, ama deck motoru ona sesi 120 ms ileriden besler. Böylece düzeltilmiş ses orijinalle örnek örnek hizalı çıkar; PLAY, CUE, hot cue anında tepki verir.
  - Atlamadan (hot cue, sarma, beat jump, loop aç/kapa) sonraki 120 ms ve scratch / REV / CENSOR / BRAKE / SPIN sırasında orijinal ses çalar, sonra fark edilmeden düzeltilmiş sese geçer.
  - Tempo %0 ve ton kaydırma 0 iken ses hiç işlenmez (orijinal kalite).
- Testler: ileri okuma kafasının ana kafayla tam hizalı olduğu (tempo +%5, loop içinde), atlamadan sonra orijinale düşüp geri döndüğü ve mikserin doğru karıştırdığı (toplam 24 test).

### Ölçüldü (tarayıcıda, demo parçadaki La minör akorla)
- +%6 tempo, key lock açık: 220 Hz → 219,97 Hz (ton korunuyor). Key lock kapalı: 233,4 Hz (beklenen 233,2).
- −%8 tempo, key lock açık: akor notaları beklenenden en fazla ~0,1 yarım ses sapıyor.
- TON +2: 220 → 248,8 Hz (beklenen 246,9).

## 0.2.0 — Faz 1a · Yeni ses motoru (2026-11-21)
Faz 1 üç ara durağa bölündü: **1a** ses motoru · **1b** key lock + ton kaydırma · **1c** kulaklık cue + gecikme ayarı.

### Eklendi
- AudioWorklet deck motoru: şarkı ayrı bir ses iş parçacığında, örnek hassasiyetinde çalınıyor.
  - Loop'lar örnek hassasiyetinde ve her atlama (loop dönüşü, sarma, beat jump) 5 ms çapraz geçişle → tık sesi yok. Sekme arka plandayken de loop çalışmaya devam ediyor.
  - REV (ters çal), SLIP modu, CENSOR (basılı tut), BRAKE (plak gibi yavaşlayıp durma), SPIN (geri savurma).
  - VINYL modu: jog'un iç kısmı plak gibi scratch yapıyor; dış halka tempo dürtme.
  - Beat jump ileri/geri (loop boyu kadar; açık loop da birlikte kayar).
  - CUE artık CDJ gibi: cue noktasındayken basılı tutunca çalar, bırakınca geri döner; CUE basılıyken PLAY = çalmaya devam.
- Master limiter (-1 dBFS tavan, 3 ms ileri bakış): ses asla clip olmaz. Üst çubukta LİMİT göstergesi (yeşil/sarı/kırmızı) ve kısma miktarı.
- DEMO butonu: kodla üretilmiş 4 demo parça (122/126/112/128 BPM, intro-build-drop-break-drop-outro, 8 barlık phrase yapısı).
- Çalan deck'e yanlışlıkla şarkı yüklemeye karşı onay sorusu.
- Testler: loop/sarma/beat jump'ta tık olmadığını, slip dönüşünü, freni ve limiter tavanını ölçen ses motoru testleri; demo parçaların BPM testi (toplam 20 test).
- Tek dosya sürümde ses motoru da gömülü (gerçekten tek dosya).

### Değişti
- Tüm ses ayarları (EQ, kill, fader, filtre, crossfader, master) yumuşak geçişle değişiyor → çıt sesi yok.
- ECHO artık crossfader'dan sonra: crossfader'ı çekince yankı kuyruğu kesilmeden söner ("echo out").

### Geçici olarak eksik
- Key lock: yeni motora Faz 1b'de eklendi.

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
