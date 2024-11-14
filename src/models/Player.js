const mongoose = require('mongoose');

const playerSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return !this.isAI; // userId is only required for non-AI players
    }
  },
  username: String,
  isAI: { type: Boolean, default: false },
  isAlive: { type: Boolean, default: true },
  isConnected: { type: Boolean, default: true },
  role: String,
  gameId: { type: mongoose.Schema.Types.ObjectId, ref: 'Game' },
  socketId: String,
  potions: {
    heal: { type: Boolean, default: true },
    kill: { type: Boolean, default: true }
  }
});

module.exports = mongoose.model('Player', playerSchema);
