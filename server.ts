import { createServer } from 'http';
import { Server } from 'socket.io';
import next from 'next';
import { v4 as uuidv4 } from 'uuid';
import { Room, Player, ClientToServerEvents, ServerToClientEvents } from './src/lib/types';
import { evaluateGuess } from './src/lib/game';
import { getRandomWord, isValidWord } from './src/lib/words';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

const rooms: Map<string, Room> = new Map();
const playerRooms: Map<string, string> = new Map(); // socketId -> roomId

function toClientRoom(room: Room): Room {
  return {
    ...room,
    targetWord: null,
  };
}

function startRound(room: Room) {
  room.targetWord = getRandomWord();
  room.gameStarted = true;

  room.players.forEach((player) => {
    player.guesses = [];
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

  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('createRoom', (playerName, callback) => {
      handleDisconnect(socket.id);

      let roomId = uuidv4().substring(0, 6).toUpperCase();
      while (rooms.has(roomId)) {
        roomId = uuidv4().substring(0, 6).toUpperCase();
      }

      const player: Player = {
        id: socket.id,
        name: playerName.trim().slice(0, 20) || 'Player',
        guesses: [],
        gameStatus: 'waiting',
        guessResults: [],
        readyForNextRound: false,
      };

      const room: Room = {
        id: roomId,
        players: [player],
        targetWord: null,
        gameStarted: false,
        hostId: socket.id,
        createdAt: Date.now(),
      };

      rooms.set(roomId, room);
      playerRooms.set(socket.id, roomId);
      socket.join(roomId);

      console.log(`Room ${roomId} created by ${player.name}`);
      callback(roomId);
      socket.emit('roomState', toClientRoom(room));
    });

    socket.on('joinRoom', (roomId, playerName, callback) => {
      handleDisconnect(socket.id);

      const room = rooms.get(roomId.toUpperCase());

      if (!room) {
        callback(false, 'Room not found');
        return;
      }

      if (room.gameStarted) {
        callback(false, 'Game already started');
        return;
      }

      if (room.players.length >= 8) {
        callback(false, 'Room is full');
        return;
      }

      const player: Player = {
        id: socket.id,
        name: playerName.trim().slice(0, 20) || 'Player',
        guesses: [],
        gameStatus: 'waiting',
        guessResults: [],
        readyForNextRound: false,
      };

      room.players.push(player);
      playerRooms.set(socket.id, roomId.toUpperCase());
      socket.join(roomId.toUpperCase());

      console.log(`${player.name} joined room ${roomId}`);
      callback(true);

      io.to(roomId.toUpperCase()).emit('roomState', toClientRoom(room));
    });

    socket.on('startGame', () => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) return;

      const room = rooms.get(roomId);
      if (!room) return;

      if (room.hostId !== socket.id) {
        socket.emit('error', 'Only the host can start the game');
        return;
      }

      startRound(room);

      console.log(`Game started in room ${roomId}, word: ${room.targetWord}`);
      io.to(roomId).emit('roomState', toClientRoom(room));
    });

    socket.on('playAgain', (callback) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        callback(false, 'Room not found');
        return;
      }

      const room = rooms.get(roomId);
      if (!room || !room.gameStarted) {
        callback(false, 'Game not started');
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);
      if (!player) {
        callback(false, 'Player not found');
        return;
      }

      if (player.gameStatus === 'playing') {
        callback(false, 'Finish this round first');
        return;
      }

      player.readyForNextRound = true;
      io.to(roomId).emit('roomState', toClientRoom(room));

      const everyoneReady = room.players.length > 0 && room.players.every((p) => p.readyForNextRound);
      if (everyoneReady) {
        startRound(room);
        io.to(roomId).emit('roomState', toClientRoom(room));
      }

      callback(true);
    });

    socket.on('submitGuess', (guess, callback) => {
      const roomId = playerRooms.get(socket.id);
      if (!roomId) {
        callback(false, 'Room not found');
        return;
      }

      const room = rooms.get(roomId);
      if (!room || !room.gameStarted || !room.targetWord) {
        callback(false, 'Game not started');
        return;
      }

      const player = room.players.find((p) => p.id === socket.id);
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

      const results = evaluateGuess(upperGuess, room.targetWord);
      player.guesses.push(upperGuess);
      player.guessResults.push(results);
      player.readyForNextRound = false;
      callback(true);

      // Check if won
      if (upperGuess === room.targetWord) {
        player.gameStatus = 'won';
        io.to(roomId).emit('playerWon', socket.id);
        socket.emit('wordRevealed', room.targetWord);
      } else if (player.guesses.length >= 6) {
        player.gameStatus = 'lost';
        io.to(roomId).emit('playerLost', socket.id);
        socket.emit('wordRevealed', room.targetWord);
      }

      io.to(roomId).emit('roomState', toClientRoom(room));
    });

    socket.on('leaveRoom', () => {
      handleDisconnect(socket.id);
    });

    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      handleDisconnect(socket.id);
    });

    function handleDisconnect(socketId: string) {
      const roomId = playerRooms.get(socketId);
      if (!roomId) return;

      socket.leave(roomId);

      const room = rooms.get(roomId);
      if (!room) return;

      room.players = room.players.filter((p) => p.id !== socketId);
      playerRooms.delete(socketId);

      if (room.players.length === 0) {
        rooms.delete(roomId);
        console.log(`Room ${roomId} deleted (empty)`);
      } else {
        // If host left, assign new host
        if (room.hostId === socketId) {
          room.hostId = room.players[0].id;
        }
        io.to(roomId).emit('roomState', toClientRoom(room));
        io.to(roomId).emit('playerLeft', socketId);
      }
    }
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
