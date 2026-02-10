import type { TileType } from "./types";

export const GEM_MINER_SPRITE_PATHS = {
  dirtTile: "/sprites/gem-miner/tiles/dirt.svg",
  rockTile: "/sprites/gem-miner/tiles/rock.svg",
  coalTile: "/sprites/gem-miner/tiles/coal.svg",
  copperTile: "/sprites/gem-miner/tiles/copper.svg",
  silverTile: "/sprites/gem-miner/tiles/silver.svg",
  goldTile: "/sprites/gem-miner/tiles/gold.svg",
  rubyTile: "/sprites/gem-miner/tiles/ruby.svg",
  robotRight: "/sprites/gem-miner/robot/robot-right.svg",
  robotLeft: "/sprites/gem-miner/robot/robot-left.svg",
  drillRight: "/sprites/gem-miner/robot/drill-right.svg",
  drillLeft: "/sprites/gem-miner/robot/drill-left.svg",
  depotSell: "/sprites/gem-miner/depots/sell.svg",
  depotFuel: "/sprites/gem-miner/depots/fuel.svg",
  depotRig: "/sprites/gem-miner/depots/rig.svg",
  sparkle: "/sprites/gem-miner/fx/sparkle.svg",
} as const;

export type GemMinerSpriteId = keyof typeof GEM_MINER_SPRITE_PATHS;

export type GemMinerSprites = Partial<Record<GemMinerSpriteId, HTMLImageElement>>;

export const TILE_SPRITE_IDS: Record<Exclude<TileType, "empty">, GemMinerSpriteId> = {
  dirt: "dirtTile",
  rock: "rockTile",
  coal: "coalTile",
  copper: "copperTile",
  silver: "silverTile",
  gold: "goldTile",
  ruby: "rubyTile",
};

export const CORE_SPRITES: readonly GemMinerSpriteId[] = [
  "dirtTile",
  "rockTile",
  "coalTile",
  "copperTile",
  "silverTile",
  "goldTile",
  "rubyTile",
  "robotRight",
  "robotLeft",
];

export const DEPOT_SPRITE_IDS: Record<
  "sell" | "fuel" | "upgrade",
  GemMinerSpriteId
> = {
  sell: "depotSell",
  fuel: "depotFuel",
  upgrade: "depotRig",
};

const loadImage = (path: string): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image: ${path}`));
    image.src = path;
  });

export const loadGemMinerSprites = async (): Promise<GemMinerSprites> => {
  const entries = Object.entries(GEM_MINER_SPRITE_PATHS) as [GemMinerSpriteId, string][];
  const loaded: GemMinerSprites = {};

  await Promise.all(
    entries.map(async ([id, path]) => {
      try {
        loaded[id] = await loadImage(path);
      } catch {
        // Keep rendering with procedural fallback when an art file is missing.
      }
    }),
  );

  return loaded;
};
