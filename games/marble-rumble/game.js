// Marble Rumble -- build a 3D marble run out of snap-together pieces, then race your
// marble down it against three computer marbles. You steer the marble (it keeps its
// momentum), hop with jump, and get past spinners, sliding gates, bumpers and hammers.
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
  const S = 4;            // one grid cell
  const HW = 1.5;         // half the floor's width
  const WALL = 1.2;       // side wall height (taller than a jump, so you can't hop off)
  const LH = 1.5;         // height of one level; a ramp climbs or drops one level
  const R = 0.4;          // marble radius
  const START_LEVEL = 5;
  const MAX_LEVEL = 9;
  const MAX_PIECES = 40;
  const GRID_LIMIT = 12;  // cells from the start in any direction
  const GROUND_Y = -2.5;

  // ---------- Marble physics ----------
  const GRAVITY = 22;
  const ACCEL = 13;       // how hard you can push the marble while it touches the track
  const AIR_CONTROL = 0.35;
  const PUSH_MAX = 10;    // you can't push faster than this -- gravity can, downhill
  const MAX_SPEED = 18;
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
  };
  const PALETTE = ['straight', 'left', 'right', 'down', 'up', 'spinner', 'gates', 'bumpers', 'hammer'];
  const DEFAULT_TRACK = ['straight', 'down', 'spinner', 'right', 'down', 'gates', 'left', 'down',
    'bumpers', 'right', 'hammer', 'down', 'straight'];

  const RACERS = [
    { name: 'YOU',       color: '#ff6b2c', stripe: '#ffe14f' },
    { name: 'ZIPPY',     color: '#2f8cff', stripe: '#bfe3ff', speed: 9.6, accel: 1.0 },
    { name: 'PICKLE',    color: '#3ccf4e', stripe: '#e6ffb0', speed: 8.8, accel: 0.95 },
    { name: 'GRAPE',     color: '#9b5cff', stripe: '#f0d0ff', speed: 8.0, accel: 0.9 },
  ];
  const PLACE_POINTS = [1000, 600, 400, 250];

  // ---------- Save ----------
  function loadSave() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      if (s && Array.isArray(s.track)) return { track: s.track.filter((t) => PALETTE.includes(t)), best: s.best || {} };
    } catch (e) {}
    return { track: DEFAULT_TRACK.slice(), best: {} };
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
  scene.fog = new THREE.Fog(0x8fd8ff, 45, 110);

  const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 300);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x5a7a3a, 1.7));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -22; sun.shadow.camera.right = 22;
  sun.shadow.camera.top = 22; sun.shadow.camera.bottom = -22;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 80;
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
  groundTex.wrapS = groundTex.wrapT = THREE.RepeatWrapping;
  groundTex.repeat.set(60, 60);
  groundTex.magFilter = THREE.NearestFilter;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 480),
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

  const MAT = {
    wall: new THREE.MeshStandardMaterial({ color: 0xcff6ff, transparent: true, opacity: 0.3,
      roughness: 0.1, side: THREE.DoubleSide, depthWrite: false }),
    rail: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    pillar: new THREE.MeshStandardMaterial({ color: 0x9aa7c0, roughness: 0.7 }),
    red: new THREE.MeshStandardMaterial({ color: 0xff4a4a, roughness: 0.4 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.4 }),
    white: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x3a3f58, roughness: 0.6 }),
    star: new THREE.MeshStandardMaterial({ color: 0xffd400, emissive: 0x996600, roughness: 0.3, metalness: 0.3 }),
    checker: new THREE.MeshStandardMaterial({ map: checkerTex, roughness: 0.6 }),
    ghostOk: new THREE.MeshBasicMaterial({ color: 0x5dff8a, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false }),
    ghostBad: new THREE.MeshBasicMaterial({ color: 0xff5050, transparent: true, opacity: 0.45,
      side: THREE.DoubleSide, depthWrite: false }),
  };
  const floorMats = {};
  function floorMat(type) {
    if (!floorMats[type]) floorMats[type] = new THREE.MeshStandardMaterial({
      color: PIECES[type].color, roughness: 0.55, side: THREE.DoubleSide });
    return floorMats[type];
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
  };

  // ---------- Track layout (grid cells) ----------
  // A track is the list of piece types after the START piece. Each piece's exit decides
  // where the next one goes, so the run is always one connected chain.
  function exitOf(pl) {
    const def = PIECES[pl.type];
    const dir = def.turn === 1 ? (pl.dir + 3) % 4 : def.turn === -1 ? (pl.dir + 1) % 4 : pl.dir;
    return { x: pl.x + DIRS[dir][0], z: pl.z + DIRS[dir][1], level: pl.level + (def.dl || 0), dir };
  }
  // A piece fills its cell from its lowest floor up to one level above its highest one
  // (head room), so tracks can only cross with room to spare.
  function cellKeys(pl) {
    const dl = PIECES[pl.type].dl || 0;
    const lo = Math.min(pl.level, pl.level + dl), hi = Math.max(pl.level, pl.level + dl) + 1;
    const keys = [];
    for (let l = lo; l <= hi; l++) keys.push(pl.x + ',' + pl.z + ',' + l);
    return { keys, lo, hi };
  }
  function fits(pl, occ) {
    const { keys, lo, hi } = cellKeys(pl);
    if (lo < 0 || hi - 1 > MAX_LEVEL) return false;
    if (Math.abs(pl.x) > GRID_LIMIT || Math.abs(pl.z) > GRID_LIMIT) return false;
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

  // ---------- Piece geometry ----------
  // Local frame of a piece: b runs along it (entry at -S/2), a runs to the right, y is up.
  function pieceFrame(pl, t) {
    const def = PIECES[pl.type];
    if (def.turn) {
      const s = def.turn, ph = t * Math.PI / 2, rho = S / 2;
      return { a: s * (S / 2 - rho * Math.cos(ph)), b: -S / 2 + rho * Math.sin(ph), y: 0,
        ta: s * Math.sin(ph), tb: Math.cos(ph) };
    }
    return { a: 0, b: -S / 2 + S * t, y: (def.dl || 0) * LH * t, ta: 0, tb: 1 };
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

  // Builds one placed piece: meshes (into `group`), collision triangles, moving obstacles,
  // the stars on it and the path the computer marbles follow.
  function buildPiece(pl, idx, group, ghostMat) {
    const def = PIECES[pl.type];
    const B = basis(pl);
    const N = def.turn ? 10 : 1;
    const piece = { idx, pl, B, tris: [], obstacles: [], stars: [], box: new THREE.Box3(), frames: [] };
    const floor = [], under = [], walls = [], rails = [];
    const L = [], Rt = [];
    for (let i = 0; i <= N; i++) {
      const f = pieceFrame(pl, i / N);
      const ra = f.tb, rb = -f.ta;   // right of the direction of travel
      L.push(toW(B, f.a - HW * ra, f.y, f.b - HW * rb));
      Rt.push(toW(B, f.a + HW * ra, f.y, f.b + HW * rb));
    }
    const up = (p, h) => p.clone().addScaledVector(UP, h);
    const out = (p, q, d) => p.clone().addScaledVector(p.clone().sub(q).normalize(), d);
    for (let i = 0; i < N; i++) {
      pushQuad(floor, L[i], L[i + 1], Rt[i + 1], Rt[i]);
      quadTris(piece.tris, L[i], L[i + 1], Rt[i + 1], Rt[i], piece);
      // slab underneath and its outside edges
      const lo0 = out(up(L[i], -0.25), Rt[i], 0.08), lo1 = out(up(L[i + 1], -0.25), Rt[i + 1], 0.08);
      const ro0 = out(up(Rt[i], -0.25), L[i], 0.08), ro1 = out(up(Rt[i + 1], -0.25), L[i + 1], 0.08);
      pushQuad(under, lo0, ro0, ro1, lo1);
      pushQuad(under, L[i], L[i + 1], lo1, lo0);
      pushQuad(under, Rt[i], ro0, ro1, Rt[i + 1]);
      for (const [p0, p1] of [[L[i], L[i + 1]], [Rt[i], Rt[i + 1]]]) {
        const w0 = up(p0, WALL), w1 = up(p1, WALL);
        pushQuad(walls, p0, p1, w1, w0);
        quadTris(piece.tris, p0, p1, w1, w0, piece);
      }
      // rails along the wall tops, leaning outward a touch
      pushQuad(rails, up(L[i], WALL), up(L[i + 1], WALL), out(up(L[i + 1], WALL), Rt[i + 1], 0.14), out(up(L[i], WALL), Rt[i], 0.14));
      pushQuad(rails, up(Rt[i], WALL), out(up(Rt[i], WALL), L[i], 0.14), out(up(Rt[i + 1], WALL), L[i + 1], 0.14), up(Rt[i + 1], WALL));
    }
    // start has a back wall, finish an end wall
    const endWall = (p0, p1) => {
      pushQuad(walls, p0, p1, up(p1, WALL), up(p0, WALL));
      quadTris(piece.tris, p0, p1, up(p1, WALL), up(p0, WALL), piece);
    };
    if (pl.type === 'start') endWall(L[0], Rt[0]);
    if (pl.type === 'finish') endWall(L[N], Rt[N]);

    const fm = ghostMat || floorMat(pl.type);
    group.add(meshFrom(floor, fm, !ghostMat));
    group.add(meshFrom(walls, ghostMat || MAT.wall));
    if (!ghostMat) {
      group.add(meshFrom(rails, MAT.rail, true));
      group.add(meshFrom(under, MAT.dark, true));
      // a support pillar down to the grass
      const mid = toW(B, pieceFrame(pl, 0.5).a, pieceFrame(pl, 0.5).y, pieceFrame(pl, 0.5).b);
      const top = mid.y - 0.25, ph = top - GROUND_Y;
      if (ph > 0.2) {
        const pillar = new THREE.Mesh(GEO.cyl, MAT.pillar);
        pillar.scale.set(0.16, ph, 0.16);
        pillar.position.set(mid.x, GROUND_Y + ph / 2, mid.z);
        pillar.castShadow = true;
        group.add(pillar);
      }
    }

    piece.tris.forEach((t) => { piece.box.expandByPoint(t.a); piece.box.expandByPoint(t.b); piece.box.expandByPoint(t.c); });

    // the path the computer marbles follow, plus frames for progress
    for (let i = 0; i <= 8; i++) {
      const f = pieceFrame(pl, i / 8);
      piece.frames.push({
        p: toW(B, f.a, f.y + R, f.b),
        fwd: vecW(B, f.ta, 0, f.tb).normalize(),
        right: vecW(B, f.tb, 0, -f.ta).normalize(),
      });
    }

    if (pl.type === 'finish') addFinishDecor(piece, group, ghostMat);
    if (pl.type === 'start') addStartGate(piece, group, ghostMat);
    const maker = OBSTACLES[pl.type];
    if (maker) maker(piece, group, ghostMat || null);
    if (def.star && !ghostMat) {
      const f = pieceFrame(pl, 0.5);
      const star = new THREE.Mesh(GEO.star, MAT.star);
      star.position.copy(toW(B, f.a, f.y + 0.75, f.b));
      star.castShadow = true;
      group.add(star);
      piece.stars.push({ mesh: star, taken: false, spin: Math.random() * 6 });
    }
    // leave room in the bounds for things that swing above the track
    piece.box.expandByScalar(R + 0.2);
    piece.box.max.y += 3;
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
        toW(B, 0, 0.45 - this.open * 0.95, 0.35, this.c);
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
      const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
      post.scale.set(0.2, 1.1, 0.2);
      post.position.copy(toW(B, 0, 0.55, 0));
      group.add(post);
      const bar = new THREE.Mesh(GEO.box, ghostMat || MAT.red);
      bar.castShadow = !ghostMat;
      group.add(bar);
      const pivot = toW(B, 0, 0.36, 0);
      const w = 1.7 * dirSign;
      piece.obstacles.push({
        kind: 'cyl', c: toW(B, 0, 0, 0), r: 0.2, y0: pivot.y - 0.4, y1: pivot.y + 0.8,
        vel: (p, o) => o.set(0, 0, 0),
        update() {},
      });
      piece.obstacles.push({
        kind: 'box', c: pivot.clone(), ax: [new THREE.Vector3(), UP.clone(), new THREE.Vector3()], h: [1.4, 0.16, 0.13],
        vel: (p, o) => o.set(w * (p.z - pivot.z), 0, -w * (p.x - pivot.x)),
        update(time) {
          const ang = time * w;
          vecW(B, Math.cos(ang), 0, Math.sin(ang), this.ax[0]);
          this.ax[2].crossVectors(this.ax[0], UP).normalize();
          placeBox(bar, this.c, this.ax[0], this.ax[1], this.ax[2], 2.8, 0.32, 0.26);
        },
      });
    },

    gates(piece, group, ghostMat) {
      const B = piece.B;
      const GAP = 0.68, AMP = HW - GAP;
      [-0.9, 0.9].forEach((bb, row) => {
        const meshes = [0, 1].map(() => {
          const m = new THREE.Mesh(GEO.box, ghostMat || MAT.red);
          m.castShadow = !ghostMat;
          group.add(m);
          return m;
        });
        const phase = row * Math.PI + piece.idx;
        const speed = 1.5;
        let gapV = 0;
        const parts = [0, 1].map((side) => ({
          kind: 'box', c: new THREE.Vector3(), ax: [vecW(B, 1, 0, 0), UP.clone(), vecW(B, 0, 0, 1)], h: [0.5, 0.4, 0.13],
          vel: (p, o) => vecW(B, gapV, 0, 0, o),
          update(time) {
            const g = Math.sin(time * speed + phase) * AMP;
            gapV = Math.cos(time * speed + phase) * AMP * speed;
            const a0 = side ? g + GAP : -HW, a1 = side ? HW : g - GAP;
            this.h[0] = Math.max(0.01, (a1 - a0) / 2);
            toW(B, (a0 + a1) / 2, 0.4, bb, this.c);
            placeBox(meshes[side], this.c, this.ax[0], this.ax[1], this.ax[2], this.h[0] * 2, 0.8, 0.26);
            if (side === 0) piece.gapAt[row] = g;
          },
        }));
        parts.forEach((p) => piece.obstacles.push(p));
      });
      piece.gapAt = [0, 0];
    },

    bumpers(piece, group, ghostMat) {
      const B = piece.B;
      // one in the middle, then two -- always leaving gaps wider than a marble
      [[0, -1.0], [-0.85, 1.0], [0.85, 1.0]].forEach(([a, b]) => {
        const m = new THREE.Mesh(GEO.cyl, ghostMat || MAT.red);
        m.castShadow = !ghostMat;
        const cap = new THREE.Mesh(GEO.cyl, ghostMat || MAT.white);
        const c = toW(B, a, 0, b);
        m.position.copy(c).y += 0.35; m.scale.set(0.3, 0.7, 0.3);
        cap.position.copy(c).y += 0.74; cap.scale.set(0.2, 0.08, 0.2);
        group.add(m, cap);
        piece.obstacles.push({
          kind: 'cyl', c, r: 0.3, y0: c.y - 0.2, y1: c.y + 0.8, bumper: true, flash: 0, mesh: m,
          vel: (p, o) => o.set(0, 0, 0),
          update(time, dt) {
            this.flash = Math.max(0, this.flash - dt * 4);
            const s = 0.3 * (1 + this.flash * 0.35);
            m.scale.set(s, 0.7, s);
          },
        });
      });
    },

    hammer(piece, group, ghostMat) {
      const B = piece.B;
      const PIV = 3.4, ARM = 2.9, AMP = 1.0, SPD = 1.9, phase = piece.idx * 1.3;
      for (const sa of [-1, 1]) for (const sb of [-1, 1]) {
        const post = new THREE.Mesh(GEO.cyl, ghostMat || MAT.dark);
        post.scale.set(0.1, PIV + 0.3, 0.1);
        post.position.copy(toW(B, sa * (HW + 0.25), (PIV + 0.3) / 2, sb * 1.0));
        group.add(post);
      }
      const axle = new THREE.Mesh(GEO.box, ghostMat || MAT.dark);
      placeBox(axle, toW(B, 0, PIV, 0), vecW(B, 1, 0, 0), UP, vecW(B, 0, 0, 1), 0.16, 0.16, 2.1);
      group.add(axle);
      for (const sb of [-1, 1]) {
        const beam = new THREE.Mesh(GEO.box, ghostMat || MAT.dark);
        placeBox(beam, toW(B, 0, PIV + 0.3, sb), vecW(B, 1, 0, 0), UP, vecW(B, 0, 0, 1), HW * 2 + 0.6, 0.14, 0.14);
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
        kind: 'capsule', a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.5,
        vel: (p, o) => o.copy(headV),
        update(time) {
          const th = Math.sin(time * SPD + phase) * AMP;
          const thd = Math.cos(time * SPD + phase) * AMP * SPD;
          const hc = toW(B, ARM * Math.sin(th), PIV - ARM * Math.cos(th), 0);
          vecW(B, ARM * thd * Math.cos(th), ARM * thd * Math.sin(th), 0, headV);
          this.a.copy(hc).addScaledVector(along, -0.55);
          this.b.copy(hc).addScaledVector(along, 0.55);
          const down = hc.clone().sub(pivot).normalize();
          const side = new THREE.Vector3().crossVectors(down, along).normalize();
          placeBox(arm, pivot.clone().lerp(hc, 0.5), side, down, along, 0.12, ARM, 0.12);
          // the hammer head is a cylinder lying along the track
          head.position.copy(hc);
          head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, along, down.clone().negate()));
          head.scale.set(0.5, 1.1, 0.5);
        },
      });
    },
  };

  // ---------- Building the 3D track ----------
  let lay = layout(save.track);
  save.track = lay.pieces.slice(1).map((p) => p.type);
  let trackGroup = null;
  let pieces = [];          // built pieces (the whole run, including START, and FINISH while racing)
  let path = [];            // AI path points along the whole run
  let ghostGroup = null;
  let ghostOk = true;

  function disposeGroup(g) {
    if (!g) return;
    scene.remove(g);
    g.traverse((o) => {
      if (o.geometry && !Object.values(GEO).includes(o.geometry)) o.geometry.dispose();
    });
  }

  function rebuildTrack(withFinish) {
    disposeGroup(trackGroup);
    trackGroup = new THREE.Group();
    const pls = lay.pieces.slice();
    if (withFinish) pls.push(Object.assign({ type: 'finish' }, lay.next));
    pieces = pls.map((pl, i) => buildPiece(pl, i, trackGroup));
    scene.add(trackGroup);
    path = [];
    pieces.forEach((pc) => pc.frames.slice(0, 8).forEach((f, i) => path.push({ p: f.p, fwd: f.fwd, right: f.right, piece: pc, t: i / 8 })));
    const last = pieces[pieces.length - 1].frames[8];
    path.push({ p: last.p, fwd: last.fwd, right: last.right, piece: pieces[pieces.length - 1], t: 1 });
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
      map: marbleTexture(rc.color, rc.stripe), roughness: 0.2, metalness: 0.15 }));
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
  const SPAWNS = [[-0.62, -0.6], [0.62, -0.6], [-0.62, -1.45], [0.62, -1.45]];

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
      if (tmpN.y > 0.55) m.lastPiece = piece.idx;
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
        resolve(m, tmpN, bestPen + R, tmpV.clone(), 0.5, 0);
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
          resolve(m, tmpN, R - d, tmpV.clone(), 0.5, 0);
          hit = true;
        }
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
            m.vel.x += -tmpN.z * side * 1.8;
            m.vel.z += tmpN.x * side * 1.8;
            o.flash = 1;
            if (!m.ai || near(m)) sfxBoing();
          }
          hit = !o.bumper;
        }
      }
    }
    // obstacles shove, but never launch a marble into the sky
    if (hit) {
      if (m.vel.y > 3) m.vel.y = 3;
      if (o.kind !== 'cyl' && !m.ai && m.bonkCool <= 0) { sfxBonk(); m.bonkCool = 0.4; }
    }
  }
  const near = (m) => m.pos.distanceToSquared(player.pos) < 36;

  function collideMarbles() {
    for (let i = 0; i < marbles.length; i++) for (let j = i + 1; j < marbles.length; j++) {
      const a = marbles[i], b = marbles[j];
      if (a.ghost > 0 || b.ghost > 0) continue;
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
        if (d < best) { best = d; bestIdx = k; bestT = i / 8; }
      }
    }
    // don't let a marble that fell onto another part of the run jump far ahead
    if (best < 9) { m.pieceIdx = bestIdx; m.t = bestT; }
  }
  const progressOf = (m) => m.finished ? 1000 - m.finishTime : m.pieceIdx + m.t;

  function frameAt(m) {
    const fr = pieces[m.pieceIdx].frames;
    const k = Math.min(7, Math.floor(m.t * 8));
    return fr[k];
  }

  // ---------- Race ----------
  let mode = 'build';       // 'build' | 'race'
  let raceTime = 0;         // negative during the countdown
  let lastCount = 4;
  let obstacleTime = 0;
  let starsGot = 0;
  let results = null;       // set once the player crosses the line
  let resultsAt = 0;
  let finishOrder = [];

  function spawnAt(m, piece, a, b) {
    const f = pieceFrame(piece.pl, 0);
    toW(piece.B, a, f.y + R + 0.02, b, m.pos);
    m.vel.set(0, 0, 0);
    m.pieceIdx = piece.idx; m.t = 0; m.checkpoint = piece.idx; m.lastPiece = piece.idx;
    m.pathIdx = piece.idx * 8;
  }

  function startRace() {
    mode = 'race';
    rebuildTrack(true);
    raceTime = -3; lastCount = 4; obstacleTime = 0;
    starsGot = 0; results = null; finishOrder = [];
    marbles.forEach((m, i) => {
      spawnAt(m, pieces[0], SPAWNS[i][0], SPAWNS[i][1]);
      m.finished = false; m.ghost = 0; m.stuck = 0; m.mesh.visible = true;
      m.lane = (Math.random() - 0.5) * 1.2; m.laneTimer = 1 + Math.random() * 2;
      m.bonkCool = 0; m.airTime = 0;
    });
    camYaw = Math.atan2(pieces[0].frames[0].fwd.x, pieces[0].frames[0].fwd.z);
    snapCam = true;
    setHint();
  }

  function backToBuild() {
    mode = 'build';
    results = null;
    marbles.forEach((m) => { m.mesh.visible = false; });
    rebuildTrack(false);
    setHint();
  }

  function respawn(m) {
    const piece = pieces[Math.min(m.checkpoint, pieces.length - 1)];
    burst(m.pos.clone().setY(Math.max(m.pos.y, GROUND_Y + 0.3)), 0xffffff, 10);
    spawnAt(m, piece, m.ai ? m.lane * 0.5 : 0, -S / 2 + 0.7);
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
    const look = Math.min(path.length - 1, bi + 3);
    const tgt = path[look];
    m.laneTimer -= dt;
    if (m.laneTimer < 0) { m.lane = (Math.random() - 0.5) * 1.3; m.laneTimer = 1.5 + Math.random() * 2.5; }
    let lane = m.lane;
    const pc = tgt.piece;
    if (pc.gapAt) {
      // aim for the gap in the next row of gates
      const along = tmpD.subVectors(m.pos, pc.frames[4].p).dot(pc.frames[4].fwd);
      lane = along < -0.9 ? pc.gapAt[0] : along < 0.9 ? pc.gapAt[1] : 0;
    }
    if (pc.pl.type === 'bumpers') {
      // go round the middle bumper, then between the back two
      const along = tmpD.subVectors(m.pos, pc.frames[4].p).dot(pc.frames[4].fwd);
      lane = along < -0.4 ? (m.lane >= 0 ? 0.9 : -0.9) : 0;
    } else if (PIECES[pc.pl.type].turn) lane *= 0.4;
    const target = tmpQ.copy(tgt.p).addScaledVector(tgt.right, lane);
    const to = tmpN.subVectors(target, m.pos).setY(0);
    const dist = to.length() || 1;
    to.multiplyScalar(1 / dist);
    // slow down for bends
    const ahead = path[Math.min(path.length - 1, bi + 8)];
    const bend = tgt.fwd.dot(ahead.fwd);
    const speed = m.rc.speed * (bend < 0.6 ? 0.7 : 1);
    const desired = to.multiplyScalar(speed);
    const vh = tmpV.copy(m.vel).setY(0);
    const dv = desired.sub(vh);
    const len = dv.length();
    if (len > 0) dv.multiplyScalar(Math.min(1, len / 2) / len);
    m.input.copy(dv).multiplyScalar(m.rc.accel);
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
    const g = m.grounded;
    m.airTime = g ? 0 : m.airTime + dt;
    m.vel.y -= GRAVITY * dt;
    if (raceTime > 0 && !m.finished) {
      const ctrl = tmpV.copy(m.input).multiplyScalar(ACCEL * (g ? 1 : AIR_CONTROL));
      if (g) ctrl.projectOnPlane(m.groundN);
      // past top pushing speed, only pushes that slow you down still count
      const hs = Math.hypot(m.vel.x, m.vel.z);
      if (hs > PUSH_MAX && ctrl.dot(m.vel) > 0) ctrl.addScaledVector(m.vel, -ctrl.dot(m.vel) / m.vel.lengthSq());
      m.vel.addScaledVector(ctrl, dt);
      if (m.jump && m.airTime < COYOTE) {
        m.vel.y = Math.max(m.vel.y, 0) + JUMP_V;
        m.airTime = COYOTE;
        m.jump = false;
        if (!m.ai) sfxJump();
      }
    }
    if (g) m.vel.multiplyScalar(1 - ROLL_DRAG * dt);
    if (m.finished && g) m.vel.multiplyScalar(1 - 1.5 * dt);
    const sp = m.vel.length();
    if (sp > MAX_SPEED) m.vel.multiplyScalar(MAX_SPEED / sp);
    m.pos.addScaledVector(m.vel, dt);
    m.grounded = false;
    for (const pc of near) {
      if (!pc.box.containsPoint(m.pos)) continue;
      collideStatic(m, pc);
      for (const o of pc.obstacles) collideObstacle(m, o);
    }
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
      if (m.grounded && m.lastPiece !== undefined) m.checkpoint = Math.max(m.checkpoint, Math.min(m.lastPiece, pieces.length - 2));
      updateProgress(m);
      if (m.pos.y < GROUND_Y + R + 0.05 || m.pos.y < pieces[m.checkpoint].B.y0 - 14) respawn(m);
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
      m.mesh.visible = m.ghost <= 0 || Math.floor(m.ghost * 10) % 2 === 0;
    }

    // stars
    for (const pc of pieces) for (const st of pc.stars) {
      if (st.taken) continue;
      if (st.mesh.position.distanceToSquared(player.pos) < (R + 0.4) ** 2) {
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
    const key = save.track.join('.');
    const prevBest = save.best[key];
    const newBest = !prevBest || player.finishTime < prevBest;
    if (newBest) { save.best[key] = Math.round(player.finishTime * 100) / 100; writeSave(); }
    if (window.MickleScores) MickleScores.record('marble-rumble', score);
    results = { place, score, time: player.finishTime, stars: starsGot, nPieces, newBest, best: save.best[key], shown: false };
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
    if (mode === 'build') {
      buildYaw += (buildYawTarget - buildYaw) * Math.min(1, dt * 6);
      const box = new THREE.Box3();
      lay.pieces.forEach((pl) => box.expandByPoint(new THREE.Vector3(pl.x * S, pl.level * LH, pl.z * S)));
      const end = new THREE.Vector3(lay.next.x * S, lay.next.level * LH, lay.next.z * S);
      box.expandByPoint(end);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      wantLook.copy(center).lerp(end, 0.55);
      const dist = Math.max(16, Math.min(46, Math.max(size.x, size.z) * 0.9 + 8));
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
      wantPos.set(player.pos.x - fx * 5.2, player.pos.y + 3.0, player.pos.z - fz * 5.2);
      wantLook.set(player.pos.x + fx * 2.5, player.pos.y + 0.2, player.pos.z + fz * 2.5);
    }
    if (snapCam) { camPos.copy(wantPos); camLook.copy(wantLook); snapCam = false; }
    const k = Math.min(1, dt * (mode === 'build' ? 4 : 7));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    sun.position.set(camLook.x + 12, camLook.y + 30, camLook.z + 8);
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
      say(PIECES[type].dl === -1 && lay.next.level <= 0 ? 'TOO LOW FOR A RAMP DOWN!' :
        PIECES[type].dl === 1 && lay.next.level >= MAX_LEVEL ? 'TOO HIGH FOR A RAMP UP!' : 'NO ROOM THERE -- TRY ANOTHER PIECE');
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
    const weights = { straight: 3, left: 2, right: 2, down: 4, up: 0.6, spinner: 1.2, gates: 1.2, bumpers: 1.2, hammer: 1.2 };
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
    save.track = best;
    lay = layout(save.track);
    writeSave();
    [523, 659, 784].forEach((f, i) => beep(f, 0.08, 'square', 0.07, i * 0.06));
    rebuildTrack(false);
  }
  function tryRace() {
    if (!save.track.length) { sfxNope(); say('ADD SOME PIECES FIRST!'); return; }
    unlockAudio();
    startRace();
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

  const touch = MickleTouch.create({
    toggleParent: document.getElementById('topbar'),
    buttons: [{ id: 'jump', label: 'JUMP' }],
    onPress(id) { unlockAudio(); if (id === 'jump' && mode === 'race') primary(); },
    onStep(dx) { if (mode === 'build') selectPiece(sel + dx); },
  });

  // A / Space / tap-the-jump-button: place a piece, jump, or race again
  function primary() {
    if (mode === 'build') addPiece();
    else if (results && results.shown) startRace();
    else if (raceTime > 0) jumpQueued = true;
  }
  function back() {
    if (mode === 'race') backToBuild();
    else undoPiece();
  }

  window.addEventListener('keydown', (e) => {
    unlockAudio();
    if (e.repeat && !['ArrowLeft', 'ArrowRight'].includes(e.code)) { keys[e.code] = true; return; }
    keys[e.code] = true;
    const c = e.code;
    if (mode === 'build') {
      if (c === 'ArrowLeft' || c === 'KeyA') selectPiece(sel - 1);
      else if (c === 'ArrowRight' || c === 'KeyD') selectPiece(sel + 1);
      else if (c === 'Space' || c === 'Enter') primary();
      else if (c === 'Backspace' || c === 'Delete' || c === 'KeyZ') undoPiece();
      else if (c === 'KeyR' || c === 'KeyP') tryRace();
      else if (c === 'KeyQ') { buildYawTarget -= Math.PI / 2; sfxSelect(); }
      else if (c === 'KeyE') { buildYawTarget += Math.PI / 2; sfxSelect(); }
      else if (c === 'KeyS') surpriseTrack();
      else return;
    } else {
      if (c === 'Space' || c === 'Enter') primary();
      else if (c === 'Escape' || c === 'Backspace' || c === 'KeyB') backToBuild();
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
    const p = hudPoint(e);
    const btn = hudButtons.find((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
    if (btn) { btn.fn(); e.preventDefault(); return; }
    if (mode === 'race' && !results) {
      // no on-screen controls? drag anywhere to roll, quick tap to jump
      drag.id = e.pointerId; drag.x0 = e.clientX; drag.y0 = e.clientY; drag.x = drag.y = 0; drag.t0 = performance.now();
      try { stage.setPointerCapture(e.pointerId); } catch (err) {}
    } else if (results && results.shown) startRace();
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
    if (mode === 'build') {
      const dx = Pad360.dxPressed();
      if (dx) selectPiece(sel + dx);
      if (Pad360.pressed(B.A)) primary();
      if (Pad360.pressed(B.B) || Pad360.pressed(B.X)) undoPiece();
      if (Pad360.pressed(B.Y) || Pad360.pressed(B.START)) tryRace();
      if (Pad360.pressed(B.LB)) { buildYawTarget -= Math.PI / 2; sfxSelect(); }
      if (Pad360.pressed(B.RB)) { buildYawTarget += Math.PI / 2; sfxSelect(); }
      if (Pad360.pressed(B.BACK)) surpriseTrack();
    } else {
      if (Pad360.pressed(B.A) || (results && results.shown && Pad360.pressed(B.START))) primary();
      if (Pad360.pressed(B.B) || Pad360.pressed(B.BACK)) back();
    }
  }

  function setHint() {
    hintEl.textContent = mode === 'build'
      ? 'LEFT/RIGHT PICK A PIECE — SPACE / A ADDS IT — BACKSPACE / B UNDO — R / Y RACE!'
      : 'ARROWS / STICK ROLL — SPACE / A JUMP — ESC / B BACK TO BUILDING';
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
      for (const [x, y] of [[0, 0.22], [-0.25, -0.22], [0.25, -0.22]]) { g.beginPath(); g.arc(x * s, y * s, s * 0.15, 0, Math.PI * 2); g.fill(); }
    } else if (type === 'hammer') {
      const a = Math.sin(performance.now() / 400) * 0.6;
      g.save(); g.translate(0, -s * 0.45); g.rotate(a);
      g.lineWidth = s * 0.08; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, s * 0.7); g.stroke();
      g.fillStyle = '#ffd23f'; g.fillRect(-s * 0.25, s * 0.62, s * 0.5, s * 0.26);
      g.restore();
    }
    g.restore();
  }

  function drawBuildHud() {
    const n = lay.pieces.length - 1;
    text('BUILD YOUR MARBLE RUN', 10, 14, 12, '#5ff3ff', 'left', '#5ff3ff');
    text('PIECES ' + n + '/' + MAX_PIECES + '   LEVEL ' + lay.next.level, 10, 30, 9, '#ffffff');
    const best = save.best[save.track.join('.')];
    if (best) text('BEST TIME ' + best.toFixed(2) + 's', 10, 43, 9, '#ffe14f');

    button('RACE! ▶', W - 96, 8, 88, 30, '#5dff8a', tryRace, true);
    button('UNDO', 8, 56, 66, 20, '#ffffff', undoPiece);
    button('SURPRISE!', 8, 80, 66, 20, '#ffe14f', surpriseTrack);
    button(clearArmed > 0 ? 'SURE?' : 'CLEAR', 8, 104, 66, 20, clearArmed > 0 ? '#ff7070' : '#ff9fbf', clearTrack);
    button('TURN ↻', 8, 128, 66, 20, '#9fd8ff', () => { buildYawTarget += Math.PI / 2; sfxSelect(); });

    // picker cards along the bottom
    const cw = 46, gap = 4, total = PALETTE.length * (cw + gap) - gap, x0 = (W - total) / 2, y0 = 214;
    PALETTE.forEach((type, i) => {
      const x = x0 + i * (cw + gap);
      const on = i === sel;
      const y = on ? y0 - 8 : y0;
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
      hudButtons.push({ x, y, w: cw, h: cw, fn: () => { if (sel === i) addPiece(); else selectPiece(i); } });
    });
    const def = PIECES[PALETTE[sel]];
    text(def.name, W / 2, y0 - 32, 12, '#ffffff', 'center', '#ffffff');
    text(def.tip + '  (TAP AGAIN TO ADD)', W / 2, y0 - 19, 8, '#ffe14f', 'center');
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
      if (d > 22) continue;
      text(m.rc.name, (p.x + 1) / 2 * W, (1 - p.y) / 2 * H, 8, m.rc.color, 'center');
    }

    const place = marbles.slice().sort((a, b) => progressOf(b) - progressOf(a)).indexOf(player);
    text(fmtTime(player.finished ? player.finishTime : raceTime), 10, 14, 13, '#ffffff');
    text('★ ' + starsGot, 10, 32, 12, '#ffd400');
    text(placeName(place), W / 2, 18, 20, ['#ffd400', '#e0e6ff', '#ffb06b', '#ffffff'][place], 'center', '#000');
    button('◀ BUILD', W - 74, 8, 66, 20, '#9fd8ff', backToBuild);

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
    const x = 110, y = 52, w = 260, h = 180;
    roundRect(x, y, w, h, 10);
    hctx.fillStyle = 'rgba(10,12,40,0.88)';
    hctx.fill();
    hctx.lineWidth = 3; hctx.strokeStyle = '#5ff3ff'; hctx.stroke();
    const cheer = ['YOU WON!', 'SUPER 2ND!', 'GREAT 3RD!', 'YOU FINISHED!'][results.place];
    text(cheer, W / 2, y + 20, 20, '#ffe14f', 'center', '#ff6b2c');
    const order = finishOrder.concat(marbles.filter((m) => !m.finished).sort((a, b) => progressOf(b) - progressOf(a)));
    order.forEach((m, i) => {
      const yy = y + 46 + i * 15;
      text(placeName(i), x + 30, yy, 10, '#ffffff');
      hctx.fillStyle = m.rc.color;
      hctx.beginPath(); hctx.arc(x + 70, yy, 5, 0, Math.PI * 2); hctx.fill();
      text(m.rc.name, x + 82, yy, 10, m === player ? '#ffe14f' : '#ffffff');
      text(m.finished ? fmtTime(m.finishTime) : 'ROLLING...', x + w - 24, yy, 10, '#ffffff', 'right');
    });
    text('★ ' + results.stars + ' STARS   TIME ' + fmtTime(results.time) + (results.newBest ? '  NEW BEST!' : ''), W / 2, y + 116, 9, '#ffd400', 'center');
    text('SCORE ' + results.score, W / 2, y + 133, 13, '#5dff8a', 'center', '#5dff8a');
    hudButtons = [];
    button('RACE AGAIN', x + 18, y + h - 34, 110, 24, '#5dff8a', startRace);
    button('BUILD MORE', x + w - 128, y + h - 34, 110, 24, '#9fd8ff', backToBuild);
  }

  function drawHud() {
    hctx.clearRect(0, 0, W, H);
    hudButtons = [];
    if (mode === 'build') drawBuildHud(); else drawRaceHud();
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
    if (mode === 'race') updateRace(dt);
    updateParticles(dt);
    updateCamera(dt);
    renderer.render(scene, camera);
    drawHud();
  }

  rebuildTrack(false);
  setHint();
  requestAnimationFrame(loop);
})();
