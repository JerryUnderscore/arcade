# arcade

Starter mini-arcade for browser games.

## What is included

- React + TypeScript + Vite scaffold
- Hub screen with game cards
- First playable game: `Neon Dodger`
- Second playable game: `Tetris`
- Third playable game: `Gem Miner`
- `Gem Miner` progression persists between sessions (money, sales, upgrades)
- `Gem Miner` has 3 profile slots (`A/B/C`) with per-profile saved progression
- Starter sprite pack included at `public/sprites/gem-miner` (replace files in-place to upgrade art)
- `Gem Miner` uses surface depots (`SELL`, `FUEL`, `RIG`) opened via `Space` or tap
- Dirt in `Gem Miner` is non-sellable and does not consume cargo space
- `Gem Miner` includes 12 sellable minerals (Coal through Void Crystal)
- `Gem Miner` has 5 drill-material tiers (`Dirt`, `Rock`, `Stone`, `Aegis Strata`, `Voidbed`)
- Rock is non-sellable/non-cargo; weak drills can still break it slowly with extra fuel burn
- `Stone`, `Aegis Strata`, and `Voidbed` require higher drill tiers to mine
- Upgrade parts (`Cargo`, `Drill`, `Fuel`, `Treads`) use 12 named tiers from `Basic` to `Void Crystal`
- Depot signboard sprites are included under `public/sprites/gem-miner/depots`
- Registry-driven game catalog (`src/games/registry.ts`) for easy expansion
- Shared systems:
  - score and persistent high score
  - sound toggle
  - pause / resume + restart
  - keyboard and touch controls

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open the local URL shown in the terminal.

## Build for production

```bash
npm run build
npm run preview
```

## Next games to add

- Time-trial racer
- Daily puzzle run
- Twin-stick arena
