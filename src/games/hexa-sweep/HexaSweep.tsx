import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import type { GameProps } from "../types";

type HexDirection = 0 | 1 | 2 | 3 | 4 | 5;
type ToneType = OscillatorType;

type HexTile = {
  id: number;
  direction: HexDirection;
  removed: boolean;
};

type HexBoard = HexTile[][];
type FlightPoint = {
  row: number;
  col: number;
};
type FlyingTile = {
  id: number;
  direction: HexDirection;
  path: FlightPoint[];
  stepIndex: number;
};

const BOARD_ROWS = 10;
const BOARD_COLS = 12;
const NEXT_BOARD_DELAY_MS = 920;
const HEX_FLIP_HOP_MS = 220;
const SOLVABLE_BUILD_ATTEMPTS = 36;

const DIRECTION_META: Record<HexDirection, { label: string; angle: number }> = {
  0: { label: "North", angle: -90 },
  1: { label: "North-East", angle: -34 },
  2: { label: "South-East", angle: 34 },
  3: { label: "South", angle: 90 },
  4: { label: "South-West", angle: 146 },
  5: { label: "North-West", angle: -146 },
};
const DIRECTION_COLOR_INDEX: Record<HexDirection, number> = {
  0: 0,
  1: 1,
  2: 5,
  3: 4,
  4: 3,
  5: 2,
};

const randomDirection = (): HexDirection => Math.floor(Math.random() * 6) as HexDirection;

const isInside = (row: number, col: number): boolean =>
  row >= 0 && row < BOARD_ROWS && col >= 0 && col < BOARD_COLS;

const stepInDirection = (row: number, col: number, direction: HexDirection): [number, number] => {
  const isOddColumn = col % 2 === 1;
  switch (direction) {
    case 0:
      return [row - 1, col];
    case 1:
      return isOddColumn ? [row, col + 1] : [row - 1, col + 1];
    case 2:
      return isOddColumn ? [row + 1, col + 1] : [row, col + 1];
    case 3:
      return [row + 1, col];
    case 4:
      return isOddColumn ? [row + 1, col - 1] : [row, col - 1];
    case 5:
    default:
      return isOddColumn ? [row, col - 1] : [row - 1, col - 1];
  }
};

const countRemainingTiles = (board: HexBoard): number => {
  let count = 0;
  for (const row of board) {
    for (const tile of row) {
      if (!tile.removed) {
        count += 1;
      }
    }
  }
  return count;
};

const cloneBoard = (board: HexBoard): HexBoard =>
  board.map((row) => row.map((tile) => ({ ...tile })));

const getRayDistanceToEdge = (row: number, col: number, direction: HexDirection): number => {
  let steps = 0;
  let nextRow = row;
  let nextCol = col;

  while (isInside(nextRow, nextCol)) {
    [nextRow, nextCol] = stepInDirection(nextRow, nextCol, direction);
    steps += 1;
  }
  return steps;
};

const pickDirectionTowardNearestEdge = (row: number, col: number): HexDirection => {
  let bestDistance = Number.POSITIVE_INFINITY;
  const candidates: HexDirection[] = [];

  for (const direction of [0, 1, 2, 3, 4, 5] as const) {
    const distance = getRayDistanceToEdge(row, col, direction);
    if (distance < bestDistance) {
      bestDistance = distance;
      candidates.length = 0;
      candidates.push(direction);
    } else if (distance === bestDistance) {
      candidates.push(direction);
    }
  }

  return candidates[Math.floor(Math.random() * candidates.length)] ?? 0;
};

const isTileRemovable = (board: HexBoard, row: number, col: number): boolean => {
  const tile = board[row][col];
  if (tile.removed) {
    return false;
  }

  let [nextRow, nextCol] = stepInDirection(row, col, tile.direction);
  while (isInside(nextRow, nextCol)) {
    if (!board[nextRow][nextCol].removed) {
      return false;
    }
    [nextRow, nextCol] = stepInDirection(nextRow, nextCol, tile.direction);
  }

  return true;
};

