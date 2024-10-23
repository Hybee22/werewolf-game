const Game = require("../models/Game");
const { shuffle } = require("../helpers/gameHelper");
const User = require("../models/User");
const dotenv = require("dotenv");

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

    // Add these new properties
    this.phaseTimers = {
      night: parseInt(process.env.NIGHT_PHASE_TIME) ?? 30000, // 45 seconds for night phase
      discussion: parseInt(process.env.DISCUSSION_PHASE_TIME) ?? 120000, // 2 minutes for discussion
      voting: parseInt(process.env.VOTING_PHASE_TIME) ?? 30000, // 45 seconds for voting
    };
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
    };

    this.listeners = {};

    // Initialize isActive property
    this.isActive = true;
  }

  async initialize() {
    this.game = await Game.findOne({ _id: this.gameId }).populate("players");
    this.players = this.game.players;
    this.currentPhase = this.game.currentPhase || "waiting";
  }

  async startGame() {
    this.game.isStarted = true;
    this.game.roles = shuffle([
      "werewolf",
      "werewolf",
      "seer",
      "doctor",
      "villager",
      "villager",
      "villager",
    ]);

    const werewolves = [];

    for (let i = 0; i < this.players.length; i++) {
      this.players[i].role = this.game.roles[i];
      await this.players[i].save();

      if (this.players[i].role === "werewolf") {
        const userId = this.players[i].userId;
        const user = await User.findById(userId);
        werewolves.push({ ...this.players[i], name: user.username });

        console.log(werewolves);
      }

      // Inform each player of their role and its description
      this.io.to(this.players[i].socketId).emit("roleAssigned", {
        role: this.players[i].role,
        description: this.roleDescriptions[this.players[i].role],
      });
    }

    // Inform werewolves about each other
    if (werewolves.length > 1) {
      werewolves.forEach((werewolf) => {
        const otherWerewolves = werewolves.filter(
          (w) => w._id !== werewolf._id
        );
        this.io.to(werewolf.socketId).emit("werewolfTeammates", {
          teammates: otherWerewolves.map((w) => ({
            name: w.name,
          })),
        });
      });
    }

    this.currentPhase = "night";
    this.game.currentPhase = "night";
    await this.game.save();

    this.io.to(this.gameId).emit("gameStarted", { phase: this.currentPhase });
    this.runGameLoop();
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

      // Check game end after day phase
      const dayEndCheck = this.checkGameEnd();
      if (dayEndCheck.status) {
        await this.endGame(dayEndCheck.winner);
        break;
      }
    }
  }

  async nightPhase() {
    this.currentPhase = "night";
    this.io.to(this.gameId).emit("phaseChange", { phase: "night" });
    this.nightActions = {};

    const nightPhasePromise = this.startPhaseTimer(
      "night",
      this.phaseTimers.night
    );

    await Promise.race([this.sequentialNightActions(), nightPhasePromise]);

    // Ensure auto-resolve actions run if the timer expires
    if (!this.nightActions.werewolf) this.autoResolveWerewolfAction();
    if (!this.nightActions.seer) this.autoResolveSeerAction();
    if (this.nightActions.doctor === undefined) this.autoResolveDoctorAction();

    await this.processNightActions();
  }

  async sequentialNightActions() {
    await this.waitForWerewolfActions();
    await this.waitForSeerAction();
    await this.waitForDoctorAction();
  }

  async waitForWerewolfActions() {
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
    if (
      this.nightActions.werewolf &&
      this.nightActions.werewolf !== this.nightActions.doctor
    ) {
      const victim = this.players.find(
        (p) => p.id === this.nightActions.werewolf
      );
      victim.isAlive = false;
      await victim.save();
      this.io.to(this.gameId).emit("playerKilled", { playerId: victim.id });
    }
  }

  async dayPhase() {
    this.currentPhase = "day";
    this.io.to(this.gameId).emit("phaseChange", { phase: "day" });

    await this.startPhaseTimer("discussion", this.phaseTimers.discussion);

    this.currentPhase = "voting";
    this.io.to(this.gameId).emit("phaseChange", { phase: "voting" });

    const votingPromise = this.startPhaseTimer(
      "voting",
      this.phaseTimers.voting
    );

    await Promise.race([this.waitForAllVotes(), votingPromise]);

    // Ensure auto-resolve voting if timer expires
    if (
      Object.keys(this.votes).length <
      this.players.filter((p) => p.isAlive).length
    ) {
      this.autoResolveVoting();
    }

    await this.processVotes();
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

    const maxVotes = Math.max(...Object.values(voteCounts));
    const eliminated = Object.keys(voteCounts).find(
      (id) => voteCounts[id] === maxVotes
    );

    if (eliminated) {
      const player = this.players.find((p) => p.id === eliminated);
      player.isAlive = false;
      await player.save();
      this.io
        .to(this.gameId)
        .emit("playerEliminated", { playerId: player.id, role: player.role });
    }
  }

  checkGameEnd() {
    console.log("CHECKING GAME END");
    const alivePlayers = this.players.filter((p) => p.isAlive && p.isConnected);
    const aliveWerewolves = alivePlayers.filter(
      (p) => p.role === "werewolf"
    ).length;
    const aliveVillagers = alivePlayers.filter(
      (p) => p.role !== "werewolf"
    ).length;

    // console.log({ alivePlayers, aliveVillagers, aliveWerewolves });

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
    await this.game.save();

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
  }

  handleWerewolfAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "werewolf")
    ) {
      this.nightActions.werewolf = targetId;
    }
  }

  handleSeerAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "seer")
    ) {
      const targetRole = this.players.find((p) => p.id === targetId).role;
      this.io.to(playerId).emit("seerResult", { targetId, role: targetRole });
    }
  }

  handleDoctorAction(playerId, targetId) {
    if (
      this.currentPhase === "night" &&
      this.players.find((p) => p.id === playerId && p.role === "doctor")
    ) {
      this.nightActions.doctor = targetId;
    }
  }

  handleVote(playerId, targetId) {
    if (this.currentPhase === "day") {
      this.votes[playerId] = targetId;
    }
  }

  handlePlayerDisconnect(player) {
    const disconnectedPlayer = this.players.find((p) => p.id === player.id);
    if (disconnectedPlayer) {
      disconnectedPlayer.isConnected = false;

      // If it's the disconnected player's turn, skip it
      if (this.currentPhase === "night") {
        if (
          disconnectedPlayer.role === "werewolf" &&
          this.nightActions.werewolf === undefined
        ) {
          this.nightActions.werewolf = null;
        } else if (
          disconnectedPlayer.role === "seer" &&
          !this.nightActions.seer
        ) {
          this.nightActions.seer = true;
        } else if (
          disconnectedPlayer.role === "doctor" &&
          this.nightActions.doctor === undefined
        ) {
          this.nightActions.doctor = null;
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
    }
  }

  autoResolveNightActions() {
    if (!this.nightActions.werewolf) {
      this.autoResolveWerewolfAction();
    }
    if (!this.nightActions.seer) {
      this.autoResolveSeerAction();
    }
    if (!this.nightActions.doctor) {
      this.autoResolveDoctorAction();
    }
  }

  autoResolveWerewolfAction() {
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

    // Inform werewolves of the auto-selected target
    werewolves.forEach((werewolf) => {
      this.io
        .to(werewolf.socketId)
        .emit("autoWerewolfAction", { targetId: randomTarget.id });
    });
  }

  autoResolveSeerAction() {
    const seer = this.players.find((p) => p.role === "seer" && p.isAlive);
    if (!seer || this.nightActions.seer) return; // No alive seer or action already taken

    const possibleTargets = this.players.filter(
      (p) => p.isAlive && p.id !== seer.id
    );
    if (possibleTargets.length === 0) return; // No possible targets

    const randomTarget =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    const targetRole = randomTarget.role;

    this.nightActions.seer = true; // Mark seer action as completed
    this.io
      .to(seer.socketId)
      .emit("autoSeerResult", { targetId: randomTarget.id, role: targetRole });
  }

  autoResolveDoctorAction() {
    const doctor = this.players.find((p) => p.role === "doctor" && p.isAlive);
    if (!doctor || this.nightActions.doctor !== undefined) return; // No alive doctor or action already taken

    const possibleTargets = this.players.filter((p) => p.isAlive);
    if (possibleTargets.length === 0) return; // No possible targets

    const randomTarget =
      possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
    this.nightActions.doctor = randomTarget.id;

    // Inform doctor of the auto-selected target
    this.io
      .to(doctor.socketId)
      .emit("autoDoctorAction", { targetId: randomTarget.id });
  }

  autoResolveVoting() {
    const alivePlayers = this.players.filter((p) => p.isAlive);

    alivePlayers.forEach((player) => {
      if (!this.votes[player.id]) {
        const possibleTargets = alivePlayers.filter((p) => p.id !== player.id);
        if (possibleTargets.length > 0) {
          const randomTarget =
            possibleTargets[Math.floor(Math.random() * possibleTargets.length)];
          this.votes[player.id] = randomTarget.id;
        }
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
}

module.exports = GameStateManager;
