const connectDB = require("./src/config/database");
const socketIo = require("socket.io");
const app = require("./src/app");
const socketHandler = require("./src/socket/socketHandler");
const Game = require("./src/models/Game");
const gameService = require("./src/services/gameService");

require("dotenv").config();
const port = process.env.PORT || 3000;

const startServer = async () => {
  await connectDB();

  const server = app.listen(port, () =>
    console.log(`Server running on port ${port}`)
  );
  const io = socketIo(server);

  const activeGames = await Game.find({ isStarted: true, isEnded: false });
  for (const game of activeGames) {
    await gameService.getGameManager(game._id, io);
  }

  socketHandler(io);
};

startServer();
