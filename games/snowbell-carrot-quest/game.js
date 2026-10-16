// Snowbell: The Quest for the Golden Tablet -- a gentle platformer for MickleCade.
// Game design by one of the MickleKids. No enemies, no dying: if Snowbell falls, a helper
// bunny drops a string and pulls her back up.
(() => {
  const canvas = document.getElementById('game');

  const W = 480, H = 270;
  // Draw in 480x270 coordinates; HiRes gives the canvas a screen-sized pixel buffer so it stays sharp.
  const ctx = HiRes.setup(canvas, W, H);

  const SAVE_KEY = 'snowbellCarrotQuest.save';

  // ---------- Physics ----------
  const GRAVITY = 1300;
  const MOVE_SPEED = 150;
  const GROUND_ACCEL = 1200;
  const AIR_ACCEL = 850;
  const FRICTION = 1500;
  const JUMP_V = -395;
  const JUMP_HOLD_G = 0.45;   // lighter gravity while rising and holding = higher hop
  const JUMP_HOLD_MAX = 0.15;
  const JUMP_CUT = 0.45;      // let go early = short hop
  const COYOTE = 0.14;        // forgiving: still jumpable just after leaving a ledge
  const BUFFER = 0.16;        // forgiving: pressing hop early still works on landing
  const BOUNCE_V = -680;      // Fuzzyball trampoline
  const SLIDE_ACCEL = 700;    // cord slides in the computer level
  const SLIDE_MAX = 265;
  const FALL_Y = 320;         // below this, a helper bunny comes to the rescue

  const PW = 20, PH = 22;     // Snowbell's collision box

  // ---------- Carrots ----------
  const CARROTS = {
    bronze: { points: 5,   body: '#c87a3c', light: '#e6a06a', rgb: '230,160,106', name: 'BRONZE' },
    silver: { points: 10,  body: '#b8c6d4', light: '#eef5fb', rgb: '238,245,251', name: 'SILVER' },
    gold:   { points: 25,  body: '#ffc233', light: '#fff0a8', rgb: '255,240,168', name: 'GOLD'   },
    jewel:  { points: 100, body: '#49dcff', light: '#d6fbff', rgb: '214,251,255', name: 'JEWEL'  },
  };

  // ---------- Helper bunny colours ----------
  const BUNNIES = {
    snowbell: { fur: '#ffffff', shade: '#dfe6f2', ear: '#ffb3c8', name: 'SNOWBELL' },
    fuzzy:    { fur: '#ffd9a0', shade: '#e8b878', ear: '#ff9db5', name: 'FUZZYBALL' },
    buzzy:    { fur: '#8ff2d8', shade: '#4fc7ac', ear: '#ffe14f', name: 'BUZZYBALL' },
    blackie:  { fur: '#4a4453', shade: '#2e2935', ear: '#b57a9a', name: 'BLACKIEBLACK' },
    funny:    { fur: '#ffa85c', shade: '#e08236', ear: '#ffd0a0', name: 'FUNNYBUNNY' },
  };

  // ---------- Save ----------
  let save = { unlocked: 1, best: {}, tablet: false };
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) save = Object.assign(save, JSON.parse(raw));
  } catch {}
  function persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch {}
  }

  // ---------- Audio (WebAudio beeps, no files) ----------
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  }
  function beep(freq, duration, type = 'square', vol = 0.14, delay = 0) {
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
  const sfxHop     = () => beep(560, 0.09, 'square', 0.10);
  const sfxLand    = () => beep(260, 0.05, 'triangle', 0.07);
  const sfxBounce  = () => { beep(420, 0.09, 'triangle', 0.16); beep(880, 0.12, 'triangle', 0.13, 0.06); };
  const sfxCarrot  = (t) => {
    const base = t === 'jewel' ? 1040 : t === 'gold' ? 880 : t === 'silver' ? 760 : 640;
    beep(base, 0.07, 'square', 0.13);
    beep(base * 1.5, 0.08, 'square', 0.10, 0.05);
    if (t === 'jewel') beep(base * 2, 0.14, 'triangle', 0.12, 0.11);
  };
  const sfxRescue  = () => { beep(300, 0.1, 'triangle', 0.13); beep(500, 0.1, 'triangle', 0.13, 0.09); beep(760, 0.16, 'triangle', 0.12, 0.18); };
  const sfxLaugh   = () => { beep(620, 0.07, 'square', 0.12); beep(520, 0.07, 'square', 0.12, 0.08); beep(680, 0.07, 'square', 0.12, 0.16); beep(560, 0.1, 'square', 0.12, 0.24); };
  const sfxSlide   = () => beep(300, 0.25, 'sawtooth', 0.07);
  const sfxGoal    = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'triangle', 0.15, i * 0.11)); };
  const sfxTablet  = () => { [523, 659, 784, 1047, 1319, 1047, 1319, 1568].forEach((f, i) => beep(f, 0.22, 'triangle', 0.15, i * 0.16)); };
  const sfxMenu    = () => beep(700, 0.05, 'square', 0.09);

  function rand(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  // ---------- Level builder ----------
  // Everything lives in one screen-height of world (y 0..270); pits drop off the
  // bottom and are caught by a helper bunny, so falling is never fatal.
  function builder() {
    const lv = { solids: [], pits: [], carrots: [], helpers: [], props: [], len: 0, goalX: 0, goalY: 210 };
    const mark = (x) => { if (x > lv.len) lv.len = x; };
    const api = {
      lv,
      // floor slab; y is the top surface
      ground(x, w, y = 210) { lv.solids.push({ kind: 'ground', x, y, w, h: 340 - y }); mark(x + w); return api; },
      // one-way platform: hop up through it, land on top
      plat(x, y, w, h = 9) { lv.solids.push({ kind: 'plat', x, y, w, h }); mark(x + w); return api; },
      // solid thing to hop over (rock / cord / lego / toy / couch)
      block(x, w, h, baseY = 210, style = 'rock') { lv.solids.push({ kind: 'block', x, y: baseY - h, w, h, style }); mark(x + w); return api; },
      // diagonal cord slide: surface runs from (x,y1) to (x+w,y2)
      slope(x, w, y1, y2) { lv.solids.push({ kind: 'slope', x, w, y1, y2, y: Math.min(y1, y2), h: Math.abs(y2 - y1) + 10 }); mark(x + w); return api; },
      pit(x, w, style) { lv.pits.push({ x, w, style }); mark(x + w); return api; },
      carrot(x, y, type = 'bronze') { lv.carrots.push({ x, y, type, got: false, bob: Math.random() * 6.28 }); return api; },
      row(x, y, n, gap, type = 'bronze') { for (let i = 0; i < n; i++) api.carrot(x + i * gap, y, type); return api; },
      arc(x, y, n, gap, type = 'bronze', lift = 26) {
        for (let i = 0; i < n; i++) {
          const t = n === 1 ? 0 : (i / (n - 1)) * Math.PI;
          api.carrot(x + i * gap, y - Math.sin(t) * lift, type);
        }
        return api;
      },
      // helper bunnies. 'fuzzy' is a trampoline you can hop on; the others cheer
      // you on (and are the ones who come get you if you fall).
      hop(x, baseY = 210) { lv.helpers.push({ kind: 'fuzzy', x, y: baseY - 17, w: 28, h: 17, squash: 0, cheer: Math.random() * 6.28, bouncer: true }); return api; },
      cheer(x, kind, baseY = 210) { lv.helpers.push({ kind, x, y: baseY - 22, w: 20, h: 22, squash: 0, cheer: Math.random() * 6.28 }); return api; },
      // FunnyBunny + a toy too tall to hop: she laughs and it topples into a step
      topple(x, w, h, baseY = 210) {
        const toy = { kind: 'toy', x, y: baseY - h, w, h, baseY, state: 'up', t: 0, standW: w, standH: h };
        lv.props.push(toy);
        lv.helpers.push({ kind: 'funny', x: x - 50, y: baseY - 22, w: 20, h: 22, squash: 0, cheer: 0, toy, laugh: 0 });
        return api;
      },
      goal(x, y = 210) { lv.goalX = x; lv.goalY = y; mark(x + 140); return api; },
    };
    return api;
  }

  // ---------- The five lands ----------
  function makeLevel1() {
    const b = builder();
    b.ground(0, 560);
    b.row(120, 190, 5, 26, 'bronze');
    b.plat(250, 150, 70); b.row(266, 132, 3, 20, 'silver');
    b.block(430, 24, 24); b.carrot(400, 150, 'silver');

    b.pit(560, 72, 'grass'); b.arc(566, 176, 4, 18, 'bronze', 22);
    b.ground(632, 470);
    b.hop(830); b.carrot(843, 90, 'jewel'); b.row(800, 58, 3, 30, 'gold');
    b.block(960, 26, 28);
    b.row(700, 190, 4, 24, 'bronze');

    b.pit(1102, 80, 'grass'); b.arc(1110, 176, 4, 20, 'silver', 24);
    b.ground(1182, 570);
    b.plat(1250, 162, 66); b.row(1266, 144, 2, 22, 'silver');
    b.plat(1380, 122, 66); b.row(1396, 104, 2, 22, 'gold');
    b.plat(1510, 84, 66);  b.carrot(1543, 62, 'jewel');
    b.block(1660, 30, 30);
    b.row(1200, 190, 3, 24, 'bronze');

    b.pit(1752, 82, 'grass'); b.arc(1760, 176, 4, 20, 'bronze', 22);
    b.ground(1834, 666);
    b.hop(2000); b.plat(2060, 66, 80); b.row(2078, 46, 3, 22, 'gold'); b.carrot(2160, 104, 'jewel');
    b.block(2280, 26, 22); b.block(2322, 26, 34);
    b.row(1900, 190, 5, 26, 'bronze');
    b.cheer(2440, 'fuzzy');

    b.pit(2500, 86, 'grass'); b.arc(2508, 176, 4, 22, 'silver', 24);
    b.ground(2586, 814);
    b.hop(2700); b.carrot(2713, 92, 'jewel');
    b.plat(2810, 146, 70); b.row(2826, 128, 3, 20, 'gold');
    b.plat(2960, 112, 70); b.row(2976, 94, 3, 20, 'gold');
    b.row(3080, 190, 6, 24, 'silver');
    b.cheer(3190, 'fuzzy');
    b.goal(3300);
    return { key: 'grass', name: 'GRASSLANDS', blurb: 'Hop on Fuzzyball to fly!', helper: 'fuzzy', lv: b.lv };
  }

  function makeLevel2() {
    const b = builder();
    b.ground(0, 430);
    b.row(110, 190, 5, 26, 'bronze');
    b.block(280, 40, 18, 210, 'cord');
    b.cheer(90, 'buzzy');

    b.pit(430, 340, 'circuit');
    b.plat(450, 172, 62); b.row(466, 154, 2, 22, 'silver');
    b.plat(560, 134, 62); b.row(576, 116, 2, 22, 'silver');
    b.plat(668, 96, 62);  b.carrot(699, 74, 'gold');

    b.ground(770, 240, 88);
    b.row(790, 68, 6, 24, 'gold'); b.carrot(940, 40, 'jewel');
    b.cheer(980, 'buzzy', 88);

    b.pit(1010, 180, 'circuit');
    b.slope(1010, 180, 88, 202);
    b.arc(1030, 96, 6, 26, 'silver', 18);

    b.ground(1190, 330, 202);
    b.block(1300, 42, 18, 202, 'cord');
    b.row(1230, 182, 4, 24, 'bronze');
    b.block(1420, 30, 30, 202, 'chip');

    b.pit(1520, 84, 'circuit'); b.arc(1528, 168, 4, 20, 'silver', 24);
    b.ground(1604, 420, 202);
    b.block(1700, 44, 20, 202, 'cord');
    b.block(1860, 44, 24, 202, 'cord');
    b.row(1760, 182, 4, 22, 'bronze');
    b.cheer(1980, 'buzzy', 202);

    b.pit(2024, 176, 'circuit');
    b.plat(2040, 162, 62); b.row(2056, 144, 2, 22, 'gold');
    b.plat(2140, 124, 62); b.row(2156, 106, 2, 22, 'gold');
    b.ground(2200, 260, 108);
    b.row(2220, 88, 6, 24, 'silver'); b.carrot(2370, 58, 'jewel');

    b.pit(2460, 200, 'circuit');
    b.slope(2460, 200, 108, 206);
    b.arc(2480, 116, 6, 28, 'gold', 18);

    b.ground(2660, 460, 206);
    b.block(2780, 44, 20, 206, 'cord');
    b.block(2930, 30, 32, 206, 'chip');
    b.row(2840, 186, 4, 24, 'bronze');

    b.pit(3120, 88, 'circuit'); b.arc(3128, 172, 4, 22, 'silver', 24);
    b.ground(3208, 500, 206);
    b.row(3250, 186, 6, 24, 'gold');
    b.cheer(3400, 'buzzy', 206);
    b.goal(3560, 206);
    return { key: 'computer', name: 'INSIDE THE COMPUTER', blurb: 'Ride the cord slides!', helper: 'buzzy', lv: b.lv };
  }

  function makeLevel3() {
    const b = builder();
    b.ground(0, 600);
    b.row(110, 190, 4, 26, 'bronze');
    b.block(230, 28, 22, 210, 'lego'); b.carrot(244, 168, 'silver');
    b.block(360, 28, 34, 210, 'lego'); b.carrot(374, 154, 'silver');
    b.block(480, 44, 16, 210, 'lego'); b.row(492, 176, 2, 20, 'bronze');
    b.cheer(120, 'blackie');

    b.pit(600, 76, 'lego'); b.arc(608, 176, 4, 18, 'silver', 22);
    b.ground(676, 580);
    b.block(790, 30, 20, 210, 'lego');
    b.block(832, 30, 40, 210, 'lego'); b.carrot(847, 148, 'gold');
    b.plat(950, 140, 70); b.row(966, 122, 3, 20, 'gold');
    b.carrot(1070, 100, 'jewel');
    b.row(1120, 190, 4, 24, 'bronze');

    b.pit(1256, 82, 'lego'); b.arc(1264, 176, 4, 20, 'bronze', 22);
    b.ground(1338, 566);
    b.block(1400, 28, 26, 210, 'lego');
    b.block(1520, 28, 38, 210, 'lego'); b.carrot(1534, 150, 'silver');
    b.block(1640, 46, 22, 210, 'lego'); b.row(1652, 170, 2, 22, 'silver');
    b.plat(1760, 152, 66); b.row(1776, 134, 2, 22, 'gold');
    b.plat(1852, 112, 66); b.carrot(1885, 90, 'jewel');
    b.cheer(1700, 'blackie');

    b.pit(1904, 86, 'lego'); b.arc(1912, 172, 4, 22, 'silver', 24);
    b.ground(1990, 610);
    b.block(2100, 28, 22, 210, 'lego');
    b.block(2210, 28, 32, 210, 'lego');
    b.block(2320, 28, 42, 210, 'lego'); b.carrot(2334, 146, 'gold');
    b.plat(2430, 150, 70); b.row(2446, 132, 3, 20, 'gold');
    b.row(2150, 190, 3, 24, 'bronze');

    b.pit(2600, 84, 'lego'); b.arc(2608, 172, 4, 21, 'bronze', 22);
    b.ground(2684, 716);
    // the fort at the end: a lego staircase up to the flag
    b.block(2820, 60, 24, 210, 'lego'); b.row(2836, 172, 2, 24, 'silver');
    b.block(2880, 60, 48, 210, 'lego'); b.row(2896, 148, 2, 24, 'gold');
    b.block(2940, 60, 72, 210, 'lego'); b.carrot(2970, 120, 'jewel');
    b.cheer(3120, 'blackie');
    b.row(3160, 190, 5, 24, 'gold');
    b.goal(3300);
    return { key: 'lego', name: 'THE LEGO FORT', blurb: 'Hop the bricks!', helper: 'blackie', lv: b.lv };
  }

  function makeLevel4() {
    const b = builder();
    b.ground(0, 700);
    b.row(110, 190, 5, 26, 'bronze');
    b.block(240, 26, 24, 210, 'ball');
    b.block(380, 30, 30, 210, 'blocks'); b.carrot(395, 158, 'silver');
    b.block(500, 150, 52, 210, 'couch');
    b.row(520, 136, 5, 26, 'silver');
    b.cheer(130, 'funny');

    b.ground(700, 520);
    b.topple(800, 26, 62);
    b.carrot(813, 132, 'gold'); b.carrot(880, 174, 'silver');
    b.block(980, 26, 26, 210, 'ball');
    b.plat(1060, 140, 70); b.row(1076, 122, 3, 20, 'gold');
    b.carrot(1160, 100, 'jewel');

    b.pit(1220, 78, 'house'); b.arc(1228, 176, 4, 18, 'silver', 22);
    b.ground(1298, 542);
    b.block(1360, 150, 52, 210, 'couch'); b.row(1380, 136, 5, 26, 'gold');
    b.topple(1620, 26, 62); b.carrot(1633, 132, 'gold');
    b.block(1740, 30, 28, 210, 'blocks');
    b.row(1790, 190, 2, 24, 'bronze');

    b.pit(1840, 82, 'house'); b.arc(1848, 172, 4, 20, 'silver', 24);
    b.ground(1922, 700);
    b.block(2010, 26, 24, 210, 'ball');
    b.plat(2100, 152, 66); b.row(2116, 134, 2, 22, 'gold');
    b.plat(2210, 116, 66); b.carrot(2243, 94, 'jewel');
    b.topple(2400, 26, 62); b.carrot(2413, 132, 'gold');
    b.block(2520, 30, 32, 210, 'blocks');
    b.cheer(2590, 'funny');

    b.pit(2622, 84, 'house'); b.arc(2630, 172, 4, 22, 'bronze', 24);
    b.ground(2706, 794);
    b.block(2800, 150, 52, 210, 'couch'); b.row(2820, 136, 5, 26, 'gold');
    b.block(3020, 26, 26, 210, 'ball');
    b.plat(3110, 146, 70); b.row(3126, 128, 3, 20, 'gold');
    b.row(3240, 190, 5, 24, 'silver');
    b.cheer(3370, 'funny');
    b.goal(3420);
    return { key: 'house', name: 'THE BIG HOUSE', blurb: 'FunnyBunny laughs toys over!', helper: 'funny', lv: b.lv };
  }

  function makeLevel5() {
    const b = builder();
    b.ground(0, 520);
    b.row(110, 190, 5, 26, 'silver');
    b.block(330, 30, 28);
    b.cheer(120, 'fuzzy'); b.cheer(180, 'buzzy');

    b.pit(520, 90, 'lava'); b.arc(528, 172, 5, 18, 'gold', 24);
    b.ground(610, 420);
    b.hop(760); b.carrot(774, 86, 'jewel'); b.row(730, 54, 3, 30, 'gold');
    b.block(900, 30, 30);
    b.cheer(1000, 'blackie');

    b.pit(1030, 94, 'lava'); b.arc(1038, 168, 5, 20, 'gold', 26);
    b.ground(1124, 380);
    b.plat(1200, 150, 68); b.row(1216, 132, 3, 20, 'gold');
    b.plat(1330, 110, 68); b.carrot(1363, 88, 'jewel');
    b.block(1450, 30, 34);

    b.pit(1504, 96, 'lava'); b.arc(1512, 168, 5, 21, 'silver', 26);
    b.ground(1600, 440);
    b.hop(1720); b.row(1690, 58, 4, 28, 'gold'); b.carrot(1810, 100, 'jewel');
    b.block(1920, 30, 30);
    b.cheer(1990, 'funny');

    b.pit(2040, 98, 'lava'); b.arc(2048, 168, 5, 22, 'gold', 26);
    b.ground(2138, 400);
    b.plat(2220, 146, 68); b.row(2236, 128, 3, 20, 'gold');
    b.plat(2350, 104, 68); b.carrot(2383, 82, 'jewel');
    b.row(2180, 190, 3, 24, 'silver');

    b.pit(2538, 100, 'lava'); b.arc(2546, 166, 5, 22, 'gold', 26);
    b.ground(2638, 420);
    b.hop(2760); b.carrot(2774, 84, 'jewel');
    b.block(2900, 30, 32);
    b.row(2950, 190, 4, 24, 'gold');

    b.pit(3058, 96, 'lava'); b.arc(3066, 166, 5, 21, 'gold', 26);
    b.ground(3154, 646);
    b.cheer(3220, 'fuzzy'); b.cheer(3270, 'buzzy'); b.cheer(3320, 'blackie'); b.cheer(3370, 'funny');
    b.row(3420, 190, 6, 24, 'gold');
    b.goal(3620);
    return { key: 'volcano', name: 'VOLCANO LAND', blurb: 'All the bunnies help you!', helper: 'all', lv: b.lv };
  }

  const LEVELS = [makeLevel1(), makeLevel2(), makeLevel3(), makeLevel4(), makeLevel5()];
  LEVELS.forEach((L) => {
    L.totalCarrots = L.lv.carrots.length;
    L.maxScore = L.lv.carrots.reduce((s, c) => s + CARROTS[c.type].points, 0);
  });

  // ---------- State ----------
  let state = 'title';        // title | select | play | levelend | victory
  let levelIndex = 0;
  let L = LEVELS[0], lv = L.lv;
  let player = null, cam = { x: 0 }, particles = [], pops = [], rescue = null, safeSpot = { x: 40, y: 188 };
  let elapsed = 0, score = 0, carrotsGot = 0, bannerT = 0, selIndex = 0;
  let lastLevelScore = 0, newBest = false;

  function resetPlayer(x, y) {
    player = {
      x, y, vx: 0, vy: 0, w: PW, h: PH,
      onGround: false, coyote: 0, buffer: 0, holdT: 0, holding: false,
      face: 1, hopT: 0, squash: 0, onSlope: null, bounceT: 0,
    };
  }

  function startLevel(i) {
    levelIndex = i;
    L = LEVELS[i];
    lv = L.lv;
    lv.carrots.forEach((c) => { c.got = false; });
    lv.props.forEach((p) => { if (p.kind === 'toy') { p.state = 'up'; p.t = 0; } });
    lv.helpers.forEach((h) => { h.squash = 0; h.laugh = 0; });
    resetPlayer(40, lv.solids[0].y - PH);
    cam = { x: 0 };
    particles = []; pops = []; rescue = null;
    safeSpot = { x: player.x, y: player.y };
    score = 0; carrotsGot = 0; elapsed = 0; bannerT = 2.2;
    state = 'play';
  }

  // ---------- Input ----------
  const keys = {};
  const touch = { left: false, right: false, hop: false };

  function pressHop() {
    ensureAudio();
    if (state === 'title') { state = 'select'; selIndex = Math.min(save.unlocked - 1, LEVELS.length - 1); sfxMenu(); return; }
    if (state === 'select') {
      if (selIndex < save.unlocked) { startLevel(selIndex); sfxMenu(); }
      else beep(180, 0.12, 'square', 0.1);
      return;
    }
    if (state === 'levelend') {
      if (levelIndex + 1 < LEVELS.length && levelIndex + 1 < save.unlocked) startLevel(levelIndex + 1);
      else { state = 'select'; selIndex = Math.min(save.unlocked - 1, LEVELS.length - 1); }
      sfxMenu();
      return;
    }
    if (state === 'victory') { state = 'select'; selIndex = LEVELS.length - 1; sfxMenu(); return; }
    if (state === 'play') player.buffer = BUFFER;
  }

  function releaseHop() {
    if (state === 'play' && player && player.vy < 0 && player.holding) player.vy *= JUMP_CUT;
    if (player) player.holding = false;
  }

  function menuMove(dir) {
    if (state !== 'select') return;
    selIndex = clamp(selIndex + dir, 0, LEVELS.length - 1);
    sfxMenu();
  }

  window.addEventListener('keydown', (e) => {
    if (['Space', 'ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'KeyW', 'KeyA', 'KeyD'].includes(e.code)) e.preventDefault();
    if (e.repeat) return;
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') { if (player) player.holding = true; pressHop(); }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') menuMove(-1);
    if (e.code === 'ArrowRight' || e.code === 'KeyD') menuMove(1);
  });
  window.addEventListener('keyup', (e) => {
    keys[e.code] = false;
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') releaseHop();
  });

  function bindHold(el, prop, onPress) {
    const on = (e) => { e.preventDefault(); ensureAudio(); touch[prop] = true; if (onPress) onPress(); };
    const off = (e) => { if (e) e.preventDefault(); touch[prop] = false; if (prop === 'hop') releaseHop(); };
    el.addEventListener('pointerdown', on);
    el.addEventListener('pointerup', off);
    el.addEventListener('pointercancel', off);
    el.addEventListener('pointerleave', off);
  }
  const btnLeft = document.getElementById('btn-left');
  const btnRight = document.getElementById('btn-right');
  const btnHop = document.getElementById('btn-hop');
  bindHold(btnLeft, 'left', () => menuMove(-1));
  bindHold(btnRight, 'right', () => menuMove(1));
  bindHold(btnHop, 'hop', () => { if (player) player.holding = true; pressHop(); });

  // The whole page (minus links and the arrow buttons) is a hop button too.
  document.addEventListener('pointerdown', (e) => {
    if (e.target.closest && (e.target.closest('a') || e.target.closest('#touchpad'))) return;
    e.preventDefault();
    ensureAudio();
    if (player) player.holding = true;
    pressHop();
  });
  document.addEventListener('pointerup', releaseHop);
  document.addEventListener('pointercancel', releaseHop);

  const padReady = () => typeof Pad360 !== 'undefined';
  const moveInput = () => {
    const left = keys['ArrowLeft'] || keys['KeyA'] || touch.left || (padReady() && Pad360.dx() < 0);
    const right = keys['ArrowRight'] || keys['KeyD'] || touch.right || (padReady() && Pad360.dx() > 0);
    return (left ? -1 : 0) + (right ? 1 : 0);
  };
  const holdingHop = () => keys['Space'] || keys['ArrowUp'] || keys['KeyW'] || touch.hop ||
    (padReady() && (Pad360.down(Pad360.BTN.A) || Pad360.down(Pad360.BTN.START)));

  // Xbox 360 controller: D-pad/left stick moves and steps through the level
  // picker, A or Start hops/confirms.
  function pollGamepad() {
    Pad360.poll();
    const hop = Pad360.BTN.A, start = Pad360.BTN.START;
    if (Pad360.pressed(hop) || Pad360.pressed(start)) { if (player) player.holding = true; pressHop(); }
    if (Pad360.released(hop) || Pad360.released(start)) releaseHop();
    const dx = Pad360.dxPressed();
    if (dx) menuMove(dx);
  }

  // ---------- World helpers ----------
  function toyRect(t) {
    if (t.state === 'up' || (t.state === 'falling' && t.t < 0.22)) {
      return { x: t.x, y: t.baseY - t.standH, w: t.standW, h: t.standH, kind: 'block', style: 'toy' };
    }
    return { x: t.x, y: t.baseY - t.standW, w: t.standH, h: t.standW, kind: 'block', style: 'toy' };
  }

  function collisionSolids() {
    const out = lv.solids.slice();
    for (const p of lv.props) if (p.kind === 'toy') out.push(toyRect(p));
    return out;
  }

  function slopeSurfaceY(s, px) {
    const t = clamp((px - s.x) / s.w, 0, 1);
    return s.y1 + (s.y2 - s.y1) * t;
  }

  function inPit(px) {
    for (const p of lv.pits) if (px > p.x && px < p.x + p.w) return p;
    return null;
  }

  function spawnParticles(x, y, n, color, spread = 60) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y, vx: rand(-spread, spread), vy: rand(-spread, -10),
        life: rand(0.35, 0.7), max: 0.7, color, size: Math.random() < 0.4 ? 3 : 2,
      });
    }
  }

  function popup(x, y, text, color) {
    pops.push({ x, y, text, color, life: 0.9 });
  }

  // ---------- Rescue (nobody ever loses in this game) ----------
  function startRescue() {
    const kind = L.helper === 'all'
      ? ['fuzzy', 'buzzy', 'blackie', 'funny'][Math.floor(Math.random() * 4)]
      : L.helper;
    rescue = {
      kind, phase: 'drop', t: 0,
      fromX: player.x, fromY: player.y,
      toX: safeSpot.x, toY: safeSpot.y,
      bunnyX: player.x + PW / 2, bunnyY: -30,
    };
    player.vx = 0; player.vy = 0;
    sfxRescue();
  }

  function updateRescue(dt) {
    const r = rescue;
    r.t += dt;
    if (r.phase === 'drop') {
      const k = clamp(r.t / 0.45, 0, 1);
      r.bunnyX = player.x + PW / 2;
      r.bunnyY = -30 + k * (Math.min(player.y - 60, 120) + 30);
      if (k >= 1) { r.phase = 'lift'; r.t = 0; r.fromX = player.x; r.fromY = player.y; }
    } else if (r.phase === 'lift') {
      const k = clamp(r.t / 0.85, 0, 1);
      const e = k * k * (3 - 2 * k);
      player.x = r.fromX + (r.toX - r.fromX) * e;
      player.y = r.fromY + (r.toY - 24 - r.fromY) * e;
      r.bunnyX = player.x + PW / 2;
      r.bunnyY = Math.min(r.bunnyY, player.y - 46) + (r.toY - 70 - r.bunnyY) * Math.min(1, dt * 4);
      if (k >= 1) { r.phase = 'wave'; r.t = 0; }
    } else {
      r.bunnyY -= 90 * dt;
      if (r.t > 0.45) {
        player.x = r.toX; player.y = r.toY; player.vy = 0; player.vx = 0;
        rescue = null;
      }
    }
  }

  // ---------- Play update ----------
  function updatePlay(dt) {
    elapsed += dt;
    if (bannerT > 0) bannerT -= dt;

    if (rescue) { updateRescue(dt); updateFx(dt); updateCamera(dt); return; }

    const dir = moveInput();
    const accel = player.onGround ? GROUND_ACCEL : AIR_ACCEL;
    if (dir !== 0) {
      player.vx += dir * accel * dt;
      player.face = dir;
      const cap = player.onSlope ? SLIDE_MAX : MOVE_SPEED;
      player.vx = clamp(player.vx, -cap, cap);
    } else if (player.onGround && !player.onSlope) {
      const f = FRICTION * dt;
      player.vx = Math.abs(player.vx) <= f ? 0 : player.vx - Math.sign(player.vx) * f;
    }

    // jump with coyote time + input buffering, so little hands always connect
    player.coyote = player.onGround ? COYOTE : Math.max(0, player.coyote - dt);
    player.buffer = Math.max(0, player.buffer - dt);
    if (player.buffer > 0 && player.coyote > 0) {
      player.vy = JUMP_V;
      player.onGround = false;
      player.onSlope = null;
      player.coyote = 0;
      player.buffer = 0;
      player.holdT = 0;
      player.squash = -0.25;
      sfxHop();
      spawnParticles(player.x + PW / 2, player.y + PH, 4, '#ffffff', 40);
    }

    // holding the button keeps the hop floaty for a moment
    let g = GRAVITY;
    if (player.vy < 0 && holdingHop() && player.holdT < JUMP_HOLD_MAX) {
      g *= JUMP_HOLD_G;
      player.holdT += dt;
    }
    player.vy = Math.min(player.vy + g * dt, 620);

    const wasOnGround = player.onGround;
    const wasOnSlope = player.onSlope;
    player.onGround = false;
    player.onSlope = null;

    const solids = collisionSolids();

    // horizontal
    player.x += player.vx * dt;
    for (const s of solids) {
      // Skip wall collision entirely the frame after riding a cord slide: a
      // slope's surface dips a hair below the flat ground it meets, and that
      // sub-pixel overlap with the ground slab was getting read as hitting a
      // wall, snapping the player all the way back past it.
      if (s.kind === 'plat' || s.kind === 'slope' || wasOnSlope) continue;
      if (overlap(player, s)) {
        if (player.vx > 0) player.x = s.x - player.w;
        else if (player.vx < 0) player.x = s.x + s.w;
        player.vx = 0;
      }
    }
    player.x = clamp(player.x, 0, lv.len - PW);

    // vertical
    const prevBottom = player.y + player.h;
    player.y += player.vy * dt;
    for (const s of solids) {
      if (s.kind === 'slope' || wasOnSlope) continue;
      if (!overlap(player, s)) continue;
      if (s.kind === 'plat') {
        if (player.vy >= 0 && prevBottom <= s.y + 4) land(s);
      } else if (player.vy >= 0 && prevBottom <= s.y + 6) {
        land(s);
      } else if (player.vy < 0) {
        player.y = s.y + s.h;
        player.vy = 0;
      }
    }

    // cord slides
    for (const s of solids) {
      if (s.kind !== 'slope') continue;
      const cx = player.x + PW / 2;
      if (cx < s.x || cx > s.x + s.w) continue;
      const surf = slopeSurfaceY(s, cx);
      const bottom = player.y + PH;
      if (player.vy >= -20 && bottom > surf - 3 && bottom < surf + 26) {
        player.y = surf - PH;
        player.vy = 0;
        player.onGround = true;
        player.onSlope = s;
        const down = Math.sign(s.y2 - s.y1) || 1;
        player.vx = clamp(player.vx + down * SLIDE_ACCEL * dt, -SLIDE_MAX, SLIDE_MAX);
        if (Math.random() < 0.12) spawnParticles(cx, surf, 1, '#7cf6ff', 30);
        if (Math.random() < 0.03) sfxSlide();
      }
    }

    if (player.onGround && !wasOnGround) {
      player.squash = 0.3;
      sfxLand();
      spawnParticles(player.x + PW / 2, player.y + PH, 3, '#ffffff', 35);
    }

    // hop bob while running along the ground
    if (player.onGround && Math.abs(player.vx) > 10) player.hopT += dt * (6 + Math.abs(player.vx) / 26);
    else if (player.onGround) player.hopT = 0;

    if (player.squash > 0) player.squash = Math.max(0, player.squash - dt * 3);
    if (player.squash < 0) player.squash = Math.min(0, player.squash + dt * 3);
    if (player.bounceT > 0) player.bounceT -= dt;

    // remember the last safe patch of ground for rescues
    if (player.onGround && !inPit(player.x + PW / 2) && player.y < 260) {
      safeSpot = { x: player.x, y: player.y };
    }

    updateHelpers(dt);
    updateCarrots();
    updateFx(dt);
    updateCamera(dt);

    // falling is never fatal -- a bunny comes to get you
    const pit = inPit(player.x + PW / 2);
    const lavaTouch = pit && pit.style === 'lava' && player.y + PH > 244;
    if (player.y > FALL_Y || lavaTouch) {
      if (lavaTouch) spawnParticles(player.x + PW / 2, 244, 8, '#ffb347', 70);
      startRescue();
    }

    // reached the goal?
    if (player.x + PW / 2 >= lv.goalX + 6) finishLevel();
  }

  function overlap(p, s) {
    return p.x + p.w > s.x && p.x < s.x + s.w && p.y + p.h > s.y && p.y < s.y + s.h;
  }

  function land(s) {
    player.y = s.y - player.h;
    player.vy = 0;
    player.onGround = true;
  }

  function updateHelpers(dt) {
    for (const h of lv.helpers) {
      h.cheer += dt * 3;
      if (h.squash > 0) h.squash = Math.max(0, h.squash - dt * 3);
      if (h.laugh > 0) h.laugh -= dt;

      // Fuzzyball trampoline
      if (h.bouncer) {
        const hit = player.x + PW > h.x && player.x < h.x + h.w &&
                    player.y + PH > h.y - 4 && player.y + PH < h.y + h.h + 8 && player.vy >= 0;
        if (hit) {
          player.y = h.y - PH;
          player.vy = BOUNCE_V;
          player.onGround = false;
          player.coyote = 0;
          player.holdT = JUMP_HOLD_MAX;
          player.bounceT = 0.5;
          h.squash = 0.45;
          sfxBounce();
          spawnParticles(h.x + h.w / 2, h.y, 10, '#ffe14f', 90);
          popup(h.x + h.w / 2, h.y - 16, 'BOING!', '#ffe14f');
        }
      }

      // FunnyBunny laughs the tall toys over
      if (h.toy && h.toy.state === 'up' && Math.abs((player.x + PW / 2) - h.toy.x) < 120) {
        h.toy.state = 'falling';
        h.toy.t = 0;
        h.laugh = 1.4;
        sfxLaugh();
        popup(h.x + 10, h.y - 14, 'HA HA HA!', '#ffd08a');
      }
    }
    for (const p of lv.props) {
      if (p.kind === 'toy' && p.state === 'falling') {
        p.t += dt;
        if (p.t >= 0.5) {
          p.state = 'down';
          spawnParticles(p.x + p.standH / 2, p.baseY, 8, '#d9c9b0', 70);
        }
      }
    }
  }

  function updateCarrots() {
    const cx = player.x + PW / 2, cy = player.y + PH / 2;
    for (const c of lv.carrots) {
      if (c.got) continue;
      if (Math.abs(c.x - cx) < 17 && Math.abs(c.y - cy) < 19) {
        c.got = true;
        const def = CARROTS[c.type];
        score += def.points;
        carrotsGot++;
        sfxCarrot(c.type);
        popup(c.x, c.y - 8, '+' + def.points, def.light);
        spawnParticles(c.x, c.y, c.type === 'jewel' ? 12 : 6, def.light, c.type === 'jewel' ? 90 : 50);
      }
    }
  }

  function updateFx(dt) {
    for (const p of particles) {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 320 * dt;
    }
    particles = particles.filter((p) => p.life > 0);
    for (const p of pops) { p.life -= dt; p.y -= 26 * dt; }
    pops = pops.filter((p) => p.life > 0);
  }

  function updateCamera(dt) {
    const target = clamp(player.x + PW / 2 - W * 0.42, 0, Math.max(0, lv.len - W));
    cam.x += (target - cam.x) * Math.min(1, dt * 10);
  }

  function finishLevel() {
    lastLevelScore = score;
    const key = L.key;
    newBest = !save.best[key] || score > save.best[key];
    if (newBest) save.best[key] = score;
    if (levelIndex + 1 >= save.unlocked && levelIndex + 1 < LEVELS.length) save.unlocked = levelIndex + 2;
    if (levelIndex === LEVELS.length - 1) save.tablet = true;
    persist();
    spawnParticles(lv.goalX, lv.goalY - 40, 26, '#ffe14f', 130);
    if (levelIndex === LEVELS.length - 1) { state = 'victory'; sfxTablet(); }
    else { state = 'levelend'; sfxGoal(); }
  }

  // ---------- Drawing helpers ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function fillRR(x, y, w, h, r, color) { ctx.fillStyle = color; roundRect(x, y, w, h, r); ctx.fill(); }
  function circle(x, y, r, color) { ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }

  // One bunny drawing used for Snowbell and every helper, just recoloured.
  // (cx, feetY) is the middle of the feet; scale 1 is about 22px tall.
  function drawBunny(cx, feetY, colors, o = {}) {
    const face = o.face === undefined ? 1 : o.face;
    const sq = o.squash || 0;
    const scale = o.scale || 1;
    const earFlop = o.earFlop || 0;
    ctx.save();
    ctx.translate(cx, feetY);
    ctx.scale(scale * (1 + sq * 0.35) * face, scale * (1 - sq * 0.45));

    // tail
    circle(-9, -9, 4, '#ffffff');
    circle(-9, -9, 3, colors.fur === '#ffffff' ? '#eef2fa' : '#ffffff');

    // feet
    fillRR(-8, -6, 9, 6, 3, colors.shade);
    fillRR(1, -6, 9, 6, 3, colors.shade);

    // body
    fillRR(-8, -18, 16, 14, 7, colors.fur);
    fillRR(-5, -13, 11, 9, 5, colors.shade);

    // ears
    ctx.save();
    ctx.translate(3, -19);
    ctx.rotate(-0.15 + earFlop);
    fillRR(-2, -14, 5, 15, 2.5, colors.fur);
    fillRR(-1, -12, 3, 11, 1.5, colors.ear);
    ctx.restore();
    ctx.save();
    ctx.translate(7, -19);
    ctx.rotate(0.22 + earFlop * 1.4);
    fillRR(-2, -13, 5, 14, 2.5, colors.fur);
    fillRR(-1, -11, 3, 10, 1.5, colors.ear);
    ctx.restore();

    // head
    circle(5, -20, 7, colors.fur);
    circle(7, -18, 4.5, colors.shade === colors.fur ? colors.fur : colors.fur);
    // cheek
    ctx.globalAlpha = 0.5; circle(8, -17, 2.5, colors.ear); ctx.globalAlpha = 1;
    // eye
    circle(7.5, -21.5, 1.6, '#241d2b');
    circle(8, -22, 0.6, '#ffffff');
    // nose + mouth
    circle(11, -19, 1.4, colors.ear);
    ctx.strokeStyle = '#241d2b';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    if (o.smile) { ctx.arc(10.5, -18, 2.2, 0.1, Math.PI - 0.4); }
    else { ctx.moveTo(10, -17.6); ctx.lineTo(11.5, -17.6); }
    ctx.stroke();
    ctx.restore();
  }

  function drawCarrot(c) {
    const def = CARROTS[c.type];
    const bob = Math.sin(elapsed * 3 + c.bob) * 2.5;
    const spin = Math.sin(elapsed * 2 + c.bob) * 0.18;
    ctx.save();
    ctx.translate(c.x, c.y + bob);
    ctx.rotate(spin);

    // soft shine, fading out at the edge so it never looks like a dirty blob
    const gr = c.type === 'jewel' ? 17 : 13;
    const glow = ctx.createRadialGradient(0, 0, 1, 0, 0, gr);
    const a = 0.30 + 0.14 * Math.sin(elapsed * 5 + c.bob);
    glow.addColorStop(0, `rgba(${def.rgb},${a})`);
    glow.addColorStop(1, `rgba(${def.rgb},0)`);
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();

    // leafy top
    ctx.fillStyle = '#3f9e3c';
    ctx.beginPath(); ctx.moveTo(-1, -5); ctx.lineTo(-7, -13); ctx.lineTo(-1, -8); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -5); ctx.lineTo(7, -13); ctx.lineTo(1, -8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6fd45c';
    ctx.beginPath(); ctx.moveTo(-2, -5); ctx.lineTo(0, -15); ctx.lineTo(2, -5); ctx.closePath(); ctx.fill();

    // body: fat at the top, pointy at the bottom
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.moveTo(-5.5, -6);
    ctx.quadraticCurveTo(0, -9, 5.5, -6);
    ctx.lineTo(0, 11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = def.light;
    ctx.beginPath();
    ctx.moveTo(-3.5, -5); ctx.lineTo(-1.2, -5.5); ctx.lineTo(-1.6, 4);
    ctx.closePath(); ctx.fill();
    // ridges
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(-3.6, -3, 7, 1);
    ctx.fillRect(-2.6, 1, 5, 1);
    ctx.fillRect(-1.6, 5, 3, 1);
    // sparkle
    const tw = Math.sin(elapsed * 6 + c.bob);
    if (tw > 0.55) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1, -4, 2, 2);
      ctx.fillRect(-2, -3.4, 4, 0.8);
    }
    ctx.restore();
  }

  // ---------- Backgrounds ----------
  function drawSky() {
    const k = L.key;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (k === 'grass') { g.addColorStop(0, '#5fc8f5'); g.addColorStop(1, '#cdf1ff'); }
    else if (k === 'computer') { g.addColorStop(0, '#050d16'); g.addColorStop(1, '#0b2230'); }
    else if (k === 'lego') { g.addColorStop(0, '#4fa9ff'); g.addColorStop(1, '#bfe6ff'); }
    else if (k === 'house') { g.addColorStop(0, '#f3dcc0'); g.addColorStop(1, '#e6c8a4'); }
    else { g.addColorStop(0, '#2a0b12'); g.addColorStop(1, '#7a2410'); }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBackdrop() {
    const k = L.key;
    const p1 = -cam.x * 0.2, p2 = -cam.x * 0.45;
    if (k === 'grass') {
      circle(((400 + p1 * 0.2) % (W + 80) + W + 80) % (W + 80) - 40, 40, 18, '#fff6b0');
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 6; i++) {
        let cx = (((i * 170 + p1) % 1020) + 1020) % 1020 - 60;
        const cy = 28 + (i % 3) * 20;
        ctx.globalAlpha = 0.9;
        fillRR(cx, cy, 40, 12, 6, '#ffffff');
        fillRR(cx + 10, cy - 7, 24, 14, 7, '#ffffff');
        ctx.globalAlpha = 1;
      }
      // rolling hills
      ctx.fillStyle = '#76c46a';
      for (let i = 0; i < 8; i++) {
        const hx = (((i * 200 + p2) % 1600) + 1600) % 1600 - 200;
        ctx.beginPath(); ctx.arc(hx, 250, 110, Math.PI, 0); ctx.fill();
      }
      ctx.fillStyle = '#5fae56';
      for (let i = 0; i < 8; i++) {
        const hx = (((i * 170 + p2 * 1.5) % 1360) + 1360) % 1360 - 170;
        ctx.beginPath(); ctx.arc(hx, 268, 80, Math.PI, 0); ctx.fill();
      }
    } else if (k === 'computer') {
      ctx.strokeStyle = 'rgba(60, 220, 160, 0.25)';
      ctx.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        const x = (((i * 90 + p2) % 1260) + 1260) % 1260 - 90;
        ctx.beginPath();
        ctx.moveTo(x, 0); ctx.lineTo(x, 40 + (i % 4) * 30); ctx.lineTo(x + 60, 40 + (i % 4) * 30); ctx.lineTo(x + 60, H);
        ctx.stroke();
        ctx.fillStyle = (Math.floor(elapsed * 2 + i) % 3 === 0) ? '#ffe14f' : '#2f7a5f';
        ctx.fillRect(x - 2, 38 + (i % 4) * 30, 5, 5);
      }
      ctx.fillStyle = 'rgba(20, 60, 50, 0.55)';
      for (let i = 0; i < 6; i++) {
        const x = (((i * 260 + p1) % 1560) + 1560) % 1560 - 260;
        ctx.fillRect(x, 120, 120, 70);
        ctx.fillStyle = 'rgba(120, 250, 200, 0.18)';
        ctx.fillRect(x + 10, 130, 100, 12);
        ctx.fillStyle = 'rgba(20, 60, 50, 0.55)';
      }
    } else if (k === 'lego') {
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < 5; i++) {
        let cx = (((i * 200 + p1) % 1000) + 1000) % 1000 - 60;
        const cy = 26 + (i % 2) * 22;
        fillRR(cx, cy, 46, 13, 6, '#ffffff');
        fillRR(cx + 12, cy - 7, 26, 14, 7, '#ffffff');
      }
      // a big lego wall in the distance
      const cols = ['#d94f4f', '#4f8fd9', '#ffd23f', '#5fc24f'];
      for (let i = 0; i < 14; i++) {
        const x = (((i * 96 + p2) % 1344) + 1344) % 1344 - 96;
        for (let r = 0; r < 3; r++) {
          const c = cols[(i + r) % cols.length];
          ctx.globalAlpha = 0.26;
          fillRR(x, 150 + r * 34, 92, 32, 3, c);
          ctx.fillStyle = c;
          ctx.fillRect(x + 14, 144 + r * 34, 18, 8);
          ctx.fillRect(x + 58, 144 + r * 34, 18, 8);
          ctx.globalAlpha = 1;
        }
      }
    } else if (k === 'house') {
      // striped wallpaper + picture frames + baseboard
      for (let i = 0; i < 26; i++) {
        const x = (((i * 40 + p2) % 1040) + 1040) % 1040 - 40;
        ctx.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(180,120,80,0.10)';
        ctx.fillRect(x, 0, 20, 210);
      }
      for (let i = 0; i < 5; i++) {
        const x = (((i * 260 + p1) % 1300) + 1300) % 1300 - 130;
        fillRR(x, 40, 70, 54, 3, '#8a5a34');
        fillRR(x + 5, 45, 60, 44, 2, '#cfe6f5');
        circle(x + 24, 62, 7, '#ffe36a');
        ctx.fillStyle = '#7ec46a';
        ctx.beginPath(); ctx.moveTo(x + 10, 89); ctx.lineTo(x + 30, 60); ctx.lineTo(x + 50, 89); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#a9724a';
      ctx.fillRect(0, 196, W, 16);
      ctx.fillStyle = '#8a5a34';
      ctx.fillRect(0, 194, W, 4);
    } else {
      // volcano cones + ash
      ctx.fillStyle = '#3b1410';
      for (let i = 0; i < 5; i++) {
        const x = (((i * 240 + p2) % 1200) + 1200) % 1200 - 240;
        ctx.beginPath();
        ctx.moveTo(x - 90, 250); ctx.lineTo(x, 70); ctx.lineTo(x + 90, 250);
        ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#ff7a2b';
        ctx.beginPath();
        ctx.moveTo(x - 16, 92); ctx.lineTo(x, 70); ctx.lineTo(x + 16, 92);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(elapsed * 3 + i);
        circle(x, 66, 10, '#ffb347');
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#3b1410';
      }
      ctx.fillStyle = 'rgba(255, 140, 60, 0.25)';
      for (let i = 0; i < 22; i++) {
        const t = elapsed * 18 + i * 37;
        const x = (((i * 61 + p1 - t * 0.3) % 1220) + 1220) % 1220 - 60;
        const y = (((i * 43 - t) % 260) + 260) % 260;
        ctx.fillRect(x, y, 2, 2);
      }
    }
  }

  // ---------- World geometry ----------
  // The inside of a hole: darker as it goes down, with shaded walls so the gap
  // reads as depth instead of a flat black box.
  function depths(p, top, bottom) {
    const g = ctx.createLinearGradient(0, 210, 0, H);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    ctx.fillStyle = g;
    ctx.fillRect(p.x, 210, p.w, H - 210);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(p.x, 210, 4, H - 210);
    ctx.fillRect(p.x + p.w - 4, 210, 4, H - 210);
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(p.x, 210, p.w, 5);
  }

  function drawPits() {
    for (const p of lv.pits) {
      if (p.x + p.w < cam.x - 40 || p.x > cam.x + W + 40) continue;
      if (p.style === 'lava') {
        depths(p, '#2b1a18', '#140a09');
        const g = ctx.createLinearGradient(0, 240, 0, H);
        g.addColorStop(0, '#ffdf6a'); g.addColorStop(0.25, '#ff7a2b'); g.addColorStop(1, '#b62c0c');
        ctx.fillStyle = g;
        ctx.fillRect(p.x, 244, p.w, H - 244);
        ctx.fillStyle = '#ffe6a0';
        for (let x = p.x; x < p.x + p.w; x += 9) {
          const wob = Math.sin(elapsed * 4 + x * 0.2) * 2;
          ctx.fillRect(x, 242 + wob, 5, 3);
        }
        if (Math.random() < 0.09) {
          particles.push({ x: rand(p.x, p.x + p.w), y: 244, vx: rand(-12, 12), vy: rand(-70, -30), life: 0.7, max: 0.7, color: '#ffb347', size: 2 });
        }
      } else if (p.style === 'circuit') {
        depths(p, '#0a1a20', '#02060a');
        ctx.strokeStyle = 'rgba(60,220,160,0.3)';
        ctx.lineWidth = 1;
        for (let x = p.x + 8; x < p.x + p.w - 4; x += 14) {
          ctx.beginPath(); ctx.moveTo(x, 214); ctx.lineTo(x, H); ctx.stroke();
        }
      } else if (p.style === 'lego') {
        depths(p, '#27406e', '#101c33');
      } else if (p.style === 'house') {
        depths(p, '#3d2a1e', '#160e0a');
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        for (let y = 222; y < H; y += 13) ctx.fillRect(p.x + 3, y, p.w - 6, 4);
      } else {
        depths(p, '#4a3520', '#1d1309');
        // roots and grass dangling over the edge
        ctx.fillStyle = '#5fc24f';
        ctx.fillRect(p.x - 3, 208, 5, 6);
        ctx.fillRect(p.x + p.w - 2, 208, 5, 6);
      }
    }
  }

  function drawGroundSlab(s) {
    const k = L.key;
    if (k === 'grass') {
      ctx.fillStyle = '#a97b46';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#8a6236';
      for (let x = s.x; x < s.x + s.w; x += 16) ctx.fillRect(x + 4, s.y + 16, 8, 5);
      ctx.fillStyle = '#5fc24f';
      ctx.fillRect(s.x, s.y, s.w, 8);
      ctx.fillStyle = '#8ce07c';
      for (let x = s.x; x < s.x + s.w; x += 7) ctx.fillRect(x, s.y - 3, 3, 4);
      // flowers
      for (let x = s.x + 30; x < s.x + s.w - 20; x += 120) {
        circle(x, s.y - 7, 2.5, '#ffffff'); circle(x, s.y - 7, 1.2, '#ffe14f');
      }
    } else if (k === 'computer') {
      ctx.fillStyle = '#123a2e';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#1c5c47';
      ctx.fillRect(s.x, s.y, s.w, 6);
      ctx.fillStyle = '#ffd23f';
      for (let x = s.x + 6; x < s.x + s.w - 4; x += 18) ctx.fillRect(x, s.y + 10, 10, 3);
      ctx.strokeStyle = 'rgba(120,250,200,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(s.x, s.y + 20); ctx.lineTo(s.x + s.w, s.y + 20); ctx.stroke();
    } else if (k === 'lego') {
      ctx.fillStyle = '#4f9e3f';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#3f8032';
      ctx.fillRect(s.x, s.y + 10, s.w, s.h - 10);
      ctx.fillStyle = '#5fc24f';
      for (let x = s.x + 4; x < s.x + s.w - 6; x += 16) fillRR(x, s.y - 4, 10, 6, 2, '#5fc24f');
      ctx.fillStyle = '#4f9e3f';
      ctx.fillRect(s.x, s.y, s.w, 4);
    } else if (k === 'house') {
      ctx.fillStyle = '#c98f62';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#b87d52';
      for (let x = s.x; x < s.x + s.w; x += 10) ctx.fillRect(x, s.y + 6, 5, 3);
      ctx.fillStyle = '#e0a97c';
      ctx.fillRect(s.x, s.y, s.w, 5);
    } else {
      ctx.fillStyle = '#2b1a18';
      ctx.fillRect(s.x, s.y, s.w, s.h);
      ctx.fillStyle = '#432824';
      ctx.fillRect(s.x, s.y, s.w, 7);
      ctx.fillStyle = '#ff7a2b';
      for (let x = s.x + 10; x < s.x + s.w - 8; x += 34) {
        ctx.globalAlpha = 0.5 + 0.4 * Math.sin(elapsed * 3 + x);
        ctx.fillRect(x, s.y + 12, 14, 3);
        ctx.globalAlpha = 1;
      }
    }
  }

  function drawPlatform(s) {
    const k = L.key;
    if (k === 'grass') {
      fillRR(s.x, s.y, s.w, s.h, 3, '#8a6236');
      ctx.fillStyle = '#5fc24f'; ctx.fillRect(s.x, s.y, s.w, 4);
      ctx.fillStyle = '#8ce07c';
      for (let x = s.x + 2; x < s.x + s.w; x += 8) ctx.fillRect(x, s.y - 2, 3, 3);
    } else if (k === 'computer') {
      fillRR(s.x, s.y, s.w, s.h, 2, '#1b1b22');
      ctx.fillStyle = '#ffd23f';
      for (let x = s.x + 3; x < s.x + s.w - 2; x += 7) ctx.fillRect(x, s.y + s.h, 3, 3);
      ctx.fillStyle = (Math.floor(elapsed * 3) % 2) ? '#4ff0ff' : '#2b6f7a';
      ctx.fillRect(s.x + 4, s.y + 3, 4, 3);
    } else if (k === 'lego') {
      const cols = ['#d94f4f', '#4f8fd9', '#ffd23f'];
      const c = cols[Math.floor(s.x / 97) % cols.length];
      fillRR(s.x, s.y, s.w, s.h, 2, c);
      ctx.fillStyle = c;
      for (let x = s.x + 6; x < s.x + s.w - 8; x += 20) fillRR(x, s.y - 4, 12, 6, 2, c);
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(s.x, s.y, s.w, 2);
    } else if (k === 'house') {
      fillRR(s.x, s.y, s.w, s.h, 3, '#8a5a34');
      ctx.fillStyle = '#a9724a'; ctx.fillRect(s.x, s.y, s.w, 3);
      ctx.fillStyle = '#6d4426';
      for (let x = s.x + 8; x < s.x + s.w; x += 16) ctx.fillRect(x, s.y + 5, 6, 2);
    } else {
      fillRR(s.x, s.y, s.w, s.h, 3, '#432824');
      ctx.fillStyle = '#5a352f'; ctx.fillRect(s.x, s.y, s.w, 3);
      ctx.fillStyle = 'rgba(255,122,43,0.5)';
      ctx.fillRect(s.x + 4, s.y + s.h - 2, s.w - 8, 2);
    }
  }

  function drawBlock(s) {
    const style = s.style || 'rock';
    if (style === 'cord') {
      // a fat computer cable arching out of the floor
      const cols = ['#ff5f8f', '#4ff0ff', '#ffd23f', '#8cff9d'];
      const c = cols[Math.floor(s.x / 53) % cols.length];
      ctx.strokeStyle = c;
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(s.x + 2, s.y + s.h + 4);
      ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 10, s.x + s.w - 2, s.y + s.h + 4);
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath();
      ctx.moveTo(s.x + 4, s.y + s.h + 2);
      ctx.quadraticCurveTo(s.x + s.w / 2, s.y - 6, s.x + s.w - 4, s.y + s.h + 2);
      ctx.stroke();
      ctx.lineCap = 'butt';
    } else if (style === 'chip') {
      fillRR(s.x, s.y, s.w, s.h, 2, '#1b1b22');
      ctx.fillStyle = '#ffd23f';
      for (let y = s.y + 4; y < s.y + s.h - 2; y += 7) { ctx.fillRect(s.x - 3, y, 3, 3); ctx.fillRect(s.x + s.w, y, 3, 3); }
      ctx.fillStyle = '#4ff0ff';
      ctx.fillRect(s.x + 5, s.y + 5, s.w - 10, 4);
      ctx.fillStyle = '#2b6f7a';
      ctx.fillRect(s.x + 5, s.y + 12, s.w - 10, 3);
    } else if (style === 'lego') {
      const cols = ['#d94f4f', '#4f8fd9', '#ffd23f', '#5fc24f', '#ff8f3f'];
      const c = cols[Math.floor(s.x / 71) % cols.length];
      const rows = Math.max(1, Math.round(s.h / 16));
      const rh = s.h / rows;
      for (let r = 0; r < rows; r++) {
        const y = s.y + r * rh;
        fillRR(s.x, y, s.w, rh - 1, 2, c);
        ctx.fillStyle = 'rgba(255,255,255,0.22)';
        ctx.fillRect(s.x, y, s.w, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fillRect(s.x, y + rh - 3, s.w, 2);
        for (let x = s.x + 4; x < s.x + s.w - 7; x += 16) fillRR(x, y - 4, 11, 6, 2, c);
      }
    } else if (style === 'couch') {
      fillRR(s.x, s.y, s.w, s.h, 6, '#4f6fbf');
      fillRR(s.x + 6, s.y + 6, s.w - 12, s.h - 6, 5, '#6b8ada');
      fillRR(s.x + 2, s.y - 4, 16, 16, 5, '#4f6fbf');
      fillRR(s.x + s.w - 18, s.y - 4, 16, 16, 5, '#4f6fbf');
      ctx.fillStyle = '#3d579c';
      ctx.fillRect(s.x + 10, s.y + s.h - 6, s.w - 20, 3);
      circle(s.x + s.w / 2, s.y + 14, 6, '#ffd23f');
    } else if (style === 'ball') {
      circle(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, '#e64f6f');
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(s.x + s.w / 2, s.y + s.h / 2, s.w / 2, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      circle(s.x + s.w / 2 - 4, s.y + s.h / 2 - 5, 2, 'rgba(255,255,255,0.8)');
    } else if (style === 'blocks') {
      const cols = ['#e0b84f', '#4f9ed9', '#e05f8f'];
      for (let i = 0; i < 2; i++) {
        const c = cols[(Math.floor(s.x / 37) + i) % cols.length];
        fillRR(s.x + i * 2, s.y + i * (s.h / 2), s.w - i * 4, s.h / 2 - 1, 2, c);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(s.x + i * 2, s.y + i * (s.h / 2), s.w - i * 4, 2);
      }
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText('A', s.x + s.w / 2 - 3, s.y + 11);
    } else if (style === 'toy') {
      // teddy-ish tall toy, drawn either standing or toppled
      const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
      ctx.save();
      ctx.translate(cx, cy);
      fillRR(-s.w / 2, -s.h / 2, s.w, s.h, 8, '#c98a5a');
      fillRR(-s.w / 2 + 4, -s.h / 2 + 6, s.w - 8, s.h - 12, 6, '#e0a97c');
      circle(-s.w / 2 + 5, -s.h / 2 + 5, 4, '#c98a5a');
      circle(s.w / 2 - 5, -s.h / 2 + 5, 4, '#c98a5a');
      circle(-3, -s.h / 2 + 10, 1.5, '#3b2a1e');
      circle(3, -s.h / 2 + 10, 1.5, '#3b2a1e');
      ctx.restore();
    } else {
      // rock / boulder
      const dark = L.key === 'volcano' ? '#3a2320' : '#7a6a5a';
      const light = L.key === 'volcano' ? '#5a352f' : '#9d8b78';
      fillRR(s.x, s.y, s.w, s.h, 4, dark);
      ctx.fillStyle = light;
      ctx.fillRect(s.x + 3, s.y + 3, s.w - 6, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(s.x + 4, s.y + s.h - 6, s.w - 8, 3);
      if (L.key === 'volcano') {
        ctx.fillStyle = 'rgba(255,122,43,0.6)';
        ctx.fillRect(s.x + 5, s.y + 8, 4, 2);
      }
    }
  }

  function drawSlope(s) {
    ctx.strokeStyle = '#ff5f8f';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(s.x, s.y1 + 4);
    ctx.lineTo(s.x + s.w, s.y2 + 4);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y1 + 2);
    ctx.lineTo(s.x + s.w, s.y2 + 2);
    ctx.stroke();
    ctx.lineCap = 'butt';
    // plugs at each end
    fillRR(s.x - 6, s.y1 - 3, 12, 12, 2, '#ffd23f');
    fillRR(s.x + s.w - 6, s.y2 - 3, 12, 12, 2, '#ffd23f');
  }

  function drawSolids() {
    for (const s of lv.solids) {
      if (s.x + s.w < cam.x - 60 || s.x > cam.x + W + 60) continue;
      if (s.kind === 'ground') drawGroundSlab(s);
      else if (s.kind === 'plat') drawPlatform(s);
      else if (s.kind === 'slope') drawSlope(s);
      else drawBlock(s);
    }
    for (const p of lv.props) {
      if (p.kind !== 'toy') continue;
      const r = toyRect(p);
      if (p.state === 'falling') {
        const k = clamp(p.t / 0.5, 0, 1);
        ctx.save();
        ctx.translate(p.x, p.baseY);
        ctx.rotate(k * Math.PI / 2);
        drawBlock({ x: 0, y: -p.standH, w: p.standW, h: p.standH, style: 'toy' });
        ctx.restore();
      } else {
        drawBlock(r);
      }
    }
  }

  function drawGoal() {
    const gx = lv.goalX, gy = lv.goalY;
    if (L.key === 'volcano') {
      // the golden tablet on a stone pedestal
      fillRR(gx - 26, gy - 18, 52, 18, 3, '#432824');
      fillRR(gx - 20, gy - 24, 40, 8, 2, '#5a352f');
      const glow = 0.35 + 0.25 * Math.sin(elapsed * 3);
      ctx.globalAlpha = glow;
      circle(gx, gy - 48, 32, '#ffe14f');
      ctx.globalAlpha = 1;
      ctx.save();
      ctx.translate(gx, gy - 48 + Math.sin(elapsed * 2) * 3);
      fillRR(-16, -22, 32, 44, 4, '#ffc233');
      fillRR(-12, -18, 24, 36, 3, '#ffe9a0');
      ctx.fillStyle = '#c8901f';
      for (let i = 0; i < 4; i++) ctx.fillRect(-8, -12 + i * 8, 16, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-9, -16, 4, 4);
      ctx.restore();
    } else {
      // carrot flag on a pole over Snowbell's burrow
      ctx.fillStyle = '#8a6236';
      ctx.fillRect(gx - 2, gy - 74, 4, 74);
      ctx.fillStyle = '#ff8f3f';
      const wave = Math.sin(elapsed * 4) * 3;
      ctx.beginPath();
      ctx.moveTo(gx + 2, gy - 74);
      ctx.lineTo(gx + 40 + wave, gy - 62);
      ctx.lineTo(gx + 2, gy - 50);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd6a8';
      ctx.fillRect(gx + 8, gy - 65, 12, 3);
      circle(gx, gy - 78, 5, '#ffd23f');
      ctx.globalAlpha = 0.25 + 0.15 * Math.sin(elapsed * 4);
      circle(gx, gy - 62, 26, '#ffe14f');
      ctx.globalAlpha = 1;
    }
  }

  function drawHelpers() {
    for (const h of lv.helpers) {
      if (h.x + 40 < cam.x - 40 || h.x - 40 > cam.x + W + 40) continue;
      const colors = BUNNIES[h.kind];
      const bob = Math.sin(h.cheer) * 2;
      if (h.bouncer) {
        // Fuzzyball crouches as a springy trampoline
        const sq = 0.35 + h.squash;
        ctx.save();
        ctx.translate(h.x + h.w / 2, h.y + h.h);
        ctx.scale(1 + sq * 0.4, 1 - sq * 0.35);
        ctx.translate(-(h.x + h.w / 2), -(h.y + h.h));
        drawBunny(h.x + h.w / 2, h.y + h.h, colors, { face: 1, squash: 0.3, smile: true, earFlop: Math.sin(elapsed * 6) * 0.2 });
        ctx.restore();
        // little bounce arrows
        ctx.globalAlpha = 0.5 + 0.3 * Math.sin(elapsed * 5);
        ctx.fillStyle = '#ffe14f';
        ctx.beginPath();
        ctx.moveTo(h.x + h.w / 2, h.y - 16); ctx.lineTo(h.x + h.w / 2 - 5, h.y - 8); ctx.lineTo(h.x + h.w / 2 + 5, h.y - 8);
        ctx.closePath(); ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const laughing = h.laugh > 0;
        drawBunny(h.x + h.w / 2, h.y + h.h + (laughing ? Math.abs(Math.sin(elapsed * 18)) * -3 : bob * 0.5), colors, {
          face: (player && player.x > h.x) ? -1 : 1,
          squash: laughing ? Math.sin(elapsed * 18) * 0.18 : 0,
          smile: true,
          earFlop: Math.sin(h.cheer) * 0.18,
        });
        if (laughing) {
          ctx.fillStyle = '#ffe14f';
          ctx.font = 'bold 9px monospace';
          ctx.fillText('HA!', h.x + 20, h.y - 6 - Math.sin(elapsed * 8) * 3);
        }
      }
      // name tag
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.font = '7px monospace';
      ctx.textAlign = 'center';
      ctx.fillText(colors.name, h.x + h.w / 2, h.y + h.h + 10);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(colors.name, h.x + h.w / 2, h.y + h.h + 9);
      ctx.textAlign = 'left';
    }
  }

  function drawPlayer() {
    const bob = player.onGround && Math.abs(player.vx) > 10 ? -Math.abs(Math.sin(player.hopT)) * 5 : 0;
    const air = !player.onGround;
    const squash = player.squash + (air ? clamp(-player.vy / 1400, -0.2, 0.12) : 0);
    drawBunny(player.x + PW / 2, player.y + PH + bob, BUNNIES.snowbell, {
      face: player.face,
      squash: -squash,
      smile: true,
      earFlop: air ? -0.35 : Math.sin(player.hopT) * 0.3,
    });
    if (player.bounceT > 0) {
      ctx.globalAlpha = player.bounceT;
      ctx.strokeStyle = '#ffe14f';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(player.x + PW / 2, player.y + PH, 18 * (1.4 - player.bounceT), 0.2, Math.PI - 0.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  function drawRescue() {
    if (!rescue) return;
    const colors = BUNNIES[rescue.kind];
    // the string
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rescue.bunnyX, rescue.bunnyY + 4);
    ctx.lineTo(player.x + PW / 2, player.y + 2);
    ctx.stroke();
    drawBunny(rescue.bunnyX, rescue.bunnyY, colors, { face: 1, smile: true, earFlop: -0.3, scale: 0.95 });
    ctx.textAlign = 'center';
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.fillText('I GOT YOU!', rescue.bunnyX, rescue.bunnyY - 34);
    ctx.textAlign = 'left';
  }

  function drawFx() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life / p.max, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x, p.y, p.size, p.size);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'center';
    for (const p of pops) {
      ctx.globalAlpha = clamp(p.life / 0.9, 0, 1);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillText(p.text, p.x + 1, p.y + 1);
      ctx.fillStyle = p.color;
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    ctx.textAlign = 'left';
  }

  // ---------- HUD + screens ----------
  function drawCarrotIcon(x, y, type, s = 1) {
    const def = CARROTS[type];
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.fillStyle = '#3f9e3c';
    ctx.beginPath(); ctx.moveTo(-1, -4); ctx.lineTo(-5, -10); ctx.lineTo(-1, -6); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(1, -4); ctx.lineTo(5, -10); ctx.lineTo(1, -6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6fd45c';
    ctx.beginPath(); ctx.moveTo(-1.5, -4); ctx.lineTo(0, -11); ctx.lineTo(1.5, -4); ctx.closePath(); ctx.fill();
    ctx.fillStyle = def.body;
    ctx.beginPath();
    ctx.moveTo(-4, -5); ctx.quadraticCurveTo(0, -7, 4, -5); ctx.lineTo(0, 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = def.light;
    ctx.beginPath(); ctx.moveTo(-2.6, -4); ctx.lineTo(-1, -4.4); ctx.lineTo(-1.2, 3); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  function panel(x, y, w, h, alpha = 0.55) {
    ctx.fillStyle = `rgba(10, 6, 24, ${alpha})`;
    roundRect(x, y, w, h, 6); ctx.fill();
    ctx.strokeStyle = 'rgba(255,225,79,0.6)';
    ctx.lineWidth = 1;
    roundRect(x + 0.5, y + 0.5, w - 1, h - 1, 6); ctx.stroke();
  }

  function drawHUD() {
    // score
    panel(8, 8, 96, 20, 0.45);
    drawCarrotIcon(20, 18, 'gold');
    ctx.fillStyle = '#ffe14f';
    ctx.font = 'bold 12px monospace';
    ctx.fillText(String(score), 32, 22);

    // carrots collected
    ctx.textAlign = 'right';
    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('CARROTS ' + carrotsGot + '/' + L.totalCarrots, W - 10, 17);
    const best = save.best[L.key] || 0;
    ctx.fillStyle = '#4ff0ff';
    ctx.fillText('BEST ' + best, W - 10, 28);
    ctx.textAlign = 'left';

    // progress to the flag
    const px = 150, pw = 170;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(px, 12, pw, 7, 3.5); ctx.fill();
    const prog = clamp((player.x) / Math.max(1, lv.goalX), 0, 1);
    ctx.fillStyle = '#8ce07c';
    roundRect(px, 12, Math.max(4, pw * prog), 7, 3.5); ctx.fill();
    ctx.fillStyle = '#ffffff';
    circle(px + pw * prog, 15.5, 3, '#ffffff');
    drawCarrotIcon(px + pw + 9, 15, 'bronze', 0.8);

    ctx.textAlign = 'center';
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(L.name, W / 2, 32);
    ctx.textAlign = 'left';

    if (bannerT > 0) {
      const a = clamp(bannerT * 1.4, 0, 1);
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(10,6,24,0.55)';
      ctx.fillRect(0, 96, W, 50);
      ctx.font = 'bold 18px monospace';
      ctx.fillStyle = '#ffe14f';
      ctx.shadowColor = '#ff9d3f'; ctx.shadowBlur = 8;
      ctx.fillText('LAND ' + (levelIndex + 1) + ': ' + L.name, W / 2, 120);
      ctx.shadowBlur = 0;
      ctx.font = '10px monospace';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(L.blurb, W / 2, 136);
      ctx.textAlign = 'left';
      ctx.globalAlpha = 1;
    }
  }

  function drawTitle() {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(10,6,24,0.35)';
    ctx.fillRect(0, 0, W, H);

    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#9fd8ff'; ctx.shadowBlur = 10;
    ctx.fillText('SNOWBELL', W / 2, 58);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ffe9a0';
    ctx.shadowColor = '#ff7a2b';
    ctx.fillText('THE QUEST FOR THE', W / 2, 74);
    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#ffc233';
    ctx.fillText('GOLDEN TABLET', W / 2, 90);
    ctx.shadowBlur = 0;

    // Snowbell hopping across the title screen with carrots
    const hop = Math.abs(Math.sin(elapsed * 3.4));
    drawBunny(W / 2 - 60, 176 - hop * 26, BUNNIES.snowbell, { face: 1, smile: true, scale: 1.5, earFlop: -hop * 0.4, squash: -hop * 0.2 });
    const types = ['bronze', 'silver', 'gold', 'jewel'];
    types.forEach((t, i) => {
      drawCarrotIcon(W / 2 + 10 + i * 30, 150 + Math.sin(elapsed * 3 + i) * 4, t, 1.5);
      ctx.font = '7px monospace';
      ctx.fillStyle = CARROTS[t].light;
      ctx.fillText('+' + CARROTS[t].points, W / 2 + 10 + i * 30, 176);
    });

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(elapsed * 5);
    ctx.fillText('PRESS SPACE / TAP TO START', W / 2, 212);
    ctx.globalAlpha = 1;
    ctx.font = '8px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('A MICKLEKIDS GAME', W / 2, 230);
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('NO BAD GUYS  *  NOBODY EVER LOSES', W / 2, 243);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawSelect() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.45)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 16px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ff7a2b'; ctx.shadowBlur = 8;
    ctx.fillText('PICK A LAND', W / 2, 30);
    ctx.shadowBlur = 0;

    const cw = 84, gap = 8;
    const totalW = LEVELS.length * cw + (LEVELS.length - 1) * gap;
    const x0 = (W - totalW) / 2;
    LEVELS.forEach((lev, i) => {
      const x = x0 + i * (cw + gap);
      const sel = i === selIndex;
      const locked = i >= save.unlocked;
      const y = 48 + (sel ? -4 : 0);
      ctx.fillStyle = locked ? 'rgba(30,24,50,0.85)' : sel ? 'rgba(60,40,110,0.95)' : 'rgba(28,20,60,0.85)';
      roundRect(x, y, cw, 108, 6); ctx.fill();
      ctx.strokeStyle = locked ? '#5a5470' : sel ? '#ffe14f' : '#4ff0ff';
      ctx.lineWidth = sel ? 2 : 1;
      roundRect(x + 0.5, y + 0.5, cw - 1, 107, 6); ctx.stroke();

      // mini scene
      ctx.save();
      ctx.beginPath(); roundRect(x + 6, y + 6, cw - 12, 42, 4); ctx.clip();
      const pal = {
        grass: ['#5fc8f5', '#5fc24f'], computer: ['#0b2230', '#1c5c47'],
        lego: ['#4fa9ff', '#4f9e3f'], house: ['#e6c8a4', '#c98f62'], volcano: ['#7a2410', '#2b1a18'],
      }[lev.key];
      ctx.fillStyle = pal[0]; ctx.fillRect(x + 6, y + 6, cw - 12, 42);
      ctx.fillStyle = pal[1]; ctx.fillRect(x + 6, y + 34, cw - 12, 14);
      if (!locked) drawBunny(x + cw / 2 - 12, y + 36, BUNNIES.snowbell, { face: 1, smile: true, scale: 0.75 });
      drawCarrotIcon(x + cw / 2 + 14, y + 26, i === 4 ? 'jewel' : 'gold', 0.9);
      ctx.restore();

      ctx.font = 'bold 8px monospace';
      ctx.fillStyle = locked ? '#7a7490' : '#ffe14f';
      ctx.fillText('LAND ' + (i + 1), x + cw / 2, y + 62);
      ctx.font = '7px monospace';
      ctx.fillStyle = locked ? '#7a7490' : '#ffffff';
      wrapText(lev.name, x + cw / 2, y + 74, cw - 10, 9);
      if (locked) {
        ctx.fillStyle = '#b9b0e0';
        ctx.font = '7px monospace';
        ctx.fillText('FINISH LAND ' + i, x + cw / 2, y + 98);
        ctx.fillStyle = '#ffe14f';
        fillRR(x + cw / 2 - 5, y + 84, 10, 8, 2, '#8a84a0');
      } else {
        ctx.fillStyle = '#4ff0ff';
        ctx.font = '7px monospace';
        ctx.fillText('BEST ' + (save.best[lev.key] || 0), x + cw / 2, y + 98);
      }
    });

    ctx.font = '9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('LEFT / RIGHT TO PICK  --  HOP TO PLAY', W / 2, 176);
    if (save.tablet) {
      ctx.fillStyle = '#ffc233';
      ctx.font = 'bold 10px monospace';
      ctx.fillText('★ YOU HAVE THE GOLDEN TABLET! ★', W / 2, 196);
    }
    ctx.font = '8px monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText('SNOWBELL HOPS: ARROWS / A D    HOP: SPACE', W / 2, 218);
    ctx.fillText('IF YOU FALL, A BUNNY FRIEND PULLS YOU BACK UP!', W / 2, 232);
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function wrapText(text, cx, y, maxW, lh) {
    const words = text.split(' ');
    let line = '', yy = y;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, cx, yy); line = w; yy += lh; }
      else line = test;
    }
    if (line) ctx.fillText(line, cx, yy);
  }

  function drawLevelEnd() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = 'bold 20px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ff7a2b'; ctx.shadowBlur = 8;
    ctx.fillText('LAND COMPLETE!', W / 2, 54);
    ctx.shadowBlur = 0;

    ctx.font = '11px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(L.name, W / 2, 76);
    ctx.font = '12px monospace';
    ctx.fillText('CARROTS: ' + carrotsGot + ' / ' + L.totalCarrots, W / 2, 102);
    ctx.fillStyle = '#ffc233';
    ctx.font = 'bold 15px monospace';
    ctx.fillText('SCORE: ' + lastLevelScore, W / 2, 124);
    ctx.font = '10px monospace';
    ctx.fillStyle = newBest ? '#8ce07c' : '#4ff0ff';
    ctx.fillText(newBest ? 'NEW BEST SCORE!' : 'BEST: ' + (save.best[L.key] || 0), W / 2, 142);

    if (carrotsGot === L.totalCarrots) {
      ctx.fillStyle = '#ff9dc0';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('★ EVERY CARROT FOUND! ★', W / 2, 160);
    }
    if (levelIndex + 1 < LEVELS.length && save.unlocked > levelIndex + 1) {
      ctx.fillStyle = '#8ce07c';
      ctx.font = 'bold 11px monospace';
      ctx.fillText('UNLOCKED: ' + LEVELS[levelIndex + 1].name, W / 2, 180);
    }

    const cheerHop = Math.abs(Math.sin(elapsed * 4));
    drawBunny(62, 252 - cheerHop * 8, BUNNIES.snowbell, { face: 1, smile: true, scale: 1.3, earFlop: -cheerHop * 0.35 });
    drawBunny(W - 62, 252 - cheerHop * 8, BUNNIES[L.helper === 'all' ? 'fuzzy' : L.helper], { face: -1, smile: true, scale: 1.3, earFlop: -cheerHop * 0.35 });

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(elapsed * 5);
    ctx.fillText('PRESS SPACE / TAP TO GO ON', W / 2, 206);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.textAlign = 'left';
  }

  function drawVictory() {
    ctx.save();
    ctx.fillStyle = 'rgba(10,6,24,0.76)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';

    // sunburst behind the tablet
    ctx.save();
    ctx.translate(W / 2, 96);
    ctx.rotate(elapsed * 0.4);
    ctx.fillStyle = 'rgba(255, 225, 79, 0.18)';
    for (let i = 0; i < 12; i++) {
      ctx.rotate(Math.PI / 6);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-14, -140); ctx.lineTo(14, -140); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    ctx.font = 'bold 17px monospace';
    ctx.fillStyle = '#ffe14f';
    ctx.shadowColor = '#ff7a2b'; ctx.shadowBlur = 10;
    ctx.fillText('SNOWBELL GOT THE', W / 2, 34);
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = '#ffc233';
    ctx.fillText('GOLDEN TABLET!', W / 2, 58);
    ctx.shadowBlur = 0;

    ctx.save();
    ctx.translate(W / 2, 108 + Math.sin(elapsed * 2) * 4);
    fillRR(-20, -28, 40, 56, 5, '#ffc233');
    fillRR(-15, -23, 30, 46, 4, '#ffe9a0');
    ctx.fillStyle = '#c8901f';
    for (let i = 0; i < 5; i++) ctx.fillRect(-10, -16 + i * 9, 20, 2);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-11, -21, 5, 5);
    ctx.restore();

    // all five bunnies cheering
    const crew = ['fuzzy', 'buzzy', 'snowbell', 'blackie', 'funny'];
    crew.forEach((k, i) => {
      const x = W / 2 + (i - 2) * 60;
      const hop = Math.abs(Math.sin(elapsed * 4 + i * 0.7));
      drawBunny(x, 206 - hop * 10, BUNNIES[k], { face: i < 2 ? 1 : -1, smile: true, scale: 1.15, earFlop: -hop * 0.35, squash: -hop * 0.15 });
    });

    const total = LEVELS.reduce((s, lev) => s + (save.best[lev.key] || 0), 0);
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('FINAL SCORE: ' + lastLevelScore + '   TOTAL BEST: ' + total, W / 2, 232);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#4ff0ff';
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(elapsed * 5);
    ctx.fillText('PRESS SPACE / TAP FOR THE LAND PICKER', W / 2, 252);
    ctx.globalAlpha = 1;
    ctx.restore();
    ctx.textAlign = 'left';
  }

  // ---------- Render ----------
  function render() {
    if (state === 'title') { L = LEVELS[0]; lv = L.lv; }
    if (state === 'select') { L = LEVELS[selIndex]; lv = L.lv; }

    drawSky();
    drawBackdrop();

    if (state === 'play' || state === 'levelend' || state === 'victory') {
      ctx.save();
      ctx.translate(-Math.round(cam.x), 0);
      drawPits();
      drawSolids();
      drawGoal();
      for (const c of lv.carrots) {
        if (c.got) continue;
        if (c.x < cam.x - 30 || c.x > cam.x + W + 30) continue;
        drawCarrot(c);
      }
      drawHelpers();
      drawPlayer();
      drawRescue();
      drawFx();
      ctx.restore();
    } else {
      // menu scenery: a strip of ground so the screens are not floating in space
      ctx.save();
      ctx.translate(0, 0);
      drawGroundSlab({ x: 0, y: 252, w: W, h: 26 });
      ctx.restore();
    }

    if (state === 'play') drawHUD();
    else if (state === 'title') drawTitle();
    else if (state === 'select') drawSelect();
    else if (state === 'levelend') drawLevelEnd();
    else if (state === 'victory') drawVictory();
  }

  // ---------- Loop ----------
  let lastT = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - lastT) / 1000);
    lastT = t;
    if (typeof Pad360 !== 'undefined') pollGamepad();
    if (state === 'play') updatePlay(dt);
    else { elapsed += dt; updateFx(dt); }
    render();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
