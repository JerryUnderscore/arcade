import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "../types";

type Board = number[][];

type Piece = {
  kind: number;
  shape: number[][];
  x: number;
  y: number;
};

type ToneType = OscillatorType;
type PieceDefinition = {
  name: string;
  shape: number[][];
};

const BOARD_WIDTH = 10;
const BOARD_HEIGHT = 20;
const CELL_SIZE = 26;
const BOARD_OFFSET_X = 12;
const BOARD_OFFSET_Y = 20;
const PREVIEW_CELL_SIZE = 14;
const CANVAS_WIDTH = 380;
const CANVAS_HEIGHT = BOARD_OFFSET_Y * 2 + BOARD_HEIGHT * CELL_SIZE;

const PIECE_DEFS: PieceDefinition[] = [
  { name: "I", shape: [[1, 1, 1, 1]] },
  {
    name: "J",
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  {
    name: "L",
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  },
  {
    name: "O",
    shape: [
      [1, 1],
      [1, 1],
    ],
  },
  {
    name: "S",
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  },
  {
    name: "T",
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  },
  {
    name: "Z",
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  },
];

const CELL_COLORS = [
  "transparent",
  "#4de4ff",
  "#4d8dff",
  "#ff9f43",
  "#ffd85a",
  "#57e389",
  "#cb8cff",
  "#ff5d73",
];

const LINE_CLEAR_POINTS = [0, 100, 300, 500, 800];

const createEmptyBoard = (): Board =>
  Array.from({ length: BOARD_HEIGHT }, () => Array(BOARD_WIDTH).fill(0));

const cloneMatrix = (matrix: number[][]): number[][] => matrix.map((row) => [...row]);

const rotateMatrixCW = (matrix: number[][]): number[][] => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rotated[col][rows - 1 - row] = matrix[row][col];
    }
  }

  return rotated;
};

const rotateMatrixCCW = (matrix: number[][]): number[][] => {
  const rows = matrix.length;
  const cols = matrix[0].length;
  const rotated = Array.from({ length: cols }, () => Array(rows).fill(0));

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      rotated[cols - 1 - col][row] = matrix[row][col];
    }
  }

  return rotated;
};

const isValidPosition = (
  board: Board,
  shape: number[][],
  x: number,
  y: number,
): boolean => {
  for (let row = 0; row < shape.length; row += 1) {
    for (let col = 0; col < shape[row].length; col += 1) {
      if (!shape[row][col]) {
        continue;
      }

      const boardX = x + col;
      const boardY = y + row;

      if (boardX < 0 || boardX >= BOARD_WIDTH || boardY >= BOARD_HEIGHT) {
        return false;
      }

      if (boardY >= 0 && board[boardY][boardX] !== 0) {
        return false;
      }
    }
  }

  return true;
};

const mergePiece = (board: Board, piece: Piece): Board => {
  const merged = board.map((row) => [...row]);

  for (let row = 0; row < piece.shape.length; row += 1) {
    for (let col = 0; col < piece.shape[row].length; col += 1) {
      if (!piece.shape[row][col]) {
        continue;
      }

      const boardX = piece.x + col;
      const boardY = piece.y + row;
      if (boardY >= 0) {
        merged[boardY][boardX] = piece.kind;
      }
    }
  }

  return merged;
};

const clearCompletedLines = (board: Board): { board: Board; cleared: number } => {
  const remainingRows = board.filter((row) => row.some((cell) => cell === 0));
  const cleared = BOARD_HEIGHT - remainingRows.length;

  while (remainingRows.length < BOARD_HEIGHT) {
    remainingRows.unshift(Array(BOARD_WIDTH).fill(0));
  }

  return { board: remainingRows, cleared };
};

const getDropIntervalMs = (level: number): number => Math.max(90, 820 - (level - 1) * 65);

const drawCell = (
  ctx: CanvasRenderingContext2D,
  boardX: number,
  boardY: number,
  color: string,
  alpha = 1,
): void => {
  const x = BOARD_OFFSET_X + boardX * CELL_SIZE;
  const y = BOARD_OFFSET_Y + boardY * CELL_SIZE;

  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.fillRect(x, y, CELL_SIZE - 1, CELL_SIZE - 1);
  ctx.globalAlpha = 1;
};

