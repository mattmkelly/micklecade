(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H, (c) => { c.textBaseline = 'middle'; });

  // A Number-Munchers-style board of shapes: 6 x 5 boxes under a one-line rule.
  const COLS = 6, ROWS = 5;
  const CELL_W = 78, CELL_H = 46;
  const BOARD_X = 6, BOARD_Y = 38;
  const HINT_AFTER_OOPS = 3; // after this many wrong munches in a level, right answers glow

  const SAVE_KEY = 'shapeMunchers.save';

  // ---------- Problems ----------
  // A rule is { label, good(), any(), test(item), why(item) } (plus icon: a shape to show
  // instead of a word). good() always makes a shape that fits the rule; any() makes a random
  // shape the board keeps only if it doesn't fit.
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = ri(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function rule(label, good, any, test, why) { return { label, good, any, test, why }; }

  // ---------- Shapes ----------
  // Every shape the game can draw. sides = straight sides (corners are the same number for
  // these shapes; curvy ones have 0 of both). family is what the shape is CALLED -- both
  // triangles are "TRIANGLE". noCount shapes (heart, star) never show up in counting rules,
  // because "how many corners does a heart have?" has no good answer for a 6-year-old.
  const SHAPES = {
    circle:        { family: 'circle', sides: 0, curvy: true },
    oval:          { family: 'oval', sides: 0, curvy: true },
    heart:         { family: 'heart', sides: 0, curvy: true, noCount: true },
    triangle:      { family: 'triangle', sides: 3 },
    rightTriangle: { family: 'triangle', sides: 3 },
    square:        { family: 'square', sides: 4 },
    rectangle:     { family: 'rectangle', sides: 4 },
    rhombus:       { family: 'rhombus', sides: 4 },
    trapezoid:     { family: 'trapezoid', sides: 4 },
    parallelogram: { family: 'parallelogram', sides: 4 },
    pentagon:      { family: 'pentagon', sides: 5 },
    hexagon:       { family: 'hexagon', sides: 6 },
    octagon:       { family: 'octagon', sides: 8 },
    star:          { family: 'star', sides: 10, noCount: true },
  };
  // What each family is called, and which other shapes are secretly one of them too (a square
  // IS a rectangle and a rhombus) -- those never share a board with that rule, so nobody gets
  // an "OOPS!" for a right answer.
  const FAMILIES = {
    circle: { name: 'CIRCLE', plural: 'CIRCLES' },
    oval: { name: 'OVAL', plural: 'OVALS' },
    heart: { name: 'HEART', plural: 'HEARTS' },
    triangle: { name: 'TRIANGLE', plural: 'TRIANGLES' },
    square: { name: 'SQUARE', plural: 'SQUARES' },
    rectangle: { name: 'RECTANGLE', plural: 'RECTANGLES', alsoIs: ['square'] },
    rhombus: { name: 'RHOMBUS', plural: 'RHOMBUSES', alsoIs: ['square'] },
    trapezoid: { name: 'TRAPEZOID', plural: 'TRAPEZOIDS' },
    parallelogram: { name: 'PARALLELOGRAM', plural: 'PARALLELOGRAMS', alsoIs: ['square', 'rectangle', 'rhombus'] },
    pentagon: { name: 'PENTAGON', plural: 'PENTAGONS' },
    hexagon: { name: 'HEXAGON', plural: 'HEXAGONS' },
    octagon: { name: 'OCTAGON', plural: 'OCTAGONS' },
    star: { name: 'STAR', plural: 'STARS' },
  };
  const COLORS = ['#ff4f6d', '#ffb03f', '#ffe14f', '#6be04f', '#4ff0ff', '#4f8bff', '#c88bff', '#ff7ad9'];

  // Which shapes each stage draws from (later stages bring in the trickier ones).
  const POOL_PICTURES = ['circle', 'oval', 'heart', 'triangle', 'square', 'rectangle', 'star', 'pentagon', 'hexagon'];
  const POOL_COUNT = ['circle', 'oval', 'triangle', 'rightTriangle', 'square', 'rectangle', 'rhombus', 'pentagon', 'hexagon', 'octagon'];
  const POOL_COUNT_HARD = POOL_COUNT.concat(['trapezoid', 'parallelogram']);
  const POOL_NAMES = ['circle', 'oval', 'heart', 'triangle', 'rightTriangle', 'square', 'rectangle', 'rhombus', 'pentagon', 'hexagon', 'octagon', 'star'];
  const POOL_ALL = Object.keys(SHAPES);

  function article(name) { return (/^[AEIOU]/.test(name) ? 'AN ' : 'A ') + name; }
  function nameOf(kind) { return FAMILIES[SHAPES[kind].family].name; }

  // One shape on the board: same kind can come in any colour, size and turn -- it's still
  // the same shape, which is half the lesson. d (0..1) is how much it gets turned.
  function variant(kind, d) {
    const sh = SHAPES[kind];
    const turn = kind === 'square' ? 0.25 : sh.curvy || kind === 'star' ? 0.35 : 0.3 + d * Math.PI;
    return {
      kind,
      color: pick(COLORS),
      rot: (Math.random() * 2 - 1) * turn,
      size: 0.72 + Math.random() * 0.28,
      flip: Math.random() < 0.5 ? -1 : 1,
      key: kind + Math.random(),
    };
  }

  // A rule over a pool of shapes: good() is any shape that fits, any() any shape at all.
  function shapeRule(label, pool, test, why, d, extra) {
    const goodKinds = pool.filter((k) => test(k));
    return Object.assign(rule(label,
      () => variant(pick(goodKinds), d),
      () => variant(pick(pool), d),
      (it) => test(it.kind),
      (it) => why(it.kind)), extra || {});
  }

  // Stage 1: a picture of the shape to find.
  function matchPicture(d) {
    const target = pick(POOL_PICTURES);
    return shapeRule('THIS SHAPE', POOL_PICTURES, (k) => k === target,
      (k) => 'THAT ONE IS ' + article(nameOf(k)), d, { icon: target, intro: 'SHAPES LIKE THIS ONE' });
  }

  // Stage 2: counting sides or corners.
  function countRule(word) {
    return (d) => {
      const pool = (d > 0.5 ? POOL_COUNT_HARD : POOL_COUNT).filter((k) => !SHAPES[k].noCount);
      const n = pick(d < 0.3 ? [3, 4, 0] : [3, 4, 5, 6, 0, 8]);
      const label = n === 0 ? (word === 'SIDES' ? 'NO STRAIGHT SIDES' : 'NO CORNERS') : n + ' ' + word;
      return shapeRule(label, pool, (k) => SHAPES[k].sides === n, (k) => {
        const s = SHAPES[k].sides;
        if (!s) return article(nameOf(k)) + ' IS ALL CURVES -- NO ' + word;
        return article(nameOf(k)) + ' HAS ' + s + ' ' + word;
      }, d);
    };
  }

  // Stage 3: shape names.
  function nameRule(d) {
    const pool = d > 0.5 ? POOL_ALL : POOL_NAMES;
    const families = [...new Set(pool.map((k) => SHAPES[k].family))];
    const fam = pick(families);
    const also = FAMILIES[fam].alsoIs || [];
    const fair = pool.filter((k) => also.indexOf(SHAPES[k].family) === -1);
    return shapeRule(FAMILIES[fam].plural, fair, (k) => SHAPES[k].family === fam,
      (k) => 'THAT ONE IS ' + article(nameOf(k)), d);
  }

  // Stage 4 extras: comparing, and curvy vs straight.
  function moreSides(d) {
    const pool = POOL_COUNT_HARD.filter((k) => !SHAPES[k].curvy);
    const n = pick([3, 4, 5]);
    return shapeRule('MORE THAN ' + n + ' SIDES', pool, (k) => SHAPES[k].sides > n,
      (k) => article(nameOf(k)) + ' HAS ONLY ' + SHAPES[k].sides + ' SIDES', d);
  }
  function fewerCorners(d) {
    const pool = POOL_COUNT_HARD.filter((k) => !SHAPES[k].curvy);
    const n = pick([4, 5, 6]);
    return shapeRule('FEWER THAN ' + n + ' CORNERS', pool, (k) => SHAPES[k].sides < n,
      (k) => article(nameOf(k)) + ' HAS ' + SHAPES[k].sides + ' CORNERS', d);
  }
  function curvy(d) {
    return shapeRule('CURVY SHAPES', POOL_ALL, (k) => !!SHAPES[k].curvy,
      (k) => article(nameOf(k)) + ' HAS STRAIGHT SIDES', d);
  }

  const STAGES = [
    { name: '1', sub: 'PICTURES', blurb: 'FIND EVERY SHAPE THAT MATCHES THE PICTURE', rules: [matchPicture] },
    { name: '2', sub: 'SIDES', blurb: 'COUNT THE SIDES  ·  COUNT THE CORNERS', rules: [countRule('SIDES'), countRule('CORNERS')] },
    { name: '3', sub: 'NAMES', blurb: 'TRIANGLES  ·  SQUARES  ·  HEXAGONS  ·  OCTAGONS AND MORE', rules: [nameRule] },
    { name: '4', sub: 'MIXED', blurb: 'TRICKY SHAPES  ·  MORE THAN  ·  FEWER THAN  ·  CURVY', rules: [nameRule, countRule('SIDES'), countRule('CORNERS'), moreSides, fewerCorners, curvy] },
  ];
  const LEVELS_PER_STAGE = 2; // the run moves up a stage every 2 levels, then stays MIXED
  // ---------- end Problems ----------

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
  const sfxMunch = () => { beep(620, 0.06, 'square', 0.12); beep(880, 0.08, 'square', 0.1, 0.06); };
  const sfxStreak = () => { beep(880, 0.08, 'triangle', 0.14); beep(1175, 0.08, 'triangle', 0.14, 0.07); beep(1568, 0.12, 'triangle', 0.14, 0.14); };
  const sfxOops = () => { beep(220, 0.12, 'triangle', 0.16); beep(180, 0.16, 'triangle', 0.14, 0.1); };
  const sfxBonk = () => { beep(160, 0.08, 'square', 0.14); beep(420, 0.18, 'triangle', 0.12, 0.08); };
  const sfxClear = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.14, 'triangle', 0.15, i * 0.1)); beep(1319, 0.3, 'triangle', 0.14, 0.42); };

  // ---------- Save ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && s.best) return s;
    } catch (e) { /* storage blocked: play without saving */ }
    return { best: {}, lastStage: 0 };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  const save = loadSave();

  // ---------- State ----------
  let state = 'title'; // 'title' | 'playing' | 'clear'
  let stageIdx = Math.min(STAGES.length - 1, Math.max(0, save.lastStage | 0));
  let level = 1, score = 0, streak = 0, clearBonus = 0;
  let curRule = null, cells = null, oopsThisLevel = 0;
  let ruleBag = [], lastRuleIdx = -1, ruleStage = -1;
  let mx = 0, my = 0, drawX = BOARD_X, drawY = BOARD_Y, facing = 1, munchT = 0, dizzyT = 0;
  let grumble = null, grumbleSpawnT = Infinity;
  let message = null; // { text, color, t }
  let particles = [], popups = [];
  let time = 0;

  const STARS = Array.from({ length: 60 }, () => ({
    x: Math.random() * W, y: Math.random() * H, size: Math.random() < 0.2 ? 2 : 1, phase: Math.random() * Math.PI * 2,
  }));

  function cellPos(c, r) { return { x: BOARD_X + c * CELL_W, y: BOARD_Y + r * CELL_H }; }
  function cellAt(c, r) { return cells[r * COLS + c]; }

  function makeBoard(r) {
    const goodCount = ri(8, 11);
    const order = shuffle([...Array(COLS * ROWS).keys()]);
    const out = [];
    order.forEach((pos, i) => {
      const wantGood = i < goodCount;
      let it;
      // Try for a box that fits (or doesn't) and isn't already on the board; repeats are
      // allowed once the fresh ideas run out.
      for (let tries = 0; tries < 80; tries++) {
        it = wantGood ? r.good() : r.any();
        if (!!r.test(it) === wantGood) break;
      }
      out[pos] = Object.assign({}, it, { good: !!r.test(it), eaten: false, shake: 0 });
    });
    return out;
  }

  function curStage() { return Math.min(STAGES.length - 1, stageIdx + Math.floor((level - 1) / LEVELS_PER_STAGE)); }

  function nextRule(d) {
    const stage = STAGES[curStage()];
    if (!ruleBag.length) {
      ruleBag = shuffle(stage.rules.map((_, i) => i));
      if (ruleBag[0] === lastRuleIdx && ruleBag.length > 1) ruleBag.push(ruleBag.shift());
    }
    lastRuleIdx = ruleBag.shift();
    return stage.rules[lastRuleIdx](d);
  }

  // Casual mode (picked on the title screen, saved): Grumble stays home, just munch.
  function grumbleOn() { return !save.casual && level >= (stageIdx === 0 ? 4 : 3); }
  // Casual runs keep their own BEST and high-score board, since they're easier.
  function bestKey(i) { return STAGES[i].name + (save.casual ? '-casual' : ''); }
  function toggleCasual() {
    save.casual = !save.casual;
    writeSave();
    sfxMove();
  }

  function newLevel() {
    const stageNow = curStage();
    if (stageNow !== ruleStage) { ruleBag = []; lastRuleIdx = -1; ruleStage = stageNow; }
    curRule = nextRule(Math.min(1, (level - 1) / 8));
    cells = makeBoard(curRule);
    oopsThisLevel = 0;
    grumble = null;
    grumbleSpawnT = grumbleOn() ? 5 : Infinity;
    message = { text: 'LEVEL ' + level + ':  MUNCH ' + (curRule.intro || curRule.label), color: '#4ff0ff', t: 2.4 };
    state = 'playing';
  }

  function startStage(i) {
    stageIdx = i;
    save.lastStage = i;
    writeSave();
    runRecorded = false;
    level = 1; score = 0; streak = 0;
    mx = 0; my = 0;
    ({ x: drawX, y: drawY } = cellPos(0, 0));
    ruleBag = []; lastRuleIdx = -1; ruleStage = -1;
    particles = []; popups = [];
    newLevel();
  }

  function updateBest() {
    const name = bestKey(stageIdx);
    const b = save.best[name] || { score: 0, level: 0 };
    b.score = Math.max(b.score, score);
    b.level = Math.max(b.level, level);
    save.best[name] = b;
    writeSave();
  }

  // One MickleCade high-score entry per run (the score keeps adding up level to
  // level), recorded when you go back to the title or leave the page mid-game.
  let runRecorded = false;
  function recordRun() {
    if (runRecorded || state === 'title') return;
    runRecorded = true;
    if (window.MickleScores) {
      MickleScores.record('shape-munchers', score, {
        category: 'START: ' + STAGES[stageIdx].sub + (save.casual ? ' CASUAL' : ''),
        order: stageIdx + (save.casual ? 0.5 : 0),
      });
    }
  }
  window.addEventListener('pagehide', recordRun);

  function backToTitle() {
    recordRun();
    if (state !== 'title') updateBest();
    state = 'title';
    message = null;
  }

  // ---------- Munching ----------
  function burst(x, y, colors, count) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2, s = 40 + Math.random() * 90;
      particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.5 + Math.random() * 0.4, color: pick(colors) });
    }
  }

  function munch() {
    if (state !== 'playing' || dizzyT > 0) return;
    const cell = cellAt(mx, my);
    if (cell.eaten) return;
    munchT = 0.3;
    const { x, y } = cellPos(mx, my);
    if (cell.good) {
      cell.eaten = true;
      streak++;
      const pts = 10 + (streak >= 3 ? 5 : 0) + (streak >= 6 ? 5 : 0);
      score += pts;
      popups.push({ x: x + CELL_W / 2, y: y + 22, text: '+' + pts, t: 1 });
      burst(x + CELL_W / 2, y + 28, ['#ffe14f', '#6be04f', '#ffffff'], 14);
      if (streak > 0 && streak % 5 === 0) {
        message = { text: 'YUM! ' + streak + ' IN A ROW!', color: '#ffe14f', t: 1.6 };
        sfxStreak();
      } else sfxMunch();
      if (!cells.some((c) => c.good && !c.eaten)) levelClear();
    } else {
      cell.shake = 0.4;
      dizzyT = 0.6;
      streak = 0;
      oopsThisLevel++;
      const hint = oopsThisLevel === HINT_AFTER_OOPS ? '  (RIGHT ONES GLOW NOW!)' : '';
      message = { text: 'OOPS! ' + curRule.why(cell) + hint, color: '#ff9a4f', t: 2.8 };
      sfxOops();
    }
  }

  function levelClear() {
    clearBonus = 25 + 5 * level;
    score += clearBonus;
    updateBest();
    state = 'clear';
    message = null;
    grumble = null;
    burst(W / 2, H / 2, ['#ffe14f', '#ff4fd8', '#4ff0ff', '#6be04f'], 50);
    sfxClear();
  }

  function moveTo(c, r) {
    if (c === mx && r === my) return;
    if (c !== mx) facing = c > mx ? 1 : -1;
    mx = c; my = r;
    checkGrumbleHit();
  }

  function move(dx, dy) {
    if (state !== 'playing' || dizzyT > 0) return;
    if (dx && dy) dy = 0;
    const c = Math.max(0, Math.min(COLS - 1, mx + dx)), r = Math.max(0, Math.min(ROWS - 1, my + dy));
    if (c === mx && r === my) return;
    sfxMove();
    moveTo(c, r);
  }

  // ---------- Grumble (the friendly troublemaker) ----------
  // Grumble wanders the board from level 3. Bumping into him just bounces the muncher to
  // the far corner -- no lives, no game over.
  function checkGrumbleHit() {
    if (!grumble || grumble.x !== mx || grumble.y !== my) return false;
    const corners = [[0, 0], [COLS - 1, 0], [0, ROWS - 1], [COLS - 1, ROWS - 1]];
    const dist = (p) => Math.abs(p[0] - grumble.x) + Math.abs(p[1] - grumble.y);
    corners.sort((a, b) => dist(b) - dist(a));
    mx = corners[0][0]; my = corners[0][1];
    dizzyT = 0.5;
    message = { text: 'BONK! GRUMBLE BOUNCED YOU!', color: '#c88bff', t: 1.8 };
    sfxBonk();
    return true;
  }

  function updateGrumble(dt) {
    if (!grumble) {
      grumbleSpawnT -= dt;
      if (grumbleSpawnT > 0) return;
      const spots = [];
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const edge = r === 0 || c === 0 || r === ROWS - 1 || c === COLS - 1;
        if (edge && Math.abs(c - mx) + Math.abs(r - my) >= 4) spots.push([c, r]);
      }
      const [gx, gy] = pick(spots);
      const p = cellPos(gx, gy);
      grumble = { x: gx, y: gy, drawX: p.x, drawY: p.y, moveT: 1.5 };
      return;
    }
    grumble.moveT -= dt;
    if (grumble.moveT > 0) return;
    grumble.moveT = Math.max(0.75, 1.7 - level * 0.07);
    const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([dx, dy]) => {
      const c = grumble.x + dx, r = grumble.y + dy;
      return c >= 0 && c < COLS && r >= 0 && r < ROWS;
    });
    let step = pick(steps);
    if (Math.random() < 0.5) {
      const dist = (s) => Math.abs(grumble.x + s[0] - mx) + Math.abs(grumble.y + s[1] - my);
      step = steps.slice().sort((a, b) => dist(a) - dist(b))[0];
    }
    grumble.x += step[0];
    grumble.y += step[1];
    checkGrumbleHit();
  }

  // ---------- Input ----------
  function onDir(dx, dy) {
    if (state === 'title') {
      if (dx) { stageIdx = (stageIdx + dx + STAGES.length) % STAGES.length; sfxMove(); }
      else if (dy) toggleCasual();
    } else move(dx, dy);
  }
  function onAction() {
    if (state === 'title') startStage(stageIdx);
    else if (state === 'playing') munch();
    else if (state === 'clear') { level++; newLevel(); }
  }
  function onBack() {
    if (state === 'title') window.location.href = '../../launcher/index.html';
    else backToTitle();
  }

  const TILE_W = 96, TILE_GAP = 10, TILE_Y = 86, TILE_H = 70;
  const TILE_ICONS = ['triangle', 'hexagon', 'star', 'parallelogram'];
  function tileX(i) { return (W - (STAGES.length * TILE_W + (STAGES.length - 1) * TILE_GAP)) / 2 + i * (TILE_W + TILE_GAP); }
  const STAGES_BTN = { x: 6, y: 7, w: 64, h: 20 };
  const CASUAL_BTN = { x: 380, y: 10, w: 100, h: 72 }; // Grumble + his ON/OFF switch on the title
  function inRect(x, y, r) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }

  function onTap(x, y) {
    if (state === 'title') {
      if (inRect(x, y, CASUAL_BTN)) { toggleCasual(); return; }
      for (let i = 0; i < STAGES.length; i++) {
        if (inRect(x, y, { x: tileX(i), y: TILE_Y, w: TILE_W, h: TILE_H })) { startStage(i); return; }
      }
      onAction();
      return;
    }
    if (inRect(x, y, STAGES_BTN)) { backToTitle(); return; }
    if (state === 'playing') {
      const c = Math.floor((x - BOARD_X) / CELL_W), r = Math.floor((y - BOARD_Y) / CELL_H);
      if (c >= 0 && c < COLS && r >= 0 && r < ROWS) {
        if (dizzyT > 0) return;
        moveTo(c, r);
        if (mx !== c || my !== r) return; // bounced by Grumble on the way
      }
      munch();
      return;
    }
    onAction();
  }

  window.addEventListener('keydown', (e) => {
    const k = e.key;
    let dx = 0, dy = 0;
    if (k === 'ArrowLeft' || k === 'a' || k === 'A') dx = -1;
    else if (k === 'ArrowRight' || k === 'd' || k === 'D') dx = 1;
    else if (k === 'ArrowUp' || k === 'w' || k === 'W') dy = -1;
    else if (k === 'ArrowDown' || k === 's' || k === 'S') dy = 1;
    if (dx || dy) { e.preventDefault(); ensureAudio(); onDir(dx, dy); return; }
    if (k === ' ' || k === 'Enter') { e.preventDefault(); ensureAudio(); if (!e.repeat) onAction(); return; }
    if (k === 'Escape') { e.preventDefault(); onBack(); }
    if ((k === 'g' || k === 'G') && state === 'title') { ensureAudio(); toggleCasual(); }
  });

  // Whole page takes taps (not just the canvas). Taps are mapped onto the canvas so a box can
  // be munched directly; links (like "back to MickleCade") are excluded so they still work.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    e.preventDefault();
    ensureAudio();
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - canvas.clientLeft) * W / canvas.clientWidth;
    const y = (e.clientY - rect.top - canvas.clientTop) * H / canvas.clientHeight;
    onTap(x, y);
  });

  // Xbox 360 controller: D-pad/stick moves, A or Start munches/confirms, B backs out of the
  // title and level-clear cards, Back returns to the stage picker mid-level.
  function pollGamepad() {
    Pad360.poll();
    const BTN = Pad360.BTN;
    const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    if (dx || dy) { ensureAudio(); onDir(dx, dy); }
    if (Pad360.pressed(BTN.A) || Pad360.pressed(BTN.START)) { ensureAudio(); onAction(); }
    if (Pad360.pressed(BTN.B) && state !== 'playing') onBack();
    if (Pad360.pressed(BTN.Y) && state === 'title') { ensureAudio(); toggleCasual(); }
    if (Pad360.pressed(BTN.BACK)) onBack();
  }

  // ---------- Update ----------
  function update(dt) {
    time += dt;
    const target = cellPos(mx, my);
    const k = Math.min(1, dt * 18);
    drawX += (target.x - drawX) * k;
    drawY += (target.y - drawY) * k;
    if (grumble) {
      const g = cellPos(grumble.x, grumble.y);
      grumble.drawX += (g.x - grumble.drawX) * Math.min(1, dt * 10);
      grumble.drawY += (g.y - grumble.drawY) * Math.min(1, dt * 10);
    }
    munchT = Math.max(0, munchT - dt);
    dizzyT = Math.max(0, dizzyT - dt);
    if (cells) for (const c of cells) c.shake = Math.max(0, c.shake - dt);
    if (message) { message.t -= dt; if (message.t <= 0) message = null; }
    for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt; p.life -= dt; }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.y -= 24 * dt; p.t -= dt; }
    popups = popups.filter((p) => p.t > 0);
    if (state === 'playing' && grumbleOn()) updateGrumble(dt);
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
    g.addColorStop(0, '#0b1030');
    g.addColorStop(1, '#1d0f3e');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    for (const s of STARS) {
      ctx.globalAlpha = 0.35 + 0.35 * Math.sin(time * 2 + s.phase);
      ctx.fillStyle = '#fff';
      ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // The muncher: a round green chomper with two eyes on top. (cx, cy) is its middle.
  function drawMuncher(cx, cy, s, face, open, dizzy) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy));
    ctx.scale(face * s, s);
    ctx.fillStyle = '#3f9a2f';
    ctx.fillRect(-6, 6, 4, 3);
    ctx.fillRect(2, 6, 4, 3);
    ctx.fillStyle = '#6be04f';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#9cf27f';
    ctx.fillRect(-5, -4, 3, 2);
    // mouth
    ctx.fillStyle = '#2a0d1a';
    if (open) {
      ctx.beginPath(); ctx.ellipse(3, 3, 4, 3.2, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.fillRect(1, 0, 2, 2);
      ctx.fillRect(4, 0, 2, 2);
    } else {
      ctx.fillRect(0, 3, 6, 1);
    }
    // eyes
    for (const [ex, ey] of [[-2, -7], [3, -8]]) {
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(ex, ey, 2.6, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#111';
      const px = dizzy ? Math.cos(time * 14) * 1.2 : 1, py = dizzy ? Math.sin(time * 14) * 1.2 : 0;
      ctx.fillRect(Math.round(ex + px - 1), Math.round(ey + py - 1), 2, 2);
    }
    ctx.restore();
  }

  // Grumble: a purple fuzzball with grumpy eyebrows.
  function drawGrumble(cx, cy, s) {
    ctx.save();
    ctx.translate(Math.round(cx), Math.round(cy + Math.sin(time * 6) * 1));
    ctx.scale(s, s);
    ctx.fillStyle = '#7a3fd6';
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 + time;
      ctx.fillRect(Math.round(Math.cos(a) * 8) - 1, Math.round(Math.sin(a) * 8) - 1, 3, 3);
    }
    ctx.fillStyle = '#9a5cff';
    ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.fillRect(-5, -3, 4, 4);
    ctx.fillRect(1, -3, 4, 4);
    ctx.fillStyle = '#111';
    ctx.fillRect(-4, -2, 2, 2);
    ctx.fillRect(2, -2, 2, 2);
    ctx.fillStyle = '#3a1670';
    ctx.fillRect(-6, -5, 4, 1); ctx.fillRect(-3, -4, 2, 1);
    ctx.fillRect(2, -5, 4, 1); ctx.fillRect(1, -4, 2, 1);
    ctx.fillRect(-3, 4, 6, 1); ctx.fillRect(-4, 5, 1, 1); ctx.fillRect(3, 5, 1, 1);
    ctx.restore();
  }

  // Outline of a shape at radius 1 around (0, 0), as the current path.
  function regular(n, r = 1) {
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
      ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }
  function poly(pts) {
    ctx.beginPath();
    pts.forEach(([px, py], i) => ctx[i ? 'lineTo' : 'moveTo'](px, py));
    ctx.closePath();
  }
  function shapePath(kind) {
    switch (kind) {
      case 'circle': ctx.beginPath(); ctx.arc(0, 0, 0.92, 0, Math.PI * 2); break;
      case 'oval': ctx.beginPath(); ctx.ellipse(0, 0, 1, 0.6, 0, 0, Math.PI * 2); break;
      case 'triangle': ctx.save(); ctx.translate(0, 0.18); regular(3, 1.05); ctx.restore(); break;
      case 'rightTriangle': poly([[-0.8, 0.75], [0.8, 0.75], [-0.8, -0.85]]); break;
      case 'square': poly([[-0.72, -0.72], [0.72, -0.72], [0.72, 0.72], [-0.72, 0.72]]); break;
      case 'rectangle': poly([[-1, -0.52], [1, -0.52], [1, 0.52], [-1, 0.52]]); break;
      case 'rhombus': poly([[0, -1], [0.62, 0], [0, 1], [-0.62, 0]]); break;
      case 'trapezoid': poly([[-1, 0.6], [1, 0.6], [0.5, -0.6], [-0.5, -0.6]]); break;
      case 'parallelogram': poly([[-1, 0.55], [0.45, 0.55], [1, -0.55], [-0.45, -0.55]]); break;
      case 'pentagon': ctx.save(); ctx.translate(0, 0.08); regular(5); ctx.restore(); break;
      case 'hexagon': regular(6); break;
      case 'octagon': ctx.save(); ctx.rotate(Math.PI / 8); regular(8); ctx.restore(); break;
      case 'star': {
        ctx.beginPath();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 0.45 : 1.05;
          ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r + 0.08);
        }
        ctx.closePath();
        break;
      }
      case 'heart':
        ctx.beginPath();
        ctx.moveTo(0, 0.95);
        ctx.bezierCurveTo(-1.25, 0.05, -0.75, -1.05, 0, -0.4);
        ctx.bezierCurveTo(0.75, -1.05, 1.25, 0.05, 0, 0.95);
        ctx.closePath();
        break;
    }
  }
  // Draw shape it ({ kind, color, rot, size, flip }) centred on (cx, cy), r pixels across-ish.
  function drawShape(it, cx, cy, r) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(it.rot || 0);
    ctx.scale(r * (it.size || 1) * (it.flip || 1), r * (it.size || 1));
    shapePath(it.kind);
    ctx.fillStyle = it.color || '#ffffff';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(it.rot || 0);
    ctx.scale(r * (it.size || 1) * (it.flip || 1), r * (it.size || 1));
    shapePath(it.kind);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawCellContent(cell, x, y) {
    drawShape(cell, x + CELL_W / 2 + 6, y + CELL_H / 2 + 1, 16);
  }

  function drawBoard() {
    const hint = oopsThisLevel >= HINT_AFTER_OOPS;
    const pulse = 0.5 + 0.5 * Math.sin(time * 5);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
      const cell = cellAt(c, r);
      const p = cellPos(c, r);
      const sx = cell.shake > 0 ? Math.round(Math.sin(cell.shake * 60) * 3) : 0;
      roundRect(p.x + 2 + sx, p.y + 2, CELL_W - 4, CELL_H - 4, 5);
      ctx.fillStyle = cell.eaten ? '#0e1430' : (hint && cell.good) ? `rgba(70, 150, 60, ${0.45 + 0.4 * pulse})` : '#1c2660';
      ctx.fill();
      ctx.strokeStyle = cell.eaten ? '#1c2450' : cell.shake > 0 ? '#ff9a4f' : '#3b4fb0';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (!cell.eaten) drawCellContent(cell, p.x + sx, p.y);
    }
    // the muncher's box, sliding along with it
    roundRect(drawX + 2, drawY + 2, CELL_W - 4, CELL_H - 4, 5);
    ctx.strokeStyle = '#ffe14f';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  function drawHUD() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, W, 34);
    const b = STAGES_BTN;
    roundRect(b.x, b.y, b.w, b.h, 4);
    ctx.fillStyle = '#2a1a5e';
    ctx.fill();
    ctx.strokeStyle = '#4ff0ff';
    ctx.stroke();
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('< STAGES', b.x + b.w / 2, b.y + b.h / 2 + 1);

    ctx.font = '8px monospace';
    ctx.fillStyle = '#b9b0e0';
    ctx.fillText('MUNCH', W / 2, 9);
    fitFont(curRule.label, 250, 16);
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ffe14f';
    ctx.shadowBlur = 5;
    const labelX = curRule.icon ? W / 2 - 14 : W / 2;
    ctx.fillText(curRule.label + (curRule.icon ? ':' : ''), labelX, 24);
    ctx.shadowBlur = 0;
    if (curRule.icon) {
      const iconX = labelX + ctx.measureText(curRule.label + ':').width / 2 + 18;
      drawShape({ kind: curRule.icon, color: '#ffffff' }, iconX, 20, 11);
    }

    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('STAGE ' + STAGES[curStage()].name + '   LEVEL ' + level, W - 6, 11);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#6be04f';
    ctx.fillText('SCORE ' + score, W - 6, 25);
    ctx.textAlign = 'left';
  }

  function drawActors() {
    if (grumble) drawGrumble(grumble.drawX + CELL_W - 15, grumble.drawY + 13, 1);
    drawMuncher(drawX + 15, drawY + 12, 1, facing, munchT > 0 && Math.floor(munchT * 20) % 2 === 0, dizzyT > 0);
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
      glowText(p.text, p.x, p.y, 'bold 12px monospace', '#ffe14f', 4);
    }
    ctx.globalAlpha = 1;
  }

  function drawMessage() {
    if (!message) return;
    ctx.globalAlpha = Math.min(1, message.t * 3);
    fitFont(message.text, W - 40, 13);
    const w = ctx.measureText(message.text).width + 24;
    const y = BOARD_Y + CELL_H * 2.5;
    roundRect(W / 2 - w / 2, y - 14, w, 28, 6);
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

  function drawClearCard() {
    ctx.fillStyle = 'rgba(10, 6, 24, 0.6)';
    ctx.fillRect(0, 0, W, H);
    roundRect(W / 2 - 150, 64, 300, 150, 10);
    ctx.fillStyle = '#1e1440';
    ctx.fill();
    ctx.strokeStyle = '#6be04f';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.textAlign = 'center';
    glowText('LEVEL ' + level + ' CLEAR!', W / 2, 90, 'bold 22px monospace', '#ffe14f');
    drawMuncher(W / 2, 124 - Math.abs(Math.sin(time * 6)) * 6, 2, Math.sin(time * 3) > 0 ? 1 : -1, Math.sin(time * 10) > 0, false);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('LEVEL BONUS +' + clearBonus + '     SCORE ' + score, W / 2, 158);
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(time * 5);
    const nextStage = Math.min(STAGES.length - 1, stageIdx + Math.floor(level / LEVELS_PER_STAGE));
    const up = nextStage !== curStage() ? '  -- NEW: ' + STAGES[nextStage].sub + '!' : '';
    glowText('TAP / SPACE / A FOR LEVEL ' + (level + 1) + up, W / 2, 190, 'bold 12px monospace', '#4ff0ff');
    ctx.globalAlpha = 1;
  }

  function drawTitle() {
    ctx.textAlign = 'center';
    glowText('SHAPE MUNCHERS', W / 2, 38, 'bold 28px monospace', '#6be04f', 10);
    glowText('MUNCH EVERY SHAPE THAT MATCHES THE RULE!', W / 2, 66, '10px monospace', '#4ff0ff');
    drawMuncher(52, 40, 2.5, 1, Math.sin(time * 8) > 0, false);
    if (save.casual) {
      ctx.globalAlpha = 0.35;
      drawGrumble(428, 40, 2.5);
      ctx.globalAlpha = 1;
      glowText('z z z', 444 + Math.sin(time * 2) * 2, 20, 'bold 9px monospace', '#b9b0e0', 0);
    } else {
      drawGrumble(428, 40, 2.5);
    }
    roundRect(383, 64, 94, 14, 7);
    ctx.fillStyle = save.casual ? '#1c2660' : '#3a1c60';
    ctx.fill();
    ctx.strokeStyle = save.casual ? '#4ff0ff' : '#ff4fd8';
    ctx.stroke();
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = save.casual ? '#4ff0ff' : '#ff9dff';
    ctx.fillText(save.casual ? 'CASUAL: NO GRUMBLE' : 'GRUMBLE: ON', 430, 74);

    for (let i = 0; i < STAGES.length; i++) {
      const g = STAGES[i], x = tileX(i), sel = i === stageIdx;
      const y = TILE_Y - (sel ? 3 + Math.round(Math.abs(Math.sin(time * 4)) * 2) : 0);
      roundRect(x, y, TILE_W, TILE_H, 6);
      ctx.fillStyle = sel ? '#2a3a8a' : '#1c2660';
      ctx.fill();
      ctx.strokeStyle = sel ? '#ffe14f' : '#3b4fb0';
      ctx.lineWidth = sel ? 2 : 1;
      ctx.stroke();
      ctx.lineWidth = 1;
      drawShape({ kind: TILE_ICONS[i], color: sel ? COLORS[i * 2] : '#3b4fb0' }, x + 22, y + 22, 12);
      glowText(g.name, x + TILE_W / 2 + 16, y + 23, 'bold 22px monospace', sel ? '#ffe14f' : '#ffffff', sel ? 6 : 0);
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = sel ? '#ffffff' : '#b9b0e0';
      ctx.fillText(g.sub, x + TILE_W / 2, y + 46);
      const best = save.best[bestKey(i)];
      if (best && best.score) {
        ctx.fillStyle = '#6be04f';
        ctx.fillText('BEST ' + best.score, x + TILE_W / 2, y + 56);
      }
    }

    fitFont(STAGES[stageIdx].blurb, W - 20, 10, '');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(STAGES[stageIdx].blurb, W / 2, 172);
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 5);
    glowText('TAP A STAGE TO START  --  IT GETS TRICKIER AS YOU GO!', W / 2, 198, 'bold 11px monospace', '#ffe14f');
    ctx.globalAlpha = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#b9b0e0';
    ctx.fillText('LEFT / RIGHT PICK A STAGE  ·  SPACE / A TO START', W / 2, 218);
    ctx.fillText(save.casual
      ? 'CASUAL MODE: NO GRUMBLE, JUST MUNCH!  (UP/DOWN, Y OR TAP HIM)'
      : 'WATCH OUT FOR GRUMBLE!  NO GRUMBLE?  UP/DOWN, Y OR TAP HIM', W / 2, 232);
    ctx.font = '8px monospace';
    ctx.fillStyle = '#6a5fa0';
    ctx.fillText('A MICKLEKIDS GAME', W / 2, 258);
    ctx.textAlign = 'left';
  }

  function render() {
    drawBackground();
    if (state === 'title') { drawTitle(); return; }
    drawHUD();
    drawBoard();
    drawActors();
    drawEffects();
    drawMessage();
    if (state === 'clear') { drawClearCard(); drawEffects(); }
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
