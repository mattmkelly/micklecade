// Marble Rumble -- build a 3D marble run out of snap-together pieces, then race your
// marble down it against three computer marbles. You steer the marble (it keeps its
// momentum), hop with jump, and get past spinners, sliding gates, bumpers and hammers --
// or ride a boost pad round a loop-de-loop and over a jump. STORY MODE is a run of made-up
// levels that get a little harder each time and unlock new marbles; BUILD YOUR OWN is the
// track builder.
// A MICKLEKIDS GAME. Drawn with three.js (shared/three.min.js); the HUD is a 2D canvas on top.
(() => {
  const view = document.getElementById('view');
  const hud = document.getElementById('hud');
  const hintEl = document.getElementById('hint');
  const stage = document.getElementById('stage');

  const W = 480, H = 270;
  // HUD draws in 480x270 coordinates; HiRes keeps it sharp.
  const hctx = HiRes.setup(hud, W, H, (c) => { c.textBaseline = 'middle'; });

  // ---------- Track sizes (world units) ----------
  const S = 8;            // one grid cell
  const HW = 3;           // half the floor's width
  const WALL = 1.2;       // side wall height (taller than a jump, so you can't hop off)
  const LH = 3;           // height of one level; a ramp climbs or drops one level
  const R = 0.4;          // marble radius
  const START_LEVEL = 6;
  const MAX_LEVEL = 12;
  const MAX_PIECES = 60;
  const GRID_LIMIT = 25;  // cells from the start in any direction
  const GROUND_Y = -2.5;

  // ---------- Marble physics ----------
  const GRAVITY = 22;
  const ACCEL = 13;       // how hard you can push the marble while it touches the track
  const AIR_CONTROL = 0.35;
  const PUSH_MAX = 10;    // you can't push faster than this -- gravity can, downhill
  const MAX_SPEED = 26;   // boost pads need the head room
  const ROLL_DRAG = 0.25;
  const JUMP_V = 7;
  const COYOTE = 0.12;
  const STEP = 1 / 120;

  const SAVE_KEY = 'marbleRumble.save';

  const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]];

  // turn: +1 bends toward the right, -1 toward the left. dl: levels climbed (+) or dropped (-).
  const PIECES = {
    start:    { name: 'START',      color: 0x3ddc84 },
    finish:   { name: 'FINISH',     color: 0xffffff },
    straight: { name: 'STRAIGHT',   color: 0x4fa8ff, star: true, tip: 'A nice straight run.' },
    left:     { name: 'LEFT TURN',  color: 0x6b8cff, star: true, turn: -1, tip: 'Curve to the left.' },
    right:    { name: 'RIGHT TURN', color: 0x6b8cff, star: true, turn: 1, tip: 'Curve to the right.' },
    down:     { name: 'RAMP DOWN',  color: 0x4fd1c5, star: true, dl: -1, tip: 'Downhill -- go faster!' },
    up:       { name: 'RAMP UP',    color: 0xf6ad55, star: true, dl: 1, tip: 'Uphill -- keep rolling!' },
    spinner:  { name: 'SPINNER',    color: 0xb794f4, tip: 'A spinning bar sweeps the track. Jump it!' },
    gates:    { name: 'GATES',      color: 0xf687b3, tip: 'Sliding walls. Roll through the gap!' },
    bumpers:  { name: 'BUMPERS',    color: 0xfc8181, tip: 'Boing! Bumpers bounce you around.' },
    hammer:   { name: 'HAMMER',     color: 0xf6e05e, tip: 'A swinging hammer. Time it right!' },
    boost:    { name: 'BOOST',      color: 0x63e6be, star: true, tip: 'Zoom! A speed pad shoots you forward.' },
    // len: grid spaces it fills in a row. tall: extra levels of head room it needs.
    loop:     { name: 'LOOP-DE-LOOP', color: 0xff9f43, star: true, len: 3, tall: 1,
                tip: 'A boost pad, then all the way round!' },
    jump:     { name: 'BOOST JUMP', color: 0x48dbfb, star: true, len: 3, dl: -1,
                tip: 'Launch pad, fly the gap, land one level down!' },
    spiral:   { name: 'SPIRAL', color: 0xa3e635, star: true, len: 2, dl: -1,
                tip: 'Round and round and down a level!' },
    tube:     { name: 'TUBE DROP', color: 0x94a3b8, star: true, len: 2, dl: -2,
                tip: 'A see-through pipe that drops two levels. Whoosh!' },
    trampoline: { name: 'TRAMPOLINE', color: 0xe879f9, star: true, len: 3, dl: 1,
                tip: 'BOING! Bounce over the gap, up a level!' },
    portal:   { name: 'PORTAL', color: 0x8b5cf6,
                tip: 'Add two! Roll into one, pop out of the next one.' },
    ice:      { name: 'ICE', color: 0xd8f3ff, star: true, ice: true,
                tip: 'Slippery! You can hardly steer on ice.' },
    corkscrew: { name: 'CORKSCREW', color: 0x65a30d, star: true, len: 2, dl: -2, turns: 2,
                tip: 'Twice round the post and down two levels!' },
    halfpipe: { name: 'HALF-PIPE', color: 0x38bdf8, star: true, len: 2,
                tip: 'Swoop up the sides! Grab the high star.' },
    conveyor: { name: 'CONVEYOR', color: 0xfbbf24, star: true, dl: 1,
                tip: 'A moving belt carries you up a level.' },
    flippers: { name: 'FLIPPERS', color: 0xf43f5e,
                tip: 'Pinball flippers! Time it and they whack you forward.' },
    fan:      { name: 'FAN', color: 0x67e8f9,
                tip: 'Whoosh! The wind blows you sideways. Steer against it!' },
    seesaw:   { name: 'SEESAW', color: 0xd97706,
                tip: 'Roll past the middle and it tips you down.' },
    tiles:    { name: 'FALLING TILES', color: 0x818cf8, star: true, len: 2,
                tip: 'Keep rolling! Tiles drop right after you cross them.' },
    plank:    { name: 'NARROW PLANK', color: 0xb7791f, star: true, len: 2,
                tip: 'A skinny bridge with no walls. Steady now!' },
    fork:     { name: 'FORK', color: 0x2dd4bf, star: true, len: 3,
                tip: 'Pick a path! Safe and bumpy, or a skinny shortcut with a boost.' },
    cannon:   { name: 'CANNON', color: 0x64748b, star: true, len: 4, tall: 1,
                tip: 'Roll in and... BOOM! Fly across to the landing deck.' },
  };
  // the builder shows two rows of cards: track pieces, then obstacles
  const TRACK_ROW = ['straight', 'left', 'right', 'down', 'up', 'boost', 'conveyor', 'loop', 'jump',
    'spiral', 'corkscrew', 'tube', 'halfpipe', 'trampoline', 'portal', 'ice', 'fork'];
  const OBSTACLE_ROW = ['spinner', 'gates', 'bumpers', 'hammer', 'flippers', 'fan', 'seesaw', 'tiles', 'plank', 'cannon'];
  const PALETTE = TRACK_ROW.concat(OBSTACLE_ROW);
  const DEFAULT_TRACK = ['straight', 'down', 'spinner', 'right', 'boost', 'loop', 'left', 'down',
    'gates', 'right', 'jump', 'bumpers', 'left', 'hammer', 'down', 'straight'];
  // the middle two sit a little off centre, so a marble rolling straight in glances off
  const BUMPERS = [[0.35, -2.4], [-2.2, 0.2], [2.2, 0.2], [-0.35, 2.8]];

  const RACERS = [
    { name: 'YOU',       color: '#ff6b2c', stripe: '#ffe14f' },
    { name: 'ZIPPY',     color: '#2f8cff', stripe: '#bfe3ff', speed: 9.6, accel: 1.0 },
    { name: 'PICKLE',    color: '#3ccf4e', stripe: '#e6ffb0', speed: 8.8, accel: 0.95 },
    { name: 'GRAPE',     color: '#9b5cff', stripe: '#f0d0ff', speed: 8.0, accel: 0.9 },
  ];
  const PLACE_POINTS = [1000, 600, 400, 250];

  // Marbles you can roll as. The first two are free; finishing story levels unlocks the rest.
  // `dot` is the colour used for your marble on the progress bar.
  const MARBLES = [
    { id: 'classic', name: 'CLASSIC', color: '#ff6b2c', stripe: '#ffe14f', dot: '#ff6b2c' },
    { id: 'cherry',  name: 'CHERRY',  color: '#e8253f', stripe: '#ffd0d8', dot: '#e8253f' },
    { id: 'pink',    name: 'PINK',    color: '#ff6fc8', stripe: '#ffe0f4', dot: '#ff6fc8', unlock: 2 },
    { id: 'yellow',  name: 'SUNNY',   color: '#ffd60a', stripe: '#fff6c0', dot: '#ffd60a', unlock: 4 },
    { id: 'rainbow', name: 'RAINBOW', kind: 'rainbow', dot: '#ff4fd8', unlock: 6 },
    { id: 'shinyred', name: 'SHINY RED', kind: 'shiny', dot: '#ff2a3a', unlock: 8 },
    { id: 'lava',    name: 'LAVA',    kind: 'lava',    dot: '#ff5a1f', unlock: 10 },
    { id: 'galaxy',  name: 'GALAXY',  kind: 'galaxy',  dot: '#7a6bff', unlock: 11 },
    { id: 'gold',    name: 'GOLD',    kind: 'gold',    dot: '#ffd23f', unlock: 12 },
  ];

  // Story levels. Each one brings in one new piece (its `feature`), is a little longer, and
  // the computer marbles get a little quicker -- slowly, so it never stops being fun.
  const LEVELS = [
    { name: 'FIRST ROLL',     len: 6,  ai: 0.72 },
    { name: 'BOUNCY HILLS',   len: 7,  ai: 0.75, feature: 'bumpers' },
    { name: 'ZOOM ZONE',      len: 8,  ai: 0.78, feature: 'boost' },
    { name: 'SPIN CITY',      len: 9,  ai: 0.80, feature: 'spinner' },
    { name: 'GATE CRASHERS',  len: 10, ai: 0.83, feature: 'gates' },
    { name: 'LOOPY LAND',     len: 11, ai: 0.85, feature: 'loop' },
    { name: 'HAMMER TIME',    len: 12, ai: 0.87, feature: 'hammer' },
    { name: 'SKY JUMPERS',    len: 13, ai: 0.90, feature: 'jump' },
    { name: 'UP AND OVER',    len: 14, ai: 0.92, feature: 'up' },
    { name: 'TWISTY TOWERS',  len: 15, ai: 0.94 },
    { name: 'MARBLE MADNESS', len: 17, ai: 0.97 },
    { name: 'CHAMPION RUN',   len: 19, ai: 1.00 },
    { name: 'SLIPPY SLIDE',   len: 15, ai: 1.00, feature: 'ice' },
    { name: 'TUBE TOWN',      len: 16, ai: 1.00, feature: 'tube' },
    { name: 'SPIRAL SKY',     len: 16, ai: 1.00, feature: 'spiral' },
    { name: 'BOING BOING',    len: 17, ai: 1.00, feature: 'trampoline' },
    { name: 'PORTAL PARTY',   len: 18, ai: 1.00, feature: 'portal' },
    { name: 'CORKSCREW CANYON', len: 16, ai: 1.00, feature: 'corkscrew' },
    { name: 'HALF-PIPE HEROES', len: 16, ai: 1.00, feature: 'halfpipe' },
    { name: 'CONVEYOR CLIMB', len: 17, ai: 1.00, feature: 'conveyor' },
    { name: 'FLIPPER FRENZY', len: 17, ai: 1.00, feature: 'flippers' },
    { name: 'WINDY WAY',      len: 17, ai: 1.00, feature: 'fan' },
    { name: 'SEESAW SUMMIT',  len: 18, ai: 1.00, feature: 'seesaw' },
    { name: 'TIGHTROPE TRAIL', len: 18, ai: 1.00, feature: 'plank' },
    { name: 'TUMBLE TILES',   len: 19, ai: 1.00, feature: 'tiles' },
    { name: 'FORK IN THE ROAD', len: 18, ai: 1.00, feature: 'fork' },
    { name: 'CANNON CRAZY',   len: 19, ai: 1.00, feature: 'cannon' },
  ];
  LEVELS.reduce((have, L) => {
    L.pieces = L.feature ? have.concat(L.feature) : have;
    return L.pieces;
  }, ['straight', 'left', 'right', 'down']);
  const MEDALS = [
    { name: 'GOLD', color: '#ffd23f' }, { name: 'SILVER', color: '#d8def0' },
    { name: 'BRONZE', color: '#e09050' }, { name: 'FINISHED', color: '#9fd8ff' },
  ];

  // ---------- Save ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && Array.isArray(s.track)) {
        return { track: s.track.filter((t) => PALETTE.includes(t)), best: s.best || {}, marble: s.marble || 'classic',
          name: s.name || '', story: s.story || { done: 0, medals: {} }, world: s.world || 'park' };
      }
    } catch (e) {}
    return { track: DEFAULT_TRACK.slice(), best: {}, marble: 'classic', name: '', story: { done: 0, medals: {} }, world: 'park' };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  const save = loadSave();

  // ---------- Sound ----------
  let audioCtx = null;
  function unlockAudio() {
    if (audioCtx) { if (audioCtx.state === 'suspended') audioCtx.resume(); return; }
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
  }
  function beep(freq, duration, type = 'square', vol = 0.12, delay = 0) {
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
  function sweep(f1, f2, duration, type = 'square', vol = 0.1, delay = 0) {
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
  const sfxPlace  = () => { beep(520, 0.07, 'square', 0.09); beep(780, 0.09, 'square', 0.08, 0.06); };
  const sfxUndo   = () => sweep(500, 220, 0.14, 'triangle', 0.12);
  const sfxNope   = () => beep(160, 0.15, 'triangle', 0.12);
  const sfxSelect = () => beep(660, 0.04, 'square', 0.05);
  const sfxJump   = () => sweep(300, 600, 0.12, 'triangle', 0.1);
  const sfxStar   = () => { beep(988, 0.07, 'square', 0.07); beep(1319, 0.12, 'square', 0.07, 0.06); };
  const sfxBoing  = () => sweep(220, 660, 0.18, 'square', 0.08);
  const sfxBonk   = () => sweep(180, 90, 0.16, 'triangle', 0.14);
  const sfxBoost  = () => sweep(220, 1200, 0.35, 'sawtooth', 0.06);
  const sfxPoof   = () => sweep(700, 200, 0.25, 'triangle', 0.1);
  const sfxCount  = (go) => beep(go ? 880 : 440, go ? 0.35 : 0.15, 'square', 0.1);
  const sfxFinish = () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'square', 0.09, i * 0.11));

  // ---------- three.js setup ----------
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8fd8ff);
  scene.fog = new THREE.Fog(0x8fd8ff, 90, 260);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 900);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x5a7a3a, 1.7);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -40; sun.shadow.camera.right = 40;
  sun.shadow.camera.top = 40; sun.shadow.camera.bottom = -40;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 160;
  sun.shadow.bias = -0.0008;
  scene.add(sun);
  scene.add(sun.target);

  function canvasTexture(w, h, draw) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // Grass with a soft checker, so you can feel the height of the run.
  const groundTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#6cc04a'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#62b442'; g.fillRect(0, 0, 32, 32); g.fillRect(32, 32, 32, 32);
  });
  const repeatTex = (tex, n, nearest) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(n, n);
    if (nearest) tex.magFilter = THREE.NearestFilter;
    return tex;
  };
  repeatTex(groundTex, 150, true);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const checkerTex = canvasTexture(64, 16, (g) => {
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) {
      g.fillStyle = (i + j) % 2 ? '#111' : '#fff';
      g.fillRect(i * 4, j * 4, 4, 4);
    }
  });
  checkerTex.magFilter = THREE.NearestFilter;

  // chevrons for boost pads; the texture scrolls so they look like they're rushing forward
  const boostTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#0fbf8f'; g.fillRect(0, 0, 64, 64);
    g.strokeStyle = '#eafff7'; g.lineWidth = 9; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(10, 46); g.lineTo(32, 22); g.lineTo(54, 46); g.stroke();
  });
  boostTex.wrapS = boostTex.wrapT = THREE.RepeatWrapping;
  boostTex.repeat.set(2, 2);

  // conveyor belt: dark rubber with yellow arrows, scrolling up the ramp
  const beltTex = canvasTexture(64, 64, (g) => {
    g.fillStyle = '#2e2e38'; g.fillRect(0, 0, 64, 64);
    g.fillStyle = '#3c3c48'; for (let i = 0; i < 8; i++) g.fillRect(0, i * 8, 64, 3);
    g.strokeStyle = '#ffcc33'; g.lineWidth = 6; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(16, 44); g.lineTo(32, 26); g.lineTo(48, 44); g.stroke();
  });
  beltTex.wrapS = beltTex.wrapT = THREE.RepeatWrapping;
  beltTex.repeat.set(2, 3);

  const MAT = {
    wall: new THREE.MeshStandardMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.3,
      roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    rail: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4, side: THREE.DoubleSide }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x9aa7c0, roughness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff4a4a, roughness: 0.4 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3f58, roughness: 0.6, side: THREE.DoubleSide }),
    boost: new THREE.MeshBasicMaterial({ map: boostTex, transparent: true, opacity: 0.9 }),
    star: new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x996600, roughness: 0.3, metalness: 0.3 }),
    checker: new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.6 }),
    ghostOk: new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false }),
  };
  Object.assign(MAT, {
    blocks: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }),
    belt: new THREE.MeshBasicMaterial({ map: beltTex }),
    seesaw: new THREE.MeshStandardMaterial({ color: 0xc8843a, roughness: 0.7 }),
    cannon: new THREE.MeshStandardMaterial({ color: 0x3b4252, roughness: 0.35, metalness: 0.6 }),
    wheel: new THREE.MeshStandardMaterial({ color: 0x7a4a24, roughness: 0.8 }),
    tileA: new THREE.MeshStandardMaterial({ color: 0x818cf8, roughness: 0.5 }),
    tileB: new THREE.MeshStandardMaterial({ color: 0xa5b4fc, roughness: 0.5 }),
    wind: new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    // the tube is always see-through, whatever the world's walls are made of
    glass: new THREE.MeshStandardMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.28,
      roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    tramp: new THREE.MeshStandardMaterial({ color: 0x23232e, roughness: 0.9 }),
    black: new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }),
    cactus: new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8 }),
    duck: new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.35 }),
    beak: new THREE.MeshStandardMaterial({ color: 0xff8a00, roughness: 0.4 }),
    column: new THREE.MeshStandardMaterial({ color: 0x9aa7c0, roughness: 0.5 }),
  });
  const PLANET_MATS = [0xff8a3d, 0x6fc3ff, 0xc89bff, 0x7dff9a].map((c) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.25 }));

  // ---------- World pictures (track floors, grounds, skies) ----------
  // Track floors get UVs: u runs across the floor, v along it (one tile every 6 units).
  const TEX = {
    // wooden planks laid across the track
    plank: repeatTex(canvasTexture(64, 64, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#e2b07a', '#d6a26c', '#e8ba86', '#d09a62'][i]; g.fillRect(0, i * 16, 64, 16);
        g.fillStyle = 'rgba(120,70,30,0.25)';
        for (let k = 0; k < 3; k++) g.fillRect((i * 23 + k * 19) % 64, i * 16 + 4 + k * 4, 18, 1);
        g.fillStyle = '#7a4a22'; g.fillRect(0, i * 16 + 15, 64, 1);
        g.fillStyle = '#5a3416'; g.fillRect(5, i * 16 + 7, 2, 2); g.fillRect(57, i * 16 + 7, 2, 2);
      }
    }), 1),
    // a toy car track: light so the orange tint shows, with two lane grooves
    toyTrack: repeatTex(canvasTexture(64, 64, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#e6e6e6'; g.fillRect(17, 0, 6, 64); g.fillRect(41, 0, 6, 64);
      g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 3, 64); g.fillRect(61, 0, 3, 64);
    }), 1),
    // metal panels for space; the glow map lights the seams in the piece's colour
    panel: repeatTex(canvasTexture(64, 64, (g) => {
      g.fillStyle = '#c8cde0'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#aab0c8'; g.fillRect(4, 4, 26, 26); g.fillRect(34, 34, 26, 26);
      g.fillStyle = '#ffffff'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
    }), 1),
    panelGlow: repeatTex(canvasTexture(64, 64, (g) => {
      g.fillStyle = '#000000'; g.fillRect(0, 0, 64, 64);
      g.fillStyle = '#ffffff'; g.fillRect(0, 31, 64, 2); g.fillRect(31, 0, 2, 64);
      g.fillRect(2, 0, 1, 64); g.fillRect(61, 0, 1, 64);
    }), 1),
    ice: repeatTex(canvasTexture(64, 64, (g) => {
      g.fillStyle = '#dff6ff'; g.fillRect(0, 0, 64, 64);
      g.strokeStyle = 'rgba(255,255,255,0.95)'; g.lineWidth = 1.5;
      for (const [x0, y0, x1, y1] of [[4, 10, 30, 22], [30, 22, 40, 50], [30, 22, 60, 16], [10, 40, 26, 60], [44, 4, 52, 28]]) {
        g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
      }
      g.fillStyle = 'rgba(140,200,255,0.35)';
      for (let i = 0; i < 6; i++) g.fillRect((i * 29) % 60, (i * 17) % 60, 10, 3);
    }), 1),
    portal: (() => {
      const t = canvasTexture(128, 128, (g) => {
        const gr = g.createRadialGradient(64, 64, 4, 64, 64, 64);
        gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#bbbbbb'); gr.addColorStop(1, '#666666');
        g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
        g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 5;
        for (let arm = 0; arm < 4; arm++) {
          g.beginPath();
          for (let k = 0; k <= 40; k++) {
            const r = k * 1.6, ang = arm * Math.PI / 2 + k * 0.12;
            const x = 64 + Math.cos(ang) * r, y = 64 + Math.sin(ang) * r;
            if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
          }
          g.stroke();
        }
      });
      t.center.set(0.5, 0.5);
      return t;
    })(),
  };
  const GROUND_TEX = {
    grass: groundTex,
    sand: repeatTex(canvasTexture(64, 64, (g) => {
      g.fillStyle = '#ecd2a4'; g.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 90; i++) {
        g.fillStyle = i % 3 ? 'rgba(170,120,60,0.25)' : 'rgba(255,240,200,0.4)';
        g.fillRect((i * 37) % 64, (i * 53 + (i >> 3)) % 64, 2, 2);
      }
    }), 150),
    moon: repeatTex(canvasTexture(256, 256, (g) => {
      g.fillStyle = '#8d8d99'; g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = i % 2 ? 'rgba(60,60,75,0.18)' : 'rgba(200,200,215,0.18)';
        g.fillRect((i * 71) % 256, (i * 113) % 256, 3, 3);
      }
      for (const [x, y, r] of [[50, 60, 26], [170, 40, 16], [200, 170, 34], [80, 190, 18], [130, 120, 10], [30, 140, 8]]) {
        g.fillStyle = 'rgba(55,55,70,0.45)'; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(210,210,225,0.55)'; g.lineWidth = 3; g.beginPath(); g.arc(x + 1, y + 1, r, Math.PI * 0.8, Math.PI * 1.9); g.stroke();
      }
    }), 25),
    // giant floorboards -- the marbles are tiny toys on a bedroom floor
    woodfloor: repeatTex(canvasTexture(64, 64, (g) => {
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ['#c98d55', '#bf8248', '#d29860', '#c4874e'][i]; g.fillRect(i * 16, 0, 16, 64);
        g.fillStyle = '#8a5a30'; g.fillRect(i * 16 + 15, 0, 1, 64);
        g.fillRect(i * 16, (i * 23) % 64, 16, 1);
      }
    }), 30),
  };
  const westSky = canvasTexture(2, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#5a3d8a'); gr.addColorStop(0.45, '#e8708a'); gr.addColorStop(0.75, '#ffb46a'); gr.addColorStop(1, '#ffe0a0');
    g.fillStyle = gr; g.fillRect(0, 0, 2, 256);
  });

  const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t);

  // Worlds dress the same track up as somewhere else. `gravity` scales how hard marbles fall
  // (space is floatier); jumps and launch pads scale with it so they still land in the same spot.
  const WORLDS = [
    { id: 'park', name: 'PARK', sky: 0x8fd8ff, fog: [0x8fd8ff, 90, 260], hemi: [0xffffff, 0x5a7a3a, 1.7],
      sun: [0xffffff, 2.2], ground: 'grass', wall: [0xcff6ff, 0.3], rail: 0xffffff, pillar: [0x9aa7c0, 0.22],
      obs: [0xff4a4a, 0xffd23f, 0xffffff, 0x3a3f58], ui: '#7ee08a',
      floor: (c) => ({ color: c }) },
    { id: 'west', name: 'WILD WEST', sky: 'west', fog: [0xf3a86c, 170, 620], hemi: [0xfff0dc, 0x9a7a5a, 1.5],
      sun: [0xffe0b8, 2.4], ground: 'sand', wall: [0x9a6a3a, 1], rail: 0x6b4423, pillar: [0x7a4f2a, 0.32],
      obs: [0xc0562a, 0xe8a33c, 0xf3e2c0, 0x5a3a20], ui: '#ffb46a',
      floor: (c) => ({ map: TEX.plank, color: mixHex(c, 0xffffff, 0.65), roughness: 0.85 }) },
    { id: 'toys', name: "KID'S ROOM", sky: 0xfff1d6, fog: [0xfff1d6, 380, 900], hemi: [0xfff6e8, 0x8a6a4a, 1.6],
      sun: [0xfff0d0, 2.0], ground: 'woodfloor', wall: [0xfff7a0, 0.35], rail: 0xff3b3b, pillar: 'blocks',
      obs: [0xff3030, 0xffd000, 0xffffff, 0x2f6bff], ui: '#ff9fbf',
      floor: (c) => ({ map: TEX.toyTrack, color: mixHex(c, 0xff7a10, 0.65), roughness: 0.35 }) },
    { id: 'space', name: 'OUTER SPACE', sky: 0x05040f, fog: [0x05040f, 300, 900], hemi: [0x9fa8ff, 0x302040, 1.1],
      sun: [0xffffff, 2.6], ground: 'moon', gravity: 0.7, wall: [0x5ff3ff, 0.22, 0x1890b0], rail: 0x5ff3ff,
      railGlow: true, pillar: [0x8890b0, 0.2], obs: [0xff3df0, 0x7dfcff, 0xe8ecff, 0x2a2d45], obsGlow: true, ui: '#c8a8ff',
      floor: (c) => ({ map: TEX.panel, color: mixHex(c, 0x9098b8, 0.55), emissive: c, emissiveMap: TEX.panelGlow,
        emissiveIntensity: 0.9, roughness: 0.45, metalness: 0.35 }) },
  ];
  // story levels go round the worlds
  const LEVEL_WORLDS = ['park', 'west', 'toys', 'space'];
  LEVELS.forEach((L, i) => { L.world = LEVEL_WORLDS[i % LEVEL_WORLDS.length]; });
  const worldById = (id) => WORLDS.find((w) => w.id === id) || WORLDS[0];
  let world = null;
  let gravScale = 1;

  const floorMats = {};
  function floorMat(type) {
    const key = world.id + ':' + type;
    if (!floorMats[key]) {
      const opts = PIECES[type].ice
        ? { map: TEX.ice, color: 0xffffff, roughness: 0.06, metalness: 0.15 }
        : world.floor(PIECES[type].color);
      floorMats[key] = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.55, side: THREE.DoubleSide }, opts));
    }
    return floorMats[key];
  }

  // Swap the sky, ground, lights and shared materials over to another world.
  function setWorld(id) {
    const w = worldById(id);
    if (w === world) return;
    world = w;
    gravScale = w.gravity || 1;
    scene.background = w.sky === 'west' ? westSky : new THREE.Color(w.sky);
    scene.fog.color.setHex(w.fog[0]); scene.fog.near = w.fog[1]; scene.fog.far = w.fog[2];
    hemi.color.setHex(w.hemi[0]); hemi.groundColor.setHex(w.hemi[1]); hemi.intensity = w.hemi[2];
    sun.color.setHex(w.sun[0]); sun.intensity = w.sun[1];
    ground.material.map = GROUND_TEX[w.ground];
    ground.material.needsUpdate = true;
    const wall = MAT.wall, solid = w.wall[1] >= 1;
    wall.color.setHex(w.wall[0]); wall.opacity = w.wall[1];
    wall.transparent = !solid; wall.depthWrite = solid; wall.roughness = solid ? 0.8 : 0.1;
    wall.emissive.setHex(w.wall[2] || 0);
    wall.needsUpdate = true;
    MAT.rail.color.setHex(w.rail);
    MAT.rail.emissive.setHex(w.railGlow ? w.rail : 0);
    MAT.rail.emissiveIntensity = 0.7;
    MAT.pillar.color.setHex(w.pillar === 'blocks' ? 0x9aa7c0 : w.pillar[0]);
    MAT.pillar.metalness = w.id === 'space' ? 0.6 : 0;
    MAT.column.color.setHex(w.pillar === 'blocks' ? 0x4d9bff : w.pillar[0]);
    ['red', 'yellow', 'white', 'dark'].forEach((k, i) => {
      MAT[k].color.setHex(w.obs[i]);
      MAT[k].emissive.setHex(w.obsGlow && i < 2 ? w.obs[i] : 0);
      MAT[k].emissiveIntensity = 0.45;
    });
    buildDecor();
  }

  const GEO = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cyl: new THREE.CylinderGeometry(1, 1, 1, 20),
    marble: new THREE.SphereGeometry(R, 28, 18),
    star: (() => {
      const shape = new THREE.Shape();
      for (let i = 0; i < 10; i++) {
        const ang = Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? 0.14 : 0.32;
        if (i === 0) shape.moveTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
        else shape.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad);
      }
      const g = new THREE.ExtrudeGeometry(shape, { depth: 0.1, bevelEnabled: false });
      g.translate(0, 0, -0.05);
      return g;
    })(),
    sphere: new THREE.SphereGeometry(1, 20, 14),
    torus: new THREE.TorusGeometry(1, 0.06, 8, 32),
    arch: new THREE.TorusGeometry(1, 0.1, 10, 32, Math.PI),
    halfDisc: new THREE.CircleGeometry(1, 32, 0, Math.PI),
    cone: new THREE.ConeGeometry(1, 1, 16),
  };

  // ---------- Scenery round the track, per world ----------
  let decorGroup = null;
  let decorProps = [];      // { obj, r } -- hidden when it would poke through the track
  let decorAnim = [];       // things that move (tumbleweeds, the sky in space)
  function disposeTree(g) {
    g.traverse((o) => {
      if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
      if (o.material && o.material.userData.decor) { if (o.material.map) o.material.map.dispose(); o.material.dispose(); }
    });
  }
  function buildDecor() {
    if (decorGroup) { scene.remove(decorGroup); disposeTree(decorGroup); }
    decorGroup = new THREE.Group();
    decorProps = []; decorAnim = [];
    const rng = mulberry32(99 + world.id.charCodeAt(0) * 31);
    if (DECOR[world.id]) DECOR[world.id](decorGroup, rng);
    scene.add(decorGroup);
  }
  const dmat = (opts) => {
    const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.7 }, opts));
    m.userData.decor = true;
    return m;
  };
  const dbasic = (opts) => {
    const m = new THREE.MeshBasicMaterial(opts);
    m.userData.decor = true;
    return m;
  };
  function mesh(geo, mat, x, y, z, sx, sy, sz) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy === undefined ? sx : sy, sz === undefined ? sx : sz);
    return m;
  }
  // somewhere on the ground round the track (r: how many grid cells it needs clear)
  function placeProp(g, obj, x, z, r) {
    obj.position.x = x; obj.position.z = z;
    g.add(obj);
    if (r !== undefined) decorProps.push({ obj, r });
    return obj;
  }
  const spot = (rng, spread = 215) => [(rng() * 2 - 1) * spread, (rng() * 2 - 1) * spread];

  // Hides scenery that would stick through the track or its pillars.
  function hideDecorOnTrack(pls) {
    const cells = [];
    for (const pl of pls) for (const c of cellKeys(pl).cells) cells.push(c);
    for (const p of decorProps) {
      const cx = Math.round(p.obj.position.x / S), cz = Math.round(p.obj.position.z / S);
      p.obj.visible = !cells.some(([x, z]) => Math.abs(x - cx) <= p.r && Math.abs(z - cz) <= p.r);
    }
  }

  const DECOR = {
    west(g, rng) {
      const G0 = GROUND_Y;
      const trunkGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
      for (let i = 0; i < 45; i++) {
        const c = new THREE.Group(), h = 3 + rng() * 5, r = 0.5 + rng() * 0.3;
        c.add(mesh(trunkGeo, MAT.cactus, 0, G0 + h / 2, 0, r, h, r));
        c.add(mesh(GEO.sphere, MAT.cactus, 0, G0 + h, 0, r));
        for (const s of [-1, 1]) {
          if (rng() < 0.25) continue;
          const ay = G0 + h * (0.35 + rng() * 0.3), al = 1 + rng() * 1.5;
          c.add(mesh(trunkGeo, MAT.cactus, s * (r + 0.45), ay, 0, r * 0.6, 0.9, r * 0.6).rotateZ(Math.PI / 2));
          c.add(mesh(trunkGeo, MAT.cactus, s * (r + 0.9), ay + al / 2, 0, r * 0.6, al, r * 0.6));
          c.add(mesh(GEO.sphere, MAT.cactus, s * (r + 0.9), ay + al, 0, r * 0.6));
        }
        c.rotation.y = rng() * 6;
        const [x, z] = spot(rng);
        placeProp(g, c, x, z, 1);
      }
      const rockMat = dmat({ color: 0xa0603a, flatShading: true });
      const rockGeo = new THREE.DodecahedronGeometry(1);
      for (let i = 0; i < 25; i++) {
        const s = 1 + rng() * 2.5;
        const [x, z] = spot(rng);
        placeProp(g, mesh(rockGeo, rockMat, 0, G0 + s * 0.3, 0, s * 1.3, s * 0.7, s), x, z, 1);
      }
      // tumbleweeds roll across the desert
      const weedMat = dmat({ color: 0xa07a40, wireframe: true });
      const weedGeo = new THREE.IcosahedronGeometry(1, 1);
      for (let i = 0; i < 9; i++) {
        const r = 0.8 + rng() * 0.5, sp = 3 + rng() * 4, z = (rng() * 2 - 1) * 200;
        const w = mesh(weedGeo, weedMat, (rng() * 2 - 1) * 230, G0 + r, z, r);
        g.add(w);
        decorAnim.push((dt, t) => {
          w.position.x += sp * dt;
          if (w.position.x > 240) w.position.x = -240;
          w.position.y = G0 + r + Math.abs(Math.sin(t * sp * 0.5 + i)) * 0.8;
          w.rotation.z -= sp * dt / r;
        });
      }
      // big red mesas far away
      const mesaMat = dmat({ color: 0xb8562e, flatShading: true, roughness: 0.9 });
      for (let i = 0; i < 14; i++) {
        const ang = i / 14 * Math.PI * 2 + rng() * 0.3, d = 330 + rng() * 120;
        const r = 25 + rng() * 35, h = 30 + rng() * 50;
        const geo = new THREE.CylinderGeometry(r * 0.8, r, h, 7);
        g.add(mesh(geo, mesaMat, Math.cos(ang) * d, G0 + h / 2, Math.sin(ang) * d, 1));
      }
    },

    toys(g, rng) {
      const G0 = GROUND_Y;
      // a round rug in the middle of the floor
      const rug = new THREE.Mesh(new THREE.CircleGeometry(150, 48), dmat({ map: canvasTexture(256, 256, (c) => {
        ['#ff7aa8', '#ffd166', '#7ad3ff', '#9be37a', '#c9a0ff', '#ffffff'].forEach((col, i) => {
          c.fillStyle = col; c.beginPath(); c.arc(128, 128, 128 - i * 21, 0, Math.PI * 2); c.fill();
        });
      }), roughness: 1 }));
      rug.rotation.x = -Math.PI / 2;
      rug.position.y = G0 + 0.05;
      rug.receiveShadow = true;
      g.add(rug);
      // the bedroom walls, with a window
      const paper = repeatTex(canvasTexture(64, 64, (c) => {
        c.fillStyle = '#bfe6ff'; c.fillRect(0, 0, 64, 64);
        c.fillStyle = '#e8f6ff'; c.fillRect(0, 0, 32, 64);
        c.fillStyle = '#ffe14f';
        c.beginPath(); c.arc(48, 16, 4, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(16, 48, 4, 0, Math.PI * 2); c.fill();
      }), 1);
      paper.repeat.set(14, 6);
      const wallMat = dmat({ map: paper, roughness: 0.9 });
      const ROOM = 340, WH = 280;
      for (let i = 0; i < 4; i++) {
        const wall = new THREE.Mesh(new THREE.PlaneGeometry(ROOM * 2, WH), wallMat);
        const ang = i * Math.PI / 2;
        wall.position.set(-Math.sin(ang) * ROOM, G0 + WH / 2, -Math.cos(ang) * ROOM);
        wall.rotation.y = ang;
        g.add(wall);
      }
      const win = new THREE.Mesh(new THREE.PlaneGeometry(160, 110), dbasic({ map: canvasTexture(64, 44, (c) => {
        c.fillStyle = '#8fd8ff'; c.fillRect(0, 0, 64, 44);
        c.fillStyle = '#ffffff';
        for (const [x, y, r] of [[14, 12, 6], [22, 10, 8], [30, 13, 5], [46, 26, 6], [53, 24, 7]]) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); }
        c.fillStyle = '#ffe14f'; c.beginPath(); c.arc(54, 8, 5, 0, Math.PI * 2); c.fill();
      }) }));
      win.position.set(0, G0 + 150, -ROOM + 0.5);
      g.add(win);
      const frameMat = dmat({ color: 0xffffff });
      for (const [x, y, w, h] of [[0, 205, 170, 8], [0, 95, 170, 8], [-80, 150, 8, 118], [80, 150, 8, 118], [0, 150, 6, 110], [0, 150, 160, 6]]) {
        g.add(mesh(GEO.box, frameMat, x, G0 + y, -ROOM + 2, w, h, 4));
      }
      // a bed against the side wall
      const bed = new THREE.Group();
      bed.add(mesh(GEO.box, dmat({ color: 0x8a5a30 }), 0, G0 + 12, 0, 130, 24, 210));
      bed.add(mesh(GEO.box, dmat({ color: 0x5aa0ff }), 0, G0 + 30, 15, 134, 14, 180));
      bed.add(mesh(GEO.box, dmat({ color: 0xffffff }), 0, G0 + 32, -82, 90, 14, 34));
      bed.add(mesh(GEO.box, dmat({ color: 0x8a5a30 }), 0, G0 + 50, -106, 134, 100, 8));
      bed.rotation.y = Math.PI / 2;
      placeProp(g, bed, -ROOM + 106, 120, 15);
      // a big teddy bear in the corner
      const fur = dmat({ color: 0xb87a45, roughness: 1 }), snout = dmat({ color: 0xf0d2a8, roughness: 1 });
      const ted = new THREE.Group();
      ted.add(mesh(GEO.sphere, fur, 0, G0 + 24, 0, 24, 26, 22));
      ted.add(mesh(GEO.sphere, fur, 0, G0 + 60, 0, 17));
      for (const s of [-1, 1]) {
        ted.add(mesh(GEO.sphere, fur, s * 13, G0 + 74, 0, 7));
        ted.add(mesh(GEO.sphere, fur, s * 24, G0 + 30, 8, 8, 14, 8));
        ted.add(mesh(GEO.sphere, fur, s * 13, G0 + 6, 16, 9));
        ted.add(mesh(GEO.sphere, MAT.black, s * 6, G0 + 64, 15, 2));
      }
      ted.add(mesh(GEO.sphere, snout, 0, G0 + 56, 14, 7, 5, 5));
      ted.add(mesh(GEO.sphere, MAT.black, 0, G0 + 58, 19, 2));
      ted.rotation.y = -Math.PI * 0.75;
      placeProp(g, ted, ROOM - 60, ROOM - 60, 5);
      // giant alphabet blocks, crayons and balls all over the floor
      const blockMats = ['A', 'B', 'C', 'D', 'E', 'F'].map((ch, i) => dmat({ roughness: 0.5, map: canvasTexture(64, 64, (c) => {
        c.fillStyle = ['#ff4d4d', '#ffd23f', '#4d9bff', '#5dd36b', '#c084fc', '#ff9f43'][i]; c.fillRect(0, 0, 64, 64);
        c.strokeStyle = '#ffffff'; c.lineWidth = 6; c.strokeRect(5, 5, 54, 54);
        c.fillStyle = '#ffffff'; c.font = 'bold 40px Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(ch, 32, 35);
      }) }));
      for (let i = 0; i < 26; i++) {
        const s = 5 + rng() * 6;
        const b = mesh(GEO.box, blockMats[i % 6], 0, G0 + s / 2, 0, s);
        b.rotation.y = rng() * 6;
        b.castShadow = true;
        const [x, z] = spot(rng, 230);
        placeProp(g, b, x, z, 1);
      }
      const crayonCols = [0xff3030, 0x2f6bff, 0x30c040, 0xffb000, 0xa040ff, 0xff70c0];
      const tubeGeo = new THREE.CylinderGeometry(1, 1, 1, 12);
      for (let i = 0; i < 12; i++) {
        const m = dmat({ color: crayonCols[i % 6], roughness: 0.6 });
        const c = new THREE.Group();
        c.add(mesh(tubeGeo, m, 0, 0, 0, 1.3, 14, 1.3));
        c.add(mesh(GEO.cone, m, 0, 8.5, 0, 1.3, 3, 1.3));
        c.add(mesh(tubeGeo, dmat({ color: 0xffffff }), 0, -2, 0, 1.35, 6, 1.35));
        c.rotation.z = Math.PI / 2;
        const holder = new THREE.Group();
        holder.add(c);
        holder.position.y = G0 + 1.3;
        holder.rotation.y = rng() * 6;
        const [x, z] = spot(rng, 230);
        placeProp(g, holder, x, z, 2);
      }
      const ballTex = canvasTexture(64, 32, (c) => {
        ['#ff4d4d', '#ffffff', '#4d9bff', '#ffd23f'].forEach((col, i) => { c.fillStyle = col; c.fillRect(i * 16, 0, 16, 32); });
      });
      const ballMat = dmat({ map: ballTex, roughness: 0.3 });
      for (let i = 0; i < 4; i++) {
        const r = 5 + rng() * 4;
        const b = mesh(GEO.sphere, ballMat, 0, G0 + r, 0, r);
        b.rotation.set(rng(), rng() * 6, rng());
        const [x, z] = spot(rng, 230);
        placeProp(g, b, x, z, 2);
      }
    },

    space(g, rng) {
      const G0 = GROUND_Y;
      // the sky moves with the camera, so the stars and planets always look far away
      const sky = new THREE.Group();
      const stars = canvasTexture(1024, 512, (c) => {
        c.fillStyle = '#04030c'; c.fillRect(0, 0, 1024, 512);
        for (const [x, y, r, col] of [[260, 200, 160, 'rgba(120,50,200,0.25)'], [760, 300, 200, 'rgba(40,90,220,0.22)'], [520, 120, 120, 'rgba(220,60,160,0.15)']]) {
          const gr = c.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
          c.fillStyle = gr; c.fillRect(0, 0, 1024, 512);
        }
        for (let i = 0; i < 900; i++) {
          c.fillStyle = i % 7 ? '#ffffff' : ['#ffd0a0', '#a0c8ff'][i % 2];
          const s = i % 23 ? 1 : 2;
          c.fillRect(Math.floor(rng() * 1024), Math.floor(rng() * 512), s, s);
        }
      });
      sky.add(new THREE.Mesh(new THREE.SphereGeometry(800, 32, 16),
        dbasic({ map: stars, side: THREE.BackSide, fog: false, depthWrite: false })));
      const planetTex = canvasTexture(128, 64, (c) => {
        ['#e8a060', '#c8784a', '#f0c890', '#b86a40', '#e0b080', '#c88a5a'].forEach((col, i) => { c.fillStyle = col; c.fillRect(0, i * 11, 128, 11); });
      });
      const planet = new THREE.Group();
      planet.add(mesh(GEO.sphere, dbasic({ map: planetTex, fog: false }), 0, 0, 0, 70));
      const ring = new THREE.Mesh(new THREE.RingGeometry(95, 130, 48), dbasic({ color: 0xe8d0a0, side: THREE.DoubleSide, transparent: true, opacity: 0.7, fog: false }));
      ring.rotation.x = Math.PI / 2 - 0.35;
      planet.add(ring);
      planet.position.set(-420, 260, -520);
      sky.add(planet);
      const earth = mesh(GEO.sphere, dbasic({ fog: false, map: canvasTexture(64, 32, (c) => {
        c.fillStyle = '#2f7bff'; c.fillRect(0, 0, 64, 32);
        c.fillStyle = '#3cc860';
        for (const [x, y, w, h] of [[6, 8, 12, 10], [28, 4, 10, 14], [44, 14, 14, 9], [20, 22, 8, 6]]) c.fillRect(x, y, w, h);
        c.fillStyle = '#ffffff'; c.fillRect(0, 0, 64, 3); c.fillRect(0, 29, 64, 3);
      }) }), 520, 180, 380, 28);
      sky.add(earth);
      g.add(sky);
      decorAnim.push(() => { sky.position.copy(camera.position); });
      // craters, moon rocks, glowing crystals and little moon-base domes
      const craterMat = dmat({ color: 0x7a7a88, roughness: 1 });
      const craterGeo = new THREE.TorusGeometry(1, 0.22, 6, 20);
      for (let i = 0; i < 26; i++) {
        const r = 3 + rng() * 8;
        const c = mesh(craterGeo, craterMat, 0, G0 + 0.1, 0, r, r, r * 1.4);
        c.rotation.x = Math.PI / 2;
        const [x, z] = spot(rng);
        placeProp(g, c, x, z, 1);
      }
      const rockMat = dmat({ color: 0x9a9aa8, flatShading: true });
      const rockGeo = new THREE.DodecahedronGeometry(1);
      for (let i = 0; i < 24; i++) {
        const s = 0.8 + rng() * 2.2;
        const [x, z] = spot(rng);
        placeProp(g, mesh(rockGeo, rockMat, 0, G0 + s * 0.3, 0, s * 1.2, s * 0.8, s), x, z, 1);
      }
      const crystalGeo = new THREE.OctahedronGeometry(1);
      const crystalMats = [0x5ff3ff, 0xff5fe0, 0x9f7bff].map((c) => dmat({ color: c, emissive: c, emissiveIntensity: 0.7, roughness: 0.2, flatShading: true }));
      for (let i = 0; i < 18; i++) {
        const s = 1 + rng() * 1.6;
        const cr = mesh(crystalGeo, crystalMats[i % 3], 0, G0 + s * 1.6, 0, s, s * 2.4, s);
        cr.rotation.set(rng() * 0.4, rng() * 6, rng() * 0.4);
        const [x, z] = spot(rng);
        placeProp(g, cr, x, z, 1);
      }
      const domeMat = dmat({ color: 0xf0f2ff, roughness: 0.3, metalness: 0.2 });
      const domeGeo = new THREE.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
      const glow = dmat({ color: 0x5ff3ff, emissive: 0x5ff3ff, emissiveIntensity: 1 });
      for (let i = 0; i < 6; i++) {
        const r = 5 + rng() * 5;
        const d = new THREE.Group();
        d.add(mesh(domeGeo, domeMat, 0, G0, 0, r));
        d.add(mesh(GEO.torus, glow, 0, G0 + r * 0.3, 0, r * 0.96, r * 0.96, r * 3).rotateX(Math.PI / 2));
        const [x, z] = spot(rng);
        placeProp(g, d, x, z, 2);
      }
      // a rocket on its launch pad
      const rocket = new THREE.Group();
      const body = dmat({ color: 0xffffff, roughness: 0.3 }), red = dmat({ color: 0xff3b3b, roughness: 0.4 });
      rocket.add(mesh(new THREE.CylinderGeometry(1, 1, 1, 20), body, 0, G0 + 16, 0, 5, 24, 5));
      rocket.add(mesh(GEO.cone, red, 0, G0 + 34, 0, 5, 12, 5));
      for (let k = 0; k < 4; k++) {
        const fin = mesh(GEO.box, red, 0, G0 + 7, 0, 1, 10, 6);
        fin.position.x = Math.cos(k * Math.PI / 2) * 6; fin.position.z = Math.sin(k * Math.PI / 2) * 6;
        fin.rotation.y = -k * Math.PI / 2;
        rocket.add(fin);
      }
      rocket.add(mesh(GEO.sphere, glow, 0, G0 + 22, 5, 1.8, 1.8, 0.6));
      placeProp(g, rocket, 250, -60, 3);
    },
  };

  // ---------- Track layout (grid cells) ----------
  // A track is the list of piece types after the START piece. Each piece's exit decides
  // where the next one goes, so the run is always one connected chain.
  function exitOf(pl) {
    const def = PIECES[pl.type], len = def.len || 1;
    const dir = def.turn === 1 ? (pl.dir + 3) % 4 : def.turn === -1 ? (pl.dir + 1) % 4 : pl.dir;
    return { x: pl.x + DIRS[dir][0] * len, z: pl.z + DIRS[dir][1] * len, level: pl.level + (def.dl || 0), dir };
  }
  // A piece fills its cells from its lowest floor up to one level above its highest one
  // (head room, plus more for a loop), so tracks can only cross with room to spare.
  function cellKeys(pl) {
    const def = PIECES[pl.type], dl = def.dl || 0, f = DIRS[pl.dir];
    const lo = Math.min(pl.level, pl.level + dl), hi = Math.max(pl.level, pl.level + dl) + 1 + (def.tall || 0);
    const keys = [], cells = [];
    for (let k = 0; k < (def.len || 1); k++) {
      const x = pl.x + f[0] * k, z = pl.z + f[1] * k;
      cells.push([x, z]);
      for (let l = lo; l <= hi; l++) keys.push(x + ',' + z + ',' + l);
    }
    return { keys, cells, lo, hi };
  }
  function fits(pl, occ) {
    const { keys, cells, lo, hi } = cellKeys(pl);
    if (lo < 0 || hi - 1 - (PIECES[pl.type].tall || 0) > MAX_LEVEL) return false;
    if (cells.some(([x, z]) => Math.abs(x) > GRID_LIMIT || Math.abs(z) > GRID_LIMIT)) return false;
    return keys.every((k) => !occ.has(k));
  }
  function claim(pl, occ) { cellKeys(pl).keys.forEach((k) => occ.add(k)); }

  // Lays out START + types. Stops at the first piece that doesn't fit.
  function layout(types) {
    const occ = new Set();
    const pieces = [];
    let at = { x: 0, z: 0, level: START_LEVEL, dir: 0 };
    for (const type of ['start'].concat(types)) {
      const pl = { type, x: at.x, z: at.z, level: at.level, dir: at.dir };
      if (!fits(pl, occ)) break;
      claim(pl, occ);
      pieces.push(pl);
      at = exitOf(pl);
    }
    return { pieces, occ, next: at };
  }
  // A piece can go on the end if it fits AND there is still room for the finish after it.
  function canAdd(lay, type) {
    if (lay.pieces.length - 1 >= MAX_PIECES) return false;
    const pl = Object.assign({ type }, lay.next);
    if (!fits(pl, lay.occ)) return false;
    const occ = new Set(lay.occ);
    claim(pl, occ);
    return fits(Object.assign({ type: 'finish' }, exitOf(pl)), occ);
  }

  // ---------- Piece shapes ----------
  // Local frame of a piece: b runs along it (entry at -S/2, a long piece carries on into the
  // cells ahead), a runs to the right, y is up. A shape is made of sweeps -- floor strips
  // with a wall on each edge -- plus the centre path the computer marbles follow. Each frame
  // along a sweep: centre (a, y, b), direction (ta, tb), sideways (la, lb), floor normal
  // (na, ny, nb) and half width w.
  const LOOP_R = 3, LOOP_W = 1.3, LOOP_SHIFT = 1.6;
  // spiral: turn radius, lane half width, where the post stands along the piece, lane line
  const SP_R = 2.6, SP_W = 1.3, SP_C = 4, SP_X = -SP_R;
  // trampoline launch: forward and upward speed (clears the deck edge, lands mid-deck)
  const TRAMP_VF = 10.9, TRAMP_VY = 14;
  const FLAT = [[-1, 0], [1, 0]];
  // half-pipe: widest half width, how high the sides curve up, the profile's sample points
  const HP_W = 3.6, HP_UP = 2.2;
  const HP_S = [-1, -0.96, -0.9, -0.82, -0.72, -0.6, -0.47, -0.35, 0.35, 0.47, 0.6, 0.72, 0.82, 0.9, 0.96, 1];
  const PLANK_W = 0.85;     // narrow plank half width
  const SEE_L = 2.6;        // seesaw plank half length
  // fork: how wide it opens, the safe lane and the shortcut (centre, half width)
  const FORK_W = 3.8, SAFE_A = -2.0, SAFE_W = 1.7, CUT_A = 2.0, CUT_W = 0.75;
  // cannon: where it catches you, where the shot leaves the barrel, and how hard it fires
  const CAN_LOAD = [-0.8, 1.6], CAN_MB = 2.4, CAN_MY = 2.2, CAN_VF = 15.5, CAN_VY = 14, CAN_WAIT = 0.6;
  const CAN_TILT = Math.atan2(CAN_VY, CAN_VF);
  const norm2 = (x, y) => { const l = Math.hypot(x, y) || 1; return [x / l, y / l]; };
  const smooth = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  function fr(a, y, b, ta, tb, w, extra) {
    return Object.assign({ a, y, b, ta, tb, la: tb, lb: -ta, na: 0, ny: 1, nb: 0, w }, extra);
  }

  function shapeOf(pl) {
    const def = PIECES[pl.type];
    const h = S / 2;
    if (def.turn) {
      const s = def.turn;
      const at = (u) => {
        const ph = u * Math.PI / 2;
        return fr(s * (h - h * Math.cos(ph)), 0, -h + h * Math.sin(ph), s * Math.sin(ph), Math.cos(ph), HW);
      };
      return { sweeps: [{ n: 14, at }], path: at, pillars: [at(0.5)], star: at(0.5) };
    }
    if (pl.type === 'loop') {
      // The lead-in narrows into the left lane, the ring drifts across to the right lane as
      // it goes round (so the way out passes beside the way in), then the track widens again.
      const lead = (u) => {
        const b = -h + 14 * u, k = smooth((b + h) / S);
        return fr(-LOOP_SHIFT * k, 0, b, 0, 1, HW - (HW - LOOP_W) * k);
      };
      const ring = (u) => {
        const ph = u * Math.PI * 2;
        return fr(-LOOP_SHIFT + 2 * LOOP_SHIFT * u, LOOP_R - LOOP_R * Math.cos(ph), 10 + LOOP_R * Math.sin(ph),
          0, Math.cos(ph), LOOP_W, { la: 1, lb: 0, na: 0, ny: Math.cos(ph), nb: -Math.sin(ph), ride: true });
      };
      const exit = (u) => {
        const b = 10 + 10 * u;
        return fr(LOOP_SHIFT * (1 - smooth((b - 13) / 5)), 0, b, 0, 1, LOOP_W + (HW - LOOP_W) * smooth((b - 14) / 5));
      };
      const path = (t) => t < 0.4 ? lead(t / 0.4) : t < 0.75 ? ring((t - 0.4) / 0.35) : exit((t - 0.75) / 0.25);
      return {
        sweeps: [{ n: 16, at: lead }, { n: 48, at: ring }, { n: 14, at: exit }], path,
        pillars: [lead(0.3), exit(0.7)], star: ring(0.5),
        pads: [{ a0: -LOOP_SHIFT - LOOP_W, a1: -LOOP_SHIFT + LOOP_W, b0: 4.5, b1: 7.5, speed: 24 }],
      };
    }
    if (pl.type === 'jump') {
      // launch pad, kicker ramp, a gap to fly over, then a landing ramp that drops a level
      // (the kicker curves up smoothly so it doesn't knock speed off)
      const run = (u) => fr(0, 0, -h + 6 * u, 0, 1, HW);
      const kick = (u) => fr(0, 1.2 * u * u, 2 + 4 * u, 0, 1, HW);
      const air = (u) => fr(0, 1.2 + 0.8 * Math.sin(u * Math.PI) - 0.6 * u, 6 + 3 * u, 0, 1, HW, { ride: true });
      const land = (u) => fr(0, 0.6 - (0.6 + LH) * u, 9 + 11 * u, 0, 1, HW);
      const path = (t) => t < 0.25 ? run(t / 0.25) : t < 5 / 12 ? kick((t - 0.25) * 6)
        : t < 0.5625 ? air((t - 5 / 12) / (0.5625 - 5 / 12)) : land((t - 0.5625) / 0.4375);
      return {
        sweeps: [{ n: 1, at: run }, { n: 8, at: kick }, { n: 1, at: land }], path,
        pillars: [run(0.5), land(0.6)], star: air(0.5),
        // always launches at the same speed, so the jump lands on the ramp every time
        pads: [{ a0: -HW, a1: HW, b0: -2, b1: 1.5, speed: 15, exact: true }],
      };
    }
    if (pl.type === 'spiral' || pl.type === 'corkscrew') {
      const T = def.turns || 1;
      // a straight lead-in that narrows into the left lane, one banked turn round a centre post
      // (dropping a level as it goes), then out along the same line underneath and wide again
      const lead = (u) => {
        const b = -h + 8 * u, x = Math.min(1, (b + h) / 7);
        const k = smooth(x), dk = 6 * x * (1 - x) / 7;
        const t = norm2(SP_X * dk, 1);
        return fr(SP_X * k, 0, b, t[0], t[1], HW - (HW - SP_W) * k);
      };
      const ring = (u) => {
        const ph = u * Math.PI * 2 * T, ia = Math.cos(ph), ib = -Math.sin(ph);   // ia/ib: toward the post
        const th = 0.45 * Math.min(smooth(u * T / 0.15), smooth((1 - u) * T / 0.15));
        const c = Math.cos(th), s = Math.sin(th);
        return fr(-SP_R * ia, -LH * T * u, SP_C - SP_R * ib, Math.sin(ph), Math.cos(ph), SP_W,
          { la: c * ia, lb: c * ib, ly: -s, na: s * ia, ny: c, nb: s * ib, coast: true });
      };
      const exit = (u) => {
        const b = SP_C + 8 * u, x = Math.max(0, Math.min(1, (b - SP_C - 1) / 6));
        const k = smooth(x), dk = 6 * x * (1 - x) / 6;
        const t = norm2(-SP_X * dk, 1);
        return fr(SP_X * (1 - k), -LH * T, b, t[0], t[1], SP_W + (HW - SP_W) * k);
      };
      const path = (t) => t < 0.25 ? lead(t / 0.25) : t < 0.75 ? ring((t - 0.25) / 0.5) : exit((t - 0.75) / 0.25);
      return { sweeps: [{ n: 10, at: lead }, { n: 44 * T, at: ring }, { n: 10, at: exit }], path,
        pillars: [lead(0.3), exit(0.75)], star: ring(0.5) };
    }
    if (pl.type === 'fork') {
      // opens wide, splits in two -- a walled safe lane with a hump, or a skinny wall-less
      // shortcut with a boost pad -- then the two join up again
      const approach = (u) => fr(0, 0, -h + 4 * u, 0, 1, HW + (FORK_W - HW) * smooth(u));
      const safe = (u) => fr(SAFE_A, 1.4 * Math.pow(Math.sin(Math.PI * u), 2), 16 * u, 0, 1, SAFE_W);
      const cutIn = (u) => fr(CUT_A - 0.05 * (1 - u), 0, 3 * u, 0, 1, 1.8 - (1.8 - CUT_W) * smooth(u));
      const cutMid = (u) => fr(CUT_A, 0, 3 + 10 * u, 0, 1, CUT_W);
      const cutOut = (u) => fr(CUT_A - 0.05 * u, 0, 13 + 3 * u, 0, 1, CUT_W + (1.8 - CUT_W) * smooth(u));
      const merge = (u) => fr(0, 0, 16 + 4 * u, 0, 1, FORK_W - (FORK_W - HW) * smooth(u));
      // the computer marbles take the safe lane
      const path = (t) => t < 0.2 ? fr(SAFE_A * smooth(t / 0.2), 0, -h + 20 * t, 0, 1, HW)
        : t < 0.8 ? safe((t - 0.2) / 0.6)
        : fr(SAFE_A * (1 - smooth((t - 0.8) / 0.2)), 0, 16 + 20 * (t - 0.8), 0, 1, HW);
      return {
        sweeps: [{ n: 4, at: approach }, { n: 16, at: safe }, { n: 5, at: cutIn }, { n: 1, at: cutMid, noWalls: true },
          { n: 5, at: cutOut }, { n: 4, at: merge }],
        path, pillars: [approach(0.5), safe(0.5), cutMid(0.5), merge(0.6)], star: cutMid(0.6),
        pads: [{ a0: CUT_A - CUT_W, a1: CUT_A + CUT_W, b0: 4, b1: 7, speed: 15 }],
      };
    }
    if (pl.type === 'cannon') {
      // roll up to the cannon, get fired over a big gap, land on the deck
      const run = (u) => fr(0, 0, -h + (CAN_LOAD[1] + h) * u, 0, 1, HW);
      const air = (u) => fr(0, CAN_MY * (1 - u) + 22 * u * (1 - u), CAN_MB + (24 - CAN_MB) * u, 0, 1, HW, { ride: true });
      const deck = (u) => fr(0, 0, 20 + 8 * u, 0, 1, HW);
      const path = (t) => t < 0.2 ? run(t / 0.2) : t < 0.75 ? air((t - 0.2) / 0.55) : deck(0.5 + 0.5 * (t - 0.75) / 0.25);
      return { sweeps: [{ n: 1, at: run }, { n: 1, at: deck }], path, backstop: run(1),
        pillars: [run(0.4), deck(0.5)], star: air(0.5) };
    }
    if (pl.type === 'halfpipe') {
      // a U-shaped channel: flat track at both ends, curving up into tall swoopy sides in between
      const at = (u) => {
        const b = -h + 2 * S * u, k = smooth(Math.min(1, Math.min(b + h, 12 - b) / 3.5));
        const prof = HP_S.map((sv) => {
          const t = Math.max(0, (Math.abs(sv) - 0.35) / 0.65);
          return [sv, k * HP_UP * (1 - Math.sqrt(Math.max(0, 1 - t * t)))];
        });
        return fr(0, 0, b, 0, 1, HW + (HP_W - HW) * k, { prof });
      };
      return { sweeps: [{ n: 24, at }], path: (t) => fr(0, 0, -h + 2 * S * t, 0, 1, HW),
        pillars: [at(0.15), at(0.85)], star: fr(3.0, 1.0, 4, 0, 1, HW) };
    }
    if (pl.type === 'plank') {
      // a skinny bridge: the walls narrow in, stop, and come back at the far end
      const taperIn = (u) => fr(0, 0, -h + 2.5 * u, 0, 1, HW - (HW - PLANK_W) * smooth(u));
      const mid = (u) => fr(0, 0, -1.5 + 11 * u, 0, 1, PLANK_W);
      const taperOut = (u) => fr(0, 0, 9.5 + 2.5 * u, 0, 1, PLANK_W + (HW - PLANK_W) * smooth(u));
      return { sweeps: [{ n: 6, at: taperIn }, { n: 1, at: mid, noWalls: true }, { n: 6, at: taperOut }],
        path: (t) => fr(0, 0, -h + 2 * S * t, 0, 1, PLANK_W), pillars: [mid(0.15), mid(0.5), mid(0.85)], star: mid(0.5) };
    }
    if (pl.type === 'tiles') {
      // walls only -- the floor is the tiles
      const at = (u) => fr(0, 0, -h + 2 * S * u, 0, 1, HW);
      return { sweeps: [{ n: 1, at, noFloor: true }], path: at, pillars: [at(0.05), at(0.95)], star: at(0.5) };
    }
    if (pl.type === 'seesaw') {
      // solid floor at each end; in the middle a tipping plank between tall walls
      const pre = (u) => fr(0, 0, -h + (h - SEE_L) * u, 0, 1, HW);
      const mid = (u) => fr(0, 0, -SEE_L + 2 * SEE_L * u, 0, 1, HW);
      const post = (u) => fr(0, 0, SEE_L + (h - SEE_L) * u, 0, 1, HW);
      const at = (u) => fr(0, 0, -h + S * u, 0, 1, HW);
      return { sweeps: [{ n: 1, at: pre }, { n: 1, at: mid, noFloor: true, wallH: 1.8 }, { n: 1, at: post }],
        path: at, pillars: [pre(0.5), post(0.5)], star: at(0.5) };
    }
    if (pl.type === 'tube') {
      // a closed pipe, steepest in the middle
      const at = (u) => fr(0, -2 * LH * smooth(u), -h + 2 * S * u, 0, 1, HW);
      return { sweeps: [{ n: 16, at, roof: true }], path: at, pillars: [at(0.12), at(0.6)], star: at(0.55) };
    }
    if (pl.type === 'trampoline') {
      // run up to the trampoline, BOING over a gap, land on a deck one level up
      const run = (u) => fr(0, 0, -h + 10 * u, 0, 1, HW);
      const air = (u) => fr(0, LH * u + 9 * u * (1 - u), 3.5 + 11.5 * u, 0, 1, HW, { ride: true });
      const deck = (u) => fr(0, LH, 12 + 8 * u, 0, 1, HW);
      const path = (t) => t < 0.3 ? run(0.75 * t / 0.3) : t < 0.7 ? air((t - 0.3) / 0.4) : deck(0.375 + 0.625 * (t - 0.7) / 0.3);
      return { sweeps: [{ n: 1, at: run }, { n: 1, at: deck }], path,
        pillars: [run(0.5), deck(0.5)], star: air(0.5),
        // the bounce is always the same, so you always land on the deck
        pads: [{ a0: -HW, a1: HW, b0: 2, b1: 5.5, speed: TRAMP_VF, bounce: TRAMP_VY, exact: true }] };
    }
    const dl = def.dl || 0;
    const at = (u) => fr(0, dl * LH * u, -h + S * u, 0, 1, HW);
    const shape = { sweeps: [{ n: 1, at }], path: at, pillars: [at(0.5)], star: at(0.5) };
    if (pl.type === 'boost') shape.pads = [{ a0: -HW, a1: HW, b0: -2, b1: 2, speed: 18 }];
    // the belt keeps you rolling up the ramp; `rise` is how much the floor climbs along it
    if (pl.type === 'conveyor') shape.pads = [{ a0: -HW, a1: HW, b0: -h, b1: h, speed: 9, belt: true, rise: LH }];
    return shape;
  }

  function basis(pl) {
    const f = DIRS[pl.dir];
    return { cx: pl.x * S, cz: pl.z * S, y0: pl.level * LH, fx: f[0], fz: f[1], rx: -f[1], rz: f[0] };
  }
  function toW(B, a, y, b, out) {
    return (out || new THREE.Vector3()).set(B.cx + B.rx * a + B.fx * b, B.y0 + y, B.cz + B.rz * a + B.fz * b);
  }
  function vecW(B, a, y, b, out) {
    return (out || new THREE.Vector3()).set(B.rx * a + B.fx * b, y, B.rz * a + B.fz * b);
  }

  function meshFrom(positions, material, shadows) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material);
    if (shadows) { m.receiveShadow = true; m.castShadow = true; }
    return m;
  }
  function pushQuad(arr, p0, p1, p2, p3) {
    arr.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z,
      p0.x, p0.y, p0.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  }
  function quadTris(list, p0, p1, p2, p3, piece) {
    const t1 = new THREE.Triangle(p0.clone(), p1.clone(), p2.clone());
    const t2 = new THREE.Triangle(p0.clone(), p2.clone(), p3.clone());
    t1.piece = t2.piece = piece;
    list.push(t1, t2);
  }
  // Boxes are symmetric, so the third axis is worked out here (keeps the basis right-handed).
  const tmpZ = new THREE.Vector3();
  function placeBox(mesh, center, ax, ay, az, sx, sy, sz) {
    mesh.position.copy(center);
    tmpZ.crossVectors(ax, ay).normalize();
    mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ax, ay, tmpZ));
    mesh.scale.set(sx, sy, sz);
  }
  const UP = new THREE.Vector3(0, 1, 0);
  const flatOn = (B) => new THREE.Matrix4().makeBasis(vecW(B, 1, 0, 0), vecW(B, 0, 0, 1), UP);
  // turns local axes (right, up, along the piece) into a rotation
  const quatOf = (B) => new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(vecW(B, 1, 0, 0), UP, vecW(B, 0, 0, 1)));

  // Kid's room pillars: towers of stacked toy blocks, all in one mesh per piece.
  const BLOCK_COLORS = [0xff4d4d, 0xffd23f, 0x4d9bff, 0x5dd36b].map((c) => new THREE.Color(c));
  function blockPillars(tops, idx) {
    const pos = [], col = [];
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    for (const top of tops) {
      let y = GROUND_Y, i = idx;
      const hw = 0.55;
      while (y < top.y - 0.05) {
        const y1 = Math.min(y + 1.2, top.y), c = BLOCK_COLORS[i++ % 4];
        const x0 = top.x - hw, x1 = top.x + hw, z0 = top.z - hw, z1 = top.z + hw;
        const faces = [
          [V(x0, y, z1), V(x1, y, z1), V(x1, y1, z1), V(x0, y1, z1)], [V(x1, y, z0), V(x0, y, z0), V(x0, y1, z0), V(x1, y1, z0)],
          [V(x1, y, z1), V(x1, y, z0), V(x1, y1, z0), V(x1, y1, z1)], [V(x0, y, z0), V(x0, y, z1), V(x0, y1, z1), V(x0, y1, z0)],
          [V(x0, y1, z1), V(x1, y1, z1), V(x1, y1, z0), V(x0, y1, z0)],
        ];
        for (const f of faces) { pushQuad(pos, f[0], f[1], f[2], f[3]); for (let k = 0; k < 6; k++) col.push(c.r, c.g, c.b); }
        y = y1 + 0.02;
      }
    }
    const m = meshFrom(pos, MAT.blocks, true);
    m.geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    return m;
  }

  // Builds one placed piece: meshes (into `group`), collision triangles, moving obstacles,
  // boost pads, the stars on it and the path the computer marbles follow.
  function buildPiece(pl, idx, group, ghostMat) {
    const def = PIECES[pl.type];
    const B = basis(pl);
    const shape = shapeOf(pl);
    const piece = { idx, pl, B, shape, tris: [], obstacles: [], stars: [], pads: [], box: new THREE.Box3(), frames: [] };
    const floor = [], floorUV = [], under = [], walls = [], rails = [], glass = [];
    // a point on frame f: `side` -1 left edge / +1 right edge, lifted `up` off the floor,
    // pushed `out` past the edge (a banked frame's sideways direction climbs by ly)
    const P = (f, side, up, out) => {
      const s = side * (f.w + out);
      return toW(B, f.a + f.la * s + f.na * up, f.y + (f.ly || 0) * s + f.ny * up, f.b + f.lb * s + f.nb * up);
    };
    let first = null, last = null;
    for (const sw of shape.sweeps) {
      const fs = [];
      for (let i = 0; i <= sw.n; i++) fs.push(sw.at(i / sw.n));
      if (!first) first = fs[0];
      last = fs[sw.n];
      let along = 0;
      const wallH = sw.wallH || WALL;
      for (let i = 0; i < sw.n; i++) {
        const f0 = fs[i], f1 = fs[i + 1];
        // the floor across: flat, or a curved profile ([side, up] points, -1 to +1) like the half-pipe
        const pr0 = f0.prof || FLAT, pr1 = f1.prof || FLAT;
        const e0 = pr0[0][1], e1 = pr1[0][1];     // how high the floor's edges are
        const l0 = P(f0, -1, e0, 0), l1 = P(f1, -1, e1, 0);
        const r0 = P(f0, 1, pr0[pr0.length - 1][1], 0), r1 = P(f1, 1, pr1[pr1.length - 1][1], 0);
        const v0 = along / (2 * HW);
        along += Math.hypot(f1.a - f0.a, f1.y - f0.y, f1.b - f0.b);
        const v1 = along / (2 * HW);
        if (!sw.noFloor) for (let j = 0; j < pr0.length - 1; j++) {
          const a0 = P(f0, pr0[j][0], pr0[j][1], 0), a1 = P(f1, pr1[j][0], pr1[j][1], 0);
          const b1 = P(f1, pr1[j + 1][0], pr1[j + 1][1], 0), b0 = P(f0, pr0[j + 1][0], pr0[j + 1][1], 0);
          pushQuad(floor, a0, a1, b1, b0);
          const u0 = (pr0[j][0] + 1) / 2, u1 = (pr0[j + 1][0] + 1) / 2;
          floorUV.push(u0, v0, u0, v1, u1, v1, u0, v0, u1, v1, u1, v0);
          quadTris(piece.tris, a0, a1, b1, b0, piece);
        }
        if (sw.roof) {
          // a round see-through roof from wall top to wall top
          const ARC = 8;
          for (let j = 0; j < ARC; j++) {
            const al0 = j / ARC * Math.PI, al1 = (j + 1) / ARC * Math.PI;
            const q0 = P(f0, -Math.cos(al0), WALL + Math.sin(al0) * f0.w, 0), q1 = P(f1, -Math.cos(al0), WALL + Math.sin(al0) * f1.w, 0);
            const q2 = P(f1, -Math.cos(al1), WALL + Math.sin(al1) * f1.w, 0), q3 = P(f0, -Math.cos(al1), WALL + Math.sin(al1) * f0.w, 0);
            pushQuad(glass, q0, q1, q2, q3);
            quadTris(piece.tris, q0, q1, q2, q3, piece);
            // hoops round the pipe now and then
            if (i % 5 === 0) {
              const h0 = P(f0, -Math.cos(al0) * 1.03, WALL + Math.sin(al0) * f0.w * 1.03, 0.05);
              const h3 = P(f0, -Math.cos(al1) * 1.03, WALL + Math.sin(al1) * f0.w * 1.03, 0.05);
              const lift = vecW(B, f1.a - f0.a, f1.y - f0.y, f1.b - f0.b).multiplyScalar(0.25);
              pushQuad(rails, h0, h0.clone().add(lift), h3.clone().add(lift), h3);
            }
          }
        }
        // slab underneath and its outside edges
        if (!sw.noFloor) {
          const ul0 = P(f0, -1, -0.25, 0.08), ul1 = P(f1, -1, -0.25, 0.08);
          const ur0 = P(f0, 1, -0.25, 0.08), ur1 = P(f1, 1, -0.25, 0.08);
          pushQuad(under, ul0, ur0, ur1, ul1);
          pushQuad(under, l0, l1, ul1, ul0);
          pushQuad(under, r0, ur0, ur1, r1);
        }
        if (!sw.noWalls) for (const side of [-1, 1]) {
          const p0 = side < 0 ? l0 : r0, p1 = side < 0 ? l1 : r1;
          const h0 = (side < 0 ? e0 : pr0[pr0.length - 1][1]) + wallH, h1 = (side < 0 ? e1 : pr1[pr1.length - 1][1]) + wallH;
          const w0 = P(f0, side, h0, 0), w1 = P(f1, side, h1, 0);
          pushQuad(sw.roof ? glass : walls, p0, p1, w1, w0);
          quadTris(piece.tris, p0, p1, w1, w0, piece);
          // rails along the wall tops, leaning outward a touch
          pushQuad(rails, w0, w1, P(f1, side, h1, 0.14), P(f0, side, h0, 0.14));
        }
      }
    }
    // start has a back wall, finish an end wall
    const endWall = (f) => {
      const p0 = P(f, -1, 0, 0), p1 = P(f, 1, 0, 0), p2 = P(f, 1, WALL, 0), p3 = P(f, -1, WALL, 0);
      pushQuad(walls, p0, p1, p2, p3);
      quadTris(piece.tris, p0, p1, p2, p3, piece);
    };
    if (pl.type === 'start') endWall(first);
    if (shape.backstop) endWall(shape.backstop);
    if (pl.type === 'finish') endWall(last);

    const floorMesh = meshFrom(floor, ghostMat || floorMat(pl.type), !ghostMat);
    floorMesh.geometry.setAttribute('uv', new THREE.Float32BufferAttribute(floorUV, 2));
    group.add(floorMesh);
    group.add(meshFrom(walls, ghostMat || MAT.wall));
    if (glass.length) group.add(meshFrom(glass, ghostMat || MAT.glass));
    if (!ghostMat) {
      group.add(meshFrom(rails, MAT.rail, true));
      group.add(meshFrom(under, MAT.dark, true));
      // support pillars down to the ground
      const tops = shape.pillars.map((f) => toW(B, f.a, f.y - 0.25, f.b)).filter((t) => t.y - GROUND_Y >= 0.2);
      if (world.pillar === 'blocks') group.add(blockPillars(tops, idx));
      else for (const top of tops) {
        const ph = top.y - GROUND_Y;
        const pillar = new THREE.Mesh(GEO.cyl, MAT.pillar);
        pillar.scale.set(world.pillar[1], ph, world.pillar[1]);
        pillar.position.set(top.x, GROUND_Y + ph / 2, top.z);
        pillar.castShadow = true;
        group.add(pillar);
      }
    }

    piece.tris.forEach((t) => { piece.box.expandByPoint(t.a); piece.box.expandByPoint(t.b); piece.box.expandByPoint(t.c); });

    // boost pads: glowing arrows on the floor
    for (const pd of shape.pads || []) {
      piece.pads.push(pd);
      if (pd.bounce) continue;   // the trampoline draws itself
      const rise = pd.rise || 0, run = pd.b1 - pd.b0;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(pd.a1 - pd.a0 - (pd.belt ? 0.3 : 0), Math.hypot(run, rise)),
        ghostMat || (pd.belt ? MAT.belt : MAT.boost));
      plane.position.copy(toW(B, (pd.a0 + pd.a1) / 2, 0.03 + rise / 2, (pd.b0 + pd.b1) / 2));
      // tilted to lie on a sloping floor
      const along = vecW(B, 0, rise, run).normalize();
      plane.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vecW(B, 1, 0, 0), along,
        vecW(B, 0, run, -rise).normalize()));   // faces up off the floor, like flatOn
      group.add(plane);
    }

    // the path the computer marbles follow, plus frames for progress and the camera.
    // Upside-down or flying bits ("ride") just point straight down the piece.
    const nf = 8 * (def.len || 1);
    for (let i = 0; i <= nf; i++) {
      const f = shape.path(i / nf);
      const ride = !!f.ride;
      piece.frames.push({
        p: toW(B, f.a + f.na * R, f.y + f.ny * R, f.b + f.nb * R),
        fwd: ride ? vecW(B, 0, 0, 1) : vecW(B, f.ta, 0, f.tb).normalize(),
        right: ride ? vecW(B, 1, 0, 0) : vecW(B, f.tb, 0, -f.ta).normalize(),
        ride, coast: !!f.coast,
      });
    }

    if (pl.type === 'finish') addFinishDecor(piece, group, ghostMat);
    if (pl.type === 'start') addStartGate(piece, group, ghostMat);
    const maker = OBSTACLES[pl.type];
    if (maker) maker(piece, group, ghostMat || null);
    if (def.star && !ghostMat) {
      // stars on plain pieces sit left, middle or right, so it's worth steering for them
      const f = shape.star;
      const off = def.len ? 0 : ((idx % 3) - 1) * 1.4;
      const star = new THREE.Mesh(GEO.star, MAT.star);
      star.position.copy(toW(B, f.a + f.la * off + f.na * 0.75, f.y + f.ny * 0.75, f.b + f.lb * off + f.nb * 0.75));
      star.castShadow = true;
      group.add(star);
      piece.stars.push({ mesh: star, taken: false, spin: Math.random() * 6 });
    }
    // leave room in the bounds for things that swing above the track
    piece.box.expandByScalar(R + 0.2);
    piece.box.max.y += 6;
    return piece;
  }

  function addStartGate(piece, group, ghostMat) {
    const B = piece.B;
    const mesh = new THREE.Mesh(GEO.box, ghostMat || MAT.yellow);
    mesh.castShadow = !ghostMat;
    group.add(mesh);
    const gate = {
      kind: 'box', open: 0,
      c: new THREE.Vector3(), ax: [vecW(B, 1, 0, 0), UP.clone(), vecW(B, 0, 0, 1)], h: [HW, 0.45, 0.1],
      vel: (p, o) => o.set(0, 0, 0),
      update(time) {
        toW(B, 0, 0.45 - this.open * 0.95, 0.8, this.c);
        placeBox(mesh, this.c, this.ax[0], this.ax[1], this.ax[2], HW * 2, 0.9, 0.2);
        this.off = this.open > 0.5;
      },
    };
    gate.update(0);
    piece.gate = gate;
    piece.obstacles.push(gate);
  }

  function addFinishDecor(piece, group, ghostMat) {
    const B = piece.B;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(HW * 2, 0.6), ghostMat || MAT.checker);
    line.position.copy(toW(B, 0, 0.01, 0));
    line.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(vecW(B, 1, 0, 0), vecW(B, 0, 0, 1), UP));
    group.add(line);
    for (const s of [-1, 1]) {
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.white);
      post.scale.set(0.12, 2.8, 0.12);
      post.position.copy(toW(B, s * (HW + 0.25), 1.4, 0));
      post.castShadow = !ghostMat;
      group.add(post);
    }
    const banner = new THREE.Mesh(GEO.box, ghostMat || MAT.checker);
    placeBox(banner, toW(B, 0, 2.7, 0), vecW(B, 1, 0, 0), UP, vecW(B, 0, 0, 1), HW * 2 + 0.7, 0.5, 0.12);
    banner.castShadow = !ghostMat;
    group.add(banner);
  }

  // ---------- Obstacles ----------
  // Each one adds moving colliders: { kind: 'box' | 'capsule' | 'cyl', ..., vel(p, out) }.
  const OBSTACLES = {
    spinner(piece, group, ghostMat) {
      const B = piece.B;
      const dirSign = piece.idx % 2 ? -1 : 1;
      const BAR = HW - 0.15;
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
      post.scale.set(0.25, 1.1, 0.25);
      post.position.copy(toW(B, 0, 0.55, 0));
      group.add(post);
      const bar = new THREE.Mesh(GEO.box, ghostMat || MAT.red);
      bar.castShadow = !ghostMat;
      group.add(bar);
      const pivot = toW(B, 0, 0.36, 0);
      const w = 1.4 * dirSign;
      piece.obstacles.push({
        kind: 'cyl', c: toW(B, 0, 0, 0), r: 0.25, y0: pivot.y - 0.4, y1: pivot.y + 0.8,
        vel: (p, o) => o.set(0, 0, 0),
        update() {},
      });
      piece.obstacles.push({
        kind: 'box', c: pivot.clone(), ax: [new THREE.Vector3(), UP.clone(), new THREE.Vector3()], h: [BAR, 0.16, 0.15],
        vel: (p, o) => o.set(w * (p.z - pivot.z), 0, -w * (p.x - pivot.x)),
        update(time) {
          const ang = time * w;
          vecW(B, Math.cos(ang), 0, Math.sin(ang), this.ax[0]);
          this.ax[2].crossVectors(this.ax[0], UP).normalize();
          placeBox(bar, this.c, this.ax[0], this.ax[1], this.ax[2], BAR * 2, 0.32, 0.3);
        },
      });
    },

    gates(piece, group, ghostMat) {
      const B = piece.B;
      const GAP = 1.0, AMP = HW - GAP;
      piece.gapAt = [0, 0];
      piece.gateRows = [-2, 2];
      piece.gateRows.forEach((bb, row) => {
        const meshes = [0, 1].map(() => {
          const m = new THREE.Mesh(GEO.box, ghostMat || MAT.red);
          m.castShadow = !ghostMat;
          group.add(m);
          return m;
        });
        const phase = row * Math.PI + piece.idx;
        const speed = 1.2;
        let gapV = 0;
        const parts = [0, 1].map((side) => ({
          kind: 'box', c: new THREE.Vector3(), ax: [vecW(B, 1, 0, 0), UP.clone(), vecW(B, 0, 0, 1)], h: [0.5, 0.4, 0.15],
          vel: (p, o) => vecW(B, gapV, 0, 0, o),
          update(time) {
            const g = Math.sin(time * speed + phase) * AMP;
            gapV = Math.cos(time * speed + phase) * AMP * speed;
            const a0 = side ? g + GAP : -HW, a1 = side ? HW : g - GAP;
            this.h[0] = Math.max(0.01, (a1 - a0) / 2);
            toW(B, (a0 + a1) / 2, 0.4, bb, this.c);
            placeBox(meshes[side], this.c, this.ax[0], this.ax[1], this.ax[2], this.h[0] * 2, 0.8, 0.3);
            if (side === 0) piece.gapAt[row] = g;
          },
        }));
        parts.forEach((p) => piece.obstacles.push(p));
      });
    },

    bumpers(piece, group, ghostMat) {
      const B = piece.B;
      // a diamond -- the gaps either side of the middle line are wider than a marble
      BUMPERS.forEach(([a, b], i) => {
        const c = toW(B, a, 0, b);
        const look = bumperLook(ghostMat, i);
        look.position.copy(c);
        look.quaternion.copy(quatOf(B));
        group.add(look);
        piece.obstacles.push({
          kind: 'cyl', c, r: 0.45, y0: c.y - 0.2, y1: c.y + 0.8, bumper: true, flash: 0,
          vel: (p, o) => o.set(0, 0, 0),
          update(time, dt) {
            this.flash = Math.max(0, this.flash - dt * 4);
            const s = 1 + this.flash * 0.35;
            look.scale.set(s, 1, s);
          },
        });
      });
    },

    // the post the spiral winds round
    spiral(piece, group, ghostMat) {
      const B = piece.B;
      const top = toW(B, 0, 1.3, SP_C), ph = top.y - GROUND_Y;
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.column);
      post.scale.set(0.55, ph, 0.55);
      post.position.set(top.x, GROUND_Y + ph / 2, top.z);
      post.castShadow = !ghostMat;
      const cap = new THREE.Mesh(GEO.sphere, ghostMat || MAT.yellow);
      cap.scale.setScalar(0.75);
      cap.position.copy(top);
      group.add(post, cap);
    },

    trampoline(piece, group, ghostMat) {
      const B = piece.B;
      const q = quatOf(B);
      const pad = new THREE.Mesh(GEO.box, ghostMat || MAT.tramp);
      pad.scale.set(HW * 2 - 0.7, 0.08, 3.0);
      pad.quaternion.copy(q);
      group.add(pad);
      for (const [a, b, sa, sb] of [[0, 2.15, HW * 2 - 0.2, 0.3], [0, 5.35, HW * 2 - 0.2, 0.3], [-HW + 0.25, 3.75, 0.3, 3.5], [HW - 0.25, 3.75, 0.3, 3.5]]) {
        const rim = new THREE.Mesh(GEO.box, ghostMat || MAT.yellow);
        rim.position.copy(toW(B, a, 0.1, b));
        rim.quaternion.copy(q);
        rim.scale.set(sa, 0.2, sb);
        rim.castShadow = !ghostMat;
        group.add(rim);
      }
      piece.boing = 0;
      piece.obstacles.push({
        off: true,
        update(time, dt) {
          piece.boing = Math.max(0, piece.boing - (dt || 0) * 4);
          // the mat dips when someone bounces, then wobbles back
          const dip = piece.boing * Math.cos(piece.boing * 12) * 0.18;
          pad.position.copy(toW(B, 0, 0.06 - dip, 3.75));
        },
      });
    },

    // an arch with a swirling doorway; rebuildTrack decides which way each one goes
    corkscrew(piece, group, ghostMat) { OBSTACLES.spiral(piece, group, ghostMat); },

    // a big cannon on wheels; the race loop does the loading and firing
    cannon(piece, group, ghostMat) {
      const B = piece.B;
      const dir = vecW(B, 0, Math.sin(CAN_TILT), Math.cos(CAN_TILT));
      const breech = toW(B, 0, 0.55, 0.2);
      const barrel = new THREE.Group();
      const tube = new THREE.Mesh(GEO.cyl, ghostMat || MAT.cannon);
      tube.scale.set(1.0, 3.2, 1.0); tube.position.y = 1.6;
      const lip = new THREE.Mesh(GEO.cyl, ghostMat || MAT.yellow);
      lip.scale.set(1.15, 0.3, 1.15); lip.position.y = 3.1;
      const mouth = new THREE.Mesh(GEO.cyl, ghostMat || MAT.black);
      mouth.scale.set(0.8, 0.05, 0.8); mouth.position.y = 3.26;
      const band = new THREE.Mesh(GEO.cyl, ghostMat || MAT.yellow);
      band.scale.set(1.08, 0.25, 1.08); band.position.y = 0.6;
      const back = new THREE.Mesh(GEO.sphere, ghostMat || MAT.cannon);
      back.scale.setScalar(1.0);
      barrel.add(tube, lip, mouth, band, back);
      barrel.position.copy(breech);
      barrel.quaternion.setFromUnitVectors(UP, dir);
      group.add(barrel);
      for (const sa of [-1, 1]) {
        const wheel = new THREE.Mesh(GEO.cyl, ghostMat || MAT.wheel);
        wheel.position.copy(toW(B, sa * 1.45, 0.75, 0.2));
        wheel.quaternion.setFromUnitVectors(UP, vecW(B, 1, 0, 0));
        wheel.scale.set(0.75, 0.25, 0.75);
        wheel.castShadow = !ghostMat;
        const hub = new THREE.Mesh(GEO.cyl, ghostMat || MAT.yellow);
        hub.position.copy(wheel.position); hub.quaternion.copy(wheel.quaternion);
        hub.scale.set(0.22, 0.3, 0.22);
        group.add(wheel, hub);
      }
      tube.castShadow = back.castShadow = !ghostMat;
      piece.cannon = { dir, recoil: 0 };
      piece.obstacles.push({
        off: true,
        update(time, dt) {
          const c = piece.cannon;
          c.recoil = Math.max(0, c.recoil - (dt || 0) * 3);
          barrel.position.copy(breech).addScaledVector(dir, -c.recoil * 0.5);
        },
      });
    },

    // a pointy splitter where the fork divides, with signs
    fork(piece, group, ghostMat) {
      const B = piece.B;
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
      post.scale.set(0.08, 2.2, 0.08);
      post.position.copy(toW(B, -0.05, 1.1, -0.2));
      group.add(post);
      for (const [sa, txt, col] of [[-1, 'SAFE', '#5dff8a'], [1, 'FAST!', '#ff6b2c']]) {
        const sign = new THREE.Mesh(GEO.box, ghostMat || signMat(txt, col));
        sign.position.copy(toW(B, -0.05 + sa * 0.55, 2.0, -0.2));
        sign.quaternion.copy(quatOf(B));
        sign.rotateY(Math.PI);
        sign.scale.set(1.05, 0.42, 0.06);
        group.add(sign);
      }
    },

    // two pinball flippers that snap forward now and then, leaving a gap down the middle
    flippers(piece, group, ghostMat) {
      const B = piece.B;
      // the hinges stand in from the walls, leaving a lane down each side, so nothing gets wedged
      const FL = 1.3, PA = 1.85, PB = 1.0;
      for (const sa of [-1, 1]) {
        const pivot = toW(B, sa * PA, 0.25, PB);
        const knob = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
        knob.scale.set(0.2, 0.6, 0.2);
        knob.position.copy(pivot);
        piece.obstacles.push({ kind: 'cyl', c: pivot.clone(), r: 0.2, y0: pivot.y - 0.6, y1: pivot.y + 0.6,
          vel: (p, o) => o.set(0, 0, 0), update() {} });
        const bar = new THREE.Mesh(GEO.box, ghostMat || MAT.red);
        bar.castShadow = !ghostMat;
        group.add(knob, bar);
        const phase = (sa > 0 ? 0 : 0.8) + piece.idx * 0.37;
        piece.obstacles.push({
          kind: 'box', c: new THREE.Vector3(), ax: [new THREE.Vector3(), UP.clone(), new THREE.Vector3()], h: [FL / 2, 0.22, 0.16],
          yaw: null, w: 0,
          vel(p, out) { return out.set(this.w * (p.z - pivot.z), 0, -this.w * (p.x - pivot.x)); },
          update(time, dt) {
            const ph = (time + phase) % 1.6;
            // snap up fast, hold a moment, ease back down, rest
            const up = ph < 0.15 ? ph / 0.15 : ph < 0.45 ? 1 : ph < 0.95 ? 1 - (ph - 0.45) / 0.5 : 0;
            const th = 0.5 - up;    // +0.5 rests pointing back, -0.5 points forward
            const d = vecW(B, -sa * Math.cos(th), 0, -Math.sin(th)).normalize();
            const yaw = Math.atan2(d.x, d.z);
            if (dt && this.yaw !== null) {
              let dy = yaw - this.yaw;
              while (dy > Math.PI) dy -= Math.PI * 2;
              while (dy < -Math.PI) dy += Math.PI * 2;
              this.w = dy / dt;
            }
            this.yaw = yaw;
            this.ax[0].copy(d);
            this.ax[2].crossVectors(d, UP).normalize();
            this.c.copy(pivot).addScaledVector(d, FL / 2);
            placeBox(bar, this.c, d, UP, this.ax[2], FL, 0.44, 0.32);
          },
        });
      }
    },

    // a big fan at the side that blows in gusts across the track
    fan(piece, group, ghostMat) {
      const B = piece.B;
      const side = piece.idx % 2 ? 1 : -1;
      const rig = new THREE.Group();
      rig.position.copy(toW(B, side * (HW + 0.7), 1.2, 0));
      rig.quaternion.copy(quatOf(B));
      const ring = new THREE.Mesh(GEO.torus, ghostMat || MAT.dark);
      ring.scale.set(1.15, 1.15, 3);
      ring.rotation.y = Math.PI / 2;
      const hub = new THREE.Mesh(GEO.sphere, ghostMat || MAT.yellow);
      hub.scale.setScalar(0.22);
      const blades = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const arm = new THREE.Group();
        arm.rotation.x = k * Math.PI / 2;
        const bl = new THREE.Mesh(GEO.box, ghostMat || MAT.white);
        bl.position.y = 0.55; bl.scale.set(0.06, 0.95, 0.38); bl.rotation.y = 0.35;
        arm.add(bl);
        blades.add(arm);
      }
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
      post.scale.set(0.12, 1.45, 0.12); post.position.y = -0.72;
      rig.add(ring, hub, blades, post);
      group.add(rig);
      // see-through streaks show the wind
      const streaks = [];
      if (!ghostMat) for (let k = 0; k < 5; k++) {
        const st = new THREE.Mesh(GEO.box, MAT.wind);
        st.scale.set(1.2, 0.05, 0.05);
        group.add(st);
        streaks.push({ st, b: -3 + k * 1.5, y: 0.3 + (k % 3) * 0.35, off: k * 0.37 });
      }
      piece.wind = { dir: vecW(B, -side, 0, 0), k: 1 };
      let spin = 0;
      piece.obstacles.push({
        off: true,
        update(time, dt) {
          const on = (time + piece.idx * 0.9) % 4.5 < 3;
          piece.wind.k += ((on ? 1 : 0) - piece.wind.k) * Math.min(1, (dt || 1) * 4);
          spin += (dt || 0) * (3 + 22 * piece.wind.k);
          blades.rotation.x = spin;
          for (const s of streaks) {
            const u = (time * 1.6 + s.off) % 1;
            s.st.position.copy(toW(B, side * (HW - 0.3 - u * (2 * HW - 0.6)), s.y, s.b));
            s.st.quaternion.copy(quatOf(B));
            s.st.visible = piece.wind.k > 0.4;
          }
        },
      });
    },

    // a plank on a pivot: it rests with the near end down, and tips once you're past the middle
    seesaw(piece, group, ghostMat) {
      const B = piece.B;
      // raised end stays low enough that nothing can roll underneath it -- you wait, or hop up
      const PY = 0.255, TH = Math.asin(0.375 / SEE_L);
      const pivot = toW(B, 0, PY, 0);
      const right = vecW(B, 1, 0, 0);
      for (const sa of [-1, 1]) {
        const stand = new THREE.Mesh(GEO.box, ghostMat || MAT.dark);
        stand.position.copy(toW(B, sa * (HW - 0.2), (PY - 0.3) / 2, 0));
        stand.scale.set(0.25, PY + 0.3, 0.5);
        group.add(stand);
      }
      const axle = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
      axle.position.copy(pivot);
      axle.quaternion.setFromUnitVectors(UP, right);
      axle.scale.set(0.16, HW * 2 - 0.2, 0.16);
      const plank = new THREE.Mesh(GEO.box, ghostMat || MAT.seesaw);
      plank.castShadow = !ghostMat;
      group.add(axle, plank);
      let ang = TH, rate = 0;
      const omega = new THREE.Vector3(), rel = new THREE.Vector3();
      piece.obstacles.push({
        kind: 'box', floor: true, c: pivot.clone(), ax: [right.clone(), new THREE.Vector3(), new THREE.Vector3()], h: [HW, 0.12, SEE_L],
        vel(p, out) { omega.copy(right).multiplyScalar(rate); rel.subVectors(p, pivot); return out.crossVectors(omega, rel); },
        update(time, dt) {
          // which way do the marbles on it make it lean?
          let lean = 0;
          if (mode === 'race') for (const m of marbles) {
            if (!m.mesh.visible) continue;
            const dx = m.pos.x - B.cx, dz = m.pos.z - B.cz, dy = m.pos.y - B.y0;
            const a = dx * B.rx + dz * B.rz, b = dx * B.fx + dz * B.fz;
            if (Math.abs(a) < HW && Math.abs(b) < SEE_L && dy > -0.5 && dy < 2) lean += b;
          }
          const want = lean > 0.2 ? -TH : TH;
          const prev = ang;
          ang += Math.max(-2.2 * (dt || 0), Math.min(2.2 * (dt || 0), want - ang));
          rate = dt ? (ang - prev) / dt : 0;
          vecW(B, 0, Math.sin(ang), Math.cos(ang), this.ax[2]);
          vecW(B, 0, Math.cos(ang), -Math.sin(ang), this.ax[1]);
          placeBox(plank, this.c, this.ax[0], this.ax[1], this.ax[2], HW * 2 - 0.06, 0.24, SEE_L * 2);
        },
      });
    },

    // a floor of tiles that wobble, then drop, a moment after something rolls on them
    tiles(piece, group, ghostMat) {
      const B = piece.B;
      const NA = 3, NB = 5, TW = 2 * HW / NA, TL = 2 * S / NB;
      for (let i = 0; i < NA; i++) for (let j = 0; j < NB; j++) {
        const a = -HW + TW * (i + 0.5), b = -S / 2 + TL * (j + 0.5);
        const mesh = new THREE.Mesh(GEO.box, ghostMat || ((i + j) % 2 ? MAT.tileA : MAT.tileB));
        mesh.castShadow = mesh.receiveShadow = !ghostMat;
        group.add(mesh);
        mesh.quaternion.copy(quatOf(B));
        mesh.scale.set(TW - 0.08, 0.3, TL - 0.08);
        piece.obstacles.push({
          kind: 'box', floor: true, tile: true, c: new THREE.Vector3(), ax: [vecW(B, 1, 0, 0), UP.clone(), vecW(B, 0, 0, 1)],
          h: [TW / 2 - 0.04, 0.15, TL / 2 - 0.04], st: 'idle', t: 0, y: 0, vy: 0, touched: false,
          vel(p, out) { return out.set(0, this.vy, 0); },
          update(time, dt) {
            dt = dt || 0;
            if (this.st === 'idle' && this.touched) { this.st = 'shake'; this.t = 0.6; }
            this.touched = false;
            this.t -= dt;
            if (this.st === 'shake' && this.t <= 0) { this.st = 'fall'; this.vy = 0; }
            if (this.st === 'fall') {
              this.vy -= 18 * dt; this.y += this.vy * dt;
              if (this.y < -6) { this.st = 'gone'; this.t = 1.6; this.vy = 0; }
            }
            if (this.st === 'gone' && this.t <= 0) this.st = 'rise';
            if (this.st === 'rise') {
              this.y = Math.min(0, this.y + dt * 10); this.vy = 10;
              if (this.y >= 0) { this.st = 'idle'; this.vy = 0; }
            }
            this.off = this.st === 'gone' || (this.st === 'fall' && this.y < -0.6) || (this.st === 'rise' && this.y < -0.4);
            const wob = this.st === 'shake' ? Math.sin(time * 60) * 0.06 : 0;
            toW(B, a + wob, -0.15 + this.y, b, this.c);
            mesh.position.copy(this.c);
            mesh.visible = this.st !== 'gone';
          },
        });
      }
    },

    portal(piece, group, ghostMat) {
      const B = piece.B;
      const q = quatOf(B);
      const arch = new THREE.Mesh(GEO.arch, ghostMat || PORTAL_LOOK.idle.ring);
      arch.scale.set(HW + 0.3, HW + 0.3, 3);
      arch.position.copy(toW(B, 0, 0, 0));
      arch.quaternion.copy(q);
      arch.castShadow = !ghostMat;
      const door = new THREE.Mesh(GEO.halfDisc, ghostMat || PORTAL_LOOK.idle.door);
      door.scale.setScalar(HW + 0.25);
      door.position.copy(arch.position);
      door.quaternion.copy(q);
      group.add(arch, door);
      piece.portalArch = arch;
      piece.portalDoor = door;
    },
    hammer(piece, group, ghostMat) {
      const B = piece.B;
      const PIV = 5.2, ARM = 4.7, AMP = 0.72, SPD = 1.5, phase = piece.idx * 1.3;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
        post.scale.set(0.12, PIV + 0.3, 0.12);
        post.position.copy(toW(B, sa * (HW + 0.3), (PIV + 0.3) / 2, sb * 1.4));
        group.add(post);
      }
      const axle = new THREE.Mesh(GEO.box, ghostMat || MAT.dark);
      placeBox(axle, toW(B, 0, PIV, 0), vecW(B, 1, 0, 0), UP, null, 0.18, 0.18, 2.9);
      group.add(axle);
      for (const sb of [-1, 1]) {
        const beam = new THREE.Mesh(GEO.box, ghostMat || MAT.dark);
        placeBox(beam, toW(B, 0, PIV + 0.3, sb * 1.4), vecW(B, 1, 0, 0), UP, null, HW * 2 + 0.8, 0.16, 0.16);
        group.add(beam);
      }
      const arm = new THREE.Mesh(GEO.box, ghostMat || MAT.white);
      const head = new THREE.Mesh(GEO.cyl, ghostMat || MAT.yellow);
      arm.castShadow = head.castShadow = !ghostMat;
      group.add(arm, head);
      const pivot = toW(B, 0, PIV, 0);
      const headV = new THREE.Vector3();
      const along = vecW(B, 0, 0, 1);
      piece.obstacles.push({
        kind: 'capsule', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.6,
        vel: (p, o) => o.copy(headV),
        update(time) {
          const th = Math.sin(time * SPD + phase) * AMP;
          const thd = Math.cos(time * SPD + phase) * AMP * SPD;
          const hc = toW(B, ARM * Math.sin(th), PIV - ARM * Math.cos(th), 0);
          vecW(B, ARM * thd * Math.cos(th), ARM * thd * Math.sin(th), 0, headV);
          this.a.copy(hc).addScaledVector(along, -0.8);
          this.b.copy(hc).addScaledVector(along, 0.8);
          const down = hc.clone().sub(pivot).normalize();
          const side = new THREE.Vector3().crossVectors(down, along).normalize();
          placeBox(arm, pivot.clone().lerp(hc, 0.5), side, down, along, 0.14, ARM, 0.14);
          // the hammer head is a cylinder lying along the track
          head.position.copy(hc);
          head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, along, down.clone().negate()));
          head.scale.set(0.6, 1.6, 0.6);
        },
      });
    },
  };


  const signMats = {};
  function signMat(txt, col) {
    if (!signMats[txt]) signMats[txt] = new THREE.MeshStandardMaterial({ roughness: 0.6, map: canvasTexture(128, 48, (g) => {
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, 128, 48);
      g.fillStyle = col; g.fillRect(4, 4, 120, 40);
      g.fillStyle = '#10142a'; g.font = 'bold 30px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(txt, 64, 26);
    }) });
    return signMats[txt];
  }

  const portalMat = (c, op) => ({
    ring: new THREE.MeshStandardMaterial({ color: c, emissive: c, emissiveIntensity: 0.6, roughness: 0.3 }),
    door: new THREE.MeshBasicMaterial({ map: TEX.portal, color: c, transparent: true, opacity: op, side: THREE.DoubleSide, depthWrite: false }),
  });
  const PORTAL_LOOK = { in: portalMat(0xa070ff, 0.85), out: portalMat(0xff9a30, 0.85), idle: portalMat(0x8a8aa0, 0.3) };
  // Portals pair up in order: 1st -> 2nd, 3rd -> 4th. A last one on its own stays grey.
  function pairPortals(list) {
    const ps = list.filter((pc) => pc.pl.type === 'portal');
    ps.forEach((pc, i) => {
      const role = i % 2 ? 'out' : ps[i + 1] ? 'in' : 'idle';
      pc.portalTo = role === 'in' ? ps[i + 1] : null;
      pc.portalArch.material = PORTAL_LOOK[role].ring;
      pc.portalDoor.material = PORTAL_LOOK[role].door;
    });
    return ps.filter((pc) => pc.portalTo);
  }

  // What a bumper looks like in each world (it always bumps the same).
  function bumperLook(ghostMat, i) {
    const g = new THREE.Group();
    const add = (geo, mat, x, y, z, sx, sy, sz) => {
      const m = new THREE.Mesh(geo, ghostMat || mat);
      m.position.set(x, y, z);
      m.scale.set(sx, sy, sz);
      m.castShadow = !ghostMat;
      g.add(m);
      return m;
    };
    const id = ghostMat ? 'park' : world.id;
    if (id === 'west') {
      // a little cactus
      add(GEO.cyl, MAT.cactus, 0, 0.6, 0, 0.42, 1.2, 0.42);
      add(GEO.sphere, MAT.cactus, 0, 1.2, 0, 0.42, 0.42, 0.42);
      add(GEO.cyl, MAT.cactus, -0.55, 0.85, 0, 0.14, 0.5, 0.14);
      add(GEO.cyl, MAT.cactus, -0.38, 0.62, 0, 0.3, 0.14, 0.14);
      add(GEO.cyl, MAT.cactus, 0.55, 0.65, 0, 0.14, 0.45, 0.14);
      add(GEO.cyl, MAT.cactus, 0.38, 0.45, 0, 0.3, 0.14, 0.14);
    } else if (id === 'toys') {
      // a rubber duck looking back up the track
      add(GEO.sphere, MAT.duck, 0, 0.42, 0, 0.5, 0.4, 0.58);
      add(GEO.sphere, MAT.duck, 0, 0.95, -0.22, 0.3, 0.3, 0.3);
      add(GEO.box, MAT.beak, 0, 0.9, -0.55, 0.24, 0.08, 0.22);
      for (const s of [-1, 1]) add(GEO.sphere, MAT.black, s * 0.14, 1.04, -0.47, 0.05, 0.05, 0.05);
    } else if (id === 'space') {
      // a tiny ringed planet
      add(GEO.sphere, PLANET_MATS[i % PLANET_MATS.length], 0, 0.55, 0, 0.5, 0.5, 0.5);
      add(GEO.torus, MAT.yellow, 0, 0.55, 0, 0.78, 0.78, 1.5).rotation.set(Math.PI / 2 - 0.4, 0, 0);
    } else {
      add(GEO.cyl, MAT.red, 0, 0.35, 0, 0.45, 0.7, 0.45);
      add(GEO.cyl, MAT.white, 0, 0.74, 0, 0.3, 0.08, 0.3);
    }
    return g;
  }

  // ---------- Building the 3D track ----------
  let lay = layout(save.track);
  save.track = lay.pieces.slice(1).map((p) => p.type);
  let trackGroup = null;
  let pieces = [];          // built pieces (the whole run, including START, and FINISH while racing)
  let path = [];            // AI path points along the whole run
  let portals = [];         // portal pieces that send you on to another one
  let cannons = [];         // cannon pieces
  let ghostGroup = null;
  let ghostOk = true;
  let shownLay = lay;       // the layout on screen (builder, a story level, or the race)

  function disposeGroup(g) {
    if (!g) return;
    scene.remove(g);
    g.traverse((o) => {
      if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
    });
  }

  // which world is showing: a story level's own, otherwise the one picked in the builder
  function worldNow() {
    if (mode === 'levels') return LEVELS[levelSel - 1].world;   // (25 levels, 9 to a row)
    if (mode === 'race' && raceKind === 'story') return LEVELS[storyLevel - 1].world;
    return save.world;
  }

  function rebuildTrack(withFinish, useLay) {
    setWorld(worldNow());
    disposeGroup(trackGroup);
    trackGroup = new THREE.Group();
    shownLay = useLay || lay;
    const pls = shownLay.pieces.slice();
    if (withFinish) pls.push(Object.assign({ type: 'finish' }, shownLay.next));
    pieces = pls.map((pl, i) => buildPiece(pl, i, trackGroup));
    portals = pairPortals(pieces);
    cannons = pieces.filter((pc) => pc.cannon);
    hideDecorOnTrack(pls.concat([Object.assign({ type: 'finish' }, shownLay.next)]));
    scene.add(trackGroup);
    path = [];
    pieces.forEach((pc) => pc.frames.slice(0, -1).forEach((f) => path.push(Object.assign({ piece: pc }, f))));
    const endPc = pieces[pieces.length - 1];
    path.push(Object.assign({ piece: endPc }, endPc.frames[endPc.frames.length - 1]));
    rebuildGhost();
  }

  function rebuildGhost() {
    disposeGroup(ghostGroup);
    ghostGroup = null;
    if (mode !== 'build') return;
    const type = PALETTE[sel];
    ghostOk = canAdd(lay, type);
    const pl = Object.assign({ type }, lay.next);
    ghostGroup = new THREE.Group();
    const gp = buildPiece(pl, 99, ghostGroup, ghostOk ? MAT.ghostOk : MAT.ghostBad);
    gp.obstacles.forEach((o) => o.update(0, 0));
    scene.add(ghostGroup);
  }

  // ---------- Marbles ----------
  // swirl stripes across a 2:1 picture (it wraps round the sphere)
  function swirls(g, w, lineW, colorAt) {
    g.lineWidth = lineW;
    for (let i = -1; i < 4; i++) {
      g.strokeStyle = colorAt(i);
      g.beginPath();
      for (let x = 0; x <= w; x += 4) {
        const y = i * 18 + 10 + Math.sin(x / w * Math.PI * 4) * 8 + x * 0.1;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  const marbleTexCache = {};
  function marbleTex(spec) {
    if (marbleTexCache[spec.id || spec.name]) return marbleTexCache[spec.id || spec.name];
    const tex = !spec.kind ? marbleTexture(spec.color, spec.stripe) : canvasTexture(128, 64, (g, w, h) => {
      if (spec.kind === 'rainbow') {
        const hues = [0, 30, 55, 120, 190, 230, 275, 320];
        for (let i = 0; i < 8; i++) { g.fillStyle = 'hsl(' + hues[i] + ',95%,58%)'; g.fillRect(0, i * 8, w, 8); }
        swirls(g, w, 5, () => 'rgba(255,255,255,0.55)');
      } else if (spec.kind === 'galaxy') {
        g.fillStyle = '#0b0a2a'; g.fillRect(0, 0, w, h);
        for (const [x, y, r, c] of [[30, 24, 26, 'rgba(150,60,255,0.55)'], [90, 40, 30, 'rgba(40,120,255,0.5)'], [64, 12, 18, 'rgba(255,80,200,0.4)']]) {
          const gr = g.createRadialGradient(x, y, 0, x, y, r);
          gr.addColorStop(0, c); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(0, 0, w, h);
        }
        g.fillStyle = '#ffffff';
        for (let i = 0; i < 70; i++) { const sz = i % 9 ? 1 : 2; g.fillRect((i * 37) % w, (i * 23 + (i >> 2) * 7) % h, sz, sz); }
      } else if (spec.kind === 'lava') {
        g.fillStyle = '#2a0600'; g.fillRect(0, 0, w, h);
        g.shadowColor = '#ff8a00'; g.shadowBlur = 6;
        swirls(g, w, 4, (i) => i % 2 ? '#ff5a1f' : '#ffc02e');
      } else if (spec.kind === 'gold') {
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#8a6100'); gr.addColorStop(0.5, '#ffe27a'); gr.addColorStop(1, '#b8860b');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        swirls(g, w, 3, () => 'rgba(255,250,220,0.6)');
      } else if (spec.kind === 'shiny') {
        // candy-apple red with bright glints -- the material makes it glossy
        const gr = g.createLinearGradient(0, 0, 0, h);
        gr.addColorStop(0, '#7a0008'); gr.addColorStop(0.45, '#ff2a3a'); gr.addColorStop(1, '#a3000f');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = 'rgba(255,255,255,0.9)';
        for (const [x, y, r] of [[28, 18, 7], [92, 42, 7], [60, 30, 3], [118, 14, 3]]) {
          g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
      }
    });
    return (marbleTexCache[spec.id || spec.name] = tex);
  }

  function marbleTexture(color, stripe) {
    return canvasTexture(128, 64, (g, w, h) => {
      g.fillStyle = color; g.fillRect(0, 0, w, h);
      g.strokeStyle = stripe; g.lineWidth = 7;
      for (let i = -1; i < 4; i++) {
        g.beginPath();
        for (let x = 0; x <= w; x += 4) {
          const y = i * 18 + 10 + Math.sin(x / w * Math.PI * 4) * 8 + x * 0.1;
          if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
        }
        g.stroke();
      }
      g.fillStyle = '#ffffff';
      g.globalAlpha = 0.85;
      g.beginPath(); g.arc(30, 20, 6, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.arc(94, 44, 6, 0, Math.PI * 2); g.fill();
    });
  }

  const marbles = RACERS.map((rc, i) => {
    const mesh = new THREE.Mesh(GEO.marble, new THREE.MeshStandardMaterial({
      map: marbleTex(rc), roughness: 0.2, metalness: 0.15 }));
    mesh.castShadow = true;
    mesh.visible = false;
    scene.add(mesh);
    return {
      i, rc, mesh, ai: i > 0,
      pos: new THREE.Vector3(), vel: new THREE.Vector3(),
      grounded: false, groundN: new THREE.Vector3(0, 1, 0), airTime: 0,
      pieceIdx: 0, t: 0, checkpoint: 0, pathIdx: 0,
      finished: false, finishTime: 0, ghost: 0, stuck: 0, lane: 0, laneTimer: 0,
      input: new THREE.Vector3(), jump: false,
    };
  });
  const player = marbles[0];

  const marbleSpec = (id) => MARBLES.find((mb) => mb.id === id) || MARBLES[0];
  const unlocked = (mb) => !mb.unlock || save.story.done >= mb.unlock;
  function playerName() {
    return (window.MickleScores && MickleScores.player()) || save.name || 'YOU';
  }
  // dress the player's marble in the chosen skin
  function applyMarble() {
    const spec = marbleSpec(save.marble);
    const mat = player.mesh.material;
    mat.map = marbleTex(spec);
    mat.metalness = spec.kind === 'gold' ? 0.85 : spec.kind === 'shiny' ? 0.6 : 0.15;
    mat.roughness = spec.kind === 'gold' ? 0.25 : spec.kind === 'shiny' ? 0.08 : 0.2;
    mat.emissiveMap = spec.kind === 'lava' || spec.kind === 'galaxy' ? mat.map : null;
    mat.emissive.set(spec.kind === 'lava' ? 0x995522 : spec.kind === 'galaxy' ? 0x333355 : 0x000000);
    mat.needsUpdate = true;
    player.rc = Object.assign({}, RACERS[0], { name: playerName(), color: spec.dot });
  }
  applyMarble();
  const SPAWNS = [[-0.75, -2], [0.75, -2], [-2.2, -2], [2.2, -2]];

  // ---------- Collision ----------
  const tmpQ = new THREE.Vector3(), tmpN = new THREE.Vector3(), tmpV = new THREE.Vector3(), tmpD = new THREE.Vector3();

  // Push the marble out along n by pen and bounce it off a surface moving at sv.
  function resolve(m, n, pen, sv, bounce, kick) {
    m.pos.addScaledVector(n, pen);
    tmpV.copy(m.vel).sub(sv);
    const vn = tmpV.dot(n);
    if (vn < 0) tmpV.addScaledVector(n, -vn * (1 + bounce));
    if (kick) {
      const vn2 = tmpV.dot(n);
      if (vn2 < kick) tmpV.addScaledVector(n, kick - vn2);
    }
    m.vel.copy(tmpV).add(sv);
    if (n.y > 0.55) {
      m.grounded = true;
      m.groundN.copy(n);
    }
  }

  function collideStatic(m, piece) {
    for (const tri of piece.tris) {
      tri.closestPointToPoint(m.pos, tmpQ);
      tmpN.subVectors(m.pos, tmpQ);
      const d2 = tmpN.lengthSq();
      if (d2 >= R * R || d2 < 1e-10) continue;
      const d = Math.sqrt(d2);
      tmpN.multiplyScalar(1 / d);
      resolve(m, tmpN, R - d, ZERO, 0.15, 0);
      if (tmpN.y > 0.55) { m.lastPiece = piece.idx; m.groundPiece = piece; }
    }
  }
  const ZERO = new THREE.Vector3();

  function collideObstacle(m, o) {
    if (o.off) return;
    let hit = false;
    if (o.kind === 'box') {
      tmpD.subVectors(m.pos, o.c);
      const l = [tmpD.dot(o.ax[0]), tmpD.dot(o.ax[1]), tmpD.dot(o.ax[2])];
      const inside = Math.abs(l[0]) <= o.h[0] && Math.abs(l[1]) <= o.h[1] && Math.abs(l[2]) <= o.h[2];
      if (inside) {
        let best = 0, bestPen = Infinity;
        for (let k = 0; k < 3; k++) { const p = o.h[k] - Math.abs(l[k]); if (p < bestPen) { bestPen = p; best = k; } }
        tmpN.copy(o.ax[best]).multiplyScalar(Math.sign(l[best]) || 1);
        o.vel(m.pos, tmpV);
        resolve(m, tmpN, bestPen + R, tmpV.clone(), o.floor ? 0.1 : 0.5, 0);
        hit = true;
      } else {
        tmpQ.copy(o.c);
        for (let k = 0; k < 3; k++) tmpQ.addScaledVector(o.ax[k], Math.max(-o.h[k], Math.min(o.h[k], l[k])));
        tmpN.subVectors(m.pos, tmpQ);
        const d2 = tmpN.lengthSq();
        if (d2 < R * R && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          tmpN.multiplyScalar(1 / d);
          o.vel(tmpQ, tmpV);
          resolve(m, tmpN, R - d, tmpV.clone(), o.floor ? 0.1 : 0.5, 0);
          hit = true;
        }
      }
      if (hit && o.floor) {
        if (tmpN.y > 0.55) { if (o.tile) o.touched = true; return; }
      }
    } else if (o.kind === 'capsule') {
      const seg = tmpD.subVectors(o.b, o.a);
      const t = Math.max(0, Math.min(1, tmpQ.subVectors(m.pos, o.a).dot(seg) / seg.lengthSq()));
      tmpQ.copy(o.a).addScaledVector(seg, t);
      tmpN.subVectors(m.pos, tmpQ);
      const d2 = tmpN.lengthSq(), rr = R + o.r;
      if (d2 < rr * rr && d2 > 1e-10) {
        const d = Math.sqrt(d2);
        tmpN.multiplyScalar(1 / d);
        o.vel(tmpQ, tmpV);
        resolve(m, tmpN, rr - d, tmpV.clone(), 0.6, 0);
        hit = true;
      }
    } else if (o.kind === 'cyl') {
      if (m.pos.y > o.y0 && m.pos.y < o.y1) {
        tmpN.set(m.pos.x - o.c.x, 0, m.pos.z - o.c.z);
        const d2 = tmpN.lengthSq(), rr = R + o.r;
        if (d2 < rr * rr && d2 > 1e-10) {
          const d = Math.sqrt(d2);
          tmpN.multiplyScalar(1 / d);
          resolve(m, tmpN, rr - d, ZERO, o.bumper ? 0.9 : 0.4, o.bumper ? 5 : 0);
          if (o.bumper) {
            // a little sideways spin on every boing, so nobody bounces straight back forever
            const side = Math.random() < 0.5 ? -1 : 1;
            m.vel.x += -tmpN.z * side * 2.5;
            m.vel.z += tmpN.x * side * 2.5;
            o.flash = 1;
            if (!m.ai || near(m)) sfxBoing();
          }
          hit = !o.bumper;
        }
      }
    }
    // obstacles shove, but never launch a marble into the sky
    if (hit && !o.floor) {
      if (m.vel.y > 3) m.vel.y = 3;
      if (o.kind !== 'cyl' && !m.ai && m.bonkCool <= 0) { sfxBonk(); m.bonkCool = 0.4; }
    }
  }
  const near = (m) => m.pos.distanceToSquared(player.pos) < 100;

  // Boost pads: over one, your speed down the piece jumps up (a launch pad sets it exactly).
  function applyPads(m, pc) {
    const B = pc.B;
    const dx = m.pos.x - B.cx, dz = m.pos.z - B.cz, dy = m.pos.y - B.y0;
    const a = dx * B.rx + dz * B.rz, b = dx * B.fx + dz * B.fz;
    for (const pd of pc.pads) {
      if (a < pd.a0 || a > pd.a1 || b < pd.b0 || b > pd.b1) continue;
      const dyF = dy - (pd.rise || 0) * (b - pd.b0) / (pd.b1 - pd.b0);   // height above the floor
      if (dyF > R + 0.6 || dyF < -0.5) continue;
      const fwd = m.vel.x * B.fx + m.vel.z * B.fz;
      // launches scale with the world's gravity, so they land in the same place everywhere
      const k = Math.sqrt(gravScale);
      if (pd.bounce) {
        if (m.vel.y > 2 || dy > R + 0.3) continue;
        const side = (m.vel.x * B.rx + m.vel.z * B.rz) * 0.5;
        m.vel.x += B.fx * (pd.speed * k - fwd) - B.rx * side;
        m.vel.z += B.fz * (pd.speed * k - fwd) - B.rz * side;
        m.vel.y = pd.bounce * k;
        m.grounded = false;
        m.airTime = COYOTE;
        pc.boing = 1;
        if (!m.ai || near(m)) sfxBoing();
        continue;
      }
      const want = pd.exact ? pd.speed * k : Math.max(pd.speed, fwd);
      // also calm any sideways drift, so the boost points you down the lane
      const side = (m.vel.x * B.rx + m.vel.z * B.rz) * 0.1;
      m.vel.x += B.fx * (want - fwd) - B.rx * side;
      m.vel.z += B.fz * (want - fwd) - B.rz * side;
      if (m.boostCool <= 0 && !pd.belt) {
        if (!m.ai || near(m)) sfxBoost();
        m.boostCool = 0.6;
      }
    }
  }

  function collideMarbles() {
    for (let i = 0; i < marbles.length; i++) for (let j = i + 1; j < marbles.length; j++) {
      const a = marbles[i], b = marbles[j];
      if (a.ghost > 0 || b.ghost > 0 || a.loaded || b.loaded) continue;
      tmpD.subVectors(b.pos, a.pos);
      const d2 = tmpD.lengthSq();
      if (d2 >= 4 * R * R || d2 < 1e-10) continue;
      const d = Math.sqrt(d2);
      tmpD.multiplyScalar(1 / d);
      const over = 2 * R - d;
      a.pos.addScaledVector(tmpD, -over / 2);
      b.pos.addScaledVector(tmpD, over / 2);
      const rel = tmpV.subVectors(a.vel, b.vel).dot(tmpD);
      if (rel > 0) {
        const imp = rel * 0.9;
        a.vel.addScaledVector(tmpD, -imp);
        b.vel.addScaledVector(tmpD, imp);
      }
    }
  }

  // ---------- Progress along the run ----------
  function updateProgress(m) {
    let best = Infinity, bestIdx = m.pieceIdx, bestT = m.t;
    for (let k = Math.max(0, m.pieceIdx - 1); k <= Math.min(pieces.length - 1, m.pieceIdx + 1); k++) {
      const fr = pieces[k].frames;
      for (let i = 0; i < fr.length; i++) {
        const d = fr[i].p.distanceToSquared(m.pos);
        if (d < best) { best = d; bestIdx = k; bestT = i / (fr.length - 1); }
      }
    }
    // don't let a marble that fell onto another part of the run jump far ahead
    if (best < 25) { m.pieceIdx = bestIdx; m.t = bestT; }
  }
  const progressOf = (m) => m.finished ? 1000 - m.finishTime : m.pieceIdx + m.t;

  function frameAt(m) {
    const fr = pieces[m.pieceIdx].frames;
    return fr[Math.min(fr.length - 2, Math.floor(m.t * (fr.length - 1)))];
  }

  // ---------- Story levels ----------
  // A small seeded random-number maker, so level 3 is always the same level 3.
  function mulberry32(a) {
    return () => {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const OBSTACLE_TYPES = OBSTACLE_ROW;
  const storyCache = {};
  function storyTrack(n) {
    if (storyCache[n]) return storyCache[n];
    const L = LEVELS[n - 1], rng = mulberry32(4242 + n * 977);
    const weights = { straight: 2, left: 2, right: 2, down: 3, up: 0.6, boost: 1, loop: 1, jump: 1,
      spiral: 0.8, tube: 0.8, trampoline: 0.7, portal: 0.5, ice: 0.8,
      corkscrew: 0.7, halfpipe: 0.8, conveyor: 0.5, flippers: 0.9, fan: 0.9, seesaw: 0.8, tiles: 0.8, plank: 0.7,
      fork: 0.7, cannon: 0.6,
      spinner: 1, gates: 1, bumpers: 1, hammer: 1 };
    const w = (t) => weights[t] * (t === L.feature ? 3 : 1);
    const portalsIn = (types) => types.filter((t) => t === 'portal').length;
    let best = [];
    for (let tries = 0; tries < 80; tries++) {
      const types = [];
      let l = layout(types);
      while (types.length < L.len) {
        const prev = types[types.length - 1];
        const ok = L.pieces.filter((t) => canAdd(l, t)
          // a gentle start, never two obstacles back to back, no double loops or jumps
          && !(OBSTACLE_TYPES.includes(t) && (!prev || OBSTACLE_TYPES.includes(prev)))
          && !(t === prev && (PIECES[t].len || PIECES[t].turn || t === 'portal')));
        if (!ok.length) break;
        let r = rng() * ok.reduce((sum, t) => sum + w(t), 0);
        types.push(ok.find((t) => (r -= w(t)) < 0) || ok[0]);
        l = layout(types);
      }
      // a portal level needs at least one pair, and nobody wants a portal with no partner
      if (portalsIn(types) % 2) types[types.lastIndexOf('portal')] = 'straight';
      const featured = !L.feature || (L.feature === 'portal' ? portalsIn(types) >= 2 : types.includes(L.feature));
      if (types.length === L.len && featured) { best = types; break; }
      if (types.length > best.length) best = types;
    }
    return (storyCache[n] = best);
  }
  const storyUnlocked = (n) => n <= Math.min(LEVELS.length, save.story.done + 1);

  // ---------- Race ----------
  let mode = 'menu';        // 'menu' | 'levels' | 'build' | 'race'
  let raceKind = 'custom';  // 'custom' (your own track) | 'story'
  let storyLevel = 1;
  let aiScale = 1;          // story levels slow the computer marbles down
  const storyEase = {};     // came last on a level? the computer marbles ease off a bit more
  let raceTime = 0;         // negative during the countdown
  let lastCount = 4;
  let obstacleTime = 0;
  let starsGot = 0;
  let results = null;       // set once the player crosses the line
  let resultsAt = 0;
  let finishOrder = [];

  function spawnAt(m, piece, a, b) {
    toW(piece.B, a, piece.shape.path(0).y + R + 0.02, b, m.pos);
    m.vel.set(0, 0, 0);
    m.pieceIdx = piece.idx; m.t = 0; m.checkpoint = piece.idx; m.lastPiece = piece.idx;
    m.pathIdx = Math.max(0, path.findIndex((pt) => pt.piece === piece));
  }

  const bestKey = () => raceKind === 'story' ? 'story' + storyLevel : save.track.join('.');

  function startRace() {
    setMode('race');
    rebuildTrack(true, raceKind === 'story' ? layout(storyTrack(storyLevel)) : lay);
    aiScale = raceKind === 'story' ? LEVELS[storyLevel - 1].ai * (1 - 0.06 * (storyEase[storyLevel] || 0)) : 1;
    applyMarble();
    raceTime = -3; lastCount = 4; obstacleTime = 0;
    starsGot = 0; results = null; finishOrder = [];
    marbles.forEach((m, i) => {
      spawnAt(m, pieces[0], SPAWNS[i][0], SPAWNS[i][1]);
      m.finished = false; m.ghost = 0; m.stuck = 0; m.mesh.visible = true;
      m.lane = (Math.random() - 0.5) * 2.6; m.laneTimer = 1 + Math.random() * 2;
      m.bonkCool = 0; m.boostCool = 0; m.airTime = 0; m.loaded = null;
    });
    camYaw = Math.atan2(pieces[0].frames[0].fwd.x, pieces[0].frames[0].fwd.z);
    snapCam = true;
    setHint();
  }

  function hideRace() {
    results = null;
    marbles.forEach((m) => { m.mesh.visible = false; });
  }
  function backToBuild() {
    hideRace();
    setMode('build');
    rebuildTrack(false);
  }
  function toMenu() {
    hideRace();
    setMode('menu');
    rebuildTrack(false);
  }
  function toLevels(pick) {
    hideRace();
    setMode('levels');
    if (pick) levelSel = pick;
    rebuildTrack(false, layout(storyTrack(levelSel)));
  }
  function leaveRace() {
    if (raceKind === 'story') toLevels(storyLevel); else backToBuild();
  }
  function startStory(n) {
    if (!storyUnlocked(n)) { sfxNope(); return; }
    unlockAudio();
    raceKind = 'story';
    storyLevel = n;
    startRace();
  }
  function setMode(m) {
    mode = m;
    nameBox.hidden = m !== 'menu';
    if (m !== 'menu') { nameBox.blur(); commitName(); }
    setHint();
  }

  function respawn(m) {
    const piece = pieces[Math.min(m.checkpoint, pieces.length - 1)];
    burst(m.pos.clone().setY(Math.max(m.pos.y, GROUND_Y + 0.3)), 0xffffff, 10);
    spawnAt(m, piece, m.ai ? m.lane * 0.4 : 0, -S / 2 + 0.9);
    m.checkpoint = piece.idx;
    m.ghost = 1.2;
    m.stuck = 0;
    if (!m.ai) { sfxPoof(); snapCam = true; }
  }

  function steerAI(m, dt) {
    m.input.set(0, 0, 0);
    m.jump = false;
    if (m.finished) return;
    // find the nearest path point a little behind to well ahead of the last one
    let best = Infinity, bi = m.pathIdx;
    for (let k = Math.max(0, m.pathIdx - 4); k < Math.min(path.length, m.pathIdx + 24); k++) {
      const d = path[k].p.distanceToSquared(m.pos);
      if (d < best) { best = d; bi = k; }
    }
    m.pathIdx = bi;
    // round the loop and through the air, just ride your momentum
    if (path[bi].ride || path[bi].coast) return;
    const look = Math.min(path.length - 1, bi + 4);
    const tgt = path[look];
    m.laneTimer -= dt;
    if (m.laneTimer < 0) { m.lane = (Math.random() - 0.5) * 2.6; m.laneTimer = 1.5 + Math.random() * 2.5; }
    let lane = m.lane;
    const pc = tgt.piece;
    if (pc.gapAt) {
      // aim for the gap in the next row of gates
      const along = tmpD.subVectors(m.pos, pc.frames[4].p).dot(pc.frames[4].fwd);
      lane = along < pc.gateRows[0] ? pc.gapAt[0] : along < pc.gateRows[1] ? pc.gapAt[1] : 0;
    }
    if (pc.pl.type === 'bumpers') lane = m.lane >= 0 ? 1.25 : -1.25;   // the clear line past the diamond
    else if (pc.pl.type === 'loop' || pc.pl.type === 'spiral') lane = 0;
    else if (pc.pl.type === 'portal') lane *= 0.5;
    else if (pc.pl.type === 'corkscrew' || pc.pl.type === 'plank' || pc.pl.type === 'flippers') lane = 0;
    else if (pc.pl.type === 'seesaw') lane *= 0.4;
    else if (pc.pl.type === 'fork') lane *= 0.4;
    else if (PIECES[pc.pl.type].turn) lane *= 0.4;
    const target = tmpQ.copy(tgt.p).addScaledVector(tgt.right, lane);
    const to = tmpN.subVectors(target, m.pos).setY(0);
    const dist = to.length() || 1;
    to.multiplyScalar(1 / dist);
    // slow down for bends
    const ahead = path[Math.min(path.length - 1, bi + 8)];
    const bend = tgt.fwd.dot(ahead.fwd);
    const vh = tmpV.copy(m.vel).setY(0);
    // never brake on a boost piece -- the loop and the jump need every bit of speed
    const top = m.rc.speed * aiScale;
    const speed = pc.pads.length ? Math.max(top, vh.length()) : top * (bend < 0.6 ? 0.7 : 1);
    const desired = to.multiplyScalar(speed);
    const dv = desired.sub(vh);
    const len = dv.length();
    if (len > 0) dv.multiplyScalar(Math.min(1, len / 2) / len);
    m.input.copy(dv).multiplyScalar(m.rc.accel * (0.5 + 0.5 * aiScale));
    // stuck behind something? hop, and after a while start the piece again
    if (raceTime > 0 && vh.length() < 0.6) m.stuck += dt; else m.stuck = Math.max(0, m.stuck - dt);
    if (m.stuck > 1.2 && m.grounded && Math.random() < 0.05) m.jump = true;
    if (m.stuck > 5) respawn(m);
  }

  function playerInput() {
    let ix = Pad360.axis(0) || Pad360.dx(), iy = Pad360.axis(1) || Pad360.dy();
    if (keys.ArrowLeft || keys.KeyA) ix -= 1;
    if (keys.ArrowRight || keys.KeyD) ix += 1;
    if (keys.ArrowUp || keys.KeyW) iy -= 1;
    if (keys.ArrowDown || keys.KeyS) iy += 1;
    if (touch.enabled()) { ix += touch.ax(); iy += touch.ay(); }
    if (drag.id !== null) { ix += drag.x; iy += drag.y; }
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    // up on the stick always means "along the track" (the way the camera looks)
    const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
    const rx = -fz, rz = fx;
    player.input.set(fx * -iy + rx * ix, 0, fz * -iy + rz * ix);
    player.jump = jumpQueued;
    jumpQueued = false;
  }

  function stepMarble(m, dt, near) {
    if (m.loaded) { cannonStep(m, dt); return; }
    const g = m.grounded;
    // on ice you can hardly steer, and nothing slows you down
    const icy = g && m.groundPiece && PIECES[m.groundPiece.pl.type].ice;
    m.airTime = g ? 0 : m.airTime + dt;
    m.vel.y -= GRAVITY * gravScale * dt;
    if (raceTime > 0 && !m.finished) {
      const ctrl = tmpV.copy(m.input).multiplyScalar(ACCEL * (icy ? 0.12 : g ? 1 : AIR_CONTROL));
      if (g) ctrl.projectOnPlane(m.groundN);
      // past top pushing speed, only pushes that slow you down still count
      const hs = Math.hypot(m.vel.x, m.vel.z);
      if (hs > PUSH_MAX && ctrl.dot(m.vel) > 0) ctrl.addScaledVector(m.vel, -ctrl.dot(m.vel) / m.vel.lengthSq());
      m.vel.addScaledVector(ctrl, dt);
      if (m.jump && m.airTime < COYOTE) {
        m.vel.y = Math.max(m.vel.y, 0) + JUMP_V * Math.sqrt(gravScale);
        m.airTime = COYOTE;
        m.jump = false;
        if (!m.ai) sfxJump();
      }
    }
    if (g && !icy) m.vel.multiplyScalar(1 - ROLL_DRAG * dt);
    if (m.finished && g) m.vel.multiplyScalar(1 - 1.5 * dt);
    const sp = m.vel.length();
    if (sp > MAX_SPEED) m.vel.multiplyScalar(MAX_SPEED / sp);
    m.pos.addScaledVector(m.vel, dt);
    m.grounded = false;
    m.groundPiece = null;
    for (const pc of near) {
      if (!pc.box.containsPoint(m.pos)) continue;
      collideStatic(m, pc);
      for (const o of pc.obstacles) collideObstacle(m, o);
      if (pc.pads.length) applyPads(m, pc);
      if (pc.wind && pc.wind.k > 0.05) applyWind(m, pc, dt);
    }
    for (const pc of cannons) if (tryLoad(m, pc)) break;
    m.portalCool = (m.portalCool || 0) - dt;
    if (m.portalCool <= 0) for (const pc of portals) if (tryPortal(m, pc)) break;
  }

  // Rolled into the cannon's mouth? It grabs you, waits a moment, then fires you over the gap.
  function tryLoad(m, pc) {
    const B = pc.B;
    const dx = m.pos.x - B.cx, dz = m.pos.z - B.cz, dy = m.pos.y - B.y0;
    const a = dx * B.rx + dz * B.rz, b = dx * B.fx + dz * B.fz;
    if (b < CAN_LOAD[0] || b > CAN_LOAD[1] || Math.abs(a) > HW || dy > 1.5 || dy < -0.3) return false;
    m.loaded = { pc, t: CAN_WAIT, a: Math.max(-2.2, Math.min(2.2, a)) };
    m.vel.set(0, 0, 0);
    if (!m.ai || near(m)) beep(220, 0.08, 'square', 0.08);
    return true;
  }
  function cannonStep(m, dt) {
    const L = m.loaded, B = L.pc.B;
    L.t -= dt;
    toW(B, L.a * 0.25, 0.9, 0.6, m.pos);   // tucked inside the barrel
    m.vel.set(0, 0, 0);
    if (L.t > 0) return;
    // BOOM -- same shot every time (scaled for the world's gravity), so you always land on the deck
    const k = Math.sqrt(gravScale);
    toW(B, L.a, CAN_MY, CAN_MB, m.pos);
    m.vel.set(B.fx * CAN_VF * k, CAN_VY * k, B.fz * CAN_VF * k);
    m.loaded = null;
    m.grounded = false;
    m.airTime = COYOTE;
    L.pc.cannon.recoil = 1;
    burst(m.pos.clone(), 0xdddddd, 14);
    burst(m.pos.clone(), 0xffa030, 8);
    if (!m.ai || near(m)) { sweep(160, 40, 0.45, 'sawtooth', 0.18); beep(90, 0.3, 'square', 0.12); }
  }

  // A fan's gust pushes marbles across its piece (a bit less than you can steer against).
  const WIND = 11;
  function applyWind(m, pc, dt) {
    const B = pc.B;
    const dx = m.pos.x - B.cx, dz = m.pos.z - B.cz, dy = m.pos.y - B.y0;
    const b = dx * B.fx + dz * B.fz;
    if (Math.abs(b) > S / 2 || dy < -0.5 || dy > 2.5) return;
    m.vel.addScaledVector(pc.wind.dir, WIND * pc.wind.k * dt);
  }

  // Rolled through a portal's doorway? Pop out of its partner, still going just as fast.
  function tryPortal(m, pc) {
    const B = pc.B;
    const dx = m.pos.x - B.cx, dz = m.pos.z - B.cz, dy = m.pos.y - B.y0;
    const a = dx * B.rx + dz * B.rz, b = dx * B.fx + dz * B.fz;
    if (b < 0 || b > 0.7 || Math.abs(a) > HW || dy < -0.3 || dy > HW) return false;
    const fwd = m.vel.x * B.fx + m.vel.z * B.fz, side = m.vel.x * B.rx + m.vel.z * B.rz;
    if (fwd <= 0) return false;
    const E = pc.portalTo, EB = E.B;
    burst(m.pos.clone(), 0xa070ff, 10);
    toW(EB, a, dy, 0.9, m.pos);
    const f2 = Math.max(fwd, 6);
    m.vel.set(EB.fx * f2 + EB.rx * side, m.vel.y, EB.fz * f2 + EB.rz * side);
    m.pieceIdx = E.idx; m.t = 0.55; m.lastPiece = E.idx;
    m.checkpoint = Math.max(m.checkpoint, E.idx);
    m.pathIdx = Math.max(0, path.findIndex((pt) => pt.piece === E)) + 4;
    m.portalCool = 0.4;
    burst(m.pos.clone(), 0xff9a30, 10);
    if (!m.ai) { snapCam = true; camYaw = Math.atan2(EB.fx, EB.fz); }
    if (!m.ai || near(m)) { sweep(300, 1400, 0.25, 'sine', 0.12); sweep(1400, 500, 0.2, 'triangle', 0.08, 0.2); }
    return true;
  }

  function updateRace(dt) {
    raceTime += dt;
    const count = Math.ceil(-raceTime);
    if (raceTime < 0 && count !== lastCount) { lastCount = count; sfxCount(false); }
    if (raceTime >= 0 && lastCount > 0) {
      lastCount = 0; sfxCount(true);
      pieces[0].gate.open = 0.001;
    }
    if (pieces[0].gate.open > 0) pieces[0].gate.open = Math.min(1, pieces[0].gate.open + dt * 4);

    if (!results) playerInput(); else { player.input.set(0, 0, 0); player.jump = false; }
    marbles.forEach((m) => { if (m.ai) steerAI(m, dt); });

    let acc = dt;
    while (acc > 1e-6) {
      const h = Math.min(STEP, acc);
      acc -= h;
      for (const m of marbles) stepMarble(m, h, pieces);
      collideMarbles();
    }

    for (const m of marbles) {
      m.ghost = Math.max(0, m.ghost - dt);
      m.bonkCool = (m.bonkCool || 0) - dt;
      m.boostCool -= dt;
      if (m.grounded && m.lastPiece !== undefined) m.checkpoint = Math.max(m.checkpoint, Math.min(m.lastPiece, pieces.length - 2));
      updateProgress(m);
      if (m.pos.y < GROUND_Y + R + 0.05 || m.pos.y < pieces[m.checkpoint].B.y0 - 20 ||
        (m.airTime > 1.6 && m.pos.y < pieces[m.checkpoint].B.y0 - 4)) respawn(m);
      if (!m.finished && m.pieceIdx === pieces.length - 1 && m.t >= 0.5 && raceTime > 0) {
        m.finished = true;
        m.finishTime = raceTime;
        finishOrder.push(m);
        if (m === player) playerFinished();
        else if (near(m)) beep(660, 0.1, 'triangle', 0.08);
      }
      // roll the marble's picture to match how far it moved
      const hv = tmpV.set(m.vel.x, 0, m.vel.z);
      const hl = hv.length();
      if (hl > 0.01) {
        tmpN.set(hv.z, 0, -hv.x).multiplyScalar(1 / hl);
        m.mesh.quaternion.premultiply(new THREE.Quaternion().setFromAxisAngle(tmpN, hl * dt / R));
      }
      m.mesh.position.copy(m.pos);
      m.mesh.visible = !m.loaded && (m.ghost <= 0 || Math.floor(m.ghost * 10) % 2 === 0);
    }

    // stars
    for (const pc of pieces) for (const st of pc.stars) {
      if (st.taken) continue;
      if (st.mesh.position.distanceToSquared(player.pos) < (R + 0.6) ** 2) {
        st.taken = true; st.mesh.visible = false; starsGot++;
        sfxStar(); burst(st.mesh.position, 0xffd400, 12);
      }
    }

    if (results && raceTime > resultsAt && !results.shown) results.shown = true;
  }

  function placeName(n) { return ['1st', '2nd', '3rd', '4th'][n] || ''; }

  function playerFinished() {
    sfxFinish();
    burst(player.pos, 0xff6b2c, 30);
    burst(player.pos, 0xffd400, 30);
    const place = finishOrder.indexOf(player);
    const nPieces = pieces.length - 2;
    const score = PLACE_POINTS[place] + starsGot * 50 + nPieces * 10;
    const key = bestKey();
    const prevBest = save.best[key];
    const newBest = !prevBest || player.finishTime < prevBest;
    if (newBest) save.best[key] = Math.round(player.finishTime * 100) / 100;
    // any finish completes a story level -- the place just decides the medal
    let unlock = null, firstClear = false;
    if (raceKind === 'story') {
      const n = storyLevel;
      firstClear = save.story.done < n;
      save.story.done = Math.max(save.story.done, n);
      const had = save.story.medals[n];
      save.story.medals[n] = had === undefined ? place : Math.min(had, place);
      if (place === 3) storyEase[n] = Math.min(3, (storyEase[n] || 0) + 1);
      if (firstClear) unlock = MARBLES.find((mb) => mb.unlock === n) || null;
    }
    writeSave();
    if (window.MickleScores) MickleScores.record('marble-rumble', score);
    results = { place, score, time: player.finishTime, stars: starsGot, nPieces, newBest, best: save.best[key],
      shown: false, unlock, firstClear };
    resultsAt = raceTime + 2;
  }

  // ---------- Particles ----------
  const PARTICLE_GEO = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  const particles = [];
  function burst(at, color, n) {
    const mat = new THREE.MeshBasicMaterial({ color });
    for (let i = 0; i < n; i++) {
      const p = new THREE.Mesh(PARTICLE_GEO, mat);
      p.position.copy(at);
      p.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 6 + 2, (Math.random() - 0.5) * 6), life: 0.8 + Math.random() * 0.5 };
      scene.add(p);
      particles.push(p);
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i], u = p.userData;
      u.life -= dt;
      u.v.y -= 14 * dt;
      p.position.addScaledVector(u.v, dt);
      p.rotation.x += dt * 8; p.rotation.y += dt * 6;
      if (u.life <= 0) { scene.remove(p); particles.splice(i, 1); }
    }
  }

  // ---------- Camera ----------
  let camYaw = 0, snapCam = true;
  let buildYaw = Math.PI * 0.25, buildYawTarget = Math.PI * 0.25;
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3();
  const wantPos = new THREE.Vector3(), wantLook = new THREE.Vector3();

  function updateCamera(dt) {
    if (mode !== 'race') {
      if (mode !== 'build') buildYawTarget += dt * 0.12;   // menus slowly turn round the track on show
      buildYaw += (buildYawTarget - buildYaw) * Math.min(1, dt * 6);
      const box = new THREE.Box3();
      shownLay.pieces.forEach((pl) => box.expandByPoint(new THREE.Vector3(pl.x * S, pl.level * LH, pl.z * S)));
      const end = new THREE.Vector3(shownLay.next.x * S, shownLay.next.level * LH, shownLay.next.z * S);
      box.expandByPoint(end);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      wantLook.copy(center).lerp(end, mode === 'build' ? 0.55 : 0);
      const dist = Math.max(30, Math.min(120, Math.max(size.x, size.z) * 0.9 + 16));
      wantPos.set(wantLook.x - Math.sin(buildYaw) * dist * 0.75, wantLook.y + dist * 0.75, wantLook.z - Math.cos(buildYaw) * dist * 0.75);
    } else {
      // chase: sit behind the player, turned the way the track runs
      const fr = frameAt(player);
      const want = Math.atan2(fr.fwd.x, fr.fwd.z);
      let d = want - camYaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      camYaw += d * Math.min(1, dt * 2.5);
      const fx = Math.sin(camYaw), fz = Math.cos(camYaw);
      wantPos.set(player.pos.x - fx * 6, player.pos.y + 3.4, player.pos.z - fz * 6);
      wantLook.set(player.pos.x + fx * 3, player.pos.y + 0.2, player.pos.z + fz * 3);
      // going round a loop, a chase camera would be stuck outside the ring -- watch from the side
      const pc = pieces[player.pieceIdx];
      if (fr.ride && pc.pl.type === 'loop') {
        toW(pc.B, 12, LOOP_R + 1.5, 10, wantPos);
        toW(pc.B, 0, LOOP_R, 10, wantLook);
      }
      // round the spiral, look down on it from above
      if (fr.coast && (pc.pl.type === 'spiral' || pc.pl.type === 'corkscrew')) {
        const turns = PIECES[pc.pl.type].turns || 1;
        toW(pc.B, 0, 9, SP_C - 5 - turns, wantPos);
        toW(pc.B, 0, -1.5 * turns, SP_C, wantLook);
      }
    }
    if (snapCam) { camPos.copy(wantPos); camLook.copy(wantLook); snapCam = false; }
    const k = Math.min(1, dt * (mode !== 'race' ? 4 : 7));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(camLook.x + 20, camLook.y + 50, camLook.z + 14);
    sun.target.position.copy(camLook);
  }

  // ---------- Builder actions ----------
  let sel = 0;
  let clearArmed = 0;
  let toast = '', toastT = 0;
  function say(msg, secs = 2) { toast = msg; toastT = secs; }

  function addPiece() {
    const type = PALETTE[sel];
    if (lay.pieces.length - 1 >= MAX_PIECES) { sfxNope(); say('THE RUN IS FULL! TIME TO RACE'); return; }
    if (!canAdd(lay, type)) {
      sfxNope();
      const def = PIECES[type];
      say(def.dl < 0 && lay.next.level + def.dl < 0 ? 'TOO LOW FOR THAT ONE -- IT GOES DOWN!' :
        def.dl > 0 && lay.next.level >= MAX_LEVEL ? 'TOO HIGH FOR THAT ONE -- IT GOES UP!' :
        def.len ? 'NEEDS ' + def.len + ' SPACES IN A ROW -- TRY ANOTHER PIECE' : 'NO ROOM THERE -- TRY ANOTHER PIECE');
      return;
    }
    save.track.push(type);
    lay = layout(save.track);
    writeSave();
    sfxPlace();
    const end = lay.pieces[lay.pieces.length - 1];
    rebuildTrack(false);
    burst(toW(basis(end), 0, 0.5, 0), PIECES[type].color, 10);
  }
  function undoPiece() {
    if (!save.track.length) { sfxNope(); return; }
    save.track.pop();
    lay = layout(save.track);
    writeSave();
    sfxUndo();
    rebuildTrack(false);
  }
  function clearTrack() {
    if (clearArmed <= 0) { clearArmed = 2.5; say('PRESS CLEAR AGAIN TO START OVER'); sfxSelect(); return; }
    clearArmed = 0;
    save.track = [];
    lay = layout(save.track);
    writeSave();
    sfxUndo();
    rebuildTrack(false);
  }
  function surpriseTrack() {
    const weights = { straight: 3, left: 2, right: 2, down: 4, up: 0.6, boost: 1, loop: 0.8, jump: 0.9,
      spiral: 0.8, tube: 0.7, trampoline: 0.7, portal: 0.6, ice: 0.8,
      corkscrew: 0.7, halfpipe: 0.8, conveyor: 0.5, flippers: 1, fan: 1, seesaw: 0.9, tiles: 0.9, plank: 0.7,
      fork: 0.7, cannon: 0.6,
      spinner: 1.2, gates: 1.2, bumpers: 1.2, hammer: 1.2 };
    let best = [];
    for (let tries = 0; tries < 12; tries++) {
      const types = [];
      let l = layout(types);
      for (let n = 0; n < 16; n++) {
        const ok = PALETTE.filter((t) => canAdd(l, t) && !(PIECES[t].turn && types.length && PIECES[types[types.length - 1]].turn === PIECES[t].turn && Math.random() < 0.6));
        if (!ok.length) break;
        let r = Math.random() * ok.reduce((s, t) => s + weights[t], 0);
        const pick = ok.find((t) => (r -= weights[t]) < 0) || ok[0];
        types.push(pick);
        l = layout(types);
      }
      if (types.length > best.length) best = types;
      if (best.length >= 14) break;
    }
    if (best.filter((t) => t === 'portal').length % 2) best[best.lastIndexOf('portal')] = 'straight';
    save.track = best;
    lay = layout(save.track);
    writeSave();
    [523, 659, 784].forEach((f, i) => beep(f, 0.08, 'square', 0.07, i * 0.06));
    rebuildTrack(false);
  }
  function pickWorld(d) {
    const i = WORLDS.findIndex((w) => w.id === save.world);
    save.world = WORLDS[(i + d + WORLDS.length) % WORLDS.length].id;
    writeSave();
    rebuildTrack(false);
    [440, 660].forEach((f, k) => beep(f, 0.07, 'square', 0.07, k * 0.06));
    say('WORLD: ' + world.name, 1.5);
  }
  function tryRace() {
    if (!save.track.length) { sfxNope(); say('ADD SOME PIECES FIRST!'); return; }
    unlockAudio();
    raceKind = 'custom';
    startRace();
  }

  // ---------- Menu and level picker ----------
  let menuFocus = 1;        // 0: marble row, 1: STORY MODE, 2: BUILD YOUR OWN
  let marbleSel = Math.max(0, MARBLES.findIndex((mb) => mb.id === save.marble));
  let levelSel = Math.min(LEVELS.length, save.story.done + 1);
  const nameBox = document.getElementById('nameBox');
  // the arcade keeps names to 10 letters (shared/scores.js), so the box does too --
  // what you type is exactly what shows on the scoreboards
  const NAME_MAX = 10;
  nameBox.maxLength = NAME_MAX;
  nameBox.value = playerName() === 'YOU' ? '' : playerName();
  let shownName = nameBox.value;   // what the box held when it was last filled in or saved
  function commitName() {
    const typed = nameBox.value;
    // nothing typed since? leave the player alone (another page may have picked someone else)
    if (typed === shownName) return;
    shownName = typed;
    const clean = window.MickleScores ? MickleScores.setPlayer(typed) : typed.toUpperCase().trim().slice(0, NAME_MAX);
    if (!clean) return;
    save.name = clean;
    nameBox.value = shownName = clean;
    writeSave();
    applyMarble();
  }
  nameBox.addEventListener('input', () => {
    const v = nameBox.value.toUpperCase().replace(/[^A-Z0-9 ]/g, '').slice(0, NAME_MAX);
    if (v !== nameBox.value) nameBox.value = v;
  });
  nameBox.addEventListener('change', commitName);
  nameBox.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') { nameBox.blur(); commitName(); sfxPlace(); }
  });
  // typed a name and then went back to the arcade or closed the tab? still keep it
  window.addEventListener('pagehide', () => { if (mode === 'menu') commitName(); });

  // Names saved in this browser (shared with the whole arcade), newest last, as tap-to-pick
  // chips under the name box.
  const NAME_CHIPS = 6;
  let nameSel = 0;
  function savedNames() {
    const all = window.MickleScores ? MickleScores.players() : (save.name ? [save.name] : []);
    return all.slice(-NAME_CHIPS);
  }
  function pickName(i) {
    const names = savedNames();
    if (!names.length) return;
    nameSel = (i + names.length) % names.length;
    nameBox.value = names[nameSel];
    commitName();
    sfxSelect();
  }

  function pickMarble(i) {
    marbleSel = (i + MARBLES.length) % MARBLES.length;
    const mb = MARBLES[marbleSel];
    if (unlocked(mb)) { save.marble = mb.id; writeSave(); applyMarble(); sfxSelect(); }
    else beep(300, 0.06, 'triangle', 0.06);
  }
  function pickLevel(n) {
    const next = Math.max(1, Math.min(LEVELS.length, n));
    if (next === levelSel) return;
    levelSel = next;
    sfxSelect();
    rebuildTrack(false, layout(storyTrack(levelSel)));
  }
  // menuFocus -1 is the row of saved names (only there when there are some)
  function menuMove(dx, dy) {
    if (dy < 0) menuFocus = menuFocus >= 1 ? 0 : savedNames().length ? -1 : 0;
    else if (dy > 0) menuFocus = menuFocus === -1 ? 0 : menuFocus === 0 ? 1 : menuFocus;
    else if (dx && menuFocus === -1) { pickName(nameSel + dx); return; }
    else if (dx && menuFocus === 0) { pickMarble(marbleSel + dx); return; }
    else if (dx) menuFocus = dx < 0 ? 1 : 2;
    if (menuFocus === -1) nameSel = Math.max(0, savedNames().indexOf(nameBox.value));
    sfxSelect();
  }
  function menuChoose() {
    if (menuFocus <= 0) menuFocus = 1;
    else if (menuFocus === 1) toLevels();
    else backToBuild();
    sfxPlace();
  }
  function selectPiece(i) {
    sel = (i + PALETTE.length) % PALETTE.length;
    sfxSelect();
    rebuildGhost();
  }

  // ---------- Input ----------
  const keys = {};
  let jumpQueued = false;
  const drag = { id: null, x0: 0, y0: 0, x: 0, y: 0, t0: 0 };

  // a tablet (Fire / Android / iPad, or any touch screen without a mouse) starts with the stick
  // and JUMP button showing, unless someone has already picked ON or OFF (same check as Kart 3D)
  const looksLikeTablet = /Android|Silk|KF[A-Z]{2,}|iPad|iPhone|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && !(window.matchMedia && matchMedia('(pointer: fine)').matches));
  const touch = MickleTouch.create({
    defaultOn: looksLikeTablet,
    toggleParent: document.getElementById('topbar'),
    buttons: [{ id: 'jump', label: 'JUMP' }],
    onPress(id) { unlockAudio(); if (id === 'jump' && mode === 'race') primary(); },
    onStep(dx) {
      if (mode === 'build') selectPiece(sel + dx);
      else if (mode === 'menu') menuMove(dx, 0);
      else if (mode === 'levels') pickLevel(levelSel + dx);
    },
  });

  // A / Space / tap-the-jump-button: place a piece, jump, or race again
  function primary() {
    if (mode === 'menu') menuChoose();
    else if (mode === 'levels') startStory(levelSel);
    else if (mode === 'build') addPiece();
    else if (results && results.shown) resultsPrimary();
    else if (raceTime > 0) jumpQueued = true;
  }
  // after a race: story goes on to the next level, your own track races again
  function resultsPrimary() {
    if (raceKind === 'story' && storyLevel < LEVELS.length) startStory(storyLevel + 1);
    else if (raceKind === 'story') toLevels(storyLevel);
    else startRace();
  }
  function back() {
    if (mode === 'race') leaveRace();
    else if (mode === 'levels') toMenu();
    else if (mode === 'build') undoPiece();
  }

  window.addEventListener('keydown', (e) => {
    unlockAudio();
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.code)) { keys[e.code] = true; return; }
    keys[e.code] = true;
    const c = e.code;
    if (mode === 'menu') {
      if (c === 'ArrowLeft' || c === 'KeyA') menuMove(-1, 0);
      else if (c === 'ArrowRight' || c === 'KeyD') menuMove(1, 0);
      else if (c === 'ArrowUp' || c === 'KeyW') menuMove(0, -1);
      else if (c === 'ArrowDown' || c === 'KeyS') menuMove(0, 1);
      else if (c === 'Space' || c === 'Enter') primary();
      else return;
    } else if (mode === 'levels') {
      if (c === 'ArrowLeft' || c === 'KeyA') pickLevel(levelSel - 1);
      else if (c === 'ArrowRight' || c === 'KeyD') pickLevel(levelSel + 1);
      else if (c === 'ArrowUp' || c === 'KeyW') pickLevel(levelSel - 9);
      else if (c === 'ArrowDown' || c === 'KeyS') pickLevel(levelSel + 9);
      else if (c === 'Space' || c === 'Enter') primary();
      else if (c === 'Escape' || c === 'Backspace' || c === 'KeyB') toMenu();
      else return;
    } else if (mode === 'build') {
      if (c === 'ArrowLeft' || c === 'KeyA') selectPiece(sel - 1);
      else if (c === 'ArrowRight' || c === 'KeyD') selectPiece(sel + 1);
      else if (c === 'Space' || c === 'Enter') primary();
      else if (c === 'Backspace' || c === 'Delete' || c === 'KeyZ') undoPiece();
      else if (c === 'KeyR' || c === 'KeyP') tryRace();
      else if (c === 'KeyQ') { buildYawTarget -= Math.PI / 2; sfxSelect(); }
      else if (c === 'KeyE') { buildYawTarget += Math.PI / 2; sfxSelect(); }
      else if (c === 'KeyS') surpriseTrack();
      else if (c === 'ArrowUp' || c === 'KeyW') pickWorld(-1);
      else if (c === 'ArrowDown' || c === 'KeyT') pickWorld(1);
      else if (c === 'Escape') toMenu();
      else return;
    } else {
      if (c === 'Space' || c === 'Enter') primary();
      else if (c === 'Escape' || c === 'Backspace' || c === 'KeyB') leaveRace();
      else if (c === 'KeyR' && results && results.shown) startRace();
      else if (!c.startsWith('Arrow')) return;
    }
    e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.code] = false; });
  window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

  function hudPoint(e) {
    const r = hud.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  let hudButtons = [];
  stage.addEventListener('pointerdown', (e) => {
    unlockAudio();
    if (e.target === nameBox) return;
    if (document.activeElement === nameBox) nameBox.blur();
    const p = hudPoint(e);
    const btn = hudButtons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (btn) { btn.fn(); e.preventDefault(); return; }
    if (mode === 'race' && !results) {
      // no on-screen controls? drag anywhere to roll, quick tap to jump
      drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.x = drag.y = 0; drag.t0 = performance.now();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    }
  });
  stage.addEventListener('pointermove', (e) => {
    if (e.pointerId !== drag.id) return;
    const r = stage.getBoundingClientRect(), scale = r.width / 8;
    drag.x = Math.max(-1, Math.min(1, (e.clientX - drag.x0) / scale));
    drag.y = Math.max(-1, Math.min(1, (e.clientY - drag.y0) / scale));
  });
  const endDrag = (e) => {
    if (e.pointerId !== drag.id) return;
    if (performance.now() - drag.t0 < 220 && Math.hypot(drag.x, drag.y) < 0.25) primary();
    drag.id = null; drag.x = drag.y = 0;
  };
  stage.addEventListener('pointerup', endDrag);
  stage.addEventListener('pointercancel', endDrag);
  document.addEventListener('pointerdown', (e) => {
    // taps outside the game (but not on links) count as the main button too
    if (mode !== 'race' || e.target.closest('a, button, #stage, .mt-layer')) return;
    unlockAudio();
    primary();
  });

  function pollPad() {
    Pad360.poll();
    const B = Pad360.BTN;
    if (mode === 'menu') {
      const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
      if (dx || dy) menuMove(dx, dy);
      if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) primary();
    } else if (mode === 'levels') {
      const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
      if (dx || dy) pickLevel(levelSel + dx + dy * 9);
      if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) primary();
      if (Pad360.pressed(B.B) || Pad360.pressed(B.BACK)) toMenu();
    } else if (mode === 'build') {
      const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
      if (dx) selectPiece(sel + dx);
      if (dy) pickWorld(dy);
      if (Pad360.pressed(B.A)) primary();
      if (Pad360.pressed(B.B)) undoPiece();
      if (Pad360.pressed(B.X)) surpriseTrack();
      if (Pad360.pressed(B.Y) || Pad360.pressed(B.START)) tryRace();
      if (Pad360.pressed(B.LB)) { buildYawTarget -= Math.PI / 2; sfxSelect(); }
      if (Pad360.pressed(B.RB)) { buildYawTarget += Math.PI / 2; sfxSelect(); }
      if (Pad360.pressed(B.BACK)) toMenu();
    } else {
      if (Pad360.pressed(B.A) || (results && results.shown && Pad360.pressed(B.START))) primary();
      if (Pad360.pressed(B.B) || Pad360.pressed(B.BACK)) back();
    }
  }

  function setHint() {
    hintEl.textContent = {
      menu: 'ARROWS PICK — SPACE / A CHOOSE — TAP A NAME, OR THE BOX TO TYPE A NEW ONE',
      levels: 'ARROWS PICK A LEVEL — SPACE / A PLAY — ESC / B BACK',
      build: 'LEFT/RIGHT PICK A PIECE — UP/DOWN CHANGE WORLD — SPACE / A ADDS IT — BACKSPACE / B UNDO — R / Y RACE! — ESC MENU',
      race: 'ARROWS / STICK ROLL — SPACE / A JUMP — ESC / B BACK',
    }[mode];
  }

  // ---------- HUD ----------
  function font(px) { return 'bold ' + px + 'px "Courier New", Courier, monospace'; }
  function text(str, x, y, px, color, align = 'left', glow) {
    hctx.font = font(px);
    hctx.textAlign = align;
    hctx.lineWidth = 3;
    hctx.strokeStyle = 'rgba(10,12,40,0.85)';
    hctx.strokeText(str, x, y);
    if (glow) { hctx.shadowColor = glow; hctx.shadowBlur = 8; }
    hctx.fillStyle = color;
    hctx.fillText(str, x, y);
    hctx.shadowBlur = 0;
  }
  // text() that steps its size down until it fits in maxW (never below 6px)
  function fitText(str, x, y, px, color, maxW) {
    hctx.font = font(px);
    while (px > 6 && hctx.measureText(str).width > maxW) hctx.font = font(px -= 0.5);
    text(str, x, y, px, color);
  }
  function roundRect(x, y, w, h, r) {
    hctx.beginPath();
    hctx.moveTo(x + r, y);
    hctx.arcTo(x + w, y, x + w, y + h, r);
    hctx.arcTo(x + w, y + h, x, y + h, r);
    hctx.arcTo(x, y + h, x, y, r);
    hctx.arcTo(x, y, x + w, y, r);
    hctx.closePath();
  }
  function button(label, x, y, w, h, color, fn, big) {
    roundRect(x, y, w, h, 6);
    hctx.fillStyle = 'rgba(10,12,40,0.75)';
    hctx.fill();
    hctx.lineWidth = 2;
    hctx.strokeStyle = color;
    hctx.stroke();
    text(label, x + w / 2, y + h / 2 + 1, big ? 13 : 9, color, 'center');
    hudButtons.push({ x, y, w, h, fn });
  }
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');

  // Little top-down pictures of each piece for the picker cards.
  function drawIcon(type, cx, cy, s) {
    const g = hctx;
    g.save();
    g.translate(cx, cy);
    g.lineCap = 'round';
    g.strokeStyle = '#fff';
    g.fillStyle = '#fff';
    g.lineWidth = s * 0.22;
    const lane = () => { g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, -s * 0.5); g.stroke(); };
    if (type === 'straight') lane();
    else if (type === 'left' || type === 'right') {
      const k = type === 'right' ? 1 : -1;
      g.beginPath(); g.arc(k * s * 0.5, s * 0.5, s * 0.5, k > 0 ? Math.PI : -Math.PI / 2, k > 0 ? Math.PI * 1.5 : 0); g.stroke();
      g.beginPath(); g.moveTo(k * s * 0.5, 0); g.lineTo(k * s * 0.3, -s * 0.15); g.moveTo(k * s * 0.5, 0); g.lineTo(k * s * 0.3, s * 0.15); g.stroke();
    } else if (type === 'down' || type === 'up') {
      g.beginPath(); g.moveTo(-s * 0.5, type === 'down' ? -s * 0.3 : s * 0.3); g.lineTo(s * 0.5, type === 'down' ? s * 0.3 : -s * 0.3); g.stroke();
      g.lineWidth = s * 0.1;
      g.beginPath(); g.moveTo(-s * 0.5, s * 0.45); g.lineTo(s * 0.5, s * 0.45); g.stroke();
    } else if (type === 'spinner') {
      g.globalAlpha = 0.4; lane(); g.globalAlpha = 1;
      g.strokeStyle = '#ff4a4a';
      g.save(); g.rotate(performance.now() / 600);
      g.beginPath(); g.moveTo(-s * 0.45, 0); g.lineTo(s * 0.45, 0); g.stroke(); g.restore();
      g.beginPath(); g.arc(0, 0, s * 0.1, 0, Math.PI * 2); g.fill();
    } else if (type === 'gates') {
      g.globalAlpha = 0.4; lane(); g.globalAlpha = 1;
      g.strokeStyle = '#ff4a4a';
      const o = Math.sin(performance.now() / 500) * s * 0.18;
      for (const [y, sgn] of [[-s * 0.22, 1], [s * 0.22, -1]]) {
        g.beginPath(); g.moveTo(-s * 0.5, y); g.lineTo(sgn * o - s * 0.16, y); g.moveTo(sgn * o + s * 0.16, y); g.lineTo(s * 0.5, y); g.stroke();
      }
    } else if (type === 'bumpers') {
      g.fillStyle = '#ff4a4a';
      for (const [x, y] of [[0, 0.3], [-0.3, 0], [0.3, 0], [0, -0.3]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.12, 0, Math.PI * 2); g.fill(); }
    } else if (type === 'hammer') {
      const a = Math.sin(performance.now() / 400) * 0.6;
      g.save(); g.translate(0, -s * 0.45); g.rotate(a);
      g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s * 0.7); g.stroke();
      g.fillStyle = '#ffd23f'; g.fillRect(-s * 0.25, s * 0.62, s * 0.5, s * 0.26);
      g.restore();
    } else if (type === 'boost') {
      for (const k of [0.25, -0.15]) {
        g.beginPath(); g.moveTo(-s * 0.35, (k + 0.15) * s); g.lineTo(0, (k - 0.15) * s); g.lineTo(s * 0.35, (k + 0.15) * s); g.stroke();
      }
    } else if (type === 'loop') {
      g.lineWidth = s * 0.15;
      g.beginPath(); g.arc(0, -s * 0.08, s * 0.3, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.5, s * 0.3); g.lineTo(s * 0.5, s * 0.3); g.stroke();
    } else if (type === 'jump') {
      g.lineWidth = s * 0.15;
      g.beginPath(); g.moveTo(-s * 0.5, s * 0.15); g.lineTo(-s * 0.2, s * 0.15); g.lineTo(-s * 0.05, -s * 0.05); g.stroke();
      g.beginPath(); g.moveTo(s * 0.15, -s * 0.05); g.lineTo(s * 0.5, s * 0.4); g.stroke();
      g.lineWidth = s * 0.07; g.setLineDash([s * 0.08, s * 0.08]);
      g.beginPath(); g.moveTo(-s * 0.05, -s * 0.1); g.quadraticCurveTo(s * 0.1, -s * 0.5, s * 0.3, -s * 0.05); g.stroke();
      g.setLineDash([]);
    } else if (type === 'spiral') {
      g.lineWidth = s * 0.12;
      g.beginPath();
      for (let k = 0; k <= 40; k++) {
        const ang = k / 40 * Math.PI * 3.5, r = s * (0.45 - k / 40 * 0.33);
        const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
        if (k === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(0, 0, s * 0.08, 0, Math.PI * 2); g.fill();
    } else if (type === 'tube') {
      g.lineWidth = s * 0.1;
      g.beginPath(); g.moveTo(-s * 0.5, -s * 0.4); g.quadraticCurveTo(0, -s * 0.4, s * 0.5, s * 0.15); g.stroke();
      g.beginPath(); g.moveTo(-s * 0.5, -s * 0.05); g.quadraticCurveTo(-s * 0.1, -s * 0.05, s * 0.4, s * 0.45); g.stroke();
      g.globalAlpha *= 0.6;
      for (const k of [-0.3, 0.05, 0.35]) { g.beginPath(); g.ellipse(k * s, (k * 0.6 - 0.1) * s, s * 0.08, s * 0.2, -0.5, 0, Math.PI * 2); g.stroke(); }
    } else if (type === 'trampoline') {
      g.lineWidth = s * 0.12;
      g.beginPath(); g.moveTo(-s * 0.45, s * 0.35); g.lineTo(-s * 0.05, s * 0.35); g.stroke();
      g.beginPath(); g.moveTo(s * 0.2, -s * 0.1); g.lineTo(s * 0.5, -s * 0.1); g.stroke();
      g.lineWidth = s * 0.07; g.setLineDash([s * 0.08, s * 0.07]);
      const hop = Math.abs(Math.sin(performance.now() / 300)) * s * 0.1;
      g.beginPath(); g.moveTo(-s * 0.25, s * 0.28); g.quadraticCurveTo(0, -s * 0.55 - hop, s * 0.35, -s * 0.18); g.stroke();
      g.setLineDash([]);
      g.fillStyle = '#222'; g.fillRect(-s * 0.4, s * 0.3, s * 0.3, s * 0.08);
    } else if (type === 'portal') {
      g.save(); g.rotate(performance.now() / 400);
      g.lineWidth = s * 0.07;
      for (let arm = 0; arm < 3; arm++) {
        g.beginPath();
        for (let k = 0; k <= 12; k++) {
          const ang = arm * Math.PI * 2 / 3 + k * 0.22, r = k / 12 * s * 0.38;
          if (k === 0) g.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); else g.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
        }
        g.stroke();
      }
      g.restore();
      g.lineWidth = s * 0.12;
      g.beginPath(); g.arc(0, 0, s * 0.44, 0, Math.PI * 2); g.stroke();
    } else if (type === 'corkscrew') {
      g.lineWidth = s * 0.1;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.ellipse(0, (k - 1) * s * 0.28, s * 0.38, s * 0.14, 0, 0, Math.PI * 2); g.stroke(); }
      g.lineWidth = s * 0.12; g.beginPath(); g.moveTo(0, -s * 0.5); g.lineTo(0, s * 0.5); g.stroke();
    } else if (type === 'halfpipe') {
      g.lineWidth = s * 0.14;
      g.beginPath(); g.moveTo(-s * 0.45, -s * 0.35); g.quadraticCurveTo(-s * 0.45, s * 0.35, 0, s * 0.35);
      g.quadraticCurveTo(s * 0.45, s * 0.35, s * 0.45, -s * 0.35); g.stroke();
      g.fillStyle = '#ffd400'; g.beginPath(); g.arc(s * 0.3, -s * 0.1, s * 0.1, 0, Math.PI * 2); g.fill();
    } else if (type === 'conveyor') {
      g.lineWidth = s * 0.14;
      g.beginPath(); g.moveTo(-s * 0.5, s * 0.35); g.lineTo(s * 0.5, -s * 0.25); g.stroke();
      g.strokeStyle = '#222'; g.lineWidth = s * 0.07;
      const o = (performance.now() / 600) % 1;
      for (const k of [-0.3, 0.05, 0.4]) {
        const x = (k + o * 0.35 - 0.1) * s, y = -x * 0.6 + s * 0.05;
        g.beginPath(); g.moveTo(x - s * 0.08, y + s * 0.02); g.lineTo(x + s * 0.02, y - s * 0.1); g.lineTo(x + s * 0.06, y + s * 0.06); g.stroke();
      }
    } else if (type === 'flippers') {
      const up = (performance.now() / 700) % 2 < 0.3 ? -0.5 : 0.45;
      g.lineWidth = s * 0.15;
      for (const k of [-1, 1]) {
        g.beginPath(); g.moveTo(k * s * 0.45, s * 0.1); g.lineTo(k * s * 0.45 - k * Math.cos(up) * s * 0.36, s * 0.1 + Math.sin(up) * s * 0.36); g.stroke();
      }
      g.fillStyle = '#ffd400'; g.beginPath(); g.arc(0, -s * 0.3, s * 0.1, 0, Math.PI * 2); g.fill();
    } else if (type === 'fan') {
      g.lineWidth = s * 0.08;
      g.beginPath(); g.arc(0, 0, s * 0.42, 0, Math.PI * 2); g.stroke();
      g.save(); g.rotate(performance.now() / 120);
      for (let k = 0; k < 4; k++) { g.rotate(Math.PI / 2); g.beginPath(); g.ellipse(0, -s * 0.2, s * 0.08, s * 0.18, 0, 0, Math.PI * 2); g.fill(); }
      g.restore();
    } else if (type === 'seesaw') {
      const t = Math.sin(performance.now() / 500) * 0.3;
      g.save(); g.rotate(t); g.lineWidth = s * 0.14;
      g.beginPath(); g.moveTo(-s * 0.48, 0); g.lineTo(s * 0.48, 0); g.stroke(); g.restore();
      g.beginPath(); g.moveTo(0, s * 0.05); g.lineTo(-s * 0.18, s * 0.42); g.lineTo(s * 0.18, s * 0.42); g.closePath(); g.fill();
    } else if (type === 'tiles') {
      const drop = ((performance.now() / 500) % 2) * s * 0.15;
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        g.globalAlpha = i === 1 && j === 0 ? 0.5 : 1;
        g.fillRect((i - 1.5) * s * 0.3 + s * 0.02, (j - 1.5) * s * 0.3 + s * 0.02 + (i === 1 && j === 0 ? drop : 0), s * 0.26, s * 0.26);
      }
      g.globalAlpha = 1;
    } else if (type === 'plank') {
      g.lineWidth = s * 0.1;
      g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, -s * 0.5); g.stroke();
      g.globalAlpha = 0.35; g.setLineDash([s * 0.08, s * 0.08]);
      for (const k of [-1, 1]) { g.beginPath(); g.moveTo(k * s * 0.4, s * 0.5); g.lineTo(k * s * 0.4, -s * 0.5); g.stroke(); }
      g.setLineDash([]); g.globalAlpha = 1;
    } else if (type === 'fork') {
      g.lineWidth = s * 0.12;
      g.beginPath(); g.moveTo(0, s * 0.5); g.lineTo(0, s * 0.15); g.stroke();
      g.beginPath(); g.moveTo(0, s * 0.15); g.quadraticCurveTo(-s * 0.4, s * 0.05, -s * 0.3, -s * 0.5); g.stroke();
      g.strokeStyle = '#ff6b2c'; g.lineWidth = s * 0.08;
      g.beginPath(); g.moveTo(0, s * 0.15); g.lineTo(s * 0.3, -s * 0.5); g.stroke();
    } else if (type === 'cannon') {
      g.save(); g.translate(-s * 0.1, s * 0.15); g.rotate(-0.7);
      g.fillStyle = '#222'; g.fillRect(-s * 0.1, -s * 0.2, s * 0.62, s * 0.4);
      g.fillStyle = '#ffd23f'; g.fillRect(s * 0.44, -s * 0.24, s * 0.1, s * 0.48);
      g.restore();
      g.fillStyle = '#7a4a24'; g.beginPath(); g.arc(-s * 0.15, s * 0.28, s * 0.17, 0, Math.PI * 2); g.fill();
      const p = (performance.now() / 900) % 1;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(s * (0.25 + p * 0.2), -s * (0.15 + p * 0.3), s * 0.08, 0, Math.PI * 2); g.fill();
    } else if (type === 'ice') {
      g.strokeStyle = '#3aa0ff';
      g.lineWidth = s * 0.09;
      for (let k = 0; k < 3; k++) {
        g.save(); g.rotate(k * Math.PI / 3);
        g.beginPath(); g.moveTo(0, -s * 0.45); g.lineTo(0, s * 0.45); g.stroke();
        for (const e of [-1, 1]) {
          g.beginPath(); g.moveTo(0, e * s * 0.28); g.lineTo(s * 0.13, e * s * 0.4); g.moveTo(0, e * s * 0.28); g.lineTo(-s * 0.13, e * s * 0.4); g.stroke();
        }
        g.restore();
      }
    }
    g.restore();
  }

  // a marble's picture, shaded to look round
  function drawSwatch(spec, cx, cy, r, locked) {
    const g = hctx;
    g.save();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    g.imageSmoothingEnabled = true;
    g.drawImage(marbleTex(spec).image, cx - r * 2, cy - r, r * 4, r * 2);
    const shine = g.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r * 1.1);
    shine.addColorStop(0, 'rgba(255,255,255,0.55)'); shine.addColorStop(0.4, 'rgba(255,255,255,0)'); shine.addColorStop(1, 'rgba(0,0,0,0.35)');
    g.fillStyle = shine; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    if (locked) { g.fillStyle = 'rgba(10,12,40,0.7)'; g.fillRect(cx - r, cy - r, r * 2, r * 2); }
    g.restore();
    if (locked) {
      // a little padlock
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.arc(cx, cy - 2, r * 0.28, Math.PI, 0); g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(cx - r * 0.38, cy - 2, r * 0.76, r * 0.55);
    }
  }

  function drawMenuHud() {
    text('MARBLE RUMBLE', W / 2, 26, 26, '#ffe14f', 'center', '#ff6b2c');
    text('YOUR NAME', W / 2, 58, 9, '#5ff3ff', 'center');

    // saved names: tap one to be that player again
    const names = savedNames();
    if (names.length) {
      hctx.font = font(8);
      const widths = names.map((nm) => hctx.measureText(nm).width + 14);
      let cx = W / 2 - (widths.reduce((a, b) => a + b, 0) + 5 * (names.length - 1)) / 2;
      names.forEach((nm, i) => {
        const w = widths[i], current = nm === nameBox.value, focused = menuFocus === -1 && i === nameSel;
        roundRect(cx, 94, w, 13, 6);
        hctx.fillStyle = current ? 'rgba(95,243,255,0.3)' : 'rgba(10,12,40,0.75)'; hctx.fill();
        hctx.lineWidth = focused ? 2.5 : 1.2;
        hctx.strokeStyle = focused ? '#ffe14f' : current ? '#5ff3ff' : 'rgba(255,255,255,0.5)';
        hctx.stroke();
        text(nm, cx + w / 2, 101, 8, current ? '#ffffff' : '#cfe8ff', 'center');
        const at = cx;
        hudButtons.push({ x: at, y: 92, w, h: 17, fn: () => { menuFocus = -1; pickName(i); } });
        cx += w + 5;
      });
    }

    const mb = MARBLES[marbleSel];
    const open = unlocked(mb);
    text(open ? 'YOUR MARBLE: ' + mb.name : mb.name + ' -- FINISH STORY LEVEL ' + mb.unlock + ' TO UNLOCK',
      W / 2, 117, 9, open ? '#ffffff' : '#ffb0b0', 'center');
    const gap = 46, x0 = W / 2 - gap * (MARBLES.length - 1) / 2;
    MARBLES.forEach((spec, i) => {
      const x = x0 + i * gap, y = 142, on = i === marbleSel, r = on ? 17 : 14;
      if (on) {
        hctx.beginPath(); hctx.arc(x, y, r + 4, 0, Math.PI * 2);
        hctx.strokeStyle = menuFocus === 0 ? '#ffe14f' : 'rgba(255,225,79,0.5)'; hctx.lineWidth = 3;
        hctx.shadowColor = '#ffe14f'; hctx.shadowBlur = menuFocus === 0 ? 10 : 0; hctx.stroke(); hctx.shadowBlur = 0;
      }
      drawSwatch(spec, x, y, r, !unlocked(spec));
      if (spec.id === save.marble) text('\u2714', x + r - 2, y - r + 2, 9, '#5dff8a', 'center');
      if (!unlocked(spec)) text('LV ' + spec.unlock, x, y + r + 9, 7, '#ffb0b0', 'center');
      hudButtons.push({ x: x - 20, y: y - 20, w: 40, h: 40, fn: () => { menuFocus = 0; pickMarble(i); } });
    });

    const big = (label, sub, x, focus, fn, color) => {
      roundRect(x, 180, 170, 46, 10);
      hctx.fillStyle = 'rgba(10,12,40,0.82)'; hctx.fill();
      hctx.lineWidth = menuFocus === focus ? 3.5 : 2; hctx.strokeStyle = color;
      if (menuFocus === focus) { hctx.shadowColor = color; hctx.shadowBlur = 12; }
      hctx.stroke(); hctx.shadowBlur = 0;
      text(label, x + 85, 197, 14, color, 'center');
      text(sub, x + 85, 214, 8, '#ffffff', 'center');
      hudButtons.push({ x, y: 180, w: 170, h: 46, fn: () => { menuFocus = focus; fn(); } });
    };
    const done = save.story.done;
    big('STORY MODE', done >= LEVELS.length ? 'ALL ' + LEVELS.length + ' LEVELS DONE!' : 'LEVEL ' + (done + 1) + ' OF ' + LEVELS.length,
      62, 1, () => { sfxPlace(); toLevels(); }, '#5dff8a');
    big('BUILD YOUR OWN', 'MAKE A RUN AND RACE IT', 248, 2, () => { sfxPlace(); backToBuild(); }, '#9fd8ff');
  }

  function drawLevelsHud() {
    text('STORY MODE', W / 2, 18, 16, '#5dff8a', 'center', '#5dff8a');
    button('\u25C0 MENU', 30, 8, 60, 20, '#9fd8ff', toMenu);
    const COLS = 9, cw = 46, ch = 36, gap = 5, x0 = (W - (COLS * cw + (COLS - 1) * gap)) / 2;
    LEVELS.forEach((L, i) => {
      const n = i + 1, col = i % COLS, row = Math.floor(i / COLS);
      const x = x0 + col * (cw + gap), y = 34 + row * (ch + gap);
      const open = storyUnlocked(n), on = n === levelSel, medal = save.story.medals[n];
      roundRect(x, y, cw, ch, 7);
      hctx.fillStyle = open ? 'rgba(20,40,90,0.85)' : 'rgba(10,12,40,0.7)'; hctx.fill();
      hctx.lineWidth = on ? 3 : 1.5;
      hctx.strokeStyle = on ? '#ffe14f' : open ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.25)';
      if (on) { hctx.shadowColor = '#ffe14f'; hctx.shadowBlur = 10; }
      hctx.stroke(); hctx.shadowBlur = 0;
      text(String(n), x + cw / 2, y + 13, 13, open ? '#ffffff' : '#667', 'center');
      if (medal !== undefined) {
        hctx.fillStyle = MEDALS[medal].color;
        hctx.beginPath(); hctx.arc(x + cw / 2, y + 27, 4, 0, Math.PI * 2); hctx.fill();
      } else if (!open) text('LOCKED', x + cw / 2, y + 27, 6, '#667', 'center');
      const mbu = MARBLES.find((mb) => mb.unlock === n);
      if (mbu) drawSwatch(mbu, x + cw - 7, y + 7, 4, !unlocked(mbu));
      hudButtons.push({ x, y, w: cw, h: ch, fn: () => { if (levelSel === n) startStory(n); else pickLevel(n); } });
    });

    const L = LEVELS[levelSel - 1], open = storyUnlocked(levelSel);
    roundRect(8, 196, W - 16, 66, 10);
    hctx.fillStyle = 'rgba(10,12,40,0.8)'; hctx.fill();
    text('LEVEL ' + levelSel + ': ' + L.name, 20, 212, 13, '#ffe14f');
    text(L.feature ? 'NEW PIECE: ' + PIECES[L.feature].name + '!' : levelSel === 1 ? 'A NICE EASY START.' : 'EVERYTHING MIXED UP!', 20, 230, 9, '#ffffff');
    text('WORLD: ' + worldById(L.world).name, 236, 212, 9, worldById(L.world).ui);
    const medal = save.story.medals[levelSel], best = save.best['story' + levelSel];
    if (medal !== undefined) text('BEST: ' + MEDALS[medal].name + (best ? '  ' + fmtTime(best) : ''), 20, 247, 9, MEDALS[medal].color);
    const mbu = MARBLES.find((mb) => mb.unlock === levelSel);
    if (mbu && !unlocked(mbu)) {
      drawSwatch(mbu, 250, 229, 10, false);
      text('WIN A ' + mbu.name + ' MARBLE', 266, 229, 8, '#ffb0ff');
    }
    if (open) button('PLAY \u25B6', W - 104, 212, 88, 34, '#5dff8a', () => startStory(levelSel), true);
    else text('FINISH LEVEL ' + (levelSel - 1) + ' FIRST', W - 64, 229, 8, '#ffb0b0', 'center');
  }

  function drawBuildHud() {
    const n = lay.pieces.length - 1;
    // (x 32, not 10: the ☰ menu button sits in the top-left corner)
    text('BUILD YOUR MARBLE RUN', 32, 14, 12, '#5ff3ff', 'left', '#5ff3ff');
    text('PIECES ' + n + '/' + MAX_PIECES + '   LEVEL ' + lay.next.level, 32, 30, 9, '#ffffff');
    const best = save.best[save.track.join('.')];
    if (best) text('BEST TIME ' + best.toFixed(2) + 's', 32, 43, 9, '#ffe14f');

    button('RACE! ▶', W - 96, 8, 88, 30, '#5dff8a', tryRace, true);
    // the world picker: tap to go to the next one
    text('WORLD', W - 52, 48, 7, '#ffffff', 'center');
    button(world.name + ' ▶', W - 96, 54, 88, 20, world.ui, () => pickWorld(1));
    button('UNDO', 8, 56, 66, 20, '#ffffff', undoPiece);
    button('SURPRISE!', 8, 80, 66, 20, '#ffe14f', surpriseTrack);
    button(clearArmed > 0 ? 'SURE?' : 'CLEAR', 8, 104, 66, 20, clearArmed > 0 ? '#ff7070' : '#ff9fbf', clearTrack);
    button('TURN \u21BB', 8, 128, 66, 20, '#9fd8ff', () => { buildYawTarget += Math.PI / 2; sfxSelect(); });
    button('\u25C0 MENU', 8, 152, 66, 20, '#9fd8ff', toMenu);

    // picker cards along the bottom: track pieces on top, obstacles underneath
    const cw = 26, gap = 2, y0 = 211;
    PALETTE.forEach((type, i) => {
      const row = i < TRACK_ROW.length ? 0 : 1, list = row ? OBSTACLE_ROW : TRACK_ROW;
      const col = row ? i - TRACK_ROW.length : i;
      const x = (W - (list.length * (cw + gap) - gap)) / 2 + col * (cw + gap);
      const on = i === sel;
      const y = y0 + row * (cw + 4);
      const ok = canAdd(lay, type);
      roundRect(x, y, cw, cw, 6);
      hctx.fillStyle = hex(PIECES[type].color);
      hctx.globalAlpha = ok ? 0.95 : 0.35;
      hctx.fill();
      hctx.globalAlpha = 1;
      hctx.lineWidth = on ? 3 : 1.5;
      hctx.strokeStyle = on ? '#ffe14f' : 'rgba(255,255,255,0.7)';
      if (on) { hctx.shadowColor = '#ffe14f'; hctx.shadowBlur = 10; }
      hctx.stroke();
      hctx.shadowBlur = 0;
      hctx.globalAlpha = ok ? 1 : 0.4;
      drawIcon(type, x + cw / 2, y + cw / 2, cw * 0.6);
      hctx.globalAlpha = 1;
      if (PIECES[type].len) text(PIECES[type].len + 'x', x + cw - 6, y + 6, 6, '#ffffff', 'center');
      hudButtons.push({ x, y, w: cw, h: cw, fn: () => { if (sel === i) addPiece(); else selectPiece(i); } });
    });
    const def = PIECES[PALETTE[sel]];
    text(def.name + (def.len ? '  (' + def.len + ' SPACES)' : ''), W / 2, y0 - 25, 12, '#ffffff', 'center', '#ffffff');
    text(def.tip + '  (TAP AGAIN TO ADD)', W / 2, y0 - 12, 8, '#ffe14f', 'center');
  }

  function fmtTime(t) {
    t = Math.max(0, t);
    const m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  function drawRaceHud() {
    // name tags over the other marbles
    for (const m of marbles) {
      if (m === player || !m.mesh.visible) continue;
      const p = tmpQ.copy(m.pos).setY(m.pos.y + 0.8).project(camera);
      if (p.z > 1 || Math.abs(p.x) > 1.1 || Math.abs(p.y) > 1.1) continue;
      const d = m.pos.distanceTo(camera.position);
      if (d > 30) continue;
      text(m.rc.name, (p.x + 1) / 2 * W, (1 - p.y) / 2 * H, 8, m.rc.color, 'center');
    }

    const place = marbles.slice().sort((a, b) => progressOf(b) - progressOf(a)).indexOf(player);
    text(fmtTime(player.finished ? player.finishTime : raceTime), 32, 14, 13, '#ffffff');
    text('★ ' + starsGot, 32, 32, 12, '#ffd400');
    text(placeName(place), W / 2, 18, 20, ['#ffd400', '#e0e6ff', '#ffb06b', '#ffffff'][place], 'center', '#000');
    button(raceKind === 'story' ? '\u25C0 LEVELS' : '\u25C0 BUILD', W - 74, 8, 66, 20, '#9fd8ff', leaveRace);
    if (raceKind === 'story') text('LEVEL ' + storyLevel + ': ' + LEVELS[storyLevel - 1].name, W - 10, 38, 8, '#ffffff', 'right');

    // progress bar with a dot for each marble
    const bx = 120, bw = 240, by = 40;
    hctx.fillStyle = 'rgba(10,12,40,0.6)';
    roundRect(bx - 4, by - 4, bw + 8, 8, 4); hctx.fill();
    const total = pieces.length - 0.5;
    for (const m of marbles.slice().reverse()) {
      const f = Math.min(1, (m.finished ? total : m.pieceIdx + m.t) / total);
      hctx.fillStyle = m.rc.color;
      hctx.beginPath(); hctx.arc(bx + f * bw, by, m === player ? 5 : 4, 0, Math.PI * 2); hctx.fill();
      if (m === player) { hctx.strokeStyle = '#fff'; hctx.lineWidth = 1.5; hctx.stroke(); }
    }

    if (raceTime < 0) {
      const n = Math.ceil(-raceTime);
      const k = 1 + (n + raceTime) * 0.6;
      text(String(n), W / 2, H / 2, Math.round(48 * k), '#ffe14f', 'center', '#ffe14f');
    } else if (raceTime < 1) {
      text('GO!', W / 2, H / 2, 52, '#5dff8a', 'center', '#5dff8a');
    }

    if (player.finished && !(results && results.shown)) {
      text('FINISHED!', W / 2, H / 2 - 20, 30, '#ffe14f', 'center', '#ff6b2c');
    }
    if (results && results.shown) drawResults();
  }

  function drawResults() {
    const story = raceKind === 'story';
    const x = 100, y = 40, w = 280, h = 200;
    roundRect(x, y, w, h, 10);
    hctx.fillStyle = 'rgba(10,12,40,0.88)';
    hctx.fill();
    hctx.lineWidth = 3; hctx.strokeStyle = '#5ff3ff'; hctx.stroke();
    const cheer = story ? 'LEVEL ' + storyLevel + ' DONE!' : ['YOU WON!', 'SUPER 2ND!', 'GREAT 3RD!', 'YOU FINISHED!'][results.place];
    text(cheer, W / 2, y + 20, 20, '#ffe14f', 'center', '#ff6b2c');
    if (story) text(MEDALS[results.place].name + (results.place < 3 ? ' MEDAL!' : '!'), W / 2, y + 38, 10, MEDALS[results.place].color, 'center');
    const order = finishOrder.concat(marbles.filter((m) => !m.finished).sort((a, b) => progressOf(b) - progressOf(a)));
    order.forEach((m, i) => {
      const yy = y + (story ? 54 : 46) + i * 15;
      text(placeName(i), x + 30, yy, 10, '#ffffff');
      hctx.fillStyle = m.rc.color;
      hctx.beginPath(); hctx.arc(x + 70, yy, 5, 0, Math.PI * 2); hctx.fill();
      // the name gets everything up to the time column (and shrinks rather than run into it)
      const timeStr = m.finished ? fmtTime(m.finishTime) : 'ROLLING...';
      hctx.font = font(10);
      const nameRoom = x + w - 24 - hctx.measureText(timeStr).width - 8 - (x + 82);
      fitText(m.rc.name, x + 82, yy, 10, m === player ? '#ffe14f' : '#ffffff', nameRoom);
      text(timeStr, x + w - 24, yy, 10, '#ffffff', 'right');
    });
    text('\u2605 ' + results.stars + ' STARS   TIME ' + fmtTime(results.time) + (results.newBest ? '  NEW BEST!' : ''), W / 2, y + 122, 9, '#ffd400', 'center');
    text('SCORE ' + results.score, W / 2, y + 138, 12, '#5dff8a', 'center', '#5dff8a');
    if (results.unlock) {
      // a new marble!
      const pulse = 1 + Math.sin(performance.now() / 150) * 0.08;
      drawSwatch(results.unlock, x + 34, y + 156, 11 * pulse, false);
      text('NEW MARBLE: ' + results.unlock.name + '!', x + 52, y + 156, 10, '#ffb0ff', 'left', '#ff6fc8');
    }
    hudButtons = [];
    if (story) {
      const last = storyLevel >= LEVELS.length;
      button(last ? 'ALL DONE!' : 'NEXT LEVEL \u25B6', x + 10, y + h - 32, 96, 24, '#5dff8a', resultsPrimary);
      button('TRY AGAIN', x + 112, y + h - 32, 76, 24, '#ffe14f', startRace);
      button('LEVELS', x + 194, y + h - 32, 76, 24, '#9fd8ff', () => toLevels(storyLevel));
    } else {
      button('RACE AGAIN', x + 18, y + h - 32, 110, 24, '#5dff8a', startRace);
      button('BUILD MORE', x + w - 128, y + h - 32, 110, 24, '#9fd8ff', backToBuild);
    }
  }

  function drawHud() {
    hctx.clearRect(0, 0, W, H);
    hudButtons = [];
    if (mode === 'menu') drawMenuHud();
    else if (mode === 'levels') drawLevelsHud();
    else if (mode === 'build') drawBuildHud();
    else drawRaceHud();
    if (toastT > 0) {
      hctx.globalAlpha = Math.min(1, toastT * 2);
      text(toast, W / 2, 168, 11, '#ffffff', 'center', '#ff6b2c');
      hctx.globalAlpha = 1;
    }
  }

  // ---------- Resize ----------
  function resize() {
    const r = view.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
  }
  if (window.ResizeObserver) new ResizeObserver(resize).observe(view);
  else window.addEventListener('resize', resize);
  resize();

  // ---------- Main loop ----------
  let lastT = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    frame(dt, now);
    requestAnimationFrame(loop);
  }
  function frame(dt, now) {
    pollPad();
    obstacleTime += dt;
    toastT -= dt;
    clearArmed -= dt;
    for (const pc of pieces) {
      for (const o of pc.obstacles) if (o !== pc.gate) o.update(obstacleTime, dt);
      if (pc.gate) pc.gate.update(obstacleTime, dt);
      for (const st of pc.stars) { st.spin += dt * 2.5; st.mesh.rotation.y = st.spin; }
    }
    boostTex.offset.y -= dt * 1.5;
    beltTex.offset.y -= dt * 1.1;
    TEX.portal.rotation = -obstacleTime * 2.5;
    if (mode === 'race') updateRace(dt);
    updateParticles(dt);
    updateCamera(dt);
    for (const fn of decorAnim) fn(dt, obstacleTime);
    renderer.render(scene, camera);
    drawHud();
  }

  rebuildTrack(false);
  setMode('menu');
  requestAnimationFrame(loop);
})();
