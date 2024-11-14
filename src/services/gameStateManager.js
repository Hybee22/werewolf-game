const Game = require("../models/Game");
const { shuffle } = require("../helpers/gameHelper");
const dotenv = require("dotenv");
const ProfanityFilter = require("profanity-filter");
const AIPlayer = require("./AIPlayer");
const User = require("../models/User");

dotenv.config();

class GameStateManager {
  constructor(gameId, io) {
    this.gameId = gameId;
    this.io = io;
    this.game = null;
    this.players = [];
    this.currentPhase = "waiting";
    this.phaseTimeout = null;
    this.nightActions = {};
    this.votes = {};

    // Set default timers that will be updated in initialize()
    this.phaseTimers = {
      night: 30000,      // Default 30 seconds
      discussion: 120000, // Default 2 minutes
      voting: 30000      // Default 30 seconds
    };

    // Add these new properties
    this.currentTimer = null;
    this.timerInterval = null;

    // Add role descriptions
    this.roleDescriptions = {
      werewolf:
        "You are a Werewolf. Each night, choose a villager to eliminate. Work with other werewolves to outnumber the villagers.",
      villager:
        "You are a Villager. Use your wit and intuition to identify the werewolves and vote them out during the day.",
      seer: "You are the Seer. Each night, you can choose one player to learn their true role. Use this information to help the villagers.",
      doctor:
        "You are the Doctor. Each night, choose a player to protect. If the werewolves target that player, they will survive.",
      bodyguard:
        "You are the Bodyguard. Each night, choose a player to protect from elimination.",
      witch:
        "You are the Witch. You have two potions - one to save a player, one to eliminate a player.",
      hunter:
        "You are the Hunter. If eliminated, you can choose to eliminate another player.",
    };

    this.listeners = {};

    // Initialize isActive property
    this.isActive = true;

    this.chatFilter = ProfanityFilter;
    this.lastMessageTime = {};
    this.messageCooldown = 2000; // 2 seconds cooldown

    // Add these new properties
    this.phaseStartTime = null;
    this.phaseDuration = null;

    this.filter = ProfanityFilter;
    this.isGameStarted = false; // Add this flag

    this.nightActionOrder = [
      "werewolf",
      "bodyguard",
      "doctor",
      "witch",
      "seer",
    ];

    this.aiPlayers = new Map();

    // Add these new properties
    this.lastProtectedId = null;  // Track bodyguard's last protected player
    this.investigatedPlayers = new Set();  // Track players investigated by seer
  }

  async initialize() {
    this.game = await Game.findOne({ _id: this.gameId }).populate({
      path: "players",
      populate: {
        path: "userId",
        model: "User",
        select: "username",
      },
    });

    if (!this.game) {
      throw new Error('Game not found');
    }

    // Initialize phase timers with game settings or defaults
    this.phaseTimers = {
      night: this.game.timers?.night || 30000,      // 30 seconds default
      discussion: this.game.timers?.discussion || 120000, // 2 minutes default
      voting: this.game.timers?.voting || 30000     // 30 seconds default
    };

    this.players = this.game.players;
    this.currentPhase = this.game.currentPhase || "waiting";
    this.nightActions = this.game.nightActions || {};
    this.votes = this.game.votes ? Object.fromEntries(this.game.votes) : {};
    this.phaseStartTime = this.game.phaseStartTime;
    this.phaseDuration = this.game.phaseDuration;

    // If game was in progress, resume the current phase
    if (this.currentPhase !== "waiting" && this.phaseStartTime && this.phaseDuration) {
      const elapsedTime = Date.now() - this.phaseStartTime.getTime();
      const remainingTime = Math.max(0, this.phaseDuration - elapsedTime);
      this.resumeGameLoop(remainingTime);
    }

    // Initialize AI players if they exist
    this.players.forEach(player => {
      if (player.isAI) {
        this.aiPlayers.set(player.id, new AIPlayer(player.id, player.role));
      }
    });

    // Broadcast initial player list
    this.broadcastPlayerList();

    // Send all existing messages to the newly connected player
    this.io.to(this.gameId).emit("chatHistory", this.game.messages);
  }

  broadcastPlayerList() {
    const playerInfo = this.players.map((player) => ({
      id: player.id,
      username: player.isAI ? player.username : player.userId.username, // Handle AI players differently
      isAlive: player.isAlive,
      isAI: player.isAI, // Add this to differentiate AI players in the UI
      role: this.game.isStarted
        ? player.isAlive
          ? "Unknown"
          : player.role
        : null,
    }));

    this.io.to(this.gameId).emit("updatePlayerList", playerInfo);
  }

  async startGame() {
    this.game.isStarted = true;
    const roles = [];
    Object.entries(this.game.roleCount).forEach(([role, count]) => {
      for (let i = 0; i < count; i++) {
        roles.push(role);
      }
    });
    this.game.roles = shuffle(roles);

    const werewolves = [];

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].role = this.game.roles[i];
      
      // Initialize witch potions
      if (this.players[i].role === "witch") {
        this.players[i].potions = {
          heal: true,
          kill: true
        };
      }
      
      await this.players[i].save();

      if (this.players[i].role === "werewolf") {
        werewolves.push({
          username: this.players[i].isAI ? this.players[i].username : this.players[i].userId.username,
          _id: this.players[i]._id,
          socketId: this.players[i].socketId,
          isAI: this.players[i].isAI,
        });
      }

