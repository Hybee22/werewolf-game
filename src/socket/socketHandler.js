const Game = require("../models/Game");
const User = require("../models/User");
const gameService = require("../services/gameService");
const GameStateManager = require("../services/gameStateManager");

const gameStateManager = new GameStateManager();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("joinGame", async ({ gameId, userId }) => {
      try {
        // Get or create game manager
        let gameManager = await gameService.getGameManager(gameId, io);

        if (gameManager) {
          const player = await gameService.joinGame(gameId, userId);
          socket.join(gameId);
          await gameService.updatePlayerSocket(gameId, userId, socket.id);
          io.to(gameId).emit("playerJoined", { playerId: player._id });
          // Emit chat history to the newly joined player
          const game = await Game.findOne({ _id: gameId });
          socket.emit("chatHistory", game.messages);
        }

        const user = await User.findOne({ _id: userId }).select("username");
        console.log(`Player ${user.username} joined game ${gameId}`);
      } catch (error) {
        console.log(`Error joining game: ${error.message}`);
        socket.emit("error", error.message);
      }
    });

    socket.on("startGame", async ({ gameId }) => {
      try {
        const gameManager = await gameService.getGameManager(gameId, io);
        if (gameManager) {
          await gameService.startGame(gameId, io);
          console.log(`Game ${gameId} started`);
        } else {
          throw new Error("Game not found");
        }
      } catch (error) {
        console.log(error);
        console.log(`Error starting game: ${error.message}`);
        socket.emit("error", error.message);
      }
    });

    socket.on("werewolfAction", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleWerewolfAction(playerId, targetId);
        console.log(
          `Werewolf action in game ${gameId}: ${playerId} targeting ${targetId}`
        );
      } else {
        console.log(`Werewolf action failed: Game ${gameId} not found`);
      }
    });

    socket.on("seerAction", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleSeerAction(playerId, targetId);
        console.log(
          `Seer action in game ${gameId}: ${playerId} targeting ${targetId}`
        );
      } else {
        console.log(`Seer action failed: Game ${gameId} not found`);
      }
    });

    socket.on("doctorAction", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleDoctorAction(playerId, targetId);
        console.log(
          `Doctor action in game ${gameId}: ${playerId} targeting ${targetId}`
        );
      } else {
        console.log(`Doctor action failed: Game ${gameId} not found`);
      }
    });

    socket.on("vote", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleVote(playerId, targetId);
        console.log(
          `Vote in game ${gameId}: ${playerId} voting for ${targetId}`
        );
      } else {
        console.log(`Vote failed: Game ${gameId} not found`);
      }
    });

    socket.on(
      "sendMessage",
      async ({ gameId, playerId, message, isWhisper, targetId }) => {
        try {
          const gameManager = await gameService.getGameManager(gameId, io);
          if (gameManager) {
            await gameStateManager.handleChatMessage(io, {
              gameId,
              playerId,
              message,
              isWhisper,
              targetId,
            });
          } else {
            console.log(`Chat message failed: Game ${gameId} not found`);
            socket.emit("error", "Game not found");
          }
        } catch (error) {
          console.log(`Error sending chat message: ${error.message}`);
          socket.emit("error", error.message);
        }
      }
    );

    socket.on("disconnect", () => {
      console.log("Client disconnected");
      gameService.handlePlayerDisconnect(socket.id);
    });

    socket.on("joinAsSpectator", async ({ gameId, userId }) => {
      try {
        const gameManager = await gameService.getGameManager(gameId, io);
        if (gameManager) {
          await gameManager.addSpectator(gameId, userId);
          socket.join(gameId);
          socket.emit("joinedAsSpectator", { gameId });
        } else {
          socket.emit("error", "Game not found");
        }
      } catch (error) {
        console.log(`Error joining as spectator: ${error.message}`);
        socket.emit("error", error.message);
      }
    });

    socket.on("leaveAsSpectator", async ({ gameId, userId }) => {
      try {
        const gameManager = await gameService.getGameManager(gameId, io);
        if (gameManager) {
<<<<<<< Updated upstream
          gameManager.removeSpectator(userId);
=======
          await gameStateManager.removeSpectator(gameId, userId);
>>>>>>> Stashed changes
          socket.leave(gameId);
          socket.emit("leftAsSpectator", { gameId });
        }
      } catch (error) {
        console.log(`Error leaving as spectator: ${error.message}`);
        socket.emit("error", error.message);
      }
    });

    // Bodyguard action handler
    socket.on("bodyguardAction", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleBodyguardAction(playerId, targetId);
        console.log(
          `Bodyguard action in game ${gameId}: ${playerId} targeting ${targetId}`
        );
      } else {
        console.log(`Bodyguard action failed: Game ${gameId} not found`);
      }
    });

    // Witch action handler
    socket.on("witchAction", async ({ gameId, playerId, action, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleWitchAction(playerId, { action, targetId });
        console.log(
          `Witch action in game ${gameId}: ${playerId} using ${action} on ${targetId}`
        );
      } else {
        console.log(`Witch action failed: Game ${gameId} not found`);
      }
    });

    // Hunter action handler
    socket.on("hunterAction", async ({ gameId, hunterId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        await gameStateManager.handleHunterAction(hunterId, targetId);
        console.log(
          `Hunter action in game ${gameId}: ${hunterId} targeting ${targetId}`
        );
      } else {
        console.log(`Hunter action failed: Game ${gameId} not found`);
      }
    });
  });
};
