import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readJson, readNumber, writeJson, writeNumber } from "../../lib/storage";
import {
  CORE_SPRITES,
  DEPOT_SPRITE_IDS,
  TILE_SPRITE_IDS,
  loadGemMinerSprites,
  type GemMinerSprites,
} from "./sprites";
import type { TileType } from "./types";
import type { GameProps } from "../types";

type UpgradeId = "cargo" | "drill" | "fuel" | "treads";
type CargoType = Exclude<TileType, "empty" | "dirt" | "rock">;
type DepotId = "sell" | "fuel" | "upgrade";
type DepotPanel = DepotId | null;

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

type RenderMode = "sprite" | "procedural";
type SpriteLoadState = "loading" | "ready" | "fallback";

const WORLD_WIDTH = 22;
const WORLD_HEIGHT = 110;
const TILE_SIZE = 24;
const VIEW_ROWS = 18;
const CANVAS_WIDTH = WORLD_WIDTH * TILE_SIZE;
const CANVAS_HEIGHT = VIEW_ROWS * TILE_SIZE;
const GEM_MINER_PROGRESS_KEY = "arcade:gem-miner:progress";
const GEM_MINER_PROFILE_INDEX_KEY = "arcade:gem-miner:profile-index";
const MAX_UPGRADE_LEVEL = 30;
const PROFILE_LABELS = ["A", "B", "C"] as const;
const AMBIENT_DUST_COUNT = 70;
const DEPOT_INTERACT_DISTANCE = 1;
const DEPOT_WIDTH = TILE_SIZE * 2.3;
const DEPOT_HEIGHT = TILE_SIZE * 1.65;
const ROCK_DRILL_POWER_REQUIRED = 2;
const FUEL_UNIT_COST = 3;
const DEPOTS: readonly DepotConfig[] = [
  { id: "sell", x: 4, label: "SELL", color: "#2f7da6", accent: "#8fe9ff" },
  { id: "fuel", x: 11, label: "FUEL", color: "#8d5a2e", accent: "#ffc284" },
  {
    id: "upgrade",
    x: 18,
    label: "RIG",
    color: "#4a3a87",
    accent: "#d3b2ff",
  },
] as const;
const CARGO_TYPES: readonly CargoType[] = [
  "coal",
  "copper",
  "silver",
  "gold",
  "ruby",
] as const;

const TILE_DEFS: Record<Exclude<TileType, "empty">, TileDefinition> = {
  dirt: { label: "Dirt", value: 4, hardness: 1, color: "#7a5431" },
  rock: { label: "Rock", value: 8, hardness: 2, color: "#4a5561" },
  coal: { label: "Coal", value: 14, hardness: 1.6, color: "#2f3842" },
  copper: { label: "Copper", value: 24, hardness: 2.5, color: "#b66b34" },
  silver: { label: "Silver", value: 42, hardness: 3, color: "#b7c5d3" },
  gold: { label: "Gold", value: 74, hardness: 3.8, color: "#f0c659" },
  ruby: { label: "Ruby", value: 130, hardness: 4.6, color: "#d85b84" },
};

const createEmptyCargoManifest = (): CargoManifest => ({
  coal: { count: 0, value: 0 },
  copper: { count: 0, value: 0 },
  silver: { count: 0, value: 0 },
  gold: { count: 0, value: 0 },
  ruby: { count: 0, value: 0 },
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
  status: "Touch down and start digging.",
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
      skyTop: "#2a5d7c",
      skyBottom: "#102437",
      fog: "rgba(122, 190, 224, 0.18)",
      tint: "rgba(96, 171, 115, 0.11)",
      dust: "rgba(188, 228, 255, 0.36)",
    };
  }

  if (depth < 38) {
    return {
      skyTop: "#1f3142",
      skyBottom: "#0a1522",
      fog: "rgba(134, 162, 191, 0.2)",
      tint: "rgba(122, 140, 168, 0.09)",
      dust: "rgba(198, 213, 235, 0.33)",
    };
  }

  if (depth < 74) {
    return {
      skyTop: "#291f3e",
      skyBottom: "#100b1f",
      fog: "rgba(181, 145, 233, 0.2)",
      tint: "rgba(130, 98, 185, 0.11)",
      dust: "rgba(205, 178, 250, 0.35)",
    };
  }

  return {
    skyTop: "#3a1717",
    skyBottom: "#190909",
    fog: "rgba(255, 129, 98, 0.23)",
    tint: "rgba(210, 94, 68, 0.12)",
    dust: "rgba(255, 168, 132, 0.35)",
  };
};

