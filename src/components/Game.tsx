'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSocket } from '@/context/SocketContext';
import Grid from './Grid';
import Keyboard from './Keyboard';
import MiniGrid from './MiniGrid';
import { getKeyboardState } from '@/lib/game';
import { LetterResult } from '@/lib/types';

export default function Game() {
  const {
    room,
    playerId,
    updateCurrentGuess,
    submitGuess,
    playAgain,
    leaveRoom,
    error,
    revealedWord,
    clearError,
  } = useSocket();
  const [currentGuess, setCurrentGuess] = useState('');
  const [spectatedPlayerId, setSpectatedPlayerId] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const [revealedRows, setRevealedRows] = useState(0);
  const [revealingRowIndex, setRevealingRowIndex] = useState<number | null>(null);
  const [revealingTiles, setRevealingTiles] = useState(0);
  const [spectatedRevealedRows, setSpectatedRevealedRows] = useState(0);
  const [spectatedRevealingRowIndex, setSpectatedRevealingRowIndex] = useState<number | null>(null);
  const [spectatedRevealingTiles, setSpectatedRevealingTiles] = useState(0);
  const [isSubmittingRematch, setIsSubmittingRematch] = useState(false);
  const [isSubmittingGuess, setIsSubmittingGuess] = useState(false);
  const lastGuessCountRef = useRef(0);
  const spectatedLastGuessCountRef = useRef(0);
  const shakeTimeoutRef = useRef<number | undefined>(undefined);
  const isSubmittingGuessRef = useRef(false);

  const currentPlayer = useMemo(
    () => room?.players.find((player) => player.id === playerId) ?? null,
    [room, playerId],
  );
  const otherPlayers = useMemo(
    () => room?.players.filter((player) => player.id !== playerId) || [],
    [room, playerId],
  );
  const spectatedPlayer = useMemo(
    () => otherPlayers.find((player) => player.id === spectatedPlayerId) ?? null,
    [otherPlayers, spectatedPlayerId],
  );
  const isSpectating = Boolean(spectatedPlayer);
  const guessResults: LetterResult[][] = useMemo(
    () => currentPlayer?.guessResults || [],
    [currentPlayer],
  );
  const spectatedGuessResults: LetterResult[][] = useMemo(
    () => spectatedPlayer?.guessResults || [],
    [spectatedPlayer],
  );
  const visibleGuessResults = useMemo(() => {
    const visible = guessResults.slice(0, revealedRows);
    if (revealingRowIndex !== null && guessResults[revealingRowIndex]) {
      visible.push(guessResults[revealingRowIndex].slice(0, revealingTiles));
    }
    return visible;
  }, [guessResults, revealedRows, revealingRowIndex, revealingTiles]);
  const spectatedVisibleGuessResults = useMemo(() => {
    const visible = spectatedGuessResults.slice(0, spectatedRevealedRows);
    if (spectatedRevealingRowIndex !== null && spectatedGuessResults[spectatedRevealingRowIndex]) {
      visible.push(spectatedGuessResults[spectatedRevealingRowIndex].slice(0, spectatedRevealingTiles));
    }
    return visible;
  }, [spectatedGuessResults, spectatedRevealedRows, spectatedRevealingRowIndex, spectatedRevealingTiles]);
  const activeGuessResults = isSpectating ? spectatedGuessResults : guessResults;
  const activeCurrentGuess = isSpectating ? spectatedPlayer?.currentGuess ?? '' : currentGuess;
  const activeRevealedRows = isSpectating ? spectatedRevealedRows : revealedRows;
  const activeRevealingRowIndex = isSpectating ? spectatedRevealingRowIndex : revealingRowIndex;
  const activeRevealingTiles = isSpectating ? spectatedRevealingTiles : revealingTiles;
  const keyStates = getKeyboardState(isSpectating ? spectatedVisibleGuessResults : visibleGuessResults);
  const isPlaying = currentPlayer?.gameStatus === 'playing';
  const hasFinished = currentPlayer?.gameStatus === 'won' || currentPlayer?.gameStatus === 'lost';
  const hasPendingReveal = revealingRowIndex !== null || revealedRows < guessResults.length;
  const canSpectate = currentPlayer?.gameStatus === 'won';
  const canType = !isSpectating && isPlaying && !hasPendingReveal && !isSubmittingGuess;
  const readyPlayers = room?.players.filter((player) => player.readyForNextRound).length || 0;

  const startSpectating = useCallback(
    (targetPlayerId: string) => {
      if (!canSpectate) {
        return;
      }

      const targetPlayer = otherPlayers.find((player) => player.id === targetPlayerId);
      if (!targetPlayer) {
        return;
      }

      const nextCount = targetPlayer.guessResults.length;
      spectatedLastGuessCountRef.current = nextCount;
      setSpectatedRevealedRows(nextCount);
      setSpectatedRevealingRowIndex(null);
      setSpectatedRevealingTiles(0);
      setSpectatedPlayerId(targetPlayerId);
    },
    [canSpectate, otherPlayers],
  );

  useEffect(() => {
    if (!spectatedPlayerId) {
      return;
    }

    if (!canSpectate) {
      setSpectatedPlayerId(null);
      return;
    }

    const stillExists = room?.players.some((player) => player.id === spectatedPlayerId && player.id !== playerId);
    if (!stillExists) {
      setSpectatedPlayerId(null);
    }
  }, [canSpectate, room, playerId, spectatedPlayerId]);

  useEffect(() => {
    const nextCount = spectatedGuessResults.length;
    const previousCount = spectatedLastGuessCountRef.current;
    const scheduleStateUpdate = (update: () => void) => window.requestAnimationFrame(update);

    if (nextCount === previousCount) {
      return;
    }

    if (nextCount === 0) {
      spectatedLastGuessCountRef.current = 0;
      const resetFrame = scheduleStateUpdate(() => {
        setSpectatedRevealedRows(0);
        setSpectatedRevealingRowIndex(null);
        setSpectatedRevealingTiles(0);
      });
      return () => {
        window.cancelAnimationFrame(resetFrame);
      };
    }

    if (nextCount < previousCount) {
      spectatedLastGuessCountRef.current = nextCount;
      const rollbackFrame = scheduleStateUpdate(() => {
        setSpectatedRevealedRows(nextCount);
        setSpectatedRevealingRowIndex(null);
        setSpectatedRevealingTiles(0);
      });
      return () => {
        window.cancelAnimationFrame(rollbackFrame);
      };
    }

    spectatedLastGuessCountRef.current = nextCount;
    const startFrame = scheduleStateUpdate(() => {
      setSpectatedRevealingRowIndex(nextCount - 1);
      setSpectatedRevealingTiles(0);
    });

    let revealed = 0;
    let finalizeTimeout: number | undefined;
    const revealInterval = window.setInterval(() => {
      revealed += 1;
      setSpectatedRevealingTiles(revealed);

      if (revealed >= 5) {
        window.clearInterval(revealInterval);
        finalizeTimeout = window.setTimeout(() => {
          setSpectatedRevealedRows(nextCount);
          setSpectatedRevealingRowIndex(null);
          setSpectatedRevealingTiles(0);
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
  }, [spectatedGuessResults.length]);

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

    if (nextCount === previousCount) {
      return;
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

  const handleKeyPress = useCallback((key: string) => {
    if (!canType) return;

    if (key === 'Enter') {
      if (currentGuess.length !== 5 || isSubmittingGuessRef.current) {
        return;
      }

      const guessToSubmit = currentGuess;
      isSubmittingGuessRef.current = true;
      setIsSubmittingGuess(true);

      submitGuess(guessToSubmit)
        .then((result) => {
          if (result.success) {
            setCurrentGuess('');
            updateCurrentGuess('');
            clearError();
            return;
          }

          if (shakeTimeoutRef.current) {
            window.clearTimeout(shakeTimeoutRef.current);
          }
          setShake(true);
          shakeTimeoutRef.current = window.setTimeout(() => setShake(false), 500);
        })
        .finally(() => {
          isSubmittingGuessRef.current = false;
          setIsSubmittingGuess(false);
        });
    } else if (key === 'Backspace') {
      clearError();
      setCurrentGuess((prev) => {
        const nextGuess = prev.slice(0, -1);
        updateCurrentGuess(nextGuess);
        return nextGuess;
      });
    } else if (/^[A-Za-z]$/.test(key) && currentGuess.length < 5) {
      clearError();
      setCurrentGuess((prev) => {
        const nextGuess = prev + key.toUpperCase();
        updateCurrentGuess(nextGuess);
        return nextGuess;
      });
    }
  }, [currentGuess, canType, submitGuess, updateCurrentGuess, clearError]);

  useEffect(() => {
    return () => {
      if (shakeTimeoutRef.current) {
        window.clearTimeout(shakeTimeoutRef.current);
      }
      isSubmittingGuessRef.current = false;
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
      if (
        target?.isContentEditable ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'BUTTON'
      ) {
        return;
      }
      if (e.key === 'Enter' && e.repeat) {
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
            <div className="space-y-1">
              <h3 className="text-white font-bold text-sm">Other Players</h3>
              {!canSpectate && (
                <p className="text-xs text-zinc-400">Spectate unlocks after you win this round.</p>
              )}
            </div>
            {otherPlayers.map(player => (
              <MiniGrid
                key={player.id}
                guessResults={player.guessResults}
                currentGuess={player.currentGuess}
                playerName={player.name}
                gameStatus={player.gameStatus}
                onSelect={canSpectate ? () => startSpectating(player.id) : undefined}
                isSelected={player.id === spectatedPlayerId}
              />
            ))}
          </div>
        )}

        <div className="flex min-h-0 w-full max-w-xl flex-1 flex-col items-center justify-between gap-3">
          <div className="flex min-h-0 w-full flex-1 flex-col items-center justify-start gap-3 sm:justify-center">
            {isSpectating && spectatedPlayer && (
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-lg bg-zinc-800 px-3 py-2 text-sm text-zinc-100">
                <span>
                  Spectating <span className="font-semibold">{spectatedPlayer.name}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setSpectatedPlayerId(null)}
                  className="rounded bg-zinc-700 px-2 py-1 text-xs font-semibold text-white hover:bg-zinc-600"
                >
                  Stop spectating
                </button>
              </div>
            )}

            {!isSpectating && hasFinished && !hasPendingReveal && currentPlayer.gameStatus === 'won' && (
              <div className="rounded-lg bg-green-600 px-4 py-2 text-center text-lg font-bold text-white">
                🎉 You Won! 🎉
              </div>
            )}
            {!isSpectating && hasFinished && !hasPendingReveal && currentPlayer.gameStatus === 'lost' && (
              <div className="rounded-lg bg-red-600 px-4 py-2 text-center text-lg font-bold text-white">
                😢 Game Over - The word was: {revealedWord || '?????'}
              </div>
            )}

            <div className={`${shake ? 'animate-shake' : ''} px-1`}>
              <Grid
                guessResults={activeGuessResults}
                currentGuess={activeCurrentGuess}
                revealedRows={activeRevealedRows}
                revealingRowIndex={activeRevealingRowIndex}
                revealingTiles={activeRevealingTiles}
              />
            </div>
          </div>

          <Keyboard
            keyStates={keyStates}
            onKeyPress={handleKeyPress}
            disabled={!canType}
          />

          {!isSpectating && hasFinished && !hasPendingReveal && (
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
              {!canSpectate && (
                <p className="w-full text-center text-xs text-zinc-400">Spectate unlocks after you win this round.</p>
              )}
              {otherPlayers.map(player => (
                <MiniGrid
                  key={player.id}
                  guessResults={player.guessResults}
                  currentGuess={player.currentGuess}
                  playerName={player.name}
                  gameStatus={player.gameStatus}
                  onSelect={canSpectate ? () => startSpectating(player.id) : undefined}
                  isSelected={player.id === spectatedPlayerId}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
