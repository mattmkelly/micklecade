(() => {
  const canvas = document.getElementById('game');

  // Two shapes: WIDE 480x270 for sideways screens, TALL 270x480 for upright ones. fit() picks one
  // from the window's shape and, like shared/hires.js, sizes the real pixel buffer to the screen
  // (whole-number 2x/3x/4x) so everything stays sharp. HiRes.setup can't change shape later, so
  // the game does this itself.
  let W = 480, H = 270, tall = false, scale = 1;
  const ctx = canvas.getContext('2d');
  // The transform doesn't apply to shadows, so scale glow sizes by hand (as hires.js does).
  ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY'].forEach((prop) => {
    const desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop);
    Object.defineProperty(ctx, prop, {
      get() { return desc.get.call(ctx) / scale; },
      set(v) { desc.set.call(ctx, v * scale); },
    });
  });

  const SAVE_KEY = 'secretWord.save';
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
  const font = (size, weight = 800) => weight + ' ' + size + 'px ' + FONT;

  // ---------- Levels ----------
  const LISTS = {};
  for (const k in window.SecretWordLists) {
    LISTS[k] = window.SecretWordLists[k].split(/\s+/).filter(Boolean).map((w) => w.toUpperCase());
  }
  // len = letters in the word, rows = guesses. Younger levels get an extra guess.
  const LEVELS = [
    { id: 'k', name: 'ABC', title: 'STARTER', sub: 'TINY WORDS', grades: 'KINDER', len: 3, rows: 7, hints: 2, color: '#f472b6' },
    { id: 'l1', name: '1', title: 'LEVEL 1', sub: 'EASY', grades: 'GRADES 1-2', len: 4, rows: 7, hints: 2, color: '#4ade80' },
    { id: 'l2', name: '2', title: 'LEVEL 2', sub: 'MEDIUM', grades: 'GRADES 3-4', len: 5, rows: 7, hints: 2, color: '#60a5fa' },
    { id: 'l3', name: '3', title: 'LEVEL 3', sub: 'HARD', grades: 'GRADES 5-6', len: 5, rows: 6, hints: 2, color: '#a78bfa' },
    { id: 'high', name: 'HIGH', title: 'HIGH', sub: 'EXPERT', grades: 'HIGH SCHOOL+', len: 5, rows: 6, hints: 1, color: '#f87171' },
  ];
  const START_HEARTS = 3, MAX_HEARTS = 5;

  const TILE = {
    correct: ['#4ade80', '#16a34a'],
    present: ['#fcd34d', '#f59e0b'],
    absent: ['#64748b', '#3f4a5c'],
  };
  const CONFETTI = ['#4ade80', '#fcd34d', '#f472b6', '#60a5fa', '#a78bfa', '#fb923c', '#ffffff'];

  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
  function easeOutBack(t) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }

  // ---------- Save ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.best) { s.used = s.used || {}; return s; }
    } catch (e) { /* storage blocked: play without saving */ }
    return { best: {}, used: {}, lastLevel: 1 };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  const save = loadSave();

  // A new goal word every round: no repeats until the whole list has been used.
  function pickWord(lv) {
    const list = LISTS[lv.id];
    let used = save.used[lv.id] || [];
    let fresh = list.filter((w) => used.indexOf(w) < 0);
    if (!fresh.length) { used = []; fresh = list.slice(); }
    const w = pick(fresh);
    used.push(w);
    save.used[lv.id] = used;
    writeSave();
    return w;
  }

  // Classic scoring, duplicate letters handled: greens first, then yellows while letters last.
  function evaluate(guess, answer) {
    const n = answer.length, res = new Array(n).fill('absent'), left = {};
    for (let i = 0; i < n; i++) {
      if (guess[i] === answer[i]) res[i] = 'correct';
      else left[answer[i]] = (left[answer[i]] || 0) + 1;
    }
    for (let i = 0; i < n; i++) {
      if (res[i] !== 'correct' && left[guess[i]] > 0) { res[i] = 'present'; left[guess[i]]--; }
    }
    return res;
  }
  const RANK = { absent: 1, present: 2, correct: 3 };

  // ---------- Audio (soft generated tones, no files) ----------
  let audioCtx = null, master = null;
  function ensureAudio() {
    if (!audioCtx) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        master = audioCtx.createGain();
        master.gain.value = 0.9;
        const comp = audioCtx.createDynamicsCompressor();
        master.connect(comp);
        comp.connect(audioCtx.destination);
      } catch (e) { audioCtx = null; }
    }
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  }
  function tone(freq, dur, type = 'triangle', vol = 0.1, delay = 0, slideTo = 0) {
    if (!audioCtx) return;
    const t0 = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }
  // A soft "bell": a sine with a quiet octave on top.
  function bell(freq, dur, vol, delay = 0) {
    tone(freq, dur, 'sine', vol, delay);
    tone(freq * 2, dur * 0.6, 'sine', vol * 0.25, delay);
  }
  const UP = [523, 587, 659, 784, 880, 1047, 1175];
  const sfxType = (i) => { tone(700 + i * 45, 0.05, 'triangle', 0.07); tone(1400 + i * 90, 0.025, 'sine', 0.03); };
  const sfxDel = () => tone(420, 0.06, 'sine', 0.06, 0, 300);
  const sfxMove = () => tone(560, 0.04, 'sine', 0.05);
  const sfxNope = () => { tone(240, 0.09, 'sine', 0.08); tone(200, 0.12, 'sine', 0.08, 0.09); };
  const sfxFlip = (kind, i) => {
    if (kind === 'correct') bell(UP[Math.min(i + 2, UP.length - 1)], 0.35, 0.11);
    else if (kind === 'present') bell(UP[Math.min(i, UP.length - 1)] * 0.75, 0.28, 0.09);
    else tone(180, 0.1, 'sine', 0.09, 0, 120);
  };
  const sfxWin = () => {
    [523, 659, 784, 1047, 1319].forEach((f, i) => bell(f, 0.5, 0.1, i * 0.08));
    [1568, 2093, 2637].forEach((f, i) => tone(f, 0.18, 'sine', 0.03, 0.45 + i * 0.06));
  };
  const sfxMilestone = () => {
    [392, 523, 659, 784, 1047, 1319, 1568].forEach((f, i) => bell(f, 0.6, 0.09, i * 0.07));
    for (let i = 0; i < 8; i++) tone(2000 + Math.random() * 1500, 0.12, 'sine', 0.025, 0.5 + i * 0.05);
  };
  const sfxMiss = () => { bell(440, 0.4, 0.08); bell(349, 0.55, 0.08, 0.18); };
  const sfxHint = () => { tone(700, 0.35, 'sine', 0.06, 0, 1600); [1319, 1568, 2093].forEach((f, i) => tone(f, 0.15, 'sine', 0.035, 0.2 + i * 0.06)); };
  const sfxHeart = () => [659, 880, 1175].forEach((f, i) => bell(f, 0.3, 0.07, i * 0.09));

  const canSpeak = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  function say(text) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }

  // ---------- Layout ----------
  // Every box is filled in by layout() for the shape on show. The menu's ☰ button sits in the
  // top-left corner in both shapes, so the LEVELS button starts just after it.
  const LEVELS_BTN = {}, CARD = {}, BUBBLE = {}, HINT_BTN = {}, SPEAK_BTN = {}, NEXT_BTN = {}, RESULT = {};
  const OVER = {}, AGAIN_BTN = {}, MENU_BTN = {}, PLAY_BTN = {}, HOWTO_BTN = {}, GRID_AREA = {};
  const HUD = {};   // chipX/chipY (level name), streakY, streakRight (tall: right-aligned), heartsX, heartGap
  const KB = {};    // keyboard area: x, y, w, keyH, rowGap
  const LV_CARDS = []; // title-screen level cards, one rect each
  const KEYS = [];
  function box(o, x, y, w, h) { o.x = x; o.y = y; o.w = w; o.h = h; }
  function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

  function layout() {
    if (!tall) {
      box(LEVELS_BTN, 28, 5, 62, 18);
      Object.assign(HUD, { chipX: 98, chipY: 14, streakY: 14, streakCx: 222, streakRight: 0, heartsX: 330, heartGap: 15 });
      box(CARD, 246, 31, 226, 78);
      box(BUBBLE, 296, 37, 170, 42);
      box(HINT_BTN, 296, 84, 76, 20);
      box(GRID_AREA, 8, 32, 230, 232);
      Object.assign(KB, { x: 246, y: 114, w: 226, keyH: 40, rowGap: 6 });
      box(RESULT, 246, 112, 226, 150);
      box(SPEAK_BTN, 262, 226, 34, 30);
      box(NEXT_BTN, 304, 226, 160, 30);
      box(OVER, 110, 40, 260, 196);
      box(AGAIN_BTN, 130, 192, 130, 30);
      box(MENU_BTN, 270, 192, 80, 30);
      const cw = 82, ch = 80, gap = 8, x0 = (W - (LEVELS.length * cw + (LEVELS.length - 1) * gap)) / 2;
      LV_CARDS.length = 0;
      LEVELS.forEach((L, i) => LV_CARDS.push({ x: x0 + i * (cw + gap), y: 96, w: cw, h: ch }));
      box(PLAY_BTN, 100, 188, 150, 28);
      box(HOWTO_BTN, 260, 188, 122, 28);
    } else {
      box(LEVELS_BTN, 28, 5, 62, 18);
      Object.assign(HUD, { chipX: 12, chipY: 37, streakY: 37, streakCx: 0, streakRight: W - 8, heartsX: 150, heartGap: 14 });
      box(CARD, 8, 48, 254, 80);
      box(BUBBLE, 52, 54, 204, 40);
      box(HINT_BTN, 52, 100, 76, 20);
      box(GRID_AREA, 8, 134, 254, 186);
      Object.assign(KB, { x: 8, y: 326, w: 254, keyH: 44, rowGap: 5 });
      box(RESULT, 8, 322, 254, 152);
      box(SPEAK_BTN, 22, 436, 34, 30);
      box(NEXT_BTN, 64, 436, 192, 30);
      box(OVER, 12, 142, 246, 196);
      box(AGAIN_BTN, 28, 294, 130, 30);
      box(MENU_BTN, 166, 294, 76, 30);
      LV_CARDS.length = 0;
      LEVELS.forEach((L, i) => LV_CARDS.push({ x: 18, y: 134 + i * 50, w: 234, h: 44 }));
      box(PLAY_BTN, 20, 390, 230, 30);
      box(HOWTO_BTN, 60, 427, 150, 24);
    }
    buildKeys();
    padCursor = null;
  }

  // On-screen keyboard. Row 3 has ENTER and DELETE at its ends.
  function buildKeys() {
    KEYS.length = 0;
    const gapX = 3, keyW = (KB.w - 9 * gapX) / 10;
    ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'].forEach((row, r) => {
      const y = KB.y + r * (KB.keyH + KB.rowGap);
      const items = row.split('').map((ch) => ({ ch, w: keyW }));
      if (r === 2) {
        items.unshift({ ch: 'ENTER', w: keyW * 1.55 });
        items.push({ ch: 'DEL', w: keyW * 1.55 });
      }
      const total = items.reduce((t, k) => t + k.w, 0) + (items.length - 1) * gapX;
      let x = KB.x + (KB.w - total) / 2;
      items.forEach((k, c) => {
        KEYS.push({ ch: k.ch, r, c, x, y, w: k.w, h: KB.keyH, pressT: 0 });
        x += k.w + gapX;
      });
    });
  }
  function keyFor(ch) { return KEYS.find((k) => k.ch === ch) || null; }

  // Pick WIDE or TALL from the window's shape, and size the pixel buffer to the screen.
  function fit(force) {
    const wantTall = window.innerHeight > window.innerWidth;
    let changed = !!force;
    if (wantTall !== tall || force) {
      tall = wantTall;
      W = tall ? 270 : 480;
      H = tall ? 480 : 270;
      document.documentElement.classList.toggle('sw-tall', tall);
      canvas.width = W; canvas.height = H; // the new shape first, so the page lays it out
      layout();
      changed = true;
    }
    const dpr = window.devicePixelRatio || 1;
    const s = Math.max(1, Math.min(4, Math.round((canvas.clientWidth || W) * dpr / W)));
    if (s === scale && !changed) return;
    scale = s;
    canvas.width = W * s;
    canvas.height = H * s;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.textBaseline = 'middle';
  }

  function gridGeom() {
    const n = lv.len, r = lv.rows, gap = 4;
    const areaX = GRID_AREA.x, areaW = GRID_AREA.w, areaY = GRID_AREA.y, areaH = GRID_AREA.h;
    const s = Math.min(38, Math.floor((areaH + gap) / r) - gap, Math.floor((areaW + gap) / n) - gap);
    const gw = n * (s + gap) - gap, gh = r * (s + gap) - gap;
    return { s, gap, x0: areaX + (areaW - gw) / 2, y0: areaY + (areaH - gh) / 2 };
  }

  // ---------- State ----------
  let state = 'title'; // title | play | reveal | result | over
  let levelIdx = clamp(save.lastLevel | 0, 0, LEVELS.length - 1);
  let lv = LEVELS[levelIdx];
  let answer = '', rows = [], cur = '', keyState = {}, hints = [];
  let score = 0, shownScore = 0, scorePulse = 0;
  let streak = 0, bestStreak = 0, solved = 0, hearts = START_HEARTS, round = 0;
  let heartAnim = []; // per heart slot: { t, kind: 'gain'|'lose' }
  let revealClock = 0, revealPlayed = 0;
  let result = null, resultT = 0, winT = -1;
  let over = null, overT = 0;
  let shakeT = 0, popT = [];
  let banner = null;
  let particles = [], popups = [];
  let time = 0, titleT = 0, titleSel = levelIdx;
  let padCursor = null;
  let runRecorded = true;
  let flash = 0;
  const owl = { mood: 'happy', text: '', textT: 0, jump: 0, blink: 0, nextBlink: 2 };

  const FLIP_GAP = 0.24, FLIP_DUR = 0.4;
  function revealLen() { return (lv.len - 1) * FLIP_GAP + FLIP_DUR; }

  function owlSay(text, mood) {
    owl.text = text;
    owl.textT = 0;
    owl.mood = mood || 'happy';
    if (mood === 'happy' || mood === 'cheer') owl.jump = 1;
  }

  function startRun(i) {
    levelIdx = i;
    lv = LEVELS[i];
    save.lastLevel = i;
    writeSave();
    score = 0; shownScore = 0; streak = 0; bestStreak = 0; solved = 0;
    hearts = START_HEARTS; round = 0; heartAnim = [];
    particles = []; popups = []; banner = null; over = null;
    runRecorded = false;
    padCursor = null;
    startRound();
  }

  function startRound() {
    round++;
    answer = pickWord(lv);
    rows = []; cur = ''; keyState = {}; hints = []; popT = [];
    result = null; winT = -1;
    state = 'play';
    if (round === 1) owlSay("I'm thinking of a " + lv.len + '-letter word. Can you guess it?', 'happy');
    else owlSay(pick(['New secret word! ', 'Here comes another! ', 'Ready for the next one? ']) + lv.len + ' letters.', 'happy');
  }

  // ---------- Playing ----------
  function typeLetter(ch) {
    if (state !== 'play' || cur.length >= lv.len) return;
    cur += ch;
    popT[cur.length - 1] = 0;
    sfxType(cur.length);
  }
  function backspace() {
    if (state !== 'play' || !cur.length) return;
    cur = cur.slice(0, -1);
    sfxDel();
  }
  function submit() {
    if (state !== 'play') return;
    if (cur.length < lv.len) {
      shakeT = 0.45;
      sfxNope();
      owlSay(cur.length ? 'It needs ' + lv.len + ' letters!' : 'Type a ' + lv.len + '-letter word first!', 'think');
      return;
    }
    rows.push({ letters: cur, res: evaluate(cur, answer) });
    cur = '';
    state = 'reveal';
    revealClock = 0;
    revealPlayed = 0;
  }

  function knownCorrect(i) { return rows.some((r) => r.res[i] === 'correct'); }
  function useHint() {
    if (state !== 'play') return;
    if (hints.length >= lv.hints) { sfxNope(); owlSay('No more hints for this word. You can do it!', 'think'); return; }
    const open = [];
    for (let i = 0; i < lv.len; i++) if (!knownCorrect(i) && hints.indexOf(i) < 0) open.push(i);
    if (!open.length) { sfxNope(); owlSay('You already found every spot!', 'think'); return; }
    const i = pick(open);
    hints.push(i);
    keyState[answer[i]] = 'correct';
    sfxHint();
    owlSay('Psst... letter ' + (i + 1) + ' is ' + answer[i] + '!', 'cheer');
    const g = gridGeom();
    sparkle(g.x0 + i * (g.s + g.gap) + g.s / 2, g.y0 + rows.length * (g.s + g.gap) + g.s / 2, 14);
  }

  function streakMult(s) { return s >= 10 ? 3 : s >= 5 ? 2 : s >= 3 ? 1.5 : 1; }
  function milestoneFor(s) {
    if (s === 3) return { text: '3 IN A ROW!', sub: 'STREAK BONUS', bonus: 50, heart: false };
    if (s === 5) return { text: 'ON FIRE!', sub: '5 IN A ROW  ·  EXTRA HEART', bonus: 100, heart: true };
    if (s === 10) return { text: 'WORD WIZARD!', sub: '10 IN A ROW  ·  EXTRA HEART', bonus: 250, heart: true };
    if (s >= 15 && s % 5 === 0) return { text: s >= 25 ? 'LEGENDARY!' : 'UNSTOPPABLE!', sub: s + ' IN A ROW  ·  EXTRA HEART', bonus: s * 25, heart: true };
    return null;
  }
  const WIN_WORDS = ['FIRST TRY?! WOW!', 'AMAZING!', 'SUPER!', 'GREAT JOB!', 'NICE ONE!', 'YOU GOT IT!', 'PHEW! GOT IT!'];

  function finishReveal() {
    const row = rows[rows.length - 1];
    row.letters.split('').forEach((ch, i) => {
      if (!keyState[ch] || RANK[row.res[i]] > RANK[keyState[ch]]) keyState[ch] = row.res[i];
    });
    const g = gridGeom();
    const rowY = g.y0 + (rows.length - 1) * (g.s + g.gap) + g.s / 2;
    if (row.letters === answer) {
      solved++;
      streak++;
      bestStreak = Math.max(bestStreak, streak);
      const left = lv.rows - rows.length;
      const base = Math.max(20, 50 + 25 * left - 15 * hints.length);
      const mult = streakMult(streak);
      const pts = Math.round(base * mult);
      const ms = milestoneFor(streak);
      score += pts + (ms ? ms.bonus : 0);
      scorePulse = 1;
      result = { win: true, pts, mult, ms, guesses: rows.length, cheer: WIN_WORDS[Math.min(rows.length, WIN_WORDS.length) - 1] };
      if (rows.length === lv.rows) result.cheer = 'PHEW! GOT IT!';
      winT = 0;
      owlSay(result.cheer, 'cheer');
      sfxWin();
      confetti(g.x0 + (lv.len * (g.s + g.gap)) / 2, rowY, 70);
      popups.push({ x: g.x0 + (lv.len * (g.s + g.gap)) / 2, y: rowY - 18, text: '+' + pts, color: '#fde047', t: 0, size: 18 });
      if (ms) {
        setTimeout(() => {
          banner = { text: ms.text, sub: ms.sub, t: 0, bonus: ms.bonus };
          flash = 0.5;
          sfxMilestone();
          confetti(W / 2, 110, 120);
          if (ms.heart && hearts < MAX_HEARTS) {
            hearts++;
            heartAnim[hearts - 1] = { t: 0, kind: 'gain' };
            setTimeout(sfxHeart, 500);
          }
        }, 650);
      }
      setTimeout(() => say(answer.toLowerCase()), 700);
      state = 'result';
      resultT = 0;
      return;
    }
    if (rows.length >= lv.rows) {
      streak = 0;
      heartAnim[hearts - 1] = { t: 0, kind: 'lose' };
      hearts--;
      result = { win: false };
      owlSay(hearts > 0 ? 'So close! The word was ' + answer + '.' : 'That was a great game!', 'sad');
      sfxMiss();
      setTimeout(() => say(answer.toLowerCase()), 600);
      state = 'result';
      resultT = 0;
      return;
    }
    // Keep going: a friendly word about the clue.
    state = 'play';
    const greens = row.res.filter((r) => r === 'correct').length;
    const yellows = row.res.filter((r) => r === 'present').length;
    if (rows.length === lv.rows - 1) owlSay('Last guess! You can do it!', 'think');
    else if (greens === lv.len - 1) owlSay('SO close! Just one letter to go!', 'cheer');
    else if (greens >= 2) owlSay('Getting warm! Keep the green ones.', 'happy');
    else if (greens + yellows === 0) owlSay('None of those! Try some new letters.', 'think');
    else if (greens === 0) owlSay('Yellow letters are in it -- try them in a new spot!', 'think');
    else owlSay('Nice clue! Keep going.', 'happy');
  }

  function nextFromResult() {
    if (state !== 'result' || resultT < 0.5) return;
    if (!result.win && hearts <= 0) gameOver();
    else startRound();
  }

  function gameOver() {
    const best = save.best[lv.id] || { score: 0, streak: 0 };
    over = { newBest: score > best.score && score > 0, words: solved, streak: bestStreak };
    recordRun();
    state = 'over';
    overT = 0;
    if (over.newBest) { setTimeout(() => { sfxMilestone(); confetti(W / 2, 80, 140); }, 400); }
  }

  function recordRun() {
    if (runRecorded) return;
    runRecorded = true;
    const best = save.best[lv.id] || { score: 0, streak: 0 };
    best.score = Math.max(best.score, score);
    best.streak = Math.max(best.streak, bestStreak);
    save.best[lv.id] = best;
    writeSave();
    if (score > 0 && window.MickleScores) MickleScores.record('secret-word', score, { category: lv.title, order: levelIdx });
  }
  window.addEventListener('pagehide', recordRun);

  function backToTitle() {
    if (state !== 'title') recordRun();
    state = 'title';
    titleSel = levelIdx;
    titleT = 0.6;
    banner = null;
    if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  // ---------- Effects ----------
  function confetti(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.4, s = 80 + Math.random() * 180;
      particles.push({
        kind: 'paper', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 14, w: 3 + Math.random() * 3, h: 2 + Math.random() * 3,
        color: pick(CONFETTI), life: 1.6 + Math.random() * 0.8,
      });
    }
  }
  function sparkle(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = 20 + Math.random() * 60;
      particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color: pick(['#fde047', '#ffffff', '#fcd34d']) });
    }
  }

  // ---------- How to play: its own page over the game (opened from the title or the menu) ----------
  const howtoEl = document.getElementById('howto');
  let howtoOpen = false;
  function openHowto() {
    if (window.MickleMenu) MickleMenu.close();
    howtoOpen = true;
    howtoEl.hidden = false;
    // restart the tile animations each time it opens
    howtoEl.querySelectorAll('.t').forEach((t) => { t.style.animationName = 'none'; void t.offsetWidth; t.style.animationName = ''; });
    document.getElementById('btn-howto-close').focus({ preventScroll: true });
    sfxMove();
  }
  function closeHowto() {
    if (!howtoOpen) return;
    howtoOpen = false;
    howtoEl.hidden = true;
    sfxMove();
  }
  document.getElementById('btn-howto').addEventListener('click', () => { ensureAudio(); openHowto(); });
  document.getElementById('btn-howto-close').addEventListener('click', closeHowto);

  // ---------- Input ----------
  function pressKey(k) {
    k.pressT = 0.14;
    if (k.ch === 'ENTER') submit();
    else if (k.ch === 'DEL') backspace();
    else typeLetter(k.ch);
  }

  function onTap(x, y) {
    if (state === 'title') {
      for (let i = 0; i < LEVELS.length; i++) {
        if (inRect(x, y, LV_CARDS[i])) {
          if (titleSel !== i) { titleSel = i; sfxMove(); }
          startRun(i);
          return;
        }
      }
      if (inRect(x, y, PLAY_BTN)) startRun(titleSel);
      else if (inRect(x, y, HOWTO_BTN)) openHowto();
      return;
    }
    if (state === 'over') {
      if (overT < 0.6) return;
      if (inRect(x, y, AGAIN_BTN)) startRun(levelIdx);
      else if (inRect(x, y, MENU_BTN)) backToTitle();
      return;
    }
    if (inRect(x, y, LEVELS_BTN)) { backToTitle(); return; }
    if (state === 'result') {
      if (canSpeak && inRect(x, y, SPEAK_BTN)) { say(answer.toLowerCase()); return; }
      nextFromResult();
      return;
    }
    if (inRect(x, y, HINT_BTN)) { useHint(); return; }
    const key = KEYS.find((k) => inRect(x, y, k));
    if (key) pressKey(key);
  }

  function moveTitle(d) {
    titleSel = (titleSel + d + LEVELS.length) % LEVELS.length;
    sfxMove();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (howtoOpen) {
      if (k === 'Escape' || k === 'Enter' || k === ' ') { e.preventDefault(); closeHowto(); }
      return;
    }
    if (k === 'Escape') {
      e.preventDefault();
      if (state === 'title') { if (window.MickleMenu) MickleMenu.backToArcade(); } else backToTitle();
      return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    ensureAudio();
    if (state === 'title') {
      if (k === 'ArrowLeft' || k === 'ArrowRight') { e.preventDefault(); moveTitle(k === 'ArrowLeft' ? -1 : 1); }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); startRun(titleSel); }
      else if (k === 'h' || k === 'H' || k === '?') { e.preventDefault(); openHowto(); }
      return;
    }
    if (state === 'over') {
      if ((k === ' ' || k === 'Enter') && !e.repeat && overT > 0.6) { e.preventDefault(); startRun(levelIdx); }
      return;
    }
    if (state === 'result') {
      if ((k === ' ' || k === 'Enter') && !e.repeat) { e.preventDefault(); nextFromResult(); }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); if (!e.repeat) { const kk = keyFor('ENTER'); kk.pressT = 0.14; submit(); } return; }
    if (k === 'Backspace') { e.preventDefault(); const kk = keyFor('DEL'); kk.pressT = 0.14; backspace(); return; }
    if (k === '?' || k === '/') { e.preventDefault(); useHint(); return; }
    if (/^[a-zA-Z]$/.test(k)) {
      e.preventDefault();
      if (e.repeat) return;
      const ch = k.toUpperCase();
      const kk = keyFor(ch);
      if (kk) kk.pressT = 0.14;
      typeLetter(ch);
    }
  });

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a, button, #howto')) return;
    e.preventDefault();
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.clientLeft) * W / canvas.clientWidth;
    const y = (e.clientY - rect.top - canvas.clientTop) * H / canvas.clientHeight;
    onTap(x, y);
  });

  // Xbox 360 controller: D-pad walks a cursor over the keyboard, A presses the key, B deletes,
  // START guesses, Y is a hint, BACK goes to the levels.
  function nearestKeyInRow(r, x) {
    let best = null, bd = 1e9;
    for (const k of KEYS) if (k.r === r) { const d = Math.abs(k.x + k.w / 2 - x); if (d < bd) { bd = d; best = k; } }
    return best;
  }
  function pollGamepad() {
    if (!window.Pad360) return;
    Pad360.poll();
    const BTN = Pad360.BTN;
    const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    const A = Pad360.pressed(BTN.A), B = Pad360.pressed(BTN.B), START = Pad360.pressed(BTN.START);
    if (howtoOpen) { if (A || B || START) closeHowto(); return; }
    if (dx || dy || A || B || START) ensureAudio();
    if (state === 'title') {
      if (dx) moveTitle(dx);
      if (A || START) startRun(titleSel);
      if (Pad360.pressed(BTN.Y)) openHowto();
      if (B || Pad360.pressed(BTN.BACK)) { if (window.MickleMenu) MickleMenu.backToArcade(); }
      return;
    }
    if (state === 'over') {
      if ((A || START) && overT > 0.6) startRun(levelIdx);
      if (B || Pad360.pressed(BTN.BACK)) backToTitle();
      return;
    }
    if (Pad360.pressed(BTN.BACK)) { backToTitle(); return; }
    if (state === 'result') { if (A || START) nextFromResult(); return; }
    if (dx || dy) {
      if (!padCursor) padCursor = keyFor('G');
      else if (dy) padCursor = nearestKeyInRow(clamp(padCursor.r + dy, 0, 2), padCursor.x + padCursor.w / 2);
      else {
        const row = KEYS.filter((k) => k.r === padCursor.r);
        padCursor = row[clamp(row.indexOf(padCursor) + dx, 0, row.length - 1)];
      }
      sfxMove();
    }
    if (A && padCursor) pressKey(padCursor);
    if (B) { keyFor('DEL').pressT = 0.14; backspace(); }
    if (START) { keyFor('ENTER').pressT = 0.14; submit(); }
    if (Pad360.pressed(BTN.Y)) useHint();
  }

  // ---------- Update ----------
  function update(dt) {
    time += dt;
    titleT += dt;
    shownScore += (score - shownScore) * Math.min(1, dt * 5);
    if (Math.abs(score - shownScore) < 0.5) shownScore = score;
    scorePulse = Math.max(0, scorePulse - dt * 2.5);
    shakeT = Math.max(0, shakeT - dt);
    flash = Math.max(0, flash - dt);
    for (let i = 0; i < popT.length; i++) if (popT[i] != null) popT[i] += dt;
    for (const k of KEYS) if (k.pressT) k.pressT = Math.max(0, k.pressT - dt);
    for (const h of heartAnim) if (h) h.t += dt;
    owl.textT += dt;
    owl.jump = Math.max(0, owl.jump - dt * 2.2);
    owl.nextBlink -= dt;
    if (owl.nextBlink <= 0) { owl.blink = 0.14; owl.nextBlink = 2 + Math.random() * 3; }
    owl.blink = Math.max(0, owl.blink - dt);

    if (state === 'reveal') {
      revealClock += dt;
      const row = rows[rows.length - 1];
      while (revealPlayed < lv.len && revealClock >= revealPlayed * FLIP_GAP + FLIP_DUR / 2) {
        sfxFlip(row.res[revealPlayed], revealPlayed);
        revealPlayed++;
      }
      if (revealClock >= revealLen()) finishReveal();
    }
    if (state === 'result') resultT += dt;
    if (state === 'over') overT += dt;
    if (winT >= 0) winT += dt;
    if (banner) { banner.t += dt; if (banner.t > 2.4) banner = null; }

    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'paper') { p.vy += 260 * dt; p.vx *= (1 - dt * 1.6); p.vy = Math.min(p.vy, 90); p.rot += p.vr * dt; }
      else { p.vx *= (1 - dt * 3); p.vy *= (1 - dt * 3); }
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0 && p.y < H + 20);
    for (const p of popups) p.t += dt;
    popups = popups.filter((p) => p.t < 1.3);
  }

  // ---------- Drawing helpers ----------
  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fitFont(text, maxW, size, weight = 800) {
    for (; size > 5; size--) {
      ctx.font = font(size, weight);
      if (ctx.measureText(text).width <= maxW) return size;
    }
    return size;
  }
  function wrap(text, maxW) {
    const words = text.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function glass(x, y, w, h, r, alpha = 0.08) {
    rr(x, y, w, h, r);
    ctx.fillStyle = 'rgba(255, 255, 255, ' + alpha + ')';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  function pill(r, label, opts = {}) {
    const top = opts.top || 'rgba(255,255,255,0.16)', bottom = opts.bottom || 'rgba(255,255,255,0.08)';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    rr(r.x, r.y + 2, r.w, r.h, r.h / 2); ctx.fill();
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    g.addColorStop(0, top); g.addColorStop(1, bottom);
    rr(r.x, r.y, r.w, r.h, r.h / 2);
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = opts.stroke || 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = opts.color || '#fff';
    ctx.textAlign = 'center';
    fitFont(label, r.w - 10, opts.size || 10);
    ctx.fillText(label, r.x + r.w / 2 + (opts.dx || 0), r.y + r.h / 2 + 1);
  }

  // One letter tile. kind: empty | typed | next | ghost | correct | present | absent.
  function drawTile(x, y, s, letter, kind, scaleY = 1, scale = 1) {
    ctx.save();
    ctx.translate(x + s / 2, y + s / 2);
    ctx.scale(scale, scale * scaleY);
    const h = s / 2, rad = s * 0.18;
    if (TILE[kind]) {
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      rr(-h, -h + 2, s, s, rad); ctx.fill();
      const g = ctx.createLinearGradient(0, -h, 0, h);
      g.addColorStop(0, TILE[kind][0]); g.addColorStop(1, TILE[kind][1]);
      rr(-h, -h, s, s, rad); ctx.fillStyle = g; ctx.fill();
      const hl = ctx.createLinearGradient(0, -h, 0, 0);
      hl.addColorStop(0, 'rgba(255,255,255,0.35)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      rr(-h + 1.5, -h + 1.5, s - 3, s * 0.45, rad * 0.8); ctx.fillStyle = hl; ctx.fill();
    } else if (kind === 'typed') {
      rr(-h, -h, s, s, rad);
      ctx.fillStyle = 'rgba(255,255,255,0.14)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 1.6; ctx.stroke();
    } else if (kind === 'next') {
      rr(-h, -h, s, s, rad);
      ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
      ctx.strokeStyle = lv.color; ctx.globalAlpha = 0.55 + 0.35 * Math.sin(time * 5); ctx.lineWidth = 1.6; ctx.stroke();
      ctx.globalAlpha = 1;
    } else {
      rr(-h, -h, s, s, rad);
      ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fill();
      ctx.strokeStyle = kind === 'ghost' ? 'rgba(253,224,71,0.7)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 1.2;
      if (kind === 'ghost') ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (letter) {
      ctx.textAlign = 'center';
      ctx.font = font(Math.round(s * 0.56), 800);
      if (TILE[kind]) { ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.fillText(letter, 0, 2.5); }
      ctx.fillStyle = kind === 'ghost' ? 'rgba(253,224,71,' + (0.55 + 0.25 * Math.sin(time * 4)) + ')' : '#ffffff';
      ctx.fillText(letter, 0, 1.5);
    }
    ctx.restore();
  }

  function heartPath(x, y, s) {
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.35);
    ctx.bezierCurveTo(x, y, x - s * 0.5, y - s * 0.05, x - s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x - s * 0.1, y + s * 0.75, x, y + s * 0.95);
    ctx.bezierCurveTo(x + s * 0.1, y + s * 0.75, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.05, x, y, x, y + s * 0.35);
    ctx.closePath();
  }
  function drawHeart(x, y, s, full, scale = 1) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    heartPath(0, -s / 2, s);
    if (full) {
      const g = ctx.createLinearGradient(0, -s / 2, 0, s / 2);
      g.addColorStop(0, '#fb7185'); g.addColorStop(1, '#e11d48');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.beginPath(); ctx.ellipse(-s * 0.22, -s * 0.12, s * 0.09, s * 0.06, -0.6, 0, Math.PI * 2); ctx.fill();
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.1)'; ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    }
    ctx.restore();
  }

  function drawFlame(x, y, s, t) {
    const f = 1 + Math.sin(t * 12) * 0.06;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s / 10, (s / 10) * f);
    const g = ctx.createLinearGradient(0, -8, 0, 6);
    g.addColorStop(0, '#fde047'); g.addColorStop(0.6, '#fb923c'); g.addColorStop(1, '#ef4444');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.bezierCurveTo(5, -3, 7, 1, 5, 4);
    ctx.bezierCurveTo(3, 7, -3, 7, -5, 4);
    ctx.bezierCurveTo(-7, 0, -3, -2, -2, -6);
    ctx.bezierCurveTo(-1, -3, 1, -3, 0, -9);
    ctx.fill();
    ctx.fillStyle = '#fef9c3';
    ctx.beginPath(); ctx.ellipse(0, 3, 2, 3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // Hoot the owl, who cheers you on.
  function drawOwl(x, y, r, mood) {
    const hop = Math.sin(Math.min(1, 1 - owl.jump) * Math.PI) * (owl.jump > 0 ? r * 0.35 : 0);
    const bob = Math.sin(time * 2.2) * r * 0.04;
    ctx.save();
    ctx.translate(x, y + bob - hop);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath(); ctx.ellipse(0, r * 1.12 + hop, r * 0.7, r * 0.12, 0, 0, Math.PI * 2); ctx.fill();
    // tufts
    ctx.fillStyle = '#7c3aed';
    ctx.beginPath(); ctx.moveTo(-r * 0.75, -r * 0.55); ctx.lineTo(-r * 0.62, -r * 1.12); ctx.lineTo(-r * 0.25, -r * 0.8); ctx.fill();
    ctx.beginPath(); ctx.moveTo(r * 0.75, -r * 0.55); ctx.lineTo(r * 0.62, -r * 1.12); ctx.lineTo(r * 0.25, -r * 0.8); ctx.fill();
    // wings (flap when cheering)
    const flap = mood === 'cheer' ? Math.sin(time * 18) * 0.5 : 0;
    ctx.fillStyle = '#6d28d9';
    [-1, 1].forEach((sd) => {
      ctx.save();
      ctx.translate(sd * r * 0.82, r * 0.15);
      ctx.rotate(sd * (0.25 + flap));
      ctx.beginPath(); ctx.ellipse(0, r * 0.15, r * 0.25, r * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    });
    // body
    const g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, r * 0.2, 0, 0, r * 1.2);
    g.addColorStop(0, '#c4b5fd'); g.addColorStop(0.5, '#8b5cf6'); g.addColorStop(1, '#6d28d9');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r * 1.05, 0, 0, Math.PI * 2); ctx.fill();
    // belly
    ctx.fillStyle = '#ede9fe';
    ctx.beginPath(); ctx.ellipse(0, r * 0.42, r * 0.55, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(124,58,237,0.35)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      for (let j = -1; j <= 1; j++) {
        const bx = j * r * 0.22 + (i % 2) * r * 0.11, by = r * 0.25 + i * r * 0.18;
        ctx.beginPath(); ctx.arc(bx, by, r * 0.07, 0.2, Math.PI - 0.2); ctx.stroke();
      }
    }
    // face discs + eyes
    const look = mood === 'sad' ? { x: 0, y: 0.06 } : { x: Math.sin(time * 0.7) * 0.04, y: 0 };
    [-1, 1].forEach((sd) => {
      const ex = sd * r * 0.36, ey = -r * 0.3;
      ctx.fillStyle = '#f5f3ff';
      ctx.beginPath(); ctx.arc(ex, ey, r * 0.34, 0, Math.PI * 2); ctx.fill();
      if (mood === 'cheer' || owl.blink > 0) {
        ctx.strokeStyle = '#1e1b4b'; ctx.lineWidth = Math.max(1.2, r * 0.08); ctx.lineCap = 'round';
        ctx.beginPath();
        if (mood === 'cheer') ctx.arc(ex, ey + r * 0.08, r * 0.15, Math.PI * 1.15, Math.PI * 1.85);
        else { ctx.moveTo(ex - r * 0.15, ey); ctx.lineTo(ex + r * 0.15, ey); }
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else {
        ctx.fillStyle = '#1e1b4b';
        ctx.beginPath(); ctx.arc(ex + look.x * r, ey + look.y * r, r * 0.18, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath(); ctx.arc(ex + look.x * r - r * 0.06, ey + look.y * r - r * 0.07, r * 0.06, 0, Math.PI * 2); ctx.fill();
      }
      if (mood === 'sad' || mood === 'think') {
        ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = Math.max(1, r * 0.07);
        ctx.beginPath();
        const tilt = mood === 'sad' ? -sd : sd * 0.4;
        ctx.moveTo(ex - r * 0.2, ey - r * 0.42 + tilt * r * 0.06);
        ctx.lineTo(ex + r * 0.2, ey - r * 0.42 - tilt * r * 0.06);
        ctx.stroke();
      }
    });
    // beak
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.moveTo(-r * 0.12, -r * 0.08); ctx.lineTo(r * 0.12, -r * 0.08); ctx.lineTo(0, r * 0.14); ctx.fill();
    // feet
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath(); ctx.ellipse(-r * 0.3, r * 1.03, r * 0.17, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(r * 0.3, r * 1.03, r * 0.17, r * 0.08, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  // ---------- Scenes ----------
  const FLOATERS = Array.from({ length: 14 }, (_, i) => ({
    x: Math.random() * W, y: Math.random() * H, s: 10 + Math.random() * 14,
    v: 4 + Math.random() * 6, ch: 'ABCDEFGHIJKLMNOPRSTUW'[i % 21], rot: (Math.random() - 0.5) * 0.6,
  }));
  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#1e1b4b'); g.addColorStop(1, '#0b1026');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const sx = W / 480, sy = H / 270;
    const blobs = [
      [(90 + Math.sin(time * 0.21) * 50) * sx, (70 + Math.cos(time * 0.17) * 30) * sy, 190, 'rgba(139, 92, 246, 0.32)'],
      [(400 + Math.cos(time * 0.15) * 50) * sx, (220 + Math.sin(time * 0.19) * 30) * sy, 210, 'rgba(20, 184, 166, 0.2)'],
      [(320 + Math.sin(time * 0.12) * 70) * sx, 10, 150, 'rgba(236, 72, 153, 0.16)'],
    ];
    for (const [x, y, r, c] of blobs) {
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, W, H);
    }
  }
  function drawFloaters(alpha) {
    ctx.textAlign = 'center';
    for (const f of FLOATERS) {
      f.y -= f.v * (1 / 60);
      if (f.y < -20) { f.y = H + 20; f.x = Math.random() * W; }
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.rotate(f.rot + Math.sin(time * 0.5 + f.x) * 0.1);
      ctx.globalAlpha = alpha;
      rr(-f.s / 2, -f.s / 2, f.s, f.s, f.s * 0.2);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(Math.round(f.s * 0.55));
      ctx.fillText(f.ch, 0, 1);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  const LOGO = 'SECRET WORD';
  const LOGO_KINDS = ['correct', 'present', 'absent', 'correct', 'present', 'correct', null, 'present', 'correct', 'absent', 'correct'];
  function drawLogoRow(text, kinds, firstIdx, y, s, gap) {
    const total = text.length * (s + gap) - gap;
    let x = (W - total) / 2;
    for (let j = 0; j < text.length; j++) {
      const i = firstIdx + j;
      const u = clamp((time - 0.15 - i * 0.07) / 0.45, 0, 1);
      const sy = u < 1 ? Math.abs(Math.cos(u * Math.PI)) : 1;
      const kind = u < 0.5 ? 'typed' : kinds[j];
      const bobY = Math.sin(time * 2.4 - i * 0.5) * 2;
      drawTile(x, y + bobY, s, text[j], kind, Math.max(0.02, sy));
      x += s + gap;
    }
  }

  function drawLevelCard(i) {
    const L = LEVELS[i], sel = i === titleSel, r = LV_CARDS[i];
    const lift = sel ? -3 - Math.sin(time * 4) * 1 : 0;
    const sc = sel ? (tall ? 1.03 : 1.06) : 1;
    ctx.save();
    ctx.translate(r.x + r.w / 2, r.y + r.h / 2 + lift);
    ctx.scale(sc, sc);
    const x0 = -r.w / 2, y0 = -r.h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    rr(x0, y0 + 3, r.w, r.h, 9); ctx.fill();
    const g = ctx.createLinearGradient(0, y0, 0, y0 + r.h);
    g.addColorStop(0, sel ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.11)');
    g.addColorStop(1, sel ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)');
    rr(x0, y0, r.w, r.h, 9); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = sel ? L.color : 'rgba(255,255,255,0.14)';
    ctx.lineWidth = sel ? 2 : 1;
    if (sel) { ctx.shadowColor = L.color; ctx.shadowBlur = 10; }
    ctx.stroke();
    ctx.shadowBlur = 0;
    // colour band: along the top when wide, down the left side when tall
    ctx.save(); rr(x0, y0, r.w, r.h, 9); ctx.clip();
    ctx.fillStyle = L.color; ctx.globalAlpha = 0.9;
    if (tall) ctx.fillRect(x0, y0, 5, r.h); else ctx.fillRect(x0, y0, r.w, 5);
    ctx.restore();
    const best = save.best[L.id];
    const bestText = best && best.score ? '★ BEST ' + best.score : 'NO SCORE YET';
    const info = L.grades + ' · ' + L.len + ' LETTERS';
    if (!tall) {
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      fitFont(L.name, r.w - 12, L.name.length > 2 ? 20 : 30, 900);
      ctx.fillText(L.name, 0, y0 + 25);
      ctx.font = font(9, 900);
      ctx.fillStyle = L.color;
      ctx.fillText(L.sub, 0, y0 + 44);
      fitFont(info, r.w - 10, 7, 700);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(info, 0, y0 + 55);
      ctx.font = font(8, 800);
      ctx.fillStyle = best && best.score ? '#fde047' : 'rgba(255,255,255,0.35)';
      ctx.fillText(bestText, 0, y0 + 69);
    } else {
      // name on the left, what it is in the middle, best score on the right
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fff';
      fitFont(L.name, 52, L.name.length > 2 ? 15 : 24, 900);
      ctx.fillText(L.name, x0 + 38, 1);
      ctx.textAlign = 'left';
      ctx.font = font(10, 900);
      ctx.fillStyle = L.color;
      ctx.fillText(L.sub, x0 + 72, -7);
      fitFont(info, 96, 8, 700);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(info, x0 + 72, 8);
      ctx.textAlign = 'right';
      ctx.font = font(8, 800);
      ctx.fillStyle = best && best.score ? '#fde047' : 'rgba(255,255,255,0.35)';
      ctx.fillText(best && best.score ? '★ ' + best.score : '—', -x0 - 10, 1);
    }
    ctx.restore();
  }

  function drawTitle() {
    drawFloaters(0.06);
    // logo tiles flip in one by one, then bob in a gentle wave
    if (!tall) {
      const s = 28, gap = 4, spaceW = 12;
      const total = 10 * (s + gap) - gap + spaceW;
      const left = (W - total) / 2;
      // two words drawn as one row with a space between
      const wordW = 6 * (s + gap) - gap;
      ctx.save(); ctx.translate(left + wordW / 2 - W / 2, 0); drawLogoRow('SECRET', LOGO_KINDS.slice(0, 6), 0, 26, s, gap); ctx.restore();
      const word2 = 4 * (s + gap) - gap;
      ctx.save(); ctx.translate(left + wordW + spaceW + gap + word2 / 2 - W / 2, 0); drawLogoRow('WORD', LOGO_KINDS.slice(7), 7, 26, s, gap); ctx.restore();
      drawOwl(447, 44, 17, 'happy');
      ctx.textAlign = 'center';
      ctx.font = font(11, 600);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fillText('Guess the secret word. Get them in a row for big bonuses!', W / 2, 76);
    } else {
      drawLogoRow('SECRET', LOGO_KINDS.slice(0, 6), 0, 34, 32, 5);
      drawLogoRow('WORD', LOGO_KINDS.slice(7), 7, 74, 32, 5);
      drawOwl(236, 92, 15, 'happy');
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      fitFont('Guess the secret word. Streaks win bonuses!', W - 24, 10, 600);
      ctx.fillText('Guess the secret word. Streaks win bonuses!', W / 2, 120);
    }

    for (let i = 0; i < LEVELS.length; i++) drawLevelCard(i);

    const L = LEVELS[titleSel];
    const pulse = 1 + Math.sin(time * 4) * 0.03;
    ctx.save();
    ctx.translate(PLAY_BTN.x + PLAY_BTN.w / 2, PLAY_BTN.y + PLAY_BTN.h / 2);
    ctx.scale(pulse, pulse);
    pill({ x: -PLAY_BTN.w / 2, y: -PLAY_BTN.h / 2, w: PLAY_BTN.w, h: PLAY_BTN.h }, 'PLAY ' + L.title + '  ▶', { top: '#4ade80', bottom: '#16a34a', stroke: 'rgba(255,255,255,0.35)', size: 12 });
    ctx.restore();

    pill(HOWTO_BTN, 'HOW TO PLAY', { size: 11, dx: 10, stroke: 'rgba(252,211,77,0.6)', color: '#fde68a' });
    const qx = HOWTO_BTN.x + 16, qy = HOWTO_BTN.y + HOWTO_BTN.h / 2;
    ctx.fillStyle = '#fcd34d';
    ctx.beginPath(); ctx.arc(qx, qy, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#422006';
    ctx.textAlign = 'center';
    ctx.font = font(10, 900);
    ctx.fillText('?', qx, qy + 1);

    // how it works
    const items = [['correct', 'A', 'RIGHT SPOT'], ['present', 'B', 'IN THE WORD'], ['absent', 'C', 'NOT IN IT']];
    const ts = tall ? 14 : 18, ly = tall ? 456 : 226, step = tall ? 86 : 104;
    let lx = tall ? 14 : 92;
    for (const [k, ch, label] of items) {
      drawTile(lx, ly, ts, ch, k);
      ctx.textAlign = 'left';
      ctx.font = font(tall ? 8 : 9, 700);
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(label, lx + ts + 5, ly + ts / 2 + 1);
      lx += step;
    }
  }

  function drawTopBar() {
    pill(LEVELS_BTN, '‹ LEVELS', { size: 9 });
    // level chip, after the ☰ button
    ctx.textAlign = 'left';
    ctx.fillStyle = lv.color;
    ctx.beginPath(); ctx.arc(HUD.chipX + 3.5, HUD.chipY, 3.5, 0, Math.PI * 2); ctx.fill();
    ctx.font = font(10, 800);
    ctx.fillStyle = '#fff';
    ctx.fillText(lv.title, HUD.chipX + 11, HUD.chipY + 0.5);
    // streak
    if (streak > 0) {
      const mult = streakMult(streak);
      const label = streak + ' IN A ROW' + (mult > 1 ? '  ×' + mult : '');
      ctx.font = font(10, 800);
      const tw = ctx.measureText(label).width;
      const w = tw + 30, cx = HUD.streakRight ? HUD.streakRight - w / 2 : HUD.streakCx, cy = HUD.streakY;
      glass(cx - w / 2, cy - 9, w, 18, 9, 0.1);
      drawFlame(cx - w / 2 + 12, cy, 9 + Math.min(streak, 10) * 0.4, time);
      ctx.textAlign = 'left';
      ctx.fillStyle = mult > 1 ? '#fde047' : '#fff';
      ctx.fillText(label, cx - w / 2 + 22, cy + 0.5);
    }
    // hearts
    const shown = Math.max(START_HEARTS, hearts + (heartAnim.some((h) => h && h.kind === 'lose' && h.t < 0.6) ? 1 : 0));
    for (let i = 0; i < Math.min(MAX_HEARTS, shown); i++) {
      const a = heartAnim[i];
      let sc = 1, full = i < hearts;
      if (a && a.kind === 'gain' && a.t < 0.8) sc = a.t < 0.5 ? 0.6 : easeOutBack(clamp((a.t - 0.5) / 0.3, 0, 1)) * 1.0;
      if (a && a.kind === 'gain' && a.t < 0.5) full = false;
      if (a && a.kind === 'lose' && a.t < 0.6) { full = true; sc = 1 + a.t * 0.8; ctx.globalAlpha = 1 - a.t / 0.6; }
      drawHeart(HUD.heartsX + i * HUD.heartGap, 14, 11, full, sc);
      ctx.globalAlpha = 1;
    }
    // score
    ctx.textAlign = 'right';
    const ps = 1 + scorePulse * 0.25;
    ctx.save();
    ctx.translate(W - 8, 14.5);
    ctx.scale(ps, ps);
    ctx.font = font(15, 900);
    ctx.fillStyle = scorePulse > 0 ? '#fde047' : '#fff';
    ctx.fillText(String(Math.round(shownScore)), 0, 0);
    ctx.restore();
  }

  function drawGrid() {
    const g = gridGeom();
    const shake = shakeT > 0 ? Math.sin(shakeT * 60) * 4 * (shakeT / 0.45) : 0;
    for (let r = 0; r < lv.rows; r++) {
      const y = g.y0 + r * (g.s + g.gap);
      const row = rows[r];
      const isCur = r === rows.length && (state === 'play');
      const revealing = state === 'reveal' && r === rows.length - 1;
      for (let i = 0; i < lv.len; i++) {
        let x = g.x0 + i * (g.s + g.gap);
        if (row) {
          let kind = row.res[i], sy = 1, dy = 0;
          if (revealing) {
            const u = (revealClock - i * FLIP_GAP) / FLIP_DUR;
            if (u < 0) kind = 'typed';
            else if (u < 1) { sy = Math.max(0.02, Math.abs(Math.cos(u * Math.PI))); kind = u < 0.5 ? 'typed' : row.res[i]; dy = -Math.sin(u * Math.PI) * 3; }
          }
          if (result && result.win && r === rows.length - 1 && winT >= 0) {
            const v = (winT - i * 0.09) / 0.38;
            if (v > 0 && v < 1) dy = -Math.sin(v * Math.PI) * 9;
          }
          drawTile(x, y + dy, g.s, row.letters[i], kind, sy);
        } else if (isCur) {
          x += shake;
          if (i < cur.length) {
            const t = popT[i] || 0;
            const sc = 1 + 0.22 * Math.exp(-t * 16) * Math.cos(t * 30);
            drawTile(x, y, g.s, cur[i], 'typed', 1, t < 0.5 ? sc : 1);
          } else if (hints.indexOf(i) >= 0) drawTile(x, y, g.s, answer[i], 'ghost');
          else drawTile(x, y, g.s, '', i === cur.length ? 'next' : 'empty');
        } else drawTile(x, y, g.s, '', 'empty');
      }
    }
  }

  function drawCard() {
    glass(CARD.x, CARD.y, CARD.w, CARD.h, 12, 0.07);
    drawOwl(CARD.x + 25, CARD.y + 38, 17, owl.mood);
    // speech bubble with a little tail
    const b = BUBBLE;
    const pop = easeOutBack(clamp(owl.textT / 0.25, 0, 1));
    ctx.save();
    ctx.translate(b.x, b.y + b.h / 2);
    ctx.scale(0.85 + 0.15 * pop, 0.85 + 0.15 * pop);
    ctx.translate(-b.x, -(b.y + b.h / 2));
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    rr(b.x, b.y, b.w, b.h, 10); ctx.fill();
    ctx.beginPath(); ctx.moveTo(b.x + 1, b.y + 14); ctx.lineTo(b.x - 7, b.y + 19); ctx.lineTo(b.x + 1, b.y + 24); ctx.fill();
    ctx.fillStyle = '#1e1b4b';
    ctx.textAlign = 'left';
    let size = 10;
    let lines;
    for (; size >= 7; size--) { ctx.font = font(size, 700); lines = wrap(owl.text, b.w - 14); if (lines.length <= 2) break; }
    const lh = size + 3;
    lines.slice(0, 3).forEach((ln, i) => ctx.fillText(ln, b.x + 7, b.y + b.h / 2 + (i - (Math.min(lines.length, 3) - 1) / 2) * lh + 0.5));
    ctx.restore();
    // hint button + word counter
    const left = lv.hints - hints.length;
    const can = state === 'play' && left > 0;
    ctx.globalAlpha = can ? 1 : 0.45;
    pill(HINT_BTN, 'HINT ×' + left, can ? { top: '#fcd34d', bottom: '#f59e0b', color: '#422006', size: 9, dx: 6, stroke: 'rgba(255,255,255,0.4)' } : { size: 9, dx: 6 });
    // light bulb
    const bx = HINT_BTN.x + 13, by = HINT_BTN.y + HINT_BTN.h / 2;
    ctx.fillStyle = can ? '#fff' : 'rgba(255,255,255,0.7)';
    ctx.beginPath(); ctx.arc(bx, by - 1.5, 3.6, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(bx - 1.8, by + 1.5, 3.6, 3);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'right';
    ctx.font = font(9, 700);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText('WORD ' + round + '  ·  TRY ' + Math.min(rows.length + 1, lv.rows) + '/' + lv.rows, CARD.x + CARD.w - 8, HINT_BTN.y + HINT_BTN.h / 2 + 1);
  }

  function drawKeyboard() {
    const ready = state === 'play' && cur.length === lv.len;
    for (const k of KEYS) {
      const st = keyState[k.ch];
      const press = k.pressT > 0 ? k.pressT / 0.14 : 0;
      const y = k.y + press * 2;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rr(k.x, k.y + 2.5, k.w, k.h, 6); ctx.fill();
      const g = ctx.createLinearGradient(0, y, 0, y + k.h);
      if (st && TILE[st] && st !== 'absent') { g.addColorStop(0, TILE[st][0]); g.addColorStop(1, TILE[st][1]); }
      else if (st === 'absent') { g.addColorStop(0, 'rgba(255,255,255,0.05)'); g.addColorStop(1, 'rgba(255,255,255,0.03)'); }
      else if (k.ch === 'ENTER' && ready) { g.addColorStop(0, '#4ade80'); g.addColorStop(1, '#16a34a'); }
      else { g.addColorStop(0, 'rgba(255,255,255,0.2)'); g.addColorStop(1, 'rgba(255,255,255,0.1)'); }
      rr(k.x, y, k.w, k.h, 6); ctx.fillStyle = g; ctx.fill();
      if (press) { ctx.fillStyle = 'rgba(255,255,255,' + 0.3 * press + ')'; ctx.fill(); }
      if (k.ch === 'ENTER' && ready) {
        ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 + 0.4 * Math.sin(time * 6)) + ')'; ctx.lineWidth = 1.5; ctx.stroke();
      }
      if (padCursor === k) { ctx.strokeStyle = lv.color; ctx.lineWidth = 2; rr(k.x - 1.5, y - 1.5, k.w + 3, k.h + 3, 7); ctx.stroke(); }
      ctx.textAlign = 'center';
      ctx.fillStyle = st === 'absent' ? 'rgba(255,255,255,0.3)' : '#fff';
      if (k.ch === 'DEL') {
        const cx = k.x + k.w / 2, cy = y + k.h / 2;
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.lineJoin = 'round';
        ctx.beginPath(); ctx.moveTo(cx - 8, cy); ctx.lineTo(cx - 3, cy - 5); ctx.lineTo(cx + 8, cy - 5); ctx.lineTo(cx + 8, cy + 5); ctx.lineTo(cx - 3, cy + 5); ctx.closePath(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(cx, cy - 2); ctx.lineTo(cx + 4, cy + 2); ctx.moveTo(cx + 4, cy - 2); ctx.lineTo(cx, cy + 2); ctx.stroke();
      } else if (k.ch === 'ENTER') {
        ctx.font = font(8, 900);
        ctx.fillText('ENTER', k.x + k.w / 2, y + k.h / 2 + 1);
      } else {
        ctx.font = font(12, 800);
        ctx.fillText(k.ch, k.x + k.w / 2, y + k.h / 2 + 1);
      }
    }
  }

  function drawResult() {
    const u = easeOutCubic(clamp(resultT / 0.35, 0, 1));
    const x = RESULT.x, y = RESULT.y + (1 - u) * 40, w = RESULT.w, h = RESULT.h;
    ctx.globalAlpha = u;
    ctx.fillStyle = 'rgba(15, 12, 41, 0.92)';
    rr(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = result.win ? 'rgba(74, 222, 128, 0.6)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'center';
    const cx = x + w / 2;
    if (result.win) {
      const s = easeOutBack(clamp((resultT - 0.1) / 0.4, 0, 1));
      ctx.save(); ctx.translate(cx, y + 26); ctx.scale(s, s);
      ctx.fillStyle = '#4ade80';
      fitFont(result.cheer, w - 20, 20, 900);
      ctx.fillText(result.cheer, 0, 0);
      ctx.restore();
      ctx.font = font(10, 600); ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('Solved in ' + result.guesses + (result.guesses === 1 ? ' guess' : ' guesses') + (hints.length ? ' with ' + hints.length + (hints.length === 1 ? ' hint' : ' hints') : ''), cx, y + 48);
      ctx.font = font(26, 900); ctx.fillStyle = '#fde047';
      ctx.fillText('+' + result.pts, cx, y + 76);
      if (result.mult > 1 || result.ms) {
        const parts = [];
        if (result.mult > 1) parts.push('×' + result.mult + ' STREAK');
        if (result.ms) parts.push('+' + result.ms.bonus + ' BONUS');
        ctx.font = font(9, 800); ctx.fillStyle = '#fb923c';
        ctx.fillText(parts.join('   ·   '), cx, y + 97);
      }
    } else {
      ctx.font = font(10, 700); ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.fillText('THE SECRET WORD WAS', cx, y + 20);
      const s = Math.min(30, (w - 30) / lv.len - 4);
      const gw = lv.len * (s + 4) - 4;
      for (let i = 0; i < lv.len; i++) {
        const uu = clamp((resultT - 0.15 - i * 0.1) / 0.35, 0, 1);
        drawTile(cx - gw / 2 + i * (s + 4), y + 34, s, answer[i], uu < 0.5 ? 'typed' : 'correct', Math.max(0.02, Math.abs(Math.cos(uu * Math.PI))));
      }
      ctx.font = font(10, 700);
      ctx.fillStyle = hearts > 0 ? '#fda4af' : '#fff';
      ctx.fillText(hearts > 0 ? 'You lost a heart. ' + hearts + ' left -- keep going!' : 'Out of hearts. Great game!', cx, y + 86);
    }
    if (canSpeak) {
      pill(SPEAK_BTN, '', { size: 9 });
      const sx = SPEAK_BTN.x + SPEAK_BTN.w / 2 - 3, sy = SPEAK_BTN.y + SPEAK_BTN.h / 2;
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.moveTo(sx - 6, sy - 3); ctx.lineTo(sx - 3, sy - 3); ctx.lineTo(sx + 2, sy - 7); ctx.lineTo(sx + 2, sy + 7); ctx.lineTo(sx - 3, sy + 3); ctx.lineTo(sx - 6, sy + 3); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(sx + 3, sy, 4, -0.9, 0.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(sx + 3, sy, 7.5, -0.9, 0.9); ctx.stroke();
    }
    const last = !result.win && hearts <= 0;
    const ready = resultT >= 0.5;
    ctx.globalAlpha = u * (ready ? 1 : 0.5);
    const nb = canSpeak ? NEXT_BTN : { x: RESULT.x + (RESULT.w - 160) / 2, y: NEXT_BTN.y, w: 160, h: NEXT_BTN.h };
    pill(nb, last ? 'SEE MY SCORE  ▶' : 'NEXT WORD  ▶', { top: '#4ade80', bottom: '#16a34a', stroke: 'rgba(255,255,255,0.35)', size: 12 });
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    const t = banner.t;
    const s = easeOutBack(clamp(t / 0.4, 0, 1));
    const a = t > 1.9 ? Math.max(0, 1 - (t - 1.9) / 0.5) : 1;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(10, 8, 30, 0.45)';
    const by = tall ? 220 : 114;
    ctx.fillRect(0, by - 26, W, 70);
    ctx.translate(W / 2, by);
    ctx.scale(s, s);
    ctx.rotate(Math.sin(t * 3) * 0.02);
    ctx.textAlign = 'center';
    fitFont(banner.text, W - 24, 34, 900);
    const g = ctx.createLinearGradient(0, -18, 0, 18);
    g.addColorStop(0, '#fef08a'); g.addColorStop(0.5, '#fbbf24'); g.addColorStop(1, '#f97316');
    ctx.shadowColor = 'rgba(251, 191, 36, 0.8)'; ctx.shadowBlur = 16;
    ctx.fillStyle = g;
    ctx.fillText(banner.text, 0, 0);
    ctx.shadowBlur = 0;
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.strokeText(banner.text, 0, 0);
    ctx.font = font(11, 800); ctx.fillStyle = '#fff';
    ctx.fillText(banner.sub + '  ·  +' + banner.bonus, 0, 28);
    ctx.restore();
  }

  function drawOver() {
    const u = easeOutCubic(clamp(overT / 0.4, 0, 1));
    ctx.fillStyle = 'rgba(8, 6, 24, ' + 0.6 * u + ')';
    ctx.fillRect(0, 0, W, H);
    const o = OVER, dy = (1 - u) * 30;
    ctx.globalAlpha = u;
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; rr(o.x, o.y + dy + 4, o.w, o.h, 18); ctx.fill();
    const g = ctx.createLinearGradient(0, o.y, 0, o.y + o.h);
    g.addColorStop(0, '#312e81'); g.addColorStop(1, '#1e1b4b');
    rr(o.x, o.y + dy, o.w, o.h, 18); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    drawOwl(o.x + 34, o.y + dy + 36, 18, 'cheer');
    ctx.textAlign = 'center';
    const cx = o.x + o.w / 2 + 14;
    ctx.fillStyle = '#fff';
    fitFont(over.newBest ? 'NEW BEST SCORE!' : 'GREAT GAME!', o.w - 84, 18, 900);
    ctx.fillText(over.newBest ? 'NEW BEST SCORE!' : 'GREAT GAME!', cx, o.y + dy + 28);
    ctx.font = font(9, 700); ctx.fillStyle = lv.color;
    ctx.fillText(lv.title, cx, o.y + dy + 46);
    const shown = Math.round(score * easeOutCubic(clamp((overT - 0.2) / 1.0, 0, 1)));
    ctx.font = font(38, 900);
    const sg = ctx.createLinearGradient(0, o.y + dy + 60, 0, o.y + dy + 100);
    sg.addColorStop(0, '#fef08a'); sg.addColorStop(1, '#f59e0b');
    ctx.fillStyle = sg;
    ctx.fillText(String(shown), o.x + o.w / 2, o.y + dy + 82);
    const stats = [['WORDS', over.words], ['BEST STREAK', over.streak], ['TOP SCORE', Math.max(score, (save.best[lv.id] || {}).score || 0)]];
    stats.forEach(([label, v], i) => {
      const bx = o.x + (o.w - 222) / 2 + i * 76;
      glass(bx, o.y + dy + 106, 70, 36, 9, 0.08);
      ctx.font = font(15, 900); ctx.fillStyle = '#fff';
      ctx.fillText(String(v), bx + 35, o.y + dy + 120);
      ctx.font = font(7, 700); ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillText(label, bx + 35, o.y + dy + 134);
    });
    const ready = overT > 0.6;
    ctx.globalAlpha = u * (ready ? 1 : 0.5);
    pill({ x: AGAIN_BTN.x, y: AGAIN_BTN.y + dy, w: AGAIN_BTN.w, h: AGAIN_BTN.h }, 'PLAY AGAIN  ▶', { top: '#4ade80', bottom: '#16a34a', stroke: 'rgba(255,255,255,0.35)', size: 12 });
    pill({ x: MENU_BTN.x, y: MENU_BTN.y + dy, w: MENU_BTN.w, h: MENU_BTN.h }, 'LEVELS', { size: 11 });
    ctx.globalAlpha = 1;
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      if (p.kind === 'paper') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.scale(1, Math.abs(Math.cos(p.rot * 1.3)) * 0.8 + 0.2);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
    for (const p of popups) {
      const s = easeOutBack(clamp(p.t / 0.3, 0, 1));
      ctx.save();
      ctx.globalAlpha = p.t > 0.9 ? Math.max(0, 1 - (p.t - 0.9) / 0.4) : 1;
      ctx.translate(p.x, p.y - p.t * 18);
      ctx.scale(s, s);
      ctx.textAlign = 'center';
      ctx.font = font(p.size, 900);
      ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillText(p.text, 0, 2);
      ctx.fillStyle = p.color; ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  function render() {
    drawBackground();
    if (state === 'title') {
      drawTitle();
    } else {
      drawTopBar();
      drawGrid();
      drawCard();
      drawKeyboard();
      if (state === 'result' || (state === 'over' && result)) drawResult();
      if (banner) drawBanner();
      if (state === 'over') drawOver();
    }
    drawParticles();
    if (flash > 0) { ctx.fillStyle = 'rgba(255,255,255,' + flash * 0.25 + ')'; ctx.fillRect(0, 0, W, H); }
  }

  // ---------- Loop ----------
  fit(true);
  if (window.ResizeObserver) new ResizeObserver(() => fit(false)).observe(canvas);
  window.addEventListener('resize', () => fit(false));
  window.addEventListener('orientationchange', () => setTimeout(() => fit(false), 120));
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    pollGamepad();
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // For testing in the console.
  window.SecretWordDebug = {
    get state() { return state; },
    get answer() { return answer; },
    start: (i) => startRun(i == null ? titleSel : i),
    type: (word) => { for (const ch of word.toUpperCase()) typeLetter(ch); },
    submit, useHint, next: () => { resultT = 1; nextFromResult(); },
    tick: (dt) => { update(dt); render(); },
    setStreak: (s) => { streak = s; },
    lists: () => Object.keys(LISTS).map((k) => k + ':' + LISTS[k].length).join(' '),
  };
})();
