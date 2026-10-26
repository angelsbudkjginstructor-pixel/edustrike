/* EduStrike - RESCUE & BOMB mode: the rules (shared by the solo game and the teacher's referee page).
   One round:
     - BLUE frees the hostage (answer a question next to them) and brings them to the blue safe zone  -> Blue wins the round, "We are saved!"
       Blue can also win by defusing the bomb.
     - RED plants the bomb at the site (answer a question next to it). If nobody defuses it in 15 seconds -> BOOM, Red wins the round.
     - If the round clock runs out and no bomb is planted, the team with more tags in that round wins (a tie goes to Blue).
   The match is "best of N rounds" (the first team to win the majority wins). Tags still count and show on the scoreboard.

   This file only holds the NUMBERS and RULES (no pictures, no sound), so the teacher's page can run it too.
   SAFETY CHECKS: every action is checked (right team, alive, close enough, right state, round is live) before it counts;
   a missing carrier or bad numbers can never crash the round; the hostage is dropped if the carrier is tagged. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.RB = {
    BOMB_SECS: 15,        // time to defuse after the bomb is planted
    BETWEEN_SECS: 5,      // pause between rounds (the banner shows who won)
    ACT_R: 4.5,           // how close you must be to rescue / plant / defuse
    PICK_R: 1.5,          // walk this close to a dropped hostage to pick them up again
    SAFE_R: 3.6,          // the blue safe zone is a circle this big
    ROUNDS: [1, 3, 5, 7, 9],
    DEFAULT_ROUNDS: 3, DEFAULT_MINUTES: 3
  };

  /* clean numbers that came from a menu or the network */
  ES.rbClean = function (rounds, minutes) {
    let r = Math.round(Number(rounds)); if (!isFinite(r) || r < 1) r = ES.RB.DEFAULT_ROUNDS; r = Math.min(9, r);
    let m = Number(minutes); if (!isFinite(m) || m < 1) m = ES.RB.DEFAULT_MINUTES; m = Math.min(10, m);
    return { rounds: r, minutes: m };
  };

  /* cfg: { rounds, minutes, spots: {h:{x,z}, s:{x,z}, z:{x,z}}, ents: function -> list of fighters, hook: function(name, a, b) }
     "ents" are only needed by the referee / solo game (a student's computer just copies the state with apply()). */
  ES.createRB = function (cfg) {
    const R = ES.RB, c = ES.rbClean(cfg.rounds, cfg.minutes), spots = cfg.spots;
    const hook = cfg.hook || function () { /* no listener */ };
    const need = Math.floor(c.rounds / 2) + 1;
    /* st = the whole state of the mode. ph: 0 = round is live, 1 = between rounds (banner), 2 = match over
       h (hostage):  s 0 = tied up, 1 = being carried, 2 = dropped, 3 = saved     x z = where, c = carrier's id
       b (bomb):     s 0 = not planted, 1 = ticking, 2 = defused, 3 = exploded     t = seconds left */
    const st = {
      on: true, rounds: c.rounds, need: need, rtime: c.minutes * 60, round: 1, wins: [0, 0], ph: 0, tLeft: c.minutes * 60, bt: 0,
      h: { s: 0, x: spots.h.x, z: spots.h.z, c: -1 }, b: { s: 0, t: 0 }, win: -1, why: '', rk: [0, 0], final: false
    };
    const list = function () { return cfg.ents ? cfg.ents() : []; };
    const byEid = function (id) { const a = list(); for (let i = 0; i < a.length; i++) if (a[i].eid === id) return a[i]; return null; };
    const near = function (e, p, r) { return Math.hypot(e.x - p.x, e.z - p.z) <= r; };

    /* put everything back for a fresh round (the caller also moves every fighter back to their spawn) */
    function begin() {
      st.ph = 0; st.tLeft = st.rtime; st.bt = 0; st.win = -1; st.why = ''; st.rk = [0, 0]; st.final = false;
      st.h.s = 0; st.h.x = spots.h.x; st.h.z = spots.h.z; st.h.c = -1;
      st.b.s = 0; st.b.t = 0;
    }
    /* a team wins the round */
    function winRound(team, why) {
      if (st.ph !== 0) return;
      st.ph = 1; st.win = team; st.why = why; st.bt = R.BETWEEN_SECS; st.wins[team]++;
      st.final = st.wins[team] >= need;
      if (why === 'saved') st.h.s = 3;
      hook('win', team, why);
    }

    return {
      st: st,
      need: need,
      /* a fighter was tagged (used for the "more tags wins" tie-break when time runs out) */
      killed: function (attackerTeam) { if (st.ph === 0 && (attackerTeam === 0 || attackerTeam === 1)) st.rk[attackerTeam]++; },
      /* a fighter tries to rescue / plant / defuse. Returns true if it worked. */
      act: function (e, kind) {
        if (!e || !e.alive || st.ph !== 0) return false;
        if (kind === 'rescue') {
          if (e.team !== 0 || st.h.s !== 0 || !near(e, st.h, R.ACT_R)) return false;
          st.h.s = 1; st.h.c = e.eid; hook('rescue', e.eid); return true;
        }
        if (kind === 'plant') {
          if (e.team !== 1 || st.b.s !== 0 || st.h.s === 3 || !near(e, spots.z, R.ACT_R)) return false;
          st.b.s = 1; st.b.t = R.BOMB_SECS; hook('plant', e.eid); return true;
        }
        if (kind === 'defuse') {
          if (e.team !== 0 || st.b.s !== 1 || !near(e, spots.z, R.ACT_R)) return false;
          st.b.s = 2; hook('defuse', e.eid); winRound(0, 'defuse'); return true;
        }
        return false;
      },
      /* run the clock (only the referee / solo game calls this) */
      update: function (dt) {
        if (st.ph === 2) return;
        if (st.ph === 1) {
          st.bt -= dt;
          if (st.bt <= 0) {
            if (st.final) { st.ph = 2; hook('over'); }
            else { st.round++; begin(); hook('round', st.round); }
          }
          return;
        }
        // --- the hostage ---
        if (st.h.s === 1) {
          const car = byEid(st.h.c);
          if (!car || !car.alive) { st.h.s = 2; st.h.c = -1; hook('drop'); }
          else {
            st.h.x = car.x + Math.sin(car.yaw) * 0.9; st.h.z = car.z + Math.cos(car.yaw) * 0.9;     // stands just behind the rescuer
            if (near(car, spots.s, R.SAFE_R)) { winRound(0, 'saved'); return; }
          }
        } else if (st.h.s === 2) {                                      // dropped: any blue fighter who walks up takes them along
          const a = list();
          for (let i = 0; i < a.length; i++) {
            const e = a[i];
            if (e.team === 0 && e.alive && near(e, st.h, R.PICK_R)) { st.h.s = 1; st.h.c = e.eid; hook('pickup', e.eid); break; }
          }
        }
        // --- the bomb ---
        if (st.b.s === 1) {
          st.b.t -= dt;
          if (st.b.t <= 0) { st.b.t = 0; st.b.s = 3; hook('boom'); winRound(1, 'boom'); }
          return;                                                        // the round clock waits while the bomb ticks
        }
        // --- the round clock ---
        st.tLeft -= dt;
        if (st.tLeft <= 0) {
          st.tLeft = 0;
          winRound(st.rk[1] > st.rk[0] ? 1 : 0, st.rk[0] === st.rk[1] ? 'tie' : 'tags');       // more tags wins; a tie goes to Blue
        }
      },
      /* --- sending the state to the students (small numbers only) --- */
      pack: function () {
        return [st.ph, st.round, st.wins[0], st.wins[1], Math.round(st.tLeft * 10) / 10, st.h.s, Math.round(st.h.x * 100) / 100, Math.round(st.h.z * 100) / 100,
                st.h.c, st.b.s, Math.round(st.b.t * 10) / 10, st.win, st.final ? 1 : 0, st.why];
      },
      /* a student's computer copies what the referee sent */
      apply: function (a) {
        if (!Array.isArray(a) || a.length < 13) return;
        st.ph = a[0] | 0; st.round = a[1] | 0; st.wins[0] = a[2] | 0; st.wins[1] = a[3] | 0; st.tLeft = +a[4] || 0;
        st.h.s = a[5] | 0; st.h.x = +a[6] || 0; st.h.z = +a[7] || 0; st.h.c = a[8] | 0; st.b.s = a[9] | 0; st.b.t = +a[10] || 0; st.win = a[11] | 0; st.final = !!a[12];
        if (typeof a[13] === 'string') st.why = a[13].slice(0, 12);
      }
    };
  };
})();
