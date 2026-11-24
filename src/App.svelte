<script lang="ts">
  import { onMount } from 'svelte';
  import { initApp } from './app';

  onMount(() => initApp());
</script>

<header>
  <div class="logo">KLAVYE <b>D</b><i>J</i></div>
  <span class="note">Şarkıyı deck'e veya dalga formuna sürükle · Tekerlek: deck üstünde tempo, düğme/fader üstünde o kontrol</span>
  <div class="sp"></div>
  <div class="lim" title="Master limiter: ses asla -1 dBFS'yi aşmaz. Sarı = limiter çalışıyor, kırmızı = limiter olmasa clip olacaktı (ses çok yüksek, TRIM/kanal/master'ı kıs)">
    <i id="limLed"></i><span>LİMİT</span><div class="grm"><i id="grBar"></i></div><span id="grTxt">0.0 dB</span>
  </div>
  <div class="mwrap" title="Sampler ses seviyesi (pad'ler SAMPLER modunda)">SAMPLER <div class="kwrap" id="sampK"></div></div>
  <div class="mwrap">MASTER <div class="kwrap" id="masterK"></div></div>
  <button class="hbtn" id="ctrlBtn" title="MIDI kontrolcü bağla (Learn) ve tuşları değiştir">🎛️ Kontrol</button>
  <button class="hbtn acad" id="acadBtn" title="Adım adım DJ dersleri (F4)">🎓 Akademi <kbd>F4</kbd></button>
  <button class="hbtn" id="setBtn">Ses ayarları <kbd>F2</kbd></button>
  <button class="hbtn" id="keysBtn">Tuş etiketleri</button>
  <button class="hbtn" id="helpBtn">Kısayollar <kbd>Esc</kbd></button>
</header>

<div class="waves">
  <div class="wrow"><div class="wlab" style="color:var(--a)">A</div><div class="wcan"><canvas class="scroll" id="wsA"></canvas><canvas class="ov" id="woA"></canvas></div></div>
  <div class="phase" title="Faz: iki deck'in vuruşları ne kadar kayık. Ortada ve yeşil = vuruşlar üst üste">
    <span class="plab">FAZ</span><div class="pm"><b></b><i id="phI"></i></div><span id="phT">—</span>
  </div>
  <div class="wrow"><div class="wlab" style="color:var(--b)">B</div><div class="wcan"><canvas class="scroll" id="wsB"></canvas><canvas class="ov" id="woB"></canvas></div></div>
</div>

<div class="console">
  <section class="deck A" id="deckA"></section>
  <section class="mixer">
    <div class="chs">
      <div class="ch" id="chA"></div>
      <div class="ctr"><div class="vus"><div class="vu"><i id="vuA"></i></div><div class="vu"><i id="vuB"></i></div></div></div>
      <div class="ch" id="chB"></div>
    </div>
    <div class="xfw"><span class="k" id="xfk">← ↓ →</span>
      <div class="lbl"><span style="color:var(--a)">A</span><span>CROSSFADER</span><span style="color:var(--b)">B</span></div>
      <div class="fader h" id="xf"></div>
    </div>
    <div class="phones" title="Kulaklık: kanallardaki 🎧 CUE ile seçtiğin şarkıyı dinlersin">
      <span class="plbl">🎧 KULAKLIK</span>
      <div id="cueMixK"></div>
      <div id="phLevelK"></div>
      <button class="b" id="splitBtn" title="Sol kulak: CUE · sağ kulak: master (tek çıkışlı bilgisayarda kulaklıkla çalışmak için)">SPLIT</button>
    </div>
  </section>
  <section class="deck B" id="deckB"></section>
</div>

<section class="fxbar">
  <div class="fxu">
    <b>RİTİM FX</b><i id="fxLed" title="Efektin takip ettiği vuruş"></i>
    <button class="b sm" id="fxPrev" title="Önceki efekt (⇧ + ,)">◀</button>
    <span class="fxn" id="fxName">ECHO</span>
    <button class="b sm" id="fxNext" title="Sonraki efekt ( , )">▶</button>
    <span class="lbl">VURUŞ</span>
    <button class="b sm" id="fxHalf" title="Yarıya indir ( * )">½</button>
    <span class="fxv" id="fxBeats">3/4</span>
    <button class="b sm" id="fxDouble" title="İki katına çıkar ( - )">×2</button>
    <span class="lbl">HEDEF</span>
    <span class="seg" id="fxTarget" title="Efekt hangi sese uygulanacak (⇧B ile değiştir)"><button data-t="A">A</button><button data-t="B">B</button><button data-t="M">MASTER</button></span>
    <div id="fxLevelK"></div><span class="fxv" id="fxVal">%60</span>
    <button class="b red" id="fxOn" title="Efekti aç / kapat (B)">ON</button>
    <span class="note" id="fxBpm">120.0 BPM</span>
  </div>
  <div class="fxu">
    <b>KANAL FX</b>
    <button class="b sm" id="cfxPrev" title="Önceki (⇧↑)">◀</button>
    <span class="fxn" id="cfxName">FİLTRE</span>
    <button class="b sm" id="cfxNext" title="Sonraki (↑)">▶</button>
    <span class="note">Kanallardaki düğme (⇧D / ⇧F, ⇧G ortala)</span>
  </div>
  <div class="fxu">
    <b>MİKSER</b>
    <span class="lbl">CROSSFADER</span><button class="b sm wide" id="xfCurve">YUMUŞAK</button>
    <span class="lbl">KANAL</span><button class="b sm wide" id="chCurve">YUMUŞAK</button>
    <span class="lbl">EQ</span><span class="seg" id="eqMode"><button data-m="eq">EQ</button><button data-m="iso">ISOLATOR</button></span>
  </div>
  <div class="fxu">
    <b>🎤 MİKROFON</b>
    <button class="b red" id="micOn" title="Mikrofonu aç / kapat (anons için)">ON</button>
    <i id="micLed"></i>
    <div id="micK"></div>
    <button class="b sm" id="duckBtn" title="Konuşunca müzik kendiliğinden kısılır, susunca geri gelir">DUCK</button>
  </div>
