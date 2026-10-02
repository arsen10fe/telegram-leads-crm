// Trigger words hand a dialog to a manager before any LLM call. A pattern is one or more words:
// "word" — exact word, "word*" — prefix, "жив* человек*" — adjacent words, each exact or a prefix.
// Matching is case- and ё-insensitive and ignores spacing and punctuation between words.

export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replaceAll("ё", "е");
}

/** Letters and digits make words ("1с" is a word); everything else separates them. */
const WORD = /[\p{L}\p{N}]+/gu;

type PatternWord = { stem: string; isPrefix: boolean };

function parsePattern(raw: string): PatternWord[] | null {
  const words: PatternWord[] = [];
  for (const piece of normalizeText(raw).split(/\s+/)) {
    if (!piece) continue;
    const parts = piece.match(WORD) ?? [];
    if (parts.length === 0) continue;
    // "e-mail" splits into adjacent words like the client's text does; a trailing * applies to the last one.
    parts.forEach((stem, index) => words.push({ stem, isPrefix: index === parts.length - 1 && piece.endsWith("*") }));
  }
  return words.length > 0 ? words : null;
}

function matchesAt(tokens: string[], start: number, pattern: PatternWord[]): boolean {
  return pattern.every(({ stem, isPrefix }, offset) => {
    const token = tokens[start + offset];
    return token !== undefined && (isPrefix ? token.startsWith(stem) : token === stem);
  });
}

/** The first pattern that matches any of the texts, or null. Phrases never span two messages. */
export function matchTriggers(texts: string[], patterns: string[]): { pattern: string } | null {
  const tokenized = texts.map((text) => normalizeText(text).match(WORD) ?? []);
  for (const raw of patterns) {
    const pattern = parsePattern(raw.trim());
    if (!pattern) continue;
    for (const tokens of tokenized) {
      for (let start = 0; start + pattern.length <= tokens.length; start += 1) {
        if (matchesAt(tokens, start, pattern)) return { pattern: raw };
      }
    }
  }
  return null;
}
