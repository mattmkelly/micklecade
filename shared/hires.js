// Shared hi-res canvas helper for MickleCade games. Games keep drawing in their
// fixed 480x270 coordinates; this sizes the canvas's real pixel buffer to match
// the screen (2x, 3x... on big or high-DPI screens) and scales the context, so
// text, circles and edges come out sharp instead of as stretched pixels.
//
// Plain <script src="../../shared/hires.js"> before game.js -- no modules, works
// from file://. In game.js:
//   const ctx = HiRes.setup(canvas, W, H);            // or
//   const ctx = HiRes.setup(canvas, W, H, (c) => { c.textBaseline = 'middle'; });
// The optional callback re-applies any context state the game sets once up front,
// because resizing the buffer (when the canvas's size changes) resets all context state.
(function (global) {
  var MAX_SCALE = 4;

  function setup(canvas, w, h, onReset) {
    var ctx = canvas.getContext('2d');
    var scale = 1;

    // The transform doesn't apply to shadows, so scale glow sizes by hand --
    // otherwise every shadowBlur would shrink as the buffer grows.
    ['shadowBlur', 'shadowOffsetX', 'shadowOffsetY'].forEach(function (prop) {
      var desc = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, prop);
      Object.defineProperty(ctx, prop, {
        get: function () { return desc.get.call(ctx) / scale; },
        set: function (v) { desc.set.call(ctx, v * scale); },
      });
    });

    function fit(force) {
      var dpr = global.devicePixelRatio || 1;
      var shown = canvas.clientWidth || w;
      // Whole-number scales keep tiles drawn edge to edge from showing seams.
      var s = Math.max(1, Math.min(MAX_SCALE, Math.round(shown * dpr / w)));
      if (s === scale && !force) return;
      scale = s;
      canvas.width = w * s;  // resets all context state
      canvas.height = h * s;
      ctx.setTransform(s, 0, 0, s, 0, 0);
      ctx.imageSmoothingEnabled = false;
      if (onReset) onReset(ctx);
    }

    fit(true);
    // Watch the canvas itself, not just the window: a canvas that starts hidden (a menu
    // screen) or is still being laid out gets re-measured once it has a real size.
    if (global.ResizeObserver) new ResizeObserver(function () { fit(false); }).observe(canvas);
    else global.addEventListener('resize', function () { fit(false); });
    return ctx;
  }

  global.HiRes = { setup: setup };
})(window);