      // Only send role assignments to human players
      if (!this.players[i].isAI) {
        this.io.to(this.players[i].socketId).emit("roleAssigned", {
          role: this.players[i].role,
          description: this.roleDescriptions[this.players[i].role],
        });
      }
    }

    // Initialize AI players
    this.players.forEach((player) => {
      if (player.isAI) {
        this.aiPlayers.set(player.id, new AIPlayer(player.id, player.role));
      }
    });

    // Inform human werewolves about all werewolf teammates (both human and AI)
    if (werewolves.length > 1) {
      werewolves.forEach((werewolf) => {
        // Only send to human werewolves
        if (!werewolf.isAI) {
          const otherWerewolves = werewolves.filter(
            (w) => w._id !== werewolf._id
          );
          this.io.to(werewolf.socketId).emit("werewolfTeammates", {
            teammates: otherWerewolves.map((w) => ({
              username: w.username,
              isAI: w.isAI,
            })),
          });
        }
      });
    }

    // Broadcast updated player list after roles are assigned
    this.broadcastPlayerList();

    this.currentPhase = "night";
    this.game.currentPhase = "night";
    await this.saveGameState();

    this.io.to(this.gameId).emit("gameStarted", { phase: this.currentPhase });
    this.runGameLoop();
    this.isGameStarted = true;

    // Broadcast initial game state
    this.broadcastGameState();

    this.lastProtectedId = null;
    this.investigatedPlayers.clear();
  }

  async runGameLoop() {
    while (true) {
      // Night Phase
      await this.nightPhase();

      // Check game end after night phase
      const nightEndCheck = this.checkGameEnd();
      if (nightEndCheck.status) {
        await this.endGame(nightEndCheck.winner);
        break;
      }

      // Day Phase
      await this.dayPhase();

      // Broadcast updated player list after day phase (which includes voting)
      this.broadcastPlayerList();

      // Check game end after day phase
      const dayEndCheck = this.checkGameEnd();
      if (dayEndCheck.status) {
        await this.endGame(dayEndCheck.winner);
        break;
      }
    }
  }

  resumeGameLoop(remainingTime) {
    setTimeout(() => this.runGameLoop(), remainingTime);
  }

  async nightPhase() {
    console.log("NIGHT PHASE STARTED");
    this.currentPhase = "night";
    this.io.to(this.gameId).emit("phaseChange", { phase: "night" });
    this.nightActions = {};

    await this.saveGameState();

    const nightPhasePromise = this.startPhaseTimer(
      "night",
      this.phaseTimers.night
    );

    console.log("NIGHT TIMER", this.phaseTimers.night);
    console.log("AUTO RESOLVE", this.game.autoResolve);

    console.log("WEREWOLF", this.nightActions.werewolf);
    console.log("BODYGUARD", this.nightActions.bodyguard);
    console.log("DOCTOR", this.nightActions.doctor);
    console.log("WITCH", this.nightActions.witch);
    console.log("SEER", this.nightActions.seer);

    await Promise.race([this.sequentialNightActions(), nightPhasePromise]);

    // Ensure auto-resolve actions run if the timer expires

    // Auto-resolve any actions that weren't taken
    if (this.game.autoResolve) {
      if (!this.nightActions.werewolf) this.autoResolveWerewolfAction();
      if (!this.nightActions.bodyguard) this.autoResolveBodyguardAction();
      if (!this.nightActions.doctor) this.autoResolveDoctorAction();
      if (!this.nightActions.witch) this.autoResolveWitchAction();
      if (!this.nightActions.seer) this.autoResolveSeerAction();
    }

    await this.processNightActions();

    await this.handleAIActions("night");
    console.log("NIGHT PHASE ENDED");
  }

  async sequentialNightActions() {
    await this.waitForWerewolfActions();
    await this.waitForBodyguardAction();
    await this.waitForDoctorAction();
    await this.waitForWitchAction();
    await this.waitForSeerAction();
  }

  async waitForWerewolfActions() {
    console.log("WAITING FOR WEREWOLF ACTIONS");
    const werewolves = this.players.filter(
      (p) => p.role === "werewolf" && p.isAlive
    );
    if (werewolves.length === 0) return;

    return new Promise((resolve) => {
      werewolves.forEach((werewolf) => {
        this.io.to(werewolf.socketId).emit("werewolfTurn", {
          description: this.roleDescriptions.werewolf,
        });
      });

      const werewolfActionHandler = ({ playerId, targetId }) => {
        if (werewolves.find((w) => w.id === playerId)) {
          this.nightActions.werewolf = targetId;
          this.io.removeListener(
            "werewolfAction",
            this.listeners.werewolfAction
          );
          resolve();
        }
      };

      this.listeners.werewolfAction = werewolfActionHandler;
      this.io.on("werewolfAction", werewolfActionHandler);
    });
  }

  async waitForBodyguardAction() {
    const bodyguard = this.players.find(
      (p) => p.role === "bodyguard" && p.isAlive
    );
    if (bodyguard) {
      this.io.to(bodyguard.socketId).emit("bodyguardTurn");
      await this.handleBodyguardAction();
    }
  }

  async waitForWitchAction() {
    const witch = this.players.find((p) => p.role === "witch" && p.isAlive);
    if (witch) {
      this.io.to(witch.socketId).emit("witchTurn", {
        werewolfTarget: this.nightActions.werewolf,
        canHeal: witch.potions.heal,
        canKill: witch.potions.kill,
      });
      await this.handleWitchAction();
    }
  }

  async waitForSeerAction() {
    const seer = this.players.find((p) => p.role === "seer" && p.isAlive);
    if (!seer) return;

    this.io.to(seer.socketId).emit("seerTurn", {
      description: this.roleDescriptions.seer,
    });
    return new Promise((resolve) => {
      const seerActionHandler = ({ playerId, targetId }) => {
        if (playerId === seer.id) {
          const targetRole = this.players.find((p) => p.id === targetId).role;
          this.io
            .to(seer.socketId)
            .emit("seerResult", { targetId, role: targetRole });
          this.io.removeListener("seerAction", this.listeners.seerAction);
          resolve();
        }
      };

      this.listeners.seerAction = seerActionHandler;
      this.io.on("seerAction", seerActionHandler);
    });
  }

  async waitForDoctorAction() {
    const doctor = this.players.find((p) => p.role === "doctor" && p.isAlive);
    if (!doctor) return; // No doctor, skip this action

    return new Promise((resolve) => {
      this.io.to(doctor.socketId).emit("doctorTurn", {
        description: this.roleDescriptions.doctor,
      });

      const doctorActionHandler = ({ playerId, targetId }) => {
        if (playerId === doctor.id) {
          this.nightActions.doctor = targetId;
          this.io.removeListener("doctorAction", this.listeners.doctorAction);
          resolve();
        }
      };

      this.listeners.doctorAction = doctorActionHandler;
      this.io.on("doctorAction", doctorActionHandler);
    });
  }

  async processNightActions() {
    console.log("PROCESSING NIGHT ACTIONS");
    let eliminatedPlayerId = null;

    // Process Werewolf action
    if (this.nightActions.werewolf) {
      eliminatedPlayerId = this.nightActions.werewolf;
    }

    // Process Bodyguard action
    if (this.nightActions.bodyguard === eliminatedPlayerId) {
      eliminatedPlayerId = null; // Bodyguard protected the target
      console.log(`Bodyguard protected player ${this.nightActions.bodyguard}`);
    }

    // Process Doctor action
    if (this.nightActions.doctor === eliminatedPlayerId) {
      eliminatedPlayerId = null; // Doctor saved the target
      console.log(`Doctor saved player ${this.nightActions.doctor}`);
    }

    // Process Witch action
    if (this.nightActions.witch) {
      if (
        this.nightActions.witch.action === "heal" &&
        this.nightActions.witch.targetId === eliminatedPlayerId
      ) {
        eliminatedPlayerId = null; // Witch saved the target
        console.log(`Witch saved player ${this.nightActions.witch.targetId}`);
      } else if (this.nightActions.witch.action === "kill") {
        if (!eliminatedPlayerId) {
          eliminatedPlayerId = this.nightActions.witch.targetId;
        } else {
          // If Werewolf already killed someone, Witch kills a second person
          await this.eliminatePlayer(this.nightActions.witch.targetId, "witch");
          console.log(
            `Witch eliminated player ${this.nightActions.witch.targetId}`
          );
        }
      }
    }

    // Eliminate the final target, if any
    if (eliminatedPlayerId) {
      await this.eliminatePlayer(eliminatedPlayerId, "werewolf");
      console.log(`Werewolf eliminated player ${eliminatedPlayerId}`);
    }

    // Process Seer action (doesn't affect eliminations)
    if (this.nightActions.seer) {
      const targetPlayer = this.players.find(
        (p) => p.id === this.nightActions.seer
      );
      if (targetPlayer) {
        const seer = this.players.find((p) => p.role === "seer" && p.isAlive);
        if (seer && !seer.isAI) {
          // Only send to human seers
          this.io.to(seer.socketId).emit("seerResult", {
            targetId: targetPlayer.id,
            role: targetPlayer.role,
          });
        }
        console.log(`Seer investigated player ${targetPlayer.id}`);
      }
    }

    // Reset night actions
    this.nightActions = {};

    // Broadcast updated game state
    this.broadcastGameState();
  }

  async dayPhase() {
    console.log("DAY PHASE STARTED");
    this.currentPhase = "day";
    this.io.to(this.gameId).emit("phaseChange", { phase: "day" });
    await this.saveGameState();
    // Day discussion Phase
    this.io
      .to(this.gameId)
      .emit("discussionStarted", { duration: this.phaseTimers.discussion });
    await this.startPhaseTimer("discussion", this.phaseTimers.discussion);
    // Voting Phase
    this.currentPhase = "voting";
    this.io.to(this.gameId).emit("phaseChange", { phase: "voting" });

    // Emit votingStarted event
    this.io
      .to(this.gameId)
      .emit("votingStarted", { remainingTime: this.phaseTimers.voting });

    const votingTimerPromise = this.startPhaseTimer(
      "voting",
      this.phaseTimers.voting
    );

    await Promise.race([this.waitForAllVotes(), votingTimerPromise]);

    // Ensure auto-resolve voting if timer expires
    if (this.game.autoResolve) {
      if (
        Object.keys(this.votes).length <
        this.players.filter((p) => p.isAlive).length
      ) {
        this.autoResolveVoting();
      }
    }

    await this.processVotes();

    await this.handleAIActions("day");
  }

  startPhaseTimer(phase, duration) {
    const startTime = Date.now();
    const endTime = startTime + duration;

    if (this.timerInterval) {
      clearInterval(this.timerInterval);
    }

    return new Promise((resolve) => {
      this.timerInterval = setInterval(() => {
        const remainingTime = Math.max(0, endTime - Date.now());
        const remainingSeconds = Math.ceil(remainingTime / 1000);

        this.io.to(this.gameId).emit("timerUpdate", {
          phase,
          remainingSeconds,
        });

        if (remainingTime <= 0) {
          clearInterval(this.timerInterval);
          resolve();
        }
      }, 1000);
    });
  }

  async processVotes() {
    const voteCounts = {};
    Object.values(this.votes).forEach((targetId) => {
      voteCounts[targetId] = (voteCounts[targetId] || 0) + 1;
    });

    // Add "no lynch" option to vote counts if enabled
    if (this.game.noLynchOption) {
      voteCounts["noLynch"] = voteCounts["noLynch"] || 0;
    }

    const maxVotes = Math.max(...Object.values(voteCounts));
    const eliminatedCandidates = Object.keys(voteCounts).filter(
      (id) => voteCounts[id] === maxVotes
    );

    let eliminated = null;
    if (eliminatedCandidates.length === 1) {
      eliminated = eliminatedCandidates[0];
    } else {
      // Tie-breaker: random selection among tied candidates
      eliminated =
        eliminatedCandidates[
          Math.floor(Math.random() * eliminatedCandidates.length)
        ];
    }

    if (eliminated && eliminated !== "noLynch") {
      const player = this.players.find((p) => p.id === eliminated);
      if (player) {
        player.isAlive = false;
        await player.save();
        console.log(
          `Player ${player.id} (${player.role}) has been eliminated by voting`
        );
        this.io
          .to(this.gameId)
          .emit("playerEliminated", { playerId: player.id, role: player.role });
      }
    } else if (eliminated === "noLynch") {
      console.log("Village decided not to lynch anyone");
      this.io.to(this.gameId).emit("noLynch");
    } else {
      this.io
        .to(this.gameId)
        .emit("noElimination", { reason: "No majority vote" });
    }

    // Reset votes
    this.votes = {};

    // Broadcast updated player list after voting
    this.broadcastPlayerList();

    // Broadcast updated game state
    this.broadcastGameState();
  }

  checkGameEnd() {
    const alivePlayers = this.players.filter((p) => p.isAlive);
    const aliveWerewolves = alivePlayers.filter(
      (p) => p.role === "werewolf"
    ).length;
    const aliveVillagers = alivePlayers.filter(
      (p) => p.role !== "werewolf"
    ).length;

    if (aliveWerewolves === 0) {
      return { status: true, winner: "villagers" };
    } else if (aliveWerewolves >= aliveVillagers) {
      return { status: true, winner: "werewolves" };
    } else if (alivePlayers.length < 2) {
      return { status: true, winner: "draw" };
    }

    return { status: false, winner: null };
  }

  async endGame(reason) {
    let winner;
    let reasonText;
    if (reason === "villagers") {
      winner = "villagers";
      reasonText = "All werewolves have been eliminated. The villagers win!";
    } else if (reason === "werewolves") {
      winner = "werewolves";
      reasonText =
        "The werewolves outnumber the villagers. The werewolves win!";
    } else {
      winner = "draw";
      reasonText = "The game has ended in a draw.";
    }
    this.io.to(this.gameId).emit("gameEnded", { winner, reason: reasonText });

    // Clean up the game state
    this.currentPhase = "ended";
    this.game.isEnded = true;
    this.game.winner = winner;
    this.game.endedAt = new Date();

    // Remove all socket listeners for this game
    if (this.listeners.werewolfAction) {
      this.io.removeListener("werewolfAction", this.listeners.werewolfAction);
    }
    if (this.listeners.seerAction) {
      this.io.removeListener("seerAction", this.listeners.seerAction);
    }
    if (this.listeners.doctorAction) {
      this.io.removeListener("doctorAction", this.listeners.doctorAction);
    }
    if (this.listeners.vote) {
      this.io.removeListener("vote", this.listeners.vote);
    }

    // Clear the listeners object
    this.listeners = {};

    // Disconnect all players from the game room
    const sockets = await this.io.in(this.gameId).fetchSockets();
    sockets.forEach((socket) => {
      socket.leave(this.gameId);
    });

    // Clear any remaining timeouts
    if (this.phaseTimeout) {
      clearTimeout(this.phaseTimeout);
    }

    // Reset game-specific properties for this instance
    this.resetGameState();

    // Mark this instance as inactive
    this.isActive = false;

    // Clear all messages
    this.game.messages = [];

    await this.game.save();

    this.io.to(this.gameId).emit("gameEnded", { winner, reason: "Game Over" });

    // Broadcast final game state
    this.broadcastGameState();
  }

  async handleWerewolfAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "werewolf")
    ) {
      this.nightActions.werewolf = targetId;
    }
    await this.saveGameState();

    this.io
      .to(playerId)
      .emit("actionConfirmation", { role: "werewolf", targetId });

    // Broadcast updated game state
    this.broadcastGameState();
  }

  async handleSeerAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "seer")
    ) {
      const targetRole = this.players.find((p) => p.id === targetId).role;
      
      // Initialize investigatedPlayers if it doesn't exist
      if (!this.investigatedPlayers) {
        this.investigatedPlayers = new Set();
      }
      
      // Add target to investigated players set
      this.investigatedPlayers.add(targetId);
      
      this.io.to(playerId).emit("seerResult", { targetId, role: targetRole });
    }
    await this.saveGameState();

    // Broadcast updated game state
    this.broadcastGameState();
  }

  async handleDoctorAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "doctor")
    ) {
      this.nightActions.doctor = targetId;
    }
    await this.saveGameState();

    this.io
      .to(playerId)
      .emit("actionConfirmation", { role: "doctor", targetId });

    // Broadcast updated game state
    this.broadcastGameState();
  }

  async handleVote(playerId, targetId) {
    if (this.currentPhase === "voting") {
      this.votes[playerId] = targetId;
      // Emit voteRegistered event
      this.io
        .to(this.gameId)
        .emit("voteRegistered", { voterId: playerId, targetId });
    }
    await this.saveGameState();

    // Broadcast updated game state
    this.broadcastGameState();
  }

  handlePlayerDisconnect(player) {
    const disconnectedPlayer = this.players.find((p) => p.id === player.id);
    if (disconnectedPlayer) {
      disconnectedPlayer.isConnected = false;

      // If it's the disconnected player's turn, skip it
      if (this.currentPhase === "night") {
        switch (disconnectedPlayer.role) {
          case "werewolf":
            if (this.nightActions.werewolf === undefined) {
              this.nightActions.werewolf = null;
            }
            break;
          case "seer":
            if (!this.nightActions.seer) {
              this.nightActions.seer = true;
            }
            break;
          case "doctor":
            if (this.nightActions.doctor === undefined) {
              this.nightActions.doctor = null;
            }
            break;
          case "bodyguard":
            if (this.nightActions.bodyguard === undefined) {
              this.nightActions.bodyguard = null;
            }
            break;
          case "witch":
            if (this.nightActions.witch === undefined) {
              this.nightActions.witch = { action: "none" };
            }
            break;
          // Add other roles as needed
        }
      } else if (
        this.currentPhase === "day" &&
        !this.votes[disconnectedPlayer.id]
      ) {
        // Auto-skip vote for disconnected player
        this.votes[disconnectedPlayer.id] = null;
      }

      // Check if this disconnection affects the game end condition
      const gameEndResult = this.checkGameEnd();
      if (gameEndResult) {
        this.endGame(gameEndResult);
      }

      // Broadcast updated player list after disconnection
      this.broadcastPlayerList();

      // If the disconnected player was an AI, remove it from aiPlayers
      if (this.aiPlayers.has(disconnectedPlayer.id)) {
        this.aiPlayers.delete(disconnectedPlayer.id);
      }
    }
  }

  autoResolveNightActions() {
    const roles = ["werewolf", "seer", "doctor", "bodyguard", "witch"];

    roles.forEach((role) => {
      if (!this.nightActions[role]) {
        const autoResolveMethod = `autoResolve${
          role.charAt(0).toUpperCase() + role.slice(1)
        }Action`;
        if (typeof this[autoResolveMethod] === "function") {
          this[autoResolveMethod]();
        } else {
          console.warn(`Auto-resolve method not found for role: ${role}`);
        }
      }
    });
  }

  autoResolveWerewolfAction() {
    console.log("AUTO RESOLVE WEREWOLF ACTION", this.nightActions.werewolf);
    if (this.nightActions.werewolf) return; // Action already taken

    const werewolves = this.players.filter(
      (p) => p.role === "werewolf" && p.isAlive
    );
    if (werewolves.length === 0) return; // No alive werewolves

    const possibleTargets = this.players.filter(
      (p) => p.isAlive && p.role !== "werewolf"
    );
    if (possibleTargets.length === 0) return; // No possible targets

    const randomTarget =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    this.nightActions.werewolf = randomTarget.id;

    // Only inform human werewolves
    werewolves.forEach((werewolf) => {
      if (!werewolf.isAI) {
        this.io
          .to(werewolf.socketId)
          .emit("autoWerewolfAction", { targetId: randomTarget.id });
      }
    });
  }

  autoResolveSeerAction() {
    const seer = this.players.find((p) => p.role === "seer" && p.isAlive);
    if (!seer || this.nightActions.seer) return;

    const possibleTargets = this.players.filter(
      (p) => p.isAlive && p.id !== seer.id
    );
    if (possibleTargets.length === 0) return;

    const randomTarget =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    const targetRole = randomTarget.role;

    this.nightActions.seer = true;
    if (!seer.isAI) {
      this.io.to(seer.socketId).emit("autoSeerResult", {
        targetId: randomTarget.id,
        role: targetRole,
      });
    }
  }

  autoResolveDoctorAction() {
    const doctor = this.players.find((p) => p.role === "doctor" && p.isAlive);
    if (!doctor || this.nightActions.doctor !== undefined) return;

    const possibleTargets = this.players.filter((p) => p.isAlive);
    if (possibleTargets.length === 0) return;

    const randomTarget =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    this.nightActions.doctor = randomTarget.id;

    if (!doctor.isAI) {
      this.io
        .to(doctor.socketId)
        .emit("autoDoctorAction", { targetId: randomTarget.id });
    }
  }

  autoResolveVoting() {
    const alivePlayers = this.players.filter((p) => p.isAlive);
    alivePlayers.forEach((player) => {
      if (!this.votes[player.id]) {
        // Randomly vote for an alive player or 'noLynch' if enabled
        const voteOptions = [
          ...alivePlayers.map((p) => p.id),
          this.game.noLynchOption ? "noLynch" : null,
        ].filter(Boolean);
        const randomVote =
          voteOptions[Math.floor(Math.random() * voteOptions.length)];
        this.handleVote(player.id, randomVote);
      }
    });
  }

  async waitForAllVotes() {
    return new Promise((resolve) => {
      const alivePlayers = this.players.filter((p) => p.isAlive);
      let votesReceived = 0;

      const voteHandler = ({ playerId, targetId }) => {
        if (
          alivePlayers.find((p) => p.id === playerId) &&
          !this.votes[playerId]
        ) {
          this.votes[playerId] = targetId;
          votesReceived++;

          if (votesReceived === alivePlayers.length) {
            this.io.removeListener("vote", this.listeners.vote);
            resolve();
          }
        }
      };

      this.listeners.vote = voteHandler;
      this.io.on("vote", voteHandler);
    });
  }

  resetGameState() {
    this.players = [];
    this.nightActions = {};
    this.votes = {};
    this.currentPhase = "ended";
    this.phaseTimeout = null;
    this.currentTimer = null;
    this.timerInterval = null;
  }

  async handleChatMessage(
    io,
    { gameId, playerId, message, isWhisper = false, targetId = null }
  ) {
    if (!this.io) this.io = io;
    if (!this.gameId) this.gameId = gameId;
    if (!this.players.length) {
      this.game = await Game.findOne({ _id: gameId }).populate({
        path: "players",
        populate: {
          path: "userId",
          model: "User",
          select: "username",
        },
      });

      this.players = this.game.players;
    }
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return; // Player not found

    // Check if the player is allowed to chat
    if (this.isGameStarted && !player.isAlive) return; // Dead players can't chat once the game has started

    // Check for rate limiting
    const now = Date.now();
    if (now - (this.lastMessageTime[playerId] || 0) < this.messageCooldown) {
      this.io
        .to(player.socketId)
        .emit("error", "Please wait before sending another message.");
      return;
    }
    this.lastMessageTime[playerId] = now;

    // Filter message
    const filteredMessage = this.filter.clean(message);

    const chatMessage = {
      playerId: player.id,
      username: player.userId.username,
      message: filteredMessage,
      timestamp: new Date(),
      isWhisper: isWhisper,
      whisperTarget: isWhisper ? targetId : null,
    };

    // Save the message to the database
    this.game = await Game.findOne({ _id: gameId });
    if (!isWhisper) this.game.messages.push(chatMessage);
    await this.game.save();

    if (isWhisper && targetId) {
      // Handle whisper logic
      const targetPlayer = this.players.find((p) => p.id === targetId);
      if (targetPlayer && (targetPlayer.isAlive || !this.isGameStarted)) {
        this.io.to(player.socketId).emit("chatMessage", chatMessage);
        this.io.to(targetPlayer.socketId).emit("chatMessage", chatMessage);
      } else {
        this.io.to(player.socketId).emit("error", "Invalid whisper target.");
      }
    } else {
      // Handle public chat
      if (!this.isGameStarted) {
        // Before game starts, all players can chat
        this.io.to(this.gameId).emit("chatMessage", chatMessage);
      } else if (this.currentPhase === "night" && player.role === "werewolf") {
        // During night, only werewolves can chat among themselves
        this.players
          .filter((p) => p.role === "werewolf" && p.isAlive)
          .forEach((werewolf) => {
            this.io.to(werewolf.socketId).emit("chatMessage", chatMessage);
          });
      } else if (this.currentPhase !== "night") {
        // During day, all alive players can chat
        this.io.to(this.gameId).emit("chatMessage", chatMessage);
      }
    }
  }

  async saveGameState() {
    try {
      // Create an update object with only defined values
      const updateObj = {};

      if (this.currentPhase !== null && this.currentPhase !== undefined) {
        updateObj.currentPhase = this.currentPhase;
      }

      if (Object.keys(this.nightActions).length > 0) {
        updateObj.nightActions = this.nightActions;
      }

      if (Object.keys(this.votes).length > 0) {
        updateObj.votes = new Map(Object.entries(this.votes));
      }

      if (this.phaseStartTime !== null && this.phaseStartTime !== undefined) {
        updateObj.phaseStartTime = this.phaseStartTime;
      }

      if (this.phaseDuration !== null && this.phaseDuration !== undefined) {
        updateObj.phaseDuration = this.phaseDuration;
      }

      // Only update if there are valid fields to update
      if (Object.keys(updateObj).length > 0) {
        await Game.findByIdAndUpdate(this.gameId, updateObj, { new: true });
      } else {
        console.warn("No valid game state changes to save");
      }
    } catch (error) {
      console.error("Error saving game state:", error);
      throw error;
    }
  }

  async addSpectator(gameId, userId) {
    console.log("ADDING SPECTATOR", this.io)
    const user = await User.findById(userId);
    if (!user) throw new Error("User not found");

    this.game = await Game.findOne({ _id: this.gameId || gameId });

    if (!this.game.spectators.includes(userId)) {
      this.game.spectators.push(userId);
      await this.game.save();
    }

    // Send current game state to the spectator
    this.io.to(user.socketId).emit("gameState", this.getGameState());
  }

  removeSpectator(userId) {
    this.game.spectators = this.game.spectators.filter(
      (id) => id.toString() !== userId
    );
    this.game.save();
  }

  getGameState() {
    return {
      players: this.players.map((p) => ({
        id: p.id,
        username: p.isAI ? p.username : p.userId.username,
        isAlive: p.isAlive,
        role: p.role,
        isAI: p.isAI,
        potions: p.role === 'witch' ? p.potions : undefined
      })),
      currentPhase: this.currentPhase,
      nightActions: this.nightActions,
      lastProtectedId: this.lastProtectedId, // For bodyguard
      investigatedPlayers: this.investigatedPlayers, // For seer
      // ... other game state properties
    };
  }

  broadcastGameState() {
    const gameState = this.getGameState();
    this.io.to(this.gameId).emit("gameState", gameState);
  }

  // Add new methods for new roles
  async handleBodyguardAction() {
    const bodyguard = this.players.find(
      (p) => p.role === "bodyguard" && p.isAlive
    );
    if (!bodyguard) return;

    // Initialize lastProtectedId if it doesn't exist
    if (!this.lastProtectedId) {
      this.lastProtectedId = null;
    }

    // If bodyguard is AI, don't emit socket events
    if (bodyguard.isAI) {
      const alivePlayers = this.players.filter(
        (p) => p.isAlive && 
        p.id !== bodyguard.id && 
        p.id !== this.lastProtectedId // Can't protect same player twice
      );
      if (alivePlayers.length > 0) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        this.nightActions.bodyguard = randomTarget.id;
        this.lastProtectedId = randomTarget.id; // Track the protected player
        return;
      }
    }

    return new Promise((resolve) => {
      this.io.to(bodyguard.socketId).emit("bodyguardTurn", {
        message: "Choose a player to protect tonight.",
        players: this.players
          .filter((p) => 
            p.isAlive && 
            p.id !== this.lastProtectedId // Filter out last protected player
          )
          .map((p) => ({
            id: p.id,
            username: p.isAI ? p.username : p.userId.username
          })),
        lastProtectedId: this.lastProtectedId // Send to client for UI feedback
      });

      const bodyguardActionHandler = ({ targetId }) => {
        if (this.players.some((p) => 
          p.id === targetId && 
          p.isAlive && 
          p.id !== this.lastProtectedId
        )) {
          this.nightActions.bodyguard = targetId;
          this.lastProtectedId = targetId; // Track the protected player
          this.io
            .to(bodyguard.socketId)
            .emit("actionConfirmation", { role: "bodyguard", targetId });
        }
        this.io.removeListener("bodyguardAction", bodyguardActionHandler);
        resolve();
      };

      this.io.on("bodyguardAction", bodyguardActionHandler);

      setTimeout(() => {
        if (this.io.listeners("bodyguardAction").includes(bodyguardActionHandler)) {
          this.io.removeListener("bodyguardAction", bodyguardActionHandler);
          this.autoResolveBodyguardAction();
          resolve();
        }
      }, this.phaseTimers.night);
    });
  }

  async autoResolveBodyguardAction() {
    const bodyguard = this.players.find(
      (p) => p.role === "bodyguard" && p.isAlive
    );
    if (!bodyguard) return;

    const alivePlayers = this.players.filter(
      (p) => p.isAlive && p.id !== bodyguard.id
    );
    if (alivePlayers.length > 0) {
      const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      this.nightActions.bodyguard = randomTarget.id;
      
      // Only emit confirmation if bodyguard is human
      if (!bodyguard.isAI) {
        this.io.to(bodyguard.socketId).emit("actionConfirmation", {
          role: "bodyguard",
          targetId: randomTarget.id,
        });
      }
    }
  }

  async handleWitchAction() {
    const witch = this.players.find((p) => p.role === "witch" && p.isAlive);
    if (!witch) return;

    // Initialize potions if they don't exist
    if (!witch.potions) {
      witch.potions = { heal: true, kill: true };
      await witch.save();
    }

    const witchPotions = witch.potions;
    const werewolfTarget = this.nightActions.werewolf;

    // If witch is AI, handle action directly
    if (witch.isAI) {
      // Simple AI logic for witch
      if (witchPotions.heal && werewolfTarget) {
        this.nightActions.witch = { action: "heal", targetId: werewolfTarget };
        witch.potions.heal = false;
        await witch.save();
      } else if (witchPotions.kill) {
        const alivePlayers = this.players.filter(p => p.isAlive && p.id !== witch.id);
        if (alivePlayers.length > 0) {
          const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
          this.nightActions.witch = { action: "kill", targetId: randomTarget.id };
          witch.potions.kill = false;
          await witch.save();
        }
      } else {
        this.nightActions.witch = { action: "none" };
      }
      return;
    }

    return new Promise((resolve) => {
      this.io.to(witch.socketId).emit("witchTurn", {
        message: "Choose your action for tonight.",
        canHeal: witchPotions.heal,
        canKill: witchPotions.kill,
        werewolfTarget: werewolfTarget,
        players: this.players
          .filter((p) => p.isAlive)
          .map((p) => ({
            id: p.id,
            username: p.isAI ? p.username : p.userId.username
          })),
      });

      const witchActionHandler = ({ action, targetId }) => {
        if (action === "heal" && witchPotions.heal && targetId === werewolfTarget) {
          this.nightActions.witch = { action: "heal", targetId };
          witch.potions.heal = false;
          witch.save(); // Add save call
        } else if (
          action === "kill" &&
          witchPotions.kill &&
          this.players.some((p) => p.id === targetId && p.isAlive)
        ) {
          this.nightActions.witch = { action: "kill", targetId };
          witch.potions.kill = false;
          witch.save(); // Add save call
        }
        this.io
          .to(witch.socketId)
          .emit("actionConfirmation", { role: "witch", action, targetId });
        this.io.removeListener("witchAction", witchActionHandler);
        resolve();
      };

      this.io.on("witchAction", witchActionHandler);

      setTimeout(() => {
        if (this.io.listeners("witchAction").includes(witchActionHandler)) {
          this.io.removeListener("witchAction", witchActionHandler);
          this.autoResolveWitchAction();
          resolve();
        }
      }, this.phaseTimers.night);
    });
  }

  async autoResolveWitchAction() {
    const witch = this.players.find((p) => p.role === "witch" && p.isAlive);
    if (!witch) return;

    this.nightActions.witch = { action: "none" };
    
    // Only emit confirmation if witch is human
    if (!witch.isAI) {
      this.io.to(witch.socketId).emit("actionConfirmation", {
        role: "witch",
        action: "none"
      });
    }
  }

  async eliminatePlayer(playerId, eliminationType) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player || !player.isAlive) return;

    player.isAlive = false;
    await player.save();

    console.log(
      `Player ${player.id} (${player.role}) has been eliminated by ${eliminationType}`
    );
    this.io.to(this.gameId).emit("playerEliminated", {
      playerId: player.id,
      role: player.role,
      eliminationType: eliminationType,
    });

    // Trigger Hunter's ability if the eliminated player is a Hunter
    if (player.role === "hunter") {
      await this.handleHunterAction(playerId);
    }

    // Check for game end condition after elimination
    this.checkGameEnd();
  }

  async handleHunterAction(hunterId) {
    const hunter = this.players.find((p) => p.id === hunterId);
    if (!hunter) return;

    const alivePlayers = this.players.filter(
      (p) => p.isAlive && p.id !== hunterId
    );

    // If hunter is AI, handle action directly
    if (hunter.isAI) {
      if (alivePlayers.length > 0) {
        const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
        this.eliminatePlayer(randomTarget.id, "hunter");
        
        // Broadcast the AI hunter's action to all players
        this.io.to(this.gameId).emit("hunterAction", {
          hunterId: hunterId,
          targetId: randomTarget.id,
          targetName: randomTarget.isAI ? randomTarget.username : randomTarget.userId.username,
          isAIHunter: true
        });
      }
      return;
    }

    // Handle human hunter
    return new Promise((resolve) => {
      this.io.to(hunter.socketId).emit("hunterTurn", {
        message: "You've been eliminated! Choose a player to eliminate with you.",
        players: alivePlayers.map((p) => ({
          id: p.id,
          username: p.isAI ? p.username : p.userId.username,
        })),
      });

      const hunterActionHandler = ({ targetId }) => {
        const target = alivePlayers.find((p) => p.id === targetId);
        if (target) {
          this.eliminatePlayer(targetId, "hunter");
          this.io.to(this.gameId).emit("hunterAction", {
            hunterId: hunterId,
            targetId: targetId,
            targetName: target.isAI ? target.username : target.userId.username,
            isAIHunter: false
          });
        }
        this.io.removeListener("hunterAction", hunterActionHandler);
        resolve();
      };

      this.io.on("hunterAction", hunterActionHandler);

      // Auto-resolve if the Hunter doesn't choose within a time limit
      setTimeout(() => {
        if (this.io.listeners("hunterAction").includes(hunterActionHandler)) {
          this.io.removeListener("hunterAction", hunterActionHandler);
          this.autoResolveHunterAction(hunterId, alivePlayers);
          resolve();
        }
      }, 30000); // 30 seconds to choose
    });
  }

  autoResolveHunterAction(hunterId, alivePlayers) {
    if (alivePlayers.length > 0) {
      const randomTarget = alivePlayers[Math.floor(Math.random() * alivePlayers.length)];
      this.eliminatePlayer(randomTarget.id, "hunter");

      const hunter = this.players.find(p => p.id === hunterId);
      
      // Broadcast to all players
      this.io.to(this.gameId).emit("hunterAction", {
        hunterId: hunterId,
        targetId: randomTarget.id,
        targetName: randomTarget.isAI ? randomTarget.username : randomTarget.userId.username,
        isAIHunter: hunter?.isAI || false,
        wasAutoResolved: true
      });
    }
  }

  async handleAIActions(phase) {
    for (const [playerId, aiPlayer] of this.aiPlayers) {
      if (this.players.find((p) => p.id === playerId && p.isAlive)) {
        const decision = await aiPlayer.makeDecision(this.getGameState());
        await this.handlePlayerAction(playerId, decision, phase);
      }
    }
  }

  async handlePlayerAction(playerId, action, phase) {
    const player = this.players.find((p) => p.id === playerId);
    if (!player) return;

    switch (phase) {
      case "night":
        switch (player.role) {
          case "werewolf":
            await this.handleWerewolfAction(playerId, action);
            break;
          case "seer":
            await this.handleSeerAction(playerId, action);
            break;
          case "doctor":
            await this.handleDoctorAction(playerId, action);
            break;
          case "bodyguard":
            await this.handleBodyguardAction(playerId, action);
            break;
          case "witch":
            await this.handleWitchAction(playerId, action);
            break;
          // Add other roles as needed
        }
        break;
      case "day":
        await this.handleVote(playerId, action);
        break;
    }
  }
}

module.exports = GameStateManager;
