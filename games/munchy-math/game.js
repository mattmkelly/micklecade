(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H, (c) => { c.textBaseline = 'middle'; });

  // A Number-Munchers-style board: 6 x 5 boxes under a one-line rule.
  const COLS = 6, ROWS = 5;
  const CELL_W = 78, CELL_H = 46;
  const BOARD_X = 6, BOARD_Y = 38;
  const HINT_AFTER_OOPS = 3; // after this many wrong munches in a level, right answers glow

  const SAVE_KEY = 'munchyMath.save';

  // ---------- Problems ----------
  // Each grade has a few rule makers. A rule maker takes d (0 = first level, 1 = hardest)
  // and returns { label, good(), any(), test(item), why(item) }. good() always makes a box
  // that fits the rule; any() makes a random box the board keeps only if it doesn't fit.
  // An item is { text, v } (v = its value as a number), or { dots: n, v: n } for a dot picture.
  function ri(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = ri(0, i); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
  }
  function lerpInt(a, b, d) { return Math.round(a + (b - a) * d); }
  function gcd(a, b) { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a; }
  function same(a, b) { return Math.abs(a - b) < 1e-9; }
  function fmt(v) { return String(+v.toFixed(4)); } // 0.1 + 0.2 shows as 0.3
  function paren(v) { return v < 0 ? '(' + fmt(v) + ')' : fmt(v); }
  // A value near t (never t itself), kept inside lo..hi.
  function near(t, spread, lo, hi) {
    for (let i = 0; i < 50; i++) {
      const v = t + ri(-spread, spread);
      if (v !== t && v >= lo && v <= hi) return v;
    }
    return t === hi ? t - 1 : t + 1;
  }

  const num = (v) => ({ text: fmt(v), v });
  const frac = (n, d) => ({ text: n + '/' + d, v: n / d });
  const pct = (p) => ({ text: p + '%', v: p / 100 });
  const add = (a, b) => ({ text: fmt(a) + ' + ' + paren(b), v: a + b });
  const sub = (a, b) => ({ text: fmt(a) + ' - ' + paren(b), v: a - b });
  const mul = (a, b) => ({ text: a + ' × ' + b, v: a * b });
  const div = (a, b) => ({ text: a + ' ÷ ' + b, v: a / b });

  function rule(label, good, any, test, why) { return { label, good, any, test, why }; }
  function equals(target, good, any) {
    return rule('EQUALS ' + fmt(target), good, any,
      (it) => same(it.v, target), (it) => it.text + ' = ' + fmt(it.v));
  }
  function moreThan(t, good, any) {
    return rule('MORE THAN ' + fmt(t), good, any, (it) => it.v > t && !same(it.v, t),
      (it) => fmt(it.v) + (same(it.v, t) ? ' IS EQUAL TO ' : ' IS LESS THAN ') + fmt(t));
  }
  // "Same as 1/4" style rules: fractions explain themselves as a decimal.
  function sameAs(label, t, good, any) {
    return rule('SAME AS ' + label, good, any, (it) => same(it.v, t),
      (it) => it.text.indexOf('/') >= 0 ? it.text + ' = ' + fmt(it.v) : it.text + ' IS NOT ' + label);
  }
  // An add or take-away fact that equals v, using numbers up to max.
  function factFor(v, max) {
    if (v >= max || Math.random() < 0.55) { const a = ri(0, v); return add(a, v - a); }
    const a = ri(v + 1, max);
    return sub(a, a - v);
  }
  // Ways to write the same amount: a decimal, fractions, and maybe a percent.
  function reps(n, d, withPct) {
    const out = [num(n / d)];
    for (let k = 1; d * k <= 100; k++) if (k <= 5 || d * k === 100) out.push(frac(n * k, d * k));
    if (withPct) out.push(pct(100 * n / d));
    return out;
  }
  function randomFrac() { const d = pick([2, 3, 4, 5, 6, 8, 10]); return frac(ri(1, d - 1), d); }
  function isPrime(n) { if (n < 2) return false; for (let i = 2; i * i <= n; i++) if (n % i === 0) return false; return true; }

  // --- Kindergarten ---
  function kCount(d) {
    const n = ri(1, lerpInt(5, 10, d));
    const item = (k) => (Math.random() < 0.5 ? num(k) : { dots: k, v: k });
    return rule('ALL THE ' + n + 's', () => item(n), () => item(ri(1, 10)),
      (it) => it.v === n, (it) => (it.dots ? 'THAT IS ' + it.v + ' DOTS' : 'THAT IS ' + it.v));
  }
  function kMore(d) {
    const t = ri(2, lerpInt(5, 8, d));
    return moreThan(t, () => num(ri(t + 1, 10)), () => num(ri(0, 10)));
  }
  function kFacts(d) {
    const max = lerpInt(5, 10, d), t = ri(2, max);
    return equals(t, () => factFor(t, max), () => factFor(near(t, 3, 0, max), max));
  }

  // --- Grade 1 ---
  function g1Facts(d) {
    const max = lerpInt(12, 20, d), t = ri(5, max);
    return equals(t, () => factFor(t, max), () => factFor(near(t, 3, 0, max), max));
  }
  function g1More(d) {
    const t = ri(lerpInt(15, 40, d), lerpInt(30, 85, d));
    return moreThan(t, () => num(ri(t + 1, t + 15)), () => num(near(t, 12, 0, 100)));
  }
  function g1Tens() {
    const t = 10 * ri(2, 8) + ri(0, 9);
    const fact = (v) => pick([() => add(v - 10, 10), () => sub(v + 10, 10), () => add(v - 1, 1)])();
    return equals(t, () => fact(t), () => fact(near(t, 11, 11, 89)));
  }

  // --- Grade 2 ---
  function g2Facts(d) {
    const max = lerpInt(50, 100, d), t = ri(20, max - 1);
    return equals(t, () => factFor(t, max), () => factFor(near(t, 10, 0, max), max));
  }
  function g2EvenOdd() {
    const even = Math.random() < 0.5;
    return rule(even ? 'EVEN NUMBERS' : 'ODD NUMBERS',
      () => num(2 * ri(0, 49) + (even ? 0 : 1)), () => num(ri(0, 99)),
      (it) => (it.v % 2 === 0) === even, (it) => it.v + (it.v % 2 === 0 ? ' IS EVEN' : ' IS ODD'));
  }
  function g2Skip(d) {
    const n = pick(d < 0.5 ? [5, 10] : [2, 5, 10, 100]);
    const top = n === 100 ? 900 : n === 2 ? 50 : 100;
    return rule('COUNT BY ' + n + 's', () => num(n * ri(1, top / n)),
      () => num(n === 100 ? 10 * ri(1, 90) : ri(1, top)),
      (it) => it.v % n === 0, (it) => 'COUNTING BY ' + n + 's SKIPS ' + it.v);
  }
  function g2Tens() {
    const t = ri(1, 9);
    return rule('HAS ' + t + ' TENS', () => num(10 * t + ri(0, 9)), () => num(ri(10, 99)),
      (it) => Math.floor(it.v / 10) === t, (it) => it.v + ' HAS ' + Math.floor(it.v / 10) + ' TENS');
  }

  // --- Grade 3 ---
  function g3Times(d) {
    const max = lerpInt(5, 9, d), t = ri(2, max) * ri(2, 9);
    const pairs = [];
    for (let a = 2; a <= 10; a++) for (let b = 2; b <= 10; b++) if (a * b === t) pairs.push([a, b]);
    return equals(t, () => mul(...pick(pairs)), () => mul(ri(2, max), ri(2, 9)));
  }
  function g3Divide(d) {
    const q = ri(2, lerpInt(5, 9, d));
    return equals(q, () => { const b = ri(2, 9); return div(q * b, b); },
      () => { const b = ri(2, 9); return div(ri(1, 10) * b, b); });
  }
  function g3Multiples(d) {
    const n = ri(2, lerpInt(5, 9, d));
    return rule('MULTIPLES OF ' + n, () => num(n * ri(1, 10)), () => num(ri(2, n * 10)),
      (it) => it.v % n === 0, (it) => it.v + ' IS NOT IN THE ' + n + 's TABLE');
  }
  function g3Round() {
    const t = 10 * ri(2, 9);
    const rounded = (v) => Math.round(v / 10) * 10;
    return rule('ROUNDS TO ' + t, () => num(t + ri(-5, 4)), () => num(near(t, 14, 10, 99)),
      (it) => rounded(it.v) === t, (it) => it.v + ' ROUNDS TO ' + rounded(it.v));
  }
  function g3Half() {
    return sameAs('1/2', 0.5, () => { const d = pick([2, 4, 6, 8, 10]); return frac(d / 2, d); }, randomFrac);
  }

  // --- Grade 4 ---
  function g4Factors() {
    const n = pick([12, 16, 18, 20, 24, 30, 36, 48]);
    const factors = [];
    for (let i = 1; i <= n; i++) if (n % i === 0) factors.push(i);
    return rule('FACTORS OF ' + n, () => num(pick(factors)), () => num(ri(1, n)),
      (it) => n % it.v === 0, (it) => n + ' ÷ ' + it.v + ' HAS A REMAINDER');
  }
  function g4Primes() {
    const primes = [];
    for (let i = 2; i <= 50; i++) if (isPrime(i)) primes.push(i);
    const smallest = (n) => { for (let i = 2; ; i++) if (n % i === 0) return i; };
    return rule('PRIME NUMBERS', () => num(pick(primes)), () => num(ri(2, 50)), (it) => isPrime(it.v),
      (it) => it.v + ' = ' + smallest(it.v) + ' × ' + it.v / smallest(it.v));
  }
  function g4Times() {
    const t = pick([24, 36, 48, 60, 72, 84, 96]);
    const pairs = [];
    for (let a = 2; a <= 9; a++) if (t % a === 0 && t / a >= 2) pairs.push([a, t / a]);
    return equals(t, () => { const [a, b] = pick(pairs); return Math.random() < 0.5 ? mul(a, b) : mul(b, a); },
      () => mul(ri(2, 9), ri(6, 16)));
  }
  function g4Equiv() {
    const [n, d] = pick([[1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [2, 5], [3, 5]]);
    return sameAs(n + '/' + d, n / d, () => { const k = ri(1, 5); return frac(n * k, d * k); },
      () => { const dd = d * ri(1, 4); return frac(ri(1, dd - 1), dd); });
  }

  // --- Grade 5 ---
  function g5Same() {
    const [n, d] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [1, 10], [3, 10]]);
    const ways = reps(n, d, false);
    return sameAs(n + '/' + d, n / d, () => pick(ways),
      () => (Math.random() < 0.5 ? num(ri(1, 99) / 100) : randomFrac()));
  }
  function g5MoreDec() {
    const tenths = ri(2, 8), t = tenths / 10;
    return moreThan(t, () => num(ri(tenths * 10 + 1, 99) / 100),
      () => (Math.random() < 0.5 ? num(ri(1, 99) / 100) : num(ri(1, 9) / 10)));
  }
  function g5Order() {
    const t = ri(10, 30);
    // Times before plus: "4 + 2 × 3" is 10, not 18.
    const form = (a, b, c) => pick([
      { text: a + ' + ' + b + ' × ' + c, v: a + b * c },
      { text: b + ' × ' + c + ' - ' + a, v: b * c - a },
      { text: '(' + a + ' + ' + b + ') × ' + c, v: (a + b) * c },
    ]);
    const good = () => {
      for (;;) {
        const b = ri(2, 6), c = ri(2, 5), opts = [];
        if (t - b * c >= 1) opts.push({ text: (t - b * c) + ' + ' + b + ' × ' + c, v: t });
        if (b * c - t >= 1) opts.push({ text: b + ' × ' + c + ' - ' + (b * c - t), v: t });
        if (t % c === 0 && t / c - b >= 1) opts.push({ text: '(' + (t / c - b) + ' + ' + b + ') × ' + c, v: t });
        if (opts.length) return pick(opts);
      }
    };
    return equals(t, good, () => form(ri(1, 15), ri(2, 6), ri(2, 5)));
  }
  function g5DecAdd() {
    const tt = ri(5, 20);
    const fact = (s) => { const a = ri(1, s - 1); return add(a / 10, (s - a) / 10); };
    return equals(tt / 10, () => fact(tt), () => fact(near(tt, 4, 2, 30)));
  }

  // --- Grade 6 ---
  function g6Ints() {
    const t = ri(-6, 6);
    const fact = (v) => { const a = ri(-9, 9); return Math.random() < 0.5 ? add(a, v - a) : sub(a, a - v); };
    return equals(t, () => fact(t), () => fact(near(t, 4, -15, 15)));
  }
  function g6MoreNeg() {
    const t = ri(-6, 3);
    return moreThan(t, () => num(ri(t + 1, 10)), () => num(ri(-10, 10)));
  }
  function g6Percent() {
    const p = pick([10, 20, 25, 50, 75]), g = gcd(p, 100);
    const ways = reps(p / g, 100 / g, true);
    return sameAs(p + '%', p / 100, () => pick(ways),
      () => pick([() => pct(5 * ri(1, 19)), () => num(5 * ri(1, 19) / 100), randomFrac])());
  }
  function g6Powers() {
    const t = pick([8, 9, 16, 25, 27, 36, 49, 64, 81, 100, 125]);
    const ways = [];
    for (let a = 2; a <= 11; a++) {
      if (a * a === t) ways.push({ text: a + '²', v: t }, { text: a + ' × ' + a, v: t });
      if (a * a * a === t) ways.push({ text: a + '³', v: t }, { text: a + ' × ' + a + ' × ' + a, v: t });
    }
    // "3 × 2" sits next to "3²" so the board catches the classic mix-up.
    const any = () => {
      const a = ri(2, 10);
      return pick([{ text: a + '²', v: a * a }, { text: a + ' × 2', v: a * 2 },
        a <= 5 ? { text: a + '³', v: a * a * a } : { text: a + ' × 3', v: a * 3 }]);
    };
    return equals(t, () => pick(ways), any);
  }
  function g6Ratio() {
    const [a, b] = pick([[1, 2], [2, 3], [3, 4], [1, 3], [2, 5], [3, 5]]);
    const ratio = (x, y) => ({ text: x + ':' + y, v: x / y, x, y });
    return rule('SAME AS ' + a + ':' + b, () => { const k = ri(1, 6); return ratio(a * k, b * k); },
      () => { const y = ri(2, 20); return ratio(ri(1, y - 1), y); },
      (it) => same(it.v, a / b), (it) => {
        const g = gcd(it.x, it.y);
        return g > 1 ? it.text + ' IS THE SAME AS ' + it.x / g + ':' + it.y / g : it.text + ' IS NOT ' + a + ':' + b;
      });
  }
  function g6Solve(d) {
    const x = ri(2, lerpInt(6, 12, d));
    const eq = (v) => {
      const a = ri(2, 9);
      const opts = [{ text: 'x + ' + a + ' = ' + (v + a), v }, { text: a + 'x = ' + a * v, v }];
      if (v > a) opts.push({ text: 'x - ' + a + ' = ' + (v - a), v });
      return pick(opts);
    };
    return rule('x = ' + x, () => eq(x), () => eq(near(x, 3, 1, 15)),
      (it) => it.v === x, (it) => 'THERE x = ' + it.v);
  }

  const GRADES = [
    { name: 'K', sub: 'KINDER', blurb: 'COUNTING  ·  MORE THAN  ·  ADD AND TAKE AWAY TO 10', rules: [kCount, kMore, kFacts] },
    { name: '1', sub: 'GRADE 1', blurb: 'ADD AND TAKE AWAY TO 20  ·  BIGGER NUMBERS  ·  10 MORE', rules: [g1Facts, g1More, g1Tens] },
    { name: '2', sub: 'GRADE 2', blurb: 'ADDING TO 100  ·  EVEN AND ODD  ·  SKIP COUNTING  ·  TENS', rules: [g2Facts, g2EvenOdd, g2Skip, g2Tens] },
    { name: '3', sub: 'GRADE 3', blurb: 'TIMES TABLES  ·  DIVIDING  ·  ROUNDING  ·  HALVES', rules: [g3Times, g3Divide, g3Multiples, g3Round, g3Half] },
    { name: '4', sub: 'GRADE 4', blurb: 'FACTORS  ·  PRIMES  ·  BIG TIMES  ·  MATCHING FRACTIONS', rules: [g4Factors, g4Primes, g4Times, g4Equiv] },
    { name: '5', sub: 'GRADE 5', blurb: 'DECIMALS  ·  FRACTIONS  ·  ORDER OF OPERATIONS', rules: [g5Same, g5MoreDec, g5Order, g5DecAdd] },
    { name: '6', sub: 'GRADE 6', blurb: 'NEGATIVES  ·  PERCENTS  ·  POWERS  ·  RATIOS  ·  SOLVE FOR x', rules: [g6Ints, g6MoreNeg, g6Percent, g6Powers, g6Ratio, g6Solve] },
  ];
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
    return { best: {}, lastGrade: 0 };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ }
  }
  const save = loadSave();

  // ---------- State ----------
  let state = 'title'; // 'title' | 'playing' | 'clear'
  let gradeIdx = Math.min(GRADES.length - 1, Math.max(0, save.lastGrade | 0));
  let level = 1, score = 0, streak = 0, clearBonus = 0;
  let curRule = null, cells = null, oopsThisLevel = 0;
  let ruleBag = [], lastRuleIdx = -1;
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
    const out = [], used = new Set();
    order.forEach((pos, i) => {
      const wantGood = i < goodCount;
      let it;
      // Try for a box that fits (or doesn't) and isn't already on the board; repeats are
      // allowed once the fresh ideas run out.
      for (let tries = 0; tries < 80; tries++) {
        it = wantGood ? r.good() : r.any();
        if (!!r.test(it) === wantGood && (tries > 40 || !used.has(it.text || 'dots' + it.dots))) break;
      }
      used.add(it.text || 'dots' + it.dots);
      out[pos] = Object.assign({}, it, { good: !!r.test(it), eaten: false, shake: 0 });
    });
    return out;
  }

  function nextRule(d) {
    const grade = GRADES[gradeIdx];
    if (!ruleBag.length) {
      ruleBag = shuffle(grade.rules.map((_, i) => i));
      if (ruleBag[0] === lastRuleIdx && ruleBag.length > 1) ruleBag.push(ruleBag.shift());
    }
    lastRuleIdx = ruleBag.shift();
    return grade.rules[lastRuleIdx](d);
  }

  function grumbleOn() { return level >= (gradeIdx === 0 ? 4 : 3); }

  function newLevel() {
    curRule = nextRule(Math.min(1, (level - 1) / 6));
    cells = makeBoard(curRule);
    oopsThisLevel = 0;
    grumble = null;
    grumbleSpawnT = grumbleOn() ? 5 : Infinity;
    message = { text: 'LEVEL ' + level + ':  MUNCH ' + curRule.label, color: '#4ff0ff', t: 2.4 };
    state = 'playing';
  }

  function startGrade(i) {
    gradeIdx = i;
    save.lastGrade = i;
    writeSave();
    level = 1; score = 0; streak = 0;
    mx = 0; my = 0;
    ({ x: drawX, y: drawY } = cellPos(0, 0));
    ruleBag = []; lastRuleIdx = -1;
    particles = []; popups = [];
    newLevel();
  }

  function updateBest() {
    const name = GRADES[gradeIdx].name;
    const b = save.best[name] || { score: 0, level: 0 };
    b.score = Math.max(b.score, score);
    b.level = Math.max(b.level, level);
    save.best[name] = b;
    writeSave();
  }

  function backToTitle() {
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
      if (dx) { gradeIdx = (gradeIdx + dx + GRADES.length) % GRADES.length; sfxMove(); }
    } else move(dx, dy);
  }
  function onAction() {
    if (state === 'title') startGrade(gradeIdx);
    else if (state === 'playing') munch();
    else if (state === 'clear') { level++; newLevel(); }
  }
  function onBack() {
    if (state === 'title') window.location.href = '../../launcher/index.html';
    else backToTitle();
  }

  const TILE_W = 58, TILE_GAP = 6, TILE_Y = 88, TILE_H = 66;
  function tileX(i) { return (W - (GRADES.length * TILE_W + (GRADES.length - 1) * TILE_GAP)) / 2 + i * (TILE_W + TILE_GAP); }
  const GRADES_BTN = { x: 6, y: 7, w: 64, h: 20 };
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
  // title and level-clear cards, Back returns to the grade picker mid-level.
  function pollGamepad() {
    Pad360.poll();
    const BTN = Pad360.BTN;
    const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    if (dx || dy) { ensureAudio(); onDir(dx, dy); }
    if (Pad360.pressed(BTN.A) || Pad360.pressed(BTN.START)) { ensureAudio(); onAction(); }
    if (Pad360.pressed(BTN.B) && state !== 'playing') onBack();
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

  function drawCellContent(cell, x, y) {
    ctx.textAlign = 'center';
    if (cell.dots) {
      const rows = cell.dots > 5 ? [5, cell.dots - 5] : [cell.dots];
      ctx.fillStyle = '#ffe14f';
      rows.forEach((n, ri2) => {
        const rowY = rows.length === 1 ? y + 30 : y + 26 + ri2 * 9;
        const startX = x + CELL_W / 2 - ((n - 1) * 9) / 2;
        for (let i = 0; i < n; i++) ctx.fillRect(Math.round(startX + i * 9 - 2.5), Math.round(rowY - 2.5), 5, 5);
      });
      return;
    }
    fitFont(cell.text, CELL_W - 10, 15);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cell.text, x + CELL_W / 2, y + 30);
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

    ctx.font = '8px monospace';
    ctx.fillStyle = '#b9b0e0';
    ctx.fillText('MUNCH', W / 2, 9);
    fitFont(curRule.label, 250, 16);
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ffe14f';
    ctx.shadowBlur = 5;
    ctx.fillText(curRule.label, W / 2, 24);
    ctx.shadowBlur = 0;

    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('GRADE ' + GRADES[gradeIdx].name + '   LEVEL ' + level, W - 6, 11);
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
    glowText('TAP / SPACE / A FOR LEVEL ' + (level + 1), W / 2, 190, 'bold 12px monospace', '#4ff0ff');
    ctx.globalAlpha = 1;
  }

  function drawTitle() {
    ctx.textAlign = 'center';
    glowText('MUNCHY MATH', W / 2, 38, 'bold 30px monospace', '#6be04f', 10);
    glowText('MUNCH EVERY BOX THAT MATCHES THE RULE!', W / 2, 66, '10px monospace', '#4ff0ff');
    drawMuncher(52, 40, 2.5, 1, Math.sin(time * 8) > 0, false);
    drawGrumble(428, 40, 2.5);

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
      glowText(g.name, x + TILE_W / 2, y + 23, 'bold 24px monospace', sel ? '#ffe14f' : '#ffffff', sel ? 6 : 0);
      ctx.font = '8px monospace';
      ctx.fillStyle = '#b9b0e0';
      ctx.fillText(g.sub, x + TILE_W / 2, y + 44);
      const best = save.best[g.name];
      if (best && best.score) {
        ctx.fillStyle = '#6be04f';
        ctx.fillText('BEST ' + best.score, x + TILE_W / 2, y + 56);
      }
    }

    fitFont(GRADES[gradeIdx].blurb, W - 20, 10, '');
    ctx.fillStyle = '#ffffff';
    ctx.fillText(GRADES[gradeIdx].blurb, W / 2, 172);
    ctx.globalAlpha = 0.65 + 0.35 * Math.sin(time * 5);
    glowText('TAP A GRADE TO START', W / 2, 198, 'bold 13px monospace', '#ffe14f');
    ctx.globalAlpha = 1;
    ctx.font = '9px monospace';
    ctx.fillStyle = '#b9b0e0';
    ctx.fillText('ARROWS / D-PAD PICK A GRADE  ·  SPACE / A TO START', W / 2, 218);
    ctx.fillText('WATCH OUT FOR GRUMBLE -- HE JUST BUMPS YOU AROUND!', W / 2, 232);
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
