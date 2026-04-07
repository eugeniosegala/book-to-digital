import { BlockType, type ContentBlock, type BoundingBox } from "../../types.js";
import { callVisionLLM } from "../../clients/vision-llm.js";

const READING_ORDER_PROMPT = `You are analyzing a photographed book page. Your ONLY task is to determine the correct reading order of the content blocks listed below.

You will receive:
1. An image of the book page.
2. A numbered list of content blocks with their type, position (top/left as 0-1 normalized coordinates), and a text preview.

Rules for determining reading order:
- Read top-to-bottom as the primary direction.
- If the page has multiple columns, read the LEFT column entirely before the RIGHT column.
- Titles and section headers come before the body text they introduce.
- Figures and figure captions should stay adjacent and appear near the text that references them.
- Page-level elements (headers, footers, page numbers) keep their natural position (top or bottom).

Return every block index exactly once, in the correct reading order. Do not skip or duplicate any index.`;

const READING_ORDER_SCHEMA = {
  type: "object",
  properties: {
    order: {
      type: "array",
      items: { type: "integer" },
    },
  },
  required: ["order"],
};

const MAX_PREVIEW_LENGTH = 80;

const summarizeBlocks = (blocks: ContentBlock[]): string =>
  blocks
    .map((b, i) => {
      const preview = b.text.slice(0, MAX_PREVIEW_LENGTH).replaceAll("\n", " ");
      const { top, left } = b.boundingBox;
      return `[${i}] ${b.type} (top=${top.toFixed(2)} left=${left.toFixed(2)}) "${preview}"`;
    })
    .join("\n");

const isValidOrder = (order: number[], length: number): boolean => {
  if (order.length !== length) return false;
  const seen = new Set<number>();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx))
      return false;
    seen.add(idx);
  }
  return true;
};

// ── Post-reorder fix: snap captions to their nearest figure ─────────

const boxCenter = (box: BoundingBox) => ({
  y: box.top + box.height / 2,
  x: box.left + box.width / 2,
});

