// Freddy Bear Kart 3D -- a 3D kart racer for MickleCade (three.js).
// A MICKLEKIDS GAME. The racers are the stars of the other MickleCade games: Freddy Bear the
// koala, Snowbell the bunny and her friends, and Bowie the orange bunny. Race 3 laps against
// computer racers (alone or two players on a split screen), play a 3-race Grand Prix, collect
// golden koala coins for hats and kart paint, and draw your own tracks in the track builder.
//
// A track is a closed loop of grid squares (the same format for the built-in tracks and the
// ones made in the builder); a smooth curve through the squares becomes the road.
(() => {
  const view = document.getElementById('view');
  const hud = document.getElementById('hud');
  const stage = document.getElementById('stage');

  const W = 480, H = 270;

  const PI = Math.PI, TAU = PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const mod = (a, n) => ((a % n) + n) % n;
  const rand = (a, b) => a + Math.random() * (b - a);
  const wrapAngle = (a) => { while (a > PI) a -= TAU; while (a < -PI) a += TAU; return a; };
  const smooth = (f) => { f = clamp(f, 0, 1); return f * f * (3 - 2 * f); };
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }

  // ---------- Save ----------
  const SAVE_KEY = 'freddyBearKart3d.save';
  function blankTrack() { return { name: '', theme: 'meadow', hills: 1, cells: [[2, 6]], extras: {}, props: {}, closed: false }; }
  function loadSave() {
    const s = {
      look: [{ racer: 0, hat: 'none', paint: 'own', stick: 1, assist: 0 }, { racer: 2, hat: 'none', paint: 'own', stick: 1, assist: 0 }],
      speed: 0, players: 1, music: true, coins: 0, gold: false, gfx: 'auto',
      my: [blankTrack(), blankTrack(), blankTrack()], best: {}, cups: {}, gp: {},
    };
    try {
      const v = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (v && typeof v === 'object') {
        if (typeof v.racer === 'number') s.look[0].racer = v.racer;          // the first version's save
        if (Array.isArray(v.look)) v.look.forEach((l, i) => { if (i < 2 && l && typeof l === 'object') Object.assign(s.look[i], l); });
        ['speed', 'players', 'coins'].forEach((k) => { if (typeof v[k] === 'number') s[k] = v[k]; });
        ['music', 'gold'].forEach((k) => { if (typeof v[k] === 'boolean') s[k] = v[k]; });
        if (Array.isArray(v.my)) v.my.forEach((t, i) => {
          if (i < 3 && t && Array.isArray(t.cells) && t.cells.length) s.my[i] = Object.assign(blankTrack(), t);
        });
        ['best', 'cups', 'gp'].forEach((k) => { if (v[k] && typeof v[k] === 'object') s[k] = v[k]; });
        if (v.gfx === 'fast' || v.gfx === 'nice') s.gfx = v.gfx;
      }
    } catch (e) {}
    return s;
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  const save = loadSave();

  // FAST graphics for tablets and phones (Fire tablets especially): no smoothing of edges, fewer
  // pixels, a softer HUD, fewer trees and particles. Picked by itself unless the menu button says.
  const looksLikeTablet = /Android|Silk|KF[A-Z]{2,}|iPad|iPhone|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && !(window.matchMedia && matchMedia('(pointer: fine)').matches));
  const FAST = save.gfx === 'fast' || (save.gfx === 'auto' && looksLikeTablet);
  // the HUD canvas: on FAST it stays at 2x the 480x270 picture instead of up to 4x
  const hctx = HiRes.setup(hud, W, H, null, { maxScale: FAST ? 2 : 4 });

  // ---------- Sound ----------
  let audioCtx = null, engine = null, sfxBus = null, musicBus = null, noiseBuf = null;
  function unlockAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      sfxBus = audioCtx.createGain(); sfxBus.gain.value = 1; sfxBus.connect(audioCtx.destination);
      musicBus = audioCtx.createGain(); musicBus.gain.value = save.music ? 0.09 : 0; musicBus.connect(audioCtx.destination);
      noiseBuf = audioCtx.createBuffer(1, Math.round(audioCtx.sampleRate * 0.06), audioCtx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      // one quiet engine hum, pitched by speed while racing
      const osc = audioCtx.createOscillator(), lp = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
      osc.type = 'sawtooth'; osc.frequency.value = 60;
      lp.type = 'lowpass'; lp.frequency.value = 500;
      gain.gain.value = 0;
      osc.connect(lp); lp.connect(gain); gain.connect(sfxBus);
      osc.start();
      engine = { osc, gain };
    } catch (e) {}
  }
  function beep(freq, duration, type = 'square', vol = 0.1, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain); gain.connect(sfxBus);
    const t0 = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration);
  }
  function sweep(f1, f2, duration, type = 'square', vol = 0.1, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type;
    osc.connect(gain); gain.connect(sfxBus);
    const t0 = audioCtx.currentTime + delay;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration);
  }
  const sfxSelect = () => beep(660, 0.04, 'square', 0.05);
  const sfxOk     = () => { beep(520, 0.07, 'square', 0.08); beep(780, 0.09, 'square', 0.07, 0.06); };
  const sfxNope   = () => beep(160, 0.15, 'triangle', 0.12);
  const sfxUndo   = () => sweep(500, 220, 0.14, 'triangle', 0.12);
  const sfxBoost  = () => sweep(220, 1200, 0.35, 'sawtooth', 0.06);
  const sfxHop    = () => sweep(380, 620, 0.09, 'triangle', 0.08);
  const sfxMini   = (big) => sweep(big ? 500 : 400, big ? 1400 : 1000, 0.25, 'square', 0.06);
  const sfxItem   = () => [784, 988, 1175].forEach((f, i) => beep(f, 0.07, 'square', 0.07, i * 0.05));
  const sfxCoin   = () => { beep(1319, 0.05, 'square', 0.05); beep(1760, 0.09, 'square', 0.05, 0.05); };
  const sfxThrow  = () => sweep(900, 300, 0.2, 'triangle', 0.1);
  const sfxSplat  = () => sweep(260, 70, 0.3, 'sawtooth', 0.09);
  const sfxShield = () => sweep(300, 900, 0.3, 'sine', 0.12);
  const sfxPop    = () => sweep(900, 200, 0.18, 'triangle', 0.12);
  const sfxShrink = () => sweep(1200, 150, 0.6, 'square', 0.06);
  const sfxSpin   = () => { sweep(600, 200, 0.4, 'triangle', 0.1); sweep(650, 240, 0.4, 'triangle', 0.06, 0.08); };
  const sfxCount  = (go) => beep(go ? 880 : 440, go ? 0.4 : 0.15, 'square', 0.1);
  const sfxRocket = () => { sweep(300, 1600, 0.5, 'sawtooth', 0.07); beep(1047, 0.2, 'square', 0.06, 0.1); };
  const sfxLap    = () => { beep(784, 0.1, 'square', 0.08); beep(1047, 0.16, 'square', 0.08, 0.1); };
  const sfxFinish = () => [523, 659, 784, 1047, 1319].forEach((f, i) => beep(f, 0.18, 'square', 0.09, i * 0.11));
  const sfxUnlock = () => [659, 784, 988, 1319, 1568].forEach((f, i) => beep(f, 0.14, 'triangle', 0.1, i * 0.09));

  // ---------- Music: a little tune made up for each land, played by oscillators ----------
  const SONGS = {
    meadow: { bpm: 126, root: 60, chords: [0, 5, 7, 5], scale: [0, 2, 4, 7, 9], wave: 'square', seed: 11 },
    snow:   { bpm: 104, root: 65, chords: [0, 9, 5, 7], scale: [0, 2, 4, 7, 9], wave: 'triangle', seed: 23 },
    beach:  { bpm: 116, root: 62, chords: [0, 5, 0, 7], scale: [0, 2, 4, 7, 9], wave: 'square', seed: 37 },
    night:  { bpm: 132, root: 57, chords: [0, 8, 3, 10], scale: [0, 3, 5, 7, 10], wave: 'square', seed: 51 },
    space:  { bpm: 120, root: 64, chords: [0, 7, 9, 5], scale: [0, 2, 4, 7, 9, 11], wave: 'triangle', seed: 77 },
  };
  let song = null, songKey = '', nextNote = 0, step = 0, musicTempo = 1;
  function setSong(key) {
    if (key === songKey) return;
    songKey = key;
    const def = SONGS[key] || SONGS.meadow, r = rng(def.seed * 7919);
    const mel = [];
    for (let i = 0; i < 32; i++) {
      const on = r() < (i % 4 === 0 ? 0.9 : i % 2 ? 0.22 : 0.55);
      mel.push(on ? def.scale[Math.floor(r() * def.scale.length)] + (r() < 0.3 ? 12 : 0) : null);
    }
    // the second half repeats the first with a new ending, so it sounds like a tune
    for (let i = 32; i < 64; i++) mel.push(i < 56 ? mel[i - 32] : (i % 2 ? null : def.scale[Math.floor(r() * def.scale.length)]));
    song = Object.assign({ mel }, def);
    step = 0;
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);
  function note(freq, t, dur, type, vol) {
    const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq;
    osc.connect(gain); gain.connect(musicBus);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  function hat(t, vol) {
    const src = audioCtx.createBufferSource(), hp = audioCtx.createBiquadFilter(), gain = audioCtx.createGain();
    src.buffer = noiseBuf; hp.type = 'highpass'; hp.frequency.value = 6000;
    gain.gain.setValueAtTime(vol, t); gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    src.connect(hp); hp.connect(gain); gain.connect(musicBus);
    src.start(t);
  }
  function tickMusic() {
    if (!audioCtx || !save.music || !song || audioCtx.state !== 'running') return;
    const s16 = 60 / song.bpm / 4 / musicTempo;
    if (nextNote < audioCtx.currentTime) nextNote = audioCtx.currentTime + 0.05;
    while (nextNote < audioCtx.currentTime + 0.25) {
      const bar = Math.floor(step / 16) % 4, b = step % 16, root = song.root + song.chords[bar];
      if (b % 4 === 0) note(midi(root - 24), nextNote, s16 * 3, 'triangle', 0.9);
      if (b % 4 === 2) note(midi(root - 12), nextNote, s16 * 1.5, 'triangle', 0.5);
      const m = song.mel[step % 64];
      if (m != null) note(midi(song.root + m), nextNote, s16 * 1.8, song.wave, 0.32);
      if (b % 2 === 0) hat(nextNote, b % 4 === 0 ? 0.25 : 0.12);
      nextNote += s16;
      step++;
    }
  }
  function setMusic(on) {
    save.music = on;
    writeSave();
    if (musicBus) musicBus.gain.value = on ? 0.09 : 0;
    musicBtn.textContent = 'MUSIC: ' + (on ? 'ON' : 'OFF');
  }
  const musicBtn = document.createElement('button');
  musicBtn.type = 'button';
  musicBtn.className = 'mt-toggle';
  musicBtn.textContent = 'MUSIC: ' + (save.music ? 'ON' : 'OFF');
  musicBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  musicBtn.addEventListener('click', (e) => { e.stopPropagation(); unlockAudio(); setMusic(!save.music); musicBtn.blur(); });
  document.getElementById('topbar').appendChild(musicBtn);
  // edge smoothing can only be picked when the page starts, so changing this reloads the game
  const gfxBtn = document.createElement('button');
  gfxBtn.type = 'button';
  gfxBtn.className = 'mt-toggle';
  gfxBtn.textContent = 'GRAPHICS: ' + (FAST ? 'FAST' : 'NICE');
  gfxBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  gfxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    save.gfx = FAST ? 'nice' : 'fast';
    writeSave();
    location.reload();
  });
  document.getElementById('topbar').appendChild(gfxBtn);
  // SHOW SPEED: a small readout (frames a second, where the time goes) for finding out why
  // a tablet is slow. Not remembered -- it is off again next time.
  let showSpeed = false, gpuName = '';
  const speedBtn = document.createElement('button');
  speedBtn.type = 'button';
  speedBtn.className = 'mt-toggle';
  speedBtn.textContent = 'SHOW SPEED: OFF';
  speedBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
  speedBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showSpeed = !showSpeed;
    speedBtn.textContent = 'SHOW SPEED: ' + (showSpeed ? 'ON' : 'OFF');
    speedBtn.blur();
  });
  document.getElementById('topbar').appendChild(speedBtn);
  // Steering help for little drivers, set for each player: STICK makes the stick / keys / screen
  // gentler (or quicker), AUTO-STEER quietly steers along the road and back onto it.
  const STICK_NAMES = ['GENTLE', 'NORMAL', 'QUICK'], ASSIST_NAMES = ['OFF', 'A LITTLE', 'LOTS'];
  [0, 1].forEach((pi) => {
    const L = save.look[pi];
    if (!(L.stick >= 0 && L.stick < 3)) L.stick = 1;
    if (!(L.assist >= 0 && L.assist < 3)) L.assist = 0;
    [['stick', 'STICK', STICK_NAMES], ['assist', 'AUTO-STEER', ASSIST_NAMES]].forEach(([key, label, names]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mt-toggle';
      const show = () => { b.textContent = 'P' + (pi + 1) + ' ' + label + ': ' + names[L[key]]; };
      show();
      b.addEventListener('pointerdown', (e) => e.stopPropagation());
      b.addEventListener('click', (e) => { e.stopPropagation(); L[key] = (L[key] + 1) % 3; writeSave(); show(); b.blur(); });
      document.getElementById('topbar').appendChild(b);
    });
  });

  // ---------- three.js setup ----------
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: !FAST, powerPreference: 'high-performance' });
  const BASE_RATIO = FAST ? Math.min(window.devicePixelRatio || 1, 1) : Math.min(window.devicePixelRatio || 1, 1.5);
  const FAST_WIDTH = 640;
  // The 3D picture's size = BASE_RATIO (on FAST: capped so it is ~640 pixels wide, which the
  // page then stretches) x `dyn`, which steps down while frames are slow.
  let dyn = 1, viewW = 0, viewH = 0;
  if (FAST) stage.style.cssText += 'border-radius:0;box-shadow:none;';   // nothing for the tablet to clip or glow

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd8ff);
  scene.fog = new THREE.Fog(0x8fd8ff, 220, 820);

  const camera = new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 1800);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6a8a4a, 1.9);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.9);
  sun.position.set(60, 120, 40);
  scene.add(sun);

  // ---------- Generated textures (no image files) ----------
  function canvasTex(w, h, draw, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    t.anisotropy = 4;
    return t;
  }
  function speckle(g, w, h, n, a, b) {
    for (let i = 0; i < n; i++) {
      g.fillStyle = Math.random() < 0.5 ? a : b;
      g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
  }
  const roadTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#565c68'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 500, 'rgba(255,255,255,0.05)', 'rgba(0,0,0,0.08)');
    g.fillStyle = '#ffffff'; g.fillRect(4, 0, 5, h); g.fillRect(w - 9, 0, 5, h);
    g.fillStyle = '#ffe14f'; g.fillRect(w / 2 - 3, 0, 6, h / 2);
  }, true);
  const curbTex = canvasTex(8, 32, (g, w, h) => {
    g.fillStyle = '#ff4a4a'; g.fillRect(0, 0, w, h / 2);
    g.fillStyle = '#ffffff'; g.fillRect(0, h / 2, w, h / 2);
  }, true);
  const checkTex = canvasTex(128, 32, (g) => {
    for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) {
      g.fillStyle = (x + y) % 2 ? '#111111' : '#ffffff';
      g.fillRect(x * 8, y * 8, 8, 8);
    }
  }, true);
  const boostTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ff7a1e'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#fff36b'; g.lineWidth = 7; g.lineJoin = 'miter';
    for (let y = 0; y < 3; y++) {
      g.beginPath();
      g.moveTo(8, 24 + y * 22); g.lineTo(32, 4 + y * 22); g.lineTo(56, 24 + y * 22);
      g.stroke();
    }
  }, true);
  const rampTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#4fd0ff'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#ffffff';
    for (let i = -1; i < 5; i++) {
      g.beginPath();
      g.moveTo(i * 16, h); g.lineTo(i * 16 + 8, h); g.lineTo(i * 16 + 24, 0); g.lineTo(i * 16 + 16, 0);
      g.fill();
    }
  });
  const boxTex = canvasTex(64, 64, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, h);
    grad.addColorStop(0, '#ff5c8f'); grad.addColorStop(0.35, '#ffd83d');
    grad.addColorStop(0.7, '#4ff0ff'); grad.addColorStop(1, '#b48cff');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffffff'; g.lineWidth = 5; g.strokeRect(3, 3, w - 6, h - 6);
    g.fillStyle = '#ffffff'; g.font = 'bold 46px Courier New, monospace';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', w / 2, h / 2 + 3);
  });
  const mudTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#6b4626'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      g.fillStyle = i % 2 ? '#835a33' : '#55361c';
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 2 + Math.random() * 5, 0, TAU); g.fill();
    }
  }, true);
  const iceTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#bfeaff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) {
      g.beginPath(); g.moveTo(Math.random() * w, Math.random() * h); g.lineTo(Math.random() * w, Math.random() * h); g.stroke();
    }
  }, true);
  const brickTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#8a5a3a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#a8704a';
    for (let y = 0; y < 8; y++) for (let x = -1; x < 4; x++) g.fillRect(x * 16 + (y % 2) * 8 + 1, y * 8 + 1, 14, 6);
  }, true);
  // the space road: stripes of rainbow running along it, with a few sparkles
  const rainbowTex = canvasTex(128, 64, (g, w, h) => {
    const cols = ['#ff4f6a', '#ff9a2e', '#ffe14f', '#5fe36b', '#4fc8ff', '#6a6cff', '#c86bff'];
    cols.forEach((c, i) => { g.fillStyle = c; g.fillRect(Math.floor(i * w / 7), 0, Math.ceil(w / 7), h); });
    g.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 26; i++) g.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, 0, w, 3);
  }, true);
  const lollyTex = canvasTex(64, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ff5c8f'; g.lineWidth = 6;
    g.beginPath();
    for (let a = 0; a < 18; a += 0.1) { const r = a * 1.7; g.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); }
    g.stroke();
  });
  // the ground and the fence are repainted for each land
  const groundCanvas = document.createElement('canvas');
  groundCanvas.width = groundCanvas.height = 128;
  const groundTex = new THREE.CanvasTexture(groundCanvas);
  groundTex.colorSpace = THREE.SRGBColorSpace;
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  const fenceCanvas = document.createElement('canvas');
  fenceCanvas.width = 32; fenceCanvas.height = 16;
  const fenceTex = new THREE.CanvasTexture(fenceCanvas);
  fenceTex.colorSpace = THREE.SRGBColorSpace;
  fenceTex.wrapS = fenceTex.wrapT = THREE.RepeatWrapping;
  function paintLand(th) {
    const g = groundCanvas.getContext('2d');
    g.fillStyle = th.ground; g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 240; i++) {
      g.fillStyle = i % 2 ? th.groundA : th.groundB;
      const x = Math.random() * 128, y = Math.random() * 128, r = 2 + Math.random() * 6;
      // drawn wrapped so the tile repeats without seams
      for (let ox = -128; ox <= 128; ox += 128) for (let oy = -128; oy <= 128; oy += 128) {
        g.beginPath(); g.arc(x + ox, y + oy, r, 0, TAU); g.fill();
      }
    }
    groundTex.needsUpdate = true;
    const f = fenceCanvas.getContext('2d');
    f.fillStyle = th.fence[0]; f.fillRect(0, 0, 32, 16);
    f.fillStyle = th.fence[1]; f.fillRect(0, 0, 16, 16);
    f.fillStyle = 'rgba(0,0,0,0.15)'; f.fillRect(0, 13, 32, 3);
    fenceTex.needsUpdate = true;
  }

  // the far, flat ground; near the track a rolling terrain mesh sits on top of it
  const GROUND_TILE = 26;
  const groundMat = new THREE.MeshLambertMaterial({ map: groundTex });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(5000, 5000).rotateX(-PI / 2), groundMat);
  { const uv = ground.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 5000 / GROUND_TILE, uv.getY(i) * 5000 / GROUND_TILE); }
  scene.add(ground);

  // ---------- Lands ----------
  const THEMES = {
    meadow: { name: 'MEADOW', sky: 0x8fd8ff, ground: '#6cbf4b', groundA: '#5fb040', groundB: '#7fcc5c', fence: ['#2f8f45', '#3fa652'],
              dust: [0x8fcf5a, 0x9a7a4a], tree: 'round', crown: [0x2f8f45, 0x3fa652, 0x57b860], trunk: 0x7a5230, hill: 0x4f9e58, light: 1 },
    snow:   { name: 'SNOW', sky: 0xbfe0ff, ground: '#cfe0ee', groundA: '#bcd2e4', groundB: '#e6f0f8', fence: ['#3a7fd0', '#ffffff'],
              dust: [0xffffff, 0xdcefff], tree: 'pine', crown: [0x2f6f5a, 0x3a8068, 0x245a48], trunk: 0x6a4a30, hill: 0xeaf2fa, light: 1 },
    beach:  { name: 'BEACH', sky: 0xffc48a, ground: '#f0d58a', groundA: '#e6c574', groundB: '#f8e2a4', fence: ['#ff7a4a', '#ffffff'],
              dust: [0xf2d98f, 0xe0c070], tree: 'palm', crown: [0x3fae5a, 0x2f9a4c, 0x5cc46e], trunk: 0x9a7040, hill: 0x3fa8c8, light: 1 },
    night:  { name: 'CANDY NIGHT', sky: 0x1b1440, ground: '#5b3d8a', groundA: '#50357c', groundB: '#6a4a9c', fence: ['#ff7ac0', '#ffffff'],
              dust: [0xff9ad6, 0xb48cff], tree: 'lolly', crown: [0xff7ac0, 0x4ff0ff, 0xffe14f], trunk: 0xffffff, hill: 0x3a2a6a, light: 0.8 },
    // out in space: a rainbow road with nothing under it, rails only round the banked bends
    space:  { name: 'SPACE', sky: 0x070418, ground: '#120b2e', groundA: '#1b1244', groundB: '#0c0822', fence: ['#4ff0ff', '#ffffff'],
              dust: [0xffffff, 0x9fd8ff], tree: 'none', crown: [0xffffff], trunk: 0xffffff, hill: 0x3a2a6a, light: 1, space: true },
  };
  const THEME_KEYS = Object.keys(THEMES);
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // ---------- Racers, hats and paint ----------
  // top = top speed, acc = how fast they get going, turn = how sharply they steer
  const RACERS = [
    { name: 'FREDDY',       kind: 'koala', fur: 0x9b9ba3, belly: 0xc9c9d1, earIn: 0xf2f2f6, muzzle: 0xc9c9d1, nose: 0x1c1c1c, kart: 0x2f8fe0, top: 1.04, acc: 0.88, turn: 0.95 },
    { name: 'SNOWBELL',     kind: 'bunny', fur: 0xffffff, belly: 0xeef2fa, earIn: 0xffb3c8, muzzle: 0xffffff, nose: 0xff8fb0, kart: 0xff7ab8, top: 0.98, acc: 1.14, turn: 1.0 },
    { name: 'BOWIE',        kind: 'bunny', fur: 0xff8a1e, belly: 0xffd23f, earIn: 0xe8452c, muzzle: 0xffd84a, nose: 0xff7aa8, feet: 0x8a2a3a, kart: 0x35c46a, top: 1.0, acc: 1.0, turn: 1.1 },
    { name: 'FUZZYBALL',    kind: 'bunny', fur: 0xffd9a0, belly: 0xfff0d0, earIn: 0xff9db5, muzzle: 0xfff0d0, nose: 0xff8fb0, kart: 0xffc233, top: 1.0, acc: 1.04, turn: 1.02 },
    { name: 'BUZZYBALL',    kind: 'bunny', fur: 0x8ff2d8, belly: 0xd8fff4, earIn: 0xffe14f, muzzle: 0xd8fff4, nose: 0xff8fb0, kart: 0x8f5cff, top: 0.99, acc: 1.1, turn: 1.04 },
    { name: 'BLACKIEBLACK', kind: 'bunny', fur: 0x4a4453, belly: 0x6a6375, earIn: 0xb57a9a, muzzle: 0x6a6375, nose: 0xff8fb0, kart: 0xe0453a, top: 1.05, acc: 0.94, turn: 0.9 },
    { name: 'FUNNYBUNNY',   kind: 'bunny', fur: 0xffa85c, belly: 0xffd0a0, earIn: 0xffd0a0, muzzle: 0xffe4c4, nose: 0xff8fb0, kart: 0x3fd0e0, top: 0.97, acc: 1.06, turn: 1.14 },
  ];
  const HATS = [
    { id: 'none', name: 'NO HAT', coins: 0 },
    { id: 'cap', name: 'BALL CAP', coins: 0 },
    { id: 'beanie', name: 'BOBBLE HAT', coins: 25 },
    { id: 'party', name: 'PARTY HAT', coins: 60 },
    { id: 'flower', name: 'FLOWER', coins: 100 },
    { id: 'top', name: 'TOP HAT', coins: 160 },
    { id: 'crown', name: 'CROWN', coins: 250 },
  ];
  const PAINTS = [
    { id: 'own', name: 'OWN COLOUR', coins: 0 },
    { id: 'cherry', name: 'CHERRY', coins: 15, color: 0xff3b4f },
    { id: 'mint', name: 'MINT', coins: 40, color: 0x6dffc0 },
    { id: 'sky', name: 'SKY', coins: 80, color: 0x4fb8ff },
    { id: 'grape', name: 'GRAPE', coins: 120, color: 0x9a5cff },
    { id: 'rainbow', name: 'RAINBOW', coins: 200 },
    { id: 'gold', name: 'GOLDEN', gold: true, color: 0xffcc22 },
  ];
  const isUnlocked = (it) => (it.gold ? save.gold : save.coins >= (it.coins || 0));
  const unlockedSet = () => HATS.concat(PAINTS).filter(isUnlocked).map((it) => it.name);
  save.look.forEach((l, i) => {
    if (!(l.racer >= 0 && l.racer < RACERS.length)) l.racer = i ? 2 : 0;
    if (!HATS.some((h) => h.id === l.hat && isUnlocked(h))) l.hat = 'none';
    if (!PAINTS.some((p) => p.id === l.paint && isUnlocked(p))) l.paint = 'own';
  });
  if (save.look[1].racer === save.look[0].racer) save.look[1].racer = (save.look[0].racer + 2) % RACERS.length;
  if (!(save.speed >= 0 && save.speed < 3)) save.speed = 0;
  if (save.players !== 2) save.players = 1;

  const GEO = {
    sphere: FAST ? new THREE.SphereGeometry(1, 8, 6) : new THREE.SphereGeometry(1, 14, 10),
    dome: new THREE.SphereGeometry(1, FAST ? 8 : 14, FAST ? 4 : 7, 0, TAU, 0, PI / 2),
    box: new THREE.BoxGeometry(1, 1, 1),
    wheel: new THREE.CylinderGeometry(0.42, 0.42, 0.36, 12).rotateZ(PI / 2),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 14),
    cone: new THREE.ConeGeometry(1, 1, 10),
    shadow: new THREE.CircleGeometry(1.6, 16).rotateX(-PI / 2),
  };
  const lam = (c) => new THREE.MeshLambertMaterial({ color: c });
  const MAT = {
    dark: lam(0x2a2a33), tyre: lam(0x1c1c22), hub: lam(0xd8d8e0), eye: lam(0x15151a), white: lam(0xffffff),
    red: lam(0xe0453a), blue: lam(0x3a7fd0), pink: lam(0xff7ac0), yellow: lam(0xffe14f), black: lam(0x1c1c22),
    gold: new THREE.MeshLambertMaterial({ color: 0xffcc22, emissive: 0x4a3000 }),
    flame: new THREE.MeshBasicMaterial({ color: 0xffb02e }),
    shadow: new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    bubble: new THREE.MeshLambertMaterial({ color: 0x7fe8ff, emissive: 0x1a5a6a, transparent: true, opacity: 0.35, depthWrite: false }),
  };
  function part(parent, geo, material, x, y, z, sx = 1, sy = sx, sz = sx) {
    const o = new THREE.Mesh(geo, material);
    o.position.set(x, y, z);
    o.scale.set(sx, sy, sz);
    parent.add(o);
    return o;
  }

  // Glue a group's still parts into a few meshes so a racer costs ~10 draws instead of ~40 --
  // the big win on tablets. Plain colours go into one mesh coloured per corner; parts whose
  // material changes or glows (the kart paint, gold) get one mesh per material. Anything in
  // `keep` (moving parts like wheels, arms, ears, the boost flame) is left alone.
  const vcMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  function bake(group, keep = [], own = []) {
    const buckets = new Map();
    const rel = new THREE.Matrix4();
    const walk = (obj, parentM) => {
      for (const c of obj.children.slice()) {
        if (keep.includes(c)) continue;
        c.updateMatrix();
        const m = new THREE.Matrix4().multiplyMatrices(parentM, c.matrix);
        if (c.isMesh) {
          const mat = c.material;
          const plain = mat.isMeshLambertMaterial && !mat.transparent && !own.includes(mat) && mat.emissive.getHex() === 0;
          const key = plain ? vcMat : mat;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push({ geo: c.geometry, m, color: plain ? mat.color : null });
          obj.remove(c);
        } else {
          let holdsKept = false;
          c.traverse((x) => { if (keep.includes(x)) holdsKept = true; });
          if (holdsKept) continue;
          walk(c, m);
          if (!c.children.length) obj.remove(c);
        }
      }
    };
    walk(group, rel.identity());
    const v = new THREE.Vector3(), nm = new THREE.Matrix3();
    buckets.forEach((list, mat) => {
      const pos = [], nor = [], col = [], idx = [];
      let base = 0;
      for (const it of list) {
        const p = it.geo.attributes.position, n = it.geo.attributes.normal, ix = it.geo.index;
        nm.getNormalMatrix(it.m);
        for (let i = 0; i < p.count; i++) {
          v.fromBufferAttribute(p, i).applyMatrix4(it.m); pos.push(v.x, v.y, v.z);
          v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize(); nor.push(v.x, v.y, v.z);
          if (it.color) col.push(it.color.r, it.color.g, it.color.b);
        }
        if (ix) for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + base);
        else for (let i = 0; i < p.count; i++) idx.push(i + base);
        base += p.count;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
      if (col.length) g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setIndex(idx);
      group.add(new THREE.Mesh(g, mat));
    });
  }

  function makeHat(id) {
    const g = new THREE.Group();
    if (id === 'cap') {
      part(g, GEO.dome, MAT.red, 0, 0.4, 0, 0.5, 0.36, 0.5);
      part(g, GEO.box, MAT.red, 0, 0.42, 0.42, 0.5, 0.05, 0.36);
    } else if (id === 'beanie') {
      part(g, GEO.dome, MAT.blue, 0, 0.36, 0, 0.56, 0.5, 0.56);
      part(g, GEO.cyl, MAT.white, 0, 0.38, 0, 0.58, 0.1, 0.58);
      part(g, GEO.sphere, MAT.white, 0, 0.92, 0, 0.16);
    } else if (id === 'party') {
      part(g, GEO.cone, MAT.pink, 0, 0.82, 0, 0.3, 0.8, 0.3);
      part(g, GEO.sphere, MAT.yellow, 0, 1.24, 0, 0.11);
    } else if (id === 'flower') {
      const f = new THREE.Group();
      f.position.set(-0.36, 0.42, 0.18);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        part(f, GEO.sphere, MAT.pink, Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0, 0.11, 0.11, 0.06);
      }
      part(f, GEO.sphere, MAT.yellow, 0, 0, 0.03, 0.09);
      g.add(f);
    } else if (id === 'top') {
      part(g, GEO.cyl, MAT.black, 0, 0.75, 0, 0.32, 0.6, 0.32);
      part(g, GEO.cyl, MAT.red, 0, 0.53, 0, 0.33, 0.12, 0.33);
      part(g, GEO.cyl, MAT.black, 0, 0.46, 0, 0.52, 0.05, 0.52);
    } else if (id === 'crown') {
      part(g, GEO.cyl, MAT.gold, 0, 0.56, 0, 0.36, 0.22, 0.36);
      for (let i = 0; i < 5; i++) {
        const a = i / 5 * TAU;
        part(g, GEO.cone, MAT.gold, Math.sin(a) * 0.3, 0.76, Math.cos(a) * 0.3, 0.08, 0.2, 0.08);
      }
      part(g, GEO.sphere, MAT.red, 0, 0.56, 0.36, 0.06);
    }
    bake(g);
    return g;
  }

  // A kart with its driver. The model faces +Z; rotation.y is the heading.
  function makeRacer(def) {
    const g = new THREE.Group();
    const tilt = new THREE.Group();
    g.add(tilt);
    const paint = lam(def.kart), fur = lam(def.fur), belly = lam(def.belly), earIn = lam(def.earIn);

    // kart
    part(tilt, GEO.box, paint, 0, 0.5, 0, 1.7, 0.42, 2.7);
    part(tilt, GEO.box, paint, 0, 0.66, 1.2, 1.1, 0.36, 0.8);
    part(tilt, GEO.box, MAT.white, 0, 0.86, 1.2, 0.5, 0.06, 0.82);
    part(tilt, GEO.box, MAT.dark, 0, 0.5, -1.4, 1.5, 0.3, 0.2);
    part(tilt, GEO.box, MAT.dark, -0.6, 0.9, -1.25, 0.14, 0.5, 0.14);
    part(tilt, GEO.box, MAT.dark, 0.6, 0.9, -1.25, 0.14, 0.5, 0.14);
    part(tilt, GEO.box, paint, 0, 1.18, -1.3, 1.8, 0.1, 0.5);
    const col = part(tilt, GEO.box, MAT.dark, 0, 0.98, 0.52, 0.1, 0.1, 0.5);
    col.rotation.x = -0.7;
    const wheelRim = part(tilt, GEO.wheel, MAT.dark, 0, 1.14, 0.36, 0.55, 0.6, 0.6);
    wheelRim.rotation.y = PI / 2;
    const wheels = [];
    [[-0.98, 0.9, 1], [0.98, 0.9, 1], [-1.02, -0.9, 1.18], [1.02, -0.9, 1.18]].forEach(([x, z, s], i) => {
      const w = new THREE.Group();
      w.position.set(x, 0.42 * s, z);
      part(w, GEO.wheel, MAT.tyre, 0, 0, 0, s);
      part(w, GEO.wheel, MAT.hub, 0, 0, 0, 1.06 * s, 0.5 * s, 0.5 * s);
      tilt.add(w);
      if (i < 2) wheels.push(w);
    });
    const flame = part(tilt, GEO.cone, MAT.flame, 0, 0.55, -2.1, 0.4, 1.4, 0.4);
    flame.rotation.x = -PI / 2;
    flame.visible = false;

    // driver
    const rider = new THREE.Group();
    rider.position.set(0, 0.62, -0.25);
    tilt.add(rider);
    part(rider, GEO.sphere, fur, 0, 0.55, 0, 0.56, 0.6, 0.5);
    part(rider, GEO.sphere, belly, 0, 0.5, 0.3, 0.38, 0.42, 0.26);
    const arms = [part(rider, GEO.sphere, fur, -0.42, 0.72, 0.42, 0.15), part(rider, GEO.sphere, fur, 0.42, 0.72, 0.42, 0.15)];
    const feet = lam(def.feet != null ? def.feet : def.fur);
    part(rider, GEO.sphere, feet, -0.3, 0.12, 0.5, 0.17, 0.14, 0.24);
    part(rider, GEO.sphere, feet, 0.3, 0.12, 0.5, 0.17, 0.14, 0.24);

    const head = new THREE.Group();
    head.position.set(0, 1.5, 0.02);
    rider.add(head);
    part(head, GEO.sphere, fur, 0, 0, 0, 0.6, 0.56, 0.56);
    part(head, GEO.sphere, lam(def.muzzle), 0, -0.14, 0.42, 0.3, 0.22, 0.22);
    part(head, GEO.sphere, MAT.eye, -0.23, 0.08, 0.5, 0.08);
    part(head, GEO.sphere, MAT.eye, 0.23, 0.08, 0.5, 0.08);
    part(head, GEO.sphere, MAT.white, -0.21, 0.11, 0.57, 0.03);
    part(head, GEO.sphere, MAT.white, 0.25, 0.11, 0.57, 0.03);
    const ears = [];
    if (def.kind === 'koala') {
      part(head, GEO.sphere, lam(def.nose), 0, -0.06, 0.6, 0.13, 0.19, 0.1);
      [-1, 1].forEach((s) => {
        part(head, GEO.sphere, fur, s * 0.6, 0.36, -0.02, 0.32, 0.32, 0.2);
        part(head, GEO.sphere, earIn, s * 0.6, 0.36, 0.1, 0.2, 0.2, 0.1);
      });
    } else {
      part(head, GEO.sphere, lam(def.nose), 0, -0.07, 0.63, 0.08, 0.06, 0.06);
      [-1, 1].forEach((s) => {
        const ear = new THREE.Group();
        ear.position.set(s * 0.24, 0.42, -0.04);
        ear.rotation.z = -s * 0.14;
        part(ear, GEO.sphere, fur, 0, 0.5, 0, 0.15, 0.56, 0.1);
        part(ear, GEO.sphere, earIn, 0, 0.5, 0.06, 0.08, 0.42, 0.06);
        head.add(ear);
        ears.push(ear);
      });
      part(rider, GEO.sphere, MAT.white, 0, 0.42, -0.5, 0.2);
    }
    const bubble = part(g, GEO.sphere, MAT.bubble, 0, 1.3, 0, 2.6, 2.3, 2.9);
    bubble.visible = false;

    // glue the still parts together (the steering wheels, arms, ears and flame keep moving)
    bake(tilt, [flame, rider, ...wheels], [paint]);
    wheels.forEach((w) => bake(w));
    bake(rider, [head, ...arms]);
    bake(head, ears);
    ears.forEach((e) => bake(e));

    const shadow = new THREE.Mesh(GEO.shadow, MAT.shadow);
    shadow.rotation.order = 'YXZ';
    shadow.visible = false;
    scene.add(shadow);
    g.visible = false;
    scene.add(g);
    return { def, g, tilt, wheels, flame, ears, head, rider, arms, shadow, bubble, paint, hats: {}, hat: null, rainbow: false };
  }
  const models = RACERS.map(makeRacer);

  // put a player's hat and paint on a model (no look = the racer's own colours)
  function applyLook(m, look) {
    const hatId = look ? look.hat : 'none';
    if (m.hat) m.hat.visible = false;
    m.hat = null;
    if (hatId !== 'none') {
      if (!m.hats[hatId]) { m.hats[hatId] = makeHat(hatId); m.head.add(m.hats[hatId]); }
      m.hat = m.hats[hatId];
      m.hat.visible = true;
    }
    const p = PAINTS.find((x) => x.id === (look ? look.paint : 'own')) || PAINTS[0];
    m.rainbow = p.id === 'rainbow';
    m.paint.color.setHex(p.color != null ? p.color : m.def.kart);
    m.paint.emissive.setHex(p.id === 'gold' ? 0x4a3000 : 0x000000);
  }
  function kartColor(m) { return m.rainbow ? 0xff5c8f : m.paint.color.getHex(); }

  // ---------- Particles: dust, sparks, flames, snow and sparkles ----------
  const PMAX = 500;
  const pMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff }), PMAX);
  pMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pMesh.frustumCulled = false;
  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const parts = [];
  dummy.scale.setScalar(0); dummy.updateMatrix();
  for (let i = 0; i < PMAX; i++) {
    parts.push({ life: 0, shown: false });
    pMesh.setMatrixAt(i, dummy.matrix);
    pMesh.setColorAt(i, tint.setHex(0xffffff));
  }
  scene.add(pMesh);
  let pNext = 0, pColorDirty = false;
  function emit(x, y, z, color, o = {}) {
    const i = pNext, p = parts[i];
    pNext = (pNext + 1) % PMAX;
    const s = o.spread == null ? 1.5 : o.spread;
    p.x = x; p.y = y; p.z = z;
    p.vx = rand(-s, s) + (o.vx || 0); p.vz = rand(-s, s) + (o.vz || 0); p.vy = rand(0.4, 1) * (o.up == null ? 3 : o.up);
    p.life = p.max = o.life || 0.5;
    p.size = o.size || 0.35;
    p.g = o.grav == null ? 9 : o.grav;
    pMesh.setColorAt(i, tint.setHex(color));
    pColorDirty = true;
  }
  function burst(x, y, z, colors, n, o = {}) {
    for (let i = 0; i < n; i++) emit(x, y, z, colors[i % colors.length], Object.assign({ spread: 7, up: 8, life: 0.7, size: 0.45 }, o));
  }
  function stepParticles(dt) {
    let any = false;
    for (let i = 0; i < PMAX; i++) {
      const p = parts[i];
      if (p.life <= 0) {
        if (p.shown) { dummy.scale.setScalar(0); dummy.updateMatrix(); pMesh.setMatrixAt(i, dummy.matrix); p.shown = false; any = true; }
        continue;
      }
      p.life -= dt;
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      dummy.position.set(p.x, p.y, p.z);
      dummy.rotation.set(p.life * 7, p.life * 5, 0);
      dummy.scale.setScalar(p.size * Math.sqrt(Math.max(0, p.life / p.max)));
      dummy.updateMatrix();
      pMesh.setMatrixAt(i, dummy.matrix);
      p.shown = true;
      any = true;
    }
    if (any) pMesh.instanceMatrix.needsUpdate = true;
    if (pColorDirty) { pMesh.instanceColor.needsUpdate = true; pColorDirty = false; }
  }
  function clearParticles() { parts.forEach((p) => { p.life = 0; }); }

  // the picker's little stage and the Grand Prix podium, far above the track
  const SHOW_Y = 900;
  const showroom = new THREE.Group();
  showroom.position.set(0, SHOW_Y, 0);
  part(showroom, new THREE.CylinderGeometry(3.4, 3.8, 0.5, 28), lam(0xffe14f), 0, -0.25, 0);
  part(showroom, new THREE.CylinderGeometry(3.9, 4.2, 0.3, 28), lam(0xff7a1e), 0, -0.55, 0);
  showroom.visible = false;
  scene.add(showroom);
  const PODIUM = [{ x: 0, h: 2.4, c: 0xffd23f }, { x: -4.6, h: 1.6, c: 0xd8dde6 }, { x: 4.6, h: 1.0, c: 0xe09050 }];
  const podium = new THREE.Group();
  podium.position.set(0, SHOW_Y, 0);
  PODIUM.forEach((p) => part(podium, GEO.box, lam(p.c), p.x, p.h / 2 - 0.6, 0, 4.4, p.h, 4));
  podium.visible = false;
  scene.add(podium);

  // ---------- Tracks ----------
  const GW = 12, GH = 8;      // builder grid, in squares
  const CELL = 36;            // one square, in world units
  const ROAD = 10;            // half the road's width
  const EDGE = ROAD + 1.1;    // out to the far side of the curbs
  const FENCE = ROAD + 9;     // the low fence / hedge each side
  const LAPS = 3;
  const RAMP_W = 8, RAMP_L = 3.2, RAMP_H = 1.4;
  const TUNNEL_LIM = EDGE - 0.6;   // how far from the middle a kart can get inside a tunnel

  // a start square and a string of moves (Right / Left / Up / Down) that comes back to it
  function loopFrom(x, y, moves) {
    const cells = [[x, y]];
    for (const m of moves.replace(/\s/g, '')) {
      if (m === 'R') x++; else if (m === 'L') x--; else if (m === 'U') y--; else y++;
      cells.push([x, y]);
    }
    cells.pop(); // the last move lands back on the start
    return cells;
  }
  const BUILTIN = [
    { name: 'KOALA CIRCUIT', theme: 'meadow', hills: 1, closed: true,
      cells: loopFrom(4, 6, 'RRRRR UUUU LLL D LL U LLL DDDD RRR'),
      extras: { 3: 'boost', 7: 'items', 8: 'tunnel', 11: 'items', 18: 'coins', 20: 'mud', 22: 'jump' },
      props: { '7,4': 'house', '3,4': 'carrot', '11,5': 'carrot', '5,0': 'house' } },
    { name: "BOWIE'S BEACH", theme: 'beach', hills: 1, closed: true,
      cells: loopFrom(3, 6, 'RRRRR UU RR UUU LLLL D LLL U LL DDDDD RR'),
      extras: { 2: 'coins', 4: 'boost', 10: 'tunnel', 12: 'items', 14: 'boost', 19: 'items', 26: 'jump' },
      props: { '5,4': 'umbrella', '3,4': 'umbrella', '11,6': 'house', '6,4': 'carrot' } },
    { name: 'SNOWBELL SLOPES', theme: 'snow', hills: 2, closed: true,
      cells: loopFrom(3, 7, 'RRRRRRR UUU LLL UU RRR UU LLLLLLLLL DDDDDDD RR'),
      extras: { 2: 'boost', 5: 'items', 9: 'coins', 12: 'items', 22: 'items', 25: 'ice', 28: 'tunnel', 31: 'boost', 33: 'jump' },
      props: { '4,4': 'snowman', '5,5': 'snowman', '8,6': 'house', '3,2': 'snowman' } },
    { name: 'CANDY CROSSING', theme: 'night', hills: 1, closed: true,
      cells: loopFrom(3, 4, 'RRRRRR UUU LLL DDDDD LLLL UU R'),
      extras: { 5: 'boost', 8: 'items', 11: 'coins', 19: 'ice', 20: 'items', 22: 'jump' },
      props: { '4,2': 'lolly', '8,6': 'lolly', '10,2': 'lolly', '4,5': 'house' } },
    { name: 'RAINBOW GALAXY', theme: 'space', hills: 1, closed: true,
      cells: loopFrom(1, 6, 'RRRRRRRRRR UUUUU LLL DD LLL UU LLLL DDDDD'),
      extras: { 3: 'coins', 5: 'jump', 8: 'items', 13: 'boost', 17: 'items', 22: 'coins', 27: 'boost', 31: 'items' },
      props: {} },
  ];

  const cellX = (c) => (c[0] - (GW - 1) / 2) * CELL;
  const cellZ = (c) => (c[1] - (GH - 1) / 2) * CELL;
  const sameCell = (a, b) => a[0] === b[0] && a[1] === b[1];
  // squares the road goes through twice (a bridge): [[first time, second time], ...]
  function crossings(def) {
    const seen = {}, out = [];
    def.cells.forEach((c, i) => { const k = c[0] + ',' + c[1]; if (k in seen) out.push([seen[k], i]); else seen[k] = i; });
    return out;
  }
  const isCross = (def, i) => def.cells.filter((d) => sameCell(d, def.cells[i])).length > 1;

  // The start line goes in the middle of the loop's longest straight run of squares, so the
  // karts line up on a straight bit of road wherever the drawing began (never on a bridge).
  function startCell(def) {
    const c = def.cells, n = c.length;
    if (!def.closed || n < 4) return 0;
    const straight = (i) => {
      const a = c[mod(i - 1, n)], b = c[(i + 1) % n];
      return a[0] === b[0] || a[1] === b[1];
    };
    let best = 0, bestLen = 0;
    for (let i = 0; i < n; i++) {
      if (!straight(i) || straight(mod(i - 1, n))) continue;   // only look from the start of a run
      let len = 1;
      while (len < n && straight((i + len) % n)) len++;
      let mid = (i + (len >> 1)) % n;
      if (isCross(def, mid)) mid = mod(mid - 1, n);
      if (isCross(def, mid) || !straight(mid)) mid = (mid + 2) % n;
      if (len > bestLen && straight(mid) && !isCross(def, mid)) { bestLen = len; best = mid; }
    }
    return best;
  }

  const trackGroup = new THREE.Group();
  scene.add(trackGroup);
  const roadMat = new THREE.MeshLambertMaterial({ map: roadTex, side: THREE.DoubleSide });
  const curbMat = new THREE.MeshLambertMaterial({ map: curbTex, side: THREE.DoubleSide });
  const checkMat = new THREE.MeshBasicMaterial({ map: checkTex, side: THREE.DoubleSide });
  const boostMat = new THREE.MeshBasicMaterial({ map: boostTex, side: THREE.DoubleSide });
  const rampMat = new THREE.MeshLambertMaterial({ map: rampTex, side: THREE.DoubleSide });
  const boxMat = new THREE.MeshBasicMaterial({ map: boxTex, transparent: true, opacity: 0.92 });
  const mudMat = new THREE.MeshLambertMaterial({ map: mudTex, side: THREE.DoubleSide });
  const iceMat = new THREE.MeshLambertMaterial({ map: iceTex, side: THREE.DoubleSide, transparent: true, opacity: 0.9 });
  const brickMat = new THREE.MeshLambertMaterial({ map: brickTex, side: THREE.DoubleSide });
  const stoneMat = lam(0x9a9aa6);
  const fenceMat = new THREE.MeshLambertMaterial({ map: fenceTex, side: THREE.DoubleSide });
  const lollyMat = new THREE.MeshLambertMaterial({ map: lollyTex });
  // space: the road and its rails glow by themselves (no lighting to work out, so they're cheap too)
  const rainbowMat = new THREE.MeshBasicMaterial({ map: rainbowTex, side: THREE.DoubleSide });
  const glowCurbMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const guardMat = new THREE.MeshBasicMaterial({ color: 0x7ff0ff, side: THREE.DoubleSide, transparent: true, opacity: 0.8 });
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, fog: false });
  const planetMat = new THREE.MeshLambertMaterial({ color: 0xffffff, fog: false });
  const coinGeo = new THREE.CylinderGeometry(0.85, 0.85, 0.22, 16).rotateX(PI / 2);
  const coinMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x6a4a00 });
  const lamCache = {};
  const lamC = (c) => lamCache[c] || (lamCache[c] = lam(c));
  const rampGeo = (() => {
    const w = RAMP_W, l = RAMP_L, h = RAMP_H;
    const A = [-w, 0, -l], Bp = [w, 0, -l], C = [w, h, l], D = [-w, h, l], E = [w, 0, l], F = [-w, 0, l];
    const tris = [A, D, C, A, C, Bp, D, F, E, D, E, C, A, F, D, Bp, C, E];
    const uvOf = (p) => [(p[0] + w) / (2 * w), p === C || p === D ? 1 : 0];
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat(), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(tris.map(uvOf).flat(), 2));
    g.computeVertexNormals();
    return g;
  })();

  // big things to put on empty squares
  const PROPS = ['carrot', 'snowman', 'umbrella', 'lolly', 'house'];
  function makeProp(kind) {
    const g = new THREE.Group();
    if (kind === 'carrot') {
      part(g, GEO.cone, lamC(0xff8a1e), 0, 6, 0, 2.6, 12, 2.6).rotation.x = PI;
      [-0.5, 0, 0.5].forEach((a) => { part(g, GEO.cone, lamC(0x3fae5a), Math.sin(a) * 1.4, 13.6, 0, 0.8, 4, 0.8).rotation.z = a; });
    } else if (kind === 'snowman') {
      part(g, GEO.sphere, lamC(0xffffff), 0, 3, 0, 3.2);
      part(g, GEO.sphere, lamC(0xffffff), 0, 7.6, 0, 2.3);
      part(g, GEO.sphere, lamC(0xffffff), 0, 11, 0, 1.6);
      part(g, GEO.sphere, MAT.eye, -0.55, 11.4, 1.4, 0.2);
      part(g, GEO.sphere, MAT.eye, 0.55, 11.4, 1.4, 0.2);
      part(g, GEO.cone, lamC(0xff8a1e), 0, 11, 1.9, 0.3, 1.4, 0.3).rotation.x = PI / 2;
      part(g, GEO.cyl, MAT.black, 0, 13, 0, 1.2, 1.6, 1.2);
      part(g, GEO.cyl, MAT.black, 0, 12.3, 0, 1.8, 0.15, 1.8);
      part(g, GEO.cyl, lamC(0xe0453a), 0, 9.6, 0, 1.7, 0.6, 1.7);
    } else if (kind === 'umbrella') {
      part(g, GEO.cyl, lamC(0xffffff), 0, 4.5, 0, 0.25, 9, 0.25);
      part(g, GEO.cone, lamC(0xff5c5c), 0, 9.6, 0, 5, 2.2, 5);
      part(g, GEO.cone, lamC(0xffffff), 0, 10.3, 0, 2.2, 1, 2.2);
      part(g, GEO.box, lamC(0x4fb8ff), 3, 0.1, 0, 3, 0.15, 6);
    } else if (kind === 'lolly') {
      part(g, GEO.cyl, lamC(0xffffff), 0, 4, 0, 0.35, 8, 0.35);
      part(g, GEO.cyl, lollyMat, 0, 10.5, 0, 3.6, 0.7, 3.6).rotation.x = PI / 2;
    } else {
      part(g, GEO.box, lamC(0xfff0d0), 0, 3, 0, 7, 6, 7);
      const roof = part(g, new THREE.ConeGeometry(5.6, 4, 4), lamC(0xe0453a), 0, 8, 0);
      roof.rotation.y = PI / 4;
      roof.userData.shared = false;
      part(g, GEO.box, lamC(0x8a5a3a), 0, 1.5, 3.55, 1.6, 3, 0.2);
      part(g, GEO.box, lamC(0x7fd0ff), -2, 3.8, 3.55, 1.4, 1.4, 0.2);
      part(g, GEO.box, lamC(0x7fd0ff), 2, 3.8, 3.55, 1.4, 1.4, 0.2);
    }
    g.traverse((o) => { if (o.isMesh && o.userData.shared !== false) o.userData.shared = true; });
    return g;
  }

  let world = null;   // the track that is built right now
  const trackSig = (def) => def.arena ? 'arena:' + def.name : JSON.stringify([def.cells, def.extras, def.props, def.theme, def.closed, def.hills]);

  // ---------- Balloon Battle arenas ----------
  // A walled field instead of a loop of road. Everyone has three balloons; snowballs, honey,
  // bumping a shrunk kart and ramming someone while boosting pop them. The most pops in two
  // minutes wins. Nobody is knocked out: lose all three and Puff brings you new ones.
  const BATTLE_T = 120;
  // Pieces that give an arena more than one level: oriented boxes whose top can slope (a ramp).
  // ang turns the piece; its length (hl) runs along local u, its width (hw) along v; the top
  // goes from y1 at u = -hl to y2 at u = +hl, and it is solid from y0 up. A deck is thin
  // (you can drive under it), a wall and a ramp go down to the ground, a rail sits on a deck.
  const ARENA_STEP = 1;                    // how high a kart can just drive up onto
  // ...except a ramp, which you can hop onto from the side anywhere it's still low
  const stepFor = (p) => (p.kind === 'ramp' ? 2.5 : ARENA_STEP);
  const deck = (x, z, ang, hl, hw, y) => ({ x, z, ang, hl, hw, y0: y - 1, y1: y, y2: y, kind: 'deck' });
  const solid = (x, z, ang, hl, hw, y) => ({ x, z, ang, hl, hw, y0: -1, y1: y, y2: y, kind: 'wall' });
  const ramp = (x, z, ang, hl, hw, ya, yb) => ({ x, z, ang, hl, hw, y0: -1, y1: ya, y2: yb, kind: 'ramp' });
  const rail = (x, z, ang, hl, y) => ({ x, z, ang, hl, hw: 0.25, y0: y, y1: y + 1.6, y2: y + 1.6, kind: 'rail' });
  const ring = (n, r, off = 0) => Array.from({ length: n }, (_, i) => [Math.sin(off + i / n * TAU) * r, Math.cos(off + i / n * TAU) * r]);
  const ARENAS = [
    // a grassy hill in the middle with a tunnel through it, and ramps up onto the top
    { name: 'HONEY BOWL', theme: 'meadow', arena: true, shape: 'circle', R: 105, bowl: 7, spawn: [0, 0.62],
      colors: [0x7fcc5c, 0xc89a5a, 0xffd23f],
      blocks: [[42, 42, 'house'], [-42, 42, 'house'], [42, -42, 'house'], [-42, -42, 'house']],
      pieces: [solid(0, 11.75, 0, 20, 4.25, 9), solid(0, -11.75, 0, 20, 4.25, 9),
               { x: 0, z: 0, ang: 0, hl: 20, hw: 7.5, y0: 7.5, y1: 9, y2: 9, kind: 'roof' },
               ramp(0, 28, PI / 2, 12, 8, 0, 9), ramp(0, -28, PI / 2, 12, 8, 9, 0)],
      boxes: [[0, 0], [12, 0, 10.6], [-12, 0, 10.6], [32, 0], [-32, 0]].concat(ring(8, 68, 0.4)) },
    // a raised plaza with a ramp up each side -- and room to drive underneath it
    { name: 'SNOWBALL SQUARE', theme: 'snow', arena: true, shape: 'square', R: 95, bowl: 4, spawn: [0.3, 0.8],
      colors: [0xe6f0f8, 0x8fb8d8, 0x3a7fd0],
      blocks: [[35, 35, 'snowman'], [-35, 35, 'snowman'], [35, -35, 'snowman'], [-35, -35, 'snowman'],
               [56, 56, 'pillar'], [-56, 56, 'pillar'], [56, -56, 'pillar'], [-56, -56, 'pillar'],   // (off the ramps' line)
               [16, 16, 'post'], [-16, 16, 'post'], [16, -16, 'post'], [-16, -16, 'post']],
      pieces: [deck(0, 0, 0, 18, 18, 7),
               ramp(34, 0, 0, 16, 10, 7, 0), ramp(-34, 0, 0, 16, 10, 0, 7),
               ramp(0, 34, PI / 2, 16, 10, 0, 7), ramp(0, -34, PI / 2, 16, 10, 7, 0)],
      boxes: [[8, 8, 8.6], [-8, -8, 8.6], [0, 0], [68, 68], [-68, 68], [68, -68], [-68, -68], [40, 25], [-40, -25], [25, -40], [-25, 40]] },
    // two railed bridges to drive over (or under)
    { name: 'CANDY CASTLE', theme: 'night', arena: true, shape: 'circle', R: 112, bowl: 3, spawn: [0.8, 0.62],
      colors: [0xff9ad6, 0x8a5ac8, 0xffffff],
      blocks: [[0, 0, 'castle']].concat(ring(6, 44).map(([x, z]) => [x, z, 'lolly'])),
      pieces: [60, -60].flatMap((z) => [deck(0, z, 0, 25, 7, 8), ramp(40, z, 0, 15, 7, 8, 0), ramp(-40, z, 0, 15, 7, 0, 8),
                                        rail(0, z + 7, 0, 25, 8), rail(0, z - 7, 0, 25, 8)]),
      boxes: ring(8, 30, 0.39).concat(ring(8, 84), [[0, 60, 9.6], [0, -60, 9.6]]) },
  ];
  const BLOCK_R = { house: 5.2, snowman: 3.4, lolly: 0.8, carrot: 1.4, pillar: 5, castle: 18.5, post: 1.3 };

  // where a point is in a piece's own frame
  function pieceLocal(p, x, z) {
    const dx = x - p.x, dz = z - p.z, c = Math.cos(p.ang), sn = Math.sin(p.ang);
    return [dx * c - dz * sn, dx * sn + dz * c];
  }
  const pieceTopAt = (p, u) => p.y1 + (p.y2 - p.y1) * (clamp(u, -p.hl, p.hl) + p.hl) / (2 * p.hl);
  // the floor under a point: the highest ground or piece top that isn't far above y
  function arenaFloor(A, x, z, y) {
    let best = A.height(x, z);
    for (const p of A.pieces) {
      const [u, v] = pieceLocal(p, x, z);
      if (Math.abs(u) > p.hl || Math.abs(v) > p.hw) continue;
      const t = pieceTopAt(p, u);
      if (t <= y + stepFor(p) && t > best) best = t;
    }
    return best;
  }
  // is a thing (radius r, from y to y + tall) running into the side of a piece? calls hit(p, u, v, pu, pv)
  function arenaHits(A, x, z, y, r, tall, hit) {
    for (const p of A.pieces) {
      const [u, v] = pieceLocal(p, x, z), pu = p.hl + r - Math.abs(u), pv = p.hw + r - Math.abs(v);
      if (pu <= 0 || pv <= 0) continue;
      if (pieceTopAt(p, u) <= y + stepFor(p) || p.y0 >= y + tall) continue;
      if (hit(p, u, v, pu, pv) === false) return true;
    }
    return false;
  }
  const arenaBlocked = (A, x, z, y, r) => arenaHits(A, x, z, y, r, 2.4, () => false);
  // would driving `dist` along (fx, fz) run into something? walks the floor up ramps on the way
  function pathBlocked(A, x, z, y, fx, fz, dist) {
    const n = Math.ceil(dist / 2);           // small steps, so a steep ramp still counts as a way up
    for (let i = 1; i <= n; i++) {
      const px = x + fx * dist * i / n, pz = z + fz * dist * i / n;
      if (arenaBlocked(A, px, pz, y, 1.2)) return true;
      y = Math.max(y, arenaFloor(A, px, pz, y));
    }
    return false;
  }
  // inside something solid (for keeping the camera out of ramps and walls)
  function arenaInside(A, x, y, z) {
    return A.pieces.some((p) => {
      const [u, v] = pieceLocal(p, x, z);
      return Math.abs(u) < p.hl + 0.6 && Math.abs(v) < p.hw + 0.6 && y < pieceTopAt(p, u) + 0.6 && y > p.y0 - 0.6;
    });
  }

  function buildArena(def) {
    trackGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    while (trackGroup.children.length) trackGroup.remove(trackGroup.children[0]);
    const th = THEMES[def.theme] || THEMES.meadow, R = def.R;
    scene.background.setHex(th.sky);
    scene.fog.color.setHex(th.sky);
    hemi.intensity = 1.9 * th.light;
    sun.intensity = 1.9 * th.light;
    paintLand(th);
    ground.visible = true;
    ground.position.y = -0.25;

    // the floor rises into a bowl near the wall
    const rimD = def.shape === 'square' ? (x, z) => Math.max(Math.abs(x), Math.abs(z)) : (x, z) => Math.hypot(x, z);
    const height = (x, z) => def.bowl * smooth((rimD(x, z) - (R - 26)) / 26);
    const groundY = (x, z) => (rimD(x, z) < R + 1 ? height(x, z) : -0.25);

    // a pretend loop round the middle, so everything that asks "where on the road?" gets an answer
    const N = 160, RL = R * 0.55;
    const f32 = () => new Float32Array(N);
    const px = f32(), pz = f32(), tx = f32(), tz = f32(), nx = f32(), nz = f32();
    for (let i = 0; i < N; i++) {
      const a = i / N * TAU;
      px[i] = Math.sin(a) * RL; pz[i] = Math.cos(a) * RL;
      tx[i] = Math.cos(a); tz[i] = -Math.sin(a);
      nx[i] = -tz[i]; nz[i] = tx[i];
    }
    const pieces = def.pieces || [];
    // nothing big may stand in front of a ramp (the 35 units leading up to its foot), so the way
    // up is always clear -- a tower there is simply left out
    const inFrontOfRamp = (x, z, r) => pieces.some((q) => {
      if (q.kind !== 'ramp') return false;
      const [u, v] = pieceLocal(q, x, z), along = u * (q.y1 < q.y2 ? -1 : 1) - q.hl;
      return along > -2 && along < 35 && Math.abs(v) < q.hw + 3 + r;
    });
    const blocks = def.blocks.map(([x, z, kind]) => ({ x, z, kind, r: BLOCK_R[kind] || 4 }))
      .filter((b) => b.kind === 'post' || !inFrontOfRamp(b.x, b.z, b.r));
    const T = { def, sig: trackSig(def), N, len: TAU * RL, SP: TAU * RL / N, px, pz, tx, tz, nx, nz,
                curv: f32(), bank: f32(), hy: f32(), rail: new Uint8Array(N), guard: new Uint8Array(N), open: false,
                fenceL: f32().fill(1e9), fenceR: f32().fill(1e9), wall: f32().fill(1e9),
                surf: (i, lat) => height(px[i] + nx[i] * lat, pz[i] + nz[i] * lat), groundY,
                pads: [], boxes: [], zones: [], coins: [], coinMesh: null, startAt: 0,
                arena: { R, shape: def.shape, blocks, height, rimD, pieces, ramps: pieces.filter((q) => q.kind === 'ramp') } };

    // floor
    const STEP = FAST ? 7 : 4, E = R + 2, cols = Math.ceil(E * 2 / STEP);
    const pos = [], uv = [], idx = [];
    for (let r = 0; r <= cols; r++) for (let c = 0; c <= cols; c++) {
      const x = -E + c * STEP, z = -E + r * STEP;
      pos.push(x, height(x, z), z);
      uv.push(x / GROUND_TILE, z / GROUND_TILE);
      if (r < cols && c < cols && rimD(x + STEP / 2, z + STEP / 2) < R + 4) {
        const k = r * (cols + 1) + c; idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2);
      }
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    fg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    fg.setIndex(idx);
    fg.computeVertexNormals();
    trackGroup.add(new THREE.Mesh(fg, groundMat));

    // the wall all round, with a stripe along the top
    const WH = def.bowl + 5;
    const wallMat = new THREE.MeshLambertMaterial({ color: th.fence[0], side: THREE.DoubleSide });
    const trimMat = new THREE.MeshLambertMaterial({ color: th.fence[1] });
    if (def.shape === 'square') {
      [[0, R + 0.6, 0], [0, -R - 0.6, 0], [R + 0.6, 0, PI / 2], [-R - 0.6, 0, PI / 2]].forEach(([x, z, ry]) => {
        const w = new THREE.Mesh(new THREE.BoxGeometry(R * 2 + 2.4, WH, 1.2), wallMat);
        w.position.set(x, WH / 2 - 1, z); w.rotation.y = ry; trackGroup.add(w);
        const t = new THREE.Mesh(new THREE.BoxGeometry(R * 2 + 3, 0.9, 1.8), trimMat);
        t.position.set(x, WH - 1, z); t.rotation.y = ry; trackGroup.add(t);
      });
    } else {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(R + 0.6, R + 0.6, WH, 72, 1, true), wallMat);
      w.position.y = WH / 2 - 1; trackGroup.add(w);
      const t = new THREE.Mesh(new THREE.TorusGeometry(R + 0.6, 0.7, 6, 72), trimMat);
      t.rotation.x = PI / 2; t.position.y = WH - 1; trackGroup.add(t);
    }

    // the big things to drive round (and hide behind)
    const pillarMat = def.theme === 'snow' ? lamC(0xbfeaff) : brickMat;
    blocks.forEach((b) => {
      const y = height(b.x, b.z);
      let o;
      if (b.kind === 'post') {
        o = new THREE.Group();
        part(o, new THREE.CylinderGeometry(b.r, b.r, 8, 10), lamC(def.colors ? def.colors[1] : 0x9a9aa6), 0, 4, 0);
      } else if (b.kind === 'pillar') {
        o = new THREE.Group();
        part(o, new THREE.CylinderGeometry(b.r, b.r, 9, 16), pillarMat, 0, 4.5, 0);
        part(o, new THREE.CylinderGeometry(b.r + 0.8, b.r + 0.8, 1, 16), stoneMat, 0, 9.3, 0);
      } else if (b.kind === 'castle') {
        o = new THREE.Group();
        part(o, new THREE.CylinderGeometry(15, 15, 12, 24), brickMat, 0, 6, 0);
        part(o, new THREE.ConeGeometry(12, 9, 24), lamC(0xff7ac0), 0, 16.5, 0);
        for (let i = 0; i < 4; i++) {
          const a = i / 4 * TAU + PI / 4;
          part(o, new THREE.CylinderGeometry(3.5, 3.5, 17, 12), brickMat, Math.sin(a) * 15, 8.5, Math.cos(a) * 15);
          part(o, new THREE.ConeGeometry(4.6, 6, 12), lamC(0x4ff0ff), Math.sin(a) * 15, 20, Math.cos(a) * 15);
        }
      } else o = makeProp(b.kind);
      o.position.set(b.x, y - 0.2, b.z);
      o.rotation.y = Math.atan2(-b.x, -b.z);        // houses face the middle
      trackGroup.add(o);
    });

    // ramps, decks, walls and rails: boxes whose top vertices are lifted to the piece's top
    if (pieces.length) {
      const [topC, sideC, railC] = def.colors;
      const topM = lam(topC), sideM = lam(sideC), railM = lam(railC);
      const arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
      pieces.forEach((q) => {
        const g = new THREE.BoxGeometry(2 * q.hl, 1, 2 * q.hw, 1, 1, 1).translate(0, 0.5, 0);
        const pa = g.attributes.position;
        for (let i = 0; i < pa.count; i++) {
          const top = pa.getY(i) > 0.5;
          pa.setY(i, top ? pieceTopAt(q, pa.getX(i)) : Math.max(q.y0, -1));
        }
        g.computeVertexNormals();
        const isRail = q.kind === 'rail';
        const m = new THREE.Mesh(g, isRail ? railM : [sideM, sideM, topM, sideM, sideM, sideM]);
        m.position.set(q.x, 0, q.z);
        m.rotation.y = q.ang;
        trackGroup.add(m);
        if (q.kind === 'ramp') {
          // flat white arrows painted up the ramp
          const up = q.y2 > q.y1 ? 1 : -1, c = Math.cos(q.ang), sn = Math.sin(q.ang), pts = [];
          const at = (u, v) => [q.x + u * c + v * sn, pieceTopAt(q, u) + 0.1, q.z - u * sn + v * c];
          for (const a of [-0.45, 0.15]) {
            const u0 = a * q.hl * up, u1 = u0 + 3.2 * up;
            pts.push(...at(u0, -2.2), ...at(u1, 0), ...at(u0, 2.2));
          }
          const ag = new THREE.BufferGeometry();
          ag.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          trackGroup.add(new THREE.Mesh(ag, arrowMat));
        }
      });
    }

    // item boxes (a third number puts one up on a deck)
    def.boxes.forEach(([x, z, y]) => {
      const m = new THREE.Mesh(GEO.box, boxMat);
      m.userData.shared = true;
      m.position.set(x, y != null ? y : height(x, z) + 1.6, z);
      m.scale.setScalar(1.8);
      trackGroup.add(m);
      T.boxes.push({ x, y: m.position.y, z, mesh: m, t: 0 });
    });

    addScenery(th, def.theme, groundY, R + 130, R + 130, (x, z) => rimD(x, z) < R + 8);
    world = T;
  }

  // trees (wherever `blocked` allows), far-off hills and clouds -- or, in space, stars and planets
  function addScenery(th, theme, groundY, spanX, spanZ, blocked) {
    const shared = (m) => { m.userData.shared = true; return m; };
    const TREES = FAST ? 60 : 170;
    const kind = th.tree;
    const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 6).translate(0, 0.5, 0);
    const crownGeo = kind === 'pine' ? new THREE.ConeGeometry(1, 2.4, 7).translate(0, 1.2, 0)
      : kind === 'palm' ? new THREE.SphereGeometry(1, 8, 5).scale(1.5, 0.35, 1.5)
      : new THREE.SphereGeometry(1, 8, 6).translate(0, 0.6, 0);
    const trunks = new THREE.InstancedMesh(trunkGeo, lam(th.trunk), TREES);
    const crowns = new THREE.InstancedMesh(crownGeo, lam(0xffffff), TREES);
    let made = 0;
    for (let tries = 0; !th.space && tries < TREES * 6 && made < TREES; tries++) {
      const x = rand(-spanX, spanX), z = rand(-spanZ, spanZ);
      if (blocked(x, z)) continue;
      const y = groundY(x, z) - 0.2;
      const s = rand(2, 3.8), tall = kind === 'palm' ? rand(6, 9) : kind === 'lolly' ? rand(4, 6) : rand(2, 3.6);
      dummy.position.set(x, y, z); dummy.rotation.set(0, rand(0, TAU), 0); dummy.scale.set(kind === 'palm' ? 0.7 : 1, tall, kind === 'palm' ? 0.7 : 1);
      dummy.updateMatrix(); trunks.setMatrixAt(made, dummy.matrix);
      dummy.position.set(x, y + tall, z); dummy.scale.setScalar(kind === 'lolly' ? s * 0.6 : s);
      dummy.updateMatrix(); crowns.setMatrixAt(made, dummy.matrix);
      crowns.setColorAt(made, tint.setHex(th.crown[made % th.crown.length]));
      made++;
    }
    trunks.count = crowns.count = made;
    trackGroup.add(trunks, crowns);

    // far-off hills and a few clouds
    const hillMat = lam(th.hill), cloudMat = new THREE.MeshBasicMaterial({ color: theme === 'night' ? 0x6a5aa8 : 0xffffff });
    // (one instanced mesh each, so all 14 hills and all 14 clouds are just two draws)
    const hills = shared(new THREE.InstancedMesh(GEO.cone, hillMat, 14));
    const clouds = shared(new THREE.InstancedMesh(GEO.sphere, cloudMat, 14));
    dummy.rotation.set(0, 0, 0);
    for (let i = 0; i < 14; i++) {
      const a = i / 14 * TAU + rand(-0.15, 0.15), r = rand(520, 660);
      dummy.scale.set(rand(110, 200), rand(80, 170), rand(110, 200));
      dummy.position.set(Math.sin(a) * r, ground.position.y + dummy.scale.y / 2 - 2, Math.cos(a) * r);
      dummy.updateMatrix(); hills.setMatrixAt(i, dummy.matrix);
      dummy.scale.set(rand(26, 48), rand(7, 11), rand(14, 26));
      dummy.position.set(rand(-560, 560), rand(110, 180), rand(-560, 560));
      dummy.updateMatrix(); clouds.setMatrixAt(i, dummy.matrix);
    }
    hills.frustumCulled = clouds.frustumCulled = false;   // spread over the whole sky
    if (!th.space) trackGroup.add(hills, clouds);
    else {
      // stars all round, and a few big planets far off
      const sp = [];
      for (let i = 0; i < (FAST ? 260 : 700); i++) {
        const a = rand(0, TAU), e = Math.asin(rand(-1, 1)), r = rand(900, 1300);
        sp.push(Math.cos(e) * Math.sin(a) * r, Math.sin(e) * r, Math.cos(e) * Math.cos(a) * r);
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
      const stars = new THREE.Points(sg, starMat);
      stars.frustumCulled = false;
      trackGroup.add(stars);
      const cols = [0xff9a5c, 0x7fd8ff, 0xc890ff, 0xffe08a, 0x8fe3a0, 0xff7ab8];
      const planets = shared(new THREE.InstancedMesh(GEO.sphere, planetMat, cols.length));
      cols.forEach((c, i) => {
        const a = i / cols.length * TAU + rand(-0.3, 0.3), r = rand(520, 760), size = rand(35, 95);
        dummy.scale.setScalar(size);
        dummy.position.set(Math.sin(a) * r, rand(-220, 260), Math.cos(a) * r);
        dummy.updateMatrix(); planets.setMatrixAt(i, dummy.matrix);
        planets.setColorAt(i, tint.setHex(c));
      });
      planets.frustumCulled = false;
      trackGroup.add(planets);
    }

  }

  function buildWorld(def) {
    const sig = trackSig(def);
    if (world && world.sig === sig) { world.def = def; return; }
    if (def.arena) { buildArena(def); return; }

    // out with the old
    trackGroup.traverse((o) => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
    while (trackGroup.children.length) trackGroup.remove(trackGroup.children[0]);

    const th = THEMES[def.theme] || THEMES.meadow;
    scene.background.setHex(th.sky);
    scene.fog.color.setHex(th.sky);
    hemi.intensity = 1.9 * th.light;
    sun.intensity = 1.9 * th.light;
    paintLand(th);
    ground.visible = !th.space;

    // The road's middle line: a smooth closed curve through the squares, rounded off some more
    // so every corner is one long easy arc, then cut into evenly spaced points.
    const nc = def.cells.length;
    const ctrl = def.cells.map((c, i) => {
      const d = def.cells[(i + 1) % nc];
      return new THREE.Vector3((cellX(c) + cellX(d)) / 2, 0, (cellZ(c) + cellZ(d)) / 2);
    });
    const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
    curve.arcLengthDivisions = Math.max(400, nc * 40);
    const raw = curve.getSpacedPoints(Math.max(60, Math.round(curve.getLength() / 1.5)));
    raw.pop();
    let xs = raw.map((q) => q.x), zs = raw.map((q) => q.z);
    const M = xs.length, win = Math.min(Math.round(CELL * 0.42 / 1.5), Math.floor(M / 8));
    for (let pass = 0; pass < 2; pass++) {
      const ax = new Array(M), az = new Array(M);
      for (let i = 0; i < M; i++) {
        let sx = 0, sz = 0;
        for (let o = -win; o <= win; o++) { const j = mod(i + o, M); sx += xs[j]; sz += zs[j]; }
        ax[i] = sx / (2 * win + 1); az[i] = sz / (2 * win + 1);
      }
      xs = ax; zs = az;
    }
    const cum = [0];
    for (let i = 0; i < M; i++) { const j = (i + 1) % M; cum.push(cum[i] + Math.hypot(xs[j] - xs[i], zs[j] - zs[i])); }
    const len = cum[M];
    const N = Math.max(48, Math.round(len / 1.5));
    const ex = new Float32Array(N), ez = new Float32Array(N);
    for (let i = 0, seg = 0; i < N; i++) {
      const at = i * len / N;
      while (seg < M - 1 && cum[seg + 1] < at) seg++;
      const f = (at - cum[seg]) / (cum[seg + 1] - cum[seg] || 1), j = (seg + 1) % M;
      ex[i] = xs[seg] + (xs[j] - xs[seg]) * f; ez[i] = zs[seg] + (zs[j] - zs[seg]) * f;
    }
    // sample 0 is the start line
    const startAt = startCell(def), sc = def.cells[startAt];
    let s0 = 0, sd = Infinity;
    for (let i = 0; i < N; i++) {
      const d = (ex[i] - cellX(sc)) ** 2 + (ez[i] - cellZ(sc)) ** 2;
      if (d < sd) { sd = d; s0 = i; }
    }
    const px = new Float32Array(N), pz = new Float32Array(N);
    const tx = new Float32Array(N), tz = new Float32Array(N), nx = new Float32Array(N), nz = new Float32Array(N);
    for (let i = 0; i < N; i++) { px[i] = ex[(i + s0) % N]; pz[i] = ez[(i + s0) % N]; }
    for (let i = 0; i < N; i++) {
      const a = mod(i - 1, N), b = (i + 1) % N;
      const dx = px[b] - px[a], dz = pz[b] - pz[a], d = Math.hypot(dx, dz) || 1;
      tx[i] = dx / d; tz[i] = dz / d;
      nx[i] = -tz[i]; nz[i] = tx[i];      // points to the driver's right
    }
    const SP = len / N;
    const headingAt = (i) => Math.atan2(tx[i], tz[i]);
    const near = (a, b) => Math.abs(mod(a - b + N / 2, N) - N / 2);

    // how much the road bends (+ = to the left), the banking that goes with it, and how close
    // the fence can sit on the inside of a tight bend
    const curv = new Float32Array(N), curvS = new Float32Array(N), bank = new Float32Array(N), hy = new Float32Array(N);
    for (let i = 0; i < N; i++) curv[i] = wrapAngle(headingAt((i + 1) % N) - headingAt(mod(i - 1, N))) / (2 * SP);
    for (let i = 0; i < N; i++) {
      let sum = 0, sc2 = 0;
      for (let o = -8; o <= 8; o++) { sum += clamp(-curv[mod(i + o, N)] * 5.5, -0.17, 0.17); sc2 += curv[mod(i + o, N)]; }
      bank[i] = sum / 17;                  // + = banked for a right-hand bend
      curvS[i] = sc2 / 17;
    }
    // space has no fence: instead a rail runs round each banked bend (and a little before and after)
    const guard = new Uint8Array(N);
    if (th.space) {
      for (let i = 0; i < N; i++) {
        if (Math.abs(bank[i]) < 0.04) continue;
        for (let o = -6; o <= 6; o++) guard[mod(i + o, N)] = 1;
      }
    }
    const fenceL = new Float32Array(N), fenceR = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const tight = Math.max(EDGE + 3, 0.72 / Math.max(1e-4, Math.abs(curvS[i])));
      fenceL[i] = curvS[i] > 0 ? Math.min(FENCE, tight) : FENCE;
      fenceR[i] = curvS[i] < 0 ? Math.min(FENCE, tight) : FENCE;
    }
    // soft hills: a couple of slow waves round the loop, flat at the start line
    const amp = Math.min([0, 7, 13][def.hills == null ? 1 : def.hills] || 0, len / 80);
    let low = 0;
    if (amp) {
      const c1 = Math.max(1, Math.round(len / 420)), c2 = Math.max(2, Math.round(len / 250));
      for (let i = 0; i < N; i++) {
        const u = i / N, flat = Math.min(1, Math.min(u, 1 - u) * 9);
        hy[i] = amp * flat * flat * (0.6 * Math.sin(TAU * c1 * u + nc * 1.7) + 0.4 * Math.sin(TAU * c2 * u + nc * 0.9));
        low = Math.min(low, hy[i]);
      }
    }
    // where the road crosses itself: the samples of each pass closest to the other
    const passAt = (cellIdx) => {
      const c = def.cells[cellIdx], d = def.cells[(cellIdx + 1) % nc];
      const dx = d[0] - c[0], dz = d[1] - c[1];
      let best = -1, bd = Infinity;
      for (let i = 0; i < N; i++) {
        if (tx[i] * dx + tz[i] * dz < 0.8) continue;
        const dd = (px[i] - cellX(c)) ** 2 + (pz[i] - cellZ(c)) ** 2;
        if (dd < bd) { bd = dd; best = i; }
      }
      return best;
    };
    const meets = [];
    crossings(def).forEach(([i1, i2]) => {
      const a = passAt(i2), b = passAt(i1);
      if (a < 0 || b < 0) return;
      // the smoothing can shift the real crossing off the square's middle (next to a bend)
      const r = Math.round(CELL / SP);
      let over = a, under = b, bd = Infinity;
      for (let o = -r; o <= r; o++) {
        const i = mod(a + o, N);
        for (let q = -r; q <= r; q++) {
          const j = mod(b + q, N), d = (px[i] - px[j]) ** 2 + (pz[i] - pz[j]) ** 2;
          if (d < bd) { bd = d; over = i; under = j; }
        }
      }
      meets.push([over, under]);
    });
    // both passes run level for a while round the crossing, so the lower road never dips into a
    // hill the upper one is on (and the grass between them has nothing to bulge up through)
    if (amp) meets.forEach(([over, under]) => {
      const lvl = Math.min(hy[over], hy[under]), nf = Math.round(CELL * 2.4 / SP);
      [over, under].forEach((c) => {
        for (let o = -nf; o <= nf; o++) {
          const j = mod(c + o, N), w = Math.min(1, 0.8 * (1 + Math.cos(PI * o / nf)));
          hy[j] += (lvl - hy[j]) * w;
        }
      });
    });
    const hyBase = Float32Array.from(hy);

    // bridges: where the road crosses itself, the second pass rises over the first
    const rail = new Uint8Array(N), bridges = [];
    const wall = new Float32Array(N).fill(1e9);     // how far from the middle a kart may go
    meets.forEach(([over, under]) => {
      const nb = Math.round(CELL * 1.6 / SP);
      // the road underneath squeezes between the bridge's stone walls (no driving through them)
      if (!th.space) {
        const span = Math.round((EDGE + 3) / SP);
        for (let o = -span - 7; o <= span + 7; o++) {
          const j = mod(under + o, N), out = Math.max(0, Math.abs(o) - span);
          wall[j] = Math.min(wall[j], EDGE + 2.5 + out * 1.4);
        }
      }
      const Hb = 7.5 + Math.max(0, hy[under] - hy[over]);
      for (let o = -nb; o <= nb; o++) {
        const j = mod(over + o, N);
        hy[j] += Hb * 0.5 * (1 + Math.cos(PI * o / nb));
        if (Math.abs(o) < nb * 0.85) rail[j] = 1;
      }
      bridges.push({ over, under, nb });
    });

    // jumps are real ramps you drive up (only karts feel them; the road mesh stays flat)
    const rampArr = new Float32Array(N), ramps = [];
    const spotOf = (c) => {
      let spot = 0, bd = Infinity;
      for (let i = 0; i < N; i++) {
        const d = (px[i] - cellX(c)) ** 2 + (pz[i] - cellZ(c)) ** 2;
        if (d < bd) { bd = d; spot = i; }
      }
      return spot;
    };
    const extras = [];
    Object.keys(def.extras || {}).forEach((key) => {
      const c = def.cells[+key], kind = def.extras[key];
      if (!c || +key === startAt || isCross(def, +key)) return;
      extras.push({ kind, spot: spotOf(c) });
    });
    extras.forEach((e) => {
      if (e.kind !== 'jump') return;
      ramps.push(e.spot);
      const n = Math.ceil(RAMP_L / SP);
      for (let o = -n; o <= n; o++) {
        const along = o * SP;
        if (along >= -RAMP_L && along <= RAMP_L) rampArr[mod(e.spot + o, N)] = RAMP_H * (along + RAMP_L) / (2 * RAMP_L);
      }
    });

    // Height of the road surface. Banking lifts the outside of a bend (the inside edge stays
    // down on the ground); past the curbs it eases back down to the grass.
    const surf = (i, lat, ramp) => {
      const b = bank[i], l = clamp(lat, -EDGE, EDGE);
      let y = hy[i] + (EDGE - (b > 0 ? l : -l)) * Math.tan(Math.abs(b));
      const out = Math.abs(lat) - EDGE;
      if (out > 0 && !rail[i]) y += (hy[i] - y) * Math.min(1, out / 5);
      if (ramp && rampArr[i] && Math.abs(lat) <= RAMP_W) y += rampArr[i];
      return y;
    };
    // Height of the grass anywhere: follows the nearest road (not the bridges), and levels out far away.
    const gs = [];
    for (let i = 0; i < N; i += 4) gs.push(i);
    const DROP = 0.25;
    const groundY = !amp ? () => -DROP : (x, z) => {
      let sw = 0, sh = 0, nearest = Infinity;
      for (const i of gs) {
        const d2 = (x - px[i]) ** 2 + (z - pz[i]) ** 2;
        if (d2 < nearest) nearest = d2;
        const w = 1 / ((d2 + 9) ** 3);
        sw += w; sh += w * hyBase[i];
      }
      const k = smooth((Math.sqrt(nearest) - 60) / 90);
      return sh / sw * (1 - k) + low * k - DROP;
    };
    const T = { def, sig, N, len, SP, px, pz, tx, tz, nx, nz, curv, bank, hy, rail, guard, open: !!th.space, fenceL, fenceR, surf, groundY,
                pads: [], boxes: [], zones: [], coins: [], coinMesh: null, startAt, wall };

    ground.position.y = low - DROP - (amp ? 1.2 : 0);
    if (amp && !th.space) {
      const X0 = GW * CELL / 2 + 170, Z0 = GH * CELL / 2 + 170, STEP = FAST ? 14 : 8;
      const cols = Math.round(X0 * 2 / STEP), rows = Math.round(Z0 * 2 / STEP);
      const pos = [], uv = [], idx = [];
      for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
        const x = -X0 + c * STEP, z = -Z0 + r * STEP;
        const rim = r === 0 || c === 0 || r === rows || c === cols;
        pos.push(x, rim ? ground.position.y - 0.1 : groundY(x, z), z);
        uv.push(x / GROUND_TILE, z / GROUND_TILE);
        if (r < rows && c < cols) { const k = r * (cols + 1) + c; idx.push(k, k + cols + 1, k + 1, k + 1, k + cols + 1, k + cols + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      trackGroup.add(new THREE.Mesh(g, groundMat));
    }

    // a strip that follows the road between two sideways offsets, over `count` samples from `from`
    // (two equal offsets make a standing wall between the two heights)
    function ribbon(latA, latB, yA, yB, tile, material, from = 0, count = N) {
      const pos = [], uv = [], idx = [];
      const reps = tile ? Math.max(1, Math.round(len / tile)) : 0;
      for (let i = 0; i <= count; i++) {
        const j = mod(from + i, N);
        pos.push(px[j] + nx[j] * latA, yA(j), pz[j] + nz[j] * latA, px[j] + nx[j] * latB, yB(j), pz[j] + nz[j] * latB);
        const v = tile ? i / N * reps : i / count;
        uv.push(0, v, 1, v);
        if (i < count) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, material);
      trackGroup.add(m);
      return m;
    }
    const at = (lat, lift) => (j) => surf(j, lat) + lift;
    ribbon(-ROAD, ROAD, at(-ROAD, 0.05), at(ROAD, 0.05), th.space ? 40 : 16, th.space ? rainbowMat : roadMat);
    ribbon(-EDGE, -ROAD, at(-EDGE, 0.05), at(-ROAD, 0.05), 5, th.space ? glowCurbMat : curbMat);
    ribbon(ROAD, EDGE, at(ROAD, 0.05), at(EDGE, 0.05), 5, th.space ? glowCurbMat : curbMat);
    if (!th.space) {
      // earth under the lifted outside edge of banked bends
      const skirtMat = new THREE.MeshLambertMaterial({ color: th.groundA, side: THREE.DoubleSide });
      ribbon(-EDGE, -EDGE - 1.6, at(-EDGE, 0.05), (j) => hy[j] - 1, 0, skirtMat);
      ribbon(EDGE, EDGE + 1.6, at(EDGE, 0.05), (j) => hy[j] - 1, 0, skirtMat);
    } else {
      // the rails round the banked bends: one strip for each run of guarded road, both sides
      const all = guard.every((g) => g);
      for (let i = 0; i < N; i++) {
        if (!guard[i] || (!all && guard[mod(i - 1, N)]) || (all && i > 0)) continue;
        let count = 0;
        while (count < N && guard[mod(i + count, N)]) count++;
        [-1, 1].forEach((s) => ribbon(s * EDGE, s * EDGE, at(s * EDGE, 0), at(s * EDGE, 1.4), 0, guardMat, i, Math.min(count, N) - (all ? 0 : 1)));
      }
    }

    // bridges: rails on top, and earth walls down to the grass except where the lower road runs under
    bridges.forEach((b) => {
      const gap = Math.round((EDGE + 4) / SP);
      [-1, 1].forEach((s) => {
        ribbon(s * EDGE, s * EDGE, at(s * EDGE, 0), at(s * EDGE, 1.1), 3, curbMat, b.over - Math.round(b.nb * 0.85), Math.round(b.nb * 1.7));
        if (th.space) return;      // nothing for a bridge to stand on out here
        ribbon(s * EDGE, s * EDGE, at(s * EDGE, 0), (j) => hyBase[j] - 1, 0, stoneMat, b.over - b.nb, b.nb - gap);
        ribbon(s * EDGE, s * EDGE, at(s * EDGE, 0), (j) => hyBase[j] - 1, 0, stoneMat, b.over + gap, b.nb - gap);
      });
    });

    // the fence / hedge each side, with gaps where it would cross another part of the road
    function fence(side, lats) {
      const ok = new Uint8Array(N);
      for (let j = 0; j < N; j++) {
        if (rail[j]) continue;
        const x = px[j] + nx[j] * side * lats[j], z = pz[j] + nz[j] * side * lats[j];
        let free = true;
        for (let i = 0; i < N; i += 2) {
          if (near(i, j) < 40) continue;
          if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < (EDGE + 2) ** 2) { free = false; break; }
        }
        ok[j] = free ? 1 : 0;
      }
      const pos = [], uv = [], idx = [];
      let u = 0;
      for (let j = 0; j < N; j++) {
        const k = (j + 1) % N;
        if (!ok[j] || !ok[k]) continue;
        const a = [px[j] + nx[j] * side * lats[j], pz[j] + nz[j] * side * lats[j]];
        const b = [px[k] + nx[k] * side * lats[k], pz[k] + nz[k] * side * lats[k]];
        const ya = surf(j, side * lats[j]) - 0.3, yb = surf(k, side * lats[k]) - 0.3;
        const du = Math.hypot(b[0] - a[0], b[1] - a[1]) / 4;
        const v = pos.length / 3;
        pos.push(a[0], ya, a[1], a[0], ya + 1.5, a[1], b[0], yb, b[1], b[0], yb + 1.5, b[1]);
        uv.push(u, 0, u, 1, u + du, 0, u + du, 1);
        idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
        u += du;
      }
      if (!idx.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.setIndex(idx);
      g.computeVertexNormals();
      trackGroup.add(new THREE.Mesh(g, fenceMat));
    }
    if (!th.space) { fence(-1, fenceL); fence(1, fenceR); }

    function place(obj, i, lat, lift) {
      obj.position.set(px[i] + nx[i] * lat, surf(i, lat) + lift, pz[i] + nz[i] * lat);
      obj.rotation.y = headingAt(i);
      trackGroup.add(obj);
      return obj;
    }
    const shared = (m) => { m.userData.shared = true; return m; };

    // start line and arch
    ribbon(-ROAD, ROAD, at(-ROAD, 0.09), at(ROAD, 0.09), 0, checkMat, N - 1, 2);
    const postMat = lamC(0xffffff);
    place(shared(new THREE.Mesh(GEO.box, postMat)), 0, -ROAD - 2.4, 4).scale.set(0.8, 9.5, 0.8);
    place(shared(new THREE.Mesh(GEO.box, postMat)), 0, ROAD + 2.4, 4).scale.set(0.8, 9.5, 0.8);
    const banner = new THREE.Mesh(new THREE.BoxGeometry(ROAD * 2 + 6, 2, 0.5), checkMat);
    place(banner, 0, 0, 0).position.y = hy[0] + 8.6;

    // boost pads, ramps, item boxes, mud, ice and tunnels sit where their square meets the road
    extras.forEach(({ kind, spot }) => {
      if (kind === 'boost') {
        ribbon(-8, 8, at(-8, 0.1), at(8, 0.1), 0, boostMat, spot - 3, 6);
        T.pads.push({ idx: spot, kind, reach: 3 });
      } else if (kind === 'jump') {
        const ramp = place(shared(new THREE.Mesh(rampGeo, rampMat)), spot, 0, 0.04);
        ramp.rotation.order = 'YXZ';
        ramp.rotation.x = -Math.atan((hy[(spot + 2) % N] - hy[mod(spot - 2, N)]) / (4 * SP));
      } else if (kind === 'items') {
        [-6.6, -2.2, 2.2, 6.6].forEach((lat) => {
          const m = place(shared(new THREE.Mesh(GEO.box, boxMat)), spot, lat, 1.6);
          m.scale.setScalar(1.8);
          T.boxes.push({ x: m.position.x, y: m.position.y, z: m.position.z, mesh: m, t: 0 });
        });
      } else if (kind === 'mud' || kind === 'ice') {
        const half = Math.round(8 / SP), left = spot % 2 === 0;
        const a = kind === 'ice' ? -ROAD : left ? -9.5 : -1.5, b = kind === 'ice' ? ROAD : left ? 1.5 : 9.5;
        ribbon(a, b, at(a, 0.08), at(b, 0.08), 0, kind === 'mud' ? mudMat : iceMat, spot - half, half * 2);
        T.zones.push({ from: mod(spot - half, N), span: half * 2, a, b, kind });
      } else if (kind === 'tunnel') {
        const half = Math.round(CELL * 0.5 / SP), R = EDGE + 1.6, seg = 12;
        // inside, the walls hold the kart on the road; just before and after, the way in narrows
        for (let o = -half - 7; o <= half + 7; o++) {
          const j = mod(spot + o, N), out = Math.max(0, Math.abs(o) - half);
          T.wall[j] = Math.min(T.wall[j], TUNNEL_LIM + out * 1.4);
        }
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= half * 2; i++) {
          const j = mod(spot - half + i, N);
          for (let a = 0; a <= seg; a++) {
            const ang = a / seg * PI, lat = Math.cos(ang) * R;
            pos.push(px[j] + nx[j] * lat, surf(j, lat) - 0.4 + Math.sin(ang) * R * 0.85, pz[j] + nz[j] * lat);
            uv.push(a / seg * 6, i / 5);
            if (i < half * 2 && a < seg) { const k = i * (seg + 1) + a; idx.push(k, k + seg + 1, k + 1, k + 1, k + seg + 1, k + seg + 2); }
          }
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        g.setIndex(idx);
        g.computeVertexNormals();
        trackGroup.add(new THREE.Mesh(g, brickMat));
        [spot - half, spot + half].forEach((j) => {
          const ring = place(new THREE.Mesh(new THREE.TorusGeometry(R, 1.1, 6, 18, PI), stoneMat), mod(j, N), 0, -0.4);
          ring.scale.y = 0.85;
        });
      }
    });

    // golden koala coins: a line every so often, plus the builder's coin squares
    const coinBlocked = (j) => j < 40 / SP || j > N - 25 / SP || ramps.some((r) => near(j, r) < 14) ||
      T.pads.some((p) => near(j, p.idx) < 8) || T.boxes.length && extras.some((e) => e.kind === 'items' && near(j, e.spot) < 10);
    const addLine = (j0, lat) => {
      for (let c = -2; c <= 2; c++) {
        const j = mod(j0 + c * 3, N);
        T.coins.push({ x: px[j] + nx[j] * lat, y: surf(j, lat, true) + 1.4, z: pz[j] + nz[j] * lat, t: 0 });
      }
    };
    let line = 0;
    for (let j = Math.round(80 / SP); j < N - 40 / SP; j += Math.round(140 / SP)) {
      if (!coinBlocked(j)) addLine(j, [-5, 0, 5][line++ % 3]);
    }
    extras.forEach((e) => { if (e.kind === 'coins') addLine(e.spot, 0); });
    if (T.coins.length) {
      T.coinMesh = new THREE.InstancedMesh(coinGeo, coinMat, T.coins.length);
      T.coinMesh.userData.shared = true;
      T.coinMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      trackGroup.add(T.coinMesh);
    }

    // props on empty squares
    Object.keys(def.props || {}).forEach((key) => {
      const [cx, cy] = key.split(',').map(Number), kind = def.props[key];
      if (!PROPS.includes(kind)) return;
      const x = cellX([cx, cy]), z = cellZ([cx, cy]);
      for (let i = 0; i < N; i += 2) if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < (ROAD + 6) ** 2) return;
      const p = makeProp(kind);
      p.position.set(x, groundY(x, z) - 0.2, z);
      p.rotation.y = ((cx * 7 + cy * 3) % 8) / 8 * TAU;
      trackGroup.add(p);
    });

    // trees, kept clear of the road and the big things
    const propSpots = Object.keys(def.props || {}).map((k) => k.split(',').map(Number)).map((c) => [cellX(c), cellZ(c)]);
    addScenery(th, def.theme, groundY, GW / 2 * CELL + 110, GH / 2 * CELL + 110, (x, z) => {
      if (propSpots.some(([a, b]) => (a - x) ** 2 + (b - z) ** 2 < 100)) return true;
      for (let i = 0; i < N; i += 2) if ((px[i] - x) ** 2 + (pz[i] - z) ** 2 < (FENCE + 3) ** 2) return true;
      return false;
    });

    world = T;
    stepCoins(0);
  }

  let coinSpin = 0;
  function stepCoins(dt) {
    const T = world;
    if (!T || !T.coinMesh) return;
    coinSpin += dt * 3;
    T.coins.forEach((c, i) => {
      if (c.t > 0) c.t -= dt;
      dummy.position.set(c.x, c.y + Math.sin(coinSpin + i) * 0.15, c.z);
      dummy.rotation.set(0, coinSpin, 0);
      dummy.scale.setScalar(c.t > 0 ? 0.0001 : 1);
      dummy.updateMatrix();
      T.coinMesh.setMatrixAt(i, dummy.matrix);
    });
    T.coinMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Racing ----------
  // slot = where the players line up on the grid (0 = front): mid-pack when it's slow
  const SPEEDS = [
    { name: 'SLOW',   top: 40, ai: [0.74, 0.90], slot: 2 },
    { name: 'MEDIUM', top: 50, ai: [0.82, 0.96], slot: 3 },
    { name: 'FAST',   top: 60, ai: [0.90, 1.01], slot: 5 },
  ];
  const TURN = 2.3;          // radians a second at full lock
  const SPIN_T = 1.0;        // how long a bonk spins you
  const GRAV = 30;
  const POINTS = [10, 8, 6, 5, 4, 3];
  const ITEM_NAME = { carrot: 'CARROT BOOST', carrot3: 'TRIPLE CARROT', snowball: 'SNOWBALL', honey: 'HONEY',
                      shield: 'BUBBLE SHIELD', shrink: 'SHRINK STAR' };

  let mode = 'title';
  let race = null, gp = null, cup = null;
  let demoYaw = 0;
  const balls = [], puddles = [];
  const ballGeo = new THREE.SphereGeometry(0.7, 10, 8);
  const ballMat = lam(0xffffff);
  const honeyGeo = new THREE.CylinderGeometry(1.7, 1.9, 0.14, 14);
  const honeyMat = lam(0xffb81e);
  const cams = [camera, new THREE.PerspectiveCamera(62, 16 / 9, 0.5, 1800)];
  cams[0].layers.enable(2);      // player 1's camera sees player 2's tall balloons (layer 2), not their own (1)
  cams[1].layers.enable(1);      // and the other way round
  cams[0].layers.enable(3);      // each player's own small low balloons: 3 for player 1, 4 for player 2
  cams[1].layers.enable(4);

  function resetModel(m) {
    m.g.visible = false; m.shadow.visible = false; m.flame.visible = false; m.bubble.visible = false;
    m.g.scale.setScalar(1);
    pose(m, 0, false, 0);
  }
  // the driver sitting normally, or dancing (t = seconds into the dance)
  function pose(m, t, dancing, lean) {
    if (dancing) {
      m.rider.position.y = 0.62 + Math.abs(Math.sin(t * 6)) * 0.25;
      m.rider.rotation.y = Math.sin(t * 3) * 0.4;
      m.head.rotation.z = Math.sin(t * 6) * 0.2;
      m.ears.forEach((e, j) => { e.rotation.x = -0.3 + Math.sin(t * 9 + j * PI) * 0.5; });
      m.arms.forEach((a, j) => { a.position.y = 0.72 + Math.abs(Math.sin(t * 6 + j * 1.5)) * 0.75; });
    } else {
      m.rider.position.y = 0.62;
      m.rider.rotation.y = 0;
      m.head.rotation.z = 0;
      m.ears.forEach((e) => { e.rotation.x = lean; });
      m.arms.forEach((a) => { a.position.y = 0.72; });
    }
  }

  // Puff, the cloud who lifts lost karts back onto the road (one for each player)
  function makePuff() {
    const g = new THREE.Group();
    const white = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x8a8a9e });
    [[0, 0, 0, 1.7], [1.5, -0.25, 0.2, 1.25], [-1.5, -0.25, 0.1, 1.3], [0.6, 0.8, 0.1, 1.15], [-0.6, 0.7, 0.3, 1.0]]
      .forEach(([x, y, z, r]) => part(g, GEO.sphere, white, x, 4.2 + y, z, r));
    // the face looks back at the camera
    const dark = lamC(0x241a3a), pink = lamC(0xff9ab8);
    [-0.55, 0.55].forEach((x) => part(g, GEO.sphere, dark, x, 4.4, -1.55, 0.2, 0.28, 0.2));
    [-1, 1].forEach((x) => part(g, GEO.sphere, pink, x, 4.0, -1.4, 0.28, 0.18, 0.1));
    part(g, GEO.box, lamC(0xc89a5a), 0, 2.15, 0, 0.12, 1.7, 0.12);       // the rope
    part(g, GEO.box, lamC(0x8a8a9a), 0, 1.35, 0, 1.6, 0.18, 0.18);      // and the bar it holds
    g.visible = false;
    scene.add(g);
    return g;
  }
  // the battle leader's crown and golden glow (made when first needed, one per kart)
  const crownMat = new THREE.MeshLambertMaterial({ color: 0xffd23f, emissive: 0x9a6a00, side: THREE.DoubleSide });
  const glowMat = new THREE.MeshBasicMaterial({ color: 0xffd23f, transparent: true, opacity: 0.35, depthWrite: false });
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xffe14f, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
  const beamGeo = new THREE.CylinderGeometry(1.1, 2.2, 22, 12, 1, true).translate(0, 11, 0);
  const crownBand = new THREE.CylinderGeometry(0.8, 0.7, 0.5, 14, 1, true), crownSpike = new THREE.ConeGeometry(0.2, 0.55, 6);
  const crownGroups = [];
  function makeCrown() {
    const g = new THREE.Group(), c = new THREE.Group();
    part(c, crownBand, crownMat, 0, 0, 0);
    for (let i = 0; i < 6; i++) {
      const a = i / 6 * TAU;
      part(c, crownSpike, crownMat, Math.sin(a) * 0.72, 0.5, Math.cos(a) * 0.72);
      part(c, GEO.sphere, i % 2 ? MAT.blue : MAT.red, Math.sin(a) * 0.78, 0, Math.cos(a) * 0.78, 0.13);
    }
    c.scale.setScalar(1.5);
    g.add(c);
    const glow = part(g, GEO.sphere, glowMat, 0, 1.1, 0, 2.6, 1.7, 3.1);
    glow.renderOrder = 2;
    // a tall soft beam of light, so you can spot the leader from across the arena
    part(g, beamGeo, beamMat, 0, 0, 0).renderOrder = 2;
    g.userData.crown = c;
    scene.add(g);
    crownGroups.push(g);
    return g;
  }
  function showCrown(k) {
    if (!k.crowned) { if (k.crown) k.crown.visible = false; return; }
    const g = k.crown || (k.crown = makeCrown()), t = race.t;
    g.visible = true;
    g.position.set(k.x, k.ay, k.z);
    g.rotation.y = k.h;
    g.scale.setScalar(k.tinyS);
    g.userData.crown.rotation.y = t * 1.5;
    g.userData.crown.position.y = 6.9 + Math.sin(t * 4) * 0.15;      // up above the balloons
    glowMat.opacity = 0.3 + Math.sin(t * 6) * 0.1;
    beamMat.opacity = 0.16 + Math.sin(t * 3) * 0.06;
  }

  // three balloons on strings behind a kart in a battle
  const balloonGroups = [];
  function makeBalloons(color, low) {
    const g = new THREE.Group(), mat = lam(color), str = lamC(0xffffff);
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Group();
      if (low) {
        // your own set: little balloons on short strings at the back of the kart, under the view
        part(b, GEO.box, str, 0, 0.45, 0, 0.04, 0.9, 0.04);
        part(b, GEO.sphere, mat, 0, 1.15, 0, 0.42, 0.52, 0.42);
        b.position.set((i - 1) * 0.6, 0.75, -1.1);
      } else {
        // long strings, so the balloons float above other players' view of the road
        part(b, GEO.box, str, 0, 2.3, 0, 0.05, 4.6, 0.05);
        part(b, GEO.sphere, mat, 0, 5.1, 0, 0.6, 0.75, 0.6);
        b.position.set((i - 1) * 0.3, 0.9, 0);
      }
      g.add(b);
    }
    scene.add(g);
    balloonGroups.push(g);
    return g;
  }
  function showBalloons(k) {
    const g = k.bal, t = race.t;
    g.position.set(k.x - Math.sin(k.h) * 0.6, k.ay, k.z - Math.cos(k.h) * 0.6);
    g.rotation.y = k.h;
    g.scale.setScalar(k.tinyS);
    g.children.forEach((b, i) => {
      b.visible = i < k.balloons;
      b.rotation.z = (i - 1) * 0.2 + Math.sin(t * 2 + i * 2) * 0.05;
      b.rotation.x = -0.05 - clamp(k.v / 50, 0, 1) * 0.12;      // blown back a little by the speed
    });
    const lo = k.balLow;
    if (lo) {
      lo.position.set(k.x, k.ay, k.z);
      lo.rotation.y = k.h;
      lo.scale.setScalar(k.tinyS);
      lo.visible = k.model.g.visible;
      lo.children.forEach((b, i) => {
        b.visible = i < k.balloons;
        b.rotation.z = (i - 1) * 0.25 + Math.sin(t * 3 + i * 2) * 0.08;
        b.rotation.x = -0.2 - clamp(k.v / 50, 0, 1) * 0.35;
      });
    }
  }
  function popBalloon(k, by) {
    if (!race.battle || k.balloons <= 0 || race.done) return;
    k.balloons--;
    burst(k.x - Math.sin(k.h) * 0.6, k.ay + 6, k.z - Math.cos(k.h) * 0.6, [kartColor(k.model), 0xffffff], 14, { size: 0.4, spread: 6 });
    sfxPop();
    if (by && by !== k) {
      by.score++;
      if (by.pi != null) { by.coins++; say(by, 'POP!', 1); sfxCoin(); }
    }
    if (k.balloons <= 0) { k.outT = 1.1; if (k.pi != null) say(k, 'NO BALLOONS!', 1.2); }
  }

  const puffs = [];
  function showPuff(k) {
    if (k.pi == null) return;
    const p = puffs[k.pi] || (puffs[k.pi] = makePuff());
    p.visible = k.rescue > 0;
    if (!p.visible) return;
    const t = RESCUE_T - k.rescue, drop = Math.max(0, 1 - t * 4) * 8;   // floats down from the sky first
    p.position.set(k.x, k.ay + drop + Math.sin(t * 9) * 0.15, k.z);
    p.rotation.y = k.h;
  }

  function clearRaceObjects() {
    puffs.forEach((p) => { p.visible = false; });
    balloonGroups.forEach((g) => { scene.remove(g); g.children.forEach((b) => b.children[1].material.dispose()); });
    balloonGroups.length = 0;
    crownGroups.forEach((g) => scene.remove(g));
    crownGroups.length = 0;
    balls.forEach((b) => scene.remove(b.mesh));
    puddles.forEach((p) => scene.remove(p.mesh));
    balls.length = puddles.length = 0;
    models.forEach(resetModel);
    clearParticles();
    if (world) {
      world.boxes.forEach((b) => { b.t = 0; b.mesh.visible = true; });
      world.coins.forEach((c) => { c.t = 0; });
    }
    if (engine) engine.gain.gain.value = 0;
  }

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function startRace(def, opts = {}) {
    paused = false;
    buildWorld(def);
    clearRaceObjects();
    showroom.visible = podium.visible = false;
    const T = world;
    const speed = SPEEDS[opts.demo ? 1 : save.speed];
    const humans = opts.demo ? [] : save.look.slice(0, save.players).map((l) => l.racer);
    let others;
    if (opts.from === 'gp' && gp.lineup) others = gp.lineup.slice();
    else {
      others = shuffle(RACERS.map((r, i) => i).filter((i) => !humans.includes(i))).slice(0, 6 - humans.length);
      if (opts.from === 'gp') gp.lineup = others.slice();
    }
    const grid = others.slice();
    const slot = Math.min(speed.slot, 6 - humans.length);
    humans.forEach((ri, i) => grid.splice(slot + i, 0, ri));
    let aiN = 0;
    const karts = grid.map((ri, i) => {
      // rows are staggered sideways, so the kart behind you isn't between you and the camera
      const row = i >> 1;
      let lat = (i & 1 ? 4.5 : -4.5) + (row & 1 ? 2.3 : -2.3);
      const idx = mod(T.N - Math.round((6 + row * 5.5) / T.SP), T.N);
      const pi = humans.indexOf(ri);
      let h = Math.atan2(T.tx[idx], T.tz[idx]), x = T.px[idx] + T.nx[idx] * lat, z = T.pz[idx] + T.nz[idx] * lat;
      if (T.arena) {        // battle: spread round a circle, everyone facing the middle
        const sp = def.spawn || [0.3, 0.62], a = i / grid.length * TAU + sp[0], rr = T.arena.R * sp[1];   // (clear of the big things)
        x = Math.sin(a) * rr; z = Math.cos(a) * rr; h = Math.atan2(-x, -z); lat = 0;
      }
      const k = {
        ri, def: RACERS[ri], model: models[ri], pi: pi >= 0 ? pi : null,
        idx, lap: 0, lat, x, z, balloons: 3, score: 0, outT: 0, goal: null, bal: null,
        h, md: h, v: 0, ay: 0, vy: 0, gy: 0, air: false, airT: 0, steer: 0,
        fell: false, fallT: 0, roadY: 0, offT: 0, rescue: 0, moved: false, boost: 0, spin: 0, safe: 0, shield: 0, tiny: 0, tinyS: 1, item: null, uses: 0, itemWait: 0, wrongT: 0,
        drift: 0, charge: 0, hopping: false, dv: 0, rocketAt: null, rocketed: false, aiRocket: Math.random() < 0.4,
        finished: false, finishT: 0, place: i + 1, prog: 0, pt: 0, coins: 0, zone: null, msg: '', msgT: 0,
        skill: pi >= 0 ? 0.95 : speed.ai[0] + (speed.ai[1] - speed.ai[0]) * (aiN++ / 4),
        lane: lat, laneGoal: lat, laneT: rand(1, 3), cam: { h, y: 5, fov: 62 },
      };
      applyLook(k.model, pi >= 0 ? save.look[pi] : null);
      if (T.arena) {
        k.bal = makeBalloons(kartColor(k.model));
        // your own tall balloons would sit right in front of your camera, so they go on a layer
        // only the other player's camera draws; you see a small low set on your kart instead
        if (pi >= 0) {
          k.bal.traverse((o) => o.layers.set(1 + pi));
          k.balLow = makeBalloons(kartColor(k.model), true);
          k.balLow.traverse((o) => o.layers.set(3 + pi));
        }
      }
      k.model.g.visible = true;
      k.model.shadow.visible = true;
      return k;
    });
    karts.forEach((k) => { locate(k); k.ay = k.gy; k.cam.y = k.gy + 4.4; });
    const view = opts.demo ? [karts[0]] : karts.filter((k) => k.pi != null).sort((a, b) => a.pi - b.pi);
    race = {
      def, demo: !!opts.demo, from: opts.from || 'track', battle: !!T.arena, limit: BATTLE_T, warn: 99, key: opts.key || '', order: opts.order || 0, board: opts.board || def.name,
      state: 'count', count: opts.demo ? 0.4 : 3.6, lastTick: 4, t: 0, karts, view, top: speed.top,
      finishCount: 0, done: false, doneT: 0, results: null, confetti: [], before: unlockedSet(),
      hiProg: 0, loProg: 0, newBest: false, unlocked: [], coinsWon: 0,
    };
    karts.forEach((k) => showKart(k, 0));
    mode = opts.demo ? 'title' : 'race';
    touch.show(mode === 'race');
    setSong(def.theme);
    musicTempo = 1;
  }

  function say(k, msg, t = 1.6) { k.msg = msg; k.msgT = t; }

  function locate(k) {
    const T = world;
    if (T.arena) {
      // an arena: slide along the wall and round the big things
      const A = T.arena, lim = A.R - 1.6;
      if (A.shape === 'square') {
        if (Math.abs(k.x) > lim) { k.x = Math.sign(k.x) * lim; k.v *= 0.96; }
        if (Math.abs(k.z) > lim) { k.z = Math.sign(k.z) * lim; k.v *= 0.96; }
      } else {
        const d = Math.hypot(k.x, k.z);
        if (d > lim) { k.x *= lim / d; k.z *= lim / d; k.v *= 0.96; }
      }
      for (const b of A.blocks) {
        if (k.ay > A.height(b.x, b.z) + 7.5) continue;        // up on a deck, over the posts
        const dx = k.x - b.x, dz = k.z - b.z, d = Math.hypot(dx, dz), m = b.r + 1.4;
        if (d < m && d > 1e-4) { k.x = b.x + dx / d * m; k.z = b.z + dz / d * m; k.v *= 0.96; }
      }
      // the sides of ramps, walls and rails push the kart back out the shorter way
      arenaHits(A, k.x, k.z, k.ay, 1.2, 2.4, (p, u, v, pu, pv) => {
        if (pu < pv) u += Math.sign(u) * pu; else v += Math.sign(v) * pv;
        const c = Math.cos(p.ang), sn = Math.sin(p.ang);
        k.x = p.x + u * c + v * sn; k.z = p.z - u * sn + v * c;
        k.v *= 0.96;
      });
      k.idx = mod(Math.round(Math.atan2(k.x, k.z) / TAU * T.N), T.N);
      k.lat = 0;
      k.prog = 0;
      k.gy = arenaFloor(A, k.x, k.z, k.ay);
      return;
    }
    let best = k.idx, bd = Infinity;
    for (let o = -8; o <= 14; o++) {
      const j = mod(k.idx + o, T.N);
      const dx = k.x - T.px[j], dz = k.z - T.pz[j], d = dx * dx + dz * dz;
      if (d < bd) { bd = d; best = j; }
    }
    const delta = best - k.idx;
    if (delta < -T.N / 2) k.lap++; else if (delta > T.N / 2) k.lap--;
    k.idx = best;
    k.lat = (k.x - T.px[best]) * T.nx[best] + (k.z - T.pz[best]) * T.nz[best];
    // rails on bridges; elsewhere the fence a little way into the grass
    const guarded = T.rail[best] || T.guard[best];
    const lim = Math.min(T.wall[best], guarded ? EDGE - 1.4 : T.open ? 1e9 : (k.lat > 0 ? T.fenceR[best] : T.fenceL[best]) - 1.3);
    if (Math.abs(k.lat) > lim) {
      const over = k.lat - Math.sign(k.lat) * lim;
      k.x -= T.nx[best] * over; k.z -= T.nz[best] * over; k.lat -= over;
      k.v *= 0.97;
    }
    k.prog = k.lap * T.N + k.idx;
    // the height of the road (or grass, or ramp) under the kart, eased between samples
    const f = ((k.x - T.px[best]) * T.tx[best] + (k.z - T.pz[best]) * T.tz[best]) / T.SP;
    const a = T.surf(best, k.lat, true), b = T.surf(mod(best + (f >= 0 ? 1 : -1), T.N), k.lat, true);
    k.gy = a + (b - a) * Math.min(1, Math.abs(f));
    // space: past the edge of the road (where there's no rail) there is nothing to drive on
    if (T.open) {
      k.roadY = k.gy;
      if (k.fell || (!guarded && Math.abs(k.lat) > EDGE + 0.5)) k.gy = -1000;
    }
  }
  // back onto the middle of the road after falling off it
  function respawn(k) {
    const T = world, i = k.idx;
    k.fell = false; k.fallT = 0;
    k.x = T.px[i]; k.z = T.pz[i];
    k.h = k.md = Math.atan2(T.tx[i], T.tz[i]);
    k.v = 0; k.vy = 0; k.boost = 0; k.drift = 0; k.spin = 0; k.hopping = false;
    locate(k);
    k.ay = k.gy + 1.2; k.air = true; k.airT = 0;
    k.safe = Math.max(k.safe, 1.5);
    k.cam.h = k.h;
    if (k.pi != null) { sfxUndo(); say(k, 'WHOOPS!', 1); }
  }

  function zoneAt(k) {
    for (const z of world.zones) {
      if (mod(k.idx - z.from, world.N) <= z.span && k.lat >= z.a && k.lat <= z.b) return z.kind;
    }
    return null;
  }

  // ---------- Controls for each player ----------
  // One player: every key works. Two players: player 1 is A / D, S, Space, W; player 2 is the
  // arrows, Down, Right Shift (or /), Up. Controller 1 is player 1, controller 2 is player 2.
  const KEYS = {
    left: [['KeyA'], ['ArrowLeft']], right: [['KeyD'], ['ArrowRight']], brake: [['KeyS'], ['ArrowDown']],
    hop: [['Space', 'ShiftLeft'], ['ShiftRight', 'Slash', 'Period', 'Numpad0', 'ControlRight']],
    item: [['KeyW', 'KeyE', 'KeyQ'], ['ArrowUp', 'Enter', 'NumpadEnter']],
  };
  const keys = {};
  const queued = [{ hop: false, item: false }, { hop: false, item: false }];
  const twoUp = () => !!race && race.view.length > 1;
  const keySets = (pi) => (twoUp() ? [pi] : [0, 1]);
  const held = (pi, act) => keySets(pi).some((s) => KEYS[act][s].some((c) => keys[c]));
  const padsFor = (pi) => (twoUp() ? [Pad360.pad(pi)] : [Pad360.pad(0), Pad360.pad(1)]);
  const steerTouches = {};
  function tapSteer(pi) {
    let s = 0;
    for (const id in steerTouches) if (steerTouches[id].pi === pi) s += steerTouches[id].dir;
    return s;
  }
  function humanInput(pi) {
    const B = Pad360.BTN, pads = padsFor(pi);
    let s = 0;
    if (held(pi, 'left')) s -= 1;
    if (held(pi, 'right')) s += 1;
    pads.forEach((p) => { s += p.axis(0) || p.dx(); });
    if (pi === 0) s += touch.ax() * 1.3;
    s += clamp(tapSteer(pi), -1, 1);
    const brake = held(pi, 'brake') || pads.some((p) => p.down(B.B) || p.down(B.LT)) || (pi === 0 && touch.ay() > 0.75);
    const hop = held(pi, 'hop') || pads.some((p) => p.down(B.A) || p.down(B.RB) || p.down(B.LB)) || (pi === 0 && touch.down('hop'));
    const hopPressed = queued[pi].hop || pads.some((p) => p.pressed(B.A) || p.pressed(B.RB) || p.pressed(B.LB));
    const itemPressed = queued[pi].item || pads.some((p) => p.pressed(B.X) || p.pressed(B.Y) || p.pressed(B.RT));
    queued[pi].hop = queued[pi].item = false;
    return { steer: clamp(s, -1, 1), brake, hop, hopPressed, itemPressed };
  }

  function aiInput(k, dt) {
    const T = world;
    k.laneT -= dt;
    if (k.laneT <= 0) { k.laneT = rand(2, 5); k.laneGoal = rand(-6.5, 6.5); }
    const ahead = mod(k.idx + Math.round(25 / T.SP), T.N);
    for (const z of T.zones) {
      if (z.kind === 'mud' && mod(ahead - z.from, T.N) <= z.span + 12) k.laneGoal = z.a < -5 ? 6 : -6;   // round the mud
    }
    let goal = k.laneGoal;
    if (T.rail[ahead] || T.rail[k.idx]) goal = clamp(goal, -5, 5);                                     // middle of a bridge
    k.lane += (goal - k.lane) * Math.min(1, dt * 0.8);
    const look = 9 + Math.abs(k.v) * 0.3;
    const j = mod(k.idx + Math.max(2, Math.round(look / T.SP)), T.N);
    const gx = T.px[j] + T.nx[j] * k.lane, gz = T.pz[j] + T.nz[j] * k.lane;
    const diff = wrapAngle(Math.atan2(gx - k.x, gz - k.z) - k.h);
    if (k.item) { k.itemWait -= dt; if (k.itemWait <= 0) { useItem(k); k.itemWait = rand(0.6, 1.6); } }
    // how sharply the road bends over the next half second: slow down for it
    const a = mod(k.idx + Math.round(Math.abs(k.v) * 0.55 / T.SP) + 2, T.N);
    const bend = Math.abs(wrapAngle(Math.atan2(T.tx[a], T.tz[a]) - k.h));
    k.ease = 1 - clamp(bend - 0.3, 0, 1) * 0.42;
    return { steer: clamp(-diff * 3, -1, 1), brake: false, hop: false, hopPressed: false, itemPressed: false };
  }

  // a battle: fetch an item, then chase someone and use it on them
  function aiBattle(k, dt) {
    const T = world, A = T.arena, fx = Math.sin(k.h), fz = Math.cos(k.h);
    k.laneT -= dt;
    const g0 = k.goal;
    if (k.laneT <= 0 || !g0 || (g0.box && g0.box.t > 0) || (g0.kart && (g0.kart.balloons <= 0 || g0.kart.rescue > 0))) {
      k.laneT = rand(1.2, 2.8);
      let best = null, bd = Infinity;
      if (!k.item) for (const b of T.boxes) {
        if (b.t > 0) continue;
        // (boxes up on a deck count as nearer, so computer racers go up there too)
        const d = ((b.x - k.x) ** 2 + (b.z - k.z) ** 2) * (b.y > k.ay + 5 ? 0.3 : 1);
        if (d < bd) { bd = d; best = { box: b }; }
      }
      if (!best || (k.item && Math.random() < 0.85) || Math.random() < 0.2) {
        bd = Infinity;
        for (const o of race.karts) {
          if (o === k || o.balloons <= 0 || o.rescue > 0) continue;
          const d = (o.x - k.x) ** 2 + (o.z - k.z) ** 2 * (o.pi != null ? 1.3 : 1);
          if (d < bd) { bd = d; best = { kart: o }; }
        }
      }
      if (!best) { const a = rand(0, TAU), r = rand(20, A.R * 0.7); best = { x: Math.sin(a) * r, z: Math.cos(a) * r }; }
      k.goal = best;
    }
    const g = k.goal, gk = g.kart;
    let gx = gk ? gk.x : g.box ? g.box.x : g.x, gz = gk ? gk.z : g.box ? g.box.z : g.z;
    const gy = gk ? gk.ay : g.box ? g.box.y - 1.6 : k.ay;
    const dist = Math.hypot(gx - k.x, gz - k.z);
    // the target is up on a deck: head for the bottom of a ramp that goes up there, then up it
    if (gy > k.ay + 3 && A.ramps.length) {
      let rp = null, rd = Infinity;
      for (const q of A.ramps) {
        if (Math.abs(Math.max(q.y1, q.y2) - gy) > 2.5) continue;
        const d = (q.x - k.x) ** 2 + (q.z - k.z) ** 2;
        if (d < rd) { rd = d; rp = q; }
      }
      if (rp) {
        const c = Math.cos(rp.ang), sn = Math.sin(rp.ang), lowU = rp.y1 < rp.y2 ? -1 : 1;
        const [u, v] = pieceLocal(rp, k.x, k.z);
        // lined up with the ramp (below it or on it): straight up; otherwise round to its foot
        const lined = Math.abs(v) < rp.hw - 1.5 && u * lowU > -rp.hl;
        const tu = lined ? -lowU * (rp.hl + 8) : lowU * (rp.hl + 9);
        gx = rp.x + tu * c; gz = rp.z - tu * sn;
      }
    }
    let diff = wrapAngle(Math.atan2(gx - k.x, gz - k.z) - k.h);
    // steer round a big thing right ahead
    for (const b of A.blocks) {
      const ax = k.x + fx * 12 - b.x, az = k.z + fz * 12 - b.z;
      if (ax * ax + az * az < (b.r + 4) ** 2) diff += ((b.x - k.x) * -fz + (b.z - k.z) * fx) > 0 ? 0.9 : -0.9;
    }
    // a ramp side, wall or rail right ahead: turn whichever way is clear
    if (pathBlocked(A, k.x, k.z, k.ay, fx, fz, 9)) {
      const l = !pathBlocked(A, k.x, k.z, k.ay, Math.sin(k.h + 0.7), Math.cos(k.h + 0.7), 9);
      diff += l ? 0.9 : -0.9;
    }
    // heading into the wall: turn for the middle
    if (A.rimD(k.x, k.z) > A.R - 16 && k.x * fx + k.z * fz > 0) diff = wrapAngle(Math.atan2(-k.x, -k.z) - k.h);
    // stuck against something for a while: go somewhere else
    k.stuckT = race.state === 'go' && k.v < 10 && k.spin <= 0 ? (k.stuckT || 0) + dt : 0;
    if (k.stuckT > 1.2) { k.stuckT = 0; const a = rand(0, TAU), r = rand(20, A.R * 0.7); k.goal = { x: Math.sin(a) * r, z: Math.cos(a) * r }; k.laneT = 2.5; }
    if (k.item) {
      k.itemWait -= dt;
      const aimed = gk && Math.abs(diff) < 0.3;
      if (k.itemWait <= 0) {
        const it = k.item;
        if ((it === 'snowball' && aimed && dist < 60) || ((it === 'carrot' || it === 'carrot3') && aimed && dist < 30) ||
            (it !== 'snowball' && it !== 'carrot' && it !== 'carrot3')) { useItem(k); k.itemWait = rand(0.5, 1.5); }
        else k.itemWait = 0.25;
      }
    }
    k.ease = 1 - clamp(Math.abs(diff) - 0.5, 0, 1) * 0.45;
    return { steer: clamp(-diff * 2.5, -1, 1), brake: false, hop: false, hopPressed: false, itemPressed: false };
  }

  function rocket(k) {
    if (k.rocketed) return;
    k.rocketed = true;
    k.boost = Math.max(k.boost, 1.3);
    if (k.pi != null) { sfxRocket(); say(k, 'ROCKET START!', 1.4); }
  }

  // the player's STICK and AUTO-STEER settings (in the menu)
  function helpSteer(k, u) {
    const L = save.look[k.pi] || {}, a = Math.abs(u);
    if (L.stick === 0) u = a < 0.12 ? 0 : Math.sign(u) * ((a - 0.12) / 0.88) ** 1.7 * 0.62;
    else if (L.stick === 2) u = Math.sign(u) * Math.min(1, a ** 0.75 * 1.1);
    const help = [0, 0.5, 0.9][L.assist] || 0;
    if (!help || k.drift || k.air) return u;
    const T = world;
    if (T.arena) {
      const A = T.arena, d = A.rimD(k.x, k.z);
      const out = (k.x * Math.sin(k.h) + k.z * Math.cos(k.h)) / (Math.hypot(k.x, k.z) || 1);
      if (d < A.R - 24 || out < 0.2) return u;
      const auto = clamp(-wrapAngle(Math.atan2(-k.x, -k.z) - k.h) * 2, -1, 1);
      return clamp(u + help * auto * (1 - 0.5 * Math.abs(u)), -1, 1);
    }
    // like bumpers at a bowling alley: near the edge, steering further off the road fades away
    const along = Math.sin(k.h) * T.tx[k.idx] + Math.cos(k.h) * T.tz[k.idx];
    if (along > 0 && u * k.lat > 0) u *= 1 - help * clamp((Math.abs(k.lat) - (ROAD - 5)) / 5, 0, 1);
    // steer for a spot a little way down the road in the kart's own lane (kept on the road)
    const lane = clamp(k.lat, -(ROAD - 3), ROAD - 3);
    const j = mod(k.idx + Math.max(2, Math.round((9 + Math.abs(k.v) * 0.3) / T.SP)), T.N);
    const gx = T.px[j] + T.nx[j] * lane, gz = T.pz[j] + T.nz[j] * lane;
    const auto = clamp(-wrapAngle(Math.atan2(gx - k.x, gz - k.z) - k.h) * 3, -1, 1);
    return clamp(u + help * auto * (1 - 0.6 * Math.abs(u)), -1, 1);
  }

  // Facing the wrong way (or stuck out on the grass) too long: Puff the cloud lifts the kart up,
  // swings it back over the middle of the road facing the right way, and sets it down.
  const RESCUE_T = 1.8, RESCUE_SWAP = 0.8;
  function startRescue(k) {
    k.rescue = RESCUE_T; k.moved = false;
    k.wrongT = k.offT = 0;
    k.drift = 0; k.boost = 0; k.spin = 0; k.hopping = false; k.v = 0;
    sfxUndo();
  }
  function stepRescue(k, dt) {
    const T = world;
    k.rescue -= dt;
    k.v = 0; k.vy = 0; k.air = true; k.safe = Math.max(k.safe, 1);
    if (RESCUE_T - k.rescue < RESCUE_SWAP) { k.ay += (k.gy + 3 - k.ay) * Math.min(1, dt * 4); return; }
    if (!k.moved) {
      k.moved = true;
      if (T.arena) { k.balloons = 3; if (k.pi != null) say(k, 'NEW BALLOONS!', 1.4); }
      else {
        const i = k.idx;
        k.x = T.px[i]; k.z = T.pz[i];
        k.h = k.md = k.cam.h = Math.atan2(T.tx[i], T.tz[i]);
        locate(k);
        k.ay = k.gy + 3;
        say(k, 'OFF YOU GO!', 1.4);
      }
    }
    k.ay += (k.gy - k.ay) * Math.min(1, dt * 5);
    if (k.rescue <= 0) { k.rescue = 0; k.ay = k.gy; k.air = false; k.safe = T.arena ? 2 : 1.2; }
  }

  function stepKart(k, dt) {
    const T = world, r = race;
    const human = k.pi != null && !k.finished;
    if (k.outT > 0) { k.outT -= dt; if (k.outT <= 0) startRescue(k); }   // out of balloons: Puff is coming
    if (k.rescue > 0) { stepRescue(k, dt); return; }
    let inp;
    if (r.state === 'count') {
      inp = { steer: 0, brake: true };
      if (human) {
        const hi = humanInput(k.pi);
        if ((hi.hopPressed || hi.itemPressed) && r.count < 1.2) k.rocketAt = r.count;
      }
    } else inp = human ? humanInput(k.pi) : T.arena ? aiBattle(k, dt) : aiInput(k, dt);
    if (human && r.state === 'go') inp.steer = helpSteer(k, inp.steer);
    const st = k.def;
    const grounded = !k.air;

    if (r.state === 'go' && human) {
      if (r.t < 0.4 && inp.hopPressed) rocket(k);
      if (inp.itemPressed) useItem(k);
      // a hop -- and a drift if you land still holding it while steering
      if (inp.hopPressed && grounded && k.spin <= 0) { k.air = true; k.vy = 5.5; k.hopping = true; sfxHop(); }
      if (k.hopping && grounded) {
        k.hopping = false;
        if (inp.hop && Math.abs(inp.steer) > 0.25 && k.v > 15) { k.drift = Math.sign(inp.steer); k.charge = 0; }
      }
    }
    if (k.drift) {
      if (!human || !inp.hop || k.v < 12 || k.spin > 0) {
        const lvl = k.charge > 1.5 ? 2 : k.charge > 0.7 ? 1 : 0;
        if (lvl && human) { k.boost = Math.max(k.boost, lvl === 2 ? 1.0 : 0.55); sfxMini(lvl === 2); }
        k.drift = 0;
      } else k.charge += dt;
    }

    let want = inp.steer;
    if (k.drift) want = k.drift * (0.55 + 0.45 * inp.steer * k.drift);
    k.steer += (want - k.steer) * Math.min(1, dt * 10);

    let top = r.top * st.top;
    if (!human) {
      top *= k.skill * (k.ease || 1);
      // computer racers ease off when far ahead of the players and hurry when far behind
      if (!r.demo && k.pi == null && r.view.some((v) => !v.finished)) {
        if ((k.prog - r.hiProg) * T.SP > 60) top *= 0.9;
        else if ((k.prog - r.loProg) * T.SP < -90) top *= 1.08;
      }
      if (k.finished) top *= 0.6;
    }
    k.zone = grounded ? zoneAt(k) : null;
    if (k.boost > 0) top = r.top * 1.45;
    else {
      if (grounded && Math.abs(k.lat) > ROAD + 1.2) top *= 0.68;   // grass is slow
      if (k.zone === 'mud') top *= 0.55;
    }
    top *= 1 - (k.drift ? 0.06 : 0.2) * Math.abs(k.steer);
    if (k.tiny > 0) top *= 0.8;
    if (k.spin > 0) top *= 0.2;

    const target = r.state === 'count' ? 0 : inp.brake ? (k.v > 1 ? 0 : -9) : top;
    if (k.v < target) k.v = Math.min(target, k.v + (k.boost > 0 ? 70 : 24 * st.acc) * dt);
    else k.v = Math.max(target, k.v - (inp.brake ? 50 : 26) * dt);

    if (k.spin <= 0) k.h -= k.steer * TURN * st.turn * (k.drift ? 1.2 : 1) * (grounded ? 1 : 0.75) * dt * clamp(k.v / 12, -1, 1);
    // banked bends carry the kart part of the way round by themselves
    if (grounded && k.spin <= 0 && Math.abs(k.lat) < ROAD + 1.2 &&
        Math.sin(k.h) * T.tx[k.idx] + Math.cos(k.h) * T.tz[k.idx] > 0.5) {
      // (AUTO-STEER makes them carry you further, so a boost into a bend doesn't throw you off)
      const carry = 0.45 + (human ? [0, 0.2, 0.45][save.look[k.pi].assist] || 0 : 0);
      k.h += T.curv[k.idx] * k.v * dt * carry;
    }
    // the way the kart moves follows the way it points -- loosely in a drift, slowly on ice
    const grip = k.zone === 'ice' ? 1.3 : k.drift ? 7 : 16;
    k.md += wrapAngle(k.h - k.md) * Math.min(1, grip * dt);
    k.x += Math.sin(k.md) * k.v * dt;
    k.z += Math.cos(k.md) * k.v * dt;

    k.boost = Math.max(0, k.boost - dt);
    k.spin = Math.max(0, k.spin - dt);
    k.safe = Math.max(0, k.safe - dt);
    k.shield = Math.max(0, k.shield - dt);
    k.tiny = Math.max(0, k.tiny - dt);

    const lapBefore = k.lap;
    locate(k);

    if (T.arena && !k.air && k.gy < k.ay - 0.8) { k.air = true; k.airT = 0; k.vy = Math.min(k.vy, 0); }   // off the edge of a deck
    if (T.open) {
      if (!k.air && k.gy < k.ay - 4) { k.air = true; k.airT = 0; k.vy = Math.min(k.vy, 0); }   // drove off the edge
      if (k.gy < -500) {
        if (k.ay < k.roadY - 1.5) k.fell = true;      // too far down to get back on
        k.fallT += dt;
        if (k.ay < k.roadY - 26 || k.fallT > 1.7) respawn(k);
      } else k.fallT = 0;
    }
    // up and down: follow the road, fly off the end of a ramp, land again
    if (!k.air) {
      const pred = k.ay + k.vy * dt;
      if (k.vy > 2.5 && pred > k.gy + 0.12 && !T.arena) { k.air = true; k.ay = pred; k.airT = 0; }   // (arena ramps lead onto decks, not into the sky)
      else { k.vy = clamp((k.gy - k.ay) / dt, -30, 30); k.ay = k.gy; }
    }
    if (k.air) {
      k.airT += dt;
      k.vy -= GRAV * dt;
      k.ay += k.vy * dt;
      if (k.ay <= k.gy) {
        const big = k.airT > 0.45, hard = k.vy < -7;
        k.ay = k.gy; k.air = false; k.vy = 0; k.airT = 0;
        if (hard && nearView(k)) burst(k.x, k.ay + 0.3, k.z, (THEMES[T.def.theme] || THEMES.meadow).dust, 10, { spread: 5, up: 3, life: 0.5, size: 0.4 });
        if (big && !k.hopping) { k.boost = Math.max(k.boost, 0.5); if (k.pi != null) sfxMini(false); }   // a little reward for big air
      }
    }

    if (r.state !== 'count' && !k.air) {
      // boost pads
      for (const p of T.pads) {
        if (Math.abs(mod(k.idx - p.idx + T.N / 2, T.N) - T.N / 2) > p.reach || Math.abs(k.lat) > 8.2) continue;
        if (k.boost < 0.8 && k.pi != null) sfxBoost();
        k.boost = Math.max(k.boost, 1.2);
      }
    }
    if (r.state !== 'count') {
      // item boxes
      for (const b of T.boxes) {
        if (b.t > 0 || (k.x - b.x) ** 2 + (k.z - b.z) ** 2 > 6.8 || Math.abs(k.ay + 1 - b.y) > 3) continue;
        b.t = 3; b.mesh.visible = false;
        if (nearView(k)) burst(b.x, b.y, b.z, [0xff5c8f, 0xffd83d, 0x4ff0ff, 0xb48cff], 10, { size: 0.35 });
        if (!k.item) {
          k.item = rollItem(k);
          k.uses = k.item === 'carrot3' ? 3 : 1;
          k.itemWait = rand(1, 4);
          if (k.pi != null) sfxItem();
        }
      }
      // golden koala coins (only the players collect them)
      if (k.pi != null && !k.finished) {
        for (const c of T.coins) {
          if (c.t > 0 || (k.x - c.x) ** 2 + (k.z - c.z) ** 2 > 6 || Math.abs(k.ay + 1.3 - c.y) > 2.5) continue;
          c.t = 8;
          k.coins++;
          sfxCoin();
          burst(c.x, c.y, c.z, [0xffd23f, 0xfff3a0], 6, { spread: 3, up: 4, life: 0.4, size: 0.3 });
        }
      }
    }

    if (k.pi != null && !k.finished && r.state === 'go') {
      // facing the wrong way (WRONG WAY! shows), or out on the grass, for too long: a lift back
      if (!T.arena) {
        const facing = Math.sin(k.h) * T.tx[k.idx] + Math.cos(k.h) * T.tz[k.idx];
        k.wrongT = facing < -0.2 && k.spin <= 0 ? k.wrongT + dt : 0;
        k.offT = !k.air && Math.abs(k.lat) > ROAD + 4 ? k.offT + dt : 0;
        if (k.wrongT > 3.5 || k.offT > 5) startRescue(k);
      }
      if (k.lap > lapBefore && k.lap >= 2 && k.lap <= LAPS) {
        sfxLap();
        say(k, k.lap === LAPS ? 'LAST LAP!' : 'LAP ' + k.lap, 1.8);
      }
    }
    if (!k.finished && !r.demo && k.lap > LAPS) {
      k.finished = true;
      k.finishT = r.t;
      k.place = ++r.finishCount;
      k.drift = 0;
      if (k.pi != null) humanFinished(k);
    }

    k.pt += dt;
    if (k.pt > (FAST ? 0.07 : 0.035)) { k.pt = 0; if (nearView(k)) trail(k); }
  }

  function nearView(k) {
    if (!race) return false;
    return race.view.some((v) => (v.x - k.x) ** 2 + (v.z - k.z) ** 2 < 150 * 150);
  }

  // dust off the road, mud, ice glints, drift sparks and boost flames
  function trail(k) {
    const th = THEMES[world.def.theme] || THEMES.meadow;
    const fx = Math.sin(k.h), fz = Math.cos(k.h), rx = -fz, rz = fx;
    const bx = k.x - fx * 1.6, bz = k.z - fz * 1.6, y = k.ay + 0.3;
    if (!k.air && k.v > 8) {
      if (Math.abs(k.lat) > ROAD + 1.2) emit(bx, y, bz, th.dust[Math.random() < 0.5 ? 0 : 1], { spread: 1.5, up: 3, life: 0.5, size: 0.45 });
      if (k.zone === 'mud') emit(bx, y, bz, Math.random() < 0.5 ? 0x6b4626 : 0x835a33, { spread: 2.5, up: 5, life: 0.5, size: 0.4 });
      if (k.zone === 'ice' && Math.random() < 0.5) emit(bx, y + 0.3, bz, 0xe8f8ff, { spread: 1, up: 1, life: 0.4, size: 0.25, grav: 0 });
      if ((world.def.theme === 'snow' || world.def.theme === 'beach') && k.v > 25 && Math.random() < 0.35) {
        emit(bx, y, bz, th.dust[0], { spread: 1.2, up: 2.5, life: 0.4, size: 0.3 });
      }
    }
    if (k.drift && !k.air) {
      const c = k.charge > 1.5 ? 0xff9a2e : k.charge > 0.7 ? 0x4fc8ff : 0xffffff;
      [-1, 1].forEach((s) => emit(bx + rx * s, y, bz + rz * s, c, { spread: 2, up: 3, life: 0.3, size: k.charge > 0.7 ? 0.35 : 0.22, grav: 4 }));
    }
    if (k.boost > 0) {
      emit(k.x - fx * 2.3, k.ay + 0.6, k.z - fz * 2.3, Math.random() < 0.5 ? 0xffb02e : 0xff5c2e,
        { spread: 0.8, up: 1.5, life: 0.35, size: 0.5, grav: -2, vx: -fx * 8, vz: -fz * 8 });
    }
  }

  // leaders get more honey and shields, the back of the pack gets more carrots and shrink stars
  function rollItem(k) {
    const f = (k.place - 1) / Math.max(1, race.karts.length - 1);
    const w = race.battle ? { carrot: 0.2, carrot3: 0.08, snowball: 0.34, honey: 0.18, shield: 0.14, shrink: 0.06 } : {
      carrot: 0.22 + 0.15 * f, carrot3: 0.02 + 0.2 * f, snowball: 0.15 + 0.08 * f, honey: 0.24 - 0.16 * f,
      shield: 0.2 - 0.08 * f, shrink: k.place > 2 ? 0.02 + 0.12 * f : 0,
    };
    let total = 0;
    for (const key in w) total += w[key];
    let r = Math.random() * total;
    for (const key in w) { r -= w[key]; if (r <= 0) return key; }
    return 'carrot';
  }

  function useItem(k) {
    if (!k.item || k.spin > 0 || k.tiny > 0 || race.state !== 'go') return;
    const it = k.item;
    if (it === 'carrot3') { k.uses--; if (k.uses <= 0) k.item = null; } else k.item = null;
    if (it === 'carrot' || it === 'carrot3') {
      k.boost = Math.max(k.boost, 1.6);
      if (k.pi != null) sfxBoost();
    } else if (it === 'snowball') {
      const mesh = new THREE.Mesh(ballGeo, ballMat);
      scene.add(mesh);
      if (world.arena) balls.push({ arena: true, x: k.x + Math.sin(k.h) * 3, z: k.z + Math.cos(k.h) * 3, h: k.h, owner: k, life: 3, mesh, y: k.ay });
      else balls.push({ idx: k.idx + 3 / world.SP, lat: k.lat, owner: k, life: 3.5, mesh, y: k.ay });
      if (k.pi != null) sfxThrow();
    } else if (it === 'honey') {
      const mesh = new THREE.Mesh(honeyGeo, honeyMat);
      mesh.position.set(k.x - Math.sin(k.h) * 3.2, k.gy + 0.14, k.z - Math.cos(k.h) * 3.2);
      scene.add(mesh);
      puddles.push({ x: mesh.position.x, y: mesh.position.y, z: mesh.position.z, owner: k, age: 0, mesh });
      if (k.pi != null) sfxSplat();
    } else if (it === 'shield') {
      k.shield = 10;
      if (k.pi != null) sfxShield();
    } else if (it === 'shrink') {
      race.karts.forEach((o) => {
        if (o === k || o.finished) return;
        if (o.shield > 0) { o.shield = 0; return; }
        o.tiny = 4; o.drift = 0;
        if (o.pi != null) say(o, 'SHRUNK!', 1.2);
      });
      sfxShrink();
      if (nearView(k)) burst(k.x, k.ay + 2, k.z, [0xffe14f, 0xffffff], 16, { spread: 9, up: 6 });
    }
  }

  function bonk(k, by) {
    if (k.safe > 0 || k.finished || k.rescue > 0 || k.outT > 0) return false;
    if (k.shield > 0) {
      k.shield = 0; k.safe = 1;
      sfxPop();
      burst(k.x, k.ay + 1.5, k.z, [0x7fe8ff, 0xffffff], 12, { size: 0.35 });
      return true;
    }
    k.spin = SPIN_T;
    k.safe = 2.6;
    k.v *= 0.4;
    popBalloon(k, by);
    k.boost = 0;
    k.drift = 0;
    if (nearView(k)) burst(k.x, k.ay + 1.5, k.z, [0xffe14f, 0xffffff, 0xff9a2e], 14);
    if (k.pi != null || (by && by.pi != null)) sfxSpin();
    if (k.pi != null && !race.demo) say(k, 'WHOA!', 0.9);
    return true;
  }

  function stepItems(dt) {
    const T = world;
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.life -= dt;
      let x, z, y, gone = b.life <= 0;
      if (b.arena) {
        // across the arena, curving toward the nearest racer in front, bouncing off the wall
        const A = T.arena;
        let aim = null, bd = 70 * 70;
        for (const k of race.karts) {
          if (k === b.owner || k.rescue > 0) continue;
          const dx = k.x - b.x, dz = k.z - b.z, d = dx * dx + dz * dz;
          if (d < bd && Math.abs(wrapAngle(Math.atan2(dx, dz) - b.h)) < 1.1) { bd = d; aim = k; }
        }
        if (aim) b.h += clamp(wrapAngle(Math.atan2(aim.x - b.x, aim.z - b.z) - b.h), -2.2 * dt, 2.2 * dt);
        b.x += Math.sin(b.h) * 75 * dt; b.z += Math.cos(b.h) * 75 * dt;
        const lim = A.R - 1;
        if (A.shape === 'square') {
          if (Math.abs(b.x) > lim) { b.x = Math.sign(b.x) * lim; b.h = -b.h; }
          if (Math.abs(b.z) > lim) { b.z = Math.sign(b.z) * lim; b.h = PI - b.h; }
        } else {
          const d = Math.hypot(b.x, b.z);
          if (d > lim) {
            const ux = b.x / d, uz = b.z / d, vx = Math.sin(b.h), vz = Math.cos(b.h), dot = vx * ux + vz * uz;
            b.h = Math.atan2(vx - 2 * dot * ux, vz - 2 * dot * uz);
            b.x = ux * lim; b.z = uz * lim;
          }
        }
        if (A.blocks.some((o) => b.y < A.height(o.x, o.z) + 7.5 && (o.x - b.x) ** 2 + (o.z - b.z) ** 2 < (o.r + 0.8) ** 2)) gone = true;
        if (arenaBlocked(A, b.x, b.z, b.y, 0.5)) gone = true;
        b.y = arenaFloor(A, b.x, b.z, b.y);
        x = b.x; z = b.z; y = b.y;
      } else {
        b.idx += 72 / T.SP * dt;
        // roll along the road, drifting toward the nearest racer ahead
        let aim = null, best = 60 / T.SP;
        for (const k of race.karts) {
          if (k === b.owner) continue;
          const d = mod(k.idx - b.idx, T.N);
          if (d < best) { best = d; aim = k; }
        }
        if (aim) b.lat += clamp(aim.lat - b.lat, -9 * dt, 9 * dt);
        const j = mod(Math.round(b.idx), T.N);
        x = T.px[j] + T.nx[j] * b.lat; z = T.pz[j] + T.nz[j] * b.lat; y = T.surf(j, b.lat);
      }
      b.mesh.position.set(x, y + 0.8, z);
      b.mesh.rotation.x += dt * 12;
      for (const k of race.karts) {
        if (k !== b.owner && k.rescue <= 0 && Math.abs(k.ay - y) < 2 && (k.x - x) ** 2 + (k.z - z) ** 2 < 5.5) {
          bonk(k, b.owner); gone = true;
          burst(x, y + 0.8, z, [0xffffff, 0xdcefff], 10, { size: 0.35 });
          break;
        }
      }
      if (gone) { scene.remove(b.mesh); balls.splice(i, 1); }
    }
    for (let i = puddles.length - 1; i >= 0; i--) {
      const p = puddles[i];
      p.age += dt;
      let gone = p.age > 40;
      for (const k of race.karts) {
        if (k === p.owner && p.age < 1.5) continue;
        if (!k.air && Math.abs(k.ay - p.y) < 1.5 && (k.x - p.x) ** 2 + (k.z - p.z) ** 2 < 5) { if (bonk(k, p.owner)) { gone = true; break; } }
      }
      if (gone) { scene.remove(p.mesh); puddles.splice(i, 1); }
    }
    for (const b of T.boxes) {
      if (b.t > 0) { b.t -= dt; if (b.t <= 0) b.mesh.visible = true; }
      b.mesh.rotation.y += dt * 1.6;
      b.mesh.rotation.x += dt * 0.9;
    }
    boostTex.offset.y = (boostTex.offset.y + dt * 1.5) % 1;
  }

  function showKart(k, dt) {
    const m = k.model, T = world, i = k.idx;
    // lean with the hill and the banking (only while pointing along the road)
    const along = Math.sin(k.h) * T.tx[i] + Math.cos(k.h) * T.tz[i];
    const on = k.air ? 0.3 : clamp((ROAD + 6 - Math.abs(k.lat)) / 5, 0, 1);
    let pitch = Math.atan((T.hy[(i + 2) % T.N] - T.hy[mod(i - 2, T.N)]) / (4 * T.SP)) * along;
    let roll = T.bank[i] * along * on;
    if (T.arena && !k.air) {
      const A = T.arena, Hf = (x, z) => arenaFloor(A, x, z, k.ay + 0.5), fx = Math.sin(k.h), fz = Math.cos(k.h);
      pitch = Math.atan((Hf(k.x + fx * 1.5, k.z + fz * 1.5) - Hf(k.x - fx * 1.5, k.z - fz * 1.5)) / 3);
      roll = Math.atan((Hf(k.x + fz * 1.5, k.z - fx * 1.5) - Hf(k.x - fz * 1.5, k.z + fx * 1.5)) / 3);
    }
    k.dv += ((k.drift ? -k.drift * 0.38 : 0) - k.dv) * Math.min(1, dt * 8);
    k.tinyS += ((k.tiny > 0 ? 0.55 : 1) - k.tinyS) * Math.min(1, dt * 6);
    m.g.position.set(k.x, k.ay, k.z);
    m.g.rotation.y = k.h + k.dv + (k.spin > 0 ? (1 - k.spin / SPIN_T) * TAU * 2 : 0);
    m.g.scale.setScalar(k.tinyS);
    m.tilt.rotation.z = k.steer * 0.09 + roll;
    m.tilt.rotation.x = (k.air ? -clamp(k.vy, -8, 8) * 0.025 : 0) - pitch;
    m.wheels.forEach((w) => { w.rotation.y = -k.steer * 0.45; });
    pose(m, race.t - k.finishT, k.finished && !race.demo, -0.1 - 0.5 * clamp(k.v / 50, 0, 1));
    m.flame.visible = k.boost > 0;
    if (m.flame.visible) m.flame.scale.y = 1.1 + Math.random() * 0.8;
    m.bubble.visible = k.shield > 0 && (k.shield > 2 || Math.floor(k.shield * 8) % 2 === 0);
    m.g.visible = k.rescue > 0 || !(k.safe > 0 && k.spin <= 0 && Math.floor(k.safe * 10) % 2 === 0);
    m.shadow.position.set(k.x, k.gy + 0.14, k.z);
    m.shadow.visible = k.gy > -500;
    m.shadow.rotation.set(-pitch, k.h, roll);
    m.shadow.scale.setScalar(k.tinyS / (1 + (k.ay - k.gy) * 0.25));
    showPuff(k);
    if (k.bal) { showBalloons(k); showCrown(k); }
  }

  function chase(k, cam, dt) {
    const c = k.cam, r = race;
    if (r.demo) demoYaw += dt * 0.25;
    const goal = k.h + (r.demo ? Math.sin(demoYaw) * 2.6 : k.finished ? (r.t - k.finishT) * 0.5 : 0);
    c.h += wrapAngle(goal - c.h) * (1 - Math.exp(-dt * 5));
    const fx = Math.sin(c.h), fz = Math.cos(c.h);
    const back = r.demo ? 11 : 8.5;
    const gy = k.gy < -500 ? Math.min(k.roadY, k.ay + 6) : k.gy;      // falling: follow the kart down a little
    let cx = k.x - fx * back, cz = k.z - fz * back;
    const ky = k.rescue > 0 ? k.ay - 1 : gy + (k.ay - gy) * 0.5, T = world;   // lifted by Puff: follow up
    if (T.arena) {
      const A = T.arena, lim = A.R - 3;
      if (A.shape === 'square') { cx = clamp(cx, -lim, lim); cz = clamp(cz, -lim, lim); }
      else { const d = Math.hypot(cx, cz); if (d > lim) { cx *= lim / d; cz *= lim / d; } }
      if (A.pieces.length) {
        const cyGuess = ky + 4.4;
        for (let f = 1; f > 0.15; f -= 0.17) {
          const qx = k.x + (cx - k.x) * f, qz = k.z + (cz - k.z) * f;
          if (!arenaInside(A, qx, cyGuess, qz) || f < 0.3) { cx = qx; cz = qz; break; }
        }
      }
    }
    // in a tunnel, keep the camera inside it too
    const ci = mod(k.idx - Math.round(back / T.SP), T.N);
    if (Math.min(T.wall[ci], T.wall[k.idx]) < EDGE) {
      const lat = (cx - T.px[ci]) * T.nx[ci] + (cz - T.pz[ci]) * T.nz[ci], lim = EDGE - 1.5;
      if (Math.abs(lat) > lim) { const o = lat - Math.sign(lat) * lim; cx -= T.nx[ci] * o; cz -= T.nz[ci] * o; }
    }
    c.y += (Math.max(ky + 4.4 + (r.demo ? 1.5 : 0), world.groundY(cx, cz) + 2.5) - c.y) * Math.min(1, dt * 8);
    cam.position.set(cx, c.y, cz);
    cam.lookAt(k.x + fx * 5, ky + 1.5, k.z + fz * 5);
    const fov = (k.boost > 0 ? 74 : 62) + (r.view.length > 1 ? 6 : 0);
    if (Math.abs(c.fov - fov) > 0.05) c.fov += (fov - c.fov) * Math.min(1, dt * 4);
    if (Math.abs(cam.fov - c.fov) > 0.01) { cam.fov = c.fov; cam.updateProjectionMatrix(); }
  }

  function stepRace(dt) {
    const r = race;
    if (r.state === 'count') {
      r.count -= dt;
      const tick = Math.ceil(r.count);
      if (!r.demo && tick !== r.lastTick && tick >= 1 && tick <= 3) sfxCount(false);
      r.lastTick = tick;
      if (r.count <= 0) {
        r.state = 'go';
        if (!r.demo) sfxCount(true);
        r.karts.forEach((k) => {
          if (k.pi != null) { if (k.rocketAt != null && k.rocketAt < 1.0) rocket(k); else say(k, 'GO!', 1); }
          else if (k.aiRocket && !r.demo) rocket(k);
        });
      }
    } else {
      r.t += dt;
    }
    const going = r.view.filter((k) => !k.finished);
    if (going.length) {
      r.hiProg = Math.max(...going.map((k) => k.prog));
      r.loProg = Math.min(...going.map((k) => k.prog));
    }
    r.karts.forEach((k) => stepKart(k, dt));

    // karts push each other apart
    for (let i = 0; i < r.karts.length; i++) for (let j = i + 1; j < r.karts.length; j++) {
      const a = r.karts[i], b = r.karts[j];
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz);
      const reach = 2.5 * (a.tinyS + b.tinyS) / 2;
      if (d > reach || d < 0.001 || Math.abs(a.ay - b.ay) > 1.5 || a.rescue > 0 || b.rescue > 0) continue;
      // a full-size kart bumping a shrunk one spins it (and in a battle, so does a boosting one)
      if (a.tiny > 0 && b.tiny <= 0) bonk(a, b); else if (b.tiny > 0 && a.tiny <= 0) bonk(b, a);
      else if (r.battle && r.state === 'go') { if (a.boost > 0 && b.boost <= 0) bonk(b, a); else if (b.boost > 0 && a.boost <= 0) bonk(a, b); }
      const push = (reach - d) / 2;
      a.x -= dx / d * push; a.z -= dz / d * push;
      b.x += dx / d * push; b.z += dz / d * push;
    }
    if (r.state === 'go') stepItems(dt);
    stepCoins(dt);

    if (r.battle) {
      // places by pops (then balloons left); when the clock runs out, everyone stops and dances
      // (karts level on pops and balloons share a place)
      if (!r.done) {
        const order = r.karts.slice().sort((a, b) => b.score - a.score || b.balloons - a.balloons);
        order.forEach((k, i) => { const p = order[i - 1]; k.place = p && p.score === k.score && p.balloons === k.balloons ? p.place : i + 1; });
        // the crown: whoever has the most pops (nobody while it's still 0)
        const top = order[0].score;
        r.karts.forEach((k) => {
          const was = k.crowned;
          k.crowned = top > 0 && k.score === top;
          if (k.crowned && !was && k.pi != null && r.state === 'go') { say(k, 'YOU HAVE THE CROWN!', 1.6); sfxLap(); }
        });
      }
      // gold sparkles round the leader
      r.sparkT = (r.sparkT || 0) + 1;
      if (r.sparkT % (FAST ? 8 : 4) === 0) r.karts.forEach((k) => {
        if (k.crowned && nearView(k)) emit(k.x + rand(-1.5, 1.5), k.ay + rand(0.5, 3.5), k.z + rand(-1.5, 1.5), Math.random() < 0.5 ? 0xffe14f : 0xffffff, { spread: 1.5, up: 2.5, life: 0.6, size: 0.25, grav: -1 });
      });
      const left = r.limit - r.t;
      if (r.state === 'go' && !r.done && !r.demo) {
        const tick = Math.ceil(left);
        if (tick <= 5 && tick >= 1 && tick !== r.warn) { r.warn = tick; sfxCount(false); }
        if (left <= 0) {
          r.done = true;
          sfxFinish();
          r.karts.forEach((k) => {
            k.finished = true; k.finishT = r.t; k.drift = 0; k.outT = 0;
            if (k.pi != null) say(k, k.place === 1 ? 'YOU WIN!' : ORD[k.place - 1] + ' PLACE!', 3);
          });
          if (r.view.some((v) => v.place <= 3)) confetti(r);
        }
      }
    } else {
      // places: finishers keep theirs, the rest are ordered by how far round they are
      const running = r.karts.filter((k) => !k.finished).sort((a, b) => b.prog - a.prog);
      running.forEach((k, i) => { k.place = r.finishCount + i + 1; });
    }

    r.karts.forEach((k) => { showKart(k, dt); k.msgT = Math.max(0, k.msgT - dt); });
    musicTempo = r.view.some((k) => !k.finished && k.lap === LAPS) ? 1.08 : 1;
    if (r.done) {
      r.doneT += dt;
      if (!r.results && r.doneT > 1.4) endRace();
    }
    r.view.forEach((k, i) => chase(k, cams[i], dt));
    for (const c of r.confetti) { c.y += c.vy * dt; c.x += c.vx * dt; if (c.y > H + 5) c.y = -8; }

    if (engine) {
      const k = r.view[0];
      const on = mode === 'race' && r.state === 'go' && !r.results;
      engine.gain.gain.value = on ? 0.03 : 0;
      engine.osc.frequency.value = 55 + Math.abs(k.v) * 2.3 + (k.boost > 0 ? 30 : 0);
    }
  }

  const ORD = ['1ST', '2ND', '3RD', '4TH', '5TH', '6TH', '7TH', '8TH'];
  function confetti(r) {
    for (let i = 0; i < 90; i++) {
      r.confetti.push({ x: rand(0, W), y: rand(-120, -5), vy: rand(50, 110), vx: rand(-15, 15),
        c: ['#ff5c8f', '#ffd83d', '#8fe36b', '#4ff0ff', '#b48cff'][i % 5], s: rand(2, 4) });
    }
  }
  function humanFinished(k) {
    const r = race;
    sfxFinish();
    say(k, k.place <= 3 ? ORD[k.place - 1] + ' PLACE!' : 'FINISHED!', 3);
    if (r.view.every((v) => v.finished)) {
      r.done = true;
      if (r.view.some((v) => v.place <= 3)) confetti(r);
    }
  }
  function endRace() {
    const r = race;
    // anyone still driving keeps the place they're in
    r.results = r.karts.slice().sort((a, b) => a.place - b.place).map((k) => ({
      ri: k.ri, name: k.def.name, color: kartColor(k.model), time: k.finished ? k.finishT : 0, pi: k.pi, place: k.place, pts: 0, score: k.score,
    }));
    if (gp && r.from === 'gp') {
      r.results.forEach((x) => { x.pts = POINTS[x.place - 1] || 0; gp.points[x.ri] = (gp.points[x.ri] || 0) + x.pts; });
    }
    r.coinsWon = r.view.reduce((s, k) => s + k.coins, 0);
    save.coins += r.coinsWon;
    if (r.view.length === 1 && r.key) {
      const k = r.view[0];
      const cupPlace = save.cups[r.key];
      if (!cupPlace || k.place < cupPlace) save.cups[r.key] = k.place;
      const best = save.best[r.key];
      r.newBest = !best || k.finishT < best;
      if (r.newBest) save.best[r.key] = k.finishT;
      if (window.MickleScores) {
        MickleScores.record('freddy-bear-kart-3d', Math.round(k.finishT * 100) / 100,
          { category: r.board, order: r.order, lowerIsBetter: true, format: 'time' });
      }
    }
    r.unlocked = unlockedSet().filter((n) => !r.before.includes(n));
    if (r.unlocked.length) sfxUnlock();
    writeSave();
    touch.show(false);
  }

  // ---------- Menus: title, pick racers, pick a track, Grand Prix ----------
  let titleSel = 0, trackSel = 0, spin = 0, flow = 'race', pickIdx = 0, rowSel = 0, demoTrack = -1;

  function trackList() {
    if (flow === 'battle') return ARENAS.map((def, i) => ({ def, key: '', order: 0, name: def.name }));
    const list = BUILTIN.map((def, i) => ({ def, key: 't' + i, order: i + 1, name: def.name }));
    save.my.forEach((def, i) => {
      if (def.closed) list.push({ def, key: 'my' + i, order: 10 + i, name: def.name || 'MY TRACK ' + (i + 1) });
    });
    return list;
  }
  function hideAll() {
    paused = false;
    if (engine) engine.gain.gain.value = 0;
    clearRaceObjects();
    race = null;
    touch.show(false);
    showroom.visible = podium.visible = false;
    nameBox.hidden = true;
  }
  function toTitle() {
    hideAll();
    gp = null; cup = null;
    demoTrack = (demoTrack + 1) % BUILTIN.length;
    startRace(BUILTIN[demoTrack], { demo: true });
  }
  // 0 RACE!  1 GRAND PRIX  2 BATTLE  3 BUILD A TRACK  4 PLAYERS
  function titleChoose(i) {
    titleSel = i;
    if (i === 4) { save.players = save.players === 1 ? 2 : 1; writeSave(); sfxSelect(); return; }
    sfxOk();
    if (i === 3) toBuild();
    else {
      const was = flow;
      flow = ['race', 'gp', 'battle'][i];
      if ((was === 'battle') !== (flow === 'battle')) trackSel = 0;
      pickIdx = 0; toRacer();
    }
  }
  function toRacer() {
    hideAll();
    mode = 'racer';
    rowSel = 0;
    showroom.visible = true;
    setSong('meadow');
    showRacer();
  }
  function showRacer() {
    const l = save.look[pickIdx];
    models.forEach((m, i) => {
      m.g.visible = i === l.racer;
      m.shadow.visible = false;
      if (i === l.racer) {
        applyLook(m, l);
        m.g.position.set(0, SHOW_Y, 0);
        m.g.scale.setScalar(1);
        m.tilt.rotation.set(0, 0, 0);
      }
    });
  }
  function cycleRow(dx) {
    const l = save.look[pickIdx];
    if (rowSel === 0) {
      let r = l.racer;
      do { r = mod(r + dx, RACERS.length); } while (save.players === 2 && pickIdx === 1 && r === save.look[0].racer);
      l.racer = r;
    } else {
      const list = (rowSel === 1 ? HATS : PAINTS).filter(isUnlocked), keyName = rowSel === 1 ? 'hat' : 'paint';
      const i = Math.max(0, list.findIndex((x) => x.id === l[keyName]));
      l[keyName] = list[mod(i + dx, list.length)].id;
    }
    writeSave();
    showRacer();
    sfxSelect();
  }
  function pickNext() {
    sfxOk();
    if (pickIdx < save.players - 1) {
      pickIdx++;
      rowSel = 0;
      if (save.look[1].racer === save.look[0].racer) save.look[1].racer = mod(save.look[0].racer + 1, RACERS.length);
      showRacer();
    } else if (flow === 'gp') toGpIntro();
    else toTrack();
  }
  function toTrack() {
    hideAll();
    mode = 'track';
    const list = trackList();
    trackSel = clamp(trackSel, 0, list.length - 1);
    buildWorld(list[trackSel].def);
    setSong(list[trackSel].def.theme);
  }
  function raceSelected() {
    const t = trackList()[trackSel];
    sfxOk();
    startRace(t.def, { key: t.key, order: t.order, from: 'track', board: t.name });
  }
  function toGpIntro() {
    hideAll();
    mode = 'gpintro';
    buildWorld(BUILTIN[0]);
    setSong('night');
  }
  function startGP() {
    gp = { idx: 0, points: {}, lineup: null };
    gpRace();
  }
  function gpRace() {
    const def = BUILTIN[gp.idx];
    startRace(def, { from: 'gp', key: 't' + gp.idx, order: gp.idx + 1, board: def.name });
  }
  function toCup() {
    const humans = save.look.slice(0, save.players).map((l) => l.racer);
    gp.lineup.concat(humans).forEach((ri) => { if (!(ri in gp.points)) gp.points[ri] = 0; });
    const standings = Object.keys(gp.points).map(Number)
      .map((ri) => ({ ri, pts: gp.points[ri], pi: humans.indexOf(ri) }))
      .sort((a, b) => b.pts - a.pts || (b.pi >= 0) - (a.pi >= 0));
    standings.forEach((s, i) => { s.place = i + 1; });
    const before = unlockedSet(), sk = 's' + save.speed;
    standings.filter((s) => s.pi >= 0).forEach((s) => {
      if (!save.gp[sk] || s.place < save.gp[sk]) save.gp[sk] = s.place;
      if (s.place === 1) save.gold = true;
    });
    writeSave();
    hideAll();
    mode = 'cup';
    cup = { standings, t: 0, unlocked: unlockedSet().filter((n) => !before.includes(n)), confetti: [] };
    sfxFinish();
    if (cup.unlocked.length) sfxUnlock();
    confetti(cup);
    podium.visible = true;
    standings.slice(0, 3).forEach((s, i) => {
      const m = models[s.ri];
      applyLook(m, s.pi >= 0 ? save.look[s.pi] : null);
      m.g.visible = true;
      m.g.position.set(PODIUM[i].x, SHOW_Y + PODIUM[i].h - 0.6, 0);
      m.g.rotation.set(0, 0, 0);
      m.g.scale.setScalar(1);
      m.tilt.rotation.set(0, 0, 0);
    });
  }
  function resultsPrimary() {
    sfxOk();
    if (race.from === 'gp') { if (gp.idx < BUILTIN.length - 1) { gp.idx++; gpRace(); } else toCup(); }
    else startRace(race.def, { from: race.from, key: race.key, order: race.order, board: race.board });
  }
  function leaveRace() {
    if (!race) return;
    if (race.from === 'build') toBuild();
    else if (race.from === 'gp') toTitle();
    else toTrack();
  }

  // ---------- Track builder ----------
  // Drawn flat on the HUD canvas: drag from the flag to lay road square by square (straight
  // across the road makes a bridge) and come back to the flag to close the loop. Brushes put
  // boosts, jumps, items, coins, mud, ice and tunnels on road squares and big props on empty
  // ones. A little 3D view of the finished loop turns beside the grid.
  const GX = 12, GY = 30, GS = 21;                  // the grid's corner and square size on the HUD
  const PV = { x: 276, y: 30, w: 194, h: 110 };     // the 3D view
  const BRUSHES = ['road', 'boost', 'jump', 'items', 'coins', 'mud', 'ice', 'tunnel', 'props', 'erase'];
  const BRUSH_NAME = { road: 'ROAD', boost: 'BOOST PAD', jump: 'JUMP', items: 'ITEM BOXES', coins: 'COINS', mud: 'MUD',
                       ice: 'ICE', tunnel: 'TUNNEL', props: 'BIG THINGS', erase: 'RUB OUT' };
  const ed = { slot: 0, brush: 'road', cx: 2, cy: 6, drag: null, moved: false, downCell: null, last: '', dirty: 0, prop: 'carrot' };
  const edTrack = () => save.my[ed.slot];

  function toBuild() {
    hideAll();
    mode = 'build';
    const t = edTrack(), head = t.cells[t.cells.length - 1];
    ed.cx = head[0]; ed.cy = head[1];
    ed.dirty = 0;
    setSong(t.theme);
  }
  function trackChanged() {
    ed.dirty = 0.45;                 // rebuild the 3D view once the drawing pauses
    delete save.best['my' + ed.slot];
    delete save.cups['my' + ed.slot];
    writeSave();
  }
  const cellIdx = (t, x, y) => t.cells.findIndex((c) => c[0] === x && c[1] === y);

  // can the road go straight over the square at `at` (heading dx, dy)? that makes a bridge
  function canCross(t, at, dx, dy) {
    const c = t.cells, n = c.length;
    if (at <= 0 || at >= n - 2 || isCross(t, at) || t.extras[at]) return false;
    const a = c[at - 1], b = c[at + 1];
    const across = (a[0] === b[0] && Math.abs(a[1] - b[1]) === 2 && dy === 0) || (a[1] === b[1] && Math.abs(a[0] - b[0]) === 2 && dx === 0);
    if (!across) return false;
    const nx = c[n - 1][0] + dx * 2, ny = c[n - 1][1] + dy * 2;
    if (nx < 0 || ny < 0 || nx >= GW || ny >= GH) return false;
    const after = cellIdx(t, nx, ny);
    return after === -1 || (after === 0 && n >= 3);
  }
  // try to move the end of the road onto a neighbouring square
  function tryStep(x, y) {
    const t = edTrack(), c = t.cells;
    if (t.closed || x < 0 || y < 0 || x >= GW || y >= GH) return false;
    const n = c.length, head = c[n - 1], dx = x - head[0], dy = y - head[1];
    if (Math.abs(dx) + Math.abs(dy) !== 1) return false;
    const back = n >= 2 && sameCell(c[n - 2], [x, y]);
    // just went over a bridge square? keep going straight across
    if (!back && n >= 2 && isCross(t, n - 1) && (dx !== head[0] - c[n - 2][0] || dy !== head[1] - c[n - 2][1])) return false;
    if (back) {                                        // back over the last square: take it away
      delete t.extras[n - 1]; c.pop(); sfxUndo();
    } else if (n >= 4 && sameCell(c[0], [x, y])) {     // back at the flag: the loop is done
      t.closed = true; sfxFinish();
    } else {
      const at = cellIdx(t, x, y);
      if (at === -1) { c.push([x, y]); sfxSelect(); }
      else if (canCross(t, at, dx, dy)) { c.push([x, y]); sfxOk(); }
      else return false;
    }
    const h = c[c.length - 1];
    ed.cx = h[0]; ed.cy = h[1];
    trackChanged();
    return true;
  }
  // head toward a square that may be a few squares away (a fast drag, or a tap)
  function stepToward(x, y) {
    for (let i = 0; i < 24; i++) {
      const t = edTrack(), head = t.cells[t.cells.length - 1];
      const dx = Math.sign(x - head[0]), dy = Math.sign(y - head[1]);
      if (!dx && !dy) return;
      if (!(dx && tryStep(head[0] + dx, head[1])) && !(dy && tryStep(head[0], head[1] + dy))) return;
      if (t.closed) return;
    }
  }
  // use the brush on a square; `tap` = a fresh tap (taps toggle, drags only paint)
  function paintCell(x, y, tap) {
    const t = edTrack(), b = ed.brush, key = x + ',' + y, i = cellIdx(t, x, y);
    ed.cx = x; ed.cy = y;
    if (b === 'road') return;
    if (b === 'erase') {
      if (i >= 0 && t.extras[i]) delete t.extras[i];
      else if (i < 0 && t.props[key]) delete t.props[key];
      else { if (tap) sfxNope(); return; }
      sfxUndo();
    } else if (b === 'props') {
      if (i >= 0) { if (tap) sfxNope(); return; }
      const cur = t.props[key];
      if (!cur) t.props[key] = ed.prop;
      else if (!tap) return;
      else {
        const next = PROPS.indexOf(cur) + 1;
        if (next >= PROPS.length) delete t.props[key]; else t.props[key] = ed.prop = PROPS[next];
      }
      sfxOk();
    } else {
      if (i < 0 || isCross(t, i)) { if (tap) sfxNope(); return; }
      if (t.extras[i] === b) { if (!tap) return; delete t.extras[i]; sfxUndo(); }
      else { t.extras[i] = b; sfxOk(); }
    }
    trackChanged();
  }
  function edUndo() {
    const t = edTrack();
    if (t.closed) t.closed = false;
    else if (t.cells.length > 1) { delete t.extras[t.cells.length - 1]; t.cells.pop(); }
    else { sfxNope(); return; }
    const h = t.cells[t.cells.length - 1];
    ed.cx = h[0]; ed.cy = h[1];
    sfxUndo();
    trackChanged();
  }
  let clearArmed = 0;
  function edClear() {
    if (clearArmed <= 0) { clearArmed = 2.5; sfxSelect(); return; }   // needs a second tap
    clearArmed = 0;
    const old = edTrack();
    save.my[ed.slot] = Object.assign(blankTrack(), { theme: old.theme, hills: old.hills, name: old.name });
    ed.cx = 2; ed.cy = 6;
    sfxUndo();
    trackChanged();
  }
  function edTheme() {
    const t = edTrack();
    t.theme = THEME_KEYS[(THEME_KEYS.indexOf(t.theme) + 1) % THEME_KEYS.length];
    setSong(t.theme);
    sfxSelect();
    trackChanged();
  }
  function edHills() {
    const t = edTrack();
    t.hills = ((t.hills == null ? 1 : t.hills) + 1) % 3;
    sfxSelect();
    trackChanged();
  }
  function edSlot() {
    commitName();
    ed.slot = (ed.slot + 1) % 3;
    const h = edTrack().cells[edTrack().cells.length - 1];
    ed.cx = h[0]; ed.cy = h[1];
    ed.dirty = 0.01;
    setSong(edTrack().theme);
    sfxSelect();
  }
  function edBrush(d) {
    ed.brush = BRUSHES[mod(BRUSHES.indexOf(ed.brush) + d, BRUSHES.length)];
    sfxSelect();
  }
  function edTest() {
    const t = edTrack();
    if (!t.closed) { sfxNope(); return; }
    commitName();
    sfxOk();
    startRace(t, { from: 'build', key: 'my' + ed.slot, order: 10 + ed.slot, board: t.name || 'MY TRACK ' + (ed.slot + 1) });
  }
  // arrows / D-pad: the road brush lays road; the others move a cursor round the grid
  function edNav(dx, dy) {
    const t = edTrack();
    if (ed.brush === 'road' && !t.closed) {
      const head = t.cells[t.cells.length - 1];
      if (!tryStep(head[0] + dx, head[1] + dy)) sfxNope();
    } else {
      ed.cx = clamp(ed.cx + dx, 0, GW - 1);
      ed.cy = clamp(ed.cy + dy, 0, GH - 1);
      sfxSelect();
    }
  }
  function edApply() {
    if (ed.brush === 'road') { if (!edTrack().closed) stepToward(ed.cx, ed.cy); else sfxNope(); }
    else paintCell(ed.cx, ed.cy, true);
  }
  function gridCell(p) {
    const x = Math.floor((p.x - GX) / GS), y = Math.floor((p.y - GY) / GS);
    return x >= 0 && y >= 0 && x < GW && y < GH ? [x, y] : null;
  }

  // the track's name, typed into a box over the 3D view
  const nameBox = document.createElement('input');
  nameBox.type = 'text';
  nameBox.maxLength = 12;
  nameBox.placeholder = 'TRACK NAME';
  nameBox.autocomplete = 'off';
  nameBox.spellcheck = false;
  nameBox.hidden = true;
  nameBox.style.cssText = 'position:absolute;left:' + (PV.x / W * 100) + '%;top:' + ((PV.y + PV.h / 2 - 13) / H * 100) + '%;width:' +
    (PV.w / W * 100) + '%;height:' + (26 / H * 100) + "%;font:bold clamp(11px,2.2vw,20px) 'Courier New',Courier,monospace;" +
    'letter-spacing:2px;text-align:center;text-transform:uppercase;color:#ffe14f;background:rgba(10,12,40,0.94);' +
    'border:3px solid #5ff3ff;border-radius:8px;outline:none;-webkit-user-select:text;user-select:text;z-index:5;touch-action:manipulation;';
  stage.appendChild(nameBox);
  function editName() {
    nameBox.value = edTrack().name || '';
    nameBox.hidden = false;
    nameBox.focus();
  }
  function commitName() {
    if (nameBox.hidden) return;
    edTrack().name = nameBox.value.toUpperCase().replace(/[^A-Z0-9 '!]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
    nameBox.hidden = true;
    nameBox.blur();
    writeSave();
  }
  nameBox.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') commitName();
    else if (e.key === 'Escape') { nameBox.hidden = true; nameBox.blur(); }
  });
  nameBox.addEventListener('blur', commitName);
  nameBox.addEventListener('pointerdown', (e) => e.stopPropagation());

  // ---------- Input ----------
  const touch = MickleTouch.create({
    defaultOn: looksLikeTablet,   // a tablet starts with the stick and buttons showing
    toggleParent: document.getElementById('topbar'),
    buttons: [{ id: 'hop', label: 'HOP' }, { id: 'item', label: 'ITEM' }],
    onPress(id) {
      unlockAudio();
      if (mode !== 'race' || !race || race.results) return;
      queued[0][id] = true;
    },
    onStep(dx) { if (mode !== 'race') nav(dx, 0); },
  });

  function setSpeed(i) {
    save.speed = mod(i, SPEEDS.length);
    writeSave();
    sfxSelect();
  }
  function nav(dx, dy) {
    if (mode === 'title') { titleSel = mod(titleSel + (dy || dx), 5); sfxSelect(); }
    else if (mode === 'racer') {
      if (dy) { rowSel = mod(rowSel + dy, 3); sfxSelect(); } else cycleRow(dx);
    } else if (mode === 'track') {
      if (dx) {
        const list = trackList();
        trackSel = mod(trackSel + dx, list.length);
        buildWorld(list[trackSel].def);
        setSong(list[trackSel].def.theme);
        sfxSelect();
      } else if (dy) setSpeed(save.speed - dy);
    } else if (mode === 'gpintro') { if (dy || dx) setSpeed(save.speed + (dx || -dy)); }
    else if (mode === 'build') edNav(dx, dy);
  }
  function primary() {
    if (mode === 'title') titleChoose(titleSel);
    else if (mode === 'racer') pickNext();
    else if (mode === 'track') raceSelected();
    else if (mode === 'gpintro') { sfxOk(); startGP(); }
    else if (mode === 'build') edApply();
    else if (mode === 'race') { if (race.results) resultsPrimary(); }
    else if (mode === 'cup') { sfxOk(); hideAll(); startGP(); }   // the lit-up PLAY AGAIN button
  }
  function back() {
    if (mode === 'racer') { sfxUndo(); if (pickIdx > 0) { pickIdx--; rowSel = 0; showRacer(); } else toTitle(); }
    else if (mode === 'track' || mode === 'gpintro') { sfxUndo(); pickIdx = save.players - 1; toRacer(); }
    else if (mode === 'build') { sfxUndo(); commitName(); toTitle(); }
    else if (mode === 'race') { sfxUndo(); leaveRace(); }
    else if (mode === 'cup') { sfxUndo(); toTitle(); }
  }

  // ---------- Pause (mid-race): P / Esc / START, or the II button on the screen ----------
  let paused = false, pauseSel = 0;
  const PAUSE_ITEMS = ['RESUME', 'START AGAIN', 'QUIT TO MENU'];
  function setPaused(v) {
    paused = !!v && mode === 'race' && !!race && !race.results && !race.demo;
    pauseSel = 0;
    hudT = 1;                                  // redraw the HUD straight away
    for (const id in steerTouches) delete steerTouches[id];
    queued.forEach((q) => { q.hop = q.item = false; });
    touch.show(mode === 'race' && !paused && !!race && !race.results);
    if (engine) engine.gain.gain.value = 0;
    sfxSelect();
  }
  function pauseChoose(i) {
    const r = race;
    paused = false;
    if (i === 0) { setPaused(false); return; }
    if (i === 1) { sfxOk(); startRace(r.def, { from: r.from, key: r.key, order: r.order, board: r.board }); return; }
    sfxUndo();
    toTitle();
  }

  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.closest && e.target.closest('input, textarea')) return;
    unlockAudio();
    const c = e.code;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space', 'Tab'].includes(c)) e.preventDefault();
    const was = keys[c];
    keys[c] = true;
    if (was) return;
    if (c === 'KeyM') { setMusic(!save.music); return; }
    if (mode === 'race' && race && !race.results) {
      if (paused) {
        if (c === 'ArrowUp' || c === 'KeyW') { pauseSel = mod(pauseSel - 1, PAUSE_ITEMS.length); sfxSelect(); }
        else if (c === 'ArrowDown' || c === 'KeyS') { pauseSel = mod(pauseSel + 1, PAUSE_ITEMS.length); sfxSelect(); }
        else if (c === 'Space' || c === 'Enter') pauseChoose(pauseSel);
        else if (c === 'Escape' || c === 'Backspace' || c === 'KeyP') setPaused(false);
        hudT = 1;
        return;
      }
      if (c === 'Escape' || c === 'Backspace' || c === 'KeyP') { setPaused(true); return; }
      for (let s = 0; s < 2; s++) {
        const pi = twoUp() ? s : 0;
        if (KEYS.hop[s].includes(c)) queued[pi].hop = true;
        if (KEYS.item[s].includes(c)) queued[pi].item = true;
      }
      return;
    }
    if (c === 'ArrowLeft' || c === 'KeyA') nav(-1, 0);
    else if (c === 'ArrowRight' || c === 'KeyD') nav(1, 0);
    else if (c === 'ArrowUp' || c === 'KeyW') nav(0, -1);
    else if (c === 'ArrowDown' || c === 'KeyS') nav(0, 1);
    if (c === 'Space' || c === 'Enter') primary();
    else if (c === 'Escape') back();
    else if (c === 'Backspace') { if (mode === 'build') edUndo(); else back(); }
    else if (mode === 'build') {
      if (c === 'KeyZ') edUndo();
      else if (c === 'KeyT') edTheme();
      else if (c === 'KeyH') edHills();
      else if (c === 'KeyR') edTest();
      else if (c === 'KeyN') edSlot();
      else if (c === 'Tab' || c === 'KeyE') edBrush(e.shiftKey ? -1 : 1);
      else if (c === 'KeyQ') edBrush(-1);
      else if (/^Digit\d$/.test(c)) { const n = +c.slice(5); ed.brush = BRUSHES[(n + 9) % 10]; sfxSelect(); }
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function hudPoint(e) {
    const r = hud.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  let hudButtons = [];
  stage.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (e.target === nameBox) return;
    const p = hudPoint(e);
    const btn = hudButtons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (btn) { btn.fn(); e.preventDefault(); return; }
    if (mode === 'build') {
      const c = gridCell(p);
      if (!c) return;
      ed.drag = e.pointerId; ed.moved = false; ed.downCell = c; ed.last = c.join(',');
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
      if (ed.brush !== 'road') paintCell(c[0], c[1], true);
    } else if (mode === 'race' && race && !race.results && !paused) {
      // no on-screen controls: hold the left or right side of your half of the screen to steer
      steerTouches[e.pointerId] = { pi: twoUp() && p.y > H / 2 ? 1 : 0, dir: p.x < W / 2 ? -1 : 1 };
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (mode === 'build' && e.pointerId === ed.drag) {
      const c = gridCell(hudPoint(e));
      if (!c || c.join(',') === ed.last) return;
      ed.last = c.join(',');
      ed.moved = true;
      if (ed.brush === 'road') stepToward(c[0], c[1]); else paintCell(c[0], c[1], false);
    } else if (e.pointerId in steerTouches) {
      steerTouches[e.pointerId].dir = hudPoint(e).x < W / 2 ? -1 : 1;
    }
  });
  const endPointer = (e) => {
    delete steerTouches[e.pointerId];
    if (e.pointerId !== ed.drag) return;
    ed.drag = null;
    if (mode !== 'build' || ed.moved || e.type === 'pointercancel' || ed.brush !== 'road') return;
    // a plain tap with the road brush: the road heads there
    if (!edTrack().closed) stepToward(ed.downCell[0], ed.downCell[1]);
  };
  stage.addEventListener('pointerup', endPointer);
  stage.addEventListener('pointercancel', endPointer);

  function pollPad() {
    const B = Pad360.BTN, P2 = Pad360.pad(1);
    const P = (b) => Pad360.pressed(b) || P2.pressed(b);
    if (mode === 'race' && race && !race.results) {       // driving is read in humanInput
      if (paused) {
        const d = Pad360.dyPressed() || P2.dyPressed();
        if (d) { pauseSel = mod(pauseSel + d, PAUSE_ITEMS.length); sfxSelect(); hudT = 1; }
        if (P(B.A)) pauseChoose(pauseSel);
        else if (P(B.B) || P(B.START) || P(B.BACK)) setPaused(false);
      } else if (P(B.BACK) || P(B.START)) setPaused(true);
      return;
    }
    const dx = Pad360.dxPressed() || P2.dxPressed(), dy = Pad360.dyPressed() || P2.dyPressed();
    if (dx || dy) nav(dx, dx ? 0 : dy);
    if (P(B.A) || P(B.START)) primary();
    if (mode === 'build') {
      if (P(B.B)) edUndo();
      if (P(B.X)) edTheme();
      if (P(B.Y)) edTest();
      if (P(B.LB)) edBrush(-1);
      if (P(B.RB)) edBrush(1);
      if (P(B.BACK)) back();
    } else if (P(B.B) || P(B.BACK)) back();
  }

  // ---------- HUD ----------
  const FONT = "'Courier New', Courier, monospace";
  function text(str, x, y, px, color, align = 'left', outline) {
    hctx.font = 'bold ' + px + 'px ' + FONT;
    hctx.textAlign = align;
    hctx.textBaseline = 'middle';
    if (outline) {
      hctx.lineJoin = 'round';
      hctx.lineWidth = Math.max(2, px / 5);
      hctx.strokeStyle = outline;
      hctx.strokeText(str, x, y);
    }
    hctx.fillStyle = color;
    hctx.fillText(str, x, y);
  }
  function rr(x, y, w, h, r) {
    hctx.beginPath();
    hctx.moveTo(x + r, y);
    hctx.arcTo(x + w, y, x + w, y + h, r);
    hctx.arcTo(x + w, y + h, x, y + h, r);
    hctx.arcTo(x, y + h, x, y, r);
    hctx.arcTo(x, y, x + w, y, r);
    hctx.closePath();
  }
  function panel(x, y, w, h, fill = 'rgba(12,10,40,0.78)', line = '#5ff3ff') {
    rr(x, y, w, h, 7);
    hctx.fillStyle = fill; hctx.fill();
    if (line) { hctx.lineWidth = 1.5; hctx.strokeStyle = line; hctx.stroke(); }
  }
  function button(label, x, y, w, h, fn, o = {}) {
    if (o.go && !o.off) return goButton(label, x, y, w, h, fn, o);
    const color = o.off ? '#7a7f96' : o.color || '#5ff3ff';
    rr(x, y, w, h, Math.min(8, h / 2));
    hctx.fillStyle = o.sel ? color : 'rgba(12,10,40,0.85)'; hctx.fill();
    hctx.lineWidth = 2; hctx.strokeStyle = color; hctx.stroke();
    text(label, x + w / 2, y + h / 2 + 0.5, o.px || 10, o.sel ? '#120b28' : color, 'center');
    hudButtons.push({ x, y, w, h, fn });
  }
  // The "let's go" button on every screen: bright green with a dark edge, a white rim, a shadow
  // and a gentle pulse, so it stands out on any background (the yellow stage, sand, snow, sky).
  function goButton(label, x, y, w, h, fn, o) {
    const p = 1 + Math.sin(spin * 4) * 0.035;
    const cx = x + w / 2, cy = y + h / 2, pw = w * p, ph = h * p, px = cx - pw / 2, py = cy - ph / 2, r = Math.min(9, ph / 2);
    rr(px + 1, py + 3, pw, ph, r);
    hctx.fillStyle = 'rgba(0,0,0,0.45)'; hctx.fill();
    rr(px, py, pw, ph, r);
    const grad = hctx.createLinearGradient(0, py, 0, py + ph);
    grad.addColorStop(0, '#5cf07a'); grad.addColorStop(1, '#17a43e');
    hctx.fillStyle = grad; hctx.fill();
    hctx.lineWidth = 3; hctx.strokeStyle = '#120b28'; hctx.stroke();
    rr(px + 2.5, py + 2.5, pw - 5, ph - 5, Math.max(2, r - 2.5));
    hctx.lineWidth = 1.5; hctx.strokeStyle = '#ffffff'; hctx.stroke();
    text(label, cx, cy + 0.5, (o.px || 12) * p, '#ffffff', 'center', '#0d4a1e');
    hudButtons.push({ x, y, w, h, fn });
  }
  // Thumb spots, for holding a tablet in two hands: the button that moves you on is always in
  // the bottom-right corner and the one that goes back is always in the bottom-left.
  const GO = { x: 346, y: 228, w: 126, h: 34 }, BACK = { x: 8, y: 232, w: 84, h: 30 };
  const goBtn = (label, fn, o = {}) => button(label, GO.x, GO.y, GO.w, GO.h, fn, Object.assign({ go: true, px: 13 }, o));
  const backBtn = (label, fn, o = {}) => button(label, BACK.x, BACK.y, BACK.w, BACK.h, fn, Object.assign({ px: 10 }, o));
  function coinIcon(x, y, r = 5) {
    hctx.beginPath(); hctx.arc(x, y, r, 0, TAU); hctx.fillStyle = '#ffd23f'; hctx.fill();
    hctx.lineWidth = 1.2; hctx.strokeStyle = '#a86800'; hctx.stroke();
    hctx.beginPath(); hctx.arc(x - r * 0.45, y - r * 0.3, r * 0.28, 0, TAU); hctx.arc(x + r * 0.45, y - r * 0.3, r * 0.28, 0, TAU);
    hctx.fillStyle = '#a86800'; hctx.fill();
  }
  const fmtTime = (s) => Math.floor(s / 60) + ':' + (s % 60).toFixed(2).padStart(5, '0');
  const CUP = ['#ffd23f', '#d8dde6', '#e09050'];
  function drawCup(x, y, s, place) {
    hctx.fillStyle = CUP[place - 1] || '#8fe36b';
    hctx.beginPath();
    hctx.moveTo(x - 12 * s, y - 14 * s); hctx.lineTo(x + 12 * s, y - 14 * s);
    hctx.quadraticCurveTo(x + 12 * s, y + 4 * s, x, y + 5 * s);
    hctx.quadraticCurveTo(x - 12 * s, y + 4 * s, x - 12 * s, y - 14 * s);
    hctx.fill();
    hctx.fillRect(x - 2.5 * s, y + 4 * s, 5 * s, 7 * s);
    hctx.fillRect(x - 9 * s, y + 10 * s, 18 * s, 4 * s);
    hctx.lineWidth = 2.5 * s; hctx.strokeStyle = CUP[place - 1] || '#8fe36b';
    hctx.beginPath(); hctx.arc(x - 12 * s, y - 7 * s, 5 * s, PI * 0.5, PI * 1.5); hctx.stroke();
    hctx.beginPath(); hctx.arc(x + 12 * s, y - 7 * s, 5 * s, -PI * 0.5, PI * 0.5); hctx.stroke();
    text(String(place), x, y - 5 * s, 11 * s, '#120b28', 'center');
  }

  // the road of the track, drawn small, with dots for the karts
  function miniMap(x, y, w, karts) {
    const T = world;
    if (T.arena) {
      // the arena from above: the wall, the big things and everyone's dot
      const A = T.arena, sc = w / (A.R * 2.1), cx = x + w / 2, cy = y + w / 2 - 4;
      hctx.beginPath();
      if (A.shape === 'square') hctx.rect(cx - A.R * sc, cy - A.R * sc, A.R * 2 * sc, A.R * 2 * sc);
      else hctx.arc(cx, cy, A.R * sc, 0, TAU);
      hctx.fillStyle = 'rgba(12,10,40,0.55)'; hctx.fill();
      hctx.lineWidth = 2; hctx.strokeStyle = '#ffffff'; hctx.stroke();
      hctx.fillStyle = 'rgba(255,255,255,0.45)';
      A.pieces.forEach((q) => {
        if (q.kind === 'rail') return;
        hctx.save();
        hctx.translate(cx + q.x * sc, cy + q.z * sc);
        hctx.rotate(-q.ang);
        hctx.fillStyle = 'rgba(255,255,255,' + (0.2 + Math.max(q.y1, q.y2) * 0.035).toFixed(2) + ')';
        hctx.fillRect(-q.hl * sc, -q.hw * sc, q.hl * 2 * sc, q.hw * 2 * sc);
        hctx.restore();
      });
      hctx.fillStyle = 'rgba(255,255,255,0.45)';
      A.blocks.forEach((b) => { hctx.beginPath(); hctx.arc(cx + b.x * sc, cy + b.z * sc, Math.max(1.5, b.r * sc), 0, TAU); hctx.fill(); });
      karts.slice().sort((a, b) => (a.pi != null) - (b.pi != null)).forEach((k) => {
        if (k.crowned) { hctx.beginPath(); hctx.arc(cx + k.x * sc, cy + k.z * sc, 5.5, 0, TAU); hctx.lineWidth = 2; hctx.strokeStyle = '#ffd23f'; hctx.stroke(); }
        hctx.beginPath();
        hctx.arc(cx + k.x * sc, cy + k.z * sc, k.pi != null ? 3.4 : 2.4, 0, TAU);
        hctx.fillStyle = hex(kartColor(k.model)); hctx.fill();
        hctx.lineWidth = 1; hctx.strokeStyle = k.pi != null ? '#ffffff' : '#120b28'; hctx.stroke();
      });
      return;
    }
    const s = w / (GW * CELL);
    const mx = (wx) => x + (wx + GW * CELL / 2) * s, my = (wz) => y + (wz + GH * CELL / 2) * s;
    hctx.lineJoin = 'round';
    for (const [lw, col] of [[5, 'rgba(12,10,40,0.75)'], [2.4, '#ffffff']]) {
      hctx.beginPath();
      for (let i = 0; i <= T.N; i += 3) {
        const j = i % T.N;
        if (i === 0) hctx.moveTo(mx(T.px[j]), my(T.pz[j])); else hctx.lineTo(mx(T.px[j]), my(T.pz[j]));
      }
      hctx.closePath();
      hctx.lineWidth = lw; hctx.strokeStyle = col; hctx.stroke();
    }
    hctx.fillStyle = '#ffe14f';
    hctx.fillRect(mx(T.px[0]) - 2, my(T.pz[0]) - 2, 4, 4);
    karts.slice().sort((a, b) => (a.pi != null) - (b.pi != null)).forEach((k) => {
      hctx.beginPath();
      hctx.arc(mx(k.x), my(k.z), k.pi != null ? 3.4 : 2.4, 0, TAU);
      hctx.fillStyle = hex(kartColor(k.model)); hctx.fill();
      hctx.lineWidth = 1; hctx.strokeStyle = k.pi != null ? '#ffffff' : '#120b28'; hctx.stroke();
    });
  }

  function drawItemIcon(it, x, y, s = 1) {
    hctx.save();
    hctx.translate(x, y);
    hctx.scale(s, s);
    const carrot = (ox, oy, k) => {
      hctx.fillStyle = '#ff8a1e';
      hctx.beginPath(); hctx.moveTo(ox - 7 * k, oy - 4 * k); hctx.lineTo(ox + 5 * k, oy - 7 * k); hctx.lineTo(ox - 2 * k, oy + 9 * k); hctx.closePath(); hctx.fill();
      hctx.fillStyle = '#3fae5a';
      hctx.fillRect(ox - 3 * k, oy - 11 * k, 3 * k, 6 * k); hctx.fillRect(ox + 1 * k, oy - 12 * k, 3 * k, 6 * k);
    };
    if (it === 'carrot') carrot(0, 0, 1);
    else if (it === 'carrot3') { carrot(-6, 3, 0.6); carrot(0, -2, 0.6); carrot(6, 3, 0.6); }
    else if (it === 'snowball') {
      hctx.beginPath(); hctx.arc(0, 0, 8, 0, TAU); hctx.fillStyle = '#ffffff'; hctx.fill();
      hctx.beginPath(); hctx.arc(2, 2, 5, 0, TAU); hctx.fillStyle = '#dbe9f6'; hctx.fill();
    } else if (it === 'honey') {
      hctx.fillStyle = '#ffb81e';
      hctx.beginPath(); hctx.ellipse(0, 3, 10, 5, 0, 0, TAU); hctx.fill();
      hctx.fillStyle = '#ffe14f';
      hctx.beginPath(); hctx.ellipse(-2, 2, 5, 2, 0, 0, TAU); hctx.fill();
    } else if (it === 'shield') {
      hctx.beginPath(); hctx.arc(0, 0, 9, 0, TAU); hctx.fillStyle = 'rgba(127,232,255,0.45)'; hctx.fill();
      hctx.lineWidth = 2; hctx.strokeStyle = '#7fe8ff'; hctx.stroke();
      hctx.beginPath(); hctx.arc(-3, -3, 2.5, 0, TAU); hctx.fillStyle = '#ffffff'; hctx.fill();
    } else if (it === 'shrink') {
      hctx.fillStyle = '#ffe14f';
      hctx.beginPath();
      for (let i = 0; i < 10; i++) { const r = i % 2 ? 4 : 10, a = i / 10 * TAU - PI / 2; hctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      hctx.closePath(); hctx.fill();
    }
    hctx.restore();
  }

  function speedLines(x0, y0, w, h) {
    hctx.save();
    hctx.beginPath(); hctx.rect(x0, y0, w, h); hctx.clip();
    hctx.strokeStyle = 'rgba(255,255,255,0.55)';
    hctx.lineWidth = 1.5;
    const cx = x0 + w / 2, cy = y0 + h * 0.55, r0 = w * 0.42;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU, r1 = r0 + rand(0, 20), r2 = r1 + rand(25, 70);
      hctx.beginPath();
      hctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1 * (h / w) * 1.2);
      hctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2 * (h / w) * 1.2);
      hctx.stroke();
    }
    hctx.restore();
  }

  function drawTitle() {
    const g = hctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(12,10,40,0.7)'); g.addColorStop(0.5, 'rgba(12,10,40,0)'); g.addColorStop(1, 'rgba(12,10,40,0.7)');
    hctx.fillStyle = g; hctx.fillRect(0, 0, W, H);
    text('FREDDY BEAR', W / 2, 34, 32, '#ffe14f', 'center', '#120b28');
    text('KART 3D', W / 2, 70, 38, '#ff7a1e', 'center', '#120b28');
    // RACE! under the right thumb, the others under the left
    goBtn('RACE!', () => titleChoose(0), { go: titleSel === 0, color: '#ffe14f', px: 16 });
    button('GRAND PRIX', 8, 164, 130, 28, () => titleChoose(1), { go: titleSel === 1, color: '#ff9a2e', px: 12 });
    button('BALLOON BATTLE', 8, 198, 130, 28, () => titleChoose(2), { go: titleSel === 2, color: '#ff7ab8', px: 11 });
    button('BUILD A TRACK', 8, 232, 130, 30, () => titleChoose(3), { go: titleSel === 3, color: '#5ff3ff', px: 12 });
    button(save.players === 2 ? 'PLAYERS: 2 (SPLIT SCREEN)' : 'PLAYERS: 1', 148, 238, 188, 22, () => titleChoose(4),
      { sel: titleSel === 4, color: '#8fe36b', px: 9 });
    coinIcon(440, 16, 6);
    text(String(save.coins), 452, 16.5, 12, '#ffe14f', 'left', '#120b28');
    text('A MICKLEKIDS GAME', W / 2, 94, 8, '#ffffff', 'center', '#120b28');
  }

  function statPips(label, v, x, y) {
    text(label, x, y, 8, '#ffffff', 'left', '#120b28');
    const n = clamp(Math.round((v - 0.86) / 0.3 * 4) + 1, 1, 5);
    for (let i = 0; i < 5; i++) {
      rr(x + 36 + i * 11, y - 4, 9, 8, 2);
      hctx.fillStyle = i < n ? '#ffe14f' : 'rgba(255,255,255,0.2)'; hctx.fill();
    }
  }
  function nextUnlock(list) {
    const next = list.filter((x) => !x.gold && !isUnlocked(x)).sort((a, b) => a.coins - b.coins)[0];
    return next ? next.name + ' AT ' + next.coins + ' COINS' : '';
  }
  function drawRacer() {
    const l = save.look[pickIdx], d = RACERS[l.racer];
    const who = save.players === 2 ? 'PLAYER ' + (pickIdx + 1) + ': ' : '';
    text(who + 'PICK YOUR RACER', W / 2, 18, 15, pickIdx ? '#8fe36b' : '#ffe14f', 'center', '#120b28');
    coinIcon(440, 16, 6);
    text(String(save.coins), 452, 16.5, 12, '#ffe14f', 'left', '#120b28');
    panel(18, 44, 108, 54);
    statPips('SPEED', d.top * 1.05 - 0.05, 26, 58);
    statPips('ZOOM', d.acc, 26, 72);
    statPips('TURN', d.turn, 26, 86);
    button('◀', 8, 108, 40, 48, () => { rowSel = 0; cycleRow(-1); }, { px: 20 });
    button('▶', 432, 108, 40, 48, () => { rowSel = 0; cycleRow(1); }, { px: 20 });
    const hat = HATS.find((h) => h.id === l.hat) || HATS[0], paint = PAINTS.find((p) => p.id === l.paint) || PAINTS[0];
    const rows = [d.name, 'HAT: ' + hat.name, 'KART: ' + paint.name];
    rows.forEach((s, i) => {
      const y = 166 + i * 19, sel = rowSel === i;
      if (i === 0) {
        text(s, W / 2, y, 20, sel ? '#ffe14f' : '#ffffff', 'center', '#120b28');
        hudButtons.push({ x: 140, y: y - 10, w: 200, h: 20, fn: () => { rowSel = 0; cycleRow(1); } });
      } else {
        button((sel ? '◀ ' : '') + s + (sel ? ' ▶' : ''), 150, y - 8, 180, 16, () => { rowSel = i; cycleRow(1); },
          { px: 9, sel, color: i === 1 ? '#ff9ad6' : '#4fd0ff' });
      }
    });
    const nu = nextUnlock(rowSel === 2 ? PAINTS : HATS);
    if (nu) text('NEXT: ' + nu, W / 2, 222, 7, '#ffffff', 'center', '#120b28');
    backBtn('BACK', back);
    goBtn(pickIdx < save.players - 1 ? 'NEXT PLAYER' : 'THIS ONE!', pickNext);
  }

  function drawTrackPick() {
    const list = trackList(), t = list[trackSel], battle = flow === 'battle';
    text(battle ? 'BALLOON BATTLE: PICK AN ARENA' : 'PICK A TRACK', W / 2, 22, battle ? 15 : 18, battle ? '#ff7ab8' : '#ffe14f', 'center', '#120b28');
    button('◀', 8, 108, 40, 48, () => nav(-1, 0), { px: 20 });
    button('▶', 432, 108, 40, 48, () => nav(1, 0), { px: 20 });
    panel(110, 176, 260, 50);
    text(t.name, W / 2, 190, 16, '#ffffff', 'center');
    const best = save.best[t.key], place = save.cups[t.key];
    text(battle ? 'POP THE MOST BALLOONS IN ' + BATTLE_T / 60 + ' MINUTES!' : best ? 'BEST ' + fmtTime(best) : (THEMES[t.def.theme] || THEMES.meadow).name + ' · ' + LAPS + ' LAPS',
      W / 2, 212, battle ? 9 : 10, '#5ff3ff', 'center');
    if (place && place <= 3) drawCup(352, 194, 0.6, place);
    text((trackSel + 1) + ' / ' + list.length, W / 2, 166, 8, '#ffffff', 'center', '#120b28');
    backBtn('BACK', back);
    goBtn(battle ? 'BATTLE!' : 'START!', primary, { px: 15 });
    button('SPEED: ' + SPEEDS[save.speed].name, 100, 235, 116, 26, () => setSpeed(save.speed + 1), { px: 9, color: ['#8fe36b', '#ffe14f', '#ff7a6b'][save.speed] });
  }

  function drawGpIntro() {
    hctx.fillStyle = 'rgba(12,10,40,0.35)'; hctx.fillRect(0, 0, W, H);
    text('GRAND PRIX', W / 2, 26, 24, '#ff9a2e', 'center', '#120b28');
    panel(120, 42, 240, 180);
    text(BUILTIN.length + ' RACES IN A ROW', W / 2, 56, 11, '#ffe14f', 'center');
    BUILTIN.forEach((d, i) => text((i + 1) + '. ' + d.name, 150, 76 + i * 16, 11, '#ffffff'));
    text('POINTS: ' + POINTS.join(' '), W / 2, 76 + BUILTIN.length * 16 + 6, 9, '#5ff3ff', 'center');
    text('MOST POINTS WINS THE GOLD CUP', W / 2, 76 + BUILTIN.length * 16 + 20, 8, '#ffffff', 'center');
    const best = save.gp['s' + save.speed];
    if (best) { drawCup(338, 66, 0.6, best); text('BEST', 338, 86, 7, '#ffffff', 'center'); }
    if (!save.gold) text('WIN IT TO UNLOCK THE GOLDEN KART!', W / 2, 76 + BUILTIN.length * 16 + 34, 8, '#ffd23f', 'center');
    backBtn('BACK', back);
    goBtn('START!', primary, { px: 15 });
    button('SPEED: ' + SPEEDS[save.speed].name, 100, 235, 116, 26, () => setSpeed(save.speed + 1), { px: 9, color: ['#8fe36b', '#ffe14f', '#ff7a6b'][save.speed] });
  }

  // one player's part of the race screen; two players get half the height each
  function drawView(k, x0, y0, w, h, i) {
    const r = race, small = h < H, s = small ? 0.62 : 1;
    if (k.boost > 0 && r.state === 'go') speedLines(x0, y0, w, h);
    const lx = x0 + (i === 0 ? 34 : 10) * (small && i ? 1 : 1);
    if (small) text('P' + (k.pi + 1), lx, y0 + 12, 9, k.pi ? '#8fe36b' : '#ffe14f', 'left', '#120b28');
    const px = small ? lx + 20 : lx;
    text(ORD[k.place - 1], px, y0 + 18 * s + (small ? 0 : 2), 26 * s, k.place === 1 ? '#ffe14f' : '#ffffff', 'left', '#120b28');
    if (k.crowned) crownIcon(px + 66 * s, y0 + 16 * s + (small ? 0 : 2), 1.3 * s);
    if (r.battle) {
      // the balloons you have left, and how many you've popped
      const by = y0 + (small ? 30 : 44), col = hex(kartColor(k.model));
      for (let b = 0; b < 3; b++) {
        const bx = lx + 4 + b * 10 * s + (small ? 0 : 1);
        hctx.beginPath(); hctx.ellipse(bx, by - 1, 4 * s + 0.6, 5 * s + 0.6, 0, 0, TAU);
        hctx.fillStyle = b < k.balloons ? col : 'rgba(255,255,255,0.15)'; hctx.fill();
        hctx.lineWidth = 1; hctx.strokeStyle = '#120b28'; hctx.stroke();
      }
      text('POPS ' + k.score, lx + 36 * s + 2, by, 10 * s + 1, '#ff9ad6', 'left', '#120b28');
    } else text('LAP ' + clamp(k.lap, 1, LAPS) + '/' + LAPS, lx, y0 + (small ? 30 : 44), 11 * s + (small ? 1 : 0), '#5ff3ff', 'left', '#120b28');
    coinIcon(lx + 4, y0 + (small ? 43 : 60), 5 * s + 1);
    text(String(k.coins), lx + 12, y0 + (small ? 43.5 : 60.5), 11 * s + 1, '#ffe14f', 'left', '#120b28');
    // item box -- tap it to use the item
    const bs = 34 * s + (small ? 4 : 0), bx = x0 + w / 2 - bs / 2, by = y0 + 5;
    panel(bx, by, bs, bs, 'rgba(12,10,40,0.7)', k.item ? '#ffe14f' : '#5ff3ff');
    if (k.item) {
      drawItemIcon(k.item, x0 + w / 2, by + bs / 2, bs / 34);
      if (k.item === 'carrot3') text('x' + k.uses, bx + bs + 2, by + bs - 4, 8, '#ffffff', 'left', '#120b28');
      text(ITEM_NAME[k.item], x0 + w / 2, by + bs + 7, 8 * s + 1, '#ffe14f', 'center', '#120b28');
      const pi = k.pi;
      hudButtons.push({ x: bx - 10, y: by - 5, w: bs + 20, h: bs + 20, fn: () => { queued[pi].item = true; } });
    }
    const cy = y0 + h * 0.4;
    if (r.state === 'count' && r.count < 3) {
      text(String(Math.max(1, Math.ceil(r.count))), x0 + w / 2, cy, 64 * s, '#ffe14f', 'center', '#120b28');
      text(r.battle ? 'HIT THEM WITH ITEMS TO POP THEIR BALLOONS!' : 'PRESS HOP ON GO FOR A ROCKET START!', x0 + w / 2, cy + 40 * s, 9 * s + 1, '#ffffff', 'center', '#120b28');
    } else if (k.wrongT > 0.7 && r.state === 'go' && !k.finished) {
      const T = world, turn = wrapAngle(Math.atan2(T.tx[k.idx], T.tz[k.idx]) - k.h);
      if (Math.floor(r.t * 4) % 2 === 0) text('WRONG WAY!', x0 + w / 2, cy, 30 * s, '#ff5c5c', 'center', '#120b28');
      uTurn(x0 + w / 2, cy - 34 * s, 13 * s, turn > 0 ? -1 : 1);
    } else if (k.msgT > 0) {
      hctx.globalAlpha = Math.min(1, k.msgT * 3);
      text(k.msg, x0 + w / 2, cy, 30 * s, '#ffe14f', 'center', '#120b28');
      hctx.globalAlpha = 1;
    }
    if (k.rescue > 0) {
      const a = clamp(1 - Math.abs(RESCUE_T - k.rescue - RESCUE_SWAP) / 0.3, 0, 1);
      if (a > 0) { hctx.fillStyle = 'rgba(255,255,255,' + a.toFixed(2) + ')'; hctx.fillRect(x0, y0, w, h); }
    }
    if (k.drift && k.charge > 0.7) {
      text(k.charge > 1.5 ? 'SUPER SPARKS!' : 'SPARKS!', x0 + w / 2, y0 + h - 14 * s, 10 * s + 2, k.charge > 1.5 ? '#ff9a2e' : '#4fc8ff', 'center', '#120b28');
    }
  }

  // a U-turn arrow that ends pointing down on the side to turn toward (dir -1 = left)
  function uTurn(x, y, rad, dir) {
    hctx.save();
    hctx.lineCap = 'round';
    for (const [col, lw] of [['#120b28', rad * 0.75], ['#ffe14f', rad * 0.42]]) {
      hctx.strokeStyle = col; hctx.lineWidth = lw;
      hctx.beginPath();
      hctx.moveTo(x - dir * rad, y + rad * 0.9);
      hctx.lineTo(x - dir * rad, y);
      hctx.arc(x, y, rad, dir < 0 ? 0 : PI, dir < 0 ? PI : 0, dir < 0);
      hctx.stroke();
      const ex = x + dir * rad, hw = lw * 1.25;
      hctx.fillStyle = col;
      hctx.beginPath();
      hctx.moveTo(ex - hw, y + rad * 0.15); hctx.lineTo(ex + hw, y + rad * 0.15); hctx.lineTo(ex, y + rad * 0.15 + hw * 1.3);
      hctx.closePath(); hctx.fill();
    }
    hctx.restore();
  }

  function crownIcon(x, y, sc) {
    hctx.save();
    hctx.translate(x, y); hctx.scale(sc, sc);
    hctx.beginPath();
    hctx.moveTo(-9, 6); hctx.lineTo(-10, -5); hctx.lineTo(-5, 0); hctx.lineTo(0, -8); hctx.lineTo(5, 0); hctx.lineTo(10, -5); hctx.lineTo(9, 6);
    hctx.closePath();
    hctx.fillStyle = '#ffd23f'; hctx.fill();
    hctx.lineWidth = 1.5; hctx.strokeStyle = '#120b28'; hctx.stroke();
    hctx.fillStyle = '#ff5c5c'; hctx.beginPath(); hctx.arc(0, 2, 1.8, 0, TAU); hctx.fill();
    hctx.restore();
  }
  // a race shows the time so far; a battle shows the time left
  function clockText(r) {
    if (!r.battle) return fmtTime(r.t);
    const left = Math.max(0, Math.ceil(r.limit - r.t));
    return Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0');
  }
  const clockColor = (r) => (r.battle && r.limit - r.t < 10.5 ? (Math.floor(r.t * 4) % 2 ? '#ff5c5c' : '#ffe14f') : '#ffffff');

  function drawRace() {
    const r = race;
    if (r.results) return drawResults();
    if (r.view.length > 1) {
      drawView(r.view[0], 0, 0, W, H / 2, 0);
      drawView(r.view[1], 0, H / 2, W, H / 2, 1);
      hctx.fillStyle = '#120b28'; hctx.fillRect(0, H / 2 - 1.5, W, 3);
      text(clockText(r), 472, 12, 10, clockColor(r), 'right', '#120b28');
      miniMap(398, 96, 76, r.karts);
    } else {
      drawView(r.view[0], 0, 0, W, H, 0);
      text(clockText(r), 472, 14, 11, clockColor(r), 'right', '#120b28');
      miniMap(392, 26, 80, r.karts);
    }
    drawConfetti(r.confetti);
    if (r.demo) return;
    if (!paused) { button('II', 362, 4, 24, 19, () => setPaused(true), { px: 11, color: '#ffffff' }); return; }
    // paused: only the pause panel's buttons take taps
    hudButtons = [];
    hctx.fillStyle = 'rgba(8,6,28,0.62)'; hctx.fillRect(0, 0, W, H);
    text('PAUSED', W / 2, 104, 30, '#ffe14f', 'center', '#120b28');
    // RESUME under the right thumb, QUIT under the left, START AGAIN in the middle
    goBtn(PAUSE_ITEMS[0], () => pauseChoose(0), { go: pauseSel === 0, color: '#5ff3ff' });
    button(PAUSE_ITEMS[1], 172, 138, 136, 30, () => pauseChoose(1), { go: pauseSel === 1, px: 12, color: '#5ff3ff' });
    backBtn(PAUSE_ITEMS[2], () => pauseChoose(2), { go: pauseSel === 2, color: '#ff9a8a', px: 9 });
  }
  function drawConfetti(list) {
    for (const c of list) {
      hctx.fillStyle = c.c;
      hctx.fillRect(c.x, c.y, c.s, c.s * 1.6);
    }
  }

  function drawResults() {
    const r = race, isGp = r.from === 'gp', mine = r.results.filter((x) => x.pi != null);
    hctx.fillStyle = 'rgba(12,10,40,0.45)'; hctx.fillRect(0, 0, W, H);
    panel(96, 8, 288, 218);
    const best = Math.min(...mine.map((x) => x.place));
    const title = isGp ? 'RACE ' + (gp.idx + 1) + ' OF ' + BUILTIN.length : r.battle && best === 1 ? (mine.length > 1 ? 'P' + (mine.find((x) => x.place === 1).pi + 1) + ' WINS!' : 'YOU WIN!')
      : best <= 3 ? ORD[best - 1] + ' PLACE!' : r.battle ? 'GOOD POPPING!' : 'NICE DRIVING!';
    text(title, W / 2, 26, 18, '#ffe14f', 'center');
    r.results.forEach((x, i) => {
      const y = 50 + i * 20;
      if (x.pi != null) { rr(104, y - 9, 272, 18, 5); hctx.fillStyle = 'rgba(255,225,79,0.22)'; hctx.fill(); }
      text(ORD[i], 112, y, 10, i < 3 ? CUP[i] : '#ffffff');
      if (r.battle && x.place === 1 && x.score > 0) crownIcon(140, y - 1, 0.55);
      hctx.beginPath(); hctx.arc(150, y, 5, 0, TAU); hctx.fillStyle = hex(x.color); hctx.fill();
      const tag = x.pi == null ? '' : r.view.length > 1 ? ' P' + (x.pi + 1) : ' (YOU)';
      text(x.name + tag, 160, y, 10, x.pi != null ? '#ffe14f' : '#ffffff');
      if (isGp) {
        text('+' + x.pts, 318, y, 10, '#8fe36b', 'right');
        text(String(gp.points[x.ri] || 0), 366, y, 10, '#5ff3ff', 'right');
      } else if (r.battle) text(x.score + (x.score === 1 ? ' POP' : ' POPS'), 366, y, 10, '#ff9ad6', 'right');
      else text(x.time ? fmtTime(x.time) : '', 366, y, 10, '#5ff3ff', 'right');
    });
    if (isGp) text('POINTS  TOTAL', 366, 38, 7, '#ffffff', 'right');
    let y = 176;
    if (r.battle) { text('+1 COIN FOR EVERY POP', W / 2, y, 8, '#ffffff', 'center'); y += 12; }
    if (r.newBest) { text('NEW BEST TIME!', W / 2, y, 10, '#8fe36b', 'center'); y += 14; }
    if (r.coinsWon) {
      coinIcon(W / 2 - 52, y, 5);
      text('+' + r.coinsWon + ' COINS (' + save.coins + ')', W / 2 - 44, y + 0.5, 10, '#ffd23f');
      y += 14;
    }
    if (r.unlocked.length) text('NEW: ' + r.unlocked.join(', ') + '!', W / 2, y, 10, '#ff9ad6', 'center');
    if (isGp) {
      backBtn('QUIT CUP', back);
      goBtn(gp.idx < BUILTIN.length - 1 ? 'NEXT RACE' : 'SEE THE CUP!', primary);
    } else {
      backBtn(r.from === 'build' ? 'BUILDER' : r.battle ? 'ARENAS' : 'TRACKS', back);
      goBtn(r.battle ? 'AGAIN!' : 'RACE AGAIN', primary);
    }
    drawConfetti(r.confetti);
  }

  function drawCupScreen() {
    const c = cup;
    text('GRAND PRIX!', W / 2, 24, 24, '#ffe14f', 'center', '#120b28');
    panel(10, 40, 128, 136);
    c.standings.forEach((s, i) => {
      const y = 54 + i * 20;
      text(ORD[i], 16, y, 9, i < 3 ? CUP[i] : '#ffffff');
      text(RACERS[s.ri].name, 40, y, 8, s.pi >= 0 ? '#ffe14f' : '#ffffff');
      text(String(s.pts), 132, y, 9, '#5ff3ff', 'right');
    });
    // one trophy panel each -- two players get them stacked so they don't overlap the podium
    const mine = c.standings.filter((s) => s.pi >= 0).sort((a, b) => a.pi - b.pi);
    const two = mine.length > 1;
    mine.forEach((s, i) => {
      const x = 386, y = two ? 42 + i * 84 : 44, h = two ? 78 : 92;
      panel(x - 46, y, 92, h);
      if (s.place <= 3) drawCup(x, y + (two ? 32 : 38), two ? 1.0 : 1.3, s.place);
      else text('GREAT TRY!', x, y + (two ? 32 : 38), 10, '#8fe36b', 'center');
      text(two ? 'P' + (s.pi + 1) + ' ' + ORD[s.place - 1] : ORD[s.place - 1] + ' PLACE', x, y + h - 12, 10, '#ffffff', 'center');
    });
    if (c.unlocked.length) text('NEW: ' + c.unlocked.join(', ') + '!', W / 2, 206, 11, '#ff9ad6', 'center', '#120b28');
    backBtn('MENU', back);
    goBtn('PLAY AGAIN', () => { sfxOk(); hideAll(); startGP(); });
    drawConfetti(c.confetti);
  }

  const brushIcon = {
    road: (x, y) => { hctx.fillStyle = '#565c68'; hctx.fillRect(x - 7, y - 3, 14, 6); hctx.fillStyle = '#ffe14f'; hctx.fillRect(x - 5, y - 0.5, 4, 1); hctx.fillRect(x + 1, y - 0.5, 4, 1); },
    boost: (x, y) => { hctx.beginPath(); hctx.arc(x, y, 6, 0, TAU); hctx.fillStyle = '#ff7a1e'; hctx.fill(); text('»', x, y, 10, '#fff36b', 'center'); },
    jump: (x, y) => { hctx.beginPath(); hctx.arc(x, y, 6, 0, TAU); hctx.fillStyle = '#4fd0ff'; hctx.fill(); text('▲', x, y, 8, '#ffffff', 'center'); },
    items: (x, y) => { rr(x - 5.5, y - 5.5, 11, 11, 3); hctx.fillStyle = '#b48cff'; hctx.fill(); text('?', x, y + 0.5, 9, '#ffffff', 'center'); },
    coins: (x, y) => coinIcon(x, y, 5.5),
    mud: (x, y) => { hctx.beginPath(); hctx.ellipse(x, y, 7, 4.5, 0, 0, TAU); hctx.fillStyle = '#6b4626'; hctx.fill(); },
    ice: (x, y) => { hctx.beginPath(); hctx.ellipse(x, y, 7, 4.5, 0, 0, TAU); hctx.fillStyle = '#bfeaff'; hctx.fill(); hctx.fillStyle = '#ffffff'; hctx.fillRect(x - 3, y - 1, 4, 1.4); },
    tunnel: (x, y) => { hctx.beginPath(); hctx.arc(x, y + 4, 7, PI, 0); hctx.fillStyle = '#8a5a3a'; hctx.fill(); hctx.beginPath(); hctx.arc(x, y + 4, 4, PI, 0); hctx.fillStyle = '#120b28'; hctx.fill(); },
    props: (x, y) => { hctx.fillStyle = '#ff8a1e'; hctx.beginPath(); hctx.moveTo(x - 4, y - 4); hctx.lineTo(x + 4, y - 4); hctx.lineTo(x, y + 7); hctx.fill(); hctx.fillStyle = '#3fae5a'; hctx.fillRect(x - 2, y - 8, 4, 4); },
    erase: (x, y) => { hctx.strokeStyle = '#ff7a6b'; hctx.lineWidth = 2.5; hctx.beginPath(); hctx.moveTo(x - 5, y - 5); hctx.lineTo(x + 5, y + 5); hctx.moveTo(x + 5, y - 5); hctx.lineTo(x - 5, y + 5); hctx.stroke(); },
  };
  const PROP_ICON = { carrot: '#ff8a1e', snowman: '#ffffff', umbrella: '#ff5c5c', lolly: '#ff7ac0', house: '#e0453a' };

  function drawBuild() {
    const t = edTrack(), th = THEMES[t.theme] || THEMES.meadow, n = t.cells.length;
    hctx.fillStyle = '#120b28'; hctx.fillRect(0, 0, W, H);
    text('BUILD A TRACK', 34, 14, 13, '#ffe14f');
    if (t.name) text('"' + t.name + '"', 180, 14.5, 10, '#ffffff');
    button('DONE', 414, 4, 58, 20, back, { px: 10 });
    // the grid
    rr(GX - 3, GY - 3, GW * GS + 6, GH * GS + 6, 6);
    hctx.fillStyle = th.ground; hctx.fill();
    hctx.fillStyle = th.groundA;
    for (let x = 0; x < GW; x++) for (let y = 0; y < GH; y++) {
      if ((x + y) % 2) hctx.fillRect(GX + x * GS, GY + y * GS, GS, GS);
    }
    const cx = (c) => GX + c[0] * GS + GS / 2, cy = (c) => GY + c[1] * GS + GS / 2;
    // props
    Object.keys(t.props).forEach((key) => {
      const c = key.split(',').map(Number), kind = t.props[key];
      hctx.beginPath(); hctx.arc(cx(c), cy(c), 7, 0, TAU); hctx.fillStyle = PROP_ICON[kind] || '#ffffff'; hctx.fill();
      text(kind[0].toUpperCase(), cx(c), cy(c) + 0.5, 8, '#120b28', 'center');
    });
    // the road (bridges drawn on top)
    hctx.lineJoin = hctx.lineCap = 'round';
    for (const [lw, col] of [[15, '#ffffff'], [12, '#565c68']]) {
      hctx.beginPath();
      t.cells.forEach((c, i) => { if (i) hctx.lineTo(cx(c), cy(c)); else hctx.moveTo(cx(c), cy(c)); });
      if (t.closed) hctx.closePath();
      hctx.lineWidth = lw; hctx.strokeStyle = col;
      if (n > 1) hctx.stroke(); else { hctx.fillStyle = col; hctx.beginPath(); hctx.arc(cx(t.cells[0]), cy(t.cells[0]), lw / 2, 0, TAU); hctx.fill(); }
    }
    crossings(t).forEach(([, i2]) => {
      const c = t.cells[i2], d = t.cells[(i2 + 1) % n] || c, horiz = d[1] === c[1];
      const w2 = horiz ? GS * 0.75 : 7, h2 = horiz ? 7 : GS * 0.75;
      hctx.fillStyle = '#9a9aa6'; hctx.fillRect(cx(c) - w2 - 1.5, cy(c) - h2 - 1.5, (w2 + 1.5) * 2, (h2 + 1.5) * 2);
      hctx.fillStyle = '#6a707c'; hctx.fillRect(cx(c) - w2, cy(c) - h2, w2 * 2, h2 * 2);
    });
    hctx.lineCap = 'butt';
    // things on the road
    Object.keys(t.extras).forEach((key) => {
      const c = t.cells[+key];
      if (c && brushIcon[t.extras[key]]) brushIcon[t.extras[key]](cx(c), cy(c));
    });
    // start flag (where the karts will line up)
    const s = t.cells[startCell(t)];
    hctx.fillStyle = '#ffffff'; hctx.fillRect(cx(s) - 6, cy(s) - 8, 2, 16);
    for (let i = 0; i < 4; i++) { hctx.fillStyle = i % 3 ? '#ffffff' : '#120b28'; hctx.fillRect(cx(s) - 4 + (i % 2) * 5, cy(s) - 8 + (i >> 1) * 4, 5, 4); }
    // where you are
    const pulse = Math.sin(performance.now() / 160) * 1.5;
    hctx.lineWidth = 2; hctx.strokeStyle = '#ffe14f';
    if (ed.brush === 'road' && !t.closed) {
      const h = t.cells[n - 1];
      hctx.beginPath(); hctx.arc(cx(h), cy(h), 8 + pulse, 0, TAU); hctx.stroke();
    } else {
      hctx.strokeRect(GX + ed.cx * GS + 1 - pulse / 2, GY + ed.cy * GS + 1 - pulse / 2, GS - 2 + pulse, GS - 2 + pulse);
    }

    // brushes
    BRUSHES.forEach((b, i) => {
      const x = GX + i * 25.2, y = 204, sel = ed.brush === b;
      rr(x, y, 23, 22, 5);
      hctx.fillStyle = sel ? 'rgba(255,225,79,0.35)' : 'rgba(255,255,255,0.08)'; hctx.fill();
      hctx.lineWidth = sel ? 2 : 1; hctx.strokeStyle = sel ? '#ffe14f' : 'rgba(255,255,255,0.3)'; hctx.stroke();
      brushIcon[b](x + 11.5, y + 11);
      hudButtons.push({ x, y, w: 23, h: 22, fn: () => { ed.brush = b; sfxSelect(); } });
    });
    const tips = {
      road: t.closed ? ['THE LOOP IS DONE! PICK A BRUSH TO DECORATE', 'UNDO OPENS IT AGAIN'] : n < 4 ? ['DRAG FROM THE FLAG TO DRAW YOUR ROAD', 'GO STRAIGHT OVER THE ROAD TO MAKE A BRIDGE'] :
        ['BRING THE ROAD BACK TO THE FLAG', 'DRAG BACK OVER IT TO RUB IT OUT'],
      props: ['BIG THINGS: TAP AN EMPTY SQUARE', 'TAP AGAIN FOR A DIFFERENT ONE'],
      erase: ['RUB OUT: TAP ANYTHING TO TAKE IT AWAY', ''],
    };
    const tip = tips[ed.brush] || [BRUSH_NAME[ed.brush] + ': TAP OR DRAG ON THE ROAD', 'TAP IT AGAIN TO TAKE IT OFF'];
    text(tip[0], GX, 238, 8.5, '#5ff3ff');
    text(tip[1], GX, 252, 7.5, '#ffffff');

    // the 3D view
    hctx.clearRect(PV.x, PV.y, PV.w, PV.h);
    if (!t.closed || !world || world.sig !== trackSig(t)) {
      hctx.fillStyle = '#1e1650'; hctx.fillRect(PV.x, PV.y, PV.w, PV.h);
      text(t.closed ? 'BUILDING...' : 'FINISH THE LOOP', PV.x + PV.w / 2, PV.y + PV.h / 2 - 7, 11, '#ffffff', 'center');
      if (!t.closed) text('TO SEE IT IN 3D', PV.x + PV.w / 2, PV.y + PV.h / 2 + 8, 11, '#ffffff', 'center');
    }
    hctx.lineWidth = 2; hctx.strokeStyle = '#5ff3ff';
    rr(PV.x, PV.y, PV.w, PV.h, 5); hctx.stroke();

    // the buttons under it
    const bx = PV.x, bw = 95;
    button('TRACK ' + (ed.slot + 1) + ' OF 3', bx, 146, bw, 22, edSlot, { px: 9 });
    button('NAME IT', bx + 99, 146, bw, 22, editName, { px: 9, color: '#ff9ad6' });
    button(th.name.length > 6 ? th.name.split(' ')[1] || th.name : th.name, bx, 172, bw, 22, edTheme, { px: 9, color: '#8fe36b' });
    button('HILLS: ' + ['FLAT', 'SOFT', 'BIG'][t.hills == null ? 1 : t.hills], bx + 99, 172, bw, 22, edHills, { px: 9, color: '#8fe36b' });
    button('UNDO', bx, 198, bw, 22, edUndo, { px: 10 });
    button(clearArmed > 0 ? 'SURE?' : 'CLEAR', bx + 99, 198, bw, 22, edClear, { px: 10, color: '#ff7a6b', sel: clearArmed > 0 });
    button('RACE IT!', bx, 226, 194, 30, edTest, { px: 15, go: true, off: !t.closed });
  }

  function drawHud() {
    hudButtons = [];
    hctx.clearRect(0, 0, W, H);
    if (mode === 'title') drawTitle();
    else if (mode === 'racer') drawRacer();
    else if (mode === 'track') drawTrackPick();
    else if (mode === 'gpintro') drawGpIntro();
    else if (mode === 'race') drawRace();
    else if (mode === 'cup') drawCupScreen();
    else if (mode === 'build') drawBuild();
    if (showSpeed) {
      if (!gpuName) {
        try {
          const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info');
          gpuName = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toUpperCase().slice(0, 70);
        } catch (e) { gpuName = '?'; }
      }
      const inf = renderer.info.render;
      hctx.fillStyle = 'rgba(0,0,0,0.75)'; hctx.fillRect(0, H - 25, W, 25);
      text(Math.round(speed.fps) + ' FPS   GAME ' + speed.sim.toFixed(1) + '   3D ' + speed.draw.toFixed(1) + '   HUD ' + speed.hud.toFixed(1) +
        ' MS   ' + view.width + 'x' + view.height + '   HUD ' + hud.width + '   ' + inf.calls + ' DRAWS   ' + (FAST ? 'FAST' : 'NICE'),
        4, H - 18, 7, '#ffffff');
      text(gpuName, 4, H - 7, 7, '#8fe36b');
    }
  }

  // ---------- Resize and drawing ----------
  function resize() {
    const r = view.getBoundingClientRect();
    if (!r.width) return;
    viewW = r.width; viewH = r.height;
    const base = FAST ? Math.min(BASE_RATIO, FAST_WIDTH / r.width) : BASE_RATIO;
    renderer.setPixelRatio(base * dyn);
    renderer.setSize(r.width, r.height, false);
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(view);
  else window.addEventListener('resize', resize);
  resize();

  function setFov(cam, fov) { if (cam.fov !== fov) { cam.fov = fov; cam.updateProjectionMatrix(); } }
  function render() {
    const cw = viewW, ch = viewH;       // measured in resize(), not every frame
    if (!cw) return;
    if (mode === 'build') {
      const t = edTrack();
      if (!t.closed || !world || world.sig !== trackSig(t)) return;
      const x = PV.x / W * cw, y = ch - (PV.y + PV.h) / H * ch, w = PV.w / W * cw, h = PV.h / H * ch;
      renderer.setScissorTest(true);
      renderer.setScissor(x, y, w, h);
      renderer.setViewport(x, y, w, h);
      camera.aspect = w / h; camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cw, ch);
      return;
    }
    if (race && race.view.length > 1) {
      renderer.setScissorTest(true);
      race.view.forEach((k, i) => {
        const y = i === 0 ? ch / 2 : 0;          // player 1 on top (GL counts up from the bottom)
        renderer.setScissor(0, y, cw, ch / 2);
        renderer.setViewport(0, y, cw, ch / 2);
        cams[i].aspect = cw / (ch / 2); cams[i].updateProjectionMatrix();
        renderer.render(scene, cams[i]);
      });
      renderer.setScissorTest(false);
      renderer.setViewport(0, 0, cw, ch);
      return;
    }
    camera.aspect = cw / ch; camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  // ---------- Main loop ----------
  let lastT = performance.now(), perfT = 0, perfN = 0, hudT = 1;
  // what the SHOW SPEED readout shows: frames a second and where each frame's time goes
  const speed = { fps: 0, sim: 0, draw: 0, hud: 0, n: 0, t: 0, aSim: 0, aDraw: 0, aHud: 0 };
  function frame(now) {
    const raw = Math.min(0.12, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    // A slow tablet still plays at full speed: a long frame is simulated as two or three
    // short steps (never one long one, which would let karts skip through things).
    const steps = Math.min(4, Math.ceil(raw / 0.034)), dt = raw / steps;
    // ...and it draws a smaller picture while frames stay slow
    perfT += raw; perfN++;
    if (perfN >= 45) {
      if (perfT / perfN > 0.026 && dyn > 0.6) { dyn = Math.max(0.6, dyn - 0.2); resize(); }
      perfT = perfN = 0;
    }
    const t0 = performance.now();
    Pad360.poll();
    pollPad();
    spin += raw;
    clearArmed = Math.max(0, clearArmed - raw);

    if (race) { for (let s = 0; s < steps && !paused; s++) { if (race) stepRace(dt); } }
    else if (mode === 'racer') {
      const m = models[save.look[pickIdx].racer];
      m.g.rotation.y = spin * 0.9;
      m.g.position.y = SHOW_Y + Math.abs(Math.sin(spin * 3)) * 0.12;
      pose(m, spin, Math.sin(spin * 0.7) > 0.6, -0.1);
      camera.position.set(0, SHOW_Y + 2.6, 8.2);
      camera.lookAt(0, SHOW_Y + 1.25, 0);
      setFov(camera, 50);
    } else if (mode === 'track' || mode === 'gpintro') {
      const a = spin * 0.2;
      const far = world && world.arena ? 0.62 : 1;
      camera.position.set(Math.sin(a) * 290 * far, 230 * far, (Math.cos(a) * 290 + 30) * far);
      camera.lookAt(0, 0, 22);
      setFov(camera, 62);
      stepCoins(raw);
    } else if (mode === 'cup') {
      cup.t += raw;
      cup.standings.slice(0, 3).forEach((s, i) => pose(models[s.ri], cup.t + i, true, 0));
      camera.position.set(0, SHOW_Y + 6, 20.5);
      camera.lookAt(0, SHOW_Y + 2, 0);
      setFov(camera, 50);
      for (const c of cup.confetti) { c.y += c.vy * raw; c.x += c.vx * raw; if (c.y > H + 5) c.y = -8; }
    } else if (mode === 'build') {
      const t = edTrack();
      if (ed.dirty > 0) ed.dirty -= raw;
      if (t.closed && ed.dirty <= 0 && (!world || world.sig !== trackSig(t))) buildWorld(t);
      if (world && t.closed) {
        // circle the track itself, close enough that it fills the little view
        if (!world.frame) {
          let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
          for (let i = 0; i < world.N; i++) {
            x0 = Math.min(x0, world.px[i]); x1 = Math.max(x1, world.px[i]);
            z0 = Math.min(z0, world.pz[i]); z1 = Math.max(z1, world.pz[i]);
          }
          world.frame = { x: (x0 + x1) / 2, z: (z0 + z1) / 2, r: Math.max(60, Math.hypot(x1 - x0, z1 - z0) / 2) };
        }
        const a = spin * 0.3, fr = world.frame, d = fr.r * 1.45;
        camera.position.set(fr.x + Math.sin(a) * d, d * 0.8, fr.z + Math.cos(a) * d);
        camera.lookAt(fr.x, 0, fr.z);
        setFov(camera, 50);
        stepCoins(raw);
      }
    }
    stepParticles(raw);
    models.forEach((m) => { if (m.rainbow) m.paint.color.setHSL((spin * 0.25) % 1, 0.85, 0.55); });
    tickMusic();
    const t1 = performance.now();
    render();
    const t2 = performance.now();
    // FAST: the HUD is a big 2D picture laid over the 3D one, and redrawing it is slow on a
    // tablet -- so it is redrawn 12 times a second in a race and 20 in the menus
    hudT += raw;
    let drewHud = false;
    if (!FAST || hudT >= (mode === 'race' && race && !race.results ? 1 / 12 : 1 / 20)) { hudT = 0; drawHud(); drewHud = true; }
    const t3 = performance.now();
    speed.n++; speed.t += raw; speed.aSim += t1 - t0; speed.aDraw += t2 - t1; if (drewHud) speed.aHud = t3 - t2;
    if (speed.t >= 0.5) {
      speed.fps = speed.n / speed.t; speed.sim = speed.aSim / speed.n; speed.draw = speed.aDraw / speed.n; speed.hud = speed.aHud;
      speed.n = speed.t = speed.aSim = speed.aDraw = 0;
    }
    requestAnimationFrame(frame);
  }

  toTitle();
  requestAnimationFrame(frame);})();
