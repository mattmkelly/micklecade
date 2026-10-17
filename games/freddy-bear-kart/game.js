(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H);
  const CAM_SCALE = 0.5;

  const LAPS = 3;
  const SAVE_KEY = 'freddyBearRacing.save';
  const FIRST_PLACE_BONUS = 5;

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

  const defaultSave = { coins: 0, bestTimes: {}, ghosts: {}, skin: 'classic', hat: 'cap' };
  let save = loadSave();

  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return { ...defaultSave };
      return { ...defaultSave, ...JSON.parse(raw) };
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
  const sfxCoin = () => { beep(1000, 0.07, 'square', 0.12); beep(1400, 0.07, 'square', 0.1, 0.05); };
  const sfxCrash = () => beep(120, 0.3, 'sawtooth', 0.16);
  const sfxLap = () => { beep(600, 0.1, 'triangle', 0.14); beep(900, 0.14, 'triangle', 0.14, 0.09); };
  const sfxCount = () => beep(500, 0.15, 'square', 0.14);
  const sfxGo = () => { beep(800, 0.2, 'square', 0.16); beep(1200, 0.25, 'square', 0.14, 0.12); };
  const sfxWin = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'triangle', 0.15, i * 0.13)); };

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
  const fmtTime = (s) => {
    if (s == null) return '--:--.--';
    const m = Math.floor(s / 60), sec = s - m * 60;
    return `${m}:${sec.toFixed(2).padStart(5, '0')}`;
  };

  // ---------- Tracks ----------
  const TRACK_DEFS = [
    {
      id: 'treasure',
      name: 'TREASURE COVE',
      sub: 'Pirate gold &amp; golden sand',
      theme: 'treasure',
      width: 150,
      ground: '#e8c86a', groundAlt: '#d9b352',
      road: '#c9a24a', roadEdge: '#8a6b25',
      seed: 11,
      points: [ {x:300,y:760},{x:430,y:400},{x:800,y:250},{x:1180,y:310},{x:1500,y:200},{x:1860,y:360},{x:1960,y:720},{x:1740,y:1060},{x:1380,y:1160},{x:1040,y:1000},{x:740,y:1160},{x:400,y:1090} ],
      obstacle: 'crate',
      obstacleCount: 12,
    },
    {
      id: 'snowbeach',
      name: 'SNOW TO SURF',
      sub: 'Icy peak down to a sunny beach',
      theme: 'snowbeach',
      width: 155,
      ground: '#f2f7fb', groundAlt: '#e6eef5',
      road: '#b9c6d2', roadEdge: '#8fa0b0',
      seed: 27,
      points: [ {x:350,y:300},{x:720,y:180},{x:1100,y:260},{x:1460,y:190},{x:1830,y:330},{x:1960,y:660},{x:1700,y:920},{x:1300,y:870},{x:1010,y:1060},{x:1260,y:1270},{x:880,y:1370},{x:500,y:1260},{x:290,y:940},{x:250,y:600} ],
      obstacle: 'ice',
      obstacleCount: 14,
    },
    {
      id: 'volcano',
      name: 'VOLCANO PASS',
      sub: 'Watch out for lava bombs!',
      theme: 'volcano',
      width: 158,
      ground: '#4a2f28', groundAlt: '#3d251f',
      road: '#5c5148', roadEdge: '#2e2620',
      seed: 43,
      points: [ {x:1100,y:250},{x:1520,y:300},{x:1810,y:560},{x:1860,y:910},{x:1550,y:1210},{x:1100,y:1310},{x:640,y:1210},{x:340,y:900},{x:380,y:540},{x:700,y:290} ],
      obstacle: 'rock',
      obstacleCount: 10,
      volcano: { x: 1100, y: 780, r: 190 },
      lavaBombs: true,
    },
  ];

  const tracks = TRACK_DEFS.map(buildTrack);

  function buildTrack(def) {
    const center = smoothLoop(def.points);
    const n = center.length;

    // cumulative length, used for start heading + decor spacing
    const headingAt = (i) => {
      const a = center[i], b = center[(i + 1) % n];
      return Math.atan2(b.y - a.y, b.x - a.x);
    };

    const rng = makeRng(def.seed);

    // coins: spaced along the centerline, weaving side to side
    const coins = [];
    for (let i = 6; i < n; i += 7) {
      const h = headingAt(i);
      const off = Math.sin(i * 0.7) * (def.width * 0.28);
      coins.push({ x: center[i].x + Math.cos(h + Math.PI / 2) * off, y: center[i].y + Math.sin(h + Math.PI / 2) * off, taken: false });
    }

    // obstacles: near the edges of the road so there's a clean line through
    const obstacles = [];
    for (let k = 0; k < def.obstacleCount; k++) {
      const i = Math.floor(8 + rng() * (n - 16));
      const h = headingAt(i);
      const side = rng() < 0.5 ? -1 : 1;
      const off = side * (def.width * (0.26 + rng() * 0.14));
      obstacles.push({
        x: center[i].x + Math.cos(h + Math.PI / 2) * off,
        y: center[i].y + Math.sin(h + Math.PI / 2) * off,
        r: def.obstacle === 'ice' ? 38 : 20,
        kind: def.obstacle,
      });
    }

    // scenery, scattered off-road
    const decor = [];
    const bounds = center.reduce((b, p) => ({
      minX: Math.min(b.minX, p.x), maxX: Math.max(b.maxX, p.x),
      minY: Math.min(b.minY, p.y), maxY: Math.max(b.maxY, p.y),
    }), { minX: 1e9, maxX: -1e9, minY: 1e9, maxY: -1e9 });
    const pad = 260;
    for (let k = 0; k < 150; k++) {
      const x = bounds.minX - pad + rng() * (bounds.maxX - bounds.minX + pad * 2);
      const y = bounds.minY - pad + rng() * (bounds.maxY - bounds.minY + pad * 2);
      if (distToCenter(center, x, y).dist < def.width * 0.75 + 40) continue;
      if (def.volcano && Math.hypot(x - def.volcano.x, y - def.volcano.y) < def.volcano.r + 40) continue;
      decor.push({ x, y, kind: pickDecor(def.theme, y, bounds, rng), s: 0.8 + rng() * 0.6 });
    }

    return { ...def, center, n, coins, obstacles, decor, bounds, headingAt };
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
    let best = 1e9, bestIdx = 0;
    for (let i = 0; i < center.length; i++) {
      const a = center[i], b = center[(i + 1) % center.length];
      const d = distToSeg(x, y, a.x, a.y, b.x, b.y);
      if (d < best) { best = d; bestIdx = i; }
    }
    return { dist: best, idx: bestIdx };
  }

  // ---------- Game state ----------
  let screen = 'tracks';
  let track = null;
  let kart, ghost, race, camera;
  const keys = {};
  const touch = { left: false, right: false, brake: false };

  function newRace(t) {
    track = t;
    const h = track.headingAt(0);
    kart = {
      x: track.center[0].x, y: track.center[0].y, a: h,
      speed: 0, bump: 0, bumpCd: 0, onRoad: true, grip: 1,
    };
    track.coins.forEach(c => c.taken = false);
    race = {
      state: 'countdown', countdown: 3.999, time: 0, lap: 1,
      coinsGot: 0, checkpoints: [false, false, false], bombs: [], bombTimer: 2.5,
      trail: [],
    };
    ghost = { data: save.ghosts[track.id] || null, x: 0, y: 0, a: 0, visible: false };
    camera = { x: kart.x, y: kart.y };
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

  function bindHold(el, prop) {
    const on = (e) => { e.preventDefault(); ensureAudio(); touch[prop] = true; };
    const off = (e) => { e.preventDefault(); touch[prop] = false; };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  bindHold(document.getElementById('btn-left'), 'left');
  bindHold(document.getElementById('btn-right'), 'right');
  bindHold(document.getElementById('btn-brake'), 'brake');

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
    const left = keys['ArrowLeft'] || keys['KeyA'] || touch.left || (padReady() && Pad360.dx() < 0);
    const right = keys['ArrowRight'] || keys['KeyD'] || touch.right || (padReady() && Pad360.dx() > 0);
    return (left ? -1 : 0) + (right ? 1 : 0);
  };
  const brakeInput = () => keys['ArrowDown'] || keys['KeyS'] || touch.brake ||
    (padReady() && (Pad360.down(Pad360.BTN.B) || Pad360.down(Pad360.BTN.LT) || Pad360.down(Pad360.BTN.RT)));

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

  // ---------- Physics ----------
  const MAX_SPEED = 265;
  const OFFROAD_SPEED = 115;
  const ACCEL = 165;
  const BRAKE = 320;
  const TURN_RATE = 2.5;

  function updateRace(dt) {
    if (race.state === 'countdown') {
      const prev = Math.ceil(race.countdown);
      race.countdown -= dt;
      const now = Math.ceil(race.countdown);
      if (now !== prev) { if (now > 0) sfxCount(); else sfxGo(); }
      if (race.countdown <= 0) race.state = 'racing';
      return;
    }
    if (race.state !== 'racing') return;

    race.time += dt;

    // Sample the ghost on a fixed 15Hz grid derived from race time (not an
    // accumulator) so playback indexes line up exactly with what was recorded.
    const wantSamples = Math.floor(race.time * 15);
    while (race.trail.length / 3 < wantSamples) {
      race.trail.push(Math.round(kart.x), Math.round(kart.y), Math.round(kart.a * 100) / 100);
    }

    const near = distToCenter(track.center, kart.x, kart.y);
    kart.onRoad = near.dist < track.width / 2;

    if (kart.bump > 0) kart.bump -= dt;
    if (kart.bumpCd > 0) kart.bumpCd -= dt;

    kart.grip = 1;
    for (const o of track.obstacles) {
      const dx = kart.x - o.x, dy = kart.y - o.y;
      const d = Math.hypot(dx, dy) || 0.001;
      if (o.kind === 'ice') {
        if (d < o.r) kart.grip = 0.35;
        continue;
      }
      const hitR = o.r + 12;
      if (d < hitR) {
        // shove clear of the obstacle, so a slow kart can never wedge inside it
        kart.x += (dx / d) * (hitR - d);
        kart.y += (dy / d) * (hitR - d);
        if (kart.bumpCd <= 0) {
          kart.speed = Math.max(45, kart.speed * 0.35);
          kart.bump = 0.35; kart.bumpCd = 0.8;
          sfxCrash();
        }
      }
    }

    // lava bombs
    if (track.lavaBombs) {
      race.bombTimer -= dt;
      if (race.bombTimer <= 0) {
        race.bombTimer = 1.6 + Math.random() * 1.6;
        const ahead = (near.idx + 14 + Math.floor(Math.random() * 26)) % track.n;
        const h = track.headingAt(ahead);
        const off = (Math.random() - 0.5) * track.width * 0.7;
        race.bombs.push({
          x: track.center[ahead].x + Math.cos(h + Math.PI / 2) * off,
          y: track.center[ahead].y + Math.sin(h + Math.PI / 2) * off,
          warn: 1.3, blast: 0, r: 52,
        });
      }
      for (const b of race.bombs) {
        if (b.warn > 0) {
          b.warn -= dt;
          if (b.warn <= 0) {
            b.blast = 0.45;
            if (Math.hypot(kart.x - b.x, kart.y - b.y) < b.r && kart.bumpCd <= 0) {
              kart.speed = Math.max(30, kart.speed * 0.25);
              kart.bump = 0.5; kart.bumpCd = 0.8;
              sfxCrash();
            }
          }
        } else if (b.blast > 0) b.blast -= dt;
      }
      race.bombs = race.bombs.filter(b => b.warn > 0 || b.blast > 0);
    }

    // driving — Freddy always accelerates; the player only steers
    const cap = kart.onRoad ? MAX_SPEED : OFFROAD_SPEED;
    if (brakeInput()) kart.speed = Math.max(0, kart.speed - BRAKE * dt);
    else kart.speed += ACCEL * dt;
    if (kart.speed > cap) kart.speed = Math.max(cap, kart.speed - 260 * dt);

    const agility = Math.min(1, kart.speed / 90);
    kart.a += steerInput() * TURN_RATE * agility * kart.grip * dt;

    kart.x += Math.cos(kart.a) * kart.speed * dt;
    kart.y += Math.sin(kart.a) * kart.speed * dt;

    // coins
    for (const c of track.coins) {
      if (c.taken) continue;
      if (Math.hypot(kart.x - c.x, kart.y - c.y) < 26) { c.taken = true; race.coinsGot++; sfxCoin(); }
    }

    // lap / checkpoint logic
    const frac = near.idx / track.n;
    if (frac > 0.25 && frac < 0.45) race.checkpoints[0] = true;
    if (frac > 0.5 && frac < 0.7 && race.checkpoints[0]) race.checkpoints[1] = true;
    if (frac > 0.75 && frac < 0.95 && race.checkpoints[1]) race.checkpoints[2] = true;
    if (frac < 0.08 && race.checkpoints[2]) {
      race.checkpoints = [false, false, false];
      if (race.lap >= LAPS) finishRace();
      else { race.lap++; sfxLap(); }
    }

    // ghost playback
    if (ghost.data && ghost.data.length >= 3) {
      const idx = Math.floor(race.time * 15);
      const i3 = idx * 3;
      if (i3 + 2 < ghost.data.length) {
        ghost.x = ghost.data[i3]; ghost.y = ghost.data[i3 + 1]; ghost.a = ghost.data[i3 + 2];
        ghost.visible = true;
      } else ghost.visible = false;
    }

    camera.x += (kart.x - camera.x) * Math.min(1, dt * 6);
    camera.y += (kart.y - camera.y) * Math.min(1, dt * 6);
  }

  function finishRace() {
    race.state = 'done';
    const prevBest = save.bestTimes[track.id] ?? null;
    const isBest = prevBest === null || race.time < prevBest;
    const coinsBefore = save.coins;

    save.coins += race.coinsGot + (isBest ? FIRST_PLACE_BONUS : 0);
    if (isBest) {
      save.bestTimes[track.id] = race.time;
      save.ghosts[track.id] = race.trail;
    }
    writeSave();
    if (window.MickleScores) {
      MickleScores.record('freddy-bear-kart', race.time, {
        category: track.name, order: TRACK_DEFS.findIndex((d) => d.id === track.id),
        lowerIsBetter: true, format: 'time',
      });
    }
    if (isBest) sfxWin();

    showResults({ isBest, prevBest, time: race.time, coinsGot: race.coinsGot, coinsBefore });
  }

  // ---------- Drawing ----------
  function worldToScreen(x, y) {
    return { x: (x - camera.x) * CAM_SCALE + W / 2, y: (y - camera.y) * CAM_SCALE + H / 2 };
  }

  function drawTrack() {
    const t = track;
    // ground
    if (t.theme === 'snowbeach') {
      const top = worldToScreen(0, t.bounds.minY - 300).y;
      const bot = worldToScreen(0, t.bounds.maxY + 300).y;
      const g = ctx.createLinearGradient(0, top, 0, bot);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#dfeaf2');
      g.addColorStop(0.62, '#63c8e8'); g.addColorStop(0.72, '#f2dfa8'); g.addColorStop(1, '#e8c86a');
      ctx.fillStyle = g;
    } else if (t.theme === 'volcano') {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#3d251f'); g.addColorStop(1, '#5a3128');
      ctx.fillStyle = g;
    } else {
      ctx.fillStyle = t.ground;
    }
    ctx.fillRect(0, 0, W, H);

    // volcano in the infield
    if (t.volcano) {
      const p = worldToScreen(t.volcano.x, t.volcano.y);
      const r = t.volcano.r * CAM_SCALE;
      ctx.fillStyle = '#3a221c';
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#54312a';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ff6a2b';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.34, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.18 + Math.sin(performance.now() / 220) * 2, 0, Math.PI * 2); ctx.fill();
    }

    // road
    const pathOf = (pts) => {
      ctx.beginPath();
      for (let i = 0; i <= pts.length; i++) {
        const p = worldToScreen(pts[i % pts.length].x, pts[i % pts.length].y);
        i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
    };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    pathOf(t.center);
    ctx.strokeStyle = t.roadEdge; ctx.lineWidth = (t.width + 22) * CAM_SCALE; ctx.stroke();
    ctx.strokeStyle = t.road; ctx.lineWidth = t.width * CAM_SCALE; ctx.stroke();

    // start/finish line
    const h = t.headingAt(0);
    const p0 = t.center[0];
    ctx.save();
    const sp = worldToScreen(p0.x, p0.y);
    ctx.translate(sp.x, sp.y); ctx.rotate(h);
    const halfW = (t.width / 2) * CAM_SCALE;
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#fff' : '#222';
      ctx.fillRect(-4, -halfW + i * (halfW * 2 / 8), 8, halfW * 2 / 8);
    }
    ctx.restore();
  }

  function drawDecor() {
    for (const d of track.decor) {
      const p = worldToScreen(d.x, d.y);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const s = d.s * CAM_SCALE;
      switch (d.kind) {
        case 'palm':
          ctx.fillStyle = '#6b4a22'; ctx.fillRect(p.x - 2 * s, p.y - 2 * s, 4 * s, 10 * s);
          ctx.fillStyle = '#2f8f45';
          ctx.beginPath(); ctx.arc(p.x, p.y - 4 * s, 11 * s, 0, Math.PI * 2); ctx.fill();
          break;
        case 'pine':
          ctx.fillStyle = '#1f5f3a';
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 14 * s); ctx.lineTo(p.x - 9 * s, p.y + 6 * s); ctx.lineTo(p.x + 9 * s, p.y + 6 * s);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#eaf6ff';
          ctx.beginPath(); ctx.moveTo(p.x, p.y - 14 * s); ctx.lineTo(p.x - 4 * s, p.y - 4 * s); ctx.lineTo(p.x + 4 * s, p.y - 4 * s);
          ctx.closePath(); ctx.fill();
          break;
        case 'chest':
          ctx.fillStyle = '#7a4a1e'; ctx.fillRect(p.x - 8 * s, p.y - 6 * s, 16 * s, 12 * s);
          ctx.fillStyle = '#ffd23f'; ctx.fillRect(p.x - 8 * s, p.y - 2 * s, 16 * s, 3 * s);
          break;
        case 'barrel':
          ctx.fillStyle = '#8a5a2a';
          ctx.beginPath(); ctx.arc(p.x, p.y, 7 * s, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2 * s; ctx.stroke();
          break;
        case 'umbrella':
          ctx.fillStyle = '#ff4f6d';
          ctx.beginPath(); ctx.arc(p.x, p.y, 10 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff';
          ctx.beginPath(); ctx.arc(p.x, p.y, 10 * s, -0.6, 0.6); ctx.lineTo(p.x, p.y); ctx.fill();
          break;
        case 'snowrock':
          ctx.fillStyle = '#c7d4de'; ctx.beginPath(); ctx.arc(p.x, p.y, 8 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(p.x - 2 * s, p.y - 2 * s, 5 * s, 0, Math.PI * 2); ctx.fill();
          break;
        case 'lavarock':
          ctx.fillStyle = '#2b1a15'; ctx.beginPath(); ctx.arc(p.x, p.y, 9 * s, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#ff6a2b'; ctx.fillRect(p.x - 3 * s, p.y - 1 * s, 6 * s, 2 * s);
          break;
        case 'deadtree':
          ctx.strokeStyle = '#3a2a22'; ctx.lineWidth = 3 * s;
          ctx.beginPath(); ctx.moveTo(p.x, p.y + 8 * s); ctx.lineTo(p.x, p.y - 10 * s);
          ctx.moveTo(p.x, p.y - 4 * s); ctx.lineTo(p.x - 7 * s, p.y - 11 * s);
          ctx.moveTo(p.x, p.y - 6 * s); ctx.lineTo(p.x + 7 * s, p.y - 12 * s);
          ctx.stroke();
          break;
        default:
          ctx.fillStyle = 'rgba(0,0,0,0.22)';
          ctx.beginPath(); ctx.arc(p.x, p.y, 6 * s, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawObstacles() {
    for (const o of track.obstacles) {
      const p = worldToScreen(o.x, o.y);
      if (p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) continue;
      const r = o.r * CAM_SCALE;
      if (o.kind === 'ice') {
        ctx.fillStyle = 'rgba(180, 235, 255, 0.55)';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1; ctx.stroke();
      } else if (o.kind === 'crate') {
        ctx.fillStyle = '#8a5a2a'; ctx.fillRect(p.x - r, p.y - r, r * 2, r * 2);
        ctx.strokeStyle = '#5a3a1a'; ctx.lineWidth = 2; ctx.strokeRect(p.x - r, p.y - r, r * 2, r * 2);
      } else {
        ctx.fillStyle = '#2b1a15';
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#6a4a3a';
        ctx.beginPath(); ctx.arc(p.x - r * 0.3, p.y - r * 0.3, r * 0.45, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawCoins() {
    const t = performance.now() / 300;
    for (const c of track.coins) {
      if (c.taken) continue;
      const p = worldToScreen(c.x, c.y);
      if (p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
      const wob = Math.abs(Math.cos(t + c.x * 0.01));
      ctx.fillStyle = '#a86800';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 7 * wob + 1.5, 7, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd23f';
      ctx.beginPath(); ctx.ellipse(p.x, p.y, 5.5 * wob + 1, 5.5, 0, 0, Math.PI * 2); ctx.fill();
      if (wob > 0.55) { // koala face only when the coin is near face-on
        ctx.fillStyle = '#a86800';
        ctx.beginPath(); ctx.arc(p.x - 2.4, p.y - 2.4, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x + 2.4, p.y - 2.4, 1.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y + 0.6, 1.6, 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawBombs() {
    if (!race.bombs) return;
    for (const b of race.bombs) {
      const p = worldToScreen(b.x, b.y);
      const r = b.r * CAM_SCALE;
      if (b.warn > 0) {
        const pulse = 0.5 + 0.5 * Math.sin(performance.now() / 70);
        ctx.strokeStyle = `rgba(255, 80, 40, ${0.5 + pulse * 0.5})`;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(255, 106, 43, ${0.15 + pulse * 0.15})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      } else if (b.blast > 0) {
        const k = b.blast / 0.45;
        ctx.fillStyle = `rgba(255, ${Math.round(120 + 100 * k)}, 40, ${k})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * (1.2 - k * 0.2), 0, Math.PI * 2); ctx.fill();
      }
    }
  }

  function drawKart(x, y, a, opts = {}) {
    const p = worldToScreen(x, y);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(a + Math.PI / 2); // sprite is drawn facing "up"
    ctx.globalAlpha = opts.alpha ?? 1;
    drawKartShape(ctx, CAM_SCALE * 1.35, opts.skin, opts.hat, opts.ghost);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  // Kart centred on the current origin, facing "up". Takes its context explicitly
  // so the race view and the garage previews can share it.
  function drawKartShape(g, s, skinId, hatId, isGhost) {
    const golden = skinId === 'golden';
    const fur = golden ? '#ffd23f' : '#9b9ba3';
    const furDark = golden ? '#d9a400' : '#6e6e78';
    const belly = golden ? '#fff0b0' : '#c9c9d1';

    const rr = (x, y, w, h, r) => {
      g.beginPath();
      g.moveTo(x + r, y);
      g.arcTo(x + w, y, x + w, y + h, r);
      g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r);
      g.arcTo(x, y, x + w, y, r);
      g.closePath();
    };

    g.fillStyle = '#1c1c1c';
    g.fillRect(-13 * s, -12 * s, 5 * s, 9 * s);
    g.fillRect(8 * s, -12 * s, 5 * s, 9 * s);
    g.fillRect(-13 * s, 4 * s, 5 * s, 9 * s);
    g.fillRect(8 * s, 4 * s, 5 * s, 9 * s);

    // blue body with a yellow racing stripe, matching the box art
    g.fillStyle = isGhost ? '#7a7a88' : '#2f8fe0';
    rr(-10 * s, -15 * s, 20 * s, 30 * s, 5 * s); g.fill();
    if (!isGhost) {
      g.fillStyle = '#ffd23f';
      g.fillRect(-2.5 * s, -15 * s, 5 * s, 30 * s);
    }
    g.fillStyle = isGhost ? '#5a5a66' : '#1f6fb8';
    rr(-10 * s, 4 * s, 20 * s, 11 * s, 4 * s); g.fill();

    g.fillStyle = furDark;
    g.beginPath(); g.arc(-7 * s, -6 * s, 5 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(7 * s, -6 * s, 5 * s, 0, Math.PI * 2); g.fill();
    g.fillStyle = belly;
    g.beginPath(); g.arc(-7 * s, -6 * s, 2.6 * s, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(7 * s, -6 * s, 2.6 * s, 0, Math.PI * 2); g.fill();

    g.fillStyle = fur;
    g.beginPath(); g.arc(0, -5 * s, 7.5 * s, 0, Math.PI * 2); g.fill();

    drawHat(g, hatId, s, golden);

    g.fillStyle = '#2b2b2b';
    g.beginPath(); g.ellipse(0, -10 * s, 2.6 * s, 2 * s, 0, 0, Math.PI * 2); g.fill();
  }

  function drawHat(g, hat, s, golden) {
    switch (hat) {
      case 'cap':
        g.fillStyle = '#2f8fe0';
        g.beginPath(); g.arc(0, -5 * s, 7.8 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#ffd23f';
        g.beginPath(); g.ellipse(0, -11 * s, 6 * s, 3.4 * s, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.arc(0, -5 * s, 2.2 * s, 0, Math.PI * 2); g.fill();
        break;
      case 'pirate':
        g.fillStyle = '#1c1c22';
        g.beginPath(); g.ellipse(0, -5 * s, 8.5 * s, 6.5 * s, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#f2f2f2';
        g.beginPath(); g.arc(0, -6 * s, 2 * s, 0, Math.PI * 2); g.fill();
        break;
      case 'beanie':
        g.fillStyle = '#2f6fd8';
        g.beginPath(); g.arc(0, -5 * s, 7.8 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#eaf6ff';
        g.beginPath(); g.arc(0, -5 * s, 2.6 * s, 0, Math.PI * 2); g.fill();
        break;
      case 'helmet':
        g.fillStyle = '#e03a3a';
        g.beginPath(); g.arc(0, -5 * s, 8 * s, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff';
        g.fillRect(-1.6 * s, -13 * s, 3.2 * s, 16 * s);
        break;
      case 'crown':
        g.fillStyle = '#ffd23f';
        g.beginPath();
        g.moveTo(-7 * s, -1 * s); g.lineTo(-7 * s, -7 * s); g.lineTo(-3.5 * s, -4 * s);
        g.lineTo(0, -9 * s); g.lineTo(3.5 * s, -4 * s); g.lineTo(7 * s, -7 * s); g.lineTo(7 * s, -1 * s);
        g.closePath(); g.fill();
        g.fillStyle = '#ff4f6d';
        g.beginPath(); g.arc(0, -3.5 * s, 1.5 * s, 0, Math.PI * 2); g.fill();
        break;
      default:
        if (golden) {
          g.fillStyle = 'rgba(255,255,255,0.35)';
          g.beginPath(); g.arc(-2.5 * s, -8 * s, 2 * s, 0, Math.PI * 2); g.fill();
        }
    }
  }

  function drawHUD() {
    ctx.textAlign = 'left';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#fff';
    ctx.shadowColor = '#000'; ctx.shadowBlur = 4;
    ctx.fillText(`LAP ${race.lap}/${LAPS}`, 10, 20);
    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.fillText(fmtTime(race.time), 10, 38);

    const best = save.bestTimes[track.id];
    ctx.font = '9px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('BEST ' + fmtTime(best), 10, 51);

    // coin counter
    ctx.textAlign = 'right';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#ffd23f';
    ctx.fillText('* ' + race.coinsGot, W - 10, 20);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText(track.name, W - 10, 34);

    // speedometer
    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = kart.onRoad ? '#fff' : '#ff8f4f';
    ctx.fillText(kart.onRoad ? Math.round(kart.speed) + ' KPH' : 'OFF ROAD!', W / 2, H - 8);
    ctx.shadowBlur = 0;
    ctx.textAlign = 'left';
  }

  function drawCountdown() {
    const n = Math.ceil(race.countdown);
    const label = n > 0 ? String(n) : 'GO!';
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 48px monospace';
    ctx.fillStyle = n > 0 ? '#ffe14f' : '#4fff8f';
    ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 14;
    ctx.fillText(label, W / 2, H / 2 + 14);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function render() {
    if (!track) return;
    drawTrack();
    drawDecor();
    drawObstacles();
    drawCoins();
    drawBombs();
    if (ghost.visible) drawKart(ghost.x, ghost.y, ghost.a, { alpha: 0.4, ghost: true, hat: 'none' });
    const bumped = kart.bump > 0 && Math.floor(performance.now() / 70) % 2 === 0;
    drawKart(kart.x, kart.y, kart.a, { skin: save.skin, hat: save.hat, alpha: bumped ? 0.45 : 1 });
    drawHUD();
    if (race.state === 'countdown') drawCountdown();
  }

  // ---------- Screens / UI ----------
  const el = (id) => document.getElementById(id);
  function show(name) {
    screen = name;
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
    const b = t.bounds;
    const pad = 14;
    const sx = (c.width - pad * 2) / (b.maxX - b.minX);
    const sy = (c.height - pad * 2) / (b.maxY - b.minY);
    const s = Math.min(sx, sy);
    const ox = pad + ((c.width - pad * 2) - (b.maxX - b.minX) * s) / 2;
    const oy = pad + ((c.height - pad * 2) - (b.maxY - b.minY) * s) / 2;
    const P = (p) => ({ x: ox + (p.x - b.minX) * s, y: oy + (p.y - b.minY) * s });

    if (t.theme === 'snowbeach') {
      const grad = g.createLinearGradient(0, 0, 0, c.height);
      grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.55, '#63c8e8'); grad.addColorStop(1, '#e8c86a');
      g.fillStyle = grad;
    } else g.fillStyle = t.ground;
    g.fillRect(0, 0, c.width, c.height);

    if (t.volcano) {
      const v = P(t.volcano);
      g.fillStyle = '#3a221c';
      g.beginPath(); g.arc(v.x, v.y, t.volcano.r * s, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#ff6a2b';
      g.beginPath(); g.arc(v.x, v.y, t.volcano.r * s * 0.35, 0, Math.PI * 2); g.fill();
    }

    g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    t.center.forEach((pt, i) => { const p = P(pt); i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y); });
    g.closePath();
    g.strokeStyle = t.roadEdge; g.lineWidth = t.width * s + 4; g.stroke();
    g.strokeStyle = t.road; g.lineWidth = t.width * s; g.stroke();

    const st = P(t.center[0]);
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
    g.save();
    g.translate(c.width / 2, c.height / 2);
    drawKartShape(g, 1.55, skinId, hatId, false);
    g.restore();
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
    title.textContent = r.isBest ? '1ST PLACE!' : 'FINISHED!';
    title.style.color = r.isBest ? '#ffd23f' : '#4ff0ff';

    const rows = [];
    rows.push(`<div class="result-big">${fmtTime(r.time)}</div>`);
    if (r.isBest) {
      rows.push(`<div class="unlock">NEW BEST TIME! +${FIRST_PLACE_BONUS} BONUS COINS</div>`);
      if (r.prevBest != null) rows.push(`<div class="result-line" style="font-size:.8rem;color:#b9b0e0">OLD BEST ${fmtTime(r.prevBest)}</div>`);
    } else {
      rows.push(`<div class="result-line" style="font-size:.85rem;color:#b9b0e0">BEST ${fmtTime(r.prevBest)} &mdash; KEEP TRYING!</div>`);
    }
    rows.push(`<div class="result-line" style="color:#ffd23f">COINS THIS RACE: ${r.coinsGot}${r.isBest ? ' +' + FIRST_PLACE_BONUS : ''}</div>`);
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
    if (screen === 'race') { updateRace(dt); render(); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  show('tracks');
})();
