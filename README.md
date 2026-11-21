# Klavye DJ

Tarayıcıda çalışan, klavye ve mouse ile kontrol edilen DJ uygulaması. Hedef: profesyonel bir DJ yazılımı + DJ'liği adım adım öğreten bir akademi + restoran setleri için özel modlar.

> Durum: **Faz 0 tamam** — eski tek dosyalık sürüm (klavye-dj.html) Vite + TypeScript + Svelte projesine taşındı. Yol haritası için [CHANGELOG.md](CHANGELOG.md).

## Gerekenler
- Windows'ta **Node.js 20 veya üstü** (kontrol: `node -v`)
- **Chrome** ya da **Edge** (ses kartı seçimi, klasör erişimi ve MIDI yalnızca bunlarda tam çalışır)

## Kurulum (bir kez)
Proje klasöründe PowerShell aç ve şunu çalıştır — gerekli paketleri indirir:

```powershell
npm install
```

## Çalıştırma
Geliştirme sunucusunu başlatır; tarayıcıda http://localhost:5173 adresini aç:

```powershell
npm run dev
```

Durdurmak için terminalde `Ctrl + C`.

## Diğer komutlar
| Komut | Ne yapar |
|---|---|
| `npm test` | Analiz testlerini çalıştırır (BPM tespiti vb.) |
| `npm run check` | Kodda tip hatası var mı kontrol eder |
| `npm run build` | Yayına hazır sürümü `dist/` klasörüne üretir |
| `npm run build:single` | Tek dosyalık sürümü `dist-single/index.html` olarak üretir (çift tıklayıp açılabilir) |

## Klasör yapısı
```
src/
  engine/    ses motoru: deck, mikser, AudioContext
  analysis/  BPM tespiti, dalga formu (ileride: beatgrid, ton)
  input/     klavye haritası (ileride: MIDI, gamepad)
  ui/        knob/fader kontrolleri, tuş etiketleri, yardım penceresi
  App.svelte ekran düzeni
  styles.css görünüm
tests/       Vitest testleri (sentetik, telifsiz test sesleriyle)
legacy/      ilk tek dosyalık sürüm (referans için)
```
İleride eklenecek klasörler: `library`, `academy`, `coach`, `demo`.

## Klavye düzeni (Türkçe Q)
| Kontrol | Deck A | Deck B |
|---|---|---|
| Hot cue 1–4 (⇧ = sil) | 1 2 3 4 | 7 8 9 0 |
| Çal / Durdur (⇧ = şarkı yükle) | Q | Y |
| CUE | W | U |
| SYNC (⇧ = Key Lock) | E | I |
| Loop aç/kapat | R | O |
| Loop ×2 (⇧ = ½) | T | P |
| Tempo − / + (⇧ = kanal fader) | A / S | H / J |
| Pitch bend − / + (⇧ = filtre) | D / F | K / L |
| Tempo sıfırla (⇧ = filtre ortala) | G | Ş |
| LOW / MID / HI kill (⇧Z = EQ sıfırla, ⇧X/⇧C = echo seviyesi) | Z / X / C | N / M / Ö |
| ECHO | V | Ç |

Genel: `←` `→` `↓` crossfader · `PgUp` / `PgDn` master · `Esc` / `F1` yardım.
Mouse: deck üzerinde tekerlek = tempo, bir kontrolün üzerinde tekerlek = o kontrol, çift tık = sıfırla.

## Teknik notlar
- Arayüz Svelte 5 ile (listeler, akademi ve ayar ekranları az kodla ve küçük paketle yazılabilsin diye); ses motoru ve dalga formu çizimi Svelte'ten bağımsız, düz TypeScript.
- Demo ve test sesleri kodla üretilir; projede telifli müzik yoktur.
