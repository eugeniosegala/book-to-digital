import { BlockType, type ProcessedPage, type ContentBlock } from '../../types.js';
import { callOpenRouter } from '../../clients/openrouter.js';
import {
  DEFAULT_CONCURRENCY,
  TRANSLATION_CONTEXT_BLOCKS,
  TRANSLATION_BATCH_SIZE,
  TRANSLATABLE_BLOCK_TYPES,
  LANGUAGE_MAP,
} from '../../config.js';
import { processWithConcurrency } from '../../utils/concurrency.js';
import { toErrorMessage } from '../../utils/error.js';
import * as log from '../../utils/logger.js';

export const resolveLanguage = (input: string): string =>
  LANGUAGE_MAP[input.toLowerCase()] ?? input;

export interface TranslateOptions {
  apiKey: string;
  targetLanguage: string;
  concurrency?: number;
}

interface TranslateBatchOptions {
  strict?: boolean;
}

// --- Cloning helpers ---

const cloneBlock = (block: ContentBlock): ContentBlock => ({
  type: block.type,
  text: block.text,
  confidence: block.confidence,
  boundingBox: { ...block.boundingBox },
  imageBuffer: block.imageBuffer,
  imageDimensions: block.imageDimensions,
});

const clonePage = (page: ProcessedPage): ProcessedPage => ({
  pageNumber: page.pageNumber,
  bookPageNumber: page.bookPageNumber,
  filePath: page.filePath,
  contentBlocks: page.contentBlocks.map(cloneBlock),
  errors: [...page.errors],
});

// --- Context overlap ---

const getTrailingContext = (page: ProcessedPage, count = TRANSLATION_CONTEXT_BLOCKS): string[] =>
  page.contentBlocks
    .filter((b) => TRANSLATABLE_BLOCK_TYPES.has(b.type) && b.text.trim())
    .slice(-count)
    .map((b) => b.text);

const getLeadingContext = (page: ProcessedPage, count = TRANSLATION_CONTEXT_BLOCKS): string[] =>
  page.contentBlocks
    .filter((b) => TRANSLATABLE_BLOCK_TYPES.has(b.type) && b.text.trim())
    .slice(0, count)
    .map((b) => b.text);

// --- Prompt construction ---

const buildSystemPrompt = (
  targetLanguage: string,
  blockCount: number,
  options: TranslateBatchOptions = {},
): string => {
  const lang = resolveLanguage(targetLanguage);
  return `You are a professional literary translator specializing in book translation.
Translate each numbered text block to ${lang}.

Rules:
- Translate each block independently but use the context blocks (marked [BEFORE] and [AFTER]) to maintain continuity with the surrounding pages.
- Maintain the original meaning, tone, style, and register.
- Preserve internal formatting: newlines within blocks indicate list items or paragraph breaks — keep them.
- Do NOT add, remove, merge, split, or reorder blocks.
- For proper nouns (personal names, place names, institutions), keep the original form unless a standard ${lang} equivalent exists.
- Do NOT leave source-language wording in the translation except for proper nouns or established terms that should remain unchanged.${options.strict ? '\n- A previous attempt left source-language wording behind. Fully translate every remaining source-language phrase in each block.' : ''}
- Return exactly ${blockCount} translations in the "translations" array, one per input block, in the same order.`;
};

const buildUserMessage = (
  textsToTranslate: string[],
  beforeContext: string[],
  afterContext: string[],
): string => {
  const parts: string[] = [];

  if (beforeContext.length > 0) {
    parts.push('[BEFORE — previous page context, do NOT translate]');
    beforeContext.forEach((text, i) => {
      parts.push(`B${i + 1}: ${text}`);
    });
    parts.push('');
  }

  parts.push('[TRANSLATE — return one translation per block]');
  textsToTranslate.forEach((text, i) => {
    parts.push(`${i + 1}: ${text}`);
  });

  if (afterContext.length > 0) {
    parts.push('');
    parts.push('[AFTER — next page context, do NOT translate]');
    afterContext.forEach((text, i) => {
      parts.push(`A${i + 1}: ${text}`);
    });
  }

  return parts.join('\n');
};

// --- LLM call ---

const TRANSLATION_SCHEMA = {
  type: 'object' as const,
  properties: {
    translations: {
      type: 'array' as const,
      items: { type: 'string' as const },
    },
  },
  required: ['translations'],
  additionalProperties: false,
};

const callTranslationLLM = async (
  apiKey: string,
  systemPrompt: string,
  userMessage: string,
): Promise<{ translations: string[] }> => {
  const { data, finishReason } = await callOpenRouter<{ translations: string[] }>({
    apiKey,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    schemaName: 'page_translation',
    schema: TRANSLATION_SCHEMA,
  });

  if (finishReason === 'length') {
    log.warn('Translation response was truncated (finish_reason=length)');
  }

  return data;
};

