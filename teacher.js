/* EduStrike - teacher control page.
   The PIN is only kept in this browser tab (sessionStorage) and is forgotten when the tab is closed.
   SAFETY: buttons are disabled while a request is running (no double presses), and every answer is shown in plain words. */
(function () {
  'use strict';
  const ES = window.ES;
  const $ = function (id) { return document.getElementById(id); };
  let busy = false;

  function showStatus(r) {
    const box = $('t-status'), txt = $('t-status-text');
    box.className = 't-status';
    if (r && r.ok && r.state === 'OPEN') { box.classList.add('open'); txt.textContent = 'Game is ON (students can play)'; }
    else if (r && r.ok) { box.classList.add('closed'); txt.textContent = 'Game is OFF (students are locked out)'; }
    else txt.textContent = "Can't read the switch";
  }
  function say(text, good) { const m = $('t-msg'); m.textContent = text; m.className = 't-msg ' + (good ? 'good' : 'bad'); }
  function setBusy(b) { busy = b; $('t-on').disabled = b; $('t-off').disabled = b; }

  function refresh() {
    ES.gate.getStatus().then(function (r) {
      showStatus(r);
      if (r.ok && r.state === 'CLOSED' && r.message) $('t-note').value = r.message;
      if (!r.ok) say(r.error, false);
    });
  }

  function press(state) {
    if (busy) return;
    const pin = $('t-pin').value.trim();
    if (!pin) { say('Please type your teacher PIN first.', false); $('t-pin').focus(); return; }
    setBusy(true); say('Working…', true);
    ES.gate.setState(pin, state, state === 'CLOSED' ? $('t-note').value : '').then(function (r) {
      setBusy(false);
      if (r && r.ok) {
        try { sessionStorage.setItem('es.pin', pin); } catch (e) { /* ignore */ }
        showStatus(r);
        say(r.state === 'OPEN' ? '✅ The game is now ON.' : '✅ The game is now OFF.', true);
      } else {
        say((r && r.error) || 'Something went wrong.', false);
      }
    });
  }

  function init() {
    if (!ES.gate.enabled()) { $('t-nourl').classList.remove('hidden'); $('t-status-text').textContent = 'Not connected'; setBusy(true); return; }
    try { const p = sessionStorage.getItem('es.pin'); if (p) $('t-pin').value = p; } catch (e) { /* ignore */ }
    $('t-on').addEventListener('click', function () { press('OPEN'); });
    $('t-off').addEventListener('click', function () { press('CLOSED'); });
    $('t-pin').addEventListener('keydown', function (e) { if (e.key === 'Enter') press('CLOSED'); });
    refresh();
    setInterval(refresh, 20000);
  }
  init();
})();
