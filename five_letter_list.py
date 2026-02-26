"""Build/update the game's word lists from official/reliable sources.

Source rationale:
- SCOWL / en-wl wordlist-diff (official dictionaries used by Aspell/Hunspell)
  https://wordlist.aspell.net/dicts/
  https://github.com/en-wl/wordlist-diff
- Existing Wordle answer list in src/lib/official-wordlists.json is preserved as-is.

This script refreshes VALID_WORDS by merging:
1) Existing allowed words (Wordle-compatible list)
2) SCOWL large dictionaries (en_US, en_GB, en_CA, en_AU), filtered to strict A-Z 5-letter words.
"""

from __future__ import annotations

import json
import re
import urllib.request
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent
WORDLIST_PATH = PROJECT_ROOT / "src" / "lib" / "official-wordlists.json"

SCOWL_URLS = [
    "https://raw.githubusercontent.com/en-wl/wordlist-diff/diff/en_US-large.txt"
]

FIVE_LETTER_ASCII = re.compile(r"^[A-Za-z]{5}$")


def fetch_scowl_five_letter_words() -> set[str]:
    words: set[str] = set()
    for url in SCOWL_URLS:
        with urllib.request.urlopen(url, timeout=90) as response:
            text = response.read().decode("utf-8")
        for raw_word in text.splitlines():
            if FIVE_LETTER_ASCII.fullmatch(raw_word):
                words.add(raw_word.upper())
    return words


def main() -> None:
    data = json.loads(WORDLIST_PATH.read_text(encoding="utf-8"))

    answers = [w.upper() for w in data["answers"] if FIVE_LETTER_ASCII.fullmatch(w)]
    existing_allowed = {w.upper() for w in data["allowed"] if FIVE_LETTER_ASCII.fullmatch(w)}

    scowl_allowed = fetch_scowl_five_letter_words()
    merged_allowed = sorted(existing_allowed | scowl_allowed | set(answers))

    output = {
        "answers": answers,
        "allowed": merged_allowed,
    }
    WORDLIST_PATH.write_text(json.dumps(output), encoding="utf-8")

    print(
        "Updated word lists:",
        f"answers={len(answers)}",
        f"existing_allowed={len(existing_allowed)}",
        f"scowl_5={len(scowl_allowed)}",
        f"merged_allowed={len(merged_allowed)}",
    )


if __name__ == "__main__":
    main()
