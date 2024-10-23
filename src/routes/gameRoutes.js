const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.post('/create', isAuthenticated, gameController.createGame);
router.post('/:gameId/join', isAuthenticated, gameController.joinGame);
router.post('/:gameId/start', isAuthenticated, gameController.startGame);

module.exports = router;
