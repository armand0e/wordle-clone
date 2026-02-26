'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import Grid from './Grid';
import Keyboard from './Keyboard';
import MiniGrid from './MiniGrid';
import { getKeyboardState } from '@/lib/game';
import { LetterResult } from '@/lib/types';

export default function Game() {
  const { room, playerId, submitGuess, playAgain, leaveRoom, error, revealedWord, clearError } = useSocket();
  const [currentGuess, setCurrentGuess] = useState('');
  const [shake, setShake] = useState(false);
  const [revealedRows, setRevealedRows] = useState(0);
  const [revealingRowIndex, setRevealingRowIndex] = useState<number | null>(null);
  const [revealingTiles, setRevealingTiles] = useState(0);
  const [isRevealing, setIsRevealing] = useState(false);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
  const lastGuessCountRef = useRef(0);
  const shakeTimeoutRef = useRef<number | undefined>(undefined);

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [room, playerId],
  );
  const otherPlayers = room?.players.filter(p => p.id !== playerId) || [];
  const guessResults: LetterResult[][] = useMemo(
    () => currentPlayer?.guessResults || [],
    [currentPlayer],
  );
  const visibleGuessResults = useMemo(() => {
    const visible = guessResults.slice(0, revealedRows);
    if (revealingRowIndex !== null && guessResults[revealingRowIndex]) {
      visible.push(guessResults[revealingRowIndex].slice(0, revealingTiles));
    }
    return visible;
  }, [guessResults, revealedRows, revealingRowIndex, revealingTiles]);
  const keyStates = getKeyboardState(visibleGuessResults);
  const isPlaying = currentPlayer?.gameStatus === 'playing';
  const hasFinished = currentPlayer?.gameStatus === 'won' || currentPlayer?.gameStatus === 'lost';
  const canType = isPlaying && !isRevealing;
  const readyPlayers = room?.players.filter((player) => player.readyForNextRound).length || 0;

  useEffect(() => {
    const nextCount = guessResults.length;
    const previousCount = lastGuessCountRef.current;

    const scheduleStateUpdate = (update: () => void) => {
      return window.requestAnimationFrame(update);
    };

    if (nextCount === 0) {
      lastGuessCountRef.current = 0;

      const resetFrame = scheduleStateUpdate(() => {
        setCurrentGuess('');
        setRevealedRows(0);
        setRevealingRowIndex(null);
        setRevealingTiles(0);
        setIsRevealing(false);
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
        setIsRevealing(false);
      });

      return () => {
        window.cancelAnimationFrame(rollbackFrame);
      };
    }

    if (nextCount === previousCount) {
      return;
    }

    lastGuessCountRef.current = nextCount;

    const startFrame = scheduleStateUpdate(() => {
      setRevealingRowIndex(nextCount - 1);
      setRevealingTiles(0);
      setIsRevealing(true);
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
          setIsRevealing(false);
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

  const handleKeyPress = useCallback((key: string) => {
    if (!canType) return;

    if (key === 'Enter') {
      submitGuess(currentGuess).then((result) => {
        if (result.success) {
          setCurrentGuess('');
          clearError();
          return;
        }

        if (shakeTimeoutRef.current) {
          window.clearTimeout(shakeTimeoutRef.current);
        }
        setShake(true);
        shakeTimeoutRef.current = window.setTimeout(() => setShake(false), 500);
      });
    } else if (key === 'Backspace') {
      clearError();
      setCurrentGuess(prev => prev.slice(0, -1));
    } else if (/^[A-Za-z]$/.test(key) && currentGuess.length < 5) {
      clearError();
      setCurrentGuess(prev => prev + key.toUpperCase());
    }
  }, [currentGuess, canType, submitGuess, clearError]);

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        window.clearTimeout(shakeTimeoutRef.current);
      }
    };
  }, []);

  const handlePlayAgain = useCallback(async () => {
    if (!currentPlayer || currentPlayer.readyForNextRound || isSubmittingRematch) {
      return;
    }

    setIsSubmittingRematch(true);
    try {
      await playAgain();
    } finally {
      setIsSubmittingRematch(false);
    }
  }, [currentPlayer, playAgain, isSubmittingRematch]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.isContentEditable || target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      handleKeyPress(e.key);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyPress]);

  if (!room || !currentPlayer) {
    return <div className="text-white">Loading...</div>;
  }

  return (
    <div className="wordle-viewport relative mx-auto flex w-full max-w-6xl flex-col overflow-y-auto overflow-x-hidden px-3 sm:px-4">
      {error && (
        <div
          role="alert"
          aria-live="assertive"
          className="wordle-toast pointer-events-none fixed left-1/2 z-40 -translate-x-1/2 rounded-md bg-white px-4 py-2 text-sm font-semibold text-black shadow-lg"
        >
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 items-stretch justify-center gap-3 py-3 lg:gap-8">
        {otherPlayers.length > 0 && (
          <div className="hidden lg:flex flex-col gap-3 pt-2">
            <h3 className="text-white font-bold text-sm">Other Players</h3>
            {otherPlayers.map(player => (
              <MiniGrid
                key={player.id}
                guessResults={player.guessResults}
                playerName={player.name}
                gameStatus={player.gameStatus}
              />
            ))}
          </div>
        )}

        <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-between gap-3">
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start gap-3 sm:justify-center">
            {hasFinished && !isRevealing && currentPlayer.gameStatus === 'won' && (
              <div className="rounded-lg bg-green-600 px-4 py-2 text-center text-lg font-bold text-white">
                🎉 You Won! 🎉
              </div>
            )}
            {hasFinished && !isRevealing && currentPlayer.gameStatus === 'lost' && (
              <div className="rounded-lg bg-red-600 px-4 py-2 text-center text-lg font-bold text-white">
                😢 Game Over - The word was: {revealedWord || '?????'}
              </div>
            )}

            <div className={`${shake ? 'animate-shake' : ''} px-1`}>
              <Grid
                guessResults={guessResults}
                currentGuess={currentGuess}
                revealedRows={revealedRows}
                revealingRowIndex={revealingRowIndex}
                revealingTiles={revealingTiles}
              />
            </div>
          </div>

          <Keyboard
            keyStates={keyStates}
            onKeyPress={handleKeyPress}
            disabled={!canType}
          />

          {hasFinished && !isRevealing && (
            <div className="mb-1 flex flex-col items-center gap-3 pb-1">
              <p className="text-sm text-zinc-300">
                {readyPlayers}/{room.players.length} players ready to play again
              </p>
              <div className="flex flex-wrap items-center justify-center gap-3">
                <button
                  onClick={handlePlayAgain}
                  disabled={currentPlayer.readyForNextRound || isSubmittingRematch}
                  className={`rounded-md px-4 py-2 font-semibold transition-colors ${
                    currentPlayer.readyForNextRound
                      ? 'bg-zinc-700 text-zinc-300'
                      : 'bg-green-600 text-white hover:bg-green-500'
                  } ${isSubmittingRematch ? 'opacity-60' : ''}`}
                >
                  {currentPlayer.readyForNextRound ? 'Ready' : 'Play Again'}
                </button>
                <button
                  onClick={leaveRoom}
                  className="rounded-md bg-zinc-700 px-4 py-2 font-semibold text-white hover:bg-zinc-600"
                >
                  Leave
                </button>
              </div>
            </div>
          )}

          {otherPlayers.length > 0 && (
            <div className="lg:hidden flex flex-wrap justify-center gap-2 pt-1">
              {otherPlayers.map(player => (
                <MiniGrid
                  key={player.id}
                  guessResults={player.guessResults}
                  playerName={player.name}
                  gameStatus={player.gameStatus}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
