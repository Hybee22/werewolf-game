const dotenv = require("dotenv");
const Game = require("../models/Game");
const Player = require("../models/Player");
const { generateGameId } = require("../helpers/gameHelper");
const GameStateManager = require("./gameStateManager");
const { assignRoles } = require("./roleAssignment");

dotenv.config();

let gameManagers = new Map();

exports.createGame = async ({
  options = {
    noLynch: true,
    timer: { night: 30000, discussion: 120000, voting: 30000 },
    autoResolveActions: false,
    aiPlayerCount: 0,
  },
}) => {
  const gameId = generateGameId();
  const game = new Game({
    id: gameId,
    noLynchOption: options.noLynch,
    timers: {
      night: options.timer.night || process.env.NIGHT_PHASE_TIME,
      discussion: options.timer.discussion || process.env.DISCUSSION_PHASE_TIME,
      voting: options.timer.voting || process.env.VOTING_PHASE_TIME,
    },
    autoResolve: options.autoResolveActions,
    roleCount: options.roleCount || {
      werewolf: 2,
      villager: 10,
      seer: 1,
      doctor: 1,
      bodyguard: 1,
      witch: 1,
      hunter: 1,
    },
  });

  // Create AI players
  for (let i = 0; i < options.aiPlayerCount; i++) {
    const aiPlayer = new Player({
      username: `AI Player ${i + 1}`, // More friendly name
      isAI: true,
      isAlive: true,
      isConnected: true,
      gameId: game._id,
      // Note: we're not setting userId for AI players
    });
    await aiPlayer.save();
    game.players.push(aiPlayer._id);
  }

  // Assign roles to all players (human and AI)
  const assignedRoles = assignRoles(game.players.length, game.roleCount);
  game.players.forEach((player, index) => {
    player.role = assignedRoles[index];
  });

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
