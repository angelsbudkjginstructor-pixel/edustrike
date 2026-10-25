/* EduStrike - the "Join class game" screen and the waiting room (student side).
   SAFETY CHECKS: the Join button is disabled while connecting (no double joins);
   every error is shown in plain words; leaving always cleans up the connection. */
(function () {
  'use strict';
  const ES = window.ES;
  const $ = function (id) { return document.getElementById(id); };
  let busy = false, sayTimer = 0;

  function step(name) {   // 'form' or 'wait'
    $('room-form').classList.toggle('hidden', name !== 'form');
    $('room-wait').classList.toggle('hidden', name !== 'wait');
  }
  function say(text, bad) { const m = $('room-msg'); m.textContent = text || ''; m.classList.toggle('hidden', !text); m.classList.toggle('bad', !!bad); }
  function pingDot(ms) { return ms <= 0 ? '⚪' : (ms < 120 ? '🟢' : (ms < 300 ? '🟡' : '🔴')); }

  function render() {
    const S = ES.session.state;
    $('room-code').textContent = S.code;
    $('room-me').textContent = S.me ? S.me.name : '';
    [0, 1].forEach(function (team) {
      const box = $('room-team' + team); box.innerHTML = '';
      const list = S.roster.filter(function (p) { return p.team === team; });
      const h = document.createElement('h3');
      h.textContent = ES.TEAMS[team].name + ' (' + list.length + ')'; h.style.background = ES.TEAMS[team].css;
      box.appendChild(h);
      list.forEach(function (p) {
        const r = document.createElement('div'); r.className = 'rrow' + (S.me && p.id === S.me.id ? ' me' : '');
        const n = document.createElement('span'); n.textContent = p.name;
        const q = document.createElement('span'); q.textContent = pingDot(p.rtt);
        r.appendChild(n); r.appendChild(q); box.appendChild(r);
      });
    });
    const my = S.me ? S.me.team : -1;
    [0, 1].forEach(function (t) {
      const b = $('room-pick' + t);
      b.classList.toggle('on', my === t);
      b.disabled = S.lock || S.phase !== 'lobby';
    });
    $('room-lock').classList.toggle('hidden', !S.lock);
    $('room-count').textContent = S.roster.length + (S.roster.length === 1 ? ' student' : ' students') + ' in the room';
    const ms = ES.session.rtt();
    $('room-ping').textContent = ms > 0 ? 'Connection: ' + pingDot(ms) + ' ' + ms + ' ms' : 'Connection: checking…';
  }

  function endText(reason) {
    return reason === 'kicked' ? 'Your teacher removed you from the room.' :
      reason === 'closed' ? 'Your teacher closed the room.' :
      reason === 'lost' ? 'The connection to your teacher was lost. Please join again.' : '';
  }

  function show() { step('form'); say(''); $('room-code-in').focus(); }
  function leave() { ES.session.leave(true); busy = false; $('room-join').disabled = false; }

  function join() {
    if (busy) return;
    const code = ES.net.cleanCode($('room-code-in').value);
    if (code.length < 5) { say('Please type the 5-letter room code from your teacher.', true); return; }
    const name = ($('room-name-in').value || '').trim() || 'Cadet';
    ES.settings.name = name.slice(0, 12); ES.saveSettings();
    busy = true; $('room-join').disabled = true; say('Connecting… ⏳');
    ES.session.join(code, name, {
      onJoined: function () { busy = false; $('room-join').disabled = false; say(''); step('wait'); },
      onState: render,
      onSay: function (t) { const b = $('room-say'); b.textContent = '📣 ' + t; b.classList.remove('hidden'); clearTimeout(sayTimer); sayTimer = setTimeout(function () { b.classList.add('hidden'); }, 10000); },
      onEnd: function (reason) { busy = false; $('room-join').disabled = false; step('form'); say(endText(reason), reason !== 'left'); if (ES.lobby.onEnd) ES.lobby.onEnd(reason); },
      onError: function (kind, text) { busy = false; $('room-join').disabled = false; step('form'); say(text, true); }
    });
  }

  function init() {
    $('room-join').addEventListener('click', join);
    $('room-code-in').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('room-code-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
    $('room-name-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
    $('room-pick0').addEventListener('click', function () { ES.session.setTeam(0); });
    $('room-pick1').addEventListener('click', function () { ES.session.setTeam(1); });
    setInterval(function () { if (ES.session.state.connected) render(); }, 2500);   // keeps the ping number fresh
  }

  ES.lobby = { init: init, show: show, leave: leave, onEnd: null };
})();