const getRemovablePositions = (board: HexBoard): Array<[number, number]> => {
  const positions: Array<[number, number]> = [];
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (isTileRemovable(board, row, col)) {
        positions.push([row, col]);
      }
    }
  }
  return positions;
};

const hasAnyMove = (board: HexBoard): boolean => getRemovablePositions(board).length > 0;

const buildFlightPath = (row: number, col: number, direction: HexDirection): FlightPoint[] => {
  const path: FlightPoint[] = [{ row, col }];
  let currentRow = row;
  let currentCol = col;

  while (true) {
    const [nextRow, nextCol] = stepInDirection(currentRow, currentCol, direction);
    if (!isInside(nextRow, nextCol)) {
      break;
    }
    path.push({ row: nextRow, col: nextCol });
    currentRow = nextRow;
    currentCol = nextCol;
  }

  return path;
};

const getCellKey = (row: number, col: number): string => `${row}:${col}`;

const getValidDirectionsForRemovedSet = (
  row: number,
  col: number,
  removedSet: Set<string>,
): HexDirection[] => {
  const valid: HexDirection[] = [];
  for (const direction of [0, 1, 2, 3, 4, 5] as const) {
    let [nextRow, nextCol] = stepInDirection(row, col, direction);
    let blocked = false;
    while (isInside(nextRow, nextCol)) {
      if (!removedSet.has(getCellKey(nextRow, nextCol))) {
        blocked = true;
        break;
      }
      [nextRow, nextCol] = stepInDirection(nextRow, nextCol, direction);
    }
    if (!blocked) {
      valid.push(direction);
    }
  }
  return valid;
};

const pickBestDirection = (
  row: number,
  col: number,
  validDirections: readonly HexDirection[],
): { direction: HexDirection; distance: number } => {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestDirections: HexDirection[] = [];

  for (const direction of validDirections) {
    const distance = getRayDistanceToEdge(row, col, direction);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestDirections = [direction];
    } else if (distance === bestDistance) {
      bestDirections.push(direction);
    }
  }

  const direction =
    bestDirections[Math.floor(Math.random() * bestDirections.length)] ??
    validDirections[0] ??
    0;
  return { direction, distance: bestDistance };
};

const buildSolvableBoard = (board: HexBoard): HexBoard => {
  for (let attempt = 0; attempt < SOLVABLE_BUILD_ATTEMPTS; attempt += 1) {
    const next = cloneBoard(board);
    const removedSet = new Set<string>();
    const pending: Array<{ row: number; col: number }> = [];

    for (let row = 0; row < BOARD_ROWS; row += 1) {
      for (let col = 0; col < BOARD_COLS; col += 1) {
        if (next[row][col].removed) {
          removedSet.add(getCellKey(row, col));
        } else {
          pending.push({ row, col });
        }
      }
    }

    let builtAll = true;
    let guard = 0;
    while (pending.length > 0 && guard < BOARD_ROWS * BOARD_COLS * 3) {
      guard += 1;
      let bestCandidateDistance = Number.POSITIVE_INFINITY;
      let candidates: Array<{ index: number; validDirections: HexDirection[] }> = [];

      for (let index = 0; index < pending.length; index += 1) {
        const cell = pending[index];
        const validDirections = getValidDirectionsForRemovedSet(cell.row, cell.col, removedSet);
        if (validDirections.length === 0) {
          continue;
        }

        const { distance } = pickBestDirection(cell.row, cell.col, validDirections);
        if (distance < bestCandidateDistance) {
          bestCandidateDistance = distance;
          candidates = [{ index, validDirections }];
        } else if (distance === bestCandidateDistance) {
          candidates.push({ index, validDirections });
        }
      }

      if (candidates.length === 0) {
        builtAll = false;
        break;
      }

      const chosen = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0];
      const chosenCell = pending[chosen.index];
      const { direction } = pickBestDirection(
        chosenCell.row,
        chosenCell.col,
        chosen.validDirections,
      );
      next[chosenCell.row][chosenCell.col].direction = direction;
      removedSet.add(getCellKey(chosenCell.row, chosenCell.col));
      pending.splice(chosen.index, 1);
    }

    if (builtAll && pending.length === 0) {
      return next;
    }
  }

  const fallbackBoard = cloneBoard(board);
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let col = 0; col < BOARD_COLS; col += 1) {
      if (fallbackBoard[row][col].removed) {
        continue;
      }
      fallbackBoard[row][col].direction = pickDirectionTowardNearestEdge(row, col);
    }
  }
  return fallbackBoard;
};

