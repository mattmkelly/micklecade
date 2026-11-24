// Globe Sleuths -- a geography mystery game for kindergarten to 6th grade, with Finn the fennec fox.
// Screens: TITLE (pick a grade) -> BOARD (6 case folders, the BIG CASE poster, the NOTEBOOK)
// -> CASE (clues in the notepad, answer on the map / pictures / evidence) -> SOLVED card -> BOARD.
// The BIG CASE chases Rascal the raccoon through 5 places in a row and records a high score.
// It is all DOM inside #stage; 1em = 1/30 of the stage's height (see fit()).
// Content (clues, facts, pictures) lives in cases.js; the world map in worldmap.js.
(function () {
  'use strict';
  const { ITEMS, ART } = window.GlobeSleuths;
  const MAP = window.MDMap;
  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');
  const SAVE_KEY = 'globeSleuths.save';
  const BOARD_N = 6, CHASE_N = 5;

  const byId = {};
  ITEMS.forEach((it) => { byId[it.id] = it; });
  const CONTS = ['NA', 'SA', 'EU', 'AF', 'AS', 'AU', 'AN'];
  const OCEANS = ['pacific', 'atlantic', 'indian', 'arctic', 'southern'];
  const LETTERS = ['A', 'B', 'C', 'D'];
  const PIN_COLORS = ['#ef4444', '#3b82f6', '#16a34a', '#a855f7'];

  const GRADES = [
    { n: 0, label: 'KINDERGARTEN', short: 'KINDER', blurb: 'Continents, animals & land shapes' },
    { n: 1, label: 'GRADE 1', short: 'GRADE 1', blurb: 'Continents, oceans & big countries' },
    { n: 2, label: 'GRADE 2', short: 'GRADE 2', blurb: 'Countries, wonders & map tools' },
    { n: 3, label: 'GRADE 3', short: 'GRADE 3', blurb: 'Mountains, rivers & landforms' },
    { n: 4, label: 'GRADE 4', short: 'GRADE 4', blurb: 'Hemispheres, falls & fjords' },
    { n: 5, label: 'GRADE 5', short: 'GRADE 5', blurb: 'Capitals, latitude & volcanoes' },
    { n: 6, label: 'GRADE 6', short: 'GRADE 6', blurb: 'Master detective: the world!' },
  ];
  // How often each kind of case turns up on a grade's board.
  const WEIGHTS = [
    { continent: 3, animal: 3, landform: 3 },
    { continent: 2, animal: 2, landform: 2, country: 3, ocean: 1.5 },
    { continent: 1, animal: 1, ocean: 1.5, landform: 2, country: 3, wonder: 2, skill: 1 },
    { continent: 0.5, ocean: 1, landform: 2, country: 3, wonder: 3, skill: 1.2 },
    { ocean: 0.6, landform: 2, country: 3, wonder: 3, skill: 1.5 },
    { landform: 1.5, country: 2.5, wonder: 3, city: 2.2, skill: 1.5 },
    { landform: 1.5, country: 2.5, wonder: 3, city: 2.2, skill: 1.5 },
  ];
  const KIND = {
    continent: { ask: 'Which continent is it?', tag: 'WHICH CONTINENT?', mode: 'cont', book: 'CONTINENTS', tip: 'Tap the right continent on the map!' },
    animal: { ask: 'Where does this animal live?', tag: 'ANIMAL HOME', mode: 'cont', book: 'ANIMAL HOMES', tip: 'Tap the continent where it lives!' },
    ocean: { ask: 'Which ocean is it?', tag: 'WHICH OCEAN?', mode: 'ocean', book: 'OCEANS', tip: 'Tap the right ocean on the map!' },
    country: { ask: 'Which country is it?', tag: 'WHICH COUNTRY?', mode: 'pin', book: 'COUNTRIES', tip: 'Tap the pin for the right country!' },
    wonder: { ask: 'Which place is it?', tag: 'WORLD WONDER', mode: 'pin', book: 'WONDERS', tip: 'Tap the pin for the right place!' },
    city: { ask: 'Which capital city is it?', tag: 'CAPITAL CITY', mode: 'pin', book: 'CAPITAL CITIES', tip: 'Tap the pin for the right city!' },
    landform: { ask: 'What kind of place is it?', tag: 'LAND SHAPE', mode: 'pics', book: 'LAND SHAPES', tip: 'Tap the picture that matches!' },
    skill: { ask: 'Evidence check!', tag: 'MAP SKILLS', mode: 'text', book: 'MAP SKILLS', tip: 'Pick the right answer!' },
  };
  const KIND_ORDER = ['continent', 'animal', 'ocean', 'country', 'wonder', 'city', 'landform', 'skill'];
  const STORIES = [
    ['The Mystery Postcard', 'A postcard arrived with no address on it!'],
    ['The Secret Note', 'Rascal the raccoon left a secret note on your desk!'],
    ['The Bottle on the Beach', 'A message in a bottle washed up on the beach!'],
    ['The Sticker Suitcase', 'A lost suitcase turned up, covered in travel stickers!'],
    ['The Pigeon Post', 'A pigeon flew in with a mystery letter!'],
    ['The Dropped Diary', 'Someone dropped a travel diary. Who wrote it, and where?'],
    ['The Blurry Photo', 'A blurry photo was slipped under the door!'],
    ['The Muddy Map', 'A muddy map was found with one spot circled!'],
  ];
  const RANKS = [[0, 'Rookie'], [5, 'Junior Detective'], [15, 'Detective'], [30, 'Senior Detective'], [60, 'Chief Inspector'], [100, 'Master Detective']];
  const CHEERS = ['Case closed!', 'Great detective work!', 'You cracked it!', 'Brilliant!', 'Super sleuthing!', 'Mystery solved!', 'Nailed it!'];
  const OOPS = ['Hmm, not that one. Here’s another clue!', 'Not quite! Let’s look at the next clue.', 'Good guess, but no. Try a new clue!'];
  const OOPS_LAST = ['Not that one. Look again at the clues!', 'Hmm, try a different one!'];
  const rnd = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // ---------- save ----------
  let save = { files: {}, boards: {}, chase: {}, read: null, grade: null, caseNo: {} };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) { /* no storage */ }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* full or blocked */ } }

  // ---------- sizing: 1em = stage height / 30 ----------
  let fxScale = 1;
  function fit() {
    const r = stage.getBoundingClientRect();
    stage.style.fontSize = (r.height / 30) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.round(r.width * dpr); fx.height = Math.round(r.height * dpr);
    fxScale = dpr;
    if (mapState) placeMarkers();
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  // ---------- sound: soft sine / triangle chimes ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type = 'sine', vol = 0.12, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    tap() { tone(660, 0.06, 'sine', 0.06); },
    clue() { tone(523, 0.08, 'triangle', 0.07); tone(784, 0.12, 'triangle', 0.06, 0.07); },
    right() { tone(784, 0.18, 'triangle', 0.1); tone(1047, 0.25, 'triangle', 0.1, 0.09); tone(1568, 0.3, 'sine', 0.05, 0.18); },
    wrong() { tone(330, 0.14, 'sine', 0.08); tone(262, 0.2, 'sine', 0.07, 0.1); },
    stamp() { tone(140, 0.12, 'triangle', 0.14); tone(90, 0.18, 'sine', 0.12, 0.02); },
    star(i) { tone(880 * Math.pow(1.26, i), 0.3, 'triangle', 0.09); },
    fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, 'triangle', 0.09, i * 0.12)); },
    whoosh() { const a = audio(); if (!a) return; for (let i = 0; i < 6; i++) tone(300 + i * 90, 0.08, 'sine', 0.035, i * 0.04); },
  };

  // ---------- reading aloud ----------
  const deco = document.createElement('textarea');
  function sayOf(html) {
    let s = String(html).replace(/<br\s*\/?>/g, '. ').replace(/<[^>]+>/g, ' ');
    deco.innerHTML = s; s = deco.value;
    return s.replace(/___/g, ' blank ').replace(/°/g, ' degrees').replace(/\bN\b(?=[\s.,]|$)/g, 'north').replace(/Δ/g, 'delta').replace(/\s+/g, ' ').trim();
  }
  function readOn() { return save.read === null ? (cur.grade == null ? 1 : cur.grade) <= 2 : save.read; }
  function say(html, force) {
    if (!('speechSynthesis' in window)) return;
    if (!force && !readOn()) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sayOf(html));
      u.rate = 0.92; u.pitch = 1.1; u.lang = 'en-US';
      speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }
  function hush() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* */ } }

  // ---------- characters ----------
  function finnSVG(cls = '') {
    return `<svg class="finn ${cls}" viewBox="-62 -86 124 158" aria-hidden="true">
      <ellipse cx="0" cy="68" rx="36" ry="5" fill="rgba(0,0,0,.25)"/>
      <path d="M22 50 q34 6 34 -22 q0 -12 -8 -18 q2 18 -14 24 q-8 4 -16 6z" fill="#f3b06a" stroke="#c97b2e" stroke-width="2"/>
      <path d="M48 10 q8 6 8 18 q-4 -4 -10 -6 q4 -6 2 -12z" fill="#fff7ea"/>
      <rect x="-20" y="44" width="10" height="24" rx="5" fill="#e8a25a"/><rect x="10" y="44" width="10" height="24" rx="5" fill="#e8a25a"/>
      <ellipse cx="-15" cy="67" rx="7" ry="3.5" fill="#7c4a1e"/><ellipse cx="15" cy="67" rx="7" ry="3.5" fill="#7c4a1e"/>
      <path d="M-26 28 q0 -18 26 -18 q26 0 26 18 v16 q0 10 -26 10 q-26 0 -26 -10z" fill="#3b6ea5"/>
      <path d="M-26 28 q0 -18 26 -18 q26 0 26 18 v16 q0 10 -26 10 q-26 0 -26 -10z" fill="none" stroke="#24476e" stroke-width="2"/>
      <path d="M0 12 v40" stroke="#24476e" stroke-width="2"/><circle cx="-4" cy="26" r="2" fill="#fcd34d"/><circle cx="-4" cy="38" r="2" fill="#fcd34d"/>
      <path d="M-14 10 l14 12 l14 -12 l-6 -2 l-8 8 l-8 -8z" fill="#fff7ea"/>
      <path d="M-40 -78 L-30 -34 L-10 -40z" fill="#f3b06a" stroke="#c97b2e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M40 -78 L30 -34 L10 -40z" fill="#f3b06a" stroke="#c97b2e" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-36 -68 L-29 -40 L-16 -43z" fill="#fbcfe8"/><path d="M36 -68 L29 -40 L16 -43z" fill="#fbcfe8"/>
      <ellipse cx="0" cy="-18" rx="27" ry="23" fill="#f3b06a" stroke="#c97b2e" stroke-width="2"/>
      <path d="M-22 -10 q8 18 22 18 q14 0 22 -18 q-10 6 -22 -2 q-12 8 -22 2z" fill="#fff7ea"/>
      <circle cx="-10" cy="-20" r="5" fill="#1e293b"/><circle cx="10" cy="-20" r="5" fill="#1e293b"/>
      <circle cx="-8" cy="-22" r="1.8" fill="#fff"/><circle cx="12" cy="-22" r="1.8" fill="#fff"/>
      <ellipse cx="-18" cy="-10" rx="4.5" ry="2.6" fill="#fda4af" opacity=".7"/><ellipse cx="18" cy="-10" rx="4.5" ry="2.6" fill="#fda4af" opacity=".7"/>
      <ellipse cx="0" cy="-8" rx="4.5" ry="3.2" fill="#1e293b"/>
      <path d="M-5 -2 q5 5 10 0" stroke="#7c2d12" stroke-width="2" fill="none" stroke-linecap="round"/>
      <path d="M-24 -34 q2 -22 24 -22 q22 0 24 22z" fill="#a0733f" stroke="#6b4423" stroke-width="2"/>
      <path d="M-16 -50 q0 10 -2 16 M-6 -55 v21 M6 -55 v21 M16 -50 q0 10 2 16 M-22 -42 h44" stroke="#6b4423" stroke-width="1.4" fill="none"/>
      <path d="M-30 -34 h60 q-4 6 -30 6 q-26 0 -30 -6z" fill="#8a5f31" stroke="#6b4423" stroke-width="2"/>
      <circle cx="0" cy="-56" r="3" fill="#6b4423"/>
      <path d="M34 32 l-12 14" stroke="#7c4a1e" stroke-width="5" stroke-linecap="round"/>
      <circle cx="40" cy="22" r="12" fill="rgba(186,230,253,.55)" stroke="#b45309" stroke-width="4"/>
      <path d="M34 16 q4 -4 9 -3" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      <ellipse cx="26" cy="40" rx="6" ry="5" fill="#f3b06a" stroke="#c97b2e" stroke-width="1.6"/>
    </svg>`;
  }
  function rascalSVG(cls = '') {
    return `<svg class="rascal ${cls}" viewBox="-64 -62 128 118" aria-hidden="true">
      <ellipse cx="0" cy="50" rx="34" ry="5" fill="rgba(0,0,0,.2)"/>
      <path d="M-20 34 q-40 4 -40 -24 q0 -10 6 -14 q4 22 34 22z" fill="#9ca3af" stroke="#4b5563" stroke-width="2"/>
      <path d="M-50 -2 q2 6 6 8 M-56 10 q4 4 10 4 M-48 22 q4 2 10 0" stroke="#374151" stroke-width="5" fill="none" stroke-linecap="round"/>
      <rect x="-18" y="30" width="10" height="18" rx="5" fill="#6b7280"/><rect x="8" y="30" width="10" height="18" rx="5" fill="#6b7280"/>
      <ellipse cx="0" cy="22" rx="24" ry="20" fill="#9ca3af" stroke="#4b5563" stroke-width="2"/>
      <ellipse cx="0" cy="26" rx="14" ry="13" fill="#e5e7eb"/>
      <path d="M-28 -40 l6 -16 l12 12z M28 -40 l-6 -16 l-12 12z" fill="#9ca3af" stroke="#4b5563" stroke-width="2" stroke-linejoin="round"/>
      <path d="M-24 -42 l3 -9 l6 6z M24 -42 l-3 -9 l-6 6z" fill="#374151"/>
      <ellipse cx="0" cy="-20" rx="30" ry="24" fill="#9ca3af" stroke="#4b5563" stroke-width="2"/>
      <path d="M-28 -22 q14 -12 28 -2 q14 -10 28 2 q-4 12 -16 10 q-8 -2 -12 -6 q-4 4 -12 6 q-12 2 -16 -10z" fill="#1f2937"/>
      <path d="M-14 -6 q14 16 28 0 q-4 12 -14 12 q-10 0 -14 -12z" fill="#f3f4f6"/>
      <circle cx="-11" cy="-19" r="4.5" fill="#fff"/><circle cx="11" cy="-19" r="4.5" fill="#fff"/>
      <circle cx="-10" cy="-19" r="2.4" fill="#111827"/><circle cx="12" cy="-19" r="2.4" fill="#111827"/>
      <ellipse cx="0" cy="-6" rx="4.5" ry="3" fill="#111827"/>
      <path d="M-5 0 q5 4 10 0" stroke="#111827" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      <path d="M-30 -32 q30 -10 60 0" stroke="#92400e" stroke-width="5" fill="none"/>
      <circle cx="-11" cy="-36" r="7" fill="#7dd3fc" stroke="#78350f" stroke-width="3"/><circle cx="11" cy="-36" r="7" fill="#7dd3fc" stroke="#78350f" stroke-width="3"/>
      <path d="M-14 -38 q2 -3 5 -3 M8 -38 q2 -3 5 -3" stroke="#fff" stroke-width="1.6" fill="none"/>
      <circle cx="0" cy="22" r="13" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>
      <path d="M-13 22 h26 M0 9 q-8 13 0 26 M0 9 q8 13 0 26" stroke="#b45309" stroke-width="1.4" fill="none"/>
      <path d="M-6 14 q4 -2 6 2 q-2 4 -6 2z M4 24 q4 0 5 4 q-4 2 -5 -4z" fill="#d97706"/>
      <ellipse cx="-14" cy="26" rx="6" ry="5" fill="#6b7280"/><ellipse cx="14" cy="26" rx="6" ry="5" fill="#6b7280"/>
    </svg>`;
  }
  const artSVG = (key, cls = "", fit = "slice") => `<svg class="${cls}" viewBox="0 0 120 80" preserveAspectRatio="xMidYMid ${fit}" aria-hidden="true">${ART[key] || ""}</svg>`;
  const iconOf = (it) => (it.art ? artSVG(it.art) : esc(it.i || '❓'));

  // ---------- state ----------
  let cur = { name: 'title', grade: save.grade };
  let mapState = null; // the live map on a case screen
  const gradeOf = (n) => GRADES.find((g) => g.n === n) || GRADES[0];
  const grade = () => gradeOf(cur.grade);
  const inGrade = (it, g) => it.g[0] <= g && g <= it.g[1];
  const poolFor = (g) => ITEMS.filter((it) => inGrade(it, g));
  const filed = (id) => save.files[id] || 0;
  const filedCount = () => Object.keys(save.files).length;
  const rankOf = (n) => RANKS.reduce((r, x) => (n >= x[0] ? x : r), RANKS[0])[1];
  const starStr = (n, of = 3) => Array.from({ length: of }, (_, i) => (i < n ? '★' : '<span class="off">★</span>')).join('');
  const topBar = (back, title, right = '') => `<div class="top"><button class="pill nav" data-act="back">◀ ${back}</button><div class="tt">${title}</div><div class="tr">${right}</div></div>`;
  const speakBtn = () => `<button class="icon-btn nav" data-act="speak" aria-label="Read it to me">\u{1F50A}</button>`;

  function show(html, focusSel) {
    hush();
    mapState = null;
    screen.innerHTML = html;
    const first = (focusSel && screen.querySelector(focusSel)) || screen.querySelector('[data-default]') || screen.querySelector('.nav');
    setFocus(first);
  }

  // ---------- TITLE ----------
  function goTitle() {
    cur = { name: 'title', grade: save.grade };
    const btns = GRADES.map((g) => {
      const pool = poolFor(g.n), got = pool.filter((it) => filed(it.id)).length;
      return `<button class="grade nav" data-act="grade" data-g="${g.n}"${save.grade === g.n ? ' data-default' : ''}><b>${g.short}</b><span>${g.blurb}</span><em>\u{1F4C1} ${got}/${pool.length}</em></button>`;
    }).join('');
    const ro = save.read === null ? 'AUTO' : save.read ? 'ON' : 'OFF';
    const n = filedCount();
    show(`<div class="title-scr">
      <div class="logo-row rise">${finnSVG()}<div><h1 class="logo"><small>FINN THE FOX IN</small>GLOBE<br>SLEUTHS</h1><p>Follow the clues. Find the place. Solve the case!</p></div></div>
      <div class="grades rise" style="animation-delay:.1s">${btns}</div>
      <div class="title-row rise" style="animation-delay:.18s"><span class="rank">\u{1F50E} ${rankOf(n).toUpperCase()} · ${n} CASE FILES</span><button class="pill nav" data-act="read">\u{1F50A} READ TO ME: ${ro}</button></div>
    </div>`);
  }

  // ---------- making cases ----------
  function pickWeighted(weights) {
    const ks = Object.keys(weights).filter((k) => weights[k] > 0);
    let t = ks.reduce((s, k) => s + weights[k], 0), r = Math.random() * t;
    for (const k of ks) { r -= weights[k]; if (r <= 0) return k; }
    return ks[ks.length - 1];
  }
  function newBoard(g) {
    const pool = poolFor(g), w = Object.assign({}, WEIGHTS[g]), list = [];
    const old = (save.boards['g' + g] || {}).list || [];
    for (let slot = 0; slot < BOARD_N; slot++) {
      let tries = 0, pick = null;
      while (!pick && tries++ < 40) {
        const k = pickWeighted(w);
        const ofKind = pool.filter((it) => it.k === k && !list.includes(it.id));
        if (!ofKind.length) { w[k] = 0; if (!Object.values(w).some((v) => v > 0)) break; continue; }
        // Unsolved first, and not the ones from the last board.
        const fresh = ofKind.filter((it) => !filed(it.id) && !old.includes(it.id));
        const notOld = ofKind.filter((it) => !old.includes(it.id));
        pick = rnd(fresh.length ? fresh : notOld.length ? notOld : ofKind);
        w[k] *= 0.6; // spread the kinds out
      }
      if (pick) list.push(pick.id);
    }
    save.caseNo['g' + g] = (save.caseNo['g' + g] || 0) + BOARD_N;
    save.boards['g' + g] = { list: shuffle(list), done: {}, first: save.caseNo['g' + g] - BOARD_N + 1 };
    store();
    return save.boards['g' + g];
  }
  function boardFor(g) {
    const b = save.boards['g' + g];
    if (!b || !Array.isArray(b.list) || b.list.length !== BOARD_N || b.list.some((id) => !byId[id])) return newBoard(g);
    return b;
  }

  // Wrap-aware distance in degrees between two places.
  function dist(a, b) {
    let dl = Math.abs(a.lon - b.lon); if (dl > 180) dl = 360 - dl;
    return Math.hypot(dl, a.lat - b.lat);
  }
  function placeOptions(item, g, n) {
    let pool = ITEMS.filter((it) => it.k === item.k && it.id !== item.id && inGrade(it, g));
    if (pool.length < 8) pool = ITEMS.filter((it) => it.k === item.k && it.id !== item.id && it.g[0] <= g + 1);
    const minD = g <= 2 ? 24 : g <= 4 ? 13 : 7;
    for (let relax = 0; relax < 4; relax++) {
      const d = minD * (1 - relax * 0.3), picked = [item];
      const cands = shuffle(pool);
      // Older detectives get a near neighbour to tell apart.
      if (g >= 4) { const near = cands.find((c) => c.c === item.c && dist(c, item) >= d); if (near) picked.push(near); }
      for (const c of cands) {
        if (picked.length >= n) break;
        if (picked.includes(c)) continue;
        if (picked.every((p) => dist(p, c) >= d)) picked.push(c);
      }
      if (picked.length >= n) return shuffle(picked);
    }
    return shuffle([item].concat(shuffle(pool).slice(0, n - 1)));
  }
  function buildCase(item, g) {
    const kind = KIND[item.k], n = g === 0 ? 3 : 4;
    let opts, answer;
    if (kind.mode === 'cont') {
      answer = item.k === 'continent' ? item.id : item.c;
      opts = shuffle([answer].concat(shuffle(CONTS.filter((c) => c !== answer)).slice(0, n - 1))).map((id) => ({ id, label: byId[id].n }));
    } else if (kind.mode === 'ocean') {
      answer = item.id;
      opts = shuffle([answer].concat(shuffle(OCEANS.filter((c) => c !== answer)).slice(0, n - 1))).map((id) => ({ id, label: byId[id].n }));
    } else if (kind.mode === 'pin') {
      answer = item.id;
      opts = placeOptions(item, g, n).map((it) => ({ id: it.id, label: it.n, lon: it.lon, lat: it.lat }));
    } else if (kind.mode === 'pics') {
      answer = item.id;
      const known = ITEMS.filter((it) => it.k === 'landform' && it.id !== item.id && it.g[0] <= Math.max(g, 1));
      const near = known.filter((it) => inGrade(it, g));
      const others = shuffle(near).concat(shuffle(known.filter((it) => !near.includes(it))));
      opts = shuffle([item].concat(others.slice(0, n - 1))).map((it) => ({ id: it.id, label: it.n }));
    } else {
      answer = item.choices[0];
      opts = shuffle(item.choices).map((c) => ({ id: c, label: c }));
    }
    const story = rnd(STORIES);
    return { item, kind, opts, answer, story, shown: 1, asked: 0, wrong: 0, bad: [] };
  }

  // ---------- BOARD ----------
  function goBoard(focusId) {
    cur = { name: 'board', grade: cur.grade };
    save.grade = cur.grade; store();
    const g = grade(), b = boardFor(g.n);
    const doneN = b.list.filter((id) => b.done[id]).length;
    const folders = b.list.map((id, i) => {
      const it = byId[id], st = b.done[id] || 0, k = KIND[it.k];
      const face = st ? `<div class="ic">${it.art ? artSVG(it.art) : esc(it.i)}</div><div class="nm">${esc(it.n)}</div><div class="st">${starStr(st)}</div><div class="stamp">SOLVED</div>`
        : `<div class="ic q">?</div><div class="kind">${k.tag}</div><div class="nm"></div>`;
      const isDefault = focusId ? focusId === id : (!st && b.list.findIndex((x) => !b.done[x]) === i);
      return `<button class="folder nav${st ? ' done' : ''}" data-act="case" data-i="${i}" data-tab="CASE #${b.first + i}"${isDefault ? ' data-default' : ''}><span class="pinhead"></span>${face}</button>`;
    }).join('');
    const best = save.chase['g' + g.n] || 0;
    const msg = doneN === 0 ? 'New cases! Pick any folder to start.' : doneN < BOARD_N ? `${doneN} of ${BOARD_N} cases solved. Keep going, detective!` : 'Every case is solved! Get NEW CASES, or chase Rascal in the BIG CASE.';
    const pool = poolFor(g.n), got = pool.filter((it) => filed(it.id)).length;
    show(`${topBar('GRADES', `CASE BOARD · ${g.label}`, `<span class="chip">\u{1F4C1} ${got}/${pool.length}</span>`)}
      <div class="cork">
        <div class="board-msg">${finnSVG()}<span>${msg}</span></div>
        <div class="folders">${folders}</div>
        <div class="side">
          <button class="wanted nav" data-act="chase"${(focusId === 'chase' || (!focusId && doneN === BOARD_N)) ? ' data-default' : ''}><h3>WANTED</h3>${rascalSVG()}<p><b>BIG CASE:</b> Rascal borrowed the Golden Globe! Chase him to ${CHASE_N} places.</p><p>${best ? '\u{1F3C6} BEST ' + best : 'Can you catch him?'}</p></button>
          <button class="go blue nav" data-act="book">\u{1F4D2} NOTEBOOK</button>
          ${doneN === BOARD_N ? '<button class="go gold nav" data-act="newboard">✨ NEW CASES</button>' : ''}
        </div>
      </div>`);
  }

  // ---------- CASE ----------
  function startCase(i) {
    const b = boardFor(cur.grade);
    const item = byId[b.list[i]];
    cur = { name: 'case', grade: cur.grade, bi: i, cs: buildCase(item, cur.grade) };
    renderCase();
  }
  function startChase() {
    const g = cur.grade;
    const kinds = g <= 0 ? ['continent', 'animal'] : g === 1 ? ['continent', 'animal', 'country', 'ocean'] : g === 2 ? ['country', 'wonder', 'ocean', 'continent'] : g <= 4 ? ['country', 'wonder'] : ['country', 'wonder', 'city'];
    const pool = shuffle(poolFor(g).filter((it) => kinds.includes(it.k)));
    const stops = [];
    for (const it of pool) {
      if (stops.length >= CHASE_N) break;
      const loc = locOf(it);
      // Spread the trail out and don't land on the same continent twice in a row for little ones.
      if (stops.some((s) => locDist(locOf(s), loc) < 18)) continue;
      if (g <= 1 && stops.some((s) => answerOf(s) === answerOf(it))) continue;
      stops.push(it);
    }
    for (const it of pool) { if (stops.length >= CHASE_N) break; if (!stops.includes(it)) stops.push(it); }
    cur = { name: 'case', grade: g, chase: { stops, i: 0, total: 0, streak: 0, trail: [], results: [] } };
    nextChaseStop();
  }
  const answerOf = (it) => (it.k === 'animal' ? it.c : it.id);
  function locOf(it) {
    const id = answerOf(it);
    if (SPOT[id]) return { lon: SPOT[id][0], lat: SPOT[id][1] };
    return { lon: it.lon, lat: it.lat };
  }
  const locDist = (a, b) => dist(a, b);
  function nextChaseStop() {
    const ch = cur.chase;
    cur.cs = buildCase(ch.stops[ch.i], cur.grade);
    cur.cs.story = ch.i === 0 ? ['The Golden Globe Chase', 'Rascal the raccoon borrowed the Golden Globe and flew off! Where did he go first?']
      : ['The Golden Globe Chase', rnd(['Rascal hopped on a plane again! Where is he now?', 'A new clue! Rascal is on the move.', 'Rascal left a paw print and a note. Follow him!', 'Someone saw a raccoon with goggles. Where?'])];
    renderCase();
  }

  function clueList(cs) {
    const c = cs.item.clues;
    return c.map((t, i) => (i < cs.shown
      ? `<li class="clue${i === cs.shown - 1 && i ? ' new' : ''}"><span class="num">${i + 1}</span><span>${esc(t)}</span></li>`
      : `<li class="clue lock"><span class="num">${i + 1}</span><span>Clue ${i + 1} is still a secret...</span></li>`)).join('');
  }
  function renderCase() {
    const cs = cur.cs, it = cs.item, k = cs.kind, g = grade();
    const ch = cur.chase;
    const right = ch
      ? `<div class="chase-bar">${ch.stops.map((_, i) => `<i class="${i < ch.i ? 'ok' : i === ch.i ? 'on' : ''}">${i < ch.i ? '✓' : ''}</i>`).join('')}</div><span class="chip score">${ch.total}</span>${speakBtn()}`
      : `<span class="chip">${k.tag}</span>${speakBtn()}`;
    const title = ch ? `BIG CASE · STOP ${ch.i + 1} OF ${CHASE_N}` : `CASE #${boardFor(g.n).first + cur.bi}: ${cs.story[0]}`;
    const left = clueLeft();
    const n = cs.opts.length;
    let main = '';
    if (k.mode === 'cont' || k.mode === 'ocean' || k.mode === 'pin') {
      main = `<div class="mapbox${k.mode === 'cont' ? ' pickc' : ''}" id="mapbox">${mapSVG()}<div class="pins" id="pins"></div></div>
        <div class="answers" style="--n:${n === 4 ? 2 : n}">${cs.opts.map((o, i) => ansBtn(o, i)).join('')}</div>`;
    } else if (k.mode === 'pics') {
      main = `<div class="pics" style="--n:${n === 4 ? 2 : 3}">${cs.opts.map((o, i) => `<button class="pic nav" data-act="ans" data-k="${i}" style="--pc:${PIN_COLORS[i]}">${artSVG(byId[o.id].art)}<div class="cap"><span class="let">${LETTERS[i]}</span>${esc(o.label)}</div></button>`).join('')}</div>`;
    } else {
      main = `<div class="evid"><div class="photo">${artSVG(it.art, "", "meet")}</div><div class="bigq paper">${esc(it.clues[0])}</div></div>
        <div class="answers" style="--n:2">${cs.opts.map((o, i) => ansBtn(o, i)).join('')}</div>`;
    }
    show(`${topBar(ch ? 'QUIT' : 'BOARD', title, right)}
      <div class="case">
        <div class="notepad paper rise">${left}</div>
        <div class="right rise" style="animation-delay:.06s" id="right">${main}</div>
      </div>`, '[data-act="ans"]');
    if (k.mode !== 'pics' && k.mode !== 'text') initMap();
    sayCaseStart();
  }
  function clueLeft() {
    const cs = cur.cs, k = cs.kind, it = cs.item;
    const isSkill = k.mode === 'text';
    const left = it.clues.length - cs.shown;
    const ask = it.k === 'animal' && cs.shown >= 3 ? `Where does the ${it.n.toLowerCase()} live?` : k.ask;
    return `<div class="brief">\u{1F4C1} ${esc(cs.story[1])}</div>
      <div class="ask">${esc(ask)}</div>
      <ul class="clues" id="clues">${isSkill ? hintList(cs) : clueList(cs)}</ul>
      <button class="go gold clue-btn nav" data-act="clue"${left <= 0 || cs.done ? ' disabled' : ''}>\u{1F50D} ${isSkill ? 'HINT' : 'NEXT CLUE'}${left > 0 ? ` (${left} left)` : ''}</button>
      <div class="np-foot">${finnSVG('think')}<div class="say" id="finnsay">${esc(cs.say || k.tip)}</div></div>`;
  }
  function hintList(cs) {
    // A skill's first "clue" is the question itself (shown big on the right), the rest are hints.
    const h = cs.item.clues.slice(1);
    const shownHints = cs.shown - 1;
    return h.map((t, i) => (i < shownHints
      ? `<li class="clue${i === shownHints - 1 ? ' new' : ''}"><span class="num">\u{1F4A1}</span><span>${esc(t)}</span></li>`
      : `<li class="clue lock"><span class="num">?</span><span>Hint ${i + 1} is still a secret...</span></li>`)).join('');
  }
  function ansBtn(o, i) {
    const cs = cur.cs;
    return `<button class="ans nav${cs.bad.includes(i) ? ' bad' : ''}" data-act="ans" data-k="${i}" style="--pc:${PIN_COLORS[i]}"><span class="let">${LETTERS[i]}</span><span>${esc(o.label)}</span></button>`;
  }
  function sayCaseStart() {
    const cs = cur.cs, k = cs.kind;
    if (k.mode === 'text') say(cs.item.clues[0]);
    else say(`${cs.story[1]} ${k.ask} Clue 1: ${cs.item.clues[0]}`);
  }
  function refreshNotepad() {
    const np = screen.querySelector('.notepad'); if (!np) return;
    const hadFocus = focused && focused.dataset.act === 'clue';
    np.innerHTML = clueLeft();
    if (hadFocus) { const b = np.querySelector('[data-act="clue"]'); setFocus(b && !b.disabled ? b : navEls().find((e) => e.dataset.act === 'ans')); }
  }
  function finnSay(text, mood) {
    cur.cs.say = text;
    const el = document.getElementById('finnsay'); if (el) el.textContent = text;
    const f = screen.querySelector('.np-foot .finn');
    if (f && mood) { f.classList.remove('happy', 'think'); void f.getBoundingClientRect(); f.classList.add(mood); }
  }
  function nextClue(free) {
    const cs = cur.cs;
    if (!cs || cs.done || cs.shown >= cs.item.clues.length) return false;
    cs.shown++; if (!free) cs.asked++;
    sfx.clue();
    refreshNotepad();
    const t = cs.item.clues[cs.shown - 1];
    say(cs.kind.mode === 'text' ? 'Hint: ' + t : `Clue ${cs.shown}: ${t}`);
    return true;
  }

  // ---------- the map ----------
  // Equal Earth projection (equal-area, so continents keep their true sizes); see worldmap.js.
  const P = (lon, lat) => MAP.project(lon, lat);
  const WORLD = [-164, -81, 328, 162];
  const LAND = { NA: '#fcd34d', SA: '#86efac', EU: '#c4b5fd', AF: '#fdba74', AS: '#f9a8d4', AU: '#fca5a5', AN: '#f8fafc', '': '#e2e8f0' };
  // Where each continent / ocean badge sits (lon, lat).
  const SPOT = {
    NA: [-100, 47], SA: [-59, -12], EU: [16, 51], AF: [20, 6], AS: [92, 47], AU: [134, -25], AN: [20, -80],
    pacific: [-140, 8], atlantic: [-38, 28], indian: [78, -20], arctic: [-150, 79], southern: [-105, -62],
  };
  const OCEAN_NAMES = { pacific: 'PACIFIC OCEAN', atlantic: 'ATLANTIC OCEAN', indian: 'INDIAN OCEAN', arctic: 'ARCTIC OCEAN', southern: 'SOUTHERN OCEAN' };
  // Seas and gulfs, by their internationally recognized names (IHO / UN usage).
  const WATERS = [
    ['Gulf of Mexico', -90, 25], ['Caribbean Sea', -75, 15], ['Hudson Bay', -86, 59], ['Gulf of Alaska', -145, 56.5], ['Bering Sea', -178, 58],
    ['Labrador Sea', -54, 58], ['Mediterranean Sea', 18, 34.5], ['North Sea', 3, 56], ['Baltic Sea', 19.5, 57.5], ['Black Sea', 34, 43.3],
    ['Caspian Sea', 50.8, 42], ['Red Sea', 38.5, 20], ['Arabian Sea', 64, 15], ['Bay of Bengal', 88, 15], ['South China Sea', 114, 13],
    ['Coral Sea', 155, -17], ['Tasman Sea', 162, -39], ['Gulf of Guinea', 2, 2], ['Barents Sea', 40, 73], ['Sea of Okhotsk', 150, 55],
    ['Philippine Sea', 132, 18], ['Gulf of California', -110.5, 27],
  ];
  // Provinces, states and territories, shown when zoomed in close.
  const REGIONS = [
    ['British Columbia', -125, 54], ['Alberta', -115, 55], ['Saskatchewan', -106, 54], ['Manitoba', -98, 55], ['Ontario', -86, 50],
    ['Quebec', -72, 52], ['Newfoundland and Labrador', -61, 53.5], ['New Brunswick', -66.5, 46.6], ['Nova Scotia', -63.3, 45.1],
    ['Yukon', -136, 64], ['Northwest Territories', -118, 64.5], ['Nunavut', -95, 66], ['Alaska', -152, 64.5], ['Hawaii', -157, 21.8],
    ['Western Australia', 122, -26], ['Northern Territory', 133.5, -20], ['South Australia', 135.5, -30], ['Queensland', 144.5, -22],
    ['New South Wales', 147, -32.5], ['Victoria', 144, -37], ['Tasmania', 146.5, -42],
  ];
  const byCountry = {};
  MAP.COUNTRIES.forEach((c, i) => { (byCountry[c.n] = byCountry[c.n] || []).push(i); });
  const countryOf = (name) => byCountry[name] || null;
  function countrySpot(name) {
    const list = byCountry[name] || [];
    const i = list.find((j) => MAP.COUNTRIES[j].lab);
    const c = MAP.COUNTRIES[i === undefined ? list[0] : i];
    if (!c) return null;
    return c.lab || [(c.box[0] + c.box[2]) / 2, (c.box[1] + c.box[3]) / 2];
  }
  const line = (pts) => 'M' + pts.map((p) => p.map((n) => n.toFixed(1)).join(' ')).join('L');
  let mapStatic = null;
  function mapSVG() {
    if (!mapStatic) {
      const edge = [];
      for (let la = -90; la <= 90; la += 5) edge.push(P(180, la));
      for (let la = 90; la >= -90; la -= 5) edge.push(P(-180, la));
      let grat = '';
      for (let la = -60; la <= 60; la += 30) { const pts = []; for (let lo = -180; lo <= 180; lo += 5) pts.push(P(lo, la)); grat += line(pts); }
      for (let lo = -150; lo <= 150; lo += 30) { const pts = []; for (let la = -90; la <= 90; la += 5) pts.push(P(lo, la)); grat += line(pts); }
      const eq = []; for (let lo = -180; lo <= 180; lo += 5) eq.push(P(lo, 0));
      mapStatic = {
        edge: line(edge) + 'Z', grat, eq: line(eq),
        land: MAP.COUNTRIES.map((c, i) => `<path data-i="${i}" class="c-${c.c}" fill="${LAND[c.c] || LAND['']}" d="${c.d}"/>`).join(''),
      };
    }
    const m = mapStatic;
    return `<svg id="msvg" viewBox="${WORLD.join(' ')}" preserveAspectRatio="xMidYMid meet">
      <defs><radialGradient id="sea" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#9bd9f1"/><stop offset="1" stop-color="#5eb3db"/></radialGradient></defs>
      <path d="${m.edge}" fill="url(#sea)" stroke="#fffbeb" stroke-width="2.5" vector-effect="non-scaling-stroke"/>
      <path class="grat" d="${m.grat}"/>${cur.grade >= 3 ? `<path class="grat eq" d="${m.eq}"/>` : ''}
      <g class="land" id="land0">${m.land}</g>
      <path class="borders" d="${MAP.BORDERS}"/>
      <path class="coasts" d="${MAP.COASTS}"/>
      <g id="trail"></g>
    </svg>`;
  }
  function boxSize() { const mb = document.getElementById('mapbox'); return mb ? [mb.clientWidth, mb.clientHeight] : [1, 1]; }
  // Grow a view box to the map's shape so the picture fills it.
  function fitAspect(v) {
    const [W, H] = boxSize(), asp = W / Math.max(1, H);
    let [x, y, w, h] = v;
    if (w / h > asp) { const nh = w / asp; y -= (nh - h) / 2; h = nh; } else { const nw = h * asp; x -= (nw - w) / 2; w = nw; }
    return [x, y, w, h];
  }
  function viewAround(pts, pad, minW) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    x0 -= pad; x1 += pad; y0 -= pad * 1.5; y1 += pad * 0.6; // pins stand up from their spot
    if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = c - minW / 2; x1 = c + minW / 2; }
    const minH = minW * 0.55;
    if (y1 - y0 < minH) { const c = (y0 + y1) / 2; y0 = c - minH / 2; y1 = c + minH / 2; }
    return fitAspect([x0, y0, x1 - x0, y1 - y0]);
  }
  function initMap() {
    const cs = cur.cs, k = cs.kind;
    const svg = document.getElementById('msvg'), box = document.getElementById('mapbox');
    mapState = { svg, vb: WORLD.slice(), anim: 0 };
    const pins = document.getElementById('pins');
    const tagPaths = (idxs, i) => idxs.forEach((j) => {
      const p = svg.querySelector(`#land0 [data-i="${j}"]`);
      if (p) { p.classList.add('opt', 'o' + i); if (cs.bad.includes(i)) p.classList.add('bad'); p.dataset.act = 'ans'; p.dataset.k = i; }
    });
    const badge = (o, i) => `<button class="badge nav${cs.bad.includes(i) ? ' bad' : ''}" data-act="ans" data-k="${i}" data-x="${o.x}" data-y="${o.y}" style="--pc:${PIN_COLORS[i]}">${cs.bad.includes(i) ? '✗' : LETTERS[i]}</button>`;
    let html = '';
    // Countries are picked by tapping the country itself, when every choice has a shape on this map.
    cs.shape = cs.item.k === 'country' && cs.opts.every((o) => countryOf(o.label) && countrySpot(o.label));
    if (cs.shape) {
      box.classList.add('pickc');
      cs.opts.forEach((o, i) => { [o.x, o.y] = countrySpot(o.label); tagPaths(countryOf(o.label), i); });
      html = cs.opts.map(badge).join('');
    } else if (k.mode === 'pin') {
      cs.opts.forEach((o) => { [o.x, o.y] = P(o.lon, o.lat); });
      html = cs.opts.map((o, i) => `<button class="pin nav${cs.bad.includes(i) ? ' bad' : ''}" data-act="ans" data-k="${i}" data-x="${o.x}" data-y="${o.y}" style="--pc:${PIN_COLORS[i]}"><div class="head"><b>${cs.bad.includes(i) ? '✗' : LETTERS[i]}</b></div><div class="dot"></div></button>`).join('');
    } else {
      cs.opts.forEach((o) => { [o.x, o.y] = P(...SPOT[o.id]); });
      html = cs.opts.map(badge).join('');
      if (k.mode === 'cont') cs.opts.forEach((o, i) => tagPaths(MAP.COUNTRIES.map((c, j) => (c.c === o.id ? j : -1)).filter((j) => j >= 0), i));
    }
    // Place names: seas and gulfs, provinces and states, countries, oceans. placeMarkers() decides which show.
    // Biggest first, so when two names would overlap the more important one wins (see placeMarkers).
    let labels = '';
    for (const id of OCEANS) { const [x, y] = P(...SPOT[id]); labels += `<div class="lbl ocean" data-x="${x}" data-y="${y}">${OCEAN_NAMES[id]}</div>`; }
    MAP.COUNTRIES.filter((c) => c.lab).sort((a, b) => (b.w || 0) - (a.w || 0)).forEach((c) => { labels += `<div class="lbl country" data-x="${c.lab[0]}" data-y="${c.lab[1]}" data-w="${c.w || 40}">${esc(c.n)}</div>`; });
    for (const [n, lo, la] of REGIONS) { const [x, y] = P(lo, la); labels += `<div class="lbl region" data-x="${x}" data-y="${y}">${esc(n)}</div>`; }
    for (const [n, lo, la] of WATERS) { const [x, y] = P(lo, la); labels += `<div class="lbl water" data-x="${x}" data-y="${y}">${esc(n)}</div>`; }
    if (cur.chase && cur.chase.trail.length) drawTrail(svg);
    pins.innerHTML = html + labels;
    // Big kids zoom in on the choices; little ones always see the whole world.
    setVB((k.mode === 'pin' || cs.shape) && cur.grade >= 3 ? viewAround(cs.opts.map((o) => [o.x, o.y]), 16, 70) : fitAspect(WORLD));
  }
  function drawTrail(svg) {
    const t = cur.chase.trail; if (t.length < 2) return;
    svg.querySelector('#trail').innerHTML = `<path class="trail" d="${line(t.map((p) => P(p.lon, p.lat)))}"/>`;
  }
  function setVB(v) {
    if (!mapState) return;
    mapState.vb = v;
    mapState.svg.setAttribute('viewBox', v.map((n) => n.toFixed(2)).join(' '));
    placeMarkers();
  }
  function animVB(to, ms = 800) {
    if (!mapState) return;
    const from = mapState.vb.slice(), t0 = performance.now(), my = ++mapState.anim;
    const step = (t) => {
      if (!mapState || mapState.anim !== my) return;
      const p = Math.min(1, (t - t0) / ms), e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      setVB(from.map((f, i) => f + (to[i] - f) * e));
      if (p < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }
  function toPx(x, y) {
    const [W, H] = boxSize(), [vx, vy, vw, vh] = mapState.vb;
    const s = Math.min(W / vw, H / vh), ox = (W - vw * s) / 2, oy = (H - vh * s) / 2;
    return [ox + (x - vx) * s, oy + (y - vy) * s];
  }
  function placeMarkers() {
    if (!mapState) return;
    const pins = document.getElementById('pins'); if (!pins) return;
    const cs = cur.cs, [W, H] = boxSize(), vw = mapState.vb[2], scale = Math.min(W / vw, H / mapState.vb[3]);
    const em = parseFloat(stage.style.fontSize) || 12;
    // Names that would give the answer away stay hidden until the case is solved.
    const hideCountries = cs && !cs.done && (cs.item.k === 'country' || cs.kind.mode === 'cont' || cs.kind.mode === 'ocean');
    const hideOceans = cs && !cs.done && cs.kind.mode === 'ocean';
    const taken = []; // boxes already used on screen: pins, badges, then names in priority order
    const hits = (b) => taken.some((t) => b[0] < t[2] && b[2] > t[0] && b[1] < t[3] && b[3] > t[1]);
    for (const el of pins.children) {
      if (el.dataset.x === undefined) continue;
      const [px, py] = toPx(+el.dataset.x, +el.dataset.y);
      if (el.classList.contains('lbl')) {
        let on = px > -40 && py > -10 && px < W + 40 && py < H + 10;
        if (on && el.classList.contains('country')) on = !hideCountries && +el.dataset.w * scale > el.textContent.length * em * 0.36 + 8;
        else if (on && el.classList.contains('region')) on = vw < 95;
        else if (on && el.classList.contains('water')) on = vw < 130;
        else if (on && el.classList.contains('ocean')) on = !hideOceans;
        if (on) {
          const fs = em * (el.classList.contains('ocean') ? 0.72 : 0.6), hw = el.textContent.length * fs * (el.classList.contains('ocean') ? 0.45 : 0.29) + 2;
          const b = [px - hw, py - fs * 0.7, px + hw, py + fs * 0.7];
          if (b[0] < 2 || b[2] > W - 2 || b[1] < 2 || b[3] > H - 2 || hits(b)) on = false; else taken.push(b);
        }
        el.style.display = on ? '' : 'none';
        if (!on) continue;
      } else if (el.classList.contains('pin') || el.classList.contains('badge')) {
        const r = em * 1.5; taken.push([px - r, py - (el.classList.contains('pin') ? r * 2.2 : r), px + r, py + r * 0.4]);
      }
      el.style.left = px + 'px'; el.style.top = py + 'px';
    }
  }

  // ---------- answering ----------
  function choose(k) {
    const cs = cur.cs;
    if (!cs || cs.done || k < 0 || k >= cs.opts.length || cs.bad.includes(k)) return;
    audio();
    const o = cs.opts[k];
    if (o.id === cs.answer) return solve(k);
    cs.wrong++; cs.bad.push(k);
    sfx.wrong();
    markBad(k);
    if (cur.chase) cur.chase.streak = 0;
    const more = nextClue(true);
    const msg = more ? rnd(OOPS) : rnd(OOPS_LAST);
    finnSay(msg, 'think');
    if (!more) say(msg);
    // Only one choice left? Then it must be the answer -- point at it.
    const left = cs.opts.map((_, i) => i).filter((i) => !cs.bad.includes(i));
    if (left.length === 1) { const el = screen.querySelector(`.ans[data-k="${left[0]}"], .pic[data-k="${left[0]}"]`); if (el) setFocus(el); }
    else if (focused && focused.classList.contains('bad')) setFocus(navEls().find((e) => e.dataset.act === 'ans'));
  }
  function markBad(k) {
    screen.querySelectorAll(`[data-k="${k}"]`).forEach((el) => {
      el.classList.add('bad');
      if (el.classList.contains('badge')) el.textContent = '✗';
      const b = el.querySelector && el.querySelector('.head b'); if (b) b.textContent = '✗';
    });
    const a = screen.querySelector(`.ans[data-k="${k}"]`); if (a) { a.classList.remove('shake'); void a.offsetWidth; a.classList.add('shake'); }
  }
  function solve(k) {
    const cs = cur.cs, it = cs.item, o = cs.opts[k];
    cs.done = true;
    const pts = Math.max(30, 100 - 20 * cs.asked - 25 * cs.wrong);
    const stars = pts >= 80 ? 3 : pts >= 50 ? 2 : 1;
    cs.pts = pts; cs.stars = stars;
    save.files[it.id] = Math.max(filed(it.id), stars);
    if (!cur.chase) { const b = boardFor(cur.grade); b.done[it.id] = Math.max(b.done[it.id] || 0, stars); }
    store();
    sfx.right(); setTimeout(() => sfx.stamp(), 380);
    screen.querySelectorAll(`[data-k="${k}"]`).forEach((el) => el.classList.add('win'));
    finnSay(rnd(CHEERS), 'happy');
    refreshNotepad();
    const winEl = screen.querySelector(`.pin[data-k="${k}"], .badge[data-k="${k}"], .pic[data-k="${k}"], .ans[data-k="${k}"]`);
    if (winEl) burst(winEl, 40);
    // Zoom to the answer, leaving room for the case file card on the right.
    if (mapState) {
      const x = o.x, y = o.y;
      const mode = cs.kind.mode;
      const w = mode === 'pin' ? (cur.grade >= 5 ? 50 : 70) : 150;
      const [W, H] = boxSize(), h = w * H / Math.max(1, W);
      animVB([x - w * 0.3, y - h * 0.3, w, h], 900);
      const pins = document.getElementById('pins');
      if (pins) {
        const lab = document.createElement('div');
        lab.className = 'maplabel'; lab.dataset.x = x; lab.dataset.y = y; lab.textContent = o.label;
        pins.appendChild(lab);
        if (cur.chase) {
          const r = document.createElement('div');
          r.className = 'rascal-pin'; r.dataset.x = x; r.dataset.y = y - 0.01; r.innerHTML = rascalSVG();
          pins.appendChild(r);
        }
      }
      if (cur.chase) {
        cur.chase.trail.push(locOf(it));
        drawTrail(mapState.svg);
        sfx.whoosh();
      }
    }
    if (cur.chase) {
      const ch = cur.chase;
      const perfect = cs.asked === 0 && cs.wrong === 0;
      ch.streak = perfect ? ch.streak + 1 : 0;
      const bonus = perfect && ch.streak >= 2 ? 25 * (ch.streak - 1) : 0;
      cs.bonus = bonus;
      ch.total += pts + bonus;
      ch.results.push(stars);
      const chip = screen.querySelector('.chip.score'); if (chip) chip.textContent = ch.total;
    }
    setTimeout(() => showSolved(), mapState ? 650 : 350);
  }
  function solvedName(cs) {
    const it = cs.item;
    if (it.k === 'animal') return `${it.n} · ${byId[it.c].n}`;
    if (it.k === 'skill') return cs.answer;
    return it.n;
  }
  function showSolved() {
    const cs = cur.cs, it = cs.item, ch = cur.chase;
    if (!cs || cur.name !== 'case') return;
    const right = document.getElementById('right'); if (!right) return;
    const last = ch && ch.i === CHASE_N - 1;
    const b = !ch && boardFor(cur.grade);
    const moreOnBoard = b && b.list.some((id) => !b.done[id]);
    const btns = ch
      ? `<button class="go ${last ? 'gold' : ''} nav" data-act="${last ? 'caught' : 'nextstop'}" data-default>${last ? 'CATCH RASCAL! ▶' : 'FOLLOW RASCAL ▶'}</button>`
      : `<button class="go ghost nav" data-act="back">BOARD</button>${moreOnBoard ? '<button class="go nav" data-act="nextcase" data-default>NEXT CASE ▶</button>' : ''}`;
    const pts = `+${cs.pts}${cs.bonus ? ` <span style="color:#d97706">\u{1F525}+${cs.bonus}</span>` : ''}`;
    const icon = it.k === 'skill' ? artSVG(it.art) : iconOf(it);
    const card = document.createElement('div');
    card.className = 'solved paper';
    card.innerHTML = `<div class="stampbig">${ch && !last ? 'FOUND HIM!' : 'CASE SOLVED'}</div>
      <div class="hd"><div class="big">${icon}</div><div><h2>${esc(solvedName(cs))}</h2><div class="st">${Array.from({ length: 3 }, (_, i) => `<span style="animation-delay:${0.35 + i * 0.2}s">${i < cs.stars ? '★' : '<span class="off" style="color:rgba(120,53,15,.25)">★</span>'}</span>`).join('')}</div></div></div>
      <div class="fact"><b>${ch ? (last ? 'Rascal is here! ' : 'Rascal was here! ') : 'Fun fact: '}</b>${esc(it.fact)}</div>
      <div class="row"><span class="pts">${pts}</span>${btns}</div>`;
    right.appendChild(card);
    if (!mapState) { right.style.position = 'relative'; card.style.right = '0'; card.style.bottom = '0'; }
    if (!ch && !moreOnBoard) card.querySelector('[data-act="back"]').setAttribute('data-default', '');
    setFocus(card.querySelector('[data-default]'));
    for (let i = 0; i < cs.stars; i++) setTimeout(() => sfx.star(i), 450 + i * 200);
    say(`${solvedName(cs)}! ${it.fact}`);
  }
  function nextCase() {
    const b = boardFor(cur.grade);
    const i = b.list.findIndex((id) => !b.done[id]);
    if (i < 0) return goBoard();
    startCase(i);
  }

  // ---------- chase result ----------
  function goCaught() {
    const ch = cur.chase, g = grade();
    ch.total += 100; // catching bonus
    const total = ch.total;
    const key = 'g' + g.n, prev = save.chase[key] || 0;
    const isBest = total > prev;
    if (isBest) save.chase[key] = total;
    store();
    if (window.MickleScores) MickleScores.record('globe-sleuths', total, { category: g.label, order: g.n });
    const stars = total >= 520 ? 3 : total >= 380 ? 2 : 1;
    cur = { name: 'result', grade: cur.grade };
    show(`${topBar('BOARD', 'BIG CASE · CAUGHT!')}
      <div class="result">
        ${rascalSVG()}
        <div class="card paper rise">
          <h2>You caught Rascal!</h2>
          <p>“You found me! I just wanted to see the world. Here’s the Golden Globe back!”</p>
          <div class="st">${Array.from({ length: 3 }, (_, i) => `<span style="animation-delay:${0.3 + i * 0.25}s">${i < stars ? '★' : '<span style="color:rgba(120,53,15,.25)">★</span>'}</span>`).join('')}</div>
          <div class="total">${total}</div>
          <div class="best">${isBest ? '\u{1F3C6} NEW BEST!' : 'BEST: ' + prev} · +100 for the catch</div>
          <div class="btns"><button class="go ghost nav" data-act="back">BOARD</button><button class="go gold nav" data-act="chase" data-default>CHASE AGAIN</button></div>
        </div>
      </div>`);
    sfx.fanfare(); confetti(stars * 50 + 60);
    say('You caught Rascal! You found me! I just wanted to see the world. Here is the Golden Globe back!');
  }

  // ---------- NOTEBOOK ----------
  function goBook(selId) {
    cur = { name: 'book', grade: cur.grade };
    const g = grade(), pool = poolFor(g.n);
    const got = pool.filter((it) => filed(it.id)).length;
    let html = '';
    for (const k of KIND_ORDER) {
      const list = pool.filter((it) => it.k === k);
      if (!list.length) continue;
      const n = list.filter((it) => filed(it.id)).length;
      html += `<div class="nb-head">${KIND[k].book} · ${n}/${list.length}</div>`;
      html += list.map((it) => {
        const st = filed(it.id);
        return st
          ? `<button class="nb-card nav" data-act="bookitem" data-id="${it.id}"${selId === it.id ? ' data-default' : ''}><div class="ic">${it.k === 'skill' ? artSVG(it.art) : iconOf(it)}</div><div class="nm">${esc(it.n)}</div><div class="st">${'★'.repeat(st)}</div></button>`
          : `<button class="nb-card no nav" data-act="bookitem" data-id="${it.id}"${selId === it.id ? ' data-default' : ''}><div class="ic">?</div><div class="nm">???</div></button>`;
      }).join('');
    }
    show(`${topBar('BOARD', `\u{1F4D2} DETECTIVE NOTEBOOK · ${g.label}`, `<span class="chip">${got}/${pool.length} FOUND</span>`)}
      <div class="nb">
        <div class="nb-grid paper">${html}</div>
        <div class="nb-detail paper" id="nbd">${bookDetail(selId)}</div>
      </div>`);
  }
  function bookDetail(id) {
    const it = id && byId[id];
    if (!it) return `<div class="big">${finnSVG()}</div><h3>Case files</h3><p>Every case you solve goes in here with its fun fact. Tap a card to read it!</p>`;
    if (!filed(it.id)) return `<div class="big" style="font-family:Georgia,serif;color:#b45309;font-weight:900">?</div><h3>Still a mystery!</h3><p>Solve more cases to find this one. Tap ✨ NEW CASES on the board when every folder is done.</p>`;
    const where = it.c && byId[it.c] ? `<div class="kind">${it.k === 'animal' ? 'LIVES IN' : 'IN'} ${byId[it.c].n.toUpperCase()}</div>` : (it.k === 'wonder' && it.c === 'PAC' ? '<div class="kind">IN THE PACIFIC OCEAN</div>' : '');
    const name = it.k === 'skill' ? `${it.n}` : it.n;
    const extra = it.k === 'skill' ? `<p><b>${esc(it.clues[0])}</b><br>${esc(it.choices[0])}</p>` : '';
    return `<div class="kind">${KIND[it.k].book}</div><div class="big">${it.k === 'skill' ? artSVG(it.art) : iconOf(it)}</div><h3>${esc(name)}</h3>${where}${extra}<p>${esc(it.fact)}</p>
      <button class="pill nav" data-act="speak" style="align-self:center">\u{1F50A} READ IT</button>`;
  }

  // ---------- confetti ----------
  let parts = [], fxRunning = false;
  const COLORS = ['#f472b6', '#fbbf24', '#4ade80', '#60a5fa', '#a78bfa', '#fb923c'];
  function spawn(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * spread;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.8, r: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
  }
  function burst(el, n) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); spawn((r.left + r.width / 2 - s.left) * fxScale, (r.top + r.height / 2 - s.top) * fxScale, n, 5 * fxScale); }
  function confetti(n) { const w = fx.width; for (let i = 0; i < 5; i++) spawn(w * (0.1 + i * 0.2), fx.height * 0.3, n / 5, 7 * fxScale); }
  function fxLoop() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter((p) => p.life > 0 && p.y < fx.height + 20);
    for (const p of parts) {
      p.vy += 0.18 * fxScale; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.globalAlpha = Math.min(1, p.life * 2);
      fctx.fillStyle = p.c; fctx.fillRect(-p.r * fxScale, -p.r * fxScale * 0.6, p.r * 2 * fxScale, p.r * 1.2 * fxScale); fctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop); else { fxRunning = false; fctx.clearRect(0, 0, fx.width, fx.height); }
  }

  // ---------- actions ----------
  function act(name, el) {
    const ds = (el && el.dataset) || {};
    if (name !== 'ans' && name !== 'speak' && name !== 'clue') sfx.tap();
    switch (name) {
      case 'grade': cur.grade = +ds.g; save.grade = cur.grade; store(); goBoard(); break;
      case 'read': save.read = save.read === null ? !readOn() : !save.read; store(); goTitle(); setFocus(screen.querySelector('[data-act="read"]')); if (readOn()) say('I will read to you!', true); break;
      case 'case': startCase(+ds.i); break;
      case 'newboard': newBoard(cur.grade); goBoard(); break;
      case 'chase': startChase(); break;
      case 'book': goBook(); break;
      case 'bookitem': {
        const d = document.getElementById('nbd'); if (d) d.innerHTML = bookDetail(ds.id);
        cur.sel = ds.id;
        const it = byId[ds.id]; if (it && filed(it.id) && readOn()) say(`${it.n}. ${it.fact}`);
        break;
      }
      case 'ans': choose(+ds.k); break;
      case 'clue': if (cur.cs && !cur.cs.done) nextClue(false); break;
      case 'nextcase': nextCase(); break;
      case 'nextstop': cur.chase.i++; nextChaseStop(); break;
      case 'caught': goCaught(); break;
      case 'speak': speakNow(); break;
      case 'back': back(); break;
    }
  }
  function speakNow() {
    if (cur.name === 'case' && cur.cs) {
      const cs = cur.cs;
      if (cs.done) { say(`${solvedName(cs)}! ${cs.item.fact}`, true); return; }
      if (cs.kind.mode === 'text') { say([cs.item.clues[0]].concat(cs.item.clues.slice(1, cs.shown).map((h) => 'Hint: ' + h)).join(' ') + ' ' + cs.opts.map((o, i) => `${LETTERS[i]}: ${o.label}.`).join(' '), true); return; }
      say(`${cs.kind.ask} ` + cs.item.clues.slice(0, cs.shown).map((c, i) => `Clue ${i + 1}: ${c}`).join(' ') + ' ' + cs.opts.map((o, i) => `${LETTERS[i]}: ${o.label}.`).join(' '), true);
    } else if (cur.name === 'book' && cur.sel && filed(cur.sel)) {
      const it = byId[cur.sel]; say(`${it.n}. ${it.fact}`, true);
    }
  }
  function back() {
    if (cur.name === 'title') { if (window.MickleMenu) MickleMenu.backToArcade(); return; }
    if (cur.name === 'board') return goTitle();
    if (cur.name === 'case') return goBoard(cur.chase ? 'chase' : boardFor(cur.grade).list[cur.bi]);
    if (cur.name === 'result') return goBoard('chase');
    goBoard();
  }

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !screen.contains(el)) return;
    document.body.classList.remove('navmode');
    audio();
    act(el.dataset.act, el);
  });

  // ---------- keyboard / controller focus ----------
  let focused = null;
  function setFocus(el) {
    if (focused) focused.classList.remove('foc');
    focused = el || null;
    if (focused) {
      focused.classList.add('foc');
      try { focused.focus({ preventScroll: true }); } catch (e) { /* */ }
      if (cur.name === 'book' && document.body.classList.contains('navmode') && focused.scrollIntoView) focused.scrollIntoView({ block: 'nearest' });
    }
  }
  function navEls() {
    const card = screen.querySelector('.solved');
    const root = card || screen;
    return [...root.querySelectorAll('.nav')].filter((b) => !b.disabled && b.offsetParent !== null && !b.classList.contains('bad'));
  }
  function move(dx, dy) {
    document.body.classList.add('navmode');
    const els = navEls(); if (!els.length) return;
    if (!focused || !screen.contains(focused) || !els.includes(focused)) return setFocus(els[0]);
    const r = focused.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === focused) continue;
      const q = el.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      const along = (ex - cx) * dx + (ey - cy) * dy, side = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx);
      if (along <= 4) continue;
      const sc = along + side * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) {
      setFocus(best); sfx.tap();
      if (cur.name === 'book' && best.dataset.act === 'bookitem') act('bookitem', best);
    }
  }
  function press() {
    document.body.classList.add('navmode');
    const els = navEls();
    if (!focused || !screen.contains(focused) || !els.includes(focused)) { setFocus(els[0]); return; }
    audio();
    act(focused.dataset.act, focused);
  }

  document.addEventListener('keydown', (e) => {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    const k = e.key;
    if (k === 'ArrowLeft') move(-1, 0); else if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowUp') move(0, -1); else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Enter' || k === ' ') press();
    else if (k === 'Escape' || k === 'Backspace') back();
    else if (/^[1-4]$/.test(k) && cur.name === 'case' && cur.cs && !cur.cs.done) choose(+k - 1);
    else if ((k === 'c' || k === 'C' || k === 'h' || k === 'H') && cur.name === 'case') act('clue');
    else if (k === 's' || k === 'S') speakNow();
    else return;
    e.preventDefault();
  });

  function padLoop() {
    if (window.Pad360) {
      Pad360.poll();
      if (!(window.MickleMenu && MickleMenu.isOpen())) {
        const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
        if (dx || dy) move(dx, dy);
        if (Pad360.pressed(Pad360.BTN.A) || Pad360.pressed(Pad360.BTN.START)) press();
        if (Pad360.pressed(Pad360.BTN.B)) back();
        if (Pad360.pressed(Pad360.BTN.Y)) speakNow();
        if (Pad360.pressed(Pad360.BTN.X) && cur.name === 'case') act('clue');
      }
    }
    requestAnimationFrame(padLoop);
  }
  requestAnimationFrame(padLoop);

  // test hooks
  window.GlobeSleuthsDebug = {
    get state() { return cur; }, save: () => save, ITEMS, byId, buildCase, startCase, startChase, choose, act, goTitle, goBoard, goBook, newBoard,
    grade: (n) => { cur.grade = n; }, sayOf,
    // Open any item as a case (for checking layouts): testCase('everest', 3, 3)
    testCase(id, g, shown = 1) { cur = { name: 'case', grade: g, bi: 0, cs: buildCase(byId[id], g) }; cur.cs.shown = shown; renderCase(); return cur.cs; },
  };

  fit();
  goTitle();
})();
