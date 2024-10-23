const gameService = require("../services/gameService");

exports.createGame = async (req, res, next) => {
  try {
    const userId = req.session.userId;
    const game = await gameService.createGame(userId);
    res.status(201).json({ gameId: game._id });
  } catch (error) {
    next(error);
  }
};

exports.joinGame = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    const userId = req.session.userId;
    await gameService.joinGame(gameId, userId);
    res.json({ message: "Joined game successfully" });
  } catch (error) {
    next(error);
  }
};

exports.startGame = async (req, res, next) => {
  try {
    const { gameId } = req.params;
    await gameService.startGame(gameId);
    res.json({ message: "Game started successfully" });
  } catch (error) {
    next(error);
  }
};
