# EduStrike – Stage 1 (offline, vs bots)

A 3D team shooter where **answering questions = ammo**. Fictional laser blasters, no blood, no real weapons.
You (Blue Team, with friendly bots) play against Red Team bots. Enemy bots also have to "answer a question" (a ? bubble) when they run out of ammo.

## How to start
1. Unzip the folder.
2. Double-click **index.html** (use Google Chrome).
3. Press **PLAY**, then **CLICK TO START**.

## Controls
| Key | What it does |
|---|---|
| W A S D | move |
| Shift | run |
| Space | jump (you can hop onto the low brown crates) |
| Mouse | look and aim |
| Left click (or F) | fire |
| **R** | **answer a question to get ammo** |
| 1–4 or A–D | choose an answer (or click it) |
| Tab (hold) | scoreboard |
| Esc | pause |

If mouse-look does not work on a laptop, open **Graphics & Controls → Looking around** and choose *Arrow keys + hold right mouse button*.

## What is in Stage 1
- One compact low-poly map (60 × 60 m) with cover, a centre building, towers and low crates. Very light: about 47 draw calls and 4,600 triangles.
- Bots: Easy / Normal / Hard. They walk around walls, see only what is in front of them (no wall-hacks), and must answer questions to reload.
- Team Battle: first team to 10/15/20/30 tags, or most tags when time is up (3/5/8/10 minutes). 2v2 up to 6v6.
- Question-to-ammo: correct = +12 ammo (+3 bonus on a 3-answer streak); wrong = the right answer and a short explanation, plus +2 "nice try" ammo (settable to 0).
  Anti-farming: ammo cap of 30, a short cooldown between questions, cancelling brings the same question back, and no question repeats until all have been asked.
- 50 sample questions: English, Math, Science, Geography, Bahasa Melayu (10 each), labelled with grade 1–7 and difficulty. Teachers pick subjects and grade range.
- End screen: tags, accuracy, questions right per subject (colour-coded), and a "Let's review" list of the questions that were missed.
- Graphics: Low (default, fastest) / Medium / High (shadows). FPS counter on by default so we can see how it runs on your real laptops.
- Sounds are made by the browser (no audio files). Nothing is saved except your settings on that computer.

## Teacher ON/OFF switch (new)
- `teacher.html` = the teacher control page (secret PIN + big TURN ON / TURN OFF buttons + a message for students).
- `apps-script/Code.gs` = the small Google Apps Script that keeps the switch. Safe by default: CLOSED until you turn it ON; wrong PIN 5 times locks the PIN for 5 minutes.
- In `js/config.js`, `ES.GATE.url` is empty at first, so the game is always open while you test. After setup, paste the Apps Script web app URL there.
- When the switch is OFF, students see a closed screen with your message and a running match stops (within about a minute). They come back in by themselves when you turn it ON.

