// Boing Lab -- learn physics with Professor Newt, then use it to solve gizmo puzzles.
// Screens: title -> labs (pick one of 6 labs or the Playground) -> hub (LEARN, WHAT WILL HAPPEN?, 4 puzzles)
// The physics lives in physics.js, the labs / lessons / levels in levels.js.
(function () {
  'use strict';
  const P = window.BoingPhys, LABS = window.BoingLevels.LABS;
  const W = 480, H = 270, TOP = 22, TRAY = 238;
  const canvas = document.getElementById('game');
  const ctx = HiRes.setup(canvas, W, H, (c) => { c.textBaseline = 'middle'; c.lineJoin = 'round'; c.lineCap = 'round'; });
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
  const font = (px, w) => `${w || 800} ${px}px ${FONT}`;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const deg = (r) => r * 180 / Math.PI;

  // ---------------------------------------------------------------- save
  const SAVE_KEY = 'boingLab.save';
  const save = { stars: {}, learned: {}, guessed: {}, voice: true };
  try { Object.assign(save, JSON.parse(localStorage.getItem(SAVE_KEY)) || {}); } catch (e) { /* storage blocked */ }
  function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* */ } }
  const starKey = (li, lv) => li + '-' + lv;
  const labStars = (li) => LABS[li].levels.reduce((n, _, j) => n + (save.stars[starKey(li, j)] || 0), 0);
  const allStars = () => LABS.reduce((n, _, i) => n + labStars(i), 0);

  // ---------------------------------------------------------------- sound
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, f2, delay) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol || 0.06, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination);
    o.start(t); o.stop(t + dur + 0.03);
  }
  const lastSfx = {};
  function ok(name, gap) { const n = performance.now(); if (n - (lastSfx[name] || 0) < gap) return false; lastSfx[name] = n; return true; }
  const sfx = {
    click: () => tone(700, 0.05, 'square', 0.04),
    place: () => tone(300, 0.08, 'triangle', 0.1, 520),
    turn: () => tone(520, 0.04, 'square', 0.035),
    remove: () => tone(320, 0.14, 'triangle', 0.08, 120),
    go: () => { tone(440, 0.08, 'square', 0.05); tone(660, 0.14, 'square', 0.05, null, 0.08); },
    boing: (sp) => ok('boing', 60) && tone(160 + sp * 0.2, 0.28, 'sine', 0.13, 420 + sp * 0.6),
    thunk: (sp) => ok('thunk', 45) && tone(110 + sp * 0.12, 0.07, 'triangle', Math.min(0.13, 0.03 + sp / 2500)),
    ding: () => ok('ding', 50) && tone(1250, 0.16, 'sine', 0.07, 950),
    clack: (sp) => ok('clack', 40) && tone(900, 0.035, 'square', Math.min(0.06, 0.015 + sp / 6000)),
    star: (i) => { tone(880 + i * 220, 0.1, 'square', 0.05); tone(1320 + i * 220, 0.16, 'square', 0.045, null, 0.07); },
    pop: () => tone(1000, 0.09, 'sawtooth', 0.07, 70),
    home: () => { tone(660, 0.1, 'triangle', 0.08); tone(990, 0.16, 'triangle', 0.08, null, 0.09); },
    win: () => [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.2, 'square', 0.05, null, i * 0.09)),
    oops: () => { tone(440, 0.14, 'triangle', 0.07, 392); tone(392, 0.2, 'triangle', 0.07, 330, 0.15); },
    right: () => [660, 880, 1100].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, null, i * 0.08)),
    whoosh: () => ok('whoosh', 300) && tone(200, 0.3, 'sawtooth', 0.02, 90),
  };

  // ---------------------------------------------------------------- voice
  let talkT = 0;
  function say(text) {
    talkT = Math.min(9, 0.6 + text.length * 0.055);
    if (!save.voice || !window.MickleVoice || !MickleVoice.can) return;
    try { MickleVoice.cancel(); MickleVoice.speak(text, { rate: 0.95 }); } catch (e) { /* */ }
  }
  function hush() { talkT = 0; try { if (window.MickleVoice) MickleVoice.cancel(); } catch (e) { /* */ } }

  // ---------------------------------------------------------------- drawing helpers
  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(s, x, y, px, color, align, weight) {
    ctx.font = font(px, weight); ctx.fillStyle = color || '#fff'; ctx.textAlign = align || 'center'; ctx.fillText(s, x, y);
  }
  function outlined(s, x, y, px, color, edge, align) {
    ctx.font = font(px, 900); ctx.textAlign = align || 'center';
    ctx.lineWidth = Math.max(2, px / 5); ctx.strokeStyle = edge || '#1e1b4b'; ctx.strokeText(s, x, y);
    ctx.fillStyle = color || '#fff'; ctx.fillText(s, x, y);
  }
  function wrap(s, maxW, px, weight) {
    ctx.font = font(px, weight || 700);
    const words = s.split(' '), lines = [];
    let line = '';
    for (const w of words) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t;
    }
    if (line) lines.push(line);
    return lines;
  }
  function starShape(x, y, r, rot) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot + i * Math.PI / 5 - Math.PI / 2, rad = i % 2 ? r * 0.45 : r;
      ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  function drawStar(x, y, r, on, rot) {
    starShape(x, y, r, rot || 0);
    ctx.fillStyle = on ? '#fbbf24' : 'rgba(148,163,184,.45)'; ctx.fill();
    ctx.lineWidth = r * 0.18; ctx.strokeStyle = on ? '#b45309' : 'rgba(100,116,139,.6)'; ctx.stroke();
  }
  function glass(x, y, w, h, r, fill) {
    rr(x, y, w, h, r || 10);
    ctx.fillStyle = fill || 'rgba(255,255,255,.9)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.stroke();
  }

  // ---------------------------------------------------------------- buttons + focus
  let ui = [];
  let pressedId = null, focusId = null, navMode = false;
  // btn(id, x, y, w, h, label, { act, color, edge, size, icon, nav, glow, disabled })
  function btn(id, x, y, w, h, label, o) {
    o = o || {};
    const down = pressedId === id;
    const focus = navMode && focusId === id;
    const col = o.color || '#ffffff', edge = o.edge || 'rgba(30,58,138,.4)';
    const dy = down ? 1.5 : 0;
    if (o.glow) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 6);
      rr(x - 3, y - 3, w + 6, h + 6, Math.min(h / 2, 12) + 3);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.35 + 0.4 * pulse})`; ctx.fill();
    }
    if (!o.flat) { rr(x, y + 2.5, w, h, Math.min(h / 2, o.r || 10)); ctx.fillStyle = edge; ctx.fill(); }
    rr(x, y + dy, w, h, Math.min(h / 2, o.r || 10));
    ctx.fillStyle = o.disabled ? 'rgba(203,213,225,.85)' : col; ctx.fill();
    if (focus) { ctx.lineWidth = 2.5; ctx.strokeStyle = '#f59e0b'; ctx.stroke(); }
    if (o.draw) o.draw(x, y + dy, w, h);
    if (label) {
      const tc = o.text || (col === '#ffffff' ? '#1e3a8a' : '#fff');
      text(label, x + w / 2 + (o.lx || 0), y + h / 2 + dy + 0.5, o.size || 11, o.disabled ? '#94a3b8' : tc, 'center', 900);
    }
    ui.push({ id, x, y, w, h, act: o.disabled ? null : o.act, nav: o.nav !== false && !o.disabled });
  }
  function hitBtn(x, y) {
    for (let i = ui.length - 1; i >= 0; i--) {
      const b = ui[i];
      if (x >= b.x && x <= b.x + b.w && y >= b.y - 2 && y <= b.y + b.h + 3) return b;
    }
    return null;
  }
  function navMove(dx, dy) {
    const items = ui.filter((b) => b.nav && b.act);
    if (!items.length) return;
    navMode = true;
    let cur = items.find((b) => b.id === focusId);
    if (!cur) { focusId = items[0].id; return; }
    const cx = cur.x + cur.w / 2, cy = cur.y + cur.h / 2;
    let best = null, bestD = 1e9;
    for (const b of items) {
      if (b === cur) continue;
      const bx = b.x + b.w / 2 - cx, by = b.y + b.h / 2 - cy;
      const along = bx * dx + by * dy;
      if (along <= 2) continue;
      const side = Math.abs(bx * dy - by * dx);
      const d = along + side * 2.2;
      if (d < bestD) { bestD = d; best = b; }
    }
    if (best) { focusId = best.id; sfx.click(); }
  }
  function navPress() {
    const b = ui.find((u) => u.id === focusId && u.act);
    if (b) { sfx.click(); b.act(); } else navMove(1, 0);
  }

  // ---------------------------------------------------------------- particles
  let parts = [];
  function burst(x, y, n, colors, speed, life, size, grav) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = speed * (0.3 + Math.random() * 0.7);
      parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.6 + Math.random() * 0.6), max: life,
        c: colors[(Math.random() * colors.length) | 0], s: size * (0.6 + Math.random() * 0.7), g: grav == null ? 300 : grav, rot: Math.random() * 6 });
    }
  }
  function confetti() {
    for (let i = 0; i < 90; i++) {
      parts.push({ x: Math.random() * W, y: -10 - Math.random() * 60, vx: (Math.random() - 0.5) * 60, vy: 40 + Math.random() * 80,
        life: 3, max: 3, c: ['#ef4444', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'][i % 6], s: 3, g: 40, rot: Math.random() * 6, conf: true });
    }
  }
  function stepParts(dt) {
    parts = parts.filter((p) => (p.life -= dt) > 0);
    for (const p of parts) { p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += dt * 8; }
  }
  function drawParts() {
    for (const p of parts) {
      ctx.globalAlpha = clamp(p.life / p.max * 1.5, 0, 1);
      ctx.fillStyle = p.c;
      if (p.conf) {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillRect(-p.s, -p.s / 2, p.s * 2, p.s); ctx.restore();
      } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }

  // ---------------------------------------------------------------- world drawing
  function drawBackground(space, x0, y0, w, h) {
    x0 = x0 || 0; y0 = y0 == null ? TOP : y0; w = w || W; h = h || TRAY - TOP;
    if (space) {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      g.addColorStop(0, '#0b1030'); g.addColorStop(1, '#1e1b4b');
      ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
      for (let i = 0; i < 70; i++) {
        const sx = x0 + ((i * 97.3) % w), sy = y0 + ((i * 53.7) % h);
        ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(now * 1.3 + i));
        ctx.fillStyle = '#fff'; ctx.fillRect(sx, sy, 1.3, 1.3);
      }
      ctx.globalAlpha = 1;
      return;
    }
    const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
    g.addColorStop(0, '#eaf4ff'); g.addColorStop(1, '#d6e8fb');
    ctx.fillStyle = g; ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(59,130,246,.10)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = x0 + 20; x < x0 + w; x += 20) { ctx.moveTo(x, y0); ctx.lineTo(x, y0 + h); }
    for (let y = y0 + 20; y < y0 + h; y += 20) { ctx.moveTo(x0, y); ctx.lineTo(x0 + w, y); }
    ctx.stroke();
  }

  function segPath(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }

  function drawSeg(s, ghost) {
    const { x1, y1, x2, y2, mat } = s;
    const len = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / len, uy = (y2 - y1) / len, nx = -uy, ny = ux;
    if (mat === 'wood') {
      segPath(x1, y1, x2, y2); ctx.lineWidth = 8; ctx.strokeStyle = '#7c4a1e'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 5.5; ctx.strokeStyle = '#c98a4b'; ctx.stroke();
      ctx.lineWidth = 0.8; ctx.strokeStyle = 'rgba(124,74,30,.55)';
      for (let d = 10; d < len - 6; d += 17) {
        segPath(x1 + ux * d + nx * 0.8, y1 + uy * d + ny * 0.8, x1 + ux * (d + 8) + nx * 0.8, y1 + uy * (d + 8) + ny * 0.8); ctx.stroke();
      }
    } else if (mat === 'ice') {
      segPath(x1, y1, x2, y2); ctx.lineWidth = 8; ctx.strokeStyle = '#38bdf8'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 5.5; ctx.strokeStyle = '#cffafe'; ctx.stroke();
      ctx.lineWidth = 1.2; ctx.strokeStyle = '#fff';
      for (let d = 8; d < len - 8; d += 22) { segPath(x1 + ux * d - nx * 1.2, y1 + uy * d - ny * 1.2, x1 + ux * (d + 6) - nx * 1.2, y1 + uy * (d + 6) - ny * 1.2); ctx.stroke(); }
    } else if (mat === 'carpet') {
      segPath(x1, y1, x2, y2); ctx.lineWidth = 8; ctx.strokeStyle = '#991b1b'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 5.5; ctx.strokeStyle = '#dc2626'; ctx.stroke();
      ctx.fillStyle = '#fca5a5';
      for (let d = 3; d < len - 2; d += 4) {
        const o = ((d * 7) % 5) - 2.5;
        ctx.fillRect(x1 + ux * d + nx * o * 0.7 - 0.5, y1 + uy * d + ny * o * 0.7 - 0.5, 1, 1);
      }
    } else if (mat === 'tramp') {
      // springs under the bouncy band
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 1.2;
      for (const f of [0.18, 0.5, 0.82]) {
        const bx = x1 + (x2 - x1) * f, by = y1 + (y2 - y1) * f;
        ctx.beginPath(); ctx.moveTo(bx, by);
        for (let k = 1; k <= 4; k++) { const z = k % 2 ? 2.5 : -2.5; ctx.lineTo(bx + nx * k * 2.2 + ux * z, by + ny * k * 2.2 + uy * z); }
        ctx.stroke();
      }
      segPath(x1, y1, x2, y2); ctx.lineWidth = 6; ctx.strokeStyle = '#1e293b'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 2.5; ctx.strokeStyle = '#8b5cf6'; ctx.stroke();
      ctx.fillStyle = '#facc15';
      ctx.beginPath(); ctx.arc(x1, y1, 3.5, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(x2, y2, 3.5, 0, 7); ctx.fill();
    } else if (mat === 'bumper') {
      segPath(x1, y1, x2, y2); ctx.lineWidth = 6; ctx.strokeStyle = '#be185d'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 2.5; ctx.strokeStyle = '#f9a8d4'; ctx.stroke();
    } else if (mat === 'spike') {
      ctx.fillStyle = '#94a3b8'; ctx.strokeStyle = '#475569'; ctx.lineWidth = 0.8;
      for (let d = 4; d < len - 2; d += 8) {
        for (const sd of [1, -1]) {
          ctx.beginPath();
          ctx.moveTo(x1 + ux * (d - 3.5), y1 + uy * (d - 3.5));
          ctx.lineTo(x1 + ux * d + nx * 7 * sd, y1 + uy * d + ny * 7 * sd);
          ctx.lineTo(x1 + ux * (d + 3.5), y1 + uy * (d + 3.5));
          ctx.fill(); ctx.stroke();
        }
      }
      segPath(x1, y1, x2, y2); ctx.lineWidth = 3; ctx.strokeStyle = '#475569'; ctx.stroke();
    } else {
      segPath(x1, y1, x2, y2); ctx.lineWidth = 7; ctx.strokeStyle = '#334155'; ctx.stroke();
      segPath(x1, y1, x2, y2); ctx.lineWidth = 3.5; ctx.strokeStyle = '#64748b'; ctx.stroke();
    }
  }

  function drawGoal(g, space) {
    if (g.type === 'ring') {
      ctx.save(); ctx.translate(g.x, g.y);
      const r = g.r || 16;
      const grd = ctx.createRadialGradient(0, 0, 2, 0, 0, r);
      grd.addColorStop(0, 'rgba(250,204,21,.9)'); grd.addColorStop(1, 'rgba(250,204,21,.05)');
      ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fill();
      ctx.rotate(now * 2);
      ctx.setLineDash([5, 4]); ctx.lineWidth = 2.5; ctx.strokeStyle = '#fde047';
      ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      ctx.restore();
      text('GOAL', g.x, g.y - (g.r || 16) - 6, 7, '#fde047', 'center', 900);
      return;
    }
    const l = g.x - g.w / 2, r = g.x + g.w / 2, top = g.down ? g.y + g.h : g.y - g.h;
    const y0 = Math.min(top, g.y), hh = Math.abs(g.y - top);
    ctx.fillStyle = 'rgba(34,197,94,.18)'; ctx.fillRect(l, y0, g.w, hh);
    // net
    ctx.strokeStyle = 'rgba(21,128,61,.35)'; ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = l + 6; x < r; x += 7) { ctx.moveTo(x, y0); ctx.lineTo(x, y0 + hh); }
    for (let y = y0 + 6; y < y0 + hh; y += 7) { ctx.moveTo(l, y); ctx.lineTo(r, y); }
    ctx.stroke();
    ctx.lineWidth = 7; ctx.strokeStyle = '#15803d';
    ctx.beginPath(); ctx.moveTo(l, top); ctx.lineTo(l, g.y); ctx.lineTo(r, g.y); ctx.lineTo(r, top); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = '#4ade80'; ctx.stroke();
    // little flag
    const fx = r, fy = top + (g.down ? 4 : -4);
    ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.2;
    segPath(fx, top, fx, top + (g.down ? 16 : -16)); ctx.stroke();
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); const fy2 = top + (g.down ? 16 : -16);
    ctx.moveTo(fx, fy2); ctx.lineTo(fx + 11 + Math.sin(now * 5) * 1.5, fy2 + (g.down ? -3 : 3)); ctx.lineTo(fx, fy2 + (g.down ? -6 : 6)); ctx.fill();
    void fy; void space;
  }

  function drawFan(f, ghost) {
    ctx.save(); ctx.translate(f.x, f.y); ctx.rotate(f.a);
    if (f.on !== false && !ghost) {
      // moving air
      ctx.strokeStyle = 'rgba(56,189,248,.45)'; ctx.lineWidth = 1.3;
      const reach = f.reach || P.PIECES.fan.reach, wd = (f.width || P.PIECES.fan.width) / 2;
      for (let i = 0; i < 6; i++) {
        const o = ((now * 140 + i * 37) % reach), side = (((i * 13) % 5) - 2) / 2 * wd * 0.8;
        ctx.globalAlpha = 1 - o / reach;
        segPath(10 + o, side, 22 + o, side); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    } else if (!ghost && f.reach) {
      ctx.strokeStyle = 'rgba(56,189,248,.18)'; ctx.setLineDash([3, 4]); ctx.lineWidth = 1;
      rr(8, -(f.width || 48) / 2, f.reach, f.width || 48, 6); ctx.stroke(); ctx.setLineDash([]);
    }
    // housing
    rr(-8, -14, 14, 28, 4); ctx.fillStyle = '#0f766e'; ctx.fill();
    rr(-6, -12, 10, 24, 3); ctx.fillStyle = '#14b8a6'; ctx.fill();
    // blades (seen from the side as a spinning blur)
    const sp = (f.spin != null ? f.spin : now * 20);
    ctx.fillStyle = '#e2e8f0';
    for (let k = 0; k < 3; k++) {
      const h = Math.sin(sp + k * 2.1) * 11;
      rr(5, Math.min(0, h) - 1, 3.5, Math.abs(h) + 2, 1.5); ctx.fill();
    }
    ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(6.5, 0, 2.2, 0, 7); ctx.fill();
    ctx.restore();
  }

  function drawMagnet(m, on) {
    ctx.save(); ctx.translate(m.x, m.y);
    if (on !== false) {
      ctx.strokeStyle = 'rgba(239,68,68,.25)'; ctx.lineWidth = 1;
      for (let i = 0; i < 3; i++) {
        const r = 14 + ((now * 30 + i * 22) % 66);
        ctx.globalAlpha = 1 - (r - 14) / 66;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    ctx.lineCap = 'butt';
    ctx.lineWidth = 6; ctx.strokeStyle = '#dc2626';
    ctx.beginPath(); ctx.arc(0, 1, 6.5, Math.PI, 0, true); ctx.stroke();
    ctx.lineWidth = 6; ctx.strokeStyle = '#e5e7eb';
    segPath(-6.5, 1, -6.5, -6); ctx.stroke(); segPath(6.5, 1, 6.5, -6); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.restore();
  }

  function drawBumper(c) {
    const fl = c.flash || 0;
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r + fl * 2.5, 0, 7);
    ctx.fillStyle = fl > 0.1 ? '#fef08a' : '#ec4899'; ctx.fill();
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#9d174d'; ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y, c.r * 0.55, 0, 7); ctx.fillStyle = '#fbcfe8'; ctx.fill();
    ctx.beginPath(); ctx.arc(c.x - c.r * 0.3, c.y - c.r * 0.35, c.r * 0.22, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
  }

  function drawSeesaw(sw) {
    ctx.fillStyle = '#475569';
    ctx.beginPath(); ctx.moveTo(sw.x, sw.y + 2); ctx.lineTo(sw.x - 10, sw.y + 17); ctx.lineTo(sw.x + 10, sw.y + 17); ctx.closePath(); ctx.fill();
    ctx.save(); ctx.translate(sw.x, sw.y); ctx.rotate(sw.ang);
    rr(-sw.half, -4, sw.half * 2, 8, 3); ctx.fillStyle = '#7c4a1e'; ctx.fill();
    rr(-sw.half + 1, -3, sw.half * 2 - 2, 5, 2.5); ctx.fillStyle = '#e0a060'; ctx.fill();
    ctx.restore();
    ctx.fillStyle = '#facc15'; ctx.beginPath(); ctx.arc(sw.x, sw.y, 2.5, 0, 7); ctx.fill();
  }

  function drawBall(b) {
    const { x, y, r } = b;
    ctx.save(); ctx.translate(x, y);
    if (b.kind === 'balloon') {
      ctx.strokeStyle = '#64748b'; ctx.lineWidth = 0.8;
      ctx.beginPath(); ctx.moveTo(0, r + 2); ctx.quadraticCurveTo(Math.sin(now * 4) * 4, r + 9, Math.sin(now * 3) * 2, r + 16); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, 0, r * 0.9, r, 0, 0, 7);
      const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
      g.addColorStop(0, '#fda4af'); g.addColorStop(1, '#e11d48');
      ctx.fillStyle = g; ctx.fill();
      ctx.fillStyle = '#be123c'; ctx.beginPath(); ctx.moveTo(-2, r); ctx.lineTo(2, r); ctx.lineTo(0, r + 3); ctx.fill();
      ctx.restore(); return;
    }
    const looks = {
      red: ['#fca5a5', '#dc2626'], bowl: ['#64748b', '#0f172a'], beach: ['#ffffff', '#e2e8f0'], steel: ['#f8fafc', '#64748b'],
      super: ['#f0abfc', '#9333ea'], clay: ['#fdba74', '#c2410c'],
    }[b.kind] || ['#fca5a5', '#dc2626'];
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, 1, 0, 0, r);
    g.addColorStop(0, looks[0]); g.addColorStop(1, looks[1]);
    ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.save(); ctx.clip();
    ctx.rotate(b.ang || 0);
    if (b.kind === 'red') { ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fillRect(-r, -1.3, r * 2, 2.6); }
    else if (b.kind === 'bowl') {
      ctx.fillStyle = '#020617';
      [[-2.5, -3.5], [2, -4], [0, 0.5]].forEach(([hx, hy]) => { ctx.beginPath(); ctx.arc(hx, hy, 1.5, 0, 7); ctx.fill(); });
    } else if (b.kind === 'beach') {
      const cols = ['#ef4444', '#facc15', '#3b82f6'];
      for (let k = 0; k < 3; k++) {
        ctx.fillStyle = cols[k]; ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.arc(0, 0, r, k * 2.094, k * 2.094 + 1.05); ctx.closePath(); ctx.fill();
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 2.5, 0, 7); ctx.fill();
    } else if (b.kind === 'super') {
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.55, 0, 4); ctx.stroke();
    } else if (b.kind === 'clay') {
      ctx.fillStyle = 'rgba(124,45,18,.35)';
      ctx.beginPath(); ctx.arc(2, 2, 2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(-3, -1, 1.4, 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.4, r * 0.25, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(15,23,42,.35)'; ctx.beginPath(); ctx.arc(0, 0, r, 0, 7); ctx.stroke();
    ctx.restore();
    if (b.hero && b.alive !== false && b.kind !== 'balloon' && b.showHero) {
      ctx.strokeStyle = 'rgba(250,204,21,.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([2, 2]);
      ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  function drawPipe(d) {
    const r = (P.BALLS[d.kind] || P.BALLS.red).r;
    if (d.vx || d.vy) {
      // a cannon pointing the way the ball will fly
      const a = Math.atan2(d.vy || 0, d.vx || 0);
      ctx.save(); ctx.translate(d.x, d.y); ctx.rotate(a);
      rr(-14, -r - 3, 22, r * 2 + 6, 5); ctx.fillStyle = '#475569'; ctx.fill();
      rr(4, -r - 4, 6, r * 2 + 8, 2); ctx.fillStyle = '#94a3b8'; ctx.fill();
      ctx.restore();
      return;
    }
    const w = r * 2 + 8;
    rr(d.x - w / 2, TOP - 4, w, d.y - TOP + 2, 3); ctx.fillStyle = '#64748b'; ctx.fill();
    rr(d.x - w / 2 + 2, TOP - 4, 4, d.y - TOP, 2); ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.fill();
    rr(d.x - w / 2 - 3, d.y - 6, w + 6, 7, 2); ctx.fillStyle = '#475569'; ctx.fill();
  }

  function drawStarsInWorld(stars) {
    stars.forEach((s, i) => {
      if (s.got) return;
      const bob = Math.sin(now * 3 + i) * 1.5;
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#fde047';
      ctx.beginPath(); ctx.arc(s.x, s.y + bob, 9, 0, 7); ctx.fill(); ctx.globalAlpha = 1;
      drawStar(s.x, s.y + bob, 7, true, Math.sin(now * 2 + i) * 0.3);
    });
  }

  // draws a running world (or a level that is not running yet)
  function drawWorld(w, opts) {
    opts = opts || {};
    for (const s of w.segs) if (!s.goal && !s.fan) drawSeg(s);
    for (const g of w.goals) drawGoal(g);
    for (const sw of w.seesaws) drawSeesaw(sw);
    for (const f of w.fans) drawFan(f);
    for (const c of w.circles) {
      if (c.magnet) continue;
      if (c.mat === 'bumper') { drawBumper(c); if (c.flash) c.flash = Math.max(0, c.flash - 0.05); }
      else { ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 7); ctx.fillStyle = '#475569'; ctx.fill(); }
    }
    for (const m of w.magnets) drawMagnet(m, m.on);
    drawStarsInWorld(w.stars);
    if (w.trails) {
      for (const b of w.balls) {
        ctx.fillStyle = b.kind === 'bowl' ? '#334155' : b.kind === 'steel' ? '#64748b' : '#ef4444';
        for (let i = 0; i < b.trail.length; i += 2) { ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.arc(b.trail[i], b.trail[i + 1], 1.6, 0, 7); ctx.fill(); }
        ctx.globalAlpha = 1;
      }
    }
    for (const b of w.balls) {
      if (!b.alive) continue;
      if (b.tether) {
        ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.3;
        segPath(b.tether.x, b.tether.y, b.x, b.y); ctx.stroke();
        ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(b.tether.x, b.tether.y, 3, 0, 7); ctx.fill();
      }
      b.showHero = opts.heroRing;
      drawBall(b);
      if (b.label) {
        ctx.font = font(12, 900);
        const tw = ctx.measureText(b.label).width + 10;
        rr(b.x - tw / 2, b.y - b.r - 21, tw, 16, 7); ctx.fillStyle = 'rgba(15,23,42,.78)'; ctx.fill();
        text(b.label, b.x, b.y - b.r - 12.5, 12, '#fff', 'center', 900);
      }
    }
  }

  // ---------------------------------------------------------------- Professor Newt
  function drawNewt(x, y, s, mood) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    const talking = talkT > 0 && mood !== 'quiet';
    const hop = mood === 'happy' ? -Math.abs(Math.sin(now * 8)) * 4 : Math.sin(now * 2.2) * 0.8;
    ctx.translate(0, hop);
    // tail
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(6, -6); ctx.quadraticCurveTo(22, -2 + Math.sin(now * 3) * 3, 26, -14); ctx.stroke();
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 4; ctx.stroke();
    // feet
    ctx.fillStyle = '#16a34a';
    ctx.beginPath(); ctx.ellipse(-7, -1.5, 5, 2.5, 0, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.ellipse(7, -1.5, 5, 2.5, 0, 0, 7); ctx.fill();
    // lab coat body
    ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#cbd5e1'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-10, -26); ctx.lineTo(10, -26); ctx.lineTo(13, -3); ctx.lineTo(-13, -3); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#4ade80'; ctx.beginPath(); ctx.moveTo(-4, -26); ctx.lineTo(4, -26); ctx.lineTo(0, -15); ctx.fill();
    ctx.strokeStyle = '#cbd5e1'; segPath(0, -15, 0, -4); ctx.stroke();
    ctx.fillStyle = '#3b82f6'; ctx.fillRect(4, -14, 5, 4); // pocket
    ctx.fillStyle = '#ef4444'; ctx.fillRect(5, -17, 1.2, 4); ctx.fillStyle = '#f59e0b'; ctx.fillRect(7, -17, 1.2, 4);
    // arms
    const wave = mood === 'happy' || mood === 'wave' ? Math.sin(now * 10) * 0.5 : 0;
    ctx.strokeStyle = '#22c55e'; ctx.lineWidth = 3.5;
    ctx.beginPath(); ctx.moveTo(-10, -22); ctx.lineTo(-16, -14); ctx.stroke();
    ctx.save(); ctx.translate(10, -22); ctx.rotate(-1.9 + wave + (talking ? Math.sin(now * 5) * 0.25 : 0.9));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(9, 0); ctx.stroke();
    ctx.fillStyle = '#22c55e'; ctx.beginPath(); ctx.arc(10, 0, 2.5, 0, 7); ctx.fill();
    ctx.restore();
    // head
    ctx.fillStyle = '#4ade80';
    ctx.beginPath(); ctx.ellipse(0, -36, 15, 12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = '#16a34a'; ctx.lineWidth = 1.2; ctx.stroke();
    // spots
    ctx.fillStyle = '#facc15';
    ctx.beginPath(); ctx.arc(-9, -40, 1.6, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(10, -38, 1.3, 0, 7); ctx.fill();
    // goggles pushed up
    ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(0, -44, 14, 4, 0, Math.PI, 0); ctx.stroke();
    for (const gx of [-5, 5]) { ctx.beginPath(); ctx.arc(gx, -47, 4, 0, 7); ctx.fillStyle = 'rgba(125,211,252,.85)'; ctx.fill(); ctx.strokeStyle = '#334155'; ctx.lineWidth = 1.3; ctx.stroke(); }
    // eyes
    const blink = (now % 4) < 0.12;
    for (const ex of [-6, 6]) {
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(ex, -37, 4.2, blink ? 0.6 : 4.6, 0, 0, 7); ctx.fill();
      if (!blink) { ctx.fillStyle = '#0f172a'; ctx.beginPath(); ctx.arc(ex + 0.8, -36.5, 2.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex + 1.6, -37.6, 0.8, 0, 7); ctx.fill(); }
    }
    // cheeks + mouth
    ctx.fillStyle = 'rgba(244,114,182,.5)';
    ctx.beginPath(); ctx.arc(-10, -31, 2.2, 0, 7); ctx.fill(); ctx.beginPath(); ctx.arc(10, -31, 2.2, 0, 7); ctx.fill();
    if (talking && Math.sin(now * 18) > -0.2) {
      ctx.fillStyle = '#7f1d1d'; ctx.beginPath(); ctx.ellipse(0, -29.5, 3.2, 2.2 + Math.sin(now * 18), 0, 0, 7); ctx.fill();
    } else {
      ctx.strokeStyle = '#14532d'; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.arc(0, mood === 'happy' ? -32 : -31, mood === 'happy' ? 4.5 : 3.5, 0.3, Math.PI - 0.3); ctx.stroke();
    }
    ctx.restore();
  }

  function bubble(x, y, w, lines, px, tail, color) {
    const lh = px * 1.3, h = lines.length * lh + 12;
    glass(x, y, w, h, 10, color || 'rgba(255,255,255,.96)');
    if (tail) {
      ctx.fillStyle = color || 'rgba(255,255,255,.96)';
      ctx.beginPath(); ctx.moveTo(tail[0] - 6, y + h - 1); ctx.lineTo(tail[0] + 6, y + h - 1); ctx.lineTo(tail[0] - 2, y + h + 9); ctx.fill();
    }
    lines.forEach((l, i) => text(l, x + 10, y + 6 + lh / 2 + i * lh, px, '#1e293b', 'left', 700));
    return h;
  }

  // ---------------------------------------------------------------- piece helpers
  function pieceSegs(p) {
    const def = P.PIECES[p.kind];
    if (def.len && p.kind !== 'seesaw') { const l = P.lineOf(p.x, p.y, p.a, def.len); return { x1: l[0], y1: l[1], x2: l[2], y2: l[3], mat: def.mat }; }
    return null;
  }
  function drawPiece(p, sel, ghost) {
    if (ghost) ctx.globalAlpha = 0.45 + 0.25 * Math.sin(now * 5);
    const s = pieceSegs(p);
    if (s) drawSeg(s);
    else if (p.kind === 'bumper') drawBumper({ x: p.x, y: p.y, r: P.PIECES.bumper.r });
    else if (p.kind === 'fan') drawFan({ x: p.x, y: p.y, a: p.a, on: !ghost, reach: P.PIECES.fan.reach, width: P.PIECES.fan.width });
    else if (p.kind === 'magnet') drawMagnet(p, true);
    else if (p.kind === 'seesaw') drawSeesaw({ x: p.x, y: p.y, half: P.PIECES.seesaw.len, ang: 0 });
    ctx.globalAlpha = 1;
    if (sel) {
      ctx.setLineDash([3, 3]); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f59e0b';
      const rad = s ? P.PIECES[p.kind].len / 2 + 6 : 18;
      ctx.beginPath(); ctx.arc(p.x, p.y, rad, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
    if (ghost) {
      text('TRY HERE', p.x, p.y - 16, 7, '#b45309', 'center', 900);
    }
  }
  function hitPiece(list, x, y) {
    for (let i = list.length - 1; i >= 0; i--) {
      const p = list[i], s = pieceSegs(p);
      if (s) {
        const ex = s.x2 - s.x1, ey = s.y2 - s.y1, L2 = ex * ex + ey * ey;
        const u = clamp(((x - s.x1) * ex + (y - s.y1) * ey) / L2, 0, 1);
        if (Math.hypot(x - (s.x1 + ex * u), y - (s.y1 + ey * u)) < 12) return p;
      } else if (Math.hypot(x - p.x, y - p.y) < (p.kind === 'seesaw' ? 30 : 17)) return p;
    }
    return null;
  }
  function rotatable(kind) { return !!P.PIECES[kind].step && kind !== 'bumper' && kind !== 'magnet' && kind !== 'seesaw'; }
  function turn(p, dir) {
    const step = P.rad(P.PIECES[p.kind].step || 15);
    p.a += step * dir;
    if (p.kind === 'fan') { p.a = ((p.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2); }
    else { while (p.a > Math.PI / 2 + 0.01) p.a -= Math.PI; while (p.a <= -Math.PI / 2 + 0.01) p.a += Math.PI; }
    sfx.turn();
  }
  function startAngle(kind) { return kind === 'fan' ? 0 : rotatable(kind) ? P.rad(15) : 0; }

  // tray icons
  function drawIcon(kind, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (P.BALLS[kind]) drawBall({ kind, x: 0, y: 0, r: Math.min(10, P.BALLS[kind].r + 1), ang: 0 });
    else if (P.PIECES[kind]) {
      const d = P.PIECES[kind];
      if (d.len && kind !== 'seesaw') drawSeg({ x1: -13, y1: -5, x2: 13, y2: 5, mat: d.mat });
      else if (kind === 'bumper') drawBumper({ x: 0, y: 0, r: 9 });
      else if (kind === 'fan') { ctx.scale(0.8, 0.8); drawFan({ x: -4, y: 0, a: 0, on: false }); }
      else if (kind === 'magnet') { ctx.scale(1.2, 1.2); drawMagnet({ x: 0, y: 2 }, false); }
      else if (kind === 'seesaw') { ctx.scale(0.4, 0.4); drawSeesaw({ x: 0, y: -4, half: 40, ang: -0.2 }); }
    }
    ctx.restore();
  }

  // ---------------------------------------------------------------- input
  const ptr = { x: 0, y: 0, down: false, vx: 0, vy: 0, t: 0 };
  let cursor = { on: false, x: 240, y: 130, held: false };
  function toLocal(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault(); audio();
    try { canvas.setPointerCapture(e.pointerId); } catch (er) { /* */ }
    const p = toLocal(e);
    navMode = false; cursor.on = false;
    pointerDown(p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => { const p = toLocal(e); pointerMove(p.x, p.y); });
  canvas.addEventListener('pointerup', (e) => { const p = toLocal(e); pointerUp(p.x, p.y); });
  canvas.addEventListener('pointercancel', (e) => { const p = toLocal(e); pointerUp(p.x, p.y); });

  function pointerDown(x, y) {
    ptr.x = x; ptr.y = y; ptr.down = true; ptr.vx = 0; ptr.vy = 0; ptr.t = performance.now();
    const b = hitBtn(x, y);
    if (b && b.act) { pressedId = b.id; return; }
    pressedId = null;
    const s = SCREENS[screen];
    if (s.down) s.down(x, y);
  }
  function pointerMove(x, y) {
    const t = performance.now(), dt = Math.max(1, t - ptr.t) / 1000;
    ptr.vx = ptr.vx * 0.5 + ((x - ptr.x) / dt) * 0.5; ptr.vy = ptr.vy * 0.5 + ((y - ptr.y) / dt) * 0.5;
    ptr.x = x; ptr.y = y; ptr.t = t;
    const s = SCREENS[screen];
    if (ptr.down && s.move) s.move(x, y);
  }
  function pointerUp(x, y) {
    if (!ptr.down) return;
    ptr.down = false;
    if (pressedId) {
      const b = hitBtn(x, y), id = pressedId;
      pressedId = null;
      if (b && b.id === id && b.act) { sfx.click(); b.act(); }
      return;
    }
    const s = SCREENS[screen];
    if (s.up) s.up(x, y);
  }

  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.repeat && !/Arrow/.test(e.key)) return;
    keys[e.key] = true;
    audio();
    if (handleKey(e.key)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    keys[e.key] = false;
    if ((e.key === 'Enter') && cursor.on && cursor.held) { cursor.held = false; pointerUp(cursor.x, cursor.y); }
  });
  function cursorScreen() { return screen === 'level' || screen === 'play'; }
  function handleKey(k) {
    if (howBox && !howBox.hidden) { if (k === 'Escape' || k === 'Enter' || k === ' ' || k === 'Backspace') closeHowTo(); return true; }
    const s = SCREENS[screen];
    if (s.key && s.key(k)) return true;
    if (k === 'Escape' || k === 'Backspace') { if (s.back) s.back(); return true; }
    if (cursorScreen()) {
      if (/^Arrow/.test(k)) { cursor.on = true; return true; }
      if (k === 'Enter' && !cursor.held) { cursor.on = true; cursor.held = true; pointerDown(cursor.x, cursor.y); return true; }
      return false;
    }
    if (k === 'ArrowLeft') { navMove(-1, 0); return true; }
    if (k === 'ArrowRight') { navMove(1, 0); return true; }
    if (k === 'ArrowUp') { navMove(0, -1); return true; }
    if (k === 'ArrowDown') { navMove(0, 1); return true; }
    if (k === 'Enter' || k === ' ') { if (!navMode) { navMode = true; navMove(1, 0); } else navPress(); return true; }
    return false;
  }
  function pollPad(dt) {
    if (!window.Pad360) return;
    Pad360.poll();
    const B = Pad360.BTN;
    if (howBox && !howBox.hidden) { if (Pad360.pressed(B.A) || Pad360.pressed(B.B) || Pad360.pressed(B.START)) closeHowTo(); return; }
    const s = SCREENS[screen];
    if (cursorScreen()) {
      let ax = Pad360.axis ? Pad360.axis(0) : 0, ay = Pad360.axis ? Pad360.axis(1) : 0;
      if (Math.abs(ax) < 0.2) ax = 0; if (Math.abs(ay) < 0.2) ay = 0;
      if (!ax && !ay) { ax = Pad360.dx(); ay = Pad360.dy(); }
      if (ax || ay) { cursor.on = true; cursor.x = clamp(cursor.x + ax * 190 * dt, 2, W - 2); cursor.y = clamp(cursor.y + ay * 190 * dt, 2, H - 2); if (cursor.held) pointerMove(cursor.x, cursor.y); }
      if (Pad360.pressed(B.A)) { cursor.on = true; cursor.held = true; pointerDown(cursor.x, cursor.y); }
      if (Pad360.released(B.A) && cursor.held) { cursor.held = false; pointerUp(cursor.x, cursor.y); }
      if (Pad360.pressed(B.LB)) handleKey('q');
      if (Pad360.pressed(B.RB)) handleKey('e');
      if (Pad360.pressed(B.X)) handleKey('Delete');
      if (Pad360.pressed(B.Y) || Pad360.pressed(B.START)) handleKey(' ');
      if (Pad360.pressed(B.B) || Pad360.pressed(B.BACK)) handleKey('Escape');
      return;
    }
    if (Pad360.dxPressed()) navMove(Pad360.dxPressed(), 0);
    if (Pad360.dyPressed()) navMove(0, Pad360.dyPressed());
    if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) { if (!navMode) { navMode = true; navMove(1, 0); } else navPress(); }
    if (Pad360.pressed(B.B) || Pad360.pressed(B.BACK)) { if (s.back) s.back(); }
  }
  function keyCursor(dt) {
    if (!cursorScreen()) return;
    let dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), dy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    if (dx || dy) {
      cursor.on = true;
      cursor.x = clamp(cursor.x + dx * 170 * dt, 2, W - 2); cursor.y = clamp(cursor.y + dy * 170 * dt, 2, H - 2);
      if (cursor.held) pointerMove(cursor.x, cursor.y);
    }
  }
  function drawCursor() {
    if (!cursor.on || !cursorScreen()) return;
    ctx.save(); ctx.translate(cursor.x, cursor.y);
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#1e293b'; ctx.lineWidth = 1.3;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 13); ctx.lineTo(3.5, 10); ctx.lineTo(6, 15); ctx.lineTo(8, 14); ctx.lineTo(5.5, 9); ctx.lineTo(10, 9); ctx.closePath();
    ctx.fill(); ctx.stroke();
    if (cursor.held) { ctx.strokeStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(0, 0, 6, 0, 7); ctx.stroke(); }
    ctx.restore();
  }

  // ---------------------------------------------------------------- screens
  let screen = 'title', now = 0;
  function go(name) {
    screen = name; pressedId = null; focusId = null; hush();
    const s = SCREENS[name];
    if (s.enter) s.enter();
  }
  function topBar(title, backAct, color) {
    const g = ctx.createLinearGradient(0, 0, 0, TOP);
    g.addColorStop(0, color || '#1e3a8a'); g.addColorStop(1, shade(color || '#1e3a8a'));
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, TOP);
    if (backAct) btn('back', 4, 3, 40, 15, '◀ BACK', { act: backAct, size: 7.5, r: 7 });
    if (title) outlined(title, W / 2, TOP / 2 + 0.5, 10.5, '#fff', 'rgba(15,23,42,.55)');
  }
  function shade(hex) {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.round(v * 0.7));
    return '#' + ((1 << 24) + (f(n >> 16 & 255) << 16) + (f(n >> 8 & 255) << 8) + f(n & 255)).toString(16).slice(1);
  }

  // ---------- title
  let attract = null;
  const ATTRACT = {
    segs: [[30, 150, 130, 190, 'wood'], [180, 225, 250, 225, 'tramp'], [330, 190, 440, 150, 'wood'], [0, 236, 480, 236, 'wall']],
    bumpers: [[430, 90, 12], [50, 100, 10]],
  };
  function newAttract() {
    attract = P.makeWorld(ATTRACT, [], {});
    attract.spawnT = 0;
  }
  const TITLE = {
    enter() { if (!attract) newAttract(); },
    draw(dt) {
      drawBackground(false, 0, 0, W, H);
      attract.spawnT -= dt;
      if (attract.spawnT <= 0) {
        const kinds = ['red', 'super', 'beach', 'steel', 'clay', 'red', 'bowl'];
        const k = kinds[(Math.random() * kinds.length) | 0];
        attract.balls.push(P.makeBall(k, 40 + Math.random() * 400, -10, (Math.random() - 0.5) * 60, 0));
        if (attract.balls.length > 14) attract.balls.shift();
        attract.spawnT = 0.9;
      }
      stepWorld(attract, dt, true);
      drawWorld(attract);
      // logo
      ctx.save(); ctx.translate(W / 2, 62);
      const bounce = Math.abs(Math.sin(now * 3)) * 4;
      ctx.font = font(50, 900); ctx.textAlign = 'center';
      ctx.lineWidth = 10; ctx.strokeStyle = '#1e1b4b'; ctx.strokeText('BOING LAB', 0, -bounce);
      const g = ctx.createLinearGradient(0, -24, 0, 22);
      g.addColorStop(0, '#fde047'); g.addColorStop(0.5, '#fb923c'); g.addColorStop(1, '#ef4444');
      ctx.fillStyle = g; ctx.fillText('BOING LAB', 0, -bounce);
      ctx.restore();
      text('Learn how things move with Professor Newt!', W / 2, 98, 11, '#1e3a8a', 'center', 800);
      drawNewt(70, 228, 1.25, 'wave');
      const by = 118;
      btn('play', 165, by, 150, 30, 'LET\'S LEARN!', { act: () => go('labs'), color: '#22c55e', edge: '#15803d', size: 14 });
      btn('pg', 165, by + 40, 150, 24, 'PLAYGROUND', { act: () => go('play'), color: '#3b82f6', edge: '#1e40af', size: 11 });
      btn('how', 165, by + 74, 72, 18, 'HOW TO PLAY', { act: openHowTo, size: 7.5, color: '#fde047', text: '#713f12', edge: '#a16207' });
      btn('voice', 243, by + 74, 72, 18, save.voice ? '🔊 VOICE: ON' : '🔈 VOICE: OFF', {
        act: () => { save.voice = !save.voice; persist(); if (save.voice) say('I will read things out loud for you!'); else hush(); }, size: 7.5,
      });
      const st = allStars();
      if (st) { drawStar(400, 228, 8, true); text(st + ' / ' + LABS.length * 12, 412, 228.5, 10, '#1e3a8a', 'left', 900); }
    },
    back() { if (window.MickleMenu) MickleMenu.backToArcade(); },
  };

  // ---------- lab picker
  function drawLabIcon(icon, x, y, s) {
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    if (icon === 'apple') {
      ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(-4, 2, 9, 0, 7); ctx.arc(4, 2, 9, 0, 7); ctx.fill();
      ctx.strokeStyle = '#78350f'; ctx.lineWidth = 2; segPath(0, -6, 1, -12); ctx.stroke();
      ctx.fillStyle = '#16a34a'; ctx.beginPath(); ctx.ellipse(6, -10, 5, 2.5, -0.5, 0, 7); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.beginPath(); ctx.arc(-7, -2, 2.5, 0, 7); ctx.fill();
    } else if (icon === 'ramp') {
      drawSeg({ x1: -16, y1: -8, x2: 14, y2: 10, mat: 'ice' });
      drawBall({ kind: 'red', x: -8, y: -12, r: 6, ang: 0 });
    } else if (icon === 'spring') {
      drawSeg({ x1: -14, y1: 10, x2: 14, y2: 10, mat: 'tramp' });
      drawBall({ kind: 'super', x: 0, y: -8 + Math.abs(Math.sin(now * 4)) * -4, r: 6, ang: 0 });
    } else if (icon === 'bowl') {
      drawBall({ kind: 'bowl', x: -5, y: 2, r: 10, ang: 0.5 });
      drawBall({ kind: 'red', x: 11, y: 6, r: 6, ang: 0 });
    } else if (icon === 'magnet') {
      ctx.scale(1.3, 1.3); drawMagnet({ x: 0, y: 3 }, false);
    } else if (icon === 'planet') {
      ctx.fillStyle = '#818cf8'; ctx.beginPath(); ctx.arc(0, 0, 10, 0, 7); ctx.fill();
      ctx.strokeStyle = '#fde047'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(0, 0, 17, 5, -0.35, 0, 7); ctx.stroke();
      ctx.fillStyle = '#c7d2fe'; ctx.beginPath(); ctx.arc(-3, -3, 3, 0, 7); ctx.fill();
    } else if (icon === 'play') {
      drawSeg({ x1: -16, y1: 4, x2: 2, y2: 12, mat: 'wood' });
      drawBumper({ x: 10, y: -4, r: 6 });
      drawBall({ kind: 'beach', x: -6, y: -8, r: 7, ang: now });
    }
    ctx.restore();
  }
  const LABSCR = {
    draw() {
      drawBackground(false, 0, 0, W, H);
      topBar('PICK A LAB', () => go('title'));
      const cw = 106, ch = 100, gap = 10;
      const items = LABS.map((lab, i) => ({ lab, i })).concat([{ play: true }]);
      items.forEach((it, k) => {
        const row = k < 4 ? 0 : 1, col = row ? k - 4 : k;
        const perRow = row ? 3 : 4;
        const x0 = (W - (perRow * cw + (perRow - 1) * gap)) / 2;
        const x = x0 + col * (cw + gap), y = 32 + row * (ch + 10);
        if (it.play) {
          btn('pg', x, y, cw, ch, '', {
            act: () => go('play'), color: '#ffffff', draw: (bx, by) => {
              rr(bx, by, cw, 22, 10); ctx.fillStyle = '#3b82f6'; ctx.fill(); ctx.fillRect(bx, by + 12, cw, 10);
              text('PLAYGROUND', bx + cw / 2, by + 11.5, 10, '#fff', 'center', 900);
              drawLabIcon('play', bx + cw / 2, by + 52, 1.4);
              text('Build anything!', bx + cw / 2, by + 84, 8.5, '#475569', 'center', 800);
            },
          });
          return;
        }
        const { lab, i } = it;
        btn('lab' + i, x, y, cw, ch, '', {
          act: () => { hubLab = i; go('hub'); }, color: '#ffffff',
          draw: (bx, by) => {
            rr(bx, by, cw, 22, 10); ctx.fillStyle = lab.color; ctx.fill(); ctx.fillRect(bx, by + 12, cw, 10);
            text((i + 1) + '. ' + lab.name, bx + cw / 2, by + 11.5, 9.5, '#fff', 'center', 900);
            drawLabIcon(lab.icon, bx + cw / 2, by + 50, 1.4);
            text(lab.sub, bx + cw / 2, by + 77, 8, '#475569', 'center', 800);
            drawStar(bx + cw / 2 - 14, by + 90, 5, labStars(i) > 0);
            text(labStars(i) + ' / 12', bx + cw / 2 - 6, by + 90.5, 8, '#334155', 'left', 900);
          },
        });
      });
    },
    back() { go('title'); },
  };

  // ---------- lab hub
  let hubLab = 0;
  function drawThumb(level, x, y, w, h, space) {
    ctx.save();
    rr(x, y, w, h, 6); ctx.clip();
    const s = w / W;
    ctx.translate(x, y - TOP * s); ctx.scale(s, s);
    drawBackground(space);
    const wd = P.makeWorld(level, []);
    for (const s2 of wd.segs) if (!s2.goal && !s2.fan) drawSeg(s2);
    for (const g of wd.goals) drawGoal(g);
    for (const sw of wd.seesaws) drawSeesaw(sw);
    for (const f of wd.fans) drawFan(f);
    for (const c of wd.circles) if (c.mat === 'bumper') drawBumper(c);
    for (const d of level.drops || []) drawPipe(d);
    for (const b of wd.balls) {
      if (b.tether) { ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.5; segPath(b.tether.x, b.tether.y, b.x, b.y); ctx.stroke(); }
      drawBall(b);
    }
    ctx.restore();
  }
  const HUB = {
    draw() {
      const lab = LABS[hubLab];
      drawBackground(lab.space, 0, 0, W, H);
      topBar((hubLab + 1) + '. ' + lab.name, () => go('labs'), lab.color);
      // step 1 + 2
      const learned = save.learned[hubLab], guessed = save.guessed[hubLab];
      btn('learn', 12, 32, 150, 62, '', {
        act: () => { learnLab = hubLab; go('learn'); }, glow: !learned,
        draw: (bx, by) => {
          text('1', bx + 16, by + 18, 16, lab.color, 'center', 900);
          text('LEARN', bx + 32, by + 18, 14, '#1e293b', 'left', 900);
          text('Professor Newt shows you', bx + 12, by + 38, 8, '#475569', 'left', 700);
          text('how it works.', bx + 12, by + 49, 8, '#475569', 'left', 700);
          if (learned) text('✔', bx + 136, by + 16, 13, '#16a34a', 'center', 900);
        },
      });
      btn('guess', 12, 104, 150, 62, '', {
        act: () => { learnLab = hubLab; go('predict'); }, glow: learned && !guessed,
        draw: (bx, by) => {
          text('2', bx + 16, by + 18, 16, lab.color, 'center', 900);
          text('WHAT WILL', bx + 32, by + 13, 11, '#1e293b', 'left', 900);
          text('HAPPEN?', bx + 32, by + 26, 11, '#1e293b', 'left', 900);
          text('Make a guess, then watch!', bx + 12, by + 45, 8, '#475569', 'left', 700);
          if (guessed) text('✔', bx + 136, by + 16, 13, '#16a34a', 'center', 900);
        },
      });
      drawNewt(70, 236, 0.95, 'wave');
      // step 3 puzzles
      glass(176, 30, 294, 200, 12, 'rgba(255,255,255,.55)');
      text('3', 192, 44, 15, lab.color, 'center', 900);
      text('PUZZLES', 204, 44, 12, '#1e293b', 'left', 900);
      text('Use what you learned!', 290, 44.5, 8, '#475569', 'left', 700);
      lab.levels.forEach((lv, j) => {
        const x = 184 + (j % 2) * 142, y = 56 + Math.floor(j / 2) * 86;
        btn('lv' + j, x, y, 136, 80, '', {
          act: () => startLevel(hubLab, j), glow: guessed && j === firstUnsolved(hubLab),
          draw: (bx, by) => {
            drawThumb(lv, bx + 4, by + 4, 128, 57, lab.space);
            const name = (j + 1) + '. ' + lv.name;
            ctx.font = font(8.5, 900);
            const fs = Math.min(8.5, 8.5 * 88 / ctx.measureText(name).width);
            text(name, bx + 7, by + 70, fs, '#1e293b', 'left', 900);
            const st = save.stars[starKey(hubLab, j)] || 0;
            for (let k = 0; k < 3; k++) drawStar(bx + 104 + k * 10, by + 70, 4.2, k < st);
          },
        });
      });
    },
    back() { go('labs'); },
  };
  function firstUnsolved(li) { const n = LABS[li].levels.findIndex((_, j) => !save.stars[starKey(li, j)]); return n; }

  // ---------- demo panel (used by LEARN and WHAT WILL HAPPEN?)
  let demo = null;
  function makeDemo(def, frozen) {
    const w = P.makeWorld(Object.assign({ bounds: false }, def), [], { trails: !!def.trails, gravity: def.g });
    demo = { def, w, t: 0, frozen: !!frozen };
  }
  function drawDemo(x, y, w, h, dt, space) {
    if (!demo) return;
    if (!demo.frozen) {
      demo.t += dt;
      stepWorld(demo.w, dt, true);
      const loop = demo.def.loop;
      if (loop && demo.t > loop + 0.8) makeDemo(demo.def);
    }
    ctx.save();
    rr(x, y, w, h, 10); ctx.clip();
    const s = w / W;
    ctx.translate(x, y + h / 2 - (H / 2) * s - 0); ctx.scale(s, s);
    drawBackground(space || demo.def.g === 0, 0, 0, W, H);
    drawWorld(demo.w);
    ctx.restore();
    rr(x, y, w, h, 10); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(30,58,138,.35)'; ctx.stroke();
  }

  // ---------- LEARN
  let learnLab = 0, learnCard = 0;
  const LEARN = {
    enter() { learnCard = 0; this.show(); },
    show() { const c = LABS[learnLab].learn[learnCard]; makeDemo(c.demo); say(c.say); },
    draw(dt) {
      const lab = LABS[learnLab], cards = lab.learn, c = cards[learnCard];
      drawBackground(false, 0, 0, W, H);
      topBar('LEARN: ' + lab.name, () => go('hub'), lab.color);
      drawDemo(10, 30, 290, 163, dt, lab.space);
      text('tap the picture to watch again', 155, 202, 7.5, '#64748b', 'center', 700);
      const lines = wrap(c.say, 150, 11);
      const bh = bubble(312, 32, 162, lines, 11, [350]);
      drawNewt(352, Math.min(236, 32 + bh + 72), 1.15, 'talk');
      // dots
      cards.forEach((_, k) => { ctx.beginPath(); ctx.arc(155 - (cards.length - 1) * 6 + k * 12, 218, 4, 0, 7); ctx.fillStyle = k === learnCard ? lab.color : 'rgba(100,116,139,.35)'; ctx.fill(); });
      btn('prev', 12, 238, 70, 24, '◀ BACK', { act: () => this.prev(), disabled: learnCard === 0, size: 10 });
      btn('hear', 92, 238, 34, 24, '🔊', { act: () => say(c.say), size: 12 });
      btn('replay', 136, 238, 70, 24, '↻ AGAIN', { act: () => makeDemo(c.demo), size: 10 });
      const last = learnCard === cards.length - 1;
      btn('next', 216, 238, 84, 24, last ? 'GUESS! ▶' : 'NEXT ▶', {
        act: () => this.next(), color: '#22c55e', edge: '#15803d', size: 11, glow: true,
      });
    },
    down(x, y) { if (x > 10 && x < 300 && y > 30 && y < 193) makeDemo(LABS[learnLab].learn[learnCard].demo); },
    next() {
      const cards = LABS[learnLab].learn;
      if (learnCard < cards.length - 1) { learnCard++; this.show(); }
      else { save.learned[learnLab] = true; persist(); go('predict'); }
    },
    prev() { if (learnCard > 0) { learnCard--; this.show(); } },
    key(k) {
      if (k === 'ArrowRight' && !navMode) { this.next(); return true; }
      if (k === 'ArrowLeft' && !navMode) { this.prev(); return true; }
      return false;
    },
    back() { go('hub'); },
  };

  // ---------- WHAT WILL HAPPEN?
  let guess = null;
  const PREDICT = {
    enter() {
      const p = LABS[learnLab].predict;
      guess = { pick: -1, t: 0, phase: 'ask' };
      makeDemo(p.demo, true);
      say(p.q);
    },
    draw(dt) {
      const lab = LABS[learnLab], p = lab.predict;
      drawBackground(false, 0, 0, W, H);
      topBar('WHAT WILL HAPPEN?', () => go('hub'), lab.color);
      if (guess.phase === 'watch') {
        guess.t += dt;
        if (guess.t > 4.2) {
          guess.phase = 'tell'; demo.frozen = true;
          const right = guess.pick === p.answer;
          if (right) { sfx.right(); confetti(); }
          say((right ? 'You got it! ' : 'Good guess! Here is what really happens. ') + p.why);
        }
      }
      drawDemo(10, 30, 290, 163, dt, lab.space);
      if (guess.phase === 'ask') {
        rr(110, 98, 90, 22, 11); ctx.fillStyle = 'rgba(15,23,42,.7)'; ctx.fill();
        text('? ? ?', 155, 109.5, 12, '#fde047', 'center', 900);
      }
      // the question / the answer
      let msg = p.q, col;
      if (guess.phase === 'watch') msg = 'Let\'s watch and see...';
      if (guess.phase === 'tell') {
        const right = guess.pick === p.answer;
        msg = (right ? 'YOU GOT IT! ' : 'GOOD GUESS! ') + p.why;
        col = right ? 'rgba(220,252,231,.97)' : 'rgba(254,249,195,.97)';
      }
      const lines = wrap(msg, 150, 10.5);
      const bh = bubble(312, 30, 162, lines, 10.5, [350], col);
      drawNewt(352, Math.min(236, 30 + bh + 70), 1.1, guess.phase === 'tell' && guess.pick === p.answer ? 'happy' : 'talk');
      // choices
      const cw = 92;
      p.choices.forEach((c, k) => {
        const x = 10 + k * (cw + 7), y = 202;
        let color = '#ffffff', edge;
        if (guess.phase !== 'ask') {
          if (k === guess.pick) { color = '#93c5fd'; edge = '#1d4ed8'; }
          if (guess.phase === 'tell' && k === p.answer) { color = '#22c55e'; edge = '#15803d'; }
        }
        btn('c' + k, x, y, cw, 26, c, {
          act: guess.phase === 'ask' ? () => this.pick(k) : null, color, edge, size: c.length > 12 ? 8.5 : 10,
          text: color === '#ffffff' || color === '#93c5fd' ? '#1e3a8a' : '#fff',
        });
      });
      if (guess.phase === 'tell') {
        btn('again', 312, 238, 70, 24, '↻ WATCH', { act: () => { guess.phase = 'watch'; guess.t = 0; makeDemo(p.demo); }, size: 10 });
        btn('puz', 390, 238, 84, 24, 'PUZZLES ▶', { act: () => { save.guessed[learnLab] = true; persist(); startLevel(learnLab, Math.max(0, firstUnsolved(learnLab))); }, color: '#22c55e', edge: '#15803d', size: 10, glow: true });
      } else if (guess.phase === 'ask') {
        btn('hear', 312, 238, 34, 24, '🔊', { act: () => say(p.q), size: 12 });
        text('Pick one!', 410, 250, 10, '#1e3a8a', 'center', 900);
      }
    },
    pick(k) { guess.pick = k; guess.phase = 'watch'; guess.t = 0; makeDemo(LABS[learnLab].predict.demo); hush(); sfx.go(); },
    back() { go('hub'); },
  };

  // ---------- running a world
  function stepWorld(w, dt, quiet, speed) {
    let acc = (w.acc || 0) + Math.min(dt, 1 / 20) * (speed || 1);
    let n = 0;
    while (acc >= P.DT && n < 24) { P.step(w); acc -= P.DT; n++; if (!quiet) handleEvents(w); else w.events.length = 0; }
    w.acc = acc;
  }
  function handleEvents(w) {
    for (const e of w.events) {
      if (e.type === 'bounce') {
        if (e.mat === 'tramp') { sfx.boing(e.speed); burst(e.x, e.y, 5, ['#c4b5fd', '#fff'], 60, 0.4, 1.5, 0); }
        else if (e.mat === 'bumper') sfx.ding();
        else { sfx.thunk(e.speed); if (e.speed > 220) burst(e.x, e.y, 4, ['#cbd5e1', '#fff'], 40, 0.35, 1.5, 0); }
      } else if (e.type === 'clack') sfx.clack(e.speed);
      else if (e.type === 'star') { sfx.star(e.i); burst(e.x, e.y, 16, ['#fde047', '#fbbf24', '#fff'], 110, 0.7, 2); }
      else if (e.type === 'pop') { sfx.pop(); burst(e.x, e.y, 14, ['#e11d48', '#fda4af'], 120, 0.5, 2); }
      else if (e.type === 'home') { sfx.home(); burst(e.x, e.y, 18, ['#4ade80', '#fde047', '#fff'], 120, 0.8, 2); }
    }
    w.events.length = 0;
  }

  // ---------- a puzzle level
  const LV = { li: 0, j: 0, def: null, placed: [], sel: null, drag: null, mode: 'build', world: null, fails: 0, path: [], tip: true, msg: '', msgT: 0, hints: 0, runT: 0, stars: 0 };
  function startLevel(li, j) {
    Object.assign(LV, { li, j, def: LABS[li].levels[j], placed: [], sel: null, drag: null, mode: 'build', world: null, fails: 0, path: [], tip: true, msg: '', msgT: 0, hints: 0 });
    hubLab = li;
    go('level');
    say(LV.def.tip);
  }
  function invLeft(kind) { return (LV.def.pieces[kind] || 0) - LV.placed.filter((p) => p.kind === kind).length; }
  function runLevel() {
    if (LV.mode !== 'build') return;
    LV.tip = false; hush();
    LV.world = P.makeWorld(LV.def, LV.placed);
    LV.mode = 'run'; LV.runT = 0; LV.path = []; LV.sel = null;
    sfx.go();
  }
  function stopLevel() { LV.mode = 'build'; LV.world = null; LV.msg = ''; }
  function levelDone(w) {
    if (w.done === 'win') {
      const got = w.stars.filter((s) => s.got).length;
      LV.stars = 1 + got;
      const k = starKey(LV.li, LV.j);
      LV.newBest = LV.stars > (save.stars[k] || 0);
      save.stars[k] = Math.max(save.stars[k] || 0, LV.stars); persist();
      LV.mode = 'win'; LV.winT = 0;
      sfx.win(); confetti();
      setTimeout(() => { if (screen === 'level' && LV.mode === 'win') say(LV.def.fact); }, 700);
    } else {
      LV.fails++;
      LV.mode = 'oops'; LV.msgT = 2.0;
      LV.msg = { gone: 'Whoops, it got away! Try moving a piece.', stuck: 'It stopped rolling. Change something and try again!',
        pop: 'POP! Keep the balloon away from the spikes.', time: 'Hmm, that takes too long. Try something new!' }[w.why] || 'So close! Try again!';
      sfx.oops();
    }
  }
  const LEVEL = {
    draw(dt) {
      const lab = LABS[LV.li], def = LV.def;
      drawBackground(lab.space);
      if (LV.mode === 'run' || LV.mode === 'oops' || LV.mode === 'win') {
        const w = LV.world;
        if (LV.mode === 'run') {
          stepWorld(w, dt, false);
          LV.runT += dt;
          for (const b of w.balls) if (b.hero && b.alive && ((LV.runT * 60) | 0) % 3 === 0) LV.path.push(b.x, b.y);
          if (!w.done && LV.runT > 20) { w.done = 'fail'; w.why = 'time'; }
          if (w.done) levelDone(w);
        } else if (LV.mode === 'oops') {
          stepWorld(w, dt, false);
          LV.msgT -= dt;
          if (LV.msgT <= 0) stopLevel();
        } else stepWorld(w, dt, true);
        for (const d of def.drops || []) if (!d.vx && !d.vy) drawPipe(d);
        drawWorld(w, { heroRing: true });
        for (const d of def.drops || []) if (d.vx || d.vy) drawPipe(d);
      } else {
        // build mode: the level as it will start
        const w = P.makeWorld(def, LV.placed.filter((p) => p !== LV.drag?.piece));
        for (const d of def.drops || []) drawPipe(d);
        // where the ball went last time
        if (LV.path.length) {
          ctx.fillStyle = 'rgba(239,68,68,.35)';
          for (let i = 0; i < LV.path.length; i += 2) { ctx.beginPath(); ctx.arc(LV.path[i], LV.path[i + 1], 1.4, 0, 7); ctx.fill(); }
        }
        const segs = w.segs.filter((s) => !s.piece);
        for (const s of segs) if (!s.goal && !s.fan) drawSeg(s);
        for (const g of w.goals) drawGoal(g);
        for (const sw of w.seesaws) drawSeesaw(sw);
        for (const c of w.circles) if (c.mat === 'bumper' && !c.piece) drawBumper(c);
        drawStarsInWorld(w.stars);
        for (const b of w.balls) { b.showHero = true; drawBall(b); if (b.tether) { ctx.strokeStyle = '#475569'; ctx.lineWidth = 1.3; segPath(b.tether.x, b.tether.y, b.x, b.y); ctx.stroke(); ctx.fillStyle = '#334155'; ctx.beginPath(); ctx.arc(b.tether.x, b.tether.y, 3, 0, 7); ctx.fill(); drawBall(b); } }
        for (const d of def.drops || []) {
          if (d.vx || d.vy) {
            ctx.strokeStyle = 'rgba(250,204,21,.8)'; ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5;
            const sp = Math.hypot(d.vx || 0, d.vy || 0) || 1;
            segPath(d.x, d.y, d.x + (d.vx || 0) / sp * 50, d.y + (d.vy || 0) / sp * 50); ctx.stroke(); ctx.setLineDash([]);
          }
        }
        // hint ghosts
        (def.sol || []).slice(0, LV.hints).forEach((s) => drawPiece({ kind: s[0], x: s[1], y: s[2], a: P.rad(s[3]) }, false, true));
        for (const p of LV.placed) drawPiece(p, p === LV.sel);
      }
      drawParts();
      // ---- top bar
      topBar(null, () => go('hub'), lab.color);
      outlined((LV.li + 1) + '-' + (LV.j + 1) + '  ' + def.name, 56, TOP / 2 + 0.5, 10, '#fff', 'rgba(15,23,42,.5)', 'left');
      const got = LV.world ? LV.world.stars.filter((s) => s.got).length : 0;
      for (let k = 0; k < 2; k++) drawStar(282 + k * 13, TOP / 2, 5, k < got);
      const best = save.stars[starKey(LV.li, LV.j)] || 0;
      if (best) text('BEST', 318, TOP / 2 + 0.5, 7, 'rgba(255,255,255,.8)', 'left', 900);
      for (let k = 0; k < best; k++) drawStar(343 + k * 9, TOP / 2, 3.5, true);
      btn('tip', 378, 3, 30, 15, '?', { act: () => { LV.tip = true; say(def.tip); }, size: 9, r: 7 });
      if (def.sol && def.sol.length) {
        btn('hint', 412, 3, 34, 15, '💡', { act: () => { LV.hints = Math.min(def.sol.length, LV.hints + 1); stopIfRunning(); }, size: 8.5, r: 7, glow: LV.fails >= 2 && LV.hints === 0, disabled: LV.hints >= def.sol.length });
      }
      // ---- tray
      const tg = ctx.createLinearGradient(0, TRAY, 0, H);
      tg.addColorStop(0, '#1e293b'); tg.addColorStop(1, '#0f172a');
      ctx.fillStyle = tg; ctx.fillRect(0, TRAY, W, H - TRAY);
      const kinds = Object.keys(def.pieces);
      kinds.forEach((k, i) => {
        const x = 6 + i * 62, n = invLeft(k);
        rr(x, TRAY + 4, 58, 25, 7);
        ctx.fillStyle = n ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.25)'; ctx.fill();
        ctx.globalAlpha = n ? 1 : 0.4; drawIcon(k, x + 17, TRAY + 16.5, 0.85); ctx.globalAlpha = 1;
        text('×' + n, x + 40, TRAY + 12, 10, n ? '#1e3a8a' : '#94a3b8', 'center', 900);
        text(P.PIECES[k].name, x + 40, TRAY + 23, 5.5, n ? '#475569' : '#94a3b8', 'center', 800);
      });
      if (LV.mode === 'build' && LV.placed.length === 0 && !LV.tip) {
        const pulse = Math.sin(now * 5) * 2;
        rr(8, TRAY - 22 + pulse, 112, 15, 7); ctx.fillStyle = 'rgba(30,58,138,.9)'; ctx.fill();
        text('▼ DRAG A PIECE UP', 64, TRAY - 14.5 + pulse, 8, '#fde047', 'center', 900);
      }
      if (LV.drag && ptr.y > TRAY - 4) text('drop here to put it back', 240, TRAY + 17, 9, '#fca5a5', 'center', 900);
      if (LV.sel && LV.mode === 'build' && !LV.drag) {
        if (rotatable(LV.sel.kind)) {
          btn('rl', 268, TRAY + 5, 30, 24, '⟲', { act: () => turn(LV.sel, -1), size: 15, r: 8 });
          btn('rr', 302, TRAY + 5, 30, 24, '⟳', { act: () => turn(LV.sel, 1), size: 15, r: 8 });
        }
        btn('del', 336, TRAY + 5, 30, 24, '✕', { act: () => this.remove(), size: 12, r: 8, color: '#fecaca', text: '#991b1b', edge: '#b91c1c' });
      }
      if (LV.mode === 'build') btn('go', 380, TRAY + 4, 94, 26, 'GO! ▶', { act: runLevel, color: '#22c55e', edge: '#15803d', size: 14, glow: LV.placed.length > 0 && !LV.tip });
      else if (LV.mode === 'run') btn('stop', 380, TRAY + 4, 94, 26, '■ STOP', { act: stopLevel, color: '#f87171', edge: '#b91c1c', size: 12 });
      // ---- messages
      if (LV.tip && LV.mode === 'build') {
        ctx.fillStyle = 'rgba(15,23,42,.25)'; ctx.fillRect(0, TOP, W, TRAY - TOP);
        const lines = wrap(def.tip, 250, 11);
        const bh = bubble(110, 150 - lines.length * 7, 270, lines.concat(['']), 11, [130]);
        text('tap to start building', 245, 150 - lines.length * 7 + bh - 11, 8, '#64748b', 'center', 800);
        drawNewt(62, 232, 1.1, 'talk');
      }
      if (LV.mode === 'oops') {
        const lines = wrap(LV.msg, 230, 11);
        bubble(118, 60, 250, lines, 11, [140], 'rgba(254,249,195,.97)');
        drawNewt(70, 150, 0.9, 'talk');
      }
      if (LV.mode === 'win') this.drawWin(dt);
      drawCursor();
    },
    drawWin(dt) {
      LV.winT += dt;
      const a = clamp(LV.winT * 3, 0, 1);
      ctx.fillStyle = `rgba(15,23,42,${0.35 * a})`; ctx.fillRect(0, 0, W, H);
      const y0 = 40 + (1 - a) * 30;
      glass(110, y0, 260, 184, 16, 'rgba(255,255,255,.97)');
      outlined(LV.stars === 3 ? 'AMAZING!' : LV.stars === 2 ? 'GREAT JOB!' : 'YOU DID IT!', 240, y0 + 22, 20, '#fde047', '#1e3a8a');
      for (let k = 0; k < 3; k++) {
        const pop = clamp((LV.winT - 0.3 - k * 0.25) * 4, 0, 1);
        drawStar(205 + k * 35, y0 + 52, 13 * (pop < 1 ? pop * 1.2 : 1), k < LV.stars && pop > 0, 0);
        if (pop === 0) drawStar(205 + k * 35, y0 + 52, 13, false);
      }
      text(LV.stars === 3 ? 'Basket + both stars!' : 'Basket ✔  Stars: ' + (LV.stars - 1) + ' of 2', 240, y0 + 74, 8.5, '#475569', 'center', 800);
      const lines = wrap(LV.def.fact, 170, 9.5);
      lines.forEach((l, i) => text(l, 178, y0 + 92 + i * 12.5, 9.5, '#1e293b', 'left', 700));
      drawNewt(146, y0 + 140, 0.85, 'happy');
      const last = LV.j === LABS[LV.li].levels.length - 1;
      btn('again', 122, y0 + 150, 72, 24, '↻ AGAIN', { act: () => { stopLevel(); LV.path = []; }, size: 10 });
      btn('hub', 200, y0 + 150, 60, 24, 'LAB', { act: () => go('hub'), size: 10 });
      btn('next', 266, y0 + 150, 94, 24, last ? (LV.li < LABS.length - 1 ? 'NEXT LAB ▶' : 'ALL LABS ▶') : 'NEXT ▶', {
        act: () => {
          if (!last) startLevel(LV.li, LV.j + 1);
          else if (LV.li < LABS.length - 1) { hubLab = LV.li + 1; go('hub'); } else go('labs');
        }, color: '#22c55e', edge: '#15803d', size: 11, glow: true,
      });
      if (!navMode || !focusId) { focusId = 'next'; }
    },
    remove() {
      if (!LV.sel) return;
      LV.placed = LV.placed.filter((p) => p !== LV.sel); LV.sel = null; sfx.remove();
    },
    down(x, y) {
      if (LV.tip) { LV.tip = false; hush(); return; }
      if (LV.mode === 'oops') { stopLevel(); return; }
      if (LV.mode !== 'build') return;
      if (y > TRAY) {
        const kinds = Object.keys(LV.def.pieces);
        const i = Math.floor((x - 6) / 62);
        if (i >= 0 && i < kinds.length && x - 6 - i * 62 < 58 && invLeft(kinds[i]) > 0) {
          const p = { kind: kinds[i], x: clamp(x, 10, W - 10), y: TRAY - 20, a: startAngle(kinds[i]) };
          LV.placed.push(p); LV.sel = p; LV.drag = { piece: p, ox: 0, oy: -18, fresh: true };
          sfx.click();
        }
        return;
      }
      const p = hitPiece(LV.placed, x, y);
      if (p) { LV.sel = p; LV.drag = { piece: p, ox: p.x - x, oy: p.y - y, sx: x, sy: y }; sfx.click(); }
      else LV.sel = null;
    },
    move(x, y) {
      const d = LV.drag; if (!d) return;
      d.piece.x = Math.round(clamp(x + d.ox, 6, W - 6));
      d.piece.y = Math.round(clamp(y + d.oy, TOP + 4, TRAY + 20));
    },
    up(x, y) {
      const d = LV.drag; if (!d) return;
      LV.drag = null;
      if (d.piece.y > TRAY - 6 || y > TRAY) { LV.sel = d.piece; this.remove(); return; }
      d.piece.y = Math.min(d.piece.y, TRAY - 6);
      // a tap on a piece (no drag) turns it -- quick for little fingers
      if (!d.fresh && Math.hypot(x - d.sx, y - d.sy) < 3 && rotatable(d.piece.kind) && LV.tapSel === d.piece) turn(d.piece, 1);
      else sfx.place();
      LV.tapSel = d.piece;
    },
    key(k) {
      if (k === ' ' || k === 'g' || k === 'G') { if (LV.mode === 'build') runLevel(); else if (LV.mode === 'run') stopLevel(); else if (LV.mode === 'win') { const b = ui.find((u) => u.id === 'next'); if (b) b.act(); } return true; }
      if ((k === 'q' || k === 'Q' || k === '[') && LV.sel && LV.mode === 'build') { if (rotatable(LV.sel.kind)) turn(LV.sel, -1); return true; }
      if ((k === 'e' || k === 'E' || k === ']') && LV.sel && LV.mode === 'build') { if (rotatable(LV.sel.kind)) turn(LV.sel, 1); return true; }
      if ((k === 'Delete' || k === 'x' || k === 'X') && LV.sel && LV.mode === 'build') { this.remove(); return true; }
      if (k === 'Escape' || k === 'Backspace') {
        if (LV.tip) { LV.tip = false; return true; }
        if (LV.mode === 'run' || LV.mode === 'oops') { stopLevel(); return true; }
        if (LV.sel) { LV.sel = null; return true; }
        go('hub'); return true;
      }
      if (LV.mode === 'win' && (k === 'ArrowLeft' || k === 'ArrowRight')) { navMove(k === 'ArrowLeft' ? -1 : 1, 0); return true; }
      if (LV.mode === 'win' && k === 'Enter') { navPress(); return true; }
      return false;
    },
    back() { go('hub'); },
  };
  function stopIfRunning() { if (LV.mode === 'run' || LV.mode === 'oops') stopLevel(); }

  // ---------- PLAYGROUND
  const GRAVS = [
    { name: 'EARTH', g: 1, icon: '🌍' }, { name: 'MOON', g: 0.17, icon: '🌙' }, { name: 'JUPITER', g: 2.5, icon: '🪐' },
    { name: 'SPACE', g: 0, icon: '✨' }, { name: 'UPSIDE DOWN', g: -1, icon: '🙃' },
  ];
  const PG_BALLS = ['red', 'bowl', 'beach', 'steel', 'super', 'clay', 'balloon'];
  const PG_BUILD = ['ramp', 'long', 'ice', 'carpet', 'tramp', 'bumper', 'fan', 'magnet', 'seesaw'];
  const PG_LEVEL = { segs: [[0, 234, 480, 234, 'wall'], [0, 24, 480, 24, 'wall'], [2, 24, 2, 234, 'wall'], [478, 24, 478, 234, 'wall']], bounds: false };
  const PG = { tab: 'balls', tool: 'red', grav: 0, trails: false, slow: false, placed: [], world: null, sel: null, drag: null, grab: null, tapSel: null };
  function pgRebuild() {
    const balls = PG.world ? PG.world.balls : [];
    PG.world = P.makeWorld(PG_LEVEL, PG.placed, { gravity: GRAVS[PG.grav].g, trails: PG.trails });
    PG.world.balls = balls;
    if (!PG.trails) balls.forEach((b) => { b.trail.length = 0; });
  }
  const PLAY = {
    enter() { if (!PG.world) { pgRebuild(); PG.world.balls.push(P.makeBall('red', 240, 60)); } say('This is the playground! Drop balls, build things, and change gravity.'); },
    draw(dt) {
      const space = GRAVS[PG.grav].g === 0;
      drawBackground(space);
      const w = PG.world;
      if (PG.grab) {
        const b = PG.grab;
        b.x = clamp(ptr.x, 6, W - 6); b.y = clamp(ptr.y, TOP + 6, TRAY - 6); b.vx = 0; b.vy = 0;
      }
      stepWorld(w, dt, false, PG.slow ? 0.25 : 1);
      if (PG.grab) { PG.grab.x = clamp(ptr.x, 6, W - 6); PG.grab.y = clamp(ptr.y, TOP + 6, TRAY - 6); }
      w.balls = w.balls.filter((b) => b.alive);
      ctx.save(); ctx.beginPath(); ctx.rect(0, TOP, W, TRAY - TOP); ctx.clip();
      drawWorld(w);
      if (PG.sel) drawPiece(PG.sel, true);
      drawParts();
      ctx.restore();
      // top bar
      topBar(null, () => go('title'), '#2563eb');
      outlined('PLAYGROUND', 50, TOP / 2 + 0.5, 10, '#fff', 'rgba(15,23,42,.5)', 'left');
      const gv = GRAVS[PG.grav];
      btn('grav', 140, 3, 112, 15, 'GRAVITY: ' + gv.name, { act: () => { PG.grav = (PG.grav + 1) % GRAVS.length; pgRebuild(); this.gravSay(); }, size: 7.5, r: 7, color: '#fde047', text: '#713f12', edge: '#a16207' });
      btn('slow', 258, 3, 52, 15, PG.slow ? 'SLOW: ON' : 'SLOW-MO', { act: () => { PG.slow = !PG.slow; }, size: 7, r: 7, color: PG.slow ? '#a5f3fc' : '#ffffff' });
      btn('trail', 314, 3, 52, 15, PG.trails ? 'PATHS: ON' : 'PATHS', { act: () => { PG.trails = !PG.trails; pgRebuild(); if (PG.trails) say('Paths show where each ball went. Throw one and see the curve!'); }, size: 7, r: 7, color: PG.trails ? '#a5f3fc' : '#ffffff' });
      btn('clear', 370, 3, 48, 15, 'CLEAR', { act: () => { PG.placed = []; PG.sel = null; PG.world.balls = []; pgRebuild(); sfx.remove(); }, size: 7, r: 7, color: '#fecaca', text: '#991b1b', edge: '#b91c1c' });
      // tray
      const tg = ctx.createLinearGradient(0, TRAY, 0, H);
      tg.addColorStop(0, '#1e293b'); tg.addColorStop(1, '#0f172a');
      ctx.fillStyle = tg; ctx.fillRect(0, TRAY, W, H - TRAY);
      btn('tabA', 4, TRAY + 3, 44, 12, 'BALLS', { act: () => { PG.tab = 'balls'; PG.tool = 'red'; }, size: 7, r: 5, color: PG.tab === 'balls' ? '#fde047' : '#475569', text: PG.tab === 'balls' ? '#713f12' : '#e2e8f0', flat: true });
      btn('tabB', 4, TRAY + 17, 44, 12, 'BUILD', { act: () => { PG.tab = 'build'; PG.tool = 'ramp'; }, size: 7, r: 5, color: PG.tab === 'build' ? '#fde047' : '#475569', text: PG.tab === 'build' ? '#713f12' : '#e2e8f0', flat: true });
      const list = PG.tab === 'balls' ? PG_BALLS : PG_BUILD;
      list.forEach((k, i) => {
        const x = 52 + i * 33;
        btn('t' + k, x, TRAY + 3, 30, 26, '', {
          act: () => { PG.tool = k; sfx.click(); }, color: PG.tool === k ? '#fde68a' : 'rgba(255,255,255,.92)', flat: true, r: 6,
          draw: (bx, by) => drawIcon(k, bx + 15, by + 13, 0.8),
        });
      });
      if (PG.sel && !PG.drag) {
        if (rotatable(PG.sel.kind)) {
          btn('rl', 368, TRAY + 4, 32, 25, '⟲', { act: () => { turn(PG.sel, -1); pgRebuild(); }, size: 15, r: 8 });
          btn('rr', 404, TRAY + 4, 32, 25, '⟳', { act: () => { turn(PG.sel, 1); pgRebuild(); }, size: 15, r: 8 });
        }
        btn('del', 440, TRAY + 4, 34, 25, '✕', { act: () => this.remove(), size: 12, r: 8, color: '#fecaca', text: '#991b1b', edge: '#b91c1c' });
      } else {
        const tip = PG.tab === 'balls' ? 'Tap to drop a ball. Grab one to throw it!' : 'Tap to build. Drag to move.';
        const lines = wrap(tip, 100, 7);
        lines.forEach((l, i) => text(l, 422, TRAY + 11 + i * 9, 7, '#cbd5e1', 'center', 800));
      }
      drawCursor();
    },
    gravSay() {
      const n = GRAVS[PG.grav].name;
      say({ EARTH: 'Earth gravity. Things fall the normal way.', MOON: 'Moon gravity! Things float down slowly.', JUPITER: 'Jupiter gravity! Jupiter is huge, so everything falls super fast.',
        SPACE: 'Space! No gravity. Things keep going until they bump into something.', 'UPSIDE DOWN': 'Upside down! Now gravity pulls UP. Watch the balloon!' }[n]);
    },
    remove() { if (!PG.sel) return; PG.placed = PG.placed.filter((p) => p !== PG.sel); PG.sel = null; pgRebuild(); sfx.remove(); },
    down(x, y) {
      if (y < TOP || y > TRAY) return;
      const w = PG.world;
      // grab a ball?
      for (let i = w.balls.length - 1; i >= 0; i--) {
        const b = w.balls[i];
        if (Math.hypot(b.x - x, b.y - y) < b.r + 6) { PG.grab = b; PG.sel = null; sfx.click(); return; }
      }
      const p = hitPiece(PG.placed, x, y);
      if (p) { PG.sel = p; PG.drag = { piece: p, ox: p.x - x, oy: p.y - y, sx: x, sy: y }; sfx.click(); return; }
      if (PG.tab === 'balls') {
        const b = P.makeBall(PG.tool, x, y, 0, 0);
        w.balls.push(b);
        if (w.balls.length > 36) w.balls.shift();
        PG.grab = b; PG.sel = null; sfx.place();
      } else {
        const np = { kind: PG.tool, x: Math.round(x), y: Math.round(y), a: startAngle(PG.tool) };
        PG.placed.push(np); PG.sel = np; PG.drag = { piece: np, ox: 0, oy: 0, sx: x, sy: y, fresh: true };
        pgRebuild(); sfx.place();
      }
    },
    move(x, y) {
      const d = PG.drag; if (!d) return;
      d.piece.x = Math.round(clamp(x + d.ox, 8, W - 8)); d.piece.y = Math.round(clamp(y + d.oy, TOP + 6, TRAY - 8));
      pgRebuild();
    },
    up(x, y) {
      if (PG.grab) {
        const b = PG.grab; PG.grab = null;
        const sp = Math.hypot(ptr.vx, ptr.vy), k = sp > 900 ? 900 / sp : 1;
        b.vx = ptr.vx * k; b.vy = ptr.vy * k;
        if (sp > 300) sfx.whoosh();
        return;
      }
      const d = PG.drag; if (!d) return;
      PG.drag = null;
      if (!d.fresh && Math.hypot(x - d.sx, y - d.sy) < 3 && rotatable(d.piece.kind) && PG.tapSel === d.piece) { turn(d.piece, 1); pgRebuild(); }
      PG.tapSel = d.piece;
    },
    key(k) {
      if ((k === 'q' || k === 'Q') && PG.sel) { if (rotatable(PG.sel.kind)) { turn(PG.sel, -1); pgRebuild(); } return true; }
      if ((k === 'e' || k === 'E') && PG.sel) { if (rotatable(PG.sel.kind)) { turn(PG.sel, 1); pgRebuild(); } return true; }
      if ((k === 'Delete' || k === 'x' || k === 'X') && PG.sel) { this.remove(); return true; }
      if (k === ' ' || k === 'g' || k === 'G') { PG.grav = (PG.grav + 1) % GRAVS.length; pgRebuild(); this.gravSay(); return true; }
      if (k === 'Escape' || k === 'Backspace') { if (PG.sel) { PG.sel = null; return true; } go('title'); return true; }
      return false;
    },
    back() { go('title'); },
  };

  const SCREENS = { title: TITLE, labs: LABSCR, hub: HUB, learn: LEARN, predict: PREDICT, level: LEVEL, play: PLAY };

  // ---------------------------------------------------------------- HOW TO PLAY (shared ☰ menu)
  const howBtn = document.getElementById('btn-howto');
  const howBox = document.getElementById('howto');
  function openHowTo() { if (!howBox) return; if (window.MickleMenu) MickleMenu.close(); howBox.hidden = false; }
  function closeHowTo() { if (howBox) howBox.hidden = true; }
  if (howBtn && howBox) {
    howBtn.addEventListener('click', openHowTo);
    document.getElementById('btn-howto-close').addEventListener('click', closeHowTo);
  }

  // ---------------------------------------------------------------- the loop
  let last = performance.now();
  function loop(t) {
    const dt = Math.min(0.05, (t - last) / 1000); last = t; now = t / 1000;
    frame(dt);
    requestAnimationFrame(loop);
  }
  function frame(dt) {
    if (talkT > 0) talkT -= dt;
    pollPad(dt); keyCursor(dt);
    ui = [];
    ctx.clearRect(0, 0, W, H);
    stepParts(dt);
    SCREENS[screen].draw(dt);
    if (screen !== 'level' && screen !== 'play') drawParts();
  }
  go('title');
  requestAnimationFrame(loop);

  // ---------------------------------------------------------------- level check (open the page with #check)
  if (location.hash === '#check') {
    // test helper: fast-forward the game by some seconds (the browser slows hidden pages down)
    window.boingStep = (sec) => { for (let i = 0; i < sec * 60; i++) { now += 1 / 60; frame(1 / 60); } return screen; };
    const out = [];
    LABS.forEach((lab, i) => lab.levels.forEach((lv, j) => {
      const none = P.runHeadless(lv, [], 20);
      const sol = (lv.sol || []).map((s) => ({ kind: s[0], x: s[1], y: s[2], a: P.rad(s[3]) }));
      const r = lv.sol ? P.runHeadless(lv, sol, 20) : null;
      out.push(`${i + 1}-${j + 1} ${lv.name}: empty=${none.win ? 'WINS (bad)' : 'fails (good)'} sol=${r ? (r.win ? 'WIN *' + r.stars : 'FAILS ' + r.why) : 'none'}`);
    }));
    console.log(out.join('\n'));
    window.boingCheck = out;
  }
})();
