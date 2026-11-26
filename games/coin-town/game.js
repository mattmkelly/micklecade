// Coin Town -- a money game. Earn at the Shop (count back change), split each payday into
// SPEND / SAVE / GIVE jars, watch the Bank pay interest, save for a goal at the Wonder Shop,
// give to the Park, and learn at Money School. Each shift is one week; the week ends at night
// with interest, a surprise or a treat, and any new money-habit badges.
// The town is 3D (town3d.js); every building's inside is a glass DOM panel over it in #ui.
// 1em = 1/30 of the stage height (fit()). Amounts are whole cents everywhere.
(function () {
  'use strict';
  const { fmt, sayMoney, pieceSVG, vMoney, greedy, countUp, TOPICS, shuffle, R, pick } = window.CoinMoney;
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');
  const signsEl = document.getElementById('signs');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');

  const SAVE_KEY = 'coinTown.save';
  // REAL TIME (Matt's call): a game week is a real week, and every rate is a real yearly rate applied a week at a time
  // (savings 4% a year, short bonds 4.5-5.5%, stocks ~6-12% a year on average with real-size swings, loans 9-24% APR).
  // So weekly interest is honestly tiny; the bank's Savings Time Machine shows what it does over real years.
  const RATE = 0.04;                 // savings account: 4% a year (a good high-yield savings rate)
  const WEEKS = 52;
  const SHIFT_N = 5, PRACTICE_N = 6;
  const BASE_PAY = 400, BONUS_PAY = 100;

  const GRADES = [
    { n: 0, label: 'KINDERGARTEN', short: 'KINDER', blurb: 'Pennies, nickels & dimes', c: '#f472b6' },
    { n: 1, label: 'GRADE 1', short: 'GRADE 1', blurb: 'Coins up to $1', c: '#fb923c' },
    { n: 2, label: 'GRADE 2', short: 'GRADE 2', blurb: 'Dollars and cents', c: '#facc15' },
    { n: 3, label: 'GRADE 3', short: 'GRADE 3', blurb: 'Making change', c: '#4ade80' },
    { n: 4, label: 'GRADE 4', short: 'GRADE 4', blurb: 'Bigger bills', c: '#22d3ee' },
    { n: 5, label: 'GRADE 5', short: 'GRADE 5', blurb: 'Sales tax', c: '#818cf8' },
    { n: 6, label: 'GRADE 6', short: 'GRADE 6', blurb: 'Sales, tax & budgets', c: '#c084fc' },
  ];
  // The WONDER SHOP (was the Toy Store): rewards worth saving for -- books, learning, art, music, play and days out.
  // Ids of the first 12 are kept so older saves still own and aim for the same things.
  const SHOP_TABS = [['learn', '📚 LEARN'], ['art', '🎨 ART & MUSIC'], ['play', '⚽ PLAY'], ['out', '🎟️ DAYS OUT']];
  const TOYS = [
    ['story', '📖', 'STORY BOOK', 200, 'learn', 'A brand-new story to read again and again.'],
    ['journal', '📓', 'JOURNAL', 300, 'learn', 'Write your own stories, ideas and secret plans.'],
    ['plant', '🌱', 'PLANT KIT', 400, 'learn', 'Grow your very own plant from a tiny seed.'],
    ['books', '📚', 'BOOK SET', 600, 'learn', 'A whole stack of books. Hours of adventures!'],
    ['science', '🧪', 'SCIENCE KIT', 2000, 'learn', 'Fizzing, bubbling experiments to try at home.'],
    ['microscope', '🔬', 'MICROSCOPE', 3000, 'learn', 'See tiny things up close, like leaves and sugar.'],
    ['robot', '🤖', 'ROBOT KIT', 3500, 'learn', 'Build a robot and teach it to move.'],
    ['scope', '🔭', 'TELESCOPE', 8000, 'learn', 'Look at the Moon, planets and stars.'],
    ['crayons', '🖍️', 'CRAYON BOX', 200, 'art', 'Every color you could want.'],
    ['paint', '🎨', 'PAINT SET', 1200, 'art', 'Paint pictures to hang on the wall.'],
    ['guitar', '🎸', 'GUITAR', 4000, 'art', 'Learn to play songs for your family.'],
    ['keyboard', '🎹', 'KEYBOARD', 4500, 'art', 'Play music and make up your own tunes.'],
    ['stickers', '🌟', 'STICKERS', 100, 'play', 'Shiny stickers for your notebook.'],
    ['yoyo', '🪀', 'YO-YO', 300, 'play', 'Practice tricks until you are a pro.'],
    ['ball', '⚽', 'SOCCER BALL', 800, 'play', 'Run, kick and play with friends.'],
    ['basketball', '🏀', 'BASKETBALL', 900, 'play', 'Shoot hoops and practice your dribbling.'],
    ['kite', '🪁', 'KITE', 1000, 'play', 'Fly it high on a windy day.'],
    ['game', '🎲', 'BOARD GAME', 1000, 'play', 'A game night for the whole family.'],
    ['puzzle', '🧩', 'BIG PUZZLE', 1500, 'play', 'A tricky puzzle to finish together.'],
    ['skate', '🛹', 'SKATEBOARD', 2500, 'play', 'Roll around the park (helmet on!).'],
    ['bike', '🚲', 'BIKE', 6000, 'play', 'Ride to the park and explore your town.'],
    ['museum', '🏛️', 'MUSEUM DAY', 1200, 'out', 'A day of dinosaurs, rockets and wonders.'],
    ['bowling', '🎳', 'BOWLING NIGHT', 1000, 'out', 'Knock down pins with your family.'],
    ['zoo', '🦒', 'ZOO DAY', 1500, 'out', 'Meet giraffes, lions and penguins.'],
  ].map(([id, e, name, price, cat, about]) => ({ id, e, name, price, cat, about }));
  const PROJECTS = [
    { id: 'trees', e: '🌳', name: 'PLANT A TREE', about: 'Shade for everyone', cost: 300, max: 6 },
    { id: 'flowers', e: '🌷', name: 'FLOWER GARDEN', about: 'Bees and butterflies love it', cost: 400 },
    { id: 'shelter', e: '🐶', name: 'ANIMAL SHELTER', about: 'Food and a warm bed for pets', cost: 500 },
    { id: 'library', e: '📖', name: 'BOOK BOX', about: 'Free books for everyone', cost: 800 },
    { id: 'pond', e: '🦆', name: 'DUCK POND', about: 'A pond for the ducks', cost: 1000 },
    { id: 'carousel', e: '🎠', name: 'MERRY-GO-ROUND', about: 'Rides for all the kids', cost: 1500 },
  ];
  const BADGES = [
    { id: 'saver', e: '🐷', name: 'SAVE FIRST', how: 'Save half a paycheck', tip: 'Grown-ups call this "pay yourself first": put the saving part away BEFORE you spend, and saving happens every time.' },
    { id: 'steady', e: '🐢', name: 'SLOW & STEADY', how: 'Save 4 paydays in a row', tip: 'Saving a little every week adds up to a lot. Grown-ups often save part of every paycheck automatically.' },
    { id: 'goal', e: '🎯', name: 'GOAL GETTER', how: 'Buy the goal you saved for', tip: 'A goal makes saving easier. Grown-ups save the same way for a car, a home or a big trip.' },
    { id: 'think', e: '🤔', name: 'THINK FIRST', how: 'Skip a treat to keep saving', tip: 'Treats are fine sometimes! Stopping to think before buying is a habit that keeps grown-ups out of money trouble.' },
    { id: 'rainy', e: '☂️', name: 'RAINY-DAY FUND', how: 'Savings pay for a surprise', tip: 'Grown-ups keep an emergency fund for surprises like a broken car, so a bad day doesn\'t become a money problem.' },
    { id: 'giver', e: '💝', name: 'GIVER', how: 'Give money to the Park', tip: 'Giving helps your whole town. Lots of grown-ups share a little from every paycheck.' },
    { id: 'grower', e: '🌱', name: 'MONEY GROWER', how: 'Earn 10¢ of interest', tip: 'Interest is money your money earns. The earlier you start saving, the more time it has to grow.' },
    { id: 'cashier', e: '🧾', name: 'SUPER CASHIER', how: 'A perfect shift at the Shop', tip: 'Careful counting keeps things fair. Always count your change -- grown-ups do too!' },
    { id: 'credit', e: '💳', name: 'GOOD CREDIT', how: 'Pay back a loan on time', tip: 'Paying back on time builds a good credit score, so borrowing costs less when you are grown up and need a car or a home.' },
    { id: 'basket', e: '🧺', name: 'MIXED BASKET', how: 'Own 3 stocks or an ETF', tip: 'Don\'t put all your eggs in one basket! Grown-ups spread their investments so one bad company can\'t sink them.' },
    { id: 'homey', e: '🏡', name: 'FIXER-UPPER', how: 'Improve your home', tip: 'Grown-ups take care of their homes. Fixing small things early, and making smart upgrades, saves money later.' },
    { id: 'scholar', e: '🎓', name: 'MONEY SMART', how: 'A star in every lesson', tip: 'Knowing how money works is one of the best tools you can have when you grow up.' },
  ];
  const CUSTOMERS = ['🐶', '🐱', '🐰', '🦊', '🐻', '🐼', '🐨', '🐯', '🦁', '🐸', '🐵', '🐧', '🦉', '🐭', '🦝', '🐹'];
  const HELLO = ['Hi! I\'d like these, please.', 'Hello! Just these today.', 'Good morning! I\'ll take these.', 'Hi there! Can I buy these?', 'These look great!'];
  const THANKS = ['Thank you!', 'Thanks so much!', 'Perfect, thank you!', 'Have a nice day!', 'Yay, thanks!'];
  const ITEMS = [
    [5, 99, ['🍬 candy', '🍎 apple', '🍌 banana', '✏️ pencil', '🍪 cookie', '🧃 juice', '🎈 balloon']],
    [100, 499, ['📒 notebook', '🧁 cupcake', '🥪 sandwich', '🪀 yo-yo', '🖍️ crayons', '🧦 socks', '🍉 melon']],
    [500, 2500, ['🧸 teddy', '⚽ ball', '🎨 paints', '📚 book', '🧩 puzzle', '🪁 kite', '🎲 game', '🧢 cap']],
  ];

  // ---------- save ----------
  const FRESH = () => ({ grade: null, wallet: 0, bank: 0, give: 0, week: 1, goal: null, owned: [], stars: {}, read: null, hist: [], interestTotal: 0,
    badges: {}, gifts: {}, shifts: 0, saveStreak: 0, best: {}, seenToys: false });
  let save = FRESH();
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) { /* no storage */ }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* full or blocked */ } }

  // ---------- sizing ----------
  let fxScale = 1;
  function fit() {
    const r = stage.getBoundingClientRect();
    stage.style.fontSize = (r.height / 30) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.round(r.width * dpr); fx.height = Math.round(r.height * dpr); fxScale = dpr;
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  fit();

  // ---------- sound: soft chimes ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  const soundOn = () => save.sound !== false;
  function tone(f, dur, type = 'sine', vol = 0.1, delay = 0) {
    if (!soundOn()) return;
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    tap() { tone(660, 0.06, 'sine', 0.05); },
    coin() { tone(1568, 0.07, 'sine', 0.07); tone(2093, 0.12, 'sine', 0.05, 0.05); },
    bill() { tone(520, 0.06, 'triangle', 0.05); tone(700, 0.06, 'triangle', 0.04, 0.04); },
    right() { tone(784, 0.18, 'triangle', 0.09); tone(1047, 0.25, 'triangle', 0.09, 0.09); tone(1568, 0.3, 'sine', 0.05, 0.18); },
    wrong() { tone(330, 0.14, 'sine', 0.07); tone(262, 0.2, 'sine', 0.06, 0.1); },
    page() { tone(523, 0.08, 'sine', 0.05); tone(659, 0.1, 'sine', 0.04, 0.05); },
    star(i) { tone(880 * Math.pow(1.26, i), 0.3, 'triangle', 0.08); },
    fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, 'triangle', 0.08, i * 0.12)); },
    cash() { [1319, 1568, 2093].forEach((f, i) => tone(f, 0.12, 'sine', 0.06, i * 0.06)); },
    night() { [392, 330, 262].forEach((f, i) => tone(f, 0.5, 'sine', 0.05, i * 0.25)); },
  };

  // ---------- reading aloud ----------
  const deco = document.createElement('textarea');
  // emoji are pictures, not words: the voice would say "bicycle" right before "bike", so they are left out
  let EMOJI;
  try { EMOJI = new RegExp('[\\p{Extended_Pictographic}\\u{1F3FB}-\\u{1F3FF}\\u200D\\uFE0F\\u20E3]', 'gu'); }
  catch (e) { EMOJI = /[←-⯿️‍]|[\uD83C-\uD83E][\uDC00-\uDFFF]/g; }
  function sayOf(html) {
    let s = String(html).replace(/<svg[\s\S]*?<\/svg>/g, ' ').replace(/<br\s*\/?>/g, '. ').replace(/<[^>]+>/g, '');
    deco.innerHTML = s; s = deco.value;
    s = sayMoney(s).replace(EMOJI, ' ')
      .replace(/grown-up/gi, 'grown up')                                        // "GROWN-UPS" was read "grown U P S"
      .replace(/\b[A-Z][A-Z']+\b/g, (w) => (/^ETFS?$/.test(w) ? w : w.toLowerCase()));   // all-caps words are words, not letters
    return s.replace(/×/g, ' times ').replace(/÷/g, ' divided by ').replace(/−/g, ' minus ').replace(/=/g, ' equals ').replace(/\+/g, ' plus ')
      .replace(/%/g, ' percent').replace(/→/g, ' then ').replace(/[▶◀✔✅⭐★]/g, '').replace(/\s+/g, ' ').trim();
  }
  const grade = () => GRADES[save.grade == null ? 1 : save.grade];
  function readOn() { return save.read === true; }   // the voice is OFF until a kid turns READ TO ME on (Matt's call)
  function say(html, force) {
    if (!soundOn()) return;
    if (!force && !readOn()) return;
    const text = sayOf(html); if (!text) return;
    try {
      if (window.MickleVoice && MickleVoice.can) { MickleVoice.cancel(); MickleVoice.speak(text, { rate: 0.95, pitch: 1.15 }); return; }
      if (!('speechSynthesis' in window)) return;
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text); u.rate = 0.92; u.pitch = 1.15; u.lang = 'en-US'; speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }
  function hush() { try { if (window.MickleVoice) MickleVoice.cancel(); else if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* */ } }

  // ---------- Penny the piggy bank ----------
  function pennySVG(cls = '') {
    return `<svg class="penny ${cls}" viewBox="-70 -62 140 126" aria-hidden="true">
      <ellipse cx="0" cy="58" rx="44" ry="5" fill="rgba(15,59,74,.18)"/>
      <path d="M50 8 q14 -4 10 8 q-4 8 -10 0" fill="none" stroke="#db2777" stroke-width="3.5" stroke-linecap="round"/>
      <rect x="-36" y="34" width="13" height="22" rx="5" fill="#ec4899"/><rect x="23" y="34" width="13" height="22" rx="5" fill="#ec4899"/>
      <rect x="-18" y="38" width="12" height="19" rx="5" fill="#f472b6"/><rect x="6" y="38" width="12" height="19" rx="5" fill="#f472b6"/>
      <path d="M-40 -30 L-30 -58 L-14 -38 Z" fill="#f472b6" stroke="#db2777" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M40 -30 L30 -58 L14 -38 Z" fill="#f472b6" stroke="#db2777" stroke-width="2.5" stroke-linejoin="round"/>
      <ellipse cx="0" cy="4" rx="54" ry="44" fill="#f9a8d4" stroke="#db2777" stroke-width="2.5"/>
      <ellipse cx="-18" cy="-20" rx="20" ry="10" fill="#fff" opacity=".35" transform="rotate(-20 -18 -20)"/>
      <rect x="-13" y="-41" width="26" height="6" rx="3" fill="#831843"/>
      <circle cx="-18" cy="-8" r="6" fill="#1e293b"/><circle cx="18" cy="-8" r="6" fill="#1e293b"/>
      <circle cx="-16" cy="-10" r="2.2" fill="#fff"/><circle cx="20" cy="-10" r="2.2" fill="#fff"/>
      <ellipse cx="-32" cy="8" rx="7" ry="4" fill="#f472b6" opacity=".6"/><ellipse cx="32" cy="8" rx="7" ry="4" fill="#f472b6" opacity=".6"/>
      <ellipse cx="0" cy="12" rx="17" ry="12" fill="#f472b6" stroke="#db2777" stroke-width="2"/>
      <ellipse cx="-6" cy="12" rx="3" ry="4.5" fill="#9d174d"/><ellipse cx="6" cy="12" rx="3" ry="4.5" fill="#9d174d"/>
      <path d="M-9 29 q9 7 18 0" stroke="#9d174d" stroke-width="2.5" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  // ---------- 3D town ----------
  const LABELS = {
    home: '<span class="e">🏠</span>HOME', school: '<span class="e">🏫</span>MONEY SCHOOL', shop: '<span class="e">🏪</span>SHOP', bank: '<span class="e">🏦</span>BANK',
    toys: '<span class="e">🛍️</span>WONDER SHOP', credit: '<span class="e">💳</span>CREDIT CORNER', market: '<span class="e">📈</span>MARKET STREET',
    park: '<span class="e">🌳</span>PARK',
  };
  let town = null;
  try {
    town = window.CoinTown3D.init(document.getElementById('view'), signsEl, { labels: LABELS, onPick: (id) => { if (cur.name === 'town') { audio(); act('go', { dataset: { b: id } }); } } });
  } catch (e) {
    // no WebGL: plain signs in a row so the game still works
    town = { focus() {}, showLabels(on) { signsEl.style.display = on ? '' : 'none'; }, setGifts() {}, setOwned() {}, setHome() {}, setNight() {}, sparkle() {}, labels: {} };
    signsEl.style.cssText = 'display:flex;flex-wrap:wrap;gap:.6em;align-items:center;justify-content:center;padding:6em 2em;background:linear-gradient(#a6e3ff,#8fd16a)';
    for (const id in LABELS) { const b = document.createElement('button'); b.className = 'sign nav'; b.style.position = 'relative'; b.dataset.act = 'go'; b.dataset.b = id; b.innerHTML = LABELS[id]; signsEl.appendChild(b); }
  }
  function syncTown() {
    town.setGifts(save.gifts);
    town.setOwned(save.owned.map((id) => (TOYS.find((t) => t.id === id) || {}).e).filter(Boolean));
    town.setHome(save.home || []);
  }

  // ---------- state + helpers ----------
  let cur = { name: 'title' };
  const total = () => save.wallet + save.bank;
  const goalToy = () => TOYS.find((t) => t.id === save.goal);
  const starKey = (id) => grade().n + ':' + id;
  const topicStars = (id) => save.stars[starKey(id)] || 0;
  const starStr = (n, of = 3) => Array.from({ length: of }, (_, i) => (i < n ? '★' : '<span class="off">★</span>')).join('');
  const speakBtn = () => `<button class="icon-btn nav" data-act="speak" aria-label="Read it to me">🔊</button>`;
  const extraChips = () => (save.credit && save.credit.loan ? `<span class="chip owe">💳 ${fmt(save.credit.loan.bal)}</span>` : '') +
    (save.market && Object.keys(save.market.held).length ? `<span class="chip">📈 ${fmt(holdings())}</span>` : '');
  // a drawn wallet icon (there is no wallet emoji -- 👛 is a purse): brown fold-over wallet with a bill peeking out
  const WALLET = '<svg class="wal" viewBox="0 0 24 20" aria-label="wallet"><rect x="3" y="1.5" width="14" height="7" rx="1" fill="#86c98a" stroke="#2f5d3a" stroke-width=".8"/><text x="10" y="7" font-size="5" text-anchor="middle" fill="#2f5d3a" font-weight="900">$</text>' +
    '<rect x="1" y="5" width="22" height="14" rx="2.5" fill="#9a5b2e" stroke="#5e3416" stroke-width="1"/><rect x="2.6" y="6.6" width="18.8" height="10.8" rx="1.6" fill="none" stroke="#c98a55" stroke-width=".7" stroke-dasharray="1.2 .8"/>' +
    '<path d="M14 9.5 h9 v6 h-9 a3 3 0 0 1 0 -6 z" fill="#7a4420" stroke="#5e3416" stroke-width=".8"/><circle cx="15.2" cy="12.5" r="1.3" fill="#f2c14e"/></svg>';
  const moneyChips = () => `<span class="chip">${WALLET} ${fmt(save.wallet)}</span><span class="chip">🏦 ${fmt(save.bank)}</span>`;
  const CHEERS = ['Great job!', 'You got it!', 'Super!', 'Nice thinking!', 'Awesome!', 'Way to go!'];
  const cheer = () => pick(CHEERS);

  function show(html, focusSel) {
    hush();
    ui.innerHTML = html;
    const first = (focusSel && ui.querySelector(focusSel)) || ui.querySelector('[data-default]') || ui.querySelector('.nav');
    setFocus(document.body.classList.contains('navmode') ? first : null);
    if (!document.body.classList.contains('navmode')) focused = first;
  }
  function panel(building, title, right, body, backLabel = 'TOWN', backAct = 'town') {
    town.showLabels(false);
    town.focus(building);
    const again = !!ui.querySelector(`.panel[data-b="${building}"]`);
    return `<div class="shade"></div><div class="panel glass${again ? '' : ' rise'}" data-b="${building}">
      <div class="phead"><button class="pill nav" data-act="${backAct}"${backAct ? '' : ' style="visibility:hidden"'}>◀ ${backLabel}</button><div class="tt">${title}</div><div class="tr">${right}</div></div>
      <div class="pbody">${body}</div></div>`;
  }
  function popup(el, text, color) {
    if (!el) return;
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const p = document.createElement('div'); p.className = 'popup'; p.textContent = text; if (color) p.style.color = color;
    p.style.left = (r.left + r.width / 2 - s.left) + 'px'; p.style.top = (r.top - s.top - 10) + 'px';
    stage.appendChild(p); setTimeout(() => p.remove(), 1200);
  }
  function earn(id) {
    if (save.badges[id]) return null;
    save.badges[id] = save.week; store();
    return BADGES.find((b) => b.id === id);
  }
  const badgeHtml = (b) => `<div class="badge-new rise"><span class="e">${b.e}</span><div><b>NEW BADGE: ${b.name}!</b><span>${b.tip}</span></div></div>`;
  function checkScholar() {
    if (TOPICS.every((t) => topicStars(t.id) > 0)) return earn('scholar');
    return null;
  }

  // ---------- TITLE ----------
  function goTitle() {
    cur = { name: 'title' };
    town.showLabels(false); town.focus(null);
    const btns = GRADES.map((g) => `<button class="grade nav" data-act="grade" data-g="${g.n}" style="--c:${g.c}"${save.grade === g.n ? ' data-default' : ''}><b>${g.short}</b><span>${g.blurb}</span></button>`).join('');
    const ro = readOn() ? 'ON' : 'OFF';
    show(`<div class="title-scr">
      <div class="logo-row rise">${pennySVG()}<div><h1 class="logo">COIN<br>TOWN</h1><p>Earn it. Save it. Grow it!</p></div></div>
      <div class="grades rise" style="animation-delay:.1s">${btns}</div>
      <div class="title-row"><button class="pill nav" data-act="howto">? HOW TO PLAY</button><button class="pill nav" data-act="read">🗣️ READ TO ME: ${ro}</button><button class="pill nav" data-act="sound">${soundOn() ? '🔊 SOUND: ON' : '🔇 SOUND: OFF'}</button></div>
    </div>`);
  }

  // ---------- TOWN ----------
  function townTip() {
    const g = goalToy();
    if (save.shifts === 0 && !Object.keys(save.stars).length) return 'Hi! I\'m <b>Penny</b>, the piggy bank. Welcome to Coin Town! Tap <b>MONEY SCHOOL</b> to learn about money, or the <b>SHOP</b> to start earning.';
    if (save.shifts === 0) return 'Ready to earn some money? Tap the <b>SHOP</b> to work your first shift!';
    if (save.credit && save.credit.loan) { const L = save.credit.loan; return `You owe <b>${fmt(L.bal)}</b> at Credit Corner. A payment of <b>${fmt(Math.min(L.min, L.bal))}</b> comes out at the end of the week, so keep some money ready!`; }
    if (!g) return 'Pick a <b>goal</b> at the <b>WONDER SHOP</b>, so you know what you are saving for!';
    if (!save.owned.includes(g.id) && total() >= g.price) return `You have enough for your goal, ${g.e} <b>${g.name.toLowerCase()}</b>! Go to the <b>WONDER SHOP</b> to buy it.`;
    if (save.give >= 300 && !Object.keys(save.gifts).length) return 'Your <b>GIVE</b> jar has money in it. Visit the <b>PARK</b> to help the town!';
    if (save.wallet >= 500 && save.bank < save.wallet) return 'You have lots of money in your wallet. Put some in the <b>BANK</b> so it can earn interest!';
    return `Your goal: ${g.e} <b>${g.name.toLowerCase()}</b>. You have <b>${fmt(Math.min(total(), g.price))}</b> of ${fmt(g.price)}. Keep going!`;
  }
  function goTown(tip) {
    cur = { name: 'town' };
    town.showLabels(true); town.focus(null);
    town.setOwned(save.owned.map((id) => (TOYS.find((t) => t.id === id) || {}).e).filter(Boolean));
    const g = goalToy();
    const goal = g ? `<span class="chip">🎯 ${g.e}<span class="goalbar"><i style="width:${Math.min(100, total() / g.price * 100)}%"></i></span></span>` : '';
    for (const id in town.labels) town.labels[id].classList.toggle('new', (id === 'shop' && save.shifts === 0) || (id === 'toys' && save.shifts > 0 && !save.goal));
    const t = tip || townTip();
    show(`<div class="hud"><span class="chip week">📅 WEEK ${save.week}</span>${moneyChips()}<span class="chip">💝 ${fmt(save.give)}</span>${extraChips()}${goal}</div>
      <div class="tip"><button class="nav" data-act="tip" aria-label="Penny's tip">${pennySVG()}</button><div class="bubble glass" id="tipb">${t}</div></div>
      <div class="tbtns"><button class="icon-btn nav" data-act="sound" aria-label="Sound on or off">${soundOn() ? '🔊' : '🔇'}</button><button class="pill nav" data-act="title">${grade().short}</button><button class="go nav" data-act="go" data-b="shop">🏪 WORK A SHIFT</button></div>`, '[data-b="shop"]');
    if (t !== lastTownTip) say(t);       // only read a tip aloud the first time it shows (tap Penny to hear it again)
    lastTownTip = t;
    tuckTip(10000);
  }
  let tipTimer = 0, lastTownTip = '';
  function tuckTip(ms) {
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { const b = document.getElementById('tipb'); if (b && cur.name === 'town') b.classList.add('tuck'); }, ms);
  }
  function toggleTip() {
    const b = document.getElementById('tipb'); if (!b) return;
    if (b.classList.toggle('tuck')) return;
    b.innerHTML = townTip(); say(b.innerHTML, true); tuckTip(12000);
  }

  // ---------- MONEY SCHOOL ----------
  function goSchool(focusId) {
    cur = { name: 'school' };
    const cards = TOPICS.map((t) => `<button class="topic nav" data-act="topic" data-id="${t.id}"${focusId === t.id ? ' data-default' : ''}><span class="i">${t.icon}</span><b>${t.name}</b><span class="st">${starStr(topicStars(t.id))}</span></button>`).join('');
    show(panel('school', '🏫 MONEY SCHOOL', `<span class="chip">${grade().label}</span>`, `<div class="topics">${cards}</div>`));
  }
  function goLesson(id, slide = 0) {
    const t = TOPICS.find((q) => q.id === id), sl = t.lesson(grade().n);
    cur = { name: 'lesson', id, slide, slides: sl };
    const s = sl[slide], last = slide === sl.length - 1;
    const dots = sl.map((_, k) => `<i class="${k <= slide ? 'on' : ''}"></i>`).join('');
    show(panel('school', `${t.icon} ${t.name}`, `<span class="step">LEARN</span><div class="dots">${dots}</div>${speakBtn()}`, `<div class="lesson">
      <div class="vis-card rise">${s.v}</div>
      <div class="talk"><div class="bubble rise" style="animation-delay:.08s">${s.t}</div>
        <div class="prow">${pennySVG()}<div class="btns">${slide ? '<button class="go ghost nav" data-act="prev">◀</button>' : ''}
          <button class="go ${last ? 'gold' : ''} nav" data-act="next" data-default>${last ? 'LET\'S PRACTICE ▶' : 'NEXT ▶'}</button></div></div></div>
    </div>`, 'SCHOOL', 'school'));
    say(s.t);
  }
  function startPractice(id) { cur = { name: 'practice', id, n: 0, first: 0, marks: [], seen: [] }; nextQuestion(); }
  function nextQuestion() {
    if (cur.n >= PRACTICE_N) return finishPractice();
    const t = TOPICS.find((q) => q.id === cur.id);
    let q;
    for (let k = 0; k < 10; k++) { q = t.gen(Math.min(1, 0.85 * cur.n / (PRACTICE_N - 1) + Math.random() * 0.1), grade().n); if (q.answer >= 0 && !cur.seen.includes(q.q + q.vis)) break; }
    cur.seen.push(q.q + q.vis);
    cur.q = q; cur.tries = 0; cur.locked = false;
    const dots = Array.from({ length: PRACTICE_N }, (_, k) => `<i class="${cur.marks[k] || (k === cur.n ? 'on' : '')}"></i>`).join('');
    const plain = sayOf(q.q).length, tcls = plain > 70 ? 'long' : plain > 34 || (q.vis && plain > 26) ? 'mid' : '';
    const answers = q.choices.map((c, k) => `<button class="ans nav${c.startsWith('<svg') ? ' pic' : q.small || c.length > 14 ? ' small' : ''}" data-act="ans" data-k="${k}"><span class="k">${k + 1}</span>${c}</button>`).join('');
    show(panel('school', `${t.icon} ${t.name}`, `<div class="dots">${dots}</div>${speakBtn()}`, `<div class="qs">
      <div class="qmain"><div class="qside"><div class="bubble" id="bub"></div>${pennySVG()}</div>
        <div class="qcard rise"><div class="qtag">PRACTICE ${cur.n + 1} OF ${PRACTICE_N}</div><button class="pill nav" data-act="hint" style="position:absolute;right:.6em;top:.5em;font-size:.9em">💡 HINT</button>
          <div class="qtext ${tcls}">${q.q}</div>${q.vis ? `<div class="qvis">${q.vis}</div>` : ''}</div></div>
      <div class="answers" style="--n:${q.choices.length}">${answers}</div></div>`, 'SCHOOL', 'school'), '.ans');
    say(q.q);
  }
  function bubble(html, withNext) {
    const b = document.getElementById('bub'); if (!b) return;
    b.innerHTML = html + (withNext ? '<button class="go nav" data-act="nextq">NEXT ▶</button>' : '');
    if (withNext) setFocus(b.querySelector('.go'));
  }
  function pennyMood() { const p = ui.querySelector('.qside .penny'); if (!p) return; p.classList.remove('happy'); void p.getBoundingClientRect(); p.classList.add('happy'); }
  function choose(k) {
    if (cur.locked) return;
    const q = cur.q, btns = ui.querySelectorAll('.ans'), btn = btns[k];
    if (!btn || btn.classList.contains('bad')) return;
    if (k === q.answer) {
      cur.locked = true; btn.classList.add('ok'); sfx.right(); burst(btn, 24); pennyMood();
      if (cur.tries === 0) cur.first++;
      cur.marks[cur.n] = cur.tries === 0 ? 'ok' : 'miss';
      const c = cheer(); bubble(`<b>${c}</b><br>${q.why}`, true); say(c + ' ' + q.why);
      cur.n++; return;
    }
    cur.tries++; sfx.wrong(); btn.classList.add('bad');
    if (cur.tries === 1) { bubble(`Not quite. Try again!<br>💡 ${q.hint}`); say(q.hint); setFocus([...btns].find((b) => !b.classList.contains('bad'))); }
    else { cur.locked = true; cur.marks[cur.n] = 'miss'; btns[q.answer].classList.add('show'); bubble(`Here's how: ${q.why}`, true); say(q.why); cur.n++; }
  }
  function finishPractice() {
    const t = TOPICS.find((q) => q.id === cur.id);
    const stars = cur.first >= 6 ? 3 : cur.first >= 4 ? 2 : 1;
    save.stars[starKey(t.id)] = Math.max(topicStars(t.id), stars); store();
    const b = checkScholar();
    const title = stars === 3 ? 'AMAZING!' : stars === 2 ? 'GREAT WORK!' : 'GOOD PRACTICE!';
    const idx = TOPICS.indexOf(t), next = TOPICS[idx + 1];
    cur = { name: 'result', id: t.id };
    const st = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('');
    show(panel('school', `${t.icon} ${t.name}`, '', `<div class="result"><div class="card">${pennySVG()}<h2>${title}</h2><div class="stars">${st}</div>
      <p>${t.icon} <b>${t.name}</b>: ${cur.first === undefined ? '' : ''}${stars === 3 ? 'You really know this one!' : 'Practice again for more stars!'}</p>${b ? badgeHtml(b) : ''}
      <div class="row">${next ? `<button class="go nav" data-act="topic" data-id="${next.id}" data-default>NEXT LESSON ▶</button>` : ''}<button class="go ghost nav" data-act="again" data-id="${t.id}">PRACTICE AGAIN</button><button class="go blue nav" data-act="school">SCHOOL</button></div></div></div>`, 'SCHOOL', 'school'));
    for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 300 + i * 250);
    setTimeout(() => { sfx.fanfare(); confetti(stars * 40 + 30); }, 300 + stars * 250);
    say(title);
  }

  // ---------- SHOP ----------
  const DRAWERS = [[1, 5], [1, 5, 10, 25], [1, 5, 10, 25, 100], [1, 5, 10, 25, 100, 500], [1, 5, 10, 25, 100, 500, 1000], [1, 5, 10, 25, 100, 500, 1000, 2000], [1, 5, 10, 25, 100, 500, 1000, 2000]];
  function goShop() {
    cur = { name: 'shop' };
    const g = grade().n;
    const how = g <= 2 ? 'The till tells you how much change to give. Tap coins in the drawer until it matches!' : 'Work out the change yourself: count up from the price to what the customer paid.';
    show(panel('shop', '🏪 THE SHOP', moneyChips(), `<div class="result"><div class="card glass">
      <div style="font-size:4em;line-height:1">🧑‍🍳🛒</div><h2>WORK A SHIFT</h2>
      <p>Help <b>${SHIFT_N} customers</b>. Each one pays, and you give back the right <b>change</b>.</p>
      <p>${how}</p>
      <p style="color:#15803d">Pay: <b>${fmt(BASE_PAY)}</b> for the shift + <b>${fmt(BONUS_PAY)}</b> for each customer you get right the first time.</p>
      <div class="row"><button class="go nav" data-act="startshift" data-default>START SHIFT ▶</button></div></div></div>`));
    say('Work a shift! Help ' + SHIFT_N + ' customers and give back the right change.');
  }
  function makeCustomer(n) {
    const g = grade().n, d = n / (SHIFT_N - 1);
    const itemFor = (p) => { const band = ITEMS.find((b) => p <= b[1]) || ITEMS[2]; const [e, nm] = pick(band[2]).split(' '); return { e, nm }; };
    let prices = [];
    const round5 = (p) => Math.max(5, Math.round(p / 5) * 5);
    if (g === 0) prices = [R(1, 9)];
    else if (g === 1) prices = [d < 0.5 ? round5(R(5, 95)) : R(5, 95)];
    else if (g === 2) { const k = d > 0.5 && Math.random() < 0.5 ? 2 : 1; for (let i = 0; i < k; i++) prices.push(d < 0.3 ? round5(R(25, 240)) : R(25, 240)); }
    else if (g === 3) { for (let i = 0; i < 2; i++) prices.push(R(40, 480)); }
    else { const k = R(2, 3), top = g === 4 ? 1900 : 1500; for (let i = 0; i < k; i++) prices.push(R(60, Math.round(top / k))); }
    const items = prices.map((p) => Object.assign(itemFor(p), { price: p }));
    if (g === 6) { const it = items[R(0, items.length - 1)]; it.orig = it.price; it.price = Math.round(it.orig * 0.75); }
    const sub = items.reduce((s, it) => s + it.price, 0);
    const taxRate = g === 5 ? 5 : g === 6 ? 8 : 0;
    const tax = Math.round(sub * taxRate / 100);
    const tot = sub + tax;
    let paid;
    if (g === 0) paid = 10;
    else if (g === 1) paid = 100;
    else if (g === 2) paid = tot <= 100 ? 100 : Math.random() < 0.5 ? 500 : Math.ceil(tot / 100) * 100;
    else if (g <= 4) paid = [500, 1000, 2000].find((b) => b >= tot) || 2000;
    else paid = [1000, 2000, 5000].find((b) => b >= tot) || 5000;
    let extra = false;
    if (g === 6 && Math.random() < 0.35 && tot % 100) { const c = tot % 100; if (paid - tot + c >= 100) { paid += c; extra = true; } }
    if (paid === tot) paid += g <= 1 ? (g === 0 ? 5 : 25) : 100;
    return { face: pick(CUSTOMERS), hello: pick(HELLO), items, sub, tax, taxRate, tot, paid, due: paid - tot, extra };
  }
  function startShift() {
    save.shifts++; store();
    cur = { name: 'reg', n: 0, first: 0, fewest: 0, score: 0, marks: [] };
    nextCustomer();
  }
  function nextCustomer() {
    if (cur.n >= SHIFT_N) return endShift();
    cur.c = makeCustomer(cur.n); cur.tray = []; cur.tries = 0; cur.locked = false;
    renderReg();
    say(cur.c.hello);
  }
  function trayTotal() { return cur.tray.reduce((s, v) => s + v, 0); }
  function renderReg(msg) {
    const g = grade().n, c = cur.c;
    const lines = c.items.map((it) => `<div class="ln"><span>${it.e} ${it.nm}</span>${it.orig ? `<span><s>${fmt(it.orig)}</s> <span class="sale">${fmt(it.price)}</span></span>` : `<span>${fmt(it.price)}</span>`}</div>`).join('');
    const extra = (c.items.length > 1 || c.tax ? `<div class="ln"><span>SUBTOTAL</span><span>${fmt(c.sub)}</span></div>` : '') + (c.tax ? `<div class="ln"><span>TAX ${c.taxRate}%</span><span>${fmt(c.tax)}</span></div>` : '') + (c.items.some((it) => it.orig) ? '<div class="ln"><span class="sale">SALE: 25% OFF</span><span></span></div>' : '');
    const showDue = g <= 2;
    const drawer = DRAWERS[g].slice().sort((a, b) => b - a).map((v) => `<button class="slot nav" data-act="put" data-v="${v}">${pieceSVG(v)}<small>${fmt(v)}</small></button>`).join('');
    const shiftDots = Array.from({ length: SHIFT_N }, (_, k) => `<i class="${k < cur.n ? 'on' : ''}">${k < cur.n ? (cur.marks[k] === 'ok' ? '😊' : '🙂') : '🙂'}</i>`).join('');
    show(panel('shop', '🏪 THE SHOP', `<span class="chip">CUSTOMER ${cur.n + 1} OF ${SHIFT_N}</span><div class="shiftdots">${shiftDots}</div>${speakBtn()}`, `<div class="reg">
      <div class="counter">
        <div class="cust"><span class="face">${c.face}</span><div class="bubble" id="custb">${c.extra ? 'I gave you some extra coins so my change is easier!' : c.hello}</div></div>
        <div class="receipt">${lines}${extra}<div class="ln tot"><span>TOTAL</span><span>${fmt(c.tot)}</span></div></div>
      </div>
      <div class="till">
        <div class="rowbox paid"><span class="lab">CUSTOMER<br>PAID</span>${vMoney(greedy(c.paid), { w: 400 }).replace('class="vis"', 'class="pc" style="height:2.6em;width:auto;max-width:60%"')}<span class="val">${fmt(c.paid)}</span></div>
        <div class="rowbox"><span class="lab">CHANGE<br>DUE</span><span style="font-weight:700;color:#64748b">${showDue ? `${fmt(c.paid)} − ${fmt(c.tot)}` : 'How much? Count up!'}</span><span class="val ${showDue ? '' : 'q'}">${showDue ? fmt(c.due) : '?'}</span></div>
        <div class="rowbox tray"><span class="lab">YOU<br>GIVE</span><div class="pcs" id="pcs"></div><span class="val" id="trayv">${fmt(0)}</span></div>
        <div class="drawer">${drawer}</div>
        <div class="msg" id="regmsg">${msg || ''}</div>
        <div class="regbtns"><button class="pill nav" data-act="clear">↺ CLEAR</button><button class="pill nav" data-act="reghint">💡 HINT</button><button class="go nav" data-act="give" id="givebtn">GIVE CHANGE ▶</button></div>
      </div></div>`), '.slot');
    drawTray();
  }
  function drawTray() {
    const p = document.getElementById('pcs'); if (!p) return;
    p.innerHTML = cur.tray.map((v, i) => `<button class="nav" data-act="take" data-i="${i}" aria-label="take back">${pieceSVG(v)}</button>`).join('');
    const tv = document.getElementById('trayv'); if (tv) tv.textContent = fmt(trayTotal());
  }
  function regMsg(html, speak = true) { const m = document.getElementById('regmsg'); if (m) m.innerHTML = html; if (speak) say(html); }
  function putPiece(v) {
    if (cur.locked) return;
    if (cur.tray.length >= 24) return regMsg('That\'s a lot of money! Tap a piece to take it back.');
    cur.tray.push(v); cur.tray.sort((a, b) => b - a);
    (v >= 100 ? sfx.bill : sfx.coin)(); drawTray();
  }
  function takePiece(i) { if (cur.locked) return; cur.tray.splice(i, 1); sfx.tap(); drawTray(); }
  function giveChange() {
    if (cur.locked) return;
    const c = cur.c, t = trayTotal(), g = grade().n;
    if (t === c.due) {
      cur.locked = true;
      const best = greedy(c.due).length, fewest = cur.tray.length === best && c.due > 0;
      if (cur.tries === 0) { cur.first++; cur.marks[cur.n] = 'ok'; cur.score += 100; } else cur.marks[cur.n] = 'miss';
      if (fewest && cur.tries === 0) { cur.fewest++; cur.score += 50; }
      sfx.right(); setTimeout(sfx.cash, 250);
      const cb = document.getElementById('custb'); if (cb) cb.textContent = pick(THANKS);
      const face = ui.querySelector('.cust .face'); if (face) burst(face, 30);
      if (cur.tries === 0) popup(document.getElementById('givebtn'), '+' + fmt(BONUS_PAY));
      const txt = `<b>${cheer()}</b> ${fmt(c.due)} is right.${fewest && g >= 2 ? ' ⭐ Fewest coins!' : ''}`;
      regMsg(txt);
      replaceGive('NEXT CUSTOMER ▶');
      cur.n++;
      return;
    }
    cur.tries++; sfx.wrong();
    const tray = ui.querySelector('.tray'); if (tray) { tray.style.animation = 'none'; void tray.offsetWidth; tray.style.animation = 'shake .4s'; }
    if (cur.tries === 1) {
      const dir = t < c.due ? 'That\'s not enough yet.' : 'That\'s too much.';
      regMsg(g <= 2 ? `${dir} You need <b>${fmt(c.due)}</b> and you have ${fmt(t)}.` : `Not quite! ${dir} Count up from ${fmt(c.tot)} to ${fmt(c.paid)}.`);
      return;
    }
    // second miss: show how
    cur.locked = true; cur.marks[cur.n] = 'miss';
    cur.tray = greedy(c.due); drawTray();
    regMsg(`Here's how: ${countUp(c.tot, c.paid)}. Change: <b>${fmt(c.due)}</b>.`);
    replaceGive('NEXT CUSTOMER ▶');
    cur.n++;
  }
  function replaceGive(label) {
    const b = document.getElementById('givebtn'); if (!b) return;
    b.textContent = label; b.dataset.act = 'nextcust'; setFocus(b);
  }
  function regHint() {
    const c = cur.c;
    const steps = countUp(c.tot, c.paid).split(', ');
    regMsg(grade().n <= 2 ? `💡 Change = paid − total = ${fmt(c.paid)} − ${fmt(c.tot)}. Start with the biggest coin that fits!` : `💡 Count up: ${steps.slice(0, 2).join(', ')} ...`);
  }
  function endShift() {
    const pay = BASE_PAY + BONUS_PAY * cur.first;
    const g = grade();
    const perfect = cur.first === SHIFT_N;
    const b = perfect ? earn('cashier') : null;
    const key = 'g' + g.n; const newBest = cur.score > (save.best[key] || 0);
    save.best[key] = Math.max(save.best[key] || 0, cur.score); store();
    if (cur.score > 0 && window.MickleScores) MickleScores.record('coin-town', cur.score, { category: g.label, order: g.n });
    const res = { first: cur.first, fewest: cur.fewest, score: cur.score, pay };
    cur = { name: 'shiftend', pay };
    show(panel('shop', '🏪 SHIFT OVER!', '', `<div class="result"><div class="card glass">${pennySVG()}<h2>${perfect ? 'PERFECT SHIFT!' : 'GREAT WORK!'}</h2>
      <p>${res.first} of ${SHIFT_N} customers right the first time${res.fewest && g.n >= 2 ? ` · ⭐ ${res.fewest} with the fewest coins` : ''}</p>
      <p>Shop score: <b>${res.score}</b>${newBest ? ' · <b style="color:#16a34a">NEW BEST!</b>' : ''}</p>
      <div class="money-big">💵 ${fmt(pay)}</div><p>That's your pay for this week!</p>${b ? badgeHtml(b) : ''}
      <div class="row"><button class="go gold nav" data-act="payday" data-default>GO TO PAYDAY ▶</button></div></div></div>`, 'TOWN', null));
    sfx.fanfare(); confetti(80);
    say(`Shift over! You earned ${fmt(pay)}. Let's go to payday.`);
  }

  // ---------- PAYDAY: split into jars ----------
  function goPayday(pay) {
    cur = { name: 'payday', pay, left: pay / 100, jars: { spend: 0, save: 0, give: 0 }, firstJar: null };
    town.focus('bank');
    renderPayday();
    say('Payday! Tap a jar to put each dollar in it. Smart savers put money in the SAVE jar first!');
  }
  function renderPayday(focusSel) {
    const p = cur;
    const pile = Array.from({ length: p.left }, (_, i) => `<span style="animation-delay:${i * 0.03}s">${pieceSVG(100)}</span>`).join('');
    const jar = (id, e, name, about) => {
      const amt = p.jars[id] * 100, h = Math.min(100, (p.jars[id] / (p.pay / 100)) * 100);
      return `<div class="jar ${id}"><div class="fillj" style="height:${h}%"></div><span class="e">${e}</span><b>${name}</b><span class="amt">${fmt(amt)}</span><small>${about}</small>
        <div class="jbtns"><button class="nav" data-act="unjar" data-j="${id}" aria-label="take one out"${p.jars[id] ? '' : ' disabled'}>−</button><button class="plus nav" data-act="jar" data-j="${id}" aria-label="put one in"${p.left ? '' : ' disabled'}>+</button></div></div>`;
    };
    const half = Math.ceil(p.pay / 200);
    const tip = p.left ? (p.firstJar === null ? 'Smart savers <b>pay themselves first</b>: put money in the SAVE jar before you spend!' : `${p.left} dollar${p.left === 1 ? '' : 's'} left to sort. Try saving at least <b>${fmt(half * 100)}</b> (half).`)
      : p.jars.save >= half ? '🐷 Wonderful! You saved half or more!' : 'All sorted! Next time, try saving a bit more.';
    const bills = billTotal(save.week);
    const billTip = bills ? `<br>📬 Bills coming this week: <b>${fmt(bills)}</b>. ${p.jars.spend * 100 + save.wallet >= bills ? 'Your wallet has enough for them. 👍' : 'Keep at least that much in SPEND!'}` : '';
    show(panel('bank', `💵 PAYDAY! You earned ${fmt(p.pay)}`, `<button class="pill nav" data-act="plan">🐷 PENNY'S PLAN</button>${speakBtn()}`, `<div class="pay">
      <div class="pile" id="pile">${pile || '<b style="color:#15803d;font-size:1.3em">✔ Every dollar has a job!</b>'}</div>
      <div class="jars">${jar('spend', WALLET, 'SPEND', 'For treats and toys now')}${jar('save', '🏦', 'SAVE', 'Goes in the bank and earns interest')}${jar('give', '💝', 'GIVE', 'To help the town at the Park')}</div>
      <div class="paytip">${tip}${billTip}</div>
      <button class="go nav" data-act="payok"${p.left ? ' disabled' : ' data-default'}>DONE ▶</button>
    </div>`, 'TOWN', null), focusSel || (p.left ? '[data-act="jar"][data-j="save"]' : '[data-act="payok"]'));
  }
  function jarPut(j, dir) {
    const p = cur;
    if (dir > 0) { if (!p.left) return; p.left--; p.jars[j]++; if (p.firstJar === null) p.firstJar = j; sfx.bill(); }
    else { if (!p.jars[j]) return; p.jars[j]--; p.left++; sfx.tap(); }
    renderPayday(`[data-act="${dir > 0 ? 'jar' : 'unjar'}"][data-j="${j}"]`);
    if (!p.left) say(ui.querySelector('.paytip').innerHTML);
  }
  function pennysPlan() {
    const p = cur, n = p.pay / 100;
    const sv = Math.ceil(n / 2), gv = n >= 5 ? 1 : 0;
    p.jars = { save: sv, give: gv, spend: n - sv - gv }; p.left = 0; p.firstJar = p.firstJar || 'save';
    sfx.cash(); renderPayday();
    say(`Penny's plan: save half, give a little, and spend the rest. ${fmt(sv * 100)} to save, ${fmt(gv * 100)} to give, ${fmt((n - sv - gv) * 100)} to spend.`, true);
  }
  function payDone() {
    const p = cur;
    save.wallet += p.jars.spend * 100; save.bank += p.jars.save * 100; save.give += p.jars.give * 100;
    const earned = [];
    if (p.jars.save * 2 >= p.pay / 100) { const b = earn('saver'); if (b) earned.push(b); }
    save.saveStreak = p.jars.save > 0 ? save.saveStreak + 1 : 0;
    if (save.saveStreak >= 4) { const b = earn('steady'); if (b) earned.push(b); }
    store();
    town.sparkle('bank'); if (p.jars.give) town.sparkle('park', 6);
    endWeek(earned);
  }

  // ---------- END OF THE WEEK ----------
  const SURPRISES = [['🚲', 'Your bike tire went flat!', 'Fixing it costs', 300], ['📚', 'Oops! A library book got wet.', 'The fee is', 200], ['👟', 'Your shoes are too small!', 'New ones cost', 500],
    ['🦷', 'Time for a new toothbrush and toothpaste.', 'They cost', 200], ['☂️', 'Your umbrella broke in the wind!', 'A new one costs', 300], ['🎒', 'Your backpack ripped!', 'Fixing it costs', 400]];
  const TREATS = [['🍦', 'The ice cream truck is here!', 200], ['🎟️', 'The fair is in town! A ride ticket costs', 300], ['🍭', 'The candy shop has giant lollipops.', 100],
    ['📕', 'A new comic book just came out!', 300], ['🕹️', 'The arcade has a new game.', 200], ['🧸', 'A cute plush toy at the corner store!', 400]];
  function endWeek(earned) {
    hush();
    cur = { name: 'week', queue: [], earned };
    town.showLabels(false); town.focus(null); town.setNight(true); sfx.night();
    ui.innerHTML = '';
    const g = grade().n;
    // one week of interest at the yearly rate; fractions of a cent carry over to next week, like a real bank's daily interest
    const owed = save.bank > 0 ? save.bank * RATE / WEEKS + (save.intCarry || 0) : 0;
    const interest = Math.floor(owed);
    save.intCarry = owed - interest;
    const yearly = Math.round(save.bank * RATE);
    save.bank += interest; save.interestTotal += interest;
    save.hist.push({ w: save.week, bank: save.bank, i: interest }); if (save.hist.length > 30) save.hist.shift();
    if (save.interestTotal >= 10) { const b = earn('grower'); if (b) earned.push(b); }
    store();
    const q = cur.queue;
    q.push(() => weekCard('🌙', `WEEK ${save.week} IS OVER`, save.bank > 0
      ? `The bank added <b>${interest ? fmt(interest) : 'a tiny bit less than 1¢'}</b> of interest this week. ${RATE * 100}% a year means about <b>${fmt(Math.max(1, yearly))}</b> in a whole year on your ${fmt(save.bank)}. Interest is slow, so saving for a <b>long</b> time is what makes it grow!`
      : 'Your bank account is empty, so it earned no interest this week. Money you SAVE grows a little every week!',
      `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, interest ? '' : 'Grown-ups say: "Pay yourself first." Even a little bit counts!'));
    const lc = loanWeek(); if (lc) q.push(() => weekCard(lc.e, lc.title, lc.text, `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, lc.grown));
    const mc = marketWeek(); if (mc) q.push(() => weekCard(mc.e, mc.title, mc.text, `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, mc.grown));
    if (billsFor(save.week).length) q.push(billCard);
    const r = Math.random();
    if (save.week >= 2 && r < 0.3) q.push(surpriseCard);
    else if (r < 0.75) { const t = pick(TREATS); if (save.wallet >= t[2]) q.push(() => treatCard(t)); }
    else if (r < 0.88) q.push(giftCard);
    nextWeekCard();
  }
  function nextWeekCard() {
    const f = cur.queue.shift();
    if (f) { setTimeout(f, cur.started ? 0 : 900); cur.started = true; return; }
    // badges, then morning
    const b = cur.earned.shift();
    if (b) { weekCard(b.e, 'NEW BADGE: ' + b.name + '!', b.how + '.', `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, b.tip); sfx.fanfare(); confetti(60); return; }
    save.week++; store();
    town.setNight(false);
    setTimeout(() => goTown(`Good morning! It's <b>week ${save.week}</b>. ${townTip()}`), 700);
  }
  function weekCard(e, title, text, btns, grown) {
    show(`<div class="wcard glass rise"><span class="e">${e}</span><h2>${title}</h2><p>${text}</p>${grown ? `<p class="grown">👩‍💼 ${grown}</p>` : ''}<div class="row">${btns}</div></div>`);
    say(title + '. ' + text);
  }
  // ---------- weekly household bills (from week 2): small, regular NEEDS from friendly Coin Town companies ----------
  // Electric every week; water / trash / internet take turns every other week. Solar panels make the electric bill $0.
  const BILLS = {
    electric: { e: '⚡', co: 'ZIPPY ELECTRIC', why: 'Your lights, fridge and TV used lots of zaps!' },
    water: { e: '💧', co: 'SPLASHY WATER', why: 'Splish splash! Baths, drinks and tooth brushing.' },
    trash: { e: '🗑️', co: 'ROCKY\'S TRASH PICKUP', why: 'Rocky the garbage truck took your trash away. Beep beep!' },
    internet: { e: '📶', co: 'WIGGLEWEB INTERNET', why: 'Your internet zoomed along all week.' },
  };
  const BILL_AMT = 100;
  function billsFor(week) {
    if (week < 2) return [];
    const out = [{ id: 'electric', amt: (save.home || []).includes('solar') ? 0 : BILL_AMT }];
    if (week % 2 === 0) out.push({ id: ['water', 'trash', 'internet'][(week / 2) % 3], amt: BILL_AMT });
    return out;
  }
  const billTotal = (week) => billsFor(week).reduce((s, b) => s + b.amt, 0);
  function billCard() {
    const list = billsFor(save.week), tot = billTotal(save.week);
    const solar = (save.home || []).includes('solar');
    const rows = list.map((b) => { const B = BILLS[b.id]; return `<div class="bill-ln"><span class="be">${B.e}</span><div><b>${B.co}</b><small>${b.id === 'electric' && solar ? '☀️ Your solar panels made all your power!' : B.why}</small></div><span class="ba">${b.amt ? fmt(b.amt) : 'FREE'}</span></div>`; }).join('');
    cur.billTot = tot;
    show(`<div class="wcard glass rise billcard"><span class="e">📬</span><h2>BILLS ARE HERE!</h2>
      <div class="invoice">${rows}<div class="bill-ln tot"><span></span><b>TOTAL</b><span class="ba">${fmt(tot)}</span></div><div class="stamp" id="stamp">PAID</div></div>
      <p class="grown">👩‍💼 Bills are <b>needs</b>. Grown-ups pay their bills first, then save, then spend on fun.</p>
      <div class="row"><button class="go blue nav" data-act="paybills" data-default>${tot ? 'PAY ' + fmt(tot) : 'NOTHING TO PAY! ✔'}</button></div></div>`);
    say(`Bills are here! The total is ${fmt(tot)}.`);
  }
  function payBills() {
    const tot = cur.billTot || 0; let msg = '';
    if (save.wallet >= tot) save.wallet -= tot;
    else if (total() >= tot) { const fromBank = tot - save.wallet; save.wallet = 0; save.bank -= fromBank; msg = `Your wallet was short, so ${fmt(fromBank)} came from savings. Tip: on payday, keep some money in SPEND for bills!`; }
    else { save.wallet = 0; save.bank = 0; msg = 'You didn\'t have enough, so Penny helped this time. Tip: on payday, keep some money in SPEND for bills!'; }
    if ((save.home || []).includes('solar') && save.week >= 2) save.solarSaved = (save.solarSaved || 0) + BILL_AMT;
    store(); sfx.cash();
    const st = document.getElementById('stamp'); if (st) st.classList.add('on');
    const solarNote = (save.home || []).includes('solar') ? ` ☀️ Solar has saved you ${fmt(save.solarSaved)} of the ${fmt(3000)} it cost${save.solarSaved >= 3000 ? ': it paid for itself!' : '.'}` : '';
    const card = ui.querySelector('.billcard');
    if (card) {
      const p = card.querySelector('.grown'); if (p && (msg || solarNote)) p.innerHTML = (msg ? '💡 ' + msg : '') + solarNote;
      const b = card.querySelector('[data-act="paybills"]'); if (b) { b.textContent = 'NEXT ▶'; b.dataset.act = 'wnext'; b.className = 'go nav'; setFocus(b); }
    }
  }
  function surpriseCard() {
    const [e, what, costWord, cost] = pick(SURPRISES);
    cur.surprise = cost;
    weekCard(e, 'SURPRISE!', `${what} ${costWord} <b>${fmt(cost)}</b>. This is a <b>need</b>, so it has to be paid.`, `<button class="go blue nav" data-act="paysurprise" data-default>PAY ${fmt(cost)}</button>`);
  }
  function paySurprise() {
    const cost = cur.surprise; let msg, grown = '';
    if (save.wallet >= cost) { save.wallet -= cost; msg = `You paid ${fmt(cost)} from your wallet.`; grown = 'Surprises happen to everyone. Keeping some savings ready makes them less scary.'; }
    else if (total() >= cost) {
      const fromBank = cost - save.wallet; save.wallet = 0; save.bank -= fromBank;
      msg = `Your wallet didn't have enough, so <b>${fmt(fromBank)}</b> came from your savings. Good thing you saved!`;
      const b = earn('rainy'); if (b) cur.earned.push(b);
    } else {
      const short = cost - total(); save.wallet = 0; save.bank = 0;
      msg = `You didn't have enough saved. Penny covered the last <b>${fmt(short)}</b> this time.`;
      grown = 'This is why grown-ups keep a rainy-day fund: savings for surprises.';
    }
    store(); sfx.coin();
    weekCard('☂️', 'PAID!', msg, `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, grown);
  }
  function treatCard(t) {
    cur.treat = t;
    weekCard(t[0], 'A TREAT?', `${t[1]} It costs <b>${fmt(t[2])}</b>. You have ${fmt(save.wallet)} in your wallet.`,
      `<button class="go pink nav" data-act="treat" data-y="1">BUY IT (${fmt(t[2])})</button><button class="go nav" data-act="treat" data-y="0" data-default>NO THANKS, I'M SAVING</button>`);
  }
  function treat(yes) {
    const t = cur.treat;
    if (yes) { save.wallet -= t[2]; store(); sfx.coin(); weekCard(t[0], 'YUM!', 'Treats are part of life. Enjoy it! Just remember: a treat now means less money for your goal.', `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, 'Grown-ups plan a little "fun money" so treats don\'t surprise their budget.'); }
    else { const b = earn('think'); if (b) cur.earned.push(b); sfx.right(); weekCard('🤔', 'GREAT CHOICE!', `You kept your ${fmt(t[2])}. That money can go toward your goal!`, `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, 'Waiting before you buy is a super habit. Lots of "wants" disappear after a day!'); }
  }
  function giftCard() {
    const amt = pick([100, 200, 300]);
    cur.gift = amt;
    weekCard('🎁', 'A GIFT!', `Your grandma sent you <b>${fmt(amt)}</b> in a card! Where should it go?`,
      `<button class="go blue nav" data-act="gift" data-to="wallet">${WALLET} WALLET</button><button class="go nav" data-act="gift" data-to="bank" data-default>🏦 SAVE IT</button>`);
  }
  function gift(to) {
    save[to] += cur.gift; store(); sfx.cash();
    weekCard(to === 'bank' ? '🏦' : WALLET, 'THANK YOU, GRANDMA!', to === 'bank' ? 'Into the bank it goes! Now it can earn interest.' : 'It\'s in your wallet. Spend it wisely!', `<button class="go nav" data-act="wnext" data-default>NEXT ▶</button>`, 'When grown-ups get surprise money, many save at least part of it.');
  }

  // ---------- BANK ----------
  // SAVINGS TIME MACHINE: project the balance forward with compound interest, next to simple interest
  // (interest taken out, not reinvested) and plain deposits, so the growing gap shows "interest on interest".
  function project(start, add, years) {
    // real time: deposit `add` every week and add a week of interest (RATE / 52) every week; plot one point a year
    const comp = [start], simp = [start], dep = [start];
    let b = start, p = start, si = 0;
    for (let w = 1; w <= years * WEEKS; w++) {
      b = (b + add) * (1 + RATE / WEEKS);     // payday deposit, then the week's interest (same order as the game)
      p += add; si += p * RATE / WEEKS;       // simple: interest only on the money you put in
      if (w % WEEKS === 0) { comp.push(b); simp.push(p + si); dep.push(p); }
    }
    return { comp, simp, dep };
  }
  function timeChart(pr, years) {
    const W = 320, H = 100, L = 30, R = 30, T = 9, B = 13;
    const top = Math.max(...pr.comp) * 1.08 || 100;
    const X = (i) => L + i / years * (W - L - R), Y = (v) => T + (1 - v / top) * (H - T - B);
    const line = (a) => a.map((v, i) => `${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
    let s = `<svg class="tmchart" viewBox="0 0 ${W} ${H}">`;
    for (const f of [0, 0.5, 1]) { const v = top * f, y = Y(v); s += `<line x1="${L}" x2="${W - R}" y1="${y}" y2="${y}" stroke="#e2e8f0" stroke-width=".5"/><text x="${L - 2}" y="${y + 2}" text-anchor="end" font-size="6" fill="#64748b">${fmt(Math.round(v / 100) * 100)}</text>`; }
    for (const i of [0, years / 2, years]) s += `<text x="${X(i)}" y="${H - 5}" text-anchor="middle" font-size="6" fill="#64748b">${i === 0 ? 'NOW' : i + ' YRS'}</text>`;
    s += `<polygon points="${X(0)},${Y(0)} ${line(pr.comp)} ${X(years)},${Y(0)}" fill="rgba(74,222,128,.18)"/>`;
    s += `<polyline points="${line(pr.dep)}" fill="none" stroke="#94a3b8" stroke-width="1.2"/>`;
    s += `<polyline points="${line(pr.simp)}" fill="none" stroke="#f59e0b" stroke-width="1.4" stroke-dasharray="3 2"/>`;
    s += `<polyline points="${line(pr.comp)}" fill="none" stroke="#16a34a" stroke-width="2.2" stroke-linejoin="round"/>`;
    const e = pr.comp[years];
    s += `<circle cx="${X(years)}" cy="${Y(e)}" r="2.2" fill="#16a34a"/><text x="${X(years) - 3}" y="${Y(e) - 4}" text-anchor="end" font-size="7" font-weight="900" fill="#166534">${fmt(Math.round(e))}</text>`;
    return s + '</svg>';
  }
  function goBank(msg) {
    const keep = cur.name === 'bank' ? cur : {};
    cur = { name: 'bank', years: keep.years || 10, add: keep.add != null ? keep.add : 0 };
    const g = grade().n, years = cur.years, add = cur.add;
    const example = save.bank <= 0 && !add;
    const start = example ? 1000 : save.bank;
    const p30 = project(start, add, 30), pr = { comp: p30.comp.slice(0, years + 1), simp: p30.simp.slice(0, years + 1), dep: p30.dep.slice(0, years + 1) };
    const c = Math.round(pr.comp[years]), s = Math.round(pr.simp[years]), d = Math.round(pr.dep[years]);
    const yb = (v) => `<button class="tab nav${years === v ? ' on' : ''}" data-act="byears" data-v="${v}">${v} YRS</button>`;
    const ab = (v) => `<button class="tab nav${add === v ? ' on' : ''}" data-act="badd" data-v="${v}">${v ? '+' + fmt(v) : '$0'}</button>`;
    const lesson = g <= 2
      ? `Your money earns interest, then the <b>interest earns interest too</b>! 🐢 It's slow, so start early.`
      : `<b>Compound interest</b>: you earn ${RATE * 100}% a year on your money <b>and</b> on old interest. 🐢 It's slow at first, so start early!`;
    const result = `${example ? 'Example with $10' : `Your ${fmt(start)}`}${add ? ` + ${fmt(add)} a week` : ''}: in ${years} years <b>${fmt(c)}</b>. Interest on interest: <b class="g">${fmt(c - s)}</b>`;
    show(panel('bank', '🏦 COIN TOWN BANK', moneyChips(), `<div class="bank">
      <div class="bal">
        <div class="card2"><div class="lab">YOUR SAVINGS</div><div class="big-n">${fmt(save.bank)}</div><div class="lab" style="margin-top:.3em">INTEREST EARNED SO FAR: <span style="color:#b45309">${fmt(save.interestTotal)}</span></div></div>
        <div class="card2"><div class="lab">PUT IN (from wallet ${fmt(save.wallet)})</div><div class="btnrow" style="margin-top:.35em">
          <button class="go sm nav" data-act="dep" data-v="100"${save.wallet >= 100 ? '' : ' disabled'}>+$1</button><button class="go sm nav" data-act="dep" data-v="500"${save.wallet >= 500 ? '' : ' disabled'}>+$5</button><button class="go sm nav" data-act="dep" data-v="all"${save.wallet > 0 ? '' : ' disabled'}>ALL</button></div></div>
        <div class="card2"><div class="lab">TAKE OUT</div><div class="btnrow" style="margin-top:.35em">
          <button class="go ghost sm nav" data-act="wd" data-v="100"${save.bank >= 100 ? '' : ' disabled'}>−$1</button><button class="go ghost sm nav" data-act="wd" data-v="500"${save.bank >= 500 ? '' : ' disabled'}>−$5</button><button class="go ghost sm nav" data-act="wd" data-v="all"${save.bank > 0 ? '' : ' disabled'}>ALL</button></div></div>
      </div>
      <div class="chart card2"><div class="tmhead"><b>⏳ SAVINGS TIME MACHINE</b><span class="rate">${RATE * 100}% A YEAR</span></div>
        <div class="tmctl"><div class="tabs">${yb(10)}${yb(20)}${yb(30)}</div><div class="tabs"><span class="tml">SAVE EACH WEEK</span>${ab(0)}${ab(100)}${ab(200)}${ab(500)}</div></div>
        ${timeChart(pr, years)}
        <div class="legend"><span><i style="background:#16a34a"></i>Compound interest</span><span><i class="dash"></i>Simple interest</span><span><i style="background:#94a3b8"></i>Just deposits</span></div>
        <p>${msg || result}</p>
        <div class="miles save">${[1, 5, 10, 20, 30].map((y) => `<div><b>${y === 1 ? '1 YEAR' : y + ' YEARS'}</b>${fmt(Math.round(p30.comp[y]))}</div>`).join('')}</div>
        <p class="small">${lesson}</p>
      </div></div>`));
    say(msg || result);
  }
  function bankMove(dir, v) {
    const amt = v === 'all' ? (dir > 0 ? save.wallet : save.bank) : +v;
    if (dir > 0) { if (save.wallet < amt || !amt) return; save.wallet -= amt; save.bank += amt; town.sparkle('bank', 6); }
    else { if (save.bank < amt || !amt) return; save.bank -= amt; save.wallet += amt; }
    store(); sfx.cash();
    goBank(dir > 0 ? `You put <b>${fmt(amt)}</b> in the bank. It will earn interest at the end of the week!` : `You took out <b>${fmt(amt)}</b>. It's in your wallet now, so it won't earn interest.`);
  }

  // ---------- WONDER SHOP ----------
  const SHOP_INTRO = () => [
    { t: 'Welcome to the <b>Wonder Shop</b>! It has things worth saving for: <b>books</b>, science kits, art supplies, sports gear and fun <b>days out</b>.', v: bigV('📚 🔬 🎨 ⚽ 🦒') },
    { t: 'Pick something you really want and make it your <b>goal</b>. I will show you how many weeks of saving it takes.', v: bigV('🎯') },
    { t: 'Small things you can buy soon. Big things take a few weeks of saving, and that makes them <b>extra special</b> when you get them!', v: bigS('$2 → THIS WEEK<br>$60 → A FEW WEEKS') },
    { t: 'Smart tip: the best rewards are things you will use <b>again and again</b>, like a book, a ball or a paint set.', v: bigV('📖 🔁') },
  ];
  function goToys(selId, msg, tab) {
    if (!save.shopIntro) return goIntro('toys', '🛍️ WONDER SHOP', SHOP_INTRO(), 0, 'shopok');
    const want = selId || (cur.name === 'toys' && cur.sel) || save.goal;
    const wantT = TOYS.find((t) => t.id === want);
    const tabNow = tab || (selId && wantT ? wantT.cat : null) || (cur.name === 'toys' && cur.tab) || (wantT ? wantT.cat : 'learn');
    const list = TOYS.filter((t) => t.cat === tabNow);
    const sel = list.find((t) => t.id === want) || list[0];
    cur = { name: 'toys', sel: sel.id, tab: tabNow };
    save.seenToys = true; store();
    const tabs = SHOP_TABS.map(([id, label]) => `<button class="tab nav${id === tabNow ? ' on' : ''}" data-act="shoptab" data-t="${id}">${label}</button>`).join('');
    const items = list.map((t) => `<button class="item nav${t.id === sel.id ? ' sel' : ''}${save.owned.includes(t.id) ? ' own' : ''}" data-act="pickToy" data-id="${t.id}"${t.id === sel.id ? ' data-default' : ''}>
      ${t.id === save.goal ? '<span class="tagx">🎯</span>' : save.owned.includes(t.id) ? '<span class="tagx">✔</span>' : ''}<span class="e">${t.e}</span><b>${t.name}</b><span class="pr">${fmt(t.price)}</span></button>`).join('');
    const own = save.owned.includes(sel.id), isGoal = save.goal === sel.id;
    const need = Math.max(0, sel.price - total());
    const perWeek = 400;
    const weeks = Math.ceil(need / perWeek);
    let info;
    if (own) info = '✔ You already have this! It\'s at your home.';
    else if (save.wallet >= sel.price) info = 'You have enough in your wallet to buy it!';
    else if (total() >= sel.price) info = `You have enough, but <b>${fmt(sel.price - save.wallet)}</b> of it is in the bank. Take it out to buy.`;
    else info = `You need <b>${fmt(need)}</b> more. Saving ${fmt(perWeek)} a week, that's about <b>${weeks} week${weeks === 1 ? '' : 's'}</b>.`;
    let btns = '';
    if (!own) {
      if (!isGoal) btns += `<button class="go gold nav" data-act="setgoal" data-id="${sel.id}">🎯 MAKE IT MY GOAL</button>`;
      if (save.wallet >= sel.price) btns += `<button class="go nav" data-act="buy" data-id="${sel.id}">BUY IT · ${fmt(sel.price)}</button>`;
      else if (total() >= sel.price) btns += `<button class="go blue nav" data-act="takeout" data-v="${sel.price - save.wallet}">TAKE ${fmt(sel.price - save.wallet)} FROM BANK</button>`;
    }
    show(panel('toys', '🛍️ WONDER SHOP', moneyChips(), `<div class="store">
      <div class="shopcol"><div class="tabs">${tabs}</div><div class="items">${items}</div></div>
      <div class="detail card2"><span class="e">${sel.e}</span><h3>${sel.name}</h3><span class="pr">${fmt(sel.price)}</span><p class="about">${sel.about}</p>${isGoal && !own ? '<p style="color:#b45309">🎯 This is your goal!</p>' : ''}
        <p>${msg || info}</p>${btns}</div></div>`));
    say(msg || `${sel.name}. ${fmt(sel.price)}. ${sel.about} ${info}`);
  }
  function buyToy(id) {
    const t = TOYS.find((q) => q.id === id); if (!t || save.wallet < t.price || save.owned.includes(id)) return;
    save.wallet -= t.price; save.owned.push(id);
    let msg = `You bought the ${t.name.toLowerCase()}! It's waiting at your home. 🏠`;
    let b = null;
    if (save.goal === id) { b = earn('goal'); save.goal = null; msg = `🎯 You reached your goal! Saving really works! Pick a new goal next.`; }
    else if (t.price >= 1000) msg += ' Tip: next time, make it a goal first. Planning makes saving easier!';
    store(); syncTown(); sfx.fanfare(); confetti(70); town.sparkle('home', 10);
    goToys(id, msg + (b ? `<br><b>🏅 NEW BADGE: ${b.name}!</b> ${b.tip}` : ''));
  }

  // ---------- HOME ----------
  // FIX UP MY HOME: upgrades bought from the wallet that appear on your 3D house (town3d setHome).
  // Solar panels are a grown-up lesson: they cost a lot once, then save $1 on electricity every week.
  const UPGRADES = [
    { id: 'mailbox', e: '📬', name: 'MAILBOX', price: 300, about: 'A bright mailbox by the gate for letters and cards.' },
    { id: 'bench', e: '🪑', name: 'PORCH BENCH', price: 500, about: 'A comfy bench by the front door for reading outside.' },
    { id: 'garden', e: '🌻', name: 'FLOWER GARDEN', price: 600, about: 'Sunflowers and tulips beside your house.' },
    { id: 'lights', e: '💡', name: 'STRING LIGHTS', price: 700, about: 'Twinkly lights on your roof. They glow at night!' },
    { id: 'paint', e: '🖌️', name: 'SUNNY PAINT', price: 800, about: 'Paint your house a cheerful sunny yellow.' },
    { id: 'swing', e: '🌳', name: 'TREE SWING', price: 1000, about: 'A big shady tree with a swing.' },
    { id: 'solar', e: '☀️', name: 'SOLAR PANELS', price: 3000, about: 'Panels that make electricity from sunshine, so your electric bill becomes $0. That saves $1 every week: they pay for themselves in 30 weeks!' },
    { id: 'treehouse', e: '🏡', name: 'TREEHOUSE', price: 4000, about: 'Your very own treehouse with a ladder!' },
  ];
  const SOLAR_SAVE = 100;
  function buyUpgrade(id) {
    const u = UPGRADES.find((q) => q.id === id);
    save.home = save.home || [];
    if (!u || save.home.includes(id) || save.wallet < u.price) return;
    save.wallet -= u.price; save.home.push(id);
    const b = earn('homey'); store();
    town.setHome(save.home, id); sfx.fanfare(); confetti(60);
    goTown(`Your ${u.name.toLowerCase()} is ready! Look at your house! ${u.e}` + (u.id === 'solar' ? ' It will save you $1 every week.' : '') + (b ? `<br><b>🏅 NEW BADGE: ${b.name}!</b> ${b.tip}` : ''));
    town.focus('home'); town.showLabels(false);
    setTimeout(() => { if (cur.name === 'town') { town.focus(null); town.showLabels(true); } }, 4200);
  }
  function goHomeFix(selId, msg) {
    const have = save.home || [];
    const sel = UPGRADES.find((u) => u.id === selId) || UPGRADES.find((u) => !have.includes(u.id)) || UPGRADES[0];
    cur = { name: 'home', tab: 'fix', sel: sel.id };
    const items = UPGRADES.map((u) => `<button class="item nav${u.id === sel.id ? ' sel' : ''}${have.includes(u.id) ? ' own' : ''}" data-act="pickup" data-id="${u.id}"${u.id === sel.id ? ' data-default' : ''}>
      ${have.includes(u.id) ? '<span class="tagx">✔</span>' : ''}<span class="e">${u.e}</span><b>${u.name}</b><span class="pr">${fmt(u.price)}</span></button>`).join('');
    const own = have.includes(sel.id);
    let info, btn = '';
    if (own) info = '✔ Your house already has this!';
    else if (save.wallet >= sel.price) { info = 'You have enough in your wallet!'; btn = `<button class="go nav" data-act="buyup" data-id="${sel.id}">BUY IT · ${fmt(sel.price)}</button>`; }
    else if (total() >= sel.price) { info = `You have enough, but <b>${fmt(sel.price - save.wallet)}</b> of it is in the bank. Take some out at the Bank first.`; }
    else info = `You need <b>${fmt(sel.price - total())}</b> more. Keep saving!`;
    return `<div class="store">
      <div class="shopcol">${homeTabs('fix')}<div class="items">${items}</div></div>
      <div class="detail card2"><span class="e">${sel.e}</span><h3>${sel.name}</h3><span class="pr">${fmt(sel.price)}</span><p class="about">${sel.about}</p>
        <p>${msg || info}</p>${btn}<p class="small">👩‍💼 Grown-ups fix up and look after their homes. Fixing small things early saves money later.</p></div></div>`;
  }
  const homeTabs = (on) => `<div class="tabs"><button class="tab nav${on === 'room' ? ' on' : ''}" data-act="hometab" data-t="room">🏅 MY STUFF & BADGES</button><button class="tab nav${on === 'fix' ? ' on' : ''}" data-act="hometab" data-t="fix">🔨 FIX UP MY HOME</button></div>`;
  function goHome(msg, tab, selId) {
    if ((tab || (cur.name === 'home' && cur.tab)) === 'fix') {
      show(panel('home', '🏠 MY HOME', `${moneyChips()}`, goHomeFix(selId, msg)));
      const u = UPGRADES.find((q) => q.id === cur.sel); say(msg || `${u.name}. ${fmt(u.price)}. ${u.about}`);
      return;
    }
    cur = { name: 'home', tab: 'room' };
    const g = goalToy();
    const shelf = save.owned.map((id) => (TOYS.find((t) => t.id === id) || {}).e || '').join('');
    const badges = BADGES.map((b) => `<button class="badge nav ${save.badges[b.id] ? 'on' : 'off'}" data-act="badge" data-id="${b.id}"><span class="e">${b.e}</span><div><b>${b.name}</b><span>${b.how}</span></div></button>`).join('');
    const n = Object.keys(save.badges).length;
    show(panel('home', '🏠 MY HOME', `<button class="pill nav" data-act="reset">START OVER</button>`, `<div class="home">
      <div class="room"><div class="jarline">${moneyChips()}<span class="chip">💝 ${fmt(save.give)}</span>${extraChips()}<span class="chip week">📅 WEEK ${save.week}</span></div>
        ${g ? `<div class="card2" style="font-weight:800">🎯 GOAL: ${g.e} ${g.name} <span style="color:#15803d">${fmt(Math.min(total(), g.price))} / ${fmt(g.price)}</span><div class="goalbar" style="width:100%;margin-top:.3em"><i style="width:${Math.min(100, total() / g.price * 100)}%"></i></div></div>` : '<div class="card2" style="font-weight:800">🎯 No goal yet. Pick one at the Wonder Shop!</div>'}
        <div class="shelf">${shelf}</div></div>
      <div style="display:flex;flex-direction:column;gap:.5em;min-height:0">${homeTabs('room')}<div style="font-weight:900;color:#0f3b4a">🏅 MONEY HABITS · ${n} OF ${BADGES.length}</div><div class="badges">${badges}</div>
        <div class="bubble" id="homeb" style="font-size:1em">${msg || 'Tap a badge to hear why that habit matters when you grow up.'}</div></div></div>`));
    if (msg) say(msg);
  }
  function badgeTip(id) {
    const b = BADGES.find((q) => q.id === id);
    const el = document.getElementById('homeb');
    const t = `${b.e} <b>${b.name}</b>${save.badges[id] ? ' ✔' : ` (to earn it: ${b.how.toLowerCase()})`}. ${b.tip}`;
    if (el) el.innerHTML = t; say(t, true);
  }

  // ---------- PARK ----------
  function goPark(msg) {
    cur = { name: 'park' };
    const projs = PROJECTS.map((p) => {
      const have = save.gifts[p.id] || 0, done = p.max ? have >= p.max : !!have;
      return `<button class="proj nav${done ? ' done' : ''}" data-act="donate" data-id="${p.id}"${done ? ' disabled' : ''}><span class="e">${p.e}</span><b>${p.name}</b><span>${p.about}${p.max ? ` (${have}/${p.max})` : ''}</span><span class="pr">${done ? '✔ DONE' : fmt(p.cost)}</span></button>`;
    }).join('');
    show(panel('park', '🌳 COIN TOWN PARK', `<span class="chip">💝 GIVE JAR ${fmt(save.give)}</span>`, `<div class="park">
      <div class="card2" style="display:flex;flex-direction:column;gap:.5em;font-weight:700;color:#334155;line-height:1.35">
        <div style="font-size:3em;text-align:center">💝</div><div style="text-align:center;font-weight:900;font-size:1.6em;color:#db2777">${fmt(save.give)}</div>
        <div>${msg || 'Money in your <b>GIVE</b> jar can help the whole town. Pick a project, and watch it appear in the park!'}</div>
        <button class="go ghost sm nav" data-act="togive"${save.wallet >= 100 ? '' : ' disabled'}>+$1 FROM WALLET</button></div>
      <div class="projects">${projs}</div></div>`));
    say(msg || 'Money in your give jar can help the whole town. Pick a project!');
  }
  function donate(id) {
    const p = PROJECTS.find((q) => q.id === id); if (!p) return;
    if (save.give < p.cost) { sfx.wrong(); return goPark(`You need <b>${fmt(p.cost - save.give)}</b> more in your GIVE jar. On payday, put a dollar or two in the GIVE jar!`); }
    save.give -= p.cost; save.gifts[id] = (save.gifts[id] || 0) + 1;
    const b = earn('giver'); store();
    goTown(`Thank you! Look at the park: the town loves the new ${p.name.toLowerCase()}! ${p.e}` + (b ? `<br><b>🏅 NEW BADGE: ${b.name}!</b> ${b.tip}` : ''));
    town.focus('park'); town.showLabels(false);
    setTimeout(() => { town.setGifts(save.gifts, true); sfx.fanfare(); confetti(60); }, 900);
    setTimeout(() => { if (cur.name === 'town') { town.focus(null); town.showLabels(true); } }, 4200);
  }

  // ---------- intro slides (first visit to Credit Corner / Market Street) ----------
  function goIntro(building, title, slides, i, doneAct) {
    cur = { name: 'intro', building, title, slides, i, doneAct };
    const s = slides[i], last = i === slides.length - 1;
    const dots = slides.map((_, k) => `<i class="${k <= i ? 'on' : ''}"></i>`).join('');
    show(panel(building, title, `<span class="step">LEARN</span><div class="dots">${dots}</div>${speakBtn()}`, `<div class="lesson">
      <div class="vis-card rise">${s.v}</div>
      <div class="talk"><div class="bubble rise" style="animation-delay:.08s">${s.t}</div>
        <div class="prow">${pennySVG()}<div class="btns">${i ? '<button class="go ghost nav" data-act="introprev">◀</button>' : ''}
          <button class="go ${last ? 'gold' : ''} nav" data-act="${last ? doneAct : 'intronext'}" data-default>${last ? 'LET\'S GO ▶' : 'NEXT ▶'}</button></div></div></div>
    </div>`));
    say(s.t);
  }
  const bigV = (t) => `<div class="big">${t}</div>`;
  const bigS = (t) => `<div class="big sm">${t}</div>`;

  // ---------- CREDIT CORNER: borrowing, interest, trust stars ----------
  // APR (yearly rate) by trust stars: 1 star = a typical credit card (24%), 5 stars = a great-credit loan (9%).
  // Charged a week at a time (APR / 52), like a real loan. Minimum payment = about a third of the loan.
  const LOAN_RATES = [0, 24, 20, 16, 12, 9];
  const loanMin = (P) => Math.ceil(P / 300) * 100;
  const weekInt = (bal, rate) => Math.round(bal * rate / 100 / WEEKS);
  // "1 YR $12.71 · 5 YRS $33 · 10 YRS $109": what an amount grows to, compounding every week at a yearly rate
  const grownTo = (amt, rate, yrs) => amt * Math.pow(1 + rate / WEEKS, WEEKS * yrs);
  function milestones(amt, rate, yrs, cls = '') {
    return `<div class="miles ${cls}">${yrs.map((y) => `<div><b>${y === 1 ? '1 YEAR' : y + ' YEARS'}</b>${fmt(Math.round(grownTo(amt, rate, y)))}</div>`).join('')}</div>`;
  }
  const LOAN_MAX = [0, 1000, 2000, 3000, 4000, 5000];
  const credit = () => save.credit || (save.credit = { stars: 1, loan: null, intro: false, paid: 0, misses: 0 });
  const starRow = (n) => '★'.repeat(n) + '<span class="off">' + '★'.repeat(5 - n) + '</span>';
  function loanCost(P, rate, min) {        // total paid back if you only pay the minimum
    let bal = P, paid = 0, wk = 0;
    while (bal > 0 && wk < 60) { bal += weekInt(bal, rate); const p = Math.min(min, bal); bal -= p; paid += p; wk++; }
    return { paid, weeks: wk };
  }
  const CREDIT_INTRO = (g) => [
    { t: 'Sometimes people <b>borrow</b> money to buy something now, then pay it back later. Borrowed money is called a <b>loan</b>.', v: bigV('🏦 ➜ 💵 ➜ 🙂') },
    { t: 'Borrowing is <b>not free</b>! The lender adds extra money called <b>interest</b>, a little bit every week you still owe.', v: bigV('💵 + 🪙🪙') },
    { t: '<b>APR</b> is the <b>price of borrowing</b> for one year. If the APR is 24%, then for every <b>$1</b> you owe, you pay about <b>24¢ extra</b> in a year. Credit cards often charge about 20 to 25% APR!', v: bigS('24% APR<br>$1 → about $1.24') },
    { t: 'If you <b>never pay it back</b>, the interest earns interest too, and debt grows and grows. Here is $10 at 24% APR:', v: milestones(1000, 0.24, [1, 5, 10, 20], 'big') },
    { t: 'Every week you must make a <b>payment</b>. Pay on time and you earn <b>trust stars</b>. Miss one and you pay a late fee and lose a star.', v: bigV('⭐⭐⭐') },
    { t: 'More trust stars means you can borrow more, for <b>less</b> interest. Grown-ups call this a <b>credit score</b>.', v: bigS('MORE ⭐<br>= CHEAPER LOANS') },
    { t: g >= 3 ? 'Smart tip: pay back <b>more than the minimum</b> when you can. The faster you pay, the less interest you pay!' : 'Smart tip: pay it back <b>fast</b>, and you pay less extra!', v: bigV('💨💵') },
  ];
  function goCredit(msg) {
    const c = credit();
    if (!c.intro) return goIntro('credit', '💳 CREDIT CORNER', CREDIT_INTRO(grade().n), 0, 'creditok');
    cur = { name: 'credit' };
    const rate = LOAN_RATES[c.stars], max = LOAN_MAX[c.stars], L = c.loan;
    const left = `<div class="card2"><div class="lab">YOUR TRUST STARS</div><div class="tstars">${starRow(c.stars)}</div>
        <p class="small">Pay on time to earn stars. More stars = borrow more for less.</p></div>
      <div class="card2"><div class="lab">YOU CAN BORROW UP TO</div><div class="big-n" style="font-size:2.2em">${fmt(max)}</div>
        <p class="small">Your rate: <b>${rate}% APR</b>.${c.stars < 5 ? ` More stars make it lower (${LOAN_RATES[c.stars + 1]}% next).` : ' The best rate!'}</p></div>`;
    const aprBox = `<div class="aprbox"><b>❓ WHAT IS APR?</b> APR is the <b>price of borrowing</b> for one year. ${rate}% APR means for every <b>$1</b> you owe, you pay about <b>${rate}¢ extra</b> in a year.
      <div class="mtitle">If you owed ${fmt(L ? L.bal : 1000)} and <b>never paid it back</b>, it would grow to:</div>${milestones(L ? L.bal : 1000, rate / 100, [1, 5, 10, 20], 'debt')}</div>`;
    let right;
    if (L) {
      const nextInt = weekInt(L.bal, rate);
      right = `<div class="card2 loanbox"><div class="lab">YOU OWE</div><div class="big-n owe">${fmt(L.bal)}</div>
        <p>Next payment: <b>${fmt(Math.min(L.min, L.bal + nextInt))}</b> at the end of this week. Interest this week: about <b>${fmt(nextInt)}</b>.</p>
        <p>Interest paid so far: <b>${fmt(L.interest)}</b>.</p>
        <div class="lab" style="margin-top:.4em">PAY EXTRA NOW (from wallet ${fmt(save.wallet)})</div>
        <div class="btnrow"><button class="go sm nav" data-act="loanpay" data-v="100"${save.wallet >= 100 ? '' : ' disabled'}>$1</button><button class="go sm nav" data-act="loanpay" data-v="500"${save.wallet >= 500 ? '' : ' disabled'}>$5</button><button class="go sm nav" data-act="loanpay" data-v="all"${save.wallet > 0 ? '' : ' disabled'}>PAY IT ALL</button></div>
        ${aprBox}<p class="tipline">${msg || '💡 Paying extra now means less interest later!'}</p></div>`;
    } else {
      const opts = [500, 1000, 2000, 3000, 5000].filter((v) => v <= max);
      const rows = opts.map((P) => { const min = loanMin(P), k = loanCost(P, rate, min); return `<button class="loanopt nav" data-act="borrow" data-v="${P}"><b>BORROW ${fmt(P)}</b><span>Pay ${fmt(min)} a week · about ${k.weeks} weeks</span><span class="cost">Total back: ${fmt(k.paid)} <em>(+${fmt(k.paid - P)} extra)</em></span></button>`; }).join('');
      right = `<div class="card2 loanbox"><div class="lab">TAKE A LOAN?</div><div class="loanopts">${rows}</div>
        ${aprBox}<p class="tipline">${msg || '🤔 Only borrow for something you really need. Saving first costs nothing extra!'}</p></div>`;
    }
    show(panel('credit', '💳 CREDIT CORNER', `${moneyChips()}<button class="pill nav" data-act="creditlearn">? LEARN</button>`, `<div class="credit"><div class="bal">${left}</div>${right}</div>`));
    say(msg || (L ? `You owe ${fmt(L.bal)}.` : 'Want to borrow? Remember, borrowing costs extra.'));
  }
  function borrow(P) {
    const c = credit(); if (c.loan || P > LOAN_MAX[c.stars]) return;
    c.loan = { P, bal: P, min: loanMin(P), interest: 0, missed: 0, week: save.week };
    save.wallet += P; store(); sfx.cash();
    goCredit(`You borrowed <b>${fmt(P)}</b>. It's in your wallet. Your first payment of ${fmt(c.loan.min)} comes out at the end of the week.`);
  }
  function loanPay(v) {
    const L = credit().loan; if (!L) return;
    const amt = Math.min(v === 'all' ? save.wallet : +v, save.wallet, L.bal); if (!amt) return;
    save.wallet -= amt; L.bal -= amt; sfx.coin();
    if (L.bal <= 0) { store(); const done = finishLoan(); return goCredit(done.msg); }
    store(); goCredit(`You paid <b>${fmt(amt)}</b> extra. Now you owe ${fmt(L.bal)}, so next week's interest is smaller!`);
  }
  function finishLoan() {
    const c = credit(), L = c.loan; c.loan = null; c.paid++;
    let msg = `🎉 Loan paid off! It cost you <b>${fmt(L.interest)}</b> extra in interest${L.missed ? ' and late fees' : ''}.`, b = null;
    if (!L.missed) { if (c.stars < 5) { c.stars++; msg += ' No missed payments: <b>+1 trust star!</b>'; } b = earn('credit'); }
    store();
    if (b) msg += `<br><b>🏅 NEW BADGE: ${b.name}!</b>`;
    return { msg, badge: b };
  }
  // called at the end of each week (adds interest, takes the payment)
  function loanWeek() {
    const c = credit(), L = c.loan; if (!L) return null;
    const rate = LOAN_RATES[c.stars], int = weekInt(L.bal, rate);
    L.bal += int; L.interest += int;
    const due = Math.min(L.min, L.bal);
    if (total() >= due) {
      const fromW = Math.min(save.wallet, due); save.wallet -= fromW; save.bank -= due - fromW; L.bal -= due; store();
      if (L.bal <= 0) { const done = finishLoan(); return { e: '🎉', title: 'LOAN PAID OFF!', text: done.msg, grown: 'Paying loans back on time builds a good credit score. Grown-ups with good credit pay less to borrow for a car or a home.' }; }
      return { e: '💳', title: 'LOAN PAYMENT', text: `Interest added: <b>${fmt(int)}</b>. You paid <b>${fmt(due)}</b>${fromW < due ? ' (some from savings)' : ''}. You still owe <b>${fmt(L.bal)}</b>.`, grown: 'Pay more than the minimum when you can: less interest, and you are done sooner.' };
    }
    L.missed++; c.misses++; L.bal += 100; L.interest += 100;
    const lost = c.stars > 1; if (lost) c.stars--; store();
    return { e: '😟', title: 'MISSED PAYMENT', text: `You needed <b>${fmt(due)}</b> for your loan payment but didn't have it. A <b>${fmt(100)} late fee</b> was added${lost ? ' and you lost a trust star' : ''}. You owe <b>${fmt(L.bal)}</b>.`, grown: 'Missing payments costs extra and hurts your credit. Grown-ups plan their payments before they spend.' };
  }

  // ---------- MARKET STREET: a pretend market with STOCKS, ETFs and BONDS ----------
  // Stocks wiggle every week (drift + noise + news). An ETF's weekly change is the average of the stocks it holds.
  // Bonds: short bonds like real 13- and 26-week bills: lend $5, get it back with interest at the end.
  // Real time: drift = average YEARLY return, vol = how much a typical YEAR swings; both are applied a week at a time
  // (drift / 52, swing / sqrt 52), plus a shared market mood and news. Steady stocks ~6-7% +-12% a year, bumpy ~6-9%
  // +-20%, wild ~12% +-36% (its usual result is much lower than its average: big drops hurt). Bank 4% < bonds < stocks.
  const COMPANIES = [
    { id: 'cookie', type: 'stock', e: '🍪', name: 'COOKIE CO', about: 'Bakes cookies for the whole town. Slow and steady.', p: 400, drift: 0.07, vol: 0.12, risk: 1 },
    { id: 'farm', type: 'stock', e: '🥕', name: 'FARM FRESH', about: 'Grows fruit and veggies. People always need food!', p: 300, drift: 0.06, vol: 0.10, risk: 1 },
    { id: 'toys', type: 'stock', e: '🧸', name: 'TOY TOWN', about: 'Makes toys and games. Some toys are hits, some flop.', p: 600, drift: 0.09, vol: 0.22, risk: 2 },
    { id: 'umbrella', type: 'stock', e: '☂️', name: 'UMBRELLA INC', about: 'Umbrellas and rain boots. Rainy weeks are good for it!', p: 500, drift: 0.06, vol: 0.25, risk: 2 },
    { id: 'rocket', type: 'stock', e: '🚀', name: 'ROCKET RIDES', about: 'Rocket rides to the clouds. Exciting... and very risky!', p: 800, drift: 0.12, vol: 0.45, risk: 3 },
    { id: 'townetf', type: 'etf', e: '🧺', name: 'TOWN ETF', about: 'An ETF is a basket of companies in ONE share. This one holds a bit of ALL five companies, so when one falls, the others help.', p: 500, holds: ['cookie', 'farm', 'toys', 'umbrella', 'rocket'], risk: 1, avg: 0.08, swing: 0.13 },
    { id: 'foodetf', type: 'etf', e: '🥗', name: 'FOOD ETF', about: 'An ETF holding the food companies: Cookie Co and Farm Fresh. Very steady.', p: 400, holds: ['cookie', 'farm'], risk: 1, avg: 0.065, swing: 0.08 },
  ];
  const BONDS = [
    { id: 'townbond', e: '🏛️', name: 'TOWN BOND', who: 'Coin Town', face: 500, rate: 0.045, weeks: 13, about: 'Lend $5 to Coin Town to fix the roads. Towns almost always pay back, so it is very safe.' },
    { id: 'cookiebond', e: '📜', name: 'COOKIE CO BOND', who: 'Cookie Co', face: 500, rate: 0.055, weeks: 26, about: 'Lend $5 to Cookie Co for a new oven. Companies pay more than towns, because lending to a company is a little riskier.' },
  ];
  const bondInt = (B) => Math.round(B.face * B.rate * B.weeks / WEEKS);
  // "usually grows about 7% a year; good years +25%, bad years -11%" (about 1.5 swings either side)
  function rangeText(c) {
    const avg = c.avg != null ? c.avg : c.drift, sw = c.swing != null ? c.swing : c.vol;
    const up = Math.round((avg + 1.5 * sw) * 100), dn = Math.round(Math.max(-0.6, avg - 1.5 * sw) * 100);
    return `On average it grows about <b>${Math.round(avg * 100)}% a year</b>. A good year can be <b class="g">+${up}%</b>, a bad year <b class="r">${dn}%</b>.`;
  }
  const RISK = ['', '🟢 STEADY', '🟡 BUMPY', '🔴 WILD'];
  const TABS = [['stock', '📈 STOCKS'], ['etf', '🧺 ETFs'], ['bond', '📜 BONDS']];
  const TABNOTE = {
    stock: '📈 A <b>stock</b> is a tiny piece of ONE company. It can grow a lot, or drop a lot.',
    etf: '🧺 An <b>ETF</b> is ONE share that holds MANY companies. If one has a bad week, the others help. Safer than one stock!',
    bond: '📜 A <b>bond</b> is a loan YOU give. When it\'s done, you get your money back plus interest. Safe, but slower growing.',
  };
  const NEWS = [
    // good and bad news are the same size for each company, so news adds ups and downs without changing the average
    ['cookie', 'Cookie Co\'s new chocolate chip cookie is a big hit!', 0.11], ['cookie', 'Oh no! An oven broke at Cookie Co.', -0.11],
    ['farm', 'A great harvest for Farm Fresh!', 0.11], ['farm', 'Bugs nibbled the carrots at Farm Fresh.', -0.11],
    ['toys', 'Toy Town\'s new robot is the must-have toy!', 0.18], ['toys', 'Kids got bored of Toy Town\'s spinning tops.', -0.18],
    ['umbrella', 'Rainy week! Everybody needs an umbrella.', 0.18], ['umbrella', 'Sunny all week. Nobody bought umbrellas.', -0.18],
    ['rocket', 'Rocket Rides flew higher than ever!', 0.33], ['rocket', 'Rocket Rides had to stop flying for repairs.', -0.33],
    ['all', 'Coin Town is busy and happy. Most companies grew!', 0.055], ['all', 'A slow, quiet week in Coin Town.', -0.055],
  ];
  const coOf = (id) => COMPANIES.find((c) => c.id === id);
  function market() {
    if (!save.market) {
      const m = save.market = { hist: {}, held: {}, cost: {}, bonds: [], intro: false, news: null, split: null };
      for (const c of COMPANIES) m.hist[c.id] = [c.p];
      for (let i = 0; i < 9; i++) stepMarket(true);
      store();
    }
    const m = save.market; if (!m.bonds) m.bonds = [];
    for (const c of COMPANIES) if (!m.hist[c.id]) m.hist[c.id] = [c.p];   // older saves
    return m;
  }
  const price = (id) => { const h = market().hist[id]; return h[h.length - 1]; };
  function noise() { return (Math.random() + Math.random() + Math.random() - 1.5) / 0.5; }   // bell-shaped, average 0, spread (sd) 1
  function stepMarket(quiet) {
    const m = save.market;
    const news = !quiet && Math.random() < 0.75 ? pick(NEWS) : null;
    const pct = {};
    // the whole market's mood this week: real stocks tend to rise and fall together, so even an ETF has bad years.
    // BETA = how strongly a company follows the market (food is calm, rockets swing extra). Yearly numbers are turned
    // into weekly ones: average / 52, swing / sqrt(52). News moves a stock a few percent (a quarter of the headline size).
    const SQ = Math.sqrt(WEEKS);
    const mood = 0.09 * noise() / SQ, BETA = { cookie: 0.7, farm: 0.6, toys: 1.1, umbrella: 0.8, rocket: 1.6 };
    for (const c of COMPANIES) {
      if (c.type !== 'stock') continue;
      let x = c.drift / WEEKS + (BETA[c.id] || 1) * mood + c.vol * 0.5 * noise() / SQ;
      if (news && (news[0] === c.id || news[0] === 'all')) x += news[2] * 0.25;
      pct[c.id] = Math.max(-0.3, Math.min(0.4, x));
    }
    for (const c of COMPANIES) if (c.type === 'etf') pct[c.id] = c.holds.reduce((s, id) => s + pct[id], 0) / c.holds.length;
    m.split = null;
    for (const c of COMPANIES) {
      const h = m.hist[c.id];
      h.push(Math.max(50, Math.round(h[h.length - 1] * (1 + pct[c.id])))); if (h.length > 30) h.shift();
      // stock split: a share over $40 becomes 2 shares at half the price (keeps shares affordable)
      if (h[h.length - 1] > 4000) {
        for (let i = 0; i < h.length; i++) h[i] = Math.round(h[i] / 2);
        if (m.held[c.id]) m.held[c.id] *= 2;
        if (!quiet) m.split = c.id;
      }
    }
    m.news = news;
  }
  // a bond counts down a week; when it's done, the $5 comes back plus its interest
  function stepBonds() {
    const m = market(); let paid = 0, back = 0;
    for (const b of m.bonds) { const B = BONDS.find((q) => q.id === b.id); b.left--; if (b.left <= 0) { back += B.face; paid += bondInt(B); } }
    m.bonds = m.bonds.filter((b) => b.left > 0);
    save.wallet += paid + back;
    return { paid, back };
  }
  const bondValue = () => market().bonds.reduce((s, b) => s + BONDS.find((q) => q.id === b.id).face, 0);
  const holdings = () => { const m = market(); return COMPANIES.reduce((s, c) => s + (m.held[c.id] || 0) * price(c.id), 0) + bondValue(); };
  const change = (id) => { const h = market().hist[id], a = h[h.length - 2], b = h[h.length - 1]; return a ? (b - a) / a : 0; };
  const MARKET_INTRO = (g) => [
    { t: 'A <b>company</b> is a business, like a bakery or a toy maker. You can buy a tiny piece of a company. That piece is called a <b>share</b> or a <b>stock</b>.', v: bigV('🍪 = 🧩🧩🧩') },
    { t: 'When a company does well, its share <b>price</b> usually goes <b>up</b>. When it has a bad week, the price goes <b>down</b>.', v: bigS('📈 GOOD NEWS<br>📉 BAD NEWS') },
    { t: 'Some stocks are <b>steady</b>: small ups and downs. Some are <b>wild</b>: big jumps up AND big drops. Wild ones are <b>risky</b>!', v: bigS('🟢 STEADY<br>🔴 WILD') },
    { t: '<b>Don\'t put all your eggs in one basket!</b> An <b>ETF</b> is a basket of many companies in ONE share. If one company has a bad week, the others help.', v: bigV('🧺 = 🍪🥕🧸☂️🚀') },
    { t: 'A <b>bond</b> is a loan that <b>you</b> give to a town or a company. When the bond is done, they give your money back <b>plus interest</b>. Safe, but it grows slower than stocks.', v: bigS('YOU LEND $5<br>→ WAIT 13 WEEKS<br>→ $5.06 BACK') },
    { t: g >= 3 ? 'Prices bounce around every week. People who <b>wait a long time</b> usually do better than people who panic and sell after a drop.' : 'Prices go up and down every week. <b>Be patient!</b>', v: bigV('🐢 ⏳ 📈') },
    { t: 'This is a <b>pretend</b> market for practice. With real stocks you can lose money too, so grown-ups only invest money they won\'t need soon, and mix stocks, ETFs and bonds.', v: bigV('🎓') },
  ];
  function spark(id, W = 100, H = 40) {
    const h = market().hist[id].slice(-12), lo = Math.min(...h), hi = Math.max(...h), span = Math.max(1, hi - lo);
    const pts = h.map((v, i) => `${(i / (h.length - 1) * W).toFixed(1)},${(H - 3 - (v - lo) / span * (H - 6)).toFixed(1)}`).join(' ');
    const up = h[h.length - 1] >= h[0];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="0,${H} ${pts} ${W},${H}" fill="${up ? 'rgba(74,222,128,.25)' : 'rgba(248,113,113,.22)'}" stroke="none"/><polyline points="${pts}" fill="none" stroke="${up ? '#16a34a' : '#dc2626'}" stroke-width="1.6" vector-effect="non-scaling-stroke"/></svg>`;
  }
  const pctTag = (x) => `<span class="pct ${x >= 0 ? 'up' : 'dn'}">${x >= 0 ? '▲' : '▼'} ${Math.abs(Math.round(x * 100))}%</span>`;
  function goMarket(selId, msg, tab) {
    const m = market();
    if (!m.intro) return goIntro('market', '📈 MARKET STREET', MARKET_INTRO(grade().n), 0, 'marketok');
    const prevSel = cur.name === 'market' ? cur.sel : null;
    const want = selId || prevSel;
    const tabNow = tab || (want && (BONDS.some((b) => b.id === want) ? 'bond' : (coOf(want) || {}).type)) || (cur.name === 'market' && cur.tab) || 'stock';
    const list = tabNow === 'bond' ? BONDS : COMPANIES.filter((c) => c.type === tabNow);
    const sel = list.find((c) => c.id === want) || list[0];
    cur = { name: 'market', sel: sel.id, tab: tabNow };
    const tabs = TABS.map(([id, label]) => `<button class="tab nav${id === tabNow ? ' on' : ''}" data-act="mtab" data-t="${id}">${label}</button>`).join('');
    let rows, detail;
    if (tabNow === 'bond') {
      rows = BONDS.map((b) => { const n = m.bonds.filter((x) => x.id === b.id).length; return `<button class="co nav${b.id === sel.id ? ' sel' : ''}" data-act="pickco" data-id="${b.id}"${b.id === sel.id ? ' data-default' : ''}>
        <span class="e">${b.e}</span><span class="nm"><b>${b.name}</b><small>🟢 SAFE${n ? ` · you own ${n}` : ''}</small></span><span class="pr">${fmt(b.face)}<span class="pct up">${(b.rate * 100).toFixed(1).replace('.0', '')}% a year</span></span></button>`; }).join('');
      const intr = bondInt(sel), mine = m.bonds.filter((x) => x.id === sel.id);
      const pct = (sel.rate * 100).toFixed(1).replace('.0', '');
      detail = `<div class="cohead"><span class="e">${sel.e}</span><div><h3>${sel.name}</h3><small>🟢 SAFE · ${pct}% a year · ${sel.weeks} weeks</small></div><div class="pr">${fmt(sel.face)}<small>a bond</small></div></div>
        <div class="bondplan"><div><b>YOU LEND</b>${fmt(sel.face)}</div><div>➜</div><div><b>WAIT</b>${sel.weeks} weeks</div><div>➜</div><div><b>YOU GET BACK</b>${fmt(sel.face + intr)}</div></div>
        <p class="small">${sel.about} ${pct}% a year for ${sel.weeks} weeks (${sel.weeks === 13 ? 'a quarter' : 'half'} of a year) earns <b>${fmt(intr)}</b>. You can't take the money out early.</p>
        <div class="mtitle">If you kept lending $5 at ${pct}% again and again:</div>${milestones(500, sel.rate, [1, 5, 10, 20])}
        <p>${mine.length ? `You own <b>${mine.length}</b> of these. The next one finishes in <b>${Math.min(...mine.map((x) => x.left))} week${Math.min(...mine.map((x) => x.left)) === 1 ? '' : 's'}</b>.` : 'You don\'t own any of these bonds yet.'}</p>
        <div class="btnrow"><button class="go sm nav" data-act="buybond" data-id="${sel.id}"${save.wallet >= sel.face ? '' : ' disabled'}>LEND ${fmt(sel.face)} · BUY BOND</button></div>`;
    } else {
      rows = list.map((c) => `<button class="co nav${c.id === sel.id ? ' sel' : ''}" data-act="pickco" data-id="${c.id}"${c.id === sel.id ? ' data-default' : ''}>
        <span class="e">${c.e}</span><span class="nm"><b>${c.name}</b><small>${RISK[c.risk]}${m.held[c.id] ? ` · you own ${m.held[c.id]}` : ''}</small></span>${spark(c.id, 60, 22)}<span class="pr">${fmt(price(c.id))}${pctTag(change(c.id))}</span></button>`).join('');
      const own = m.held[sel.id] || 0, val = own * price(sel.id), cost = m.cost[sel.id] || 0, gain = val - cost, p = price(sel.id);
      const inside = sel.type === 'etf' ? `<div class="holds">INSIDE: ${sel.holds.map((id) => coOf(id).e).join(' ')}</div>` : '';
      detail = `<div class="cohead"><span class="e">${sel.e}</span><div><h3>${sel.name}</h3><small>${sel.type === 'etf' ? 'ETF · ' : 'STOCK · '}${RISK[sel.risk]}</small></div><div class="pr">${fmt(p)}<small>a share</small></div></div>
        <div class="bigspark">${spark(sel.id)}</div>${inside}<p class="small">${sel.about} ${rangeText(sel)}</p>
        <div class="mtitle">If $10 grew like an average year (real years bounce up and down, so no promises!):</div>${milestones(1000, sel.avg != null ? sel.avg : sel.drift, [1, 5, 10, 20])}
        <p>${own ? `You own <b>${own}</b> share${own === 1 ? '' : 's'}, worth <b>${fmt(val)}</b>. You paid ${fmt(cost)}: ${gain > 0 ? `<b class="g">up ${fmt(gain)}</b>` : gain < 0 ? `<b class="r">down ${fmt(-gain)}</b>` : 'the same so far'}.` : 'You don\'t own any shares yet.'}</p>
        <div class="btnrow"><button class="go sm nav" data-act="buyco" data-id="${sel.id}"${save.wallet >= p ? '' : ' disabled'}>BUY 1 · ${fmt(p)}</button><button class="go ghost sm nav" data-act="sellco" data-id="${sel.id}" data-n="1"${own ? '' : ' disabled'}>SELL 1</button><button class="go ghost sm nav" data-act="sellco" data-id="${sel.id}" data-n="all"${own ? '' : ' disabled'}>SELL ALL</button></div>`;
    }
    const tip = msg || (m.split ? `✂️ ${coOf(m.split).name} had a <b>stock split</b>: every share became 2 shares at half the price. Same value, cheaper shares!` : m.news ? '📰 ' + m.news[1] : '📰 A quiet week on Market Street.');
    show(panel('market', '📈 MARKET STREET', `${moneyChips()}<span class="chip">📈 ${fmt(holdings())}</span><button class="pill nav" data-act="marketlearn">? LEARN</button>`, `<div class="market">
      <div class="cos"><div class="tabs">${tabs}</div>${rows}<div class="tabnote">${TABNOTE[tabNow]}</div></div>
      <div class="card2 codetail">${detail}<p class="tipline">${tip}</p></div></div>`));
    say(msg || `${sel.name}.`);
  }
  function diversified() {
    const m = market();
    const stocks = COMPANIES.filter((c) => c.type === 'stock' && m.held[c.id]).length;
    return stocks >= 3 || COMPANIES.some((c) => c.type === 'etf' && m.held[c.id]) ? earn('basket') : null;
  }
  function buyShare(id) {
    const m = market(), p = price(id); if (save.wallet < p) return;
    save.wallet -= p; m.held[id] = (m.held[id] || 0) + 1; m.cost[id] = (m.cost[id] || 0) + p;
    const b = diversified(); store(); sfx.cash();
    const c = coOf(id);
    goMarket(id, `You bought 1 share of ${c.name} for ${fmt(p)}. ${c.type === 'etf' ? `That one share holds a bit of ${c.holds.length} companies! 🧺` : 'Now you own a tiny piece of it! 🧩'}` + (b ? `<br><b>🏅 NEW BADGE: ${b.name}!</b>` : ''));
  }
  function buyBond(id) {
    const m = market(), B = BONDS.find((q) => q.id === id); if (!B || save.wallet < B.face) return;
    save.wallet -= B.face; m.bonds.push({ id, left: B.weeks }); store(); sfx.cash();
    goMarket(id, `You lent ${fmt(B.face)} to ${B.who}. In ${B.weeks} weeks you'll get back ${fmt(B.face + bondInt(B))}. 📜`);
  }
  function sellShare(id, n) {
    const m = market(), own = m.held[id] || 0; if (!own) return;
    const k = n === 'all' ? own : 1, p = price(id), costOut = Math.round((m.cost[id] || 0) * k / own);
    m.held[id] = own - k; m.cost[id] = (m.cost[id] || 0) - costOut;
    if (!m.held[id]) { delete m.held[id]; delete m.cost[id]; }
    save.wallet += k * p; store(); sfx.coin();
    const g = k * p - costOut;
    goMarket(id, `You sold ${k} share${k === 1 ? '' : 's'} for ${fmt(k * p)}. ${g > 0 ? `That's ${fmt(g)} more than you paid! 🎉` : g < 0 ? `That's ${fmt(-g)} less than you paid. Prices go down sometimes.` : 'That\'s exactly what you paid.'}`);
  }
  // called at the end of each week: prices move, bonds pay; a card if you own anything
  function marketWeek() {
    const m = market();
    const hadStocks = Object.keys(m.held).length, hadBonds = m.bonds.length;
    const before = COMPANIES.reduce((s, c) => s + (m.held[c.id] || 0) * price(c.id), 0);
    stepMarket(false);
    const bp = stepBonds(); store();
    if (!hadStocks && !hadBonds) return null;
    const after = COMPANIES.reduce((s, c) => s + (m.held[c.id] || 0) * price(c.id), 0), d = after - before;
    const lines = [];
    if (hadStocks) lines.push(`📰 ${m.news ? m.news[1] : 'A quiet week on Market Street.'}`, `Your stocks and ETFs are worth <b>${fmt(after)}</b> (${d >= 0 ? 'up' : 'down'} ${fmt(Math.abs(d))} this week).`);
    if (m.split && m.held[m.split]) lines.push(`✂️ ${coOf(m.split).name} split: you now have <b>${m.held[m.split]}</b> shares at half the price. Same value!`);
    if (hadBonds) lines.push(bp.back ? `📜 A bond finished! Your <b>${fmt(bp.back)}</b> came back plus <b>${fmt(bp.paid)}</b> interest. (It went to your wallet.)` : `📜 Your bonds are still growing. ${m.bonds.length ? `Next one is done in ${Math.min(...m.bonds.map((b) => b.left))} weeks.` : ''}`);
    const grown = hadStocks ? (d >= 0 ? 'Nice! But remember, stock prices can go down too. Mixing stocks, ETFs and bonds keeps you safer.' : 'Prices go up AND down. People who stay patient usually do better than people who panic and sell.')
      : 'Bonds are slow and steady. Grown-ups often keep some bonds so their savings don\'t bounce around too much.';
    return { e: hadStocks ? (d >= 0 ? '📈' : '📉') : '📜', title: 'MARKET NEWS', text: lines.join('<br>'), grown };
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
  function confetti(n) { for (let i = 0; i < 5; i++) spawn(fx.width * (0.1 + i * 0.2), fx.height * 0.3, n / 5, 7 * fxScale); }
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
  let resetArmed = 0;
  function go(id) {
    switch (id) {
      case 'school': return goSchool();
      case 'shop': return goShop();
      case 'bank': return goBank();
      case 'toys': return goToys();
      case 'home': return goHome();
      case 'park': return goPark();
      case 'credit': return goCredit();
      case 'market': return goMarket();
    }
  }
  function act(name, el) {
    const ds = (el && el.dataset) || {};
    if (!['ans', 'speak', 'put', 'jar', 'unjar'].includes(name)) sfx.tap();
    switch (name) {
      case 'grade': save.grade = +ds.g; store(); goTown(); break;
      case 'sound': toggleSound(); break;
      case 'read': save.read = !readOn(); store(); goTitle(); setFocus(ui.querySelector('[data-act="read"]')); if (readOn()) say('I will read to you!', true); break;
      case 'howto': openHowto(); break;
      case 'title': goTitle(); break;
      case 'tip': toggleTip(); break;
      case 'town': goTown(); break;
      case 'go': go(ds.b); break;
      case 'school': goSchool(cur.id); break;
      case 'topic': goLesson(ds.id, 0); break;
      case 'next': sfx.page(); if (cur.slide < cur.slides.length - 1) goLesson(cur.id, cur.slide + 1); else startPractice(cur.id); break;
      case 'prev': goLesson(cur.id, Math.max(0, cur.slide - 1)); break;
      case 'again': startPractice(ds.id); break;
      case 'ans': choose(+ds.k); break;
      case 'nextq': nextQuestion(); break;
      case 'hint': if (cur.q && !cur.locked) { bubble('💡 ' + cur.q.hint); say(cur.q.hint, true); } break;
      case 'speak': speakNow(); break;
      case 'startshift': startShift(); break;
      case 'put': putPiece(+ds.v); break;
      case 'take': takePiece(+ds.i); break;
      case 'clear': if (!cur.locked) { cur.tray = []; drawTray(); } break;
      case 'give': giveChange(); break;
      case 'reghint': if (!cur.locked) regHint(); break;
      case 'nextcust': nextCustomer(); break;
      case 'payday': goPayday(cur.pay); break;
      case 'jar': jarPut(ds.j, 1); break;
      case 'unjar': jarPut(ds.j, -1); break;
      case 'plan': pennysPlan(); break;
      case 'payok': payDone(); break;
      case 'wnext': nextWeekCard(); break;
      case 'paysurprise': paySurprise(); break;
      case 'paybills': payBills(); break;
      case 'treat': treat(ds.y === '1'); break;
      case 'gift': gift(ds.to); break;
      case 'dep': bankMove(1, ds.v); break;
      case 'byears': cur.years = +ds.v; goBank(); break;
      case 'badd': cur.add = +ds.v; goBank(); break;
      case 'wd': bankMove(-1, ds.v); break;
      case 'pickToy': goToys(ds.id); break;
      case 'shoptab': goToys(null, null, ds.t); break;
      case 'shopok': save.shopIntro = true; store(); goToys(); break;
      case 'hometab': goHome(null, ds.t); break;
      case 'pickup': goHome(null, 'fix', ds.id); break;
      case 'buyup': buyUpgrade(ds.id); break;
      case 'setgoal': save.goal = ds.id; store(); sfx.right(); goToys(ds.id, `🎯 New goal! Now every dollar you save gets you closer. You need ${fmt(Math.max(0, TOYS.find((t) => t.id === ds.id).price - total()))} more.`); break;
      case 'buy': buyToy(ds.id); break;
      case 'takeout': { const v = Math.min(+ds.v, save.bank); save.bank -= v; save.wallet += v; store(); sfx.cash(); goToys(cur.sel, `You took ${fmt(v)} out of the bank. Now you can buy it!`); break; }
      case 'badge': badgeTip(ds.id); break;
      case 'intronext': sfx.page(); goIntro(cur.building, cur.title, cur.slides, cur.i + 1, cur.doneAct); break;
      case 'introprev': goIntro(cur.building, cur.title, cur.slides, Math.max(0, cur.i - 1), cur.doneAct); break;
      case 'creditok': credit().intro = true; store(); goCredit(); break;
      case 'marketok': market().intro = true; store(); goMarket(); break;
      case 'creditlearn': goIntro('credit', '💳 CREDIT CORNER', CREDIT_INTRO(grade().n), 0, 'creditok'); break;
      case 'marketlearn': goIntro('market', '📈 MARKET STREET', MARKET_INTRO(grade().n), 0, 'marketok'); break;
      case 'borrow': borrow(+ds.v); break;
      case 'loanpay': loanPay(ds.v); break;
      case 'pickco': goMarket(ds.id); break;
      case 'buyco': buyShare(ds.id); break;
      case 'sellco': sellShare(ds.id, ds.n); break;
      case 'buybond': buyBond(ds.id); break;
      case 'mtab': goMarket(null, null, ds.t); break;
      case 'donate': donate(ds.id); break;
      case 'togive': if (save.wallet >= 100) { save.wallet -= 100; save.give += 100; store(); sfx.coin(); goPark('You moved $1 from your wallet to your GIVE jar. 💝'); } break;
      case 'reset':
        if (Date.now() - resetArmed < 3000) { const keep = { grade: save.grade, read: save.read, stars: save.stars }; save = Object.assign(FRESH(), keep); store(); syncTown(); goTown('A fresh start! Your money, toys and badges are reset. (Your school stars stay.)'); }
        else { resetArmed = Date.now(); el.textContent = 'TAP AGAIN TO START OVER'; }
        break;
    }
  }
  function speakNow() {
    if (cur.name === 'lesson') say(cur.slides[cur.slide].t, true);
    else if (cur.name === 'intro') say(cur.slides[cur.i].t, true);
    else if (cur.name === 'practice' && cur.q) { const b = document.getElementById('bub'); say(cur.locked && b ? b.innerHTML.replace(/<button[\s\S]*<\/button>/, '') : cur.q.q, true); }
    else if (cur.name === 'reg') { const m = document.getElementById('regmsg'); say(m && m.textContent ? m.innerHTML : `The total is ${fmt(cur.c.tot)}. The customer paid ${fmt(cur.c.paid)}.`, true); }
    else if (cur.name === 'payday') say(ui.querySelector('.paytip').innerHTML, true);
    else if (cur.name === 'town') { const t = document.getElementById('tipb'); if (t) say(t.innerHTML, true); }
  }

  // ---------- HOW TO PLAY ----------
  const howto = document.getElementById('howto');
  document.getElementById('hw-penny').innerHTML = pennySVG();
  const howtoOpen = () => !howto.hidden;
  let howtoFrom = null;
  function openHowto() { hush(); howtoFrom = focused; howto.hidden = false; if (document.body.classList.contains('navmode')) setFocus(document.getElementById('btn-howto-close')); }
  function closeHowto() { howto.hidden = true; setFocus(howtoFrom && ui.contains(howtoFrom) ? howtoFrom : null); howtoFrom = null; }
  // ---------- SOUND ON / OFF (title, town, the ☰ menu, or the M key) ----------
  const soundBtn = document.getElementById('btn-sound');
  function paintSound() {
    if (soundBtn) soundBtn.textContent = soundOn() ? 'SOUND: ON' : 'SOUND: OFF';
    ui.querySelectorAll('[data-act="sound"]').forEach((b) => { b.textContent = b.classList.contains('icon-btn') ? (soundOn() ? '🔊' : '🔇') : (soundOn() ? '🔊 SOUND: ON' : '🔇 SOUND: OFF'); });
  }
  function toggleSound() {
    save.sound = !soundOn(); store();
    if (!soundOn()) hush();
    paintSound();
    if (soundOn()) sfx.coin();
  }
  if (soundBtn) soundBtn.addEventListener('click', () => { audio(); toggleSound(); });
  paintSound();
  document.getElementById('btn-howto').addEventListener('click', () => { if (window.MickleMenu) MickleMenu.close(); openHowto(); });
  document.getElementById('btn-howto-close').addEventListener('click', () => { sfx.tap(); closeHowto(); });
  howto.addEventListener('click', (e) => { if (e.target === howto) closeHowto(); });

  function back() {
    if (howtoOpen()) return closeHowto();
    switch (cur.name) {
      case 'title': if (window.MickleMenu) MickleMenu.backToArcade(); return;
      case 'town': return goTitle();
      case 'lesson': case 'practice': case 'result': return goSchool(cur.id);
      case 'reg': case 'shiftend': case 'payday': case 'week': return; // finish the shift / week first
      default: return goTown();
    }
  }

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !(ui.contains(el) || signsEl.contains(el)) || el.disabled) return;
    document.body.classList.remove('navmode');
    audio();
    act(el.dataset.act, el);
  });

  // ---------- keyboard / controller focus ----------
  let focused = null;
  function setFocus(el) {
    if (focused) focused.classList.remove('foc');
    focused = el || null;
    if (focused) { focused.classList.add('foc'); try { focused.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  function navEls() {
    const roots = howtoOpen() ? [howto] : cur.name === 'town' ? [signsEl, ui] : [ui];
    return roots.flatMap((r) => [...r.querySelectorAll('.nav')]).filter((b) => !b.disabled && b.offsetParent !== null && !b.classList.contains('bad') && b.style.visibility !== 'hidden');
  }
  function move(dx, dy) {
    document.body.classList.add('navmode');
    const els = navEls(); if (!els.length) return;
    if (!focused || !els.includes(focused)) return setFocus(els[0]);
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
    if (best) { setFocus(best); sfx.tap(); }
  }
  function press() {
    document.body.classList.add('navmode');
    if (howtoOpen()) { sfx.tap(); closeHowto(); return; }
    const els = navEls();
    if (!focused || !els.includes(focused)) { setFocus(els[0]); return; }
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
    else if (howtoOpen()) return;
    else if (/^[1-4]$/.test(k) && cur.name === 'practice') { if (cur.locked) act('nextq'); else { audio(); choose(+k - 1); } }
    else if (k === 'h' || k === 'H' || k === '?') { if (cur.name === 'title' || cur.name === 'town') act('howto'); else if (cur.name === 'practice') act('hint'); else if (cur.name === 'reg') act('reghint'); }
    else if (k === 's' || k === 'S') speakNow();
    else if (k === 'm' || k === 'M') { audio(); toggleSound(); }
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
        if (Pad360.pressed(Pad360.BTN.Y)) { if (howtoOpen()) closeHowto(); else if (cur.name === 'title') act('howto'); else speakNow(); }
        if (Pad360.pressed(Pad360.BTN.X)) { if (cur.name === 'practice') act('hint'); else if (cur.name === 'reg') act('reghint'); }
      }
    }
    requestAnimationFrame(padLoop);
  }
  requestAnimationFrame(padLoop);

  window.CoinTownDebug = { get state() { return cur; }, town: () => town, sayOf, save: () => save, act, go, goTitle, goTown, startShift, credit, market, stepMarket, loanWeek, holdings, stepBonds, giveChange, endWeek, goPayday, makeCustomer, TOPICS, setGrade: (n) => { save.grade = n; },
    solve() { if (cur.name === 'reg') { cur.tray = greedy(cur.c.due); drawTray(); giveChange(); } } };

  syncTown();
  if (save.grade == null) goTitle(); else goTown();
})();
