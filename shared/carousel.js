// Shared Xbox 360-style card carousel for MickleCade's HTML menus (the launcher's game
// shelf, Freddy Bear Kart's tracks and garage). A row of cards scrolls sideways; the
// card nearest the middle is "selected" and the others tilt and fade away from it.
//
// Plain <script src="../../shared/carousel.js"> -- no modules, works from file://.
//   const c = MickleCarousel.create(stripEl, {
//     onSelect(i, card) {},        // the middle card changed
//     onActivate(i, card, e) {},   // the middle card was tapped (not one of its buttons)
//     start: 0,                    // card to open on
//     wheel: window,               // where the mouse wheel steps it (default: the strip)
//   });
//   c.step(1); c.goTo(3); c.selected(); c.items(); c.refresh();  // refresh after re-rendering cards
// Every element child of the strip is a card. Size the cards with `--mc-card-w` on the
// strip; style `.selected` for the middle card. The strip must be visible when it's
// created or refreshed (call refresh() after showing a hidden screen).
//
// The strip is a plain horizontal scroller (so swiping works on tablets) that this script
// snaps to the nearest card once scrolling stops. CSS scroll-snap isn't used because
// Firefox snaps to the tilted (transformed) boxes and leaves cards off-center. Tapping a
// side card slides it to the middle instead of pressing it; focusing a card does too.
(function (global) {
  var CSS = [
    '.mc-strip { display: flex; align-items: center; overflow-x: auto; overflow-y: hidden;',
    '  scrollbar-width: none; perspective: 1200px; touch-action: pan-x; --mc-card-w: 260px; }',
    '.mc-strip::-webkit-scrollbar { display: none; }',
    /* Half-width spacers so the first and last cards can reach the middle. Real, full-height
       flex items rather than side padding: Firefox leaves end padding (and zero-height boxes)
       out of a flex scroller's scroll range, which stopped the last cards short of center. */
    '.mc-strip::before, .mc-strip::after { content: ""; flex: 0 0 calc(50% - var(--mc-card-w) / 2); align-self: stretch; }',
    '.mc-strip > .mc-card { --d: 0; --ad: 0; flex: 0 0 var(--mc-card-w); position: relative;',
    '  transform: translateX(calc(var(--d) * -14%)) rotateY(calc(var(--d) * -22deg))',
    '    scale(calc(1.08 - min(var(--ad), 2) * 0.17));',
    '  opacity: calc(1 - min(var(--ad), 3) * 0.25); z-index: calc(10 - var(--zi, 0)); will-change: transform; }',
    '.mc-strip > .mc-card:focus { outline: none; }',
  ].join('\n');

  function injectCss() {
    if (document.getElementById('mc-carousel-css')) return;
    var style = document.createElement('style');
    style.id = 'mc-carousel-css';
    style.textContent = CSS;
    document.head.insertBefore(style, document.head.firstChild);
  }

  function create(strip, opts) {
    opts = opts || {};
    injectCss();
    strip.classList.add('mc-strip');

    var items = [];
    var selected = -1;
    var gliding = false;   // true while a goTo() scroll is in flight, so it keeps the selection
    var fingerDown = false;
    var settleTimer = 0;

    function collect() {
      items = Array.prototype.filter.call(strip.children, function (el) { return el.nodeType === 1; });
      items.forEach(function (el) { el.classList.add('mc-card'); });
    }

    function visible() { return strip.offsetParent !== null && strip.clientWidth > 0; }

    function centerOf(el) { return el.offsetLeft + el.offsetWidth / 2; }

    // Tilt/shrink each card by how far it is from the middle of the strip.
    function layout() {
      if (!items.length || !visible()) return;
      var mid = strip.scrollLeft + strip.clientWidth / 2;
      var best = 0, bestDist = Infinity;
      items.forEach(function (el, i) {
        var d = (centerOf(el) - mid) / el.offsetWidth;
        el.style.setProperty('--d', d.toFixed(3));
        el.style.setProperty('--ad', Math.abs(d).toFixed(3));
        el.style.setProperty('--zi', Math.round(Math.abs(d) * 2));
        if (Math.abs(d) < bestDist) { bestDist = Math.abs(d); best = i; }
      });
      if (!gliding) select(best);
    }

    function select(i, force) {
      if (i === selected && !force) return;
      var focusInside = strip.contains(document.activeElement);
      selected = i;
      items.forEach(function (c, j) { c.classList.toggle('selected', j === i); });
      // Keep keyboard / controller focus on the middle card as it changes.
      if (focusInside && items[i] && document.activeElement !== items[i] && items[i].tabIndex >= 0) {
        items[i].focus({ preventScroll: true });
      }
      if (opts.onSelect) opts.onSelect(i, items[i]);
    }

    function goTo(i, smooth) {
      if (!items.length) return;
      i = Math.max(0, Math.min(items.length - 1, i));
      if (visible()) {
        strip.scrollTo({
          left: centerOf(items[i]) - strip.clientWidth / 2,
          behavior: smooth === false ? 'auto' : 'smooth',
        });
        gliding = true;
        settle();
      }
      select(i);
    }

    function step(dir) { goTo(selected + dir); }

    // Once a swipe / drag / autoscroll comes to rest, glide to the nearest card.
    function settle() {
      clearTimeout(settleTimer);
      settleTimer = setTimeout(function () {
        gliding = false;
        if (fingerDown || !visible() || !items[selected]) return;
        layout();
        var off = centerOf(items[selected]) - (strip.scrollLeft + strip.clientWidth / 2);
        if (Math.abs(off) > 2) goTo(selected);
      }, 140);
    }

    // Re-read the cards (after re-rendering them) and re-center on the same index.
    function refresh(index) {
      collect();
      var i = typeof index === 'number' ? index : Math.max(0, selected);
      selected = -1;
      goTo(Math.min(i, items.length - 1), false);
      layout();
    }

    strip.addEventListener('scroll', function () { requestAnimationFrame(layout); settle(); }, { passive: true });
    strip.addEventListener('touchstart', function () { fingerDown = true; gliding = false; }, { passive: true });
    strip.addEventListener('touchend', function () { fingerDown = false; settle(); }, { passive: true });
    strip.addEventListener('touchcancel', function () { fingerDown = false; settle(); }, { passive: true });
    window.addEventListener('resize', function () { if (selected >= 0) goTo(selected, false); });

    function cardOf(target) {
      for (var el = target; el && el !== strip; el = el.parentNode) {
        if (el.parentNode === strip) return el;
      }
      return null;
    }

    // Capture phase, so a side card's own buttons don't fire until it's in the middle.
    strip.addEventListener('click', function (e) {
      var card = cardOf(e.target);
      if (!card) return;
      var i = items.indexOf(card);
      if (i !== selected) {
        e.preventDefault();
        e.stopPropagation();
        goTo(i);
        return;
      }
      var control = e.target.closest ? e.target.closest('a, button') : null;
      if ((!control || control === card) && opts.onActivate) opts.onActivate(i, card, e);
    }, true);

    strip.addEventListener('focusin', function (e) {
      var i = items.indexOf(cardOf(e.target));
      if (i !== -1 && i !== selected) goTo(i);
    });

    // Mouse wheel (vertical or horizontal) moves one card per notch.
    var wheelLock = 0;
    (opts.wheel || strip).addEventListener('wheel', function (e) {
      if (!visible() || (opts.wheelEnabled && !opts.wheelEnabled())) return;
      var delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      // Firefox reports wheel notches in lines (about 3 per notch), Chrome in pixels.
      if (e.deltaMode === 1) delta *= 16;
      else if (e.deltaMode === 2) delta *= 400;
      e.preventDefault();
      var now = performance.now();
      if (Math.abs(delta) < 4 || now < wheelLock) return;
      wheelLock = now + 220;
      step(delta > 0 ? 1 : -1);
    }, { passive: false });

    collect();
    var api = {
      strip: strip,
      items: function () { return items.slice(); },
      selected: function () { return selected; },
      goTo: goTo,
      step: step,
      refresh: refresh,
      layout: layout,
    };
    strip._mickleCarousel = api;
    if (items.length) refresh(opts.start || 0);
    return api;
  }

  // The carousel an element belongs to (the strip itself or anything inside it), or null.
  function of(el) {
    for (; el; el = el.parentNode) if (el._mickleCarousel) return el._mickleCarousel;
    return null;
  }

  global.MickleCarousel = { create: create, of: of };
})(window);