const createFreshBoard = (): HexBoard => {
  let tileId = 0;
  const rawBoard = Array.from({ length: BOARD_ROWS }, () =>
    Array.from({ length: BOARD_COLS }, () => ({
      id: tileId += 1,
      direction: randomDirection(),
      removed: false,
    })),
  );
  return buildSolvableBoard(rawBoard);
};

export const HexaSweep = ({
  onExit,
  highScore,
  onHighScore,
  soundEnabled,
  onToggleSound,
}: GameProps) => {
  const audioRef = useRef<AudioContext | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const nextBoardTimeoutRef = useRef<number | null>(null);
  const flyingTileIdRef = useRef(0);

  const [board, setBoard] = useState<HexBoard>(() => createFreshBoard());
  const [flyingTiles, setFlyingTiles] = useState<FlyingTile[]>([]);
  const [boardsCleared, setBoardsCleared] = useState(0);
  const [moves, setMoves] = useState(0);
  const [reroutes, setReroutes] = useState(0);
  const [totalTilesCleared, setTotalTilesCleared] = useState(0);
  const [boardSeconds, setBoardSeconds] = useState(0);
  const [isTransitioningBoard, setIsTransitioningBoard] = useState(false);
  const [status, setStatus] = useState(
    "Tap tiles whose arrow points to open space. Clear the full field.",
  );

  soundEnabledRef.current = soundEnabled;

  const tilesLeft = useMemo(() => countRemainingTiles(board), [board]);
  const removablePositions = useMemo(() => getRemovablePositions(board), [board]);
  const removableLookup = useMemo(() => {
    const lookup = new Set<string>();
    for (const [row, col] of removablePositions) {
      lookup.add(`${row}:${col}`);
    }
    return lookup;
  }, [removablePositions]);

  const boardProgressPercent = Math.round(
    ((BOARD_ROWS * BOARD_COLS - tilesLeft) / (BOARD_ROWS * BOARD_COLS)) * 100,
  );

  const playTone = useCallback(
    (
      frequency: number,
      duration = 0.07,
      waveform: ToneType = "triangle",
      gainValue = 0.025,
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

      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = waveform;
      oscillator.frequency.value = frequency;
      gain.gain.value = gainValue;

      oscillator.connect(gain);
      gain.connect(context.destination);

      const start = context.currentTime;
      const stop = start + duration;
      gain.gain.setValueAtTime(gainValue, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, stop);
      oscillator.start(start);
      oscillator.stop(stop);
    },
    [],
  );

  const clearPendingBoardTransition = useCallback(() => {
    if (nextBoardTimeoutRef.current !== null) {
      window.clearTimeout(nextBoardTimeoutRef.current);
      nextBoardTimeoutRef.current = null;
    }
  }, []);

  const clearFlyingTiles = useCallback(() => {
    setFlyingTiles([]);
  }, []);

  const spawnFlyingTile = useCallback((row: number, col: number, tile: HexTile) => {
    const flight: FlyingTile = {
      id: flyingTileIdRef.current += 1,
      direction: tile.direction,
      path: buildFlightPath(row, col, tile.direction),
      stepIndex: 0,
    };

    setFlyingTiles((previous) => [...previous, flight]);
  }, []);

  useEffect(() => {
    if (flyingTiles.length === 0) {
      return;
    }

    const interval = window.setInterval(() => {
      setFlyingTiles((previous) =>
        previous.flatMap((tile) => {
          const nextStep = tile.stepIndex + 1;
          if (nextStep >= tile.path.length) {
            return [];
          }

          return [{ ...tile, stepIndex: nextStep }];
        }),
      );
    }, HEX_FLIP_HOP_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, [flyingTiles.length]);

  const launchFreshBoard = useCallback(
    (nextStatus: string) => {
      clearPendingBoardTransition();
      clearFlyingTiles();
      setBoard(createFreshBoard());
      setBoardSeconds(0);
      setIsTransitioningBoard(false);
      setStatus(nextStatus);
    },
    [clearFlyingTiles, clearPendingBoardTransition],
  );

  const scheduleNextBoard = useCallback(() => {
    clearPendingBoardTransition();
    nextBoardTimeoutRef.current = window.setTimeout(() => {
      launchFreshBoard("New sector online. Keep clearing.");
    }, NEXT_BOARD_DELAY_MS);
  }, [clearPendingBoardTransition, launchFreshBoard]);

  const rerouteBoard = useCallback(
    (source: "manual" | "auto") => {
      setBoard((previousBoard) => buildSolvableBoard(previousBoard));
      setReroutes((value) => value + 1);
      setStatus(
        source === "manual"
          ? "Reroute complete. New vectors uploaded."
          : "No exits left. Auto-reroute deployed.",
      );
      playTone(source === "manual" ? 450 : 380, 0.08, "square", 0.018);
    },
    [playTone],
  );

  const handleTileTap = (row: number, col: number) => {
    if (isTransitioningBoard) {
      return;
    }

    const tile = board[row][col];
    if (tile.removed) {
      return;
    }

    if (!isTileRemovable(board, row, col)) {
      setStatus("Blocked lane. Remove more tiles in that direction first.");
      playTone(175, 0.05, "sawtooth", 0.015);
      return;
    }

    spawnFlyingTile(row, col, tile);
    const nextBoard = cloneBoard(board);
    nextBoard[row][col].removed = true;
    const nextTilesLeft = countRemainingTiles(nextBoard);

    let finalBoard = nextBoard;
    let triggeredAutoReroute = false;
    if (nextTilesLeft > 0 && !hasAnyMove(nextBoard)) {
      finalBoard = buildSolvableBoard(nextBoard);
      triggeredAutoReroute = true;
    }

    setBoard(finalBoard);
    setMoves((value) => value + 1);
    setTotalTilesCleared((value) => value + 1);
    playTone(610 + Math.random() * 120, 0.045, "triangle", 0.02);

    if (nextTilesLeft === 0) {
      setBoardsCleared((value) => value + 1);
      setIsTransitioningBoard(true);
      setStatus("Board cleared. Deploying a fresh field...");
      playTone(790, 0.2, "triangle", 0.03);
      scheduleNextBoard();
      return;
    }

    if (triggeredAutoReroute) {
      setReroutes((value) => value + 1);
      setStatus("Tile ejected. Field jam detected, auto-reroute active.");
      playTone(360, 0.08, "square", 0.018);
      return;
    }

    setStatus(`Tile ejected. ${nextTilesLeft} remaining in this field.`);
  };

  const handleNewBoard = () => {
    launchFreshBoard("Fresh board loaded.");
    playTone(510, 0.07, "triangle", 0.02);
  };

  const handleResetRun = () => {
    setBoardsCleared(0);
    setMoves(0);
    setReroutes(0);
    setTotalTilesCleared(0);
    launchFreshBoard("Run reset. New board ready.");
    playTone(340, 0.08, "square", 0.02);
  };

  useEffect(() => {
    if (boardsCleared > highScore) {
      onHighScore(boardsCleared);
    }
  }, [boardsCleared, highScore, onHighScore]);

  useEffect(() => {
    if (tilesLeft === 0 || isTransitioningBoard) {
      return;
    }

    const interval = window.setInterval(() => {
      setBoardSeconds((value) => value + 1);
    }, 1000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isTransitioningBoard, tilesLeft]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "r") {
        event.preventDefault();
        rerouteBoard("manual");
      } else if (key === "n") {
        event.preventDefault();
        handleNewBoard();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [rerouteBoard]);

  useEffect(
    () => () => {
      clearPendingBoardTransition();
      clearFlyingTiles();
      if (audioRef.current) {
        void audioRef.current.close();
        audioRef.current = null;
      }
    },
    [clearFlyingTiles, clearPendingBoardTransition],
  );

  return (
    <main className="app-shell in-game">
      <section className="game-view hexa-theme">
        <div className="toolbar">
          <button type="button" className="ghost" onClick={onExit}>
            Back To Hub
          </button>
          <button type="button" className="ghost" onClick={onToggleSound}>
            Sound: {soundEnabled ? "On" : "Off"}
          </button>
          <button type="button" className="ghost" onClick={() => rerouteBoard("manual")}>
            Reroute (R)
          </button>
          <button type="button" className="ghost" onClick={handleNewBoard}>
            New Board (N)
          </button>
          <button type="button" className="ghost" onClick={handleResetRun}>
            Reset Run
          </button>
        </div>

        <div className="hexa-hud" aria-label="Hexa Sweep HUD">
          <article className="hexa-hud__chip">
            <p>Boards Cleared</p>
            <strong>{boardsCleared}</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Best Run</p>
            <strong>{highScore}</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Tiles Left</p>
            <strong>{tilesLeft}</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Clear %</p>
            <strong>{boardProgressPercent}%</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Moves</p>
            <strong>{moves}</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Reroutes</p>
            <strong>{reroutes}</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Board Time</p>
            <strong>{boardSeconds}s</strong>
          </article>
          <article className="hexa-hud__chip">
            <p>Tiles Cleared</p>
            <strong>{totalTilesCleared}</strong>
          </article>
        </div>

        <div className="hexa-board-shell" aria-live="polite">
          <div
            className="hexa-board"
            style={
              {
                "--board-cols": BOARD_COLS,
                "--board-rows": BOARD_ROWS,
              } as CSSProperties
            }
            aria-label="Hexa tile board"
          >
            {board.map((row, rowIndex) =>
              row.map((tile, colIndex) => {
                const removable = removableLookup.has(`${rowIndex}:${colIndex}`);
                const directionAngle = `${DIRECTION_META[tile.direction].angle}deg`;
                const colorClass = `hexa-token--color-${DIRECTION_COLOR_INDEX[tile.direction]}`;
                const cellStyle = {
                  "--hex-col": colIndex,
                  "--hex-row": rowIndex,
                  "--hex-offset": colIndex % 2,
                } as CSSProperties;

                return (
                  <div key={`cell-${tile.id}`} className="hexa-cell" style={cellStyle}>
                    <span className="hexa-cell__socket" aria-hidden />
                    {!tile.removed ? (
                      <button
                        type="button"
                        className={`hexa-token ${colorClass}${removable ? " is-removable" : ""}`}
                        style={{ "--dir-angle": directionAngle } as CSSProperties}
                        onClick={() => handleTileTap(rowIndex, colIndex)}
                        aria-label={`${DIRECTION_META[tile.direction].label} tile, ${
                          removable ? "removable" : "blocked"
                        }`}
                      >
                        <span className="hexa-token__arrow" aria-hidden>
                          ➤
                        </span>
                      </button>
                    ) : null}
                  </div>
                );
              }),
            )}
            {flyingTiles.map((flyingTile) => {
              const point =
                flyingTile.path[Math.min(flyingTile.path.length - 1, flyingTile.stepIndex)];
              const normalizedOffset = ((point.col % 2) + 2) % 2;
              const flyingStyle = {
                "--hex-col": point.col,
                "--hex-row": point.row,
                "--hex-offset": normalizedOffset,
                "--flight-step": flyingTile.stepIndex,
                "--flight-hop-ms": `${HEX_FLIP_HOP_MS}ms`,
                "--dir-angle": `${DIRECTION_META[flyingTile.direction].angle}deg`,
              } as CSSProperties;

              return (
                <span
                  key={`flight-${flyingTile.id}`}
                  className={`hexa-token hexa-token--flying hexa-token--color-${DIRECTION_COLOR_INDEX[flyingTile.direction]}`}
                  style={flyingStyle}
                  aria-hidden
                >
                  <span className="hexa-token__arrow">➤</span>
                </span>
              );
            })}
          </div>
        </div>

        <p className="status-line hexa-status">{status}</p>
        <p className="depot-hint">
          Lit tiles are removable. Clear the whole board. If lanes jam, use reroute.
        </p>
      </section>
    </main>
  );
};
