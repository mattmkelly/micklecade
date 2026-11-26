// Boing Lab physics: balls (circles) moving among fixed lines, bumpers, fans, magnets, seesaws
// and swinging pendulums. No DOM here, so levels can be run headless (index.html#check runs every level's solution).
//
//   const w = BoingPhys.makeWorld(level, placedPieces, { gravity })
//   BoingPhys.step(w)          -- one fixed 1/240 s step; w.events gets bounces, stars, pops, win/fail
//   BoingPhys.runHeadless(level, placed, maxSeconds) -> { win, stars, time }
(function (global) {
  'use strict';

  const DT = 1 / 240;
  const G = 600;                  // px / s^2 -- "Earth" in Boing Lab units
  const FIELD = { top: 22, bottom: 236, w: 480 };

  // Each ball kind. bounce: how much of its speed it keeps hitting a plain wall.
  // drag: air slowing (per second). lift: gravity multiplier (balloons float up).
  const BALLS = {
    red:     { r: 8,  mass: 1,    bounce: 0.55, drag: 0.03, roll: 1,   name: 'RUBBER BALL' },
    bowl:    { r: 10, mass: 5,    bounce: 0.12, drag: 0.0,  roll: 0.6, name: 'BOWLING BALL' },
    beach:   { r: 12, mass: 0.25, bounce: 0.75, drag: 1.0,  roll: 1,   name: 'BEACH BALL' },
    steel:   { r: 7,  mass: 2,    bounce: 0.3,  drag: 0.0,  roll: 0.6, metal: true, name: 'STEEL BALL' },
    balloon: { r: 11, mass: 0.15, bounce: 0.4,  drag: 2.2,  roll: 1,   lift: -0.45, name: 'BALLOON' },
    super:   { r: 7,  mass: 0.8,  bounce: 0.9,  drag: 0.01, roll: 1,   name: 'SUPER BALL' },
    clay:    { r: 8,  mass: 1.2,  bounce: 0.0,  drag: 0.03, roll: 3,   name: 'CLAY BALL' },
  };

  // Surface kinds. bounce multiplies the ball's own bounce; fixed replaces it.
  // roll: how fast rolling slows (per second) -- ice 0, carpet a lot.
  const MATS = {
    wall:   { bounce: 1,   roll: 0.25 },
    wood:   { bounce: 1,   roll: 0.25 },
    ice:    { bounce: 1,   roll: 0, slide: true },
    carpet: { bounce: 0.3, roll: 5 },
    tramp:  { fixed: 0.96, roll: 0.25 },
    bumper: { fixed: 1.0,  roll: 0 },
    spike:  { bounce: 0.5, roll: 0.25, spike: true },
  };

  // Pieces a player can place. len for line pieces; r for round ones.
  const PIECES = {
    ramp:   { name: 'RAMP',        len: 80,  mat: 'wood',   step: 15 },
    long:   { name: 'LONG RAMP',   len: 120, mat: 'wood',   step: 15 },
    ice:    { name: 'ICE RAMP',    len: 80,  mat: 'ice',    step: 15 },
    carpet: { name: 'CARPET',      len: 80,  mat: 'carpet', step: 15 },
    tramp:  { name: 'TRAMPOLINE',  len: 46,  mat: 'tramp',  step: 15 },
    bumper: { name: 'BUMPER',      r: 11,    mat: 'bumper', step: 0 },
    fan:    { name: 'FAN',         step: 45, power: 380, reach: 170, width: 48 },
    magnet: { name: 'MAGNET',      r: 9,     step: 45, pull: 9000, reach: 90 },
    seesaw: { name: 'SEESAW',      len: 50,  step: 0 },
  };

  const rad = (d) => d * Math.PI / 180;

  function lineOf(x, y, a, len) {
    const c = Math.cos(a) * len / 2, s = Math.sin(a) * len / 2;
    return [x - c, y - s, x + c, y + s];
  }

  function makeBall(kind, x, y, vx, vy, extra) {
    const k = BALLS[kind] || BALLS.red;
    return Object.assign({
      kind, x, y, vx: vx || 0, vy: vy || 0, r: k.r, mass: k.mass, inv: 1 / k.mass,
      bounce: k.bounce, drag: k.drag, lift: k.lift == null ? 1 : k.lift, metal: !!k.metal, rollMul: k.roll,
      ang: 0, spin: 0, contact: 0, alive: true, hero: false, trail: [], restT: 0, lastHit: 0,
    }, extra || {});
  }

  // Build a world from a level + the pieces the player placed: [{ kind, x, y, a }] (a in radians).
  function makeWorld(level, placed, opts) {
    opts = opts || {};
    const w = {
      t: 0, g: G * (opts.gravity != null ? opts.gravity : (level.g == null ? 1 : level.g)), gdir: 1,
      balls: [], segs: [], circles: [], fans: [], magnets: [], seesaws: [], stars: [], goals: [],
      events: [], done: null, starGot: [], won: false, frozen: false, trails: !!opts.trails,
      bounds: level.bounds !== false,
    };
    (level.segs || []).forEach((s) => w.segs.push({ x1: s[0], y1: s[1], x2: s[2], y2: s[3], mat: s[4] || 'wall', t: 3 }));
    (level.bumpers || []).forEach((b) => w.circles.push({ x: b[0], y: b[1], r: b[2] || 11, mat: b[3] || 'bumper' }));
    (level.fans || []).forEach((f) => addFan(w, f[0], f[1], rad(f[2]), f[3]));
    (level.magnets || []).forEach((m) => addMagnet(w, m[0], m[1]));
    (level.seesaws || []).forEach((s) => addSeesaw(w, s[0], s[1], s[2] || 50, rad(s[3] || 0)));
    (level.stars || []).forEach((s) => { w.stars.push({ x: s[0], y: s[1], got: false }); });
    const goals = level.goal ? (Array.isArray(level.goal) ? level.goal : [level.goal]) : [];
    goals.forEach((gl) => addGoal(w, gl));
    (placed || []).forEach((p) => addPiece(w, p));
    (level.balls || []).forEach((b) => {
      const ball = makeBall(b.kind, b.x, b.y, b.vx, b.vy, { hero: !!b.hero, label: b.label });
      if (b.lift != null) ball.lift = b.lift;
      if (b.tether) {
        ball.tether = { x: b.tether[0], y: b.tether[1], len: Math.hypot(b.x - b.tether[0], b.y - b.tether[1]) };
      }
      w.balls.push(ball);
    });
    (level.drops || []).forEach((d) => {
      w.balls.push(makeBall(d.kind, d.x, d.y, d.vx, d.vy, { hero: d.hero !== false }));
    });
    return w;
  }

  function addGoal(w, gl) {
    const g = Object.assign({ type: 'basket', w: 44, h: 30 }, gl);
    if (g.type === 'basket') {
      const l = g.x - g.w / 2, r = g.x + g.w / 2;
      const top = g.down ? g.y + g.h : g.y - g.h;          // the open side
      w.segs.push({ x1: l, y1: top, x2: l, y2: g.y, mat: 'wall', t: 3, goal: true });
      w.segs.push({ x1: l, y1: g.y, x2: r, y2: g.y, mat: g.soft ? 'carpet' : 'wall', t: 3, goal: true });
      w.segs.push({ x1: r, y1: g.y, x2: r, y2: top, mat: 'wall', t: 3, goal: true });
    }
    w.goals.push(g);
  }

  function addFan(w, x, y, a, on) {
    const P = PIECES.fan;
    const dx = Math.cos(a), dy = Math.sin(a);
    // the fan box: a short wall across the back of the fan so balls don't pass through it
    const px = -dy, py = dx;
    w.segs.push({ x1: x + px * 12, y1: y + py * 12, x2: x - px * 12, y2: y - py * 12, mat: 'wall', t: 5, fan: true });
    w.fans.push({ x, y, a, dx, dy, on: on !== false, power: P.power, reach: P.reach, width: P.width, spin: 0 });
  }

  function addMagnet(w, x, y) {
    w.circles.push({ x, y, r: PIECES.magnet.r, mat: 'wall', magnet: true });
    w.magnets.push({ x, y, on: true, pull: PIECES.magnet.pull, reach: PIECES.magnet.reach });
  }

  function addSeesaw(w, x, y, half, a) {
    // a plank balanced on a pivot (x, y). The triangle stand is solid too.
    w.segs.push({ x1: x - 9, y1: y + 16, x2: x, y2: y + 3, mat: 'wall', t: 2 });
    w.segs.push({ x1: x, y1: y + 3, x2: x + 9, y2: y + 16, mat: 'wall', t: 2 });
    const mass = 1.5;
    w.seesaws.push({ x, y, half, ang: a || 0, w: 0, max: rad(28), mass, I: mass * half * half / 3 });
  }

  function addPiece(w, p) {
    const P = PIECES[p.kind];
    if (!P) return;
    if (P.len && p.kind !== 'seesaw') {
      const l = lineOf(p.x, p.y, p.a, P.len);
      w.segs.push({ x1: l[0], y1: l[1], x2: l[2], y2: l[3], mat: P.mat, t: 3, piece: p.kind });
    } else if (p.kind === 'bumper') {
      w.circles.push({ x: p.x, y: p.y, r: P.r, mat: 'bumper', piece: 'bumper' });
    } else if (p.kind === 'fan') {
      addFan(w, p.x, p.y, p.a, true);
    } else if (p.kind === 'magnet') {
      addMagnet(w, p.x, p.y);
    } else if (p.kind === 'seesaw') {
      addSeesaw(w, p.x, p.y, P.len, 0);
    }
  }

  // ---------- the step ----------

  function bounceOff(w, b, nx, ny, mat, vcx, vcy, tx, ty) {
    // velocity of the ball relative to the surface (the surface may be moving: seesaws)
    vcx = vcx || 0; vcy = vcy || 0;
    const rvx = b.vx - vcx, rvy = b.vy - vcy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const M = MATS[mat] || MATS.wall;
    let e = M.fixed != null ? M.fixed : b.bounce * M.bounce;
    if (-vn < 28 && M.fixed == null) e = 0;          // too slow to bounce: settle
    if (M.fixed != null && -vn < 18) e = 0;
    let tvx = rvx - vn * nx, tvy = rvy - vn * ny;
    b.vx = vcx + tvx - e * vn * nx;
    b.vy = vcy + tvy - e * vn * ny;
    if (M.spike && b.kind === 'balloon') b.popped = true;
    if (-vn > 60) {
      w.events.push({ type: 'bounce', x: b.x - nx * b.r, y: b.y - ny * b.r, speed: -vn, mat, kind: b.kind });
    }
    return -vn;
  }

  function touch(b, mat, nx, ny, dt) {
    // rolling along a surface: rolling resistance, and spin for the drawing
    const M = MATS[mat] || MATS.wall;
    b.contact = 3;
    const tx = -ny, ty = nx;
    let vt = b.vx * tx + b.vy * ty;
    const slow = Math.max(0, 1 - M.roll * b.rollMul * dt);
    const vt2 = vt * slow;
    b.vx += (vt2 - vt) * tx; b.vy += (vt2 - vt) * ty;
    if (!M.slide) b.spin = vt2 / b.r;
    b.onIce = !!M.slide;
  }

  function collideSeg(w, b, s, dt) {
    const ax = s.x1, ay = s.y1, ex = s.x2 - ax, ey = s.y2 - ay;
    const L2 = ex * ex + ey * ey || 1;
    let u = ((b.x - ax) * ex + (b.y - ay) * ey) / L2;
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + ex * u, qy = ay + ey * u;
    let dx = b.x - qx, dy = b.y - qy;
    const d2 = dx * dx + dy * dy, R = b.r + s.t;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2);
    if (d < 1e-6) { dx = -ey; dy = ex; d = Math.hypot(dx, dy); }
    const nx = dx / d, ny = dy / d;
    b.x += nx * (R - d); b.y += ny * (R - d);
    bounceOff(w, b, nx, ny, s.mat);
    touch(b, s.mat, nx, ny, dt);
  }

  function collideCircle(w, b, c, dt) {
    let dx = b.x - c.x, dy = b.y - c.y;
    const R = b.r + c.r, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    let d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    b.x = c.x + nx * R; b.y = c.y + ny * R;
    const hit = bounceOff(w, b, nx, ny, c.mat);
    if (c.mat === 'bumper' && hit > 40) c.flash = 1;
    touch(b, c.mat, nx, ny, dt);
  }

  function collideSeesaw(w, b, sw, dt) {
    const c = Math.cos(sw.ang), s = Math.sin(sw.ang);
    const ax = sw.x - c * sw.half, ay = sw.y - s * sw.half;
    const ex = 2 * c * sw.half, ey = 2 * s * sw.half;
    let u = ((b.x - ax) * ex + (b.y - ay) * ey) / (ex * ex + ey * ey);
    u = u < 0 ? 0 : u > 1 ? 1 : u;
    const qx = ax + ex * u, qy = ay + ey * u;
    let dx = b.x - qx, dy = b.y - qy;
    const R = b.r + 4, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    b.x += nx * (R - d); b.y += ny * (R - d);
    // plank point velocity: w x r
    const rx = qx - sw.x, ry = qy - sw.y;
    const pvx = -sw.w * ry, pvy = sw.w * rx;
    const vn = (b.vx - pvx) * nx + (b.vy - pvy) * ny;
    if (vn < 0) {
      let e = b.bounce * 0.6;
      if (-vn < 28) e = 0;
      const rn = rx * ny - ry * nx;                 // r x n
      const j = -(1 + e) * vn / (b.inv + rn * rn / sw.I);
      b.vx += j * nx * b.inv; b.vy += j * ny * b.inv;
      sw.w -= j * rn / sw.I;
      if (-vn > 60) w.events.push({ type: 'bounce', x: qx, y: qy, speed: -vn, mat: 'wood', kind: b.kind });
    }
    touch(b, 'wood', nx, ny, dt);
  }

  function collideBalls(w, a, b) {
    let dx = b.x - a.x, dy = b.y - a.y;
    const R = a.r + b.r, d2 = dx * dx + dy * dy;
    if (d2 >= R * R) return;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = dx / d, ny = dy / d;
    const over = R - d, inv = a.inv + b.inv;
    a.x -= nx * over * a.inv / inv; a.y -= ny * over * a.inv / inv;
    b.x += nx * over * b.inv / inv; b.y += ny * over * b.inv / inv;
    const vn = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
    if (vn >= 0) return;
    let e = Math.min(0.92, (a.bounce + b.bounce) / 2 + 0.25);
    if (-vn < 20) e = 0;
    const j = -(1 + e) * vn / inv;
    a.vx -= j * nx * a.inv; a.vy -= j * ny * a.inv;
    b.vx += j * nx * b.inv; b.vy += j * ny * b.inv;
    if (-vn > 50) w.events.push({ type: 'clack', x: a.x + nx * a.r, y: a.y + ny * a.r, speed: -vn });
  }

  function step(w) {
    const dt = DT;
    w.t += dt;
    if (w.frozen) return;
    const g = w.g * w.gdir;
    // seesaws turn
    w.seesaws.forEach((sw) => {
      sw.ang += sw.w * dt;
      sw.w *= 1 - 0.4 * dt;
      if (sw.ang > sw.max) { sw.ang = sw.max; if (sw.w > 0) sw.w *= -0.25; }
      if (sw.ang < -sw.max) { sw.ang = -sw.max; if (sw.w < 0) sw.w *= -0.25; }
    });
    w.fans.forEach((f) => { f.spin += (f.on ? 20 : 0) * dt; });
    for (const b of w.balls) {
      if (!b.alive) continue;
      b.vy += g * b.lift * dt;
      // fans push -- harder on light things (a push makes small masses speed up more)
      for (const f of w.fans) {
        if (!f.on) continue;
        const rx = b.x - f.x, ry = b.y - f.y;
        const along = rx * f.dx + ry * f.dy, side = Math.abs(rx * -f.dy + ry * f.dx);
        if (along > 0 && along < f.reach && side < f.width / 2 + b.r * 0.5) {
          const k = f.power * (1 - 0.6 * along / f.reach) * b.inv;
          b.vx += f.dx * k * dt; b.vy += f.dy * k * dt;
          b.inFan = true;
        }
      }
      // magnets only pull metal
      if (b.metal) {
        for (const m of w.magnets) {
          if (!m.on) continue;
          const dx = m.x - b.x, dy = m.y - b.y, d = Math.hypot(dx, dy);
          if (d < m.reach && d > 1) {
            const k = m.pull / Math.max(d, 14);
            b.vx += dx / d * k * dt; b.vy += dy / d * k * dt;
          }
        }
      }
      if (b.drag) { const k = Math.max(0, 1 - b.drag * dt); b.vx *= k; b.vy *= k; }
      // speed limit keeps things sane
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > 1100) { b.vx *= 1100 / sp; b.vy *= 1100 / sp; }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.contact > 0) b.contact--;
      else b.onIce = false;
      b.ang += b.spin * dt;
    }
    // balls hit each other
    for (let i = 0; i < w.balls.length; i++) {
      const a = w.balls[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < w.balls.length; j++) if (w.balls[j].alive) collideBalls(w, a, w.balls[j]);
    }
    for (const b of w.balls) {
      if (!b.alive) continue;
      for (const s of w.segs) collideSeg(w, b, s, dt);
      for (const c of w.circles) collideCircle(w, b, c, dt);
      for (const sw of w.seesaws) collideSeesaw(w, b, sw, dt);
      if (b.tether) {
        const t = b.tether, dx = b.x - t.x, dy = b.y - t.y, d = Math.hypot(dx, dy);
        if (d > t.len) {
          const ux = dx / d, uy = dy / d;
          b.x = t.x + ux * t.len; b.y = t.y + uy * t.len;
          const vr = b.vx * ux + b.vy * uy;
          if (vr > 0) { b.vx -= vr * ux; b.vy -= vr * uy; }
          if (!b.contact) b.spin *= 0.99;
        }
      }
      if (b.popped) {
        b.alive = false;
        w.events.push({ type: 'pop', x: b.x, y: b.y });
        if (b.hero && !w.done) { w.done = 'fail'; w.why = 'pop'; }
        continue;
      }
      // trails
      if (w.trails && ((w.t * 240) | 0) % 6 === 0) {
        b.trail.push(b.x, b.y);
        if (b.trail.length > 400) b.trail.splice(0, 2);
      }
      // off the screen
      if (b.x < -40 || b.x > FIELD.w + 40 || b.y > FIELD.bottom + 60 || b.y < -60) {
        b.alive = false;
        if (b.hero && !w.done) { w.done = 'fail'; w.why = 'gone'; }
        w.events.push({ type: 'gone', x: b.x, y: b.y });
      }
    }
    // stars, goals, resting
    let heroes = 0, home = 0;
    for (const b of w.balls) {
      if (!b.hero) continue;
      heroes++;
      if (!b.alive) continue;
      w.stars.forEach((s, i) => {
        if (!s.got && Math.hypot(b.x - s.x, b.y - s.y) < b.r + 8) {
          s.got = true; w.events.push({ type: 'star', x: s.x, y: s.y, i });
        }
      });
      if (b.home || inGoal(w, b)) {
        if (!b.home) { b.home = true; w.events.push({ type: 'home', x: b.x, y: b.y }); }
        home++;
      }
      const sp = Math.hypot(b.vx, b.vy);
      b.restT = sp < 6 ? b.restT + dt : 0;
    }
    if (!w.done && heroes && home === heroes) { w.done = 'win'; w.won = true; }
    if (!w.done) {
      const stuck = w.balls.some((b) => b.hero && b.alive && !b.home && b.restT > 1.4);
      if (stuck && w.bounds) { w.done = 'fail'; w.why = 'stuck'; }
    }
  }

  function inGoal(w, b) {
    for (const g of w.goals) {
      if (g.type === 'ring') {
        if (Math.hypot(b.x - g.x, b.y - g.y) < (g.r || 16)) return true;
      } else if (Math.abs(b.x - g.x) < g.w / 2) {
        if (!g.down && b.y > g.y - g.h + 4 && b.y < g.y) return true;
        if (g.down && b.y < g.y + g.h - 4 && b.y > g.y) return true;
      }
    }
    return false;
  }

  function runHeadless(level, placed, maxSec) {
    const w = makeWorld(level, placed);
    const n = (maxSec || 14) / DT;
    for (let i = 0; i < n && !w.done; i++) { step(w); w.events.length = 0; }
    return { win: w.done === 'win', why: w.why, stars: w.stars.filter((s) => s.got).length, time: w.t };
  }

  global.BoingPhys = { DT, G, FIELD, BALLS, MATS, PIECES, rad, lineOf, makeBall, makeWorld, addPiece, step, inGoal, runHeadless };
})(typeof window !== 'undefined' ? window : globalThis);
