// Coin Town -- the 3D town (three.js), in Cozy Cove's soft watercolour style.
// window.CoinTown3D.init(canvas, labelBox, opts) -> api
//   opts.onPick(id)   a building (or its sign) was tapped
//   opts.labels       { id: html } -- floating signs over each building (buttons with data-act="go")
// api: focus(id|null), showLabels(bool), setGifts(g, animate), setOwned([emoji]), setNight(bool), sparkle(id), resize()
// Buildings stand in an arc round the plaza (north side) so the camera, looking from the south,
// sees every front door; the park lawn is the open south side, where the town's gifts appear.
(function () {
  'use strict';
  const C = (h) => new THREE.Color(h);

  // ---------- watercolour wash texture (same idea as Cozy Cove's) ----------
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
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
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

  // ---------- the buildings ----------
  // a = angle round the plaza from north (degrees, east positive)
  const SITES = [
    { id: 'home', a: -102 }, { id: 'school', a: -68 }, { id: 'shop', a: -34 }, { id: 'bank', a: 0 },
    { id: 'toys', a: 34 }, { id: 'credit', a: 68 }, { id: 'market', a: 102 },
  ];
  const RING = 16.5;
  const PARK = { x: 6, z: 11.8 };

  function init(canvas, labelBox, opts) {
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const SKY_DAY = C(0xa6e3ff), SKY_NIGHT = C(0x2a3470);
    scene.background = SKY_DAY.clone();
    scene.fog = new THREE.Fog(0xa6e3ff, 80, 200);
    const camera = new THREE.PerspectiveCamera(30, 16 / 9, 1, 800);
    const hemi = new THREE.HemisphereLight(0xffffff, 0x9fc78a, 1.5);
    const sun = new THREE.DirectionalLight(0xfff1d6, 2.2);
    sun.position.set(22, 40, 18); sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    Object.assign(sun.shadow.camera, { left: -34, right: 34, top: 34, bottom: -34, near: 1, far: 140 });
    sun.shadow.bias = -0.0015;
    scene.add(hemi, sun, sun.target);

    const washTex = new THREE.CanvasTexture(washCanvas(256, 7));
    washTex.wrapS = washTex.wrapT = THREE.RepeatWrapping; washTex.colorSpace = THREE.SRGBColorSpace;
    const waterTex = new THREE.CanvasTexture(washCanvas(256, 23));
    waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping; waterTex.colorSpace = THREE.SRGBColorSpace; waterTex.repeat.set(14, 14);
    const paperEl = document.getElementById('paper');
    if (paperEl) paperEl.style.backgroundImage = 'url(' + washCanvas(256, 3, true).toDataURL() + ')';

    const mats = {};
    const M = (hex) => mats[hex] || (mats[hex] = new THREE.MeshLambertMaterial({ color: hex, map: washTex }));
    const glowMat = new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0xffb040, emissiveIntensity: 0, map: washTex });
    const goldMat = new THREE.MeshLambertMaterial({ color: 0xffcf3f, emissive: 0x6b4a00, emissiveIntensity: 0.35, map: washTex });

    function mesh(geo, mat, x, y, z, parent) {
      const m = new THREE.Mesh(geo, typeof mat === 'number' ? M(mat) : mat);
      m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true;
      (parent || scene).add(m); return m;
    }
    const box = (w, h, d, mat, x, y, z, p) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y + h / 2, z, p);
    const cyl = (rt, rb, h, mat, x, y, z, p, seg = 16) => mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat, x, y + h / 2, z, p);
    // gable roof: a triangular prism, ridge along x
    function gable(w, h, d, mat, x, y, z, p) {
      const s = new THREE.Shape(); s.moveTo(-d / 2, 0); s.lineTo(d / 2, 0); s.lineTo(0, h); s.lineTo(-d / 2, 0);
      const g = new THREE.ExtrudeGeometry(s, { depth: w, bevelEnabled: false });
      g.translate(0, 0, -w / 2); g.rotateY(Math.PI / 2);
      return mesh(g, mat, x, y, z, p);
    }
    function textTex(lines, bg, fg, w = 256, h = 96) {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const g = cv.getContext('2d');
      g.fillStyle = bg; g.beginPath(); g.roundRect ? g.roundRect(4, 4, w - 8, h - 8, 16) : g.rect(4, 4, w - 8, h - 8); g.fill();
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 6; g.stroke();
      g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
      const ls = [].concat(lines);
      ls.forEach((t, i) => { g.font = `900 ${i ? 26 : Math.min(54, 44 * 9 / Math.max(6, t.length))}px system-ui, Segoe UI, Arial`; g.fillText(t, w / 2, h / 2 + (i - (ls.length - 1) / 2) * (ls.length > 1 ? 34 : 0)); });
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    function sign(lines, bg, fg, w, h, x, y, z, p) {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: textTex(lines, bg, fg), transparent: true }));
      m.position.set(x, y, z); (p || scene).add(m); return m;
    }
    function emojiTex(e, size = 128) {
      const cv = document.createElement('canvas'); cv.width = cv.height = size;
      const g = cv.getContext('2d'); g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = `${size * 0.8}px "Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif`;
      g.fillText(e, size / 2, size * 0.56);
      const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
    }
    // windows: sky-blue glass in a white frame, with a cross bar, a sill and a shine; warm yellow light at night
    const winMat = new THREE.MeshLambertMaterial({ color: 0x8fd0ee, emissive: 0xffb84a, emissiveIntensity: 0 });
    const shineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 });
    const windowAt = (x, y, z, p, w = 1.1, h = 1.2) => {
      box(w + 0.28, h + 0.28, 0.12, 0xffffff, x, y - 0.14, z, p);
      const glass = box(w, h, 0.16, winMat, x, y, z + 0.02, p); glass.castShadow = false;
      box(0.08, h, 0.2, 0xffffff, x, y, z + 0.04, p);
      box(w, 0.08, 0.2, 0xffffff, x, y + h / 2 - 0.04, z + 0.04, p);
      box(w + 0.5, 0.1, 0.3, 0xffffff, x, y - 0.2, z + 0.1, p);
      const sh = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.16, h * 0.42), shineMat);
      sh.position.set(x - w * 0.26, y + h * 0.74, z + 0.115); sh.rotation.z = -0.5; p.add(sh);
      return glass;
    };

    // ---------- the island ----------
    const water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshLambertMaterial({ color: 0x6fd3f0, map: waterTex, transparent: true, opacity: 0.9 }));
    water.rotation.x = -Math.PI / 2; water.position.y = -0.6; scene.add(water);
    const seabed = new THREE.Mesh(new THREE.CircleGeometry(60, 48), M(0x2f9fbe)); seabed.rotation.x = -Math.PI / 2; seabed.position.y = -2.5; scene.add(seabed);
    const sand = mesh(new THREE.CylinderGeometry(36, 38, 1.2, 64), 0xf2dc9b, 0, -1.0, 0); sand.castShadow = false;
    const grass = mesh(new THREE.CylinderGeometry(33, 34.5, 1.2, 64), 0x8fd16a, 0, -0.65, 0); grass.castShadow = false;
    const plaza = mesh(new THREE.CylinderGeometry(9.5, 9.5, 0.2, 48), 0xe9dcc4, 0, -0.05, 0); plaza.castShadow = false;
    // cobble ring + paths to each door
    const ring = mesh(new THREE.TorusGeometry(9.5, 0.25, 6, 48), 0xcbb999, 0, 0.08, 0); ring.rotation.x = Math.PI / 2; ring.castShadow = false;
    for (const s of SITES) {
      const a = s.a * Math.PI / 180, len = RING - 12.2;
      const p = box(2.6, 0.12, len, 0xe9dcc4, Math.sin(a) * (9.4 + len / 2), -0.03, -Math.cos(a) * (9.4 + len / 2));
      p.rotation.y = -a; p.castShadow = false;
    }
    // path down to the park and the dock
    { const p = box(2.6, 0.12, 22, 0xe9dcc4, 0, -0.03, 20); p.castShadow = false; }
    { const dock = box(3, 0.3, 7, 0xb0814f, 0, -0.2, 36.5); for (let i = 0; i < 4; i++) cyl(0.18, 0.18, 1.6, 0x8a5f37, i % 2 ? 1.3 : -1.3, -1.4, 34 + (i >> 1) * 5); void dock; }

    // fountain with the big gold coin
    cyl(3.2, 3.4, 0.8, 0xd9cdb6, 0, 0, 0, null, 32);
    const fw = cyl(2.8, 2.8, 0.1, new THREE.MeshLambertMaterial({ color: 0x8fdcf2, map: waterTex }), 0, 0.72, 0, null, 32); fw.castShadow = false;
    cyl(0.5, 0.7, 2.2, 0xd9cdb6, 0, 0.8, 0, null, 12);
    const coinStatue = new THREE.Group(); coinStatue.position.set(0, 4.6, 0); scene.add(coinStatue);
    { const c = mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.35, 32), goldMat, 0, 0, 0, coinStatue); c.rotation.x = Math.PI / 2;
      const r = mesh(new THREE.TorusGeometry(1.5, 0.14, 8, 32), goldMat, 0, 0, 0, coinStatue); void r;
      const face = new THREE.Mesh(new THREE.CircleGeometry(1.15, 32), new THREE.MeshLambertMaterial({ map: textTex('¢', '#ffd75a', '#a16207', 128, 128), transparent: true }));
      face.position.z = 0.19; coinStatue.add(face);
      const back = face.clone(); back.rotation.y = Math.PI; back.position.z = -0.19; coinStatue.add(back); }
    // water spouts (little droplets)
    const drops = [];
    for (let i = 0; i < 18; i++) { const d = mesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshLambertMaterial({ color: 0xcff4ff }), 0, 3, 0); d.castShadow = false; drops.push({ m: d, t: i / 18, a: (i / 18) * Math.PI * 2 }); }

    // street lamps round the plaza
    const lamps = [];
    for (let i = 0; i < 8; i++) {
      const a = (i + 0.5) / 8 * Math.PI * 2, x = Math.sin(a) * 10.4, z = Math.cos(a) * 10.4;
      cyl(0.12, 0.16, 3.2, 0x3f4a5a, x, 0, z, null, 8);
      lamps.push(mesh(new THREE.SphereGeometry(0.42, 12, 8), glowMat, x, 3.4, z));
    }

    // ---------- trees ----------
    function tree(x, z, s = 1, kind = 0, parent) {
      const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s); (parent || scene).add(g);
      cyl(0.22, 0.3, 1.6, 0x8a5f37, 0, 0, 0, g, 8);
      if (kind === 1) { mesh(new THREE.ConeGeometry(1.4, 2.6, 8), 0x3f9b5a, 0, 2.6, 0, g); mesh(new THREE.ConeGeometry(1.1, 2.1, 8), 0x4fb36a, 0, 3.7, 0, g); }
      else { mesh(new THREE.IcosahedronGeometry(1.5, 1), kind === 2 ? 0xff9ec4 : 0x5cbf5a, 0, 2.7, 0, g); mesh(new THREE.IcosahedronGeometry(1.0, 1), kind === 2 ? 0xffc4dc : 0x79d36b, 0.6, 3.4, 0.3, g); }
      return g;
    }
    const TREE_SPOTS = [[-27, -6], [-24, -16], [-17, -25], [-6, -29], [6, -29.5], [17, -25], [24, -16], [27, -6], [-28, 6], [28, 6], [-22, 22], [22, 20], [14, 27], [-13, 27]];
    TREE_SPOTS.forEach(([x, z], i) => tree(x, z, 0.9 + (i % 3) * 0.15, i % 3 === 1 ? 1 : 0));
    // a few bushes
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + 0.2, r = 30 + (i % 2); mesh(new THREE.IcosahedronGeometry(0.9, 0), 0x6cc45d, Math.sin(a) * r, 0.2, Math.cos(a) * r); }

    // ---------- build each building ----------
    const groups = {}, anchors = {}, doors = {};
    function site(id) {
      const s = SITES.find((q) => q.id === id), a = s.a * Math.PI / 180;
      const g = new THREE.Group();
      g.position.set(Math.sin(a) * RING, 0, -Math.cos(a) * RING);
      g.rotation.y = -a;                      // local +z faces the plaza
      scene.add(g); groups[id] = g;
      doors[id] = new THREE.Vector3(Math.sin(a) * (RING - 4), 0, -Math.cos(a) * (RING - 4));
      return g;
    }
    function tag(g, id) { g.traverse((o) => { if (o.isMesh) o.userData.b = id; }); }

    // HOME: a cosy cottage with a chimney and flower boxes
    let homeWall;
    { const g = site('home');
      homeWall = box(6, 3.6, 5, 0xfff1d0, 0, 0, 0, g); gable(6.6, 2.4, 5.8, 0xe0503c, 0, 3.6, 0, g);
      box(0.8, 1.8, 0.8, 0xb5694a, 1.6, 4.2, -0.8, g);
      box(1.2, 2.1, 0.15, 0x8a5f37, 0, 0, 2.53, g); windowAt(-1.8, 1.9, 2.5, g); windowAt(1.8, 1.9, 2.5, g);
      for (const x of [-1.8, 1.8]) { box(1.4, 0.35, 0.4, 0xb0814f, x, 1.05, 2.7, g); for (let k = 0; k < 4; k++) mesh(new THREE.SphereGeometry(0.15, 6, 4), [0xff6b8a, 0xffd84f, 0xa77bff, 0xff9ec4][k], x - 0.5 + k * 0.33, 1.5, 2.75, g); }
      for (let k = -3; k <= 3; k++) if (Math.abs(k) > 0) box(0.15, 0.9, 0.15, 0xffffff, k * 1.05, 0, 4.6, g);
      box(6.4, 0.12, 0.1, 0xffffff, 0, 0.65, 4.6, g);
      anchors.home = new THREE.Vector3(0, 4.8, 0); tag(g, 'home'); }

    // SCHOOL: brick red, white trim, bell tower and a clock
    { const g = site('school');
      box(8, 4.2, 5, 0xd8735a, 0, 0, 0, g); gable(8.6, 2, 5.8, 0x4a6fa5, 0, 4.2, 0, g);
      box(8.2, 0.3, 5.2, 0xffffff, 0, 4.0, 0, g);
      box(1.8, 2.4, 1.8, 0xfff1d0, 0, 5.2, 0.2, g); mesh(new THREE.ConeGeometry(1.6, 1.8, 4), 0x4a6fa5, 0, 8.5, 0.2, g).rotation.y = Math.PI / 4;
      mesh(new THREE.SphereGeometry(0.45, 12, 8), goldMat, 0, 6.3, 0.2, g);
      const clock = new THREE.Mesh(new THREE.CircleGeometry(0.75, 24), new THREE.MeshLambertMaterial({ map: textTex('🕒', '#ffffff', '#1e293b', 128, 128) })); clock.position.set(0, 3.2, 2.52); g.add(clock);
      box(1.6, 2.3, 0.15, 0x6b4a2b, 0, 0, 2.53, g);
      for (const x of [-3, -1.8, 1.8, 3]) windowAt(x, 2.2, 2.5, g, 0.9, 1.3);
      anchors.school = new THREE.Vector3(0, 7.2, 0); tag(g, 'school'); }

    // SHOP: mint green with a striped awning, crates of fruit and the till in the window
    { const g = site('shop');
      box(6.5, 3.8, 5, 0x9fe3c2, 0, 0, 0, g); box(6.9, 0.5, 5.4, 0xfff8e8, 0, 3.8, 0, g);
      const cv = document.createElement('canvas'); cv.width = 128; cv.height = 8; const cg = cv.getContext('2d');
      for (let i = 0; i < 8; i++) { cg.fillStyle = i % 2 ? '#fff8e8' : '#e0503c'; cg.fillRect(i * 16, 0, 16, 8); }
      const st = new THREE.CanvasTexture(cv); st.colorSpace = THREE.SRGBColorSpace;
      const aw = new THREE.Mesh(new THREE.PlaneGeometry(6.8, 1.9), new THREE.MeshLambertMaterial({ map: st, side: THREE.DoubleSide }));
      aw.position.set(0, 3.1, 3.2); aw.rotation.x = -0.75; aw.castShadow = true; g.add(aw);
      box(1.3, 2.2, 0.15, 0x8a5f37, -2, 0, 2.53, g); windowAt(1.2, 1.7, 2.5, g, 2.6, 1.6);
      for (let k = 0; k < 3; k++) { box(0.9, 0.6, 0.7, 0xb0814f, -0.4 + k * 1.05, 0, 3.4, g); for (let j = 0; j < 3; j++) mesh(new THREE.SphereGeometry(0.2, 8, 6), [0xe0503c, 0xffd84f, 0x7ad35b][k], -0.65 + k * 1.05 + j * 0.25, 0.75, 3.4, g); }
      sign('SHOP', '#fff8e8', '#e0503c', 3, 0.9, 0, 4.9, 2.72, g);
      anchors.shop = new THREE.Vector3(0, 4.6, 0); tag(g, 'shop'); }

    // BANK: columns, steps, pediment and a gold coin
    { const g = site('bank');
      box(8, 4.6, 5, 0xf3ead8, 0, 0.6, -0.5, g);
      box(9, 0.3, 6.6, 0xe6dcc6, 0, 0, 0.3, g); box(9, 0.3, 6.0, 0xe6dcc6, 0, 0.3, 0, g);
      for (const x of [-3.2, -1.1, 1.1, 3.2]) cyl(0.35, 0.4, 4.4, 0xffffff, x, 0.6, 2.6, g, 12);
      box(8.6, 0.5, 6, 0xffffff, 0, 5.0, 0, g);
      gable(8.8, 1.6, 6.2, 0xf3ead8, 0, 5.5, 0, g);
      const coin = new THREE.Mesh(new THREE.CircleGeometry(0.6, 24), goldMat); coin.position.set(0, 6.0, 3.12); g.add(coin);
      box(1.6, 2.6, 0.15, 0x6b4a2b, 0, 0.6, 2.03, g);
      sign('BANK', '#ffffff', '#1e3a8a', 3.2, 0.7, 0, 5.25, 3.02, g);
      anchors.bank = new THREE.Vector3(0, 6.0, 0); tag(g, 'bank'); }

    // WONDER SHOP (was the Toy Store): pastel with a round turret and balloons
    { const g = site('toys');
      box(6.5, 3.8, 5, 0xbfdcff, 0, 0, 0, g); gable(7, 1.8, 5.8, 0xff9ec4, 0, 3.8, 0, g);
      cyl(1.3, 1.3, 5.4, 0xffc4dc, 3.3, 0, 1.6, g, 16); mesh(new THREE.ConeGeometry(1.6, 2.2, 16), 0xa77bff, 3.3, 6.5, 1.6, g);
      box(1.3, 2.2, 0.15, 0x8a5f37, -1.6, 0, 2.53, g); windowAt(0.8, 1.7, 2.5, g, 2, 1.6);
      sign('WONDER SHOP', '#fff8e8', '#a21caf', 3.2, 0.9, -0.6, 3.4, 2.56, g);
      const cols = [0xff6b8a, 0xffd84f, 0x6fd3f0, 0xa77bff, 0x7ad35b];
      cols.forEach((c, k) => { const b = mesh(new THREE.SphereGeometry(0.45, 12, 8), c, -3.4 + (k % 3) * 0.6, 5.3 + (k > 2 ? 0.6 : 0), 2.4 + (k % 2) * 0.3, g); b.scale.y = 1.2; });
      cyl(0.02, 0.02, 3, 0x334155, -2.8, 2.3, 2.5, g, 4);
      anchors.toys = new THREE.Vector3(0, 5.4, 0); tag(g, 'toys'); }

    // CREDIT CORNER (coming soon): a little kiosk with a ribbon
    { const g = site('credit');
      box(4.5, 3.2, 4, 0xd9c8ff, 0, 0, 0, g); mesh(new THREE.ConeGeometry(3.6, 1.8, 4), 0x7c5cc4, 0, 4.1, 0, g).rotation.y = Math.PI / 4;
      box(1.2, 2, 0.15, 0x6b4a2b, 0, 0, 2.03, g);
      sign('CREDIT', '#fef3c7', '#5b21b6', 2.8, 0.8, 0, 2.55, 2.06, g);
      anchors.credit = new THREE.Vector3(0, 3.8, 0); tag(g, 'credit'); }

    // MARKET STREET (coming soon): a tall building with a moving price board
    let tickerTex;
    { const g = site('market');
      box(5.5, 6.2, 4.5, 0xf6e7b0, 0, 0, 0, g); box(5.9, 0.4, 4.9, 0xffffff, 0, 6.2, 0, g);
      for (const y of [2.2, 3.9]) for (const x of [-1.6, 0, 1.6]) windowAt(x, y + 0.6, 2.25, g, 0.9, 1);
      const cv = document.createElement('canvas'); cv.width = 512; cv.height = 48; const cg = cv.getContext('2d');
      cg.fillStyle = '#1e293b'; cg.fillRect(0, 0, 512, 48); cg.font = '900 26px system-ui, Arial'; cg.textBaseline = 'middle';
      [['🍪 BAKE', '▲', '#4ade80'], ['🚀 ROCKT', '▼', '#f87171'], ['🧸 TOYCO', '▲', '#4ade80'], ['☂️ UMBR', '▲', '#4ade80']].forEach(([n, a, c], i) => { cg.fillStyle = '#fef3c7'; cg.fillText(n, 8 + i * 128, 24); cg.fillStyle = c; cg.fillText(a, 100 + i * 128, 24); });
      tickerTex = new THREE.CanvasTexture(cv); tickerTex.wrapS = THREE.RepeatWrapping; tickerTex.colorSpace = THREE.SRGBColorSpace; tickerTex.repeat.set(0.5, 1);
      const tk = new THREE.Mesh(new THREE.PlaneGeometry(5, 0.6), new THREE.MeshBasicMaterial({ map: tickerTex })); tk.position.set(0, 1.4 + 0.0, 2.28); g.add(tk);
      box(1.2, 1.1, 0.15, 0x6b4a2b, 0, 0, 2.28, g);
      sign('MARKET', '#fef3c7', '#166534', 3.2, 0.8, 0, 5.5, 2.28, g);
      anchors.market = new THREE.Vector3(0, 6.0, 0); tag(g, 'market'); }

    // PARK: the open lawn south of the plaza, with a sign and a bench; gifts appear here
    const parkG = new THREE.Group(); parkG.position.set(PARK.x, 0, PARK.z); scene.add(parkG); groups.park = parkG;
    { box(3, 0.3, 0.8, 0xb0814f, 0, 0.5, 0, parkG); box(3, 0.8, 0.15, 0xb0814f, 0, 0.8, -0.35, parkG);
      for (const x of [-1.2, 1.2]) box(0.15, 0.5, 0.6, 0x3f4a5a, x, 0, 0, parkG);
      cyl(0.08, 0.08, 1.8, 0x8a5f37, 2.6, 0, 0.6, parkG, 6); sign('PARK', '#d9f99d', '#166534', 1.6, 0.6, 2.6, 1.9, 0.66, parkG);
      anchors.park = new THREE.Vector3(0, 1.8, 0); tag(parkG, 'park'); doors.park = new THREE.Vector3(PARK.x, 0, PARK.z - 2); }

    // ---------- gifts the town gets when kids give ----------
    const giftG = new THREE.Group(); scene.add(giftG);
    const GIFT_TREES = [[-15.5, 13.2], [12, 7.4], [-6.8, 12.8], [18.5, 8.2], [8.2, 13.6], [-2.8, 13.4]];
    let giftState = '';
    const popIns = [];
    function popIn(o) { o.scale.setScalar(0.01); popIns.push({ o, t: 0, s: 1 }); }
    function setGifts(g, animate) {
      const key = JSON.stringify(g || {});
      if (key === giftState) return; const old = giftState ? JSON.parse(giftState) : {};
      giftState = key;
      while (giftG.children.length) giftG.remove(giftG.children[0]);
      dogBody = null; spinner = null; ducks.length = 0;
      g = g || {};
      for (let i = 0; i < Math.min(GIFT_TREES.length, g.trees || 0); i++) { const t = tree(GIFT_TREES[i][0], GIFT_TREES[i][1], 0.85, i % 2 ? 2 : 0, giftG); if (animate && i >= (old.trees || 0)) popIn(t); }
      const add = (k, fn) => { if (!g[k]) return; const o = new THREE.Group(); giftG.add(o); fn(o); if (animate && !old[k]) popIn(o); };
      add('flowers', (o) => { o.position.set(-4.6, 0, 11.4); for (let i = 0; i < 22; i++) { const a = i / 22 * Math.PI * 2, r = 0.6 + (i % 3) * 0.5; mesh(new THREE.SphereGeometry(0.22, 8, 6), [0xff6b8a, 0xffd84f, 0xa77bff, 0xff9ec4, 0xffffff][i % 5], Math.sin(a) * r, 0.25, Math.cos(a) * r, o); } mesh(new THREE.CylinderGeometry(1.8, 1.8, 0.15, 24), 0x7a5232, 0, 0, 0, o); });
      add('shelter', (o) => { o.position.set(10, 0, 11.2); o.rotation.y = -0.5; box(2.2, 1.4, 2, 0xe0503c, 0, 0, 0, o); gable(2.4, 1, 2.4, 0xfff1d0, 0, 1.4, 0, o); box(0.8, 0.9, 0.1, 0x3b2a1e, 0, 0, 1.01, o);
        const dog = new THREE.Group(); dog.position.set(0.4, 0, 2.2); o.add(dog); box(0.9, 0.5, 0.45, 0xd6a35c, 0, 0.35, 0, dog); mesh(new THREE.SphereGeometry(0.3, 10, 8), 0xd6a35c, 0.55, 0.95, 0, dog); dogBody = dog; });
      add('library', (o) => { o.position.set(2.6, 0, 11.6); cyl(0.1, 0.1, 1.2, 0x8a5f37, 0, 0, 0, o, 6); box(1.1, 0.9, 0.8, 0x4a6fa5, 0, 1.2, 0, o); gable(1.3, 0.5, 1.0, 0xe0503c, 0, 2.1, 0, o); box(0.8, 0.6, 0.05, 0xfff3c4, 0, 1.35, 0.41, o); });
      add('carousel', (o) => { o.position.set(-10.8, 0, 11.6); const spin = new THREE.Group(); o.add(spin); spinner = spin;
        cyl(2.6, 2.6, 0.35, 0xfff1d0, 0, 0, 0, spin, 24); mesh(new THREE.ConeGeometry(3, 1.4, 12), 0xff9ec4, 0, 3.6, 0, spin); cyl(0.2, 0.2, 3, 0xffd84f, 0, 0.3, 0, spin, 8);
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; cyl(0.06, 0.06, 2.6, 0xffd84f, Math.sin(a) * 2, 0.35, Math.cos(a) * 2, spin, 6); const h = box(0.5, 0.45, 0.9, [0xffffff, 0x6fd3f0, 0xa77bff][i % 3], Math.sin(a) * 2, 1.2, Math.cos(a) * 2, spin); h.rotation.y = a; } });
      add('pond', (o) => { o.position.set(14.6, 0, 10.6); const w = mesh(new THREE.CylinderGeometry(2.4, 2.4, 0.1, 24), new THREE.MeshLambertMaterial({ color: 0x6fd3f0, map: waterTex }), 0, 0.02, 0, o); w.castShadow = false; for (let i = 0; i < 3; i++) { const d = new THREE.Group(); d.position.set(Math.sin(i * 2) * 1.6, 0.15, Math.cos(i * 2) * 1.6); o.add(d); box(0.5, 0.3, 0.3, 0xfff8e8, 0, 0, 0, d); mesh(new THREE.SphereGeometry(0.17, 8, 6), 0xfff8e8, 0.25, 0.45, 0, d); ducks.push(d); } });
    }
    let dogBody = null, spinner = null; const ducks = [];

    // ---------- FIX UP MY HOME: upgrades built onto the house (local coords: +z = front door, -x = the park side) ----------
    const homeUpG = new THREE.Group(); groups.home.add(homeUpG);
    const bulbMats = [0xff6b8a, 0xffd84f, 0x6fd3f0, 0x7ad35b, 0xa77bff].map((c) => new THREE.MeshLambertMaterial({ color: c, emissive: c, emissiveIntensity: 0.15 }));
    let homeKey = '';
    const UP_BUILD = {
      mailbox(o) { o.position.set(2.6, 0, 5.3); cyl(0.07, 0.07, 1.1, 0x8a5f37, 0, 0, 0, o, 6); box(0.45, 0.4, 0.75, 0x4a6fa5, 0, 1.1, 0, o); box(0.05, 0.35, 0.1, 0xe0503c, 0.25, 1.35, -0.2, o); },
      bench(o) { o.position.set(-1.9, 0, 3.15); box(1.6, 0.12, 0.5, 0xb0814f, 0, 0.42, 0, o); box(1.6, 0.6, 0.1, 0xb0814f, 0, 0.55, -0.22, o); for (const x of [-0.7, 0.7]) box(0.1, 0.42, 0.45, 0x6b4a2b, x, 0, 0, o); },
      garden(o) { o.position.set(-4.1, 0, 1.2); box(1.4, 0.2, 3.2, 0x7a5232, 0, 0, 0, o);
        for (let i = 0; i < 4; i++) { const z = -1.2 + i * 0.8; cyl(0.04, 0.04, 1.3, 0x3f9b5a, -0.3, 0.2, z, o, 5); const f = mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 12), 0xffd84f, -0.3, 1.55, z + 0.05, o); f.rotation.x = Math.PI / 2.4; mesh(new THREE.SphereGeometry(0.12, 8, 6), 0x6b4a2b, -0.3, 1.58, z + 0.1, o); }
        for (let i = 0; i < 6; i++) mesh(new THREE.SphereGeometry(0.16, 8, 6), [0xff6b8a, 0xa77bff, 0xff9ec4][i % 3], 0.35, 0.45, -1.3 + i * 0.52, o); },
      lights(o) { for (let i = 0; i <= 12; i++) { const x = -3 + i * 0.5, sag = Math.sin((i % 4) / 4 * Math.PI) * 0.15; const b = mesh(new THREE.SphereGeometry(0.11, 8, 6), bulbMats[i % bulbMats.length], x, 3.48 - sag, 2.98, o); b.castShadow = false; } },
      swing(o) { o.position.set(-4.8, 0, 3.6); cyl(0.25, 0.32, 3.2, 0x8a5f37, 0, 0, 0, o, 8); mesh(new THREE.IcosahedronGeometry(1.7, 1), 0x5cbf5a, 0, 4.2, 0, o); mesh(new THREE.IcosahedronGeometry(1.1, 1), 0x79d36b, 0.7, 4.8, 0.3, o);
        const br = cyl(0.1, 0.1, 1.6, 0x8a5f37, 0.8, 3.0, 0, o, 6); br.rotation.z = Math.PI / 2; br.position.set(0.8, 3.0, 0);
        for (const z of [-0.3, 0.3]) cyl(0.02, 0.02, 2.0, 0xfff1d0, 1.3, 1.0, z, o, 4); box(0.4, 0.08, 0.8, 0xe0503c, 1.3, 0.95, 0, o); },
      solar(o) { const a = Math.atan2(2.4, 2.9);
        for (const x of [-1.55, 1.25]) { const p = mesh(new THREE.BoxGeometry(2.3, 0.06, 2.3), 0x1e3a8a, x, 4.85 + 0.77 * 0.08, 1.45 + 0.64 * 0.08, o); p.rotation.x = a;
          const fr = mesh(new THREE.BoxGeometry(2.4, 0.04, 0.08), 0xe2e8f0, x, 4.85 + 0.77 * 0.11, 1.45 + 0.64 * 0.11, o); fr.rotation.x = a; } },
      treehouse(o) { o.position.set(-5.0, 0, -2.2); cyl(0.35, 0.45, 4.2, 0x8a5f37, 0, 0, 0, o, 8); mesh(new THREE.IcosahedronGeometry(2.3, 1), 0x4fb36a, 0, 5.8, 0, o); mesh(new THREE.IcosahedronGeometry(1.4, 1), 0x79d36b, -0.9, 6.4, 0.6, o);
        box(2.6, 0.2, 2.6, 0xb0814f, 0, 2.9, 0, o); box(1.8, 1.3, 1.6, 0xd6a35c, 0, 3.1, 0, o); gable(2.0, 0.8, 1.9, 0xe0503c, 0, 4.4, 0, o); box(0.5, 0.7, 0.05, 0x6b4a2b, 0, 3.1, 0.81, o);
        for (const x of [-0.35, 0.35]) box(0.08, 3.0, 0.08, 0x8a5f37, x, 0, 1.5, o); for (let k = 0; k < 6; k++) box(0.7, 0.06, 0.08, 0x8a5f37, 0, 0.4 + k * 0.45, 1.5, o); },
    };
    function setHome(list, animateId) {
      list = list || [];
      homeWall.material = M(list.includes('paint') ? 0xffe08a : 0xfff1d0);
      const key = list.join(','); if (key === homeKey) return; homeKey = key;
      while (homeUpG.children.length) homeUpG.remove(homeUpG.children[0]);
      for (const id of list) {
        if (!UP_BUILD[id]) continue;
        const o = new THREE.Group(); homeUpG.add(o); UP_BUILD[id](o); tag(o, 'home');
        if (id === animateId) popIn(o);
      }
    }

    // ---------- things you bought sit in your yard ----------
    const ownedG = new THREE.Group(); scene.add(ownedG);
    let ownedKey = '';
    function setOwned(list) {
      const key = (list || []).join(',');
      if (key === ownedKey) return; ownedKey = key;
      while (ownedG.children.length) ownedG.remove(ownedG.children[0]);
      const hg = groups.home;
      (list || []).slice(0, 12).forEach((e, i) => {
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTex(e) }));
        const local = new THREE.Vector3(-3 + (i % 6) * 1.2, 0.75 + Math.floor(i / 6) * 0.1, 3.4 + Math.floor(i / 6) * 1.1 + (i % 2) * 0.2);
        sp.position.copy(hg.localToWorld(local)); sp.scale.setScalar(1.3); ownedG.add(sp);
      });
    }

    // ---------- clouds ----------
    const clouds = [];
    for (let i = 0; i < 6; i++) {
      const g = new THREE.Group(); g.position.set(-80 + i * 30, 26 + (i % 3) * 4, -40 + (i % 2) * 30); scene.add(g);
      for (let k = 0; k < 4; k++) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4 + (k % 2), 1), new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.92 })); m.position.set(k * 2.6 - 4, (k % 2) * 1.1, (k % 3) * 0.8); g.add(m); }
      clouds.push(g);
    }

    // ---------- townsfolk ----------
    const FOLK_COLORS = [0xe0503c, 0x4a6fa5, 0xffd84f, 0xa77bff, 0x5cc24a, 0xf29a3c, 0xff9ec4, 0x6fd3f0];
    const SKIN = [0xf5d0b0, 0xd9a47a, 0xa86f45, 0x7a4b2a, 0xffe0c4];
    const folk = [];
    const stops = () => Object.keys(doors);
    for (let i = 0; i < 9; i++) {
      const g = new THREE.Group(); scene.add(g);
      const body = mesh(new THREE.CapsuleGeometry(0.42, 0.7, 4, 10), FOLK_COLORS[i % FOLK_COLORS.length], 0, 0.85, 0, g);
      mesh(new THREE.SphereGeometry(0.36, 12, 10), SKIN[i % SKIN.length], 0, 1.85, 0, g);
      if (i % 3 === 0) mesh(new THREE.ConeGeometry(0.4, 0.5, 10), FOLK_COLORS[(i + 3) % 8], 0, 2.3, 0, g);
      void body;
      const p = { g, from: null, to: null, t: 0, wait: Math.random() * 3, speed: 2.2 + Math.random() * 0.8, path: [] };
      const start = doors[pickKey()].clone(); g.position.copy(start);
      folk.push(p);
    }
    function pickKey() { const k = stops(); return k[Math.floor(Math.random() * k.length)]; }
    function planWalk(p) {
      const dest = doors[pickKey()];
      const a = p.g.position.clone();
      // walk to the plaza edge, round it a little, then to the door -- keeps folk off the buildings
      const edge = (v) => { const d = new THREE.Vector3(v.x, 0, v.z); if (d.length() < 0.1) return d; return d.setLength(10.8); };
      p.path = [edge(a), edge(dest), dest.clone()];
      p.target = p.path.shift();
    }
    function stepFolk(dt, now) {
      for (const p of folk) {
        if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) planWalk(p); continue; }
        if (!p.target) { p.wait = 1 + Math.random() * 4; continue; }
        const pos = p.g.position, d = p.target.clone().sub(pos); d.y = 0;
        const dist = d.length();
        if (dist < 0.15) { p.target = p.path.shift(); if (!p.target) p.wait = 1.5 + Math.random() * 5; continue; }
        // keep out of the fountain
        const step = Math.min(dist, p.speed * dt);
        d.setLength(step); pos.add(d);
        const r = Math.hypot(pos.x, pos.z); if (r < 4.2) { pos.x *= 4.2 / r; pos.z *= 4.2 / r; }
        p.g.rotation.y = Math.atan2(d.x, d.z);
        p.g.position.y = Math.abs(Math.sin(now * 9 + p.speed * 10)) * 0.12;
      }
    }

    // ---------- labels ----------
    const labels = {};
    for (const id of Object.keys(anchors)) {
      if (!opts.labels || !opts.labels[id]) continue;
      const b = document.createElement('button');
      b.className = 'sign nav'; b.dataset.act = 'go'; b.dataset.b = id; b.innerHTML = opts.labels[id];
      labelBox.appendChild(b); labels[id] = b;
    }
    let labelsOn = true;
    function showLabels(on) { labelsOn = on; labelBox.style.display = on ? '' : 'none'; }
    const tmpV = new THREE.Vector3();
    function placeLabels() {
      if (!labelsOn) return;
      const w = canvas.clientWidth, h = canvas.clientHeight;
      for (const id in labels) {
        const g = groups[id]; tmpV.copy(anchors[id]); g.localToWorld(tmpV); tmpV.project(camera);
        const el = labels[id];
        if (tmpV.z > 1) { el.style.visibility = 'hidden'; continue; }
        el.style.visibility = '';
        el.style.transform = `translate(${(tmpV.x * 0.5 + 0.5) * w}px, ${(-tmpV.y * 0.5 + 0.5) * h}px) translate(-50%, -100%)`;
      }
    }

    // ---------- camera ----------
    const HOME_VIEW = { tx: 0, tz: -5.5, ty: 0, yaw: 0, el: 0.56, dist: 54 };
    const cam = Object.assign({}, HOME_VIEW), camT = Object.assign({}, HOME_VIEW);
    let focusId = null, userYaw = 0, idleT = 0;
    function focus(id) {
      focusId = id;
      if (!id) { Object.assign(camT, HOME_VIEW); camT.yaw = userYaw; return; }
      const g = groups[id]; const p = g.position;
      const s = SITES.find((q) => q.id === id);
      const a = s ? s.a * Math.PI / 180 : 0;
      Object.assign(camT, { tx: p.x, tz: p.z, ty: 2, yaw: s ? -a : 0.3, el: 0.5, dist: 26 });
    }
    function applyCam(dt) {
      const k = 1 - Math.exp(-dt * 3);
      for (const key of ['tx', 'tz', 'ty', 'el', 'dist']) cam[key] += (camT[key] - cam[key]) * k;
      let dy = camT.yaw - cam.yaw; cam.yaw += dy * k;
      const sway = focusId ? 0 : Math.sin(idleT * 0.12) * 0.12;
      const yaw = cam.yaw + sway;
      const ce = Math.cos(cam.el), se = Math.sin(cam.el);
      camera.position.set(cam.tx + Math.sin(yaw) * ce * cam.dist, cam.ty + se * cam.dist, cam.tz + Math.cos(yaw) * ce * cam.dist);
      camera.lookAt(cam.tx, cam.ty, cam.tz);
    }

    // ---------- picking + dragging the view ----------
    const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
    let down = null;
    canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, yaw: userYaw, moved: false }; });
    window.addEventListener('pointermove', (e) => {
      if (!down || focusId) return;
      const dx = e.clientX - down.x;
      if (Math.abs(dx) > 8) down.moved = true;
      if (down.moved) { userYaw = Math.max(-0.9, Math.min(0.9, down.yaw - dx / canvas.clientWidth * 2.2)); camT.yaw = userYaw; }
    });
    window.addEventListener('pointerup', (e) => {
      if (!down) return; const d = down; down = null;
      if (d.moved || e.target !== canvas) return;
      const r = canvas.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, camera);
      const hits = ray.intersectObjects(scene.children, true);
      for (const h of hits) { const id = h.object.userData.b; if (id) { opts.onPick && opts.onPick(id); return; } }
    });

    // ---------- night falls at the end of each week ----------
    let nightT = 0, nightTarget = 0;
    function setNight(on) { nightTarget = on ? 1 : 0; }
    function applyNight(n) {
      scene.background.copy(SKY_DAY).lerp(SKY_NIGHT, n);
      scene.fog.color.copy(scene.background);
      hemi.intensity = 1.5 - n * 0.95; sun.intensity = 2.2 - n * 1.9;
      sun.color.setHex(0xfff1d6).lerp(C(0x8fa0ff), n);
      glowMat.emissiveIntensity = n * 1.2; for (const b of bulbMats) b.emissiveIntensity = 0.15 + n * 1.3;
      winMat.color.setHex(0x8fd0ee).lerp(C(0xffe7a3), n); winMat.emissiveIntensity = n * 1.1; shineMat.opacity = 0.55 * (1 - n);
      water.material.color.setHex(0x6fd3f0).lerp(C(0x2a3f7a), n);
    }

    // ---------- coin sparkle over a building (when money arrives) ----------
    const sparks = [];
    const sparkMat = new THREE.MeshLambertMaterial({ color: 0xffd75a, emissive: 0x8a6100, emissiveIntensity: 0.6 });
    function sparkle(id, n = 14) {
      const g = groups[id]; if (!g) return;
      const at = anchors[id].clone(); g.localToWorld(at); at.y -= 1.5;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.08, 14), sparkMat);
        m.position.copy(at); m.rotation.x = Math.PI / 2; scene.add(m);
        const a = Math.random() * Math.PI * 2;
        sparks.push({ m, vx: Math.cos(a) * (2 + Math.random() * 3), vz: Math.sin(a) * (2 + Math.random() * 3), vy: 6 + Math.random() * 5, life: 1.6 });
      }
    }

    // ---------- loop ----------
    function resize() {
      const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
      renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
    }
    if (window.ResizeObserver) new ResizeObserver(resize).observe(canvas); else window.addEventListener('resize', resize);
    resize();
    let last = performance.now(), slowFrames = 0;
    function frame(now) {
      requestAnimationFrame(frame);
      if (document.hidden) { last = now; return; }
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (dt > 0.045) { if (++slowFrames === 60 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(1); resize(); } } else slowFrames = Math.max(0, slowFrames - 1);
      idleT += dt;
      const t = now / 1000;
      coinStatue.rotation.y = t * 0.8; coinStatue.position.y = 4.6 + Math.sin(t * 1.6) * 0.15;
      for (const d of drops) { d.t = (d.t + dt * 0.7) % 1; const r = 0.6 + d.t * 2.1; d.m.position.set(Math.cos(d.a) * r, 3.2 + d.t * 1.6 - d.t * d.t * 3.4, Math.sin(d.a) * r); }
      waterTex.offset.x = t * 0.004; waterTex.offset.y = t * 0.003;
      if (tickerTex) tickerTex.offset.x = (t * 0.06) % 1;
      for (const c of clouds) { c.position.x += dt * 1.2; if (c.position.x > 110) c.position.x = -110; }
      if (spinner) spinner.rotation.y = t * 0.7;
      if (dogBody) dogBody.position.y = Math.abs(Math.sin(t * 5)) * 0.15;
      ducks.forEach((d, i) => { const a = t * 0.3 + i * 2.1; d.position.x = Math.sin(a) * 1.7; d.position.z = Math.cos(a) * 1.7; d.rotation.y = a + Math.PI / 2; });
      for (let i = popIns.length - 1; i >= 0; i--) { const p = popIns[i]; p.t += dt * 2; const k = Math.min(1, p.t); p.o.scale.setScalar(Math.max(0.01, 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k))); if (k >= 1) { p.o.scale.setScalar(1); popIns.splice(i, 1); } }
      for (let i = sparks.length - 1; i >= 0; i--) { const s = sparks[i]; s.vy -= 18 * dt; s.m.position.x += s.vx * dt; s.m.position.y += s.vy * dt; s.m.position.z += s.vz * dt; s.m.rotation.z += dt * 8; s.life -= dt; if (s.life <= 0 || s.m.position.y < 0) { scene.remove(s.m); s.m.geometry.dispose(); sparks.splice(i, 1); } }
      if (nightT !== nightTarget) {
        nightT = nightTarget > nightT ? Math.min(nightTarget, nightT + dt / 1.6) : Math.max(nightTarget, nightT - dt / 1.6);
        applyNight(nightT * nightT * (3 - 2 * nightT));
      }
      stepFolk(dt, t);
      applyCam(dt);
      renderer.render(scene, camera);
      placeLabels();
    }
    applyNight(0);
    requestAnimationFrame(frame);

    // a still picture of the town (used to make the launcher cover): renders once at w x h from `view`
    // ({ tx, tz, ty, yaw, el, dist, fov }) and returns a 2D canvas copy
    function shot(w, h, view) {
      const saved = Object.assign({}, cam), pr = renderer.getPixelRatio(), fov = camera.fov;
      Object.assign(cam, HOME_VIEW, view || {});
      if (view && view.coin != null) coinStatue.rotation.y = view.coin;
      renderer.setPixelRatio(1); renderer.setSize(w, h, false);
      camera.aspect = w / h; camera.fov = (view && view.fov) || fov; camera.updateProjectionMatrix();
      const ce = Math.cos(cam.el), se = Math.sin(cam.el);
      camera.position.set(cam.tx + Math.sin(cam.yaw) * ce * cam.dist, cam.ty + se * cam.dist, cam.tz + Math.cos(cam.yaw) * ce * cam.dist);
      camera.lookAt(cam.tx, cam.ty, cam.tz);
      renderer.render(scene, camera);
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      out.getContext('2d').drawImage(renderer.domElement, 0, 0, w, h);
      Object.assign(cam, saved); camera.fov = fov; renderer.setPixelRatio(pr); resize();
      return out;
    }

    return { focus, showLabels, setGifts, setOwned, setHome, setNight, sparkle, resize, shot, labels, get focused() { return focusId; } };
  }

  window.CoinTown3D = { init };
})();
