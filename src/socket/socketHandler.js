const gameService = require("../services/gameService");
const GameStateManager = require("../services/gameStateManager");

const gameStateManager = new GameStateManager();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("New client connected");

    socket.on("joinGame", async ({ gameId, userId }) => {
      try {
        await gameService.joinGame(gameId, userId);
        socket.join(gameId);
        await gameService.updatePlayerSocket(gameId, userId, socket.id);
        io.to(gameId).emit("playerJoined", { userId });

        // Get or create game manager
        // let gameManager = await gameService.getGameManager(gameId, io);

        console.log(`Player ${userId} joined game ${gameId}`);
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
        console.log(error)
        console.log(`Error starting game: ${error.message}`);
        socket.emit("error", error.message);
      }
    });

    socket.on("werewolfAction", async ({ gameId, playerId, targetId }) => {
      const gameManager = await gameService.getGameManager(gameId, io);
      if (gameManager) {
        gameStateManager.handleWerewolfAction(playerId, targetId);
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
        gameStateManager.handleSeerAction(playerId, targetId);
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
        gameStateManager.handleDoctorAction(playerId, targetId);
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
        gameStateManager.handleVote(playerId, targetId);
        console.log(
          `Vote in game ${gameId}: ${playerId} voting for ${targetId}`
        );
      } else {
        console.log(`Vote failed: Game ${gameId} not found`);
      }
    });

    socket.on("disconnect", () => {
      console.log("Client disconnected");
      gameService.handlePlayerDisconnect(socket.id);
    });
  });
};
