import officialWordlists from './official-wordlists.json';

export const ANSWER_WORDS: string[] = officialWordlists.answers;
export const VALID_WORDS: string[] = officialWordlists.allowed;

const validWordSet = new Set(VALID_WORDS);

export function getRandomWord(): string {
  return ANSWER_WORDS[Math.floor(Math.random() * ANSWER_WORDS.length)];
}

export function isValidWord(word: string): boolean {
  return validWordSet.has(word.trim().toUpperCase());
}
