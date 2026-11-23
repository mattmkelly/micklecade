// DreamReel's fun backgrounds: animated scenes drawn in code (no image files), so they work
// offline and look the same in the preview and the saved movie. Each one is
// draw(ctx, w, h, t): paint the whole w x h frame for time t (seconds since the clip began).
// Everything that looks random comes from a seeded generator, so a frame only depends on t.
(function () {
  'use strict';

  function rng(seed) {
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function many(seed, n, make) {
    var r = rng(seed), out = [];
    for (var i = 0; i < n; i++) out.push(make(r, i));
    return out;
  }
  function wrap(v) { return ((v % 1) + 1) % 1; }
  var TAU = Math.PI * 2;

  // ------------------------------------------------------------ SPACE: flying through the stars
  var STARS = many(11, 420, function (r) { return { x: r() * 2 - 1, y: r() * 2 - 1, z: r(), c: r() }; });
  function space(x, w, h, t) {
    var g = x.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.75);
    g.addColorStop(0, '#1d1648'); g.addColorStop(1, '#03020a');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.globalCompositeOperation = 'lighter';
    [[0.25, 0.32, 'rgba(255,60,190,0.20)'], [0.76, 0.64, 'rgba(60,150,255,0.18)'], [0.55, 0.2, 'rgba(120,80,255,0.12)']].forEach(function (n, i) {
      var nx = w * (n[0] + 0.06 * Math.sin(t * 0.2 + i * 2)), ny = h * (n[1] + 0.06 * Math.cos(t * 0.17 + i));
      var gg = x.createRadialGradient(nx, ny, 0, nx, ny, Math.max(w, h) * 0.45);
      gg.addColorStop(0, n[2]); gg.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = gg; x.fillRect(0, 0, w, h);
    });
    var f = Math.max(w, h) * 0.18, cx = w / 2, cy = h / 2;
    x.lineCap = 'round';
    for (var i = 0; i < STARS.length; i++) {
      var s = STARS[i];
      var z = wrap(s.z - t * 0.3), d = 0.03 + z, d2 = d + 0.04;
      var X = cx + s.x / d * f, Y = cy + s.y / d * f;
      if (X < -30 || X > w + 30 || Y < -30 || Y > h + 30) continue;
      var b = Math.min(1, (1 - z) * 1.4);
      x.strokeStyle = s.c < 0.15 ? 'rgba(255,220,150,' + b + ')' : s.c < 0.3 ? 'rgba(160,205,255,' + b + ')' : 'rgba(255,255,255,' + b + ')';
      x.lineWidth = Math.max(0.7, (1 - z) * Math.min(w, h) * 0.012);
      x.beginPath(); x.moveTo(cx + s.x / d2 * f, cy + s.y / d2 * f); x.lineTo(X, Y); x.stroke();
    }
    x.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------ RAINBOW: a rainbow tunnel
  var SPARKS = many(23, 40, function (r) { return { x: r(), y: r(), ph: r() * TAU, s: 0.5 + r() }; });
  var HUES = [0, 28, 52, 120, 195, 245, 290];
  function rainbow(x, w, h, t) {
    var cx = w / 2 + Math.sin(t * 0.7) * w * 0.05, cy = h / 2 + Math.cos(t * 0.55) * h * 0.05;
    var R = Math.hypot(w, h) * 0.75, N = 14, rings = [];
    for (var k = 0; k < N; k++) rings.push({ p: wrap(k / N + t * 0.16), k: k });
    rings.sort(function (a, b) { return b.p - a.p; });
    x.fillStyle = 'hsl(' + HUES[rings[0].k % 7] + ',90%,60%)';
    x.fillRect(0, 0, w, h);
    rings.forEach(function (r) {
      x.fillStyle = 'hsl(' + HUES[r.k % 7] + ',90%,60%)';
      x.beginPath(); x.arc(cx, cy, Math.max(0.5, R * Math.pow(r.p, 1.8)), 0, TAU); x.fill();
    });
    var g = x.createRadialGradient(cx, cy, 0, cx, cy, Math.min(w, h) * 0.3);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fff';
    SPARKS.forEach(function (s) {
      var a = Math.max(0, Math.sin(t * 3 + s.ph));
      if (a < 0.05) return;
      var r = Math.min(w, h) * 0.018 * s.s * a, X = s.x * w, Y = s.y * h;
      x.globalAlpha = a;
      x.beginPath();
      x.moveTo(X, Y - r * 2); x.lineTo(X + r * 0.5, Y - r * 0.5); x.lineTo(X + r * 2, Y); x.lineTo(X + r * 0.5, Y + r * 0.5);
      x.lineTo(X, Y + r * 2); x.lineTo(X - r * 0.5, Y + r * 0.5); x.lineTo(X - r * 2, Y); x.lineTo(X - r * 0.5, Y - r * 0.5);
      x.closePath(); x.fill();
    });
    x.globalAlpha = 1;
  }

  // ------------------------------------------------------------ VOLCANO: erupting lava
  var BOMBS = many(37, 70, function (r) { return { ph: r(), vx: r(), vy: r(), s: r() }; });
  var ASH = many(41, 30, function (r) { return { x: r(), ph: r(), s: r() }; });
  function volcano(x, w, h, t) {
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16050d'); g.addColorStop(0.5, '#6a1912'); g.addColorStop(0.72, '#d9541b'); g.addColorStop(1, '#3a0d08');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    var cx = w * 0.5, cy = h * 0.44, u = Math.min(w, h), pulse = 0.75 + 0.25 * Math.sin(t * 3.1);
    var glow = x.createRadialGradient(cx, cy, 0, cx, cy, u * 0.6);
    glow.addColorStop(0, 'rgba(255,150,40,' + (0.6 * pulse) + ')'); glow.addColorStop(1, 'rgba(255,80,0,0)');
    x.fillStyle = glow; x.fillRect(0, 0, w, h);
    // smoke rising out of the top
    for (var i = 0; i < 8; i++) {
      var P = 7, age = (t + i * P / 8) % P;
      var sx = cx + Math.sin(i * 2.3 + age * 0.5) * u * 0.05 + age * u * 0.03, sy = cy - age * u * 0.1;
      x.fillStyle = 'rgba(60,45,50,' + (0.45 * (1 - age / P)) + ')';
      x.beginPath(); x.arc(sx, sy, u * (0.05 + age * 0.035), 0, TAU); x.fill();
    }
    // the mountain
    x.fillStyle = '#2a1411';
    x.beginPath();
    x.moveTo(-w * 0.05, h); x.lineTo(cx - u * 0.12, cy); x.lineTo(cx - u * 0.07, cy + u * 0.02);
    x.lineTo(cx + u * 0.07, cy + u * 0.02); x.lineTo(cx + u * 0.12, cy); x.lineTo(w * 1.05, h); x.closePath(); x.fill();
    // lava running down
    x.globalCompositeOperation = 'lighter';
    x.lineCap = 'round';
    x.setLineDash([u * 0.06, u * 0.025]);
    x.lineDashOffset = -t * u * 0.15;
    [[-1, 0.3], [1, 0.25], [-0.4, 0.5], [0.6, 0.55]].forEach(function (l) {
      x.strokeStyle = 'rgba(255,' + (120 + 60 * pulse | 0) + ',30,0.9)';
      x.lineWidth = u * 0.016;
      x.beginPath(); x.moveTo(cx + l[0] * u * 0.06, cy + u * 0.02);
      x.bezierCurveTo(cx + l[0] * u * 0.2, cy + u * 0.2, cx + l[0] * u * (0.15 + l[1]), h * 0.8, cx + l[0] * w * 0.45, h * 1.02);
      x.stroke();
    });
    x.setLineDash([]);
    x.fillStyle = '#ffd24a';
    x.beginPath(); x.ellipse(cx, cy + u * 0.02, u * 0.07, u * 0.018, 0, 0, TAU); x.fill();
    // lava bombs flying out
    BOMBS.forEach(function (b) {
      var P = 2.4, age = (t + b.ph * P) % P;
      var X = cx + (b.vx - 0.5) * u * 0.6 * age, Y = cy + -u * (0.7 + b.vy * 0.5) * age + 0.5 * u * 1.2 * age * age;
      if (Y > h || Y < -20) return;
      var heat = 1 - age / P;
      x.fillStyle = 'hsl(' + (12 + heat * 40) + ',100%,' + (45 + heat * 25) + '%)';
      x.beginPath(); x.arc(X, Y, u * (0.006 + b.s * 0.012), 0, TAU); x.fill();
    });
    x.globalCompositeOperation = 'source-over';
    // glowing ash drifting down
    ASH.forEach(function (a) {
      var Y = wrap(a.ph + t * 0.05) * h, X = a.x * w + Math.sin(t + a.ph * 9) * u * 0.02;
      x.fillStyle = 'rgba(255,170,80,' + (0.3 + a.s * 0.5) + ')';
      x.fillRect(X, Y, u * 0.004, u * 0.004);
    });
    x.fillStyle = '#120605';
    x.beginPath(); x.moveTo(0, h);
    for (var k = 0; k <= 10; k++) x.lineTo(k / 10 * w, h * (0.94 + 0.02 * Math.sin(k * 1.7)));
    x.lineTo(w, h); x.closePath(); x.fill();
  }

  // ------------------------------------------------------------ UNDER THE SEA
  var BUBBLES = many(53, 45, function (r) { return { x: r(), ph: r(), s: r() }; });
  var FISH = many(59, 7, function (r, i) { return { y: r(), v: 0.05 + r() * 0.08, x: r(), s: 0.7 + r() * 0.8, dir: i % 2 ? -1 : 1, col: ['#ff8a2a', '#ffd23a', '#ff5fa8', '#5fe0ff', '#9aff5f'][i % 5], ph: r() * TAU }; });
  function sea(x, w, h, t) {
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#1592d4'); g.addColorStop(0.55, '#06507e'); g.addColorStop(1, '#022238');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    var u = Math.min(w, h);
    x.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 5; i++) {
      var bx = w * (0.08 + i * 0.22) + Math.sin(t * 0.4 + i * 1.7) * w * 0.05;
      var rg = x.createLinearGradient(0, 0, 0, h);
      rg.addColorStop(0, 'rgba(190,235,255,0.16)'); rg.addColorStop(1, 'rgba(190,235,255,0)');
      x.fillStyle = rg;
      x.beginPath(); x.moveTo(bx - w * 0.03, 0); x.lineTo(bx + w * 0.03, 0); x.lineTo(bx + w * 0.13, h); x.lineTo(bx - w * 0.02, h); x.closePath(); x.fill();
    }
    x.globalCompositeOperation = 'source-over';
    FISH.forEach(function (f) {
      var p = wrap(f.x + t * f.v) * 1.4 - 0.2, X = (f.dir > 0 ? p : 1 - p) * w;
      var Y = h * (0.15 + f.y * 0.55) + Math.sin(t * 2 + f.ph) * u * 0.02, s = u * 0.05 * f.s;
      x.save(); x.translate(X, Y); x.scale(f.dir, 1);
      x.fillStyle = f.col;
      x.beginPath(); x.ellipse(0, 0, s, s * 0.55, 0, 0, TAU); x.fill();
      var wag = Math.sin(t * 9 + f.ph) * s * 0.2;
      x.beginPath(); x.moveTo(-s * 0.8, 0); x.lineTo(-s * 1.5, -s * 0.5 + wag); x.lineTo(-s * 1.5, s * 0.5 + wag); x.closePath(); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.arc(s * 0.5, -s * 0.12, s * 0.15, 0, TAU); x.fill();
      x.fillStyle = '#111'; x.beginPath(); x.arc(s * 0.55, -s * 0.12, s * 0.07, 0, TAU); x.fill();
      x.restore();
    });
    x.fillStyle = '#d4b06e';
    x.beginPath(); x.moveTo(0, h);
    for (var k = 0; k <= 12; k++) x.lineTo(k / 12 * w, h * (0.88 + 0.025 * Math.sin(k * 1.3)));
    x.lineTo(w, h); x.closePath(); x.fill();
    x.lineCap = 'round';
    for (var j = 0; j < 10; j++) {
      var sx = w * (0.04 + j * 0.105), sh = h * (0.2 + (j % 3) * 0.09), sway = Math.sin(t * 1.3 + j) * u * 0.05;
      x.strokeStyle = j % 2 ? '#2f9a4a' : '#3fbf5a'; x.lineWidth = u * 0.018;
      x.beginPath(); x.moveTo(sx, h * 0.92);
      x.bezierCurveTo(sx + sway, h * 0.92 - sh * 0.4, sx - sway, h * 0.92 - sh * 0.7, sx + sway * 1.3, h * 0.92 - sh);
      x.stroke();
    }
    x.lineWidth = Math.max(1, u * 0.004);
    BUBBLES.forEach(function (b) {
      var P = 6, age = (t + b.ph * P) % P, Y = h * (1 - age / P * 1.1), X = b.x * w + Math.sin(age * 3 + b.ph * 6) * u * 0.02;
      var r = u * (0.006 + b.s * 0.014);
      x.strokeStyle = 'rgba(220,245,255,0.7)';
      x.beginPath(); x.arc(X, Y, r, 0, TAU); x.stroke();
      x.fillStyle = 'rgba(255,255,255,0.6)';
      x.beginPath(); x.arc(X - r * 0.35, Y - r * 0.35, r * 0.25, 0, TAU); x.fill();
    });
  }

  // ------------------------------------------------------------ SKY: flying through the clouds
  var CLOUDS = many(71, 34, function (r) { return { x: r() * 2 - 1, y: r() * 1.4 - 0.5, z: r(), ph: r() }; });
  function sky(x, w, h, t) {
    var g = x.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#2f8ff0'); g.addColorStop(0.7, '#9fd6ff'); g.addColorStop(1, '#e4f5ff');
    x.fillStyle = g; x.fillRect(0, 0, w, h);
    var sun = x.createRadialGradient(w * 0.8, h * 0.18, 0, w * 0.8, h * 0.18, Math.min(w, h) * 0.45);
    sun.addColorStop(0, 'rgba(255,250,210,0.95)'); sun.addColorStop(0.15, 'rgba(255,240,170,0.6)'); sun.addColorStop(1, 'rgba(255,240,170,0)');
    x.fillStyle = sun; x.fillRect(0, 0, w, h);
    var f = Math.max(w, h) * 0.2, cx = w / 2, cy = h / 2, list = [];
    CLOUDS.forEach(function (c) { list.push({ c: c, z: wrap(c.z - t * 0.1) }); });
    list.sort(function (a, b) { return b.z - a.z; });
    list.forEach(function (o) {
      var c = o.c, d = 0.05 + o.z, X = cx + c.x / d * f, Y = cy + c.y / d * f, s = Math.min(w, h) * 0.06 / d;
      if (X < -s * 3 || X > w + s * 3 || Y < -s * 2 || Y > h + s * 2) return;
      var a = Math.min(1, (1 - o.z) * 2.2) * Math.min(1, o.z * 9);
      if (a <= 0.01) return;
      x.globalAlpha = a;
      x.fillStyle = 'rgba(190,210,235,0.9)';
      puff(x, X, Y + s * 0.12, s);
      x.fillStyle = '#ffffff';
      puff(x, X, Y, s);
    });
    x.globalAlpha = 1;
  }
  function puff(x, X, Y, s) {
    x.beginPath();
    x.arc(X - s, Y, s * 0.6, 0, TAU); x.arc(X - s * 0.35, Y - s * 0.35, s * 0.75, 0, TAU);
    x.arc(X + s * 0.4, Y - s * 0.25, s * 0.7, 0, TAU); x.arc(X + s, Y + s * 0.05, s * 0.55, 0, TAU);
    x.rect(X - s, Y, s * 2, s * 0.6);
    x.fill();
  }

  // ------------------------------------------------------------ DISCO
  var DOTS = many(83, 36, function (r) { return { a: r() * TAU, rr: 0.3 + r() * 0.7, ph: r() * TAU, c: r() }; });
  var DISCO_COLS = ['#ff2fd0', '#2fe0ff', '#ffe02f', '#8a3fff', '#2fff8a', '#ff7a2f'];
  function disco(x, w, h, t) {
    x.fillStyle = '#12051f'; x.fillRect(0, 0, w, h);
    var u = Math.min(w, h), horizon = h * 0.55, vx = w / 2, beat = Math.floor(t * 2.4);
    // light-up floor in perspective
    var rows = 6, cols = 10;
    for (var r = 0; r < rows; r++) {
      var y0 = horizon + (h - horizon) * Math.pow(r / rows, 1.6), y1 = horizon + (h - horizon) * Math.pow((r + 1) / rows, 1.6);
      var k0 = (y0 - horizon) / (h - horizon), k1 = (y1 - horizon) / (h - horizon);
      for (var c = 0; c < cols; c++) {
        var cx0 = (c / cols - 0.5) * w * 2.2, cx1 = ((c + 1) / cols - 0.5) * w * 2.2;
        var on = ((r * 7 + c * 13 + beat * 5) % 6);
        x.fillStyle = DISCO_COLS[on];
        x.globalAlpha = ((r + c + beat) % 3 === 0) ? 0.95 : 0.35;
        x.beginPath();
        x.moveTo(vx + cx0 * k0, y0); x.lineTo(vx + cx1 * k0, y0); x.lineTo(vx + cx1 * k1, y1); x.lineTo(vx + cx0 * k1, y1);
        x.closePath(); x.fill();
      }
    }
    x.globalAlpha = 1;
    // sweeping spotlight beams
    x.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 6; i++) {
      var bx = w * (0.1 + i * 0.16), ang = Math.sin(t * 0.9 + i * 1.4) * 0.6, len = h * 1.3, spread = 0.12;
      var bg = x.createLinearGradient(bx, 0, bx + Math.sin(ang) * len, Math.cos(ang) * len);
      bg.addColorStop(0, hexA(DISCO_COLS[i % 6], 0.55)); bg.addColorStop(1, hexA(DISCO_COLS[i % 6], 0));
      x.fillStyle = bg;
      x.beginPath(); x.moveTo(bx, 0);
      x.lineTo(bx + Math.sin(ang - spread) * len, Math.cos(ang - spread) * len);
      x.lineTo(bx + Math.sin(ang + spread) * len, Math.cos(ang + spread) * len);
      x.closePath(); x.fill();
    }
    // mirror-ball sparkles round the room
    DOTS.forEach(function (d) {
      var a = d.a + t * 0.6, X = w / 2 + Math.cos(a) * w * 0.48 * d.rr, Y = h * 0.3 + Math.sin(a) * h * 0.25 * d.rr;
      var tw = 0.5 + 0.5 * Math.sin(t * 6 + d.ph);
      x.fillStyle = d.c < 0.5 ? 'rgba(255,255,255,' + tw + ')' : hexA(DISCO_COLS[(d.c * 6) | 0], tw);
      x.beginPath(); x.arc(X, Y, u * 0.008, 0, TAU); x.fill();
    });
    x.globalCompositeOperation = 'source-over';
    // the mirror ball
    var mx = w / 2, my = h * 0.13, mr = u * 0.08;
    x.strokeStyle = '#888'; x.lineWidth = Math.max(1, u * 0.004);
    x.beginPath(); x.moveTo(mx, 0); x.lineTo(mx, my - mr); x.stroke();
    var mg = x.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
    mg.addColorStop(0, '#ffffff'); mg.addColorStop(0.5, '#b8b8c8'); mg.addColorStop(1, '#5a5a6a');
    x.fillStyle = mg; x.beginPath(); x.arc(mx, my, mr, 0, TAU); x.fill();
    x.save(); x.beginPath(); x.arc(mx, my, mr, 0, TAU); x.clip();
    x.strokeStyle = 'rgba(40,40,60,0.6)'; x.lineWidth = 1;
    for (var q = -4; q <= 4; q++) {
      x.beginPath(); x.moveTo(mx - mr, my + q * mr / 4.5); x.lineTo(mx + mr, my + q * mr / 4.5); x.stroke();
      var off = ((t * 0.5) % 1) * mr / 4.5;
      x.beginPath(); x.moveTo(mx + q * mr / 4.5 + off, my - mr); x.lineTo(mx + q * mr / 4.5 + off, my + mr); x.stroke();
    }
    x.restore();
  }
  function hexA(hex, a) {
    var n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  window.DreamReelBackgrounds = [
    { id: 'space', label: 'SPACE', draw: space },
    { id: 'rainbow', label: 'RAINBOW', draw: rainbow },
    { id: 'volcano', label: 'VOLCANO', draw: volcano },
    { id: 'sea', label: 'UNDER THE SEA', draw: sea },
    { id: 'sky', label: 'CLOUDS', draw: sky },
    { id: 'disco', label: 'DISCO', draw: disco }
  ];
})();
