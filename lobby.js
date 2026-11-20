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
    $('room-hint').textContent = S.phase === 'lobby' ? 'Pick your team. Your teacher will press START.' : '⚔️ A match is running. You will join the next one!';
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

  /* ---------- waiting-room song ----------
     Plays only while a student sits on the "Pick your team" screen. It fades in, loops, follows the Music on/off and volume settings,
     and fades out as soon as the match starts, the student leaves, or the room closes.
     It streams from one <audio> element (nothing big is kept in memory) and the file is only downloaded when a student reaches this screen.
     SAFETY CHECKS: every step is in try/catch; if the browser blocks sound or the file is missing, the screen simply stays quiet. */
  let song = null, songBad = false;                                                          // songBad: too many files failed, so stay quiet
  let order = [], pos = 0, failed = 0;                                                       // order = shuffled playlist, pos = which song now
  function songLevel() { const s = ES.settings || {}; return s.music === false ? 0 : Math.max(0, Math.min(1, (s.musicVol === undefined ? 0.6 : s.musicVol))) * 0.7; }
  /* The playlist: config lobbyList, or the single old "lobby" file if no list is given. */
  function tracks() {
    const m = ES.MUSIC_FILES || {};
    if (m.lobbyList && m.lobbyList.length) return m.lobbyList;
    return m.lobby ? [{ file: m.lobby, credit: '' }] : [];
  }
  function shuffle(n) {                                                                       // random order, and never the same song twice in a row
    const a = []; for (let i = 0; i < n; i++) a.push(i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
    if (n > 1 && order.length && a[0] === order[order.length - 1]) { const t = a[0]; a[0] = a[1]; a[1] = t; }
    return a;
  }
  function showCredit(t) { const c = $('room-credit'); if (c && t && t.credit) c.textContent = t.credit; }
  function startTrack() {                                                                     // opens the next song in the shuffled list
    const list = tracks(); if (!list.length) { songBad = true; return; }
    if (pos >= order.length) { order = shuffle(list.length); pos = 0; }
    const t = list[order[pos]]; showCredit(t);
    const el = song = new Audio(t.file); el.preload = 'auto'; el.volume = 0;
    el.addEventListener('ended', function () {                                                // song finished: free it and go to the next one
      if (song !== el) return;
      pos++; failed = 0; el.removeAttribute('src'); el.load(); song = null;
    });
    el.addEventListener('error', function () {                                                // a file is missing: skip it, give up only if all fail
      if (song !== el) return;
      failed++; pos++; song = null;
      if (failed >= list.length) songBad = true;
    });
  }
  function songSync() {
    try {
      const want = tracks().length > 0 && songLevel() > 0 && document.body.dataset.screen === 'room' && !$('room-wait').classList.contains('hidden') && !document.hidden;
      if (want && !song && !songBad) startTrack();
      if (!song) return;
      if (want) {
        if (song.paused) { const p = song.play(); if (p && p.catch) p.catch(function () { /* browser wants a click first: it will start after the next sync */ }); }
        song.volume = Math.min(songLevel(), song.volume + 0.04);                               // fade in (about 2 seconds)
        if (song.volume > songLevel()) song.volume = songLevel();
      } else {
        song.volume = Math.max(0, song.volume - 0.12);                                          // fade out (about 0.5 seconds), then stop and free it
        if (song.volume <= 0) { song.pause(); song.removeAttribute('src'); song.load(); song = null; }
      }
    } catch (e) { /* the song is optional */ }
  }

  function init() {
    setInterval(songSync, 100);
    $('room-join').addEventListener('click', join);
    $('room-code-in').addEventListener('input', function () { this.value = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); });
    $('room-code-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
    $('room-name-in').addEventListener('keydown', function (e) { if (e.key === 'Enter') join(); });
    $('room-pick0').addEventListener('click', function () { ES.session.setTeam(0); });
    $('room-pick1').addEventListener('click', function () { ES.session.setTeam(1); });
    setInterval(function () { if (ES.session.state.connected) render(); }, 2500);   // keeps the ping number fresh
  }

  function showWait() { step('wait'); say(''); render(); }
  ES.lobby = { init: init, show: show, showWait: showWait, leave: leave, onEnd: null, songInfo: function () { return song ? { playing: !song.paused, volume: +song.volume.toFixed(2), t: +song.currentTime.toFixed(1) } : null; } };
})();
