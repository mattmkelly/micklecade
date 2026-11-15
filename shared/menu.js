// In-game menu for MickleCade games: a small ☰ button sitting on the corner of the game's
// frame. It opens a panel holding everything that used to sit above and below the frame --
// the BACK TO MICKLECADE link, the FULL SCREEN button, the TOUCH CONTROLS toggle -- plus the
// page's #hint text as HOW TO PLAY. With nothing outside it, the frame can fill the window.
//
// Plain <script src="../../shared/menu.js"></script> after the other shared scripts and
// before game.js -- no modules, works from file://. It does its work once the page has
// loaded, so it picks up the toggles touchpad.js and fullscreen.js made.
// On the script tag:
//   data-frame="#game"     what the button sits on (first one that's showing; default
//                          "#stage, #game, #app")
//   data-at="x,y"          where on the frame, so it misses the game's own HUD: fractions of
//                          the frame's width and height for the button's corner, kept 8px
//                          inside the edge -- "0,0" top-left (default), "1,0" top-right,
//                          "0,1" bottom-left, "0.16,0" along the top just past a HUD button.
//                          With several frames, one per frame split by "|": "0,1|0,0"
//   data-portrait="fill"   this game lays itself out for a tall screen, so it needs no
//                          turn-sideways note (Cozy Cove)
// The button grows and shrinks with the frame.
// Held upright, a wide game shows a small "turn me sideways" note in the empty space above
// its frame. It never takes taps, so play carries on underneath.
// Taps on the button and panel never reach the game, so "tap anywhere" games are safe.
// Esc closes the panel. window.MickleMenu.open() / close() / isOpen() for games that want them.
(function (global) {
  var script = document.currentScript;
  var frameSel = (script && script.getAttribute('data-frame')) || '#stage, #game, #app';
  // one "x,y" per frame in data-frame's order, split by "|" (the last one covers the rest)
  var ats = ((script && script.getAttribute('data-at')) || '0,0').split('|').map(function (p) {
    return p.split(',').map(parseFloat);
  });
  var fillsPortrait = !!script && script.getAttribute('data-portrait') === 'fill';
  var btn, panel, turn, frames = [];

  var CSS = [
    '.mc-menu-btn { position: fixed; z-index: 70; width: 34px; height: 34px; padding: 0; border-radius: 9px;',
    '  border: 2px solid rgba(255,255,255,.75); background: rgba(10,6,24,.55); color: #fff;',
    '  font: bold 20px/1 "Courier New", Courier, monospace; cursor: pointer; touch-action: manipulation;',
    '  -webkit-tap-highlight-color: transparent; display: flex; align-items: center; justify-content: center; }',
    '.mc-menu-btn:hover, .mc-menu-btn:focus-visible { outline: none; border-color: #ffe14f; color: #ffe14f; }',
    '.mc-menu-btn.nudge { animation: mc-menu-nudge .6s ease-in-out 4; }',
    '@keyframes mc-menu-nudge { 50% { border-color: #ffe14f; color: #ffe14f; box-shadow: 0 0 16px #ffe14f; } }',
    '.mc-menu-back { position: fixed; inset: 0; z-index: 80; background: rgba(5,3,15,.6);',
    '  display: flex; align-items: center; justify-content: center; padding: 12px; }',
    '.mc-menu-back[hidden] { display: none; }',
    '.mc-menu-panel { width: min(360px, 100%); max-height: 100%; overflow: auto; padding: 16px 18px;',
    '  border-radius: 14px; border: 3px solid #ff4fd8; background: #150c30; box-shadow: 0 0 30px rgba(255,79,216,.5);',
    '  font-family: "Courier New", Courier, monospace; color: #fff; text-align: center; }',
    '.mc-menu-panel h2 { margin: 0 0 12px; font-size: 1.1rem; letter-spacing: 3px; color: #ffe14f; text-shadow: 0 0 8px #ffe14f; }',
    '.mc-menu-panel h3 { margin: 14px 0 6px; font-size: .8rem; letter-spacing: 2px; color: #4ff0ff; }',
    '.mc-menu-items { display: flex; flex-direction: column; gap: 8px; }',
    '.mc-menu-items > * { display: block; width: 100%; margin: 0; box-sizing: border-box; text-align: center;',
    '  position: static !important; align-self: stretch !important; }',
    '.mc-menu-items > a { padding: 9px 10px; border-radius: 999px; border: 2px solid currentColor;',
    '  font: bold .8rem "Courier New", Courier, monospace; letter-spacing: 1px; text-decoration: none; }',
    '.mc-menu-items > button { padding: 9px 10px; font-size: .8rem; }',
    '.mc-menu-help { font-size: .78rem; line-height: 1.5; letter-spacing: 1px; color: #ffe14f; }',
    '.mc-menu-help > * { display: block !important; margin: 0 !important; text-align: center; }',
    '.mc-turn { position: fixed; z-index: 65; transform: translate(-50%, -50%); display: flex; align-items: center; gap: 10px;',
    '  max-width: calc(100vw - 32px); padding: 8px 16px; border-radius: 999px; border: 2px solid rgba(255,255,255,.3);',
    '  background: rgba(10,6,24,.5); color: #fff; font: bold .78rem/1.3 "Courier New", Courier, monospace; letter-spacing: 1px;',
    '  text-align: left; pointer-events: none; }',
    '.mc-turn[hidden] { display: none; }',
    '.mc-turn svg { width: 26px; height: 26px; flex: none; animation: mc-turn 2.6s ease-in-out 4; }',
    '@keyframes mc-turn { 0%, 25% { transform: rotate(0); } 55%, 100% { transform: rotate(-90deg); } }',
    '.mc-menu-close { margin-top: 14px; padding: 8px 22px; border-radius: 999px; border: 2px solid #b9b0e0;',
    '  background: transparent; color: #fff; font: bold .8rem "Courier New", Courier, monospace; letter-spacing: 2px; cursor: pointer; }',
  ].join('\n');

  // keep taps on the menu away from games that treat the whole page as their jump button
  function shield(el) {
    ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'click'].forEach(function (ev) {
      el.addEventListener(ev, function (e) { e.stopPropagation(); });
    });
  }

  function isOpen() { return !!panel && !panel.hidden; }
  function open() { if (!panel) return; panel.hidden = false; btn.classList.remove('nudge'); }
  function close() { if (!panel) return; panel.hidden = true; btn.blur(); }

  // Back to the arcade: inside the launcher's game frame, ask it to close the game (so full
  // screen stays on); opened on its own, just go to the launcher page.
  function backToArcade() {
    if (global.parent !== global) { global.parent.postMessage({ mc: 'back' }, '*'); return; }
    var back = document.getElementById('back');
    global.location.href = back ? back.href : '../../launcher/index.html';
  }

  // the first frame (in data-frame's order) that is showing, and its index
  function shownFrame() {
    for (var i = 0; i < frames.length; i++) if (frames[i] && frames[i].getBoundingClientRect().width > 0) return i;
    return -1;
  }
  function place() {
    var i = shownFrame();
    if (i < 0) { btn.style.display = 'none'; return; }
    var r = frames[i].getBoundingClientRect();
    var at = ats[Math.min(i, ats.length - 1)];
    var size = Math.round(Math.max(24, Math.min(40, r.width * 0.036)));
    var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
    btn.style.display = '';
    btn.style.width = btn.style.height = size + 'px';
    btn.style.fontSize = Math.round(size * 0.6) + 'px';
    btn.style.left = clamp(r.left + (at[0] || 0) * r.width, r.left + 8, r.right - 8 - size) + 'px';
    btn.style.top = clamp(r.top + (at[1] || 0) * r.height, r.top + 8, r.bottom - 8 - size) + 'px';
    // upright window, wide game, and room above it: suggest turning the tablet
    var showTurn = !fillsPortrait && global.innerHeight > global.innerWidth && r.width > r.height * 1.25 && r.top >= 56;
    if (turn) {
      // only write `hidden` when it changes: the MutationObserver in setup() calls place() on
      // every `hidden` write, so writing it each time loops forever and freezes the page
      if (turn.hidden !== !showTurn) turn.hidden = !showTurn;
      if (showTurn) { turn.style.left = (r.left + r.width / 2) + 'px'; turn.style.top = (r.top / 2) + 'px'; }
    }
  }

  function setup() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    frames = frameSel.split(',').map(function (sel) { return document.querySelector(sel.trim()); });

    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-menu-btn';
    btn.setAttribute('aria-label', 'Menu');
    btn.innerHTML = '&#9776;';
    btn.addEventListener('click', function () { if (isOpen()) close(); else open(); });
    shield(btn);

    panel = document.createElement('div');
    panel.className = 'mc-menu-back';
    panel.hidden = true;
    var box = document.createElement('div');
    box.className = 'mc-menu-panel';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Menu');
    var title = document.createElement('h2');
    title.textContent = 'MENU';
    var items = document.createElement('div');
    items.className = 'mc-menu-items';
    box.appendChild(title);
    box.appendChild(items);

    // everything that used to sit outside the frame moves in here
    var back = document.getElementById('back');
    if (back) {
      items.appendChild(back);
      back.addEventListener('click', function (e) { e.preventDefault(); backToArcade(); });
    }
    var bar = document.getElementById('topbar');
    if (bar) {
      while (bar.firstChild) {
        var c = bar.firstChild;
        if (c.nodeType === 1) items.appendChild(c); else bar.removeChild(c);
      }
      bar.parentNode.removeChild(bar);
    }
    Array.prototype.forEach.call(document.querySelectorAll('.mc-full-btn, .mt-toggle'), function (el) {
      el.classList.remove('corner', 'left', 'right');
      items.appendChild(el);
    });
    var hint = document.getElementById('hint');
    if (hint) {
      var h3 = document.createElement('h3');
      h3.textContent = 'HOW TO PLAY';
      var help = document.createElement('div');
      help.className = 'mc-menu-help';
      help.appendChild(hint);
      box.appendChild(h3);
      box.appendChild(help);
    }
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'mc-menu-close';
    x.textContent = 'CLOSE';
    x.addEventListener('click', close);
    box.appendChild(x);
    panel.appendChild(box);
    shield(panel);
    // tapping the dark area around the panel closes it too
    panel.addEventListener('click', function (e) { if (e.target === panel) close(); });

    document.body.appendChild(panel);
    document.body.appendChild(btn);

    turn = document.createElement('div');
    turn.className = 'mc-turn';
    turn.hidden = true;
    turn.setAttribute('aria-hidden', 'true');
    turn.innerHTML = '<svg viewBox="0 0 24 24"><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" fill="none" stroke="#4ff0ff" stroke-width="2"/>' +
      '<circle cx="12" cy="18.2" r="1.1" fill="#4ff0ff"/></svg><span>TURN ME SIDEWAYS FOR A BIGGER PICTURE</span>';
    document.body.appendChild(turn);

    // touchpad.js points at its toggle when someone taps the game with controls off;
    // the toggle is in the menu now, so the ☰ button does the pointing
    var tog = items.querySelector('.mt-toggle');
    if (tog && global.MutationObserver) {
      new MutationObserver(function () {
        if (tog.classList.contains('nudge') && !isOpen()) btn.classList.add('nudge');
      }).observe(tog, { attributes: true, attributeFilter: ['class'] });
    }

    global.addEventListener('keydown', function (e) {
      if (isOpen() && (e.key === 'Escape' || e.key === 'Esc')) { e.stopPropagation(); e.preventDefault(); close(); }
    }, true);
    global.addEventListener('resize', place);
    global.addEventListener('scroll', place, true);
    document.addEventListener('fullscreenchange', place);
    if (global.ResizeObserver) {
      var ro = new ResizeObserver(place);
      frames.forEach(function (f) { if (f) ro.observe(f); });
    }
    // screens that swap in and out (Kart's menus) change which frame is showing
    if (global.MutationObserver) new MutationObserver(place).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'hidden'] });
    place();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  global.MickleMenu = { open: open, close: close, isOpen: isOpen, backToArcade: backToArcade };
})(window);
