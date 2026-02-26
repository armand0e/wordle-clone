'use client';

import { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSocket } from '@/context/SocketContext';
import Lobby from '@/components/Lobby';
import Game from '@/components/Game';

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.roomId as string;
  const { room, playerId, joinRoom, isConnected, error, clearError } = useSocket();
  const [playerName, setPlayerName] = useState('');
  const [isJoining, setIsJoining] = useState(false);

  const hasJoined = useMemo(() => {
    if (room && playerId) {
      return room.players.some(p => p.id === playerId);
    }
    return false;
  }, [room, playerId]);

  const handleJoin = async () => {
    if (!playerName.trim()) return;
    clearError();
    setIsJoining(true);

    const result = await joinRoom(roomId, playerName.trim());
    if (!result.success) {
      setIsJoining(false);
    }
  };

  if (!isConnected) {
    return (
      <div className="wordle-viewport min-h-dvh bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-xl">Connecting...</div>
      </div>
    );
  }

  if (!hasJoined) {
    return (
      <div className="wordle-viewport min-h-dvh bg-zinc-900 flex items-center justify-center p-4">
        <div className="bg-zinc-800 rounded-lg p-8 max-w-md w-full mx-4">
          <h1 className="text-3xl font-bold text-white mb-2 text-center">Join Room</h1>
          <p className="text-zinc-400 text-center mb-6">Room: {roomId}</p>

          {error && (
            <div className="mb-4 rounded-lg bg-red-100 px-4 py-2 text-sm font-medium text-red-700">
              {error}
            </div>
          )}

          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
            maxLength={20}
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            className="w-full px-4 py-3 rounded-lg bg-zinc-700 text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-green-500 mb-4"
          />

          <button
            onClick={handleJoin}
            disabled={!playerName.trim() || isJoining}
            className={`w-full py-3 rounded-lg font-bold text-lg transition-colors ${
              playerName.trim() && !isJoining
                ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
                : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`}
          >
            {isJoining ? 'Joining...' : 'Join Game'}
          </button>

          <button
            onClick={() => router.push('/')}
            className="w-full mt-4 text-zinc-400 hover:text-zinc-300"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="wordle-viewport min-h-dvh bg-zinc-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading room...</div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-900">
      {room.gameStarted ? <Game /> : <Lobby />}
    </div>
  );
}
