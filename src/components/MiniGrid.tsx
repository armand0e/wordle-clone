'use client';

import { LetterResult, LetterState } from '@/lib/types';

interface MiniGridProps {
  guessResults: LetterResult[][];
  playerName: string;
  gameStatus: 'waiting' | 'playing' | 'won' | 'lost';
  isCurrentPlayer?: boolean;
}

const stateColors: Record<LetterState, string> = {
  correct: 'bg-[var(--wordle-correct)]',
  present: 'bg-[var(--wordle-present)]',
  absent: 'bg-[var(--wordle-absent)]',
  empty: 'bg-[var(--wordle-bg)] border border-[var(--wordle-border-empty)]',
  tbd: 'bg-[var(--wordle-key-default)]',
};

export default function MiniGrid({ guessResults, playerName, gameStatus, isCurrentPlayer }: MiniGridProps) {
  const statusIcon = gameStatus === 'won' ? '🎉' : gameStatus === 'lost' ? '😢' : '';

  return (
    <div className={`bg-zinc-800 rounded-lg p-3 ${isCurrentPlayer ? 'ring-2 ring-blue-500' : ''}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-white text-sm font-medium truncate max-w-[100px]">
          {playerName} {isCurrentPlayer && '(You)'}
        </span>
        <span>{statusIcon}</span>
      </div>
      <div className="grid gap-0.5">
        {Array.from({ length: 6 }).map((_, rowIndex) => {
          const guess = guessResults[rowIndex];
          return (
            <div key={rowIndex} className="grid grid-cols-5 gap-0.5">
              {Array.from({ length: 5 }).map((_, colIndex) => {
                const result = guess?.[colIndex];
                const state = result?.state || 'empty';
                return (
                  <div
                    key={colIndex}
                    className={`w-4 h-4 ${stateColors[state]} rounded-sm`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
