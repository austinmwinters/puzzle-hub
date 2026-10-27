# Puzzle Hub

Daily puzzles with no ads, accounts, trackers, or network calls. Everything runs in the browser, and stats live in that browser's local storage.

## Games

| Game | Daily | Practice |
| --- | --- | --- |
| Wordle | Same word for everyone each day | Unlimited random words |
| Betweenle | Same word each day, 14 guesses | Unlimited |
| Pyragrams | 15-word pyramid, 4 checks, one valid arrangement | Unlimited |
| Pyraphemes | 15 word fragments, 4 checks, one valid arrangement | Unlimited |
| Pyrithmetic | 7 numbers + 3 operators, 3 checks, one solution | Unlimited |
| Sudoku | Medium, unique solution | Easy / Medium / Hard |
| Nonogram | 10×10, solvable line by line | 5×5 / 10×10 / 15×15 |
| Minesweeper | 16×16, 40 mines, no guessing needed | Easy / Medium / Hard, first click safe |

Daily puzzles are generated from the date, so there's no server and no puzzle files to update.

## Layout

```
index.html          hub: today's progress and streaks
css/style.css       shared styles (light + dark)
js/common.js        dates, seeded RNG, storage, stats, header, modals
js/wordgame.js      word-game helpers (answer choice, keyboard)
js/pyramid.js       pyramid-link puzzle generator (Pyragrams, Pyraphemes)
js/pyragame.js      shared pyramid game engine (layout, swaps, checks, saving)
js/phrases.js       two-word phrase list for Pyragrams — add lines to grow it
js/fragments.js     generated fragment pairs — rebuild with tools/build_fragments.py
css/pyra.css        styles for the pyramid games
js/words.js         generated word lists — rebuild with tools/build_words.py
games/*.html        one self-contained page per game
tools/answers.txt   curated answer words (edit, then rebuild)
tools/fragments.txt curated word splits for Pyraphemes (edit, then rebuild)
```

To add or remove answer words, edit `tools/answers.txt` and run:

```bash
python3 tools/build_words.py
```

## Run locally

```bash
python3 -m http.server 8765
```

Then open http://localhost:8765.

## Deploy for free (GitHub Pages)

1. Create an empty repository on GitHub, e.g. `puzzle-hub`.
2. From this folder:
   ```bash
   git init && git add . && git commit -m "Puzzle Hub"
   git branch -M main
   git remote add origin https://github.com/<you>/puzzle-hub.git
   git push -u origin main
   ```
3. On GitHub, go to **Settings → Pages**, set **Source** to `main` / root, and save.
4. The site will be live at `https://<you>.github.io/puzzle-hub/`. Add it to your phone's home screen.

Cloudflare Pages or Netlify also work: drag and drop this folder, with no build step.

## Adding a game

Copy an existing page in `games/`, add an entry to `GAMES` in `js/common.js`, and call `PZ.recordDaily(id, date, won, score)` when a daily puzzle finishes.
