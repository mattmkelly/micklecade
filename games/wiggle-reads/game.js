// Wiggle Reads -- phonics, sight words and reading comprehension, K-6.
// Three ways to play over one set of reading activities (content.js):
//   TRAIL  -- 12 stops per grade on a winding map; each stop is a 6-question round, every 4th
//             stop is a little story with questions plus build-a-sentence. Up to 3 stars a stop.
//   ARCADE -- BALLOON POP (pop the right answer), FIREFLY CATCH (catch every word that fits the
//             rule), WORD TRAIN (hook word cars on in sentence order). 60-90 s, high scores.
//   GARDEN -- answer questions to earn seeds, spend them on things for Wiggle's garden.
// Everything is DOM inside #stage, which is 48em x 27em (font-size = stage width / 48).
// Wrong answers never punish: the button wiggles, a friendly tip shows, try again. Stars count
// first tries. The browser's voice reads aloud when it has one (save.voice toggles it).
(function () {
  'use strict';
  const C = window.WiggleContent;
  const GR = C.grades;
  const stage = document.getElementById('stage');
  const $ = (s, el) => (el || document).querySelector(s);

  // ---------------------------------------------------------------- little helpers
  function h(tag, props) {
    const el = document.createElement(tag);
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.slice(0, 2) === 'on') el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v);
    }
    for (let i = 2; i < arguments.length; i++) add(el, arguments[i]);
    return el;
  }
  function add(el, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach((x) => add(el, x)); return; }
    el.append(c.nodeType ? c : document.createTextNode(String(c)));
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const sample = (a, n) => shuffle(a.slice()).slice(0, n);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const em = () => parseFloat(stage.style.fontSize) || 10;

  function fit() { stage.style.fontSize = (stage.clientWidth / 48) + 'px'; fitQuestion(); }
  // A question can be taller than the room under the HUD (a picture + a word + picture answers,
  // or a device whose emoji draw big). Shrink the question area until nothing spills off the frame.
  function fitQuestion() {
    const main = document.querySelector('#s-quiz.on .qmain');
    if (!main) return;
    let f = 1;
    main.style.fontSize = '';
    const over = () => main.scrollHeight > main.clientHeight + 1 || main.scrollWidth > main.clientWidth + 1;
    while (over() && f > 0.55) { f -= 0.05; main.style.fontSize = f + 'em'; }
  }
  fit();
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  // ---------------------------------------------------------------- save
  const KEY = 'wiggleReads.save';
  const save = (function () {
    let s = {};
    try { s = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { s = {}; }
    return Object.assign({ grade: 0, voice: true, seeds: 15, trail: {}, trailAt: {}, best: {}, garden: [], cup: {}, decks: {} }, s);
  })();
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) { /* storage can throw */ } }
  // A deck deals every item of a list once, in a shuffled order, before any item comes back.
  // Decks are saved, so coming back tomorrow carries on where the deck left off.
  let deckSave = 0;
  function deal(id, n) {
    let d = save.decks[id];
    if (!d || d.n !== n || !d.left || !d.left.length) {
      const last = d && d.last;
      const left = shuffle(Array.from({ length: n }, (_, i) => i));
      // don't let the last item of one round be the first of the next
      if (n > 1 && left[left.length - 1] === last) left.unshift(left.pop());
      d = save.decks[id] = { n, left };
    }
    const i = d.left.pop();
    d.last = i;
    clearTimeout(deckSave);
    deckSave = setTimeout(persist, 400);
    return i;
  }
  const dealFrom = (id, arr) => arr[deal(id, arr.length)];
  // grades 7-12 stay hidden until a learning game's top level is finished (shared/grades.js)
  const shownN = () => (window.MickleGrades && MickleGrades.unlocked() ? GR.length : 7);
  const G = () => Math.min(save.grade, shownN() - 1);
  const young = () => save.grade <= 2;
  function addSeeds(n) { save.seeds = Math.min(99999, save.seeds + n); persist(); }

  // ---------------------------------------------------------------- sound (soft, WebAudio)
  let actx = null;
  function ac() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type, vol, delay) {
    const a = ac(); if (!a) return;
    const t = a.currentTime + (delay || 0);
    const o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine'; o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol || 0.1, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    good() { tone(784, 0.16, 'triangle', 0.11); tone(1175, 0.28, 'triangle', 0.1, 0.08); },
    oops() { tone(392, 0.12, 'sine', 0.08); tone(330, 0.18, 'sine', 0.07, 0.09); },
    tap() { tone(660, 0.06, 'sine', 0.05); },
    pop() { tone(950, 0.05, 'triangle', 0.1); tone(1500, 0.09, 'sine', 0.07, 0.03); },
    star(i) { tone(880 * Math.pow(1.26, i), 0.3, 'triangle', 0.1); },
    win() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.1, i * 0.1)); },
    plant() { tone(523, 0.1, 'sine', 0.1); tone(784, 0.16, 'sine', 0.09, 0.07); },
    boing() { tone(300, 0.08, 'sine', 0.09); tone(600, 0.12, 'sine', 0.07, 0.05); },
    toot() { tone(523, 0.18, 'triangle', 0.08); tone(659, 0.3, 'triangle', 0.08, 0.16); },
  };

  // ---------------------------------------------------------------- voice
  const canSpeak = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  let voice = null;
  function pickVoice() {
    if (!canSpeak) return;
    let vs = [];
    try { vs = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); } catch (e) { return; }
    const pref = [/samantha/i, /aria/i, /jenny/i, /google us english/i, /zira/i, /en[-_]US/i];
    // voices on the device start talking much sooner than online ones, so try those first
    for (const pool of [vs.filter((x) => x.localService), vs]) {
      for (const p of pref) { const v = pool.find((x) => p.test(x.name) || p.test(x.lang)); if (v) { voice = v; return; } }
    }
    voice = vs[0] || null;
  }
  if (canSpeak) { pickVoice(); try { speechSynthesis.onvoiceschanged = pickVoice; } catch (e) { /* ignore */ } }
  const voiceOn = () => canSpeak && save.voice;
  function cleanSpeech(t) {
    return String(t).replace(/_{2,}/g, ' blank ')
      .replace(/[\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{231A}-\u{23FF}]/gu, '')
      .replace(/\s+/g, ' ').trim();
  }
  // Each say() is one "generation". Some voices (online ones especially) start late, so a line
  // can begin after its question is already gone; a line that starts out of date is cut off and
  // the current line is spoken instead. cancel() + an immediate speak() also drops lines in
  // Chrome, hence the short wait before speaking.
  let speechGen = 0, speechNow = null, sayDone = null;
  // Say something, then call next() once the voice has finished -- but never sooner than `min` ms
  // (time to see the celebration) and never later than a guess at how long it should take, in case a
  // voice never reports that it ended. Without a voice it just waits `min`.
  function sayThen(text, next, min) {
    min = min || 1000;
    const t0 = Date.now();
    let fired = false;
    const go = () => { if (fired) return; fired = true; setTimeout(next, Math.max(0, min - (Date.now() - t0))); };
    if (!voiceOn()) { go(); return; }
    setTimeout(go, 2500 + String(text).length * 110);
    sayDone = go;
    say(text);
  }
  function utter(t) {
    const u = new SpeechSynthesisUtterance(t);
    if (voice) { u.voice = voice; u.lang = voice.lang; } else u.lang = 'en-US';
    u.rate = young() ? 0.82 : 0.92; u.pitch = 1.05;
    return u;
  }
  function speakList(texts, gen, done) {
    texts.forEach((t, k) => {
      const u = utter(t);
      if (done && k === texts.length - 1) u.onend = () => { if (gen === speechGen) done(); };
      u.onstart = () => {
        if (gen === speechGen) return;
        try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
        const cur = speechGen, again = speechNow;
        if (again) setTimeout(() => { if (cur === speechGen) speakList(again, cur); }, 80);
      };
      speechSynthesis.speak(u);
    });
  }
  function say() {
    if (!voiceOn()) return;
    readerStopped();
    const texts = [].concat.apply([], arguments).filter(Boolean).map(cleanSpeech).filter(Boolean);
    const gen = ++speechGen, done = sayDone;
    sayDone = null;
    speechNow = texts;
    try {
      speechSynthesis.cancel();
      setTimeout(() => { if (gen === speechGen) try { speakList(texts, gen, done); } catch (e) { /* ignore */ } }, 60);
    } catch (e) { /* no voice: words stay on screen */ }
  }
  function hush() { readerStopped(); speechGen++; speechNow = null; if (canSpeak) try { speechSynthesis.cancel(); } catch (e) { /* ignore */ } }

  // STORY READER: a passage is read one sentence at a time, so PAUSE can remember the sentence and
  // PLAY carries on from it (speechSynthesis.pause() is unreliable on Android tablets -- on some it
  // just stops). The reader belongs to one passage and keeps its place across that story's questions.
  let reader = null; // { p, items, i, state: 'idle' | 'playing' | 'paused', btn, again, after }
  function newReader(p) {
    const sentences = (p.p.match(/[^.!?]+[.!?]+["')]*\s*/g) || [p.p]).map((x) => x.trim()).filter(Boolean);
    return { p, items: [p.t + '.'].concat(sentences), i: 0, state: 'idle', btn: null, again: null, after: null };
  }
  function readerSync() {
    if (!reader || !reader.btn) return;
    const icon = reader.state === 'playing' ? '⏸️' : reader.state === 'paused' ? '▶️' : '🔊';
    reader.btn.firstChild.textContent = icon;
    reader.btn.setAttribute('aria-label', reader.state === 'playing' ? 'Pause' : reader.state === 'paused' ? 'Keep reading' : 'Read it to me');
    reader.btn.classList.toggle('reading', reader.state === 'playing');
    reader.again.style.display = reader.state === 'idle' ? 'none' : '';
  }
  // something else is about to speak (or speech is being stopped): the story pauses where it was
  function readerStopped() {
    if (reader && reader.state === 'playing') { reader.state = 'paused'; readerSync(); }
  }
  function readerPlay(from) {
    if (!reader) return;
    if (!voiceOn()) { flashTip(canSpeak ? 'The voice is off. Turn it on from the title screen.' : 'This device has no reading voice.'); return; }
    if (from != null) reader.i = from;
    if (reader.i >= reader.items.length) reader.i = 0;
    const r = reader, gen = ++speechGen, start = r.i;
    speechNow = null;
    r.state = 'playing'; readerSync();
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    setTimeout(() => {
      if (gen !== speechGen) return;
      r.items.slice(start).forEach((t, k) => {
        const u = utter(cleanSpeech(t));
        u.onend = () => {
          if (gen !== speechGen || r !== reader) return;
          r.i = start + k + 1;
          if (r.i >= r.items.length) {
            r.i = 0; r.state = 'idle'; readerSync();
            if (r.after) { const a = r.after; r.after = null; say(a); }
          }
        };
        try { speechSynthesis.speak(u); } catch (e) { /* ignore */ }
      });
    }, 60);
  }
  function readerPause() {
    if (!reader || reader.state !== 'playing') return;
    speechGen++;
    try { speechSynthesis.cancel(); } catch (e) { /* ignore */ }
    reader.state = 'paused'; readerSync();
  }

  // ---------------------------------------------------------------- Wiggle the bookworm
  let svgId = 0;
  function wiggleSVG(cls) {
    const id = 'wg' + (++svgId);
    return '<svg class="' + (cls || '') + '" viewBox="0 0 120 100" aria-hidden="true">' +
      '<defs><radialGradient id="' + id + '" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#d9f99d"/><stop offset=".55" stop-color="#84cc16"/><stop offset="1" stop-color="#4d7c0f"/></radialGradient></defs>' +
      '<circle cx="16" cy="80" r="11" fill="url(#' + id + ')"/><circle cx="32" cy="77" r="13" fill="url(#' + id + ')"/><circle cx="50" cy="71" r="14.5" fill="url(#' + id + ')"/>' +
      '<path d="M76 30 L70 12 M90 30 L98 13" stroke="#4d7c0f" stroke-width="3" stroke-linecap="round"/><circle cx="70" cy="11" r="4.5" fill="#f472b6"/><circle cx="98" cy="12" r="4.5" fill="#f472b6"/>' +
      '<circle cx="82" cy="50" r="24" fill="url(#' + id + ')"/>' +
      '<circle cx="66" cy="61" r="5" fill="#fda4af" opacity=".75"/><circle cx="98" cy="61" r="5" fill="#fda4af" opacity=".75"/>' +
      '<circle cx="73" cy="46" r="8.5" fill="#fff" stroke="#1e3a5f" stroke-width="2.6"/><circle cx="92" cy="46" r="8.5" fill="#fff" stroke="#1e3a5f" stroke-width="2.6"/>' +
      '<path d="M81.5 46 H83.5" stroke="#1e3a5f" stroke-width="2.6"/>' +
      '<circle cx="74" cy="47" r="3.6" fill="#1e293b"/><circle cx="93" cy="47" r="3.6" fill="#1e293b"/><circle cx="75.3" cy="45.6" r="1.2" fill="#fff"/><circle cx="94.3" cy="45.6" r="1.2" fill="#fff"/>' +
      '<path d="M75 61 Q83 68 91 61" stroke="#1e3a5f" stroke-width="2.6" fill="none" stroke-linecap="round"/>' +
      '<path d="M54 84 L72 79 L90 84 L90 96 L72 91 L54 96 Z" fill="#fff" stroke="#e11d48" stroke-width="2.4" stroke-linejoin="round"/><path d="M72 79 V91" stroke="#e11d48" stroke-width="2"/>' +
      '<path d="M58 86 L68 83 M58 90 L68 87 M76 83 L86 86 M76 87 L86 90" stroke="#94a3b8" stroke-width="1.4"/>' +
      '</svg>';
  }

  // ---------------------------------------------------------------- question makers
  // A question: { kind: 'choice', prompt, say, autoSay, big: { emo, word, html, huge },
  //               choices: [{ t, e }], answer, tip, passage }  or  { kind: 'order', words, hint, sentence }
  function items(str) {
    return str.trim().split(/\s+/).map((tok) => {
      const m = tok.match(/^([A-Za-z'\-]+)(.*)$/);
      return m ? { w: m[1], e: m[2] } : { w: tok, e: '' };
    });
  }
  const parsed = new Map();
  function itemsOf(str) { if (!parsed.has(str)) parsed.set(str, items(str)); return parsed.get(str); }

  function finish(q) {
    // the first choice given is the right one: shuffle and remember where it went
    const right = q.choices[0];
    if (!q.keepOrder) shuffle(q.choices);
    q.answer = q.choices.indexOf(right);
    q.kind = 'choice';
    if (!q.say) q.say = q.prompt;
    return q;
  }

  const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOOK_UP = { B: 'DPR', D: 'BOP', P: 'BRQ', Q: 'OPG', M: 'NWH', N: 'MHZ', W: 'MVY', E: 'FBH', F: 'EPT', C: 'GOU', G: 'CQO', O: 'QCD', U: 'VNC', V: 'UWY', I: 'LJT', L: 'IJT', J: 'IL', K: 'XRH', X: 'KYZ', Y: 'VXT', S: 'ZC', Z: 'SNX', A: 'HRV', H: 'NMA', R: 'PBK', T: 'FIL' };
  const LOOK_LO = { b: 'dpq', d: 'bpq', p: 'qbd', q: 'pdg', m: 'nw', n: 'mhu', u: 'nv', h: 'nb', a: 'oe', e: 'ac', i: 'jl', j: 'ig', l: 'it', g: 'qy', y: 'gv', w: 'vm', f: 'tk', t: 'fl', c: 'eo', o: 'ca', r: 'nv', s: 'zc', v: 'wy', k: 'hx', x: 'kz', z: 's' };
  function lookalikes(t, map, pool, n) {
    const out = shuffle((map[t] || '').split('')).filter((c) => c !== t).slice(0, Math.min(2, n));
    while (out.length < n) { const c = pick(pool); if (c !== t && out.indexOf(c) < 0) out.push(c); }
    return out;
  }

  const MAKERS = {
    letter(s, g) {
      const T = dealFrom(g + '|letter|' + s.mode, LETTERS.split(''));
      if (s.mode === 'case') {
        const t = T.toLowerCase();
        return finish({ prompt: 'Find the small letter!', say: 'Find the small letter for ' + T, big: { word: T, huge: true },
          choices: [t].concat(lookalikes(t, LOOK_LO, LETTERS.toLowerCase().split(''), 3)).map((c) => ({ t: c })),
          tip: 'Big ' + T + ' and small ' + t + ' go together.' });
      }
      const heard = voiceOn();
      return finish({ prompt: heard ? 'Tap the letter you hear!' : 'Tap the letter ' + T + '!', say: T, autoSay: true,
        choices: [T].concat(lookalikes(T, LOOK_UP, LETTERS.split(''), 3)).map((c) => ({ t: c })),
        tip: 'Look for ' + T + '.' });
    },
    firstSound(s, g) {
      const all = itemsOf(C.PICS_FIRST);
      const it = dealFrom(g + '|first', all), L = it.w[0];
      const pool = Array.from(new Set(all.map((x) => x.w[0]))).filter((c) => c !== L);
      return finish({ prompt: 'What letter does it start with?', say: it.w + '. What letter does ' + it.w + ' start with?', autoSay: true,
        big: { emo: it.e }, choices: [L].concat(sample(pool, 2)).map((c) => ({ t: c })),
        tip: it.w + ' starts with ' + L + '.' });
    },
    rhyme(s, g) {
      const groups = C.RHYMES.map(itemsOf);
      const gi = deal(g + '|rhyme', groups.length);
      const [a, b] = sample(groups[gi], 2);
      const used = new Set([a.e, b.e, a.w, b.w]);
      const wrong = [];
      for (const g of shuffle(groups.filter((_, i) => i !== gi))) {
        const c = pick(g);
        if (!used.has(c.e) && !used.has(c.w)) { wrong.push(c); used.add(c.e); }
        if (wrong.length === 2) break;
      }
      return finish({ prompt: 'Which one rhymes with ' + a.w + '?', big: { emo: a.e, word: a.w },
        choices: [b].concat(wrong).map((x) => ({ t: x.w, e: x.e })), tip: a.w + ' and ' + b.w + ' rhyme!' });
    },
    readPic(s, g) {
      const pool = itemsOf(s.items), it = dealFrom(g + '|' + s.name, pool);
      const wrong = sample(pool.filter((x) => x.e !== it.e && x.w !== it.w), 2);
      return finish({ prompt: 'Read the word. Tap its picture!', big: { word: it.w },
        choices: [it].concat(wrong).map((x) => ({ e: x.e, w: x.w })), tip: 'Sound it out slowly: ' + it.w.split('').join('-') + '.' });
    },
    hearWord(s, g) {
      const it = dealFrom(g + '|' + s.name, itemsOf(s.items));
      const vi = it.w.search(/[aeiou]/);
      const wrong = shuffle('aeiou'.split('').filter((v) => v !== it.w[vi])).slice(0, 2)
        .map((v) => it.w.slice(0, vi) + v + it.w.slice(vi + 1));
      return finish({ prompt: 'Which word did you hear?', say: it.w, autoSay: true, big: { emo: it.e },
        choices: [it.w].concat(wrong).map((t) => ({ t })), tip: 'Listen for the middle sound: ' + it.w + '.' });
    },
    chunk(s, g) {
      const chunks = s.chunks.split(' ');
      const pool = itemsOf(s.items).filter((x) => chunks.some((c) => x.w.indexOf(c) >= 0));
      const it = dealFrom(g + '|' + s.name, pool);
      const c = chunks.find((k) => it.w.indexOf(k) >= 0);
      const i = it.w.indexOf(c);
      const html = esc(it.w.slice(0, i)) + '<u>' + esc(c) + '</u>' + esc(it.w.slice(i + c.length));
      const n = chunks.length >= 4 ? 2 : chunks.length - 1;
      return finish({ prompt: c.length === 1 ? 'Which letter is missing?' : 'Which sound is missing?', say: it.w, autoSay: true,
        big: { emo: it.e, html }, choices: [c].concat(sample(chunks.filter((k) => k !== c), n)).map((t) => ({ t })),
        tip: it.w + ' is spelled with "' + c + '".' });
    },
    sight(s, g) {
      const words = s.words.split(' ');
      const t = dealFrom(g + '|' + s.name, words);
      const n = G() === 0 ? 2 : 3;
      const near = shuffle(words.filter((w) => w !== t && (w[0] === t[0] || Math.abs(w.length - t.length) <= 1)));
      const rest = shuffle(words.filter((w) => w !== t && near.indexOf(w) < 0));
      return finish({ prompt: voiceOn() ? 'Tap the word you hear!' : 'Find the word: ' + t, say: t, autoSay: true,
        choices: [t].concat(near.concat(rest).slice(0, n)).map((x) => ({ t: x })), tip: 'Look for "' + t + '".' });
    },
    syll(s, g) {
      const w = dealFrom(g + '|' + s.name, s.words.split(' '));
      const parts = w.split('-'), word = parts.join('');
      return finish({ prompt: 'How many syllables? Clap it!', say: word, autoSay: true, big: { word }, keepOrder: true,
        choices: [parts.length].concat([1, 2, 3, 4].filter((n) => n !== parts.length)).map((n) => ({ t: String(n) })),
        tip: parts.join(' · ') + ' = ' + parts.length });
    },
    qa(s, g) { return qaLine(dealFrom(g + '|' + s.name, s.lines), s.say); },
  };
  // fix the syllable order to 1 2 3 4 after finish() put the right one first
  const syllMaker = MAKERS.syll;
  MAKERS.syll = function (s) {
    const q = syllMaker(s);
    const right = q.choices[q.answer];
    q.choices.sort((a, b) => a.t - b.t);
    q.answer = q.choices.indexOf(right);
    return q;
  };

  function qaLine(line, sayIt) {
    const parts = line.split('|');
    const q = { prompt: parts[0], choices: [] };
    for (const p of parts.slice(1)) {
      if (p[0] === '@') { q.say = p.slice(1); q.autoSay = true; }
      else if (p[0] === '^') q.big = /[A-Za-z]/.test(p.slice(1)) ? { word: p.slice(1) } : { emo: p.slice(1) };
      else if (p[0] === '?') q.tip = p.slice(1);
      else q.choices.push({ t: p });
    }
    if (q.say && young()) q.say = q.prompt + ' ' + q.say;
    if (sayIt) q.autoSay = true;
    return finish(q);
  }

  function makeQ(g, skill) {
    const q = MAKERS[skill.gen](skill, g);
    q.skill = skill.name;
    return q;
  }
  const qKey = (q) => q.kind === 'order' ? q.sentence : q.prompt + '|' + (q.say || '') + '|' + (q.choices[q.answer].t || q.choices[q.answer].e);
  // `seen` can be shared so several batches (a stop's main + review questions) never repeat
  function uniqueQs(maker, n, seen) {
    const out = [];
    seen = seen || new Set();
    for (let tries = 0; out.length < n && tries < n * 12; tries++) {
      const q = maker(); const k = qKey(q);
      if (seen.has(k)) continue;
      seen.add(k); out.push(q);
    }
    return out;
  }

  function storyQs(g, si) {
    const st = GR[g].stories[si];
    return st.q.map((line, i) => { const q = qaLine(line); q.passage = st; q.firstOfStory = i === 0; q.skill = 'STORY'; return q; });
  }
  function orderLines(g) { return GR[g].order.split('\n').map((s) => s.trim()).filter(Boolean); }
  function orderPair(g) {
    const lines = orderLines(g), a = dealFrom(g + '|order', lines);
    let b = dealFrom(g + '|order', lines);
    if (b === a) b = dealFrom(g + '|order', lines);
    return [a, b];
  }
  function orderQ(line) {
    const m = line.match(/^(.*?[.?!])\s*(\S*)$/);
    const sentence = m ? m[1] : line, hint = m ? m[2] : '';
    return { kind: 'order', sentence, hint, words: sentence.split(' '), prompt: 'Put the words in order!',
      say: young() ? 'Put the words in order. ' + sentence : 'Put the words in order.', skill: 'BUILD A SENTENCE' };
  }
  // Garden and Arcade ask endlessly: skip anything asked in the last RECENT questions
  const RECENT = 20, recent = [];
  function anyQ(g, filter) {
    let q = null;
    for (let i = 0; i < 60; i++) {
      const c = makeQ(g, pick(GR[g].skills));
      if (filter && !filter(c)) continue;
      q = c;
      if (recent.indexOf(qKey(c)) < 0) break;
    }
    if (!q) q = makeQ(g, GR[g].skills[0]);
    recent.push(qKey(q));
    if (recent.length > RECENT) recent.shift();
    return q;
  }

  // ---------------------------------------------------------------- screens + navigation
  let current = null;
  let onBack = null;
  let overlay = null;
  function show(id) {
    hush();
    closeOverlay();
    stopArcade();
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('on', s.id === id));
    current = document.getElementById(id);
    setFocus(null);
  }
  function openOverlay(card) {
    closeOverlay();
    overlay = h('div', { class: 'overlay' }, card);
    stage.append(overlay);
    setFocus(null);
  }
  function closeOverlay() { if (overlay) { overlay.remove(); overlay = null; } }

  function hudBar(title, backFn, extra) {
    onBack = backFn;
    return h('div', { class: 'hud' },
      h('button', { class: 'iconbtn', 'aria-label': 'Back', onclick: () => { sfx.tap(); backFn(); } }, h('span', { text: '◀' })),
      h('div', { class: 'title', text: title }),
      h('div', { class: 'grow' }),
      extra || null);
  }

  // ---------------------------------------------------------------- confetti / floats
  function burst(el, colors) {
    const sr = stage.getBoundingClientRect(), r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2 - sr.left, cy = r.top + r.height / 2 - sr.top;
    const cols = colors || ['#f472b6', '#facc15', '#4ade80', '#60a5fa', '#a78bfa', '#fb923c'];
    for (let i = 0; i < 14; i++) {
      const s = h('div', { class: 'spark', style: 'left:' + cx + 'px;top:' + cy + 'px;background:' + pick(cols) });
      stage.append(s);
      const a = Math.random() * Math.PI * 2, d = rnd(2, 5.5) * em();
      if (s.animate) {
        s.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
          { transform: 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + em() * 2) + 'px) rotate(' + rnd(-300, 300) + 'deg)', opacity: 0 }],
        { duration: 800, easing: 'cubic-bezier(.2,.8,.4,1)' });
      }
      setTimeout(() => s.remove(), 820);
    }
  }
  function floatText(text, x, y, color, parent) {
    const f = h('div', { class: 'float', text, style: 'left:' + x + 'px;top:' + y + 'px;' + (color ? 'color:' + color : '') });
    (parent || stage).append(f);
    setTimeout(() => f.remove(), 950);
  }

  // ---------------------------------------------------------------- quiz runner (Trail + Garden)
  const OOPS = ['So close! Try another one.', 'Good try! Look again.', 'Hmm, not that one. Try again!', 'Almost! You can do it.'];
  let quiz = null;
  function runQuiz(opt) {
    // opt: { title, list (array) | next (fn), backFn, onDone(res), onAnswer(first), pill (element) }
    show('s-quiz');
    quiz = { opt, i: 0, res: [], q: null, tries: 0, locked: false };
    const scr = $('#s-quiz');
    scr.innerHTML = '';
    quiz.dots = opt.list ? h('div', { class: 'dots' }, opt.list.map(() => h('i'))) : null;
    quiz.spk = h('button', { class: 'iconbtn', 'aria-label': 'Say it again', onclick: () => speakQ(true) }, h('span', { text: '🔊' }));
    scr.append(hudBar(opt.title, opt.backFn, [quiz.dots, opt.pill, quiz.spk]));
    quiz.body = h('div', { class: 'qbody' });
    scr.append(quiz.body);
    nextQ();
  }
  function speakQ(button) {
    if (!quiz || !quiz.q) return;
    const q = quiz.q;
    if (!voiceOn() && button) { flashTip(canSpeak ? 'The voice is off. Turn it on from the title screen.' : 'This device has no reading voice.'); return; }
    say(q.say || q.prompt);
  }
  function nextQ() {
    const o = quiz.opt;
    if (o.list && quiz.i >= o.list.length) { o.onDone(quiz.res); return; }
    quiz.q = o.list ? o.list[quiz.i] : o.next();
    quiz.i++;
    quiz.tries = 0; quiz.locked = false;
    if (quiz.dots) Array.from(quiz.dots.children).forEach((d, i) => d.classList.toggle('now', i === quiz.i - 1));
    renderQ(quiz.q);
  }
  function renderQ(q) {
    const body = quiz.body;
    body.innerHTML = '';
    hush();
    const main = h('div', { class: 'qmain' });
    if (q.passage) {
      if (!reader || reader.p !== q.passage) reader = newReader(q.passage);
      reader.btn = h('button', { class: 'iconbtn', onclick: () => { sfx.tap(); if (reader.state === 'playing') readerPause(); else readerPlay(); } }, h('span', { text: '🔊' }));
      reader.again = h('button', { class: 'iconbtn', 'aria-label': 'Start the story again', onclick: () => { sfx.tap(); readerPlay(0); } }, h('span', { text: '↺' }));
      readerSync();
      const size = G() <= 1 ? 'big' : G() === 2 ? 'mid' : G() === 3 ? 'sm' : '';
      body.append(h('div', { class: 'passage ' + size },
        h('h3', null, '📖 ' + q.passage.t, reader.btn, reader.again),
        h('p', { text: q.passage.p })));
      body.classList.add('withpass');
    } else { body.classList.remove('withpass'); reader = null; }
    body.append(main);
    if (q.kind === 'order') renderOrder(q, main);
    else renderChoice(q, main);
    fitQuestion();
    // read aloud: always for the youngest, and for questions you have to hear
    const still = () => quiz && quiz.q === q && current && current.id === 's-quiz';
    if (q.passage && q.firstOfStory && G() <= 1) setTimeout(() => { if (still()) { reader.after = q.say; readerPlay(1); } }, 300);
    else if (young() || q.autoSay) setTimeout(() => { if (still()) say(q.say); }, 250);
  }
  function promptEl(text) {
    const long = text.length > 60;
    const html = esc(text).replace(/_{2,}/g, '<span class="blank"></span>');
    return h('div', { class: 'prompt' + (long ? ' long' : ''), html });
  }
  function bigEl(b) {
    if (!b) return null;
    return h('div', { class: 'big' + (b.emo && (b.word || b.html) ? ' both' : '') },
      b.emo ? h('div', { class: 'emo', text: b.emo }) : null,
      b.html ? h('div', { class: 'word', html: b.html }) : b.word ? h('div', { class: 'word' + (b.huge ? ' huge' : ''), text: b.word }) : null);
  }
  function choiceLayout(q) {
    const allEmoji = q.choices.every((c) => !c.t && c.e);
    const L = Math.max.apply(null, q.choices.map((c) => (c.t || '').length));
    const size = allEmoji ? 'emoji' : L <= 4 ? 'xl' : L <= 12 ? 'lg' : '';
    let grid = 'n' + q.choices.length;
    if (L > 30) grid = 'cols1';
    else if (q.choices.length === 4 && L > 18) grid = 'cols2';
    return { size, grid };
  }
  function renderChoice(q, main) {
    main.append(promptEl(q.prompt));
    add(main, bigEl(q.big));
    if (!q.big && q.autoSay && voiceOn()) main.append(h('button', { class: 'hear', 'aria-label': 'Hear it', onclick: () => speakQ(true) }, h('span', { text: '🔊' })));
    const lay = choiceLayout(q);
    const box = h('div', { class: 'choices ' + lay.grid, style: lay.grid === 'cols1' ? 'grid-template-columns:1fr;max-width:34em' : '' });
    q.choices.forEach((c, i) => {
      const b = h('button', { class: 'choice ' + lay.size, 'data-i': i, onclick: () => answer(b, i) },
        lay.size !== 'emoji' ? h('span', { class: 'n', text: i + 1 }) : null,
        c.e ? h('span', { class: c.t ? 'ce' : '', text: c.e }) : null,
        c.t ? h('span', { text: c.t }) : null);
      box.append(b);
    });
    main.append(box);
  }
  function answer(btn, i) {
    if (!quiz || quiz.locked || btn.disabled) return;
    const q = quiz.q;
    if (i === q.answer) {
      quiz.locked = true;
      btn.classList.add('right');
      sfx.good(); burst(btn);
      if (G() === 0 && q.choices[i].t && q.choices[i].t.length > 1) say(q.choices[i].t);
      scored(quiz.tries === 0);
      setTimeout(() => { if (quiz && quiz.q === q) nextQ(); }, 950);
    } else {
      quiz.tries++;
      btn.classList.add('nope'); btn.disabled = true;
      sfx.oops();
      flashTip(pick(OOPS) + (q.tip ? ' ' + q.tip : ''));
      if (quiz.tries >= 2) { const r = quiz.body.querySelector('.choice[data-i="' + q.answer + '"]'); if (r) r.classList.add('hintglow'); }
      if (G() <= 1) say('Try again!');
    }
  }
  function scored(first) {
    quiz.res.push(first ? 1 : 0);
    if (quiz.dots) { const d = quiz.dots.children[quiz.res.length - 1]; if (d) d.classList.add(first ? 'ok' : 'meh'); }
    if (quiz.opt.onAnswer) quiz.opt.onAnswer(first);
  }
  let tipTimer = 0;
  function flashTip(text) {
    const old = current && current.querySelector('.tip');
    if (old) old.remove();
    const t = h('div', { class: 'tip', text });
    (current || stage).append(t);
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => t.remove(), 3200);
  }

  // build a sentence
  function renderOrder(q, main) {
    main.append(promptEl(q.prompt));
    if (q.hint) main.append(h('div', { class: 'orderhint', text: q.hint }));
    const small = q.words.length > 7 ? ' small' : '';
    const slots = h('div', { class: 'slots' + small });
    const tiles = h('div', { class: 'tiles' + small });
    let order = shuffle(q.words.map((w, i) => i));
    if (q.words.length > 1) while (order.every((v, i) => v === i)) order = shuffle(order);
    const placed = [];
    const btns = order.map((wi) => h('button', { class: 'tile', text: q.words[wi] }));
    function layout() {
      slots.innerHTML = ''; tiles.innerHTML = '';
      placed.forEach((b) => slots.append(b));
      for (let k = placed.length; k < q.words.length; k++) slots.append(h('div', { class: 'slot' }));
      btns.forEach((b) => { if (placed.indexOf(b) < 0) tiles.append(b); });
    }
    btns.forEach((b) => b.addEventListener('click', () => {
      if (quiz.locked) return;
      const at = placed.indexOf(b);
      if (at >= 0) { if (b.classList.contains('good')) return; placed.splice(at, 1); b.classList.remove('placed'); }
      else { placed.push(b); b.classList.add('placed'); }
      sfx.tap(); layout();
      if (placed.length === q.words.length) check();
      if (kfocus && !document.body.contains(kfocus)) setFocus(null);
    }));
    function check() {
      let ok = 0;
      while (ok < placed.length && placed[ok].textContent === q.words[ok]) ok++;
      if (ok === q.words.length) {
        quiz.locked = true;
        placed.forEach((b) => b.classList.add('good'));
        sfx.good(); burst(slots);
        scored(quiz.tries === 0);
        sayThen(q.sentence, () => { if (quiz && quiz.q === q) setTimeout(() => { if (quiz && quiz.q === q) nextQ(); }, 350); }, 1300);
        return;
      }
      quiz.tries++;
      sfx.oops();
      placed.slice(0, ok).forEach((b) => b.classList.add('good'));
      const back = placed.splice(ok);
      back.forEach((b) => { b.classList.remove('placed'); b.classList.add('bad'); setTimeout(() => b.classList.remove('bad'), 450); });
      layout();
      flashTip(ok ? 'The green words are right! Try the rest.' : 'Hmm, try a different first word. Sentences start with a capital letter!');
      if (quiz.tries >= 2) {
        const want = q.words[ok];
        const b = btns.find((x) => placed.indexOf(x) < 0 && x.textContent === want);
        if (b) b.classList.add('hintglow');
      }
    }
    layout();
    main.append(slots, tiles);
  }

  function starsFor(res) {
    const r = res.reduce((a, b) => a + b, 0) / Math.max(1, res.length);
    return r >= 0.85 ? 3 : r >= 0.5 ? 2 : 1;
  }
  function starRow(n) {
    return h('div', { class: 'bigstars' }, [0, 1, 2].map((i) => h('i', { class: i < n ? '' : 'off', style: 'animation-delay:' + (0.25 + i * 0.25) + 's', text: '⭐' })));
  }

  // ---------------------------------------------------------------- TITLE
  function title() {
    show('s-title');
    onBack = () => { if (window.MickleMenu) MickleMenu.backToArcade(); };
    const scr = $('#s-title');
    scr.innerHTML = '';
    const g = G();
    const trailStars = (save.trail[g] || []).reduce((a, b) => a + (b || 0), 0);
    const best = Math.max(0, ...AGAMES.map((a) => save.best[a.id + '.' + g] || 0));
    scr.append(
      h('div', { class: 't-left' },
        h('div', { html: wiggleSVG() }),
        h('h1', { class: 'logo', html: 'WIGGLE<b>READS</b>' }),
        h('p', { class: 'tagline', text: 'Letter sounds, sight words & stories' })),
      h('div', { class: 't-right' },
        h('div', { class: 'grades' + (shownN() > 7 ? ' many' : '') }, h('span', { class: 'lbl', text: 'GRADE' }),
          GR.slice(0, shownN()).map((gr, i) => h('button', { class: 'gchip' + (i === g ? ' sel' : ''), text: gr.name, 'aria-label': gr.title,
            onclick: () => { save.grade = i; persist(); sfx.tap(); title(); say(gr.title); } }))),
        h('div', { class: 'modes' },
          h('button', { class: 'mode trail', onclick: () => { sfx.tap(); trail(); } },
            h('div', { class: 'ico', text: '🗺️' }), h('b', { text: 'TRAIL' }), h('p', { text: 'Walk the reading trail, stop by stop.' }),
            h('div', { class: 'sub', text: '⭐ ' + trailStars + ' / 36' })),
          h('button', { class: 'mode arcade', onclick: () => { sfx.tap(); arcade(); } },
            h('div', { class: 'ico', text: '🎮' }), h('b', { text: 'ARCADE' }), h('p', { text: 'Balloons, fireflies and the word train!' }),
            h('div', { class: 'sub', text: best ? 'BEST ' + best : '3 GAMES' })),
          h('button', { class: 'mode garden', onclick: () => { sfx.tap(); garden(); } },
            h('div', { class: 'ico', text: '🌻' }), h('b', { text: 'GARDEN' }), h('p', { text: 'Earn seeds and grow a garden.' }),
            h('div', { class: 'sub', text: '🌱 ' + save.seeds }))),
        h('div', { class: 't-foot' },
          h('button', { class: 'chunky ghost', onclick: toggleVoice, id: 'voiceBtn',
            text: !canSpeak ? '🔇 NO VOICE ON THIS DEVICE' : save.voice ? '🔊 READ ALOUD: ON' : '🔇 READ ALOUD: OFF' }),
          h('div', { class: 'grow' }),
          h('button', { class: 'chunky gold', onclick: openHowto, text: '? HOW TO PLAY' }))));
  }
  function toggleVoice() {
    if (!canSpeak) return;
    save.voice = !save.voice; persist();
    $('#voiceBtn').textContent = save.voice ? '🔊 READ ALOUD: ON' : '🔇 READ ALOUD: OFF';
    if (save.voice) say('Hi! I am Wiggle. Let\'s read!');
    else hush();
  }

  // ---------------------------------------------------------------- TRAIL
  const THEMES = [
    { name: 'MEADOW', bg: 'linear-gradient(#bae6fd, #e0f2fe 30%, #bbf7d0 31%, #86efac)', path: '#fef3c7', edge: '#d6a35c', deco: '🌼🌷🐞🌻🦋🌼🐝🌷🍀' },
    { name: 'FOREST', bg: 'linear-gradient(#a7f3d0, #bbf7d0 30%, #4ade80 31%, #16a34a)', path: '#fde68a', edge: '#92400e', deco: '🌲🍄🦔🌳🐿️🌲🍄🦉🌳' },
    { name: 'BEACH', bg: 'linear-gradient(#7dd3fc, #38bdf8 30%, #fde68a 31%, #fcd34d)', path: '#fff7ed', edge: '#f59e0b', deco: '🌴🐚🦀⛱️🐠🌴🐚🦀🐬' },
    { name: 'MOUNTAINS', bg: 'linear-gradient(#93c5fd, #dbeafe 30%, #a7f3d0 31%, #4ade80)', path: '#e7e5e4', edge: '#78716c', deco: '⛰️🌲🦅🏔️🌲⛰️🐐🌲🦌' },
    { name: 'DESERT', bg: 'linear-gradient(#fdba74, #fed7aa 30%, #fde68a 31%, #f59e0b)', path: '#fffbeb', edge: '#b45309', deco: '🌵🦎🐪🌵☀️🌵🦂🐪🌵' },
    { name: 'SNOWLAND', bg: 'linear-gradient(#bfdbfe, #e0f2fe 30%, #f8fafc 31%, #e2e8f0)', path: '#bae6fd', edge: '#60a5fa', deco: '❄️⛄🐧🌲❄️🐻‍❄️🌲⛄🐧' },
    { name: 'SPACE', bg: 'radial-gradient(circle at 70% 20%, #4338ca, #1e1b4b 55%, #0b0a24)', path: '#fde68a', edge: '#a78bfa', deco: '🪐⭐🚀🌙✨☄️⭐🛸🌟', dark: true },
    { name: 'CITY', bg: 'linear-gradient(#fbcfe8, #fce7f3 30%, #cbd5e1 31%, #94a3b8)', path: '#f8fafc', edge: '#475569', deco: '🏙️🚕🏢🌳🚲🏙️🚌🏢🌆' },
    { name: 'JUNGLE', bg: 'linear-gradient(#bbf7d0, #dcfce7 30%, #22c55e 31%, #15803d)', path: '#fef08a', edge: '#713f12', deco: '🌴🦜🐒🌺🦎🌴🐸🌿🐆' },
    { name: 'OCEAN DEEP', bg: 'linear-gradient(#0e7490, #155e75 30%, #164e63 31%, #083344)', path: '#a5f3fc', edge: '#22d3ee', deco: '🐙🐠🐚🦈🐡🐋🐬🐢🦑', dark: true },
    { name: 'VOLCANO', bg: 'linear-gradient(#fecaca, #fee2e2 30%, #78716c 31%, #44403c)', path: '#fed7aa', edge: '#ea580c', deco: '🌋🔥⛰️🏔️🌋🦖🔥⛰️🌋', dark: true },
    { name: 'NORTHERN LIGHTS', bg: 'linear-gradient(#064e3b, #1e1b4b 40%, #312e81 41%, #1e293b)', path: '#bbf7d0', edge: '#34d399', deco: '🌌❄️🦌🌲✨🐺🌲❄️🦉', dark: true },
    { name: 'LIBRARY', bg: 'linear-gradient(#fde68a, #fef3c7 30%, #b45309 31%, #78350f)', path: '#fffbeb', edge: '#451a03', deco: '📚🕯️📜🖋️🦉📚🗝️📖🕰️', dark: true },
  ];
  const PTS = [[40, 185], [105, 165], [165, 188], [230, 168], [295, 185], [360, 162], [428, 140], [395, 98], [325, 110], [255, 88], [185, 104], [115, 80]];
  const GOAL = [46, 82];
  const DECO = [[14, 52], [205, 46], [300, 52], [455, 70], [462, 205], [262, 136], [140, 135], [62, 128], [378, 137]];
  const at = (p) => 'left:' + (p[0] / 4.8) + '%;top:' + (p[1] / 2.7) + '%';
  function smoothPath(pts) {
    let d = 'M' + pts[0];
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ' C' + c1 + ' ' + c2 + ' ' + p2;
    }
    return d;
  }
  function stopsFor(g) {
    const n = GR[g].skills.length, out = [];
    let r = 0, st = 0;
    for (let i = 0; i < 12; i++) {
      if (i % 4 === 3) out.push({ type: 'story', idx: st++ });
      else { out.push({ type: 'skill', idx: r % n, n: r }); r++; }
    }
    return out;
  }
  function stopName(g, s) {
    return s.type === 'story' ? 'STORY: ' + GR[g].stories[s.idx % GR[g].stories.length].t.toUpperCase() : GR[g].skills[s.idx].name;
  }
  function trail() {
    show('s-trail');
    const g = G(), th = THEMES[g], stops = stopsFor(g);
    const stars = save.trail[g] || (save.trail[g] = []);
    const unlocked = (i) => i === 0 || (stars[i - 1] || 0) > 0;
    let sel = save.trailAt[g];
    if (sel == null || sel > 12 || !unlocked(sel)) { sel = 0; while (sel < 11 && stars[sel]) sel++; if (sel === 11 && stars[11] && !save.cup[g]) sel = 12; }
    const scr = $('#s-trail');
    scr.innerHTML = '';
    scr.style.background = th.bg;
    const total = stars.reduce((a, b) => a + (b || 0), 0);
    const d = smoothPath(PTS.concat([GOAL]));
    scr.insertAdjacentHTML('beforeend', '<svg class="map" viewBox="0 0 480 270" preserveAspectRatio="none" aria-hidden="true">' +
      '<path d="' + d + '" fill="none" stroke="' + th.edge + '" stroke-width="17" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>' +
      '<path d="' + d + '" fill="none" stroke="' + th.path + '" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="' + d + '" fill="none" stroke="' + th.edge + '" stroke-width="1.6" stroke-dasharray="4 7" stroke-linecap="round" opacity=".6"/></svg>');
    const decos = Array.from(th.deco.match(/\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic}|️)*/gu) || []);
    DECO.forEach((p, i) => scr.append(h('div', { class: 'deco', text: decos[i % decos.length], style: at(p) })));
    // the Grade Cup at the end of the trail: opens once stop 12 is done
    const cupOpen = unlocked(12), cupStars = save.cup[g] || 0;
    const goal = h('button', { class: 'goal ' + (cupStars ? 'won' : cupOpen ? 'open' : 'locked'), style: at(GOAL), 'aria-label': 'Grade Cup',
      onclick: () => {
        if (!cupOpen) { sfx.oops(); flashTip('Finish all 12 stops to open the Grade Cup!'); return; }
        if (sel === 12) { startCup(); return; }
        sfx.tap(); choose(12);
      } },
    h('span', { text: cupOpen ? '🏆' : '🏁' }),
    h('div', { class: 'lbl', text: cupStars ? '⭐'.repeat(cupStars) : 'CUP' }));
    scr.append(goal);
    const wig = h('div', { class: 'wiggler', html: wiggleSVG() });
    const info = h('div', { class: 'info' }), go = h('button', { class: 'chunky', text: 'GO ▶', onclick: () => (sel === 12 ? startCup() : startStop(sel)) });
    const stopEls = stops.map((s, i) => {
      const st = stars[i] || 0;
      const cls = 'stop' + (s.type === 'story' ? ' story' : '') + (st ? ' done' : unlocked(i) ? ' open' : ' locked');
      const b = h('button', { class: cls, style: at(PTS[i]), 'aria-label': 'Stop ' + (i + 1),
        onclick: () => {
          if (!unlocked(i)) { sfx.oops(); flashTip('Finish stop ' + i + ' first to open this one!'); return; }
          if (sel === i) { startStop(i); return; }
          sfx.tap(); choose(i);
        } },
      h('span', { text: s.type === 'story' ? '📖' : i + 1 }),
      st ? h('div', { class: 'stars', text: '⭐'.repeat(st) }) : null);
      scr.append(b);
      return b;
    });
    function choose(i) {
      sel = i; save.trailAt[g] = i; persist();
      stopEls.forEach((b, k) => b.classList.toggle('sel', k === i));
      goal.classList.toggle('sel', i === 12);
      info.innerHTML = '';
      if (i === 12) {
        wig.style.cssText = at([GOAL[0] + 42, GOAL[1] + 16]);
        info.append(h('b', { text: '🏆 GRADE ' + GR[g].name + ' CUP' }),
          h('small', { text: cupStars ? 'You won it! Best: ' + '⭐'.repeat(cupStars) + '  Play again for more seeds!' : CUP_N + ' questions from the whole grade. Get ' + CUP_WIN + ' right to win!' }));
        return;
      }
      wig.style.cssText = at(PTS[i]);
      info.append(h('b', { text: 'STOP ' + (i + 1) + ': ' + stopName(g, stops[i]) }),
        h('small', { text: stars[i] ? 'Best: ' + '⭐'.repeat(stars[i]) + '  Play again for more seeds!' : 'Tap GO to start!' }));
    }
    scr.append(wig);
    scr.append(hudBar('GRADE ' + GR[g].name + ' · ' + th.name + ' TRAIL', title,
      [h('span', { class: 'pill', text: '⭐ ' + total + ' / 36' }), h('span', { class: 'pill', text: '🌱 ' + save.seeds })]));
    if (th.dark) scr.querySelector('.hud .title').style.color = '#fff';
    scr.append(h('div', { class: 'tbar' }, h('div', { style: 'width:3.2em;height:2.7em', html: wiggleSVG() }), info, go));
    choose(sel);
  }
  function startStop(i) {
    sfx.tap();
    const g = G(), s = stopsFor(g)[i];
    let list;
    if (s.type === 'story') {
      const st = GR[g].stories;
      const si = (save.trail[g] || [])[i] ? deal(g + '|stories', st.length) : s.idx % st.length;
      list = storyQs(g, si).concat(orderPair(g).map(orderQ));
    } else {
      const skills = GR[g].skills;
      const main = skills[s.idx];
      const earlier = skills.slice(0, Math.max(1, s.idx));
      const seen = new Set();
      list = uniqueQs(() => makeQ(g, main), 4, seen).concat(uniqueQs(() => makeQ(g, pick(s.n >= skills.length ? skills : earlier)), 2, seen));
      list = list.slice(0, 4).concat(shuffle(list.slice(4)));
    }
    runQuiz({ title: 'STOP ' + (i + 1) + ': ' + stopName(g, s), list, backFn: trail, onDone: (res) => stopDone(i, res) });
  }
  function stopDone(i, res) {
    const g = G();
    const n = starsFor(res);
    const arr = save.trail[g] || (save.trail[g] = []);
    const first = !arr[i];
    arr[i] = Math.max(arr[i] || 0, n);
    const seeds = n * 3 + 2;
    addSeeds(seeds);
    save.trailAt[g] = Math.min(12, i + 1);
    persist();
    sfx.win();
    [0, 1, 2].forEach((k) => { if (k < n) setTimeout(() => sfx.star(k), 300 + k * 250); });
    const words = ['NICE TRY!', 'GREAT READING!', 'SUPER STAR!'];
    say(words[n - 1].toLowerCase());
    const allDone = arr.filter(Boolean).length === 12 && first && i === 11;
    openOverlay(h('div', { class: 'card' },
      h('div', { html: wiggleSVG('w') }),
      h('h2', { text: allDone ? 'TRAIL COMPLETE!' : words[n - 1] }),
      starRow(n),
      h('p', { text: res.filter(Boolean).length + ' of ' + res.length + ' right on the first try' }),
      h('div', { class: 'seedgain', text: '+' + seeds + ' 🌱 seeds' }),
      h('div', { class: 'row' },
        h('button', { class: 'chunky blue', text: '↻ AGAIN', onclick: () => startStop(i) }),
        h('button', { class: 'chunky gold', text: '🗺️ MAP', onclick: trail }),
        i < 11 ? h('button', { class: 'chunky', text: 'NEXT STOP ▶', onclick: () => startStop(i + 1) })
          : h('button', { class: 'chunky', text: '🏆 CUP ▶', onclick: startCup }))));
    onBack = trail;
    if (allDone) burst(overlay.firstChild);
  }

  // ---------------------------------------------------------------- GRADE CUP
  // The final challenge after stop 12: questions from every skill in the grade, a story, and a sentence.
  const CUP_N = 10, CUP_WIN = 7;
  function cupQs(g) {
    const skills = GR[g].skills, seen = new Set(), picks = [];
    let order = shuffle(skills.slice());
    while (picks.length < CUP_N - 3) {
      if (!order.length) order = shuffle(skills.slice());
      picks.push(order.pop());
    }
    const qs = picks.map((sk) => uniqueQs(() => makeQ(g, sk), 1, seen)[0]).filter(Boolean);
    const st = GR[g].stories, si = deal(g + '|stories', st.length);
    const story = storyQs(g, si).slice(0, 2);
    const sentence = orderQ(dealFrom(g + '|order', orderLines(g)));
    return qs.slice(0, 4).concat(story, qs.slice(4), [sentence]);
  }
  function startCup() {
    sfx.tap();
    const g = G();
    runQuiz({ title: '🏆 GRADE ' + GR[g].name + ' CUP', list: cupQs(g), backFn: trail, onDone: cupDone });
  }
  function cupDone(res) {
    const g = G();
    const right = res.filter(Boolean).length;
    const won = right >= CUP_WIN;
    const n = right >= 9 ? 3 : right >= 8 ? 2 : won ? 1 : 0;
    const first = won && !save.cup[g];
    if (won) save.cup[g] = Math.max(save.cup[g] || 0, n);
    const seeds = won ? 15 + n * 5 : 3;
    addSeeds(seeds);
    persist();
    const row = h('div', { class: 'row' },
      h('button', { class: 'chunky blue', text: won ? '↻ AGAIN' : '↻ TRY AGAIN', onclick: startCup }),
      h('button', { class: 'chunky gold', text: '🗺️ MAP', onclick: trail }));
    // winning the Grade 6 cup is Wiggle Reads' top level: it opens grades 7-12 in every learning game
    const unlocked = won && g === 6 && !!window.MickleGrades && MickleGrades.unlock();
    if (won && g < shownN() - 1) {
      row.append(h('button', { class: 'chunky', text: 'GRADE ' + GR[g + 1].name + ' ▶',
        onclick: () => { save.grade = g + 1; persist(); closeOverlay(); trail(); } }));
    }
    if (won) {
      sfx.win();
      [0, 1, 2].forEach((k) => { if (k < n) setTimeout(() => sfx.star(k), 300 + k * 250); });
      say((first ? 'You won the grade ' + GR[g].name + ' cup! Amazing reading!' : 'You won the cup again! Amazing reading!') + (unlocked ? ' ' + MickleGrades.MSG : ''));
      openOverlay(h('div', { class: 'card' },
        h('div', { class: 'cupbig', text: '🏆' }),
        h('h2', { text: 'GRADE ' + GR[g].name + ' CUP WON!' }),
        starRow(n),
        h('p', { text: right + ' of ' + res.length + ' right on the first try' }),
        h('div', { class: 'seedgain', text: '+' + seeds + ' 🌱 seeds' }),
        unlocked ? h('div', { class: 'unlock', text: '🔓 GRADES 7–12 UNLOCKED!' }) : null,
        row));
      burst(overlay.firstChild);
      setTimeout(() => { if (overlay) burst(overlay.firstChild, ['#facc15', '#fde047', '#f59e0b', '#fff']); }, 700);
    } else {
      sfx.oops();
      say('So close! Get ' + CUP_WIN + ' right to win the cup. You can do it!');
      openOverlay(h('div', { class: 'card' },
        h('div', { html: wiggleSVG('w') }),
        h('h2', { text: 'SO CLOSE!' }),
        h('p', { text: 'You got ' + right + ' of ' + res.length + '. Get ' + CUP_WIN + ' right on the first try to win the cup!' }),
        h('div', { class: 'seedgain', text: '+' + seeds + ' 🌱 seeds' }),
        row));
    }
    onBack = trail;
  }

  // ---------------------------------------------------------------- ARCADE
  const AGAMES = [
    { id: 'balloon', name: 'BALLOON POP', ico: '🎈', desc: 'Pop the balloon with the right answer!', order: 1, time: 60 },
    { id: 'firefly', name: 'FIREFLY CATCH', ico: '✨', desc: 'Catch every firefly that fits the rule.', order: 2, time: 60 },
    { id: 'train', name: 'WORD TRAIN', ico: '🚂', desc: 'Hook the word cars on in the right order.', order: 3, time: 90 },
  ];
  function arcade() {
    show('s-arcade');
    const g = G(), scr = $('#s-arcade');
    scr.innerHTML = '';
    scr.append(hudBar('ARCADE · GRADE ' + GR[g].name, title, h('span', { class: 'pill', text: '🌱 ' + save.seeds })));
    scr.append(h('div', { class: 'acards' }, AGAMES.map((a) => h('button', { class: 'acard ' + a.id, onclick: () => { sfx.tap(); playArcade(a); } },
      h('div', { class: 'ico', text: a.ico }), h('b', { text: a.name }), h('p', { text: a.desc }),
      h('div', { class: 'sub', text: save.best[a.id + '.' + g] ? 'BEST ' + save.best[a.id + '.' + g] : a.time + ' SECONDS' })))));
  }

  let game = null; // the running arcade game
  function stopArcade() { if (game) { game.over = true; game = null; } }
  function playArcade(a) {
    show('s-play');
    const scr = $('#s-play');
    scr.innerHTML = '';
    scr.className = 'screen on' + (a.id === 'firefly' ? ' night' : a.id === 'train' ? ' rail' : '');
    const bar = h('i', { style: 'width:100%' });
    const score = h('span', { class: 'pill', text: '0' });
    const spk = h('button', { class: 'iconbtn', 'aria-label': 'Say it again', onclick: () => game && game.speak && game.speak(true) }, h('span', { text: '🔊' }));
    scr.append(hudBar(a.name, arcade, [h('div', { class: 'timebar' }, bar), score, spk]));
    const arena = h('div', { class: 'arena' });
    const banner = h('div', { class: 'banner' });
    arena.append(banner);
    scr.append(arena);
    game = { a, g: G(), arena, banner, time: a.time, score: 0, streak: 0, over: false, t: 0,
      addScore(n, el) {
        this.score += n; score.textContent = this.score;
        if (el) {
          const ar = arena.getBoundingClientRect(), r = el.getBoundingClientRect();
          floatText('+' + n, r.left - ar.left + r.width / 2 - em(), r.top - ar.top, null, arena);
        }
      },
      tick(dt) {
        this.time -= dt;
        bar.style.width = Math.max(0, this.time / a.time * 100) + '%';
        if (this.time <= 0) endArcade();
      } };
    ({ balloon: balloonGame, firefly: fireflyGame, train: trainGame })[a.id](game);
  }
  function endArcade() {
    const gm = game;
    if (!gm || gm.over) return;
    gm.over = true;
    hush();
    const key = gm.a.id + '.' + gm.g;
    const best = save.best[key] || 0;
    const isBest = gm.score > best;
    if (isBest) save.best[key] = gm.score;
    const seeds = Math.max(1, Math.floor(gm.score / 20));
    addSeeds(seeds);
    if (window.MickleScores && gm.score > 0) MickleScores.record('wiggle-reads', gm.score, { category: gm.a.name, order: gm.a.order });
    sfx.win();
    openOverlay(h('div', { class: 'card' },
      h('div', { html: wiggleSVG('w') }),
      h('h2', { text: isBest && best ? 'NEW BEST!' : 'TIME\'S UP!' }),
      h('p', { style: 'font-size:2.4em;color:#1e3a5f;font-weight:900;margin:.1em 0', text: gm.score }),
      h('p', { text: isBest ? 'Your best score ever for grade ' + GR[gm.g].name + '!' : 'Best: ' + best }),
      h('div', { class: 'seedgain', text: '+' + seeds + ' 🌱 seeds' }),
      h('div', { class: 'row' },
        h('button', { class: 'chunky', text: '↻ PLAY AGAIN', onclick: () => playArcade(gm.a) }),
        h('button', { class: 'chunky gold', text: '🎮 GAMES', onclick: arcade }))));
    onBack = arcade;
    if (isBest) burst(overlay.firstChild);
  }

  function bannerFor(q) {
    const parts = [];
    parts.push(h('div', { class: 'bp' + (q.prompt.length > 40 ? ' long' : ''), html: esc(q.prompt).replace(/_{2,}/g, '<span class="blank" style="display:inline-block;min-width:2em;border-bottom:.12em solid #f59e0b"></span>') }));
    if (q.big && q.big.emo) parts.push(h('div', { class: 'be', text: q.big.emo }));
    if (q.big && (q.big.word || q.big.html)) parts.push(h('div', { class: 'bw', html: q.big.html || esc(q.big.word) }));
    if (!q.big && q.autoSay) parts.push(h('div', { class: 'be', text: '👂' }));
    return parts;
  }

  // BALLOON POP -- the choices float up as balloons
  const BCOLORS = ['#f472b6', '#60a5fa', '#facc15', '#4ade80', '#a78bfa', '#fb923c'];
  function balloonGame(gm) {
    let q = null, balloons = [];
    const okQ = (x) => x.kind === 'choice' && !x.passage && x.choices.length <= 4 && x.choices.every((c) => (c.t || '').length <= 22);
    function next() {
      balloons.forEach((b) => b.el.remove());
      balloons = [];
      q = anyQ(gm.g, okQ);
      gm.banner.innerHTML = '';
      add(gm.banner, bannerFor(q));
      if (young() || q.autoSay) say(q.say);
      const W = gm.arena.clientWidth, H = gm.arena.clientHeight, E = em(), bw = 7.6 * E;
      const n = q.choices.length, gap = (W - n * bw) / (n + 1);
      const lanes = shuffle(q.choices.map((_, i) => i));
      const T = Math.max(4.5, 7.5 - gm.score / 120) + (gm.g <= 1 ? 1.5 : 0);
      q.choices.forEach((c, i) => {
        const x0 = gap + lanes[i] * (bw + gap);
        const el = h('button', { class: 'balloon', style: '--c:' + BCOLORS[(i + gm.score) % BCOLORS.length] },
          h('div', { class: 'bb' }, c.t ? h('span', { class: 't' + (c.t.length > 8 ? ' l' : ''), text: c.t }) : h('span', { class: 'e', text: c.e })));
        const b = { el, i, x0, y: H - 2.5 * E + rnd(0, 3) * E, v: (H + 9 * E) / T * rnd(0.9, 1.1), ph: Math.random() * 6, alive: true };
        el.style.transform = 'translate(' + x0 + 'px,' + b.y + 'px)';
        el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tapB(b); });
        el.addEventListener('click', (ev) => { if (ev.detail === 0) tapB(b); }); // keyboard / controller
        gm.arena.append(el);
        balloons.push(b);
      });
    }
    function tapB(b) {
      if (gm.over || !b.alive || !q) return;
      if (b.i === q.answer) {
        sfx.pop(); burst(b.el.firstChild, [b.el.style.getPropertyValue('--c'), '#fff', '#facc15']);
        gm.streak++;
        gm.addScore(10 + Math.min(gm.streak - 1, 5) * 2, b.el);
        b.el.style.visibility = 'hidden'; b.alive = false;
        q = null;
        setTimeout(() => { if (!gm.over) next(); }, 450);
      } else {
        sfx.oops(); gm.streak = 0; b.alive = false;
        b.el.classList.add('nope');
        if (q.tip) flashTip(q.tip);
      }
    }
    gm.speak = (btn) => { if (q) { if (!voiceOn() && btn) flashTip('The voice is off.'); else say(q.say); } };
    gm.step = (dt) => {
      const H = gm.arena.clientHeight, E = em();
      for (const b of balloons) {
        b.y -= b.v * dt;
        if (b.y < -9.5 * E) b.y = H + rnd(0, 1.5) * E;
        const x = b.x0 + Math.sin(gm.t * 1.3 + b.ph) * 0.8 * E;
        b.el.style.transform = 'translate(' + x + 'px,' + b.y + 'px)';
      }
    };
    next();
  }

  // FIREFLY CATCH -- tap every firefly that fits the rule
  function splitTokens(s) {
    const list = s.indexOf(',') >= 0 ? s.split(',') : s.trim().split(/\s+/);
    return list.map((t) => t.trim()).filter(Boolean).map((t) => {
      const m = t.match(/^([^\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}]+?)\s*([\u{1F000}-\u{1FFFF}\u{2600}-\u{27BF}\u{2B50}️]*)$/u);
      return m ? { w: m[1], e: m[2] } : { w: t, e: '' };
    });
  }
  function fireflyGame(gm) {
    const sets = shuffle(GR[gm.g].sets.slice());
    let si = 0, flies = [], left = 0, rule = '';
    const jar = h('div', { class: 'jar', text: '🧺' });
    const jarCount = h('small', { text: '0' });
    jar.append(jarCount);
    let caught = 0;
    gm.arena.append(jar);
    function next() {
      flies.forEach((f) => f.el.remove());
      flies = [];
      const parts = sets[si++ % sets.length].split('|');
      rule = parts[0];
      const yes = splitTokens(parts[1]), no = sample(splitTokens(parts[2]), Math.max(3, 9 - yes.length));
      left = yes.length;
      gm.banner.innerHTML = '';
      gm.banner.append(h('div', { class: 'bp', text: '✨ ' + (rule.indexOf(':') >= 0 ? rule : 'CATCH: ' + rule) }));
      if (young()) say('Catch the fireflies. ' + rule.toLowerCase());
      const W = gm.arena.clientWidth, H = gm.arena.clientHeight, E = em();
      shuffle(yes.map((t) => [t, true]).concat(no.map((t) => [t, false]))).forEach(([t, ok]) => {
        const el = h('button', { class: 'firefly' }, h('i'), t.e ? h('span', { class: 'fe', text: t.e }) : null, h('span', { text: t.w }));
        gm.arena.append(el);
        const f = { el, ok, alive: true, w: el.offsetWidth, hh: el.offsetHeight,
          x: rnd(0, Math.max(1, W - el.offsetWidth)), y: rnd(3.5 * E, Math.max(4 * E, H - el.offsetHeight - 4 * E)),
          a: Math.random() * 6.28, sp: (1.6 + Math.random() * 1.2 + gm.g * 0.15) * E };
        el.addEventListener('pointerdown', (ev) => { ev.preventDefault(); tapF(f); });
        el.addEventListener('click', (ev) => { if (ev.detail === 0) tapF(f); });
        flies.push(f);
      });
    }
    function tapF(f) {
      if (gm.over || !f.alive) return;
      if (f.ok) {
        f.alive = false; sfx.good(); gm.streak++;
        gm.addScore(10, f.el);
        const ar = gm.arena.getBoundingClientRect(), jr = jar.getBoundingClientRect();
        f.el.classList.add('caught');
        f.el.style.transform = 'translate(' + (jr.left - ar.left) + 'px,' + (jr.top - ar.top) + 'px) scale(.3)';
        caught++; jarCount.textContent = caught;
        if (--left === 0) {
          gm.addScore(25, gm.banner);
          sfx.win();
          flashTip('You caught them all! ✨');
          setTimeout(() => { if (!gm.over) next(); }, 900);
        }
      } else {
        sfx.oops(); gm.streak = 0;
        f.el.classList.remove('nope'); void f.el.offsetWidth; f.el.classList.add('nope');
        f.a += Math.PI; f.sp *= 1.3;
      }
    }
    gm.speak = (btn) => { if (!voiceOn() && btn) flashTip('The voice is off.'); else say('Catch: ' + rule.toLowerCase()); };
    gm.step = (dt) => {
      const W = gm.arena.clientWidth, H = gm.arena.clientHeight, E = em();
      for (const f of flies) {
        if (!f.alive) continue;
        f.a += (Math.random() - 0.5) * dt * 3;
        f.x += Math.cos(f.a) * f.sp * dt; f.y += Math.sin(f.a) * f.sp * dt;
        if (f.x < 0) { f.x = 0; f.a = Math.PI - f.a; }
        if (f.x > W - f.w) { f.x = W - f.w; f.a = Math.PI - f.a; }
        if (f.y < 3.2 * E) { f.y = 3.2 * E; f.a = -f.a; }
        if (f.y > H - f.hh - 0.5 * E) { f.y = H - f.hh - 0.5 * E; f.a = -f.a; }
        f.el.style.transform = 'translate(' + f.x + 'px,' + f.y + 'px)';
      }
    };
    next();
  }

  // WORD TRAIN -- tap the word cars in sentence order
  function trainGame(gm) {
    const lines = shuffle(orderLines(gm.g));
    let li = 0, q = null, at = 0, track = null, yard = null;
    function next() {
      if (track) track.remove();
      if (yard) yard.remove();
      q = orderQ(lines[li++ % lines.length]);
      at = 0;
      gm.banner.innerHTML = '';
      gm.banner.append(h('div', { class: 'bp', text: '🚂 Hook the words on in order!' }), q.hint ? h('div', { class: 'be', text: q.hint }) : null);
      if (gm.g <= 1) say(q.sentence);
      track = h('div', { class: 'track' }, h('div', { class: 'engine', text: '🚂' }));
      yard = h('div', { class: 'yard' + (q.words.length > 7 ? ' small' : '') });
      shuffle(q.words.slice()).forEach((w) => {
        const b = h('button', { class: 'tile', text: w });
        b.addEventListener('click', () => tapW(b));
        yard.append(b);
      });
      gm.arena.append(track, yard);
    }
    function tapW(b) {
      if (gm.over || !q || at >= q.words.length || b.classList.contains('used')) return;
      if (b.textContent === q.words[at]) {
        b.classList.add('used'); sfx.tap();
        track.append(h('div', { class: 'car', text: b.textContent }));
        at++;
        if (kfocus === b) setFocus(null);
        if (at === q.words.length) {
          gm.streak++;
          gm.addScore(q.words.length * 5 + Math.min(gm.streak, 5) * 3, track.lastChild);
          sfx.toot();
          const t = track; q = null;
          setTimeout(() => t.classList.add('go'), 500);
          sayThen(t.textContent ? Array.from(t.querySelectorAll('.car')).map((c) => c.textContent).join(' ') : '', () => { if (!gm.over && game === gm) next(); }, 1300);
        }
      } else {
        sfx.oops(); gm.streak = 0;
        b.classList.remove('bad'); void b.offsetWidth; b.classList.add('bad');
        if (at === 0) flashTip('Look for the word with a capital letter. It goes first!');
      }
    }
    gm.speak = (btn) => { if (q) { if (!voiceOn() && btn) flashTip('The voice is off.'); else say(q.sentence); } };
    gm.step = () => {};
    next();
  }

  // ---------------------------------------------------------------- GARDEN
  const SHOP = [
    ['🌱', 2], ['🌷', 3], ['🌼', 3], ['🌸', 4], ['🌹', 5], ['🌻', 5], ['🍄', 5], ['🎈', 6, 1], ['☁️', 6, 1], ['🐞', 8], ['🐌', 8],
    ['🐝', 10, 1], ['🦋', 10, 1], ['🎃', 10], ['🌵', 10], ['🌳', 12], ['🌲', 12], ['🪁', 12, 1], ['⛄', 15], ['🌴', 15], ['🐸', 15], ['🐢', 15],
    ['🐇', 18], ['🐿️', 18], ['🚲', 20], ['🦔', 20], ['🦆', 20], ['🐓', 20], ['🐑', 25], ['🐐', 25], ['🐖', 25], ['🦉', 30], ['🦊', 30], ['🐄', 30], ['⛺', 30],
    ['🐴', 35], ['🦌', 35], ['🏠', 40], ['🐻', 40], ['🚜', 45], ['🏡', 50], ['🐼', 50], ['⛲', 60], ['🦒', 60], ['🐘', 70], ['🎪', 80],
    ['🌈', 100, 1], ['🦄', 120], ['🏰', 150], ['🐉', 150],
  ];
  // how big each thing is next to the others (1 = an animal the size of a sheep)
  const ITEM_SCALE = { '🌳': 2, '🌲': 2, '🌴': 2, '🌵': 1.4, '🏠': 2, '🏡': 2.2, '🏰': 2.8, '⛺': 1.6, '⛲': 1.7, '🎪': 2.4, '🚜': 1.5,
    '🐘': 1.8, '🦒': 2, '🐉': 2, '🦄': 1.4, '🐴': 1.4, '🐄': 1.3, '🐻': 1.3, '🦌': 1.3, '🌈': 3, '☁️': 1.6, '⛄': 1.3,
    '🌱': 0.6, '🌷': 0.8, '🌼': 0.7, '🌸': 0.7, '🌹': 0.8, '🌻': 0.9, '🍄': 0.7, '🐞': 0.5, '🐌': 0.55, '🐝': 0.6, '🦋': 0.75, '🐸': 0.7 };
  const SKY = new Set(SHOP.filter((s) => s[2]).map((s) => s[0]));
  const COST = new Map(SHOP.map((s) => [s[0], s[1]]));
  function garden() {
    show('s-garden');
    const scr = $('#s-garden');
    scr.innerHTML = '';
    let selected = null, picking = false;
    const seedPill = h('span', { class: 'pill', text: '🌱 ' + save.seeds });
    const pickBtn = h('button', { class: 'chunky ghost', text: '✋ PICK UP', onclick: () => {
      picking = !picking; selected = null; refreshTray();
      pickBtn.textContent = picking ? '✔ DONE' : '✋ PICK UP';
      scene.classList.toggle('picking', picking);
      setHint(picking ? 'Tap something to put it back (you get your seeds back).' : '');
    } });
    const earnBtn = h('button', { class: 'chunky', text: '🌱 EARN SEEDS', onclick: earnSeeds });
    const scene = h('div', { class: 'gscene', style: 'background:linear-gradient(#7dd3fc, #e0f2fe 44%, #86efac 45%, #22c55e)' },
      h('div', { class: 'sun' }),
      h('div', { class: 'hill', style: 'left:-10%;top:38%;width:60%;height:30%' }),
      h('div', { class: 'hill', style: 'left:45%;top:40%;width:70%;height:26%;background:#5eead4' }));
    const hint = h('div', { class: 'ghint', style: 'display:none' });
    const tray = h('div', { class: 'gtray' });
    function setHint(t) { hint.textContent = t; hint.style.display = t ? '' : 'none'; }
    function updSeeds() { seedPill.textContent = '🌱 ' + save.seeds; refreshTray(); }
    function refreshTray() {
      tray.querySelectorAll('.gbtn').forEach((b) => {
        const e = b.dataset.e;
        b.classList.toggle('poor', COST.get(e) > save.seeds);
        b.classList.toggle('sel', e === selected);
      });
    }
    SHOP.forEach(([e, cost]) => tray.append(h('button', { class: 'gbtn', 'data-e': e, onclick: () => {
      if (picking) pickBtn.click();
      if (cost > save.seeds) { sfx.oops(); setHint('You need ' + (cost - save.seeds) + ' more seeds for that. Tap EARN SEEDS!'); selected = null; refreshTray(); return; }
      selected = selected === e ? null : e;
      sfx.tap(); refreshTray();
      setHint(selected ? 'Tap the garden to put your ' + e + ' there!' : '');
    } }, h('span', { class: 'ge', text: e }), h('small', { text: '🌱' + cost }))));
    function sizeFor(e, y) { return (ITEM_SCALE[e] || 1) * (SKY.has(e) ? 2.4 : 1.9 + 2.4 * Math.max(0, (y - 45) / 55)); }
    function place(it) {
      const el = h('div', { class: 'gitem', text: it.e });
      function pos() {
        el.style.left = it.x + '%'; el.style.top = it.y + '%';
        el.style.fontSize = sizeFor(it.e, it.y) + 'em';
        el.style.zIndex = Math.round(it.y * 10) + (SKY.has(it.e) ? 1000 : 0);
      }
      pos();
      let drag = null;
      el.addEventListener('pointerdown', (ev) => {
        ev.stopPropagation(); ev.preventDefault();
        drag = { x: ev.clientX, y: ev.clientY, moved: false };
        try { el.setPointerCapture(ev.pointerId); } catch (e) { /* ignore */ }
      });
      el.addEventListener('pointermove', (ev) => {
        if (!drag || picking) return;
        if (Math.abs(ev.clientX - drag.x) + Math.abs(ev.clientY - drag.y) > 6) drag.moved = true;
        if (!drag.moved) return;
        const r = scene.getBoundingClientRect();
        it.x = Math.max(2, Math.min(98, (ev.clientX - r.left) / r.width * 100));
        it.y = clampY(it.e, (ev.clientY - r.top) / r.height * 100 + 6);
        pos();
      });
      el.addEventListener('pointerup', () => {
        if (!drag) return;
        const moved = drag.moved; drag = null;
        if (moved) { persist(); return; }
        if (picking) {
          const k = save.garden.indexOf(it);
          if (k >= 0) save.garden.splice(k, 1);
          addSeeds(COST.get(it.e) || 0); el.remove(); sfx.plant(); updSeeds();
          return;
        }
        el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); sfx.boing();
      });
      scene.append(el);
    }
    function clampY(e, y) { return SKY.has(e) ? Math.max(12, Math.min(96, y)) : Math.max(47, Math.min(99, y)); }
    scene.addEventListener('pointerdown', (ev) => {
      if (!selected || picking) return;
      const cost = COST.get(selected);
      if (cost > save.seeds) { sfx.oops(); setHint('Not enough seeds! Tap EARN SEEDS.'); selected = null; refreshTray(); return; }
      if (save.garden.length >= 150) { setHint('Your garden is full! Pick something up to make room.'); return; }
      const r = scene.getBoundingClientRect();
      const it = { e: selected, x: Math.max(2, Math.min(98, (ev.clientX - r.left) / r.width * 100)), y: 0 };
      it.y = clampY(it.e, (ev.clientY - r.top) / r.height * 100 + 6);
      save.seeds -= cost; save.garden.push(it); persist();
      place(it); sfx.plant(); updSeeds();
      if (cost > save.seeds) { selected = null; refreshTray(); setHint(''); }
    });
    save.garden.forEach(place);
    scr.append(scene, hint, tray, hudBar('WIGGLE\'S GARDEN', title, [seedPill, pickBtn, earnBtn]));
    refreshTray();
    if (!save.garden.length) setHint('Pick something from the bottom, then tap the garden!');
  }
  function earnSeeds() {
    sfx.tap();
    const g = G();
    let count = 0;
    const pill = h('span', { class: 'pill', text: '🌱 ' + save.seeds });
    const done = h('button', { class: 'chunky', text: 'DONE ✔', onclick: garden });
    runQuiz({ title: 'EARN SEEDS', backFn: garden, pill: [pill, done],
      next: () => (++count % 7 === 0) ? orderQ(dealFrom(g + '|order', orderLines(g))) : anyQ(g),
      onAnswer: (first) => {
        const n = first ? 3 : 1;
        addSeeds(n);
        pill.textContent = '🌱 ' + save.seeds;
        const r = pill.getBoundingClientRect(), sr = stage.getBoundingClientRect();
        floatText('+' + n + ' 🌱', r.left - sr.left, r.top - sr.top + r.height);
      } });
  }

  // ---------------------------------------------------------------- HOW TO PLAY
  const howto = $('#howto');
  $('#hw-wiggle').innerHTML = wiggleSVG();
  function openHowto() { howto.hidden = false; setFocus(null); hush(); }
  function closeHowto() { howto.hidden = true; setFocus(null); }
  $('#btn-howto').addEventListener('click', () => { if (window.MickleMenu) MickleMenu.close(); openHowto(); });
  $('#btn-howto-close').addEventListener('click', closeHowto);
  howto.addEventListener('click', (e) => { if (e.target === howto) closeHowto(); });

  // ---------------------------------------------------------------- keyboard + controller
  let kfocus = null;
  function setFocus(b) {
    if (kfocus) kfocus.classList.remove('kbd-focus');
    kfocus = b;
    if (b) {
      b.classList.add('kbd-focus');
      try { b.focus({ preventScroll: true }); } catch (e) { b.focus(); }
      if (b.closest('.gtray, .passage') && b.scrollIntoView) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }
  }
  function navRoot() { return !howto.hidden ? howto : overlay || current; }
  function focusables() {
    const root = navRoot();
    if (!root) return [];
    return Array.from(root.querySelectorAll('button')).filter((b) => !b.disabled && b.offsetParent !== null && !b.classList.contains('used') && !b.classList.contains('caught'));
  }
  function move(dx, dy) {
    const list = focusables();
    if (!list.length) return;
    if (!kfocus || list.indexOf(kfocus) < 0) {
      const first = ['choice', 'mode', 'acard', 'tile', 'stop sel', 'chunky'].map((c) => list.find((b) => c.split(' ').every((k) => b.classList.contains(k)))).find(Boolean);
      setFocus(first || list[0]); return;
    }
    const r = kfocus.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const b of list) {
      if (b === kfocus) continue;
      const q = b.getBoundingClientRect();
      const x = q.left + q.width / 2 - cx, y = q.top + q.height / 2 - cy;
      const along = x * dx + y * dy;
      if (along <= 2) continue;
      const s = along + Math.abs(x * dy - y * dx) * 2.5;
      if (s < bs) { bs = s; best = b; }
    }
    if (best) setFocus(best);
  }
  function activate() {
    const list = focusables();
    if (kfocus && list.indexOf(kfocus) >= 0) kfocus.click();
    else move(1, 0);
  }
  function goBack() {
    if (!howto.hidden) { closeHowto(); return; }
    if (onBack) { sfx.tap(); onBack(); }
  }
  function speakNow() {
    if (game && game.speak) game.speak(true);
    else if (quiz && current && current.id === 's-quiz') speakQ(true);
  }
  document.addEventListener('keydown', (e) => {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    const k = e.key;
    if (k === 'ArrowLeft') move(-1, 0);
    else if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowUp') move(0, -1);
    else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Enter' || k === ' ') { if (document.activeElement && document.activeElement.tagName === 'BUTTON' && !kfocus) return; activate(); }
    else if (k === 'Escape' || k === 'Backspace') goBack();
    else if (/^[1-4]$/.test(k) && current && current.id === 's-quiz' && !overlay) {
      const b = current.querySelector('.choice[data-i="' + (+k - 1) + '"]');
      if (b) b.click();
    } else if (k === 's' || k === 'S') speakNow();
    else return;
    e.preventDefault();
  });
  // a mouse or finger takes over from the keyboard highlight
  document.addEventListener('pointerdown', () => { if (kfocus) setFocus(null); ac(); }, true);

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (window.Pad360) {
      Pad360.poll();
      const B = Pad360.BTN;
      if (!(window.MickleMenu && MickleMenu.isOpen())) {
        const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
        if (dx || dy) move(dx, dx ? 0 : dy);
        if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) activate();
        if (Pad360.pressed(B.B)) goBack();
        if (Pad360.pressed(B.Y)) speakNow();
      }
    }
    if (game && !game.over && !overlay && howto.hidden && !(window.MickleMenu && MickleMenu.isOpen())) {
      game.t += dt;
      game.step(dt);
      game.tick(dt);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.WiggleDebug = { quiz: () => quiz, save, startStop, makeQ, anyQ, storyQs, orderQ, stopsFor, title, trail, arcade, garden, playArcade: (id) => playArcade(AGAMES.find((a) => a.id === id)), endArcade, GR, startCup, cupQs, cupDone, deal };
  title();
})();
