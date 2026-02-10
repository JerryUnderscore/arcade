import { useEffect, useState } from "react";
import { Hub } from "./components/Hub";
import { NeonDodger } from "./games/neon-dodger/NeonDodger";
import { readBoolean, readNumber, writeBoolean, writeNumber } from "./lib/storage";

type GameId = "neon-dodger";

const SOUND_KEY = "arcade:sound";
const HIGH_SCORE_KEY = "arcade:neon-dodger:high-score";

export const App = () => {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [highScore, setHighScore] = useState(0);

  useEffect(() => {
    setSoundEnabled(readBoolean(SOUND_KEY, true));
    setHighScore(readNumber(HIGH_SCORE_KEY, 0));
  }, []);

  const toggleSound = () => {
    setSoundEnabled((prev) => {
      const next = !prev;
      writeBoolean(SOUND_KEY, next);
      return next;
    });
  };

  const handleHighScore = (nextScore: number) => {
    setHighScore((prev) => {
      if (nextScore <= prev) {
        return prev;
      }

      writeNumber(HIGH_SCORE_KEY, nextScore);
      return nextScore;
    });
  };

  if (activeGame === "neon-dodger") {
    return (
      <NeonDodger
        onExit={() => setActiveGame(null)}
        highScore={highScore}
        onHighScore={handleHighScore}
        soundEnabled={soundEnabled}
        onToggleSound={toggleSound}
      />
    );
  }

  return (
    <Hub
      onStartGame={() => setActiveGame("neon-dodger")}
      highScore={highScore}
      soundEnabled={soundEnabled}
      onToggleSound={toggleSound}
    />
  );
};
