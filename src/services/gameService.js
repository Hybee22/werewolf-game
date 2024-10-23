const Game = require("../models/Game");
const Player = require("../models/Player");
const User = require("../models/User");
const { generateGameId } = require("../helpers/gameHelper");
const GameStateManager = require("./gameStateManager");

let gameManagers = new Map();

exports.createGame = async () => {
  const gameId = generateGameId();
  const game = new Game({ id: gameId, isStarted: false });
  await game.save();

  return game;
};

exports.joinGame = async (gameId, userId) => {
  const game = await Game.findOne({ _id: gameId });
  if (!game || game.isStarted) {
    throw new Error("Game not found or already started");
  }

  const player = new Player({ userId, gameId: game._id });
  await player.save();

  game.players.push(player._id);
  await game.save();
};

exports.startGame = async (gameId, io) => {
  const game = await Game.findOne({ _id: gameId }).populate("players");
  if (!game || game.isStarted || game.players.length < 5) {
    throw new Error("Cannot start game");
  }

  const gameManager = new GameStateManager(gameId, io);
  await gameManager.initialize();
  await gameManager.startGame();

  gameManagers.set(gameId, gameManager);
};

exports.getGameManager = async (gameId, io) => {
  const game = await Game.findOne({ _id: gameId });

  if (game) {
    const gameManager = new GameStateManager(gameId, io);
    gameManagers.set(gameId, gameManager);
    return gameManagers.get(gameId);
  }

  return gameManagers.get(gameId);
};

exports.updatePlayerSocket = async (gameId, userId, socketId) => {
  const player = await Player.findOne({ gameId, userId });
  if (player) {
    player.socketId = socketId;
    await player.save();
  }
};

exports.handlePlayerDisconnect = async (socketId) => {
  const player = await Player.findOne({ socketId });
  if (player) {
    const game = await Game.findById(player.gameId);
    if (game && game.isStarted) {
      // Player disconnected during an active game
      player.isConnected = false;
      await player.save();

      const gameManager = gameManagers.get(game._id);
      if (gameManager) {
        // Notify other players about the disconnection
        gameManager.io
          .to(game._id)
          .emit("playerDisconnected", { playerId: player._id });

        // Handle the disconnection in the game state
        gameManager.handlePlayerDisconnect(player);
      }
    } else {
      // Player disconnected from a game lobby or after the game ended
      player.socketId = null;
      await player.save();
    }
  }
};