const pickTileByDepth = (depth: number): TileType => {
  const roll = Math.random();

  if (depth < 10) {
    if (roll < 0.74) return "dirt";
    if (roll < 0.92) return "rock";
    return "coal";
  }

  if (depth < 22) {
    if (roll < 0.46) return "dirt";
    if (roll < 0.66) return "rock";
    if (roll < 0.82) return "coal";
    return "copper";
  }

  if (depth < 40) {
    if (roll < 0.3) return "dirt";
    if (roll < 0.53) return "rock";
    if (roll < 0.67) return "coal";
    if (roll < 0.88) return "copper";
    return "silver";
  }

  if (depth < 68) {
    if (roll < 0.28) return "rock";
    if (roll < 0.4) return "coal";
    if (roll < 0.65) return "copper";
    if (roll < 0.86) return "silver";
    return "gold";
  }

  if (roll < 0.24) return "rock";
  if (roll < 0.45) return "copper";
  if (roll < 0.66) return "silver";
  if (roll < 0.88) return "gold";
  return "ruby";
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
const getFuelCapacity = (level: number): number => 90 + level * 30;
const getMoveDelayMs = (level: number): number => Math.max(78, 210 - level * 22);

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
        color: Math.random() > 0.5 ? "#ffd571" : "#8ef7ff",
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
    moneyRef.current += sold;
    totalEarnedRef.current += sold;
    cargoValueRef.current = 0;
    cargoUsedRef.current = 0;
    cargoManifestRef.current = createEmptyCargoManifest();
    reportHighScoreIfNeeded();

    statusRef.current = `Sold cargo for $${sold}.`;
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

  const refuelAtDepot = useCallback(() => {
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
    if (affordableUnits <= 0) {
      statusRef.current = `Refuel costs $${FUEL_UNIT_COST} per unit.`;
      playTone(180, 0.03, "sawtooth", 0.013);
      syncHud();
      return;
    }

    const unitsBought = Math.min(missingFuel, affordableUnits);
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
        statusRef.current = statusOverride ?? "New operation online. Dig smart.";
        persistProgress();
      } else {
        statusRef.current = statusOverride ?? "Fresh shaft generated. Progress kept.";
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

      const isSellableOre = targetTile !== "dirt" && targetTile !== "rock";
      const capacity = getCargoCapacity(cargoLevelRef.current);
      if (isSellableOre && cargoUsedRef.current >= capacity) {
        statusRef.current = "Cargo full. Return to the surface to sell.";
        playTone(180, 0.03, "sawtooth", 0.013);
        syncHud();
        return Math.max(60, moveDelayMs * 0.5);
      }

      const tileDef = TILE_DEFS[targetTile];
      const drillPower = getDrillPower(drillLevelRef.current);
      if (targetTile === "rock" && drillPower < ROCK_DRILL_POWER_REQUIRED) {
        statusRef.current = `Rock requires ${ROCK_DRILL_POWER_REQUIRED.toFixed(1)}x drill power.`;
        playTone(165, 0.04, "sawtooth", 0.013);
        syncHud();
        return Math.max(90, moveDelayMs * 0.7);
      }
      const depthMultiplier = 1 + nextY / 95;
      const minedValue = Math.round(tileDef.value * depthMultiplier);
      spawnMiningBurst(targetTile, nextX, nextY);

      worldRef.current[nextY][nextX] = "empty";
      robotXRef.current = nextX;
      robotYRef.current = nextY;
      if (targetTile !== "dirt" && targetTile !== "rock") {
        cargoUsedRef.current += 1;
        cargoValueRef.current += minedValue;
        cargoManifestRef.current[targetTile].count += 1;
        cargoManifestRef.current[targetTile].value += minedValue;
      }

      const fuelCost = Math.max(1, Math.round(tileDef.hardness * 1.15));
      spendFuel(fuelCost);

      statusRef.current = isSellableOre
        ? `Mined ${tileDef.label} (+$${minedValue}).`
        : targetTile === "rock"
          ? "Drilled through rock."
          : "Plowed through dirt.";
      handleSurfaceDock();
      playTone(520 + Math.random() * 180, 0.04, "triangle", 0.018);
      syncHud();

      const drillDelayMs = Math.max(
        65,
        Math.round(95 + (tileDef.hardness * 185) / drillPower),
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
    cargoUsedRef.current = Math.floor(cargoUsedRef.current * 0.6);
    cargoValueRef.current = Math.floor(cargoValueRef.current * 0.6);
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
        statusRef.current = "Cargo racks expanded.";
      } else if (id === "drill") {
        drillLevelRef.current += 1;
        statusRef.current = "Drill bit upgraded.";
      } else if (id === "fuel") {
        fuelLevelRef.current += 1;
        fuelRef.current = getFuelCapacity(fuelLevelRef.current);
        statusRef.current = "Fuel tank upgraded and topped off.";
      } else {
        treadsLevelRef.current += 1;
        statusRef.current = "Treads upgraded for faster movement.";
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
      const topY = clamp(robotYRef.current - 9, -2, WORLD_HEIGHT - VIEW_ROWS);
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
      const topY = clamp(robotYRef.current - 9, -2, WORLD_HEIGHT - VIEW_ROWS);
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
            ? `rgba(156, 201, 238, ${alpha})`
            : `rgba(255, 157, 126, ${alpha * 0.85})`;

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

      for (let row = 0; row < VIEW_ROWS; row += 1) {
        const worldY = topY + row;
        const rowBiome = getBiomeVisual(Math.max(0, worldY));

        for (let col = 0; col < WORLD_WIDTH; col += 1) {
          const px = col * TILE_SIZE;
          const py = row * TILE_SIZE;

          if (worldY < 0) {
            const skyNoise = hashNoise(col, row, 2);
            context.fillStyle = skyNoise > 0.83 ? "rgba(171, 227, 255, 0.32)" : "rgba(129, 194, 232, 0.14)";
            context.fillRect(px, py, TILE_SIZE - 1, TILE_SIZE - 1);
            continue;
          }

          if (worldY === 0) {
            context.fillStyle = "#2f4f2f";
            context.fillRect(px, py + TILE_SIZE - 5, TILE_SIZE - 1, 4);
            context.fillStyle = "rgba(129, 186, 107, 0.26)";
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
                context.fillStyle = "rgba(255, 252, 220, 0.66)";
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
            : "rgba(205, 224, 243, 0.25)";
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
          context.fillStyle = "rgba(232, 247, 255, 0.78)";
          context.font = "600 9px 'Space Grotesk', sans-serif";
          context.fillText("SPACE", depotRect.x + depotRect.w / 2 - 14, depotRect.y - 5);
        }
      }

      context.strokeStyle = "rgba(173, 222, 255, 0.07)";
      context.lineWidth = 1;
      for (let row = 0; row <= VIEW_ROWS; row += 1) {
        const y = row * TILE_SIZE + 0.5;
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

      const robotRow = robotYRef.current - topY;
      if (robotRow >= 0 && robotRow < VIEW_ROWS) {
        const robotX = robotXRef.current * TILE_SIZE;
        const robotY = robotRow * TILE_SIZE;
        const bob = Math.sin(timeMs * 0.013 + robotXRef.current * 0.7) * 1.1;
        const facing = robotFacingRef.current;
        const hullY = robotY + 5 + bob;
        const bodySprite = facing === 1 ? sprites.robotRight : sprites.robotLeft;
        const drillSprite = facing === 1 ? sprites.drillRight : sprites.drillLeft;

        context.fillStyle = "rgba(6, 13, 22, 0.42)";
        context.fillRect(robotX + 3, hullY + TILE_SIZE - 8, TILE_SIZE - 6, 4);

        const exhaustPulse = 0.5 + Math.sin(timeMs * 0.032) * 0.5;
        context.fillStyle = `rgba(124, 231, 255, ${0.24 + exhaustPulse * 0.26})`;
        const exhaustX = facing === 1 ? robotX + 2 : robotX + TILE_SIZE - 6;
        context.fillRect(exhaustX, hullY + TILE_SIZE / 2 - 2, 4, 4);

        if (useSprites && bodySprite) {
          context.drawImage(bodySprite, robotX, hullY - 1, TILE_SIZE, TILE_SIZE);
        } else {
          context.fillStyle = "#58f0ff";
          context.fillRect(robotX + 4, hullY, TILE_SIZE - 8, TILE_SIZE - 10);
          context.fillStyle = "#16314a";
          context.fillRect(robotX + 8, hullY + 4, TILE_SIZE - 16, 7);
          context.fillStyle = "rgba(255, 255, 255, 0.28)";
          context.fillRect(robotX + 6, hullY + 2, TILE_SIZE - 13, 2);
        }

        const drillOffset = Math.sin(timeMs * 0.06) * 1.8;
        if (useSprites && drillSprite) {
          const drillX = facing === 1 ? robotX + 6 + drillOffset : robotX - 6 - drillOffset;
          context.drawImage(drillSprite, drillX, hullY - 1, TILE_SIZE, TILE_SIZE);
        } else {
          const drillX = facing === 1 ? robotX + TILE_SIZE - 4 : robotX + 4;
          context.fillStyle = "#aee9ff";
          context.beginPath();
          if (facing === 1) {
            context.moveTo(drillX + 1, hullY + 8);
            context.lineTo(drillX + 7 + drillOffset, hullY + 12);
            context.lineTo(drillX + 1, hullY + 16);
          } else {
            context.moveTo(drillX - 1, hullY + 8);
            context.lineTo(drillX - 7 - drillOffset, hullY + 12);
            context.lineTo(drillX - 1, hullY + 16);
          }
          context.closePath();
          context.fill();
        }

        const lampX = facing === 1 ? robotX + TILE_SIZE - 2 : robotX + 2;
        const lampY = hullY + 12;
        const lamp = context.createRadialGradient(lampX, lampY, 6, lampX, lampY, 120);
        lamp.addColorStop(0, "rgba(170, 247, 255, 0.4)");
        lamp.addColorStop(1, "rgba(170, 247, 255, 0)");
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

      context.fillStyle = "rgba(231, 245, 255, 0.9)";
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
  const sellRows = useMemo(
    () =>
      CARGO_TYPES.map((type) => ({
        type,
        label: TILE_DEFS[type].label,
        unitPrice: TILE_DEFS[type].value,
        qty: hud.cargoManifest[type].count,
        total: hud.cargoManifest[type].value,
      })),
    [hud.cargoManifest],
  );
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

  return (
    <main className="app-shell in-game">
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

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas miner-canvas"
          aria-label="Gem Miner game canvas"
        />

        <div className="game-hud">
          <p>
            Money: <strong>${hud.money}</strong>
          </p>
          <p>
            Cargo: <strong>{hud.cargoUsed}</strong> / {hud.cargoCapacity}
          </p>
          <p>
            Haul Value: <strong>${hud.cargoValue}</strong>
          </p>
          <p>
            Fuel: <strong>{hud.fuel}</strong> / {hud.fuelCapacity}
          </p>
          <p>
            Drill: <strong>{hud.drillPower.toFixed(1)}x</strong>
          </p>
          <p>
            Speed: <strong>{(1000 / hud.moveDelayMs).toFixed(1)}</strong> steps/s
          </p>
          <p>
            Depth: <strong>{hud.depth}m</strong>
          </p>
          <p>
            Lifetime Sales: <strong>${hud.totalEarned}</strong>
          </p>
          <p>
            High: <strong>${highScore}</strong>
          </p>
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
                <div className="sell-table" role="table" aria-label="Cargo sale values">
                  <div className="sell-row sell-row--head" role="row">
                    <span role="columnheader">Gem</span>
                    <span role="columnheader">Price</span>
                    <span role="columnheader">Qty</span>
                    <span role="columnheader">Total</span>
                  </div>
                  {sellRows.map((row) => (
                    <div key={row.type} className="sell-row" role="row">
                      <span role="cell">{row.label}</span>
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
                <button type="button" className="cta" onClick={sellCargo}>
                  Sell Cargo
                </button>
              </div>
            ) : null}

            {depotPanel === "fuel" ? (
              <div className="depot-panel__content">
                <p>
                  Fuel: <strong>{hud.fuel}</strong> / {hud.fuelCapacity}
                </p>
                <p>Top up your tank before deep dives.</p>
                <button type="button" className="cta" onClick={refuelAtDepot}>
                  Refuel
                </button>
              </div>
            ) : null}

            {depotPanel === "upgrade" ? (
              <div className="depot-panel__content">
                <div className="upgrade-grid" aria-label="Upgrade shop">
                  <button
                    type="button"
                    className="ghost upgrade-button"
                    onClick={() => purchaseUpgrade("cargo")}
                  >
                    Cargo Rack (+7) · ${cargoUpgradeCost}
                  </button>
                  <button
                    type="button"
                    className="ghost upgrade-button"
                    onClick={() => purchaseUpgrade("drill")}
                  >
                    Drill Bit (+0.6x) · ${drillUpgradeCost}
                  </button>
                  <button
                    type="button"
                    className="ghost upgrade-button"
                    onClick={() => purchaseUpgrade("fuel")}
                  >
                    Fuel Tank (+30) · ${fuelUpgradeCost}
                  </button>
                  <button
                    type="button"
                    className="ghost upgrade-button"
                    onClick={() => purchaseUpgrade("treads")}
                  >
                    Treads (+speed) · ${treadsUpgradeCost}
                  </button>
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
