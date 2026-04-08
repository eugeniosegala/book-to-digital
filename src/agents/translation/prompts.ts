import { resolveLanguage } from "./language.js";

export interface TranslateBatchOptions {
  strict?: boolean;
}

export const buildSystemPrompt = (
  targetLanguage: string,
  blockCount: number,
  options: TranslateBatchOptions = {},
): string => {
  const language = resolveLanguage(targetLanguage);

  return `You are a professional literary translator specializing in book translation.
Translate each numbered text block to ${language}.

Rules:
- Translate each block independently but use the context blocks (marked [BEFORE] and [AFTER]) to maintain continuity with the surrounding pages.
- Maintain the original meaning, tone, style, and register.
- Preserve internal formatting: newlines within blocks indicate list items or paragraph breaks — keep them.
- Do NOT add, remove, merge, split, or reorder blocks.
- For proper nouns (personal names, place names, institutions), keep the original form unless a standard ${language} equivalent exists.
- Do NOT leave source-language wording in the translation except for proper nouns or established terms that should remain unchanged.${options.strict ? "\n- A previous attempt left source-language wording behind. Fully translate every remaining source-language phrase in each block." : ""}
- Return exactly ${blockCount} translations in the "translations" array, one per input block, in the same order.`;
};

export const buildUserMessage = (
  textsToTranslate: string[],
  beforeContext: string[],
  afterContext: string[],
): string => {
  const parts: string[] = [];

  if (beforeContext.length > 0) {
    parts.push("[BEFORE — previous page context, do NOT translate]");
    beforeContext.forEach((text, index) => {
      parts.push(`B${index + 1}: ${text}`);
    });
    parts.push("");
  }

  parts.push("[TRANSLATE — return one translation per block]");
  textsToTranslate.forEach((text, index) => {
    parts.push(`${index + 1}: ${text}`);
  });

  if (afterContext.length > 0) {
    parts.push("");
    parts.push("[AFTER — next page context, do NOT translate]");
    afterContext.forEach((text, index) => {
      parts.push(`A${index + 1}: ${text}`);
    });
  }

  return parts.join("\n");
};

export const TRANSLATION_SCHEMA = {
  type: "object" as const,
  properties: {
    translations: {
      type: "array" as const,
      items: { type: "string" as const },
    },
  },
  required: ["translations"],
  additionalProperties: false,
};
