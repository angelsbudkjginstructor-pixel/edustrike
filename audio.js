/* EduStrike - music and sound effects, all made live by the browser (Web Audio).
   No audio files = nothing to download and no copyright problems.

   MUSIC: "epic action" in D minor - driving drums + bass, a string-like pad, a heroic lead tune and
          a fast arpeggio. The longer the match goes and the closer the score, the faster and heavier it gets.
          While a question is open the music goes soft and muffled so students can think.
   SOUNDS: sci-fi laser blasters, charge-up and power-up sounds. Nothing scary.

   SAFETY: every call is wrapped so a browser without audio simply stays silent;
           a compressor on the output stops many sounds at once from getting too loud;
           the music scheduler restarts itself if the computer stalls for a moment. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  let ctx = null, master = null, sfxBus = null, musicBus = null, musicFilter = null, analyser = null, noiseBuf = null;
  let sfxOn = true, musicOn = true, sfxVol = 0.8, musicVol = 0.6, screamOn = true;
  /* ---- real recorded sounds (optional, see ES.SOUND_FILES in config.js) ---- */
  const samples = {};          // event name -> [decoded sounds]
  let samplesStarted = false, lastPick = {};
  function loadSamples() {
    if (samplesStarted || !ctx) return;
    samplesStarted = true;
    const cfg = ES.SOUND_FILES || {};
    Object.keys(cfg).forEach(function (name) {
      (cfg[name].files || []).forEach(function (file) {
        try {
          fetch(file).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
            .then(function (ab) { return ab ? ctx.decodeAudioData(ab) : null; })
            .then(function (buf) { if (buf) (samples[name] = samples[name] || []).push(buf); })
            .catch(function () { /* missing file: the built-in sound is used instead */ });
        } catch (e) { /* ignore */ }
      });
    });
  }
  /* the match music track (a recorded song). Played in a loop through the same volume + "muffle while answering" controls as the built-in music. */
  let trackBuf = null, trackSrc = null, trackTried = false, trackOn = true, curMap = 'park', trackFile = '', wantTrack = false;   // wantTrack: only download the song once a match has chosen its map
  /* each map can have its own music file (ES.MUSIC_FILES.byMap) - if there is none, the normal match music plays at a different speed/pitch so the maps still feel different */
  function mapTrackFile() { const mf = ES.MUSIC_FILES || {}; return (mf.byMap && mf.byMap[curMap]) || mf.play; }
  function loadTrack() {
    const f = mapTrackFile(); trackFile = f;
    if (!f || trackTried || !ctx || !trackOn || !wantTrack) return;          // trackOn = false: weak computer, keep the light built-in music only
    trackTried = true;
    try {
      fetch(f).then(function (r) { return r.ok ? r.arrayBuffer() : null; })
        .then(function (ab) { return ab ? ctx.decodeAudioData(ab) : null; })
        .then(function (buf) { if (buf) { trackBuf = buf; if (M.running && M.mode === 'play' && trackOn && !trackSrc && f === trackFile) { try { startTrack(); } catch (e) { /* ignore */ } } } })   // arrived after the match began: start it now
        .catch(function () { /* no file: built-in music is used */ });
    } catch (e) { /* ignore */ }
  }
  function startTrack() {
    stopTrack(0);
    trackSrc = ctx.createBufferSource(); trackSrc.buffer = trackBuf; trackSrc.loop = true;
    const mf = ES.MUSIC_FILES || {}; trackSrc.playbackRate.value = (mf.byMap && mf.byMap[curMap]) ? 1 : ((mf.rate && mf.rate[curMap]) || 1);
    const g = ctx.createGain(); g.gain.value = (ES.MUSIC_FILES || {}).gain || 1;
    trackSrc.connect(g); g.connect(musicBus);
    trackSrc.start();
  }
  function stopTrack(delay) {
    const s = trackSrc; trackSrc = null;
    if (s) setTimeout(function () { try { s.stop(); } catch (e) { /* already stopped */ } }, delay || 0);
  }
  function playSample(name, v, pan) {
    const cfg = (ES.SOUND_FILES || {})[name], list = samples[name];
    if (!cfg || !list || !list.length || !ensure()) return false;
    try {
      let i = Math.floor(Math.random() * list.length);
      if (list.length > 1 && i === lastPick[name]) i = (i + 1) % list.length;      // never the same scream twice in a row
      lastPick[name] = i;
      const src = ctx.createBufferSource(), g = ctx.createGain();
      src.buffer = list[i];
      src.playbackRate.value = 1 + (Math.random() * 2 - 1) * (cfg.rate || 0);      // tiny pitch change so repeats do not sound identical
      g.gain.value = Math.max(0, v) * (cfg.gain === undefined ? 1 : cfg.gain);
      src.connect(g); g.connect(panNode(pan, sfxBus));
      src.start();
      return true;
    } catch (e) { return false; }
  }

  function ensure() {
    if (!sfxOn && !musicOn) return false;
    try {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = 0.9;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 20; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.2;
        analyser = ctx.createAnalyser(); analyser.fftSize = 1024;
        master.connect(comp); comp.connect(analyser); analyser.connect(ctx.destination);
        sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol * 0.7; sfxBus.connect(master);
        musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000;
        musicBus = ctx.createGain(); musicBus.gain.value = 0;
        musicBus.connect(musicFilter); musicFilter.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ctx.state === 'suspended') ctx.resume();
      loadSamples(); loadTrack();
      return true;
    } catch (e) { return false; }
  }

  const jit = function (f, amt) { return f * (1 + (Math.random() - 0.5) * amt); };
  const mtof = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  /* ===================== sound effects ===================== */
  function panNode(pan, dest) {
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(dest); return p;
    }
    return dest;
  }

  /* a pitched beep that glides from f0 to f1. opt: {cut: lowpass Hz, atk: attack seconds} */
  function tone(type, f0, f1, dur, vol, delay, pan, opt) {
    if (!sfxOn || !ensure()) return;
    try {
      opt = opt || {};
      const t0 = ctx.currentTime + (delay || 0);
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t0);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
      const atk = opt.atk || 0.008;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      let node = o;
      if (opt.cut) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = opt.cut; o.connect(f); node = f; }
      node.connect(g); g.connect(panNode(pan, sfxBus));
      o.start(t0); o.stop(t0 + dur + 0.03);
    } catch (e) { /* stay silent */ }
  }

  /* a burst of filtered noise */
  function noise(dur, vol, freq, delay, pan, type) {
    if (!sfxOn || !ensure()) return;
    try {
      const t0 = ctx.currentTime + (delay || 0);
      const s = ctx.createBufferSource(); s.buffer = noiseBuf;
      const f = ctx.createBiquadFilter(); f.type = type || 'lowpass'; f.frequency.value = freq || 1500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      s.connect(f); f.connect(g); g.connect(panNode(pan, sfxBus));
      s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
    } catch (e) { /* stay silent */ }
  }

  /* v = volume 0..1, p = stereo pan -1..1 */
  const SFX = {
    // player's laser blaster: bright "pew" + zap + low thump (pitch changes a little every shot)
    shoot: function (v, p) {
      tone('sawtooth', jit(1700, 0.1), 260, 0.15, 0.17 * v, 0, p, { cut: 5000 });
      tone('square', jit(2600, 0.1), 900, 0.06, 0.05 * v, 0, p);
      tone('sine', 130, 55, 0.1, 0.22 * v, 0, p);
      noise(0.03, 0.08 * v, 6000, 0, p, 'highpass');
    },
    // other blasters: lower and softer so yours always stands out
    botShoot: function (v, p) {
      tone('sawtooth', jit(950, 0.15), 240, 0.13, 0.10 * v, 0, p, { cut: 2500 });
      tone('sine', 110, 60, 0.08, 0.08 * v, 0, p);
    },
    /* ---- bonus weapons: each one sounds different so you can hear what the enemy is using ---- */
    // rapid blaster: a quick, high, buzzy "pit-pit"
    w_rapid: function (v, p) {
      tone('square', jit(2300, 0.08), 1100, 0.05, 0.11 * v, 0, p, { cut: 6000 });
      tone('sine', 220, 110, 0.05, 0.12 * v, 0, p);
      noise(0.02, 0.06 * v, 7000, 0, p, 'highpass');
    },
    // scatter blaster: a fat low "BOOM-shk" (noise burst + thump)
    w_scatter: function (v, p) {
      noise(0.22, 0.34 * v, 1800, 0, p);
      tone('sine', 150, 38, 0.24, 0.34 * v, 0, p);
      tone('sawtooth', 420, 70, 0.14, 0.12 * v, 0, p, { cut: 1500 });
      noise(0.1, 0.12 * v, 5000, 0.12, p, 'highpass');
    },
    // sniper laser: a long clean "ZZZIIING" that falls away, with a crack
    w_sniper: function (v, p) {
      tone('sawtooth', 3600, 160, 0.5, 0.14 * v, 0, p, { cut: 6000 });
      tone('sine', 1200, 90, 0.45, 0.16 * v, 0, p);
      noise(0.05, 0.22 * v, 7000, 0, p, 'highpass');
      tone('sine', 90, 40, 0.2, 0.28 * v, 0, p);
    },
    // rocket launch: a whoosh that rises, then fades
    w_rocket: function (v, p) {
      noise(0.55, 0.26 * v, 900, 0, p);
      tone('sawtooth', 120, 420, 0.45, 0.12 * v, 0, p, { cut: 1400 });
      tone('sine', 90, 50, 0.2, 0.25 * v, 0, p);
    },
    // rocket explosion: a deep boom with a rumble
    boom: function (v, p) {
      noise(0.7, 0.42 * v, 700, 0, p);
      tone('sine', 110, 28, 0.6, 0.45 * v, 0, p);
      tone('sawtooth', 200, 40, 0.4, 0.14 * v, 0, p, { cut: 700 });
    },
    // Rescue & Bomb: the ticking bomb (slow, then fast in the last seconds), the big explosion, a rescue chime
    bomb_tick: function (v, p) { tone('square', 1500, 1500, 0.06, 0.12 * v, 0, p); },
    bomb_fast: function (v, p) { tone('square', 2000, 2000, 0.05, 0.15 * v, 0, p); },
    bomb_boom: function (v, p) { noise(1.1, 0.6 * v, 600, 0, p); tone('sine', 90, 24, 1.0, 0.6 * v, 0, p); tone('sawtooth', 180, 30, 0.7, 0.2 * v, 0, p, { cut: 600 }); },
    rb_plant: function () { tone('square', 900, 900, 0.1, 0.12); tone('square', 900, 900, 0.1, 0.12, 0.18); tone('square', 1200, 1200, 0.2, 0.12, 0.36); },
    rb_rescue: function () { [523, 659, 784, 1046].forEach(function (f, i) { tone('triangle', f, f, 0.18, 0.15, i * 0.1); }); },
    // picking up a weapon: a bright "power-up" sweep
    pickup: function () {
      tone('triangle', 400, 1600, 0.2, 0.17);
      [660, 880, 1320].forEach(function (f, i) { tone('square', f, f, 0.09, 0.07, 0.1 + i * 0.07); });
    },
    // the bonus weapon ran out
    wpnEnd: function () { tone('triangle', 700, 260, 0.25, 0.14); tone('sine', 300, 150, 0.2, 0.1, 0.1); },
    empty: function () { noise(0.03, 0.18, 4000, 0, 0, 'highpass'); tone('square', 320, 140, 0.14, 0.09); },
    warn: function () { tone('square', 880, 880, 0.07, 0.07); tone('square', 880, 880, 0.07, 0.07, 0.11); },
    hit: function () { tone('square', 2000, 1300, 0.05, 0.12); tone('sine', 3400, 3400, 0.04, 0.06, 0.01); },
    headshot: function () { tone('triangle', 1500, 2800, 0.11, 0.16); tone('sine', 3200, 4200, 0.12, 0.08, 0.05); tone('square', 900, 900, 0.04, 0.05); },
    kill: function () {
      [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, 0.1, 0.17, i * 0.055); });
      tone('sine', 2093, 2093, 0.25, 0.06, 0.2);
    },
    hurt: function () { tone('sawtooth', 420, 90, 0.2, 0.2, 0, 0, { cut: 1200 }); noise(0.1, 0.25, 700); },
    die: function () { tone('sawtooth', 520, 40, 0.7, 0.2, 0, 0, { cut: 1500 }); noise(0.35, 0.18, 600); },
    respawn: function () { tone('sine', 200, 1300, 0.35, 0.17); tone('triangle', 400, 2600, 0.3, 0.06, 0.05); },
    open: function () { tone('triangle', 600, 900, 0.07, 0.14); tone('triangle', 900, 1500, 0.1, 0.14, 0.07); },
    // correct = "weapon charging up" + happy chord
    correct: function () {
      tone('sawtooth', 280, 1900, 0.28, 0.12, 0, 0, { cut: 4000 });
      [523, 659, 784, 1047].forEach(function (f, i) { tone('triangle', f, f, 0.2, 0.18, 0.2 + i * 0.07); });
      tone('sine', 2093, 2093, 0.3, 0.07, 0.5);
    },
    // wrong = soft, friendly "bwomp" (never harsh)
    wrong: function () { tone('triangle', 330, 150, 0.32, 0.17); tone('triangle', 247, 110, 0.38, 0.14, 0.2); },
    tick: function () { tone('square', 900, 900, 0.04, 0.08); },
    count: function () { tone('square', 520, 520, 0.12, 0.15); },
    go: function () { tone('sawtooth', 330, 330, 0.12, 0.16); tone('sawtooth', 660, 990, 0.35, 0.18, 0.12); tone('sine', 1320, 1980, 0.3, 0.06, 0.15); },
    win: function () {
      [[392, 494, 587], [440, 554, 659], [494, 587, 740], [587, 740, 880]].forEach(function (c, i) {
        c.forEach(function (f) { tone('sawtooth', f, f, 0.5, 0.07, i * 0.2, 0, { cut: 3000, atk: 0.02 }); });
      });
      tone('triangle', 1175, 1175, 0.8, 0.12, 0.8);
    },
    lose: function () { [440, 392, 349, 294].forEach(function (f, i) { tone('triangle', f, f * 0.98, 0.34, 0.17, i * 0.17); }); },
    /* A dramatic action-movie scream: a voice-like buzzing tone that shoots up then falls away,
       shaped by two "mouth" filters (an AAAH vowel), with vibrato and a breathy noise. Different pitch every time. */
    scream: function (v, p) {
      if (!screamOn || !sfxOn || !ensure()) return;
      try {
        const t0 = ctx.currentTime, dur = 1.15, k = 0.85 + Math.random() * 0.35, out = panNode(p, sfxBus);
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, t0);
        master.gain.exponentialRampToValueAtTime(Math.max(0.0003, 0.42 * v), t0 + 0.04);
        master.gain.setValueAtTime(Math.max(0.0003, 0.42 * v), t0 + 0.45);
        master.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        master.connect(out);
        const lfo = ctx.createOscillator(), lfoG = ctx.createGain();            // wobble in the voice
        lfo.frequency.value = 6.5; lfoG.gain.value = 28; lfo.connect(lfoG);
        [0, 22].forEach(function (cents) {                                       // two slightly different voices = rough, screamy
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.detune.value = cents;
          o.frequency.setValueAtTime(330 * k, t0);
          o.frequency.linearRampToValueAtTime(780 * k, t0 + 0.16);
          o.frequency.linearRampToValueAtTime(940 * k, t0 + 0.36);
          o.frequency.exponentialRampToValueAtTime(250 * k, t0 + dur);
          lfoG.connect(o.frequency);
          [[820, 5, 1.0], [1350, 7, 0.7], [2600, 8, 0.25]].forEach(function (f) {  // the "mouth" shape
            const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f[0]; bp.Q.value = f[1];
            const g = ctx.createGain(); g.gain.value = f[2];
            o.connect(bp); bp.connect(g); g.connect(master);
          });
          o.start(t0); o.stop(t0 + dur + 0.05);
        });
        lfo.start(t0); lfo.stop(t0 + dur + 0.05);
        noise(0.7, 0.07 * v, 2500, 0.02, p, 'bandpass');                         // breath
        tone('sine', 90, 40, 0.5, 0.12 * v, 0, p);                                // thud underneath
      } catch (e) { /* stay silent */ }
    },
    // little double click when the blaster is reloaded (used if no sound file is dropped in)
    reload: function (v, p) { tone('square', 1400, 900, 0.03, 0.08 * v, 0, p); tone('square', 900, 500, 0.04, 0.08 * v, 0.07, p); },
    // soft footstep: a short dull thud (pitch changes a little each time)
    step: function (v, p) { tone('sine', jit(120, 0.15), 60, 0.07, 0.12 * v, 0, p); noise(0.04, 0.05 * v, 900, 0, p); },
    land: function (v, p) { tone('sine', 90, 45, 0.14, 0.2 * v, 0, p); noise(0.08, 0.1 * v, 700, 0, p); },
    jump: function () { tone('sine', 230, 560, 0.09, 0.07); noise(0.05, 0.05, 2500, 0, 0, 'bandpass'); }
  };

  /* ===================== epic action music ===================== */
  // 8-bar loop in D minor: [bass root (MIDI), minor?]
  const CHORDS = [
    { r: 38, m: 1 }, { r: 38, m: 1 }, { r: 34, m: 0 }, { r: 36, m: 0 },   // Dm  Dm  Bb  C
    { r: 38, m: 1 }, { r: 38, m: 1 }, { r: 34, m: 0 }, { r: 36, m: 0 }    // Dm  Dm  Bb  C
  ];
  // heroic lead tune: [16th step in bar, MIDI note, length in 16ths]
  const LEAD = [
    [[0, 74, 6], [6, 77, 2], [8, 81, 6], [14, 79, 2]],
    [[0, 77, 4], [4, 76, 4], [8, 74, 8]],
    [[0, 82, 6], [6, 81, 2], [8, 79, 6], [14, 77, 2]],
    [[0, 79, 4], [4, 77, 4], [8, 76, 4], [12, 72, 4]],
    [[0, 74, 6], [6, 77, 2], [8, 81, 6], [14, 84, 2]],
    [[0, 86, 8], [8, 84, 4], [12, 81, 4]],
    [[0, 82, 4], [4, 84, 4], [8, 82, 4], [12, 81, 4]],
    [[0, 79, 6], [6, 81, 2], [8, 84, 8]]
  ];

  const M = { mode: 'play', running: false, timer: 0, nextT: 0, step: 0, bar: 0, intensity: 0.4, target: 0.4, muffled: false, paused: false, steps: 0 };

  /* the built-in music changes key and speed on each map (used when the recorded track is off or missing) */
  const MAPMUS = { park: { tr: 0, bpm: 0 }, rooftops: { tr: 2, bpm: 8 }, castle: { tr: -2, bpm: -8 }, jungle: { tr: 3, bpm: -4 }, space: { tr: 5, bpm: 10 } };
  function mapMus() { return MAPMUS[curMap] || MAPMUS.park; }
  function bpm() { return M.mode === 'menu' ? 96 : 118 + M.intensity * 34 + mapMus().bpm; }

  function mNote(type, f, t, dur, vol, cut, atk, det) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = f; if (det) o.detune.value = det;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t + (atk || 0.01));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o;
    if (cut) { const f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = cut; o.connect(f2); n = f2; }
    n.connect(g); g.connect(musicBus);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function mNoise(t, dur, vol, freq, type) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(musicBus);
    s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  function kick(t, vol) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.25);
  }
  function snare(t, vol) {
    mNoise(t, 0.16, vol, 1800, 'bandpass');
    mNote('triangle', 190, t, 0.1, vol * 0.7, 0, 0.002);
  }

  function playStep(t, s, b) {
    const I = M.intensity, sd = 60 / bpm() / 4, ch0 = CHORDS[b % 8], tr = M.mode === 'menu' ? 0 : mapMus().tr, ch = { r: ch0.r + tr, m: ch0.m }, iv = ch.m ? [0, 3, 7] : [0, 4, 7];

    /* calm theme for the "Ready?" screen: just pad + soft arpeggio */
    if (M.mode === 'menu') {
      if (s === 0) {
        iv.forEach(function (x) { mNote('sawtooth', mtof(ch.r + 24 + x), t, sd * 16, 0.045, 900, 0.4, (x - 3) * 4); });
        mNote('sine', mtof(ch.r), t, sd * 14, 0.2, 0, 0.05);
      }
      if (s % 2 === 0) mNote('triangle', mtof(ch.r + 36 + [0, iv[1], iv[2], 12][(s / 2) % 4]), t, sd * 2.2, 0.05, 2500, 0.01);
      return;
    }

    /* drums */
    if (I < 0.25) { if (s === 0 || s === 8) kick(t, 0.9); }
    else {
      if (s % 4 === 0) kick(t, s === 0 ? 1 : 0.85);
      if (s === 4 || s === 12) snare(t, 0.32);
      if (I > 0.7 && s === 14) kick(t, 0.5);
    }
    if (b % 4 === 3 && s >= 12 && I > 0.45) snare(t, 0.14 + (s - 12) * 0.07);          // drum roll into the next phrase
    if (I > 0.3 && s === 0 && b % 4 === 0) mNoise(t, 1.1, 0.12, 6500, 'highpass');       // crash cymbal
    if (I > 0.15 && s % 2 === 0) mNoise(t, 0.04, s % 4 === 2 ? 0.1 : 0.06, 8000, 'highpass');
    if (I > 0.6 && s % 2 === 1) mNoise(t, 0.03, 0.04, 9000, 'highpass');

    /* bass: steady 8th notes with octave jumps (quarter notes when calm) */
    const bassStep = I < 0.3 ? (s % 4 === 0) : (s % 2 === 0);
    if (bassStep) {
      const up = (s === 6 || s === 14) && I >= 0.3;
      const f = mtof(ch.r + (up ? 12 : 0));
      mNote('sawtooth', f, t, sd * 1.8, (s % 8 === 0 ? 0.3 : 0.22), 380 + I * 300, 0.005);
      mNote('sine', f / 2 > 30 ? f / 2 : f, t, sd * 1.8, 0.28, 0, 0.005);
    }

    /* pad (strings): one long chord per bar */
    if (s === 0 && I > 0.2) iv.forEach(function (x) { mNote('sawtooth', mtof(ch.r + 24 + x), t, sd * 16, 0.04 + I * 0.03, 1100, 0.3, (x - 3) * 5); });

    /* fast arpeggio when it gets intense */
    if (I > 0.6) mNote('square', mtof(ch.r + 36 + [0, iv[1], iv[2], 12][s % 4]), t, sd * 0.9, 0.028, 3200, 0.004);

    /* heroic lead tune */
    if (I >= 0.35) {
      LEAD[b % 8].forEach(function (n) {
        if (n[0] !== s) return;
        const f = mtof(n[1] + tr), len = sd * n[2] * 0.95, v = (b % 8 >= 4 ? 0.075 : 0.06);
        mNote('sawtooth', f, t, len, v, 3800, 0.012, -7);
        mNote('sawtooth', f, t, len, v, 3800, 0.012, 7);
        mNote('square', f * 2, t, len * 0.7, v * 0.25, 4500, 0.012, 0);
      });
    }
  }

  function schedule() {
    if (!ctx || !M.running || M.paused || trackSrc) return;      // a recorded track is playing: nothing to compose
    try {
      const now = ctx.currentTime;
      if (M.nextT < now - 0.4) M.nextT = now + 0.05;            // computer stalled: skip ahead instead of racing to catch up
      while (M.nextT < now + 0.25) {
        if (M.step === 0) M.intensity += (M.target - M.intensity) * 0.6;   // change feel only at the start of a bar
        playStep(M.nextT, M.step, M.bar);
        M.nextT += 60 / bpm() / 4;
        M.steps++;
        if (++M.step >= 16) { M.step = 0; M.bar = (M.bar + 1) % 8; }
      }
    } catch (e) { /* never let music break the game */ }
  }

  function fadeTo(v, tc) { if (musicBus) musicBus.gain.setTargetAtTime(v, ctx.currentTime, tc || 0.2); }
  function level() { return (musicOn ? musicVol : 0) * 0.55 * (M.muffled ? 0.55 : 1); }

  /* what the announcer says */
  const ANN = { go: 'Fight!', first: 'First blood!', k2: 'Double kill!', k3: 'Triple kill!', k4: 'Rampage!', min1: 'One minute left!', last: 'Ten seconds!', win: 'Victory! Your team wins!', lose: 'Defeat. Better luck next time!', draw: 'It is a draw!', streak: 'Unstoppable!', saved: 'We are saved!', planted: 'The bomb has been planted!', defused: 'The bomb has been defused!', rbwin: 'Round won!', captured: 'Flag captured!' };
  let announceOn = true, annLast = 0;

  const music = {
    /* mode: 'menu' (calm) or 'play' (epic) */
    start: function (mode) {
      if (!musicOn || !ensure()) return;
      try {
        clearInterval(M.timer); stopTrack(0);
        M.mode = mode || 'play'; M.running = true; M.paused = false;
        M.step = 0; M.bar = 0; M.nextT = ctx.currentTime + 0.1;
        M.intensity = M.target = (M.mode === 'menu' ? 0.1 : 0.4);
        fadeTo(level(), 0.15);
        if (M.mode === 'play' && trackBuf && trackOn) startTrack();          // the recorded match music
        M.timer = setInterval(schedule, 40);
      } catch (e) { /* stay silent */ }
    },
    stop: function (fade) {
      if (!ctx) return;
      try {
        M.running = false; fadeTo(0, fade || 0.1); stopTrack(((fade || 0.1) * 1000) + 400);
        const t = M.timer; setTimeout(function () { if (!M.running) clearInterval(t); }, 800);
      } catch (e) { /* ignore */ }
    },
    pause: function () { if (!ctx || !M.running) return; M.paused = true; fadeTo(0, 0.05); },
    resume: function () { if (!ctx || !M.running || !M.paused) return; M.paused = false; M.nextT = ctx.currentTime + 0.1; fadeTo(level(), 0.1); },
    /* 0 = calm ... 1 = full battle */
    setIntensity: function (x) { M.target = Math.max(0, Math.min(1, x)); },
    /* soft + muffled while a question is open */
    muffle: function (on) {
      if (!ctx || M.muffled === !!on) return;
      M.muffled = !!on;
      try {
        musicFilter.frequency.setTargetAtTime(on ? 700 : 18000, ctx.currentTime, 0.15);
        if (M.running && !M.paused) fadeTo(level(), 0.15);
      } catch (e) { /* ignore */ }
    },
    debug: function () { return { running: M.running, paused: M.paused, mode: M.mode, bar: M.bar, steps: M.steps, bpm: Math.round(bpm()), intensity: +M.intensity.toFixed(2), muffled: M.muffled }; }
  };

  ES.audio = {
    unlock: function () { ensure(); },
    music: music,
    /* The announcer: a deep computer voice from the browser itself (no sound files needed). */
    setAnnouncer: function (on) { announceOn = !!on; if (!on) { try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ } } },
    announce: function (key, text) {
      try {
        const txt = text || ANN[key];
        if (!announceOn || !sfxOn || !txt || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
        const now = performance.now();
        if (now - annLast < 1300 && key !== 'win' && key !== 'lose' && key !== 'saved') return;      // never talk over yourself
        annLast = now;
        const u = new SpeechSynthesisUtterance(txt);
        u.pitch = 0.55; u.rate = 0.92; u.volume = Math.min(1, 0.55 + sfxVol * 0.5);
        const vs = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
        const v = vs.filter(function (x) { return /^en/i.test(x.lang); })[0]; if (v) u.voice = v;
        window.speechSynthesis.cancel(); window.speechSynthesis.speak(u);
      } catch (e) { /* the announcer is optional */ }
    },
    /* tell the music which map is being played (call before music.start) */
    setMap: function (id) {
      curMap = id || 'park'; wantTrack = true;
      if (mapTrackFile() !== trackFile) { trackBuf = null; trackTried = false; }
      loadTrack();
    },
    setEnabled: function (on) { sfxOn = !!on; },                       // sound effects on/off
    setScream: function (on) { screamOn = !!on; },
    setTrackMusic: function (on) { trackOn = !!on; if (trackOn) loadTrack(); else { stopTrack(0); trackBuf = null; trackTried = false; } },   // recorded match music on/off (off frees its memory)                      // the tagged-out scream on/off
    setMusicEnabled: function (on) {
      musicOn = !!on;
      if (!ctx) return;
      if (!musicOn) music.stop(0.1); else if (M.mode && !M.running) { /* game restarts it when needed */ }
    },
    setMusicVolume: function (v) { musicVol = Math.max(0, Math.min(1, v)); if (ctx && M.running && !M.paused) fadeTo(level(), 0.05); },
    setSfxVolume: function (v) { sfxVol = Math.max(0, Math.min(1, v)); if (sfxBus) sfxBus.gain.setTargetAtTime(sfxVol * 0.7, ctx.currentTime, 0.03); },
    isMusicOn: function () { return musicOn; },
    isSfxOn: function () { return sfxOn; },
    sfx: function (name, v, pan) {
      try {
        if (!sfxOn) return;
        if (name === 'scream' && !screamOn) return;
        const vol = v === undefined ? 1 : v, cfg = (ES.SOUND_FILES || {})[name];
        if (cfg && samples[name] && samples[name].length) {                       // a real recording exists for this event
          const ok = playSample(name, vol, pan || 0);
          if (ok && !cfg.layer) return;                                            // replaces the built-in sound
        }
        if (SFX[name]) SFX[name](vol, pan || 0);
      } catch (e) { /* stay silent */ }
    },
    /* loudness check used by automatic tests: returns peak 0..1 of what is playing right now */
    peak: function () {
      if (!analyser) return 0;
      const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
      let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p;
    }
  };
})();
