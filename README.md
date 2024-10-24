# Werewolf Game

## Overview

This project is an online implementation of the popular party game Werewolf (also known as Mafia). It's a multiplayer game of social deduction where players are secretly assigned roles and must work together or against each other to achieve their goals.

## Features

- Real-time multiplayer gameplay using Socket.IO
- Role assignment: Werewolf, Villager, Seer, and Doctor
- Day and night phases with timed rounds
- Voting system for eliminating suspects
- Special abilities for Seer and Doctor roles
- Werewolf team communication
- Game state management and persistence

## Tech Stack

- Backend: Node.js with Express
- Real-time Communication: Socket.IO
- Database: MongoDB with Mongoose
- Frontend: React (assumed, not included in this repository)

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/hybee22/werewolf-game.git
   cd werewolf-game
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Set up environment variables:
   Create a `.env` file in the root directory and add the following:
   ```
   MONGODB_URI=your_mongodb_connection_string
   SESSION_SECRET=your_session_secret
   PORT=3000
   NIGHT_PHASE_TIME=45000
   DISCUSSION_PHASE_TIME=120000
   VOTING_PHASE_TIME=45000
   ```

   Note:
   - `MONGODB_URI` is your MongoDB connection string
   - `SESSION_SECRET` is a secret key for session management
   - `PORT` is the port number for the server (default is 3000)
   - `NIGHT_PHASE_TIME` is the duration of the night phase in milliseconds (default is 45000ms or 45 seconds)
   - `DISCUSSION_PHASE_TIME` is the duration of the discussion phase in milliseconds (default is 120000ms or 2 minutes)
   - `VOTING_PHASE_TIME` is the duration of the voting phase in milliseconds (default is 45000ms or 45 seconds)

4. Start the server:
   ```
   npm start
   ```

## Game Rules

1. Players are secretly assigned roles: Werewolf, Villager, Seer, or Doctor.
2. The game alternates between night and day phases.
3. During the night:
   - Werewolves choose a victim to eliminate
   - The Seer can investigate one player's role
   - The Doctor can protect one player from elimination
4. During the day:
   - Players discuss and vote to eliminate a suspected werewolf
5. The game continues until either all werewolves are eliminated (Village team wins) or werewolves outnumber villagers (Werewolf team wins).

## Project Structure

- `src/`
  - `models/` - Database models
  - `routes/` - Express routes
  - `services/` - Game logic and state management
  - `socket/` - Socket.IO event handlers
  - `app.js` - Main application file

## Key Components

### GameStateManager

The `GameStateManager` class in `src/services/gameStateManager.js` is responsible for:
- Managing the game state
- Handling game phases
- Processing player actions
- Determining game outcomes

### Socket Events

The main socket events are:
- `joinGame`: When a player joins a game
- `startGame`: Initiates the game
- `werewolfAction`, `seerAction`, `doctorAction`: Night phase actions
- `vote`: Day phase voting
- `gameEnded`: Signals the end of the game

## Game Events

The Werewolf game emits various events throughout gameplay. Here's a comprehensive list of events with their descriptions:

### Game Setup Events

- `gameCreated`: Emitted when a new game is created.
  - Payload: `{ gameId: string }`

- `playerJoined`: Emitted when a player joins the game.
  - Payload: `{ playerId: string, username: string }`

- `gameStarted`: Emitted when the game begins.
  - Payload: `{ phase: string }`

### Role Assignment Event

- `roleAssigned`: Sent to each player individually with their assigned role.
  - Payload: `{ role: string, description: string }`

- `werewolfTeammates`: Sent to werewolves to inform them of their teammates.
  - Payload: `{ teammates: [{ username: string }] }`

### Game Phase Events

- `phaseChange`: Emitted when the game phase changes (e.g., from night to day).
  - Payload: `{ phase: string }`

- `timerUpdate`: Emitted periodically to update the remaining time in the current phase.
  - Payload: `{ phase: string, remainingSeconds: number }`

### Night Phase Events

- `werewolfTurn`: Sent to werewolves when it's their turn to choose a victim.
  - Payload: `{ description: string }`

- `seerTurn`: Sent to the seer when it's their turn to choose a player to investigate.
  - Payload: `{ description: string }`

- `doctorTurn`: Sent to the doctor when it's their turn to choose a player to protect.
  - Payload: `{ description: string }`

- `seerResult`: Sent to the seer with the result of their investigation.
  - Payload: `{ targetId: string, role: string }`

### Day Phase Events

- `playerKilled`: Emitted when a player is killed during the night.
  - Payload: `{ playerId: string }`

- `playerEliminated`: Emitted when a player is eliminated by voting.
  - Payload: `{ playerId: string, role: string }`

### Voting Events

- `votingStarted`: Emitted when the voting phase begins.
  - Payload: `{ remainingTime: number }`

- `voteRegistered`: Emitted when a player's vote is registered.
  - Payload: `{ voterId: string, targetId: string }`

### Game End Event

- `gameEnded`: Emitted when the game concludes.
  - Payload: `{ winner: string, reason: string }`

### Player List Update

- `updatePlayerList`: Emitted to update all clients with the current player list.
  - Payload: `[{ id: string, username: string, isAlive: boolean, role: string | null }]`

### Auto-Resolve Events

- `autoWerewolfAction`: Emitted when werewolf action is auto-resolved.
  - Payload: `{ targetId: string }`

- `autoSeerResult`: Emitted when seer action is auto-resolved.
  - Payload: `{ targetId: string, role: string }`

- `autoDoctorAction`: Emitted when doctor action is auto-resolved.
  - Payload: `{ targetId: string }`

### Chat Events

- `chatHistory`: Emitted when a player joins the game, containing all previous messages.
  - Payload: `[{ playerId: string, username: string, message: string, timestamp: Date, isWhisper: boolean, whisperTarget: string | null }]`

- `chatMessage`: Emitted when a new chat message is sent.
  - Payload: `{ playerId: string, username: string, message: string, timestamp: Date, isWhisper: boolean, whisperTarget: string | null }`

### Error Events

- `error`: Emitted when an error occurs during the game.
  - Payload: `{ message: string }`

Players should listen for these events and update their game state and UI accordingly. The chat events allow for persistent messaging during the game, with the entire chat history provided upon joining and individual messages sent in real-time as they occur.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by the classic Werewolf/Mafia party game
- Thanks to all contributors and players who have helped improve this game
