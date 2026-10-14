# Chameleon Arcade

A lightweight, responsive browser arcade featuring the original balloon game and six jungle-themed algorithm challenges. The chameleon tracks pointer movement; clicking in the hero sends its tongue to the selected point.

## Project files

- `index.html` — page structure, inline visuals, metadata, and the original game.
- `games.css` — styles for the six additional challenges.
- `games.js` — game logic and interactions for those challenges.

No build step or package installation is required.

## Run locally

From this folder, start a local static server:

```bash
python3 -m http.server 8000
```

Open <http://localhost:8000> in a browser. You can also use VS Code Live Server.

## Upload to GitHub

1. Create a repository on GitHub.
2. Upload `index.html`, `games.css`, `games.js`, `README.md`, and `.gitignore` to the repository root.
3. To host it with GitHub Pages, open the repository's **Settings → Pages**, choose **Deploy from a branch**, select the `main` branch and `/ (root)`, then save. GitHub will show the published URL there.

## Notes

- The site is static HTML, CSS, and JavaScript; it needs no server-side runtime.
- No private deployment claims, account credentials, or preview screenshots are included in this source package.
- The Privacy and Terms sections contain site-specific copy. Review them for your actual operator details, vendors, and jurisdiction before running advertising.
