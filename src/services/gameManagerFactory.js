const GameStateManager = require('./gameStateManager');

class GameManagerFactory {
  constructor() {
    this.games = new Map();
  }

  createGame(gameId, io) {
    const game = new GameStateManager(gameId, io);
    this.games.set(gameId, game);
    return game;
  }

  getGame(gameId) {
    return this.games.get(gameId);
  }

  removeGame(gameId) {
    this.games.delete(gameId);
  }
}

module.exports = new GameManagerFactory();