const boxDistance = (a: BoundingBox, b: BoundingBox): number => {
  const ca = boxCenter(a);
  const cb = boxCenter(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

const snapCaptionsToFigures = (blocks: ContentBlock[]): ContentBlock[] => {
  const result = blocks.filter((b) => b.type !== BlockType.FIGURE_CAPTION);
  const captions = blocks.filter((b) => b.type === BlockType.FIGURE_CAPTION);

  for (const caption of captions) {
    const figures = result
      .map((b, i) => ({ index: i, block: b }))
      .filter(({ block }) => block.type === BlockType.FIGURE);

    if (figures.length === 0) {
      result.push(caption);
      continue;
    }

    const nearest = figures.reduce((best, cur) =>
      boxDistance(cur.block.boundingBox, caption.boundingBox) <
      boxDistance(best.block.boundingBox, caption.boundingBox)
        ? cur
        : best,
    );

    // Insert caption right after its nearest figure
    result.splice(nearest.index + 1, 0, caption);
  }

  return result;
};

// ── Post-reorder fix: remove TEXT blocks that duplicate a caption ────
//
// Textract often picks up caption text twice: once as FIGURE_CAPTION (from
// vision) and again as one or more nearby TEXT blocks (from OCR). After
// snapping captions to figures, the next few consecutive TEXT blocks after a
// FIGURE_CAPTION are checked:
//   1. Substring match — if the TEXT content appears verbatim inside the
//      caption, it's a duplicate fragment (e.g. OCR read the tail end of a
//      long caption as a separate block). Removed regardless of length.
//   2. Dice coefficient — for near-matches where OCR introduced minor
//      differences (typos, missing characters). Compares character bigrams
//      and removes if overlap >= 70%.
//
// The scan stays local to avoid deleting valid prose elsewhere on the page
// that happens to repeat caption terms.

const CAPTION_DUPLICATE_LOOKAHEAD_TEXT_BLOCKS = 3;

const normalize = (text: string) =>
  text.replace(/\s+/g, " ").trim().toLowerCase();

const isDuplicateOfCaption = (
  captionText: string,
  textContent: string,
): boolean => {
  const caption = normalize(captionText);
  const text = normalize(textContent);
  if (text.length === 0) return false;

  if (caption.includes(text)) return true;

  const bigrams = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const ba = bigrams(caption);
  const bb = bigrams(text);
  let overlap = 0;
  for (const bg of ba) if (bb.has(bg)) overlap++;
  const dice = (2 * overlap) / (ba.size + bb.size);
  return dice >= 0.7;
};

const deduplicateCaptionText = (blocks: ContentBlock[]): ContentBlock[] => {
  const result: ContentBlock[] = [];

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    result.push(block);

    if (block.type !== BlockType.FIGURE_CAPTION) continue;

    let j = i + 1;
    let textChecks = 0;

    while (
      j < blocks.length &&
      textChecks < CAPTION_DUPLICATE_LOOKAHEAD_TEXT_BLOCKS
    ) {
      const next = blocks[j];
      if (next.type !== BlockType.TEXT) break;

      textChecks++;
      if (!isDuplicateOfCaption(block.text, next.text)) {
        result.push(next);
      }
      j++;
    }

    i = j - 1;
  }

  return result;
};

// ── Post-reorder fix: merge TEXT blocks cut by layout flow ───────────

const SENTENCE_END_REGEX = /[.!?…]["'»”)\]]*$/u;
const CONTINUATION_PUNCTUATION_REGEX = /[-,;:(]$/u;
const STARTS_WITH_LOWERCASE_REGEX = /^\p{Ll}/u;
const STARTS_WITH_FRAGMENT_REGEX = /^[-,.;:!?%)\]»]/u;
const LETTER_START_REGEX = /^\p{L}/u;
const LAST_WORD_REGEX = /(\p{L}[\p{L}\p{M}'’-]*)\s*$/u;
const CONTINUATION_END_WORDS = new Set([
  "a",
  "am",
  "an",
  "and",
  "as",
  "at",
  "auf",
  "aus",
  "bei",
  "between",
  "by",
  "das",
  "dem",
  "den",
  "der",
  "deren",
  "des",
  "die",
  "durch",
  "ein",
  "eine",
  "einem",
  "einer",
  "for",
  "from",
  "gegen",
  "hinsichtlich",
  "im",
  "in",
  "insbesondere",
  "into",
  "mit",
  "nach",
  "of",
  "ohne",
  "on",
  "or",
  "sowie",
  "through",
  "to",
  "über",
  "und",
  "unter",
  "von",
  "vom",
  "vor",
  "with",
  "without",
  "zu",
  "zum",
  "zur",
  "zwischen",
]);

const boxRight = (box: BoundingBox): number => box.left + box.width;
const boxBottom = (box: BoundingBox): number => box.top + box.height;

const horizontalOverlapRatio = (a: BoundingBox, b: BoundingBox): number => {
  const overlap = Math.max(
    0,
    Math.min(boxRight(a), boxRight(b)) - Math.max(a.left, b.left),
  );
  const minWidth = Math.min(a.width, b.width);
  return minWidth > 0 ? overlap / minWidth : 0;
};

const isSameColumnContinuation = (
  previous: BoundingBox,
  next: BoundingBox,
): boolean => {
  const verticalGap = next.top - boxBottom(previous);
  return (
    horizontalOverlapRatio(previous, next) >= 0.6 &&
    Math.abs(previous.left - next.left) <= 0.08 &&
    verticalGap >= -0.02 &&
    verticalGap <= Math.max(previous.height, next.height) * 0.75
  );
};

const isColumnWrapContinuation = (
  previous: BoundingBox,
  next: BoundingBox,
): boolean => {
  const widthSimilarity =
    Math.min(previous.width, next.width) / Math.max(previous.width, next.width);
  const resetToUpperPage = next.top < 0.25 && boxBottom(previous) > 0.55;
  const verticalReset =
    next.top + Math.max(next.height, 0.04) < previous.top || resetToUpperPage;
  return (
    horizontalOverlapRatio(previous, next) <= 0.15 &&
    widthSimilarity >= 0.65 &&
    next.left - previous.left >= 0.2 &&
    verticalReset
  );
};

const continuationHintScore = (
  previousText: string,
  nextText: string,
): number => {
  const previous = previousText.trimEnd();
  const next = nextText.trimStart();
  if (!previous || !next) return 0;
  if (SENTENCE_END_REGEX.test(previous) && !previous.endsWith("-")) return 0;

  let score = 0;

  if (!SENTENCE_END_REGEX.test(previous)) score += 1;
  if (CONTINUATION_PUNCTUATION_REGEX.test(previous)) score += 1;

  const lastWord = previous.match(LAST_WORD_REGEX)?.[1]?.toLocaleLowerCase();
  if (lastWord && CONTINUATION_END_WORDS.has(lastWord)) score += 1;

  if (
    STARTS_WITH_LOWERCASE_REGEX.test(next) ||
    STARTS_WITH_FRAGMENT_REGEX.test(next)
  )
    score += 1;

  return score;
};

const shouldMergeTextBlocks = (
  previous: ContentBlock,
  next: ContentBlock,
): boolean => {
  if (previous.type !== BlockType.TEXT || next.type !== BlockType.TEXT)
    return false;

  const layoutMatches =
    isSameColumnContinuation(previous.boundingBox, next.boundingBox) ||
    isColumnWrapContinuation(previous.boundingBox, next.boundingBox);
  if (!layoutMatches) return false;

  return continuationHintScore(previous.text, next.text) >= 2;
};

const joinContinuationText = (
  previousText: string,
  nextText: string,
): string => {
  const previous = previousText.trimEnd();
  const next = nextText.trimStart();
  if (!previous) return next;
  if (!next) return previous;

  if (previous.endsWith("-") && LETTER_START_REGEX.test(next)) {
    if (STARTS_WITH_LOWERCASE_REGEX.test(next)) {
      return previous.slice(0, -1) + next;
    }
    return previous + next;
  }

  if (STARTS_WITH_FRAGMENT_REGEX.test(next)) {
    return previous + next;
  }

  return `${previous} ${next}`;
};

const mergeBoundingBoxes = (a: BoundingBox, b: BoundingBox): BoundingBox => {
  const left = Math.min(a.left, b.left);
  const top = Math.min(a.top, b.top);
  const right = Math.max(boxRight(a), boxRight(b));
  const bottom = Math.max(boxBottom(a), boxBottom(b));
  return {
    left,
    top,
    width: right - left,
    height: bottom - top,
  };
};

const mergeTextContinuations = (blocks: ContentBlock[]): ContentBlock[] => {
  const result: ContentBlock[] = [];

  for (const block of blocks) {
    const previous = result.at(-1);
    if (previous && shouldMergeTextBlocks(previous, block)) {
      result[result.length - 1] = {
        ...previous,
        text: joinContinuationText(previous.text, block.text),
        confidence: (previous.confidence + block.confidence) / 2,
        boundingBox: mergeBoundingBoxes(
          previous.boundingBox,
          block.boundingBox,
        ),
      };
      continue;
    }

    result.push(block);
  }

  return result;
};

// ── Public API ───────────────────────────────────────────────────────

export const reorderBlocks = async (
  base64Image: string,
  contentBlocks: ContentBlock[],
  apiKey: string,
): Promise<ContentBlock[]> => {
  if (contentBlocks.length <= 1) return contentBlocks;

  const blockSummary = summarizeBlocks(contentBlocks);
  const userText = `Here are the content blocks to reorder:\n\n${blockSummary}\n\nReturn the indices in correct reading order.`;

  const result = await callVisionLLM<{ order: number[] }>(
    base64Image,
    apiKey,
    READING_ORDER_PROMPT,
    userText,
    "reading_order",
    READING_ORDER_SCHEMA,
  );

  const reordered = isValidOrder(result.order, contentBlocks.length)
    ? result.order.map((i) => contentBlocks[i])
    : contentBlocks;

  return mergeTextContinuations(
    deduplicateCaptionText(snapCaptionsToFigures(reordered)),
  );
};
