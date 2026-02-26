'use client';

import { useSocket } from '@/context/SocketContext';
import PlayerList from './PlayerList';

export default function Lobby() {
  const { room, playerId, startGame, leaveRoom } = useSocket();

  if (!room || !playerId) {
    return <div className="text-white">Loading...</div>;
  }

  const isHost = room.hostId === playerId;
  const canStart = room.players.length >= 1;

  const copyRoomLink = () => {
    const url = `${window.location.origin}/room/${room.id}`;
    navigator.clipboard.writeText(url);
  };

  return (
    <div className="flex flex-col items-center gap-6 p-8">
      <h1 className="text-4xl font-bold text-white">Wordle Party</h1>
      
      <div className="bg-zinc-800 rounded-lg p-6 text-center">
        <p className="text-zinc-400 text-sm mb-2">Room Code</p>
        <p className="text-4xl font-mono font-bold text-white tracking-wider">{room.id}</p>
        <button
          onClick={copyRoomLink}
          className="mt-3 text-blue-400 hover:text-blue-300 text-sm underline"
        >
          Copy invite link
        </button>
      </div>

      <PlayerList
        players={room.players}
        currentPlayerId={playerId}
        hostId={room.hostId}
      />

      <div className="flex gap-4">
        {isHost ? (
          <button
            onClick={startGame}
            disabled={!canStart}
            className={`px-8 py-3 rounded-lg font-bold text-lg transition-colors ${
              canStart
                ? 'bg-green-600 hover:bg-green-500 text-white cursor-pointer'
                : 'bg-zinc-600 text-zinc-400 cursor-not-allowed'
            }`}
          >
            Start Game
          </button>
        ) : (
          <p className="text-zinc-400 text-lg">Waiting for host to start...</p>
        )}
      </div>

      <button
        onClick={leaveRoom}
        className="text-red-400 hover:text-red-300 underline"
      >
        Leave Room
      </button>
    </div>
  );
}
