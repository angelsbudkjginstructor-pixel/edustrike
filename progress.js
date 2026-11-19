/* EduStrike - MY PROFILE: XP, levels, badges, unlockable looks and small perks. Saved on this computer and (if the teacher set it up) in the teacher's Google Sheet.

   HOW IT WORKS
   - A student signs in with a NAME and a 4-digit CODE (the code stops two students with the same name from sharing one profile).
   - After every match the game adds XP (right answers, tags, finishing, winning, streaks). XP gives LEVELS. Levels unlock looks and tiny perks.
   - Everything is saved in the browser at once (so it never slows or breaks the game) and sent to the Google Sheet in the background.
   - Perks are small and fair: extra starting ammo and a little more ammo per right answer. Nobody becomes unbeatable.

   SAFETY CHECKS
   - No Sheet link? Everything still works and is saved on this computer.
   - Every save / network call is inside try/catch with a time limit; a failure only means "not synced yet" (it retries next time).
   - The code is never stored as plain text (only a short scrambled value), and a wrong code for an existing name is refused.
   - XP per match is capped, and the profile is checked (numbers, lists, known item ids) every time it is loaded. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const cfg = ES.PROGRESS = ES.PROGRESS || {};
  const PFX = 'edustrike.prog.v1.', LAST = 'edustrike.prog.last';
  const MAX_LEVEL = 20, XP_CAP = 320;

  /* ---------- the locker: what can be unlocked (level needed, name, look) ---------- */
  const CAT = {
    helmet: [
      { id: 'h0', lvl: 1, name: 'Classic', shape: '', color: 0 },
      { id: 'h1', lvl: 2, name: 'Gold Cap', shape: 'cap', color: 0xffc83d },
      { id: 'h2', lvl: 3, name: 'Lime Crest', shape: 'crest', color: 0x7ee03a },
      { id: 'h3', lvl: 5, name: 'Purple Horns', shape: 'horns', color: 0xa855f7 },
      { id: 'h4', lvl: 7, name: 'Ice Halo', shape: 'halo', color: 0x67e8f9 },
      { id: 'h5', lvl: 10, name: 'Royal Crown', shape: 'crown', color: 0xffc83d },
      { id: 'h6', lvl: 1, name: 'Blue Cap', shape: 'cap', color: 0x2f86ff },
      { id: 'h7', lvl: 1, name: 'Red Cap', shape: 'cap', color: 0xff5a3c },
      { id: 'h8', lvl: 1, name: 'Green Cap', shape: 'cap', color: 0x22c55e },
      { id: 'h9', lvl: 1, name: 'Orange Cap', shape: 'cap', color: 0xff8a1f }
    ],
    gun: [
      { id: 'g0', lvl: 1, name: 'Team Colour', color: 0 },
      { id: 'g1', lvl: 2, name: 'Sunny', color: 0xffd23f },
      { id: 'g2', lvl: 4, name: 'Ocean', color: 0x22d3ee },
      { id: 'g3', lvl: 6, name: 'Flame', color: 0xff5a2e },
      { id: 'g4', lvl: 8, name: 'Galaxy', color: 0xa855f7 },
      { id: 'g5', lvl: 10, name: 'Golden', color: 0xffc83d, metal: true },
      { id: 'g6', lvl: 1, name: 'Blue', color: 0x2f86ff },
      { id: 'g7', lvl: 1, name: 'Red', color: 0xff5a3c },
      { id: 'g8', lvl: 1, name: 'Green', color: 0x22c55e }
    ],
    trail: [
      { id: 't0', lvl: 1, name: 'Classic', color: 0 },
      { id: 't1', lvl: 3, name: 'Green', color: 0x4ade80 },
      { id: 't2', lvl: 5, name: 'Pink', color: 0xff7ad9 },
      { id: 't3', lvl: 7, name: 'Rainbow', color: -1 },
      { id: 't4', lvl: 9, name: 'Gold', color: 0xffd23f }
    ],
    tag: [      /* the colour of your name above your head (classmates see it in a class match) */
      { id: 'n0', lvl: 1, name: 'Team Colour', color: 0 },
      { id: 'n1', lvl: 1, name: 'Gold', color: 0xffc83d },
      { id: 'n2', lvl: 1, name: 'Pink', color: 0xff7ad9 },
      { id: 'n3', lvl: 1, name: 'Green', color: 0x22c55e },
      { id: 'n4', lvl: 4, name: 'Cyan', color: 0x22d3ee },
      { id: 'n5', lvl: 8, name: 'Purple', color: 0xa855f7 }
    ]
  };
  const KINDS = ['helmet', 'gun', 'trail', 'tag'];
  const KIND_NAME = { helmet: 'Helmet', gun: 'Blaster look', trail: 'Shot trail', tag: 'Name colour' };
  const PERKS = [    // [level, text, startAmmo, perAnswer]
    [4, '+2 starting ammo', 2, 0], [6, '+1 ammo for every right answer', 0, 1], [8, '+2 more starting ammo', 2, 0], [12, '+1 more ammo for every right answer', 0, 1]
  ];
  const BADGES = {
    played5: ['🎮', '5 Matches', 'Play 5 matches'], played25: ['🎖️', '25 Matches', 'Play 25 matches'],
    win1: ['🏆', 'First Victory', 'Win a match'], win10: ['🥇', '10 Victories', 'Win 10 matches'],
    right50: ['🧠', '50 Right Answers', 'Answer 50 questions right'], right200: ['🎓', '200 Right Answers', 'Answer 200 questions right'],
    streak5: ['🔥', 'Streak of 5', '5 right answers in a row'], streak10: ['⚡', 'Streak of 10', '10 right answers in a row'],
    perfect: ['⭐', 'Perfect Match', 'Answer every question right (at least 5)'], sharp: ['🎯', 'Sharpshooter', '60% shot accuracy (at least 15 shots)'],
    survivor: ['🛡️', 'Survivor', 'Tag 3 or more and never get tagged']
  };
  function badgeInfo(id) {      // subject badges are made from the subject name: "sj_<code>"
    if (BADGES[id]) return BADGES[id];
    if (id.indexOf('sj_') === 0) { const s = ES.SUBJECTS && ES.SUBJECTS[id.slice(3)]; return [s ? s.icon : '📚', (s ? s.name : id.slice(3)) + ' Star', 'Answer 20 ' + (s ? s.name : '') + ' questions right']; }
    return ['🏅', id, ''];
  }

  /* ---------- levels ---------- */
  const xpFor = function (L) { return 50 * (L - 1) * L; };                 // total XP needed to reach level L  (L2 = 100, L3 = 300, L5 = 1000, L10 = 4500)
  function levelOf(xp) { let L = 1; while (L < MAX_LEVEL && xp >= xpFor(L + 1)) L++; return L; }
  function info(P) {
    const L = levelOf(P.xp), a = xpFor(L), b = L >= MAX_LEVEL ? a : xpFor(L + 1);
    return { level: L, into: P.xp - a, need: Math.max(1, b - a), pct: L >= MAX_LEVEL ? 100 : Math.round(100 * (P.xp - a) / Math.max(1, b - a)) };
  }

  /* ---------- a short scrambled value for the code (never the code itself) ---------- */
  function scramble(name, code) {
    let h = 2166136261; const s = 'edustrike|' + name.toLowerCase() + '|' + code;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(36);
  }
  const cleanName = function (n) { return String(n || '').replace(/[<>&"'`=+@\-]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12); };
  const keyOf = function (name, ch) { return PFX + name.toLowerCase() + '.' + ch; };

  /* ---------- make any loaded profile safe ---------- */
  function blank(name, ch) {
    return { v: 1, name: name, ch: ch, xp: 0, matches: 0, wins: 0, kills: 0, right: 0, asked: 0, bestStreak: 0, subj: {}, badges: [], equip: { helmet: 'h0', gun: 'g0', trail: 't0', tag: 'n0' }, updated: 0, dirty: false };
  }
  const num = function (v, max) { v = Math.floor(Number(v)); return isFinite(v) && v > 0 ? Math.min(v, max || 1e7) : 0; };
  function clean(raw, name, ch) {
    const P = blank(name, ch);
    if (!raw || typeof raw !== 'object') return P;
    P.xp = num(raw.xp, 1e6); P.matches = num(raw.matches); P.wins = num(raw.wins); P.kills = num(raw.kills); P.right = num(raw.right); P.asked = num(raw.asked); P.bestStreak = num(raw.bestStreak, 999);
    if (raw.subj && typeof raw.subj === 'object') Object.keys(raw.subj).slice(0, 40).forEach(function (k) { P.subj[String(k).slice(0, 30)] = num(raw.subj[k]); });
    if (Array.isArray(raw.badges)) P.badges = raw.badges.filter(function (b) { return typeof b === 'string' && b.length < 40; }).slice(0, 80);
    KINDS.forEach(function (k) {
      const want = raw.equip && raw.equip[k], ok = CAT[k].some(function (it) { return it.id === want; });
      P.equip[k] = ok ? want : CAT[k][0].id;
    });
    P.updated = num(raw.updated, 1e14); P.dirty = !!raw.dirty;
    return P;
  }
  /* two copies of one profile (this computer / the Sheet): keep the one with more XP, and never lose a badge */
  function merge(a, b) {
    const win = (b.xp > a.xp || (b.xp === a.xp && b.updated > a.updated)) ? b : a, lose = win === a ? b : a;
    const M = clean(win, a.name, a.ch);
    lose.badges.forEach(function (x) { if (M.badges.indexOf(x) < 0) M.badges.push(x); });
    M.bestStreak = Math.max(a.bestStreak, b.bestStreak);
    Object.keys(lose.subj).forEach(function (k) { M.subj[k] = Math.max(M.subj[k] || 0, lose.subj[k]); });
    return M;
  }

  let P = null;                                     // the signed-in profile (or null = guest)
  const listeners = [];
  function changed() { listeners.forEach(function (f) { try { f(P); } catch (e) { /* ignore */ } }); }

  function store() { try { if (P) localStorage.setItem(keyOf(P.name, P.ch), JSON.stringify(P)); } catch (e) { /* storage full or blocked: still fine this session */ } }
  function load(name, ch) { try { const r = localStorage.getItem(keyOf(name, ch)); return r ? clean(JSON.parse(r), name, ch) : null; } catch (e) { return null; } }

  /* ---------- Google Sheet link (optional) ---------- */
  function post(body) {
    if (!cfg.url) return Promise.resolve({ ok: false, offline: true });
    const ctl = ('AbortController' in window) ? new AbortController() : null, timer = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    return fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), redirect: 'follow', cache: 'no-store', signal: ctl ? ctl.signal : undefined })
      .then(function (r) { clearTimeout(timer); return r.json(); })
      .catch(function () { clearTimeout(timer); return { ok: false, offline: true }; });
  }
  let pushing = false, pushAgain = false;
  function sync() {
    if (!P || !cfg.url) return Promise.resolve(false);
    if (pushing) { pushAgain = true; return Promise.resolve(false); }
    pushing = true; const snap = JSON.parse(JSON.stringify(P));
    return post({ action: 'save', name: snap.name, ch: snap.ch, profile: summary(snap) }).then(function (r) {
      pushing = false;
      if (r && r.ok && P && P.name === snap.name) { P.dirty = false; store(); }
      if (pushAgain) { pushAgain = false; sync(); }
      return !!(r && r.ok);
    });
  }
  function summary(p) {            // what the Sheet gets: the readable numbers for the teacher + the full profile
    const I = info(p), acc = p.asked ? Math.round(100 * p.right / p.asked) : 0;
    return { level: I.level, xp: p.xp, matches: p.matches, wins: p.wins, right: p.right, asked: p.asked, acc: acc, bestStreak: p.bestStreak,
             badges: p.badges.map(function (b) { return badgeInfo(b)[1]; }).join(', '), full: p };
  }

  /* ---------- sign in ---------- */
  function setCurrent(p) {
    P = p; store();
    try { localStorage.setItem(LAST, JSON.stringify({ name: p.name, ch: p.ch })); } catch (e) { /* ignore */ }
    changed();
  }
  /* resolves { ok, isNew, synced, msg } - never throws */
  function signIn(nameIn, codeIn) {
    const name = cleanName(nameIn), code = String(codeIn || '').trim();
    if (!name) return Promise.resolve({ ok: false, msg: 'Please type your name.' });
    if (!/^\d{4}$/.test(code)) return Promise.resolve({ ok: false, msg: 'Your code is 4 numbers, for example 1234.' });
    const ch = scramble(name, code), local = load(name, ch);
    return post({ action: 'login', name: name, ch: ch }).then(function (r) {
      if (r && r.ok === false && r.wrong) return { ok: false, msg: 'That name already has a different code. Try your code again, or add a letter to your name.' };
      let p = local, isNew = !local, synced = false;
      if (r && r.ok) {
        synced = true;
        if (r.profile) { const remote = clean(r.profile, name, ch); p = p ? merge(p, remote) : remote; isNew = false; }
      } else if (!local && !r.offline && cfg.url) { /* unknown answer: start fresh on this computer */ }
      if (!p) p = blank(name, ch);
      p.dirty = !synced || p.dirty;
      setCurrent(p);
      if (cfg.url && (isNew || p.dirty)) sync();
      return { ok: true, isNew: isNew, synced: synced || !cfg.url, msg: '' };
    });
  }
  function signOut() { P = null; try { localStorage.removeItem(LAST); } catch (e) { /* ignore */ } changed(); }
  function restore() {                       // after a page reload: back into the same profile (the "Switch student" button signs out)
    try { const l = JSON.parse(localStorage.getItem(LAST) || 'null'); if (l && l.name && l.ch) { const p = load(l.name, l.ch); if (p) { P = p; if (p.dirty) sync(); } } } catch (e) { /* guest */ }
  }

  /* ---------- the match is over: add XP, level up, new badges ---------- */
  function award(m) {
    const out = { signedIn: !!P, gain: [], total: 0, awards: [], newBadges: [], newItems: [], newPerks: [], before: null, after: null };
    m = m || {};
    const asked = num(m.qAsked), right = Math.min(num(m.qRight), asked), kills = num(m.kills), shots = num(m.shots), hits = Math.min(num(m.hits), shots), best = num(m.bestStreak, 999), deaths = num(m.deaths);
    /* awards of THIS match (shown even to guests) */
    if (asked >= 5 && right === asked) out.awards.push(['🧠', 'Best Brain', 'Every answer was right!']);
    else if (asked >= 5 && right / asked >= 0.8) out.awards.push(['🧠', 'Sharp Mind', '80% or more right.']);
    if (shots >= 15 && hits / shots >= 0.6) out.awards.push(['🎯', 'Sharpshooter', 'Most of your shots hit.']);
    if (best >= 5) out.awards.push(['🔥', 'Streak Master', best + ' right answers in a row!']);
    if (kills >= 3 && deaths === 0) out.awards.push(['🛡️', 'Survivor', 'Never got tagged.']);
    if (m.outcome === 'win') out.awards.push(['🏆', 'Team Winner', 'Your team won.']);
    /* XP */
    const add = function (txt, n) { if (n > 0) { out.gain.push([txt, n]); out.total += n; } };
    add('Played the match', 15); add(right + ' right answers', right * 10); add(kills + ' tags', kills * 4);
    if (m.outcome === 'win') add('Victory bonus', 40); else if (m.outcome === 'draw') add('Draw bonus', 15);
    if (best >= 10) add('Streak of 10!', 30); else if (best >= 5) add('Streak of 5!', 10);
    if (out.total > XP_CAP) { out.gain.push(['(match limit)', XP_CAP - out.total]); out.total = XP_CAP; }
    if (!P) return out;                                                                   // a guest: awards shown, nothing saved
    out.before = { xp: P.xp, lv: levelOf(P.xp) };
    P.xp += out.total; P.matches++; if (m.outcome === 'win') P.wins++;
    P.kills += kills; P.right += right; P.asked += asked; P.bestStreak = Math.max(P.bestStreak, best);
    Object.keys(m.bySubj || {}).forEach(function (k) { const v = m.bySubj[k]; P.subj[k] = (P.subj[k] || 0) + num(v && v.c); });
    const got = function (id) { if (P.badges.indexOf(id) < 0) { P.badges.push(id); out.newBadges.push(id); } };
    if (P.matches >= 5) got('played5'); if (P.matches >= 25) got('played25');
    if (P.wins >= 1) got('win1'); if (P.wins >= 10) got('win10');
    if (P.right >= 50) got('right50'); if (P.right >= 200) got('right200');
    if (P.bestStreak >= 5) got('streak5'); if (P.bestStreak >= 10) got('streak10');
    if (asked >= 5 && right === asked) got('perfect');
    if (shots >= 15 && hits / shots >= 0.6) got('sharp');
    if (kills >= 3 && deaths === 0) got('survivor');
    Object.keys(P.subj).forEach(function (k) { if (P.subj[k] >= 20) got('sj_' + k); });
    out.after = { xp: P.xp, lv: levelOf(P.xp) };
    KINDS.forEach(function (k) { CAT[k].forEach(function (it) { if (it.lvl > out.before.lv && it.lvl <= out.after.lv) out.newItems.push([k, it]); }); });
    PERKS.forEach(function (p) { if (p[0] > out.before.lv && p[0] <= out.after.lv) out.newPerks.push(p[1]); });
    P.updated = Date.now(); P.dirty = true; store(); changed(); sync();
    return out;
  }

  /* ---------- what the game uses ---------- */
  function perks() {
    const r = { startAmmo: 0, answerBonus: 0 };
    if (!P) return r;
    const L = levelOf(P.xp); PERKS.forEach(function (p) { if (L >= p[0]) { r.startAmmo += p[2]; r.answerBonus += p[3]; } });
    return r;
  }
  function item(kind, id) { const l = CAT[kind] || []; for (let i = 0; i < l.length; i++) if (l[i].id === id) return l[i]; return l[0]; }
  function equipped(kind) { return item(kind, P ? P.equip[kind] : CAT[kind][0].id); }
  function equip(kind, id) {
    if (!P || !CAT[kind]) return false;
    const it = item(kind, id); if (!it || it.id !== id || it.lvl > levelOf(P.xp)) return false;
    P.equip[kind] = id; P.updated = Date.now(); P.dirty = true; store(); changed(); sync(); return true;
  }
  /* a tiny code other players receive in a class match so they can see your helmet (nothing else is sent) */
  function skinCode() { return P ? P.equip.helmet + ':' + P.equip.tag : 'h0:n0'; }
  function tagById(id) { const it = item('tag', id); return it && it.id === id ? it : CAT.tag[0]; }
  function helmetById(id) { const it = item('helmet', id); return it && it.id === id ? it : CAT.helmet[0]; }

  ES.progress = {
    cat: CAT, kinds: KINDS, kindName: KIND_NAME, perkList: PERKS, badgeInfo: badgeInfo, badgeIds: Object.keys(BADGES),
    get: function () { return P; }, signedIn: function () { return !!P; }, info: info, xpFor: xpFor, levelOf: levelOf, maxLevel: MAX_LEVEL,
    signIn: signIn, signOut: signOut, award: award, perks: perks, equipped: equipped, equip: equip, skinCode: skinCode, helmetById: helmetById, tagById: tagById,
    sync: sync, onChange: function (f) { listeners.push(f); }, lastName: function () { try { const l = JSON.parse(localStorage.getItem(LAST) || 'null'); return l ? l.name : ''; } catch (e) { return ''; } }
  };
  restore();
})();
