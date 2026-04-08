import { TRANSLATABLE_BLOCK_TYPES } from "../../config/block-rules.js";
import type { ProcessedPage } from "../../types/content.js";

// Merge a trailing hyphen fragment into the next page's first translatable
// block so the translator sees the full word. This only affects the temporary
// source text sent to the model; the translated blocks keep the resulting
// translated page boundaries.
export const mergeCrossPageHyphens = (pages: ProcessedPage[]): void => {
  for (let i = 0; i < pages.length - 1; i++) {
    const currentBlocks = pages[i].contentBlocks;
    const nextBlocks = pages[i + 1].contentBlocks;

    const lastText = [...currentBlocks]
      .reverse()
      .find((block) => TRANSLATABLE_BLOCK_TYPES.has(block.type) && block.text.trim());
    const firstText = nextBlocks.find(
      (block) => TRANSLATABLE_BLOCK_TYPES.has(block.type) && block.text.trim(),
    );

    if (!lastText || !firstText) continue;

    const trimmed = lastText.text.trimEnd();
    if (!trimmed.endsWith("-")) continue;

    const lastSpace = trimmed.lastIndexOf(" ");
    const fragment = trimmed.slice(lastSpace + 1, -1);

    lastText.text = lastSpace >= 0 ? trimmed.slice(0, lastSpace) : "";
    firstText.text = fragment + firstText.text.trimStart();
  }
};
