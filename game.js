/* EduStrike - the game itself (Stage 1: offline Team Battle against bots).
   Contents: setup + render loop, player controls, blaster, damage/respawn,
   question-to-ammo panel, HUD, pause/end screens.
   SAFETY CHECKS you will see below:
   - WebGL start-up is in try/catch (shows a friendly message if the PC cannot draw 3D)
   - questions can never repeat until all are used, cannot be farmed (ammo cap + cooldown)
   - every timer/listener is cleaned up in stop(), so "Play again" never doubles up
   - the loop clamps big time jumps (dt) so a slow frame can never teleport anyone through a wall */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const T = window.THREE;
  const $ = function (id) { return document.getElementById(id); };
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const G = (ES.game = { active: false });
  const P = ES.PLAYER, AMMO = ES.AMMO;

  /* ---------- module state ---------- */
  let st, gfx, renderer, scene, camera, world, canvas;
  let ents, player, S, quiz;
  let raf = 0, lastT = 0;
  let keys = {}, yaw = 0, pitch = 0, fireHeld = false, rightDown = false, locked = false;
  let tracers = [], sparks = [], tracerI = 0, gun, muzzle, shared;
  let crates = [], crateClock = 0;      // weapon crates lying on the map
  let radarBase, radarCtx, radarT = 0, hudT = 0;
  let fpsFrames = 0, fpsTime = 0, fpsSlowT = 0, fpsTipShown = false;
  let toastT = 0, closeTimer = 0, relockTimer = 0;
  let sunLight = null, rings = [], ringI = 0, outlineMeshes = [], namesAll = false;
  let MFX = null, FXD = null;           // map effect: MFX = the floating particles (3D), FXD = the effect numbers for this map (ES.MAP_FX)
  let NET = null;                       // set while playing a CLASS match (null = solo vs bots)
  let RB = null, RBV = null;            // Rescue & Bomb mode: RB = the rules engine (rb.js), RBV = the 3D pieces (null in normal mode)
  const myTeam = function () { return NET ? NET.team : 0; };
  const r2 = function (v) { return Math.round(v * 100) / 100; };
  const netSend = function (m) { return ES.session ? ES.session.send(m) : false; };
  const cache = {};

  function setText(id, v) { if (cache[id] !== v) { cache[id] = v; const el = $(id); if (el) el.textContent = v; } }
  function show(id, on) { const el = $(id); if (el) el.classList.toggle('hidden', !on); }
  function toast(msg, secs) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = secs || 2; }

  /* =====================================================================
     START / STOP
     ===================================================================== */
  G.start = function (opts) {
    if (G.active) G.stop();
    st = JSON.parse(JSON.stringify(ES.settings));
    NET = (opts && opts.net) ? { team: opts.net.team, you: opts.net.you, byEid: {}, sendT: 0, cdLast: 99, hostPh: 'wait', rows: null } : null;
    st.gfx = ES.gfxKey(st.gfx);
    if (opts && opts.net && opts.net.gfx && ES.GFX[ES.gfxKey(opts.net.gfx)]) st.gfx = ES.gfxKey(opts.net.gfx);      // the teacher can make everybody use one graphics level
    gfx = Object.assign({}, ES.GFX[st.gfx] || ES.GFX.low);       // a copy: a slow computer may step this down while playing
    G.level = st.gfx;
    G.downgraded = false; outlineMeshes = []; rings = []; ringI = 0;
    namesAll = !!(opts && opts.net && opts.net.names === 'all');      // teacher setting: show every player's name

    const wrap = $('gl-wrap');
    wrap.innerHTML = '';
    canvas = document.createElement('canvas');
    canvas.id = 'gl';
    wrap.appendChild(canvas);
    try {
      renderer = new T.WebGLRenderer({ canvas: canvas, antialias: gfx.aa, powerPreference: 'high-performance' });
    } catch (err) {
      return { ok: false, error: 'This computer could not start 3D graphics (WebGL). Try Chrome, update the browser, or ask your teacher to check "hardware acceleration" in Chrome settings.' };
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, gfx.maxPR) * gfx.scale);
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    if (gfx.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = gfx.soft ? T.PCFSoftShadowMap : T.PCFShadowMap; }
    if (gfx.real && T.ACESFilmicToneMapping) { renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 0.95; }   // film-like colours

    /* scene: sky gradient, fog, lights */
    scene = new T.Scene();
    const mapId = (opts && opts.net && opts.net.map) || st.map;
    const SKY = (ES.MAP_SKY && ES.MAP_SKY[mapId]) || null;       // night / jungle sky, or null = normal sunny sky
    const sc = document.createElement('canvas'); sc.width = 2; sc.height = 128;
    const sx = sc.getContext('2d'), grad = sx.createLinearGradient(0, 0, 0, 128);
    if (SKY) { grad.addColorStop(0, SKY.top); grad.addColorStop(0.55, SKY.mid); grad.addColorStop(1, SKY.bot); }
    else { grad.addColorStop(0, '#5db7ff'); grad.addColorStop(0.6, '#bfe6ff'); grad.addColorStop(1, '#eaf7ff'); }
    sx.fillStyle = grad; sx.fillRect(0, 0, 2, 128);
    const skyTex = new T.CanvasTexture(sc);
    if (T.SRGBColorSpace) skyTex.colorSpace = T.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new T.Fog(SKY ? SKY.fog : (gfx.real ? 0xd8e6f0 : 0xcfeaff), (SKY && SKY.fogNear) || (gfx.real ? 45 : 22), SKY && SKY.fogFar ? Math.min(SKY.fogFar, gfx.fog) : gfx.fog);
    scene.add(new T.HemisphereLight(SKY ? SKY.hemiSky : 0xffffff, SKY ? SKY.hemiGround : 0x8fae7a, SKY && SKY.stars ? (gfx.real ? 2.3 : 1.6) : (gfx.real ? 1.2 : 2.1)));
    const sun = sunLight = new T.DirectionalLight(SKY ? SKY.sun : 0xfff4e0, gfx.real ? 2.2 : 1.6);
    if (SKY && SKY.stars) {                                       // a cheap field of stars (one Points object, 260 dots)
      const sp = new Float32Array(260 * 3);
      for (let i = 0; i < 260; i++) { const a = Math.random() * 6.283, el = 0.15 + Math.random() * 1.3, r = 120; sp[i * 3] = Math.cos(a) * Math.cos(el) * r; sp[i * 3 + 1] = Math.sin(el) * r; sp[i * 3 + 2] = Math.sin(a) * Math.cos(el) * r; }
      const sg = new T.BufferGeometry(); sg.setAttribute('position', new T.BufferAttribute(sp, 3));
      const stars = new T.Points(sg, new T.PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false, fog: false }));
      stars.frustumCulled = false; scene.add(stars);
    }
    sun.position.set(25, 45, 15);
    if (gfx.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(gfx.shadowSize || 1024, gfx.shadowSize || 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
      const c = sun.shadow.camera; c.left = -42; c.right = 42; c.top = 42; c.bottom = -42; c.near = 5; c.far = 120;
    }
    scene.add(sun);
    if (gfx.fx && !(SKY && SKY.stars)) {                          // Ultra: a soft glow around the sun, and a gentle dark edge on the screen
      const gc = document.createElement('canvas'); gc.width = gc.height = 128;
      const gx = gc.getContext('2d'), gg = gx.createRadialGradient(64, 64, 0, 64, 64, 64);
      gg.addColorStop(0, 'rgba(255,248,220,1)'); gg.addColorStop(0.18, 'rgba(255,236,170,.55)'); gg.addColorStop(1, 'rgba(255,220,140,0)');
      gx.fillStyle = gg; gx.fillRect(0, 0, 128, 128);
      const glowSpr = new T.Sprite(new T.SpriteMaterial({ map: new T.CanvasTexture(gc), blending: T.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: 0.85 }));
      glowSpr.position.copy(sun.position).normalize().multiplyScalar(170); glowSpr.scale.set(90, 90, 1); scene.add(glowSpr);
      const vg = document.createElement('div');
      vg.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 62%,rgba(0,0,0,.38) 100%)';
      wrap.appendChild(vg);
    }

    camera = new T.PerspectiveCamera(st.fov, window.innerWidth / window.innerHeight, 0.05, gfx.far || 140);
    scene.add(camera);

    world = ES.buildWorld(scene, { fancy: !!gfx.world, real: !!gfx.real, bump: !!gfx.bump, texSize: gfx.texSize || 1024, map: (opts && opts.net && opts.net.map) || st.map });
    buildShared();
    buildGun();
    buildEffects();
    buildCrates();
    buildMapFx(world.map);

    /* ---- create the fighters ---- */
    ents = [];
    if (NET) {
      /* class match: the referee (teacher's page) told us who is playing */
      opts.net.ents.forEach(function (d) {
        const e = makeEnt(d.team, d.name, d.eid === NET.you, 'normal');
        e.eid = d.eid; e.isBot = false; e.isRemote = d.eid !== NET.you; e.seen = false; e.tx = 0; e.ty = 0; e.tz = 0; e.tyaw = 0;
        NET.byEid[d.eid] = e; ents.push(e);
        if (e.isPlayer) player = e;
      });
      ents.forEach(function (e) { if (!e.isPlayer) { e.mesh = buildBotMesh(e); e.mesh.visible = false; scene.add(e.mesh); } });
      player.x = opts.net.x; player.z = opts.net.z; player.y = 0; player.yaw = opts.net.yaw; yaw = opts.net.yaw; pitch = 0;
    } else {
      player = makeEnt(0, st.name || 'Cadet', true, 'normal');
      ents.push(player);
      const names = [ES.BOT_NAMES[0].slice(), ES.BOT_NAMES[1].slice()];
      for (let i = 1; i < st.botsPerTeam; i++) ents.push(makeEnt(0, names[0].shift() || 'Ally' + i, false, 'normal'));
      for (let i = 0; i < st.botsPerTeam; i++) ents.push(makeEnt(1, names[1].shift() || 'Foe' + i, false, st.diff));
      const used = [[], []];
      ents.forEach(function (e) {
        if (!e.isPlayer) { e.mesh = buildBotMesh(e); scene.add(e.mesh); }
        placeAtSpawn(e, used);
      });
    }

    quiz = ES.createQuiz(st, NET ? opts.net.topics : null);
    G.world = world; G.ents = ents; G.player = player;   // the bot brains read these
    /* ---- Rescue & Bomb mode (solo menu choice, or the teacher's choice in a class match) ---- */
    RB = null; RBV = null; G.rb = null;
    const rbMode = NET ? (opts.net.mode === 'rb') : (st.mode === 'rb');
    if (rbMode && world.rbSpots) {
      const rc = ES.rbClean(NET ? opts.net.rounds : st.rbRounds, NET ? opts.net.rtime : st.rbMinutes);
      if (!NET) ents.forEach(function (e, i) { e.eid = i; });                    // solo: the player is 0, the bots follow
      RB = { eng: ES.createRB({ rounds: rc.rounds, minutes: rc.minutes, spots: world.rbSpots, ents: function () { return ents; }, hook: NET ? null : rbHook }), cfg: rc };
      if (!NET) G.rb = RB.eng;                                                   // bots read the rules from here
    }

    S = {
      phase: 'ready', paused: false, qOpen: false, qState: '', cur: null, qTime: 0, qCd: 0,
      total: RB ? RB.cfg.minutes * 60 : (NET ? opts.net.minutes : st.minutes) * 60, timeLeft: RB ? RB.cfg.minutes * 60 : (NET ? opts.net.minutes : st.minutes) * 60, score: [0, 0], target: NET ? opts.net.target : st.targetKills,
      ammo: AMMO.start, fireCd: 0, sinceHurt: 99, streak: 0, countT: 0,
      weapon: 'pistol', wAmmo: 0, wTime: 0, crMask: 0, crSeen: 0, crClock: null,
      feed: [], dmgFlash: 0, hitMark: 0, recoil: 0, muzzleT: 0,
      qMission: '', qMax: 0, bannerT: 0, fxT: 3.2, airJ: 0, spaceWas: false,
      stats: { kills: 0, deaths: 0, shots: 0, hits: 0, heads: 0, qAsked: 0, qRight: 0, bySubj: {}, missed: [] },
      reason: '', fpsMin: 999, fpsSum: 0, fpsN: 0
    };
    Object.keys(cache).forEach(function (k) { delete cache[k]; });
    keys = {}; fireHeld = false; rightDown = false; yaw = 0; pitch = 0; fpsTipShown = false; fpsSlowT = 0;

    /* radar background drawn once */
    radarBase = document.createElement('canvas'); radarBase.width = radarBase.height = 132;
    world.drawRadarBase(radarBase.getContext('2d'), 132);
    radarCtx = $('radar').getContext('2d');
    if (RB) buildRB();

    addListeners();
    resetHudViews();
    G.active = true;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    ES.audio.setMap(world.map);     // each map has its own music flavour
    ES.audio.music.start('menu');   // calm theme until the player clicks Start
    return { ok: true, pool: quiz.size, fallback: quiz.usedFallback };
  };

  G.stop = function () {
    if (!G.active && !renderer) return;
    G.active = false; NET = null; RB = null; RBV = null; G.rb = null; MFX = null; FXD = null;
    ES.audio.music.muffle(false); ES.audio.music.stop(0.15);
    cancelAnimationFrame(raf);
    clearTimeout(closeTimer); clearTimeout(relockTimer);
    removeListeners();
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    try {
      scene.traverse(function (o) {
        if (o.geometry && !o.userData.shared) o.geometry.dispose();
        if (o.material && !o.userData.shared) { (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.dispose(); }); }
      });
      if (shared) { Object.keys(shared).forEach(function (k) { if (shared[k] && shared[k].dispose) shared[k].dispose(); }); }
      if (world) world.dispose();
      renderer.dispose();
      if (renderer.forceContextLoss) renderer.forceContextLoss();
    } catch (e) { /* ignore - leaving the game must never fail */ }
    renderer = null; scene = null; world = null; shared = null;
    const wrap = $('gl-wrap'); if (wrap) wrap.innerHTML = '';
    ['ov-ready', 'ov-pause', 'ov-count', 'ov-death', 'qp', 'ov-end', 'scoreboard', 'ov-round', 'rb-bar', 'rb-hint'].forEach(function (id) { show(id, false); });
  };

  /* =====================================================================
     BUILDING THE FIGHTERS
     ===================================================================== */
  function makeEnt(team, name, isPlayer, diffKey) {
    return {
      name: name, team: team, isPlayer: isPlayer, isBot: !isPlayer,
      x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, hp: P.hp, alive: true, protT: 0, flashT: 0,
      kills: 0, deaths: 0, respawnT: 0, speed: 0, onGround: true, mesh: null,
      D: ES.DIFF[diffKey] || ES.DIFF.normal,
      // bot brain fields
      state: 'roam', path: null, pi: 0, scanT: Math.random() * 0.2, target: null, sees: false, reactT: 0, fireT: Math.random(),
      ammo: (ES.DIFF[diffKey] || ES.DIFF.normal).mag, ansT: 0, lostT: 0, lastSeen: null, strafeT: 0, strafeDir: 1,
      stuckT: 0, sx: 0, sz: 0, repathT: 0, alert: 0, phase: Math.random() * 6, deathT: 0
    };
  }

  function mergeBoxes(list) {
    const pos = [], nor = [], col = [], tmp = new T.Color();
    list.forEach(function (b) {
      const g = new T.BoxGeometry(b.w, b.h, b.d).toNonIndexed();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      tmp.set(b.c);
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i] + b.x, p[i + 1] + b.y, p[i + 2] + b.z); nor.push(n[i], n[i + 1], n[i + 2]); col.push(tmp.r, tmp.g, tmp.b);
      }
      g.dispose();
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return geo;
  }

  /* Fancy: merge round shapes (capsules, balls, cylinders) into one vertex-coloured geometry */
  function mergeParts(list) {
    const pos = [], nor = [], col = [], tmp = new T.Color();
    list.forEach(function (b) {
      let g = b.g;
      if (b.rx) g.rotateX(b.rx);
      if (b.sx || b.sy || b.sz) g.scale(b.sx || 1, b.sy || 1, b.sz || 1);
      g = g.toNonIndexed();
      const p = g.attributes.position.array, n = g.attributes.normal.array;
      tmp.set(b.c);
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i] + (b.x || 0), p[i + 1] + (b.y || 0), p[i + 2] + (b.z || 0)); nor.push(n[i], n[i + 1], n[i + 2]); col.push(tmp.r, tmp.g, tmp.b);
      }
      g.dispose();
    });
    const geo = new T.BufferGeometry();
    geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new T.Float32BufferAttribute(col, 3));
    return geo;
  }
  /* High / Ultra: realistic soldiers, built once and shared by everybody (so 30 fighters still cost little).
     Muted army colours, with the TEAM colour on helmet, vest and backpack stripe so you can still tell teams apart. */
  function buildRealShared() {
    const fat = 0x3d4636, fat2 = 0x2f362a, dark = 0x22262c, skin = 0xd2a07a, gunC = 0x1d2127, boot = 0x15181c, ULTRA = !!gfx.fx;
    const seg = ULTRA ? 10 : 7;
    [0, 1].forEach(function (team) {
      const base = new T.Color(ES.TEAMS[team].color), tc = base.clone().multiplyScalar(0.82).getHex(), lens = team === 0 ? 0x9fe8ff : 0xffc08a;
      const parts = [
        { g: new T.BoxGeometry(0.5, 0.52, 0.28), y: 1.13, c: fat },                                  // torso
        { g: new T.BoxGeometry(0.54, 0.42, 0.33), y: 1.2, c: tc },                                   // tactical vest (team colour)
        { g: new T.BoxGeometry(0.3, 0.17, 0.03), y: 1.26, z: -0.18, c: dark },                       // chest plate
        { g: new T.BoxGeometry(0.12, 0.12, 0.07), x: -0.14, y: 1.02, z: -0.18, c: dark },            // ammo pouches
        { g: new T.BoxGeometry(0.12, 0.12, 0.07), x: 0.14, y: 1.02, z: -0.18, c: dark },
        { g: new T.BoxGeometry(0.52, 0.07, 0.31), y: 0.9, c: dark },                                 // belt
        { g: new T.BoxGeometry(0.46, 0.14, 0.27), y: 0.83, c: fat },                                 // hips
        { g: new T.CylinderGeometry(0.07, 0.08, 0.1, 8), y: 1.43, c: skin },                         // neck
        { g: new T.SphereGeometry(0.15, seg + 3, seg), y: 1.56, sy: 1.1, c: skin },                  // head
        { g: new T.BoxGeometry(0.22, 0.1, 0.2), y: 1.5, z: -0.04, c: dark },                         // face cover
        { g: new T.SphereGeometry(0.2, seg + 4, seg, 0, Math.PI * 2, 0, Math.PI * 0.58), y: 1.6, c: tc },   // helmet (team colour)
        { g: new T.CylinderGeometry(0.21, 0.21, 0.03, seg + 4), y: 1.6, c: fat2 },                   // helmet rim
        { g: new T.BoxGeometry(0.24, 0.06, 0.05), y: 1.6, z: -0.17, c: dark },                       // goggles
        { g: new T.BoxGeometry(0.2, 0.035, 0.02), y: 1.6, z: -0.2, c: lens },
        { g: new T.BoxGeometry(0.36, 0.44, 0.16), y: 1.18, z: 0.25, c: fat2 },                       // backpack
        { g: new T.BoxGeometry(0.1, 0.3, 0.02), y: 1.2, z: 0.335, c: tc },                           // team stripe on the backpack
        { g: new T.CapsuleGeometry(0.065, 0.26, 2, 6), rx: Math.PI / 2, x: 0.27, y: 1.18, z: -0.14, c: fat },   // right arm
        { g: new T.SphereGeometry(0.07, 6, 5), x: 0.25, y: 1.13, z: -0.34, c: dark },                // glove
        { g: new T.BoxGeometry(0.01, 0.01, 0.01), x: 0.25, y: 1.2, z: -0.5, c: dark }                  // (the rifle is a separate model, see buildSoldierGuns)
      ];
      if (ULTRA) parts.push(
        { g: new T.BoxGeometry(0.16, 0.08, 0.2), x: -0.3, y: 1.4, c: tc },                           // shoulder pads
        { g: new T.BoxGeometry(0.16, 0.08, 0.2), x: 0.3, y: 1.4, c: tc },
        { g: new T.CylinderGeometry(0.008, 0.008, 0.4, 4), x: -0.12, y: 1.62, z: 0.3, c: dark },     // radio antenna
        { g: new T.BoxGeometry(0.08, 0.1, 0.05), x: 0, y: 1.1, z: -0.2, c: fat2 });                  // radio on the chest
      shared['rbody' + team] = mergeParts(parts);
      shared['rarm' + team] = mergeParts([                                                          // left arm swings: pivot at the shoulder
        { g: new T.CapsuleGeometry(0.065, 0.26, 2, 6), y: -0.2, c: fat },
        { g: new T.SphereGeometry(0.07, 6, 5), y: -0.42, c: dark }
      ]);
    });
    shared.rleg = mergeParts([                                                                      // legs swing: pivot at the hip
      { g: new T.CapsuleGeometry(0.095, 0.4, 2, 6), y: -0.3, c: fat },
      { g: new T.BoxGeometry(0.15, 0.12, 0.05), y: -0.44, z: -0.08, c: dark },                      // knee pad
      { g: new T.BoxGeometry(0.2, 0.16, 0.32), y: -0.74, z: -0.04, c: boot }                        // boot
    ]);
    shared.rMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, metalness: 0.08 });
  }

  /* Geometry/textures that all bots share (so 12 bots cost almost nothing extra) */
  function buildShared() {
    shared = {};
    [0, 1].forEach(function (team) {
      const c = ES.TEAMS[team].color;
      shared['body' + team] = mergeBoxes([
        { x: 0, y: 1.1, z: 0, w: 0.56, h: 0.6, d: 0.34, c: c },
        { x: 0, y: 0.82, z: 0, w: 0.58, h: 0.08, d: 0.36, c: 0x2b3550 },
        { x: 0, y: 1.6, z: 0, w: 0.36, h: 0.34, d: 0.34, c: 0xf2f4f8 },
        { x: 0, y: 1.6, z: -0.18, w: 0.3, h: 0.14, d: 0.04, c: 0x1d2b4f },
        { x: 0, y: 1.86, z: 0, w: 0.05, h: 0.18, d: 0.05, c: c },
        { x: -0.36, y: 1.1, z: -0.05, w: 0.14, h: 0.5, d: 0.14, c: c },
        { x: 0.36, y: 1.1, z: -0.12, w: 0.14, h: 0.4, d: 0.3, c: c },
        { x: 0.3, y: 1.08, z: -0.05, w: 0.1, h: 0.12, d: 0.1, c: 0x2a2f3a }
      ]);
    });
    shared.leg = new T.BoxGeometry(0.18, 0.8, 0.2); shared.leg.translate(0, -0.4, 0);
    shared.blob = new T.CircleGeometry(0.55, 10); shared.blob.rotateX(-Math.PI / 2);
    shared.blobMat = new T.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false });
    shared.legMat = new T.MeshLambertMaterial({ color: 0x2b3550 });
    // "?" bubble shown above a bot that is answering a question
    const qc = document.createElement('canvas'); qc.width = qc.height = 64;
    const q2 = qc.getContext('2d');
    q2.fillStyle = '#fff'; q2.beginPath(); q2.arc(32, 32, 28, 0, 7); q2.fill();
    q2.lineWidth = 4; q2.strokeStyle = '#ff8a1f'; q2.stroke();
    q2.fillStyle = '#ff8a1f'; q2.font = 'bold 44px sans-serif'; q2.textAlign = 'center'; q2.textBaseline = 'middle'; q2.fillText('?', 32, 35);
    shared.bubbleTex = new T.CanvasTexture(qc);
    shared.bubbleMat = new T.SpriteMaterial({ map: shared.bubbleTex, depthTest: false });
    if (gfx.real) buildRealShared();
    buildSoldierGuns();
  }

  function makeNameSprite(name, css, seeThroughWalls) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = css; x.globalAlpha = 0.85;
    x.beginPath(); x.moveTo(20, 6); x.lineTo(236, 6); x.quadraticCurveTo(250, 6, 250, 20); x.lineTo(250, 44); x.quadraticCurveTo(250, 58, 236, 58); x.lineTo(20, 58); x.quadraticCurveTo(6, 58, 6, 44); x.lineTo(6, 20); x.quadraticCurveTo(6, 6, 20, 6); x.fill();
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 34);
    const tex = new T.CanvasTexture(c);
    const spr = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: !seeThroughWalls, transparent: true }));   // teammates show through walls, enemies' names do not (fair play)
    spr.scale.set(1.7, 0.42, 1);
    return spr;
  }

  function buildRealMesh(e) {
    const root = new T.Group();
    const bodyMat = shared.rMat.clone();               // own copy so the "I was hit" flash only lights this soldier
    const body = new T.Mesh(shared['rbody' + e.team], bodyMat);
    const legL = new T.Mesh(shared.rleg, shared.rMat), legR = new T.Mesh(shared.rleg, shared.rMat);
    legL.position.set(-0.12, 0.84, 0); legR.position.set(0.12, 0.84, 0);
    const armL = new T.Mesh(shared['rarm' + e.team], shared.rMat); armL.position.set(-0.3, 1.32, 0);
    [legL, legR, armL].forEach(function (m) { m.userData.shared = true; });
    body.userData.shared = false;
    root.add(body, legL, legR, armL);
    const gunMesh = addSoldierGun(root, true);
    if (gfx.shadows) { body.castShadow = true; legL.castShadow = legR.castShadow = true; armL.castShadow = true; }
    else { const blob = new T.Mesh(shared.blob, shared.blobMat); blob.position.y = 0.04; blob.userData.shared = true; root.add(blob); }
    const bubble = new T.Sprite(shared.bubbleMat); bubble.scale.set(0.75, 0.75, 1); bubble.position.y = 2.45; bubble.visible = false; bubble.userData.shared = true;
    root.add(bubble);
    if (e.team === myTeam() || namesAll) { const nm = makeNameSprite(e.name, ES.TEAMS[e.team].css, e.team === myTeam()); nm.position.y = 2.1; root.add(nm); }
    root.userData = { body: body, bodyMat: bodyMat, legL: legL, legR: legR, armL: armL, bubble: bubble, gunMesh: gunMesh, curW: 'pistol' };
    return root;
  }

  function buildBotMesh(e) {
    if (gfx.real) return buildRealMesh(e);
    const root = new T.Group();
    const bodyMat = new T.MeshLambertMaterial({ vertexColors: true });
    const body = new T.Mesh(shared['body' + e.team], bodyMat);
    body.userData.shared = false;
    const legL = new T.Mesh(shared.leg, shared.legMat), legR = new T.Mesh(shared.leg, shared.legMat);
    legL.position.set(-0.14, 0.8, 0); legR.position.set(0.14, 0.8, 0);
    legL.userData.shared = true; legR.userData.shared = true;
    root.add(body, legL, legR);
    const gunMesh = addSoldierGun(root, false);
    if (gfx.shadows) body.castShadow = true;
    else { const blob = new T.Mesh(shared.blob, shared.blobMat); blob.position.y = 0.04; blob.userData.shared = true; root.add(blob); }
    const bubble = new T.Sprite(shared.bubbleMat); bubble.scale.set(0.75, 0.75, 1); bubble.position.y = 2.7; bubble.visible = false; bubble.userData.shared = true;
    root.add(bubble);
    if (e.team === myTeam() || namesAll) { const nm = makeNameSprite(e.name, ES.TEAMS[e.team].css, e.team === myTeam()); nm.position.y = 2.2; root.add(nm); }
    root.userData = { body: body, bodyMat: bodyMat, legL: legL, legR: legR, bubble: bubble, gunMesh: gunMesh, curW: 'pistol' };
    return root;
  }

  /* ---------- how every weapon looks ----------
     Each gun is a short list of simple shapes: [shape, size..., colour, x, y, z]   (z negative = forward)
       'b' box [w, h, d]   'c' round tube along the barrel [radius, length]   'k' cone pointing forward [radius, length]
     colour 'acc' = the weapon's own colour (yellow / orange / green / red).  k = how much bigger it is on a soldier than in your hands. */
  const GUN_SPECS = {
    rapid: { k: 1.7, muzzle: -0.38, parts: [                       // Rapid Blaster: short, with a long double magazine and yellow stripes
      ['b', 0.07, 0.1, 0.3, 0x30343c, 0, 0, 0], ['c', 0.018, 0.22, 0x1d2127, 0, 0.012, -0.25], ['b', 0.06, 0.06, 0.09, 'acc', 0, 0.012, -0.34],
      ['b', 0.05, 0.22, 0.07, 0x1d2127, 0, -0.15, 0.04], ['b', 0.05, 0.2, 0.07, 0x1d2127, 0, -0.14, -0.06],
      ['b', 0.075, 0.02, 0.22, 'acc', 0, 0.06, -0.02], ['b', 0.05, 0.1, 0.06, 0x252a31, 0, -0.09, 0.16], ['b', 0.06, 0.09, 0.14, 0x2f343c, 0, -0.01, 0.22]] },
    scatter: { k: 1.7, muzzle: -0.56, parts: [                     // Scatter Blaster: a fat shotgun with two barrels and a wooden pump
      ['b', 0.09, 0.11, 0.26, 0x3a3f48, 0, 0, 0.0], ['c', 0.03, 0.52, 0x262a31, -0.032, 0.02, -0.38], ['c', 0.03, 0.52, 0x262a31, 0.032, 0.02, -0.38],
      ['b', 0.1, 0.07, 0.2, 0x6b4423, 0, -0.04, -0.26], ['b', 0.07, 0.11, 0.3, 0x6b4423, 0, -0.02, 0.25], ['b', 0.05, 0.1, 0.06, 0x262a31, 0, -0.09, 0.1],
      ['b', 0.12, 0.03, 0.05, 'acc', 0, 0.02, -0.66], ['b', 0.095, 0.02, 0.1, 'acc', 0, 0.06, 0.0]] },
    sniper: { k: 1.5, muzzle: -0.98, parts: [                      // Sniper Laser: a very long barrel, a big scope and a bipod
      ['b', 0.065, 0.1, 0.4, 0x2a2f38, 0, 0, 0], ['c', 0.016, 0.8, 0x1d2127, 0, 0.015, -0.6], ['b', 0.04, 0.04, 0.06, 'acc', 0, 0.015, -0.99],
      ['c', 0.036, 0.3, 0x15181c, 0, 0.1, -0.06], ['b', 0.05, 0.05, 0.02, 'acc', 0, 0.1, -0.22], ['b', 0.02, 0.05, 0.04, 0x15181c, 0, 0.065, -0.14],
      ['b', 0.015, 0.14, 0.015, 0x1d2127, -0.03, -0.07, -0.55], ['b', 0.015, 0.14, 0.015, 0x1d2127, 0.03, -0.07, -0.55],
      ['b', 0.06, 0.12, 0.3, 0x3a3f33, 0, -0.01, 0.3], ['b', 0.045, 0.12, 0.06, 0x252a31, 0, -0.09, 0.1], ['b', 0.045, 0.1, 0.06, 0x1d2127, 0, -0.09, -0.06]] },
    rocket: { k: 1.3, muzzle: -0.72, parts: [                      // Rocket Blast: a big green tube with a red rocket sticking out
      ['c', 0.065, 0.8, 0x4a5236, 0, 0.02, -0.2], ['c', 0.082, 0.1, 0x353b28, 0, 0.02, 0.2], ['c', 0.07, 0.04, 'acc', 0, 0.02, -0.5],
      ['c', 0.07, 0.04, 'acc', 0, 0.02, -0.05], ['k', 0.05, 0.16, 'acc', 0, 0.02, -0.68], ['b', 0.06, 0.1, 0.14, 0x30343c, 0, -0.1, -0.05],
      ['b', 0.045, 0.1, 0.06, 0x252a31, 0, -0.14, 0.08], ['b', 0.03, 0.06, 0.12, 0x15181c, 0, 0.1, -0.1]] },
    rifle: { k: 1, muzzle: 0, parts: [                             // what a soldier holds with the normal blaster
      ['b', 0.07, 0.1, 0.66, 0x1d2127, 0, 0, -0.24], ['c', 0.018, 0.4, 0x1d2127, 0, 0.02, -0.72], ['b', 0.05, 0.16, 0.07, 0x1d2127, 0, -0.12, -0.2],
      ['b', 0.06, 0.12, 0.22, 0x1d2127, 0, 0.02, 0.16], ['b', 0.03, 0.04, 0.1, 0x22262c, 0, 0.08, -0.32]] }
  };
  function specGeo(sp, k, acc) {                           // one merged soldier-sized model of a gun
    const list = [];
    sp.parts.forEach(function (q) {
      const col = q[q.length - 4] === 'acc' ? acc : q[q.length - 4], x = q[q.length - 3] * k, y = q[q.length - 2] * k, z = q[q.length - 1] * k;
      let g;
      if (q[0] === 'b') g = new T.BoxGeometry(q[1] * k, q[2] * k, q[3] * k);
      else if (q[0] === 'c') { g = new T.CylinderGeometry(q[1] * k, q[1] * k, q[2] * k, 8); g.rotateX(Math.PI / 2); }
      else { g = new T.ConeGeometry(q[1] * k, q[2] * k, 8); g.rotateX(-Math.PI / 2); }
      list.push({ g: g, x: x, y: y, z: z, c: col });
    });
    return mergeParts(list);
  }
  function buildSoldierGuns() {                            // shared by every soldier (so 30 soldiers still cost little)
    shared.wgeo = {};
    shared.wgeo.pistol = specGeo(GUN_SPECS.rifle, 1, 0);
    ES.WEAPON_IDS.forEach(function (id) { shared.wgeo[id] = specGeo(GUN_SPECS[id], GUN_SPECS[id].k, ES.WEAPONS[id].color); });
    shared.wMat = gfx.real ? new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.15 }) : new T.MeshLambertMaterial({ vertexColors: true });
  }
  function addSoldierGun(root, real) {
    const m = new T.Mesh(shared.wgeo.pistol, shared.wMat);
    m.position.set(0.25, real ? 1.12 : 1.08, real ? -0.18 : -0.1); m.userData.shared = true; m.castShadow = !!gfx.shadows;
    root.add(m); return m;
  }
  /* which weapon should this soldier be holding right now? (0 = the normal blaster) */
  function wantWeapon(e) {
    if (e.wShowT > 0 && ES.WEAPONS[e.wShow]) return e.wShow;
    return 'pistol';
  }

  let gunId = '';
  function buildGun() { gunId = ''; mountGun('pistol'); }
  /* put the right gun in your hands (called when you pick up or lose a bonus weapon) */
  function mountGun(id) {
    if (gunId === id) return;
    gunId = id;
    if (gun) { camera.remove(gun); gun.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
    gun = new T.Group();
    const REAL = !!gfx.real, accent = ES.TEAMS[myTeam()].color, spec = GUN_SPECS[id];
    const mat = function (color, metal) {
      return REAL ? new T.MeshStandardMaterial({ color: color, roughness: metal ? 0.45 : 0.7, metalness: metal ? 0.2 : 0.05, depthTest: false })
                  : new T.MeshLambertMaterial({ color: color, depthTest: false });
    };
    const add = function (geo, color, x, y, z, metal) { const m = new T.Mesh(geo, mat(color, metal)); m.position.set(x, y, z); m.renderOrder = 20; gun.add(m); return m; };
    const mk = function (w, h, d, color, x, y, z, metal) { return add(new T.BoxGeometry(w, h, d), color, x, y, z, metal); };
    let muzzleZ;
    if (spec) {                                          // a bonus weapon: its own shape
      const acc = ES.WEAPONS[id].color;
      spec.parts.forEach(function (q) {
        const col = q[q.length - 4] === 'acc' ? acc : q[q.length - 4], x = q[q.length - 3], y = q[q.length - 2], z = q[q.length - 1];
        let g;
        if (q[0] === 'b') g = new T.BoxGeometry(q[1], q[2], q[3]);
        else if (q[0] === 'c') { g = new T.CylinderGeometry(q[1], q[1], q[2], 10); g.rotateX(Math.PI / 2); }
        else { g = new T.ConeGeometry(q[1], q[2], 10); g.rotateX(-Math.PI / 2); }
        add(g, col, x, y, z, q[0] === 'c');
      });
      muzzleZ = spec.muzzle;
    } else if (REAL) {                                   // your normal blaster, a proper rifle shape
      mk(0.07, 0.1, 0.4, 0x4a5260, 0, 0, 0, true);                     // receiver
      mk(0.06, 0.07, 0.3, 0x353b45, 0, 0.0, -0.3, false);              // handguard
      mk(0.026, 0.026, 0.3, 0x2a2f38, 0, 0.012, -0.55, true);          // barrel
      mk(0.05, 0.16, 0.07, 0x1d2127, 0, -0.12, -0.02, false);          // magazine
      mk(0.05, 0.1, 0.06, 0x1d2127, 0, -0.09, 0.14, false);            // grip
      mk(0.06, 0.1, 0.2, 0x3a3f33, 0, -0.01, 0.28, false);             // stock
      mk(0.03, 0.04, 0.1, 0x15181c, 0, 0.07, -0.02, true);             // sight
      mk(0.075, 0.018, 0.12, accent, 0, 0.056, -0.2, false);           // team-colour stripe
      muzzleZ = -0.74;
    } else {
      mk(0.075, 0.1, 0.38, 0x2a3550, 0, 0, 0);
      mk(0.08, 0.03, 0.22, accent, 0, 0.06, -0.04);
      mk(0.04, 0.04, 0.2, 0x1a2035, 0, 0.015, -0.28);
      mk(0.05, 0.12, 0.07, 0x1a2035, 0, -0.1, 0.1);
      mk(0.05, 0.05, 0.03, 0xffe14d, 0, 0.015, -0.39);
      muzzleZ = -0.46;
    }
    const big = id === 'rocket' || id === 'scatter';
    muzzle = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshBasicMaterial({ color: id === 'pistol' ? 0xffe98a : ES.WEAPONS[id].color, transparent: true, opacity: 0.95, depthTest: false, side: T.DoubleSide }));
    muzzle.position.set(0, 0.012, muzzleZ); muzzle.renderOrder = 21; muzzle.visible = false; muzzle.scale.setScalar(big ? 1.6 : 1); gun.add(muzzle);
    if (gfx.fx) {                                        // Ultra: glowing energy strip + bigger muzzle flash
      const glow = new T.Mesh(new T.BoxGeometry(0.03, 0.03, 0.26), new T.MeshBasicMaterial({ color: myTeam() === 0 ? 0x7fe3ff : 0xffb08a, depthTest: false }));
      glow.position.set(0.0, 0.085, -0.04); glow.renderOrder = 22; gun.add(glow);
      muzzle.scale.multiplyScalar(1.5);
    }
    gun.scale.set(0.55, 0.55, 0.55);
    gun.position.set(0.2, -0.18, -0.5);
    gun.rotation.set(0, 0.04, 0);
    camera.add(gun);
  }

  function buildEffects() {
    tracers = []; sparks = []; tracerI = 0;
    const tg = new T.BoxGeometry(gfx.fx ? 0.085 : 0.04, gfx.fx ? 0.085 : 0.04, 1);
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(tg, new T.MeshBasicMaterial(gfx.fx ? { color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false } : { color: 0xffffff, transparent: true, opacity: 0 }));
      m.visible = false; m.userData.shared = true; scene.add(m);
      tracers.push({ mesh: m, life: 0 });
    }
    shared.tracerGeo = tg;
    if (gfx.fx) {                                   // pool of flash rings that pop where a laser hits
      shared.ringGeo = new T.RingGeometry(0.12, 0.2, 18);
      for (let i = 0; i < 8; i++) {
        const m = new T.Mesh(shared.ringGeo, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide }));
        m.visible = false; m.userData.shared = true; scene.add(m); rings.push({ mesh: m, life: 0 });
      }
    }
    const sg = new T.BoxGeometry(0.1, 0.1, 0.1);
    shared.sparkGeo = sg;
    for (let i = 0; i < (gfx.fx ? 70 : 28); i++) {
      const m = new T.Mesh(sg, new T.MeshBasicMaterial(gfx.fx ? { color: 0xffffff, transparent: true, blending: T.AdditiveBlending, depthWrite: false } : { color: 0xffffff, transparent: true }));
      m.visible = false; m.userData.shared = true; scene.add(m);
      sparks.push({ mesh: m, life: 0, vx: 0, vy: 0, vz: 0 });
    }
  }

  /* =====================================================================
     SPAWNING, SHOOTING, DAMAGE
     ===================================================================== */
  function chooseSpawn(e, used) {
    const list = world.spawns[e.team];
    let best = null, bestScore = -1;
    list.forEach(function (sp, i) {
      let md = 99;
      ents.forEach(function (o) {
        if (o.team !== e.team && o.alive) md = Math.min(md, Math.hypot(o.x - sp.x, o.z - sp.z));
      });
      const taken = used && used[e.team].indexOf(i) >= 0;
      const score = (taken ? 0 : 50) + Math.min(md, 40) + Math.random() * 10;
      if (score > bestScore) { bestScore = score; best = { sp: sp, i: i }; }
    });
    return best;
  }
  function placeAtSpawn(e, used) {
    const c = chooseSpawn(e, used);
    if (used) used[e.team].push(c.i);
    e.x = c.sp.x; e.z = c.sp.z; e.y = 0; e.vx = e.vz = e.vy = 0; e.yaw = c.sp.yaw;
    if (e.isPlayer) { yaw = c.sp.yaw; pitch = 0; }
  }

  G.respawn = function (e) {
    placeAtSpawn(e, null);
    e.alive = true; e.hp = P.hp; e.protT = e.isPlayer ? P.protect : 1.5; e.target = null; e.path = null; e.sees = false;
    e.state = 'roam'; e.ammo = e.D.mag; e.deathT = 0;
    if (e.mesh) { e.mesh.visible = true; e.mesh.scale.set(1, 1, 1); }
    if (e.isPlayer) {
      S.ammo = Math.max(S.ammo, AMMO.start);
      show('ov-death', false);
      ES.audio.sfx('respawn');
    }
  };

  /* Ray from `shooter`: finds the first thing hit (a wall, or an enemy). Teammates are ignored (no friendly fire). */
  G.castShot = function (shooter, ox, oy, oz, dx, dy, dz, range, radiusMul) {
    let bt = world.rayWorld(ox, oy, oz, dx, dy, dz, range), best = null, head = false;
    const dxz2 = dx * dx + dz * dz;
    if (dxz2 > 1e-8) {
      for (let k = 0; k < ents.length; k++) {
        const e = ents[k];
        if (!e.alive || e === shooter || e.team === shooter.team) continue;
        const tca = ((e.x - ox) * dx + (e.z - oz) * dz) / dxz2;
        if (tca <= 0) continue;
        const px = ox + dx * tca - e.x, pz = oz + dz * tca - e.z, d2 = px * px + pz * pz;
        const R = 0.42 * radiusMul;
        if (d2 >= R * R) continue;
        const th = tca - Math.sqrt((R * R - d2) / dxz2);
        if (th < 0 || th >= bt) continue;
        const hy = oy + dy * th - e.y;
        if (hy < 0 || hy > 1.95) continue;
        bt = th; best = e; head = hy > 1.42;
      }
    }
    return { t: bt, target: best, head: head };
  };

  G.damage = function (target, amt, attacker, head) {
    if (!target.alive || target.protT > 0 || S.phase !== 'play' || (RB && RB.eng.st.ph !== 0)) return false;       // no tagging while the round banner shows
    target.hp -= amt; target.flashT = 0.1;
    if (target.isPlayer) {
      S.sinceHurt = 0; S.dmgFlash = Math.min(0.8, 0.35 + amt / 60);
      if (attacker) S.hurtFrom = Math.atan2(-(attacker.x - target.x), -(attacker.z - target.z));
      ES.audio.sfx('hurt');
    } else if (attacker) {
      target.alert = 3;
      if (!target.target || !target.sees) { target.target = attacker; target.sees = false; target.lastSeen = { x: attacker.x, z: attacker.z }; target.reactT = target.D.react * 0.7; target.lostT = 0; }
    }
    if (target.hp <= 0) kill(target, attacker, head);
    return true;
  };

  function kill(target, attacker, head) {
    target.alive = false; target.hp = 0; target.deaths++; target.respawnT = P.respawn; target.deathT = 0.5;
    target.target = null; target.path = null;
    burst(target.x, target.y + 1, target.z, ES.TEAMS[target.team].color, 12);
    if (!target.isPlayer) G.soundAt('scream', target.x, target.z, 0.9);       // bots scream too (quieter when far away)
    if (attacker) {
      attacker.kills++;
      if (RB) RB.eng.killed(attacker.team); else S.score[attacker.team]++;      // Rescue & Bomb: tags still count (they break a tie), but the score is rounds won
      feed(attacker, target, head); announceKill(attacker);
    }
    if (target.isPlayer) {
      S.stats.deaths++; dropWeapon(true);
      if (S.qOpen) cancelQuestion(true);
      fireHeld = false;
      $('death-text').textContent = attacker ? 'Tagged by ' + attacker.name + '!' : 'You were tagged!';
      show('ov-death', true);
      ES.audio.sfx('die'); ES.audio.sfx('scream', 1);
    }
    if (attacker && attacker.isPlayer) { S.stats.kills++; ES.audio.sfx('kill'); }
    if (!RB && (S.score[0] >= S.target || S.score[1] >= S.target)) endMatch('score');
  }

  /* announcer: first blood, double / triple kill (your own tags within 5 seconds of each other) */
  function announceKill(attacker) {
    if (!S.fbDone) { S.fbDone = true; if (!RB) ES.audio.announce('first'); }
    if (attacker && attacker.isPlayer) {
      const now = performance.now();
      S.multi = (S.multiT && now - S.multiT < 5000) ? S.multi + 1 : 1; S.multiT = now;
      if (S.multi === 2) setTimeout(function () { ES.audio.announce('k2'); }, 300);
      else if (S.multi === 3) setTimeout(function () { ES.audio.announce('k3'); }, 300);
      else if (S.multi >= 4) setTimeout(function () { ES.audio.announce('k4'); }, 300);
    }
  }
  function announceClock() {
    if (!S.min1 && S.total > 100 && S.timeLeft <= 60 && S.timeLeft > 0) { S.min1 = true; ES.audio.announce('min1'); }
  }

  function feed(a, t, head) {
    S.feed.unshift({ a: a, t: t, head: head, life: 5 });
    if (S.feed.length > 5) S.feed.pop();
    S.feedDirty = true;
  }

  G.addTracer = function (ax, ay, az, bx, by, bz, team, color) {
    const tr = tracers[tracerI++ % tracers.length], m = tr.mesh;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.1) return;
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.lookAt(bx, by, bz);
    m.scale.set(1, 1, len);
    m.material.color.setHex(color || (team === 1 ? 0xff9a6d : 0x7fd0ff));
    m.material.opacity = 0.9; m.visible = true; tr.life = 0.12;
  };

  function burst(x, y, z, color, n) {
    if (gfx.fx) {
      const r = rings[ringI++ % rings.length]; r.life = 0.32; r.mesh.position.set(x, y, z); r.mesh.visible = true; r.mesh.material.color.setHex(color); r.mesh.material.opacity = 0.9; r.mesh.scale.set(1, 1, 1);
      r.mesh.lookAt(camera.position);
      n = n * 3;
    }
    n = Math.min(n, gfx.sparks);
    let k = 0;
    for (let i = 0; i < sparks.length && k < n; i++) {
      const s = sparks[i];
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.2; k++;
      s.mesh.position.set(x, y, z); s.mesh.visible = true;
      s.mesh.material.color.setHex(gfx.fx && k % 3 === 0 ? 0xffffff : color); s.mesh.material.opacity = 1;
      s.vx = (Math.random() - 0.5) * 5; s.vy = Math.random() * 4 + 1; s.vz = (Math.random() - 0.5) * 5;
    }
  }

  /* Sound that gets quieter with distance and pans left/right */
  G.soundAt = function (name, x, z, gain) {
    const dx = x - player.x, dz = z - player.z, d = Math.sqrt(dx * dx + dz * dz);
    const vol = clamp(1 - d / 38, 0, 1) * (gain || 1);
    if (vol < 0.05) return;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    ES.audio.sfx(name, vol, d > 0.1 ? clamp((dx * rx + dz * rz) / d, -1, 1) * 0.8 : 0);
  };

  /* ---------------- bonus weapons ---------------- */
  function giveWeapon(id) {
    const W = ES.WEAPONS[id]; if (!W || id === 'pistol' || !S) return;
    S.weapon = id; S.wAmmo = W.mag; S.wTime = W.secs; S.fireCd = 0.2; mountGun(id);
    toast(W.icon + ' ' + W.name + '! ' + W.mag + ' shots, ' + W.secs + ' seconds', 3);
    ES.audio.sfx('pickup'); ES.audio.announce && ES.audio.announce('weapon');
  }
  function dropWeapon(silent) {
    if (!S || S.weapon === 'pistol') return;
    S.weapon = 'pistol'; S.wAmmo = 0; S.wTime = 0; mountGun('pistol');
    if (!silent) { toast('Back to your blaster 🔫', 1.6); ES.audio.sfx('wpnEnd'); }
  }
  function randomWeapon() {
    const list = ES.WEAPON_IDS.filter(function (w) { return w !== S.weapon; });
    return list[Math.floor(Math.random() * list.length)];
  }
  /* 3 right answers in a row = a bonus weapon (solo: given here, class match: the referee gives it) */
  function earnWeapon() {
    if (NET) netSend({ t: 'earn' }); else giveWeapon(randomWeapon());
  }
  G.netWeapon = function (m) { if (NET && S && S.phase === 'play' && player.alive && m && ES.WEAPONS[m.w]) giveWeapon(m.w); };

  function buildCrates() {
    crates = []; crateClock = 0;
    const spots = (world && world.crateSpots) || [];
    const bg = new T.BoxGeometry(0.7, 0.7, 0.7), bm = new T.MeshBasicMaterial({ color: 0xffd23f });
    const rg = new T.BoxGeometry(0.78, 0.12, 0.78), rm = new T.MeshBasicMaterial({ color: 0xff7a1f });
    const cg = new T.CylinderGeometry(0.5, 0.5, 7, 10, 1, true);
    spots.forEach(function (sp, i) {
      const g = new T.Group(); g.position.set(sp.x, 0, sp.z);
      const box = new T.Mesh(bg, bm); box.position.y = 1.0; g.add(box);
      const band = new T.Mesh(rg, rm); band.position.y = 1.0; box.add(band);
      const beam = new T.Mesh(cg, new T.MeshBasicMaterial({ color: 0xffe27a, transparent: true, opacity: 0.22, depthWrite: false, side: T.DoubleSide, fog: false }));
      beam.position.y = 3.5; g.add(beam);
      scene.add(g);
      crates.push({ x: sp.x, z: sp.z, g: g, box: box, ready: true, t: 0, i: i });
    });
  }
  function updateCrates(dt) {
    if (!crates.length) return;
    crateClock += dt;
    let mask;
    if (NET) mask = S.crMask;                              // the teacher's page decides which crates are out
    else {
      if (!S.crClock) S.crClock = ES.crateClock(crates.length);
      if (S.phase === 'play') S.crClock.update(dt);
      mask = S.crClock.mask;
    }
    if (mask && !S.crSeen) { toast('🎁 Gold weapon crates appeared! Run to one!', 3); ES.audio.sfx('open'); }
    S.crSeen = mask;
    for (let i = 0; i < crates.length; i++) {
      const c = crates[i];
      c.ready = !!(mask & (1 << i));
      if (!NET && c.ready && S.phase === 'play' && player.alive && Math.hypot(player.x - c.x, player.z - c.z) < ES.CRATE.radius && player.y < 1.6) {
        S.crClock.take(i); c.ready = false; giveWeapon(randomWeapon());
      }
      c.g.visible = c.ready;
      if (c.ready) { c.box.rotation.y = crateClock * 1.6; c.box.position.y = 1.0 + Math.sin(crateClock * 2.2 + i) * 0.13; }
    }
  }

  /* aim direction with a little random wobble (sp = how much) */
  function aimDir(sp) {
    const cp = Math.cos(pitch);
    let dx = -Math.sin(yaw) * cp + (Math.random() - 0.5) * sp * 2, dy = Math.sin(pitch) + (Math.random() - 0.5) * sp * 2, dz = -Math.cos(yaw) * cp + (Math.random() - 0.5) * sp * 2;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz);
    return [dx / l, dy / l, dz / l];
  }

  function playerShoot() {
    const wid = S.weapon, W = ES.WEAPONS[wid] || ES.WEAPONS.pistol, bonus = wid !== 'pistol';
    if (bonus) S.wAmmo--; else S.ammo--;
    S.fireCd = W.interval; S.stats.shots++;
    const moving = Math.hypot(player.vx, player.vz) > 1;
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const col = bonus ? W.color : 0;
    const aim = st.aimAssist ? (W.pellets > 1 ? 1.3 : 1.7) : 1;
    let hitAny = false, headAny = false, first = null, hits = [], sendEnd = null;
    for (let n = 0; n < W.pellets; n++) {
      const d = aimDir(W.pellets > 1 ? W.spread : (bonus ? W.spread : (moving ? 0.012 : 0.004)));
      const res = G.castShot(player, ox, oy, oz, d[0], d[1], d[2], W.range, aim);
      if (!first) { first = res; sendEnd = [ox + d[0] * res.t, oy + d[1] * res.t, oz + d[2] * res.t]; }
      if (n < 3 || W.pellets === 1) G.addTracer(ox + d[0] * 0.6 + rx * 0.22, oy + d[1] * 0.6 - 0.18, oz + d[2] * 0.6 + rz * 0.22, ox + d[0] * res.t, oy + d[1] * res.t, oz + d[2] * res.t, myTeam(), col);
      if (res.target) {
        S.stats.hits++; if (res.head) S.stats.heads++;
        hits.push([res.target.eid, res.head ? 1 : 0]);
        if (NET) { if (res.target.alive && res.target.protT <= 0) { hitAny = true; if (res.head) headAny = true; } }
        else if (G.damage(res.target, res.head ? W.head : W.dmg, player, res.head)) { hitAny = true; if (res.head) headAny = true; }
        burst(ox + d[0] * res.t, oy + d[1] * res.t, oz + d[2] * res.t, ES.TEAMS[1 - myTeam()].color, 3);
      } else if (n < 2) {
        burst(ox + d[0] * (res.t - 0.05), oy + d[1] * (res.t - 0.05), oz + d[2] * (res.t - 0.05), 0xd8d8d8, 3);
      }
    }
    if (NET) {
      const msg = { t: 'shot', ox: r2(ox), oy: r2(oy), oz: r2(oz), ex: r2(sendEnd[0]), ey: r2(sendEnd[1]), ez: r2(sendEnd[2]), tid: first.target ? first.target.eid : -1, h: first.head ? 1 : 0 };
      if (bonus) msg.w = wid;
      if (W.pellets > 1) msg.hits = hits;
      netSend(msg);
    }
    if (W.splash) {                                    // rocket: a big blast where it lands, hurting everybody close by
      const bx = sendEnd[0], by = sendEnd[1], bz = sendEnd[2];
      burst(bx, by, bz, 0xff8a3c, 16); burst(bx, by + 0.4, bz, 0xffd23f, 10);
      ES.audio.sfx('boom', 0.9);
      for (let k = 0; k < ents.length; k++) {
        const t = ents[k];
        if (!t.alive || t.team === myTeam() || (first.target === t)) continue;
        const d2 = Math.hypot(t.x - bx, (t.y + 1) - by, t.z - bz);
        if (d2 < W.splashR) {
          if (NET) { if (t.protT <= 0) hitAny = true; }
          else if (G.damage(t, Math.max(10, W.splash * (1 - d2 / W.splashR)), player, false)) hitAny = true;
        }
      }
    }
    ES.audio.sfx(bonus ? 'w_' + wid : 'shoot', 0.9);
    muzzle.visible = true; S.muzzleT = 0.05; S.recoil = bonus && W.interval > 0.5 ? 1.8 : 1;
    if (hitAny) {
      S.hitMark = 0.18; S.hitHead = headAny;
      if (first.target && first.target.alive) ES.audio.sfx(headAny ? 'headshot' : 'hit');
      else if (!first.target) ES.audio.sfx('hit');
    }
    if (bonus && S.wAmmo <= 0) dropWeapon(false);
  }

  /* =====================================================================
     QUESTION  ->  AMMO
     ===================================================================== */
  /* kind = '' (a normal ammo question, key R) or 'rescue' / 'plant' / 'defuse' (a mission question, key E in Rescue & Bomb) */
  function openQuestion(kind) {
    if (S.phase !== 'play' || S.paused || S.qOpen || !player.alive) return;
    if (!kind && S.ammo >= AMMO.max) { toast('Your blaster is already full! ⚡', 1.6); return; }
    if (S.qCd > 0) { toast('Next question in ' + Math.ceil(S.qCd) + ' s…', 1.2); return; }
    clearTimeout(closeTimer);
    S.qMission = kind || '';
    S.qMax = st.qTime;                                                     // seconds to answer (0 = no limit)
    if (kind === 'defuse' && RB) S.qMax = Math.max(2, Math.min(st.qTime || 99, RB.eng.st.b.t - 0.5));   // the bomb will not wait for a slow answer
    S.cur = quiz.next(); S.qOpen = true; S.qState = 'asking'; S.qTime = S.qMax; fireHeld = false;
    const q = S.cur, sub = ES.SUBJECTS[q.subject];
    const panel = $('qp');
    panel.style.setProperty('--sub', sub.color);
    $('qp-subject').textContent = sub.icon + ' ' + sub.name;
    $('qp-meta').textContent = 'Grade ' + q.grade + '  ·  ' + ['', 'Easy ★', 'Medium ★★', 'Hard ★★★'][q.diff];
    $('qp-text').textContent = q.text;
    const box = $('qp-opts'); box.innerHTML = '';
    q.opts.forEach(function (txt, i) {
      const b = document.createElement('button');
      b.className = 'qopt'; b.type = 'button';
      const k = document.createElement('span'); k.className = 'qkey'; k.textContent = 'ABCD'[i];
      const t = document.createElement('span'); t.textContent = txt;
      b.appendChild(k); b.appendChild(t);
      b.addEventListener('click', function () { chooseAnswer(i); });
      box.appendChild(b);
    });
    $('qp-reward').textContent = kind ? RB_TXT[kind].ask + '  (+' + st.reward + ' ⚡ too)' : '+' + st.reward + ' ⚡ ammo for a correct answer';
    $('qp-fb').className = 'qfb hidden'; $('qp-fb').innerHTML = '';
    $('qp-timer').classList.toggle('hidden', !S.qMax);
    $('qp-fill').style.width = '100%'; $('qp-fill').classList.remove('urgent');
    show('qp', true);
    ES.audio.sfx('open'); ES.audio.music.muffle(true);   // music goes soft so students can think
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
  }

  function chooseAnswer(i) {
    if (!S.qOpen || S.qState !== 'asking') return;
    S.qState = 'answered';
    const q = S.cur, right = i === q.correct;
    const sub = q.subject, bs = S.stats.bySubj[sub] || (S.stats.bySubj[sub] = { a: 0, c: 0 });
    bs.a++; S.stats.qAsked++;
    const btns = $('qp-opts').children;
    for (let k = 0; k < btns.length; k++) {
      btns[k].disabled = true;
      if (k === q.correct) btns[k].classList.add('right');
      else if (k === i) btns[k].classList.add('wrong');
    }
    const fb = $('qp-fb');
    if (right) {
      bs.c++; S.stats.qRight++; S.streak++;
      let gain = st.reward + (S.streak >= 3 ? 3 : 0);
      S.ammo = Math.min(AMMO.max, S.ammo + gain);
      S.qCd = 2;
      fb.className = 'qfb good';
      const earn = S.streak > 0 && S.streak % 3 === 0;
      fb.innerHTML = '<b>Correct! 🎉</b> +' + gain + ' ⚡ ammo' + (S.streak >= 3 ? ' (streak bonus!)' : '') + (S.qMission ? '<br><b>' + RB_TXT[S.qMission].done + '</b>' : '') + (earn ? '<br><b>🎁 3 in a row = a BONUS WEAPON!</b>' : '');
      if (S.qMission) rbDo(S.qMission);
      if (earn) setTimeout(function () { if (S && S.phase === 'play') earnWeapon(); }, 1150);
      ES.audio.sfx('correct');
      setTimeout(function () { ES.audio.sfx('reload'); }, 520); setTimeout(function () { ES.audio.sfx('reload', 0.9); }, 800);   // click-clack: blaster reloaded
      closeTimer = setTimeout(function () { closeQuestion(); }, 1100);
    } else {
      S.streak = 0; S.qCd = S.qMission ? 2 : 4;
      const gain = st.wrongAmmo;
      if (gain) S.ammo = Math.min(AMMO.max, S.ammo + gain);
      S.stats.missed.push({ subject: sub, text: q.text, answer: q.opts[q.correct], exp: q.exp });
      fb.className = 'qfb bad';
      fb.innerHTML = '';
      const h = document.createElement('div');
      h.innerHTML = '<b>' + (i < 0 ? "Time's up! ⏰" : 'Not this time 💪') + '</b>' + (gain ? ' +' + gain + ' ⚡ for trying' : '');
      const a = document.createElement('div'); a.textContent = 'The answer is ' + 'ABCD'[q.correct] + ': ' + q.opts[q.correct];
      const e = document.createElement('div'); e.className = 'qexp'; e.textContent = q.exp || '';
      const c = document.createElement('button'); c.type = 'button'; c.className = 'btn'; c.id = 'qp-continue'; c.textContent = 'Continue (Enter)';
      c.addEventListener('click', function () { closeQuestion(); });
      fb.appendChild(h); fb.appendChild(a); fb.appendChild(e); fb.appendChild(c);
      ES.audio.sfx('wrong');
    }
    show('qp-timer', false);
  }

  function closeQuestion() {
    if (!S.qOpen) return;
    clearTimeout(closeTimer);
    S.qOpen = false; S.qState = ''; show('qp', false); ES.audio.music.muffle(false);
    relock();
  }

  /* closing without answering: the same question comes back later (so you cannot "re-roll" for an easy one) */
  function cancelQuestion(silent) {
    if (!S.qOpen) return;
    if (S.qState === 'asking') { quiz.giveBack(S.cur); S.qCd = 3; }
    clearTimeout(closeTimer);
    S.qOpen = false; S.qState = ''; show('qp', false); ES.audio.music.muffle(false);
    if (!silent) relock();
  }

  function relock() {
    if (st.lookMode !== 'lock' || S.phase !== 'play') return;
    tryLock();
    clearTimeout(relockTimer);
    relockTimer = setTimeout(function () {
      if (G.active && S.phase === 'play' && !S.qOpen && !S.paused && !locked) pause();
    }, 250);
  }

  /* =====================================================================
     PAUSE / MATCH FLOW
     ===================================================================== */
  function tryLock() {
    if (st.lookMode !== 'lock' || !canvas) return;
    try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(function () { /* user will click again */ }); } catch (e) { /* ignore */ }
  }
  function pause() {
    if (S.phase !== 'play' && S.phase !== 'count') return;
    if (S.paused || S.qOpen) return;
    S.paused = true; fireHeld = false; keys = {};
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    show('ov-pause', true);
    ES.audio.music.pause();
  }
  function resume() {
    if (!S.paused) return;
    S.paused = false; show('ov-pause', false);
    ES.audio.music.resume();
    tryLock();
  }

  /* called by the "Click to start" button */
  G.begin = function () {
    if (!G.active || S.phase !== 'ready') return;
    ES.audio.unlock();
    ES.audio.music.start('play');
    show('ov-ready', false);
    if (NET) {                               // class match: tell the referee we are ready and wait for the countdown
      S.phase = NET.hostPh === 'play' ? 'play' : (NET.hostPh === 'count' ? 'count' : 'wait');
      $('count-num').textContent = '⏳'; show('ov-count', S.phase !== 'play'); netSend({ t: 'ready' }); tryLock(); return;
    }
    S.phase = 'count'; S.countT = 3.2; S.lastCount = 4;
    show('ov-count', true);
    tryLock();
  };

  function endMatch(reason) {
    if (S.phase === 'ended') return;
    S.phase = 'ended'; S.reason = reason; fireHeld = false;
    clearTimeout(closeTimer);
    if (S.qOpen) { S.qOpen = false; show('qp', false); }
    ES.audio.music.muffle(false); ES.audio.music.stop(0.4);
    show('ov-death', false); show('ov-pause', false);
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch (e) { /* ignore */ }
    let outcome = 'draw';
    const mine = S.score[myTeam()], other = S.score[1 - myTeam()];
    if (mine > other) outcome = 'win'; else if (other > mine) outcome = 'lose';
    S.outcome = outcome;
    buildEndScreen(outcome);
    show('ov-end', true);
    ES.audio.sfx(outcome === 'win' ? 'win' : (outcome === 'lose' ? 'lose' : 'go'));
    setTimeout(function () { ES.audio.announce(outcome); }, 700);
  }

  function buildEndScreen(outcome) {
    const s = S.stats;
    $('end-title').textContent = outcome === 'win' ? '🏆 VICTORY!' : (outcome === 'lose' ? 'Good try!' : "It's a draw!");
    $('end-title').className = 'end-title ' + outcome;
    $('end-score').innerHTML = '<span style="color:' + ES.TEAMS[0].css + '">Blue ' + S.score[0] + '</span> &nbsp;–&nbsp; <span style="color:' + ES.TEAMS[1].css + '">' + S.score[1] + ' Red</span>';
    const acc = s.shots ? Math.round(100 * s.hits / s.shots) : 0;
    const qacc = s.qAsked ? Math.round(100 * s.qRight / s.qAsked) : 0;
    const stats = [['🎯', s.kills, 'Tags'], ['💥', s.deaths, 'Times tagged'], ['🔫', acc + '%', 'Shot accuracy'], ['🧠', s.qRight + '/' + s.qAsked, 'Questions right']];
    $('end-stats').innerHTML = '';
    stats.forEach(function (x) {
      const d = document.createElement('div'); d.className = 'stat';
      d.innerHTML = '<div class="si">' + x[0] + '</div><div class="sv"></div><div class="sl"></div>';
      d.children[1].textContent = x[1]; d.children[2].textContent = x[2];
      $('end-stats').appendChild(d);
    });
    // per-subject bars
    const bars = $('end-subj'); bars.innerHTML = '';
    Object.keys(s.bySubj).forEach(function (k) {
      const v = s.bySubj[k], sub = ES.SUBJECTS[k], pct = v.a ? Math.round(100 * v.c / v.a) : 0;
      const row = document.createElement('div'); row.className = 'srow';
      row.innerHTML = '<span class="sn"></span><span class="sb"><span class="sf"></span></span><span class="sp"></span>';
      row.children[0].textContent = sub.icon + ' ' + sub.name;
      row.children[1].firstChild.style.width = pct + '%'; row.children[1].firstChild.style.background = sub.color;
      row.children[2].textContent = v.c + '/' + v.a;
      bars.appendChild(row);
    });
    if (!Object.keys(s.bySubj).length) bars.textContent = 'No questions were answered this time. Press R in the next match to charge your blaster!';
    // review list
    const rv = $('end-review'); rv.innerHTML = '';
    if (s.missed.length) {
      const h = document.createElement('h4'); h.textContent = '📝 Let\'s review (' + s.missed.length + ')'; rv.appendChild(h);
      s.missed.slice(0, 8).forEach(function (m) {
        const d = document.createElement('div'); d.className = 'rv'; d.style.borderColor = ES.SUBJECTS[m.subject].color;
        const q = document.createElement('div'); q.className = 'rq'; q.textContent = m.text;
        const a = document.createElement('div'); a.className = 'ra'; a.textContent = '✔ ' + m.answer;
        const e = document.createElement('div'); e.className = 're'; e.textContent = m.exp || '';
        d.appendChild(q); d.appendChild(a); d.appendChild(e); rv.appendChild(d);
      });
    } else if (s.qAsked) { rv.innerHTML = '<h4>⭐ Perfect! No mistakes to review.</h4>'; }
    renderEndBoard();
  }

  /* =====================================================================
     INPUT
     ===================================================================== */
  function onKeyDown(e) {
    if (!G.active) return;
    const c = e.code;
    if (c === 'Tab') { e.preventDefault(); if (S.phase === 'play' || S.phase === 'ended') showScoreboard(true); return; }
    if (c === 'F3') { e.preventDefault(); st.showFps = !st.showFps; return; }
    // question panel keys
    if (S.qOpen) {
      e.preventDefault();
      if (c === 'Escape') { cancelQuestion(false); return; }
      if (S.qState === 'asking') {
        const m = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, KeyA: 0, KeyB: 1, KeyC: 2, KeyD: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };
        if (m[c] !== undefined) chooseAnswer(m[c]);
      } else if (c === 'Enter' || c === 'Space') closeQuestion();
      return;
    }
    if (S.paused) { if (c === 'Escape' || c === 'Enter') resume(); return; }
    if (c === 'Escape') { pause(); return; }
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].indexOf(c) >= 0) e.preventDefault();
    if (e.repeat) { keys[c] = true; return; }
    keys[c] = true;
    if (S.phase !== 'play') return;
    if (c === 'KeyR') openQuestion('');
    else if (c === 'KeyE' && RB) openMission();
    else if (c === 'KeyF') fireHeld = true;
    else if (c === 'Space' && player.alive && player.onGround) ES.audio.sfx('jump');
  }
  function onKeyUp(e) {
    if (!G.active) return;
    keys[e.code] = false;
    if (e.code === 'Tab') showScoreboard(false);
    if (e.code === 'KeyF') fireHeld = false;
  }
  function onMouseDown(e) {
    if (!G.active || S.qOpen || S.paused) return;
    if (e.button === 0 && S.phase === 'play') {
      if (st.lookMode === 'lock' && !locked) { tryLock(); return; }
      fireHeld = true;
    }
    if (e.button === 2) rightDown = true;
  }
  function onMouseUp(e) {
    if (e.button === 0) fireHeld = false;
    if (e.button === 2) rightDown = false;
  }
  function onMouseMove(e) {
    if (!G.active || S.qOpen || S.paused || S.phase === 'ended') return;
    if (!(locked || (st.lookMode === 'keys' && rightDown))) return;
    const k = 0.0022 * st.sens;
    yaw -= clamp(e.movementX || 0, -150, 150) * k;
    pitch = clamp(pitch - clamp(e.movementY || 0, -150, 150) * k, -1.45, 1.45);
  }
  function onLockChange() {
    locked = document.pointerLockElement === canvas;
    if (!locked && G.active && st.lookMode === 'lock' && (S.phase === 'play' || S.phase === 'count') && !S.qOpen && !S.paused) pause();
  }
  function onResize() {
    if (!renderer) return;
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }
  function onBlur() { keys = {}; fireHeld = false; rightDown = false; if (G.active && st.lookMode === 'keys') pause(); }
  function onVis() { if (document.hidden && G.active) pause(); }
  function onCtx(e) { if (G.active) e.preventDefault(); }

  function addListeners() {
    window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mouseup', onMouseUp); window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onResize); window.addEventListener('blur', onBlur);
    window.addEventListener('contextmenu', onCtx);
    document.addEventListener('visibilitychange', onVis);
    document.addEventListener('pointerlockchange', onLockChange);
    $('gl-wrap').addEventListener('mousedown', onMouseDown);
  }
  function removeListeners() {
    window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('mouseup', onMouseUp); window.removeEventListener('mousemove', onMouseMove);
    window.removeEventListener('resize', onResize); window.removeEventListener('blur', onBlur);
    window.removeEventListener('contextmenu', onCtx);
    document.removeEventListener('visibilitychange', onVis);
    document.removeEventListener('pointerlockchange', onLockChange);
    const w = $('gl-wrap'); if (w) w.removeEventListener('mousedown', onMouseDown);
  }

  /* =====================================================================
     PER-FRAME UPDATE
     ===================================================================== */
  function frame(now) {
    if (!G.active) return;
    raf = requestAnimationFrame(frame);
    const raw = Math.min(0.25, Math.max(0.001, (now - lastT) / 1000));   // real time since the last picture (not capped at 20 fps, so slow computers are measured honestly)
    const dt = Math.min(0.05, raw);
    lastT = now;
    try {
      measureFps(raw);
      if (!S.paused || NET) tick(dt);
      renderer.render(scene, camera);
    } catch (err) {
      // A bug must never freeze the whole classroom: log it and keep drawing.
      if (!G.errShown) { G.errShown = true; console.error('EduStrike frame error:', err); }
    }
  }

  /* This computer is too slow for the level it picked: step down ONE level without restarting the match
     (Ultra -> High -> Medium -> Low). Only things that can change on the fly are changed:
     sharpness, shadows, glow effects and how far you can see. */
  function stepDown() {
    const i = ES.GFX_ORDER.indexOf(G.level);
    if (i <= 0) return;
    const to = ES.GFX_ORDER[i - 1], P = ES.GFX[to];
    G.level = to; G.downgraded = true; fpsTipShown = true; fpsSlowT = 0;
    try {
      gfx.scale = P.scale; gfx.maxPR = P.maxPR; gfx.sparks = P.sparks; gfx.fog = P.fog; gfx.fx = !!P.fx;
      if (!P.shadows && gfx.shadows) {
        gfx.shadows = false;
        if (sunLight) sunLight.castShadow = false;
        renderer.shadowMap.enabled = false;
        scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); });
      } else if (P.shadows && sunLight && sunLight.shadow) {          // still has shadows: make the map smaller (cheaper)
        if (sunLight.shadow.map) { sunLight.shadow.map.dispose(); sunLight.shadow.map = null; }
        sunLight.shadow.mapSize.set(P.shadowSize || 1024, P.shadowSize || 1024);
        renderer.shadowMap.type = P.soft ? T.PCFSoftShadowMap : T.PCFShadowMap;
        scene.traverse(function (o) { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (m) { m.needsUpdate = true; }); });
      }
      if (!P.world && world && world.setExtras) world.setExtras(false);
      scene.fog.far = P.fog; camera.far = P.far || 140; camera.updateProjectionMatrix();
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, P.maxPR) * P.scale);
      renderer.setSize(window.innerWidth, window.innerHeight, false);
      ES.settings.gfx = to; ES.saveSettings();                       // next time start at this level
    } catch (e) { /* never break the game over graphics */ }
    toast('Graphics lowered to ' + P.label.split(' (')[0] + ' to keep the game smooth ⚡', 5);
  }

  function measureFps(dt) {
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) {
      const fps = Math.round(fpsFrames / fpsTime);
      setText('fps', st.showFps ? 'FPS ' + fps : '');
      if (S.phase === 'play' && !S.paused && !S.qOpen) {
        S.fpsMin = Math.min(S.fpsMin, fps); S.fpsSum += fps; S.fpsN++;
        fpsSlowT = fps < 28 ? fpsSlowT + fpsTime : 0;
        if (G.level !== 'low' && !G.noStepDown && fpsSlowT > 4) stepDown();
        if (fpsSlowT > 6 && !fpsTipShown && G.level !== 'low') { fpsTipShown = true; toast('Feels slow? Press Esc, quit, and choose Graphics: Low.', 5); }
      }
      fpsFrames = 0; fpsTime = 0;
    }
  }

  function tick(dt) {
    // small timers that always run
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    if (S.bannerT > 0) { S.bannerT -= dt; if (S.bannerT <= 0) show('ov-round', false); }
    updateEffects(dt);
    updateMapFx(dt);
    if (RBV) updateRB(dt);
    if (world && world.update) world.update(dt);
    if (NET) { netTick(dt); return; }

    if (S.phase === 'ready') { lookKeys(dt); updateCamera(dt); return; }
    if (S.phase === 'count') {
      lookKeys(dt); updateCamera(dt);
      S.countT -= dt;
      const n = Math.ceil(S.countT);
      if (n !== S.lastCount) {
        S.lastCount = n;
        if (n > 0) { $('count-num').textContent = n; ES.audio.sfx('count'); }
      }
      if (S.countT <= 0) {
        S.phase = 'play'; show('ov-count', false); ES.audio.sfx('go'); ES.audio.announce('go');
        if (RB) rbEffects('round', 1); else toast('GO! Press R to charge your blaster ⚡', 2.5);
      }
      return;
    }
    if (S.phase === 'ended') { animateMeshes(dt); updateCamera(dt); return; }

    /* ---- playing ---- */
    if (S.fxT > 0 && FXD) { S.fxT -= dt; if (S.fxT <= 0) toast(FXD.text, 4.5); }
    const slow = S.qOpen && st.answerMode === 'slow';
    const wdt = slow ? dt * 0.15 : dt;
    if (RB) {                                          // Rescue & Bomb: the rules engine keeps the round clock + bomb (real time, so slow-motion answering cannot freeze the bomb)
      RB.eng.update(dt);
      const rs = RB.eng.st; S.score[0] = rs.wins[0]; S.score[1] = rs.wins[1]; S.timeLeft = rs.tLeft;
      if (rs.ph === 2) { endMatch('rounds'); return; }
    } else {
      S.timeLeft -= wdt; announceClock();
      if (S.timeLeft <= 0) { S.timeLeft = 0; endMatch('time'); return; }
    }
    S.qCd = Math.max(0, S.qCd - dt);
    if (S.qOpen && S.qState === 'asking' && S.qMax) {
      S.qTime -= dt;
      $('qp-fill').style.width = Math.max(0, 100 * S.qTime / S.qMax) + '%';
      $('qp-fill').classList.toggle('urgent', S.qTime < 6);
      if (S.qTime <= 0) chooseAnswer(-1);
    }
    updatePlayer(dt, wdt);
    for (let i = 0; i < ents.length; i++) if (ents[i].isBot) ES.bots.update(G, ents[i], wdt);
    separate();
    animateMeshes(dt);
    updateCamera(dt);
    updateHud(dt);
    musicMood(dt);
  }

  /* how tense is the match? 0 calm .. 1 full battle. The music reads this once a bar. */
  let moodT = 0;
  function musicMood(dt) {
    moodT -= dt; if (moodT > 0) return;
    moodT = 0.5;
    const total = S.total;
    let x = 0.4;
    x += 0.25 * (1 - S.timeLeft / Math.max(1, total));                         // builds as time passes
    if (S.timeLeft < 60) x += 0.25;                                              // final minute
    const lead = Math.max(S.score[0], S.score[1]);
    if (lead >= S.target * 0.7) x += 0.15;                                      // someone is close to winning
    if (player.alive && player.hp < 40) x += 0.15;                              // low health
    ES.audio.music.setIntensity(Math.min(1, x));
  }

  function lookKeys(dt) {
    const k = 2.2 * dt * st.sens;
    if (keys.ArrowLeft) yaw += k; if (keys.ArrowRight) yaw -= k;
    if (keys.ArrowUp) pitch = clamp(pitch + k, -1.45, 1.45);
    if (keys.ArrowDown) pitch = clamp(pitch - k, -1.45, 1.45);
  }

  function updatePlayer(dt, wdt) {
    const p = player;
    S.sinceHurt += dt;
    if (S.fireCd > 0) S.fireCd -= dt;
    if (p.protT > 0) p.protT -= dt;
    updateCrates(dt);
    if (S.weapon !== 'pistol') { S.wTime -= dt; if (S.wTime <= 0) dropWeapon(false); }
    if (!p.alive) {
      p.respawnT -= dt;
      $('death-count').textContent = Math.max(1, Math.ceil(p.respawnT));
      if (p.respawnT <= 0 && !NET) G.respawn(p);
      return;
    }
    if (!NET && S.sinceHurt > P.regenDelay && p.hp < P.hp) p.hp = Math.min(P.hp, p.hp + P.regenRate * dt);

    let wx = 0, wz = 0;
    if (!S.qOpen) {
      lookKeys(dt);
      const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      if (ix || iz) {
        const l = Math.sqrt(ix * ix + iz * iz), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const sp = (keys.ShiftLeft || keys.ShiftRight) ? P.sprint : P.walk;
        wx = (rx * ix + fx * iz) / l * sp; wz = (rz * ix + fz * iz) / l * sp;
      }
      const FX = FXD || {};
      if (keys.Space && p.onGround) { p.vy = P.jump * (FX.jump || 1); p.onGround = false; }
      else if (keys.Space && !S.spaceWas && !p.onGround && S.airJ < (FX.air || 0)) { p.vy = P.jump * (FX.jump || 1) * 0.9; S.airJ++; ES.audio.sfx('jump'); }   // castle: double jump
      S.spaceWas = !!keys.Space;
      if (FX.speed) { wx *= FX.speed; wz *= FX.speed; }
    }
    if (p.onGround) S.airJ = 0;
    const acc = Math.min(1, (p.onGround ? (FXD && FXD.accel) || 14 : (FXD && FXD.accel ? Math.max(3, FXD.accel * 0.6) : 3)) * dt);
    p.vx += (wx - p.vx) * acc; p.vz += (wz - p.vz) * acc;
    p.x += p.vx * dt; p.z += p.vz * dt;
    const wasGround = p.onGround;
    p.vy -= P.gravity * ((FXD && FXD.gravity) || 1) * dt;
    if (FXD && FXD.glide && keys.Space && !S.qOpen && p.vy < -2.2) p.vy = -2.2;                       // jungle: float down slowly while Space is held
    p.y += p.vy * dt;
    world.collide(p, P.radius);
    const g = world.groundAt(p.x, p.z, p.y);
    // stay glued to the floor when walking DOWN stairs (a small drop of up to 0.3 m), so controls do not go floaty
    const fallV = p.vy;
    if (p.y <= g || (wasGround && p.vy <= 0 && p.y - g <= 0.3)) { p.y = g; p.vy = 0; p.onGround = true; } else p.onGround = false;
    // footsteps and landing sounds (quiet, only for you)
    if (p.onGround && !wasGround && fallV < -5) ES.audio.sfx('land', Math.min(1, -fallV / 12));
    if (p.onGround) {
      const spd = Math.hypot(p.vx, p.vz);
      if (spd > 1.2) { S.stepT = (S.stepT || 0) - dt * (spd / 5.5); if (S.stepT <= 0) { S.stepT = 0.36; ES.audio.sfx('step', 0.5 + Math.random() * 0.2); } }
      else S.stepT = 0;
    }

    // blaster
    if (fireHeld && S.fireCd <= 0 && !S.qOpen) {
      if (S.weapon !== 'pistol' || S.ammo > 0) playerShoot();
      else { S.fireCd = 0.35; ES.audio.sfx('empty'); toast('Out of ammo! Press R and answer a question ⚡', 1.6); S.pulseAmmo = 1; }
    }
  }


  /* =====================================================================
     MAP EFFECTS (Stage 5D): every map has its own floating particles and its own small "rule"
     (low gravity, slippery ice, double jump, glide, ...). One single Points object, a few dozen dots, so it stays light.
     SAFETY: if anything is missing the effect is simply skipped and the game plays normally. */
  const FX_COL = {
    snow: [0xffffff], bubbles: [0xd8f6ff, 0x9fe4ff], embers: [0xffb347, 0xff7a2b, 0xffd27a], fireflies: [0xe6ff7a, 0xb8ff6a],
    petals: [0xff9ec4, 0xffe27a, 0xffffff, 0xc9a8ff], wind: [0xffffff, 0xfff1b8, 0xdde6f2], stardust: [0xbff4ff, 0xffffff, 0xffc2ff]
  };
  const FX_SCALE = { low: 0.4, medium: 0.7, high: 1, ultra: 1.4 };       // fewer dots on weaker graphics levels
  function buildMapFx(mapId) {
    MFX = null; FXD = (ES.MAP_FX && ES.MAP_FX[mapId]) || null;
    if (!FXD || !FXD.kind) return;
    try {
      const N = Math.round(FXD.n * 1.4), pos = new Float32Array(N * 3), col = new Float32Array(N * 3), cols = FX_COL[FXD.kind] || [0xffffff];
      const tmp = new T.Color(), vel = [];
      for (let i = 0; i < N; i++) {
        tmp.set(cols[i % cols.length]); col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
        pos[i * 3] = (Math.random() - 0.5) * 50; pos[i * 3 + 1] = Math.random() * 14; pos[i * 3 + 2] = (Math.random() - 0.5) * 50;
        vel.push({ a: Math.random() * 6.28, s: 0.6 + Math.random() * 0.8 });
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('color', new T.BufferAttribute(col, 3));
      const cv = document.createElement('canvas'); cv.width = cv.height = 32;               // a soft round dot made by code (no image file)
      const cx = cv.getContext('2d'), rg = cx.createRadialGradient(16, 16, 0, 16, 16, 16);
      rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.5, 'rgba(255,255,255,.85)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
      cx.fillStyle = rg; cx.fillRect(0, 0, 32, 32);
      const size = { snow: 0.22, bubbles: 0.3, embers: 0.14, fireflies: 0.2, petals: 0.22, wind: 0.16, stardust: 0.16 }[FXD.kind] || 0.2;
      const glow = FXD.kind === 'fireflies' || FXD.kind === 'embers' || FXD.kind === 'stardust';
      const mat = new T.PointsMaterial({ size: size, map: new T.CanvasTexture(cv), vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true, opacity: 0.95,
                                         blending: glow ? T.AdditiveBlending : T.NormalBlending });
      const pts = new T.Points(g, mat); pts.frustumCulled = false; scene.add(pts);
      MFX = { pts: pts, pos: pos, vel: vel, N: N, t: 0 };
    } catch (err) { MFX = null; }
  }
  function updateMapFx(dt) {
    if (!MFX || !player) return;
    const M = MFX, k = FXD.kind, p = player, n = Math.min(M.N, Math.round(FXD.n * (FX_SCALE[G.level] || 1)));
    M.t += dt; M.pts.geometry.setDrawRange(0, n);
    const pos = M.pos, R = 25;                                              // dots live in a box 50 m wide round the player and wrap around
    for (let i = 0; i < n; i++) {
      const v = M.vel[i], j = i * 3;
      let x = pos[j], y = pos[j + 1], z = pos[j + 2];
      if (k === 'snow') { y -= (1.4 + v.s) * dt; x += Math.sin(M.t * 0.7 + v.a) * 0.5 * dt; z += Math.cos(M.t * 0.6 + v.a) * 0.4 * dt; }
      else if (k === 'bubbles') { y += (0.7 + v.s) * dt; x += Math.sin(M.t * 1.3 + v.a) * 0.4 * dt; z += Math.cos(M.t * 1.1 + v.a) * 0.4 * dt; }
      else if (k === 'embers') { y += (0.5 + v.s * 0.8) * dt; x += Math.sin(M.t * 2 + v.a) * 0.6 * dt; z += Math.cos(M.t * 1.7 + v.a) * 0.4 * dt; }
      else if (k === 'fireflies') { x += Math.sin(M.t * 0.8 + v.a) * 0.9 * dt; z += Math.cos(M.t * 0.7 + v.a * 2) * 0.9 * dt; y += Math.sin(M.t * 1.2 + v.a * 3) * 0.5 * dt; }
      else if (k === 'petals') { x += Math.sin(M.t * 0.5 + v.a) * 0.9 * dt + 0.3 * dt; z += Math.cos(M.t * 0.4 + v.a) * 0.6 * dt; y += Math.sin(M.t * 1.4 + v.a * 2) * 0.35 * dt - 0.1 * dt; }
      else if (k === 'wind') { x += (3 + v.s * 3) * dt; y += Math.sin(M.t * 2 + v.a) * 0.6 * dt; z += Math.sin(M.t * 0.5 + v.a) * 0.4 * dt; }
      else { x += Math.sin(M.t * 0.3 + v.a) * 0.25 * dt; y += Math.cos(M.t * 0.4 + v.a) * 0.2 * dt; z += Math.cos(M.t * 0.3 + v.a * 2) * 0.25 * dt; }
      // wrap round the player; set the height range per kind
      if (x - p.x > R) x -= 2 * R; else if (x - p.x < -R) x += 2 * R;
      if (z - p.z > R) z -= 2 * R; else if (z - p.z < -R) z += 2 * R;
      if (k === 'snow') { if (y < 0.05) y = 11 + Math.random() * 3; }
      else if (k === 'bubbles' || k === 'embers') { if (y > 11) y = 0.1; }
      else if (k === 'fireflies' || k === 'petals') { if (y < 0.4) y = 0.4 + Math.random(); if (y > 5) y = 5 - Math.random(); }
      else if (k === 'wind') { if (y < 0.6) y = 0.6; if (y > 7) y = 7; }
      else { if (y < 0.5) y = 8; if (y > 9) y = 0.7; }
      pos[j] = x; pos[j + 1] = y; pos[j + 2] = z;
    }
    M.pts.geometry.attributes.position.needsUpdate = true;
  }

  /* Gentle push so fighters do not stand inside each other */
  function separate() {
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i]; if (!a.alive) continue;
      for (let j = i + 1; j < ents.length; j++) {
        const b = ents[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2), f = (0.8 - d) / 2 / d;
          a.x -= dx * f; a.z -= dz * f; b.x += dx * f; b.z += dz * f;
          world.collide(a, P.radius); world.collide(b, P.radius);
        }
      }
    }
  }

  function animateMeshes(dt) {
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i], m = e.mesh;
      if (!m) continue;
      if (e.isRemote && !e.seen) { m.visible = false; continue; }
      const u = m.userData;
      if (!e.alive) {
        if (e.deathT > 0) { e.deathT -= dt; const s = Math.max(0.01, e.deathT / 0.5); m.scale.set(s, s, s); m.rotation.y += dt * 12; if (e.deathT <= 0) m.visible = false; }
        continue;
      }
      m.visible = e.protT > 0 ? (Math.floor(S.timeLeft * 12) % 2 === 0) : true;
      m.position.set(e.x, e.y, e.z); m.rotation.y = e.yaw;
      e.phase += e.speed * dt * 2.2;
      const sw = e.speed > 0.3 ? Math.sin(e.phase) * 0.8 : 0;
      u.legL.rotation.x = sw; u.legR.rotation.x = -sw;
      if (u.armL) { u.armL.rotation.x = -sw * 0.9; u.body.position.y = e.speed > 0.3 ? Math.abs(Math.sin(e.phase)) * 0.05 : 0; }
      const answering = e.state === 'answer' || e.state === 'obj';
      u.bubble.visible = answering;
      m.scale.y = answering ? 0.8 : 1;
      u.bodyMat.emissive.setHex(e.flashT > 0 ? 0x888888 : 0x000000);
      if (u.gunMesh) {                                    // show the bonus weapon this soldier is holding
        if (e.wShowT > 0) e.wShowT -= dt;
        const wantW = wantWeapon(e);
        if (u.curW !== wantW) { u.curW = wantW; u.gunMesh.geometry = shared.wgeo[wantW]; }
      }
    }
  }

  function updateCamera(dt) {
    const p = player;
    let eyeY = p.y + P.eye, pit = pitch, roll = 0;
    if (!p.alive && S.phase === 'play') { eyeY = p.y + 0.5; pit = -0.35; roll = 0.25; }
    camera.position.set(p.x, eyeY, p.z);
    camera.rotation.set(pit, yaw, roll, 'YXZ');
    if (gun) {
      gun.visible = p.alive;
      if (S.recoil > 0) S.recoil = Math.max(0, S.recoil - dt * 9);
      gun.position.z = -0.5 + S.recoil * 0.05; gun.rotation.x = S.recoil * 0.05;
      if (S.muzzleT > 0) { S.muzzleT -= dt; if (S.muzzleT <= 0) muzzle.visible = false; }
    }
  }

  function updateEffects(dt) {
    for (let i = 0; i < rings.length; i++) {
      const r = rings[i];
      if (r.life > 0) { r.life -= dt; const k = 1 - Math.max(0, r.life) / 0.32; r.mesh.scale.setScalar(1 + k * 5); r.mesh.material.opacity = (1 - k) * 0.9; if (r.life <= 0) r.mesh.visible = false; }
    }
    for (let i = 0; i < tracers.length; i++) {
      const t = tracers[i];
      if (t.life > 0) { t.life -= dt; t.mesh.material.opacity = Math.max(0, t.life / 0.12) * 0.9; if (t.life <= 0) t.mesh.visible = false; }
    }
    for (let i = 0; i < sparks.length; i++) {
      const s = sparks[i];
      if (s.life > 0) {
        s.life -= dt; s.vy -= 12 * dt;
        s.mesh.position.x += s.vx * dt; s.mesh.position.y = Math.max(0.05, s.mesh.position.y + s.vy * dt); s.mesh.position.z += s.vz * dt;
        s.mesh.material.opacity = Math.min(1, s.life * 3);
        if (s.life <= 0) s.mesh.visible = false;
      }
    }
  }

  /* =====================================================================
     HUD
     ===================================================================== */
  function resetHudViews() {
    show('ov-ready', true);
    ['ov-pause', 'ov-count', 'ov-death', 'qp', 'ov-end', 'scoreboard'].forEach(function (id) { show(id, false); });
    $('toast').classList.remove('show'); $('feed').innerHTML = '';
    $('radar').classList.toggle('hidden', false);
    const ctrl = $('ready-look'); if (ctrl) ctrl.textContent = st.lookMode === 'lock' ? 'Mouse = look & aim  ·  Left click = fire' : 'Hold RIGHT mouse button (or arrow keys) to look  ·  Left click or F = fire';
    setText('sc-target', RB ? 'Round 1 · first to ' + RB.eng.need : 'First to ' + S.target);
    const goal = $('ready-goal');
    if (goal) {
      if (RB) goal.textContent = myTeam() === 0 ? '🔵 Blue: free the 🆘 hostage and bring them to the blue zone, or defuse the 💣! Best of ' + RB.cfg.rounds + ' rounds.' : '🔴 Red: plant the 💣 at the site and keep it safe for 15 seconds! Best of ' + RB.cfg.rounds + ' rounds.';
      else goal.textContent = NET ? 'You are on the ' + ES.TEAMS[NET.team].name + '. Tag the ' + ES.TEAMS[1 - NET.team].name + '!' : 'Tag the Red Team before time runs out!';
    }
    show('ready-rb', !!RB);
    const fxl = $('ready-fx'); if (fxl) { fxl.textContent = FXD ? FXD.text : ''; show('ready-fx', !!FXD); }
    show('pause-net', !!NET);
    updateHud(0, true);
  }

  function updateHud(dt, force) {
    const p = player;
    setText('sc-blue', String(S.score[0])); setText('sc-red', String(S.score[1]));
    const tl = Math.ceil(S.timeLeft), mm = Math.floor(tl / 60), ss = tl % 60;
    setText('sc-time', mm + ':' + (ss < 10 ? '0' : '') + ss);
    if (RB) updateRbHud();
    setText('hp-text', String(Math.ceil(p.hp)));
    const hpEl = $('hp-fill'); hpEl.style.width = clamp(p.hp, 0, 100) + '%';
    hpEl.className = p.hp < 30 ? 'low' : '';
    if (S.weapon !== 'pistol') {                            // bonus weapon: show its own shots + time left
      const W = ES.WEAPONS[S.weapon];
      setText('ammo-lbl', W.icon + ' ' + W.name.toUpperCase());
      setText('ammo-num', String(S.wAmmo));
      $('ammo').classList.remove('empty', 'low'); $('ammo').classList.add('bonus');
      setText('ammo-hint', Math.ceil(S.wTime) + ' s left  ·  blaster ⚡' + S.ammo);
    } else {
      setText('ammo-lbl', '⚡ AMMO');
      setText('ammo-num', String(S.ammo));
      $('ammo').classList.remove('bonus');
      $('ammo').classList.toggle('empty', S.ammo === 0);
      $('ammo').classList.toggle('low', S.ammo > 0 && S.ammo <= 4);
      setText('ammo-hint', S.ammo === 0 ? 'Press R – answer a question!' : (S.ammo <= 4 ? 'Low! Press R to recharge' : 'R = recharge'));
    }
    setText('streak', S.streak >= 2 ? '🔥 ' + S.streak + ' right in a row' : '');
    // damage flash + direction arrow
    if (S.dmgFlash > 0) S.dmgFlash = Math.max(0, S.dmgFlash - dt * 1.2);
    $('dmg-flash').style.opacity = S.dmgFlash;
    const hd = $('hit-dir');
    if (S.dmgFlash > 0 && S.hurtFrom !== undefined) { hd.style.opacity = Math.min(1, S.dmgFlash * 2); hd.style.transform = 'rotate(' + ((S.hurtFrom - yaw) * -180 / Math.PI) + 'deg)'; }
    else hd.style.opacity = 0;
    // hit marker
    if (S.hitMark > 0) S.hitMark -= dt;
    const hm = $('hitmarker'); hm.style.opacity = S.hitMark > 0 ? 1 : 0; hm.className = S.hitHead ? 'head' : '';
    $('shield').style.opacity = p.protT > 0 ? 0.5 : 0;
    // kill feed
    if (S.feed.length) {
      let changed = S.feedDirty;
      for (let i = S.feed.length - 1; i >= 0; i--) { S.feed[i].life -= dt; if (S.feed[i].life <= 0) { S.feed.splice(i, 1); changed = true; } }
      if (changed) renderFeed();
      S.feedDirty = false;
    } else if (S.feedDirty) { renderFeed(); S.feedDirty = false; }
    // radar
    radarT -= dt;
    if (radarT <= 0 || force) { radarT = 0.1; drawRadar(); }
    if (!$('scoreboard').classList.contains('hidden')) { hudT -= dt; if (hudT <= 0) { hudT = 0.5; renderScoreboard(); } }
  }

  function renderFeed() {
    const box = $('feed'); box.innerHTML = '';
    S.feed.forEach(function (f) {
      const d = document.createElement('div'); d.className = 'fl';
      const a = document.createElement('b'); a.textContent = f.a.name; a.style.color = ES.TEAMS[f.a.team].css;
      const t = document.createElement('b'); t.textContent = f.t.name; t.style.color = ES.TEAMS[f.t.team].css;
      d.appendChild(a); d.appendChild(document.createTextNode(f.head ? ' 🎯 ' : ' ▸ ')); d.appendChild(t);
      box.appendChild(d);
    });
  }

  function drawRadar() {
    const c = radarCtx, s = 132 / (world.half * 2);
    c.drawImage(radarBase, 0, 0);
    if (RB) drawRbRadar(c, s);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.isPlayer) continue;
      if (e.team !== myTeam() && !st.radar) continue;
      c.fillStyle = e.team === myTeam() ? '#58a6ff' : '#ff6a45';
      c.beginPath(); c.arc((e.x + world.half) * s, (e.z + world.half) * s, 3, 0, 7); c.fill();
    }
    if (player.alive) {
      const px = (player.x + world.half) * s, pz = (player.z + world.half) * s;
      c.save(); c.translate(px, pz); c.rotate(-yaw);
      c.fillStyle = '#fff'; c.beginPath(); c.moveTo(0, -7); c.lineTo(5, 5); c.lineTo(0, 2); c.lineTo(-5, 5); c.closePath(); c.fill();
      c.restore();
    }
  }

  function showScoreboard(on) { show('scoreboard', on); if (on) renderScoreboard(); }
  function renderScoreboard() {
    const box = $('sb-body'); box.innerHTML = '';
    [0, 1].forEach(function (team) {
      const col = document.createElement('div'); col.className = 'sbcol';
      const h = document.createElement('h3'); h.textContent = ES.TEAMS[team].name + ' – ' + S.score[team]; h.style.background = ES.TEAMS[team].css; col.appendChild(h);
      ents.filter(function (e) { return e.team === team; }).sort(function (a, b) { return b.kills - a.kills; }).forEach(function (e) {
        const r = document.createElement('div'); r.className = 'sbrow' + (e.isPlayer ? ' me' : '');
        const n = document.createElement('span'); n.textContent = e.name + (e.alive ? '' : ' 💤');
        const k = document.createElement('span'); k.textContent = e.kills + ' / ' + e.deaths;
        r.appendChild(n); r.appendChild(k); col.appendChild(r);
      });
      box.appendChild(col);
    });
  }


  /* =====================================================================
     RESCUE & BOMB MODE
     The rules live in rb.js. Here we draw the hostage / bomb / safe zone, play the sounds,
     show the banners and handle the E key. (Class match: the teacher's page is the referee and
     sends the round state in every snapshot; solo: this computer runs the rules.)
     ===================================================================== */
  const RB_TXT = {
    rescue: { ask: '🆘 Correct answer = the hostage is freed!', done: '🆘 Freeing the hostage…' },
    plant: { ask: '💣 Correct answer = the bomb is planted!', done: '💣 Planting the bomb…' },
    defuse: { ask: '🔧 Correct answer = the bomb is defused!', done: '🔧 Defusing the bomb…' }
  };
  const RB_WHY = {
    saved: '🆘 The hostage is saved!', defuse: '🔧 The bomb was defused!', boom: '💥 BOOM! The bomb exploded!',
    tags: '⏱ Time is up – more tags wins', tie: '⏱ Time is up – a tie goes to Blue'
  };
  const eidEnt = function (id) { if (NET) return NET.byEid[id] || null; for (let i = 0; i < ents.length; i++) if (ents[i].eid === id) return ents[i]; return null; };

  function buildRB() {
    const sp = world.rbSpots, R = ES.RB;
    const V = RBV = { g: new T.Group(), tickT: 0, boomT: 0, flash: 0, hx: sp.h.x, hz: sp.h.z, walkT: 0, blink: 0, spots: sp };
    scene.add(V.g);
    const mat = function (c, o) { return new T.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, side: T.DoubleSide, fog: false }); };
    const zone = function (p, color, r) {
      const gy = world.groundAt(p.x, p.z, 3) + 0.06;
      const ring = new T.Mesh(new T.RingGeometry(r - 0.3, r, 40), mat(color, 0.9)); ring.rotation.x = -Math.PI / 2; ring.position.set(p.x, gy, p.z);
      const disc = new T.Mesh(new T.CircleGeometry(r, 32), mat(color, 0.16)); disc.rotation.x = -Math.PI / 2; disc.position.set(p.x, gy - 0.01, p.z);
      const beam = new T.Mesh(new T.CylinderGeometry(0.35, 0.35, 9, 8, 1, true), mat(color, 0.26)); beam.position.set(p.x, gy + 4.5, p.z);
      V.g.add(ring, disc, beam);
      return { ring: ring, disc: disc, beam: beam, y: gy };
    };
    V.safe = zone(sp.s, 0x58a6ff, R.SAFE_R);
    V.site = zone(sp.z, 0xff9a3c, 2.6);
    const label = function (txt, css, x, y, z) { const l = makeNameSprite(txt, css, true); l.scale.set(2.1, 0.52, 1); l.position.set(x, y, z); V.g.add(l); return l; };
    label('🔵 SAFE ZONE', '#2f86ff', sp.s.x, V.safe.y + 3.3, sp.s.z);
    V.siteLabel = label('💣 BOMB SITE', '#d9731a', sp.z.x, V.site.y + 3.3, sp.z.z);
    // the bomb (only shown while it ticks)
    V.bomb = new T.Group(); V.bomb.position.set(sp.z.x, V.site.y, sp.z.z); V.bomb.visible = false;
    const bb = new T.Mesh(new T.BoxGeometry(0.8, 0.3, 0.55), new T.MeshLambertMaterial({ color: 0x2a2f38 })); bb.position.y = 0.2; V.bomb.add(bb);
    const bs = new T.Mesh(new T.BoxGeometry(0.8, 0.06, 0.12), new T.MeshBasicMaterial({ color: 0xffd23f })); bs.position.set(0, 0.37, 0.12); V.bomb.add(bs);
    V.bombLed = new T.Mesh(new T.BoxGeometry(0.16, 0.1, 0.16), new T.MeshBasicMaterial({ color: 0xff2a1a })); V.bombLed.position.set(0.25, 0.4, -0.1); V.bomb.add(V.bombLed);
    V.g.add(V.bomb);
    // the hostage: a small tied-up civilian in an orange suit, blindfolded
    const hg = mergeBoxes([
      { x: 0, y: 0.45, z: 0, w: 0.4, h: 0.9, d: 0.26, c: 0x39425a },
      { x: 0, y: 1.15, z: 0, w: 0.56, h: 0.62, d: 0.32, c: 0xff8a1f },
      { x: 0, y: 1.62, z: 0, w: 0.34, h: 0.34, d: 0.34, c: 0xf1c9a5 },
      { x: 0, y: 1.66, z: -0.01, w: 0.37, h: 0.1, d: 0.37, c: 0xffffff },
      { x: 0, y: 1.1, z: 0.2, w: 0.4, h: 0.16, d: 0.12, c: 0xd8d8d8 },
      { x: -0.36, y: 1.1, z: 0.04, w: 0.13, h: 0.5, d: 0.13, c: 0xff8a1f },
      { x: 0.36, y: 1.1, z: 0.04, w: 0.13, h: 0.5, d: 0.13, c: 0xff8a1f }
    ]);
    V.hostage = new T.Group();
    V.hostage.add(new T.Mesh(hg, new T.MeshLambertMaterial({ vertexColors: true })));
    const hgy = world.groundAt(sp.h.x, sp.h.z, 3);
    V.hostage.position.set(sp.h.x, hgy, sp.h.z);
    V.hLabel = label('🆘 HOSTAGE', '#d9a000', sp.h.x, hgy + 2.5, sp.h.z);
    V.g.add(V.hostage);
    // the explosion ball
    V.ball = new T.Mesh(new T.SphereGeometry(1, 14, 10), new T.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    V.ball.visible = false; V.g.add(V.ball);
    G.rbv = V;
  }

  /* every frame: move the hostage, show / hide the bomb, tick sounds, explosion animation */
  function updateRB(dt) {
    const V = RBV, st = RB.eng.st, sp = V.spots;
    // hostage glides to where the rules say they are (they follow whoever freed them)
    const k = 1 - Math.exp(-dt * 12), dx = st.h.x - V.hx, dz = st.h.z - V.hz, dist = Math.hypot(dx, dz);
    if (dist > 7) { V.hx = st.h.x; V.hz = st.h.z; } else { V.hx += dx * k; V.hz += dz * k; }
    const moving = dist > 0.25 && st.h.s === 1;
    V.walkT += dt * (moving ? 9 : 2);
    const hy = world.groundAt(V.hx, V.hz, 4);
    V.hostage.position.set(V.hx, hy + (moving ? Math.abs(Math.sin(V.walkT)) * 0.07 : 0), V.hz);
    if (dist > 0.12) V.hostage.rotation.y = Math.atan2(dx, dz) + Math.PI;
    V.hostage.rotation.z = moving ? 0 : Math.sin(V.walkT) * 0.03;
    V.hLabel.position.set(V.hx, hy + 2.5, V.hz);
    V.hLabel.visible = st.h.s !== 3;
    // the bomb
    const planted = st.b.s === 1;
    V.bomb.visible = planted || (st.b.s === 2);
    V.bombLed.material.color.setHex(st.b.s === 2 ? 0x30e060 : (V.blink > 0 ? 0xff2a1a : 0x601010));
    if (V.blink > 0) V.blink -= dt;
    V.site.ring.material.color.setHex(planted ? 0xff3a2a : (st.b.s === 2 ? 0x30e060 : 0xff9a3c));
    V.site.beam.material.color.setHex(planted ? 0xff3a2a : (st.b.s === 2 ? 0x30e060 : 0xff9a3c));
    V.site.beam.material.opacity = planted ? 0.35 + Math.abs(Math.sin(performance.now() / 120)) * 0.3 : 0.26;
    V.siteLabel.visible = st.b.s !== 3;
    // ticking sound: slow, then faster in the last 5 seconds (heard everywhere, louder when you are close)
    if (planted && st.ph === 0) {
      V.tickT -= dt;
      if (V.tickT <= 0) {
        const t = st.b.t;
        V.tickT = t > 5 ? 1.0 : (t > 2.5 ? 0.5 : 0.25);
        const d = Math.hypot(player.x - sp.z.x, player.z - sp.z.z), vol = clamp(1.1 - d / 70, 0.35, 1);
        ES.audio.sfx(t > 5 ? 'bomb_tick' : 'bomb_fast', vol); V.blink = 0.12;
      }
    }
    // the explosion
    if (V.boomT > 0) {
      V.boomT -= dt;
      const u = 1 - Math.max(0, V.boomT) / 1.1;
      V.ball.visible = V.boomT > 0; V.ball.scale.setScalar(1 + u * 13); V.ball.material.opacity = (1 - u) * 0.7;
      V.ball.position.set(sp.z.x, V.site.y + 1.2, sp.z.z);
    }
    if (V.flash > 0) { V.flash = Math.max(0, V.flash - dt * 1.2); $('boom-flash').style.opacity = V.flash; }
  }

  /* what the player could do right now with the E key (or null) */
  function rbContext() {
    if (!RB || !player.alive || S.phase !== 'play') return null;
    const st = RB.eng.st, sp = world.rbSpots, r = ES.RB.ACT_R - 0.9, t = myTeam();
    if (st.ph !== 0) return null;
    if (t === 0) {
      if (st.b.s === 1 && Math.hypot(player.x - sp.z.x, player.z - sp.z.z) <= r) return 'defuse';
      if (st.h.s === 0 && Math.hypot(player.x - st.h.x, player.z - st.h.z) <= r) return 'rescue';
    } else if (st.b.s === 0 && st.h.s !== 3 && Math.hypot(player.x - sp.z.x, player.z - sp.z.z) <= r) return 'plant';
    return null;
  }
  function openMission() {
    if (S.phase !== 'play' || S.paused || S.qOpen || !player.alive) return;
    const k = rbContext();
    if (!k) {
      toast(myTeam() === 0 ? '🆘 Go next to the hostage (or the ticking 💣) and press E' : '💣 Go to the bomb site and press E to plant', 2);
      return;
    }
    openQuestion(k);
  }
  /* a right answer on a mission question: do it (solo: here, class: ask the referee) */
  function rbDo(kind) {
    if (!RB) return;
    if (NET) { netSend({ t: 'rb', a: kind }); return; }
    if (!RB.eng.act(player, kind)) toast('Too late! 😬', 1.4);
  }
  G.rbAct = function (b, kind) { return RB ? RB.eng.act(b, kind) : false; };       // bots do their mission through here

  /* sounds, banners and effects for a Rescue & Bomb event (solo: called by the rules engine; class: sent by the referee) */
  function rbHook(name, a, b) {
    rbEffects(name, a, b);
    if (name === 'round') rbResetRound();
  }
  function showRound(title, sub, cls, secs) {
    $('rd-title').textContent = title; $('rd-sub').textContent = sub;
    $('ov-round').className = 'overlay clear ' + (cls || '');
    S.bannerT = secs || 3;
  }
  function rbEffects(name, a, b) {
    if (!RB || !S) return;
    const st = RB.eng.st, sp = world.rbSpots, who = eidEnt(a), nm = who ? who.name : 'Someone';
    if (name === 'rescue') {
      toast('🆘 ' + nm + ' freed the hostage! Bring them to the blue zone!', 3); ES.audio.sfx('rb_rescue');
    } else if (name === 'drop') {
      toast('🆘 The hostage was dropped!', 2.5);
    } else if (name === 'pickup') {
      toast('🆘 ' + nm + ' has the hostage again!', 2.5);
    } else if (name === 'plant') {
      toast('💣 ' + nm + ' planted the bomb! 15 seconds!', 3); ES.audio.sfx('rb_plant'); ES.audio.announce('planted');
      if (RBV) { RBV.tickT = 0.4; RBV.blink = 0.2; }
    } else if (name === 'defuse') {
      ES.audio.sfx('rb_rescue'); ES.audio.announce('defused');
    } else if (name === 'boom') {
      if (RBV) {
        RBV.boomT = 1.1; RBV.flash = 0.9; const y = RBV.site.y + 1;
        burst(sp.z.x, y, sp.z.z, 0xff8a3c, 26); burst(sp.z.x, y + 1, sp.z.z, 0xffd23f, 22); burst(sp.z.x + 1, y, sp.z.z - 1, 0xffffff, 12);
      }
      ES.audio.sfx('bomb_boom', 1);
    } else if (name === 'win') {
      if (S.qOpen) cancelQuestion(true);
      fireHeld = false;
      const mine = a === myTeam();
      const total = st.wins[0] + ' – ' + st.wins[1];
      let title = mine ? '✅ ROUND WON!' : '❌ ROUND LOST';
      if (st.final) title = (a === 0 ? '🔵 BLUE' : '🔴 RED') + ' WINS THE MATCH!';
      showRound(title, (RB_WHY[b] || '') + '   ·   Blue ' + total + ' Red', a === 0 ? 'blue' : 'red', ES.RB.BETWEEN_SECS - 0.4);
      if (b === 'saved') { ES.audio.sfx('rb_rescue'); ES.audio.announce('saved'); }
      else if (b !== 'boom' && b !== 'defuse') ES.audio.sfx(mine ? 'correct' : 'wrong');
    } else if (name === 'round') {
      if (a > 1) { fireHeld = false; }
      showRound('ROUND ' + a, myTeam() === 0 ? '🔵 Free the hostage or defuse the bomb!' : '🔴 Plant the bomb and stop the rescue!', myTeam() === 0 ? 'blue' : 'red', 2.4);
      if (a > 1) { ES.audio.sfx('go'); ES.audio.announce('go'); }
      if (RBV) { RBV.tickT = 0; RBV.boomT = 0; RBV.ball.visible = false; RBV.flash = 0; $('boom-flash').style.opacity = 0; RBV.hx = sp.h.x; RBV.hz = sp.h.z; }
    }
  }
  /* solo: a new round starts - everybody back to their base with full health */
  function rbResetRound() {
    const used = [[], []];
    ents.forEach(function (e) {
      placeAtSpawn(e, used);
      e.alive = true; e.hp = P.hp; e.protT = 1.5; e.target = null; e.path = null; e.sees = false; e.state = 'roam'; e.ammo = e.D.mag; e.deathT = 0; e.alert = 0; e.objKind = ''; e.vx = e.vz = e.vy = 0;
      if (e.mesh) { e.mesh.visible = true; e.mesh.scale.set(1, 1, 1); }
    });
    S.ammo = Math.max(S.ammo, AMMO.start); S.sinceHurt = 99; dropWeapon(true);
    if (S.qOpen) cancelQuestion(true);
    show('ov-death', false);
  }

  function updateRbHud() {
    const st = RB.eng.st, t = myTeam(), me = player.eid;
    setText('sc-target', 'Round ' + st.round + ' · first to ' + RB.eng.need);
    if (st.b.s === 1) { setText('sc-time', '💣 ' + Math.max(0, Math.ceil(st.b.t))); }
    let msg = '', cls = '';
    if (st.ph !== 0) msg = '';
    else if (st.b.s === 1) {
      msg = t === 0 ? '💣 BOMB PLANTED! Run to the site and defuse it (E)!' : '💣 BOMB PLANTED! Guard it until it explodes!'; cls = 'bomb';
    } else if (st.h.s === 1) {
      msg = t === 0 ? (st.h.c === me ? '🆘 You have the hostage! Run to the 🔵 blue zone!' : '🆘 Protect the hostage and get them to the blue zone!') : '🆘 Tag the hostage carrier before they get home!';
      cls = t === 0 ? 'blue' : '';
    } else if (st.h.s === 2) {
      msg = t === 0 ? '🆘 The hostage was dropped! Walk to them to pick them up!' : '🆘 The hostage was dropped – stop Blue from picking them up!';
    } else {
      msg = t === 0 ? '🆘 Free the hostage in the red base (E)  ·  or stop the bomb' : '💣 Plant the bomb at the site (E)  ·  guard the hostage';
    }
    show('rb-bar', !!msg);
    if (msg) { const bar = $('rb-bar'); if (bar.textContent !== msg) bar.textContent = msg; bar.className = cls; }
    const k = rbContext(), hint = $('rb-hint');
    const show2 = !!k && !S.qOpen && !S.paused;
    hint.classList.toggle('hidden', !show2);
    if (show2) {
      const txt = { rescue: '🆘 Free the hostage', plant: '💣 Plant the bomb', defuse: '🔧 Defuse the bomb' }[k];
      if (hint.dataset.k !== k) { hint.dataset.k = k; hint.innerHTML = '<kbd>E</kbd>' + txt; }
    }
  }
  function drawRbRadar(c, s) {
    const st = RB.eng.st, sp = world.rbSpots, h = world.half;
    c.strokeStyle = '#58a6ff'; c.lineWidth = 2; c.fillStyle = 'rgba(88,166,255,.35)';
    c.beginPath(); c.arc((sp.s.x + h) * s, (sp.s.z + h) * s, ES.RB.SAFE_R * s, 0, 7); c.fill(); c.stroke();
    const bx = (sp.z.x + h) * s, bz = (sp.z.z + h) * s;
    c.fillStyle = st.b.s === 1 ? '#ff2a1a' : (st.b.s === 2 ? '#30e060' : '#ff9a3c');
    c.beginPath(); c.moveTo(bx, bz - 6); c.lineTo(bx + 6, bz); c.lineTo(bx, bz + 6); c.lineTo(bx - 6, bz); c.closePath(); c.fill();
    if (st.h.s !== 3) { c.fillStyle = '#ffd23f'; c.strokeStyle = '#7a5a00'; c.lineWidth = 1.5; c.beginPath(); c.arc((st.h.x + h) * s, (st.h.z + h) * s, 4.5, 0, 7); c.fill(); c.stroke(); }
  }

  /* =====================================================================
     CLASS MATCH (online with the teacher's page as referee)
     The referee sends "snapshots": where everybody is, their health, the score and the clock.
     We move our own player ourselves (so the controls feel instant) and report our position.
     ===================================================================== */
  function netTick(dt) {
    const p = player;
    if (S.phase === 'ready' || S.phase === 'wait' || S.phase === 'count') lookKeys(dt);
    netInterp(dt);
    if (S.phase === 'play') {
      if (S.fxT > 0 && FXD) { S.fxT -= dt; if (S.fxT <= 0) toast(FXD.text, 4.5); }
      S.qCd = Math.max(0, S.qCd - dt);
      S.timeLeft = Math.max(0, S.timeLeft - dt); if (!RB) announceClock();         // the referee corrects this a few times a second
      if (S.qOpen && S.qState === 'asking' && S.qMax) {
        S.qTime -= dt;
        $('qp-fill').style.width = Math.max(0, 100 * S.qTime / S.qMax) + '%';
        $('qp-fill').classList.toggle('urgent', S.qTime < 6);
        if (S.qTime <= 0) chooseAnswer(-1);
      }
      updatePlayer(dt, dt);
      musicMood(dt);
    }
    animateMeshes(dt);
    updateCamera(dt);
    updateHud(dt);
    // tell the referee where we are (15 times a second)
    if (S.phase !== 'ready' && S.phase !== 'ended') {
      NET.sendT -= dt;
      if (NET.sendT <= 0) { NET.sendT = 0.066; netSend({ t: 'st', x: r2(p.x), y: r2(p.y), z: r2(p.z), yaw: r2(yaw), q: S.qOpen ? 1 : 0 }); }
    }
  }

  /* slide the other players smoothly toward where the last snapshot said they are */
  function netInterp(dt) {
    const k = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.isRemote || !e.seen || !e.alive) continue;
      if (Math.abs(e.tx - e.x) + Math.abs(e.tz - e.z) > 6) { e.x = e.tx; e.y = e.ty; e.z = e.tz; e.yaw = e.tyaw; continue; }   // teleport (respawn)
      e.x += (e.tx - e.x) * k; e.y += (e.ty - e.y) * k; e.z += (e.tz - e.z) * k;
      let d = e.tyaw - e.yaw;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      e.yaw += d * k;
    }
  }

  function netPhase(ph, cd) {
    NET.hostPh = ph;
    if (S.phase === 'ready' || S.phase === 'ended') return;
    if (ph === 'count') {
      if (S.phase !== 'count') { S.phase = 'count'; show('ov-count', true); }
      const n = Math.ceil(cd);
      if (n !== NET.cdLast) { NET.cdLast = n; if (n > 0) { $('count-num').textContent = n; ES.audio.sfx('count'); } }
    } else if (ph === 'play' && S.phase !== 'play') {
      S.phase = 'play'; show('ov-count', false);
      if (RB) rbEffects('round', 1); else toast('GO! Press R to charge your blaster ⚡', 2.5); ES.audio.sfx('go'); ES.audio.announce('go');
    }
  }

  G.netSnap = function (m) {
    if (!NET || !G.active || !S) return;
    S.score = [m.sc[0], m.sc[1]];
    S.timeLeft = m.tl;
    if (typeof m.cr === 'number') S.crMask = m.cr;
    if (RB && m.rb) RB.eng.apply(m.rb);                     // Rescue & Bomb: copy the referee's round state first, then react to the events
    netPhase(m.ph, m.cd);
    for (let i = 0; i < m.ev.length; i++) netEvent(m.ev[i]);
    for (let i = 0; i < m.e.length; i++) {
      const r = m.e[i], e = NET.byEid[r[0]];
      if (!e) continue;
      const alive = !!(r[6] & 1);
      if (e.isPlayer) {
        e.hp = r[5];
        if (!alive && e.alive && S.phase === 'play') netDie();
        e.protT = (r[6] & 4) ? 1 : 0;
      } else {
        e.tx = r[1]; e.ty = r[2]; e.tz = r[3]; e.tyaw = r[4];
        if (!e.seen) { e.seen = true; e.x = e.tx; e.y = e.ty; e.z = e.tz; e.yaw = e.tyaw; if (e.mesh) e.mesh.visible = true; }
        if (e.alive && !alive) { e.alive = false; e.deathT = 0.5; }
        else if (!e.alive && alive) { e.alive = true; e.deathT = 0; e.x = e.tx; e.y = e.ty; e.z = e.tz; e.yaw = e.tyaw; if (e.mesh) { e.mesh.visible = true; e.mesh.scale.set(1, 1, 1); } }
        e.hp = r[5]; e.state = (r[6] & 2) ? 'answer' : 'roam'; e.protT = (r[6] & 4) ? 1 : 0; e.speed = r[7];
        const wk = (r[6] >> 3) & 7; if (wk && ES.WEAPON_IDS[wk - 1]) { e.wShow = ES.WEAPON_IDS[wk - 1]; e.wShowT = 1; } else e.wShowT = 0;       // which bonus weapon they hold
      }
    }
  };

  function netEvent(ev) {
    const k = ev[0];
    if (k === 'shot') {
      if (ev[8] === NET.you) return;                       // our own shot is already drawn
      const WW = ev[9] && ES.WEAPONS[ev[9]];
      G.addTracer(ev[1], ev[2], ev[3], ev[4], ev[5], ev[6], ev[7], WW ? WW.color : 0);
      G.soundAt(WW ? 'w_' + ev[9] : 'botShoot', ev[1], ev[3], WW ? 0.8 : 0.7);
    } else if (k === 'boom') {
      burst(ev[1], ev[2], ev[3], 0xff8a3c, 16); burst(ev[1], ev[2] + 0.4, ev[3], 0xffd23f, 10);
      if (ev[4] !== NET.you) G.soundAt('boom', ev[1], ev[3], 1);
    } else if (k === 'kill') {
      const a = NET.byEid[ev[1]], v = NET.byEid[ev[2]];
      if (!v) return;
      v.deaths++; if (a) { a.kills++; feed(a, v, !!ev[3]); announceKill(a); }
      burst(v.x, v.y + 1, v.z, ES.TEAMS[v.team].color, 12);
      if (v !== player) G.soundAt('scream', v.x, v.z, 0.9);
      if (v === player) $('death-text').textContent = a ? 'Tagged by ' + a.name + '!' : 'You were tagged!';
      if (a === player) { S.stats.kills++; ES.audio.sfx('kill'); }
    } else if (k === 'rb') {
      rbEffects(ev[1], ev[2], ev[3]);
    } else if (k === 'hurt') {
      if (ev[1] !== NET.you) return;
      const a = NET.byEid[ev[2]];
      S.sinceHurt = 0; S.dmgFlash = 0.5;
      if (a) S.hurtFrom = Math.atan2(-(a.x - player.x), -(a.z - player.z));
      ES.audio.sfx('hurt');
    }
  }

  /* the referee says we were tagged */
  function netDie() {
    const p = player;
    p.alive = false; p.hp = 0; p.respawnT = P.respawn;
    S.stats.deaths++; dropWeapon(true);
    if (S.qOpen) cancelQuestion(true);
    fireHeld = false;
    show('ov-death', true);
    ES.audio.sfx('die'); ES.audio.sfx('scream', 1);
  }

  G.netRespawn = function (m) {
    if (!NET || !G.active || !S) return;
    const p = player;
    p.x = m.x; p.z = m.z; p.y = 0; p.vx = p.vz = p.vy = 0; yaw = m.yaw; pitch = 0;
    p.alive = true; p.hp = P.hp; p.protT = P.protect;
    if (S.weapon !== 'pistol') dropWeapon(true);              // a new round starts with the normal blaster
    if (S.qOpen && RB) cancelQuestion(true);
    S.ammo = Math.max(S.ammo, AMMO.start); S.sinceHurt = 99;
    show('ov-death', false);
    ES.audio.sfx('respawn');
  };

  G.netEnd = function (m) {
    if (!NET || !G.active || !S) return;
    S.score = [m.sc[0], m.sc[1]]; NET.rows = m.rows;
    endMatch(m.reason);
  };

  /* class results table on the end screen (everybody's tags / times tagged) */
  function renderEndBoard() {
    const box = $('end-board'); if (!box) return;
    box.innerHTML = '';
    if (!NET || !NET.rows) { box.classList.add('hidden'); return; }
    box.classList.remove('hidden');
    [0, 1].forEach(function (team) {
      const col = document.createElement('div'); col.className = 'sbcol';
      const h = document.createElement('h3'); h.textContent = ES.TEAMS[team].name + ' – ' + S.score[team]; h.style.background = ES.TEAMS[team].css; col.appendChild(h);
      NET.rows.filter(function (r) { return r.team === team; }).sort(function (a, b) { return b.kills - a.kills; }).forEach(function (r) {
        const row = document.createElement('div'); row.className = 'sbrow' + (r.eid === NET.you ? ' me' : '');
        const n = document.createElement('span'); n.textContent = (r.bot ? '🤖 ' : '') + r.name;
        const k = document.createElement('span'); k.textContent = r.kills + ' / ' + r.deaths;
        row.appendChild(n); row.appendChild(k); col.appendChild(row);
      });
      box.appendChild(col);
    });
  }
  G.isNet = function () { return !!NET; };

  /* ---------- buttons used by the overlays ---------- */
  G.resume = resume;
  G.pause = pause;
  G.openQuestion = openQuestion;

  /* ---------- hooks for automatic testing ---------- */
  G.debug = {
    get S() { return S; }, get ents() { return ents; }, get player() { return player; },
    get world() { return world; }, get camera() { return camera; }, get quiz() { return quiz; },
    get info() { return renderer ? { calls: renderer.info.render.calls, tris: renderer.info.render.triangles } : null; },
    look: function (y, p) { yaw = y; pitch = p; },
    getLook: function () { return { yaw: yaw, pitch: pitch }; },
    setFire: function (v) { fireHeld = v; },
    choose: chooseAnswer, closeQ: closeQuestion,
    end: endMatch, get net() { return NET; }, get rb() { return RB; }, get rbv() { return RBV; }, rbDo: rbDo, openMission: openMission,
    give: giveWeapon, shoot: playerShoot,
    step: function (n, dt) { for (let i = 0; i < n; i++) tick(dt); }   // run the game without drawing (used for fast automatic tests)
  };
})();
