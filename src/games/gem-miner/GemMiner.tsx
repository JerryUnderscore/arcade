import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { readJson, readNumber, writeJson, writeNumber } from "../../lib/storage";
import {
  CORE_SPRITES,
  DEPOT_SPRITE_IDS,
  GEM_MINER_SPRITE_PATHS,
  TILE_SPRITE_IDS,
  loadGemMinerSprites,
  type GemMinerSprites,
} from "./sprites";
import type { TileType } from "./types";
import type { GameProps } from "../types";

type UpgradeId = "cargo" | "drill" | "fuel" | "treads";
type CargoType = Exclude<
  TileType,
  "empty" | "dirt" | "rock" | "stone" | "aegis" | "voidbed"
>;
type DepotId = "sell" | "fuel" | "upgrade";
type DepotPanel = DepotId | null;
type DrillAim = "forward" | "down";

type ToneType = OscillatorType;

type TileDefinition = {
  label: string;
  value: number;
  hardness: number;
  color: string;
};

type HudState = {
  money: number;
  cargoValue: number;
  cargoUsed: number;
  cargoCapacity: number;
  fuel: number;
  fuelCapacity: number;
  depth: number;
  totalEarned: number;
  status: string;
  stranded: boolean;
  paused: boolean;
  drillPower: number;
  moveDelayMs: number;
  cargoLevel: number;
  drillLevel: number;
  fuelLevel: number;
  treadsLevel: number;
  cargoManifest: CargoManifest;
  nearbyDepot: DepotId | null;
};

type PersistedProgress = {
  money: number;
  totalEarned: number;
  cargoLevel: number;
  drillLevel: number;
  fuelLevel: number;
  treadsLevel: number;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
  gravity: number;
  glow: boolean;
};

type AmbientDust = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  phase: number;
};

type BiomeVisual = {
  skyTop: string;
  skyBottom: string;
  fog: string;
  tint: string;
  dust: string;
};

type CargoEntry = {
  count: number;
  value: number;
};

type CargoManifest = Record<CargoType, CargoEntry>;

type DepotConfig = {
  id: DepotId;
  x: number;
  label: string;
  color: string;
  accent: string;
};

type LastSaleNotice = {
  value: number;
  units: number;
  minerals: number;
  id: number;
};

type RenderMode = "sprite" | "procedural";
type SpriteLoadState = "loading" | "ready" | "fallback";

const WORLD_WIDTH = 22;
const WORLD_HEIGHT = 420;
const TILE_SIZE = 24;
const VIEW_ROWS = 27;
const CANVAS_WIDTH = WORLD_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = VIEW_ROWS * TILE_SIZE;
const CAMERA_FOCUS_ROW = Math.floor(VIEW_ROWS * 0.5);
const SURFACE_SKY_ROWS = 8;
const HUD_GAUGE_SEGMENT_COUNT = 14;
const HUD_GAUGE_SEGMENT_INDEXES = Array.from(
  { length: HUD_GAUGE_SEGMENT_COUNT },
  (_, index) => index,
);
const ROBOT_SMOOTHING_MS = 135;
const CAMERA_SMOOTHING_MS = 210;
const GEM_MINER_PROGRESS_KEY = "arcade:gem-miner:progress";
const GEM_MINER_PROFILE_INDEX_KEY = "arcade:gem-miner:profile-index";
const UPGRADE_TIER_NAMES = [
  "Basic",
  "Copper",
  "Silver",
  "Gold",
  "Ruby",
  "Platinum",
  "Diamond",
  "Iridium",
  "Aurelite",
  "Cryostone",
  "Helionite",
  "Void Crystal",
] as const;
const UPGRADE_TIER_COLORS = [
  "#c8b09c",
  "#e49c66",
  "#d3dee9",
  "#f1c96d",
  "#ef8aa8",
  "#d7e0e8",
  "#b8f4ff",
  "#b9b9f7",
  "#ffc98f",
  "#96f7ff",
  "#ffbc85",
  "#ecb2ff",
] as const;
const MAX_UPGRADE_LEVEL = UPGRADE_TIER_NAMES.length - 1;
const PROFILE_LABELS = ["A", "B", "C"] as const;
const AMBIENT_DUST_COUNT = 70;
const DEPOT_INTERACT_DISTANCE = 1;
const DEPOT_WIDTH = TILE_SIZE * 2.3;
const DEPOT_HEIGHT = TILE_SIZE * 1.65;
const ROCK_EFFICIENT_DRILL_TIER = 3;
const STONE_REQUIRED_DRILL_TIER = 6;
const AEGIS_REQUIRED_DRILL_TIER = 9;
const VOIDBED_REQUIRED_DRILL_TIER = 12;
const FUEL_UNIT_COST = 2;
const EMERGENCY_TOW_RECOVERY_FACTOR = 0.6;
const UPGRADE_LABELS: Record<UpgradeId, string> = {
  cargo: "Cargo Rack",
  drill: "Drill Bit",
  fuel: "Fuel Tank",
  treads: "Treads",
};
const UPGRADE_ICON_PATHS: Record<UpgradeId, string> = {
  cargo: "/sprites/gem-miner/ui/upgrade-cargo.svg",
  drill: "/sprites/gem-miner/ui/upgrade-drill.svg",
  fuel: "/sprites/gem-miner/ui/upgrade-fuel.svg",
  treads: "/sprites/gem-miner/ui/upgrade-treads.svg",
};
const DEPOTS: readonly DepotConfig[] = [
  { id: "sell", x: 4, label: "SELL", color: "#8f4f34", accent: "#ffc09b" },
  { id: "fuel", x: 11, label: "FUEL", color: "#6d412b", accent: "#ffcf9a" },
  {
    id: "upgrade",
    x: 18,
    label: "RIG",
    color: "#60414d",
    accent: "#f1b2b6",
  },
] as const;
const CARGO_TYPES: readonly CargoType[] = [
  "coal",
  "copper",
  "silver",
  "gold",
  "ruby",
  "platinum",
  "diamond",
  "iridium",
  "aurelite",
  "cryostone",
  "helionite",
  "voidCrystal",
] as const;

const TILE_DEFS: Record<Exclude<TileType, "empty">, TileDefinition> = {
  dirt: { label: "Dirt", value: 0, hardness: 1, color: "#7a5431" },
  rock: { label: "Rock", value: 0, hardness: 2.2, color: "#4a5561" },
  stone: { label: "Stone", value: 0, hardness: 3.2, color: "#505a64" },
  aegis: { label: "Aegis Strata", value: 0, hardness: 4.9, color: "#4f4a6f" },
  voidbed: { label: "Voidbed", value: 0, hardness: 6.6, color: "#2b2637" },
  coal: { label: "Coal", value: 14, hardness: 1.6, color: "#2f3842" },
  copper: { label: "Copper", value: 24, hardness: 2.5, color: "#b66b34" },
  silver: { label: "Silver", value: 42, hardness: 3, color: "#b7c5d3" },
  gold: { label: "Gold", value: 74, hardness: 3.8, color: "#f0c659" },
  ruby: { label: "Ruby", value: 130, hardness: 4.6, color: "#d85b84" },
  platinum: { label: "Platinum", value: 190, hardness: 5.2, color: "#bcc7cf" },
  diamond: { label: "Diamond", value: 260, hardness: 5.9, color: "#9de9ff" },
  iridium: { label: "Iridium", value: 360, hardness: 6.4, color: "#a0a5d3" },
  aurelite: { label: "Aurelite", value: 520, hardness: 7, color: "#ffc28d" },
  cryostone: { label: "Cryostone", value: 740, hardness: 7.6, color: "#8ff2f7" },
  helionite: { label: "Helionite", value: 1050, hardness: 8.2, color: "#ffae68" },
  voidCrystal: { label: "Void Crystal", value: 1500, hardness: 9.2, color: "#d994ff" },
};

const createEmptyCargoManifest = (): CargoManifest => ({
  coal: { count: 0, value: 0 },
  copper: { count: 0, value: 0 },
  silver: { count: 0, value: 0 },
  gold: { count: 0, value: 0 },
  ruby: { count: 0, value: 0 },
  platinum: { count: 0, value: 0 },
  diamond: { count: 0, value: 0 },
  iridium: { count: 0, value: 0 },
  aurelite: { count: 0, value: 0 },
  cryostone: { count: 0, value: 0 },
  helionite: { count: 0, value: 0 },
  voidCrystal: { count: 0, value: 0 },
});

const initialHudState: HudState = {
  money: 0,
  cargoValue: 0,
  cargoUsed: 0,
  cargoCapacity: 12,
  fuel: 90,
  fuelCapacity: 90,
  depth: 0,
  totalEarned: 0,
  status: "Touch down on Mars and start drilling.",
  stranded: false,
  paused: false,
  drillPower: 1,
  moveDelayMs: 210,
  cargoLevel: 0,
  drillLevel: 0,
  fuelLevel: 0,
  treadsLevel: 0,
  cargoManifest: createEmptyCargoManifest(),
  nearbyDepot: null,
};

