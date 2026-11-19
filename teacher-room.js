/* EduStrike - teacher page: the "Class room" card (open room, see students, move them between teams, send a message).
   SAFETY CHECKS: closing the browser tab warns you if a room is open; the page never crashes if the connection library is missing. */
(function () {
  'use strict';
  const ES = window.ES;
  const $ = function (id) { return document.getElementById(id); };
  if (!$('room-card')) return;

  function dot(ms) { return ms <= 0 ? '⚪' : (ms < 120 ? '🟢' : (ms < 300 ? '🟡' : '🔴')); }

  function joinLink() {
    // same folder as this page, but index.html?room=CODE
    const base = location.href.split('#')[0].split('?')[0].replace(/teacher\.html$/, '');
    return base + 'index.html?room=' + ES.room.code();
  }

  function render() {
    const list = ES.room.list();
    [0, 1].forEach(function (team) {
      const box = $('r-team' + team); box.innerHTML = '';
      const mine = list.filter(function (p) { return p.team === team; });
      const h = document.createElement('h3');
      h.textContent = ES.TEAMS[team].name + ' (' + mine.length + ')'; h.style.background = ES.TEAMS[team].css;
      box.appendChild(h);
      mine.forEach(function (p) {
        const r = document.createElement('div'); r.className = 'r-row';
        const n = document.createElement('span'); n.className = 'nm'; n.textContent = p.name;
        const q = document.createElement('span'); q.textContent = dot(p.rtt) + (p.rtt ? ' ' + p.rtt : '');
        q.title = 'connection speed (ms)';
        const mv = document.createElement('button'); mv.type = 'button'; mv.className = 'mini'; mv.textContent = team === 0 ? '→ Red' : '→ Blue';
        mv.addEventListener('click', function () { ES.room.setTeam(p.id, 1 - team); });
        const kk = document.createElement('button'); kk.type = 'button'; kk.className = 'mini'; kk.textContent = '✖'; kk.title = 'Remove from room';
        kk.addEventListener('click', function () { ES.room.kick(p.id); });
        r.appendChild(n); r.appendChild(q); if (!ES.match.running()) r.appendChild(mv); r.appendChild(kk); box.appendChild(r);
      });
    });
    $('r-count').textContent = list.length + (list.length === 1 ? ' student' : ' students') + ' in the room';
    $('r-lock').checked = ES.room.locked();
  }

  /* ---------- match controls ---------- */
  const SETKEY = 'edustrike.teacher.match.v1';
  let off = {};             // subtopics the teacher UNticked: { 'ma|Fractions': true }. Everything else is ON, so new subtopics from the sheet are ON by default.
  function loadSettings() {
    try {
      const j = JSON.parse(localStorage.getItem(SETKEY) || '{}');
      ['m-size', 'm-target', 'm-min', 'm-diff', 'm-gfx', 'm-map', 'm-names', 'm-mode', 'm-rounds', 'm-rmin', 'm-revive', 'm-qm', 'm-boss'].forEach(function (id) { if (j[id]) $(id).value = j[id]; });
      if (Array.isArray(j.off)) { off = {}; j.off.forEach(function (k) { off[String(k)] = true; }); }
    } catch (e) { /* ignore */ }
  }
  function saveSettings() {
    try {
      const j = {}; ['m-size', 'm-target', 'm-min', 'm-diff', 'm-gfx', 'm-map', 'm-names', 'm-mode', 'm-rounds', 'm-rmin', 'm-revive', 'm-qm', 'm-boss'].forEach(function (id) { j[id] = $(id).value; });
      j.off = Object.keys(off);
      localStorage.setItem(SETKEY, JSON.stringify(j));
    } catch (e) { /* ignore */ }
  }

  /* ---------- questions: where they come from + which subtopics this match uses ---------- */
  function allTopicKeys() { const out = []; ES.sheet.topics().forEach(function (s) { s.topics.forEach(function (t) { out.push(t.key); }); }); return out; }
  /* the ticked subtopics that still exist in the loaded questions (empty = no filter = everything) */
  function chosenTopics() {
    const all = allTopicKeys(), keep = all.filter(function (k) { return !off[k]; });
    return keep.length === all.length ? [] : keep;
  }
  function renderQuestions() {
    const st = ES.sheet.status;
    $('q-status').textContent = st.message || '';
    $('q-skip').innerHTML = '';
    st.skipped.slice(0, 8).forEach(function (t) { const d = document.createElement('div'); d.textContent = '⚠ ' + t; $('q-skip').appendChild(d); });
    if (st.skipped.length > 8) { const d = document.createElement('div'); d.textContent = '… and ' + (st.skipped.length - 8) + ' more rows skipped.'; $('q-skip').appendChild(d); }
    const groups = ES.sheet.topics(), panel = $('q-panel'), keys = allTopicKeys();
    if (keys.length && keys.every(function (k) { return off[k]; })) off = {};      // never leave zero subtopics
    panel.innerHTML = '';
    groups.forEach(function (g) {
      const h = document.createElement('div'); h.className = 'q-subj'; h.style.color = g.color; h.textContent = g.icon + ' ' + g.name;
      const all = document.createElement('small'); all.textContent = 'all'; const none = document.createElement('small'); none.textContent = 'none';
      const setSubj = function (on) {
        g.topics.forEach(function (t) { if (on) delete off[t.key]; else off[t.key] = true; });
        saveSettings(); renderQuestions();
      };
      all.addEventListener('click', function () { setSubj(true); }); none.addEventListener('click', function () { setSubj(false); });
      h.appendChild(all); h.appendChild(none); panel.appendChild(h);
      const row = document.createElement('div'); row.className = 'q-topics';
      g.topics.forEach(function (t) {
        const lab = document.createElement('label'); lab.className = 'q-topic'; lab.style.setProperty('--c', g.color);
        const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !off[t.key];
        cb.addEventListener('change', function () {
          if (cb.checked) delete off[t.key]; else off[t.key] = true;
          saveSettings(); renderQuestions();
        });
        lab.appendChild(cb); lab.appendChild(document.createTextNode(t.label + ' (' + t.count + ')')); row.appendChild(lab);
      });
      panel.appendChild(row);
    });
    const ch = chosenTopics();
    if (!ch.length) $('q-picked').textContent = 'All subtopics (' + ES.QUESTIONS.length + ' questions)';
    else {
      let n = 0; ES.sheet.topics().forEach(function (g) { g.topics.forEach(function (t) { if (ch.indexOf(t.key) >= 0) n += t.count; }); });
      $('q-picked').textContent = ch.length + ' subtopic' + (ch.length > 1 ? 's' : '') + ' chosen (' + n + ' questions)';
    }
  }
  $('q-toggle').addEventListener('click', function () {
    const open = $('q-panel').classList.toggle('hidden');
    $('q-toggle').textContent = open ? 'Choose subtopics ▾' : 'Hide subtopics ▴';
  });
  $('q-reload').addEventListener('click', function () { $('q-status').textContent = 'Reading your Google Sheet…'; ES.sheet.load(); });
  ES.sheet.onChange(renderQuestions);
  function mmss(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

  function renderLive(i) {
    if (!i) return;
    const names = { wait: 'waiting for students to click START…', count: 'starting…', play: 'LIVE', ended: 'finished' };
    $('l-state').textContent = names[i.phase] || '';
    $('l-time').textContent = '⏱ ' + mmss(i.timeLeft);
    const bi = i.boss;
    $('l-score').textContent = bi ? '🤖 Robot: health bar ' + Math.min(3, bi.bar + 1) + ' of 3  ·  ' + (bi.weak > 0 ? '💥 STUNNED (' + Math.ceil(bi.weak) + ' s)' : '🛡️ shield ' + bi.armor + ' / ' + bi.armorMax) + (bi.ph === 1 ? '  ·  DEFEATED!' : '')
                                : i.rb ? '🔵 ' + i.score[0] + '  –  ' + i.score[1] + ' 🔴   (round ' + i.rb.round + ' · first to ' + i.rb.need + ' rounds' + (i.rb.bomb === 1 && i.rb.rph === 0 ? ' · 💣 ' + Math.ceil(i.rb.bombT) + 's' : '') + ')'
                                : i.ctf ? '🔵 ' + i.score[0] + '  –  ' + i.score[1] + ' 🔴   (🚩 captures · most captures wins' + (i.ctf.f[0] || i.ctf.f[1] ? ' · a flag is on the move' : '') + ')'
                                : '🔵 ' + i.score[0] + '  –  ' + i.score[1] + ' 🔴   (first to ' + i.target + ')';
    $('l-ready').textContent = i.phase === 'wait' ? i.ready + ' / ' + i.humans + ' ready' : i.humans + ' students playing';
    [0, 1].forEach(function (team) {
      const box = $('l-team' + team); box.innerHTML = '';
      const h = document.createElement('h3'); h.textContent = ES.TEAMS[team].name + ' – ' + i.score[team]; h.style.background = ES.TEAMS[team].css; box.appendChild(h);
      i.rows.filter(function (r) { return r.team === team; }).sort(function (a, b) { return (a.bot - b.bot) || (b.kills - a.kills); }).forEach(function (r) {
        const row = document.createElement('div'); row.className = 'r-row';
        const n = document.createElement('span'); n.className = 'nm'; n.textContent = (r.bot ? '🤖 ' : '') + r.name + (r.alive ? '' : ' 💤');
        const k = document.createElement('span'); k.textContent = r.kills + ' / ' + r.deaths; k.title = 'tags / times tagged';
        row.appendChild(n); row.appendChild(k); box.appendChild(row);
      });
    });
    const over = i.phase === 'ended';
    if (over) { const sm = ES.match.summary(); if (sm && ES.season.add(sm)) refreshSeason(); }      // the finished match is added to the season (once)
    $('r-end').classList.toggle('hidden', over); $('r-back').classList.toggle('hidden', !over);
  }

  /* ---------- class season + class board (see season.js) ---------- */
  function refreshSeason() {
    const d = ES.season.get(), top = ES.season.ranking()[0];
    $('ts-name').textContent = d.name;
    $('ts-info').textContent = d.matches + (d.matches === 1 ? ' match' : ' matches') + (top ? '  ·  🥇 ' + top.name + ' (' + top.pts + ' pts)' : '  ·  no matches yet');
  }
  let boardTab = 'match', boardTimer = 0;
  function cell(t, cls) { const sp = document.createElement('span'); if (cls) sp.className = cls; sp.textContent = t; return sp; }
  function boardRow(cols, cls) { const r = document.createElement('div'); r.className = 'bd-row' + (cls ? ' ' + cls : ''); cols.forEach(function (c) { r.appendChild(cell(c)); }); return r; }
  function renderBoard() {
    const body = $('bd-body'), aw = $('bd-awards'), ban = $('bd-banner');
    body.innerHTML = ''; aw.innerHTML = ''; ban.textContent = '';
    $('bd-t-match').classList.toggle('sel', boardTab === 'match'); $('bd-t-season').classList.toggle('sel', boardTab === 'season');
    const medal = function (i) { return ['🥇', '🥈', '🥉'][i] || String(i + 1); };
    if (boardTab === 'season') {
      const d = ES.season.get(), list = ES.season.ranking();
      $('bd-title').textContent = '🏆 ' + d.name;
      ban.textContent = d.matches + (d.matches === 1 ? ' match played' : ' matches played');
      if (!list.length) { const e = document.createElement('div'); e.className = 'bd-empty'; e.textContent = 'No matches yet. Play a class match and the points add up here!'; body.appendChild(e); return; }
      body.appendChild(boardRow(['', 'Name', '⭐ Points', '🏆 Wins', '🎮 Played', '🧠 Right'], 'head'));
      list.slice(0, 30).forEach(function (p, i) { body.appendChild(boardRow([medal(i), p.name, p.pts, p.wins, p.played, p.right], i < 3 ? 'g' + (i + 1) : '')); });
      return;
    }
    $('bd-title').textContent = '📺 Class Board';
    const sm = ES.match.summary(), info = ES.match.info();
    let rows = [];
    if (sm) {
      rows = sm.rows.slice();
      ban.textContent = sm.mode === 'boss' ? (sm.win === 0 ? '🤖 The class beat the giant robot! 🎉' : 'The robot survived – try again! 💪')
                      : sm.win < 0 ? "🤝 It's a draw! " + sm.score[0] + ' – ' + sm.score[1]
                      : (sm.win === 0 ? '🔵 Blue team wins!  ' : '🔴 Red team wins!  ') + (sm.mode === 'rb' ? 'Rounds ' : '') + sm.score[0] + ' – ' + sm.score[1];
      (sm.awards || []).forEach(function (a) { const c = document.createElement('div'); c.className = 'bd-aw'; c.textContent = a[0] + ' ' + a[1]; const sml = document.createElement('small'); sml.textContent = a[2]; c.appendChild(sml); aw.appendChild(c); });
    } else if (info) {
      rows = info.rows.filter(function (r) { return !r.bot; }).map(function (r) { return { name: r.name, team: r.team, kills: r.kills, revives: r.rv || 0, q: r.q || 0, pts: r.pts || 0 }; });
      ban.textContent = '⚔️ Match in progress…';
    }
    if (!rows.length) { const e = document.createElement('div'); e.className = 'bd-empty'; e.textContent = 'No match yet. Start a match and the results appear here.'; body.appendChild(e); return; }
    rows.sort(function (a, b) { return (b.pts - a.pts) || (b.q - a.q); });
    body.appendChild(boardRow(['', 'Name', '🎯 Tags', '🧠 Right', '💚 Revives', '⭐ Points'], 'head'));
    rows.forEach(function (r, i) { body.appendChild(boardRow([medal(i), r.name, r.kills, r.q, r.revives, r.pts], 't' + r.team)); });
  }
  function openBoard(tab) {
    boardTab = tab; $('board').classList.remove('hidden'); renderBoard();
    clearInterval(boardTimer); boardTimer = setInterval(renderBoard, 1500);
  }
  function closeBoard() { $('board').classList.add('hidden'); clearInterval(boardTimer); boardTimer = 0; }
  $('ts-board').addEventListener('click', function () { openBoard('season'); });
  $('r-board').addEventListener('click', function () { openBoard('match'); });
  $('bd-t-match').addEventListener('click', function () { boardTab = 'match'; renderBoard(); });
  $('bd-t-season').addEventListener('click', function () { boardTab = 'season'; renderBoard(); });
  $('bd-close').addEventListener('click', closeBoard);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('board').classList.contains('hidden')) closeBoard(); });
  $('ts-rename').addEventListener('click', function () { const n = prompt('Name of this season (for example: Week 3)', ES.season.get().name); if (n) { ES.season.rename(n); refreshSeason(); } });
  $('ts-new').addEventListener('click', function () {
    if (!confirm('Start a NEW season?\n\nThe points of the current season will be erased. (Press "Copy table" first if you want to keep them.)')) return;
    const n = prompt('Name of the new season', 'Season ' + (ES.season.get().matches ? 'next' : '1')); ES.season.reset(n || 'New season'); refreshSeason();
  });
  $('ts-csv').addEventListener('click', function () {
    const text = ES.season.csv();
    const done = function () { $('ts-info').textContent = '✅ Copied! Paste it into Google Sheets or Excel.'; setTimeout(refreshSeason, 3000); };
    try { navigator.clipboard.writeText(text).then(done, function () { window.prompt('Copy this table (Ctrl+C):', text); }); } catch (e) { window.prompt('Copy this table (Ctrl+C):', text); }
  });
  refreshSeason();
  function showMatchUi(on) {
    $('r-setup').classList.toggle('hidden', on); $('r-live').classList.toggle('hidden', !on);
    $('r-tools1').classList.toggle('hidden', on);
    render();
  }
  ES.match.onUpdate(renderLive);

  $('r-start').addEventListener('click', function () {
    saveSettings();
    $('r-start-err').textContent = '';
    const r = ES.match.start({ teamSize: +$('m-size').value, target: +$('m-target').value, minutes: +$('m-min').value, diff: $('m-diff').value, gfx: $('m-gfx').value, map: $('m-map').value, names: $('m-names').value, topics: chosenTopics(),
                               mode: ['rb', 'ctf', 'boss'].indexOf($('m-mode').value) >= 0 ? $('m-mode').value : 'normal', boss: $('m-boss').value, rounds: +$('m-rounds').value, rtime: +$('m-rmin').value, revive: $('m-revive').value !== 'off', qm: $('m-qm').value !== 'off' });
    if (!r.ok) { $('r-start-err').textContent = r.error; return; }
    showMatchUi(true); renderLive(ES.match.info());
  });
  $('r-end').addEventListener('click', function () { if (confirm('End the match now?')) ES.match.endNow(); });
  $('r-back').addEventListener('click', function () { ES.match.toLobby(); showMatchUi(false); });
  // fill the map list (from world.js), then restore the teacher's last choices
  $('m-map').innerHTML = ES.MAPS_LIST.map(function (m) { return '<option value="' + m.id + '">' + m.name + ' - ' + m.desc + '</option>'; }).join('');
  /* Rescue & Bomb: show its options (rounds, time per round) and hide "win by tagging / time limit" */
  function modeUi() {
    const mode = $('m-mode').value, rb = mode === 'rb', ctf = mode === 'ctf', boss = mode === 'boss';
    Array.prototype.forEach.call(document.querySelectorAll('.rb-only'), function (el) { el.classList.toggle('hidden', !rb); });
    Array.prototype.forEach.call(document.querySelectorAll('.nm-only'), function (el) { el.classList.toggle('hidden', rb); });
    Array.prototype.forEach.call(document.querySelectorAll('.tg-only'), function (el) { el.classList.toggle('hidden', rb || ctf || boss); });     // Capture the Flag: only the time limit is used (the winner is the team with most captures)
    Array.prototype.forEach.call(document.querySelectorAll('.ctf-only'), function (el) { el.classList.toggle('hidden', !ctf); });
    Array.prototype.forEach.call(document.querySelectorAll('.boss-only'), function (el) { el.classList.toggle('hidden', !boss); });
  }
  $('m-mode').addEventListener('change', function () { modeUi(); saveSettings(); });
  loadSettings(); modeUi(); renderQuestions();

  function setOpenUi(on) { $('r-closed').classList.toggle('hidden', on); $('r-opened').classList.toggle('hidden', !on); }

  $('r-open').addEventListener('click', function () {
    $('r-err').textContent = ''; $('r-open').disabled = true; $('r-open').textContent = 'Opening…';
    ES.room.open({
      onOpen: function (code) {
        $('r-open').disabled = false; $('r-open').textContent = '🚪 OPEN CLASS ROOM';
        $('r-code').textContent = code; $('r-link').value = joinLink(); setOpenUi(true); render();
      },
      onChange: render,
      onError: function (text) {
        $('r-open').disabled = false; $('r-open').textContent = '🚪 OPEN CLASS ROOM';
        $('r-err').textContent = text; if (!ES.room.isOpen()) setOpenUi(false);
      }
    });
  });
  $('r-close').addEventListener('click', function () { if (confirm('Close the room? Everyone will be disconnected.')) { ES.match.stop(); ES.room.close(); setOpenUi(false); showMatchUi(false); } });
  $('r-copy').addEventListener('click', function () {
    const t = $('r-link').value;
    const done = function () { $('r-copy').textContent = '✅ Copied'; setTimeout(function () { $('r-copy').textContent = '📋 Copy link'; }, 1500); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(done, function () { $('r-link').select(); });
    else { $('r-link').select(); try { document.execCommand('copy'); done(); } catch (e) { /* user can copy by hand */ } }
  });
  $('r-mix').addEventListener('click', function () { ES.room.mix(); });
  $('r-lock').addEventListener('change', function () { ES.room.setLock($('r-lock').checked); });
  $('r-send').addEventListener('click', function () { const t = $('r-say').value.trim(); if (t) { ES.room.say(t); $('r-say').value = ''; } });
  $('r-say').addEventListener('keydown', function (e) { if (e.key === 'Enter') $('r-send').click(); });
  window.addEventListener('beforeunload', function (e) { if (ES.room.isOpen() && ES.room.players().length) { e.preventDefault(); e.returnValue = ''; } });
})();
