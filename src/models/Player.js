const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
  role: String,
  socketId: String,
  isConnected: { type: Boolean, default: true },
  isAlive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Player', playerSchema);
