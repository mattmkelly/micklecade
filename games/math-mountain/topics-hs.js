// Math Mountain -- grades 7 to 12, the "big-kid" grades. They stay hidden until a player finishes
// the top level of a learning game (see shared/grades.js); game.js shows them once that is done.
// Same shape as topics.js: each topic is { id, name, icon, lesson: [{ t, v }], gen(d) }.
//   7  pre-algebra    8  exponents, Pythagoras, lines    9  algebra 1
//   10 geometry       11 algebra 2                        12 precalculus, calculus, statistics
// Answers that are not whole numbers are written as HTML strings (fractions, x-terms, pi...).
(function (global) {
  'use strict';
  const MM = global.MathMountain;
  const { R, pick, shuffle, Q, FQ, F, X, BL, MINUS: M, fmt, pn, gcd, big, SV, T } = MM;

  // ---------- writing maths ----------
  const V = (c) => `<span class="v">${c}</span>`;
  const Y = V('y'), I = V('i');
  const sup = (p) => `<sup>${p}</sup>`;
  const sm = (s) => `<div class="big sm">${s}</div>`;
  const sgn = () => (Math.random() < 0.5 ? -1 : 1);
  const fx = (arg = X, name = 'f') => `<i>${name}</i>(${arg})`;
  // one term: coefficient and variable; first = no leading " + "
  function term(c, v, first) {
    if (!c) return '';
    const a = Math.abs(c), body = (v && a === 1 ? '' : fmt(a)) + (v || '');
    if (first) return (c < 0 ? M : '') + body;
    return (c < 0 ? ' − ' : ' + ') + body;
  }
  // a list of [coef, variable] terms -> "3x − 2y + 5"
  function expr(list) {
    let s = '';
    for (const [c, v] of list) { if (c) s += term(c, v, !s); }
    return s || '0';
  }
  const lin = (a, b, v = X) => expr([[a, v], [b, '']]);
  // coefficients, highest power first: [1, 5, 6] -> x² + 5x + 6
  function poly(cs, v = X) {
    const n = cs.length - 1;
    return expr(cs.map((c, i) => [c, n - i === 0 ? '' : n - i === 1 ? v : v + sup(n - i)]));
  }
  const bin = (p) => `(${lin(1, p)})`;
  // a fraction in lowest terms, as HTML; whole numbers stay whole
  function rat(n, d) {
    if (d < 0) { n = -n; d = -d; }
    const g = gcd(n, d) || 1; n /= g; d /= g;
    if (d === 1) return fmt(n);
    return (n < 0 ? M : '') + F(Math.abs(n), d);
  }
  const pair = (a, b) => `(${fmt(a)}, ${fmt(b)})`;
  const cplx = (re, im) => (im ? expr([[re, ''], [im, I]]) : fmt(re));

  // ---------- pictures ----------
  // right triangle: a = upright leg, b = bottom leg, c = slanted side; o.A marks angle A (bottom right)
  function vTri(a, b, c, o = {}) {
    const W = 150, H = Math.max(50, Math.min(110, 150 * (o.h || 0.62)));
    let s = `<path d="M20 ${H + 14} H${20 + W} L20 14 Z" fill="#c7d2fe" stroke="#3730a3" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<path d="M20 ${H} h14 v14" fill="none" stroke="#3730a3" stroke-width="2"/>`;
    s += T(8, H / 2 + 14, a, 15, '#1e3a8a', 'end') + T(20 + W / 2, H + 30, b, 15, '#1e3a8a') + T(20 + W / 2 + 12, H / 2 + 2, c, 15, '#be185d', 'start');
    if (o.A) s += T(20 + W - 28, H + 6, 'A', 14, '#b45309') + `<path d="M${20 + W - 22} ${H + 14} A22 22 0 0 0 ${20 + W - 19} ${H + 3}" fill="none" stroke="#b45309" stroke-width="2"/>`;
    return SV(`-30 0 ${W + 80} ${H + 40}`, s);
  }
  // triangle with two angles known
  function vTriAng(a, b) {
    let s = '<path d="M20 120 H220 L90 20 Z" fill="#fde68a" stroke="#b45309" stroke-width="3" stroke-linejoin="round"/>';
    s += T(48, 108, a + '°', 15, '#7c2d12') + T(190, 108, b + '°', 15, '#7c2d12') + T(92, 46, '?', 17, '#be185d');
    return SV('0 0 240 132', s);
  }
  function vCircle(lab = 'r') {
    const s = '<circle cx="70" cy="60" r="50" fill="#bae6fd" stroke="#0369a1" stroke-width="3"/><circle cx="70" cy="60" r="3" fill="#0f172a"/>' +
      '<path d="M70 60 H120" stroke="#be185d" stroke-width="3"/>' + T(95, 50, lab, 15, '#be185d') +
      '<path d="M20 60 H70" stroke="#0369a1" stroke-width="1.5" stroke-dasharray="4 3"/>';
    return SV('0 0 140 120', s);
  }
  // coordinate plane -6..6 with labelled points [x, y, label]
  function vPlane(pts, line) {
    const u = 10;
    let s = '';
    for (let k = -6; k <= 6; k++) s += `<path d="M${k * u} ${-6 * u}V${6 * u}M${-6 * u} ${k * u}H${6 * u}" stroke="${k ? 'rgba(30,58,138,.15)' : '#334155'}" stroke-width="${k ? 0.6 : 1.4}"/>`;
    if (line) s += `<path d="M${line[0] * u} ${-line[1] * u}L${line[2] * u} ${-line[3] * u}" stroke="#7c3aed" stroke-width="2"/>`;
    for (const [x, y, lab] of pts) s += `<circle cx="${x * u}" cy="${-y * u}" r="3" fill="#be185d"/>` + (lab ? T(x * u + 4, -y * u - 7, lab, 8, '#831843', 'start') : '');
    return SV(`${-6.5 * u} ${-6.5 * u} ${13 * u} ${13 * u}`, s);
  }
  const TRIPLES = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10], [9, 12, 15]];

  // =====================================================================================
  // GRADE 7 -- pre-algebra
  // =====================================================================================
  const G7 = [
    {
      id: 'g7-int', name: 'Integer Rules', icon: '✖️',
      lesson: [
        { t: 'Multiply or divide two numbers with the <b>same sign</b> and the answer is <b>positive</b>.', v: big(`3 × 4 = 12<br>${M}3 × ${M}4 = 12`) },
        { t: '<b>Different signs</b> give a <b>negative</b> answer.', v: big(`${M}3 × 4 = ${M}12<br>12 ÷ (${M}4) = ${M}3`) },
        { t: `For powers, count the negatives. (${M}2)${sup(3)} = ${M}2 × ${M}2 × ${M}2 = <b>${M}8</b>. An even number of negatives makes a positive.`, v: big(`(${M}2)${sup(2)} = 4<br>(${M}2)${sup(3)} = ${M}8`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['mul', 'div'] : d < 0.75 ? ['mul', 'div', 'three'] : ['div', 'pow', 'three']);
        const rule = (p) => (p > 0 ? 'Same signs, so it is positive' : 'Different signs, so it is negative');
        const hint = 'Work out the numbers first, then the sign: same signs make +, different signs make −.';
        if (kind === 'mul') {
          const a = R(2, 12) * sgn(), b = R(2, 12) * (a > 0 ? -1 : sgn()), p = a * b;
          return Q({ q: `${fmt(a)} × ${pn(b)} = ${BL}`, ans: p, min: -999, wrong: [-p, a + b, -(a + b)], hint, why: `${Math.abs(a)} × ${Math.abs(b)} = ${Math.abs(p)}. ${rule(p)}: <b>${fmt(p)}</b>.` });
        }
        if (kind === 'div') {
          const b = R(2, 9) * sgn(), q = R(2, 12) * (b > 0 ? -1 : sgn()), n = b * q;
          return Q({ q: `${fmt(n)} ÷ ${pn(b)} = ${BL}`, ans: q, min: -999, wrong: [-q, n + b, -(n + b)], hint, why: `${Math.abs(n)} ÷ ${Math.abs(b)} = ${Math.abs(q)}. ${rule(q)}: <b>${fmt(q)}</b>.` });
        }
        if (kind === 'pow') {
          const a = R(2, 5), k = a <= 3 ? R(2, 4) : R(2, 3), p = Math.pow(-a, k);
          return Q({ q: `(${M}${a})${sup(k)} = ${BL}`, ans: p, min: -9999, wrong: [-p, -a * k, a * k], hint: `Multiply ${M}${a} by itself ${k} times. Count the negatives!`, why: `${k} negatives is an ${k % 2 ? 'odd' : 'even'} number, so the answer is ${p > 0 ? 'positive' : 'negative'}: <b>${fmt(p)}</b>.` });
        }
        const a = R(2, 5) * sgn(), b = R(2, 5) * sgn(), c = R(2, 4) * sgn(), p = a * b * c;
        return Q({ q: `${fmt(a)} × ${pn(b)} × ${pn(c)} = ${BL}`, ans: p, min: -999, wrong: [-p, a + b + c, p + (p > 0 ? -2 : 2)], hint: 'Multiply two at a time, keeping track of the sign.', why: `${fmt(a)} × ${pn(b)} = ${fmt(a * b)}, then × ${pn(c)} = <b>${fmt(p)}</b>.` });
      },
    },
    {
      id: 'g7-pct', name: 'Tips, Tax and Sales', icon: '\u{1F3F7}️',
      lesson: [
        { t: 'A <b>tip</b> or <b>tax</b> is a percent of the price that gets <b>added</b> on. 20% tip on $40: 10% is $4, so 20% is <b>$8</b>.', v: big('20% of $40 = $8') },
        { t: 'A <b>discount</b> takes a percent <b>off</b>. 25% off $80: a quarter of 80 is 20, so it costs 80 − 20 = <b>$60</b>.', v: big('$80 − 25% = $60') },
        { t: '<b>Percent change</b> = change ÷ original × 100. From $50 to $60 is a change of 10, and 10 ÷ 50 = <b>20%</b> increase.', v: sm('change ÷ original × 100<br>10 ÷ 50 = 20%') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['tip', 'off'] : d < 0.7 ? ['tip', 'off', 'total', 'change'] : ['change', 'total', 'up', 'off']);
        if (kind === 'tip') { const p = pick([10, 15, 20, 25]), bill = 20 * R(1, 8), t = bill * p / 100; return Q({ q: `Dinner costs $${bill}. How much is a <b>${p}% tip</b>?`, ans: t, pre: '$', wrong: [bill - t, p, bill + t, t * 2], hint: 'Find 10% first: divide by 10.', why: `${p}% of $${bill} = ${F(p, 100)} × ${bill} = <b>$${fmt(t)}</b>.` }); }
        if (kind === 'off') { const p = pick([10, 20, 25, 50, 30]), pr = 20 * R(2, 10), off = pr * p / 100; return Q({ q: `A $${pr} bike is <b>${p}% off</b>. What is the sale price?`, ans: pr - off, pre: '$', wrong: [off, pr - p, pr + off], hint: `Find ${p}% of $${pr}, then take it away.`, why: `${p}% of $${pr} is $${fmt(off)}. $${pr} − $${fmt(off)} = <b>$${fmt(pr - off)}</b>.` }); }
        if (kind === 'total') { const p = pick([5, 10, 15, 20]), pr = 20 * R(1, 10), tx = pr * p / 100; return Q({ q: `A game costs $${pr}. With <b>${p}% sales tax</b>, what is the total?`, ans: pr + tx, pre: '$', wrong: [tx, pr + p, pr - tx], hint: `Find the tax (${p}% of ${pr}), then add it on.`, why: `Tax is $${fmt(tx)}. $${pr} + $${fmt(tx)} = <b>$${fmt(pr + tx)}</b>.` }); }
        if (kind === 'up') { const p = pick([20, 25, 50, 40]), c = 20 * R(1, 8), up = c * p / 100; return Q({ q: `A shop buys a lamp for $${c} and marks the price <b>up ${p}%</b>. What does the shop sell it for?`, ans: c + up, pre: '$', wrong: [up, c + p, c * 2], hint: `Find ${p}% of $${c} and add it on.`, why: `${p}% of $${c} is $${fmt(up)}, so the price is <b>$${fmt(c + up)}</b>.` }); }
        const old = pick([20, 40, 80, 200]), p = pick([10, 20, 25, 50, 75]), up = Math.random() < 0.6, nw = old + (up ? 1 : -1) * old * p / 100, ch = Math.abs(nw - old);
        return Q({ q: `A price went from $${old} to $${nw}. What is the percent <b>${up ? 'increase' : 'decrease'}</b>?`, ans: p, unit: '%', wrong: [ch, Math.round(ch / nw * 100), 100 - p, p * 2], hint: 'Change ÷ ORIGINAL price, then × 100.', why: `The change is $${ch}. ${ch} ÷ ${old} = ${F(p, 100)} = <b>${p}%</b>.` });
      },
    },
    {
      id: 'g7-eq', name: 'Equations and Inequalities', icon: '⚖️',
      lesson: [
        { t: `Two-step equations: undo the adding first, then the multiplying. 3${X} − 4 = 11 → 3${X} = 15 → ${X} = <b>5</b>.`, v: big(`3${X} − 4 = 11<br>3${X} = 15<br>${X} = 5`) },
        { t: `An <b>inequality</b> uses &lt;, &gt;, ≤ or ≥. Solve it just like an equation: 2${X} + 1 &lt; 9 → 2${X} &lt; 8 → ${X} &lt; 4.`, v: big(`2${X} + 1 &lt; 9<br>${X} &lt; 4`) },
        { t: `The one trick: when you multiply or divide by a <b>negative</b>, <b>flip</b> the sign. ${M}2${X} &lt; 6 → ${X} &gt; ${M}3.`, v: big(`${M}2${X} &lt; 6<br>${X} &gt; ${M}3`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['eq', 'eq', 'ineq'] : d < 0.75 ? ['eq', 'ineq', 'neg'] : ['ineq', 'neg', 'eq']);
        if (kind === 'eq') {
          const a = R(2, 9) * (d > 0.5 ? sgn() : 1), x = R(-9, 9) || 4, b = (R(1, 12)) * sgn(), c = a * x + b;
          const alt = (c + b) / a;
          return Q({ q: `${lin(a, b)} = ${fmt(c)}`, ans: x, min: -999, wrong: [-x, Number.isInteger(alt) ? alt : x + 2, c - b], hint: `First ${b > 0 ? 'take ' + b + ' off' : 'add ' + -b + ' to'} both sides. Then divide by ${pn(a)}.`, why: `${lin(a, 0)} = ${fmt(c - b)}, and ${fmt(c - b)} ÷ ${pn(a)} = <b>${fmt(x)}</b>.` });
        }
        const OPS = ['&lt;', '&gt;', '≤', '≥'], FLIP = { '&lt;': '&gt;', '&gt;': '&lt;', '≤': '≥', '≥': '≤' };
        const op = pick(OPS), neg = kind === 'neg';
        const a = R(2, 6) * (neg ? -1 : 1), v = R(-6, 9), b = R(1, 12) * sgn(), c = a * v + b;
        const aop = neg ? FLIP[op] : op;
        const S = (o, n) => `${X} ${o} ${fmt(n)}`;
        return Q({ q: `Solve: ${lin(a, b)} ${op} ${fmt(c)}`, ans: S(aop, v), wrong: [S(FLIP[aop], v), S(aop, c - b), S(aop, -v || v + 3), S(FLIP[aop], -v || 2), S(aop, v + 1)], hint: neg ? `You will divide by a negative number. Remember to FLIP the sign!` : `Solve it like an equation. The sign stays the same.`, why: `${a}${X} ${op} ${fmt(c - b)}. Divide by ${pn(a)}${neg ? ' and flip the sign' : ''}: <b>${S(aop, v)}</b>.` });
      },
    },
    {
      id: 'g7-circle', name: 'Circles', icon: '⭕',
      lesson: [
        { t: 'The <b>radius</b> goes from the centre to the edge. The <b>diameter</b> goes all the way across, so it is <b>2 × radius</b>.', v: vCircle('r') },
        { t: 'The distance around is the <b>circumference</b>: C = 2πr (or π × diameter). π is about 3.14. With r = 5, C = <b>10π</b>.', v: big('C = 2πr<br>r = 5 → 10π') },
        { t: 'The <b>area</b> is A = πr². With r = 5, A = π × 5 × 5 = <b>25π</b>. Watch out: square the RADIUS, not the diameter.', v: big('A = πr²<br>r = 5 → 25π') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['dia', 'circ'] : d < 0.7 ? ['circ', 'area', 'dia'] : ['area', 'areaD', 'back', 'circ']);
        const r = R(2, 12);
        if (kind === 'dia') { if (Math.random() < 0.5) return Q({ q: `A circle has a radius of ${r} cm. What is its <b>diameter</b>?`, vis: vCircle(r), ans: 2 * r, unit: ' cm', wrong: [r, r * r, r + 2], hint: 'The diameter is two radii long.', why: `2 × ${r} = <b>${2 * r} cm</b>.` }); return Q({ q: `A circle has a diameter of ${2 * r} m. What is its <b>radius</b>?`, ans: r, unit: ' m', wrong: [4 * r, 2 * r, r + 1], hint: 'The radius is half the diameter.', why: `${2 * r} ÷ 2 = <b>${r} m</b>.` }); }
        if (kind === 'circ') return Q({ q: `A circle has radius ${r}. What is its <b>circumference</b>?`, vis: d < 0.5 ? vCircle(r) : '', ans: 2 * r, unit: 'π', min: 2, wrong: [r, r * r, 4 * r], hint: 'C = 2πr.', why: `C = 2 × π × ${r} = <b>${2 * r}π</b>.` });
        if (kind === 'area') return Q({ q: `A circle has radius ${r}. What is its <b>area</b>?`, vis: d < 0.6 ? vCircle(r) : '', ans: r * r, unit: 'π', min: 2, wrong: [2 * r, 2 * r * r, 4 * r * r], hint: 'A = πr². Square the radius.', why: `A = π × ${r} × ${r} = <b>${r * r}π</b>.` });
        if (kind === 'areaD') return Q({ q: `A round rug has a <b>diameter</b> of ${2 * r} feet. What is its area?`, ans: r * r, unit: 'π', min: 2, wrong: [4 * r * r, 2 * r, r], hint: 'Find the radius first: half the diameter.', why: `The radius is ${r}. A = π × ${r}² = <b>${r * r}π</b> square feet.` });
        return Q({ q: `A circle’s circumference is ${2 * r}π. What is its <b>radius</b>?`, ans: r, wrong: [2 * r, r * r, r + 2], min: 1, hint: 'C = 2πr. What times 2 makes ' + 2 * r + '?', why: `2πr = ${2 * r}π, so r = <b>${r}</b>.` });
      },
    },
    {
      id: 'g7-prob', name: 'Probability', icon: '\u{1F3B2}',
      lesson: [
        { t: '<b>Probability</b> = number of ways it can happen ÷ number of possible outcomes. It is between 0 (impossible) and 1 (certain).', v: sm('ways it happens<br>÷ all outcomes') },
        { t: `A bag has 3 red and 5 blue marbles. P(red) = 3 out of 8 = ${F(3, 8)}.`, v: big(`P(red) = ${F(3, 8)}`) },
        { t: `P(NOT red) is everything else: 1 − ${F(3, 8)} = ${F(5, 8)}. If you roll a die 60 times, you expect each number about 60 × ${F(1, 6)} = <b>10</b> times.`, v: big(`1 − ${F(3, 8)} = ${F(5, 8)}`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['die', 'bag'] : d < 0.7 ? ['bag', 'not', 'die', 'spin'] : ['not', 'expect', 'bag', 'spin']);
        const red = (n, dd) => { const g = gcd(n, dd); return [n / g, dd / g]; };
        if (kind === 'die') {
          const t = pick(['even', 'gt', 'one', 'le']), k = R(2, 4);
          const ways = t === 'even' ? 3 : t === 'gt' ? 6 - k : t === 'one' ? 1 : k;
          const desc = t === 'even' ? 'an even number' : t === 'gt' ? `a number greater than ${k}` : t === 'one' ? `a ${k}` : `a number less than or equal to ${k}`;
          return FQ({ q: `You roll a normal die. What is the probability of rolling <b>${desc}</b>?`, ans: red(ways, 6), wrong: [[ways, 6 - ways], [1, ways + 1]], hint: 'A die has 6 sides. How many of them work?', why: `${ways} of the 6 sides work: ${F(ways, 6)}${gcd(ways, 6) > 1 ? ' = ' + F(...red(ways, 6)) : ''}.` });
        }
        const r = R(1, 6), b = R(2, 7), g = R(0, 4), tot = r + b + g;
        const bagTxt = `A bag has ${r} red, ${b} blue${g ? ' and ' + g + ' green' : ''} marbles.`;
        if (kind === 'bag') return FQ({ q: `${bagTxt} You pick one without looking. What is <b>P(blue)</b>?`, ans: red(b, tot), wrong: [[b, tot - b], [1, tot], [r, tot]], hint: `How many marbles in all? ${r} + ${b}${g ? ' + ' + g : ''}.`, why: `${b} blue out of ${tot} marbles: ${F(b, tot)}${gcd(b, tot) > 1 ? ' = ' + F(...red(b, tot)) : ''}.` });
        if (kind === 'not') return FQ({ q: `${bagTxt} What is the probability of <b>NOT</b> picking red?`, ans: red(tot - r, tot), wrong: [[r, tot], [tot - r, r], [b, tot]], hint: 'Count every marble that is not red.', why: `${tot - r} of the ${tot} marbles are not red: ${F(tot - r, tot)}${gcd(tot - r, tot) > 1 ? ' = ' + F(...red(tot - r, tot)) : ''}.` });
        if (kind === 'spin') { const n = pick([4, 5, 6, 8, 10]), k = R(1, n - 1); return FQ({ q: `A spinner has ${n} equal parts. ${k} of them are yellow. What is <b>P(yellow)</b>?`, ans: red(k, n), wrong: [[k, n - k], [n - k, n], [1, k + 1]], hint: 'Yellow parts ÷ all the parts.', why: `${k} out of ${n}: ${F(k, n)}${gcd(k, n) > 1 ? ' = ' + F(...red(k, n)) : ''}.` }); }
        const sides = pick([6, 4, 10]), n = sides * R(3, 12);
        return Q({ q: `A ${sides}-sided die is rolled ${n} times. About how many times do you expect a <b>${R(1, sides)}</b>?`, ans: n / sides, wrong: [sides, n / 2, n - sides], hint: `Each number has a ${F(1, sides)} chance.`, why: `${n} × ${F(1, sides)} = <b>${n / sides}</b>.` });
      },
    },
  ];

  // =====================================================================================
  // GRADE 8 -- exponents, Pythagoras, lines, systems, volume
  // =====================================================================================
  const G8 = [
    {
      id: 'g8-exp', name: 'Exponents', icon: '⚡',
      lesson: [
        { t: `An <b>exponent</b> says how many times to multiply. 2${sup(4)} = 2 × 2 × 2 × 2 = <b>16</b>. Anything to the power 0 is <b>1</b>.`, v: big(`2${sup(4)} = 16<br>7${sup(0)} = 1`) },
        { t: `Multiplying powers of the same base? <b>Add</b> the exponents. Power of a power? <b>Multiply</b> them.`, v: big(`${X}${sup(3)} · ${X}${sup(4)} = ${X}${sup(7)}<br>(${X}${sup(3)})${sup(2)} = ${X}${sup(6)}`) },
        { t: `<b>Scientific notation</b> writes big numbers as a number times a power of 10. 3.2 × 10${sup(4)} = <b>32,000</b> (move the point 4 places right).`, v: big(`3.2 × 10${sup(4)}<br>= 32,000`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['eval', 'zero', 'rule'] : d < 0.7 ? ['rule', 'eval', 'sci', 'neg'] : ['rule', 'sci', 'sciw', 'neg']);
        if (kind === 'eval') { const a = R(2, 5), n = a <= 3 ? R(2, 5) : R(2, 3), p = Math.pow(a, n); return Q({ q: `${a}${sup(n)} = ${BL}`, ans: p, wrong: [a * n, a + n, Math.pow(a, n - 1)], hint: `Multiply ${a} by itself ${n} times.`, why: `${Array(n).fill(a).join(' × ')} = <b>${fmt(p)}</b>.` }); }
        if (kind === 'zero') { const a = R(2, 99); return Q({ q: `${a}${sup(0)} = ${BL}`, ans: 1, wrong: [0, a, 10], hint: 'Any number (except 0) to the power 0 is the same.', why: `Anything to the power 0 is <b>1</b>.` }); }
        if (kind === 'rule') {
          const a = R(2, 6), b = R(2, 5), t = pick(['mul', 'pow', 'div']);
          const P = (n) => `${X}${sup(n)}`;
          if (t === 'mul') return Q({ q: `Simplify: ${P(a)} · ${P(b)}`, ans: P(a + b), wrong: [P(a * b), `2${P(a + b)}`, P(Math.abs(a - b) || a + b + 1), P(a + b + 1)], hint: 'Same base, multiplying: ADD the exponents.', why: `${a} + ${b} = ${a + b}, so it is <b>${P(a + b)}</b>.` });
          if (t === 'pow') return Q({ q: `Simplify: (${P(a)})${sup(b)}`, ans: P(a * b), wrong: [P(a + b), `${b}${P(a)}`, P(a * b + 1), P(Math.pow(a, b))], hint: 'A power of a power: MULTIPLY the exponents.', why: `${a} × ${b} = ${a * b}, so it is <b>${P(a * b)}</b>.` });
          const top = a + b;
          return Q({ q: `Simplify: ${P(top)} ÷ ${P(b)}`, ans: P(a), wrong: [P(top + b), Number.isInteger(top / b) && top / b !== a ? P(top / b) : P(a + 1), `${X}`, P(a - 1 || a + 2)], hint: 'Same base, dividing: SUBTRACT the exponents.', why: `${top} − ${b} = ${a}, so it is <b>${P(a)}</b>.` });
        }
        if (kind === 'neg') { const a = R(2, 5), n = a <= 3 ? R(1, 3) : R(1, 2), p = Math.pow(a, n); return FQ({ q: `${a}${sup(M + n)} = ${BL}`, ans: [1, p], wrong: [[1, a * n], [a, n], [1, p + 1]], hint: `A negative exponent means "one over": ${F(1, a + sup(n))}.`, why: `${a}${sup(M + n)} = ${F(1, a + sup(n))} = ${F(1, p)}.` }); }
        const c10 = R(11, 99), p = R(3, 6), num = c10 * Math.pow(10, p - 1);
        const cs = (c10 / 10).toFixed(c10 % 10 ? 1 : 0);
        if (kind === 'sci') return Q({ q: `${cs} × 10${sup(p)} = ${BL}`, ans: num, wrong: [num / 10, num * 10, c10 * p], hint: `Move the decimal point ${p} places to the right.`, why: `${cs} × 10${sup(p)} = <b>${fmt(num)}</b>.` });
        const S = (c, e) => `${c} × 10${sup(e)}`;
        return Q({ q: `Write <b>${fmt(num)}</b> in scientific notation.`, ans: S(cs, p), wrong: [S(cs, p - 1), S(cs, p + 1), S(String(c10), p - 1), S((c10 / 100).toFixed(2), p + 1)], hint: 'Put the point after the first digit, then count how many places it moved.', why: `The point moves ${p} places: <b>${S(cs, p)}</b>.` });
      },
    },
    {
      id: 'g8-pyth', name: 'Pythagorean Theorem', icon: '\u{1F4D0}',
      lesson: [
        { t: 'In a <b>right triangle</b>, the longest side (across from the square corner) is the <b>hypotenuse</b>, c.', v: vTri('a', 'b', 'c') },
        { t: '<b>a² + b² = c²</b>. With legs 3 and 4: 9 + 16 = 25, and √25 = <b>5</b>.', v: vTri(3, 4, 5) },
        { t: 'Missing a leg? Subtract instead: c² − a² = b². Hypotenuse 13, leg 5: 169 − 25 = 144, √144 = <b>12</b>.', v: big('169 − 25 = 144<br>√144 = 12') },
      ],
      gen(d) {
        const kind = pick(d < 0.3 ? ['sqrt', 'hyp'] : d < 0.65 ? ['hyp', 'leg', 'sqrt'] : ['leg', 'hyp', 'ladder']);
        const t = pick(d < 0.5 ? TRIPLES.slice(0, 2).concat([[6, 8, 10]]) : TRIPLES), k = t[0] === 3 && d > 0.5 ? R(1, 3) : 1;
        const [a, b, c] = t.map((v) => v * k);
        if (kind === 'sqrt') { const n = R(4, 15); return Q({ q: `√${n * n} = ${BL}`, ans: n, wrong: [n * n / 2, n + 1, n - 1, n * 2], hint: 'What number times ITSELF makes ' + n * n + '?', why: `${n} × ${n} = ${n * n}, so √${n * n} = <b>${n}</b>.` }); }
        if (kind === 'hyp') return Q({ q: `The legs are ${a} and ${b}. How long is the <b>hypotenuse</b>?`, vis: vTri(a, b, '?', { h: a / b }), ans: c, wrong: [a + b, c + 1, c - 1, a * a + b * b], hint: `${a}² + ${b}² = c². Then take the square root.`, why: `${a * a} + ${b * b} = ${c * c}, and √${c * c} = <b>${c}</b>.` });
        if (kind === 'leg') return Q({ q: `The hypotenuse is ${c} and one leg is ${a}. How long is the <b>other leg</b>?`, vis: vTri(a, '?', c, { h: a / b }), ans: b, wrong: [c - a, c + a, b + 1, b - 1], hint: `c² − a² = b²: ${c * c} − ${a * a}.`, why: `${c * c} − ${a * a} = ${b * b}, and √${b * b} = <b>${b}</b>.` });
        return Q({ q: `A ${c} ft ladder leans on a wall. Its foot is ${a} ft from the wall. How high up the wall does it reach?`, ans: b, unit: ' ft', wrong: [c - a, c + a, b + 2], hint: 'The ladder is the hypotenuse.', why: `${c}² − ${a}² = ${c * c - a * a} = ${b}², so <b>${b} ft</b>.` });
      },
    },
    {
      id: 'g8-slope', name: 'Slope and Lines', icon: '\u{1F4C8}',
      lesson: [
        { t: '<b>Slope</b> is how steep a line is: <b>rise ÷ run</b>. Going up 6 while going right 2 is a slope of <b>3</b>.', v: vPlane([[-1, -2, ''], [1, 4, '']], [-2, -5, 2, 7]) },
        { t: `From two points: slope = (y₂ − y₁) ÷ (x₂ − x₁). From (1, 2) to (3, 8): 6 ÷ 2 = <b>3</b>. Lines going DOWN have a negative slope.`, v: sm('(8 − 2) ÷ (3 − 1)<br>= 6 ÷ 2 = 3') },
        { t: `In ${Y} = m${X} + b, <b>m</b> is the slope and <b>b</b> is where it crosses the y-axis. ${Y} = 2${X} + 5 has slope 2 and starts at 5.`, v: big(`${Y} = 2${X} + 5`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['two', 'read'] : d < 0.7 ? ['two', 'read', 'eval', 'frac'] : ['frac', 'eq', 'eval', 'two']);
        if (kind === 'two') {
          const m = (R(1, 4)) * sgn(), dx = R(1, 3), x1 = R(-5, 5 - dx), y1 = R(-5, 5), x2 = x1 + dx, y2 = y1 + m * dx;
          const show = Math.abs(y2) <= 6 && d < 0.6;
          return Q({ q: `What is the slope of the line through ${pair(x1, y1)} and ${pair(x2, y2)}?`, vis: show ? vPlane([[x1, y1, pair(x1, y1)], [x2, y2, pair(x2, y2)]]) : '', ans: m, min: -99, wrong: [-m, m * dx === m ? m + 1 : m * dx, y2 - y1 + x2 - x1], hint: 'Rise over run: (change in y) ÷ (change in x).', why: `(${fmt(y2)} − ${pn(y1)}) ÷ (${fmt(x2)} − ${pn(x1)}) = ${m * dx} ÷ ${dx} = <b>${fmt(m)}</b>.` });
        }
        if (kind === 'frac') {
          let dy, dx; do { dy = R(1, 5) * sgn(); dx = R(2, 5); } while (gcd(dy, dx) !== 1);
          const x1 = R(-4, 1), y1 = R(-4, 2);
          return Q({ q: `What is the slope of the line through ${pair(x1, y1)} and ${pair(x1 + dx, y1 + dy)}?`, ans: rat(dy, dx), wrong: [rat(dx, dy), rat(-dy, dx), rat(dy, dx + 1), fmt(dy)], hint: 'Rise ÷ run. It is fine to leave it as a fraction.', why: `Rise ${fmt(dy)}, run ${dx}: <b>${rat(dy, dx)}</b>.` });
        }
        const m = R(1, 6) * sgn(), b = R(-9, 9) || 4;
        if (kind === 'read') { const ask = pick(['slope', 'int']); return Q({ q: `For the line ${Y} = ${lin(m, b)}, what is the <b>${ask === 'slope' ? 'slope' : 'y-intercept'}</b>?`, ans: ask === 'slope' ? m : b, min: -99, wrong: ask === 'slope' ? [b, -m, m + 1] : [m, -b, b + 1], hint: `${Y} = m${X} + b: m is the slope, b is the y-intercept.`, why: `In ${Y} = ${lin(m, b)}, m = ${fmt(m)} and b = ${fmt(b)}. The answer is <b>${fmt(ask === 'slope' ? m : b)}</b>.` }); }
        if (kind === 'eval') { const x = R(-5, 6); return Q({ q: `${Y} = ${lin(m, b)}. What is ${Y} when ${X} = ${fmt(x)}?`, ans: m * x + b, min: -999, wrong: [m + x + b, m * x - b, m * (x + b)], hint: `Put ${fmt(x)} in place of ${X}.`, why: `${fmt(m)} × ${pn(x)} = ${fmt(m * x)}, ${b > 0 ? 'plus ' + b : 'minus ' + -b} = <b>${fmt(m * x + b)}</b>.` }); }
        const E = (mm, bb) => `${Y} = ${lin(mm, bb)}`;
        return Q({ q: `Which line has slope ${fmt(m)} and crosses the y-axis at ${fmt(b)}?`, ans: E(m, b), wrong: [E(b, m), E(-m, b), E(m, -b), E(m, b + 1)], hint: `Use ${Y} = m${X} + b.`, why: `m = ${fmt(m)}, b = ${fmt(b)}: <b>${E(m, b)}</b>.` });
      },
    },
    {
      id: 'g8-sys', name: 'Systems of Equations', icon: '\u{1F500}',
      lesson: [
        { t: `A <b>system</b> is two equations that are both true at once. ${X} + ${Y} = 10 and ${X} − ${Y} = 2. Which ${X} and ${Y} work for both?`, v: big(`${X} + ${Y} = 10<br>${X} − ${Y} = 2`) },
        { t: `<b>Add</b> the equations and ${Y} disappears: 2${X} = 12, so ${X} = 6. Then 6 + ${Y} = 10, so ${Y} = 4.`, v: big(`2${X} = 12<br>${X} = 6, ${Y} = 4`) },
        { t: `Or <b>substitute</b>. If ${Y} = 2${X} and ${X} + ${Y} = 9, swap ${Y} for 2${X}: 3${X} = 9, so ${X} = 3 and ${Y} = 6.`, v: big(`${X} + 2${X} = 9<br>${X} = 3`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['add', 'sub'] : d < 0.75 ? ['add', 'sub', 'pair'] : ['pair', 'add', 'scale']);
        const lo = d > 0.6 ? -6 : 1;
        let x = R(lo, 9), y = R(lo, 9); if (x === y) x = y + 2;
        if (kind === 'add') {
          const s = x + y, df = x - y, askX = Math.random() < 0.5;
          return Q({ q: `${X} + ${Y} = ${fmt(s)}<br>${X} − ${Y} = ${fmt(df)}<br>What is ${askX ? X : Y}?`, ans: askX ? x : y, min: -99, wrong: askX ? [y, s, s - df, df] : [x, df, s + df, s], hint: `Add the two equations: the ${Y}s cancel.`, why: `2${X} = ${fmt(s + df)}, so ${X} = ${fmt(x)}${askX ? '' : `, and ${Y} = ${fmt(s)} − ${pn(x)} = ${fmt(y)}`}. The answer is <b>${fmt(askX ? x : y)}</b>.` });
        }
        if (kind === 'sub') {
          const m = R(2, 4), xx = R(1, 6), yy = m * xx, s = xx + yy, askX = Math.random() < 0.5;
          return Q({ q: `${Y} = ${m}${X}<br>${X} + ${Y} = ${s}<br>What is ${askX ? X : Y}?`, ans: askX ? xx : yy, wrong: askX ? [yy, s / m, s - m] : [xx, s - m, s], min: 1, hint: `Swap ${Y} for ${m}${X} in the second equation.`, why: `${X} + ${m}${X} = ${m + 1}${X} = ${s}, so ${X} = ${xx} and ${Y} = ${yy}. The answer is <b>${askX ? xx : yy}</b>.` });
        }
        const a = R(1, 3), b = R(1, 3) * sgn(), c = R(1, 3), e = (R(1, 3) * sgn()) || 1;
        if (a * e === b * c) return this.gen(d * 0.9);
        const eq = (p, q) => `${expr([[p, X], [q, Y]])} = ${fmt(p * x + q * y)}`;
        return Q({ q: `Which point solves both?<br>${eq(a, b)}<br>${eq(c, e)}`, ans: pair(x, y), wrong: [pair(y, x), pair(x, -y), pair(-x, y), pair(x + 1, y - 1)], small: true, hint: 'Try each point in BOTH equations.', why: `${pair(x, y)} works: it gives ${fmt(a * x + b * y)} and ${fmt(c * x + e * y)}. The answer is <b>${pair(x, y)}</b>.` });
      },
    },
    {
      id: 'g8-vol', name: 'Cylinders, Cones, Spheres', icon: '\u{1F96B}',
      lesson: [
        { t: 'A <b>cylinder</b> is a stack of circles: V = πr² × h. Radius 3 and height 5: π × 9 × 5 = <b>45π</b>.', v: big('V = πr²h<br>= 45π') },
        { t: `A <b>cone</b> holds exactly one third of the cylinder around it: V = ${F(1, 3)}πr²h.`, v: big(`V = ${F(1, 3)}πr²h`) },
        { t: `A <b>sphere</b> (ball): V = ${F(4, 3)}πr³. Radius 3: ${F(4, 3)} × 27 = <b>36π</b>.`, v: big(`V = ${F(4, 3)}πr³<br>r = 3 → 36π`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['cyl', 'cyl', 'cone'] : d < 0.75 ? ['cyl', 'cone', 'sph'] : ['cone', 'sph', 'cyl', 'back']);
        const r = R(2, 6), h = R(2, 10);
        if (kind === 'cyl') return Q({ q: `A can has radius ${r} and height ${h}. What is its <b>volume</b>?`, ans: r * r * h, unit: 'π', min: 2, wrong: [2 * r * h, r * h, 2 * r * r * h], hint: 'V = πr²h. Square the radius, times the height.', why: `π × ${r * r} × ${h} = <b>${r * r * h}π</b>.` });
        if (kind === 'cone') { const hh = 3 * R(1, 4); return Q({ q: `A cone has radius ${r} and height ${hh}. What is its <b>volume</b>?`, ans: r * r * hh / 3, unit: 'π', min: 2, wrong: [r * r * hh, r * hh, 2 * r * hh / 3 || 3], hint: `V = ${F(1, 3)}πr²h.`, why: `${F(1, 3)} × π × ${r * r} × ${hh} = <b>${r * r * hh / 3}π</b>.` }); }
        if (kind === 'sph') { const rr = pick([3, 6]), v = 4 * rr * rr * rr / 3; return Q({ q: `A ball has radius ${rr}. What is its <b>volume</b>?`, ans: v, unit: 'π', min: 2, wrong: [rr * rr * rr, 4 * rr * rr * rr, 4 * rr * rr], hint: `V = ${F(4, 3)}πr³. ${rr}³ = ${rr * rr * rr}.`, why: `${F(4, 3)} × ${rr * rr * rr} = <b>${v}π</b>.` }); }
        return Q({ q: `A cylinder has volume ${r * r * h}π and radius ${r}. How <b>tall</b> is it?`, ans: h, wrong: [r * h, h + r, r * r], min: 1, hint: `πr² is ${r * r}π. What times that makes ${r * r * h}π?`, why: `${r * r * h} ÷ ${r * r} = <b>${h}</b>.` });
      },
    },
  ];

  // =====================================================================================
  // GRADE 9 -- algebra 1
  // =====================================================================================
  const G9 = [
    {
      id: 'g9-like', name: 'Like Terms', icon: '\u{1F9E9}',
      lesson: [
        { t: `<b>Like terms</b> have the same letter part. Add the ${X}s together and the plain numbers together: 3${X} + 5 + 2${X} − 1 = <b>5${X} + 4</b>.`, v: big(`3${X} + 5 + 2${X} − 1<br>= 5${X} + 4`) },
        { t: `To <b>distribute</b>, multiply the outside number by EVERYTHING inside: 3(${X} + 4) = <b>3${X} + 12</b>.`, v: big(`3(${X} + 4) = 3${X} + 12`) },
        { t: `Careful with negatives: ${M}2(${X} − 5) = ${M}2${X} <b>+ 10</b>, because ${M}2 × ${M}5 = +10.`, v: big(`${M}2(${X} − 5)<br>= ${M}2${X} + 10`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['comb', 'dist'] : d < 0.75 ? ['comb', 'dist', 'neg'] : ['neg', 'both', 'comb']);
        if (kind === 'comb') {
          const a1 = R(1, 9), b1 = R(1, 9) * sgn(), a2 = R(1, 9) * (d > 0.5 ? sgn() : 1), b2 = R(1, 9) * sgn();
          if (a1 + a2 === 0) return this.gen(d);
          return Q({ q: `Simplify: ${expr([[a1, X], [b1, ''], [a2, X], [b2, '']])}`, ans: lin(a1 + a2, b1 + b2), wrong: [lin(a1 + a2 + b1 + b2, 0), lin(a1 + a2, b1 - b2), lin(a1 - a2, b1 + b2), lin(a1 + a2, b1 + b2 + 1), lin(a1 + a2 + 1, b1 + b2)], hint: `Group the ${X} terms, then the numbers.`, why: `${X} terms: ${a1} ${a2 < 0 ? '−' : '+'} ${Math.abs(a2)} = ${a1 + a2}. Numbers: ${fmt(b1)} ${b2 < 0 ? '−' : '+'} ${Math.abs(b2)} = ${fmt(b1 + b2)}. So <b>${lin(a1 + a2, b1 + b2)}</b>.` });
        }
        if (kind === 'dist' || kind === 'neg') {
          const k = R(2, 9) * (kind === 'neg' ? -1 : 1), p = R(1, 9) * sgn();
          return Q({ q: `Expand: ${fmt(k)}${bin(p)}`, ans: lin(k, k * p), wrong: [lin(k, p), lin(k, -k * p), lin(1, k * p), lin(k + p, 0), lin(-k, k * p)], hint: `Multiply ${fmt(k)} by ${X} AND by ${fmt(p)}.`, why: `${fmt(k)} × ${X} = ${lin(k, 0)} and ${fmt(k)} × ${pn(p)} = ${fmt(k * p)}: <b>${lin(k, k * p)}</b>.` });
        }
        const k = R(2, 6) * sgn(), p = R(1, 7) * sgn(), m = R(1, 6) * sgn();
        if (k + m === 0) return this.gen(d);
        return Q({ q: `Simplify: ${fmt(k)}${bin(p)} ${m < 0 ? '−' : '+'} ${Math.abs(m) === 1 ? '' : Math.abs(m)}${X}`, ans: lin(k + m, k * p), wrong: [lin(k + m, p), lin(k, k * p + m), lin(k - m, k * p), lin(k + m, -k * p)], hint: 'Distribute first, then combine the x terms.', why: `${fmt(k)}${bin(p)} = ${lin(k, k * p)}. Add ${lin(m, 0)}: <b>${lin(k + m, k * p)}</b>.` });
      },
    },
    {
      id: 'g9-both', name: 'Variables on Both Sides', icon: '⚖️',
      lesson: [
        { t: `When ${X} is on both sides, first move all the ${X}s to one side. 5${X} + 2 = 2${X} + 14: take 2${X} off both sides.`, v: big(`5${X} + 2 = 2${X} + 14<br>3${X} + 2 = 14`) },
        { t: `Now it is a two-step equation: 3${X} = 12, so ${X} = <b>4</b>. Check: 22 = 22 ✓`, v: big(`3${X} = 12<br>${X} = 4`) },
        { t: `Brackets? Distribute first. 2(${X} + 3) = 20 → 2${X} + 6 = 20 → ${X} = <b>7</b>.`, v: big(`2(${X} + 3) = 20<br>${X} = 7`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['both', 'paren'] : ['both', 'both', 'paren']);
        const x = R(-9, 9) || 3;
        if (kind === 'paren') {
          const a = R(2, 6), p = R(1, 9) * sgn(), c = a * (x + p);
          return Q({ q: `${a}${bin(p)} = ${fmt(c)}`, ans: x, min: -999, wrong: [c / a + p, c - p, -x, Number.isInteger((c - p) / a) ? (c - p) / a : x + 1], hint: `Divide both sides by ${a} first, or distribute.`, why: `${fmt(c)} ÷ ${a} = ${fmt(x + p)}, then ${fmt(x + p)} ${p > 0 ? '−' : '+'} ${Math.abs(p)} = <b>${fmt(x)}</b>.` });
        }
        let a = R(2, 9), c = R(1, 8); if (a === c) a = c + R(1, 3);
        if (d > 0.6 && Math.random() < 0.5) c = -c;
        const b = R(1, 15) * sgn(), e = a * x + b - c * x;
        const alt = (e - b) / (a + c);
        return Q({ q: `${lin(a, b)} = ${lin(c, e)}`, ans: x, min: -999, wrong: [-x, Number.isInteger(alt) && alt !== x ? alt : x + 2, e - b, x - 1], hint: `Move the ${X} terms to one side (subtract ${lin(c, 0)}) and the numbers to the other.`, why: a - c === 1 ? `${X} = <b>${fmt(x)}</b> (subtract ${lin(c, 0)} and ${fmt(b)} from both sides).` : `${lin(a - c, 0)} = ${fmt(e - b)}, so ${X} = ${fmt(e - b)} ÷ ${pn(a - c)} = <b>${fmt(x)}</b>.` });
      },
    },
    {
      id: 'g9-factor', name: 'Factoring', icon: '\u{1F528}',
      lesson: [
        { t: `<b>Factoring</b> is distributing backwards. Pull out what every term shares: 6${X} + 9 = <b>3(2${X} + 3)</b>.`, v: big(`6${X} + 9<br>= 3(2${X} + 3)`) },
        { t: `To factor ${X}² + 5${X} + 6, find two numbers that <b>multiply to 6</b> and <b>add to 5</b>: 2 and 3. So it is <b>(${X} + 2)(${X} + 3)</b>.`, v: sm(`× to 6, + to 5<br>→ 2 and 3`) },
        { t: `Solve ${X}² + 5${X} + 6 = 0: (${X} + 2)(${X} + 3) = 0, so one bracket must be 0. ${X} = <b>${M}2</b> or ${X} = <b>${M}3</b>.`, v: big(`${X} = ${M}2 or ${M}3`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['gcf', 'fac'] : d < 0.7 ? ['fac', 'gcf', 'roots'] : ['fac', 'roots', 'roots']);
        if (kind === 'gcf') {
          let g = R(2, 7), a = R(1, 6), b = R(1, 9) * sgn(); while (gcd(a, b) !== 1) b += 1;
          const w = (gg, aa, bb) => `${gg}(${lin(aa, bb)})`;
          return Q({ q: `Factor: ${lin(g * a, g * b)}`, ans: w(g, a, b), wrong: [w(g, a * g, b), w(g, a, -b), w(a, g, b), w(g, a, b * g)], hint: `What number goes into both ${g * a} and ${Math.abs(g * b)}?`, why: `${g} goes into both: ${lin(g * a, g * b)} = <b>${w(g, a, b)}</b>.` });
        }
        let p = R(1, 9) * sgn(), q = R(1, 9) * sgn();
        if (p > q) [p, q] = [q, p];
        const B = (u, v) => (u <= v ? bin(u) + bin(v) : bin(v) + bin(u));
        const P = poly([1, p + q, p * q]);
        if (kind === 'fac') return Q({ q: `Factor: ${P}`, ans: B(p, q), wrong: [B(-p, -q), B(p, -q), B(-p, q), B(p + 1, q - 1), B(1, p * q)], small: true, hint: `Two numbers that multiply to ${fmt(p * q)} and add to ${fmt(p + q)}.`, why: `${fmt(p)} × ${pn(q)} = ${fmt(p * q)} and ${fmt(p)} + ${pn(q)} = ${fmt(p + q)}: <b>${B(p, q)}</b>.` });
        const S = (u, v) => { const [s, t] = u <= v ? [u, v] : [v, u]; return s === t ? `${X} = ${fmt(s)}` : `${X} = ${fmt(s)} or ${fmt(t)}`; };
        return Q({ q: `Solve: ${P} = 0`, ans: S(-p, -q), wrong: [S(p, q), S(-p, q), S(p, -q), S(-p + 1, -q - 1)], small: true, hint: 'Factor it, then make each bracket equal 0.', why: `${B(p, q)} = 0, so <b>${S(-p, -q)}</b>.` });
      },
    },
    {
      id: 'g9-func', name: 'Functions', icon: '\u{1F527}',
      lesson: [
        { t: `A <b>function</b> is a rule: put a number in, get one number out. ${fx()} = 2${X} + 3 means "double it, then add 3".`, v: big(`${fx()} = 2${X} + 3`) },
        { t: `${fx(4)} means "put 4 in": 2 × 4 + 3 = <b>11</b>. So ${fx(4)} = 11.`, v: big(`${fx(4)} = 2·4 + 3 = 11`) },
        { t: `Working backwards: if ${fx()} = 15, then 2${X} + 3 = 15, so ${X} = <b>6</b>.`, v: big(`2${X} + 3 = 15<br>${X} = 6`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['lin', 'lin', 'sq'] : d < 0.7 ? ['lin', 'sq', 'back', 'table'] : ['sq', 'back', 'table', 'lin']);
        const a = R(2, 7) * (d > 0.5 ? sgn() : 1), b = R(-9, 9) || 2, k = R(-5, 6) || 3;
        if (kind === 'lin') return Q({ q: `${fx()} = ${lin(a, b)}. What is ${fx(fmt(k))}?`, ans: a * k + b, min: -999, wrong: [a + k + b, a * k - b, a * (k + b)], hint: `Put ${fmt(k)} in place of ${X}.`, why: `${fmt(a)} × ${pn(k)} ${b > 0 ? '+' : '−'} ${Math.abs(b)} = <b>${fmt(a * k + b)}</b>.` });
        if (kind === 'sq') { const c = R(-9, 9) || 1, kk = R(-5, 5) || -3; return Q({ q: `${fx()} = ${poly([1, 0, c])}. What is ${fx(fmt(kk))}?`, ans: kk * kk + c, min: -999, wrong: [-kk * kk + c, 2 * kk + c, kk + c], hint: `Square ${fmt(kk)} first. A negative squared is positive!`, why: `(${fmt(kk)})² = ${kk * kk}, ${c > 0 ? '+' : '−'} ${Math.abs(c)} = <b>${fmt(kk * kk + c)}</b>.` }); }
        if (kind === 'back') { const v = a * k + b; return Q({ q: `${fx()} = ${lin(a, b)}. For which ${X} is ${fx()} = ${fmt(v)}?`, ans: k, min: -999, wrong: [a * v + b, v - b, -k], hint: `Solve ${lin(a, b)} = ${fmt(v)}.`, why: `${lin(a, 0)} = ${fmt(v - b)}, so ${X} = <b>${fmt(k)}</b>.` }); }
        const m = R(2, 5), c = R(-4, 6);
        const rows = [1, 2, 3].map((x) => `${x} → ${fmt(m * x + c)}`).join('<br>');
        const E = (mm, cc) => `${fx()} = ${lin(mm, cc)}`;
        return Q({ q: `Which rule makes this table?`, vis: sm(rows), ans: E(m, c), wrong: [E(1, m + c), E(m + c, 0), E(m, c + 1), E(m + 1, c - 1)], small: true, hint: 'How much does the output go up each time? That is the number in front of x.', why: `It goes up by ${m} each time, and ${m} × 1 ${c >= 0 ? '+' : '−'} ${Math.abs(c)} = ${m + c}: <b>${E(m, c)}</b>.` });
      },
    },
    {
      id: 'g9-grow', name: 'Growth Patterns', icon: '\u{1F9A0}',
      lesson: [
        { t: '<b>Linear</b> growth adds the SAME amount each step: 5, 8, 11, 14 (+3 each time).', v: big('5, 8, 11, 14<br>+3 +3 +3') },
        { t: '<b>Exponential</b> growth MULTIPLIES by the same amount: 3, 6, 12, 24 (×2 each time). It starts slow, then shoots up!', v: big('3, 6, 12, 24<br>×2 ×2 ×2') },
        { t: `${Y} = 5 · 2${sup(X)} starts at 5 and doubles each step. After 3 steps: 5 × 2 × 2 × 2 = <b>40</b>.`, v: big(`5 · 2${sup(3)} = 40`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['type', 'double'] : d < 0.7 ? ['double', 'type', 'half', 'eval'] : ['eval', 'half', 'double', 'type']);
        if (kind === 'type') {
          const t = pick(['lin', 'exp', 'neither']), s = R(1, 6), k = R(2, 3);
          const seq = t === 'lin' ? [0, 1, 2, 3].map((i) => s + i * (k + 2)) : t === 'exp' ? [0, 1, 2, 3].map((i) => s * Math.pow(k, i)) : [1, 2, 3, 4].map((i) => i * i + s);
          const L = { lin: 'Linear (adds the same)', exp: 'Exponential (multiplies)', neither: 'Neither' };
          return Q({ q: `What kind of pattern is this?<br><b>${seq.join(', ')}, ...</b>`, ans: L[t], wrong: Object.values(L).filter((v) => v !== L[t]), fixed: false, small: true, hint: 'Check the jumps: is it always + the same, or × the same?', why: t === 'lin' ? `It adds ${k + 2} each time: <b>linear</b>.` : t === 'exp' ? `It multiplies by ${k} each time: <b>exponential</b>.` : `The jumps are ${seq[1] - seq[0]}, ${seq[2] - seq[1]}, ${seq[3] - seq[2]}: not the same, and not multiplying either. <b>Neither</b>.` });
        }
        if (kind === 'double') { const s = R(2, 30), n = R(2, 5), v = s * Math.pow(2, n); return Q({ q: `A jar starts with ${s} bacteria. They <b>double</b> every hour. How many after ${n} hours?`, ans: v, wrong: [s * 2 * n, s + 2 * n, v / 2, v * 2], hint: `Double ${s}, ${n} times.`, why: `${s} × 2${sup(n)} = ${s} × ${Math.pow(2, n)} = <b>${fmt(v)}</b>.` }); }
        if (kind === 'half') { const n = R(2, 4), e = R(1, 5), s = e * Math.pow(2, n) * 10; return Q({ q: `${s} grams of a substance <b>halves</b> every year. How much is left after ${n} years?`, ans: s / Math.pow(2, n), unit: ' g', wrong: [s / (2 * n), s - n * 2, s / Math.pow(2, n - 1)], hint: `Halve it ${n} times.`, why: `${s} ÷ ${Math.pow(2, n)} = <b>${s / Math.pow(2, n)} g</b>.` }); }
        const a = R(2, 6), b = R(2, 3), x = R(1, 4), v = a * Math.pow(b, x);
        return Q({ q: `${Y} = ${a} · ${b}${sup(X)}. What is ${Y} when ${X} = ${x}?`, ans: v, wrong: [a * b * x, Math.pow(a * b, x), a + Math.pow(b, x)], hint: `Work out ${b}${sup(x)} first, then times ${a}.`, why: `${b}${sup(x)} = ${Math.pow(b, x)}, × ${a} = <b>${fmt(v)}</b>.` });
      },
    },
  ];

  // =====================================================================================
  // GRADE 10 -- geometry
  // =====================================================================================
  const G10 = [
    {
      id: 'g10-ang', name: 'Angle Detective', icon: '\u{1F4D0}',
      lesson: [
        { t: 'The angles in a <b>triangle</b> add to <b>180°</b>. Angles on a straight line also add to 180° (<b>supplementary</b>). Two that make a right angle add to 90° (<b>complementary</b>).', v: vTriAng(50, 60) },
        { t: 'When two lines cross, the angles opposite each other (<b>vertical angles</b>) are equal. When a line crosses two parallel lines, <b>alternate</b> angles are equal too.', v: sm('vertical angles: equal<br>alternate angles: equal') },
        { t: 'A shape with n sides has angles adding to <b>(n − 2) × 180°</b>. A hexagon: 4 × 180 = 720°. If it is regular, each angle is 720 ÷ 6 = <b>120°</b>.', v: sm('(n − 2) × 180°<br>hexagon: 720°') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['tri', 'supp', 'comp'] : d < 0.7 ? ['tri', 'vert', 'par', 'poly'] : ['poly', 'reg', 'ext', 'tri']);
        const deg = { unit: '°' };
        if (kind === 'tri') { const a = R(25, 90), b = R(20, 150 - a); return Q(Object.assign({ q: `Two angles of a triangle are ${a}° and ${b}°. What is the third?`, vis: vTriAng(a, b), ans: 180 - a - b, wrong: [360 - a - b, a + b, 90 - Math.min(a, b) + 10], hint: 'The three angles add to 180°.', why: `180 − ${a} − ${b} = <b>${180 - a - b}°</b>.` }, deg)); }
        if (kind === 'supp') { const a = R(20, 160); return Q(Object.assign({ q: `Two angles sit on a straight line. One is ${a}°. What is the other?`, ans: 180 - a, wrong: [90 - a > 0 ? 90 - a : 360 - a, a, 360 - a], hint: 'A straight line is 180°.', why: `180 − ${a} = <b>${180 - a}°</b>.` }, deg)); }
        if (kind === 'comp') { const a = R(10, 80); return Q(Object.assign({ q: `Two angles are <b>complementary</b>. One is ${a}°. What is the other?`, ans: 90 - a, wrong: [180 - a, a, 360 - a], hint: 'Complementary angles add to 90°.', why: `90 − ${a} = <b>${90 - a}°</b>.` }, deg)); }
        if (kind === 'vert') { const a = R(20, 160); return Q(Object.assign({ q: `Two lines cross. One angle is ${a}°. What is the angle <b>opposite</b> it?`, ans: a, wrong: [180 - a, 90, 360 - a], hint: 'Vertical (opposite) angles are equal.', why: `Opposite angles are equal: <b>${a}°</b>.` }, deg)); }
        if (kind === 'par') { const a = R(30, 150), alt = Math.random() < 0.5; return Q(Object.assign({ q: `A line crosses two parallel lines and makes a ${a}° angle. What is the <b>${alt ? 'alternate interior' : 'same-side interior'}</b> angle?`, ans: alt ? a : 180 - a, wrong: alt ? [180 - a, 90, 360 - a] : [a, 90, 360 - a], hint: alt ? 'Alternate angles make a Z shape. They are equal.' : 'Same-side interior angles add to 180°.', why: alt ? `Alternate interior angles are equal: <b>${a}°</b>.` : `They add to 180: 180 − ${a} = <b>${180 - a}°</b>.` }, deg)); }
        const SH = { 5: 'pentagon', 6: 'hexagon', 8: 'octagon', 9: 'nonagon', 10: 'decagon', 12: 'dodecagon' };
        const n = pick([5, 6, 8, 9, 10, 12]), sum = (n - 2) * 180;
        if (kind === 'poly') return Q(Object.assign({ q: `What do the angles inside a <b>${SH[n]}</b> (${n} sides) add up to?`, ans: sum, wrong: [n * 180, (n - 1) * 180, 360], hint: '(sides − 2) × 180°.', why: `(${n} − 2) × 180 = <b>${fmt(sum)}°</b>.` }, deg));
        if (kind === 'reg') return Q(Object.assign({ q: `How big is each angle inside a <b>regular ${SH[n]}</b>?`, ans: sum / n, wrong: [360 / n, sum, 180 - sum / n], hint: `Find the total, (${n} − 2) × 180, then share it between ${n} angles.`, why: `${fmt(sum)} ÷ ${n} = <b>${sum / n}°</b>.` }, deg));
        return Q(Object.assign({ q: `Each <b>outside</b> (exterior) angle of a regular ${SH[n]} is how big?`, ans: 360 / n, wrong: [sum / n, 180 / n > 10 ? 180 / n : 2 * n, n * 10], hint: 'The outside angles of any shape add to 360°.', why: `360 ÷ ${n} = <b>${360 / n}°</b>.` }, deg));
      },
    },
    {
      id: 'g10-sim', name: 'Similar Shapes', icon: '\u{1F53A}',
      lesson: [
        { t: '<b>Similar</b> shapes have the same angles and the same shape, just a different size. Every side is multiplied by the same <b>scale factor</b>.', v: sm('3, 4, 5 → ×2 → 6, 8, 10') },
        { t: 'Find a missing side with the scale factor. A 4 cm side became 12 cm (× 3), so a 5 cm side becomes <b>15 cm</b>.', v: big('4 → 12 is ×3<br>5 → 15') },
        { t: 'Area grows by the scale factor <b>squared</b>. Make every side 3 times longer and the area becomes 3 × 3 = <b>9 times</b> bigger.', v: big('×3 sides<br>×9 area') },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['side', 'factor'] : d < 0.75 ? ['side', 'shadow', 'area'] : ['area', 'shadow', 'side', 'vol']);
        const t = pick([[3, 4, 5], [5, 12, 13], [2, 3, 4], [4, 6, 7], [6, 8, 10]]), k = R(2, 5);
        if (kind === 'factor') return Q({ q: `Two triangles are similar. A side of ${t[0]} cm matches a side of ${t[0] * k} cm. What is the <b>scale factor</b>?`, ans: k, wrong: [t[0] * k - t[0], t[0], k + 1], min: 1, hint: `${t[0]} × what = ${t[0] * k}?`, why: `${t[0] * k} ÷ ${t[0]} = <b>${k}</b>.` });
        if (kind === 'side') return Q({ q: `Triangle A has sides ${t.join(', ')}. Triangle B is similar, and its shortest side is ${t[0] * k}. How long is B’s <b>longest</b> side?`, ans: t[2] * k, wrong: [t[2] + t[0] * k - t[0], t[2] * k + k, t[1] * k], hint: `Find the scale factor first: ${t[0] * k} ÷ ${t[0]}.`, why: `The scale factor is ${k}, so ${t[2]} × ${k} = <b>${t[2] * k}</b>.` });
        if (kind === 'shadow') { const h = pick([2, 3, 4, 5, 6]), s = R(2, 4), kk = R(3, 8); return Q({ q: `A ${h} ft child casts a ${s} ft shadow. At the same time, a tree casts a ${s * kk} ft shadow. How tall is the tree?`, ans: h * kk, unit: ' ft', wrong: [h + s * kk - s, s * kk, h * kk + h], hint: 'The tree’s shadow is how many times the child’s?', why: `${s * kk} ÷ ${s} = ${kk}, so the tree is ${h} × ${kk} = <b>${h * kk} ft</b>.` }); }
        if (kind === 'area') return Q({ q: `Every side of a shape is made <b>${k} times</b> longer. How many times bigger is its <b>area</b>?`, ans: k * k, wrong: [k, 2 * k, k * k * k], hint: 'Area is length × width, and BOTH got bigger.', why: `${k} × ${k} = <b>${k * k}</b> times.` });
        return Q({ q: `A box is scaled up so every edge is <b>${k} times</b> longer. How many times bigger is its <b>volume</b>?`, ans: k * k * k, wrong: [k, k * k, 3 * k], hint: 'Volume uses three lengths: length × width × height.', why: `${k} × ${k} × ${k} = <b>${k * k * k}</b> times.` });
      },
    },
    {
      id: 'g10-trig', name: 'Right Triangle Trig', icon: '\u{1F4CF}',
      lesson: [
        { t: 'Stand at angle A. The side across from you is <b>opposite</b>, the one next to you is <b>adjacent</b>, and the longest is the <b>hypotenuse</b>.', v: vTri('opp', 'adj', 'hyp', { A: true }) },
        { t: '<b>SOH CAH TOA</b>: Sin = Opposite ÷ Hypotenuse, Cos = Adjacent ÷ Hypotenuse, Tan = Opposite ÷ Adjacent.', v: sm('SOH · CAH · TOA') },
        { t: `With opposite 3, adjacent 4 and hypotenuse 5: sin A = ${F(3, 5)}, cos A = ${F(4, 5)}, tan A = ${F(3, 4)}.`, v: vTri(3, 4, 5, { A: true }) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['ratio', 'name'] : d < 0.7 ? ['ratio', 'ratio', 'special', 'side'] : ['ratio', 'side', 'special']);
        const t = pick(TRIPLES), flip = Math.random() < 0.5, [o, a] = flip ? [t[1], t[0]] : [t[0], t[1]], h = t[2];
        const red = (n, dd) => { const g = gcd(n, dd); return [n / g, dd / g]; };
        if (kind === 'ratio') {
          const f = pick(['sin', 'cos', 'tan']);
          const ans = f === 'sin' ? red(o, h) : f === 'cos' ? red(a, h) : red(o, a);
          return FQ({ q: `What is <b>${f} A</b>?`, vis: vTri(o, a, h, { A: true, h: o / a }), ans, wrong: [red(o, h), red(a, h), red(o, a), red(h, o), red(a, o)].filter((w) => w[0] !== ans[0] || w[1] !== ans[1]), hint: 'SOH CAH TOA. Which two sides does it use?', why: f === 'sin' ? `sin = opposite ÷ hypotenuse = ${F(o, h)}${gcd(o, h) > 1 ? ' = ' + F(...ans) : ''}.` : f === 'cos' ? `cos = adjacent ÷ hypotenuse = ${F(a, h)}${gcd(a, h) > 1 ? ' = ' + F(...ans) : ''}.` : `tan = opposite ÷ adjacent = ${F(o, a)}${gcd(o, a) > 1 ? ' = ' + F(...ans) : ''}.` });
        }
        if (kind === 'name') { const f = pick([['opposite ÷ hypotenuse', 'sine'], ['adjacent ÷ hypotenuse', 'cosine'], ['opposite ÷ adjacent', 'tangent']]); return Q({ q: `Which one is <b>${f[0]}</b>?`, ans: f[1], wrong: ['sine', 'cosine', 'tangent'].filter((x) => x !== f[1]), hint: 'SOH CAH TOA!', why: `${f[0]} is the <b>${f[1]}</b>.` }); }
        if (kind === 'special') {
          const S = [['sin 30°', F(1, 2)], ['cos 60°', F(1, 2)], ['tan 45°', '1'], ['sin 90°', '1'], ['cos 0°', '1'], ['sin 0°', '0'], ['cos 90°', '0'], ['sin 60°', F('√3', 2)], ['cos 30°', F('√3', 2)], ['sin 45°', F('√2', 2)], ['cos 45°', F('√2', 2)]];
          const [nm, val] = pick(S);
          return Q({ q: `${nm} = ${BL}`, ans: val, wrong: [F(1, 2), '1', '0', F('√3', 2), F('√2', 2), '2'], hint: 'Picture the 30-60-90 and 45-45-90 triangles.', why: `${nm} = <b>${val}</b>.` });
        }
        const k = R(1, 3), H = h * k;
        return Q({ q: `In a right triangle, sin A = ${F(o, h)} and the hypotenuse is ${H}. How long is the side <b>opposite</b> A?`, ans: o * k, wrong: [a * k, H - o, o], hint: 'sin A = opposite ÷ hypotenuse, so opposite = sin A × hypotenuse.', why: `${F(o, h)} × ${H} = <b>${o * k}</b>.` });
      },
    },
    {
      id: 'g10-coord', name: 'Coordinate Geometry', icon: '\u{1F4CD}',
      lesson: [
        { t: 'The <b>distance</b> between two points is a hypotenuse! Count across and up, then use a² + b² = c². From (1, 1) to (4, 5): 3 across, 4 up, so <b>5</b>.', v: vPlane([[1, 1, '(1, 1)'], [4, 5, '(4, 5)']], [1, 1, 4, 5]) },
        { t: 'The <b>midpoint</b> is halfway: average the x’s and average the y’s. (2, 4) and (6, 10) → (4, 7).', v: sm('((2 + 6) ÷ 2, (4 + 10) ÷ 2)<br>= (4, 7)') },
        { t: `<b>Parallel</b> lines have the same slope. <b>Perpendicular</b> lines have slopes that are negative flips: 2 and ${M}${F(1, 2)}.`, v: big(`2 ⟂ ${M}${F(1, 2)}`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['dist', 'mid'] : d < 0.7 ? ['dist', 'mid', 'perp'] : ['perp', 'dist', 'mid']);
        if (kind === 'dist') {
          const t = pick(d < 0.5 ? [[3, 4, 5], [6, 8, 10]] : TRIPLES), sx = sgn(), sy = sgn(), x1 = R(-5, 5), y1 = R(-5, 5);
          const x2 = x1 + sx * t[0], y2 = y1 + sy * t[1];
          return Q({ q: `How far apart are ${pair(x1, y1)} and ${pair(x2, y2)}?`, ans: t[2], wrong: [t[0] + t[1], t[2] + 1, t[0] * t[0] + t[1] * t[1]], hint: `Across ${t[0]}, up or down ${t[1]}. Use a² + b² = c².`, why: `${t[0]}² + ${t[1]}² = ${t[2] * t[2]}, √${t[2] * t[2]} = <b>${t[2]}</b>.` });
        }
        if (kind === 'mid') {
          const x1 = R(-8, 8), y1 = R(-8, 8), x2 = x1 + 2 * R(1, 5) * sgn(), y2 = y1 + 2 * R(1, 5) * sgn(), mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return Q({ q: `What is the midpoint of ${pair(x1, y1)} and ${pair(x2, y2)}?`, ans: pair(mx, my), wrong: [pair(my, mx), pair(x1 + x2, y1 + y2), pair((x2 - x1) / 2, (y2 - y1) / 2), pair(mx, -my)], small: true, hint: 'Average the x’s, then average the y’s.', why: `(${fmt(x1)} + ${pn(x2)}) ÷ 2 = ${fmt(mx)} and (${fmt(y1)} + ${pn(y2)}) ÷ 2 = ${fmt(my)}: <b>${pair(mx, my)}</b>.` });
        }
        let n = R(1, 5) * sgn(), dd = R(1, 4); while (gcd(n, dd) !== 1) dd++;
        const perp = Math.random() < 0.65, m = rat(n, dd);
        return Q({ q: `A line has slope ${m}. What is the slope of a line <b>${perp ? 'perpendicular' : 'parallel'}</b> to it?`, ans: perp ? rat(-dd, n) : m, wrong: (perp ? [m, rat(-n, dd), rat(dd, n)] : [rat(-dd, n), rat(-n, dd), rat(dd, n)]).concat([rat(2 * dd, n), rat(-2 * dd, n), '0']), hint: perp ? 'Flip the fraction AND change the sign.' : 'Parallel lines never meet, so they are equally steep.', why: perp ? `Flip ${m} and change the sign: <b>${rat(-dd, n)}</b>.` : `Parallel lines have the same slope: <b>${m}</b>.` });
      },
    },
    {
      id: 'g10-arc', name: 'Arcs and Sectors', icon: '\u{1F355}',
      lesson: [
        { t: 'A <b>sector</b> is a pizza slice of a circle. Its angle at the centre tells you what fraction of the circle it is: 90° is 90/360 = <b>a quarter</b>.', v: big('90° ÷ 360° = ¼') },
        { t: `<b>Arc length</b> = fraction × circumference. A 90° arc on a circle of radius 6: ¼ × 12π = <b>3π</b>.`, v: big('¼ × 2π·6 = 3π') },
        { t: '<b>Sector area</b> = fraction × πr². And an angle drawn from the edge of the circle (an <b>inscribed</b> angle) is always <b>half</b> the centre angle.', v: sm('inscribed = ½ × central') },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['frac', 'arc'] : d < 0.75 ? ['arc', 'sector', 'insc'] : ['sector', 'arc', 'insc']);
        const angs = [30, 45, 60, 90, 120, 180, 270];
        if (kind === 'frac') { const a = pick([90, 180, 120, 60, 45, 30]), dd = 360 / a; return FQ({ q: `A sector has a ${a}° angle. What fraction of the whole circle is it?`, ans: [1, dd], wrong: [[a, 100], [1, a / 10], [2, dd]], hint: 'A whole circle is 360°.', why: `${a} ÷ 360 = ${F(1, dd)}.` }); }
        if (kind === 'insc') { const a = R(15, 85); return Math.random() < 0.5 ? Q({ q: `A central angle is ${2 * a}°. What is an inscribed angle that cuts off the same arc?`, ans: a, unit: '°', wrong: [2 * a, 4 * a, 180 - 2 * a], hint: 'Inscribed angles are half the central angle.', why: `${2 * a} ÷ 2 = <b>${a}°</b>.` }) : Q({ q: `An inscribed angle is ${a}°. What is the central angle on the same arc?`, ans: 2 * a, unit: '°', wrong: [a, 180 - a, a / 2 | 0 || 4], hint: 'The central angle is double the inscribed one.', why: `${a} × 2 = <b>${2 * a}°</b>.` }); }
        let a, r, v, tries = 0;
        do { a = pick(angs); r = R(2, 12); v = kind === 'arc' ? a * 2 * r / 360 : a * r * r / 360; } while (!Number.isInteger(v) && ++tries < 60);
        if (!Number.isInteger(v)) { a = 90; r = 4; v = kind === 'arc' ? 2 : 4; }
        if (kind === 'arc') return Q({ q: `A circle has radius ${r}. How long is the arc of a <b>${a}°</b> sector?`, ans: v, unit: 'π', min: 1, wrong: [2 * r, a * r / 360 * 4 | 0 || v + 1, r * r * a / 360 | 0 || v + 2], hint: `Circumference is ${2 * r}π. What fraction is ${a}° of 360°?`, why: `${F(a, 360)} × ${2 * r}π = <b>${v}π</b>.` });
        return Q({ q: `A circle has radius ${r}. What is the area of a <b>${a}°</b> sector?`, ans: v, unit: 'π', min: 1, wrong: [r * r, a * 2 * r / 360 | 0 || v + 1, v * 2], hint: `The whole area is ${r * r}π. What fraction is ${a}° of 360°?`, why: `${F(a, 360)} × ${r * r}π = <b>${v}π</b>.` });
      },
    },
  ];

  // =====================================================================================
  // GRADE 11 -- algebra 2
  // =====================================================================================
  const G11 = [
    {
      id: 'g11-quad', name: 'Quadratics', icon: '\u{1F9EE}',
      lesson: [
        { t: `Any a${X}² + b${X} + c = 0 can be solved with the <b>quadratic formula</b>: ${X} = (−b ± √(b² − 4ac)) ÷ 2a.`, v: sm('x = (−b ± √(b² − 4ac))<br>÷ 2a') },
        { t: 'The part under the root, <b>b² − 4ac</b>, is the <b>discriminant</b>. Positive: 2 answers. Zero: 1 answer. Negative: no real answers.', v: sm('b² − 4ac &gt; 0 → 2<br>= 0 → 1 · &lt; 0 → none') },
        { t: `The graph of ${Y} = a${X}² + b${X} + c is a <b>parabola</b>. Its turning point (vertex) is at ${X} = −b ÷ 2a.`, v: big(`${X} = ${M}b ÷ 2a`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['disc', 'count'] : d < 0.7 ? ['disc', 'vertex', 'roots', 'count'] : ['roots', 'vertex', 'disc']);
        if (kind === 'disc' || kind === 'count') {
          const a = R(1, 3), b = R(-8, 8), c = R(-6, 6) || 1, D = b * b - 4 * a * c;
          const eq = `${poly([a, b, c])} = 0`;
          if (kind === 'disc') return Q({ q: `What is the <b>discriminant</b> of ${eq}?`, ans: D, min: -999, wrong: [b * b + 4 * a * c, b - 4 * a * c, -D], hint: 'b² − 4ac.', why: `(${fmt(b)})² − 4 × ${a} × ${pn(c)} = ${b * b} ${-4 * a * c >= 0 ? '+' : '−'} ${Math.abs(4 * a * c)} = <b>${fmt(D)}</b>.` });
          const L = D > 0 ? '2 real solutions' : D === 0 ? '1 real solution' : 'No real solutions';
          return Q({ q: `How many real solutions does ${eq} have?`, ans: L, wrong: ['2 real solutions', '1 real solution', 'No real solutions'], hint: 'Work out b² − 4ac. Is it positive, zero, or negative?', why: `b² − 4ac = ${fmt(D)}, which is ${D > 0 ? 'positive' : D === 0 ? 'zero' : 'negative'}: <b>${L.toLowerCase()}</b>.` });
        }
        if (kind === 'vertex') { const a = R(1, 4) * sgn(), h = R(-6, 6) || 2, b = -2 * a * h, c = R(-9, 9); return Q({ q: `At what ${X} is the vertex of ${Y} = ${poly([a, b, c])}?`, ans: h, min: -99, wrong: [-h, b, h * 2], hint: `${X} = −b ÷ 2a, with a = ${fmt(a)} and b = ${fmt(b)}.`, why: `${X} = ${fmt(-b)} ÷ ${fmt(2 * a)} = <b>${fmt(h)}</b>.` }); }
        const k = d > 0.8 ? R(1, 3) : 1;
        let r = R(-7, 7), s = R(-7, 7); if (r === s) s = r + 3;
        const S = (u, v) => { const [x1, x2] = u <= v ? [u, v] : [v, u]; return `${X} = ${fmt(x1)} or ${fmt(x2)}`; };
        return Q({ q: `Solve: ${poly([k, -k * (r + s), k * r * s])} = 0`, ans: S(r, s), wrong: [S(-r, -s), S(r, -s), S(-r, s), S(r + 1, s - 1)], small: true, hint: k > 1 ? `Divide everything by ${k} first, then factor.` : 'Factor it or use the formula.', why: `It factors as ${k > 1 ? k : ''}${bin(-r)}${bin(-s)}: <b>${S(r, s)}</b>.` });
      },
    },
    {
      id: 'g11-log', name: 'Logarithms', icon: '\u{1F4DC}',
      lesson: [
        { t: `A <b>logarithm</b> asks: what power? log<sub>2</sub> 8 asks "2 to what power is 8?" 2${sup(3)} = 8, so log<sub>2</sub> 8 = <b>3</b>.`, v: big(`log<sub>2</sub> 8 = 3<br>2${sup(3)} = 8`) },
        { t: `Handy ones: log<sub>b</sub> 1 = <b>0</b> (because b${sup(0)} = 1) and log<sub>b</sub> b = <b>1</b>. log<sub>10</sub> 1000 = 3.`, v: big(`log<sub>10</sub> 1000 = 3`) },
        { t: `Adding logs multiplies inside: log<sub>2</sub> 4 + log<sub>2</sub> 8 = log<sub>2</sub> 32 = <b>5</b>.`, v: sm(`log<sub>2</sub> 4 + log<sub>2</sub> 8<br>= 2 + 3 = 5`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['basic', 'basic', 'one'] : d < 0.7 ? ['basic', 'exp', 'frac', 'add'] : ['frac', 'add', 'exp', 'basic']);
        const b = pick([2, 3, 5, 10]), k = R(1, b === 2 ? 6 : b === 10 ? 5 : 4), n = Math.pow(b, k);
        const L = (base, v) => `log<sub>${base}</sub> ${v}`;
        if (kind === 'basic') return Q({ q: `${L(b, fmt(n))} = ${BL}`, ans: k, wrong: [n / b, b * k, k + 1, k - 1], hint: `${b} to what power makes ${fmt(n)}?`, why: `${b}${sup(k)} = ${fmt(n)}, so the answer is <b>${k}</b>.` });
        if (kind === 'one') { const z = Math.random() < 0.5; return Q({ q: `${L(b, z ? 1 : b)} = ${BL}`, ans: z ? 0 : 1, wrong: z ? [1, b, 10] : [0, b, 10], hint: z ? `${b} to what power is 1?` : `${b} to what power is ${b}?`, why: z ? `${b}${sup(0)} = 1, so it is <b>0</b>.` : `${b}${sup(1)} = ${b}, so it is <b>1</b>.` }); }
        if (kind === 'exp') return Q({ q: `Solve: ${b}${sup(X)} = ${fmt(n)}`, ans: k, wrong: [n / b, k + 1, n - b], hint: `How many ${b}s multiply to make ${fmt(n)}?`, why: `${b}${sup(k)} = ${fmt(n)}, so ${X} = <b>${k}</b>.` });
        if (kind === 'frac') { const kk = Math.min(k, 3); return Q({ q: `${L(b, F(1, fmt(Math.pow(b, kk))))} = ${BL}`, ans: -kk, min: -99, wrong: [kk, F(1, kk), -kk - 1, 0], hint: 'One over something means a negative power.', why: `${b}${sup(M + kk)} = ${F(1, fmt(Math.pow(b, kk)))}, so it is <b>${M}${kk}</b>.` }); }
        const p = R(1, 4), q = R(1, 4), bb = pick([2, 3]);
        return Q({ q: `${L(bb, Math.pow(bb, p))} + ${L(bb, Math.pow(bb, q))} = ${BL}`, ans: p + q, wrong: [p * q, Math.pow(bb, p) + Math.pow(bb, q), p + q + 1], hint: 'Work out each log on its own, then add.', why: `${p} + ${q} = <b>${p + q}</b>.` });
      },
    },
    {
      id: 'g11-cplx', name: 'Complex Numbers', icon: '\u{1F300}',
      lesson: [
        { t: `No real number squared is negative, so mathematicians invented one: ${I}, where <b>${I}² = −1</b>. So √−9 = 3${I}.`, v: big(`${I}² = ${M}1<br>√${M}9 = 3${I}`) },
        { t: `Powers of ${I} go round in a circle of four: ${I}, ${M}1, ${M}${I}, 1, then repeat. ${I}${sup(10)}: 10 ÷ 4 leaves 2, so it is <b>${M}1</b>.`, v: big(`${I}, ${M}1, ${M}${I}, 1, ...`) },
        { t: `Add complex numbers part by part: (3 + 2${I}) + (1 + 4${I}) = <b>4 + 6${I}</b>. When you multiply, swap any ${I}² for ${M}1.`, v: sm(`(3 + 2${I}) + (1 + 4${I})<br>= 4 + 6${I}`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['add', 'ipow', 'sqrt'] : d < 0.7 ? ['add', 'sub', 'ipow', 'mul'] : ['mul', 'mul', 'ipow', 'sub']);
        const P = (re, im) => `(${cplx(re, im)})`;
        if (kind === 'ipow') { const n = R(2, 40), vals = [`1`, I, `${M}1`, `${M}${I}`]; return Q({ q: `${I}${sup(n)} = ${BL}`, ans: vals[n % 4], wrong: vals.filter((_, k) => k !== n % 4), hint: `Divide ${n} by 4 and look at the remainder.`, why: `${n} ÷ 4 leaves ${n % 4}, so ${I}${sup(n)} = ${I}${sup(n % 4)} = <b>${vals[n % 4]}</b>.` }); }
        if (kind === 'sqrt') { const k = R(2, 12); return Q({ q: `√${M}${k * k} = ${BL}`, ans: `${k}${I}`, wrong: [`${M}${k}`, `${k}`, `${k * k}${I}`, `${M}${k}${I}`], hint: `√${M}${k * k} = √${k * k} × √${M}1.`, why: `√${k * k} = ${k} and √${M}1 = ${I}: <b>${k}${I}</b>.` }); }
        const a = R(-6, 9) || 2, b = R(1, 7) * sgn(), c = R(-6, 9) || 3, e = R(1, 7) * sgn();
        if (kind === 'add') return Q({ q: `${P(a, b)} + ${P(c, e)} = ${BL}`, ans: cplx(a + c, b + e), wrong: [cplx(a + c, b - e), cplx(a + b, c + e), cplx(a - c, b + e), cplx(a + c + 1, b + e)], small: true, hint: 'Add the real parts, then add the i parts.', why: `${fmt(a)} + ${pn(c)} = ${fmt(a + c)} and ${fmt(b)} + ${pn(e)} = ${fmt(b + e)}: <b>${cplx(a + c, b + e)}</b>.` });
        if (kind === 'sub') return Q({ q: `${P(a, b)} − ${P(c, e)} = ${BL}`, ans: cplx(a - c, b - e), wrong: [cplx(a - c, b + e), cplx(a + c, b - e), cplx(c - a, e - b), cplx(a - c, b - e + 1)], small: true, hint: 'Subtract each part. Take away BOTH parts of the second number.', why: `${fmt(a)} − ${pn(c)} = ${fmt(a - c)} and ${fmt(b)} − ${pn(e)} = ${fmt(b - e)}: <b>${cplx(a - c, b - e)}</b>.` });
        const A = R(1, 4), B = R(1, 4) * sgn(), C = R(1, 4), E = R(1, 4) * sgn();
        const re = A * C - B * E, im = A * E + B * C;
        return Q({ q: `${P(A, B)}${P(C, E)} = ${BL}`, ans: cplx(re, im), wrong: [cplx(A * C + B * E, im), cplx(A * C, B * E), cplx(re, A * E - B * C), cplx(re + 1, im)], small: true, hint: `Multiply out like (a + b)(c + d), then change ${I}² to ${M}1.`, why: `${expr([[A * C, ''], [A * E, I], [B * C, I], [B * E, I + '²']])}. ${I}² = ${M}1, so <b>${cplx(re, im)}</b>.` });
      },
    },
    {
      id: 'g11-seq', name: 'Sequences', icon: '\u{1F522}',
      lesson: [
        { t: 'An <b>arithmetic</b> sequence adds the same number each time: 4, 7, 10, 13 has common difference <b>3</b>.', v: big('4, 7, 10, 13') },
        { t: 'The nth term is a₁ + (n − 1)d. The 20th term of 4, 7, 10...: 4 + 19 × 3 = <b>61</b>.', v: sm('a₁ + (n − 1)d<br>4 + 19 × 3 = 61') },
        { t: 'A <b>geometric</b> sequence multiplies each time: 3, 6, 12, 24 has common ratio <b>2</b>. And 1 + 2 + ... + n = n(n + 1) ÷ 2.', v: big('3, 6, 12, 24') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['next', 'gnext'] : d < 0.7 ? ['nth', 'gnext', 'ratio', 'next'] : ['nth', 'sum', 'gnext', 'ratio']);
        const a = R(-10, 15), dd = (R(2, 9)) * (d > 0.5 ? sgn() : 1);
        const seq = (f) => [0, 1, 2, 3].map(f).map(fmt).join(', ');
        if (kind === 'next') return Q({ q: `What comes next?<br><b>${seq((i) => a + i * dd)}, ...</b>`, ans: a + 4 * dd, min: -999, wrong: [a + 3 * dd - dd, a + 5 * dd, a + 4 * dd + 1], hint: 'What is added each time?', why: `It goes up by ${fmt(dd)} each time: <b>${fmt(a + 4 * dd)}</b>.` });
        if (kind === 'nth') { const n = R(10, 50); return Q({ q: `Find the <b>${n}th</b> term of ${seq((i) => a + i * dd)}, ...`, ans: a + (n - 1) * dd, min: -9999, wrong: [a + n * dd, n * dd, a + (n - 2) * dd], hint: `a₁ + (n − 1)d = ${fmt(a)} + ${n - 1} × ${pn(dd)}.`, why: `${fmt(a)} + ${n - 1} × ${pn(dd)} = <b>${fmt(a + (n - 1) * dd)}</b>.` }); }
        const g0 = R(1, 5), r = pick(d < 0.6 ? [2, 3] : [2, 3, -2, 4]);
        if (kind === 'gnext') return Q({ q: `What comes next?<br><b>${seq((i) => g0 * Math.pow(r, i))}, ...</b>`, ans: g0 * Math.pow(r, 4), min: -99999, wrong: [g0 * Math.pow(r, 3) * 2 === g0 * Math.pow(r, 4) ? g0 * Math.pow(r, 3) + r : g0 * Math.pow(r, 3) * 2, -g0 * Math.pow(r, 4), g0 * Math.pow(r, 3) + (g0 * Math.pow(r, 3) - g0 * Math.pow(r, 2))], hint: 'What is each term MULTIPLIED by?', why: `Each term is × ${fmt(r)}: ${fmt(g0 * Math.pow(r, 3))} × ${pn(r)} = <b>${fmt(g0 * Math.pow(r, 4))}</b>.` });
        if (kind === 'ratio') return Q({ q: `What is the <b>common ratio</b> of ${seq((i) => g0 * Math.pow(r, i))}, ...?`, ans: r, min: -99, wrong: [g0 * r - g0, -r, r + 1, r * r], hint: 'Divide a term by the one before it.', why: `${fmt(g0 * r)} ÷ ${fmt(g0)} = <b>${fmt(r)}</b>.` });
        const n = pick([10, 20, 50, 100, 12, 30]);
        return Q({ q: `What is 1 + 2 + 3 + ... + ${n}?`, ans: n * (n + 1) / 2, wrong: [n * n, n * (n - 1) / 2, n * (n + 1)], hint: 'n(n + 1) ÷ 2. Pair the first and last numbers!', why: `${n} × ${n + 1} ÷ 2 = <b>${fmt(n * (n + 1) / 2)}</b>.` });
      },
    },
    {
      id: 'g11-inv', name: 'Inverse and Composite', icon: '\u{1F504}',
      lesson: [
        { t: `A <b>composite</b> function feeds one into another. ${fx(fx(X, 'g'))} means do g first, then f.`, v: big(`${fx(fx(X, 'g'))}`) },
        { t: `If ${fx()} = 2${X} + 1 and ${fx(X, 'g')} = ${X} + 3, then ${fx(fx(2, 'g'))} = ${fx(5)} = <b>11</b>.`, v: sm(`${fx(2, 'g')} = 5<br>${fx(5)} = 11`) },
        { t: `An <b>inverse</b>, written <i>f</i>${sup(M + '1')}, undoes f. ${fx()} = 3${X} − 2: undo it by adding 2, then dividing by 3. So <i>f</i>${sup(M + '1')}(10) = <b>4</b>.`, v: big(`<i>f</i>${sup(M + '1')}(${X}) = ${F(X + ' + 2', 3)}`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['comp', 'invv'] : d < 0.75 ? ['comp', 'invv', 'invf'] : ['invf', 'comp', 'invv']);
        const a = R(2, 5), b = R(-8, 8) || 3;
        const FN = `${fx()} = ${lin(a, b)}`;
        if (kind === 'comp') {
          const c = R(1, 4) * sgn(), e = R(-6, 6) || 1, k = R(-3, 4), gk = c * k + e, ans = a * gk + b, fk = a * k + b;
          return Q({ q: `${FN} and ${fx(X, 'g')} = ${lin(c, e)}.<br>What is ${fx(fx(fmt(k), 'g'))}?`, ans, min: -999, wrong: [c * fk + e, fk + gk, fk * gk], hint: `Work from the inside: find ${fx(fmt(k), 'g')} first.`, why: `${fx(fmt(k), 'g')} = ${fmt(gk)}, and ${fx(fmt(gk))} = <b>${fmt(ans)}</b>.` });
        }
        const INV = `<i>f</i>${sup(M + '1')}`;
        if (kind === 'invv') { const t = R(-6, 9), v = a * t + b; return Q({ q: `${FN}. What is ${INV}(${fmt(v)})?`, ans: t, min: -999, wrong: [a * v + b, v - b, Number.isInteger((v + b) / a) ? (v + b) / a : t + 1], hint: `${INV}(${fmt(v)}) asks: what goes IN to f to give ${fmt(v)}?`, why: `${lin(a, b)} = ${fmt(v)} when ${X} = <b>${fmt(t)}</b>.` }); }
        const W = (top, bot) => `${INV}(${X}) = ${F(top, bot)}`;
        return Q({ q: `${FN}. Which is ${INV}(${X})?`, ans: W(lin(1, -b), a), wrong: [W(lin(1, b), a), `${INV}(${X}) = ${lin(a, -b)}`, W(X, a) + ` ${b > 0 ? '−' : '+'} ${Math.abs(b)}`, W(lin(1, -a), b)], small: true, hint: `f multiplies by ${a} then ${b > 0 ? 'adds ' + b : 'takes away ' + -b}. Undo it in reverse order.`, why: `Undo the ${b > 0 ? '+' : '−'}${Math.abs(b)} first, then ÷ ${a}: <b>${W(lin(1, -b), a)}</b>.` });
      },
    },
  ];

  // =====================================================================================
  // GRADE 12 -- precalculus, a taste of calculus, statistics
  // =====================================================================================
  const RAD = { 30: F('π', 6), 45: F('π', 4), 60: F('π', 3), 90: F('π', 2), 120: F('2π', 3), 135: F('3π', 4), 150: F('5π', 6), 180: 'π', 270: F('3π', 2), 360: '2π' };
  const G12 = [
    {
      id: 'g12-unit', name: 'The Unit Circle', icon: '⭕',
      lesson: [
        { t: `<b>Radians</b> measure angles by arc length. Half a turn, 180°, is <b>π</b> radians. So 90° = ${F('π', 2)} and 60° = ${F('π', 3)}.`, v: big(`180° = π<br>90° = ${F('π', 2)}`) },
        { t: 'On the <b>unit circle</b> (radius 1), the point at angle θ is (cos θ, sin θ). At 0° it is (1, 0); at 90° it is (0, 1).', v: vPlane([[5, 0, '(1, 0)'], [0, 5, '(0, 1)'], [-5, 0, ''], [0, -5, '']]) },
        { t: `The special angles: sin 30° = ${F(1, 2)}, sin 45° = ${F('√2', 2)}, sin 60° = ${F('√3', 2)}. Cos goes the other way.`, v: sm(`sin: ${F(1, 2)}, ${F('√2', 2)}, ${F('√3', 2)}<br>cos: ${F('√3', 2)}, ${F('√2', 2)}, ${F(1, 2)}`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['rad', 'deg'] : d < 0.7 ? ['trig', 'rad', 'deg'] : ['trig', 'trig', 'rad']);
        const keys = Object.keys(RAD).map(Number);
        if (kind === 'rad') { const a = pick(keys); return Q({ q: `${a}° = how many radians?`, ans: RAD[a], wrong: keys.filter((k) => k !== a).map((k) => RAD[k]).sort(() => Math.random() - 0.5), hint: '180° = π. What fraction of 180 is it?', why: `${a} ÷ 180 = ${F(a / gcd(a, 180), 180 / gcd(a, 180))}, so it is <b>${RAD[a]}</b>.` }); }
        if (kind === 'deg') { const a = pick(keys); return Q({ q: `${RAD[a]} radians = how many degrees?`, ans: a, unit: '°', wrong: keys.filter((k) => k !== a), hint: 'Swap π for 180°.', why: `π = 180°, so ${RAD[a]} = <b>${a}°</b>.` }); }
        const half = F(1, 2), r2 = F('√2', 2), r3 = F('√3', 2), neg = (s) => M + s;
        const TAB = { 0: ['0', '1'], 30: [half, r3], 45: [r2, r2], 60: [r3, half], 90: ['1', '0'], 120: [r3, neg(half)], 135: [r2, neg(r2)], 150: [half, neg(r3)], 180: ['0', neg('1')] };
        const a = pick(d < 0.8 ? [0, 30, 45, 60, 90] : [30, 45, 60, 120, 135, 150, 180]), f = Math.random() < 0.5 ? 0 : 1;
        const ans = TAB[a][f];
        const pool = [half, r2, r3, '0', '1', neg(half), neg(r3), neg('1')];
        return Q({ q: `${f ? 'cos' : 'sin'} ${a}° = ${BL}`, ans, wrong: shuffle(pool.filter((p) => p !== ans)), hint: f ? 'cos is the x part of the point on the unit circle.' : 'sin is the y part of the point on the unit circle.', why: `The point at ${a}° is (${TAB[a][1]}, ${TAB[a][0]}). ${f ? 'cos' : 'sin'} ${a}° = <b>${ans}</b>.` });
      },
    },
    {
      id: 'g12-lim', name: 'Limits', icon: '➡️',
      lesson: [
        { t: `A <b>limit</b> asks: what value does a function get close to? For smooth functions, just plug the number in. lim<sub>${X}→3</sub> (${X}² + 1) = <b>10</b>.`, v: big(`lim<sub>${X}→3</sub> (${X}² + 1) = 10`) },
        { t: `If plugging in gives ${F(0, 0)}, try factoring. ${F(X + '² − 9', X + ' − 3')} = ${X} + 3 (when ${X} ≠ 3), so the limit as ${X}→3 is <b>6</b>.`, v: big(`${F(X + '² − 9', X + ' − 3')} → 6`) },
        { t: `As ${X}→∞ for a fraction of polynomials, only the biggest powers matter. ${F('6' + X + '² + 1', '2' + X + '² − 5')} → ${F(6, 2)} = <b>3</b>.`, v: big(`${F('6' + X + '²', '2' + X + '²')} → 3`) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['plug', 'plug', 'hole'] : d < 0.75 ? ['plug', 'hole', 'inf'] : ['hole', 'inf', 'inf']);
        const LIM = (a) => `lim<sub>${X}→${a}</sub>`;
        if (kind === 'plug') { const a = R(-4, 5), b = R(-6, 6), c = R(-9, 9), v = a * a + b * a + c; return Q({ q: `${LIM(fmt(a))} (${poly([1, b, c])}) = ${BL}`, ans: v, min: -999, wrong: [-a * a + b * a + c, a * a + b + c, v + 2 * a || v + 3], hint: `It is a smooth curve: put ${fmt(a)} in for ${X}.`, why: `(${fmt(a)})² ${b * a >= 0 ? '+' : '−'} ${Math.abs(b * a)} ${c >= 0 ? '+' : '−'} ${Math.abs(c)} = <b>${fmt(v)}</b>.` }); }
        if (kind === 'hole') { const a = R(1, 9) * sgn(); return Q({ q: `${LIM(fmt(a))} ${F(poly([1, 0, -a * a]), lin(1, -a))} = ${BL}`, ans: 2 * a, min: -99, wrong: [0, a, a * a], hint: `Factor the top: ${poly([1, 0, -a * a])} = ${bin(-a)}${bin(a)}.`, why: `It simplifies to ${lin(1, a)}, and ${fmt(a)} + ${pn(a)} = <b>${fmt(2 * a)}</b>.` }); }
        const bt = R(1, 5), k = R(1, 6) * sgn(), lower = Math.random() < 0.3;
        if (lower) return Q({ q: `${LIM('∞')} ${F(lin(R(2, 9), R(1, 9)), poly([bt, 0, R(1, 9)]))} = ${BL}`, ans: 0, wrong: [1, bt, 2], hint: `The bottom has the bigger power of ${X}, so it grows much faster.`, why: 'The bottom grows faster than the top, so the fraction shrinks to <b>0</b>.' });
        return Q({ q: `${LIM('∞')} ${F(poly([bt * k, R(-9, 9), R(1, 9)]), poly([bt, R(-9, 9), R(1, 9)]))} = ${BL}`, ans: k, min: -99, wrong: [bt * k, -k, 0], hint: `Only the ${X}² terms matter. Divide their numbers.`, why: `${fmt(bt * k)} ÷ ${bt} = <b>${fmt(k)}</b>.` });
      },
    },
    {
      id: 'g12-deriv', name: 'Derivatives', icon: '\u{1F4C9}',
      lesson: [
        { t: `The <b>derivative</b> <i>f</i>′(${X}) gives the slope of a curve at each point: how fast it is changing.`, v: big(`<i>f</i>′(${X}) = slope`) },
        { t: `The <b>power rule</b>: bring the power down in front, then lower the power by 1. ${X}${sup(3)} → <b>3${X}²</b>. A plain number’s derivative is 0.`, v: big(`${X}${sup(3)} → 3${X}${sup(2)}`) },
        { t: `${fx()} = ${X}² has <i>f</i>′(${X}) = 2${X}. At ${X} = 3 the curve’s slope is <b>6</b>.`, v: big(`<i>f</i>′(3) = 2·3 = 6`) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['power', 'power', 'const'] : d < 0.7 ? ['power', 'poly', 'slope'] : ['poly', 'slope', 'slope']);
        const D = (s) => `<i>f</i>′(${X}) = ${s}`;
        const mono = (c, p) => poly([c].concat(Array(p).fill(0)));
        if (kind === 'const') { const c = R(2, 99); return Q({ q: `${fx()} = ${c}. What is <i>f</i>′(${X})?`, ans: '0', wrong: [String(c), '1', mono(c, 1)], hint: 'A flat line has no slope.', why: `A number on its own never changes, so its derivative is <b>0</b>.` }); }
        if (kind === 'power') { const c = R(1, 6), p = R(2, 7); return Q({ q: `${fx()} = ${mono(c, p)}. What is <i>f</i>′(${X})?`, ans: D(mono(c * p, p - 1)), wrong: [D(mono(c, p - 1)), D(mono(c * p, p)), D(mono(c * (p - 1), p - 1)), D(mono(c * p, p + 1))], small: true, hint: 'Multiply by the power, then take 1 off the power.', why: `${c > 1 ? c + ' × ' + p + ' = ' + c * p : 'Bring the ' + p + ' down in front'}, and the power drops to ${p - 1}: <b>${D(mono(c * p, p - 1))}</b>.` }); }
        const a = R(1, 4), b = R(-6, 6), c = R(-9, 9) || 2, e = R(-9, 9);
        if (kind === 'poly') return Q({ q: `${fx()} = ${poly([a, b, c, e])}. What is <i>f</i>′(${X})?`, ans: D(poly([3 * a, 2 * b, c])), wrong: [D(poly([3 * a, 2 * b, c, e || 1])), D(poly([a, b, c])), D(poly([3 * a, 2 * b, 0])), D(poly([3 * a, b, c]))], small: true, hint: 'Take the derivative of each term on its own. The plain number disappears.', why: `<b>${D(poly([3 * a, 2 * b, c]))}</b>.` });
        const k = R(-4, 5), ap = R(1, 5) * sgn(), bp = R(-8, 8);
        return Q({ q: `${fx()} = ${poly([ap, bp, R(-9, 9)])}. What is the slope of the curve at ${X} = ${fmt(k)}?`, ans: 2 * ap * k + bp, min: -999, wrong: [ap * k * k + bp * k, 2 * ap + bp, 2 * ap * k - bp], hint: `Find <i>f</i>′(${X}) = ${lin(2 * ap, bp)}, then put in ${fmt(k)}.`, why: `<i>f</i>′(${X}) = ${lin(2 * ap, bp)}, so <i>f</i>′(${fmt(k)}) = <b>${fmt(2 * ap * k + bp)}</b>.` });
      },
    },
    {
      id: 'g12-count', name: 'Counting Choices', icon: '\u{1F0CF}',
      lesson: [
        { t: 'If you choose a shirt (4 kinds) AND pants (3 kinds), there are 4 × 3 = <b>12</b> outfits. Multiply the choices!', v: big('4 × 3 = 12') },
        { t: `<b>n!</b> ("n factorial") is n × (n − 1) × ... × 1. It counts ways to put n things in order: 4! = 24.`, v: big('4! = 4·3·2·1 = 24') },
        { t: 'When <b>order matters</b> (1st, 2nd, 3rd) use a permutation: 5 × 4 × 3. When it <b>doesn’t</b> (pick a team), divide out the orders: (5 × 4 × 3) ÷ 3! = <b>10</b>.', v: sm('order matters: 60<br>order doesn’t: 10') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['outfit', 'fact'] : d < 0.7 ? ['fact', 'perm', 'outfit', 'comb'] : ['perm', 'comb', 'comb']);
        const fact = (n) => (n <= 1 ? 1 : n * fact(n - 1));
        const P = (n, r) => fact(n) / fact(n - r), C = (n, r) => P(n, r) / fact(r);
        if (kind === 'outfit') { const a = R(2, 6), b = R(2, 5), c = R(2, 4); return Q({ q: `${a} shirts, ${b} pairs of pants and ${c} hats. How many different outfits?`, ans: a * b * c, wrong: [a + b + c, a * b + c, a * b], hint: 'Multiply the number of choices.', why: `${a} × ${b} × ${c} = <b>${a * b * c}</b>.` }); }
        if (kind === 'fact') { const n = R(3, 7); return Q({ q: `${n}! = ${BL}`, ans: fact(n), wrong: [n * (n - 1), n * n, fact(n - 1), fact(n) / 2], hint: `${Array.from({ length: n }, (_, i) => n - i).join(' × ')}.`, why: `${Array.from({ length: n }, (_, i) => n - i).join(' × ')} = <b>${fmt(fact(n))}</b>.` }); }
        const n = R(4, 9), r = pick([2, 3]);
        if (kind === 'perm') return Q({ q: `${n} runners race. In how many ways can the <b>${r === 2 ? '1st and 2nd' : '1st, 2nd and 3rd'}</b> places be given out?`, ans: P(n, r), wrong: [C(n, r), Math.pow(n, r), n * r], hint: `Order matters: ${Array.from({ length: r }, (_, i) => n - i).join(' × ')}.`, why: `${Array.from({ length: r }, (_, i) => n - i).join(' × ')} = <b>${P(n, r)}</b>.` });
        return Q({ q: `Pick <b>${r}</b> pizza toppings from ${n} choices (order doesn’t matter). How many ways?`, ans: C(n, r), wrong: [P(n, r), n * r, Math.pow(n, r)], hint: `Count the ordered ways, then divide by ${r}! = ${fact(r)}.`, why: `${P(n, r)} ÷ ${fact(r)} = <b>${C(n, r)}</b>.` });
      },
    },
    {
      id: 'g12-stats', name: 'Statistics', icon: '\u{1F4CA}',
      lesson: [
        { t: 'The <b>standard deviation</b> (σ) measures spread: how far data usually sits from the mean (μ). Small σ: bunched up. Big σ: spread out.', v: big('μ = mean<br>σ = spread') },
        { t: 'A <b>z-score</b> counts standard deviations from the mean: z = (x − μ) ÷ σ. Mean 70, σ = 5, score 80: z = 10 ÷ 5 = <b>2</b>.', v: sm('z = (x − μ) ÷ σ<br>(80 − 70) ÷ 5 = 2') },
        { t: 'In a bell-shaped (normal) curve, about <b>68%</b> of data is within 1σ of the mean, <b>95%</b> within 2σ, and <b>99.7%</b> within 3σ.', v: big('68 · 95 · 99.7') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['z', 'rule'] : d < 0.7 ? ['z', 'rule', 'ev'] : ['z', 'ev', 'rule', 'zx']);
        const mu = 10 * R(5, 9), s = pick([2, 4, 5, 10]), z = R(1, 3) * sgn(), x = mu + z * s;
        if (kind === 'z') return Q({ q: `Test scores have mean ${mu} and standard deviation ${s}. What is the <b>z-score</b> of ${x}?`, ans: z, min: -9, wrong: [x - mu, -z, z * 2 || 4], hint: '(score − mean) ÷ standard deviation.', why: `(${x} − ${mu}) ÷ ${s} = ${fmt(x - mu)} ÷ ${s} = <b>${fmt(z)}</b>.` });
        if (kind === 'zx') return Q({ q: `Mean ${mu}, standard deviation ${s}. Which score has a z-score of ${fmt(z)}?`, ans: x, wrong: [mu + z, mu - z * s, mu + s], hint: 'Start at the mean and move z standard deviations.', why: `${mu} + ${pn(z)} × ${s} = <b>${x}</b>.` });
        if (kind === 'rule') { const k = pick([1, 2, 3, 0]); const ans = ['50%', '68%', '95%', '99.7%'][k]; return Q({ q: k ? `In a normal distribution, about what percent of the data is within <b>${k}</b> standard deviation${k > 1 ? 's' : ''} of the mean?` : 'In a normal distribution, what percent of the data is <b>above</b> the mean?', ans, wrong: ['50%', '68%', '95%', '99.7%', '34%'], hint: 'Remember 68 · 95 · 99.7. A bell curve is perfectly balanced.', why: k ? `About <b>${ans}</b> is within ${k}σ.` : 'The curve is symmetric, so half, <b>50%</b>, is above the mean.' }); }
        const k = pick([2, 4, 5, 10]), w = k * R(1, 10);
        return Q({ q: `A game costs nothing to play. You have a ${F(1, k)} chance to win $${w}, otherwise $0. What is the <b>expected value</b> of one play?`, ans: w / k, pre: '$', wrong: [w, w / 2 === w / k ? w / 2 + 1 : w / 2, w - w / k], hint: 'Expected value = chance × prize.', why: `${F(1, k)} × $${w} = <b>$${fmt(w / k)}</b>.` });
      },
    },
  ];

  MM.GRADES.push(
    { n: 7, color: '#ec4899', blurb: 'Integers · % · Circles · Odds', topics: G7, big: true },
    { n: 8, color: '#f97316', blurb: 'Powers · Pythagoras · Lines', topics: G8, big: true },
    { n: 9, color: '#14b8a6', blurb: 'Algebra · Factoring · Functions', topics: G9, big: true },
    { n: 10, color: '#0ea5e9', blurb: 'Angles · Trig · Coordinates', topics: G10, big: true },
    { n: 11, color: '#6366f1', blurb: 'Quadratics · Logs · Sequences', topics: G11, big: true },
    { n: 12, color: '#a855f7', blurb: 'Unit circle · Limits · Calculus', topics: G12, big: true },
  );
  MM.GRADES.forEach((g) => { g.label = g.n ? 'GRADE ' + g.n : 'KINDERGARTEN'; });
})(window);
