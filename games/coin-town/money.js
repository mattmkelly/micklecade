// Coin Town -- money pictures (coins + bills drawn as SVG) and the Money School lessons.
// window.CoinMoney = { fmt, sayMoney, pieceSVG, vMoney, greedy, PIECES, TOPICS, shuffle, R, pick }
// Every amount is whole cents (an integer). Coins are drawn at their real relative sizes
// (dime smallest, then penny, nickel, quarter) so kids learn to tell them apart by look.
(function () {
  'use strict';
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  function fmt(c) {
    c = Math.round(c);
    if (c < 0) return '−' + fmt(-c);
    if (c < 100) return c + '¢';
    return '$' + (c % 100 ? (c / 100).toFixed(2) : String(c / 100));
  }
  // "$4.35" -> "4 dollars and 35 cents" (for the read-aloud voice)
  function sayMoney(s) {
    return String(s)
      .replace(/\$(\d+)\.(\d\d)/g, (m, d, c) => `${+d} dollar${+d === 1 ? '' : 's'}${+c ? ' and ' + (+c) + ' cent' + (+c === 1 ? '' : 's') : ''}`)
      .replace(/\$(\d+)/g, (m, d) => `${+d} dollar${+d === 1 ? '' : 's'}`)
      .replace(/(\d+)¢/g, (m, c) => `${+c} cent${+c === 1 ? '' : 's'}`);
  }

  // ---------- the pieces ----------
  const PIECES = {
    1: { name: 'PENNY', coin: true, mm: 19.05, rim: '#9a4a22', face: '#dd8a52', ridge: false },
    5: { name: 'NICKEL', coin: true, mm: 21.21, rim: '#8b939e', face: '#d7dbe1', ridge: false },
    10: { name: 'DIME', coin: true, mm: 17.91, rim: '#8a96a8', face: '#eef2f7', ridge: true },
    25: { name: 'QUARTER', coin: true, mm: 24.26, rim: '#8a96a8', face: '#e9eef4', ridge: true },
    // bills: paper tint, ink colour and accent like the modern US notes ($1 plain green-grey, $5 purple, $10 orange,
    // $20 green-peach, $50 pink-blue, $100 blue). Portraits are made-up silhouettes, not real people.
    100: { name: 'ONE DOLLAR', short: '$1', word: 'ONE DOLLAR', paper: '#e9eedd', ink: '#2f5d3a', accent: '#9fb89a' },
    500: { name: 'FIVE DOLLARS', short: '$5', word: 'FIVE DOLLARS', paper: '#ece6ef', ink: '#4c3a73', accent: '#b9a7d6' },
    1000: { name: 'TEN DOLLARS', short: '$10', word: 'TEN DOLLARS', paper: '#f4ead9', ink: '#8a4b16', accent: '#f0b56b' },
    2000: { name: 'TWENTY DOLLARS', short: '$20', word: 'TWENTY DOLLARS', paper: '#e8efdf', ink: '#2f5d3a', accent: '#e8b98f' },
    5000: { name: 'FIFTY DOLLARS', short: '$50', word: 'FIFTY DOLLARS', paper: '#efe6ec', ink: '#7a2f4f', accent: '#9cc3e6' },
    10000: { name: 'ONE HUNDRED DOLLARS', short: '$100', word: 'ONE HUNDRED DOLLARS', paper: '#e6eef2', ink: '#1f4f6b', accent: '#7fc6d9' },
  };
  const DENOMS = [5000, 2000, 1000, 500, 100, 25, 10, 5, 1];
  const K = 1.5;                      // svg units per mm for coins
  const BW = 74, BH = 32;             // bill size in svg units
  function pieceSize(v) { const p = PIECES[v]; return p.coin ? [p.mm * K, p.mm * K] : [BW, BH]; }

  // a made-up profile bust (faces right), drawn in a 1 x 1 box
  const BUST = 'M.30 .98 L.33 .78 C.22 .73 .17 .58 .21 .44 C.23 .26 .37 .12 .53 .12 C.67 .12 .75 .23 .76 .35 L.82 .46 L.77 .49 L.78 .54 L.75 .56 L.76 .61 C.75 .67 .69 .69 .63 .68 L.61 .77 L.70 .98 Z';
  const bust = (x, y, s, fill, op) => `<path d="${BUST}" transform="translate(${x} ${y}) scale(${s})" fill="${fill}" opacity="${op}"/>`;

  // draw a piece with its top-left at x, y
  function pieceG(v, x, y, label) {
    const p = PIECES[v];
    if (p.coin) {
      const r = p.mm * K / 2, cx = x + r, cy = y + r;
      let s = `<circle cx="${cx}" cy="${cy + 1.2}" r="${r}" fill="rgba(30,41,59,.22)"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${p.rim}"/>`;
      // reeded (bumpy) edges on dimes and quarters; smooth on pennies and nickels
      if (p.ridge) s += `<circle cx="${cx}" cy="${cy}" r="${r - 0.55}" fill="none" stroke="${p.face}" stroke-width="1.1" stroke-dasharray=".55 .55"/>`;
      s += `<circle cx="${cx}" cy="${cy}" r="${r - 1.5}" fill="${p.face}"/>` +
        `<circle cx="${cx}" cy="${cy}" r="${r - 2.4}" fill="none" stroke="${p.rim}" stroke-width=".55" opacity=".7"/>`;
      // raised portrait + LIBERTY like a real coin's front
      const bs = r * 1.15;
      s += bust(cx - bs * 0.5, cy - bs * 0.56, bs, p.rim, 0.55);
      s += `<text x="${cx}" y="${cy - r * 0.6}" text-anchor="middle" font-size="${r * 0.2}" letter-spacing=".3" fill="${p.rim}" opacity=".9">LIBERTY</text>`;
      if (label) s += `<text x="${cx}" y="${cy + r * 0.78}" text-anchor="middle" font-size="${r * 0.36}" fill="${v === 1 ? '#4a1f08' : '#273445'}">${v}¢</text>`;
      else s += `<text x="${cx + r * 0.5}" y="${cy + r * 0.62}" text-anchor="middle" font-size="${r * 0.16}" fill="${p.rim}" opacity=".85">2026</text>`;
      s += `<ellipse cx="${cx - r * 0.35}" cy="${cy - r * 0.42}" rx="${r * 0.38}" ry="${r * 0.18}" fill="#fff" opacity=".35" transform="rotate(-30 ${cx - r * 0.35} ${cy - r * 0.42})"/>`;
      return s;
    }
    // a banknote: paper, fine border, portrait in an oval, two seals, numbers in all four corners, value in words
    const W = BW, H = BH, n = p.short.slice(1), ink = p.ink;
    const big = n.length > 2 ? 6 : 7.2;
    let s = `<rect x="${x}" y="${y + 1.3}" width="${W}" height="${H}" rx="1.6" fill="rgba(30,41,59,.2)"/>` +
      `<rect x="${x}" y="${y}" width="${W}" height="${H}" rx="1.6" fill="${p.paper}" stroke="${ink}" stroke-width=".5"/>` +
      `<rect x="${x + 2}" y="${y + 2}" width="${W - 4}" height="${H - 4}" rx="1" fill="none" stroke="${ink}" stroke-width=".9" stroke-dasharray=".6 .5" opacity=".75"/>` +
      `<rect x="${x + 3.4}" y="${y + 3.4}" width="${W - 6.8}" height="${H - 6.8}" fill="none" stroke="${ink}" stroke-width=".35" opacity=".6"/>` +
      // soft colour wash behind the portrait (the modern notes' colour)
      `<ellipse cx="${x + W / 2}" cy="${y + H / 2}" rx="16" ry="12" fill="${p.accent}" opacity=".45"/>` +
      `<ellipse cx="${x + W / 2}" cy="${y + H / 2 + .3}" rx="8.2" ry="10" fill="${p.paper}" stroke="${ink}" stroke-width=".7"/>` +
      bust(x + W / 2 - 6.6, y + H / 2 - 7.6, 13.5, ink, 0.75) +
      // seals: dark one on the left, coloured one on the right
      `<circle cx="${x + 16}" cy="${y + H / 2 + 1}" r="4" fill="none" stroke="#334155" stroke-width=".8"/><circle cx="${x + 16}" cy="${y + H / 2 + 1}" r="2.4" fill="#334155" opacity=".35"/>` +
      `<circle cx="${x + W - 16}" cy="${y + H / 2 + 1}" r="4" fill="none" stroke="${ink}" stroke-width=".8" stroke-dasharray="1 .5"/><circle cx="${x + W - 16}" cy="${y + H / 2 + 1}" r="2.4" fill="${ink}" opacity=".4"/>` +
      `<text x="${x + W / 2}" y="${y + 6.3}" text-anchor="middle" font-size="2.6" letter-spacing=".25" fill="${ink}">COIN TOWN BANK NOTE</text>` +
      `<text x="${x + W / 2}" y="${y + H - 3.9}" text-anchor="middle" font-size="2.9" letter-spacing=".2" fill="${ink}">${p.word}</text>` +
      `<text x="${x + 5}" y="${y + 9.5}" font-size="${big}" fill="${ink}">${n}</text>` +
      `<text x="${x + W - 5}" y="${y + 9.5}" text-anchor="end" font-size="${big}" fill="${ink}">${n}</text>` +
      `<text x="${x + 5}" y="${y + H - 4.4}" font-size="${big * 0.75}" fill="${ink}">${n}</text>` +
      `<text x="${x + W - 4.6}" y="${y + H - 4}" text-anchor="end" font-size="${big * 1.25}" fill="${ink}">${n}</text>`;
    return s;
  }
  // one piece on its own (for buttons, the till and the change tray)
  // coins share one quarter-sized box, so a dime really looks smaller than a quarter
  function pieceSVG(v, label = true) {
    if (PIECES[v].coin) {
      const D = PIECES[25].mm * K, d = PIECES[v].mm * K, o = (D - d) / 2;
      return `<svg class="pc coin" viewBox="-1 -1 ${D + 2} ${D + 3.5}" aria-label="${PIECES[v].name}">${pieceG(v, o, o, label)}</svg>`;
    }
    return `<svg class="pc bill" viewBox="-1 -1 ${BW + 2} ${BH + 3.5}" aria-label="${PIECES[v].name}">${pieceG(v, 0, 0, label)}</svg>`;
  }
  // a little pile of money as one picture; bills first, wrapped into rows
  function vMoney(list, o = {}) {
    const maxW = o.w || 300, gap = 6;
    const items = list.slice().sort((a, b) => b - a);
    let x = 0, y = 0, rowH = 0, W = 0;
    const out = [];
    for (const v of items) {
      const [w, h] = pieceSize(v);
      const nameH = o.names ? 11 : 0;
      if (x + w > maxW && x > 0) { x = 0; y += rowH + gap; rowH = 0; }
      const yy = y + (PIECES[v].coin && !o.names ? Math.max(0, (rowH || 0) - h) / 2 : 0);
      out.push(pieceG(v, x, yy, o.label !== false));
      if (o.names) out.push(`<text x="${x + w / 2}" y="${y + h + 10}" text-anchor="middle" font-size="8" fill="#334155">${PIECES[v].name}</text>`);
      x += w + gap; W = Math.max(W, x - gap); rowH = Math.max(rowH, h + nameH);
    }
    const H = y + rowH + 3;
    return `<svg class="vis" viewBox="-2 -2 ${W + 4} ${H + 4}">${out.join('')}</svg>`;
  }
  // fewest pieces that make an amount (US coins and bills: greedy is always fewest)
  function greedy(c, allowed = DENOMS) {
    const out = []; let left = Math.round(c);
    for (const v of allowed.slice().sort((a, b) => b - a)) while (left >= v) { out.push(v); left -= v; }
    return left ? null : out;
  }
  // "65¢ + 10¢ = 75¢, + 25¢ = $1" -- the cashier's count-up
  const PLURAL = { 1: ['penny', 'pennies'], 5: ['nickel', 'nickels'], 10: ['dime', 'dimes'], 25: ['quarter', 'quarters'], 100: ['dollar', 'dollars'] };
  function countUp(from, to) {
    const steps = (greedy(to - from) || []).sort((a, b) => a - b);
    let cur = from; const parts = [fmt(from)];
    for (let i = 0; i < steps.length;) {
      const v = steps[i]; let n = 0;
      while (steps[i] === v) { n++; i++; }
      cur += v * n;
      const name = PLURAL[v] ? (n === 1 ? 'a ' + PLURAL[v][0] : n + ' ' + PLURAL[v][1]) : (n === 1 ? fmt(v) : n + ' × ' + fmt(v));
      parts.push(`+ ${name} = ${fmt(cur)}`);
    }
    return parts.join(', ');
  }

  // ---------- question helpers ----------
  function Q(q, ans, wrongs, o = {}) {
    const a = String(ans), seen = new Set([a]), w = [];
    for (const x of wrongs) {
      if (x === null || x === undefined) continue;
      const s = String(x);
      if (!s || seen.has(s) || s.includes('NaN') || s.startsWith('−') || s === '0¢') continue;
      seen.add(s); w.push(s);
      if (w.length >= (o.n || 4) - 1) break;
    }
    const choices = o.order ? o.order.slice() : shuffle([a].concat(w));
    return { q, vis: o.vis || '', choices, answer: choices.indexOf(a), hint: o.hint || '', why: o.why || '', small: !!o.small };
  }
  // money answer: wrong amounts are near misses
  function MQ(q, ans, wrongs, o = {}) {
    const extra = [ans + 1, ans - 1, ans + 5, ans - 5, ans + 10, ans - 10, ans + 25, ans - 25, ans + 100, ans - 100];
    return Q(q, fmt(ans), shuffle(wrongs.slice()).concat(extra).filter((x) => x > 0 && x !== ans && (ans >= 100 || x < 100)).map(fmt), o);
  }
  const big = (t) => `<div class="big">${t}</div>`;
  const bigSm = (t) => `<div class="big sm">${t}</div>`;
  const coinRow = (list) => vMoney(list, { names: true, w: 330 });

  // ---------- MONEY SCHOOL ----------
  // Each topic: { id, name, icon, lesson(g) -> [{ t, v }], gen(d, g) -> question }.
  // g = grade 0 (K) .. 6; d = difficulty 0..1 within the grade.
  const COIN_V = [1, 5, 10, 25];
  const BILL_NAME = { 100: 'one-dollar bill', 500: 'five-dollar bill', 1000: 'ten-dollar bill', 2000: 'twenty-dollar bill', 5000: 'fifty-dollar bill', 10000: 'hundred-dollar bill' };
  const nameOf = (v) => (PIECES[v].coin ? PIECES[v].name.toLowerCase() : BILL_NAME[v]);
  const pic = (v) => pieceSVG(v, false);
  const TOPICS = [
    {
      // MEET THE MONEY: every denomination, one by one
      id: 'denoms', name: 'MEET THE MONEY', icon: '🔎',
      lesson: (g) => [
        { t: 'Money comes in different sizes called <b>denominations</b>. Each coin and bill is worth a different amount.', v: vMoney([1000, 500, 100, 25, 10, 5, 1], { w: 240 }) },
        { t: 'The <b>penny</b> is worth <b>1 cent</b>. It is copper colored. The <b>nickel</b> is worth <b>5 cents</b>. It is silver, thick and smooth.', v: coinRow([1, 5]) },
        { t: 'The <b>dime</b> is worth <b>10 cents</b>. It is the tiniest coin! The <b>quarter</b> is worth <b>25 cents</b>. Dimes and quarters have <b>bumpy edges</b>.', v: coinRow([10, 25]) },
        { t: 'Paper money is called <b>bills</b>. The <b>$1 bill</b> is worth 100 cents. The <b>$5 bill</b> has a little <b>purple</b> on it.', v: vMoney([100, 500], { names: true, w: 170 }) },
        { t: 'The <b>$10 bill</b> has <b>orange</b> on it, and the <b>$20 bill</b> has <b>green and peach</b>. Look at the <b>number in the corners</b> to know what a bill is worth.', v: vMoney([1000, 2000], { names: true, w: 170 }) },
        g >= 2 ? { t: 'Big bills: the <b>$50</b> and the <b>$100</b>. Most people don\'t carry these every day. Grown-ups keep big amounts safe in the bank.', v: vMoney([5000, 10000], { names: true, w: 170 }) } : null,
        { t: 'Coins go <b>1, 5, 10, 25</b>. Bills go <b>1, 5, 10, 20' + (g >= 2 ? ', 50, 100' : '') + '</b>. Bigger number, more money!', v: bigSm('COINS: 1¢ 5¢ 10¢ 25¢<br>BILLS: $1 $5 $10 $20' + (g >= 2 ? ' $50 $100' : '')) },
      ].filter(Boolean),
      gen(d, g) {
        const bills = g >= 2 ? [100, 500, 1000, 2000, 5000, 10000] : [100, 500, 1000, 2000];
        const all = COIN_V.concat(bills);
        const t = Math.random();
        if (t < 0.3) {   // which one is worth ...?
          const v = pick(g === 0 && d < 0.5 ? [1, 5, 10, 100] : all);
          const others = shuffle(all.filter((x) => x !== v)).slice(0, 3);
          return Q(`Which one is worth <b>${fmt(v)}</b>?`, pic(v), others.map(pic), { small: true, hint: PIECES[v].coin ? 'Look at the color and size of each coin.' : 'Look at the number in the corners.', why: `That is the ${nameOf(v)}. It is worth ${fmt(v)}.` });
        }
        if (t < 0.6) {   // what is this called?
          const v = pick(all), wrong = shuffle(all.filter((x) => x !== v)).slice(0, 3).map(nameOf);
          return Q('What is this called?', nameOf(v), wrong, { vis: vMoney([v], { label: false }), hint: PIECES[v].coin ? 'Penny is copper, the dime is tiny, the quarter is biggest.' : 'Read the number in the corner.', why: `It is a ${nameOf(v)}, worth ${fmt(v)}.` });
        }
        if (t < 0.85 || g === 0) {   // which is worth more? (some tricky pairs)
          const pairs = [[5, 10], [10, 25], [25, 100], [1, 5], [100, 500], [500, 1000], [1000, 2000]].concat(g >= 2 ? [[2000, 5000], [5000, 10000]] : []);
          const [a, b] = pick(pairs), flip = Math.random() < 0.5, A = flip ? b : a, B = flip ? a : b;
          return Q('Which is worth <b>more</b>?', pic(Math.max(A, B)), [pic(Math.min(A, B))], { small: true, order: [pic(A), pic(B)], hint: a === 5 ? 'Tricky! Bigger is not always worth more.' : 'Think about what each one is worth.', why: `The ${nameOf(Math.max(A, B))} (${fmt(Math.max(A, B))}) is worth more than the ${nameOf(Math.min(A, B))} (${fmt(Math.min(A, B))}).` });
        }
        // what comes next?
        if (Math.random() < 0.5) return Q('Coins go 1¢, 5¢, 10¢, ... What comes <b>next</b>?', '25¢', ['15¢', '20¢', '50¢'], { hint: 'Think of the biggest coin.', why: 'After the dime (10¢) comes the quarter (25¢).' });
        const seq = g >= 2 ? [[[1, 5, 10, 20], 50], [[5, 10, 20, 50], 100]] : [[[1, 5, 10], 20]];
        const [s, ans] = pick(seq);
        return Q(`Bills go ${s.map((v) => '$' + v).join(', ')}, ... What comes <b>next</b>?`, '$' + ans, ['$' + (ans - 5), '$' + (ans + 10), '$' + (s[s.length - 1] + 1)], { hint: 'Think of the next bill in your wallet.', why: `The next bill is the $${ans} bill.` });
      },
    },
    {
      id: 'coins', name: 'COINS', icon: '💰',
      lesson: (g) => [
        { t: 'These are <b>coins</b>! A <b>penny</b> is worth <b>1 cent</b>. It is the only copper-colored coin.', v: vMoney([1], { names: true }) },
        { t: 'A <b>nickel</b> is worth <b>5 cents</b>. A <b>dime</b> is worth <b>10 cents</b>. The dime is the <b>smallest</b> coin, but it is worth more than a nickel!', v: coinRow([5, 10]) },
        { t: 'A <b>quarter</b> is worth <b>25 cents</b>. It is the biggest coin you see most days.', v: coinRow([25]) },
        g >= 1
          ? { t: 'We write cents with a <b>¢</b> sign. 25¢ is the same as <b>$0.25</b>. <b>100¢ make one dollar.</b>', v: bigSm('25¢ = $0.25<br>100¢ = $1') }
          : { t: 'Look at the <b>color</b> and the <b>size</b> to tell coins apart. Bumpy edges are on dimes and quarters.', v: coinRow([1, 5, 10, 25]) },
      ],
      gen(d, g) {
        const kinds = g === 0 && d < 0.4 ? [1, 5, 10] : COIN_V;
        const t = Math.random();
        if (t < 0.35 || g === 0 && t < 0.55) {
          const v = pick(kinds);
          const pics = shuffle(COIN_V.slice()).map((c) => pieceSVG(c, false));
          const ans = pieceSVG(v, false);
          return Q(`Which coin is a <b>${PIECES[v].name.toLowerCase()}</b>?`, ans, pics.filter((p) => p !== ans), {
            small: true, hint: v === 1 ? 'The penny is copper-colored.' : v === 10 ? 'The dime is the smallest coin.' : v === 25 ? 'The quarter is the biggest coin.' : 'The nickel is big and smooth on the edge.',
            why: `A ${PIECES[v].name.toLowerCase()} is worth ${fmt(v)}.`,
          });
        }
        if (t < 0.6 || g === 0) {
          const v = pick(kinds);
          return Q(`How much is a <b>${PIECES[v].name.toLowerCase()}</b> worth?`, fmt(v), COIN_V.filter((c) => c !== v).map(fmt).concat(['2¢', '50¢']), {
            vis: vMoney([v], { label: false }), hint: 'Penny 1, nickel 5, dime 10, quarter 25.', why: `A ${PIECES[v].name.toLowerCase()} is worth ${fmt(v)}.`,
          });
        }
        if (t < 0.8) {
          const pairs = g >= 2 ? [[1, 5], [1, 10], [5, 10], [5, 25], [1, 25], [25, 100], [10, 100], [5, 100]] : [[1, 5], [1, 10], [5, 10]];
          const [small, bigV] = pick(pairs);
          const n = bigV / small;
          const nm = PIECES[small].name.toLowerCase();
          return Q(`How many <b>${nm === 'penny' ? 'pennies' : nm + 's'}</b> make ${bigV === 100 ? '<b>one dollar</b>' : 'a <b>' + PIECES[bigV].name.toLowerCase() + '</b>'}?`, n, [n + 1, n - 1, n * 2, Math.round(n / 2), n + 5].filter((x) => x > 0), {
            hint: `A ${bigV === 100 ? 'dollar' : PIECES[bigV].name.toLowerCase()} is ${fmt(bigV)}. Count by ${small}s.`, why: `${n} × ${fmt(small)} = ${fmt(bigV)}.`,
          });
        }
        return Q('Which is worth <b>more</b>?', 'a dime', ['a nickel'], { order: ['a nickel', 'a dime'], vis: coinRow([5, 10]), hint: 'Bigger is not always worth more!', why: 'A dime is 10¢ and a nickel is 5¢. The dime is smaller, but it is worth more.' });
      },
    },
    {
      id: 'bills', name: 'BILLS', icon: '💵',
      lesson: (g) => [
        { t: 'Paper money is called <b>bills</b>. A <b>one-dollar bill</b> is worth <b>$1</b>. That is the same as <b>100 pennies</b>!', v: vMoney([100]) },
        { t: 'Bills come in <b>$1, $5, $10 and $20</b>. The number in the corner tells you how much it is worth.', v: vMoney([100, 500, 1000, 2000], { w: 160 }) },
        { t: 'You can swap money for the same amount. <b>Five $1 bills</b> = <b>one $5 bill</b>. Four quarters = $1.', v: vMoney([100, 100, 100, 100, 100], { w: 240 }) },
        g >= 3 ? { t: 'Grown-ups count money <b>biggest first</b>: bills, then quarters, dimes, nickels and pennies.', v: vMoney([1000, 500, 100, 25, 10, 1], { w: 240 }) } : null,
      ].filter(Boolean),
      gen(d, g) {
        const t = Math.random();
        if (g <= 1 && t < 0.4) {
          const v = pick([100, 500]);
          return Q('Which is worth <b>more</b>?', PIECES[v].short + ' bill', ['a quarter', 'a dime'].concat(['3 pennies']), { hint: 'A dollar is 100 cents.', why: `${PIECES[v].short} is ${v} cents. Coins here are worth less than that.` });
        }
        const swaps = g <= 1 ? [[100, 500, '$1 bills', '$5 bill'], [25, 100, 'quarters', 'dollar'], [10, 100, 'dimes', 'dollar']]
          : g <= 3 ? [[100, 500, '$1 bills', '$5 bill'], [500, 1000, '$5 bills', '$10 bill'], [500, 2000, '$5 bills', '$20 bill'], [1000, 2000, '$10 bills', '$20 bill'], [25, 500, 'quarters', '$5 bill']]
            : [[500, 2000, '$5 bills', '$20 bill'], [2000, 10000, '$20 bills', '$100'], [25, 1000, 'quarters', '$10 bill'], [10, 2000, 'dimes', '$20 bill'], [500, 5000, '$5 bills', '$50']];
        if (t < 0.75) {
          const [a, b, an, bn] = pick(swaps); const n = b / a;
          return Q(`How many <b>${an}</b> make ${bn.startsWith('$') && !bn.includes('bill') ? '<b>' + bn + '</b>' : 'a <b>' + bn + '</b>'}?`, n, [n + 1, n - 1, n * 2, Math.round(n / 2), n + 10].filter((x) => x > 0), {
            hint: `Count by ${fmt(a)} until you reach ${fmt(b)}.`, why: `${n} × ${fmt(a)} = ${fmt(b)}.`,
          });
        }
        // which pile is more?
        const A = g <= 1 ? [25, 25, 25] : g <= 3 ? [500, 100, 100, 25] : [1000, 1000, 500, 25, 25];
        const B = g <= 1 ? [100] : g <= 3 ? [500, 500] : [2000, 500, 100];
        const sa = A.reduce((s, v) => s + v, 0), sb = B.reduce((s, v) => s + v, 0);
        const flip = Math.random() < 0.5;
        const first = flip ? B : A, second = flip ? A : B;
        const s1 = flip ? sb : sa, s2 = flip ? sa : sb;
        return Q('Which pile has <b>more</b> money?', s1 > s2 ? 'TOP' : 'BOTTOM', [s1 > s2 ? 'BOTTOM' : 'TOP'], {
          order: ['TOP', 'BOTTOM'], vis: `<div class="piles">${vMoney(first, { w: 260 })}${vMoney(second, { w: 260 })}</div>`,
          hint: 'Count each pile, biggest pieces first.', why: `Top: ${fmt(s1)}. Bottom: ${fmt(s2)}.`,
        });
      },
    },
    {
      id: 'count', name: 'COUNT IT', icon: '🧮',
      lesson: (g) => [
        { t: 'To count money, <b>start with the biggest</b> piece. Then <b>count on</b>.', v: vMoney(g >= 2 ? [100, 25, 10, 1] : [10, 5, 1, 1], { w: 260 }) },
        g >= 2
          ? { t: '$1 ... then 25¢ more is <b>$1.25</b> ... 10¢ more is <b>$1.35</b> ... 1¢ more is <b>$1.36</b>!', v: bigSm('$1 → $1.25<br>→ $1.35 → $1.36') }
          : { t: '10¢ ... count on 5 is <b>15¢</b> ... then 16¢, <b>17¢</b>!', v: bigSm('10 → 15<br>→ 16 → 17') },
        { t: 'Count by <b>5s</b> for nickels, <b>10s</b> for dimes and <b>25s</b> for quarters: 25, 50, 75, 100!', v: vMoney([25, 25, 25, 25], { w: 200 }) },
      ],
      gen(d, g) {
        const sets = [[1, 5, 10], [1, 5, 10, 25], [1, 5, 10, 25, 100], [5, 10, 25, 100, 500], [1, 5, 10, 25, 100, 500, 1000], [1, 10, 25, 100, 500, 1000, 2000], [1, 5, 10, 25, 100, 500, 1000, 2000]];
        let kinds = sets[g];
        if (g === 0 && d < 0.5) kinds = [1, 5];
        const n = R(2, 3) + Math.round(d * (g === 0 ? 2 : 4));
        const list = []; for (let i = 0; i < n; i++) list.push(pick(kinds));
        list.sort((a, b) => b - a);
        const t = list.reduce((s, v) => s + v, 0);
        const present = [...new Set(list)];
        const wr = []; for (const v of present) { wr.push(t + v, t - v); }
        // classic mix-ups: a dime counted as a nickel, a nickel counted as a dime
        if (present.includes(10)) wr.push(t - 5); if (present.includes(5)) wr.push(t + 5);
        let run = 0; const steps = list.map((v) => fmt(run += v));
        return MQ('How much money is this?', t, wr, { vis: vMoney(list, { w: 280 }), hint: 'Start with the biggest piece, then count on.', why: `${steps.join(', ')}. That makes ${fmt(t)}.` });
      },
    },
    {
      id: 'change', name: 'MAKING CHANGE', icon: '🔁',
      lesson: (g) => [
        { t: 'When you pay with <b>more</b> money than something costs, you get money back. That is called <b>change</b>.', v: big('🍎 ' + (g === 0 ? '7¢' : '65¢')) },
        { t: g === 0 ? 'The apple is 7¢ and you pay with a <b>dime</b> (10¢). Count up: 7 ... 8, 9, 10. <b>3¢ change</b>!' : 'Shopkeepers <b>count up</b> from the price: 65¢ ... + a dime is 75¢ ... + a quarter is $1. Change: <b>35¢</b>.', v: g === 0 ? vMoney([1, 1, 1]) : vMoney([10, 25]) },
        { t: 'Always count your change! Taking a little time keeps it fair for everybody.', v: big('✅') },
      ],
      gen(d, g) {
        const items = ['🍎', '🍌', '🧃', '🍪', '✏️', '🎈', '📒', '🧸', '🪀', '⚽', '🎨', '📚'];
        const it = pick(items);
        let price, paid;
        if (g === 0) { price = R(1, 9); paid = 10; }
        else if (g === 1) { price = R(1, 19) * 5 - (d > 0.5 ? R(0, 4) : 0); paid = 100; }
        else if (g === 2) { price = R(10, 95) * 5 + (d > 0.5 ? R(0, 4) : 0); paid = price < 500 ? 500 : 1000; }
        else if (g <= 4) { price = R(150, 1950) + (d > 0.4 ? 0 : -(R(150, 1950) % 5)); paid = price <= 1000 ? 1000 : 2000; }
        else { price = R(600, 4800); paid = price <= 2000 ? 2000 : 5000; }
        price = Math.max(1, price);
        const ch = paid - price;
        return MQ(`${it} costs <b>${fmt(price)}</b>. You pay with <b>${fmt(paid)}</b>. How much change?`, ch, [ch + 10, ch - 10, price, ch + 100, ch - 1, paid - price + 5], {
          vis: vMoney(greedy(paid), { w: 200 }), hint: `Count up from ${fmt(price)} to ${fmt(paid)}.`, why: `${countUp(price, paid)}. Change: ${fmt(ch)}.`,
        });
      },
    },
    {
      id: 'smart', name: 'NEEDS & WANTS', icon: '🛒',
      lesson: (g) => [
        { t: 'A <b>need</b> is something you must have to live and be healthy: food, water, a home, warm clothes.', v: big('🍎 💧 🏠 🧥') },
        { t: 'A <b>want</b> is something nice to have, but you can live without it: toys, treats, games.', v: big('🧸 🍭 🎮') },
        { t: 'Smart savers pay for <b>needs first</b>, then <b>save</b>, then spend some on wants.', v: bigSm('1. NEEDS<br>2. SAVE<br>3. WANTS') },
        g >= 2 ? { t: 'Before you buy something big, <b>wait a day</b> and ask: do I still want it? Is there a better price?', v: big('🤔 ⏳') } : null,
        g >= 4 ? { t: 'Many grown-ups use a <b>budget</b>: about half for needs, some for wants, and at least <b>20% for saving</b>.', v: bigSm('NEEDS 50%<br>WANTS 30%<br>SAVE 20%') } : null,
      ].filter(Boolean),
      gen(d, g) {
        const NEEDS = [['🍎', 'an apple'], ['💧', 'water'], ['🧥', 'a winter coat'], ['🏠', 'a home'], ['🥦', 'vegetables'], ['🧼', 'soap'], ['👟', 'shoes that fit'], ['🍞', 'bread']];
        const WANTS = [['🎮', 'a video game'], ['🍭', 'a lollipop'], ['🧸', 'a teddy bear'], ['🎈', 'a balloon'], ['🪀', 'a yo-yo'], ['🍦', 'ice cream'], ['🎠', 'a fair ride'], ['🎸', 'a toy guitar']];
        const t = Math.random();
        if (g <= 1 || t < 0.3) {
          const need = Math.random() < 0.5, [e, n] = pick(need ? NEEDS : WANTS);
          return Q(`Is <b>${n}</b> a NEED or a WANT?`, need ? 'NEED' : 'WANT', [need ? 'WANT' : 'NEED'], { order: ['NEED', 'WANT'], vis: big(e), hint: 'Could you live and stay healthy without it?', why: need ? `You need ${n} to live and stay healthy.` : `${n[0].toUpperCase() + n.slice(1)} is fun, but you could live without it.` });
        }
        if (g <= 3 || t < 0.55) {
          const k = R(0, 3);
          if (k === 0) { const a = R(2, 6) * 100, b = a + R(1, 4) * 50; return MQ(`The same ball costs <b>${fmt(a)}</b> at one shop and <b>${fmt(b)}</b> at another. How much do you <b>save</b> at the cheaper shop?`, b - a, [a, b, b - a + 50], { vis: big('⚽'), hint: 'Take away: the bigger price minus the smaller price.', why: `${fmt(b)} − ${fmt(a)} = ${fmt(b - a)}. Comparing prices is a smart habit!` }); }
          if (k === 1) return Q('You get <b>$10</b> for your birthday. What is the <b>smartest</b> plan?', 'Save some, spend some', ['Spend it all today', 'Lose it in the couch', 'Buy candy every day'], { hint: 'Think about later, too.', why: 'Saving some and spending some lets you enjoy money now AND later.' });
          if (k === 2) return Q('You see a toy you really want. What should you do <b>first</b>?', 'Wait and think about it', ['Buy it right away', 'Grab it and run', 'Cry until you get it'], { hint: 'A smart habit for big buys.', why: 'Waiting a day helps you know if you REALLY want it. Lots of wants go away!' });
          const have = R(3, 8) * 100, cost = have + R(1, 5) * 100;
          return MQ(`You have <b>${fmt(have)}</b>. A kite costs <b>${fmt(cost)}</b>. How much more do you need?`, cost - have, [cost, have, cost - have + 100], { vis: big('🪁'), hint: 'Cost minus what you have.', why: `${fmt(cost)} − ${fmt(have)} = ${fmt(cost - have)}.` });
        }
        const k = R(0, 2);
        if (k === 0) {
          const n1 = pick([4, 5, 10]), p1 = n1 * pick([30, 40, 50]), n2 = n1 * 2, p2 = Math.round(p1 * 2 * pick([0.8, 0.9, 1.15, 1.25]) / 5) * 5;
          const u1 = p1 / n1, u2 = p2 / n2, cheaper = u1 < u2 ? 'A' : 'B';
          return Q(`Pencils: <b>A</b> = ${n1} for ${fmt(p1)}, <b>B</b> = ${n2} for ${fmt(p2)}. Which costs less <b>per pencil</b>?`, cheaper, [cheaper === 'A' ? 'B' : 'A'], { order: ['A', 'B'], vis: big('✏️'), hint: 'Divide price by how many pencils.', why: `A: ${fmt(Math.round(u1))} each. B: ${fmt(Math.round(u2))} each. ${cheaper} is the better buy.` });
        }
        const pay = pick([200, 400, 500, 1000, 2000]) * 100, pct = k === 1 ? 20 : pick([50, 30, 20]);
        const what = pct === 50 ? 'needs' : pct === 30 ? 'wants' : 'savings';
        const ans = pay * pct / 100;
        return MQ(`You earn <b>${fmt(pay)}</b>. Your budget puts <b>${pct}%</b> into <b>${what}</b>. How much is that?`, ans, [pay * (pct + 10) / 100, pay * (pct - 10) / 100, pct * 100, pay / 2], { hint: `${pct}% means ${pct} out of every 100.`, why: `${pct}% of ${fmt(pay)} = ${fmt(ans)}.` });
      },
    },
    {
      id: 'save', name: 'SAVE & GROW', icon: '🌱',
      lesson: (g) => [
        { t: '<b>Saving</b> means keeping money for later instead of spending it now. Little bits add up!', v: big('🐷 + 💵 + 💵') },
        { t: 'Pick a <b>goal</b>. If a kite costs $8 and you save <b>$2 every week</b>, you will have it in <b>4 weeks</b>!', v: bigSm('$2, $4, $6, $8<br>🪁 4 weeks!') },
        { t: 'Money in a <b>bank</b> is safe, and the bank pays you a little extra for keeping it there. That extra is called <b>interest</b>.', v: big('🏦 ✨') },
        g >= 3 ? { t: '<b>Pay yourself first</b>: when you get money, put the saving part away <b>before</b> you spend.', v: bigSm('PAYDAY → SAVE<br>→ then spend') } : null,
        g >= 5 ? { t: 'Interest earns interest too! That is <b>compound interest</b>. $100 at 10% a year: $110, then <b>$121</b>, then $133.10...', v: bigSm('$100 → $110<br>→ $121 → $133.10') } : null,
      ].filter(Boolean),
      gen(d, g) {
        const t = Math.random();
        if (g === 0) {
          const a = R(1, 6), b = R(1, 4);
          if (t < 0.5) return MQ(`You have <b>${a}¢</b> in your piggy bank. You put in <b>${b}¢</b> more. How much now?`, a + b, [a + b + 1, a + b - 1, a, b], { vis: big('🐷'), hint: 'Add them together.', why: `${a}¢ + ${b}¢ = ${a + b}¢.` });
          return Q('What does <b>saving</b> mean?', 'Keeping money for later', ['Spending it all now', 'Giving it to a dog', 'Hiding it and forgetting'], { hint: 'Think of a piggy bank.', why: 'Saving means keeping money to use later.' });
        }
        if (g <= 2 || t < 0.4) {
          const per = pick(g === 1 ? [1, 2, 5] : [2, 3, 4, 5]) * 100, wk = R(2, g === 1 ? 5 : 8), cost = per * wk;
          const item = pick(['🪁 kite', '⚽ ball', '🎨 paint set', '🧩 puzzle', '📚 book']);
          return Q(`A ${item.split(' ')[0]} <b>${item.split(' ')[1]}</b> costs <b>${fmt(cost)}</b>. You save <b>${fmt(per)}</b> every week. How many <b>weeks</b>?`, wk, [wk + 1, wk - 1, wk * 2, wk + 2].filter((x) => x > 0), { hint: `Count by ${fmt(per)} until you reach ${fmt(cost)}.`, why: `${fmt(cost)} ÷ ${fmt(per)} = ${wk} weeks.` });
        }
        if (g <= 4 || t < 0.6) {
          if (t < 0.75 && g >= 3) {
            const have = R(2, 8) * 100, per = R(2, 5) * 100, wk = R(2, 6), cost = have + per * wk;
            return Q(`You have <b>${fmt(have)}</b>. A bike helmet costs <b>${fmt(cost)}</b>. You save <b>${fmt(per)}</b> a week. How many weeks?`, wk, [wk + 1, wk - 1, Math.ceil(cost / per), wk + 2].filter((x) => x > 0), { vis: big('⛑️'), hint: 'First find how much more you need.', why: `${fmt(cost)} − ${fmt(have)} = ${fmt(cost - have)}. ${fmt(cost - have)} ÷ ${fmt(per)} = ${wk} weeks.` });
          }
          const bal = pick([50, 100, 200, 300]) * 100, rate = pick([2, 5, 10]);
          const i = bal * rate / 100;
          return MQ(`The bank pays <b>${rate}%</b> interest a year. You keep <b>${fmt(bal)}</b> there for a year. How much interest do you earn?`, i, [i * 2, i / 2, bal + i, rate * 100], { vis: big('🏦'), hint: `${rate}% means ${rate}¢ for every $1.`, why: `${rate}% of ${fmt(bal)} = ${fmt(i)}.` });
        }
        if (g === 6 && t > 0.85) {
          const r = pick([6, 8, 9, 12]);
          return Q(`The <b>Rule of 72</b>: 72 ÷ rate = years to double. At <b>${r}%</b> a year, about how many years until money doubles?`, 72 / r, [72 / r + 2, 72 / r - 2, r, 72].filter((x) => x > 0), { hint: `72 ÷ ${r}`, why: `72 ÷ ${r} = ${72 / r} years. Starting early gives money time to double!` });
        }
        const P = pick([100, 200, 500, 1000]) * 100, r = 10, y2 = Math.round(P * 1.21);
        return MQ(`You save <b>${fmt(P)}</b> at <b>10%</b> interest a year. Interest stays in the bank. How much after <b>2 years</b>?`, y2, [P * 1.2, P * 1.1, P * 2, y2 + P * 0.01], { hint: 'Year 1: add 10%. Year 2: add 10% of the NEW amount.', why: `${fmt(P)} → ${fmt(P * 1.1)} → ${fmt(y2)}. Interest on interest!` });
      },
    },
    {
      id: 'grown', name: 'GROWN-UP MONEY', icon: '💼',
      lesson: (g) => [
        { t: 'Grown-ups get money by <b>working at a job</b>. The money they get paid is called a <b>paycheck</b> or <b>pay</b>.', v: big('👩‍🍳 👨‍🔧 👩‍🏫') },
        { t: 'Grown-ups pay <b>bills</b> every month for things like a home, lights, water and the phone. Bills are <b>needs</b>!', v: big('🏠 💡 💧') },
        { t: 'A <b>debit card</b> spends money you already have in the bank. A <b>credit card</b> is <b>borrowing</b>: you have to pay it back, and if you are late it costs <b>extra</b>.', v: bigSm('DEBIT = my money<br>CREDIT = borrowed') },
        g >= 3 ? { t: 'An <b>emergency fund</b> (or rainy-day fund) is savings kept for surprises, like a broken car. It keeps a bad day from becoming a money problem.', v: big('☂️ 🚗') } : null,
        g >= 5 ? { t: 'Part of every paycheck goes to <b>taxes</b>. Taxes pay for schools, roads, parks and firefighters.', v: big('🏫 🛣️ 🚒') } : null,
      ].filter(Boolean),
      gen(d, g) {
        const t = Math.random();
        const concept = [
          ['Where do most grown-ups get money?', 'From working at a job', ['From a money tree', 'The bank gives it away', 'It falls from the sky']],
          ['When you pay with a card, what happens?', 'Real money still gets spent', ['It is free money', 'Nothing at all', 'The store pays for you']],
          ['Why do people keep money in a bank?', 'It is safe and earns interest', ['Banks eat money', 'So they can never use it', 'It turns into toys']],
          ['Which one is a <b>bill</b> grown-ups pay?', 'The water bill', ['A birthday present', 'A lollipop', 'A dollar bill on the floor']],
        ];
        const older = [
          ['What is a <b>credit card</b>?', 'Borrowed money you must pay back', ['Free money from the bank', 'A gift card', 'Your savings']],
          ['What is an <b>emergency fund</b>?', 'Savings for surprises', ['Money for toys', 'A fire truck', 'A credit card']],
          ['What does <b>good credit</b> come from?', 'Paying back on time', ['Borrowing a lot', 'Never checking', 'Buying more toys']],
          ['A <b>debit card</b> spends...', 'Money you already have', ['Borrowed money', 'Pretend money', 'The store\'s money']],
        ];
        if (g <= 2 || t < 0.35) { const [q, a, w] = pick(g >= 3 ? concept.concat(older) : concept); return Q(q, a, w, { hint: 'Think about what you learned.', why: a + '.' }); }
        if (g <= 4 || t < 0.6) {
          if (t < 0.5 || g <= 3) { const hrs = R(3, 8), rate = pick([8, 10, 12, 15]) * 100, pay = hrs * rate; return MQ(`You work <b>${hrs} hours</b> and earn <b>${fmt(rate)} an hour</b>. How much do you earn?`, pay, [pay + rate, pay - rate, hrs + rate, rate], { vis: big('🧾'), hint: 'Hours × pay per hour.', why: `${hrs} × ${fmt(rate)} = ${fmt(pay)}.` }); }
          const [q, a, w] = pick(older); return Q(q, a, w, { hint: 'Think about what you learned.', why: a + '.' });
        }
        if (t < 0.8) {
          const pay = pick([400, 500, 800, 1000]) * 100, tax = pick([10, 20, 25]), take = pay * (100 - tax) / 100;
          return MQ(`Your paycheck is <b>${fmt(pay)}</b>. Taxes take <b>${tax}%</b>. How much do you <b>take home</b>?`, take, [pay * tax / 100, pay, take - pay * 0.05, take + pay * 0.05], { vis: big('💼'), hint: `Find ${tax}% first, then take it away.`, why: `${tax}% of ${fmt(pay)} is ${fmt(pay * tax / 100)}. ${fmt(pay)} − that = ${fmt(take)}.` });
        }
        const owe = pick([100, 200, 500]) * 100, r = pick([20, 25]);
        return MQ(`You borrow <b>${fmt(owe)}</b> on a credit card at <b>${r}%</b> a year and don't pay any back. How much do you owe after a year?`, owe * (100 + r) / 100, [owe, owe * r / 100, owe * 2], { vis: big('💳'), hint: `Add ${r}% to what you borrowed.`, why: `${fmt(owe)} + ${r}% = ${fmt(owe * (100 + r) / 100)}. Borrowing costs extra!` });
      },
    },
  ];

  window.CoinMoney = { fmt, sayMoney, pieceSVG, vMoney, greedy, countUp, PIECES, DENOMS, TOPICS, shuffle, R, pick };
})();
