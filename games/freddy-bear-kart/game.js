(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H);

  // ---------- Isometric view ----------
  // The world is a flat map (x right, y down, z up). The race is drawn from up high at an
  // angle, like an old radio-control racing game: world x runs down-right on screen and
  // world y runs down-left, and height lifts things straight up.
  const S = 0.62;             // screen pixels per world unit
  const C = Math.SQRT1_2;
  const KART_M = 1.35;        // karts are drawn a bit bigger than life so they read well
  const VIEW_Y = H / 2 + 12;  // a little below the middle
  let camX = 0, camY = 0, shake = 0;
  function P(x, y, z = 0) {
    const dx = x - camX, dy = y - camY;
    return { x: W / 2 + (dx - dy) * C * S, y: VIEW_Y + (dx + dy) * C * S * 0.5 - z * S };
  }
  P.k = S;
  const onScreen = (p, m = 50) => p.x > -m && p.x < W + m && p.y > -m - 30 && p.y < H + m;

  const LAPS = 3;
  const SAVE_KEY = 'freddyBearRacing.save';
  const BEST_BONUS = 5;
  const PLACE_BONUS = [8, 5, 3, 2];
  const PLACE_NAMES = ['1ST', '2ND', '3RD', '4TH'];
  const PLACE_COLORS = ['#ffd23f', '#e6eef5', '#ff9d3f', '#4ff0ff'];

  const RAMP_LEN = 2, RAMP_H = 16, POOL_LEN = 3, NITRO_MAX = 3;
  const MAX_SPEED = 265, OFFROAD_SPEED = 120, BOOST_SPEED = 410, POOL_SPEED = 125;
  const ACCEL = 170, BRAKE = 340, TURN_RATE = 2.6, GRAVITY = 1000;

  // ---------- Progression ----------
  const SKINS = [
    { id: 'classic', name: 'CLASSIC FREDDY', cost: 0 },
    { id: 'golden', name: 'GOLDEN FREDDY', cost: 150 },
  ];
  const HATS = [
    { id: 'cap', name: 'RACING CAP', cost: 0 },
    { id: 'none', name: 'NO HAT', cost: 0 },
    { id: 'pirate', name: 'PIRATE HAT', cost: 20 },
    { id: 'beanie', name: 'SNOW BEANIE', cost: 40 },
    { id: 'helmet', name: 'RACING HELMET', cost: 70 },
    { id: 'crown', name: 'GOLD CROWN', cost: 110 },
  ];

  const defaultSave = { coins: 0, bestTimes: {}, isoGhosts: {}, skin: 'classic', hat: 'cap' };
  let save = loadSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...defaultSave };
      const s = { ...defaultSave, ...JSON.parse(raw) };
      delete s.ghosts; // the old top-down ghosts (no jumps in them) aren't used any more
      return s;
    } catch { return { ...defaultSave }; }
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
  }
  const isUnlocked = (item) => save.coins >= item.cost;

  // ---------- Audio ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, duration, type = 'square', vol = 0.12, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type; osc.frequency.value = freq; gain.gain.value = vol;
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    osc.start(t0);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.stop(t0 + duration);
  }
  const sfxCoin = () => { beep(1000, 0.07, 'square', 0.1); beep(1400, 0.07, 'square', 0.08, 0.05); };
  const sfxCrash = () => beep(120, 0.3, 'sawtooth', 0.16);
  const sfxBump = () => beep(200, 0.08, 'square', 0.08);
  const sfxLap = () => { beep(600, 0.1, 'triangle', 0.14); beep(900, 0.14, 'triangle', 0.14, 0.09); };
  const sfxCount = () => beep(500, 0.15, 'square', 0.14);
  const sfxGo = () => { beep(800, 0.2, 'square', 0.16); beep(1200, 0.25, 'square', 0.14, 0.12); };
  const sfxWin = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.15, i * 0.13)); };
  const sfxDone = () => { [523, 659, 784].forEach((f, i) => beep(f, 0.2, 'triangle', 0.13, i * 0.12)); };
  const sfxBoost = () => { beep(330, 0.12, 'sawtooth', 0.07); beep(520, 0.14, 'sawtooth', 0.07, 0.06); beep(780, 0.2, 'sawtooth', 0.06, 0.12); };
  const sfxNitro = () => { [400, 600, 800, 1100].forEach((f, i) => beep(f, 0.1, 'square', 0.08, i * 0.04)); };
  const sfxJump = () => { beep(420, 0.1, 'triangle', 0.14); beep(700, 0.16, 'triangle', 0.12, 0.07); };
  const sfxLand = () => beep(90, 0.16, 'square', 0.14);
  const sfxSplash = () => { beep(300, 0.08, 'triangle', 0.08); beep(220, 0.1, 'triangle', 0.07, 0.05); };

  // ---------- Math helpers ----------
  function catmull(p0, p1, p2, p3, t) {
    const t2 = t * t, t3 = t2 * t;
    return {
      x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
      y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
    };
  }
  function smoothLoop(pts, per = 14) {
    const out = [], n = pts.length;
    for (let i = 0; i < n; i++) {
      const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      for (let s = 0; s < per; s++) out.push(catmull(p0, p1, p2, p3, s / per));
    }
    return out;
  }
  function distToSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy || 1;
    let t = ((px - ax) * dx + (py - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    return Math.hypot(px - cx, py - cy);
  }
  function makeRng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
  // signed distance in road segments from b to a, in [-n/2, n/2)
  const cyc = (a, b, n) => ((((a - b) % n) + n + n / 2) % n) - n / 2;
  const fmtTime = (s) => {
    if (s == null) return '--:--.--';
    const m = Math.floor(s / 60), sec = s - m * 60;
    return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
  };
  function shade(hex, f) {
    const v = parseInt(hex.slice(1), 16);
    const r = Math.round(((v >> 16) & 255) * f), g = Math.round(((v >> 8) & 255) * f), b = Math.round((v & 255) * f);
    return `rgb(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)})`;
  }

  // ---------- Tracks ----------
  const TRACK_DEFS = [
    {
      id: 'treasure',
      name: 'TREASURE COVE',
      sub: 'Pirate gold, sandy jumps &amp; splashy puddles',
      theme: 'treasure',
      width: 150,
      ground: '#e8c86a', groundAlt: '#dfbd5c',
      road: '#c9a24a', roadEdge: '#8a6b25', curb: ['#e0402a', '#ffffff'],
      pool: 'water', sea: true,
      seed: 11,
      points: [ {x:300,y:760},{x:430,y:400},{x:800,y:250},{x:1180,y:310},{x:1500,y:200},{x:1860,y:360},{x:1960,y:720},{x:1740,y:1060},{x:1380,y:1160},{x:1040,y:1000},{x:740,y:1160},{x:400,y:1090} ],
      obstacle: 'crate',
      obstacleCount: 10,
    },
    {
      id: 'snowbeach',
      name: 'SNOW TO SURF',
      sub: 'Jump the snow drifts down to a sunny beach',
      theme: 'snowbeach',
      width: 155,
      ground: '#f2f7fb', groundAlt: '#e6eef5',
      road: '#b9c6d2', roadEdge: '#8fa0b0', curb: ['#2f6fd8', '#ffffff'],
      pool: 'snow', sea: true,
      seed: 27,
      points: [ {x:350,y:300},{x:720,y:180},{x:1100,y:260},{x:1460,y:190},{x:1830,y:330},{x:1960,y:660},{x:1700,y:920},{x:1300,y:870},{x:1010,y:1060},{x:1260,y:1270},{x:880,y:1370},{x:500,y:1260},{x:290,y:940},{x:250,y:600} ],
      obstacle: 'ice',
      obstacleCount: 12,
    },
    {
      id: 'volcano',
      name: 'VOLCANO PASS',
      sub: 'Jump the lava &amp; dodge the lava bombs!',
      theme: 'volcano',
      width: 158,
      ground: '#4a2f28', groundAlt: '#42291f',
      road: '#5c5148', roadEdge: '#2e2620', curb: ['#ffd23f', '#222222'],
      pool: 'lava',
      seed: 43,
      points: [ {x:1100,y:250},{x:1520,y:300},{x:1810,y:560},{x:1860,y:910},{x:1550,y:1210},{x:1100,y:1310},{x:640,y:1210},{x:340,y:900},{x:380,y:540},{x:700,y:290} ],
      obstacle: 'rock',
      obstacleCount: 9,
      volcano: { x: 1100, y: 780, r: 190 },
      lavaBombs: true,
    },
  ];

  // point at float position s along the road (in segments), lat units right of the middle
  function tp(t, s, lat) {
    const n = t.n;
    const i0 = Math.floor(s), f = s - i0;
    const i = ((i0 % n) + n) % n, j = (i + 1) % n;
    const a = t.center[i], b = t.center[j], na = t.N[i], nb = t.N[j];
    const nx = na.x + (nb.x - na.x) * f, ny = na.y + (nb.y - na.y) * f;
    return { x: a.x + (b.x - a.x) * f + nx * lat, y: a.y + (b.y - a.y) * f + ny * lat };
  }

  // nearest spot on the road: segment, how far along it, and signed distance to the right
  function locate(t, x, y) {
    let best = 1e18, bi = 0, bf = 0, side = 1;
    for (let i = 0; i < t.n; i++) {
      const a = t.center[i], b = t.center[(i + 1) % t.n];
      const dx = b.x - a.x, dy = b.y - a.y;
      const L2 = dx * dx + dy * dy || 1;
      let f = ((x - a.x) * dx + (y - a.y) * dy) / L2;
      f = f < 0 ? 0 : f > 1 ? 1 : f;
      const ex = x - (a.x + dx * f), ey = y - (a.y + dy * f);
      const d2 = ex * ex + ey * ey;
      if (d2 < best) { best = d2; bi = i; bf = f; side = ((x - a.x) * -dy + (y - a.y) * dx) >= 0 ? 1 : -1; }
    }
    const dist = Math.sqrt(best);
    return { idx: bi, f: bf, dist, lat: dist * side };
  }

  const tracks = TRACK_DEFS.map(buildTrack);

  function buildTrack(def) {
    const center = smoothLoop(def.points);
    const n = center.length;
    const wrap = (i) => ((i % n) + n) % n;
    const headingAt = (i) => {
      const a = center[wrap(i)], b = center[wrap(i + 1)];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };
    const N = center.map((_, i) => {
      const a = center[wrap(i - 1)], b = center[wrap(i + 1)];
      const h = Math.atan2(b.y - a.y, b.x - a.x);
      return { x: -Math.sin(h), y: Math.cos(h) };
    });
    const segLen = center.map((a, i) => { const b = center[wrap(i + 1)]; return Math.hypot(b.x - a.x, b.y - a.y); });
    const t = { ...def, center, n, N, segLen, headingAt, roadAlt: shade(def.road, 0.92) };
    const hw = def.width / 2;
    const rng = makeRng(def.seed);

    // s + d world units further along the road
    const along = (s, d) => {
      let i = Math.floor(s), f = s - i;
      for (;;) {
        const L = segLen[wrap(i)] || 1, left = (1 - f) * L;
        if (d <= left) return i + f + d / L;
        d -= left; i++; f = 0;
      }
    };

    // ---- jumps go on the straightest bits of road ----
    const turnAt = (i) => Math.abs(angDiff(headingAt(i + 3), headingAt(i - 3)));
    const roughAt = (i) => { let m = 0; for (let j = i - 3; j <= i + 10; j++) m = Math.max(m, turnAt(j)); return m; };
    const used = new Uint8Array(n);
    const block = (a, b) => { for (let j = a; j <= b; j++) used[wrap(j)] = 1; };
    const free = (a, b) => { for (let j = a; j <= b; j++) if (used[wrap(j)]) return false; return true; };
    const cands = [];
    for (let i = 14; i < n - 14; i++) cands.push({ i, r: roughAt(i) });
    cands.sort((p, q) => p.r - q.r);
    block(n - 9, 5); // keep the starting grid clear

    const ramps = [];
    const wantRamps = n > 180 ? 3 : 2;
    for (const lim of [0.3, 0.5, 0.9]) {
      for (const c of cands) {
        if (ramps.length >= wantRamps) break;
        if (c.r > lim || !free(c.i - 8, c.i + 11)) continue;
        if (ramps.some((r) => Math.abs(cyc(r.i, c.i, n)) < n / 5)) continue;
        ramps.push({ i: c.i });
        block(c.i - 8, c.i + 11);
      }
    }
    ramps.sort((a, b) => a.i - b.i);
    const pools = ramps.map((r) => ({ i: r.i + RAMP_LEN + 1 }));

    // boost pads: a wide one in front of the first jump (big air!), plus two side ones
    const boosts = [];
    if (ramps.length) boosts.push({ i: ramps[0].i - 5, lat: 0, hw: hw * 0.55 });
    for (const c of cands) {
      if (boosts.length >= 3) break;
      if (!free(c.i - 3, c.i + 3)) continue;
      if (boosts.some((b) => Math.abs(cyc(b.i, c.i, n)) < n / 6)) continue;
      boosts.push({ i: c.i, lat: (boosts.length % 2 ? 1 : -1) * hw * 0.42, hw: 30 });
      block(c.i - 3, c.i + 3);
    }

    // nitro cans: pick one up, press BOOST to zoom
    const nitros = [];
    for (const c of cands) {
      if (nitros.length >= 2) break;
      if (!free(c.i - 2, c.i + 2)) continue;
      if (nitros.some((q) => Math.abs(cyc(q.i, c.i, n)) < n / 5)) continue;
      const p = tp(t, c.i + 0.5, 0);
      nitros.push({ i: c.i, x: p.x, y: p.y, respawn: 0 });
      block(c.i - 2, c.i + 2);
    }

    // coins weave along the road; a rainbow of coins hangs over every jump
    const coins = [];
    for (let i = 6; i < n; i += 7) {
      if (used[i] && !boosts.some((b) => b.i === i)) continue;
      const off = Math.sin(i * 0.7) * (hw * 0.56);
      const p = tp(t, i, off);
      coins.push({ x: p.x, y: p.y, z: 0, taken: false });
    }
    const vz = 200 + 0.45 * MAX_SPEED;
    for (const r of ramps) {
      for (const d of [45, 90, 135, 180]) {
        const time = d / MAX_SPEED;
        const p = tp(t, along(r.i + RAMP_LEN, d), 0);
        coins.push({ x: p.x, y: p.y, z: RAMP_H + vz * time - 0.5 * GRAVITY * time * time, taken: false });
      }
    }

    // obstacles: near the edges of the road so there's a clean line through, never on a jump
    const obstacles = [];
    for (let tries = 0; obstacles.length < def.obstacleCount && tries < def.obstacleCount * 8; tries++) {
      const i = Math.floor(8 + rng() * (n - 16));
      const side = rng() < 0.5 ? -1 : 1;
      const lat = side * (def.width * (0.26 + rng() * 0.14));
      if (used[i] || obstacles.some((o) => Math.abs(cyc(o.i, i, n)) < 4)) continue;
      const p = tp(t, i, lat);
      obstacles.push({ x: p.x, y: p.y, i, lat, a: headingAt(i), r: def.obstacle === 'ice' ? 38 : 20, kind: def.obstacle });
    }

    // scenery, scattered off-road
    const decor = [];
    const bounds = center.reduce((b, p) => ({
      minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
      minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y),
    }), { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 });
    const pad = 260;
    for (let k = 0; k < 170; k++) {
      const x = bounds.minX - pad + rng() * (bounds.maxX - bounds.minX + pad * 2);
      const y = bounds.minY - pad + rng() * (bounds.maxY - bounds.minY + pad * 2);
      if (distToCenter(center, x, y) < def.width * 0.75 + 40) continue;
      if (def.volcano && Math.hypot(x - def.volcano.x, y - def.volcano.y) < def.volcano.r + 40) continue;
      decor.push({ x, y, kind: pickDecor(def.theme, y, bounds, rng), s: 0.8 + rng() * 0.6 });
    }

    return Object.assign(t, { ramps, pools, boosts, nitros, coins, obstacles, decor, bounds });
  }

  function pickDecor(theme, y, bounds, rng) {
    const r = rng();
    if (theme === 'treasure') return r < 0.45 ? 'palm' : r < 0.7 ? 'chest' : r < 0.85 ? 'barrel' : 'rockS';
    if (theme === 'snowbeach') {
      const frac = (y - bounds.minY) / (bounds.maxY - bounds.minY || 1);
      if (frac < 0.5) return r < 0.7 ? 'pine' : 'snowrock';   // mountain half
      return r < 0.55 ? 'palm' : r < 0.8 ? 'umbrella' : 'rockS'; // beach half
    }
    return r < 0.5 ? 'lavarock' : r < 0.8 ? 'deadtree' : 'rockS';
  }

  function distToCenter(center, x, y) {
    let best = 1e9;
    for (let i = 0; i < center.length; i++) {
      const a = center[i], b = center[(i + 1) % center.length];
      best = Math.min(best, distToSeg(x, y, a.x, a.y, b.x, b.y));
    }
    return best;
  }

  // ---------- Racers ----------
  const RIVALS = [
    { name: 'BUNNY', skill: 0.93, look: { body: '#ff5fa8', stripe: '#ffffff', fur: '#ffffff', furDark: '#e8d0dc', belly: '#ffc4dc', ears: 'long' } },
    { name: 'FOXY', skill: 0.89, look: { body: '#ff8a2b', stripe: '#222222', fur: '#ff9440', furDark: '#b8520e', belly: '#fff2e0', ears: 'pointy' } },
    { name: 'PANDA', skill: 0.85, look: { body: '#3ccf6a', stripe: '#ffffff', fur: '#ffffff', furDark: '#222222', belly: '#ffffff', ears: 'round', patches: true } },
  ];
  function playerLook(skinId = save.skin, hatId = save.hat) {
    const golden = skinId === 'golden';
    return {
      body: '#2f8fe0', stripe: '#ffd23f', ears: 'round', hat: hatId, shine: golden,
      fur: golden ? '#ffd23f' : '#9b9ba3', furDark: golden ? '#d9a400' : '#6e6e78', belly: golden ? '#fff0b0' : '#c9c9d1',
    };
  }
  const GHOST_LOOK = { body: '#8a8a99', stripe: null, fur: '#b0b0bb', furDark: '#7a7a88', belly: '#c9c9d1', ears: 'round' };

  // ---------- Game state ----------
  let screen = 'tracks';
  let track = null;
  let kart, rivals = [], karts = [], ghost, race, minimap;
  let particles = [], popups = [];
  const keys = {};
  const touch = { left: false, right: false };

  function makeKart(t, s, latF, rival) {
    const p = tp(t, s, latF * t.width);
    return {
      x: p.x, y: p.y, z: 0, vz: 0, groundZ: 0, a: t.headingAt(s), speed: 0,
      boost: 0, bump: 0, bumpCd: 0, grip: 1, idx: s, f: 0, lat: 0, onRoad: true, inPool: false,
      lap: 0, cp: [true, true, true], done: false, finishTime: 0, ramp: null, air: 0,
      nitro: rival ? 0 : 1, capMul: 1, rival, look: rival ? rival.look : null,
      lane: latF * t.width, laneTimer: 2 + Math.random() * 2, steerCmd: 0, brakeCmd: false,
    };
  }

  function newRace(t) {
    track = t;
    const n = t.n;
    const grid = [[n - 3, -0.22], [n - 3, 0.22], [n - 6, -0.22], [n - 6, 0.22]];
    rivals = RIVALS.map((r, k) => makeKart(t, grid[k][0], grid[k][1], r));
    kart = makeKart(t, grid[3][0], grid[3][1], null);
    karts = [...rivals, kart];
    t.coins.forEach((c) => c.taken = false);
    t.nitros.forEach((q) => q.respawn = 0);
    race = {
      state: 'countdown', countdown: 3.999, time: 0, coinsGot: 0, order: [],
      bombs: [], bombTimer: 2.5, trail: [], wrongWay: 0, finishT: 0, result: null,
    };
    particles = []; popups = []; shake = 0;
    ghost = { data: save.isoGhosts[t.id] || null, x: 0, y: 0, a: 0, z: 0, visible: false };
    camX = kart.x; camY = kart.y;
    minimap = buildMinimap(t);
  }

  // ---------- Input ----------
  window.addEventListener('keydown', (e) => {
    if (['ArrowLeft', 'ArrowRight', 'ArrowDown', 'ArrowUp', 'Space'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (screen === 'race' || e.repeat) return;
    if (e.code === 'ArrowLeft') menuNav(-1, 0);
    else if (e.code === 'ArrowRight') menuNav(1, 0);
    else if (e.code === 'ArrowUp') menuNav(0, -1);
    else if (e.code === 'ArrowDown') menuNav(0, 1);
    else if ((e.code === 'Enter' || e.code === 'Space') && document.activeElement && document.activeElement.classList.contains('card')) {
      ensureAudio();
      document.activeElement.click();
    }
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });

  // optional thumbstick (left thumb) + BOOST and BRAKE (right thumb); they only show during
  // a race, so they never sit on top of the menus' cards
  const pad = MickleTouch.create({
    buttons: [{ id: 'boost', label: 'BOOST' }, { id: 'brake', label: 'BRAKE' }],
    onPress() { ensureAudio(); },
  });
  pad.show(screen === 'race');

  // steering by tapping the left/right half of the canvas itself
  const canvasTouch = { id: null, side: null };
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault(); ensureAudio();
    const r = canvas.getBoundingClientRect();
    canvasTouch.id = e.pointerId;
    canvasTouch.side = (e.clientX - r.left) < r.width / 2 ? 'left' : 'right';
    touch[canvasTouch.side] = true;
  });
  const endCanvasTouch = (e) => {
    if (canvasTouch.id !== null && e.pointerId !== canvasTouch.id) return;
    if (canvasTouch.side) touch[canvasTouch.side] = false;
    canvasTouch.id = null; canvasTouch.side = null;
  };
  canvas.addEventListener('pointerup', endCanvasTouch);
  canvas.addEventListener('pointercancel', endCanvasTouch);

  const padReady = () => typeof Pad360 !== 'undefined';
  const steerInput = () => {
    const left = keys['ArrowLeft'] || keys['KeyA'] || touch.left || pad.dx() < 0 || (padReady() && Pad360.dx() < 0);
    const right = keys['ArrowRight'] || keys['KeyD'] || touch.right || pad.dx() > 0 || (padReady() && Pad360.dx() > 0);
    return (left ? -1 : 0) + (right ? 1 : 0);
  };
  const brakeInput = () => keys['ArrowDown'] || keys['KeyS'] || pad.down('brake') ||
    (padReady() && (Pad360.down(Pad360.BTN.B) || Pad360.down(Pad360.BTN.LT) || Pad360.down(Pad360.BTN.RT)));
  let boostWasDown = false;
  function nitroPressed() {
    const down = !!(keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || pad.down('boost') ||
      (padReady() && (Pad360.down(Pad360.BTN.A) || Pad360.down(Pad360.BTN.X) || Pad360.down(Pad360.BTN.RB))));
    const pressed = down && !boostWasDown;
    boostWasDown = down;
    return pressed;
  }

  // Menus (Xbox 360 controller or arrow keys): each card carousel is one row and every
  // other button is its own row. Left/right spins the carousel you're on (or steps between
  // buttons), up/down moves between rows, A / Enter activates, B backs out. Card buttons
  // have tabindex -1 -- the card itself is what gets focus, and pressing it presses them.
  function focusablesInActiveScreen() {
    const active = document.querySelector('.screen.active');
    if (!active) return [];
    return [el('back'), ...active.querySelectorAll('button:not([tabindex="-1"]), a.link, .card[tabindex="0"]')]
      .filter((f) => !f.disabled && f.offsetParent !== null);
  }
  function menuRows() {
    const rows = [];
    for (const f of focusablesInActiveScreen()) {
      const shelf = MickleCarousel.of(f);
      const row = shelf ? shelf.strip : f;
      if (!rows.includes(row)) rows.push(row);
    }
    return rows;
  }
  function focusRow(row) {
    const shelf = MickleCarousel.of(row);
    const target = shelf ? shelf.items()[shelf.selected()] : row;
    if (target) target.focus({ preventScroll: true });
  }
  function padNavigate(dir) {
    const items = focusablesInActiveScreen().filter((f) => !MickleCarousel.of(f));
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = current === -1 ? 0 : (current + dir + items.length) % items.length;
    items[next].focus({ preventScroll: true });
  }
  function menuNav(dx, dy) {
    const shelf = MickleCarousel.of(document.activeElement);
    if (dx && shelf) { shelf.step(dx); return; }
    if (dx) { padNavigate(dx); return; }
    const rows = menuRows();
    if (!rows.length) return;
    const cur = rows.findIndex((r) => r === document.activeElement || r.contains(document.activeElement));
    focusRow(rows[cur === -1 ? 0 : (cur + dy + rows.length) % rows.length]);
  }
  function pollMenuGamepad() {
    const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    if (dx || dy) menuNav(dx, dy);
    if (Pad360.pressed(Pad360.BTN.A)) {
      const focused = document.activeElement;
      if (focused && focused.closest && focused.closest('.screen.active')) { ensureAudio(); focused.click(); }
    }
    if (Pad360.pressed(Pad360.BTN.B)) {
      const back = document.querySelector('.screen.active button[id*="back"]') || (screen === 'tracks' ? el('back') : null);
      if (back) { ensureAudio(); back.click(); }
    }
  }

  // ---------- Effects ----------
  function puff(x, y, z, col, count, spread = 60, up = 80, life = 0.5, size = 2.5) {
    for (let i = 0; i < count && particles.length < 360; i++) {
      const a = Math.random() * Math.PI * 2, sp = Math.random() * spread;
      particles.push({ x, y, z, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, vz: Math.random() * up,
        life: life * (0.6 + Math.random() * 0.6), max: life, col, size: size * (0.7 + Math.random() * 0.6) });
    }
  }
  function popup(x, y, text, col = '#ffe14f') { popups.push({ x, y, z: 30, text, col, life: 1.1 }); }

  // ---------- Physics ----------
  function stepKart(k, steer, brake, dt) {
    const t = track, n = t.n, hw = t.width / 2, isMe = k === kart;
    const loc = locate(t, k.x, k.y);
    k.idx = loc.idx; k.f = loc.f; k.lat = loc.lat;
    k.onRoad = loc.dist < hw + 8;
    if (k.bump > 0) k.bump -= dt;
    if (k.bumpCd > 0) k.bumpCd -= dt;

    // jump ramps: drive up the wedge, fly off the top
    let ramp = null, rampH = 0;
    for (const r of t.ramps) {
      const rel = cyc(k.idx, r.i, n) + k.f;
      if (rel >= 0 && rel < RAMP_LEN && Math.abs(k.lat) < hw) { ramp = r; rampH = rel / RAMP_LEN * RAMP_H; break; }
    }
    k.groundZ = ramp ? rampH : 0;
    if (ramp && k.z <= rampH + 4 && k.vz <= 0) {
      k.z = rampH; k.vz = 0; k.ramp = ramp;
    } else if (k.ramp) {
      const rel = cyc(k.idx, k.ramp.i, n) + k.f;
      if (rel >= RAMP_LEN - 0.3) {
        k.vz = 200 + 0.45 * k.speed; k.air = 0;
        if (isMe) sfxJump();
      }
      k.ramp = null;
    }
    const airborne = !k.ramp && (k.z > 0 || k.vz > 0);
    if (airborne) {
      k.air += dt;
      k.vz -= GRAVITY * dt;
      k.z += k.vz * dt;
      if (k.z <= 0) {
        const hard = k.vz < -180;
        k.z = 0; k.vz = 0;
        if (hard) {
          puff(k.x, k.y, 0, t.theme === 'snowbeach' ? '#ffffff' : '#d8c8a0', 10, 70, 60, 0.45);
          if (isMe) {
            sfxLand(); shake = 0.22;
            if (k.air > 0.55 && race.state === 'racing') { race.coinsGot++; popup(k.x, k.y, 'BIG AIR! +1'); sfxCoin(); }
          }
        }
        k.air = 0;
      }
    }
    const grounded = k.z < 1;

    // what's under the wheels
    const wasInPool = k.inPool;
    k.inPool = false; k.grip = 1;
    if (grounded) {
      for (const p of t.pools) {
        const rel = cyc(k.idx, p.i, n) + k.f;
        if (rel >= 0 && rel < POOL_LEN && Math.abs(k.lat) < hw - 6) k.inPool = true;
      }
      for (const b of t.boosts) {
        const rel = cyc(k.idx, b.i, n) + k.f;
        if (rel >= 0 && rel < 1.5 && Math.abs(k.lat - b.lat) < b.hw) {
          if (k.boost < 0.3 && isMe) sfxBoost();
          k.boost = Math.max(k.boost, 1.0);
        }
      }
    }
    if (k.inPool && !wasInPool && isMe) {
      sfxSplash();
      popup(k.x, k.y, t.pool === 'lava' ? 'HOT HOT!' : t.pool === 'snow' ? 'POOF!' : 'SPLASH!', '#4ff0ff');
    }
    for (const o of t.obstacles) {
      const dx = k.x - o.x, dy = k.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (o.kind === 'ice') {
        if (d < o.r && grounded) k.grip = 0.35;
        continue;
      }
      const hitR = o.r + 12;
      if (d < hitR && k.z < 14) {
        // shove clear of the obstacle, so a slow kart can never wedge inside it
        k.x += (dx / d) * (hitR - d);
        k.y += (dy / d) * (hitR - d);
        if (k.bumpCd <= 0) {
          k.speed = Math.max(45, k.speed * 0.35);
          k.bump = 0.35; k.bumpCd = 0.8;
          if (isMe) { sfxCrash(); shake = 0.2; }
          puff(o.x, o.y, 10, o.kind === 'crate' ? '#b07a3a' : '#6a4a3a', 8, 60, 90, 0.5);
        }
      }
    }

    // driving -- karts always accelerate; you steer (and brake if you like)
    let cap = (k.onRoad ? MAX_SPEED : OFFROAD_SPEED) * k.capMul;
    if (k.inPool) cap = Math.min(cap, POOL_SPEED);
    if (k.boost > 0) {
      k.boost -= dt;
      cap = Math.max(cap, BOOST_SPEED * (k.inPool ? 0.6 : 1));
      k.speed = Math.min(cap, k.speed + 520 * dt);
    }
    if (!airborne) {
      if (brake) k.speed = Math.max(0, k.speed - BRAKE * dt);
      else k.speed += ACCEL * dt;
    }
    if (k.speed > cap) k.speed = Math.max(cap, k.speed - (airborne ? 60 : 300) * dt);

    const agility = Math.min(1, k.speed / 90) * k.grip * (airborne ? 0.35 : 1);
    k.a += steer * TURN_RATE * agility * dt;
    // lost in the grass and not steering? Freddy gently heads back to the road
    if (isMe && !k.onRoad && steer === 0 && !airborne) {
      const p = tp(t, k.idx + k.f + 3, 0);
      k.a += clamp(angDiff(Math.atan2(p.y - k.y, p.x - k.x), k.a), -1, 1) * 1.4 * dt;
    }
    k.x += Math.cos(k.a) * k.speed * dt;
    k.y += Math.sin(k.a) * k.speed * dt;

    // little effects
    const bx = k.x - Math.cos(k.a) * 18, by = k.y - Math.sin(k.a) * 18;
    if (k.boost > 0 && Math.random() < dt * 50) puff(bx, by, k.z + 8, Math.random() < 0.5 ? '#ffd23f' : '#ff6a2b', 1, 25, 30, 0.3, 3);
    if (grounded && !k.onRoad && k.speed > 60 && Math.random() < dt * 20) puff(bx, by, 2, t.theme === 'snowbeach' ? '#ffffff' : shade(t.ground, 0.8), 1, 20, 30, 0.4, 3);
    if (k.inPool && k.speed > 40 && Math.random() < dt * 30) {
      const col = t.pool === 'lava' ? '#ffb13f' : t.pool === 'snow' ? '#ffffff' : '#8fe0ff';
      puff(k.x, k.y, 4, col, 2, 50, 110, 0.45, 2.5);
    }
  }

  function aiDrive(k, dt) {
    const t = track, hw = t.width / 2;
    k.laneTimer -= dt;
    if (k.laneTimer <= 0) { k.laneTimer = 2 + Math.random() * 3; k.lane = (Math.random() * 2 - 1) * hw * 0.45; }
    let target = k.lane;
    for (const o of t.obstacles) {
      if (o.kind === 'ice') continue;
      const d = cyc(o.i, k.idx, t.n);
      if (d > 0 && d < 8 && Math.abs(o.lat - target) < 44) target = o.lat > 0 ? o.lat - 50 : o.lat + 50;
    }
    target = clamp(target, -hw + 18, hw - 18);
    const p = tp(t, k.idx + k.f + 3 + k.speed / 90, target);
    const d = angDiff(Math.atan2(p.y - k.y, p.x - k.x), k.a);
    k.steerCmd = clamp(d * 3, -1, 1);
    k.brakeCmd = Math.abs(d) > 1.0 && k.speed > 140;
    if (k.rival) {
      // stay close to Freddy: ease off when ahead, push a bit when behind
      const gap = prog(k) - prog(kart);
      const band = gap > 0 ? Math.max(0.78, 1 - gap * 0.008) : Math.min(1.18, 1 - gap * 0.006);
      k.capMul = k.rival.skill * band;
    }
  }

  const prog = (k) => k.done ? 1e6 - k.finishTime : (k.lap - 1) * track.n + k.idx + k.f;
  const livePlace = () => 1 + rivals.filter((r) => prog(r) > prog(kart)).length;

  function lapCheck(k) {
    const frac = k.idx / track.n;
    if (frac > 0.25 && frac < 0.45) k.cp[0] = true;
    if (frac > 0.5 && frac < 0.7 && k.cp[0]) k.cp[1] = true;
    if (frac > 0.75 && frac < 0.95 && k.cp[1]) k.cp[2] = true;
    if (frac < 0.08 && k.cp[2]) {
      k.cp = [false, false, false];
      if (k.lap >= LAPS) {
        if (!k.done) { k.done = true; k.finishTime = race.time; race.order.push(k); }
      } else k.lap++;
      return true;
    }
    return false;
  }

  function updateRace(dt) {
    if (shake > 0) shake = Math.max(0, shake - dt);
    if (race.state === 'countdown') {
      const prev = Math.ceil(race.countdown);
      race.countdown -= dt;
      const now = Math.ceil(race.countdown);
      if (now !== prev) { if (now > 0) sfxCount(); else sfxGo(); }
      if (race.countdown <= 0) race.state = 'racing';
      return;
    }

    const racing = race.state === 'racing';
    if (racing) {
      race.time += dt;
      // Sample the ghost on a fixed 15Hz grid derived from race time (not an
      // accumulator) so playback indexes line up exactly with what was recorded.
      const wantSamples = Math.floor(race.time * 15);
      while (race.trail.length / 4 < wantSamples) {
        race.trail.push(Math.round(kart.x), Math.round(kart.y), Math.round(kart.a * 100) / 100, Math.round(kart.z));
      }
    } else race.time += dt; // rivals still finishing

    // Freddy: you steer; after the finish line he drives himself
    let steer, brake;
    if (racing) {
      steer = steerInput(); brake = brakeInput();      if (nitroPressed() && kart.nitro > 0 && kart.boost < 0.3) {
        kart.nitro--; kart.boost = 1.6; sfxNitro();
        popup(kart.x, kart.y, 'NITRO!', '#4ff0ff');
      }
    } else { aiDrive(kart, dt); steer = kart.steerCmd; brake = false; kart.capMul = 0.8; }
    for (const r of rivals) aiDrive(r, dt);
    for (const r of rivals) stepKart(r, r.steerCmd, r.brakeCmd, dt);
    stepKart(kart, steer, brake, dt);

    // karts bump each other
    for (let i = 0; i < karts.length; i++) {
      for (let j = i + 1; j < karts.length; j++) {
        const a = karts[i], b = karts[j];
        if (Math.abs(a.z - b.z) > 14) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d > 0.01 && d < 26) {
          const push = (26 - d) / 2;
          a.x -= dx / d * push; a.y -= dy / d * push;
          b.x += dx / d * push; b.y += dy / d * push;
          if ((a === kart || b === kart) && kart.bumpCd <= 0) { sfxBump(); kart.bumpCd = 0.3; }
        }
      }
    }

    // coins and nitro cans (Freddy only)
    for (const c of track.coins) {
      if (c.taken) continue;
      if (Math.hypot(kart.x - c.x, kart.y - c.y) < 28 && Math.abs(kart.z - c.z) < 26) {
        c.taken = true; race.coinsGot++; sfxCoin();
        puff(c.x, c.y, c.z + 10, '#ffd23f', 6, 50, 60, 0.4, 2);
      }
    }
    for (const q of track.nitros) {
      if (q.respawn > 0) { q.respawn -= dt; continue; }
      if (kart.nitro < NITRO_MAX && Math.hypot(kart.x - q.x, kart.y - q.y) < 30 && kart.z < 24) {
        kart.nitro++; q.respawn = 6; sfxNitro();
        popup(q.x, q.y, 'NITRO +1', '#4ff0ff');
      }
    }

    // lava bombs
    if (track.lavaBombs) {
      race.bombTimer -= dt;
      if (race.bombTimer <= 0) {
        race.bombTimer = 1.6 + Math.random() * 1.6;
        const ahead = kart.idx + 14 + Math.floor(Math.random() * 26);
        const p = tp(track, ahead, (Math.random() - 0.5) * track.width * 0.7);
        race.bombs.push({ x: p.x, y: p.y, warn: 1.3, blast: 0, r: 52 });
      }
      for (const b of race.bombs) {
        if (b.warn > 0) {
          b.warn -= dt;
          if (b.warn <= 0) {
            b.blast = 0.45;
            puff(b.x, b.y, 4, '#ff6a2b', 16, 120, 160, 0.6, 3.5);
            for (const k of karts) {
              if (Math.hypot(k.x - b.x, k.y - b.y) < b.r && k.z < 20 && k.bumpCd <= 0) {
                k.speed = Math.max(30, k.speed * 0.25);
                k.bump = 0.5; k.bumpCd = 0.8;
                if (k === kart) { sfxCrash(); shake = 0.3; }
              }
            }
          }
        } else if (b.blast > 0) b.blast -= dt;
      }
      race.bombs = race.bombs.filter((b) => b.warn > 0 || b.blast > 0);
    }

    // laps
    for (const r of rivals) lapCheck(r);
    if (lapCheck(kart) && racing) {
      if (kart.done) startFinish();
      else {
        sfxLap();
        popup(kart.x, kart.y, kart.lap === LAPS ? 'FINAL LAP!' : 'LAP ' + kart.lap, '#4fff8f');
      }
    }

    // ghost playback
    ghost.visible = false;
    if (ghost.data && ghost.data.length >= 4 && racing) {
      const i4 = Math.floor(race.time * 15) * 4;
      if (i4 + 3 < ghost.data.length) {
        ghost.x = ghost.data[i4]; ghost.y = ghost.data[i4 + 1]; ghost.a = ghost.data[i4 + 2]; ghost.z = ghost.data[i4 + 3];
        ghost.visible = true;
      }
    }

    // wrong way?
    if (racing && kart.speed > 40 && Math.abs(angDiff(kart.a, track.headingAt(kart.idx))) > 2.0) race.wrongWay += dt;
    else race.wrongWay = Math.max(0, race.wrongWay - dt * 2);

    // particles + popups
    for (const p of particles) {
      p.x += p.vx * dt; p.y += p.vy * dt; p.vz -= 300 * dt; p.z += p.vz * dt;
      if (p.z < 0) { p.z = 0; p.vz = 0; p.vx *= 0.8; p.vy *= 0.8; }
      p.life -= dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of popups) { p.z += 40 * dt; p.life -= dt; }
    popups = popups.filter((p) => p.life > 0);

    // camera leads ahead of Freddy so you can see what's coming
    const lead = Math.min(kart.speed, 300) * 0.38;
    const tx = kart.x + Math.cos(kart.a) * lead, ty = kart.y + Math.sin(kart.a) * lead;
    camX += (tx - camX) * Math.min(1, dt * 4);
    camY += (ty - camY) * Math.min(1, dt * 4);

    if (race.state === 'finish') {
      race.finishT -= dt;
      if (race.finishT <= 0) showResults(race.result);
    }
  }

  function startFinish() {
    race.state = 'finish';
    race.finishT = 3;
    const place = race.order.indexOf(kart) + 1;
    const prevBest = save.bestTimes[track.id] ?? null;
    const isBest = prevBest === null || kart.finishTime < prevBest;
    const coinsBefore = save.coins;
    const bonus = PLACE_BONUS[place - 1] + (isBest ? BEST_BONUS : 0);

    save.coins += race.coinsGot + bonus;
    if (isBest) {
      save.bestTimes[track.id] = kart.finishTime;
      save.isoGhosts[track.id] = race.trail;
    }
    writeSave();
    if (window.MickleScores) {
      MickleScores.record('freddy-bear-kart', kart.finishTime, {
        category: track.name, order: TRACK_DEFS.findIndex((d) => d.id === track.id),
        lowerIsBetter: true, format: 'time',
      });
    }
    if (place === 1) sfxWin(); else sfxDone();
    for (let i = 0; i < 4; i++) puff(kart.x, kart.y, 30, PLACE_COLORS[i], 10, 120, 200, 1, 3);
    race.result = { place, isBest, prevBest, time: kart.finishTime, coinsGot: race.coinsGot, bonus, coinsBefore };
  }

  // ---------- Drawing helpers ----------
  function poly(g, pts, fill, stroke, lw = 1) {
    g.beginPath();
    pts.forEach((p, i) => i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y));
    g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); }
    if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw; g.stroke(); }
  }
  // a box standing on 4 ground corners (world x, y) from height z0 to z1; only the sides
  // that face the camera are drawn, then the lid
  function drawBox(g, pj, pts, z0, z1, top, sideA, sideB, edge) {
    const cx = (pts[0].x + pts[1].x + pts[2].x + pts[3].x) / 4;
    const cy = (pts[0].y + pts[1].y + pts[2].y + pts[3].y) / 4;
    for (let j = 0; j < 4; j++) {
      const p = pts[j], q = pts[(j + 1) % 4];
      let nx = q.y - p.y, ny = -(q.x - p.x);
      if (nx * ((p.x + q.x) / 2 - cx) + ny * ((p.y + q.y) / 2 - cy) < 0) { nx = -nx; ny = -ny; }
      if (nx + ny <= 0) continue;
      poly(g, [pj(p.x, p.y, z0), pj(q.x, q.y, z0), pj(q.x, q.y, z1), pj(p.x, p.y, z1)], nx > ny ? sideA : sideB, edge, 0.6);
    }
    poly(g, pts.map((p) => pj(p.x, p.y, z1)), top, edge, 0.6);
  }
  const ellipse = (g, x, y, rx, ry, fill) => { g.beginPath(); g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); };
  const groundShadow = (x, y, z, r, a = 0.22) => { const p = P(x, y, z); ellipse(ctx, p.x, p.y, r * S, r * S * 0.5, `rgba(0,0,0,${a})`); };

  // ---------- The kart, drawn in 3D ----------
  // pj projects world (x, y, z) to the screen and carries its scale in pj.k, so the race and
  // the garage previews share this. (x, y, z) is where the kart sits, a its heading.
  function drawIsoKart(g, pj, x, y, z, a, look, alpha = 1) {
    const m = KART_M;
    const fx = Math.cos(a), fy = Math.sin(a), rx = -fy, ry = fx;
    const wx = (u, v) => x + (fx * u + rx * v) * m, wy = (u, v) => y + (fy * u + ry * v) * m;
    const W3 = (u, v, h) => pj(wx(u, v), wy(u, v), z + h * m);
    const rect = (u0, u1, v0, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => ({ x: wx(u, v), y: wy(u, v) }));
    const R = pj.k * m;
    const depthOf = (u, v) => (fx * u + rx * v) + (fy * u + ry * v); // + = nearer the camera
    const facing = fx + fy; // > 0: the kart is driving toward the camera

    g.save();
    g.globalAlpha = alpha;
    const wheels = [[10, 11], [10, -11], [-10, 11], [-10, -11]].sort((p, q) => depthOf(...p) - depthOf(...q));
    const wheel = ([u, v]) => drawBox(g, pj, rect(u - 4.5, u + 4.5, v - 2.5, v + 2.5), z, z + 7 * m, '#3a3a3a', '#141414', '#222', null);
    wheels.filter((w) => depthOf(...w) < 0).forEach(wheel);

    // body, racing stripe, engine
    drawBox(g, pj, rect(-15, 15, -9, 9), z + 3 * m, z + 9 * m, look.body, shade(look.body, 0.62), shade(look.body, 0.8), 'rgba(0,0,0,.25)');
    if (look.stripe) poly(g, rect(-15, 15, -2.2, 2.2).map((p) => pj(p.x, p.y, z + 9.05 * m)), look.stripe);
    drawBox(g, pj, rect(-15, -9, -7, 7), z + 9 * m, z + 13 * m, '#555', '#2a2a2a', '#3a3a3a', null);

    wheels.filter((w) => depthOf(...w) >= 0).forEach(wheel);

    // the driver
    const torso = W3(-2, 0, 15), head = W3(-2, 0, 24);
    ellipse(g, torso.x, torso.y, 6.2 * R, 5.6 * R, look.fur);
    ellipse(g, torso.x + facing * 0.8 * R, torso.y + 1.2 * R, 3.6 * R, 3.4 * R, look.belly);

    // ears go behind the head
    for (const side of [-1, 1]) {
      if (look.ears === 'long') {
        const b = W3(-3, side * 3, 28), tip = W3(-4.5, side * 4, 41);
        g.lineCap = 'round';
        g.strokeStyle = look.fur; g.lineWidth = 3.4 * R;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(tip.x, tip.y); g.stroke();
        g.strokeStyle = '#ffb0cc'; g.lineWidth = 1.4 * R;
        g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(tip.x, tip.y); g.stroke();
      } else if (look.ears === 'pointy') {
        const tip = W3(-2, side * 5.5, 35);
        poly(g, [W3(-2, side * 2.5, 27), W3(-2, side * 7.5, 27), tip], look.fur);
        poly(g, [W3(-2, side * 4, 28.5), W3(-2, side * 6.5, 28.5), tip], look.furDark);
      } else {
        const e = W3(-2, side * 5.2, 29);
        ellipse(g, e.x, e.y, 2.9 * R, 2.9 * R, look.furDark);
        ellipse(g, e.x, e.y, 1.4 * R, 1.4 * R, look.belly);
      }
    }

    const snout = W3(3.5, 0, 22.5);
    const drawSnout = () => {
      ellipse(g, snout.x, snout.y, 3 * R, 2.4 * R, look.belly);
      const nose = W3(6.2, 0, 23.5);
      ellipse(g, nose.x, nose.y, 1.2 * R, 0.9 * R, '#2b2b2b');
    };
    if (facing < -0.2) drawSnout();
    ellipse(g, head.x, head.y, 6.6 * R, 6.3 * R, look.fur);
    if (look.shine) ellipse(g, head.x - 2.2 * R, head.y - 2.6 * R, 1.6 * R, 1.2 * R, 'rgba(255,255,255,.5)');
    if (facing >= -0.2) {
      for (const side of [-1, 1]) {
        const e = W3(4.2, side * 2.5, 25.8);
        if (look.patches) ellipse(g, e.x, e.y, 1.9 * R, 1.6 * R, '#222');
        ellipse(g, e.x, e.y, 0.95 * R, 0.95 * R, look.patches ? '#fff' : '#222');
        if (look.patches) ellipse(g, e.x, e.y, 0.5 * R, 0.5 * R, '#222');
      }
      drawSnout();
    }
    drawIsoHat(g, W3, R, look.hat, facing);
    g.restore();
  }

  function drawIsoHat(g, W3, R, hat, facing) {
    const top = W3(-2, 0, 25);
    switch (hat) {
      case 'cap': {
        const brim = W3(3.5, 0, 28.5);
        if (facing < 0) ellipse(g, brim.x, brim.y, 4.4 * R, 2.2 * R, '#ffd23f');
        g.fillStyle = '#2f8fe0';
        g.beginPath(); g.ellipse(top.x, top.y, 6.9 * R, 6.6 * R, 0, Math.PI, Math.PI * 2); g.fill();
        ellipse(g, top.x, top.y - 6.4 * R, 1.3 * R, 1 * R, '#ffd23f');
        if (facing >= 0) ellipse(g, brim.x, brim.y, 4.4 * R, 2.2 * R, '#ffd23f');
        break;
      }
      case 'pirate': {
        const c = W3(-2, 0, 30);
        ellipse(g, c.x, c.y, 9 * R, 3.2 * R, '#1c1c22');
        g.fillStyle = '#1c1c22';
        g.beginPath(); g.ellipse(c.x, c.y, 6 * R, 6 * R, 0, Math.PI, Math.PI * 2); g.fill();
        ellipse(g, c.x, c.y - 2.8 * R, 1.6 * R, 1.6 * R, '#f2f2f2');
        break;
      }
      case 'beanie': {
        g.fillStyle = '#2f6fd8';
        g.beginPath(); g.ellipse(top.x, top.y, 6.9 * R, 7.2 * R, 0, Math.PI, Math.PI * 2); g.fill();
        g.fillStyle = '#eaf6ff';
        g.fillRect(top.x - 6.9 * R, top.y - 1.4 * R, 13.8 * R, 2.2 * R);
        ellipse(g, top.x, top.y - 7.6 * R, 2.2 * R, 2.2 * R, '#eaf6ff');
        break;
      }
      case 'helmet': {
        const c = W3(-2, 0, 24);
        ellipse(g, c.x, c.y, 7.6 * R, 7.3 * R, '#e03a3a');
        g.fillStyle = '#fff'; g.fillRect(c.x - 1.2 * R, c.y - 7.3 * R, 2.4 * R, 7 * R);
        if (facing >= -0.2) { const v = W3(4.5, 0, 24.5); ellipse(g, v.x, v.y, 4.6 * R, 2.4 * R, '#1a2a44'); }
        break;
      }
      case 'crown': {
        const c = W3(-2, 0, 29.5);
        const w = 5.5 * R, h = 6 * R;
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.moveTo(c.x - w, c.y); g.lineTo(c.x - w, c.y - h); g.lineTo(c.x - w / 2, c.y - h * 0.5);
        g.lineTo(c.x, c.y - h * 1.2); g.lineTo(c.x + w / 2, c.y - h * 0.5); g.lineTo(c.x + w, c.y - h); g.lineTo(c.x + w, c.y);
        g.closePath(); g.fill();
        ellipse(g, c.x, c.y - h * 0.35, 1.3 * R, 1.3 * R, '#ff4f6d');
        break;
      }
      default:
    }
  }

  // ---------- The world ----------
  function drawGround() {
    const t = track;
    ctx.fillStyle = t.sea ? '#2f9fd8' : t.theme === 'volcano' ? '#2a1712' : t.ground;
    ctx.fillRect(0, 0, W, H);
    // the screen corners back on the ground, to know which tiles to draw
    const back = (sx, sy) => {
      const A = (sx - W / 2) / (C * S), B = (sy - VIEW_Y) / (C * S * 0.5);
      return { x: camX + (A + B) / 2, y: camY + (B - A) / 2 };
    };
    const cs = [back(0, -40), back(W, -40), back(W, H + 40), back(0, H + 40)];
    const T = 220;
    const gx0 = Math.floor(Math.min(...cs.map((c) => c.x)) / T), gx1 = Math.ceil(Math.max(...cs.map((c) => c.x)) / T);
    const gy0 = Math.floor(Math.min(...cs.map((c) => c.y)) / T), gy1 = Math.ceil(Math.max(...cs.map((c) => c.y)) / T);
    const b = t.bounds, margin = 340;
    const byColor = {};
    for (let gx = gx0; gx < gx1; gx++) {
      for (let gy = gy0; gy < gy1; gy++) {
        const cx = (gx + 0.5) * T, cy = (gy + 0.5) * T;
        const odd = (gx + gy) & 1;
        let col;
        const out = cx < b.minX - margin || cx > b.maxX + margin || cy < b.minY - margin || cy > b.maxY + margin;
        if (out) col = t.sea ? (odd ? '#2f9fd8' : '#3aaee6') : t.theme === 'volcano' ? (odd ? '#2a1712' : '#331c15') : (odd ? t.ground : t.groundAlt);
        else if (t.theme === 'snowbeach') {
          const frac = (cy - b.minY) / (b.maxY - b.minY);
          col = frac < 0.5 ? (odd ? '#f2f7fb' : '#e6eef5') : frac < 0.62 ? (odd ? '#cfe6f0' : '#c2dde9') : (odd ? '#f2dfa8' : '#e8d295');
        } else col = odd ? t.ground : t.groundAlt;
        (byColor[col] = byColor[col] || []).push([P(gx * T, gy * T), P((gx + 1) * T, gy * T), P((gx + 1) * T, (gy + 1) * T), P(gx * T, (gy + 1) * T)]);
      }
    }
    for (const col in byColor) {
      ctx.beginPath();
      for (const q of byColor[col]) { ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y); ctx.closePath(); }
      ctx.fillStyle = col; ctx.fill();
    }
  }

  function strip(A, B, keep, color) {
    const n = A.length;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      if (keep && !keep(i)) continue;
      const j = (i + 1) % n;
      let q = [A[i], A[j], B[j], B[i]];
      // same winding for every quad, so a tight corner never punches a hole in the road
      const area = (q[1].x - q[0].x) * (q[2].y - q[0].y) - (q[2].x - q[0].x) * (q[1].y - q[0].y);
      if (area < 0) q = q.reverse();
      ctx.moveTo(q[0].x, q[0].y); ctx.lineTo(q[1].x, q[1].y); ctx.lineTo(q[2].x, q[2].y); ctx.lineTo(q[3].x, q[3].y); ctx.closePath();
    }
    ctx.fillStyle = color; ctx.fill();
  }

  function drawRoad() {
    const t = track, hw = t.width / 2;
    const ring = (lat) => t.center.map((c, i) => P(c.x + t.N[i].x * lat, c.y + t.N[i].y * lat, 0));
    const oL = ring(-hw - 16), oR = ring(hw + 16), cL = ring(-hw - 9), cR = ring(hw + 9), rL = ring(-hw), rR = ring(hw);
    strip(oL, oR, null, t.roadEdge);
    strip(cL, rL, (i) => i % 2 === 0, t.curb[0]); strip(rR, cR, (i) => i % 2 === 0, t.curb[0]);
    strip(cL, rL, (i) => i % 2 === 1, t.curb[1]); strip(rR, cR, (i) => i % 2 === 1, t.curb[1]);
    strip(rL, rR, (i) => (i >> 2) % 2 === 0, t.road);
    strip(rL, rR, (i) => (i >> 2) % 2 === 1, t.roadAlt);

    // start / finish checkers
    for (let c = 0; c < 8; c++) {
      for (let r = 0; r < 2; r++) {
        const l0 = -hw + c * (hw / 4), l1 = l0 + hw / 4, s0 = r * 0.25, s1 = s0 + 0.25;
        poly(ctx, [tp(t, s0, l0), tp(t, s1, l0), tp(t, s1, l1), tp(t, s0, l1)].map((p) => P(p.x, p.y)), (c + r) % 2 ? '#fff' : '#222');
      }
    }
  }

  function drawBoostPad(b) {
    const t = track, s0 = b.i, s1 = b.i + 1.5;
    const corners = [tp(t, s0, b.lat - b.hw), tp(t, s1, b.lat - b.hw), tp(t, s1, b.lat + b.hw), tp(t, s0, b.lat + b.hw)].map((p) => P(p.x, p.y));
    if (!corners.some((p) => onScreen(p))) return;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
    poly(ctx, corners, '#14306a', `rgba(79,240,255,${0.6 + pulse * 0.4})`, 2);
    const phase = (performance.now() / 500) % 1;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (let c = 0; c < 3; c++) {
      const s = s0 + ((c + phase) / 3) * 1.1;
      const a = P(...xy(tp(t, s, b.lat - b.hw * 0.7))), tip = P(...xy(tp(t, s + 0.35, b.lat))), z = P(...xy(tp(t, s, b.lat + b.hw * 0.7)));
      ctx.strokeStyle = c === 1 ? '#ffffff' : '#4ff0ff';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(z.x, z.y); ctx.stroke();
    }
  }
  const xy = (p) => [p.x, p.y];

  function drawPool(p) {
    const t = track, hw = t.width / 2 - 8;
    const L = [], R = [];
    for (let k = 0; k <= 6; k++) {
      const s = p.i + (k / 6) * POOL_LEN;
      L.push(P(...xy(tp(t, s, -hw)))); R.push(P(...xy(tp(t, s, hw))));
    }
    if (![...L, ...R].some((q) => onScreen(q))) return;
    const pts = [...L, ...R.reverse()];
    const now = performance.now();
    if (t.pool === 'water') {
      poly(ctx, pts, '#2f9fe0', '#1f6fb8', 2);
      for (let k = 0; k < 5; k++) {
        const q = P(...xy(tp(t, p.i + 0.4 + k * 0.5, Math.sin(now / 400 + k * 2) * hw * 0.6)));
        ellipse(ctx, q.x, q.y, 7, 2, 'rgba(255,255,255,.55)');
      }
    } else if (t.pool === 'snow') {
      poly(ctx, pts, '#ffffff', '#b9d0e0', 2);
      for (let k = 0; k < 6; k++) {
        const q = P(...xy(tp(t, p.i + 0.3 + (k % 3) * 0.9, (k < 3 ? -0.35 : 0.35) * hw)), 3);
        ellipse(ctx, q.x, q.y, 10, 4, '#eef6fc');
      }
    } else {
      poly(ctx, pts, '#ff5a1f', '#ffd23f', 2);
      for (let k = 0; k < 5; k++) {
        const q = P(...xy(tp(t, p.i + 0.4 + k * 0.5, Math.cos(now / 500 + k * 1.7) * hw * 0.6)));
        ellipse(ctx, q.x, q.y, 5 + Math.sin(now / 200 + k) * 2, 2.5, '#ffd23f');
      }
    }
  }

  function drawRamp(r) {
    const t = track, hw = t.width / 2 - 2;
    const steps = 8;
    const Lg = [], Rg = [], Lt = [], Rt = [];
    for (let k = 0; k <= steps; k++) {
      const s = r.i + (k / steps) * RAMP_LEN, h = (k / steps) * RAMP_H;
      const l = tp(t, s, -hw), rr = tp(t, s, hw);
      Lg.push(P(l.x, l.y, 0)); Rg.push(P(rr.x, rr.y, 0));
      Lt.push(P(l.x, l.y, h)); Rt.push(P(rr.x, rr.y, h));
    }
    if (![...Lg, ...Rg].some((q) => onScreen(q))) return;
    const side = '#a0521e', front = '#c7652a';
    poly(ctx, [...Lg, ...Lt.slice().reverse()], side);
    poly(ctx, [...Rg, ...Rt.slice().reverse()], side);
    poly(ctx, [Lg[steps], Rg[steps], Rt[steps], Lt[steps]], front);
    for (let k = 0; k < steps; k++) {
      poly(ctx, [Lt[k], Lt[k + 1], Rt[k + 1], Rt[k]], k % 2 ? '#ff6a2b' : '#ffd23f');
    }
    poly(ctx, [...Lt, ...Rt.slice().reverse()], null, '#6a3410', 1);
  }

  function drawDecor(d, p) {
    const u = S * d.s;
    const shadowAt = (r) => ellipse(ctx, p.x, p.y, r * u, r * u * 0.5, 'rgba(0,0,0,.18)');
    switch (d.kind) {
      case 'palm': {
        shadowAt(12);
        ctx.strokeStyle = '#7a5228'; ctx.lineWidth = 4 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + 7 * u, p.y - 22 * u, p.x + 3 * u, p.y - 40 * u); ctx.stroke();
        const tx = p.x + 3 * u, ty = p.y - 40 * u;
        ctx.fillStyle = '#2f8f45';
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * Math.PI * 2 + 0.3;
          ctx.beginPath(); ctx.ellipse(tx + Math.cos(ang) * 9 * u, ty + Math.sin(ang) * 4 * u + 2 * u, 10 * u, 3.4 * u, ang, 0, Math.PI * 2); ctx.fill();
        }
        ellipse(ctx, tx, ty, 4 * u, 3 * u, '#3fae58');
        break;
      }
      case 'pine': {
        shadowAt(11);
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(p.x - 2 * u, p.y - 8 * u, 4 * u, 8 * u);
        for (let k = 0; k < 3; k++) {
          const by = p.y - 6 * u - k * 10 * u, w = (12 - k * 3) * u;
          poly(ctx, [{ x: p.x, y: by - 16 * u }, { x: p.x - w, y: by }, { x: p.x + w, y: by }], k % 2 ? '#2a7448' : '#1f5f3a');
        }
        poly(ctx, [{ x: p.x, y: p.y - 42 * u }, { x: p.x - 4 * u, y: p.y - 34 * u }, { x: p.x + 4 * u, y: p.y - 34 * u }], '#eaf6ff');
        break;
      }
      case 'chest': {
        const hw = 9 * d.s, hh = 6 * d.s;
        drawBox(ctx, P, [{ x: d.x - hw, y: d.y - hh }, { x: d.x + hw, y: d.y - hh }, { x: d.x + hw, y: d.y + hh }, { x: d.x - hw, y: d.y + hh }],
          0, 12 * d.s, '#a0662a', '#5a3a1a', '#7a4a1e', 'rgba(0,0,0,.3)');
        const a = P(d.x - hw, d.y + hh, 8 * d.s), b = P(d.x + hw, d.y + hh, 8 * d.s), c = P(d.x + hw, d.y - hh, 8 * d.s);
        ctx.strokeStyle = '#ffd23f'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.lineTo(c.x, c.y); ctx.stroke();
        break;
      }
      case 'barrel': {
        shadowAt(8);
        ctx.fillStyle = '#8a5a2a'; ctx.fillRect(p.x - 6 * u, p.y - 16 * u, 12 * u, 16 * u);
        ellipse(ctx, p.x, p.y, 6 * u, 3 * u, '#8a5a2a');
        ellipse(ctx, p.x, p.y - 16 * u, 6 * u, 3 * u, '#a87038');
        ctx.fillStyle = '#5a3a1a'; ctx.fillRect(p.x - 6 * u, p.y - 11 * u, 12 * u, 1.5 * u); ctx.fillRect(p.x - 6 * u, p.y - 5 * u, 12 * u, 1.5 * u);
        break;
      }
      case 'umbrella': {
        shadowAt(14);
        ctx.strokeStyle = '#eee'; ctx.lineWidth = 1.5 * u;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 28 * u); ctx.stroke();
        for (let k = 0; k < 6; k++) {
          ctx.fillStyle = k % 2 ? '#fff' : '#ff4f6d';
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 34 * u);
          ctx.ellipse(p.x, p.y - 28 * u, 16 * u, 6 * u, 0, Math.PI * (k / 6), Math.PI * ((k + 1) / 6), false);
          ctx.closePath(); ctx.fill();
        }
        ctx.fillStyle = '#ff4f6d';
        ctx.beginPath(); ctx.ellipse(p.x, p.y - 28 * u, 16 * u, 8 * u, 0, Math.PI, Math.PI * 2); ctx.fill();
        break;
      }
      case 'snowrock':
        shadowAt(10);
        ellipse(ctx, p.x, p.y - 4 * u, 10 * u, 6 * u, '#9fb0bd');
        ellipse(ctx, p.x - 1 * u, p.y - 7 * u, 7 * u, 4 * u, '#ffffff');
        break;
      case 'lavarock':
        shadowAt(10);
        ellipse(ctx, p.x, p.y - 4 * u, 10 * u, 7 * u, '#2b1a15');
        ctx.fillStyle = '#ff6a2b'; ctx.fillRect(p.x - 4 * u, p.y - 5 * u, 8 * u, 1.6 * u);
        break;
      case 'deadtree':
        shadowAt(8);
        ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 3 * u; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x, p.y - 26 * u);
        ctx.moveTo(p.x, p.y - 14 * u); ctx.lineTo(p.x - 8 * u, p.y - 22 * u);
        ctx.moveTo(p.x, p.y - 18 * u); ctx.lineTo(p.x + 8 * u, p.y - 28 * u);
        ctx.stroke();
        break;
      default:
        shadowAt(8);
        ellipse(ctx, p.x, p.y - 3 * u, 8 * u, 5 * u, '#8a8a8a');
        ellipse(ctx, p.x - 1.5 * u, p.y - 5 * u, 5 * u, 3 * u, '#a8a8a8');
    }
  }

  function drawObstacle(o, p) {
    if (o.kind === 'crate') {
      const h = o.r * 0.8, fx = Math.cos(o.a), fy = Math.sin(o.a);
      const pt = (u, v) => ({ x: o.x + fx * u - fy * v, y: o.y + fy * u + fx * v });
      groundShadow(o.x, o.y, 0, o.r * 1.1);
      drawBox(ctx, P, [pt(-h, -h), pt(h, -h), pt(h, h), pt(-h, h)], 0, o.r * 1.4, '#c08a44', '#7a4c1e', '#9a6630', '#5a3a1a');
      const a = P(...xy(pt(-h, -h)), o.r * 1.4), b = P(...xy(pt(h, h)), o.r * 1.4), c = P(...xy(pt(h, -h)), o.r * 1.4), d = P(...xy(pt(-h, h)), o.r * 1.4);
      ctx.strokeStyle = '#7a4c1e'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y); ctx.stroke();
    } else {
      const r = o.r * S;
      ellipse(ctx, p.x, p.y, r * 1.2, r * 0.6, 'rgba(0,0,0,.25)');
      ellipse(ctx, p.x, p.y - r * 0.6, r * 1.05, r * 0.85, '#2b1a15');
      ellipse(ctx, p.x - r * 0.3, p.y - r * 0.95, r * 0.5, r * 0.35, '#6a4a3a');
    }
  }

  function drawVolcano(v) {
    const b = P(v.x, v.y, 0), rx = v.r * S, ry = rx * 0.5, hz = v.r * 0.75 * S, tr = 0.32;
    ellipse(ctx, b.x, b.y, rx * 1.05, ry * 1.05, '#2a1712');
    ctx.fillStyle = '#4e2e25';
    ctx.beginPath();
    ctx.moveTo(b.x - rx, b.y); ctx.lineTo(b.x - rx * tr, b.y - hz); ctx.lineTo(b.x + rx * tr, b.y - hz); ctx.lineTo(b.x + rx, b.y);
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath();
    ctx.moveTo(b.x, b.y - hz); ctx.lineTo(b.x + rx * tr, b.y - hz); ctx.lineTo(b.x + rx, b.y);
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI / 2); ctx.closePath(); ctx.fill();
    // lava running down
    ctx.strokeStyle = '#ff6a2b'; ctx.lineWidth = 3; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(b.x - rx * 0.1, b.y - hz); ctx.quadraticCurveTo(b.x - rx * 0.3, b.y - hz * 0.5, b.x - rx * 0.45, b.y + ry * 0.4);
    ctx.moveTo(b.x + rx * 0.12, b.y - hz); ctx.quadraticCurveTo(b.x + rx * 0.2, b.y - hz * 0.4, b.x + rx * 0.3, b.y + ry * 0.6);
    ctx.stroke();
    ellipse(ctx, b.x, b.y - hz, rx * tr, ry * tr, '#ff6a2b');
    ellipse(ctx, b.x, b.y - hz, rx * tr * 0.6 + Math.sin(performance.now() / 220) * 1.5, ry * tr * 0.6, '#ffd23f');
    const now = performance.now() / 1000;
    for (let k = 0; k < 4; k++) {
      const ph = (now * 0.4 + k / 4) % 1;
      ellipse(ctx, b.x + Math.sin(ph * 6 + k) * 8, b.y - hz - ph * 70, 6 + ph * 14, 4 + ph * 9, `rgba(90,80,80,${0.5 * (1 - ph)})`);
    }
  }

  function drawCoin(c, p) {
    const wob = Math.abs(Math.cos(performance.now() / 300 + c.x * 0.01));
    groundShadow(c.x, c.y, 0, 7, 0.15);
    const q = P(c.x, c.y, c.z + 12);
    ellipse(ctx, q.x, q.y, 6 * wob + 1.5, 6, '#a86800');
    ellipse(ctx, q.x, q.y, 4.6 * wob + 1, 4.6, '#ffd23f');
    if (wob > 0.55) {
      ellipse(ctx, q.x - 2, q.y - 2, 1.2, 1.2, '#a86800');
      ellipse(ctx, q.x + 2, q.y - 2, 1.2, 1.2, '#a86800');
      ellipse(ctx, q.x, q.y + 0.6, 1.3, 1.3, '#a86800');
    }
  }

  function drawNitro(q) {
    groundShadow(q.x, q.y, 0, 9, 0.2);
    const bob = Math.sin(performance.now() / 250 + q.i) * 3;
    const p = P(q.x, q.y, 14 + bob);
    ctx.save();
    ctx.shadowColor = '#4ff0ff'; ctx.shadowBlur = 10;
    ctx.fillStyle = '#1f6fe0'; ctx.fillRect(p.x - 4.5, p.y - 8, 9, 14);
    ctx.restore();
    ctx.fillStyle = '#e03a3a'; ctx.fillRect(p.x - 2.5, p.y - 11, 5, 3);
    ctx.fillStyle = '#fff'; ctx.font = 'bold 8px monospace'; ctx.textAlign = 'center';
    ctx.fillText('N', p.x, p.y + 3);
  }

  function drawSprites() {
    const list = [];
    const t = track;
    for (const d of t.decor) { const p = P(d.x, d.y); if (onScreen(p)) list.push({ d: d.x + d.y, f: () => drawDecor(d, p) }); }
    for (const o of t.obstacles) { if (o.kind === 'ice') continue; const p = P(o.x, o.y); if (onScreen(p)) list.push({ d: o.x + o.y, f: () => drawObstacle(o, p) }); }
    for (const c of t.coins) { if (c.taken) continue; const p = P(c.x, c.y, c.z); if (onScreen(p)) list.push({ d: c.x + c.y, f: () => drawCoin(c, p) }); }
    for (const q of t.nitros) { if (q.respawn > 0) continue; const p = P(q.x, q.y); if (onScreen(p)) list.push({ d: q.x + q.y, f: () => drawNitro(q) }); }
    if (t.volcano) list.push({ d: t.volcano.x + t.volcano.y, f: () => drawVolcano(t.volcano) });
    for (const b of race.bombs) {
      if (b.warn <= 0) continue;
      list.push({ d: b.x + b.y, f: () => {
        const p = P(b.x, b.y, b.warn * 480);
        ctx.save(); ctx.shadowColor = '#ff6a2b'; ctx.shadowBlur = 10;
        ellipse(ctx, p.x, p.y, 6, 6, '#2b1a15');
        ctx.restore();
        ellipse(ctx, p.x - 1.5, p.y - 1.5, 2, 2, '#ff6a2b');
      } });
    }
    if (ghost.visible) list.push({ d: ghost.x + ghost.y, f: () => drawIsoKart(ctx, P, ghost.x, ghost.y, ghost.z, ghost.a, GHOST_LOOK, 0.35) });
    const me = playerLook();
    for (const k of karts) {
      const p = P(k.x, k.y, k.z);
      if (!onScreen(p, 80)) continue;
      const blink = k.bump > 0 && Math.floor(performance.now() / 70) % 2 === 0;
      list.push({ d: k.x + k.y, f: () => drawIsoKart(ctx, P, k.x, k.y, k.z, k.a, k === kart ? me : k.look, blink ? 0.45 : 1) });
    }
    list.sort((a, b) => a.d - b.d);
    for (const s of list) s.f();
  }

  function drawWorld() {
    const t = track;
    drawGround();
    for (const o of t.obstacles) {
      if (o.kind !== 'ice') continue;
      const p = P(o.x, o.y);
      if (!onScreen(p)) continue;
      ellipse(ctx, p.x, p.y, o.r * S, o.r * S * 0.5, 'rgba(180,235,255,.7)');
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 1; ctx.stroke();
    }
    drawRoad();
    t.boosts.forEach(drawBoostPad);
    t.pools.forEach(drawPool);
    t.ramps.forEach(drawRamp);
    for (const b of race.bombs) {
      const p = P(b.x, b.y);
      const rx = b.r * S, ry = rx * 0.5;
      if (b.warn > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
        ellipse(ctx, p.x, p.y, rx, ry, `rgba(255,106,43,${0.15 + pulse * 0.15})`);
        ctx.strokeStyle = `rgba(255,80,40,${0.5 + pulse * 0.5})`; ctx.lineWidth = 2; ctx.stroke();
      } else if (b.blast > 0) {
        const k = b.blast / 0.45;
        ellipse(ctx, p.x, p.y, rx * (1.2 - k * 0.2), ry * (1.2 - k * 0.2), `rgba(255,${Math.round(120 + 100 * k)},40,${k})`);
      }
    }
    // shadows on whatever is under the kart (the ramp, or the ground)
    for (const k of karts) groundShadow(k.x, k.y, k.groundZ, 17 / (1 + Math.max(0, k.z - k.groundZ) / 90), 0.28);
    if (ghost.visible) groundShadow(ghost.x, ghost.y, 0, 15, 0.1);
    drawSprites();
    for (const p of particles) {
      const q = P(p.x, p.y, p.z);
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.col;
      ctx.fillRect(q.x - p.size / 2, q.y - p.size / 2, p.size, p.size);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    for (const p of popups) {
      const q = P(p.x, p.y, p.z + 20);
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = '#000'; ctx.fillText(p.text, q.x + 1, q.y + 1);
      ctx.fillStyle = p.col; ctx.fillText(p.text, q.x, q.y);
    }
    ctx.globalAlpha = 1;
  }

  // ---------- HUD ----------
  function buildMinimap(t) {
    const raw = t.center.map((c) => ({ x: (c.x - c.y) * C, y: (c.x + c.y) * C * 0.5 }));
    const minX = Math.min(...raw.map((p) => p.x)), maxX = Math.max(...raw.map((p) => p.x));
    const minY = Math.min(...raw.map((p) => p.y)), maxY = Math.max(...raw.map((p) => p.y));
    const bw = 76, bh = 46, bx = W - 8 - bw, by = 54;
    const s = Math.min(bw / (maxX - minX), bh / (maxY - minY));
    const ox = bx + (bw - (maxX - minX) * s) / 2, oy = by + (bh - (maxY - minY) * s) / 2;
    const map = (x, y) => ({ x: ox + ((x - y) * C - minX) * s, y: oy + ((x + y) * C * 0.5 - minY) * s });
    return { map, pts: t.center.map((c) => map(c.x, c.y)), box: [bx - 4, by - 4, bw + 8, bh + 8] };
  }

  function drawMinimap() {
    const mm = minimap;
    ctx.fillStyle = 'rgba(10,6,24,.45)';
    ctx.fillRect(...mm.box);
    ctx.lineJoin = 'round';
    ctx.beginPath(); mm.pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath();
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.stroke();
    ctx.strokeStyle = '#e6eef5'; ctx.lineWidth = 2; ctx.stroke();
    const st = mm.pts[0];
    ctx.fillStyle = '#ffe14f'; ctx.fillRect(st.x - 1.5, st.y - 1.5, 3, 3);
    for (const r of rivals) { const p = mm.map(r.x, r.y); ellipse(ctx, p.x, p.y, 2.4, 2.4, r.look.body); }
    const p = mm.map(kart.x, kart.y);
    ellipse(ctx, p.x, p.y, 3.4, 3.4, '#fff');
    ellipse(ctx, p.x, p.y, 2.4, 2.4, '#2f8fe0');
  }

  function drawHUD() {
    ctx.save();
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(`LAP ${Math.max(1, Math.min(LAPS, kart.lap))}/${LAPS}`, 10, 20);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.fillText(fmtTime(kart.done ? kart.finishTime : race.time), 10, 38);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('BEST ' + fmtTime(save.bestTimes[track.id]), 10, 51);

    // nitro cans
    ctx.fillStyle = '#fff'; ctx.fillText('NITRO', 10, 66);
    for (let i = 0; i < NITRO_MAX; i++) {
      const x = 44 + i * 11, full = i < kart.nitro;
      ctx.fillStyle = full ? '#1f6fe0' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x, 57, 8, 11);
      ctx.fillStyle = full ? '#e03a3a' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x + 2, 55, 4, 2);
    }

    // coins + place
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('* ' + race.coinsGot, W - 10, 20);
    const place = kart.done ? race.order.indexOf(kart) + 1 : livePlace();
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = PLACE_COLORS[place - 1];
    ctx.fillText(PLACE_NAMES[place - 1], W - 26, 43);
    ctx.font = '9px monospace'; ctx.fillStyle = '#fff';
    ctx.fillText('/4', W - 10, 43);

    // speedometer
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = kart.boost > 0 ? '#4ff0ff' : kart.onRoad ? '#fff' : '#ff8f4f';
    ctx.fillText(kart.boost > 0 ? 'BOOST! ' + Math.round(kart.speed) + ' KPH' : kart.onRoad ? Math.round(kart.speed) + ' KPH' : 'OFF ROAD!', W / 2, H - 8);
    ctx.restore();
    drawMinimap();
  }

  function bigText(text, color, y = H / 2 + 14, size = 48) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = `bold ${size}px monospace`;
    ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 14;
    ctx.fillText(text, W / 2, y);
    ctx.restore();
  }

  function render() {
    if (!track) return;
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - 0.5) * shake * 20, (Math.random() - 0.5) * shake * 20);
    drawWorld();
    ctx.restore();
    drawHUD();
    if (race.state === 'countdown') {
      const n = Math.ceil(race.countdown);
      bigText(n > 0 ? String(n) : 'GO!', n > 0 ? '#ffe14f' : '#4fff8f');
    } else if (race.state === 'racing' && race.time < 0.8) {
      bigText('GO!', '#4fff8f');
    } else if (race.state === 'finish' && race.result) {
      const pl = race.result.place;
      bigText(PLACE_NAMES[pl - 1] + ' PLACE!', PLACE_COLORS[pl - 1], H / 2, 36);
    }
    if (race.wrongWay > 0.8 && race.state === 'racing') {
      bigText('WRONG WAY! TURN AROUND', '#ff6a6a', H / 2 + 40, 16);
    }
  }

  // ---------- Screens / UI ----------
  const el = (id) => document.getElementById(id);
  function show(name) {
    screen = name;
    pad.show(name === 'race');
    ['tracks', 'garage', 'race', 'results'].forEach(s => el('screen-' + s).classList.toggle('active', s === name));
    if (name === 'tracks') renderTrackCards();
    if (name === 'garage') renderGarage(true);
    el('coins-tracks').textContent = save.coins;
    el('coins-garage').textContent = save.coins;
    if (name !== 'race') {
      // Start on the screen's first carousel if it has one, else its first button.
      const rows = menuRows();
      const first = rows.find((r) => MickleCarousel.of(r)) || rows[0];
      if (first) focusRow(first);
    }
  }

  function trackThumb(t) {
    const c = document.createElement('canvas');
    c.width = 160; c.height = 100;
    const g = c.getContext('2d');
    // the same angled view as the race, squeezed onto the card
    const raw = t.center.map((p) => ({ x: (p.x - p.y) * C, y: (p.x + p.y) * C * 0.5 }));
    const minX = Math.min(...raw.map((p) => p.x)), maxX = Math.max(...raw.map((p) => p.x));
    const minY = Math.min(...raw.map((p) => p.y)), maxY = Math.max(...raw.map((p) => p.y));
    const pad = 14;
    const s = Math.min((c.width - pad * 2) / (maxX - minX), (c.height - pad * 2) / (maxY - minY));
    const ox = (c.width - (maxX - minX) * s) / 2, oy = (c.height - (maxY - minY) * s) / 2;
    const Pm = (x, y, z = 0) => ({ x: ox + ((x - y) * C - minX) * s, y: oy + ((x + y) * C * 0.5 - minY) * s - z * s });

    g.fillStyle = t.sea ? '#2f9fd8' : t.ground;
    g.fillRect(0, 0, c.width, c.height);
    const b = t.bounds, m = 200;
    poly(g, [Pm(b.minX - m, b.minY - m), Pm(b.maxX + m, b.minY - m), Pm(b.maxX + m, b.maxY + m), Pm(b.minX - m, b.maxY + m)], t.theme === 'snowbeach' ? '#f2f7fb' : t.ground);
    if (t.volcano) {
      const v = Pm(t.volcano.x, t.volcano.y);
      g.fillStyle = '#3a221c';
      g.beginPath(); g.ellipse(v.x, v.y, t.volcano.r * s, t.volcano.r * s * 0.5, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff6a2b';
      g.beginPath(); g.ellipse(v.x, v.y - 8, t.volcano.r * s * 0.35, t.volcano.r * s * 0.18, 0, 0, Math.PI * 2); g.fill();
    }
    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    t.center.forEach((pt, i) => { const p = Pm(pt.x, pt.y); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
    g.closePath();
    g.strokeStyle = t.roadEdge; g.lineWidth = t.width * s * 0.8 + 3; g.stroke();
    g.strokeStyle = t.road; g.lineWidth = t.width * s * 0.8; g.stroke();
    for (const r of t.ramps) { const p = tp(t, r.i + 1, 0), q = Pm(p.x, p.y); g.fillStyle = '#ffd23f'; g.fillRect(q.x - 2.5, q.y - 2.5, 5, 5); }
    for (const bo of t.boosts) { const p = tp(t, bo.i, bo.lat), q = Pm(p.x, p.y); g.fillStyle = '#4ff0ff'; g.fillRect(q.x - 2, q.y - 2, 4, 4); }
    const st = Pm(t.center[0].x, t.center[0].y);
    g.fillStyle = '#fff'; g.fillRect(st.x - 3, st.y - 3, 6, 6);
    g.fillStyle = '#222'; g.fillRect(st.x - 3, st.y - 3, 3, 3); g.fillRect(st.x, st.y, 3, 3);
    return c;
  }

  // Clicking the middle card (anywhere but its own button) presses its button.
  const pressCardButton = (i, card) => {
    const btn = card.querySelector('button');
    if (btn && !btn.disabled) { ensureAudio(); btn.click(); }
  };
  const trackShelf = MickleCarousel.create(el('track-cards'), { onActivate: pressCardButton });
  const skinShelf = MickleCarousel.create(el('skin-cards'), { onActivate: pressCardButton });
  const hatShelf = MickleCarousel.create(el('hat-cards'), { onActivate: pressCardButton });

  function renderTrackCards() {
    const wrap = el('track-cards');
    wrap.innerHTML = '';
    for (const t of tracks) {
      const card = document.createElement('div');
      card.className = 'card';
      card.tabIndex = 0;
      card.appendChild(trackThumb(t));
      const name = document.createElement('div');
      name.className = 'name'; name.textContent = t.name;
      const sub = document.createElement('div');
      sub.className = 'sub'; sub.innerHTML = t.sub;
      const best = document.createElement('div');
      best.className = 'best';
      best.textContent = 'BEST: ' + fmtTime(save.bestTimes[t.id]);
      const btn = document.createElement('button');
      btn.className = 'small'; btn.textContent = 'RACE!';
      btn.tabIndex = -1;
      btn.addEventListener('click', () => { ensureAudio(); newRace(t); show('race'); });
      card.append(name, sub, best, btn);
      wrap.appendChild(card);
    }
    // Open on the track you raced last.
    trackShelf.refresh(Math.max(0, tracks.indexOf(track)));
  }

  function itemPreview(skinId, hatId) {
    const c = document.createElement('canvas');
    c.width = 120; c.height = 96;
    const g = c.getContext('2d');
    g.fillStyle = '#171030';
    g.fillRect(0, 0, c.width, c.height);
    const k = 1.45, cx = 60, cy = 74;
    const pj = (x, y, z) => ({ x: cx + (x - y) * C * k, y: cy + (x + y) * C * k * 0.5 - z * k });
    pj.k = k;
    g.fillStyle = 'rgba(0,0,0,.35)';
    g.beginPath(); g.ellipse(cx, cy, 26, 11, 0, 0, Math.PI * 2); g.fill();
    drawIsoKart(g, pj, 0, 0, 0, Math.PI * 0.32, playerLook(skinId, hatId));
    return c;
  }

  // fresh: true when opening the garage (start on what Freddy is wearing); otherwise the
  // cards were just re-rendered after wearing something, so stay put.
  function renderGarage(fresh) {
    const skinWrap = el('skin-cards');
    const hatWrap = el('hat-cards');
    skinWrap.innerHTML = ''; hatWrap.innerHTML = '';

    for (const skin of SKINS) {
      skinWrap.appendChild(makeItemCard(skin, 'skin', skin.id, save.hat));
    }
    for (const hat of HATS) {
      hatWrap.appendChild(makeItemCard(hat, 'hat', save.skin, hat.id));
    }
    skinShelf.refresh(fresh ? Math.max(0, SKINS.findIndex((sk) => sk.id === save.skin)) : undefined);
    hatShelf.refresh(fresh ? Math.max(0, HATS.findIndex((h) => h.id === save.hat)) : undefined);
  }

  function makeItemCard(item, kind, skinId, hatId) {
    const unlocked = isUnlocked(item);
    const equipped = kind === 'skin' ? save.skin === item.id : save.hat === item.id;
    const card = document.createElement('div');
    card.className = 'card' + (unlocked ? '' : ' locked') + (equipped ? ' equipped' : '');
    card.tabIndex = 0;
    card.appendChild(itemPreview(skinId, hatId));
    const name = document.createElement('div');
    name.className = 'name'; name.textContent = item.name;
    const sub = document.createElement('div');
    sub.className = 'sub';
    sub.textContent = unlocked ? (equipped ? 'EQUIPPED' : 'UNLOCKED') : `NEEDS ${item.cost} COINS`;
    const btn = document.createElement('button');
    btn.className = 'small';
    btn.textContent = equipped ? 'WEARING' : 'WEAR IT';
    btn.disabled = !unlocked || equipped;
    btn.tabIndex = -1;
    btn.addEventListener('click', () => {
      // Re-rendering replaces the cards, so put focus back on the same row's middle card.
      const row = MickleCarousel.of(document.activeElement);
      if (kind === 'skin') save.skin = item.id; else save.hat = item.id;
      writeSave(); renderGarage();
      if (row) focusRow(row.strip);
    });
    card.append(name, sub, btn);
    return card;
  }

  function showResults(r) {
    const title = el('result-title');
    const body = el('result-body');
    title.textContent = PLACE_NAMES[r.place - 1] + ' PLACE!';
    title.style.color = PLACE_COLORS[r.place - 1];

    const rows = [];
    rows.push(`<div class="result-big">${fmtTime(r.time)}</div>`);
    rows.push(`<div class="unlock">${PLACE_NAMES[r.place - 1]} PLACE BONUS +${PLACE_BONUS[r.place - 1]} COINS</div>`);
    if (r.isBest) {
      rows.push(`<div class="unlock">NEW BEST TIME! +${BEST_BONUS} BONUS COINS</div>`);
      if (r.prevBest != null) rows.push(`<div class="result-line" style="font-size:.8rem;color:#b9b0e0">OLD BEST ${fmtTime(r.prevBest)}</div>`);
    } else {
      rows.push(`<div class="result-line" style="font-size:.85rem;color:#b9b0e0">BEST ${fmtTime(r.prevBest)} &mdash; KEEP TRYING!</div>`);
    }
    rows.push(`<div class="result-line" style="color:#ffd23f">COINS THIS RACE: ${r.coinsGot} +${r.bonus}</div>`);
    rows.push(`<div class="result-line" style="color:#ffd23f">TOTAL COINS: ${save.coins}</div>`);

    const newly = [...SKINS, ...HATS].filter(i => i.cost > 0 && r.coinsBefore < i.cost && save.coins >= i.cost);
    for (const item of newly) rows.push(`<div class="unlock">UNLOCKED: ${item.name}!</div>`);

    body.innerHTML = rows.join('');
    show('results');
  }

  el('btn-garage').addEventListener('click', () => show('garage'));
  el('btn-garage-back').addEventListener('click', () => show('tracks'));
  el('btn-results-garage').addEventListener('click', () => show('garage'));
  el('btn-tracks').addEventListener('click', () => show('tracks'));
  el('btn-again').addEventListener('click', () => { newRace(track); show('race'); });

  // ---------- Loop ----------
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (typeof Pad360 !== 'undefined') {
      Pad360.poll();
      if (screen !== 'race') pollMenuGamepad();
    }
    if (screen === 'race') { updateRace(dt); if (screen === 'race') render(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  show('tracks');})();
