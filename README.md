# Klavye DJ

TarayÄ±cÄ±da Ã§alÄ±ÅŸan, klavye ve mouse ile kontrol edilen DJ uygulamasÄ±. Hedef: profesyonel bir DJ yazÄ±lÄ±mÄ± + DJ'liÄŸi adÄ±m adÄ±m Ã¶ÄŸreten bir akademi + restoran setleri iÃ§in Ã¶zel modlar.

> Durum: **Faz 0 tamam** â€” eski tek dosyalÄ±k sÃ¼rÃ¼m (klavye-dj.html) Vite + TypeScript + Svelte projesine taÅŸÄ±ndÄ±. Yol haritasÄ± iÃ§in [CHANGELOG.md](CHANGELOG.md).

## Gerekenler
- Windows'ta **Node.js 20 veya Ã¼stÃ¼** (kontrol: `node -v`)
- **Chrome** ya da **Edge** (ses kartÄ± seÃ§imi, klasÃ¶r eriÅŸimi ve MIDI yalnÄ±zca bunlarda tam Ã§alÄ±ÅŸÄ±r)

## En kolay yol
Proje klasÃ¶rÃ¼ndeki **`baslat.cmd`** dosyasÄ±na Ã§ift tÄ±kla. Ä°lk seferde paketleri kurar, sonra uygulamayÄ± tarayÄ±cÄ±da aÃ§ar. Kapatmak iÃ§in siyah pencereyi kapat.

## Terminalden Ã§alÄ±ÅŸtÄ±rma
> PowerShell'de `npm` yerine **`npm.cmd`** yaz. Windows betik gÃ¼venlik ayarÄ± (`running scripts is disabled`) yÃ¼zÃ¼nden `npm` tek baÅŸÄ±na Ã§alÄ±ÅŸmayabilir; `npm.cmd` bu ayara takÄ±lmaz.

Ã–nce proje klasÃ¶rÃ¼ne geÃ§:

```powershell
cd "C:\Users\MSÄ° PC\Projects\klavye-dj"
```

Paketleri kur (bir kez):

```powershell
npm.cmd install
```

UygulamayÄ± baÅŸlat, sonra tarayÄ±cÄ±da http://localhost:5173 adresini aÃ§:

```powershell
npm.cmd run dev
```

Durdurmak iÃ§in terminalde `Ctrl + C`.

## DiÄŸer komutlar
| Komut | Ne yapar |
|---|---|
| `npm.cmd test` | Analiz testlerini Ã§alÄ±ÅŸtÄ±rÄ±r (BPM tespiti vb.) |
| `npm.cmd run check` | Kodda tip hatasÄ± var mÄ± kontrol eder |
| `npm.cmd run build` | YayÄ±na hazÄ±r sÃ¼rÃ¼mÃ¼ `dist/` klasÃ¶rÃ¼ne Ã¼retir |
| `npm.cmd run build:single` | Tek dosyalÄ±k sÃ¼rÃ¼mÃ¼ `dist-single/index.html` olarak Ã¼retir (Ã§ift tÄ±klayÄ±p aÃ§Ä±labilir) |

## KlasÃ¶r yapÄ±sÄ±
```
src/
  engine/    ses motoru: deck, mikser, AudioContext
  analysis/  BPM tespiti, dalga formu (ileride: beatgrid, ton)
  input/     klavye haritasÄ± (ileride: MIDI, gamepad)
  ui/        knob/fader kontrolleri, tuÅŸ etiketleri, yardÄ±m penceresi
  App.svelte ekran dÃ¼zeni
  styles.css gÃ¶rÃ¼nÃ¼m
tests/       Vitest testleri (sentetik, telifsiz test sesleriyle)
legacy/      ilk tek dosyalÄ±k sÃ¼rÃ¼m (referans iÃ§in)
```
Ä°leride eklenecek klasÃ¶rler: `library`, `academy`, `coach`, `demo`.

## Klavye dÃ¼zeni (TÃ¼rkÃ§e Q)
| Kontrol | Deck A | Deck B |
|---|---|---|
| Hot cue 1â€“4 (â‡§ = sil) | 1 2 3 4 | 7 8 9 0 |
| Ã‡al / Durdur (â‡§ = ÅŸarkÄ± yÃ¼kle) | Q | Y |
| CUE | W | U |
| SYNC (â‡§ = Key Lock) | E | I |
| Loop aÃ§/kapat | R | O |
| Loop Ã—2 (â‡§ = Â½) | T | P |
| Tempo âˆ’ / + (â‡§ = kanal fader) | A / S | H / J |
| Pitch bend âˆ’ / + (â‡§ = filtre) | D / F | K / L |
| Tempo sÄ±fÄ±rla (â‡§ = filtre ortala) | G | Å |
| LOW / MID / HI kill (â‡§Z = EQ sÄ±fÄ±rla, â‡§X/â‡§C = echo seviyesi) | Z / X / C | N / M / Ã– |
| ECHO | V | Ã‡ |

Genel: `â†` `â†’` `â†“` crossfader Â· `PgUp` / `PgDn` master Â· `Esc` / `F1` yardÄ±m.
Mouse: deck Ã¼zerinde tekerlek = tempo, bir kontrolÃ¼n Ã¼zerinde tekerlek = o kontrol, Ã§ift tÄ±k = sÄ±fÄ±rla.

## Teknik notlar
- ArayÃ¼z Svelte 5 ile (listeler, akademi ve ayar ekranlarÄ± az kodla ve kÃ¼Ã§Ã¼k paketle yazÄ±labilsin diye); ses motoru ve dalga formu Ã§izimi Svelte'ten baÄŸÄ±msÄ±z, dÃ¼z TypeScript.
- Demo ve test sesleri kodla Ã¼retilir; projede telifli mÃ¼zik yoktur.
