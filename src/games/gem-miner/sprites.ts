import type { TileType } from "./types";

type SpritePathEntry = string | readonly string[];
export type GemMinerSprite = HTMLImageElement | HTMLCanvasElement;

export const GEM_MINER_SPRITE_PATHS = {
  dirtTile: [
    "/sprites/gem-miner/tiles/dirt-1.png",
    "/sprites/gem-miner/tiles/dirt1.png",
    "/sprites/gem-miner/tiles/dirt_1.png",
    "/sprites/gem-miner/tiles/dirt.svg",
  ],
  dirtTile2: [
    "/sprites/gem-miner/tiles/dirt-2.png",
    "/sprites/gem-miner/tiles/dirt2.png",
    "/sprites/gem-miner/tiles/dirt_2.png",
  ],
  dirtTile3: [
    "/sprites/gem-miner/tiles/dirt-3.png",
    "/sprites/gem-miner/tiles/dirt3.png",
    "/sprites/gem-miner/tiles/dirt_3.png",
  ],
  dirtTile4: [
    "/sprites/gem-miner/tiles/dirt-4.png",
    "/sprites/gem-miner/tiles/dirt4.png",
    "/sprites/gem-miner/tiles/dirt_4.png",
  ],
  rockTile: "/sprites/gem-miner/tiles/rock.svg",
  stoneTile: "/sprites/gem-miner/tiles/stone.svg",
  aegisTile: "/sprites/gem-miner/tiles/aegis.svg",
  voidbedTile: "/sprites/gem-miner/tiles/voidbed.svg",
  coalTile: "/sprites/gem-miner/tiles/coal.svg",
  coalOverlay1: [
    "/sprites/gem-miner/tiles/coal1.png",
    "/sprites/gem-miner/tiles/coal-1.png",
    "/sprites/gem-miner/tiles/coal_1.png",
  ],
  coalOverlay2: [
    "/sprites/gem-miner/tiles/coal2.png",
    "/sprites/gem-miner/tiles/coal-2.png",
    "/sprites/gem-miner/tiles/coal_2.png",
  ],
  coalOverlay3: [
    "/sprites/gem-miner/tiles/coal3.png",
    "/sprites/gem-miner/tiles/coal-3.png",
    "/sprites/gem-miner/tiles/coal_3.png",
  ],
  copperTile: "/sprites/gem-miner/tiles/copper.svg",
  copperOverlay1: [
    "/sprites/gem-miner/tiles/copper1.png",
    "/sprites/gem-miner/tiles/copper-1.png",
    "/sprites/gem-miner/tiles/copper_1.png",
  ],
  copperOverlay2: [
    "/sprites/gem-miner/tiles/copper2.png",
    "/sprites/gem-miner/tiles/copper-2.png",
    "/sprites/gem-miner/tiles/copper_2.png",
  ],
  copperOverlay3: [
    "/sprites/gem-miner/tiles/copper3.png",
    "/sprites/gem-miner/tiles/copper-3.png",
    "/sprites/gem-miner/tiles/copper_3.png",
  ],
  silverTile: "/sprites/gem-miner/tiles/silver.svg",
  silverOverlay1: [
    "/sprites/gem-miner/tiles/silver1.png",
    "/sprites/gem-miner/tiles/silver-1.png",
    "/sprites/gem-miner/tiles/silver_1.png",
  ],
  silverOverlay2: [
    "/sprites/gem-miner/tiles/silver2.png",
    "/sprites/gem-miner/tiles/silver-2.png",
    "/sprites/gem-miner/tiles/silver_2.png",
  ],
  silverOverlay3: [
    "/sprites/gem-miner/tiles/silver3.png",
    "/sprites/gem-miner/tiles/silver-3.png",
    "/sprites/gem-miner/tiles/silver_3.png",
  ],
  goldTile: "/sprites/gem-miner/tiles/gold.svg",
  goldOverlay1: [
    "/sprites/gem-miner/tiles/gold1.png",
    "/sprites/gem-miner/tiles/gold-1.png",
    "/sprites/gem-miner/tiles/gold_1.png",
  ],
  goldOverlay2: [
    "/sprites/gem-miner/tiles/gold2.png",
    "/sprites/gem-miner/tiles/gold-2.png",
    "/sprites/gem-miner/tiles/gold_2.png",
  ],
  rubyTile: "/sprites/gem-miner/tiles/ruby.svg",
  platinumTile: "/sprites/gem-miner/tiles/platinum.svg",
  diamondTile: "/sprites/gem-miner/tiles/diamond.svg",
  iridiumTile: "/sprites/gem-miner/tiles/iridium.svg",
  aureliteTile: "/sprites/gem-miner/tiles/aurelite.svg",
  cryostoneTile: "/sprites/gem-miner/tiles/cryostone.svg",
  helioniteTile: "/sprites/gem-miner/tiles/helionite.svg",
  voidCrystalTile: "/sprites/gem-miner/tiles/void-crystal.svg",
  robotRight: "/sprites/gem-miner/robot/robot-right.svg",
  robotLeft: "/sprites/gem-miner/robot/robot-left.svg",
  drillRight: "/sprites/gem-miner/robot/drill-right.svg",
  drillLeft: "/sprites/gem-miner/robot/drill-left.svg",
  drillDown: "/sprites/gem-miner/robot/drill-down.svg",
  depotSell: "/sprites/gem-miner/depots/sell.svg",
  depotFuel: "/sprites/gem-miner/depots/fuel.svg",
  depotRig: "/sprites/gem-miner/depots/rig.svg",
  sparkle: "/sprites/gem-miner/fx/sparkle.svg",
} as const;

