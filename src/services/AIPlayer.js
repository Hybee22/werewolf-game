class AIPlayer {
  constructor(playerId, role) {
    this.playerId = playerId;
    this.role = role;
    this.memory = new Set(); // To store information the AI has learned
  }

  async makeDecision(gameState) {
    switch (this.role) {
      case 'werewolf':
        return this.werewolfDecision(gameState);
      case 'villager':
        return this.villagerDecision(gameState);
      case 'seer':
        return this.seerDecision(gameState);
      case 'doctor':
        return this.doctorDecision(gameState);
      case 'bodyguard':
        return this.bodyguardDecision(gameState);
      case 'witch':
        return this.witchDecision(gameState);
      case 'hunter':
        return this.hunterDecision(gameState);
      default:
        throw new Error(`Unknown role: ${this.role}`);
    }
  }

  werewolfDecision(gameState) {
    // Logic for werewolf to choose a target
    const alivePlayers = gameState.players.filter(p => p.isAlive && p.role !== 'werewolf');
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  villagerDecision(gameState) {
    // Logic for villager to vote during the day
    const suspects = gameState.players.filter(p => p.isAlive && p.id !== this.playerId);
    return suspects[Math.floor(Math.random() * suspects.length)].id;
  }

  seerDecision(gameState) {
    // Logic for seer to choose a player to investigate
    const unknownPlayers = gameState.players.filter(p => p.isAlive && !this.memory.has(p.id));
    return unknownPlayers[Math.floor(Math.random() * unknownPlayers.length)].id;
  }

  doctorDecision(gameState) {
    // Logic for doctor to choose a player to protect
    const alivePlayers = gameState.players.filter(p => p.isAlive);
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  bodyguardDecision(gameState) {
    // Logic for bodyguard to choose a player to protect
    const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== this.playerId);
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }

  witchDecision(gameState) {
    // Logic for witch to decide whether to use potions
    // This is a simplified version; you might want to make it more sophisticated
    if (Math.random() < 0.5) {
      return { action: 'heal', targetId: gameState.nightActions.werewolf };
    } else {
      const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== this.playerId);
      return { action: 'kill', targetId: alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id };
    }
  }

  hunterDecision(gameState) {
    // Logic for hunter to choose a target when eliminated
    const alivePlayers = gameState.players.filter(p => p.isAlive && p.id !== this.playerId);
    return alivePlayers[Math.floor(Math.random() * alivePlayers.length)].id;
  }
}

module.exports = AIPlayer;
