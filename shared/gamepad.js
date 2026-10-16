// Shared gamepad bridge for MickleCade games. Tuned for an Xbox 360 controller
// (the W3C "standard" gamepad mapping), but any pad Chrome maps to "standard"
// lines up the same way.
//
// Plain <script src="../../shared/gamepad.js"> before game.js -- no modules,
// works from file://. Call Pad360.poll() once per animation frame (usually at
// the top of the game's own loop()), then read buttons/axes from anywhere
// else that frame.
(function (global) {
  var BTN = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5, LT: 6, RT: 7,
    BACK: 8, START: 9, LS: 10, RS: 11,
    UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16,
  };
  var DEADZONE = 0.4;

  var curr = [];
  var prev = [];
  var axes = [0, 0, 0, 0];
  var dxVal = 0, dyVal = 0, dxEdge = 0, dyEdge = 0, prevDxVal = 0, prevDyVal = 0;

  function firstPad() {
    var pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    for (var i = 0; i < pads.length; i++) if (pads[i]) return pads[i];
    return null;
  }

  function down(i) { return !!curr[i]; }
  function pressed(i) { return !!curr[i] && !prev[i]; }
  function released(i) { return !curr[i] && !!prev[i]; }
  function axis(i) {
    var v = axes[i] || 0;
    return Math.abs(v) > DEADZONE ? v : 0;
  }

  function computeDx() { return (down(BTN.LEFT) || axis(0) < 0 ? -1 : 0) + (down(BTN.RIGHT) || axis(0) > 0 ? 1 : 0); }
  function computeDy() { return (down(BTN.UP) || axis(1) < 0 ? -1 : 0) + (down(BTN.DOWN) || axis(1) > 0 ? 1 : 0); }

  function poll() {
    prev = curr;
    var pad = firstPad();
    if (!pad) {
      curr = []; axes = [0, 0, 0, 0];
    } else {
      curr = pad.buttons.map(function (b) { return b.pressed || b.value > 0.5; });
      axes = pad.axes;
    }
    dxVal = computeDx();
    dyVal = computeDy();
    dxEdge = (dxVal !== 0 && prevDxVal === 0) ? dxVal : 0;
    dyEdge = (dyVal !== 0 && prevDyVal === 0) ? dyVal : 0;
    prevDxVal = dxVal;
    prevDyVal = dyVal;
  }

  global.Pad360 = {
    BTN: BTN,
    poll: poll,
    down: down,
    pressed: pressed,
    released: released,
    axis: axis,
    // Continuous -1/0/1 steer (D-pad or left stick) -- for movement held each frame.
    dx: function () { return dxVal; },
    dy: function () { return dyVal; },
    // Edge-triggered -1/0/1 -- fires once per nudge, for menu navigation.
    dxPressed: function () { return dxEdge; },
    dyPressed: function () { return dyEdge; },
    connected: function () { return !!firstPad(); },
  };
})(window);
