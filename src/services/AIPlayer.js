class AIPlayer {
  constructor(playerId, role) {
    this.playerId = playerId;
    this.role = role;
  }

  async makeDecision(gameState) {
    switch (this.role) {
      case "werewolf":
        return this.werewolfDecision(gameState);
      case "seer":
        return this.seerDecision(gameState);
      case "doctor":
        return this.doctorDecision(gameState);
      case "bodyguard":
        return this.bodyguardDecision(gameState);
      case "witch":
        return this.witchDecision(gameState);
      case "hunter":
        return this.hunterDecision(gameState);
      default:
        return null;
    }
  }

  werewolfDecision(gameState) {
    // Ensure we have the necessary game state
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for werewolf decision');
      return null;
    }

    // Get potential targets (alive players who aren't werewolves)
    const potentialTargets = gameState.players.filter(p => 
      p.isAlive && 
      p.id !== this.playerId && 
      p.role !== 'werewolf'
    );

    if (potentialTargets.length === 0) {
      console.warn('No valid targets for werewolf');
      return null;
    }

    // Choose random target
    const randomTarget = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
    return randomTarget.id;
  }

  seerDecision(gameState) {
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for seer decision');
      return null;
    }

    // Get players we haven't investigated yet
    const potentialTargets = gameState.players.filter(p => 
      p.isAlive && 
      p.id !== this.playerId &&
      !gameState.investigatedPlayers?.includes(p.id)
    );

    if (potentialTargets.length === 0) {
      console.warn('No valid targets for seer');
      return null;
    }

    const randomTarget = potentialTargets[Math.floor(Math.random() * potentialTargets.length)];
    return randomTarget.id;
  }

  doctorDecision(gameState) {
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for doctor decision');
      return null;
    }

    const alivePlayers = gameState.players.filter(p => p.isAlive);
    if (alivePlayers.length === 0) {
      console.warn('No valid targets for doctor');
      return null;
    }

    // Randomly decide whether to heal self (30% chance)
    if (Math.random() < 0.3) {
      return this.playerId;
    }

    const otherPlayers = alivePlayers.filter(p => p.id !== this.playerId);
    const randomTarget = otherPlayers[Math.floor(Math.random() * otherPlayers.length)];
    return randomTarget.id;
  }

  bodyguardDecision(gameState) {
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for bodyguard decision');
      return null;
    }

    // Can't protect the same player twice in a row
    const alivePlayers = gameState.players.filter(p => 
      p.isAlive && 
      p.id !== this.playerId && 
      p.id !== gameState.lastProtectedId
    );

    if (alivePlayers.length === 0) {
      console.warn('No valid targets for bodyguard');
      return null;
    }

    const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    return randomTarget.id;
  }

  hunterDecision(gameState) {
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for hunter decision');
      return null;
    }

    const alivePlayers = gameState.players.filter(p => 
      p.isAlive && 
      p.id !== this.playerId
    );

    if (alivePlayers.length === 0) {
      console.warn('No valid targets for hunter');
      return null;
    }

    const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
    return randomTarget.id;
  }

  witchDecision(gameState) {
    if (!gameState || !gameState.players) {
      console.warn('Invalid game state for witch decision');
      return { action: 'none' };
    }

    const witch = gameState.players.find(p => p.id === this.playerId);
    if (!witch || !witch.potions) {
      console.warn('Witch potions not found');
      return { action: 'none' };
    }

    if (witch.potions.heal && gameState.nightActions?.werewolf) {
      return { 
        action: 'heal', 
        targetId: gameState.nightActions.werewolf 
      };
    }

    if (witch.potions.kill) {
      const alivePlayers = gameState.players.filter(p => 
        p.isAlive && 
        p.id !== this.playerId
      );
      
      if (alivePlayers.length > 0) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        return { 
          action: 'kill', 
          targetId: randomTarget.id 
        };
      }
    }

    return { action: 'none' };
  }
}

module.exports = AIPlayer;
