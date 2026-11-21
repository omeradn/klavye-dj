<script lang="ts">
  import { onMount } from 'svelte';
  import { initApp } from './app';

  onMount(() => initApp());
</script>

<header>
  <div class="logo">KLAVYE <b>D</b><i>J</i></div>
  <span class="note">Şarkıyı deck'e veya dalga formuna sürükle · Tekerlek: deck üstünde tempo, düğme/fader üstünde o kontrol</span>
  <div class="sp"></div>
  <div class="mwrap">MASTER <div class="kwrap" id="masterK"></div></div>
  <button class="hbtn" id="keysBtn">Tuş etiketleri</button>
  <button class="hbtn" id="helpBtn">Kısayollar <kbd>Esc</kbd></button>
</header>

<div class="waves">
  <div class="wrow"><div class="wlab" style="color:var(--a)">A</div><div class="wcan"><canvas class="scroll" id="wsA"></canvas><canvas class="ov" id="woA"></canvas></div></div>
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
  </section>
  <section class="deck B" id="deckB"></section>
</div>

<div id="help"><div class="box">
  <h2 style="margin:0 0 10px">Klavye kısayolları</h2>
  <table id="helpT"></table>
  <p class="note">Tuşlar fiziksel konuma göre çalışır (Türkçe Q klavyede etiketler: Ş, Ö, Ç). <b>Shift</b> = kontrolcülerdeki SHIFT tuşu gibi ikinci fonksiyon.
  Tekerlek: deck üzerinde tempo (±0,1%), herhangi bir düğme/fader üzerinde o kontrol. Çift tık = varsayılana döndür.
  Jog wheel: çalarken çevir = beat yakalama, dururken çevir = şarkıda ileri/geri.</p>
  <button class="hbtn" id="helpClose">Kapat</button>
</div></div>
<div class="toast" id="toast"></div>