## Coming next (not built yet)
Stage 2: load questions from a Google Sheet + simple results export · Stage 3: live multiplayer (teacher's browser as the game host) · Stage 4: dashboard / accounts only if really needed.

## Files
`index.html`, `style.css`, `js/` (config, questions, quiz, world, bots, game, audio, main) and `js/vendor/three.min.js` (Three.js r160, MIT licence).
To change the sample questions, edit `js/questions.js`. To change bot strength or speed, edit `js/config.js`.

## Class match (Stage 3B)

The teacher's page (`teacher.html`) is the **referee**. Keep it open during the match.

1. Open `teacher.html`, turn the game ON, press **OPEN CLASS ROOM**. A 5-letter code and a link appear.
2. Students open the link (or press **JOIN CLASS GAME** and type the code), enter a name and pick Blue or Red.
3. The teacher can move anybody, mix the teams or lock them, then sets the match options and presses **START MATCH**.
4. Empty spots are filled with bots. Students click START on their own screen; the countdown begins when everybody is ready (or after 25 s).
5. At the end, everybody sees the class results. **Back to waiting room** lets you play again.

How it works (for developers): students connect to the teacher page with WebRTC (PeerJS free introduction service). `match.js` runs the bots, health, score and clock; `session.js`/`lobby.js` are the student side; `game.js` has a "net mode" that follows 15 snapshots per second from the referee. A student who leaves is replaced by a bot. While a student answers a question they take half damage.

## Graphics levels (Stage 3C)
Menu → Graphics has Low (default, smoothest), Medium, High and **✨ Fancy** (cartoon look: round characters with outlines,
flowers, trees, hills, clouds, glowing lasers). Fancy is never switched on by itself. If a computer cannot keep up (under
28 FPS for about 4 seconds) the game quietly switches to a lighter look and remembers Low for next time.
In a class match the teacher can choose **Graphics for everyone → Force Low** so every student laptop runs the light version.

## Maps (Stage 4A)
The teacher picks the map in the class-match settings (solo players pick it in Match → Map).
- **🌳 Classic Park** – the original open arena.
- **🏙️ City Rooftops** – five buildings with stairs up to flat roofs, low walls on the roofs for cover. Bots stay on the ground; players fight from above.
- **🏰 Castle** – a big stone keep in the middle (stairs from both sides), four towers with stairs, battlements on the roofs, stone walls with a gate.
- **🌴 Jungle Ruins** – a stepped old temple in the middle (stairs up to a golden idol), mossy halls with stairs and roofs, thick trees.
- **🚀 Space Station** – night sky with stars, dark metal decks, a reactor deck in the middle with stairs, glowing rails.
Also new: **Player names → Show everyone's name** (teacher setting), a dramatic **scream** when a player is tagged out (Graphics & Controls → on/off).

## Your own sounds (Stage 4B)
Real recorded sounds live next to index.html as `sfx-*.mp3`. The list is in `js/config.js` → `ES.SOUND_FILES`.
To change a sound: upload a new file with the SAME name (for example `sfx-scream-3.mp3`). To add one more scream, upload `sfx-scream-9.mp3` and add its name to the scream list.
If a file is missing the game uses its built-in sound. Only use sounds you are allowed to share (this site is public).
Music: `music-thriller.mp3` plays during matches (`ES.MUSIC_FILES` in config.js; delete the file to go back to the built-in music).
Credits: pistol shot by MrFriends and Sci-Fi Thriller by Leberch (pixabay.com); screams by creativeheroes, thanvannispen (CC BY 3.0) and JohnsonBrandEditing (CC0); clicks by Michel Baradari, apollo-music.de (CC BY 3.0).


## Bonus weapons, announcer and map music (Stage 4E)
- **Bonus weapons**: walk over a glowing gold crate (they are RARE: a pair appears about 40 s after the start, stays ~28 s, then the next pair comes about a minute later - numbers in `ES.CRATE`) or answer **3 questions right in a row**. You get a random one:
  ⚡ Rapid Blaster (fast, weak) · 💥 Scatter Blaster (shotgun, close range) · 🎯 Sniper Laser (one hit tags anyone) · 🚀 Rocket Blast (big explosion hurts everyone nearby).
  Each has its own number of shots and time limit (about 25–30 s), its own sound and laser colour. You lose it when tagged. Numbers are in `js/config.js` → `ES.WEAPONS`.
  In a class match the teacher's page decides who gets what and checks every shot, so nobody can cheat.
- **Announcer**: a deep computer voice says "First blood!", "Double kill!", "One minute left!", "Victory!" (Graphics & Controls → Announcer voice). It uses the browser's own voice, no files.
- **Music for each map**: every map plays the match song at a different speed/pitch. To give a map its own song, upload an mp3 and write it in `js/config.js` → `ES.MUSIC_FILES.byMap`, e.g. `space: 'music-space.mp3'`.

Stage 4F: weapon sounds (`sfx-rapid/scatter/sniper/rocket/pickup.mp3`, 1-16 KB each) and songs for City Rooftops, Jungle Ruins and Space Station (`music-rooftops/jungle/space.mp3`, ~180 KB each, 30 s seamless loops) were supplied by the teacher and shrunk for the game. Castle uses the thriller song a little slower. Check the licence of every file you add (this site is public).

## Stage 5A - questions from a Google Sheet

Sheet: "EduStrike Questions" (in the instructor Google Drive). Columns, row 1 = headings:
Subject, Subtopic, Grade, Difficulty, Question, A, B, C, D, Correct, Explanation

- Correct = A, B, C or D. Grade blank = any grade. Subtopic blank = "General". Difficulty = Easy / Medium / Hard.
- Any new Subject name (e.g. Sejarah, Social Studies) appears in the game automatically.
- Each row needs a question and 4 different choices. Bad rows are skipped and listed on the teacher page.
- Setup: File > Share > Publish to web > choose the Questions tab and "Comma-separated values (.csv)" > Publish > copy the link into `ES.QUESTION_SHEET.url` in `js/config.js`. Changes reach the game a few minutes after you edit the sheet.
- If the sheet cannot be reached, the game uses the last saved copy, then the 50 built-in questions.
- Teacher page > "Questions" box: tick the subtopics for the class match.

## Stage 5B - four graphics levels

Students choose their own level in Settings > Graphics & Controls (the default is Low). The teacher can force one level for everybody on the teacher page ("Graphics for everyone").

- **Low** - fastest, for Chromebooks and old laptops.
- **Medium** - full-size picture.
- **High** - real sun shadows, smooth edges, realistic soldiers and rifle, concrete/wood surface detail, calmer natural colours, sky and clouds.
- **Ultra** - High plus very sharp picture, soft shadows (bigger map), glowing shots and hit flashes, more sparks, sun glow and a soft dark edge on the screen.

Nothing extra is downloaded: the surface detail, ground painting and soldiers are all made by code (no image or model files), so the site stays about the same size.
If a computer is too slow, the game steps down ONE level at a time (Ultra > High > Medium > Low) with a small message, and remembers that level for next time.
An old saved "Fancy" setting is treated as Ultra.
