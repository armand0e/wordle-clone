"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const next_1 = __importDefault(require("next"));
const uuid_1 = require("uuid");
const game_1 = require("./src/lib/game");
const words_1 = require("./src/lib/words");
const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);
const app = (0, next_1.default)({ dev, hostname, port });
const handler = app.getRequestHandler();
const rooms = new Map();
const playerRooms = new Map(); // socketId -> roomId
const guessSubmitLocks = new Set();
function toClientRoomForPlayer(room, viewerId) {
    const viewer = room.players.find((player) => player.id === viewerId);
    const canViewOthersLiveBoards = viewer?.gameStatus === 'won';
    return {
        ...room,
        targetWord: null,
        players: room.players.map((player) => {
            if (player.id === viewerId || canViewOthersLiveBoards) {
                return { ...player };
            }
            return {
                ...player,
                guesses: [],
                currentGuess: '',
                guessResults: [],
            };
        }),
    };
}
function startRound(room) {
    room.targetWord = (0, words_1.getRandomWord)();
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
    const httpServer = (0, http_1.createServer)((req, res) => {
        handler(req, res);
    });
    const io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: '*',
            methods: ['GET', 'POST'],
        },
    });
    const emitRoomState = (room) => {
        room.players.forEach((player) => {
            io.to(player.id).emit('roomState', toClientRoomForPlayer(room, player.id));
        });
    };
    io.on('connection', (socket) => {
        console.log('Client connected:', socket.id);
        socket.on('createRoom', (playerName, callback) => {
            handleDisconnect(socket.id);
            let roomId = (0, uuid_1.v4)().substring(0, 6).toUpperCase();
            while (rooms.has(roomId)) {
                roomId = (0, uuid_1.v4)().substring(0, 6).toUpperCase();
            }
            const player = {
                id: socket.id,
                name: playerName.trim().slice(0, 20) || 'Player',
                guesses: [],
                currentGuess: '',
                gameStatus: 'waiting',
                guessResults: [],
                readyForNextRound: false,
            };
            const room = {
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
            emitRoomState(room);
        });
        socket.on('joinRoom', (roomId, playerName, callback) => {
            handleDisconnect(socket.id);
            const room = rooms.get(roomId.toUpperCase());
            if (!room) {
                callback(false, 'Room not found');
                return;
            }
            if (room.players.length >= 8) {
                callback(false, 'Room is full');
                return;
            }
            const player = {
                id: socket.id,
                name: playerName.trim().slice(0, 20) || 'Player',
                guesses: [],
                currentGuess: '',
                gameStatus: room.gameStarted ? 'playing' : 'waiting',
                guessResults: [],
                readyForNextRound: false,
            };
            room.players.push(player);
            playerRooms.set(socket.id, roomId.toUpperCase());
            socket.join(roomId.toUpperCase());
            console.log(`${player.name} joined room ${roomId}`);
            callback(true);
            emitRoomState(room);
        });
        socket.on('startGame', () => {
            const roomId = playerRooms.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (!room)
                return;
            if (room.hostId !== socket.id) {
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
            const roomId = playerRooms.get(socket.id);
            if (!roomId)
                return;
            const room = rooms.get(roomId);
            if (!room || !room.gameStarted || !room.targetWord) {
                return;
            }
            const player = room.players.find((p) => p.id === socket.id);
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
            emitRoomState(room);
            const everyoneReady = room.players.length > 0 && room.players.every((p) => p.readyForNextRound);
            if (everyoneReady) {
                startRound(room);
                emitRoomState(room);
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
            if (!(0, words_1.isValidWord)(upperGuess)) {
                callback(false, 'Not in word list');
                return;
            }
            if (guessSubmitLocks.has(socket.id)) {
                callback(true);
                return;
            }
            guessSubmitLocks.add(socket.id);
            setTimeout(() => {
                guessSubmitLocks.delete(socket.id);
            }, 250);
            const results = (0, game_1.evaluateGuess)(upperGuess, room.targetWord);
            player.guesses.push(upperGuess);
            player.currentGuess = '';
            player.guessResults.push(results);
            player.readyForNextRound = false;
            callback(true);
            // Check if won
            if (upperGuess === room.targetWord) {
                player.gameStatus = 'won';
                io.to(roomId).emit('playerWon', socket.id);
                socket.emit('wordRevealed', room.targetWord);
            }
            else if (player.guesses.length >= 6) {
                player.gameStatus = 'lost';
                io.to(roomId).emit('playerLost', socket.id);
                socket.emit('wordRevealed', room.targetWord);
            }
            emitRoomState(room);
        });
        socket.on('leaveRoom', () => {
            handleDisconnect(socket.id);
        });
        socket.on('disconnect', () => {
            console.log('Client disconnected:', socket.id);
            handleDisconnect(socket.id);
        });
        function handleDisconnect(socketId) {
            guessSubmitLocks.delete(socketId);
            const roomId = playerRooms.get(socketId);
            if (!roomId)
                return;
            socket.leave(roomId);
            const room = rooms.get(roomId);
            if (!room)
                return;
            room.players = room.players.filter((p) => p.id !== socketId);
            playerRooms.delete(socketId);
            if (room.players.length === 0) {
                rooms.delete(roomId);
                console.log(`Room ${roomId} deleted (empty)`);
            }
            else {
                // If host left, assign new host
                if (room.hostId === socketId) {
                    room.hostId = room.players[0].id;
                }
                emitRoomState(room);
                io.to(roomId).emit('playerLeft', socketId);
            }
        }
    });
    httpServer.listen(port, () => {
        console.log(`> Ready on http://${hostname}:${port}`);
    });
});
