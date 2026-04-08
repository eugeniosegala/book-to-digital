const isValidXmlCodePoint = (codePoint: number): boolean =>
  codePoint === 0x09 ||
  codePoint === 0x0a ||
  codePoint === 0x0d ||
  (codePoint >= 0x20 && codePoint <= 0xd7ff) ||
  (codePoint >= 0xe000 && codePoint <= 0xfffd) ||
  (codePoint >= 0x10000 && codePoint <= 0x10ffff);

// docx ultimately serializes to XML, so invalid XML code points must be removed
// before text is handed to the writer.
export const sanitizeDocxText = (text: string): string => {
  let result = "";

  for (const char of text) {
    const codePoint = char.codePointAt(0);
    if (codePoint !== undefined && isValidXmlCodePoint(codePoint)) {
      result += char;
    }
  }

  return result;
};
