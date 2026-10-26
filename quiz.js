/* EduStrike - question picker.
   - Only uses the subjects / grades the teacher ticked.
   - Questions come out in a shuffled "bag": none repeats until every question has been asked once.
   - The 4 answer choices are shuffled every time, so the right answer is not always in the same place.
   SAFETY: if the filters leave fewer than 4 questions, we quietly fall back to ALL questions
   instead of crashing or asking the same question again and again. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  /* Which questions match the settings? */
  ES.quizPool = function (s) {
    const lo = Math.min(s.gradeMin, s.gradeMax), hi = Math.max(s.gradeMin, s.gradeMax);
    // q.g = 0 means "any grade". A subject that is not in the player's saved list yet (a new one from the sheet) counts as ON.
    return ES.QUESTIONS.filter(function (q) { return s.subjects[q.s] !== false && (!q.g || (q.g >= lo && q.g <= hi)); });
  };

  /* topics = (class match) the subtopics the teacher ticked, like ['ma|Fractions', 'sc|Plants']. Empty / missing = no subtopic filter.
     The player's own grade range still applies; if that leaves fewer than 4 questions we use the ticked subtopics at every grade. */
  ES.createQuiz = function (settings, topics) {
    let list, usedFallback = false;
    if (topics && topics.length) {
      const want = {}; topics.forEach(function (k) { want[k] = 1; });
      const lo = Math.min(settings.gradeMin, settings.gradeMax), hi = Math.max(settings.gradeMin, settings.gradeMax);
      const all = ES.QUESTIONS.filter(function (q) { return want[q.s + '|' + (q.t || 'General')]; });
      list = all.filter(function (q) { return !q.g || (q.g >= lo && q.g <= hi); });
      if (list.length < 4) list = all;
    } else list = ES.quizPool(settings);
    if (list.length < 4) { list = ES.QUESTIONS.slice(); usedFallback = true; }
    let bag = [], last = null, pending = null;

    function prepare(q) {
      const order = shuffle([0, 1, 2, 3]);
      return { src: q, subject: q.s, grade: q.g, diff: q.d, text: q.q, exp: q.e,
               opts: order.map(function (i) { return q.o[i]; }),
               correct: order.indexOf(q.a) };
    }
    return {
      size: list.length, usedFallback: usedFallback,
      next: function () {
        if (pending) { const p = pending; pending = null; return prepare(p); }   // a cancelled question comes back (no re-rolling for easy ones)
        if (!bag.length) {
          bag = shuffle(list.slice());
          if (bag.length > 1 && bag[bag.length - 1] === last) { const t = bag[0]; bag[0] = bag[bag.length - 1]; bag[bag.length - 1] = t; }
        }
        last = bag.pop();
        return prepare(last);
      },
      giveBack: function (prepared) { pending = prepared.src; }
    };
  };
})();
