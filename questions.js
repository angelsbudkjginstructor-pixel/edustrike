/* EduStrike - sample question bank (50 questions).
   Fields:  s = subject code, g = grade (1-7), d = difficulty (1 easy, 2 medium, 3 hard),
            q = question, o = four options, a = index of the right option (0-3),
            e = short explanation shown after a wrong answer.
   Stage 2 will let the teacher load questions from a Google Sheet instead. */
(function () {
  'use strict';
  const ES = (window.ES = window.ES || {});

  ES.QUESTIONS = [
    /* ---------- English ---------- */
    { s: 'en', g: 1, d: 1, q: 'Which word rhymes with "cat"?', o: ['dog', 'hat', 'sun', 'pen'], a: 1, e: '"Cat" and "hat" both end with the sound -at.' },
    { s: 'en', g: 1, d: 1, q: 'Which one is a colour?', o: ['table', 'blue', 'run', 'jump'], a: 1, e: 'Blue is a colour. Table is a thing, run and jump are actions.' },
    { s: 'en', g: 2, d: 1, q: 'The cat ___ on the mat.', o: ['sit', 'sits', 'sitting', 'sitted'], a: 1, e: 'With he / she / it in the present, we add -s: "sits".' },
    { s: 'en', g: 2, d: 2, q: 'What is the opposite of "hot"?', o: ['cold', 'warm', 'big', 'fast'], a: 0, e: 'Hot and cold are opposites.' },
    { s: 'en', g: 3, d: 2, q: 'Which word is a noun?', o: ['quickly', 'happy', 'teacher', 'run'], a: 2, e: 'A noun is the name of a person, place or thing. "Teacher" is a person.' },
    { s: 'en', g: 3, d: 2, q: 'Which sentence is written correctly?', o: ['i like apples.', 'I like apples.', 'I like Apples', 'i Like apples'], a: 1, e: 'A sentence starts with a capital letter, "I" is always a capital, and it ends with a full stop.' },
    { s: 'en', g: 4, d: 2, q: 'What is the plural of "child"?', o: ['childs', 'childes', 'children', 'childrens'], a: 2, e: '"Child" is an irregular noun. Its plural is "children".' },
    { s: 'en', g: 4, d: 2, q: 'Which word is a verb (an action word)?', o: ['blue', 'jump', 'table', 'happy'], a: 1, e: 'A verb tells us what someone does. We can "jump".' },
    { s: 'en', g: 5, d: 3, q: 'They ___ playing football yesterday.', o: ['was', 'is', 'were', 'are'], a: 2, e: 'Yesterday = past tense. With "they" we use "were".' },
    { s: 'en', g: 6, d: 3, q: 'What does the word "enormous" mean?', o: ['tiny', 'very big', 'very fast', 'very old'], a: 1, e: '"Enormous" means very, very big.' },

    /* ---------- Math ---------- */
    { s: 'ma', g: 1, d: 1, q: '3 + 4 = ?', o: ['6', '7', '8', '9'], a: 1, e: 'Start at 3 and count up 4 more: 4, 5, 6, 7.' },
    { s: 'ma', g: 1, d: 1, q: 'Which number is the biggest?', o: ['12', '21', '18', '9'], a: 1, e: '21 has 2 tens, the others have fewer tens or a smaller number of ones.' },
    { s: 'ma', g: 2, d: 1, q: '15 - 8 = ?', o: ['6', '7', '8', '9'], a: 1, e: 'Count back 8 from 15, or think: 8 + 7 = 15.' },
    { s: 'ma', g: 2, d: 2, q: '6 x 3 = ?', o: ['12', '15', '18', '21'], a: 2, e: '6 + 6 + 6 = 18.' },
    { s: 'ma', g: 3, d: 2, q: 'How many sides does a hexagon have?', o: ['5', '6', '7', '8'], a: 1, e: '"Hexa" means six. A hexagon has 6 sides.' },
    { s: 'ma', g: 3, d: 2, q: '48 / 6 = ?', o: ['6', '7', '8', '9'], a: 2, e: '6 x 8 = 48, so 48 / 6 = 8.' },
    { s: 'ma', g: 4, d: 2, q: 'What is 1/2 + 1/4?', o: ['2/6', '3/4', '1/6', '2/4'], a: 1, e: '1/2 is the same as 2/4. Then 2/4 + 1/4 = 3/4.' },
    { s: 'ma', g: 5, d: 3, q: 'What is 25% of 80?', o: ['15', '20', '25', '30'], a: 1, e: '25% is one quarter. 80 / 4 = 20.' },
    { s: 'ma', g: 6, d: 3, q: 'A square has sides of 7 cm. What is its perimeter?', o: ['14 cm', '21 cm', '28 cm', '49 cm'], a: 2, e: 'Perimeter = 4 x side = 4 x 7 = 28 cm. (49 would be the area.)' },
    { s: 'ma', g: 7, d: 3, q: 'Solve: 3x = 24. What is x?', o: ['6', '7', '8', '9'], a: 2, e: 'Divide both sides by 3: x = 24 / 3 = 8.' },

    /* ---------- Science ---------- */
    { s: 'sc', g: 1, d: 1, q: 'Which animal can fly?', o: ['fish', 'bird', 'cow', 'snake'], a: 1, e: 'Birds have wings and feathers, so most birds can fly.' },
    { s: 'sc', g: 1, d: 1, q: 'What do plants need to grow?', o: ['only candy', 'water and sunlight', 'only plastic', 'darkness only'], a: 1, e: 'Plants need water, sunlight and air to grow.' },
    { s: 'sc', g: 2, d: 1, q: 'How many legs does an insect have?', o: ['4', '6', '8', '10'], a: 1, e: 'All insects have 6 legs. (Spiders have 8, so they are not insects.)' },
    { s: 'sc', g: 2, d: 1, q: 'Which part of the body do we use to see?', o: ['ears', 'nose', 'eyes', 'hands'], a: 2, e: 'We see with our eyes.' },
    { s: 'sc', g: 3, d: 1, q: 'Which planet do we live on?', o: ['Mars', 'Earth', 'Venus', 'Jupiter'], a: 1, e: 'We live on planet Earth.' },
    { s: 'sc', g: 3, d: 2, q: 'At what temperature does water freeze?', o: ['0 °C', '10 °C', '50 °C', '100 °C'], a: 0, e: 'Water freezes into ice at 0 °C. It boils at 100 °C.' },
    { s: 'sc', g: 4, d: 2, q: 'Which gas do humans need to breathe in to stay alive?', o: ['carbon dioxide', 'nitrogen', 'oxygen', 'helium'], a: 2, e: 'Our bodies use oxygen. We breathe out carbon dioxide.' },
    { s: 'sc', g: 5, d: 2, q: 'Which part of a plant makes food using sunlight?', o: ['roots', 'leaves', 'stem', 'seeds'], a: 1, e: 'Leaves do photosynthesis: they use sunlight, water and air to make food.' },
    { s: 'sc', g: 6, d: 2, q: 'What is it called when liquid water turns into water vapour?', o: ['condensation', 'freezing', 'evaporation', 'melting'], a: 2, e: 'Evaporation = liquid to gas. Condensation is the opposite: gas to liquid.' },
    { s: 'sc', g: 7, d: 3, q: 'What is the centre of an atom called?', o: ['nucleus', 'cell', 'orbit', 'shell'], a: 0, e: 'The nucleus is the centre of the atom. It holds the protons and neutrons.' },

    /* ---------- Geography ---------- */
    { s: 'ge', g: 1, d: 1, q: 'What is the capital city of Malaysia?', o: ['Johor Bahru', 'Kuala Lumpur', 'Penang', 'Kuching'], a: 1, e: 'Kuala Lumpur is the capital city of Malaysia.' },
    { s: 'ge', g: 2, d: 1, q: 'In which direction does the sun rise?', o: ['North', 'South', 'East', 'West'], a: 2, e: 'The sun rises in the East and sets in the West.' },
    { s: 'ge', g: 3, d: 1, q: 'How many continents are there?', o: ['5', '6', '7', '8'], a: 2, e: 'There are 7 continents: Asia, Africa, North America, South America, Antarctica, Europe and Australia/Oceania.' },
    { s: 'ge', g: 3, d: 2, q: 'Which is the highest mountain in Malaysia?', o: ['Mount Kinabalu', 'Mount Tahan', 'Mount Ophir', 'Mount Jerai'], a: 0, e: 'Mount Kinabalu in Sabah is about 4,095 metres high.' },
    { s: 'ge', g: 4, d: 2, q: 'Which is the longest river in Malaysia?', o: ['Sungai Rajang', 'Sungai Pahang', 'Sungai Perak', 'Sungai Kelantan'], a: 0, e: 'Sungai Rajang in Sarawak is the longest. Sungai Pahang is the longest in Peninsular Malaysia.' },
    { s: 'ge', g: 4, d: 2, q: 'Which country is directly north of Peninsular Malaysia?', o: ['Indonesia', 'Thailand', 'Philippines', 'Singapore'], a: 1, e: 'Thailand is north of Peninsular Malaysia. Singapore is to the south.' },
    { s: 'ge', g: 5, d: 2, q: 'Which is the largest ocean on Earth?', o: ['Pacific Ocean', 'Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], a: 0, e: 'The Pacific Ocean is the biggest and deepest ocean.' },
    { s: 'ge', g: 5, d: 2, q: 'Which imaginary line divides the Earth into the Northern and Southern Hemispheres?', o: ['Equator', 'Prime Meridian', 'Tropic of Cancer', 'Date Line'], a: 0, e: 'The Equator (0° latitude) splits the Earth into North and South.' },
    { s: 'ge', g: 6, d: 2, q: 'How many states does Malaysia have?', o: ['11', '12', '13', '14'], a: 2, e: 'Malaysia has 13 states and 3 Federal Territories.' },
    { s: 'ge', g: 6, d: 3, q: 'Which is the largest country in the world by area?', o: ['Canada', 'China', 'Russia', 'USA'], a: 2, e: 'Russia is the biggest country by area.' },

    /* ---------- Bahasa Melayu ---------- */
    { s: 'bm', g: 1, d: 1, q: 'Apakah warna langit pada siang hari yang cerah?', o: ['Merah', 'Biru', 'Hitam', 'Hijau'], a: 1, e: 'Langit yang cerah berwarna biru. (The clear sky is blue.)' },
    { s: 'bm', g: 1, d: 1, q: 'Huruf pertama bagi perkataan "ayam" ialah…', o: ['y', 'a', 'm', 'b'], a: 1, e: 'a-y-a-m. Huruf pertama ialah "a".' },
    { s: 'bm', g: 2, d: 1, q: 'Lawan bagi perkataan "besar" ialah…', o: ['tinggi', 'panjang', 'kecil', 'luas'], a: 2, e: 'Besar >< kecil. (Big >< small.)' },
    { s: 'bm', g: 2, d: 2, q: 'Berapakah suku kata bagi perkataan "buku"?', o: ['1', '2', '3', '4'], a: 1, e: 'bu-ku = 2 suku kata.' },
    { s: 'bm', g: 3, d: 2, q: 'Yang manakah kata nama?', o: ['berlari', 'cantik', 'meja', 'laju'], a: 2, e: 'Kata nama ialah nama orang, benda atau tempat. "Meja" ialah benda.' },
    { s: 'bm', g: 3, d: 2, q: 'Pilih ayat yang betul.', o: ['Sedang makan Ali nasi.', 'Ali sedang makan nasi.', 'Makan nasi sedang Ali.', 'Nasi Ali makan sedang.'], a: 1, e: 'Susunan ayat yang betul: Ali (siapa) + sedang makan (buat apa) + nasi (apa).' },
    { s: 'bm', g: 4, d: 2, q: 'Antonim bagi perkataan "rajin" ialah…', o: ['pandai', 'malas', 'kuat', 'cepat'], a: 1, e: 'Rajin >< malas.' },
    { s: 'bm', g: 5, d: 2, q: 'Sinonim (maksud sama) bagi perkataan "cantik" ialah…', o: ['hodoh', 'besar', 'indah', 'kecil'], a: 2, e: 'Cantik dan indah mempunyai maksud yang hampir sama.' },
    { s: 'bm', g: 6, d: 3, q: 'Peribahasa "Sedikit demi sedikit, lama-lama menjadi bukit" bermaksud…', o: ['Bukit itu sangat tinggi', 'Usaha yang sedikit tetapi berterusan akan memberi hasil yang banyak', 'Jangan mendaki bukit', 'Bukit itu cantik'], a: 1, e: 'Kerja yang dibuat sedikit demi sedikit, jika berterusan, akhirnya menjadi banyak.' },
    { s: 'bm', g: 7, d: 3, q: 'Pilih ejaan yang betul.', o: ['jadwal', 'jadual', 'jaddual', 'jadoal'], a: 1, e: 'Ejaan baku dalam Bahasa Melayu ialah "jadual".' }
  ];

  /* Safety check at start-up: drop any malformed question instead of crashing in the middle of a game. */
  ES.QUESTIONS = ES.QUESTIONS.filter(function (x) {
    return x && ES.SUBJECTS[x.s] && x.q && Array.isArray(x.o) && x.o.length === 4 &&
           x.a >= 0 && x.a < 4 && new Set(x.o).size === 4;
  });
})();
