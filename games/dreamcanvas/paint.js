// DreamCanvas paint engine (window.DreamCanvasPaint). Plain script, no modules, runs from file://.
//
// One 960x640 picture. What is stored per pixel:
//   gH    ground height 0..1 (paper tooth, canvas weave, wood grain, bricks)
//   col   the colour you see before lighting (dried watercolour, oil, acrylic, spray, marker, crayon)
//   imp   paint thickness ("impasto") -- oil and acrylic ridges, crayon wax; lit like real bumps
//   wetT  engine time when oil / acrylic / spray at this pixel is dry (wet paint mixes and smears)
//   top   which medium is on top (1 oil, 2 acrylic, 3 crayon, 4 spray, 5 marker) -- crayon and oil resist watercolour
//   build how much the paper's tooth is filled (crayon passes, spray build-up)
// Watercolour lives in a half-size wet layer (w = water, p = pigment as optical density per RGB channel). Water
// flows to wetter-than-it cells and into the paper's valleys, edges dry first so pigment rides outwards and dries
// darker at the rim, and pigment settles out (more in the paper's dips = granulation) into col with a multiply,
// so washes glaze over each other like the real thing.
// Opaque paints mix with Kubelka-Munk (blue + yellow makes green, not grey).
(function () {
  'use strict';
  const PW = 960, PH = 640, N = PW * PH;
  const CW = PW >> 1, CH = PH >> 1, CN = CW * CH;
  const WET = 0.02;
  const OIL = 1, ACRYLIC = 2, CRAYON = 3, SPRAY = 4, MARKER = 5;

  // ---------------------------------------------------------------- noise
  function rng(seed) {
    let s = (seed >>> 0) || 1;
    return function () { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  const LAT = new Float32Array(256 * 256);
  function seedNoise(seed) { const r = rng(seed); for (let i = 0; i < LAT.length; i++) LAT[i] = r(); }
  seedNoise(7);
  function vn(x, y) {
    const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const x0 = xf & 255, y0 = yf & 255, x1 = (x0 + 1) & 255, y1 = (y0 + 1) & 255;
    const a = LAT[(y0 << 8) | x0], b = LAT[(y0 << 8) | x1], c = LAT[(y1 << 8) | x0], d = LAT[(y1 << 8) | x1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y, oct) {
    let s = 0, a = 0.5, t = 0;
    for (let o = 0; o < oct; o++) { s += a * vn(x, y); t += a; x = x * 2.03 + 17.1; y = y * 2.03 + 3.7; a *= 0.5; }
    return s / t;
  }
  function ih(a, b) {
    let h = (a * 374761393 + b * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  // ---------------------------------------------------------------- grounds
  // absorb: how fast paper drinks water (watercolour spreads + bleeds, markers feather); tooth: how much crayon and
  // dry brushes skip the dips; depth: how strongly the surface's bumps catch the light; gran: watercolour granulation.
  const GROUNDS = [
    { id: 'cold', name: 'WATERCOLOR PAPER', sub: 'Bumpy and thirsty. Made for washes.', absorb: 0.85, tooth: 0.55, depth: 1.0, gran: 1.0, rgb: [0.975, 0.962, 0.93] },
    { id: 'rough', name: 'ROUGH PAPER', sub: 'Big bumps. Crayon skips, paint sparkles.', absorb: 0.9, tooth: 0.85, depth: 1.6, gran: 1.5, rgb: [0.97, 0.958, 0.93] },
    { id: 'hot', name: 'SMOOTH PAPER', sub: 'Silky. Crisp markers and sharp edges.', absorb: 0.72, tooth: 0.15, depth: 0.35, gran: 0.4, rgb: [0.985, 0.98, 0.965] },
    { id: 'sketch', name: 'SKETCH PAPER', sub: 'Thin everyday paper.', absorb: 0.45, tooth: 0.3, depth: 0.45, gran: 0.3, rgb: [0.99, 0.988, 0.975] },
    { id: 'kraft', name: 'BROWN PAPER', sub: 'Like a paper bag. Try bright colors.', absorb: 0.6, tooth: 0.4, depth: 0.55, gran: 0.5, rgb: [0.71, 0.55, 0.37] },
    { id: 'black', name: 'BLACK PAPER', sub: 'Crayons and spray pop. Watercolor hides!', absorb: 0.55, tooth: 0.45, depth: 0.6, gran: 0.5, rgb: [0.11, 0.11, 0.125] },
    { id: 'canvas', name: 'CANVAS', sub: 'Woven cloth. The oil painter\'s classic.', absorb: 0.25, tooth: 0.65, depth: 1.1, gran: 0.6, rgb: [0.95, 0.935, 0.89] },
    { id: 'gesso', name: 'GESSO BOARD', sub: 'Hard white board with brush marks.', absorb: 0.3, tooth: 0.2, depth: 0.5, gran: 0.4, rgb: [0.975, 0.97, 0.955] },
    { id: 'wood', name: 'WOOD BOARD', sub: 'Real grain. Water sits on top.', absorb: 0.12, tooth: 0.25, depth: 0.7, gran: 0.3, rgb: [0.8, 0.62, 0.4] },
    { id: 'cardboard', name: 'CARDBOARD', sub: 'Box cardboard with ridges.', absorb: 0.7, tooth: 0.4, depth: 0.7, gran: 0.6, rgb: [0.77, 0.6, 0.42] },
    { id: 'brick', name: 'BRICK WALL', sub: 'For spray paint murals!', absorb: 0.4, tooth: 0.9, depth: 2.2, gran: 1.0, rgb: [0.62, 0.3, 0.22] }
  ];
  const GROUND_BY = {}; GROUNDS.forEach((g) => { GROUND_BY[g.id] = g; });

  // writes o.h (0..1) and o.r/g/b for ground pixel (x, y)
  function sampleGround(g, x, y, o) {
    const b = g.rgb;
    let h = 0.5, m = 1, r = b[0], gg = b[1], bb = b[2];
    switch (g.id) {
      case 'cold':
        h = 0.62 * fbm(x / 9, y / 9, 3) + 0.38 * vn(x / 2.2 + 50, y / 2.2);
        m = 0.985 + 0.03 * h; break;
      case 'rough': {
        const f = fbm(x / 15, y / 15, 4);
        h = 0.72 * f * f * 1.6 + 0.28 * vn(x / 3 + 9, y / 3);
        m = 0.975 + 0.04 * h; break;
      }
      case 'hot':
        h = 0.6 * vn(x / 1.6, y / 1.6) + 0.4 * fbm(x / 30, y / 30, 2);
        m = 0.995 + 0.01 * h; break;
      case 'sketch':
        h = 0.55 * vn(x / 2, y / 2) + 0.45 * vn(x / 40 + 3, y / 3);
        m = 0.99 + 0.015 * h; break;
      case 'kraft': {
        const fib = vn(x / 26 + 7, y / 2.4);
        h = 0.45 * vn(x / 2, y / 2) + 0.55 * fib;
        m = 0.9 + 0.16 * fbm(x / 70, y / 9, 2) + 0.05 * fib;
        if (ih(x, y) > 0.9985) m *= 0.75;      // little dark fibres
        break;
      }
      case 'black':
        h = 0.6 * vn(x / 2, y / 2) + 0.4 * fbm(x / 12, y / 12, 2);
        m = 0.92 + 0.16 * h; break;
      case 'canvas': {
        const P = 6.5;
        const u = x / P + 0.18 * vn(x / 37, y / 41), v = y / P + 0.18 * vn(x / 43 + 5, y / 31);
        const iu = Math.floor(u), iv = Math.floor(v), fu = u - iu, fv = v - iv;
        const pw = Math.sin(Math.PI * fu), pf = Math.sin(Math.PI * fv);
        const over = ((iu + iv) & 1) === 0;
        const th = 0.75 + 0.25 * vn(iu * 3.1, iv * 0.3 + (over ? 0 : 50));  // thread thickness varies
        h = (over ? pw * (0.55 + 0.45 * pf) : pf * (0.55 + 0.45 * pw)) * th;
        h = 0.85 * h + 0.15 * vn(x / 1.5, y / 1.5);
        m = 0.97 + 0.05 * h; break;
      }
      case 'gesso':
        h = 0.5 * fbm(x / 110, y / 5, 3) + 0.25 * vn(x / 2, y / 2) + 0.25 * fbm(x / 14, y / 14, 2);
        m = 0.99 + 0.02 * h; break;
      case 'wood': {
        const v = y + 16 * fbm(x / 190, y / 60, 3) + 3 * vn(x / 20, y / 8);
        const ring = (v / 11) - Math.floor(v / 11);
        const dark = Math.pow(ring, 3);
        const streak = fbm(x / 5, y / 46, 2);
        r = 0.85 - 0.22 * dark - 0.1 * streak; gg = 0.66 - 0.2 * dark - 0.09 * streak; bb = 0.43 - 0.15 * dark - 0.07 * streak;
        h = 0.55 - 0.35 * dark + 0.3 * vn(x / 6, y / 1.4);
        m = 1; break;
      }
      case 'cardboard':
        h = 0.3 * (0.5 + 0.5 * Math.sin(y * 2 * Math.PI / 17)) + 0.45 * vn(x / 2.5, y / 2.5) + 0.25 * fbm(x / 20, y / 20, 2);
        m = 0.92 + 0.13 * fbm(x / 40, y / 40, 2); break;
      case 'brick': {
        const bh = 30, bw = 66, mo = 4;
        const row = Math.floor(y / bh), off = (row & 1) ? bw / 2 : 0;
        const col = Math.floor((x + off) / bw);
        const bx = x + off - col * bw, by = y - row * bh;
        if (bx < mo || by < mo) {
          h = 0.08 + 0.18 * vn(x / 2, y / 2);
          r = 0.7; gg = 0.67; bb = 0.62; m = 0.88 + 0.18 * vn(x / 3, y / 3);
        } else {
          const edge = Math.min(bx - mo, bw - bx, by - mo, bh - by);
          const bev = Math.min(1, edge / 3);
          h = 0.42 * bev + 0.38 * fbm(x / 7, y / 7, 3) + 0.2 * vn(x / 1.7, y / 1.7);
          const t = ih(row, col);
          r = 0.55 + 0.17 * t; gg = 0.25 + 0.1 * t; bb = 0.19 + 0.06 * t;
          if (ih(col, row + 99) > 0.85) { r *= 0.75; gg *= 0.75; bb *= 0.8; }
          m = 0.82 + 0.3 * fbm(x / 20, y / 20, 2);
        }
        break;
      }
    }
    o.h = clamp01(h); o.r = clamp01(r * m); o.g = clamp01(gg * m); o.b = clamp01(bb * m);
  }

  // ---------------------------------------------------------------- state
  const S = {
    ground: GROUNDS[0], seed: 1,
    gH: new Float32Array(N), base: new Float32Array(N * 3),
    col: new Float32Array(N * 3), imp: new Float32Array(N), wetT: new Float32Array(N),
    top: new Uint8Array(N), build: new Float32Array(N), mask: new Uint8Array(N),
    w: new Float32Array(CN), p: new Float32Array(CN * 3), dep: new Float32Array(CN * 3), cg: new Float32Array(CN),
    dw: new Float32Array(CN), dp: new Float32Array(CN * 3), edge: new Uint8Array(CN),
    wc: null,                  // active watercolour box in cells {x0,y0,x1,y1}
    depBox: null,              // cells with pigment waiting to be baked
    salt: [], drips: [], pool: new Float32Array((PW >> 4) * (PH >> 4)),
    wash: null, stroke: null, tilt: false, dryBoost: 0,
    now: 0, simAcc: 0,
    dirty: null, touch: null
  };

  let canvas = null, ctx = null, img = null, buf = null;
  // the half-size watercolour layer is read back through a fixed wobble, so its edges look fibrous, not stair-stepped
  const JX = new Float32Array(N), JY = new Float32Array(N);
  (function () {
    seedNoise(4242);
    for (let y = 0, i = 0; y < PH; y++) for (let x = 0; x < PW; x++, i++) {
      JX[i] = (vn(x * 0.45, y * 0.45) - 0.5) * 1.6 + (vn(x * 1.3 + 40, y * 1.3) - 0.5) * 0.6;
      JY[i] = (vn(x * 0.45 + 77, y * 0.45 + 31) - 0.5) * 1.6 + (vn(x * 1.3, y * 1.3 + 40) - 0.5) * 0.6;
    }
    seedNoise(7);
  })();

  function markDirty(x0, y0, x1, y1) {
    x0 = Math.max(0, Math.floor(x0)); y0 = Math.max(0, Math.floor(y0));
    x1 = Math.min(PW - 1, Math.ceil(x1)); y1 = Math.min(PH - 1, Math.ceil(y1));
    if (x1 < x0 || y1 < y0) return;
    const d = S.dirty;
    if (!d) S.dirty = { x0, y0, x1, y1 };
    else { if (x0 < d.x0) d.x0 = x0; if (y0 < d.y0) d.y0 = y0; if (x1 > d.x1) d.x1 = x1; if (y1 > d.y1) d.y1 = y1; }
    const t = S.touch;
    if (!t) S.touch = { x0, y0, x1, y1 };
    else { if (x0 < t.x0) t.x0 = x0; if (y0 < t.y0) t.y0 = y0; if (x1 > t.x1) t.x1 = x1; if (y1 > t.y1) t.y1 = y1; }
  }
  function growBox(name, x0, y0, x1, y1) {
    x0 = Math.max(0, x0 | 0); y0 = Math.max(0, y0 | 0); x1 = Math.min(CW - 1, Math.ceil(x1)); y1 = Math.min(CH - 1, Math.ceil(y1));
    const b = S[name];
    if (!b) S[name] = { x0, y0, x1, y1 };
    else { if (x0 < b.x0) b.x0 = x0; if (y0 < b.y0) b.y0 = y0; if (x1 > b.x1) b.x1 = x1; if (y1 > b.y1) b.y1 = y1; }
  }

  function makeGround(id, seed) {
    const g = GROUND_BY[id] || GROUNDS[0];
    S.ground = g; S.seed = seed >>> 0;
    seedNoise(S.seed);
    const o = {};
    for (let y = 0, i = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++, i++) {
        sampleGround(g, x, y, o);
        S.gH[i] = o.h; S.base[i * 3] = o.r; S.base[i * 3 + 1] = o.g; S.base[i * 3 + 2] = o.b;
      }
    }
    for (let cy = 0; cy < CH; cy++) {
      for (let cx = 0; cx < CW; cx++) {
        const i = cy * 2 * PW + cx * 2;
        S.cg[cy * CW + cx] = (S.gH[i] + S.gH[i + 1] + S.gH[i + PW] + S.gH[i + PW + 1]) * 0.25;
      }
    }
    seedNoise(S.seed * 31 + 5);   // a fresh field for brush hairs / wax so it doesn't line up with the paper
  }

  function newPainting(id, seed) {
    makeGround(id, seed == null ? (Math.random() * 1e9) | 0 : seed);
    S.col.set(S.base); S.imp.fill(0); S.wetT.fill(0); S.top.fill(0); S.build.fill(0);
    clearWet();
    S.drips.length = 0; S.pool.fill(0); S.wash = null; S.stroke = null;
    undoStack.length = 0; undoBytes = 0; pre.open = false; S.touch = null;
    S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
    S.changed = false;
  }
  function clearWet() {
    S.w.fill(0); S.p.fill(0); S.dep.fill(0); S.wc = null; S.depBox = null; S.salt.length = 0;
  }

  // ---------------------------------------------------------------- colour mixing
  function scat(r, g, b) { const l = 0.3 * r + 0.59 * g + 0.11 * b; return 0.35 + 0.65 * l * l * l; }
  function ks(r) { r = r < 0.003 ? 0.003 : r > 1 ? 1 : r; return (1 - r) * (1 - r) / (2 * r); }
  function unks(k) { return 1 + k - Math.sqrt(k * k + 2 * k); }
  // mixes paint (r2,g2,b2) into array a at o by t (0..1), as pigments do
  function km(a, o, r2, g2, b2, t) {
    if (t <= 0) return;
    if (t > 1) t = 1;
    const r1 = a[o], g1 = a[o + 1], b1 = a[o + 2];
    const s1 = scat(r1, g1, b1) * (1 - t), s2 = scat(r2, g2, b2) * t, s = s1 + s2;
    a[o] = unks((ks(r1) * s1 + ks(r2) * s2) / s);
    a[o + 1] = unks((ks(g1) * s1 + ks(g2) * s2) / s);
    a[o + 2] = unks((ks(b1) * s1 + ks(b2) * s2) / s);
  }
  function lerp3(a, o, r, g, b, t) {
    if (t <= 0) return; if (t > 1) t = 1;
    a[o] += (r - a[o]) * t; a[o + 1] += (g - a[o + 1]) * t; a[o + 2] += (b - a[o + 2]) * t;
  }
  // e^-x for x in 0..8, for the hot loops
  const EXL = new Float32Array(4097);
  for (let k = 0; k <= 4096; k++) EXL[k] = Math.exp(-k / 512);
  const ex = (x) => (x >= 8 ? EXL[4096] : x <= 0 ? 1 : EXL[(x * 512) | 0]);
  const dens = (c) => -Math.log(c < 0.03 ? 0.03 : c > 0.999 ? 0.999 : c);

  // ---------------------------------------------------------------- undo
  // At each stroke start the whole picture is copied into `pre`; when the next stroke starts, only the box the last
  // one changed (S.touch, which keeps growing while its watercolour dries) is cut out of `pre` onto the stack.
  const pre = { open: false, col: new Float32Array(N * 3), imp: new Float32Array(N), wetT: new Float32Array(N), top: new Uint8Array(N), build: new Float32Array(N) };
  const undoStack = []; let undoBytes = 0;
  const UNDO_MAX = 20, UNDO_BYTES = 40e6;     // kept modest for Fire tablets
  function commitOpen() {
    if (!pre.open) return;
    pre.open = false;
    const t = S.touch; S.touch = null;
    if (!t) return;
    const w = t.x1 - t.x0 + 1, h = t.y1 - t.y0 + 1, n = w * h;
    const e = { x0: t.x0, y0: t.y0, w, h, col: new Float32Array(n * 3), imp: new Float32Array(n), wetT: new Float32Array(n), top: new Uint8Array(n), build: new Float32Array(n) };
    for (let y = 0; y < h; y++) {
      const si = (t.y0 + y) * PW + t.x0, di = y * w;
      e.col.set(pre.col.subarray(si * 3, (si + w) * 3), di * 3);
      e.imp.set(pre.imp.subarray(si, si + w), di);
      e.wetT.set(pre.wetT.subarray(si, si + w), di);
      e.top.set(pre.top.subarray(si, si + w), di);
      e.build.set(pre.build.subarray(si, si + w), di);
    }
    e.bytes = n * 29;
    undoStack.push(e); undoBytes += e.bytes;
    while (undoStack.length > UNDO_MAX || (undoBytes > UNDO_BYTES && undoStack.length > 1)) undoBytes -= undoStack.shift().bytes;
  }
  function snapshot() {
    commitOpen();
    pre.col.set(S.col); pre.imp.set(S.imp); pre.wetT.set(S.wetT); pre.top.set(S.top); pre.build.set(S.build);
    pre.open = true; S.touch = null;
  }
  function restoreBox(src, x0, y0, w, h, fromPre) {
    for (let y = 0; y < h; y++) {
      const di = (y0 + y) * PW + x0, si = fromPre ? di : y * w;
      S.col.set(src.col.subarray(si * 3, (si + w) * 3), di * 3);
      S.imp.set(src.imp.subarray(si, si + w), di);
      S.wetT.set(src.wetT.subarray(si, si + w), di);
      S.top.set(src.top.subarray(si, si + w), di);
      S.build.set(src.build.subarray(si, si + w), di);
      if (!fromPre) {
        pre.col.set(src.col.subarray(si * 3, (si + w) * 3), di * 3);
        pre.imp.set(src.imp.subarray(si, si + w), di);
        pre.wetT.set(src.wetT.subarray(si, si + w), di);
        pre.top.set(src.top.subarray(si, si + w), di);
        pre.build.set(src.build.subarray(si, si + w), di);
      }
    }
  }
  function undo() {
    endStroke();
    S.wash = null; S.drips.length = 0;
    clearWet();
    if (pre.open && S.touch) {
      const t = S.touch;
      restoreBox(pre, t.x0, t.y0, t.x1 - t.x0 + 1, t.y1 - t.y0 + 1, true);
      S.touch = null;
      S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
      return true;
    }
    const e = undoStack.pop();
    if (!e) return false;
    undoBytes -= e.bytes;
    if (!pre.open) { snapshot(); }
    restoreBox(e, e.x0, e.y0, e.w, e.h, false);
    S.touch = null;
    S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
    return true;
  }
  function canUndo() { return (pre.open && !!S.touch) || undoStack.length > 0; }

  // ---------------------------------------------------------------- strokes
  // opts: { medium: 'water'|'oil'|'acrylic'|'spray'|'marker'|'crayon', tool, rgb: [r,g,b], size (px radius), amount 0..1 }
  function beginStroke(x, y, pressure, opts) {
    endStroke();
    snapshot();
    S.changed = true;
    const st = {
      m: opts.medium, tool: opts.tool, rgb: opts.rgb.slice(), size: opts.size, amt: opts.amount,
      x, y, px: x, py: y, dx: 1, dy: 0, dist: 0, travel: 0, pr: pressure, still: 0, t0: S.now, load: 1, rem: 0
    };
    S.stroke = st;
    if (st.m === 'oil' || st.m === 'acrylic') {
      if (st.tool === 'blend') st.smudge = null;
      else if (st.tool === 'knife') { st.kc = st.rgb.slice(); }
      else makeBristles(st);
    } else if (st.m === 'marker') S.mask.fill(0);
    if (st.m === 'spray') return;
    stampAt(st, x, y, pressure, true);
  }
  function moveStroke(x, y, pressure) {
    const st = S.stroke; if (!st) return;
    const ddx = x - st.x, ddy = y - st.y, d = Math.hypot(ddx, ddy);
    st.pr = pressure;
    if (d < 0.01) return;
    if (d > 0.5) {
      // keep a smoothed travel direction (flat brushes and knives turn with it)
      const nx = ddx / d, ny = ddy / d, k = Math.min(1, d / 6);
      st.dx += (nx - st.dx) * k; st.dy += (ny - st.dy) * k;
      const l = Math.hypot(st.dx, st.dy) || 1; st.dx /= l; st.dy /= l;
    }
    st.still = 0;
    if (st.m === 'spray') { st.x = x; st.y = y; return; }
    const sp = spacing(st);
    let t = st.rem;
    const sx = st.x, sy = st.y;
    while (t + sp <= d) {
      t += sp;
      const f = t / d;
      st.travel += sp;
      stampAt(st, sx + ddx * f, sy + ddy * f, pressure, false);
    }
    st.rem = t - d;
    st.x = x; st.y = y;
  }
  function endStroke() {
    const st = S.stroke; if (!st) return;
    S.stroke = null;
  }
  function spacing(st) {
    const R = st.size;
    switch (st.m) {
      case 'water': return Math.max(1, R * 0.18);
      case 'oil': case 'acrylic': return st.tool === 'blend' ? Math.max(1, R * 0.15) : Math.max(0.8, R * 0.09);
      case 'marker': return Math.max(0.6, R * 0.2);
      case 'crayon': return Math.max(0.8, R * 0.22);
    }
    return 2;
  }
  function stampAt(st, x, y, pr, first) {
    switch (st.m) {
      case 'water': wcStamp(st, x, y); break;
      case 'oil': case 'acrylic':
        if (st.tool === 'blend') smudgeStamp(st, x, y, 0.55);
        else if (st.tool === 'knife') knifeStamp(st, x, y);
        else bristleStamp(st, x, y, pr);
        break;
      case 'marker': markerStamp(st, x, y, st.size, 1); break;
      case 'crayon': if (st.tool === 'smudge') smudgeStamp(st, x, y, 0.5); else crayonStamp(st, x, y, pr); break;
    }
  }

  // ---- watercolour brush, water brush, sponge, salt
  function wcStamp(st, x, y) {
    const tool = st.tool;
    if (tool === 'salt') {
      if (Math.random() < 0.6) {
        const n = 1 + (st.size / 14) | 0;
        for (let k = 0; k < n; k++) {
          const a = Math.random() * 6.283, r = Math.sqrt(Math.random()) * st.size;
          S.salt.push({ x: (x + Math.cos(a) * r) / 2, y: (y + Math.sin(a) * r) / 2, life: 6 + Math.random() * 6, s: 1.8 + Math.random() * 1.8, ph: Math.random() * 6.3 });
        }
      }
      return;
    }
    const amt = st.amt;
    const flat = tool === 'flat';
    const R = (flat ? st.size * 1.5 : st.size) / 2;      // cell units
    const reach = (flat ? 1100 : 640) * (1.25 - amt * 0.45);
    const load = Math.max(0.12, 1 - st.travel / reach);
    const cx = x / 2, cy = y / 2;
    const conc = 0.1 + amt * 1.15;
    const wTarget = (1.15 - amt * 0.45) * (0.35 + 0.65 * load);
    const A0 = dens(st.rgb[0]) * conc, A1 = dens(st.rgb[1]) * conc, A2 = dens(st.rgb[2]) * conc;
    const px = -st.dy, py = st.dx;                   // flat brush lies across the motion
    const ext = R + 1;
    const x0 = Math.max(0, Math.floor(cx - ext)), x1 = Math.min(CW - 1, Math.ceil(cx + ext));
    const y0 = Math.max(0, Math.floor(cy - ext)), y1 = Math.min(CH - 1, Math.ceil(cy + ext));
    const dryBrush = load < 0.4 && tool === 'brush';
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - cx, oy = yy + 0.5 - cy;
        let f;
        if (flat) {
          const u = (ox * px + oy * py) / R, v = (ox * st.dx + oy * st.dy) / (R * 0.28 + 0.6);
          if (u * u > 1 || v * v > 1) continue;
          f = 1 - Math.pow(Math.abs(u), 8);
        } else {
          const rr = R * (0.9 + 0.2 * vn(xx * 0.22 + st.t0 * 10, yy * 0.22));     // a brush edge isn't a perfect circle
          const d2 = (ox * ox + oy * oy) / (rr * rr);
          if (d2 > 1) continue;
          f = 1 - d2 * d2;
        }
        const i = yy * CW + xx, j = i * 3;
        if (dryBrush) {
          // a nearly empty brush only touches the tops of the paper's bumps
          const need = (0.4 - load) * 2.4 * (0.35 + S.ground.tooth);
          f *= clamp01((S.cg[i] - (0.62 - need * 0.5) + need * 0.2) * 5 + (1 - need));
          if (f <= 0) continue;
        }
        if (tool === 'sponge') {
          S.w[i] *= 1 - 0.55 * f; S.p[j] *= 1 - 0.45 * f; S.p[j + 1] *= 1 - 0.45 * f; S.p[j + 2] *= 1 - 0.45 * f;
          liftDry(xx, yy, 0.07 * f);
          continue;
        }
        const wt = wTarget * f;
        if (S.w[i] < wt) S.w[i] += (wt - S.w[i]) * 0.6;
        if (tool === 'water') {
          const k = 0.05 * f; S.p[j] *= 1 - k; S.p[j + 1] *= 1 - k; S.p[j + 2] *= 1 - k;
        } else {
          const k = 0.38 * f * (0.4 + 0.6 * load);
          S.p[j] += (A0 - S.p[j]) * k; S.p[j + 1] += (A1 - S.p[j + 1]) * k; S.p[j + 2] += (A2 - S.p[j + 2]) * k;
        }
      }
    }
    growBox('wc', x0, y0, x1, y1);
    markDirty(x0 * 2 - 4, y0 * 2 - 4, x1 * 2 + 5, y1 * 2 + 5);
  }
  // the sponge can lift a little dried watercolour back toward the paper
  function liftDry(cx, cy, k) {
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const i = (cy * 2 + dy) * PW + cx * 2 + dx;
      if (S.top[i]) continue;
      const o = i * 3;
      lerp3(S.col, o, S.base[o], S.base[o + 1], S.base[o + 2], k);
    }
  }

  // ---- oil + acrylic bristle brush
  function makeBristles(st) {
    const R = st.size, flat = st.tool === 'flat';
    const n = Math.max(10, Math.min(80, Math.round(R * 3.2)));
    const r = rng((Math.random() * 1e9) | 0);
    st.br = [];
    const thick = st.m === 'oil' ? 0.2 + st.amt * 0.95 : 0.12 + st.amt * 0.45;
    for (let k = 0; k < n; k++) {
      let ox, oy;
      if (flat) { ox = -1 + (k + 0.2 + r() * 0.6) / n * 2; oy = (r() - 0.5) * 0.3; }
      else { const a = r() * 6.283, d = Math.sqrt(r()); ox = Math.cos(a) * d; oy = Math.sin(a) * d; }
      st.br.push({ ox, oy, load: 0.8 + 0.4 * r(), rad: Math.max(1.2, R * (flat ? 0.13 : 0.17) * (0.6 + 0.8 * r())), th: thick * (0.4 + 1.2 * r() * r() + 0.2),
        c: [st.rgb[0], st.rgb[1], st.rgb[2]] });
    }
    st.reach = st.m === 'oil' ? 380 + st.amt * 620 : 320 + st.amt * 380;
  }
  function bristleStamp(st, x, y, pr) {
    const oil = st.m === 'oil';
    const dryT = oil ? 240 : 5;
    const medium = oil ? OIL : ACRYLIC;
    const cover = oil ? 1 : 0.3 + st.amt * 0.7;           // thinned acrylic is see-through
    const R = st.size, px = -st.dy, py = st.dx;
    const fade = Math.max(0, 1 - spacing(st) / st.reach);
    const tooth = S.ground.tooth;
    let bx0 = PW, by0 = PH, bx1 = 0, by1 = 0;
    for (let k = 0; k < st.br.length; k++) {
      const b = st.br[k];
      b.load *= fade;
      if (b.load < 0.02) continue;
      const cx = x + (px * b.ox + st.dx * b.oy) * R, cy = y + (py * b.ox + st.dy * b.oy) * R;
      const rad = Math.max(0.9, b.rad), r2 = rad * rad;
      const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(PW - 1, Math.ceil(cx + rad));
      const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(PH - 1, Math.ceil(cy + rad));
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
      const thr = 0.78 - b.load * 1.05 - pr * 0.2;           // dry brush: only the bumps' tops catch paint
      let sr = 0, sg = 0, sb = 0, sw = 0, area = 0;
      for (let yy = y0; yy <= y1; yy++) {
        for (let xx = x0; xx <= x1; xx++) {
          const ox = xx + 0.5 - cx, oy = yy + 0.5 - cy, d2 = (ox * ox + oy * oy) / r2;
          if (d2 >= 1) continue;
          const i = yy * PW + xx, o = i * 3;
          let f = 1 - d2;
          const surf = 1 - tooth * (1 - S.gH[i]) + S.imp[i] * 0.5;
          if (thr > 0) { f *= clamp01((surf - thr) * 4); if (f <= 0) continue; }
          const a = f * 0.6;
          const L = Math.min(1, b.load * 1.25);
          const c = b.c;
          area += f;
          if (S.wetT[i] > S.now) {
            // wet into wet: the paints mix, and the bristle picks some up (added up, mixed in once per dab)
            sr += S.col[o] * f; sg += S.col[o + 1] * f; sb += S.col[o + 2] * f; sw += f;
            km(S.col, o, c[0], c[1], c[2], a * L * cover);
          } else {
            lerp3(S.col, o, c[0], c[1], c[2], a * L * cover);
          }
          const target = b.th * L;
          S.imp[i] += (target - S.imp[i]) * a * 0.55;
          if (S.imp[i] > 1.4) S.imp[i] = 1.4;
          S.wetT[i] = S.now + dryT;
          if (a * L > 0.15) S.top[i] = medium;
        }
      }
      if (sw > 0) km(b.c, 0, sr / sw, sg / sw, sb / sw, 0.05 * sw / area);
    }
    if (bx1 >= bx0) markDirty(bx0 - 1, by0 - 1, bx1 + 1, by1 + 1);
  }
  // palette knife: a flat blade that lays a smooth slab, or scrapes and smears when it runs dry
  function knifeStamp(st, x, y) {
    const oil = st.m === 'oil';
    const R = st.size * 1.1, Wd = Math.max(1.5, st.size * 0.22);
    const px = -st.dy, py = st.dx;
    st.load = Math.max(0, 1 - st.travel / (st.reach || (st.reach = 320 + st.amt * 520)));
    const ext = R + Wd;
    const x0 = Math.max(0, Math.floor(x - ext)), x1 = Math.min(PW - 1, Math.ceil(x + ext));
    const y0 = Math.max(0, Math.floor(y - ext)), y1 = Math.min(PH - 1, Math.ceil(y + ext));
    const kc = st.kc, L = st.load;
    const slab = (oil ? 0.3 + st.amt * 0.7 : 0.2 + st.amt * 0.35) * L;
    let sr = 0, sg = 0, sb = 0, sw = 0, area = 0;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - x, oy = yy + 0.5 - y;
        const u = (ox * px + oy * py) / R, v = (ox * st.dx + oy * st.dy) / Wd;
        if (u * u >= 1 || v * v >= 1) continue;
        const i = yy * PW + xx, o = i * 3;
        const f = (1 - Math.pow(Math.abs(u), 10)) * 0.7;
        const wet = S.wetT[i] > S.now;
        const cr = S.col[o], cg = S.col[o + 1], cb = S.col[o + 2];
        if (wet) km(S.col, o, kc[0], kc[1], kc[2], f * (0.25 + 0.75 * L));
        else lerp3(S.col, o, kc[0], kc[1], kc[2], f * L);
        area += f;
        if (wet) { sr += cr * f; sg += cg * f; sb += cb * f; sw += f; }
        S.imp[i] += (Math.max(slab, wet ? S.imp[i] * 0.4 : 0) - S.imp[i]) * f * 0.8;
        if (L > 0.05) { S.wetT[i] = S.now + (oil ? 240 : 5); if (f * L > 0.2) S.top[i] = oil ? OIL : ACRYLIC; }
      }
    }
    if (sw > 0) km(kc, 0, sr / sw, sg / sw, sb / sw, 0.08 * sw / area);
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  // ---- smudge (BLEND brush, finger): drags a pick-up of the colour along
  function smudgeable(i) {
    if (S.wetT[i] > S.now) return 0.95;
    if (S.top[i] === CRAYON) return 0.8;
    return 0.06;
  }
  function smudgeStamp(st, x, y, strength) {
    const R = Math.max(2, Math.round(st.size)), D = R * 2 + 1;
    const cx = Math.round(x), cy = Math.round(y);
    if (!st.smudge) {
      st.smudge = { c: new Float32Array(D * D * 3), h: new Float32Array(D * D), wt: new Float32Array(D * D), D, R, ok: new Uint8Array(D * D) };
      for (let j = 0; j < D; j++) for (let k = 0; k < D; k++) {
        const xx = cx + k - R, yy = cy + j - R, q = j * D + k;
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
        const i = yy * PW + xx;
        st.smudge.c[q * 3] = S.col[i * 3]; st.smudge.c[q * 3 + 1] = S.col[i * 3 + 1]; st.smudge.c[q * 3 + 2] = S.col[i * 3 + 2];
        st.smudge.h[q] = S.imp[i]; st.smudge.wt[q] = smudgeable(i); st.smudge.ok[q] = 1;
      }
      return;
    }
    const sm = st.smudge, Rs = sm.R, Ds = sm.D;
    for (let j = 0; j < Ds; j++) {
      for (let k = 0; k < Ds; k++) {
        const ox = k - Rs, oy = j - Rs, d2 = (ox * ox + oy * oy) / (Rs * Rs);
        if (d2 >= 1) continue;
        const xx = cx + ox, yy = cy + oy;
        if (xx < 0 || yy < 0 || xx >= PW || yy >= PH) continue;
        const q = j * Ds + k;
        if (!sm.ok[q]) continue;
        const i = yy * PW + xx, o = i * 3, sd = smudgeable(i), f = (1 - d2) * strength * sm.wt[q] * (0.3 + 0.7 * sd);
        const cr = S.col[o], cg = S.col[o + 1], cb = S.col[o + 2], ch = S.imp[i];
        lerp3(S.col, o, sm.c[q * 3], sm.c[q * 3 + 1], sm.c[q * 3 + 2], f);
        S.imp[i] += (sm.h[q] - S.imp[i]) * f * 0.7;
        const g = 0.22 * (1 - d2);
        sm.c[q * 3] += (cr - sm.c[q * 3]) * g; sm.c[q * 3 + 1] += (cg - sm.c[q * 3 + 1]) * g; sm.c[q * 3 + 2] += (cb - sm.c[q * 3 + 2]) * g;
        sm.h[q] += (ch - sm.h[q]) * g; sm.wt[q] += (sd - sm.wt[q]) * g;
      }
    }
    markDirty(cx - Rs - 1, cy - Rs - 1, cx + Rs + 1, cy + Rs + 1);
  }

  // ---- marker: see-through ink; one pass per stroke so the stroke is even, overlapping strokes get darker
  function markerStamp(st, x, y, R0, gain) {
    const tool = st.tool, ab = S.ground.absorb;
    const ink = 0.35 + st.amt * 0.65;
    let R = R0;
    if (tool === 'fine') R = Math.max(1, R0 * 0.45);
    if (tool === 'brush') {
      const sp = st.lastSpeed || 0;
      R = Math.max(1, R0 * (1.15 - Math.min(0.75, sp / 900)));
    }
    const chisel = tool === 'chisel';
    const Lr = chisel ? R * 1.25 : R, Wr = chisel ? Math.max(1, R * 0.3) : R;
    const ext = Lr + 3;
    const x0 = Math.max(0, Math.floor(x - ext)), x1 = Math.min(PW - 1, Math.ceil(x + ext));
    const y0 = Math.max(0, Math.floor(y - ext)), y1 = Math.min(PH - 1, Math.ceil(y + ext));
    const lr = Math.log(Math.max(0.03, 1 - (1 - st.rgb[0]) * 0.95)), lg = Math.log(Math.max(0.03, 1 - (1 - st.rgb[1]) * 0.95)),
      lb = Math.log(Math.max(0.03, 1 - (1 - st.rgb[2]) * 0.95));
    const C = 0.70710678;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - x, oy = yy + 0.5 - y;
        let d;
        if (chisel) { const u = (ox + oy) * C, v = (oy - ox) * C; d = Math.max(Math.abs(u) / Lr, Math.abs(v) / Wr) * Lr; }
        else d = Math.sqrt(ox * ox + oy * oy);
        const bleed = ab * 1.6 * (vn(xx / 2.5, yy / 2.5) - 0.25);          // ink creeps along paper fibres
        let f = clamp01(Lr + bleed - d + 0.5) * gain;
        if (f <= 0) continue;
        const i = yy * PW + xx, m = S.mask[i] / 255;
        f *= 1 - S.ground.tooth * 0.22 * (1 - S.gH[i]);                    // a little paper texture shows
        if (ink < 0.75) f *= clamp01(1 - (0.75 - ink) * 3 * vn(xx / 1.3 + st.t0, yy / 9));   // a drying-out marker streaks
        if (f <= m) continue;
        const k = (f - m) * ink * (S.top[i] === CRAYON ? 0.25 : 1);
        const o = i * 3;
        S.col[o] *= Math.exp(lr * k); S.col[o + 1] *= Math.exp(lg * k); S.col[o + 2] *= Math.exp(lb * k);
        S.mask[i] = Math.round(f * 255);
        if (S.top[i] !== CRAYON && S.top[i] !== OIL) S.top[i] = MARKER;
      }
    }
    markDirty(x0, y0, x1, y1);
  }

  // ---- oil crayon (oil pastel): waxy, opaque, skips the paper's dips until you press harder or go over it again
  function crayonStamp(st, x, y, pr) {
    const R = st.size;
    const press = 0.25 + st.amt * 0.75;
    const tooth = S.ground.tooth;
    const ext = R + 2;
    const x0 = Math.max(0, Math.floor(x - ext)), x1 = Math.min(PW - 1, Math.ceil(x + ext));
    const y0 = Math.max(0, Math.floor(y - ext)), y1 = Math.min(PH - 1, Math.ceil(y + ext));
    const c = st.rgb;
    for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - x, oy = yy + 0.5 - y;
        const rr = R * (0.85 + 0.25 * vn(xx * 0.35, yy * 0.35 + 40));
        const d = Math.sqrt(ox * ox + oy * oy);
        if (d > rr + 0.5) continue;
        let f = clamp01(rr + 0.5 - d);
        const i = yy * PW + xx, o = i * 3;
        const surf = 1 - tooth * (1 - S.gH[i]) + S.build[i] * 0.55;
        const thr = 0.8 - press * 0.62 - (pr - 0.5) * 0.2;
        f *= clamp01((surf - thr) * 5) * (0.78 + 0.22 * vn(xx / 1.4 + 90, yy / 1.4));
        if (f <= 0.01) continue;
        if (S.top[i] === CRAYON) km(S.col, o, c[0], c[1], c[2], f * 0.55);   // crayon over crayon blends a bit
        else lerp3(S.col, o, c[0], c[1], c[2], f * 0.92);
        S.build[i] = Math.min(1, S.build[i] + f * 0.12 * press);
        S.imp[i] = Math.min(0.5, S.imp[i] + f * 0.035);
        if (f > 0.3) S.top[i] = CRAYON;
      }
    }
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  // ---- spray paint: time based, a cloud of dots; too much in one spot runs as a drip
  function sprayTick(st, dt) {
    const far = st.amt;                                   // 0 = close, 1 = far
    const R = st.size;
    const sigma = R * (0.35 + far * 0.95);
    const n = Math.round((2200 + R * 150) * dt * (1 - far * 0.35));
    const c = st.rgb;
    let bx0 = PW, by0 = PH, bx1 = 0, by1 = 0;
    for (let k = 0; k < n; k++) {
      let u = Math.random(); if (u < 1e-6) u = 1e-6;
      const mag = Math.sqrt(-2 * Math.log(u)) * sigma * 0.55, a = Math.random() * 6.283;
      const cx = st.x + Math.cos(a) * mag, cy = st.y + Math.sin(a) * mag;
      const rr = (0.55 + Math.random() * 1.25) * (1 - far * 0.3);
      const alpha = (0.45 + Math.random() * 0.45) * (1 - far * 0.45);
      const x0 = Math.max(0, Math.floor(cx - rr)), x1 = Math.min(PW - 1, Math.ceil(cx + rr));
      const y0 = Math.max(0, Math.floor(cy - rr)), y1 = Math.min(PH - 1, Math.ceil(cy + rr));
      if (x1 < x0 || y1 < y0) continue;
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - cx, oy = yy + 0.5 - cy, d = Math.sqrt(ox * ox + oy * oy);
        const f = clamp01(rr + 0.5 - d);
        if (f <= 0) continue;
        const i = yy * PW + xx;
        lerp3(S.col, i * 3, c[0], c[1], c[2], f * alpha);
        S.build[i] = Math.min(1, S.build[i] + f * alpha * 0.02);
        S.wetT[i] = S.now + 2.5;
        S.top[i] = SPRAY;
      }
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    }
    // the fine mist between the dots
    {
      const mr = sigma * 1.3, inv = 1 / (2 * (sigma * 0.5) * (sigma * 0.5));
      const ma = Math.min(0.5, 2.6 * dt * (1 - far * 0.55));
      const x0 = Math.max(0, Math.floor(st.x - mr)), x1 = Math.min(PW - 1, Math.ceil(st.x + mr));
      const y0 = Math.max(0, Math.floor(st.y - mr)), y1 = Math.min(PH - 1, Math.ceil(st.y + mr));
      for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
        const ox = xx + 0.5 - st.x, oy = yy + 0.5 - st.y, d2 = ox * ox + oy * oy;
        const f = ma * Math.exp(-d2 * inv);
        if (f < 0.004) continue;
        const i = yy * PW + xx;
        lerp3(S.col, i * 3, c[0], c[1], c[2], f);
        if (f > 0.05) { S.wetT[i] = S.now + 2.5; S.top[i] = SPRAY; }
      }
      if (x0 < bx0) bx0 = x0; if (y0 < by0) by0 = y0; if (x1 > bx1) bx1 = x1; if (y1 > by1) by1 = y1;
    }
    if (bx1 >= bx0) markDirty(bx0, by0, bx1, by1);
    // paint pooling: holding still and close builds up until it runs
    const gx = Math.floor(st.x / 16), gy = Math.floor(st.y / 16), GW = PW >> 4;
    if (gx >= 0 && gy >= 0 && gx < GW && gy < (PH >> 4)) {
      const q = gy * GW + gx;
      S.pool[q] += dt * (1 - far) * (1 - far) * (24 / Math.max(10, R)) * 1.1;
      if (S.pool[q] > 1) {
        S.pool[q] = 0.35;
        S.drips.push({ x: st.x + (Math.random() - 0.5) * R * 0.6, y: st.y + Math.random() * R * 0.3, vol: 0.7 + Math.random() * 0.8,
          wd: 1.1 + Math.random() * 1.4, v: 30 + Math.random() * 30, c: c.slice(), wob: Math.random() * 6 });
      }
    }
  }
  function dripTick(dt) {
    for (let k = S.drips.length - 1; k >= 0; k--) {
      const d = S.drips[k];
      const step = d.v * dt * (0.25 + d.vol);
      const y0 = d.y, y1 = Math.min(PH - 1, d.y + step);
      for (let y = y0; y <= y1; y += 0.5) {
        const x = d.x + Math.sin(y * 0.05 + d.wob) * 0.6;
        disc(x, y, d.wd * (0.7 + 0.3 * Math.min(1, d.vol)), d.c, 0.85);
      }
      d.y = y1;
      d.vol -= step * 0.006 + dt * 0.08;
      if (d.vol <= 0 || d.y >= PH - 1) {
        disc(d.x, d.y + 1, d.wd * 1.5, d.c, 0.95);   // the drop at the end
        S.drips.splice(k, 1);
      }
    }
  }
  function disc(cx, cy, r, c, alpha) {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(PW - 1, Math.ceil(cx + r));
    const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(PH - 1, Math.ceil(cy + r));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const ox = xx + 0.5 - cx, oy = yy + 0.5 - cy, f = clamp01(r + 0.5 - Math.sqrt(ox * ox + oy * oy));
      if (f <= 0) continue;
      const i = yy * PW + xx;
      lerp3(S.col, i * 3, c[0], c[1], c[2], f * alpha);
      S.imp[i] = Math.min(0.5, S.imp[i] + f * 0.04); S.wetT[i] = S.now + 2.5; S.top[i] = SPRAY;
    }
    markDirty(x0 - 1, y0 - 1, x1 + 1, y1 + 1);
  }

  // ---------------------------------------------------------------- washes
  // FLAT, GRADED (fades to clear), TWO-COLOUR (one colour melts into the other), WET (clear water first, for
  // wet-in-wet). Laid band by band from the top, the way a painter pulls a wash down the page.
  function washRect(x0, y0, x1, y1, mode, rgb, rgb2, amount) {
    endStroke(); snapshot(); S.changed = true;
    const cx0 = Math.max(0, Math.floor(Math.min(x0, x1) / 2)), cx1 = Math.min(CW - 1, Math.floor(Math.max(x0, x1) / 2));
    const cy0 = Math.max(0, Math.floor(Math.min(y0, y1) / 2)), cy1 = Math.min(CH - 1, Math.floor(Math.max(y0, y1) / 2));
    if (cx1 - cx0 < 2 || cy1 - cy0 < 2) return;
    S.wash = { x0: cx0, y0: cy0, x1: cx1, y1: cy1, row: cy0, mode, a: rgb.slice(), b: (rgb2 || rgb).slice(), amt: amount, seed: Math.random() * 100 };
  }
  function washTick(dt) {
    const W = S.wash;
    const rows = Math.max(2, Math.ceil(dt * 260));
    const end = Math.min(W.y1, W.row + rows);
    const conc = 0.1 + W.amt * 1.0;
    for (let y = W.row; y <= end; y++) {
      const t = (y - W.y0) / Math.max(1, W.y1 - W.y0);
      let c0, c1, c2, k = conc;
      if (W.mode === 'two') {
        c0 = W.a[0] + (W.b[0] - W.a[0]) * t; c1 = W.a[1] + (W.b[1] - W.a[1]) * t; c2 = W.a[2] + (W.b[2] - W.a[2]) * t;
      } else { c0 = W.a[0]; c1 = W.a[1]; c2 = W.a[2]; }
      if (W.mode === 'graded') k = conc * Math.pow(1 - t, 1.3);
      const A0 = dens(c0) * k, A1 = dens(c1) * k, A2 = dens(c2) * k;
      const wob = (vn(y * 0.3, W.seed) - 0.5) * 3;
      for (let x = W.x0; x <= W.x1; x++) {
        if (x === W.x0 && wob > 0.8) continue;
        if (x === W.x1 && wob < -0.8) continue;
        const i = y * CW + x, j = i * 3;
        const wt = 0.95 + (y === W.y1 ? 0.5 : 0);        // the bead of water at the bottom
        if (S.w[i] < wt) S.w[i] = wt;
        if (W.mode !== 'water') {
          S.p[j] += (A0 - S.p[j]) * 0.85; S.p[j + 1] += (A1 - S.p[j + 1]) * 0.85; S.p[j + 2] += (A2 - S.p[j + 2]) * 0.85;
        }
      }
    }
    growBox('wc', W.x0, W.row, W.x1, end);
    markDirty(W.x0 * 2 - 4, W.row * 2 - 4, W.x1 * 2 + 5, end * 2 + 5);
    W.row = end + 1;
    if (W.row > W.y1) S.wash = null;
  }

  // ---------------------------------------------------------------- watercolour simulation (fixed 1/30 s steps)
  function wcStep(dt) {
    const b = S.wc; if (!b) return;
    const g = S.ground, ab = g.absorb;
    const x0 = Math.max(0, b.x0 - 1), y0 = Math.max(0, b.y0 - 1), x1 = Math.min(CW - 1, b.x1 + 1), y1 = Math.min(CH - 1, b.y1 + 1);
    const w = S.w, p = S.p, cg = S.cg, dw = S.dw, dp = S.dp;
    const flowK = 0.14 + (1 - ab) * 0.1;
    const frontK = 0.04 + ab * 0.14;
    const G = 0.05 * g.depth;
    const edge = S.edge;
    const tilt = S.tilt ? 0.06 : 0;
    for (let y = y0; y <= y1; y++) {
      const r = y * CW; dw.fill(0, r + x0, r + x1 + 1); dp.fill(0, (r + x0) * 3, (r + x1 + 1) * 3);
      for (let x = x0; x <= x1; x++) {
        const i = r + x;
        edge[i] = w[i] >= WET && ((x > 0 && w[i - 1] < WET) || (x < CW - 1 && w[i + 1] < WET) || (y > 0 && w[i - CW] < WET) || (y < CH - 1 && w[i + CW] < WET)) ? 1 : 0;
      }
    }
    const EK = 0.016, PD = 0.07;
    // one pass over right and down neighbours; water runs from high (water + paper height) to low
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * CW + x, wi = w[i];
        for (let side = 0; side < 2; side++) {
          let j;
          if (side === 0) { if (x === x1) continue; j = i + 1; } else { if (y === y1) continue; j = i + CW; }
          const wj = w[j];
          if (wi < 1e-4 && wj < 1e-4) continue;
          if (wi > 0.12 && wj > 0.12) {
            // wet-in-wet: pigment wanders through the water on its own -- soft, feathery blooms
            const k = PD * Math.min(1, Math.min(wi, wj) * 1.4), a = i * 3, b2 = j * 3;
            const m0 = (p[a] - p[b2]) * k, m1 = (p[a + 1] - p[b2 + 1]) * k, m2 = (p[a + 2] - p[b2 + 2]) * k;
            dp[a] -= m0; dp[a + 1] -= m1; dp[a + 2] -= m2; dp[b2] += m0; dp[b2 + 1] += m1; dp[b2 + 2] += m2;
          }
          if (edge[i] !== edge[j] && wi >= 0.2 && wj >= 0.2) {
            // edge darkening: pigment drifts from the wet middle out to the drying rim
            const from = edge[i] ? j : i, to = edge[i] ? i : j, a = from * 3, b2 = to * 3;
            const m0 = p[a] * EK, m1 = p[a + 1] * EK, m2 = p[a + 2] * EK;
            dp[a] -= m0; dp[a + 1] -= m1; dp[a + 2] -= m2; dp[b2] += m0; dp[b2 + 1] += m1; dp[b2 + 2] += m2;
          }
          let d = (wi + cg[i] * G) - (wj + cg[j] * G);
          if (side === 1) d += tilt * (wi > WET || wj > WET ? 1 : 0) * (wi > wj ? 1 : -0.2);
          let flux;
          if (d > 0) {
            let k = flowK;
            if (wj < WET) { if (wi < 0.3) continue; k *= frontK * (1.25 - cg[j]) * (0.5 + vn(x * 0.3, y * 0.3)); }
            flux = k * d; if (flux > wi * 0.22) flux = wi * 0.22;
          } else {
            let k = flowK;
            if (wi < WET) { if (wj < 0.3) continue; k *= frontK * (1.25 - cg[i]) * (0.5 + vn(x * 0.3, y * 0.3)); }
            flux = k * d; if (flux < -wj * 0.22) flux = -wj * 0.22;
          }
          if (flux === 0) continue;
          const src = flux > 0 ? i : j, ws = w[src];
          dw[i] -= flux; dw[j] += flux;
          if (ws > 1e-5) {
            const s = flux / ws, a = src * 3;
            const m0 = p[a] * s, m1 = p[a + 1] * s, m2 = p[a + 2] * s;
            dp[i * 3] -= m0; dp[i * 3 + 1] -= m1; dp[i * 3 + 2] -= m2;
            dp[j * 3] += m0; dp[j * 3 + 1] += m1; dp[j * 3 + 2] += m2;
          }
        }
      }
    }
    // evaporate (edges first), settle pigment, find the new active box
    const evap = (0.06 + ab * 0.1) * dt * (S.dryBoost > 0 ? 25 : 1);
    const depR = (0.03 + ab * 0.08) * dt * (S.dryBoost > 0 ? 6 : 1);
    let nx0 = CW, ny0 = CH, nx1 = -1, ny1 = -1, dx0 = CW, dy0 = CH, dx1 = -1, dy1 = -1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const i = y * CW + x, j = i * 3;
        let wi = w[i] + dw[i];
        let p0 = p[j] + dp[j], p1 = p[j + 1] + dp[j + 1], p2 = p[j + 2] + dp[j + 2];
        if (p0 < 0) p0 = 0; if (p1 < 0) p1 = 0; if (p2 < 0) p2 = 0;
        if (wi > 0) {
          let nd = 0;
          if (x > 0 && w[i - 1] < WET) nd++; if (x < CW - 1 && w[i + 1] < WET) nd++;
          if (y > 0 && w[i - CW] < WET) nd++; if (y < CH - 1 && w[i + CW] < WET) nd++;
          wi -= evap * (1 + nd * 1.2);
        }
        let k;
        if (wi <= 0.004) { wi = 0; k = 1; } else { k = depR * (1 + (wi < 0.2 ? (0.2 - wi) * 20 : 0)); if (k > 1) k = 1; }
        w[i] = wi;
        if (p0 + p1 + p2 > 1e-5) {
          const d0 = p0 * k, d1 = p1 * k, d2 = p2 * k;
          S.dep[j] += d0; S.dep[j + 1] += d1; S.dep[j + 2] += d2;
          p0 -= d0; p1 -= d1; p2 -= d2;
          if (x < dx0) dx0 = x; if (x > dx1) dx1 = x; if (y < dy0) dy0 = y; if (y > dy1) dy1 = y;
        } else { p0 = p1 = p2 = 0; }
        p[j] = p0; p[j + 1] = p1; p[j + 2] = p2;
        if (wi > 0 || p0 + p1 + p2 > 1e-5) { if (x < nx0) nx0 = x; if (x > nx1) nx1 = x; if (y < ny0) ny0 = y; if (y > ny1) ny1 = y; }
      }
    }
    // salt crystals drink the water around them and push pigment out into little stars
    for (let k2 = S.salt.length - 1; k2 >= 0; k2--) {
      const s = S.salt[k2];
      const sx = s.x | 0, sy = s.y | 0;
      s.life -= dt;
      if (s.life <= 0 || sx < 5 || sy < 5 || sx >= CW - 5 || sy >= CH - 5) { S.salt.splice(k2, 1); continue; }
      const c = sy * CW + sx;
      if (w[c] < 0.08) { if (w[c] < 0.01) S.salt.splice(k2, 1); continue; }
      // a star-shaped patch: the crystal soaks up pigment-laden water, a little is pushed to the rim
      for (let oy = -4; oy <= 4; oy++) for (let ox = -4; ox <= 4; ox++) {
        const d = Math.sqrt(ox * ox + oy * oy), ang = Math.atan2(oy, ox);
        const rr = s.s * (0.8 + 0.35 * Math.cos(ang * 5 + s.ph));
        if (d >= rr) continue;
        const i = c + oy * CW + ox, j = i * 3;
        if (i < 0 || i >= CN) continue;
        const tx = Math.round(sx + Math.cos(ang) * (rr + 0.7)), ty = Math.round(sy + Math.sin(ang) * (rr + 0.7));
        const t = (ty * CW + tx) * 3, m = 0.16 * (1 - d / rr * 0.5);
        if (t >= 0 && t < CN * 3) { p[t] += p[j] * m * 0.3; p[t + 1] += p[j + 1] * m * 0.3; p[t + 2] += p[j + 2] * m * 0.3; }
        p[j] *= 1 - m; p[j + 1] *= 1 - m; p[j + 2] *= 1 - m;
      }
    }
    if (nx1 < 0) S.wc = null; else S.wc = { x0: nx0, y0: ny0, x1: nx1, y1: ny1 };
    if (dx1 >= 0) growBox('depBox', dx0, dy0, dx1, dy1);
    markDirty(x0 * 2 - 4, y0 * 2 - 4, x1 * 2 + 5, y1 * 2 + 5);
  }
  // settled pigment -> the picture, smoothly upsampled, darker in the paper's dips (granulation);
  // wax crayon and oil paint push the watercolour away (wax resist)
  function bake() {
    const b = S.depBox; if (!b) return;
    S.depBox = null;
    const gr = S.ground.gran * 0.55, dep = S.dep;
    const px0 = Math.max(0, b.x0 * 2 - 3), px1 = Math.min(PW - 1, b.x1 * 2 + 4);
    const py0 = Math.max(0, b.y0 * 2 - 3), py1 = Math.min(PH - 1, b.y1 * 2 + 4);
    for (let y = py0; y <= py1; y++) {
      for (let x = px0; x <= px1; x++) {
        const i = y * PW + x;
        let fx = x * 0.5 - 0.25 + JX[i], fy = y * 0.5 - 0.25 + JY[i];
        if (fx < 0) fx = 0; else if (fx > CW - 1.001) fx = CW - 1.001;
        if (fy < 0) fy = 0; else if (fy > CH - 1.001) fy = CH - 1.001;
        const cx0 = fx | 0, cy0 = fy | 0, tx = fx - cx0, ty = fy - cy0, cx1 = cx0 + 1, cy1 = cy0 + 1;
        const a = (cy0 * CW + cx0) * 3, bq = (cy0 * CW + cx1) * 3, c = (cy1 * CW + cx0) * 3, d = (cy1 * CW + cx1) * 3;
        const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wc = (1 - tx) * ty, wd = tx * ty;
        let D0 = dep[a] * wa + dep[bq] * wb + dep[c] * wc + dep[d] * wd;
        let D1 = dep[a + 1] * wa + dep[bq + 1] * wb + dep[c + 1] * wc + dep[d + 1] * wd;
        let D2 = dep[a + 2] * wa + dep[bq + 2] * wb + dep[c + 2] * wc + dep[d + 2] * wd;
        if (D0 + D1 + D2 < 1e-6) continue;
        const o = i * 3;
        let m = 1 + gr * (0.5 - S.gH[i]);
        const tp = S.top[i];
        if (tp === CRAYON) m *= 0.12; else if (tp === OIL) m *= 0.35; else if (tp === ACRYLIC) m *= 0.7;
        if (m < 0) m = 0;
        S.col[o] *= ex(D0 * m); S.col[o + 1] *= ex(D1 * m); S.col[o + 2] *= ex(D2 * m);
      }
    }
    for (let y = b.y0; y <= b.y1; y++) S.dep.fill(0, (y * CW + b.x0) * 3, (y * CW + b.x1 + 1) * 3);
    markDirty(px0, py0, px1, py1);
  }

  // ---------------------------------------------------------------- frame
  function frame(dt) {
    if (dt > 0.1) dt = 0.1;
    S.now += dt;
    if (S.dryBoost > 0) S.dryBoost -= dt;
    const st = S.stroke;
    if (st) {
      const sp = Math.hypot(st.x - st.px, st.y - st.py) / Math.max(dt, 1e-3);
      st.lastSpeed = (st.lastSpeed || 0) * 0.7 + sp * 0.3;
      st.px = st.x; st.py = st.y;
      if (st.m === 'spray') sprayTick(st, dt);
      if (st.m === 'marker' && sp < 4) {
        // a marker held still keeps soaking into the paper
        st.still += dt;
        if (st.still > 0.15) {
          markerBleed(st);
        }
      }
    }
    for (let q = 0; q < S.pool.length; q++) if (S.pool[q] > 0) S.pool[q] = Math.max(0, S.pool[q] - dt * 0.35);
    if (S.drips.length) dripTick(dt);
    if (S.wash) washTick(dt);
    S.simAcc += dt;
    let n = 0;
    while (S.simAcc >= 1 / 30 && n < 3) { S.simAcc -= 1 / 30; n++; wcStep(1 / 30); }
    if (n === 3) S.simAcc = 0;
    if (n) bake();
    render();
  }
  function markerBleed(st) {
    const ab = S.ground.absorb;
    const grow = Math.min(st.size * 1.4, (st.still - 0.15) * (2 + ab * 14));
    const R = (st.tool === 'fine' ? Math.max(1, st.size * 0.45) : st.size) + grow;
    // a soft extra ring, lighter than the stroke
    const x = st.x, y = st.y, ext = R + 2;
    const x0 = Math.max(0, Math.floor(x - ext)), x1 = Math.min(PW - 1, Math.ceil(x + ext));
    const y0 = Math.max(0, Math.floor(y - ext)), y1 = Math.min(PH - 1, Math.ceil(y + ext));
    const ink = 0.35 + st.amt * 0.65;
    const lr = Math.log(Math.max(0.03, 1 - (1 - st.rgb[0]) * 0.95)), lg = Math.log(Math.max(0.03, 1 - (1 - st.rgb[1]) * 0.95)),
      lb = Math.log(Math.max(0.03, 1 - (1 - st.rgb[2]) * 0.95));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const ox = xx + 0.5 - x, oy = yy + 0.5 - y;
      const d = Math.sqrt(ox * ox + oy * oy) - ab * 2.5 * (vn(xx / 2.5, yy / 2.5) - 0.3);
      const f = clamp01((R - d) / Math.max(1, grow * 0.6 + 1)) * 0.75;
      const i = yy * PW + xx, m = S.mask[i] / 255;
      if (f <= m) continue;
      const k = (f - m) * ink, o = i * 3;
      S.col[o] *= Math.exp(lr * k); S.col[o + 1] *= Math.exp(lg * k); S.col[o + 2] *= Math.exp(lb * k);
      S.mask[i] = Math.round(f * 255);
    }
    markDirty(x0, y0, x1, y1);
  }

  // ---------------------------------------------------------------- render (only the dirty box)
  const LX = -0.55, LY = -0.83;
  const HB = (v) => (v > 0.6 ? 0.1 : 1 - v * 1.5);
  function render(full) {
    if (!ctx) return;
    let d = S.dirty;
    if (full) d = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
    if (!d) return;
    S.dirty = null;
    const GD = S.ground.depth * 0.55, ID = 1.25;
    const gH = S.gH, imp = S.imp, col = S.col, wetT = S.wetT, top = S.top, now = S.now;
    const wc = S.wc, w = S.w, p = S.p;
    for (let y = d.y0; y <= d.y1; y++) {
      const ym = y > 0 ? -PW : 0, yp = y < PH - 1 ? PW : 0;
      const inWcY = wc && (y >> 1) >= wc.y0 - 2 && (y >> 1) <= wc.y1 + 2;
      for (let x = d.x0; x <= d.x1; x++) {
        const i = y * PW + x, o = i * 3;
        const xm = x > 0 ? -1 : 0, xp = x < PW - 1 ? 1 : 0;
        // thick paint buries the ground's texture
        const hxp = gH[i + xp] * GD * HB(imp[i + xp]) + imp[i + xp] * ID, hxm = gH[i + xm] * GD * HB(imp[i + xm]) + imp[i + xm] * ID;
        const hyp = gH[i + yp] * GD * HB(imp[i + yp]) + imp[i + yp] * ID, hym = gH[i + ym] * GD * HB(imp[i + ym]) + imp[i + ym] * ID;
        const gx = hxp - hxm, gy = hyp - hym;
        const lam = -(gx * LX + gy * LY);
        let shade = 1 + lam * 0.55;
        if (shade < 0.55) shade = 0.55; else if (shade > 1.45) shade = 1.45;
        let r = col[o] * shade, g = col[o + 1] * shade, b = col[o + 2] * shade;
        let gloss = 0;
        const tp = top[i];
        if (wetT[i] > now) gloss = tp === OIL ? 0.32 : tp === ACRYLIC ? 0.22 : 0.12;
        else if (tp === OIL) gloss = 0.1;
        else if (tp === CRAYON) gloss = 0.08;
        if (inWcY && (x >> 1) >= wc.x0 - 2 && (x >> 1) <= wc.x1 + 2) {
          let fx = x * 0.5 - 0.25 + JX[i], fy = y * 0.5 - 0.25 + JY[i];
          if (fx < 0) fx = 0; else if (fx > CW - 1.001) fx = CW - 1.001;
          if (fy < 0) fy = 0; else if (fy > CH - 1.001) fy = CH - 1.001;
          const cx0 = fx | 0, cy0 = fy | 0, tx = fx - cx0, ty = fy - cy0, cx1 = cx0 + 1, cy1 = cy0 + 1;
          const a = cy0 * CW + cx0, bq = cy0 * CW + cx1, c = cy1 * CW + cx0, dd = cy1 * CW + cx1;
          const wa = (1 - tx) * (1 - ty), wb = tx * (1 - ty), wcw = (1 - tx) * ty, wd = tx * ty;
          const wv = w[a] * wa + w[bq] * wb + w[c] * wcw + w[dd] * wd;
          if (wv > 0.001) {
            const P0 = p[a * 3] * wa + p[bq * 3] * wb + p[c * 3] * wcw + p[dd * 3] * wd;
            const P1 = p[a * 3 + 1] * wa + p[bq * 3 + 1] * wb + p[c * 3 + 1] * wcw + p[dd * 3 + 1] * wd;
            const P2 = p[a * 3 + 2] * wa + p[bq * 3 + 2] * wb + p[c * 3 + 2] * wcw + p[dd * 3 + 2] * wd;
            const damp = 1 - Math.min(1, wv * 2) * 0.07;          // wet paper looks a touch darker
            r *= ex(P0 * 1.12) * damp; g *= ex(P1 * 1.12) * damp; b *= ex(P2 * 1.12) * damp;
            gloss = Math.max(gloss, Math.min(1, wv * 1.5) * 0.3);
          }
        }
        if (gloss > 0 && lam > 0) { const s = gloss * lam * lam * 1.6; r += s; g += s; b += s; }
        r = r < 0 ? 0 : r > 1 ? 255 : r * 255; g = g < 0 ? 0 : g > 1 ? 255 : g * 255; b = b < 0 ? 0 : b > 1 ? 255 : b * 255;
        buf[i] = 0xff000000 | (b << 16) | (g << 8) | r;
      }
    }
    ctx.putImageData(img, 0, 0, d.x0, d.y0, d.x1 - d.x0 + 1, d.y1 - d.y0 + 1);
  }

  // ---------------------------------------------------------------- misc API
  function attach(cv) {
    canvas = cv; cv.width = PW; cv.height = PH;
    ctx = cv.getContext('2d');
    img = ctx.createImageData(PW, PH);
    buf = new Uint32Array(img.data.buffer);
    S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
  }
  function dryAll() {
    S.dryBoost = 1.6;
    for (let i = 0; i < N; i++) if (S.wetT[i] > S.now) S.wetT[i] = S.now;
    S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 };
  }
  function wetness() {
    // 0..1-ish: is anything still wet? (for the DRY button glow)
    if (S.wc || S.wash || S.drips.length) return 1;
    return 0;
  }
  function pick(x, y) {
    x = Math.max(0, Math.min(PW - 1, x | 0)); y = Math.max(0, Math.min(PH - 1, y | 0));
    const o = (y * PW + x) * 3;
    return [S.col[o], S.col[o + 1], S.col[o + 2]];
  }
  // previews for the NEW PICTURE cards: a lit swatch of the ground
  function preview(id, cv, sc) {
    const g = GROUND_BY[id]; if (!g) return;
    const w = cv.width, h = cv.height, c2 = cv.getContext('2d'), im = c2.createImageData(w, h), b32 = new Uint32Array(im.data.buffer);
    seedNoise(11);
    sc = sc || 0.7;
    const hh = new Float32Array(w * h), rgb = new Float32Array(w * h * 3), o = {};
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      sampleGround(g, x / sc, y / sc, o); hh[i] = o.h; rgb[i * 3] = o.r; rgb[i * 3 + 1] = o.g; rgb[i * 3 + 2] = o.b;
    }
    const GD = g.depth * 0.55 / sc;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      const gx = (hh[Math.min(w - 1, x + 1) + y * w] - hh[Math.max(0, x - 1) + y * w]) * GD;
      const gy = (hh[x + Math.min(h - 1, y + 1) * w] - hh[x + Math.max(0, y - 1) * w]) * GD;
      let s = 1 - (gx * LX + gy * LY) * 0.55; s = Math.max(0.55, Math.min(1.45, s));
      const r = Math.min(255, rgb[i * 3] * s * 255) | 0, gg = Math.min(255, rgb[i * 3 + 1] * s * 255) | 0, bb = Math.min(255, rgb[i * 3 + 2] * s * 255) | 0;
      b32[i] = 0xff000000 | (bb << 16) | (gg << 8) | r;
    }
    c2.putImageData(im, 0, 0);
    seedNoise(S.seed * 31 + 5);
  }
  // saving: dried colour as JPEG, paint thickness as a grey PNG; the ground is rebuilt from its id + seed
  function serialize() {
    const c = document.createElement('canvas'); c.width = PW; c.height = PH;
    const x = c.getContext('2d'), im = x.createImageData(PW, PH), d = im.data;
    // fold any still-wet watercolour in so nothing is lost
    for (let i = 0; i < N; i++) {
      d[i * 4] = Math.min(255, S.col[i * 3] * 255); d[i * 4 + 1] = Math.min(255, S.col[i * 3 + 1] * 255);
      d[i * 4 + 2] = Math.min(255, S.col[i * 3 + 2] * 255); d[i * 4 + 3] = 255;
    }
    x.putImageData(im, 0, 0);
    const colURL = c.toDataURL('image/jpeg', 0.92);
    for (let i = 0; i < N; i++) { const v = Math.min(255, S.imp[i] * 180) | 0; d[i * 4] = v; d[i * 4 + 1] = S.top[i] * 40; d[i * 4 + 2] = 0; d[i * 4 + 3] = 255; }
    x.putImageData(im, 0, 0);
    return { g: S.ground.id, seed: S.seed, col: colURL, imp: c.toDataURL('image/png') };
  }
  function restore(o, done) {
    newPainting(o.g, o.seed);
    let left = 2;
    const fin = () => { if (--left === 0) { S.dirty = { x0: 0, y0: 0, x1: PW - 1, y1: PH - 1 }; S.changed = false; if (done) done(true); } };
    const load = (url, fn) => {
      const im = new Image();
      im.onload = () => {
        const c = document.createElement('canvas'); c.width = PW; c.height = PH;
        const x = c.getContext('2d'); x.drawImage(im, 0, 0);
        fn(x.getImageData(0, 0, PW, PH).data); fin();
      };
      im.onerror = fin;
      im.src = url;
    };
    load(o.col, (d) => { for (let i = 0; i < N; i++) { S.col[i * 3] = d[i * 4] / 255; S.col[i * 3 + 1] = d[i * 4 + 1] / 255; S.col[i * 3 + 2] = d[i * 4 + 2] / 255; } });
    load(o.imp, (d) => { for (let i = 0; i < N; i++) { S.imp[i] = d[i * 4] / 180; S.top[i] = Math.round(d[i * 4 + 1] / 40); } });
  }
  // the finished look (lighting and all) as an image
  function snapshotURL(type, q, scale) {
    render(true);
    if (!scale || scale === 1) return canvas.toDataURL(type || 'image/png', q);
    const c = document.createElement('canvas'); c.width = Math.round(PW * scale); c.height = Math.round(PH * scale);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL(type || 'image/jpeg', q || 0.85);
  }

  window.DreamCanvasPaint = {
    PW, PH, GROUNDS, ground: () => S.ground,
    attach, newPainting, frame, render: () => render(true),
    begin: beginStroke, move: moveStroke, end: endStroke,
    washRect, washing: () => !!S.wash,
    undo, canUndo, dryAll, wetness, pick,
    setTilt: (v) => { S.tilt = !!v; }, tilt: () => S.tilt,
    preview, serialize, restore, snapshotURL,
    changed: () => !!S.changed, clearChanged: () => { S.changed = false; },
    _S: S
  };
})();
