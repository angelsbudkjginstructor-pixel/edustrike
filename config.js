/* EduStrike - settings and tuning numbers.
   Everything a teacher or developer might want to tweak lives here.
   SAFETY: settings are loaded inside try/catch, so a broken/blocked
   localStorage can never stop the game from starting. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.VERSION = 'Stage 4A - maps';

  /* Relay (TURN) for students on a DIFFERENT network (e.g. at home). Leave servers empty to use only direct connections.
     This is the Metered free-trial credential 'edustrike-game' that the teacher created.
     To switch the relay off, delete the credential on dashboard.metered.ca (or empty the list below). */
  ES.ICE = {
    fetchUrl: '',
    servers: [
      { urls: 'turn:global.relay.metered.ca:80', username: '99e10bd079397fc1652f6686', credential: 'JZy1Fn4amVsqe2Iq' },
      { urls: 'turn:global.relay.metered.ca:80?transport=tcp', username: '99e10bd079397fc1652f6686', credential: 'JZy1Fn4amVsqe2Iq' },
      { urls: 'turn:global.relay.metered.ca:443', username: '99e10bd079397fc1652f6686', credential: 'JZy1Fn4amVsqe2Iq' },
      { urls: 'turns:global.relay.metered.ca:443?transport=tcp', username: '99e10bd079397fc1652f6686', credential: 'JZy1Fn4amVsqe2Iq' }
    ]
  };

  /* Teacher ON/OFF switch.
     Paste the Apps Script "Web app URL" between the quotes (see SETUP step).
     Leave it empty ('') to turn the switch off - the game is then always open (good for testing). */
  ES.GATE = { url: 'https://script.google.com/macros/s/AKfycbyRCk_fMU1cNCwhWX9c0NcmUgpz3OmJGjTfF3r5JAoeqZLdAf1R3Ctclj4fjmKH8DLlLg/exec', openSeconds: 60, retrySeconds: 10 };

  /* Subjects: colour-coded so students learn "orange = Math" at a glance */
  ES.SUBJECTS = {
    en: { name: 'English',       color: '#2f7bff', icon: '📘' },
    ma: { name: 'Math',          color: '#ff8a1f', icon: '🔢' },
    sc: { name: 'Science',       color: '#1fae5a', icon: '🔬' },
    ge: { name: 'Geography',     color: '#8a5cf6', icon: '🌏' },
    bm: { name: 'Bahasa Melayu', color: '#e8403f', icon: '📕' }
  };

  ES.TEAMS = [
    { name: 'Blue Team', color: 0x2f86ff, css: '#2f86ff' },
    { name: 'Red Team',  color: 0xff5a3c, css: '#ff5a3c' }
  ];
  ES.BOT_NAMES = [
    ['Nova', 'Pip', 'Zed', 'Mochi', 'Kiki', 'Dot'],      // blue team helpers
    ['Rex', 'Bolt', 'Gizmo', 'Spike', 'Zap', 'Blitz']    // red team opponents
  ];

  /* Player body + blaster */
  ES.PLAYER = {
    radius: 0.4, eye: 1.6, walk: 5.5, sprint: 8.0,
    jump: 6.5, gravity: 18, hp: 100,
    fireInterval: 0.2,     // seconds between shots (hold the mouse to keep firing)
    damage: 25, headDamage: 50,
    regenDelay: 4, regenRate: 10,   // health comes back by itself after 4 s
    respawn: 3, protect: 2
  };
  ES.AMMO = { start: 12, max: 30 };

  /* Enemy bot skill levels. Friendly bots always use "normal". */
  ES.DIFF = {
    easy:   { label: 'Easy',   speed: 3.0, react: 1.0,  aim: 0.13,  dmg: 5,  interval: 0.9,  range: 24, fov: 2.0, turn: 2.6, mag: 10, ansTime: 6.5, ansAcc: 0.55 },
    normal: { label: 'Normal', speed: 3.9, react: 0.6,  aim: 0.07,  dmg: 8,  interval: 0.55, range: 30, fov: 2.3, turn: 4.0, mag: 12, ansTime: 4.5, ansAcc: 0.75 },
    hard:   { label: 'Hard',   speed: 4.6, react: 0.3,  aim: 0.035, dmg: 11, interval: 0.38, range: 38, fov: 2.6, turn: 6.0, mag: 14, ansTime: 3.0, ansAcc: 0.90 }
  };

  /* Graphics levels. "scale" shrinks the internal picture (big speed-up on weak GPUs). */
  ES.GFX = {
    low:    { label: 'Low (fastest)', scale: 0.7, maxPR: 1,   aa: false, shadows: false, fog: 46, sparks: 6 },
    medium: { label: 'Medium',        scale: 1.0, maxPR: 1,   aa: false, shadows: false, fog: 60, sparks: 12 },
    high:   { label: 'High',          scale: 1.0, maxPR: 1.5, aa: true,  shadows: true,  fog: 80, sparks: 20 },
    fancy:  { label: '✨ Fancy (strong laptops)', scale: 1.0, maxPR: 1.5, aa: true, shadows: true, fog: 120, sparks: 48, fancy: true }
  };

  ES.defaults = {
    name: 'Cadet',
    botsPerTeam: 4, targetKills: 15, minutes: 5, diff: 'normal',
    subjects: { en: true, ma: true, sc: true, ge: true, bm: true },
    gradeMin: 1, gradeMax: 7,
    qTime: 30,        // seconds to answer (0 = no limit)
    reward: 12,       // ammo for a correct answer
    wrongAmmo: 2,     // small "nice try" ammo for a wrong answer
    answerMode: 'slow', // 'slow' = world slows down while answering, 'live' = no slow-down
    gfx: 'low', showFps: true, aimAssist: true, radar: true,
    sens: 1, fov: 75, sound: true, lookMode: 'lock', // 'lock' = pointer lock, 'keys' = arrow keys + right-drag
    music: true, musicVol: 0.6, sfxVol: 0.8, scream: true,
    map: 'park'
  };

  const KEY = 'edustrike.settings.v1';
  ES.settings = Object.assign({}, ES.defaults);
  try {
    const raw = window.localStorage && window.localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.keys(ES.defaults).forEach(function (k) {
        if (saved[k] !== undefined && typeof saved[k] === typeof ES.defaults[k]) ES.settings[k] = saved[k];
      });
      ES.settings.subjects = Object.assign({}, ES.defaults.subjects, saved.subjects || {});
    }
  } catch (e) { /* ignore - defaults are fine */ }

  ES.saveSettings = function () {
    try { window.localStorage.setItem(KEY, JSON.stringify(ES.settings)); } catch (e) { /* ignore */ }
  };
})();
