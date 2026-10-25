/* EduStrike - the "phone line" between the teacher's computer (the host) and the students.
   It uses WebRTC through the free PeerJS library: students connect straight to the teacher's
   page over the school WiFi. No server of ours, nothing to pay for.

   The only thing that goes through the internet is the first "hello" (the PeerJS free
   introduction service). After that, game messages go directly between computers.

   SAFETY CHECKS:
   - every send is wrapped (a closed connection can never crash the game)
   - the host retries with a new room code if a code is already taken
   - a student who types a wrong code gets a friendly message, not a blank screen
   - room codes use letters/numbers that are hard to mix up (no 0/O, 1/I/L) */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const PREFIX = 'edustrike-';
  const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

  function available() { return typeof window.Peer === 'function'; }

  /* Automatic tests may point at their own local introduction server by setting window.ES_TEST_PEER */
  function peerOptions() {
    const o = Object.assign({ debug: 0 }, window.ES_TEST_PEER || {});
    // Relay (TURN) servers help when two devices are on DIFFERENT networks, e.g. a student at home.
    // They only carry traffic when a direct connection is impossible. Set up in config.js (ES.ICE).
    if (ice.length && !(o.config && o.config.iceServers)) {
      o.config = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }].concat(ice) };
    }
    return o;
  }

  /* ---- relay server list: either typed into config.js (servers) or fetched from the relay provider (fetchUrl) ---- */
  let ice = [], iceState = 'idle', iceWaiters = [];
  function iceConfigured() { const c = ES.ICE || {}; return !!((c.servers && c.servers.length) || c.fetchUrl); }
  function loadIce() {
    if (iceState !== 'idle') return;
    const c = ES.ICE || {};
    if (c.servers && c.servers.length) ice = c.servers.slice();
    if (!c.fetchUrl) { iceState = 'done'; return; }
    iceState = 'loading';
    const finish = function () { if (iceState === 'done') return; iceState = 'done'; const w = iceWaiters; iceWaiters = []; w.forEach(function (f) { f(); }); };
    try {
      fetch(c.fetchUrl).then(function (r) { return r.json(); }).then(function (j) { if (Array.isArray(j) && j.length) ice = ice.concat(j); finish(); }).catch(finish);   // if it fails the game still works on a normal network
    } catch (e) { finish(); }
    setTimeout(finish, 4000);                    // never make anyone wait more than 4 seconds for the relay list
  }
  function withIce(cb) {
    loadIce();
    if (iceState === 'done') cb(); else iceWaiters.push(cb);
  }
  loadIce();                                       // start fetching as soon as the page loads

  function newCode() {
    let s = '';
    for (let i = 0; i < 5; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
  }
  /* tidy what a student typed: capitals only, no spaces or dashes */
  function cleanCode(txt) { return String(txt || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5); }
  function safeSend(conn, msg) {
    try { if (conn && conn.open) { conn.send(msg); return true; } } catch (e) { /* connection closing */ }
    return false;
  }

  /* ---------------- teacher side ---------------- */
  /* h = { onOpen(code), onJoin(conn), onData(conn,msg), onLeave(conn), onError(text) } */
  function createHost(h) {
    let tries = 0, peer = null, code = '', closed = false;
    const conns = [];

    function attempt() {
      code = newCode();
      let opened = false;
      try { peer = new window.Peer(PREFIX + code, peerOptions()); }
      catch (e) { h.onError('Could not start the connection (' + e.message + ').'); return; }
      const mine = peer;
      mine.on('open', function () { opened = true; h.onOpen(code); });
      mine.on('connection', function (conn) {
        conn.on('open', function () { conns.push(conn); h.onJoin(conn); });
        conn.on('data', function (d) { try { h.onData(conn, d); } catch (e) { console.error('EduStrike host message error', e); } });
        const gone = function () { const i = conns.indexOf(conn); if (i >= 0) { conns.splice(i, 1); h.onLeave(conn); } };
        conn.on('close', gone); conn.on('error', gone);
      });
      mine.on('error', function (err) {
        const type = err && err.type;
        if (type === 'unavailable-id' && !opened && tries++ < 6) { try { mine.destroy(); } catch (e) { /* ignore */ } attempt(); return; }
        if (closed) return;
        if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') h.onError('Cannot reach the internet introduction service. Check the internet and try again.');
        else if (type === 'browser-incompatible') h.onError('This browser cannot do live connections (WebRTC). Please use Google Chrome.');
        else h.onError('Connection problem: ' + (type || String(err)));
      });
      // if the internet blinks, the already-joined students stay connected; reconnect so NEW students can still join
      mine.on('disconnected', function () { if (!closed && !mine.destroyed) { setTimeout(function () { try { mine.reconnect(); } catch (e) { /* ignore */ } }, 1500); } });
    }
    withIce(function () { if (!closed) attempt(); });
    return {
      code: function () { return code; },
      conns: conns,
      send: safeSend,
      broadcast: function (msg) { for (let i = 0; i < conns.length; i++) safeSend(conns[i], msg); },
      closeConn: function (conn) { try { conn.close(); } catch (e) { /* ignore */ } },
      close: function () { closed = true; conns.slice().forEach(function (c) { try { c.close(); } catch (e) { /* ignore */ } }); try { peer.destroy(); } catch (e) { /* ignore */ } }
    };
  }

  /* ---------------- student side ---------------- */
  /* h = { onOpen(), onData(msg), onClose(), onError(kind, text) }   kind: 'notfound' | 'timeout' | 'network' | 'other' */
  function join(rawCode, h) {
    const code = cleanCode(rawCode);
    let peer = null, conn = null, done = false, timer = 0;
    const fail = function (kind, text) { if (done) return; done = true; clearTimeout(timer); h.onError(kind, text); };
    timer = setTimeout(function () {
      fail('timeout', iceConfigured()
        ? "Could not connect. Check that you typed the right code and that your teacher's room is open. If you are on a school or home network that blocks games, ask your teacher."
        : "Could not connect. Check that you typed the right code, that your teacher's room is open, and that you are on the school WiFi.");
      try { if (peer) peer.destroy(); } catch (e) { /* ignore */ }
    }, iceConfigured() ? 30000 : 15000);          // going through a relay takes a little longer
    withIce(function () { if (!done) start(); });
    function start() {
    try { peer = new window.Peer(peerOptions()); }
    catch (e) { fail('other', 'This browser cannot do live connections. Please use Google Chrome.'); return; }
    peer.on('open', function () {
      conn = peer.connect(PREFIX + code, { reliable: true });
      conn.on('open', function () { if (done) return; done = true; clearTimeout(timer); h.onOpen(); });
      conn.on('data', function (d) { try { h.onData(d); } catch (e) { console.error('EduStrike message error', e); } });
      conn.on('close', function () { if (done) h.onClose(); else fail('other', 'The teacher closed the room.'); });
      conn.on('error', function () { if (done) h.onClose(); else fail('other', 'Connection problem.'); });
    });
    peer.on('error', function (err) {
      const type = err && err.type;
      if (type === 'peer-unavailable') fail('notfound', 'Room "' + code + '" was not found. Check the code with your teacher.');
      else if (type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed') fail('network', 'Cannot reach the internet introduction service. Check your internet.');
      else if (done) h.onClose();
      else fail('other', 'Connection problem: ' + (type || String(err)));
    });
    }
    return {
      code: code,
      send: function (msg) { return safeSend(conn, msg); },
      close: function () { done = true; clearTimeout(timer); try { if (peer) peer.destroy(); } catch (e) { /* ignore */ } }
    };
  }

  ES.net = { available: available, createHost: createHost, join: join, cleanCode: cleanCode, newCode: newCode };
})();
