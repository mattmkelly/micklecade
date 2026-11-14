// Full screen for MickleCade pages. Browsers only allow full screen after a tap or key
// press, and drop it whenever you go to another page. So the launcher opens games over
// itself in an iframe (see launcher/index.html) and keeps full screen the whole time, and
// this file remembers that you wanted it (micklecade.fullscreen, shared by every page) and
// goes back to full screen on your first tap or key press on a page you went to directly.
//
// Plain <script src="../../shared/fullscreen.js"></script> -- no modules, works from file://.
// It adds a FULL SCREEN button by itself: inside #topbar if the page has one, otherwise in
// the top-right corner (data-corner="left" on the script tag puts it top-left instead).
// While in full screen, <html> gets the class "mc-full".
// Inside the launcher's game frame, full screen belongs to the launcher: the button asks it
// to switch (postMessage { mc: 'fullscreen', on }) and shows what it reports back.
// The home-screen icon opens as an app window (manifest display: standalone), where this
// button still works -- so full screen can always be left from the ☰ menu. A shortcut made
// while the manifest said "fullscreen" can't be taken out of full screen by a page, so the
// button hides itself there (re-add the shortcut to get it back).
(function (global) {
  var KEY = 'micklecade.fullscreen';
  var root = document.documentElement;
  var script = document.currentScript;
  var corner = (script && script.getAttribute('data-corner')) || 'right';
  var embedded = global.parent !== global;   // a game running inside the launcher
  var host = { full: false, can: true };       // the launcher's full screen, when embedded
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
  // Full screen we didn't ask for and can't undo: an old fullscreen home-screen shortcut, or
  // F11. Chrome and the Fire tablet's Silk also report display-mode: fullscreen while *we*
  // are full screen, so that case doesn't count -- otherwise EXIT FULL SCREEN would vanish.
  function appFull() {
    return !apiFull() && !!(global.matchMedia && global.matchMedia('(display-mode: fullscreen)').matches);
  }
  function isFull() { return embedded ? host.full : apiFull() || appFull(); }
  // full screen we switched on, so the button can switch it off again
  function ownFull() { return embedded ? host.full : apiFull(); }
  function canSwitch() { return embedded ? host.can : supported() && !appFull(); }
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
  // turn full screen on or off and remember it (the launcher does this for its game frame)
  function set(on) {
    if (embedded) { global.parent.postMessage({ mc: 'fullscreen', on: !!on }, '*'); return; }
    setWanted(on);
    if (on) enter(); else exit();
  }

  function sync() {
    root.classList.toggle('mc-full', isFull());
    if (!btn) return;
    btn.hidden = !canSwitch();
    btn.classList.toggle('on', ownFull());
    btn.textContent = ownFull() ? 'EXIT FULL SCREEN' : '⛶ FULL SCREEN';
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
      set(!ownFull());
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
    if (wanted() && !isFull() && canSwitch()) set(true);
  }
  document.addEventListener('pointerdown', onGesture, true);
  document.addEventListener('keydown', onGesture, true);
  if (embedded) {
    global.addEventListener('message', function (e) {
      if (e.source !== global.parent || !e.data || e.data.mc !== 'fs') return;
      host.full = !!e.data.full;
      host.can = e.data.can !== false;
      sync();
    });
    global.parent.postMessage({ mc: 'hello' }, '*');
  } else {
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
    global.addEventListener('pagehide', function () { leaving = true; });
  }

  if (document.body) addButton();
  else document.addEventListener('DOMContentLoaded', addButton);

  global.MickleFull = { isFull: isFull, canSwitch: canSwitch, enter: enter, exit: exit, set: set };
})(window);
