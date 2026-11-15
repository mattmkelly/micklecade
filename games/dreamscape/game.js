// Dreamscape -- a landscape studio for the MickleCade.
// Sculpt a fractal terrain with brushes, paint it, set the sky and the time of day, then
// press RENDER for a finished picture. three.js (shared/three.min.js); no modules, runs
// from file://.
//
// The land is one height map (N x N floats). Brushes change the heights on the CPU; the
// mesh, its normals and a half-float height texture follow. The terrain shader picks its
// material from height and slope (grass / rock / snow / shore, per LOOK), lays the paint
// texture over that, and marches the height texture toward the sun for shadows. Sky, water
// reflections and distance haze all come from one `atmosphere()` function in GLSL.
(function () {
  'use strict';

  const $ = (s) => document.querySelector(s);
  const stage = $('#stage'), view = $('#view'), ui = $('#ui');

  const N = 193;                 // height samples per side
  const SIZE = 240;              // world units per side
  const CELL = SIZE / (N - 1);
  const HMIN = -24, HMAX = 80;
  const PN = 256;                // paint texture size
  const DEEP = -20;              // where the land's rim sinks to
  const SAVE_KEY = 'dreamscape.save';
  const coarse = window.matchMedia && matchMedia('(pointer: coarse)').matches;

  const heights = new Float32Array(N * N);
  const paint = new Uint8Array(PN * PN * 4);

  const S = {                    // everything the console controls
    tool: 'raise', size: 0.35, power: 0.5, time: 16.6, water: 0.4256, haze: 0.15, clouds: 0.3, look: 0, pot: 0,
  };

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  function sstep(a, b, x) { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }

  // ---------------------------------------------------------------- noise (CPU side)

  let seed = 1;
  function hash2(x, y, s) {
    let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s, 974711);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y, s) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    const a = hash2(xi, yi, s), b = hash2(xi + 1, yi, s), c = hash2(xi, yi + 1, s), d = hash2(xi + 1, yi + 1, s);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y, s, oct) {
    let a = 0.5, f = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * vnoise(x * f, y * f, s + i * 31); norm += a; a *= 0.5; f *= 2.03; }
    return sum / norm;
  }
  function ridged(x, y, s, oct) {
    let a = 0.5, f = 1, sum = 0, norm = 0, w = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(vnoise(x * f, y * f, s + i * 17) * 2 - 1);
      n *= n;
      sum += n * a * w; norm += a;
      w = clamp(n * 1.7 + 0.15, 0, 1);      // valleys stay smooth, ridges get the detail
      a *= 0.5; f *= 2.1;
    }
    return sum / norm;
  }

  // ---------------------------------------------------------------- making a land

  function generate(kind) {
    seed = (Math.random() * 1e9) | 0;
    for (let z = 0; z < N; z++) {
      for (let x = 0; x < N; x++) {
        const u = x / (N - 1), v = z / (N - 1);
        const wx = fbm(u * 3 + 5.2, v * 3 + 1.3, seed + 7, 3) - 0.5;
        const wz = fbm(u * 3 + 9.1, v * 3 + 4.7, seed + 11, 3) - 0.5;
        const uu = u + wx * 0.16, vv = v + wz * 0.16;
        let h;
        if (kind === 'islands') {
          h = (fbm(uu * 3.3, vv * 3.3, seed, 5) - 0.47) * 95;
          if (h > 0) h = h * 0.6 + ridged(uu * 5, vv * 5, seed + 3, 4) * h * 1.1;
        } else if (kind === 'hills') {
          h = fbm(uu * 2.6, vv * 2.6, seed, 5) * 30 - 6;
        } else if (kind === 'canyon') {
          const t = fbm(uu * 2.1, vv * 2.1, seed, 5) * 5.2 - 0.6;
          const fl = Math.floor(t);
          h = (fl + sstep(0.3, 0.62, t - fl)) * 8.5 - 2 + fbm(uu * 12, vv * 12, seed + 2, 2) * 1.6;
          const river = Math.abs(fbm(uu * 1.5, vv * 1.5, seed + 9, 4) - 0.5);
          h -= sstep(0.075, 0.0, river) * 26;
        } else if (kind === 'flat') {
          h = 1.6 + fbm(uu * 6, vv * 6, seed, 3) * 0.9;
        } else {
          const big = fbm(uu * 1.6, vv * 1.6, seed + 3, 3);
          h = Math.pow(ridged(uu * 2.5, vv * 2.5, seed, 6), 1.45) * 78 * (0.25 + big * 1.2) - 4 + fbm(uu * 9, vv * 9, seed + 5, 3) * 4;
        }
        const dx = u - 0.5, dz = v - 0.5;
        const r = Math.sqrt(dx * dx + dz * dz) * 2 + (fbm(u * 4, v * 4, seed + 21, 3) - 0.5) * 0.4;
        heights[z * N + x] = clamp(lerp(DEEP, h, sstep(1.0, 0.6, r)), HMIN, HMAX);
      }
    }
    if (kind === 'mountains' || kind === 'canyon' || kind === 'islands') rain(9000, 0, 0, 0);
    paint.fill(0);
    markAll(); paintDirty = true;
  }

  // ---------------------------------------------------------------- erosion: rolling raindrops
  // Each drop runs downhill, picking soil up where it speeds up and dropping it where it
  // slows -- which is what cuts gullies and builds fans.

  const KERNEL = [];
  (function () {
    let sum = 0;
    for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
      const w = Math.max(0, 2.4 - Math.sqrt(dx * dx + dz * dz));
      if (w > 0) { KERNEL.push([dx, dz, w]); sum += w; }
    }
    KERNEL.forEach((k) => { k[2] /= sum; });
  })();

  function droplet(px, pz, sea) {
    const H = heights;
    let dx = 0, dz = 0, speed = 1, water = 1, sed = 0;
    for (let life = 0; life < 34; life++) {
      const xi = px | 0, zi = pz | 0;
      if (xi < 2 || zi < 2 || xi > N - 4 || zi > N - 4) break;
      const fx = px - xi, fz = pz - zi, i = zi * N + xi;
      const h00 = H[i], h10 = H[i + 1], h01 = H[i + N], h11 = H[i + N + 1];
      const gx = (h10 - h00) * (1 - fz) + (h11 - h01) * fz;
      const gz = (h01 - h00) * (1 - fx) + (h11 - h10) * fx;
      dx = dx * 0.08 - gx * 0.92; dz = dz * 0.08 - gz * 0.92;
      const len = Math.hypot(dx, dz);
      if (len < 1e-5) break;
      dx /= len; dz /= len;
      const hOld = h00 * (1 - fx) * (1 - fz) + h10 * fx * (1 - fz) + h01 * (1 - fx) * fz + h11 * fx * fz;
      px += dx; pz += dz;
      const xj = px | 0, zj = pz | 0;
      if (xj < 1 || zj < 1 || xj > N - 3 || zj > N - 3) break;
      const gxx = px - xj, gzz = pz - zj, j = zj * N + xj;
      const hNew = H[j] * (1 - gxx) * (1 - gzz) + H[j + 1] * gxx * (1 - gzz) + H[j + N] * (1 - gxx) * gzz + H[j + N + 1] * gxx * gzz;
      const dh = hNew - hOld;
      const cap = Math.max(-dh, 0.02) * speed * water * 1.3;
      if (sed > cap || dh > 0 || hNew < sea) {
        const dep = dh > 0 ? Math.min(dh, sed) : (hNew < sea ? sed : (sed - cap) * 0.3);
        sed -= dep;
        H[i] += dep * (1 - fx) * (1 - fz); H[i + 1] += dep * fx * (1 - fz);
        H[i + N] += dep * (1 - fx) * fz; H[i + N + 1] += dep * fx * fz;
        if (hNew < sea) break;
      } else {
        const er = Math.min((cap - sed) * 0.22, -dh);
        for (let k = 0; k < KERNEL.length; k++) {
          const kk = KERNEL[k];
          H[i + kk[0] + kk[1] * N] -= er * kk[2];
        }
        sed += er;
      }
      speed = Math.sqrt(Math.max(0.01, speed * speed - dh * 0.9));
      water *= 0.975;
    }
  }

  // count drops, over the whole land (r = 0) or inside a circle (grid units)
  function rain(count, gx, gz, r) {
    const sea = dry() ? -99 : level() - 1.5;
    for (let n = 0; n < count; n++) {
      let px, pz;
      if (r > 0) {
        const a = Math.random() * 6.2832, rr = Math.sqrt(Math.random()) * r;
        px = gx + Math.cos(a) * rr; pz = gz + Math.sin(a) * rr;
      } else { px = 3 + Math.random() * (N - 7); pz = 3 + Math.random() * (N - 7); }
      droplet(px, pz, sea);
    }
  }

  // ---------------------------------------------------------------- three.js scene

  const renderer = new THREE.WebGLRenderer({ canvas: view, antialias: !coarse, powerPreference: 'high-performance' });
  const gl2 = renderer.capabilities.isWebGL2;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 16 / 9, 1, 14000);

  // random-noise texture every shader's fbm reads from
  const noiseData = new Uint8Array(256 * 256 * 4);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = (hash2(i, i >>> 8, 5) * 256) | 0;
  const noiseTex = new THREE.DataTexture(noiseData, 256, 256, THREE.RGBAFormat, THREE.UnsignedByteType);
  noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping;
  noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter;
  noiseTex.needsUpdate = true;

  const half = new Uint16Array(N * N);
  const heightTex = gl2
    ? new THREE.DataTexture(half, N, N, THREE.RedFormat, THREE.HalfFloatType)
    : new THREE.DataTexture(new Uint8Array(4), 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;

  const paintTex = new THREE.DataTexture(paint, PN, PN, THREE.RGBAFormat, THREE.UnsignedByteType);
  paintTex.magFilter = paintTex.minFilter = THREE.LinearFilter;
  paintTex.needsUpdate = true;

  const V3 = () => ({ value: new THREE.Vector3() });
  const U = {
    uSun: V3(), uMoon: V3(), uLight: V3(), uLightCol: V3(), uAmbSky: V3(), uAmbGnd: V3(),
    uHaze: { value: 0.25 }, uClouds: { value: 0.4 }, uTime: { value: 0 }, uSteps: { value: 22 },
    uLevel: { value: 0 }, uDry: { value: 0 }, uGlow: { value: 0 }, uSnow: { value: 34 },
    uNoise: { value: noiseTex }, uHeight: { value: heightTex }, uPaint: { value: paintTex },
    uBrush: { value: new THREE.Vector4() },
    cLow: V3(), cLow2: V3(), cSteep: V3(), cHigh: V3(), cShore: V3(), cShallow: V3(), cDeep: V3(),
  };

  const COMMON = `
    #define SIZE 240.0
    #define GN 193.0
    uniform vec3 uSun, uMoon, uLight, uLightCol, uAmbSky, uAmbGnd;
    uniform float uHaze, uClouds, uTime, uSteps, uLevel, uDry, uGlow;
    uniform sampler2D uNoise, uHeight;
    const vec3 BR = vec3(0.19, 0.44, 1.0);        // how strongly air scatters red, green, blue

    float nz(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return texture2D(uNoise, (i + f + 0.5) / 256.0).r;
    }
    float fbm(vec2 p) {
      float a = 0.5, s = 0.0;
      for (int i = 0; i < 5; i++) { s += a * nz(p); p = mat2(1.6, 1.2, -1.2, 1.6) * p + 7.3; a *= 0.5; }
      return s / 0.97;
    }
    vec3 sunTint() { return exp(-BR * 0.30 / (max(uSun.y, 0.0) + 0.07)); }

    // sky colour in a direction: blue from scattering, reddened by how much air the
    // sunlight crossed, a warm glow round the sun, and a dark blue night
    vec3 atmosphere(vec3 rd) {
      float y = max(rd.y, 0.0);
      float mu = dot(rd, uSun);
      float day = smoothstep(-0.2, 0.1, uSun.y);
      float k = mix(0.07, 1.0, pow(1.0 - y, 3.0));
      vec3 tS = exp(-BR * 0.30 * k / (max(uSun.y, 0.0) + 0.07));
      vec3 scat = 1.0 - exp(-BR * 0.17 / (y + 0.09));
      vec3 col = scat * tS * (0.55 + 0.5 * mu * mu) * 2.0;
      col += vec3(0.02, 0.035, 0.09) * (1.0 - smoothstep(0.0, 0.35, uSun.y)) * (0.3 + y);
      float g = 0.8;
      float mie = (1.0 - g * g) / pow(1.0 + g * g - 2.0 * g * mu, 1.5);
      col += sunTint() * mie * 0.022 * (1.0 + 5.0 * pow(1.0 - y, 4.0)) * (0.6 + uHaze * 2.0);
      vec3 hz = sunTint() * 1.3 + vec3(0.2, 0.26, 0.36);
      col = mix(col, hz, uHaze * 0.85 * pow(1.0 - y, 5.0));
      col *= day;
      col += vec3(0.005, 0.010, 0.024) * (1.0 + 1.6 * pow(1.0 - y, 3.0));
      return col;
    }

    vec4 clouds(vec3 rd) {
      if (rd.y < 0.015 || uClouds < 0.02) return vec4(0.0);
      vec2 p = rd.xz / (rd.y + 0.16) * 2.4 + vec2(uTime * 0.012, uTime * 0.005);
      float d = fbm(p * 2.0);
      float th = mix(0.82, 0.3, uClouds);
      float a = smoothstep(th, th + 0.2, d);
      if (a < 0.003) return vec4(0.0);
      vec2 ld = uLight.xz / (length(uLight.xz) + 0.001);
      float d2 = fbm((p + ld * 0.09) * 2.0);
      float lit = clamp(0.62 + (d - d2) * 3.5, 0.0, 1.0) * mix(1.0, 0.5, smoothstep(th + 0.12, th + 0.45, d));
      vec3 col = uLightCol * 0.42 * lit + uAmbSky * 0.85 + vec3(0.004, 0.006, 0.012);
      return vec4(col, a * smoothstep(0.02, 0.3, rd.y));
    }

    vec3 tone(vec3 c) {
      c = (c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14);
      return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
    }
    vec3 fog(vec3 col, vec3 rd, float dist) {
      float f = 1.0 - exp(-dist * (0.0003 + uHaze * uHaze * 0.012));
      vec3 fd = normalize(vec3(rd.x, max(rd.y, 0.0) * 0.6 + 0.03, rd.z));
      return mix(col, atmosphere(fd), f);
    }
    vec2 huv(vec2 xz) { return ((xz / SIZE + 0.5) * (GN - 1.0) + 0.5) / GN; }

    // march the height map toward the light: 0 in shadow, 1 lit, soft at the edge
    float shadow(vec3 p) {
      if (uSteps < 1.0) return 1.0;
      float res = 1.0, t = 1.2;
      float lo = uSteps > 40.0 ? 0.8 : 1.7;
      for (int i = 0; i < 80; i++) {
        if (float(i) >= uSteps) break;
        vec3 q = p + uLight * t;
        if (q.y > 82.0 || abs(q.x) > SIZE * 1.6 || abs(q.z) > SIZE * 1.6) break;
        float d = q.y - texture2D(uHeight, huv(q.xz)).r + 0.45;
        if (d < 0.0) { res = 0.0; break; }
        res = min(res, 7.0 * d / t);
        t += clamp(d * 0.6, lo, 12.0);
      }
      res = clamp(res, 0.0, 1.0);
      return res * res * (3.0 - 2.0 * res);
    }
  `;

  const LAND_VERT = `
    varying vec3 vPos; varying vec3 vN;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vPos = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `;

  const LAND_FRAG = COMMON + `
    uniform sampler2D uPaint;
    uniform vec3 cLow, cLow2, cSteep, cHigh, cShore;
    uniform float uSnow;
    uniform vec4 uBrush;
    varying vec3 vPos; varying vec3 vN;
    void main() {
      vec3 n = normalize(vN);
      vec3 rdv = vPos - cameraPosition; float dist = length(rdv); vec3 rd = rdv / dist;
      float nA = fbm(vPos.xz * 0.06);
      float nB = fbm(vPos.xz * 0.8 + 31.0);
      float detail = 1.0 - smoothstep(120.0, 420.0, dist);
      float b0 = nz(vPos.xz * 2.3), bx = nz(vPos.xz * 2.3 + vec2(0.8, 0.0)), bz = nz(vPos.xz * 2.3 + vec2(0.0, 0.8));
      n = normalize(n + vec3(b0 - bx, 0.0, b0 - bz) * 0.9 * detail);
      float slope = 1.0 - n.y;
      float h = vPos.y + (nA - 0.5) * 10.0;

      vec3 flatC = mix(cLow, cLow2, smoothstep(0.3, 0.7, nA)) * (0.75 + 0.5 * nB);
      float strata = 0.88 + 0.10 * sin(vPos.y * 1.9 + nA * 16.0 + nB * 3.0) + (nB - 0.5) * 0.5;
      float rockAmt = smoothstep(0.16, 0.38, slope + (nB - 0.5) * 0.12);
      float snowAmt = smoothstep(uSnow - 3.0, uSnow + 5.0, h) * (1.0 - smoothstep(0.32, 0.6, slope));
      vec3 alb = mix(flatC, cSteep * strata, rockAmt);
      alb = mix(alb, cHigh * (0.92 + 0.16 * nB), snowAmt);
      float shore = (1.0 - uDry) * (1.0 - smoothstep(uLevel + 0.6, uLevel + 3.0, vPos.y + (nB - 0.5) * 2.0));
      alb = mix(alb, cShore * (0.85 + 0.3 * nB), shore * (1.0 - rockAmt * 0.6));

      vec3 emit = vec3(0.0);
      vec2 pu = vPos.xz / SIZE + 0.5;
      if (pu.x > 0.0 && pu.x < 1.0 && pu.y > 0.0 && pu.y < 1.0) {
        vec4 pc = texture2D(uPaint, pu + (vec2(nB, nA) - 0.5) * 0.006);
        float lava = smoothstep(0.85, 0.97, pc.r) * (1.0 - smoothstep(0.38, 0.5, pc.g)) * (1.0 - smoothstep(0.08, 0.2, pc.b)) * pc.a;
        alb = mix(alb, pow(pc.rgb, vec3(2.2)) * (0.8 + 0.4 * nB), pc.a);
        emit = vec3(1.0, 0.22, 0.02) * lava * (0.3 + 2.2 * nz(vPos.xz * 0.5 + uTime * 0.08)) * 0.9;
      }
      alb *= mix(1.0, 0.55, (1.0 - uDry) * (1.0 - smoothstep(uLevel - 1.2, uLevel + 0.4, vPos.y)));

      float sh = shadow(vPos + n * 0.9);
      float diff = max(dot(n, uLight), 0.0) * sh;
      vec3 amb = mix(uAmbGnd, uAmbSky, n.y * 0.5 + 0.5);
      vec3 col = alb * (uLightCol * diff + amb);
      vec3 hv = normalize(uLight - rd);
      col += uLightCol * pow(max(dot(n, hv), 0.0), 40.0) * 0.25 * snowAmt * sh;
      if (uGlow > 0.5 && uDry < 0.5) col += vec3(1.0, 0.3, 0.05) * 0.5 * exp(-max(vPos.y - uLevel, 0.0) * 0.35) * alb * 4.0;
      col += emit;
      col = fog(col, rd, dist);

      if (uBrush.w > 0.5) {
        float d = length(vPos.xz - uBrush.xy);
        float w = uBrush.z * 0.04 + dist * 0.004;
        float ring = 1.0 - smoothstep(0.0, w, abs(d - uBrush.z));
        float disc = (1.0 - smoothstep(uBrush.z * 0.2, uBrush.z, d)) * 0.1;
        col += vec3(1.0, 0.85, 0.4) * (ring * 1.3 + disc);
      }
      gl_FragColor = vec4(tone(col), 1.0);
    }
  `;

  const WATER_FRAG = COMMON + `
    uniform vec3 cShallow, cDeep;
    varying vec3 vPos; varying vec3 vN;
    float wh(vec2 p) { return nz(p * 0.9 + vec2(uTime * 0.35, uTime * 0.21)) + nz(p * 0.37 + vec2(-uTime * 0.27, uTime * 0.3)) * 1.6; }
    void main() {
      vec3 rdv = vPos - cameraPosition; float dist = length(rdv); vec3 rd = rdv / dist;
      vec2 p = vPos.xz;
      vec2 q = abs(p) / (SIZE * 0.5);
      float inside = 1.0 - smoothstep(0.9, 1.0, max(q.x, q.y));
      float d = max(mix(24.0, uLevel - texture2D(uHeight, huv(p)).r, inside), 0.0);

      if (uGlow > 0.5) {                               // a sea of lava
        float crust = fbm(p * 0.11 + uTime * 0.012) + 0.18 * nz(p * 0.5 - uTime * 0.05);
        float crack = 1.0 - smoothstep(0.0, 0.05, abs(crust - 0.55));
        float hot = max(smoothstep(0.62, 0.75, crust), crack);
        vec3 lava = mix(vec3(0.025, 0.018, 0.016), cShallow * 0.55 * (0.6 + 0.8 * nz(p * 0.3 + uTime * 0.2)), hot) + cDeep * 0.04 + cShallow * 0.35 * exp(-d * 0.8);
        gl_FragColor = vec4(tone(fog(lava, rd, dist)), 1.0);
        return;
      }
      float fade = 1.0 / (1.0 + dist * 0.012);
      float a0 = wh(p), ax = wh(p + vec2(0.4, 0.0)), az = wh(p + vec2(0.0, 0.4));
      vec3 n = normalize(vec3((a0 - ax) * 1.2 * fade, 1.0, (a0 - az) * 1.2 * fade));
      vec3 rf = reflect(rd, n); rf.y = abs(rf.y) + 0.02; rf = normalize(rf);
      vec3 sky = atmosphere(rf);
      vec4 cl = clouds(rf); sky = mix(sky, cl.rgb, cl.a);
      float fr = 0.03 + 0.97 * pow(1.0 - max(dot(-rd, n), 0.0), 5.0);
      float sh = shadow(vPos);
      vec3 lit = uLightCol * max(uLight.y, 0.0) * 0.35 * (0.4 + 0.6 * sh) + uAmbSky * 0.6;
      vec3 body = mix(cShallow, cDeep, 1.0 - exp(-d * 0.22)) * lit;
      vec3 col = mix(body, sky, fr);
      col += uLightCol * pow(max(dot(rf, uLight), 0.0), 200.0) * 4.0 * sh;
      float foam = (1.0 - smoothstep(0.0, 0.9, d + (nz(p * 1.3 + uTime * 0.3) - 0.5) * 0.8)) * inside;
      col = mix(col, lit * 0.9 + 0.04, foam * 0.7);
      float alpha = max(mix(1.0 - exp(-d * 0.55), 1.0, fr), foam * 0.7);
      gl_FragColor = vec4(tone(fog(col, rd, dist)), alpha);
    }
  `;

  const SKY_VERT = `
    varying vec3 vDir;
    void main() {
      vDir = position;
      gl_Position = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
      gl_Position.z = gl_Position.w;
    }
  `;
  const SKY_FRAG = COMMON + `
    varying vec3 vDir;
    void main() {
      vec3 rd = normalize(vDir);
      vec3 col = atmosphere(rd);
      float night = 1.0 - smoothstep(-0.32, -0.1, uSun.y);
      float up = smoothstep(-0.03, 0.02, rd.y);
      col += sunTint() * smoothstep(0.99925, 0.9997, dot(rd, uSun)) * 45.0 * up;
      float mm = dot(rd, uMoon);
      col += vec3(0.85, 0.9, 1.0) * smoothstep(0.9992, 0.9996, mm) * (0.75 + 0.5 * nz(rd.xy * 160.0)) * 1.5 * up;
      col += vec3(0.4, 0.5, 0.8) * pow(max(mm, 0.0), 260.0) * 0.12 * night;
      if (night > 0.01 && rd.y > 0.0) {
        vec2 sp = rd.xz / (rd.y + 0.4) * 80.0;
        vec2 ci = floor(sp);
        vec4 r = texture2D(uNoise, (ci + 0.5) / 256.0);
        float star = step(0.986, r.g) * (1.0 - smoothstep(0.05, 0.38, length(fract(sp) - 0.5 - (r.ba - 0.5) * 0.4)));
        col += vec3(0.9, 0.95, 1.0) * star * night * (0.5 + 0.9 * r.b) * (0.75 + 0.25 * sin(uTime * 3.0 + r.a * 40.0));
      }
      vec4 cl = clouds(rd);
      col = mix(col, cl.rgb, cl.a);
      gl_FragColor = vec4(tone(col), 1.0);
    }
  `;

  const landMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LAND_VERT, fragmentShader: LAND_FRAG, side: THREE.DoubleSide });
  const waterMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: LAND_VERT, fragmentShader: WATER_FRAG, transparent: true, depthWrite: false });
  const skyMat = new THREE.ShaderMaterial({ uniforms: U, vertexShader: SKY_VERT, fragmentShader: SKY_FRAG, side: THREE.BackSide, depthWrite: false });

  // the land mesh
  const pos = new Float32Array(N * N * 3), nrm = new Float32Array(N * N * 3);
  for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
    const i = (z * N + x) * 3;
    pos[i] = (x / (N - 1) - 0.5) * SIZE; pos[i + 2] = (z / (N - 1) - 0.5) * SIZE; nrm[i + 1] = 1;
  }
  const idx = new Uint32Array((N - 1) * (N - 1) * 6);
  for (let z = 0, k = 0; z < N - 1; z++) for (let x = 0; x < N - 1; x++) {
    const i = z * N + x;
    idx[k++] = i; idx[k++] = i + N; idx[k++] = i + 1;
    idx[k++] = i + 1; idx[k++] = i + N; idx[k++] = i + N + 1;
  }
  const landGeo = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(pos, 3), nrmAttr = new THREE.BufferAttribute(nrm, 3);
  landGeo.setAttribute('position', posAttr); landGeo.setAttribute('normal', nrmAttr);
  landGeo.setIndex(new THREE.BufferAttribute(idx, 1));
  const land = new THREE.Mesh(landGeo, landMat);
  land.frustumCulled = false;
  scene.add(land);

  // a skirt round the rim, so a raised edge shows a cliff and not a hole
  const rim = [];
  for (let x = 0; x < N - 1; x++) rim.push([x, 0, 0, -1]);
  for (let z = 0; z < N - 1; z++) rim.push([N - 1, z, 1, 0]);
  for (let x = N - 1; x > 0; x--) rim.push([x, N - 1, 0, 1]);
  for (let z = N - 1; z > 0; z--) rim.push([0, z, -1, 0]);
  const RN = rim.length;
  const spos = new Float32Array(RN * 6), snrm = new Float32Array(RN * 6), sidx = new Uint16Array(RN * 6);
  rim.forEach((r, k) => {
    for (let b = 0; b < 2; b++) {
      const i = (k + b * RN) * 3;
      spos[i] = (r[0] / (N - 1) - 0.5) * SIZE; spos[i + 1] = HMIN - 6; spos[i + 2] = (r[1] / (N - 1) - 0.5) * SIZE;
      snrm[i] = r[2]; snrm[i + 2] = r[3];
    }
    const k2 = (k + 1) % RN;
    sidx.set([k, k2, k + RN, k2, k2 + RN, k + RN], k * 6);
  });
  const skirtGeo = new THREE.BufferGeometry();
  const sposAttr = new THREE.BufferAttribute(spos, 3);
  skirtGeo.setAttribute('position', sposAttr); skirtGeo.setAttribute('normal', new THREE.BufferAttribute(snrm, 3));
  skirtGeo.setIndex(new THREE.BufferAttribute(sidx, 1));
  const skirt = new THREE.Mesh(skirtGeo, landMat);
  skirt.frustumCulled = false;
  scene.add(skirt);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMat);
  sky.frustumCulled = false; sky.renderOrder = 1;
  scene.add(sky);

  const flatGeo = new THREE.CircleGeometry(6000, 48);
  flatGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(flatGeo, waterMat);
  water.frustumCulled = false; water.renderOrder = 2;
  scene.add(water);
  const ground = new THREE.Mesh(flatGeo, landMat);     // the endless floor when there's no water
  ground.frustumCulled = false;
  scene.add(ground);

  // ---------------------------------------------------------------- heights -> mesh

  let dirty = null, paintDirty = false, saveAt = 0;
  function mark(x0, z0, x1, z1) {
    x0 = clamp(x0 | 0, 0, N - 1); z0 = clamp(z0 | 0, 0, N - 1); x1 = clamp(Math.ceil(x1), 0, N - 1); z1 = clamp(Math.ceil(z1), 0, N - 1);
    if (!dirty) dirty = [x0, z0, x1, z1];
    else { dirty[0] = Math.min(dirty[0], x0); dirty[1] = Math.min(dirty[1], z0); dirty[2] = Math.max(dirty[2], x1); dirty[3] = Math.max(dirty[3], z1); }
  }
  function markAll() { mark(0, 0, N - 1, N - 1); }

  function flush() {
    if (paintDirty) { paintTex.needsUpdate = true; paintDirty = false; saveAt = performance.now() + 1200; }
    if (!dirty) return;
    const x0 = Math.max(0, dirty[0] - 1), z0 = Math.max(0, dirty[1] - 1), x1 = Math.min(N - 1, dirty[2] + 1), z1 = Math.min(N - 1, dirty[3] + 1);
    const toHalf = THREE.DataUtils.toHalfFloat;
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const i = z * N + x, h = heights[i];
        pos[i * 3 + 1] = h;
        if (gl2) half[i] = toHalf(h);
        const l = heights[x > 0 ? i - 1 : i], r = heights[x < N - 1 ? i + 1 : i];
        const u = heights[z > 0 ? i - N : i], d = heights[z < N - 1 ? i + N : i];
        const nx = l - r, nz = u - d, ny = 2 * CELL;
        const inv = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);
        nrm[i * 3] = nx * inv; nrm[i * 3 + 1] = ny * inv; nrm[i * 3 + 2] = nz * inv;
      }
    }
    posAttr.needsUpdate = true; nrmAttr.needsUpdate = true;
    if (gl2) heightTex.needsUpdate = true;
    if (x0 === 0 || z0 === 0 || x1 === N - 1 || z1 === N - 1) {
      for (let k = 0; k < RN; k++) spos[k * 3 + 1] = heights[rim[k][1] * N + rim[k][0]];
      sposAttr.needsUpdate = true;
    }
    dirty = null;
    saveAt = performance.now() + 1200;
  }

  function hAt(wx, wz) {
    const gx = clamp((wx / SIZE + 0.5) * (N - 1), 0, N - 1.001), gz = clamp((wz / SIZE + 0.5) * (N - 1), 0, N - 1.001);
    const xi = gx | 0, zi = gz | 0, fx = gx - xi, fz = gz - zi, i = zi * N + xi;
    return heights[i] * (1 - fx) * (1 - fz) + heights[i + 1] * fx * (1 - fz) + heights[i + N] * (1 - fx) * fz + heights[i + N + 1] * fx * fz;
  }

  // ---------------------------------------------------------------- looks, paints, sky

  const LOOKS = [
    { name: 'ALPINE', low: '#4d7a2c', low2: '#7f8f3a', steep: '#6d675f', high: '#f4f7fb', shore: '#cdb98a', shallow: '#2f9aa0', deep: '#0b2f4f', snow: 34 },
    { name: 'DESERT', low: '#c98f4e', low2: '#dcae6c', steep: '#9a4a2a', high: '#ecd3a4', shore: '#e2c48c', shallow: '#3fa6a0', deep: '#0e3a52', snow: 50 },
    { name: 'TROPIC', low: '#2f8f3a', low2: '#79b33e', steep: '#3d3a38', high: '#a8c95a', shore: '#f3e6bf', shallow: '#35d0c0', deep: '#0a4a78', snow: 56 },
    { name: 'ARCTIC', low: '#e8eff6', low2: '#cfe0ee', steep: '#5d6f85', high: '#ffffff', shore: '#b9d4e6', shallow: '#4a9cc0', deep: '#06243e', snow: -99 },
    { name: 'VOLCANO', low: '#3a3533', low2: '#4a3a32', steep: '#1c1a1b', high: '#7a3a22', shore: '#241f1e', shallow: '#ff7a1a', deep: '#d42a05', snow: 44, glow: 1 },
    { name: 'CANDY', low: '#b56ad6', low2: '#e58ad0', steep: '#ff9ab8', high: '#c9fff0', shore: '#ffe9a8', shallow: '#5ff0d8', deep: '#3a2a9a', snow: 30 },
  ];
  const POTS = [
    ['GRASS', '#4f8a2e'], ['SAND', '#d9c08a'], ['ROCK', '#6b6661'], ['SNOW', '#f6f8fb'], ['LAVA', '#ff4d00'],
    ['RED', '#d9243a'], ['PURPLE', '#8a4fd6'], ['BLUE', '#2f7fe0'], ['YELLOW', '#ffd23a'], ['WIPE', null],
  ];
  function rgb(hex) { return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]; }
  function setLin(u, hex) { const c = rgb(hex); u.value.set(Math.pow(c[0] / 255, 2.2), Math.pow(c[1] / 255, 2.2), Math.pow(c[2] / 255, 2.2)); }

  function applyLook() {
    const L = LOOKS[S.look];
    setLin(U.cLow, L.low); setLin(U.cLow2, L.low2); setLin(U.cSteep, L.steep); setLin(U.cHigh, L.high);
    setLin(U.cShore, L.shore); setLin(U.cShallow, L.shallow); setLin(U.cDeep, L.deep);
    U.uSnow.value = L.snow; U.uGlow.value = L.glow ? 1 : 0;
  }

  const dry = () => S.water < 0.06;
  const level = () => (dry() ? -1 : lerp(-14, 22, (S.water - 0.06) / 0.94));
  function applyWater() {
    U.uDry.value = dry() ? 1 : 0; U.uLevel.value = level();
    water.visible = !dry(); ground.visible = dry();
  }

  function sunTint(sy) { const am = 0.30 / (Math.max(sy, 0) + 0.07); return [Math.exp(-0.19 * am), Math.exp(-0.44 * am), Math.exp(-am)]; }
  function applySky() {
    const th = (S.time - 6) / 24 * Math.PI * 2;
    const sun = U.uSun.value.set(Math.cos(th), Math.sin(th) * 0.88, Math.sin(th) * 0.47).normalize();
    const moon = U.uMoon.value.set(-Math.cos(th), -Math.sin(th) * 0.8 + 0.12, 0.45).normalize();
    const sy = sun.y, t = sunTint(sy), veil = 1 - S.clouds * S.clouds * 0.55;
    if (sy > -0.06) {
      const I = sstep(-0.06, 0.1, sy) * 3.4 * veil;
      U.uLight.value.copy(sun); U.uLightCol.value.set(t[0] * I, t[1] * I, t[2] * I);
    } else {
      const I = sstep(-0.06, -0.2, sy) * sstep(0, 0.15, moon.y) * 0.55 * veil;
      U.uLight.value.copy(moon); U.uLightCol.value.set(0.42 * I, 0.55 * I, 0.95 * I);
    }
    const day = sstep(-0.2, 0.1, sy), hi = sstep(0, 0.45, sy);
    U.uAmbSky.value.set(lerp(0.34, 0.17, hi) * day + 0.01, lerp(0.27, 0.28, hi) * day + 0.016, lerp(0.4, 0.5, hi) * day + 0.036);
    const a = U.uAmbSky.value, l = U.uLightCol.value;
    U.uAmbGnd.value.set(a.x * 0.35 + l.x * 0.07, a.y * 0.35 + l.y * 0.07, a.z * 0.35 + l.z * 0.07);
    U.uHaze.value = S.haze; U.uClouds.value = S.clouds;
  }

  // ---------------------------------------------------------------- camera and picking

  const cam = { yaw: 0.75, pitch: 0.3, dist: 235, tx: 0, ty: 8, tz: 0, gx: 0, gy: 8, gz: 0 };
  function placeCamera(dt) {
    const k = 1 - Math.exp(-dt * 6);
    cam.tx += (cam.gx - cam.tx) * k; cam.ty += (cam.gy - cam.ty) * k; cam.tz += (cam.gz - cam.tz) * k;
    cam.pitch = clamp(cam.pitch, 0.02, 1.5); cam.dist = clamp(cam.dist, 12, 620);
    const cp = Math.cos(cam.pitch);
    const p = camera.position.set(cam.tx + cam.dist * cp * Math.sin(cam.yaw), cam.ty + cam.dist * Math.sin(cam.pitch), cam.tz + cam.dist * cp * Math.cos(cam.yaw));
    const floor = Math.max(Math.abs(p.x) < SIZE / 2 && Math.abs(p.z) < SIZE / 2 ? hAt(p.x, p.z) : -99, level()) + 1.6;
    if (p.y < floor) p.y = floor;
    camera.lookAt(cam.tx, cam.ty, cam.tz);
    water.position.set(p.x, level(), p.z); ground.position.set(p.x, level(), p.z);
  }

  const ray = new THREE.Vector3(), hit = new THREE.Vector3();
  // where a screen point lands on the terrain (walks the ray over the height map)
  function pick(cx, cy) {
    const r = view.getBoundingClientRect();
    camera.updateMatrixWorld();
    ray.set((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1, 0.5).unproject(camera).sub(camera.position).normalize();
    const o = camera.position, hs = SIZE / 2;
    let t0 = 0, t1 = 1400;
    for (const [oc, dc] of [[o.x, ray.x], [o.z, ray.z]]) {
      if (Math.abs(dc) < 1e-6) { if (Math.abs(oc) > hs) return null; continue; }
      let a = (-hs - oc) / dc, b = (hs - oc) / dc;
      if (a > b) { const s = a; a = b; b = s; }
      t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    }
    if (t0 >= t1) return null;
    let prev = t0;
    for (let t = t0; t <= t1; t += CELL * 0.6) {
      const x = o.x + ray.x * t, y = o.y + ray.y * t, z = o.z + ray.z * t;
      if (y < hAt(x, z)) {
        let a = prev, b = t;
        for (let i = 0; i < 8; i++) { const m = (a + b) / 2; if (o.y + ray.y * m < hAt(o.x + ray.x * m, o.z + ray.z * m)) b = m; else a = m; }
        return hit.set(o.x + ray.x * b, o.y + ray.y * b, o.z + ray.z * b);
      }
      prev = t;
    }
    return null;
  }

  // ---------------------------------------------------------------- brushes

  const brushR = () => 4 + S.size * 34;
  const scratch = new Float32Array(N * N);
  let stroke = null;        // { x, y (client), target } while a brush is down

  function applyBrush(wx, wz, dt) {
    const r = brushR(), p = S.power, tool = S.tool;
    if (tool === 'paint') return paintAt(wx, wz, r, p, dt);
    const gx = (wx / SIZE + 0.5) * (N - 1), gz = (wz / SIZE + 0.5) * (N - 1), gr = r / CELL;
    if (tool === 'erode') {
      rain(Math.round((15 + p * 110) * dt * 60), gx, gz, gr);
      mark(gx - gr - 36, gz - gr - 36, gx + gr + 36, gz + gr + 36);
      return;
    }
    const x0 = Math.max(0, Math.floor(gx - gr)), x1 = Math.min(N - 1, Math.ceil(gx + gr));
    const z0 = Math.max(0, Math.floor(gz - gr)), z1 = Math.min(N - 1, Math.ceil(gz + gr));
    if (tool === 'smooth') {
      for (let z = Math.max(0, z0 - 1); z <= Math.min(N - 1, z1 + 1); z++) for (let x = Math.max(0, x0 - 1); x <= Math.min(N - 1, x1 + 1); x++) scratch[z * N + x] = heights[z * N + x];
    }
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = ((x - gx) * (x - gx) + (z - gz) * (z - gz)) / (gr * gr);
        if (d2 >= 1) continue;
        const w = (1 - d2) * (1 - d2), i = z * N + x;
        let h = heights[i];
        if (tool === 'raise') h += w * (6 + p * 50) * dt;
        else if (tool === 'dig') h -= w * (6 + p * 50) * dt;
        else if (tool === 'flat') h += (stroke.target - h) * Math.min(1, w * (1.5 + p * 10) * dt);
        else if (tool === 'rocky') h += w * (4 + p * 26) * dt * (ridged(x * 0.085, z * 0.085, seed + 77, 4) - 0.3) * 2;
        else if (tool === 'smooth') {
          const xa = x > 0 ? -1 : 0, xb = x < N - 1 ? 1 : 0, za = z > 0 ? -N : 0, zb = z < N - 1 ? N : 0;
          const avg = (scratch[i + xa] + scratch[i + xb] + scratch[i + za] + scratch[i + zb] +
            scratch[i + xa + za] + scratch[i + xb + za] + scratch[i + xa + zb] + scratch[i + xb + zb]) / 8;
          h += (avg - h) * Math.min(1, w * (3 + p * 22) * dt);
        }
        heights[i] = clamp(h, HMIN, HMAX);
      }
    }
    mark(x0, z0, x1, z1);
  }

  function paintAt(wx, wz, r, p, dt) {
    const px = (wx / SIZE + 0.5) * PN - 0.5, pz = (wz / SIZE + 0.5) * PN - 0.5, pr = r / SIZE * PN;
    const col = POTS[S.pot][1] ? rgb(POTS[S.pot][1]) : null;
    const x0 = Math.max(0, Math.floor(px - pr)), x1 = Math.min(PN - 1, Math.ceil(px + pr));
    const z0 = Math.max(0, Math.floor(pz - pr)), z1 = Math.min(PN - 1, Math.ceil(pz + pr));
    for (let z = z0; z <= z1; z++) {
      for (let x = x0; x <= x1; x++) {
        const d2 = ((x - px) * (x - px) + (z - pz) * (z - pz)) / (pr * pr);
        if (d2 >= 1) continue;
        const a = Math.min(1, (1 - d2) * (1 - d2) * (2 + p * 12) * dt), i = (z * PN + x) * 4, A = paint[i + 3];
        if (!col) { paint[i + 3] = Math.floor(A * (1 - a)); continue; }
        if (A < 6) { paint[i] = col[0]; paint[i + 1] = col[1]; paint[i + 2] = col[2]; }
        else {
          const m = Math.max(a, 0.02);
          paint[i] += Math.round((col[0] - paint[i]) * m); paint[i + 1] += Math.round((col[1] - paint[i + 1]) * m); paint[i + 2] += Math.round((col[2] - paint[i + 2]) * m);
        }
        paint[i + 3] = Math.min(255, Math.ceil(A + (255 - A) * a));
      }
    }
    paintDirty = true;
  }

  // ---------------------------------------------------------------- undo and saving

  const undoStack = [];
  function pushUndo(what) {
    undoStack.push({ h: what !== 'paint' ? heights.slice() : null, p: what !== 'land' ? paint.slice() : null });
    if (undoStack.length > 12) undoStack.shift();
  }
  function undo() {
    const u = undoStack.pop();
    if (!u) { toast('NOTHING TO UNDO'); return; }
    if (u.h) { heights.set(u.h); markAll(); }
    if (u.p) { paint.set(u.p); paintDirty = true; }
    rainJob = 0;
    toast('UNDO'); tick(330);
  }

  function b64(u8) { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000)); return btoa(s); }
  function unb64(str) { const s = atob(str), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
  function packPaint() {                         // runs of the same colour: count, r, g, b, a
    const out = [];
    for (let i = 0; i < paint.length;) {
      let c = 1;
      while (c < 255 && i + c * 4 < paint.length && paint[i + c * 4 + 3] === paint[i + 3] &&
        (paint[i + 3] === 0 || (paint[i + c * 4] === paint[i] && paint[i + c * 4 + 1] === paint[i + 1] && paint[i + c * 4 + 2] === paint[i + 2]))) c++;
      out.push(c, paint[i], paint[i + 1], paint[i + 2], paint[i + 3]);
      i += c * 4;
    }
    return new Uint8Array(out);
  }
  function save() {
    const q = new Uint16Array(N * N);
    for (let i = 0; i < q.length; i++) q[i] = Math.round((heights[i] - HMIN) / (HMAX - HMIN) * 65535);
    const data = { v: 1, n: N, seed, h: b64(new Uint8Array(q.buffer)), s: S, cam: { yaw: cam.yaw, pitch: cam.pitch, dist: cam.dist, x: cam.gx, y: cam.gy, z: cam.gz } };
    try {
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(Object.assign({ p: b64(packPaint()) }, data))); }
      catch (e) { localStorage.setItem(SAVE_KEY, JSON.stringify(data)); }     // too big with paint: keep the land
    } catch (e) { /* storage full or off: the land just isn't kept */ }
  }
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (!d || d.v !== 1 || d.n !== N) return false;
      const q = new Uint16Array(unb64(d.h).buffer);
      if (q.length !== N * N) return false;
      for (let i = 0; i < q.length; i++) heights[i] = q[i] / 65535 * (HMAX - HMIN) + HMIN;
      paint.fill(0);
      if (d.p) {
        const r = unb64(d.p);
        for (let i = 0, o = 0; i + 4 < r.length && o < paint.length; i += 5) {
          for (let c = 0; c < r[i] && o < paint.length; c++, o += 4) { paint[o] = r[i + 1]; paint[o + 1] = r[i + 2]; paint[o + 2] = r[i + 3]; paint[o + 3] = r[i + 4]; }
        }
      }
      seed = d.seed | 0;
      for (const k in S) if (d.s && typeof d.s[k] === typeof S[k]) S[k] = d.s[k];
      if (!TOOLS.some((t) => t[0] === S.tool)) S.tool = 'raise';
      S.look = clamp(S.look | 0, 0, LOOKS.length - 1); S.pot = clamp(S.pot | 0, 0, POTS.length - 1);
      if (d.cam) { cam.yaw = d.cam.yaw; cam.pitch = d.cam.pitch; cam.dist = d.cam.dist; cam.tx = cam.gx = d.cam.x; cam.ty = cam.gy = d.cam.y; cam.tz = cam.gz = d.cam.z; }
      markAll(); paintDirty = true;
      return true;
    } catch (e) { return false; }
  }

  // ---------------------------------------------------------------- sound (soft, made here)

  let actx = null;
  function tick(freq, len) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
      o.type = 'sine'; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + (len || 0.12));
      o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + (len || 0.12) + 0.02);
    } catch (e) { /* no sound is fine */ }
  }

  // ---------------------------------------------------------------- the console

  const TOOLS = [
    ['look', 'LOOK', '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'],
    ['raise', 'RAISE', '<path d="M2 21l6-9 4 5 2-3 8 7z"/><path d="M12 9V2M9 5l3-3 3 3"/>'],
    ['dig', 'DIG', '<path d="M2 13h4c1 7 11 7 12 0h4"/><path d="M12 3v8M9 8l3 3 3-3"/>'],
    ['smooth', 'SMOOTH', '<path d="M2 9c3-4 6 4 10 0s7-4 10 0M2 16c3-3 6 3 10 0s7-3 10 0"/>'],
    ['flat', 'FLAT', '<path d="M2 18h20M7 5v8M17 5v8M4.5 10.5L7 13l2.5-2.5M14.500 10.5L17 13l2.5-2.5"/>'],
    ['rocky', 'ROCKY', '<path d="M2 20l3-9 3 5 3-12 3 10 3-6 5 12z"/>'],
    ['erode', 'ERODE', '<path d="M12 2c3 4 5 6 5 8.500a5 5 0 0 1-10 0C7 8 9 6 12 2z"/><path d="M3 21c3-2 5 1 9-1s6 1 9-1"/>'],
    ['paint', 'PAINT', '<path d="M3 21c0-3 2-5 4-4s1 5-4 4z"/><path d="M9 15L19 3l2 2-10 12z"/>'],
  ];
  const LANDS = [
    ['mountains', 'MOUNTAINS', 'M2 28L14 8l6 9 6-13 12 24z'],
    ['islands', 'ISLANDS', 'M2 26c3-6 8-6 11 0zm14 0c2-10 9-10 12 0zm13 0c2-4 6-4 8 0z'],
    ['hills', 'HILLS', 'M2 28c5-14 10-14 15-4 5-12 12-12 21 4z'],
    ['canyon', 'CANYON', 'M2 28V10h13l2 16 3-16h18v18z'],
    ['flat', 'FLAT', 'M2 28v-5h36v5z'],
  ];

  const toolsEl = $('#tools');
  TOOLS.forEach((t) => {
    const b = document.createElement('button');
    b.className = 'peb'; b.dataset.tool = t[0];
    b.innerHTML = '<svg viewBox="0 0 24 24">' + t[2] + '</svg><span>' + t[1] + '</span>';
    b.addEventListener('pointerdown', () => { setTool(t[0]); tick(520); });
    toolsEl.appendChild(b);
  });
  function setTool(name) {
    S.tool = name;
    toolsEl.querySelectorAll('.peb').forEach((b) => b.classList.toggle('on', b.dataset.tool === name));
    ui.classList.toggle('painting', name === 'paint');
    U.uBrush.value.w = 0;
    saveAt = performance.now() + 1200;
  }

  const looksEl = $('#looks'), potsEl = $('#pots');
  LOOKS.forEach((L, i) => {
    const b = document.createElement('button');
    b.className = 'orb'; b.title = L.name;
    b.style.background = 'radial-gradient(circle at 50% 135%, ' + L.shallow + ' 0 44%, transparent 45%), linear-gradient(' +
      L.high + ' 0 26%, ' + L.steep + ' 30% 50%, ' + L.low + ' 56% 100%)';
    b.addEventListener('pointerdown', () => { S.look = i; applyLook(); pickOn(looksEl, i); toast(L.name); tick(440); saveAt = performance.now() + 1200; });
    looksEl.appendChild(b);
  });
  POTS.forEach((P, i) => {
    const b = document.createElement('button');
    b.className = 'orb pot' + (P[1] ? '' : ' wipe'); b.title = P[0];
    if (P[1]) b.style.background = P[1];
    b.addEventListener('pointerdown', () => { S.pot = i; pickOn(potsEl, i); toast(P[0]); tick(440); });
    potsEl.appendChild(b);
  });
  function pickOn(el, i) { Array.prototype.forEach.call(el.children, (c, k) => c.classList.toggle('on', k === i)); }

  // a control you drag: fn(e, dx, dy) while the finger is down
  function drag(el, fn, start) {
    let last = null;
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); last = e; if (start) start(e); fn(e, 0, 0); });
    el.addEventListener('pointermove', (e) => { if (last) { fn(e, e.clientX - last.clientX, e.clientY - last.clientY); last = e; } });
    const end = () => { last = null; };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  }
  function knob(el, key) {
    const set = () => el.style.setProperty('--v', S[key]);
    drag(el, (e, dx, dy) => { S[key] = clamp(S[key] + (dx - dy) / (el.clientWidth * 2.2), 0, 1); set(); saveAt = performance.now() + 1200; });
    set();
    return set;
  }
  function slider(el, key, after) {
    const groove = el.querySelector('.groove');
    const set = () => el.style.setProperty('--v', S[key]);
    drag(el, (e) => {
      const r = groove.getBoundingClientRect(), pad = r.height;
      S[key] = clamp((e.clientX - r.left - pad) / (r.width - pad * 2), 0, 1);
      set(); after(); saveAt = performance.now() + 1200;
    });
    set();
    return set;
  }
  const setKnobSize = knob($('#kSize'), 'size'), setKnobPower = knob($('#kPower'), 'power');
  slider($('#sWater'), 'water', applyWater);
  slider($('#sHaze'), 'haze', applySky);
  slider($('#sClouds'), 'clouds', applySky);

  // the sun dial: a little sky you drag the sun round. Left is sunrise, top is noon.
  const dial = $('#dial'), dc = dial.getContext('2d'), timeEl = $('#time'), playBtn = $('#play');
  let playing = false;
  function drawDial() {
    const R = 120, th = (S.time - 6) / 24 * Math.PI * 2, sy = Math.sin(th);
    const day = sstep(-0.25, 0.15, sy), glow = Math.exp(-sy * sy * 14) * sstep(-0.35, 0, sy);
    const mix3 = (a, b, t) => 'rgb(' + [0, 1, 2].map((i) => Math.round(lerp(a[i], b[i], t))).join(',') + ')';
    const top = [lerp(10, 40, day), lerp(14, 110, day), lerp(40, 215, day)];
    const low = [lerp(22, 150, day), lerp(28, 200, day), lerp(64, 240, day)];
    dc.clearRect(0, 0, 240, 240);
    dc.save(); dc.beginPath(); dc.arc(R, R, 118, 0, 6.2832); dc.clip();
    const g = dc.createLinearGradient(0, 0, 0, 150);
    g.addColorStop(0, mix3(top, [70, 60, 110], glow * 0.6)); g.addColorStop(1, mix3(low, [255, 140, 60], glow));
    dc.fillStyle = g; dc.fillRect(0, 0, 240, 240);
    if (day < 0.6) {
      dc.fillStyle = 'rgba(255,255,255,' + (0.9 * (1 - day / 0.6)) + ')';
      for (let i = 0; i < 26; i++) dc.fillRect(20 + hash2(i, 3, 9) * 200, 10 + hash2(i, 7, 9) * 120, 2, 2);
    }
    const orbAt = (a, rad, c1, c2, r) => {
      const x = R - Math.cos(a) * rad, y = R + 18 - Math.sin(a) * rad;
      const og = dc.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
      og.addColorStop(0, c1); og.addColorStop(1, c2);
      dc.fillStyle = og; dc.beginPath(); dc.arc(x, y, r, 0, 6.2832); dc.fill();
      return [x, y];
    };
    const s = orbAt(th, 84, '#fffbe0', sy > 0.25 ? '#ffd23a' : '#ff8a2a', 19);
    dc.strokeStyle = 'rgba(255,220,120,0.55)'; dc.lineWidth = 3;
    for (let i = 0; i < 8; i++) { const a = i * 0.7854; dc.beginPath(); dc.moveTo(s[0] + Math.cos(a) * 23, s[1] + Math.sin(a) * 23); dc.lineTo(s[0] + Math.cos(a) * 29, s[1] + Math.sin(a) * 29); dc.stroke(); }
    orbAt(th + Math.PI, 84, '#ffffff', '#aab4d0', 14);
    // the ground hides whichever one is down
    dc.fillStyle = mix3([14, 18, 26], [44, 74, 40], day);
    dc.beginPath(); dc.moveTo(0, 240); dc.lineTo(0, 142);
    dc.bezierCurveTo(50, 122, 80, 150, 120, 138); dc.bezierCurveTo(160, 126, 200, 150, 240, 134); dc.lineTo(240, 240); dc.fill();
    dc.fillStyle = 'rgba(0,0,0,0.25)'; dc.fillRect(0, 180, 240, 60);
    dc.restore();
    dc.strokeStyle = 'rgba(255,255,255,0.5)'; dc.lineWidth = 2;
    for (let i = 0; i < 24; i++) { const a = i / 24 * 6.2832, r0 = i % 6 ? 111 : 104; dc.beginPath(); dc.moveTo(R + Math.cos(a) * r0, R + Math.sin(a) * r0); dc.lineTo(R + Math.cos(a) * 117, R + Math.sin(a) * 117); dc.stroke(); }
    const hh = Math.floor(S.time), mm = Math.floor((S.time - hh) * 60);
    timeEl.textContent = ((hh + 11) % 12 + 1) + ':' + (mm < 10 ? '0' : '') + mm + (hh < 12 ? ' AM' : ' PM');
  }
  drag(dial, (e) => {
    const r = dial.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width * 240, y = (e.clientY - r.top) / r.height * 240;
    S.time = ((6 + Math.atan2(138 - y, 120 - x) / (Math.PI * 2) * 24) + 24) % 24;
    applySky(); drawDial(); saveAt = performance.now() + 1200;
  }, () => setPlaying(false));
  function setPlaying(on) {
    playing = on; playBtn.classList.toggle('on', on);
    playBtn.innerHTML = on ? '<svg viewBox="0 0 24 24"><path d="M6 4h4v16H6zM14 4h4v16h-4z"/></svg>' : '<svg viewBox="0 0 24 24"><path d="M7 4l14 8-14 8z"/></svg>';
  }
  playBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setPlaying(!playing); tick(600); });

  // new land / rain / undo
  const newSheet = $('#newSheet');
  LANDS.forEach((L) => {
    const b = document.createElement('button');
    b.className = 'plate';
    b.innerHTML = '<svg viewBox="0 0 40 30"><path d="' + L[2] + '" fill="#3b2a08"/></svg><span>' + L[1] + '</span>';
    b.addEventListener('click', () => {
      newSheet.hidden = true;
      pushUndo('both'); rainJob = 0;
      generate(L[0]);
      cam.gx = cam.gz = 0; cam.gy = 8;
      toast('NEW ' + L[1]); tick(660, 0.3);
    });
    newSheet.appendChild(b);
  });
  $('#aNew').addEventListener('click', () => { newSheet.hidden = !newSheet.hidden; tick(520); });
  let rainJob = 0;
  $('#aRain').addEventListener('click', () => { if (!rainJob) pushUndo('land'); rainJob = 36000; toast('RAIN IS CARVING THE LAND...'); tick(260, 0.4); });
  $('#aUndo').addEventListener('click', undo);

  const toastEl = $('#toast');
  let toastT = 0;
  function toast(msg) { toastEl.textContent = msg; toastEl.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.remove('show'), 1400); }

  // ---------------------------------------------------------------- touching the land

  const ptrs = new Map();
  let orbit = null, pinch = null, hover = null;
  function endStroke() { stroke = null; if (!hover) U.uBrush.value.w = 0; }
  view.addEventListener('contextmenu', (e) => e.preventDefault());
  view.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    newSheet.hidden = true;
    try { view.setPointerCapture(e.pointerId); } catch (err) { /* fine */ }
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 2) {
      if (stroke) { endStroke(); undo(); }             // the second finger means "turn", not "draw"
      orbit = null;
      const p = Array.from(ptrs.values());
      pinch = { d: Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y), x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    } else if (ptrs.size === 1) {
      if (e.button === 2 || e.button === 1 || S.tool === 'look') orbit = { x: e.clientX, y: e.clientY, moved: 0, t: performance.now(), tap: S.tool === 'look' && e.button === 0 };
      else {
        pushUndo(S.tool === 'paint' ? 'paint' : 'land');
        const h = pick(e.clientX, e.clientY);
        stroke = { x: e.clientX, y: e.clientY, target: h ? h.y : 0, got: !!h };
      }
    }
  });
  view.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') hover = { x: e.clientX, y: e.clientY }; return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pinch && ptrs.size === 2) {
      const q = Array.from(ptrs.values());
      const d = Math.hypot(q[0].x - q[1].x, q[0].y - q[1].y), mx = (q[0].x + q[1].x) / 2, my = (q[0].y + q[1].y) / 2;
      if (d > 10 && pinch.d > 10) cam.dist *= pinch.d / d;
      cam.yaw -= (mx - pinch.x) * 0.006; cam.pitch += (my - pinch.y) * 0.005;
      pinch.d = d; pinch.x = mx; pinch.y = my;
    } else if (orbit) {
      orbit.moved += Math.abs(dx) + Math.abs(dy);
      cam.yaw -= dx * 0.006; cam.pitch += dy * 0.005;
    } else if (stroke) { stroke.x = e.clientX; stroke.y = e.clientY; }
    if (e.pointerType === 'mouse') hover = { x: e.clientX, y: e.clientY };
  });
  function pointerEnd(e) {
    if (!ptrs.delete(e.pointerId)) return;
    if (orbit && orbit.tap && orbit.moved < 8 && performance.now() - orbit.t < 350) {
      const h = pick(e.clientX, e.clientY);
      if (h) { cam.gx = h.x; cam.gy = h.y; cam.gz = h.z; cam.dist = Math.min(cam.dist, 130); tick(700); }
    }
    if (ptrs.size < 2) pinch = null;
    if (ptrs.size === 0) { orbit = null; if (stroke) endStroke(); }
  }
  view.addEventListener('pointerup', pointerEnd);
  view.addEventListener('pointercancel', pointerEnd);
  view.addEventListener('pointerleave', () => { hover = null; if (!stroke) U.uBrush.value.w = 0; });
  view.addEventListener('wheel', (e) => { e.preventDefault(); cam.dist *= Math.exp(e.deltaY * 0.0012); }, { passive: false });

  const keys = {};
  window.addEventListener('keydown', (e) => {
    if (e.target && e.target.tagName === 'INPUT') return;
    keys[e.key] = true;
    const k = e.key.toLowerCase();
    if (!darkroom.hidden) { if (k === 'escape' || k === 'b' || k === 'r') closeDarkroom(); return; }
    if (k >= '1' && k <= '8') setTool(TOOLS[+k - 1][0]);
    else if (k === 'z') undo();
    else if (k === 'r') startRender();
    else if (k === 'h') ui.classList.toggle('hide');
    else if (k === ' ') { setPlaying(!playing); e.preventDefault(); }
    else if (k === '[') { S.size = clamp(S.size - 0.08, 0, 1); setKnobSize(); }
    else if (k === ']') { S.size = clamp(S.size + 0.08, 0, 1); setKnobSize(); }
    if (k.indexOf('arrow') === 0) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => { keys[e.key] = false; });

  let padStroke = false;
  function padAndKeys(dt) {
    const P = window.Pad360, B = P && P.BTN;
    let ox = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), oy = (keys.ArrowDown ? 1 : 0) - (keys.ArrowUp ? 1 : 0);
    let zoom = (keys['-'] || keys._ ? 1 : 0) - (keys['='] || keys['+'] ? 1 : 0);
    if (P) {
      P.poll();
      if (!darkroom.hidden) { if (P.pressed(B.B) || P.pressed(B.START) || P.pressed(B.A)) closeDarkroom(); return; }
      ox += P.dx(); oy += P.dy();
      zoom += (P.down(B.LB) ? 1 : 0) - (P.down(B.RB) ? 1 : 0);
      if (P.pressed(B.X) || P.pressed(B.Y)) {
        const i = TOOLS.findIndex((t) => t[0] === S.tool);
        setTool(TOOLS[(i + (P.pressed(B.Y) ? 1 : TOOLS.length - 1)) % TOOLS.length][0]); toast(S.tool.toUpperCase());
      }
      if (P.pressed(B.B)) undo();
      if (P.pressed(B.START)) startRender();
      const r = view.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height * 0.55;
      if (P.pressed(B.A) && S.tool !== 'look' && !stroke) {
        pushUndo(S.tool === 'paint' ? 'paint' : 'land');
        const h = pick(cx, cy);
        stroke = { x: cx, y: cy, target: h ? h.y : 0 }; padStroke = true;
      }
      if (padStroke && stroke) { stroke.x = cx; stroke.y = cy; if (!P.down(B.A)) { padStroke = false; endStroke(); } }
    }
    cam.yaw += ox * dt * 1.4; cam.pitch += oy * dt * 0.9; cam.dist *= Math.exp(zoom * dt * 1.2);
  }

  // ---------------------------------------------------------------- sizing and quality

  let quality = 0, basePR = 1, slowFrames = 0, frames = 0;
  function applyQuality() {
    U.uSteps.value = gl2 ? [22, 12, 0, 0][quality] : 0;
    renderer.setPixelRatio(basePR * (quality === 3 ? 0.7 : 1));
  }
  function resize() {
    const r = stage.getBoundingClientRect();
    const w = Math.max(50, stage.clientWidth), h = Math.max(50, stage.clientHeight);
    const tall = h > w;
    ui.classList.toggle('tall', tall);
    const u = tall ? Math.min(w / 100, h / 150) : Math.min(h / 100, w / 172);
    ui.style.fontSize = u + 'px'; darkroom.style.fontSize = u + 'px';
    basePR = Math.min(window.devicePixelRatio || 1, coarse ? 1.25 : 1.5);
    applyQuality();
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.fov = tall ? 62 : 50; camera.updateProjectionMatrix();
    void r;
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);

  // ---------------------------------------------------------------- RENDER and the darkroom
  // The picture is drawn once at a bigger size with long, fine shadows, then shown
  // "developing" in passes from blocky to sharp.

  const darkroom = $('#darkroom'), photo = $('#photo'), pc = photo.getContext('2d');
  const shot = document.createElement('canvas'), small = document.createElement('canvas');
  let dev = null;
  function startRender() {
    if (!darkroom.hidden) return;
    tick(880, 0.25);
    flush();
    const aspect = camera.aspect, maxTex = renderer.capabilities.maxTextureSize || 4096;
    let pw = coarse ? 1280 : 1920, ph = Math.round(pw / aspect);
    if (ph > pw) { ph = coarse ? 1280 : 1920; pw = Math.round(ph * aspect); }
    const ss = Math.min(coarse ? 1.5 : 2, (maxTex - 64) / Math.max(pw, ph));
    const oldSteps = U.uSteps.value, oldBrush = U.uBrush.value.w;
    U.uSteps.value = gl2 ? 72 : 0; U.uBrush.value.w = 0;
    renderer.setPixelRatio(1); renderer.setSize(Math.round(pw * ss), Math.round(ph * ss), false);
    renderer.render(scene, camera);
    shot.width = pw; shot.height = ph;
    const sc = shot.getContext('2d');
    sc.imageSmoothingQuality = 'high';
    sc.drawImage(view, 0, 0, pw, ph);
    U.uSteps.value = oldSteps; U.uBrush.value.w = oldBrush;
    resize();

    photo.width = pw; photo.height = ph;
    const sw = stage.clientWidth, sh = stage.clientHeight, k = Math.min(sw * 0.84 / pw, sh * 0.66 / ph);
    photo.style.width = Math.round(pw * k) + 'px'; photo.style.height = Math.round(ph * k) + 'px';
    pc.fillStyle = '#000'; pc.fillRect(0, 0, pw, ph);
    darkroom.hidden = false;
    $('#savePic').disabled = true;
    dev = { pass: 0, row: 0, blocks: [48, 16, 6, 2, 1] };
    prepPass();
  }
  function prepPass() {
    const b = dev.blocks[dev.pass];
    small.width = Math.ceil(shot.width / b); small.height = Math.ceil(shot.height / b);
    small.getContext('2d').drawImage(shot, 0, 0, small.width, small.height);
    dev.row = 0;
  }
  function develop(dt) {
    if (!dev) return;
    const b = dev.blocks[dev.pass], rows = small.height;
    const n = Math.max(1, Math.round(rows * dt / 0.55));
    pc.imageSmoothingEnabled = false;
    const r0 = dev.row, r1 = Math.min(rows, r0 + n);
    pc.drawImage(small, 0, r0, small.width, r1 - r0, 0, r0 * b, small.width * b, (r1 - r0) * b);
    if (b > 1 && r1 < rows) { pc.fillStyle = 'rgba(255,220,140,0.9)'; pc.fillRect(0, r1 * b, shot.width, Math.max(2, shot.height / 300)); }
    dev.row = r1;
    if (r1 >= rows) {
      dev.pass++;
      if (dev.pass >= dev.blocks.length) { finishDev(); return; }
      prepPass();
    }
  }
  function finishDev() {
    dev = null;
    pc.drawImage(shot, 0, 0);
    $('#savePic').disabled = false;
    tick(1040, 0.5);
  }
  photo.addEventListener('click', () => { if (dev) finishDev(); });
  function closeDarkroom() { dev = null; darkroom.hidden = true; last = performance.now(); }
  $('#backPic').addEventListener('click', closeDarkroom);
  $('#savePic').addEventListener('click', () => {
    shot.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a'), d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = 'dreamscape-' + d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() + '-' + d.getHours() + d.getMinutes() + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    }, 'image/png');
  });
  $('#renderBtn').addEventListener('click', startRender);

  // ---------------------------------------------------------------- go

  window.DreamscapeDebug = { S, U, cam, applySky: () => { applySky(); drawDial(); }, applyWater, applyLook, generate, startRender };
  if (!load()) generate('mountains');
  setTool(S.tool); pickOn(looksEl, S.look); pickOn(potsEl, S.pot);
  setKnobSize(); setKnobPower();
  ['sWater', 'sHaze', 'sClouds'].forEach((id, i) => $('#' + id).style.setProperty('--v', [S.water, S.haze, S.clouds][i]));
  applyLook(); applyWater(); applySky(); drawDial();
  resize();
  saveAt = 0;

  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
    last = now;
    padAndKeys(dt);
    if (!darkroom.hidden) { develop(dt); return; }

    if (playing) { S.time = (S.time + dt * 1.6) % 24; applySky(); drawDial(); }
    placeCamera(dt);

    const pt = stroke || (hover && S.tool !== 'look' && !orbit && !pinch ? hover : null);
    if (pt) {
      const h = pick(pt.x, pt.y);
      if (h) {
        U.uBrush.value.set(h.x, h.z, brushR(), 1);
        if (stroke) {
          if (!stroke.got) { stroke.target = h.y; stroke.got = true; }
          applyBrush(h.x, h.z, dt);
        }
      } else if (!stroke) U.uBrush.value.w = 0;
    } else U.uBrush.value.w = 0;

    if (rainJob > 0) {
      const n = Math.min(rainJob, coarse ? 900 : 2200);
      rain(n, 0, 0, 0); rainJob -= n; markAll();
      if (rainJob <= 0) { toast('ALL DONE'); tick(520, 0.3); }
    }
    flush();
    if (saveAt && now > saveAt && !stroke && !rainJob) { saveAt = 0; save(); }

    U.uTime.value = now / 1000;
    renderer.render(scene, camera);

    // drop the shadow detail, then the sharpness, if this device can't keep up
    frames++;
    if (raw > 0.045 && !stroke && !rainJob) slowFrames++;
    if (frames >= 90) {
      if (slowFrames > 55 && quality < 3) { quality++; applyQuality(); renderer.setSize(stage.clientWidth, stage.clientHeight, false); }
      frames = 0; slowFrames = 0;
    }
  }
  requestAnimationFrame(loop);
})();
