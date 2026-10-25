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
        r.appendChild(n); r.appendChild(q); r.appendChild(mv); r.appendChild(kk); box.appendChild(r);
      });
    });
    $('r-count').textContent = list.length + (list.length === 1 ? ' student' : ' students') + ' in the room';
    $('r-lock').checked = ES.room.locked();
  }

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
  $('r-close').addEventListener('click', function () { if (confirm('Close the room? Everyone will be disconnected.')) { ES.room.close(); setOpenUi(false); } });
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
