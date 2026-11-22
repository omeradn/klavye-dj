# Değişiklik günlüğü

## Yol haritası (onaylanan sıra)
0. Kurulum ve taşıma ✅
1. Ses motoru ✅ — 1a (worklet, limiter, demo) · 1b key lock · 1c kulaklık cue
2. Analiz ve kütüphane ✅ — 2a kütüphane · 2b beatgrid + SYNC · 2c ton, renkli dalga formu, listeler
3. Akademi (dersler, beatmatch antrenörü, geçiş sınavı)
4. Restoran Modu, set kaydı, canlı koç, geçiş asistanı
5. Gelişmiş FX ve pad modları — öne alındı: 3a pad modları + sampler ✅ · 3b Ritim FX + Kanal FX · 3c mikser ekstraları
6. MIDI ve tuş değiştirme
7. Reels çıktısı, hayalet mod, set planlayıcı
8. Cila ve yayın

## 0.8.0 — Faz 3a · Performans pad'leri ve sampler (2026-11-22)
### Eklendi
- Her deck'te **8 pad** ve üstünde **7 pad modu**: HOT CUE · LOOP · JUMP · SLICER · ROLL · SAMPLER · TON.
  - **HOT CUE**: 8 hot cue (eskiden 4). Şarkıyla birlikte saklanır.
  - **LOOP**: ¼, ½, 1, 2, 4, 8, 16, 32 vuruşluk loop'lar.
  - **JUMP**: ◀1 1▶ ◀4 4▶ / ◀16 16▶ ◀32 32▶ vuruş atlama.
  - **SLICER**: çalan 8 vuruş 8 dilime bölünür; basılı tuttuğun dilim tekrar eder, bırakınca şarkı olması gereken yerden devam eder. Çalan dilim sarı yanar.
  - **ROLL**: 1/16'dan 8 vuruşa kadar; basılı tuttukça tekrar eder ("trrrr"), bırakınca şarkı kaldığı yerden devam eder. Grid'e oturur.
  - **SAMPLER**: 8 ses (iki deck'te aynı): Korna, Siren, Lazer, Yükseliş, Patlama, Alkış, Darbuka düm, Darbuka tek. Hepsi kodla üretildi (telifsiz). ⇧+tık ya da sağ tık ile o pad'e **kendi sesini** yüklersin (en fazla 30 sn, tarayıcıda saklanır); tekrar yapınca yerleşik sese döner. Üst çubukta **SAMPLER** ses düğmesi; sampler da master limiter'dan geçer.
  - **TON**: +1 +2 +3 +4 / 0 −1 −2 −3 yarım ses.
- Klavye: **1–4** üst sıra pad'ler, **⇧1–4** alt sıra (B: 7–0). **5** pad modunu değiştirir, **⇧5** geri (B: 6). **Backspace** basılıyken pad = hot cue sil / sampler'a ses yükle.
- Ses motoru: "roll" loop'u (her zaman slip'li, normal loop'u bozmadan) ve slicer için atlayarak başlayan roll. Testlerle: tık sesi yok, bırakınca doğru yere dönüyor.
- Pencere odak kaybedince basılı kalan tuşlar bırakılır (takılı roll/bend olmaz).

### Değişti
- **5 / 6** artık beat jump değil, pad modu değiştirir. Beat jump: deck'teki ◀◀ ▶▶ butonları ya da JUMP pad modu.
- **⇧1–4** artık hot cue silmiyor, alt sıradaki pad'leri çalıyor. Silmek: Backspace + pad tuşu, ya da pad'e ⇧+tık / sağ tık.
- Testler: toplam 63.

## 0.7.0 — Faz 2c · Ton, renkli dalga formu, listeler (2026-11-22)
### Eklendi
- **Ton tespiti** (kromagram + ton profilleri) ve **Ton Çarkı**: tonlar beşli çemberine dizilir, 1–12 arası numaralanır (Do majör = 1M, La minör = 1m). Aynı numara ya da ±1 komşu = güvenle karışır.
- Deck'te çalan ton (TON kaydırma ve key lock dahil) ve çark numarası. Renk, diğer deck'le uyumu gösterir: yeşil uyumlu, sarı riskli, kırmızı çatışır.
- **3 renkli dalga formu**: mor = bas (kick, bas hattı), yeşil = orta (vokal, synth), beyaz = tiz (hi-hat, zil).
- **Zoom**: dalga formlarının üstünde fare tekerleği (2–40 saniye, iki deck birlikte).
- Kütüphanede **Ton** ve **Enerji (1–10)** sütunları, ikisine göre sıralama. Ton sütunu çalan şarkıya göre renklenir.
- **✓ Uyumlu** filtresi: çalan şarkıdan sonra gidecek şarkılar (ton uyumlu ve tempo ±%6; yarım/çift tempo dahil).
- **Playlist'ler**: "+ Liste" ile oluştur, satırı soldaki listenin adına sürükleyerek ekle, liste içinde × ile çıkar.
- **Geçmiş**: çalmaya başlanan her şarkı tarih/saatle kaydedilir.
- **Etiketler**: Etiket hücresine tıkla, virgülle yaz (ör. akşam, sakin). Arama etiketleri de bulur.
- Eski analizler (ton/enerji yoksa) arka planda tamamlanır.

### Değişti
- Minör demo parçaların akor dizisi i–VI–VII–i oldu (önceki dizi kulağa da relatif majör gibi geliyordu, ton belirsizdi).

### Ölçüldü
- 6 farklı tonda akor dizisi ve 4 demo parçanın tonu doğru bulundu.
- Tarayıcıda: A = Am (1m), B = Cm (10m) → kırmızı. B'ye TON −3 → Am (1m) → iki deck de yeşil.

### Bilinen eksikler
- Ton tespiti relatif majör/minör'ü (ör. Am / C) karıştırabilir; çark numarası yine de aynı olduğu için uyum önerisi doğru kalır.
- Enerji kaba bir tahmindir (ses yüksekliği, ritim yoğunluğu, parlaklık, tempo). Demo parçalar aynı düzenle yapıldığı için enerjileri birbirine yakın; demolarda enerji gösterilmez.

## 0.6.0 — Faz 2b · Beatgrid ve gerçek SYNC (2026-11-22)
### Eklendi
- **Beatgrid analizi**: tempo 0,01 BPM hassasiyetle, vuruşların yeri, bar başı (1. vuruş) ve 8 barlık phrase başı bulunur. Kütüphane analizi de grid'i hesaplayıp saklar.
- Dalga formunda **grid çizgileri**: vuruş (ince), bar başı (beyaz), phrase başı (kırmızı). Dalga formu gerçek zamana göre çizilir: aynı tempodaki iki deck'te vuruşlar aynı aralıkta görünür.
- **Bar / phrase sayacı** ("PHRASE 2 · BAR 5/8") ve vuruş ışıkları (ilk vuruş kırmızı). Phrase'in son barında sayaç sarı olur. Sayaca tıklayınca phrase uzunluğu 4 / 8 / 16 / 32 bar.
- **Gerçek SYNC**: tempoyu eşitler, vuruşları üst üste getirir ve kilitler. Diğer deck'in temposu değişince takip eder; elle dürtünce (bend / jog) bırakınca kendini geri hizalar. Tekrar basınca kapanır; tempo fader'ını elle oynatınca kapanır. Yarım/çift tempoyu (ör. 70 ↔ 140) kendisi katlar.
- **FAZ göstergesi** (dalga formlarının arasında): B'nin vuruşları A'ya göre kaç ms önde/geride. Yeşil = hizalı.
- **QUANTIZE** (deck başına, varsayılan açık): cue, hot cue ve loop başlangıcı en yakın vuruşa oturur. Çalarken hot cue'ya atlayınca ritim tökezlemez (vuruş içindeki yer korunur).
- **Grid düzenleme** (GRID satırı): ◁ ▷ grid'i 5 ms kaydırır (Shift+tık 1 ms), **1.1** çalan yerdeki vuruşu bar ve phrase başı yapar, **BPM− / BPM+** ±0,05 (Shift+tık ±0,01).
- **Türk müziği ölçüleri**: 4/4 · 6/8 · 7/8 aksak (2+2+3) · 9/8 aksak (2+2+2+3) · 10/8 aksak (3+2+2+3). Aksak ölçülerde vuruş ışıkları ve çizgiler eşit olmayan vuruşları gösterir; BPM sekizlik vuruş sayısıdır.
- **Şarkıyla saklananlar**: grid (elle düzeltmeler dahil), cue noktası ve hot cue'lar. Şarkıyı tekrar yükleyince geri gelir; cue noktasından başlar.
- Testler: tempo/vuruş/bar/phrase bulma (sentetik ritimler ve demo parçalar), bar sayacı, aksak ölçü çizgileri, grid düzenleme (toplam 40 test).

### Ölçüldü
- Sentetik ritimlerde vuruş yeri 0–0,7 ms, demo parçalarda ~2 ms sapma; tempo hatası ≤ 0,001 BPM.
- Tarayıcıda: B 133 ms kaydırılıp SYNC'e basılınca fark 0 ms. A'nın temposu +%3 yapılınca B takip etti (125,66 = 125,66), fark 0,4 ms. Elle 16 ms kaydırınca kilit 2,5 saniyede 2 ms'ye çekti. Quantize'lı hot cue atlaması sonrası fark 0,7 ms.

### Bilinen eksikler
- Analiz tempo değişmeyen müzik varsayar (canlı kayıtlarda grid kayabilir, elle düzeltilebilir).
- Bar başı tahmini sesteki değişimlere bakar; yanlışsa **1.1** ile düzelt.

## 0.5.0 — Faz 2a · Kütüphane (2026-11-22)
### Eklendi
- Deck'lerin altında **KÜTÜPHANE**:
  - **+ Klasör**: müzik klasörünü (alt klasörler dahil) ekler; tarayıcı klasörü hatırlar, sayfa kapanıp açılınca liste yerinde. İzin süresi dolarsa klasörün yanında "erişim ver" çıkar.
  - **+ Dosya**: tek tek şarkı ekler.
  - Arka planda her şarkının BPM'i ve süresi analiz edilir ve saklanır (aynı şarkı bir daha analiz edilmez).
  - Arama (Türkçe harf duyarsız: "sarki" = "Şarkı"; sayı yazınca ±2 BPM'deki şarkılar), başlığa tıklayarak sıralama (şarkı, klasör, BPM, süre).
  - Her satırda **A** / **B** butonu; çift tık = boştaki deck'e yükle. Yüklenen şarkılar ✓ ile işaretlenir.
  - 4 demo parça da listede.
- Arama kutusuna yazarken DJ kısayolları çalışmaz (yanlışlıkla şarkı durmasın).
- Testler: arama, sıralama, dosya tanıma (toplam 32 test).

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
