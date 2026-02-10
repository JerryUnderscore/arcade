import { useEffect, useState } from "react";
import { Hub } from "./components/Hub";
import { GAME_BY_ID, GAME_DEFINITIONS, type GameId } from "./games/registry";
import { readBoolean, readNumber, writeBoolean, writeNumber } from "./lib/storage";

const SOUND_KEY = "arcade:sound";

const createInitialHighScores = (): Record<GameId, number> =>
  GAME_DEFINITIONS.reduce(
    (accumulator, game) => ({ ...accumulator, [game.id]: 0 }),
    {} as Record<GameId, number>,
  );

export const App = () => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [highScores, setHighScores] = useState<Record<GameId, number>>(() =>
    createInitialHighScores(),
  );

  useEffect(() => {
    setSoundEnabled(readBoolean(SOUND_KEY, true));

    setHighScores(() => {
      const nextScores = createInitialHighScores();
      for (const game of GAME_DEFINITIONS) {
        nextScores[game.id] = readNumber(game.highScoreKey, 0);
      }
      return nextScores;
    });
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      writeBoolean(SOUND_KEY, next);
      return next;
    });
  };

  const handleHighScore = (gameId: GameId, nextScore: number) => {
    setHighScores((prev) => {
      if (nextScore <= prev[gameId]) {
        return prev;
      }

      const key = GAME_BY_ID[gameId].highScoreKey;
      writeNumber(key, nextScore);
      return { ...prev, [gameId]: nextScore };
    });
  };

  if (activeGame) {
    const activeGameDefinition = GAME_BY_ID[activeGame];
    const ActiveGameComponent = activeGameDefinition.component;

    return (
      <ActiveGameComponent
        onExit={() => setActiveGame(null)}
        highScore={highScores[activeGame]}
        onHighScore={(nextScore) => handleHighScore(activeGame, nextScore)}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
    );
  }

  return (
    <Hub
      games={GAME_DEFINITIONS}
      highScores={highScores}
      onStartGame={(gameId) => setActiveGame(gameId)}
      soundEnabled={soundEnabled}
      onToggleSound={toggleSound}
    />
  );
};
