const mongoose = require('mongoose');

const gameSchema = new mongoose.Schema({
  id: String,
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  isStarted: Boolean,
  currentPhase: String,
  roles: [String],
  isEnded: { type: Boolean, default: false },
  winner: { type: String, enum: ['villagers', 'werewolves', 'draw'] },
  endedAt: { type: Date },
  nightActions: {
    werewolf: String,
    doctor: String,
    seer: String
  },
  votes: { type: Map, of: String },
  phaseStartTime: Date,
  phaseDuration: Number,
  messages: [{
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    username: String,
    message: String,
    timestamp: Date,
    isWhisper: Boolean,
    whisperTarget: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' }
  }]
});

module.exports = mongoose.model('Game', gameSchema);
