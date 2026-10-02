// Trigger words hand a dialog to a manager before any LLM call. Patterns:
// "word*" — prefix, "two words" — phrase, "word" — exact token. Case- and ё-insensitive.

export function normalizeText(text: string): string {
  return text.normalize("NFKC").toLowerCase().replaceAll("ё", "е");
}

/** The first pattern that matches any of the texts, or null. */
export function matchTriggers(texts: string[], patterns: string[]): { pattern: string } | null {
  const haystack = normalizeText(texts.join("\n"));
  const tokens = haystack.match(/\p{L}+/gu) ?? [];
  for (const raw of patterns) {
    const pattern = normalizeText(raw.trim());
    if (!pattern) continue;
    if (pattern.includes(" ")) {
      if (haystack.includes(pattern)) return { pattern: raw };
      continue;
    }
    const isPrefix = pattern.endsWith("*");
    const stem = isPrefix ? pattern.slice(0, -1) : pattern;
    if (!stem) continue;
    if (tokens.some((token) => (isPrefix ? token.startsWith(stem) : token === stem))) return { pattern: raw };
  }
  return null;
}
