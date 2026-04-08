import {
  TRANSLATION_BATCH_SIZE,
  TRANSLATION_CONTEXT_BLOCKS,
} from "../../config/pipeline.js";
import { TRANSLATABLE_BLOCK_TYPES } from "../../config/block-rules.js";
import type { ContentBlock, ProcessedPage } from "../../types/content.js";

export interface TranslatableEntry {
  block: ContentBlock;
  idx: number;
}

export interface TranslationChunk {
  texts: string[];
  entries: TranslatableEntry[];
}

const isTranslatableTextBlock = (block: ContentBlock): boolean =>
  TRANSLATABLE_BLOCK_TYPES.has(block.type) && block.text.trim().length > 0;

export const getTrailingContext = (
  page: ProcessedPage,
  count = TRANSLATION_CONTEXT_BLOCKS,
): string[] =>
  page.contentBlocks
    .filter(isTranslatableTextBlock)
    .slice(-count)
    .map((block) => block.text);

export const getLeadingContext = (
  page: ProcessedPage,
  count = TRANSLATION_CONTEXT_BLOCKS,
): string[] =>
  page.contentBlocks
    .filter(isTranslatableTextBlock)
    .slice(0, count)
    .map((block) => block.text);

export const buildBeforeContextPerPage = (pages: ProcessedPage[]): string[][] =>
  pages.map((_, pageIndex) => {
    for (let previousIndex = pageIndex - 1; previousIndex >= 0; previousIndex--) {
      const context = getTrailingContext(pages[previousIndex]);
      if (context.length > 0) {
        return context;
      }
    }

    return [];
  });

export const buildAfterContextPerPage = (pages: ProcessedPage[]): string[][] =>
  pages.map((_, pageIndex) => {
    for (let nextIndex = pageIndex + 1; nextIndex < pages.length; nextIndex++) {
      const context = getLeadingContext(pages[nextIndex]);
      if (context.length > 0) {
        return context;
      }
    }

    return [];
  });

export const getTranslatableEntries = (
  page: ProcessedPage,
): TranslatableEntry[] =>
  page.contentBlocks
    .map((block, idx) => ({ block, idx }))
    .filter(({ block }) => isTranslatableTextBlock(block));

export const splitTranslationChunks = (
  entries: TranslatableEntry[],
  batchSize = TRANSLATION_BATCH_SIZE,
): TranslationChunk[] => {
  const chunks: TranslationChunk[] = [];
  const texts = entries.map(({ block }) => block.text);

  for (let start = 0; start < entries.length; start += batchSize) {
    const end = Math.min(start + batchSize, entries.length);
    chunks.push({
      texts: texts.slice(start, end),
      entries: entries.slice(start, end),
    });
  }

  return chunks;
};
