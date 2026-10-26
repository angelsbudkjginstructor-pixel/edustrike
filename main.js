/* EduStrike - menu wiring: connects the settings form to ES.settings and starts / stops the game.
   SAFETY: the Play button is disabled while a game is starting (no double-click double-start),
   and start-up errors are shown in plain words instead of a blank screen. */
(function () {
  'use strict';
  const ES = window.ES;
  const $ = function (id) { return document.getElementById(id); };
  const S = function () { return ES.settings; };

  function showScreen(name) {
    $('screen-menu').classList.toggle('hidden', name !== 'menu');
    $('screen-game').classList.toggle('hidden', name !== 'game');
    $('screen-gate').classList.toggle('hidden', name !== 'gate');
    $('screen-room').classList.toggle('hidden', name !== 'room');
    document.body.dataset.screen = name;
  }

  /* push the saved sound settings into the audio engine */
  function applyAudio() {
    const s = S();
    ES.audio.setEnabled(s.sound); ES.audio.setMusicEnabled(s.music);
    ES.audio.setMusicVolume(s.musicVol); ES.audio.setSfxVolume(s.sfxVol);
    ES.audio.setScream(s.scream !== false); ES.audio.setTrackMusic(s.trackMusic !== false); ES.audio.setAnnouncer(s.announcer !== false);
  }

  /* ---------- fill the form from saved settings ---------- */
  function fillForm() {
    const s = S();
    $('set-name').value = s.name;
    $('set-bots').value = s.botsPerTeam; $('set-kills').value = s.targetKills; $('set-minutes').value = s.minutes;
    Array.prototype.forEach.call($('set-diff').children, function (b) { b.classList.toggle('on', b.dataset.v === s.diff); });
    $('set-gmin').value = s.gradeMin; $('set-gmax').value = s.gradeMax;
    $('set-qtime').value = s.qTime; $('set-reward').value = s.reward; $('set-wrong').value = s.wrongAmmo; $('set-ansmode').value = s.answerMode;
    $('set-gfx').value = s.gfx; $('set-fps').checked = s.showFps; $('set-aim').checked = s.aimAssist; $('set-radar').checked = s.radar;
    $('set-sound').checked = s.sound; $('set-sens').value = s.sens; $('set-fov').value = s.fov; $('set-look').value = s.lookMode;
    Array.prototype.forEach.call($('set-subjects').children, function (c) { c.classList.toggle('on', !!s.subjects[c.dataset.k]); });
    $('set-scream').checked = s.scream !== false; $('set-track').checked = s.trackMusic !== false; $('set-announcer').checked = s.announcer !== false;
    $('set-map').value = ES.MAPS_LIST.some(function (m) { return m.id === s.map; }) ? s.map : 'park';
    $('set-music').checked = s.music; $('set-musicvol').value = s.musicVol; $('set-sfxvol').value = s.sfxVol;
    applyAudio();
    updatePool();
  }

  function updatePool() {
    const n = ES.quizPool(S()).length, total = ES.QUESTIONS.length;
    const el = $('pool-info');
    if (n >= 4) el.textContent = '✅ ' + n + ' questions match your choices (out of ' + total + ' in the bank).';
    else el.textContent = '⚠️ Only ' + n + ' question(s) match – the game will use all ' + total + ' questions instead. Pick more subjects or grades.';
  }

  /* ---------- build the static bits ---------- */
  function build() {
    $('ver').textContent = ES.VERSION;
    const chips = $('set-subjects');
    Object.keys(ES.SUBJECTS).forEach(function (k) {
      const sub = ES.SUBJECTS[k], b = document.createElement('button');
      b.type = 'button'; b.className = 'chip'; b.dataset.k = k;
      b.style.setProperty('--c', sub.color);
      b.textContent = sub.icon + ' ' + sub.name;
      b.addEventListener('click', function () {
        S().subjects[k] = !S().subjects[k];
        // never allow zero subjects
        if (!Object.keys(S().subjects).some(function (x) { return S().subjects[x]; })) S().subjects[k] = true;
        save(); fillForm();
      });
      chips.appendChild(b);
    });
    for (let g = 1; g <= 7; g++) {
      ['set-gmin', 'set-gmax'].forEach(function (id) {
        const o = document.createElement('option'); o.value = g; o.textContent = 'Grade ' + g; $(id).appendChild(o);
      });
    }
  }

  function save() { ES.saveSettings(); }

  function bindForm() {
    const s = S();
    const num = function (id, key) { $(id).addEventListener('change', function () { s[key] = Number($(id).value); save(); updatePool(); }); };
    $('set-name').addEventListener('input', function () { s.name = $('set-name').value.replace(/[<>]/g, '').trim().slice(0, 12) || 'Cadet'; save(); });
    num('set-bots', 'botsPerTeam'); num('set-kills', 'targetKills'); num('set-minutes', 'minutes');
    num('set-gmin', 'gradeMin'); num('set-gmax', 'gradeMax');
    num('set-qtime', 'qTime'); num('set-reward', 'reward'); num('set-wrong', 'wrongAmmo');
    $('set-ansmode').addEventListener('change', function () { s.answerMode = $('set-ansmode').value; save(); });
    $('set-gfx').addEventListener('change', function () { s.gfx = $('set-gfx').value; save(); });
    $('set-look').addEventListener('change', function () { s.lookMode = $('set-look').value; save(); });
    $('set-fps').addEventListener('change', function () { s.showFps = $('set-fps').checked; save(); });
    $('set-aim').addEventListener('change', function () { s.aimAssist = $('set-aim').checked; save(); });
    $('set-radar').addEventListener('change', function () { s.radar = $('set-radar').checked; save(); });
    $('set-sound').addEventListener('change', function () { s.sound = $('set-sound').checked; ES.audio.setEnabled(s.sound); save(); });
    $('set-announcer').addEventListener('change', function () { s.announcer = $('set-announcer').checked; applyAudio(); save(); if (s.announcer) ES.audio.announce('k2'); });
    $('set-track').addEventListener('change', function () { s.trackMusic = $('set-track').checked; applyAudio(); save(); });
    $('set-scream').addEventListener('change', function () { s.scream = $('set-scream').checked; applyAudio(); save(); if (s.scream) ES.audio.sfx('scream', 0.8); });
    $('set-map').addEventListener('change', function () { s.map = $('set-map').value; save(); });
    $('set-music').addEventListener('change', function () { s.music = $('set-music').checked; applyAudio(); save(); });
    $('set-musicvol').addEventListener('input', function () { s.musicVol = Number($('set-musicvol').value); applyAudio(); save(); });
    $('set-sfxvol').addEventListener('input', function () { s.sfxVol = Number($('set-sfxvol').value); applyAudio(); save(); });
    // "Test sounds": a laser, a power-up and a short blast of the music (ends by itself)
    let testTimer = 0;
    $('btn-testsound').addEventListener('click', function () {
      ES.audio.unlock(); applyAudio();
      ES.audio.sfx('shoot'); setTimeout(function () { ES.audio.sfx('hit'); }, 250);
      setTimeout(function () { ES.audio.sfx('correct'); }, 600);
      if (s.music) {
        ES.audio.music.start('play'); ES.audio.music.setIntensity(0.8);
        clearTimeout(testTimer); testTimer = setTimeout(function () { if (!(ES.game && ES.game.active)) ES.audio.music.stop(0.4); }, 6000);
      }
    });
    $('set-sens').addEventListener('input', function () { s.sens = Number($('set-sens').value); save(); });
    $('set-fov').addEventListener('input', function () { s.fov = Number($('set-fov').value); save(); });
    Array.prototype.forEach.call($('set-diff').children, function (b) {
      b.addEventListener('click', function () { s.diff = b.dataset.v; save(); fillForm(); });
    });
    $('btn-reset').addEventListener('click', function () {
      // change the existing settings object in place (the form listeners above hold on to it)
      Object.keys(ES.defaults).forEach(function (k) { s[k] = ES.defaults[k]; });
      s.subjects = Object.assign({}, ES.defaults.subjects);
      save(); fillForm();
    });
    // tabs
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () {
        Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (x) { x.classList.toggle('active', x === t); });
        Array.prototype.forEach.call(document.querySelectorAll('.panel'), function (p) { p.classList.toggle('hidden', p.id !== t.dataset.tab); });
      });
    });
  }

  /* ---------- play / stop ---------- */
  function startGame() {
    const btn = $('btn-play');
    btn.disabled = true;
    const msg = $('menu-msg'); msg.classList.add('hidden');
    ES.audio.unlock();
    showScreen('game');
    $('btn-again').textContent = '↻ Play again';
    const r = ES.game.start();
    btn.disabled = false;
    if (!r.ok) {
      showScreen('menu');
      msg.textContent = r.error; msg.classList.remove('hidden');
    }
  }
  /* leave the game screen. In a class match we go back to the waiting room (still connected), otherwise to the menu */
  function toMenu() {
    const wasNet = ES.game.isNet && ES.game.isNet();
    ES.game.stop();
    if (wasNet && ES.session.state.connected) { ES.session.send({ t: 'quit' }); showScreen('room'); ES.lobby.showWait(); }
    else showScreen('menu');
  }

  /* ---------- teacher ON/OFF switch ---------- */
  function showGate(icon, title, text, canRetry) {
    if (ES.game.active) ES.game.stop();      // stop any match that is running
    if (ES.lobby) ES.lobby.leave();           // and leave any class room
    $('gate-icon').textContent = icon; $('gate-title').textContent = title; $('gate-text').textContent = text;
    $('gate-retry').classList.toggle('hidden', !canRetry);
    showScreen('gate');
  }
  function startGate() {
    showGate('⏳', 'Checking…', 'Asking your teacher if the game is open.', false);
    ES.gate.run({
      onOpen: function () { if (document.body.dataset.screen === 'gate') { if ($('room-code-in').value.length === 5) { $('room-name-in').value = S().name || ''; showScreen('room'); ES.lobby.show(); } else showScreen('menu'); } },
      onClosed: function (msg) { showGate('🔒', 'EduStrike is closed', msg || 'Your teacher has turned the game off. Please wait.', true); },
      onError: function () { showGate('📡', "Can't reach the game switch", 'Check your internet. The game opens again by itself when it is back.', true); }
    });
    $('gate-retry').addEventListener('click', function () { ES.gate.checkNow(); });
  }

  function init() {
    // fill the map list (from world.js) before the form is filled
    $('set-map').innerHTML = ES.MAPS_LIST.map(function (m) { return '<option value="' + m.id + '">' + m.name + '</option>'; }).join('');
    build(); fillForm(); bindForm();
    $('btn-play').addEventListener('click', startGame);
    // class game: join screen + waiting room
    ES.lobby.init();
    $('btn-join').addEventListener('click', function () {
      ES.audio.unlock();
      $('room-name-in').value = S().name || '';
      showScreen('room'); ES.lobby.show();
    });
    $('room-back').addEventListener('click', function () { showScreen('menu'); });
    $('room-leave').addEventListener('click', function () { ES.lobby.leave(); ES.lobby.show(); });
    try {   // a link like ...index.html?room=ABCDE opens the join screen with the code filled in
      const code = new URLSearchParams(location.search).get('room');
      if (code) { $('room-code-in').value = ES.net.cleanCode(code); }
    } catch (e) { /* ignore */ }
    if (ES.gate && ES.gate.enabled()) startGate(); else if ($('room-code-in').value.length === 5) { $('room-name-in').value = S().name || ''; showScreen('room'); ES.lobby.show(); } else showScreen('menu');
    $('btn-ready').addEventListener('click', function () { ES.game.begin(); });
    $('btn-ready-quit').addEventListener('click', toMenu);
    $('btn-resume').addEventListener('click', function () { ES.game.resume(); });
    $('btn-quit').addEventListener('click', toMenu);
    $('btn-menu').addEventListener('click', toMenu);
    $('btn-again').addEventListener('click', function () { if (ES.game.isNet && ES.game.isNet()) toMenu(); else startGame(); });

    // ---- messages from the teacher's page during a class match ----
    ES.session.on('start', function (m) {
      if (ES.game.active) ES.game.stop();
      ES.audio.unlock(); applyAudio();
      showScreen('game');
      $('btn-again').textContent = '↩ Back to class room';
      const r = ES.game.start({ net: m });
      if (!r.ok) {
        ES.session.send({ t: 'quit' }); showScreen('room'); ES.lobby.showWait();
        $('room-msg').textContent = r.error; $('room-msg').classList.remove('hidden'); $('room-msg').classList.add('bad');
      }
    });
    ES.session.on('snap', function (m) { ES.game.netSnap(m); });
    ES.session.on('respawn', function (m) { ES.game.netRespawn(m); });
    ES.session.on('wpn', function (m) { ES.game.netWeapon(m); });
    ES.session.on('end', function (m) { ES.game.netEnd(m); });
    // the room closed / we were removed / the connection dropped while in a match: leave the game screen
    ES.lobby.onEnd = function () { if (ES.game.active) ES.game.stop(); showScreen('room'); };
  }
  init();
})();
