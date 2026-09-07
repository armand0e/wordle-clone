import { io } from 'socket.io-client';

const BASE_URL = process.env.SMOKE_URL || 'http://localhost:3000';
const GUESS_WORD = (process.env.SMOKE_GUESS || 'ABOUT').toUpperCase();
const TIMEOUT_MS = 20000;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout(promise, label, timeoutMs = TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Timed out waiting for ${label}`)), timeoutMs);
    }),
  ]);
}

function connectClient(label) {
  return withTimeout(
    new Promise((resolve, reject) => {
      const socket = io(BASE_URL, {
        transports: ['websocket'],
      });

      const cleanup = () => {
        socket.off('connect', onConnect);
        socket.off('connect_error', onError);
      };

      const onConnect = () => {
        cleanup();
        resolve(socket);
      };

      const onError = (error) => {
        cleanup();
        reject(new Error(`${label} failed to connect: ${error.message}`));
      };

      socket.on('connect', onConnect);
      socket.on('connect_error', onError);
    }),
    `${label} socket connection`,
  );
}

function emitAck(socket, event, ...args) {
  return withTimeout(
    new Promise((resolve) => {
      socket.emit(event, ...args, (...ackArgs) => {
        resolve(ackArgs);
      });
    }),
    `${event} ack`,
  );
}

function createRoom(socket, playerName) {
  return withTimeout(
    new Promise((resolve) => {
      socket.emit('createRoom', playerName, `smoke-${playerName}-token`, (roomId) => resolve(roomId));
    }),
    'createRoom',
  );
}

async function waitForState(label, getState, predicate, description, timeoutMs = TIMEOUT_MS) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = getState();
    if (state && predicate(state)) {
      return state;
    }
    await delay(50);
  }
  throw new Error(`${label}: timed out waiting for ${description}`);
}

async function finishRound(socket, getRoomState, playerId) {
  for (let i = 0; i < 6; i += 1) {
    const room = getRoomState();
    const me = room?.players.find((player) => player.id === playerId);
    if (!me) {
      throw new Error('player not found while finishing round');
    }

    if (me.gameStatus !== 'playing') {
      return;
    }

    const guessCountBefore = me.guesses.length;
    socket.emit('submitGuess', GUESS_WORD, () => {
      // submitGuess ack is intentionally ignored here; state progression is more reliable for smoke tests.
    });

    await waitForState(
      'submitGuess propagation',
      getRoomState,
      (state) => {
        const player = state.players.find((p) => p.id === playerId);
        return !!player && player.guesses.length > guessCountBefore;
      },
      `guess ${i + 1} to be registered`,
    );
  }
}

async function main() {
  const socketA = await connectClient('Player A');
  const socketB = await connectClient('Player B');

  const stateBySocket = new Map();
  socketA.on('roomState', (room) => stateBySocket.set(socketA.id, room));
  socketB.on('roomState', (room) => stateBySocket.set(socketB.id, room));

  try {
    const roomId = await createRoom(socketA, 'SmokeA');

    const [joinSuccess, joinError] = await emitAck(socketB, 'joinRoom', roomId, 'SmokeB', 'smoke-SmokeB-token');
    if (!joinSuccess) {
      throw new Error(`joinRoom failed: ${joinError || 'unknown error'}`);
    }

    await Promise.all([
      waitForState('Player A', () => stateBySocket.get(socketA.id), (room) => room.players.length === 2, 'both players in room'),
      waitForState('Player B', () => stateBySocket.get(socketB.id), (room) => room.players.length === 2, 'both players in room'),
    ]);

    socketA.emit('startGame');

    const roomAfterStart = await waitForState(
      'startGame',
      () => stateBySocket.get(socketA.id),
      (room) => room.gameStarted && room.players.every((player) => player.gameStatus === 'playing'),
      'round start',
    );

    const playerAId = roomAfterStart.players.find((player) => player.name === 'SmokeA')?.id;
    const playerBId = roomAfterStart.players.find((player) => player.name === 'SmokeB')?.id;

    if (!playerAId || !playerBId) {
      throw new Error('could not resolve player IDs from room state');
    }

    await finishRound(socketA, () => stateBySocket.get(socketA.id), playerAId);
    await finishRound(socketB, () => stateBySocket.get(socketB.id), playerBId);

    await Promise.all([
      waitForState(
        'Player A finish',
        () => stateBySocket.get(socketA.id),
        (room) => {
          const me = room.players.find((player) => player.id === playerAId);
          return !!me && me.gameStatus !== 'playing';
        },
        'player A to finish round',
      ),
      waitForState(
        'Player B finish',
        () => stateBySocket.get(socketB.id),
        (room) => {
          const me = room.players.find((player) => player.id === playerBId);
          return !!me && me.gameStatus !== 'playing';
        },
        'player B to finish round',
      ),
    ]);

    const [playAgainA] = await emitAck(socketA, 'playAgain');
    if (!playAgainA) {
      throw new Error('player A failed to set playAgain ready state');
    }

    const [playAgainB] = await emitAck(socketB, 'playAgain');
    if (!playAgainB) {
      throw new Error('player B failed to set playAgain ready state');
    }

    await Promise.all([
      waitForState(
        'round restart A',
        () => stateBySocket.get(socketA.id),
        (room) => room.players.every((player) => player.gameStatus === 'playing' && player.guesses.length === 0),
        'new round reset for player A',
      ),
      waitForState(
        'round restart B',
        () => stateBySocket.get(socketB.id),
        (room) => room.players.every((player) => player.gameStatus === 'playing' && player.guesses.length === 0),
        'new round reset for player B',
      ),
    ]);

    console.log('Smoke test passed: create/join/start/guess/finish/rematch flow works for 2 players.');
  } finally {
    socketA.disconnect();
    socketB.disconnect();
  }
}

main().catch((error) => {
  console.error('Smoke test failed:', error.message);
  process.exitCode = 1;
});