const defaultProgress: PersistedProgress = {
  money: 0,
  totalEarned: 0,
  cargoLevel: 0,
  drillLevel: 0,
  fuelLevel: 0,
  treadsLevel: 0,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const hashNoise = (x: number, y: number, seed = 0): number => {
  const raw = Math.sin(x * 12.9898 + y * 78.233 + seed * 37.719) * 43758.5453;
  return raw - Math.floor(raw);
};

const getBiomeVisual = (depth: number): BiomeVisual => {
  if (depth < 12) {
    return {
      skyTop: "#9d4f39",
      skyBottom: "#4a2117",
      fog: "rgba(255, 166, 121, 0.15)",
      tint: "rgba(223, 122, 83, 0.12)",
      dust: "rgba(255, 195, 155, 0.34)",
    };
  }

  if (depth < 38) {
    return {
      skyTop: "#7f3a2b",
      skyBottom: "#35160f",
      fog: "rgba(228, 132, 91, 0.18)",
      tint: "rgba(186, 90, 63, 0.11)",
      dust: "rgba(244, 169, 126, 0.32)",
    };
  }

  if (depth < 74) {
    return {
      skyTop: "#5f281d",
      skyBottom: "#220d09",
      fog: "rgba(179, 86, 62, 0.2)",
      tint: "rgba(142, 62, 44, 0.13)",
      dust: "rgba(217, 124, 96, 0.33)",
    };
  }

  return {
    skyTop: "#43160f",
    skyBottom: "#160706",
    fog: "rgba(153, 59, 43, 0.23)",
    tint: "rgba(110, 39, 29, 0.16)",
    dust: "rgba(194, 96, 72, 0.34)",
  };
};

const pickTileByDepth = (depth: number): TileType => {
  const roll = Math.random();

  if (depth < 18) {
    if (roll < 0.62) return "dirt";
    if (roll < 0.82) return "rock";
    if (roll < 0.94) return "coal";
    return "copper";
  }

  if (depth < 40) {
    if (roll < 0.36) return "dirt";
    if (roll < 0.64) return "rock";
    if (roll < 0.8) return "coal";
    if (roll < 0.92) return "copper";
    return "silver";
  }

  if (depth < 70) {
    if (roll < 0.15) return "dirt";
    if (roll < 0.45) return "rock";
    if (roll < 0.65) return "stone";
    if (roll < 0.77) return "coal";
    if (roll < 0.89) return "copper";
    if (roll < 0.97) return "silver";
    return "gold";
  }

  if (depth < 105) {
    if (roll < 0.22) return "rock";
    if (roll < 0.56) return "stone";
    if (roll < 0.64) return "coal";
    if (roll < 0.76) return "copper";
    if (roll < 0.88) return "silver";
    if (roll < 0.95) return "gold";
    if (roll < 0.99) return "ruby";
    return "platinum";
  }

  if (depth < 145) {
    if (roll < 0.34) return "stone";
    if (roll < 0.58) return "aegis";
    if (roll < 0.66) return "copper";
    if (roll < 0.76) return "silver";
    if (roll < 0.85) return "gold";
    if (roll < 0.92) return "ruby";
    if (roll < 0.96) return "platinum";
    if (roll < 0.99) return "diamond";
    return "iridium";
  }

  if (depth < 190) {
    if (roll < 0.2) return "stone";
    if (roll < 0.58) return "aegis";
    if (roll < 0.66) return "silver";
    if (roll < 0.76) return "gold";
    if (roll < 0.84) return "ruby";
    if (roll < 0.9) return "platinum";
    if (roll < 0.95) return "diamond";
    if (roll < 0.98) return "iridium";
    return "aurelite";
  }

  if (depth < 245) {
    if (roll < 0.36) return "aegis";
    if (roll < 0.54) return "voidbed";
    if (roll < 0.62) return "gold";
    if (roll < 0.7) return "ruby";
    if (roll < 0.78) return "platinum";
    if (roll < 0.85) return "diamond";
    if (roll < 0.91) return "iridium";
    if (roll < 0.96) return "aurelite";
    if (roll < 0.99) return "cryostone";
    return "helionite";
  }

  if (depth < 320) {
    if (roll < 0.2) return "aegis";
    if (roll < 0.54) return "voidbed";
    if (roll < 0.61) return "platinum";
    if (roll < 0.69) return "diamond";
    if (roll < 0.77) return "iridium";
    if (roll < 0.86) return "aurelite";
    if (roll < 0.93) return "cryostone";
    if (roll < 0.98) return "helionite";
    return "voidCrystal";
  }

  if (roll < 0.12) return "aegis";
  if (roll < 0.45) return "voidbed";
  if (roll < 0.53) return "diamond";
  if (roll < 0.63) return "iridium";
  if (roll < 0.74) return "aurelite";
  if (roll < 0.86) return "cryostone";
  if (roll < 0.95) return "helionite";
  return "voidCrystal";
};

const createWorld = (): TileType[][] => {
  const world: TileType[][] = [];

  for (let y = 0; y < WORLD_HEIGHT; y += 1) {
    const row: TileType[] = [];
    for (let x = 0; x < WORLD_WIDTH; x += 1) {
      if (y === 0) {
        row.push("empty");
        continue;
      }

      row.push(pickTileByDepth(y));
    }
    world.push(row);
  }

  return world;
};

const getCargoCapacity = (level: number): number => 12 + level * 7;
const getDrillPower = (level: number): number => 1 + level * 0.6;
const getDrillTier = (level: number): number => level + 1;
const getFuelCapacity = (level: number): number => 90 + level * 30;
const getMoveDelayMs = (level: number): number => Math.max(78, 210 - level * 22);
const getTierName = (level: number): string =>
  UPGRADE_TIER_NAMES[clamp(level, 0, MAX_UPGRADE_LEVEL)];
const getTierLabel = (level: number): string =>
  `T${getDrillTier(level)} ${getTierName(level)}`;
const isSellableCargoTile = (tile: TileType): tile is CargoType =>
  CARGO_TYPES.includes(tile as CargoType);
const getCameraTopY = (robotY: number): number =>
  clamp(robotY - CAMERA_FOCUS_ROW, -SURFACE_SKY_ROWS, WORLD_HEIGHT - VIEW_ROWS);

const getUpgradeCost = (id: UpgradeId, level: number): number => {
  if (id === "cargo") {
    return Math.round(70 * 1.4 ** level);
  }

  if (id === "drill") {
    return Math.round(85 * 1.45 ** level);
  }

  if (id === "fuel") {
    return Math.round(80 * 1.42 ** level);
  }

  return Math.round(95 * 1.5 ** level);
};

const sanitizeProgress = (value: PersistedProgress): PersistedProgress => ({
  money: Math.max(0, Math.floor(Number(value.money) || 0)),
  totalEarned: Math.max(0, Math.floor(Number(value.totalEarned) || 0)),
  cargoLevel: clamp(Math.floor(Number(value.cargoLevel) || 0), 0, MAX_UPGRADE_LEVEL),
  drillLevel: clamp(Math.floor(Number(value.drillLevel) || 0), 0, MAX_UPGRADE_LEVEL),
  fuelLevel: clamp(Math.floor(Number(value.fuelLevel) || 0), 0, MAX_UPGRADE_LEVEL),
  treadsLevel: clamp(Math.floor(Number(value.treadsLevel) || 0), 0, MAX_UPGRADE_LEVEL),
});

const getProgressKey = (profileIndex: number): string =>
  `${GEM_MINER_PROGRESS_KEY}:profile-${profileIndex}`;

const getNearbyDepotIdForPosition = (x: number, y: number): DepotId | null => {
  if (y !== 0) {
    return null;
  }

  for (const depot of DEPOTS) {
    if (Math.abs(x - depot.x) <= DEPOT_INTERACT_DISTANCE) {
      return depot.id;
    }
  }

  return null;
};

const getDepotRects = (topY: number): Array<{ id: DepotId; x: number; y: number; w: number; h: number }> =>
  DEPOTS.map((depot) => ({
    id: depot.id,
    x: depot.x * TILE_SIZE - DEPOT_WIDTH / 2 + TILE_SIZE / 2,
    y: (0 - topY) * TILE_SIZE + TILE_SIZE - DEPOT_HEIGHT - 1,
    w: DEPOT_WIDTH,
    h: DEPOT_HEIGHT,
  }));

export const GemMiner = ({
  onExit,
  highScore,
  onHighScore,
  soundEnabled,
  onToggleSound,
}: GameProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const actionCooldownMsRef = useRef(0);
  const keysRef = useRef<Set<string>>(new Set());

  const worldRef = useRef<TileType[][]>(createWorld());
  const robotXRef = useRef(Math.floor(WORLD_WIDTH / 2));
  const robotYRef = useRef(0);
  const robotRenderXRef = useRef(robotXRef.current);
  const robotRenderYRef = useRef(robotYRef.current);
  const cameraTopYRef = useRef(getCameraTopY(robotYRef.current));
  const drillAimRef = useRef<DrillAim>("forward");

  const moneyRef = useRef(0);
  const cargoValueRef = useRef(0);
  const cargoUsedRef = useRef(0);
  const cargoManifestRef = useRef<CargoManifest>(createEmptyCargoManifest());
  const fuelRef = useRef(getFuelCapacity(0));
  const totalEarnedRef = useRef(0);

  const cargoLevelRef = useRef(0);
  const drillLevelRef = useRef(0);
  const fuelLevelRef = useRef(0);
  const treadsLevelRef = useRef(0);

  const statusRef = useRef(initialHudState.status);
  const strandedRef = useRef(false);
  const pausedRef = useRef(false);

  const audioRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const currentHighScoreRef = useRef(highScore);
  const onHighScoreRef = useRef(onHighScore);
  const activeProfileRef = useRef(0);
  const depotPanelRef = useRef<DepotPanel>(null);
  const particlesRef = useRef<Particle[]>([]);
  const ambientDustRef = useRef<AmbientDust[]>([]);
  const cameraShakeRef = useRef(0);
  const caveFlashRef = useRef(0);
  const renderTimeMsRef = useRef(0);
  const robotFacingRef = useRef<1 | -1>(1);
  const spritesRef = useRef<GemMinerSprites>({});

  const [hud, setHud] = useState<HudState>(initialHudState);
  const [activeProfile, setActiveProfile] = useState(0);
  const [renderMode, setRenderMode] = useState<RenderMode>("sprite");
  const [spriteLoadState, setSpriteLoadState] = useState<SpriteLoadState>("loading");
  const [depotPanel, setDepotPanel] = useState<DepotPanel>(null);
  const [lastSaleNotice, setLastSaleNotice] = useState<LastSaleNotice | null>(null);

  soundEnabledRef.current = soundEnabled;
  currentHighScoreRef.current = highScore;
  onHighScoreRef.current = onHighScore;
  activeProfileRef.current = activeProfile;
  depotPanelRef.current = depotPanel;

  useEffect(() => {
    let mounted = true;

    void loadGemMinerSprites().then((loadedSprites) => {
      if (!mounted) {
        return;
      }

      spritesRef.current = loadedSprites;

      const hasCoreSprites = CORE_SPRITES.every((id) => Boolean(loadedSprites[id]));
      if (hasCoreSprites) {
        setSpriteLoadState("ready");
      } else {
        setSpriteLoadState("fallback");
        setRenderMode("procedural");
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  const playTone = useCallback(
    (
      frequency: number,
      duration = 0.08,
      waveform: ToneType = "square",
      gainValue = 0.03,
    ) => {
      if (!soundEnabledRef.current) {
        return;
      }

      const AudioContextConstructor = window.AudioContext;
      if (!AudioContextConstructor) {
        return;
      }

      if (!audioRef.current) {
        audioRef.current = new AudioContextConstructor();
      }

      const context = audioRef.current;
      if (context.state === "suspended") {
        void context.resume();
      }

      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = waveform;
      osc.frequency.value = frequency;
      gain.gain.value = gainValue;
      osc.connect(gain);
      gain.connect(context.destination);

      const start = context.currentTime;
      const stop = start + duration;
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);
      osc.start(start);
      osc.stop(stop);
    },
    [],
  );

  const seedAmbientDust = useCallback(() => {
    const particles: AmbientDust[] = [];
    for (let index = 0; index < AMBIENT_DUST_COUNT; index += 1) {
      particles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: -0.018 + Math.random() * 0.036,
        vy: 0.012 + Math.random() * 0.04,
        size: 0.7 + Math.random() * 2.2,
        alpha: 0.18 + Math.random() * 0.42,
        phase: Math.random() * Math.PI * 2,
      });
    }
    ambientDustRef.current = particles;
  }, []);

  const pushParticles = useCallback((nextParticles: Particle[]) => {
    particlesRef.current = [...particlesRef.current, ...nextParticles].slice(-280);
  }, []);

  const bumpCameraShake = useCallback((amount: number) => {
    cameraShakeRef.current = Math.min(10, Math.max(cameraShakeRef.current, amount));
  }, []);

  const spawnMiningBurst = useCallback(
    (tile: Exclude<TileType, "empty">, worldX: number, worldY: number) => {
      const tileColor = TILE_DEFS[tile].color;
      const pieces: Particle[] = [];
      const count = 8 + Math.floor(Math.random() * 6);

      for (let index = 0; index < count; index += 1) {
        const speed = 0.03 + Math.random() * 0.12;
        const angle = Math.random() * Math.PI * 2;
        pieces.push({
          x: worldX + 0.5,
          y: worldY + 0.5,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.05,
          size: 1.5 + Math.random() * 2.3,
          lifeMs: 200 + Math.random() * 400,
          maxLifeMs: 200 + Math.random() * 400,
          color: tileColor,
          gravity: 0.00018 + Math.random() * 0.00012,
          glow: tile === "gold" || tile === "ruby" || tile === "silver",
        });
      }

      pushParticles(pieces);
      bumpCameraShake(1.6 + TILE_DEFS[tile].hardness * 0.8);

      if (worldY > 48 && Math.random() < 0.11) {
        caveFlashRef.current = Math.max(caveFlashRef.current, 0.7);
      }
    },
    [bumpCameraShake, pushParticles],
  );

  const spawnSellBurst = useCallback((saleValue: number) => {
    const burstSize = clamp(Math.floor(saleValue / 45), 14, 42);
    const pieces: Particle[] = [];

    for (let index = 0; index < burstSize; index += 1) {
      const speed = 0.05 + Math.random() * 0.16;
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * 1.4;
      pieces.push({
        x: robotXRef.current + 0.5,
        y: 0.55,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: 1.4 + Math.random() * 2.8,
        lifeMs: 260 + Math.random() * 460,
        maxLifeMs: 260 + Math.random() * 460,
        color: Math.random() > 0.5 ? "#ffd18f" : "#ff9b6b",
        gravity: 0.00014 + Math.random() * 0.00009,
        glow: true,
      });
    }

    pushParticles(pieces);
    bumpCameraShake(2.4);
  }, [bumpCameraShake, pushParticles]);

  const applyProgressSnapshot = useCallback((progress: PersistedProgress) => {
    moneyRef.current = progress.money;
    totalEarnedRef.current = progress.totalEarned;
    cargoLevelRef.current = progress.cargoLevel;
    drillLevelRef.current = progress.drillLevel;
    fuelLevelRef.current = progress.fuelLevel;
    treadsLevelRef.current = progress.treadsLevel;
  }, []);

  const persistProgress = useCallback(() => {
    writeJson<PersistedProgress>(getProgressKey(activeProfileRef.current), {
      money: moneyRef.current,
      totalEarned: totalEarnedRef.current,
      cargoLevel: cargoLevelRef.current,
      drillLevel: drillLevelRef.current,
      fuelLevel: fuelLevelRef.current,
      treadsLevel: treadsLevelRef.current,
    });
  }, []);

  const getNearbyDepot = useCallback((): DepotId | null => {
    return getNearbyDepotIdForPosition(robotXRef.current, robotYRef.current);
  }, []);

  const syncHud = useCallback(() => {
    const nearbyDepot = getNearbyDepot();
    setHud({
      money: moneyRef.current,
      cargoValue: cargoValueRef.current,
      cargoUsed: cargoUsedRef.current,
      cargoCapacity: getCargoCapacity(cargoLevelRef.current),
      fuel: fuelRef.current,
      fuelCapacity: getFuelCapacity(fuelLevelRef.current),
      depth: robotYRef.current,
      totalEarned: totalEarnedRef.current,
      status: statusRef.current,
      stranded: strandedRef.current,
      paused: pausedRef.current,
      drillPower: getDrillPower(drillLevelRef.current),
      moveDelayMs: getMoveDelayMs(treadsLevelRef.current),
      cargoLevel: cargoLevelRef.current,
      drillLevel: drillLevelRef.current,
      fuelLevel: fuelLevelRef.current,
      treadsLevel: treadsLevelRef.current,
      cargoManifest: CARGO_TYPES.reduce(
        (manifest, type) => ({
          ...manifest,
          [type]: {
            count: cargoManifestRef.current[type].count,
            value: cargoManifestRef.current[type].value,
          },
        }),
        createEmptyCargoManifest(),
      ),
      nearbyDepot,
    });
  }, [getNearbyDepot]);

  const reportHighScoreIfNeeded = useCallback(() => {
    if (totalEarnedRef.current > currentHighScoreRef.current) {
      onHighScoreRef.current(totalEarnedRef.current);
    }
  }, []);

  const handleSurfaceDock = useCallback(() => {
    if (robotYRef.current !== 0) {
      return;
    }
    strandedRef.current = false;
  }, []);

  const sellCargo = useCallback(() => {
    if (depotPanelRef.current !== "sell") {
      statusRef.current = "Open the SELL depot to sell cargo.";
      syncHud();
      return;
    }

    if (cargoValueRef.current <= 0) {
      statusRef.current = "No sellable cargo right now.";
      playTone(190, 0.03, "sawtooth", 0.012);
      syncHud();
      return;
    }

    const sold = cargoValueRef.current;
    const soldUnits = cargoUsedRef.current;
    const soldMinerals = CARGO_TYPES.reduce((count, type) => {
      return count + (cargoManifestRef.current[type].count > 0 ? 1 : 0);
    }, 0);
    moneyRef.current += sold;
    totalEarnedRef.current += sold;
    cargoValueRef.current = 0;
    cargoUsedRef.current = 0;
    cargoManifestRef.current = createEmptyCargoManifest();
    reportHighScoreIfNeeded();

    statusRef.current = `Sold cargo for $${sold}.`;
    setLastSaleNotice({
      value: sold,
      units: soldUnits,
      minerals: soldMinerals,
      id: Date.now(),
    });
    playTone(670, 0.08, "triangle", 0.02);
    spawnSellBurst(sold);
    persistProgress();
    syncHud();
  }, [
    persistProgress,
    playTone,
    reportHighScoreIfNeeded,
    spawnSellBurst,
    syncHud,
  ]);

  const refuelAtDepot = useCallback((requestedUnits?: number) => {
    if (depotPanelRef.current !== "fuel") {
      statusRef.current = "Open the FUEL depot to refuel.";
      syncHud();
      return;
    }

    const fuelCapacity = getFuelCapacity(fuelLevelRef.current);
    const missingFuel = Math.max(0, fuelCapacity - fuelRef.current);
    if (missingFuel <= 0) {
      statusRef.current = "Tank already full.";
      syncHud();
      return;
    }

    const affordableUnits = Math.floor(moneyRef.current / FUEL_UNIT_COST);
    const maxPurchasableUnits = Math.min(missingFuel, affordableUnits);
    if (maxPurchasableUnits <= 0) {
      statusRef.current = `Refuel costs $${FUEL_UNIT_COST} per unit.`;
      playTone(180, 0.03, "sawtooth", 0.013);
      syncHud();
      return;
    }

    const unitsBought =
      typeof requestedUnits === "number" && Number.isFinite(requestedUnits)
        ? clamp(Math.floor(requestedUnits), 1, maxPurchasableUnits)
        : maxPurchasableUnits;
    const fuelCost = unitsBought * FUEL_UNIT_COST;

    moneyRef.current -= fuelCost;
    fuelRef.current += unitsBought;
    strandedRef.current = false;
    persistProgress();
    statusRef.current =
      unitsBought === missingFuel
        ? `Tank topped off for $${fuelCost}.`
        : `Bought ${unitsBought} fuel for $${fuelCost}.`;
    playTone(520, 0.06, "triangle", 0.016);
    syncHud();
  }, [persistProgress, playTone, syncHud]);

  const startNewShaft = useCallback(
    (keepProgress: boolean, statusOverride?: string) => {
      worldRef.current = createWorld();
      robotXRef.current = Math.floor(WORLD_WIDTH / 2);
      robotYRef.current = 0;
      robotRenderXRef.current = robotXRef.current;
      robotRenderYRef.current = robotYRef.current;
      cameraTopYRef.current = getCameraTopY(robotYRef.current);
      drillAimRef.current = "forward";
      robotFacingRef.current = 1;
      actionCooldownMsRef.current = 0;
      lastFrameTimeRef.current = 0;
      keysRef.current.clear();
      cargoValueRef.current = 0;
      cargoUsedRef.current = 0;
      cargoManifestRef.current = createEmptyCargoManifest();
      strandedRef.current = false;
      pausedRef.current = false;
      setDepotPanel(null);
      particlesRef.current = [];
      cameraShakeRef.current = 0;
      caveFlashRef.current = 0;
      seedAmbientDust();

      if (!keepProgress) {
        moneyRef.current = 0;
        totalEarnedRef.current = 0;
        cargoLevelRef.current = 0;
        drillLevelRef.current = 0;
        fuelLevelRef.current = 0;
        treadsLevelRef.current = 0;
        statusRef.current = statusOverride ?? "Mars operation online. Dig smart.";
        persistProgress();
      } else {
        statusRef.current = statusOverride ?? "Fresh Martian shaft generated. Progress kept.";
      }

      fuelRef.current = getFuelCapacity(fuelLevelRef.current);
      syncHud();
    },
    [persistProgress, seedAmbientDust, syncHud],
  );

  const openDepot = useCallback(
    (depot: DepotId) => {
      if (robotYRef.current !== 0) {
        statusRef.current = "Depots are only available on the surface.";
        syncHud();
        return;
      }

      const targetDepot = DEPOTS.find((item) => item.id === depot);
      if (!targetDepot) {
        return;
      }

      if (Math.abs(robotXRef.current - targetDepot.x) > DEPOT_INTERACT_DISTANCE) {
        statusRef.current = `Move closer to the ${targetDepot.label} depot.`;
        syncHud();
        return;
      }

      setDepotPanel(depot);
      statusRef.current =
        depot === "sell"
          ? "Sell depot open."
          : depot === "fuel"
            ? "Fuel depot open."
            : "Upgrade depot open.";
      playTone(560, 0.04, "triangle", 0.014);
      syncHud();
    },
    [playTone, syncHud],
  );

  const closeDepot = useCallback(() => {
    if (depotPanelRef.current === null) {
      return;
    }

    setDepotPanel(null);
    statusRef.current = "Depot closed.";
    syncHud();
  }, [syncHud]);

  const triggerDepotAction = useCallback(() => {
    if (depotPanelRef.current !== null) {
      closeDepot();
      return;
    }

    const nearby = getNearbyDepot();
    if (!nearby) {
      statusRef.current = "Move next to a surface depot and press Space.";
      playTone(170, 0.03, "sawtooth", 0.01);
      syncHud();
      return;
    }

    openDepot(nearby);
  }, [closeDepot, getNearbyDepot, openDepot, playTone, syncHud]);

  const setStrandedIfNeeded = useCallback(() => {
    if (fuelRef.current <= 0 && robotYRef.current > 0) {
      fuelRef.current = 0;
      strandedRef.current = true;
      setDepotPanel(null);
      statusRef.current = "Out of fuel underground. Trigger emergency tow.";
      playTone(150, 0.25, "sawtooth", 0.04);
    }
  }, [playTone]);

  const spendFuel = useCallback(
    (amount: number) => {
      fuelRef.current = Math.max(0, fuelRef.current - amount);
      setStrandedIfNeeded();
    },
    [setStrandedIfNeeded],
  );

  const attemptStep = useCallback(
    (dx: number, dy: number): number | null => {
      if (pausedRef.current || strandedRef.current || depotPanelRef.current !== null) {
        return null;
      }

      if (dy > 0) {
        drillAimRef.current = "down";
      } else if (dx !== 0 || dy < 0) {
        drillAimRef.current = "forward";
      }

      const nextX = robotXRef.current + dx;
      const nextY = robotYRef.current + dy;

      if (nextX < 0 || nextX >= WORLD_WIDTH || nextY < 0 || nextY >= WORLD_HEIGHT) {
        return null;
      }

      const targetTile = worldRef.current[nextY][nextX];
      const moveDelayMs = getMoveDelayMs(treadsLevelRef.current);
      if (dx < 0) {
        robotFacingRef.current = -1;
      } else if (dx > 0) {
        robotFacingRef.current = 1;
      }

      if (fuelRef.current <= 0) {
        const canCoastAtSurface =
          robotYRef.current === 0 && nextY === 0 && targetTile === "empty";
        if (!canCoastAtSurface) {
          setStrandedIfNeeded();
          syncHud();
          return null;
        }
      }

      if (targetTile === "empty") {
        robotXRef.current = nextX;
        robotYRef.current = nextY;
        if (!(robotYRef.current === 0 && nextY === 0)) {
          spendFuel(1);
        }
        handleSurfaceDock();
        playTone(420, 0.015, "triangle", 0.01);
        syncHud();
        return moveDelayMs;
      }

      const isSellableOre = isSellableCargoTile(targetTile);
      const capacity = getCargoCapacity(cargoLevelRef.current);
      if (isSellableOre && cargoUsedRef.current >= capacity) {
        statusRef.current = "Cargo full. Return to the surface to sell.";
        playTone(180, 0.03, "sawtooth", 0.013);
        syncHud();
        return Math.max(60, moveDelayMs * 0.5);
      }

      const tileDef = TILE_DEFS[targetTile];
      const drillPower = getDrillPower(drillLevelRef.current);
      const drillTier = getDrillTier(drillLevelRef.current);

      if (targetTile === "stone" && drillTier < STONE_REQUIRED_DRILL_TIER) {
        statusRef.current = `Stone needs ${getTierLabel(STONE_REQUIRED_DRILL_TIER - 1)} drill hardware.`;
        playTone(165, 0.04, "sawtooth", 0.013);
        syncHud();
        return Math.max(90, moveDelayMs * 0.7);
      }

      if (targetTile === "aegis" && drillTier < AEGIS_REQUIRED_DRILL_TIER) {
        statusRef.current = `Aegis Strata requires ${getTierLabel(AEGIS_REQUIRED_DRILL_TIER - 1)} drill hardware.`;
        playTone(155, 0.05, "sawtooth", 0.013);
        syncHud();
        return Math.max(100, moveDelayMs * 0.8);
      }

      if (targetTile === "voidbed" && drillTier < VOIDBED_REQUIRED_DRILL_TIER) {
        statusRef.current = `Voidbed requires ${getTierLabel(VOIDBED_REQUIRED_DRILL_TIER - 1)} drill hardware.`;
        playTone(145, 0.05, "sawtooth", 0.013);
        syncHud();
        return Math.max(112, moveDelayMs * 0.85);
      }

      const weakRockTierGap =
        targetTile === "rock" ? Math.max(0, ROCK_EFFICIENT_DRILL_TIER - drillTier) : 0;
      const fuelPenaltyMultiplier = 1 + weakRockTierGap * 0.75;
      const delayPenaltyMultiplier = 1 + weakRockTierGap * 0.9;

      const depthMultiplier = 1 + nextY / 95;
      const minedValue = Math.round(tileDef.value * depthMultiplier);
      spawnMiningBurst(targetTile, nextX, nextY);

      worldRef.current[nextY][nextX] = "empty";
      robotXRef.current = nextX;
      robotYRef.current = nextY;
      if (isSellableOre) {
        cargoUsedRef.current += 1;
        cargoValueRef.current += minedValue;
        cargoManifestRef.current[targetTile].count += 1;
        cargoManifestRef.current[targetTile].value += minedValue;
      }

      const fuelCost = Math.max(
        1,
        Math.round(tileDef.hardness * 1.15 * fuelPenaltyMultiplier),
      );
      spendFuel(fuelCost);

      statusRef.current = isSellableOre
        ? `Mined ${tileDef.label} (+$${minedValue}).`
        : targetTile === "voidbed"
          ? "Bored through voidbed."
          : targetTile === "aegis"
            ? "Cut through aegis strata."
            : targetTile === "stone"
              ? "Drilled through stone."
        : targetTile === "rock"
          ? weakRockTierGap > 0
            ? "Drilled weakly through rock (extra fuel burned)."
            : "Drilled through rock."
          : "Plowed through dirt.";
      handleSurfaceDock();
      playTone(520 + Math.random() * 180, 0.04, "triangle", 0.018);
      syncHud();

      const drillDelayMs = Math.max(
        65,
        Math.round((95 + (tileDef.hardness * 185) / drillPower) * delayPenaltyMultiplier),
      );
      return drillDelayMs;
    },
    [
      handleSurfaceDock,
      playTone,
      setStrandedIfNeeded,
      spawnMiningBurst,
      spendFuel,
      syncHud,
    ],
  );

  const emergencyTow = useCallback(() => {
    if (!strandedRef.current) {
      return;
    }

    setDepotPanel(null);
    for (const type of CARGO_TYPES) {
      cargoManifestRef.current[type].count = Math.floor(
        cargoManifestRef.current[type].count * EMERGENCY_TOW_RECOVERY_FACTOR,
      );
      cargoManifestRef.current[type].value = Math.floor(
        cargoManifestRef.current[type].value * EMERGENCY_TOW_RECOVERY_FACTOR,
      );
    }
    cargoUsedRef.current = CARGO_TYPES.reduce(
      (total, type) => total + cargoManifestRef.current[type].count,
      0,
    );
    cargoValueRef.current = CARGO_TYPES.reduce(
      (total, type) => total + cargoManifestRef.current[type].value,
      0,
    );
    robotYRef.current = 0;
    fuelRef.current = getFuelCapacity(fuelLevelRef.current);
    strandedRef.current = false;
    statusRef.current = "Emergency tow complete. Some cargo was damaged.";
    playTone(350, 0.08, "sawtooth", 0.02);
    handleSurfaceDock();
    syncHud();
  }, [handleSurfaceDock, playTone, syncHud]);

  const purchaseUpgrade = useCallback(
    (id: UpgradeId) => {
      if (strandedRef.current) {
        statusRef.current = "Recover your bot before buying upgrades.";
        syncHud();
        return;
      }

      if (depotPanelRef.current !== "upgrade") {
        statusRef.current = "Open the RIG depot to install upgrades.";
        syncHud();
        return;
      }

      if (robotYRef.current !== 0) {
        statusRef.current = "Dock at the surface to install upgrades.";
        syncHud();
        return;
      }

      const level =
        id === "cargo"
          ? cargoLevelRef.current
          : id === "drill"
            ? drillLevelRef.current
            : id === "fuel"
            ? fuelLevelRef.current
              : treadsLevelRef.current;

      if (level >= MAX_UPGRADE_LEVEL) {
        statusRef.current = `${UPGRADE_LABELS[id]} is already at max tier (${getTierLabel(MAX_UPGRADE_LEVEL)}).`;
        playTone(220, 0.03, "triangle", 0.012);
        syncHud();
        return;
      }

      const cost = getUpgradeCost(id, level);
      if (moneyRef.current < cost) {
        statusRef.current = "Not enough cash for that upgrade yet.";
        playTone(180, 0.03, "sawtooth", 0.013);
        syncHud();
        return;
      }

      moneyRef.current -= cost;

      if (id === "cargo") {
        cargoLevelRef.current += 1;
        statusRef.current = `Cargo Rack upgraded to ${getTierLabel(cargoLevelRef.current)}.`;
      } else if (id === "drill") {
        drillLevelRef.current += 1;
        statusRef.current = `Drill Bit upgraded to ${getTierLabel(drillLevelRef.current)}.`;
      } else if (id === "fuel") {
        fuelLevelRef.current += 1;
        fuelRef.current = getFuelCapacity(fuelLevelRef.current);
        statusRef.current = `Fuel Tank upgraded to ${getTierLabel(fuelLevelRef.current)} and topped off.`;
      } else {
        treadsLevelRef.current += 1;
        statusRef.current = `Treads upgraded to ${getTierLabel(treadsLevelRef.current)}.`;
      }

      playTone(700, 0.05, "triangle", 0.02);
      persistProgress();
      syncHud();
    },
    [persistProgress, playTone, syncHud],
  );

  const togglePause = useCallback(() => {
    pausedRef.current = !pausedRef.current;
    statusRef.current = pausedRef.current ? "Paused." : "Resumed.";
    playTone(pausedRef.current ? 310 : 530, 0.03, "triangle", 0.013);
    syncHud();
  }, [playTone, syncHud]);

  useEffect(() => {
    const savedProfileIndex = clamp(
      Math.floor(readNumber(GEM_MINER_PROFILE_INDEX_KEY, 0)),
      0,
      PROFILE_LABELS.length - 1,
    );
    setActiveProfile(savedProfileIndex);
  }, []);

  const createNewProfile = useCallback(() => {
    startNewShaft(
      false,
      `Profile ${PROFILE_LABELS[activeProfile]} reset. Fresh account online.`,
    );
  }, [activeProfile, startNewShaft]);

  const switchProfile = useCallback((profileIndex: number) => {
    if (profileIndex === activeProfileRef.current) {
      return;
    }

    writeNumber(GEM_MINER_PROFILE_INDEX_KEY, profileIndex);
    setActiveProfile(profileIndex);
  }, []);

  useEffect(() => {
    writeNumber(GEM_MINER_PROFILE_INDEX_KEY, activeProfile);
    const loadedProgress = sanitizeProgress(
      readJson<PersistedProgress>(getProgressKey(activeProfile), defaultProgress),
    );

    applyProgressSnapshot(loadedProgress);

    const hasSavedProgress =
      loadedProgress.money > 0 ||
      loadedProgress.totalEarned > 0 ||
      loadedProgress.cargoLevel > 0 ||
      loadedProgress.drillLevel > 0 ||
      loadedProgress.fuelLevel > 0 ||
      loadedProgress.treadsLevel > 0;

    startNewShaft(
      true,
      hasSavedProgress
        ? `Loaded profile ${PROFILE_LABELS[activeProfile]}. Fresh shaft ready.`
        : `Profile ${PROFILE_LABELS[activeProfile]} is new. Start digging.`,
    );
  }, [activeProfile, applyProgressSnapshot, startNewShaft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (
        key === "arrowleft" ||
        key === "arrowright" ||
        key === "arrowup" ||
        key === "arrowdown" ||
        key === " "
      ) {
        event.preventDefault();
      }

      if (key === "p") {
        event.preventDefault();
        togglePause();
        return;
      }

      if (key === " ") {
        event.preventDefault();
        triggerDepotAction();
        return;
      }

      if (key === "escape") {
        event.preventDefault();
        closeDepot();
        return;
      }

      if (key === "r") {
        event.preventDefault();
        startNewShaft(true);
        return;
      }

      if (key === "t") {
        event.preventDefault();
        emergencyTow();
        return;
      }

      keysRef.current.add(key);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      keysRef.current.delete(event.key.toLowerCase());
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [closeDepot, emergencyTow, startNewShaft, togglePause, triggerDepotAction]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const onPointerDown = (event: PointerEvent) => {
      if (robotYRef.current < 0) {
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      const y = ((event.clientY - rect.top) / rect.height) * CANVAS_HEIGHT;
      const topY = cameraTopYRef.current;
      const depotRects = getDepotRects(topY);

      for (const depotRect of depotRects) {
        if (depotRect.y > CANVAS_HEIGHT || depotRect.y + depotRect.h < 0) {
          continue;
        }

        const isInside =
          x >= depotRect.x &&
          x <= depotRect.x + depotRect.w &&
          y >= depotRect.y &&
          y <= depotRect.y + depotRect.h;

        if (isInside) {
          openDepot(depotRect.id);
          return;
        }
      }
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
    };
  }, [openDepot]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    const draw = () => {
      const depth = robotYRef.current;
      const biome = getBiomeVisual(depth);
      const timeMs = renderTimeMsRef.current;
      const topY = cameraTopYRef.current;
      const baseTopY = Math.floor(topY);
      const topYOffsetPx = (topY - baseTopY) * TILE_SIZE;
      const visibleRows = VIEW_ROWS + 1;
      const nearbyDepot = getNearbyDepotIdForPosition(robotXRef.current, robotYRef.current);
      const sprites = spritesRef.current;
      const useSprites = renderMode === "sprite" && spriteLoadState === "ready";

      const background = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      background.addColorStop(0, biome.skyTop);
      background.addColorStop(1, biome.skyBottom);
      context.fillStyle = background;
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      for (let layer = 0; layer < 3; layer += 1) {
        const speed = 0.015 + layer * 0.012;
        const wave = 12 + layer * 14;
        const alpha = 0.05 + layer * 0.03;
        context.fillStyle =
          layer % 2 === 0
            ? `rgba(236, 157, 120, ${alpha})`
            : `rgba(165, 73, 54, ${alpha * 0.88})`;

        for (let i = 0; i < 14; i += 1) {
          const seed = i * 17 + layer * 29;
          const x =
            ((seed * 73 + timeMs * speed + depth * (4 + layer * 2.5)) %
              (CANVAS_WIDTH + 180)) -
            90;
          const y =
            ((seed * 43 + depth * (3 + layer)) % CANVAS_HEIGHT) +
            Math.sin(timeMs * 0.0014 + i + layer) * wave;
          context.beginPath();
          context.ellipse(x, y, 28 + layer * 18, 8 + layer * 5, 0.12, 0, Math.PI * 2);
          context.fill();
        }
      }

      const shake = cameraShakeRef.current;
      const shakeX = (Math.random() - 0.5) * shake;
      const shakeY = (Math.random() - 0.5) * shake * 0.72;

      context.save();
      context.translate(shakeX, shakeY);

      for (let row = 0; row < visibleRows; row += 1) {
        const worldY = baseTopY + row;
        const py = row * TILE_SIZE - topYOffsetPx;
        if (py < -TILE_SIZE || py > CANVAS_HEIGHT) {
          continue;
        }
        const rowBiome = getBiomeVisual(Math.max(0, worldY));

        for (let col = 0; col < WORLD_WIDTH; col += 1) {
          const px = col * TILE_SIZE;

          if (worldY < 0) {
            const skyNoise = hashNoise(col, row, 2);
            context.fillStyle = skyNoise > 0.83 ? "rgba(255, 199, 161, 0.34)" : "rgba(224, 130, 96, 0.15)";
            context.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
            continue;
          }

          if (worldY >= WORLD_HEIGHT) {
            continue;
          }

          if (worldY === 0) {
            context.fillStyle = "#6f3a2b";
            context.fillRect(px, py + TILE_SIZE - 5, TILE_SIZE - 1, 4);
            context.fillStyle = "rgba(206, 120, 88, 0.28)";
            context.fillRect(px, py + TILE_SIZE - 10, TILE_SIZE - 1, 3);
            continue;
          }

          const tile = worldRef.current[worldY][col];
          if (tile === "empty") {
            continue;
          }

          const tileDef = TILE_DEFS[tile];
          if (useSprites) {
            const spriteId = TILE_SPRITE_IDS[tile];
            const tileSprite = sprites[spriteId];
            if (tileSprite) {
              context.drawImage(tileSprite, px, py, TILE_SIZE, TILE_SIZE);
            } else {
              context.fillStyle = tileDef.color;
              context.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
            }
          } else {
            context.fillStyle = tileDef.color;
            context.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
          }

          context.fillStyle = "rgba(255, 255, 255, 0.11)";
          context.fillRect(px + 1, py + 1, TILE_SIZE - 4, 3);
          context.fillStyle = "rgba(0, 0, 0, 0.12)";
          context.fillRect(px + 1, py + TILE_SIZE - 7, TILE_SIZE - 4, 5);
          context.fillStyle = rowBiome.tint;
          context.globalAlpha = useSprites ? 0.42 : 1;
          context.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
          context.globalAlpha = 1;

          const speckA = hashNoise(col, worldY, 3);
          if (speckA > 0.56) {
            context.fillStyle = "rgba(255, 255, 255, 0.14)";
            context.fillRect(px + 4, py + 5, 2, 2);
          }
          const speckB = hashNoise(col, worldY, 5);
          if (speckB > 0.63) {
            context.fillStyle = "rgba(0, 0, 0, 0.16)";
            context.fillRect(px + TILE_SIZE - 8, py + TILE_SIZE - 9, 2, 2);
          }

          if (tile === "silver" || tile === "gold" || tile === "ruby") {
            const sparklePhase = Math.floor(timeMs / 180);
            if (hashNoise(col, worldY, sparklePhase) > 0.81) {
              if (useSprites && sprites.sparkle) {
                context.globalAlpha = 0.75;
                context.drawImage(sprites.sparkle, px + 8, py + 5, 6, 6);
                context.globalAlpha = 1;
              } else {
                context.fillStyle = "rgba(255, 231, 186, 0.62)";
                context.fillRect(px + 10, py + 5, 1, 6);
                context.fillRect(px + 8, py + 7, 5, 1);
              }
            }
          }
        }
      }

      const depotRects = getDepotRects(topY);
      for (const depotRect of depotRects) {
        const depotConfig = DEPOTS.find((depot) => depot.id === depotRect.id);
        if (!depotConfig) {
          continue;
        }
        if (depotRect.y > CANVAS_HEIGHT + 8 || depotRect.y + depotRect.h < -8) {
          continue;
        }

        const isNearby = nearbyDepot === depotRect.id;
        const isOpen = depotPanelRef.current === depotRect.id;
        const glow = isOpen ? 0.92 : isNearby ? 0.72 : 0.38;
        const depotSprite = sprites[DEPOT_SPRITE_IDS[depotRect.id]];

        if (useSprites && depotSprite) {
          context.globalAlpha = 0.9 + glow * 0.1;
          context.drawImage(depotSprite, depotRect.x, depotRect.y, depotRect.w, depotRect.h);
          context.globalAlpha = 1;
        } else {
          context.fillStyle = depotConfig.color;
          context.fillRect(depotRect.x, depotRect.y, depotRect.w, depotRect.h);
          context.fillStyle = `rgba(255, 255, 255, ${0.16 + glow * 0.2})`;
          context.fillRect(depotRect.x + 1, depotRect.y + 1, depotRect.w - 2, 3);
          context.fillStyle = "rgba(0, 0, 0, 0.2)";
          context.fillRect(
            depotRect.x + 1,
            depotRect.y + depotRect.h - 4,
            depotRect.w - 2,
            3,
          );
        }

        context.strokeStyle = isOpen
          ? "rgba(255, 255, 255, 0.8)"
          : isNearby
            ? depotConfig.accent
            : "rgba(245, 204, 182, 0.24)";
        context.lineWidth = isOpen ? 2 : 1.2;
        context.strokeRect(depotRect.x + 0.5, depotRect.y + 0.5, depotRect.w - 1, depotRect.h - 1);

        context.fillStyle = depotConfig.accent;
        context.font = "700 10px 'Space Grotesk', sans-serif";
        context.textAlign = "center";
        context.fillText(
          depotConfig.label,
          depotRect.x + depotRect.w / 2,
          depotRect.y + depotRect.h / 2 + 3,
        );
        context.textAlign = "left";

        if (isNearby && robotYRef.current === 0) {
          context.fillStyle = "rgba(255, 221, 199, 0.82)";
          context.font = "600 9px 'Space Grotesk', sans-serif";
          context.fillText("SPACE", depotRect.x + depotRect.w / 2 - 14, depotRect.y - 5);
        }
      }

      context.strokeStyle = "rgba(236, 164, 130, 0.08)";
      context.lineWidth = 1;
      for (let row = 0; row <= visibleRows; row += 1) {
        const y = row * TILE_SIZE - topYOffsetPx + 0.5;
        if (y < -1 || y > CANVAS_HEIGHT + 1) {
          continue;
        }
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(CANVAS_WIDTH, y);
        context.stroke();
      }

      for (let col = 0; col <= WORLD_WIDTH; col += 1) {
        const x = col * TILE_SIZE + 0.5;
        context.beginPath();
        context.moveTo(x, 0);
        context.lineTo(x, CANVAS_HEIGHT);
        context.stroke();
      }

      for (const particle of particlesRef.current) {
        const px = particle.x * TILE_SIZE;
        const py = (particle.y - topY) * TILE_SIZE;
        if (py < -18 || py > CANVAS_HEIGHT + 18 || px < -18 || px > CANVAS_WIDTH + 18) {
          continue;
        }

        const lifeAlpha = clamp(particle.lifeMs / particle.maxLifeMs, 0, 1);
        if (particle.glow) {
          context.shadowColor = particle.color;
          context.shadowBlur = 12;
        } else {
          context.shadowBlur = 0;
        }
        context.globalAlpha = lifeAlpha;
        context.fillStyle = particle.color;
        context.beginPath();
        context.arc(px, py, particle.size, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
        context.shadowBlur = 0;
      }

      const robotRow = robotRenderYRef.current - topY;
      if (robotRow >= 0 && robotRow < VIEW_ROWS) {
        const robotX = robotRenderXRef.current * TILE_SIZE;
        const robotY = robotRow * TILE_SIZE;
        const bob = Math.sin(timeMs * 0.013 + robotRenderXRef.current * 0.7) * 1.1;
        const facing = robotFacingRef.current;
        const hullY = robotY + 5 + bob;
        const bodySprite = facing === 1 ? sprites.robotRight : sprites.robotLeft;
        const drillingDown = drillAimRef.current === "down";
        const drillSprite = drillingDown
          ? sprites.drillDown
          : facing === 1
            ? sprites.drillRight
            : sprites.drillLeft;

        context.fillStyle = "rgba(6, 13, 22, 0.42)";
        context.fillRect(robotX + 3, hullY + TILE_SIZE - 8, TILE_SIZE - 6, 4);

        const exhaustPulse = 0.5 + Math.sin(timeMs * 0.032) * 0.5;
        context.fillStyle = `rgba(255, 159, 98, ${0.22 + exhaustPulse * 0.24})`;
        const exhaustX = facing === 1 ? robotX + 2 : robotX + TILE_SIZE - 6;
        context.fillRect(exhaustX, hullY + TILE_SIZE / 2 - 2, 4, 4);

        if (useSprites && bodySprite) {
          context.drawImage(bodySprite, robotX, hullY - 1, TILE_SIZE, TILE_SIZE);
        } else {
          context.fillStyle = "#d9835d";
          context.fillRect(robotX + 4, hullY, TILE_SIZE - 8, TILE_SIZE - 10);
          context.fillStyle = "#4d2a20";
          context.fillRect(robotX + 8, hullY + 4, TILE_SIZE - 16, 7);
          context.fillStyle = "rgba(255, 219, 195, 0.32)";
          context.fillRect(robotX + 6, hullY + 2, TILE_SIZE - 13, 2);
        }

        const drillOffset = Math.sin(timeMs * 0.06) * 1.8;
        if (useSprites && drillSprite) {
          if (drillingDown) {
            const drillX = robotX;
            const drillY = hullY + 2 + Math.abs(drillOffset) * 0.7;
            context.drawImage(drillSprite, drillX, drillY, TILE_SIZE, TILE_SIZE);
          } else {
            const drillX = facing === 1 ? robotX + 6 + drillOffset : robotX - 6 - drillOffset;
            context.drawImage(drillSprite, drillX, hullY - 1, TILE_SIZE, TILE_SIZE);
          }
        } else {
          context.fillStyle = "#f0c29c";
          context.beginPath();
          if (drillingDown) {
            const drillCenterX = robotX + TILE_SIZE / 2;
            context.moveTo(drillCenterX - 4, hullY + TILE_SIZE - 4);
            context.lineTo(drillCenterX + 4, hullY + TILE_SIZE - 4);
            context.lineTo(drillCenterX, hullY + TILE_SIZE + 4 + Math.abs(drillOffset));
          } else {
            const drillX = facing === 1 ? robotX + TILE_SIZE - 4 : robotX + 4;
            if (facing === 1) {
              context.moveTo(drillX + 1, hullY + 8);
              context.lineTo(drillX + 7 + drillOffset, hullY + 12);
              context.lineTo(drillX + 1, hullY + 16);
            } else {
              context.moveTo(drillX - 1, hullY + 8);
              context.lineTo(drillX - 7 - drillOffset, hullY + 12);
              context.lineTo(drillX - 1, hullY + 16);
            }
          }
          context.closePath();
          context.fill();
        }

        const lampX = drillingDown ? robotX + TILE_SIZE / 2 : facing === 1 ? robotX + TILE_SIZE - 2 : robotX + 2;
        const lampY = drillingDown ? hullY + TILE_SIZE - 2 : hullY + 12;
        const lamp = context.createRadialGradient(lampX, lampY, 6, lampX, lampY, 120);
        lamp.addColorStop(0, "rgba(255, 198, 146, 0.42)");
        lamp.addColorStop(1, "rgba(255, 198, 146, 0)");
        context.fillStyle = lamp;
        context.fillRect(lampX - 120, lampY - 120, 240, 240);
      }

      context.restore();

      for (const dust of ambientDustRef.current) {
        const pulse = 0.5 + Math.sin(timeMs * 0.0014 + dust.phase) * 0.5;
        context.globalAlpha = dust.alpha * (0.5 + pulse * 0.5);
        context.fillStyle = biome.dust;
        context.beginPath();
        context.arc(dust.x, dust.y, dust.size, 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;

      const fogAlpha = clamp((depth - 8) / 110, 0, 0.48);
      context.globalAlpha = fogAlpha;
      context.fillStyle = biome.fog;
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      context.globalAlpha = 1;

      if (caveFlashRef.current > 0) {
        context.fillStyle = `rgba(252, 236, 193, ${caveFlashRef.current * 0.18})`;
        context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
      }

      const vignette = context.createRadialGradient(
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_HEIGHT * 0.2,
        CANVAS_WIDTH / 2,
        CANVAS_HEIGHT / 2,
        CANVAS_HEIGHT * 0.82,
      );
      vignette.addColorStop(0, "rgba(0, 0, 0, 0)");
      vignette.addColorStop(1, "rgba(0, 0, 0, 0.48)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      context.fillStyle = "rgba(255, 224, 204, 0.92)";
      context.font = "500 12px 'Space Grotesk', sans-serif";
      context.fillText(`Depth: ${robotYRef.current}m`, 10, 16);
    };

    const frame = (time: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = time;
      }

      const deltaMs = Math.min(64, time - lastFrameTimeRef.current);
      lastFrameTimeRef.current = time;
      renderTimeMsRef.current = time;

      if (cameraShakeRef.current > 0) {
        cameraShakeRef.current = Math.max(0, cameraShakeRef.current - deltaMs * 0.018);
      }
      if (caveFlashRef.current > 0) {
        caveFlashRef.current = Math.max(0, caveFlashRef.current - deltaMs * 0.0018);
      }

      const nextVisualParticles: Particle[] = [];
      for (const particle of particlesRef.current) {
        const factor = deltaMs / 16.67;
        const nextLife = particle.lifeMs - deltaMs;
        if (nextLife <= 0) {
          continue;
        }

        const nextVy = particle.vy + particle.gravity * deltaMs;
        nextVisualParticles.push({
          ...particle,
          x: particle.x + particle.vx * factor,
          y: particle.y + nextVy * factor,
          vy: nextVy,
          lifeMs: nextLife,
        });
      }
      particlesRef.current = nextVisualParticles;

      for (const dust of ambientDustRef.current) {
        const factor = deltaMs / 16.67;
        dust.x += dust.vx * factor + Math.sin(time * 0.0012 + dust.phase) * 0.02;
        dust.y += dust.vy * factor;

        if (dust.x < -8) dust.x = CANVAS_WIDTH + 8;
        if (dust.x > CANVAS_WIDTH + 8) dust.x = -8;
        if (dust.y > CANVAS_HEIGHT + 8) {
          dust.y = -8;
          dust.x = Math.random() * CANVAS_WIDTH;
        }
      }

      const robotLerpAlpha = 1 - Math.exp(-deltaMs / ROBOT_SMOOTHING_MS);
      robotRenderXRef.current += (robotXRef.current - robotRenderXRef.current) * robotLerpAlpha;
      robotRenderYRef.current += (robotYRef.current - robotRenderYRef.current) * robotLerpAlpha;
      if (Math.abs(robotXRef.current - robotRenderXRef.current) < 0.001) {
        robotRenderXRef.current = robotXRef.current;
      }
      if (Math.abs(robotYRef.current - robotRenderYRef.current) < 0.001) {
        robotRenderYRef.current = robotYRef.current;
      }

      const targetTopY = getCameraTopY(robotYRef.current);
      const cameraLerpAlpha = 1 - Math.exp(-deltaMs / CAMERA_SMOOTHING_MS);
      cameraTopYRef.current += (targetTopY - cameraTopYRef.current) * cameraLerpAlpha;
      if (Math.abs(targetTopY - cameraTopYRef.current) < 0.001) {
        cameraTopYRef.current = targetTopY;
      }

      if (!pausedRef.current && !strandedRef.current && depotPanelRef.current === null) {
        if (actionCooldownMsRef.current > 0) {
          actionCooldownMsRef.current -= deltaMs;
        }

        if (actionCooldownMsRef.current <= 0) {
          const keys = keysRef.current;

          if (keys.has("arrowleft") || keys.has("a")) {
            const cooldown = attemptStep(-1, 0);
            if (cooldown !== null) {
              actionCooldownMsRef.current = cooldown;
            }
          } else if (keys.has("arrowright") || keys.has("d")) {
            const cooldown = attemptStep(1, 0);
            if (cooldown !== null) {
              actionCooldownMsRef.current = cooldown;
            }
          } else if (keys.has("arrowdown") || keys.has("s")) {
            const cooldown = attemptStep(0, 1);
            if (cooldown !== null) {
              actionCooldownMsRef.current = cooldown;
            }
          } else if (keys.has("arrowup") || keys.has("w")) {
            const cooldown = attemptStep(0, -1);
            if (cooldown !== null) {
              actionCooldownMsRef.current = cooldown;
            }
          }
        }
      }

      draw();
      animationRef.current = window.requestAnimationFrame(frame);
    };

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [attemptStep, renderMode, spriteLoadState]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        void audioRef.current.close();
      }
    };
  }, []);

  useEffect(() => {
    if (!lastSaleNotice) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setLastSaleNotice(null);
    }, 2600);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [lastSaleNotice]);

  const cargoUpgradeCost = useMemo(
    () => getUpgradeCost("cargo", hud.cargoLevel),
    [hud.cargoLevel],
  );
  const drillUpgradeCost = useMemo(
    () => getUpgradeCost("drill", hud.drillLevel),
    [hud.drillLevel],
  );
  const fuelUpgradeCost = useMemo(
    () => getUpgradeCost("fuel", hud.fuelLevel),
    [hud.fuelLevel],
  );
  const treadsUpgradeCost = useMemo(
    () => getUpgradeCost("treads", hud.treadsLevel),
    [hud.treadsLevel],
  );
  const upgradeRows = useMemo(
    () => [
      {
        id: "cargo" as const,
        icon: "CRG",
        iconSrc: UPGRADE_ICON_PATHS.cargo,
        label: "Cargo Rack",
        level: hud.cargoLevel,
        cost: cargoUpgradeCost,
        statLabel: "+7 cargo slots",
      },
      {
        id: "drill" as const,
        icon: "DRL",
        iconSrc: UPGRADE_ICON_PATHS.drill,
        label: "Drill Bit",
        level: hud.drillLevel,
        cost: drillUpgradeCost,
        statLabel: "+0.6x drill output",
      },
      {
        id: "fuel" as const,
        icon: "FUE",
        iconSrc: UPGRADE_ICON_PATHS.fuel,
        label: "Fuel Tank",
        level: hud.fuelLevel,
        cost: fuelUpgradeCost,
        statLabel: "+30 max fuel",
      },
      {
        id: "treads" as const,
        icon: "TRD",
        iconSrc: UPGRADE_ICON_PATHS.treads,
        label: "Treads",
        level: hud.treadsLevel,
        cost: treadsUpgradeCost,
        statLabel: "faster movement",
      },
    ],
    [
      cargoUpgradeCost,
      drillUpgradeCost,
      fuelUpgradeCost,
      hud.cargoLevel,
      hud.drillLevel,
      hud.fuelLevel,
      hud.treadsLevel,
      treadsUpgradeCost,
    ],
  );
  const tierCapCount = MAX_UPGRADE_LEVEL + 1;
  const sellRows = useMemo(
    () =>
      CARGO_TYPES.map((type) => ({
        type,
        label: TILE_DEFS[type].label,
        color: TILE_DEFS[type].color,
        spriteSrc: GEM_MINER_SPRITE_PATHS[TILE_SPRITE_IDS[type]],
        unitPrice: TILE_DEFS[type].value,
        qty: hud.cargoManifest[type].count,
        total: hud.cargoManifest[type].value,
        isActive: hud.cargoManifest[type].count > 0,
      })),
    [hud.cargoManifest],
  );
  const activeSellRows = useMemo(
    () => sellRows.filter((row) => row.isActive),
    [sellRows],
  );
  const distinctMineralsCount = activeSellRows.length;
  const hasSellableCargo = hud.cargoValue > 0;
  const nearbyDepotLabel = useMemo(() => {
    if (!hud.nearbyDepot) {
      return null;
    }

    const depot = DEPOTS.find((item) => item.id === hud.nearbyDepot);
    return depot?.label ?? null;
  }, [hud.nearbyDepot]);
  const activeDepotTitle = useMemo(() => {
    if (!depotPanel) {
      return null;
    }

    return depotPanel === "sell"
      ? "Sell Depot"
      : depotPanel === "fuel"
        ? "Fuel Depot"
        : "Rig Upgrade Depot";
  }, [depotPanel]);
  const spriteStatusLabel =
    spriteLoadState === "loading"
      ? "Loading sprites..."
      : spriteLoadState === "ready"
        ? "Sprite pack active"
        : "Sprite pack missing files (procedural fallback)";
  const cargoGaugePercent = Math.round((hud.cargoUsed / Math.max(1, hud.cargoCapacity)) * 100);
  const fuelGaugePercent = Math.round((hud.fuel / Math.max(1, hud.fuelCapacity)) * 100);
  const depthPercent = Math.round((hud.depth / Math.max(1, WORLD_HEIGHT - 1)) * 100);
  const cargoActiveSegments = Math.round(
    (clamp(cargoGaugePercent, 0, 100) / 100) * HUD_GAUGE_SEGMENT_COUNT,
  );
  const fuelActiveSegments = Math.round(
    (clamp(fuelGaugePercent, 0, 100) / 100) * HUD_GAUGE_SEGMENT_COUNT,
  );
  const fuelIsWarning = fuelGaugePercent <= 25;
  const fuelIsCritical = fuelGaugePercent <= 12;
  const fuelUnitsToFull = Math.max(0, hud.fuelCapacity - hud.fuel);
  const fuelFillCost = fuelUnitsToFull * FUEL_UNIT_COST;
  const affordableFuelUnits = Math.floor(hud.money / FUEL_UNIT_COST);
  const fuelAffordableNow = Math.min(fuelUnitsToFull, affordableFuelUnits);
  const fuelProjectedAfterPurchase = hud.fuel + fuelAffordableNow;
  const fuelProjectedPercent = Math.round(
    (fuelProjectedAfterPurchase / Math.max(1, hud.fuelCapacity)) * 100,
  );
  const fuelTankSegments = Math.round(
    (clamp(fuelGaugePercent, 0, 100) / 100) * HUD_GAUGE_SEGMENT_COUNT,
  );
  const fuelProjectedSegments = Math.round(
    (clamp(fuelProjectedPercent, 0, 100) / 100) * HUD_GAUGE_SEGMENT_COUNT,
  );
  const fuelDepotState: "full" | "insufficient" | "ready" =
    fuelUnitsToFull <= 0
      ? "full"
      : fuelAffordableNow <= 0
        ? "insufficient"
        : "ready";
  const fuelPresetOptions = useMemo(() => {
    const presets = [
      { label: "+10", units: 10 },
      { label: "+25", units: 25 },
      { label: "Half Tank", units: Math.ceil(fuelUnitsToFull / 2) },
      { label: "Full Tank", units: fuelUnitsToFull },
    ];
    const seen = new Set<number>();
    return presets.filter((preset) => {
      if (preset.units <= 0 || seen.has(preset.units)) {
        return false;
      }
      seen.add(preset.units);
      return true;
    });
  }, [fuelUnitsToFull]);

  return (
    <main className="app-shell in-game mars-theme">
      <section className="game-view">
        <div className="toolbar">
          <button type="button" className="ghost" onClick={onExit}>
            Back To Hub
          </button>
          <button type="button" className="ghost" onClick={togglePause}>
            {hud.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="ghost" onClick={onToggleSound}>
            Sound: {soundEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() =>
              setRenderMode((prev) => (prev === "sprite" ? "procedural" : "sprite"))
            }
            disabled={spriteLoadState !== "ready"}
          >
            Visual: {renderMode === "sprite" ? "Sprite" : "Procedural"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => startNewShaft(true)}
          >
            New Shaft
          </button>
          <button type="button" className="ghost" onClick={createNewProfile}>
            New Profile
          </button>
        </div>

        <div className="profile-switcher" aria-label="Profile selector">
          <p>Profile</p>
          {PROFILE_LABELS.map((label, index) => (
            <button
              key={label}
              type="button"
              className={`ghost profile-pill${index === activeProfile ? " is-active" : ""}`}
              onClick={() => switchProfile(index)}
            >
              {label}
            </button>
          ))}
          <p className="profile-note">{spriteStatusLabel}</p>
        </div>

        <div className="miner-stage">
          <canvas
            ref={canvasRef}
            width={CANVAS_WIDTH}
            height={CANVAS_HEIGHT}
            className="game-canvas miner-canvas"
            aria-label="Gem Miner game canvas"
          />
          <div className="miner-hud-overlay" aria-label="In-game HUD">
            <div className="miner-hud__metric">
              <p className="miner-hud__label">Money</p>
              <p className="miner-hud__value">${hud.money}</p>
            </div>
            <div className="miner-hud__metric">
              <p className="miner-hud__label">Depth</p>
              <p className="miner-hud__value">{hud.depth}m</p>
            </div>
            <div className="miner-hud__gauge" aria-label="Cargo gauge">
              <div className="miner-hud__gauge-head">
                <p className="miner-hud__label">Cargo</p>
                <p className="miner-hud__gauge-value">
                  {hud.cargoUsed} / {hud.cargoCapacity}
                </p>
              </div>
              <div
                className="miner-hud__gauge-track"
                role="progressbar"
                aria-label="Cargo hold usage"
                aria-valuemin={0}
                aria-valuemax={hud.cargoCapacity}
                aria-valuenow={hud.cargoUsed}
              >
                <div
                  className="miner-hud__gauge-fill miner-hud__gauge-fill--cargo"
                  style={{ width: `${clamp(cargoGaugePercent, 0, 100)}%` }}
                />
                <div className="miner-hud__segments" aria-hidden>
                  {HUD_GAUGE_SEGMENT_INDEXES.map((segmentIndex) => (
                    <span
                      key={`cargo-segment-${segmentIndex}`}
                      className={`miner-hud__segment${
                        segmentIndex < cargoActiveSegments ? " is-active" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div
              className={`miner-hud__gauge${fuelIsWarning ? " is-warning" : ""}${
                fuelIsCritical ? " is-critical" : ""
              }`}
              aria-label="Fuel gauge"
            >
              <div className="miner-hud__gauge-head">
                <p className="miner-hud__label">Fuel</p>
                <p className="miner-hud__gauge-value">
                  {hud.fuel} / {hud.fuelCapacity}
                </p>
              </div>
              <div
                className="miner-hud__gauge-track"
                role="progressbar"
                aria-label="Fuel tank level"
                aria-valuemin={0}
                aria-valuemax={hud.fuelCapacity}
                aria-valuenow={hud.fuel}
              >
                <div
                  className="miner-hud__gauge-fill miner-hud__gauge-fill--fuel"
                  style={{ width: `${clamp(fuelGaugePercent, 0, 100)}%` }}
                />
                <div className="miner-hud__segments" aria-hidden>
                  {HUD_GAUGE_SEGMENT_INDEXES.map((segmentIndex) => (
                    <span
                      key={`fuel-segment-${segmentIndex}`}
                      className={`miner-hud__segment${
                        segmentIndex < fuelActiveSegments ? " is-active" : ""
                      }`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="miner-hud__radar" aria-label="Depth radar strip">
              <p className="miner-hud__radar-label">Depth Radar</p>
              <div className="miner-hud__radar-track" role="presentation">
                <div className="miner-hud__radar-grid" />
                <span
                  className="miner-hud__radar-marker"
                  style={{ left: `${clamp(depthPercent, 0, 100)}%` }}
                />
                <span
                  className="miner-hud__radar-ping"
                  style={{ left: `${clamp(depthPercent, 0, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        <p className="status-line">{hud.status}</p>
        <p className="depot-hint">
          {nearbyDepotLabel
            ? `Near ${nearbyDepotLabel} depot. Press Space or tap depot to open.`
            : "Surface depots: SELL, FUEL, RIG (move next to one and press Space)."}
        </p>

        <div className="touch-controls" aria-label="Touch controls">
          <button type="button" className="ghost" onClick={() => attemptStep(-1, 0)}>
            Left
          </button>
          <button type="button" className="ghost" onClick={() => attemptStep(1, 0)}>
            Right
          </button>
          <button type="button" className="ghost" onClick={() => attemptStep(0, -1)}>
            Up
          </button>
          <button type="button" className="ghost" onClick={() => attemptStep(0, 1)}>
            Down
          </button>
          <button type="button" className="ghost" onClick={triggerDepotAction}>
            Action
          </button>
          <button type="button" className="ghost" onClick={emergencyTow}>
            Tow
          </button>
        </div>

        {depotPanel ? (
          <div className="depot-modal" onClick={closeDepot}>
            <section
              className="depot-panel"
              aria-label="Depot panel"
              onClick={(event) => event.stopPropagation()}
            >
            <div className="depot-panel__header">
              <h3>{activeDepotTitle}</h3>
              <button type="button" className="ghost" onClick={closeDepot}>
                Close
              </button>
            </div>

            {depotPanel === "sell" ? (
              <div className="depot-panel__content">
                <div className="sell-summary-ribbon" aria-label="Sale summary">
                  <div className="sell-summary-chip">
                    <p>Cargo Slots Used</p>
                    <strong>
                      {hud.cargoUsed} / {hud.cargoCapacity}
                    </strong>
                  </div>
                  <div className="sell-summary-chip">
                    <p>Distinct Minerals</p>
                    <strong>{distinctMineralsCount}</strong>
                  </div>
                  <div className="sell-summary-chip">
                    <p>Projected Sale</p>
                    <strong>${hud.cargoValue}</strong>
                  </div>
                </div>
                {lastSaleNotice ? (
                  <div key={lastSaleNotice.id} className="sell-last-sale" role="status">
                    Sold {lastSaleNotice.units} units across {lastSaleNotice.minerals} minerals for $
                    {lastSaleNotice.value}
                  </div>
                ) : null}
                <div className="sell-table" role="table" aria-label="Cargo sale values">
                  <div className="sell-row sell-row--head" role="row">
                    <span role="columnheader">Mineral</span>
                    <span role="columnheader">Price</span>
                    <span role="columnheader">Qty</span>
                    <span role="columnheader">Total</span>
                  </div>
                  {sellRows.map((row) => (
                    <div
                      key={row.type}
                      className={`sell-row${row.isActive ? " is-active" : " is-empty"}`}
                      role="row"
                      style={{ "--mineral-color": row.color } as CSSProperties}
                    >
                      <span role="cell" className="sell-mineral-cell">
                        <span
                          className="sell-mineral-icon"
                          style={{ backgroundColor: row.color }}
                          aria-hidden
                        >
                          <img
                            src={row.spriteSrc}
                            alt=""
                            loading="lazy"
                            onError={(event) => {
                              event.currentTarget.style.display = "none";
                            }}
                          />
                        </span>
                        <span>{row.label}</span>
                      </span>
                      <span role="cell">${row.unitPrice}</span>
                      <span role="cell">{row.qty}</span>
                      <span role="cell">${row.total}</span>
                    </div>
                  ))}
                  <div className="sell-row sell-row--foot" role="row">
                    <span role="cell">All Cargo</span>
                    <span role="cell">-</span>
                    <span role="cell">{hud.cargoUsed}</span>
                    <span role="cell">${hud.cargoValue}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className={`cta sell-cta${hasSellableCargo ? " is-live" : ""}`}
                  onClick={sellCargo}
                  disabled={!hasSellableCargo}
                >
                  {hasSellableCargo ? `Sell Cargo · $${hud.cargoValue}` : "No Cargo To Sell"}
                </button>
              </div>
            ) : null}

            {depotPanel === "fuel" ? (
              <div className="depot-panel__content fuel-terminal">
                <div className="fuel-terminal__header">
                  <div className="fuel-terminal__heading">
                    <span className="fuel-terminal__icon" aria-hidden>
                      FT
                    </span>
                    <p>Fuel Terminal</p>
                  </div>
                  <span className={`fuel-terminal__state fuel-terminal__state--${fuelDepotState}`}>
                    {fuelDepotState === "full"
                      ? "Tank Full"
                      : fuelDepotState === "insufficient"
                        ? "Insufficient Funds"
                        : "Ready To Refuel"}
                  </span>
                </div>

                <div className="fuel-terminal__metrics" aria-label="Fuel economy stats">
                  <div className="fuel-terminal__metric">
                    <p>Tank</p>
                    <strong>
                      {hud.fuel} / {hud.fuelCapacity}
                    </strong>
                  </div>
                  <div className="fuel-terminal__metric">
                    <p>Unit Price</p>
                    <strong>${FUEL_UNIT_COST}</strong>
                  </div>
                  <div className="fuel-terminal__metric">
                    <p>Fill Cost</p>
                    <strong>${fuelFillCost}</strong>
                  </div>
                  <div className="fuel-terminal__metric">
                    <p>Affordable</p>
                    <strong>{fuelAffordableNow} units</strong>
                  </div>
                </div>

                <div className="fuel-terminal__tank">
                  <div className="fuel-terminal__tank-head">
                    <p>Fuel Gauge</p>
                    <span>
                      {hud.fuel} / {hud.fuelCapacity}
                    </span>
                  </div>
                  <div className="fuel-terminal__tank-track" role="presentation">
                    <div
                      className="fuel-terminal__tank-fill"
                      style={{ width: `${clamp(fuelGaugePercent, 0, 100)}%` }}
                    />
                    <div
                      className="fuel-terminal__tank-projected"
                      style={{ width: `${clamp(fuelProjectedPercent, 0, 100)}%` }}
                    />
                    <div className="fuel-terminal__segments" aria-hidden>
                      {HUD_GAUGE_SEGMENT_INDEXES.map((segmentIndex) => (
                        <span
                          key={`fuel-terminal-segment-${segmentIndex}`}
                          className={`fuel-terminal__segment${
                            segmentIndex < fuelTankSegments
                              ? " is-active"
                              : segmentIndex < fuelProjectedSegments
                                ? " is-projected"
                                : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="fuel-terminal__preview">
                  <span>
                    Units to buy: <strong>{fuelAffordableNow}</strong>
                  </span>
                  <span>
                    Cost now: <strong>${fuelAffordableNow * FUEL_UNIT_COST}</strong>
                  </span>
                  <span>
                    Fuel after: <strong>{fuelProjectedAfterPurchase}</strong> / {hud.fuelCapacity}
                  </span>
                </div>

                <div className="fuel-terminal__presets">
                  {fuelPresetOptions.map((preset) => {
                    const isDisabled = fuelDepotState !== "ready" || preset.units > fuelAffordableNow;
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        className="ghost fuel-terminal__preset-btn"
                        onClick={() => refuelAtDepot(preset.units)}
                        disabled={isDisabled}
                      >
                        {preset.label} · ${preset.units * FUEL_UNIT_COST}
                      </button>
                    );
                  })}
                </div>

                <button
                  type="button"
                  className="cta fuel-terminal__cta"
                  onClick={() => refuelAtDepot(fuelAffordableNow)}
                  disabled={fuelAffordableNow <= 0}
                >
                  {fuelAffordableNow > 0
                    ? `Refuel Max Affordable · $${fuelAffordableNow * FUEL_UNIT_COST}`
                    : fuelDepotState === "full"
                      ? "Tank Full"
                      : "Insufficient Funds"}
                </button>
              </div>
            ) : null}

            {depotPanel === "upgrade" ? (
              <div className="depot-panel__content">
                <div className="depot-stats-pills" aria-label="Rig telemetry">
                  <div className="depot-stat-pill">
                    <p>Drill Output</p>
                    <strong>{hud.drillPower.toFixed(1)}x</strong>
                    <span>{getTierLabel(hud.drillLevel)}</span>
                  </div>
                  <div className="depot-stat-pill">
                    <p>Tread Speed</p>
                    <strong>{(1000 / hud.moveDelayMs).toFixed(1)} steps/s</strong>
                    <span>{getTierLabel(hud.treadsLevel)}</span>
                  </div>
                  <div className="depot-stat-pill">
                    <p>Best Sale Run</p>
                    <strong>${highScore}</strong>
                    <span>All-time record</span>
                  </div>
                </div>
                <div className="rig-tier-progress" aria-label="Upgrade tier progress">
                  {upgradeRows.map((row) => {
                    const tierCount = row.level + 1;
                    const progressPct = (tierCount / tierCapCount) * 100;
                    return (
                      <div key={`${row.id}-progress`} className="rig-progress-row">
                        <p>{row.label}</p>
                        <div className="rig-progress-track" role="presentation">
                          <div
                            className="rig-progress-fill"
                            style={{ width: `${clamp(progressPct, 0, 100)}%` }}
                          />
                        </div>
                        <span>
                          T{tierCount}/{tierCapCount}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <div className="upgrade-grid" aria-label="Upgrade shop">
                  {upgradeRows.map((row) => {
                    const isMax = row.level >= MAX_UPGRADE_LEVEL;
                    const currentTier = getTierLabel(row.level);
                    const nextTier = isMax ? null : getTierLabel(row.level + 1);
                    const nextTierColor = UPGRADE_TIER_COLORS[Math.min(MAX_UPGRADE_LEVEL, row.level + 1)];
                    const tintTierColor = UPGRADE_TIER_COLORS[Math.min(MAX_UPGRADE_LEVEL, isMax ? row.level : row.level + 1)];
                    const shortfall = Math.max(0, row.cost - hud.money);
                    const canAfford = !isMax && hud.money >= row.cost;
                    const cardStyle = {
                      borderColor: isMax ? undefined : `${nextTierColor}66`,
                      boxShadow: isMax
                        ? undefined
                        : `inset 0 0 0 1px ${nextTierColor}22, 0 10px 22px rgba(0, 0, 0, 0.2)`,
                      "--tier-color": tintTierColor,
                    } as CSSProperties;

                    return (
                      <button
                        key={row.id}
                        type="button"
                        className={`ghost upgrade-button upgrade-card${
                          isMax ? " is-max" : canAfford ? " is-affordable" : " is-unaffordable"
                        }`}
                        onClick={() => purchaseUpgrade(row.id)}
                        disabled={isMax}
                        style={cardStyle}
                      >
                        <div className="upgrade-card__head">
                          <span className="upgrade-card__icon" aria-hidden>
                            <img
                              src={row.iconSrc}
                              alt=""
                              loading="lazy"
                              onLoad={(event) => {
                                const fallback = event.currentTarget.nextElementSibling as
                                  | HTMLSpanElement
                                  | null;
                                if (fallback) {
                                  fallback.style.display = "none";
                                }
                              }}
                              onError={(event) => {
                                event.currentTarget.style.display = "none";
                                const fallback = event.currentTarget.nextElementSibling as
                                  | HTMLSpanElement
                                  | null;
                                if (fallback) {
                                  fallback.style.display = "inline";
                                }
                              }}
                            />
                            <span className="upgrade-card__icon-fallback">{row.icon}</span>
                          </span>
                          <p className="upgrade-card__title">{row.label}</p>
                        </div>
                        <p className="upgrade-card__tiers">
                          {isMax ? `${currentTier} - MAX` : `${currentTier} -> ${nextTier}`}
                        </p>
                        <p className="upgrade-card__effect">{row.statLabel}</p>
                        <div className="upgrade-card__footer">
                          {isMax ? (
                            <span className="upgrade-card__state is-max">Maxed Out</span>
                          ) : (
                            <>
                              <strong className="upgrade-card__price">${row.cost}</strong>
                              <span
                                className={`upgrade-card__state${
                                  canAfford ? " is-affordable" : " is-unaffordable"
                                }`}
                              >
                                {canAfford ? "Affordable" : `Need $${shortfall} more`}
                              </span>
                            </>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}
            </section>
          </div>
        ) : null}

        {hud.stranded ? (
          <div className="overlay">
            <h2>Stranded Underground</h2>
            <p>Fuel is empty. Trigger an emergency tow to return to the surface.</p>
            <div className="overlay__actions">
              <button type="button" className="cta" onClick={emergencyTow}>
                Emergency Tow
              </button>
              <button type="button" className="ghost" onClick={onExit}>
                Return To Hub
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </main>
  );
};
