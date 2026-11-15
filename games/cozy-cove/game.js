// Cozy Cove -- a very casual 3D island town builder (three.js).
//
// The island is a 20 x 20 grid of cells. A cell is water or land, and can hold one thing:
// a HOUSE (1-6 floors), NATURE (trees, flowers, rocks), a PATH, or -- on water -- a DOCK.
// There is nothing to win or lose: tap or drag to build, tap again to grow or change.
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
  const N = 20;            // cells per side
  const T = 2;             // one cell, world units
  const HALF = T / 2;
  const LANDH = 0.5;       // land top above the water
  const FH = 1.1;          // one house floor
  let RH = 0.9;            // roof height
  const INSET = 0.2;       // house walls sit this far inside the cell edge
  const B = HALF - INSET;
  const MAXH = 6;
  const MAXLV = 4;         // land levels: 1 is the beach-level ground, 2-4 are hills
  const STEP = 0.9;        // height of one hill level
  const SEABED = -0.7;
  const NONE = 0, HOUSE = 1, NATURE = 2, PATH = 3, DOCK = 4, SPECIAL = 5;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // E, S, W, N
  const NATURE_N = 6, PATH_N = 3, DOCK_N = 3, SPECIAL_N = 4;
  const SAVE_KEY = 'cozyCove.save';
  // three islands to build on; slot 1 keeps the plain key so older saves still load
  let slot = 1;
  try { slot = Math.max(1, Math.min(3, +localStorage.getItem('cozyCove.slot') || 1)); } catch (e) { /* storage can be off */ }
  const saveKey = () => SAVE_KEY + (slot > 1 ? slot : '');
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

  const land = new Uint8Array(N * N);
  const kind = new Uint8Array(N * N);
  const hgt = new Uint8Array(N * N);
  const col = new Uint8Array(N * N);
  const vr = new Uint8Array(N * N);
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
  const visH = new Float32Array(N * N).fill(SEABED);   // the ground height on show (it eases toward levelY)
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
    dark: C(0x4a4038), orange: C(0xf29a3c), cream: C(0xfff1d0), cat: C(0x6a6660),
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

  const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 500);
  const cam = { yaw: Math.PI / 4, yawT: Math.PI / 4, el: 0.72, dist: 46, distT: 46, tx: 0, tz: 0 };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x9fc78a, 1.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
  sun.position.set(24, 40, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -30; sun.shadow.camera.right = 30;
  sun.shadow.camera.top = 30; sun.shadow.camera.bottom = -30;
  sun.shadow.camera.near = 5; sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0015;
  scene.add(sun);

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
  const GLOW_DAY = C(0x4f76a6), GLOW_NIGHT = C(0xffd98a);
  const glowMat = new THREE.MeshLambertMaterial({ color: GLOW_DAY.clone(), emissive: 0xffb040, emissiveIntensity: 0 });

  // Water: a big low-poly sheet whose points bob up and down.
  const WATER_DAY = C(0x39bfd6), WATER_NIGHT = C(0x2a62a0);
  const waterGeo = new THREE.PlaneGeometry(320, 320, 64, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshLambertMaterial({ color: WATER_DAY.clone(), flatShading: true, map: waterTex, transparent: true, opacity: 0.74 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  scene.add(water);

  // Land: one smooth surface over the whole grid. Each cell has a flat middle (so buildings
  // sit level) and blends into its neighbours' heights across the cell edges, which rounds
  // off the shore and turns raised cells into soft hills.
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const OFF = [0, 0.15, 0.3, 1.7, 1.85];          // grid lines inside one cell: packed round the edges
  const TCELLS = N + 2;                           // one extra ring of sea, so the edge can slope away
  const TV = TCELLS * OFF.length + 1;
  const lineAt = (n) => (n === TV - 1 ? TCELLS * T : Math.floor(n / OFF.length) * T + OFF[n % OFF.length]) - TCELLS * T / 2;
  const tPos = new Float32Array(TV * TV * 3), tCol = new Float32Array(TV * TV * 3), tUv = new Float32Array(TV * TV * 2);
  const tIdx = [];
  for (let a = 0; a < TV; a++) for (let c = 0; c < TV; c++) {
    const n = a * TV + c;
    tPos[n * 3] = lineAt(c); tPos[n * 3 + 2] = lineAt(a);
    tUv[n * 2] = lineAt(c) * 0.085; tUv[n * 2 + 1] = lineAt(a) * 0.085;
    if (a < TV - 1 && c < TV - 1) tIdx.push(n, n + TV, n + 1, n + 1, n + TV, n + TV + 1);
  }
  const terrGeo = new THREE.BufferGeometry();
  terrGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3));
  terrGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3));
  terrGeo.setAttribute('uv', new THREE.BufferAttribute(tUv, 2));
  terrGeo.setIndex(tIdx);
  const terrain = new THREE.Mesh(terrGeo, new THREE.MeshLambertMaterial({ vertexColors: true, map: washTex }));
  terrain.receiveShadow = true; terrain.castShadow = true;
  terrain.frustumCulled = false;
  scene.add(terrain);
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(320, 320), new THREE.MeshLambertMaterial({ color: 0x2f9fbe }));
  seabed.rotation.x = -Math.PI / 2; seabed.position.y = SEABED - 0.02;
  scene.add(seabed);

  const cellH = (a, c) => (inb(a, c) ? visH[c * N + a] : SEABED);
  const ease = (f) => { const t = Math.max(0, Math.min(1, (f - 0.35) / 0.3)); return t * t * (3 - 2 * t); };
  function groundAt(x, z) {
    const gx = x / T + N / 2 - 0.5, gz = z / T + N / 2 - 0.5;
    const ix = Math.floor(gx), iz = Math.floor(gz);
    const sx = ease(gx - ix), sz = ease(gz - iz);
    const h00 = cellH(ix, iz), h10 = cellH(ix + 1, iz), h01 = cellH(ix, iz + 1), h11 = cellH(ix + 1, iz + 1);
    return (h00 + (h10 - h00) * sx) * (1 - sz) + (h01 + (h11 - h01) * sx) * sz;
  }
  const TC = { deep: C(0x2f9fbe), sand: C(0xf5e3aa), grass: C(0x86cc62), grass2: C(0xb2dc74), high: C(0xcfe08a), cliff: C(0xc2a273) };
  const terrNoise = makeNoise(31);
  const tc = new THREE.Color();
  const mix01 = (v, a, b) => Math.max(0, Math.min(1, (v - a) / (b - a)));
  function rebuildTerrain() {
    for (let n = 0; n < TV * TV; n++) tPos[n * 3 + 1] = groundAt(tPos[n * 3], tPos[n * 3 + 2]);
    terrGeo.attributes.position.needsUpdate = true;
    terrGeo.computeVertexNormals();
    const nor = terrGeo.attributes.normal.array;
    for (let n = 0; n < TV * TV; n++) {
      const x = tPos[n * 3], y = tPos[n * 3 + 1], z = tPos[n * 3 + 2];
      const blot = terrNoise((x + 60) * 0.28, (z + 60) * 0.28, 64);
      tc.copy(TC.grass).lerp(TC.grass2, blot).lerp(TC.high, mix01(y, LANDH + 0.2, LANDH + STEP * 3) * 0.8);
      if (y > LANDH - 0.1) tc.lerp(TC.cliff, mix01(0.93 - nor[n * 3 + 1], 0, 0.3) * 0.75);   // steep sides turn earthy
      if (y < 0.44) tc.lerp(TC.sand, 1 - mix01(y, 0.2, 0.44));                                // the beach
      if (y < 0.02) tc.lerp(TC.deep, 1 - mix01(y, -0.4, 0.02));                               // fading into deep water
      tCol[n * 3] = tc.r; tCol[n * 3 + 1] = tc.g; tCol[n * 3 + 2] = tc.b;
    }
    terrGeo.attributes.color.needsUpdate = true;
  }
  let terrDirty = false;
  // start the ground of cell i easing to where its level says it should be
  function aimLand(i) {
    const to = levelY(land[i]);
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
  function buildHouse(i, b, g) {
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

    for (let k = 0; k < h; k++) {
      // the ground floor's walls run down into the ground, so a house never floats over a slope
      const yf = k * FH, y1 = yf + FH, y0 = k ? yf : -0.45;
      const kc = k % 2 ? wc.clone().multiplyScalar(0.94) : wc;
      const c = [], f = [];
      for (let d = 0; d < 4; d++) c[d] = hh[d] > k;
      for (let d = 0; d < 4; d++) f[d] = c[d] && c[(d + 1) % 4] && dg[d] > k;
      for (let d = 0; d < 4; d++) {
        const e = (d + 1) % 4, p = (d + 3) % 4;
        if (!c[d]) {
          b.wall(d, B, -B, B, y0, y1, kc);
          if (k === 0 && d === doorDir) {
            b.wall(d, B + 0.02, -0.2, 0.2, yf, yf + 0.7, K.door);
          } else if ((seed + k + d) % 3 === 0) {
            g.wall(d, B + 0.02, -0.5, -0.22, yf + 0.38, yf + 0.84, K.white);
            g.wall(d, B + 0.02, 0.22, 0.5, yf + 0.38, yf + 0.84, K.white);
          } else {
            g.wall(d, B + 0.02, -0.2, 0.2, yf + 0.38, yf + 0.84, K.white);
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
    const yb = h * FH;
    const mid = [], cor = [];
    let ridges = 0;
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      const up = hh[d] >= h;
      if (up) ridges++;
      const out = HALF + (hh[d] > h ? INSET : 0);
      mid[d] = [out * DX[d], yb + (up ? RH : 0), out * DZ[d]];
      const cu = hh[d] >= h && hh[e] >= h && dg[d] >= h;
      cor[d] = [HALF * (DX[d] + DX[e]), yb + (cu ? RH : 0), HALF * (DZ[d] + DZ[e])];
    }
    const top = [0, yb + RH, 0];
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      b.tri(top, cor[d], mid[d], rc);
      b.tri(top, mid[e], cor[d], rc);
    }
    // a chimney on some roofs (smoke comes out of these)
    if (seed % 3 === 0 && ridges < 4) {
      b.box(0.28, yb + 0.2, 0.28, 0.52, yb + RH + 0.2, 0.52, K.chim);
      chimneys.set(i, [wx(x) + 0.4, levelY(land[i]) + yb + RH + 0.3, wx(z) + 0.4]);
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
      else if (k === PATH && up === 0) b.dirBox(d, 0.5, HALF, -0.42, 0.42, 0, 0.05, K.stone2);
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
    const k = kind[i];
    if (k === NONE) return;
    let mesh;
    if (k === NATURE) {
      mesh = new THREE.Mesh(natureGeo[vr[i] % NATURE_N], townMat);
      mesh.rotation.y = rnd(i + 5) * 6.28;
      mesh.userData.size = 0.85 + rnd(i + 9) * 0.3;
    } else {
      const b = new Builder(), g = new Builder();
      if (k === HOUSE) buildHouse(i, b, g);
      else if (k === PATH) buildPath(i, b, g);
      else if (k === SPECIAL) buildSpecial(i, b, g);
      else buildDock(i, b, g);
      mesh = new THREE.Mesh(b.build(wx(cx(i)), wx(cz(i))), townMat);
      mesh.userData.own = true;
      if (!g.empty()) mesh.add(new THREE.Mesh(g.build(), glowMat));
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
    mesh.position.set(wx(cx(i)), k === DOCK ? 0 : visH[i], wx(cz(i)));
    scene.add(mesh);
    objs[i] = mesh;
    poseCell(i);
  }
  function poseCell(i) {
    const o = objs[i];
    if (!o) return;
    o.position.y = kind[i] === DOCK ? 0 : visH[i];
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

  // rebuild a cell and the 8 cells round it (neighbours change how things join up)
  function touch(i) {
    const x = cx(i), z = cz(i);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (inb(x + dx, z + dz)) refresh((z + dz) * N + x + dx);
    }
    aimLand(i);
    dirty = true;
  }

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

  // ---------- Sail boats drifting round the island ----------
  const boats = [];
  (function () {
    const b = new Builder();
    b.box(-0.8, 0, -0.32, 0.6, 0.32, 0.32, K.hull);
    b.tri([0.6, 0, -0.32], [0.6, 0, 0.32], [1.25, 0.32, 0], K.hull);
    b.tri([0.6, 0.32, -0.32], [1.25, 0.32, 0], [0.6, 0.32, 0.32], K.hull);
    b.tri([0.6, 0, -0.32], [1.25, 0.32, 0], [0.6, 0.32, -0.32], K.hull);
    b.tri([0.6, 0, 0.32], [0.6, 0.32, 0.32], [1.25, 0.32, 0], K.hull);
    b.box(-0.04, 0.32, -0.04, 0.04, 2.1, 0.04, K.woodDark);
    b.tri([0.08, 0.5, 0], [0.08, 2.05, 0], [0.95, 0.5, 0], K.sail);
    b.tri([-0.08, 0.6, 0], [-0.75, 0.6, 0], [-0.08, 1.7, 0], K.sail);
    const geo = b.build();
    [[31, 0.05, 0], [38, -0.035, 2.4], [45, 0.028, 4.4]].forEach(function (s) {
      const m = new THREE.Mesh(geo, townMat);
      m.castShadow = true;
      scene.add(m);
      boats.push({ m: m, r: s[0], sp: s[1], a: s[2] });
    });
  })();

  // ---------- Villagers ----------
  // One little person per house floor (fewer out and about at night). They step out of a
  // house, stroll from cell to cell -- they like paths best -- and slip back inside when
  // there are more of them than homes. Two instanced meshes: bodies and heads.
  const VMAX = 48;
  const vBodyGeo = new THREE.CylinderGeometry(0.06, 0.13, 0.34, 6); vBodyGeo.translate(0, 0.17, 0);
  const vHeadGeo = new THREE.IcosahedronGeometry(0.1, 1); vHeadGeo.translate(0, 0.43, 0);
  const vBody = new THREE.InstancedMesh(vBodyGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, map: washTex }), VMAX);
  const vHead = new THREE.InstancedMesh(vHeadGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), VMAX);
  vBody.castShadow = true; vBody.frustumCulled = false; vHead.frustumCulled = false;
  scene.add(vBody, vHead);
  const SHIRTS = [0xe8665a, 0x4f8fd6, 0xf2b84b, 0x6cc070, 0xb07be0, 0xf08fb5, 0x4fc0c0, 0xffffff].map(C);
  const SKINS = [0xf6d3b3, 0xe2b48c, 0xc68e62, 0x8f5e3c].map(C);
  for (let n = 0; n < VMAX; n++) {
    vBody.setMatrixAt(n, tmpM.makeScale(0, 0, 0)); vHead.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
    vBody.setColorAt(n, SHIRTS[0]); vHead.setColorAt(n, SKINS[0]);
  }
  const villagers = [];
  let people = 0, spawnT = 0;
  const plainDock = (i) => kind[i] === DOCK && vr[i] % DOCK_N === 0;
  const walkable = (i) => plainDock(i) || (land[i] > 0 && (kind[i] === NONE || kind[i] === PATH || (kind[i] === NATURE && vr[i] % NATURE_N === 4)));
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
    const wanted = Math.min(VMAX, night ? Math.ceil(people / 3) : people);
    let out = 0;
    for (let n = 0; n < villagers.length; n++) if (!villagers[n].bye) out++;
    spawnT -= dt;
    if (out < wanted && villagers.length < VMAX && spawnT <= 0) { spawnVillager(); spawnT = 0.5; }
    else if (out > wanted) {
      for (let n = villagers.length - 1; n >= 0; n--) if (!villagers[n].bye) { villagers[n].bye = true; break; }
    }
    for (let n = villagers.length - 1; n >= 0; n--) {
      const v = villagers[n];
      if (!walkable(v.to)) v.bye = true;                 // something was built here: pop inside
      v.s = Math.max(0, Math.min(1, v.s + (v.bye ? -dt * 3 : dt * 3)));
      if (v.bye && v.s <= 0) { villagers.splice(n, 1); continue; }
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
      if (!v) { vBody.setMatrixAt(n, tmpM.makeScale(0, 0, 0)); vHead.setMatrixAt(n, tmpM.makeScale(0, 0, 0)); continue; }
      const e = v.t * v.t * (3 - 2 * v.t);
      const ax = wx(cx(v.from)), az = wx(cz(v.from)), bx = wx(cx(v.to)), bz = wx(cz(v.to));
      // walk a little to one side of the line so people passing don't walk through each other
      const len = Math.hypot(bx - ax, bz - az) || 1, ox = -(bz - az) / len * v.side, oz = (bx - ax) / len * v.side;
      const x = ax + (bx - ax) * e + ox, z = az + (bz - az) * e + oz;
      const hop = v.jump > 0 ? Math.sin((1 - v.jump / 0.5) * Math.PI) * 0.45 : v.wait > 0 ? 0 : Math.abs(Math.sin(v.phase)) * 0.07;
      let gy = groundAt(x, z);
      if (kind[v.from] === DOCK || kind[v.to] === DOCK) gy = Math.max(gy, 0.42);      // up on the planks
      v.x = x; v.y = gy; v.z = z;
      tmpP.set(x, gy + hop, z);
      tmpS.set(v.s * 1.35, v.s * 1.35, v.s * 1.35);
      tmpM.compose(tmpP, tmpQ, tmpS);
      vBody.setMatrixAt(n, tmpM); vHead.setMatrixAt(n, tmpM);
      vBody.setColorAt(n, v.shirt); vHead.setColorAt(n, v.skin);
    }
    vBody.instanceMatrix.needsUpdate = vHead.instanceMatrix.needsUpdate = true;
    vBody.instanceColor.needsUpdate = vHead.instanceColor.needsUpdate = true;
  }

  // ---------- Animals: sheep on open grass, ducks along the shore, gulls overhead ----------
  const AMAX = 6;
  function animalGeo(type) {
    const b = new Builder();
    if (type === 0) {
      b.add(ICO1, M(0, 0.27, 0, 0.27, 0.2, 0.2), K.white);
      b.add(ICO, M(0.27, 0.32, 0, 0.11, 0.1, 0.09), K.dark);
      for (let n = 0; n < 4; n++) b.box((n & 1 ? 0.12 : -0.16), 0, (n & 2 ? 0.07 : -0.11), (n & 1 ? 0.16 : -0.12), 0.14, (n & 2 ? 0.11 : -0.07), K.dark);
    } else {
      b.add(ICO1, M(0, 0.07, 0, 0.19, 0.11, 0.12), K.white);
      b.add(ICO, M(0.15, 0.2, 0, 0.075, 0.075, 0.07), K.white);
      b.box(0.2, 0.17, -0.03, 0.3, 0.21, 0.03, K.orange);
      b.tri([-0.17, 0.1, -0.05], [-0.17, 0.1, 0.05], [-0.27, 0.19, 0], K.white);
    }
    return b.build();
  }
  const aMesh = [0, 1].map(function (type) {
    const m = new THREE.InstancedMesh(animalGeo(type), townMat, AMAX);
    m.castShadow = type === 0; m.frustumCulled = false;
    for (let n = 0; n < AMAX; n++) m.setMatrixAt(n, tmpM.makeScale(0, 0, 0));
    scene.add(m);
    return m;
  });
  const animals = [], wantA = [0, 0];
  let aSpawnT = 0;
  const YAXIS = new THREE.Vector3(0, 1, 0), tmpQ2 = new THREE.Quaternion();
  function isShore(i) {
    if (land[i] || kind[i]) return false;
    const x = cx(i), z = cz(i);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) if (inb(x + dx, z + dz) && land[(z + dz) * N + x + dx]) return true;
    return false;
  }
  const roam = (type, i) => (type === 0 ? land[i] > 0 && kind[i] === NONE : isShore(i));
  function roamSteps(type, i) {
    const out = [];
    for (let d = 0; d < 4; d++) {
      const x = cx(i) + DX[d], z = cz(i) + DZ[d];
      if (!inb(x, z)) continue;
      const n = z * N + x;
      if (roam(type, n) && (type === 1 || Math.abs(land[n] - land[i]) <= 1)) out.push(n);
    }
    return out;
  }
  function spawnAnimal(type) {
    const c = [];
    for (let i = 0; i < N * N; i++) if (roam(type, i)) c.push(i);
    if (!c.length) return;
    const at = c[Math.floor(Math.random() * c.length)];
    animals.push({ type: type, from: at, to: at, t: 1, wait: Math.random() * 2, s: 0, bye: false, jump: 0,
      speed: type ? 0.45 : 0.32, phase: Math.random() * 6, ang: Math.random() * 6, x: 0, y: 0, z: 0 });
  }
  function updateAnimals(dt) {
    aSpawnT -= dt;
    for (let type = 0; type < 2; type++) {
      let out = 0;
      for (let n = 0; n < animals.length; n++) if (animals[n].type === type && !animals[n].bye) out++;
      if (out < wantA[type] && aSpawnT <= 0) { spawnAnimal(type); aSpawnT = 1.2; }
      else if (out > wantA[type]) {
        for (let n = animals.length - 1; n >= 0; n--) if (animals[n].type === type && !animals[n].bye) { animals[n].bye = true; break; }
      }
    }
    const used = [0, 0];
    for (let n = animals.length - 1; n >= 0; n--) {
      const a = animals[n];
      if (!roam(a.type, a.to)) a.bye = true;
      a.s = Math.max(0, Math.min(1, a.s + (a.bye ? -dt * 3 : dt * 3)));
      if (a.bye && a.s <= 0) { animals.splice(n, 1); continue; }
      if (a.jump > 0) a.jump -= dt;
      if (a.wait > 0) a.wait -= dt;
      else {
        a.t += dt * a.speed / T; a.phase += dt * 9;
        if (a.t >= 1) {
          const o = roamSteps(a.type, a.to);
          a.from = a.to; a.t = 0;
          if (o.length) a.to = o[Math.floor(Math.random() * o.length)];
          a.wait = Math.random() < 0.6 ? 1 + Math.random() * 4 : 0;       // mostly they graze / paddle about
        }
      }
      const e = a.t * a.t * (3 - 2 * a.t);
      const ax = wx(cx(a.from)), az = wx(cz(a.from)), bx = wx(cx(a.to)), bz = wx(cz(a.to));
      const x = ax + (bx - ax) * e, z = az + (bz - az) * e;
      if (a.to !== a.from) {
        let da = Math.atan2(-(bz - az), bx - ax) - a.ang;
        da = ((da + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
        a.ang += da * Math.min(1, dt * 5);
      }
      const hop = a.jump > 0 ? Math.sin((1 - a.jump / 0.5) * Math.PI) * 0.4 : 0;
      a.x = x; a.z = z;
      a.y = a.type === 0 ? groundAt(x, z) : -0.03 + Math.sin(clock * 1.6 + a.phase) * 0.03;
      tmpP.set(x, a.y + hop + (a.type === 0 && a.wait <= 0 ? Math.abs(Math.sin(a.phase)) * 0.04 : 0), z);
      tmpQ2.setFromAxisAngle(YAXIS, a.ang);
      tmpS.set(a.s * 1.3, a.s * 1.3, a.s * 1.3);
      if (used[a.type] < AMAX) aMesh[a.type].setMatrixAt(used[a.type]++, tmpM.compose(tmpP, tmpQ2, tmpS));
    }
    for (let type = 0; type < 2; type++) {
      for (let n = used[type]; n < AMAX; n++) aMesh[type].setMatrixAt(n, tmpM.makeScale(0, 0, 0));
      aMesh[type].instanceMatrix.needsUpdate = true;
    }
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
    if (!best) return false;
    best.wait = 1.7; best.jump = 0.5;
    const hi = STYLES[styleN % STYLES.length].hi;
    say(best, best.type === 0 ? 'BAA!' : best.type === 1 ? 'QUACK!' : Math.random() < 0.4 ? hi : HELLOS[Math.floor(Math.random() * HELLOS.length)]);
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
    wPts.position.set(cam.tx, 0, cam.tz);
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
    for (let v = 0; v < NATURE_N; v++) { natureGeo[v].dispose(); natureGeo[v] = makeNature(v); }
    setWeatherFx();
    showColour();
    showLook();
    redrawAll();
    applyNight();
  }
  const styleBtn = document.getElementById('styleBtn'), slotBtn = document.getElementById('slotBtn');
  const weatherLbl = document.getElementById('weatherLbl'), weatherIco = document.getElementById('weatherIco');
  function showLook() {
    if (styleBtn) styleBtn.textContent = 'STYLE: ' + STYLES[styleN % STYLES.length].name;
    if (slotBtn) slotBtn.textContent = 'ISLAND: ' + slot + ' OF 3';
    if (weatherLbl) weatherLbl.textContent = WEATHERS[weather];
    if (weatherIco) weatherIco.setAttribute('fill', ['#ffb52e', '#5a9be0', '#e8873a', '#bfe3f2'][weather]);
  }
  function nextStyle() {
    styleN = (styleN + 1) % STYLES.length;
    brush.nature = STYLES[styleN].tree;
    applyLook(); dirty = true;
    blipSfx(); toast(STYLES[styleN].name + ' STYLE');
  }
  function nextWeather() {
    weather = (weather + 1) % WEATHERS.length;
    applyLook(); dirty = true;
    blipSfx(); toast(WEATHERS[weather]);
  }
  function nextIsland() {
    save();
    slot = slot % 3 + 1;
    try { localStorage.setItem('cozyCove.slot', String(slot)); } catch (e) { /* storage can be off */ }
    if (!load()) { styleN = 0; weather = 0; night = 0; starter(); }
    undoStack.length = 0; villagers.length = 0; animals.length = 0;
    cam.tx = cam.tz = 0; cam.distT = 46;
    applyLook(); showNight(); recount(true);
    blipSfx(); toast('ISLAND ' + slot);
  }
  if (styleBtn) styleBtn.addEventListener('click', function () { unlockAudio(); nextStyle(); });
  if (slotBtn) slotBtn.addEventListener('click', function () { unlockAudio(); nextIsland(); });
  const weatherBtn = document.getElementById('weather'), photoBtn = document.getElementById('photo');
  if (weatherBtn) weatherBtn.addEventListener('click', function () { unlockAudio(); nextWeather(); });
  // PHOTO: draw one clean frame (no build cursor) and hand it over as a picture file
  if (photoBtn) photoBtn.addEventListener('click', function () {
    unlockAudio();
    try {
      cursorMesh.visible = false;
      renderer.render(scene, camera);
      const a = document.createElement('a');
      a.href = view.toDataURL('image/png');
      a.download = 'cozy-cove-island-' + slot + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      tone(1200, 0.06, 'sine', 0.06); tone(900, 0.1, 'sine', 0.05, 0.07);
      toast('PICTURE SAVED!');
    } catch (e) { toast("CAN'T SAVE A PICTURE HERE"); }
  });

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
  let mile = 0, homes = 0;
  const statEl = document.getElementById('stat');
  function recount(quiet) {
    homes = 0; people = 0;
    for (let i = 0; i < N * N; i++) if (kind[i] === HOUSE) { homes++; people += hgt[i]; }
    statEl.textContent = 'HOMES ' + homes + ' \u00b7 PEOPLE ' + people;
    let grassN = 0, shoreN = 0;
    for (let i = 0; i < N * N; i++) { if (land[i] > 0 && kind[i] === NONE) grassN++; else if (isShore(i)) shoreN++; }
    wantA[0] = Math.min(AMAX, Math.floor(grassN / 10));
    wantA[1] = Math.min(AMAX, Math.floor(shoreN / 8));
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
    for (let i = 0; i < N * N; i++) if (land[i] || kind[i]) cells.push([i, land[i], kind[i], hgt[i], col[i], vr[i]]);
    try { localStorage.setItem(saveKey(), JSON.stringify({ v: 1, night: night, mile: mile, style: styleN, weather: weather, cells: cells })); } catch (e) { /* storage can be off */ }
  }
  function clearAll() {
    for (let i = 0; i < N * N; i++) {
      land[i] = kind[i] = hgt[i] = col[i] = vr[i] = 0;
      anim[i] = landAnim[i] = null;
    }
  }
  function redrawAll() {
    for (let i = 0; i < N * N; i++) { visH[i] = levelY(land[i]); landAnim[i] = null; refresh(i); }
    rebuildTerrain();
  }
  function starter() {
    clearAll();
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
      const s = JSON.parse(localStorage.getItem(saveKey()));
      if (!s || s.v !== 1 || !s.cells.length) return false;
      clearAll();
      s.cells.forEach(function (c) {
        const i = c[0];
        if (i >= 0 && i < N * N) { land[i] = Math.min(MAXLV, c[1]); kind[i] = c[2]; hgt[i] = c[3]; col[i] = c[4]; vr[i] = c[5]; }
      });
      night = s.night ? 1 : 0; nightK = night;
      styleN = (s.style | 0) % STYLES.length; weather = (s.weather | 0) % WEATHERS.length;
      mile = s.mile || 0;
      return true;
    } catch (e) { return false; }
  }

  // ---------- Tools ----------
  const TOOLS = ['land', 'house', 'special', 'nature', 'path', 'dock', 'dig'];
  let tool = 'house';
  let colSel = -1;                 // -1 = a surprise colour for every new building
  let lastCol = 0;
  const brush = { nature: 0, path: 0, dock: 0, special: 0 };
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
    if (t === 'land') return !land[i] ? 'land' : land[i] < MAXLV ? 'raise' : 'top';
    if (t === 'house') return k === HOUSE ? (hgt[i] < MAXH ? 'stack' : 'max') : 'house';
    if (t === 'dig') return k !== NONE ? 'dig' : land[i] ? 'digland' : 'none';
    if (k === HOUSE) return 'nudge';
    if (t === 'special') return k === SPECIAL ? 'cycle' : 'special';
    if (t === 'nature') return k === NATURE ? 'cycle' : 'nature';
    if (t === 'path') return k === PATH ? 'cycle' : 'path';
    if (t === 'dock') return k === DOCK ? 'cycle' : land[i] ? 'nodock' : 'dock';
    return 'none';
  }
  const DRAGS = { land: 1, raise: 1, special: 1, house: 1, stack: 1, nature: 1, path: 1, dock: 1, dig: 1, digland: 1 };

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
        if (hgt[i] === MAXH) toast('SO TALL!');
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
        const key = kind[i] === NATURE ? 'nature' : kind[i] === PATH ? 'path' : kind[i] === SPECIAL ? 'special' : 'dock';
        const n = kind[i] === NATURE ? NATURE_N : kind[i] === PATH ? PATH_N : kind[i] === SPECIAL ? SPECIAL_N : DOCK_N;
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
      case 'top': bump(i, 0.1); softSfx(); toast('THE TOP OF THE HILL!'); return;
      case 'nodock': softSfx(); toast('DOCKS GO ON THE WATER'); return;
      case 'nudge': bump(i, 0.1); softSfx(); return;
      default: return;
    }
    touch(i);
    recount();
  }
  function undo() {
    const g = undoStack.pop();
    if (!g) { softSfx(); return; }
    for (let n = g.length - 1; n >= 0; n--) {
      const s = g[n], i = s.i;
      land[i] = s.land; kind[i] = s.kind; hgt[i] = s.hgt; col[i] = s.col; vr[i] = s.vr;
      anim[i] = null;
      touch(i);
      burst(wx(cx(i)), levelY(land[i]) + 0.4, wx(cz(i)), K.white, 4);
    }
    digSfx();
    recount(true);
  }
  document.getElementById('undo').addEventListener('click', function () { unlockAudio(); undo(); });

  // NEW ISLAND (lives in the menu): asks for a second tap so it can't happen by accident
  const newBtn = document.getElementById('newIsland');
  let newArm = 0;
  newBtn.addEventListener('click', function () {
    if (performance.now() < newArm) {
      starter(); redrawAll(); undoStack.length = 0; recount(true); dirty = true;
      newBtn.textContent = 'NEW ISLAND'; newArm = 0;
      cam.tx = cam.tz = 0; cam.distT = 46;
      if (window.MickleMenu) MickleMenu.close();
      toast('A FRESH NEW ISLAND!');
    } else {
      newArm = performance.now() + 4000;
      newBtn.textContent = 'TAP AGAIN TO START OVER';
      setTimeout(function () { newBtn.textContent = 'NEW ISLAND'; }, 4000);
    }
  });

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
    if (k === HOUSE) return levelY(land[i]) + hgt[i] * FH + RH * 0.6;
    if (k === NATURE) return levelY(land[i]) + (vr[i] % NATURE_N >= 4 ? 0.2 : 0.9);
    if (k === SPECIAL) return levelY(land[i]) + 1.5;
    if (k === DOCK) return vr[i] % DOCK_N === 2 ? 2.6 : 0.42;
    return land[i] ? levelY(land[i]) : 0;
  }
  function pick(px, py) {
    const r = view.getBoundingClientRect();
    ndc.set((px - r.left) / r.width * 2 - 1, -((py - r.top) / r.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const o = raycaster.ray.origin, d = raycaster.ray.direction;
    if (d.y >= -0.01) return -1;
    const s0 = Math.max(0, (o.y - 9) / -d.y), s1 = o.y / -d.y;
    for (let s = s0; s <= s1 + 0.12; s += 0.1) {
      const x = Math.floor((o.x + d.x * s) / T + N / 2), z = Math.floor((o.z + d.z * s) / T + N / 2);
      const y = o.y + d.y * s;
      if (!inb(x, z)) { if (y <= 0) return -1; continue; }
      if (y <= topOf(z * N + x)) return z * N + x;
    }
    return -1;
  }

  // ---------- Camera ----------
  const lim = N * T / 2;
  function panBy(dx, dy) {
    const r = view.getBoundingClientRect();
    const wpp = 2 * cam.dist * Math.tan(15 * Math.PI / 180) / r.height;
    const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
    cam.tx += (-c * dx - s * dy / Math.sin(cam.el)) * wpp;
    cam.tz += (s * dx - c * dy / Math.sin(cam.el)) * wpp;
    cam.tx = Math.max(-lim, Math.min(lim, cam.tx));
    cam.tz = Math.max(-lim, Math.min(lim, cam.tz));
  }
  function zoomBy(f) { cam.distT = Math.max(20, Math.min(95, cam.distT * f)); }
  function turn(dir) { cam.yawT += dir * Math.PI / 4; softSfx(); }
  document.getElementById('rotL').addEventListener('click', function () { unlockAudio(); turn(-1); });
  document.getElementById('rotR').addEventListener('click', function () { unlockAudio(); turn(1); });
  function placeCamera() {
    const ce = Math.cos(cam.el);
    camera.position.set(cam.tx + Math.sin(cam.yaw) * ce * cam.dist, Math.sin(cam.el) * cam.dist, cam.tz + Math.cos(cam.yaw) * ce * cam.dist);
    camera.lookAt(cam.tx, 0.5, cam.tz);
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
      if (g.d > 10 && gesture.d > 10) { cam.distT = Math.max(20, Math.min(95, cam.distT * gesture.d / g.d)); cam.dist = cam.distT; }
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
  view.addEventListener('wheel', function (e) { e.preventDefault(); zoomBy(Math.exp(e.deltaY * 0.0012)); }, { passive: false });

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
    if (!started) { if (k === ' ' || k === 'enter') { start(); e.preventDefault(); } return; }
    unlockAudio();
    let used = true;
    if (k === 'arrowleft' || k === 'a') moveCursor(-1, 0);
    else if (k === 'arrowright' || k === 'd') moveCursor(1, 0);
    else if (k === 'arrowup' || k === 'w') moveCursor(0, -1);
    else if (k === 'arrowdown' || k === 's') moveCursor(0, 1);
    else if (k === ' ' || k === 'enter') { if (!e.repeat) keyDownAct(); }
    else if (k === 'x' || k === 'delete' || k === 'backspace') { if (!e.repeat) keyDownAct('dig'); }
    else if (k >= '1' && k <= '7') setTool(TOOLS[+k - 1]);
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
    if (k === ' ' || k === 'enter' || k === 'x' || k === 'delete' || k === 'backspace') keyUpAct();
  });
  let padHold = 0, padLast = '';
  function pollPad(dt) {
    if (!window.Pad360) return;
    Pad360.poll();
    if (!Pad360.connected() || (window.MickleMenu && MickleMenu.isOpen())) return;
    const P = Pad360, Bt = Pad360.BTN;
    if (!started) { if (P.pressed(Bt.A) || P.pressed(Bt.START)) start(); return; }
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
  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width) return;
    renderer.setSize(view.clientWidth, view.clientHeight, false);
    camera.aspect = view.clientWidth / view.clientHeight;
    camera.updateProjectionMatrix();
    ui.style.fontSize = Math.max(7, r.width / 50) + 'px';
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  let last = performance.now(), smokeT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    pollPad(dt);
    tickMusic();

    // camera easing
    cam.yaw += (cam.yawT - cam.yaw) * Math.min(1, dt * 9);
    cam.dist += (cam.distT - cam.dist) * Math.min(1, dt * 9);
    placeCamera();

    // day / night
    if (nightK !== night) { nightK += Math.sign(night - nightK) * Math.min(Math.abs(night - nightK), dt * 1.6); applyNight(); }

    // water
    const wp = waterGeo.attributes.position;
    for (let n = 0; n < wp.count; n++) {
      wp.setY(n, Math.sin(wp.getX(n) * 0.33 + clock * 1.1) * 0.05 + Math.sin(wp.getZ(n) * 0.27 + clock * 0.8) * 0.05 - 0.02);
    }
    wp.needsUpdate = true;
    waterTex.offset.set(clock * 0.004, clock * 0.0025);

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
        terrDirty = true;
      }
    }
    if (terrDirty) { terrDirty = false; rebuildTerrain(); }

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

    // boats
    for (let n = 0; n < boats.length; n++) {
      const b = boats[n];
      b.a += b.sp * dt;
      b.m.position.set(Math.cos(b.a) * b.r, -0.06 + Math.sin(clock * 1.3 + n) * 0.05, Math.sin(b.a) * b.r);
      b.m.rotation.set(Math.sin(clock * 1.1 + n) * 0.06, -b.a - (b.sp > 0 ? Math.PI / 2 : -Math.PI / 2), 0);
    }

    // cursor
    if (cur >= 0 && started) {
      cursorMesh.visible = true;
      const s = 1 + Math.sin(clock * 6) * 0.04;
      cursorMesh.scale.set(s, s, s);
      cursorMesh.position.set(wx(cx(cur)), (land[cur] ? levelY(land[cur]) : kind[cur] === DOCK ? 0.42 : 0.05) + 0.08, wx(cz(cur)));
      cursorMesh.material.color.set(opFor(cur, tool) === 'none' || opFor(cur, tool) === 'nodock' ? 0xff8a8a : 0xffffff);
    } else cursorMesh.visible = false;

    // save a moment after the last change
    if (dirty) { dirty = false; saveT = 0.5; }
    if (saveT > 0) { saveT -= dt; if (saveT <= 0) save(); }

    renderer.render(scene, camera);
    updateBubbles(dt);
  }

  // ---------- Go ----------
  if (!load()) starter();
  applyLook();
  recount(true);
  setTool('house');
  showColour();
  showNight();
  applyNight();
  resize();
  placeCamera();
  requestAnimationFrame(loop);
})();
