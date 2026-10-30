/* EduStrike - settings and tuning numbers.
   Everything a teacher or developer might want to tweak lives here.
   SAFETY: settings are loaded inside try/catch, so a broken/blocked
   localStorage can never stop the game from starting. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.VERSION = 'Stage 5D - new maps, map songs and map effects';

  /* Sound files you can drop in (put the files next to index.html on GitHub).
     name = the game event, files = the sound files for it (several files = a different one each time),
     gain = loudness, layer: true = play ON TOP of the built-in sound instead of replacing it.
     If a file is missing, the game quietly uses its built-in synthesised sound instead. */
  ES.SOUND_FILES = {
    scream: { files: ['sfx-scream-1.mp3', 'sfx-scream-2.mp3', 'sfx-scream-3.mp3', 'sfx-scream-4.mp3', 'sfx-scream-5.mp3', 'sfx-scream-6.mp3', 'sfx-scream-7.mp3', 'sfx-scream-8.mp3'], gain: 1.0, rate: 0.08 },
    reload: { files: ['sfx-reload.mp3'], gain: 0.9, rate: 0.05 },
    empty:  { files: ['sfx-empty.mp3'], gain: 0.9, rate: 0.05 },
    kill:   { files: ['sfx-blow.mp3'], gain: 0.55, layer: true },
    shoot:     { files: ['sfx-pistol.mp3'], gain: 0.85, rate: 0.06 },      // your pistol
    botShoot:  { files: ['sfx-pistol.mp3'], gain: 0.5, rate: 0.12 },       // everybody else's pistol (softer, and quieter with distance)
    // bonus weapons (each one its own sound; delete a file to go back to the built-in sound)
    w_rapid:   { files: ['sfx-rapid.mp3'],   gain: 0.8, rate: 0.12 },
    w_scatter: { files: ['sfx-scatter.mp3'], gain: 1.4, rate: 0.05 },
    w_sniper:  { files: ['sfx-sniper.mp3'],  gain: 0.9, rate: 0.03 },
    w_rocket:  { files: ['sfx-rocket.mp3'],  gain: 0.9, rate: 0.03 },
    pickup:    { files: ['sfx-pickup.mp3'],  gain: 0.8 },
    // Rescue & Bomb mode (your own bomb sounds)
    bomb_tick: { files: ['sfx-bombtick.mp3'], gain: 0.9 },
    bomb_fast: { files: ['sfx-bombfast.mp3'], gain: 0.9 },
    bomb_boom: { files: ['sfx-bomb.mp3'],     gain: 1.2 }
  };
  /* Music files. play = the music while a match is running (if the file is missing the game makes its own music). */
  ES.MUSIC_FILES = {
    play: 'music-thriller.mp3', gain: 1.0,
    /* Want a different song for a map? Upload the mp3 and write its name here, for example:  space: 'music-space.mp3'
       Maps with no file of their own play the normal song at a slightly different speed (see rate below). */
    byMap: { park: 'music-park.mp3', castle: 'music-castle.mp3', rooftops: 'music-rooftops.mp3', jungle: 'music-jungle.mp3', space: 'music-space.mp3',
             snow: 'music-snow.mp3', underwater: 'music-underwater.mp3' },
    rate: {}                        // every map has its own song now (a map with none would play the normal song at a different speed)
  };

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

  /* Your questions, from a Google Sheet.
     Paste the "Publish to web" CSV link of your Questions sheet between the quotes (the setup steps are in README.md).
     Leave it empty ('') to use only the built-in questions. */
  ES.QUESTION_SHEET = { url: 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQ3isth7FhF83iVbbQSd7Vg9p46lcB6SweL3vZ5ErVXziIUQZ-Jd14A75_8EJoIoMi8BOdLaVB69NWs/pub?output=csv', timeoutMs: 9000 };

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

  /* Bonus weapons. You get one by walking over a glowing crate, or by answering 3 questions right in a row.
     dmg = damage per bullet, head = damage for a head shot, pellets = bullets per shot (the shotgun),
     interval = seconds between shots, mag = how many shots it has, secs = how long you keep it,
     splash/splashR = rocket blast damage and size, range = how far it shoots, color = the laser colour. */
  ES.WEAPONS = {
    pistol:  { name: 'Blaster',         icon: '🔫', dmg: 25,  head: 50,  pellets: 1, spread: 0,    interval: 0.2,  range: 90 },
    rapid:   { name: 'Rapid Blaster',   icon: '⚡', dmg: 11,  head: 18,  pellets: 1, spread: 0.02, interval: 0.075, range: 70,  mag: 70, secs: 25, color: 0xffe14a },
    scatter: { name: 'Scatter Blaster', icon: '💥', dmg: 13,  head: 16,  pellets: 8, spread: 0.075, interval: 0.75, range: 32,  mag: 12, secs: 30, color: 0xff9a3c },
    sniper:  { name: 'Sniper Laser',    icon: '🎯', dmg: 100, head: 100, pellets: 1, spread: 0,    interval: 1.0,  range: 160, mag: 6,  secs: 30, color: 0x7dffb0 },
    rocket:  { name: 'Rocket Blast',    icon: '🚀', dmg: 70,  head: 70,  pellets: 1, spread: 0,    interval: 1.3,  range: 90,  mag: 5,  secs: 30, color: 0xff5a3c, splash: 55, splashR: 4 }
  };
  ES.WEAPON_IDS = ['rapid', 'scatter', 'sniper', 'rocket'];
  /* Weapon crates are RARE: a pair of gold crates (one near each team) appears, waits ~28 s, then vanishes
     if nobody took it. The next pair comes about a minute later. first = seconds after GO for the first pair. */
  ES.CRATE = { radius: 1.3, first: 40, every: 60, life: 28 };
  /* The crate clock: used by the teacher's page (class match) and by solo play. n = number of crate spots (they come in pairs). */
  ES.crateClock = function (n) {
    const c = { n: n, t: ES.CRATE.first, life: 0, mask: 0, last: -1 };
    c.update = function (dt) {
      if (c.mask) {
        c.life -= dt;
        if (c.life <= 0) { c.mask = 0; c.t = ES.CRATE.every + Math.random() * 10; }
      } else if (c.n >= 2) {
        c.t -= dt;
        if (c.t <= 0) {
          const pairs = Math.floor(c.n / 2); let k = Math.floor(Math.random() * pairs);
          if (pairs > 1 && k === c.last) k = (k + 1) % pairs;
          c.last = k; c.mask = (1 << (2 * k)) | (1 << (2 * k + 1)); c.life = ES.CRATE.life;
        }
      }
    };
    c.take = function (i) { c.mask &= ~(1 << i); if (!c.mask) c.t = ES.CRATE.every + Math.random() * 10; };
    return c;
  };

  /* Enemy bot skill levels. Friendly bots always use "normal". */
  ES.DIFF = {
    easy:   { label: 'Easy',   speed: 3.0, react: 1.0,  aim: 0.13,  dmg: 5,  interval: 0.9,  range: 24, fov: 2.0, turn: 2.6, mag: 10, ansTime: 6.5, ansAcc: 0.55 },
    normal: { label: 'Normal', speed: 3.9, react: 0.6,  aim: 0.07,  dmg: 8,  interval: 0.55, range: 30, fov: 2.3, turn: 4.0, mag: 12, ansTime: 4.5, ansAcc: 0.75 },
    hard:   { label: 'Hard',   speed: 4.6, react: 0.3,  aim: 0.035, dmg: 11, interval: 0.38, range: 38, fov: 2.6, turn: 6.0, mag: 14, ansTime: 3.0, ansAcc: 0.90 }
  };

  /* Graphics levels, from the lightest to the heaviest computer.
     scale   = shrinks the internal picture (big speed-up on weak GPUs)      maxPR = sharpness cap (1 = normal, 2 = very sharp)
     aa      = smooth edges      shadows = real sun shadows (shadowSize = quality, soft = soft edges)
     real    = realistic look (surface detail, realistic soldiers + gun, warm film-like colours)
     world   = extra scenery (windows, ground painting, hills, clouds, base beams)
     fx      = glow effects (glowing shots, flash rings, more sparks, sun glow, vignette) */
  ES.GFX = {
    low:    { label: 'Low (fastest)', scale: 0.7, maxPR: 1,   aa: false, shadows: false, fog: 46, sparks: 6,  far: 140 },
    medium: { label: 'Medium',        scale: 1.0, maxPR: 1,   aa: false, shadows: false, fog: 60, sparks: 12, far: 140 },
    high:   { label: 'High',          scale: 1.0, maxPR: 1.5, aa: true,  shadows: true,  shadowSize: 1024, soft: false, fog: 95,  sparks: 20, far: 200, real: true, world: true,  fx: false },
    ultra:  { label: 'Ultra (strong laptops)', scale: 1.0, maxPR: 2, aa: true, shadows: true, shadowSize: 2048, soft: true, fog: 140, sparks: 48, far: 240, real: true, world: true, fx: true, texSize: 2048, bump: true }
  };
  ES.GFX_ORDER = ['low', 'medium', 'high', 'ultra'];                 // used when a slow computer steps down one level
  ES.gfxKey = function (k) { return k === 'fancy' ? 'ultra' : (ES.GFX[k] ? k : 'low'); };     // old saved "fancy" = Ultra

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
    music: true, musicVol: 0.6, sfxVol: 0.8, scream: true, trackMusic: true, announcer: true,
    map: 'park',
    mode: 'normal', rbRounds: 3, rbMinutes: 3        // game mode: 'normal' or 'rb' (Rescue & Bomb)
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
