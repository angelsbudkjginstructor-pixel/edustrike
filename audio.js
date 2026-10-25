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
  let sfxOn = true, musicOn = true, sfxVol = 0.8, musicVol = 0.6;

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

  function bpm() { return M.mode === 'menu' ? 96 : 118 + M.intensity * 34; }

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
    const I = M.intensity, sd = 60 / bpm() / 4, ch = CHORDS[b % 8], iv = ch.m ? [0, 3, 7] : [0, 4, 7];

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
        const f = mtof(n[1]), len = sd * n[2] * 0.95, v = (b % 8 >= 4 ? 0.075 : 0.06);
        mNote('sawtooth', f, t, len, v, 3800, 0.012, -7);
        mNote('sawtooth', f, t, len, v, 3800, 0.012, 7);
        mNote('square', f * 2, t, len * 0.7, v * 0.25, 4500, 0.012, 0);
      });
    }
  }

  function schedule() {
    if (!ctx || !M.running || M.paused) return;
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

  const music = {
    /* mode: 'menu' (calm) or 'play' (epic) */
    start: function (mode) {
      if (!musicOn || !ensure()) return;
      try {
        clearInterval(M.timer);
        M.mode = mode || 'play'; M.running = true; M.paused = false;
        M.step = 0; M.bar = 0; M.nextT = ctx.currentTime + 0.1;
        M.intensity = M.target = (M.mode === 'menu' ? 0.1 : 0.4);
        fadeTo(level(), 0.15);
        M.timer = setInterval(schedule, 40);
      } catch (e) { /* stay silent */ }
    },
    stop: function (fade) {
      if (!ctx) return;
      try {
        M.running = false; fadeTo(0, fade || 0.1);
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
    setEnabled: function (on) { sfxOn = !!on; },                       // sound effects on/off
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
      try { if (sfxOn && SFX[name]) SFX[name](v === undefined ? 1 : v, pan || 0); } catch (e) { /* stay silent */ }
    },
    /* loudness check used by automatic tests: returns peak 0..1 of what is playing right now */
    peak: function () {
      if (!analyser) return 0;
      const d = new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(d);
      let p = 0; for (let i = 0; i < d.length; i++) p = Math.max(p, Math.abs(d[i])); return p;
    }
  };
})();
