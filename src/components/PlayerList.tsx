'use client';

import { Player } from '@/lib/types';

interface PlayerListProps {
  players: Player[];
  currentPlayerId: string;
  hostId: string;
}

const statusEmoji: Record<string, string> = {
  waiting: '⏳',
  playing: '🎮',
  won: '🎉',
  lost: '😢',
};

const statusColors: Record<string, string> = {
  waiting: 'text-zinc-400',
  playing: 'text-blue-400',
  won: 'text-green-400',
  lost: 'text-red-400',
};

export default function PlayerList({ players, currentPlayerId, hostId }: PlayerListProps) {
  return (
    <div className="bg-zinc-800 rounded-lg p-4 w-full max-w-xs">
      <h3 className="text-lg font-bold text-white mb-3">Players ({players.length})</h3>
      <div className="space-y-2">
        {players.map((player) => (
          <div
            key={player.id}
            className={`flex items-center justify-between p-2 rounded ${
              player.id === currentPlayerId ? 'bg-zinc-700' : 'bg-zinc-900'
            }`}
          >
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-white font-medium">
                {player.name}
                {player.id === currentPlayerId && ' (You)'}
                {player.id === hostId && ' 👑'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-sm ${statusColors[player.gameStatus]}`}>
                {player.guesses.length}/6
              </span>
              <span>{statusEmoji[player.gameStatus]}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
