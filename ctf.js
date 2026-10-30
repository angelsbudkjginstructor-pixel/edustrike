/* EduStrike - CAPTURE THE FLAG: the rules (shared by the solo game and the teacher's referee page).
   Each team has a flag standing at its base.
     - Walk up to the ENEMY flag and answer a question (E key) to grab it.
     - Carry it back to YOUR OWN base (the circle round your flag) to score a capture. Your own flag does not have to be at home.
     - If the carrier is tagged, the flag drops where they fell. A teammate can pick it up again by walking over it.
       If nobody does, it flies back to its home after 10 seconds.
     - The team with the most captures when the time runs out wins (equal = draw).
   This file only holds the NUMBERS and RULES (no pictures, no sound), so the teacher's page can run it too.
   SAFETY CHECKS: every action is checked (right team, alive, close enough, right state) before it counts;
   a missing carrier or bad numbers can never crash the match; the clock itself is kept by the caller. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.CTF = {
    ACT_R: 4.5,           // how close you must be to the enemy flag to grab it
    PICK_R: 1.6,          // walk this close to a dropped flag to pick it up again
    CAP_R: 3.6,           // the circle round your own flag where a capture counts
    RETURN_SECS: 10,      // a dropped flag flies home after this many seconds
    MINUTES: [3, 5, 8, 10], DEFAULT_MINUTES: 5
  };
  ES.ctfClean = function (minutes) {
    let m = Number(minutes); if (!isFinite(m) || m < 1) m = ES.CTF.DEFAULT_MINUTES; return { minutes: Math.min(15, m) };
  };

  /* cfg: { spots: {b:{x,z}, r:{x,z}}, ents: function -> list of fighters, hook: function(name, a, b) }
     "b" = where the BLUE team's flag stands, "r" = the RED team's flag. The number of a flag is its owner's team: 0 = blue's, 1 = red's. */
  ES.createCTF = function (cfg) {
    const R = ES.CTF, spots = cfg.spots;
    const hook = cfg.hook || function () { /* no listener */ };
    const home = function (team) { return team === 0 ? spots.b : spots.r; };
    /* s: 0 = at home, 1 = being carried, 2 = dropped.   c = carrier's id.   t = seconds until a dropped flag flies home */
    const mk = function (team) { const h = home(team); return { s: 0, x: h.x, z: h.z, c: -1, t: 0 }; };
    const st = { on: true, caps: [0, 0], f: [mk(0), mk(1)] };
    const list = function () { return cfg.ents ? cfg.ents() : []; };
    const byEid = function (id) { const a = list(); for (let i = 0; i < a.length; i++) if (a[i].eid === id) return a[i]; return null; };
    const near = function (e, p, r) { return Math.hypot(e.x - p.x, e.z - p.z) <= r; };

    function sendHome(team) { const f = st.f[team], h = home(team); f.s = 0; f.x = h.x; f.z = h.z; f.c = -1; f.t = 0; }

    return {
      st: st,
      /* a fighter tries to grab the enemy flag (after answering a question). Returns true if it worked. */
      act: function (e, kind) {
        if (!e || !e.alive || kind !== 'grab') return false;
        const f = st.f[1 - e.team];
        if (!f || f.s !== 0 || !near(e, home(1 - e.team), R.ACT_R)) return false;
        f.s = 1; f.c = e.eid; hook('grab', e.eid, 1 - e.team); return true;
      },
      /* run the flags (only the referee / solo game calls this) */
      update: function (dt) {
        for (let team = 0; team < 2; team++) {
          const f = st.f[team], thief = 1 - team;                  // the thief team is the one that carries this flag
          if (f.s === 1) {
            const car = byEid(f.c);
            if (!car || !car.alive) { const who = f.c; f.s = 2; f.c = -1; f.t = R.RETURN_SECS; hook('drop', who, team); }
            else {
              f.x = car.x; f.z = car.z;
              if (near(car, home(thief), R.CAP_R)) {               // captured!
                st.caps[thief]++; sendHome(team); hook('capture', car.eid, thief);
              }
            }
          } else if (f.s === 2) {
            const a = list();
            let got = null;
            for (let i = 0; i < a.length; i++) {
              const e = a[i];
              if (e.team === thief && e.alive && near(e, f, R.PICK_R)) { got = e; break; }
            }
            if (got) { f.s = 1; f.c = got.eid; f.t = 0; hook('pickup', got.eid, team); }
            else {
              f.t -= dt;
              if (f.t <= 0) { sendHome(team); hook('return', team, 0); }
            }
          }
        }
      },
      /* --- sending the state to the students (small numbers only) --- */
      pack: function () {
        const r1 = function (v) { return Math.round(v * 100) / 100; };
        return [st.caps[0], st.caps[1],
                st.f[0].s, r1(st.f[0].x), r1(st.f[0].z), st.f[0].c, Math.round(st.f[0].t * 10) / 10,
                st.f[1].s, r1(st.f[1].x), r1(st.f[1].z), st.f[1].c, Math.round(st.f[1].t * 10) / 10];
      },
      /* a student's computer copies what the referee sent */
      apply: function (a) {
        if (!Array.isArray(a) || a.length < 12) return;
        st.caps[0] = a[0] | 0; st.caps[1] = a[1] | 0;
        for (let i = 0; i < 2; i++) {
          const f = st.f[i], o = 2 + i * 5;
          f.s = a[o] | 0; f.x = +a[o + 1] || 0; f.z = +a[o + 2] || 0; f.c = a[o + 3] | 0; f.t = +a[o + 4] || 0;
        }
      }
    };
  };
})();
