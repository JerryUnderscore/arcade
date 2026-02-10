import type { GameDefinition, GameId } from "../games/registry";

type HubProps = {
  games: readonly GameDefinition[];
  highScores: Record<GameId, number>;
  onStartGame: (gameId: GameId) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
};

export const Hub = ({
  games,
  highScores,
  onStartGame,
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
        {games.map((game) => (
          <article key={game.id} className="game-card">
            <div className="game-card__meta">
              <p className="game-card__label">{game.label}</p>
              <h2>{game.title}</h2>
              <p className="game-card__description">{game.description}</p>
            </div>
            <div className="game-card__stats">
              <p>
                High Score <strong>{highScores[game.id]}</strong>
              </p>
              <button type="button" className="ghost" onClick={onToggleSound}>
                Sound: {soundEnabled ? "On" : "Off"}
              </button>
            </div>
            <button
              type="button"
              className="cta"
              onClick={() => onStartGame(game.id)}
            >
              {game.ctaLabel}
            </button>
          </article>
        ))}
      </section>
    </main>
  );
};
