const mongoose = require('mongoose');
const dotenv = require('dotenv');

dotenv.config();

const gameSchema = new mongoose.Schema({
  id: String,
  players: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  isStarted: { type: Boolean, default: false },
  currentPhase: String,
  roles: [{
    type: String,
    enum: ['werewolf', 'villager', 'seer', 'doctor', 'bodyguard', 'witch', 'hunter']
  }],
  roleCount: {
    werewolf: { type: Number, default: 2 },
    villager: { type: Number, default: 3 },
    seer: { type: Number, default: 1 },
    doctor: { type: Number, default: 1 },
    bodyguard: { type: Number, default: 0 },
    witch: { type: Number, default: 0 },
    hunter: { type: Number, default: 0 }
  },
  isEnded: { type: Boolean, default: false },
  winner: { type: String, enum: ['villagers', 'werewolves', 'draw'] },
  endedAt: { type: Date },
  nightActions: {
    werewolf: String,
    doctor: String,
    seer: String
  },
  votes: { type: Map, of: String },
  phaseStartTime: Number,
  phaseDuration: Number,
  messages: [{
    playerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' },
    username: String,
    message: String,
    timestamp: Date,
    isWhisper: Boolean,
    whisperTarget: { type: mongoose.Schema.Types.ObjectId, ref: 'Player' }
  }],
  spectators: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  noLynchOption: { type: Boolean, default: true },
  timers: {
    night: { type: Number, default: process.env.NIGHT_PHASE_TIME || 30000 },
    discussion: { type: Number, default: process.env.DISCUSSION_PHASE_TIME || 120000 },
    voting: { type: Number, default: process.env.VOTING_PHASE_TIME || 30000 }
  },
  autoResolve: { type: Boolean, default: false }
});

module.exports = mongoose.model('Game', gameSchema);
