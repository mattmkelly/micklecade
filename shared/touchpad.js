// Optional on-screen touch controls for MickleCade games, laid out for holding a tablet:
// a thumbstick in the bottom-left corner of the screen and big action buttons in the
// bottom-right. They float over the game (no space taken) and are OFF until someone turns
// them on with the "TOUCH CONTROLS" toggle; the choice is remembered for every game.
//
// Plain <script src="../../shared/touchpad.js"> before game.js -- no modules, works from file://.
//   const pad = MickleTouch.create({
//     toggleParent: document.getElementById('topbar'),   // where the ON/OFF toggle goes
//     buttons: [{ id: 'hop', label: 'HOP' }],            // bottom-right, first one lowest
//     onPress(id) {}, onRelease(id) {},                  // a button went down / up
//     onStep(dx) {},                                     // the stick was nudged left/right (-1 / 1), for menus
//   });
//   pad.dx()          // -1 / 0 / 1 while the stick is held left / centre / right
//   pad.down('hop')   // is that button held?
// Touches on the controls never reach the page, so "tap anywhere" game handlers are safe.
(function (global) {
  var KEY = 'micklecade.touchControls';
  var DEAD = 0.35;

  var CSS = [
    '.mt-toggle { font: bold 0.7rem "Courier New", Courier, monospace; letter-spacing: 1px; padding: 5px 10px;',
    '  border-radius: 999px; border: 2px solid #4ff0ff; background: rgba(10,6,24,.8); color: #4ff0ff; cursor: pointer;',
    '  touch-action: manipulation; white-space: nowrap; }',
    '.mt-toggle.on { border-color: #ffe14f; color: #ffe14f; }',
    '.mt-toggle.nudge { animation: mt-nudge .6s ease-in-out 4; }',
    '@keyframes mt-nudge { 50% { box-shadow: 0 0 16px #ffe14f; border-color: #ffe14f; color: #ffe14f; } }',
    '.mt-layer { position: fixed; inset: 0; pointer-events: none; z-index: 50; }',
    '.mt-layer[hidden] { display: none; }',
    '.mt-stick, .mt-btn { position: absolute; pointer-events: auto; touch-action: none;',
    '  -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }',
    '.mt-stick { left: max(14px, env(safe-area-inset-left)); bottom: max(14px, env(safe-area-inset-bottom));',
    '  width: 128px; height: 128px; border-radius: 50%; background: rgba(79,240,255,.12); border: 3px solid rgba(79,240,255,.55); }',
    '.mt-knob { position: absolute; left: 50%; top: 50%; width: 58px; height: 58px; margin: -29px 0 0 -29px; border-radius: 50%;',
    '  background: rgba(79,240,255,.45); border: 3px solid #4ff0ff; box-shadow: 0 0 12px rgba(79,240,255,.6); }',
    '.mt-btn { right: max(18px, env(safe-area-inset-right)); width: 96px; height: 96px; border-radius: 50%;',
    '  background: rgba(255,225,79,.18); border: 3px solid rgba(255,225,79,.8); color: #ffe14f;',
    '  font: bold 1rem "Courier New", Courier, monospace; letter-spacing: 1px; display: flex; align-items: center; justify-content: center;',
    '  text-shadow: 0 0 8px #ffe14f; }',
    '.mt-btn.down { background: rgba(255,225,79,.45); transform: scale(.94); }',
  ].join('\n');

  function injectCss() {
    if (document.getElementById('mt-css')) return;
    var style = document.createElement('style');
    style.id = 'mt-css';
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  function loadOn() { try { return localStorage.getItem(KEY) === 'on'; } catch (e) { return false; } }
  function saveOn(on) { try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {} }

  function create(opts) {
    opts = opts || {};
    injectCss();
    var on = loadOn();
    var stickX = 0;
    var held = {};

    var layer = document.createElement('div');
    layer.className = 'mt-layer';

    // ---- thumbstick ----
    var stick = document.createElement('div');
    stick.className = 'mt-stick';
    var knob = document.createElement('div');
    knob.className = 'mt-knob';
    stick.appendChild(knob);
    layer.appendChild(stick);
    var stickPointer = null;

    function moveStick(e) {
      var r = stick.getBoundingClientRect();
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2, max = r.width / 2 - 14;
      var x = e.clientX - cx, y = e.clientY - cy;
      var len = Math.sqrt(x * x + y * y);
      if (len > max) { x *= max / len; y *= max / len; }
      knob.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      var prev = stickX;
      var nx = x / max;
      stickX = nx < -DEAD ? -1 : nx > DEAD ? 1 : 0;
      if (stickX && stickX !== prev && opts.onStep) opts.onStep(stickX);
    }
    function releaseStick() {
      stickPointer = null;
      stickX = 0;
      knob.style.transform = '';
    }
    stick.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      e.stopPropagation();
      stickPointer = e.pointerId;
      try { stick.setPointerCapture(e.pointerId); } catch (err) {}
      moveStick(e);
    });
    stick.addEventListener('pointermove', function (e) {
      if (e.pointerId === stickPointer) moveStick(e);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
      stick.addEventListener(ev, function (e) {
        e.stopPropagation();
        if (e.pointerId === stickPointer) releaseStick();
      });
    });

    // ---- buttons (first one lowest, the rest stacked above it) ----
    (opts.buttons || []).forEach(function (b, i) {
      var el = document.createElement('div');
      el.className = 'mt-btn';
      el.textContent = b.label;
      el.style.bottom = 'calc(max(22px, env(safe-area-inset-bottom)) + ' + (i * 108) + 'px)';
      var pid = null;
      el.addEventListener('pointerdown', function (e) {
        e.preventDefault();
        e.stopPropagation();
        pid = e.pointerId;
        try { el.setPointerCapture(e.pointerId); } catch (err) {}
        held[b.id] = true;
        el.classList.add('down');
        if (opts.onPress) opts.onPress(b.id);
      });
      ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (ev) {
        el.addEventListener(ev, function (e) {
          e.stopPropagation();
          if (e.pointerId !== pid) return;
          pid = null;
          if (!held[b.id]) return;
          held[b.id] = false;
          el.classList.remove('down');
          if (opts.onRelease) opts.onRelease(b.id);
        });
      });
      layer.appendChild(el);
    });
    document.body.appendChild(layer);

    // ---- ON / OFF toggle ----
    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'mt-toggle';
    toggle.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      setOn(!on);
      toggle.blur();
    });
    (opts.toggleParent || document.body).appendChild(toggle);

    function setOn(v) {
      on = v;
      saveOn(on);
      layer.hidden = !on;
      toggle.classList.toggle('on', on);
      toggle.classList.remove('nudge');
      toggle.textContent = 'TOUCH CONTROLS: ' + (on ? 'ON' : 'OFF');
      if (!on) { releaseStick(); held = {}; }
    }
    setOn(on);

    // Someone touched the game with the controls off: point at the toggle (once a visit).
    var nudged = false;
    document.addEventListener('pointerdown', function (e) {
      if (on || nudged || e.pointerType !== 'touch') return;
      nudged = true;
      toggle.classList.add('nudge');
    }, true);

    return {
      dx: function () { return on ? stickX : 0; },
      down: function (id) { return on && !!held[id]; },
      enabled: function () { return on; },
    };
  }

  global.MickleTouch = { create: create };
})(window);
