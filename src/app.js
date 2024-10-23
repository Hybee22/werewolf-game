const express = require("express");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const authRoutes = require("./routes/authRoutes");
const gameRoutes = require("./routes/gameRoutes");
const { errorHandler } = require("./middleware/errorMiddleware");

const app = express();

app.use(express.json());

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: { secure: process.env.NODE_ENV === "production" },
  })
);

app.use("/api/auth", authRoutes);
app.use("/api/game", gameRoutes);

app.use(errorHandler);

module.exports = app;