const WORD_REGEX = /\p{L}[\p{L}\p{M}'’-]*/gu;
const LOWERCASE_START_REGEX = /^\p{Ll}/u;

const tokenizeWords = (text: string): { raw: string; normalized: string }[] =>
  Array.from(text.matchAll(WORD_REGEX), ([raw]) => ({
    raw,
    normalized: raw.toLocaleLowerCase(),
  }));

const UPPERCASE_START_REGEX = /^\p{Lu}/u;

const hasSuspiciousUntranslatedSpan = (
  sourceText: string,
  translatedText: string,
): boolean => {
  const sourceWords = tokenizeWords(sourceText);
  const translatedWords = tokenizeWords(translatedText).map((word) => word.normalized);

  if (sourceWords.length < 5 || translatedWords.length < 5) {
    return false;
  }

  const translatedJoined = ` ${translatedWords.join(' ')} `;
  const maxSpanLength = Math.min(8, sourceWords.length, translatedWords.length);

  for (let spanLength = maxSpanLength; spanLength >= 5; spanLength--) {
    for (let start = 0; start <= sourceWords.length - spanLength; start++) {
      const span = sourceWords.slice(start, start + spanLength);

      // Skip spans dominated by capitalised words (likely proper nouns / place names)
      const capitalCount = span.filter((word) => UPPERCASE_START_REGEX.test(word.raw)).length;
      if (capitalCount > span.length / 2) continue;

      const lowercaseCount = span.filter((word) => LOWERCASE_START_REGEX.test(word.raw)).length;
      if (lowercaseCount < 3) continue;

      const letterCount = span.reduce((sum, word) => sum + word.normalized.length, 0);
      if (letterCount < 20) continue;

      const normalizedSpan = span.map((word) => word.normalized).join(' ');
      if (translatedJoined.includes(` ${normalizedSpan} `)) {
        return true;
      }
    }
  }

  return false;
};

// --- Batch helper with error handling ---

const translateBlocksBatch = async (
  texts: string[],
  beforeContext: string[],
  afterContext: string[],
  options: TranslateOptions,
  batchOptions: TranslateBatchOptions = {},
): Promise<string[] | null> => {
  try {
    const systemPrompt = buildSystemPrompt(options.targetLanguage, texts.length, batchOptions);
    const userMessage = buildUserMessage(texts, beforeContext, afterContext);

    const result = await callTranslationLLM(options.apiKey, systemPrompt, userMessage);

    if (result.translations.length !== texts.length) {
      log.warn(`Expected ${texts.length} translations, got ${result.translations.length}`);
      return null;
    }

    return result.translations;
  } catch (err) {
    log.warn(`Translation batch failed: ${toErrorMessage(err)}`);
    return null;
  }
};

const getBlockRetryBeforeContext = (
  texts: string[],
  beforeContext: string[],
  blockIndex: number,
): string[] => (blockIndex === 0 ? beforeContext : [texts[blockIndex - 1]]);

const getBlockRetryAfterContext = (
  texts: string[],
  afterContext: string[],
  blockIndex: number,
): string[] => (blockIndex === texts.length - 1 ? afterContext : [texts[blockIndex + 1]]);

// --- Cross-page hyphen merging ---
// When a page ends with a hyphenated word (e.g., "Bild-"), merge the fragment
// into the next page's first text block so the LLM translates the full word.
// After translation, move the completed word back to the previous page.

const mergeCrossPageHyphens = (clonedPages: ProcessedPage[]): void => {
  for (let i = 0; i < clonedPages.length - 1; i++) {
    const currBlocks = clonedPages[i].contentBlocks;
    const nextBlocks = clonedPages[i + 1].contentBlocks;

    const lastText = [...currBlocks].reverse().find(
      (b) => TRANSLATABLE_BLOCK_TYPES.has(b.type) && b.text.trim(),
    );
    const firstText = nextBlocks.find(
      (b) => TRANSLATABLE_BLOCK_TYPES.has(b.type) && b.text.trim(),
    );

    if (!lastText || !firstText) continue;

    const trimmed = lastText.text.trimEnd();
    if (!trimmed.endsWith('-')) continue;

    // Extract the hyphenated fragment (last word fragment before the hyphen)
    const lastSpace = trimmed.lastIndexOf(' ');
    const fragment = trimmed.slice(lastSpace + 1, -1); // e.g., "Bild" from "...der Bild-"

    // Remove fragment from current page's last block
    lastText.text = lastSpace >= 0 ? trimmed.slice(0, lastSpace) : '';

    // Prepend fragment to next page's first block (joining the word)
    firstText.text = fragment + firstText.text.trimStart();
  }
};

// --- Public API ---

export const translatePages = async (
  pages: ProcessedPage[],
  options: TranslateOptions,
): Promise<ProcessedPage[]> => {
  const clonedPages = pages.map(clonePage);
  mergeCrossPageHyphens(clonedPages);

  // Precompute context for each page from the original (untranslated) pages.
  // If the immediate neighbour has no text (e.g., full-page figure),
  // look further out to find the nearest page with translatable text.
  const beforeContextPerPage: string[][] = clonedPages.map((_, i) => {
    for (let prev = i - 1; prev >= 0; prev--) {
      const ctx = getTrailingContext(pages[prev]);
      if (ctx.length > 0) return ctx;
    }
    return [];
  });

  const afterContextPerPage: string[][] = clonedPages.map((_, i) => {
    for (let next = i + 1; next < clonedPages.length; next++) {
      const ctx = getLeadingContext(pages[next]);
      if (ctx.length > 0) return ctx;
    }
    return [];
  });

  const translatePage = async (page: ProcessedPage, i: number): Promise<void> => {
    const translatableEntries = page.contentBlocks
      .map((block, idx) => ({ block, idx }))
      .filter(({ block }) => TRANSLATABLE_BLOCK_TYPES.has(block.type) && block.text.trim());

    if (translatableEntries.length === 0) return;

    const pageLabel = page.bookPageNumber ?? page.pageNumber;
    const allTexts = translatableEntries.map(({ block }) => block.text);
    const pageBeforeCtx = beforeContextPerPage[i];
    const pageAfterCtx = afterContextPerPage[i];

    // Split into chunks of TRANSLATION_BATCH_SIZE
    const chunks: { texts: string[]; entries: typeof translatableEntries }[] = [];
    for (let start = 0; start < translatableEntries.length; start += TRANSLATION_BATCH_SIZE) {
      const end = Math.min(start + TRANSLATION_BATCH_SIZE, translatableEntries.length);
      chunks.push({
        texts: allTexts.slice(start, end),
        entries: translatableEntries.slice(start, end),
      });
    }

    log.debug(`Starting translation for page ${pageLabel} (${translatableEntries.length} blocks, ${chunks.length} chunk(s))`);

    for (let c = 0; c < chunks.length; c++) {
      const { texts, entries } = chunks[c];

      // Before context: previous page for first chunk, trailing source texts from previous chunk otherwise
      const beforeCtx = c === 0
        ? pageBeforeCtx
        : chunks[c - 1].texts.slice(-TRANSLATION_CONTEXT_BLOCKS);

      // After context: next page for last chunk, leading source texts from next chunk otherwise
      const afterCtx = c === chunks.length - 1
        ? pageAfterCtx
        : chunks[c + 1].texts.slice(0, TRANSLATION_CONTEXT_BLOCKS);

      const batchResult = await translateBlocksBatch(texts, beforeCtx, afterCtx, options);

      if (batchResult) {
        for (let j = 0; j < entries.length; j++) {
          page.contentBlocks[entries[j].idx].text = batchResult[j];
        }

        // Retry blocks with suspicious untranslated spans
        for (let j = 0; j < entries.length; j++) {
          if (!hasSuspiciousUntranslatedSpan(texts[j], batchResult[j])) continue;

          log.warn(`Detected untranslated source text in block ${j + 1} (chunk ${c + 1}) on page ${pageLabel}; retrying block`);
          const single = await translateBlocksBatch(
            [texts[j]],
            getBlockRetryBeforeContext(texts, beforeCtx, j),
            getBlockRetryAfterContext(texts, afterCtx, j),
            options,
            { strict: true },
          );

          if (single) {
            page.contentBlocks[entries[j].idx].text = single[0];
          }
        }
      } else {
        // Batch failed — fall back to translating one block at a time
        log.debug(`Falling back to per-block translation for page ${pageLabel} chunk ${c + 1}`);
        for (let j = 0; j < entries.length; j++) {
          const single = await translateBlocksBatch(
            [texts[j]],
            getBlockRetryBeforeContext(texts, beforeCtx, j),
            getBlockRetryAfterContext(texts, afterCtx, j),
            options,
            { strict: true },
          );
          if (single) {
            page.contentBlocks[entries[j].idx].text = single[0];
          } else {
            page.errors.push(`Translation failed for block ${j + 1}`);
          }
        }
      }
    }
  };

  await processWithConcurrency(
    clonedPages,
    translatePage,
    options.concurrency ?? DEFAULT_CONCURRENCY,
    (completed, total) => log.progress(completed, total, 'Translating'),
  );

  return clonedPages;
};
