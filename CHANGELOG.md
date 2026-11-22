# Değişiklik günlüğü

## Yol haritası (onaylanan sıra, güncelleme 2026-11-22)
Fazların asıl numaraları brief'tekiyle aynı; burada çalışma sırasıyla listeleniyor.
1. **Faz 0** Kurulum ve taşıma ✅
2. **Faz 1** Ses motoru ✅ — 1a worklet, limiter, demo · 1b key lock · 1c kulaklık cue
3. **Faz 2** Analiz ve kütüphane ✅ — 2a kütüphane · 2b beatgrid + SYNC · 2c ton, renkli dalga formu, listeler
4. **Faz 3** Mikser, efektler, pad'ler (öne alındı) — 3a pad modları + sampler ✅ · 3b Ritim FX + Kanal FX ✅ · 3c mikser ekstraları ✅ (4 deck Faz 5'e ertelendi)
5. **Yayın**: GitHub'a yükleme + canlı site (GitHub Pages), her güncellemede testler ve otomatik yayın (3b'den sonra)
6. **Faz 4** DJ Akademi — 4a altyapı + ders 1–4 + antrenör ✅ · 4b ders 5–10 + Geçiş Sınavı ✅ · 4c ders 11–14 + Kulak Egzersizi — set senaryosu oynatıcı ve **hayalet eller** (kullanılan kontrol parlar, Türkçe açıklama: "önce izle, sonra sen yap") dahil
7. **Faz 6a** Restoran Modu, set kaydı, canlı koç, geçiş asistanı
8. **Faz 5** MIDI ve tuş değiştirme
9. **Faz 6b** Reels çıktısı, hayalet mod, set planlayıcı
10. **Ajan DJ** (yeni faz): Claude şarkıları analiz edip vuruşa oturan bir set senaryosu yazar, uygulama canlı çalar, her hamle ekranda görünür; geçişler arasında Claude planı günceller. Canlı yayınlar için (cd.md parçaları)
11. **Faz 7** Cila ve yayın

