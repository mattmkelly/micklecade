// Boom Boom Band -- a rhythm game for MickleCade. Notes slide down a neon highway onto a row
// of drum pads; hit each pad as its note lands. Streaks build a multiplier and fire energy
// waves across the stage.
//
// One IIFE, in sections:
//   Setup · Audio engine · Kits · Backing band · Songs · Chart builder ·
//   Conductor (clock + scheduler) · Players · Input · Judge · FX (waves, particles) ·
//   Stage drawing · Screens · Save · Debug · Boot
//
// TIMING RULES (do not bend these):
//   - The AudioContext clock is the only clock. Song time = audio time - songStart - latency.
//     Nothing about notes or judging comes from setTimeout, frame counts or frame deltas.
//   - Backing music is scheduled ahead (25 ms tick, 120 ms window) with exact start(time).
//   - The highway is a real 3D road seen through a perspective camera. A note's depth z on
//     the road is computed from song time every frame (linear in time); only its projection
//     onto the screen speeds up as it comes close.
//   - A hit is judged at the input event's own timeStamp, converted to audio time with an
//     offset re-sampled every frame -- never at the time the frame runs. Controller hits
//     (polled) take the frame's time. The pad sound plays at once, on the event.
//
// Room for later phases: notes carry `kind` (hold / golden later), players are an array
// (2 players later), every input route ends in hit() / release(), kits return a handle with
// release(time) for held notes, and beatTime() is the one place a tempo map would go.
(function () {
  'use strict';

  // =========================================================================== Setup
  const W = 480, H = 270;
  const canvas = document.getElementById('game');
  const ctx = HiRes.setup(canvas, W, H, (c) => {
    c.textBaseline = 'middle';
    c.lineJoin = 'round';
    c.lineCap = 'round';
  });

  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  // eye-candy clock (particles, banners, idle bobbing) -- never used for notes or judging
  const fxNow = () => performance.now() / 1000;

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, Math.max(0, r), 0, TAU); }
  function text(str, x, y, font, color, align) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align || 'center';
    ctx.fillText(str, x, y);
  }
  function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  // hue (degrees) -> '#rrggbb', snapped to 15-degree steps so glow sprites can be cached
  function hueHex(h) {
    h = ((Math.round(h / 15) * 15) % 360 + 360) % 360;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const v = 0.6 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1));
      return Math.round(v * 255).toString(16).padStart(2, '0');
    };
    return '#' + f(0) + f(8) + f(4);
  }
  // tiny seeded random (mulberry32) -- golden notes and crowd layouts stay put between plays
  function seeded(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

  // =========================================================================== Audio engine
  // One AudioContext, made on the first tap or key. Everything runs through a master gain and
  // a compressor. A "target" bundles where voices go, so the debug tools can render a kit
  // into an OfflineAudioContext with exactly the same code.
  let actx = null;
  let A = null;          // current target: { ctx, master, kit, band, noise }
  let liveVoices = 0;
  let liveTarget = null; // the real context's target (A is swapped briefly for offline renders)
  const MAX_VOICES = 24; // the backing band gives way above this; the player's hits never do
  const bandNodes = new Set();

  function ensureAudio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { actx = new AC({ latencyHint: 'interactive' }); } catch (e) { actx = new AC(); }
      A = makeTarget(actx, actx.destination);
      liveTarget = A;
    }
    if (actx.state === 'suspended' && !C.paused) actx.resume();
    return actx;
  }

  // Sound is tuned to be easy on the ears in a family room: everything passes a high-shelf
  // cut and a gentle low-pass (no hiss or sizzle), a soft compressor keeps peaks down, and a
  // small room reverb rounds off the synth voices. The master level is the SOUND setting.
  const VOLUMES = [0.3, 0.55, 0.85];          // QUIET, MEDIUM, LOUD
  const VOLUME_NAMES = ['QUIET', 'MEDIUM', 'LOUD'];
  function makeTarget(c, dest) {
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -20;
    comp.knee.value = 18;
    comp.ratio.value = 3;
    comp.attack.value = 0.005;
    comp.release.value = 0.25;
    const shelf = c.createBiquadFilter();
    shelf.type = 'highshelf';
    shelf.frequency.value = 4500;
    shelf.gain.value = -6;
    const warm = c.createBiquadFilter();
    warm.type = 'lowpass';
    warm.frequency.value = 9000;
    warm.Q.value = 0.5;
    const master = c.createGain();
    master.gain.value = VOLUMES[save.volume];
    master.connect(shelf);
    shelf.connect(warm);
    warm.connect(comp);
    comp.connect(dest);
    // a small room: a short burst of decaying noise as the impulse
    const verb = c.createConvolver();
    const ir = c.createBuffer(2, Math.floor(c.sampleRate * 0.8), c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    }
    verb.buffer = ir;
    const wet = c.createGain();
    wet.gain.value = 0.16;
    verb.connect(wet);
    wet.connect(master);
    const kit = c.createGain();
    kit.gain.value = 0.9;
    kit.connect(master);
    kit.connect(verb);
    const band = c.createGain();
    band.gain.value = 0.42;
    band.connect(master);
    band.connect(verb);
    // one shared second of white noise for every drum
    const len = Math.floor(c.sampleRate);
    const noise = c.createBuffer(1, len, c.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return { ctx: c, master, kit, band, noise };
  }

  function startVoice(src, dest, t, stopAt, offset) {
    liveVoices++;
    const isBand = dest === A.band && A.ctx === actx;
    if (isBand) bandNodes.add(src);
    src.onended = () => { liveVoices--; bandNodes.delete(src); };
    src.start(t, offset || 0);
    src.stop(stopAt);
  }
  const full = (dest) => dest === A.band && liveVoices >= MAX_VOICES;

  // one oscillator through attack + exponential decay; o: { to, sweep, attack, detune, filter, ff, ffTo, q }
  function tone(dest, type, freq, t, dur, vol, o) {
    o = o || {};
    if (full(dest)) return null;
    const c = A.ctx;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + (o.sweep || dur));
    if (o.detune) osc.detune.value = o.detune;
    const g = c.createGain();
    const a = o.attack || 0.003;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
    let node = osc;
    if (o.filter) {
      const f = c.createBiquadFilter();
      f.type = o.filter;
      f.frequency.setValueAtTime(o.ff, t);
      if (o.ffTo) f.frequency.exponentialRampToValueAtTime(o.ffTo, t + dur);
      if (o.q) f.Q.value = o.q;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    startVoice(osc, dest, t, t + dur + 0.03);
    return { osc, g };
  }

  // a burst of the shared noise through one filter
  function noiseHit(dest, t, dur, vol, ftype, freq, q) {
    if (full(dest)) return null;
    const c = A.ctx;
    const src = c.createBufferSource();
    src.buffer = A.noise;
    const f = c.createBiquadFilter();
    f.type = ftype;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    // a random spot in the buffer so repeated hits don't sound identical
    startVoice(src, dest, t, t + dur + 0.03, Math.random() * 0.5);
    return { src, g };
  }

  // silence every backing voice still waiting to play or ringing (pause, jump, quit)
  function stopBand() {
    if (!actx) return;
    bandNodes.forEach((n) => { try { n.stop(0); } catch (e) { /* already stopped */ } });
    bandNodes.clear();
  }

  // =========================================================================== Kits
  // Each kit is one function: kit.play(lane, laneCount, pitch, time, velocity[, dest]).
  // Pitched kits return a handle with release(time), for hold notes in a later phase.
  const DRUM = {
    kick(dest, t, v) {
      tone(dest, 'sine', 140, t, 0.4, 0.9 * v, { to: 48, sweep: 0.12 });
      noiseHit(dest, t, 0.01, 0.1 * v, 'bandpass', 1800, 1);
    },
    snare(dest, t, v) {   // more drum body, less hiss
      noiseHit(dest, t, 0.15, 0.32 * v, 'bandpass', 1500, 0.9);
      tone(dest, 'triangle', 200, t, 0.12, 0.5 * v, { to: 160 });
      tone(dest, 'sine', 330, t, 0.06, 0.18 * v, { to: 250 });
    },
    hat(dest, t, v) { noiseHit(dest, t, 0.03, 0.14 * v, 'bandpass', 6500, 1.2); },
    tom(dest, t, v) {
      tone(dest, 'sine', 170, t, 0.32, 0.8 * v, { to: 105, sweep: 0.2 });
      noiseHit(dest, t, 0.012, 0.08 * v, 'bandpass', 2000, 1);
    },
    lowTom(dest, t, v) {
      tone(dest, 'sine', 120, t, 0.38, 0.85 * v, { to: 72, sweep: 0.22 });
      noiseHit(dest, t, 0.012, 0.07 * v, 'bandpass', 1600, 1);
    },
    hiTom(dest, t, v) {
      tone(dest, 'sine', 230, t, 0.26, 0.7 * v, { to: 150, sweep: 0.16 });
      noiseHit(dest, t, 0.01, 0.06 * v, 'bandpass', 2200, 1);
    },
    crash(dest, t, v) {   // a soft wash, not a hiss
      noiseHit(dest, t, 0.9, 0.16 * v, 'bandpass', 5000, 0.6);
      noiseHit(dest, t, 0.5, 0.1 * v, 'bandpass', 3000, 0.8);
    },
    stick(dest, t, v) {   // a woodblock tock for the count-in
      tone(dest, 'sine', 1050, t, 0.05, 0.32 * v, { to: 900 });
      tone(dest, 'sine', 2100, t, 0.02, 0.06 * v);
    },
    shaker(dest, t, v) { noiseHit(dest, t, 0.05, 0.1 * v, 'bandpass', 5000, 1.4); },
    rim(dest, t, v) {
      tone(dest, 'triangle', 880, t, 0.04, 0.16 * v, { to: 760 });
      noiseHit(dest, t, 0.015, 0.08 * v, 'bandpass', 2500, 2);
    },
  };
  // The player's pads are all drums with a body -- no hi-hat or crash under a kid's finger:
  // pure-noise cymbals banged over and over are the harshest sound a game can make.
  // (The backing band still plays a soft hat.)
  const CLASSIC_LANES = {
    3: ['kick', 'snare', 'tom'],
    4: ['kick', 'snare', 'tom', 'hiTom'],
    5: ['kick', 'lowTom', 'snare', 'tom', 'hiTom'],
  };

  // 0 at middle C, rising to 1 an octave and a half up: how much to tame a high note
  function highTilt(pitch) { return clamp((pitch - 60) / 18, 0, 1); }

  function handle(voices) {
    return {
      release(t) {
        voices.forEach((v) => {
          if (!v) return;
          v.g.gain.cancelScheduledValues(t);
          v.g.gain.setTargetAtTime(0.0001, t, 0.04);
        });
      },
    };
  }

  const KITS = [
    {
      id: 'CLASSIC', name: 'CLASSIC KIT', type: 'drums', color: '#ff4fd8',
      play(lane, n, pitch, t, vel, dest) {
        DRUM[CLASSIC_LANES[n][lane]](dest || A.kit, t, vel * 1.1);   // drums sit a little lower than pitched kits
        return null;
      },
    },
    {
      id: 'TOMS', name: 'TOM-TOMS', type: 'drums', color: '#ff9a3d',
      play(lane, n, pitch, t, vel, dest) {
        dest = dest || A.kit;
        // one tuning per lane, low drum on the left
        const f = 82 * Math.pow(2, (n > 1 ? lane / (n - 1) : 0.5) * 1.5);
        tone(dest, 'sine', f * 1.7, t, 0.5, 0.9 * vel, { to: f, sweep: 0.07 });
        tone(dest, 'triangle', f * 2.02, t, 0.12, 0.16 * vel, { to: f * 1.5 });
        noiseHit(dest, t, 0.015, 0.1 * vel, 'bandpass', 2000, 1);
        return null;
      },
    },
    {
      id: 'STEEL', name: 'STEEL DRUMS', type: 'pitched', color: '#4ff0ff',
      play(lane, n, pitch, t, vel, dest) {
        dest = dest || A.kit;
        const f = mtof(pitch), k = highTilt(pitch);
        vel *= 1 - k * 0.35;
        const atk = 0.004 + k * 0.004;
        return handle([
          tone(dest, 'sine', f, t, 0.65, 0.5 * vel, { attack: atk, detune: -4 }),
          tone(dest, 'sine', f * 2, t, 0.4, 0.22 * vel * (1 - k * 0.6), { attack: atk, detune: 5 }),
          tone(dest, 'sine', f * 3, t, 0.18, 0.08 * vel * (1 - k * 0.9), { attack: atk }),
        ]);
      },
    },
    {
      id: 'PIANO', name: 'PIANO', type: 'pitched', color: '#ffe14f',
      play(lane, n, pitch, t, vel, dest) {
        dest = dest || A.kit;
        const f = mtof(pitch), k = highTilt(pitch);
        vel *= 1 - k * 0.3;
        return handle([
          tone(dest, 'triangle', f, t, 1.1, 0.42 * vel,
            { attack: 0.006, detune: -6, filter: 'lowpass', ff: Math.min(5000, f * (7 - k * 3)), ffTo: f * 1.5 }),
          tone(dest, 'triangle', f, t, 1.0, 0.24 * vel,
            { attack: 0.006, detune: 7, filter: 'lowpass', ff: Math.min(4000, f * (5 - k * 2)), ffTo: f * 1.3 }),
          tone(dest, 'sine', f * 2, t, 0.5, 0.06 * vel * (1 - k * 0.7), { attack: 0.005 }),
        ]);
      },
    },
  ];
  // How hard a tap sounds. Kids bang on pads: a stray tap (no note near it) is a little soft,
  // and when taps come thick and fast they get softer still, so mashing is never louder than
  // playing. Taps that hit a note stay strong so playing the song always sounds full.
  function makeMashGuard() {
    const recent = [];
    return {
      velocity(t, claimed) {
        while (recent.length && recent[0] < t - 0.6) recent.shift();
        recent.push(t);
        const rate = recent.length / 0.6;               // taps per second lately
        const ease = clamp(1 - (rate - 5) * 0.07, 0.3, 1);
        return claimed ? Math.max(0.8, ease) : 0.6 * ease;
      },
    };
  }
  const mashGuard = makeMashGuard();
  // the results card's count-up: a soft rising marimba blip (k = 0..1 through the count)
  function scoreTick(at, k) {
    const steps = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];
    tone(A.kit, 'sine', mtof(64 + steps[Math.min(steps.length - 1, Math.floor(k * steps.length))]), at, 0.08, 0.06, { attack: 0.003 });
  }

  // songs name kits from the full set; until those kits exist they borrow a close one
  const KIT_STANDIN = { BELLS: 'STEEL', XYLOPHONE: 'STEEL', BONGOS: 'TOMS', '8-BIT': 'PIANO' };
  function kitById(id) {
    return KITS.find((k) => k.id === id) || KITS.find((k) => k.id === KIT_STANDIN[id]) || KITS[0];
  }

  // =========================================================================== Backing band
  // A style is drum, bass and chord patterns asked once per step (1/sub of a beat).
  // pos = beat within the bar (0, 0.5, 1 ... or thirds for sub 3).
  const STYLES = {
    LULLABY: {
      drums(pos) {
        if (pos === 0) return [['kick', 0.45], ['shaker', 0.6]];
        return [['shaker', pos % 1 === 0 ? 0.6 : 0.3]];
      },
      bass(pos, bpb) { return pos === 0 ? [0, bpb * 0.95] : null; },     // [semitones over root, beats]
      chord(pos, bpb) { return pos === 0 ? { beats: bpb, voice: 'pad' } : null; },
      guide: 'sine',
    },
    MARCH: {
      drums(pos) {
        const out = [];
        if (pos === 0 || pos === 2) out.push(['kick', 0.8]);
        if (pos === 1 || pos === 3) out.push(['snare', 0.65]);
        if (pos % 1 === 0.5) out.push(['snare', 0.16]);
        return out;
      },
      bass(pos) { return pos % 1 === 0 ? [pos % 2 === 0 ? 0 : 7, 0.8] : null; },
      chord(pos) { return pos === 1 || pos === 3 ? { beats: 0.6, voice: 'pluck' } : null; },
      guide: 'triangle',
    },
    FUNK: {
      drums(pos) {
        const out = [];
        if (pos === 0 || pos === 1.5 || pos === 2.5) out.push(['kick', 0.85]);
        if (pos === 1 || pos === 3) out.push(['snare', 0.75]);
        if (pos % 0.5 === 0) out.push(['hat', pos % 1 === 0 ? 0.45 : 0.25]);
        return out;
      },
      bass(pos) {
        const pat = { 0: [0, 0.4], 0.5: [12, 0.25], 1.5: [0, 0.3], 2: [7, 0.4], 2.5: [12, 0.25], 3.5: [10, 0.25] };
        return pat[pos] || null;
      },
      chord(pos) { return pos === 1 || pos === 3 ? { beats: 0.25, voice: 'pluck' } : null; },
      guide: 'triangle',
    },
    ISLAND: {
      // fits a lilting 6/8 (sub 3) as well as 4/4
      drums(pos, bpb, sub) {
        const frac = pos % 1;
        if (frac < 1e-6) return [['kick', pos === 0 ? 0.8 : 0.55]];
        return sub === 3 ? [['rim', 0.5]] : [['shaker', 0.45], ['rim', frac === 0.5 ? 0.45 : 0]];
      },
      bass(pos) { return pos % 1 < 1e-6 ? [pos === 0 ? 0 : 7, 0.8] : null; },
      chord(pos, bpb, sub) { return pos % 1 > 1e-6 ? { beats: 0.9 / sub, voice: 'pluck' } : null; },
      guide: 'sine',
    },
  };

  function bassNote(at, midi, dur) {
    tone(A.band, 'triangle', mtof(midi), at, Math.max(0.15, dur), 0.55,
      { attack: 0.01, filter: 'lowpass', ff: 900, ffTo: 300 });
  }
  function chordNotes(at, ch, dur, voice) {
    ch.tones.forEach((m) => {
      if (voice === 'pad') tone(A.band, 'triangle', mtof(m), at, Math.max(0.3, dur), 0.09, { attack: 0.12 });
      else tone(A.band, 'triangle', mtof(m), at, Math.max(0.12, dur), 0.12, { attack: 0.006 });
    });
  }
  function guideNote(at, midi, dur, type) {
    tone(A.band, type, mtof(midi), at, clamp(dur, 0.12, 0.9), 0.22, { attack: 0.01 });
  }

  // every backing event of a song, in song seconds (count-in clicks sit before zero)
  function buildBacking(S, kit) {
    const ev = [];
    const style = STYLES[S.style] || STYLES.LULLABY;
    const bpb = S.bpb, sub = S.sub, spb = bpb * sub;
    for (let i = 0; i < bpb; i++) {
      ev.push({ t: beatTime(S, i - bpb), count: true, play: (at) => DRUM.stick(A.band, at, i === 0 ? 1 : 0.75) });
    }
    const steps = Math.round(S.beats * sub);
    for (let s = 0; s < steps; s++) {
      const beat = s / sub, t = beatTime(S, beat);
      const pos = (s % spb) / sub;
      const ch = chordAt(S, beat);
      style.drums(pos, bpb, sub).forEach(([v, vel]) => {
        if (vel > 0) ev.push({ t, play: (at) => DRUM[v](A.band, at, vel) });
      });
      const b = style.bass(pos, bpb, sub);
      if (b) ev.push({ t, play: (at) => bassNote(at, ch.bass + b[0], b[1] * S.beatDur) });
      const c = style.chord(pos, bpb, sub);
      if (c) ev.push({ t, play: (at) => chordNotes(at, ch, c.beats * S.beatDur, c.voice) });
    }
    // drum kits get the melody played quietly as a guide; pitched kits play it themselves
    if (kit.type === 'drums') {
      S.notes.forEach((n) => {
        if (n.midi == null) return;
        ev.push({ t: beatTime(S, n.beat), guide: true, play: (at) => guideNote(at, n.midi, n.dur * S.beatDur * 0.9, style.guide) });
      });
    }
    // a big finish on the downbeat after the last bar
    const home = chordAt(S, 0);
    ev.push({
      t: beatTime(S, S.beats),
      play: (at) => {
        DRUM.crash(A.band, at, 0.8);
        DRUM.kick(A.band, at, 0.9);
        bassNote(at, home.bass, 1.4);
        chordNotes(at, home, 1.6, 'pad');
      },
    });
    ev.sort((a, b) => a.t - b.t);
    return ev;
  }

  // =========================================================================== Songs
  // Songs are data: one lead line ("pitch:beats" tokens, '-' is a rest, '|' is just for
  // reading) plus chords. Every chart is derived from the lead. A song plays its tune once
  // through -- no repeats. (`repeat` stays in the loader for generated grooves later.)
  // bpb = beats per bar (default 4); sub = steps per beat (2 = eighths, 3 = a lilting 6/8).
  const SONGS = [
    {
      id: 'twinkle', title: 'TWINKLE TWINKLE', bpm: 100, key: 'C', style: 'LULLABY', kit: 'BELLS',
      lead: 'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 |' +
            'G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 | G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 |' +
            'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 | F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2',
      chords: 'C:4 F:2 C:2 | F:2 C:2 G:2 C:2 | C:2 F:2 C:2 G:2 | C:2 F:2 C:2 G:2 | C:4 F:2 C:2 | F:2 C:2 G:2 C:2',
    },
    {
      id: 'mary', title: 'MARY HAD A LITTLE LAMB', bpm: 116, key: 'C', style: 'MARCH', kit: 'XYLOPHONE',
      lead: 'E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:2 | D4:1 D4:1 D4:2 E4:1 G4:1 G4:2 |' +
            'E4:1 D4:1 C4:1 D4:1 E4:1 E4:1 E4:1 E4:1 | D4:1 D4:1 E4:1 D4:1 C4:4',
      chords: 'C:8 | G:4 C:4 | C:8 | G:4 C:4',
    },
    {
      id: 'macdonald', title: 'OLD MACDONALD', bpm: 126, key: 'G', style: 'FUNK', kit: 'CLASSIC',
      lead: 'G4:1 G4:1 G4:1 D4:1 | E4:1 E4:1 D4:2 | B4:1 B4:1 A4:1 A4:1 | G4:3 D4:1 |' +
            'G4:1 G4:1 G4:1 D4:1 | E4:1 E4:1 D4:2 | B4:1 B4:1 A4:1 A4:1 | G4:4 |' +
            'D4:0.5 D4:0.5 G4:1 G4:1 G4:1 | D4:0.5 D4:0.5 G4:1 G4:2 |' +
            'G4:0.5 G4:0.5 G4:1 G4:0.5 G4:0.5 G4:1 | G4:0.5 G4:0.5 G4:0.5 G4:0.5 G4:1 G4:1 |' +
            'G4:1 G4:1 G4:1 D4:1 | E4:1 E4:1 D4:2 | B4:1 B4:1 A4:1 A4:1 | G4:4',
      chords: 'G:4 C:2 G:2 G:2 D:2 G:4 | G:4 C:2 G:2 G:2 D:2 G:4 | G:16 | G:4 C:2 G:2 G:2 D:2 G:4',
    },
    {
      id: 'rowboat', title: 'ROW ROW ROW YOUR BOAT', bpm: 66, key: 'C', style: 'ISLAND', kit: 'STEEL',
      bpb: 2, sub: 3,
      lead: 'C4:1 C4:1 | C4:2/3 D4:1/3 E4:1 | E4:2/3 D4:1/3 E4:2/3 F4:1/3 | G4:2 |' +
            'C5:1/3 C5:1/3 C5:1/3 G4:1/3 G4:1/3 G4:1/3 | E4:1/3 E4:1/3 E4:1/3 C4:1/3 C4:1/3 C4:1/3 |' +
            'G4:2/3 F4:1/3 E4:2/3 D4:1/3 | C4:2',
      chords: 'C:12 G:2 C:2',
    },
  ];

  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function parseDur(s) {
    if (s.indexOf('/') >= 0) { const p = s.split('/'); return parseFloat(p[0]) / parseFloat(p[1]); }
    return parseFloat(s);
  }
  function parsePitch(p) {
    const m = /^([A-G])(#|b)?(-?\d)$/.exec(p);
    if (!m) return null;
    return 12 * (parseInt(m[3], 10) + 1) + PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  }
  function tokens(str) { return str.replace(/\|/g, ' ').split(/\s+/).filter(Boolean); }
  function parseChord(name) {
    const m = /^([A-G])(#|b)?(m?)(7?)$/.exec(name);
    const root = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const third = m[3] ? 3 : 4;
    const tones = [0, third, 7].concat(m[4] ? [10] : []).map((i) => 55 + ((root + i - 7 + 24) % 12));
    return { tones, bass: 36 + root };
  }

  // turn a song's text into beats and pitches (once, at load)
  function prepareSong(def) {
    const S = Object.assign({ bpb: 4, sub: 2, repeat: 1 }, def);
    S.beatDur = 60 / S.bpm;
    const lead = [], chords = [];
    let beat = 0, cbeat = 0;
    for (let r = 0; r < S.repeat; r++) {
      tokens(def.lead).forEach((tk) => {
        const [p, d] = tk.split(':');
        const dur = parseDur(d);
        lead.push({ beat, dur, midi: p === '-' ? null : parsePitch(p) });
        beat += dur;
      });
      tokens(def.chords).forEach((tk) => {
        const [name, d] = tk.split(':');
        const dur = parseDur(d);
        chords.push(Object.assign({ beat: cbeat, dur }, parseChord(name)));
        cbeat += dur;
      });
    }
    S.notes = lead;
    S.chordList = chords;
    S.beats = Math.round(beat * 1000) / 1000;
    S.keyPc = PC[S.key[0]] + (S.key[1] === '#' ? 1 : S.key[1] === 'b' ? -1 : 0);
    return S;
  }
  function chordAt(S, beat) {
    const list = S.chordList;
    for (let i = list.length - 1; i >= 0; i--) if (list[i].beat <= beat + 1e-6) return list[i];
    return list[0];
  }
  // beats -> song seconds. The one place a tempo map (speed-ups, practice speed) goes.
  function beatTime(S, beat) { return beat * S.beatDur; }

  // a lane's note from the song's major pentatonic, so a stray tap never sounds wrong
  const PENT_LANES = { 3: [0, 4, 7], 4: [0, 2, 4, 7], 5: [0, 2, 4, 7, 9] };
  function strayPitch(S, lane, n) { return 60 + ((S.keyPc + 6) % 12) - 6 + PENT_LANES[n][lane]; }

  // =========================================================================== Chart builder
  const DIFFS = [
    { name: 'EASY', lanes: 3, travel: 2.2, win: [0.07, 0.13, 0.2] },
    { name: 'MEDIUM', lanes: 4, travel: 1.8, win: [0.05, 0.1, 0.16] },
    { name: 'HARD', lanes: 5, travel: 1.4, win: [0.05, 0.1, 0.16] },
  ];

  function mkNote(t, src, lane, midi, chord) {
    // kind: 'tap' now; 'hold' and golden flags slot in here later
    return { t, beat: src.beat, dur: src.dur, lane, midi, kind: 'tap', chord: !!chord, state: 0, judge: -1, flash: 0 };
  }

  function buildChart(S, d) {
    const n = DIFFS[d].lanes;
    const onGrid = (b, g) => Math.abs(b / g - Math.round(b / g)) < 1e-3;
    let src = S.notes.filter((x) => x.midi != null);
    // thinning: Easy keeps notes on the beat, Medium keeps the eighth (or 6/8) grid, Hard all
    if (d === 0) src = src.filter((x) => onGrid(x.beat, 1));
    else if (d === 1) src = src.filter((x) => onGrid(x.beat, 1 / S.sub));
    if (d === 0) {   // Easy: at least 400 ms between notes
      const out = [];
      let last = -9;
      src.forEach((x) => { const t = beatTime(S, x.beat); if (t - last >= 0.4 - 1e-6) { out.push(x); last = t; } });
      src = out;
    }
    // lanes from the pitch contour, re-centred every phrase (2 bars) so every lane gets used;
    // the same pitch keeps the same lane inside a phrase
    const phraseBeats = S.bpb * 2;
    const groups = [];
    src.forEach((x) => {
      const p = Math.floor(x.beat / phraseBeats + 1e-6);
      (groups[p] = groups[p] || []).push(x);
    });
    const notes = [];
    groups.forEach((list) => {
      if (!list) return;
      const pitches = Array.from(new Set(list.map((x) => x.midi))).sort((a, b) => a - b);
      const k = pitches.length;
      const laneOf = (m) => {
        const r = pitches.indexOf(m);
        if (k === 1) return Math.floor(n / 2);
        if (k <= n) return Math.round(r * (n - 1) / (k - 1));
        return Math.min(n - 1, Math.floor(r * n / k));
      };
      list.forEach((x) => {
        const lane = laneOf(x.midi), t = beatTime(S, x.beat);
        notes.push(mkNote(t, x, lane, x.midi));
        // Hard: phrase starts and long notes become two-pad chords (the partner plays a fifth)
        if (d === 2 && (onGrid(x.beat, phraseBeats) || x.dur >= 2)) {
          const other = lane < n - 1 ? lane + 1 : lane - 1;
          notes.push(mkNote(t, x, other, x.midi + (other > lane ? 7 : -5), true));
        }
      });
    });
    notes.sort((a, b) => a.t - b.t || a.lane - b.lane);
    return notes;
  }

  // =========================================================================== Conductor
  const C = {
    on: false, S: null, d: 0, D: DIFFS[0], kit: KITS[0], lanes: 3,
    notes: [], first: 0, backing: [], ptr: 0, songStart: 0, end: 0,
    paused: false, resuming: false, pausedAt: 0, why: '', resumeTo: null, countBeat: 0.5,
  };
  // audio time minus performance time, re-sampled every frame. currentTime moves in blocks,
  // so the largest recent sample is the truest; it leaks down slowly to follow clock drift.
  let clockOff = null;
  const clockStats = { min: 1, max: -1, n: 0 };
  const schedStats = { minLead: 1, late: 0, n: 0 };

  let clockAt = 0;
  function sampleClock() {
    if (!actx || actx.state !== 'running') { clockOff = null; return; }
    const p = performance.now() / 1000;
    const s = actx.currentTime - p;
    // leak 5 ms per second of real time (not per frame: screens run at 60-240 Hz)
    if (clockOff === null || Math.abs(s - clockOff) > 0.08) clockOff = s;
    else clockOff = Math.max(s, clockOff - 0.005 * Math.min(0.1, p - clockAt));
    clockAt = p;
    if (C.on && !C.paused) {
      const d = audioNow() - actx.currentTime;
      clockStats.min = Math.min(clockStats.min, d);
      clockStats.max = Math.max(clockStats.max, d);
      clockStats.n++;
    }
  }
  function audioNow() { return clockOff === null ? actx.currentTime : performance.now() / 1000 + clockOff; }
  function latency() {
    if (save.latencyMs != null) return save.latencyMs / 1000;
    return actx ? (actx.outputLatency || actx.baseLatency || 0) : 0;
  }
  // song position the player is hearing right now
  function songNow() {
    if (!C.on) return 0;
    if (C.paused || C.resuming) return C.pausedAt - latency();
    return audioNow() - C.songStart - latency();
  }
  // song position of an input event, from its own timeStamp
  function eventSongTime(e) {
    const pnow = performance.now();
    let ts = e && e.timeStamp;
    if (!(ts > 0) || Math.abs(ts - pnow) > 1000) ts = pnow;   // very old browsers used epoch times
    if (clockOff === null) return songNow() - (pnow - ts) / 1000;
    return ts / 1000 + clockOff - C.songStart - latency();
  }

  function startSong(si, d, kitId) {
    if (!ensureAudio()) return;
    stopBand();
    const S = PREPARED[si];
    C.S = S;
    C.si = si;
    C.d = d;
    C.D = DIFFS[d];
    C.lanes = C.D.lanes;
    C.kit = kitById(kitId);
    C.notes = buildChart(S, d);
    C.first = 0;
    C.backing = buildBacking(S, C.kit);
    C.ptr = 0;
    C.end = beatTime(S, S.beats);
    C.countBeat = clamp(S.beatDur, 0.45, 0.75);
    C.paused = false;
    C.resuming = false;
    C.resumeTo = null;
    C.songStart = actx.currentTime + 0.3 + S.bpb * S.beatDur;   // one bar of count-in first
    C.on = true;
    C.log = [];
    C.taps = [];     // debug: every hit() call as [lane, songTime]
    C.waves = [];    // debug: streaks that fired a wave
    clockStats.min = 1; clockStats.max = -1; clockStats.n = 0;
    schedStats.minLead = 1; schedStats.late = 0; schedStats.n = 0;
    players.length = 0;
    players.push(newPlayer());
    resetFx();
    state = 'play';
  }

  // the lookahead scheduler: every 25 ms, start everything due in the next 120 ms at its exact time
  function schedule() {
    if (!C.on || C.paused || C.resuming || !actx || actx.state !== 'running') return;
    const nowA = actx.currentTime, horizon = nowA + 0.12;
    while (C.ptr < C.backing.length) {
      const e = C.backing[C.ptr];
      const at = C.songStart + e.t;
      if (at > horizon) break;
      C.ptr++;
      if (at < nowA - 0.01) { schedStats.late++; continue; }   // too late to be in time: skip it
      schedStats.minLead = Math.min(schedStats.minLead, at - nowA);
      schedStats.n++;
      e.play(Math.max(at, nowA));
    }
  }
  setInterval(schedule, 25);

  function pauseSong(why) {
    if (!C.on || C.paused || !actx) return;
    // keep the furthest-back position if a resume was still counting in
    C.pausedAt = C.resuming ? C.pausedAt : actx.currentTime - C.songStart;
    C.paused = true;
    C.resuming = false;
    C.why = why;
    stopBand();
    players.forEach((p) => { p.down = []; });
    actx.suspend();
  }

  // back in after a pause: a 3-2-1 of stick clicks, then the song carries on where it stopped
  function resumeSong() {
    if (!C.on || !C.paused || C.resuming) return;
    C.paused = false;
    C.resuming = true;
    actx.resume().then(() => {
      if (!C.resuming) return;   // paused again while waking up
      clockOff = null;
      const beat = C.countBeat;
      const fromStart = C.pausedAt < 0;   // paused during the opening count-in: do it again
      const target = Math.max(C.pausedAt, 0);
      const lead = fromStart ? C.S.bpb * C.S.beatDur : 3 * beat;
      C.songStart = actx.currentTime + 0.15 + lead - target;
      if (fromStart) {
        C.ptr = 0;
      } else {
        C.ptr = C.backing.findIndex((e) => !e.count && e.t >= target - 1e-4);
        if (C.ptr < 0) C.ptr = C.backing.length;
        for (let k = 3; k >= 1; k--) DRUM.stick(A.band, C.songStart + target - k * beat, k === 3 ? 1 : 0.75);
        C.resumeTo = target;
      }
      C.resuming = false;
    });
  }

  function quitSong() {
    stopBand();
    C.on = false;
    C.paused = false;
    C.resuming = false;
    if (actx && actx.state === 'suspended') actx.resume();
  }

  // pause when the tab is hidden and when the ☰ menu opens
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pauseSong('tab');
    else if (C.paused && C.why === 'tab') {
      if (menuOpen()) C.why = 'menu';
      else resumeSong();
    }
  });
  const menuOpen = () => !!(window.MickleMenu && window.MickleMenu.isOpen());
  function checkMenuPause() {
    const open = menuOpen();
    if (open && C.on && !C.paused && state === 'play') pauseSong('menu');
    else if (!open && C.paused && C.why === 'menu' && !document.hidden) resumeSong();
  }

  // =========================================================================== Players
  // An array so 2 players can slot in later; only players[0] exists for now.
  const players = [];
  function newPlayer() {
    return {
      score: 0, streak: 0, bestStreak: 0, counts: [0, 0, 0], shield: false,
      down: [],   // lanes held right now (hold notes later)
    };
  }
  function multOf(streak) { return streak >= 50 ? 5 : streak >= 30 ? 4 : streak >= 20 ? 3 : streak >= 10 ? 2 : 1; }

  // =========================================================================== Input
  const LANE_COLORS = {
    3: ['#3d8bff', '#3ddc5a', '#ff4a4a'],                          // X blue, A green, B red
    4: ['#ffd23d', '#3d8bff', '#3ddc5a', '#ff4a4a'],
    5: ['#ffd23d', '#b45cff', '#3d8bff', '#3ddc5a', '#ff4a4a'],
  };
  const KEY_LANES = {
    3: { KeyF: 0, KeyJ: 1, KeyK: 2, ArrowLeft: 0, ArrowDown: 1, ArrowRight: 2 },
    4: { KeyD: 0, KeyF: 1, KeyJ: 2, KeyK: 3, ArrowLeft: 0, ArrowDown: 1, ArrowUp: 2, ArrowRight: 3 },
    5: { KeyD: 0, KeyF: 1, Space: 2, KeyJ: 3, KeyK: 4 },
  };
  const KEY_LABELS = { 3: ['F', 'J', 'K'], 4: ['D', 'F', 'J', 'K'], 5: ['D', 'F', 'SPC', 'J', 'K'] };
  const PAD_LABELS = { 3: ['X', 'A', 'B'], 4: ['◀', 'X', 'A', 'B'], 5: ['◀', '▶', 'X', 'A', 'B'] };
  function padButtons(n) {
    const B = window.Pad360 ? Pad360.BTN : {};
    return { 3: [B.X, B.A, B.B], 4: [B.LEFT, B.X, B.A, B.B], 5: [B.LEFT, B.RIGHT, B.X, B.A, B.B] }[n];
  }

  function toCanvas(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  // the lane whose column is under a canvas point (the whole column counts, following the
  // road's perspective; below the pads it carries straight on), or -1 off the highway
  function laneAtX(x, y) {
    const n = C.lanes, yy = clamp(y, TOP_Y, H);
    const l = Math.floor((x - edgeX(0, yy, n)) / (hwWidth(yy, n) / n));
    return l >= 0 && l < n ? l : -1;
  }

  const pointerLanes = new Map();
  let swipe = null;

  window.addEventListener('keydown', (e) => {
    ensureAudio();
    if (state === 'play') {
      const lane = KEY_LANES[C.lanes][e.code];
      if (lane !== undefined) {
        e.preventDefault();
        if (!e.repeat && !C.paused) {
          players[0].down[lane] = true;
          hit(0, lane, eventSongTime(e));
        }
        return;
      }
      if (e.code === 'Escape') { e.preventDefault(); quitSong(); state = 'select'; }
      return;
    }
    if (e.repeat && (e.code === 'Space' || e.code === 'Enter')) return;
    const k = {
      ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
      Space: 'ok', Enter: 'ok', NumpadEnter: 'ok', Escape: 'back', Backspace: 'back',
    }[e.code];
    if (k) { e.preventDefault(); menuInput(k); }
  });
  window.addEventListener('keyup', (e) => {
    if (state !== 'play') return;
    const lane = KEY_LANES[C.lanes][e.code];
    if (lane !== undefined && players[0]) { players[0].down[lane] = false; release(0, lane, eventSongTime(e)); }
  });

  // the whole page takes taps (links excepted); in play only the highway's columns do anything
  window.addEventListener('pointerdown', (e) => {
    if (e.target && e.target.closest && e.target.closest('a')) return;
    ensureAudio();
    const p = toCanvas(e);
    if (state === 'play') {
      e.preventDefault();
      if (C.paused) return;
      const lane = laneAtX(p.x, p.y);
      if (lane < 0) return;
      pointerLanes.set(e.pointerId, lane);
      players[0].down[lane] = true;
      hit(0, lane, eventSongTime(e));
      return;
    }
    menuPointerDown(p, e);
  }, { passive: false });
  function pointerEnd(e) {
    if (state === 'play' && pointerLanes.has(e.pointerId)) {
      const lane = pointerLanes.get(e.pointerId);
      pointerLanes.delete(e.pointerId);
      if (players[0]) { players[0].down[lane] = false; release(0, lane, eventSongTime(e)); }
      return;
    }
    if (e.type === 'pointerup') menuPointerUp(toCanvas(e));
  }
  window.addEventListener('pointerup', pointerEnd);
  window.addEventListener('pointercancel', pointerEnd);

  // controller: polled once per frame, so its hits take the frame's time
  function pollPad() {
    if (!window.Pad360) return;
    const P = Pad360;
    if (state === 'play') {
      if (C.paused) return;
      const btns = padButtons(C.lanes), t = songNow();
      btns.forEach((b, lane) => {
        if (P.pressed(b)) { players[0].down[lane] = true; hit(0, lane, t); }
        else if (P.released(b)) { players[0].down[lane] = false; release(0, lane, t); }
      });
      if (P.pressed(P.BTN.BACK)) { quitSong(); state = 'select'; }
      return;
    }
    const dx = P.dxPressed(), dy = P.dyPressed();
    if (dx < 0) menuInput('left');
    if (dx > 0) menuInput('right');
    if (dy < 0) menuInput('up');
    if (dy > 0) menuInput('down');
    if (P.pressed(P.BTN.A) || P.pressed(P.BTN.START)) menuInput('ok');
    if (P.pressed(P.BTN.B) || P.pressed(P.BTN.BACK)) menuInput('back');
  }

  // =========================================================================== Judge
  const JUDGE_NAMES = ['PERFECT', 'GREAT', 'OK'];
  const JUDGE_POINTS = [100, 70, 40];
  const JUDGE_COLORS = ['#ffe14f', '#4ff0ff', '#b9ffb0'];
  const MISS_GRACE = 0.05;   // a note becomes a miss a little after its window, for late-arriving events

  // every input route ends here: player, lane, and the song time the hit happened at
  function hit(pi, lane, t) {
    if (!C.on) return;
    const P = players[pi];
    const n = C.lanes, win = C.D.win;
    padFlash[lane] = 1;
    C.taps.push([lane, t]);
    // claim the nearest waiting note in this lane inside the OK window
    let best = null, bestDt = 9;
    for (let i = C.first; i < C.notes.length; i++) {
      const note = C.notes[i];
      if (note.t > t + win[2]) break;
      if (note.state !== 0 || note.lane !== lane) continue;
      const dt = Math.abs(t - note.t);
      if (dt <= win[2] && dt < bestDt) { best = note; bestDt = dt; }
    }
    // the sound plays now, on the event: the claimed note's pitch, or the lane's scale note
    const pitch = best ? best.midi : strayPitch(C.S, lane, n);
    C.kit.play(lane, n, pitch, actx.currentTime, mashGuard.velocity(actx.currentTime, !!best));
    if (!best) return;   // a tap with nothing near it is just music -- no penalty

    const j = bestDt <= win[0] ? 0 : bestDt <= win[1] ? 1 : 2;
    best.state = 1;
    best.judge = j;
    P.streak++;
    P.bestStreak = Math.max(P.bestStreak, P.streak);
    P.counts[j]++;
    P.score += JUDGE_POINTS[j] * multOf(P.streak);
    if (C.log) C.log.push({ t: best.t, dt: t - best.t, j });
    const px = laneX(lane, HIT_Y, n);
    addPop(JUDGE_NAMES[j], px, HIT_Y - 34, JUDGE_COLORS[j]);
    burst(px, HIT_Y, LANE_COLORS[n][lane], j === 0 ? 10 : 5, j === 0);
    if (j === 0) addRing(laneWX(lane, n), 0, LANE_COLORS[n][lane], { r0: 14, r1: 52, dur: 0.35, w: 3 });
    const tier = milestoneTier(P.streak);
    if (tier) {
      P.score += 500 * tier;
      if (C.d === 0) P.shield = true;
      energyWave(tier, P.streak);
    }
  }

  // key / finger / button let go (hold notes use this in a later phase)
  function release(pi, lane, t) { /* nothing to finish yet: every note is a tap */ }

  function milestoneTier(streak) {
    const i = [10, 25, 50, 75, 100].indexOf(streak);
    if (i >= 0) return i + 1;
    return streak > 100 && streak % 50 === 0 ? 5 + (streak - 100) / 50 : 0;
  }

  // notes that slid past their window: gently gone, the streak ends, nothing is taken away
  function checkMisses(now) {
    const win = C.D.win[2] + MISS_GRACE;
    for (let i = C.first; i < C.notes.length; i++) {
      const note = C.notes[i];
      if (note.t + win > now) break;
      if (note.state !== 0) continue;
      note.state = 2;
      note.missAt = fxNow();
      const P = players[0];
      if (P.shield && P.streak > 0) { P.shield = false; addPop('SAVED!', laneX(note.lane, HIT_Y, C.lanes), HIT_Y - 34, '#4ff0ff'); }
      else P.streak = 0;
    }
    while (C.first < C.notes.length && C.notes[C.first].state !== 0) C.first++;
  }

  function starsFor(P, total) {
    if (!total) return 1;
    const share = (P.counts[0] + P.counts[1] * 0.7 + P.counts[2] * 0.4) / total;
    return 1 + (share >= 0.3) + (share >= 0.55) + (share >= 0.75) + (share >= 0.9);
  }

  // =========================================================================== FX
  const rings = [], parts = [], pops = [], banners = [];
  const padFlash = [0, 0, 0, 0, 0];
  let flash = 0, flashColor = '#ffffff', shakeT = 0;
  const MAX_PARTS = 150;
  const TIER_COLORS = ['#4ff0ff', '#ff4fd8', '#ffd23d'];

  function resetFx() {
    rings.length = parts.length = pops.length = banners.length = 0;
    flash = 0;
    shakeT = 0;
  }
  // Rings lie on the stage floor in world space: (x, z) centre, radii in world units.
  // o: { r0, r1, dur, w, delay, wave, rainbow }
  function addRing(x, z, color, o) {
    rings.push({
      x, z, color, t0: fxNow() + (o.delay || 0), dur: o.dur || 0.7, r0: o.r0 || 10, r1: o.r1 || 1300,
      w: o.w || 6, wave: !!o.wave, rainbow: !!o.rainbow,
    });
  }
  // how strongly a big wave's ring is passing the screen point (x, y) right now, 0..1
  // (the point is taken down to the floor under it, so things far back react later)
  function waveAt(sx, sy) {
    let v = 0;
    const t = fxNow();
    const z = zOfY(sy), k = kOf(z), x = (sx - CX) / k;
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (!r.wave) continue;
      const q = (t - r.t0) / r.dur;
      if (q < 0 || q > 1) continue;
      const rad = lerp(r.r0, r.r1, easeOut(q));
      const g = (Math.hypot(x - r.x, z - r.z) - rad) * k / 18;   // ~18 screen px wide anywhere
      v = Math.max(v, Math.exp(-g * g) * (1 - q * 0.5));
    }
    return v;
  }
  function addPop(str, x, y, color) { pops.push({ str, x, y, color, t0: fxNow() }); }
  function burst(x, y, color, count, upLane) {
    for (let i = 0; i < count && parts.length < MAX_PARTS; i++) {
      const a = upLane ? -Math.PI / 2 + (Math.random() - 0.5) * 0.7 : Math.random() * TAU;
      const sp = upLane ? 90 + Math.random() * 120 : 40 + Math.random() * 120;
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 0.5 + Math.random() * 0.5, age: 0, color, size: 1 + Math.random() * 1.6 });
    }
  }

  // the signature effect: rings burst from the pads and sweep the whole stage
  function energyWave(tier, streak) {
    const rainbow = tier >= 4;
    const color = rainbow ? '#ffffff' : TIER_COLORS[tier - 1];
    const count = Math.min(3, tier);
    C.waves.push(streak);
    for (let i = 0; i < count; i++) {
      addRing(0, 0, color, { wave: true, rainbow, delay: i * 0.13, dur: 0.75, r0: 12, r1: 1300, w: 9 - i * 2 });
    }
    flash = 0.55;
    flashColor = color;
    shakeT = 0.3;
    banners.push({ str: streak + ' IN A ROW!', t0: fxNow(), color, rainbow });
    for (let l = 0; l < C.lanes; l++) burst(laneX(l, HIT_Y, C.lanes), HIT_Y, LANE_COLORS[C.lanes][l], 8, false);
    // a rising arpeggio in the song's key -- kept in the middle of the range (no shrill top notes)
    const base = 60 + ((C.S.keyPc + 6) % 12) - 6;
    const steps = [0, 4, 7, 12, 16, 19, 24];
    const now = actx.currentTime;
    for (let i = 0; i < 3 + Math.min(4, tier); i++) {
      const f = mtof(base + steps[i]), t = now + i * 0.06;
      tone(A.kit, 'sine', f, t, 0.45, 0.2 * (1 - i * 0.06), { attack: 0.006 });
    }
  }

  function updateFx(dt) {
    const t = fxNow();
    for (let i = rings.length - 1; i >= 0; i--) if (t - rings[i].t0 > rings[i].dur) rings.splice(i, 1);
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.age += dt;
      if (p.age > p.life) { parts.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 160 * dt;
      p.vx *= 1 - dt * 1.5;
    }
    for (let i = pops.length - 1; i >= 0; i--) if (t - pops[i].t0 > 0.6) pops.splice(i, 1);
    for (let i = banners.length - 1; i >= 0; i--) if (t - banners[i].t0 > 1.4) banners.splice(i, 1);
    if (banners.length > 1) banners.splice(0, banners.length - 1);
    flash = Math.max(0, flash - dt * 2.5);
    shakeT = Math.max(0, shakeT - dt);
    for (let i = 0; i < padFlash.length; i++) padFlash[i] = Math.max(0, padFlash[i] - dt * 6);
    updateStage(dt);
    updateConfetti(dt);
  }

  // glows are pre-rendered sprites (no shadowBlur per note)
  const glowCache = {};
  function glowSprite(color) {
    let c = glowCache[color];
    if (c) return c;
    c = document.createElement('canvas');
    c.width = c.height = 64;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, hexA(color, 0.9));
    gr.addColorStop(0.3, hexA(color, 0.45));
    gr.addColorStop(1, hexA(color, 0));
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    glowCache[color] = c;
    return c;
  }
  function drawGlow(color, x, y, r, a) {
    if (a <= 0.01) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }

  // =========================================================================== Stage drawing
  // ---- the 3D camera ----
  // The highway is a flat road in world space: x across (1 unit = 1 pixel at the pad row),
  // z forward from the pad row (away from the player), h up. A pinhole camera above and behind
  // the pads looks down it, and the road's far end lands on TOP_Y. A note's z is linear in song
  // time, so timing stays honest; on screen it speeds up as it comes close, like a real road.
  const HIT_Y = 222, TOP_Y = 36, CX = 240;
  const HORIZON_Y = -140;    // where the road would vanish (just above the screen)
  const CAM_D = 760;         // camera distance from the pad row (sets how flat the floor looks)
  const SPAN = HIT_Y - HORIZON_Y;
  const ZMAX = CAM_D * (SPAN / (TOP_Y - HORIZON_Y) - 1);    // world length of the visible road
  const kOf = (z) => CAM_D / (CAM_D + Math.max(z, -CAM_D * 0.6));   // screen scale at depth z
  const yOf = (z) => HORIZON_Y + SPAN * kOf(z);
  const zOfY = (y) => CAM_D * SPAN / Math.max(1, y - HORIZON_Y) - CAM_D;   // floor point under screen y
  const flatOf = (z) => SPAN * kOf(z) / CAM_D;    // floor circles squash to ellipses this much
  function proj(x, z, h) {
    const k = kOf(z);
    return { x: CX + x * k, y: HORIZON_Y + SPAN * k - (h || 0) * k, k };
  }
  const HW = { 3: 222, 4: 252, 5: 276 };   // highway width at the pad row
  // the road's width at a screen y (exact for a flat road seen in perspective)
  function hwWidth(y, n) { return HW[n] * (y - HORIZON_Y) / SPAN; }
  function laneX(lane, y, n) { return CX + ((lane + 0.5) / n - 0.5) * hwWidth(y, n); }
  function edgeX(i, y, n) { return CX + (i / n - 0.5) * hwWidth(y, n); }
  function laneWX(lane, n) { return ((lane + 0.5) / n - 0.5) * HW[n]; }    // lane centre, world x
  function padR(n) { return Math.min(27, HW[n] / n * 0.36); }              // world units
  function noteRW(n) { return HW[n] / n * 0.34; }                           // world units
  function noteZ(t, now) { return (t - now) / C.D.travel * ZMAX; }
  // world z per second of song time, for drawing the judgement windows on the road
  function zSpeed() { return ZMAX / C.D.travel; }
  function floorEllipse(x, z, h, r) {
    const p = proj(x, z, h);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, Math.max(0.1, r * p.k), Math.max(0.1, r * p.k * flatOf(z)), 0, 0, TAU);
    return p;
  }

  // stage furniture that reacts to waves
  const crowd = [];
  (function makeCrowd() {
    const rnd = seeded(7);
    for (let x = 4; x < W; x += 9 + rnd() * 5) {
      crowd.push({ x, h: 14 + rnd() * 9, ph: rnd() * TAU, hue: rnd(), up: 0, front: rnd() < 0.5 });
    }
  })();
  const beams = [70, 150, 330, 410].map((x, i) => ({ x, base: (i < 2 ? 0.35 : -0.35), ang: 0, vel: 0, ph: i * 1.7, color: ['#ff4fd8', '#4ff0ff', '#4ff0ff', '#ff4fd8'][i] }));
  const slots = [{ x: 46, bounce: 0 }, { x: W - 46, bounce: 0 }];

  function feverOn() { return state === 'play' && players[0] && players[0].streak >= 50; }

  function updateStage(dt) {
    const t = fxNow(), fever = feverOn();
    const beatK = beatPhase();
    crowd.forEach((p) => {
      let base = fever ? 0.6 + 0.4 * Math.max(0, Math.sin(beatK * TAU)) : 0;
      if (state === 'results' && results) {   // the crowd cheers the results, harder with more stars
        const k = Math.max(0, Math.sin(t * 5 + p.ph * 3));
        base = Math.max(base, (0.15 + results.stars * 0.17) * (0.5 + 0.5 * k));
      }
      p.up = Math.max(p.up - dt * 1.6, waveAt(p.x, 256), base);
    });
    beams.forEach((b) => {
      const target = b.base + Math.sin(t * 0.6 + b.ph) * 0.22;
      b.vel += (target - b.ang) * dt * 10 - b.vel * dt * 2.5;
      b.vel += waveAt(b.x, 30) * dt * 9 * (b.x < CX ? 1 : -1);
      b.ang += b.vel * dt;
    });
    slots.forEach((s) => { s.bounce = Math.max(s.bounce - dt * 2.5, waveAt(s.x, 170)); });
  }
  // 0..1 through the current beat (idle pulse off the stage when no song is on)
  function beatPhase() {
    if (state === 'play' && C.on && C.S) { const b = songNow() / C.S.beatDur; return b - Math.floor(b); }
    const b = fxNow() * 2;
    return b - Math.floor(b);
  }

  function drawBackground(hueShift) {
    const fever = feverOn();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    if (fever) {
      const h = fxNow() * 90;
      g.addColorStop(0, hexA(hueHex(h), 0.55));
      g.addColorStop(0.6, '#12052a');
      g.addColorStop(1, hexA(hueHex(h + 120), 0.5));
    } else {
      g.addColorStop(0, '#1d0840');
      g.addColorStop(0.55, '#0c0424');
      g.addColorStop(1, '#170630');
    }
    ctx.fillStyle = '#08031a';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // stage floor
    const fg = ctx.createLinearGradient(0, 196, 0, H);
    fg.addColorStop(0, 'rgba(60,20,110,0)');
    fg.addColorStop(1, 'rgba(90,30,150,0.55)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, 196, W, H - 196);

    // light beams from the truss
    const pulse = 1 - beatPhase();
    ctx.globalCompositeOperation = 'lighter';
    beams.forEach((b, i) => {
      const col = fever ? hueHex(fxNow() * 120 + i * 90) : b.color;
      const len = 260;
      const ex = b.x + Math.sin(b.ang) * len, ey = 30 + Math.cos(b.ang) * len;
      const px = Math.cos(b.ang) * 26, py = -Math.sin(b.ang) * 26;
      const lg = ctx.createLinearGradient(b.x, 30, ex, ey);
      lg.addColorStop(0, hexA(col, 0.22 + pulse * 0.12));
      lg.addColorStop(1, hexA(col, 0));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(b.x - 2, 30);
      ctx.lineTo(ex - px, ey - py);
      ctx.lineTo(ex + px, ey + py);
      ctx.lineTo(b.x + 2, 30);
      ctx.fill();
    });
    ctx.globalCompositeOperation = 'source-over';

    // truss
    ctx.strokeStyle = '#3b2a63';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, 25); ctx.lineTo(W, 25);
    ctx.moveTo(0, 31); ctx.lineTo(W, 31);
    for (let x = 0; x < W; x += 12) { ctx.moveTo(x, 25); ctx.lineTo(x + 6, 31); ctx.lineTo(x + 12, 25); }
    ctx.stroke();
    beams.forEach((b, i) => {
      const col = fever ? hueHex(fxNow() * 120 + i * 90) : b.color;
      ctx.fillStyle = '#251a40';
      rr(b.x - 5, 27, 10, 7, 2);
      ctx.fill();
      drawGlow(col, b.x, 33, 9, 0.6 + pulse * 0.4);
    });
  }

  // empty stage gear in the band slots for now (the mascot band moves in later)
  function drawBandSlots() {
    const pulse = 1 - beatPhase();
    slots.forEach((s, i) => {
      const lift = s.bounce * 6 + pulse * 0.8;
      ctx.save();
      ctx.translate(s.x, 206 - lift);
      // riser
      ctx.fillStyle = '#1f1238';
      rr(-34, 0, 68, 10, 2); ctx.fill();
      ctx.strokeStyle = i ? '#4ff0ff' : '#ff4fd8';
      ctx.globalAlpha = 0.6;
      ctx.lineWidth = 1;
      rr(-34, 0, 68, 10, 2); ctx.stroke();
      ctx.globalAlpha = 1;
      // amp stack
      ctx.fillStyle = '#17102a';
      rr(-28, -46, 26, 46, 2); ctx.fill();
      ctx.strokeStyle = '#4b3a72';
      rr(-28, -46, 26, 46, 2); ctx.stroke();
      ctx.fillStyle = '#2c2148';
      circle(-15, -32, 7.5); ctx.fill();
      circle(-15, -12, 7.5); ctx.fill();
      ctx.fillStyle = '#0b0718';
      circle(-15, -32, 3); ctx.fill();
      circle(-15, -12, 3); ctx.fill();
      drawGlow(i ? '#4ff0ff' : '#ff4fd8', -24, -42, 4, 0.8);
      // mic stand
      ctx.strokeStyle = '#8a80b0';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(14, 0); ctx.lineTo(14, -40); ctx.lineTo(19, -46);
      ctx.moveTo(8, 0); ctx.lineTo(14, -6); ctx.lineTo(20, 0);
      ctx.stroke();
      ctx.fillStyle = '#b9b0e0';
      circle(20, -47, 2.6); ctx.fill();
      ctx.restore();
    });
  }

  function drawCrowd(frontRow) {
    const fever = feverOn();
    crowd.forEach((p) => {
      if (p.front !== frontRow) return;
      const hb = -highwayHalf(262);
      if (p.x > CX + hb - 6 && p.x < CX - hb + 6) return;   // keep the highway and key hints clear
      const up = p.up;
      const bob = Math.sin(fxNow() * 3 + p.ph) * 0.6 + up * 3;
      const baseY = H + (frontRow ? 2 : -4);
      const top = baseY - p.h - bob;
      ctx.fillStyle = frontRow ? '#05020d' : '#130928';
      // body + head
      rr(p.x - 5, top + 6, 10, p.h, 4); ctx.fill();
      circle(p.x, top + 2, 4); ctx.fill();
      // arms: down at the sides, thrown up as a wave passes
      if (up > 0.25) {
        ctx.strokeStyle = ctx.fillStyle;
        ctx.lineWidth = 2.2;
        const a = up * 9;
        ctx.beginPath();
        ctx.moveTo(p.x - 4, top + 8); ctx.lineTo(p.x - 6 - up * 2, top + 8 - a);
        ctx.moveTo(p.x + 4, top + 8); ctx.lineTo(p.x + 6 + up * 2, top + 8 - a);
        ctx.stroke();
        if (fever) drawGlow(hueHex(p.hue * 360 + fxNow() * 100), p.x + 6 + up * 2, top + 8 - a, 4, 0.9);
      }
      // a rim of stage light on the heads
      ctx.strokeStyle = frontRow ? 'rgba(255,79,216,0.35)' : 'rgba(79,240,255,0.25)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.x, top + 2, 4, Math.PI * 1.1, Math.PI * 1.9);
      ctx.stroke();
    });
  }
  function highwayHalf(y) { return hwWidth(y, C.lanes) / 2 + 4; }

  function drawHighway(now) {
    const n = C.lanes, cols = LANE_COLORS[n];
    const yBot = 244;
    // the road
    ctx.fillStyle = 'rgba(8,4,22,0.82)';
    ctx.beginPath();
    ctx.moveTo(edgeX(0, TOP_Y, n), TOP_Y);
    ctx.lineTo(edgeX(n, TOP_Y, n), TOP_Y);
    ctx.lineTo(edgeX(n, yBot, n), yBot);
    ctx.lineTo(edgeX(0, yBot, n), yBot);
    ctx.closePath();
    ctx.fill();
    // a faint lane tint
    for (let l = 0; l < n; l++) {
      const lg = ctx.createLinearGradient(0, TOP_Y, 0, HIT_Y);
      lg.addColorStop(0, hexA(cols[l], 0));
      lg.addColorStop(1, hexA(cols[l], 0.08 + padFlash[l] * 0.2));
      ctx.fillStyle = lg;
      ctx.beginPath();
      ctx.moveTo(edgeX(l, TOP_Y, n), TOP_Y);
      ctx.lineTo(edgeX(l + 1, TOP_Y, n), TOP_Y);
      ctx.lineTo(edgeX(l + 1, yBot, n), yBot);
      ctx.lineTo(edgeX(l, yBot, n), yBot);
      ctx.closePath();
      ctx.fill();
    }
    // beat lines scrolling down with the music (same motion as the notes)
    if (C.S) {
      const bd = C.S.beatDur;
      const firstBeat = Math.ceil((now - 0.15) / bd);
      for (let b = firstBeat; ; b++) {
        const z = noteZ(b * bd, now);
        if (z > ZMAX) break;
        const y = yOf(z);
        if (y > 244) continue;
        const bar = ((b % C.S.bpb) + C.S.bpb) % C.S.bpb === 0;
        ctx.strokeStyle = bar ? 'rgba(185,176,224,0.28)' : 'rgba(185,176,224,0.1)';
        ctx.lineWidth = bar ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(edgeX(0, y, n), y);
        ctx.lineTo(edgeX(n, y, n), y);
        ctx.stroke();
      }
    }
    // lane lines -- they bulge outward as a wave's ring passes
    const fever = feverOn();
    for (let i = 0; i <= n; i++) {
      const edge = i === 0 || i === n;
      ctx.strokeStyle = edge ? (fever ? hueHex(fxNow() * 140 + i * 40) : '#ff4fd8') : 'rgba(185,176,224,0.35)';
      ctx.lineWidth = edge ? 1.6 : 0.8;
      ctx.beginPath();
      for (let s = 0; s <= 14; s++) {
        const y = lerp(TOP_Y, yBot, s / 14);
        let x = edgeX(i, y, n);
        const wv = waveAt(x, y);
        if (wv > 0.01) x += (x < CX ? -1 : x > CX ? 1 : 0) * wv * 7;
        if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // the PERFECT window drawn on the road as a glowing strip across each lane: a note whose
  // centre is inside the strip when you hit is a PERFECT
  function drawHitZone() {
    const n = C.lanes, cols = LANE_COLORS[n];
    const zw = zSpeed() * C.D.win[0];
    const y0 = yOf(zw), y1 = yOf(-zw);
    for (let l = 0; l < n; l++) {
      ctx.fillStyle = hexA(cols[l], 0.1 + padFlash[l] * 0.25);
      ctx.beginPath();
      ctx.moveTo(edgeX(l, y0, n) + 1, y0);
      ctx.lineTo(edgeX(l + 1, y0, n) - 1, y0);
      ctx.lineTo(edgeX(l + 1, y1, n) - 1, y1);
      ctx.lineTo(edgeX(l, y1, n) + 1, y1);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 0.8;
    [y0, y1].forEach((y) => { ctx.beginPath(); ctx.moveTo(edgeX(0, y, n), y); ctx.lineTo(edgeX(n, y, n), y); ctx.stroke(); });
  }

  // drums standing on the stage floor at the pad row: a shell, a rim in the lane colour, a head
  function drawPads() {
    const n = C.lanes, cols = LANE_COLORS[n], R = padR(n);
    const SHELL = 9;
    for (let l = 0; l < n; l++) {
      const wx = laneWX(l, n), f = padFlash[l];
      const press = players[0] && players[0].down[l] ? 1 : 0;
      const top = SHELL - press * 2 - f * 1.5;      // the head dips when hit
      const base = proj(wx, 0, 0), head = proj(wx, 0, top);
      const rx = R * base.k, ry = R * base.k * flatOf(0);
      drawGlow(cols[l], head.x, head.y, R * 2.2, 0.35 + f * 0.6);
      // shell: the bottom ellipse, joined up to the head
      ctx.fillStyle = '#1a1030';
      ctx.beginPath();
      ctx.ellipse(base.x, base.y, rx, ry, 0, 0, Math.PI);
      ctx.lineTo(head.x - rx, head.y);
      ctx.ellipse(head.x, head.y, rx, ry, 0, Math.PI, 0, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = hexA(cols[l], 0.55);
      ctx.fillRect(base.x - rx, (base.y + head.y) / 2 - 1, rx * 2, 2);   // a stripe round the shell
      // rim + head
      ctx.lineWidth = 3;
      ctx.strokeStyle = cols[l];
      ctx.beginPath(); ctx.ellipse(head.x, head.y, rx - 1.5, ry - 0.8, 0, 0, TAU); ctx.stroke();
      const hg = ctx.createRadialGradient(head.x - rx * 0.3, head.y - ry * 0.4, 1, head.x, head.y, rx);
      hg.addColorStop(0, f > 0 || press ? '#ffffff' : '#ece7ff');
      hg.addColorStop(1, f > 0 || press ? hexA(cols[l], 0.9) : '#8d84b8');
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.ellipse(head.x, head.y, Math.max(1, rx - 3.5), Math.max(1, ry - 2), 0, 0, TAU); ctx.fill();
      // tension lugs
      ctx.fillStyle = '#e8e2ff';
      for (let k = 0; k < 8; k++) {
        const a = k / 8 * TAU + 0.2;
        circle(head.x + Math.cos(a) * (rx - 1.5), head.y + Math.sin(a) * (ry - 0.8), 0.9); ctx.fill();
      }
    }
  }

  function drawKeyHints() {
    const n = C.lanes, cols = LANE_COLORS[n];
    const pad = window.Pad360 && Pad360.connected();
    const labels = pad ? PAD_LABELS[n] : KEY_LABELS[n];
    for (let l = 0; l < n; l++) {
      const x = laneX(l, 254, n);
      const w = labels[l].length > 1 ? 20 : 13;
      ctx.fillStyle = 'rgba(10,6,24,0.8)';
      rr(x - w / 2, 247, w, 13, 3); ctx.fill();
      ctx.strokeStyle = cols[l];
      ctx.lineWidth = 1;
      rr(x - w / 2, 247, w, 13, 3); ctx.stroke();
      text(labels[l], x, 254, 'bold 8px monospace', '#ffffff');
    }
  }

  // one note: a glowing puck sitting on the road at depth z
  const PUCK_H = 7;
  function drawPuck(wx, z, rw, col, alpha, flashK) {
    const b = proj(wx, z, 0), t = proj(wx, z, PUCK_H);
    const rx = rw * b.k, ry = rw * b.k * flatOf(z);
    ctx.globalAlpha = alpha;
    drawGlow(col, b.x, b.y, rx * 2, 0.55 * alpha);
    // side band (darker), then the top face
    ctx.fillStyle = hexA(col, 1);
    ctx.beginPath();
    ctx.ellipse(b.x, b.y, rx, ry, 0, 0, Math.PI);
    ctx.lineTo(t.x - rx, t.y);
    ctx.ellipse(t.x, t.y, rx, ry, 0, Math.PI, 0, true);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(10,4,30,0.4)';
    ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.ellipse(t.x, t.y, rx, ry, 0, 0, TAU); ctx.fill();
    ctx.lineWidth = Math.max(0.8, 1.6 * b.k);
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath(); ctx.ellipse(t.x, t.y, Math.max(0.5, rx - 0.8), Math.max(0.3, ry - 0.5), 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.ellipse(t.x - rx * 0.3, t.y - ry * 0.25, rx * 0.3, ry * 0.3, 0, 0, TAU); ctx.fill();
    if (flashK > 0.05) {   // flash white as a wave's ring passes
      ctx.globalAlpha = alpha * flashK;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.ellipse(t.x, t.y, rx + 1, ry + 1, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawNotes(now) {
    const n = C.lanes, cols = LANE_COLORS[n], rw = noteRW(n);
    const fever = feverOn();
    const tNow = fxNow();
    // start a little behind the first waiting note so missed notes can fade out
    let start = C.first;
    while (start > 0 && C.notes[start - 1].t > now - 0.8) start--;
    const vis = [];
    for (let i = start; i < C.notes.length; i++) {
      const note = C.notes[i];
      const z = noteZ(note.t, now);          // linear in song time
      if (z > ZMAX) break;
      if (note.state === 1 || yOf(z) > H + 20) continue;
      vis.push([note, z]);
    }
    // far notes first, so near ones overlap them
    for (let v = vis.length - 1; v >= 0; v--) {
      const note = vis[v][0], z = vis[v][1];
      let alpha = Math.min(1, (ZMAX - z) / (ZMAX * 0.1));   // fade in at the far end of the road
      if (note.state === 2) { alpha *= 0.5 * (1 - (tNow - note.missAt) / 0.4); if (alpha <= 0) continue; }
      const wx = laneWX(note.lane, n), col = cols[note.lane];
      if (fever && note.state === 0) {   // FEVER trails stream out behind
        for (let k = 3; k >= 1; k--) {
          const tz = z + k * 28;
          if (tz > ZMAX) continue;
          const p = proj(wx, tz, PUCK_H * 0.5);
          ctx.globalAlpha = alpha * 0.16 * (4 - k);
          ctx.fillStyle = hueHex(tNow * 200 + k * 40 + note.lane * 60);
          ctx.beginPath();
          ctx.ellipse(p.x, p.y, rw * p.k * (1 - k * 0.12), rw * p.k * flatOf(tz) * (1 - k * 0.12), 0, 0, TAU);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const top = proj(wx, z, PUCK_H);
      drawPuck(wx, z, rw, col, alpha, waveAt(top.x, top.y));
    }
  }

  // rings travel across the stage floor; drawn as projected circles, thicker up close
  const RING_SEGS = 40;
  function drawRings() {
    const t = fxNow();
    ctx.globalCompositeOperation = 'lighter';
    rings.forEach((r) => {
      const q = (t - r.t0) / r.dur;
      if (q < 0 || q > 1) return;
      const rad = lerp(r.r0, r.r1, easeOut(q));
      const a = 1 - q, wq = r.w * (1 - q * 0.4) * Math.min(1, rad / 70);   // thin while it is small
      let prev = null;
      for (let s = 0; s <= RING_SEGS; s++) {
        const ang = s / RING_SEGS * TAU;
        const wz = r.z + Math.sin(ang) * rad;
        const p = wz < -CAM_D * 0.5 ? null : proj(r.x + Math.cos(ang) * rad, wz, 1.5);
        if (p && prev && p.y > -60 && prev.y < H + 200) {
          const k = (p.k + prev.k) / 2;
          const col = r.rainbow ? hueHex(s * 9 + t * 300) : r.color;
          ctx.strokeStyle = hexA(col, a * 0.3);
          ctx.lineWidth = wq * 2.4 * k;
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
          ctx.strokeStyle = hexA(col, a * (r.rainbow ? 0.95 : 1));
          ctx.lineWidth = Math.max(0.8, wq * 0.7 * k);
          ctx.beginPath(); ctx.moveTo(prev.x, prev.y); ctx.lineTo(p.x, p.y); ctx.stroke();
        }
        prev = p;
      }
    });
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawParticles() {
    ctx.globalCompositeOperation = 'lighter';
    parts.forEach((p) => {
      const a = 1 - p.age / p.life;
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    });
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }

  function drawPops() {
    const t = fxNow();
    pops.forEach((p) => {
      const k = (t - p.t0) / 0.6;
      ctx.globalAlpha = 1 - k * k;
      const s = k < 0.15 ? 0.7 + k * 2 : 1;
      ctx.save();
      ctx.translate(p.x, p.y - k * 14);
      ctx.scale(s, s);
      text(p.str, 0, 0, 'bold 10px monospace', '#1a0a30');
      text(p.str, -0.7, -0.7, 'bold 10px monospace', p.color);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawBanner() {
    const t = fxNow();
    banners.forEach((b) => {
      const k = (t - b.t0) / 1.4;
      const pop = k < 0.12 ? easeOut(k / 0.12) : 1;
      const a = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(CX, 112);
      ctx.scale(pop * 1.1, pop * 1.1);
      ctx.rotate(-0.04);
      const col = b.rainbow ? hueHex(t * 300) : b.color;
      ctx.font = 'bold 26px monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#12052a';
      ctx.strokeText(b.str, 0, 0);
      ctx.fillStyle = col;
      ctx.fillText(b.str, 0, 0);
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.fillText(b.str, -1, -1);
      ctx.restore();
    });
    ctx.globalAlpha = 1;
  }

  function drawHud() {
    const P = players[0];
    ctx.fillStyle = 'rgba(8,3,26,0.6)';
    ctx.fillRect(0, 0, W, 22);
    text('SCORE', 44, 7, 'bold 6px monospace', '#b9b0e0', 'left');
    text(P.score.toLocaleString('en-US'), 44, 15, 'bold 10px monospace', '#ffffff', 'left');
    // song progress
    const k = clamp(songNow() / C.end, 0, 1);
    const x0 = 170, x1 = 310;
    ctx.fillStyle = '#2a1a4a';
    rr(x0, 8, x1 - x0, 6, 3); ctx.fill();
    const pg = ctx.createLinearGradient(x0, 0, x1, 0);
    pg.addColorStop(0, '#4ff0ff');
    pg.addColorStop(1, '#ff4fd8');
    ctx.fillStyle = pg;
    if (k > 0) { rr(x0, 8, Math.max(6, (x1 - x0) * k), 6, 3); ctx.fill(); }
    text('★', x0 - 7, 11, 'bold 9px monospace', '#ffe14f');
    text('★', x1 + 7, 11, 'bold 9px monospace', k >= 1 ? '#ffe14f' : '#6a5a90');
    // multiplier + streak
    const m = multOf(P.streak);
    const mc = m >= 5 ? hueHex(fxNow() * 200) : ['#ffffff', '#ffffff', '#4ff0ff', '#3ddc5a', '#ffd23d'][m - 1];
    text('x' + m, 392, 11, 'bold 14px monospace', mc, 'right');
    text('STREAK', 446, 7, 'bold 6px monospace', '#b9b0e0', 'right');
    text(String(P.streak), 446, 15, 'bold 10px monospace', P.streak >= 10 ? '#ffe14f' : '#ffffff', 'right');
    if (C.d === 0 && P.shield) {   // Easy: the next miss is forgiven
      ctx.fillStyle = '#4ff0ff';
      ctx.beginPath();
      ctx.moveTo(464, 5); ctx.lineTo(472, 7); ctx.lineTo(471, 13); ctx.lineTo(464, 18); ctx.lineTo(457, 13); ctx.lineTo(456, 7);
      ctx.closePath(); ctx.fill();
    }
    text(C.S.title + '  ·  ' + C.D.name + '  ·  ' + C.kit.name, CX, 28, '6px monospace', 'rgba(185,176,224,0.8)');
  }

  function drawCountIn(now) {
    let label = null;
    const raw = C.paused || C.resuming ? null : audioNow() - C.songStart;
    if (raw !== null && raw < 0) {
      const left = Math.ceil(-raw / C.S.beatDur - 1e-6);   // beats until the song starts
      label = left <= 1 ? 'GO!' : String(left - 1);
    } else if (raw !== null && C.resumeTo !== null) {
      if (raw >= C.resumeTo) C.resumeTo = null;
      else label = String(Math.ceil((C.resumeTo - raw) / C.countBeat - 1e-6));
    }
    if (!label) return;
    ctx.save();
    ctx.translate(CX, 120);
    const k = 1 - beatPhase();
    ctx.scale(1 + k * 0.2, 1 + k * 0.2);
    ctx.font = 'bold 34px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#12052a';
    ctx.strokeText(label, 0, 0);
    ctx.fillStyle = '#ffe14f';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8,3,26,0.6)';
    ctx.fillRect(0, 0, W, H);
    text('PAUSED', CX, 120, 'bold 24px monospace', '#ffe14f');
    text(C.why === 'menu' ? 'CLOSE THE MENU TO KEEP ROCKING' : 'BACK IN A MOMENT...', CX, 146, 'bold 9px monospace', '#ffffff');
  }

  function drawPlay() {
    const now = songNow();
    ctx.save();
    if (shakeT > 0) {
      const a = 2.5 * shakeT / 0.3;
      ctx.translate((Math.random() * 2 - 1) * a, (Math.random() * 2 - 1) * a);
    }
    drawBackground();
    drawCrowd(false);
    drawBandSlots();
    drawHighway(now);
    drawHitZone();
    drawPads();
    drawNotes(now);
    drawKeyHints();
    drawCrowd(true);
    drawRings();
    drawParticles();
    drawPops();
    ctx.restore();
    drawHud();
    drawBanner();
    drawCountIn(now);
    if (flash > 0) {
      ctx.globalAlpha = flash * 0.5;
      ctx.fillStyle = flashColor;
      ctx.fillRect(0, 0, W, H);
      ctx.globalAlpha = 1;
    }
    if (C.paused) drawPaused();
  }

  // =========================================================================== Screens
  // title -> select -> play -> results. Menus: arrows / D-pad move, Space / Enter / A pick,
  // Esc / B back, and taps work everywhere.
  let state = 'title';
  let hot = [];          // tappable rectangles drawn this frame: { x, y, w, h, fn }
  let selIndex = 0, selAnim = 0, selRow = 0;
  let results = null;
  const SEL_SPACING = 122;

  function curSave() { return songSave(PREPARED[selIndex].id); }
  function curKitIndex() {
    const id = curSave().kit || kitById(PREPARED[selIndex].kit).id;
    return Math.max(0, KITS.findIndex((k) => k.id === id));
  }
  function setKit(delta) {
    const i = (curKitIndex() + delta + KITS.length) % KITS.length;
    curSave().kit = KITS[i].id;
    writeSave();
    previewKit(KITS[i]);
  }
  function previewKit(kit) {
    if (!ensureAudio()) return;
    const n = DIFFS[save.diff].lanes, S = PREPARED[selIndex], t = actx.currentTime + 0.02;
    for (let l = 0; l < n; l++) kit.play(l, n, strayPitch(S, l, n), t + l * 0.13, 0.8);
  }
  function moveSong(d) {
    selIndex = clamp(selIndex + d, 0, PREPARED.length - 1);
    save.song = selIndex;
    writeSave();
  }
  function setDiff(d) {
    save.diff = (save.diff + d + DIFFS.length) % DIFFS.length;
    writeSave();
  }
  function play() { startSong(selIndex, save.diff, KITS[curKitIndex()].id); }

  function menuInput(k) {
    if (state === 'title') {
      if (k === 'ok') { state = 'select'; drumFill(); }
      else if (k === 'back') { if (window.MickleMenu) MickleMenu.backToArcade(); }
      return;
    }
    if (state === 'select') {
      if (k === 'up') selRow = Math.max(0, selRow - 1);
      else if (k === 'down') selRow = Math.min(3, selRow + 1);
      else if (k === 'left' || k === 'right') {
        const d = k === 'left' ? -1 : 1;
        if (selRow === 1) setDiff(d);
        else if (selRow === 2) setKit(d);
        else moveSong(d);
      } else if (k === 'ok') play();
      else if (k === 'back') state = 'title';
      return;
    }
    if (state === 'results') {
      if (fxNow() - results.t0 < 0.8) return;   // don't skip the card by accident
      if (k === 'ok') startSong(results.si, results.d, results.kit);
      else if (k === 'back') state = 'select';
    }
  }

  function hotAt(p) {
    for (let i = hot.length - 1; i >= 0; i--) {
      const h = hot[i];
      if (p.x >= h.x && p.x <= h.x + h.w && p.y >= h.y && p.y <= h.y + h.h) return h;
    }
    return null;
  }
  function menuPointerDown(p) {
    if (state === 'select' && p.y > 36 && p.y < 168) { swipe = { x: p.x, y: p.y }; return; }
    swipe = null;
    const h = hotAt(p);
    if (h) { h.fn(); return; }
    if (state === 'title') menuInput('ok');
    else if (state === 'results') menuInput('ok');
  }
  function menuPointerUp(p) {
    if (!swipe || state !== 'select') { swipe = null; return; }
    const dx = p.x - swipe.x;
    swipe = null;
    if (Math.abs(dx) > 24) { moveSong(dx < 0 ? 1 : -1); return; }
    const h = hotAt(p);
    if (h) h.fn();
  }

  function drumFill() {
    if (!ensureAudio()) return;
    const t = actx.currentTime + 0.02;
    [0, 0.09, 0.18, 0.27].forEach((d, i) => DRUM.tom(A.kit, t + d, 0.5 + i * 0.1));
    DRUM.crash(A.kit, t + 0.36, 0.7);
    DRUM.kick(A.kit, t + 0.36, 0.9);
  }

  function neonText(str, x, y, size, color, glowCol) {
    ctx.font = 'bold ' + size + 'px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = Math.max(2, size / 6);
    ctx.strokeStyle = glowCol;
    ctx.globalAlpha = 0.5;
    ctx.strokeText(str, x, y);
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  // ---- shared menu art: confetti, big extruded neon lettering, drawn stars, glossy buttons ----
  const confetti = [];
  const CONFETTI_COLS = ['#ff4fd8', '#4ff0ff', '#ffe14f', '#3ddc5a', '#b45cff', '#ff9a3d'];
  function dropConfetti(n, fromTruss) {
    for (let i = 0; i < n && confetti.length < 110; i++) {
      confetti.push({
        x: Math.random() * W, y: fromTruss ? 28 + Math.random() * 6 : -6 - Math.random() * 30,
        vx: (Math.random() - 0.5) * 30, vy: 18 + Math.random() * 30,
        rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 10, flip: Math.random() * TAU,
        col: CONFETTI_COLS[(Math.random() * CONFETTI_COLS.length) | 0], w: 2 + Math.random() * 2, h: 1.2 + Math.random(),
      });
    }
  }
  function updateConfetti(dt) {
    if (state !== 'title' && state !== 'results') { confetti.length = 0; return; }
    for (let i = confetti.length - 1; i >= 0; i--) {
      const c = confetti[i];
      c.x += (c.vx + Math.sin(c.flip) * 12) * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      c.flip += dt * 6;
      if (c.y > H + 8) confetti.splice(i, 1);
    }
  }
  function drawConfetti() {
    confetti.forEach((c) => {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.scale(Math.cos(c.flip), 1);   // flutter: the piece turns edge-on and back
      ctx.fillStyle = c.col;
      ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      ctx.restore();
    });
  }

  const LOGO_FONT = '"Arial Black", "Helvetica Neue", Impact, sans-serif';
  // chunky lettering: a dark extruded side, a neon outline glow, then a gradient face with a shine.
  // o.hop(i) lifts letter i (letters bouncing on the beat); o.track adds letter spacing.
  function bigText(str, x, y, size, stops, glowCol, o) {
    o = o || {};
    ctx.font = '900 ' + size + 'px ' + LOGO_FONT;
    ctx.textAlign = 'left';
    const chars = Array.from(str);
    const widths = chars.map((ch) => ctx.measureText(ch).width);
    const track = o.track || 0;
    const total = widths.reduce((a, w) => a + w, 0) + track * (chars.length - 1);
    const depth = o.depth == null ? Math.max(2, size / 8) : o.depth;
    const g = ctx.createLinearGradient(0, y - size * 0.45, 0, y + size * 0.4);
    stops.forEach((c, i) => g.addColorStop(i / (stops.length - 1), c));
    // three passes so every letter's glow sits behind every letter's face
    for (let pass = 0; pass < 3; pass++) {
      let cx = x - total / 2;
      chars.forEach((ch, i) => {
        const ly = y - (o.hop ? o.hop(i) : 0);
        if (pass === 0) {
          ctx.fillStyle = o.side || '#1c0738';
          for (let d = depth; d >= 1; d--) ctx.fillText(ch, cx + d * 0.45, ly + d);
        } else if (pass === 1) {
          ctx.strokeStyle = hexA(glowCol, 0.3);
          ctx.lineWidth = size / 3.2;
          ctx.strokeText(ch, cx, ly);
          ctx.strokeStyle = glowCol;
          ctx.lineWidth = size / 9;
          ctx.strokeText(ch, cx, ly);
        } else {
          ctx.fillStyle = g;
          ctx.fillText(ch, cx, ly);
          ctx.save();                       // a shine across the top of each letter
          ctx.beginPath();
          ctx.rect(cx - 2, ly - size * 0.5, widths[i] + 4, size * 0.28);
          ctx.clip();
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.fillText(ch, cx, ly);
          ctx.restore();
        }
        cx += widths[i] + track;
      });
    }
    ctx.textAlign = 'center';
  }

  function starPath(x, y, R, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r : R;
      if (i) ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
      else ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
  }
  // a fat gold star (or an empty socket)
  function bigStar(x, y, R, lit) {
    if (!lit) {
      starPath(x, y + 1, R, R * 0.48);
      ctx.fillStyle = '#120828'; ctx.fill();
      ctx.strokeStyle = '#3c2f60'; ctx.lineWidth = 1.2; ctx.stroke();
      return;
    }
    starPath(x + 1, y + 2, R, R * 0.48);
    ctx.fillStyle = '#7a3b00'; ctx.fill();
    starPath(x, y, R, R * 0.48);
    const g = ctx.createLinearGradient(0, y - R, 0, y + R);
    g.addColorStop(0, '#fff6b0'); g.addColorStop(0.45, '#ffd23d'); g.addColorStop(1, '#ff9a1f');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4; ctx.stroke();
    starPath(x - R * 0.12, y - R * 0.15, R * 0.42, R * 0.2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.fill();
  }
  // a little four-point twinkle
  function sparkle(x, y, r, a) {
    if (a <= 0) return;
    ctx.globalAlpha *= a;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(x, y - r); ctx.lineTo(x + r * 0.22, y - r * 0.22); ctx.lineTo(x + r, y);
    ctx.lineTo(x + r * 0.22, y + r * 0.22); ctx.lineTo(x, y + r); ctx.lineTo(x - r * 0.22, y + r * 0.22);
    ctx.lineTo(x - r, y); ctx.lineTo(x - r * 0.22, y - r * 0.22);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= a;
  }
  function glossyButton(x, y, w, h, label, col, primary, pulse) {
    if (primary) drawGlow(col, x + w / 2, y + h / 2, w * 0.6, 0.25 + (pulse || 0) * 0.35);
    ctx.fillStyle = primary ? '#3a0a3a' : 'rgba(10,6,30,0.7)';
    rr(x, y + 2, w, h, h / 2); ctx.fill();                     // the base, so it looks pressable
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    if (primary) { g.addColorStop(0, '#ff8ae6'); g.addColorStop(0.5, col); g.addColorStop(1, '#b0168f'); }
    else { g.addColorStop(0, 'rgba(79,240,255,0.25)'); g.addColorStop(1, 'rgba(79,240,255,0.08)'); }
    ctx.fillStyle = g;
    rr(x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = primary ? '#ffffff' : col;
    ctx.lineWidth = primary ? 1.2 : 1;
    rr(x, y, w, h, h / 2); ctx.stroke();
    if (primary) {                                              // glass highlight
      ctx.fillStyle = 'rgba(255,255,255,0.28)';
      rr(x + 5, y + 2, w - 10, h * 0.36, h * 0.18); ctx.fill();
    }
    text(label, x + w / 2, y + h / 2 + 0.5, '900 ' + Math.round(h * 0.46) + 'px ' + LOGO_FONT, primary ? '#ffffff' : col);
  }

  // ---- title: an attract-mode show -- the 3D highway plays itself behind the logo ----
  // (eye candy on the fx clock; nothing here is judged)
  const DEMO_STEP = 0.25;   // eighth notes at 120 bpm
  const DEMO_PAT = [0, -1, 2, -1, 1, 3, -1, 2, 0, -1, 1, -1, 3, 2, 1, 0,
                    1, -1, 3, -1, 2, 0, -1, 1, 3, -1, 2, -1, 0, 1, 2, 3];
  const demo = { last: -1 };
  function demoLane(k) { return DEMO_PAT[((k % DEMO_PAT.length) + DEMO_PAT.length) % DEMO_PAT.length]; }
  function drawTitle() {
    C.lanes = 4;
    const n = 4, t = fxNow();
    const beat = t / (DEMO_STEP * 2), beatK = beat - Math.floor(beat);
    // the demo band hits its pads as the notes land: rings, sparks, and a wave every 8 bars
    const cur = Math.floor(t / DEMO_STEP);
    if (demo.last < 0 || cur - demo.last > 8) demo.last = cur - 1;
    for (let k = demo.last + 1; k <= cur; k++) {
      const lane = demoLane(k);
      if (lane >= 0) {
        padFlash[lane] = 1;
        addRing(laneWX(lane, n), 0, LANE_COLORS[n][lane], { r0: 14, r1: 52, dur: 0.35, w: 3 });
        burst(laneX(lane, HIT_Y, n), HIT_Y - 6, LANE_COLORS[n][lane], 5, true);
      }
      if (k % 64 === 0) {
        addRing(0, 0, TIER_COLORS[(k / 64) % 3], { wave: true, dur: 0.8, r0: 12, r1: 1300, w: 7 });
        dropConfetti(30, true);
      }
    }
    demo.last = cur;
    if (Math.random() < 0.12) dropConfetti(1, true);

    drawBackground();
    drawCrowd(false);
    drawBandSlots();
    drawHighway(t);
    drawPads();
    // demo notes on the road (same camera and puck as the real game), far ones first
    const travel = 1.8, rw = noteRW(n);
    const kLo = Math.floor(t / DEMO_STEP), kHi = Math.ceil((t + travel) / DEMO_STEP);
    for (let k = kHi; k >= kLo; k--) {
      const lane = demoLane(k);
      if (lane < 0) continue;
      const z = (k * DEMO_STEP - t) / travel * ZMAX;
      if (z < 0 || z > ZMAX) continue;
      const top = proj(laneWX(lane, n), z, PUCK_H);
      drawPuck(laneWX(lane, n), z, rw, LANE_COLORS[n][lane], Math.min(1, (ZMAX - z) / (ZMAX * 0.1)), waveAt(top.x, top.y));
    }
    drawRings();
    drawParticles();
    drawCrowd(true);

    // the logo: a slowly turning starburst behind chunky neon letters hopping on the beat
    const LY = 64;
    ctx.save();
    ctx.translate(CX, LY + 12);
    ctx.rotate(t * 0.12);
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 18; i++) {
      ctx.fillStyle = hexA(i % 2 ? '#ff4fd8' : '#4ff0ff', 0.05 + (1 - beatK) * 0.03);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 300, i / 18 * TAU, (i + 0.45) / 18 * TAU);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // a dark halo so the logo always reads over the stage
    const halo = ctx.createRadialGradient(CX, LY + 12, 10, CX, LY + 12, 140);
    halo.addColorStop(0, 'rgba(8,3,26,0.8)');
    halo.addColorStop(1, 'rgba(8,3,26,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(CX - 150, LY - 50, 300, 130);
    drawGlow('#ff4fd8', CX - 60, LY - 8, 70, 0.3);
    drawGlow('#4ff0ff', CX + 60, LY - 8, 70, 0.3);
    drawGlow('#ffe14f', CX, LY + 30, 80, 0.22 + (1 - beatK) * 0.15);
    const hop = (offset) => (i) => {
      const q = ((beat - i * 0.07 + offset) % 1 + 1) % 1;
      return Math.max(0, 1 - q * 5) * 4;
    };
    bigText('BOOM BOOM', CX, LY - 8, 30, ['#ffffff', '#ffd0f4', '#ff4fd8'], '#ff4fd8', { hop: hop(0), track: 1 });
    bigText('BAND', CX, LY + 28, 40, ['#fff6b0', '#ffd23d', '#ff7a1f'], '#4ff0ff', { hop: hop(0.5), track: 4 });
    // twinkles around the logo
    for (let i = 0; i < 5; i++) {
      const ph = (t * 0.7 + i * 0.37) % 1;
      const sx = CX + Math.cos(i * 2.4) * (95 + i * 6), sy = LY + 4 + Math.sin(i * 1.9) * 34;
      sparkle(sx, sy, 3 + Math.sin(ph * Math.PI) * 3, Math.sin(ph * Math.PI));
    }
    // ribbon
    const RY = LY + 56;
    ctx.fillStyle = '#7a1268';
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.moveTo(CX + sd * 70, RY - 5); ctx.lineTo(CX + sd * 98, RY - 5);
      ctx.lineTo(CX + sd * 90, RY + 2); ctx.lineTo(CX + sd * 98, RY + 9); ctx.lineTo(CX + sd * 70, RY + 9);
      ctx.closePath(); ctx.fill();
    });
    const rg = ctx.createLinearGradient(0, RY - 8, 0, RY + 8);
    rg.addColorStop(0, '#ff6fe0'); rg.addColorStop(1, '#c21aa0');
    ctx.fillStyle = rg;
    rr(CX - 80, RY - 8, 160, 15, 2); ctx.fill();
    text('★ A NEON ROCK SHOW ★', CX, RY, '900 8px ' + LOGO_FONT, '#ffffff');

    drawConfetti();
    // start button under the pads
    const pulse = 0.5 + 0.5 * Math.sin(t * 5);
    glossyButton(CX - 72, 240, 144, 20, '▶ TAP TO ROCK!', '#ff4fd8', true, pulse);
    text('A MICKLEKIDS GAME', CX, 266, '6px monospace', 'rgba(185,176,224,0.7)');
    hot = [];
  }

  function starRow(x, y, n, of, size, gap) {
    for (let i = 0; i < of; i++) {
      text('★', x + (i - (of - 1) / 2) * gap, y, 'bold ' + size + 'px monospace', i < n ? '#ffe14f' : '#3c2f60');
    }
  }
  function wrapLines(str, maxW) {
    const words = str.split(' '), lines = [];
    let line = '';
    words.forEach((w) => {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  function drawSelect(dt) {
    C.lanes = DIFFS[save.diff].lanes;
    drawBackground();
    drawCrowd(false);
    ctx.fillStyle = 'rgba(8,3,26,0.5)';
    ctx.fillRect(0, 0, W, H);
    hot = [];
    neonText('PICK A SONG', CX, 18, 14, '#ffe14f', '#ff4fd8');

    selAnim += (selIndex - selAnim) * Math.min(1, dt * 10);
    const cw = 112, ch = 112, cy = 100;
    const order = PREPARED.map((s, i) => i)
      .filter((i) => Math.abs(i - selAnim) < 2.8)
      .sort((a, b) => Math.abs(b - selAnim) - Math.abs(a - selAnim));
    order.forEach((i) => {
      const S = PREPARED[i], sv = songSave(S.id);
      const d = i - selAnim, ad = Math.abs(d), sel = i === selIndex;
      const sc = 1.08 - Math.min(ad, 2) * 0.2;
      const squash = 1 - Math.min(ad, 1.5) * 0.2;
      const skew = clamp(d, -1.5, 1.5) * 0.07;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - Math.min(ad, 3) * 0.3);
      ctx.translate(CX + d * SEL_SPACING, cy);
      ctx.transform(sc * squash, -skew * sc, 0, sc, 0, 0);
      const x = -cw / 2, y = -ch / 2;
      ctx.fillStyle = sel ? 'rgba(52,26,100,0.97)' : 'rgba(28,16,60,0.92)';
      rr(x, y, cw, ch, 8); ctx.fill();
      ctx.strokeStyle = sel ? '#ffe14f' : '#4ff0ff';
      ctx.lineWidth = sel ? 2 : 1;
      rr(x + 0.5, y + 0.5, cw - 1, ch - 1, 8); ctx.stroke();
      // mini stage: the lead line's first notes as coloured dots
      ctx.save();
      rr(x + 6, y + 6, cw - 12, 34, 5); ctx.clip();
      const bg = ctx.createLinearGradient(0, y + 6, 0, y + 40);
      bg.addColorStop(0, '#2b0f5c'); bg.addColorStop(1, '#0d0526');
      ctx.fillStyle = bg;
      ctx.fillRect(x + 6, y + 6, cw - 12, 34);
      const nn = S.notes.filter((q) => q.midi != null).slice(0, 12);
      const lo = Math.min.apply(null, nn.map((q) => q.midi)), hi = Math.max.apply(null, nn.map((q) => q.midi));
      nn.forEach((q, k) => {
        const qx = x + 12 + k * 8.2, qy = y + 34 - (hi > lo ? (q.midi - lo) / (hi - lo) : 0.5) * 20;
        ctx.fillStyle = LANE_COLORS[5][k % 5];
        circle(qx, qy, 2.6); ctx.fill();
      });
      ctx.restore();
      ctx.font = 'bold 9px monospace';
      const lines = wrapLines(S.title, cw - 12);
      lines.forEach((ln, k) => text(ln, 0, y + 50 + k * 10 - (lines.length - 1) * 5, 'bold 9px monospace', '#ffffff'));
      text(S.style + '  ·  ' + S.bpm + ' BPM', 0, y + 68, '6px monospace', '#b9b0e0');
      text('KIT: ' + kitById(sv.kit || S.kit).name, 0, y + 77, 'bold 6px monospace', kitById(sv.kit || S.kit).color);
      ['E', 'M', 'H'].forEach((lab, k) => {
        text(lab, x + 20, y + 87 + k * 7, 'bold 6px monospace', k === save.diff ? '#ffe14f' : '#8a7fc0', 'left');
        starRow(4, y + 87 + k * 7, sv.stars[k], 5, 7, 8);
      });
      text('BEST ' + sv.best[save.diff].toLocaleString('en-US'), 0, y + ch - 5, 'bold 6px monospace', '#4ff0ff');
      ctx.restore();
      if (!sel) {
        const sx = CX + d * SEL_SPACING;
        hot.push({ x: sx - 40, y: cy - 50, w: 80, h: 100, fn: () => moveSong(i - selIndex) });
      } else {
        hot.push({ x: CX - cw / 2, y: cy - ch / 2, w: cw, h: ch, fn: play });
      }
    });

    // level, kit and play rows
    const rowY = [0, 180, 200, 228];
    const pill = (row, label, color, onPrev, onNext) => {
      const y = rowY[row], w = 196, x = CX - w / 2, focus = selRow === row;
      ctx.fillStyle = focus ? 'rgba(60,30,110,0.95)' : 'rgba(24,12,50,0.9)';
      rr(x, y - 8, w, 16, 8); ctx.fill();
      ctx.strokeStyle = focus ? '#ffe14f' : 'rgba(185,176,224,0.4)';
      ctx.lineWidth = focus ? 1.5 : 1;
      rr(x, y - 8, w, 16, 8); ctx.stroke();
      text('◀', x + 12, y, 'bold 9px monospace', focus ? '#ffe14f' : '#b9b0e0');
      text('▶', x + w - 12, y, 'bold 9px monospace', focus ? '#ffe14f' : '#b9b0e0');
      text(label, CX, y, 'bold 8px monospace', color);
      hot.push({ x: x - 10, y: y - 10, w: w / 2 + 10, h: 20, fn: () => { selRow = row; onPrev(); } });
      hot.push({ x: CX, y: y - 10, w: w / 2 + 10, h: 20, fn: () => { selRow = row; onNext(); } });
    };
    const D = DIFFS[save.diff];
    pill(1, 'LEVEL: ' + D.name + '  ·  ' + D.lanes + ' PADS', ['#3ddc5a', '#ffd23d', '#ff4a4a'][save.diff], () => setDiff(-1), () => setDiff(1));
    const kit = KITS[curKitIndex()];
    const suggested = kitById(PREPARED[selIndex].kit) === kit;
    pill(2, 'KIT: ' + kit.name + (suggested ? '  ★' : ''), kit.color, () => setKit(-1), () => setKit(1));
    // PLAY button
    const focus = selRow === 3, pulse = 0.5 + 0.5 * Math.sin(fxNow() * 5);
    drawGlow('#ff4fd8', CX, rowY[3], 50, 0.25 + (focus ? pulse * 0.35 : 0));
    ctx.fillStyle = '#ff4fd8';
    rr(CX - 50, rowY[3] - 10, 100, 20, 10); ctx.fill();
    ctx.strokeStyle = focus ? '#ffe14f' : '#ffffff';
    ctx.lineWidth = focus ? 2 : 1;
    rr(CX - 50, rowY[3] - 10, 100, 20, 10); ctx.stroke();
    text('▶ PLAY!', CX, rowY[3], 'bold 11px monospace', '#ffffff');
    hot.push({ x: CX - 54, y: rowY[3] - 12, w: 108, h: 24, fn: play });

    // which song of how many
    PREPARED.forEach((s, i) => {
      ctx.fillStyle = i === selIndex ? '#4ff0ff' : 'rgba(255,255,255,0.4)';
      circle(CX + (i - (PREPARED.length - 1) / 2) * 9, 166, i === selIndex ? 2.4 : 1.6); ctx.fill();
    });
    text('◀ ▶ PICK  ·  ▲ ▼ CHANGE ROW  ·  SPACE / A TO PLAY', CX, 252, '7px monospace', '#b9b0e0');
    text('★ = THE KIT THIS SONG LIKES BEST', CX, 262, '6px monospace', '#8a7fc0');
  }

  function finishSong() {
    const P = players[0];
    const total = C.notes.length;
    const stars = starsFor(P, total);
    const sv = songSave(C.S.id);
    const newBest = P.score > sv.best[C.d];
    if (newBest) sv.best[C.d] = P.score;
    sv.stars[C.d] = Math.max(sv.stars[C.d], stars);
    writeSave();
    results = {
      si: C.si, d: C.d, kit: C.kit.id, title: C.S.title, score: P.score, bestStreak: P.bestStreak,
      perfect: P.counts[0], stars, newBest, t0: fxNow(), shown: 0,
    };
    quitSong();
    state = 'results';
  }

  const RANKS = ['GOOD JAM!', 'COOL BEATS!', 'GREAT GROOVE!', 'AWESOME!', 'ROCK STAR!'];
  function drawResults() {
    C.lanes = DIFFS[results.d].lanes;
    const t = fxNow() - results.t0;
    const starsDone = 0.5 + results.stars * 0.35;
    if (Math.random() < 0.1 + results.stars * 0.06) dropConfetti(1, false);
    drawBackground();
    drawCrowd(false);
    drawBandSlots();
    drawCrowd(true);
    drawConfetti();
    hot = [];

    // the card slides up into place
    const slide = easeOut(clamp(t / 0.35, 0, 1));
    const x = CX - 140, w = 280, h = 226, y = 18 + (1 - slide) * 40;
    ctx.save();
    ctx.globalAlpha = slide;
    drawGlow('#ff4fd8', CX, y + h / 2, 190, 0.25);
    const cg = ctx.createLinearGradient(0, y, 0, y + h);
    cg.addColorStop(0, 'rgba(46,16,96,0.97)');
    cg.addColorStop(1, 'rgba(14,6,36,0.97)');
    ctx.fillStyle = cg;
    rr(x, y, w, h, 14); ctx.fill();
    ctx.strokeStyle = '#ff4fd8'; ctx.lineWidth = 2.5;
    rr(x, y, w, h, 14); ctx.stroke();
    ctx.strokeStyle = 'rgba(79,240,255,0.6)'; ctx.lineWidth = 0.8;
    rr(x + 4, y + 4, w - 8, h - 8, 11); ctx.stroke();
    // corner bolts
    [[x + 11, y + 11], [x + w - 11, y + 11], [x + 11, y + h - 11], [x + w - 11, y + h - 11]].forEach(([bx, by]) => {
      ctx.fillStyle = '#b9b0e0'; circle(bx, by, 2); ctx.fill();
      ctx.fillStyle = '#5a4a8a'; circle(bx + 0.4, by + 0.4, 0.9); ctx.fill();
    });

    // marquee header with chasing bulbs
    const mx = x + 24, my = y + 9, mw = w - 48, mh = 30;
    ctx.fillStyle = '#12052a';
    rr(mx, my, mw, mh, 6); ctx.fill();
    const bulbs = [];
    for (let bx = mx + 4; bx <= mx + mw - 4; bx += 9) bulbs.push([bx, my + 1]);
    for (let by = my + 9; by <= my + mh - 9; by += 9) bulbs.push([mx + mw - 1, by]);
    for (let bx = mx + mw - 4; bx >= mx + 4; bx -= 9) bulbs.push([bx, my + mh - 1]);
    for (let by = my + mh - 9; by >= my + 9; by -= 9) bulbs.push([mx + 1, by]);
    const chase = Math.floor(t * 12);
    bulbs.forEach(([bx, by], i) => {
      const on = (i + chase) % 3 === 0;
      if (on) drawGlow('#ffe14f', bx, by, 5, 0.9 * slide);
      ctx.fillStyle = on ? '#fff6b0' : '#6a5420';
      circle(bx, by, 1.4); ctx.fill();
    });
    bigText('SONG COMPLETE!', CX, my + mh / 2 + 1, 15, ['#ffffff', '#fff6b0', '#ffd23d'], '#ff4fd8', { depth: 2, track: 0.5 });

    // song, level and kit chips
    const chipY = y + 50;
    const diff = DIFFS[results.d], kit = kitById(results.kit);
    const chips = [[results.title, '#ffffff', 'rgba(255,255,255,0.12)'],
      [diff.name, ['#3ddc5a', '#ffd23d', '#ff4a4a'][results.d], 'rgba(0,0,0,0.35)'],
      [kit.name, kit.color, 'rgba(0,0,0,0.35)']];
    ctx.font = 'bold 6px monospace';
    const cws = chips.map((c) => ctx.measureText(c[0]).width + 10);
    let cx = CX - (cws.reduce((a, b) => a + b, 0) + 4 * (chips.length - 1)) / 2;
    chips.forEach((c, i) => {
      ctx.fillStyle = c[2]; rr(cx, chipY - 5, cws[i], 10, 5); ctx.fill();
      ctx.strokeStyle = hexA(c[1], 0.6); ctx.lineWidth = 0.7;
      rr(cx, chipY - 5, cws[i], 10, 5); ctx.stroke();
      text(c[0], cx + cws[i] / 2, chipY + 0.5, 'bold 6px monospace', c[1]);
      cx += cws[i] + 4;
    });

    // stars pop in one by one, each with a ding, then rays turn behind them
    const sy = y + 80;
    if (t > starsDone - 0.2) {
      ctx.save();
      ctx.translate(CX, sy);
      ctx.rotate(t * 0.3);
      ctx.globalCompositeOperation = 'lighter';
      const rayA = clamp((t - starsDone + 0.2) / 0.5, 0, 1) * (0.05 + results.stars * 0.012);
      for (let i = 0; i < 14; i++) {
        ctx.fillStyle = hexA('#ffd23d', rayA);
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 110, i / 14 * TAU, (i + 0.5) / 14 * TAU); ctx.closePath(); ctx.fill();
      }
      ctx.restore();
    }
    for (let i = 0; i < 5; i++) {
      const at = 0.5 + i * 0.35;
      const px = CX + (i - 2) * 36, py = sy + (i === 0 || i === 4 ? 3 : i === 2 ? -3 : 0);
      const R = i === 2 ? 17 : 15;
      const on = i < results.stars && t >= at;
      if (on && results.shown <= i) {
        results.shown = i + 1;
        if (actx) {
          tone(A.kit, 'sine', mtof(67 + [0, 2, 4, 7, 9][i]), actx.currentTime, 0.5, 0.22, { attack: 0.006 });
          tone(A.kit, 'sine', mtof(55 + [0, 2, 4, 7, 9][i]), actx.currentTime, 0.4, 0.1, { attack: 0.006 });
        }
        burst(px, py, '#ffe14f', 14, false);
        if (i === results.stars - 1) dropConfetti(25 + results.stars * 8, false);
      }
      const k = on ? clamp((t - at) / 0.25, 0, 1) : 1;
      const s = on ? (k < 0.6 ? easeOut(k / 0.6) * 1.35 : 1.35 - (k - 0.6) / 0.4 * 0.35) : 1;
      if (on) drawGlow('#ffd23d', px, py, R * 2, 0.5 * slide);
      ctx.save();
      ctx.translate(px, py);
      ctx.scale(s, s);
      ctx.rotate(on ? (1 - k) * -0.6 : 0);
      bigStar(0, 0, R, on);
      ctx.restore();
      if (on) sparkle(px + R * 0.7, py - R * 0.6, 3, 0.5 + 0.5 * Math.sin(fxNow() * 6 + i));
    }
    // the rank word, stamped in once the stars are done
    if (t > starsDone) {
      const k = clamp((t - starsDone) / 0.25, 0, 1);
      ctx.save();
      ctx.translate(CX, y + 108);
      ctx.rotate(-0.04);
      ctx.scale(2 - easeOut(k), 2 - easeOut(k));
      ctx.globalAlpha = slide * k;
      bigText(RANKS[results.stars - 1], 0, 0, 13, ['#ffffff', '#b8fbff', '#4ff0ff'], '#b45cff', { depth: 2, track: 1 });
      ctx.restore();
    }

    // the score on an LED panel, counting up with soft ticks
    const countK = clamp((t - 0.3) / 1.4, 0, 1);
    const countUp = Math.round(results.score * easeOut(countK));
    if (countK > 0 && countK < 1 && actx && Math.floor(t * 9) !== results.tick) {
      results.tick = Math.floor(t * 9);
      scoreTick(actx.currentTime, countK);
    }
    const px0 = CX - 78, py0 = y + 121;
    ctx.fillStyle = '#05020d';
    rr(px0, py0, 156, 28, 6); ctx.fill();
    ctx.strokeStyle = '#3b2a63'; ctx.lineWidth = 1;
    rr(px0, py0, 156, 28, 6); ctx.stroke();
    text('SCORE', px0 + 8, py0 + 7, 'bold 5px monospace', '#8a7fc0', 'left');
    drawGlow('#4ff0ff', CX, py0 + 16, 60, 0.18 * slide);
    text(countUp.toLocaleString('en-US'), CX, py0 + 16, 'bold 17px monospace', '#ffffff');
    // NEW BEST: a ribbon across the card's corner
    if (results.newBest && t > 1.8) {
      const k = clamp((t - 1.8) / 0.25, 0, 1);
      ctx.save();
      rr(x, y, w, h, 14); ctx.clip();
      ctx.translate(x + w - 24, y + 24);
      ctx.rotate(Math.PI / 4);
      ctx.scale(k, 1);
      const bg = ctx.createLinearGradient(0, -7, 0, 7);
      bg.addColorStop(0, '#fff6b0'); bg.addColorStop(1, '#ff9a1f');
      ctx.fillStyle = bg;
      ctx.fillRect(-50, -7, 100, 14);
      text('NEW BEST!', 0, 0.5, '900 7px ' + LOGO_FONT, '#5a1a00');
      ctx.restore();
    }

    // stat tiles (never a count of misses)
    const tile = (tx, label, value, col, icon) => {
      const ty = y + 156;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      rr(tx, ty, 108, 28, 7); ctx.fill();
      ctx.strokeStyle = hexA(col, 0.5); ctx.lineWidth = 0.8;
      rr(tx, ty, 108, 28, 7); ctx.stroke();
      icon(tx + 15, ty + 14);
      text(label, tx + 30, ty + 9, 'bold 5px monospace', '#b9b0e0', 'left');
      text(value, tx + 30, ty + 19, 'bold 11px monospace', col, 'left');
    };
    tile(CX - 114, 'BEST STREAK', String(results.bestStreak), '#ff9a3d', (ix, iy) => {   // a flickering flame
      const fl = Math.sin(fxNow() * 12) * 0.6;
      ctx.fillStyle = '#ff5a1f';
      ctx.beginPath();
      ctx.moveTo(ix, iy - 9 - fl); ctx.quadraticCurveTo(ix + 8, iy - 1, ix + 5, iy + 6);
      ctx.quadraticCurveTo(ix, iy + 9, ix - 5, iy + 6); ctx.quadraticCurveTo(ix - 7, iy - 2, ix, iy - 9 - fl);
      ctx.fill();
      ctx.fillStyle = '#ffd23d';
      ctx.beginPath();
      ctx.moveTo(ix, iy - 3 - fl); ctx.quadraticCurveTo(ix + 4, iy + 2, ix + 2, iy + 6);
      ctx.quadraticCurveTo(ix, iy + 7, ix - 2, iy + 6); ctx.quadraticCurveTo(ix - 4, iy + 2, ix, iy - 3 - fl);
      ctx.fill();
    });
    tile(CX + 6, 'PERFECT HITS', String(results.perfect), '#ffe14f', (ix, iy) => {    // a bullseye
      [[8, '#ff4a4a'], [5.5, '#ffffff'], [3, '#ff4a4a']].forEach(([r, c]) => { ctx.fillStyle = c; circle(ix, iy, r); ctx.fill(); });
      sparkle(ix + 6, iy - 6, 3, 0.6 + 0.4 * Math.sin(fxNow() * 7));
    });

    // buttons
    const by = y + 193;
    const pulse = 0.5 + 0.5 * Math.sin(fxNow() * 5);
    glossyButton(CX - 116, by, 128, 22, '▶ PLAY AGAIN', '#ff4fd8', true, pulse);
    glossyButton(CX + 20, by, 96, 22, '♪ SONGS', '#4ff0ff', false);
    hot.push({ x: CX - 116, y: by - 2, w: 128, h: 26, fn: () => menuInput('ok') });
    hot.push({ x: CX + 20, y: by - 2, w: 96, h: 26, fn: () => menuInput('back') });
    ctx.restore();
    text('SPACE / A: PLAY AGAIN  ·  ESC / B: SONGS', CX, 257, 'bold 6px monospace', 'rgba(185,176,224,0.85)');
    drawParticles();
  }

  // =========================================================================== Save
  const SAVE_KEY = 'boomBoomBand.save';
  function loadSave() {
    const def = { v: 1, diff: 0, song: 0, volume: 1, latencyMs: null, songs: {} };
    try {
      const s = JSON.parse(localStorage.getItem(SAVE_KEY));
      if (s && typeof s === 'object') return Object.assign(def, s);
    } catch (e) { /* storage can throw */ }
    return def;
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage can throw */ }
  }
  function songSave(id) {
    if (!save.songs[id]) save.songs[id] = { best: [0, 0, 0], stars: [0, 0, 0], kit: null };
    return save.songs[id];
  }

  // =========================================================================== Debug
  // window.BoomBoomBandDebug: state for tests, an autoplay bot, jump(seconds), and a kit
  // fingerprint that renders a kit offline so "the sound changed" can be checked without ears.
  let bot = null;
  function runBot() {
    if (!bot || !C.on || C.paused || C.resuming) return;
    const now = songNow();
    for (let i = C.first; i < C.notes.length; i++) {
      const n = C.notes[i];
      if (n.t - now > 0.5) break;
      if (n.state !== 0 || n.botDone) continue;
      if (n.botErr === undefined) n.botErr = (Math.random() * 2 - 1) * bot.acc;
      const at = n.t + n.botErr;
      if (now >= at) { n.botDone = true; hit(0, n.lane, bot.frameTime ? now : at); }
    }
  }
  window.BoomBoomBandDebug = {
    get state() { return state; },
    get conductor() { return C; },
    get audio() { return actx; },
    get player() { return players[0]; },
    get save() { return save; },
    songs: () => PREPARED.map((s) => {
      const lastChord = s.chordList[s.chordList.length - 1];
      return {
        id: s.id, title: s.title, seconds: beatTime(s, s.beats), leadBeats: s.beats,
        chordBeats: lastChord.beat + lastChord.dur, badPitches: s.notes.filter((n) => n.midi === null).length,
      };
    }),
    chart: (si, d) => buildChart(PREPARED[si], d),
    start(si, d, kitId) { startSong(si || 0, d || 0, kitId || PREPARED[si || 0].kit); return C.notes.length; },
    // accuracyMs: each hit lands up to this far off its note; frameTime: hit at the frame's time instead
    autoplay(accuracyMs, frameTime) { bot = accuracyMs == null ? null : { acc: accuracyMs / 1000, frameTime: !!frameTime }; },
    jump(seconds) {
      if (!C.on) return;
      const target = seconds;
      const raw = actx.currentTime - C.songStart;
      C.songStart -= target - raw;
      stopBand();
      C.notes.forEach((n) => { if (n.state === 0 && n.t < target) n.state = 3; });   // skipped, not missed
      while (C.first < C.notes.length && C.notes[C.first].state !== 0) C.first++;
      C.ptr = C.backing.findIndex((e) => e.t >= target);
      if (C.ptr < 0) C.ptr = C.backing.length;
    },
    hit: (lane, t) => hit(0, lane, t == null ? songNow() : t),
    frameWorkMs() {
      const v = frameWork.slice().sort((a, b) => a - b);
      return v.length ? { frames: v.length, median: +v[v.length >> 1].toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2) } : null;
    },
    songNow, eventSongTime, audioNow,
    pause: () => pauseSong('tab'), resume: resumeSong,
    timing() {
      const log = C.log || [];
      const abs = log.map((l) => Math.abs(l.dt) * 1000);
      return {
        hits: log.length, notes: C.notes.length,
        counts: players[0] ? players[0].counts.slice() : null,
        maxAbsErrMs: abs.length ? Math.max.apply(null, abs) : null,
        meanErrMs: log.length ? log.reduce((a, l) => a + l.dt * 1000, 0) / log.length : null,
        drawMinusAudioMs: [clockStats.min * 1000, clockStats.max * 1000],
        scheduler: { events: schedStats.n, minLeadMs: schedStats.minLead * 1000, late: schedStats.late },
        latencyMs: latency() * 1000,
      };
    },
    // pitch: optional midi note (pitched kits); otherwise the lane's pentatonic note
    kitFingerprint(kitId, lane, laneCount, pitch) {
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const oc = new OAC(1, 44100, 44100);
      const keep = A;
      A = makeTarget(oc, oc.destination);
      const n = laneCount || 4, l = lane == null ? 1 : lane;
      kitById(kitId).play(l, n, pitch == null ? strayPitch(PREPARED[0], l, n) : pitch, 0.01, 1);
      A = keep;
      return oc.startRendering().then((buf) => {
        const d = buf.getChannelData(0);
        let e = 0, zc = 0, peakAt = 0, peak = 0, tail = 0;
        // one-pole high-passes at 2 kHz and 5 kHz: 2-5 kHz is where ears are most sensitive
        // (shrill), above 5 kHz is hiss
        const a2 = 1 / (1 + 2 * Math.PI * 2000 / 44100), a5 = 1 / (1 + 2 * Math.PI * 5000 / 44100);
        let h2 = 0, h5 = 0, p2 = 0, p5 = 0, e2 = 0, e5 = 0;
        for (let i = 0; i < d.length; i++) {
          e += d[i] * d[i];
          if (i && (d[i] >= 0) !== (d[i - 1] >= 0)) zc++;
          if (Math.abs(d[i]) > peak) { peak = Math.abs(d[i]); peakAt = i; }
          if (Math.abs(d[i]) > 0.01) tail = i;
          h2 = a2 * (h2 + d[i] - p2); p2 = d[i]; e2 += h2 * h2;
          h5 = a5 * (h5 + d[i] - p5); p5 = d[i]; e5 += h5 * h5;
        }
        const db = (v) => +(20 * Math.log10(Math.max(1e-9, v))).toFixed(1);
        return {
          kit: kitId, lane: l, rmsDb: db(Math.sqrt(e / d.length)), peakDb: db(peak), ringMs: Math.round(tail / 44.1),
          shrillPct: +(100 * Math.max(0, e2 - e5) / Math.max(1e-12, e)).toFixed(1),
          hissPct: +(100 * e5 / Math.max(1e-12, e)).toFixed(1),
        };
      });
    },
    // Render a stretch of a song offline -- backing band plus a player -- and measure it, so
    // "is it harsh / too loud" can be checked without ears. opts: { seconds, d, mash, ticks }
    //   mash: a kid banging random pads 10 times a second instead of playing the notes
    //   ticks: just the results card's score count-up
    renderMix(si, kitId, opts) {
      opts = opts || {};
      const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
      const secs = opts.seconds || 8, SR = 44100;
      const oc = new OAC(1, SR * secs, SR);
      const keep = A;
      A = makeTarget(oc, oc.destination);
      const S = PREPARED[si || 0], kit = kitById(kitId || S.kit), d = opts.d == null ? 1 : opts.d, n = DIFFS[d].lanes;
      const t0 = 0.1 + S.bpb * S.beatDur;
      const mash = makeMashGuard();
      if (opts.ticks) {
        for (let i = 0; i < 13; i++) scoreTick(0.1 + i / 9, i / 13);
      } else {
        buildBacking(S, kit).forEach((e) => { if (t0 + e.t >= 0 && t0 + e.t < secs) e.play(t0 + e.t); });
        if (opts.mash) {
          for (let t = t0; t < secs; t += 0.1) {
            const lane = (Math.random() * n) | 0;
            kit.play(lane, n, strayPitch(S, lane, n), t, mash.velocity(t, false));
          }
        } else {
          buildChart(S, d).forEach((nt) => {
            if (t0 + nt.t < secs) kit.play(nt.lane, n, nt.midi, t0 + nt.t, mash.velocity(t0 + nt.t, true));
          });
        }
      }
      A = keep;
      return oc.startRendering().then((buf) => {
        const x = buf.getChannelData(0);
        let e = 0, peak = 0, hp = 0, ehp = 0, prev = 0, over = 0;
        const a = 1 / (1 + 2 * Math.PI * 5000 / SR);   // one-pole high-pass at ~5 kHz
        for (let i = 0; i < x.length; i++) {
          const v = x[i];
          e += v * v;
          const av = Math.abs(v);
          if (av > peak) peak = av;
          if (av > 0.98) over++;
          hp = a * (hp + v - prev);
          prev = v;
          ehp += hp * hp;
        }
        const db = (p) => +(20 * Math.log10(Math.max(1e-9, p))).toFixed(1);
        return {
          rmsDb: db(Math.sqrt(e / x.length)), peakDb: db(peak), clipped: over,
          sizzlePct: +(100 * ehp / Math.max(1e-12, e)).toFixed(2),   // share of energy above ~5 kHz
        };
      });
    },
  };

  // =========================================================================== Boot
  const PREPARED = SONGS.map(prepareSong);
  const save = loadSave();
  selIndex = clamp(save.song | 0, 0, PREPARED.length - 1);
  selAnim = selIndex;
  save.diff = clamp(save.diff | 0, 0, DIFFS.length - 1);
  save.volume = clamp(save.volume == null ? 1 : save.volume | 0, 0, VOLUMES.length - 1);

  // SOUND: QUIET / MEDIUM / LOUD -- a button that shared/menu.js moves into the ☰ menu
  const volBtn = document.getElementById('vol');
  function showVolume() { if (volBtn) volBtn.textContent = '\u266A SOUND: ' + VOLUME_NAMES[save.volume]; }
  function setVolume(i) {
    save.volume = (i + VOLUMES.length) % VOLUMES.length;
    writeSave();
    showVolume();
    if (actx && liveTarget) liveTarget.master.gain.setTargetAtTime(VOLUMES[save.volume], actx.currentTime, 0.05);
  }
  if (volBtn) {
    showVolume();
    volBtn.addEventListener('click', () => {
      setVolume(save.volume + 1);
      // a sample at the new level -- played straight away if the song is paused for the menu
      if (actx && liveTarget) {
        const keep = A; A = liveTarget;
        const play = () => { const t = actx.currentTime + 0.02; [0, 4, 7].forEach((s, i) => tone(A.kit, 'sine', mtof(72 + s), t + i * 0.08, 0.3, 0.25)); };
        if (actx.state === 'running') play();
        A = keep;
      }
    });
  }

  function updatePlay() {
    if (!C.on) return;
    if (C.paused || C.resuming) return;
    runBot();
    const now = songNow();
    checkMisses(now);
    if (audioNow() - C.songStart > C.end + 1.8 && C.first >= C.notes.length) finishSong();
  }

  let last = performance.now();
  function loop(ts) {
    requestAnimationFrame(loop);
    const dt = Math.min(0.05, Math.max(0, (ts - last) / 1000));
    last = ts;
    const work0 = performance.now();
    if (window.Pad360) Pad360.poll();
    sampleClock();
    checkMenuPause();
    pollPad();
    if (state === 'play') updatePlay();
    updateFx(dt);
    if (state === 'play' && !C.on) state = 'select';
    if (state === 'play') drawPlay();
    else if (state === 'select') drawSelect(dt);
    else if (state === 'results' && results) drawResults();
    else drawTitle();
    // debug: how long each frame's own work takes (update + draw), recent window
    frameWork.push(performance.now() - work0);
    if (frameWork.length > 240) frameWork.shift();
  }
  const frameWork = [];
  requestAnimationFrame(loop);
})();
