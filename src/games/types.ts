export type GameProps = {
  onExit: () => void;
  highScore: number;
  onHighScore: (nextScore: number) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
};
