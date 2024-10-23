require("dotenv").config();
const http = require("http");
const socketIo = require("socket.io");
const { app } = require("./App");
const connectDB = require("./config/database");
const socketHandler = require("./socket/socketHandler");

const port = process.env.PORT || 3000;

connectDB();

const server = http.createServer(app);
const io = socketIo(server);

socketHandler(io);

server.listen(port, () => console.log(`Server running on port ${port}`));
