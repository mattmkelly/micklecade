// Bowie Dash -- an endless run-and-jump game for MickleCade.
// Game design by one of the MickleKids. Bowie is an orange bunny plush: big round head,
// yellow muzzle with a pink nose, a yellow zig-zag across his tummy, maroon feet.
// Five places to run through, sun stars to collect, and an ear-flap double jump.
(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H);
  const GROUND_Y = 214;     // top surface of the ground

  // ---------- Physics ----------
  const GRAVITY = 1500;
  const JUMP_V = -432;
  const FLAP_V = -372;        // the ear-flap double jump
  const JUMP_HOLD_G = 0.45;   // lighter gravity while rising and holding = higher jump
  const JUMP_HOLD_MAX = 0.20;
  const JUMP_CUT = 0.45;      // let go early = short hop
  const COYOTE = 0.10;        // forgiving: still jumpable just after leaving the ground
  const BUFFER = 0.15;        // forgiving: pressing jump early still fires on landing

  const BASE_SPEED = 168;
  const MAX_SPEED = 430;
  const SPEED_RAMP = 2.6;     // extra px/s of speed per second run

  // Bowie's collision box. His ears are drawn above it and are NOT part of it --
  // clipping an ear on a fence post should never count as a bump.
  const PW = 28, PH = 30;

  const MAX_HEARTS = 1000;
  const LOW_HEARTS = 3;     // below this a Golden Sun tops you up instead of paying out
  const HIT_INVULN = 1.3;     // flashing, cannot be hit again
  const TUMBLE_TIME = 0.5;    // spinning, cannot jump
  const HIT_SLOW = 0.62;      // speed dips after a bump, then winds back up

  const SAVE_KEY = 'bowieDash.save';

  // ---------- Skins ----------
  // Bowie's whole body recolours. CLASSIC matches the real plush; the rest are
  // earned by beating scores and picked with the arrows on the title card.
  const SKINS = [
    {
      key: 'classic', name: 'CLASSIC BOWIE', at: 0,
      fur: '#ff8a1e', light: '#ffb055', dark: '#dd6a0f', earIn: '#e8452c',
      belly: '#ffd83d', lower: '#f2503f', arm: '#ef5a48', foot: '#7e2b3a',
      eye: '#2a1712', nose: '#ff5c8f', shine: null,
    },
    {
      key: 'bronze', name: 'BRONZE BOWIE', at: 900,
      fur: '#c87a3c', light: '#eaa96b', dark: '#8a4e22', earIn: '#a85c28',
      belly: '#f0c088', lower: '#a85c28', arm: '#b86a30', foot: '#5e3316',
      eye: '#2a1712', nose: '#ffb08a', shine: 'rgba(255,226,180,0.55)',
    },
    {
      key: 'silver', name: 'SILVER BOWIE', at: 2600,
      fur: '#b8c6d4', light: '#f3f9ff', dark: '#7d8b99', earIn: '#8fa0b0',
      belly: '#eef5fb', lower: '#8fa0b0', arm: '#a3b3c2', foot: '#5c6874',
      eye: '#2a1712', nose: '#ffc2d4', shine: 'rgba(255,255,255,0.7)',
    },
    {
      key: 'gold', name: 'GOLD BOWIE', at: 6000,
      fur: '#ffc233', light: '#fff0a8', dark: '#b8801a', earIn: '#e0a020',
      belly: '#fff0a8', lower: '#e0a020', arm: '#f0b028', foot: '#8a6010',
      eye: '#2a1712', nose: '#ff9db5', shine: 'rgba(255,250,200,0.75)',
    },
    {
      key: 'gem', name: 'GEM BOWIE', at: 12000,
      fur: '#49dcff', light: '#dcfbff', dark: '#2a9ec0', earIn: '#8f5cff',
      belly: '#d6fbff', lower: '#b06cff', arm: '#7f5cff', foot: '#4a3a8a',
      eye: '#1a1030', nose: '#ff5c8f', shine: 'rgba(255,255,255,0.85)',
    },
  ];

  // ---------- Ear wear ----------
  // Purely a dress-up choice -- nothing to earn, wear it or don't.
  const WEARS = [
    { key: 'none',    name: 'NO HAT' },
    { key: 'bow',     name: 'PINK BOW' },
    { key: 'goggles', name: 'STAR GOGGLES' },
    { key: 'crown',   name: 'GOLD CROWN' },
    { key: 'cape',    name: 'HERO CAPE' },
  ];
  function currentWear() {
    return WEARS.find((w) => w.key === save.wear) || WEARS[0];
  }
  function cycleWear(dir) {
    let i = WEARS.findIndex((w) => w.key === currentWear().key);
    if (i < 0) i = 0;
    save.wear = WEARS[(i + dir + WEARS.length) % WEARS.length].key;
    persist();
    sfxMenu();
  }

  function skinByKey(key) {
    return SKINS.find((s) => s.key === key) || SKINS[0];
  }
  function isUnlocked(skin) { return save.best >= skin.at; }
  function unlockedSkins() { return SKINS.filter(isUnlocked); }
  // The equipped skin, falling back to CLASSIC if a saved skin is somehow not earned.
  function equippedSkin() {
    const s = skinByKey(save.skin);
    return isUnlocked(s) ? s : SKINS[0];
  }
  // The next skin still to be earned, for the teaser line under the picker.
  function nextLockedSkin() { return SKINS.find((s) => !isUnlocked(s)) || null; }

  function cycleSkin(dir) {
    const list = unlockedSkins();
    if (list.length < 2) return false;
    let i = list.findIndex((s) => s.key === equippedSkin().key);
    if (i < 0) i = 0;
    i = (i + dir + list.length) % list.length;
    save.skin = list[i].key;
    persist();
    sfxMenu();
    return true;
  }

  // ---------- Zones ----------
  // Difficulty ramps by distance, not by demanding tighter timing: later zones are
  // faster and busier, but every obstacle is still one clean jump.
  const ZONES = [
    {
      key: 'yard', name: 'SUNNY BACKYARD', distanceStart: 0,
      sky: ['#57b6f0', '#d8f2ff'],
      ground: '#8a5630', groundTop: '#63ad3f', groundEdge: '#4a8a2c',
      speedMult: 1.00, gravityMult: 1.00, density: 1.00, starPoints: 10,
      obstacles: [{ type: 'rock', w: 0.34 }, { type: 'log', w: 0.34 }, { type: 'fence', w: 0.32 }],
    },
    {
      key: 'toys', name: 'THE TOY ROOM', distanceStart: 5200,
      sky: ['#ffd49a', '#fff3e0'],
      ground: '#7c3f6a', groundTop: '#b7629c', groundEdge: '#8e4a79',
      speedMult: 1.08, gravityMult: 1.00, density: 1.08, starPoints: 20,
      obstacles: [{ type: 'block', w: 0.36 }, { type: 'ball', w: 0.32 }, { type: 'books', w: 0.32 }],
    },
    {
      key: 'candy', name: 'CANDY LAND', distanceStart: 11500,
      sky: ['#ff9ec9', '#ffe4f1'],
      ground: '#c2497e', groundTop: '#ff8fc0', groundEdge: '#e06aa0',
      speedMult: 1.15, gravityMult: 1.00, density: 1.16, starPoints: 30,
      obstacles: [{ type: 'gumdrop', w: 0.34 }, { type: 'candycane', w: 0.33 }, { type: 'lolli', w: 0.33 }],
    },
    {
      key: 'clouds', name: 'CANDY CLOUDS', distanceStart: 18500,
      sky: ['#7f95ff', '#ffd0ea'],
      ground: '#e57ab4', groundTop: '#ffb6dc', groundEdge: '#ff9ccd',
      speedMult: 1.22, gravityMult: 0.88, density: 1.22, starPoints: 40,
      obstacles: [{ type: 'donut', w: 0.34 }, { type: 'lolli', w: 0.33 }, { type: 'puff', w: 0.33 }],
    },
    {
      key: 'space', name: 'THE MOON', distanceStart: 26500,
      sky: ['#04030d', '#1b1038'],
      ground: '#39344f', groundTop: '#6b6488', groundEdge: '#4e4869',
      speedMult: 1.30, gravityMult: 0.55, density: 1.30, starPoints: 60,
      obstacles: [{ type: 'moonrock', w: 0.34 }, { type: 'crystal', w: 0.33 }, { type: 'comet', w: 0.33 }],
    },
  ];

  function zoneIndexFor(d) {
    let idx = 0;
    for (let i = 0; i < ZONES.length; i++) if (d >= ZONES[i].distanceStart) idx = i;
    return idx;
  }

  // ---------- Save ----------
  let save = { best: 0, stars: 0, runs: 0, farthest: 0, skin: 'classic', wear: 'none' };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch {}
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
  }

  // ---------- Audio (WebAudio beeps, no sound files) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, duration, type = 'square', vol = 0.13, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration);
  }
  function sweep(f1, f2, duration, type = 'square', vol = 0.12, delay = 0) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.connect(gain); gain.connect(audioCtx.destination);
    const t0 = audioCtx.currentTime + delay;
    osc.frequency.setValueAtTime(f1, t0);
    osc.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t0 + duration);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
    osc.start(t0); osc.stop(t0 + duration);
  }
  const sfxJump   = () => beep(540, 0.09, 'square', 0.10);
  const sfxFlap   = () => { beep(700, 0.06, 'triangle', 0.11); beep(960, 0.09, 'triangle', 0.09, 0.05); };
  const sfxLand   = () => beep(230, 0.05, 'triangle', 0.06);
  const sfxStar   = (n) => { const base = 620 + Math.min(n, 8) * 55; beep(base, 0.06, 'square', 0.11); beep(base * 1.5, 0.07, 'square', 0.08, 0.04); };
  const sfxSun    = () => { [660, 880, 1100, 1320].forEach((f, i) => beep(f, 0.16, 'triangle', 0.14, i * 0.07)); };
  const sfxBump   = () => { sweep(320, 90, 0.3, 'sawtooth', 0.13); beep(150, 0.16, 'square', 0.09, 0.02); };
  const sfxHeart  = () => { [784, 1047, 1319].forEach((f, i) => beep(f, 0.18, 'triangle', 0.13, i * 0.09)); };
  const sfxZone   = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.15, 'triangle', 0.13, i * 0.09)); };
  const sfxOver   = () => { [440, 392, 330, 262].forEach((f, i) => beep(f, 0.22, 'triangle', 0.13, i * 0.13)); };
  const sfxBest   = () => { [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => beep(f, 0.2, 'triangle', 0.14, i * 0.11)); };
  const sfxMenu   = () => beep(680, 0.04, 'square', 0.08);
  const sfxUnlock = () => { [660, 880, 1047, 1320, 1760].forEach((f, i) => beep(f, 0.22, 'square', 0.12, i * 0.12)); };

  // ---------- Little helpers ----------
  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function rr(x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.closePath(); }
  function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.closePath(); }
  function overlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // ---------- State ----------
  let state = 'start';  // 'start' | 'playing' | 'gameover'
  let player, obstacles, stars, particles, popups;
  let speed, speedScale, elapsed, distance, score, starCount, hearts, streak;
  let zoneIndex, zoneBannerT, gapToObstacle, gapToStars;
  let holdingJump = false, jumpBuffer = 0;
  let hitFlash = 0, shake = 0, idleT = 0;
  let newBest = false, unlockedThisRun = null;
  let scrollSlow = 0, scrollMid = 0, scrollGround = 0;

  function zone() { return ZONES[zoneIndex]; }
  function gravityNow() { return GRAVITY * zone().gravityMult; }
  function multiplier() { return clamp(1 + Math.floor(streak / 10), 1, 5); }
  // score accumulates as a float (distance adds fractions); only whole points show.
  function shownScore() { return Math.floor(score); }

  // How far Bowie travels in one full jump right now -- obstacle spacing is derived
  // from this so a gap is always clearable, however fast or floaty the zone is.
  function jumpReach() {
    return speed * (2 * Math.abs(JUMP_V) / gravityNow());
  }
  function minObstacleGap() { return jumpReach() * 0.85 + 70; }

  function reset() {
    player = {
      x: 66, y: GROUND_Y - PH, vy: 0,
      onGround: true, jumps: 0, maxJumps: 2,
      runT: 0, holdT: 0, coyote: 0,
      flapT: 0, tumble: 0, invuln: 0, blink: 0, squash: 0,
    };
    obstacles = [];
    stars = [];
    particles = [];
    popups = [];
    speed = BASE_SPEED;
    speedScale = 1;
    elapsed = 0;
    distance = 0;
    score = 0;
    starCount = 0;
    hearts = MAX_HEARTS;
    streak = 0;
    zoneIndex = 0;
    zoneBannerT = 0;
    hitFlash = 0;
    shake = 0;
    newBest = false;
    unlockedThisRun = null;
    gapToObstacle = 260;           // a calm run-up before the first obstacle

    gapToStars = 150;
    jumpBuffer = 0;
  }
  reset();

  // ---------- Input ----------
  function pressStart() {
    ensureAudio();
    if (state === 'start') { state = 'playing'; return; }
    if (state === 'gameover') { reset(); state = 'playing'; return; }
    jumpBuffer = BUFFER;
    tryJump();
  }
  function tryJump() {
    if (state !== 'playing' || player.tumble > 0) return;
    const grounded = player.onGround || player.coyote > 0;
    if (grounded) {
      player.vy = JUMP_V;
      player.jumps = 1;
      player.onGround = false;
      player.coyote = 0;
      player.holdT = 0;
      player.squash = -0.35;
      jumpBuffer = 0;
      sfxJump();
      puff(player.x + PW / 2, GROUND_Y, 6, '#ffffff');
    } else if (player.jumps < player.maxJumps) {
      // The ear flap: Bowie beats his big ears once for a second hop.
      player.vy = FLAP_V;
      player.jumps++;
      player.holdT = 0;
      player.flapT = 0.34;
      player.squash = -0.25;
      jumpBuffer = 0;
      sfxFlap();
      for (let i = 0; i < 8; i++) {
        particles.push({
          x: player.x + PW / 2 + rand(-14, 14), y: player.y + 4,
          vx: rand(-70, 70), vy: rand(-10, 70), life: rand(0.25, 0.5), max: 0.5,
          size: 2, color: '#fff3c4',
        });
      }
    }
  }
  function releaseJump() {
    holdingJump = false;
    if (state === 'playing' && player.vy < 0) player.vy *= JUMP_CUT;
  }

  function onCard() { return state === 'start' || state === 'gameover'; }

  window.addEventListener('keydown', (e) => {
    // On the title / game-over cards the arrows dress Bowie up instead of jumping.
    if (onCard() && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
      e.preventDefault();
      ensureAudio();
      cycleSkin(e.code === 'ArrowLeft' ? -1 : 1);
      return;
    }
    if (onCard() && (e.code === 'ArrowUp' || e.code === 'ArrowDown')) {
      e.preventDefault();
      ensureAudio();
      cycleWear(e.code === 'ArrowUp' ? -1 : 1);
      return;
    }
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (!holdingJump) { holdingJump = true; pressStart(); }
    }
    if (e.code === 'KeyR' && state === 'gameover') { reset(); state = 'playing'; }
    if (e.key === 'n' || e.key === 'N') { distance += 6600; } // hidden dev shortcut: skip ahead a zone
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') releaseJump();
  });

  // The whole page is the jump button, so tapping anywhere near the game works on a
  // phone. Links (the back arrow) are excluded so they still work.
  // Where a pointer landed, in the canvas's own 480x270 coordinates.
  function canvasPoint(e) {
    const r = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * (W / r.width),
      y: (e.clientY - r.top) * (H / r.height),
    };
  }

  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    e.preventDefault();

    // Tapping a picker arrow dresses Bowie up rather than starting the run.
    if (onCard() && pickerHit) {
      const pt = canvasPoint(e);
      ensureAudio();
      const { skin, wear } = pickerHit;
      if (skin.enabled && hitRect(pt, skin.left))  { cycleSkin(-1); return; }
      if (skin.enabled && hitRect(pt, skin.right)) { cycleSkin(1);  return; }
      if (hitRect(pt, wear.left))  { cycleWear(-1); return; }
      if (hitRect(pt, wear.right)) { cycleWear(1);  return; }
    }

    holdingJump = true;
    pressStart();
  });
  document.addEventListener('pointerup', releaseJump);
  document.addEventListener('pointercancel', releaseJump);

  // Xbox 360 controller: D-pad/left stick cycles dress-up on the cards (same
  // as the arrow keys), A or Start jumps/confirms.
  function pollGamepad() {
    Pad360.poll();
    if (onCard()) {
      const dx = Pad360.dxPressed();
      if (dx) { ensureAudio(); cycleSkin(dx); }
      const dy = Pad360.dyPressed();
      if (dy) { ensureAudio(); cycleWear(dy); }
    }
    const jump = Pad360.BTN.A, start = Pad360.BTN.START;
    if (Pad360.pressed(jump) || Pad360.pressed(start)) { if (!holdingJump) { holdingJump = true; pressStart(); } }
    if (Pad360.released(jump) || Pad360.released(start)) releaseJump();
  }

  // ---------- Particles and popups ----------
  function puff(x, y, n, color) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x: x + rand(-6, 6), y: y + rand(-3, 1),
        vx: rand(-60, 20), vy: rand(-45, -5),
        life: rand(0.2, 0.45), max: 0.45, size: rand(1, 3) | 0 || 1, color,
      });
    }
  }
  function burst(x, y, n, colors, power = 130) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), s = rand(power * 0.3, power);
      particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 30,
        life: rand(0.3, 0.7), max: 0.7, size: rand(1, 3) | 0 || 1,
        color: colors[(Math.random() * colors.length) | 0],
      });
    }
  }
  function popup(x, y, text, color, big = false) {
    popups.push({ x, y, text, color, big, life: big ? 1.2 : 0.8, max: big ? 1.2 : 0.8 });
  }

  // ---------- Spawning ----------
  function pickObstacleType(z) {
    let r = Math.random(), acc = 0;
    for (const e of z.obstacles) { acc += e.w; if (r <= acc) return e.type; }
    return z.obstacles[z.obstacles.length - 1].type;
  }

  // Every obstacle sits on the ground and is cleared with one jump. w/h are the
  // drawn size; the hitbox is inset in collide() so near-misses read as misses.
  const OBSTACLE_SIZES = {
    rock:      () => ({ w: 26, h: 22 }),
    log:       () => ({ w: 46, h: 20 }),
    fence:     () => ({ w: 22, h: 34 }),
    block:     () => ({ w: 30, h: 24 }),
    ball:      () => ({ w: 32, h: 32 }),
    books:     () => ({ w: 28, h: 36 }),
    gumdrop:   () => ({ w: 28, h: 26 }),
    candycane: () => ({ w: 22, h: 40 }),
    lolli:     () => ({ w: 24, h: 42 }),
    donut:     () => ({ w: 40, h: 30 }),
    puff:      () => ({ w: 34, h: 24 }),
    moonrock:  () => ({ w: 38, h: 24 }),
    crystal:   () => ({ w: 24, h: 38 }),
    comet:     () => ({ w: 30, h: 26 }),
  };

  function spawnObstacle(x) {
    const z = zone();
    const type = pickObstacleType(z);
    const size = OBSTACLE_SIZES[type]();
    obstacles.push({
      type, x, y: GROUND_Y - size.h, w: size.w, h: size.h,
      t: rand(0, Math.PI * 2), passed: false,
    });
    return size.w;
  }

  function spawnObstacleGroup() {
    let x = W + 20;
    const wide = spawnObstacle(x);
    // From Candy Land on, obstacles sometimes come in pairs tight enough to clear
    // in a single jump -- looks scary, plays the same.
    if (zoneIndex >= 2 && Math.random() < 0.22) {
      spawnObstacle(x + wide + rand(26, 40));
    }
    gapToObstacle = minObstacleGap() * rand(1.0, 2.1) / zone().density;
  }

  // Is there an obstacle sitting in this stretch of track (or about to spawn into it)?
  function obstacleNear(x0, x1) {
    if (gapToObstacle < 70) return true;
    for (const o of obstacles) if (o.x + o.w > x0 - 26 && o.x < x1 + 26) return true;
    return false;
  }

  function spawnStarGroup() {
    const golden = Math.random() < 0.05;
    if (golden) {
      stars.push({
        x: W + 20, y: GROUND_Y - rand(60, 96), r: 9,
        got: false, bob: rand(0, 6.28), golden: true,
      });
      gapToStars = rand(320, 520);
      return;
    }
    const n = 4 + Math.floor(Math.random() * 3);
    const gap = 26;
    const x0 = W + 20, x1 = x0 + (n - 1) * gap;
    // Arcs peak at jump height (the reward for hopping); low rows sit at running
    // height so they sweep up for free just by running. A low row must never be
    // laid across an obstacle -- that baits a kid straight into it -- so when one
    // is in the way the group arcs over instead.
    const arc = Math.random() < 0.55 || obstacleNear(x0, x1);
    const baseY = arc ? GROUND_Y - 46 : GROUND_Y - rand(24, 34);
    for (let i = 0; i < n; i++) {
      const lift = arc ? Math.sin((i / (n - 1)) * Math.PI) * 42 : 0;
      stars.push({
        x: W + 20 + i * gap, y: baseY - lift, r: 6,
        got: false, bob: rand(0, 6.28), golden: false,
      });
    }
    gapToStars = rand(150, 300);
  }

  // ---------- Getting bumped ----------
  function takeHit(o) {
    hearts--;
    streak = 0;
    player.invuln = HIT_INVULN;
    player.tumble = TUMBLE_TIME;
    speedScale = HIT_SLOW;
    hitFlash = 0.35;
    shake = 7;
    sfxBump();
    burst(o.x + o.w / 2, o.y + o.h / 2, 16, ['#ffd83d', '#ff8a1e', '#ffffff'], 150);
    if (hearts <= 0) {
      hearts = 0;
      endRun();
    } else {
      popup(player.x + PW / 2, player.y - 14, 'OOF!', '#ffd83d');
    }
  }

  function endRun() {
    state = 'gameover';
    save.runs++;
    if (distance > save.farthest) save.farthest = Math.floor(distance);
    const prevBest = save.best;
    if (shownScore() > save.best) {
      save.best = shownScore();
      newBest = true;
      // Did beating the best score earn a new skin?
      const earned = SKINS.filter((sk) => sk.at > prevBest && sk.at <= save.best);
      if (earned.length) unlockedThisRun = earned[earned.length - 1];
    }
    persist();
    if (window.MickleScores) MickleScores.record('bowie-dash', shownScore());
    if (unlockedThisRun) sfxUnlock();
    else if (newBest) sfxBest();
    else sfxOver();
  }

  // ---------- Update ----------
  function update(dt) {
    idleT += dt;

    if (state !== 'playing') {
      // Keep the world drifting gently behind the title / game-over card.
      const drift = state === 'start' ? 42 : 0;
      scrollSlow += drift * 0.25 * dt;
      scrollMid += drift * 0.5 * dt;
      scrollGround += drift * dt;
      for (const p of particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
      particles = particles.filter((p) => p.life > 0);
      for (const p of popups) { p.y -= 26 * dt; p.life -= dt; }
      popups = popups.filter((p) => p.life > 0);
      hitFlash = Math.max(0, hitFlash - dt * 2);
      shake = Math.max(0, shake - dt * 26);
      return;
    }

    elapsed += dt;

    // Speed: ramps with time, scaled by zone, dips briefly after a bump.
    speedScale = Math.min(1, speedScale + dt * 0.55);
    const target = Math.min(MAX_SPEED, BASE_SPEED + elapsed * SPEED_RAMP) * zone().speedMult;
    speed = target * speedScale;

    const moved = speed * dt;
    distance += moved;
    score += moved * 0.1;   // a point per metre, so the counter is always ticking up
    scrollSlow += moved * 0.18;
    scrollMid += moved * 0.45;
    scrollGround += moved;

    // Zone changes
    const zi = zoneIndexFor(distance);
    if (zi !== zoneIndex) {
      zoneIndex = zi;
      zoneBannerT = 2.4;
      sfxZone();
      burst(W / 2, 90, 26, ['#ffd83d', '#ffffff', '#ff8a1e'], 190);
    }
    zoneBannerT = Math.max(0, zoneBannerT - dt);

    // ----- Bowie -----
    const p = player;
    p.runT += dt * (p.onGround ? speed / 46 : 6);
    p.flapT = Math.max(0, p.flapT - dt);
    p.tumble = Math.max(0, p.tumble - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.blink -= dt;
    if (p.blink < -0.1) p.blink = rand(1.6, 4.5);
    p.squash += (0 - p.squash) * Math.min(1, dt * 12);

    jumpBuffer = Math.max(0, jumpBuffer - dt);

    let g = gravityNow();
    if (p.vy < 0 && holdingJump && p.holdT < JUMP_HOLD_MAX) {
      g *= JUMP_HOLD_G;
      p.holdT += dt;
    }
    p.vy += g * dt;
    p.y += p.vy * dt;

    if (p.y + PH >= GROUND_Y) {
      const wasAir = !p.onGround;
      p.y = GROUND_Y - PH;
      p.vy = 0;
      p.onGround = true;
      p.jumps = 0;
      p.coyote = COYOTE;
      if (wasAir) {
        p.squash = 0.32;
        sfxLand();
        puff(p.x + PW / 2, GROUND_Y, 5, '#ffffff');
      }
      if (jumpBuffer > 0) tryJump();
    } else {
      p.onGround = false;
      p.coyote = Math.max(0, p.coyote - dt);
    }

    // ----- Obstacles -----
    gapToObstacle -= moved;
    if (gapToObstacle <= 0) spawnObstacleGroup();
    for (const o of obstacles) {
      o.x -= moved;
      o.t += dt;
      if (!o.passed && o.x + o.w < p.x) {
        o.passed = true;
        score += 5 * multiplier();
      }
    }
    obstacles = obstacles.filter((o) => o.x + o.w > -30);

    // ----- Sun stars -----
    gapToStars -= moved;
    if (gapToStars <= 0) spawnStarGroup();
    for (const s of stars) { s.x -= moved; s.bob += dt * 4; }
    stars = stars.filter((s) => s.x > -30 && !s.got);

    // ----- Collisions -----
    // Both boxes are inset so a graze reads as a miss. Kids should feel lucky, not cheated.
    const px = p.x + 4, py = p.y + 3, pw = PW - 8, ph = PH - 5;
    if (p.invuln <= 0) {
      for (const o of obstacles) {
        if (overlap(px, py, pw, ph, o.x + 3, o.y + 3, o.w - 6, o.h - 3)) { takeHit(o); break; }
      }
    }
    const scx = p.x + PW / 2, scy = p.y + PH / 2;
    for (const s of stars) {
      const grab = s.golden ? 24 : 19;
      if (Math.hypot(s.x - scx, s.y - scy) < grab) {
        s.got = true;
        if (s.golden) {
          const pts = zone().starPoints * 8;
          score += pts * multiplier();
          starCount += 5;
          save.stars += 5;
          burst(s.x, s.y, 24, ['#fff4b0', '#ffd83d', '#ffffff'], 180);
          if (hearts <= LOW_HEARTS && hearts < MAX_HEARTS) {
            hearts++;
            popup(s.x, s.y - 12, '+1 HEART!', '#ff5c8f', true);
            sfxHeart();
          } else {
            popup(s.x, s.y - 12, '+' + pts * multiplier(), '#fff4b0', true);
            sfxSun();
          }
        } else {
          streak++;
          starCount++;
          save.stars++;
          const pts = zone().starPoints * multiplier();
          score += pts;
          burst(s.x, s.y, 7, ['#fff4b0', '#ffd83d'], 90);
          sfxStar(streak % 9);
          if (streak % 10 === 0 && multiplier() < 5) {
            popup(p.x + PW / 2, p.y - 18, 'x' + (multiplier() + 1) + ' STARS!', '#4ff0ff', true);
          }
        }
      }
    }

    // ----- Effects -----
    for (const pt of particles) {
      pt.x += pt.vx * dt - moved * 0.6;
      pt.y += pt.vy * dt;
      pt.vy += 320 * dt;
      pt.life -= dt;
    }
    particles = particles.filter((pt) => pt.life > 0);
    for (const up of popups) { up.y -= 30 * dt; up.x -= moved * 0.4; up.life -= dt; }
    popups = popups.filter((up) => up.life > 0);
    hitFlash = Math.max(0, hitFlash - dt * 2.4);
    shake = Math.max(0, shake - dt * 26);

    score = Math.max(score, 0);
  }

  // ---------- Drawing: sky and backdrops ----------
  function drawSky(z) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, z.sky[0]);
    g.addColorStop(1, z.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, GROUND_Y + 2);
  }

  function drawCloud(x, y, s, color) {
    ctx.fillStyle = color;
    circle(x, y, 9 * s); ctx.fill();
    circle(x + 10 * s, y - 4 * s, 11 * s); ctx.fill();
    circle(x + 21 * s, y, 8 * s); ctx.fill();
    ctx.fillRect(x - 9 * s, y, 31 * s, 9 * s);
  }

  function drawTree(x, baseY, s) {
    ctx.fillStyle = '#6b4423';
    ctx.fillRect(x - 3 * s, baseY - 20 * s, 6 * s, 20 * s);
    ctx.fillStyle = '#2f7a3c';
    circle(x, baseY - 28 * s, 13 * s); ctx.fill();
    circle(x - 10 * s, baseY - 22 * s, 9 * s); ctx.fill();
    circle(x + 10 * s, baseY - 22 * s, 9 * s); ctx.fill();
    ctx.fillStyle = '#3f9a4e';
    circle(x - 3 * s, baseY - 31 * s, 8 * s); ctx.fill();
  }

  function drawBackdrop(z) {
    switch (z.key) {
      case 'yard': {
        // sun
        ctx.fillStyle = '#fff4a8';
        circle(402, 44, 22); ctx.fill();
        ctx.fillStyle = 'rgba(255,244,168,0.35)';
        circle(402, 44, 32); ctx.fill();
        // far hills
        ctx.fillStyle = '#7fc25b';
        for (let i = -1; i < 4; i++) {
          const x = i * 190 - (scrollSlow % 190);
          circle(x + 95, GROUND_Y + 26, 76); ctx.fill();
        }
        // clouds
        for (let i = -1; i < 4; i++) {
          const x = i * 175 - (scrollSlow % 175);
          drawCloud(x + 30, 40 + (i % 2) * 22, 1, 'rgba(255,255,255,0.9)');
        }
        // trees
        for (let i = -1; i < 5; i++) {
          const x = i * 135 - (scrollMid % 135);
          drawTree(x + 60, GROUND_Y + 2, 1);
        }
        break;
      }
      case 'toys': {
        // wallpaper stripes
        for (let i = -1; i < 14; i++) {
          const x = i * 42 - (scrollSlow % 42);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillRect(x, 0, 20, GROUND_Y);
        }
        // bunting
        for (let i = -1; i < 12; i++) {
          const x = i * 46 - (scrollSlow % 46);
          ctx.strokeStyle = 'rgba(150,90,60,0.5)';
          ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(x, 16); ctx.quadraticCurveTo(x + 23, 26, x + 46, 16); ctx.stroke();
          ctx.fillStyle = ['#ff5c8f', '#4ff0ff', '#ffd83d', '#8fe36b'][((i % 4) + 4) % 4];
          ctx.beginPath();
          ctx.moveTo(x + 16, 22); ctx.lineTo(x + 30, 22); ctx.lineTo(x + 23, 36);
          ctx.closePath(); ctx.fill();
        }
        // couch + shelf
        for (let i = -1; i < 3; i++) {
          const x = i * 300 - (scrollMid % 300);
          ctx.fillStyle = '#4f7ac7';
          rr(x + 10, GROUND_Y - 52, 118, 52, 8); ctx.fill();
          ctx.fillStyle = '#6d97dd';
          rr(x + 20, GROUND_Y - 44, 98, 22, 6); ctx.fill();
          ctx.fillStyle = '#8a5a3c';
          ctx.fillRect(x + 176, GROUND_Y - 74, 92, 6);
          ctx.fillRect(x + 176, GROUND_Y - 40, 92, 6);
          const toys = ['#ff5c8f', '#ffd83d', '#8fe36b', '#4ff0ff'];
          for (let k = 0; k < 4; k++) {
            ctx.fillStyle = toys[k];
            rr(x + 182 + k * 22, GROUND_Y - 88, 14, 14, 4); ctx.fill();
            rr(x + 182 + k * 22, GROUND_Y - 54, 14, 14, 4); ctx.fill();
          }
        }
        break;
      }
      case 'candy': {
        // gumdrop hills
        for (let i = -1; i < 5; i++) {
          const x = i * 150 - (scrollSlow % 150);
          ctx.fillStyle = '#ffb8dc';
          circle(x + 75, GROUND_Y + 18, 60); ctx.fill();
          ctx.fillStyle = '#ffd0e8';
          circle(x + 60, GROUND_Y - 14, 22); ctx.fill();
        }
        // giant candy canes
        for (let i = -1; i < 4; i++) {
          const x = i * 190 - (scrollMid % 190);
          ctx.lineWidth = 9;
          ctx.strokeStyle = '#ffffff';
          ctx.beginPath();
          ctx.moveTo(x + 40, GROUND_Y);
          ctx.lineTo(x + 40, 74);
          ctx.arc(x + 52, 74, 12, Math.PI, 0);
          ctx.stroke();
          ctx.strokeStyle = '#ff4f7d';
          ctx.setLineDash([8, 10]);
          ctx.beginPath();
          ctx.moveTo(x + 40, GROUND_Y);
          ctx.lineTo(x + 40, 74);
          ctx.arc(x + 52, 74, 12, Math.PI, 0);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        // sprinkle rain
        for (let i = 0; i < 26; i++) {
          const x = (i * 71 + scrollMid * 0.5) % (W + 40) - 20;
          const y = (i * 53 + scrollSlow * 0.8) % GROUND_Y;
          ctx.fillStyle = ['#fff', '#ffd83d', '#8fe36b', '#4ff0ff'][i % 4];
          ctx.fillRect(W - x, y, 2, 5);
        }
        break;
      }
      case 'clouds': {
        // rainbow
        const bands = ['#ff6b6b', '#ffb24f', '#ffe14f', '#8fe36b', '#4ff0ff', '#b48cff'];
        ctx.lineWidth = 7;
        bands.forEach((c, i) => {
          ctx.strokeStyle = c;
          ctx.globalAlpha = 0.45;
          ctx.beginPath();
          ctx.arc(180 - (scrollSlow % 620), GROUND_Y + 30, 120 - i * 7, Math.PI, 0);
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
        // fat clouds
        for (let i = -1; i < 5; i++) {
          const x = i * 155 - (scrollMid % 155);
          drawCloud(x + 20, 60 + (i % 3) * 26, 1.5, 'rgba(255,255,255,0.75)');
        }
        // floating donuts and lollipops
        for (let i = -1; i < 4; i++) {
          const x = i * 205 - (scrollMid % 205);
          const y = 92 + Math.sin(idleT * 1.3 + i) * 8;
          ctx.fillStyle = '#a8663f';
          ctx.beginPath();
          ctx.arc(x + 120, y, 13, 0, Math.PI * 2);
          ctx.arc(x + 120, y, 5, 0, Math.PI * 2);
          ctx.fill('evenodd');
          ctx.fillStyle = '#ff9ecd';
          ctx.beginPath();
          ctx.arc(x + 120, y - 2, 12, 0, Math.PI * 2);
          ctx.arc(x + 120, y - 1, 5, 0, Math.PI * 2);
          ctx.fill('evenodd');
        }
        break;
      }
      case 'space': {
        for (let i = 0; i < 70; i++) {
          const x = (i * 97 - scrollSlow * 0.35) % (W + 20);
          const sx = x < 0 ? x + W + 20 : x;
          const y = (i * 61) % (GROUND_Y - 12);
          const tw = 0.55 + 0.45 * Math.sin(idleT * 2 + i);
          ctx.fillStyle = 'rgba(255,255,255,' + tw.toFixed(2) + ')';
          ctx.fillRect(sx, y, i % 9 === 0 ? 2 : 1, i % 9 === 0 ? 2 : 1);
        }
        // earth
        const ex = 400 - (scrollSlow * 0.08) % 900;
        ctx.fillStyle = '#2f6fd0';
        circle(ex, 56, 26); ctx.fill();
        ctx.fillStyle = '#48b06a';
        circle(ex - 9, 50, 9); ctx.fill();
        circle(ex + 8, 63, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        circle(ex - 8, 47, 5); ctx.fill();
        // ringed planet
        for (let i = -1; i < 3; i++) {
          const x = i * 340 - (scrollMid * 0.4 % 340);
          ctx.fillStyle = '#c98a4b';
          circle(x + 90, 104, 16); ctx.fill();
          ctx.strokeStyle = 'rgba(255,222,170,0.75)';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(x + 90, 104, 28, 8, -0.3, 0, Math.PI * 2);
          ctx.stroke();
        }
        break;
      }
    }
  }

  function drawGround(z) {
    ctx.fillStyle = z.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = z.groundTop;
    ctx.fillRect(0, GROUND_Y, W, 9);
    ctx.fillStyle = z.groundEdge;
    ctx.fillRect(0, GROUND_Y + 9, W, 2);

    const off = scrollGround % 32;
    for (let i = -1; i < 17; i++) {
      const x = i * 32 - off;
      switch (z.key) {
        case 'yard':
          ctx.fillStyle = '#4a8a2c';
          ctx.fillRect(x + 6, GROUND_Y - 3, 2, 4);
          ctx.fillRect(x + 10, GROUND_Y - 5, 2, 6);
          ctx.fillRect(x + 14, GROUND_Y - 3, 2, 4);
          ctx.fillStyle = '#a06a3c';
          ctx.fillRect(x + 20, GROUND_Y + 18, 6, 3);
          break;
        case 'toys':
          ctx.fillStyle = 'rgba(255,255,255,0.18)';
          circle(x + 12, GROUND_Y + 20, 4); ctx.fill();
          circle(x + 26, GROUND_Y + 34, 3); ctx.fill();
          break;
        case 'candy':
          ctx.fillStyle = ['#fff', '#ffe14f', '#8fe36b', '#4ff0ff'][((i % 4) + 4) % 4];
          ctx.fillRect(x + 8, GROUND_Y + 3, 5, 2);
          ctx.fillRect(x + 20, GROUND_Y + 16, 5, 2);
          break;
        case 'clouds':
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          circle(x + 16, GROUND_Y + 6, 9); ctx.fill();
          break;
        case 'space':
          ctx.fillStyle = '#2c2740';
          ellipse(x + 16, GROUND_Y + 20, 9, 4); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)';
          ctx.fillRect(x + 4, GROUND_Y + 2, 3, 2);
          break;
      }
    }
  }

  // ---------- Drawing: obstacles ----------
  function drawObstacle(o) {
    const x = Math.round(o.x), y = Math.round(o.y), w = o.w, h = o.h;
    // soft shadow on the ground under everything
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ellipse(x + w / 2, GROUND_Y + 3, w * 0.5, 3.5); ctx.fill();

    switch (o.type) {
      case 'rock':
        ctx.fillStyle = '#7a7168';
        rr(x, y, w, h, 7); ctx.fill();
        ctx.fillStyle = '#948a80';
        rr(x + 3, y + 3, w - 12, h - 12, 5); ctx.fill();
        break;
      case 'log':
        ctx.fillStyle = '#7b4a26';
        rr(x, y, w, h, 8); ctx.fill();
        ctx.fillStyle = '#9c6236';
        rr(x + 3, y + 3, w - 6, h - 10, 6); ctx.fill();
        ctx.fillStyle = '#c99a63';
        circle(x + w - 8, y + h / 2, 6); ctx.fill();
        ctx.fillStyle = '#8a5a30';
        circle(x + w - 8, y + h / 2, 3); ctx.fill();
        break;
      case 'fence':
        ctx.fillStyle = '#c9a06a';
        ctx.fillRect(x + 2, y + 4, 6, h - 4);
        ctx.fillRect(x + w - 8, y + 4, 6, h - 4);
        ctx.fillStyle = '#e0bb84';
        ctx.fillRect(x, y + 10, w, 5);
        ctx.fillRect(x, y + 22, w, 5);
        ctx.fillStyle = '#c9a06a';
        ctx.beginPath();
        ctx.moveTo(x + 2, y + 4); ctx.lineTo(x + 5, y); ctx.lineTo(x + 8, y + 4);
        ctx.closePath(); ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x + w - 8, y + 4); ctx.lineTo(x + w - 5, y); ctx.lineTo(x + w - 2, y + 4);
        ctx.closePath(); ctx.fill();
        break;
      case 'block': {
        ctx.fillStyle = '#e0413f';
        rr(x, y + 5, w, h - 5, 3); ctx.fill();
        ctx.fillStyle = '#ff5f5c';
        ctx.fillRect(x + 2, y + 7, w - 4, 5);
        ctx.fillStyle = '#e0413f';
        for (let i = 0; i < 3; i++) { circle(x + 7 + i * 9, y + 5, 4); ctx.fill(); }
        ctx.fillStyle = '#ff7c79';
        for (let i = 0; i < 3; i++) { circle(x + 7 + i * 9, y + 4, 2.5); ctx.fill(); }
        break;
      }
      case 'ball':
        ctx.fillStyle = '#f5f2e8';
        circle(x + w / 2, y + h / 2, w / 2); ctx.fill();
        ctx.fillStyle = '#4ff0ff';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, w / 6, 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ff5c8f';
        ctx.beginPath();
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, w / 6, -0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        circle(x + w / 2 - 5, y + 8, 3); ctx.fill();
        break;
      case 'books': {
        const cols = ['#3f7fd0', '#e0563f', '#57a860'];
        for (let i = 0; i < 3; i++) {
          const bh = 12, by = y + h - (i + 1) * bh;
          ctx.fillStyle = cols[i];
          rr(x + (i % 2) * 2, by, w - (i % 2) * 3, bh - 1, 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.65)';
          ctx.fillRect(x + (i % 2) * 2 + 3, by + 3, w - 12, 2);
        }
        break;
      }
      case 'gumdrop':
        ctx.fillStyle = '#8f4fd0';
        ctx.beginPath();
        ctx.moveTo(x, y + h);
        ctx.quadraticCurveTo(x, y, x + w / 2, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ellipse(x + w / 2 - 4, y + 9, 4, 6); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        for (let i = 0; i < 7; i++) ctx.fillRect(x + 2 + i * 4, y + h - 3, 2, 2);
        break;
      case 'candycane':
        ctx.lineWidth = 8;
        ctx.lineCap = 'butt';
        ctx.strokeStyle = '#ffffff';
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h);
        ctx.lineTo(x + w / 2, y + 10);
        ctx.arc(x + w / 2 + 5, y + 10, 5, Math.PI, 0);
        ctx.stroke();
        ctx.strokeStyle = '#ff4f7d';
        ctx.setLineDash([5, 6]);
        ctx.beginPath();
        ctx.moveTo(x + w / 2, y + h);
        ctx.lineTo(x + w / 2, y + 10);
        ctx.arc(x + w / 2 + 5, y + 10, 5, Math.PI, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      case 'lolli': {
        ctx.fillStyle = '#f0e6d2';
        ctx.fillRect(x + w / 2 - 2, y + 18, 4, h - 18);
        const r = 12, cx = x + w / 2, cy = y + 13;
        ctx.fillStyle = '#ff4f7d';
        circle(cx, cy, r); ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 3;
        ctx.beginPath();
        for (let a = 0; a < 22; a += 0.2) {
          const rr2 = (a / 22) * r;
          const ang = a + o.t;
          const px2 = cx + Math.cos(ang) * rr2, py2 = cy + Math.sin(ang) * rr2;
          a === 0 ? ctx.moveTo(px2, py2) : ctx.lineTo(px2, py2);
        }
        ctx.stroke();
        break;
      }
      case 'donut': {
        // The hole is cut with an even-odd fill, not destination-out -- compositing
        // would punch through the scenery behind it as well.
        const dcx = x + w / 2, dcy = y + h / 2;
        ctx.fillStyle = '#c98a4b';
        ctx.beginPath();
        ctx.ellipse(dcx, dcy, w / 2, h / 2, 0, 0, Math.PI * 2);
        ctx.ellipse(dcx, dcy, 6, 5, 0, 0, Math.PI * 2);
        ctx.fill('evenodd');
        ctx.fillStyle = '#ff9ecd';
        ctx.beginPath();
        ctx.ellipse(dcx, dcy - 2, w / 2 - 2, h / 2 - 3, 0, 0, Math.PI * 2);
        ctx.ellipse(dcx, dcy - 1, 7, 5, 0, 0, Math.PI * 2);
        ctx.fill('evenodd');
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = ['#fff', '#ffe14f', '#8fe36b', '#4ff0ff'][i % 4];
          const a = i * 0.9 + o.t * 0.5;
          ctx.fillRect(dcx + Math.cos(a) * 12 - 1, dcy + Math.sin(a) * 9 - 1, 3, 2);
        }
        break;
      }
      case 'puff':
        // Blue cotton candy, not white -- a white puff vanishes into the cloud ground.
        ctx.fillStyle = '#7fc4e8';
        circle(x + 9, y + h - 8, 9); ctx.fill();
        circle(x + 18, y + 9, 11); ctx.fill();
        circle(x + 28, y + h - 9, 8); ctx.fill();
        ctx.fillStyle = '#b5e6ff';
        circle(x + 15, y + 7, 7); ctx.fill();
        circle(x + 7, y + h - 10, 5); ctx.fill();
        break;
      case 'moonrock':
        ctx.fillStyle = '#6b6488';
        rr(x, y, w, h, 8); ctx.fill();
        ctx.fillStyle = '#857ea6';
        rr(x + 4, y + 3, w - 16, h - 10, 6); ctx.fill();
        ctx.fillStyle = '#4e4869';
        circle(x + w - 11, y + h - 8, 4); ctx.fill();
        break;
      case 'crystal': {
        const cx = x + w / 2;
        const grd = ctx.createLinearGradient(x, y, x + w, y + h);
        grd.addColorStop(0, '#8ff2ff');
        grd.addColorStop(1, '#5a7bff');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.moveTo(cx, y);
        ctx.lineTo(x + w, y + 14);
        ctx.lineTo(x + w - 4, y + h);
        ctx.lineTo(x + 4, y + h);
        ctx.lineTo(x, y + 14);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.beginPath();
        ctx.moveTo(cx, y); ctx.lineTo(cx + 4, y + 16); ctx.lineTo(cx - 3, y + h); ctx.lineTo(cx - 5, y + 16);
        ctx.closePath(); ctx.fill();
        break;
      }
      case 'comet': {
        ctx.fillStyle = 'rgba(255,180,90,' + (0.35 + 0.15 * Math.sin(o.t * 8)).toFixed(2) + ')';
        ctx.beginPath();
        ctx.moveTo(x + w, y + 6);
        ctx.lineTo(x + w + 22, y + 2);
        ctx.lineTo(x + w + 22, y + 18);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ffb14f';
        circle(x + w / 2, y + h / 2, w / 2 - 1); ctx.fill();
        ctx.fillStyle = '#ffe9a8';
        circle(x + w / 2 - 3, y + h / 2 - 3, w / 4); ctx.fill();
        break;
      }
    }
  }

  // ---------- Drawing: sun stars ----------
  function starPath(cx, cy, outer, inner, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? outer : inner;
      const a = rot + (i * Math.PI) / 5 - Math.PI / 2;
      const px = cx + Math.cos(a) * r, py = cy + Math.sin(a) * r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
  }

  function drawStars() {
    for (const s of stars) {
      const y = s.y + Math.sin(s.bob) * 3;
      if (s.golden) {
        const pulse = 1 + Math.sin(s.bob * 1.6) * 0.12;
        ctx.fillStyle = 'rgba(255,236,150,0.28)';
        circle(s.x, y, 20 * pulse); ctx.fill();
        ctx.fillStyle = 'rgba(255,244,190,0.45)';
        circle(s.x, y, 13 * pulse); ctx.fill();
        ctx.fillStyle = '#ffd83d';
        starPath(s.x, y, s.r * 1.5 * pulse, s.r * 0.62 * pulse, s.bob * 0.6);
        ctx.fill();
        ctx.fillStyle = '#fff8d0';
        starPath(s.x, y, s.r * 0.95 * pulse, s.r * 0.4 * pulse, s.bob * 0.6);
        ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(255,232,140,0.22)';
        circle(s.x, y, 11); ctx.fill();
        ctx.fillStyle = '#ffd83d';
        starPath(s.x, y, s.r, s.r * 0.44, s.bob * 0.35);
        ctx.fill();
        ctx.fillStyle = '#fff4b0';
        starPath(s.x, y, s.r * 0.55, s.r * 0.24, s.bob * 0.35);
        ctx.fill();
      }
    }
  }

  // ---------- Drawing: Bowie ----------
  function drawEar(B, cx, cy, angle, len, wear) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.fillStyle = B.fur;
    rr(-3.5, -len, 7, len + 7, 3.5); ctx.fill();
    ctx.fillStyle = B.earIn;
    rr(-2, -len + 4, 4, len - 1, 2); ctx.fill();
    if (wear === 'bow') {
      ctx.fillStyle = '#ff5c8f';
      circle(-4, -len + 4, 3.2); ctx.fill();
      circle(4, -len + 4, 3.2); ctx.fill();
      ctx.fillStyle = '#ff9dc0';
      circle(0, -len + 4, 2); ctx.fill();
    }
    ctx.restore();
  }

  // x,y is the top-left of the collision box; ears are drawn above it.
  function drawBowie(x, y, o) {
    const {
      runT = 0, airborne = false, flapT = 0, tumble = 0,
      squash = 0, blink = 1, skin = null, wear = null,
    } = o;
    const B = skin || equippedSkin();
    const hat = wear === null ? currentWear().key : wear;

    const cx = x + PW / 2;
    const sq = clamp(squash, -0.4, 0.4);
    const sx = 1 - sq * 0.55, sy = 1 + sq * 0.55;

    ctx.save();
    if (tumble > 0) {
      ctx.translate(cx, y + PH / 2);
      ctx.rotate((TUMBLE_TIME - tumble) * 13);
      ctx.translate(-cx, -(y + PH / 2));
    }
    ctx.translate(cx, y + PH);
    ctx.scale(sx, sy);
    ctx.translate(-cx, -(y + PH));

    const bob = airborne ? 0 : Math.sin(runT * 2) * 1.2;
    const top = y + bob;

    // ---- cape, behind everything ----
    if (hat === 'cape') {
      const flutter = Math.sin(runT * 3 + idleT * 6) * 3;
      ctx.fillStyle = '#c0392b';
      ctx.beginPath();
      ctx.moveTo(cx - 4, top + 12);
      ctx.quadraticCurveTo(cx - 22 - flutter, top + 20, cx - 16 + flutter, top + 30);
      ctx.lineTo(cx + 2, top + 26);
      ctx.closePath(); ctx.fill();
    }

    // ---- ears ----
    const flap = flapT > 0 ? Math.sin((0.34 - flapT) * 42) * 0.9 : 0;
    const lean = airborne ? -0.22 : Math.sin(runT * 2) * 0.12;
    drawEar(B, cx - 6, top + 8, -0.26 + lean - flap, 15, hat);
    drawEar(B, cx + 6, top + 8, 0.26 + lean + flap, 15, hat);

    // ---- feet ----
    const step = Math.sin(runT * 2);
    const f1 = airborne ? -3 : (step > 0 ? -3 : 0);
    const f2 = airborne ? -3 : (step > 0 ? 0 : -3);
    ctx.fillStyle = B.foot;
    ellipse(cx - 6, top + PH - 2 + f1, 5.5, 3.5); ctx.fill();
    ellipse(cx + 6, top + PH - 2 + f2, 5.5, 3.5); ctx.fill();

    // ---- arms ----
    ctx.fillStyle = B.arm;
    const armSwing = airborne ? -4 : step * 3;
    ellipse(cx - 11, top + 20 + armSwing, 3.5, 5.5); ctx.fill();
    ellipse(cx + 11, top + 20 - armSwing, 3.5, 5.5); ctx.fill();

    // ---- body: orange top, yellow zig-zag, red bottom ----
    ctx.save();
    rr(cx - 10, top + 13, 20, 16, 7);
    ctx.clip();
    ctx.fillStyle = B.fur;
    ctx.fillRect(cx - 10, top + 13, 20, 16);
    ctx.fillStyle = B.lower;
    ctx.beginPath();
    ctx.moveTo(cx - 10, top + 24); ctx.lineTo(cx + 10, top + 18);
    ctx.lineTo(cx + 10, top + 29); ctx.lineTo(cx - 10, top + 29);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = B.belly;
    ctx.beginPath();
    ctx.moveTo(cx - 10, top + 20); ctx.lineTo(cx + 10, top + 14);
    ctx.lineTo(cx + 10, top + 21); ctx.lineTo(cx - 10, top + 27);
    ctx.closePath(); ctx.fill();
    ctx.restore();

    // ---- head ----
    ctx.fillStyle = B.fur;
    circle(cx, top + 11, 11); ctx.fill();
    ctx.fillStyle = B.light;
    circle(cx - 4, top + 7, 5); ctx.fill();
    ctx.fillStyle = B.fur;
    circle(cx, top + 11, 9.4); ctx.fill();

    // ---- muzzle ----
    ctx.fillStyle = B.belly;
    ellipse(cx + 1, top + 14, 6, 5); ctx.fill();

    // ---- eyes ----
    const open = blink > 0.09;
    ctx.fillStyle = B.eye;
    if (open) {
      ellipse(cx - 5, top + 9, 2.1, 2.9); ctx.fill();
      ellipse(cx + 6, top + 9, 2.1, 2.9); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(Math.round(cx - 6), Math.round(top + 7), 1, 1);
      ctx.fillRect(Math.round(cx + 5), Math.round(top + 7), 1, 1);
    } else {
      ctx.fillRect(Math.round(cx - 7), Math.round(top + 9), 4, 1);
      ctx.fillRect(Math.round(cx + 4), Math.round(top + 9), 4, 1);
    }

    // ---- nose ----
    ctx.fillStyle = B.nose;
    ctx.beginPath();
    ctx.moveTo(cx + 1, top + 13.5);
    ctx.lineTo(cx + 3.4, top + 11.6);
    ctx.lineTo(cx - 1.4, top + 11.6);
    ctx.closePath(); ctx.fill();

    // ---- metal sheen: a bright streak across the head so gold/silver/bronze
    //      read as polished rather than just differently coloured ----
    if (B.shine) {
      ctx.save();
      circle(cx, top + 11, 9.4);
      ctx.clip();
      ctx.fillStyle = B.shine;
      ctx.beginPath();
      ctx.moveTo(cx - 9, top + 16); ctx.lineTo(cx - 3, top + 2);
      ctx.lineTo(cx + 1, top + 2); ctx.lineTo(cx - 5, top + 16);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }

    // ---- goggles / crown ----
    if (hat === 'goggles') {
      ctx.strokeStyle = '#5a4a3a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cx - 10, top + 6); ctx.lineTo(cx + 10, top + 6); ctx.stroke();
      ctx.fillStyle = 'rgba(120,230,255,0.85)';
      circle(cx - 5, top + 6, 3.6); ctx.fill();
      circle(cx + 6, top + 6, 3.6); ctx.fill();
      ctx.strokeStyle = '#ffd83d';
      ctx.lineWidth = 1;
      circle(cx - 5, top + 6, 3.6); ctx.stroke();
      circle(cx + 6, top + 6, 3.6); ctx.stroke();
    }
    if (hat === 'crown') {
      ctx.fillStyle = '#ffd83d';
      ctx.beginPath();
      ctx.moveTo(cx - 8, top + 3); ctx.lineTo(cx - 8, top - 4); ctx.lineTo(cx - 4, top);
      ctx.lineTo(cx, top - 6); ctx.lineTo(cx + 4, top); ctx.lineTo(cx + 8, top - 4);
      ctx.lineTo(cx + 8, top + 3);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff5c8f';
      circle(cx, top + 1, 1.6); ctx.fill();
    }

    ctx.restore();
  }

  function drawPlayer() {
    const p = player;
    // shadow
    const airH = clamp((GROUND_Y - (p.y + PH)) / 90, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,' + (0.22 - airH * 0.14).toFixed(2) + ')';
    ellipse(p.x + PW / 2, GROUND_Y + 3, 12 - airH * 4, 4 - airH * 1.5); ctx.fill();

    if (p.invuln > 0 && Math.floor(p.invuln * 14) % 2 === 0) return; // flash
    drawBowie(p.x, p.y, {
      runT: p.runT, airborne: !p.onGround, flapT: p.flapT, tumble: p.tumble,
      squash: p.squash, blink: p.blink,
    });
  }

  // ---------- Drawing: effects and HUD ----------
  function drawParticles() {
    for (const pt of particles) {
      ctx.globalAlpha = clamp(pt.life / pt.max, 0, 1);
      ctx.fillStyle = pt.color;
      ctx.fillRect(Math.round(pt.x), Math.round(pt.y), pt.size, pt.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawPopups() {
    ctx.textAlign = 'center';
    for (const up of popups) {
      ctx.globalAlpha = clamp(up.life / up.max, 0, 1);
      ctx.font = (up.big ? 'bold 13px' : 'bold 10px') + " 'Courier New', monospace";
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillText(up.text, up.x + 1, up.y + 1);
      ctx.fillStyle = up.color;
      ctx.fillText(up.text, up.x, up.y);
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  function drawHeart(x, y, filled) {
    // Empty hearts need to read on the bright backyard AND on the black moon sky.
    ctx.fillStyle = filled ? '#ff5c8f' : 'rgba(126,126,150,0.6)';
    circle(x + 3.2, y + 3.2, 3.2); ctx.fill();
    circle(x + 8.2, y + 3.2, 3.2); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + 0.4, y + 4.4);
    ctx.lineTo(x + 5.7, y + 10.5);
    ctx.lineTo(x + 11, y + 4.4);
    ctx.closePath(); ctx.fill();
    if (filled) {
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      circle(x + 3.4, y + 2.6, 1.1); ctx.fill();
    }
  }

  function drawMiniStar(x, y, r) {
    ctx.fillStyle = '#ffd83d';
    starPath(x, y, r, r * 0.44, 0); ctx.fill();
  }

  function drawHUD() {
    const dark = zone().key === 'space';
    const ink = dark ? '#ffffff' : '#20143a';
    const shadow = dark ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.55)';

    // lives: one heart plus a count (a row of 20 icons would not fit)
    drawHeart(9, 8, hearts > 0);
    ctx.textAlign = 'left';
    ctx.font = "bold 14px 'Courier New', monospace";
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.strokeText('x' + hearts, 24, 20);
    ctx.fillStyle = hearts <= LOW_HEARTS ? '#ff3b6b' : '#ff8fb0';
    ctx.fillText('x' + hearts, 24, 20);

    // score
    ctx.font = "bold 16px 'Courier New', monospace";
    ctx.textAlign = 'right';
    ctx.fillStyle = shadow;
    ctx.fillText(String(shownScore()), W - 8, 22);
    ctx.fillStyle = ink;
    ctx.fillText(String(shownScore()), W - 9, 21);

    ctx.font = "9px 'Courier New', monospace";
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.7)' : 'rgba(32,20,58,0.65)';
    ctx.fillText('BEST ' + save.best, W - 9, 33);

    // stars + multiplier
    ctx.textAlign = 'left';
    drawMiniStar(14, 37, 5);
    ctx.font = "bold 10px 'Courier New', monospace";
    ctx.fillStyle = ink;
    ctx.fillText(String(starCount), 22, 41);
    const m = multiplier();
    if (m > 1) {
      const pulse = 1 + Math.sin(idleT * 8) * 0.06;
      ctx.save();
      ctx.translate(48, 38);
      ctx.scale(pulse, pulse);
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.fillStyle = '#4ff0ff';
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.lineWidth = 2;
      ctx.strokeText('x' + m, 0, 3);
      ctx.fillText('x' + m, 0, 3);
      ctx.restore();
    }

    // zone name + distance, bottom left
    ctx.font = "8px 'Courier New', monospace";
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(zone().name + '  -  ' + Math.floor(distance / 10) + 'm', 8, H - 8);
  }

  function drawZoneBanner() {
    if (zoneBannerT <= 0) return;
    const t = zoneBannerT / 2.4;
    const a = t > 0.8 ? (1 - t) / 0.2 : Math.min(1, t / 0.25);
    ctx.globalAlpha = clamp(a, 0, 1);
    ctx.textAlign = 'center';
    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(zone().name, W / 2 + 2, 76);
    ctx.fillStyle = '#ffd83d';
    ctx.fillText(zone().name, W / 2, 74);
    ctx.font = "9px 'Courier New', monospace";
    ctx.fillStyle = '#ffffff';
    ctx.fillText('STARS WORTH ' + zone().starPoints, W / 2, 90);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  // ---------- Skin picker ----------
  // Drawn on the title and game-over cards. It records its arrow hit-boxes in
  // pickerHit each frame so a tap can be told apart from a tap-to-jump.
  let pickerHit = null;

  function drawArrow(x, y, dir, enabled) {
    ctx.fillStyle = enabled ? '#ffd83d' : 'rgba(255,216,61,0.22)';
    ctx.beginPath();
    if (dir < 0) {
      ctx.moveTo(x + 5, y - 7); ctx.lineTo(x + 5, y + 7); ctx.lineTo(x - 5, y);
    } else {
      ctx.moveTo(x - 5, y - 7); ctx.lineTo(x - 5, y + 7); ctx.lineTo(x + 5, y);
    }
    ctx.closePath(); ctx.fill();
  }

  // One "< LABEL >" row. cx is its centre, y the arrow centreline. Returns the
  // arrow hit-boxes so a tap on them can be told apart from a tap-to-jump.
  function drawPickerRow(cx, y, spread, label, color, enabled) {
    drawArrow(cx - spread, y, -1, enabled);
    drawArrow(cx + spread, y, 1, enabled);
    ctx.font = "bold 8px 'Courier New', monospace";
    ctx.fillStyle = enabled ? color : 'rgba(255,255,255,0.35)';
    ctx.fillText(label, cx, y + 3);
    return {
      left:  { x: cx - spread - 13, y: y - 13, w: 26, h: 26 },
      right: { x: cx + spread - 13, y: y - 13, w: 26, h: 26 },
      enabled,
    };
  }

  // Both rows, as drawn on the title and game-over cards.
  function drawDressUp(cx, ySkin, yWear, spread) {
    pickerHit = {
      skin: drawPickerRow(cx, ySkin, spread, equippedSkin().name, '#ffd83d',
                          unlockedSkins().length > 1),
      wear: drawPickerRow(cx, yWear, spread, currentWear().name, '#ff9dc0', true),
    };
  }

  function hitRect(pt, r) {
    return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
  }

  function panel(x, y, w, h) {
    ctx.fillStyle = 'rgba(18,11,40,0.82)';
    rr(x, y, w, h, 10); ctx.fill();
    ctx.strokeStyle = '#ff8a1e';
    ctx.lineWidth = 2;
    rr(x, y, w, h, 10); ctx.stroke();
  }

  function drawTitle() {
    panel(48, 26, 384, 212);

    ctx.textAlign = 'center';
    ctx.font = "bold 34px 'Courier New', monospace";
    ctx.fillStyle = '#dd6a0f';
    ctx.fillText('BOWIE DASH', W / 2 + 2, 64);
    ctx.fillStyle = '#ff8a1e';
    ctx.fillText('BOWIE DASH', W / 2, 62);

    ctx.font = "9px 'Courier New', monospace";
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('A MICKLEKIDS GAME', W / 2, 79);

    // Bowie models the current skin and hat down the left of the card.
    const px = 104;
    const bounce = Math.sin(idleT * 3) * 3;
    ctx.save();
    ctx.translate(px - 14 * 1.7, 92 + bounce);
    ctx.scale(1.7, 1.7);
    drawBowie(0, 0, {
      runT: idleT * 7, airborne: false, flapT: 0, tumble: 0, squash: 0,
      blink: Math.sin(idleT * 1.7) > 0.97 ? 0 : 1,
    });
    ctx.restore();

    drawDressUp(px, 154, 182, 46);

    const next = nextLockedSkin();
    ctx.font = "8px 'Courier New', monospace";
    if (next) {
      ctx.fillStyle = '#8f86bd';
      ctx.fillText(next.name + ' AT ' + next.at, px, 205);
    } else {
      ctx.fillStyle = '#4ff0ff';
      ctx.fillText('ALL SKINS UNLOCKED!', px, 205);
    }

    const tx = 300;
    ctx.font = "11px 'Courier New', monospace";
    ctx.fillStyle = '#ffffff';
    ctx.fillText('TAP OR SPACE TO JUMP', tx, 116);
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('TAP AGAIN TO EAR-FLAP!', tx, 134);

    ctx.font = "10px 'Courier New', monospace";
    ctx.fillStyle = '#ffd83d';
    ctx.fillText('GRAB SUN STARS', tx, 156);
    ctx.fillText('DODGE EVERYTHING ELSE', tx, 170);

    ctx.font = "9px 'Courier New', monospace";
    ctx.fillStyle = '#8f86bd';
    ctx.fillText('< > SKIN     ^ v HAT', tx, 192);
    if (save.best > 0) {
      ctx.fillStyle = '#b9b0e0';
      ctx.fillText('BEST ' + save.best + '   STARS ' + save.stars, tx, 206);
    }

    const blinkOn = Math.sin(idleT * 4) > -0.3;
    if (blinkOn) {
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.fillStyle = '#ffffff';
      ctx.fillText('- PRESS START -', W / 2, 228);
    }
    ctx.textAlign = 'left';
  }

  function drawGameOver() {
    panel(66, 32, 348, 206);
    ctx.textAlign = 'center';

    ctx.font = "bold 20px 'Courier New', monospace";
    ctx.fillStyle = '#ff8a1e';
    ctx.fillText('BOWIE TUMBLED!', W / 2, 60);

    ctx.font = "bold 26px 'Courier New', monospace";
    ctx.fillStyle = '#ffd83d';
    ctx.fillText(String(shownScore()), W / 2, 90);

    ctx.font = "9px 'Courier New', monospace";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      starCount + ' SUN STARS  -  ' + Math.floor(distance / 10) + 'm  -  ' + zone().name,
      W / 2, 106
    );

    if (newBest) {
      ctx.font = "bold 12px 'Courier New', monospace";
      ctx.fillStyle = Math.sin(idleT * 7) > 0 ? '#4ff0ff' : '#ffffff';
      ctx.fillText('NEW BEST SCORE!', W / 2, 124);
    } else {
      ctx.font = "10px 'Courier New', monospace";
      ctx.fillStyle = '#b9b0e0';
      ctx.fillText('BEST ' + save.best, W / 2, 124);
    }

    if (unlockedThisRun) {
      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.fillStyle = '#ff9dc0';
      ctx.fillText('NEW SKIN: ' + unlockedThisRun.name + '!', W / 2, 142);
    }

    // Swap outfit between runs without going back to the title.
    drawDressUp(W / 2, 164, 192, 92);

    const blinkOn = Math.sin(idleT * 4) > -0.3;
    if (blinkOn) {
      ctx.font = "bold 11px 'Courier New', monospace";
      ctx.fillStyle = '#ffffff';
      ctx.fillText('TAP OR PRESS SPACE TO RUN AGAIN', W / 2, 218);
    }
    ctx.textAlign = 'left';
  }

  // ---------- Render ----------
  function render() {
    pickerHit = null;   // repopulated by whichever card is drawn this frame
    const z = zone();
    ctx.save();
    if (shake > 0) ctx.translate(rand(-shake, shake) * 0.4, rand(-shake, shake) * 0.4);

    drawSky(z);
    drawBackdrop(z);
    drawGround(z);
    for (const o of obstacles) drawObstacle(o);
    drawStars();
    if (state !== 'start') drawPlayer();
    drawParticles();
    drawPopups();

    ctx.restore();

    if (hitFlash > 0) {
      ctx.fillStyle = 'rgba(255,120,60,' + (hitFlash * 0.4).toFixed(2) + ')';
      ctx.fillRect(0, 0, W, H);
    }

    if (state === 'playing') { drawHUD(); drawZoneBanner(); }
    if (state === 'start') drawTitle();
    if (state === 'gameover') { drawHUD(); drawGameOver(); }
  }

  // ---------- Loop ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (typeof Pad360 !== 'undefined') pollGamepad();
    update(dt);
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
