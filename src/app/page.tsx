'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';

export default function Home() {
  const router = useRouter();
  const { createRoom, joinRoom, isConnected, error, clearError } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [mode, setMode] = useState<'menu' | 'create' | 'join'>('menu');
  const [isLoading, setIsLoading] = useState(false);

  const handleCreate = async () => {
    if (!playerName.trim()) return;
    clearError();
    setIsLoading(true);

    try {
      const { roomId } = await createRoom(playerName.trim());
      router.push(`/room/${roomId}`);
    } catch {
      // Error state is set in SocketContext.
    } finally {
      setIsLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!playerName.trim() || !joinCode.trim()) return;
    clearError();
    setIsLoading(true);

    try {
      const roomId = joinCode.trim().toUpperCase();
      const result = await joinRoom(roomId, playerName.trim());

      if (result.success) {
        router.push(`/room/${roomId}`);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-900 flex flex-col items-center justify-center p-4">
      <div className="text-center mb-12">
        <h1 className="text-6xl font-bold text-white mb-4">
          <span className="text-green-500">W</span>
          <span className="text-yellow-500">O</span>
          <span className="text-green-500">R</span>
          <span className="text-zinc-400">D</span>
          <span className="text-yellow-500">L</span>
          <span className="text-green-500">E</span>
        </h1>
        <h2 className="text-2xl text-zinc-400 font-medium">Party Mode</h2>
        <p className="text-zinc-500 mt-2">Play Wordle with your friends!</p>
      </div>

      {error && (
        <div className="mb-5 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {!isConnected ? (
        <div className="text-white">Connecting to server...</div>
      ) : mode === 'menu' ? (
        <div className="flex flex-col gap-4 w-full max-w-xs">
          <button
            onClick={() => {
              clearError();
              setMode('create');
            }}
            className="w-full py-4 rounded-lg bg-green-600 hover:bg-green-500 text-white font-bold text-lg transition-colors"
          >
            Create Room
          </button>
          <button
            onClick={() => {
              clearError();
              setMode('join');
            }}
            className="w-full py-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-lg transition-colors"
          >
            Join Room
          </button>
        </div>
      ) : mode === 'create' ? (
        <div className="bg-zinc-800 rounded-lg p-6 w-full max-w-sm">
          <h3 className="text-xl font-bold text-white mb-4">Create a Room</h3>
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            maxLength={20}
            className="w-full px-4 py-3 rounded-lg bg-zinc-700 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
            autoFocus
          />
          <button
            onClick={handleCreate}
            disabled={!playerName.trim() || isLoading}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-colors ${
              playerName.trim() && !isLoading
                ? 'bg-green-600 hover:bg-green-500 text-white'
                : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Creating...' : 'Create'}
          </button>
          <button
            onClick={() => {
              clearError();
              setMode('menu');
            }}
            className="w-full mt-3 text-zinc-400 hover:text-zinc-300"
          >
            Back
          </button>
        </div>
      ) : (
        <div className="bg-zinc-800 rounded-lg p-6 w-full max-w-sm">
          <h3 className="text-xl font-bold text-white mb-4">Join a Room</h3>
          <input
            type="text"
            placeholder="Your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            maxLength={20}
            className="w-full px-4 py-3 rounded-lg bg-zinc-700 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"
            autoFocus
          />
          <input
            type="text"
            placeholder="Room code"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={6}
            className="w-full px-4 py-3 rounded-lg bg-zinc-700 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4 font-mono text-center text-xl tracking-wider"
          />
          <button
            onClick={handleJoin}
            disabled={!playerName.trim() || !joinCode.trim() || isLoading}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-colors ${
              playerName.trim() && joinCode.trim() && !isLoading
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {isLoading ? 'Joining...' : 'Join'}
          </button>
          <button
            onClick={() => {
              clearError();
              setMode('menu');
            }}
            className="w-full mt-3 text-zinc-400 hover:text-zinc-300"
          >
            Back
          </button>
        </div>
      )}

      <div className="mt-12 text-zinc-600 text-sm">
        <p>6 tries • 5 letters • Same word for everyone</p>
      </div>
    </div>
  );
}
