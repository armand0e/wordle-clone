'use client';

import { LetterResult, LetterState } from '@/lib/types';

interface GridProps {
  guessResults: LetterResult[][];
  currentGuess: string;
  maxGuesses?: number;
  revealedRows?: number;
  revealingRowIndex?: number | null;
  revealingTiles?: number;
}

const stateColors: Record<LetterState, string> = {
  correct: 'bg-[var(--wordle-correct)] border-[var(--wordle-correct)]',
  present: 'bg-[var(--wordle-present)] border-[var(--wordle-present)]',
  absent: 'bg-[var(--wordle-absent)] border-[var(--wordle-absent)]',
  empty: 'bg-transparent border-[var(--wordle-border-empty)]',
  tbd: 'bg-transparent border-[var(--wordle-border-active)]',
};

export default function Grid({
  guessResults,
  currentGuess,
  maxGuesses = 6,
  revealedRows = guessResults.length,
  revealingRowIndex = null,
  revealingTiles = 0,
}: GridProps) {
  const emptyRows = Math.max(0, maxGuesses - guessResults.length - 1);

  return (
    <div className="wordle-grid grid gap-1.5">
      {/* Completed guesses */}
      {guessResults.map((guess, rowIndex) => (
        <div key={rowIndex} className="grid grid-cols-5 gap-1.5">
          {guess.map((result, colIndex) => (
            (() => {
              const isFullyRevealed = rowIndex < revealedRows;
              const isRevealingRow = rowIndex === revealingRowIndex;
              const isRevealedTile = isRevealingRow && colIndex < revealingTiles;
              const shouldReveal = isFullyRevealed || isRevealedTile;
              const displayState: LetterState = shouldReveal ? result.state : 'tbd';

              return (
                <div
                  key={colIndex}
                  className={`wordle-tile w-(--tile-size) h-(--tile-size) flex items-center justify-center text-[calc(var(--tile-size)*0.52)] font-bold text-white uppercase border-2 ${stateColors[displayState]} ${
                    isRevealedTile ? 'animate-flip' : ''
                  } transition-colors duration-200 transform-gpu`}
                >
                  {result.letter}
                </div>
              );
            })()
          ))}
        </div>
      ))}

      {/* Current guess row */}
      {guessResults.length < maxGuesses && (
        <div className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }).map((_, colIndex) => {
            const letter = currentGuess[colIndex] || '';
            return (
              <div
                key={colIndex}
                className={`wordle-tile w-(--tile-size) h-(--tile-size) flex items-center justify-center text-[calc(var(--tile-size)*0.52)] font-bold text-white uppercase border-2 ${
                  letter ? stateColors.tbd : stateColors.empty
                } transition-colors duration-100`}
              >
                {letter}
              </div>
            );
          })}
        </div>
      )}

      {/* Empty rows */}
      {Array.from({ length: Math.max(0, emptyRows) }).map((_, rowIndex) => (
        <div key={`empty-${rowIndex}`} className="grid grid-cols-5 gap-1.5">
          {Array.from({ length: 5 }).map((_, colIndex) => (
            <div
              key={colIndex}
              className={`wordle-tile w-(--tile-size) h-(--tile-size) flex items-center justify-center text-[calc(var(--tile-size)*0.52)] font-bold text-white uppercase border-2 ${stateColors.empty}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
