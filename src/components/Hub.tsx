type HubProps = {
  onStartGame: () => void;
  highScore: number;
  soundEnabled: boolean;
  onToggleSound: () => void;
};

export const Hub = ({
  onStartGame,
  highScore,
  soundEnabled,
  onToggleSound,
}: HubProps) => {
  return (
    <main className="app-shell">
      <header className="hero">
        <p className="eyebrow">Browser Arcade</p>
        <h1>Arcade Zero</h1>
        <p>
          A modular game hub with shared systems. Start with Neon Dodger and
          keep stacking games.
        </p>
      </header>

      <section className="hub-grid" aria-label="Available games">
        <article className="game-card">
          <div className="game-card__meta">
            <p className="game-card__label">Game 01</p>
            <h2>Neon Dodger</h2>
            <p className="game-card__description">
              Survive the falling hazard field. Controls: arrows/A-D + touch.
            </p>
          </div>
          <div className="game-card__stats">
            <p>
              High Score <strong>{highScore}</strong>
            </p>
            <button type="button" className="ghost" onClick={onToggleSound}>
              Sound: {soundEnabled ? "On" : "Off"}
            </button>
          </div>
          <button type="button" className="cta" onClick={onStartGame}>
            Play Neon Dodger
          </button>
        </article>
      </section>
    </main>
  );
};
