/**
 * EduStrike - Teacher ON/OFF switch (Google Apps Script)
 * --------------------------------------------------------------
 * What it does:
 *   - Keeps ONE switch: OPEN or CLOSED (plus an optional message for students).
 *   - Anyone (the game) can READ the switch.
 *   - Only someone who knows the TEACHER_PIN can CHANGE it.
 *
 * Where things are stored: Project Settings > Script properties
 *   TEACHER_PIN   = the secret PIN you choose (you type it in Project Settings, never in this code)
 *   GAME_STATE    = OPEN or CLOSED   (written by this script)
 *   GAME_MESSAGE  = text shown to students when closed (written by this script)
 *
 * SAFETY CHECKS built in:
 *   1. Switch is CLOSED by default (if nothing was ever set, students cannot enter).
 *   2. Wrong PIN 5 times  -> the PIN is locked for 5 minutes (stops guessing).
 *   3. LockService        -> two people pressing at the same moment cannot corrupt the switch.
 *   4. Bad / empty requests return a clear error instead of crashing.
 */

var MAX_TRIES = 5;        // wrong PINs allowed before the lock-out
var LOCK_SECONDS = 300;   // lock-out time (5 minutes)
var MAX_MESSAGE = 120;    // longest message we keep

/** Students' game asks: "is it open?"  (GET ...?action=status) */
function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'status';
  if (action === 'status') return json_(statusObject_());
  return json_({ ok: false, error: 'Unknown action.' });
}

/** Teacher page sends: { action:'set', pin:'1234', state:'OPEN'|'CLOSED', message:'...' } */
function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Bad request.' });
  }
  if (body.action === 'status') return json_(statusObject_());
  if (body.action === 'set') return json_(setState_(body));
  return json_({ ok: false, error: 'Unknown action.' });
}

/** Reads the current switch. */
function statusObject_() {
  var props = PropertiesService.getScriptProperties();
  var state = props.getProperty('GAME_STATE') === 'OPEN' ? 'OPEN' : 'CLOSED';   // default = CLOSED
  return {
    ok: true,
    state: state,
    message: props.getProperty('GAME_MESSAGE') || '',
    updated: props.getProperty('UPDATED') || ''
  };
}

/** Changes the switch (needs the PIN). */
function setState_(b) {
  var props = PropertiesService.getScriptProperties();
  var cache = CacheService.getScriptCache();

  var tries = Number(cache.get('pinTries') || 0);
  if (tries >= MAX_TRIES) {
    return { ok: false, locked: true, error: 'Too many wrong PINs. Please wait 5 minutes and try again.' };
  }

  var pin = props.getProperty('TEACHER_PIN');
  if (!pin) {
    return { ok: false, error: 'The teacher PIN has not been set yet. Add TEACHER_PIN in Project Settings > Script properties.' };
  }
  if (!sameText_(String(b.pin || ''), String(pin))) {
    cache.put('pinTries', String(tries + 1), LOCK_SECONDS);
    return { ok: false, error: 'Wrong PIN.', triesLeft: MAX_TRIES - tries - 1 };
  }
  cache.remove('pinTries');

  var state = b.state === 'OPEN' ? 'OPEN' : 'CLOSED';
  var message = String(b.message || '').replace(/[<>]/g, '').substring(0, MAX_MESSAGE);

  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    props.setProperties({
      GAME_STATE: state,
      GAME_MESSAGE: message,
      UPDATED: new Date().toISOString()
    });
  } finally {
    lock.releaseLock();
  }
  return statusObject_();
}

/** Compares two texts without stopping at the first difference. */
function sameText_(a, b) {
  var diff = a.length ^ b.length;
  var n = Math.max(a.length, b.length);
  for (var i = 0; i < n; i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
