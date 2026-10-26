/* EduStrike - the MATCH ENGINE, teacher side (runs inside the teacher page, no picture is drawn).
   The teacher's computer is the "referee":
     - it moves the bots (same brains as the solo game),
     - it keeps every player's health, kills, score and the clock,
     - it sends everybody a "snapshot" of the arena about 15 times a second.
   Each student's own computer moves THEIR player (so controls feel instant) and tells the referee where it is.
   When a student fires, their computer works out what was hit and the referee double-checks it.

   SAFETY CHECKS:
   - the loop runs in a Web Worker timer, so it does NOT slow down when the teacher switches tabs
   - every number a student sends is checked (must be a number, must be inside the arena)
   - shots are rate-limited, must start near the shooter, and need a clear line to the target
   - if a student leaves, a bot takes over their player so the teams stay fair
   - while a student is answering a question they take half damage */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const T = window.THREE;
  const P = ES.PLAYER;
  const rnd = Math.random;
  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const r2 = function (v) { return Math.round(v * 100) / 100; };

  let M = null, ticker = null, lastNow = 0, snapT = 0, updT = 0, seq = 0, world = null, onUpdate = null;

  /* ---------- a fighter (human or bot) ---------- */
  function mkEnt(eid, team, name, human, diffKey) {
    const D = ES.DIFF[diffKey] || ES.DIFF.normal;
    return {
      eid: eid, name: name, team: team, human: human, isBot: !human, isPlayer: false,
      x: 0, y: 0, z: 0, vx: 0, vz: 0, vy: 0, yaw: 0, hp: P.hp, alive: true, protT: 0, flashT: 0,
      kills: 0, deaths: 0, respawnT: 0, speed: 0, onGround: true, D: D,
      state: 'roam', path: null, pi: 0, scanT: rnd() * 0.2, target: null, sees: false, reactT: 0, fireT: rnd(),
      ammo: D.mag, ansT: 0, lostT: 0, lastSeen: null, strafeT: 0, strafeDir: 1,
      stuckT: 0, sx: 0, sz: 0, repathT: 0, alert: 0, phase: rnd() * 6, deathT: 0,
      sinceHurt: 99, answering: false, lastShot: 0, lastSt: 0, ready: false, p: null,
      wpn: null, wAmmo: 0, wUntil: 0, lastEarn: 0
    };
  }

  /* ---------- spawning ---------- */
  function placeAtSpawn(e, used) {
    const list = world.spawns[e.team];
    let best = null, bestScore = -1;
    list.forEach(function (sp, i) {
      let md = 99;
      M.ents.forEach(function (o) { if (o.team !== e.team && o.alive) md = Math.min(md, Math.hypot(o.x - sp.x, o.z - sp.z)); });
      const taken = used && used[e.team].indexOf(i) >= 0;
      const score = (taken ? 0 : 50) + Math.min(md, 40) + rnd() * 10;
      if (score > bestScore) { bestScore = score; best = { sp: sp, i: i }; }
    });
    if (used) used[e.team].push(best.i);
    const crowd = used ? used[e.team].length > list.length : false;     // more fighters than spawn spots: spread them out a little
    e.x = best.sp.x + (crowd ? (rnd() - 0.5) * 3 : 0); e.z = best.sp.z + (crowd ? (rnd() - 0.5) * 2 : 0);
    e.y = 0; e.vx = e.vz = e.vy = 0; e.yaw = best.sp.yaw;
    world.collide(e, P.radius);
  }

  /* ---------- the "G" object the bot brains talk to ---------- */
  const G = {
    castShot: function (shooter, ox, oy, oz, dx, dy, dz, range, radiusMul) {
      let bt = world.rayWorld(ox, oy, oz, dx, dy, dz, range), best = null, head = false;
      const dxz2 = dx * dx + dz * dz;
      if (dxz2 > 1e-8) {
        for (let k = 0; k < M.ents.length; k++) {
          const e = M.ents[k];
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
    },
    /* a bot fired: tell every student to draw the laser */
    addTracer: function (ax, ay, az, bx, by, bz, team) { M.ev.push(['shot', r2(ax), r2(ay), r2(az), r2(bx), r2(by), r2(bz), team, -1]); },
    soundAt: function () { /* students make the sound themselves when they see the 'shot' event */ },
    damage: function (target, amt, attacker, head) {
      if (!target.alive || target.protT > 0 || M.phase !== 'play' || (M.rb && M.rb.st.ph !== 0)) return false;       // no tagging while the round banner shows
      if (target.human && target.answering) amt *= 0.5;
      target.hp -= amt; target.sinceHurt = 0;
      if (target.human) M.ev.push(['hurt', target.eid, attacker ? attacker.eid : -1]);
      else if (attacker) {
        target.alert = 3;
        if (!target.target || !target.sees) { target.target = attacker; target.sees = false; target.lastSeen = { x: attacker.x, z: attacker.z }; target.reactT = target.D.react * 0.7; target.lostT = 0; }
      }
      if (target.hp <= 0) kill(target, attacker, head);
      return true;
    },
    respawn: function (e) {
      placeAtSpawn(e, null);
      e.alive = true; e.hp = P.hp; e.protT = e.human ? P.protect : 1.5; e.target = null; e.path = null; e.sees = false;
      e.state = 'roam'; e.ammo = e.D.mag; e.deathT = 0; e.sinceHurt = 99;
      if (e.human && e.p) ES.room.send(e.p, { t: 'respawn', eid: e.eid, x: r2(e.x), z: r2(e.z), yaw: r2(e.yaw) });
    }
  };

  function kill(target, attacker, head) {
    target.alive = false; target.hp = 0; target.deaths++; target.respawnT = P.respawn;
    target.target = null; target.path = null; target.state = 'roam'; target.answering = false; target.wpn = null;   // a bonus weapon is lost when tagged
    if (attacker) { attacker.kills++; if (M.rb) M.rb.killed(attacker.team); else M.score[attacker.team]++; }      // Rescue & Bomb: score = rounds won, tags only break ties
    M.ev.push(['kill', attacker ? attacker.eid : -1, target.eid, head ? 1 : 0]);
    if (!M.rb && (M.score[0] >= M.target || M.score[1] >= M.target)) finish('score');
  }

  /* push fighters apart a little so they do not stand inside each other */
  function separate() {
    const ents = M.ents;
    for (let i = 0; i < ents.length; i++) {
      const a = ents[i]; if (!a.alive || a.human) continue;
      for (let j = 0; j < ents.length; j++) {
        if (i === j) continue;
        const b = ents[j]; if (!b.alive) continue;
        const dx = b.x - a.x, dz = b.z - a.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.64 && d2 > 1e-6) {
          const d = Math.sqrt(d2), f = (0.8 - d) / d * (b.human ? 1 : 0.5);   // humans are never pushed by the referee: only the bot moves away
          a.x -= dx * f; a.z -= dz * f;
          if (!b.human) { b.x += dx * f; b.z += dz * f; world.collide(b, P.radius); }
          world.collide(a, P.radius);
        }
      }
    }
  }

  /* ---------- messages from students ---------- */
  function num(v, lim) { v = Number(v); return isFinite(v) && Math.abs(v) <= lim ? v : null; }

  function onState(p, m) {
    const e = p.ent; if (!M || !e || !e.human) return;
    const x = num(m.x, 60), y = num(m.y, 30), z = num(m.z, 60), yaw = num(m.yaw, 100);
    if (x === null || y === null || z === null || yaw === null) return;
    const now = performance.now(), dt = Math.max(0.02, (now - (e.lastSt || now - 66)) / 1000);
    e.speed = Math.min(12, Math.hypot(x - e.x, z - e.z) / dt);
    e.lastSt = now;
    if (e.alive) { e.x = x; e.y = y; e.z = z; }
    e.yaw = yaw; e.answering = !!m.q;
  }

  /* a student walks over a weapon crate, or earns one with 3 right answers: the referee decides which weapon and tells only that student */
  function grantWeapon(e, id) {
    const W = ES.WEAPONS[id]; if (!W || id === 'pistol' || !e || !e.p) return;
    e.wpn = id; e.wAmmo = W.mag; e.wUntil = performance.now() + (W.secs + 2) * 1000;     // +2 s of patience for slow connections
    ES.room.send(e.p, { t: 'wpn', w: id });
  }
  function randomWeapon(except) {
    const list = ES.WEAPON_IDS.filter(function (w) { return w !== except; });
    return list[Math.floor(rnd() * list.length)];
  }
  function onEarn(p) {
    const e = p.ent; if (!M || M.phase !== 'play' || !e || !e.alive) return;
    const now = performance.now();
    if (now - e.lastEarn < 20000) return;             // at most one earned weapon every 20 seconds
    e.lastEarn = now;
    grantWeapon(e, randomWeapon(e.wpn));
  }
  /* weapon crates are rare: a pair appears for ~28 s now and then (see ES.crateClock). Walk over one to pick it up. */
  function updateCrates(dt) {
    const R = ES.CRATE.radius, ck = M.crateClock;
    ck.update(dt);
    if (!ck.mask) return;
    M.crates.forEach(function (c, i) {
      if (!(ck.mask & (1 << i))) return;
      for (let k = 0; k < M.humans.length; k++) {
        const e = M.humans[k];
        if (!e.p || !e.alive) continue;
        if (Math.hypot(e.x - c.x, e.z - c.z) < R && e.y < 1.6) { ck.take(i); grantWeapon(e, randomWeapon(e.wpn)); return; }
      }
    });
  }

  function onShot(p, m) {
    const e = p.ent; if (!M || M.phase !== 'play' || !e || !e.alive) return;
    const now = performance.now();
    const wid = (typeof m.w === 'string' && m.w !== 'pistol' && ES.WEAPONS[m.w]) ? m.w : 'pistol', W = ES.WEAPONS[wid], bonus = wid !== 'pistol';
    if (now - e.lastShot < (bonus ? W.interval * 600 : 110)) return;               // fire-rate limit (a little more relaxed than the real rate)
    if (bonus) {                                      // you can only fire a bonus weapon you really have
      if (e.wpn !== wid || e.wAmmo <= 0 || now > e.wUntil) return;
      e.wAmmo--; if (e.wAmmo <= 0) e.wpn = null;
    }
    e.lastShot = now;
    const ox = num(m.ox, 80), oy = num(m.oy, 10), oz = num(m.oz, 80), ex = num(m.ex, 200), ey = num(m.ey, 200), ez = num(m.ez, 200);
    if (ox === null || oy === null || oz === null || ex === null || ey === null || ez === null) return;
    if (Math.hypot(ox - e.x, oz - e.z) > 4) return;   // a shot must start near the shooter
    M.ev.push(['shot', r2(ox), r2(oy), r2(oz), r2(ex), r2(ey), r2(ez), e.team, e.eid, bonus ? wid : 0]);
    // who was hit: the scatter blaster sends up to 8 pellets, every other weapon one bullet
    let hits = [];
    if (Array.isArray(m.hits)) hits = m.hits.slice(0, W.pellets).map(function (h) { return [Array.isArray(h) ? h[0] | 0 : -1, Array.isArray(h) ? h[1] : 0]; });
    else hits = [[m.tid | 0, m.h]];
    const direct = {};
    hits.forEach(function (h) {
      if (h[0] < 0) return;
      const t = M.byEid[h[0]];
      if (!t || !t.alive || t.team === e.team) return;
      if (Math.hypot(t.x - e.x, t.z - e.z) > W.range + 10) return;
      if (!world.clearLine(ox, oy, oz, t.x, t.y + 1.1, t.z)) return;      // a wall is in the way
      const head = !!h[1];
      direct[t.eid] = 1;
      G.damage(t, head ? W.head : W.dmg, e, head);
    });
    if (W.splash && Math.hypot(ex - ox, ez - oz) <= W.range + 5) {          // rocket: the blast hurts everybody close to where it landed
      M.ev.push(['boom', r2(ex), r2(ey), r2(ez), e.eid]);
      M.ents.forEach(function (t) {
        if (!t.alive || t.team === e.team || direct[t.eid]) return;
        const d = Math.hypot(t.x - ex, (t.y + 1) - ey, t.z - ez);
        if (d < W.splashR) G.damage(t, Math.max(10, W.splash * (1 - d / W.splashR)), e, false);
      });
    }
  }

  /* Rescue & Bomb: a student answered a mission question right and asks to rescue / plant / defuse. The rules engine checks everything. */
  function onRb(p, m) {
    const e = p.ent; if (!M || !M.rb || M.phase !== 'play' || !e || !e.alive) return;
    if (['rescue', 'plant', 'defuse'].indexOf(m.a) < 0) return;
    const now = performance.now(); if (now - (e.lastRb || 0) < 800) return;          // not more than about one try a second
    e.lastRb = now;
    M.rb.act(e, m.a);
  }
  /* the referee's rules engine tells us what happened: pass it on to every student (sounds, banners) */
  function rbHook(name, a, b) {
    if (!M) return;
    M.ev.push(['rb', name, a === undefined ? 0 : a, b === undefined ? 0 : b]);
    if (name === 'round') resetRound();
  }
  /* a new round: everybody back to their base with full health and the normal blaster */
  function resetRound() {
    const used = [[], []];
    M.ents.forEach(function (e) {
      placeAtSpawn(e, used);
      e.alive = true; e.hp = P.hp; e.protT = 1.5; e.target = null; e.path = null; e.sees = false; e.state = 'roam'; e.ammo = e.D.mag; e.deathT = 0;
      e.sinceHurt = 99; e.alert = 0; e.wpn = null; e.respawnT = 0; e.answering = false; e.objKind = '';
      if (e.human && e.p) ES.room.send(e.p, { t: 'respawn', eid: e.eid, x: r2(e.x), z: r2(e.z), yaw: r2(e.yaw) });
    });
  }

  /* a student closed the page or quit the match: a bot takes their place */
  function humanLeft(p) {
    const e = p && p.ent; if (!M || !e) return;
    e.human = false; e.isBot = true; e.p = null; e.answering = false; e.state = 'roam';
    e.D = ES.DIFF[M.diff] || ES.DIFF.normal; e.ammo = e.D.mag; e.path = null; e.target = null;
    p.ent = null;
    M.ev.push(['bot', e.eid]);
  }

  /* ---------- match flow ---------- */
  function start(settings) {
    stop();
    const humansP = ES.room.players().filter(function (p) { return p.conn; });
    if (!humansP.length) return { ok: false, error: 'No students are in the room yet.' };
    const s = Object.assign({ teamSize: 4, target: 15, minutes: 5, diff: 'normal', gfx: '', map: 'park', names: 'team', topics: [], mode: 'normal', rounds: 3, rtime: 3 }, settings || {});
    const rbc = ES.rbClean(s.rounds, s.rtime);
    // the subtopics the teacher ticked (an empty list = every question); keep only sane text, and not too many
    s.topics = (Array.isArray(s.topics) ? s.topics : []).filter(function (k) { return typeof k === 'string' && k.length < 90; }).slice(0, 300);
    world = ES.buildWorld(new T.Scene(), { noVisual: true, map: s.map });
    M = { phase: 'wait', waitT: 0, countT: 0, timeLeft: s.minutes * 60, score: [0, 0], target: s.target, diff: s.diff, minutes: s.minutes,
          ents: [], byEid: {}, ev: [], humans: [], reason: '', teamSize: s.teamSize, results: null,
          crates: (world.crateSpots || []).map(function (c) { return { x: c.x, z: c.z }; }) };
    M.crateClock = ES.crateClock(M.crates.length);
    G.rb = null;
    if (s.mode === 'rb' && world.rbSpots) {                         // Rescue & Bomb: rounds, a hostage and a bomb
      M.rb = ES.createRB({ rounds: rbc.rounds, minutes: rbc.minutes, spots: world.rbSpots, ents: function () { return M ? M.ents : []; }, hook: rbHook });
      M.timeLeft = rbc.minutes * 60; M.minutes = rbc.minutes; G.rb = M.rb;
    }
    let eid = 1;
    const used = [[], []];
    const cnt = [0, 0];
    humansP.forEach(function (p) {
      const e = mkEnt(eid++, p.team, p.name, true, 'normal');
      e.p = p; p.ent = e; p.eid = e.eid; cnt[p.team]++;
      M.ents.push(e); M.humans.push(e);
    });
    [0, 1].forEach(function (team) {
      const names = ES.BOT_NAMES[team].slice();
      for (let i = cnt[team]; i < s.teamSize; i++) M.ents.push(mkEnt(eid++, team, names.shift() || ('Bot ' + (i + 1)), false, s.diff));
    });
    M.ents.forEach(function (e) { M.byEid[e.eid] = e; placeAtSpawn(e, used); });

    const list = M.ents.map(function (e) { return { eid: e.eid, name: e.name, team: e.team, bot: !e.human }; });
    M.humans.forEach(function (e) {
      ES.room.send(e.p, { t: 'start', you: e.eid, team: e.team, ents: list, target: s.target, minutes: M.rb ? rbc.minutes : s.minutes, mode: M.rb ? 'rb' : 'normal', rounds: rbc.rounds, rtime: rbc.minutes, gfx: s.gfx || '', map: world.map, topics: s.topics, names: s.names === 'all' ? 'all' : 'team', x: r2(e.x), z: r2(e.z), yaw: r2(e.yaw) });
    });
    ES.room.setPhase('match');
    lastNow = performance.now(); snapT = 0; updT = 0;
    ticker = makeTicker(loop);
    return { ok: true };
  }

  function makeTicker(fn) {
    try {
      const blob = new Blob(['setInterval(function(){postMessage(1)},33)'], { type: 'text/javascript' });
      const url = URL.createObjectURL(blob), w = new Worker(url);
      w.onmessage = fn;
      return { stop: function () { w.terminate(); URL.revokeObjectURL(url); } };
    } catch (e) {
      const id = setInterval(fn, 33);
      return { stop: function () { clearInterval(id); } };
    }
  }

  function stop() {
    if (ticker) { ticker.stop(); ticker = null; }
    if (M) { M.humans.forEach(function (e) { if (e.p) e.p.ent = null; }); }
    M = null; world = null; G.rb = null;
  }

  function finish(reason) {
    if (!M || M.phase === 'ended') return;
    M.phase = 'ended'; M.reason = reason;
    M.results = M.ents.map(function (e) { return { eid: e.eid, name: e.name, team: e.team, kills: e.kills, deaths: e.deaths, bot: !e.human }; });
    sendSnap();                                           // the last events (the final kill) go out first
    M.humans.forEach(function (e) { if (e.p) ES.room.send(e.p, { t: 'end', reason: reason, sc: M.score.slice(), rows: M.results }); });
  }

  /* which bonus weapon a player is holding right now (1..4, 0 = none): everybody sees it in the soldier's hands */
  function weaponBits(e) {
    if (!e.human || !e.wpn || e.wAmmo <= 0 || !e.alive) return 0;
    return ES.WEAPON_IDS.indexOf(e.wpn) + 1;
  }

  function sendSnap() {
    if (!M) return;
    const rows = M.ents.map(function (e) {
      return [e.eid, r2(e.x), r2(e.y), r2(e.z), r2(e.yaw), Math.max(0, Math.round(e.hp)),
              (e.alive ? 1 : 0) | ((e.isBot ? (e.state === 'answer' || e.state === 'obj') : e.answering) ? 2 : 0) | (e.protT > 0 ? 4 : 0) | (weaponBits(e) << 3), Math.round(e.speed * 10) / 10];
    });
    const msg = { t: 'snap', n: ++seq, ph: M.phase, tl: Math.round(M.timeLeft * 10) / 10, cd: Math.round(M.countT * 10) / 10, sc: M.score, e: rows, ev: M.ev, cr: M.crateClock.mask, rb: M.rb ? M.rb.pack() : 0 };
    M.ev = [];
    M.humans.forEach(function (e) { if (e.p) ES.room.send(e.p, msg); });
  }

  /* ---------- the clock: runs about 30 times a second ---------- */
  function loop() {
    if (!M) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.001, (now - lastNow) / 1000));
    const t0 = now;
    lastNow = now;
    try {
      if (M.phase === 'wait') {
        M.waitT += dt;
        const total = M.humans.filter(function (e) { return e.p; }).length;
        const ready = M.humans.filter(function (e) { return e.p && e.ready; }).length;
        if (!total) { /* everybody left */ finish('empty'); }
        else if (ready >= total || M.waitT > 25) { M.phase = 'count'; M.countT = 3.2; }
      } else if (M.phase === 'count') {
        M.countT -= dt;
        if (M.countT <= 0) { M.phase = 'play'; M.countT = 0; }
      } else if (M.phase === 'play') {
        if (M.rb) {                                       // Rescue & Bomb: the rules engine keeps the round clock + bomb
          M.rb.update(dt);
          const rs = M.rb.st; M.timeLeft = rs.tLeft; M.score[0] = rs.wins[0]; M.score[1] = rs.wins[1];
          if (rs.ph === 2) finish('rounds');
        } else M.timeLeft -= dt;
        for (let i = 0; i < M.ents.length; i++) {
          const e = M.ents[i];
          if (e.human) {
            if (e.protT > 0) e.protT -= dt;
            e.sinceHurt += dt;
            if (!e.alive) { e.respawnT -= dt; if (e.respawnT <= 0) G.respawn(e); }
            else if (e.sinceHurt > P.regenDelay && e.hp < P.hp) e.hp = Math.min(P.hp, e.hp + P.regenRate * dt);
          } else {
            G.ents = M.ents; G.world = world;
            ES.bots.update(G, e, dt);
          }
        }
        separate();
        updateCrates(dt);
        if (!M.rb && M.timeLeft <= 0) { M.timeLeft = 0; finish('time'); }
        const alive = M.humans.filter(function (e) { return e.p; }).length;
        if (!alive && M.phase === 'play') finish('empty');
      }
      snapT += dt; updT += dt;
      if (snapT >= 0.06 && M.phase !== 'ended') { snapT = 0; sendSnap(); }
      if (updT >= 0.5 && onUpdate) { updT = 0; onUpdate(info()); }
      const used = performance.now() - t0;                 // how long this tick took (a health check for the teacher's computer)
      M.loopAvg = M.loopAvg ? M.loopAvg * 0.95 + used * 0.05 : used; M.loopMax = Math.max(M.loopMax || 0, used);
    } catch (err) {
      if (!M.errShown) { M.errShown = true; console.error('EduStrike match error:', err); }
    }
  }

  function info() {
    if (!M) return null;
    const total = M.humans.filter(function (e) { return e.p; }).length;
    return {
      perf: Math.round((M.loopAvg || 0) * 10) / 10, perfMax: Math.round(M.loopMax || 0),
      phase: M.phase, timeLeft: M.timeLeft, score: M.score.slice(), target: M.target, reason: M.reason,
      ready: M.humans.filter(function (e) { return e.p && e.ready; }).length, humans: total,
      rows: M.ents.map(function (e) { return { name: e.name, team: e.team, kills: e.kills, deaths: e.deaths, bot: !e.human, alive: e.alive }; }),
      rb: M.rb ? { round: M.rb.st.round, need: M.rb.need, rounds: M.rb.st.rounds, rph: M.rb.st.ph, bomb: M.rb.st.b.s, bombT: M.rb.st.b.t, hostage: M.rb.st.h.s } : null
    };
  }

  /* ---------- hooks into the class room ---------- */
  ES.room.on('st', onState);
  ES.room.on('shot', onShot);
  ES.room.on('earn', onEarn);
  ES.room.on('rb', onRb);
  ES.room.on('ready', function (p) { if (p.ent) p.ent.ready = true; });
  ES.room.on('quit', function (p) { humanLeft(p); });
  ES.room.on('leave', function (p) { humanLeft(p); });

  ES.match = {
    start: start,
    stop: stop,
    endNow: function () { finish('teacher'); },
    /* after the match: everybody goes back to the waiting room */
    toLobby: function () { stop(); ES.room.setPhase('lobby'); ES.room.broadcast({ t: 'lobby' }); },
    info: info,
    running: function () { return !!M; },
    onUpdate: function (fn) { onUpdate = fn; },
    debug: function () { return M; }
  };
})();
