// MickleVoice -- picks the nicest read-aloud voice this device has, and lets kids choose another.
// Uses the browser's built-in speech (speechSynthesis): no sound files, works offline with device voices.
//
//   MickleVoice.speak(text | [part, part...], { pitch, rate, onend })  -- parts are read with a short pause between
//   MickleVoice.cancel()
//   MickleVoice.list()      -- English voices, best first: [{ name, label, voice, score }]
//   MickleVoice.current()   -- the voice in use (the saved choice if this device has it, else the best one)
//   MickleVoice.choose(name)  -- save a choice for every MickleCade game (localStorage 'micklecade.voice'); null = automatic
//   MickleVoice.chosen()    -- the saved name, or null for automatic
//   MickleVoice.onChange(fn)  -- called when the device's voice list loads or changes (voices often arrive late)
//   MickleVoice.can         -- false if this browser has no speech at all
(function () {
  'use strict';
  const KEY = 'micklecade.voice';
  const can = typeof window.speechSynthesis !== 'undefined' && typeof window.SpeechSynthesisUtterance !== 'undefined';
  // Novelty and very robotic voices kids shouldn't land on.
  const SKIP = /albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|deranged|hysterical|pipe organ|fred|ralph|junior|kathy|espeak|eloquence|grandma|grandpa|rocko|shelley|sandy|flo|reed/i;
  function score(v) {
    const n = v.name;
    let s = 0;
    if (/natural|neural/i.test(n)) s += 100;           // Edge / Windows "Natural" voices, Android neural voices
    if (/enhanced|premium|siri/i.test(n)) s += 80;     // Apple's downloaded voices
    if (/google/i.test(n)) s += 60;                   // Chrome / Android
    if (/samantha|ava|allison|susan|zoe|evan|nathan|karen|moira|tessa|serena|daniel/i.test(n)) s += 45;
    if (/aria|jenny|guy|ana|michelle|emma|brian|andrew|ava|libby|sonia|natasha/i.test(n)) s += 40;
    if (/amazon|ivona|polly|joanna|salli|kimberly|ivy|justin|kendra/i.test(n)) s += 40;
    // Older Windows voices: clear but flat. Mark sounds the most natural of them (to our ears, 2026-11-24).
    if (/\bmark\b/i.test(n)) s += 16; else if (/zira|hazel/i.test(n)) s += 10; else if (/david|george/i.test(n)) s += 8;
    if (/en[-_]US/i.test(v.lang)) s += 12; else if (/en[-_](GB|AU|CA|IE|NZ)/i.test(v.lang)) s += 6;
    if (v.default) s += 3;
    return s;
  }
  function pretty(v) {
    return v.name.replace(/^(Microsoft|Google|Apple)\s+/i, '').replace(/\s*Online\s*\(Natural\)/i, ' (natural)')
      .replace(/\s*-\s*English.*$/i, '').replace(/\s*\(Enhanced\)/i, ' (enhanced)').replace(/\s*\(Premium\)/i, ' (premium)').trim();
  }
  let ranked = [];
  const listeners = [];
  function refresh() {
    if (!can) return;
    let vs = [];
    try { vs = speechSynthesis.getVoices(); } catch (e) { return; }
    const seen = {};
    ranked = vs.filter((v) => /^en/i.test(v.lang) && !SKIP.test(v.name))
      .map((v) => ({ name: v.name, label: pretty(v), voice: v, score: score(v), lang: v.lang }))
      .filter((v) => (seen[v.name] ? false : (seen[v.name] = true)))
      .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label));
    listeners.forEach((fn) => { try { fn(); } catch (e) { /* */ } });
  }
  function chosen() { try { return localStorage.getItem(KEY) || null; } catch (e) { return null; } }
  function choose(name) { try { if (name) localStorage.setItem(KEY, name); else localStorage.removeItem(KEY); } catch (e) { /* */ } }
  function current() {
    const c = chosen();
    return (c && ranked.find((v) => v.name === c)) || ranked[0] || null;
  }
  let gen = 0;
  function cancel() { gen++; try { if (can) speechSynthesis.cancel(); } catch (e) { /* */ } }
  function speak(text, opts = {}) {
    if (!can) return;
    cancel();
    const my = gen;
    // Long text is split into sentences: Chrome's online voices can stop partway through a long utterance,
    // and the gaps between parts give a natural little pause.
    const parts = [].concat(text).map((t) => String(t || '').trim()).filter(Boolean)
      .flatMap((t) => (t.length > 160 ? t.match(/[^.!?]+[.!?]*\s*/g) || [t] : [t]));
    const v = opts.voice || current();
    const next = (i) => {
      if (my !== gen) return;
      if (i >= parts.length) { if (opts.onend) opts.onend(); return; }
      try {
        const u = new SpeechSynthesisUtterance(parts[i]);
        if (v) { u.voice = v.voice; u.lang = v.voice.lang; } else u.lang = 'en-US';
        u.rate = opts.rate || 0.95; u.pitch = opts.pitch || 1;
        u.onend = () => setTimeout(() => next(i + 1), opts.gap === undefined ? 180 : opts.gap);
        u.onerror = () => next(i + 1);
        speechSynthesis.speak(u);
      } catch (e) { /* no voice */ }
    };
    next(0);
  }
  if (can) {
    refresh();
    try { speechSynthesis.addEventListener('voiceschanged', refresh); } catch (e) { try { speechSynthesis.onvoiceschanged = refresh; } catch (e2) { /* */ } }
    // Some browsers never fire voiceschanged: look again a couple of times.
    setTimeout(refresh, 600); setTimeout(refresh, 2000);
  }
  window.MickleVoice = { can, speak, cancel, list: () => ranked.slice(), current, choose, chosen, onChange: (fn) => listeners.push(fn) };
})();
