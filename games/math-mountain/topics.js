// Math Mountain -- what each grade learns. window.MathMountain = { GRADES, F, V, ... }
// A topic is { id, name, icon, lesson: [{ t, v }], gen(d) }:
//   lesson slides: t = what Pip says (HTML), v = a picture (HTML / SVG string)
//   gen(d) makes one question, d = 0 (easiest) .. 1 (hardest). It returns
//   { q, vis, choices: [html], answer: index, hint, why } -- built with Q() or FQ() below.
// Wrong choices are the mistakes kids really make (forgot to carry, added the bottoms...),
// and every question says WHY the answer is right, so a miss still teaches.
(function (global) {
  'use strict';

  // ---------- little helpers ----------
  const R = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const MINUS = '−';
  const fmt = (n) => (n < 0 ? MINUS + fmt(-n) : n.toLocaleString('en-US'));
  // a negative number written after an operator gets brackets: 3 + (-4)
  const pn = (n) => (n < 0 ? '(' + fmt(n) + ')' : fmt(n));
  const F = (n, d) => `<span class="fr"><i>${n}</i><i>${d}</i></span>`;
  const X = '<span class="v">x</span>';
  const BL = '<span class="blank">&nbsp;?&nbsp;</span>';
  // hundredths (an integer) -> "0.45", "1.2", "3"
  const dec = (h) => {
    const neg = h < 0; h = Math.abs(h);
    let s = String(Math.floor(h / 100));
    const r = h % 100;
    if (r) s += '.' + String(r).padStart(2, '0').replace(/0$/, '');
    return (neg ? MINUS : '') + s;
  };
  const time = (h, m) => { h = ((h - 1 + 120) % 12) + 1; return h + ':' + String(m).padStart(2, '0'); };

  // Q: a multiple-choice question. ans / wrong may be numbers (shown with fmt, plus o.pre / o.unit)
  // or HTML strings. Numbers fill themselves up to 4 choices with near misses.
  function Q(o) {
    const count = o.count || 4;
    const num = typeof o.ans === 'number';
    const min = o.min !== undefined ? o.min : 0;
    const show = (v) => (typeof v === 'number' ? (o.pre || '') + fmt(v) + (o.unit || '') : String(v));
    const ans = show(o.ans);
    const list = o.fixed ? [] : [ans];
    const add = (v) => {
      if (list.length >= count) return;
      if (typeof v === 'number' && (v < min || !Number.isInteger(v) || !isFinite(v))) return;
      const s = show(v);
      if (!list.includes(s)) list.push(s);
    };
    (o.wrong || []).forEach(add);
    if (num) { for (let k = 1; list.length < count && k < 60; k++) { add(o.ans + k); add(o.ans - k); } }
    if (o.fixed) { list.length = 0; o.wrong.forEach((v) => list.push(show(v))); } else shuffle(list);
    return { q: o.q, vis: o.vis || '', choices: list, answer: list.indexOf(ans), hint: o.hint || '', why: o.why || '', small: o.small };
  }
  // FQ: the choices are fractions [n, d]. A wrong one with the same VALUE as the answer is left
  // out (so 2/4 never sits next to a right answer of 1/2).
  function FQ(o) {
    const [an, ad] = o.ans;
    const val = (f) => f[0] / f[1];
    const list = [o.ans];
    const add = (f) => {
      if (list.length >= 4 || !f || f[1] <= 0 || f[0] <= 0 || !Number.isInteger(f[0]) || !Number.isInteger(f[1])) return;
      if (list.some((g) => Math.abs(val(g) - val(f)) < 1e-9)) return;
      list.push(f);
    };
    (o.wrong || []).forEach(add);
    for (let k = 1; list.length < 4 && k < 40; k++) { add([an + k, ad]); add([an, ad + k]); add([Math.max(1, an - k), ad]); }
    shuffle(list);
    return { q: o.q, vis: o.vis || '', choices: list.map((f) => F(f[0], f[1])), answer: list.indexOf(o.ans), hint: o.hint || '', why: o.why || '' };
  }

  // ---------- pictures (inline SVG) ----------
  const SV = (vb, body) => `<svg class="vis" viewBox="${vb}" xmlns="http://www.w3.org/2000/svg">${body}</svg>`;
  const pop = (i) => `class="pop" style="animation-delay:${(i * 0.035).toFixed(3)}s"`;
  const T = (x, y, s, size = 12, fill = '#1e293b', anchor = 'middle') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" text-anchor="${anchor}" dominant-baseline="middle">${s}</text>`;

  // base-ten blocks: hundreds flats, tens rods, ones cubes
  function vBlocks(h, t, o) {
    let s = '', x = 0, k = 0;
    for (let i = 0; i < h; i++) {
      let g = '';
      for (let j = 1; j < 10; j++) g += `<path d="M${x + j * 7} 0V70M${x} ${j * 7}H${x + 70}" stroke="rgba(76,29,149,.35)" stroke-width=".7"/>`;
      s += `<g ${pop(k++)}><rect x="${x}" y="0" width="70" height="70" rx="2" fill="#a78bfa" stroke="#5b21b6"/>${g}</g>`;
      x += 78;
    }
    for (let i = 0; i < t; i++) {
      let g = '';
      for (let j = 1; j < 10; j++) g += `<path d="M${x} ${j * 7}H${x + 7}" stroke="rgba(30,64,175,.4)" stroke-width=".7"/>`;
      s += `<g ${pop(k++)}><rect x="${x}" y="0" width="7" height="70" rx="1.5" fill="#60a5fa" stroke="#1e40af"/>${g}</g>`;
      x += 11;
    }
    if (t) x += 6;
    for (let i = 0; i < o; i++) {
      const c = Math.floor(i / 5), r = i % 5;
      s += `<rect ${pop(k++)} x="${x + c * 10}" y="${63 - r * 10}" width="7" height="7" rx="1.5" fill="#fbbf24" stroke="#b45309"/>`;
    }
    const w = x + Math.ceil(o / 5) * 10;
    return SV(`-4 -4 ${Math.max(w, 30) + 8} 78`, s);
  }

  // counters: a + b (two colours) in rows of 5
  function vDots(a, b) {
    let s = '', k = 0;
    const grp = (n, x0, fill, stroke) => {
      for (let i = 0; i < n; i++) {
        const c = i % 5, r = Math.floor(i / 5);
        s += `<circle ${pop(k++)} cx="${x0 + c * 20 + 10}" cy="${r * 20 + 10}" r="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>`;
      }
      return Math.min(n, 5) * 20;
    };
    const wa = grp(a, 0, '#f472b6', '#be185d');
    s += T(wa + 14, Math.max(Math.ceil(a / 5), Math.ceil(b / 5)) * 10, '+', 22, '#475569');
    const wb = grp(b, wa + 28, '#60a5fa', '#1d4ed8');
    const rows = Math.max(Math.ceil(a / 5), Math.ceil(b / 5));
    return SV(`-4 -4 ${wa + 28 + wb + 8} ${rows * 20 + 8}`, s);
  }

  // take away: total counters, the last `gone` crossed out
  function vTake(total, gone) {
    let s = '';
    for (let i = 0; i < total; i++) {
      const c = i % 5, r = Math.floor(i / 5), cx = c * 22 + 11 + (c > 4 ? 6 : 0), cy = r * 22 + 11;
      const off = i >= total - gone;
      s += `<g ${pop(i)}><circle cx="${cx}" cy="${cy}" r="9" fill="${off ? '#e2e8f0' : '#34d399'}" stroke="${off ? '#94a3b8' : '#047857'}" stroke-width="1.5"/>` +
        (off ? `<path d="M${cx - 7} ${cy - 7}L${cx + 7} ${cy + 7}M${cx + 7} ${cy - 7}L${cx - 7} ${cy + 7}" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round"/>` : '') + '</g>';
    }
    return SV(`-4 -4 ${Math.min(total, 5) * 22 + 8} ${Math.ceil(total / 5) * 22 + 8}`, s);
  }

  // number line from min to max. o.from -> o.to draws hops; o.mark = a dot; o.label = text over the dot
  function vLine(min, max, o = {}) {
    const span = max - min;
    const u = Math.min(28, 420 / span);
    const W = span * u;
    const X0 = (v) => (v - min) * u;
    const lab = o.every || (span <= 20 ? 1 : span <= 50 ? 5 : 10);
    let s = `<path d="M-8 30H${W + 8}" stroke="#334155" stroke-width="2.5" stroke-linecap="round"/>`;
    const tickEvery = span > 60 ? (o.tick || 10) : 1;
    for (let v = min; v <= max; v += tickEvery) {
      const big = (v - min) % lab === 0;
      s += `<path d="M${X0(v)} ${big ? 23 : 26}V${big ? 37 : 34}" stroke="#334155" stroke-width="${big ? 2 : 1.2}"/>`;
      if (big) s += T(X0(v), 48, fmt(v), 11, '#334155');
    }
    if (o.from !== undefined && o.to !== undefined && o.from !== o.to) {
      const steps = Math.abs(o.to - o.from), dir = Math.sign(o.to - o.from);
      const each = steps <= 12 ? 1 : steps;
      for (let i = 0; i < steps; i += each) {
        const a = X0(o.from + dir * i), b = X0(o.from + dir * Math.min(i + each, steps));
        const h = Math.min(30, 8 + Math.abs(b - a) * 0.4);
        s += `<path ${pop(i)} d="M${a} 26Q${(a + b) / 2} ${26 - h} ${b} 26" fill="none" stroke="#ec4899" stroke-width="2.2"/>`;
      }
      s += `<circle cx="${X0(o.from)}" cy="30" r="5" fill="#ec4899"/><circle cx="${X0(o.to)}" cy="30" r="5.5" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>`;
    }
    if (o.mark !== undefined) {
      s += `<circle cx="${X0(o.mark)}" cy="30" r="6" fill="#fbbf24" stroke="#b45309" stroke-width="1.5"/>`;
      if (o.label) s += T(X0(o.mark), 10, o.label, 12, '#b45309');
    }
    return SV(`-18 -12 ${W + 36} 70`, s);
  }

  function vClock(h, m) {
    let s = `<circle r="50" fill="#fff" stroke="#1e3a8a" stroke-width="4"/>`;
    for (let i = 0; i < 60; i++) {
      const a = (i * 6 * Math.PI) / 180, big = i % 5 === 0;
      s += `<path d="M${Math.sin(a) * (big ? 41 : 44)} ${-Math.cos(a) * (big ? 41 : 44)}L${Math.sin(a) * 47} ${-Math.cos(a) * 47}" stroke="#64748b" stroke-width="${big ? 1.6 : .7}"/>`;
    }
    for (let n = 1; n <= 12; n++) { const a = (n * 30 * Math.PI) / 180; s += T(Math.sin(a) * 33, -Math.cos(a) * 33 + 1, n, 11, '#1e293b'); }
    const ha = (((h % 12) + m / 60) * 30 * Math.PI) / 180, ma = (m * 6 * Math.PI) / 180;
    s += `<path d="M0 0L${Math.sin(ha) * 23} ${-Math.cos(ha) * 23}" stroke="#1e3a8a" stroke-width="6" stroke-linecap="round"/>`;
    s += `<path d="M0 0L${Math.sin(ma) * 39} ${-Math.cos(ma) * 39}" stroke="#ef4444" stroke-width="3.5" stroke-linecap="round"/>`;
    s += `<circle r="4" fill="#1e293b"/>`;
    return SV('-56 -56 112 112', s);
  }

  const COIN = { Q: { r: 19, f: '#cbd5e1', e: '#64748b', v: 25 }, D: { r: 13, f: '#e2e8f0', e: '#64748b', v: 10 }, N: { r: 16, f: '#d1d5db', e: '#6b7280', v: 5 }, P: { r: 14, f: '#f59e0b', e: '#9a3412', v: 1 } };
  const COIN_NAME = { Q: 'quarter', D: 'dime', N: 'nickel', P: 'penny' };
  function vCoins(list, names) {
    let s = '', x = 0;
    list.forEach((c, i) => {
      const k = COIN[c];
      x += k.r;
      s += `<g ${pop(i)}><circle cx="${x}" cy="22" r="${k.r}" fill="${k.f}" stroke="${k.e}" stroke-width="2"/><circle cx="${x}" cy="22" r="${k.r - 3.5}" fill="none" stroke="${k.e}" stroke-width=".8" opacity=".6"/>${T(x, 23, k.v + '¢', k.r > 14 ? 11 : 9, '#1e293b')}</g>`;
      if (names) s += T(x, 54, COIN_NAME[c].toUpperCase(), 8, '#475569');
      x += k.r + 8;
    });
    return SV(`-4 -2 ${x} ${names ? 62 : 48}`, s);
  }

  // g groups (circles) of n dots, plus `extra` dots left over
  function vGroups(g, n, extra = 0) {
    const cols = Math.ceil(Math.sqrt(n)), rows = Math.ceil(n / cols);
    const R0 = Math.max(cols, rows) * 7 + 9;
    const per = Math.min(g, 5);
    let s = '', k = 0;
    for (let i = 0; i < g; i++) {
      const cx = (i % per) * (R0 * 2 + 10) + R0, cy = Math.floor(i / per) * (R0 * 2 + 10) + R0;
      s += `<circle cx="${cx}" cy="${cy}" r="${R0}" fill="#e0f2fe" stroke="#0284c7" stroke-width="2"/>`;
      for (let j = 0; j < n; j++) {
        const c = j % cols, r = Math.floor(j / cols);
        s += `<circle ${pop(k++)} cx="${cx + (c - (cols - 1) / 2) * 14}" cy="${cy + (r - (rows - 1) / 2) * 14}" r="5.5" fill="#f97316" stroke="#c2410c" stroke-width="1"/>`;
      }
    }
    let w = per * (R0 * 2 + 10);
    for (let j = 0; j < extra; j++) s += `<circle ${pop(k++)} cx="${w + 12 + (j % 2) * 15}" cy="${R0 - 8 + Math.floor(j / 2) * 15}" r="5.5" fill="#f97316" stroke="#c2410c" stroke-width="1"/>`;
    if (extra) w += 40;
    const H = Math.ceil(g / per) * (R0 * 2 + 10);
    return SV(`-4 -4 ${w + 4} ${H}`, s);
  }

  function vArray(r, c, color = '#8b5cf6') {
    let s = '', k = 0;
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) s += `<circle ${pop(k++)} cx="${j * 18 + 9}" cy="${i * 18 + 9}" r="6.5" fill="${color}"/>`;
    return SV(`-4 -4 ${c * 18 + 8} ${r * 18 + 8}`, s);
  }

  function pieBody(n, d, cx, cy, r, fill = '#f472b6') {
    if (d === 1) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${n ? fill : '#fff'}" stroke="#1e293b" stroke-width="2"/>`;
    let s = '';
    for (let i = 0; i < d; i++) {
      const a0 = -Math.PI / 2 + (i * 2 * Math.PI) / d, a1 = a0 + (2 * Math.PI) / d;
      s += `<path d="M${cx} ${cy}L${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)}A${r} ${r} 0 0 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)}Z" fill="${i < n ? fill : '#fff'}" stroke="#1e293b" stroke-width="2" stroke-linejoin="round"/>`;
    }
    return s;
  }
  const vPie = (n, d) => SV('-52 -52 104 104', pieBody(n, d, 0, 0, 48));

  // fraction bars, one per [n, d], with an optional label
  function vBars(list, labels = true, colors) {
    let s = '';
    const W = 240;
    list.forEach(([n, d], row) => {
      const y = row * 34;
      for (let i = 0; i < d; i++) s += `<rect ${pop(row * 4 + i)} x="${(i * W) / d}" y="${y}" width="${W / d}" height="26" fill="${i < n ? (colors ? colors[row] : '#f472b6') : '#fff'}" stroke="#1e293b" stroke-width="1.6"/>`;
      if (labels) s += T(W + 22, y + 14, `${n}/${d}`, 13, '#1e293b');
    });
    return SV(`-3 -3 ${W + (labels ? 46 : 6)} ${list.length * 34 - 2}`, s);
  }

  // 0..1 number line cut into d parts, dot at n/d
  function vFracLine(n, d) {
    const W = 300;
    let s = `<path d="M0 30H${W}" stroke="#334155" stroke-width="2.5"/>`;
    for (let i = 0; i <= d; i++) s += `<path d="M${(i * W) / d} 22V38" stroke="#334155" stroke-width="2"/>`;
    s += T(0, 50, '0', 12) + T(W, 50, '1', 12);
    s += `<circle cx="${(n * W) / d}" cy="30" r="7" fill="#fbbf24" stroke="#b45309" stroke-width="2"/>`;
    return SV(`-14 6 ${W + 28} 54`, s);
  }

  // w x h rectangle. o.grid (draw squares), o.perim (thick outline), o.lab (side lengths)
  function vGrid(w, h, o = {}) {
    const u = Math.min(24, 200 / Math.max(w, h));
    let s = '';
    if (o.grid !== false) {
      let k = 0;
      for (let i = 0; i < h; i++) for (let j = 0; j < w; j++) s += `<rect ${pop(k++)} x="${j * u}" y="${i * u}" width="${u}" height="${u}" fill="#6ee7b7" stroke="#047857" stroke-width="1.2"/>`;
    } else {
      s += `<rect width="${w * u}" height="${h * u}" fill="#6ee7b7" stroke="#047857" stroke-width="2"/>`;
    }
    if (o.perim) s += `<rect width="${w * u}" height="${h * u}" fill="none" stroke="#f97316" stroke-width="4"/>`;
    if (o.lab !== false) s += T((w * u) / 2, -9, w, 13, '#1e293b') + T(-11, (h * u) / 2, h, 13, '#1e293b');
    return SV(`-24 -22 ${w * u + 34} ${h * u + 30}`, s);
  }

  // 10 x 10 grid with n hundredths shaded (column by column, so tenths read as columns)
  function vHundred(n, fill = '#38bdf8') {
    let s = '';
    for (let c = 0; c < 10; c++) for (let r = 0; r < 10; r++) {
      const i = c * 10 + r;
      s += `<rect x="${c * 11}" y="${r * 11}" width="11" height="11" fill="${i < n ? fill : '#fff'}" stroke="#334155" stroke-width=".8"/>`;
    }
    return SV('-2 -2 114 114', s);
  }

  // a box of l x w x h cubes (o.solid: one plain box with side labels)
  function vBox(l, w, h, o = {}) {
    const s0 = Math.min(18, 150 / (l + w * 0.5 + 1), 110 / (h + w * 0.5 + 1)), dx = s0 * 0.5;
    let s = '';
    const cube = (ox, oy, sx, sy, k) => {
      const top = oy - sy;
      return `<g ${k >= 0 ? pop(k) : ''}><rect x="${ox}" y="${top}" width="${sx}" height="${sy}" fill="#60a5fa" stroke="#1e3a8a" stroke-width="1"/>` +
        `<path d="M${ox} ${top}L${ox + dx * (sx / s0 > 1 ? 1 : 1) * (o.solid ? w : 1)} ${top - dx * (o.solid ? w : 1)}L${ox + sx + dx * (o.solid ? w : 1)} ${top - dx * (o.solid ? w : 1)}L${ox + sx} ${top}Z" fill="#bfdbfe" stroke="#1e3a8a" stroke-width="1"/>` +
        `<path d="M${ox + sx} ${top}L${ox + sx + dx * (o.solid ? w : 1)} ${top - dx * (o.solid ? w : 1)}L${ox + sx + dx * (o.solid ? w : 1)} ${top - dx * (o.solid ? w : 1) + sy}L${ox + sx} ${oy}Z" fill="#3b82f6" stroke="#1e3a8a" stroke-width="1"/></g>`;
    };
    if (o.solid) {
      s += cube(0, 0, l * s0, h * s0, -1);
    } else {
      let k = 0;
      for (let y = w - 1; y >= 0; y--) for (let z = 0; z < h; z++) for (let x = 0; x < l; x++) s += cube(x * s0 + y * dx, -z * s0 - y * dx, s0, s0, k++);
    }
    const Wd = l * s0 + w * dx, Hd = h * s0 + w * dx;
    if (o.lab !== false) {
      s += T((l * s0) / 2, 12, o.labels ? o.labels[0] : l, 12) + T(-10, (-h * s0) / 2, o.labels ? o.labels[2] : h, 12) +
        T(l * s0 + (w * dx) / 2 + 9, -(w * dx) / 2 + 4, o.labels ? o.labels[1] : w, 12);
    }
    return SV(`-22 ${-Hd - 8} ${Wd + 44} ${Hd + 28}`, s);
  }

  // area model for a x b (splits into tens and ones). o.show = write the products in
  function vArea(a, b, o = {}) {
    const split = (n) => (n >= 100 ? [Math.floor(n / 100) * 100, Math.floor((n % 100) / 10) * 10, n % 10] : n >= 10 ? [Math.floor(n / 10) * 10, n % 10] : [n]).filter((v) => v);
    const A = split(a), B = split(b);
    const wOf = (v, i, arr) => (arr.length === 1 ? 200 : i === 0 ? 150 : 70);
    const hOf = (v, i, arr) => (arr.length === 1 ? 70 : i === 0 ? 70 : 42);
    const cols = ['#bfdbfe', '#fde68a', '#bbf7d0', '#fbcfe8'];
    let s = '', y = 0, k = 0;
    B.forEach((bv, j) => {
      const hh = hOf(bv, j, B);
      let x = 0;
      A.forEach((av, i) => {
        const ww = wOf(av, i, A);
        s += `<g ${pop(k)}><rect x="${x}" y="${y}" width="${ww}" height="${hh}" fill="${cols[k++ % 4]}" stroke="#1e293b" stroke-width="1.6"/>` +
          T(x + ww / 2, y + hh / 2, `${fmt(av)} × ${fmt(bv)}${o.show ? ' = ' + fmt(av * bv) : ''}`, ww < 90 ? 10 : 12) + '</g>';
        if (j === 0) s += T(x + ww / 2, -10, fmt(av), 13, '#1d4ed8');
        x += ww;
      });
      s += T(-14, y + hh / 2, fmt(bv), 13, '#b45309');
      y += hh;
    });
    const W = A.reduce((t, v, i, arr) => t + wOf(v, i, arr), 0);
    return SV(`-34 -22 ${W + 40} ${y + 26}`, s);
  }

  // vertical sum / difference. o.carry = small digit over the tens
  function vColumn(a, b, op, o = {}) {
    const x = 92;
    let s = '';
    if (o.carry) s += T(x - 26 - (o.carryShift || 0), 6, o.carry, 13, '#ef4444', 'end');
    s += T(x, 28, a, 26, '#1e293b', 'end') + T(x, 60, b, 26, '#1e293b', 'end') + T(-6, 60, op, 26, '#1e293b', 'start');
    s += `<path d="M-8 78H${x + 4}" stroke="#1e293b" stroke-width="3"/>`;
    s += T(x, 98, o.ans !== undefined ? o.ans : '?', 26, o.ans !== undefined ? '#16a34a' : '#6366f1', 'end');
    return SV('-12 -8 122 122', `<g class="mono">${s}</g>`);
  }

  // balance scale with text on each pan
  function vScale(L, Rt) {
    let s = `<path d="M120 30L120 100M95 104H145" stroke="#475569" stroke-width="5" stroke-linecap="round"/><path d="M110 104L120 88L130 104Z" fill="#475569"/>`;
    s += `<path d="M30 30H210" stroke="#475569" stroke-width="5" stroke-linecap="round"/><circle cx="120" cy="30" r="5" fill="#f59e0b"/>`;
    s += `<path d="M30 30L10 62M30 30L50 62M210 30L190 62M210 30L230 62" stroke="#94a3b8" stroke-width="1.5"/>`;
    s += `<path d="M2 62H58Q54 78 30 78Q6 78 2 62Z" fill="#fcd34d" stroke="#b45309" stroke-width="1.5"/><path d="M182 62H238Q234 78 210 78Q186 78 182 62Z" fill="#fcd34d" stroke="#b45309" stroke-width="1.5"/>`;
    // the mystery letter gets the same italic serif as .v, so x never looks like a times sign
    const vx = (t) => String(t).replace(/x/g, `<tspan font-family="Georgia, 'Times New Roman', serif" font-style="italic" font-weight="700">x</tspan>`);
    s += T(30, 48, vx(L), 17, '#1e3a8a') + T(210, 48, vx(Rt), 17, '#1e3a8a');
    return SV('-6 0 252 112', s);
  }

  // bar chart; o.mean draws a dashed line at that height
  function vChart(vals, o = {}) {
    const top = Math.max(...vals, o.mean || 0), k = 90 / top;
    let s = `<path d="M0 100H${vals.length * 40}" stroke="#334155" stroke-width="2"/>`;
    vals.forEach((v, i) => {
      s += `<rect ${pop(i)} x="${i * 40 + 8}" y="${100 - v * k}" width="26" height="${v * k}" rx="3" fill="#a78bfa" stroke="#6d28d9" stroke-width="1.5"/>`;
      s += T(i * 40 + 21, 92 - v * k, v, 12, '#4c1d95');
    });
    if (o.mean) s += `<path d="M0 ${100 - o.mean * k}H${vals.length * 40}" stroke="#ef4444" stroke-width="2" stroke-dasharray="5 4"/>` + T(vals.length * 40 + 4, 100 - o.mean * k, 'mean ' + o.mean, 11, '#ef4444', 'start');
    return SV(`-4 -12 ${vals.length * 40 + (o.mean ? 70 : 8)} 118`, s);
  }

  // a circles then b squares, for ratios
  function vRatio(a, b) {
    let s = '', k = 0, x = 0;
    for (let i = 0; i < a; i++, x += 22) s += `<circle ${pop(k++)} cx="${x + 10}" cy="12" r="9" fill="#f472b6" stroke="#be185d" stroke-width="1.5"/>`;
    x += 12;
    for (let i = 0; i < b; i++, x += 22) s += `<rect ${pop(k++)} x="${x + 1}" y="3" width="18" height="18" rx="3" fill="#60a5fa" stroke="#1d4ed8" stroke-width="1.5"/>`;
    return SV(`-4 -4 ${x + 6} 32`, s);
  }

  // two numbers with the hungry alligator mouth opening towards the bigger one
  function vGator(a, b, show = true) {
    const big = a > b ? 'L' : a < b ? 'R' : '=';
    let s = T(40, 50, a, 44, '#1e3a8a') + T(200, 50, b, 44, '#1e3a8a');
    if (show && big !== '=') {
      const f = big === 'L' ? 1 : -1, cx = 120;
      // tip of the mouth points at the smaller number, the open jaws at the bigger one
      const tip = cx + 26 * f, open = cx - 26 * f;
      s += `<path d="M${open} 18L${tip} 46L${open} 74" fill="none" stroke="#16a34a" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>`;
      for (let i = 1; i <= 3; i++) {
        const t = i / 4, x = open + (tip - open) * t, yu = 18 + 28 * t, yd = 74 - 28 * t;
        s += `<path d="M${x - 3} ${yu + 5}L${x} ${yu + 12}L${x + 3} ${yu + 5}Z" fill="#fff"/><path d="M${x - 3} ${yd - 5}L${x} ${yd - 12}L${x + 3} ${yd - 5}Z" fill="#fff"/>`;
      }
      s += `<circle cx="${open + 12 * f}" cy="${26}" r="5" fill="#fff" stroke="#14532d" stroke-width="1.5"/><circle cx="${open + 12 * f}" cy="26" r="2.2" fill="#14532d"/>`;
    } else if (big === '=') {
      s += `<path d="M100 38H140M100 56H140" stroke="#16a34a" stroke-width="9" stroke-linecap="round"/>`;
    }
    return SV('0 0 240 92', s);
  }

  // ---------- Kindergarten pictures ----------
  // one little object (apple, star, fish, duck) centred on cx, cy
  function obj(kind, cx, cy, k) {
    const p = `class="pop" style="animation-delay:${(k * 0.05).toFixed(2)}s"`;
    if (kind === 'apple') return `<g ${p}><circle cx="${cx}" cy="${cy + 1}" r="9" fill="#ef4444" stroke="#991b1b" stroke-width="1.2"/><path d="M${cx} ${cy - 7}v-4" stroke="#78350f" stroke-width="2" stroke-linecap="round"/><ellipse cx="${cx + 4}" cy="${cy - 10}" rx="4" ry="2" fill="#22c55e"/><circle cx="${cx - 3}" cy="${cy - 2}" r="2" fill="#fff" opacity=".5"/></g>`;
    if (kind === 'star') { let d = ''; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 4.5 : 10.5; d += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1); } return `<path ${p} d="${d}Z" fill="#facc15" stroke="#a16207" stroke-width="1.2" stroke-linejoin="round"/>`; }
    if (kind === 'fish') return `<g ${p}><ellipse cx="${cx - 1}" cy="${cy}" rx="8" ry="5.5" fill="#38bdf8" stroke="#0369a1" stroke-width="1.2"/><path d="M${cx + 6} ${cy}l6 -5v10z" fill="#38bdf8" stroke="#0369a1" stroke-width="1.2" stroke-linejoin="round"/><circle cx="${cx - 4}" cy="${cy - 1.5}" r="1.4" fill="#0f172a"/></g>`;
    return `<g ${p}><ellipse cx="${cx}" cy="${cy + 3}" rx="9" ry="6" fill="#fde047" stroke="#a16207" stroke-width="1.2"/><circle cx="${cx - 4}" cy="${cy - 4}" r="5" fill="#fde047" stroke="#a16207" stroke-width="1.2"/><path d="M${cx - 9} ${cy - 4}l-4 1.5l4 1.5z" fill="#f97316"/><circle cx="${cx - 5}" cy="${cy - 5}" r="1.1" fill="#0f172a"/></g>`;
  }
  const KINDS = ['apple', 'star', 'fish', 'duck'];
  const KNAME = { apple: 'APPLES', star: 'STARS', fish: 'FISH', duck: 'DUCKS' };
  // n objects in rows of 5 (like a ten frame), or a messy scatter
  function vObjs(n, kind, o = {}) {
    let s = '';
    if (o.scatter) {
      const spots = []; let tries = 0;
      while (spots.length < n && tries++ < 3000) { const x = 12 + Math.random() * 150, y = 12 + Math.random() * 70; if (spots.every((q) => Math.hypot(q[0] - x, q[1] - y) > 23)) spots.push([x, y]); }
      if (spots.length === n) { spots.forEach((q, i) => { s += obj(kind, q[0], q[1], i); }); return SV('-2 -4 176 98', s); }
    }
    const cols = Math.min(n, 5), rows = Math.ceil(n / 5);
    for (let i = 0; i < n; i++) s += obj(kind, (i % 5) * 26 + 12, Math.floor(i / 5) * 26 + 13, i);
    return SV(`-2 -2 ${cols * 26 + 2} ${rows * 26 + 2}`, s);
  }
  // two groups to add: a and b of the same kind with a + between
  function vKAdd(a, b, kind) {
    let s = '', k = 0;
    const grp = (n, x0) => { for (let i = 0; i < n; i++) s += obj(kind, x0 + (i % 5) * 24 + 12, Math.floor(i / 5) * 24 + 13, k++); return Math.min(n, 5) * 24; };
    const wa = grp(a, 0), rows = Math.max(Math.ceil(a / 5), Math.ceil(b / 5));
    s += T(wa + 14, rows * 12 + 1, '+', 26, '#475569');
    const wb = grp(b, wa + 28);
    return SV(`-2 -2 ${wa + 28 + wb + 4} ${rows * 24 + 4}`, s);
  }
  // total objects, the last `gone` faded and crossed out
  function vKTake(total, gone, kind) {
    let s = '';
    for (let i = 0; i < total; i++) {
      const cx = (i % 5) * 26 + 12, cy = Math.floor(i / 5) * 26 + 13, off = i >= total - gone;
      s += `<g opacity="${off ? 0.4 : 1}">${obj(kind, cx, cy, i)}</g>` + (off ? `<path d="M${cx - 9} ${cy - 9}L${cx + 9} ${cy + 9}M${cx + 9} ${cy - 9}L${cx - 9} ${cy + 9}" stroke="#ef4444" stroke-width="3" stroke-linecap="round"/>` : '');
    }
    return SV(`-2 -2 ${Math.min(total, 5) * 26 + 2} ${Math.ceil(total / 5) * 26 + 2}`, s);
  }
  // two rows to compare, lined up so each one has a partner
  function vRows(a, ka, b, kb) {
    let s = '';
    for (let i = 0; i < a; i++) s += obj(ka, i * 24 + 12, 13, i);
    for (let i = 0; i < b; i++) s += obj(kb, i * 24 + 12, 45, a + i);
    return SV(`-2 -2 ${Math.max(a, b) * 24 + 4} 62`, s);
  }
  const SHAPES = {
    CIRCLE: '<circle cx="50" cy="50" r="38"/>',
    SQUARE: '<rect x="14" y="14" width="72" height="72" rx="3"/>',
    TRIANGLE: '<path d="M50 10L90 84H10Z"/>',
    RECTANGLE: '<rect x="4" y="26" width="92" height="50" rx="3"/>',
    HEXAGON: '<path d="M30 14H70L90 50L70 86H30L10 50Z"/>',
    OVAL: '<ellipse cx="50" cy="50" rx="44" ry="28"/>',
  };
  const SHAPE_COLORS = ['#f472b6', '#60a5fa', '#4ade80', '#facc15', '#fb923c', '#a78bfa'];
  const vShape = (name) => SV('0 0 100 100', `<g fill="${pick(SHAPE_COLORS)}" stroke="#1e293b" stroke-width="3" stroke-linejoin="round">${SHAPES[name]}</g>`);
  const vShapeRow = (names) => SV(`0 0 ${names.length * 110} 100`, names.map((n, i) => `<g transform="translate(${i * 110} 0)" fill="${SHAPE_COLORS[i % 6]}" stroke="#1e293b" stroke-width="3" stroke-linejoin="round">${SHAPES[n]}</g>`).join(''));

  const big = (s) => `<div class="big">${s}</div>`;

  // ======================================================================
  //   KINDERGARTEN
  // ======================================================================
  const GK = [
    {
      id: 'gk-count', name: 'How Many?', icon: '\u{1F34E}',
      lesson: [
        { t: 'Let\u2019s <b>count</b>! Touch each apple one time and say a number: 1, 2, 3, 4, <b>5</b>.', v: vObjs(5, 'apple') },
        { t: 'The <b>last number</b> you say tells how many. 1, 2, 3, 4, 5, 6, 7. There are <b>7</b> stars!', v: vObjs(7, 'star') },
        { t: 'Rows of 5 make counting easy. A full row is <b>5</b>, then count on: 6, 7, 8. That\u2019s <b>8</b> fish!', v: vObjs(8, 'fish') },
      ],
      gen(d) {
        const kind = pick(KINDS);
        if (d > 0.6 && Math.random() < 0.4) {
          const m = R(1, d > 0.8 ? 16 : 7);
          return Q({ q: `What comes next?<br>${m}, ${m + 1}, ${m + 2}, ${BL}`, ans: m + 3, wrong: [m + 4, m + 2, m + 1], min: 1, hint: 'Count on by one more.', why: `After ${m + 2} comes <b>${m + 3}</b>.` });
        }
        const n = R(1, d < 0.35 ? 5 : d < 0.7 ? 10 : 15);
        return Q({ q: `How many ${KNAME[kind].toLowerCase()}?`, vis: vObjs(n, kind, { scatter: d > 0.5 && n <= 10 }), ans: n, wrong: [n + 1, n - 1, n + 2], min: 1, hint: 'Touch each one and count. The last number you say is how many.', why: `Count them: ${Array.from({ length: n }, (_, i) => i + 1).join(', ')}. There are <b>${n}</b>.` });
      },
    },
    {
      id: 'gk-more', name: 'More or Fewer', icon: '\u2696\uFE0F',
      lesson: [
        { t: 'Which row has <b>MORE</b>? Line them up and look: the apples go further. <b>5 apples</b> is more than 3 stars.', v: vRows(5, 'apple', 3, 'star') },
        { t: '<b>FEWER</b> means not as many. 2 fish is <b>fewer</b> than 4 ducks.', v: vRows(2, 'fish', 4, 'duck') },
        { t: 'If every one has a partner, they are the <b>SAME</b>. 4 and 4 are the same!', v: vRows(4, 'star', 4, 'apple') },
      ],
      gen(d) {
        const [ka, kb] = shuffle(KINDS.slice()).slice(0, 2);
        if (d > 0.6 && Math.random() < 0.4) {
          const a = R(1, 10); let b; do { b = R(1, 10); } while (b === a);
          return Q({ q: 'Which number is <b>BIGGER</b>?', ans: String(Math.max(a, b)), wrong: [String(a), String(b)], count: 2, hint: 'Which number comes later when you count?', why: `When you count, ${Math.max(a, b)} comes after ${Math.min(a, b)}, so <b>${Math.max(a, b)}</b> is bigger.` });
        }
        const a = R(1, d < 0.4 ? 5 : 8), b = Math.random() < 0.2 ? a : R(1, d < 0.4 ? 5 : 8);
        const askMore = d < 0.35 || Math.random() < 0.55;
        const A = KNAME[ka], B = KNAME[kb];
        const ans = a === b ? 'SAME' : (askMore ? (a > b ? A : B) : (a < b ? A : B));
        const why = a === b ? `${a} and ${b}: they are the <b>SAME</b>.` : `There are ${a} ${A.toLowerCase()} and ${b} ${B.toLowerCase()}. <b>${ans}</b> has ${askMore ? 'more' : 'fewer'}.`;
        return Q({ q: `Which has <b>${askMore ? 'MORE' : 'FEWER'}</b>?`, vis: vRows(a, ka, b, kb), ans, wrong: [A, B, 'SAME'], count: 3, fixed: true, small: true, hint: 'Count each row, or match them up in pairs.', why });
      },
    },
    {
      id: 'gk-shapes', name: 'Shapes', icon: '\u{1F537}',
      lesson: [
        { t: 'A <b>CIRCLE</b> is round, with no corners. A <b>TRIANGLE</b> has 3 sides and 3 corners.', v: vShapeRow(['CIRCLE', 'TRIANGLE']) },
        { t: 'A <b>SQUARE</b> has 4 sides that are all the same. A <b>RECTANGLE</b> has 4 sides too: 2 long and 2 short.', v: vShapeRow(['SQUARE', 'RECTANGLE']) },
        { t: 'A <b>HEXAGON</b> has 6 sides, like a honeycomb. An <b>OVAL</b> is round and stretched, like an egg.', v: vShapeRow(['HEXAGON', 'OVAL']) },
      ],
      gen(d) {
        const easy = ['CIRCLE', 'SQUARE', 'TRIANGLE', 'RECTANGLE'], all = easy.concat(['HEXAGON', 'OVAL']);
        const SIDES = { TRIANGLE: 3, SQUARE: 4, RECTANGLE: 4, HEXAGON: 6 };
        if (d > 0.55 && Math.random() < 0.45) {
          const nm = pick(['TRIANGLE', 'SQUARE', 'RECTANGLE', 'HEXAGON']);
          return Q({ q: 'How many <b>sides</b> does this shape have?', vis: vShape(nm), ans: SIDES[nm], wrong: [SIDES[nm] + 1, SIDES[nm] - 1, SIDES[nm] + 2], hint: 'Touch each straight side and count.', why: `A ${nm.toLowerCase()} has <b>${SIDES[nm]}</b> sides.` });
        }
        const pool = d < 0.4 ? easy : all, nm = pick(pool);
        // never offer a near-twin as a wrong answer (a square IS a kind of rectangle)
        const twin = { CIRCLE: 'OVAL', OVAL: 'CIRCLE', SQUARE: 'RECTANGLE', RECTANGLE: 'SQUARE' };
        const wrong = shuffle(pool.filter((x) => x !== nm && x !== twin[nm])).slice(0, 3);
        const tips = { CIRCLE: 'round with no corners', OVAL: 'round and stretched, like an egg', TRIANGLE: '3 sides and 3 corners', SQUARE: '4 sides, all the same length', RECTANGLE: '4 sides: 2 long and 2 short', HEXAGON: '6 sides' };
        return Q({ q: 'What shape is this?', vis: vShape(nm), ans: nm, wrong, small: true, hint: 'Count the sides and corners. Is it round?', why: `It is a <b>${nm}</b>: ${tips[nm]}.` });
      },
    },
    {
      id: 'gk-add', name: 'Adding Fun', icon: '\u2795',
      lesson: [
        { t: '<b>Adding</b> puts groups together. 2 ducks and 1 more duck. Count them all: <b>3</b> ducks!', v: vKAdd(2, 1, 'duck') },
        { t: 'We write it like this: <b>2 + 1 = 3</b>. The + sign means "and". The = sign means "makes".', v: big('2 + 1 = 3') },
        { t: '3 apples and 2 apples: count them all, 1, 2, 3, 4, 5. <b>3 + 2 = 5</b>.', v: vKAdd(3, 2, 'apple') },
      ],
      gen(d) {
        const kind = pick(KINDS), s = R(2, d < 0.4 ? 5 : 10), a = R(1, s - 1), b = s - a;
        return Q({ q: d < 0.3 ? `${a} and ${b} more. How many in all?` : `${a} + ${b} = ${BL}`, vis: d < 0.8 ? vKAdd(a, b, kind) : '', ans: s, wrong: [s + 1, s - 1, s + 2], min: 1, hint: `Count all of them. Or start at ${Math.max(a, b)} and count on ${Math.min(a, b)} more.`, why: `${a} and ${b} make <b>${s}</b>. ${a} + ${b} = ${s}.` });
      },
    },
    {
      id: 'gk-take', name: 'Taking Away', icon: '\u2796',
      lesson: [
        { t: 'There were 4 fish. 1 swam away! Now there are <b>3</b> fish.', v: vKTake(4, 1, 'fish') },
        { t: 'We write it: <b>4 \u2212 1 = 3</b>. The \u2212 sign means "take away".', v: big('4 \u2212 1 = 3') },
        { t: '5 stars, take away 2. Count the ones that are left: 1, 2, 3. <b>5 \u2212 2 = 3</b>.', v: vKTake(5, 2, 'star') },
      ],
      gen(d) {
        const kind = pick(KINDS), a = R(2, d < 0.4 ? 5 : 10), b = R(1, a - 1), r = a - b;
        return Q({ q: d < 0.3 ? `${a} ${KNAME[kind].toLowerCase()}, take away ${b}. How many are left?` : `${a} \u2212 ${b} = ${BL}`, vis: d < 0.8 ? vKTake(a, b, kind) : '', ans: r, wrong: [r + 1, r - 1, a + b], hint: 'Count the ones that are NOT crossed out.', why: `${a} take away ${b} leaves <b>${r}</b>. ${a} \u2212 ${b} = ${r}.` });
      },
    },
  ];

  // ======================================================================
  //   GRADE 1
  // ======================================================================
  const G1 = [
    {
      id: 'g1-tens', name: 'Tens and Ones', icon: '\u{1F9F1}',
      lesson: [
        { t: 'Numbers bigger than 9 are made of <b>TENS</b> and <b>ONES</b>. A ten is a stick of 10 little blocks!', v: vBlocks(0, 1, 0) },
        { t: 'This is <b>23</b>: 2 tens and 3 ones. Count the tens: 10, 20. Then count on the ones: 21, 22, <b>23</b>!', v: vBlocks(0, 2, 3) },
        { t: 'The first digit tells the <b>tens</b>. The second digit tells the <b>ones</b>. 4 tens and 7 ones make <b>47</b>.', v: big('<span style="color:#2563eb">4</span><span style="color:#d97706">7</span><br><small style="font-size:.4em;color:#475569">4 TENS &nbsp; 7 ONES</small>') },
      ],
      gen(d) {
        const kind = pick(d < 0.3 ? ['show', 'show', 'tens'] : d < 0.7 ? ['show', 'tens', 'ones', 'more'] : ['show', 'more', 'less', 'next']);
        const n = R(11, d < 0.35 ? 50 : 99), t = Math.floor(n / 10), o = n % 10;
        if (kind === 'show') return Q({ q: 'What number do the blocks show?', vis: vBlocks(0, t, o), ans: n, wrong: [o * 10 + t, t + o, n + 10, n - 10, n + 1], hint: 'Count the tens sticks by 10s: 10, 20, 30... then count on the ones.', why: `${t} tens and ${o} ones make <b>${n}</b>.` });
        if (kind === 'tens') return Q({ q: `How many <b>TENS</b> are in ${n}?`, ans: t, wrong: [o, t + 1, n], hint: 'The FIRST digit tells you the tens.', why: `${n} is ${t} tens and ${o} ones, so it has <b>${t}</b> tens.` });
        if (kind === 'ones') return Q({ q: `How many <b>ONES</b> are in ${n}?`, ans: o, wrong: [t, o + 1, n], hint: 'The LAST digit tells you the ones.', why: `${n} is ${t} tens and ${o} ones, so it has <b>${o}</b> ones.` });
        if (kind === 'more') { const m = R(10, 89); return Q({ q: `What is <b>10 more</b> than ${m}?`, ans: m + 10, wrong: [m + 1, m - 10, m + 11], hint: '10 more means one more ten. Only the tens digit changes!', why: `Add one ten: ${m} + 10 = <b>${m + 10}</b>.` }); }
        if (kind === 'less') { const m = R(20, 99); return Q({ q: `What is <b>10 less</b> than ${m}?`, ans: m - 10, wrong: [m - 1, m + 10, m - 11], hint: '10 less means one less ten. Only the tens digit changes!', why: `Take away one ten: ${m} − 10 = <b>${m - 10}</b>.` }); }
        const m = R(94, 116);
        return Q({ q: `What comes next?<br>${m}, ${m + 1}, ${m + 2}, ${BL}`, ans: m + 3, wrong: [m + 4, m + 2, m + 13], hint: 'Count on by one more.', why: `${m + 2} and one more is <b>${m + 3}</b>.` });
      },
    },
    {
      id: 'g1-add', name: 'Adding to 20', icon: '➕',
      lesson: [
        { t: '<b>Adding</b> means putting groups together. 3 and 2 more make <b>5</b>. We write it 3 + 2 = 5.', v: vDots(3, 2) },
        { t: '<b>Count on</b> from the bigger number! For 8 + 3, start at 8 and hop 3 more: 9, 10, <b>11</b>.', v: vLine(0, 15, { from: 8, to: 11 }) },
        { t: '<b>Make a ten!</b> 9 + 4: the 9 takes 1 from the 4 to make 10. Then 10 + 3 = <b>13</b>.', v: vDots(9, 4) },
      ],
      gen(d) {
        const max = d < 0.35 ? 10 : d < 0.7 ? 15 : 20;
        const s = R(d < 0.35 ? 3 : 8, max), a = R(1, s - 1), b = s - a, bigN = Math.max(a, b), sm = Math.min(a, b);
        const hint = bigN >= 7 && s > 10 ? `Make a ten! ${bigN} needs ${10 - bigN} more to make 10.` : `Start at ${bigN} and count on ${sm} more.`;
        if (d > 0.6 && Math.random() < 0.35) return Q({ q: `${a} + ${BL} = ${s}`, ans: b, wrong: [s, b + 1, b - 1, a], hint: `Start at ${a} and count up to ${s}. How many hops?`, why: `${a} + ${b} = ${s}. From ${a} to ${s} is <b>${b}</b> hops.` });
        const vis = d < 0.5 && s <= 12 ? vDots(a, b) : d < 0.8 ? vLine(0, 20, { from: bigN, to: s }) : '';
        return Q({ q: `${a} + ${b} = ${BL}`, vis, ans: s, wrong: [s + 1, s - 1, Math.abs(a - b), s + 2], hint, why: `Start at ${bigN}, count on ${sm}: ${a} + ${b} = <b>${s}</b>.` });
      },
    },
    {
      id: 'g1-sub', name: 'Taking Away', icon: '➖',
      lesson: [
        { t: '<b>Subtracting</b> means taking away. 5 balls, take 2 away, and <b>3</b> are left. 5 − 2 = 3.', v: vTake(5, 2) },
        { t: '<b>Count back</b> on a number line. 12 − 3: start at 12 and hop back 3: 11, 10, <b>9</b>.', v: vLine(0, 15, { from: 12, to: 9 }) },
        { t: '<b>Think addition!</b> 13 − 5 = ? What plus 5 makes 13? 8 + 5 = 13, so 13 − 5 = <b>8</b>.', v: big('13 − 5 = <span style="color:#16a34a">8</span><br><small style="font-size:.5em;color:#475569">because 8 + 5 = 13</small>') },
      ],
      gen(d) {
        const max = d < 0.35 ? 10 : d < 0.7 ? 15 : 20;
        const a = R(d < 0.35 ? 3 : 8, max), b = R(1, a - 1), r = a - b;
        if (d > 0.6 && Math.random() < 0.35) return Q({ q: `${a} − ${BL} = ${r}`, ans: b, wrong: [a + r, b + 1, b - 1, r], hint: `Count back from ${a} to ${r}. How many hops?`, why: `${a} − ${b} = ${r}, because ${r} + ${b} = ${a}. The answer is <b>${b}</b>.` });
        const vis = d < 0.5 && a <= 15 ? vTake(a, b) : d < 0.8 ? vLine(0, 20, { from: a, to: r }) : '';
        return Q({ q: `${a} − ${b} = ${BL}`, vis, ans: r, wrong: [r + 1, r - 1, a + b, r + 2], hint: b <= 4 ? `Start at ${a} and count back ${b}.` : `Think: what plus ${b} makes ${a}?`, why: `${a} − ${b} = <b>${r}</b>, because ${r} + ${b} = ${a}.` });
      },
    },
    {
      id: 'g1-compare', name: 'Bigger or Smaller', icon: '\u{1F40A}',
      lesson: [
        { t: 'The hungry alligator always eats the <b>BIGGER</b> number! 8 &gt; 3 means <b>8 is greater than 3</b>.', v: vGator(8, 3) },
        { t: '&lt; means <b>less than</b>. 4 &lt; 9: the pointy end points to the smaller number, the open mouth to the bigger one.', v: vGator(4, 9) },
        { t: 'For big numbers, look at the <b>tens</b> first. 42 &gt; 38, because 4 tens is more than 3 tens. Same amount? Use = .', v: vGator(42, 38) },
      ],
      gen(d) {
        if (d > 0.5 && Math.random() < 0.35) {
          const most = Math.random() < 0.5, ns = new Set();
          while (ns.size < 4) ns.add(R(10, 99));
          const arr = [...ns], ans = most ? Math.max(...arr) : Math.min(...arr);
          return Q({ q: `Which number is the <b>${most ? 'BIGGEST' : 'SMALLEST'}</b>?`, ans: String(ans), wrong: arr.filter((v) => v !== ans).map(String), hint: 'Look at the tens digits first.', why: `<b>${ans}</b> has the ${most ? 'most' : 'fewest'} tens.` });
        }
        const max = d < 0.4 ? 20 : 99;
        let a = R(1, max), b = Math.random() < 0.15 ? a : R(1, max);
        if (d >= 0.4 && Math.random() < 0.4) { b = Math.floor(a / 10) * 10 + R(0, 9); }
        const sym = a > b ? '&gt;' : a < b ? '&lt;' : '=';
        const why = a === b ? `They are the same, so ${a} <b>=</b> ${b}.` : a > b ? `${a} is bigger, so the mouth opens to ${a}: ${a} <b>&gt;</b> ${b}.` : `${b} is bigger, so the mouth opens to ${b}: ${a} <b>&lt;</b> ${b}.`;
        return Q({ q: `${a} ${BL} ${b}`, vis: d < 0.3 ? vGator(a, b, false) : '', ans: sym, wrong: ['&gt;', '&lt;', '='], count: 3, fixed: true, hint: 'The open mouth eats the BIGGER number.', why });
      },
    },
    {
      id: 'g1-time', name: 'Telling Time', icon: '\u{1F552}',
      lesson: [
        { t: 'A clock has a short <b>HOUR</b> hand (blue) and a long <b>MINUTE</b> hand (red).', v: vClock(3, 0) },
        { t: 'When the long hand points straight up to 12, it is <b>o’clock</b>. The short hand points to 3, so it is <b>3:00</b>.', v: vClock(3, 0) },
        { t: 'When the long hand points down to 6, it is <b>half past</b>. The short hand is halfway past 7: <b>7:30</b>.', v: vClock(7, 30) },
      ],
      gen(d) {
        const h = R(1, 12), m = d < 0.45 ? 0 : pick([0, 30, 30]);
        const ans = time(h, m);
        const why = m === 0 ? `The long hand points to 12, so it is o’clock. The short hand points to ${h}: <b>${ans}</b>.` : `The long hand points to 6: half past. The short hand is just past ${h}: <b>${ans}</b>.`;
        return Q({ q: 'What time is it?', vis: vClock(h, m), ans, wrong: [time(h, 30 - m), time(h + 1, m), time(h - 1, m), time(h + 1, 30 - m)], hint: 'The SHORT hand tells the hour. The LONG hand: up at 12 is :00, down at 6 is :30.', why });
      },
    },
  ];

  // ======================================================================
  //   GRADE 2
  // ======================================================================
  const G2 = [
    {
      id: 'g2-hundreds', name: 'Hundreds', icon: '\u{1F4AF}',
      lesson: [
        { t: 'Ten tens make a <b>HUNDRED</b>! This flat has 100 little blocks.', v: vBlocks(1, 0, 0) },
        { t: '<b>245</b> is 2 hundreds, 4 tens and 5 ones. 200 + 40 + 5 = 245.', v: vBlocks(2, 4, 5) },
        { t: 'A <b>0</b> holds a place. <b>306</b> has 3 hundreds, NO tens, and 6 ones.', v: vBlocks(3, 0, 6) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['show', 'show', 'expand'] : d < 0.7 ? ['show', 'value', 'expand', 'build'] : ['value', 'build', 'more', 'expand']);
        const h = R(1, d < 0.35 ? 3 : 9), t = R(0, 9), o = R(0, 9), n = h * 100 + t * 10 + o;
        if (kind === 'show') { const hh = Math.min(h, 4), nn = hh * 100 + t * 10 + o; return Q({ q: 'What number do the blocks show?', vis: vBlocks(hh, t, o), ans: nn, wrong: [hh * 100 + o * 10 + t, hh + t + o, nn + 100, nn + 10], hint: 'Flats are 100, sticks are 10, little cubes are 1.', why: `${hh} hundreds, ${t} tens and ${o} ones make <b>${nn}</b>.` }); }
        if (kind === 'expand') return Q({ q: `${h * 100} + ${t * 10} + ${o} = ${BL}`, ans: n, wrong: [h * 100 + o * 10 + t, h + t + o, n + 100], hint: 'Put the hundreds, tens and ones digits in their places.', why: `${h} hundreds, ${t} tens, ${o} ones: <b>${n}</b>.` });
        if (kind === 'build') return Q({ q: `Which number has <b>${h}</b> hundreds, <b>${t}</b> tens and <b>${o}</b> ones?`, ans: n, wrong: [o * 100 + t * 10 + h, h * 100 + o * 10 + t, h * 10 + t + o], hint: 'Hundreds first, then tens, then ones.', why: `Hundreds ${h}, tens ${t}, ones ${o}: <b>${n}</b>.` });
        if (kind === 'more') { const add = pick([10, 100]); const m = R(100, 880); return Q({ q: `What is <b>${add} more</b> than ${m}?`, ans: m + add, wrong: [m + (add === 10 ? 100 : 10), m + 1, m - add], hint: `${add} more changes only the ${add === 10 ? 'tens' : 'hundreds'} digit.`, why: `${m} + ${add} = <b>${m + add}</b>.` }); }
        // value of a digit: use a number with three different, non-zero digits
        const ds = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]).slice(0, 3), num = ds[0] * 100 + ds[1] * 10 + ds[2];
        const p = R(0, 2), dig = ds[p], val = dig * [100, 10, 1][p];
        return Q({ q: `What is the value of the <b>${dig}</b> in ${num}?`, ans: val, wrong: [dig, dig * 10, dig * 100].filter((v) => v !== val).concat([num]), hint: 'Is it in the hundreds, tens or ones place?', why: `The ${dig} is in the ${['hundreds', 'tens', 'ones'][p]} place, so it is worth <b>${val}</b>.` });
      },
    },
    {
      id: 'g2-add', name: 'Two-Digit Adding', icon: '\u{1F522}',
      lesson: [
        { t: 'Add the <b>ONES</b> first, then the <b>TENS</b>. 23 + 14: 3 + 4 = 7 ones, 2 + 1 = 3 tens. <b>37</b>!', v: vColumn(23, 14, '+', { ans: 37 }) },
        { t: 'If the ones make 10 or more, <b>trade 10 ones for a ten</b>! 27 + 15: 7 + 5 = 12. Write the 2, carry the 1 ten.', v: vColumn(27, 15, '+', { carry: 1 }) },
        { t: 'Now add the tens, with the carried ten: 1 + 2 + 1 = 4 tens. So 27 + 15 = <b>42</b>.', v: vColumn(27, 15, '+', { carry: 1, ans: 42 }) },
      ],
      gen(d) {
        let a, b;
        if (d < 0.35) { do { a = R(11, 78); b = R(11, 89 - a); } while ((a % 10) + (b % 10) >= 10 || b < 10); }
        else if (d < 0.75) { do { a = R(15, 79); b = R(12, 98 - a); } while ((a % 10) + (b % 10) < 10 || b < 10); }
        else { do { a = R(120, 780); b = R(15, 98); } while ((a % 10) + (b % 10) < 10); }
        const s = a + b, carry = (a % 10) + (b % 10) >= 10;
        return Q({ q: `${a} + ${b} = ${BL}`, vis: d < 0.85 ? vColumn(a, b, '+') : '', ans: s, wrong: carry ? [s - 10, s + 10, s + 1] : [s + 10, s - 1, s + 1], hint: `Add the ones first: ${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}.${carry ? ' That makes a new ten to carry!' : ''}`, why: `Ones: ${a % 10} + ${b % 10} = ${(a % 10) + (b % 10)}${carry ? ' (carry the ten)' : ''}. Then the tens. ${a} + ${b} = <b>${s}</b>.` });
      },
    },
    {
      id: 'g2-sub', name: 'Two-Digit Subtracting', icon: '\u{1F53B}',
      lesson: [
        { t: 'Subtract the <b>ONES</b> first, then the <b>TENS</b>. 48 − 23: 8 − 3 = 5, 4 − 2 = 2. <b>25</b>!', v: vColumn(48, 23, '−', { ans: 25 }) },
        { t: 'Not enough ones? <b>Borrow a ten!</b> 52 − 17: you can’t take 7 from 2, so trade a ten for 10 ones: 12 − 7 = 5.', v: vColumn(52, 17, '−', { carry: '4 12', carryShift: -8 }) },
        { t: 'Now the tens: 4 − 1 = 3. So 52 − 17 = <b>35</b>. Check it: 35 + 17 = 52!', v: vColumn(52, 17, '−', { ans: 35 }) },
      ],
      gen(d) {
        let a, b;
        if (d < 0.35) { do { a = R(25, 99); b = R(11, a - 10); } while (a % 10 < b % 10); }
        else if (d < 0.75) { do { a = R(30, 99); b = R(11, a - 5); } while (a % 10 >= b % 10); }
        else { a = R(200, 900); b = R(15, 99); if (a % 10 >= b % 10) a = a - (a % 10) + R(0, Math.max(0, (b % 10) - 1)); }
        const r = a - b, borrow = a % 10 < b % 10;
        const flip = Math.floor(a / 10) * 10 - Math.floor(b / 10) * 10 + Math.abs((a % 10) - (b % 10));
        return Q({ q: `${a} − ${b} = ${BL}`, vis: d < 0.85 ? vColumn(a, b, '−') : '', ans: r, wrong: borrow ? [flip, r + 10, r - 1] : [r + 10, r - 10, r + 1], hint: borrow ? `${a % 10} is less than ${b % 10}, so borrow a ten first!` : 'Subtract the ones, then the tens.', why: `${a} − ${b} = <b>${r}</b>. Check: ${r} + ${b} = ${a}.` });
      },
    },
    {
      id: 'g2-coins', name: 'Counting Coins', icon: '\u{1FA99}',
      lesson: [
        { t: 'A <b>penny</b> is 1¢, a <b>nickel</b> is 5¢, a <b>dime</b> is 10¢ and a <b>quarter</b> is 25¢.', v: vCoins(['P', 'N', 'D', 'Q'], true) },
        { t: 'Count the <b>biggest coins first</b>, then count on: 25, 35, 45, 50, <b>51¢</b>.', v: vCoins(['Q', 'D', 'D', 'N', 'P']) },
        { t: '100¢ is <b>one dollar</b>. Four quarters make a dollar: 25, 50, 75, <b>100</b>!', v: vCoins(['Q', 'Q', 'Q', 'Q']) },
      ],
      gen(d) {
        const kinds = d < 0.35 ? ['D', 'N', 'P'] : ['Q', 'D', 'N', 'P'];
        const n = d < 0.35 ? R(2, 4) : d < 0.7 ? R(3, 5) : R(4, 7);
        const list = []; for (let i = 0; i < n; i++) list.push(pick(kinds));
        list.sort((x, y) => COIN[y].v - COIN[x].v);
        let run = 0; const steps = list.map((c) => (run += COIN[c].v));
        const sum = run;
        if (d > 0.75 && sum < 100 && Math.random() < 0.4) return Q({ q: 'How many more cents to make <b>$1</b> (100¢)?', vis: vCoins(list), ans: 100 - sum, unit: '¢', wrong: [sum, 100 - sum + 5, 100 - sum - 10], hint: `First count the coins, then count up to 100.`, why: `The coins make ${sum}¢. ${sum} + ${100 - sum} = 100, so you need <b>${100 - sum}¢</b>.` });
        return Q({ q: 'How much money is this?', vis: vCoins(list), ans: sum, unit: '¢', wrong: [n, sum + 5, sum - 5, sum + 10], hint: 'Start with the biggest coins: quarters by 25, dimes by 10, nickels by 5, pennies by 1.', why: `Count on: ${steps.join(', ')}. That is <b>${sum}¢</b>.` });
      },
    },
    {
      id: 'g2-groups', name: 'Equal Groups', icon: '\u{1F36A}',
      lesson: [
        { t: '<b>Equal groups</b> have the same number in each. Here are 3 groups of 4 cookies.', v: vGroups(3, 4) },
        { t: 'Count them by <b>skip counting</b>: 4, 8, 12. So 3 groups of 4 is <b>12</b>!', v: vGroups(3, 4) },
        { t: 'An <b>ARRAY</b> puts things in neat rows. 2 rows of 5: 5, 10. That’s <b>10</b>!', v: vArray(2, 5) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['groups', 'array'] : ['groups', 'array', 'skip']);
        if (kind === 'skip') {
          const st = pick(d < 0.7 ? [2, 5, 10] : [3, 4, 5, 10]), s0 = st * R(1, 4);
          return Q({ q: `Skip count by ${st}s:<br>${s0}, ${s0 + st}, ${s0 + 2 * st}, ${BL}`, ans: s0 + 3 * st, wrong: [s0 + 2 * st + 1, s0 + 4 * st, s0 + 3 * st + 1], hint: `Add ${st} each time.`, why: `${s0 + 2 * st} + ${st} = <b>${s0 + 3 * st}</b>.` });
        }
        const g = R(2, d < 0.5 ? 4 : 5), n = R(2, d < 0.5 ? 5 : 6), tot = g * n;
        const seq = Array.from({ length: g }, (_, i) => n * (i + 1)).join(', ');
        if (kind === 'array') return Q({ q: `${g} rows of ${n}. How many in all?`, vis: vArray(g, n), ans: tot, wrong: [g + n, tot + n, tot - n], hint: `Skip count by ${n}, one row at a time.`, why: `${seq}: <b>${tot}</b> in all.` });
        return Q({ q: `${g} groups of ${n}. How many in all?`, vis: vGroups(g, n), ans: tot, wrong: [g + n, tot + n, tot - n], hint: `Skip count by ${n} for each group.`, why: `${seq}: <b>${tot}</b> in all.` });
      },
    },
  ];

  // ======================================================================
  //   GRADE 3
  // ======================================================================
  const multHint = (a, b) => {
    if (a === 2 || b === 2) return 'Times 2 is doubling!';
    if (a === 10 || b === 10) return 'Times 10: put a 0 on the end!';
    if (a === 5 || b === 5) return 'Count by 5s!';
    if (a === 9 || b === 9) return 'Nines trick: the digits of the answer add up to 9!';
    return `Skip count by ${b}, ${a} times.`;
  };
  const G3 = [
    {
      id: 'g3-mult', name: 'Times Tables', icon: '✖️',
      lesson: [
        { t: '<b>Multiplying</b> is a fast way to add equal groups. 4 × 3 means <b>4 groups of 3</b>.', v: vGroups(4, 3) },
        { t: '4 × 3 = 3 + 3 + 3 + 3 = <b>12</b>. Turn it around and 3 × 4 is 12 too!', v: vArray(3, 4) },
        { t: 'Tricks: <b>× 1</b> stays the same. <b>× 2</b> doubles. <b>× 10</b> adds a 0. <b>× 5</b> ends in 0 or 5.', v: big('6 × 2 = 12<br>7 × 10 = 70<br>3 × 5 = 15') },
      ],
      gen(d) {
        const top = d < 0.35 ? 5 : d < 0.7 ? 9 : 10;
        const a = R(2, top), b = R(d < 0.35 ? 1 : 2, d < 0.35 ? 5 : 10), p = a * b;
        if (d > 0.55 && Math.random() < 0.35) return Q({ q: `${a} × ${BL} = ${p}`, ans: b, wrong: [b + 1, b - 1, p - a], min: 1, hint: `Skip count by ${a} until you reach ${p}.`, why: `${a} × ${b} = ${p}, so the answer is <b>${b}</b>.` });
        return Q({ q: `${a} × ${b} = ${BL}`, vis: d < 0.4 && p <= 30 ? vArray(a, b) : '', ans: p, wrong: [a * (b + 1), a * (b - 1), a + b, (a + 1) * b], hint: multHint(a, b), why: `${a} × ${b} = <b>${p}</b>${a <= 5 ? ' (' + Array(a).fill(b).join(' + ') + ')' : ''}.` });
      },
    },
    {
      id: 'g3-div', name: 'Sharing Equally', icon: '➗',
      lesson: [
        { t: '<b>Division</b> means sharing equally. 12 cookies shared by 3 friends: each friend gets <b>4</b>.', v: vGroups(3, 4) },
        { t: 'Division is multiplying backwards. 12 ÷ 3 = 4 <b>because 3 × 4 = 12</b>.', v: big('12 ÷ 3 = 4<br><small style="font-size:.5em;color:#475569">because 3 × 4 = 12</small>') },
        { t: 'A <b>fact family</b>: 3 × 4 = 12, 4 × 3 = 12, 12 ÷ 3 = 4, 12 ÷ 4 = 3.', v: vArray(3, 4) },
      ],
      gen(d) {
        const dv = R(2, d < 0.35 ? 5 : 9), qt = R(1, d < 0.35 ? 5 : 10), n = dv * qt;
        const wrong = [qt + 1, qt - 1, n - dv, dv];
        const why = `${dv} × ${qt} = ${n}, so ${n} ÷ ${dv} = <b>${qt}</b>.`;
        if (d > 0.5 && Math.random() < 0.5) {
          const q = pick([
            `${n} cookies are shared by ${dv} friends. How many does each friend get?`,
            `${n} stickers go in ${dv} equal rows. How many are in each row?`,
            `${n} kids make teams of ${dv}. How many teams are there?`,
          ]);
          return Q({ q, ans: qt, wrong, min: 1, hint: `Think: ${dv} × what = ${n}?`, why });
        }
        return Q({ q: `${n} ÷ ${dv} = ${BL}`, vis: d < 0.35 ? vGroups(dv, qt) : '', ans: qt, wrong, min: 1, hint: `Think: ${dv} × what = ${n}?`, why });
      },
    },
    {
      id: 'g3-frac', name: 'Fractions', icon: '\u{1F355}',
      lesson: [
        { t: 'A <b>fraction</b> is part of a whole cut into <b>EQUAL</b> parts. This pizza has 4 equal slices.', v: vPie(1, 4) },
        { t: `The bottom number says how many parts in all. The top says how many we have. ${F(3, 4)} = <b>3 of 4</b> parts.`, v: vPie(3, 4) },
        { t: `More parts means <b>smaller</b> pieces! ${F(1, 8)} is smaller than ${F(1, 2)}.`, v: vBars([[1, 2], [1, 4], [1, 8]]) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['shade', 'shade'] : d < 0.7 ? ['shade', 'compare', 'line'] : ['compare', 'line', 'shade']);
        if (kind === 'compare') {
          const same = Math.random() < 0.5;
          let a, b, c;
          if (same) { const den = pick([4, 5, 6, 8]); a = R(1, den - 1); do { b = R(1, den - 1); } while (b === a); c = [[a, den], [b, den]]; }
          else { const dd = shuffle([2, 3, 4, 6, 8]).slice(0, 2); c = [[1, dd[0]], [1, dd[1]]]; }
          const bigger = c[0][0] / c[0][1] > c[1][0] / c[1][1] ? c[0] : c[1];
          const choices = c.map((f) => F(f[0], f[1]));
          return Q({ q: 'Which fraction is <b>BIGGER</b>?', vis: d < 0.6 ? vBars(c, false, ['#f472b6', '#60a5fa']) : '', ans: F(bigger[0], bigger[1]), wrong: choices, count: 2, hint: same ? 'Same size parts? More parts is more!' : 'Same top number? The SMALLER bottom number means BIGGER pieces.', why: same ? `The parts are the same size, and ${bigger[0]} parts is more. <b>${F(bigger[0], bigger[1])}</b> is bigger.` : `Fewer parts means bigger pieces, so <b>${F(bigger[0], bigger[1])}</b> is bigger.` });
        }
        const den = pick(d < 0.4 ? [2, 3, 4] : [3, 4, 5, 6, 8]), n = R(1, den - 1);
        if (kind === 'line') return FQ({ q: 'What fraction is at the dot?', vis: vFracLine(n, den), ans: [n, den], wrong: [[n, den + 1], [den - n, den], [n + 1, den]], hint: 'Count the jumps from 0 to the dot, and how many jumps make 1 whole.', why: `The line from 0 to 1 is cut into ${den} parts and the dot is ${n} parts along: <b>${F(n, den)}</b>.` });
        return FQ({ q: 'What fraction is shaded?', vis: Math.random() < 0.5 ? vPie(n, den) : vBars([[n, den]], false), ans: [n, den], wrong: [[den - n, den], [n, den + 1], [n, den - n]], hint: 'Bottom: how many parts in all? Top: how many are shaded?', why: `${n} of the ${den} equal parts are shaded: <b>${F(n, den)}</b>.` });
      },
    },
    {
      id: 'g3-area', name: 'Area and Perimeter', icon: '\u{1F7E9}',
      lesson: [
        { t: '<b>Area</b> is how many squares cover a shape. Count them: this one is 12 squares.', v: vGrid(4, 3) },
        { t: 'Shortcut: <b>Area = length × width</b>. 3 rows of 4 squares: 4 × 3 = <b>12</b> square units.', v: vGrid(4, 3) },
        { t: '<b>Perimeter</b> is the distance AROUND. Add all the sides: 4 + 3 + 4 + 3 = <b>14</b>.', v: vGrid(4, 3, { perim: true, grid: false }) },
      ],
      gen(d) {
        const w = R(2, d < 0.5 ? 6 : 9), h = R(2, d < 0.5 ? 5 : 8);
        if (d > 0.6 && Math.random() < 0.45) return Q({ q: 'What is the <b>perimeter</b> (all the way around)?', vis: vGrid(w, h, { perim: true, grid: false }), ans: 2 * (w + h), wrong: [w * h, w + h, 2 * (w + h) + 2], hint: 'Add all FOUR sides, not just two.', why: `${w} + ${h} + ${w} + ${h} = <b>${2 * (w + h)}</b>.` });
        return Q({ q: 'What is the <b>area</b>?', vis: vGrid(w, h, { grid: d < 0.55 }), ans: w * h, wrong: [2 * (w + h), w + h, w * h + w], hint: 'Rows times columns: length × width.', why: `${h} rows of ${w} squares: ${w} × ${h} = <b>${w * h}</b> square units.` });
      },
    },
    {
      id: 'g3-round', name: 'Rounding', icon: '\u{1F3AF}',
      lesson: [
        { t: '<b>Rounding</b> finds the nearest ten. Is 47 closer to 40 or to 50? It’s closer to <b>50</b>!', v: vLine(40, 50, { mark: 47, label: '47' }) },
        { t: 'Look at the <b>ones digit</b>: 5 or more rounds <b>UP</b>, 4 or less rounds <b>DOWN</b>. 47 → 50, 43 → 40.', v: big('47 → 50<br>43 → 40') },
        { t: 'To the nearest <b>hundred</b>, look at the <b>tens</b> digit. 362: 6 tens rounds up, so <b>400</b>.', v: vLine(300, 400, { mark: 362, label: '362', every: 50 }) },
      ],
      gen(d) {
        if (d < 0.55) {
          let n; do { n = R(11, 99); } while (n % 10 === 0);
          const lo = Math.floor(n / 10) * 10, ans = n % 10 >= 5 ? lo + 10 : lo;
          return Q({ q: `Round <b>${n}</b> to the nearest ten.`, vis: d < 0.35 ? vLine(lo, lo + 10, { mark: n, label: n }) : '', ans, wrong: [ans === lo ? lo + 10 : lo, n, n + 1], hint: `Look at the ones digit, ${n % 10}. 5 or more rounds up.`, why: `${n % 10} is ${n % 10 >= 5 ? '5 or more, so round UP' : '4 or less, so round DOWN'}: <b>${ans}</b>.` });
        }
        let n; do { n = R(101, 989); } while (n % 100 === 0 || Math.floor((n % 100) / 10) === 4 && Math.random() < 0.3);
        const lo = Math.floor(n / 100) * 100, tens = Math.floor((n % 100) / 10), ans = tens >= 5 ? lo + 100 : lo;
        return Q({ q: `Round <b>${n}</b> to the nearest hundred.`, vis: d < 0.75 ? vLine(lo, lo + 100, { mark: n, label: n, every: 50 }) : '', ans, wrong: [ans === lo ? lo + 100 : lo, Math.round(n / 10) * 10, n], hint: `Look at the tens digit, ${tens}. 5 or more rounds up.`, why: `The tens digit is ${tens}, so round ${tens >= 5 ? 'UP' : 'DOWN'}: <b>${ans}</b>.` });
      },
    },
  ];

  // ======================================================================
  //   GRADE 4
  // ======================================================================
  const G4 = [
    {
      id: 'g4-mult', name: 'Big Multiplying', icon: '\u{1F3D7}️',
      lesson: [
        { t: 'Split the big number into <b>tens and ones</b>. 23 × 4 is 20 × 4 plus 3 × 4.', v: vArea(23, 4) },
        { t: '20 × 4 = 80 and 3 × 4 = 12. Add the parts: 80 + 12 = <b>92</b>.', v: vArea(23, 4, { show: true }) },
        { t: 'Two big numbers? Split both! 12 × 13 = 100 + 20 + 30 + 6 = <b>156</b>.', v: vArea(12, 13, { show: true }) },
      ],
      gen(d) {
        let a, b;
        if (d < 0.35) { a = R(11, 49); b = R(2, 5); } else if (d < 0.7) { a = Math.random() < 0.5 ? R(21, 99) : R(101, 299); b = R(3, 9); } else { a = R(11, 35); b = R(11, 25); }
        const p = a * b;
        let wrong;
        if (b < 10) { const t = a - (a % 10), o = a % 10; wrong = [t * b + ((o * b) % 10), t * b + o, p + 10, p - b]; }
        else { const bt = b - (b % 10), bo = b % 10; wrong = [a * bo + a * (bt / 10), a * bt, p + 10, p - a]; }
        const parts = (b < 10 ? [[a - (a % 10), b], [a % 10, b]] : [[a, b - (b % 10)], [a, b % 10]]).filter((x) => x[0] && x[1]);
        return Q({ q: `${fmt(a)} × ${b} = ${BL}`, vis: d < 0.6 ? vArea(a, b) : '', ans: p, wrong, hint: 'Split into tens and ones, multiply each part, then add.', why: parts.map((x) => `${fmt(x[0])} × ${x[1]} = ${fmt(x[0] * x[1])}`).join(', ') + `. Add them: <b>${fmt(p)}</b>.` });
      },
    },
    {
      id: 'g4-rem', name: 'Remainders', icon: '\u{1F381}',
      lesson: [
        { t: 'Sometimes things don’t share evenly. 14 ÷ 4: each gets 3, and <b>2 are left over</b>.', v: vGroups(4, 3, 2) },
        { t: 'The leftover is the <b>REMAINDER</b>. We write 14 ÷ 4 = <b>3 R2</b>. The remainder is always smaller than the number you share by.', v: big('14 ÷ 4 = 3 R2') },
        { t: 'Big numbers: 84 ÷ 4. Share the tens: 8 ÷ 4 = 2 tens. Then the ones: 4 ÷ 4 = 1. So <b>21</b>!', v: big('84 ÷ 4 = 21') },
      ],
      gen(d) {
        if (d >= 0.35 && d < 0.7) {
          const dv = R(2, 6), qt = R(11, 30), n = dv * qt;
          return Q({ q: `${n} ÷ ${dv} = ${BL}`, ans: qt, wrong: [qt + 1, qt - 1, qt + 10], min: 1, hint: `Share the tens first, then the ones. Check with ${dv} × your answer.`, why: `${dv} × ${qt} = ${n}, so ${n} ÷ ${dv} = <b>${qt}</b>.` });
        }
        const dv = d < 0.35 ? R(2, 5) : R(3, 9), qt = d < 0.35 ? R(2, 5) : R(12, 60), r = R(1, dv - 1), n = dv * qt + r;
        const S = (q, rr) => (rr ? `${q} R${rr}` : String(q));
        return Q({ q: `${n} ÷ ${dv} = ${BL}`, vis: d < 0.35 ? vGroups(dv, qt, r) : '', ans: S(qt, r), wrong: [S(qt, r + 1 < dv ? r + 1 : r - 1), S(qt + 1, r), S(qt - 1, r + dv), S(qt, 0)], small: true, hint: `How many ${dv}s fit in ${n}? What is left over?`, why: `${dv} × ${qt} = ${dv * qt}, and ${n} − ${dv * qt} = ${r} left over. So <b>${qt} R${r}</b>.` });
      },
    },
    {
      id: 'g4-equiv', name: 'Equal Fractions', icon: '⚖️',
      lesson: [
        { t: `Different fractions can be the <b>same amount</b>! ${F(1, 2)} = ${F(2, 4)} = ${F(4, 8)}.`, v: vBars([[1, 2], [2, 4], [4, 8]]) },
        { t: `Multiply the top <b>AND</b> the bottom by the same number. ${F(2, 3)}: ×2 on both gives ${F(4, 6)}.`, v: vBars([[2, 3], [4, 6]]) },
        { t: `To compare, make the bottoms the same. ${F(3, 4)} vs ${F(5, 8)}: ${F(3, 4)} = ${F(6, 8)}, so <b>${F(3, 4)} is bigger</b>.`, v: vBars([[6, 8], [5, 8]]) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['missing', 'which'] : d < 0.7 ? ['missing', 'which', 'simplify'] : ['simplify', 'compare', 'which']);
        const den = R(2, 6), n = R(1, den - 1), k = R(2, 4);
        if (kind === 'missing') return Q({ q: `${F(n, den)} = ${F('?', den * k)}`, ans: n * k, wrong: [n + k, n * k + 1, den * k - n * k], min: 1, hint: `The bottom was multiplied by ${k}. Do the same to the top!`, why: `${den} × ${k} = ${den * k}, so ${n} × ${k} = <b>${n * k}</b>.` });
        if (kind === 'which') return FQ({ q: `Which fraction equals ${F(n, den)}?`, vis: d < 0.4 ? vBars([[n, den]], false) : '', ans: [n * k, den * k], wrong: [[n + k, den + k], [n * k, den], [n, den * k], [n + 1, den * k]], hint: 'Multiply the top and the bottom by the SAME number.', why: `${F(n, den)} × ${k}/${k} = <b>${F(n * k, den * k)}</b>.` });
        if (kind === 'simplify') { const g = gcd(n, den), sn = n / g, sd = den / g; return FQ({ q: `Simplify ${F(sn * k, sd * k)}`, ans: [sn, sd], wrong: [[sn * k - 1, sd * k - 1], [sn, sd * k], [sn + 1, sd], [sn * k, sd]], hint: `What number goes into both ${sn * k} and ${sd * k}?`, why: `Divide the top and bottom by ${k}: <b>${F(sn, sd)}</b>.` }); }
        // compare with different bottoms (one a multiple of the other)
        const d1 = pick([2, 3, 4, 5]), m = R(2, 3), d2 = d1 * m;
        let a = R(1, d1 - 1), b; do { b = R(1, d2 - 1); } while (b === a * m);
        const A = F(a, d1), B = F(b, d2), bigger = a * m > b ? A : B;
        return Q({ q: 'Which fraction is <b>BIGGER</b>?', ans: bigger, wrong: [A, B], count: 2, hint: `Make the bottoms the same: change ${A} into ${d2}ths.`, why: `${A} = ${F(a * m, d2)}, and ${a * m > b ? `${a * m} > ${b}` : `${b} > ${a * m}`}, so <b>${bigger}</b> is bigger.` });
      },
    },
    {
      id: 'g4-dec', name: 'Decimals', icon: '\u{1F539}',
      lesson: [
        { t: `A <b>decimal</b> is another way to write tenths. ${F(3, 10)} = <b>0.3</b>. Three of ten columns are filled.`, v: vHundred(30) },
        { t: `Two places after the point means <b>hundredths</b>. ${F(45, 100)} = <b>0.45</b>.`, v: vHundred(45) },
        { t: 'Compare place by place, starting at the tenths. <b>0.6 &gt; 0.45</b>, because 6 tenths beats 4 tenths!', v: big('0.<span style="color:#2563eb">6</span>0<br>0.<span style="color:#2563eb">4</span>5') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['grid', 'frac'] : d < 0.7 ? ['grid', 'frac', 'compare'] : ['compare', 'add', 'frac', 'grid']);
        if (kind === 'grid') {
          const n = d < 0.35 ? R(1, 9) * 10 : R(11, 99);
          const rev = n % 10 ? (n % 10) * 10 + Math.floor(n / 10) : 0;
          return Q({ q: 'What decimal is shaded?', vis: vHundred(n), ans: dec(n), wrong: [dec(n * 10), String(n), rev ? dec(rev) : dec(100 - n), dec(n + 10)], small: true, hint: 'A whole column is one tenth (0.1). Each little square is one hundredth (0.01).', why: `${n} of the 100 squares: ${F(n, 100)} = <b>${dec(n)}</b>.` });
        }
        if (kind === 'frac') {
          const ten = Math.random() < 0.5 && d < 0.7, n = ten ? R(1, 9) : R(11, 99), den = ten ? 10 : 100, h = ten ? n * 10 : n;
          return Q({ q: `${F(n, den)} = ${BL}`, ans: dec(h), wrong: ten ? ['0.0' + n, String(n), dec(h + 10)] : [String(n / 10), '0.0' + n, dec(h + 10)], small: true, hint: ten ? 'Tenths: ONE digit after the point.' : 'Hundredths: TWO digits after the point.', why: `${F(n, den)} is ${n} ${ten ? 'tenths' : 'hundredths'}: <b>${dec(h)}</b>.` });
        }
        if (kind === 'compare') {
          const t = R(2, 9), a = t * 10, b = R(Math.max(11, (t - 1) * 10 + 1), (t - 1) * 10 + 9); // a = 0.t, b = 0.(t-1)x : looks bigger, isn't
          const A = dec(a), B = dec(b);
          return Q({ q: 'Which decimal is <b>BIGGER</b>?', ans: A, wrong: [A, B], count: 2, hint: 'Compare the tenths digit first (the first one after the point).', why: `${A} has ${t} tenths and ${B} has ${t - 1}. So <b>${A}</b> is bigger, even though ${B} has more digits.` });
        }
        const a = R(1, 8), b = R(1, 9 - a);
        return Q({ q: `${dec(a * 10)} + ${dec(b * 10)} = ${BL}`, ans: dec((a + b) * 10), wrong: ['0.0' + (a + b), String(a + b), dec(a * 10 + b)], small: true, hint: 'Add the tenths: like adding apples!', why: `${a} tenths + ${b} tenths = ${a + b} tenths = <b>${dec((a + b) * 10)}</b>.` });
      },
    },
    {
      id: 'g4-factors', name: 'Factors and Primes', icon: '\u{1F50D}',
      lesson: [
        { t: '<b>Factors</b> multiply to make a number. 3 × 4 = 12, so <b>3 and 4 are factors of 12</b>.', v: vArray(3, 4) },
        { t: 'All the factors of 12: <b>1, 2, 3, 4, 6, 12</b>. A <b>PRIME</b> number has only two factors, 1 and itself, like 7.', v: big('7 = 1 × 7<br><small style="font-size:.5em;color:#475569">7 is PRIME</small>') },
        { t: '<b>Multiples</b> are what you get when you skip count. Multiples of 4: <b>4, 8, 12, 16, 20...</b>', v: vLine(0, 20, { from: 0, to: 4 }) },
      ],
      gen(d) {
        const factorsOf = (n) => { const f = []; for (let i = 1; i <= n; i++) if (n % i === 0) f.push(i); return f; };
        const kind = pick(d < 0.4 ? ['factor', 'multiple'] : d < 0.7 ? ['factor', 'multiple', 'prime'] : ['prime', 'notfactor', 'factor']);
        if (kind === 'factor' || kind === 'notfactor') {
          const n = pick([12, 16, 18, 20, 24, 28, 30, 36, 40, 42, 45, 48]), fs = factorsOf(n);
          const yes = fs.filter((f) => f > 1 && f < n), no = []; for (let i = 2; i < n && no.length < 30; i++) if (n % i) no.push(i);
          if (kind === 'factor') { const a = pick(yes); return Q({ q: `Which number is a <b>factor</b> of ${n}?`, ans: String(a), wrong: shuffle(no.slice(0, 10)).slice(0, 3).map(String), hint: `Which one goes into ${n} with nothing left over?`, why: `${a} × ${n / a} = ${n}. The factors of ${n} are ${fs.join(', ')}: <b>${a}</b> is one.` }); }
          const a = pick(no.slice(0, 12)); return Q({ q: `Which number is <b>NOT</b> a factor of ${n}?`, ans: String(a), wrong: shuffle(yes).slice(0, 3).map(String), hint: 'Try dividing: which one leaves a remainder?', why: `The factors of ${n} are ${fs.join(', ')}. <b>${a}</b> is not one of them.` });
        }
        if (kind === 'multiple') {
          const k = R(3, 9), a = k * R(2, 9), no = []; for (let i = a - 8; i <= a + 8; i++) if (i > 0 && i % k) no.push(i);
          return Q({ q: `Which number is a <b>multiple</b> of ${k}?`, ans: String(a), wrong: shuffle(no).slice(0, 3).map(String), hint: `Skip count by ${k}s. Which number do you land on?`, why: `${k} × ${a / k} = ${a}, so <b>${a}</b> is a multiple of ${k}.` });
        }
        const p = pick([2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37]);
        const comp = shuffle([4, 6, 8, 9, 10, 12, 14, 15, 16, 21, 25, 27, 33, 35, 39, 49]).slice(0, 3);
        return Q({ q: 'Which number is <b>PRIME</b>?', ans: String(p), wrong: comp.map(String), hint: 'A prime can only be made as 1 × itself.', why: `<b>${p}</b> has just two factors: 1 and ${p}. ` + comp.map((c) => { const f = factorsOf(c)[1]; return `${c} = ${f} × ${c / f}`; }).join(', ') + '.' });
      },
    },
  ];

  // ======================================================================
  //   GRADE 5
  // ======================================================================
  const G5 = [
    {
      id: 'g5-addfrac', name: 'Adding Fractions', icon: '\u{1F370}',
      lesson: [
        { t: `Same bottom numbers? Just add the tops! ${F(2, 5)} + ${F(1, 5)} = <b>${F(3, 5)}</b>. The bottom stays the same.`, v: vBars([[2, 5], [1, 5], [3, 5]]) },
        { t: `Different bottoms? Make them the same first. ${F(1, 2)} + ${F(1, 4)}: ${F(1, 2)} = ${F(2, 4)}, so ${F(2, 4)} + ${F(1, 4)} = <b>${F(3, 4)}</b>.`, v: vBars([[2, 4], [1, 4], [3, 4]]) },
        { t: `${F(1, 3)} + ${F(1, 4)}: 3 and 4 both fit into 12. ${F(4, 12)} + ${F(3, 12)} = <b>${F(7, 12)}</b>. Never add the bottoms!`, v: vBars([[4, 12], [3, 12], [7, 12]]) },
      ],
      gen(d) {
        let d1, d2;
        if (d < 0.35) { d1 = d2 = R(3, 10); } else if (d < 0.7) { d1 = pick([2, 3, 4, 5]); d2 = d1 * R(2, 3); } else { [d1, d2] = pick([[2, 3], [2, 5], [3, 4], [3, 5], [4, 5], [2, 7], [3, 8]]); }
        const D = d1 === d2 ? d1 : d1 * d2 / gcd(d1, d2);
        const sub = d > 0.7 && Math.random() < 0.4;
        let n1, n2, N1, N2;
        for (let tries = 0; tries < 40; tries++) {
          n1 = R(1, d1 - 1); n2 = R(1, d2 - 1); N1 = n1 * D / d1; N2 = n2 * D / d2;
          if (sub ? N1 > N2 : N1 + N2 <= D) break;
        }
        if (sub && N1 <= N2) { [n1, n2, d1, d2, N1, N2] = [n2, n1, d2, d1, N2, N1]; }
        const op = sub ? '−' : '+', top = sub ? N1 - N2 : N1 + N2;
        const wrong = [[sub ? Math.abs(n1 - n2) : n1 + n2, sub ? Math.abs(d1 - d2) || d1 : d1 + d2], [sub ? Math.abs(n1 - n2) : n1 + n2, D], [top + 1, D], [top, D * 2]];
        const conv = d1 === d2 ? '' : `${F(n1, d1)} = ${F(N1, D)} and ${F(n2, d2)} = ${F(N2, D)}. `;
        return FQ({ q: `${F(n1, d1)} ${op} ${F(n2, d2)} = ${BL}`, vis: d < 0.35 ? vBars([[n1, d1], [n2, d2]], false, ['#f472b6', '#60a5fa']) : '', ans: [top, D], wrong, hint: d1 === d2 ? `Same bottoms: ${sub ? 'subtract' : 'add'} the tops, keep the bottom.` : `Make the bottoms the same first. Both ${d1} and ${d2} fit into ${D}.`, why: `${conv}${N1} ${op} ${N2} = ${top}, so the answer is <b>${F(top, D)}</b>.` });
      },
    },
    {
      id: 'g5-multfrac', name: 'Multiplying Fractions', icon: '✳️',
      lesson: [
        { t: `To multiply fractions, multiply <b>top × top</b> and <b>bottom × bottom</b>. ${F(2, 3)} × ${F(1, 4)} = <b>${F(2, 12)}</b>.`, v: big(`${F(2, 3)} × ${F(1, 4)} = ${F(2, 12)}`) },
        { t: `${F(2, 12)} can be simplified: divide the top and bottom by 2 to get <b>${F(1, 6)}</b>.`, v: big(`${F(2, 12)} = ${F(1, 6)}`) },
        { t: `<b>"Of" means times!</b> ${F(1, 3)} of 12: split 12 into 3 equal groups, and one group is <b>4</b>.`, v: vGroups(3, 4) },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['of', 'ff'] : d < 0.7 ? ['of', 'ff', 'ofmany'] : ['ff', 'ofmany', 'whole']);
        if (kind === 'of' || kind === 'ofmany') {
          const k = R(2, 6), m = R(2, 9), j = kind === 'of' ? 1 : R(2, k - 1 || 1), tot = k * m, ans = j * m;
          return Q({ q: `${F(j, k)} of ${tot} = ${BL}`, vis: d < 0.4 ? vGroups(k, m) : '', ans, wrong: [tot - ans, ans + m, tot * j, m], hint: `Split ${tot} into ${k} equal groups${j > 1 ? `, then take ${j} of them` : ''}.`, why: `${tot} ÷ ${k} = ${m}${j > 1 ? `, and ${j} × ${m} = ${ans}` : ''}. So <b>${ans}</b>.` });
        }
        if (kind === 'whole') {
          const w = R(2, 5), den = R(3, 8), n = R(1, den - 1);
          return FQ({ q: `${w} × ${F(n, den)} = ${BL}`, ans: [w * n, den], wrong: [[n, w * den], [w + n, den], [w * n, w + den]], hint: `${w} × ${F(n, den)} means ${w} lots of ${F(n, den)}. Multiply the top by ${w}.`, why: `${w} × ${n} = ${w * n}, and the bottom stays ${den}: <b>${F(w * n, den)}</b>.` });
        }
        const a = R(1, 4), b = R(a + 1, 6), c = R(1, 4), e = R(c + 1, 6);
        return FQ({ q: `${F(a, b)} × ${F(c, e)} = ${BL}`, ans: [a * c, b * e], wrong: [[a * c, b + e], [a + c, b * e], [a * e, b * c]], hint: 'Top times top. Bottom times bottom.', why: `${a} × ${c} = ${a * c} on top, ${b} × ${e} = ${b * e} on the bottom: <b>${F(a * c, b * e)}</b>.` });
      },
    },
    {
      id: 'g5-dec', name: 'Decimal Math', icon: '\u{1F4B2}',
      lesson: [
        { t: '<b>Line up the decimal points!</b> 2.5 + 1.25: write 2.5 as 2.50, then add: <b>3.75</b>.', v: vColumn('2.50', '1.25', '+', { ans: '3.75' }) },
        { t: 'Subtract the same way: 5.0 − 1.7 = <b>3.3</b>. Fill empty places with zeros.', v: vColumn('5.0', '1.7', '−', { ans: '3.3' }) },
        { t: '<b>× 10</b> moves the point one place right: 3.45 × 10 = <b>34.5</b>. <b>× 100</b> moves it two places: 345.', v: big('3.45 × 10 = 34.5<br>3.45 × 100 = 345') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['add', 'sub'] : d < 0.7 ? ['add', 'sub', 'ten'] : ['add', 'sub', 'ten', 'div']);
        if (kind === 'ten' || kind === 'div') {
          const a = R(101, 999), by = kind === 'div' ? 10 : pick([10, 100]), h = kind === 'div' ? a / 10 : a * by;  // a is hundredths
          const ans = kind === 'div' ? dec(a / 10 * 1) : dec(h);
          const A = dec(a);
          if (kind === 'div') { const v = a / 1000; const s = String(v); return Q({ q: `${A} ÷ 10 = ${BL}`, ans: s, wrong: [dec(a * 10), dec(a), String(a / 10000)], small: true, hint: '÷ 10 moves the point one place LEFT.', why: `Move the point one place left: <b>${s}</b>.` }); }
          return Q({ q: `${A} × ${by} = ${BL}`, ans, wrong: [dec(by === 10 ? a * 100 : a * 10), dec(a) + '0', String(a / 1000)], small: true, hint: `× ${by} moves the point ${by === 10 ? 'one place' : 'two places'} RIGHT.`, why: `Move the point ${by === 10 ? 'one place' : 'two places'} right: <b>${ans}</b>.` });
        }
        // a has 1 decimal place, b has 1 or 2 (in hundredths)
        const a = R(11, 99) * 10, b = d < 0.35 ? R(11, 59) * 10 : R(105, 599);
        if (kind === 'add') {
          const s = a + b, mis = b % 10 ? a / 10 + b : s + 90;
          return Q({ q: `${dec(a)} + ${dec(b)} = ${BL}`, ans: dec(s), wrong: [dec(mis), dec(s + 10), dec(s - 100)], small: true, hint: 'Line up the decimal points. Add zeros so both have the same places.', why: `${dec(a)} + ${dec(b)} = <b>${dec(s)}</b>.` });
        }
        const big2 = Math.max(a, b), sm = Math.min(a, b), r = big2 - sm;
        return Q({ q: `${dec(big2)} − ${dec(sm)} = ${BL}`, ans: dec(r), wrong: [dec(r + 10), dec(r - 10 > 0 ? r - 10 : r + 20), dec(r + 100)], small: true, hint: 'Line up the decimal points, then subtract like whole numbers.', why: `${dec(big2)} − ${dec(sm)} = <b>${dec(r)}</b>. Check: ${dec(r)} + ${dec(sm)} = ${dec(big2)}.` });
      },
    },
    {
      id: 'g5-order', name: 'Order of Operations', icon: '\u{1F4CB}',
      lesson: [
        { t: 'With more than one step, follow the order: <b>( ) first</b>, then <b>× and ÷</b>, then <b>+ and −</b>.', v: big('( )<br>× ÷<br>+ −') },
        { t: '3 + 4 × 2: multiply first! 4 × 2 = 8, then 3 + 8 = <b>11</b>. (Not 14!)', v: big('3 + <span style="color:#2563eb">4 × 2</span><br>= 3 + 8 = 11') },
        { t: '(3 + 4) × 2: parentheses come first! 3 + 4 = 7, then 7 × 2 = <b>14</b>.', v: big('<span style="color:#2563eb">(3 + 4)</span> × 2<br>= 7 × 2 = 14') },
      ],
      gen(d) {
        const forms = d < 0.4 ? ['a+b*c', '(a+b)*c'] : d < 0.7 ? ['a+b*c', '(a+b)*c', 'a*b-c', 'a+b/c'] : ['a*b+c*d', 'a+b*c-d', '(a+b)*c', 'a-b/c'];
        const f = pick(forms);
        const a = R(2, 9), b = R(2, 9), c = R(2, 6), e = R(2, 6);
        let q, ans, lr, why;
        if (f === 'a+b*c') { q = `${a} + ${b} × ${c}`; ans = a + b * c; lr = (a + b) * c; why = `${b} × ${c} = ${b * c} first, then ${a} + ${b * c} = <b>${ans}</b>.`; }
        else if (f === '(a+b)*c') { q = `(${a} + ${b}) × ${c}`; ans = (a + b) * c; lr = a + b * c; why = `${a} + ${b} = ${a + b} first, then ${a + b} × ${c} = <b>${ans}</b>.`; }
        else if (f === 'a*b-c') { const cc = R(1, a * b - 1); q = `${a} × ${b} − ${cc}`; ans = a * b - cc; lr = b > cc ? a * (b - cc) : ans + 2; why = `${a} × ${b} = ${a * b} first, then ${a * b} − ${cc} = <b>${ans}</b>.`; }
        else if (f === 'a+b/c') { const bb = b * c; q = `${a} + ${bb} ÷ ${c}`; ans = a + b; lr = (a + bb) % c === 0 ? (a + bb) / c : a + bb; why = `${bb} ÷ ${c} = ${b} first, then ${a} + ${b} = <b>${ans}</b>.`; }
        else if (f === 'a-b/c') { const bb = b * c, aa = b + R(2, 20); q = `${aa} − ${bb} ÷ ${c}`; ans = aa - b; lr = aa > bb && (aa - bb) % c === 0 ? (aa - bb) / c : aa + b; why = `${bb} ÷ ${c} = ${b} first, then ${aa} − ${b} = <b>${ans}</b>.`; }
        else if (f === 'a*b+c*d') { q = `${a} × ${b} + ${c} × ${e}`; ans = a * b + c * e; lr = (a * b + c) * e; why = `${a} × ${b} = ${a * b} and ${c} × ${e} = ${c * e}. Then ${a * b} + ${c * e} = <b>${ans}</b>.`; }
        else { const dd = R(1, a + b * c - 1); q = `${a} + ${b} × ${c} − ${dd}`; ans = a + b * c - dd; lr = (a + b) * c - dd; why = `${b} × ${c} = ${b * c} first. Then ${a} + ${b * c} = ${a + b * c}, and ${a + b * c} − ${dd} = <b>${ans}</b>.`; }
        return Q({ q: `${q} = ${BL}`, ans, wrong: [lr, ans + 1, ans - 2, ans + 10], hint: 'Parentheses first. Then × and ÷. Then + and −.', why });
      },
    },
    {
      id: 'g5-volume', name: 'Volume', icon: '\u{1F4E6}',
      lesson: [
        { t: '<b>Volume</b> is how many cubes fill a box. Let’s count the cubes in this box!', v: vBox(3, 2, 2) },
        { t: 'One layer has 3 × 2 = 6 cubes. There are 2 layers: 6 × 2 = <b>12 cubes</b>.', v: vBox(3, 2, 2) },
        { t: 'The shortcut: <b>Volume = length × width × height</b>. 5 × 3 × 2 = <b>30</b> cubic units.', v: vBox(5, 3, 2, { solid: true }) },
      ],
      gen(d) {
        const l = R(2, d < 0.4 ? 4 : d < 0.7 ? 5 : 10), w = R(1, d < 0.4 ? 3 : 6), h = R(1, d < 0.4 ? 3 : 6), v = l * w * h;
        if (d > 0.7 && Math.random() < 0.4) return Q({ q: `A box holds ${v} cubes. It is ${l} long and ${w} wide. How <b>tall</b> is it?`, vis: vBox(l, w, h, { solid: true, labels: [l, w, '?'] }), ans: h, wrong: [v - l * w, h + 1, l * w], min: 1, hint: `One layer is ${l} × ${w} = ${l * w}. How many layers make ${v}?`, why: `${l} × ${w} = ${l * w}, and ${v} ÷ ${l * w} = <b>${h}</b>.` });
        return Q({ q: 'What is the <b>volume</b>?', vis: vBox(l, w, h, { solid: d >= 0.4 }), ans: v, wrong: [l * w, l + w + h, v + l * w, 2 * (l * w + w * h + l * h)], hint: 'length × width × height', why: `${l} × ${w} × ${h} = <b>${v}</b> cubic units.` });
      },
    },
  ];

  // ======================================================================
  //   GRADE 6
  // ======================================================================
  const G6 = [
    {
      id: 'g6-ratio', name: 'Ratios and Rates', icon: '\u{1F517}',
      lesson: [
        { t: 'A <b>ratio</b> compares two amounts. 3 circles and 2 squares: circles to squares is <b>3 : 2</b> (say "3 to 2").', v: vRatio(3, 2) },
        { t: 'Equal ratios grow together. Double both sides: <b>3 : 2 = 6 : 4 = 9 : 6</b>.', v: vRatio(6, 4) },
        { t: 'A <b>rate</b> compares different units. 120 miles in 2 hours is <b>60 miles per hour</b> (120 ÷ 2).', v: big('120 miles ÷ 2 hours<br>= 60 per hour') },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['pic', 'scale'] : d < 0.7 ? ['scale', 'unit', 'pic'] : ['unit', 'recipe', 'scale']);
        if (kind === 'pic') { const a = R(1, 6); let b; do { b = R(1, 6); } while (b === a); return Q({ q: 'What is the ratio of <b>circles</b> to <b>squares</b>?', vis: vRatio(a, b), ans: `${a} : ${b}`, wrong: [`${b} : ${a}`, `${a} : ${a + b}`, `${a + 1} : ${b}`], hint: 'Circles first, then squares.', why: `There are ${a} circles and ${b} squares: <b>${a} : ${b}</b>.` }); }
        if (kind === 'scale') { const a = R(1, 6), b = R(2, 9), k = R(2, 5); return Q({ q: `${a} : ${b} = ${a * k} : ${BL}`, ans: b * k, wrong: [b + a * k - a, b * k + 1, a * k * b], hint: `What was ${a} multiplied by to get ${a * k}? Do the same to ${b}.`, why: `${a} × ${k} = ${a * k}, so ${b} × ${k} = <b>${b * k}</b>.` }); }
        if (kind === 'unit') {
          const n = R(2, 8), p = R(2, 12);
          if (Math.random() < 0.5) return Q({ q: `${n} toys cost $${n * p}. How much does <b>1 toy</b> cost?`, ans: p, pre: '$', wrong: [n * p - n, p + 1, n * p], hint: `Share the cost: ${n * p} ÷ ${n}.`, why: `$${n * p} ÷ ${n} = <b>$${p}</b> each.` });
          const s = R(3, 9) * 10;
          return Q({ q: `A train goes ${s * n} miles in ${n} hours. How far does it go in <b>1 hour</b>?`, ans: s, wrong: [s * n - n, s + 10, s * n], hint: `${s * n} ÷ ${n}.`, why: `${s * n} ÷ ${n} = <b>${s}</b> miles per hour.` });
        }
        const a = R(2, 4), b = R(2, 3), k = R(2, 4);
        return Q({ q: `A recipe uses ${a} cups of flour for every ${b} eggs. How many cups of flour for <b>${b * k} eggs</b>?`, ans: a * k, wrong: [a + b * k - b, a * k + 1, b * k], hint: `${b * k} eggs is ${k} times as many eggs.`, why: `${b} × ${k} = ${b * k} eggs, so ${a} × ${k} = <b>${a * k}</b> cups.` });
      },
    },
    {
      id: 'g6-pct', name: 'Percents', icon: '\u{1F4AF}',
      lesson: [
        { t: '<b>Percent</b> means "out of 100". 25 of 100 squares shaded is <b>25%</b>.', v: vHundred(25, '#f472b6') },
        { t: `Handy ones: <b>50%</b> is half, <b>25%</b> is a quarter, <b>10%</b> is one tenth.`, v: big(`50% = ${F(1, 2)}<br>25% = ${F(1, 4)}<br>10% = ${F(1, 10)}`) },
        { t: 'Find 10% of 80: divide by 10, that’s 8. So <b>30% of 80</b> = 3 × 8 = <b>24</b>.', v: big('10% of 80 = 8<br>30% of 80 = 24') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['grid', 'of'] : d < 0.7 ? ['of', 'frac', 'grid'] : ['of', 'frac', 'sale']);
        if (kind === 'grid') { const n = R(5, 95); return Q({ q: 'What percent is shaded?', vis: vHundred(n, '#f472b6'), ans: n, unit: '%', wrong: [100 - n, n + 10, Math.round(n / 10)], hint: 'Count the shaded squares out of 100. Each column is 10.', why: `${n} out of 100 squares: <b>${n}%</b>.` }); }
        const pcts = d < 0.35 ? [10, 50] : [10, 20, 25, 50, 75, 30];
        const p = pick(pcts), unit = p % 25 === 0 ? 4 : p % 20 === 0 ? 5 : 10, base = unit * R(2, 20), ans = base * p / 100;
        if (kind === 'of') return Q({ q: `What is <b>${p}%</b> of ${base}?`, ans, wrong: [base - ans, ans + base / 10, p, ans * 10], hint: p === 50 ? 'Half of it!' : p === 25 ? 'A quarter: divide by 4.' : p === 75 ? 'Find 25% (divide by 4), then times 3.' : 'Find 10% first (divide by 10).', why: `${p}% of ${base} = ${F(p, 100)} × ${base} = <b>${fmt(ans)}</b>.` });
        if (kind === 'frac') { const [n, dd] = pick([[1, 2], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [1, 10], [7, 10], [3, 20], [9, 25]]); const pc = n * 100 / dd; return Q({ q: `${F(n, dd)} = ${BL}`, ans: pc, unit: '%', wrong: [n * 10, pc + 5, dd, n + dd], hint: `How many hundredths? Make the bottom 100.`, why: `${F(n, dd)} = ${F(pc, 100)} = <b>${pc}%</b>.` }); }
        const pr = unit * R(2, 12) * (p === 75 ? 1 : 1), off = pr * p / 100;
        return Q({ q: `A $${pr} toy is <b>${p}% off</b>. What is the sale price?`, ans: pr - off, pre: '$', wrong: [off, pr - p, pr + off], hint: `First find ${p}% of $${pr}, then take it away.`, why: `${p}% of $${pr} is $${fmt(off)}. $${pr} − $${fmt(off)} = <b>$${fmt(pr - off)}</b>.` });
      },
    },
    {
      id: 'g6-neg', name: 'Negative Numbers', icon: '\u{1F976}',
      lesson: [
        { t: `Numbers below zero are <b>negative</b>. ${MINUS}3 is 3 steps to the LEFT of 0, like a cold ${MINUS}3° day.`, v: vLine(-6, 6, { mark: -3, label: MINUS + '3' }) },
        { t: `On the number line, further <b>right is bigger</b>. So ${MINUS}2 &gt; ${MINUS}5, because ${MINUS}2 is to the right!`, v: vLine(-6, 6, { mark: -2, label: MINUS + '2' }) },
        { t: `<b>Adding</b> moves right. <b>Subtracting</b> moves left. ${MINUS}3 + 5: start at ${MINUS}3, hop 5 right to <b>2</b>.`, v: vLine(-6, 6, { from: -3, to: 2 }) },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['big', 'add'] : d < 0.7 ? ['add', 'temp', 'big'] : ['add', 'sub', 'temp']);
        if (kind === 'big') {
          const most = Math.random() < 0.5, s = new Set(); while (s.size < 4) s.add(R(-12, 9));
          const arr = [...s]; if (!arr.some((v) => v < 0)) arr[0] = -R(1, 9);
          const ans = most ? Math.max(...arr) : Math.min(...arr);
          return Q({ q: `Which number is the <b>${most ? 'BIGGEST' : 'SMALLEST'}</b>?`, ans: fmt(ans), wrong: arr.filter((v) => v !== ans).map(fmt), hint: 'Picture a number line: right is bigger, left is smaller.', why: `<b>${fmt(ans)}</b> is furthest to the ${most ? 'right' : 'left'} on the number line.` });
        }
        if (kind === 'temp') { const a = -R(2, 9), b = R(3, 12); return Q({ q: `It is ${fmt(a)}° outside. It gets <b>${b}° warmer</b>. What is the temperature now?`, vis: d < 0.7 ? vLine(-10, 10, { mark: a, label: 'START' }) : '', ans: a + b, unit: '°', min: -99, wrong: [a - b, -(a + b), -a + b], hint: `Start at ${fmt(a)} and count up ${b}.`, why: `${fmt(a)} + ${b} = <b>${fmt(a + b)}°</b>.` }); }
        if (kind === 'add') {
          const a = Math.random() < 0.75 ? -R(1, 9) : R(1, 9), b = d < 0.5 ? R(1, 9) : a > 0 ? -R(1, 9) : (R(-9, 9) || 3), s = a + b;
          return Q({ q: `${fmt(a)} + ${pn(b)} = ${BL}`, vis: d < 0.5 && Math.abs(s) <= 10 ? vLine(-10, 10, { mark: a, label: 'START' }) : '', ans: s, min: -99, wrong: [a - b, -s, Math.abs(a) + Math.abs(b)], hint: b > 0 ? `Start at ${fmt(a)} and move ${b} to the right.` : `Adding a negative moves LEFT. Start at ${fmt(a)}, move ${-b} left.`, why: `${fmt(a)} + ${pn(b)} = <b>${fmt(s)}</b>.` });
        }
        const a = R(-9, 9), b = R(-9, 9) || 5, r = a - b;
        return Q({ q: `${fmt(a)} − ${pn(b)} = ${BL}`, ans: r, min: -99, wrong: [a + b, -r, r + 2], hint: b > 0 ? `Subtracting moves LEFT ${b}.` : `Subtracting a negative is the same as adding: ${fmt(a)} + ${-b}.`, why: b < 0 ? `Taking away a negative is adding: ${fmt(a)} + ${-b} = <b>${fmt(r)}</b>.` : `Start at ${fmt(a)} and move ${b} left: <b>${fmt(r)}</b>.` });
      },
    },
    {
      id: 'g6-x', name: 'Solve for x', icon: '\u{1F575}️',
      lesson: [
        { t: `A letter like ${X} stands for a <b>mystery number</b>. ${X} + 3 = 8. The scale balances, so what is ${X}?`, v: vScale('x + 3', '8') },
        { t: `Do the <b>opposite</b> to both sides. Take 3 off each side: ${X} = 8 − 3 = <b>5</b>. Check: 5 + 3 = 8 ✓`, v: vScale('x', '5') },
        { t: `3${X} means 3 × ${X}. If 3${X} = 12, <b>divide</b> both sides by 3: ${X} = <b>4</b>.`, v: vScale('3x', '12') },
      ],
      gen(d) {
        const kind = pick(d < 0.35 ? ['plus', 'minus'] : d < 0.7 ? ['plus', 'times', 'eval', 'minus'] : ['times', 'two', 'div', 'eval']);
        const x = R(2, 12), a = R(2, 9);
        if (kind === 'plus') return Q({ q: `${X} + ${a} = ${x + a}`, vis: d < 0.35 ? vScale(`x + ${a}`, String(x + a)) : '', ans: x, wrong: [x + 2 * a, x + a, a], small: false, hint: `Take ${a} away from both sides.`, why: `${x + a} − ${a} = <b>${x}</b>. Check: ${x} + ${a} = ${x + a} ✓`, pre: '' });
        if (kind === 'minus') return Q({ q: `${X} − ${a} = ${x}`, ans: x + a, wrong: [x - a, x, a], hint: `Add ${a} to both sides.`, why: `${x} + ${a} = <b>${x + a}</b>. Check: ${x + a} − ${a} = ${x} ✓` });
        if (kind === 'times') return Q({ q: `${a}${X} = ${a * x}`, ans: x, wrong: [a * x - a, a * x * a, x + 1], min: 1, hint: `${a}${X} means ${a} × ${X}. Divide both sides by ${a}.`, why: `${a * x} ÷ ${a} = <b>${x}</b>. Check: ${a} × ${x} = ${a * x} ✓` });
        if (kind === 'div') return Q({ q: `${F(X, a)} = ${x}`, ans: a * x, wrong: [x, a + x, a * x + a], hint: `Multiply both sides by ${a}.`, why: `${x} × ${a} = <b>${a * x}</b>. Check: ${a * x} ÷ ${a} = ${x} ✓` });
        if (kind === 'eval') { const b = R(1, 9); return Q({ q: `What is ${a}${X} + ${b} when ${X} = ${x}?`, ans: a * x + b, wrong: [a + x + b, a * (x + b), a * 10 + x + b], hint: `Put ${x} in place of ${X}: ${a} × ${x} + ${b}.`, why: `${a} × ${x} = ${a * x}, plus ${b} is <b>${a * x + b}</b>.` }); }
        const b = R(1, 9), c = a * x + b;
        return Q({ q: `${a}${X} + ${b} = ${c}`, ans: x, wrong: [Number.isInteger((c + b) / a) ? (c + b) / a : x + 1, c - b, x + 2], min: 1, hint: `First take ${b} off both sides. Then divide by ${a}.`, why: `${c} − ${b} = ${c - b}, then ${c - b} ÷ ${a} = <b>${x}</b>.` });
      },
    },
    {
      id: 'g6-avg', name: 'Mean and Median', icon: '\u{1F4CA}',
      lesson: [
        { t: 'The <b>MEAN</b> (or average) evens things out. Add all the numbers, then divide by how many there are.', v: vChart([4, 6, 8]) },
        { t: 'Scores 4, 6 and 8: 4 + 6 + 8 = 18, and 18 ÷ 3 = <b>6</b>. The mean is 6.', v: vChart([4, 6, 8], { mean: 6 }) },
        { t: 'The <b>MEDIAN</b> is the middle number once they are in order. 3, 9, 5 → 3, <b>5</b>, 9. The median is 5.', v: big('3, 9, 5<br>→ 3, <span style="color:#2563eb">5</span>, 9') },
        { t: 'The <b>RANGE</b> is the biggest minus the smallest. 3, 5, 9: 9 − 3 = <b>6</b>.', v: big('9 − 3 = 6') },
      ],
      gen(d) {
        const kind = pick(d < 0.4 ? ['mean', 'median'] : d < 0.7 ? ['mean', 'median', 'range'] : ['mean', 'median', 'range']);
        const c = d < 0.4 ? 3 : pick([3, 4, 5]);
        if (kind === 'mean') {
          let vals, m;
          for (let t = 0; t < 50; t++) {
            m = R(3, 12); vals = []; let s = 0;
            for (let i = 0; i < c - 1; i++) { const v = R(Math.max(1, m - 5), m + 5); vals.push(v); s += v; }
            const last = m * c - s; if (last >= 1 && last <= 20 && !vals.every((v) => v === m)) { vals.push(last); break; }
          }
          const sum = vals.reduce((x, y) => x + y, 0);
          return Q({ q: `What is the <b>mean</b> of ${vals.join(', ')}?`, vis: d < 0.5 ? vChart(vals) : '', ans: m, wrong: [sum, Math.max(...vals), m + 1, m - 1], hint: `Add them all up, then divide by ${c}.`, why: `${vals.join(' + ')} = ${sum}, and ${sum} ÷ ${c} = <b>${m}</b>.` });
        }
        const n = kind === 'median' ? (c % 2 ? c : c + 1) : c;
        const vals = []; for (let i = 0; i < n; i++) vals.push(R(1, 20));
        const sorted = [...vals].sort((x, y) => x - y);
        if (kind === 'median') {
          const med = sorted[(n - 1) / 2];
          return Q({ q: `What is the <b>median</b> of ${vals.join(', ')}?`, ans: med, wrong: [vals[(n - 1) / 2], sorted[n - 1], sorted[0], med + 1], hint: 'Put them in order first, smallest to biggest.', why: `In order: ${sorted.join(', ')}. The middle one is <b>${med}</b>.` });
        }
        const rg = sorted[n - 1] - sorted[0];
        return Q({ q: `What is the <b>range</b> of ${vals.join(', ')}?`, ans: rg, wrong: [sorted[n - 1], sorted[n - 1] + sorted[0], rg + 1], hint: 'Biggest minus smallest.', why: `${sorted[n - 1]} − ${sorted[0]} = <b>${rg}</b>.` });
      },
    },
  ];

  const GRADES = [
    { n: 0, color: '#2dd4bf', blurb: 'Count \u00b7 Shapes \u00b7 Add', topics: GK },
    { n: 1, color: '#f472b6', blurb: 'Tens · Adding · Time', topics: G1 },
    { n: 2, color: '#fb923c', blurb: 'Hundreds · Coins · Groups', topics: G2 },
    { n: 3, color: '#eab308', blurb: 'Times · Sharing · Fractions', topics: G3 },
    { n: 4, color: '#22c55e', blurb: 'Big × · Decimals · Primes', topics: G4 },
    { n: 5, color: '#3b82f6', blurb: 'Fractions · Decimals · Volume', topics: G5 },
    { n: 6, color: '#8b5cf6', blurb: 'Ratios · % · Negatives · x', topics: G6 },
  ];

  GRADES.forEach((g) => { g.label = g.n ? 'GRADE ' + g.n : 'KINDERGARTEN'; });
  global.MathMountain = { GRADES, F, R, pick, shuffle, Q, FQ, X, BL, MINUS, fmt, pn, gcd, big, SV, T, vScale, vLine, vHundred };
})(window);
