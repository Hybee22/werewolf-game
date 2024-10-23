const connectDB = require("./src/config/database");
const socketIo = require("socket.io");
const app = require("./src/app");
const socketHandler = require("./src/socket/socketHandler");

require("dotenv").config();
const port = process.env.PORT || 3000;

connectDB();

const server = app.listen(port, () =>
  console.log(`Server running on port ${port}`)
);
const io = socketIo(server);

socketHandler(io);
