# Klavye DJ

Tarayıcıda çalışan, klavye ve mouse ile kontrol edilen DJ uygulaması. Hedef: profesyonel bir DJ yazılımı + DJ'liği adım adım öğreten bir akademi + restoran setleri için özel modlar.

> Durum: **Faz 1b tamam** — yeni ses motoru, master limiter, demo parçalar, key lock ve ton kaydırma. Yol haritası için [CHANGELOG.md](CHANGELOG.md).

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
| Hot cue 1–4 (⇧ = sil) | 1 2 3 4 | 7 8 9 0 |
| Çal / Durdur (⇧ = şarkı yükle) | Q | Y |
| CUE — basılı tut = dinle (⇧ = BRAKE) | W | U |
| SYNC (⇧ = Key Lock) | E | I |
| Loop aç/kapat (⇧ = VINYL modu) | R | O |
| Loop ×2 (⇧ = ½) | T | P |
| Tempo − / + (⇧ = kanal fader) | A / S | H / J |
| Pitch bend − / + (⇧ = filtre) | D / F | K / L |
| Tempo sıfırla (⇧ = filtre ortala) | G | Ş |
| LOW / MID / HI kill (⇧Z = EQ sıfırla, ⇧X/⇧C = echo seviyesi) | Z / X / C | N / M / Ö |
| ECHO | V | Ç |
| REV — ters çal (⇧ = SLIP modu) | Tab | Ğ |
| CENSOR — basılı tut (⇧ = SPIN) | < | . |
| Beat jump ileri (⇧ = geri) | 5 | 6 |
| TON +1 yarım ses (⇧ = −1) | " | Ü |

Genel: `←` `→` `↓` crossfader · `PgUp` / `PgDn` master · `Esc` / `F1` yardım.
Mouse: deck üzerinde tekerlek = tempo, bir kontrolün üzerinde tekerlek = o kontrol, çift tık = sıfırla.
Jog: VINYL açıkken iç kısmı tutup çevirmek = scratch; dış halka = tempo dürtme (çalarken) / ileri-geri sarma (dururken).

## Teknik notlar
- Arayüz Svelte 5 ile (listeler, akademi ve ayar ekranları az kodla ve küçük paketle yazılabilsin diye); ses motoru ve dalga formu çizimi Svelte'ten bağımsız, düz TypeScript.
- Demo ve test sesleri kodla üretilir; projede telifli müzik yoktur.
- Key lock: [Signalsmith Stretch](https://github.com/Signalsmith-Audio/signalsmith-stretch) (MIT lisanslı). Ton düzelticinin 120 ms gecikmesi, deck motorunun 120 ms ileriden okuyan ikinci okuma kafasıyla gizlenir; bu yüzden tuşlar gecikmez.