## 0.12.0 — Faz 4b · Geçiş dersleri ve Geçiş Sınavı (2026-11-22)
### Eklendi
- **Ders 5 · Beat, bar, phrase**: sayacı okumak, phrase başında hot cue koymak, ikinci şarkıyı phrase başında başlatmak. Yanlış anda basınca "3 vuruş geç, bir sonraki phrase başında tekrar dene" gibi anında uyarı.
- **Ders 6 · EQ ile geçiş (bas değişimi)**: gelen şarkı basız girer (N), fader açılır, phrase başında bas el değiştirir (Z + N), giden şarkı çıkar. İki bas 1,5 sn'den uzun birlikte çalarsa uyarır.
- **Ders 7 · Filtre ile geçiş**: giden şarkıyı high-pass filtreyle inceltip çıkarmak, sonra filtreyi ortalamak.
- **Ders 8 · Loop ile uzatma**: R, T, ⇧T ve LOOP pad moduyla biten şarkıyı uzatmak.
- **Ders 9 · Hot cue ile drop**: JUMP pad moduyla drop'u bulmak, hot cue koymak, phrase başında şarkıyı doğrudan drop'tan başlatmak.
- **Ders 10 · Echo out**: Ritim FX'i A'ya verip ECHO açmak, fader'ı kesip yankıyı havada bırakmak, yeni şarkıyı phrase başında sokmak.
- **Geçiş Sınavı** (Ders 6'dan sonra açılır): A'dan B'ye serbest geçiş; 4 başlıkta 25'er puan:
  - **Phrase**: B phrase başında mı girdi (±¼ vuruş tam puan, ±1 vuruş kısmi).
  - **Bas**: iki bas aynı anda kaç saniye çaldı.
  - **Vuruş**: iki şarkı birlikte duyulurken vuruşlar ne kadar kaydı (20 ms üstü).
  - **Seviye**: ses boşluğu ve limiter'a dayanma (clip).
  - Ders sonu kartında her başlık için "şunu düzelt" önerisi.
- Rozetler: Phrase Ustası, Geçiş Ustası (ders 6–10), Sınavı Geçti (80+).

### Düzeltildi
- **SYNC açıkken şarkı biraz erken/geç başlatılınca** vuruşlar ~10 saniyede hizalanıyordu (sınavda "vuruşlar kaydı" puanı düşüyordu). Artık 25 ms'den büyük fark tık sesi olmadan anında kapanıyor; küçük kaymalar yine yumuşakça düzeltiliyor.

### Denendi (tarayıcıda, gerçek tuş olaylarıyla, phrase'e göre zamanlanarak)
- Ders 5–10 baştan sona: hepsi 100/100.
- Geçiş Sınavı: düzgün bas değişimiyle 100/100. Bilerek kötü geçiş (yanlış an, SYNC kapalı, önce A'yı kısmak): 37/100 ve doğru uyarılar ("8 vuruş sonra girdi", "hiç birlikte duyulmadı", "2,7 sn ses boşluğu").

## 0.11.0 — Faz 4a · DJ Akademi: altyapı ve ilk 4 ders (2026-11-22)
### Eklendi
- Üst çubukta **🎓 Akademi** (F4): 14 derslik müfredat. Dersler sırayla açılır; ilerleme, yıldızlar, XP, günlük seri, pratik süresi ve rozetler tarayıcıda saklanır.
- **Ders motoru**: her adımda kısa açıklama, ilgili kontrol **ışıkla gösterilir** (spotlight; ekranın geri kalanı kararır), basılacak tuşlar, yapıp yapmadığının **otomatik kontrolü**, anında "✓ Harika! +10" ve puan.
  - **🖐 Göster** (−2 puan): **hayalet el** kontrolün üstüne gidip basar ve ne yaptığını anlatır; sonra sıra sende ("önce izle, sonra sen yap").
  - **💡 İpucu** (−3 puan), **Atla**, **Çık** (F4).
  - Bazı adımlar "böyle tut" der (ör. 8 saniye hizalı kal).
- **Ders sonu kartı**: yıldız, puan, XP, süre, öğrendiklerin, yeni rozetler; Tekrar / Akademi / Sonraki ders.
- **Ders 1 · Arayüz turu**: deck'ler, dalga formu, mikser, crossfader (ok tuşları), kütüphane, efektler, kısayol listesi (Esc).
- **Ders 2 · Play, Cue ve hot cue**: Q, cue noktası koymak, CUE ile dönmek, CUE'yu basılı tutup önizlemek, hot cue koymak, atlamak, silmek.
- **Ders 3 · BPM ve tempo**: BPM'i okumak, tempoyu 122'den 126'ya getirmek, sıfırlamak, SYNC, key lock farkı.
- **Ders 4 · Kulakla beatmatching**: BPM'ler, tonlar ve faz göstergesi gizli, SYNC kapalı; önce tempo (H/J), sonra vuruşlar (K/L), sonra 8 saniye hizalı tutmak.
- **Beatmatch Antrenörü**: A rastgele tempoda, sayılar gizli; B'yi en kısa sürede eşitle (3 sn hizalı = bitti). Ne kadar hızlı o kadar çok puan, en iyi skor saklanır.
- Hayalet el betik oynatıcısı vuruşa/bara göre bekleyebiliyor; ileride **Ajan DJ** aynı altyapıyı kullanacak.
- 9 rozet: İlk Ders, Hot Cue, Tempo Avcısı, Altın Kulak, Beatmatch Ustası (80+), Kusursuz (3 yıldız), 3 Gün Seri, 7 Gün Seri, 1 Saat.
- Testler: seri sayımı, yıldızlar, en iyi skor, rozetler (toplam 76 test).

### Denendi (tarayıcıda, gerçek tuş olaylarıyla)
- Ders 1–4 baştan sona yalnızca demo parçalarla bitirildi; her adımın kontrolü doğru anda geçti. Ders 4'te bir insan gibi tek tek H/J ve kısa K/L basışlarıyla eşitlendi (tempo farkı 0,09 BPM, faz 2,5 ms). SYNC'e basınca "Bu derste SYNC kapalı" uyarısı geldi.
- 🖐 Göster: hayalet el PLAY'e gidip bastı, açıklama karta yazıldı, sonra "Şimdi sen yap".

## 0.10.0 — Faz 3c · Fader eğrileri, isolator, mikrofon (2026-11-22)
### Eklendi
- **MİKSER** kutusu:
  - **Crossfader eğrisi**: YUMUŞAK (ses yüksekliği sabit, uzun geçişler), DÜZ (ortada ikisi de tam ses), KESKİN (scratch; çok az hareketle tam açılır).
  - **Kanal fader eğrisi**: YUMUŞAK, DÜZ, KESKİN.
  - **EQ / ISOLATOR**: ISOLATOR'da HI/MID/LOW düğmeleri sona çevrilince o bant tamamen yok olur (250 Hz ve 2,5 kHz'de 24 dB/oktav bölme). Bantlar ortadayken ses birebir aynı (toplam sapma 0,000 dB).
  - Seçimler tarayıcıda saklanır.
- **🎤 MİKROFON** kutusu: anons için mikrofon (ON, SEVİYE, konuşurken kırmızı yanan ışık). Ses temizliği: alçak frekans kesici + hafif kompresör; master limiter'dan geçer.
  - **DUCK**: konuşunca müzik 12 dB kısılır (≈50 ms'de), susunca 0,6 sn bekleyip yumuşakça geri gelir. Mikrofon kendisi kısılmaz.
- Testler: eğriler, isolator kazancı (toplam 72 test).

### Ölçüldü (tarayıcıda)
- Isolator bantlarının toplamı 20 Hz–20 kHz arası düz (0,000 dB). Bant kesme: 60 Hz'de −49 dB, 1 kHz'de −31 dB, 10 kHz'de −55 dB.
- Ducking (mikrofon yerine 300 Hz test sesiyle): konuşma başlayınca müzik −12 dB, susunca 0,5 sn sonra hâlâ kısık, 2 sn içinde tam ses. DUCK kapalıyken müzik kısılmıyor.

### Ertelendi
- 4 deck: ekran ve klavye iki deck'e göre; asıl MIDI kontrolcüyle anlamlı olduğu için Faz 5'te (MIDI) ele alınacak.

### Bilinen
- Gerçek mikrofonla burada denenemedi (tarayıcı panelinde mikrofon yok). Hoparlöre yakın konuşursan ıslık (feedback) olabilir; uygulama mikrofonu açarken uyarır.

## Yayın (2026-11-22)
- Proje GitHub'da: https://github.com/omeradn/klavye-dj (herkese açık). Canlı site: https://omeradn.github.io/klavye-dj/
- Her güncellemede GitHub testleri, tip kontrolünü ve iki derlemeyi çalıştırır; hepsi geçerse siteyi yayınlar. Tek dosya sürümü de sitede.
- Commit'lerde GitHub'ın gizli e-posta adresi kullanılıyor.

## 0.9.0 — Faz 3b · Ritim FX ve Kanal FX (2026-11-22)
### Eklendi
- **RİTİM FX** çubuğu (deck'lerin altında): tempoya senkron tek efekt ünitesi.
  - 10 efekt: ECHO, REVERB, FLANGER, PHASER, ROLL, GATE, SPİRAL, SWEEP, PITCH, FREN.
  - **VURUŞ**: 1/16'dan 16 vuruşa (efektin hızı ya da uzunluğu); her efektin kendi varsayılanı var.
  - **HEDEF**: A, B ya da MASTER. Deck'e uygulanınca kanal fader'ından sonra, crossfader'dan önce girer.
  - **SEVİYE**: çoğu efektte miktar; PITCH'te −12…+12 yarım ses; GATE'te derinlik.
  - Tempo, hedef deck'in grid'inden her an okunur (MASTER'da salonda duyulan deck). Turuncu ışık efektin takip ettiği vuruşta yanar.
  - ECHO, REVERB ve SPİRAL kapatılınca kuyruk doğal söner. ROLL son grid çizgisinden başlar. GATE, FLANGER, PHASER ve SWEEP vuruşa hizalı başlar.
- **KANAL FX**: her kanaldaki FİLTRE düğmesi seçilen efekte dönüşür: FİLTRE · SPACE (yankılı boşluk) · NOISE (rüzgâr gürültüsü) · CRUSH (bozma). Ortada kapalı; sola koyu, sağa parlak. Kulaklık CUE'su Kanal FX'i de duyurur.
- Klavye: **B** Ritim FX aç/kapa · **⇧B** hedef · **,** sonraki efekt (⇧ önceki) · **\*** vuruş ½ · **-** vuruş ×2 · **İ** seviye + (⇧ −) · **↑** Kanal FX türü (⇧ önceki).
- Ses motoru: ROLL / GATE / FREN / PITCH için yeni efekt çekirdeği (8 saniyelik geçmiş tamponu, 5 ms yumuşak açılış-kapanış).
- Testler: gate'in grid'e oturduğu, roll'un son vuruştan tekrar edip bırakınca müziğe döndüğü, frenin durduğu, pitch +12'nin frekansı ikiye katladığı (toplam 68 test).

### Ölçüldü (tarayıcıda)
- GATE 1/4 vuruş: kapalı yarımlar grid'e hizalı, ses −56 dB.
- ECHO 3/4 vuruş: 122 BPM'de 0,369 s; tempo +%4 olunca 0,355 s (tempoyu takip ediyor).
- 10 efektin hepsi açıldı-kapandı, master limiter'da kırmızı (clip) olmadı.

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
