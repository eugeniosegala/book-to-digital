import { LANGUAGE_MAP } from "../../config/languages.js";

export const resolveLanguage = (input: string): string =>
  LANGUAGE_MAP[input.toLowerCase()] ?? input;
