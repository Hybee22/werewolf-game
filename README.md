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

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- Inspired by the classic Werewolf/Mafia party game
- Thanks to all contributors and players who have helped improve this game
