'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [revealedRows, setRevealedRows] = useState(guessResults.length);
  const [revealingRowIndex, setRevealingRowIndex] = useState<number | null>(null);
  const [revealingTiles, setRevealingTiles] = useState(0);
  const lastGuessCountRef = useRef(guessResults.length);

  useEffect(() => {
    const nextCount = guessResults.length;
    const previousCount = lastGuessCountRef.current;
    const scheduleStateUpdate = (update: () => void) => window.requestAnimationFrame(update);

    if (nextCount === previousCount) {
      return;
    }

    if (nextCount === 0) {
      lastGuessCountRef.current = 0;

      const resetFrame = scheduleStateUpdate(() => {
        setRevealedRows(0);
        setRevealingRowIndex(null);
        setRevealingTiles(0);
      });

      return () => {
        window.cancelAnimationFrame(resetFrame);
      };
    }

    if (nextCount < previousCount) {
      lastGuessCountRef.current = nextCount;

      const rollbackFrame = scheduleStateUpdate(() => {
        setRevealedRows(nextCount);
        setRevealingRowIndex(null);
        setRevealingTiles(0);
      });

      return () => {
        window.cancelAnimationFrame(rollbackFrame);
      };
    }

    lastGuessCountRef.current = nextCount;

    const startFrame = scheduleStateUpdate(() => {
      setRevealingRowIndex(nextCount - 1);
      setRevealingTiles(0);
    });

    let revealed = 0;
    let finalizeTimeout: number | undefined;
    const revealInterval = window.setInterval(() => {
      revealed += 1;
      setRevealingTiles(revealed);

      if (revealed >= 5) {
        window.clearInterval(revealInterval);
        finalizeTimeout = window.setTimeout(() => {
          setRevealedRows(nextCount);
          setRevealingRowIndex(null);
          setRevealingTiles(0);
        }, 140);
      }
    }, 250);

    return () => {
      window.cancelAnimationFrame(startFrame);
      window.clearInterval(revealInterval);
      if (finalizeTimeout) {
        window.clearTimeout(finalizeTimeout);
      }
    };
  }, [guessResults.length]);

  const hasPendingReveal = revealingRowIndex !== null || revealedRows < guessResults.length;
  const statusIcon = !hasPendingReveal && (gameStatus === 'won' || gameStatus === 'lost')
    ? gameStatus === 'won'
      ? '🎉'
      : '😢'
    : '';

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
                const isFullyRevealed = rowIndex < revealedRows;
                const isRevealingRow = rowIndex === revealingRowIndex;
                const isRevealedTile = isRevealingRow && colIndex < revealingTiles;
                const shouldReveal = isFullyRevealed || isRevealedTile;
                const state: LetterState = result ? (shouldReveal ? result.state : 'tbd') : 'empty';
                return (
                  <div
                    key={colIndex}
                    className={`wordle-tile w-4 h-4 ${stateColors[state]} rounded-sm ${isRevealedTile ? 'animate-flip' : ''}`}
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
