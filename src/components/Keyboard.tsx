'use client';

import { LetterState } from '@/lib/types';

interface KeyboardProps {
  keyStates: Record<string, LetterState>;
  onKeyPress: (key: string) => void;
  disabled?: boolean;
}

const keyboardRows = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
];

const stateColors: Record<LetterState | 'default', string> = {
  correct: 'bg-[var(--wordle-correct)] hover:brightness-95',
  present: 'bg-[var(--wordle-present)] hover:brightness-95',
  absent: 'bg-[var(--wordle-absent)] hover:brightness-95',
  empty: 'bg-[var(--wordle-key-default)] hover:bg-[var(--wordle-key-default-hover)]',
  tbd: 'bg-[var(--wordle-key-default)] hover:bg-[var(--wordle-key-default-hover)]',
  default: 'bg-[var(--wordle-key-default)] hover:bg-[var(--wordle-key-default-hover)]',
};

export default function Keyboard({ keyStates, onKeyPress, disabled = false }: KeyboardProps) {
  const handleClick = (key: string) => {
    if (disabled) return;
    if (key === '⌫') {
      onKeyPress('Backspace');
    } else if (key === 'ENTER') {
      onKeyPress('Enter');
    } else {
      onKeyPress(key);
    }
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      {keyboardRows.map((row, rowIndex) => (
        <div key={rowIndex} className="flex gap-1.5">
          {row.map((key) => {
            const state = keyStates[key] || 'default';
            const isWide = key === 'ENTER' || key === '⌫';

            return (
              <button
                key={key}
                onClick={() => handleClick(key)}
                disabled={disabled}
                className={`${
                  isWide
                    ? 'px-3 min-w-[calc(var(--tile-size)*1.45)]'
                    : 'w-[calc(var(--tile-size)*0.72)]'
                } h-(--key-height) rounded font-bold text-white text-[clamp(0.65rem,2.2vw,0.95rem)] uppercase transition-colors ${
                  stateColors[state]
                } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}`}
              >
                {key}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
