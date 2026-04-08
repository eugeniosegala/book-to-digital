const WORD_REGEX = /\p{L}[\p{L}\p{M}'’-]*/gu;
const LOWERCASE_START_REGEX = /^\p{Ll}/u;
const UPPERCASE_START_REGEX = /^\p{Lu}/u;

const tokenizeWords = (text: string): { raw: string; normalized: string }[] =>
  Array.from(text.matchAll(WORD_REGEX), ([raw]) => ({
    raw,
    normalized: raw.toLocaleLowerCase(),
  }));

export const hasSuspiciousUntranslatedSpan = (
  sourceText: string,
  translatedText: string,
): boolean => {
  const sourceWords = tokenizeWords(sourceText);
  const translatedWords = tokenizeWords(translatedText).map(
    (word) => word.normalized,
  );

  if (sourceWords.length < 5 || translatedWords.length < 5) {
    return false;
  }

  const translatedJoined = ` ${translatedWords.join(" ")} `;
  const maxSpanLength = Math.min(8, sourceWords.length, translatedWords.length);

  for (let spanLength = maxSpanLength; spanLength >= 5; spanLength--) {
    for (let start = 0; start <= sourceWords.length - spanLength; start++) {
      const span = sourceWords.slice(start, start + spanLength);

      const capitalCount = span.filter((word) =>
        UPPERCASE_START_REGEX.test(word.raw),
      ).length;
      if (capitalCount > span.length / 2) continue;

      const lowercaseCount = span.filter((word) =>
        LOWERCASE_START_REGEX.test(word.raw),
      ).length;
      if (lowercaseCount < 3) continue;

      const letterCount = span.reduce(
        (sum, word) => sum + word.normalized.length,
        0,
      );
      if (letterCount < 20) continue;

      const normalizedSpan = span.map((word) => word.normalized).join(" ");
      if (translatedJoined.includes(` ${normalizedSpan} `)) {
        return true;
      }
    }
  }

  return false;
};
