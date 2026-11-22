# Klavye DJ

Tarayıcıda çalışan, klavye ve mouse ile kontrol edilen DJ uygulaması. Hedef: profesyonel bir DJ yazılımı + DJ'liği adım adım öğreten bir akademi + restoran setleri için özel modlar.

> Durum: **Faz 3 tamam** — pad'ler ve sampler, Ritim FX, Kanal FX, fader eğrileri, isolator, mikrofon + ducking · **Faz 2 tamam** — ses motoru, kulaklık cue, kütüphane (playlist, geçmiş, etiket), beatgrid, gerçek SYNC, quantize, Türk ritimleri, ton tespiti ve Ton Çarkı, 3 renkli dalga formu. Yol haritası için [CHANGELOG.md](CHANGELOG.md).

## Canlı sürüm
**https://omeradn.github.io/klavye-dj/** — kurulum gerekmez, Chrome ya da Edge ile açılır.
İnternetsiz kullanmak için tek dosya: https://omeradn.github.io/klavye-dj/klavye-dj-tek-dosya.html (sağ tık → Farklı kaydet).
Her `main` güncellemesinde GitHub testleri çalıştırır; geçerse site birkaç dakika içinde kendiliğinden yenilenir.
Kütüphane ve kayıtlar (hot cue, grid, listeler) her tarayıcıda ayrı tutulur; şarkılar bilgisayarından okunur, hiçbir yere yüklenmez.

## Gerekenler
- Windows'ta **Node.js 20 veya üstü** (kontrol: `node -v`)
- **Chrome** ya da **Edge** (ses kartı seçimi, klasör erişimi ve MIDI yalnızca bunlarda tam çalışır)

## En kolay yol
Proje klasöründeki **`baslat.cmd`** dosyasına çift tıkla. İlk seferde paketleri kurar, sonra uygulamayı tarayıcıda açar. Kapatmak için siyah pencereyi kapat.

## Terminalden çalıştırma
> PowerShell'de `npm` yerine **`npm.cmd`** yaz. Windows'un betik güvenlik ayarı (`running scripts is disabled`) yüzünden `npm` tek başına çalışmayabilir; `npm.cmd` bu ayara takılmaz.

Önce proje klasörüne geç:

```powershell
cd "C:\Users\MSİ PC\Projects\klavye-dj"
```

Paketleri kur (bir kez):

```powershell
npm.cmd install
```

Uygulamayı başlat, sonra tarayıcıda http://localhost:5173 adresini aç:

```powershell
npm.cmd run dev
```

Durdurmak için terminalde `Ctrl + C`.

## Diğer komutlar
| Komut | Ne yapar |
|---|---|
| `npm.cmd test` | Analiz testlerini çalıştırır (BPM tespiti vb.) |
| `npm.cmd run check` | Kodda tip hatası var mı kontrol eder |
| `npm.cmd run build` | Yayına hazır sürümü `dist/` klasörüne üretir |
| `npm.cmd run build:single` | Tek dosyalık sürümü `dist-single/index.html` olarak üretir (çift tıklayıp açılabilir) |

## Klasör yapısı
```
src/
  engine/    ses motoru: deck, mikser, AudioContext
    worklets/  ses işleme çekirdeği (deck çalıcı, limiter) — ayrı ses iş parçacığında çalışır
  analysis/  BPM tespiti, dalga formu (ileride: beatgrid, ton)
  demo/      kodla üretilen demo parçalar (telifsiz)
  input/     klavye haritası (ileride: MIDI, gamepad)
  ui/        knob/fader kontrolleri, tuş etiketleri, yardım penceresi
  App.svelte ekran düzeni
  styles.css görünüm
tests/       Vitest testleri (sentetik, telifsiz test sesleriyle)
legacy/      ilk tek dosyalık sürüm (referans için)
```
İleride eklenecek klasörler: `library`, `academy`, `coach`.

## Klavye düzeni (Türkçe Q)
| Kontrol | Deck A | Deck B |
|---|---|---|
| Pad 1–4 (üst sıra) · ⇧ = pad 5–8 (alt sıra) | 1 2 3 4 | 7 8 9 0 |
| Pad modu: sonraki (⇧ = önceki) | 5 | 6 |
| Hot cue sil / sampler'a kendi sesini yükle | Backspace + pad | Backspace + pad |
| Çal / Durdur (⇧ = şarkı yükle) | Q | Y |
| CUE — basılı tut = dinle (⇧ = BRAKE) | W | U |
| SYNC — tempo + vuruş kilidi, tekrar bas = kapat (⇧ = Key Lock) | E | I |
| Loop aç/kapat (⇧ = VINYL modu) | R | O |
| Loop ×2 (⇧ = ½) | T | P |
| Tempo − / + (⇧ = kanal fader) | A / S | H / J |
| Pitch bend − / + (⇧ = filtre) | D / F | K / L |
| Tempo sıfırla (⇧ = filtre ortala) | G | Ş |
| LOW / MID / HI kill (⇧Z = EQ sıfırla, ⇧X/⇧C = echo seviyesi) | Z / X / C | N / M / Ö |
| ECHO | V | Ç |
| REV — ters çal (⇧ = SLIP modu) | Tab | Ğ |
| CENSOR — basılı tut (⇧ = SPIN) | < | . |
| TON +1 yarım ses (⇧ = −1) | " | Ü |
| Kulaklık CUE (ECHO tuşu + ⇧) | ⇧V | ⇧Ç |

