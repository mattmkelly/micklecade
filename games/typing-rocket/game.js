(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H, (c) => { c.textBaseline = 'middle'; });

  const SAVE_KEY = 'typingRocket.save';
  const ITEMS_PER_ROUND = 8;

  // ---------- Lessons ----------
  // Every grade builds a round of ITEMS_PER_ROUND items for a level: { text, spell }. A spell
  // item is shown (and read aloud) for a moment, then hidden, and typed from memory. Typing is
  // never case-sensitive -- a capital letter typed small still counts -- so the only thing that
  // ever "goes wrong" is pressing a different key, and that just wiggles the letter.
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = ri(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  // Draw n things from a list, without repeats until the list runs out.
  function draw(list, n) {
    const out = [];
    let bag = [];
    while (out.length < n) {
      if (!bag.length) bag = shuffle(list.slice());
      out.push(bag.pop());
    }
    return out;
  }

  const WORDS = {
    k: ['cat', 'dog', 'sun', 'hat', 'bed', 'pig', 'run', 'map', 'fox', 'bus', 'cup', 'red', 'top', 'big',
      'hop', 'sit', 'jam', 'net', 'mud', 'van', 'web', 'yes', 'zip', 'kid', 'leg', 'log', 'man', 'pan', 'pet',
      'ten', 'wig', 'bug', 'hen', 'jet', 'mom', 'dad', 'fun', 'box', 'six', 'win'],
    g1: ['the', 'and', 'see', 'you', 'play', 'look', 'said', 'like', 'come', 'here', 'jump', 'help', 'went',
      'they', 'what', 'down', 'make', 'ride', 'cake', 'bike', 'boat', 'frog', 'fish', 'ship', 'shop', 'tree',
      'green', 'sleep', 'blue', 'with', 'have', 'this', 'that', 'from', 'when', 'good', 'into', 'snow', 'rain', 'star'],
    g2: ['friend', 'people', 'around', 'again', 'every', 'school', 'water', 'would', 'could', 'should', 'those',
      'many', 'very', 'about', 'animal', 'little', 'before', 'garden', 'rabbit', 'pencil', 'kitten', 'sister',
      'brother', 'morning', 'flower', 'rainbow', 'happy', 'funny', 'family', 'jumping', 'birthday', 'pizza'],
    g3: ['because', 'beautiful', 'believe', 'special', 'favorite', 'different', 'together', 'important',
      'breakfast', 'surprise', 'tomorrow', 'answer', 'thought', 'through', 'enough', 'laugh', 'minute', 'piece',
      'eight', 'neighbor', 'weather', 'question', 'island', 'listen', 'castle', 'giant', 'library', 'dinosaur'],
    g4: ['Wednesday', 'February', 'adventure', 'character', 'temperature', 'environment', 'vegetable',
      'calendar', 'chocolate', 'knowledge', 'probably', 'restaurant', 'science', 'discover', 'imagine',
      'machine', 'treasure', 'mountain', 'astronaut', 'ocean', 'kangaroo', 'invention', 'experiment', 'gymnasium'],
    g5: ['necessary', 'separate', 'definitely', 'rhythm', 'immediately', 'disappear', 'government',
      'beginning', 'February', 'occasion', 'recommend', 'embarrass', 'ancient', 'curiosity', 'volcano',
      'telescope', 'microscope', 'hurricane', 'achievement', 'environment', 'magnificent', 'mysterious'],
    g6: ['accommodate', 'occasionally', 'independent', 'exaggerate', 'mischievous', 'guarantee', 'conscience',
      'parallel', 'privilege', 'questionnaire', 'maintenance', 'phenomenon', 'archaeology', 'hypothesis',
      'photosynthesis', 'civilization', 'perseverance', 'opportunity', 'enthusiastic', 'extraordinary'],
  };

  const SENTENCES = {
    g1: ['i can run', 'a big red dog', 'the sun is hot', 'i like cake', 'we can play', 'see the cat', 'my hat is blue',
      'look at me', 'the frog can jump', 'i see a star'],
    g2: ['The sun is hot.', 'I like to read.', 'My cat is funny.', 'We play at school.', 'The bird can sing.',
      'I love my family.', 'It is my birthday.', 'The fish can swim.', 'Look at the rainbow.', 'Can you help me?'],
    g3: ['We like to play outside.', 'My friend has a new kite.', 'The castle is very tall.',
      'I will see you tomorrow.', 'The giant had a big laugh.', 'What is your favorite color?',
      'We had pancakes for breakfast.', 'Please listen to the story.', 'The rabbit hid in the garden.'],
    g4: ['My dog loves to run fast.', 'Can you see the stars tonight?', 'We found treasure on the beach.',
      'The astronaut floated in space.', 'Our class planted a vegetable garden.',
      'Is it cold in the mountains?', 'The library has so many books.', "Let's build a robot together."],
    g5: ['The curious fox explored the quiet forest.', 'Volcanoes can be dangerous, but they are amazing.',
      'We looked at tiny cells under a microscope.', 'The orchestra kept a perfect rhythm.',
      'Hurricanes form over warm ocean water.', 'Ancient people built huge stone pyramids.',
      'Did you finish your science experiment?', "My sister's telescope can see Saturn's rings."],
    g6: ['Scientists study fossils to learn about ancient life.', 'Practice makes progress, not perfect.',
      'Plants use sunlight to make their own food.', 'The explorers crossed the frozen tundra.',
      'Every great invention started as a curious question.', 'Kindness is a superpower anyone can use.',
      'Could life exist on another planet?', 'Our team showed great perseverance today.'],
  };

  const HOME_ROW = 'asdfjkl'.split('');
  const HOME_PLUS = 'asdfjklghrueiwo'.split('');
  const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');

  // A grade's round: mostly words, more sentences and "spell it" words as the levels go up.
  function mixedRound(words, sentences, opts) {
    return (level) => {
      const sentenceShare = level >= opts.sentencesFrom ? Math.min(0.6, opts.sentenceShare + (level - opts.sentencesFrom) * 0.08) : 0;
      const nSent = Math.round(ITEMS_PER_ROUND * sentenceShare);
      const items = draw(words, ITEMS_PER_ROUND - nSent).map((w) => ({
        text: w, spell: level >= opts.spellFrom && Math.random() < opts.spellChance,
      }));
      return shuffle(items.concat(draw(sentences, nSent).map((t) => ({ text: t, spell: false }))));
    };
  }

  const GRADES = [
    {
      name: 'K', sub: 'KINDER', target: 4, blurb: 'HOME ROW LETTERS  ·  ALL THE LETTERS  ·  SHORT WORDS',
      round: (level) => {
        if (level === 1) return draw(HOME_ROW, ITEMS_PER_ROUND).map((t) => ({ text: t }));
        if (level === 2) return draw(HOME_PLUS, ITEMS_PER_ROUND).map((t) => ({ text: t }));
        if (level === 3) return draw(ALL_LETTERS, ITEMS_PER_ROUND).map((t) => ({ text: t }));
        return draw(WORDS.k, ITEMS_PER_ROUND).map((t) => ({ text: t, spell: level >= 6 && Math.random() < 0.3 }));
      },
    },
    { name: '1', sub: 'GRADE 1', target: 6, blurb: 'SIGHT WORDS  ·  SHORT WORDS  ·  SPELL IT!  ·  TINY SENTENCES',
      round: mixedRound(WORDS.g1, SENTENCES.g1, { spellFrom: 2, spellChance: 0.3, sentencesFrom: 4, sentenceShare: 0.25 }) },
    { name: '2', sub: 'GRADE 2', target: 8, blurb: 'BIGGER WORDS  ·  SPELL IT!  ·  SENTENCES WITH CAPITALS',
      round: mixedRound(WORDS.g2, SENTENCES.g2, { spellFrom: 2, spellChance: 0.35, sentencesFrom: 3, sentenceShare: 0.25 }) },
    { name: '3', sub: 'GRADE 3', target: 10, blurb: 'TRICKY SPELLING WORDS  ·  LONGER SENTENCES',
      round: mixedRound(WORDS.g3, SENTENCES.g3, { spellFrom: 1, spellChance: 0.4, sentencesFrom: 2, sentenceShare: 0.25 }) },
    { name: '4', sub: 'GRADE 4', target: 13, blurb: 'BIG WORDS  ·  QUESTIONS  ·  COMMAS AND APOSTROPHES',
      round: mixedRound(WORDS.g4, SENTENCES.g4, { spellFrom: 1, spellChance: 0.35, sentencesFrom: 1, sentenceShare: 0.3 }) },
    { name: '5', sub: 'GRADE 5', target: 16, blurb: 'HARD SPELLING WORDS  ·  SCIENCE SENTENCES',
      round: mixedRound(WORDS.g5, SENTENCES.g5, { spellFrom: 1, spellChance: 0.4, sentencesFrom: 1, sentenceShare: 0.35 }) },
    { name: '6', sub: 'GRADE 6', target: 20, blurb: 'SUPER SPELLING WORDS  ·  LONG SENTENCES',
      round: mixedRound(WORDS.g6, SENTENCES.g6, { spellFrom: 1, spellChance: 0.4, sentencesFrom: 1, sentenceShare: 0.4 }) },
  ];
  // ---------- end Lessons ----------

  // ---------- Cheering ----------
  const PRAISE = ['GREAT!', 'AWESOME!', 'NICE!', 'SUPER!', 'WOW!', 'YES!', 'AMAZING!', 'COOL!', 'FANTASTIC!', 'WAY TO GO!'];
  const PERFECT_PRAISE = ['PERFECT!', 'FLAWLESS!', 'NAILED IT!', 'SUPERSTAR!'];
  const SPELL_PRAISE = ['SUPER SPELLER!', 'SPELLED IT!', 'BRAIN POWER!', 'SPELLING STAR!'];
  const NUDGES = ['TRY THE GLOWING KEY!', "YOU'VE GOT THIS!", 'SO CLOSE!', 'KEEP GOING!', 'ALMOST THERE!'];

  // ---------- Audio (simple 8-bit style beeps, no files needed) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, duration, type = 'square', vol = 0.15, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = vol;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    osc.start(t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.stop(t0 + duration);
  }
  const sfxMove = () => beep(330, 0.04, 'square', 0.05);
  const sfxKey = (i) => beep(520 + Math.min(i, 20) * 22, 0.05, 'triangle', 0.1);
  // A wrong key is a soft, friendly "boop" -- never a buzzer.
  const sfxBoop = () => beep(260, 0.09, 'sine', 0.08);
  const sfxWord = () => { beep(784, 0.08, 'triangle', 0.13); beep(1047, 0.12, 'triangle', 0.13, 0.07); };
  const sfxStreak = () => { [880, 1175, 1568].forEach((f, i) => beep(f, 0.1, 'triangle', 0.13, i * 0.07)); };
  const sfxRound = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'triangle', 0.15, i * 0.1)); beep(1319, 0.3, 'triangle', 0.14, 0.42); };

  // The browser's own voice reads "spell it" words aloud. Not every browser has one, so
  // the word also stays on screen a little longer when there's no voice.
  const canSpeak = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  function say(text) {
    if (!canSpeak) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.8;
      u.pitch = 1.1;
      speechSynthesis.speak(u);
    } catch (e) { /* no voice: the word is still shown */ }
  }

  // ---------- Save ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.best) return s;
    } catch (e) { /* storage blocked: play without saving */ }
    return { best: {}, lastGrade: 0 };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  const save = loadSave();

  // ---------- On-screen keyboard ----------
  // Keys are colour-coded by the finger that types them, like a typing class: pinkies pink,
  // ring fingers purple, middle fingers blue, pointer fingers green. F and J have bumps.
  const KB_ROWS = [
    { keys: 'qwertyuiop', x: 0 },
    { keys: "asdfghjkl'", x: 8 },
    { keys: 'zxcvbnm,.?', x: 18 },
  ];
  const KEY_W = 34, KEY_H = 21, KEY_GAP = 3, KB_Y = 152;
  const FINGER = {};
  [['qaz', 'pinky'], ['wsx', 'ring'], ['edc', 'middle'], ['rfvtgb', 'index'],
    ['yhnujm', 'index'], ['ik,', 'middle'], ['ol.', 'ring'], ["p;'?", 'pinky']]
    .forEach(([ks, f]) => ks.split('').forEach((k) => { FINGER[k] = f; }));
  const FINGER_COLORS = { pinky: '#ff7ad9', ring: '#c88bff', middle: '#4f8bff', index: '#6be04f', thumb: '#ffb03f' };
  const KEYS = [];
  KB_ROWS.forEach((row, r) => {
    const rowW = row.keys.length * (KEY_W + KEY_GAP) - KEY_GAP;
    const x0 = (W - rowW) / 2 - 10 + row.x;
    row.keys.split('').forEach((k, c) => {
      KEYS.push({ ch: k, r, c, x: x0 + c * (KEY_W + KEY_GAP), y: KB_Y + r * (KEY_H + KEY_GAP), w: KEY_W, h: KEY_H });
    });
  });
  KEYS.push({ ch: ' ', r: 3, c: 4, x: W / 2 - 100, y: KB_Y + 3 * (KEY_H + KEY_GAP), w: 200, h: KEY_H });
  function keyFor(ch) { return KEYS.find((k) => k.ch === ch) || null; }
  function keyAt(r, c) {
    if (r === 3) return KEYS[KEYS.length - 1];
    return KEYS.find((k) => k.r === r && k.c === c) || null;
  }

  // ---------- State ----------
  let state = 'title'; // 'title' | 'playing' | 'roundEnd'
  let gradeIdx = Math.min(GRADES.length - 1, Math.max(0, save.lastGrade | 0));
  let level = 1, score = 0;
  let items = [], itemIdx = 0, pos = 0;
  let phase = 'type';     // 'show' (a spell word is on screen) | 'type'
  let showT = 0;          // time left to look at a spell word
  let pauseT = 0;         // short cheer between items
  let missesHere = 0;     // wrong keys on the current letter
  let missesItem = 0;     // wrong keys in the current item
  let perfectStreak = 0;
  let shakeT = 0, glowT = 0;
  let stats = null;       // this round: { chars, firstTry, time, started, spelled, words }
  let roundResult = null;
  let message = null;     // { text, color, t }
  let popups = [], particles = [];
  let rocketX = 0;        // eased progress along the top track
  let padCursor = null;   // { r, c } once the controller is used on the on-screen keyboard
  let time = 0;

  const STARS = Array.from({ length: 60 }, () => ({
    x: Math.random() * W, y: Math.random() * H, size: Math.random() < 0.2 ? 2 : 1, phase: Math.random() * Math.PI * 2,
  }));

  function curItem() { return items[itemIdx]; }
  function curChar() { const it = curItem(); return it ? it.text[pos] : null; }

  function startItem() {
    pos = 0;
    missesHere = 0;
    missesItem = 0;
    const it = curItem();
    if (it.spell) {
      phase = 'show';
      showT = canSpeak ? 2.6 : 3.4;
      say(it.text);
    } else {
      phase = 'type';
    }
  }

  function startRound() {
    items = GRADES[gradeIdx].round(level);
    itemIdx = 0;
    stats = { chars: 0, firstTry: 0, time: 0, started: false, spelled: 0, words: 0 };
    roundResult = null;
    message = { text: 'LEVEL ' + level + ' -- READY, SET, TYPE!', color: '#4ff0ff', t: 1.8 };
    state = 'playing';
    startItem();
  }

  function startGrade(i) {
    gradeIdx = i;
    save.lastGrade = i;
    writeSave();
    runRecorded = false;
    level = 1; score = 0; perfectStreak = 0;
    popups = []; particles = [];
    rocketX = 0;
    startRound();
  }

  // One MickleCade high-score entry per grade session (points keep adding up level to
  // level), recorded when you go back to the title or leave the page mid-game.
  let runRecorded = false;
  function recordRun() {
    if (runRecorded || state === 'title') return;
    runRecorded = true;
    if (window.MickleScores) {
      MickleScores.record('typing-rocket', score, { category: GRADES[gradeIdx].sub, order: gradeIdx });
    }
  }
  window.addEventListener('pagehide', recordRun);

  function backToTitle() {
    recordRun();
    state = 'title';
    message = null;
    if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }

  // ---------- Typing ----------
  function burst(x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.4, color: pick(colors) });
    }
  }

  function typeChar(ch) {
    if (state !== 'playing' || pauseT > 0) return;
    const want = curChar();
    if (want == null) return;
    if (phase === 'show') { phase = 'type'; showT = 0; } // started typing: hide the word now
    if (!stats.started) stats.started = true;

    if (ch.toLowerCase() === want.toLowerCase()) {
      stats.chars++;
      if (missesHere === 0) { stats.firstTry++; score += 2; } else score += 1;
      sfxKey(pos);
      pos++;
      missesHere = 0;
      if (pos >= curItem().text.length) itemDone();
    } else {
      // Not the key we were looking for: wiggle, glow the right key, keep going.
      missesHere++;
      missesItem++;
      shakeT = 0.3;
      glowT = 1.2;
      sfxBoop();
      if (missesHere === 2 || (missesHere === 1 && curItem().spell)) {
        const tip = curItem().spell ? "IT'S " + (want === ' ' ? 'A SPACE' : '"' + want.toUpperCase() + '"') + ' -- ' : '';
        message = { text: tip + pick(NUDGES), color: '#ffb03f', t: 1.6 };
      }
    }
  }

  function itemDone() {
    const it = curItem();
    const perfect = missesItem === 0;
    const pts = 5 + (perfect ? 5 : 0) + (it.spell ? 5 : 0);
    score += pts;
    stats.words++;
    if (it.spell) stats.spelled++;
    perfectStreak = perfect ? perfectStreak + 1 : 0;
    let cheer = it.spell ? pick(SPELL_PRAISE) : perfect ? pick(PERFECT_PRAISE) : pick(PRAISE);
    if (perfectStreak > 0 && perfectStreak % 3 === 0) {
      cheer = perfectStreak + ' PERFECT IN A ROW!';
      sfxStreak();
    } else sfxWord();
    popups.push({ x: W / 2, y: 102, text: cheer + '  +' + pts, t: 1.1 });
    burst(W / 2, 80, ['#ffe14f', '#6be04f', '#4ff0ff', '#ff7ad9'], 18);
    pauseT = 0.55;
  }

  function nextItem() {
    itemIdx++;
    if (itemIdx >= items.length) roundDone();
    else startItem();
  }

  function roundDone() {
    const g = GRADES[gradeIdx];
    const minutes = Math.max(stats.time, 1) / 60;
    const wpm = Math.round((stats.chars / 5) / minutes);
    const acc = stats.chars ? Math.round(100 * stats.firstTry / stats.chars) : 100;
    const lettersRound = gradeIdx === 0 && level <= 3;
    // Every round earns a star just for finishing; speed and accuracy each add one.
    const stars = 1 + (acc >= 80 ? 1 : 0) + (wpm >= g.target || (lettersRound && stats.chars / minutes >= g.target * 5) ? 1 : 0);
    const bonus = 10 + 10 * stars;
    score += bonus;
    const best = save.best[g.name] || { score: 0, wpm: 0, acc: 0 };
    const newSpeed = !lettersRound && wpm > best.wpm && best.wpm > 0;
    const newAcc = acc > best.acc && best.acc > 0;
    if (!lettersRound) best.wpm = Math.max(best.wpm, wpm);
    best.acc = Math.max(best.acc, acc);
    best.score = Math.max(best.score, score);
    save.best[g.name] = best;
    writeSave();
    roundResult = {
      wpm, acc, stars, bonus, newSpeed, newAcc, lettersRound,
      lpm: Math.round(stats.chars / minutes),
      cheer: stars === 3 ? 'SUPERSTAR TYPIST!' : stars === 2 ? 'GREAT TYPING!' : 'YOU DID IT!',
    };
    state = 'roundEnd';
    message = null;
    burst(W / 2, H / 2, ['#ffe14f', '#ff4fd8', '#4ff0ff', '#6be04f'], 60);
    sfxRound();
  }

  function speedWords(r) {
    if (r.lettersRound) return r.lpm + ' LETTERS A MINUTE';
    return r.wpm + ' WORDS A MINUTE';
  }
  // Always something nice to say, whatever the numbers were.
  function speedCheer(r) {
    const t = GRADES[gradeIdx].target;
    const v = r.lettersRound ? r.lpm / 5 : r.wpm;
    if (v >= t * 1.5) return 'ROCKET FAST!';
    if (v >= t) return 'ZOOM ZOOM!';
    if (v >= t * 0.6) return 'GETTING FASTER!';
    return 'NICE AND STEADY!';
  }
  function accCheer(acc) {
    if (acc >= 95) return 'SHARP EYES!';
    if (acc >= 80) return 'GREAT AIM!';
    if (acc >= 60) return 'GOOD FOCUS!';
    return 'PRACTICE POWER!';
  }

  // ---------- Input ----------
  // Hear a spell word again -- or, with no voice in this browser, peek at it again.
  function hearAgain() {
    const it = curItem();
    if (state !== 'playing' || !it || !it.spell || pauseT > 0) return;
    if (canSpeak) say(it.text);
    else { phase = 'show'; showT = 1.5; }
  }
  function onAction() {
    if (state === 'title') startGrade(gradeIdx);
    else if (state === 'roundEnd') { level++; startRound(); }
  }
  function onBack() {
    if (state === 'title') window.location.href = '../../launcher/index.html';
    else backToTitle();
  }

  const TILE_W = 58, TILE_GAP = 6, TILE_Y = 92, TILE_H = 62;
  function tileX(i) { return (W - (GRADES.length * TILE_W + (GRADES.length - 1) * TILE_GAP)) / 2 + i * (TILE_W + TILE_GAP); }
  const GRADES_BTN = { x: 6, y: 7, w: 64, h: 20 };
  const SPEAKER_BTN = { x: W / 2 - 60, y: 110, w: 120, h: 19 };
  function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

  function onTap(x, y) {
    if (state === 'title') {
      for (let i = 0; i < GRADES.length; i++) {
        if (inRect(x, y, { x: tileX(i), y: TILE_Y, w: TILE_W, h: TILE_H })) { startGrade(i); return; }
      }
      onAction();
      return;
    }
    if (inRect(x, y, GRADES_BTN)) { backToTitle(); return; }
    if (state === 'playing') {
      const it = curItem();
      if (it && it.spell && inRect(x, y, SPEAKER_BTN)) { hearAgain(); return; }
      const key = KEYS.find((k) => inRect(x, y, k));
      if (key) { key.pressT = 0.15; typeChar(key.ch); }
      return;
    }
    onAction();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === 'Escape') { e.preventDefault(); onBack(); return; }
    if (state === 'title') {
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        e.preventDefault();
        ensureAudio();
        gradeIdx = (gradeIdx + (k === 'ArrowLeft' ? -1 : 1) + GRADES.length) % GRADES.length;
        sfxMove();
      } else if (k === ' ' || k === 'Enter') { e.preventDefault(); ensureAudio(); onAction(); }
      return;
    }
    if (state === 'roundEnd') {
      if (k === ' ' || k === 'Enter') { e.preventDefault(); if (!e.repeat) onAction(); }
      return;
    }
    if (k === 'Enter') { e.preventDefault(); hearAgain(); return; }
    // Every printable key is typing (and stopped from scrolling / Firefox quick-find).
    if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      ensureAudio();
      if (!e.repeat) {
        const key = keyFor(k.toLowerCase());
        if (key) key.pressT = 0.15;
        typeChar(k);
      }
    }
  });

  // Whole page takes taps (not just the canvas), mapped onto the canvas; links still work.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    e.preventDefault();
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.clientLeft) * W / canvas.clientWidth;
    const y = (e.clientY - rect.top - canvas.clientTop) * H / canvas.clientHeight;
    onTap(x, y);
  });

  // Xbox 360 controller: on the title, left/right picks a grade and A starts. While typing,
  // the D-pad walks a cursor over the on-screen keyboard and A presses that key; Y says a
  // spell word again; Back returns to the grades.
  function pollGamepad() {
    Pad360.poll();
    const BTN = Pad360.BTN;
    const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    if (state === 'title') {
      if (dx) { ensureAudio(); gradeIdx = (gradeIdx + dx + GRADES.length) % GRADES.length; sfxMove(); }
      if (Pad360.pressed(BTN.A) || Pad360.pressed(BTN.START)) { ensureAudio(); onAction(); }
      if (Pad360.pressed(BTN.B) || Pad360.pressed(BTN.BACK)) onBack();
      return;
    }
    if (state === 'roundEnd') {
      if (Pad360.pressed(BTN.A) || Pad360.pressed(BTN.START)) onAction();
      if (Pad360.pressed(BTN.B) || Pad360.pressed(BTN.BACK)) onBack();
      return;
    }
    if (dx || dy) {
      ensureAudio();
      if (!padCursor) padCursor = { r: 1, c: 4 };
      else {
        padCursor.r = Math.max(0, Math.min(3, padCursor.r + dy));
        if (padCursor.r < 3) padCursor.c = Math.max(0, Math.min(9, padCursor.c + dx));
      }
      sfxMove();
    }
    if (Pad360.pressed(BTN.A) && padCursor) {
      const key = keyAt(padCursor.r, padCursor.c);
      if (key) { key.pressT = 0.15; typeChar(key.ch); }
    }
    if (Pad360.pressed(BTN.Y)) hearAgain();
    if (Pad360.pressed(BTN.BACK)) onBack();
  }

  // ---------- Update ----------
  function update(dt) {
    time += dt;
    if (state === 'playing') {
      if (stats.started && phase === 'type' && pauseT <= 0) stats.time += dt;
      if (phase === 'show') {
        showT -= dt;
        if (showT <= 0) phase = 'type';
      }
      if (pauseT > 0) {
        pauseT -= dt;
        if (pauseT <= 0) nextItem();
      }
    }
    const target = state === 'title' ? 0 : (itemIdx + (state === 'roundEnd' ? 0 : pos / Math.max(1, (curItem() || { text: 'x' }).text.length))) / ITEMS_PER_ROUND;
    rocketX += ((state === 'roundEnd' ? 1 : target) - rocketX) * Math.min(1, dt * 6);
    shakeT = Math.max(0, shakeT - dt);
    glowT = Math.max(0, glowT - dt);
    for (const k of KEYS) if (k.pressT) k.pressT = Math.max(0, k.pressT - dt);
    if (message) { message.t -= dt; if (message.t <= 0) message = null; }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.y -= 22 * dt; p.t -= dt; }
    popups = popups.filter((p) => p.t > 0);
  }

  // ---------- Drawing ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // Shrink the font until the text fits the given width.
  function fitFont(text, maxW, size, weight = 'bold ') {
    for (; size > 8; size--) {
      ctx.font = weight + size + 'px monospace';
      if (ctx.measureText(text).width <= maxW) return;
    }
    ctx.font = weight + '8px monospace';
  }

  function glowText(text, x, y, font, color, blur = 6) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.fillText(text, x, y);
    ctx.shadowBlur = 0;
  }

  function drawBackground() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#060a24');
    g.addColorStop(1, '#22104a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of STARS) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + s.phase);
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // The rocket, pointing right. (cx, cy) is its middle; s is its scale.
  function drawRocket(cx, cy, s, flame) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(s, s);
    if (flame) {
      ctx.fillStyle = '#ffb03f';
      ctx.beginPath(); ctx.moveTo(-9, -3); ctx.lineTo(-15 - Math.random() * 5, 0); ctx.lineTo(-9, 3); ctx.fill();
      ctx.fillStyle = '#ffe14f';
      ctx.beginPath(); ctx.moveTo(-9, -1.5); ctx.lineTo(-12 - Math.random() * 3, 0); ctx.lineTo(-9, 1.5); ctx.fill();
    }
    ctx.fillStyle = '#ff4f6d';
    ctx.beginPath(); ctx.moveTo(-7, -4); ctx.lineTo(-11, -8); ctx.lineTo(-3, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-7, 4); ctx.lineTo(-11, 8); ctx.lineTo(-3, 4); ctx.fill();
    ctx.fillStyle = '#e8ecff';
    ctx.beginPath(); ctx.ellipse(0, 0, 10, 4.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff4f6d';
    ctx.beginPath(); ctx.moveTo(6, -3.6); ctx.quadraticCurveTo(13, 0, 6, 3.6); ctx.fill();
    ctx.fillStyle = '#4ff0ff';
    ctx.beginPath(); ctx.arc(1, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function drawMoon(cx, cy, r) {
    ctx.fillStyle = '#ffe9a8';
    ctx.shadowColor = '#ffe14f';
    ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#e6cf86';
    ctx.beginPath(); ctx.arc(cx - r * 0.3, cy - r * 0.2, r * 0.22, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(cx + r * 0.3, cy + r * 0.3, r * 0.15, 0, Math.PI * 2); ctx.fill();
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, 34);
    const b = GRADES_BTN;
    roundRect(b.x, b.y, b.w, b.h, 4);
    ctx.fillStyle = '#2a1a5e';
    ctx.fill();
    ctx.strokeStyle = '#4ff0ff';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('< GRADES', b.x + b.w / 2, b.y + b.h / 2 + 1);

    const it = curItem();
    const label = state === 'roundEnd' ? 'BLAST OFF!' : it && it.spell ? 'SPELL IT!' : 'TYPE IT!';
    glowText(label, W / 2, 17, 'bold 16px monospace', it && it.spell ? '#ff7ad9' : '#ffe14f', 5);

    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GRADE ' + GRADES[gradeIdx].name + '   LEVEL ' + level, W - 6, 11);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#6be04f';
    ctx.fillText('SCORE ' + score, W - 6, 25);
    ctx.textAlign = 'left';
  }

  // Rocket track: one dot per item, the moon at the end of the round.
  function drawTrack() {
    const x0 = 40, x1 = 420, y = 46;
    ctx.strokeStyle = 'rgba(79, 240, 255, 0.3)';
    ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 1; i < ITEMS_PER_ROUND; i++) {
      const x = x0 + (x1 - x0) * i / ITEMS_PER_ROUND;
      ctx.fillStyle = i <= itemIdx || state === 'roundEnd' ? '#ffe14f' : '#3a2e6e';
      ctx.beginPath(); ctx.arc(x, y, 2, 0, Math.PI * 2); ctx.fill();
    }
    drawMoon(x1 + 18, y, 9);
    drawRocket(x0 + (x1 - x0) * rocketX, y, 1, state === 'playing');
  }

  // The thing to type, letter by letter: typed letters green, the current one yellow and
  // underlined, the rest white -- or blanks, for a spell word once it has been hidden.
  function drawPrompt() {
    const it = curItem();
    if (!it) return;
    const text = it.text;
    const hidden = it.spell && phase === 'type' && pauseT <= 0;
    const size = text.length === 1 ? 46 : text.length <= 10 ? 28 : text.length <= 22 ? 18 : 14;
    ctx.font = 'bold ' + size + 'px monospace';
    const cw = ctx.measureText('M').width;
    // Wrap long sentences into lines at spaces.
    const maxChars = Math.floor(440 / cw);
    const lines = [];
    let start = 0;
    while (start < text.length) {
      let end = Math.min(text.length, start + maxChars);
      if (end < text.length) { const sp = text.lastIndexOf(' ', end); if (sp > start) end = sp + 1; }
      lines.push([start, end]);
      start = end;
    }
    const lineH = size * 1.35;
    const top = 84 - (lines.length - 1) * lineH / 2;
    const shake = shakeT > 0 ? Math.sin(shakeT * 70) * 3 : 0;
    ctx.textAlign = 'center';
    lines.forEach(([a, b], li) => {
      const y = top + li * lineH;
      const lineLen = b - a;
      const x0 = W / 2 - (lineLen * cw) / 2 + cw / 2;
      for (let i = a; i < b; i++) {
        const ch = text[i];
        const x = x0 + (i - a) * cw + (i === pos ? shake : 0);
        if (i < pos) {
          ctx.fillStyle = '#6be04f';
          ctx.fillText(ch, x, y);
        } else if (i === pos) {
          // current letter: a bouncing underline, and the letter (or its hint)
          const blink = 0.6 + 0.4 * Math.sin(time * 8);
          ctx.fillStyle = `rgba(255, 225, 79, ${blink})`;
          ctx.fillRect(x - cw / 2 + 1, y + size * 0.55, cw - 2, Math.max(2, size * 0.08));
          if (!hidden) { ctx.fillStyle = '#ffe14f'; ctx.fillText(ch, x, y); }
          else if (missesHere > 0) { ctx.fillStyle = 'rgba(255, 225, 79, 0.55)'; ctx.fillText(ch, x, y); }
          if (ch === ' ' && !hidden) {
            ctx.font = 'bold 8px monospace';
            ctx.fillStyle = '#ffe14f';
            ctx.fillText('SPACE', x, y + size * 0.85);
            ctx.font = 'bold ' + size + 'px monospace';
          }
        } else if (hidden) {
          // one dash per hidden letter (after a few misses, the word peeks through faintly)
          if (ch !== ' ') {
            ctx.fillStyle = '#8a7fc0';
            ctx.fillRect(x - cw * 0.35, y + size * 0.55, cw * 0.7, Math.max(2, size * 0.08));
            if (missesItem >= 3) { ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText(ch, x, y); }
          }
        } else {
          ctx.fillStyle = '#ffffff';
          ctx.fillText(ch, x, y);
        }
      }
    });

    if (it.spell) {
      ctx.font = '9px monospace';
      if (phase === 'show') {
        ctx.fillStyle = '#ff7ad9';
        ctx.fillText('LOOK CAREFULLY... THEN TYPE IT FROM MEMORY!', W / 2, 114);
        const w = 160 * Math.max(0, showT) / (canSpeak ? 2.6 : 3.4);
        ctx.fillRect(W / 2 - w / 2, 123, w, 2);
      } else if (pauseT <= 0) {
        const b = SPEAKER_BTN;
        roundRect(b.x, b.y, b.w, b.h, 6);
        ctx.fillStyle = '#2a1a5e';
        ctx.fill();
        ctx.strokeStyle = '#ff7ad9';
        ctx.stroke();
        drawSpeaker(b.x + 14, b.y + b.h / 2);
        ctx.fillStyle = '#ff7ad9';
        ctx.font = 'bold 9px monospace';
        ctx.fillText(canSpeak ? 'HEAR IT AGAIN' : 'PEEK: ENTER', b.x + b.w / 2 + 8, b.y + b.h / 2 + 1);
      }
    }
  }

  function drawSpeaker(x, y) {
    ctx.fillStyle = '#ff7ad9';
    ctx.fillRect(x - 5, y - 2, 3, 4);
    ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y - 5); ctx.lineTo(x + 2, y + 5); ctx.lineTo(x - 2, y + 2); ctx.fill();
    ctx.strokeStyle = '#ff7ad9';
    ctx.beginPath(); ctx.arc(x + 3, y, 4, -0.8, 0.8); ctx.stroke();
  }

  function drawKeyboard() {
    const want = state === 'playing' && pauseT <= 0 ? (curChar() || '').toLowerCase() : null;
    const glow = 0.5 + 0.5 * Math.sin(time * 6);
    for (const k of KEYS) {
      const isNext = want != null && k.ch === want;
      const pressed = k.pressT > 0;
      const finger = k.ch === ' ' ? 'thumb' : FINGER[k.ch] || 'index';
      const col = FINGER_COLORS[finger];
      const y = k.y + (pressed ? 1 : 0);
      roundRect(k.x, y, k.w, k.h, 4);
      ctx.fillStyle = isNext ? `rgba(255, 225, 79, ${0.25 + 0.25 * glow + (glowT > 0 ? 0.3 : 0)})` : pressed ? '#3a2e7e' : '#1c2660';
      ctx.fill();
      ctx.strokeStyle = isNext ? '#ffe14f' : '#3b4fb0';
      ctx.lineWidth = isNext ? 2 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
      // finger colour stripe along the bottom
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(k.x + 4, y + k.h - 4, k.w - 8, 2);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = isNext ? '#ffffff' : '#d9d2ff';
      ctx.fillText(k.ch === ' ' ? 'SPACE' : k.ch.toUpperCase(), k.x + k.w / 2, y + k.h / 2 - 1);
      if (k.ch === 'f' || k.ch === 'j') { ctx.fillStyle = '#d9d2ff'; ctx.fillRect(k.x + k.w / 2 - 3, y + k.h - 8, 6, 1); }
      if (padCursor && keyAt(padCursor.r, padCursor.c) === k) {
        roundRect(k.x - 2, y - 2, k.w + 4, k.h + 4, 5);
        ctx.strokeStyle = '#4ff0ff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
    }
    // which finger: a tiny legend under the keyboard
    ctx.font = '7px monospace';
    ctx.textAlign = 'left';
    let lx = 70;
    [['PINKY', 'pinky'], ['RING', 'ring'], ['MIDDLE', 'middle'], ['POINTER', 'index'], ['THUMB', 'thumb']].forEach(([t, f]) => {
      ctx.fillStyle = FINGER_COLORS[f];
      ctx.fillRect(lx, 260, 6, 6);
      ctx.fillStyle = '#b9b0e0';
      ctx.fillText(t, lx + 9, 263.5);
      lx += 22 + t.length * 4.5;
    });
    ctx.fillStyle = '#6a5fa0';
    ctx.fillText('HOME ROW: A S D F  J K L', 330, 263.5);
  }

  function drawEffects() {
    for (const p of particles) {
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), 2, 2);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    for (const p of popups) {
      ctx.globalAlpha = Math.min(1, p.t * 2);
      glowText(p.text, p.x, p.y, 'bold 14px monospace', '#ffe14f', 6);
    }
    ctx.globalAlpha = 1;
  }

  function drawMessage() {
    if (!message) return;
    ctx.globalAlpha = Math.min(1, message.t * 3);
    fitFont(message.text, W - 40, 12);
    const w = ctx.measureText(message.text).width + 24;
    const y = 140;
    roundRect(W / 2 - w / 2, y - 10, w, 20, 6);
    ctx.fillStyle = 'rgba(10, 6, 24, 0.92)';
    ctx.fill();
    ctx.strokeStyle = message.color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    ctx.fillStyle = message.color;
    ctx.fillText(message.text, W / 2, y + 1);
    ctx.globalAlpha = 1;
  }

  function drawStar(cx, cy, r, on) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, rr = i % 2 ? r * 0.45 : r;
      ctx[i ? 'lineTo' : 'moveTo'](cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fillStyle = on ? '#ffe14f' : '#3a2e6e';
    if (on) { ctx.shadowColor = '#ffe14f'; ctx.shadowBlur = 10; }
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  function drawRoundEnd() {
    const r = roundResult;
    ctx.fillStyle = 'rgba(10, 6, 24, 0.7)';
    ctx.fillRect(0, 0, W, H);
    roundRect(W / 2 - 170, 40, 340, 200, 10);
    ctx.fillStyle = '#1e1440';
    ctx.fill();
    ctx.strokeStyle = '#4ff0ff';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    glowText(r.cheer, W / 2, 62, 'bold 20px monospace', '#ffe14f', 8);
    for (let i = 0; i < 3; i++) {
      const pop = i < r.stars ? 1 + 0.08 * Math.sin(time * 6 + i) : 1;
      drawStar(W / 2 + (i - 1) * 40, 96, 14 * pop, i < r.stars);
    }
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SPEED: ' + speedWords(r) + ' -- ' + speedCheer(r), W / 2, 128);
    ctx.fillText('RIGHT ON THE FIRST TRY: ' + r.acc + '% -- ' + accCheer(r.acc), W / 2, 146);
    ctx.fillStyle = '#6be04f';
    ctx.fillText('ROUND BONUS +' + r.bonus + '     SCORE ' + score, W / 2, 166);
    const news = [];
    if (r.newSpeed) news.push('NEW BEST SPEED!');
    if (r.newAcc) news.push('NEW BEST AIM!');
    if (stats.spelled) news.push(stats.spelled + ' WORD' + (stats.spelled > 1 ? 'S' : '') + ' SPELLED FROM MEMORY!');
    if (news.length) {
      fitFont(news.join('  '), 320, 11);
      glowText(news.join('  '), W / 2, 186, ctx.font, '#ff7ad9', 4);
    }
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 5);
    glowText('TAP / SPACE / A FOR LEVEL ' + (level + 1), W / 2, 216, 'bold 12px monospace', '#4ff0ff');
    ctx.globalAlpha = 1;
  }

  function drawTitle() {
    ctx.textAlign = 'center';
    glowText('TYPING ROCKET', W / 2, 36, 'bold 30px monospace', '#4ff0ff', 10);
    glowText('TYPE IT  ·  SPELL IT  ·  BLAST OFF!', W / 2, 64, '10px monospace', '#ffe14f');
    drawRocket(50 + Math.sin(time * 2) * 4, 38, 2.6, true);
    drawMoon(430, 36, 16);

    for (let i = 0; i < GRADES.length; i++) {
      const g = GRADES[i], x = tileX(i), sel = i === gradeIdx;
      const y = TILE_Y - (sel ? 3 + Math.round(Math.abs(Math.sin(time * 4)) * 2) : 0);
      roundRect(x, y, TILE_W, TILE_H, 6);
      ctx.fillStyle = sel ? '#2a3a8a' : '#1c2660';
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffe14f' : '#3b4fb0';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
      glowText(g.name, x + TILE_W / 2, y + 21, 'bold 22px monospace', sel ? '#ffe14f' : '#ffffff', sel ? 6 : 0);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#b9b0e0';
      ctx.fillText(g.sub, x + TILE_W / 2, y + 40);
      const best = save.best[g.name];
      if (best && best.wpm) {
        ctx.fillStyle = '#6be04f';
        ctx.fillText(best.wpm + ' WPM', x + TILE_W / 2, y + 52);
      }
    }

    fitFont(GRADES[gradeIdx].blurb, W - 20, 10, '');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(GRADES[gradeIdx].blurb, W / 2, 172);
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 5);
    glowText('TAP A GRADE TO START', W / 2, 196, 'bold 13px monospace', '#ffe14f');
    ctx.globalAlpha = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#b9b0e0';
    ctx.fillText('LEFT / RIGHT PICK A GRADE  ·  SPACE / A TO START', W / 2, 216);
    ctx.fillText('TYPE ON YOUR KEYBOARD OR TAP THE KEYS ON THE SCREEN', W / 2, 230);
    ctx.font = '8px monospace';
    ctx.fillStyle = '#6a5fa0';
    ctx.fillText('A MICKLEKIDS GAME', W / 2, 258);
    ctx.textAlign = 'left';
  }

  function render() {
    drawBackground();
    if (state === 'title') { drawTitle(); return; }
    drawHUD();
    drawTrack();
    if (state === 'playing') drawPrompt();
    drawKeyboard();
    drawEffects();
    drawMessage();
    if (state === 'roundEnd') { drawRoundEnd(); drawEffects(); }
  }

  // ---------- Loop ----------
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (typeof Pad360 !== 'undefined') pollGamepad();
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
