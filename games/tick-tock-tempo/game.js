// Tick Tock Tempo -- a metronome for kids that teaches the real Italian tempo words.
// METRONOME (10 to 2000 BPM, pendulum or beat-lights view), NAME THAT TEMPO (hear a beat, pick the word),
// HIT THE NUMBER (tap the drum at a given BPM). All DOM in a 16:9 #stage (1em = stage height / 30),
// the two views are a <canvas>. Sound is Web Audio, scheduled a little ahead so the beat never wobbles.
(function () {
  'use strict';
  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const howto = document.getElementById('howto');
  const MIN = 10, MAX = 2000;
  const NO_BLINK = 170;      // above this many beats a minute nothing flashes (flashing faster than ~3 a second is unsafe)

  // ---------- the tempo words ----------
  // One chart with no overlaps, so the games are fair. Real charts disagree by a few BPM at the edges.
  const TEMPOS = [
    { id: 'larghissimo', nm: 'LARGHISSIMO', short: 'LARGHIS­SIMO', lo: 10, hi: 24, say: 'lar-GEE-see-mo', tts: 'lar ghee see moe', mean: 'as slow as you can go', c: '#60a5fa' },
    { id: 'grave', nm: 'GRAVE', lo: 25, hi: 39, say: 'GRAH-vay', tts: 'grah vay', mean: 'very slow and serious', c: '#818cf8' },
    { id: 'largo', nm: 'LARGO', lo: 40, hi: 59, say: 'LAR-go', tts: 'lar go', mean: 'slow and broad', c: '#a78bfa' },
    { id: 'larghetto', nm: 'LARGHETTO', short: 'LARGH­ETTO', lo: 60, hi: 65, say: 'lar-GET-oh', tts: 'lar get toe', mean: 'a little less slow than largo', c: '#c084fc' },
    { id: 'adagio', nm: 'ADAGIO', lo: 66, hi: 75, say: 'ah-DAH-jo', tts: 'ah dah joe', mean: 'slow and relaxed', c: '#e879f9' },
    { id: 'andante', nm: 'ANDANTE', lo: 76, hi: 107, say: 'ahn-DAHN-tay', tts: 'ahn dahn tay', mean: 'walking speed', c: '#f472b6' },
    { id: 'moderato', nm: 'MODERATO', short: 'MODER­ATO', lo: 108, hi: 119, say: 'mod-er-AH-toe', tts: 'mod er ah toe', mean: 'medium speed', c: '#fb7185' },
    { id: 'allegro', nm: 'ALLEGRO', lo: 120, hi: 155, say: 'ah-LEG-ro', tts: 'ah leg roe', mean: 'fast and cheerful', c: '#fb923c' },
    { id: 'vivace', nm: 'VIVACE', lo: 156, hi: 175, say: 'vee-VAH-chay', tts: 'vee vah chay', mean: 'lively and quick', c: '#fbbf24' },
    { id: 'presto', nm: 'PRESTO', lo: 176, hi: 199, say: 'PRESS-toe', tts: 'press toe', mean: 'very fast', c: '#facc15' },
    { id: 'prestissimo', nm: 'PRESTISSIMO', short: 'PRESTIS­SIMO', lo: 200, hi: 299, say: 'press-TEE-see-mo', tts: 'press tee see moe', mean: 'as fast as you can go!', c: '#a3e635' },
    // Past real music. Made-up names, and the screen says so.
    { id: 'rocket', nm: 'ROCKET ZONE', lo: 300, hi: 599, fun: true, mean: 'way past prestissimo! Not a real music word, we made it up.', tts: 'Rocket zone!', c: '#2dd4bf' },
    { id: 'hummingbird', nm: 'HUMMINGBIRD', lo: 600, hi: 1199, fun: true, mean: 'so fast the clicks start to blur. Made-up name!', tts: 'Hummingbird zone!', c: '#22d3ee' },
    { id: 'buzz', nm: 'BUZZ ZONE', lo: 1200, hi: 2000, fun: true, mean: 'so fast the clicks turn into a buzzy hum! Made-up name!', tts: 'Buzz zone!', c: '#f87171' },
  ];
  const REAL = TEMPOS.filter((t) => !t.fun);
  const byId = (id) => TEMPOS.find((t) => t.id === id);
  function tempoOf(bpm) { const b = Math.round(bpm); return TEMPOS.find((t) => b >= t.lo && b <= t.hi) || (b < 10 ? TEMPOS[0] : TEMPOS[TEMPOS.length - 1]); }
  const BEAT_HINT = ['', 'no strong beat', 'march', 'waltz', 'most songs', 'odd and fun', 'six beats', 'tricky!'];
  // a time signature drawn like sheet music: top number over bottom number on a five-line staff
  const timeSig = (top, bottom) => '<span class="tsig" aria-label="' + top + ' ' + bottom + ' time"><b>' + top + '</b><b>' + bottom + '</b></span>';
  const SOUNDS = [
    { id: 'wood', icon: '🪵', nm: 'WOOD BLOCK' }, { id: 'beep', icon: '📟', nm: 'BEEP' }, { id: 'cowbell', icon: '🔔', nm: 'COWBELL' },
    { id: 'drums', icon: '🥁', nm: 'DRUMS' }, { id: 'duck', icon: '🦆', nm: 'DUCK' }, { id: 'boing', icon: '🌀', nm: 'BOING' },
  ];

  // drawn, not the ◀ character: fonts sit that glyph low and to the right. Centred on the triangle's
  // balance point (not its box), so it looks centred in the circle.
  const BACK_ICON = '<svg viewBox="0 0 24 24" width="1.35em" height="1.35em" aria-hidden="true" style="display:block"><path d="M6 12 L15 6.2 L15 17.8 Z" fill="currentColor" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/></svg>';
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  // ---------- save ----------
  const SAVE_KEY = 'tickTockTempo.save';
  let save = { bpm: 100, beats: 4, sound: 'wood', view: 'pend', voice: true };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* none yet */ }
  save.bpm = clamp(Math.round(+save.bpm || 100), MIN, MAX);
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* full or blocked */ } }

  // ---------- sizing ----------
  // Sideways: a 16:9 stage, 1em = height / 30. Upright: a 9:16 stage (html.tall), 1em = width / 30.
  function fit() {
    const tall = window.innerHeight > window.innerWidth * 1.05;
    document.documentElement.classList.toggle('tall', tall);
    const r = stage.getBoundingClientRect();
    stage.style.fontSize = ((tall ? r.width : r.height) / 30) + 'px';
    sizeCanvas();
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  // ---------- audio engine ----------
  // A timer looks 0.12 s ahead and books every click on the audio clock, so clicks land exactly on time
  // even if the page stutters. Above 200 BPM each click gets shorter and quieter, and a compressor
  // catches the rest, so 2000 BPM becomes a hum instead of a crackle.
  const E = { ctx: null, out: null, noise: null, playing: false, next: 0, beat: 0, timer: 0, queue: [],
    bpm: save.bpm, beats: save.beats, sound: save.sound, ramp: 0, rampFrom: 0, onRamp: null };
  function audio() {
    if (!E.ctx) {
      try { E.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      const c = E.ctx;
      const comp = c.createDynamicsCompressor();
      comp.threshold.value = -14; comp.knee.value = 8; comp.ratio.value = 10; comp.attack.value = 0.002; comp.release.value = 0.12;
      E.out = c.createGain(); E.out.gain.value = 0.9;
      E.out.connect(comp); comp.connect(c.destination);
      const len = Math.floor(c.sampleRate * 0.4), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      E.noise = buf;
    }
    if (E.ctx.state === 'suspended') E.ctx.resume();
    return E.ctx;
  }
  function env(c, t, vol, dur, attack) {
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + (attack || 0.0015));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    g.connect(E.out);
    return g;
  }
  function osc(c, type, f, t, dur, dest) {
    const o = c.createOscillator(); o.type = type; o.frequency.setValueAtTime(f, t);
    o.connect(dest); o.start(t); o.stop(t + dur + 0.02); return o;
  }
  function noise(c, t, dur, dest) {
    const s = c.createBufferSource(); s.buffer = E.noise; s.connect(dest); s.start(t); s.stop(t + dur + 0.02); return s;
  }
  // iv = time until the next click: the click must die away before then
  function voice(kind, t, accent, iv, bpm) {
    const c = E.ctx; if (!c) return;
    const fast = bpm > 200 ? Math.sqrt(200 / bpm) : 1;
    const v = (accent ? 1 : 0.62) * fast;
    const fit = (base) => Math.max(0.008, Math.min(base, iv * 0.7));
    if (kind === 'beep') {
      const dur = fit(0.07);
      osc(c, 'square', accent ? 1320 : 880, t, dur, env(c, t, 0.22 * v, dur));
    } else if (kind === 'cowbell') {
      const dur = fit(0.28);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = accent ? 950 : 800; bp.Q.value = 3;
      bp.connect(env(c, t, 0.7 * v, dur));
      const k = accent ? 1.2 : 1;
      osc(c, 'square', 587 * k, t, dur, bp); osc(c, 'square', 845 * k, t, dur, bp);
    } else if (kind === 'drums') {
      if (accent || bpm > 400) {
        const dur = fit(0.2), g = env(c, t, 1.1 * v, dur, 0.001);
        const o = osc(c, 'sine', 160, t, dur, g); o.frequency.exponentialRampToValueAtTime(45, t + dur);
      }
      if (!accent) {
        const dur = fit(0.07), hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2500;
        hp.connect(env(c, t, 0.5 * v, dur, 0.001)); noise(c, t, dur, hp);
      }
    } else if (kind === 'duck') {
      const dur = fit(0.15), bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1300; bp.Q.value = 4;
      bp.connect(env(c, t, 0.9 * v, dur, 0.005));
      const o = osc(c, 'sawtooth', accent ? 820 : 620, t, dur, bp); o.frequency.exponentialRampToValueAtTime(accent ? 450 : 340, t + dur);
    } else if (kind === 'boing') {
      const dur = fit(0.22), g = env(c, t, 0.45 * v, dur, 0.004);
      const o = osc(c, 'sine', accent ? 300 : 220, t, dur, g); o.frequency.exponentialRampToValueAtTime(accent ? 900 : 660, t + dur);
      const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 28; lg.gain.value = 25;
      lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + dur + 0.02);
    } else { // wood block
      const dur = fit(0.06), g = env(c, t, 0.75 * v, dur, 0.001);
      osc(c, 'triangle', accent ? 1700 : 1150, t, dur, g);
      osc(c, 'sine', (accent ? 1700 : 1150) * 2.7, t, Math.min(dur, 0.02), env(c, t, 0.12 * v, Math.min(dur, 0.02), 0.001));
    }
  }
  function tick() {
    const c = E.ctx; if (!c || !E.playing) return;
    if (E.next < c.currentTime - 0.05) E.next = c.currentTime + 0.03; // fell behind (tab was busy): skip ahead, never pile up
    let guard = 0;
    while (E.next < c.currentTime + 0.12 && guard++ < 64) {
      const n = E.beats, pos = E.beat % n, iv = 60 / E.bpm;
      voice(E.sound, E.next, n > 1 && pos === 0, iv, E.bpm);
      E.queue.push({ t: E.next, beat: E.beat, pos, iv });
      E.beat++; E.next += iv;
      if (E.ramp) {
        E.bpm = clamp(E.bpm * (E.ramp > 0 ? 1.012 : 1 / 1.012), MIN, MAX);
        if (E.bpm === MIN || E.bpm === MAX) E.ramp = 0;
        if (E.onRamp) E.onRamp();
      }
    }
    while (E.queue.length > 3 && E.queue[1].t < c.currentTime - 1) E.queue.shift();
  }
  function start() {
    const c = audio(); if (!c) return;
    stop();
    E.playing = true; E.beat = 0; E.queue = []; E.next = c.currentTime + 0.06;
    tick(); E.timer = setInterval(tick, 20);
  }
  function stop() { E.playing = false; clearInterval(E.timer); E.timer = 0; E.queue = []; E.ramp = 0; }
  function setBpm(b) {
    E.bpm = clamp(b, MIN, MAX);
    // a new speed starts from the last booked click, so going from 10 to 2000 doesn't wait 6 seconds
    if (E.playing && E.queue.length) E.next = Math.max(E.ctx.currentTime + 0.005, E.queue[E.queue.length - 1].t + 60 / E.bpm);
  }
  // where the beat is right now: { k: beat number, pos, phase 0..1 to the next beat, iv }
  function beatNow() {
    const c = E.ctx; if (!c || !E.playing || !E.queue.length) return null;
    const lat = Math.min(0.25, (c.outputLatency || 0) + (c.baseLatency || 0));
    const now = c.currentTime - lat, q = E.queue;
    let i = -1;
    for (let j = q.length - 1; j >= 0; j--) if (q[j].t <= now) { i = j; break; }
    if (i < 0) return null;
    const a = q[i], nt = q[i + 1] ? q[i + 1].t : a.t + 60 / E.bpm;
    return { k: a.beat, pos: a.pos, iv: nt - a.t, phase: clamp((now - a.t) / (nt - a.t), 0, 1), since: now - a.t };
  }
  function blip(kind) { const c = audio(); if (c) voice(kind || E.sound, c.currentTime + 0.005, false, 0.3, 100); }
  function chime(ok) {
    const c = audio(); if (!c) return;
    const notes = ok ? [660, 880, 1320] : [440, 392];
    notes.forEach((f, i) => { const t = c.currentTime + i * 0.09; osc(c, 'triangle', f, t, 0.18, env(c, t, 0.25, 0.18, 0.005)); });
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden && E.playing) { stop(); if (cur.name === 'metro') renderPlay(); } });

  function say(t) {
    if (!window.MickleVoice || !MickleVoice.can) return;
    MickleVoice.cancel();
    MickleVoice.speak(t.fun ? [t.tts, t.mean] : [t.tts, 'It means ' + t.mean.replace('!', '') + '.']);
  }

  // ---------- canvas views ----------
  let cv = null, cx2 = null, cw = 0, ch = 0;
  function sizeCanvas() {
    if (!cv) return;
    const r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cw = r.width; ch = r.height;
    cv.width = Math.max(1, Math.round(cw * dpr)); cv.height = Math.max(1, Math.round(ch * dpr));
    cx2 = cv.getContext('2d'); cx2.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  // weight position: 0 = top of the rod (slow) .. 1 = bottom (fast). The classic 40-208 scale gets most
  // of the rod, like a real metronome; 10-40 sits above it and the 208-2000 TURBO zone below.
  function bpmToT(b) {
    b = clamp(b, MIN, MAX);
    if (b < 40) return 0.1 * Math.log(b / 10) / Math.log(4);
    if (b <= 208) return 0.1 + 0.7 * Math.log(b / 40) / Math.log(208 / 40);
    return 0.8 + 0.2 * Math.log(b / 208) / Math.log(2000 / 208);
  }
  function tToBpm(t) {
    t = clamp(t, 0, 1);
    if (t < 0.1) return 10 * Math.pow(4, t / 0.1);
    if (t <= 0.8) return 40 * Math.pow(208 / 40, (t - 0.1) / 0.7);
    return 208 * Math.pow(2000 / 208, (t - 0.8) / 0.2);
  }
  function geo() {
    const pivotY = ch * 0.8, topY = ch * 0.07, L = pivotY - topY;
    return { x: cw / 2, pivotY, L, dOf: (t) => L * (0.93 - 0.72 * t) };
  }
  const MARKS = [40, 42, 44, 46, 48, 50, 52, 54, 56, 58, 60, 63, 66, 69, 72, 76, 80, 84, 88, 92, 96, 100, 104, 108, 112, 116, 120, 126, 132, 138, 144, 152, 160, 168, 176, 184, 192, 200, 208];
  const LABELS = [40, 50, 60, 72, 84, 96, 108, 120, 138, 160, 184, 208];
  const TURBO = [300, 600, 1200, 2000];
  let swing = 0, lastK = -1, beatFlash = 0;

  function drawPendulum(opt) {
    const c = cx2, g = geo(), A = 26 * Math.PI / 180, w = cw, h = ch;
    c.clearRect(0, 0, w, h);
    // body
    const bt = h * 0.11, bb = h * 0.9, tw = w * 0.13, bw = w * 0.37;
    let gr = c.createLinearGradient(g.x - bw, 0, g.x + bw, 0);
    gr.addColorStop(0, '#5b2c0f'); gr.addColorStop(0.5, '#9a5524'); gr.addColorStop(1, '#4a230b');
    c.fillStyle = gr;
    c.beginPath(); c.moveTo(g.x - tw, bt); c.lineTo(g.x + tw, bt); c.lineTo(g.x + bw, bb); c.lineTo(g.x - bw, bb); c.closePath(); c.fill();
    c.fillStyle = 'rgba(0,0,0,.25)';
    c.beginPath(); c.moveTo(g.x - tw * 0.72, bt + h * 0.025); c.lineTo(g.x + tw * 0.72, bt + h * 0.025); c.lineTo(g.x + bw * 0.78, g.pivotY + h * 0.02); c.lineTo(g.x - bw * 0.78, g.pivotY + h * 0.02); c.closePath(); c.fill();
    c.fillStyle = '#3b1a07'; c.fillRect(g.x - bw * 1.08, bb, bw * 2.16, h * 0.06);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(g.x - bw * 1.08, bb, bw * 2.16, h * 0.008);
    // scale strip
    const sw = Math.max(26, w * 0.15), y0 = g.pivotY - g.dOf(0) - 4, y1 = g.pivotY - g.dOf(1) + 4;
    if (!opt.hideScale) {
      c.fillStyle = '#fdf6e3'; c.fillRect(g.x - sw / 2, y0, sw, y1 - y0);
      const yt = g.pivotY - g.dOf(0.8);
      c.fillStyle = '#fecaca'; c.fillRect(g.x - sw / 2, yt, sw, y1 - yt);
      c.strokeStyle = '#78350f'; c.lineWidth = 1;
      const fs = Math.max(8, Math.min(13, h * 0.026));
      c.font = '800 ' + fs + 'px system-ui, sans-serif'; c.textBaseline = 'middle';
      for (const m of MARKS) {
        const y = g.pivotY - g.dOf(bpmToT(m)), big = LABELS.includes(m);
        c.beginPath(); c.moveTo(g.x - sw / 2, y); c.lineTo(g.x - sw / 2 + (big ? sw * 0.28 : sw * 0.16), y); c.stroke();
        if (big) { c.fillStyle = '#451a03'; c.textAlign = 'right'; c.fillText(m, g.x + sw / 2 - 2, y); }
      }
      for (const m of TURBO) {
        const y = g.pivotY - g.dOf(bpmToT(m));
        c.strokeStyle = '#b91c1c'; c.beginPath(); c.moveTo(g.x - sw / 2, y); c.lineTo(g.x - sw / 2 + sw * 0.28, y); c.stroke();
        c.fillStyle = '#b91c1c'; c.textAlign = 'right'; c.fillText(m >= 1000 ? (m / 1000) + 'K' : m, g.x + sw / 2 - 2, y);
      }
      c.fillStyle = '#b91c1c'; c.textAlign = 'center'; c.font = '900 ' + Math.max(7, fs * 0.75) + 'px system-ui, sans-serif';
      c.fillText('TURBO', g.x, y1 + fs * 0.7);
      // the tempo words, printed beside the numbers like on a real metronome
      c.font = 'italic 700 ' + Math.max(8, fs * 0.92) + 'px Georgia, serif'; c.textAlign = 'left';
      const cur = tempoOf(E.bpm).id, gapY = fs * 1.05;
      let lastY = -1e9;
      for (const t of REAL) {
        if (t.hi < 40 || t.lo > 208) continue;
        const mid = Math.sqrt(Math.max(40, t.lo) * Math.min(208, t.hi));
        let y = g.pivotY - g.dOf(bpmToT(mid));
        if (y - lastY < gapY) y = lastY + gapY; // squeeze-free: push a crowded word down a little
        lastY = y;
        c.fillStyle = t.id === cur ? '#fde68a' : 'rgba(253, 230, 138, .55)';
        c.fillText(t.nm.charAt(0) + t.nm.slice(1).toLowerCase(), g.x + sw / 2 + 5, y);
      }
    }
    // beat light at the top of the body
    const ly = bt - h * 0.0, steady = E.bpm > NO_BLINK && E.playing;
    const lit = steady ? 0.6 : beatFlash;
    c.fillStyle = 'rgba(253, 224, 71,' + (0.18 + 0.82 * lit) + ')';
    c.beginPath(); c.arc(g.x, ly + h * 0.035, Math.max(4, w * 0.018), 0, Math.PI * 2); c.fill();
    // rod + weight
    const t = bpmToT(E.bpm), d = g.dOf(t);
    const iv = 60 / E.bpm, blur = E.playing && iv < 0.14;
    const drawRod = (ang, alpha) => {
      c.save(); c.translate(g.x, g.pivotY); c.rotate(ang); c.globalAlpha = alpha;
      c.strokeStyle = '#e5e7eb'; c.lineWidth = Math.max(2, w * 0.011); c.lineCap = 'round';
      c.beginPath(); c.moveTo(0, h * 0.04); c.lineTo(0, -g.L); c.stroke();
      const ww = Math.max(16, w * 0.12), wh = Math.max(12, h * 0.065);
      const wg = c.createLinearGradient(-ww / 2, 0, ww / 2, 0);
      wg.addColorStop(0, '#a16207'); wg.addColorStop(0.45, '#fde047'); wg.addColorStop(1, '#854d0e');
      c.fillStyle = wg;
      c.beginPath(); c.moveTo(-ww * 0.36, -d - wh / 2); c.lineTo(ww * 0.36, -d - wh / 2); c.lineTo(ww / 2, -d + wh / 2); c.lineTo(-ww / 2, -d + wh / 2); c.closePath(); c.fill();
      c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-ww * 0.36, -d - wh / 2, ww * 0.72, wh * 0.12);
      c.restore();
    };
    if (blur) {
      c.save(); c.translate(g.x, g.pivotY);
      c.fillStyle = 'rgba(229, 231, 235, .13)';
      c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, g.L, -Math.PI / 2 - A, -Math.PI / 2 + A); c.closePath(); c.fill();
      c.strokeStyle = 'rgba(253, 224, 71, .45)'; c.lineWidth = Math.max(8, h * 0.05);
      c.beginPath(); c.arc(0, 0, d, -Math.PI / 2 - A, -Math.PI / 2 + A); c.stroke();
      c.restore();
      drawRod(-A, 0.35); drawRod(A, 0.35); drawRod(swing, 0.55);
    } else drawRod(swing, 1);
    // pivot
    c.fillStyle = '#fbbf24'; c.beginPath(); c.arc(g.x, g.pivotY, Math.max(4, w * 0.02), 0, Math.PI * 2); c.fill();
    c.fillStyle = '#78350f'; c.beginPath(); c.arc(g.x, g.pivotY, Math.max(2, w * 0.008), 0, Math.PI * 2); c.fill();
    if (blur) {
      c.fillStyle = '#fde68a'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = '900 ' + Math.max(9, h * 0.032) + 'px system-ui, sans-serif';
      c.fillText(E.bpm > 600 ? 'TOO FAST TO SEE! LISTEN TO THE HUM' : 'WHOOSH!', w / 2, h * 0.86);
    }
  }

  function drawLights(opt) {
    const c = cx2, w = cw, h = ch; c.clearRect(0, 0, w, h);
    const n = E.beats, b = beatNow(), steady = E.bpm > NO_BLINK;
    const r = Math.min(w / (n * 2.6 + 0.6), h * 0.12), gap = (w - n * 2 * r) / (n + 1), y = h * 0.66;
    const xs = []; for (let i = 0; i < n; i++) xs.push(gap + r + i * (2 * r + gap));
    for (let i = 0; i < n; i++) {
      let lit = 0;
      if (b && !steady && b.pos === i) lit = Math.max(0, 1 - b.since / Math.min(0.35, b.iv * 0.8));
      if (b && steady) lit = 0.55;
      const one = n > 1 && i === 0;
      c.fillStyle = one ? 'rgba(251, 191, 36,' + (0.22 + 0.78 * lit) + ')' : 'rgba(56, 189, 248,' + (0.2 + 0.8 * lit) + ')';
      c.beginPath(); c.arc(xs[i], y, r * (1 + 0.08 * lit), 0, Math.PI * 2); c.fill();
      c.strokeStyle = one ? '#fde68a' : '#bae6fd'; c.lineWidth = Math.max(2, r * 0.08); c.stroke();
      c.fillStyle = lit > 0.3 ? '#1e0b3a' : 'rgba(255,255,255,.85)';
      c.font = '900 ' + Math.round(r * 0.9) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(i + 1, xs[i], y + r * 0.04);
    }
    // a ball hops from light to light, landing on each beat
    if (b && !steady) {
      const from = xs[b.pos], to = xs[(b.pos + 1) % n], p = b.phase;
      const bx = n === 1 ? from : (to < from ? from + (from - to) / Math.max(1, n - 1) * 0 + (xs[0] - from) * p : from + (to - from) * p);
      const hop = Math.min(h * 0.42, r * 3.2);
      const by = y - r - Math.max(4, r * 0.25) - hop * 4 * p * (1 - p);
      c.fillStyle = '#fff'; c.beginPath(); c.arc(bx, by, Math.max(5, r * 0.25), 0, Math.PI * 2); c.fill();
    } else if (b && steady) {
      c.fillStyle = '#fde68a'; c.textAlign = 'center'; c.font = '900 ' + Math.max(10, h * 0.04) + 'px system-ui, sans-serif';
      c.fillText('TOO FAST TO BLINK! LISTEN TO IT HUM', w / 2, h * 0.25);
    } else {
      c.fillStyle = 'rgba(255,255,255,.75)'; c.textAlign = 'center'; c.font = '800 ' + Math.max(10, h * 0.04) + 'px system-ui, sans-serif';
      c.fillText(opt.idle || 'Press START to see the beat', w / 2, h * 0.25);
    }
  }

  function frame() {
    const b = beatNow();
    if (b) {
      // the rod reaches the end of its swing on each click, then swings back
      const side = b.k % 2 === 0 ? -1 : 1;
      swing = 26 * Math.PI / 180 * side * Math.cos(Math.PI * b.phase);
      beatFlash = E.bpm > NO_BLINK ? 0 : Math.max(0, 1 - b.since / Math.min(0.25, b.iv * 0.6));
      if (b.k !== lastK) { lastK = b.k; onBeat(b); }
    } else {
      swing *= 0.88; beatFlash = 0; lastK = -1;
    }
    if (cv && cx2 && cw > 0) {
      if (view === 'lights') drawLights(viewOpt); else drawPendulum(viewOpt);
    }
  }
  let view = save.view === 'lights' ? 'lights' : 'pend', viewOpt = {};
  function onBeat(b) {
    if (cur.name === 'metro' && E.bpm <= NO_BLINK) {
      const el = document.getElementById('bpm');
      if (el) { el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 70); }
    }
    if (cur.onBeat) cur.onBeat(b);
  }

  // ---------- screens ----------
  let cur = { name: 'title' };
  function setScreen(html, state) {
    if (cur.timer) clearTimeout(cur.timer);
    cur = Object.assign({ name: 'title' }, state);
    screen.innerHTML = html;
    cv = screen.querySelector('canvas'); cx2 = null;
    if (cv) { sizeCanvas(); bindCanvas(); }
    setFocus(null);
    if (document.body.classList.contains('navmode')) { const f = navEls()[0]; if (f) setFocus(f); }
  }
  function useMetroSettings() { E.bpm = save.bpm; E.beats = save.beats; E.sound = save.sound; }

  const TITLE_SVG = '<svg class="title-mtr" viewBox="0 0 100 170" aria-hidden="true">' +
    '<defs><linearGradient id="wd" x1="0" x2="1"><stop offset="0" stop-color="#5b2c0f"/><stop offset=".5" stop-color="#a35d29"/><stop offset="1" stop-color="#4a230b"/></linearGradient>' +
    '<linearGradient id="br" x1="0" x2="1"><stop offset="0" stop-color="#a16207"/><stop offset=".45" stop-color="#fde047"/><stop offset="1" stop-color="#854d0e"/></linearGradient></defs>' +
    '<path d="M38 18 H62 L86 156 H14 Z" fill="url(#wd)"/><rect x="8" y="156" width="84" height="10" rx="2" fill="#3b1a07"/>' +
    '<rect x="45" y="30" width="10" height="100" fill="#fdf6e3"/>' +
    '<g class="rod"><line x1="50" y1="156" x2="50" y2="8" stroke="#e5e7eb" stroke-width="2.6" stroke-linecap="round"/><path d="M44 52 H56 L59 62 H41 Z" fill="url(#br)"/></g>' +
    '<circle cx="50" cy="152" r="4" fill="#fbbf24"/></svg>';

  function goTitle() {
    stop(); useMetroSettings();
    setScreen('<div class="title-scr">' + TITLE_SVG +
      '<div class="title-col"><h1 class="logo">TICK TOCK<br>TEMPO</h1>' +
      '<button class="go gold nav" data-act="metro">🎼 METRONOME</button>' +
      '<div class="row2"><button class="go blue nav" data-act="levels" data-g="name">👂 NAME THAT TEMPO<span class="sub">hear it, name it</span></button>' +
      '<button class="go nav" data-act="levels" data-g="hit">🥁 HIT THE NUMBER<span class="sub">tap the speed</span></button></div>' +
      '<button class="go ghost nav" data-act="howto">HOW TO PLAY</button></div></div>', { name: 'title' });
  }

  // ----- metronome -----
  function goMetro() {
    stop(); useMetroSettings(); viewOpt = {};
    const ladder = TEMPOS.filter((t) => !t.fun).map((t) =>
      '<button class="nav" data-act="jump" data-id="' + t.id + '" style="--tc:' + t.c + '">' + (t.short || t.nm) + '<small>' + t.lo + (t.id === 'prestissimo' ? '+' : '-' + t.hi) + '</small></button>').join('') +
      '<button class="nav fun" data-act="jump" data-id="fun" style="--tc:#2dd4bf">🚀 WAY FAST<small>300-2000</small></button>';
    setScreen(
      '<div class="top"><button class="icon-btn nav" data-act="home" aria-label="Back">' + BACK_ICON + '</button><div class="tt">METRONOME</div><button class="chip nav" data-act="voice" id="voicebtn"></button></div>' +
      '<div class="mt">' +
        '<div class="view glass"><canvas></canvas><div class="viewtog">' +
          '<button class="chip nav" data-act="view" data-v="pend">PENDULUM</button><button class="chip nav" data-act="view" data-v="lights">LIGHTS</button></div>' +
          '<div class="drag-tip" id="dragtip">Slide the weight up or down!</div></div>' +
        '<div class="panel glass">' +
          '<div class="bpm-row"><button class="chip nav" data-act="add" data-n="-5">&minus;5</button><button class="chip nav" data-act="add" data-n="-1">&minus;1</button>' +
            '<div class="bpm"><b id="bpm"></b><span>BPM</span></div>' +
            '<button class="chip nav" data-act="add" data-n="1">+1</button><button class="chip nav" data-act="add" data-n="5">+5</button></div>' +
          '<div class="tname"><span class="nm" id="tnm"></span><button class="icon-btn nav" data-act="say" aria-label="Say it">🔊</button></div>' +
          '<div class="tsay" id="tsay"></div>' +
          '<input type="range" class="slider" id="sl" min="0" max="1000" step="1" aria-label="Speed">' +
          '<div class="ctl-row"><button class="go blue tap nav" data-press="tap">TAP</button><button class="go play nav" data-act="play" id="play"></button></div>' +
          '<div class="opt-row"><b>BEATS</b>' + [1, 2, 3, 4, 5, 6, 7].map((n) => '<button class="chip nav" data-act="beats" data-n="' + n + '">' + n + '</button>').join('') + '<span class="hint" id="bhint"></span></div>' +
          '<div class="opt-row"><b>SOUND</b>' + SOUNDS.map((s) => '<button class="chip nav" data-act="sound" data-s="' + s.id + '" aria-label="' + s.nm + '">' + s.icon + '</button>').join('') + '<span class="hint" id="shint"></span></div>' +
          '<div class="opt-row"><b>CHANGE</b><button class="chip nav" data-act="ramp" data-r="1">ACCELERANDO ↗</button><button class="chip nav" data-act="ramp" data-r="-1">RITARDANDO ↘</button><button class="chip nav" data-act="atempo">A TEMPO</button></div>' +
        '</div>' +
        '<div class="ladder">' + ladder + '</div>' +
      '</div>', { name: 'metro' });
    const sl = document.getElementById('sl');
    sl.addEventListener('input', () => { setTempo(10 * Math.pow(200, sl.value / 1000), true); });
    E.onRamp = () => { needUi = true; };
    renderMetro(); renderPlay(); renderOpts();
  }
  let needUi = false;
  function setTempo(b, fromSlider) {
    setBpm(Math.round(clamp(b, MIN, MAX)));
    E.ramp = 0;
    save.bpm = E.bpm; store(); renderMetro(fromSlider); renderOpts();
  }
  function renderMetro(fromSlider) {
    if (cur.name !== 'metro') return;
    const b = Math.round(E.bpm), t = tempoOf(b);
    document.getElementById('bpm').textContent = b;
    const nm = document.getElementById('tnm'); nm.textContent = t.nm; nm.style.setProperty('--tc', t.c);
    document.getElementById('tsay').innerHTML = t.fun
      ? '<span class="madeup">' + t.mean + '</span>'
      : 'say it: <i>' + t.say + '</i> &nbsp;·&nbsp; means <i>' + t.mean + '</i>';
    if (!fromSlider) document.getElementById('sl').value = Math.round(1000 * Math.log(b / 10) / Math.log(200));
    screen.querySelectorAll('.ladder button').forEach((el) => el.classList.toggle('on', el.dataset.id === t.id || (el.dataset.id === 'fun' && t.fun)));
  }
  function renderPlay() {
    const p = document.getElementById('play'); if (!p) return;
    p.textContent = E.playing ? '■ STOP' : '▶ START';
    p.classList.toggle('red', E.playing);
  }
  function renderOpts() {
    if (cur.name !== 'metro') return;
    screen.querySelectorAll('[data-act="view"]').forEach((el) => el.classList.toggle('on', el.dataset.v === view));
    screen.querySelectorAll('[data-act="beats"]').forEach((el) => el.classList.toggle('on', +el.dataset.n === E.beats));
    screen.querySelectorAll('[data-act="sound"]').forEach((el) => el.classList.toggle('on', el.dataset.s === E.sound));
    screen.querySelectorAll('[data-act="ramp"]').forEach((el) => el.classList.toggle('on', +el.dataset.r === E.ramp));
    document.getElementById('bhint').innerHTML = (E.beats > 1 ? timeSig(E.beats, 4) : '') + BEAT_HINT[E.beats];
    document.getElementById('shint').textContent = (SOUNDS.find((s) => s.id === E.sound) || SOUNDS[0]).nm;
    const vb = document.getElementById('voicebtn');
    if (vb) { vb.textContent = save.voice ? '🗣️ VOICE: ON' : '🔇 VOICE: OFF'; vb.classList.toggle('on', save.voice); }
    const tip = document.getElementById('dragtip'); if (tip) tip.style.display = view === 'pend' ? '' : 'none';
  }
  function togglePlay() { if (E.playing) stop(); else start(); renderPlay(); renderOpts(); }
  let taps = [];
  function tapTempo() {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now); if (taps.length > 6) taps.shift();
    blip();
    if (taps.length >= 2) {
      const avg = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
      setTempo(60000 / avg);
    }
  }
  let funStep = 0;
  function jump(id) {
    if (id === 'fun') { const list = [400, 900, 2000]; setTempo(list[funStep++ % list.length]); }
    else { const t = byId(id); setTempo(t.id === 'prestissimo' ? 220 : Math.round(Math.sqrt(t.lo * t.hi))); if (save.voice) say(t); }
  }

  // drag the weight to set the speed
  function bindCanvas() {
    let drag = false;
    const toBpm = (e) => {
      const r = cv.getBoundingClientRect(), y = (e.clientY - r.top) * (ch / r.height), g = geo();
      const d = g.pivotY - y, t = (0.93 - d / g.L) / 0.72;
      return tToBpm(t);
    };
    cv.addEventListener('pointerdown', (e) => {
      if (cur.name !== 'metro' || view !== 'pend') return;
      const r = cv.getBoundingClientRect(), x = (e.clientX - r.left) * (cw / r.width);
      if (Math.abs(x - cw / 2) > cw * 0.3) return;
      drag = true; try { cv.setPointerCapture(e.pointerId); } catch (er) { /* */ }
      audio(); setTempo(toBpm(e));
    });
    cv.addEventListener('pointermove', (e) => { if (drag) setTempo(toBpm(e)); });
    const end = () => { drag = false; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  }

  // ----- level picker -----
  const LEVELS = {
    name: [
      { id: 'easy', nm: 'EASY', c: '#4ade80', txt: 'Largo, Andante, Allegro or Presto?<br><em>3 choices</em>' },
      { id: 'medium', nm: 'MEDIUM', c: '#fbbf24', txt: '8 tempo words, from Largo to Prestissimo<br><em>4 choices</em>' },
      { id: 'hard', nm: 'HARD', c: '#f87171', txt: 'All 11 words. The choices sit right next to each other!<br><em>4 choices</em>' },
    ],
    hit: [
      { id: 'easy', nm: 'EASY', c: '#4ade80', txt: 'Hear the beat first, then tap it back.<br><em>60 to 160 BPM</em>' },
      { id: 'medium', nm: 'MEDIUM', c: '#fbbf24', txt: 'Hear just 2 beats, then keep it going.<br><em>50 to 190 BPM</em>' },
      { id: 'hard', nm: 'HARD', c: '#f87171', txt: 'No help! Do you know how fast 96 is?<br><em>40 to 208 BPM</em>' },
    ],
  };
  function goLevels(g) {
    stop();
    const ttl = g === 'name' ? 'NAME THAT TEMPO' : 'HIT THE NUMBER';
    const blurb = g === 'name' ? 'Listen to the beat and pick the right tempo word.' : 'You get a number. Tap the drum at that many beats per minute!';
    setScreen('<div class="top"><button class="icon-btn nav" data-act="home" aria-label="Back">' + BACK_ICON + '</button><div class="tt"></div></div>' +
      '<div class="center-scr"><h2>' + ttl + '</h2><p>' + blurb + '</p><div class="levels">' +
      LEVELS[g].map((l) => '<button class="lvl nav" data-act="play-' + g + '" data-l="' + l.id + '" style="--tc:' + l.c + '"><b>' + l.nm + '</b><span>' + l.txt + '</span></button>').join('') +
      '</div></div>', { name: 'levels', g });
  }

  function gameTop(title, total) {
    return '<div class="top"><button class="icon-btn nav" data-act="home" aria-label="Back">' + BACK_ICON + '</button><div class="tt">' + title + '</div>' +
      '<div class="dots">' + Array.from({ length: total }, () => '<i></i>').join('') + '</div><div class="score-chip" id="score">0</div></div>';
  }
  function paintDots(results, at) {
    screen.querySelectorAll('.dots i').forEach((el, i) => { el.className = i < results.length ? (results[i] ? 'ok' : 'miss') : (i === at ? 'on' : ''); });
    const s = document.getElementById('score'); if (s) s.textContent = cur.score;
  }

  // ----- NAME THAT TEMPO -----
  const NAME_POOLS = {
    easy: ['largo', 'andante', 'allegro', 'presto'],
    medium: ['largo', 'adagio', 'andante', 'moderato', 'allegro', 'vivace', 'presto', 'prestissimo'],
    hard: REAL.map((t) => t.id),
  };
  const NAME_ROUNDS = 8;
  function startName(level) {
    stop();
    E.beats = 4; E.sound = 'wood'; view = 'pend'; viewOpt = { hideScale: true };
    setScreen(gameTop('NAME THAT TEMPO · ' + level.toUpperCase(), NAME_ROUNDS) +
      '<div class="gm"><div class="view glass"><canvas></canvas></div><div class="side">' +
      '<div class="q" id="q"></div><div class="answers" id="answers"></div>' +
      '<div class="feedback glass" id="fb"></div></div></div>',
      { name: 'name', level, round: 0, score: 0, streak: 0, results: [], last: null });
    nameRound();
  }
  function nameRound() {
    const s = cur, pool = NAME_POOLS[s.level];
    let id; do { id = pick(pool); } while (id === s.last && pool.length > 1);
    s.last = id; s.answer = byId(id); s.locked = false;
    const t = s.answer, top = Math.min(t.hi, t.id === 'prestissimo' ? 240 : t.hi);
    s.bpm = Math.round(t.lo + (top - t.lo) * rnd(0.2, 0.8));
    // choices
    let others = pool.filter((x) => x !== id);
    const n = s.level === 'easy' ? 3 : 4;
    if (s.level === 'hard') {
      const i = REAL.findIndex((x) => x.id === id), near = [REAL[i - 1], REAL[i + 1]].filter(Boolean).map((x) => x.id);
      others = shuffle(near).concat(shuffle(others.filter((x) => !near.includes(x))));
    } else others = shuffle(others);
    const choices = shuffle([id].concat(others.slice(0, n - 1))).map(byId);
    s.choices = choices;
    document.getElementById('q').innerHTML = 'What tempo is this?<small>Listen to the beat and watch the pendulum.</small>';
    document.getElementById('answers').innerHTML = choices.map((c, i) =>
      '<button class="ans nav" data-act="answer" data-i="' + i + '" style="--tc:' + c.c + '"><b>' + c.nm + '</b>' + (s.level === 'easy' ? '<span>' + c.mean + '</span>' : '<span>' + c.say + '</span>') + '</button>').join('');
    document.getElementById('fb').innerHTML = '<span class="tip">Round ' + (s.round + 1) + ' of ' + NAME_ROUNDS + '</span>';
    paintDots(s.results, s.round);
    E.bpm = s.bpm; start();
    if (document.body.classList.contains('navmode')) setFocus(navEls().find((b) => b.dataset.act === 'answer'));
  }
  function answerName(i) {
    const s = cur; if (s.locked) return;
    s.locked = true;
    const c = s.choices[i], t = s.answer, ok = c.id === t.id;
    const btns = screen.querySelectorAll('.ans');
    btns.forEach((b, j) => { if (s.choices[j].id === t.id) b.classList.add('good'); else if (j === i) b.classList.add('bad'); });
    let html;
    if (ok) {
      s.streak++;
      const pts = 100 + Math.min(100, (s.streak - 1) * 20);
      s.score += pts;
      html = '<span class="yay">YES! +' + pts + '</span><br>' + s.bpm + ' BPM is ' + t.nm + ' (' + t.lo + '&ndash;' + (t.id === 'prestissimo' ? '200+' : t.hi) + ').';
      chime(true);
    } else {
      s.streak = 0;
      // "So close!" only when their word sits right next to the answer on the tempo ladder
      const near = Math.abs(REAL.indexOf(c) - REAL.indexOf(t)) === 1;
      html = (near ? 'So close!' : 'Not quite!') + ' That was <b>' + t.nm + '</b>, ' + s.bpm + ' BPM.<br><span class="tip">' + c.nm + ' is ' + c.lo + '&ndash;' + (c.id === 'prestissimo' ? '200+' : c.hi) + ', ' + (near ? 'a little ' : 'much ') + (c.lo > t.hi ? 'faster' : 'slower') + '.</span>';
      chime(false);
    }
    s.results.push(ok);
    paintDots(s.results, -1);
    html += '<div class="btns"><button class="go nav" data-act="next-name">' + (s.round + 1 >= NAME_ROUNDS ? 'SEE MY SCORE' : 'NEXT ▶') + '</button></div>';
    document.getElementById('fb').innerHTML = html;
    viewOpt = { hideScale: false };
    if (document.body.classList.contains('navmode')) setFocus(screen.querySelector('[data-act="next-name"]'));
  }
  function nextName() {
    const s = cur; s.round++; viewOpt = { hideScale: true };
    if (s.round >= NAME_ROUNDS) return goResult('name', s.level, s.score, s.results.filter(Boolean).length, NAME_ROUNDS);
    nameRound();
  }

  // ----- HIT THE NUMBER -----
  const HIT_ROUNDS = 6, HIT_TAPS = 8;
  const HIT_RANGE = { easy: [60, 160], medium: [50, 190], hard: [40, 208] };
  function startHit(level) {
    stop();
    E.beats = 1; E.sound = 'wood'; view = 'pend'; viewOpt = { hideScale: level === 'hard' };
    setScreen(gameTop('HIT THE NUMBER · ' + level.toUpperCase(), HIT_ROUNDS) +
      '<div class="gm"><div class="view glass"><canvas></canvas></div><div class="side hit-side">' +
      '<div class="hit-a"><div class="target" id="tgt"></div><div class="feedback glass" id="fb"></div></div>' +
      '<div class="hit-b"><button class="pad nav" data-press="pad" id="pad"></button>' +
      '<div class="meter-box"><div class="meter"><div class="mid"></div><div class="mark" id="mark" style="left:50%;display:none"></div></div>' +
      '<div class="meter-lbl"><span>TOO SLOW</span><span>JUST RIGHT</span><span>TOO FAST</span></div></div></div></div></div>',
      { name: 'hit', level, round: 0, score: 0, results: [], taps: [] });
    hitRound();
  }
  function hitRound() {
    const s = cur, [lo, hi] = HIT_RANGE[s.level];
    let b; do { b = Math.round(rnd(lo, hi)); } while (s.lastB && Math.abs(b - s.lastB) < 15);
    s.lastB = b; s.target = b; s.taps = []; s.phase = 'listen'; s.done = false;
    const t = tempoOf(b);
    document.getElementById('tgt').innerHTML = '<b>' + b + '</b><span>BPM</span><div class="nm" style="--tc:' + t.c + '">' + t.nm + '</div>';
    document.getElementById('mark').style.display = 'none';
    paintDots(s.results, s.round);
    stop(); E.bpm = b;
    if (s.level === 'hard') { s.phase = 'tap'; setPad(); fb('Tap the drum ' + HIT_TAPS + ' times at <b>' + b + '</b> beats a minute. No help this time!'); return; }
    const count = s.level === 'easy' ? 8 : 2;
    fb('Listen first&hellip;');
    s.heard = 0;
    s.onBeat = () => {
      if (++s.heard >= count) { s.onBeat = null; cur.timer = setTimeout(() => { stop(); s.phase = 'tap'; setPad(); fb('Your turn! Tap the drum ' + HIT_TAPS + ' times. Keep the same speed.'); }, 60000 / b * 0.9); }
    };
    setPad(); start();
  }
  function fb(html) { document.getElementById('fb').innerHTML = html; }
  function setPad() {
    const s = cur, p = document.getElementById('pad'); if (!p) return;
    if (s.phase === 'listen') p.innerHTML = '<span><big>👂</big><small>LISTEN&hellip;</small></span>';
    else if (s.phase === 'tap') p.innerHTML = '<span><big>' + (HIT_TAPS - s.taps.length) + '</big><small>TAPS LEFT</small></span>';
    else p.innerHTML = '<span><big>🥁</big><small>DONE!</small></span>';
  }
  function hitTap() {
    const s = cur; if (s.phase !== 'tap') return;
    const p = document.getElementById('pad'); p.classList.add('hit'); setTimeout(() => p.classList.remove('hit'), 80);
    blip('drums');
    s.taps.push(performance.now());
    const n = s.taps.length;
    if (n >= 2) {
      const bpm = 60000 * (n - 1) / (s.taps[n - 1] - s.taps[0]);
      placeMark(bpm);
      fb('You\'re tapping <b>' + Math.round(bpm) + '</b> BPM&hellip;');
    }
    if (n >= HIT_TAPS) return finishHit();
    setPad();
  }
  function placeMark(bpm) {
    const m = document.getElementById('mark'), off = (bpm - cur.target) / cur.target;
    m.style.display = ''; m.style.left = (50 + clamp(off / 0.3, -1, 1) * 48) + '%';
  }
  function finishHit() {
    const s = cur; s.phase = 'done'; setPad();
    const bpm = 60000 * (s.taps.length - 1) / (s.taps[s.taps.length - 1] - s.taps[0]);
    const err = Math.abs(bpm - s.target) / s.target, away = Math.abs(Math.round(bpm) - s.target);
    const stars = err <= 0.03 ? 3 : err <= 0.07 ? 2 : err <= 0.15 ? 1 : 0;
    const pts = Math.round(100 * Math.max(0, 1 - err / 0.25)) + (stars === 3 ? 50 : 0);
    s.score += pts; s.results.push(stars >= 1);
    paintDots(s.results, -1); placeMark(bpm);
    const words = ['Good try!', 'Close!', 'Great!', 'PERFECT!'][stars];
    const dir = away === 0 ? 'Right on the number!' : 'Just ' + away + ' ' + (bpm > s.target ? 'too fast' : 'too slow') + '.';
    fb('<span class="yay">' + words + ' ' + '⭐'.repeat(stars) + ' +' + pts + '</span><br>You tapped <b>' + Math.round(bpm) + '</b> BPM. ' + dir +
      '<div class="btns"><button class="go ghost nav" data-act="hear">🔊 HEAR ' + s.target + '</button>' +
      '<button class="go nav" data-act="next-hit">' + (s.round + 1 >= HIT_ROUNDS ? 'SEE MY SCORE' : 'NEXT ▶') + '</button></div>');
    chime(stars >= 2);
    if (document.body.classList.contains('navmode')) setFocus(screen.querySelector('[data-act="next-hit"]'));
  }
  function nextHit() {
    const s = cur; stop(); s.round++;
    if (s.round >= HIT_ROUNDS) return goResult('hit', s.level, s.score, s.results.filter(Boolean).length, HIT_ROUNDS);
    hitRound();
  }

  // ----- result -----
  function goResult(g, level, score, right, total) {
    stop(); viewOpt = {};
    const frac = right / total, stars = frac >= 0.85 ? 3 : frac >= 0.5 ? 2 : 1;
    if (window.MickleScores) MickleScores.record('tick-tock-tempo', score, { category: (g === 'name' ? 'NAME IT ' : 'HIT IT ') + level.toUpperCase(), order: (g === 'name' ? 0 : 3) + ['easy', 'medium', 'hard'].indexOf(level) });
    const what = g === 'name' ? right + ' of ' + total + ' tempo words right' : right + ' of ' + total + ' rounds hit';
    setScreen('<div class="top"><button class="icon-btn nav" data-act="home" aria-label="Back">' + BACK_ICON + '</button><div class="tt"></div></div>' +
      '<div class="center-scr result"><h2>' + (stars === 3 ? 'TEMPO MASTER!' : stars === 2 ? 'NICE WORK!' : 'GOOD PRACTICE!') + '</h2>' +
      '<div class="stars">' + [0, 1, 2].map((i) => i < stars ? '⭐' : '<span class="off">⭐</span>').join('') + '</div>' +
      '<div class="big">' + score + '</div><p>' + what + '</p>' +
      '<div class="btns"><button class="go nav" data-act="play-' + g + '" data-l="' + level + '">PLAY AGAIN</button>' +
      '<button class="go blue nav" data-act="levels" data-g="' + g + '">LEVELS</button><button class="go ghost nav" data-act="home">MENU</button></div></div>',
      { name: 'result', g, level });
    chime(true);
  }

  // ---------- how to play ----------
  const howtoOpen = () => !howto.hidden;
  function openHowto() { howto.hidden = false; setFocus(null); if (document.body.classList.contains('navmode')) setFocus(document.getElementById('btn-howto-close')); }
  function closeHowto() { howto.hidden = true; setFocus(null); }
  document.getElementById('btn-howto-close').addEventListener('click', closeHowto);
  document.getElementById('btn-howto').addEventListener('click', () => { if (window.MickleMenu) MickleMenu.close(); openHowto(); });

  // ---------- actions ----------
  function act(a, el) {
    const d = (el && el.dataset) || {};
    switch (a) {
      case 'home': return goTitle();
      case 'metro': return goMetro();
      case 'howto': return openHowto();
      case 'levels': return goLevels(d.g);
      case 'play-name': return startName(d.l);
      case 'play-hit': return startHit(d.l);
      case 'play': return togglePlay();
      case 'add': return setTempo(Math.round(E.bpm) + (+d.n));
      case 'say': return say(tempoOf(E.bpm));
      case 'jump': return jump(d.id);
      case 'voice':
        save.voice = !save.voice; store();
        if (!save.voice && window.MickleVoice) MickleVoice.cancel();
        return renderOpts();
      case 'view': view = d.v; save.view = view; store(); return renderOpts();
      case 'beats': E.beats = +d.n; save.beats = E.beats; store(); return renderOpts();
      case 'sound': E.sound = d.s; save.sound = E.sound; store(); if (!E.playing) blip(); return renderOpts();
      case 'ramp': {
        const r = +d.r;
        if (E.ramp === r) E.ramp = 0;
        else { if (!E.ramp) E.rampFrom = Math.round(E.bpm); if (!E.playing) { start(); renderPlay(); } E.ramp = r; }
        return renderOpts();
      }
      case 'atempo': if (E.rampFrom) { setTempo(E.rampFrom); E.rampFrom = 0; } return;
      case 'answer': return answerName(+d.i);
      case 'next-name': return nextName();
      case 'next-hit': return nextHit();
      case 'hear': { const s = cur; s.heard = 0; E.bpm = s.target; s.onBeat = () => { if (++s.heard >= 6) { s.onBeat = null; s.timer = setTimeout(stop, 60000 / s.target * 0.9); } }; start(); return; }
    }
  }
  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !screen.contains(el)) return;
    document.body.classList.remove('navmode');
    audio();
    act(el.dataset.act, el);
  });
  // TAP and the drum go on pointerdown: waiting for "click" (finger up) would make every tap late
  stage.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-press]');
    if (!el || !screen.contains(el)) return;
    e.preventDefault();
    document.body.classList.remove('navmode');
    audio();
    if (el.dataset.press === 'tap') tapTempo(); else hitTap();
  });

  // ---------- keyboard / controller ----------
  let focused = null;
  function setFocus(el) {
    if (focused) focused.classList.remove('foc');
    focused = el || null;
    if (focused) { focused.classList.add('foc'); try { focused.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  function navEls() { return [...(howtoOpen() ? howto : screen).querySelectorAll('.nav')].filter((b) => !b.disabled && b.offsetParent !== null); }
  function move(dx, dy) {
    document.body.classList.add('navmode');
    const els = navEls(); if (!els.length) return;
    if (!focused || !els.includes(focused)) return setFocus(els[0]);
    const r = focused.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === focused) continue;
      const q = el.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      const along = (ex - x) * dx + (ey - y) * dy, side = Math.abs((ex - x) * dy) + Math.abs((ey - y) * dx);
      if (along <= 4) continue;
      const sc = along + side * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) setFocus(best);
  }
  function press() {
    document.body.classList.add('navmode');
    if (howtoOpen()) return closeHowto();
    if (!focused || !screen.contains(focused)) return setFocus(navEls()[0]);
    audio();
    if (focused.dataset.press) { if (focused.dataset.press === 'tap') tapTempo(); else hitTap(); return; }
    act(focused.dataset.act, focused);
  }
  function back() {
    if (howtoOpen()) return closeHowto();
    if (cur.name === 'title') { if (window.MickleMenu) MickleMenu.backToArcade(); return; }
    if (cur.name === 'name' || cur.name === 'hit') return goLevels(cur.name);
    goTitle();
  }
  // the main action of a screen: start / stop on the metronome, the drum in HIT THE NUMBER
  function primary() {
    if (howtoOpen()) return closeHowto();
    if (cur.name === 'metro' && !(document.body.classList.contains('navmode') && focused)) { audio(); return togglePlay(); }
    if (cur.name === 'hit' && cur.phase === 'tap') { audio(); return hitTap(); }
    press();
  }
  document.addEventListener('keydown', (e) => {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    if (e.repeat && (e.key === ' ' || e.key === 't' || e.key === 'T')) return;
    const k = e.key, m = cur.name === 'metro' && !howtoOpen();
    if (m && k === 'ArrowUp') act('add', { dataset: { n: e.shiftKey ? 10 : 1 } });
    else if (m && k === 'ArrowDown') act('add', { dataset: { n: e.shiftKey ? -10 : -1 } });
    else if (m && k === 'ArrowRight') act('add', { dataset: { n: 5 } });
    else if (m && k === 'ArrowLeft') act('add', { dataset: { n: -5 } });
    else if (m && (k === 't' || k === 'T')) { audio(); tapTempo(); }
    else if (m && k === ' ') { audio(); togglePlay(); }
    else if (cur.name === 'hit' && cur.phase === 'tap' && (k === ' ' || k === 't' || k === 'T')) { audio(); hitTap(); }
    else if (k === 'ArrowLeft') move(-1, 0); else if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowUp') move(0, -1); else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Enter' || k === ' ') press();
    else if (k === 'Escape' || k === 'Backspace') back();
    else if (cur.name === 'name' && /^[1-4]$/.test(k)) { if (!cur.locked && +k <= cur.choices.length) answerName(+k - 1); }
    else if (k === 'h' || k === 'H' || k === '?') { if (howtoOpen()) closeHowto(); else openHowto(); }
    else return;
    e.preventDefault();
  });

  function loop() {
    if (window.Pad360) {
      Pad360.poll();
      if (!(window.MickleMenu && MickleMenu.isOpen())) {
        const B = Pad360.BTN, dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
        if (cur.name === 'metro' && !howtoOpen()) {
          if (dy) act('add', { dataset: { n: -dy } });
          if (dx) act('add', { dataset: { n: dx * 5 } });
          if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) { audio(); togglePlay(); }
          if (Pad360.pressed(B.X)) { audio(); tapTempo(); }
          if (Pad360.pressed(B.Y)) say(tempoOf(E.bpm));
          if (Pad360.pressed(B.LB)) act('beats', { dataset: { n: E.beats > 1 ? E.beats - 1 : 7 } });
          if (Pad360.pressed(B.RB)) act('beats', { dataset: { n: E.beats < 7 ? E.beats + 1 : 1 } });
        } else {
          if (dx || dy) move(dx, dy);
          if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) primary();
          if (Pad360.pressed(B.Y) && cur.name === 'title') openHowto();
        }
        if (Pad360.pressed(B.B)) back();
      }
    }
    if (needUi) { needUi = false; save.bpm = Math.round(E.bpm); renderMetro(); renderOpts(); }
    frame();
    requestAnimationFrame(loop);
  }

  window.TickTockDebug = { E, TEMPOS, tempoOf, bpmToT, tToBpm, get state() { return cur; }, goMetro, goTitle, startName, startHit, setTempo, act };
  fit();
  goTitle();
  requestAnimationFrame(loop);
})();
