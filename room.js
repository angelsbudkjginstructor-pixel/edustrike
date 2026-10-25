/* EduStrike - the class room, TEACHER side (runs inside the teacher page).
   It keeps the list of students who joined, their team (Blue/Red), and tells everybody when something changes.

   Who can change a team?
   - the student, by pressing Blue or Red (unless the teacher has pressed "Lock teams")
   - the teacher, any time

   SAFETY CHECKS:
   - names are cleaned (no HTML, max 12 letters) and made unique ("Sam", "Sam 2")
   - at most MAX students can join; extra students get a friendly "room is full"
   - a student who closes the page is removed straight away
   - every message type is checked, anything unknown is ignored */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const MAX = 30;

  let host = null, players = [], nextId = 1, code = '';
  let phase = 'lobby', lockTeams = false;
  let cb = {}, dirty = false, pushTimer = 0;
  const extra = {};          // later stages add their own message handlers here: ES.room.on('state', fn)

  function cleanName(raw) {
    let n = String(raw == null ? '' : raw).replace(/[<>&"'`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12);
    return n || 'Cadet';
  }
  function uniqueName(n) {
    let out = n, k = 2;
    const taken = function (x) { return players.some(function (p) { return p.name.toLowerCase() === x.toLowerCase(); }); };
    while (taken(out)) { out = n.slice(0, 10) + ' ' + k++; }
    return out;
  }
  function counts() { const c = [0, 0]; players.forEach(function (p) { if (p.team === 0 || p.team === 1) c[p.team]++; }); return c; }
  function byConn(conn) { for (let i = 0; i < players.length; i++) if (players[i].conn === conn) return players[i]; return null; }
  function byId(id) { for (let i = 0; i < players.length; i++) if (players[i].id === id) return players[i]; return null; }

  function publicList() { return players.map(function (p) { return { id: p.id, name: p.name, team: p.team, rtt: p.rtt }; }); }
  function sendAll(msg) { if (host) host.broadcast(msg); }

  /* tell everybody the new list (waits 150 ms so several changes are sent together) */
  function changed() {
    dirty = true;
    if (pushTimer) return;
    pushTimer = setTimeout(function () {
      pushTimer = 0;
      if (!dirty || !host) return;
      dirty = false;
      sendAll({ t: 'roster', list: publicList(), phase: phase, lock: lockTeams });
      if (cb.onChange) cb.onChange();
    }, 150);
  }

  function open(callbacks) {
    close();
    cb = callbacks || {};
    if (!ES.net.available()) { if (cb.onError) cb.onError('The connection library did not load. Refresh the page.'); return; }
    host = ES.net.createHost({
      onOpen: function (c) { code = c; phase = 'lobby'; if (cb.onOpen) cb.onOpen(c); },
      onError: function (text) { if (cb.onError) cb.onError(text); },
      onJoin: function () { /* wait for the student's "hello" message */ },
      onLeave: function (conn) {
        const p = byConn(conn);
        if (!p) return;
        players.splice(players.indexOf(p), 1);
        if (extra.leave) extra.leave(p);
        changed();
      },
      onData: function (conn, m) {
        if (!m || typeof m.t !== 'string') return;
        let p = byConn(conn);
        if (m.t === 'hello') {
          if (p) return;
          if (players.length >= MAX) { host.send(conn, { t: 'full' }); setTimeout(function () { host.closeConn(conn); }, 300); return; }
          const c = counts();
          p = { id: nextId++, conn: conn, name: uniqueName(cleanName(m.name)), team: c[0] <= c[1] ? 0 : 1, rtt: 0, joined: Date.now(), lastSeen: Date.now() };
          players.push(p);
          host.send(conn, { t: 'welcome', id: p.id, code: code, list: publicList(), phase: phase, lock: lockTeams, name: p.name, team: p.team });
          if (extra.join) extra.join(p);
          changed();
          return;
        }
        if (!p) return;                                    // must say hello first
        p.lastSeen = Date.now();
        if (m.t === 'team') {
          if (lockTeams || phase !== 'lobby') { host.send(conn, { t: 'roster', list: publicList(), phase: phase, lock: lockTeams }); return; }
          if (m.team === 0 || m.team === 1) { p.team = m.team; changed(); }
        } else if (m.t === 'ping') {
          p.rtt = Math.max(0, Math.min(9999, Number(m.rtt) || 0));
          host.send(conn, { t: 'pong', ts: m.ts });
        } else if (extra[m.t]) {
          extra[m.t](p, m);
        }
      }
    });
    // refresh the list now and then so the "ping" numbers stay fresh
    clearInterval(open.tick);
    open.tick = setInterval(function () {
      if (!host) return;
      // a student who has been silent for 10 s has lost connection (closed laptop, WiFi gone): remove them
      const now = Date.now();
      players.slice().forEach(function (p) {
        if (now - p.lastSeen > 10000) { players.splice(players.indexOf(p), 1); if (extra.leave) extra.leave(p); host.closeConn(p.conn); changed(); }
      });
      if (players.length) changed();
    }, 3000);
  }

  function close() {
    clearInterval(open.tick); clearTimeout(pushTimer); pushTimer = 0;
    if (host) { sendAll({ t: 'closed' }); const h = host; host = null; setTimeout(function () { h.close(); }, 200); }
    players = []; code = ''; phase = 'lobby'; lockTeams = false;
  }

  ES.room = {
    open: open, close: close,
    isOpen: function () { return !!host && !!code; },
    code: function () { return code; },
    list: publicList,
    players: function () { return players; },
    phase: function () { return phase; },
    setPhase: function (p) { phase = p; changed(); },
    counts: counts,
    locked: function () { return lockTeams; },
    setLock: function (v) { lockTeams = !!v; changed(); },
    setTeam: function (id, team) { const p = byId(id); if (p && (team === 0 || team === 1)) { p.team = team; changed(); } },
    /* shuffle everybody into two fair teams */
    mix: function () {
      const a = players.slice();
      for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; }
      a.forEach(function (p, i) { p.team = i % 2; });
      changed();
    },
    kick: function (id) { const p = byId(id); if (p) { host.send(p.conn, { t: 'kicked' }); setTimeout(function () { host.closeConn(p.conn); }, 200); } },
    say: function (text) { sendAll({ t: 'say', text: String(text || '').slice(0, 140) }); },
    send: function (p, msg) { if (host) host.send(p.conn, msg); },
    broadcast: sendAll,
    on: function (type, fn) { extra[type] = fn; }
  };
})();
