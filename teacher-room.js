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
  function loadSettings() {
    try { const j = JSON.parse(localStorage.getItem(SETKEY) || '{}'); ['m-size', 'm-target', 'm-min', 'm-diff', 'm-gfx'].forEach(function (id) { if (j[id]) $(id).value = j[id]; }); } catch (e) { /* ignore */ }
  }
  function saveSettings() {
    try { const j = {}; ['m-size', 'm-target', 'm-min', 'm-diff', 'm-gfx'].forEach(function (id) { j[id] = $(id).value; }); localStorage.setItem(SETKEY, JSON.stringify(j)); } catch (e) { /* ignore */ }
  }
  function mmss(t) { t = Math.max(0, Math.ceil(t)); return Math.floor(t / 60) + ':' + ('0' + (t % 60)).slice(-2); }

  function renderLive(i) {
    if (!i) return;
    const names = { wait: 'waiting for students to click START…', count: 'starting…', play: 'LIVE', ended: 'finished' };
    $('l-state').textContent = names[i.phase] || '';
    $('l-time').textContent = '⏱ ' + mmss(i.timeLeft);
    $('l-score').textContent = '🔵 ' + i.score[0] + '  –  ' + i.score[1] + ' 🔴   (first to ' + i.target + ')';
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
    $('r-end').classList.toggle('hidden', over); $('r-back').classList.toggle('hidden', !over);
  }
  function showMatchUi(on) {
    $('r-setup').classList.toggle('hidden', on); $('r-live').classList.toggle('hidden', !on);
    $('r-tools1').classList.toggle('hidden', on);
    render();
  }
  ES.match.onUpdate(renderLive);

  $('r-start').addEventListener('click', function () {
    saveSettings();
    $('r-start-err').textContent = '';
    const r = ES.match.start({ teamSize: +$('m-size').value, target: +$('m-target').value, minutes: +$('m-min').value, diff: $('m-diff').value, gfx: $('m-gfx').value });
    if (!r.ok) { $('r-start-err').textContent = r.error; return; }
    showMatchUi(true); renderLive(ES.match.info());
  });
  $('r-end').addEventListener('click', function () { if (confirm('End the match now?')) ES.match.endNow(); });
  $('r-back').addEventListener('click', function () { ES.match.toLobby(); showMatchUi(false); });
  loadSettings();

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
