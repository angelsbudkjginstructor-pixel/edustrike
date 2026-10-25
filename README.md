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
- `Code.gs` = the small Google Apps Script that keeps the switch. Safe by default: CLOSED until you turn it ON; wrong PIN 5 times locks the PIN for 5 minutes.
- In `config.js`, `ES.GATE.url` is empty at first, so the game is always open while you test. After setup, paste the Apps Script web app URL there.
- When the switch is OFF, students see a closed screen with your message and a running match stops (within about a minute). They come back in by themselves when you turn it ON.

## Coming next (not built yet)
Stage 2: load questions from a Google Sheet + simple results export · Stage 3: live multiplayer (teacher's browser as the game host) · Stage 4: dashboard / accounts only if really needed.

## Files
All files are in one flat folder: index.html, teacher.html, style.css, config/questions/quiz/world/bots/game/gate/audio/main/teacher .js, Code.gs (the Google Apps Script), and three.min.js (Three.js r160, MIT licence).
To change the sample questions, edit `js/questions.js`. To change bot strength or speed, edit `config.js`.
