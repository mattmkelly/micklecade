(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H);
  const GROUND_Y = 210;

  const GRAVITY = 1600;
  const GLIDE_GRAVITY = GRAVITY * 0.15;
  const GLIDE_MAX_FALL = 55;
  const JUMP_VELOCITY = -480;
  const DOUBLE_JUMP_VELOCITY = -410;
  const JUMP_HOLD_GRAVITY_MULT = 0.45; // lighter gravity while rising + holding jump = higher jump
  const JUMP_HOLD_MAX_TIME = 0.22;     // how long the hold-boost can extend a single jump
  const JUMP_CUT_MULT = 0.45;          // releasing early chops the ascent short (Mario-style)

  const BASE_SPEED = 170;
  const MAX_SPEED = 420;
  const SPEED_RAMP = 3; // px/s of extra speed per second played

  const DRAIN_RATE = 3.2; // energy per second
  const FRUIT_ENERGY = 10;
  const HIT_ENERGY = 22;
  const HIT_INVULN_TIME = 1.0;
  const ABILITY_DURATION = 15; // seconds

  const HIGH_SCORE_KEY = 'freddyBearRun.highScore';

  // ---------- Zones ----------
  const ZONES = [
    {
      key: 'hills', name: 'GREEN HILLS', distanceStart: 0,
      sky: ['#5fb8ee', '#cdeffd'], ground: '#8a5a34', groundTop: '#5f8c3c',
      decor: '#4c9a63', obstacleColor: '#5b4636', obstacleAccent: '#75593f',
      spawnRateMult: 1, speedMult: 1, drainMult: 1, fruitPoints: 10,
      obstacles: [{ type: 'rock', w: 1 }],
    },
    {
      key: 'lava', name: 'LAVA ZONE', distanceStart: 5500,
      sky: ['#2b0f10', '#7a2b12'], ground: '#241010', groundTop: '#4a1a10',
      decor: '#5c1c0e', obstacleColor: '#3a1810', obstacleAccent: '#ff6a2b',
      spawnRateMult: 1.15, speedMult: 1.08, drainMult: 1.1, fruitPoints: 20,
      obstacles: [{ type: 'rock', w: 0.4 }, { type: 'spike', w: 0.35 }, { type: 'gap', w: 0.25 }],
    },
    {
      key: 'castle', name: 'CASTLE', distanceStart: 13000,
      sky: ['#2c2140', '#5c4a78'], ground: '#3a3a44', groundTop: '#55555f',
      decor: '#403a54', obstacleColor: '#5a5a66', obstacleAccent: '#7a7a88',
      spawnRateMult: 1.3, speedMult: 1.15, drainMult: 1.2, fruitPoints: 35,
      obstacles: [{ type: 'spike', w: 0.35 }, { type: 'pillar', w: 0.25 }, { type: 'gap', w: 0.25 }, { type: 'rock', w: 0.15 }],
    },
    {
      key: 'space', name: 'SPACE', distanceStart: 22000,
      sky: ['#05040f', '#150a2e'], ground: '#20182f', groundTop: '#39294f',
      decor: '#20182f', obstacleColor: '#4a3f66', obstacleAccent: '#6a5a8a',
      spawnRateMult: 1.5, speedMult: 1.25, drainMult: 1.3, fruitPoints: 50,
      obstacles: [{ type: 'asteroid', w: 0.35 }, { type: 'alien', w: 0.3 }, { type: 'gap', w: 0.2 }, { type: 'spike', w: 0.15 }],
    },
  ];

  function getZoneIndex(distance) {
    let idx = 0;
    for (let i = 0; i < ZONES.length; i++) if (distance >= ZONES[i].distanceStart) idx = i;
    return idx;
  }

  const STARS = Array.from({ length: 50 }, () => ({
    x: Math.random() * W, y: Math.random() * (GROUND_Y - 10), size: Math.random() < 0.2 ? 2 : 1, phase: Math.random() * Math.PI * 2,
  }));

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
  const sfxJump = () => beep(520, 0.12, 'square', 0.12);
  const sfxDoubleJump = () => beep(700, 0.1, 'square', 0.12);
  const sfxCollect = () => { beep(880, 0.08, 'square', 0.14); beep(1180, 0.08, 'square', 0.1, 0.05); };
  const sfxPower = () => { beep(500, 0.08, 'triangle', 0.16); beep(750, 0.08, 'triangle', 0.14, 0.06); beep(1000, 0.1, 'triangle', 0.14, 0.12); };
  const sfxHit = () => beep(140, 0.25, 'sawtooth', 0.18);
  const sfxGameOver = () => { beep(300, 0.15, 'square', 0.15); beep(200, 0.2, 'square', 0.15, 0.15); beep(120, 0.3, 'square', 0.15, 0.35); };
  const sfxZone = () => { beep(400, 0.12, 'triangle', 0.14); beep(600, 0.12, 'triangle', 0.14, 0.1); beep(900, 0.16, 'triangle', 0.14, 0.2); };

  // ---------- State ----------
  let state = 'start'; // 'start' | 'playing' | 'gameover'
  let player, obstacles, fruits, particles, platforms, powerups;
  let speed, elapsed, energy, fruitCount, score, highScore, nextObstacleT, nextFruitT, nextPowerT;
  let distance, zoneIndex, zoneBannerTimer, spawnGraceTimer;
  let glideUntil, doubleJumpUntil;
  let hitFlash = 0;
  let scrollSlow = 0, scrollFast = 0;
  let holdingJump = false;
  const cloudOffsets = [60, 220, 380];
  const planetOffsets = [80, 340];

  highScore = parseInt(localStorage.getItem(HIGH_SCORE_KEY) || '0', 10);

  function rand(a, b) { return a + Math.random() * (b - a); }

  function reset() {
    player = { x: 60, y: GROUND_Y - 28, w: 30, h: 28, vy: 0, onGround: true, runT: 0, invuln: 0, jumpsUsed: 0, maxJumps: 1, gliding: false, standingPlatform: null, jumpHoldTime: 0 };
    obstacles = [];
    fruits = [];
    particles = [];
    platforms = [];
    powerups = [];
    speed = BASE_SPEED;
    elapsed = 0;
    energy = 100;
    fruitCount = 0;
    score = 0;
    hitFlash = 0;
    distance = 0;
    zoneIndex = 0;
    zoneBannerTimer = 0;
    spawnGraceTimer = 0;
    glideUntil = -1;
    doubleJumpUntil = -1;
    nextObstacleT = rand(1.2, 2.0);
    nextFruitT = rand(0.7, 1.3);
    nextPowerT = rand(5, 8);
  }
  reset();

  // ---------- Input ----------
  function onPressStart() {
    ensureAudio();
    if (state === 'start') { state = 'playing'; return; }
    if (state === 'gameover') { reset(); state = 'playing'; return; }
    if (state === 'playing') attemptJump();
  }
  function attemptJump() {
    if (player.jumpsUsed < player.maxJumps) {
      const first = player.jumpsUsed === 0;
      player.vy = first ? JUMP_VELOCITY : DOUBLE_JUMP_VELOCITY;
      player.jumpsUsed++;
      player.onGround = false;
      player.standingPlatform = null;
      player.jumpHoldTime = 0;
      first ? sfxJump() : sfxDoubleJump();
    }
  }

  function releaseJump() {
    holdingJump = false;
    if (state === 'playing' && player.vy < 0) player.vy *= JUMP_CUT_MULT; // short tap = short hop
  }

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') {
      e.preventDefault();
      if (!holdingJump) { holdingJump = true; onPressStart(); }
    }
    if (e.key === 'n' || e.key === 'N') { distance += 6500; } // hidden dev shortcut: skip ahead a zone
  });
  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space' || e.code === 'ArrowUp') releaseJump();
  });
  // Whole page is a jump button on touch/mouse (not just the canvas), so it's easy to tap
  // anywhere near the game. Links (like "back to MickleCade") are excluded so they still work.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && e.target.closest('a')) return;
    e.preventDefault();
    holdingJump = true;
    onPressStart();
  });
  document.addEventListener('pointerup', releaseJump);
  document.addEventListener('pointercancel', releaseJump);

  // Xbox 360 controller: A or Start to jump/confirm, same hold-for-higher-jump feel.
  function pollGamepad() {
    Pad360.poll();
    const jump = Pad360.BTN.A, start = Pad360.BTN.START;
    if (Pad360.pressed(jump) || Pad360.pressed(start)) { if (!holdingJump) { holdingJump = true; onPressStart(); } }
    if (Pad360.released(jump) || Pad360.released(start)) releaseJump();
  }

  // ---------- Obstacle / platform / powerup generation ----------
  function pickObstacleType(zone) {
    const table = zone.obstacles;
    let r = Math.random(), acc = 0;
    for (const entry of table) { acc += entry.w; if (r <= acc) return entry.type; }
    return table[table.length - 1].type;
  }

  function makeObstacle(type, zone) {
    switch (type) {
      case 'rock': {
        const h = Math.round(rand(16, 26)), w = Math.round(rand(16, 24));
        return { type, x: W + 10, y: GROUND_Y - h, w, h, color: zone.obstacleColor, accent: zone.obstacleAccent, hitEnergy: 22 };
      }
      case 'spike': {
        const h = Math.round(rand(26, 36)), w = 14;
        return { type, x: W + 10, y: GROUND_Y - h, w, h, color: zone.obstacleColor, accent: zone.obstacleAccent, hitEnergy: 24 };
      }
      case 'pillar': {
        const h = 52, w = 16;
        return { type, x: W + 10, y: GROUND_Y - h, w, h, color: zone.obstacleColor, accent: zone.obstacleAccent, hitEnergy: 26 };
      }
      case 'gap': {
        const w = Math.round(rand(70, 110));
        return { type, x: W + 10, y: GROUND_Y - 10, w, h: 10, zoneKey: zone.key, hitEnergy: 30 };
      }
      case 'asteroid': {
        const h = 18, w = 20, baseY = rand(GROUND_Y - 150, GROUND_Y - 45);
        return { type, x: W + 10, y: baseY, baseY, w, h, bob: 10, phase: rand(0, Math.PI * 2), hitEnergy: 20 };
      }
      case 'alien': {
        const h = 14, w = 20, baseY = GROUND_Y - 40;
        return { type, x: W + 10, y: baseY, baseY, w, h, bob: 20, phase: rand(0, Math.PI * 2), speedMult: 1.25, hitEnergy: 18 };
      }
    }
  }

  // ---------- Collision ----------
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function triggerGameOver() {
    state = 'gameover';
    sfxGameOver();
    if (score > highScore) {
      highScore = score;
      localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
    }
  }

  // ---------- Update ----------
  function update(dt) {
    if (state !== 'playing') return;

    const zone = ZONES[zoneIndex];
    elapsed += dt;
    const rampedSpeed = Math.min(MAX_SPEED, BASE_SPEED + elapsed * SPEED_RAMP);
    speed = rampedSpeed * zone.speedMult;

    distance += speed * dt;
    const newZoneIndex = getZoneIndex(distance);
    if (newZoneIndex !== zoneIndex) {
      zoneIndex = newZoneIndex;
      zoneBannerTimer = 2.4;
      spawnGraceTimer = 2.0;
      sfxZone();
    }
    if (zoneBannerTimer > 0) zoneBannerTimer -= dt;
    if (spawnGraceTimer > 0) spawnGraceTimer -= dt;

    scrollFast += speed * dt;
    scrollSlow += speed * 0.25 * dt;

    energy -= DRAIN_RATE * zone.drainMult * dt;
    if (energy <= 0) { energy = 0; triggerGameOver(); return; }

    if (player.invuln > 0) player.invuln -= dt;

    // abilities
    player.maxJumps = elapsed < doubleJumpUntil ? 2 : 1;
    const glideActive = elapsed < glideUntil;

    // leaving a platform underfoot
    if (player.onGround && player.standingPlatform) {
      const pl = player.standingPlatform;
      const stillOn = platforms.includes(pl) && player.x + player.w > pl.x && player.x < pl.x + pl.w;
      if (!stillOn) { player.onGround = false; player.standingPlatform = null; }
    }

    const prevBottom = player.y + player.h;

    // physics
    player.gliding = glideActive && holdingJump && player.vy > 0 && !player.onGround;
    const jumpFloating = holdingJump && player.vy < 0 && !player.onGround && player.jumpHoldTime < JUMP_HOLD_MAX_TIME;
    if (jumpFloating) player.jumpHoldTime += dt;
    let g = GRAVITY;
    if (player.gliding) g = GLIDE_GRAVITY;
    else if (jumpFloating) g = GRAVITY * JUMP_HOLD_GRAVITY_MULT;
    player.vy += g * dt;
    if (player.gliding) player.vy = Math.min(player.vy, GLIDE_MAX_FALL);
    player.y += player.vy * dt;

    if (player.y >= GROUND_Y - player.h) {
      player.y = GROUND_Y - player.h;
      player.vy = 0;
      player.onGround = true;
      player.jumpsUsed = 0;
      player.jumpHoldTime = 0;
      player.standingPlatform = null;
    } else {
      // platform landing (one-way)
      if (player.vy >= 0) {
        for (const pl of platforms) {
          const feetNow = player.y + player.h;
          if (player.x + player.w > pl.x && player.x < pl.x + pl.w && prevBottom <= pl.y + 1 && feetNow >= pl.y) {
            player.y = pl.y - player.h;
            player.vy = 0;
            player.onGround = true;
            player.jumpsUsed = 0;
            player.standingPlatform = pl;
            break;
          }
        }
      }
    }
    if (player.onGround) player.runT += dt * (speed / BASE_SPEED);

    // spawn obstacles (paused briefly after a zone transition)
    if (spawnGraceTimer <= 0) {
      nextObstacleT -= dt;
      if (nextObstacleT <= 0) {
        const type = pickObstacleType(zone);
        const o = makeObstacle(type, zone);
        obstacles.push(o);
        if (type === 'gap' && Math.random() < 0.75) {
          platforms.push({ x: o.x + o.w / 2 - 35, y: GROUND_Y - 55, w: 70, h: 10 });
        }
        nextObstacleT = Math.max(0.7, rand(1.1, 1.9) - elapsed * 0.008) / zone.spawnRateMult;
      }
    }

    // spawn fruit
    nextFruitT -= dt;
    if (nextFruitT <= 0) {
      const highFruit = Math.random() < 0.45;
      const y = highFruit ? GROUND_Y - 78 : GROUND_Y - 20;
      const colors = ['#b15be0', '#33d6c0', '#ffd23f'];
      fruits.push({ x: W + 10, y, r: 8, color: colors[Math.floor(Math.random() * colors.length)], bob: Math.random() * Math.PI * 2 });
      nextFruitT = rand(0.8, 1.5);
    }

    // spawn powerups (from the lava zone onward)
    if (distance >= ZONES[1].distanceStart) {
      nextPowerT -= dt;
      if (nextPowerT <= 0) {
        const type = Math.random() < 0.5 ? 'glide' : 'double';
        powerups.push({ x: W + 10, y: GROUND_Y - 50, r: 8, type, bob: Math.random() * Math.PI * 2 });
        nextPowerT = rand(7, 11);
      }
    }

    // move + cull
    for (const o of obstacles) {
      o.x -= speed * (o.speedMult || 1) * dt;
      if (o.bob) o.y = o.baseY + Math.sin(elapsed * 4 + o.phase) * o.bob;
    }
    obstacles = obstacles.filter(o => o.x + o.w > -10);

    for (const pl of platforms) pl.x -= speed * dt;
    platforms = platforms.filter(pl => pl.x + pl.w > -10);

    for (const f of fruits) { f.x -= speed * dt; f.bob += dt * 4; }
    fruits = fruits.filter(f => f.x + f.r > -10);

    for (const p of powerups) { p.x -= speed * dt; p.bob += dt * 4; }
    powerups = powerups.filter(p => p.x + p.r > -10);

    for (const p of particles) { p.x -= speed * dt * 0.5; p.y += p.vy * dt; p.life -= dt; }
    particles = particles.filter(p => p.life > 0);

    // collisions: obstacles
    if (player.invuln <= 0) {
      for (const o of obstacles) {
        if (rectsOverlap(player.x + 4, player.y + 4, player.w - 8, player.h - 6, o.x, o.y, o.w, o.h)) {
          energy -= (o.hitEnergy || HIT_ENERGY);
          player.invuln = HIT_INVULN_TIME;
          hitFlash = 0.25;
          sfxHit();
          if (energy <= 0) { energy = 0; triggerGameOver(); return; }
          break;
        }
      }
    }

    // collisions: fruit
    fruits = fruits.filter(f => {
      const dx = (player.x + player.w / 2) - f.x;
      const dy = (player.y + player.h / 2) - f.y;
      if (Math.sqrt(dx * dx + dy * dy) < f.r + 14) {
        fruitCount++;
        score += zone.fruitPoints;
        energy = Math.min(100, energy + FRUIT_ENERGY);
        sfxCollect();
        for (let i = 0; i < 6; i++) particles.push({ x: f.x, y: f.y, vy: rand(-40, -10), life: 0.4, color: f.color });
        return false;
      }
      return true;
    });

    // collisions: powerups
    powerups = powerups.filter(p => {
      const dx = (player.x + player.w / 2) - p.x;
      const dy = (player.y + player.h / 2) - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < p.r + 14) {
        if (p.type === 'glide') glideUntil = elapsed + ABILITY_DURATION;
        else doubleJumpUntil = elapsed + ABILITY_DURATION;
        sfxPower();
        const c = p.type === 'glide' ? '#4fd6ff' : '#ff9d3f';
        for (let i = 0; i < 8; i++) particles.push({ x: p.x, y: p.y, vy: rand(-50, -15), life: 0.5, color: c });
        return false;
      }
      return true;
    });

    if (hitFlash > 0) hitFlash -= dt;
  }

  // ---------- Drawing ----------
  function drawSky(zone) {
    const g = ctx.createLinearGradient(0, 0, 0, GROUND_Y);
    g.addColorStop(0, zone.sky[0]);
    g.addColorStop(1, zone.sky[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (zone.key === 'hills') {
      ctx.fillStyle = '#fff2a8';
      ctx.beginPath(); ctx.arc(350, 14, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < cloudOffsets.length; i++) {
        let cx = (cloudOffsets[i] - scrollSlow * 0.4) % (W + 80);
        if (cx < -80) cx += W + 80;
        drawCloud(cx, 30 + i * 22);
      }
    } else if (zone.key === 'lava') {
      ctx.fillStyle = 'rgba(255, 106, 43, 0.35)';
      ctx.beginPath(); ctx.arc(350, 20, 20, 0, Math.PI * 2); ctx.fill();
    } else if (zone.key === 'castle') {
      ctx.fillStyle = '#cfc9e0';
      ctx.beginPath(); ctx.arc(350, 18, 12, 0, Math.PI * 2); ctx.fill();
    } else if (zone.key === 'space') {
      for (const s of STARS) {
        let sx = (s.x - scrollSlow * 0.3) % W;
        if (sx < 0) sx += W;
        const tw = 0.5 + 0.5 * Math.sin(elapsed * 2 + s.phase);
        ctx.fillStyle = `rgba(255,255,255,${0.4 + tw * 0.6})`;
        ctx.fillRect(sx, s.y, s.size, s.size);
      }
      ctx.fillStyle = 'rgba(160, 90, 220, 0.5)';
      let px = (planetOffsets[0] - scrollSlow * 0.15) % (W + 60);
      if (px < -30) px += W + 60;
      ctx.beginPath(); ctx.arc(px, 40, 14, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(90, 200, 220, 0.4)';
      let px2 = (planetOffsets[1] - scrollSlow * 0.1) % (W + 40);
      if (px2 < -20) px2 += W + 40;
      ctx.beginPath(); ctx.arc(px2, 24, 8, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawCloud(x, y) {
    ctx.fillRect(x, y, 36, 10);
    ctx.fillRect(x + 8, y - 6, 22, 10);
  }

  function drawBackdrop(zone) {
    const tileW = 160;
    const offset = scrollSlow % tileW;
    if (zone.key === 'hills') {
      ctx.fillStyle = zone.decor;
      for (let x = -offset - tileW; x < W + tileW; x += tileW) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y); ctx.lineTo(x + tileW * 0.5, GROUND_Y - 46); ctx.lineTo(x + tileW, GROUND_Y);
        ctx.closePath(); ctx.fill();
      }
    } else if (zone.key === 'lava') {
      for (let x = -offset - tileW; x < W + tileW; x += tileW) {
        ctx.fillStyle = zone.decor;
        ctx.beginPath();
        ctx.moveTo(x + 20, GROUND_Y); ctx.lineTo(x + tileW * 0.5, GROUND_Y - 58); ctx.lineTo(x + tileW - 20, GROUND_Y);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff6a2b';
        ctx.beginPath(); ctx.arc(x + tileW * 0.5, GROUND_Y - 58, 4, 0, Math.PI * 2); ctx.fill();
        if (Math.random() < 0.02) {
          particles.push({ x: x + tileW * 0.5, y: GROUND_Y - 58, vy: rand(-30, -10), life: 0.6, color: '#ff9d3f' });
        }
      }
    } else if (zone.key === 'castle') {
      ctx.fillStyle = zone.decor;
      const wallY = GROUND_Y - 34;
      ctx.fillRect(0, wallY, W, 34);
      ctx.fillStyle = '#332c46';
      const crenW = 16;
      let cOff = scrollFast % crenW;
      for (let x = -cOff; x < W + crenW; x += crenW) ctx.fillRect(x, wallY - 8, 8, 8);
    } else if (zone.key === 'space') {
      // no ground hills — open void, handled by starfield in drawSky
    }
  }

  function drawGround(zone) {
    ctx.fillStyle = zone.ground;
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = zone.groundTop;
    ctx.fillRect(0, GROUND_Y, W, 8);

    ctx.fillStyle = zone.obstacleAccent;
    ctx.globalAlpha = 0.5;
    const tileW = 20;
    const offset = scrollFast % tileW;
    for (let x = -offset; x < W + tileW; x += tileW) {
      ctx.fillRect(x, GROUND_Y + 12, 10, 6);
    }
    ctx.globalAlpha = 1;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawKoala() {
    const x = player.x, y = player.y, w = player.w, h = player.h;
    if (hitFlash > 0 && Math.floor(hitFlash * 20) % 2 === 0) return; // flicker when hit

    const legPhase = player.onGround ? Math.sin(player.runT * 14) : 0;

    if (player.gliding) {
      ctx.fillStyle = 'rgba(79, 214, 255, 0.55)';
      ctx.beginPath();
      ctx.moveTo(x + 2, y + 14);
      ctx.lineTo(x - 12, y + 6);
      ctx.lineTo(x + 4, y + 20);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + w - 4, y + 14);
      ctx.lineTo(x + w + 12, y + 6);
      ctx.lineTo(x + w - 6, y + 20);
      ctx.closePath(); ctx.fill();
    }

    ctx.fillStyle = '#6e6e78';
    ctx.beginPath(); ctx.arc(x + 6, y + 4, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 8, y + 3, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c9c9d1';
    ctx.beginPath(); ctx.arc(x + 6, y + 4, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + w - 8, y + 3, 4, 0, Math.PI * 2); ctx.fill();

    ctx.fillStyle = '#9b9ba3';
    roundRect(x + 2, y + 10, w - 4, h - 14, 6); ctx.fill();
    ctx.fillStyle = '#c9c9d1';
    roundRect(x + 6, y + 16, w - 14, h - 20, 4); ctx.fill();

    ctx.fillStyle = '#9b9ba3';
    ctx.beginPath(); ctx.arc(x + w - 10, y + 10, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2b2b2b';
    ctx.beginPath(); ctx.ellipse(x + w - 2, y + 11, 5, 4, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#1c1c1c';
    ctx.fillRect(x + w - 12, y + 6, 2, 2);

    ctx.fillStyle = '#6e6e78';
    const legOffset = Math.round(legPhase * 3);
    ctx.fillRect(x + 6, y + h - 6, 6, 6 + legOffset);
    ctx.fillRect(x + w - 14, y + h - 6, 6, 6 - legOffset);
  }

  function drawObstacle(o, zone) {
    switch (o.type) {
      case 'rock':
        ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = o.accent; ctx.fillRect(o.x + 2, o.y + 2, o.w - 4, 3);
        break;
      case 'spike':
        ctx.fillStyle = o.color;
        ctx.beginPath(); ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + o.w / 2, o.y); ctx.lineTo(o.x + o.w, o.y + o.h);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = o.accent; ctx.fillRect(o.x + o.w / 2 - 2, o.y, 4, 6);
        break;
      case 'pillar':
        ctx.fillStyle = o.color; ctx.fillRect(o.x, o.y, o.w, o.h);
        ctx.fillStyle = o.accent;
        for (let yy = o.y; yy < o.y + o.h; yy += 10) ctx.fillRect(o.x, yy, o.w, 2);
        break;
      case 'gap':
        if (o.zoneKey === 'lava') {
          ctx.fillStyle = '#ff6a2b'; ctx.fillRect(o.x, o.y, o.w, o.h);
          ctx.fillStyle = '#ffb347';
          for (let xx = o.x; xx < o.x + o.w; xx += 8) ctx.fillRect(xx, o.y - 2, 4, 2);
        } else if (o.zoneKey === 'castle') {
          ctx.fillStyle = '#100a18'; ctx.fillRect(o.x, o.y, o.w, o.h);
        } else {
          ctx.fillStyle = '#05030a'; ctx.fillRect(o.x, o.y, o.w, o.h);
        }
        break;
      case 'asteroid':
        ctx.save();
        ctx.translate(o.x + o.w / 2, o.y + o.h / 2);
        ctx.rotate(o.phase + elapsed);
        ctx.fillStyle = '#4a3f66'; ctx.fillRect(-o.w / 2, -o.h / 2, o.w, o.h);
        ctx.fillStyle = '#6a5a8a'; ctx.fillRect(-o.w / 2 + 2, -o.h / 2 + 2, 4, 4);
        ctx.restore();
        break;
      case 'alien':
        ctx.fillStyle = '#6a5a8a'; roundRect(o.x, o.y + 4, o.w, o.h - 4, 4); ctx.fill();
        ctx.fillStyle = '#33d6c0';
        ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + 4, 6, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#1c1c1c';
        ctx.fillRect(o.x + 4, o.y + 6, 3, 3); ctx.fillRect(o.x + o.w - 7, o.y + 6, 3, 3);
        break;
    }
  }

  function drawObstacles(zone) {
    for (const o of obstacles) drawObstacle(o, zone);
  }

  function drawPlatforms() {
    for (const pl of platforms) {
      ctx.fillStyle = '#7a7a88';
      ctx.fillRect(pl.x, pl.y, pl.w, pl.h);
      ctx.fillStyle = '#9d9dab';
      ctx.fillRect(pl.x, pl.y, pl.w, 3);
    }
  }

  function drawFruit() {
    for (const f of fruits) {
      const bobY = f.y + Math.sin(f.bob) * 3;
      ctx.save();
      ctx.translate(f.x, bobY);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = f.color;
      ctx.fillRect(-f.r, -f.r, f.r * 2, f.r * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-f.r + 2, -f.r + 2, 3, 3);
      ctx.restore();
    }
  }

  function drawPowerups() {
    for (const p of powerups) {
      const bobY = p.y + Math.sin(p.bob) * 3;
      ctx.save();
      ctx.translate(p.x, bobY);
      ctx.fillStyle = p.type === 'glide' ? 'rgba(79, 214, 255, 0.25)' : 'rgba(255, 157, 63, 0.25)';
      ctx.beginPath(); ctx.arc(0, 0, p.r + 4, 0, Math.PI * 2); ctx.fill();
      if (p.type === 'glide') {
        ctx.fillStyle = '#4fd6ff';
        ctx.beginPath(); ctx.moveTo(-8, 2); ctx.lineTo(0, -6); ctx.lineTo(8, 2); ctx.lineTo(0, 5); ctx.closePath(); ctx.fill();
      } else {
        ctx.fillStyle = '#ff9d3f';
        ctx.fillRect(-6, -5, 12, 4);
        ctx.fillRect(-6, 2, 12, 4);
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 0.6);
      ctx.fillRect(p.x, p.y, 3, 3);
      ctx.globalAlpha = 1;
    }
  }

  function drawAlienTrailers(zone) {
    if (zone.key !== 'space') return;
    for (let i = 0; i < 3; i++) {
      const x = player.x - 22 - i * 16;
      const y = player.y + 6 + Math.sin(elapsed * 3 + i * 2) * 8;
      ctx.fillStyle = 'rgba(106, 90, 138, 0.8)';
      roundRect(x, y, 12, 7, 3); ctx.fill();
      ctx.fillStyle = 'rgba(51, 214, 192, 0.8)';
      ctx.beginPath(); ctx.arc(x + 6, y, 3, Math.PI, 0); ctx.fill();
    }
  }

  function drawHUD(zone) {
    ctx.fillStyle = '#000';
    ctx.fillRect(10, 10, 124, 14);
    ctx.fillStyle = '#222';
    ctx.fillRect(12, 12, 120, 10);
    const barColor = energy > 40 ? '#4fff8f' : energy > 18 ? '#ffe14f' : '#ff4f4f';
    ctx.fillStyle = barColor;
    ctx.fillRect(12, 12, 120 * (energy / 100), 10);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.strokeRect(10.5, 10.5, 124, 14);

    ctx.fillStyle = '#fff';
    ctx.font = '10px monospace';
    ctx.fillText('ENERGY', 12, 34);

    drawAbilityBadge(12, 42, '#4fd6ff', 'GLIDE', elapsed < glideUntil, glideUntil - elapsed);
    drawAbilityBadge(90, 42, '#ff9d3f', '2X JUMP', elapsed < doubleJumpUntil, doubleJumpUntil - elapsed);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffe14f';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('SCORE: ' + score, W - 10, 20);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#fff';
    ctx.fillText('FRUIT: ' + fruitCount, W - 10, 32);
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('BEST: ' + highScore, W - 10, 43);
    ctx.textAlign = 'left';

    ctx.textAlign = 'center';
    ctx.font = '9px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(zone.name, W / 2, 10);
    ctx.textAlign = 'left';
  }

  function drawAbilityBadge(x, y, color, label, active, remain) {
    ctx.fillStyle = active ? color : '#333';
    ctx.fillRect(x, y, 10, 10);
    ctx.strokeStyle = active ? '#fff' : '#555';
    ctx.strokeRect(x + 0.5, y + 0.5, 10, 10);
    ctx.fillStyle = active ? '#fff' : '#666';
    ctx.font = '8px monospace';
    ctx.fillText(label + (active ? ' ' + Math.ceil(remain) + 's' : ''), x + 14, y + 9);
  }

  function drawZoneBanner(zone) {
    if (zoneBannerTimer <= 0 || state !== 'playing') return;
    const alpha = Math.min(1, zoneBannerTimer / 0.5, (2.4 - zoneBannerTimer) / 0.4 + 1) > 1 ? 1 : Math.min(1, zoneBannerTimer);
    ctx.save();
    ctx.globalAlpha = Math.min(1, zoneBannerTimer * 1.5);
    ctx.fillStyle = 'rgba(10, 6, 24, 0.6)';
    ctx.fillRect(0, 100, W, 40);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ffe14f';
    ctx.shadowBlur = 8;
    ctx.fillText('ENTERING ' + zone.name, W / 2, 124);
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawCenterText(lines) {
    ctx.save();
    ctx.fillStyle = 'rgba(10, 6, 24, 0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    let y = H / 2 - (lines.length - 1) * 12;
    for (const line of lines) {
      ctx.font = line.font || 'bold 18px monospace';
      ctx.fillStyle = line.color || '#ffe14f';
      ctx.shadowColor = line.color || '#ffe14f';
      ctx.shadowBlur = 6;
      ctx.fillText(line.text, W / 2, y);
      y += line.gap || 24;
    }
    ctx.shadowBlur = 0;
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function render() {
    const zone = ZONES[zoneIndex];
    drawSky(zone);
    drawBackdrop(zone);
    drawGround(zone);
    drawPlatforms();
    drawObstacles(zone);
    drawFruit();
    drawPowerups();
    drawAlienTrailers(zone);
    drawKoala();
    drawParticles();
    drawHUD(zone);
    drawZoneBanner(zone);

    if (state === 'start') {
      drawCenterText([
        { text: 'FREDDY BEAR RUN', font: 'bold 22px monospace', color: '#ffe14f', gap: 26 },
        { text: 'Help Freddy the koala collect', font: '10px monospace', color: '#fff', gap: 14 },
        { text: 'magic fruit before energy runs out!', font: '10px monospace', color: '#fff', gap: 22 },
        { text: 'PRESS SPACE / TAP TO START', font: 'bold 13px monospace', color: '#4ff0ff', gap: 16 },
      ]);
    } else if (state === 'gameover') {
      drawCenterText([
        { text: 'OUT OF ENERGY!', font: 'bold 20px monospace', color: '#ff4f4f', gap: 26 },
        { text: 'SCORE: ' + score + '  (FRUIT: ' + fruitCount + ')', font: '12px monospace', color: '#fff', gap: 18 },
        { text: 'ZONE REACHED: ' + ZONES[zoneIndex].name, font: '12px monospace', color: '#fff', gap: 18 },
        { text: 'BEST: ' + highScore, font: '12px monospace', color: '#4ff0ff', gap: 22 },
        { text: 'PRESS SPACE / TAP TO RETRY', font: 'bold 13px monospace', color: '#ffe14f', gap: 16 },
      ]);
    }
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