export type GemMinerSpriteId = keyof typeof GEM_MINER_SPRITE_PATHS;

export type GemMinerSprites = Partial<Record<GemMinerSpriteId, GemMinerSprite>>;

export const DIRT_TILE_VARIANT_IDS: readonly GemMinerSpriteId[] = [
  "dirtTile",
  "dirtTile2",
  "dirtTile3",
  "dirtTile4",
];

export type OverlayOreTileType = Extract<TileType, "coal" | "copper" | "silver" | "gold">;

export const ORE_OVERLAY_VARIANT_IDS: Record<
  OverlayOreTileType,
  readonly GemMinerSpriteId[]
> = {
  coal: ["coalOverlay1", "coalOverlay2", "coalOverlay3"],
  copper: ["copperOverlay1", "copperOverlay2", "copperOverlay3"],
  silver: ["silverOverlay1", "silverOverlay2", "silverOverlay3"],
  gold: ["goldOverlay1", "goldOverlay2"],
};
const ORE_OVERLAY_SPRITE_IDS = new Set<GemMinerSpriteId>(
  Object.values(ORE_OVERLAY_VARIANT_IDS).flat(),
);

export const TILE_SPRITE_IDS: Record<Exclude<TileType, "empty">, GemMinerSpriteId> = {
  dirt: "dirtTile",
  rock: "rockTile",
  stone: "stoneTile",
  aegis: "aegisTile",
  voidbed: "voidbedTile",
  coal: "coalTile",
  copper: "copperTile",
  silver: "silverTile",
  gold: "goldTile",
  ruby: "rubyTile",
  platinum: "platinumTile",
  diamond: "diamondTile",
  iridium: "iridiumTile",
  aurelite: "aureliteTile",
  cryostone: "cryostoneTile",
  helionite: "helioniteTile",
  voidCrystal: "voidCrystalTile",
};

export const CORE_SPRITES: readonly GemMinerSpriteId[] = [
  "dirtTile",
  "rockTile",
  "stoneTile",
  "aegisTile",
  "voidbedTile",
  "coalTile",
  "copperTile",
  "silverTile",
  "goldTile",
  "rubyTile",
  "platinumTile",
  "diamondTile",
  "iridiumTile",
  "aureliteTile",
  "cryostoneTile",
  "helioniteTile",
  "voidCrystalTile",
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

const loadImageFromCandidates = async (
  paths: readonly string[],
): Promise<HTMLImageElement> => {
  for (const path of paths) {
    try {
      return await loadImage(path);
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(`Failed to load image candidates: ${paths.join(", ")}`);
};

const keyOutWhiteBackground = (image: HTMLImageElement): HTMLCanvasElement => {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context || width <= 0 || height <= 0) {
    return canvas;
  }

  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height);
  const data = pixels.data;
  const readPixel = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return {
      r: data[index],
      g: data[index + 1],
      b: data[index + 2],
    };
  };
  const corners = [
    readPixel(0, 0),
    readPixel(Math.max(0, width - 1), 0),
    readPixel(0, Math.max(0, height - 1)),
    readPixel(Math.max(0, width - 1), Math.max(0, height - 1)),
  ];
  const matte = corners.reduce(
    (sum, corner) => ({
      r: sum.r + corner.r / corners.length,
      g: sum.g + corner.g / corners.length,
      b: sum.b + corner.b / corners.length,
    }),
    { r: 0, g: 0, b: 0 },
  );
  const matteBrightness = (matte.r + matte.g + matte.b) / 3;
  const hasBrightMatte = matteBrightness >= 176;

  for (let i = 0; i < data.length; i += 4) {
    const alpha = data[i + 3];
    if (alpha === 0) {
      continue;
    }

    const red = data[i];
    const green = data[i + 1];
    const blue = data[i + 2];
    const brightness = (red + green + blue) / 3;
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue);
    const matteDistance = Math.sqrt(
      (red - matte.r) * (red - matte.r) +
        (green - matte.g) * (green - matte.g) +
        (blue - matte.b) * (blue - matte.b),
    );

    if (hasBrightMatte) {
      if (matteDistance <= 40) {
        data[i + 3] = 0;
        continue;
      }

      if (matteDistance <= 78) {
        const fade = Math.max(0, Math.min(1, (matteDistance - 40) / 38));
        data[i + 3] = Math.round(alpha * fade);
        continue;
      }
    }

    if (brightness >= 242 && chroma <= 18) {
      data[i + 3] = 0;
      continue;
    }

    if (brightness >= 220 && chroma <= 26) {
      const fade = Math.max(0, Math.min(1, (242 - brightness) / 22));
      data[i + 3] = Math.round(alpha * fade);
    }
  }

  context.putImageData(pixels, 0, 0);
  return canvas;
};

export const loadGemMinerSprites = async (): Promise<GemMinerSprites> => {
  const entries = Object.entries(GEM_MINER_SPRITE_PATHS) as [
    GemMinerSpriteId,
    SpritePathEntry,
  ][];
  const loaded: GemMinerSprites = {};

  await Promise.all(
    entries.map(async ([id, pathEntry]) => {
      try {
        const image = Array.isArray(pathEntry)
          ? await loadImageFromCandidates(pathEntry)
          : await loadImage(pathEntry);
        loaded[id] = ORE_OVERLAY_SPRITE_IDS.has(id)
          ? keyOutWhiteBackground(image)
          : image;
      } catch {
        // Keep rendering with procedural fallback when an art file is missing.
      }
    }),
  );

  return loaded;
};
