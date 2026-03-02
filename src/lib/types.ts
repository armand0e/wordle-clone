export type LetterState = 'correct' | 'present' | 'absent' | 'empty' | 'tbd';

export interface LetterResult {
  letter: string;
  state: LetterState;
}

export interface GameState {
  guesses: string[];
  currentGuess: string;
  gameStatus: 'waiting' | 'playing' | 'won' | 'lost';
  targetWord: string | null;
}

export interface Player {
  id: string;
  name: string;
  guesses: string[];
  currentGuess: string;
  gameStatus: 'waiting' | 'playing' | 'won' | 'lost';
  guessResults: LetterResult[][];
  readyForNextRound: boolean;
}

export interface Room {
  id: string;
  players: Player[];
  targetWord: string | null;
  gameStarted: boolean;
  hostId: string;
  createdAt: number;
}

export interface ServerToClientEvents {
  roomState: (room: Room) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  gameStarted: () => void;
  playerGuessed: (playerId: string, guess: string, results: LetterResult[]) => void;
  playerWon: (playerId: string) => void;
  playerLost: (playerId: string) => void;
  wordRevealed: (word: string) => void;
  error: (message: string) => void;
}

export interface ClientToServerEvents {
  createRoom: (playerName: string, callback: (roomId: string) => void) => void;
  joinRoom: (roomId: string, playerName: string, callback: (success: boolean, error?: string) => void) => void;
  startGame: () => void;
  updateCurrentGuess: (guess: string) => void;
  submitGuess: (guess: string, callback: (success: boolean, error?: string) => void) => void;
  playAgain: (callback: (success: boolean, error?: string) => void) => void;
  leaveRoom: () => void;
}

export interface CreateRoomResult {
  roomId: string;
}

export interface JoinRoomResult {
  success: boolean;
  error?: string;
}

export interface ActionResult {
  success: boolean;
  error?: string;
}
