// DreamCanvas: a pretend art studio. Pick a ground (papers, canvas, boards, a brick wall), then paint with
// watercolour, oil, acrylic, spray paint, markers or oil crayons. The paint itself lives in paint.js
// (window.DreamCanvasPaint); this file is the screens and controls. No score -- it's an art toy.
(function () {
  'use strict';
  const P = window.DreamCanvasPaint;
  const stage = document.getElementById('stage');
  const screen = document.getElementById('screen');
  const SAVE_KEY = 'dreamCanvas.save', CUR_KEY = 'dreamCanvas.current', GAL_KEY = 'dreamCanvas.gallery';
  const GAL_MAX = 8;

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  const save = load(SAVE_KEY) || {};
  save.tools = save.tools || {}; save.sizes = save.sizes || {}; save.amts = save.amts || {};
  function store() { put(SAVE_KEY, save); }

  // ---------------------------------------------------------------- what's on the shelf
  const MEDIA = [
    { id: 'water', name: 'WATERCOLOR', clear: true, size: 16, amt: 0.55, lo: 'WATERY', hi: 'STRONG',
      tools: [['brush', 'BRUSH'], ['flat', 'BIG FLAT'], ['water', 'CLEAN WATER'], ['sponge', 'SPONGE'], ['salt', 'SALT'], ['washrect', 'WASH']],
      about: 'See-through paint that flows and dries by itself. Paint into wet paint for soft blooms!' },
    { id: 'oil', name: 'OIL', size: 12, amt: 0.6, lo: 'THIN', hi: 'THICK',
      tools: [['round', 'ROUND'], ['flat', 'FLAT'], ['knife', 'KNIFE'], ['blend', 'BLEND']],
      about: 'Oil paint stays wet, so colors mix right on the picture. Pile it on thick!' },
    { id: 'acrylic', name: 'ACRYLIC', size: 12, amt: 0.75, lo: 'WATERED', hi: 'THICK',
      tools: [['round', 'ROUND'], ['flat', 'FLAT'], ['knife', 'KNIFE'], ['blend', 'BLEND']],
      about: 'Acrylic dries in a few seconds, so you can paint right over it. Water it down to see through.' },
    { id: 'spray', name: 'SPRAY', size: 26, amt: 0.3, lo: 'CLOSE', hi: 'FAR', tools: [],
      about: 'Hold the can far away for a soft mist. Hold it close and still... and it drips!' },
    { id: 'marker', name: 'MARKER', clear: true, size: 7, amt: 0.95, lo: 'DRYING OUT', hi: 'JUICY',
      tools: [['fine', 'FINE'], ['chisel', 'CHISEL'], ['brush', 'BRUSH TIP']],
      about: 'See-through ink. Go over it again to make it darker. Hold still and it soaks in.' },
    { id: 'crayon', name: 'OIL CRAYON', size: 7, amt: 0.6, lo: 'LIGHT', hi: 'PRESS HARD',
      tools: [['crayon', 'CRAYON'], ['smudge', 'SMUDGE']],
      about: 'Waxy crayon. Press hard to fill the bumps. Watercolor slides right off it!' }
  ];
  const MEDIA_BY = {}; MEDIA.forEach((m) => { MEDIA_BY[m.id] = m; });
  const WASHES = [['flat', 'FLAT WASH'], ['graded', 'GRADED'], ['two', 'TWO COLORS'], ['water', 'WET THE PAPER']];
  const WASH_ABOUT = {
    flat: 'Drag a box: the wash goes on in one even color, top to bottom.',
    graded: 'Drag a box: strong color at the top that fades away to nothing. Great for skies!',
    two: 'Drag a box: your color melts into the last color you used.',
    water: 'Drag a box of clean water, then paint into it for fuzzy wet-in-wet blooms.'
  };

  const PALETTE = [
    ['LEMON YELLOW', '#f7e23e'], ['GOLDEN YELLOW', '#f5b301'], ['ORANGE', '#f2761d'], ['RED', '#d8261f'], ['CRIMSON', '#a3143c'],
    ['PINK', '#f49ac1'], ['MAGENTA', '#cc2f7f'], ['VIOLET', '#6a3ea1'], ['ULTRAMARINE', '#2b3aa6'], ['SKY BLUE', '#4aa3df'],
    ['TURQUOISE', '#16a39b'], ['EMERALD', '#14894f'], ['LEAF GREEN', '#6fb330'], ['OLIVE', '#6b6b2a'], ['YELLOW OCHRE', '#c99a3c'],
    ['BURNT SIENNA', '#a0522d'], ['BROWN', '#5e3a22'], ['GRAY', '#7d8590'], ['BLACK', '#1b1b1d'], ['WHITE', '#fbfbf6']
  ];
  const WHITE = 19;
  function hexRGB(h) { return [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255]; }
  function rgbHex(c) { return '#' + c.map((v) => ('0' + Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16)).slice(-2)).join(''); }

  const ST = {
    medium: MEDIA_BY[save.medium] ? save.medium : 'water',
    color: typeof save.color === 'number' ? save.color : 8,
    prev: typeof save.prev === 'number' ? save.prev : 9,
    picked: save.picked || '#8a5a36',
    washMode: save.washMode || 'graded',
    eyedrop: false
  };
  function med() { return MEDIA_BY[ST.medium]; }
  function tool() { const m = med(); const t = save.tools[m.id]; return m.tools.some((x) => x[0] === t) ? t : (m.tools[0] ? m.tools[0][0] : ''); }
  function sizeOf() { const v = save.sizes[ST.medium]; return typeof v === 'number' ? v : med().size; }
  function amtOf() { const v = save.amts[ST.medium]; return typeof v === 'number' ? v : med().amt; }
  function colorHex(idx) { return idx === -1 ? ST.picked : PALETTE[idx][1]; }
  function curRGB() { return hexRGB(colorHex(ST.color)); }

  // ---------------------------------------------------------------- sizing
  function fit() {
    const tall = window.innerHeight > window.innerWidth * 1.05;
    document.documentElement.classList.toggle('tall', tall);
    const r = stage.getBoundingClientRect();
    stage.style.fontSize = ((tall ? r.width : r.height) / 30) + 'px';
    sizeArt();
  }
  window.addEventListener('resize', fit);
  if (window.ResizeObserver) new ResizeObserver(fit).observe(stage);

  // ---------------------------------------------------------------- little helpers
  let toastEl = null, toastT = 0;
  function toast(msg, ms) {
    if (!toastEl) { toastEl = document.createElement('div'); toastEl.className = 'toast hide'; stage.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.remove('hide');
    clearTimeout(toastT); toastT = setTimeout(() => toastEl.classList.add('hide'), ms || 3000);
  }
  const told = {};
  function tellOnce(key, msg) { if (told[key]) return; told[key] = 1; toast(msg, 4200); }
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  let actx = null;
  function blip(f, d, type, vol) {
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type || 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(vol || 0.06, actx.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + (d || 0.1));
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + (d || 0.1) + 0.02);
    } catch (e) { /* no audio */ }
  }
  const click = () => blip(660, 0.06);

  // icons (drawn in code). c = current colour
  function icon(id, c) {
    switch (id) {
      case 'water': return '<svg viewBox="0 0 40 40"><rect x="4" y="11" width="32" height="20" rx="3" fill="#f4f4f4" stroke="#555" stroke-width="1.4"/>' +
        '<circle cx="11" cy="17" r="3.4" fill="#e23"/><circle cx="20" cy="17" r="3.4" fill="#fc2"/><circle cx="29" cy="17" r="3.4" fill="#27c"/>' +
        '<circle cx="11" cy="25.5" r="3.4" fill="#2a5"/><circle cx="20" cy="25.5" r="3.4" fill="' + c + '"/><circle cx="29" cy="25.5" r="3.4" fill="#843"/></svg>';
      case 'oil': return '<svg viewBox="0 0 40 40"><path d="M9 14h19l5 3v6l-5 3H9z" fill="#ddd" stroke="#555" stroke-width="1.4"/><rect x="11" y="16" width="13" height="8" fill="' + c + '"/>' +
        '<rect x="33" y="17.5" width="4" height="5" fill="#333"/><path d="M9 14v12l-3-1V15z" fill="#bbb" stroke="#555" stroke-width="1.2"/></svg>';
      case 'acrylic': return '<svg viewBox="0 0 40 40"><rect x="10" y="8" width="20" height="6" rx="1.5" fill="#333"/><path d="M11 14h18v17a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3z" fill="#eee" stroke="#555" stroke-width="1.4"/>' +
        '<rect x="12.5" y="20" width="15" height="12.5" rx="1.5" fill="' + c + '"/></svg>';
      case 'spray': return '<svg viewBox="0 0 40 40"><rect x="14" y="13" width="13" height="23" rx="3" fill="' + c + '" stroke="#444" stroke-width="1.4"/><rect x="16" y="8" width="9" height="5" fill="#bbb" stroke="#444" stroke-width="1.2"/>' +
        '<rect x="18" y="5" width="5" height="3" fill="#333"/><circle cx="12" cy="6" r="1" fill="' + c + '"/><circle cx="9" cy="4" r="1.1" fill="' + c + '"/><circle cx="8" cy="8" r=".9" fill="' + c + '"/><circle cx="5" cy="5.5" r=".8" fill="' + c + '"/>' +
        '<rect x="14" y="19" width="13" height="7" fill="rgba(255,255,255,.55)"/></svg>';
      case 'marker': return '<svg viewBox="0 0 40 40"><g transform="rotate(-40 20 20)"><rect x="8" y="16" width="20" height="8" rx="2" fill="#f4f4f4" stroke="#555" stroke-width="1.4"/>' +
        '<rect x="28" y="16" width="5" height="8" fill="' + c + '" stroke="#555" stroke-width="1.2"/><path d="M33 17.5l4 2.5-4 2.5z" fill="' + c + '"/><rect x="8" y="16" width="5" height="8" fill="' + c + '"/></g></svg>';
      case 'crayon': return '<svg viewBox="0 0 40 40"><g transform="rotate(-40 20 20)"><rect x="6" y="16" width="24" height="8" rx="1" fill="' + c + '" stroke="#444" stroke-width="1.2"/>' +
        '<rect x="11" y="16" width="14" height="8" fill="rgba(255,255,255,.6)"/><path d="M30 16l6 4-6 4z" fill="' + c + '" stroke="#444" stroke-width="1.2"/>' +
        '<line x1="13" y1="16" x2="13" y2="24" stroke="#444"/><line x1="23" y1="16" x2="23" y2="24" stroke="#444"/></g></svg>';
    }
    return '';
  }

  // ---------------------------------------------------------------- the painting canvas (made once, kept)
  const art = document.createElement('div'); art.className = 'art';
  const cv = document.createElement('canvas'); art.appendChild(cv);
  const ring = document.createElement('div'); ring.className = 'ring'; art.appendChild(ring);
  const rectEl = document.createElement('div'); rectEl.className = 'rect'; art.appendChild(rectEl);
  P.attach(cv);

  function sizeArt() {
    const host = art.parentElement; if (!host) return;
    const r = host.getBoundingClientRect();
    let w = r.width, h = w * 2 / 3;
    if (h > r.height) { h = r.height; w = h * 1.5; }
    art.style.width = w + 'px'; art.style.height = h + 'px';
  }

  // ---------------------------------------------------------------- saving
  let saveTimer = 0;
  function autosaveSoon(ms) { clearTimeout(saveTimer); saveTimer = setTimeout(autosave, ms || 2500); }
  // force: the page is being hidden or closed, so save now even mid-stroke or while paint is wet
  function autosave(force) {
    clearTimeout(saveTimer);
    if (!hasPicture) return;
    // saving takes a moment (longer on a tablet), so never do it while a finger is down or paint is still moving
    if (force !== true && (painting || P.washing() || (P.wetness() && cur.name === 'studio'))) { autosaveSoon(1500); return; }
    try {
      const o = P.serialize();
      o.unsaved = !!save.unsaved;
      if (!put(CUR_KEY, o)) { localStorage.removeItem(CUR_KEY); }
    } catch (e) { /* storage full */ }
  }
  let hasPicture = false;
  function gallery() { const g = load(GAL_KEY); return Array.isArray(g) ? g : []; }
  function addToGallery() {
    const url = P.snapshotURL('image/jpeg', 0.84, 0.75);
    const g = gallery();
    g.unshift({ at: Date.now(), g: P.ground().id, img: url });
    while (g.length > GAL_MAX) g.pop();
    let ok = put(GAL_KEY, g);
    while (!ok && g.length > 1) { g.pop(); ok = put(GAL_KEY, g); }
    save.unsaved = false; store();
    return { ok, url };
  }
  // iPhones / iPads: the share sheet puts it in Photos; everything else downloads a PNG
  const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  function stampName() {
    const d = new Date(), p = (n) => (n < 10 ? '0' : '') + n;
    return 'dreamcanvas-' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes()) + '.png';
  }
  function urlToBlob(url) {
    const [head, data] = url.split(','), mime = head.match(/:(.*?);/)[1], bin = atob(data), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function saveToDevice(url) {
    const name = stampName().replace('.png', url.indexOf('image/jpeg') > 0 ? '.jpg' : '.png');
    const blob = urlToBlob(url);
    let share = false;
    try { share = IOS && !!navigator.canShare && navigator.canShare({ files: [new File([blob], name, { type: blob.type })] }); } catch (e) { share = false; }
    if (share) {
      navigator.share({ files: [new File([blob], name, { type: blob.type })] }).then(() => toast('SAVED!')).catch((err) => { if (!err || err.name !== 'AbortError') download(blob, name); });
      return;
    }
    download(blob, name);
    toast('SAVED AS ' + name.toUpperCase(), 3500);
  }
  function download(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  // ---------------------------------------------------------------- screens
  const cur = { name: '' };
  function show(name, html) {
    cur.name = name;
    screen.innerHTML = html;
    closeSheet();
    focusEl = null;
  }

  // --- title
  function goTitle() {
    endPaint();
    const saved = load(CUR_KEY);
    let thumb = '';
    if (hasPicture) thumb = P.snapshotURL('image/jpeg', 0.8, 0.5);
    show('title', '<div class="title-scr">' +
      '<div class="title-art">' + easelSVG() + (thumb ? '<img src="' + thumb + '" alt="">' : '') + '</div>' +
      '<div class="title-col"><div class="logo">DREAM<br>CANVAS</div><div class="tagline">Watercolor, oil, acrylic, spray, markers &amp; crayons</div>' +
      (hasPicture || saved ? '<button class="go nav" data-act="continue">KEEP PAINTING<small>back to your picture</small></button>' : '') +
      '<button class="go blue nav" data-act="new">NEW PICTURE<small>pick paper, canvas, board or wall</small></button>' +
      '<button class="go purple nav" data-act="gallery">MY PICTURES</button>' +
      '</div></div>');
    if (!hasPicture && saved) {
      // show the saved picture on the easel while it loads
      P.restore(saved, (ok) => {
        hasPicture = !!ok; save.unsaved = !!saved.unsaved;
        if (cur.name === 'title') { const im = screen.querySelector('.title-art img') || document.createElement('img'); im.src = P.snapshotURL('image/jpeg', 0.8, 0.5); screen.querySelector('.title-art').appendChild(im); }
      });
    }
    navFirst();
  }
  function easelSVG() {
    return '<svg class="easel" viewBox="0 0 110 110"><g stroke="#3b2414" stroke-width="1.2">' +
      '<path d="M55 4 L22 108 M55 4 L88 108 M55 4 L55 100" stroke="#c08a52" stroke-width="5" stroke-linecap="round"/>' +
      '<rect x="12" y="6.5" width="86" height="58" fill="#fff" rx="1"/>' +
      '<rect x="8" y="64" width="94" height="6" rx="2" fill="#c08a52"/></g>' +
      '<circle cx="20" cy="94" r="7" fill="#e8d1a9"/><circle cx="17" cy="92" r="1.6" fill="#e23"/><circle cx="21" cy="90.5" r="1.6" fill="#27c"/><circle cx="24" cy="94" r="1.6" fill="#fc2"/></svg>';
  }

  // --- choose a ground
  function goPick() {
    endPaint();
    show('pick', '<div class="pick-scr"><div class="pick-head"><h2>WHAT WILL YOU PAINT ON?</h2><button class="chip nav" data-act="title">BACK</button></div>' +
      '<div class="grounds">' + P.GROUNDS.map((g) => '<button class="gcard nav" data-act="ground" data-id="' + g.id + '"><canvas width="240" height="160"></canvas><b>' +
        esc(g.name) + '</b><span>' + esc(g.sub) + '</span></button>').join('') + '</div></div>');
    const cards = [...screen.querySelectorAll('.gcard')];
    let k = 0;
    // draw the previews one per frame so the screen appears at once
    (function next() {
      if (cur.name !== 'pick' || k >= cards.length) return;
      const c = cards[k]; P.preview(c.dataset.id, c.querySelector('canvas'), 0.75); k++;
      requestAnimationFrame(next);
    })();
    navFirst();
  }
  function startNew(id) {
    P.newPainting(id);
    hasPicture = true; save.unsaved = false; save.ground = id; store();
    goStudio();
    const g = P.ground();
    if (g.id === 'black' && med().clear) tellOnce('black', 'Watercolor and markers are see-through, so they hide on black paper. Try crayon, spray or acrylic!');
    autosaveSoon(500);
  }

  // --- the studio
  function goStudio() {
    show('studio', '<div class="studio">' +
      '<div class="media"></div><div class="tools"></div><div class="easel"></div><div class="about"></div>' +
      '<div class="side panel"><div class="pal"></div><div class="cname"></div>' +
      '<div class="sl"><div class="row"><span></span><b>SIZE</b><span></span></div><input type="range" class="nav" data-sl="size" min="1" max="60" step="0.5"></div>' +
      '<div class="sl"><div class="row"><span data-lo></span><b data-mid></b><span data-hi></span></div><input type="range" class="nav" data-sl="amt" min="0" max="1" step="0.01"></div>' +
      '<div class="acts">' +
        '<button class="act nav" data-act="undo"><i>↶</i>UNDO</button>' +
        '<button class="act nav" data-act="dry"><i>💨</i>DRY</button>' +
        '<button class="act nav" data-act="tilt"><i>📐</i><span>TILT</span></button>' +
        '<button class="act nav" data-act="eyedrop"><i>💧</i>PICK</button>' +
        '<button class="act nav" data-act="newpic"><i>📄</i>NEW</button>' +
        '<button class="act save nav" data-act="save"><i>★</i>SAVE</button>' +
      '</div></div></div>');
    screen.querySelector('.easel').appendChild(art);
    renderMedia(); renderTools(); renderSide();
    sizeArt();
    P.render();
    updateActs();
  }
  function renderMedia() {
    const el = screen.querySelector('.media'); if (!el) return;
    const c = colorHex(ST.color);
    el.innerHTML = MEDIA.map((m) => '<button class="mbtn nav' + (m.id === ST.medium ? ' on' : '') + '" data-act="medium" data-id="' + m.id + '">' + icon(m.id, c) + m.name + '</button>').join('');
  }
  function renderTools() {
    const el = screen.querySelector('.tools'); if (!el) return;
    const m = med(), t = tool();
    let h = m.tools.map((x) => '<button class="chip nav' + (x[0] === t ? ' on' : '') + '" data-act="tool" data-id="' + x[0] + '">' + x[1] + '</button>').join('');
    if (m.id === 'water' && t === 'washrect') {
      h += '<span class="sep"></span>' + WASHES.map((x) => '<button class="chip nav' + (x[0] === ST.washMode ? ' on' : '') + '" data-act="washmode" data-id="' + x[0] + '">' + x[1] + '</button>').join('');
    }
    if (!m.tools.length) h = '<span class="lbl">SPRAY CAN &mdash; SIZE MAKES THE SPRAY WIDER</span>';
    el.innerHTML = h;
    const ab = screen.querySelector('.about');
    if (ab) ab.textContent = ST.eyedrop ? 'Tap the picture to pick up a color from it.' : (m.id === 'water' && t === 'washrect') ? WASH_ABOUT[ST.washMode] : m.about;
  }
  function renderSide() {
    const pal = screen.querySelector('.pal'); if (!pal) return;
    const clear = med().clear;
    pal.innerHTML = PALETTE.map((p, i) => '<button class="sw nav' + (i === ST.color ? ' on' : '') + (clear && i === WHITE ? ' off' : '') +
      '" data-act="color" data-i="' + i + '" style="background:' + p[1] + '" aria-label="' + p[0] + '"></button>').join('');
    // a colour picked off the picture (PICK) has no swatch; its name line shows a dot of it instead
    const name = ST.color === -1 ? 'PICKED COLOR' : PALETTE[ST.color][0];
    screen.querySelector('.cname').innerHTML = (ST.color === -1 ? '<span style="display:inline-block;width:.9em;height:.9em;border-radius:50%;vertical-align:-.1em;margin-right:.3em;background:' + ST.picked + '"></span>' : '') + esc(name);
    const m = med();
    const sz = screen.querySelector('[data-sl="size"]'), am = screen.querySelector('[data-sl="amt"]');
    sz.value = sizeOf(); am.value = amtOf();
    screen.querySelector('[data-lo]').textContent = m.lo;
    screen.querySelector('[data-hi]').textContent = m.hi;
    screen.querySelector('[data-mid]').textContent = m.id === 'spray' ? 'DISTANCE' : m.id === 'marker' ? 'INK' : m.id === 'crayon' ? 'PRESS' : 'PAINT';
  }
  function updateActs() {
    if (cur.name !== 'studio') return;
    const u = screen.querySelector('[data-act="undo"]'); if (u) u.classList.toggle('dim', !P.canUndo());
    const d = screen.querySelector('[data-act="dry"]'); if (d) d.classList.toggle('glow', !!P.wetness());
    const t = screen.querySelector('[data-act="tilt"]');
    if (t) { t.classList.toggle('on', P.tilt()); t.querySelector('span').textContent = P.tilt() ? 'TILTED' : 'TILT'; }
    const e = screen.querySelector('[data-act="eyedrop"]'); if (e) e.classList.toggle('on', ST.eyedrop);
  }

  // --- gallery
  function goGallery() {
    endPaint();
    const g = gallery();
    show('gallery', '<div class="pick-scr"><div class="pick-head"><h2>MY PICTURES</h2><button class="chip nav" data-act="title">BACK</button></div>' +
      (g.length ? '<div class="gal">' + g.map((x, i) => '<button class="nav" data-act="view" data-i="' + i + '"><img src="' + x.img + '" alt=""></button>').join('') + '</div>'
        : '<div class="empty">No pictures yet.<br>Paint something and press SAVE!</div>') + '</div>');
    navFirst();
  }
  function viewPic(i) {
    const g = gallery(), x = g[i]; if (!x) return;
    openSheet('<img src="' + x.img + '" alt=""><div class="btns">' +
      '<button class="go gold nav" data-act="todevice" data-i="' + i + '">' + (IOS ? 'SAVE TO PHOTOS' : 'SAVE TO DEVICE') + '</button>' +
      '<button class="go red nav" data-act="delpic" data-i="' + i + '">THROW AWAY</button>' +
      '<button class="go ghost nav" data-act="close">BACK</button></div>');
  }

  // --- sheets
  let sheet = null;
  function openSheet(inner) {
    closeSheet();
    sheet = document.createElement('div'); sheet.className = 'sheet';
    sheet.innerHTML = '<div class="panel">' + inner + '</div>';
    stage.appendChild(sheet);
    navFirst();
  }
  function closeSheet() { if (sheet) { sheet.remove(); sheet = null; } }

  function doSave() {
    endPaint();
    P.dryAll();
    // let the dryer finish the watercolour before taking the picture
    setTimeout(() => {
      const r = addToGallery();
      autosave();
      openSheet('<h2>' + (r.ok ? 'SAVED TO MY PICTURES!' : 'MY PICTURES IS FULL') + '</h2><img src="' + r.url + '" alt="">' +
        (r.ok ? '' : '<p>Throw some old pictures away to make room.</p>') +
        '<div class="btns"><button class="go nav" data-act="close">KEEP PAINTING</button>' +
        '<button class="go gold nav" data-act="todevice-now">' + (IOS ? 'SAVE TO PHOTOS' : 'SAVE TO DEVICE') + '</button></div>');
      blip(880, 0.12); setTimeout(() => blip(1320, 0.16), 110);
    }, 900);
    toast('Drying...', 900);
  }
  function askNew() {
    if (!hasPicture || !save.unsaved) { goPick(); return; }
    openSheet('<h2>START A NEW PICTURE?</h2><p>Keep this one in MY PICTURES first?</p><div class="btns">' +
      '<button class="go nav" data-act="keepnew">YES, KEEP IT</button><button class="go red nav" data-act="tossnew">NO THANKS</button>' +
      '<button class="go ghost nav" data-act="close">CANCEL</button></div>');
  }

  // ---------------------------------------------------------------- clicks
  screen.addEventListener('click', onClick);
  stage.addEventListener('click', (e) => { if (sheet && sheet.contains(e.target)) onClick(e); });
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b) return;
    act(b.dataset.act, b);
  }
  function act(a, b) {
    switch (a) {
      case 'continue':
        click();
        if (hasPicture) { goStudio(); return; }
        { const s = load(CUR_KEY); if (s) P.restore(s, (ok) => { hasPicture = !!ok; save.unsaved = !!s.unsaved; goStudio(); }); }
        return;
      case 'new': click(); askNew(); return;
      case 'gallery': click(); goGallery(); return;
      case 'title': click(); goTitle(); return;
      case 'ground': blip(520, 0.1); setTimeout(() => blip(780, 0.12), 80); startNew(b.dataset.id); return;
      case 'medium':
        click(); ST.medium = b.dataset.id; save.medium = ST.medium; ST.eyedrop = false;
        if (med().clear && ST.color === WHITE) { ST.color = ST.prev !== WHITE ? ST.prev : 8; }
        if (P.ground().id === 'black' && med().clear) tellOnce('black-' + ST.medium, 'This one is see-through, so it hides on black paper!');
        store(); renderMedia(); renderTools(); renderSide(); updateActs(); return;
      case 'tool': click(); save.tools[ST.medium] = b.dataset.id; ST.eyedrop = false; store(); renderTools(); updateActs(); return;
      case 'washmode': click(); ST.washMode = b.dataset.id; save.washMode = ST.washMode; store(); renderTools(); return;
      case 'color': {
        const i = +b.dataset.i;
        if (med().clear && i === WHITE) { toast('There\'s no white in ' + (ST.medium === 'water' ? 'watercolor' : 'markers') + ' -- the paper is your white! Leave gaps.'); return; }
        blip(500 + i * 25, 0.06);
        if (i !== ST.color) { ST.prev = ST.color; ST.color = i; }
        save.color = ST.color; save.prev = ST.prev; ST.eyedrop = false; store();
        renderSide(); renderMedia(); renderTools(); updateActs(); return;
      }
      case 'undo': if (P.undo()) { blip(330, 0.08); save.unsaved = true; autosaveSoon(); } updateActs(); return;
      case 'dry': blip(200, 0.4, 'sawtooth', 0.025); P.dryAll(); toast('Whoosh! Everything is dry.', 1800); autosaveSoon(2000); return;
      case 'tilt': click(); P.setTilt(!P.tilt()); toast(P.tilt() ? 'Easel tilted: wet watercolor runs down the page.' : 'Easel flat: the paint stays put.', 2600); updateActs(); return;
      case 'eyedrop': click(); ST.eyedrop = !ST.eyedrop; renderTools(); updateActs(); return;
      case 'newpic': click(); askNew(); return;
      case 'save': click(); doSave(); return;
      case 'close': click(); closeSheet(); return;
      case 'keepnew': addToGallery(); closeSheet(); goPick(); return;
      case 'tossnew': closeSheet(); goPick(); return;
      case 'view': click(); viewPic(+b.dataset.i); return;
      case 'todevice': { const x = gallery()[+b.dataset.i]; if (x) saveToDevice(x.img); return; }
      case 'todevice-now': saveToDevice(P.snapshotURL('image/png')); return;
      case 'delpic': {
        const g = gallery(); g.splice(+b.dataset.i, 1); put(GAL_KEY, g); closeSheet(); goGallery(); return;
      }
    }
  }
  screen.addEventListener('input', (e) => {
    const s = e.target.dataset && e.target.dataset.sl; if (!s) return;
    if (s === 'size') save.sizes[ST.medium] = +e.target.value; else save.amts[ST.medium] = +e.target.value;
    store();
    if (s === 'size') showRing(true);
  });

  // ---------------------------------------------------------------- painting with pointer
  let painting = null;      // { id, wash: {x0,y0,x1,y1} }
  function toArt(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * P.PW / r.width, y: (e.clientY - r.top) * P.PH / r.height };
  }
  function strokeOpts() {
    const m = med();
    let size = sizeOf();
    return { medium: m.id, tool: tool(), rgb: curRGB(), size: size, amount: amtOf() };
  }
  function pressOf(e) { return e.pointerType === 'pen' && e.pressure > 0 ? e.pressure : 0.6; }
  cv.addEventListener('pointerdown', (e) => {
    if (painting || e.button > 0) return;
    e.preventDefault();
    try { cv.setPointerCapture(e.pointerId); } catch (er) { /* fine */ }
    const p = toArt(e);
    if (ST.eyedrop) {
      const c = P.pick(p.x, p.y); ST.picked = rgbHex(c); save.picked = ST.picked;
      if (ST.color !== -1) ST.prev = ST.color;
      ST.color = -1; ST.eyedrop = false; save.color = -1; store();
      blip(990, 0.08); renderSide(); renderMedia(); renderTools(); updateActs();
      toast('Picked up that color!', 1500);
      return;
    }
    beginPaint(e.pointerId, p, pressOf(e));
  });
  cv.addEventListener('pointermove', (e) => {
    const p = toArt(e);
    if (e.pointerType === 'mouse') moveRing(p);
    if (!painting || painting.id !== e.pointerId) return;
    const list = e.getCoalescedEvents ? e.getCoalescedEvents() : null;
    if (list && list.length > 1) list.forEach((ev) => movePaint(toArt(ev), pressOf(ev))); else movePaint(p, pressOf(e));
  });
  const up = (e) => { if (painting && painting.id === e.pointerId) endPaint(); };
  cv.addEventListener('pointerup', up);
  cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') ring.classList.remove('on'); });

  function beginPaint(id, p, pr) {
    ensureAudio();
    if (ST.medium === 'water' && tool() === 'washrect') {
      painting = { id, wash: { x0: p.x, y0: p.y, x1: p.x, y1: p.y } };
      drawRect();
      return;
    }
    painting = { id };
    P.begin(p.x, p.y, pr, strokeOpts());
    save.unsaved = true;
    if (ST.medium === 'water' && !told.resist && P._S.top.some((v) => v === 3)) {
      tellOnce('resist', 'Wax resist! The watercolor slides off your crayon.');
    }
    if (ST.medium === 'spray') sprayHiss(true);
  }
  function movePaint(p, pr) {
    if (!painting) return;
    if (painting.wash) { painting.wash.x1 = p.x; painting.wash.y1 = p.y; drawRect(); return; }
    P.move(p.x, p.y, pr);
  }
  function endPaint() {
    if (!painting) return;
    const w = painting.wash;
    painting = null;
    if (w) {
      rectEl.classList.remove('on');
      if (Math.abs(w.x1 - w.x0) > 12 && Math.abs(w.y1 - w.y0) > 12) {
        const second = hexRGB(colorHex(ST.prev === ST.color ? 9 : ST.prev));
        P.washRect(w.x0, w.y0, w.x1, w.y1, ST.washMode, curRGB(), second, amtOf());
        save.unsaved = true;
        blip(300, 0.5, 'sine', 0.03);
      } else toast('Drag a box across the picture to lay a wash.', 2200);
    } else P.end();
    sprayHiss(false);
    updateActs();
    autosaveSoon();
  }
  function drawRect() {
    const w = painting.wash, sx = 100 / P.PW, sy = 100 / P.PH;
    rectEl.style.left = Math.min(w.x0, w.x1) * sx + '%'; rectEl.style.top = Math.min(w.y0, w.y1) * sy + '%';
    rectEl.style.width = Math.abs(w.x1 - w.x0) * sx + '%'; rectEl.style.height = Math.abs(w.y1 - w.y0) * sy + '%';
    rectEl.classList.add('on');
  }
  function ringSize() {
    const m = ST.medium, s = sizeOf(), t = tool();
    let r = s;
    if (m === 'marker' && t === 'fine') r = Math.max(1, s * 0.45);
    if (m === 'water' && t === 'flat') r = s * 1.5;
    if (m === 'spray') r = s * (0.35 + amtOf() * 0.95) * 1.2;
    return r;
  }
  let ringPos = null;
  function moveRing(p) {
    ringPos = p;
    const r = ringSize() * 2 * cv.getBoundingClientRect().width / P.PW;
    ring.style.left = (p.x / P.PW * 100) + '%'; ring.style.top = (p.y / P.PH * 100) + '%';
    ring.style.width = ring.style.height = Math.max(4, r) + 'px';
    ring.classList.toggle('on', !ST.eyedrop && !(ST.medium === 'water' && tool() === 'washrect'));
  }
  let ringHide = 0;
  function showRing() {
    // while dragging the SIZE slider, show the brush size in the middle of the picture
    moveRing(ringPos || { x: P.PW / 2, y: P.PH / 2 });
    clearTimeout(ringHide); ringHide = setTimeout(() => { if (!ringPos || !gp.on) ring.classList.remove('on'); }, 900);
  }

  // spray can hiss (filtered noise) while spraying
  let hiss = null;
  function ensureAudio() { try { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { /* none */ } }
  function sprayHiss(on) {
    try {
      if (on) {
        if (!actx || hiss) return;
        const len = actx.sampleRate, b = actx.createBuffer(1, len, len), d = b.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        const src = actx.createBufferSource(); src.buffer = b; src.loop = true;
        const f = actx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 3500;
        const g = actx.createGain(); g.gain.value = 0.0001; g.gain.exponentialRampToValueAtTime(0.05, actx.currentTime + 0.05);
        src.connect(f); f.connect(g); g.connect(actx.destination); src.start();
        hiss = { src, g };
      } else if (hiss) {
        const h = hiss; hiss = null;
        h.g.gain.setTargetAtTime(0.0001, actx.currentTime, 0.03); setTimeout(() => { try { h.src.stop(); } catch (e) { /* done */ } }, 200);
      }
    } catch (e) { hiss = null; }
  }

  // ---------------------------------------------------------------- keyboard + controller
  let focusEl = null;
  function navEls() {
    const root = sheet || screen;
    return [...root.querySelectorAll('.nav')].filter((b) => b.offsetParent !== null && !b.classList.contains('off'));
  }
  function setFocus(el) {
    if (focusEl) focusEl.classList.remove('foc');
    focusEl = el; if (el) { el.classList.add('foc'); if (el.scrollIntoView) el.scrollIntoView({ block: 'nearest' }); }
  }
  function navFirst() { if (document.body.classList.contains('navmode')) setFocus(navEls()[0] || null); }
  function navMove(dx, dy) {
    document.body.classList.add('navmode');
    const els = navEls(); if (!els.length) return;
    if (!focusEl || els.indexOf(focusEl) < 0) { setFocus(els[0]); return; }
    // spatial: nearest element in the pressed direction
    const a = focusEl.getBoundingClientRect(), ax = a.left + a.width / 2, ay = a.top + a.height / 2;
    let best = null, bd = 1e9;
    els.forEach((el) => {
      if (el === focusEl) return;
      const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, ddx = x - ax, ddy = y - ay;
      const along = dx ? ddx * dx : ddy * dy, across = dx ? Math.abs(ddy) : Math.abs(ddx);
      if (along <= 2) return;
      const d = along + across * 2.2;
      if (d < bd) { bd = d; best = el; }
    });
    if (best) setFocus(best);
  }
  function pressFocus() {
    if (!focusEl) return;
    if (focusEl.matches('input[type=range]')) return;
    focusEl.click();
  }
  function back() {
    if (sheet) { closeSheet(); navFirst(); return; }
    if (cur.name === 'studio' || cur.name === 'pick' || cur.name === 'gallery') { goTitle(); return; }
    if (window.MickleMenu) MickleMenu.backToArcade();
  }
  function cycleMedium(d) {
    const i = MEDIA.findIndex((m) => m.id === ST.medium);
    act('medium', { dataset: { id: MEDIA[(i + d + MEDIA.length) % MEDIA.length].id } });
  }
  function cycleTool(d) {
    const m = med(); if (!m.tools.length) return;
    const i = m.tools.findIndex((x) => x[0] === tool());
    act('tool', { dataset: { id: m.tools[(i + d + m.tools.length) % m.tools.length][0] } });
  }
  function cycleColor(d) {
    let i = ST.color < 0 ? 0 : ST.color;
    do { i = (i + d + PALETTE.length) % PALETTE.length; } while (med().clear && i === WHITE);
    act('color', { dataset: { i } });
  }
  function nudgeSize(d) {
    const v = Math.max(1, Math.min(60, sizeOf() + d)); save.sizes[ST.medium] = v; store();
    const s = screen.querySelector('[data-sl="size"]'); if (s) s.value = v;
    showRing();
  }
  window.addEventListener('keydown', (e) => {
    if (window.MickleMenu && MickleMenu.isOpen()) return;
    const k = e.key;
    if (cur.name === 'studio' && !sheet) {
      if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); act('undo'); return; }
      if (k >= '1' && k <= '6') { act('medium', { dataset: { id: MEDIA[+k - 1].id } }); return; }
      if (k === '[') { nudgeSize(-2); return; }
      if (k === ']') { nudgeSize(2); return; }
      if (k === 'u' || k === 'U') { act('undo'); return; }
      if (k === 'd' || k === 'D') { act('dry'); return; }
      if (k === 't' || k === 'T') { cycleTool(1); return; }
      if (k === ',' ) { cycleColor(-1); return; }
      if (k === '.') { cycleColor(1); return; }
    }
    if (k === 'Escape') { e.preventDefault(); back(); return; }
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowDown') {
      if (document.activeElement && document.activeElement.type === 'range') return;
      e.preventDefault();
      navMove(k === 'ArrowLeft' ? -1 : k === 'ArrowRight' ? 1 : 0, k === 'ArrowUp' ? -1 : k === 'ArrowDown' ? 1 : 0);
      return;
    }
    if ((k === 'Enter' || k === ' ') && document.body.classList.contains('navmode') && focusEl) { e.preventDefault(); pressFocus(); }
  });
  window.addEventListener('pointerdown', () => { document.body.classList.remove('navmode'); setFocus(null); }, true);

  // controller in the studio: the stick drives a brush cursor, A paints
  const gp = { on: false, x: P.PW / 2, y: P.PH / 2, down: false };
  function padStudio(dt) {
    const B = Pad360.BTN;
    const ax = Pad360.axis(0), ay = Pad360.axis(1);
    if (Math.abs(ax) > 0.05 || Math.abs(ay) > 0.05) {
      gp.on = true;
      gp.x = Math.max(0, Math.min(P.PW - 1, gp.x + ax * 420 * dt));
      gp.y = Math.max(0, Math.min(P.PH - 1, gp.y + ay * 420 * dt));
      moveRing({ x: gp.x, y: gp.y });
      if (painting) movePaint({ x: gp.x, y: gp.y }, 0.6);
    }
    if (Pad360.pressed(B.A)) { gp.on = true; moveRing({ x: gp.x, y: gp.y }); if (!painting) beginPaint('pad', { x: gp.x, y: gp.y }, 0.6); }
    if (Pad360.released(B.A) && painting && painting.id === 'pad') endPaint();
    if (Pad360.pressed(B.B)) act('undo');
    if (Pad360.pressed(B.X)) cycleTool(1);
    if (Pad360.pressed(B.Y)) cycleMedium(1);
    if (Pad360.pressed(B.LB)) cycleColor(-1);
    if (Pad360.pressed(B.RB)) cycleColor(1);
    if (B.START !== undefined && Pad360.pressed(B.START)) act('save');
    if (B.BACK !== undefined && Pad360.pressed(B.BACK)) goTitle();
    if (B.UP !== undefined && Pad360.down(B.UP)) nudgeSize(20 * dt);
    if (B.DOWN !== undefined && Pad360.down(B.DOWN)) nudgeSize(-20 * dt);
  }
  function padMenus() {
    const B = Pad360.BTN, dx = Pad360.dxPressed(), dy = Pad360.dyPressed();
    if (dx || dy) navMove(dx, dx ? 0 : dy);
    if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) { if (!focusEl) navMove(0, 1); else pressFocus(); }
    if (Pad360.pressed(B.B)) back();
  }

  // ---------------------------------------------------------------- loop
  let last = performance.now(), actT = 0;
  function loop(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (window.Pad360) {
      Pad360.poll();
      if (!(window.MickleMenu && MickleMenu.isOpen())) {
        if (cur.name === 'studio' && !sheet) padStudio(dt); else padMenus();
      }
    }
    if (cur.name === 'studio') {
      P.frame(dt);
      actT += dt; if (actT > 0.25) { actT = 0; updateActs(); }
    }
    requestAnimationFrame(loop);
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) autosave(true); });
  window.addEventListener('pagehide', () => autosave(true));

  // ---------------------------------------------------------------- start
  fit();
  goTitle();
  requestAnimationFrame(loop);

  window.DreamCanvasDebug = { P, ST, save, act, goStudio, goTitle, goPick, startNew, autosave, gallery };
})();
