import type { ComponentType } from "react";
import { GemMiner } from "./gem-miner/GemMiner";
import { NeonDodger } from "./neon-dodger/NeonDodger";
import { Tetris } from "./tetris/Tetris";
import type { GameProps } from "./types";

export type GameId = "neon-dodger" | "tetris" | "gem-miner";

export type GameDefinition = {
  id: GameId;
  label: string;
  title: string;
  description: string;
  ctaLabel: string;
  highScoreKey: string;
  component: ComponentType<GameProps>;
};

export const GAME_DEFINITIONS: readonly GameDefinition[] = [
  {
    id: "neon-dodger",
    label: "Game 01",
    title: "Neon Dodger",
    description: "Survive the falling hazard field. Controls: arrows/A-D + touch.",
    ctaLabel: "Play Neon Dodger",
    highScoreKey: "arcade:neon-dodger:high-score",
    component: NeonDodger,
  },
  {
    id: "tetris",
    label: "Game 02",
    title: "Tetris",
    description:
      "Stack pieces, clear lines, and survive the rising speed. Controls: arrows + Z/X + space.",
    ctaLabel: "Play Tetris",
    highScoreKey: "arcade:tetris:high-score",
    component: Tetris,
  },
  {
    id: "gem-miner",
    label: "Game 03",
    title: "Gem Miner",
    description:
      "Pilot a mining bot underground, sell your haul, and upgrade your rig for deeper runs.",
    ctaLabel: "Play Gem Miner",
    highScoreKey: "arcade:gem-miner:high-score",
    component: GemMiner,
  },
] as const;

export const GAME_BY_ID: Record<GameId, GameDefinition> = GAME_DEFINITIONS.reduce(
  (accumulator, game) => {
    accumulator[game.id] = game;
    return accumulator;
  },
  {} as Record<GameId, GameDefinition>,
);