const drawPreviewCell = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
): void => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, PREVIEW_CELL_SIZE - 1, PREVIEW_CELL_SIZE - 1);
};

export const Tetris = ({
  onExit,
  highScore,
  onHighScore,
  soundEnabled,
  onToggleSound,
}: GameProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef(0);
  const dropAccumulatorRef = useRef(0);
  const audioRef = useRef<AudioContext | null>(null);

  const boardRef = useRef<Board>(createEmptyBoard());
  const pieceRef = useRef<Piece | null>(null);
  const nextKindRef = useRef(1);
  const bagRef = useRef<number[]>([]);

  const scoreRef = useRef(0);
  const linesRef = useRef(0);
  const levelRef = useRef(1);
  const renderedScoreRef = useRef(0);
  const renderedLinesRef = useRef(0);
  const renderedLevelRef = useRef(1);

  const currentHighScoreRef = useRef(highScore);
  const onHighScoreRef = useRef(onHighScore);
  const isPausedRef = useRef(false);
  const isGameOverRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  const [score, setScore] = useState(0);
  const [lines, setLines] = useState(0);
  const [level, setLevel] = useState(1);
  const [nextPieceName, setNextPieceName] = useState(PIECE_DEFS[0].name);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  currentHighScoreRef.current = highScore;
  onHighScoreRef.current = onHighScore;
  isPausedRef.current = isPaused;
  isGameOverRef.current = isGameOver;
  soundEnabledRef.current = soundEnabled;

  const statusText = useMemo(() => {
    if (isGameOver) {
      return "Game Over";
    }

    if (isPaused) {
      return "Paused";
    }

    return "Live";
  }, [isGameOver, isPaused]);

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

  const drawKindFromBag = useCallback((): number => {
    if (bagRef.current.length === 0) {
      const freshBag = [1, 2, 3, 4, 5, 6, 7];
      for (let index = freshBag.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [freshBag[index], freshBag[swapIndex]] = [freshBag[swapIndex], freshBag[index]];
      }
      bagRef.current = freshBag;
    }

    return bagRef.current.pop() ?? 1;
  }, []);

  const pushScoreState = useCallback((nextScore: number) => {
    scoreRef.current = nextScore;
    if (renderedScoreRef.current !== nextScore) {
      renderedScoreRef.current = nextScore;
      setScore(nextScore);
    }
  }, []);

  const pushLinesAndLevelState = useCallback((nextLines: number, nextLevel: number) => {
    linesRef.current = nextLines;
    levelRef.current = nextLevel;

    if (renderedLinesRef.current !== nextLines) {
      renderedLinesRef.current = nextLines;
      setLines(nextLines);
    }

    if (renderedLevelRef.current !== nextLevel) {
      renderedLevelRef.current = nextLevel;
      setLevel(nextLevel);
    }
  }, []);

  const endGame = useCallback(() => {
    if (isGameOverRef.current) {
      return;
    }

    isGameOverRef.current = true;
    isPausedRef.current = false;
    setIsGameOver(true);
    setIsPaused(false);
    playTone(130, 0.32, "sawtooth", 0.055);

    const finalScore = scoreRef.current;
    if (finalScore > currentHighScoreRef.current) {
      onHighScoreRef.current(finalScore);
    }
  }, [playTone]);

  const spawnPiece = useCallback(() => {
    const activeKind = nextKindRef.current;
    const upcomingKind = drawKindFromBag();
    nextKindRef.current = upcomingKind;
    setNextPieceName(PIECE_DEFS[upcomingKind - 1].name);

    const shape = cloneMatrix(PIECE_DEFS[activeKind - 1].shape);
    const x = Math.floor((BOARD_WIDTH - shape[0].length) / 2);
    const y = -shape.length;

    if (!isValidPosition(boardRef.current, shape, x, y)) {
      pieceRef.current = null;
      endGame();
      return;
    }

    pieceRef.current = { kind: activeKind, shape, x, y };
  }, [drawKindFromBag, endGame]);

  const hardReset = useCallback(() => {
    boardRef.current = createEmptyBoard();
    bagRef.current = [];
    nextKindRef.current = drawKindFromBag();
    setNextPieceName(PIECE_DEFS[nextKindRef.current - 1].name);

    pushScoreState(0);
    pushLinesAndLevelState(0, 1);

    renderedScoreRef.current = 0;
    renderedLinesRef.current = 0;
    renderedLevelRef.current = 1;

    lastFrameTimeRef.current = 0;
    dropAccumulatorRef.current = 0;
    isPausedRef.current = false;
    isGameOverRef.current = false;

    setIsPaused(false);
    setIsGameOver(false);

    spawnPiece();
  }, [drawKindFromBag, pushLinesAndLevelState, pushScoreState, spawnPiece]);

  const attemptMove = useCallback((dx: number, dy: number): boolean => {
    const piece = pieceRef.current;
    if (!piece) {
      return false;
    }

    const nextX = piece.x + dx;
    const nextY = piece.y + dy;

    if (!isValidPosition(boardRef.current, piece.shape, nextX, nextY)) {
      return false;
    }

    piece.x = nextX;
    piece.y = nextY;
    return true;
  }, []);

  const lockPiece = useCallback(() => {
    const piece = pieceRef.current;
    if (!piece) {
      return;
    }

    boardRef.current = mergePiece(boardRef.current, piece);
    const { board, cleared } = clearCompletedLines(boardRef.current);
    boardRef.current = board;

    if (cleared > 0) {
      const nextLines = linesRef.current + cleared;
      const nextLevel = 1 + Math.floor(nextLines / 10);
      const linePoints = LINE_CLEAR_POINTS[cleared] * nextLevel;
      pushScoreState(scoreRef.current + linePoints);
      pushLinesAndLevelState(nextLines, nextLevel);
      playTone(620 + cleared * 80, 0.1, "triangle", 0.026);
    }

    spawnPiece();
  }, [playTone, pushLinesAndLevelState, pushScoreState, spawnPiece]);

  const moveHorizontal = useCallback(
    (direction: -1 | 1) => {
      if (isPausedRef.current || isGameOverRef.current) {
        return;
      }

      if (attemptMove(direction, 0)) {
        playTone(420, 0.018, "triangle", 0.01);
      }
    },
    [attemptMove, playTone],
  );

  const rotatePiece = useCallback(
    (direction: -1 | 1) => {
      if (isPausedRef.current || isGameOverRef.current) {
        return;
      }

      const piece = pieceRef.current;
      if (!piece) {
        return;
      }

      const rotated =
        direction === 1 ? rotateMatrixCW(piece.shape) : rotateMatrixCCW(piece.shape);

      const kicks = [0, -1, 1, -2, 2];
      for (const offset of kicks) {
        const targetX = piece.x + offset;
        if (isValidPosition(boardRef.current, rotated, targetX, piece.y)) {
          piece.shape = rotated;
          piece.x = targetX;
          playTone(560, 0.03, "triangle", 0.013);
          return;
        }
      }

      playTone(180, 0.03, "sawtooth", 0.012);
    },
    [playTone],
  );

  const softDrop = useCallback(() => {
    if (isPausedRef.current || isGameOverRef.current) {
      return;
    }

    if (attemptMove(0, 1)) {
      dropAccumulatorRef.current = 0;
      pushScoreState(scoreRef.current + 1);
      return;
    }

    lockPiece();
  }, [attemptMove, lockPiece, pushScoreState]);

  const hardDrop = useCallback(() => {
    if (isPausedRef.current || isGameOverRef.current) {
      return;
    }

    let droppedRows = 0;
    while (attemptMove(0, 1)) {
      droppedRows += 1;
    }

    if (droppedRows > 0) {
      pushScoreState(scoreRef.current + droppedRows * 2);
      playTone(730, 0.05, "triangle", 0.022);
    }

    lockPiece();
  }, [attemptMove, lockPiece, playTone, pushScoreState]);

  const togglePause = useCallback(() => {
    if (isGameOverRef.current) {
      return;
    }

    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      playTone(next ? 340 : 520, 0.04, "triangle", 0.018);
      return next;
    });
  }, [playTone]);

  useEffect(() => {
    hardReset();
  }, [hardReset]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();

      if (
        key === "arrowleft" ||
        key === "arrowright" ||
        key === "arrowdown" ||
        key === "arrowup" ||
        key === " "
      ) {
        event.preventDefault();
      }

      if (key === "p") {
        event.preventDefault();
        togglePause();
        return;
      }

      if (key === "r") {
        event.preventDefault();
        playTone(710, 0.03, "triangle", 0.015);
        hardReset();
        return;
      }

      if (key === " ") {
        if (isGameOverRef.current) {
          playTone(710, 0.03, "triangle", 0.015);
          hardReset();
          return;
        }

        hardDrop();
        return;
      }

      if (key === "arrowleft" || key === "a") {
        moveHorizontal(-1);
        return;
      }

      if (key === "arrowright" || key === "d") {
        moveHorizontal(1);
        return;
      }

      if (key === "arrowdown" || key === "s") {
        softDrop();
        return;
      }

      if (key === "arrowup" || key === "x" || key === "w") {
        rotatePiece(1);
        return;
      }

      if (key === "z") {
        rotatePiece(-1);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [hardDrop, hardReset, moveHorizontal, playTone, rotatePiece, softDrop, togglePause]);

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
      context.fillStyle = "#081018";
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      const boardPixelWidth = BOARD_WIDTH * CELL_SIZE;
      const boardPixelHeight = BOARD_HEIGHT * CELL_SIZE;

      context.fillStyle = "#0d1a26";
      context.fillRect(BOARD_OFFSET_X, BOARD_OFFSET_Y, boardPixelWidth, boardPixelHeight);

      context.strokeStyle = "rgba(128, 214, 255, 0.11)";
      context.lineWidth = 1;
      for (let x = 0; x <= BOARD_WIDTH; x += 1) {
        const lineX = BOARD_OFFSET_X + x * CELL_SIZE;
        context.beginPath();
        context.moveTo(lineX + 0.5, BOARD_OFFSET_Y);
        context.lineTo(lineX + 0.5, BOARD_OFFSET_Y + boardPixelHeight);
        context.stroke();
      }

      for (let y = 0; y <= BOARD_HEIGHT; y += 1) {
        const lineY = BOARD_OFFSET_Y + y * CELL_SIZE;
        context.beginPath();
        context.moveTo(BOARD_OFFSET_X, lineY + 0.5);
        context.lineTo(BOARD_OFFSET_X + boardPixelWidth, lineY + 0.5);
        context.stroke();
      }

      for (let row = 0; row < BOARD_HEIGHT; row += 1) {
        for (let col = 0; col < BOARD_WIDTH; col += 1) {
          const cell = boardRef.current[row][col];
          if (cell !== 0) {
            drawCell(context, col, row, CELL_COLORS[cell]);
          }
        }
      }

      const activePiece = pieceRef.current;
      if (activePiece) {
        let ghostY = activePiece.y;
        while (
          isValidPosition(
            boardRef.current,
            activePiece.shape,
            activePiece.x,
            ghostY + 1,
          )
        ) {
          ghostY += 1;
        }

        for (let row = 0; row < activePiece.shape.length; row += 1) {
          for (let col = 0; col < activePiece.shape[row].length; col += 1) {
            if (!activePiece.shape[row][col]) {
              continue;
            }

            const boardX = activePiece.x + col;
            const boardY = ghostY + row;
            if (boardY >= 0) {
              drawCell(context, boardX, boardY, CELL_COLORS[activePiece.kind], 0.22);
            }
          }
        }

        for (let row = 0; row < activePiece.shape.length; row += 1) {
          for (let col = 0; col < activePiece.shape[row].length; col += 1) {
            if (!activePiece.shape[row][col]) {
              continue;
            }

            const boardX = activePiece.x + col;
            const boardY = activePiece.y + row;
            if (boardY >= 0) {
              drawCell(context, boardX, boardY, CELL_COLORS[activePiece.kind]);
            }
          }
        }
      }

      const sideX = BOARD_OFFSET_X + boardPixelWidth + 16;
      context.fillStyle = "rgba(233, 247, 255, 0.92)";
      context.font = "600 14px 'Space Grotesk', sans-serif";
      context.fillText("Next", sideX, BOARD_OFFSET_Y + 16);

      const previewKind = nextKindRef.current;
      const previewShape = PIECE_DEFS[previewKind - 1].shape;
      for (let row = 0; row < previewShape.length; row += 1) {
        for (let col = 0; col < previewShape[row].length; col += 1) {
          if (!previewShape[row][col]) {
            continue;
          }

          const px = sideX + col * PREVIEW_CELL_SIZE;
          const py = BOARD_OFFSET_Y + 28 + row * PREVIEW_CELL_SIZE;
          drawPreviewCell(context, px, py, CELL_COLORS[previewKind]);
        }
      }

      context.fillStyle = "rgba(183, 214, 232, 0.85)";
      context.font = "500 12px 'Space Grotesk', sans-serif";
      context.fillText("Controls", sideX, BOARD_OFFSET_Y + 120);
      context.fillText("<- -> move", sideX, BOARD_OFFSET_Y + 142);
      context.fillText("up / x rotate", sideX, BOARD_OFFSET_Y + 160);
      context.fillText("down soft drop", sideX, BOARD_OFFSET_Y + 178);
      context.fillText("space hard drop", sideX, BOARD_OFFSET_Y + 196);
      context.fillText("p pause", sideX, BOARD_OFFSET_Y + 214);
    };

    const frame = (time: number) => {
      if (!lastFrameTimeRef.current) {
        lastFrameTimeRef.current = time;
      }

      const deltaMs = Math.min(64, time - lastFrameTimeRef.current);
      lastFrameTimeRef.current = time;

      if (!isPausedRef.current && !isGameOverRef.current) {
        dropAccumulatorRef.current += deltaMs;
        const dropIntervalMs = getDropIntervalMs(levelRef.current);

        while (dropAccumulatorRef.current >= dropIntervalMs) {
          dropAccumulatorRef.current -= dropIntervalMs;
          if (!attemptMove(0, 1)) {
            lockPiece();
            break;
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
  }, [attemptMove, lockPiece]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        void audioRef.current.close();
      }
    };
  }, []);

  return (
    <main className="app-shell in-game">
      <section className="game-view">
        <div className="toolbar">
          <button type="button" className="ghost" onClick={onExit}>
            Back To Hub
          </button>
          <button
            type="button"
            className="ghost"
            disabled={isGameOver}
            onClick={togglePause}
          >
            {isPaused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="ghost" onClick={onToggleSound}>
            Sound: {soundEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              playTone(710, 0.03, "triangle", 0.015);
              hardReset();
            }}
          >
            Restart
          </button>
        </div>

        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          className="game-canvas tetris-canvas"
          aria-label="Tetris game canvas"
        />

        <div className="game-hud">
          <p>Status: {statusText}</p>
          <p>
            Score: <strong>{score}</strong>
          </p>
          <p>
            Lines: <strong>{lines}</strong>
          </p>
          <p>
            Level: <strong>{level}</strong>
          </p>
          <p>
            High: <strong>{highScore}</strong>
          </p>
          <p>
            Next: <strong>{nextPieceName}</strong>
          </p>
        </div>

        <div className="touch-controls" aria-label="Touch controls">
          <button type="button" className="ghost" onClick={() => moveHorizontal(-1)}>
            Left
          </button>
          <button type="button" className="ghost" onClick={() => moveHorizontal(1)}>
            Right
          </button>
          <button type="button" className="ghost" onClick={() => rotatePiece(1)}>
            Rotate
          </button>
          <button type="button" className="ghost" onClick={softDrop}>
            Down
          </button>
          <button type="button" className="ghost" onClick={hardDrop}>
            Drop
          </button>
        </div>

        {isGameOver ? (
          <div className="overlay">
            <h2>Stack Locked</h2>
            <p>
              Final Score <strong>{score}</strong>
            </p>
            <div className="overlay__actions">
              <button
                type="button"
                className="cta"
                onClick={() => {
                  playTone(710, 0.03, "triangle", 0.015);
                  hardReset();
                }}
              >
                Play Again
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
