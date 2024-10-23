const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  id: String,
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  isStarted: Boolean,
  currentPhase: String,
  roles: [String],
  isEnded: { type: Boolean, default: false },
  winner: { type: String, enum: ['villagers', 'werewolves', 'draw'] },
  endedAt: { type: Date }
});

module.exports = mongoose.model('Game', gameSchema);
