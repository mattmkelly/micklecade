// DreamReel -- a simple video editor for the MickleCade.
//
// Three rows on the timeline:
//   TOP    clips that sit over the movie (green screen / picture-in-picture), free in time
//   MOVIE  the main clips, one after another (videos and photos), no gaps
//   WORDS  text titles, free in time
// The playhead is the fixed line in the middle of the timeline; swiping scrolls the movie
// under it. The preview is drawn with WebGL (the green-screen key is a shader), then the
// words are drawn on top in Canvas 2D. MAKE MOVIE plays the timeline once in real time into
// a MediaRecorder (canvas stream + the clips' sound through WebAudio).
//
// Media files and the project are kept in IndexedDB so a closed game comes back where it was
// (the Fire tablets' Kids browser wipes this when it closes; desktop keeps it).
(function () {
  'use strict';

  var $ = function (s) { return document.querySelector(s); };
  var stage = $('#stage'), ui = $('#ui'), view = $('#view'), octx = view.getContext('2d');
  var tl = $('#tl'), tctx = tl.getContext('2d');
  var mediaBox = $('#media');

  var PHOTO_DUR = 3, PHOTO_MAX = 60, MIN_LEN = 0.2, UNDO_MAX = 40;
  var SHAPES = {
    wide: { label: 'WIDE', w: 16, h: 9 },
    tall: { label: 'TALL', w: 9, h: 16 },
    square: { label: 'SQUARE', w: 1, h: 1 }
  };
  var TEXT_STYLES = [
    { id: 'pop', label: 'POP' }, { id: 'bubble', label: 'BUBBLE' }, { id: 'neon', label: 'NEON' },
    { id: 'comic', label: 'COMIC' }, { id: 'title', label: 'TITLE BAR' }
  ];
  var TEXT_ANIMS = [
    { id: 'none', label: 'FADE' }, { id: 'pop', label: 'POP' }, { id: 'slide', label: 'SLIDE' },
    { id: 'bounce', label: 'BOUNCE' }, { id: 'type', label: 'TYPE' }, { id: 'wiggle', label: 'WIGGLE' },
    { id: 'spin', label: 'SPIN' }, { id: 'rainbow', label: 'RAINBOW' }
  ];
  var COLORS = ['#ffffff', '#ffe14f', '#ff9a3c', '#ff4f4f', '#ff4fd8', '#a46bff', '#4ff0ff', '#5cff7a', '#111111'];

  // ---------------------------------------------------------------- project state
  function newProject() { return { v: 1, aspect: 'wide', media: [], main: [], top: [], text: [] }; }
  var project = newProject();
  var rt = {};          // media id -> { url, img, strip, stripN, tw, th, ready }
  var sel = null;       // { layer: 'main'|'top'|'text', id }
  var playT = 0, playing = false, dirty = true, tlDirty = true;
  var undoStack = [];
  var pickMode = false;
  var exporting = null;

  var uidN = 0;
  function uid() { return Date.now().toString(36) + (uidN++).toString(36) + Math.random().toString(36).slice(2, 6); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function mediaById(id) { for (var i = 0; i < project.media.length; i++) if (project.media[i].id === id) return project.media[i]; return null; }
  function clipLen(c) { return c.out - c.in; }
  // photos and fun backgrounds have no length of their own: they stretch, like a photo
  function isStill(m) { return m.kind === 'image' || m.kind === 'bg'; }
  var BGS = window.DreamReelBackgrounds || [];
  var BG_DUR = 5, BG_LOOP = 8;   // a new background clip's length; the timeline strip shows its first 8 s
  function bgDef(id) { for (var i = 0; i < BGS.length; i++) if (BGS[i].id === id) return BGS[i]; return BGS[0]; }
  function mainTotal() { var s = 0; for (var i = 0; i < project.main.length; i++) s += clipLen(project.main[i]); return s; }
  function total() {
    var t = mainTotal(), i;
    for (i = 0; i < project.top.length; i++) t = Math.max(t, project.top[i].start + clipLen(project.top[i]));
    for (i = 0; i < project.text.length; i++) t = Math.max(t, project.text[i].start + project.text[i].dur);
    return t;
  }
  function mainStart(c) {
    var s = 0;
    for (var i = 0; i < project.main.length; i++) { if (project.main[i] === c) return s; s += clipLen(project.main[i]); }
    return 0;
  }
  function itemList(layer) { return layer === 'main' ? project.main : layer === 'top' ? project.top : project.text; }
  function findItem(s) {
    if (!s) return null;
    var list = itemList(s.layer);
    for (var i = 0; i < list.length; i++) if (list[i].id === s.id) return list[i];
    return null;
  }
  function itemStart(layer, it) { return layer === 'main' ? mainStart(it) : it.start; }
  function itemLen(layer, it) { return layer === 'text' ? it.dur : clipLen(it); }
  function fmt(t) {
    t = Math.max(0, t);
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(1);
  }

  // ---------------------------------------------------------------- toast
  var toastTimer = 0;
  function toast(msg, ms) {
    var el = $('#toast');
    el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, ms || 2200);
  }

  // ---------------------------------------------------------------- IndexedDB
  var DB = (function () {
    var dbp = null;
    function open() {
      if (!dbp) dbp = new Promise(function (res, rej) {
        var r;
        try { r = indexedDB.open('dreamreel', 1); } catch (e) { rej(e); return; }
        r.onupgradeneeded = function () { var d = r.result; d.createObjectStore('media'); d.createObjectStore('kv'); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
      return dbp;
    }
    function tx(store, mode, fn) {
      return open().then(function (d) {
        return new Promise(function (res, rej) {
          var t = d.transaction(store, mode), req = fn(t.objectStore(store));
          t.oncomplete = function () { res(req && req.result); };
          t.onerror = function () { rej(t.error); };
          t.onabort = function () { rej(t.error); };
        });
      });
    }
    return {
      get: function (st, k) { return tx(st, 'readonly', function (s) { return s.get(k); }); },
      put: function (st, k, v) { return tx(st, 'readwrite', function (s) { return s.put(v, k); }); },
      del: function (st, k) { return tx(st, 'readwrite', function (s) { return s.delete(k); }); },
      clear: function (st) { return tx(st, 'readwrite', function (s) { return s.clear(); }); }
    };
  })();

  var saveTimer = 0;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      DB.put('kv', 'project', JSON.stringify(project)).catch(function () {});
    }, 600);
  }

  // Something in the project changed (after pushUndo): redraw everything and save.
  function changed(keepInspector) {
    dirty = true; tlDirty = true;
    if (!findItem(sel)) sel = null;
    fitAutoBackground();
    var T = total();
    if (playT > T) playT = T;
    if (!keepInspector) renderInspector();
    renderBin();
    updateButtons();
    scheduleSave();
  }
  function pushUndo() {
    undoStack.push(JSON.stringify(project));
    if (undoStack.length > UNDO_MAX) undoStack.shift();
    updateButtons();
  }
  function undo() {
    if (!undoStack.length) { toast('NOTHING TO UNDO'); return; }
    var snap = JSON.parse(undoStack.pop());
    // media blobs aren't in the snapshot; keep any media that still has a file loaded
    snap.media = snap.media.filter(function (m) { return rt[m.id]; });
    project = snap;
    dropBrokenClips();
    changed();
    toast('UNDONE');
  }
  function dropBrokenClips() {
    var ok = function (c) { return !!mediaById(c.media); };
    project.main = project.main.filter(ok);
    project.top = project.top.filter(ok);
  }

  // ---------------------------------------------------------------- media loading
  function waitEvent(el, ok, bad, ms) {
    return new Promise(function (res, rej) {
      var done = false, timer;
      function fin(f, v) { if (done) return; done = true; clearTimeout(timer); el.removeEventListener(ok, onOk); if (bad) el.removeEventListener(bad, onBad); f(v); }
      function onOk() { fin(res); }
      function onBad() { fin(rej, new Error(bad)); }
      el.addEventListener(ok, onOk);
      if (bad) el.addEventListener(bad, onBad);
      timer = setTimeout(function () { fin(rej, new Error('timeout')); }, ms || 15000);
    });
  }
  function probeImage(url) {
    var img = new Image();
    img.src = url;
    return waitEvent(img, 'load', 'error').then(function () {
      return { w: img.naturalWidth, h: img.naturalHeight, dur: PHOTO_DUR, img: img };
    });
  }
  function probeVideo(url) {
    var v = document.createElement('video');
    v.preload = 'metadata'; v.muted = true; v.playsInline = true;
    mediaBox.appendChild(v);
    v.src = url;
    return waitEvent(v, 'loadedmetadata', 'error').then(function () {
      if (isFinite(v.duration) && v.duration > 0) return v;
      // some recorded WebM files report Infinity until you seek past the end
      v.currentTime = 1e7;
      return waitEvent(v, 'durationchange', null, 5000).catch(function () {}).then(function () { return v; });
    }).then(function (v) {
      var info = { w: v.videoWidth || 16, h: v.videoHeight || 9, dur: isFinite(v.duration) ? v.duration : 10 };
      v.removeAttribute('src'); v.load(); v.remove();
      return info;
    }, function (e) { v.removeAttribute('src'); v.load(); v.remove(); throw e; });
  }
  function seekTo(v, t) {
    if (Math.abs(v.currentTime - t) < 0.001 && v.readyState >= 2) return Promise.resolve();
    v.currentTime = t;
    return waitEvent(v, 'seeked', 'error', 4000).catch(function () {});
  }

  // Filmstrip thumbnails for the timeline (and the bin picture).
  function makeStrip(m) {
    var r = rt[m.id];
    var th = 64, tw = Math.round(clamp(th * m.w / m.h, 28, 160));
    var N = m.kind === 'image' ? 1 : m.kind === 'bg' ? 6 : clamp(Math.ceil(m.dur / 1.5), 3, 24);
    var c = document.createElement('canvas');
    c.width = tw * N; c.height = th;
    var x = c.getContext('2d');
    x.fillStyle = '#222'; x.fillRect(0, 0, c.width, c.height);
    r.strip = c; r.stripN = N; r.tw = tw; r.th = th;
    if (m.kind === 'bg') {
      var def = bgDef(m.gen);
      for (var bi = 0; bi < N; bi++) {
        x.save(); x.translate(bi * tw, 0);
        x.beginPath(); x.rect(0, 0, tw, th); x.clip();
        def.draw(x, tw, th, bi / N * BG_LOOP + 0.5);
        x.restore();
      }
      r.ready = true; tlDirty = true;
      return Promise.resolve();
    }
    if (m.kind === 'image') {
      drawCover(x, r.img, 0, 0, tw, th, m.w, m.h);
      r.ready = true; tlDirty = true; renderBin();
      return Promise.resolve();
    }
    var v = document.createElement('video');
    v.muted = true; v.preload = 'auto'; v.playsInline = true;
    mediaBox.appendChild(v);
    v.src = r.url;
    var i = 0;
    function next() {
      if (i >= N || !rt[m.id]) return Promise.resolve();
      var t = Math.min(m.dur - 0.05, (i + 0.5) / N * m.dur);
      return seekTo(v, Math.max(0, t)).then(function () {
        try { drawCover(x, v, i * tw, 0, tw, th, v.videoWidth, v.videoHeight); } catch (e) {}
        if (i === 0 || i === Math.floor(N / 2)) renderBinThumb(m);
        i++; tlDirty = true;
        return next();
      });
    }
    return waitEvent(v, 'loadeddata', 'error', 15000).then(next).catch(function () {}).then(function () {
      r.ready = true; tlDirty = true; renderBinThumb(m);
      v.removeAttribute('src'); v.load(); v.remove();
    });
  }
  function drawCover(x, src, dx, dy, dw, dh, sw, sh) {
    if (!sw || !sh) return;
    var s = Math.max(dw / sw, dh / sh), w = sw * s, h = sh * s;
    x.save(); x.beginPath(); x.rect(dx, dy, dw, dh); x.clip();
    x.drawImage(src, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
    x.restore();
  }

  function kindOf(f) {
    if (f.type) {
      if (f.type.indexOf('image/') === 0) return 'image';
      if (f.type.indexOf('video/') === 0) return 'video';
    }
    if (/\.(jpe?g|png|gif|webp|bmp)$/i.test(f.name)) return 'image';
    if (/\.(mp4|webm|mov|m4v|3gp|mkv|ogv)$/i.test(f.name)) return 'video';
    return null;
  }

  // Load one stored or picked file into the runtime. Returns the media record or null.
  function loadMedia(blob, rec) {
    var url = URL.createObjectURL(blob);
    var p = rec.kind === 'image' ? probeImage(url) : probeVideo(url);
    return p.then(function (info) {
      rec.w = info.w; rec.h = info.h;
      if (rec.kind === 'video') rec.dur = info.dur;
      rt[rec.id] = { url: url, img: info.img || null, ready: false };
      makeStrip(rec);
      return rec;
    }, function () { URL.revokeObjectURL(url); return null; });
  }

  var importing = 0;
  function importFiles(files) {
    files = Array.prototype.slice.call(files);
    if (!files.length) return;
    importing++;
    toast(files.length > 1 ? 'BRINGING IN ' + files.length + ' THINGS...' : 'BRINGING IT IN...', 60000);
    var firstNew = project.media.length === 0 && project.main.length === 0;
    var undone = false, added = 0;
    var chain = Promise.resolve();
    files.forEach(function (f) {
      chain = chain.then(function () {
        var kind = kindOf(f);
        if (!kind) { toast("CAN'T USE " + f.name.toUpperCase()); return; }
        var rec = { id: uid(), kind: kind, name: f.name, dur: PHOTO_DUR, w: 16, h: 9 };
        return loadMedia(f, rec).then(function (m) {
          if (!m) { toast("COULDN'T OPEN " + f.name.toUpperCase(), 3000); return; }
          if (!undone) { pushUndo(); undone = true; }
          project.media.push(m);
          if (firstNew && added === 0) project.aspect = m.h > m.w * 1.1 ? 'tall' : 'wide';
          // straight onto the end of the movie
          var c = newMainClip(m);
          project.main.push(c);
          added++;
          DB.put('media', m.id, f).catch(function () { toast('TOO BIG TO KEEP -- MAKE YOUR MOVIE BEFORE CLOSING', 3500); });
          if (firstNew) setOutSize(false);
          changed();
        });
      });
    });
    chain.then(function () {
      importing--;
      if (added) toast(added === 1 ? 'ADDED TO YOUR MOVIE!' : added + ' THINGS ADDED!');
    });
  }
  function newMainClip(m) {
    return { id: uid(), media: m.id, in: 0, out: stillLen(m), vol: 1, fit: 'fit', fade: false, motion: m.kind === 'image' ? 'zoomin' : 'none' };
  }
  function stillLen(m) { return m.kind === 'image' ? PHOTO_DUR : m.kind === 'bg' ? BG_DUR : m.dur; }
  function newTopClip(m, start) {
    return {
      id: uid(), media: m.id, start: start, in: 0, out: stillLen(m), vol: 1,
      x: 0.5, y: 0.5, scale: 1, key: { on: false, color: [0.2, 0.75, 0.3], sim: 0.17, soft: 0.06, spill: 0.12 }
    };
  }

  // On a tablet, opening the picker hides the page (the picker is its own screen). If the page
  // never hides and no files arrive, this browser has no file picker (the Amazon Kids browser
  // may not have one), so say so instead of doing nothing.
  var pickWatch = 0, pickLeft = false;
  function pageLeft() { pickLeft = true; }
  document.addEventListener('visibilitychange', function () { if (document.hidden) pageLeft(); });
  window.addEventListener('blur', pageLeft);
  $('#file').addEventListener('click', function () {
    ensureAudio();
    pickLeft = false;
    clearTimeout(pickWatch);
    if (!matchMedia('(pointer: coarse)').matches) return;
    pickWatch = setTimeout(function () {
      if (!pickLeft) noPicker();
    }, 2500);
  });
  $('#file').addEventListener('change', function (e) {
    clearTimeout(pickWatch);
    importFiles(e.target.files);
    e.target.value = '';
  });
  function noPicker() {
    showSheet([
      el('h2', null, 'NO PICTURES CAME UP'),
      el('p', null, "This browser didn't open the videos and photos on this device. Some kids' browsers don't allow it."),
      el('p', null, 'Ask a grown-up to try it in the normal web browser, or on a computer.'),
      btnRow([button('OK', 'gold', hideSheet)])
    ]);
  }
  // drag and drop files onto the page (desktop)
  document.addEventListener('dragover', function (e) { e.preventDefault(); });
  document.addEventListener('drop', function (e) {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
  });

  // ---------------------------------------------------------------- the bin
  var binItems = {}, bgTiles = [];
  function renderBin() {
    var list = $('#binList');
    var mine = project.media.filter(function (m) { return m.kind !== 'bg'; });
    var ids = 'v1:' + mine.map(function (m) { return m.id; }).join(',');
    if (list.dataset.ids === ids) return;
    list.dataset.ids = ids;
    list.innerHTML = '';
    binItems = {}; bgTiles = [];
    // fun backgrounds first: always there, animated, tap to add one to the movie
    if (BGS.length) {
      list.appendChild(el('div', 'binSec', 'FUN BACKGROUNDS'));
      BGS.forEach(function (def) {
        var d = el('div', 'bItem bg');
        var c = document.createElement('canvas');
        c.width = 160; c.height = 100;
        d.appendChild(c);
        d.appendChild(el('div', 'dur', def.label));
        var add = el('div', 'add', '+');
        d.appendChild(add);
        d.addEventListener('click', function () { addBackground(def); });
        list.appendChild(d);
        bgTiles.push({ c: c, def: def });
      });
      drawBgTiles(1.5);
      list.appendChild(el('div', 'binSec', 'MY VIDEOS AND PHOTOS'));
    }
    if (!mine.length) {
      list.appendChild(el('div', 'binEmpty', 'Tap + ADD or RECORD to bring in videos and photos.'));
      return;
    }
    mine.forEach(function (m) {
      var d = document.createElement('div');
      d.className = 'bItem';
      var c = document.createElement('canvas');
      c.width = 160; c.height = 100;
      d.appendChild(c);
      var dur = document.createElement('div');
      dur.className = 'dur';
      dur.textContent = m.kind === 'image' ? 'PHOTO' : fmt(m.dur);
      d.appendChild(dur);
      var add = document.createElement('div');
      add.className = 'add'; add.textContent = '+';
      d.appendChild(add);
      var top = document.createElement('button');
      top.className = 'top'; top.textContent = 'ON TOP';
      top.title = 'Put it on top of the movie (for green screen)';
      d.appendChild(top);
      d.addEventListener('click', function (e) {
        if (e.target === top) return;
        addMainAtPlayhead(m);
      });
      top.addEventListener('click', function () { addTopAtPlayhead(m); });
      list.appendChild(d);
      binItems[m.id] = c;
      renderBinThumb(m);
    });
  }
  function drawBgTiles(t) {
    bgTiles.forEach(function (b) {
      var x = b.c.getContext('2d');
      x.save(); b.def.draw(x, b.c.width, b.c.height, t); x.restore();
    });
  }
  // the tiles move gently while nothing heavy is going on
  setInterval(function () {
    if (exporting || playing || document.hidden || !bgTiles.length) return;
    drawBgTiles(performance.now() / 1000);
  }, 120);
  // A fun background goes into the movie at the line. Into an empty movie with clips on top,
  // it is made as long as they are, so it sits right under them.
  function addBackground(def) {
    var m = null;
    for (var i = 0; i < project.media.length; i++) if (project.media[i].kind === 'bg' && project.media[i].gen === def.id) m = project.media[i];
    if (!m) {
      m = { id: uid(), kind: 'bg', gen: def.id, name: def.label, dur: PHOTO_MAX, w: 16, h: 9 };
      bgRuntime(m);
      project.media.push(m);
    }
    var emptyUnderTop = project.main.length === 0 && project.top.length > 0;
    addMainAtPlayhead(m);
    if (emptyUnderTop) {
      project.main[0].autoLen = true;   // keeps matching the clips on top (fitAutoBackground)
      changed();
    }
  }
  // A background that was sized to the clips on top stays as long as they are when they're
  // trimmed or moved -- otherwise the movie kept playing the background alone after them.
  // Trimming the background by hand (doTrim) hands its length back to the kid.
  function fitAutoBackground() {
    if (project.main.length !== 1 || !project.main[0].autoLen) return;
    var end = 0, i;
    for (i = 0; i < project.top.length; i++) end = Math.max(end, project.top[i].start + clipLen(project.top[i]));
    if (end <= 0) return;
    var c = project.main[0];
    c.out = c.in + clamp(end, MIN_LEN, PHOTO_MAX);
  }
  function bgRuntime(m) {
    if (rt[m.id]) return;
    var cv = document.createElement('canvas');
    rt[m.id] = { url: null, bg: cv, bgCtx: cv.getContext('2d'), bgT: -1, ready: false };
    makeStrip(m);
  }
  // this background's picture at time t, sized to the movie's shape
  function bgFrame(m, t) {
    var r = rt[m.id];
    if (!r) { bgRuntime(m); r = rt[m.id]; }
    var w = Math.max(16, Math.round(outW * 0.6)), h = Math.max(16, Math.round(outH * 0.6));
    if (r.bg.width !== w || r.bg.height !== h) { r.bg.width = w; r.bg.height = h; r.bgT = -1; }
    if (r.bgT !== t) {
      r.bgCtx.save();
      bgDef(m.gen).draw(r.bgCtx, w, h, t);
      r.bgCtx.restore();
      r.bgT = t;
    }
    return r.bg;
  }
  function renderBinThumb(m) {
    var c = binItems[m.id], r = rt[m.id];
    if (!c || !r || !r.strip) return;
    var x = c.getContext('2d');
    var i = r.stripN > 2 ? Math.floor(r.stripN / 2) : 0;
    x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
    drawCover(x, r.strip, 0, 0, c.width, c.height, 0, 0);
    // draw just one frame of the strip, covering the tile
    var s = Math.max(c.width / r.tw, c.height / r.th);
    var w = r.tw * s, h = r.th * s;
    x.drawImage(r.strip, i * r.tw, 0, r.tw, r.th, (c.width - w) / 2, (c.height - h) / 2, w, h);
  }

  function addMainAtPlayhead(m) {
    pushUndo();
    var c = newMainClip(m);
    var idx = project.main.length, s = 0;
    for (var i = 0; i < project.main.length; i++) {
      var L = clipLen(project.main[i]);
      if (playT < s + L) { idx = playT < s + L / 2 ? i : i + 1; break; }
      s += L;
    }
    project.main.splice(idx, 0, c);
    sel = { layer: 'main', id: c.id };
    playT = mainStart(c) + 0.001;
    changed();
    toast('ADDED TO THE MOVIE');
  }
  function addTopAtPlayhead(m) {
    pushUndo();
    var c = newTopClip(m, Math.min(playT, Math.max(0, mainTotal() - 0.5)));
    if (project.main.length === 0) c.start = 0;
    project.top.push(c);
    sel = { layer: 'top', id: c.id };
    playT = c.start + 0.001;
    changed();
    toast('ON TOP! TRY GREEN SCREEN');
  }

  // ---------------------------------------------------------------- output canvas + WebGL
  var outW = 960, outH = 540;
  function setOutSize(forExport) {
    var sh = SHAPES[project.aspect] || SHAPES.wide;
    var long = forExport ? 1280 : 960;
    if (sh.w >= sh.h) { outW = long; outH = Math.round(long * sh.h / sh.w / 2) * 2; }
    else { outH = long; outW = Math.round(long * sh.w / sh.h / 2) * 2; }
    if (project.aspect === 'square') { outW = outH = forExport ? 1080 : 720; }
    view.width = outW; view.height = outH;
    glc.width = outW; glc.height = outH;
    dirty = true;
  }

  var glc = document.createElement('canvas');
  var gl = null, prog = null, loc = {}, quadBuf = null;
  (function initGL() {
    try { gl = glc.getContext('webgl', { premultipliedAlpha: false, alpha: false, antialias: false, preserveDrawingBuffer: true }); } catch (e) { gl = null; }
    if (!gl) return;
    var vs = [
      'attribute vec2 p;',
      'uniform vec4 uRect;',
      'varying vec2 vUV;',
      'void main() {',
      '  vec2 q = uRect.xy + p * uRect.zw;',
      '  gl_Position = vec4(q.x * 2.0 - 1.0, 1.0 - q.y * 2.0, 0.0, 1.0);',
      '  vUV = p;',
      '}'
    ].join('\n');
    var fs = [
      'precision mediump float;',
      'uniform sampler2D tex;',
      'uniform float uKey, uSim, uSoft, uSpill, uAlpha;',
      'uniform vec3 uKeyCol;',
      'uniform vec2 uTexel;',
      'uniform sampler2D uMaskTex;',
      'uniform float uCut, uCutEdge;',
      'varying vec2 vUV;',
      'vec2 cbcr(vec3 c) { return vec2(dot(c, vec3(-0.1687, -0.3313, 0.5)), dot(c, vec3(0.5, -0.4187, -0.0813))); }',
      'float dist(vec2 uv, vec2 k) { return distance(cbcr(texture2D(tex, uv).rgb), k); }',
      'void main() {',
      '  vec4 c = texture2D(tex, vUV);',
      '  vec3 rgb = c.rgb;',
      '  float a = 1.0;',
      '  if (uKey > 0.5) {',
      '    vec2 k = cbcr(uKeyCol);',
      // a little box blur of the distance keeps camera noise from fizzing at the edges
      '    float d = distance(cbcr(rgb), k) * 0.4;',
      '    d += dist(vUV + vec2(uTexel.x, 0.0), k) * 0.15;',
      '    d += dist(vUV - vec2(uTexel.x, 0.0), k) * 0.15;',
      '    d += dist(vUV + vec2(0.0, uTexel.y), k) * 0.15;',
      '    d += dist(vUV - vec2(0.0, uTexel.y), k) * 0.15;',
      // the soft edge is centred on the strength and never wider than it, so STRENGTH 0 keys nothing
      '    float sh = min(uSoft, uSim * 2.0) * 0.5;',
      '    a = uSim < 0.001 ? 1.0 : smoothstep(uSim - sh, uSim + sh + 0.0001, d);',
      // spill: pull the key colour out of what's left near the edges (fades out with strength too)
      '    float base = d - uSim;',
      '    float s = pow(clamp(base / max(uSpill, 0.001), 0.0, 1.0), 1.5);',
      '    s = mix(1.0, s, clamp(uSim / 0.05, 0.0, 1.0));',
      '    float lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));',
      '    rgb = mix(vec3(lum), rgb, s);',
      '  }',
      // CUT OUT PERSON: the segmenter's person mask (bilinear-filtered, so the edge is smooth)
      '  if (uCut > 0.5) a *= smoothstep(uCutEdge - 0.12, uCutEdge + 0.12, texture2D(uMaskTex, vUV).r);',
      '  gl_FragColor = vec4(rgb, a * uAlpha);',
      '}'
    ].join('\n');
    function sh(type, src) {
      var s = gl.createShader(type);
      gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    }
    try {
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, vs));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, fs));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    } catch (e) { console.warn(e); gl = null; return; }
    gl.useProgram(prog);
    ['uRect', 'tex', 'uKey', 'uSim', 'uSoft', 'uSpill', 'uAlpha', 'uKeyCol', 'uTexel', 'uMaskTex', 'uCut', 'uCutEdge'].forEach(function (n) { loc[n] = gl.getUniformLocation(prog, n); });
    loc.p = gl.getAttribLocation(prog, 'p');
    quadBuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc.p);
    gl.vertexAttribPointer(loc.p, 2, gl.FLOAT, false, 0, 0);
    gl.uniform1i(loc.tex, 0);
    gl.uniform1i(loc.uMaskTex, 1);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);   // the one-byte-per-pixel person masks
  })();
  setOutSize(false);

  function newTex() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return t;
  }

  // ---------------------------------------------------------------- audio
  var actx = null, master = null, recDest = null;
  function ensureAudio() {
    if (actx) { if (actx.state === 'suspended') actx.resume().catch(function () {}); return; }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      actx = new AC();
      master = actx.createGain();
      master.connect(actx.destination);
      if (actx.createMediaStreamDestination) { recDest = actx.createMediaStreamDestination(); master.connect(recDest); }
      els.forEach(connectAudio);
    } catch (e) { actx = null; }
  }
  function connectAudio(e) {
    if (!actx || e.node) return;
    try {
      e.node = actx.createMediaElementSource(e.el);
      e.gain = actx.createGain();
      e.node.connect(e.gain); e.gain.connect(master);
    } catch (err) { e.node = null; }
  }
  function setVol(e, v) {
    if (e.gain) { e.gain.gain.value = v; e.el.volume = 1; }
    else e.el.volume = clamp(v, 0, 1);
    e.el.muted = v <= 0;
  }

  // ---------------------------------------------------------------- video elements (one per clip)
  var els = new Map();   // clip id -> { el, media, loaded, tex, node, gain, used }
  // While a video plays, currentTime runs ahead of the frame actually on show (the decoder works
  // ahead -- by 0.1 s or more on phones). The picture we draw is the frame on show, so anything
  // matched to it (the cut-out masks) must use that frame's own time, which
  // requestVideoFrameCallback reports.
  function watchFrames(e) {
    if (!e.el.requestVideoFrameCallback) return;
    var cb = function (now, meta) {
      e.frameTime = meta.mediaTime; e.frameAt = performance.now();
      e.el.requestVideoFrameCallback(cb);
    };
    e.el.requestVideoFrameCallback(cb);
  }
  function shownTime(e) {
    var el = e.el;
    if (playing && !el.paused && e.frameTime != null && performance.now() - e.frameAt < 300) return e.frameTime;
    return el.currentTime;
  }
  function getEl(clip) {
    var e = els.get(clip.id);
    if (!e) {
      var el = document.createElement('video');
      el.playsInline = true; el.setAttribute('playsinline', ''); el.preload = 'auto';
      mediaBox.appendChild(el);
      e = { el: el, media: clip.media, loaded: false, tex: null, node: null, gain: null, used: 0, hasFrame: false };
      el.addEventListener('seeked', function () { dirty = true; });
      el.addEventListener('loadeddata', function () { dirty = true; });
      els.set(clip.id, e);
      connectAudio(e);
      watchFrames(e);
    }
    if (!e.loaded && rt[clip.media]) { e.el.src = rt[clip.media].url; e.loaded = true; e.hasFrame = false; }
    e.used = performance.now();
    return e;
  }
  function gcEls() {
    var live = {}, now = performance.now();
    project.main.concat(project.top).forEach(function (c) { live[c.id] = 1; });
    segCache.forEach(function (mc, id) { if (!live[id]) { if (gl) gl.deleteTexture(mc.tex); segCache.delete(id); } });
    els.forEach(function (e, id) {
      var dead = !live[id];
      if (dead || (e.loaded && now - e.used > 8000)) {
        e.el.pause();
        e.el.removeAttribute('src'); e.el.load();
        e.loaded = false; e.hasFrame = false;
        if (dead) {
          if (e.tex && gl) gl.deleteTexture(e.tex);
          if (e.node) try { e.node.disconnect(); e.gain.disconnect(); } catch (err) {}
          e.el.remove();
          els.delete(id);
        }
      }
    });
  }
  setInterval(gcEls, 3000);

  function activeAt(t) {
    var out = [], s = 0, i;
    for (i = 0; i < project.main.length; i++) {
      var c = project.main[i], L = clipLen(c);
      if (t >= s && t < s + L) { out.push({ clip: c, layer: 'main', local: t - s, src: c.in + (t - s), start: s }); break; }
      s += L;
    }
    for (i = 0; i < project.top.length; i++) {
      var d = project.top[i];
      if (t >= d.start && t < d.start + clipLen(d)) out.push({ clip: d, layer: 'top', local: t - d.start, src: d.in + (t - d.start), start: d.start });
    }
    return out;
  }
  function isVideoClip(c) { var m = mediaById(c.media); return m && m.kind === 'video'; }

  // Keep the video elements where the timeline says they should be.
  function syncMedia(t) {
    var act = activeAt(t), want = {}, i;
    for (i = 0; i < act.length; i++) {
      var a = act[i];
      if (!isVideoClip(a.clip)) continue;
      var e = getEl(a.clip), el = e.el;
      want[a.clip.id] = 1;
      a.e = e;
      setVol(e, a.clip.vol == null ? 1 : a.clip.vol);
      if (el.readyState < 1) continue;
      if (playing) {
        // pull a drifting clip back into line -- but at most once a second: on a slow phone,
        // correcting again before the last seek settled made a stutter loop
        var nowMs = performance.now();
        if (!el.seeking && Math.abs(el.currentTime - a.src) > 0.35 && nowMs - (e.lastSeek || 0) > 1000) {
          el.currentTime = a.src; e.lastSeek = nowMs;
        }
        if (el.paused) { var p = el.play(); if (p && p.catch) p.catch(function () {}); }
      } else {
        if (!el.paused) el.pause();
        if (!el.seeking && Math.abs(el.currentTime - a.src) > 0.02) el.currentTime = a.src;
      }
    }
    // get the next clips ready before the playhead reaches them
    var ahead = playing ? 1.5 : 0.6, s = 0;
    for (i = 0; i < project.main.length; i++) {
      var c = project.main[i], L = clipLen(c);
      if (s > t && s <= t + ahead) prerollClip(c, want);
      s += L;
      if (s > t + ahead) break;
    }
    for (i = 0; i < project.top.length; i++) {
      var d = project.top[i];
      if (d.start > t && d.start <= t + ahead) prerollClip(d, want);
    }
    els.forEach(function (e, id) { if (!want[id] && !e.el.paused) e.el.pause(); });
    return act;
  }
  function prerollClip(c, want) {
    if (!isVideoClip(c)) return;
    var e = getEl(c);
    want[c.id] = 1;
    if (!e.el.paused) e.el.pause();
    if (e.el.readyState >= 1 && !e.el.seeking && Math.abs(e.el.currentTime - c.in) > 0.05) e.el.currentTime = c.in;
  }

  // ---------------------------------------------------------------- drawing a frame
  var lastBoxes = {};   // item id -> { x, y, w, h } in output pixels, for dragging in the preview
  var imgTex = {};      // media id -> texture

  function srcSize(a) {
    var m = mediaById(a.clip.media);
    if (m.kind === 'video' && a.e && a.e.el.videoWidth) return [a.e.el.videoWidth, a.e.el.videoHeight];
    if (m.kind === 'bg') return [outW, outH];   // backgrounds are drawn to the movie's own shape
    return [m.w, m.h];
  }
  // Where a clip lands on the output, in output pixels.
  function clipRect(a) {
    var sz = srcSize(a), sw = sz[0], sh = sz[1], c = a.clip;
    var fit = Math.min(outW / sw, outH / sh), fill = Math.max(outW / sw, outH / sh);
    var s, cx = outW / 2, cy = outH / 2;
    if (a.layer === 'main') {
      s = c.fit === 'fill' ? fill : fit;
      var m = mediaById(c.media);
      if (m.kind === 'image' && c.motion && c.motion !== 'none') {
        var k = clamp(a.local / Math.max(0.1, clipLen(c)), 0, 1);
        k = k * k * (3 - 2 * k) * 0.6 + k * 0.4;
        s *= c.motion === 'zoomin' ? 1 + 0.15 * k : 1.15 - 0.15 * k;
      }
    } else {
      s = fit * c.scale;
      cx = c.x * outW; cy = c.y * outH;
    }
    var w = sw * s, h = sh * s;
    return { x: cx - w / 2, y: cy - h / 2, w: w, h: h };
  }
  function clipAlpha(a) {
    if (a.layer !== 'main' || !a.clip.fade) return 1;
    var L = clipLen(a.clip), f = 0.45;
    return clamp(Math.min(a.local / f, (L - a.local) / f), 0, 1);
  }
  function sourceFor(a) {
    var m = mediaById(a.clip.media);
    if (m.kind === 'image') return rt[m.id] && rt[m.id].img;
    if (m.kind === 'bg') return bgFrame(m, a.local);
    if (a.e && a.e.el.readyState >= 2) return a.e.el;
    return null;
  }

  function renderFrame(t, forExport) {
    var T = total();
    var rt_ = (!playing && T > 0 && t >= T) ? Math.max(0, T - 0.02) : t;
    var act = syncMedia(rt_);
    lastBoxes = {};
    if (gl) {
      gl.viewport(0, 0, outW, outH);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (var i = 0; i < act.length; i++) drawClipGL(act[i]);
      octx.drawImage(glc, 0, 0);
    } else {
      octx.fillStyle = '#000'; octx.fillRect(0, 0, outW, outH);
      for (var j = 0; j < act.length; j++) {
        var a = act[j], src = sourceFor(a);
        var r = clipRect(a);
        if (a.layer === 'top') lastBoxes[a.clip.id] = r;
        if (!src) continue;
        octx.globalAlpha = clipAlpha(a);
        octx.drawImage(src, r.x, r.y, r.w, r.h);
        octx.globalAlpha = 1;
      }
    }
    drawTexts(rt_);
    if (!forExport) drawSelection(rt_);
  }

  function drawClipGL(a) {
    var m = mediaById(a.clip.media), tex, src = sourceFor(a);
    var r = clipRect(a);
    if (a.layer === 'top') lastBoxes[a.clip.id] = r;
    // CUT OUT PERSON: work out (or reuse) this frame's person mask on texture unit 1
    var mc = null;
    if (a.layer === 'top' && a.clip.cut && a.clip.cut.on) {
      if (seg.state === 'idle') loadSegmenter().catch(function () {});
      if (src) {
        gl.activeTexture(gl.TEXTURE1);
        mc = maskFor(a, src);
        if (mc) gl.bindTexture(gl.TEXTURE_2D, mc.tex);
        gl.activeTexture(gl.TEXTURE0);
      } else mc = segCache.get(a.clip.id) || null;
      if (mc && !mc.w) mc = null;
    }
    if (m.kind === 'bg') {
      // animated: a fresh picture every frame
      tex = imgTex[m.id] || (imgTex[m.id] = newTex());
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
    } else if (m.kind === 'image') {
      if (!src) return;
      tex = imgTex[m.id];
      if (!tex) {
        tex = imgTex[m.id] = newTex();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      }
      gl.bindTexture(gl.TEXTURE_2D, tex);
    } else {
      var e = a.e;
      if (!e) return;
      if (!e.tex) e.tex = newTex();
      gl.bindTexture(gl.TEXTURE_2D, e.tex);
      if (src) {
        try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src); e.hasFrame = true; } catch (err) { return; }
      } else if (!e.hasFrame) return;
    }
    var sz = srcSize(a);
    var k = a.layer === 'top' && a.clip.key && a.clip.key.on ? a.clip.key : null;
    gl.uniform4f(loc.uRect, r.x / outW, r.y / outH, r.w / outW, r.h / outH);
    gl.uniform1f(loc.uKey, k ? 1 : 0);
    if (k) {
      gl.uniform3f(loc.uKeyCol, k.color[0], k.color[1], k.color[2]);
      gl.uniform1f(loc.uSim, k.sim); gl.uniform1f(loc.uSoft, k.soft); gl.uniform1f(loc.uSpill, k.spill);
    }
    gl.uniform2f(loc.uTexel, 1.5 / sz[0], 1.5 / sz[1]);
    gl.uniform1f(loc.uAlpha, clipAlpha(a));
    gl.uniform1f(loc.uCut, mc ? 1 : 0);
    if (mc) {
      gl.uniform1f(loc.uCutEdge, a.clip.cut.edge == null ? 0.5 : a.clip.cut.edge);
      if (!src) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, mc.tex); gl.activeTexture(gl.TEXTURE0); }
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  // ---------------------------------------------------------------- CUT OUT PERSON
  // Google's MediaPipe selfie segmenter finds the person in each frame. It loads from the web
  // (jsDelivr + Google's model bucket) the first time a clip turns it on, so it only works on
  // the website, not from file:// -- everything else in DreamReel still works offline.
  var MP_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
  var MP_MODEL = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/1/selfie_segmenter.tflite';
  var SEG_LONG = 320;   // frames are shrunk to this before segmenting (the mask is smoothed back up)
  var seg = { state: 'idle', tool: null, promise: null, lastTs: 0 };
  var segCanvas = document.createElement('canvas'), segCtx = segCanvas.getContext('2d');
  var segCache = new Map();   // clip id -> { key, tex, data, w, h }
  function loadSegmenter() {
    if (seg.state === 'ready') return Promise.resolve(seg.tool);
    if (seg.promise) return seg.promise;
    seg.state = 'loading';
    var importer;
    // built at run time so an old browser that can't parse import() still runs the rest of the game
    try { importer = new Function('u', 'return import(u);'); } catch (e) { importer = null; }
    if (!importer || location.protocol === 'file:') {
      seg.state = 'failed';
      return Promise.reject(new Error('unavailable'));
    }
    seg.promise = importer(MP_BASE + '/vision_bundle.mjs').then(function (vision) {
      return vision.FilesetResolver.forVisionTasks(MP_BASE + '/wasm').then(function (files) {
        function make(delegate) {
          return vision.ImageSegmenter.createFromOptions(files, {
            baseOptions: { modelAssetPath: MP_MODEL, delegate: delegate },
            runningMode: 'VIDEO', outputCategoryMask: false, outputConfidenceMasks: true
          });
        }
        return make('GPU').catch(function () { return make('CPU'); });
      });
    }).then(function (tool) {
      seg.tool = tool; seg.state = 'ready'; dirty = true;
      return tool;
    }, function (e) {
      console.warn('cut out person:', e);
      seg.state = 'failed'; seg.promise = null;
      throw e;
    });
    return seg.promise;
  }
  // ---- buffering: work the masks out once per video, ahead of time, so playback just looks
  // them up. A hidden copy of the video plays through (muted) and every presented frame
  // (requestVideoFrameCallback) up to MASK_FPS a second is segmented and kept as bytes. If the
  // device is too slow to keep up, the hidden copy plays slower. One video at a time.
  var MASK_LONG = 256, MASK_FPS = 15, MASK_NEAR = 0.15;
  var maskStore = {};   // media id -> { state, times, masks, w, h, progress }
  var prepChain = Promise.resolve();
  function prepCutOut(m) {
    if (!m || m.kind !== 'video' || !rt[m.id]) return null;
    var s = maskStore[m.id];
    if (s) return s;
    s = maskStore[m.id] = { state: 'waiting', times: [], masks: [], w: 0, h: 0, progress: 0 };
    prepChain = prepChain.then(function () {
      if (maskStore[m.id] !== s) return;   // started over meanwhile
      return loadSegmenter().then(function () { return runPrep(m, s); }, function () { s.state = 'failed'; });
    });
    return s;
  }
  function runPrep(m, s) {
    s.state = 'preparing'; tlDirty = true;
    var v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    mediaBox.appendChild(v);
    v.src = rt[m.id].url;
    var c = document.createElement('canvas'), x = c.getContext('2d');
    var lastKept = -1, avgMs = 0, filling = false, fillFrom = 0;
    function grab(mediaTime) {
      if (lastKept >= 0 && mediaTime - lastKept < 1 / MASK_FPS - 0.005) return;
      var vw = v.videoWidth, vh = v.videoHeight;
      if (!vw || !vh) return;
      var k = MASK_LONG / Math.max(vw, vh), w = Math.max(16, Math.round(vw * k)), h = Math.max(16, Math.round(vh * k));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      var t0 = performance.now();
      x.drawImage(v, 0, 0, w, h);
      var ts = Math.max(performance.now(), seg.lastTs + 1);
      seg.lastTs = ts;
      seg.tool.segmentForVideo(c, ts, function (res) {
        var ms = res && res.confidenceMasks;
        if (!ms || !ms.length) return;
        var mk = ms[ms.length - 1], f = mk.getAsFloat32Array(), n = f.length;
        // (not while filling gaps: those frames arrive out of order)
        var prev = !filling && s.masks.length && s.w === mk.width ? s.masks[s.masks.length - 1] : null;
        var out = new Uint8Array(n);
        // a little of the frame before keeps the edge from shimmering
        for (var i = 0; i < n; i++) out[i] = prev ? f[i] * 178 + prev[i] * 0.3 : f[i] * 255;
        s.masks.push(out); s.times.push(mediaTime);
        s.w = mk.width; s.h = mk.height;
      });
      lastKept = mediaTime;
      var took = performance.now() - t0;
      avgMs = avgMs ? avgMs * 0.8 + took * 0.2 : took;
      // too slow for real time? play the hidden copy slower so fewer frames are skipped
      if (v.playbackRate !== undefined) v.playbackRate = clamp(1000 / MASK_FPS / Math.max(1, avgMs), 0.25, 1);
      if (!filling) s.progress = m.dur ? clamp(mediaTime / m.dur, 0, 1) * 0.95 : 0;
      tlDirty = true;
    }
    return new Promise(function (resolve) {
      var done = false;
      function finish(ok) {
        if (done) return;
        done = true;
        v.pause(); v.removeAttribute('src'); v.load(); v.remove();
        s.state = ok && s.masks.length ? 'ready' : 'failed';
        s.progress = 1; dirty = true; tlDirty = true;
        if (sel && findItem(sel) && sel.layer === 'top') renderInspector();
        resolve();
      }
      // Second pass: seek to every moment the playing pass missed (frames are only delivered while
      // the page is painting -- a dimmed screen or background tab skips them), or do it all this
      // way where requestVideoFrameCallback doesn't exist.
      function fillGaps() {
        if (done || filling) return;
        filling = true;
        fillFrom = s.progress;
        v.pause();
        var want = [], step = 1 / MASK_FPS;
        for (var t = 0; t < m.dur; t += step) if (!covered(t, step * 0.75)) want.push(t);
        var i = 0;
        (function next() {
          if (done) return;
          if (i >= want.length) { sortStore(s); finish(true); return; }
          var t = want[i++];
          seekTo(v, t).then(function () {
            try { lastKept = -1; grab(t); } catch (err) {}
            s.progress = fillFrom + (1 - fillFrom) * i / want.length;
            next();
          });
        })();
      }
      function covered(t, d) {
        for (var k = 0; k < s.times.length; k++) if (Math.abs(s.times[k] - t) <= d) return true;
        return false;
      }
      function onFrame(now, meta) {
        if (done || filling) return;
        try { grab(meta.mediaTime); } catch (err) {}
        if (!v.ended) v.requestVideoFrameCallback(onFrame);
      }
      function stepSeek() { fillGaps(); }
      v.addEventListener('ended', fillGaps);
      v.addEventListener('error', function () { finish(false); });
      waitEvent(v, 'loadeddata', 'error', 15000).then(function () {
        if (v.requestVideoFrameCallback) {
          v.requestVideoFrameCallback(onFrame);
          var p = v.play();
          if (p && p.catch) p.catch(function () { stepSeek(0); });
        } else stepSeek(0);
      }, function () { finish(false); });
    });
  }
  function sortStore(s) {
    var idx = s.times.map(function (t, i) { return i; }).sort(function (a, b) { return s.times[a] - s.times[b]; });
    s.times = idx.map(function (i) { return s.times[i]; });
    s.masks = idx.map(function (i) { return s.masks[i]; });
  }
  function nearestMask(s, t) {
    var a = s.times, lo = 0, hi = a.length - 1;
    if (hi < 0) return -1;
    while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (a[mid] < t) lo = mid; else hi = mid; }
    var i = Math.abs(a[lo] - t) <= Math.abs(a[hi] - t) ? lo : hi;
    return Math.abs(a[i] - t) <= MASK_NEAR ? i : -1;
  }

  // The person mask for this clip's current frame, uploaded to the bound texture (unit 1).
  function maskFor(a, src) {
    if (!seg.tool) return null;
    var e = a.e;
    var frameKey = e ? shownTime(e).toFixed(3) : 'still';
    var mc = segCache.get(a.clip.id);
    if (!mc) { mc = { key: '', tex: newTex(), data: null, w: 0, h: 0 }; segCache.set(a.clip.id, mc); }
    if (mc.key === frameKey) return mc;
    // buffered masks first: no model work during playback
    if (e) {
      var store = prepCutOut(mediaById(a.clip.media));
      if (store && store.masks.length) {
        var mi = nearestMask(store, shownTime(e));
        if (mi >= 0) {
          if (mc.bufIdx !== mi || mc.w !== store.w) {
            gl.bindTexture(gl.TEXTURE_2D, mc.tex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, store.w, store.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, store.masks[mi]);
            mc.bufIdx = mi; mc.w = store.w; mc.h = store.h;
          }
          mc.key = frameKey;
          return mc;
        }
      }
    }
    mc.bufIdx = -1;
    var sz = srcSize(a), k = SEG_LONG / Math.max(sz[0], sz[1]);
    var w = Math.max(16, Math.round(sz[0] * k)), h = Math.max(16, Math.round(sz[1] * k));
    if (segCanvas.width !== w || segCanvas.height !== h) { segCanvas.width = w; segCanvas.height = h; }
    try { segCtx.drawImage(src, 0, 0, w, h); } catch (err) { return mc.w ? mc : null; }
    var ts = Math.max(performance.now(), seg.lastTs + 1);
    seg.lastTs = ts;
    var got = false;
    try {
      seg.tool.segmentForVideo(segCanvas, ts, function (res) {
        var masks = res && res.confidenceMasks;
        if (!masks || !masks.length) return;
        var mk = masks[masks.length - 1];      // the selfie model's one mask: how sure it is this is a person
        var f = mk.getAsFloat32Array(), n = f.length;
        // while playing, average with the last frame so the edge doesn't shimmer
        var blend = playing && mc.data && mc.data.length === n && mc.w === mk.width;
        if (!mc.data || mc.data.length !== n) mc.data = new Uint8Array(n);
        for (var i = 0; i < n; i++) {
          var v = f[i] * 255;
          mc.data[i] = blend ? (mc.data[i] + v) * 0.5 : v;
        }
        mc.w = mk.width; mc.h = mk.height;
        got = true;
      });
    } catch (err) { return mc.w ? mc : null; }
    if (got) {
      gl.bindTexture(gl.TEXTURE_2D, mc.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, mc.w, mc.h, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mc.data);
      mc.key = frameKey;
    }
    return mc.w ? mc : null;
  }
  function startCutOut(c) {
    if (!gl) { toast('CUT OUT NEEDS A NEWER BROWSER', 3000); return; }
    var m = mediaById(c.media);
    if (seg.state === 'ready') { prepCutOut(m); return; }
    toast('GETTING CUT OUT READY...', 60000);
    loadSegmenter().then(function () {
      prepCutOut(m);
      toast(m && m.kind === 'video' ? 'CUT OUT IS GETTING YOUR CLIP READY...' : 'CUT OUT IS READY!', 3000);
    }, function () {
      toast(location.protocol === 'file:' ? 'CUT OUT ONLY WORKS ON THE WEBSITE' : 'CUT OUT NEEDS THE INTERNET -- TRY AGAIN', 4000);
      if (c.cut) c.cut.on = false;
      changed();
    });
  }

  // ---------------------------------------------------------------- words
  function backOut(k) { var s = 1.9; k -= 1; return k * k * ((s + 1) * k + s) + 1; }
  function easeOut(k) { return 1 - Math.pow(1 - k, 3); }
  function bounceOut(k) {
    if (k < 1 / 2.75) return 7.5625 * k * k;
    if (k < 2 / 2.75) { k -= 1.5 / 2.75; return 7.5625 * k * k + 0.75; }
    if (k < 2.5 / 2.75) { k -= 2.25 / 2.75; return 7.5625 * k * k + 0.9375; }
    k -= 2.625 / 2.75; return 7.5625 * k * k + 0.984375;
  }
  function isLight(hex) {
    var n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return r * 0.3 + g * 0.59 + b * 0.11 > 150;
  }
  function textFont(st, px) {
    if (st === 'pop') return '900 ' + px + 'px "Arial Black", "Arial Bold", Arial, sans-serif';
    if (st === 'comic') return 'bold ' + px + 'px "Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive';
    return 'bold ' + px + 'px "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
  }
  function wrapLines(x, text, maxW) {
    var out = [];
    String(text).split('\n').forEach(function (para) {
      var words = para.split(' '), line = '';
      words.forEach(function (w) {
        var test = line ? line + ' ' + w : w;
        if (line && x.measureText(test).width > maxW) { out.push(line); line = w; }
        else line = test;
      });
      out.push(line);
    });
    return out;
  }
  function drawTexts(t) {
    for (var i = 0; i < project.text.length; i++) {
      var it = project.text[i];
      if (t >= it.start && t < it.start + it.dur) drawText(it, t - it.start);
    }
  }
  function drawText(it, lt) {
    var x = octx, base = Math.min(outW, outH);
    var px = Math.max(8, Math.round(it.size * base));
    var st = it.style, anim = it.anim;
    var inK = clamp(lt / 0.45, 0, 1), dur = it.dur;
    var alpha = clamp(Math.min(lt / 0.15, (dur - lt) / 0.25), 0, 1);
    var sc = 1, rot = 0, dx = 0, dy = 0, color = it.color, txt = it.text || ' ';
    if (anim === 'pop') sc = Math.max(0.01, backOut(inK));
    else if (anim === 'slide') dx = -(1 - easeOut(inK)) * outW * 1.1;
    else if (anim === 'bounce') { var bk = clamp(lt / 0.8, 0, 1); dy = -(1 - bounceOut(bk)) * outH * 0.7; }
    else if (anim === 'type') { var n = Math.floor(clamp(lt / Math.max(0.3, Math.min(2, txt.length * 0.07)), 0, 1) * txt.length); txt = txt.slice(0, n); alpha = Math.min(1, (dur - lt) / 0.25); }
    else if (anim === 'wiggle') rot = Math.sin(lt * 9) * 0.09;
    else if (anim === 'spin') { rot = (1 - easeOut(clamp(lt / 0.7, 0, 1))) * Math.PI * 2; sc = Math.max(0.01, easeOut(clamp(lt / 0.7, 0, 1))); }
    else if (anim === 'rainbow') color = 'hsl(' + ((lt * 140) % 360) + ', 95%, 62%)';
    if (alpha <= 0) return;

    x.save();
    x.font = textFont(st, px);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    var full = wrapLines(x, it.text || ' ', outW * 0.88);
    var lines = anim === 'type' ? wrapLines(x, txt, outW * 0.88) : full;
    var lh = px * 1.15, wMax = 0;
    full.forEach(function (l) { wMax = Math.max(wMax, x.measureText(l).width); });
    var hTot = lh * full.length;
    var cx = it.x * outW, cy = it.y * outH;
    var padX = px * 0.45, padY = px * 0.25;
    lastBoxes[it.id] = { x: cx - wMax / 2 - padX, y: cy - hTot / 2 - padY, w: wMax + padX * 2, h: hTot + padY * 2 };
    x.globalAlpha = alpha;
    x.translate(cx + dx, cy + dy);
    x.rotate(rot); x.scale(sc, sc);
    var y0 = -hTot / 2 + lh / 2;
    var lineJoinWidth = Math.max(2, px * 0.16);

    if (st === 'bubble') {
      x.fillStyle = color === 'rainbow' ? '#ff4fd8' : color;
      roundRect(x, -wMax / 2 - padX, -hTot / 2 - padY, wMax + padX * 2, hTot + padY * 2, px * 0.5);
      x.fill();
      x.lineWidth = Math.max(2, px * 0.08); x.strokeStyle = 'rgba(0,0,0,0.35)'; x.stroke();
      x.fillStyle = isLight(color.charAt(0) === '#' ? color : '#ff4fd8') ? '#1b1530' : '#ffffff';
      lines.forEach(function (l, i) { x.fillText(l, 0, y0 + i * lh); });
    } else if (st === 'title') {
      x.fillStyle = 'rgba(10, 8, 20, 0.72)';
      var bw = Math.max(wMax + padX * 4, outW * 1.2);
      x.fillRect(-bw / 2 - Math.abs(dx), -hTot / 2 - padY * 1.6, bw + Math.abs(dx) * 2, hTot + padY * 3.2);
      x.fillStyle = color;
      x.shadowColor = 'rgba(0,0,0,0.6)'; x.shadowBlur = px * 0.15; x.shadowOffsetY = px * 0.06;
      lines.forEach(function (l, i) { x.fillText(l, 0, y0 + i * lh); });
    } else if (st === 'neon') {
      x.shadowColor = color; x.shadowBlur = px * 0.6;
      x.lineWidth = Math.max(2, px * 0.08); x.strokeStyle = color;
      lines.forEach(function (l, i) { x.strokeText(l, 0, y0 + i * lh); });
      x.fillStyle = '#ffffff'; x.shadowBlur = px * 0.35;
      lines.forEach(function (l, i) { x.fillText(l, 0, y0 + i * lh); });
    } else if (st === 'comic') {
      x.lineJoin = 'round';
      x.fillStyle = '#111';
      lines.forEach(function (l, i) {
        x.lineWidth = lineJoinWidth; x.strokeStyle = '#111';
        x.strokeText(l, px * 0.07, y0 + i * lh + px * 0.09);
        x.fillText(l, px * 0.07, y0 + i * lh + px * 0.09);
      });
      x.fillStyle = color;
      lines.forEach(function (l, i) { x.strokeText(l, 0, y0 + i * lh); x.fillText(l, 0, y0 + i * lh); });
    } else { // pop
      x.lineJoin = 'round'; x.lineWidth = lineJoinWidth * 1.2;
      x.strokeStyle = color === '#111111' ? '#ffffff' : '#111';
      lines.forEach(function (l, i) { x.strokeText(l, 0, y0 + i * lh); });
      x.fillStyle = color;
      lines.forEach(function (l, i) { x.fillText(l, 0, y0 + i * lh); });
    }
    x.restore();
  }
  function roundRect(x, l, t, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    x.beginPath();
    x.moveTo(l + r, t); x.arcTo(l + w, t, l + w, t + h, r); x.arcTo(l + w, t + h, l, t + h, r);
    x.arcTo(l, t + h, l, t, r); x.arcTo(l, t, l + w, t, r); x.closePath();
  }

  // the dashed box round the picked TOP clip / words in the preview (never in the movie)
  function drawSelection() {
    if (!sel || sel.layer === 'main') return;
    var b = lastBoxes[sel.id];
    if (!b) return;
    var x = octx, lw = Math.max(2, outH / 200);
    x.save();
    x.lineWidth = lw * 2; x.strokeStyle = 'rgba(0,0,0,0.6)';
    x.strokeRect(b.x, b.y, b.w, b.h);
    x.setLineDash([lw * 5, lw * 4]); x.lineWidth = lw; x.strokeStyle = '#ffcf5a';
    x.strokeRect(b.x, b.y, b.w, b.h);
    x.restore();
  }

  // ---------------------------------------------------------------- preview interaction
  function toOut(e) {
    var r = view.getBoundingClientRect();
    var s = Math.min(r.width / outW, r.height / outH);
    var ox = r.left + (r.width - outW * s) / 2, oy = r.top + (r.height - outH * s) / 2;
    return { x: (e.clientX - ox) / s, y: (e.clientY - oy) / s, s: s };
  }
  var pv = { ptrs: new Map(), mode: null };
  view.addEventListener('pointerdown', function (e) {
    ensureAudio();
    try { view.setPointerCapture(e.pointerId); } catch (err) {}
    var p = toOut(e);
    pv.ptrs.set(e.pointerId, p);
    if (pickMode) { pickKeyAt(p); return; }
    var it = findItem(sel);
    if (pv.ptrs.size === 2 && pv.mode === 'move' && it) {
      var ps = Array.from(pv.ptrs.values());
      pv.mode = 'pinch';
      pv.d0 = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      pv.size0 = sel.layer === 'top' ? it.scale : it.size;
      return;
    }
    if (pv.ptrs.size > 1) return;
    // grab the TOP clip / words under the finger (the picked one first)
    var hit = null;
    if (it && sel.layer !== 'main' && inBox(lastBoxes[it.id], p)) hit = sel;
    if (!hit) hit = hitPreview(p);
    if (hit) {
      if (!sel || sel.id !== hit.id) { sel = hit; renderInspector(); tlDirty = true; dirty = true; }
      it = findItem(sel);
      pv.mode = 'move'; pv.p0 = p; pv.x0 = it.x; pv.y0 = it.y; pv.undone = false;
    } else pv.mode = null;
  });
  view.addEventListener('pointermove', function (e) {
    if (!pv.ptrs.has(e.pointerId)) return;
    var p = toOut(e);
    pv.ptrs.set(e.pointerId, p);
    var it = findItem(sel);
    if (!it) return;
    if (pv.mode === 'move' && pv.ptrs.size === 1) {
      var dx = (p.x - pv.p0.x) / outW, dy = (p.y - pv.p0.y) / outH;
      if (!pv.undone && Math.abs(dx) + Math.abs(dy) > 0.004) { pushUndo(); pv.undone = true; }
      if (!pv.undone) return;
      it.x = clamp(pv.x0 + dx, -0.2, 1.2); it.y = clamp(pv.y0 + dy, -0.2, 1.2);
      // gentle snap to the middle
      if (Math.abs(it.x - 0.5) < 0.015) it.x = 0.5;
      if (Math.abs(it.y - 0.5) < 0.015) it.y = 0.5;
      dirty = true; scheduleSave();
    } else if (pv.mode === 'pinch' && pv.ptrs.size >= 2) {
      var ps = Array.from(pv.ptrs.values());
      var d = Math.hypot(ps[0].x - ps[1].x, ps[0].y - ps[1].y);
      if (!pv.undone) { pushUndo(); pv.undone = true; }
      var k = d / Math.max(10, pv.d0);
      if (sel.layer === 'top') it.scale = clamp(pv.size0 * k, 0.1, 3);
      else it.size = clamp(pv.size0 * k, 0.03, 0.35);
      dirty = true; scheduleSave();
      syncInspectorSliders();
    }
  });
  function pvUp(e) {
    pv.ptrs.delete(e.pointerId);
    if (pv.ptrs.size === 0) pv.mode = null;
  }
  view.addEventListener('pointerup', pvUp);
  view.addEventListener('pointercancel', pvUp);
  view.addEventListener('wheel', function (e) {
    var it = findItem(sel);
    if (!it || sel.layer === 'main') return;
    e.preventDefault();
    pushUndoThrottled();
    var k = Math.exp(-e.deltaY * 0.0015);
    if (sel.layer === 'top') it.scale = clamp(it.scale * k, 0.1, 3);
    else it.size = clamp(it.size * k, 0.03, 0.35);
    dirty = true; scheduleSave(); syncInspectorSliders();
  }, { passive: false });
  var lastWheelUndo = 0;
  function pushUndoThrottled() { var n = performance.now(); if (n - lastWheelUndo > 800) pushUndo(); lastWheelUndo = n; }

  function inBox(b, p) { return b && p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; }
  function hitPreview(p) {
    var i;
    for (i = project.text.length - 1; i >= 0; i--) if (inBox(lastBoxes[project.text[i].id], p)) return { layer: 'text', id: project.text[i].id };
    for (i = project.top.length - 1; i >= 0; i--) if (inBox(lastBoxes[project.top[i].id], p)) return { layer: 'top', id: project.top[i].id };
    return null;
  }

  // ---------------------------------------------------------------- green screen colour
  var sampler = document.createElement('canvas');
  sampler.width = 64; sampler.height = 64;
  var sctx = sampler.getContext('2d', { willReadFrequently: true });
  function topSource(c) {
    var a = { clip: c, layer: 'top', local: clamp(playT - c.start, 0, clipLen(c)) };
    if (isVideoClip(c)) a.e = els.get(c.id);
    return { a: a, src: sourceFor(a) };
  }
  function pickKeyAt(p) {
    var c = findItem(sel);
    pickMode = false; $('#pickNote').hidden = true;
    if (!c || sel.layer !== 'top') return;
    var ts = topSource(c);
    var r = lastBoxes[c.id];
    if (!ts.src || !r) { toast('PLAY TO A SPOT WHERE IT SHOWS'); return; }
    var u = (p.x - r.x) / r.w, v = (p.y - r.y) / r.h;
    if (u < 0 || u > 1 || v < 0 || v > 1) { toast('TAP ON THE GREEN PART OF THAT CLIP'); renderInspector(); return; }
    var sz = srcSize(ts.a);
    var sx = u * sz[0], sy = v * sz[1];
    try {
      sctx.clearRect(0, 0, 8, 8);
      sctx.drawImage(ts.src, sx - 3, sy - 3, 7, 7, 0, 0, 7, 7);
      var d = sctx.getImageData(0, 0, 7, 7).data, rr = 0, gg = 0, bb = 0, n = 0;
      for (var i = 0; i < d.length; i += 4) { if (d[i + 3] < 200) continue; rr += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; }
      if (!n) return;
      pushUndo();
      c.key.color = [rr / n / 255, gg / n / 255, bb / n / 255];
      c.key.on = true;
      changed();
      toast('GOT IT! USE STRENGTH IF BITS ARE LEFT');
    } catch (err) { toast("COULDN'T READ THAT COLOUR"); }
  }
  // When green screen is first switched on, guess the colour from the picture's edges.
  function guessKey(c) {
    var ts = topSource(c);
    if (!ts.src) return;
    var sz = srcSize(ts.a);
    try {
      sctx.clearRect(0, 0, 64, 64);
      sctx.drawImage(ts.src, 0, 0, sz[0], sz[1], 0, 0, 64, 64);
      var d = sctx.getImageData(0, 0, 64, 64).data, px = [];
      for (var y = 0; y < 64; y++) for (var x = 0; x < 64; x++) {
        if (x > 3 && x < 60 && y > 3 && y < 60) continue;
        var i = (y * 64 + x) * 4;
        px.push([d[i], d[i + 1], d[i + 2]]);
      }
      var greenish = px.filter(function (q) { return q[1] > q[0] * 1.15 && q[1] > q[2] * 1.15; });
      var blueish = px.filter(function (q) { return q[2] > q[0] * 1.15 && q[2] > q[1] * 1.05; });
      var use = greenish.length >= px.length * 0.25 ? greenish : blueish.length >= px.length * 0.25 ? blueish : null;
      if (!use) return;
      var med = [0, 1, 2].map(function (ch) {
        var v = use.map(function (q) { return q[ch]; }).sort(function (a, b) { return a - b; });
        return v[v.length >> 1] / 255;
      });
      c.key.color = med;
    } catch (err) {}
  }

  // ---------------------------------------------------------------- inspector
  function el(tag, cls, text) { var d = document.createElement(tag); if (cls) d.className = cls; if (text != null) d.textContent = text; return d; }
  function row(label) { var r = el('div', 'row'); if (label) r.appendChild(el('div', 'lbl', label)); return r; }
  function chips(opts, cur, onPick) {
    var c = el('div', 'chips');
    opts.forEach(function (o) {
      var b = el('button', 'chip' + (o.id === cur ? ' on' : ''), o.label);
      b.addEventListener('click', function () { onPick(o.id); });
      c.appendChild(b);
    });
    return c;
  }
  function button(label, cls, fn) { var b = el('button', 'big ' + (cls || ''), label); b.addEventListener('click', fn); return b; }
  var sliders = [];
  function slider(label, min, max, step, get, set) {
    var r = row(label);
    var s = el('input');
    s.type = 'range'; s.min = min; s.max = max; s.step = step; s.value = get();
    s.addEventListener('pointerdown', function () { pushUndo(); });
    s.addEventListener('keydown', function () { pushUndo(); });
    s.addEventListener('input', function () { set(parseFloat(s.value)); dirty = true; tlDirty = true; scheduleSave(); });
    s.addEventListener('change', function () { changed(true); });
    r.appendChild(s);
    sliders.push({ s: s, get: get });
    return r;
  }
  function syncInspectorSliders() { sliders.forEach(function (q) { q.s.value = q.get(); }); }

  function renderInspector() {
    var box = $('#insp');
    box.innerHTML = '';
    sliders = [];
    pickMode = false; $('#pickNote').hidden = true;
    var it = findItem(sel);
    if (!it) return inspectMovie(box);
    if (sel.layer === 'text') return inspectText(box, it);
    var m = mediaById(it.media);
    if (sel.layer === 'main') return inspectMain(box, it, m);
    return inspectTop(box, it, m);
  }

  function inspectMovie(box) {
    box.appendChild(el('div', 'head', 'MY MOVIE'));
    var T = total();
    box.appendChild(el('div', 'note', T > 0 ? 'Your movie is ' + fmt(T) + ' long. Tap a clip on the timeline to change it.' : 'Tap + ADD to bring in videos and photos from this device.'));
    var r = row('SHAPE');
    r.appendChild(chips(Object.keys(SHAPES).map(function (k) { return { id: k, label: SHAPES[k].label }; }), project.aspect, function (id) {
      pushUndo(); project.aspect = id; setOutSize(false); changed();
    }));
    box.appendChild(r);
    var b = el('div', 'btnRow');
    b.appendChild(button('SAVE A PICTURE', 'gold', savePicture));
    b.appendChild(button('START OVER', 'red', confirmStartOver));
    box.appendChild(b);
  }

  function inspectMain(box, c, m) {
    var isBg = m.kind === 'bg';
    box.appendChild(el('div', 'head', isBg ? m.name : m.kind === 'image' ? 'PHOTO' : 'VIDEO CLIP'));
    box.appendChild(el('div', 'note', fmt(clipLen(c)) + ' long. Drag its yellow ends on the timeline to make it ' + (isStill(m) ? 'longer or shorter.' : 'shorter.')));
    if (isBg) box.appendChild(el('div', 'note', 'Put yourself ON TOP with CUT OUT PERSON or GREEN SCREEN to jump into it!'));
    if (m.kind === 'video') box.appendChild(slider('SOUND', 0, 1.5, 0.05, function () { return c.vol; }, function (v) { c.vol = v; }));
    if (!isBg) {
      var r = row('PICTURE');
      r.appendChild(chips([{ id: 'fit', label: 'SHOW IT ALL' }, { id: 'fill', label: 'FILL THE SCREEN' }], c.fit, function (id) { pushUndo(); c.fit = id; changed(); }));
      box.appendChild(r);
    }
    if (m.kind === 'image') {
      var r2 = row('MOVE');
      r2.appendChild(chips([{ id: 'none', label: 'STILL' }, { id: 'zoomin', label: 'ZOOM IN' }, { id: 'zoomout', label: 'ZOOM OUT' }], c.motion, function (id) { pushUndo(); c.motion = id; changed(); }));
      box.appendChild(r2);
    }
    var r3 = row('FADE IN AND OUT');
    r3.appendChild(chips([{ id: false, label: 'NO' }, { id: true, label: 'YES' }], !!c.fade, function (v) { pushUndo(); c.fade = v; changed(); }));
    box.appendChild(r3);
    var b = el('div', 'btnRow');
    b.appendChild(button('SNIP', 'gold', splitAtPlayhead));
    b.appendChild(button('PUT ON TOP', 'green', function () { moveMainToTop(c); }));
    b.appendChild(button('DELETE', 'red', deleteSelected));
    box.appendChild(b);
  }

  function inspectTop(box, c, m) {
    box.appendChild(el('div', 'head', 'ON TOP'));
    box.appendChild(el('div', 'note', 'Drag it around the picture. Pinch or use SIZE to change how big it is.'));
    var cutOn = !!(c.cut && c.cut.on);
    var rc = row('CUT OUT PERSON');
    rc.appendChild(chips([{ id: false, label: 'OFF' }, { id: true, label: 'ON' }], cutOn, function (v) {
      pushUndo();
      if (!c.cut) c.cut = { on: false, edge: 0.5 };
      c.cut.on = v;
      changed();
      if (v) startCutOut(c);
    }));
    box.appendChild(rc);
    if (cutOn) {
      var ms = maskStore[c.media];
      box.appendChild(el('div', 'note', seg.state === 'loading' ? 'Getting it ready...'
        : ms && (ms.state === 'preparing' || ms.state === 'waiting') ? 'Getting this clip ready so it plays smoothly -- it may stutter until then.'
        : 'Finds the person and hides everything else. No green screen needed!'));
      box.appendChild(slider('TRIM EDGES', 0.15, 0.85, 0.01, function () { return c.cut.edge; }, function (v) { c.cut.edge = v; }));
    }
    var r = row('GREEN SCREEN');
    r.appendChild(chips([{ id: false, label: 'OFF' }, { id: true, label: 'ON' }], !!c.key.on, function (v) {
      pushUndo();
      if (v && !c.key.picked) { guessKey(c); c.key.picked = true; }
      c.key.on = v; changed();
    }));
    box.appendChild(r);
    if (c.key.on) {
      var rp = row(null);
      var pk = button('TAP TO PICK THE COLOUR', 'green', function () {
        pickMode = true; $('#pickNote').hidden = false;
      });
      var sw = el('span', 'keySw');
      sw.style.background = 'rgb(' + c.key.color.map(function (v) { return Math.round(v * 255); }).join(',') + ')';
      pk.appendChild(sw);
      rp.appendChild(pk);
      box.appendChild(rp);
      box.appendChild(slider('STRENGTH', 0, 0.4, 0.005, function () { return c.key.sim; }, function (v) { c.key.sim = v; }));
      box.appendChild(slider('SOFT EDGES', 0.005, 0.25, 0.005, function () { return c.key.soft; }, function (v) { c.key.soft = v; }));
      box.appendChild(slider('GREEN GLOW FIX', 0.01, 0.5, 0.01, function () { return c.key.spill; }, function (v) { c.key.spill = v; }));
    }
    box.appendChild(slider('SIZE', 0.1, 3, 0.01, function () { return c.scale; }, function (v) { c.scale = v; }));
    if (m.kind === 'video') box.appendChild(slider('SOUND', 0, 1.5, 0.05, function () { return c.vol; }, function (v) { c.vol = v; }));
    var b = el('div', 'btnRow');
    b.appendChild(button('MIDDLE', '', function () { pushUndo(); c.x = 0.5; c.y = 0.5; c.scale = 1; changed(); }));
    b.appendChild(button('SNIP', 'gold', splitAtPlayhead));
    b.appendChild(button('BACK IN MOVIE', '', function () { moveTopToMain(c); }));
    b.appendChild(button('DELETE', 'red', deleteSelected));
    box.appendChild(b);
  }

  function inspectText(box, it) {
    box.appendChild(el('div', 'head', 'WORDS'));
    var r = row(null);
    var ta = el('textarea');
    ta.rows = 2; ta.maxLength = 80; ta.value = it.text;
    ta.addEventListener('focus', function () { pushUndo(); });
    ta.addEventListener('input', function () { it.text = ta.value; dirty = true; tlDirty = true; scheduleSave(); });
    ta.addEventListener('keydown', function (e) { e.stopPropagation(); });
    r.appendChild(ta);
    box.appendChild(r);
    var r1 = row('LOOK');
    r1.appendChild(chips(TEXT_STYLES, it.style, function (id) { pushUndo(); it.style = id; changed(); }));
    box.appendChild(r1);
    var r2 = row('COLOUR');
    var cs = el('div', 'chips');
    COLORS.forEach(function (col) {
      var b = el('button', 'sw' + (col === it.color ? ' on' : ''));
      b.style.background = col;
      b.setAttribute('aria-label', 'Colour ' + col);
      b.addEventListener('click', function () { pushUndo(); it.color = col; changed(); });
      cs.appendChild(b);
    });
    r2.appendChild(cs);
    box.appendChild(r2);
    box.appendChild(slider('SIZE', 0.03, 0.35, 0.005, function () { return it.size; }, function (v) { it.size = v; }));
    var r3 = row('MOVES');
    r3.appendChild(chips(TEXT_ANIMS, it.anim, function (id) { pushUndo(); it.anim = id; playT = it.start; changed(); }));
    box.appendChild(r3);
    var b = el('div', 'btnRow');
    b.appendChild(button('MIDDLE', '', function () { pushUndo(); it.x = 0.5; it.y = 0.5; changed(); }));
    b.appendChild(button('DELETE', 'red', deleteSelected));
    box.appendChild(b);
  }

  // ---------------------------------------------------------------- edits
  function splitAtPlayhead() {
    var t = playT, it = findItem(sel), layer = sel && sel.layer;
    // split the picked thing if the line is over it, else the movie clip under the line
    if (!it || t <= itemStart(layer, it) + MIN_LEN / 2 || t >= itemStart(layer, it) + itemLen(layer, it) - MIN_LEN / 2) {
      layer = 'main'; it = null;
      var s = 0;
      for (var i = 0; i < project.main.length; i++) {
        var L = clipLen(project.main[i]);
        if (t > s && t < s + L) { it = project.main[i]; break; }
        s += L;
      }
    }
    if (!it) { toast('MOVE THE LINE OVER A CLIP TO SNIP IT'); return; }
    var st = itemStart(layer, it), k = t - st;
    if (k < MIN_LEN / 2 || itemLen(layer, it) - k < MIN_LEN / 2) { toast('TOO CLOSE TO THE END TO SNIP'); return; }
    pushUndo();
    var b = JSON.parse(JSON.stringify(it));
    b.id = uid();
    if (layer === 'text') { b.start = t; b.dur = it.dur - k; it.dur = k; }
    else {
      var cut = it.in + k;
      b.in = cut; it.out = cut;
      if (layer === 'top') b.start = t;
    }
    var list = itemList(layer);
    list.splice(list.indexOf(it) + 1, 0, b);
    sel = { layer: layer, id: b.id };
    changed();
    beep(880, 0.06);
    toast('SNIP!');
  }
  function deleteSelected() {
    var it = findItem(sel);
    if (!it) { toast('TAP A CLIP FIRST'); return; }
    pushUndo();
    var list = itemList(sel.layer);
    list.splice(list.indexOf(it), 1);
    sel = null;
    changed();
  }
  function addText() {
    pushUndo();
    var T = total();
    var start = T > 0 ? Math.min(playT, Math.max(0, T - 1)) : 0;
    var it = { id: uid(), start: start, dur: 3, text: 'MY MOVIE', style: 'pop', color: '#ffe14f', size: 0.12, x: 0.5, y: 0.5, anim: 'pop' };
    project.text.push(it);
    sel = { layer: 'text', id: it.id };
    playT = start + 0.6;
    changed();
    var ta = $('#insp textarea');
    if (ta && !matchMedia('(pointer: coarse)').matches) { ta.focus(); ta.select(); }
  }
  function moveMainToTop(c) {
    pushUndo();
    var s = mainStart(c);
    project.main.splice(project.main.indexOf(c), 1);
    var t = newTopClip(mediaById(c.media), s);
    t.in = c.in; t.out = c.out; t.vol = c.vol; t.id = c.id;
    // it was the movie, so it starts where it sat -- clamp so it still lines up with what's left
    t.start = Math.max(0, Math.min(s, mainTotal() - 0.1));
    project.top.push(t);
    sel = { layer: 'top', id: t.id };
    playT = t.start + 0.001;
    changed();
    toast('ON TOP! NOW TRY GREEN SCREEN');
  }
  function moveTopToMain(c) {
    pushUndo();
    project.top.splice(project.top.indexOf(c), 1);
    var mc = newMainClip(mediaById(c.media));
    mc.in = c.in; mc.out = c.out; mc.vol = c.vol; mc.id = c.id;
    var idx = project.main.length, s = 0;
    for (var i = 0; i < project.main.length; i++) {
      var L = clipLen(project.main[i]);
      if (c.start < s + L / 2) { idx = i; break; }
      s += L;
    }
    project.main.splice(idx, 0, mc);
    sel = { layer: 'main', id: mc.id };
    playT = mainStart(mc) + 0.001;
    changed();
  }

  function confirmStartOver() {
    showSheet([
      el('h2', null, 'START OVER?'),
      el('p', null, 'This clears your whole movie and everything in MY STUFF. The videos and photos stay safe on your device.'),
      btnRow([
        button('YES, START OVER', 'red', function () { hideSheet(); startOver(); }),
        button('NO, KEEP IT', 'gold', hideSheet)
      ])
    ]);
  }
  // How far along the cut-out buffering is for the clips that need it (0..1), or null if done.
  function cutPending() {
    var sum = 0, n = 0;
    project.top.forEach(function (c) {
      if (!c.cut || !c.cut.on) return;
      var s = prepCutOut(mediaById(c.media));
      if (s && (s.state === 'waiting' || s.state === 'preparing')) { sum += s.progress; n++; }
    });
    return n ? sum / n : null;
  }
  function startOver() {
    stopPlay();
    maskStore = {};
    Object.keys(rt).forEach(function (id) { URL.revokeObjectURL(rt[id].url); });
    rt = {};
    if (gl) Object.keys(imgTex).forEach(function (id) { gl.deleteTexture(imgTex[id]); });
    imgTex = {};
    project = newProject();
    undoStack = [];
    sel = null; playT = 0;
    gcEls();
    DB.clear('media').catch(function () {});
    setOutSize(false);
    changed();
  }

  function savePicture() {
    renderFrame(playT, true);
    view.toBlob(function (b) {
      if (!b) return;
      download(b, 'dreamreel-picture-' + stamp() + '.png');
      dirty = true;
    }, 'image/png');
  }
  function stamp() {
    var d = new Date(), p = function (n) { return (n < 10 ? '0' : '') + n; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + '-' + p(d.getHours()) + p(d.getMinutes());
  }
  function download(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 60000);
  }

  // ---------------------------------------------------------------- sound effects (tiny)
  function beep(f, d) {
    if (!actx) return;
    try {
      var o = actx.createOscillator(), g = actx.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.06, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, actx.currentTime + d);
      o.connect(g); g.connect(actx.destination);   // not into the movie's recording
      o.start(); o.stop(actx.currentTime + d + 0.02);
    } catch (e) {}
  }

  // ---------------------------------------------------------------- timeline
  var tlW = 0, tlH = 0, tlDpr = 1;
  var pps = 60;   // css px per second
  function tlLayout() {
    var rulerH = Math.round(tlH * 0.15), gap = Math.max(3, Math.round(tlH * 0.03));
    var avail = tlH - rulerH - gap * 4;
    var topH = Math.round(avail * 0.3), mainH = Math.round(avail * 0.44), textH = avail - topH - mainH;
    var y = rulerH + gap;
    var L = { ruler: rulerH, top: { y: y, h: topH } };
    y += topH + gap; L.main = { y: y, h: mainH };
    y += mainH + gap; L.text = { y: y, h: textH };
    return L;
  }
  function xAt(t) { return tlW / 2 + (t - playT) * pps; }
  function tAt(x) { return playT + (x - tlW / 2) / pps; }
  function resizeTL() {
    var r = tl.getBoundingClientRect();
    tlDpr = Math.min(3, window.devicePixelRatio || 1);
    tlW = Math.max(1, r.width); tlH = Math.max(1, r.height);
    tl.width = Math.round(tlW * tlDpr); tl.height = Math.round(tlH * tlDpr);
    tlDirty = true;
  }

  var drag = null;  // timeline gesture
  function drawTL() {
    var x = tctx, L = tlLayout(), T = total();
    x.setTransform(tlDpr, 0, 0, tlDpr, 0, 0);
    x.clearRect(0, 0, tlW, tlH);
    // lanes
    var lanes = [['top', 'ON TOP', '#163a2a'], ['main', 'MOVIE', '#2a2140'], ['text', 'WORDS', '#3a1f3d']];
    lanes.forEach(function (ln) {
      var g = L[ln[0]];
      x.fillStyle = ln[2];
      x.globalAlpha = 0.45;
      x.fillRect(0, g.y, tlW, g.h);
      x.globalAlpha = 1;
    });
    // ruler
    x.fillStyle = '#1b1825'; x.fillRect(0, 0, tlW, L.ruler);
    var step = pps > 120 ? 0.5 : pps > 40 ? 1 : pps > 15 ? 5 : 10;
    var t0 = Math.max(0, Math.floor(tAt(0) / step) * step), t1 = tAt(tlW);
    x.fillStyle = '#8d86a6'; x.strokeStyle = '#4a4560';
    x.font = 'bold ' + Math.round(L.ruler * 0.5) + 'px Trebuchet MS, sans-serif';
    x.textAlign = 'left'; x.textBaseline = 'middle';
    x.lineWidth = 1;
    for (var t = t0; t <= t1; t += step) {
      var px = Math.round(xAt(t)) + 0.5;
      x.beginPath(); x.moveTo(px, L.ruler * 0.55); x.lineTo(px, L.ruler); x.stroke();
      var whole = Math.abs(t - Math.round(t)) < 0.01;
      if (whole && (step >= 1 || Math.round(t) % 1 === 0)) x.fillText(fmt(t).replace(/\.0$/, ''), px + 3, L.ruler * 0.42);
    }
    // the end of the movie
    if (T > 0) {
      var ex = xAt(T);
      x.fillStyle = 'rgba(0,0,0,0.35)';
      x.fillRect(ex, L.ruler, Math.max(0, tlW - ex), tlH - L.ruler);
    }

    // MOVIE row
    var s = 0, dropX = null;
    project.main.forEach(function (c) {
      var len = clipLen(c);
      var moving = drag && drag.mode === 'move' && drag.layer === 'main' && drag.id === c.id;
      if (!moving) drawClipBlock(x, c, xAt(s), L.main, len, 'main');
      s += len;
    });
    // TOP row
    project.top.forEach(function (c) {
      drawClipBlock(x, c, xAt(c.start), L.top, clipLen(c), 'top');
    });
    // WORDS row
    project.text.forEach(function (it) {
      var x0 = xAt(it.start), w = it.dur * pps, g = L.text;
      if (x0 > tlW || x0 + w < 0) return;
      var on = sel && sel.id === it.id;
      x.fillStyle = on ? '#b65cff' : '#7a3fc0';
      roundRect(x, x0 + 1, g.y + 1, Math.max(4, w - 2), g.h - 2, g.h * 0.25); x.fill();
      x.save(); x.beginPath(); x.rect(x0 + 1, g.y, Math.max(0, w - 2), g.h); x.clip();
      x.fillStyle = '#fff'; x.font = 'bold ' + Math.round(g.h * 0.5) + 'px Trebuchet MS, sans-serif';
      x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText('T  ' + (it.text || '').replace(/\n/g, ' '), Math.max(x0, 0) + g.h * 0.4, g.y + g.h / 2);
      x.restore();
      if (on) drawHandles(x, x0, w, g);
    });

    // dragged MOVIE clip follows the finger, with a marker where it will drop
    if (drag && drag.mode === 'move' && drag.layer === 'main') {
      var c = findItem({ layer: 'main', id: drag.id });
      if (c) {
        var len2 = clipLen(c);
        x.globalAlpha = 0.75;
        drawClipBlock(x, c, drag.ghostX, L.main, len2, 'main');
        x.globalAlpha = 1;
        dropX = dropMarkerX(drag.dropIdx, c);
        x.fillStyle = '#ffcf5a';
        x.fillRect(dropX - 3, L.main.y - 4, 6, L.main.h + 8);
      }
    }

    // lane labels
    lanes.forEach(function (ln) {
      var g = L[ln[0]], fs = Math.round(Math.min(g.h * 0.42, L.main.h * 0.28));
      x.font = 'bold ' + fs + 'px Trebuchet MS, sans-serif';
      var w = x.measureText(ln[1]).width + fs;
      x.fillStyle = 'rgba(10,8,16,0.7)';
      roundRect(x, 4, g.y + g.h / 2 - fs * 0.75, w, fs * 1.5, fs * 0.5); x.fill();
      x.fillStyle = '#d9d2ff'; x.textAlign = 'left'; x.textBaseline = 'middle';
      x.fillText(ln[1], 4 + fs / 2, g.y + g.h / 2 + 1);
    });

    // empty hint
    if (!project.main.length && !project.top.length && !project.text.length) {
      x.fillStyle = '#8d86a6'; x.textAlign = 'center';
      x.font = 'bold ' + Math.round(L.main.h * 0.24) + 'px Trebuchet MS, sans-serif';
      x.fillText('YOUR CLIPS SHOW UP HERE', tlW / 2, L.main.y + L.main.h / 2);
    }

    // playhead
    var cx = Math.round(tlW / 2);
    x.fillStyle = '#ff4fd8';
    x.shadowColor = '#ff4fd8'; x.shadowBlur = 8;
    x.fillRect(cx - 1.5, L.ruler * 0.2, 3, tlH);
    x.shadowBlur = 0;
    x.beginPath(); x.moveTo(cx - 8, 0); x.lineTo(cx + 8, 0); x.lineTo(cx, L.ruler * 0.5); x.closePath(); x.fill();
  }
  function drawClipBlock(x, c, x0, g, len, layer) {
    var w = len * pps;
    if (x0 > tlW || x0 + w < 0) return;
    var r = rt[c.media], m = mediaById(c.media);
    var on = sel && sel.id === c.id;
    x.save();
    roundRect(x, x0 + 1, g.y, Math.max(3, w - 2), g.h, Math.min(10, g.h * 0.18));
    x.fillStyle = '#000'; x.fill();
    x.clip();
    if (r && r.strip) {
      var tw = g.h * r.tw / r.th;
      var startI = Math.max(0, Math.floor((0 - x0) / tw));
      for (var i = startI; x0 + i * tw < Math.min(tlW, x0 + w); i++) {
        var lt = (i * tw + tw / 2) / pps;
        var srcT = m.kind === 'image' ? 0 : c.in + lt;
        var fi = m.kind === 'image' ? 0 : m.kind === 'bg' ? Math.floor((srcT % BG_LOOP) / BG_LOOP * r.stripN) % r.stripN
          : clamp(Math.floor(srcT / m.dur * r.stripN), 0, r.stripN - 1);
        x.drawImage(r.strip, fi * r.tw, 0, r.tw, r.th, x0 + i * tw, g.y, tw + 0.5, g.h);
      }
    }
    if (layer === 'top') {
      x.fillStyle = c.key && c.key.on ? 'rgba(40,210,120,0.28)' : 'rgba(40,210,120,0.12)';
      x.fillRect(x0, g.y, w, g.h);
    }
    // little badges
    var fs = Math.round(g.h * (layer === 'main' ? 0.2 : 0.3));
    x.font = 'bold ' + fs + 'px Trebuchet MS, sans-serif';
    x.textBaseline = 'top'; x.textAlign = 'left';
    var badge = m.kind === 'image' ? 'PHOTO' : m.kind === 'bg' ? m.name : fmt(len);
    if (layer === 'top' && c.cut && c.cut.on) {
      var ms = maskStore[c.media];
      badge += ms && ms.state !== 'ready' && ms.state !== 'failed' ? ' CUT OUT ' + Math.round(ms.progress * 100) + '%' : ' CUT OUT';
    }
    if (layer === 'top' && c.key && c.key.on) badge += ' GREEN SCREEN';
    var bw = x.measureText(badge).width + fs * 0.6;
    if (w > bw + 8) {
      x.fillStyle = 'rgba(0,0,0,0.6)';
      roundRect(x, Math.max(x0, 0) + 4, g.y + 4, bw, fs * 1.3, fs * 0.4); x.fill();
      x.fillStyle = '#fff';
      x.fillText(badge, Math.max(x0, 0) + 4 + fs * 0.3, g.y + 4 + fs * 0.15);
    }
    x.restore();
    x.lineWidth = on ? 3 : 1.5;
    x.strokeStyle = on ? '#ffcf5a' : 'rgba(255,255,255,0.25)';
    roundRect(x, x0 + 1, g.y, Math.max(3, w - 2), g.h, Math.min(10, g.h * 0.18)); x.stroke();
    if (on) drawHandles(x, x0, w, g);
  }
  function handleW(g) { return Math.max(12, Math.min(24, g.h * 0.3)); }
  function drawHandles(x, x0, w, g) {
    var hw = handleW(g);
    x.fillStyle = '#ffcf5a';
    roundRect(x, x0 - hw * 0.4, g.y - 2, hw, g.h + 4, 5); x.fill();
    roundRect(x, x0 + w - hw * 0.6, g.y - 2, hw, g.h + 4, 5); x.fill();
    x.strokeStyle = '#6b4a00'; x.lineWidth = 2;
    [x0 + hw * 0.1, x0 + w - hw * 0.1].forEach(function (hx) {
      x.beginPath(); x.moveTo(hx - 2, g.y + g.h * 0.32); x.lineTo(hx - 2, g.y + g.h * 0.68);
      x.moveTo(hx + 2, g.y + g.h * 0.32); x.lineTo(hx + 2, g.y + g.h * 0.68); x.stroke();
    });
  }
  function dropMarkerX(idx, moving) {
    var s = 0;
    for (var i = 0; i < idx && i < project.main.length; i++) if (project.main[i] !== moving) s += clipLen(project.main[i]);
    return xAt(s);
  }

  // What's under a point on the timeline?
  function hitTL(px, py) {
    var L = tlLayout();
    var lane = null;
    ['top', 'main', 'text'].forEach(function (k) { if (py >= L[k].y - 4 && py <= L[k].y + L[k].h + 4) lane = k; });
    if (!lane) return null;
    var g = L[lane], hw = handleW(g) * 1.4;
    // handles of the picked item first
    var it = findItem(sel);
    if (it && sel.layer === lane) {
      var x0 = xAt(itemStart(lane, it)), x1 = x0 + itemLen(lane, it) * pps;
      if (Math.abs(px - x0) < hw) return { layer: lane, id: it.id, handle: 'l' };
      if (Math.abs(px - x1) < hw) return { layer: lane, id: it.id, handle: 'r' };
    }
    var t = tAt(px), list = itemList(lane);
    for (var i = list.length - 1; i >= 0; i--) {
      var st = itemStart(lane, list[i]);
      if (t >= st && t < st + itemLen(lane, list[i])) return { layer: lane, id: list[i].id };
    }
    return { layer: lane, id: null };
  }

  var tlPtrs = new Map();
  tl.addEventListener('pointerdown', function (e) {
    ensureAudio();
    try { tl.setPointerCapture(e.pointerId); } catch (err) {}
    var r = tl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    tlPtrs.set(e.pointerId, px);
    if (tlPtrs.size === 2) {
      var xs = Array.from(tlPtrs.values());
      drag = { mode: 'pinch', d0: Math.abs(xs[0] - xs[1]) || 1, pps0: pps };
      tlDirty = true;
      return;
    }
    if (tlPtrs.size > 2) return;
    var hit = hitTL(px, py);
    drag = { mode: 'pending', x0: px, y0: py, t0: playT, hit: hit, id: hit && hit.id, layer: hit && hit.layer };
  });
  tl.addEventListener('pointermove', function (e) {
    if (!tlPtrs.has(e.pointerId) || !drag) return;
    var r = tl.getBoundingClientRect(), px = e.clientX - r.left;
    tlPtrs.set(e.pointerId, px);
    if (drag.mode === 'pinch') {
      if (tlPtrs.size < 2) return;
      var xs = Array.from(tlPtrs.values());
      pps = clamp(drag.pps0 * Math.abs(xs[0] - xs[1]) / drag.d0, 6, 600);
      tlDirty = true;
      return;
    }
    var dx = px - drag.x0;
    if (drag.mode === 'pending') {
      if (Math.abs(dx) < 6) return;
      var h = drag.hit;
      if (h && h.handle) beginEdit('trim');
      else if (h && h.id && sel && sel.id === h.id) beginEdit('move');
      else { drag.mode = 'scroll'; if (playing) stopPlay(); }
    }
    if (drag.mode === 'scroll') {
      playT = clamp(drag.t0 - dx / pps, 0, total());
      dirty = true; tlDirty = true;
    } else if (drag.mode === 'trim') doTrim(dx / pps);
    else if (drag.mode === 'move') doMove(px, dx / pps);
  });
  function beginEdit(mode) {
    if (playing) stopPlay();
    var it = findItem({ layer: drag.layer, id: drag.id });
    if (!it) { drag.mode = 'scroll'; return; }
    pushUndo();
    drag.mode = mode;
    drag.side = drag.hit.handle;
    drag.orig = JSON.parse(JSON.stringify(it));
    drag.item = it;
    if (drag.layer === 'main') drag.startX = xAt(mainStart(it));
  }
  function snapT(t, ignoreId) {
    // snap to the playhead, the start, and clip edges within ~10px
    var best = t, bd = 10 / pps;
    var cands = [playT, 0], s = 0;
    project.main.forEach(function (c) { cands.push(s); s += clipLen(c); });
    cands.push(s);
    project.top.forEach(function (c) { if (c.id !== ignoreId) { cands.push(c.start); cands.push(c.start + clipLen(c)); } });
    project.text.forEach(function (c) { if (c.id !== ignoreId) { cands.push(c.start); cands.push(c.start + c.dur); } });
    cands.forEach(function (c) { if (Math.abs(c - t) < bd) { bd = Math.abs(c - t); best = c; } });
    return best;
  }
  function doTrim(d) {
    var it = drag.item, o = drag.orig, layer = drag.layer, m = layer !== 'text' ? mediaById(it.media) : null;
    var maxOut = m ? (isStill(m) ? PHOTO_MAX : m.dur) : 0;
    if (layer === 'text') {
      if (drag.side === 'l') {
        var ns = clamp(snapT(o.start + d, it.id), 0, o.start + o.dur - MIN_LEN);
        it.start = ns; it.dur = o.dur - (ns - o.start);
      } else {
        var ne = snapT(o.start + o.dur + d, it.id);
        it.dur = clamp(ne - o.start, MIN_LEN, 600);
      }
    } else if (layer === 'top') {
      if (drag.side === 'l') {
        var ns2 = snapT(o.start + d, it.id), dd = ns2 - o.start;
        if (isStill(m)) { dd = clamp(dd, -o.start, o.out - MIN_LEN); it.start = o.start + dd; it.out = o.out - dd; }
        else { dd = clamp(dd, Math.max(-o.in, -o.start), o.out - o.in - MIN_LEN); it.start = o.start + dd; it.in = o.in + dd; }
      } else {
        var ne2 = snapT(o.start + (o.out - o.in) + d, it.id);
        it.out = clamp(o.in + (ne2 - o.start), o.in + MIN_LEN, maxOut);
      }
    } else {   // main: ripple
      delete it.autoLen;   // the kid is choosing its length now
      if (drag.side === 'l') {
        if (isStill(m)) it.out = clamp(o.out - d, MIN_LEN, PHOTO_MAX);
        else it.in = clamp(o.in + d, 0, o.out - MIN_LEN);
      } else it.out = clamp(o.out + d, it.in + MIN_LEN, maxOut);
    }
    dirty = true; tlDirty = true;
    // show the frame at the edge being dragged
    if (layer !== 'main') playT = clamp(drag.side === 'l' ? itemStart(layer, it) + 0.01 : itemStart(layer, it) + itemLen(layer, it) - 0.01, 0, Math.max(0, total()));
  }
  function doMove(px, d) {
    var it = drag.item, o = drag.orig;
    if (drag.layer === 'main') {
      drag.ghostX = drag.startX + (px - drag.x0);
      // drop index from the finger's time
      var t = tAt(px), s = 0, idx = 0;
      for (var i = 0; i < project.main.length; i++) {
        var c = project.main[i];
        if (c === it) continue;
        var L = clipLen(c);
        if (t > s + L / 2) idx = i + 1;
        s += L;
      }
      // idx counts positions in the list *with* the moving clip; convert to without
      var without = project.main.filter(function (c) { return c !== it; });
      var idxW = 0, acc = 0;
      for (var j = 0; j < without.length; j++) { if (t > acc + clipLen(without[j]) / 2) idxW = j + 1; acc += clipLen(without[j]); }
      drag.dropIdx = idxW;
      drag.dropIdxRaw = idx;
      tlDirty = true;
      return;
    }
    var len = itemLen(drag.layer, it);
    var ns = o.start + d;
    var sA = snapT(ns, it.id), sB = snapT(ns + len, it.id) - len;
    ns = Math.abs(sA - ns) <= Math.abs(sB - ns) ? sA : sB;
    it.start = Math.max(0, ns);
    dirty = true; tlDirty = true;
  }
  function tlUp(e) {
    if (!tlPtrs.has(e.pointerId)) return;
    tlPtrs.delete(e.pointerId);
    if (!drag) return;
    if (drag.mode === 'pinch') { if (tlPtrs.size === 0) drag = null; return; }
    if (drag.mode === 'pending') {
      // a tap: pick what's under it (or nothing)
      var h = drag.hit;
      sel = h && h.id ? { layer: h.layer, id: h.id } : null;
      renderInspector(); updateButtons();
      dirty = true; tlDirty = true;
      if (sel) beep(660, 0.04);
    } else if (drag.mode === 'move' && drag.layer === 'main') {
      var it = drag.item, list = project.main.filter(function (c) { return c !== it; });
      if (drag.dropIdx != null) {
        list.splice(drag.dropIdx, 0, it);
        project.main = list;
        playT = mainStart(it) + 0.001;
      } else undoStack.pop();
      changed();
    } else if (drag.mode === 'trim' || drag.mode === 'move') {
      changed();
    }
    drag = null; tlDirty = true;
  }
  tl.addEventListener('pointerup', tlUp);
  tl.addEventListener('pointercancel', tlUp);
  tl.addEventListener('wheel', function (e) {
    e.preventDefault();
    if (e.ctrlKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 1.2 && e.shiftKey === false && e.altKey) {
      pps = clamp(pps * Math.exp(-e.deltaY * 0.002), 6, 600);
    } else if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      playT = clamp(playT + e.deltaX / pps, 0, total()); dirty = true;
    } else {
      // plain wheel zooms: it's the friendliest thing a mouse wheel can do here
      pps = clamp(pps * Math.exp(-e.deltaY * 0.002), 6, 600);
    }
    tlDirty = true;
  }, { passive: false });

  // ---------------------------------------------------------------- transport
  var lastNow = 0, stallFor = 0;
  function togglePlay() { if (playing || cutWait || priming) stopPlay(); else startPlay(); }
  function startPlay() {
    var T = total();
    if (T <= 0) { toast('ADD SOMETHING TO PLAY'); return; }
    ensureAudio();
    if (playT >= T - 0.05) playT = 0;
    // a cut-out still buffering would stutter: wait for it, like a video site does
    if (!exporting && cutPending() != null) { waitForCut(); return; }
    primeThenPlay();
  }
  // Park every video under the playhead on its starting frame and wait for it to get there
  // BEFORE pressing play. Playing and jumping at the same moment let a blip of the old spot's
  // sound out (the end of the clip heard at the start).
  var priming = 0;
  function primeThenPlay() {
    var token = ++priming, wait = [];
    els.forEach(function (e) { e.lastSeek = 0; });
    activeAt(playT).forEach(function (a) {
      if (!isVideoClip(a.clip)) return;
      var e = getEl(a.clip);
      e.el.pause();
      if (Math.abs(e.el.currentTime - a.src) > 0.02) e.el.currentTime = a.src;
      wait.push(e);
    });
    var t0 = performance.now();
    (function check() {
      if (token !== priming) return;   // stopped (or started again) meanwhile
      var ready = wait.every(function (e) { return !e.el.seeking && e.el.readyState >= 2; });
      if (!ready && performance.now() - t0 < 1500) { setTimeout(check, 25); return; }
      priming = 0;
      playing = true; lastNow = performance.now(); stallFor = 0;
      updateButtons();
    })();
  }
  var cutWait = 0;
  function waitForCut() {
    clearInterval(cutWait);
    $('#playLbl').textContent = 'WAIT';
    cutWait = setInterval(function () {
      var p = cutPending();
      if (p == null) {
        clearInterval(cutWait); cutWait = 0;
        toast('READY!', 1200);
        startPlay();
        return;
      }
      toast('GETTING CUT OUT READY... ' + Math.round(p * 100) + '%', 2000);
    }, 250);
  }
  function stopPlay() {
    if (cutWait) { clearInterval(cutWait); cutWait = 0; toast('STOPPED', 1000); }
    priming = 0;
    playing = false;
    els.forEach(function (e) { if (!e.el.paused) e.el.pause(); });
    dirty = true; tlDirty = true;
    updateButtons();
  }
  function step(dt) {
    var T = total();
    // the MOVIE video under the playhead is the clock; photos and gaps use the wall clock
    var act = activeAt(playT), mainA = null;
    for (var i = 0; i < act.length; i++) if (act[i].layer === 'main') mainA = act[i];
    // no video in the MOVIE row (a photo or fun background)? then a video ON TOP is the clock, so
    // it plays straight through instead of being pulled back into line by the wall clock
    if (!mainA || !isVideoClip(mainA.clip)) {
      for (var j = 0; j < act.length; j++) if (act[j].layer === 'top' && isVideoClip(act[j].clip)) { mainA = act[j]; break; }
    }
    var advanced = false;
    if (mainA && isVideoClip(mainA.clip)) {
      var e = els.get(mainA.clip.id);
      if (e && e.loaded) {
        var el = e.el;
        if (!el.paused && !el.seeking && el.readyState >= 2 && !el.ended) {
          var nt = mainA.start + (el.currentTime - mainA.clip.in);
          if (Math.abs(nt - playT) < 0.3) { playT = Math.max(playT, nt); advanced = true; stallFor = 0; }
          if (!advanced && nt > playT && nt - playT < 0.6) { playT = nt; advanced = true; }
        } else if (!el.ended) {
          // waiting for the video to be ready -- hold the clock, but not forever
          stallFor += dt;
          if (stallFor < 2) advanced = true;
        }
      }
    }
    if (!advanced) playT += dt;
    if (playT >= T) {
      playT = T;
      if (exporting) finishExport();
      else stopPlay();
    }
  }

  function updateButtons() {
    var it = findItem(sel);
    $('#playLbl').textContent = playing ? 'PAUSE' : cutWait ? 'WAIT' : 'PLAY';
    $('#playIcon').innerHTML = playing ? '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>' : '<path d="M7 4l14 8-14 8z"/>';
    $('#delBtn').disabled = !it;
    $('#undoBtn').disabled = !undoStack.length;
    $('#exportBtn').disabled = total() <= 0;
  }
  $('#playBtn').addEventListener('click', function () { ensureAudio(); togglePlay(); });
  $('#homeBtn').addEventListener('click', function () { playT = 0; dirty = true; tlDirty = true; });
  $('#undoBtn').addEventListener('click', undo);
  $('#splitBtn').addEventListener('click', function () { ensureAudio(); if (playing) stopPlay(); splitAtPlayhead(); });
  $('#textBtn').addEventListener('click', function () { if (playing) stopPlay(); addText(); });
  $('#delBtn').addEventListener('click', deleteSelected);
  $('#exportBtn').addEventListener('click', startExport);

  // ---------------------------------------------------------------- export
  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return null;
    var list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/mp4',
      'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
    for (var i = 0; i < list.length; i++) if (MediaRecorder.isTypeSupported(list[i])) return list[i];
    return null;
  }
  function btnRow(btns) { var r = el('div', 'btnRow'); btns.forEach(function (b) { r.appendChild(b); }); return r; }
  function showSheet(nodes) {
    var b = $('#sheetBox');
    b.innerHTML = '';
    nodes.forEach(function (n) { b.appendChild(n); });
    $('#sheet').hidden = false;
  }
  function hideSheet() { $('#sheet').hidden = true; }

  var wakeLock = null;
  function startExport() {
    var T = total();
    if (T <= 0) return;
    var mime = pickMime();
    if (!mime || !view.captureStream) { toast("THIS BROWSER CAN'T SAVE MOVIES", 3500); return; }
    ensureAudio();
    stopPlay();
    sel = null; renderInspector(); updateButtons();
    setOutSize(true);
    var tracks = view.captureStream(30).getVideoTracks();
    if (recDest) tracks = tracks.concat(recDest.stream.getAudioTracks());
    var rec;
    try { rec = new MediaRecorder(new MediaStream(tracks), { mimeType: mime, videoBitsPerSecond: 6000000, audioBitsPerSecond: 128000 }); }
    catch (e) { setOutSize(false); toast("COULDN'T START SAVING", 3000); return; }
    var bar = el('div', 'bar2'), fill = el('b');
    bar.appendChild(fill);
    var cancelled = false;
    showSheet([
      el('h2', null, 'MAKING YOUR MOVIE...'),
      el('p', null, 'It plays through once while it records. Keep this screen on!'),
      bar,
      btnRow([button('STOP', 'red', function () { cancelled = true; exporting.cancel = true; finishExport(); })])
    ]);
    exporting = { rec: rec, chunks: [], fill: fill, mime: mime, cancel: false, T: T };
    rec.ondataavailable = function (e) { if (e.data && e.data.size) exporting && exporting.chunks.push(e.data); };
    var ex = exporting;
    rec.onstop = function () { exportDone(ex); };
    if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wakeLock = w; }).catch(function () {});
    // line everything up at the start, give the first clip a moment, then go
    playT = 0; dirty = true;
    renderFrame(0, true);
    var waited = 0;
    (function ready() {
      if (cancelled) return;
      // cut-outs must be buffered first, or the movie would stutter
      var pend = cutPending(), head = $('#sheetBox h2');
      if (pend != null) {
        if (head) head.textContent = 'GETTING CUT OUT READY... ' + Math.round(pend * 100) + '%';
        setTimeout(ready, 250);
        return;
      }
      if (head) head.textContent = 'MAKING YOUR MOVIE...';
      var act = activeAt(0), ok = true;
      act.forEach(function (a) { if (isVideoClip(a.clip)) { var e = els.get(a.clip.id); if (!e || e.el.readyState < 2 || e.el.seeking) ok = false; } });
      if (!ok && waited < 3000) { waited += 100; renderFrame(0, true); setTimeout(ready, 100); return; }
      rec.start(500);
      startPlay();
    })();
  }
  function finishExport() {
    var ex = exporting;
    if (!ex || ex.stopping) return;
    ex.stopping = true;
    stopPlay();
    try { if (ex.rec.state !== 'inactive') ex.rec.stop(); else exportDone(ex); } catch (e) { exportDone(ex); }
  }
  function exportDone(ex) {
    if (ex.done) return;
    ex.done = true;
    exporting = null;
    if (wakeLock) { wakeLock.release().catch(function () {}); wakeLock = null; }
    setOutSize(false);
    if (ex.cancel || !ex.chunks.length) { hideSheet(); if (!ex.cancel) toast('NOTHING GOT RECORDED -- TRY AGAIN', 3000); return; }
    var type = ex.mime.split(';')[0];
    var blob = new Blob(ex.chunks, { type: type });
    var ext = type === 'video/mp4' ? 'mp4' : 'webm';
    var name = 'dreamreel-movie-' + stamp() + '.' + ext;
    var v = el('video');
    v.controls = true; v.playsInline = true;
    v.src = URL.createObjectURL(blob);
    beep(784, 0.12); setTimeout(function () { beep(1046, 0.18); }, 130);
    showSheet([
      el('h2', null, 'YOUR MOVIE IS READY!'),
      v,
      btnRow([
        button('SAVE TO DEVICE', 'gold', function () { download(blob, name); toast('SAVED AS ' + name.toUpperCase(), 3500); }),
        button('BACK TO EDITING', '', function () { v.pause(); URL.revokeObjectURL(v.src); hideSheet(); })
      ]),
      el('p', null, ext === 'webm' ? 'This browser saves movies as .webm files.' : '')
    ]);
  }

  // ---------------------------------------------------------------- camera: RECORD and PHOTO
  // For tablets whose browser has no file picker: film or snap straight into the movie.
  var cam = { stream: null, facing: 'user', rec: null, chunks: [], t0: 0, timer: 0, take: null, takeKind: null, counting: false, countT: 0, discard: false };
  var MAX_REC = 300;
  function camOpen() { return !$('#cam').hidden; }
  function camRecording() { return !!cam.rec && cam.rec.state === 'recording'; }
  $('#recBtn').addEventListener('click', openCam);
  function openCam() {
    ensureAudio();
    if (playing) stopPlay();
    $('#cam').hidden = false;
    clearTake();
    camShowLive();
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFail("This browser can't use the camera."); return; }
    startStream();
  }
  function camFail(msg) {
    $('#camMsg').textContent = msg;
    $('#camLive').hidden = true; $('#camReview').hidden = true; $('#camClose').hidden = false;
  }
  function startStream() {
    stopStream();
    $('#camLive').hidden = true;
    $('#camMsg').textContent = 'Starting the camera...';
    var md = navigator.mediaDevices;
    md.getUserMedia({ video: { facingMode: cam.facing, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: { echoCancellation: true, noiseSuppression: true } })
      .catch(function (e) {
        if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw e;
        // no microphone, or the camera can't do that: try simpler asks
        return md.getUserMedia({ video: { facingMode: cam.facing }, audio: true })
          .catch(function () { return md.getUserMedia({ video: true }); });
      })
      .then(function (st) {
        if (!camOpen()) { st.getTracks().forEach(function (t) { t.stop(); }); return; }
        cam.stream = st;
        var v = $('#camView');
        v.srcObject = st; v.muted = true;
        var p = v.play(); if (p && p.catch) p.catch(function () {});
        v.classList.toggle('mirror', cam.facing === 'user');
        $('#camMsg').textContent = '';
        camShowLive();
      }, function (e) {
        var n = e && e.name;
        camFail(n === 'NotAllowedError' || n === 'SecurityError'
          ? 'The camera is switched off for this browser. Ask a grown-up to allow the camera and microphone.'
          : n === 'NotFoundError' || n === 'OverconstrainedError'
            ? "Couldn't find a camera on this device."
            : "The camera didn't start. Close this and try again.");
      });
  }
  function stopStream() {
    if (cam.stream) { cam.stream.getTracks().forEach(function (t) { t.stop(); }); cam.stream = null; }
    $('#camView').srcObject = null;
  }
  function closeCam() {
    if (camRecording()) { cam.discard = true; cam.rec.stop(); }
    cam.counting = false; clearTimeout(cam.countT);
    clearInterval(cam.timer);
    stopStream(); clearTake();
    $('#camCount').textContent = '';
    $('#camMsg').textContent = '';
    $('#cam').hidden = true;
  }
  function camShowLive() {
    $('#camView').hidden = false;
    $('#camTake').hidden = true; $('#camPic').hidden = true;
    $('#camLive').hidden = !cam.stream;
    $('#camReview').hidden = true;
    $('#camClose').hidden = false;
    $('#camShoot').classList.remove('on');
    var tm = $('#camTime'); tm.hidden = true; tm.classList.remove('on');
    $('#camFlip').disabled = false; $('#camSnap').disabled = false;
    $('#camCount').textContent = '';
  }
  $('#camClose').addEventListener('click', closeCam);
  $('#camFlip').addEventListener('click', function () {
    cam.facing = cam.facing === 'user' ? 'environment' : 'user';
    startStream();
  });
  $('#camShoot').addEventListener('click', function () {
    if (camRecording()) { cam.rec.stop(); return; }
    if (cam.counting) { cam.counting = false; clearTimeout(cam.countT); camShowLive(); return; }
    if (!cam.stream) return;
    // 3, 2, 1 ... then roll
    cam.counting = true;
    $('#camFlip').disabled = true; $('#camSnap').disabled = true; $('#camClose').hidden = true;
    var n = 3;
    (function tick() {
      if (!cam.counting) return;
      if (n === 0) { $('#camCount').textContent = ''; cam.counting = false; startRec(); return; }
      $('#camCount').textContent = n;
      beep(n === 1 ? 880 : 660, 0.08);
      n--;
      cam.countT = setTimeout(tick, 800);
    })();
  });
  function startRec() {
    var mime = pickMime(), r = null;
    try { r = new MediaRecorder(cam.stream, mime ? { mimeType: mime, videoBitsPerSecond: 5000000 } : undefined); }
    catch (e) { try { r = new MediaRecorder(cam.stream); } catch (e2) { r = null; } }
    if (!r) { toast("COULDN'T START RECORDING", 3000); camShowLive(); return; }
    cam.rec = r; cam.chunks = []; cam.discard = false;
    r.ondataavailable = function (e) { if (e.data && e.data.size) cam.chunks.push(e.data); };
    r.onstop = function () {
      clearInterval(cam.timer);
      if (cam.discard || !cam.chunks.length) { cam.discard = false; if (camOpen()) camShowLive(); return; }
      var type = (r.mimeType || mime || 'video/webm').split(';')[0];
      showTake(new Blob(cam.chunks, { type: type }), 'video');
    };
    try { r.start(500); } catch (e) { toast("COULDN'T START RECORDING", 3000); camShowLive(); return; }
    beep(1046, 0.12);
    cam.t0 = performance.now();
    $('#camShoot').classList.add('on');
    var tm = $('#camTime');
    tm.hidden = false; tm.classList.add('on'); tm.textContent = '0:00';
    cam.timer = setInterval(function () {
      var s = (performance.now() - cam.t0) / 1000;
      tm.textContent = Math.floor(s / 60) + ':' + ('0' + Math.floor(s % 60)).slice(-2);
      if (s >= MAX_REC && camRecording()) cam.rec.stop();
    }, 250);
  }
  $('#camSnap').addEventListener('click', function () {
    var v = $('#camView');
    if (!cam.stream || !v.videoWidth) return;
    var c = document.createElement('canvas');
    c.width = v.videoWidth; c.height = v.videoHeight;
    c.getContext('2d').drawImage(v, 0, 0);
    var f = $('#camFlash');
    f.classList.add('on'); setTimeout(function () { f.classList.remove('on'); }, 60);
    beep(1320, 0.05);
    c.toBlob(function (b) { if (b) showTake(b, 'image'); }, 'image/jpeg', 0.92);
  });
  function showTake(blob, kind) {
    clearTake();
    cam.take = blob; cam.takeKind = kind;
    $('#camView').hidden = true;
    if (kind === 'video') {
      var t = $('#camTake');
      t.src = URL.createObjectURL(blob); t.hidden = false;
      var p = t.play(); if (p && p.catch) p.catch(function () {});
    } else {
      var im = $('#camPic');
      im.src = URL.createObjectURL(blob); im.hidden = false;
    }
    $('#camLive').hidden = true; $('#camReview').hidden = false;
    $('#camTime').hidden = true; $('#camClose').hidden = false;
  }
  function clearTake() {
    var t = $('#camTake'), im = $('#camPic');
    t.pause();
    if (t.getAttribute('src')) { URL.revokeObjectURL(t.src); t.removeAttribute('src'); t.load(); }
    if (im.getAttribute('src')) { URL.revokeObjectURL(im.src); im.removeAttribute('src'); }
    t.hidden = true; im.hidden = true;
    cam.take = null; cam.takeKind = null;
  }
  $('#camAgain').addEventListener('click', function () { clearTake(); camShowLive(); });
  $('#camUse').addEventListener('click', function () {
    if (!cam.take) return;
    var kind = cam.takeKind, type = cam.take.type || (kind === 'image' ? 'image/jpeg' : 'video/webm');
    var ext = kind === 'image' ? 'jpg' : type.indexOf('mp4') >= 0 ? 'mp4' : 'webm';
    var f = new File([cam.take], (kind === 'image' ? 'photo-' : 'video-') + stamp() + '.' + ext, { type: type });
    importFiles([f]);
    clearTake(); camShowLive();
  });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden && camOpen() && !camRecording() && !cam.take) closeCam();
  });

  // ---------------------------------------------------------------- keyboard + controller
  document.addEventListener('keydown', function (e) {
    if (e.target && (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT' && e.target.type !== 'range')) return;
    if (!$('#sheet').hidden || exporting || camOpen()) return;
    if (window.MickleMenu && MickleMenu.isOpen && MickleMenu.isOpen()) return;
    ensureAudio();
    var k = e.key;
    if (k === ' ') { e.preventDefault(); togglePlay(); }
    else if ((e.ctrlKey || e.metaKey) && (k === 'z' || k === 'Z')) { e.preventDefault(); undo(); }
    else if (k === 's' || k === 'S') splitAtPlayhead();
    else if (k === 't' || k === 'T') addText();
    else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); deleteSelected(); }
    else if (k === 'Home') { playT = 0; dirty = true; tlDirty = true; }
    else if (k === 'End') { playT = total(); dirty = true; tlDirty = true; }
    else if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      var d = (e.shiftKey ? 1 : 1 / 30) * (k === 'ArrowLeft' ? -1 : 1);
      if (playing) stopPlay();
      playT = clamp(playT + d, 0, total()); dirty = true; tlDirty = true;
    } else if (k === 'Escape' && sel) { sel = null; renderInspector(); tlDirty = true; dirty = true; }
    else if (k === '+' || k === '=') { pps = clamp(pps * 1.25, 6, 600); tlDirty = true; }
    else if (k === '-') { pps = clamp(pps / 1.25, 6, 600); tlDirty = true; }
  });
  function pollPad(dt) {
    if (!window.Pad360) return;
    Pad360.poll();
    if (!$('#sheet').hidden || exporting || camOpen()) return;
    if (window.MickleMenu && MickleMenu.isOpen && MickleMenu.isOpen()) return;
    var B = Pad360.BTN;
    if (Pad360.pressed(B.A) || Pad360.pressed(B.START)) { ensureAudio(); togglePlay(); }
    if (Pad360.pressed(B.X)) splitAtPlayhead();
    if (Pad360.pressed(B.Y)) addText();
    if (Pad360.pressed(B.B)) undo();
    if (Pad360.pressed(B.LB)) { pps = clamp(pps / 1.25, 6, 600); tlDirty = true; }
    if (Pad360.pressed(B.RB)) { pps = clamp(pps * 1.25, 6, 600); tlDirty = true; }
    var dx = Pad360.dx();
    if (dx) {
      if (playing) stopPlay();
      playT = clamp(playT + dx * dt * 2, 0, total()); dirty = true; tlDirty = true;
    }
  }

  // ---------------------------------------------------------------- layout
  function layout() {
    var r = stage.getBoundingClientRect();
    var tall = r.height > r.width * 1.05;
    ui.classList.toggle('tall', tall);
    var fs = tall ? Math.min(r.width / 66, r.height / 130) : Math.min(r.height / 100, r.width / 178);
    ui.style.fontSize = fs + 'px';
    $('#sheet').style.fontSize = fs + 'px';
    $('#cam').style.fontSize = fs + 'px';
    resizeTL();
  }
  window.addEventListener('resize', layout);
  if (window.ResizeObserver) new ResizeObserver(layout).observe(stage);
  layout();

  // ---------------------------------------------------------------- main loop
  function prevMsg() {
    var m = $('#prevMsg'), msg = '';
    if (!project.main.length && !project.top.length && !project.text.length) msg = importing ? 'Bringing it in...' : 'Tap + ADD to bring in videos and photos!';
    if (m.textContent !== msg) m.textContent = msg;
  }
  var lastTime = '';
  function loop(now) {
    requestAnimationFrame(loop);
    var dt = Math.min(0.1, (now - (lastNow || now)) / 1000);
    lastNow = now;
    pollPad(dt);
    if (playing) { step(dt); dirty = true; tlDirty = true; }
    // keep scrubbing seeks flowing even when nothing else changed
    if (!playing && (dirty || els.size)) {
      var act = activeAt(playT);
      for (var i = 0; i < act.length; i++) {
        var e = els.get(act[i].clip.id);
        if (e && e.el.readyState >= 1 && !e.el.seeking && Math.abs(e.el.currentTime - act[i].src) > 0.02) dirty = true;
      }
    }
    if (dirty) { dirty = false; renderFrame(playT, !!exporting); }
    if (tlDirty) { tlDirty = false; drawTL(); }
    var ts = fmt(playT) + ' / ' + fmt(total());
    if (ts !== lastTime) {
      lastTime = ts;
      var parts = ts.split(' / ');
      $('#time').innerHTML = parts[0] + ' <small>/ ' + parts[1] + '</small>';
    }
    if (exporting && exporting.fill) exporting.fill.style.width = (100 * clamp(playT / exporting.T, 0, 1)) + '%';
    prevMsg();
  }

  // pause when the tab hides or the menu opens
  document.addEventListener('visibilitychange', function () { if (document.hidden && playing && !exporting) stopPlay(); });
  document.addEventListener('pointerdown', function (e) { if (e.target.closest && e.target.closest('.mc-menu-btn') && playing && !exporting) stopPlay(); }, true);

  // ---------------------------------------------------------------- restore last session
  function restore() {
    return DB.get('kv', 'project').then(function (json) {
      if (!json) return;
      var p;
      try { p = JSON.parse(json); } catch (e) { return; }
      if (!p || !p.media) return;
      toast('OPENING YOUR MOVIE...', 30000);
      var keep = [];
      return p.media.reduce(function (chain, rec) {
        return chain.then(function () {
          // fun backgrounds have no file -- they're drawn in code
          if (rec.kind === 'bg') { bgRuntime(rec); keep.push(rec); return; }
          return DB.get('media', rec.id).then(function (blob) {
            if (!blob) return;
            return loadMedia(blob, rec).then(function (m) { if (m) keep.push(m); });
          }).catch(function () {});
        });
      }, Promise.resolve()).then(function () {
        p.media = keep;
        project = Object.assign(newProject(), p);
        dropBrokenClips();
        setOutSize(false);
        changed();
        toast(keep.length ? 'WELCOME BACK!' : 'READY!');
      });
    }).catch(function () {});
  }

  renderInspector();
  renderBin();
  updateButtons();
  requestAnimationFrame(loop);
  restore();

  // for testing
  window.DreamReelDebug = {
    get project() { return project; },
    get playT() { return playT; }, set playT(v) { playT = v; dirty = true; tlDirty = true; },
    get sel() { return sel; },
    importFiles: importFiles, select: function (layer, id) { sel = { layer: layer, id: id }; renderInspector(); tlDirty = true; dirty = true; },
    split: splitAtPlayhead, addText: addText, play: startPlay, stop: stopPlay, total: total,
    exportMovie: startExport, els: els, gl: !!gl,
    render: function (t) { renderFrame(t == null ? playT : t, false); },
    cutStore: function (mediaId) { return maskStore[mediaId]; },
    tick: function (dt) { if (playing) step(dt); renderFrame(playT, false); },   // when the page isn't painting pickKeyAt: pickKeyAt, toOut: toOut, lastBoxes: function () { return lastBoxes; }
  };
})();
