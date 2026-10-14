# Chameleon Arcade

**Play smart. Pop balloons. Take on the algorithm grove.** Chameleon Arcade is a responsive, no-install browser arcade built with plain HTML, CSS, and JavaScript.

> **[Play the live preview](https://chameleon-arcade-suite-20261014.delicious-haddock.workers.dev)** — this is the current temporary deployment URL and may change.

## What’s inside

Start with a quick misère-Nim balloon game, then try six algorithm-driven challenges:

- **Don’t Pop Last** — Pop 1–4 balloons per turn; the player forced to pop the final balloon loses. Play against a friend locally or the chameleon, with easy and hard AI options.
- **Hex: Cut the Canopy** — Connect opposite edges on an 11 × 11 Hex board. The opponent searches with minimax and alpha-beta pruning.
- **Network Saboteur** — Place firewalls on a 9 × 5 relay network while its defender finds a surviving route using constraint propagation and backtracking.
- **Evolutionary Maze Runner** — Tune a population and mutation rate as sensor-response genomes evolve to find the exit through changing gates.
- **Dynamic Labyrinth Architect** — Place a limited number of walls to slow an A* maze runner without sealing off the exit.
- **Cellular Outbreak Grid** — Compete as two factions in a 28 × 18 cellular automaton, where survival, energy, and nearby cells determine control.
- **Spore Cipher** — Crack a five-peg code in ten guesses. Repeated colors are allowed; an information-gain minimax hint can help.

The interface includes the rules and status for each game. Keyboard-accessible controls and reduced-motion support are included in the experience.

## Run locally

No build step, package installation, or backend is needed. From the repository directory, start a static server:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000> in your browser. Alternatively, use an editor’s static-site preview, such as VS Code Live Server.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | Page structure, inline visuals, balloon game, and game-suite markup |
| `games.css` | Styles for the six algorithm challenges |
| `games.js` | Challenge logic and interactions |
| `.gitignore` | Common local build, dependency, and environment-file exclusions |

## Deploy

This is a static site and can be hosted by any provider that serves the repository root. For GitHub Pages, open **Settings → Pages**, choose **Deploy from a branch**, select `main` and `/(root)`, then save. The current live preview above is hosted at a temporary `workers.dev` URL; it is separate from the source repository and is not a permanent hosting guarantee.

## Privacy and site copy

Gameplay runs in the browser; the site does not require an account. The page includes privacy and terms copy that may need to be tailored to the actual site operator, hosting provider, jurisdiction, and any services enabled before broader production use.
