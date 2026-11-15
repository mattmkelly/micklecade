// Shared gamepad bridge for MickleCade games. Tuned for an Xbox 360 controller
// (the W3C "standard" gamepad mapping), but any pad Chrome maps to "standard"
// lines up the same way.
//
// Plain <script src="../../shared/gamepad.js"> before game.js -- no modules,
// works from file://. Call Pad360.poll() once per animation frame (usually at
// the top of the game's own loop()), then read buttons/axes from anywhere
// else that frame.
//
// Pad360.down/pressed/dx/... read the first controller. For same-screen
// multiplayer, Pad360.pad(i) gives the i-th connected controller (0 = first)
// with the same down/pressed/released/axis/dx/dy/dxPressed/dyPressed/connected
// calls, and Pad360.count() says how many are plugged in.
(function (global) {
  var BTN = {
    A: 0, B: 1, X: 2, Y: 3,
    LB: 4, RB: 5, LT: 6, RT: 7,
    BACK: 8, START: 9, LS: 10, RS: 11,
    UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16,
  };
  var DEADZONE = 0.4;
  var MAX = 4;

  function makeState() {
    return { on: false, curr: [], prev: [], axes: [0, 0, 0, 0], dx: 0, dy: 0, dxEdge: 0, dyEdge: 0 };
  }
  var states = [];
  for (var n = 0; n < MAX; n++) states.push(makeState());

  function connectedPads() {
    var pads = (navigator.getGamepads && navigator.getGamepads()) || [];
    var out = [];
    for (var i = 0; i < pads.length; i++) if (pads[i]) out.push(pads[i]);
    return out;
  }

  function update(s, pad) {
    s.prev = s.curr;
    s.on = !!pad;
    if (!pad) {
      s.curr = []; s.axes = [0, 0, 0, 0];
    } else {
      s.curr = pad.buttons.map(function (b) { return b.pressed || b.value > 0.5; });
      s.axes = pad.axes;
    }
    var d = function (i) { return !!s.curr[i]; };
    var ax = function (i) { var v = s.axes[i] || 0; return Math.abs(v) > DEADZONE ? v : 0; };
    var dx = (d(BTN.LEFT) || ax(0) < 0 ? -1 : 0) + (d(BTN.RIGHT) || ax(0) > 0 ? 1 : 0);
    var dy = (d(BTN.UP) || ax(1) < 0 ? -1 : 0) + (d(BTN.DOWN) || ax(1) > 0 ? 1 : 0);
    s.dxEdge = (dx !== 0 && s.dx === 0) ? dx : 0;
    s.dyEdge = (dy !== 0 && s.dy === 0) ? dy : 0;
    s.dx = dx;
    s.dy = dy;
  }

  function api(s) {
    return {
      down: function (i) { return !!s.curr[i]; },
      pressed: function (i) { return !!s.curr[i] && !s.prev[i]; },
      released: function (i) { return !s.curr[i] && !!s.prev[i]; },
      axis: function (i) {
        var v = s.axes[i] || 0;
        return Math.abs(v) > DEADZONE ? v : 0;
      },
      // Continuous -1/0/1 steer (D-pad or left stick) -- for movement held each frame.
      dx: function () { return s.dx; },
      dy: function () { return s.dy; },
      // Edge-triggered -1/0/1 -- fires once per nudge, for menu navigation.
      dxPressed: function () { return s.dxEdge; },
      dyPressed: function () { return s.dyEdge; },
      connected: function () { return s.on; },
    };
  }
  var apis = states.map(api);

  function poll() {
    var pads = connectedPads();
    for (var i = 0; i < MAX; i++) update(states[i], pads[i] || null);
  }

  var first = apis[0];
  global.Pad360 = {
    BTN: BTN,
    poll: poll,
    down: first.down,
    pressed: first.pressed,
    released: first.released,
    axis: first.axis,
    dx: first.dx,
    dy: first.dy,
    dxPressed: first.dxPressed,
    dyPressed: first.dyPressed,
    connected: function () { return !!connectedPads()[0]; },
    pad: function (i) { return apis[i] || apis[0]; },
    count: function () { return connectedPads().length; },
  };
})(window);
