/* EduStrike - bot brains.
   Bots follow the SAME rules as the player:
   - they only see what is inside their field of view and not behind a wall (no wall-hacks),
   - they spend ammo, and when it runs out they must "answer a question" (a ? bubble shows)
     before they can shoot again. Harder bots answer faster and more accurately.
   - they walk around walls with the path-finding grid from world.js. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const rnd = Math.random;

  function angDiff(a, b) {
    let d = b - a;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  }
  // facing direction is (-sin yaw, -cos yaw), so this gives the yaw that looks along (dx, dz)
  function yawTo(dx, dz) { return Math.atan2(-dx, -dz); }

  function turnToward(b, want, rate, dt) {
    const d = angDiff(b.yaw, want);
    b.yaw += Math.max(-rate * dt, Math.min(rate * dt, d));
    return Math.abs(d);
  }

  /* Move one step, slide along walls, and remember how fast we really moved (for the walking animation) */
  function step(G, b, vx, vz, dt) {
    const px = b.x, pz = b.z;
    b.x += vx * dt; b.z += vz * dt;
    G.world.collide(b, 0.4);
    b.speed = Math.sqrt((b.x - px) * (b.x - px) + (b.z - pz) * (b.z - pz)) / Math.max(dt, 1e-4);
  }

  function scan(G, b) {
    const D = b.D;
    let best = null, bd = D.range * D.range;
    const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw);
    for (let k = 0; k < G.ents.length; k++) {
      const e = G.ents[k];
      if (e.team === b.team || !e.alive) continue;
      const dx = e.x - b.x, dz = e.z - b.z, d2 = dx * dx + dz * dz;
      if (d2 >= bd) continue;
      if (b.alert <= 0 && b.target !== e) {                         // not alerted: only see inside the field of view
        const d = Math.sqrt(d2) || 1;
        if (Math.acos(Math.max(-1, Math.min(1, (dx * fx + dz * fz) / d))) > D.fov / 2) continue;
      }
      if (!G.world.clearLine(b.x, 1.5, b.z, e.x, e.y + 1.1, e.z)) continue;   // a wall is in the way
      best = e; bd = d2;
    }
    if (best) {
      if (b.target !== best) { b.target = best; b.reactT = D.react * (0.8 + rnd() * 0.4); }
      b.lastSeen = { x: best.x, z: best.z }; b.lostT = 0; b.sees = true;
    } else {
      b.sees = false;
      if (b.target) { b.lostT += 0.2; if (b.lostT > 2.5) { b.target = null; b.path = null; } }
    }
  }

  function fireAt(G, b, t, dist) {
    const D = b.D;
    b.fireT = D.interval * (0.9 + rnd() * 0.3);
    b.ammo--;
    const ox = b.x, oy = b.y + 1.5, oz = b.z;
    const ay = t.y + 0.7 + rnd() * 0.7;
    const dx = t.x - ox, dy = ay - oy, dz = t.z - oz;
    const err = D.aim * (0.6 + dist / 25) * (b.speed > 1.5 ? 1.25 : 1);
    const yaw = Math.atan2(-dx, -dz) + (rnd() - 0.5) * 2 * err;
    const pit = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) + (rnd() - 0.5) * err;
    const cp = Math.cos(pit);
    const ddx = -Math.sin(yaw) * cp, ddy = Math.sin(pit), ddz = -Math.cos(yaw) * cp;
    const res = G.castShot(b, ox, oy, oz, ddx, ddy, ddz, D.range + 12, 1);
    const mx = ox + ddx * 0.6 - ddz * 0.3, my = oy - 0.4, mz = oz + ddz * 0.6 + ddx * 0.3;
    G.addTracer(mx, my, mz, ox + ddx * res.t, oy + ddy * res.t, oz + ddz * res.t, b.team);
    G.soundAt('botShoot', b.x, b.z, 0.7);
    if (res.target) G.damage(res.target, D.dmg, b, false);
  }

  /* ---------- Rescue & Bomb: what does this bot do for the mission? ---------- */
  function rbOn(G) { return !!(G.rb && G.rb.st.on && G.rb.st.ph === 0 && G.world.rbSpots); }
  /* the job for this bot's team right now: {x, z, kind} or null */
  function rbGoal(G, b) {
    const st = G.rb.st, sp = G.world.rbSpots;
    if (b.team === 0) {
      if (st.h.s === 1 && st.h.c === b.eid) return { x: sp.s.x, z: sp.s.z, kind: 'carry' };         // I have the hostage: run home
      if (st.b.s === 1) return { x: sp.z.x, z: sp.z.z, kind: 'defuse' };
      if (st.h.s === 0) return { x: st.h.x, z: st.h.z, kind: 'rescue' };
      if (st.h.s === 2) return { x: st.h.x, z: st.h.z, kind: 'pickup' };
      return null;
    }
    if (st.b.s === 0 && st.h.s !== 3) return { x: sp.z.x, z: sp.z.z, kind: 'plant' };
    return null;
  }
  /* only the closest bots of a team go for the objective (the others fight and guard) */
  function isActor(G, b, goal, n) {
    const d0 = Math.hypot(goal.x - b.x, goal.z - b.z);
    let closer = 0;
    for (let k = 0; k < G.ents.length; k++) {
      const e = G.ents[k];
      if (e === b || e.team !== b.team || !e.alive || !e.isBot) continue;
      if (Math.hypot(goal.x - e.x, goal.z - e.z) < d0) closer++;
    }
    return closer < n;
  }
  /* where a bot that is NOT doing the mission goes (guard / hunt / rush the bomb). Returns {x,z} or null */
  function rbWander(G, b) {
    const st = G.rb.st, sp = G.world.rbSpots, o = function () { return (rnd() - 0.5) * 8; };
    if (st.b.s === 1) return { x: sp.z.x + o(), z: sp.z.z + o() };                       // everybody runs to the ticking bomb
    if (st.h.s === 1 || st.h.s === 2) return { x: st.h.x + o() * 0.6, z: st.h.z + o() * 0.6 };   // hunt or escort whoever has the hostage
    if (b.team === 1 && st.h.s === 0 && rnd() < 0.6) return { x: st.h.x + o(), z: st.h.z + o() };   // red guards the hostage
    return null;
  }
  /* walk to the objective and answer a question there. Returns true when the bot is busy with it. */
  function objective(G, b, dt) {
    const goal = rbGoal(G, b);
    if (!goal) return false;
    b.roleT = (b.roleT || 0) - dt;
    if (b.roleT <= 0) { b.roleT = 0.4 + rnd() * 0.3; b.isAct = goal.kind === 'carry' || isActor(G, b, goal, goal.kind === 'plant' ? 1 : 2); }
    if (!b.isAct) return false;
    const d = Math.hypot(goal.x - b.x, goal.z - b.z);
    if ((goal.kind === 'rescue' || goal.kind === 'plant' || goal.kind === 'defuse') && d <= 3.3) {      // close enough: start answering ("?" bubble)
      b.state = 'obj'; b.objKind = goal.kind; b.ansT = b.D.ansTime * (0.8 + rnd() * 0.3); b.path = null; return true;
    }
    if (b.repathT <= 0) {
      b.path = G.world.findPath(b.x, b.z, goal.x, goal.z); b.pi = 0;
      b.repathT = (goal.kind === 'pickup' || goal.kind === 'carry') ? 0.7 : 1.5;
    }
    if (!b.path) return false;
    follow(G, b, dt, b.D.speed * (goal.kind === 'carry' ? 1.05 : 1));
    b.stuckT += dt;                                                    // stuck check, same as when wandering
    if (b.stuckT > 1.2) {
      if (Math.hypot(b.x - b.sx, b.z - b.sz) < 0.5) { b.path = null; b.repathT = 0; }
      b.sx = b.x; b.sz = b.z; b.stuckT = 0;
    }
    return true;
  }

  function pickDestination(G, b) {
    let d;
    const r = rnd();
    if (rbOn(G) && rnd() < 0.75) d = rbWander(G, b);
    if (!d && r < 0.3) {                             // head toward a random enemy ("heard footsteps")
      const foes = G.ents.filter(function (e) { return e.alive && e.team !== b.team; });
      if (foes.length) { const f = foes[Math.floor(rnd() * foes.length)]; d = { x: f.x, z: f.z }; }
    }
    if (!d) d = G.world.randomSpot(r < 0.65 ? (b.team === 0 ? -1 : 1) : 0);   // often push toward the enemy half
    b.path = G.world.findPath(b.x, b.z, d.x, d.z);
    b.pi = 0;
    if (!b.path) b.repathT = 0.4;
  }

  /* walk along b.path; returns true while still walking */
  function follow(G, b, dt, sp) {
    if (!b.path || b.pi >= b.path.length) return false;
    const p = b.path[b.pi];
    const dx = p.x - b.x, dz = p.z - b.z, d = Math.sqrt(dx * dx + dz * dz);
    if (d < 0.7) { b.pi++; return b.pi < b.path.length; }
    turnToward(b, yawTo(dx, dz), b.D.turn * 1.3, dt);
    step(G, b, dx / d * sp, dz / d * sp, dt);
    return true;
  }

  function update(G, b, dt) {
    const D = b.D;
    if (!b.alive) {
      b.respawnT -= dt;
      if (b.respawnT <= 0) G.respawn(b);
      return;
    }
    if (b.protT > 0) b.protT -= dt;
    if (b.flashT > 0) b.flashT -= dt;
    b.fireT -= dt; b.alert = Math.max(0, b.alert - dt); b.repathT -= dt;
    b.speed = 0;

    /* ---- Rescue & Bomb: busy answering a mission question (rescue / plant / defuse) ---- */
    if (b.state === 'obj') {
      b.ansT -= dt;
      const goal = rbOn(G) ? rbGoal(G, b) : null;
      if (!goal || goal.kind !== b.objKind || b.alert > 2.2) { b.state = 'roam'; b.objKind = ''; b.roleT = 0; return; }   // the job changed, or somebody is shooting at us: stop
      if (b.ansT <= 0) {
        if (rnd() < D.ansAcc) { if (G.rbAct) G.rbAct(b, b.objKind); b.state = 'roam'; b.objKind = ''; }   // got it right!
        else b.ansT = D.ansTime * 0.7;                                                      // wrong - try another question
      }
      return;
    }

    /* ---- out of ammo: stop and answer a question ---- */
    if (b.state !== 'answer' && (b.ammo <= 0 || (b.ammo < 4 && !b.sees))) {
      b.state = 'answer'; b.ansT = D.ansTime * (0.8 + rnd() * 0.4); b.path = null;
    }
    if (b.state === 'answer') {
      b.ansT -= dt;
      if (b.ansT <= 0) {
        if (rnd() < D.ansAcc) { b.ammo = D.mag; b.state = 'roam'; b.target = null; }   // got it right!
        else b.ansT = D.ansTime * 0.7;                                                   // wrong - try another question
      }
      return;
    }

    /* ---- look around a few times per second ---- */
    b.scanT -= dt;
    if (b.scanT <= 0) { b.scanT = 0.18 + rnd() * 0.1; scan(G, b); }

    if (b.target && !b.target.alive) { b.target = null; b.path = null; b.sees = false; }

    /* Rescue & Bomb: a bot that has the hostage runs home, and a bot on its way to the objective does not stop for enemies that are far away */
    let keepGoing = false;
    if (b.target && b.sees && rbOn(G)) {
      const g = rbGoal(G, b);
      if (g && (g.kind === 'carry' || (b.isAct && Math.hypot(b.target.x - b.x, b.target.z - b.z) > 10))) keepGoing = true;
    }
    if (b.target && b.sees && !keepGoing) {
      /* ---- fight ---- */
      const t = b.target;
      const dx = t.x - b.x, dz = t.z - b.z, dist = Math.sqrt(dx * dx + dz * dz) || 0.01;
      const err = turnToward(b, yawTo(dx, dz), D.turn, dt);
      b.reactT -= dt;
      b.strafeT -= dt;
      if (b.strafeT <= 0) { b.strafeT = 0.8 + rnd() * 1.2; b.strafeDir = rnd() < 0.5 ? -1 : 1; }
      const ux = dx / dist, uz = dz / dist;
      let fx = 0, fz = 0;
      if (dist > 14) { fx = ux; fz = uz; } else if (dist < 5) { fx = -ux; fz = -uz; }
      const vx = fx * 0.9 + (-uz) * b.strafeDir * 0.7, vz = fz * 0.9 + ux * b.strafeDir * 0.7;
      step(G, b, vx * D.speed * 0.7, vz * D.speed * 0.7, dt);
      if (b.speed < 0.3) b.strafeDir = -b.strafeDir;      // bumped into something: strafe the other way
      if (b.reactT <= 0 && err < 0.15 && b.ammo > 0 && b.fireT <= 0 && t.protT <= 0) fireAt(G, b, t, dist);
      return;
    }

    if (rbOn(G) && objective(G, b, dt)) return;

    if (b.target && b.lastSeen) {
      /* ---- lost sight: go to where we last saw them ---- */
      if (!b.path || b.pi >= b.path.length) {
        if (b.repathT <= 0) {
          b.path = G.world.findPath(b.x, b.z, b.lastSeen.x, b.lastSeen.z); b.pi = 0; b.repathT = 0.6;
          if (!b.path) { b.target = null; }
        }
      }
      if (!follow(G, b, dt, D.speed)) { if (b.repathT <= 0) { b.lostT += 0.5; } }
      return;
    }

    /* ---- nothing to do: wander across the map ---- */
    if (!b.path || b.pi >= b.path.length) { if (b.repathT <= 0) pickDestination(G, b); }
    follow(G, b, dt, D.speed * 0.9);

    // stuck check: if we barely moved for a while, choose a new destination
    b.stuckT += dt;
    if (b.stuckT > 1.2) {
      const moved = Math.hypot(b.x - b.sx, b.z - b.sz);
      if (moved < 0.5 && b.path) { b.path = null; b.repathT = 0; }
      b.sx = b.x; b.sz = b.z; b.stuckT = 0;
    }
  }

  ES.bots = { update: update };
})();
