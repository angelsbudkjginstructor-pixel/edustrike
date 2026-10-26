/* EduStrike - questions from your Google Sheet.

   HOW IT WORKS
   - The teacher keeps the questions in a Google Sheet (one row = one question).
   - The sheet is "published to the web" as CSV. Its link is pasted ONCE in config.js (ES.QUESTION_SHEET.url).
   - When the game page opens it reads the sheet, checks every row, and replaces the built-in questions.
   - New subjects typed in the sheet (Sejarah, Social Studies ...) appear by themselves, with their own colour.
   - Each question can have a Subtopic (Fractions, Chapter 3 ...). The teacher ticks subtopics before a class match.

   SAFETY (nothing here can stop the game from starting)
   - Everything is inside try/catch and the network call has a time limit.
   - A bad row is skipped (and listed for the teacher), never crashes the game.
   - Duplicate questions are dropped.
   - If the sheet cannot be reached, the last good copy saved in the browser is used; if there is none, the built-in questions are used.
   - If the sheet has fewer than 4 good questions, it is ignored (the quiz needs at least 4). */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const CACHE_KEY = 'edustrike.qsheet.v1';
  const BUILTIN = (ES.QUESTIONS || []).slice();
  ES.QUESTIONS_BUILTIN = BUILTIN;

  /* ---------- the usual subjects: sheet words -> our short codes ---------- */
  const KNOWN = {
    'english': 'en', 'bahasa inggeris': 'en',
    'math': 'ma', 'maths': 'ma', 'mathematics': 'ma', 'matematik': 'ma',
    'science': 'sc', 'sains': 'sc',
    'geography': 'ge', 'geografi': 'ge',
    'bahasa melayu': 'bm', 'bahasa malaysia': 'bm', 'bm': 'bm', 'malay': 'bm'
  };
  const PALETTE = ['#14b8a6', '#ec4899', '#d4a017', '#6366f1', '#f97316', '#84cc16', '#06b6d4', '#a855f7', '#ef4444', '#0ea5e9'];
  const ICONS = [[/sejarah|history/, '📜'], [/social|sivik|civic|kajian/, '🧑‍🤝‍🧑'], [/comput|coding|ict|digital/, '💻'], [/art|seni|lukis/, '🎨'],
                 [/music|muzik/, '🎵'], [/p\.?e\.?|jasmani|sport|sukan|health|kesihatan/, '🏃'], [/moral|value|nilai|agama|religio|bible/, '🌟'],
                 [/life|skill|kemahiran|living/, '🛠️'], [/read|baca|phonic|spell|writing/, '📖'], [/world|dunia|culture/, '🌍']];
  let extraCount = 0;

  function slug(name) {
    const s = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    if (s) return 'x_' + s.slice(0, 24);
    let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0;
    return 'x_' + Math.abs(h).toString(36);
  }
  /* find (or create) the subject code for a name typed in the sheet */
  function subjectFor(raw) {
    const name = String(raw || '').trim();
    if (!name) return null;
    const low = name.toLowerCase();
    if (KNOWN[low]) return KNOWN[low];
    const code = slug(name);
    if (!ES.SUBJECTS[code]) {
      let icon = '📚'; ICONS.forEach(function (p) { if (icon === '📚' && p[0].test(low)) icon = p[1]; });
      ES.SUBJECTS[code] = { name: name.slice(0, 30), color: PALETTE[extraCount++ % PALETTE.length], icon: icon, extra: true };
    }
    return code;
  }

  /* ---------- a small, careful CSV reader (handles "quoted, text", doubled quotes and line breaks inside quotes) ---------- */
  function parseCSV(text) {
    const rows = []; let row = [], cur = '', q = false;
    text = String(text || '').replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (x) { return String(x).trim() !== ''; }); });
  }

  /* ---------- turn rows into questions ---------- */
  function norm(h) { return String(h || '').toLowerCase().replace(/[^a-z]+/g, ' ').trim(); }
  const HEAD = {
    subject: ['subject', 'mata pelajaran', 'subjek'], topic: ['subtopic', 'sub topic', 'topic', 'tajuk', 'topik'],
    grade: ['grade', 'gred', 'year', 'tahun', 'level grade'], diff: ['difficulty', 'diff', 'level', 'kesukaran'],
    q: ['question', 'soalan'], a: ['a', 'option a', 'choice a', 'pilihan a'], b: ['b', 'option b', 'choice b', 'pilihan b'],
    c: ['c', 'option c', 'choice c', 'pilihan c'], d: ['d', 'option d', 'choice d', 'pilihan d'],
    ans: ['correct', 'correct answer', 'answer', 'right answer', 'jawapan', 'jawapan betul'], exp: ['explanation', 'explain', 'penjelasan', 'hint']
  };
  function parseSheet(text) {
    const rows = parseCSV(text), out = { questions: [], skipped: [], found: 0 };
    let hi = -1, col = {};
    for (let r = 0; r < Math.min(rows.length, 6) && hi < 0; r++) {      // find the header row (first few rows)
      const m = {};
      rows[r].forEach(function (h, i) { const n = norm(h); Object.keys(HEAD).forEach(function (k) { if (m[k] === undefined && HEAD[k].indexOf(n) >= 0) m[k] = i; }); });
      if (m.q !== undefined && m.a !== undefined && m.b !== undefined) { hi = r; col = m; }
    }
    if (hi < 0) { out.error = 'I could not find the header row. The first row must have the titles: Subject, Subtopic, Grade, Difficulty, Question, A, B, C, D, Correct, Explanation.'; return out; }
    const seen = {};
    for (let r = hi + 1; r < rows.length; r++) {
      const row = rows[r], rowNo = r + 1;
      const get = function (k) { return col[k] === undefined ? '' : String(row[col[k]] === undefined ? '' : row[col[k]]).trim(); };
      const qtext = get('q'); if (!qtext) continue;                         // blank line: ignore silently
      out.found++;
      const fail = function (why) { out.skipped.push('Row ' + rowNo + ': ' + why); };
      const subj = subjectFor(get('subject') || 'General');
      const opts = [get('a'), get('b'), get('c'), get('d')];
      if (opts.some(function (o) { return !o; })) { fail('needs 4 answer choices (A, B, C, D)'); continue; }
      if (new Set(opts).size < 4) { fail('two answer choices are exactly the same'); continue; }       // capital letters count ("i like" and "I like" are different)
      // correct answer: a letter A-D, a number 1-4, or the exact text of the right choice
      const raw = get('ans'), low = raw.toLowerCase().replace(/[^a-z0-9]/g, '');
      let ai = ['a', 'b', 'c', 'd'].indexOf(low);
      if (ai < 0 && /^[1-4]$/.test(low)) ai = Number(low) - 1;
      if (ai < 0) ai = opts.map(function (o) { return o.toLowerCase(); }).indexOf(raw.toLowerCase());
      if (ai < 0) { fail('the Correct column must be A, B, C or D'); continue; }
      let g = 0; const gm = get('grade').match(/\d+/);                      // blank grade = suitable for every grade
      if (gm) { g = Number(gm[0]); if (g < 1 || g > 12) { fail('grade must be 1 to 12'); continue; } }
      let d = 2; const dl = get('diff').toLowerCase();
      if (/^[123]$/.test(dl)) d = Number(dl); else if (/easy|mudah/.test(dl)) d = 1; else if (/hard|difficult|sukar/.test(dl)) d = 3;
      const key = subj + '|' + qtext.toLowerCase();
      if (seen[key]) { fail('duplicate of row ' + seen[key] + ' (skipped)'); continue; }
      seen[key] = rowNo;
      out.questions.push({ s: subj, g: g, d: d, t: (get('topic') || 'General').slice(0, 40), q: qtext.slice(0, 400), o: opts.map(function (o) { return o.slice(0, 120); }), a: ai, e: get('exp').slice(0, 400) });
    }
    return out;
  }

  /* ---------- status that the pages can show ---------- */
  const listeners = [];
  const status = { state: 'builtin', count: BUILTIN.length, skipped: [], message: '' };
  function setStatus(state, count, skipped, message) {
    status.state = state; status.count = count; status.skipped = skipped || []; status.message = message;
    listeners.slice().forEach(function (fn) { try { fn(status); } catch (e) { /* a listener must never break loading */ } });
  }
  function describe() { return status; }

  /* the link the teacher pasted: accept the "published CSV" link, a "pubhtml" link, or the normal sheet link */
  function normUrl(u) {
    u = String(u || '').trim(); if (!u) return '';
    if (/\/pubhtml/.test(u)) return u.replace('/pubhtml', '/pub').replace(/\?.*$/, '') + '?output=csv';
    if (/output=csv/.test(u) || /tqx=out:csv/.test(u)) return u;
    const m = u.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m && !/\/d\/e\//.test(u)) return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/gviz/tq?tqx=out:csv&sheet=Questions';
    return u;
  }

  function useQuestions(list) {
    ES.QUESTIONS = list;
    if (ES.settings && ES.settings.subjects) { /* new subjects count as "on" until the player switches them off */ }
  }
  function tryApply(text, label) {
    const res = parseSheet(text);
    if (res.error) return { ok: false, why: res.error };
    if (res.questions.length < 4) return { ok: false, why: 'only ' + res.questions.length + ' good question(s) found, at least 4 are needed' + (res.skipped[0] ? ' - ' + res.skipped[0] : '') };
    useQuestions(res.questions);
    return { ok: true, res: res };
  }

  /* read the sheet (returns a promise that always finishes; it never throws) */
  ES.sheet = {
    status: status, describe: describe, parse: parseSheet,
    onChange: function (fn) { listeners.push(fn); },
    /* the topics of the questions that are loaded now: [{ code, name, color, icon, topics: [{ key, label, count }] }] */
    topics: function () {
      const bySubj = {}, order = [];
      ES.QUESTIONS.forEach(function (q) {
        if (!bySubj[q.s]) { bySubj[q.s] = {}; order.push(q.s); }
        const t = q.t || 'General'; bySubj[q.s][t] = (bySubj[q.s][t] || 0) + 1;
      });
      return order.map(function (code) {
        const sub = ES.SUBJECTS[code] || { name: code, color: '#667', icon: '📚' };
        return { code: code, name: sub.name, color: sub.color, icon: sub.icon,
                 topics: Object.keys(bySubj[code]).sort().map(function (t) { return { key: code + '|' + t, label: t, count: bySubj[code][t] }; }) };
      });
    },
    load: function () {
      const conf = ES.QUESTION_SHEET || {}, url = normUrl(conf.url);
      if (!url) { setStatus('builtin', BUILTIN.length, [], 'Using the ' + BUILTIN.length + ' built-in questions (no Google Sheet is linked yet).'); return Promise.resolve(status); }
      setStatus('loading', ES.QUESTIONS.length, [], 'Reading your Google Sheet…');
      const fail = function (why) {
        // 1) last good copy saved in this browser, 2) built-in questions
        try {
          const saved = window.localStorage && window.localStorage.getItem(CACHE_KEY);
          if (saved) {
            const r = tryApply(saved, 'saved copy');
            if (r.ok) { setStatus('cached', r.res.questions.length, r.res.skipped, '⚠️ Could not reach the sheet (' + why + '). Using the last saved copy: ' + r.res.questions.length + ' questions.'); return status; }
          }
        } catch (e) { /* no saved copy */ }
        useQuestions(BUILTIN.slice());
        setStatus('failed', BUILTIN.length, [], '⚠️ Could not use the sheet (' + why + '). Using the ' + BUILTIN.length + ' built-in questions.');
        return status;
      };
      return new Promise(function (resolve) {
        let done = false;
        const finish = function (v) { if (!done) { done = true; resolve(v); } };
        const timer = setTimeout(function () { finish(fail('it took too long')); }, conf.timeoutMs || 9000);
        try {
          const sep = url.indexOf('?') >= 0 ? '&' : '?';
          fetch(url + sep + '_=' + Date.now(), { cache: 'no-store' })
            .then(function (r) { if (!r.ok) throw new Error('error ' + r.status); return r.text(); })
            .then(function (text) {
              clearTimeout(timer);
              if (/^\s*<(!doctype|html)/i.test(text)) { finish(fail('the sheet is not published - use File > Share > Publish to web')); return; }
              const r = tryApply(text, 'sheet');
              if (!r.ok) { finish(fail(r.why)); return; }
              try { window.localStorage.setItem(CACHE_KEY, text); } catch (e) { /* storage full or blocked: fine */ }
              const sk = r.res.skipped.length;
              setStatus('ok', r.res.questions.length, r.res.skipped, '📄 Google Sheet: ' + r.res.questions.length + ' questions loaded' + (sk ? ' (' + sk + ' row' + (sk > 1 ? 's' : '') + ' skipped - see below)' : '') + '.');
              finish(status);
            })
            .catch(function (err) { clearTimeout(timer); finish(fail(err && err.message ? err.message : 'no connection')); });
        } catch (e) { clearTimeout(timer); finish(fail('your browser could not read it')); }
      });
    }
  };

  // read the cached copy straight away (so the question bank is ready before the network answers), then refresh from the sheet
  try {
    if ((ES.QUESTION_SHEET || {}).url && window.localStorage) {
      const saved = window.localStorage.getItem(CACHE_KEY);
      if (saved) tryApply(saved, 'saved copy');
    }
  } catch (e) { /* ignore */ }
  ES.sheet.load();
})();
