"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_WORDS = exports.ANSWER_WORDS = void 0;
exports.getRandomWord = getRandomWord;
exports.isValidWord = isValidWord;
const official_wordlists_json_1 = __importDefault(require("./official-wordlists.json"));
exports.ANSWER_WORDS = official_wordlists_json_1.default.answers;
exports.VALID_WORDS = official_wordlists_json_1.default.allowed;
const validWordSet = new Set(exports.VALID_WORDS);
function getRandomWord() {
    return exports.ANSWER_WORDS[Math.floor(Math.random() * exports.ANSWER_WORDS.length)];
}
function isValidWord(word) {
    return validWordSet.has(word.trim().toUpperCase());
}
