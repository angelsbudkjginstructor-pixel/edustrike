/* EduStrike - the class room, STUDENT side: keeps the live link to the teacher's page.
   It remembers the room list, our team, and measures the connection speed ("ping").

   SAFETY CHECKS:
   - leave() is safe to call at any time (even twice)
   - a lost connection always ends with onEnd('lost') so the screen can say so in plain words
   - the "ping" timer stops the moment we leave, so nothing keeps running in the background */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  let link = null, timer = 0, cb = {}, rtt = 0, handlers = {}, lastMsg = 0;
  const S = { connected: false, code: '', me: null, roster: [], phase: 'lobby', lock: false };

  function reset() { S.connected = false; S.code = ''; S.me = null; S.roster = []; S.phase = 'lobby'; S.lock = false; rtt = 0; }

  function leave(silent) {
    clearInterval(timer); timer = 0;
    const l = link; link = null;
    const was = S.connected;
    S.connected = false;
    if (l) l.close();
    reset();
    if (was && !silent && cb.onEnd) cb.onEnd('left');
  }

  function end(reason) {
    if (!link) return;
    clearInterval(timer); timer = 0;
    const l = link; link = null; l.close(); reset();
    if (cb.onEnd) cb.onEnd(reason);
  }

  /* callbacks: onJoined(), onState(), onSay(text), onEnd(reason), onError(kind,text) */
  function join(code, name, callbacks) {
    leave(true);
    cb = callbacks || {};
    if (!ES.net.available()) { if (cb.onError) cb.onError('other', 'The connection library did not load. Refresh the page.'); return; }
    S.code = ES.net.cleanCode(code);
    link = ES.net.join(code, {
      onOpen: function () {
        link.send({ t: 'hello', name: name });
        // if the teacher never answers "hello", do not wait forever
        setTimeout(function () { if (link && !S.connected && cb.onError) { const l = link; link = null; l.close(); cb.onError('timeout', 'The teacher did not answer. Try again.'); } }, 8000);
      },
      onData: function (m) {
        if (!m || typeof m.t !== 'string') return;
        lastMsg = Date.now();
        if (m.t === 'welcome') {
          S.connected = true; S.me = { id: m.id, name: m.name, team: m.team };
          S.roster = m.list || []; S.phase = m.phase; S.lock = !!m.lock; S.code = m.code || S.code;
          lastMsg = Date.now();
          // every 2 s: measure speed, and check the teacher is still there (silence for 8 s = connection lost)
          timer = setInterval(function () {
            if (!link) return;
            if (Date.now() - lastMsg > 8000) { end('lost'); return; }
            link.send({ t: 'ping', ts: performance.now(), rtt: rtt });
          }, 2000);
          if (cb.onJoined) cb.onJoined();
          if (cb.onState) cb.onState();
        } else if (m.t === 'roster') {
          S.roster = m.list || []; S.phase = m.phase; S.lock = !!m.lock;
          for (let i = 0; i < S.roster.length; i++) if (S.me && S.roster[i].id === S.me.id) { S.me.team = S.roster[i].team; S.me.name = S.roster[i].name; }
          if (cb.onState) cb.onState();
        } else if (m.t === 'pong') {
          rtt = Math.round(performance.now() - m.ts);
        } else if (m.t === 'say') { if (cb.onSay) cb.onSay(String(m.text || '')); }
        else if (m.t === 'full') { const l = link; link = null; if (l) l.close(); if (cb.onError) cb.onError('full', 'This class room is full.'); }
        else if (m.t === 'kicked') end('kicked');
        else if (m.t === 'closed') end('closed');
        else if (handlers[m.t]) handlers[m.t](m);
      },
      onClose: function () { end('lost'); },
      onError: function (kind, text) { link = null; if (cb.onError) cb.onError(kind, text); }
    });
  }

  ES.session = {
    state: S, join: join, leave: leave,
    send: function (msg) { return link ? link.send(msg) : false; },
    setTeam: function (team) { if (link && S.connected) link.send({ t: 'team', team: team }); },
    rtt: function () { return rtt; },
    on: function (type, fn) { handlers[type] = fn; }
  };
})();
