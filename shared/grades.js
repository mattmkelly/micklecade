// MickleCade -- the big-kid grades (7 to 12) in the learning games.
// Finishing the top level of ANY of them -- Math Mountain's Grade 6 Summit Quiz, the last stop of
// Wiggle Reads' Grade 6 trail, or catching Rascal in Globe Sleuths' Grade 6 BIG CASE -- opens
// grades 7-12 in all three. It is one flag in localStorage, shared by every game on the site.
//   MickleGrades.unlocked()  -> true once grades 7-12 are open
//   MickleGrades.unlock()    -> opens them; true only the first time (so a game can celebrate)
(function () {
  'use strict';
  var KEY = 'micklecade.bigGrades';
  var mem = false; // if storage is blocked, it stays open until the page closes
  function unlocked() {
    if (mem) return true;
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }
  function unlock() {
    if (unlocked()) return false;
    mem = true;
    try { localStorage.setItem(KEY, '1'); } catch (e) { /* blocked */ }
    return true;
  }
  window.MickleGrades = {
    unlocked: unlocked,
    unlock: unlock,
    MSG: 'Grades 7 to 12 are now open in Math Mountain, Wiggle Reads and Globe Sleuths!',
  };
})();
