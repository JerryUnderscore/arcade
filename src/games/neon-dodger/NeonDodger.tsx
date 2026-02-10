import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GameProps } from "../types";

type Obstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  counted: boolean;
};

type PointerState = {
  active: boolean;
  x: number;
};

type ToneType = OscillatorType;

const CANVAS_WIDTH = 420;
const CANVAS_HEIGHT = 700;
const PLAYER_WIDTH = 56;
const PLAYER_HEIGHT = 24;
const PLAYER_Y = CANVAS_HEIGHT - 90;
const PLAYER_SPEED = 420;

const drawRoundedRect = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) => {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

export const NeonDodger = ({
  onExit,
  highScore,
  onHighScore,
  soundEnabled,
  onToggleSound,
}: GameProps) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const keysRef = useRef<Set<string>>(new Set());
  const pointerRef = useRef<PointerState>({ active: false, x: CANVAS_WIDTH / 2 });
  const audioRef = useRef<AudioContext | null>(null);
  const scoreRef = useRef(0);
  const lastTimeRef = useRef(0);
  const spawnCooldownRef = useRef(0.7);
  const playerXRef = useRef((CANVAS_WIDTH - PLAYER_WIDTH) / 2);
  const obstaclesRef = useRef<Obstacle[]>([]);
  const hasCrashedRef = useRef(false);
  const currentHighScoreRef = useRef(highScore);
  const renderedScoreRef = useRef(0);
  const isPausedRef = useRef(false);
  const soundEnabledRef = useRef(soundEnabled);

  const [score, setScore] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isGameOver, setIsGameOver] = useState(false);

  currentHighScoreRef.current = highScore;
  soundEnabledRef.current = soundEnabled;
  isPausedRef.current = isPaused;

  const statusText = useMemo(() => {
    if (isGameOver) {
      return "Crashed";
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

  const hardReset = () => {
    scoreRef.current = 0;
    lastTimeRef.current = 0;
    spawnCooldownRef.current = 0.7;
    playerXRef.current = (CANVAS_WIDTH - PLAYER_WIDTH) / 2;
    obstaclesRef.current = [];
    hasCrashedRef.current = false;
    renderedScoreRef.current = 0;

    setScore(0);
    setIsPaused(false);
    setIsGameOver(false);
  };

  const crash = () => {
    if (hasCrashedRef.current) {
      return;
    }

    hasCrashedRef.current = true;
    setIsGameOver(true);
    playTone(130, 0.35, "sawtooth", 0.06);

    const finalScore = Math.floor(scoreRef.current);
    if (finalScore > currentHighScoreRef.current) {
      onHighScore(finalScore);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      if (key === "p") {
        event.preventDefault();
        if (!hasCrashedRef.current) {
          setIsPaused((prev) => !prev);
          playTone(500, 0.05, "triangle", 0.02);
        }
        return;
      }

      if (key === " ") {
        event.preventDefault();
        if (hasCrashedRef.current) {
          hardReset();
        }
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
  }, [playTone]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const getPointerX = (clientX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const normalized = ((clientX - rect.left) / rect.width) * CANVAS_WIDTH;
      return Math.max(0, Math.min(CANVAS_WIDTH, normalized));
    };

    const onPointerDown = (event: PointerEvent) => {
      pointerRef.current.active = true;
      pointerRef.current.x = getPointerX(event.clientX);
      playTone(720, 0.03, "triangle", 0.015);
    };

    const onPointerMove = (event: PointerEvent) => {
      if (!pointerRef.current.active) {
        return;
      }

      pointerRef.current.x = getPointerX(event.clientX);
    };

    const onPointerUp = () => {
      pointerRef.current.active = false;
    };

    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };
  }, [playTone]);

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
      const bg = context.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bg.addColorStop(0, "#0f1724");
      bg.addColorStop(1, "#081017");
      context.fillStyle = bg;
      context.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      context.strokeStyle = "rgba(92, 236, 255, 0.08)";
      context.lineWidth = 1;
      for (let y = 0; y < CANVAS_HEIGHT; y += 30) {
        context.beginPath();
        context.moveTo(0, y);
        context.lineTo(CANVAS_WIDTH, y);
        context.stroke();
      }

      context.save();
      context.shadowColor = "rgba(255, 93, 61, 0.8)";
      context.shadowBlur = 14;
      context.fillStyle = "#ff5d3d";
      for (const obstacle of obstaclesRef.current) {
        drawRoundedRect(
          context,
          obstacle.x,
          obstacle.y,
          obstacle.width,
          obstacle.height,
          6,
        );
        context.fill();
      }
      context.restore();

      context.save();
      context.shadowColor = "rgba(86, 244, 255, 0.85)";
      context.shadowBlur = 16;
      context.fillStyle = "#56f4ff";
      drawRoundedRect(
        context,
        playerXRef.current,
        PLAYER_Y,
        PLAYER_WIDTH,
        PLAYER_HEIGHT,
        8,
      );
      context.fill();
      context.restore();

      context.fillStyle = "rgba(238, 249, 255, 0.9)";
      context.font = "500 16px 'Space Grotesk', sans-serif";
      context.fillText(`Score ${renderedScoreRef.current}`, 16, 30);
      context.fillText(`High ${currentHighScoreRef.current}`, CANVAS_WIDTH - 116, 30);
    };

    const intersects = (a: Obstacle): boolean => {
      const playerLeft = playerXRef.current;
      const playerRight = playerXRef.current + PLAYER_WIDTH;
      const playerTop = PLAYER_Y;
      const playerBottom = PLAYER_Y + PLAYER_HEIGHT;

      const obstacleLeft = a.x;
      const obstacleRight = a.x + a.width;
      const obstacleTop = a.y;
      const obstacleBottom = a.y + a.height;

      const overlapX = playerLeft < obstacleRight && playerRight > obstacleLeft;
      const overlapY = playerTop < obstacleBottom && playerBottom > obstacleTop;
      return overlapX && overlapY;
    };

    const update = (delta: number) => {
      if (isPausedRef.current || hasCrashedRef.current) {
        return;
      }

      let direction = 0;
      if (keysRef.current.has("arrowleft") || keysRef.current.has("a")) {
        direction -= 1;
      }
      if (keysRef.current.has("arrowright") || keysRef.current.has("d")) {
        direction += 1;
      }

      if (pointerRef.current.active) {
        playerXRef.current = pointerRef.current.x - PLAYER_WIDTH / 2;
      } else {
        playerXRef.current += direction * PLAYER_SPEED * delta;
      }

      playerXRef.current = Math.max(
        0,
        Math.min(CANVAS_WIDTH - PLAYER_WIDTH, playerXRef.current),
      );

      spawnCooldownRef.current -= delta;
      if (spawnCooldownRef.current <= 0) {
        const width = 36 + Math.random() * 72;
        const height = 14 + Math.random() * 20;
        obstaclesRef.current.push({
          x: Math.random() * (CANVAS_WIDTH - width),
          y: -height - 8,
          width,
          height,
          speed: 170 + Math.random() * 140,
          counted: false,
        });

        spawnCooldownRef.current =
          Math.max(0.22, 0.65 - scoreRef.current / 260) + Math.random() * 0.25;
      }

      const nextObstacles: Obstacle[] = [];
      for (const obstacle of obstaclesRef.current) {
        const speedRamp = 1 + scoreRef.current / 220;
        obstacle.y += obstacle.speed * speedRamp * delta;

        if (!obstacle.counted && obstacle.y > PLAYER_Y + PLAYER_HEIGHT + 4) {
          obstacle.counted = true;
          scoreRef.current += 3;
          playTone(650 + Math.random() * 180, 0.03, "triangle", 0.02);
        }

        if (intersects(obstacle)) {
          crash();
        }

        if (obstacle.y < CANVAS_HEIGHT + 40) {
          nextObstacles.push(obstacle);
        }
      }

      obstaclesRef.current = nextObstacles;

      scoreRef.current += delta * 8;
      const roundedScore = Math.floor(scoreRef.current);
      if (roundedScore !== renderedScoreRef.current) {
        renderedScoreRef.current = roundedScore;
        setScore(roundedScore);
      }
    };

    const frame = (time: number) => {
      if (!lastTimeRef.current) {
        lastTimeRef.current = time;
      }

      const delta = Math.min(0.05, (time - lastTimeRef.current) / 1000);
      lastTimeRef.current = time;

      update(delta);
      draw();
      animationRef.current = window.requestAnimationFrame(frame);
    };

    animationRef.current = window.requestAnimationFrame(frame);

    return () => {
      if (animationRef.current) {
        window.cancelAnimationFrame(animationRef.current);
      }
    };
  }, [playTone]);

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
            onClick={() => {
              if (!isGameOver) {
                setIsPaused((prev) => !prev);
              }
            }}
            disabled={isGameOver}
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
              playTone(720, 0.03, "triangle", 0.015);
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
          className="game-canvas"
          aria-label="Neon Dodger game canvas"
        />

        <div className="game-hud">
          <p>Status: {statusText}</p>
          <p>
            Score: <strong>{score}</strong>
          </p>
          <p>
            High: <strong>{highScore}</strong>
          </p>
        </div>

        {isGameOver ? (
          <div className="overlay">
            <h2>Run Over</h2>
            <p>
              Final Score <strong>{score}</strong>
            </p>
            <div className="overlay__actions">
              <button
                type="button"
                className="cta"
                onClick={() => {
                  playTone(720, 0.03, "triangle", 0.015);
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
