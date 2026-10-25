/* EduStrike - the teacher's ON/OFF switch, as seen from the game and the teacher page.
   If ES.GATE.url is empty (offline testing) the switch is NOT used and the game is always open.

   Rules:
   - At start-up the game must hear "OPEN" from the teacher's switch, otherwise students see a closed screen.
   - While OPEN, the game re-checks about every minute. If the teacher turns it OFF, the match stops.
   - If the switch cannot be reached at start-up, the game stays closed (safe default).
   - During a match, a single hiccup in the internet is forgiven: it only closes after 3 failed checks in a row.
   - While closed, the game re-checks every 10 seconds, so students do not need to refresh when it is turned back ON. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});
  const cfg = ES.GATE = ES.GATE || {};

  function enabled() { return !!cfg.url; }

  /* fetch with a time limit, returns parsed JSON or throws */
  function fetchJson(url, opts) {
    const ctl = ('AbortController' in window) ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctl) ctl.abort(); }, 9000);
    opts = Object.assign({ cache: 'no-store', redirect: 'follow' }, opts || {});
    if (ctl) opts.signal = ctl.signal;
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }, function (e) { clearTimeout(timer); throw e; });
  }

  /* ask the switch: resolves {ok:true,state,message} or {ok:false,error} (never throws) */
  function getStatus() {
    return fetchJson(cfg.url + (cfg.url.indexOf('?') < 0 ? '?' : '&') + 'action=status&t=' + Date.now())
      .then(function (j) {
        if (j && j.ok && (j.state === 'OPEN' || j.state === 'CLOSED')) return j;
        return { ok: false, error: (j && j.error) || 'Unexpected answer from the switch.' };
      })
      .catch(function (e) { return { ok: false, error: String(e && e.message || e) }; });
  }

  /* teacher: set the switch (text/plain avoids a browser "preflight" that Apps Script cannot answer) */
  function setState(pin, state, message) {
    return fetchJson(cfg.url, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                body: JSON.stringify({ action: 'set', pin: pin, state: state, message: message || '' }) })
      .catch(function (e) { return { ok: false, error: 'Could not reach the switch: ' + String(e && e.message || e) }; });
  }

  /* ---- the watcher used by the student game ---- */
  let timer = 0, current = null, failStreak = 0, running = false, handlers = null;

  function schedule(ms) { clearTimeout(timer); timer = setTimeout(tick, ms); }

  function tick() {
    if (!running) return;
    getStatus().then(function (r) {
      if (!running) return;
      let next;
      if (r.ok) { failStreak = 0; next = r.state === 'OPEN' ? 'open' : 'closed'; }
      else {
        failStreak++;
        // first look = fail closed at once; later looks = forgive 2 hiccups in a row
        next = (current === 'open' && failStreak < 3) ? 'open' : 'error';
      }
      if (next !== current || (next === 'closed' && handlers.lastMsg !== r.message)) {
        current = next;
        handlers.lastMsg = r.message;
        if (next === 'open') handlers.onOpen();
        else if (next === 'closed') handlers.onClosed(r.message || '');
        else handlers.onError(r.error || '');
      }
      schedule(next === 'open' ? (cfg.openSeconds || 60) * 1000 : (cfg.retrySeconds || 10) * 1000);
    });
  }

  function run(h) {
    handlers = h; running = true; current = null; failStreak = 0;
    tick();
    document.addEventListener('visibilitychange', function () { if (!document.hidden && running) { clearTimeout(timer); tick(); } });
  }
  function checkNow() { if (running) { clearTimeout(timer); tick(); } }

  ES.gate = { enabled: enabled, getStatus: getStatus, setState: setState, run: run, checkNow: checkNow };
})();
