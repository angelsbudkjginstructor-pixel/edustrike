/* EduStrike - CLASS SEASON (teacher's page only).
   Points from every finished class match add up (per student name) so the class can play for a whole week or term
   and finish with a trophy. Everything is stored on THIS computer (localStorage), nothing is sent anywhere.

   How points are made (the referee in match.js works them out): 5 for playing + 3 per right answer + 4 per friend revived
   + 1 per tag + 10 if your team won.

   SAFETY CHECKS:
   - the same match can never be added twice (every match has its own number)
   - names are cleaned and cut to 12 letters; at most 200 students; numbers are checked
   - if the saved data is damaged, the season simply starts again (it never crashes the page)
   - "New season" asks the teacher first and keeps nothing of the old one (a CSV can be copied before) */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const KEY = 'edustrike.season.v1';
  const MAX_PLAYERS = 200;

  function num(v, max) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? Math.min(v, max || 1e6) : 0; }
  function cleanName(n) { return String(n == null ? '' : n).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); }
  function blank(name) { return { name: cleanName(name) || 'Season 1', started: Date.now(), matches: 0, ids: [], players: {} }; }

  let D = null;
  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw && typeof raw === 'object' && raw.players && typeof raw.players === 'object') {
        D = blank(raw.name); D.started = num(raw.started, 1e14) || Date.now(); D.matches = num(raw.matches, 99999);
        D.ids = Array.isArray(raw.ids) ? raw.ids.filter(function (x) { return typeof x === 'number'; }).slice(-300) : [];
        Object.keys(raw.players).slice(0, MAX_PLAYERS).forEach(function (k) {
          const p = raw.players[k]; if (!p) return;
          D.players[String(k).slice(0, 20)] = { name: cleanName(p.name), pts: num(p.pts), tags: num(p.tags), right: num(p.right), revives: num(p.revives), wins: num(p.wins), played: num(p.played) };
        });
        return;
      }
    } catch (e) { /* damaged: start again */ }
    D = blank('Season 1');
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(D)); } catch (e) { /* storage blocked: the season still works until the page closes */ } }
  load();

  /* a finished match (from ES.match.summary()): returns true if it was added, false if it was already counted */
  function add(sum) {
    if (!sum || !Array.isArray(sum.rows) || typeof sum.id !== 'number') return false;
    if (D.ids.indexOf(sum.id) >= 0) return false;
    sum.rows.forEach(function (r) {
      const name = cleanName(r.name); if (!name) return;
      const key = name.toLowerCase();
      let p = D.players[key];
      if (!p) { if (Object.keys(D.players).length >= MAX_PLAYERS) return; p = D.players[key] = { name: name, pts: 0, tags: 0, right: 0, revives: 0, wins: 0, played: 0 }; }
      p.pts += num(r.pts, 2000); p.tags += num(r.kills, 999); p.right += num(r.q, 999); p.revives += num(r.revives, 999); p.played++; if (r.won) p.wins++;
    });
    D.matches++; D.ids.push(sum.id); if (D.ids.length > 300) D.ids.shift();
    save();
    return true;
  }
  function ranking() {
    return Object.keys(D.players).map(function (k) { return D.players[k]; }).sort(function (a, b) { return (b.pts - a.pts) || (b.right - a.right) || a.name.localeCompare(b.name); });
  }
  function csv() {
    const q = function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; };
    const lines = [['Rank', 'Name', 'Season points', 'Matches', 'Wins', 'Right answers', 'Tags', 'Friends revived'].map(q).join(',')];
    ranking().forEach(function (p, i) { lines.push([i + 1, q(p.name.replace(/^[=+\-@]+/, '')), p.pts, p.played, p.wins, p.right, p.tags, p.revives].join(',')); });
    return lines.join('\n');
  }
  ES.season = {
    get: function () { return D; },
    add: add,
    ranking: ranking,
    csv: csv,
    rename: function (n) { D.name = cleanName(n) || D.name; save(); },
    /* a new season starts empty, but remembers which matches were already counted (so the match still on screen is never added to it) */
    reset: function (name) { const keep = D.ids; D = blank(name || 'New season'); D.ids = keep; save(); }
  };
})();
