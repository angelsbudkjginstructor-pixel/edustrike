/* EduStrike - BOSS ROUND rules (no pictures, no network). Shared by the teacher's page (class match) and the solo game.

   The story: the whole class is ONE team. A giant robot walks toward them, throws slow red energy balls and stomps.
   - Its SHIELD is broken by RIGHT ANSWERS (any student's right answer takes 1 point off the shield).
   - When the shield reaches 0 the robot is STUNNED for 12 seconds: it kneels and everybody can shoot it.
   - Shots do nothing while the shield is up ("Shield!").
   - The robot has 3 health bars. Each time a bar is empty it gets back up with a stronger shield and attacks a bit faster.
   - Empty all 3 bars = the class WINS. If the clock runs out first, the robot wins (the class can try again).
   Every attack is slow and shows a warning first (a red ring on the floor) so students can dodge. A tagged student is revived by a friend.

   SAFETY CHECKS:
   - every number that comes from outside is checked; the engine never throws (a bad call is ignored)
   - the robot ignores a fighter who is not on the class team, and never targets a dead one
   - at most 8 energy balls exist at the same time */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  const B = ES.BOSS = {
    HIT_R: 1.7, HIT_H: 4.6,            // the size of the robot for shooting
    WEAK_SECS: 12,                     // how long the robot is stunned after its shield breaks
    BARS: 3,
    ORB_SPEED: 8.5, ORB_DMG: 20, ORB_R: 0.95, ORB_LIFE: 4.2,
    STOMP_R: 4.6, STOMP_DMG: 30, STOMP_WIND: 1.15,
    ORB_WIND: 0.95,
    MAX_ORBS: 8
  };
  const STRENGTH = { gentle: 0.75, normal: 1, tough: 1.35 };
  B.strengthOf = function (k) { return STRENGTH[k] || 1; };

  const clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  const r2 = function (v) { return Math.round(v * 100) / 100; };

  /* o = { ent: the robot's fighter object (x, z, yaw, y, hp, alive),
           allies: function -> list of fighters the robot may attack (class team),
           humans: how many students (scales the shield and health),
           strength: 'gentle' | 'normal' | 'tough',
           minutes: time limit,
           world: { clearLine(...), half, halfZ, groundAt },
           hurt: function(fighter, amount),
           hook: function(name, a, b) -> sounds, banners (optional) } */
  ES.createBoss = function (o) {
    const k = B.strengthOf(o.strength), n = clamp(Math.floor(o.humans) || 1, 1, 30);
    const e = o.ent;
    const armorMax = clamp(Math.round((4 + 1.1 * n) * (0.85 + 0.15 * k)), 5, 30);
    const hpBar = Math.round((260 + 55 * n) * k);
    const hook = o.hook || function () {};
    const st = {
      ph: 0,                                     // 0 fighting, 1 the class won, 2 time ran out (robot won)
      bar: 0, hp: hpBar, hpBar: hpBar, armor: armorMax, armorMax: armorMax,
      weak: 0, atk: 0, atkT: 0, cd: 4.5 / k, tgt: -1, tgtT: 0,
      orbs: [], tLeft: clamp(Number(o.minutes) || 6, 1, 20) * 60,
      dealt: 0, chips: 0, nextId: 1, aimX: 0, aimZ: 0
    };
    e.hp = 100; e.alive = true;

    function allies() { try { return (o.allies() || []).filter(function (a) { return a && a.alive; }); } catch (err) { return []; } }
    function pickTarget() {
      const list = allies(); let best = null, bd = 1e9;
      list.forEach(function (a) { const d = Math.hypot(a.x - e.x, a.z - e.z); if (d < bd) { bd = d; best = a; } });
      st.tgt = best ? best.eid : -1; return best;
    }
    function byEid(id) { const l = allies(); for (let i = 0; i < l.length; i++) if (l[i].eid === id) return l[i]; return null; }
    function health() { e.hp = Math.max(1, Math.round(100 * (1 - (st.bar + (1 - st.hp / st.hpBar)) / B.BARS))); }   // 100 → 0 over all three bars

    /* a RIGHT ANSWER from a student: one point off the shield */
    function answer(who) {
      if (st.ph !== 0 || st.weak > 0 || st.armor <= 0) return false;
      st.armor--; st.chips++;
      hook('chip', who && who.eid, st.armor);
      if (st.armor <= 0) { st.weak = B.WEAK_SECS; st.atk = 0; st.atkT = 0; hook('weak', st.bar); }
      return true;
    }
    /* a shot hit the robot (damage is the normal blaster damage) */
    function hit(who, dmg) {
      if (st.ph !== 0) return false;
      if (st.weak <= 0) { hook('block', who && who.eid); return false; }       // the shield is up
      dmg = clamp(Number(dmg) || 0, 0, 200);
      st.hp -= dmg; st.dealt += dmg;
      if (st.hp <= 0) {
        st.bar++;
        if (st.bar >= B.BARS) { st.hp = 0; st.ph = 1; st.weak = 0; e.alive = false; e.hp = 0; hook('win', 0); return true; }
        st.hp = st.hpBar; st.armorMax = Math.min(30, armorMax + st.bar); st.armor = st.armorMax; st.weak = 0; st.atk = 0; st.cd = 2.2;
        hook('bar', st.bar);
      }
      health();
      return true;
    }

    function fireOrbs(t) {
      const ox = e.x, oz = e.z, oy = (e.y || 0) + 3.3, count = st.bar >= 2 ? 3 : (st.bar === 1 ? 2 : 1);
      const aimAng = Math.atan2(t.x - ox, t.z - oz);
      for (let i = 0; i < count && st.orbs.length < B.MAX_ORBS; i++) {
        const a = aimAng + (i - (count - 1) / 2) * 0.28;
        st.orbs.push({ id: st.nextId++, x: ox, y: oy, z: oz, dx: Math.sin(a), dz: Math.cos(a), t: 0 });
      }
      hook('orb', 0);
    }
    function stomp() {
      let hurtAny = false;
      allies().forEach(function (a) {
        if (Math.hypot(a.x - e.x, a.z - e.z) <= B.STOMP_R && (a.y || 0) - (e.y || 0) < 1.4) { o.hurt(a, B.STOMP_DMG * (0.85 + 0.15 * k)); hurtAny = true; }
      });
      hook('stomp', hurtAny ? 1 : 0);
    }

    function update(dt) {
      if (st.ph !== 0) return;
      st.tLeft -= dt;
      if (st.tLeft <= 0) { st.tLeft = 0; st.ph = 2; hook('lose', 0); return; }
      /* stunned: kneel and wait; then the shield comes back */
      if (st.weak > 0) {
        st.weak -= dt;
        if (st.weak <= 0) { st.weak = 0; st.armor = st.armorMax; st.cd = 2.5; hook('armor', st.bar); }
      }
      /* choose who to chase (look again about once a second) */
      st.tgtT -= dt;
      let t = byEid(st.tgt);
      if (!t || st.tgtT <= 0) { st.tgtT = 1; t = pickTarget(); }
      st.orbs = st.orbs.filter(function (b) {
        const ox = b.x, oz = b.z, oy = b.y;
        b.x += b.dx * B.ORB_SPEED * dt; b.z += b.dz * B.ORB_SPEED * dt; b.t += dt;
        b.y = Math.max(0.9, b.y - dt * 0.9);                                       // the ball drifts down toward head height
        if (b.t > B.ORB_LIFE || Math.abs(b.x) > (o.world.half || 40) + 8 || Math.abs(b.z) > (o.world.halfZ || 40) + 8) return false;
        try { if (!o.world.clearLine(ox, oy, oz, b.x, b.y, b.z)) { hook('pop', 0); return false; } } catch (err) { /* keep flying */ }
        const list = allies();
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (Math.hypot(a.x - b.x, a.z - b.z) < B.ORB_R && b.y > (a.y || 0) - 0.2 && b.y < (a.y || 0) + 2.1) { o.hurt(a, B.ORB_DMG * (0.85 + 0.15 * k)); hook('orbhit', a.eid); return false; }
        }
        return true;
      });
      if (st.weak > 0) { health(); return; }
      /* an attack in progress: the warning is on screen, then it happens */
      if (st.atk) {
        st.atkT -= dt;
        if (st.atkT <= 0) {
          const kind = st.atk; st.atk = 0; st.cd = (3.4 - st.bar * 0.5) / k;
          const tt = byEid(st.tgt) || pickTarget();
          if (kind === 2) stomp(); else if (tt) fireOrbs(tt);
        }
        return;
      }
      if (!t) return;
      const dx = t.x - e.x, dz = t.z - e.z, d = Math.hypot(dx, dz);
      /* walk toward the target, but stop at about 7 metres (the robot likes to shoot from a distance) */
      if (d > 7) {
        const sp = (1.9 + 0.35 * st.bar) * k * dt;
        e.x += dx / d * sp; e.z += dz / d * sp;
        const lim = (o.world.half || 40) - 3, limZ = (o.world.halfZ || 40) - 3;
        e.x = clamp(e.x, -lim, lim); e.z = clamp(e.z, -limZ, limZ);
      }
      e.yaw = Math.atan2(dx, dz); e.speed = d > 7 ? 1.9 : 0;
      st.cd -= dt;
      if (st.cd <= 0) {
        const near = allies().some(function (a) { return Math.hypot(a.x - e.x, a.z - e.z) <= B.STOMP_R - 0.4; });
        if (near) { st.atk = 2; st.atkT = B.STOMP_WIND / k; hook('windup', 2); }
        else { st.atk = 1; st.atkT = B.ORB_WIND / k; hook('windup', 1); }
      }
      health();
    }

    /* what the referee sends in every snapshot (small) / what a student's computer copies */
    function pack() {
      return [st.ph, st.bar, Math.round(st.hp), st.hpBar, st.armor, st.armorMax, r2(st.weak), st.atk, r2(st.atkT), st.tgt, Math.round(st.tLeft),
              st.orbs.map(function (b) { return [r2(b.x), r2(b.y), r2(b.z)]; })];
    }
    function apply(p) {
      if (!Array.isArray(p) || p.length < 12) return;
      st.ph = p[0] | 0; st.bar = p[1] | 0; st.hp = +p[2] || 0; st.hpBar = +p[3] || 1; st.armor = p[4] | 0; st.armorMax = p[5] | 0;
      st.weak = +p[6] || 0; st.atk = p[7] | 0; st.atkT = +p[8] || 0; st.tgt = p[9] | 0; st.tLeft = +p[10] || 0;
      st.orbs = Array.isArray(p[11]) ? p[11].slice(0, B.MAX_ORBS).map(function (q, i) { return { id: i, x: +q[0] || 0, y: +q[1] || 0, z: +q[2] || 0 }; }) : [];
    }
    health();
    return { st: st, update: update, answer: answer, hit: hit, pack: pack, apply: apply, armorMax: armorMax, hpBar: hpBar };
  };
})();
