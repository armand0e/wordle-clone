'use client';

import { useEffect, useRef, useState } from 'react';
import { LetterResult, LetterState } from '@/lib/types';

interface MiniGridProps {
  guessResults: LetterResult[][];
  currentGuess: string;
  playerName: string;
  gameStatus: 'waiting' | 'playing' | 'won' | 'lost';
  onSelect?: () => void;
  isSelected?: boolean;
  isCurrentPlayer?: boolean;
  size?: 'default' | 'compact';
}

const stateColors: Record<LetterState, string> = {
  correct: 'bg-[var(--wordle-correct)]',
  present: 'bg-[var(--wordle-present)]',
  absent: 'bg-[var(--wordle-absent)]',
  empty: 'bg-[var(--wordle-bg)] border border-[var(--wordle-border-empty)]',
  tbd: 'bg-[var(--wordle-key-default)]',
};

export default function MiniGrid({
  guessResults,
  currentGuess,
  playerName,
  gameStatus,
  onSelect,
  isSelected = false,
  isCurrentPlayer,
  size = 'default',
}: MiniGridProps) {
  const isCompact = size === 'compact';
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

  const containerClasses = [
    'w-fit shrink-0 bg-zinc-800 rounded-lg text-left',
    isCompact ? 'p-1' : 'p-3',
    isCurrentPlayer ? 'ring-2 ring-blue-500' : '',
    isSelected ? (isCompact ? 'ring-1 ring-yellow-400' : 'ring-2 ring-yellow-400') : '',
    onSelect ? 'cursor-pointer transition-colors hover:bg-zinc-700/80' : '',
  ].join(' ');

  const tileGap = isCompact ? 'gap-px' : 'gap-0.5';

  const content = (
    <>
      <div className={`flex items-center justify-between gap-1 ${isCompact ? 'mb-0.5' : 'mb-2'}`}>
        <span className={`text-white font-medium truncate ${isCompact ? 'text-[9px] leading-3 max-w-[44px]' : 'text-sm max-w-[100px]'}`}>
          {playerName} {isCurrentPlayer && '(You)'}
        </span>
        <span className={isCompact ? 'text-[9px] leading-3' : ''}>{statusIcon}</span>
      </div>
      <div className={`grid w-fit ${tileGap}`}>
        {Array.from({ length: 6 }).map((_, rowIndex) => {
          const guess = guessResults[rowIndex];
          return (
            <div key={rowIndex} className={`grid w-fit grid-cols-5 ${tileGap}`}>
              {Array.from({ length: 5 }).map((_, colIndex) => {
                const result = guess?.[colIndex];
                const isCurrentGuessRow = rowIndex === guessResults.length && rowIndex < 6;
                const hasCurrentLetter = isCurrentGuessRow && Boolean(currentGuess[colIndex]);
                const isFullyRevealed = rowIndex < revealedRows;
                const isRevealingRow = rowIndex === revealingRowIndex;
                const isRevealedTile = isRevealingRow && colIndex < revealingTiles;
                const shouldReveal = isFullyRevealed || isRevealedTile;
                const state: LetterState = result
                  ? (shouldReveal ? result.state : 'tbd')
                  : hasCurrentLetter
                    ? 'tbd'
                    : 'empty';
                return (
                  <div
                    key={colIndex}
                    className={`wordle-tile ${isCompact ? 'w-2 h-2 rounded-[2px]' : 'w-4 h-4 rounded-sm'} ${stateColors[state]} ${isRevealedTile ? 'animate-flip' : ''}`}
                  />
                );
              })}
            </div>
          );
        })}
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Spectate ${playerName}`}
        className={containerClasses}
      >
        {content}
      </button>
    );
  }

  return <div className={containerClasses}>{content}</div>;
}
