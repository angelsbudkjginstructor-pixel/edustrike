/* EduStrike - the "My Profile" button on the menu and the profile window (sign in, level, locker, badges).
   SAFETY CHECKS: every button press is wrapped so a mistake here can never stop the game from starting; all text from students is put on the page
   as plain text (never as HTML). */
(function () {
  'use strict';
  const ES = window.ES;
  const $ = function (id) { return document.getElementById(id); };
  const PR = ES.progress;
  let tab = 'locker', busy = false;

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }
  const hex = function (n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); };

  /* a little picture of the soldier with the chosen helmet, blaster and trail (drawn on a small canvas, nothing is downloaded) */
  function drawSoldier(cv, helm, gun, trail) {
    const c = cv.getContext('2d'), W = cv.width, H = cv.height; c.clearRect(0, 0, W, H);
    const u = W / 20;                                              // one "block"
    const rect = function (x, y, w, h, col) { c.fillStyle = col; c.fillRect(x * u, y * u, w * u, h * u); };
    // shot trail
    const t = trail.color === -1 ? null : (trail.color ? hex(trail.color) : '#9fdcff');
    if (t) rect(12.5, 8.4, 7.5, 0.5, t); else { ['#ff5a5a', '#ffc83d', '#4ade80', '#67e8f9', '#a855f7'].forEach(function (cc, i) { rect(12.5 + i * 1.5, 8.2, 1.5, 0.7, cc); }); }
    rect(5, 14, 3, 5, '#27384f'); rect(9, 14, 3, 5, '#27384f'); rect(4.5, 18, 3.8, 1.5, '#161d2b'); rect(8.7, 18, 3.8, 1.5, '#161d2b');   // legs + boots
    rect(4, 7.5, 9, 7, '#2f86ff'); rect(4, 10.8, 9, 0.8, '#1d5fc4'); rect(3, 7.5, 1.5, 5, '#2468d6');                                              // body + belt
    rect(5.2, 3.2, 6.6, 4.6, '#f2c9a0');                                                                                                           // face
    rect(4.8, 2.2, 7.4, 2.4, '#1d5fc4'); rect(4.6, 4.2, 0.8, 1.2, '#1d5fc4'); rect(11.6, 4.2, 0.8, 1.2, '#1d5fc4');                               // helmet
    rect(6.2, 5.2, 1.1, 1.1, '#12203a'); rect(9.6, 5.2, 1.1, 1.1, '#12203a');                                                                      // eyes
    const hc = helm.color ? hex(helm.color) : '#fff';
    if (helm.shape === 'cap') rect(4.6, 1.2, 7.8, 1.3, hc);
    else if (helm.shape === 'crest') rect(7.6, 0.2, 1.8, 2.4, hc);
    else if (helm.shape === 'horns') { rect(4.2, 0.4, 1.3, 2.4, hc); rect(11.5, 0.4, 1.3, 2.4, hc); }
    else if (helm.shape === 'halo') { c.strokeStyle = hc; c.lineWidth = u * 0.45; c.beginPath(); c.ellipse(8.5 * u, 0.9 * u, 4 * u, 1.1 * u, 0, 0, 6.3); c.stroke(); }
    else if (helm.shape === 'crown') { rect(5, 0.9, 7, 1.4, hc); rect(5, -0.3, 1.3, 1.5, hc); rect(8, -0.5, 1.3, 1.7, hc); rect(10.7, -0.3, 1.3, 1.5, hc); }
    const gc = gun.color ? hex(gun.color) : '#2f86ff';                                                                                              // blaster
    rect(10, 8, 7, 1.8, '#2b3445'); rect(10.5, 7.4, 3, 0.7, gc); rect(13.5, 8.3, 3.5, 0.5, gc); rect(11, 9.6, 1.2, 2, '#1c2230');
  }

  /* ---------- the menu strip ---------- */
  function strip() {
    let s = $('pf-strip');
    if (!s) {
      s = el('button', 'pf-strip'); s.id = 'pf-strip'; s.type = 'button';
      const brand = document.querySelector('#screen-menu .brand'); if (!brand || !brand.parentNode) return;
      brand.parentNode.insertBefore(s, brand.nextSibling);
      s.addEventListener('click', function () { open(); });
    }
    const p = PR.get();
    if (!p) { s.textContent = '👤 Sign in to save your XP, level and rewards'; s.classList.remove('in'); return; }
    const I = PR.info(p);
    s.textContent = '👤 ' + p.name + '  ·  Level ' + I.level + '  ·  ' + p.xp + ' XP  ▸';
    s.classList.add('in');
  }

  /* ---------- the window ---------- */
  function root() {
    let r = $('ov-profile');
    if (r) return r;
    r = el('div', 'overlay hidden'); r.id = 'ov-profile'; r.style.position = 'fixed'; r.style.zIndex = 40;
    document.body.appendChild(r);
    r.addEventListener('mousedown', function (e) { if (e.target === r) close(); });
    return r;
  }
  function open() { try { render(); root().classList.remove('hidden'); } catch (e) { /* ignore */ } }
  function close() { root().classList.add('hidden'); strip(); }

  function render() {
    const r = root(); r.innerHTML = '';
    const card = el('div', 'card wide pf-card'); r.appendChild(card);
    const p = PR.get();
    if (!p) return signInView(card);
    const I = PR.info(p);
    const head = el('div', 'pf-head'); card.appendChild(head);
    const cv = document.createElement('canvas'); cv.width = 160; cv.height = 160; cv.className = 'pf-prev'; head.appendChild(cv);
    drawSoldier(cv, PR.equipped('helmet'), PR.equipped('gun'), PR.equipped('trail'));
    const who = el('div', 'pf-who'); head.appendChild(who);
    who.appendChild(el('div', 'pf-name', p.name));
    who.appendChild(el('div', 'pf-lv', 'Level ' + I.level + (I.level >= PR.maxLevel ? ' (MAX)' : '')));
    const bar = el('div', 'pf-bar'); const fill = el('div', 'pf-fill'); fill.style.width = I.pct + '%'; bar.appendChild(fill); who.appendChild(bar);
    who.appendChild(el('div', 'pf-xp', I.level >= PR.maxLevel ? p.xp + ' XP' : p.xp + ' XP  ·  ' + (I.need - I.into) + ' XP to level ' + (I.level + 1)));
    who.appendChild(el('div', 'pf-save', ES.PROGRESS && ES.PROGRESS.url ? (p.dirty ? '☁️ Waiting to save to the class sheet…' : '☁️ Saved to the class sheet') : '💾 Saved on this computer'));
    const acc = p.asked ? Math.round(100 * p.right / p.asked) : 0;
    card.appendChild(el('div', 'pf-stats', '🎮 ' + p.matches + (p.matches === 1 ? ' match' : ' matches') + '  ·  🏆 ' + p.wins + ' wins  ·  🧠 ' + p.right + '/' + p.asked + ' right (' + acc + '%)  ·  🔥 best streak ' + p.bestStreak));

    const tabs = el('div', 'pf-tabs'); card.appendChild(tabs);
    [['locker', '🎒 Locker'], ['perks', '⚡ Perks'], ['badges', '🏅 Badges']].forEach(function (t) {
      const b = el('button', 'pf-tab' + (tab === t[0] ? ' on' : ''), t[1]); b.type = 'button';
      b.addEventListener('click', function () { tab = t[0]; render(); }); tabs.appendChild(b);
    });
    const body = el('div', 'pf-body'); card.appendChild(body);
    if (tab === 'locker') lockerView(body, p, I, cv);
    else if (tab === 'perks') perksView(body, I);
    else badgesView(body, p);

    const row = el('div', 'btnrow'); card.appendChild(row);
    const sw = el('button', 'btn small ghost dark', 'Switch student'); sw.type = 'button'; sw.addEventListener('click', function () { PR.signOut(); render(); }); row.appendChild(sw);
    const cl = el('button', 'btn small', 'Close'); cl.type = 'button'; cl.addEventListener('click', close); row.appendChild(cl);
  }

  function lockerView(body, p, I, cv) {
    PR.kinds.forEach(function (k) {
      body.appendChild(el('h4', 'pf-h', PR.kindName[k]));
      const grid = el('div', 'pf-grid'); body.appendChild(grid);
      PR.cat[k].forEach(function (it) {
        const open = it.lvl <= I.level, on = p.equip[k] === it.id;
        const b = el('button', 'pf-item' + (on ? ' on' : '') + (open ? '' : ' lock')); b.type = 'button';
        const sw = el('span', 'pf-sw'); sw.style.background = it.color === -1 ? 'linear-gradient(90deg,#ff5a5a,#ffc83d,#4ade80,#67e8f9,#a855f7)' : (it.color ? hex(it.color) : '#cfd8e8'); b.appendChild(sw);
        b.appendChild(el('span', 'pf-in', it.name));
        b.appendChild(el('span', 'pf-il', open ? (on ? '✔ on' : 'Use') : '🔒 Lv ' + it.lvl));
        if (open) b.addEventListener('click', function () { PR.equip(k, it.id); render(); });
        grid.appendChild(b);
      });
    });
  }
  function perksView(body, I) {
    body.appendChild(el('p', 'hint', 'Perks switch on by themselves as you level up. They are small, so every student has a fair game.'));
    PR.perkList.forEach(function (pk) {
      const open = I.level >= pk[0], row = el('div', 'pf-perk' + (open ? ' on' : ''));
      row.appendChild(el('span', 'pf-pl', open ? '✅' : '🔒 Lv ' + pk[0])); row.appendChild(el('span', '', pk[1])); body.appendChild(row);
    });
  }
  function badgesView(body, p) {
    const grid = el('div', 'pf-badges'); body.appendChild(grid);
    const ids = PR.badgeIds.slice();
    Object.keys(ES.SUBJECTS || {}).forEach(function (k) { ids.push('sj_' + k); });
    ids.forEach(function (id) {
      const bi = PR.badgeInfo(id), has = p.badges.indexOf(id) >= 0;
      const d = el('div', 'pf-badge' + (has ? ' has' : '')); d.title = bi[2];
      d.appendChild(el('div', 'pf-bi', has ? bi[0] : '❔')); d.appendChild(el('div', 'pf-bn', bi[1])); d.appendChild(el('div', 'pf-bd', bi[2]));
      grid.appendChild(d);
    });
  }

  function signInView(card) {
    card.appendChild(el('h2', '', '👤 My Profile'));
    card.appendChild(el('p', 'big', 'Sign in to save your XP, level, badges and rewards.'));
    const f = el('div', 'pf-form'); card.appendChild(f);
    const n = document.createElement('input'); n.type = 'text'; n.maxLength = 12; n.placeholder = 'Your name'; n.autocomplete = 'off'; n.value = (ES.settings && ES.settings.name && ES.settings.name !== 'Cadet') ? ES.settings.name : (PR.lastName() || '');
    const c = document.createElement('input'); c.type = 'text'; c.maxLength = 4; c.placeholder = '4-number code'; c.autocomplete = 'off'; c.inputMode = 'numeric';
    c.addEventListener('input', function () { c.value = c.value.replace(/\D/g, '').slice(0, 4); });
    f.appendChild(n); f.appendChild(c);
    const msg = el('p', 'pf-msg hidden'); card.appendChild(msg);
    const go = el('button', 'btn big', 'Sign in / Create'); go.type = 'button'; card.appendChild(go);
    card.appendChild(el('p', 'hint', 'First time? Pick your name and any 4 numbers you will remember. Next time, use the same name and the same 4 numbers to get your progress back.'));
    const cl = el('button', 'btn small ghost dark', 'Not now'); cl.type = 'button'; cl.addEventListener('click', close); card.appendChild(cl);
    const run = function () {
      if (busy) return; busy = true; go.disabled = true; msg.classList.add('hidden');
      PR.signIn(n.value, c.value).then(function (r) {
        busy = false; go.disabled = false;
        if (!r.ok) { msg.textContent = r.msg; msg.classList.remove('hidden'); return; }
        render();
      });
    };
    go.addEventListener('click', run); c.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); }); n.addEventListener('keydown', function (e) { if (e.key === 'Enter') c.focus(); });
  }

  /* keep the game's name field in step with the profile */
  function follow(p) {
    try {
      if (p && ES.settings) { ES.settings.name = p.name; ES.saveSettings(); const sn = $('set-name'); if (sn) sn.value = p.name; const rn = $('room-name-in'); if (rn && !rn.value) rn.value = p.name; }
    } catch (e) { /* ignore */ }
    strip();
  }

  ES.profileUI = { open: open, close: close, strip: strip, drawSoldier: drawSoldier };
  function init() { PR.onChange(follow); strip(); if (PR.get()) follow(PR.get()); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
