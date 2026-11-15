// Cozy Cove -- a very casual 3D island town builder (three.js).
//
// The map is a 64 x 64 grid of cells. A cell is water or land (level 1 is ground, 2-4 are
// hills, up to 20 for mountains) and can hold one thing: a HOUSE (1-120 floors), a SPECIAL
// building, NATURE, a PATH, a RIVER (with or without a bridge), a BEACH, or -- on water -- a
// DOCK. There is nothing to win or lose: tap or drag to build, tap (or hold) to grow or change.
//
// Houses "join up": every house is built from a middle block plus a connector toward each
// neighbour that is at least as tall on that floor, and the roof is a fan of 8 triangles
// whose edge / corner points lift to ridge height where a neighbour continues the roof.
// So a row of houses gets one long ridge, an L gets a valley, and a big block gets a hip roof.
(function () {
  'use strict';

  const view = document.getElementById('view');
  const stage = document.getElementById('stage');
  const ui = document.getElementById('ui');

  // ---------- Sizes ----------
  const N = 64;            // cells per side
  const T = 2;             // one cell, world units
  const HALF = T / 2;
  const LANDH = 0.5;       // land top above the water
  const FH = 1.1;          // one house floor
  let RH = 0.9;            // roof height
  const INSET = 0.2;       // house walls sit this far inside the cell edge
  const B = HALF - INSET;
  const MAXH = 120;        // house floors -- hold a house to keep stacking
  const MAXLV = 20;        // land levels: 1 is ground, 2-4 hills (LAND tool), up to 20 (MOUNTAIN tool)
  const HILLLV = 4;
  const STEP = 0.9;        // height of one hill level
  const SEABED = -0.7;
  const NONE = 0, HOUSE = 1, NATURE = 2, PATH = 3, DOCK = 4, SPECIAL = 5, RIVER = 6, BEACH = 7;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // E, S, W, N
  const NATURE_N = 6, PATH_N = 3, DOCK_N = 3, SPECIAL_N = 4, BEACH_N = 5;
  const RIVER_DIP = 0.55, RIVER_DEPTH = 0.37;   // a river's channel is cut this deep; the water stands this high in it
  const BEACH_DIP = 0.28;                       // beaches sit a little lower, so they slope gently into the sea
  // Islands: as many as you like. 'cozyCove.islands' lists them (id, name, homes, a small
  // picture), each one's cells live under 'cozyCove.island.<id>', and 'cozyCove.current'
  // remembers which one is open. The old three slots ('cozyCove.save', 'save2', 'save3')
  // become the first islands the first time this runs.
  const INDEX_KEY = 'cozyCove.islands', CUR_KEY = 'cozyCove.current';
  const islandKey = (id) => 'cozyCove.island.' + id;
  let islands = [], curId = '';
  let styleN = 0, weather = 0;      // saved with each island

  // Island styles: the six wall / roof colours, the land and sea, how steep roofs are, and
  // which tree the NATURE tool starts on.
  const STYLES = [
    { name: 'COZY', walls: [0xfff1d0, 0xffc2d1, 0xbfe3ff, 0xc8f0d0, 0xffe27a, 0xdccbff], roofs: [0xd9623b, 0xb8405e, 0x3d5a98, 0x2f8f83, 0x9a5a34, 0x7a55c7],
      grass: 0x86cc62, grass2: 0xb2dc74, high: 0xcfe08a, sand: 0xf5e3aa, cliff: 0xc2a273, deep: 0x2f9fbe, water: 0x39bfd6, rh: 0.9, tree: 0, hi: 'HELLO!' },
    { name: 'CARIBBEAN', walls: [0x35d0c8, 0xff7f6e, 0xffd23f, 0x9be04a, 0xff8fc8, 0x5fb8ff], roofs: [0xffffff, 0xe84a4a, 0xf4f4f4, 0x2a8fd0, 0xe84a4a, 0xffffff],
      grass: 0x7fd65a, grass2: 0xc0e860, high: 0xd8ec80, sand: 0xfff6dc, cliff: 0xe0c898, deep: 0x1fb5c9, water: 0x2fd6d0, rh: 0.65, tree: 2, hi: 'HEY THERE!' },
    { name: 'HAWAIIAN', walls: [0xe6c79a, 0xb9814f, 0xf3e6c8, 0x6fb7a5, 0xd99a5b, 0xf0b6a0], roofs: [0x5f8f3a, 0xc9a45a, 0x7a5a36, 0x3f7a4a, 0xc9a45a, 0x8a3f2f],
      grass: 0x4fb04a, grass2: 0x79c94f, high: 0x9fd060, sand: 0xe8d6a8, cliff: 0x5a4a44, deep: 0x1f7fb5, water: 0x2a9fd6, rh: 1.15, tree: 2, hi: 'ALOHA!' },
    { name: 'NORTHEAST', walls: [0xf4f1ea, 0xa9aaa6, 0x4a5f7a, 0xa8433a, 0xcfd6da, 0xe8dcc0], roofs: [0x55595f, 0x3d4248, 0x6a6f75, 0x2f3338, 0x4a4f55, 0x7a4a3a],
      grass: 0x7fb26a, grass2: 0x9cc07a, high: 0xb6c890, sand: 0xd9cfbd, cliff: 0x8c8a86, deep: 0x2a6f9a, water: 0x3a8fb5, rh: 1.2, tree: 1, hi: 'AHOY!' },
  ];
  const WEATHERS = ['SUNNY', 'RAIN', 'AUTUMN', 'SNOW'];
  // Holidays come by themselves on their dates (or pick one in the menu): Halloween from
  // 15 to 31 October, Christmas 1 to 26 December, New Year on 31 December and 1 January.
  const HOLIDAYS = ['', 'halloween', 'christmas', 'newyear'];
  const HOLINAME = { '': 'NONE', halloween: 'HALLOWEEN', christmas: 'CHRISTMAS', newyear: 'NEW YEAR' };
  function autoHoliday() {
    const d = new Date(), m = d.getMonth() + 1, day = d.getDate();
    if (m === 10 && day >= 15) return 'halloween';
    if (m === 12 && day <= 26) return 'christmas';
    if ((m === 12 && day === 31) || (m === 1 && day === 1)) return 'newyear';
    return '';
  }
  let holidayPick = 'auto';
  try { holidayPick = localStorage.getItem('cozyCove.holiday') || 'auto'; } catch (e) { /* storage can be off */ }
  const holiday = () => (holidayPick === 'auto' ? autoHoliday() : holidayPick === 'off' ? '' : holidayPick);

  const land = new Uint8Array(N * N);
  const kind = new Uint8Array(N * N);
  const hgt = new Uint8Array(N * N);
  const col = new Uint8Array(N * N);
  const vr = new Uint8Array(N * N);
  const twn = new Uint8Array(N * N);       // which town a building belongs to (0: none) -- keeps names stable
  const objs = new Array(N * N).fill(null);
  const anim = new Array(N * N).fill(null);
  const landAnim = new Array(N * N).fill(null);
  const chimneys = new Map();

  let clock = 0;
  const cx = (i) => i % N, cz = (i) => (i / N) | 0;
  const inb = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const wx = (x) => (x - N / 2 + 0.5) * T;
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const levelY = (lv) => (lv ? LANDH + (lv - 1) * STEP : SEABED);
  const visH = new Float32Array(N * N).fill(SEABED);   // the ground height on show (it eases toward groundY)
  // where the ground of cell i settles: its level, cut down for a river channel or a beach
  function groundY(i) {
    if (!land[i]) return SEABED;
    const y = levelY(land[i]);
    return kind[i] === RIVER ? y - RIVER_DIP : kind[i] === BEACH ? y - BEACH_DIP : y;
  }
  // a neighbouring house only joins up if it stands on ground of the same height
  const houseAt = (x, z, lv) => (inb(x, z) && kind[z * N + x] === HOUSE && land[z * N + x] === lv ? hgt[z * N + x] : 0);

  // ---------- Colours ----------
  const C = (hex) => new THREE.Color(hex);
  const WALLS = [0xfff1d0, 0xffc2d1, 0xbfe3ff, 0xc8f0d0, 0xffe27a, 0xdccbff];
  const ROOFS = [0xd9623b, 0xb8405e, 0x3d5a98, 0x2f8f83, 0x9a5a34, 0x7a55c7];
  const wallC = WALLS.map(C), roofC = ROOFS.map(C);
  const K = {
    door: C(0x8a5a36), wood: C(0xb98652), woodDark: C(0x8a5a36), stone: C(0xe2d2b0), stone2: C(0xcbb994),
    trunk: C(0x8a5a36), leaf: C(0x4fb04a), leaf2: C(0x7ccf5a), pine: C(0x2f8f5a), pine2: C(0x3fa56a),
    palm: C(0x5cc24a), pink: C(0xff9ec4), pink2: C(0xffc4dc), rock: C(0x9aa3ad), rock2: C(0xb9c1c9),
    white: C(0xffffff), red: C(0xe0503c), water: C(0x6fd3f0), chim: C(0xb5694a), sand: C(0xf2dc9b),
    yellow: C(0xffd84f), purple: C(0xa77bff), sail: C(0xfff8e8), hull: C(0xc0563c),
    dark: C(0x4a4038), orange: C(0xf29a3c), cream: C(0xfff1d0), cat: C(0x6a6660), sandC: C(0xe8cf8a), shell: C(0xffd9e0),
  };

  // ---------- Scene ----------
  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const SKY_DAY = C(0xa6e3ff), SKY_NIGHT = C(0x2a3470);
  scene.background = SKY_DAY.clone();
  scene.fog = new THREE.Fog(0xa6e3ff, 90, 230);

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 1500);
  const cam = { yaw: Math.PI / 4, yawT: Math.PI / 4, el: 0.72, dist: 46, distT: 46, tx: 0, tz: 0, ty: 0.5 };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fc78a, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(24, 40, 14);
  sun.castShadow = true;
  // the shadow box follows the camera and grows as you zoom out (see followCamera)
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 1; sun.shadow.camera.far = 320;
  sun.shadow.bias = -0.0015;
  scene.add(sun, sun.target);

  // ---------- Painted textures (made right here -- no image files) ----------
  // Tileable value noise, then a watercolour wash: soft blotches, darker lines where the
  // pigment pools at the edge of a blotch, and a little paper grain.
  function makeNoise(seed) {
    const tab = new Float32Array(4096);
    let r = seed * 7919 + 17;
    for (let n = 0; n < 4096; n++) { r = (r * 16807 + 11) % 2147483647; tab[n] = r / 2147483647; }
    return function (x, y, period) {
      const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
      const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
      const w = (a) => ((a % period) + period) % period;
      const h = (a, b) => tab[(w(a) * 64 + w(b) + period * 131) % 4096];
      const a = h(x0, y0), b = h(x0 + 1, y0), c = h(x0, y0 + 1), d = h(x0 + 1, y0 + 1);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    };
  }
  function washCanvas(size, seed, paper) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const g = cv.getContext('2d'), img = g.createImageData(size, size), d = img.data;
    const n1 = makeNoise(seed), n2 = makeNoise(seed + 99);
    let r = seed * 31 + 5;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      r = (r * 16807 + 11) % 2147483647;
      const grain = r / 2147483647 - 0.5;
      let L, warm;
      if (paper) {
        const f = n1(u * 32, v * 32, 32) * 0.6 + n1(u * 64, v * 64, 64) * 0.4;
        L = 0.95 + (f - 0.5) * 0.09 + grain * 0.06; warm = 0.035;
      } else {
        const f = n1(u * 4, v * 4, 4) * 0.5 + n1(u * 8, v * 8, 8) * 0.27 + n1(u * 16, v * 16, 16) * 0.15 + n1(u * 32, v * 32, 32) * 0.08;
        const pool = n2(u * 6, v * 6, 6) * 0.65 + n2(u * 12, v * 12, 12) * 0.35;
        const edge = Math.max(0, 1 - Math.abs(pool - 0.5) / 0.028);
        L = 0.94 + (f - 0.5) * 0.42 - edge * 0.1 + grain * 0.05;
        warm = (n2(u * 3 + 5, v * 3 + 5, 3) - 0.5) * 0.1;
      }
      L = Math.max(0, Math.min(1, L));
      const o = (y * size + x) * 4;
      d[o] = 255 * Math.min(1, L * (1 + warm)); d[o + 1] = 255 * L; d[o + 2] = 255 * Math.min(1, L * (1 - warm)); d[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cv;
  }
  function washTexture(seed) {
    const t = new THREE.CanvasTexture(washCanvas(256, seed));
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }
  const washTex = washTexture(7), waterTex = washTexture(23);
  waterTex.repeat.set(16, 16);
  // paper grain laid over the whole picture (a CSS layer that multiplies with the 3D view)
  const paperEl = document.getElementById('paper');
  if (paperEl) paperEl.style.backgroundImage = 'url(' + washCanvas(256, 3, true).toDataURL() + ')';

  const townMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map: washTex });
  const lightsMat = new THREE.MeshBasicMaterial({ vertexColors: true });      // holiday lights shine by themselves
  const GLOW_DAY = C(0x4f76a6), GLOW_NIGHT = C(0xffd98a);
  const glowMat = new THREE.MeshLambertMaterial({ color: GLOW_DAY.clone(), emissive: 0xffb040, emissiveIntensity: 0 });

  // Water: a big low-poly sheet whose points bob up and down. It moves with the camera
  // (snapped to its own grid, so the waves don't swim) and reaches past the fog, however far
  // out you zoom.
  const WATER_DAY = C(0x39bfd6), WATER_NIGHT = C(0x2a62a0);
  const WSIZE = 1600, WSEGS = 128, WSEG = WSIZE / WSEGS;
  const waterGeo = new THREE.PlaneGeometry(WSIZE, WSIZE, WSEGS, WSEGS);
  waterGeo.rotateX(-Math.PI / 2);
  waterTex.repeat.set(WSIZE / 20, WSIZE / 20);
  const waterMat = new THREE.MeshLambertMaterial({ color: WATER_DAY.clone(), flatShading: true, map: waterTex, transparent: true, opacity: 0.74 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  water.frustumCulled = false;
  scene.add(water);

  // Land: one smooth surface over the whole map, cut into 36 chunks so a change only redraws
  // the chunks round it. Each cell has a flat middle (so buildings sit level) and blends into
  // its neighbours across the cell edges -- rounded shores, soft hills -- and the higher the
  // ground gets, the straighter the slopes run, so mountains come to jagged peaks.
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const mix01 = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  const OFF = [0, 0.15, 0.3, 1.0, 1.7, 1.85];     // grid lines inside one cell: packed round the edges, one in the middle
  const LPC = OFF.length;
  const TCELLS = N + 2;                           // one extra ring of sea, so the edge can slope away
  const CHK = 11, CHN = TCELLS / CHK;             // 66 cells = 6 x 6 chunks of 11
  const CV = CHK * LPC + 1;                       // vertices along one chunk side
  const lineAt = (n) => Math.floor(n / LPC) * T + OFF[n % LPC] - TCELLS * T / 2;
  const chunkIdx = (function () {
    const a = new Uint16Array((CV - 1) * (CV - 1) * 6);
    let k = 0;
    for (let r = 0; r < CV - 1; r++) for (let c = 0; c < CV - 1; c++) {
      const n = r * CV + c;
      a[k++] = n; a[k++] = n + CV; a[k++] = n + 1; a[k++] = n + 1; a[k++] = n + CV; a[k++] = n + CV + 1;
    }
    return new THREE.BufferAttribute(a, 1);
  })();
  const terrMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: washTex });
  const chunks = [];
  for (let cb = 0; cb < CHN; cb++) for (let ca = 0; ca < CHN; ca++) {
    const pos = new Float32Array(CV * CV * 3), uv = new Float32Array(CV * CV * 2);
    for (let r = 0; r < CV; r++) for (let c = 0; c < CV; c++) {
      const n = r * CV + c, x = lineAt(ca * CHK * LPC + c), z = lineAt(cb * CHK * LPC + r);
      pos[n * 3] = x; pos[n * 3 + 2] = z;
      uv[n * 2] = x * 0.085; uv[n * 2 + 1] = z * 0.085;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(CV * CV * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(CV * CV * 3), 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(chunkIdx);
    const mesh = new THREE.Mesh(geo, terrMat);
    mesh.receiveShadow = true; mesh.castShadow = true;
    scene.add(mesh);
    chunks.push({ geo: geo, dirty: true });
  }
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(WSIZE, WSIZE), new THREE.MeshLambertMaterial({ color: 0x2f9fbe }));
  seabed.rotation.x = -Math.PI / 2; seabed.position.y = SEABED - 0.02;
  scene.add(seabed);

  const cellH = (a, c) => (inb(a, c) ? visH[c * N + a] : SEABED);
  const cellT = (a, c) => (inb(a, c) ? groundY(c * N + a) : SEABED);
  const MTN0 = levelY(HILLLV - 1), MTN1 = levelY(HILLLV + 2);
  // f: 0..1 between two cell middles. m = 0: flat middles with a soft S-slope between (hills);
  // m = 1: a straight line (mountain sides). m comes from the ground's height there, so it
  // changes smoothly and the surface never tears.
  function shape(f, m) {
    const k = 0.35 * (1 - m);
    const t = Math.max(0, Math.min(1, (f - k) / (1 - 2 * k)));
    const sm = t * t * (3 - 2 * t);
    return sm + (t - sm) * m;
  }
  function groundWith(h, x, z) {
    const gx = x / T + N / 2 - 0.5, gz = z / T + N / 2 - 0.5;
    const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
    const h00 = h(ix, iz), h10 = h(ix + 1, iz), h01 = h(ix, iz + 1), h11 = h(ix + 1, iz + 1);
    const lin = (h00 + (h10 - h00) * fx) * (1 - fz) + (h01 + (h11 - h01) * fx) * fz;
    const m = mix01(lin, MTN0, MTN1);
    const sx = shape(fx, m), sz = shape(fz, m);
    return (h00 + (h10 - h00) * sx) * (1 - sz) + (h01 + (h11 - h01) * sx) * sz;
  }
  const groundAt = (x, z) => groundWith(cellH, x, z);
  const groundAtT = (x, z) => groundWith(cellT, x, z);    // where the ground will settle (rivers' falls use this)
  const TC = { deep: C(0x2f9fbe), sand: C(0xf5e3aa), grass: C(0x86cc62), grass2: C(0xb2dc74), high: C(0xcfe08a), cliff: C(0xc2a273),
    rock: C(0x9a948c), snow: C(0xf6f9fc) };
  const terrNoise = makeNoise(31);
  const tc = new THREE.Color();
  const ROCK0 = levelY(6), ROCK1 = levelY(9), SNOW0 = levelY(11), SNOW1 = levelY(13);
  function rebuildChunk(ch) {
    const geo = ch.geo, pos = geo.attributes.position.array, nor = geo.attributes.normal.array, colr = geo.attributes.color.array;
    const count = pos.length / 3, e = 0.12;
    for (let n = 0; n < count; n++) {
      const x = pos[n * 3], z = pos[n * 3 + 2];
      const y = groundAt(x, z);
      pos[n * 3 + 1] = y;
      // normals from the slope itself, so neighbouring chunks light up the same at their seam
      const hx = (groundAt(x + e, z) - groundAt(x - e, z)) / (2 * e), hz = (groundAt(x, z + e) - groundAt(x, z - e)) / (2 * e);
      const il = 1 / Math.sqrt(hx * hx + 1 + hz * hz);
      nor[n * 3] = -hx * il; nor[n * 3 + 1] = il; nor[n * 3 + 2] = -hz * il;
      const blot = terrNoise((x + 200) * 0.28, (z + 200) * 0.28, 64);
      tc.copy(TC.grass).lerp(TC.grass2, blot).lerp(TC.high, mix01(y, LANDH + 0.2, LANDH + STEP * 3) * 0.8);
      if (y > LANDH - 0.1) tc.lerp(TC.cliff, mix01(0.93 - il, 0, 0.3) * 0.75);              // steep sides turn earthy
      if (y > ROCK0) tc.lerp(TC.rock, mix01(y, ROCK0, ROCK1) * (0.6 + blot * 0.35));          // bare rock up high
      if (y > SNOW0) tc.lerp(TC.snow, mix01(y + (blot - 0.5) * 1.2, SNOW0, SNOW1));             // snowy peaks
      if (y < 0.44) tc.lerp(TC.sand, 1 - mix01(y, 0.2, 0.44));                                // the beach
      if (y < 0.02) tc.lerp(TC.deep, 1 - mix01(y, -0.4, 0.02));                               // fading into deep water
      colr[n * 3] = tc.r; colr[n * 3 + 1] = tc.g; colr[n * 3 + 2] = tc.b;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.computeBoundingSphere();
    ch.dirty = false;
  }
  // cell i's height reaches one cell out, so the chunks under it and its 8 neighbours redraw
  function markTerrain(i) {
    const x = cx(i) + 1, z = cz(i) + 1;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const a = x + dx, b = z + dz;
      if (a < 0 || b < 0 || a >= TCELLS || b >= TCELLS) continue;
      chunks[Math.floor(b / CHK) * CHN + Math.floor(a / CHK)].dirty = true;
    }
  }
  function rebuildTerrain() { chunks.forEach(rebuildChunk); }
  function rebuildDirty() { for (let n = 0; n < chunks.length; n++) if (chunks[n].dirty) rebuildChunk(chunks[n]); }
  // start the ground of cell i easing to where it should settle
  function aimLand(i) {
    const to = groundY(i);
    if (Math.abs(visH[i] - to) > 0.001) landAnim[i] = { from: visH[i], to: to, t: 0, dur: 0.45 };
  }

  // ---------- Geometry builder (flat-shaded, vertex-coloured triangles) ----------
  function Builder() { this.p = []; this.c = []; }
  Builder.prototype.tri = function (a, b, c, k) {
    this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let n = 0; n < 3; n++) this.c.push(k.r, k.g, k.b);
  };
  Builder.prototype.quad = function (a, b, c, d, k) { this.tri(a, b, c, k); this.tri(a, c, d, k); };
  Builder.prototype.box = function (x0, y0, z0, x1, y1, z1, k) {
    this.quad([x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0], k);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], k);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], k);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], k);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], k);
  };
  // a box given along direction d (a0..a1) and across it (p0..p1)
  Builder.prototype.dirBox = function (d, a0, a1, p0, p1, y0, y1, k) {
    const e = (d + 1) % 4;
    const xa = a0 * DX[d] + p0 * DX[e], xb = a1 * DX[d] + p1 * DX[e];
    const za = a0 * DZ[d] + p0 * DZ[e], zb = a1 * DZ[d] + p1 * DZ[e];
    this.box(Math.min(xa, xb), y0, Math.min(za, zb), Math.max(xa, xb), y1, Math.max(za, zb), k);
  };
  // an upright wall facing direction d, `dist` out from the middle, from p0 to p1 across
  Builder.prototype.wall = function (d, dist, p0, p1, y0, y1, k) {
    const e = (d + 1) % 4;
    const P = (p, y) => [dist * DX[d] + p * DX[e], y, dist * DZ[d] + p * DZ[e]];
    this.quad(P(p1, y0), P(p0, y0), P(p0, y1), P(p1, y1), k);
  };
  // a flat top: a0..a1 along d, b0..b1 along the next direction round
  Builder.prototype.top = function (d, a0, a1, b0, b1, y, k) {
    const e = (d + 1) % 4;
    const P = (a, b) => [a * DX[d] + b * DX[e], y, a * DZ[d] + b * DZ[e]];
    this.quad(P(a0, b0), P(a0, b1), P(a1, b1), P(a1, b0), k);
  };
  // any three.js geometry, moved by a matrix
  const _v = new THREE.Vector3();
  Builder.prototype.add = function (geo, m, k) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const pos = g.attributes.position;
    for (let n = 0; n < pos.count; n++) {
      _v.fromBufferAttribute(pos, n).applyMatrix4(m);
      this.p.push(_v.x, _v.y, _v.z);
      this.c.push(k.r, k.g, k.b);
    }
  };
  Builder.prototype.empty = function () { return this.p.length === 0; };
  // ox / oz shift the wash so no two buildings are painted quite the same
  Builder.prototype.build = function (ox, oz) {
    const g = new THREE.BufferGeometry(), p = this.p, uv = [];
    ox = ox || 0; oz = oz || 0;
    for (let n = 0; n < p.length; n += 9) {
      const ux = p[n + 3] - p[n], uy = p[n + 4] - p[n + 1], uz = p[n + 5] - p[n + 2];
      const vx = p[n + 6] - p[n], vy = p[n + 7] - p[n + 1], vz = p[n + 8] - p[n + 2];
      const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
      for (let k = 0; k < 9; k += 3) {
        const x = p[n + k] + ox, y = p[n + k + 1], z = p[n + k + 2] + oz;
        if (ny >= nx && ny >= nz) uv.push(x * 0.3, z * 0.3);
        else if (nx >= nz) uv.push(z * 0.3, y * 0.3);
        else uv.push(x * 0.3, y * 0.3);
      }
    }
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.computeVertexNormals();
    return g;
  };
  const _e = new THREE.Euler(), _q = new THREE.Quaternion();
  function M(x, y, z, sx, sy, sz, rx, ry, rz) {
    _q.setFromEuler(_e.set(rx || 0, ry || 0, rz || 0));
    return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q,
      new THREE.Vector3(sx === undefined ? 1 : sx, sy === undefined ? 1 : sy, sz === undefined ? 1 : sz));
  }
  const ICO = new THREE.IcosahedronGeometry(1, 0);
  const ICO1 = new THREE.IcosahedronGeometry(1, 1);
  const CYL = new THREE.CylinderGeometry(1, 1, 1, 7);
  const CONE = new THREE.ConeGeometry(1, 1, 7);

  // ---------- Houses ----------
  function buildHouse(i, b, g, l) {
    const x = cx(i), z = cz(i), h = hgt[i], lv = land[i];
    const wc = wallC[col[i] % 6], rc = roofC[col[i] % 6];
    const hh = [], dg = [];
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      hh[d] = houseAt(x + DX[d], z + DZ[d], lv);
      dg[d] = houseAt(x + DX[d] + DX[e], z + DZ[d] + DZ[e], lv);   // the corner between d and e
    }
    const seed = vr[i];
    let doorDir = -1;
    for (let n = 0; n < 4; n++) { const d = (seed + n) % 4; if (hh[d] === 0) { doorDir = d; break; } }
    // COZY: cottages. CARIBBEAN: shutters and a veranda. HAWAIIAN: on stilts round a deck, under
    // deep thatch. NORTHEAST: shingles, white corner boards, dormers and a big brick chimney.
    const sty = styleN % STYLES.length;
    const lift = sty === 2 ? 0.38 : 0;
    const shutter = sty === 1 ? K.white : sty === 3 ? K.dark : null;
    const shingle = wc.clone().multiplyScalar(0.86);
    const P = (d, a, q, y) => { const e = (d + 1) % 4; return [a * DX[d] + q * DX[e], y, a * DZ[d] + q * DZ[e]]; };
    if (lift) {                         // a deck on posts, shared with any houses next door
      b.box(-HALF + 0.02, lift - 0.09, -HALF + 0.02, HALF - 0.02, lift, HALF - 0.02, K.wood);
      [[-0.85, -0.85], [0.85, -0.85], [-0.85, 0.85], [0.85, 0.85]].forEach(function (q) {
        b.box(q[0] - 0.06, lv > HILLLV ? -1.9 : -0.5, q[1] - 0.06, q[0] + 0.06, lift - 0.09, q[1] + 0.06, K.woodDark);
      });
      if (doorDir >= 0) {
        b.dirBox(doorDir, HALF - 0.02, HALF + 0.2, -0.3, 0.3, lift * 0.45, lift * 0.45 + 0.06, K.wood);
        b.dirBox(doorDir, HALF + 0.2, HALF + 0.42, -0.3, 0.3, 0, 0.06, K.wood);
      }
    }

    for (let k = 0; k < h; k++) {
      // the ground floor's walls run down into the ground, so a house never floats over a slope
      const yf = k * FH + lift, y1 = yf + FH, y0 = k ? yf : lift ? lift : lv > HILLLV ? -1.9 : -0.45;
      const kc = k % 2 ? wc.clone().multiplyScalar(0.94) : wc;
      const c = [], f = [];
      for (let d = 0; d < 4; d++) c[d] = hh[d] > k;
      for (let d = 0; d < 4; d++) f[d] = c[d] && c[(d + 1) % 4] && dg[d] > k;
      for (let d = 0; d < 4; d++) {
        const e = (d + 1) % 4, p = (d + 3) % 4;
        if (!c[d]) {
          b.wall(d, B, -B, B, y0, y1, kc);
          if (sty === 3) {             // shingle lines and white corner boards
            for (let q = 1; q < 4; q++) b.wall(d, B + 0.006, -B, B, yf + q * 0.27, yf + q * 0.27 + 0.025, shingle);
            b.wall(d, B + 0.012, -B, -B + 0.09, y0, y1, K.white);
            b.wall(d, B + 0.012, B - 0.09, B, y0, y1, K.white);
          }
          if (k === 0 && d === doorDir) {
            b.wall(d, B + 0.02, -0.2, 0.2, yf, yf + 0.7, K.door);
          } else if ((seed + k + d) % 3 === 0) {
            g.wall(d, B + 0.02, -0.5, -0.22, yf + 0.38, yf + 0.84, K.white);
            g.wall(d, B + 0.02, 0.22, 0.5, yf + 0.38, yf + 0.84, K.white);
            if (shutter) {
              b.wall(d, B + 0.025, -0.62, -0.5, yf + 0.36, yf + 0.86, shutter);
              b.wall(d, B + 0.025, 0.5, 0.62, yf + 0.36, yf + 0.86, shutter);
            }
          } else {
            g.wall(d, B + 0.02, -0.2, 0.2, yf + 0.38, yf + 0.84, K.white);
            if (shutter) {
              b.wall(d, B + 0.025, -0.33, -0.2, yf + 0.36, yf + 0.86, shutter);
              b.wall(d, B + 0.025, 0.2, 0.33, yf + 0.36, yf + 0.86, shutter);
            }
          }
          if (sty === 1 && k === 0 && d === doorDir) {     // the veranda: a little roof on posts, and a rail
            b.dirBox(d, B, B + 0.4, -0.78, 0.78, 0.92, 0.98, rc);
            b.dirBox(d, B + 0.34, B + 0.4, -0.78, -0.72, 0, 0.92, K.white);
            b.dirBox(d, B + 0.34, B + 0.4, 0.72, 0.78, 0, 0.92, K.white);
            b.dirBox(d, B + 0.34, B + 0.4, -0.78, -0.28, 0.3, 0.36, K.white);
            b.dirBox(d, B + 0.34, B + 0.4, 0.28, 0.78, 0.3, 0.36, K.white);
          }
        } else {
          if (!f[d]) b.wall(e, B, -HALF, -B, y0, y1, kc);
          if (!f[p]) b.wall(p, B, B, HALF, y0, y1, kc);
          if (k < h - 1 && !(hh[d] > k + 1)) b.top(d, B, HALF, -B, B, y1, kc);
        }
        if (f[d] && k < h - 1 && !(hh[d] > k + 1 && hh[e] > k + 1 && dg[d] > k + 1)) b.top(d, B, HALF, B, HALF, y1, kc);
      }
    }

    // Roof: middle, 4 edge points and 4 corner points. An edge point lifts to the ridge when
    // that neighbour is as tall or taller; a corner lifts when all three cells round it are.
    const yb = h * FH + lift;
    const eave = sty === 2 ? 0.2 : 0;            // thatch hangs out past the walls
    const mid = [], cor = [];
    let ridges = 0;
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      const up = hh[d] >= h;
      if (up) ridges++;
      const out = HALF + (hh[d] > h ? INSET : up ? 0 : eave);
      mid[d] = [out * DX[d], yb + (up ? RH : 0) - (up ? 0 : eave * 0.6), out * DZ[d]];
      const cu = hh[d] >= h && hh[e] >= h && dg[d] >= h;
      const co = cu ? HALF : HALF + eave;
      cor[d] = [co * (DX[d] + DX[e]), yb + (cu ? RH : 0) - (cu ? 0 : eave * 0.6), co * (DZ[d] + DZ[e])];
    }
    const top = [0, yb + RH, 0];
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      b.tri(top, cor[d], mid[d], rc);
      b.tri(top, mid[e], cor[d], rc);
    }
    if (sty === 2) {                   // a ragged thatch fringe under the open eaves
      const fr = rc.clone().multiplyScalar(0.78);
      for (let d = 0; d < 4; d++) {
        if (hh[d] >= h) continue;
        const e = (d + 1) % 4, a = mid[d], c0 = cor[(d + 3) % 4], c1 = cor[d];
        b.quad(c0, a, [a[0], a[1] - 0.16, a[2]], [c0[0], c0[1] - 0.16, c0[2]], fr);
        b.quad(a, c1, [c1[0], c1[1] - 0.16, c1[2]], [a[0], a[1] - 0.16, a[2]], fr);
        void e;
      }
      if (seed % 4 === 2 && doorDir >= 0) {        // a tiki torch by the steps
        const tp = P(doorDir, HALF + 0.3, 0.55, 0);
        b.box(tp[0] - 0.035, -0.3, tp[2] - 0.035, tp[0] + 0.035, 0.95, tp[2] + 0.035, K.woodDark);
        g.add(ICO, M(tp[0], 1.05, tp[2], 0.08, 0.13, 0.08), K.orange);
      }
    }
    if (sty === 3 && ridges === 0 && RH > 1) {     // dormer windows poking out of the roof
      for (let d = 0; d < 4; d++) {
        if (d === (seed + 1) % 4 || (h > 2 && d % 2)) continue;
        b.dirBox(d, 0.18, 0.6, -0.2, 0.2, yb + 0.06, yb + 0.5, wc);
        g.wall(d, 0.605, -0.11, 0.11, yb + 0.14, yb + 0.42, K.white);
        b.tri(P(d, 0.62, -0.25, yb + 0.5), P(d, 0.62, 0.25, yb + 0.5), P(d, 0.62, 0, yb + 0.74), rc);
        b.quad(P(d, 0.62, -0.25, yb + 0.5), P(d, 0.62, 0, yb + 0.74), P(d, 0.15, 0, yb + 0.74), P(d, 0.15, -0.25, yb + 0.5), rc);
        b.quad(P(d, 0.62, 0, yb + 0.74), P(d, 0.62, 0.25, yb + 0.5), P(d, 0.15, 0.25, yb + 0.5), P(d, 0.15, 0, yb + 0.74), rc);
      }
    }
    const hol = holiday();
    if (hol === 'halloween' && doorDir >= 0) {     // a jack-o'-lantern by the door
      const pp = P(doorDir, B + 0.32, 0.45, lift);
      b.add(ICO1, M(pp[0], pp[1] + 0.14, pp[2], 0.17, 0.14, 0.17), K.orange);
      b.box(pp[0] - 0.02, pp[1] + 0.26, pp[2] - 0.02, pp[0] + 0.02, pp[1] + 0.34, pp[2] + 0.02, K.pine);
      const f0 = P(doorDir, B + 0.49, 0.45, lift);
      g.add(ICO, M(f0[0], f0[1] + 0.17, f0[2], 0.035, 0.035, 0.035), K.yellow);
      g.add(ICO, M(f0[0] + (DX[(doorDir + 1) % 4]) * 0.07, f0[1] + 0.17, f0[2] + DZ[(doorDir + 1) % 4] * 0.07, 0.035, 0.035, 0.035), K.yellow);
    }
    if (hol === 'christmas' && l) {      // strings of coloured lights along the open eaves, a wreath on the door
      const bulbs = [C(0xff4040), C(0x40e060), C(0xffd040), C(0x40a0ff)];
      for (let d = 0; d < 4; d++) {
        if (hh[d] >= h) continue;
        const c0 = cor[(d + 3) % 4], c1 = cor[d];
        for (let q = 0; q <= 8; q++) {
          const t = q / 8, px = c0[0] + (c1[0] - c0[0]) * t, py = c0[1] + (c1[1] - c0[1]) * t - 0.05, pz = c0[2] + (c1[2] - c0[2]) * t;
          l.add(ICO, M(px, py - (q % 2) * 0.04, pz, 0.045, 0.045, 0.045), bulbs[(q + d + seed) % 4]);
        }
      }
      if (doorDir >= 0) {
        const wp = P(doorDir, B + 0.04, 0, lift + 0.82);
        b.add(new THREE.TorusGeometry(0.11, 0.035, 5, 10), M(wp[0], wp[1], wp[2], 1, 1, 1, 0, doorDir % 2 ? 0 : Math.PI / 2, 0), K.pine);
        l.add(ICO, M(wp[0], wp[1] - 0.1, wp[2], 0.03, 0.03, 0.03), C(0xff4040));
      }
    }
    // a chimney on some roofs (smoke comes out of these) -- on every Northeast house
    if ((seed % 3 === 0 || sty === 3) && ridges < 4 && sty !== 2) {
      const cw = sty === 3 ? 0.17 : 0.12, cp = sty === 3 ? 0.0 : 0.4;
      b.box(cp - cw, yb + 0.2, cp - cw, cp + cw, yb + RH + (sty === 3 ? 0.35 : 0.2), cp + cw, K.chim);
      if (sty === 3) b.box(cp - cw - 0.03, yb + RH + 0.3, cp - cw - 0.03, cp + cw + 0.03, yb + RH + 0.38, cp + cw + 0.03, K.chim.clone().multiplyScalar(0.8));
      chimneys.set(i, [wx(x) + cp, levelY(land[i]) + yb + RH + (sty === 3 ? 0.45 : 0.3), wx(z) + cp]);
    }
    // now and then a cat sits on the roof
    if (seed % 7 === 1 && ridges < 4 && !(h >= 3 && ridges === 0)) {
      const cy = yb + RH - 0.03, kc2 = seed % 2 ? K.cat : K.orange;
      b.box(-0.14, cy, -0.06, 0.1, cy + 0.14, 0.06, kc2);
      b.box(0.06, cy + 0.1, -0.07, 0.2, cy + 0.24, 0.07, kc2);
      b.tri([0.08, cy + 0.24, -0.06], [0.12, cy + 0.24, -0.06], [0.1, cy + 0.31, -0.06], kc2);
      b.tri([0.08, cy + 0.24, 0.06], [0.12, cy + 0.24, 0.06], [0.1, cy + 0.31, 0.06], kc2);
      b.box(-0.2, cy + 0.08, -0.02, -0.14, cy + 0.26, 0.02, kc2);
    }
    // a flag on a tall tower standing on its own
    if (h >= 3 && ridges === 0) {
      b.box(-0.03, yb + RH - 0.1, -0.03, 0.03, yb + RH + 0.8, 0.03, K.woodDark);
      b.tri([0.03, yb + RH + 0.8, 0], [0.03, yb + RH + 0.45, 0], [0.55, yb + RH + 0.62, 0], rc);
    }
  }

  // ---------- Nature (shared geometry per variant) ----------
  const natureGeo = [];
  function makeNature(v) {
    const b = new Builder();
    if (v === 0 || v === 3) {            // round tree / blossom tree
      const a = v === 0 ? K.leaf : K.pink, a2 = v === 0 ? K.leaf2 : K.pink2;
      b.add(CYL, M(0, 0.35, 0, 0.13, 0.7, 0.13), K.trunk);
      b.add(ICO, M(0, 1.1, 0, 0.62, 0.58, 0.62), a);
      b.add(ICO, M(0.32, 1.5, 0.12, 0.4, 0.38, 0.4, 0.5, 0.4), a2);
      b.add(ICO, M(-0.3, 0.9, -0.2, 0.36, 0.34, 0.36, 0.2, 1), a2);
    } else if (v === 1) {                // pine
      b.add(CYL, M(0, 0.2, 0, 0.11, 0.4, 0.11), K.trunk);
      b.add(CONE, M(0, 0.8, 0, 0.62, 0.9, 0.62), K.pine);
      b.add(CONE, M(0, 1.35, 0, 0.47, 0.8, 0.47, 0, 0.4), K.pine2);
      b.add(CONE, M(0, 1.85, 0, 0.3, 0.7, 0.3, 0, 0.8), K.pine);
      if (holiday() === 'christmas') {
        [[0.45, 0.75, 0, K.red], [-0.3, 0.9, 0.3, K.yellow], [0.1, 1.3, -0.35, K.purple], [-0.25, 1.35, -0.1, K.red], [0.2, 1.75, 0.15, K.yellow]].forEach(function (q) {
          b.add(ICO, M(q[0], q[1], q[2], 0.07, 0.07, 0.07), q[3]);
        });
        b.add(ICO, M(0, 2.28, 0, 0.13, 0.13, 0.05), K.yellow);
      }
    } else if (v === 2) {                // palm
      b.add(CYL, M(0, 0.3, 0, 0.11, 0.6, 0.11, 0, 0, -0.12), K.wood);
      b.add(CYL, M(0.1, 0.85, 0, 0.1, 0.6, 0.1, 0, 0, -0.25), K.wood);
      b.add(CYL, M(0.27, 1.38, 0, 0.09, 0.6, 0.09, 0, 0, -0.35), K.wood);
      for (let n = 0; n < 6; n++) {
        const a = n * Math.PI / 3;
        b.add(ICO, M(0.38 + Math.cos(a) * 0.42, 1.62, -Math.sin(a) * 0.42, 0.52, 0.07, 0.2, 0, a, -0.35), n % 2 ? K.palm : K.pine2);
      }
      b.add(ICO, M(0.3, 1.55, 0.1, 0.09, 0.09, 0.09), K.trunk);
      b.add(ICO, M(0.45, 1.56, -0.06, 0.09, 0.09, 0.09), K.trunk);
    } else if (v === 4) {                // flowers
      const cs = [K.pink, K.yellow, K.white, K.purple, K.red];
      for (let n = 0; n < 9; n++) {
        const fx = (rnd(n * 7 + 1) - 0.5) * 1.4, fz = (rnd(n * 7 + 2) - 0.5) * 1.4, fh = 0.18 + rnd(n + 40) * 0.16;
        b.box(fx - 0.02, 0, fz - 0.02, fx + 0.02, fh, fz + 0.02, K.pine2);
        b.add(ICO, M(fx, fh + 0.06, fz, 0.11, 0.09, 0.11), cs[n % cs.length]);
      }
      b.add(ICO, M(0, 0.08, 0, 0.3, 0.16, 0.3), K.leaf2);
    } else {                             // rocks
      b.add(ICO, M(-0.1, 0.25, 0, 0.5, 0.36, 0.44, 0.3, 0.5), K.rock);
      b.add(ICO, M(0.42, 0.14, 0.3, 0.26, 0.2, 0.24, 0, 1.2), K.rock2);
      b.add(ICO, M(0.2, 0.1, -0.45, 0.16, 0.13, 0.16), K.rock);
    }
    return b.build();
  }
  for (let v = 0; v < NATURE_N; v++) natureGeo[v] = makeNature(v);

  // ---------- Paths and docks ----------
  function buildPath(i, b, g) {
    const x = cx(i), z = cz(i), v = vr[i] % PATH_N;
    b.box(-0.5, 0, -0.5, 0.5, 0.06, 0.5, K.stone);
    for (let d = 0; d < 4; d++) {
      const nx = x + DX[d], nz = z + DZ[d];
      if (!inb(nx, nz)) continue;
      const k = kind[nz * N + nx], up = land[nz * N + nx] - land[i];
      if (k === DOCK && land[i] === 1) b.dirBox(d, 0.5, HALF + 0.3, -0.42, 0.42, -0.2, 0.05, K.stone2);
      else if ((k === PATH || (k === RIVER && hgt[nz * N + nx])) && up === 0) b.dirBox(d, 0.5, HALF, -0.42, 0.42, 0, 0.05, K.stone2);
      else if (k === HOUSE && up === 0) b.dirBox(d, 0.5, HALF + INSET, -0.3, 0.3, 0, 0.05, K.stone2);
      else if ((k === PATH || k === HOUSE) && up === 1) {      // steps up to the next level
        b.dirBox(d, 0.5, 0.7, -0.36, 0.36, 0, 0.05, K.stone2);
        for (let n = 0; n < 5; n++) {
          b.dirBox(d, 0.7 + n * 0.16, n === 4 ? 1.55 : 0.86 + n * 0.16, -0.36, 0.36, -0.2, (n + 1) * STEP / 5 + 0.04, n % 2 ? K.stone : K.stone2);
        }
      }
    }
    if (v === 1) {            // street lamp
      b.box(-0.05, 0, -0.05, 0.05, 1.15, 0.05, K.woodDark);
      b.box(-0.14, 1.15, -0.14, 0.14, 1.2, 0.14, K.woodDark);
      g.add(ICO, M(0, 1.34, 0, 0.15, 0.15, 0.15), K.white);
      b.add(CONE, M(0, 1.53, 0, 0.2, 0.14, 0.2), K.woodDark);
    } else if (v === 2) {     // fountain
      b.add(CYL, M(0, 0.16, 0, 0.6, 0.26, 0.6), K.rock2);
      b.add(CYL, M(0, 0.3, 0, 0.5, 0.02, 0.5), K.water);
      b.add(CYL, M(0, 0.45, 0, 0.1, 0.5, 0.1), K.rock);
      b.add(ICO, M(0, 0.78, 0, 0.16, 0.12, 0.16), K.water);
    }
  }
  function dockLink(x, z) { return inb(x, z) && (land[z * N + x] || kind[z * N + x] === DOCK); }
  function buildDock(i, b, g) {
    const x = cx(i), z = cz(i), v = vr[i] % DOCK_N;
    b.box(-0.72, 0.3, -0.72, 0.72, 0.42, 0.72, K.wood);
    for (let d = 0; d < 4; d++) {
      if (!dockLink(x + DX[d], z + DZ[d])) continue;
      // reach a little further toward land, whose shore now slopes away from the cell edge
      b.dirBox(d, 0.72, HALF + (land[(z + DZ[d]) * N + x + DX[d]] ? 0.4 : 0), -0.72, 0.72, 0.3, 0.42, K.wood);
    }
    const L = [0, 1, 2, 3].map((d) => dockLink(x + DX[d], z + DZ[d]));
    for (let d = 0; d < 2 && v === 0; d++) {
      if (!(L[d] && L[d + 2] && !L[d + 1] && !L[(d + 3) % 4])) continue;
      for (let side = -1; side <= 1; side += 2) {            // hand rails down both open sides
        b.dirBox(d, -HALF, HALF, side * 0.66 - 0.04, side * 0.66 + 0.04, 0.78, 0.86, K.woodDark);
        for (let a = -0.75; a <= 0.76; a += 0.5) b.dirBox(d, a - 0.04, a + 0.04, side * 0.66 - 0.04, side * 0.66 + 0.04, 0.42, 0.8, K.woodDark);
      }
    }
    for (let n = 0; n < 4; n++) {
      const px = n & 1 ? 0.6 : -0.6, pz = n & 2 ? 0.6 : -0.6;
      b.box(px - 0.08, -0.7, pz - 0.08, px + 0.08, 0.52, pz + 0.08, K.woodDark);
    }
    if (v === 1) {            // crates and a barrel
      b.box(-0.5, 0.42, -0.45, 0, 0.9, 0.05, K.stone2);
      b.box(-0.4, 0.9, -0.35, -0.05, 1.22, 0, K.wood);
      b.add(CYL, M(0.35, 0.66, 0.3, 0.2, 0.48, 0.2), K.woodDark);
    } else if (v === 2) {     // lighthouse
      b.add(CYL, M(0, 0.8, 0, 0.5, 0.76, 0.5), K.white);
      b.add(CYL, M(0, 1.5, 0, 0.44, 0.64, 0.44), K.red);
      b.add(CYL, M(0, 2.1, 0, 0.38, 0.56, 0.38), K.white);
      b.add(CYL, M(0, 2.42, 0, 0.5, 0.08, 0.5), K.woodDark);
      g.add(CYL, M(0, 2.66, 0, 0.26, 0.4, 0.26), K.white);
      b.add(CONE, M(0, 3.04, 0, 0.4, 0.36, 0.4), K.red);
    }
  }

  // ---------- Special buildings: shop, bakery, windmill, chapel ----------
  const TAPER = new THREE.CylinderGeometry(0.42, 0.62, 1, 8);
  const bladeGeo = (function () {
    const b = new Builder();
    const arm = new THREE.BoxGeometry(0.95, 0.07, 0.04); arm.translate(0.55, 0, 0);
    const sail = new THREE.BoxGeometry(0.7, 0.26, 0.02); sail.translate(0.66, 0.16, 0);
    for (let n = 0; n < 4; n++) {
      b.add(arm, M(0, 0, 0, 1, 1, 1, 0, 0, n * Math.PI / 2), K.woodDark);
      b.add(sail, M(0, 0, 0, 1, 1, 1, 0, 0, n * Math.PI / 2), K.cream);
    }
    return b.build();
  })();
  const spinners = new Set();
  function buildSpecial(i, b, g) {
    const v = vr[i] % SPECIAL_N, wc = wallC[col[i] % 6], rc = roofC[col[i] % 6];
    if (v <= 1) {                                    // shop / bakery: a striped awning out front
      const aw = v === 0 ? K.red : K.pink;
      b.box(-0.78, -0.45, -0.7, 0.78, 1.05, 0.7, wc);
      b.box(-0.88, 1.05, -0.8, 0.88, 1.2, 0.8, rc);
      for (let n = 0; n < 5; n++) {
        const x0 = -0.78 + n * 0.312, x1 = x0 + 0.312;
        b.quad([x0, 0.98, 0.7], [x0, 0.72, 1.12], [x1, 0.72, 1.12], [x1, 0.98, 0.7], n % 2 ? K.white : aw);
      }
      b.box(-0.16, 0, 0.7, 0.16, 0.64, 0.73, K.door);
      g.box(0.28, 0.24, 0.7, 0.64, 0.62, 0.73, K.white);
      g.box(-0.64, 0.24, 0.7, -0.28, 0.62, 0.73, K.white);
      b.box(-0.42, 1.2, -0.06, 0.42, 1.5, 0.06, aw);
      if (v === 1) {                                 // the bakery's oven chimney (it smokes) and a loaf for a sign
        b.box(0.4, 1.2, -0.6, 0.66, 1.75, -0.34, K.chim);
        chimneys.set(i, [wx(cx(i)) + 0.53, levelY(land[i]) + 1.85, wx(cz(i)) - 0.47]);
        b.add(ICO, M(0, 1.36, 0.08, 0.26, 0.11, 0.06), K.wood);
      }
    } else if (v === 2) {                            // windmill (its sails are a separate, turning mesh)
      b.add(TAPER, M(0, 0.85, 0, 1, 2.6, 1), K.white);
      b.add(CONE, M(0, 2.45, 0, 0.5, 0.6, 0.5), rc);
      b.box(-0.16, 0, 0.56, 0.16, 0.62, 0.62, K.door);
      g.box(-0.1, 1.1, 0.5, 0.1, 1.36, 0.54, K.white);
      b.box(-0.05, 1.95, 0.4, 0.05, 2.05, 0.7, K.woodDark);
    } else {                                         // chapel with a bell tower
      b.box(-0.6, -0.45, -0.85, 0.6, 1.0, 0.45, K.white);
      b.quad([-0.7, 1.0, -0.9], [-0.7, 1.0, 0.5], [0, 1.6, 0.5], [0, 1.6, -0.9], rc);
      b.quad([0.7, 1.0, 0.5], [0.7, 1.0, -0.9], [0, 1.6, -0.9], [0, 1.6, 0.5], rc);
      b.tri([-0.6, 1.0, -0.85], [0, 1.6, -0.85], [0.6, 1.0, -0.85], K.white);
      b.box(-0.32, -0.45, 0.35, 0.32, 2.05, 0.95, K.white);
      b.add(CONE, M(0, 2.5, 0.65, 0.46, 0.9, 0.46, 0, Math.PI / 7), rc);
      b.box(-0.03, 2.9, 0.62, 0.03, 3.3, 0.68, K.yellow);
      b.box(-0.13, 3.1, 0.62, 0.13, 3.16, 0.68, K.yellow);
      b.box(-0.14, 0, 0.95, 0.14, 0.62, 0.98, K.door);
      b.add(ICO, M(0, 1.62, 0.99, 0.11, 0.13, 0.06), K.yellow);
      g.box(0.6, 0.3, -0.6, 0.63, 0.8, -0.35, K.white);
      g.box(0.6, 0.3, -0.15, 0.63, 0.8, 0.1, K.white);
      g.box(-0.63, 0.3, -0.6, -0.6, 0.8, -0.35, K.white);
      g.box(-0.63, 0.3, -0.15, -0.6, 0.8, 0.1, K.white);
    }
  }

  // ---------- Rivers, waterfalls and river bridges ----------
  // A river cell is cut RIVER_DIP below its bank (see groundY) and filled with a flat sheet of
  // water. Where the next cell is lower -- more river, plain ground, or the sea -- the water
  // stops short of the edge and pours down a strip that follows the ground: a gentle outflow
  // into the sea at level 1, a proper waterfall off a hill or a mountain.
  const riverTex = waterTex.clone(); riverTex.repeat.set(1, 1); riverTex.needsUpdate = true;
  const riverMat = new THREE.MeshLambertMaterial({ color: WATER_DAY.clone(), map: riverTex, transparent: true, opacity: 0.86, side: THREE.DoubleSide });
  const fallTex = (function () {
    const cv = document.createElement('canvas');
    cv.width = 64; cv.height = 256;
    const g = cv.getContext('2d');
    g.fillStyle = '#7fd0ee'; g.fillRect(0, 0, 64, 256);
    for (let n = 0; n < 90; n++) {                       // soft white streaks running down
      const x = Math.random() * 64, y = Math.random() * 256, h = 30 + Math.random() * 90;
      g.fillStyle = 'rgba(235,250,255,' + (0.3 + Math.random() * 0.55) + ')';
      g.fillRect(x, y, 2 + Math.random() * 4, h);
      g.fillRect(x, y - 256, 2 + Math.random() * 4, h);
    }
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const fallMat = new THREE.MeshLambertMaterial({ color: 0xffffff, map: fallTex, transparent: true, opacity: 0.88, side: THREE.DoubleSide, emissive: 0x2a6f8a, emissiveIntensity: 0.25 });
  const fallSpots = new Map();        // cell -> where its falls land (spray comes up from there)
  // a strip of falling water: along d from a0 to a1, at heights y0 -> y1, halfw either side
  function FallBuilder() { this.p = []; this.uv = []; }
  FallBuilder.prototype.strip = function (d, a0, y0, a1, y1, hw, v0, v1) {
    const e = (d + 1) % 4;
    const P = (a, q, y) => [a * DX[d] + q * DX[e], y, a * DZ[d] + q * DZ[e]];
    const A = P(a0, -hw, y0), Bq = P(a0, hw, y0), Cq = P(a1, hw, y1), D = P(a1, -hw, y1);
    this.p.push(...A, ...Bq, ...Cq, ...A, ...Cq, ...D);
    this.uv.push(0, v0, 1, v0, 1, v1, 0, v0, 1, v1, 0, v1);
  };
  FallBuilder.prototype.build = function () {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeVertexNormals();
    return g;
  };
  // how far a river's water falls toward neighbour d: null (it doesn't), or the height it lands at
  function riverDrop(i, d) {
    const x = cx(i) + DX[d], z = cz(i) + DZ[d];
    if (!inb(x, z)) return { bot: 0 };
    const n = z * N + x;
    if (!land[n] || kind[n] === DOCK) return { bot: 0 };                          // out into the sea
    if (kind[n] === RIVER) return land[n] < land[i] ? { bot: levelY(land[n]) - 0.18 } : null;
    if (land[n] < land[i]) return { bot: groundY(n) + 0.04 };                     // spills onto lower ground
    return null;
  }
  const isBridge = (i) => kind[i] === RIVER && hgt[i] > 0;
  function bridgeAxis(i) {             // 0: the bridge spans along x, 1: along z (across the river)
    let rx = 0, rz = 0;
    for (let d = 0; d < 4; d++) {
      const x = cx(i) + DX[d], z = cz(i) + DZ[d];
      if (inb(x, z) && kind[z * N + x] === RIVER) { if (d % 2) rz++; else rx++; }
    }
    return rx > rz ? 1 : 0;
  }
  const bridgeLift = (r) => 0.08 + 0.34 * (1 - Math.min(1, r / 1.12) * Math.min(1, r / 1.12));
  function buildRiver(i, b, w, f) {
    const x = cx(i), z = cz(i), bank = levelY(land[i]), top = -0.18;
    const drops = [0, 1, 2, 3].map((d) => riverDrop(i, d));
    const ex = drops.map((dr) => (dr ? 0.62 : HALF));
    w.quad([ex[0], top, ex[1]], [ex[0], top, -ex[3]], [-ex[2], top, -ex[3]], [-ex[2], top, ex[1]], K.water);
    const spots = [];
    drops.forEach(function (dr, d) {
      if (!dr) return;
      const px0 = wx(x), pz0 = wx(z), pts = [];
      for (let k = 0; k <= 12; k++) {
        const a = 0.62 + k * 0.07;
        const gy = groundAtT(px0 + a * DX[d], pz0 + a * DZ[d]);
        pts.push([a, Math.min(bank + top, Math.max(dr.bot, gy + RIVER_DEPTH)) - bank]);
      }
      let vlen = 0, landA = -1;
      for (let k = 0; k < pts.length - 1; k++) {
        const seg = Math.hypot(pts[k + 1][0] - pts[k][0], pts[k + 1][1] - pts[k][1]);
        f.strip(d, pts[k][0], pts[k][1], pts[k + 1][0], pts[k + 1][1], 0.62, vlen * 0.7, (vlen + seg) * 0.7);
        vlen += seg;
        if (landA < 0 && pts[k + 1][1] <= dr.bot - bank + 0.02) landA = pts[k + 1][0];
      }
      if (bank + top - dr.bot > 0.35) {
        const a = landA < 0 ? 1.4 : landA;
        spots.push([px0 + a * DX[d], dr.bot + 0.05, pz0 + a * DZ[d], bank + top - dr.bot]);
      }
    });
    if (spots.length) fallSpots.set(i, spots);
    if (hgt[i]) {                      // an arched stone bridge across the channel
      const sd = bridgeAxis(i);
      for (let k = 0; k < 10; k++) {
        const a0 = -1.12 + k * 0.224, a1 = a0 + 0.224, y = bridgeLift(Math.abs((a0 + a1) / 2));
        b.dirBox(sd, a0, a1, -0.48, 0.48, y - 0.16, y, k % 2 ? K.stone : K.stone2);
        b.dirBox(sd, a0, a1, 0.4, 0.5, y, y + 0.22, K.stone2);
        b.dirBox(sd, a0, a1, -0.5, -0.4, y, y + 0.22, K.stone2);
      }
    }
  }

  // ---------- Beaches: sand, and tap again for something to put on it ----------
  function buildBeach(i, b) {
    const v = vr[i] % BEACH_N, cc = [K.red, K.yellow, K.purple, K.pink, K.orange][Math.floor(rnd(i + 3) * 5)];
    if (v === 1) {                     // beach umbrella and a towel
      b.box(-0.03, 0, -0.03, 0.03, 1.15, 0.03, K.white);
      for (let n = 0; n < 8; n++) {
        const a0 = n * Math.PI / 4, a1 = a0 + Math.PI / 4;
        b.tri([0, 1.4, 0], [Math.cos(a0) * 0.75, 1.08, Math.sin(a0) * 0.75], [Math.cos(a1) * 0.75, 1.08, Math.sin(a1) * 0.75], n % 2 ? K.white : cc);
      }
      b.box(0.12, 0.01, -0.28, 0.82, 0.03, 0.12, cc);
      b.box(0.12, 0.031, -0.28, 0.82, 0.04, -0.2, K.white);
    } else if (v === 2) {              // sandcastle
      b.box(-0.36, 0, -0.36, 0.36, 0.28, 0.36, K.sandC);
      for (let n = 0; n < 4; n++) {
        const px = n & 1 ? 0.3 : -0.3, pz = n & 2 ? 0.3 : -0.3;
        b.add(CYL, M(px, 0.25, pz, 0.13, 0.5, 0.13), K.sandC);
        b.add(CONE, M(px, 0.58, pz, 0.15, 0.18, 0.15), K.sandC);
      }
      b.box(-0.1, 0, 0.36, 0.1, 0.18, 0.37, K.dark);
      b.box(-0.01, 0.66, 0.29, 0.01, 0.98, 0.31, K.woodDark);
      b.tri([0.01, 0.98, 0.3], [0.01, 0.84, 0.3], [0.24, 0.91, 0.3], cc);
    } else if (v === 3) {              // starfish and shells
      for (let n = 0; n < 5; n++) {
        const a = n * Math.PI * 2 / 5;
        b.add(CYL, M(Math.cos(a) * 0.12 - 0.3, 0.02, Math.sin(a) * 0.12 + 0.2, 0.05, 0.04, 0.14, 0, -a, Math.PI / 2), K.orange);
      }
      [[0.35, -0.2, K.shell], [0.1, -0.45, K.white], [0.5, 0.3, K.shell], [-0.45, -0.35, K.white]].forEach(function (q) {
        b.add(ICO, M(q[0], 0.04, q[1], 0.09, 0.05, 0.07), q[2]);
      });
    } else if (v === 4) {              // deck chair and a cooler
      b.quad([-0.3, 0.2, -0.25], [-0.3, 0.2, 0.25], [0.35, 0.2, 0.25], [0.35, 0.2, -0.25], cc);
      b.quad([0.35, 0.2, -0.25], [0.35, 0.2, 0.25], [0.62, 0.62, 0.25], [0.62, 0.62, -0.25], cc);
      [[-0.28, -0.22], [-0.28, 0.22], [0.33, -0.22], [0.33, 0.22]].forEach(function (q) {
        b.box(q[0] - 0.02, 0, q[1] - 0.02, q[0] + 0.02, 0.2, q[1] + 0.02, K.woodDark);
      });
      b.box(-0.7, 0, -0.15, -0.4, 0.24, 0.15, K.white);
      b.box(-0.7, 0.24, -0.15, -0.4, 0.3, 0.15, K.red);
    } else {                           // just sand, and a shell or two
      b.add(ICO, M(0.3, 0.03, -0.25, 0.07, 0.04, 0.06), K.shell);
      b.add(ICO, M(-0.35, 0.03, 0.3, 0.06, 0.035, 0.05), K.white);
    }
  }

  // ---------- Cell visuals ----------
  function refresh(i) {
    const old = objs[i];
    if (old) {
      scene.remove(old);
      if (old.userData.own) old.geometry.dispose();
      old.children.forEach(function (c) { if (!c.userData.shared) c.geometry.dispose(); });
      objs[i] = null;
    }
    chimneys.delete(i);
    spinners.delete(i);
    fallSpots.delete(i);
    const k = kind[i];
    if (k === NONE) return;
    let mesh;
    if (k === NATURE) {
      mesh = new THREE.Mesh(natureGeo[vr[i] % NATURE_N], townMat);
      mesh.rotation.y = rnd(i + 5) * 6.28;
      mesh.userData.size = 0.85 + rnd(i + 9) * 0.3;
    } else {
      const b = new Builder(), g = new Builder(), w = new Builder(), f = new FallBuilder(), l = new Builder();
      if (k === HOUSE) buildHouse(i, b, g, l);
      else if (k === PATH) buildPath(i, b, g);
      else if (k === SPECIAL) buildSpecial(i, b, g);
      else if (k === RIVER) buildRiver(i, b, w, f);
      else if (k === BEACH) buildBeach(i, b);
      else buildDock(i, b, g);
      mesh = new THREE.Mesh(b.build(wx(cx(i)), wx(cz(i))), townMat);
      mesh.userData.own = true;
      if (!g.empty()) mesh.add(new THREE.Mesh(g.build(), glowMat));
      if (!w.empty()) mesh.add(new THREE.Mesh(w.build(wx(cx(i)), wx(cz(i))), riverMat));
      if (!l.empty()) mesh.add(new THREE.Mesh(l.build(), lightsMat));
      if (f.p.length) { const fm = new THREE.Mesh(f.build(), fallMat); fm.receiveShadow = true; mesh.add(fm); }
      if (k === SPECIAL && vr[i] % SPECIAL_N === 2) {
        const blades = new THREE.Mesh(bladeGeo, townMat);
        blades.userData.shared = true;
        blades.position.set(0, 2.0, 0.72);
        blades.castShadow = true;
        mesh.add(blades);
        mesh.userData.spin = blades;
        spinners.add(i);
      }
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(wx(cx(i)), cellBaseY(i), wx(cz(i)));
    scene.add(mesh);
    objs[i] = mesh;
    poseCell(i);
  }
  // what a cell's mesh stands on: the water for a dock, the bank for a river, else the ground
  const cellBaseY = (i) => (kind[i] === DOCK ? 0 : kind[i] === RIVER ? visH[i] + RIVER_DIP : visH[i]);
  function poseCell(i) {
    const o = objs[i];
    if (!o) return;
    o.position.y = cellBaseY(i);
    const base = o.userData.size || 1;
    const a = anim[i];
    let sy = 1, sxz = 1;
    if (a) {
      const e = a.t / a.dur;
      if (e <= 0) { sy = sxz = 0.0001; }
      else if (a.type === 0) {                 // pop up out of the ground with an overshoot
        const u = e - 1;
        sy = 1 + 3.2 * u * u * u + 2.2 * u * u;
        const u2 = Math.min(1, e * 1.4) - 1;
        sxz = 1 + 2.6 * u2 * u2 * u2 + 1.6 * u2 * u2;
      } else {                                 // squash and stretch
        const w = Math.sin(e * Math.PI * 2.5) * (1 - e) * a.amp;
        sy = 1 - w; sxz = 1 + w * 0.6;
      }
    }
    o.scale.set(base * sxz, base * sy, base * sxz);
  }
  function pop(i, delay) { anim[i] = { t: -(delay || 0), dur: 0.42, type: 0 }; poseCell(i); }
  function bump(i, amp) { if (!anim[i] || anim[i].type === 1) anim[i] = { t: 0, dur: 0.45, type: 1, amp: amp }; }

  // rebuild changed cells and the 8 cells round each (neighbours change how things join up),
  // each one only once however many changed cells it touches
  function touchMany(list) {
    const seen = new Set();
    list.forEach(function (i) {
      const x = cx(i), z = cz(i);
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, z + dz)) seen.add((z + dz) * N + x + dx);
      aimLand(i);
    });
    seen.forEach(refresh);
    dirty = true;
  }
  const touch = (i) => touchMany([i]);

  // ---------- Particles ----------
  const PN = 260;
  const pMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff }), PN);
  pMesh.frustumCulled = false;
  scene.add(pMesh);
  const parts = [];
  for (let n = 0; n < PN; n++) {
    parts.push({ life: 0, max: 1, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, s: 0, grow: 0 });
    pMesh.setColorAt(n, K.white);
    pMesh.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
  }
  let pNext = 0;
  function spark(x, y, z, vx, vy, vz, color, size, life, g, grow) {
    const p = parts[pNext];
    p.x = x; p.y = y; p.z = z; p.vx = vx; p.vy = vy; p.vz = vz;
    p.s = size; p.life = p.max = life; p.g = g; p.grow = grow || 0;
    pMesh.setColorAt(pNext, color);
    pMesh.instanceColor.needsUpdate = true;
    pNext = (pNext + 1) % PN;
  }
  function burst(x, y, z, color, n, power) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * 6.28, r = (0.5 + Math.random()) * (power || 2.2);
      spark(x + Math.cos(a) * 0.5, y, z + Math.sin(a) * 0.5, Math.cos(a) * r, 2.5 + Math.random() * 3, Math.sin(a) * r,
        color, 0.09 + Math.random() * 0.09, 0.5 + Math.random() * 0.4, 12);
    }
  }
  function updateParts(dt) {
    for (let n = 0; n < PN; n++) {
      const p = parts[n];
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) { pMesh.setMatrixAt(n, tmpM.makeScale(0, 0, 0)); continue; }
      p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      const e = p.life / p.max;
      const s = p.grow ? p.s * (1 + (1 - e) * p.grow) * Math.min(1, e * 3) : p.s * Math.min(1, e * 2.5);
      tmpP.set(p.x, p.y, p.z); tmpS.set(s, s, s);
      pMesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    pMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Boats drifting round the island: a different kind for each style ----------
  const boats = [], boatGeos = [];
  function makeBoat(sty) {
    const b = new Builder();
    if (sty === 1) {                   // CARIBBEAN: a catamaran with a striped sail
      [-0.42, 0.42].forEach(function (q) {
        b.box(-0.9, 0, q - 0.12, 0.7, 0.24, q + 0.12, K.white);
        b.tri([0.7, 0, q - 0.12], [1.05, 0.24, q], [0.7, 0.24, q - 0.12], K.white);
        b.tri([0.7, 0, q + 0.12], [0.7, 0.24, q + 0.12], [1.05, 0.24, q], K.white);
      });
      b.box(-0.6, 0.24, -0.42, 0.5, 0.3, 0.42, K.wood);
      b.box(-0.04, 0.3, -0.04, 0.04, 2.0, 0.04, K.white);
      for (let n = 0; n < 4; n++) {
        const y0 = 0.45 + n * 0.38, y1 = y0 + 0.38, w0 = 0.95 - n * 0.22, w1 = 0.95 - (n + 1) * 0.22;
        b.quad([0.06, y0, 0], [0.06 + w0, y0, 0], [0.06 + w1, y1, 0], [0.06, y1, 0], n % 2 ? K.white : C(0xff6f9a));
      }
    } else if (sty === 2) {            // HAWAIIAN: an outrigger canoe with a crab-claw sail
      b.box(-1.1, 0, -0.16, 0.9, 0.22, 0.16, K.woodDark);
      b.tri([0.9, 0, -0.16], [1.3, 0.28, 0], [0.9, 0.22, -0.16], K.woodDark);
      b.tri([0.9, 0, 0.16], [0.9, 0.22, 0.16], [1.3, 0.28, 0], K.woodDark);
      b.box(-0.5, 0.22, -0.9, -0.42, 0.28, 0.16, K.wood);
      b.box(0.3, 0.22, -0.9, 0.38, 0.28, 0.16, K.wood);
      b.box(-0.8, 0.02, -1.0, 0.7, 0.12, -0.84, K.wood);
      b.box(-0.03, 0.22, -0.03, 0.03, 1.5, 0.03, K.woodDark);
      b.tri([0, 1.6, 0], [0.9, 0.5, 0], [0.35, 0.35, 0], C(0xe8c48a));
      b.tri([0, 1.6, 0], [0.35, 0.35, 0], [0, 0.4, 0], C(0xd9a86a));
    } else if (sty === 3) {            // NORTHEAST: a lobster boat with a little wheelhouse
      b.box(-0.9, 0, -0.36, 0.6, 0.36, 0.36, K.white);
      b.box(-0.9, 0.24, -0.37, 0.6, 0.3, 0.37, K.red);
      b.tri([0.6, 0, -0.36], [1.2, 0.4, 0], [0.6, 0.36, -0.36], K.white);
      b.tri([0.6, 0, 0.36], [0.6, 0.36, 0.36], [1.2, 0.4, 0], K.white);
      b.tri([0.6, 0.36, -0.36], [1.2, 0.4, 0], [0.6, 0.36, 0.36], K.wood);
      b.box(-0.2, 0.36, -0.28, 0.35, 0.95, 0.28, K.white);
      b.box(0.34, 0.6, -0.22, 0.36, 0.85, 0.22, C(0x7fb6d8));
      b.box(-0.25, 0.95, -0.32, 0.4, 1.02, 0.32, C(0x3d4248));
      [[-0.75, -0.15, K.yellow], [-0.55, 0.12, K.orange]].forEach(function (q) { b.box(q[0] - 0.08, 0.36, q[1] - 0.08, q[0] + 0.08, 0.5, q[1] + 0.08, q[2]); });
    } else {                           // COZY: a little sailboat
      b.box(-0.8, 0, -0.32, 0.6, 0.32, 0.32, K.hull);
      b.tri([0.6, 0, -0.32], [0.6, 0, 0.32], [1.25, 0.32, 0], K.hull);
      b.tri([0.6, 0.32, -0.32], [1.25, 0.32, 0], [0.6, 0.32, 0.32], K.hull);
      b.tri([0.6, 0, -0.32], [1.25, 0.32, 0], [0.6, 0.32, -0.32], K.hull);
      b.tri([0.6, 0, 0.32], [0.6, 0.32, 0.32], [1.25, 0.32, 0], K.hull);
      b.box(-0.04, 0.32, -0.04, 0.04, 2.1, 0.04, K.woodDark);
      b.tri([0.08, 0.5, 0], [0.08, 2.05, 0], [0.95, 0.5, 0], K.sail);
      b.tri([-0.08, 0.6, 0], [-0.75, 0.6, 0], [-0.08, 1.7, 0], K.sail);
    }
    return b.build();
  }
  const boatGeo = (sty) => boatGeos[sty] || (boatGeos[sty] = makeBoat(sty));
  [[80, 0.03, 0], [92, -0.022, 2.4], [104, 0.018, 4.4]].forEach(function (q) {
    const m = new THREE.Mesh(boatGeo(0), townMat);
    m.castShadow = true;
    m.scale.setScalar(1.6);
    scene.add(m);
    boats.push({ m: m, r: q[0], sp: q[1], a: q[2] });
  });

  // ---------- Villagers ----------
  // One little person per house floor (fewer out and about at night). They step out of a
  // house, stroll from cell to cell -- they like paths best -- and slip back inside when
  // there are more of them than homes. Two instanced meshes: bodies and heads.
  const VMAX = 48;
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const vBodyGeo = new THREE.CylinderGeometry(0.06, 0.13, 0.34, 6); vBodyGeo.translate(0, 0.17, 0);
  const vHeadGeo = new THREE.IcosahedronGeometry(0.1, 1); vHeadGeo.translate(0, 0.43, 0);
  const vBody = new THREE.InstancedMesh(vBodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: washTex }), VMAX);
  const vHead = new THREE.InstancedMesh(vHeadGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), VMAX);
  vBody.castShadow = true; vBody.frustumCulled = false; vHead.frustumCulled = false;
  scene.add(vBody, vHead);
  const SHIRTS = [0xe8665a, 0x4f8fd6, 0xf2b84b, 0x6cc070, 0xb07be0, 0xf08fb5, 0x4fc0c0, 0xffffff].map(C);
  // what they carry: an umbrella in the rain, a lantern after dark (shown per villager)
  const umbMesh = new THREE.InstancedMesh((function () {
    const b = new Builder();
    b.box(-0.012, 0.28, -0.012, 0.012, 0.8, 0.012, K.dark);
    for (let n = 0; n < 8; n++) {
      const a0 = n * Math.PI / 4, a1 = a0 + Math.PI / 4;
      b.tri([0, 0.88, 0], [Math.cos(a0) * 0.33, 0.74, Math.sin(a0) * 0.33], [Math.cos(a1) * 0.33, 0.74, Math.sin(a1) * 0.33], n % 2 ? K.white : K.cream);
    }
    return b.build();
  })(), townMat, 48);
  const lampMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.05, 0), glowMat, 48);
  [umbMesh, lampMesh].forEach(function (m) {
    m.frustumCulled = false;
    for (let n = 0; n < 48; n++) m.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
    scene.add(m);
  });
  const UMB = [0xff6f6f, 0xffd24f, 0x6fb8ff, 0x8fe06f, 0xd88fff, 0xff9fd0].map(C);
  // holiday hats: witch hats, Santa hats, party hats
  const hatGeos = {
    halloween: (function () { const b = new Builder(); b.add(CYL, M(0, 0.51, 0, 0.16, 0.02, 0.16), K.dark); b.add(CONE, M(0, 0.66, 0, 0.09, 0.28, 0.09), K.dark); b.box(-0.09, 0.53, -0.09, 0.09, 0.56, 0.09, K.purple); return b.build(); })(),
    christmas: (function () { const b = new Builder(); b.add(CYL, M(0, 0.52, 0, 0.11, 0.05, 0.11), K.white); b.add(CONE, M(0.02, 0.65, 0, 0.1, 0.22, 0.1, 0, 0, -0.25), K.red); b.add(ICO, M(0.06, 0.78, 0, 0.04, 0.04, 0.04), K.white); return b.build(); })(),
    newyear: (function () { const b = new Builder(); b.add(CONE, M(0, 0.64, 0, 0.08, 0.24, 0.08), C(0x6fd0ff)); b.add(ICO, M(0, 0.78, 0, 0.035, 0.035, 0.035), K.yellow); b.box(-0.08, 0.54, -0.08, 0.08, 0.57, 0.08, K.pink); return b.build(); })(),
  };
  const hatMesh = new THREE.InstancedMesh(hatGeos.christmas, townMat, 48);
  hatMesh.frustumCulled = false;
  for (let n = 0; n < 48; n++) hatMesh.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
  scene.add(hatMesh);
  for (let n = 0; n < 48; n++) umbMesh.setColorAt(n, UMB[n % UMB.length]);
  // the weather and the time of day decide how many are out, and what they say
  const SAYS = {
    sunny: ['HI!', 'NICE TOWN!', 'LOVELY DAY!', 'I LIVE HERE!', '\u2665', 'WHAT A VIEW!'],
    rain: ['I LOVE PUDDLES!', 'SPLISH SPLASH!', 'GOOD THING I HAVE AN UMBRELLA!', 'RAIN, RAIN!'],
    autumn: ['LOOK AT THE LEAVES!', 'CRUNCH CRUNCH!', 'SWEATER WEATHER!', 'APPLE PIE TIME!'],
    snow: ['SNOW DAY!', "LET'S BUILD A SNOWMAN!", 'BRRR, CHILLY!', 'I CAUGHT A SNOWFLAKE!'],
    night: ['GOOD NIGHT!', 'LOOK AT THE STARS!', 'TIME FOR HOT COCOA!', 'SO SLEEPY...'],
  };
  const pickLine = (list) => list[Math.floor(Math.random() * list.length)];
  function villagerLine() {
    const hol = holiday();
    if (hol && Math.random() < 0.5) return pickLine({ halloween: ['BOO!', 'TRICK OR TREAT!', 'HAPPY HALLOWEEN!', 'I AM A SPOOKY GHOST!'],
      christmas: ['MERRY CHRISTMAS!', 'HO HO HO!', 'I LOVE THE LIGHTS!', 'SNOW, PLEASE!'], newyear: ['HAPPY NEW YEAR!', 'LOOK, FIREWORKS!', 'CHEERS!'] }[hol]);
    if (night) return pickLine(SAYS.night);
    if (Math.random() < 0.3) return STYLES[styleN % STYLES.length].hi;
    return pickLine(SAYS[['sunny', 'rain', 'autumn', 'snow'][weather]]);
  }
  const outShare = () => (night ? (weather === 1 ? 0.12 : 0.33) : weather === 1 ? 0.25 : weather === 3 ? 0.6 : 1);
  const SKINS = [0xf6d3b3, 0xe2b48c, 0xc68e62, 0x8f5e3c].map(C);
  for (let n = 0; n < VMAX; n++) {
    vBody.setMatrixAt(n, tmpM.makeScale(0, 0, 0)); vHead.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
    vBody.setColorAt(n, SHIRTS[0]); vHead.setColorAt(n, SKINS[0]);
  }
  const villagers = [];
  let people = 0, spawnT = 0;
  const plainDock = (i) => kind[i] === DOCK && vr[i] % DOCK_N === 0;
  const walkable = (i) => plainDock(i) || isBridge(i) || (land[i] > 0 && (kind[i] === NONE || kind[i] === PATH || kind[i] === BEACH ||
    (kind[i] === NATURE && vr[i] % NATURE_N === 4)));
  const lvOf = (i) => (kind[i] === DOCK ? 1 : land[i]);       // a dock or bridge counts as ground level
  // the cells a villager could step to from cell i (never more than one level up or down)
  function stepsFrom(i) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const x = cx(i) + DX[d], z = cz(i) + DZ[d];
      if (!inb(x, z)) continue;
      const n = z * N + x;
      if (walkable(n) && Math.abs(lvOf(n) - lvOf(i)) <= 1) out.push(n);
    }
    return out;
  }
  function spawnVillager() {
    const houses = [];
    for (let i = 0; i < N * N; i++) if (kind[i] === HOUSE) houses.push(i);
    for (let tries = 0; tries < 6 && houses.length; tries++) {
      const h = houses[Math.floor(Math.random() * houses.length)];
      const opts = stepsFrom(h);
      if (!opts.length) continue;
      villagers.push({
        from: h, to: opts[Math.floor(Math.random() * opts.length)], t: 0, wait: 0, s: 0, bye: false,
        speed: 0.8 + Math.random() * 0.6, phase: Math.random() * 6, shirt: SHIRTS[Math.floor(Math.random() * SHIRTS.length)],
        skin: SKINS[Math.floor(Math.random() * SKINS.length)], side: (Math.random() - 0.5) * 0.5,
        hat: Math.random() < 0.6, ghost: Math.random() < 0.25,
      });
      return;
    }
  }
  function nextStep(v) {
    const opts = stepsFrom(v.to);
    let total = 0;
    const w = opts.map(function (n) {
      const k = (kind[n] === PATH ? 4 : 1) * (n === v.from ? 0.25 : 1);
      total += k;
      return k;
    });
    v.from = v.to; v.t = 0;
    if (!opts.length) { v.wait = 1; return; }
    let r = Math.random() * total;
    for (let n = 0; n < opts.length; n++) { r -= w[n]; if (r <= 0) { v.to = opts[n]; break; } }
    if (Math.random() < 0.3) v.wait = 0.5 + Math.random() * 2.5;      // stop and look around
  }
  function updateVillagers(dt) {
    const wanted = Math.min(VMAX, Math.ceil(people * outShare()));
    let out = 0;
    for (let n = 0; n < villagers.length; n++) if (!villagers[n].bye) out++;
    spawnT -= dt;
    if (out < wanted && villagers.length < VMAX && spawnT <= 0) { spawnVillager(); spawnT = 0.5; }
    else if (out > wanted) {
      for (let n = villagers.length - 1; n >= 0; n--) {
        if (villagers[n].bye) continue;
        villagers[n].bye = true;
        // a few of them say why they're heading in
        if (bubbles.length < 3 && Math.random() < 0.35 && villagers[n].s > 0.9) {
          say(villagers[n], night ? pickLine(['TIME FOR HOT COCOA!', 'GOOD NIGHT!', 'BEDTIME!', 'SO SLEEPY...']) :
            weather === 1 ? pickLine(['TOO WET!', 'TIME TO GO IN!', 'BRRR, RAINY!']) : pickLine(['BRRR!', 'SO COLD!', 'COCOA TIME!']));
        }
        break;
      }
    }
    for (let n = villagers.length - 1; n >= 0; n--) {
      const v = villagers[n];
      if (!walkable(v.to)) v.bye = true;                 // something was built here: pop inside
      v.s = Math.max(0, Math.min(1, v.s + (v.bye ? -dt * 3 : dt * 3)));
      if (v.bye && v.s <= 0) { villagers.splice(n, 1); v.gone = true; continue; }
      if (v.jump > 0) v.jump -= dt;
      if (v.wait > 0) v.wait -= dt;
      else {
        v.t += dt * v.speed / T;
        v.phase += dt * 11;
        if (v.t >= 1) nextStep(v);
      }
    }
    for (let n = 0; n < VMAX; n++) {
      const v = villagers[n];
      if (!v) { vBody.setMatrixAt(n, ZERO); vHead.setMatrixAt(n, ZERO); umbMesh.setMatrixAt(n, ZERO); lampMesh.setMatrixAt(n, ZERO); hatMesh.setMatrixAt(n, ZERO); continue; }
      const e = v.t * v.t * (3 - 2 * v.t);
      const ax = wx(cx(v.from)), az = wx(cz(v.from)), bx = wx(cx(v.to)), bz = wx(cz(v.to));
      // walk a little to one side of the line so people passing don't walk through each other
      const len = Math.hypot(bx - ax, bz - az) || 1, ox = -(bz - az) / len * v.side, oz = (bx - ax) / len * v.side;
      const x = ax + (bx - ax) * e + ox, z = az + (bz - az) * e + oz;
      const hop = v.jump > 0 ? Math.sin((1 - v.jump / 0.5) * Math.PI) * 0.45 : v.wait > 0 ? 0 : Math.abs(Math.sin(v.phase)) * 0.07;
      let gy = groundAt(x, z);
      if (kind[v.from] === DOCK || kind[v.to] === DOCK) gy = Math.max(gy, 0.42);      // up on the planks
      [v.from, v.to].forEach(function (c) {                                             // over the arch of a bridge
        if (isBridge(c)) gy = Math.max(gy, levelY(land[c]) + bridgeLift(Math.hypot(x - wx(cx(c)), z - wx(cz(c)))));
      });
      v.x = x; v.y = gy; v.z = z;
      tmpP.set(x, gy + hop, z);
      tmpS.set(v.s * 1.35, v.s * 1.35, v.s * 1.35);
      tmpM.compose(tmpP, tmpQ, tmpS);
      vBody.setMatrixAt(n, tmpM); vHead.setMatrixAt(n, tmpM);
      const hol = holiday(), sheet = hol === 'halloween' && v.ghost;
      vBody.setColorAt(n, sheet ? K.white : v.shirt); vHead.setColorAt(n, sheet ? K.white : v.skin);
      hatMesh.setMatrixAt(n, hol && v.hat && !sheet ? tmpM : ZERO);
      umbMesh.setMatrixAt(n, weather === 1 ? tmpM : ZERO);
      if (nightK > 0.5) {
        tmpP.set(x + 0.16 * v.s, gy + hop + 0.3 * v.s, z);
        lampMesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
      } else lampMesh.setMatrixAt(n, ZERO);
    }
    vBody.instanceMatrix.needsUpdate = vHead.instanceMatrix.needsUpdate = true;
    vBody.instanceColor.needsUpdate = vHead.instanceColor.needsUpdate = true;
    umbMesh.instanceMatrix.needsUpdate = lampMesh.instanceMatrix.needsUpdate = hatMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- Animals: sheep on open grass, ducks along the shore, gulls overhead ----------
  // ---------- Animals: sheep on open grass, ducks along the shore, cats round town, dogs out
  // walking with their people. Cats and dogs come in different coats (instance colours).
  const AMAX = [6, 6, 6, 8];
  const SHEEP = 0, DUCK = 1, CAT = 2, DOG = 3;
  function animalGeo(type) {
    const b = new Builder();
    if (type === SHEEP) {
      b.add(ICO1, M(0, 0.27, 0, 0.27, 0.2, 0.2), K.white);
      b.add(ICO, M(0.27, 0.32, 0, 0.11, 0.1, 0.09), K.dark);
      for (let n = 0; n < 4; n++) b.box((n & 1 ? 0.12 : -0.16), 0, (n & 2 ? 0.07 : -0.11), (n & 1 ? 0.16 : -0.12), 0.14, (n & 2 ? 0.11 : -0.07), K.dark);
    } else if (type === DUCK) {
      b.add(ICO1, M(0, 0.07, 0, 0.19, 0.11, 0.12), K.white);
      b.add(ICO, M(0.15, 0.2, 0, 0.075, 0.075, 0.07), K.white);
      b.box(0.2, 0.17, -0.03, 0.3, 0.21, 0.03, K.orange);
      b.tri([-0.17, 0.1, -0.05], [-0.17, 0.1, 0.05], [-0.27, 0.19, 0], K.white);
    } else if (type === CAT) {
      b.add(ICO1, M(0, 0.15, 0, 0.17, 0.1, 0.09), K.white);
      b.add(ICO1, M(0.16, 0.26, 0, 0.085, 0.08, 0.08), K.white);
      b.tri([0.14, 0.32, -0.07], [0.2, 0.32, -0.05], [0.17, 0.4, -0.06], K.white);
      b.tri([0.14, 0.32, 0.07], [0.17, 0.4, 0.06], [0.2, 0.32, 0.05], K.white);
      b.add(ICO, M(0.245, 0.25, 0, 0.018, 0.016, 0.018), K.pink);
      b.box(-0.2, 0.13, -0.015, -0.16, 0.36, 0.015, K.white);
      for (let n = 0; n < 4; n++) b.box((n & 1 ? 0.08 : -0.12), 0, (n & 2 ? 0.03 : -0.06), (n & 1 ? 0.11 : -0.09), 0.1, (n & 2 ? 0.06 : -0.03), K.white);
    } else {                            // dog
      b.box(-0.17, 0.12, -0.08, 0.15, 0.29, 0.08, K.white);
      b.box(0.12, 0.22, -0.075, 0.29, 0.38, 0.075, K.white);
      b.box(0.28, 0.23, -0.04, 0.37, 0.3, 0.04, K.white);
      b.add(ICO, M(0.375, 0.285, 0, 0.022, 0.02, 0.022), K.dark);
      b.box(0.14, 0.24, -0.1, 0.22, 0.37, -0.075, K.cream.clone().multiplyScalar(0.7));
      b.box(0.14, 0.24, 0.075, 0.22, 0.37, 0.1, K.cream.clone().multiplyScalar(0.7));
      b.box(0.1, 0.2, -0.085, 0.14, 0.24, 0.085, K.red);
      b.quad([-0.17, 0.26, -0.015], [-0.17, 0.26, 0.015], [-0.27, 0.4, 0.015], [-0.27, 0.4, -0.015], K.white);
      for (let n = 0; n < 4; n++) b.box((n & 1 ? 0.08 : -0.14), 0, (n & 2 ? 0.035 : -0.07), (n & 1 ? 0.12 : -0.1), 0.13, (n & 2 ? 0.07 : -0.035), K.white);
    }
    return b.build();
  }
  const COATS = [
    null, null,
    [0xf2a24a, 0x9a9590, 0x3a3634, 0xfff6ea, 0xe8c99a],          // cats: ginger, grey, black, white, cream
    [0xd9a45a, 0x8a5a36, 0x34302c, 0xfff8f0, 0xc8b8a0],          // dogs: golden, brown, black, white, sandy
  ].map((l) => l && l.map(C));
  const aMesh = [SHEEP, DUCK, CAT, DOG].map(function (type) {
    const m = new THREE.InstancedMesh(animalGeo(type), townMat, AMAX[type]);
    m.castShadow = type !== DUCK; m.frustumCulled = false;
    for (let n = 0; n < AMAX[type]; n++) { m.setMatrixAt(n, ZERO); m.setColorAt(n, K.white); }
    scene.add(m);
    return m;
  });
  const animals = [], wantA = [0, 0, 0, 0];
  const aSpawnT = [0, 0, 0, 0];      // each kind of animal comes out on its own clock
  const YAXIS = new THREE.Vector3(0, 1, 0), tmpQ2 = new THREE.Quaternion();
  function isShore(i) {
    if (land[i] || kind[i]) return false;
    const x = cx(i), z = cz(i);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, z + dz) && land[(z + dz) * N + x + dx]) return true;
    return false;
  }
  const roam = (type, i) => (type === SHEEP ? land[i] > 0 && kind[i] === NONE : type === DUCK ? isShore(i) : walkable(i));
  function roamSteps(type, i) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const x = cx(i) + DX[d], z = cz(i) + DZ[d];
      if (!inb(x, z)) continue;
      const n = z * N + x;
      if (roam(type, n) && (type === DUCK || Math.abs(lvOf(n) - lvOf(i)) <= 1)) out.push(n);
    }
    return out;
  }
  // cats stay in when it's dark or wet; sheep and ducks don't mind
  const animalShare = (type) => (type === CAT ? (night || weather === 1 ? 0 : weather === 3 ? 0.5 : 1) : 1);
  function spawnAnimal(type) {
    const a = { type: type, t: 1, wait: Math.random() * 2, s: 0, bye: false, jump: 0, phase: Math.random() * 6, ang: Math.random() * 6,
      x: 0, y: 0, z: 0, speed: type === DUCK ? 0.45 : type === CAT ? 0.38 : 0.32 };
    if (COATS[type]) a.coat = COATS[type][Math.floor(Math.random() * COATS[type].length)];
    if (type === DOG) {                 // a dog goes out with someone who hasn't got one yet
      const free = villagers.filter((v) => !v.bye && !v.dog && v.s > 0.5);
      if (!free.length) return;
      const v = free[Math.floor(Math.random() * free.length)];
      v.dog = true; a.owner = v; a.x = v.x || 0; a.z = v.z || 0; a.side = Math.random() < 0.5 ? -0.42 : 0.42;
      animals.push(a);
      return;
    }
    const c = [];
    for (let i = 0; i < N * N; i++) if (roam(type, i)) c.push(i);
    if (!c.length) return;
    a.from = a.to = c[Math.floor(Math.random() * c.length)];
    animals.push(a);
  }
  function updateAnimals(dt) {
    for (let type = 0; type < 4; type++) {
      aSpawnT[type] -= dt;
      const want = Math.floor(wantA[type] * animalShare(type));
      let out = 0;
      for (let n = 0; n < animals.length; n++) if (animals[n].type === type && !animals[n].bye) out++;
      if (out < want && aSpawnT[type] <= 0) { spawnAnimal(type); aSpawnT[type] = 0.9 + Math.random() * 0.6; }
      else if (out > want) {
        for (let n = animals.length - 1; n >= 0; n--) if (animals[n].type === type && !animals[n].bye) { animals[n].bye = true; break; }
      }
    }
    const used = [0, 0, 0, 0];
    for (let n = animals.length - 1; n >= 0; n--) {
      const a = animals[n];
      if (a.type === DOG) { if (!a.owner || a.owner.bye || a.owner.gone) a.bye = true; }
      else if (!roam(a.type, a.to)) a.bye = true;
      a.s = Math.max(0, Math.min(1, a.s + (a.bye ? -dt * 3 : dt * 3)));
      if (a.bye && a.s <= 0) { if (a.owner) a.owner.dog = false; animals.splice(n, 1); continue; }
      if (a.jump > 0) a.jump -= dt;
      let x, z, moving = false;
      if (a.type === DOG) {             // trot along beside its person, wait when they stop
        const o = a.owner, tx = (o.x || a.x) + a.side * Math.cos(clock * 0.3), tz = (o.z || a.z) + a.side * Math.sin(clock * 0.3);
        const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
        if (d > 6) { a.x = tx; a.z = tz; }
        else if (d > 0.25 && a.wait <= 0) {
          const sp = Math.min(d, dt * (d > 1 ? 3 : 1.6));
          a.x += dx / d * sp; a.z += dz / d * sp;
          moving = true;
          let da = Math.atan2(-dz, dx) - a.ang;
          da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          a.ang += da * Math.min(1, dt * 8);
        }
        if (a.wait > 0) a.wait -= dt;
        if (moving) a.phase += dt * 14;
        x = a.x; z = a.z;
        a.y = groundAt(x, z);
        [o.from, o.to].forEach(function (c) {
          if (c === undefined) return;
          if (kind[c] === DOCK) a.y = Math.max(a.y, 0.42);
          if (isBridge(c)) a.y = Math.max(a.y, levelY(land[c]) + bridgeLift(Math.hypot(x - wx(cx(c)), z - wx(cz(c)))));
        });
      } else {
        if (a.wait > 0) a.wait -= dt;
        else {
          a.t += dt * a.speed / T; a.phase += dt * 9; moving = true;
          if (a.t >= 1) {
            const o = roamSteps(a.type, a.to);
            a.from = a.to; a.t = 0;
            if (o.length) a.to = o[Math.floor(Math.random() * o.length)];
            // mostly they graze / paddle about; cats sit for ages
            a.wait = a.type === CAT ? (Math.random() < 0.7 ? 2 + Math.random() * 7 : 0) : Math.random() < 0.6 ? 1 + Math.random() * 4 : 0;
          }
        }
        const e = a.t * a.t * (3 - 2 * a.t);
        const ax = wx(cx(a.from)), az = wx(cz(a.from)), bx = wx(cx(a.to)), bz = wx(cz(a.to));
        x = ax + (bx - ax) * e; z = az + (bz - az) * e;
        if (a.to !== a.from) {
          let da = Math.atan2(-(bz - az), bx - ax) - a.ang;
          da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
          a.ang += da * Math.min(1, dt * 5);
        }
        a.x = x; a.z = z;
        if (a.type === DUCK) a.y = -0.03 + Math.sin(clock * 1.6 + a.phase) * 0.03;
        else {
          a.y = groundAt(x, z);
          if (kind[a.from] === DOCK || kind[a.to] === DOCK) a.y = Math.max(a.y, 0.42);
          [a.from, a.to].forEach(function (c) { if (isBridge(c)) a.y = Math.max(a.y, levelY(land[c]) + bridgeLift(Math.hypot(x - wx(cx(c)), z - wx(cz(c))))); });
        }
      }
      const hop = a.jump > 0 ? Math.sin((1 - a.jump / 0.5) * Math.PI) * 0.4 : 0;
      const bob = a.type !== DUCK && moving ? Math.abs(Math.sin(a.phase)) * (a.type === DOG ? 0.06 : 0.04) : 0;
      tmpP.set(x, a.y + hop + bob, z);
      tmpQ2.setFromAxisAngle(YAXIS, a.ang);
      const sc = a.s * (a.type === SHEEP || a.type === DUCK ? 1.3 : 1.2);
      tmpS.set(sc, a.type === CAT && !moving ? sc * 0.85 : sc, sc);
      if (used[a.type] < AMAX[a.type]) {
        aMesh[a.type].setMatrixAt(used[a.type], tmpM.compose(tmpP, tmpQ2, tmpS));
        if (a.coat) aMesh[a.type].setColorAt(used[a.type], a.coat);
        used[a.type]++;
      }
    }
    for (let type = 0; type < 4; type++) {
      for (let n = used[type]; n < AMAX[type]; n++) aMesh[type].setMatrixAt(n, ZERO);
      aMesh[type].instanceMatrix.needsUpdate = true;
      if (aMesh[type].instanceColor) aMesh[type].instanceColor.needsUpdate = true;
    }
  }

  // ---------- Snowmen pop up on open grass when it snows ----------
  const SNOWMAX = 6;
  const snowMesh = new THREE.InstancedMesh((function () {
    const b = new Builder();
    b.add(ICO1, M(0, 0.22, 0, 0.26, 0.24, 0.26), K.white);
    b.add(ICO1, M(0, 0.58, 0, 0.19, 0.18, 0.19), K.white);
    b.add(ICO1, M(0, 0.86, 0, 0.13, 0.13, 0.13), K.white);
    b.add(CONE, M(0.17, 0.86, 0, 0.03, 0.14, 0.03, 0, 0, -Math.PI / 2), K.orange);
    b.add(ICO, M(0.11, 0.92, -0.05, 0.022, 0.022, 0.022), K.dark);
    b.add(ICO, M(0.11, 0.92, 0.05, 0.022, 0.022, 0.022), K.dark);
    b.box(-0.015, 0.6, -0.42, 0.015, 0.63, -0.15, K.woodDark);
    b.box(-0.015, 0.6, 0.15, 0.015, 0.63, 0.42, K.woodDark);
    b.add(CYL, M(0, 1.02, 0, 0.12, 0.16, 0.12), K.dark);
    b.add(CYL, M(0, 0.95, 0, 0.18, 0.02, 0.18), K.dark);
    b.box(0.12, 0.66, -0.12, 0.2, 0.72, 0.12, K.red);
    return b.build();
  })(), townMat, SNOWMAX);
  snowMesh.castShadow = true; snowMesh.frustumCulled = false;
  scene.add(snowMesh);
  function placeSnowmen() {
    const spots = [];
    if (weather === 3) {
      for (let i = 0; i < N * N; i++) if (land[i] > 0 && land[i] <= HILLLV && kind[i] === NONE) spots.push(i);
      spots.sort((a, b) => rnd(a * 7 + 1) - rnd(b * 7 + 1));
    }
    for (let n = 0; n < SNOWMAX; n++) {
      const i = spots[n * 3];
      if (i === undefined) { snowMesh.setMatrixAt(n, ZERO); continue; }
      tmpP.set(wx(cx(i)) + (rnd(i) - 0.5) * 0.8, levelY(land[i]), wx(cz(i)) + (rnd(i + 1) - 0.5) * 0.8);
      tmpQ2.setFromAxisAngle(YAXIS, rnd(i + 2) * 6.28);
      tmpS.set(1, 1, 1);
      snowMesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ2, tmpS));
    }
    snowMesh.instanceMatrix.needsUpdate = true;
  }

  const gulls = [];
  (function () {
    const b = new Builder();
    b.box(-0.14, -0.03, -0.04, 0.16, 0.04, 0.04, K.white);
    b.tri([0.12, 0, 0], [-0.1, 0, 0], [0, 0.14, 0.62], K.white);
    b.tri([0.12, 0, 0], [0, 0.14, -0.62], [-0.1, 0, 0], K.white);
    const geo = b.build();
    [[13, 0.33, 0, 9], [19, -0.26, 2, 11], [24, 0.2, 4, 10]].forEach(function (q) {
      const m = new THREE.Mesh(geo, townMat);
      scene.add(m);
      gulls.push({ m: m, r: q[0], sp: q[1], a: q[2], h: q[3] });
    });
  })();

  // ---------- Fireworks: unlit sparks, so they shine against the night sky ----------
  const FWN = 400;
  const fwMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false }), FWN);
  fwMesh.frustumCulled = false;
  scene.add(fwMesh);
  const fw = [];
  for (let n = 0; n < FWN; n++) { fw.push({ life: 0 }); fwMesh.setMatrixAt(n, ZERO); fwMesh.setColorAt(n, K.white); }
  let fwNext = 0, fwT = 1, rockets = [];
  const FWC = [0xff5a5a, 0xffd84f, 0x5affa0, 0x5ac8ff, 0xd77aff, 0xffffff, 0xff9ad0].map(C);
  function fwSpark(x, y, z, vx, vy, vz, col, life, size) {
    const q = fw[fwNext];
    Object.assign(q, { x: x, y: y, z: z, vx: vx, vy: vy, vz: vz, life: life, max: life, size: size });
    fwMesh.setColorAt(fwNext, col);
    fwNext = (fwNext + 1) % FWN;
  }
  function launchFirework() {
    const a = Math.random() * 6.28, r = Math.random() * 14;
    rockets.push({ x: cam.tx + Math.cos(a) * r, y: 1, z: cam.tz + Math.sin(a) * r, vy: 16 + Math.random() * 5, t: 0.9 + Math.random() * 0.5,
      col: FWC[Math.floor(Math.random() * FWC.length)] });
    tone(300, 0.6, 'sine', 0.03, 0, 900);
  }
  function updateFireworks(dt) {
    if (holiday() === 'newyear' && nightK > 0.6 && started) {
      fwT -= dt;
      if (fwT <= 0) { fwT = 0.5 + Math.random() * 1.1; launchFirework(); }
    }
    for (let n = rockets.length - 1; n >= 0; n--) {
      const r = rockets[n];
      r.y += r.vy * dt; r.vy -= 6 * dt; r.t -= dt;
      fwSpark(r.x, r.y, r.z, 0, -1, 0, K.yellow, 0.3, 0.06);
      if (r.t <= 0) {                   // BANG: a ball of colour, sometimes two colours
        const c2 = Math.random() < 0.4 ? FWC[Math.floor(Math.random() * FWC.length)] : r.col;
        for (let k = 0; k < 46; k++) {
          const u = Math.random() * 2 - 1, th = Math.random() * 6.28, rr = Math.sqrt(1 - u * u), sp = 5 + Math.random() * 2;
          fwSpark(r.x, r.y, r.z, Math.cos(th) * rr * sp, u * sp, Math.sin(th) * rr * sp, k % 2 ? r.col : c2, 1.4 + Math.random() * 0.6, 0.12);
        }
        if (ac) { tone(90, 0.5, 'sine', 0.25, 0, 50); puff(sfxBus, ac.currentTime, 0.6, 2400, 0.12); }
        rockets.splice(n, 1);
      }
    }
    for (let n = 0; n < FWN; n++) {
      const q = fw[n];
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { fwMesh.setMatrixAt(n, ZERO); continue; }
      q.vy -= 3 * dt; q.vx *= 0.985; q.vz *= 0.985; q.vy *= 0.985;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt;
      const sc = q.size * Math.min(1, q.life / q.max * 2.5);
      tmpP.set(q.x, q.y, q.z); tmpS.set(sc, sc, sc);
      fwMesh.setMatrixAt(n, tmpM.compose(tmpP, tmpQ, tmpS));
    }
    fwMesh.instanceMatrix.needsUpdate = true;
    if (fwMesh.instanceColor) fwMesh.instanceColor.needsUpdate = true;
  }
  // Halloween nights: the gulls turn into bats
  const batGeo = (function () {
    const b = new Builder();
    b.box(-0.1, -0.04, -0.05, 0.12, 0.05, 0.05, K.dark);
    b.tri([0.06, 0, 0], [-0.08, 0, 0], [-0.1, 0.1, 0.55], K.dark);
    b.tri([0.06, 0, 0], [-0.1, 0.1, -0.55], [-0.08, 0, 0], K.dark);
    b.tri([0.12, 0.04, -0.04], [0.12, 0.04, 0.0], [0.16, 0.12, -0.02], K.dark);
    return b.build();
  })();
  let gullGeo = null;

  // ---------- Easter eggs: a ghost ship on dark nights, a friendly sea monster on sunny days ----------
  const eggs = [];
  const ghostMat = new THREE.MeshBasicMaterial({ color: 0xa8ffd8, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, fog: false });
  const ghostShip = new THREE.Mesh((function () {
    const b = new Builder();
    b.box(-1.6, 0, -0.45, 1.3, 0.5, 0.45, K.white);
    b.tri([1.3, 0, -0.45], [2.1, 0.6, 0], [1.3, 0.5, -0.45], K.white);
    b.tri([1.3, 0, 0.45], [1.3, 0.5, 0.45], [2.1, 0.6, 0], K.white);
    b.box(-1.7, 0.5, -0.45, -0.9, 1.0, 0.45, K.white);
    [-0.7, 0.3, 1.1].forEach(function (mx, k) {
      const h = [2.2, 2.8, 2.0][k];
      b.box(mx - 0.04, 0.5, -0.04, mx + 0.04, 0.5 + h, 0.04, K.white);
      for (let r = 0; r < 2; r++) {        // tattered sails
        const y0 = 1.0 + r * h * 0.4, y1 = y0 + h * 0.32;
        b.quad([mx, y0, -0.55], [mx, y0, 0.55], [mx + 0.12, y1, 0.45], [mx + 0.12, y1, -0.45], K.white);
      }
    });
    b.tri([1.1, 2.5, 0], [1.1, 2.2, 0], [1.55, 2.38, 0], K.white);
    return b.build();
  })(), ghostMat);
  ghostShip.visible = false;
  ghostShip.scale.setScalar(2.4);
  scene.add(ghostShip);
  const ghost = { on: false, t: 0, dur: 30, wait: 35 + Math.random() * 40, x: 0, y: 0.5, z: 0, ax: 0, az: 0, bx: 0, bz: 0, spook: 0 };
  eggs.push({ who: ghost, live: () => ghost.on, tap: function () {
    say(ghost, pickLine(['ARRR... BOO!', 'WOOOOO!', 'YO HO HOOOO...']));
    ghost.spook = 1.2;
    if (ac) { voice(sfxBus, 220, ac.currentTime, 0.4, 0.6, 1.4, 'sine', 0.08, 110); voice(sfxBus, 233, ac.currentTime, 0.4, 0.6, 1.4, 'sine', 0.06, 116); }
  } });
  function updateGhost(dt) {
    if (!ghost.on) {
      if (nightK > 0.85 && started && !walking) ghost.wait -= dt;
      if (ghost.wait > 0) return;
      // sail across the view, well out past the shore
      const a = Math.random() * 6.28, R = 38 + Math.random() * 18, L = 70;
      const ox = cam.tx + Math.cos(a) * R, oz = cam.tz + Math.sin(a) * R, px = -Math.sin(a), pz = Math.cos(a);
      Object.assign(ghost, { on: true, t: 0, ax: ox - px * L / 2, az: oz - pz * L / 2, bx: ox + px * L / 2, bz: oz + pz * L / 2 });
      ghostShip.visible = true;
      ghostShip.rotation.y = Math.atan2(-pz, px);
      if (ac) [196, 233, 277].forEach(function (f, k) { voice(sfxBus, f, ac.currentTime + k * 0.5, 1.2, 0.8, 2.5, 'sine', 0.03); });
    }
    ghost.t += dt * (ghost.spook > 0 ? 2.5 : 1);
    if (ghost.spook > 0) ghost.spook -= dt;
    const e = ghost.t / ghost.dur;
    if (e >= 1 || nightK < 0.5) { ghost.on = false; ghostShip.visible = false; ghost.wait = 60 + Math.random() * 90; return; }
    ghost.x = ghost.ax + (ghost.bx - ghost.ax) * e; ghost.z = ghost.az + (ghost.bz - ghost.az) * e;
    ghost.y = 0.6 + Math.sin(clock * 0.9) * 0.25;
    ghostShip.position.set(ghost.x, ghost.y, ghost.z);
    ghostShip.rotation.z = Math.sin(clock * 0.7) * 0.05;
    ghostMat.opacity = 0.45 * Math.min(1, e * 6, (1 - e) * 6) * (0.75 + Math.sin(clock * 3) * 0.25);
  }
  // the sea monster: three humps and a smiley head that come up out of the water
  const monster = new THREE.Group();
  (function () {
    const b = new Builder(), mc = C(0x5fbf8f), belly = C(0xd8f0a0);
    [-1.3, -0.5, 0.3].forEach(function (hx, k) {
      const r = 0.42 - k * 0.06;
      b.add(new THREE.TorusGeometry(r, 0.2, 6, 10, Math.PI), M(hx, -0.1, 0, 1, 1, 1), mc);
      b.add(CONE, M(hx, r + 0.22, 0, 0.08, 0.2, 0.08), C(0xffb84f));
    });
    b.add(CYL, M(1.05, 0.45, 0, 0.2, 1.1, 0.2, 0, 0, -0.3), mc);
    b.add(ICO1, M(1.25, 1.05, 0, 0.36, 0.3, 0.3), mc);
    b.add(ICO1, M(1.45, 0.95, 0, 0.18, 0.12, 0.2), belly);
    [[-0.13], [0.13]].forEach(function (q) {
      b.add(ICO1, M(1.38, 1.22, q[0], 0.09, 0.09, 0.09), K.white);
      b.add(ICO, M(1.45, 1.23, q[0], 0.045, 0.045, 0.045), K.dark);
    });
    b.add(CONE, M(1.15, 1.38, -0.12, 0.05, 0.18, 0.05, 0.3), C(0xffb84f));
    b.add(CONE, M(1.15, 1.38, 0.12, 0.05, 0.18, 0.05, -0.3), C(0xffb84f));
    const m = new THREE.Mesh(b.build(), townMat);
    m.castShadow = true;
    monster.add(m);
  })();
  monster.visible = false;
  monster.scale.setScalar(1.6);
  scene.add(monster);
  const sea = { on: false, t: 0, dur: 10, wait: 30 + Math.random() * 40, x: 0, y: 0, z: 0, hop: 0 };
  eggs.push({ who: sea, live: () => sea.on, tap: function () {
    say(sea, pickLine(['BLUB BLUB!', 'HELLO THERE!', 'I AM FRIENDLY!', 'SPLOOSH!']));
    sea.hop = 0.8;
    for (let k = 0; k < 10; k++) spark(sea.x + (Math.random() - 0.5) * 2, 0.1, sea.z + (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, 2 + Math.random() * 2, (Math.random() - 0.5) * 2, K.water, 0.1, 0.8, 6);
    if (ac) { tone(160, 0.3, 'sine', 0.15, 0, 90); tone(240, 0.3, 'sine', 0.1, 0.15, 120); }
  } });
  const deepWater = (x, z) => {
    const gx = Math.floor(x / T + N / 2), gz = Math.floor(z / T + N / 2);
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const a = gx + dx, b = gz + dz;
      if (inb(a, b) && (land[b * N + a] || kind[b * N + a])) return false;
    }
    return true;
  };
  function updateMonster(dt) {
    if (!sea.on) {
      if (nightK < 0.2 && weather !== 1 && started && !walking) sea.wait -= dt;
      if (sea.wait > 0) return;
      for (let tries = 0; tries < 20; tries++) {
        const a = Math.random() * 6.28, r = 12 + Math.random() * 16 + cam.dist * 0.15;
        const x = cam.tx + Math.cos(a) * r, z = cam.tz + Math.sin(a) * r;
        if (!deepWater(x, z)) continue;
        Object.assign(sea, { on: true, t: 0, x: x, z: z });
        monster.position.set(x, -2, z);
        monster.rotation.y = Math.random() * 6.28;
        monster.visible = true;
        for (let k = 0; k < 12; k++) spark(x + (Math.random() - 0.5) * 3, 0.1, z + (Math.random() - 0.5) * 3, 0, 2 + Math.random() * 2, 0, K.white, 0.12, 0.8, 6);
        splashSfx();
        return;
      }
      sea.wait = 10;
      return;
    }
    sea.t += dt;
    const e = sea.t / sea.dur;
    if (e >= 1) { sea.on = false; monster.visible = false; sea.wait = 50 + Math.random() * 80; return; }
    const up = Math.min(1, e * 6, (1 - e) * 6);
    if (sea.hop > 0) sea.hop -= dt;
    const hop = sea.hop > 0 ? Math.sin((1 - sea.hop / 0.8) * Math.PI) * 0.8 : 0;
    sea.y = -1.6 + up * 1.4 + Math.sin(clock * 2) * 0.1 + hop;
    monster.position.y = sea.y;
    monster.rotation.y += dt * 0.25;
    monster.rotation.z = Math.sin(clock * 1.5) * 0.06;
  }

  // ---------- Saying hello: tap a villager, sheep or duck ----------
  const bubbles = [];
  function say(who, text) {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.textContent = text;
    ui.appendChild(el);
    bubbles.push({ el: el, who: who, t: 1.9 });
  }
  function updateBubbles(dt) {
    const r = view.getBoundingClientRect();
    for (let n = bubbles.length - 1; n >= 0; n--) {
      const b = bubbles[n];
      b.t -= dt;
      if (b.t <= 0) { b.el.remove(); bubbles.splice(n, 1); continue; }
      _v.set(b.who.x, b.who.y + 1.0, b.who.z).project(camera);
      b.el.style.left = ((_v.x + 1) / 2 * r.width) + 'px';
      b.el.style.top = ((1 - _v.y) / 2 * r.height) + 'px';
      b.el.style.opacity = Math.min(1, b.t * 3);
    }
  }
  const HELLOS = ['HI!', 'NICE TOWN!', 'LOVELY DAY!', 'I LIVE HERE!', '♥'];
  function greet(px, py) {
    const r = view.getBoundingClientRect();
    let best = null, bd = 30;
    const all = villagers.concat(animals);
    for (let n = 0; n < all.length; n++) {
      const w = all[n];
      if (w.bye || w.x === undefined) continue;
      _v.set(w.x, w.y + 0.3, w.z).project(camera);
      const d = Math.hypot(r.left + (_v.x + 1) / 2 * r.width - px, r.top + (1 - _v.y) / 2 * r.height - py);
      if (d < bd) { bd = d; best = w; }
    }
    for (let n = 0; n < eggs.length; n++) {            // ghost ship and sea monster are big: easy to tap
      const g = eggs[n];
      if (!g.live()) continue;
      _v.set(g.who.x, g.who.y + 1.2, g.who.z).project(camera);
      const d = Math.hypot(r.left + (_v.x + 1) / 2 * r.width - px, r.top + (1 - _v.y) / 2 * r.height - py);
      if (d < 70 && _v.z < 1) { g.tap(); return true; }
    }
    if (!best) return false;
    best.wait = 1.7; best.jump = 0.5;
    const hi = STYLES[styleN % STYLES.length].hi;
    say(best, best.type === SHEEP ? 'BAA!' : best.type === DUCK ? 'QUACK!' : best.type === CAT ? pickLine(['MEOW!', 'PURRR...', 'MEW?']) :
      best.type === DOG ? pickLine(['WOOF!', 'ARF ARF!', 'BARK!']) : villagerLine());
    if (best.type === CAT || best.type === DOG) {        // pets get a little shower of hearts
      for (let n = 0; n < 6; n++) spark(best.x, best.y + 0.4, best.z, (Math.random() - 0.5) * 1.2, 1.6 + Math.random(), (Math.random() - 0.5) * 1.2, K.pink, 0.07, 0.9, 2);
    }
    void hi;
    pluck(7 + Math.floor(Math.random() * 4)); pluck(9 + Math.floor(Math.random() * 3), 0.12);
    return true;
  }

  // ---------- Weather: rain, falling leaves or snow drifting down round the camera ----------
  const WN = 500;
  const wArr = new Float32Array(WN * 3);
  for (let n = 0; n < WN; n++) { wArr[n * 3] = (Math.random() - 0.5) * 70; wArr[n * 3 + 1] = Math.random() * 24; wArr[n * 3 + 2] = (Math.random() - 0.5) * 70; }
  const wGeo = new THREE.BufferGeometry();
  wGeo.setAttribute('position', new THREE.BufferAttribute(wArr, 3));
  const wMat = new THREE.PointsMaterial({ size: 0.16, color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, fog: false });
  const wPts = new THREE.Points(wGeo, wMat);
  wPts.frustumCulled = false; wPts.visible = false;
  scene.add(wPts);
  let rainGain = null;
  function startRain() {
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter();
    rainGain = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    flt.type = 'lowpass'; flt.frequency.value = 2600;
    rainGain.gain.value = weather === 1 ? 0.045 : 0;
    src.connect(flt); flt.connect(rainGain); rainGain.connect(sfxBus);
    src.start();
  }
  function setWeatherFx() {
    wPts.visible = weather > 0;
    wMat.size = [0.16, 0.13, 0.26, 0.24][weather];
    wMat.color.set([0xffffff, 0xd6ecff, 0xf2a03c, 0xffffff][weather]);
    wGeo.setDrawRange(0, [0, WN, 110, 380][weather]);
    if (rainGain) rainGain.gain.setTargetAtTime(weather === 1 ? 0.045 : 0, ac.currentTime, 0.6);
  }
  function updateWeather(dt) {
    if (!weather) return;
    const fall = [0, 24, 1.5, 2.2][weather], drift = [0, 0.4, 1.6, 1.0][weather];
    for (let n = 0; n < WN; n++) {
      wArr[n * 3 + 1] -= fall * dt * (0.8 + (n % 5) * 0.1);
      wArr[n * 3] += Math.sin(clock * 0.9 + n) * drift * dt;
      if (wArr[n * 3 + 1] < 0) wArr[n * 3 + 1] += 24;
    }
    wGeo.attributes.position.needsUpdate = true;
    const ws = Math.max(1, cam.dist * fitK / 46);
    wPts.position.set(cam.tx, 0, cam.tz);
    wPts.scale.set(ws, Math.min(3, ws), ws);
  }

  // ---------- The island's look: style + weather set every colour, then everything is redrawn ----------
  function applyLook() {
    const st = STYLES[styleN % STYLES.length], w = weather;
    RH = st.rh;
    for (let k = 0; k < 6; k++) {
      WALLS[k] = st.walls[k]; ROOFS[k] = st.roofs[k];
      wallC[k].set(st.walls[k]); roofC[k].set(st.roofs[k]);
      if (w === 3) roofC[k].lerp(K.white, 0.7);                 // snow on the roofs
    }
    TC.grass.set(st.grass); TC.grass2.set(st.grass2); TC.high.set(st.high);
    TC.sand.set(st.sand); TC.cliff.set(st.cliff); TC.deep.set(st.deep);
    TC.rock.copy(TC.cliff).lerp(C(0x8e8a86), 0.55); TC.snow.set(0xf6f9fc);
    K.leaf.set(0x4fb04a); K.leaf2.set(0x7ccf5a); K.pine.set(0x2f8f5a); K.pine2.set(0x3fa56a);
    K.palm.set(0x5cc24a); K.pink.set(0xff9ec4); K.pink2.set(0xffc4dc);
    if (w === 2) {
      const gold = C(0xdcb65a);
      TC.grass.lerp(gold, 0.55); TC.grass2.lerp(gold, 0.45); TC.high.lerp(gold, 0.5);
      K.leaf.set(0xe08a3c); K.leaf2.set(0xf2b84b); K.pink.set(0xc9502f); K.pink2.set(0xe57a3c);
    } else if (w === 3) {
      const snow = C(0xf4f8fa);
      TC.grass.lerp(snow, 0.9); TC.grass2.lerp(snow, 0.95); TC.high.lerp(snow, 0.95); TC.sand.lerp(snow, 0.5); TC.cliff.lerp(snow, 0.35);
      K.leaf.set(0xdfe9ec); K.leaf2.set(0xffffff); K.pink.set(0xe3eaee); K.pink2.set(0xffffff);
      K.pine.set(0x5f9a84); K.pine2.set(0xeaf2f2); K.palm.set(0x9fc8b0);
    }
    WATER_DAY.set(st.water);
    if (w === 1) WATER_DAY.lerp(C(0x7f9aa8), 0.35); else if (w === 3) WATER_DAY.lerp(C(0x9fc0cc), 0.4);
    SKY_DAY.set([0xa6e3ff, 0x9fb4c2, 0xc4e0ea, 0xd6e4ec][w]);
    seabed.material.color.copy(TC.deep);
    riverMat.color.copy(WATER_DAY).lerp(K.white, 0.12);
    for (let v = 0; v < NATURE_N; v++) { natureGeo[v].dispose(); natureGeo[v] = makeNature(v); }
    boats.forEach(function (bt) { bt.m.geometry = boatGeo(styleN % STYLES.length); });
    const hol = holiday();
    hatMesh.geometry = hatGeos[hol] || hatGeos.christmas;
    showHoliday();
    setWeatherFx();
    placeSnowmen();
    showColour();
    showLook();
    redrawAll();
    applyNight();
  }
  const styleBtn = document.getElementById('styleBtn');
  const weatherLbl = document.getElementById('weatherLbl'), weatherIco = document.getElementById('weatherIco');
  function showLook() {
    if (styleBtn) styleBtn.textContent = 'STYLE: ' + STYLES[styleN % STYLES.length].name;
    if (weatherLbl) weatherLbl.textContent = WEATHERS[weather];
    if (weatherIco) weatherIco.setAttribute('fill', ['#ffb52e', '#5a9be0', '#e8873a', '#bfe3f2'][weather]);
  }
  function nextStyle() {
    styleN = (styleN + 1) % STYLES.length;
    brush.nature = STYLES[styleN].tree;
    applyLook(); dirty = true;
    blipSfx(); toast(STYLES[styleN].name + ' STYLE');
  }
  const holidayBtn = document.getElementById('holidayBtn');
  function showHoliday() {
    if (holidayBtn) holidayBtn.textContent = 'HOLIDAY: ' + (holidayPick === 'auto' ? 'AUTO (' + HOLINAME[autoHoliday()] + ')' : holidayPick === 'off' ? 'OFF' : HOLINAME[holidayPick]);
  }
  function nextHoliday() {
    const order = ['auto', 'halloween', 'christmas', 'newyear', 'off'];
    holidayPick = order[(order.indexOf(holidayPick) + 1) % order.length];
    try { localStorage.setItem('cozyCove.holiday', holidayPick); } catch (e) { /* storage can be off */ }
    applyLook();
    blipSfx();
    const h = holiday();
    toast(h ? 'HAPPY ' + HOLINAME[h] + '!' : 'NO HOLIDAY');
  }
  if (holidayBtn) holidayBtn.addEventListener('click', function () { unlockAudio(); nextHoliday(); });
  function nextWeather() {
    weather = (weather + 1) % WEATHERS.length;
    applyLook(); dirty = true;
    blipSfx(); toast(WEATHERS[weather]);
  }
  if (styleBtn) styleBtn.addEventListener('click', function () { unlockAudio(); nextStyle(); });
  const weatherBtn = document.getElementById('weather'), photoBtn = document.getElementById('photo');
  if (weatherBtn) weatherBtn.addEventListener('click', function () { unlockAudio(); nextWeather(); });
  // PHOTO: draw one clean frame (no build cursor), show it, and offer to save it to the device.
  // It also becomes this island's picture on the MY ISLANDS screen.
  const photoView = document.getElementById('photoView'), photoImg = document.getElementById('photoImg');
  let photoURL = '';
  function cleanFrame() {
    const was = cursorMesh.visible;
    cursorMesh.visible = false;
    renderer.render(scene, camera);
    cursorMesh.visible = was;
  }
  if (photoBtn) photoBtn.addEventListener('click', function () {
    unlockAudio();
    try {
      cleanFrame();
      photoURL = view.toDataURL('image/png');
      photoImg.src = photoURL;
      photoView.hidden = false;
      captureThumb(true);
      tone(1200, 0.06, 'sine', 0.06); tone(900, 0.1, 'sine', 0.05, 0.07);
      if (ac) puff(sfxBus, ac.currentTime, 0.12, 4000, 0.08);       // click!
    } catch (e) { toast("CAN'T TAKE A PICTURE HERE"); }
  });
  document.getElementById('photoSave').addEventListener('click', function () {
    try {
      const a = document.createElement('a');
      a.href = photoURL;
      a.download = (islandName() || 'cozy cove').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      toast('SAVED TO YOUR DOWNLOADS');
    } catch (e) { toast("CAN'T SAVE HERE"); }
    photoView.hidden = true;
  });
  document.getElementById('photoClose').addEventListener('click', function () { photoView.hidden = true; });

  // ---------- Cursor ----------
  const cursorMesh = new THREE.Mesh(
    new THREE.RingGeometry(1.42, 1.72, 4, 1, Math.PI / 4),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthTest: false, side: THREE.DoubleSide, fog: false })
  );
  cursorMesh.rotation.x = -Math.PI / 2;
  cursorMesh.renderOrder = 10;
  cursorMesh.visible = false;
  scene.add(cursorMesh);
  let cur = -1;

  // ---------- Sound and music (all made with WebAudio, no files) ----------
  // Everything is soft sine tones through a gentle reverb. Sound effects go to sfxBus, the
  // music (slow pad chords, a few kalimba notes, quiet sea wash) to musicBus.
  let ac = null, master = null, sfxBus = null, musicBus = null, noiseBuf = null;
  let musicOn = true;
  try { musicOn = localStorage.getItem('cozyCove.music') !== 'off'; } catch (e) { /* storage can be off */ }
  function unlockAudio() {
    if (!ac) {
      try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return; }
      master = ac.createGain(); master.gain.value = 0.9; master.connect(ac.destination);
      // reverb: a burst of noise that fades away
      const len = Math.floor(ac.sampleRate * 2.8), imp = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = imp.getChannelData(ch);
        for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2.8);
      }
      const verb = ac.createConvolver(), wet = ac.createGain();
      verb.buffer = imp; wet.gain.value = 0.45;
      verb.connect(wet); wet.connect(master);
      sfxBus = ac.createGain(); sfxBus.connect(master); sfxBus.connect(verb);
      musicBus = ac.createGain(); musicBus.gain.value = musicOn ? 1 : 0;
      musicBus.connect(master); musicBus.connect(verb);
      noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const nd = noiseBuf.getChannelData(0);
      for (let n = 0; n < nd.length; n++) nd[n] = Math.random() * 2 - 1;
      startSea();
      startRain();
      chordT = noteT = ac.currentTime + 0.4;
    }
    if (ac.state === 'suspended') ac.resume();
  }
  // one note: fade in over `attack`, stay for `hold`, then die away over about `release`
  function voice(bus, f, t, attack, hold, release, type, vol, slide) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + attack + hold + release * 0.6);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.setValueAtTime(vol, t + attack + hold);
    g.gain.setTargetAtTime(0.0001, t + attack + hold, release / 4);
    o.connect(g); g.connect(bus);
    o.start(t); o.stop(t + attack + hold + release * 1.6);
  }
  function tone(f, dur, type, vol, when, slide) {
    if (!ac) return;
    voice(sfxBus, f, ac.currentTime + (when || 0), 0.012, 0, dur, type, vol, slide);
  }
  // a soft puff of filtered noise (water, earth, leaves)
  function puff(bus, t, dur, freq, vol) {
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    flt.type = 'lowpass'; flt.frequency.setValueAtTime(freq, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(120, freq * 0.35), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.03);
    g.gain.setTargetAtTime(0.0001, t + 0.03, dur / 4);
    src.connect(flt); flt.connect(g); g.connect(bus);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.2);
  }
  const SCALE = [0, 2, 4, 7, 9];
  const noteF = (n) => 261.63 * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);
  // a kalimba-ish pluck: a round sine with two faint, quick overtones
  function kalimba(bus, f, t, vol) {
    voice(bus, f, t, 0.006, 0, 0.9, 'sine', vol);
    voice(bus, f * 2, t, 0.004, 0, 0.3, 'sine', vol * 0.22);
    voice(bus, f * 3.01, t, 0.003, 0, 0.12, 'sine', vol * 0.1);
  }
  function pluck(n, when) { if (ac) kalimba(sfxBus, noteF(n), ac.currentTime + (when || 0), 0.2); }
  // building plays a little tune that wanders up and back down instead of climbing forever
  const TUNE = [0, 2, 4, 5, 7, 5, 4, 2, 3, 5, 7, 9, 7, 5, 4, 2];
  let combo = 0, lastPlace = 0;
  function placeNote(extra) {
    if (!ac) return;
    const now = performance.now();
    combo = now - lastPlace < 2500 ? combo + 1 : 0;
    lastPlace = now;
    tone(120, 0.1, 'sine', 0.2, 0, 62);                     // the soft "thock" of setting it down
    pluck(TUNE[combo % TUNE.length] + Math.min(extra || 0, 5), 0.015);
  }
  function splashSfx() {
    if (!ac) return;
    tone(250, 0.3, 'sine', 0.13, 0, 120);
    tone(520, 0.09, 'sine', 0.04, 0.07, 760);
    puff(sfxBus, ac.currentTime, 0.55, 1100, 0.09);
  }
  function digSfx() {
    if (!ac) return;
    puff(sfxBus, ac.currentTime, 0.35, 800, 0.11);
    tone(330, 0.3, 'sine', 0.11, 0, 220);
    tone(247, 0.42, 'sine', 0.08, 0.1, 165);
  }
  const softSfx = () => tone(392, 0.14, 'sine', 0.05);
  const blipSfx = () => { tone(660, 0.22, 'sine', 0.07); tone(880, 0.3, 'sine', 0.06, 0.08); };
  const fanfare = () => { [5, 7, 9, 10, 12, 14].forEach((n, k) => pluck(n, k * 0.14)); };

  // ---- music ----
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [[48, 55, 64, 71, 74], [45, 52, 60, 67, 71], [41, 53, 57, 64, 67], [43, 50, 59, 64, 69]];
  const MELODY = [72, 74, 76, 79, 81, 84, 86, 88];
  let chordT = 0, noteT = 0, chordN = 0, melN = 3;
  function startSea() {
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    const lfo = ac.createOscillator(), depth = ac.createGain();
    src.buffer = noiseBuf; src.loop = true;
    flt.type = 'lowpass'; flt.frequency.value = 520;
    g.gain.value = 0.03;
    lfo.frequency.value = 0.09; depth.gain.value = 0.022;     // waves washing in and out
    lfo.connect(depth); depth.connect(g.gain);
    src.connect(flt); flt.connect(g); g.connect(musicBus);
    src.start(); lfo.start();
  }
  function tickMusic() {
    if (!ac || ac.state !== 'running') return;
    const now = ac.currentTime;
    if (chordT < now - 1) chordT = noteT = now + 0.2;        // the tab was asleep: start again from here
    while (chordT < now + 1) {
      const ch = CHORDS[chordN++ % CHORDS.length];
      for (let k = 0; k < ch.length; k++) {
        const f = mtof(ch[k]), v = k === 0 ? 0.05 : 0.028;
        voice(musicBus, f, chordT + k * 0.25, 3, 3.5, 5, 'sine', v);
        voice(musicBus, f * 1.003, chordT + k * 0.25, 3.4, 3, 5, 'sine', v * 0.6);
      }
      chordT += 9;
    }
    while (noteT < now + 0.5) {
      if (Math.random() < 0.3) {
        melN = Math.max(0, Math.min(MELODY.length - 1, melN + Math.floor(Math.random() * 5) - 2));
        kalimba(musicBus, mtof(MELODY[melN]), noteT + Math.random() * 0.05, 0.045);
      }
      noteT += 0.75;
    }
  }
  const musicBtn = document.getElementById('musicBtn');
  function showMusic() { if (musicBtn) musicBtn.textContent = 'MUSIC: ' + (musicOn ? 'ON' : 'OFF'); }
  function toggleMusic() {
    musicOn = !musicOn;
    try { localStorage.setItem('cozyCove.music', musicOn ? 'on' : 'off'); } catch (e) { /* storage can be off */ }
    unlockAudio();
    if (ac) musicBus.gain.setTargetAtTime(musicOn ? 1 : 0, ac.currentTime, 0.4);
    showMusic();
  }
  if (musicBtn) musicBtn.addEventListener('click', toggleMusic);
  showMusic();

  // ---------- Toast, stats, milestones ----------
  const toastEl = document.getElementById('toast');
  function toast(text, big) {
    toastEl.textContent = text;
    toastEl.className = '';
    void toastEl.offsetWidth;
    toastEl.className = big ? 'show big' : 'show';
  }
  const MILES = [[1, 'YOUR FIRST HOUSE!'], [5, 'A LITTLE VILLAGE!'], [10, 'A COZY TOWN!'], [20, 'A BUSY TOWN!'],
    [35, 'A BIG TOWN!'], [50, 'A SEASIDE CITY!'], [75, 'A GRAND CITY!'], [100, 'AN ISLAND KINGDOM!']];
  let mile = 0, homes = 0, maxTop = 4;
  const statEl = document.getElementById('stat');
  // ---------- Towns: every cluster of 3+ homes (joined up by touching or by paths) is a town ----------
  const TOWN_A = ['MAPLE', 'APPLE', 'PINE', 'ROSE', 'FIDDLE', 'BUTTER', 'CANDLE', 'DAISY', 'FOGGY', 'HAZEL', 'JUNIPER', 'LANTERN',
    'MARIGOLD', 'NUTMEG', 'ORCHARD', 'POPPY', 'PUDDING', 'SAFFRON', 'TEACUP', 'WAFFLE', 'BLUEBELL', 'GINGER', 'HOLLY', 'MUFFIN'];
  const TOWN_B = ['TOWN', 'VILLE', 'VILLAGE', 'HOLLOW', 'CROSSING', 'FALLS', 'GLEN', 'BROOK', 'FIELD', 'WOOD', 'MILL', 'PORT', 'END', 'GATE'];
  let townNames = {}, towns = [];
  const townLayer = document.getElementById('townLabels');
  function newTownName() {
    const taken = Object.keys(townNames).map((k) => townNames[k]);
    for (let n = 0; n < 60; n++) {
      const nm = TOWN_A[Math.floor(Math.random() * TOWN_A.length)] + ' ' + TOWN_B[Math.floor(Math.random() * TOWN_B.length)];
      if (taken.indexOf(nm) < 0) return nm;
    }
    return 'NEW TOWN';
  }
  const isTownCell = (i) => kind[i] === HOUSE || kind[i] === SPECIAL || kind[i] === PATH || isBridge(i);
  function findTowns(quiet) {
    const seen = new Uint8Array(N * N), comps = [];
    for (let i0 = 0; i0 < N * N; i0++) {
      if (seen[i0] || !(kind[i0] === HOUSE || kind[i0] === SPECIAL)) continue;
      const stack = [i0], cells = [];
      seen[i0] = 1;
      while (stack.length) {
        const i = stack.pop(), x = cx(i), z = cz(i);
        cells.push(i);
        for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, nz = z + dz;
          if (!inb(nx, nz)) continue;
          const n = nz * N + nx;
          if (!seen[n] && isTownCell(n)) { seen[n] = 1; stack.push(n); }
        }
      }
      let h = 0, ppl = 0, sx = 0, sz = 0, nb = 0, top = 0;
      cells.forEach(function (i) {
        if (kind[i] === HOUSE) { h++; ppl += hgt[i]; }
        if (kind[i] === HOUSE || kind[i] === SPECIAL) { sx += wx(cx(i)); sz += wx(cz(i)); nb++; top = Math.max(top, topOf(i)); }
      });
      if (h >= 3) comps.push({ cells: cells, homes: h, people: ppl, x: sx / nb, z: sz / nb, y: top + 1.4 });
    }
    comps.sort((a, b) => b.homes - a.homes);
    const used = {}, founded = [];
    comps.forEach(function (c) {
      const votes = {};
      let best = 0, bestN = 0;
      c.cells.forEach(function (i) { const t = twn[i]; if (t && !used[t] && townNames[t]) { votes[t] = (votes[t] || 0) + 1; if (votes[t] > bestN) { best = t; bestN = votes[t]; } } });
      if (!best) {
        for (let t = 1; t < 250; t++) if (!used[t] && !townNames[t]) { best = t; break; }
        if (!best) for (let t = 1; t < 250; t++) if (!used[t]) { best = t; break; }
        townNames[best] = newTownName();
        founded.push(best);
      }
      used[best] = 1;
      c.id = best;
    });
    twn.fill(0);
    comps.forEach(function (c) { c.cells.forEach(function (i) { twn[i] = c.id; }); });
    // forget names of towns that are long gone, but keep a few in case they come back
    const ids = Object.keys(townNames);
    if (ids.length > 40) ids.forEach(function (k) { if (!used[k]) delete townNames[k]; });
    // labels: reuse the ones we have, add or drop the rest
    const keep = {};
    comps.forEach(function (c) {
      let t = towns.find((o) => o.id === c.id);
      if (!t) {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = 'townLabel';
        el.innerHTML = '<span class="tn"></span><span class="th"></span>';
        townLayer.appendChild(el);
        t = { id: c.id, el: el };
        el.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        el.addEventListener('click', function (e) { e.stopPropagation(); renameTown(t); });
      }
      t.x = c.x; t.y = c.y; t.z = c.z; t.homes = c.homes;
      t.el.firstChild.textContent = townNames[c.id];
      t.el.lastChild.textContent = c.homes + ' HOMES · ' + c.people + ' PEOPLE';
      keep[c.id] = t;
    });
    towns.forEach(function (t) { if (!keep[t.id]) t.el.remove(); });
    towns = comps.map((c) => keep[c.id]);
    if (founded.length && !quiet) {
      toast('NEW TOWN: ' + townNames[founded[0]] + '!', true);
      fanfare();
    }
  }
  function renameTown(t) {
    if (t.editing) return;
    t.editing = true;
    const box = document.createElement('input');
    box.type = 'text'; box.maxLength = 18; box.value = townNames[t.id] || ''; box.className = 'townEdit';
    t.el.replaceWith(box);
    box.style.left = t.el.style.left; box.style.top = t.el.style.top;
    box.focus(); box.select();
    let done = false;
    const finish = function () {
      if (done) return;
      done = true;
      const v = box.value.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, 18);
      if (v) townNames[t.id] = v;
      t.el.firstChild.textContent = townNames[t.id];
      box.replaceWith(t.el);
      t.editing = false;
      dirty = true;
    };
    box.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    box.addEventListener('keydown', function (e) { e.stopPropagation(); if (e.key === 'Enter') finish(); if (e.key === 'Escape') { box.value = townNames[t.id]; finish(); } });
    box.addEventListener('blur', finish);
  }
  // town names float over their towns; they fade when you zoom right in on the houses
  function placeTownLabels() {
    const r = view.getBoundingClientRect(), close = cam.dist * fitK < 24;
    for (let n = 0; n < towns.length; n++) {
      const t = towns[n];
      _v.set(t.x, t.y, t.z).project(camera);
      const off = _v.z > 1 || Math.abs(_v.x) > 1.1 || Math.abs(_v.y) > 1.1 || walking;
      t.el.style.display = off ? 'none' : '';
      if (off) continue;
      t.el.style.left = ((_v.x + 1) / 2 * r.width) + 'px';
      t.el.style.top = ((1 - _v.y) / 2 * r.height) + 'px';
      t.el.style.opacity = close ? 0.35 : 1;
    }
  }

  function recount(quiet) {
    homes = 0; people = 0; maxTop = 4;
    for (let i = 0; i < N * N; i++) {
      if (kind[i] === HOUSE) { homes++; people += hgt[i]; }
      if (land[i] || kind[i]) maxTop = Math.max(maxTop, topOf(i));
    }
    findTowns(quiet);
    statEl.textContent = (towns.length > 1 ? 'TOWNS ' + towns.length + ' \u00b7 ' : '') + 'HOMES ' + homes + ' \u00b7 PEOPLE ' + people;
    let grassN = 0, shoreN = 0;
    for (let i = 0; i < N * N; i++) { if (land[i] > 0 && kind[i] === NONE) grassN++; else if (isShore(i)) shoreN++; }
    wantA[SHEEP] = Math.min(AMAX[SHEEP], Math.floor(grassN / 10));
    wantA[DUCK] = Math.min(AMAX[DUCK], Math.floor(shoreN / 8));
    wantA[CAT] = Math.min(AMAX[CAT], Math.floor(homes / 4));
    wantA[DOG] = Math.min(AMAX[DOG], Math.floor(people / 5));
    placeSnowmen();
    let hit = false;
    while (mile < MILES.length && homes >= MILES[mile][0]) { mile++; hit = true; }
    if (hit && !quiet) {
      toast(MILES[mile - 1][1], true);
      // the arcade's HIGH SCORES sheet lists every game, so the biggest towns get a board
      if (window.MickleScores) { try { MickleScores.record('cozy-cove', homes); } catch (e) { /* no board, no problem */ } }
      fanfare();
      for (let i = 0; i < N * N; i++) {
        if (kind[i] === HOUSE) burst(wx(cx(i)), levelY(land[i]) + hgt[i] * FH + RH, wx(cz(i)), roofC[col[i] % 6], 5, 3);
      }
    }
  }

  // ---------- Save ----------
  let dirty = false, saveT = 0, night = 0, nightK = 0;
  function save() {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (land[i] || kind[i]) cells.push(twn[i] ? [i, land[i], kind[i], hgt[i], col[i], vr[i], twn[i]] : [i, land[i], kind[i], hgt[i], col[i], vr[i]]);
    if (!curId) return;
    try {
      localStorage.setItem(islandKey(curId), JSON.stringify({ v: 2, n: N, night: night, mile: mile, style: styleN, weather: weather, towns: townNames, cells: cells }));
    } catch (e) { storageFull(); return; }
    const e = entry(curId);
    if (e) { e.homes = homes; e.people = people; e.updated = Date.now(); writeIndex(); }
  }
  function clearAll() {
    for (let i = 0; i < N * N; i++) {
      land[i] = kind[i] = hgt[i] = col[i] = vr[i] = twn[i] = 0;
      anim[i] = landAnim[i] = null;
    }
  }
  function redrawAll() {
    for (let i = 0; i < N * N; i++) { visH[i] = groundY(i); landAnim[i] = null; }
    for (let i = 0; i < N * N; i++) refresh(i);
    rebuildTerrain();
  }
  function starter() {
    clearAll();
    townNames = {};
    const m = N / 2 - 0.5;
    for (let i = 0; i < N * N; i++) {
      const d = Math.hypot(cx(i) - m, cz(i) - m);
      if (d < 2.3 + rnd(i + 77) * 1.1) land[i] = 1;
    }
    const at = (x, z) => (N / 2 + z) * N + N / 2 + x;
    kind[at(0, 0)] = HOUSE; hgt[at(0, 0)] = 1; col[at(0, 0)] = 0; vr[at(0, 0)] = 3;
    kind[at(0, 1)] = PATH;
    kind[at(-2, 0)] = NATURE; vr[at(-2, 0)] = 0;
    kind[at(1, -2)] = NATURE; vr[at(1, -2)] = 1;
    kind[at(-1, 1)] = NATURE; vr[at(-1, 1)] = 4;
    land[at(1, -2)] = land[at(0, -2)] = land[at(1, -1)] = 2;     // a little hill to start with
    mile = 1;
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(islandKey(curId)));
      if (!s || !s.cells || !s.cells.length) return false;
      clearAll();
      // islands saved before the map grew were 20 x 20: they move into the middle
      const n = s.n || 20, off = Math.floor((N - n) / 2);
      s.cells.forEach(function (c) {
        const x = c[0] % n + off, z = Math.floor(c[0] / n) + off;
        if (!inb(x, z)) return;
        const i = z * N + x;
        land[i] = Math.min(MAXLV, c[1]); kind[i] = c[2]; hgt[i] = Math.min(MAXH, c[3]); col[i] = c[4]; vr[i] = c[5]; twn[i] = c[6] || 0;
      });
      night = s.night ? 1 : 0; nightK = night;
      styleN = (s.style | 0) % STYLES.length; weather = (s.weather | 0) % WEATHERS.length;
      mile = s.mile || 0;
      townNames = s.towns && typeof s.towns === 'object' ? s.towns : {};
      return true;
    } catch (e) { return false; }
  }

  // ---------- Tools ----------
  const TOOLS = ['land', 'mountain', 'river', 'beach', 'house', 'special', 'nature', 'path', 'dock', 'dig'];
  let tool = 'house';
  let colSel = -1;                 // -1 = a surprise colour for every new building
  let lastCol = 0;
  const brush = { nature: 0, path: 0, dock: 0, special: 0, beach: 1 };
  const toolBtns = Array.from(document.querySelectorAll('#tools [data-tool]'));
  function setTool(t) {
    tool = t;
    toolBtns.forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    softSfx();
  }
  toolBtns.forEach((b) => b.addEventListener('click', function () { unlockAudio(); setTool(b.dataset.tool); }));
  const chip = document.getElementById('chip');
  const hex = (n) => '#' + n.toString(16).padStart(6, '0');
  function showColour() {
    chip.style.background = colSel < 0
      ? 'conic-gradient(' + WALLS.map(hex).join(',') + ')'
      : 'linear-gradient(135deg,' + hex(ROOFS[colSel]) + ' 50%,' + hex(WALLS[colSel]) + ' 50%)';
  }
  function nextColour() { colSel = colSel >= 5 ? -1 : colSel + 1; showColour(); blipSfx(); }
  document.getElementById('swatch').addEventListener('click', function () { unlockAudio(); nextColour(); });
  function strokeColour() {
    if (colSel >= 0) return colSel;
    lastCol = (lastCol + 1 + Math.floor(Math.random() * 5)) % 6;
    return lastCol;
  }

  // What tapping cell i would do with the tool in hand.
  function opFor(i, t) {
    const k = kind[i];
    if (t === 'land') return !land[i] ? 'land' : land[i] < HILLLV ? 'raise' : 'top';
    if (t === 'mountain') return land[i] >= MAXLV ? 'peak' : 'mount';
    if (t === 'house') return k === HOUSE ? (hgt[i] < MAXH ? 'stack' : 'max') : 'house';
    if (t === 'dig') return k !== NONE ? 'dig' : land[i] ? 'digland' : 'none';
    if (k === HOUSE) return 'nudge';
    if (t === 'river') return k === RIVER ? 'nudge' : land[i] ? 'river' : 'noriver';
    if (t === 'beach') return k === BEACH ? 'cycle' : land[i] > 1 ? 'nobeach' : 'beach';
    if (t === 'path' && k === RIVER) return hgt[i] ? 'nudge' : 'bridge';
    if (t === 'special') return k === SPECIAL ? 'cycle' : 'special';
    if (t === 'nature') return k === NATURE ? 'cycle' : 'nature';
    if (t === 'path') return k === PATH ? 'cycle' : 'path';
    if (t === 'dock') return k === DOCK ? 'cycle' : land[i] ? 'nodock' : 'dock';
    return 'none';
  }
  const DRAGS = { land: 1, raise: 1, mount: 1, river: 1, beach: 1, bridge: 1, special: 1, house: 1, stack: 1, nature: 1, path: 1, dock: 1, dig: 1, digland: 1 };
  // holding still on these keeps doing them: towers keep growing, mountains keep rising
  const REPEATS = { stack: 1, mount: 1 };

  const undoStack = [];
  let stroke = null;
  function beginStroke(i, t) {
    stroke = { op: null, tool: t || tool, seen: new Set(), col: strokeColour(), group: [], last: -1 };
    strokeTo(i);
  }
  // a fast drag can jump over cells, so walk the grid from the last cell to this one
  function strokeTo(i) {
    if (!stroke || i < 0) return;
    if (stroke.last >= 0 && stroke.last !== i) {
      let x = cx(stroke.last), z = cz(stroke.last);
      const x1 = cx(i), z1 = cz(i);
      while (x !== x1 || z !== z1) {
        if (Math.abs(x1 - x) >= Math.abs(z1 - z)) x += Math.sign(x1 - x); else z += Math.sign(z1 - z);
        strokeCell(z * N + x);
      }
    } else strokeCell(i);
    stroke.last = i;
  }
  function strokeCell(i) {
    if (stroke.seen.has(i)) return;
    const op = opFor(i, stroke.tool);
    if (stroke.op === null) stroke.op = op;
    else if (op !== stroke.op || !DRAGS[op]) return;
    stroke.seen.add(i);
    doOp(i, op);
  }
  function endStroke() { stroke = null; }
  function snap(i) {
    stroke.group.push({ i: i, land: land[i], kind: kind[i], hgt: hgt[i], col: col[i], vr: vr[i] });
    if (stroke.group.length === 1) { undoStack.push(stroke.group); if (undoStack.length > 120) undoStack.shift(); }
  }
  function growLand(i) {
    if (land[i]) return 0;
    land[i] = 1;
    const x = wx(cx(i)), z = wx(cz(i));
    for (let k = 0; k < 10; k++) {
      const a = k / 10 * 6.28;
      spark(x + Math.cos(a) * 1.1, 0.1, z + Math.sin(a) * 1.1, Math.cos(a) * 2.2, 3 + Math.random() * 2, Math.sin(a) * 2.2, K.water, 0.11, 0.55, 12);
    }
    return 0.14;
  }
  function bumpNeighbours(i, k) {
    for (let d = 0; d < 4; d++) {
      const x = cx(i) + DX[d], z = cz(i) + DZ[d];
      if (inb(x, z) && kind[z * N + x] === k) bump(z * N + x, 0.1);
    }
  }
  function doOp(i, op) {
    const x = wx(cx(i)), z = wx(cz(i));
    let delay;
    switch (op) {
      case 'land':
        snap(i);
        if (kind[i] === DOCK) kind[i] = NONE;
        growLand(i); splashSfx();
        break;
      case 'raise':
        snap(i);
        land[i]++;
        if (kind[i] === BEACH) kind[i] = NONE;
        bump(i, 0.12);
        if (ac) puff(sfxBus, ac.currentTime, 0.4, 600, 0.08);     // earth shuffling up
        placeNote(land[i] - 1);
        burst(x, levelY(land[i]), z, K.leaf2, 8);
        break;
      case 'house':
        snap(i);
        delay = growLand(i);
        kind[i] = HOUSE; hgt[i] = 1; col[i] = stroke.col; vr[i] = Math.floor(Math.random() * 240);
        pop(i, delay); bumpNeighbours(i, HOUSE);
        placeNote(0);
        burst(x, levelY(land[i]) + 0.3, z, wallC[col[i]], 8);
        break;
      case 'stack':
        snap(i);
        hgt[i]++;
        anim[i] = { t: 0, dur: 0.5, type: 1, amp: 0.2 };
        bumpNeighbours(i, HOUSE);
        placeNote(hgt[i] - 1);
        burst(x, levelY(land[i]) + hgt[i] * FH, z, roofC[col[i] % 6], 8);
        if (TALL[hgt[i]]) toast(TALL[hgt[i]], hgt[i] >= 25);
        break;
      case 'mount':
        raiseMountain(i);
        recount();
        return;
      case 'river':
        snap(i);
        kind[i] = RIVER; hgt[i] = 0; vr[i] = 0;
        splashSfx();
        burst(x, levelY(land[i]), z, K.water, 8);
        break;
      case 'bridge':
        snap(i);
        hgt[i] = 1;
        pop(i, 0); placeNote(0);
        burst(x, levelY(land[i]) + 0.4, z, K.stone, 8);
        break;
      case 'beach':
        snap(i);
        delay = growLand(i);
        if (!land[i]) land[i] = 1;
        kind[i] = BEACH; hgt[i] = 0; vr[i] = brush.beach;
        pop(i, delay);
        if (ac) puff(sfxBus, ac.currentTime, 0.35, 1600, 0.07);       // a soft hiss of sand
        placeNote(0);
        burst(x, levelY(1), z, K.sandC, 8);
        break;
      case 'nature': case 'path': case 'dock': case 'special': {
        snap(i);
        const nk = op === 'nature' ? NATURE : op === 'path' ? PATH : op === 'special' ? SPECIAL : DOCK;
        delay = 0;
        if (nk === DOCK) splashSfx(); else delay = growLand(i);
        kind[i] = nk; hgt[i] = 0; vr[i] = brush[op]; col[i] = stroke.col;
        pop(i, delay); bumpNeighbours(i, nk);
        placeNote(0);
        burst(x, nk === DOCK ? 0.5 : levelY(land[i]) + 0.3, z, nk === NATURE ? K.leaf2 : nk === PATH ? K.stone : K.wood, 6);
        break;
      }
      case 'cycle': {
        snap(i);
        const key = kind[i] === NATURE ? 'nature' : kind[i] === PATH ? 'path' : kind[i] === SPECIAL ? 'special' : kind[i] === BEACH ? 'beach' : 'dock';
        const n = kind[i] === NATURE ? NATURE_N : kind[i] === PATH ? PATH_N : kind[i] === SPECIAL ? SPECIAL_N : kind[i] === BEACH ? BEACH_N : DOCK_N;
        vr[i] = (vr[i] + 1) % n;
        brush[key] = vr[i];
        pop(i, 0); blipSfx();
        if (kind[i] === SPECIAL && vr[i] === 3) { tone(784, 1.6, 'sine', 0.12, 0.15); tone(1568, 0.9, 'sine', 0.03, 0.15); }   // the chapel bell
        burst(x, levelY(land[i]) + 0.4, z, K.yellow, 5);
        break;
      }
      case 'dig':
        snap(i);
        burst(x, levelY(land[i]) + Math.max(1, hgt[i]) * 0.8, z, kind[i] === HOUSE ? wallC[col[i] % 6] : K.sand, 10);
        if (kind[i] === HOUSE && hgt[i] > 1) { hgt[i]--; anim[i] = { t: 0, dur: 0.4, type: 1, amp: 0.14 }; }
        else if (isBridge(i)) hgt[i] = 0;
        else { kind[i] = NONE; hgt[i] = 0; anim[i] = null; }
        digSfx();
        break;
      case 'digland':
        snap(i);
        land[i]--;
        if (land[i]) { burst(x, levelY(land[i]) + 0.4, z, K.sand, 10); digSfx(); }
        else { burst(x, 0.3, z, K.water, 10); splashSfx(); }
        break;
      case 'max': bump(i, 0.12); softSfx(); toast('SO TALL!'); return;
      case 'top': bump(i, 0.1); softSfx(); toast('TRY THE MOUNTAIN TOOL!'); return;
      case 'peak': bump(i, 0.1); softSfx(); toast('AS HIGH AS MOUNTAINS GO!'); return;
      case 'noriver': softSfx(); toast('RIVERS RUN ON LAND'); return;
      case 'nobeach': softSfx(); toast('BEACHES GO DOWN BY THE SEA'); return;
      case 'nodock': softSfx(); toast('DOCKS GO ON THE WATER'); return;
      case 'nudge': bump(i, 0.1); softSfx(); return;
      default: return;
    }
    touch(i);
    recount();
  }
  const TALL = { 10: 'SKYSCRAPER!', 25: 'UP IN THE CLOUDS!', 50: 'SUPER DUPER TALL!', 80: 'HELLO, SPACE!', 120: 'AS TALL AS IT GETS!' };
  // MOUNTAIN: raise the tapped cell two levels and build a rough cone of slopes round it
  function raiseMountain(c) {
    const top = Math.min(MAXLV, Math.max(land[c], 1) + 2);
    const x0 = cx(c), z0 = cz(c), R = Math.ceil(top / 2) + 1, changed = [];
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      const x = x0 + dx, z = z0 + dz;
      if (!inb(x, z)) continue;
      const i = z * N + x;
      const want = Math.round(top - 2 * Math.hypot(dx, dz) * (0.8 + rnd(i * 3 + top) * 0.4));
      if (want < 1 || land[i] >= want) continue;
      snap(i);
      if (kind[i] === DOCK || kind[i] === BEACH) { kind[i] = NONE; hgt[i] = 0; }
      land[i] = want;
      changed.push(i);
    }
    touchMany(changed);
    if (ac) { tone(70, 0.6, 'sine', 0.25, 0, 50); puff(sfxBus, ac.currentTime, 0.6, 500, 0.12); }
    placeNote(Math.floor(top / 3));
    burst(wx(x0), levelY(top) + 0.3, wx(z0), TC.rock, 12, 3);
    if (top === MAXLV) toast('A MIGHTY MOUNTAIN!');
  }
  function undo() {
    const g = undoStack.pop();
    if (!g) { softSfx(); return; }
    const list = [];
    for (let n = g.length - 1; n >= 0; n--) {
      const s = g[n], i = s.i;
      land[i] = s.land; kind[i] = s.kind; hgt[i] = s.hgt; col[i] = s.col; vr[i] = s.vr;
      anim[i] = null;
      list.push(i);
    }
    touchMany(list);
    for (let n = 0; n < Math.min(list.length, 12); n++) burst(wx(cx(list[n])), levelY(land[list[n]]) + 0.4, wx(cz(list[n])), K.white, 4);
    digSfx();
    recount(true);
  }
  document.getElementById('undo').addEventListener('click', function () { unlockAudio(); undo(); });

  // ---------- MY ISLANDS: make, open, rename, copy and delete islands ----------
  const NAMES_A = ['SUNNY', 'PEBBLE', 'MAPLE', 'CORAL', 'BREEZY', 'HONEY', 'MOSSY', 'STARRY', 'LUCKY', 'MISTY', 'BERRY', 'PUFFIN',
    'OTTER', 'SEASHELL', 'TURTLE', 'MANGO', 'CLOVER', 'WILLOW', 'PEARL', 'SAILOR'];
  const NAMES_B = ['BAY', 'ISLE', 'COVE', 'HARBOR', 'KEY', 'POINT', 'HAVEN', 'ISLAND', 'SHORE', 'LAGOON'];
  const NAME_MAX = 16;
  const entry = (id) => islands.find((e) => e.id === id);
  const islandName = () => (entry(curId) || {}).name || '';
  const makeId = () => Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
  function newName() {
    for (let n = 0; n < 50; n++) {
      const nm = NAMES_A[Math.floor(Math.random() * NAMES_A.length)] + ' ' + NAMES_B[Math.floor(Math.random() * NAMES_B.length)];
      if (!islands.some((e) => e.name === nm)) return nm;
    }
    return 'ISLAND ' + (islands.length + 1);
  }
  function readIndex() {
    try { islands = JSON.parse(localStorage.getItem(INDEX_KEY)) || []; } catch (e) { islands = []; }
    if (!Array.isArray(islands)) islands = [];
  }
  function writeIndex() { try { localStorage.setItem(INDEX_KEY, JSON.stringify(islands)); } catch (e) { storageFull(); } }
  let fullWarned = 0;
  function storageFull() {
    if (performance.now() - fullWarned < 20000) return;
    fullWarned = performance.now();
    toast('NO ROOM TO SAVE -- DELETE AN ISLAND', true);
  }
  // the first time: the old three slots become islands, nothing is thrown away
  function migrateSlots() {
    if (islands.length) return;
    let oldSlot = 1;
    try { oldSlot = +localStorage.getItem('cozyCove.slot') || 1; } catch (e) { /* fine */ }
    ['cozyCove.save', 'cozyCove.save2', 'cozyCove.save3'].forEach(function (k, n) {
      let raw = null;
      try { raw = localStorage.getItem(k); } catch (e) { /* fine */ }
      if (!raw) return;
      const id = makeId() + n;
      try { localStorage.setItem(islandKey(id), raw); } catch (e) { return; }
      islands.push({ id: id, name: 'ISLAND ' + (n + 1), homes: 0, people: 0, updated: Date.now(), thumb: '' });
      if (n + 1 === oldSlot) curId = id;
    });
    if (islands.length) writeIndex();
  }
  // a small picture of the island for its card (taken from the view right now)
  let thumbT = 0;
  function captureThumb(fromPhoto) {
    const e = entry(curId);
    if (!e) return;
    try {
      if (!fromPhoto) cleanFrame();
      const c = document.createElement('canvas');
      c.width = 256; c.height = 144;
      const vw = view.width, vh = view.height, sw = Math.min(vw, vh * 16 / 9), sh = sw * 9 / 16;
      c.getContext('2d').drawImage(view, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, 256, 144);
      e.thumb = c.toDataURL('image/jpeg', 0.7);
      writeIndex();
    } catch (err) { /* no picture this time */ }
    thumbT = 0;
  }
  function resetWorld() {
    undoStack.length = 0; villagers.length = 0; animals.length = 0;
    towns.forEach(function (t) { t.el.remove(); });
    towns = [];
    for (let n = 0; n < bubbles.length; n++) bubbles[n].el.remove();
    bubbles.length = 0;
  }
  function openIsland(id) {
    curId = id;
    try { localStorage.setItem(CUR_KEY, id); } catch (e) { /* fine */ }
    if (!load()) { styleN = 0; weather = 0; night = 0; nightK = 0; starter(); }
    resetWorld();
    applyLook(); showNight(); recount(true); focusIsland();
    showIslandBtn();
  }
  function createIsland() {
    const id = makeId();
    islands.unshift({ id: id, name: newName(), homes: 1, people: 1, updated: Date.now(), thumb: '' });
    curId = id;
    try { localStorage.setItem(CUR_KEY, id); } catch (e) { /* fine */ }
    styleN = 0; weather = 0; night = 0; nightK = 0;
    starter();
    resetWorld();
    applyLook(); showNight(); recount(true); focusIsland();
    save();
    showIslandBtn();
  }
  function leaveIsland() { if (curId) { captureThumb(); save(); } }

  const islandsEl = document.getElementById('islands'), islandList = document.getElementById('islandList');
  const islandBtn = document.getElementById('islandsBtn'), islandBtnName = document.getElementById('islandsName');
  function showIslandBtn() { if (islandBtnName) islandBtnName.textContent = islandName() || 'MY ISLANDS'; }
  const islandsOpen = () => !islandsEl.hidden;
  function openIslands() {
    captureThumb(); save();
    renderIslands();
    islandsEl.hidden = false;
    blipSfx();
  }
  function closeIslands() { islandsEl.hidden = true; softSfx(); }
  const ago = (t) => {
    const m = Math.floor((Date.now() - t) / 60000);
    return m < 1 ? 'JUST NOW' : m < 60 ? m + ' MIN AGO' : m < 1440 ? Math.floor(m / 60) + ' HR AGO' : Math.floor(m / 1440) + ' DAYS AGO';
  };
  function renderIslands() {
    islandList.innerHTML = '';
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'icard inew';
    add.innerHTML = '<span class="plus">+</span><span class="iname">NEW ISLAND</span>';
    add.addEventListener('click', function () { leaveIsland(); createIsland(); closeIslands(); toast('A FRESH NEW ISLAND!'); fanfare(); });
    islandList.appendChild(add);
    islands.forEach(function (e) {
      const card = document.createElement('div');
      card.className = 'icard' + (e.id === curId ? ' here' : '');
      const pic = document.createElement('button');
      pic.type = 'button';
      pic.className = 'ipic';
      if (e.thumb) pic.style.backgroundImage = 'url(' + e.thumb + ')';
      pic.setAttribute('aria-label', 'Open ' + e.name);
      pic.addEventListener('click', function () {
        if (e.id !== curId) { leaveIsland(); openIsland(e.id); toast(e.name); pluck(5); pluck(7, 0.1); pluck(9, 0.2); }
        closeIslands();
      });
      if (e.id === curId) { const here = document.createElement('span'); here.className = 'ihere'; here.textContent = 'YOU ARE HERE'; pic.appendChild(here); }
      const nm = document.createElement('div');
      nm.className = 'iname';
      nm.textContent = e.name;
      const info = document.createElement('div');
      info.className = 'iinfo';
      info.textContent = (e.homes || 0) + ' HOMES · ' + ago(e.updated || Date.now());
      const acts = document.createElement('div');
      acts.className = 'iacts';
      const mk = (label, title, fn) => {
        const b = document.createElement('button');
        b.type = 'button'; b.textContent = label; b.title = title;
        b.addEventListener('click', function (ev) { ev.stopPropagation(); fn(b); });
        acts.appendChild(b);
        return b;
      };
      mk('RENAME', 'Rename', function () {
        const box = document.createElement('input');
        box.type = 'text'; box.maxLength = NAME_MAX; box.value = e.name; box.className = 'irename';
        nm.replaceWith(box);
        box.focus(); box.select();
        let done = false;
        const finish = function () {
          if (done) return;
          done = true;
          const v = box.value.toUpperCase().replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
          if (v) e.name = v;
          writeIndex(); showIslandBtn(); renderIslands();
        };
        box.addEventListener('keydown', function (ev) { ev.stopPropagation(); if (ev.key === 'Enter') finish(); if (ev.key === 'Escape') { box.value = e.name; finish(); } });
        box.addEventListener('blur', finish);
      });
      mk('COPY', 'Make a copy', function () {
        if (e.id === curId) save();
        let raw = null;
        try { raw = localStorage.getItem(islandKey(e.id)); } catch (err) { /* fine */ }
        if (!raw) return;
        const id = makeId();
        try { localStorage.setItem(islandKey(id), raw); } catch (err) { storageFull(); return; }
        const i = islands.indexOf(e);
        islands.splice(i + 1, 0, { id: id, name: (e.name.slice(0, NAME_MAX - 2) + ' 2'), homes: e.homes, people: e.people, updated: Date.now(), thumb: e.thumb });
        writeIndex(); renderIslands(); blipSfx();
      });
      mk('DELETE', 'Delete', function (b) {
        if (!b.classList.contains('armed')) {
          b.classList.add('armed'); b.textContent = 'SURE?';
          setTimeout(function () { b.classList.remove('armed'); b.textContent = 'DELETE'; }, 3500);
          return;
        }
        try { localStorage.removeItem(islandKey(e.id)); } catch (err) { /* fine */ }
        islands.splice(islands.indexOf(e), 1);
        writeIndex();
        if (e.id === curId) { if (islands.length) openIsland(islands[0].id); else createIsland(); }
        renderIslands(); digSfx();
      });
      card.appendChild(pic); card.appendChild(nm); card.appendChild(info); card.appendChild(acts);
      islandList.appendChild(card);
    });
  }
  islandBtn.addEventListener('click', function () { unlockAudio(); openIslands(); });
  document.getElementById('islandsClose').addEventListener('click', closeIslands);
  islandsEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
  // keep the cards' pictures fresh: before the page goes away, and now and then while building
  document.addEventListener('visibilitychange', function () { if (document.hidden) { captureThumb(); save(); } });

  // ---------- Day / night ----------
  const nightLbl = document.getElementById('nightLbl');
  function showNight() {
    nightLbl.textContent = night ? 'NIGHT' : 'DAY';
    document.getElementById('sunIco').setAttribute('opacity', night ? 0 : 1);
    document.getElementById('moonIco').setAttribute('opacity', night ? 1 : 0);
  }
  function toggleNight() { night = night ? 0 : 1; showNight(); blipSfx(); dirty = true; }
  document.getElementById('night').addEventListener('click', function () { unlockAudio(); toggleNight(); });
  const SUN_DAY = C(0xfff1d6), SUN_NIGHT = C(0x8fa6ff), HEMI_NIGHT = C(0x7d8fd6);
  function applyNight() {
    const k = nightK;
    scene.background.copy(SKY_DAY).lerp(SKY_NIGHT, k);
    scene.fog.color.copy(scene.background);
    waterMat.color.copy(WATER_DAY).lerp(WATER_NIGHT, k);
    riverMat.color.copy(WATER_DAY).lerp(K.white, 0.12).lerp(WATER_NIGHT, k);
    fallMat.color.setRGB(1, 1, 1).lerp(WATER_NIGHT, k * 0.6);
    hemi.intensity = 1.5 - k * 0.6;
    hemi.color.setRGB(1, 1, 1).lerp(HEMI_NIGHT, k);
    sun.intensity = 2.2 - k * 1.3;
    sun.color.copy(SUN_DAY).lerp(SUN_NIGHT, k);
    glowMat.color.copy(GLOW_DAY).lerp(GLOW_NIGHT, k);
    glowMat.emissiveIntensity = k * 1.4;
  }

  // ---------- Picking: walk along the view ray until it dips under the top of a cell ----------
  const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
  function topOf(i) {
    const k = kind[i];
    if (k === HOUSE) return levelY(land[i]) + hgt[i] * FH + RH * 0.6 + (styleN % STYLES.length === 2 ? 0.38 : 0);
    if (k === NATURE) return levelY(land[i]) + (vr[i] % NATURE_N >= 4 ? 0.2 : 0.9);
    if (k === SPECIAL) return levelY(land[i]) + 1.5;
    if (k === DOCK) return vr[i] % DOCK_N === 2 ? 2.6 : 0.42;
    if (k === RIVER) return levelY(land[i]) - 0.18 + (hgt[i] ? 0.4 : 0);
    if (k === BEACH) return levelY(1) - BEACH_DIP + (vr[i] % BEACH_N === 1 ? 1.2 : 0.1);
    return land[i] ? levelY(land[i]) : 0;
  }
  function pick(px, py) {
    const r = view.getBoundingClientRect();
    ndc.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (d.y >= -0.01) return -1;
    const s0 = Math.max(0, (o.y - maxTop - 1) / -d.y), s1 = (o.y - SEABED) / -d.y;
    for (let s = s0; s <= s1 + 0.12; s += 0.1) {
      const x = Math.floor((o.x + d.x * s) / T + N / 2), z = Math.floor((o.z + d.z * s) / T + N / 2);
      const y = o.y + d.y * s;
      if (!inb(x, z)) { if (y <= 0) return -1; continue; }
      if (y <= topOf(z * N + x)) return z * N + x;
    }
    return -1;
  }

  // ---------- Camera ----------
  const lim = N * T / 2 + 4;
  const ZMIN = 18, ZMAX = 210;
  function panBy(dx, dy) {
    const r = view.getBoundingClientRect();
    const wpp = 2 * cam.dist * fitK * Math.tan(camera.fov / 2 * Math.PI / 180) / r.height;
    const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
    cam.tx += (-c * dx - s * dy / Math.sin(cam.el)) * wpp;
    cam.tz += (s * dx - c * dy / Math.sin(cam.el)) * wpp;
    cam.tx = Math.max(-lim, Math.min(lim, cam.tx));
    cam.tz = Math.max(-lim, Math.min(lim, cam.tz));
  }
  function zoomBy(f) { cam.distT = Math.max(ZMIN, Math.min(ZMAX, cam.distT * f)); }
  // point the camera at the middle of the land, far enough back to see all of it
  function focusIsland() {
    let sx = 0, sz = 0, n = 0, x0 = N, x1 = 0, z0 = N, z1 = 0;
    for (let i = 0; i < N * N; i++) {
      if (!land[i]) continue;
      const x = cx(i), z = cz(i);
      sx += x; sz += z; n++;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    if (!n) { cam.tx = cam.tz = 0; cam.distT = 46; return; }
    cam.tx = wx(sx / n); cam.tz = wx(sz / n);
    cam.distT = Math.max(40, Math.min(ZMAX, Math.max(x1 - x0, z1 - z0) * T * 1.5));
    cam.dist = cam.distT;
  }
  // the sea, seabed, fog and the sun's shadow box all go where the camera looks
  function followCamera() {
    const d = cam.dist * fitK;
    scene.fog.near = d * 1.2 + 30;
    scene.fog.far = Math.min(WSIZE / 2 - 20, d * 3 + 120);
    water.position.x = seabed.position.x = Math.round(cam.tx / WSEG) * WSEG;
    water.position.z = seabed.position.z = Math.round(cam.tz / WSEG) * WSEG;
    sun.target.position.set(cam.tx, 0, cam.tz);
    sun.position.set(cam.tx + 36, 90, cam.tz + 21);
    const half = Math.max(30, Math.min(120, d * 0.8));
    const sc = sun.shadow.camera;
    if (Math.abs(sc.right - half) > 3) {
      sc.left = sc.bottom = -half; sc.right = sc.top = half;
      sc.updateProjectionMatrix();
    }
  }
  function turn(dir) { cam.yawT += dir * Math.PI / 4; softSfx(); }
  document.getElementById('rotL').addEventListener('click', function () { unlockAudio(); turn(-1); });
  document.getElementById('rotR').addEventListener('click', function () { unlockAudio(); turn(1); });
  function placeCamera() {
    const ce = Math.cos(cam.el), d = cam.dist * fitK;
    if (walking) {                     // first person: you see what the villager sees
      const eye = walker.y + (walker.swim ? 0.42 : 0.95) + walker.bob, cp = Math.cos(walker.pitch);
      camera.position.set(walker.x, eye, walker.z);
      camera.lookAt(walker.x - Math.sin(cam.yaw) * cp, eye + Math.sin(walker.pitch), walker.z - Math.cos(cam.yaw) * cp);
      return;
    }
    camera.position.set(cam.tx + Math.sin(cam.yaw) * ce * d, cam.ty + Math.sin(cam.el) * d, cam.tz + Math.cos(cam.yaw) * ce * d);
    camera.lookAt(cam.tx, cam.ty, cam.tz);
  }

  // ---------- WALK: be one of the villagers and stroll round your island ----------
  const walker = { x: 0, y: 0, z: 0, vy: 0, ang: 0, phase: 0, swim: false, hiT: 0, stepT: 0, pitch: -0.08, bob: 0 };
  const walkMesh = new THREE.Mesh((function () {
    const b = new Builder();
    b.add(CYL, M(0, 0.17, 0, 0.13, 0.34, 0.13), C(0x4f8fd6));
    b.add(ICO1, M(0, 0.45, 0, 0.11, 0.11, 0.11), C(0xf6d3b3));
    b.add(CONE, M(0, 0.6, 0, 0.12, 0.2, 0.12), C(0xe0503c));
    b.add(ICO, M(0, 0.72, 0, 0.045, 0.045, 0.045), K.white);
    b.box(0.08, 0.43, -0.07, 0.11, 0.47, -0.03, K.dark);       // eyes look the way you walk
    b.box(0.08, 0.43, 0.03, 0.11, 0.47, 0.07, K.dark);
    return b.build();
  })(), townMat);
  walkMesh.castShadow = true;
  walkMesh.visible = false;
  walkMesh.scale.setScalar(1.45);
  scene.add(walkMesh);
  const walkUI = document.getElementById('walkUI'), stickEl = document.getElementById('wStick'), knobEl = document.getElementById('wKnob');
  let saved = null, stick = { id: -1, x: 0, y: 0 }, walkKeys = {}, lookDrag = null;
  const WALKKEYS = { arrowleft: 'turnL', arrowright: 'turnR', a: 'left', d: 'right', arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down' };
  const solidAt = (x, z) => {        // houses, shops and trees are in the way; flowers and paths aren't
    const gx = Math.floor(x / T + N / 2), gz = Math.floor(z / T + N / 2);
    if (!inb(gx, gz)) return false;
    const i = gz * N + gx, k = kind[i], dx = Math.abs(x - wx(gx)), dz = Math.abs(z - wx(gz));
    if (k === HOUSE || k === SPECIAL) return dx < 0.95 && dz < 0.95;
    if (k === NATURE) { const v = vr[i] % NATURE_N; return v === 4 ? false : Math.hypot(dx, dz) < (v === 5 ? 0.55 : 0.38); }
    if (k === DOCK && vr[i] % DOCK_N === 2) return Math.hypot(dx, dz) < 0.6;
    return false;
  };
  // what you'd stand on here: ground, a dock, a bridge -- or water, where you swim
  function standAt(x, z) {
    const gx = Math.floor(x / T + N / 2), gz = Math.floor(z / T + N / 2);
    let g = groundAt(x, z), swim = false;
    if (inb(gx, gz)) {
      const i = gz * N + gx;
      if (kind[i] === DOCK && Math.abs(x - wx(gx)) < 1.05 && Math.abs(z - wx(gz)) < 1.05) return { y: Math.max(g, 0.42), swim: false };
      if (isBridge(i)) return { y: Math.max(g, levelY(land[i]) + bridgeLift(Math.hypot(x - wx(gx), z - wx(gz)))), swim: false };
      if (kind[i] === RIVER && g < levelY(land[i]) - 0.4) { g = levelY(land[i]) - 0.48; swim = true; }
    }
    if (g < -0.12) { g = -0.3; swim = true; }
    return { y: g, swim: swim };
  }
  function startWalk() {
    if (walking || !started) return;
    saved = { tx: cam.tx, tz: cam.tz, ty: cam.ty, yaw: cam.yaw, yawT: cam.yawT, el: cam.el, dist: cam.dist, distT: cam.distT };
    // start on the nearest open bit of land to where the camera is looking
    let best = -1, bd = 1e9;
    const ox = Math.floor(cam.tx / T + N / 2), oz = Math.floor(cam.tz / T + N / 2);
    for (let i = 0; i < N * N; i++) {
      if (!land[i] || !(kind[i] === NONE || kind[i] === PATH || kind[i] === BEACH)) continue;
      const d = Math.hypot(cx(i) - ox, cz(i) - oz) + (kind[i] === PATH ? -0.5 : 0);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0) { toast('ADD SOME LAND TO WALK ON!'); return; }
    walking = true;
    walker.x = wx(cx(best)); walker.z = wx(cz(best));
    walker.y = standAt(walker.x, walker.z).y; walker.vy = 0; walker.pitch = -0.08;
    cam.dist = cam.distT = 6.5;
    camera.near = 0.06; camera.updateProjectionMatrix();     // things right in front of you shouldn't vanish
    ui.classList.add('walking');
    walkUI.hidden = false;
    cursorMesh.visible = false;
    endStroke();
    toast('GO EXPLORE!');
    pluck(5); pluck(9, 0.1);
  }
  function stopWalk() {
    if (!walking) return;
    walking = false;
    camera.near = 1; camera.updateProjectionMatrix();
    Object.assign(cam, saved);
    ui.classList.remove('walking');
    walkUI.hidden = true;
    stick.id = -1; knobEl.style.transform = '';
    walkKeys = {};
    softSfx();
  }
  document.getElementById('walkBtn').addEventListener('click', function () { unlockAudio(); startWalk(); });
  document.getElementById('wExit').addEventListener('click', stopWalk);
  function jump() { if (walking && walker.onGround) { walker.vy = walker.swim ? 3.2 : 5.2; tone(520, 0.12, 'sine', 0.06, 0, 780); } }
  const jumpBtn = document.getElementById('wJump');
  jumpBtn.addEventListener('pointerdown', function (e) { e.stopPropagation(); e.preventDefault(); jump(); });
  // the on-screen thumbstick
  stickEl.addEventListener('pointerdown', function (e) {
    e.stopPropagation(); e.preventDefault();
    stick.id = e.pointerId;
    try { stickEl.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    moveStick(e);
  });
  function moveStick(e) {
    const r = stickEl.getBoundingClientRect(), max = r.width / 2 - 10;
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const len = Math.hypot(x, y);
    if (len > max) { x *= max / len; y *= max / len; }
    stick.x = x / max; stick.y = y / max;
    knobEl.style.transform = 'translate(' + x + 'px,' + y + 'px)';
  }
  stickEl.addEventListener('pointermove', function (e) { if (e.pointerId === stick.id) moveStick(e); });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
    stickEl.addEventListener(ev, function (e) { if (e.pointerId === stick.id) { stick.id = -1; stick.x = stick.y = 0; knobEl.style.transform = ''; } });
  });
  [walkUI, jumpBtn, stickEl].forEach(function (el) { el.addEventListener('pointerdown', function (e) { e.stopPropagation(); }); });
  function updateWalk(dt) {
    // the stick and the arrow keys walk forward / back and turn; A / D (and the controller's
    // left stick) step sideways; dragging the screen (or the right stick) looks around
    let fwd = -stick.y, turnIn = stick.x, side = 0;
    if (walkKeys.up) fwd += 1; if (walkKeys.down) fwd -= 1;
    if (walkKeys.turnL) turnIn -= 1; if (walkKeys.turnR) turnIn += 1;
    if (walkKeys.left) side -= 1; if (walkKeys.right) side += 1;
    if (window.Pad360 && Pad360.connected()) {
      const ax = Pad360.axis(0) || 0, ay = Pad360.axis(1) || 0;
      if (Math.abs(ax) > 0.2) side += ax;
      if (Math.abs(ay) > 0.2) fwd -= ay;
      if (Math.abs(ax) <= 0.2 && Math.abs(ay) <= 0.2) { fwd -= Pad360.dy(); turnIn += Pad360.dx(); }
      const lx = Pad360.axis(2) || 0, ly = Pad360.axis(3) || 0;
      if (Math.abs(lx) > 0.2) cam.yaw -= lx * dt * 2.4;
      if (Math.abs(ly) > 0.2) walker.pitch = Math.max(-1.1, Math.min(0.9, walker.pitch - ly * dt * 1.6));
    }
    cam.yaw -= Math.max(-1, Math.min(1, turnIn)) * dt * 2.2;
    const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
    let vx = -s * fwd + c * side, vz = -c * fwd - s * side;
    const len = Math.hypot(vx, vz);
    if (len > 1) { vx /= len; vz /= len; }
    const moving = len > 0.15;
    const here = standAt(walker.x, walker.z);
    walker.swim = here.swim;
    const speed = (walker.swim ? 1.7 : 3.4) * Math.min(1, len);
    if (moving) {
      const nx = walker.x + vx * speed * dt, nz = walker.z + vz * speed * dt;
      const can = (x, z) => {
        if (Math.abs(x) > N + 1 || Math.abs(z) > N + 1 || solidAt(x, z)) return false;
        return standAt(x, z).y - walker.y < 0.55 || walker.vy > 0.5;     // too steep to step up: jump it
      };
      if (can(nx, nz)) { walker.x = nx; walker.z = nz; }
      else if (can(nx, walker.z)) walker.x = nx;
      else if (can(walker.x, nz)) walker.z = nz;
      walker.phase += dt * (walker.swim ? 6 : 12);
      walker.stepT -= dt;
      if (walker.stepT <= 0) {
        walker.stepT = walker.swim ? 0.6 : 0.32;
        if (walker.swim) { burst(walker.x - s * 0.6, 0.05, walker.z - c * 0.6, K.water, 3, 0.8); if (ac) puff(sfxBus, ac.currentTime, 0.25, 900, 0.03); }
        else if (walker.onGround) tone(180 + Math.random() * 40, 0.05, 'sine', 0.03);
      }
    }
    // gravity and landing
    const g = standAt(walker.x, walker.z).y;
    walker.vy -= 14 * dt;
    walker.y += walker.vy * dt;
    walker.onGround = false;
    if (walker.y <= g) {
      if (walker.vy < -6) burst(walker.x, g + 0.05, walker.z, K.white, 4, 1);
      walker.y = g; walker.vy = 0; walker.onGround = true;
    }
    walker.bob = moving && walker.onGround ? Math.abs(Math.sin(walker.phase)) * (walker.swim ? 0.03 : 0.05) : 0;
    // the sea, shadows and fog follow you
    cam.tx = walker.x; cam.tz = walker.z;
    cam.yawT = cam.yaw;
    // say hello to whoever you pass
    walker.hiT -= dt;
    if (walker.hiT <= 0) {
      for (let n = 0; n < villagers.length; n++) {
        const v = villagers[n];
        if (v.bye || v.x === undefined || Math.hypot(v.x - walker.x, v.z - walker.z) > 1.4) continue;
        v.wait = 1.5; v.jump = 0.5;
        say(v, villagerLine());
        pluck(7 + Math.floor(Math.random() * 3));
        walker.hiT = 4;
        break;
      }
    }
  }

  // ---------- Pointer input ----------
  const pointers = new Map();
  let pending = null, gesture = null, mouseDrag = null, strokePointer = -1;
  function firePending() {
    if (!pending) return;
    const p = pending;
    clearTimeout(p.timer); pending = null;
    if (greet(p.x, p.y)) return;
    strokePointer = p.id;
    cur = pick(p.x, p.y);
    beginStroke(cur);
  }
  function gestureState() {
    const a = Array.from(pointers.values());
    return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y), a: Math.atan2(a[1].y - a[0].y, a[1].x - a[0].x) };
  }
  view.addEventListener('pointerdown', function (e) {
    unlockAudio();
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    if (walking) {
      if (greet(e.clientX, e.clientY)) return;
      lookDrag = { id: e.pointerId, x: e.clientX, y: e.clientY };
      return;
    }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (e.pointerType === 'mouse' && e.button !== 0) {
      mouseDrag = { id: e.pointerId, x: e.clientX, y: e.clientY, pan: e.button === 1 || e.shiftKey };
      e.preventDefault();
      return;
    }
    if (pointers.size >= 2) {
      if (pending) { clearTimeout(pending.timer); pending = null; }
      endStroke(); strokePointer = -1;
      gesture = pointers.size === 2 ? gestureState() : null;
      return;
    }
    if (e.pointerType === 'touch') {
      // wait a moment: a second finger means "move the view", not "build"
      pending = { id: e.pointerId, x: e.clientX, y: e.clientY, timer: setTimeout(firePending, 130) };
    } else {
      if (greet(e.clientX, e.clientY)) return;
      strokePointer = e.pointerId;
      cur = pick(e.clientX, e.clientY);
      beginStroke(cur);
    }
  });
  view.addEventListener('pointermove', function (e) {
    if (walking) {
      if (lookDrag && lookDrag.id === e.pointerId) {
        cam.yaw += (e.clientX - lookDrag.x) * 0.006;
        walker.pitch = Math.max(-1.1, Math.min(0.9, walker.pitch + (e.clientY - lookDrag.y) * 0.005));
        lookDrag.x = e.clientX; lookDrag.y = e.clientY;
      }
      return;
    }
    const p = pointers.get(e.pointerId);
    if (p) { p.x = e.clientX; p.y = e.clientY; }
    if (mouseDrag && mouseDrag.id === e.pointerId) {
      const dx = e.clientX - mouseDrag.x, dy = e.clientY - mouseDrag.y;
      mouseDrag.x = e.clientX; mouseDrag.y = e.clientY;
      if (mouseDrag.pan) panBy(dx, dy);
      else { cam.yaw -= dx * 0.008; cam.yawT = cam.yaw; cam.el = Math.max(0.4, Math.min(1.25, cam.el + dy * 0.005)); }
      return;
    }
    if (gesture && pointers.size === 2) {
      const g = gestureState();
      panBy(g.x - gesture.x, g.y - gesture.y);
      if (g.d > 10 && gesture.d > 10) { cam.distT = Math.max(ZMIN, Math.min(ZMAX, cam.distT * gesture.d / g.d)); cam.dist = cam.distT; }
      let da = g.a - gesture.a;
      if (da > Math.PI) da -= 2 * Math.PI; else if (da < -Math.PI) da += 2 * Math.PI;
      cam.yaw -= da; cam.yawT = cam.yaw;
      gesture = g;
      return;
    }
    if (pending && pending.id === e.pointerId) {
      if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 10) firePending();
      else return;
    }
    if (e.pointerType === 'mouse' || strokePointer === e.pointerId) {
      placeCamera(); camera.updateMatrixWorld();
      cur = pick(e.clientX, e.clientY);
      if (stroke && strokePointer === e.pointerId) strokeTo(cur);
    }
  });
  function pointerEnd(e) {
    if (lookDrag && lookDrag.id === e.pointerId) lookDrag = null;
    if (walking) { pointers.delete(e.pointerId); return; }
    if (pending && pending.id === e.pointerId) firePending();
    pointers.delete(e.pointerId);
    if (mouseDrag && mouseDrag.id === e.pointerId) mouseDrag = null;
    if (strokePointer === e.pointerId) { endStroke(); strokePointer = -1; if (e.pointerType !== 'mouse') cur = -1; }
    gesture = null;
  }
  view.addEventListener('pointerup', pointerEnd);
  view.addEventListener('pointercancel', pointerEnd);
  view.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse' && !stroke) cur = -1; });
  view.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  view.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (!walking) zoomBy(Math.exp(e.deltaY * 0.0012));
  }, { passive: false });

  // ---------- Title ----------
  const titleEl = document.getElementById('title');
  let started = false;
  function start() {
    if (started) return;
    started = true;
    unlockAudio();
    titleEl.classList.add('gone');
    pluck(0); pluck(2, 0.1); pluck(4, 0.2);
  }
  titleEl.addEventListener('pointerdown', function (e) { e.stopPropagation(); start(); });

  // ---------- Keyboard and controller ----------
  function moveCursor(dx, dy) {
    if (cur < 0) cur = (N / 2) * N + N / 2;
    const q = ((Math.round(cam.yawT / (Math.PI / 2) - 0.01) % 4) + 4) % 4;
    const ux = [0, -1, 0, 1][q], uz = [-1, 0, 1, 0][q];     // "up" on screen, in cells
    const rx = -uz, rz = ux;
    const x = Math.max(0, Math.min(N - 1, cx(cur) + rx * dx - ux * dy));
    const z = Math.max(0, Math.min(N - 1, cz(cur) + rz * dx - uz * dy));
    cur = z * N + x;
    if (stroke && keyStroke) strokeTo(cur);
  }
  let keyStroke = false;
  function keyDownAct(t) { if (cur < 0) cur = (N / 2) * N + N / 2; keyStroke = true; beginStroke(cur, t); }
  function keyUpAct() { if (keyStroke) { keyStroke = false; endStroke(); } }
  function stepTool(d) { setTool(TOOLS[(TOOLS.indexOf(tool) + d + TOOLS.length) % TOOLS.length]); }
  window.addEventListener('keydown', function (e) {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    const k = e.key.toLowerCase();
    if (islandsOpen() || !photoView.hidden) {
      if (k === 'escape' || k === 'i') { islandsEl.hidden = true; photoView.hidden = true; e.preventDefault(); }
      return;
    }
    if (k === 'i' && started && !walking) { openIslands(); e.preventDefault(); return; }
    if (walking) {
      const dir = WALKKEYS[k];
      if (dir) walkKeys[dir] = true;
      else if (k === ' ') jump();
      else if (k === 'escape' || k === 'g') stopWalk();
      else if (k === 'q') walkKeys.turnL = true;
      else if (k === 'e') walkKeys.turnR = true;
      else if (k === 'n') toggleNight();
      else if (k === 'm') toggleMusic();
      e.preventDefault();
      return;
    }
    if (k === 'g' && started) { startWalk(); e.preventDefault(); return; }
    if (!started) { if (k === ' ' || k === 'enter') { start(); e.preventDefault(); } return; }
    unlockAudio();
    let used = true;
    if (k === 'arrowleft' || k === 'a') moveCursor(-1, 0);
    else if (k === 'arrowright' || k === 'd') moveCursor(1, 0);
    else if (k === 'arrowup' || k === 'w') moveCursor(0, -1);
    else if (k === 'arrowdown' || k === 's') moveCursor(0, 1);
    else if (k === ' ' || k === 'enter') { if (!e.repeat) keyDownAct(); }
    else if (k === 'x' || k === 'delete' || k === 'backspace') { if (!e.repeat) keyDownAct('dig'); }
    else if (k >= '0' && k <= '9') setTool(TOOLS[(+k + 9) % 10]);
    else if (k === 'tab') stepTool(e.shiftKey ? -1 : 1);
    else if (k === 'q') turn(-1);
    else if (k === 'e') turn(1);
    else if (k === 'c') nextColour();
    else if (k === 'n') toggleNight();
    else if (k === 'm') toggleMusic();
    else if (k === 'z' || k === 'u') undo();
    else if (k === '=' || k === '+') zoomBy(0.85);
    else if (k === '-') zoomBy(1.18);
    else used = false;
    if (used) e.preventDefault();
  });
  window.addEventListener('keyup', function (e) {
    const k = e.key.toLowerCase();
    const dir = WALKKEYS[k];
    if (dir) walkKeys[dir] = false;
    if (k === 'q') walkKeys.turnL = false;
    if (k === 'e') walkKeys.turnR = false;
    if (k === ' ' || k === 'enter' || k === 'x' || k === 'delete' || k === 'backspace') keyUpAct();
  });
  let padHold = 0, padLast = '';
  function pollPad(dt) {
    if (!window.Pad360) return;
    Pad360.poll();
    if (!Pad360.connected() || (window.MickleMenu && MickleMenu.isOpen())) return;
    if (islandsOpen() || !photoView.hidden) {
      if (Pad360.pressed(Pad360.BTN.B)) { islandsEl.hidden = true; photoView.hidden = true; }
      return;
    }
    const P = Pad360, Bt = Pad360.BTN;
    if (!started) { if (P.pressed(Bt.A) || P.pressed(Bt.START)) start(); return; }
    if (walking) {
      if (P.pressed(Bt.A)) jump();
      if (P.pressed(Bt.B) || P.pressed(Bt.BACK)) stopWalk();
      if (P.pressed(Bt.Y)) toggleNight();
      return;
    }
    if (P.pressed(Bt.START)) { startWalk(); return; }
    const dx = P.dx(), dy = P.dy(), key = dx + ',' + dy;
    if (dx || dy) {
      if (key !== padLast) { moveCursor(dx, dy); padHold = 0.32; }
      else { padHold -= dt; if (padHold <= 0) { moveCursor(dx, dy); padHold = 0.12; } }
    }
    padLast = key;
    if (P.pressed(Bt.A)) keyDownAct();
    if (P.pressed(Bt.B)) keyDownAct('dig');
    if (P.released(Bt.A) || P.released(Bt.B)) keyUpAct();
    if (P.pressed(Bt.LB)) stepTool(-1);
    if (P.pressed(Bt.RB)) stepTool(1);
    if (P.pressed(Bt.X)) nextColour();
    if (P.pressed(Bt.Y)) toggleNight();
    if (P.pressed(Bt.BACK)) undo();
    if (P.pressed(Bt.LT)) turn(-1);
    if (P.pressed(Bt.RT)) turn(1);
    const ax = P.axis(2) || 0, ay = P.axis(3) || 0;
    if (Math.abs(ax) > 0.3) { cam.yawT -= ax * dt * 1.8; }
    if (Math.abs(ay) > 0.3) zoomBy(1 + ay * dt * 1.2);
  }

  // ---------- Frame ----------
  // Held upright the stage fills the tall screen (index.html), so the buttons get their own
  // layout ('tall') and the camera widens and steps back to keep the island in view.
  let fitK = 1, walking = false;
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(view.clientWidth, view.clientHeight, false);
    camera.aspect = view.clientWidth / view.clientHeight;
    const tall = camera.aspect < 1.2;
    camera.fov = tall ? 42 : 30;
    fitK = tall ? 1.4 : 1;
    camera.updateProjectionMatrix();
    ui.classList.toggle('tall', tall);
    ui.style.fontSize = Math.max(7, tall ? Math.min(r.width / 22, r.height / 40) : Math.min(r.width / 32, r.height / 28)) + 'px';
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  let last = performance.now(), smokeT = 0, cocoaT = 6;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    pollPad(dt);
    tickMusic();

    // camera easing (walking moves the camera itself)
    if (walking) updateWalk(dt);
    else {
      cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 9);
      cam.ty += (0.5 - cam.ty) * Math.min(1, dt * 6);
    }
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt * 9);
    placeCamera();
    followCamera();

    // day / night
    if (nightK !== night) { nightK += Math.sign(night - nightK) * Math.min(Math.abs(night - nightK), dt * 1.6); applyNight(); }

    // water
    const wp = waterGeo.attributes.position, wox = water.position.x, woz = water.position.z;
    for (let n = 0; n < wp.count; n++) {
      wp.setY(n, Math.sin((wp.getX(n) + wox) * 0.33 + clock * 1.1) * 0.05 + Math.sin((wp.getZ(n) + woz) * 0.27 + clock * 0.8) * 0.05 - 0.02);
    }
    wp.needsUpdate = true;
    waterTex.offset.set(clock * 0.004 + wox / 20, clock * 0.0025 - woz / 20);
    riverTex.offset.set(clock * 0.03, clock * 0.02);
    fallTex.offset.y = clock * 1.1;

    // pops and bounces
    for (let i = 0; i < N * N; i++) {
      const a = anim[i];
      if (a) { a.t += dt; if (a.t >= a.dur) anim[i] = null; poseCell(i); }
      const l = landAnim[i];
      if (l) {
        l.t += dt;
        const e = Math.min(1, l.t / l.dur), u = e - 1;
        visH[i] = l.from + (l.to - l.from) * (1 + 2.7 * u * u * u + 1.7 * u * u);
        if (e >= 1) { visH[i] = l.to; landAnim[i] = null; }
        poseCell(i);
        markTerrain(i);
      }
    }
    rebuildDirty();

    // holding still on a tower or a mountain keeps it growing, faster and faster
    if (stroke && REPEATS[stroke.op] && stroke.last >= 0 && (strokePointer >= 0 || keyStroke)) {
      stroke.hold = (stroke.hold === undefined ? 0.45 : stroke.hold) - dt;
      if (stroke.hold <= 0) {
        if (opFor(stroke.last, stroke.tool) === stroke.op) doOp(stroke.last, stroke.op);
        stroke.reps = (stroke.reps || 0) + 1;
        stroke.hold = Math.max(stroke.op === 'mount' ? 0.22 : 0.06, 0.3 * Math.pow(0.85, stroke.reps));
      }
    }

    // spray at the foot of every waterfall
    if (fallSpots.size && Math.random() < Math.min(0.9, fallSpots.size * 0.12)) {
      const keys = Array.from(fallSpots.keys()), list = fallSpots.get(keys[Math.floor(Math.random() * keys.length)]);
      const sp = list[Math.floor(Math.random() * list.length)], big = Math.min(1, sp[3] / 3);
      spark(sp[0] + (Math.random() - 0.5) * 1.1, sp[1], sp[2] + (Math.random() - 0.5) * 1.1, (Math.random() - 0.5) * 0.8, 1 + big * 2.5, (Math.random() - 0.5) * 0.8,
        K.white, 0.08 + big * 0.08, 0.7, 4, 1.2);
    }

    // after dark, now and then a house says what's going on inside
    cocoaT -= dt;
    if (cocoaT <= 0) {
      cocoaT = 4 + Math.random() * 5;
      if (nightK > 0.6 && homes && bubbles.length < 3 && started) {
        const hs = [];
        for (let i = 0; i < N * N; i++) if (kind[i] === HOUSE) hs.push(i);
        const i = hs[Math.floor(Math.random() * hs.length)];
        say({ x: wx(cx(i)), y: levelY(land[i]) + hgt[i] * FH + RH * 0.4, z: wx(cz(i)) },
          pickLine(['\u2615 HOT COCOA!', 'ZZZ...', '\u266a BEDTIME STORY', 'COZY BLANKETS!', 'SWEET DREAMS!']));
      }
    }

    // chimney smoke
    smokeT -= dt;
    if (smokeT <= 0 && chimneys.size) {
      smokeT = Math.max(0.08, 0.7 / chimneys.size);
      const keys = Array.from(chimneys.keys());
      const c = chimneys.get(keys[Math.floor(Math.random() * keys.length)]);
      spark(c[0], c[1], c[2], 0.25 + Math.random() * 0.2, 0.7, 0.1, K.white, 0.1, 2.2, 0, 1.6);
    }
    updateVillagers(dt);
    updateAnimals(dt);
    updateWeather(dt);
    spinners.forEach(function (i) { if (objs[i] && objs[i].userData.spin) objs[i].userData.spin.rotation.z += dt * 1.1; });
    for (let n = 0; n < gulls.length; n++) {
      const g = gulls[n];
      g.a += g.sp * dt;
      g.m.position.set(cam.tx + Math.cos(g.a) * g.r, g.h + Math.sin(clock * 0.7 + n) * 0.5, cam.tz + Math.sin(g.a) * g.r);
      g.m.rotation.y = -g.a - (g.sp > 0 ? Math.PI / 2 : -Math.PI / 2);
      g.m.scale.y = 0.3 + Math.sin(clock * 7 + n * 2) * 1.1;
    }
    updateParts(dt);
    updateFireworks(dt);
    updateGhost(dt);
    updateMonster(dt);
    const bats = holiday() === 'halloween' && nightK > 0.5;
    if (!gullGeo) gullGeo = gulls[0].m.geometry;
    gulls.forEach(function (g) { g.m.geometry = bats ? batGeo : gullGeo; g.h = bats ? 5 + (g.r % 3) : 9 + (g.r % 3); });

    // boats
    for (let n = 0; n < boats.length; n++) {
      const b = boats[n];
      b.a += b.sp * dt;
      b.m.position.set(Math.cos(b.a) * b.r, -0.06 + Math.sin(clock * 1.3 + n) * 0.05, Math.sin(b.a) * b.r);
      b.m.rotation.set(Math.sin(clock * 1.1 + n) * 0.06, -b.a - (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    }

    // cursor
    if (cur >= 0 && started && !walking) {
      cursorMesh.visible = true;
      const s = 1 + Math.sin(clock * 6) * 0.04;
      cursorMesh.scale.set(s, s, s);
      cursorMesh.position.set(wx(cx(cur)), (kind[cur] === RIVER ? levelY(land[cur]) - 0.18 : land[cur] ? groundY(cur) : kind[cur] === DOCK ? 0.42 : 0.05) + 0.08, wx(cz(cur)));
      const cop = opFor(cur, tool);
      cursorMesh.material.color.set(cop === 'none' || cop === 'nodock' || cop === 'noriver' || cop === 'nobeach' ? 0xff8a8a : 0xffffff);
    } else cursorMesh.visible = false;

    // save a moment after the last change
    if (dirty) { dirty = false; saveT = 0.5; }
    if (saveT > 0) { saveT -= dt; if (saveT <= 0) { save(); if (thumbT > 45) captureThumb(); } }
    thumbT += dt;

    renderer.render(scene, camera);
    updateBubbles(dt);
    placeTownLabels();
  }

  // ---------- Go ----------
  readIndex();
  migrateSlots();
  if (!curId) { try { curId = localStorage.getItem(CUR_KEY) || ''; } catch (e) { curId = ''; } }
  if (!entry(curId)) curId = islands.length ? islands[0].id : '';
  if (!curId) createIsland();
  else openIsland(curId);
  setTool('house');
  showColour();
  showNight();
  applyNight();
  resize();
  placeCamera();
  requestAnimationFrame(loop);
})();
