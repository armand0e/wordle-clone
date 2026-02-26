"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluateGuess = evaluateGuess;
exports.getKeyboardState = getKeyboardState;
function evaluateGuess(guess, targetWord) {
    const results = [];
    const targetLetters = targetWord.toUpperCase().split('');
    const guessLetters = guess.toUpperCase().split('');
    const letterCounts = {};
    // Count occurrences of each letter in target
    for (const letter of targetLetters) {
        letterCounts[letter] = (letterCounts[letter] || 0) + 1;
    }
    // First pass: mark correct letters
    for (let i = 0; i < 5; i++) {
        if (guessLetters[i] === targetLetters[i]) {
            results[i] = { letter: guessLetters[i], state: 'correct' };
            letterCounts[guessLetters[i]]--;
        }
        else {
            results[i] = { letter: guessLetters[i], state: 'absent' };
        }
    }
    // Second pass: mark present letters
    for (let i = 0; i < 5; i++) {
        if (results[i].state !== 'correct') {
            if (letterCounts[guessLetters[i]] > 0) {
                results[i].state = 'present';
                letterCounts[guessLetters[i]]--;
            }
        }
    }
    return results;
}
function getKeyboardState(guessResults) {
    const keyState = {};
    for (const guess of guessResults) {
        for (const { letter, state } of guess) {
            const currentState = keyState[letter];
            // Priority: correct > present > absent
            if (state === 'correct') {
                keyState[letter] = 'correct';
            }
            else if (state === 'present' && currentState !== 'correct') {
                keyState[letter] = 'present';
            }
            else if (state === 'absent' && !currentState) {
                keyState[letter] = 'absent';
            }
        }
    }
    return keyState;
}