Ritim FX: `B` aç/kapa · `⇧B` hedef · `,` efekt · `*` / `-` vuruş · `İ` seviye · Kanal FX türü: `↑`.
Genel: `←` `→` `↓` crossfader · `PgUp` / `PgDn` master · `F2` ses ayarları · `Esc` / `F1` yardım.
Mouse: deck üzerinde tekerlek = tempo, bir kontrolün üzerinde tekerlek = o kontrol, çift tık = sıfırla.
Jog: VINYL açıkken iç kısmı tutup çevirmek = scratch; dış halka = tempo dürtme (çalarken) / ileri-geri sarma (dururken).

## Kütüphane
- **+ Klasör** ile müzik klasörünü ekle; Chrome/Edge klasörü hatırlar. Şarkılar arka planda analiz edilir (BPM, süre).
- Satırdaki **A** / **B** ile o deck'e yükle, çift tıkla boştaki deck'e yükle. Üstteki kutuda ara (BPM de yazabilirsin, ör. `124`).
- Dosyaların kopyası alınmaz; kütüphane sadece nerede olduklarını hatırlar. Klasörü taşırsan yeniden ekle.

## Pad'ler
Her deck'te 8 pad var; ne yapacaklarını üstteki mod belirler (**5** / **6** ile değiştir):
| Mod | Pad'ler ne yapar |
|---|---|
| HOT CUE | Boş pad o anı kaydeder, dolu pad oraya atlar (8 tane, şarkıyla saklanır) |
| LOOP | ¼ – 32 vuruşluk loop aç/kapa |
| JUMP | 1, 4, 16, 32 vuruş geri/ileri atla |
| SLICER | Çalan 8 vuruşun dilimlerini basılı tutarak çal; bırakınca şarkı kaldığı yerden devam |
| ROLL | Basılı tuttukça kısa tekrar ("trrrr"); bırakınca şarkı kaldığı yerden devam |
| SAMPLER | Korna, siren, darbuka… (⇧+tık / sağ tık: kendi sesini yükle) |
| TON | Tonu −3…+4 yarım ses kaydır |

## Beatgrid ve SYNC
- Dalga formundaki çizgiler: ince = vuruş, beyaz = bar başı, kırmızı = phrase başı. Deck'teki sayaç hangi phrase ve barda olduğunu gösterir (tıkla: 4/8/16/32 bar).
- **SYNC** tempoyu eşitler ve vuruşları kilitler. Dalga formlarının arasındaki **FAZ** çubuğu yeşil ve ortadaysa vuruşlar üst üste.
- Grid yanlışsa GRID satırı: ◁ ▷ kaydır, **1.1** = "bu vuruş bar başı", BPM− / BPM+. Ölçü butonu: 4/4, 6/8, 7/8, 9/8, 10/8 (aksak ritimler için). Düzeltmeler şarkıyla birlikte saklanır.
- **QUANT** açıkken hot cue, cue ve loop vuruşa oturur.

## Ton Çarkı
- Her şarkının tonu bulunur ve 1–12 arası bir numarayla gösterilir (ör. `Am · 1m`). Aynı numara ya da bir komşu numara (aynı harfle) = rahat karışır.
- Deck'teki ton yazısı yeşilse diğer deck'le uyumlu, sarıysa riskli, kırmızıysa çatışır. TON ♯/♭ ile tonu kaydırarak uyumlu hale getirebilirsin.
- Kütüphanede **✓ Uyumlu**: çalan şarkıdan sonra tonu ve temposu uyan şarkıları gösterir.

## Kulaklık
- Her kanaldaki **🎧 CUE** o kanalı kulaklığa gönderir (fader'dan önce, yani kanal kapalıyken de duyulur).
- **Tek çıkışlı bilgisayar** (laptop + kulaklık): mikserde **SPLIT**'i aç → sol kulak CUE, sağ kulak master.
- **4 kanallı ses kartı / DJ kontrolcüsü**: `F2` → Kulaklık → *4 kanallı ses kartı*. Çıkış 1-2 hoparlöre, 3-4 kulaklığa.
- **İki ayrı cihaz** (ör. hoparlör + USB kulaklık): `F2` → Kulaklık → *Ayrı cihaz* ve cihazı seç.

## Teknik notlar
- Arayüz Svelte 5 ile (listeler, akademi ve ayar ekranları az kodla ve küçük paketle yazılabilsin diye); ses motoru ve dalga formu çizimi Svelte'ten bağımsız, düz TypeScript.
- Demo ve test sesleri kodla üretilir; projede telifli müzik yoktur.
- Key lock: [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (MIT lisanslı). Ton düzelticinin 120 ms gecikmesi, deck motorunun 120 ms ileriden okuyan ikinci okuma kafasıyla gizlenir; bu yüzden tuşlar gecikmez.
