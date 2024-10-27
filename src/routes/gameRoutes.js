const express = require('express');
const router = express.Router();
const gameController = require('../controllers/gameController');
const { isAuthenticated } = require('../middleware/authMiddleware');

router.post('/create', isAuthenticated, gameController.createGame);

module.exports = router;