</section>

<section class="lib">
  <div class="lbar">
    <b>KÜTÜPHANE</b>
    <input id="libSearch" type="search" placeholder="Ara: şarkı, klasör ya da BPM (ör. 124)" autocomplete="off">
    <button class="hbtn" id="libFits">✓ Uyumlu</button>
    <span id="libStat" class="note"></span>
    <div class="sp"></div>
    <button class="hbtn" id="libDir" title="Bir müzik klasörü ekle (alt klasörler dahil). Tarayıcı klasörü hatırlar.">+ Klasör</button>
    <button class="hbtn" id="libFiles" title="Tek tek şarkı dosyası ekle">+ Dosya</button>
    <input type="file" id="libDirInput" webkitdirectory multiple hidden>
    <input type="file" id="libFileInput" accept="audio/*" multiple hidden>
  </div>
  <div id="libRoots" class="roots"></div>
  <div class="lmain">
    <nav id="libSide"></nav>
    <div class="ltable"><table id="libT">
      <thead><tr><th data-k="name">Şarkı</th><th data-k="folder" id="libFolderTh">Klasör</th><th data-k="bpm" class="num">BPM</th>
        <th data-k="key" title="Ton · çark numarası. Renk: çalan şarkıyla uyum (yeşil uyumlu, sarı riskli, kırmızı çatışır)">Ton</th>
        <th data-k="energy" class="num" title="Enerji 1–10">Enerji</th><th data-k="dur" class="num">Süre</th><th>Etiket</th><th class="ld">Yükle</th></tr></thead>
      <tbody id="libBody"></tbody>
    </table></div>
  </div>
  <div id="libMore" class="note"></div>
  <p class="note">Çift tık: boştaki deck'e yükle · A / B: o deck'e yükle · Başlığa tıkla: sırala · Etikete tıkla: düzenle · Satırı soldaki listeye sürükle: listeye ekle · ✓ Uyumlu: çalan şarkıdan sonra uyumlu gidecekler · Dalga formunda tekerlek: zoom</p>
</section>

<div id="help"><div class="box">
  <h2 style="margin:0 0 10px">Klavye kısayolları</h2>
  <table id="helpT"></table>
  <p class="note">Tuşlar fiziksel konuma göre çalışır (Türkçe Q klavyede etiketler: Ş, Ö, Ç). <b>Shift</b> = kontrolcülerdeki SHIFT tuşu gibi ikinci fonksiyon.
  Tekerlek: deck üzerinde tempo (±0,1%), herhangi bir düğme/fader üzerinde o kontrol. Çift tık = varsayılana döndür.
  Jog wheel: çalarken çevir = beat yakalama, dururken çevir = şarkıda ileri/geri.</p>
  <button class="hbtn" id="helpClose">Kapat</button>
</div></div>
<div id="settings"><div class="box">
  <h2 style="margin:0 0 12px">Ses ayarları</h2>
  <div id="setBody"></div>
  <button class="hbtn" id="setClose">Kapat</button>
</div></div>
<div id="control"><div class="box">
  <div class="acHead"><h2>🎛️ Kontrol</h2><button class="hbtn" id="ctrlClose">Kapat</button></div>
  <div class="seg" id="ctrlTabs"><button data-t="midi">MIDI</button><button data-t="keys">TUŞLAR</button></div>
  <div id="ctrlBody"></div>
</div></div>
<div id="academy"><div class="box">
  <div class="acHead"><h2>🎓 DJ Akademi</h2><button class="hbtn" id="acClose">Kapat</button></div>
  <div class="acStats" id="acStats"></div>
  <h3>Dersler <small>sırayla açılır</small></h3>
  <ul class="acList" id="acLessons"></ul>
  <h3>Pratik</h3>
  <ul class="acList" id="acPractice"></ul>
  <h3>Rozetler</h3>
  <div class="badges" id="acBadges"></div>
</div></div>

<div id="spot"></div>
<div id="coach">
  <div class="cHead"><b id="coachTitle"></b><span id="coachScore"></span></div>
  <div class="cDots" id="coachDots"></div>
  <div class="cText" id="coachText"></div>
  <div class="cKeys" id="coachKeys"></div>
  <div id="coachMsg"></div>
  <div class="cChoices" id="coachChoices"></div>
  <div class="cBtns">
    <button class="hbtn" id="coachShow" title="Hayalet el önce gösterir, sonra sen yaparsın (−2 puan)">🖐 Göster</button>
    <button class="hbtn" id="coachHint" title="İpucu (−3 puan)">💡 İpucu</button>
    <button class="hbtn" id="coachSkip">Atla</button>
    <button class="hbtn" id="coachExit">Çık</button>
    <button class="hbtn primary" id="coachNext">Devam</button>
  </div>
</div>
<div id="summary"><div class="box" id="summaryBox"></div></div>
<div class="toast" id="toast"></div>
