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
  if (!game) {
    throw new Error("Game not found");
  }

  if (game.isStarted) {
    throw new Error("Game has already started");
  }

  // Check if the player is already in the game
  const existingPlayer = await Player.findOne({ userId, gameId: game._id });
  if (existingPlayer) {
    return existingPlayer; // Return the existing player record
  }

  // If the player is not in the game, create a new player
  const newPlayer = new Player({ userId, gameId: game._id });
  const savedPlayer = await newPlayer.save();

  // Add the new player to the game
  game.players.push(savedPlayer._id);
  await game.save();

  return savedPlayer;
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
  if (!gameManagers.has(gameId)) {
    const gameManager = new GameStateManager(gameId, io);
    await gameManager.initialize();
    gameManagers.set(gameId, gameManager);
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
