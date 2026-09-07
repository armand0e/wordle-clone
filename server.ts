import { createServer } from 'http';
import { randomUUID } from 'crypto';
import { Server } from 'socket.io';
import next from 'next';
import { Room, Player, ClientToServerEvents, ServerToClientEvents } from './src/lib/types';
import { evaluateGuess } from './src/lib/game';
import { getRandomWord, isValidWord } from './src/lib/words';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// How long a disconnected player keeps their seat (mobile browsers kill the
// socket as soon as the tab is backgrounded, e.g. while sending an invite).
const DISCONNECT_GRACE_MS = 5 * 60 * 1000;

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const rooms: Map<string, Room> = new Map();
const playerRooms: Map<string, string> = new Map(); // playerId -> roomId
const playerSockets: Map<string, string> = new Map(); // playerId -> socketId
const socketPlayers: Map<string, string> = new Map(); // socketId -> playerId
const removalTimers: Map<string, NodeJS.Timeout> = new Map(); // playerId -> pending removal
const guessSubmitLocks: Set<string> = new Set();

function resolvePlayerId(playerToken: unknown): string {
  if (typeof playerToken === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(playerToken)) {
    return playerToken;
  }
  return randomUUID();
}

function toClientRoomForPlayer(room: Room, viewerId: string): Room {
  const viewer = room.players.find((player) => player.id === viewerId);
  const canViewOthersLiveBoards = viewer?.gameStatus === 'won' || viewer?.gameStatus === 'lost';

  return {
    ...room,
    targetWord: null,
    players: room.players.map((player) => {
      if (player.id === viewerId || canViewOthersLiveBoards) {
        return { ...player };
      }

      const maskedGuessResults = player.guessResults.map((row) =>
        row.map((result) => ({ letter: '', state: result.state })),
      );

      return {
        ...player,
        guesses: player.guesses.map(() => '*****'),
        currentGuess: '*'.repeat(player.currentGuess.length),
        guessResults: maskedGuessResults,
      };
    }),
  };
}

