'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback, useMemo } from 'react';
import { io, Socket } from 'socket.io-client';
import {
  Room,
  ClientToServerEvents,
  ServerToClientEvents,
  ActionResult,
  CreateRoomResult,
  JoinRoomResult,
} from '@/lib/types';

interface SocketContextType {
  isConnected: boolean;
  room: Room | null;
  playerId: string | null;
  error: string | null;
  revealedWord: string | null;
  createRoom: (playerName: string) => Promise<CreateRoomResult>;
  joinRoom: (roomId: string, playerName: string) => Promise<JoinRoomResult>;
  startGame: () => void;
  updateCurrentGuess: (guess: string) => void;
  submitGuess: (guess: string) => Promise<ActionResult>;
  playAgain: () => Promise<ActionResult>;
  leaveRoom: () => void;
  clearError: () => void;
}

const SocketContext = createContext<SocketContextType | null>(null);

let globalSocket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

function getSocket(): Socket<ServerToClientEvents, ClientToServerEvents> {
  if (!globalSocket) {
    globalSocket = io({
      autoConnect: true,
    });
  }
  return globalSocket;
}

export function SocketProvider({ children }: { children: ReactNode }) {
  const [isConnected, setIsConnected] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealedWord, setRevealedWord] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();

    const onConnect = () => {
      setIsConnected(true);
      setPlayerId(socket.id || null);
    };

    const onDisconnect = () => {
      setIsConnected(false);
      setRoom(null);
      setRevealedWord(null);
    };

    const onRoomState = (newRoom: Room) => {
      setRoom(newRoom);
      const roundReset = newRoom.players.some(
        (player) => player.gameStatus === 'playing' && player.guesses.length === 0,
      );
      if (!newRoom.gameStarted || roundReset) {
        setRevealedWord(null);
      }
    };

    const onError = (message: string) => {
      setError(message);
      setTimeout(() => setError(null), 3000);
    };

    const onWordRevealed = (word: string) => {
      setRevealedWord(word);
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('roomState', onRoomState);
    socket.on('error', onError);
    socket.on('wordRevealed', onWordRevealed);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('roomState', onRoomState);
      socket.off('error', onError);
      socket.off('wordRevealed', onWordRevealed);
    };
  }, []);

  const createRoom = useCallback((playerName: string): Promise<CreateRoomResult> => {
    return new Promise((resolve, reject) => {
      const socket = getSocket();
      if (!socket.connected) {
        const message = 'Not connected to server';
        setError(message);
        reject(new Error(message));
        return;
      }

      socket.emit('createRoom', playerName, (roomId) => {
        resolve({ roomId });
      });
    });
  }, []);

  const joinRoom = useCallback((roomId: string, playerName: string): Promise<JoinRoomResult> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      if (!socket.connected) {
        const message = 'Not connected to server';
        setError(message);
        resolve({ success: false, error: message });
        return;
      }

      socket.emit('joinRoom', roomId, playerName, (success, errorMsg) => {
        if (!success) {
          const message = errorMsg || 'Failed to join room';
          setError(message);
          resolve({ success: false, error: message });
          return;
        }

        resolve({ success: true });
      });
    });
  }, []);

  const playAgain = useCallback((): Promise<ActionResult> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      if (!socket.connected) {
        const message = 'Not connected to server';
        setError(message);
        resolve({ success: false, error: message });
        return;
      }

      socket.emit('playAgain', (success, errorMsg) => {
        if (!success) {
          if (errorMsg) {
            setError(errorMsg);
          }
          resolve({ success: false, error: errorMsg });
          return;
        }

        setRevealedWord(null);
        resolve({ success: true });
      });
    });
  }, []);

  const startGame = useCallback(() => {
    const socket = getSocket();
    setRevealedWord(null);
    socket.emit('startGame');
  }, []);

  const updateCurrentGuess = useCallback((guess: string) => {
    const socket = getSocket();
    if (!socket.connected) {
      return;
    }

    socket.emit('updateCurrentGuess', guess);
  }, []);

  const submitGuess = useCallback((guess: string): Promise<ActionResult> => {
    return new Promise((resolve) => {
      const socket = getSocket();
      if (!socket.connected) {
        const message = 'Not connected to server';
        setError(message);
        resolve({ success: false, error: message });
        return;
      }

      socket.emit('submitGuess', guess, (success, errorMsg) => {
        if (!success) {
          if (errorMsg) {
            setError(errorMsg);
          }
          resolve({ success: false, error: errorMsg });
          return;
        }

        resolve({ success: true });
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    const socket = getSocket();
    socket.emit('leaveRoom');
    setRoom(null);
    setRevealedWord(null);
    setError(null);
  }, []);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const value = useMemo(() => ({
    isConnected,
    room,
    playerId,
    error,
    revealedWord,
    createRoom,
    joinRoom,
    startGame,
    updateCurrentGuess,
    submitGuess,
    playAgain,
    leaveRoom,
    clearError,
  }), [
    isConnected,
    room,
    playerId,
    error,
    revealedWord,
    createRoom,
    joinRoom,
    startGame,
    updateCurrentGuess,
    submitGuess,
    playAgain,
    leaveRoom,
    clearError,
  ]);

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
}
