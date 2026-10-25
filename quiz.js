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
    return ES.QUESTIONS.filter(function (q) { return s.subjects[q.s] && q.g >= lo && q.g <= hi; });
  };

  ES.createQuiz = function (settings) {
    let list = ES.quizPool(settings);
    let usedFallback = false;
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