function startRound(room: Room) {
  room.targetWord = getRandomWord();
  room.gameStarted = true;

  room.players.forEach((player) => {
    player.guesses = [];
    player.currentGuess = '';
    player.guessResults = [];
    player.gameStatus = 'playing';
    player.readyForNextRound = false;
  });
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handler(req, res);
  });

  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST'],
    },
  });

  const emitRoomState = (room: Room) => {
    room.players.forEach((player) => {
      const socketId = playerSockets.get(player.id);
      if (socketId) {
        io.to(socketId).emit('roomState', toClientRoomForPlayer(room, player.id));
      }
    });
  };

  const cancelRemoval = (playerId: string) => {
    const timer = removalTimers.get(playerId);
    if (timer) {
      clearTimeout(timer);
      removalTimers.delete(playerId);
    }
  };

  const removePlayer = (playerId: string) => {
    cancelRemoval(playerId);
    guessSubmitLocks.delete(playerId);

    const roomId = playerRooms.get(playerId);
    if (!roomId) return;

    playerRooms.delete(playerId);

    const room = rooms.get(roomId);
    if (!room) return;

    room.players = room.players.filter((p) => p.id !== playerId);

    if (room.players.length === 0) {
      rooms.delete(roomId);
      console.log(`Room ${roomId} deleted (empty)`);
    } else {
      if (room.hostId === playerId) {
        const nextHost = room.players.find((p) => p.connected) ?? room.players[0];
        room.hostId = nextHost.id;
      }
      emitRoomState(room);
      io.to(roomId).emit('playerLeft', playerId);
    }
  };

  const maybeStartNextRound = (room: Room) => {
    const connectedPlayers = room.players.filter((p) => p.connected);
    const everyoneReady =
      connectedPlayers.length > 0 && connectedPlayers.every((p) => p.readyForNextRound);
    if (everyoneReady) {
      startRound(room);
      emitRoomState(room);
    }
  };

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    const bindSocket = (playerId: string) => {
      socketPlayers.set(socket.id, playerId);
      playerSockets.set(playerId, socket.id);
      cancelRemoval(playerId);
    };

    socket.on('createRoom', (playerName, playerToken, callback) => {
      const playerId = resolvePlayerId(playerToken);
      removePlayer(playerId);

      let roomId = randomUUID().substring(0, 6).toUpperCase();
      while (rooms.has(roomId)) {
        roomId = randomUUID().substring(0, 6).toUpperCase();
      }

      const player: Player = {
        id: playerId,
        name: playerName.trim().slice(0, 20) || 'Player',
        guesses: [],
        currentGuess: '',
        gameStatus: 'waiting',
        guessResults: [],
        readyForNextRound: false,
        connected: true,
      };

      const room: Room = {
        id: roomId,
        players: [player],
        targetWord: null,
        gameStarted: false,
        hostId: playerId,
        createdAt: Date.now(),
      };

      rooms.set(roomId, room);
      playerRooms.set(playerId, roomId);
      bindSocket(playerId);
      socket.join(roomId);

      console.log(`Room ${roomId} created by ${player.name}`);
      callback(roomId);
      emitRoomState(room);
    });

    socket.on('joinRoom', (roomId, playerName, playerToken, callback) => {
      const playerId = resolvePlayerId(playerToken);
      const normalizedRoomId = roomId.toUpperCase();
      const room = rooms.get(normalizedRoomId);

      if (!room) {
        callback(false, 'Room not found');
        return;
      }

      const existing = room.players.find((p) => p.id === playerId);
      if (existing) {
        // Reconnecting player reclaims their seat and board.
        existing.connected = true;
        if (playerName.trim()) {
          existing.name = playerName.trim().slice(0, 20);
        }
        playerRooms.set(playerId, normalizedRoomId);
        bindSocket(playerId);
        socket.join(normalizedRoomId);

        console.log(`${existing.name} rejoined room ${normalizedRoomId}`);
        callback(true);
        emitRoomState(room);
        return;
      }

      removePlayer(playerId);

      if (room.players.length >= 8) {
        callback(false, 'Room is full');
        return;
      }

      const player: Player = {
        id: playerId,
        name: playerName.trim().slice(0, 20) || 'Player',
        guesses: [],
        currentGuess: '',
        gameStatus: room.gameStarted ? 'playing' : 'waiting',
        guessResults: [],
        readyForNextRound: false,
        connected: true,
      };

      room.players.push(player);
      playerRooms.set(playerId, normalizedRoomId);
      bindSocket(playerId);
      socket.join(normalizedRoomId);

      console.log(`${player.name} joined room ${normalizedRoomId}`);
      callback(true);

      emitRoomState(room);
    });

    socket.on('startGame', () => {
      const playerId = socketPlayers.get(socket.id);
      if (!playerId) return;

      const roomId = playerRooms.get(playerId);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      if (room.hostId !== playerId) {
        socket.emit('error', 'Only the host can start the game');
        return;
      }

      if (room.gameStarted) {
        socket.emit('error', 'Game already in progress');
        return;
      }

      startRound(room);

      console.log(`Game started in room ${roomId}, word: ${room.targetWord}`);
      emitRoomState(room);
    });

    socket.on('updateCurrentGuess', (guess) => {
      const playerId = socketPlayers.get(socket.id);
      if (!playerId) return;

      const roomId = playerRooms.get(playerId);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room || !room.gameStarted || !room.targetWord) {
        return;
      }

      const player = room.players.find((p) => p.id === playerId);
      if (!player || player.gameStatus !== 'playing') {
        return;
      }

      const normalizedGuess = guess.toUpperCase();
      if (!/^[A-Z]{0,5}$/.test(normalizedGuess)) {
        return;
      }

      if (player.currentGuess === normalizedGuess) {
        return;
      }

      player.currentGuess = normalizedGuess;
      emitRoomState(room);
    });

    socket.on('playAgain', (callback) => {
      const playerId = socketPlayers.get(socket.id);
      if (!playerId) {
        callback(false, 'Room not found');
        return;
      }

      const roomId = playerRooms.get(playerId);
      if (!roomId) {
        callback(false, 'Room not found');
        return;
      }

      const room = rooms.get(roomId);
      if (!room || !room.gameStarted) {
        callback(false, 'Game not started');
        return;
      }

      const player = room.players.find((p) => p.id === playerId);
      if (!player) {
        callback(false, 'Player not found');
        return;
      }

      if (player.gameStatus === 'playing') {
        callback(false, 'Finish this round first');
        return;
      }

      player.readyForNextRound = true;
      emitRoomState(room);
      maybeStartNextRound(room);

      callback(true);
    });

    socket.on('submitGuess', (guess, callback) => {
      const playerId = socketPlayers.get(socket.id);
      if (!playerId) {
        callback(false, 'Room not found');
        return;
      }

      const roomId = playerRooms.get(playerId);
      if (!roomId) {
        callback(false, 'Room not found');
        return;
      }

      const room = rooms.get(roomId);
      if (!room || !room.gameStarted || !room.targetWord) {
        callback(false, 'Game not started');
        return;
      }

      const player = room.players.find((p) => p.id === playerId);
      if (!player || player.gameStatus !== 'playing') {
        callback(false, 'Game already finished');
        return;
      }

      const upperGuess = guess.trim().toUpperCase();

      if (!/^[A-Z]{5}$/.test(upperGuess)) {
        callback(false, 'Not enough letters');
        return;
      }

      if (!isValidWord(upperGuess)) {
        callback(false, 'Not in word list');
        return;
      }

      if (guessSubmitLocks.has(playerId)) {
        callback(true);
        return;
      }

      guessSubmitLocks.add(playerId);
      setTimeout(() => {
        guessSubmitLocks.delete(playerId);
      }, 250);

      const results = evaluateGuess(upperGuess, room.targetWord);
      player.guesses.push(upperGuess);
      player.currentGuess = '';
      player.guessResults.push(results);
      player.readyForNextRound = false;
      callback(true);

      // Check if won
      if (upperGuess === room.targetWord) {
        player.gameStatus = 'won';
        io.to(roomId).emit('playerWon', playerId);
        socket.emit('wordRevealed', room.targetWord);
      } else if (player.guesses.length >= 6) {
        player.gameStatus = 'lost';
        io.to(roomId).emit('playerLost', playerId);
        socket.emit('wordRevealed', room.targetWord);
      }

      emitRoomState(room);
    });

    socket.on('leaveRoom', () => {
      const playerId = socketPlayers.get(socket.id);
      if (!playerId) return;

      const roomId = playerRooms.get(playerId);
      if (roomId) {
        socket.leave(roomId);
      }
      removePlayer(playerId);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);

      const playerId = socketPlayers.get(socket.id);
      socketPlayers.delete(socket.id);
      if (!playerId) return;

      // Only clear the mapping if it still points at this socket — the player
      // may have already reconnected on a newer socket.
      if (playerSockets.get(playerId) !== socket.id) return;
      playerSockets.delete(playerId);

      const roomId = playerRooms.get(playerId);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      const player = room.players.find((p) => p.id === playerId);
      if (!player) return;

      player.connected = false;
      emitRoomState(room);

      cancelRemoval(playerId);
      const timer = setTimeout(() => {
        removalTimers.delete(playerId);
        if (!playerSockets.has(playerId)) {
          console.log(`Removing ${player.name} after disconnect grace period`);
          removePlayer(playerId);
          const currentRoom = rooms.get(roomId);
          if (currentRoom) {
            maybeStartNextRound(currentRoom);
          }
        }
      }, DISCONNECT_GRACE_MS);
      removalTimers.set(playerId, timer);
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
