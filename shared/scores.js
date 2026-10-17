// Shared player profiles + high-score boards for MickleCade.
//
// The launcher lets each kid pick (or add) their player name; every game then records
// finished runs against whoever is playing, with the date. Boards keep the top 10 per
// game -- and per track / land / grade when a game has those -- and the launcher shows them.
//
// Plain <script src="../../shared/scores.js"> before game.js -- no modules, works from
// file://. In game.js, when a run / race / level ends:
//   MickleScores.record('freddy-bear-run', score);
//   MickleScores.record('munchy-math', score, { category: 'GRADE 3', order: 3 });
//   MickleScores.record('freddy-bear-kart', seconds, { category: 'SNOW TO SURF', order: 1,
//                                                     lowerIsBetter: true, format: 'time' });
// The game id is the game's folder name. `order` sorts categories on the launcher board.
// Everything lives in localStorage; reads/writes are wrapped because storage can throw.
(function (global) {
  var PLAYERS_KEY = 'micklecade.players';
  var SCORES_KEY = 'micklecade.scores';
  var KEEP = 10;
  var NAME_MAX = 10;
  var GUEST = 'GUEST';

  function read(key, fallback) {
    try {
      var v = JSON.parse(localStorage.getItem(key) || 'null');
      return v && typeof v === 'object' ? v : fallback;
    } catch (e) { return fallback; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) {}
  }

  // ---- Players ----

  function loadPlayers() {
    var p = read(PLAYERS_KEY, null);
    if (!p || !Array.isArray(p.names)) p = { current: '', names: [] };
    return p;
  }

  function cleanName(name) {
    return String(name || '').toUpperCase().replace(/[^A-Z0-9 ]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
  }

  function player() { return loadPlayers().current || ''; }
  function players() { return loadPlayers().names.slice(); }

  // Pick an existing player or add a new one; returns the cleaned name ('' if invalid).
  function setPlayer(name) {
    name = cleanName(name);
    if (!name) return '';
    var p = loadPlayers();
    if (p.names.indexOf(name) === -1) p.names.push(name);
    p.current = name;
    write(PLAYERS_KEY, p);
    return name;
  }

  // Removes the name from the picker; their scores stay on the boards.
  function removePlayer(name) {
    var p = loadPlayers();
    p.names = p.names.filter(function (n) { return n !== name; });
    if (p.current === name) p.current = '';
    write(PLAYERS_KEY, p);
  }

  // ---- Scores ----

  function today() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  // Records one finished run. Returns its 1-based rank on the board, or 0 if it missed the top 10.
  function record(game, score, opts) {
    opts = opts || {};
    if (typeof score !== 'number' || !isFinite(score)) return 0;
    var lower = !!opts.lowerIsBetter;
    if (!lower && score <= 0) return 0;
    var cat = opts.category ? String(opts.category) : '';

    var all = read(SCORES_KEY, {});
    var g = all[game] || (all[game] = { last: '', cats: {} });
    var b = g.cats[cat] || (g.cats[cat] = { list: [] });
    b.lower = lower;
    if (opts.format) b.format = opts.format;
    if (typeof opts.order === 'number') b.order = opts.order;

    var entry = { name: player() || GUEST, score: score, date: today(), t: Date.now() };
    b.list.push(entry);
    b.list.sort(function (a, c) {
      var diff = lower ? a.score - c.score : c.score - a.score;
      return diff || a.t - c.t; // ties: whoever got there first stays ahead
    });
    b.list = b.list.slice(0, KEEP);
    g.last = cat;
    write(SCORES_KEY, all);
    return b.list.indexOf(entry) + 1;
  }

  // The game's boards as [{ category, lower, format, list }], in `order` order.
  function boards(game) {
    var g = read(SCORES_KEY, {})[game];
    if (!g || !g.cats) return [];
    return Object.keys(g.cats).map(function (cat) {
      var b = g.cats[cat];
      return { category: cat, lower: !!b.lower, format: b.format || '', order: b.order, list: b.list || [] };
    }).sort(function (a, c) {
      var ao = typeof a.order === 'number' ? a.order : 999, co = typeof c.order === 'number' ? c.order : 999;
      return ao - co || (a.category < c.category ? -1 : 1);
    });
  }

  // The category last played in that game, so the launcher can open on it.
  function lastCategory(game) {
    var g = read(SCORES_KEY, {})[game];
    return g ? g.last || '' : '';
  }

  function formatScore(score, format) {
    if (format === 'time') {
      var m = Math.floor(score / 60), s = score - m * 60;
      return m + ':' + s.toFixed(2).padStart(5, '0');
    }
    return String(score);
  }

  global.MickleScores = {
    GUEST: GUEST,
    NAME_MAX: NAME_MAX,
    player: player,
    players: players,
    setPlayer: setPlayer,
    removePlayer: removePlayer,
    cleanName: cleanName,
    record: record,
    boards: boards,
    lastCategory: lastCategory,
    formatScore: formatScore,
  };
})(window);
