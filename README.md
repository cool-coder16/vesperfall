# Vesperfall

A dark-fantasy deck-building card game in the browser. The sun was devoured at the Vesperfall; in the realm of Aurenne the **Dawnvigil** holds the last emberhearths against the **Umbral Court**. Everything (world, cards, art, music) is original: illustrations are procedural SVG, audio is synthesized with the Web Audio API.

- Live: https://cool-coder16.github.io/vesperfall/
- Repo: https://github.com/cool-coder16/vesperfall

## Run locally
```bash
npm install && npm run dev          # http://localhost:5173/vesperfall/
npm run test:engine                 # engine, cards, bot ladder
npm run test:rules                  # security rules + full 2-client online match on the Firebase emulators (needs Java)
npm run bots:ladder                 # win-rate matrix between bot levels
```
Firebase web config lives in **`src/firebase/config.ts`** (the only place). Set `VITE_USE_EMULATORS=1` to point the app at the emulators.

## Rules
30 health, 30-card decks (max 2 copies, 1 per legendary, one faction + neutrals). Essence starts at 1, grows by 1 per turn to 10, refills each turn. Turn: main phase → declare attackers → defender assigns blockers → damage (simultaneous, Quick first) → second main → end. Attacking exhausts (no blocking) unless Steadfast. Oath (hero power, 2 essence, once per turn): Dawn heals 2, Umbral deals 1, Unsworn draws. Keywords: Swift, Ward, Piercing, Winged, Farsight, Venom, Radiant, Quick, Dread, Steadfast, Hollow, Shroud, Relentless (explained in-game under Codex).

**Factions.** Dawnvigil: wards, healing, Rally. Umbral Court: Wither (permanent -X/-X), sacrifice, Husks, steal. Unaligned: mercenaries and beasts usable anywhere. 88 collectible cards + tokens.

**Card levels.** 1–7 per card; ~+10% stats per level, scaling spell amounts at 4 and 7, level 7 "Ascendant" gets +1 and an animated foil frame. Frames: common/rare/epic/legendary; trims: plain → bronze → silver → gold → ascendant. Upgrades cost duplicate copies + cinders (`src/engine/levels.ts`).

**Modes.** Campaign "The Long Dusk": 12 bots (`src/ai/bots.ts`), difficulty 1–12 via search width/depth, attack-subset search with block prediction, noise and mistake rate (`src/ai/bot.ts`). Bots only see `viewFor(state, player)` (opponent hand/decks masked). Online: matchmaking queue or 6-letter invite codes, 90 s turn timer, disconnect claim after 45 s, reconnect from the log, post-match summary.

## Architecture
Vite + Preact + TypeScript, hash routing (works under the `/vesperfall/` Pages subpath; `404.html` bounces deep links).

- **Firestore** `users/{uid}` — one document per player (profile, collection, decks, currency, campaign, settings) so loading a player is one read; `users/{uid}/matches` history; `usernames/{name}` uniqueness. Chosen for the document model and rules expressiveness (`duration`, `request.time`).
- **Realtime Database** — matchmaking `queue/`, `invites/`, and `matches/{id}`. Chosen for presence/`onDisconnect`, cheap small writes, and no per-write quota (only bandwidth).

**Sync model.** Both clients run the same deterministic engine (`src/engine/engine.ts`). Actions are batched per segment (main+attack / blocks / main2+end) and committed as **one write** with the resulting state hash; the opponent replays and verifies. Rules enforce that only the player named in `next` may append, `seq` increments by one, log entries are immutable, results are written once, and finished matches can be deleted (both players ack → node removed). No polling; a single listener per match. A typical match is ~40 small writes.

**Hidden information.** Each player commits `sha256(secret)`; their deck order is `shuffle(deck, hash(secret + opponentSalt))`, so nobody can pick their shuffle and the opponent cannot compute your draws. Instance ids are positional, so hidden cards line up across clients; plays carry a reveal. At the end secrets are revealed and the entire log is replayed with full information; any illegal play or hash mismatch marks the match **disputed** (no rating change).

**Limits (be aware).** No server: a player can peek at their *own* future draws; a client can claim a timeout win early; both clients write their own rating/rewards. Rules bound rewards (≤1500 cinders, ≤5 packs per write, one grant per 45 s, daily once per 20 h, rating ±50) but cannot verify match outcomes or pack contents. Treat ratings as casual/soft-ranked; campaign progress and collections are per-player and harmless to cheat.

## What was set up
- GitHub: repo `cool-coder16/vesperfall`, Pages served from GitHub Actions (`.github/workflows/deploy.yml`).
- Firebase: **not yet created** — see "Remaining".

## Remaining / needs your action
1. Create a Firebase project (Spark), register a web app, paste the config into `src/firebase/config.ts`, enable Email/Password + Google auth, create Firestore and Realtime Database, deploy `firestore.rules` and `database.rules.json` (`npx firebase deploy --only firestore:rules,database`), and add `cool-coder16.github.io` to Authentication → Authorized domains. Until then the live site runs the tutorial and bot matches without accounts.
2. Live verification against the real project (sign-up, deck save, bot and online match) after step 1.
