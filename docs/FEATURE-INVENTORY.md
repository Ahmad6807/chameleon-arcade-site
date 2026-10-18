# Chameleon Arcade feature inventory

Inventory reflects the original `/workspace/chameleon-arcade-backup/index.html` and `games.js` as baseline, checked against the current `index.html`, `games.js`, and `app.js`. It distinguishes interactive client behavior from server-backed guest persistence; ordinary transient play state is not implicitly sent to the backend.

## Routes and navigation

| Route/anchor | Purpose | Client behavior | Persistence requirement |
|---|---|---|---|
| `/` | Arcade landing page | Hero actions, in-page navigation, responsive navigation, reduced-motion handling | None |
| `#game` | Pop the Balloon | Start settings and active round; choose local/AI and AI difficulty; range selects initial count; click/quick-select balloons; pop, hint, reset, return to setup; game-over dialog actions | Save/restore/delete the active round through guest save API; no account |
| `#canopy-trials` | Six algorithm challenges | Accessible tabs select Hex, Network Saboteur, Maze Runner, Labyrinth, Outbreak, or Spore Cipher; arrows/Home/End navigate tabs | Each challenge supports snapshot/restore/delete; selected tab is ephemeral |
| `#how-to-play` | Rules/instructions | Static explanatory content and navigation | None |
| `#about` | Arcade description | Static text | None |
| `#privacy` | Privacy notice | Explains browser/guest-server storage and limitations | None |
| `#terms` | Practice terms | Static text and footer navigation | None |
| `#top` | Hero artwork | Pointer/keyboard chameleon tongue interaction, particles and motion | Transient animation only |
| `#progress` | Guest saves and practice history | Choose game, save, resume, delete selected save, request delete-all confirmation, paginate history, refresh/retry, retry queued results | Browser-scoped private server saves/history/preferences; no signup or cross-device sync |

## Game controls and client-side state

| Game | Controls and expected behavior | Snapshot concerns | Backend interaction |
|---|---|---|---|
| Balloon Pop | Mode buttons, difficulty select, count range, start; balloon selection and quick-select; Pop, Hint, Reset, setup return; game-over close/play-again | Remaining balloon IDs, prior pops, active player/mode/difficulty/count; animation timers are transient and stale callbacks must not mutate a reset/restored round | Save checkpoint with `PUT /api/saves/balloons`; restore with `GET`; result event on completed round |
| Hex | Opponent mode, AI depth, board-cell move, Undo/Redo, Reset | Board/player/mode/result, history/redo and depth; reject malformed snapshots; AI busy is not saveable | Snapshot save; `arcade:result` on win/loss/completed |
| Network Saboteur | Select relay, Install firewall, Reset; route recalculates and invalid firewall is rejected | Blocked relay set must round-trip as a JSON array; selected node, route, turn/critical counters and log | Snapshot save; result event when game ends |
| Evolutionary Maze Runner | Population, mutation and speed ranges; Evolve/Pause; New population | Genome population and history; arrays remain arrays after JSON round-trip, restore pauses animation | Snapshot save; result event when solved/finished |
| Dynamic Labyrinth Architect | Wall/slow/erase tool, A* debug checkbox, board-cell placement, Send runner, Reset | Tile Map encoded as entries, runner/turn/resources; route-sealing walls rejected; slow tiles are valid placements | Snapshot save; result event at terminal outcome |
| Cellular Outbreak | Canvas pointer seeding; keyboard arrows/Enter/Space seeding; Start evolution, Run/Pause, Step, Reset | Typed cell/energy arrays serialized as JSON arrays; restore must preserve terminal state and stop timers | Snapshot save; result event at terminal generation |
| Spore Cipher | Five color selectors, Lock in guess, Minimax hint, New secret code | Secret, attempts/feedback and terminal state; generated hint and possibility count recompute | Snapshot save; result event when solved/lost |

## Guest persistence contract

| Request | UI action | Expected outcome |
|---|---|---|
| `GET /api/session` | Initial load / refresh | Obtain CSRF token and preferences; unavailable backend leaves practice usable and reports a warning |
| `GET /api/saves`, `GET /api/history?limit=…&offset=…` | Initial load / refresh / pagination | Render saved games and page-specific history; errors must not be represented as success |
| `PUT /api/saves/:game` with `{state}` | Save progress | Requires registered snapshot adapter and a CSRF-protected write; success only after affirmative server response |
| `GET /api/saves/:game` | Resume saved game | Activate corresponding game and restore validated snapshot; no success claim on failure |
| `DELETE /api/saves/:game` | Delete selected save | Remove only selected game save and refresh listing |
| `DELETE /api/data` | Confirm delete all | Remove guest saves/history and establish a fresh guest session |
| `POST /api/history` | `arcade:result` event | Queue on failure, offer retry; result history is self-reported practice, not verified competitive record |

## Cross-cutting behavior and boundaries

- Game mechanics, tabs, keyboard controls, canvas rendering, hints, animations, settings and round state are client-side. Canvas is a rendering surface, not backend state.
- Save state is explicitly requested by the user; transient hover/focus, open dialogs, live timers and animation frames are not persistence requirements.
- Game completion dispatches `arcade:result`; the app validates known game/outcome values before attempting history persistence.
- Failures, timeouts, missing adapters, invalid snapshots and unavailable service must not produce false success. Balloon rounds continue offline.
- Guest data is private to the current browser/device. No identity, account, sync, leaderboard, or server verification is implied.

## Existing device-local controls

Sound toggle retains its local fallback and synchronizes the mute preference through `PATCH /api/preferences`. Existing Balloon Pop lifetime totals remain browser-local display preferences/statistics; they are not a global scoreboard or a backend-verified record. Fresh completed rounds additionally create guest-scoped practice history. Browser-local data and server guest records are deliberately distinguished in the privacy notice. Hero tongue interactions, balloon animation, hints, game-over dialog, contact/navigation links and reduced-motion behavior remain client-side.
