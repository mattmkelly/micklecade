// Math Mountain -- learn a math idea with Pip the goat, practise it, then climb to the Summit Quiz.
// Screens: TITLE (pick a grade) -> MAP (5 camps + the summit) -> LESSON (slides) -> PRACTICE
// (6 questions that ramp up) -> RESULT, or MAP -> QUIZ (12 mixed questions, bonus round) -> RESULT.
// It is all DOM inside #stage; 1em = 1/30 of the stage's height (see fit()).
// Topics and their question makers live in topics.js (window.MathMountain).
(function () {
  'use strict';
  const { GRADES, shuffle } = window.MathMountain;
  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const fx = document.getElementById('fx');
  const fctx = fx.getContext('2d');

  const PRACTICE_N = 6, QUIZ_N = 12, BONUS_FROM = 9; // questions 10-12 are the bonus round
  const SAVE_KEY = 'mathMountain.save';

  // ---------- save ----------
  let save = { stars: {}, quiz: {}, read: null, grade: null };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && typeof s === 'object') save = Object.assign(save, s); } catch (e) { /* no storage */ }
  function store() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* full or blocked */ } }

  // ---------- sizing: 1em = stage height / 30 ----------
  let fxScale = 1;
  function fit() {
    const r = stage.getBoundingClientRect();
    stage.style.fontSize = (r.height / 30) + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    fx.width = Math.round(r.width * dpr); fx.height = Math.round(r.height * dpr);
    fxScale = dpr;
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);
  fit();

  // ---------- sound: soft sine / triangle chimes ----------
  let actx = null;
  function audio() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; } }
    if (actx.state === 'suspended') actx.resume();
    return actx;
  }
  function tone(f, dur, type = 'sine', vol = 0.12, delay = 0) {
    const a = audio(); if (!a) return;
    const t = a.currentTime + delay, o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    tap() { tone(660, 0.06, 'sine', 0.06); },
    right() { tone(784, 0.18, 'triangle', 0.1); tone(1047, 0.25, 'triangle', 0.1, 0.09); tone(1568, 0.3, 'sine', 0.05, 0.18); },
    wrong() { tone(330, 0.14, 'sine', 0.08); tone(262, 0.2, 'sine', 0.07, 0.1); },
    page() { tone(523, 0.08, 'sine', 0.06); tone(659, 0.1, 'sine', 0.05, 0.05); },
    star(i) { tone(880 * Math.pow(1.26, i), 0.3, 'triangle', 0.09); },
    fanfare() { [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, i === 5 ? 0.6 : 0.16, 'triangle', 0.09, i * 0.12)); },
  };

  // ---------- reading aloud ----------
  const deco = document.createElement('textarea');
  function sayOf(html) {
    let s = String(html)
      .replace(/<span class="fr"><i>(.*?)<\/i><i>(.*?)<\/i><\/span>/g, ' $1 over $2 ')
      .replace(/<span class="blank">.*?<\/span>/g, ' what ')
      .replace(/<br\s*\/?>/g, '. ')
      .replace(/<[^>]+>/g, '');
    deco.innerHTML = s; s = deco.value;
    return s
      .replace(/(^|[\s(])−(?=\d)/g, '$1negative ')
      .replace(/−/g, ' minus ').replace(/×/g, ' times ').replace(/÷/g, ' divided by ')
      .replace(/(\d)x\b/g, '$1 x').replace(/=/g, ' equals ').replace(/>/g, ' is greater than ').replace(/</g, ' is less than ')
      .replace(/\$(\d+(?:[.,]\d+)*)/g, '$1 dollars').replace(/\+/g, ' plus ').replace(/¢/g, ' cents').replace(/%/g, ' percent').replace(/°/g, ' degrees')
      .replace(/(\d) : (\d)/g, '$1 to $2').replace(/(\d+) R(\d+)/g, '$1 remainder $2').replace(/→/g, ' becomes ').replace(/✓/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  function readOn() { return save.read === null ? (cur.grade == null ? 1 : cur.grade) <= 2 : save.read; }
  function say(html, force) {
    if (!('speechSynthesis' in window)) return;
    if (!force && !readOn()) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(sayOf(html));
      u.rate = 0.92; u.pitch = 1.1; u.lang = 'en-US';
      speechSynthesis.speak(u);
    } catch (e) { /* no voice */ }
  }
  function hush() { try { if ('speechSynthesis' in window) speechSynthesis.cancel(); } catch (e) { /* */ } }

  // ---------- Pip the mountain goat ----------
  function pipSVG(cls = '') {
    return `<svg class="pip ${cls}" viewBox="-62 -82 124 156" aria-hidden="true">
      <ellipse cx="0" cy="70" rx="38" ry="5" fill="rgba(30,58,138,.18)"/>
      <rect x="-26" y="40" width="9" height="28" rx="4" fill="#e2e8f0"/><rect x="17" y="40" width="9" height="28" rx="4" fill="#e2e8f0"/>
      <rect x="-14" y="44" width="9" height="26" rx="4" fill="#f8fafc"/><rect x="5" y="44" width="9" height="26" rx="4" fill="#f8fafc"/>
      <rect x="-26" y="62" width="9" height="7" rx="2" fill="#475569"/><rect x="17" y="62" width="9" height="7" rx="2" fill="#475569"/>
      <rect x="-14" y="64" width="9" height="7" rx="2" fill="#475569"/><rect x="5" y="64" width="9" height="7" rx="2" fill="#475569"/>
      <ellipse cx="0" cy="34" rx="36" ry="24" fill="#fff" stroke="#cbd5e1" stroke-width="2"/>
      <ellipse cx="36" cy="20" rx="5" ry="8" fill="#fff" stroke="#cbd5e1" stroke-width="2" transform="rotate(30 36 20)"/>
      <path d="M-22 6 Q0 18 22 6 L20 16 Q0 26 -20 16 Z" fill="#f43f5e"/><path d="M12 14 l8 20 l-9 -2 z" fill="#e11d48"/>
      <path d="M-11 -44 q-20 -14 -16 -34 q6 10 22 26" fill="#d6a35c" stroke="#a16207" stroke-width="2" stroke-linejoin="round"/>
      <path d="M11 -44 q20 -14 16 -34 q-6 10 -22 26" fill="#d6a35c" stroke="#a16207" stroke-width="2" stroke-linejoin="round"/>
      <ellipse cx="-30" cy="-26" rx="15" ry="7" fill="#fff" stroke="#cbd5e1" stroke-width="2" transform="rotate(-20 -30 -26)"/>
      <ellipse cx="30" cy="-26" rx="15" ry="7" fill="#fff" stroke="#cbd5e1" stroke-width="2" transform="rotate(20 30 -26)"/>
      <ellipse cx="-31" cy="-26" rx="8" ry="3" fill="#fbcfe8" transform="rotate(-20 -31 -26)"/><ellipse cx="31" cy="-26" rx="8" ry="3" fill="#fbcfe8" transform="rotate(20 31 -26)"/>
      <ellipse cx="0" cy="-20" rx="25" ry="27" fill="#fff" stroke="#cbd5e1" stroke-width="2"/>
      <path d="M-6 6 L0 22 L6 6 Z" fill="#e2e8f0"/>
      <circle cx="-10" cy="-24" r="5.5" fill="#1e293b"/><circle cx="10" cy="-24" r="5.5" fill="#1e293b"/>
      <circle cx="-8" cy="-26" r="2" fill="#fff"/><circle cx="12" cy="-26" r="2" fill="#fff"/>
      <ellipse cx="-17" cy="-13" rx="4.5" ry="2.6" fill="#fda4af" opacity=".7"/><ellipse cx="17" cy="-13" rx="4.5" ry="2.6" fill="#fda4af" opacity=".7"/>
      <ellipse cx="0" cy="-6" rx="11" ry="8" fill="#fde2e4"/><circle cx="-4" cy="-7" r="1.6" fill="#9f1239"/><circle cx="4" cy="-7" r="1.6" fill="#9f1239"/>
      <path d="M-5 -1 q5 5 10 0" stroke="#9f1239" stroke-width="2" fill="none" stroke-linecap="round"/>
    </svg>`;
  }

  const CHEERS = ['Great job!', 'You got it!', 'Super!', 'Nice thinking!', 'Awesome!', 'Yes! Well done!', 'Brilliant!', 'Way to go!'];
  const OOPS = ['Not quite. Try again!', 'Almost! Have another go.', 'Hmm, try a different one.'];
  const cheer = () => CHEERS[Math.floor(Math.random() * CHEERS.length)];

  // ---------- state ----------
  let cur = { name: 'title', grade: save.grade };
  const gradeOf = (n) => GRADES.find((g) => g.n === n) || GRADES[1];
  const grade = () => gradeOf(cur.grade);
  const topicStars = (id) => save.stars[id] || 0;
  const gradeStars = (g) => gradeOf(g).topics.reduce((t, tp) => t + topicStars(tp.id), 0) + ((save.quiz['g' + g] || {}).stars || 0);
  const starStr = (n, of = 3) => Array.from({ length: of }, (_, i) => (i < n ? '★' : '<span class="off">★</span>')).join('');
  const topBar = (back, title, right = '') => `<div class="top"><button class="pill nav" data-act="back">◀ ${back}</button><div class="tt">${title}</div><div class="tr">${right}</div></div>`;
  const speakBtn = () => `<button class="icon-btn nav" data-act="speak" aria-label="Read it to me">\u{1F50A}</button>`;

  function show(html, focusSel) {
    hush();
    screen.innerHTML = html;
    const first = (focusSel && screen.querySelector(focusSel)) || screen.querySelector('[data-default]') || screen.querySelector('.nav');
    setFocus(first);
  }

  // ---------- TITLE ----------
  function goTitle() {
    cur = { name: 'title', grade: save.grade };
    const btns = GRADES.map((g) => {
      const st = gradeStars(g.n), max = g.topics.length * 3 + 3;
      return `<button class="grade nav" data-act="grade" data-g="${g.n}" style="--c:${g.color}"${save.grade === g.n ? ' data-default' : ''}><b>${g.n ? 'GRADE ' + g.n : 'KINDER'}</b><span>${g.blurb}</span><em>★ ${st}/${max}</em></button>`;
    }).join('');
    const ro = save.read === null ? 'AUTO' : save.read ? 'ON' : 'OFF';
    show(`<div class="title-scr">
      <div class="logo-row rise">${pipSVG()}<div><h1 class="logo">MATH<br>MOUNTAIN</h1><p>Learn it. Practice it. Climb to the quiz!</p></div></div>
      <div class="grades rise" style="animation-delay:.1s">${btns}</div>
      <button class="pill nav" data-act="read">\u{1F50A} READ TO ME: ${ro}</button>
    </div>`);
  }

  // ---------- MAP ----------
  const CAMPS = [[16, 63], [37, 70], [61, 76], [82, 58], [55, 48]];
  const SUMMIT = [64, 24];
  function goMap(focusId) {
    cur = { name: 'map', grade: cur.grade };
    save.grade = cur.grade; store();
    const g = grade(), q = save.quiz['g' + g.n] || {};
    const next = g.topics.findIndex((t) => !topicStars(t.id));
    const pts = [[4, 94]].concat(CAMPS, [SUMMIT]);
    const path = pts.map((p, i) => (i ? 'L' : 'M') + (p[0] * 1.6).toFixed(1) + ' ' + (p[1] * 0.9).toFixed(1)).join(' ');
    let camps = g.topics.map((t, i) => {
      const st = topicStars(t.id);
      return `<button class="camp nav${st ? ' done' : ''}" data-act="topic" data-i="${i}" style="left:${CAMPS[i][0]}%;top:${CAMPS[i][1]}%"${(focusId === t.id || (!focusId && i === next)) ? ' data-default' : ''}>
        <div class="ring"><span>${t.icon}</span></div><div class="nm">${i + 1}. ${t.name}</div><div class="st">${starStr(st)}</div></button>`;
    }).join('');
    camps += `<button class="camp summit nav" data-act="quiz" style="left:${SUMMIT[0]}%;top:${SUMMIT[1]}%"${(focusId === 'quiz' || (!focusId && next < 0)) ? ' data-default' : ''}>
      <div class="ring"><span>\u{1F3C6}</span></div><div class="nm">SUMMIT QUIZ</div><div class="st">${q.best ? starStr(q.stars || 0) + ' <span style="color:#fff">' + q.best + '</span>' : starStr(0)}</div></button>`;
    const pipAt = next >= 0 ? CAMPS[next] : SUMMIT;
    const tip = next === 0 ? 'Start at camp 1! Each camp teaches one idea, then you practice it.'
      : next > 0 ? `Next stop: camp ${next + 1}, ${g.topics[next].name}! Or try the Summit Quiz any time.`
      : 'You visited every camp! Now climb to the Summit Quiz and see how far you get.';
    show(`${topBar('GRADES', g.label, `<span class="score-chip">★ ${gradeStars(g.n)}/${g.topics.length * 3 + 3}</span>`)}
      <svg class="map-mtn" viewBox="0 0 160 90" preserveAspectRatio="none" aria-hidden="true">
        <path d="M-5 92 L40 52 L62 40 L84 30 L102 18 L118 32 L132 44 L165 70 L165 92 Z" fill="#818cf8" opacity=".85"/>
        <path d="M-5 92 L28 68 L56 54 L80 46 L102 18 L124 50 L150 64 L165 72 L165 92 Z" fill="#6366f1"/>
        <path d="M102 18 L94 28 L99 27 L103 31 L107 26 L111 29 Z" fill="#f8fafc"/>
        <path d="M-5 92 L20 80 L60 76 L100 72 L140 76 L165 80 L165 92 Z" fill="#4ade80"/>
        <path d="${path}" fill="none" stroke="#fff" stroke-width=".9" stroke-dasharray="2 1.6" stroke-linecap="round" opacity=".9"/>
        <path d="M102.4 21.6 V12 L109 14 L102.4 16" fill="#f59e0b" stroke="#b45309" stroke-width=".4"/>
      </svg>
      ${camps}
      <div class="map-pip" style="left:${pipAt[0] - 8}%;top:${pipAt[1] - 2}%">${pipSVG()}</div>
      <div class="map-tip glass">${tip}</div>`);
  }

  // ---------- LESSON ----------
  function goLesson(i, slide = 0) {
    const t = grade().topics[i];
    cur = { name: 'lesson', grade: cur.grade, ti: i, slide };
    const sl = t.lesson[slide], last = slide === t.lesson.length - 1;
    const dots = t.lesson.map((_, k) => `<i class="${k <= slide ? 'on' : ''}"></i>`).join('');
    show(`${topBar('MAP', `${t.icon} ${t.name}`, `<span class="step">LEARN</span><div class="dots">${dots}</div>${speakBtn()}`)}
      <div class="lesson">
        <div class="vis-card glass rise">${sl.v}</div>
        <div class="talk">
          <div class="bubble glass rise" style="animation-delay:.08s">${sl.t}</div>
          <div class="pip-row">${pipSVG('think')}
            <div class="btns">${slide ? '<button class="go ghost nav" data-act="prev">◀</button>' : ''}
              <button class="go ${last ? 'gold' : ''} nav" data-act="next" data-default>${last ? "LET'S PRACTICE ▶" : 'NEXT ▶'}</button></div>
          </div>
        </div>
      </div>`);
    say(sl.t);
  }

  // ---------- PRACTICE + QUIZ ----------
  function newQuestion(topic, d) {
    // don't repeat a question already seen this round
    let q;
    for (let k = 0; k < 8; k++) { q = topic.gen(Math.max(0, Math.min(1, d))); if (!cur.seen.includes(q.q + q.vis)) break; }
    cur.seen.push(q.q + q.vis);
    return q;
  }

  function startPractice(i) {
    cur = { name: 'practice', grade: cur.grade, ti: i, n: 0, first: 0, marks: [], seen: [] };
    nextQuestion();
  }
  function startQuiz() {
    const ts = grade().topics;
    let order = [];
    while (order.length < QUIZ_N) {
      const s = shuffle(ts.slice());
      if (order.length && s[0] === order[order.length - 1]) s.push(s.shift());
      order = order.concat(s);
    }
    cur = { name: 'quiz', grade: cur.grade, n: 0, order: order.slice(0, QUIZ_N), score: 0, right: 0, streak: 0, best: 0, marks: [], seen: [] };
    nextQuestion();
  }

  function nextQuestion() {
    const quiz = cur.name === 'quiz';
    const N = quiz ? QUIZ_N : PRACTICE_N;
    if (cur.n >= N) return finish();
    const topic = quiz ? cur.order[cur.n] : grade().topics[cur.ti];
    const d = quiz ? 0.3 + 0.7 * (cur.n / (N - 1)) : 0.85 * (cur.n / (N - 1));
    cur.q = newQuestion(topic, d + (Math.random() - 0.5) * 0.1);
    cur.topic = topic; cur.tries = 0; cur.locked = false; cur.t0 = performance.now();
    renderQuestion();
    say(cur.q.q);
  }

  function renderQuestion() {
    const quiz = cur.name === 'quiz', q = cur.q, N = quiz ? QUIZ_N : PRACTICE_N;
    const bonus = quiz && cur.n >= BONUS_FROM;
    const dots = Array.from({ length: N }, (_, k) => `<i class="${cur.marks[k] || (k === cur.n ? 'on' : '')}"></i>`).join('');
    const plain = sayOf(q.q).length;
    const tcls = plain > 70 ? 'long' : plain > 34 || q.vis && plain > 26 ? 'mid' : '';
    const right = quiz
      ? `<span class="score-chip">${cur.streak >= 2 ? '\u{1F525}' + cur.streak + ' &nbsp;' : ''}${cur.score}</span>${speakBtn()}`
      : `<div class="dots">${dots}</div>${speakBtn()}`;
    const title = quiz ? `\u{1F3C6} ${grade().n ? 'Grade ' + grade().n : 'Kindergarten'} Summit Quiz` : `${cur.topic.icon} ${cur.topic.name}`;
    const n = q.choices.length;
    const answers = q.choices.map((c, k) => `<button class="ans nav${q.small || c.length > 14 ? ' small' : ''}" data-act="ans" data-k="${k}"><span class="k">${k + 1}</span>${c}</button>`).join('');
    const climb = quiz ? `<div class="climb"><div class="fill" style="height:${(cur.n / QUIZ_N) * 100}%"></div><span class="flag">\u{1F6A9}</span><div class="me" style="bottom:${(cur.n / QUIZ_N) * 100}%">${pipSVG()}</div></div>` : '';
    show(`${topBar('MAP', title, right)}
      <div class="qs${bonus ? ' gold-q' : ''}">
        <div class="qmain">
          ${climb}
          <div class="qside"><div class="bubble glass" id="bub">${quiz && cur.n === BONUS_FROM ? '<b>BONUS ROUND!</b> Every right answer is worth double!' : ''}</div>${quiz ? '' : pipSVG('')}</div>
          <div class="qcard glass rise">
            <div class="qtag${bonus ? ' bonus' : ''}">${quiz ? (bonus ? '⭐ BONUS ×2 · ' : '') + `QUESTION ${cur.n + 1} OF ${N}` : `PRACTICE ${cur.n + 1} OF ${N}`}</div>
            <div class="qtext ${tcls}">${q.q}</div>
            ${q.vis ? `<div class="qvis">${q.vis}</div>` : ''}
          </div>
        </div>
        <div class="answers" style="--n:${n}">${answers}</div>
      </div>`, '.ans');
    if (!quiz) {
      // hint button sits on the question card's corner
      const card = screen.querySelector('.qcard');
      const hb = document.createElement('button');
      hb.className = 'pill nav'; hb.dataset.act = 'hint'; hb.textContent = '\u{1F4A1} HINT';
      hb.style.cssText = 'position:absolute;right:.6em;top:.5em;font-size:.9em';
      card.appendChild(hb);
    }
  }

  function bubble(html, withNext, nextLabel) {
    const b = document.getElementById('bub'); if (!b) return;
    b.innerHTML = html + (withNext ? `<button class="go nav" data-act="nextq">${nextLabel || 'NEXT ▶'}</button>` : '');
    if (withNext) setFocus(b.querySelector('.go'));
  }
  function pipMood(m) {
    const p = screen.querySelector('.qside .pip, .climb .pip'); if (!p) return;
    p.classList.remove('happy', 'think'); void p.getBoundingClientRect(); p.classList.add(m);
  }
  function popup(el, text) {
    const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect();
    const p = document.createElement('div');
    p.className = 'popup'; p.textContent = text;
    p.style.left = (r.left + r.width / 2 - s.left) + 'px'; p.style.top = (r.top - s.top - 10) + 'px';
    stage.appendChild(p); setTimeout(() => p.remove(), 1200);
  }

  function choose(k) {
    if (cur.locked) return;
    const q = cur.q, btns = screen.querySelectorAll('.ans'), btn = btns[k];
    if (!btn || btn.classList.contains('bad')) return;
    const quiz = cur.name === 'quiz';
    if (k === q.answer) {
      cur.locked = true;
      btn.classList.add('ok'); sfx.right(); burst(btn, 26); pipMood('happy');
      if (quiz) {
        cur.right++; cur.streak++; cur.best = Math.max(cur.best, cur.streak);
        const secs = (performance.now() - cur.t0) / 1000;
        const quick = Math.round(Math.max(0, Math.min(50, (15 - secs) * 5)));
        const streakB = Math.min(cur.streak - 1, 5) * 20;
        let pts = 100 + quick + streakB; if (cur.n >= BONUS_FROM) pts *= 2;
        cur.score += pts; cur.marks[cur.n] = 'ok';
        popup(btn, '+' + pts);
        const extra = [quick >= 25 ? 'Speedy!' : '', cur.streak >= 3 ? `${cur.streak} in a row!` : ''].filter(Boolean).join(' ');
        bubble(`<b>${cheer()}</b> ${extra}<br>${q.why}`);
        climbTo(cur.n + 1);
        const chip = screen.querySelector('.score-chip'); if (chip) chip.innerHTML = `${cur.streak >= 2 ? '\u{1F525}' + cur.streak + ' &nbsp;' : ''}${cur.score}`;
        cur.n++;
        cur.timer = setTimeout(nextQuestion, 2100);
        bubbleNextTap();
      } else {
        if (cur.tries === 0) cur.first++;
        cur.marks[cur.n] = cur.tries === 0 ? 'ok' : 'miss';
        bubble(`<b>${cheer()}</b><br>${q.why}`, true);
        say(cheer() + ' ' + q.why);
        cur.n++;
      }
      return;
    }
    // a miss: gentle, and always explains
    cur.tries++; sfx.wrong(); btn.classList.add('bad'); pipMood('think');
    if (quiz) {
      cur.locked = true; cur.streak = 0; cur.marks[cur.n] = 'miss';
      btns[q.answer].classList.add('show');
      bubble(`Good try! The answer is ${q.choices[q.answer]}.<br>${q.why}`, true);
      say('The answer is ' + q.choices[q.answer] + '. ' + q.why);
      const chip = screen.querySelector('.score-chip'); if (chip) chip.textContent = cur.score;
      climbTo(cur.n + 1);
      cur.n++;
      return;
    }
    if (cur.tries === 1) {
      bubble(`${OOPS[Math.floor(Math.random() * OOPS.length)]}<br>\u{1F4A1} ${q.hint}`);
      say(q.hint);
      const left = [...btns].find((b) => !b.classList.contains('bad')); setFocus(left);
    } else {
      cur.locked = true; cur.marks[cur.n] = 'miss';
      btns[q.answer].classList.add('show');
      bubble(`Here’s how: ${q.why}`, true);
      say(q.why);
      cur.n++;
    }
  }
  // in the quiz a right answer moves on by itself; a tap on the bubble skips the wait
  function bubbleNextTap() { const b = document.getElementById('bub'); if (b) b.dataset.act = 'skipwait'; }
  function climbTo(n) {
    const f = screen.querySelector('.climb .fill'), me = screen.querySelector('.climb .me');
    if (f) f.style.height = (n / QUIZ_N) * 100 + '%';
    if (me) me.style.bottom = (n / QUIZ_N) * 100 + '%';
  }

  function finish() {
    const quiz = cur.name === 'quiz', g = grade();
    let stars, title, lines, btns;
    if (quiz) {
      stars = cur.right >= 11 ? 3 : cur.right >= 8 ? 2 : 1;
      const rec = save.quiz['g' + g.n] || {}, newBest = cur.score > (rec.best || 0);
      save.quiz['g' + g.n] = { best: Math.max(rec.best || 0, cur.score), stars: Math.max(rec.stars || 0, stars) };
      store();
      if (cur.score > 0 && window.MickleScores) MickleScores.record('math-mountain', cur.score, { category: g.label, order: g.n });
      title = cur.right === QUIZ_N ? 'PERFECT CLIMB!' : 'YOU REACHED THE SUMMIT!';
      lines = `<div class="big-score">${cur.score}</div><p>${cur.right} of ${QUIZ_N} right · best streak ${cur.best}${newBest ? ' · <b style="color:#16a34a">NEW BEST!</b>' : ' · best ' + save.quiz['g' + g.n].best}</p>`;
      btns = `<button class="go nav" data-act="quiz" data-default>CLIMB AGAIN</button><button class="go blue nav" data-act="back">MAP</button>`;
    } else {
      const t = g.topics[cur.ti];
      stars = cur.first >= 6 ? 3 : cur.first >= 4 ? 2 : 1;
      save.stars[t.id] = Math.max(topicStars(t.id), stars); store();
      title = stars === 3 ? 'AMAZING!' : stars === 2 ? 'GREAT WORK!' : 'GOOD PRACTICE!';
      const nextI = cur.ti + 1 < g.topics.length ? cur.ti + 1 : -1;
      lines = `<p>${t.icon} <b>${t.name}</b>: ${cur.first} of ${PRACTICE_N} right on the first try.</p><p style="font-size:1em;color:#64748b">${stars < 3 ? 'Practice again for more stars!' : 'You really know this one!'}</p>`;
      btns = (nextI >= 0 ? `<button class="go nav" data-act="topic" data-i="${nextI}" data-default>NEXT CAMP ▶</button>` : `<button class="go gold nav" data-act="quiz" data-default>SUMMIT QUIZ \u{1F3C6}</button>`) +
        `<button class="go ghost nav" data-act="again">PRACTICE AGAIN</button><button class="go blue nav" data-act="back">MAP</button>`;
    }
    const was = cur;
    cur = { name: 'result', grade: cur.grade, from: was.name, ti: was.ti };
    const starsHtml = [0, 1, 2].map((i) => `<span class="${i < stars ? 'on' : ''}" style="animation-delay:${0.3 + i * 0.25}s">★</span>`).join('');
    show(`<div class="result"><div class="panel glass rise">${pipSVG()}<h2>${title}</h2><div class="stars">${starsHtml}</div>${lines}<div class="row">${btns}</div></div></div>`);
    for (let i = 0; i < stars; i++) setTimeout(() => sfx.star(i), 300 + i * 250);
    setTimeout(() => { sfx.fanfare(); confetti(stars * 50 + 40); }, 300 + stars * 250);
    say(title.toLowerCase() + '!');
  }

  // ---------- confetti ----------
  let parts = [], fxRunning = false;
  const COLORS = ['#f472b6', '#fbbf24', '#4ade80', '#60a5fa', '#a78bfa', '#fb923c'];
  function spawn(x, y, n, spread) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = (0.4 + Math.random()) * spread;
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - spread * 0.8, r: 3 + Math.random() * 4, c: COLORS[i % COLORS.length], rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4, life: 1 });
    }
    if (!fxRunning) { fxRunning = true; requestAnimationFrame(fxLoop); }
  }
  function burst(el, n) { const r = el.getBoundingClientRect(), s = stage.getBoundingClientRect(); spawn((r.left + r.width / 2 - s.left) * fxScale, (r.top + r.height / 2 - s.top) * fxScale, n, 5 * fxScale); }
  function confetti(n) { const w = fx.width; for (let i = 0; i < 5; i++) spawn(w * (0.1 + i * 0.2), fx.height * 0.3, n / 5, 7 * fxScale); }
  function fxLoop() {
    fctx.clearRect(0, 0, fx.width, fx.height);
    parts = parts.filter((p) => p.life > 0 && p.y < fx.height + 20);
    for (const p of parts) {
      p.vy += 0.18 * fxScale; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.008;
      fctx.save(); fctx.translate(p.x, p.y); fctx.rotate(p.rot); fctx.globalAlpha = Math.min(1, p.life * 2);
      fctx.fillStyle = p.c; fctx.fillRect(-p.r * fxScale, -p.r * fxScale * 0.6, p.r * 2 * fxScale, p.r * 1.2 * fxScale); fctx.restore();
    }
    if (parts.length) requestAnimationFrame(fxLoop); else { fxRunning = false; fctx.clearRect(0, 0, fx.width, fx.height); }
  }

  // ---------- actions ----------
  function act(name, el) {
    const ds = (el && el.dataset) || {};
    if (name !== 'ans' && name !== 'speak') sfx.tap();
    switch (name) {
      case 'grade': cur.grade = +ds.g; save.grade = cur.grade; store(); goMap(); break;
      case 'read': save.read = save.read === null ? !readOn() : !save.read; store(); goTitle(); setFocus(screen.querySelector('[data-act="read"]')); if (readOn()) say('I will read to you!', true); break;
      case 'topic': cur.ti = +ds.i; goLesson(+ds.i, 0); break;
      case 'next': {
        const t = grade().topics[cur.ti];
        sfx.page();
        if (cur.slide < t.lesson.length - 1) goLesson(cur.ti, cur.slide + 1); else startPractice(cur.ti);
        break;
      }
      case 'prev': goLesson(cur.ti, Math.max(0, cur.slide - 1)); break;
      case 'quiz': startQuiz(); break;
      case 'again': startPractice(cur.ti); break;
      case 'ans': choose(+ds.k); break;
      case 'nextq': clearTimeout(cur.timer); nextQuestion(); break;
      case 'skipwait': if (cur.locked && cur.name === 'quiz' && cur.timer) { clearTimeout(cur.timer); cur.timer = 0; nextQuestion(); } break;
      case 'hint': if (cur.q && !cur.locked) { bubble('\u{1F4A1} ' + cur.q.hint); say(cur.q.hint, true); } break;
      case 'speak': speakNow(); break;
      case 'back': back(); break;
    }
  }
  function speakNow() {
    if (cur.name === 'lesson') say(grade().topics[cur.ti].lesson[cur.slide].t, true);
    else if (cur.q && (cur.name === 'practice' || cur.name === 'quiz')) {
      const b = document.getElementById('bub');
      say(cur.locked && b ? b.innerHTML.replace(/<button[\s\S]*<\/button>/, '') : cur.q.q, true);
    }
  }
  function back() {
    clearTimeout(cur.timer);
    if (cur.name === 'title') { if (window.MickleMenu) MickleMenu.backToArcade(); return; }
    if (cur.name === 'map') return goTitle();
    const id = cur.name === 'quiz' || (cur.name === 'result' && cur.from === 'quiz') ? 'quiz' : (cur.ti !== undefined ? grade().topics[cur.ti].id : null);
    goMap(id);
  }

  stage.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || !screen.contains(el)) return;
    document.body.classList.remove('navmode');
    audio();
    act(el.dataset.act, el);
  });

  // ---------- keyboard / controller focus ----------
  let focused = null;
  function setFocus(el) {
    if (focused) focused.classList.remove('foc');
    focused = el || null;
    if (focused) { focused.classList.add('foc'); try { focused.focus({ preventScroll: true }); } catch (e) { /* */ } }
  }
  function navEls() { return [...screen.querySelectorAll('.nav')].filter((b) => !b.disabled && b.offsetParent !== null && !b.classList.contains('bad')); }
  function move(dx, dy) {
    document.body.classList.add('navmode');
    const els = navEls(); if (!els.length) return;
    if (!focused || !screen.contains(focused) || !els.includes(focused)) return setFocus(els[0]);
    const r = focused.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = Infinity;
    for (const el of els) {
      if (el === focused) continue;
      const q = el.getBoundingClientRect(), ex = q.left + q.width / 2, ey = q.top + q.height / 2;
      const along = (ex - cx) * dx + (ey - cy) * dy, side = Math.abs((ex - cx) * dy) + Math.abs((ey - cy) * dx);
      if (along <= 4) continue;
      const sc = along + side * 2.2;
      if (sc < bs) { bs = sc; best = el; }
    }
    if (best) { setFocus(best); sfx.tap(); }
  }
  function press() {
    document.body.classList.add('navmode');
    if (cur.name === 'quiz' && cur.locked && cur.timer) { act('skipwait'); return; }
    if (!focused || !screen.contains(focused)) { setFocus(navEls()[0]); return; }
    audio();
    act(focused.dataset.act, focused);
  }

  document.addEventListener('keydown', (e) => {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    const k = e.key;
    if (k === 'ArrowLeft') move(-1, 0); else if (k === 'ArrowRight') move(1, 0);
    else if (k === 'ArrowUp') move(0, -1); else if (k === 'ArrowDown') move(0, 1);
    else if (k === 'Enter' || k === ' ') press();
    else if (k === 'Escape' || k === 'Backspace') back();
    else if (/^[1-4]$/.test(k) && (cur.name === 'practice' || cur.name === 'quiz')) {
      if (cur.locked) { const nb = screen.querySelector('[data-act="nextq"]'); if (nb) act('nextq'); else if (cur.timer) act('skipwait'); }
      else { audio(); choose(+k - 1); }
    } else if (k === 'h' || k === 'H' || k === '?') act('hint');
    else if (k === 's' || k === 'S') speakNow();
    else return;
    e.preventDefault();
  });

  function padLoop() {
    if (window.Pad360) {
      Pad360.poll();
      if (!(window.MickleMenu && MickleMenu.isOpen())) {
        const dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
        if (dx || dy) move(dx, dy);
        if (Pad360.pressed(Pad360.BTN.A) || Pad360.pressed(Pad360.BTN.START)) press();
        if (Pad360.pressed(Pad360.BTN.B)) back();
        if (Pad360.pressed(Pad360.BTN.Y)) speakNow();
        if (Pad360.pressed(Pad360.BTN.X) && cur.name === 'practice') act('hint');
      }
    }
    requestAnimationFrame(padLoop);
  }
  requestAnimationFrame(padLoop);

  // test hooks
  window.MathMountainDebug = { get state() { return cur; }, save: () => save, goTitle, goMap, goLesson, startPractice, startQuiz, choose, act, sayOf, grade: (n) => { cur.grade = n; } };

  goTitle();
})();
