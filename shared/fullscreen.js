// Full screen for MickleCade pages. Browsers only allow full screen after a tap or key
// press, and drop it whenever you go to another page (launcher -> game -> launcher). So this
// remembers that you wanted it (micklecade.fullscreen, shared by every page) and goes back
// to full screen on your first tap or key press on each page.
//
// Plain <script src="../../shared/fullscreen.js"></script> -- no modules, works from file://.
// It adds a FULL SCREEN button by itself: inside #topbar if the page has one, otherwise in
// the top-right corner (data-corner="left" on the script tag puts it top-left instead).
// While in full screen, <html> gets the class "mc-full" and --mc-max is lifted, so a game
// whose width is min(100%, var(--mc-max, 720px), ...) grows to fill the screen.
// The home-screen icon opens as an app window (manifest display: standalone), where this
// button still works -- so full screen can always be left from the ☰ menu. A shortcut made
// while the manifest said "fullscreen" can't be taken out of full screen by a page, so the
// button hides itself there (re-add the shortcut to get it back).
(function (global) {
  var KEY = 'micklecade.fullscreen';
  var root = document.documentElement;
  var script = document.currentScript;
  var corner = (script && script.getAttribute('data-corner')) || 'right';
  var leaving = false;
  var btn = null;

  var CSS = [
    ':root.mc-full { --mc-max: 100000px; }',
    ':root.mc-full body { width: 100%; }',
    '.mc-full-btn { font: bold 0.7rem "Courier New", Courier, monospace; letter-spacing: 1px; padding: 5px 10px;',
    '  border-radius: 999px; border: 2px solid #ff4fd8; background: rgba(10,6,24,.8); color: #ff4fd8; cursor: pointer;',
    '  touch-action: manipulation; white-space: nowrap; -webkit-tap-highlight-color: transparent; }',
    '.mc-full-btn.corner { position: fixed; top: max(6px, env(safe-area-inset-top)); z-index: 60; }',
    '.mc-full-btn.right { right: max(6px, env(safe-area-inset-right)); }',
    '.mc-full-btn.left { left: max(6px, env(safe-area-inset-left)); }',
    '.mc-full-btn.on { border-color: #4ff0ff; color: #4ff0ff; }',
    '.mc-full-btn[hidden] { display: none; }',
  ].join('\n');

  function supported() { return !!(root.requestFullscreen || root.webkitRequestFullscreen); }
  function apiFull() { return !!(document.fullscreenElement || document.webkitFullscreenElement); }
  function appFull() { return !!(global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches); }
  function isFull() { return apiFull() || appFull(); }
  function wanted() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  function setWanted(v) { try { localStorage.setItem(KEY, v ? 'on' : 'off'); } catch (e) {} }

  function quiet(p) { if (p && p.catch) p.catch(function () {}); }
  function enter() {
    var f = root.requestFullscreen || root.webkitRequestFullscreen;
    if (!f) return;
    try { quiet(f.call(root, { navigationUI: 'hide' })); } catch (e) {}
  }
  function exit() {
    var f = document.exitFullscreen || document.webkitExitFullscreen;
    if (!f || !apiFull()) return;
    try { quiet(f.call(document)); } catch (e) {}
  }

  function sync() {
    root.classList.toggle('mc-full', isFull());
    if (!btn) return;
    btn.hidden = !supported() || appFull();
    btn.classList.toggle('on', apiFull());
    btn.textContent = apiFull() ? 'EXIT FULL SCREEN' : '⛶ FULL SCREEN';
    // games that size their canvas on resize get a nudge once the screen has changed size
    global.dispatchEvent(new Event('resize'));
  }

  function onChange() {
    sync();
    // Left full screen with Esc or the back gesture? Then stop bringing it back -- unless the
    // page is just going away (moving to another page drops full screen too).
    if (!apiFull()) setTimeout(function () { if (!leaving && !apiFull()) setWanted(false); }, 400);
  }

  function addButton() {
    if (btn) return;
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mc-full-btn';
    btn.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (apiFull()) { setWanted(false); exit(); } else { setWanted(true); enter(); }
      btn.blur();
    });
    var bar = document.getElementById('topbar');
    if (bar) bar.appendChild(btn);
    else { btn.classList.add('corner', corner); document.body.appendChild(btn); }
    sync();
  }

  // first tap or key press on a page goes back to full screen if you had it on
  function onGesture(e) {
    if (btn && e.target === btn) return;
    if (wanted() && !isFull() && supported()) enter();
  }
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  document.addEventListener('fullscreenchange', onChange);
  document.addEventListener('webkitfullscreenchange', onChange);
  global.addEventListener('pagehide', function () { leaving = true; });

  if (document.body) addButton();
  else document.addEventListener('DOMContentLoaded', addButton);

  global.MickleFull = { isFull: isFull, enter: enter, exit: exit };
})(window);
