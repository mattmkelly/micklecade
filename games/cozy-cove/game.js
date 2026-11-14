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
  const RH = 0.9;          // roof height
  const INSET = 0.2;       // house walls sit this far inside the cell edge
  const B = HALF - INSET;
  const MAXH = 6;
  const NONE = 0, HOUSE = 1, NATURE = 2, PATH = 3, DOCK = 4;
  const DX = [1, 0, -1, 0], DZ = [0, 1, 0, -1];   // E, S, W, N
  const NATURE_N = 6, PATH_N = 3, DOCK_N = 3;
  const SAVE_KEY = 'cozyCove.save';

  const land = new Uint8Array(N * N);
  const kind = new Uint8Array(N * N);
  const hgt = new Uint8Array(N * N);
  const col = new Uint8Array(N * N);
  const vr = new Uint8Array(N * N);
  const objs = new Array(N * N).fill(null);
  const anim = new Array(N * N).fill(null);
  const landAnim = new Array(N * N).fill(null);
  const chimneys = new Map();

  const cx = (i) => i % N, cz = (i) => (i / N) | 0;
  const inb = (x, z) => x >= 0 && z >= 0 && x < N && z < N;
  const wx = (x) => (x - N / 2 + 0.5) * T;
  const rnd = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const houseAt = (x, z) => (inb(x, z) && kind[z * N + x] === HOUSE ? hgt[z * N + x] : 0);

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

  const townMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const GLOW_DAY = C(0x4f76a6), GLOW_NIGHT = C(0xffd98a);
  const glowMat = new THREE.MeshLambertMaterial({ color: GLOW_DAY.clone(), emissive: 0xffb040, emissiveIntensity: 0 });

  // Water: a big low-poly sheet whose points bob up and down.
  const WATER_DAY = C(0x39bfd6), WATER_NIGHT = C(0x2a62a0);
  const waterGeo = new THREE.PlaneGeometry(320, 320, 64, 64);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshLambertMaterial({ color: WATER_DAY.clone(), flatShading: true });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.receiveShadow = true;
  scene.add(water);

  // Land: two instanced boxes per cell -- the grass block and a wider, lower sand skirt (the beach).
  const grassGeo = new THREE.BoxGeometry(T, 1, T); grassGeo.translate(0, -0.5, 0);
  const sandGeo = new THREE.BoxGeometry(T + 0.7, 0.6, T + 0.7); sandGeo.translate(0, -0.3, 0);
  const grassMesh = new THREE.InstancedMesh(grassGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }), N * N);
  const sandMesh = new THREE.InstancedMesh(sandGeo, new THREE.MeshLambertMaterial({ color: 0xf2dc9b }), N * N);
  grassMesh.receiveShadow = true; sandMesh.receiveShadow = true;
  grassMesh.frustumCulled = false; sandMesh.frustumCulled = false;
  scene.add(grassMesh, sandMesh);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3();
  const tmpC = new THREE.Color();
  for (let i = 0; i < N * N; i++) {
    const g = 0.92 + rnd(i) * 0.16;
    grassMesh.setColorAt(i, tmpC.setRGB(0.36 * g, 0.74 * g, 0.3 * g));
  }
  function setLandInstance(i, s) {
    tmpS.set(s, s, s);
    tmpP.set(wx(cx(i)), LANDH - (1 - s) * 0.6, wx(cz(i)));
    grassMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    tmpP.y = 0.14 - (1 - s) * 0.6;
    sandMesh.setMatrixAt(i, tmpM.compose(tmpP, tmpQ, tmpS));
    grassMesh.instanceMatrix.needsUpdate = true;
    sandMesh.instanceMatrix.needsUpdate = true;
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
  Builder.prototype.build = function () {
    const g = new THREE.BufferGeometry();
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
    const x = cx(i), z = cz(i), h = hgt[i];
    const wc = wallC[col[i] % 6], rc = roofC[col[i] % 6];
    const hh = [], dg = [];
    for (let d = 0; d < 4; d++) {
      const e = (d + 1) % 4;
      hh[d] = houseAt(x + DX[d], z + DZ[d]);
      dg[d] = houseAt(x + DX[d] + DX[e], z + DZ[d] + DZ[e]);   // the corner between d and e
    }
    const seed = vr[i];
    let doorDir = -1;
    for (let n = 0; n < 4; n++) { const d = (seed + n) % 4; if (hh[d] === 0) { doorDir = d; break; } }

    for (let k = 0; k < h; k++) {
      const y0 = k * FH, y1 = y0 + FH;
      const kc = k % 2 ? wc.clone().multiplyScalar(0.94) : wc;
      const c = [], f = [];
      for (let d = 0; d < 4; d++) c[d] = hh[d] > k;
      for (let d = 0; d < 4; d++) f[d] = c[d] && c[(d + 1) % 4] && dg[d] > k;
      for (let d = 0; d < 4; d++) {
        const e = (d + 1) % 4, p = (d + 3) % 4;
        if (!c[d]) {
          b.wall(d, B, -B, B, y0, y1, kc);
          if (k === 0 && d === doorDir) {
            b.wall(d, B + 0.02, -0.2, 0.2, y0, y0 + 0.7, K.door);
          } else if ((seed + k + d) % 3 === 0) {
            g.wall(d, B + 0.02, -0.5, -0.22, y0 + 0.38, y0 + 0.84, K.white);
            g.wall(d, B + 0.02, 0.22, 0.5, y0 + 0.38, y0 + 0.84, K.white);
          } else {
            g.wall(d, B + 0.02, -0.2, 0.2, y0 + 0.38, y0 + 0.84, K.white);
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
      chimneys.set(i, [wx(x) + 0.4, LANDH + yb + RH + 0.3, wx(z) + 0.4]);
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
      const k = kind[nz * N + nx];
      if (k === PATH || k === DOCK) b.dirBox(d, 0.5, HALF, -0.42, 0.42, 0, 0.05, K.stone2);
      else if (k === HOUSE) b.dirBox(d, 0.5, HALF + INSET, -0.3, 0.3, 0, 0.05, K.stone2);
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
      if (dockLink(x + DX[d], z + DZ[d])) b.dirBox(d, 0.72, HALF, -0.72, 0.72, 0.3, 0.42, K.wood);
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

  // ---------- Cell visuals ----------
  function refresh(i) {
    const old = objs[i];
    if (old) {
      scene.remove(old);
      if (old.userData.own) old.geometry.dispose();
      if (old.children[0]) old.children[0].geometry.dispose();
      objs[i] = null;
    }
    chimneys.delete(i);
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
      else buildDock(i, b, g);
      mesh = new THREE.Mesh(b.build(), townMat);
      mesh.userData.own = true;
      if (!g.empty()) mesh.add(new THREE.Mesh(g.build(), glowMat));
    }
    mesh.castShadow = true; mesh.receiveShadow = true;
    mesh.position.set(wx(cx(i)), k === DOCK ? 0 : LANDH, wx(cz(i)));
    scene.add(mesh);
    objs[i] = mesh;
    poseCell(i);
  }
  function poseCell(i) {
    const o = objs[i];
    if (!o) return;
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
    if (!landAnim[i]) setLandInstance(i, land[i] ? 1 : 0);
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

  // ---------- Sound (all made with WebAudio) ----------
  let ac = null;
  function unlockAudio() {
    if (!ac) { try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; } }
    if (ac && ac.state === 'suspended') ac.resume();
  }
  function tone(f, dur, type, vol, when, slide) {
    if (!ac) return;
    const t = ac.currentTime + (when || 0);
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(ac.destination);
    o.start(t); o.stop(t + dur + 0.05);
  }
  const SCALE = [0, 2, 4, 7, 9];
  const noteF = (n) => 261.63 * Math.pow(2, (SCALE[n % 5] + 12 * Math.floor(n / 5)) / 12);
  function pluck(n, when) { const f = noteF(n); tone(f, 0.4, 'triangle', 0.2, when); tone(f * 2, 0.22, 'sine', 0.08, when); }
  let combo = 0, lastPlace = 0;
  function placeNote(extra) {
    const now = performance.now();
    combo = now - lastPlace < 1500 ? Math.min(combo + 1, 9) : 0;
    lastPlace = now;
    pluck(combo + (extra || 0));
  }
  function splashSfx() {
    tone(220, 0.22, 'sine', 0.22, 0, 90);
    if (!ac) return;
    const len = Math.floor(ac.sampleRate * 0.25), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let n = 0; n < len; n++) d[n] = (Math.random() * 2 - 1) * Math.pow(1 - n / len, 2);
    const src = ac.createBufferSource(), flt = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = buf; flt.type = 'bandpass'; flt.frequency.value = 1400; g.gain.value = 0.12;
    src.connect(flt); flt.connect(g); g.connect(ac.destination); src.start();
  }
  const digSfx = () => { tone(420, 0.12, 'triangle', 0.16, 0, 260); tone(260, 0.16, 'triangle', 0.14, 0.07, 170); };
  const softSfx = () => tone(200, 0.12, 'sine', 0.12, 0, 170);
  const blipSfx = () => { tone(660, 0.1, 'triangle', 0.12); tone(880, 0.14, 'triangle', 0.12, 0.07); };
  const fanfare = () => { for (let n = 0; n < 6; n++) pluck(n + 5, n * 0.09); };

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
    homes = 0;
    for (let i = 0; i < N * N; i++) if (kind[i] === HOUSE) homes++;
    statEl.textContent = 'HOMES ' + homes;
    let hit = false;
    while (mile < MILES.length && homes >= MILES[mile][0]) { mile++; hit = true; }
    if (hit && !quiet) {
      toast(MILES[mile - 1][1], true);
      // the arcade's HIGH SCORES sheet lists every game, so the biggest towns get a board
      if (window.MickleScores) { try { MickleScores.record('cozy-cove', homes); } catch (e) { /* no board, no problem */ } }
      fanfare();
      for (let i = 0; i < N * N; i++) {
        if (kind[i] === HOUSE) burst(wx(cx(i)), LANDH + hgt[i] * FH + RH, wx(cz(i)), roofC[col[i] % 6], 5, 3);
      }
    }
  }

  // ---------- Save ----------
  let dirty = false, saveT = 0, night = 0, nightK = 0;
  function save() {
    const cells = [];
    for (let i = 0; i < N * N; i++) if (land[i] || kind[i]) cells.push([i, land[i], kind[i], hgt[i], col[i], vr[i]]);
    try { localStorage.setItem(SAVE_KEY, JSON.stringify({ v: 1, night: night, mile: mile, cells: cells })); } catch (e) { /* storage can be off */ }
  }
  function clearAll() {
    for (let i = 0; i < N * N; i++) {
      land[i] = kind[i] = hgt[i] = col[i] = vr[i] = 0;
      anim[i] = landAnim[i] = null;
    }
  }
  function redrawAll() {
    for (let i = 0; i < N * N; i++) { refresh(i); setLandInstance(i, land[i] ? 1 : 0); }
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
    mile = 1;
  }
  function load() {
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!s || s.v !== 1 || !s.cells.length) return false;
      clearAll();
      s.cells.forEach(function (c) {
        const i = c[0];
        if (i >= 0 && i < N * N) { land[i] = c[1]; kind[i] = c[2]; hgt[i] = c[3]; col[i] = c[4]; vr[i] = c[5]; }
      });
      night = s.night ? 1 : 0; nightK = night;
      mile = s.mile || 0;
      return true;
    } catch (e) { return false; }
  }

  // ---------- Tools ----------
  const TOOLS = ['land', 'house', 'nature', 'path', 'dock', 'dig'];
  let tool = 'house';
  let colSel = -1;                 // -1 = a surprise colour for every new building
  let lastCol = 0;
  const brush = { nature: 0, path: 0, dock: 0 };
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
    if (t === 'land') return land[i] ? 'nudge' : 'land';
    if (t === 'house') return k === HOUSE ? (hgt[i] < MAXH ? 'stack' : 'max') : 'house';
    if (t === 'dig') return k !== NONE ? 'dig' : land[i] ? 'digland' : 'none';
    if (k === HOUSE) return 'nudge';
    if (t === 'nature') return k === NATURE ? 'cycle' : 'nature';
    if (t === 'path') return k === PATH ? 'cycle' : 'path';
    if (t === 'dock') return k === DOCK ? 'cycle' : land[i] ? 'nodock' : 'dock';
    return 'none';
  }
  const DRAGS = { land: 1, house: 1, stack: 1, nature: 1, path: 1, dock: 1, dig: 1, digland: 1 };

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
    landAnim[i] = { t: 0, dur: 0.4 };
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
      case 'house':
        snap(i);
        delay = growLand(i);
        kind[i] = HOUSE; hgt[i] = 1; col[i] = stroke.col; vr[i] = Math.floor(Math.random() * 240);
        pop(i, delay); bumpNeighbours(i, HOUSE);
        placeNote(0);
        burst(x, LANDH + 0.3, z, wallC[col[i]], 8);
        break;
      case 'stack':
        snap(i);
        hgt[i]++;
        anim[i] = { t: 0, dur: 0.5, type: 1, amp: 0.2 };
        bumpNeighbours(i, HOUSE);
        placeNote(hgt[i] - 1);
        burst(x, LANDH + hgt[i] * FH, z, roofC[col[i] % 6], 8);
        if (hgt[i] === MAXH) toast('SO TALL!');
        break;
      case 'nature': case 'path': case 'dock': {
        snap(i);
        const nk = op === 'nature' ? NATURE : op === 'path' ? PATH : DOCK;
        delay = 0;
        if (nk === DOCK) splashSfx(); else delay = growLand(i);
        kind[i] = nk; hgt[i] = 0; vr[i] = brush[op];
        pop(i, delay); bumpNeighbours(i, nk);
        placeNote(0);
        burst(x, nk === DOCK ? 0.5 : LANDH + 0.3, z, nk === NATURE ? K.leaf2 : nk === PATH ? K.stone : K.wood, 6);
        break;
      }
      case 'cycle': {
        snap(i);
        const key = kind[i] === NATURE ? 'nature' : kind[i] === PATH ? 'path' : 'dock';
        const n = kind[i] === NATURE ? NATURE_N : kind[i] === PATH ? PATH_N : DOCK_N;
        vr[i] = (vr[i] + 1) % n;
        brush[key] = vr[i];
        pop(i, 0); blipSfx();
        burst(x, LANDH + 0.4, z, K.yellow, 5);
        break;
      }
      case 'dig':
        snap(i);
        burst(x, LANDH + Math.max(1, hgt[i]) * 0.8, z, kind[i] === HOUSE ? wallC[col[i] % 6] : K.sand, 10);
        if (kind[i] === HOUSE && hgt[i] > 1) { hgt[i]--; anim[i] = { t: 0, dur: 0.4, type: 1, amp: 0.14 }; }
        else { kind[i] = NONE; hgt[i] = 0; anim[i] = null; }
        digSfx();
        break;
      case 'digland':
        snap(i);
        land[i] = 0; landAnim[i] = null;
        burst(x, 0.3, z, K.water, 10); splashSfx();
        break;
      case 'max': bump(i, 0.12); softSfx(); toast('SO TALL!'); return;
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
      anim[i] = null; landAnim[i] = null;
      touch(i);
      burst(wx(cx(i)), LANDH + 0.4, wx(cz(i)), K.white, 4);
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
    if (k === HOUSE) return LANDH + hgt[i] * FH + RH * 0.6;
    if (k === NATURE) return LANDH + (vr[i] % NATURE_N >= 4 ? 0.2 : 0.9);
    if (k === DOCK) return vr[i] % DOCK_N === 2 ? 2.6 : 0.42;
    return land[i] ? LANDH : 0;
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
    else if (k >= '1' && k <= '6') setTool(TOOLS[+k - 1]);
    else if (k === 'tab') stepTool(e.shiftKey ? -1 : 1);
    else if (k === 'q') turn(-1);
    else if (k === 'e') turn(1);
    else if (k === 'c') nextColour();
    else if (k === 'n') toggleNight();
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

  let last = performance.now(), clock = 0, smokeT = 0;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now; clock += dt;
    pollPad(dt);

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

    // pops and bounces
    for (let i = 0; i < N * N; i++) {
      const a = anim[i];
      if (a) { a.t += dt; if (a.t >= a.dur) anim[i] = null; poseCell(i); }
      const l = landAnim[i];
      if (l) {
        l.t += dt;
        const e = Math.min(1, l.t / l.dur), u = e - 1;
        setLandInstance(i, land[i] ? 1 + 2.7 * u * u * u + 1.7 * u * u : 0);
        if (e >= 1) landAnim[i] = null;
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
      cursorMesh.position.set(wx(cx(cur)), (land[cur] ? LANDH : kind[cur] === DOCK ? 0.42 : 0.05) + 0.08, wx(cz(cur)));
      cursorMesh.material.color.set(opFor(cur, tool) === 'none' || opFor(cur, tool) === 'nodock' ? 0xff8a8a : 0xffffff);
    } else cursorMesh.visible = false;

    // save a moment after the last change
    if (dirty) { dirty = false; saveT = 0.5; }
    if (saveT > 0) { saveT -= dt; if (saveT <= 0) save(); }

    renderer.render(scene, camera);
  }

  // ---------- Go ----------
  if (!load()) starter();
  redrawAll();
  recount(true);
  setTool('house');
  showColour();
  showNight();
  applyNight();
  resize();
  placeCamera();
  requestAnimationFrame(loop);
})();
