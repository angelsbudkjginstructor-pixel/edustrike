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
  let radarBase, radarCtx, radarT = 0, hudT = 0;
  let fpsFrames = 0, fpsTime = 0, fpsSlowT = 0, fpsTipShown = false;
  let toastT = 0, closeTimer = 0, relockTimer = 0;
  const cache = {};

  function setText(id, v) { if (cache[id] !== v) { cache[id] = v; const el = $(id); if (el) el.textContent = v; } }
  function show(id, on) { const el = $(id); if (el) el.classList.toggle('hidden', !on); }
  function toast(msg, secs) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); toastT = secs || 2; }

  /* =====================================================================
     START / STOP
     ===================================================================== */
  G.start = function () {
    if (G.active) G.stop();
    st = JSON.parse(JSON.stringify(ES.settings));
    gfx = ES.GFX[st.gfx] || ES.GFX.low;

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
    if (gfx.shadows) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFShadowMap; }

    /* scene: sky gradient, fog, lights */
    scene = new T.Scene();
    const sc = document.createElement('canvas'); sc.width = 2; sc.height = 128;
    const sx = sc.getContext('2d'), grad = sx.createLinearGradient(0, 0, 0, 128);
    grad.addColorStop(0, '#5db7ff'); grad.addColorStop(0.6, '#bfe6ff'); grad.addColorStop(1, '#eaf7ff');
    sx.fillStyle = grad; sx.fillRect(0, 0, 2, 128);
    const skyTex = new T.CanvasTexture(sc);
    if (T.SRGBColorSpace) skyTex.colorSpace = T.SRGBColorSpace;
    scene.background = skyTex;
    scene.fog = new T.Fog(0xcfeaff, 22, gfx.fog);
    scene.add(new T.HemisphereLight(0xffffff, 0x8fae7a, 2.1));
    const sun = new T.DirectionalLight(0xfff4e0, 1.6);
    sun.position.set(25, 45, 15);
    if (gfx.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.06;
      const c = sun.shadow.camera; c.left = -42; c.right = 42; c.top = 42; c.bottom = -42; c.near = 5; c.far = 120;
    }
    scene.add(sun);

    camera = new T.PerspectiveCamera(st.fov, window.innerWidth / window.innerHeight, 0.05, 140);
    scene.add(camera);

    world = ES.buildWorld(scene);
    buildShared();
    buildGun();
    buildEffects();

    /* ---- create the fighters ---- */
    ents = [];
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

    quiz = ES.createQuiz(st);
    G.world = world; G.ents = ents; G.player = player;   // the bot brains read these

    S = {
      phase: 'ready', paused: false, qOpen: false, qState: '', cur: null, qTime: 0, qCd: 0,
      timeLeft: st.minutes * 60, score: [0, 0], target: st.targetKills,
      ammo: AMMO.start, fireCd: 0, sinceHurt: 99, streak: 0, countT: 0,
      feed: [], dmgFlash: 0, hitMark: 0, recoil: 0, muzzleT: 0,
      stats: { kills: 0, deaths: 0, shots: 0, hits: 0, heads: 0, qAsked: 0, qRight: 0, bySubj: {}, missed: [] },
      reason: '', fpsMin: 999, fpsSum: 0, fpsN: 0
    };
    Object.keys(cache).forEach(function (k) { delete cache[k]; });
    keys = {}; fireHeld = false; rightDown = false; yaw = 0; pitch = 0; fpsTipShown = false; fpsSlowT = 0;

    /* radar background drawn once */
    radarBase = document.createElement('canvas'); radarBase.width = radarBase.height = 132;
    world.drawRadarBase(radarBase.getContext('2d'), 132);
    radarCtx = $('radar').getContext('2d');

    addListeners();
    resetHudViews();
    G.active = true;
    lastT = performance.now();
    raf = requestAnimationFrame(frame);
    ES.audio.music.start('menu');   // calm theme until the player clicks Start
    return { ok: true, pool: quiz.size, fallback: quiz.usedFallback };
  };

  G.stop = function () {
    if (!G.active && !renderer) return;
    G.active = false;
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
    ['ov-ready', 'ov-pause', 'ov-count', 'ov-death', 'qp', 'ov-end', 'scoreboard'].forEach(function (id) { show(id, false); });
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
        { x: 0.3, y: 1.08, z: -0.3, w: 0.1, h: 0.12, d: 0.46, c: 0x2a2f3a },
        { x: 0.3, y: 1.08, z: -0.55, w: 0.07, h: 0.07, d: 0.07, c: 0xffe14d }
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
  }

  function makeNameSprite(name, css) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const x = c.getContext('2d');
    x.fillStyle = css; x.globalAlpha = 0.85;
    x.beginPath(); x.moveTo(20, 6); x.lineTo(236, 6); x.quadraticCurveTo(250, 6, 250, 20); x.lineTo(250, 44); x.quadraticCurveTo(250, 58, 236, 58); x.lineTo(20, 58); x.quadraticCurveTo(6, 58, 6, 44); x.lineTo(6, 20); x.quadraticCurveTo(6, 6, 20, 6); x.fill();
    x.globalAlpha = 1; x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name, 128, 34);
    const tex = new T.CanvasTexture(c);
    const spr = new T.Sprite(new T.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    spr.scale.set(1.7, 0.42, 1);
    return spr;
  }

  function buildBotMesh(e) {
    const root = new T.Group();
    const bodyMat = new T.MeshLambertMaterial({ vertexColors: true });
    const body = new T.Mesh(shared['body' + e.team], bodyMat);
    body.userData.shared = false;
    const legL = new T.Mesh(shared.leg, shared.legMat), legR = new T.Mesh(shared.leg, shared.legMat);
    legL.position.set(-0.14, 0.8, 0); legR.position.set(0.14, 0.8, 0);
    legL.userData.shared = true; legR.userData.shared = true;
    root.add(body, legL, legR);
    if (gfx.shadows) body.castShadow = true;
    else { const blob = new T.Mesh(shared.blob, shared.blobMat); blob.position.y = 0.04; blob.userData.shared = true; root.add(blob); }
    const bubble = new T.Sprite(shared.bubbleMat); bubble.scale.set(0.75, 0.75, 1); bubble.position.y = 2.7; bubble.visible = false; bubble.userData.shared = true;
    root.add(bubble);
    if (e.team === 0) { const nm = makeNameSprite(e.name, ES.TEAMS[0].css); nm.position.y = 2.2; root.add(nm); }
    root.userData = { body: body, bodyMat: bodyMat, legL: legL, legR: legR, bubble: bubble };
    return root;
  }

  function buildGun() {
    gun = new T.Group();
    const mk = function (w, h, d, color, x, y, z) {
      const m = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshLambertMaterial({ color: color, depthTest: false }));
      m.position.set(x, y, z); m.renderOrder = 20; gun.add(m); return m;
    };
    mk(0.075, 0.1, 0.38, 0x2a3550, 0, 0, 0);
    mk(0.08, 0.03, 0.22, ES.TEAMS[0].color, 0, 0.06, -0.04);
    mk(0.04, 0.04, 0.2, 0x1a2035, 0, 0.015, -0.28);
    mk(0.05, 0.12, 0.07, 0x1a2035, 0, -0.1, 0.1);
    mk(0.05, 0.05, 0.03, 0xffe14d, 0, 0.015, -0.39);
    muzzle = new T.Mesh(new T.PlaneGeometry(0.3, 0.3), new T.MeshBasicMaterial({ color: 0xffe98a, transparent: true, opacity: 0.95, depthTest: false, side: T.DoubleSide }));
    muzzle.position.set(0, 0.015, -0.46); muzzle.renderOrder = 21; muzzle.visible = false; gun.add(muzzle);
    gun.scale.set(0.55, 0.55, 0.55);
    gun.position.set(0.2, -0.18, -0.5);
    gun.rotation.set(0, 0.04, 0);
    camera.add(gun);
  }

  function buildEffects() {
    tracers = []; sparks = []; tracerI = 0;
    const tg = new T.BoxGeometry(0.04, 0.04, 1);
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(tg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 }));
      m.visible = false; m.userData.shared = true; scene.add(m);
      tracers.push({ mesh: m, life: 0 });
    }
    shared.tracerGeo = tg;
    const sg = new T.BoxGeometry(0.1, 0.1, 0.1);
    shared.sparkGeo = sg;
    for (let i = 0; i < 28; i++) {
      const m = new T.Mesh(sg, new T.MeshBasicMaterial({ color: 0xffffff, transparent: true }));
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
    if (!target.alive || target.protT > 0 || S.phase !== 'play') return false;
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
    if (attacker) {
      attacker.kills++; S.score[attacker.team]++;
      feed(attacker, target, head);
    }
    if (target.isPlayer) {
      S.stats.deaths++;
      if (S.qOpen) cancelQuestion(true);
      fireHeld = false;
      $('death-text').textContent = attacker ? 'Tagged by ' + attacker.name + '!' : 'You were tagged!';
      show('ov-death', true);
      ES.audio.sfx('die');
    }
    if (attacker && attacker.isPlayer) { S.stats.kills++; ES.audio.sfx('kill'); }
    if (S.score[0] >= S.target || S.score[1] >= S.target) endMatch('score');
  }

  function feed(a, t, head) {
    S.feed.unshift({ a: a, t: t, head: head, life: 5 });
    if (S.feed.length > 5) S.feed.pop();
    S.feedDirty = true;
  }

  G.addTracer = function (ax, ay, az, bx, by, bz, team) {
    const tr = tracers[tracerI++ % tracers.length], m = tr.mesh;
    const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.1) return;
    m.position.set((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2);
    m.lookAt(bx, by, bz);
    m.scale.set(1, 1, len);
    m.material.color.setHex(team === 1 ? 0xff9a6d : 0x7fd0ff);
    m.material.opacity = 0.9; m.visible = true; tr.life = 0.12;
  };

  function burst(x, y, z, color, n) {
    n = Math.min(n, gfx.sparks);
    let k = 0;
    for (let i = 0; i < sparks.length && k < n; i++) {
      const s = sparks[i];
      if (s.life > 0) continue;
      s.life = 0.35 + Math.random() * 0.2; k++;
      s.mesh.position.set(x, y, z); s.mesh.visible = true;
      s.mesh.material.color.setHex(color); s.mesh.material.opacity = 1;
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

  function playerShoot() {
    S.ammo--; S.fireCd = P.fireInterval; S.stats.shots++;
    const moving = Math.hypot(player.vx, player.vz) > 1;
    const sp = moving ? 0.012 : 0.004;
    const cp = Math.cos(pitch);
    let dx = -Math.sin(yaw) * cp + (Math.random() - 0.5) * sp * 2, dy = Math.sin(pitch) + (Math.random() - 0.5) * sp * 2, dz = -Math.cos(yaw) * cp + (Math.random() - 0.5) * sp * 2;
    const l = Math.sqrt(dx * dx + dy * dy + dz * dz); dx /= l; dy /= l; dz /= l;
    const ox = camera.position.x, oy = camera.position.y, oz = camera.position.z;
    const res = G.castShot(player, ox, oy, oz, dx, dy, dz, 90, st.aimAssist ? 1.7 : 1);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    G.addTracer(ox + dx * 0.6 + rx * 0.22, oy + dy * 0.6 - 0.18, oz + dz * 0.6 + rz * 0.22, ox + dx * res.t, oy + dy * res.t, oz + dz * res.t, 0);
    ES.audio.sfx('shoot', 0.9);
    muzzle.visible = true; S.muzzleT = 0.05; S.recoil = 1;
    if (res.target) {
      S.stats.hits++;
      if (res.head) S.stats.heads++;
      const hit = G.damage(res.target, res.head ? P.headDamage : P.damage, player, res.head);
      if (hit) {
        S.hitMark = 0.18; S.hitHead = res.head;
        burst(ox + dx * res.t, oy + dy * res.t, oz + dz * res.t, ES.TEAMS[1].color, 5);
        if (res.target.alive) ES.audio.sfx(res.head ? 'headshot' : 'hit');
      }
    } else {
      burst(ox + dx * (res.t - 0.05), oy + dy * (res.t - 0.05), oz + dz * (res.t - 0.05), 0xd8d8d8, 3);
    }
  }

  /* =====================================================================
     QUESTION  ->  AMMO
     ===================================================================== */
  function openQuestion() {
    if (S.phase !== 'play' || S.paused || S.qOpen || !player.alive) return;
    if (S.ammo >= AMMO.max) { toast('Your blaster is already full! ⚡', 1.6); return; }
    if (S.qCd > 0) { toast('Next question in ' + Math.ceil(S.qCd) + ' s…', 1.2); return; }
    clearTimeout(closeTimer);
    S.cur = quiz.next(); S.qOpen = true; S.qState = 'asking'; S.qTime = st.qTime; fireHeld = false;
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
    $('qp-reward').textContent = '+' + st.reward + ' ⚡ ammo for a correct answer';
    $('qp-fb').className = 'qfb hidden'; $('qp-fb').innerHTML = '';
    $('qp-timer').classList.toggle('hidden', !st.qTime);
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
      fb.innerHTML = '<b>Correct! 🎉</b> +' + gain + ' ⚡ ammo' + (S.streak >= 3 ? ' (streak bonus!)' : '');
      ES.audio.sfx('correct');
      closeTimer = setTimeout(function () { closeQuestion(); }, 1100);
    } else {
      S.streak = 0; S.qCd = 4;
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
    if (S.score[0] > S.score[1]) outcome = 'win'; else if (S.score[1] > S.score[0]) outcome = 'lose';
    S.outcome = outcome;
    buildEndScreen(outcome);
    show('ov-end', true);
    ES.audio.sfx(outcome === 'win' ? 'win' : (outcome === 'lose' ? 'lose' : 'go'));
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
    if (c === 'KeyR') openQuestion();
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
    const dt = Math.min(0.05, Math.max(0.001, (now - lastT) / 1000));
    lastT = now;
    try {
      measureFps(dt);
      if (!S.paused) tick(dt);
      renderer.render(scene, camera);
    } catch (err) {
      // A bug must never freeze the whole classroom: log it and keep drawing.
      if (!G.errShown) { G.errShown = true; console.error('EduStrike frame error:', err); }
    }
  }

  function measureFps(dt) {
    fpsFrames++; fpsTime += dt;
    if (fpsTime >= 0.5) {
      const fps = Math.round(fpsFrames / fpsTime);
      setText('fps', st.showFps ? 'FPS ' + fps : '');
      if (S.phase === 'play' && !S.paused && !S.qOpen) {
        S.fpsMin = Math.min(S.fpsMin, fps); S.fpsSum += fps; S.fpsN++;
        fpsSlowT = fps < 28 ? fpsSlowT + fpsTime : 0;
        if (fpsSlowT > 6 && !fpsTipShown && st.gfx !== 'low') { fpsTipShown = true; toast('Feels slow? Press Esc, quit, and choose Graphics: Low.', 5); }
      }
      fpsFrames = 0; fpsTime = 0;
    }
  }

  function tick(dt) {
    // small timers that always run
    if (toastT > 0) { toastT -= dt; if (toastT <= 0) $('toast').classList.remove('show'); }
    updateEffects(dt);

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
        S.phase = 'play'; show('ov-count', false); toast('GO! Press R to charge your blaster ⚡', 2.5); ES.audio.sfx('go');
      }
      return;
    }
    if (S.phase === 'ended') { animateMeshes(dt); updateCamera(dt); return; }

    /* ---- playing ---- */
    const slow = S.qOpen && st.answerMode === 'slow';
    const wdt = slow ? dt * 0.15 : dt;
    S.timeLeft -= wdt;
    if (S.timeLeft <= 0) { S.timeLeft = 0; endMatch('time'); return; }
    S.qCd = Math.max(0, S.qCd - dt);
    if (S.qOpen && S.qState === 'asking' && st.qTime) {
      S.qTime -= dt;
      $('qp-fill').style.width = Math.max(0, 100 * S.qTime / st.qTime) + '%';
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
    const total = st.minutes * 60;
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
    if (!p.alive) {
      p.respawnT -= dt;
      $('death-count').textContent = Math.max(1, Math.ceil(p.respawnT));
      if (p.respawnT <= 0) G.respawn(p);
      return;
    }
    if (S.sinceHurt > P.regenDelay && p.hp < P.hp) p.hp = Math.min(P.hp, p.hp + P.regenRate * dt);

    let wx = 0, wz = 0;
    if (!S.qOpen) {
      lookKeys(dt);
      const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
      if (ix || iz) {
        const l = Math.sqrt(ix * ix + iz * iz), fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const sp = (keys.ShiftLeft || keys.ShiftRight) ? P.sprint : P.walk;
        wx = (rx * ix + fx * iz) / l * sp; wz = (rz * ix + fz * iz) / l * sp;
      }
      if (keys.Space && p.onGround) { p.vy = P.jump; p.onGround = false; }
    }
    const acc = Math.min(1, (p.onGround ? 14 : 3) * dt);
    p.vx += (wx - p.vx) * acc; p.vz += (wz - p.vz) * acc;
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.vy -= P.gravity * dt; p.y += p.vy * dt;
    world.collide(p, P.radius);
    const g = world.groundAt(p.x, p.z, p.y);
    if (p.y <= g) { p.y = g; p.vy = 0; p.onGround = true; } else p.onGround = false;

    // blaster
    if (fireHeld && S.fireCd <= 0 && !S.qOpen) {
      if (S.ammo > 0) playerShoot();
      else { S.fireCd = 0.35; ES.audio.sfx('empty'); toast('Out of ammo! Press R and answer a question ⚡', 1.6); S.pulseAmmo = 1; }
    }
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
      const answering = e.state === 'answer';
      u.bubble.visible = answering;
      m.scale.y = answering ? 0.8 : 1;
      u.bodyMat.emissive.setHex(e.flashT > 0 ? 0x888888 : 0x000000);
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
    setText('sc-target', 'First to ' + S.target);
    updateHud(0, true);
  }

  function updateHud(dt, force) {
    const p = player;
    setText('sc-blue', String(S.score[0])); setText('sc-red', String(S.score[1]));
    const tl = Math.ceil(S.timeLeft), mm = Math.floor(tl / 60), ss = tl % 60;
    setText('sc-time', mm + ':' + (ss < 10 ? '0' : '') + ss);
    setText('hp-text', String(Math.ceil(p.hp)));
    const hpEl = $('hp-fill'); hpEl.style.width = clamp(p.hp, 0, 100) + '%';
    hpEl.className = p.hp < 30 ? 'low' : '';
    setText('ammo-num', String(S.ammo));
    $('ammo').classList.toggle('empty', S.ammo === 0);
    $('ammo').classList.toggle('low', S.ammo > 0 && S.ammo <= 4);
    setText('ammo-hint', S.ammo === 0 ? 'Press R – answer a question!' : (S.ammo <= 4 ? 'Low! Press R to recharge' : 'R = recharge'));
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
    for (let i = 0; i < ents.length; i++) {
      const e = ents[i];
      if (!e.alive || e.isPlayer) continue;
      if (e.team !== 0 && !st.radar) continue;
      c.fillStyle = e.team === 0 ? '#58a6ff' : '#ff6a45';
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
    end: endMatch,
    step: function (n, dt) { for (let i = 0; i < n; i++) tick(dt); }   // run the game without drawing (used for fast automatic tests)
  };
})();
