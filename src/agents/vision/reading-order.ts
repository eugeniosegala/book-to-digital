import { BlockType, type ContentBlock, type BoundingBox } from '../../types.js';
import { callVisionLLM } from '../../clients/vision-llm.js';

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
  type: 'object',
  properties: {
    order: {
      type: 'array',
      items: { type: 'integer' },
    },
  },
  required: ['order'],
};

const MAX_PREVIEW_LENGTH = 80;

const summarizeBlocks = (blocks: ContentBlock[]): string =>
  blocks.map((b, i) => {
    const preview = b.text.slice(0, MAX_PREVIEW_LENGTH).replaceAll('\n', ' ');
    const { top, left } = b.boundingBox;
    return `[${i}] ${b.type} (top=${top.toFixed(2)} left=${left.toFixed(2)}) "${preview}"`;
  }).join('\n');

const isValidOrder = (order: number[], length: number): boolean => {
  if (order.length !== length) return false;
  const seen = new Set<number>();
  for (const idx of order) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= length || seen.has(idx)) return false;
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
      boxDistance(best.block.boundingBox, caption.boundingBox) ? cur : best,
    );

    // Insert caption right after its nearest figure
    result.splice(nearest.index + 1, 0, caption);
  }

  return result;
};

// ── Post-reorder fix: remove TEXT blocks that duplicate a caption ────
//
// Textract often picks up caption text twice: once as FIGURE_CAPTION (from
// vision) and again as a TEXT block (from OCR). After snapping captions to
// figures, any TEXT block immediately following a FIGURE_CAPTION is checked:
//   1. Substring match — if the TEXT content appears verbatim inside the
//      caption, it's a duplicate fragment (e.g. OCR read the tail end of a
//      long caption as a separate block). Removed regardless of length.
//   2. Dice coefficient — for near-matches where OCR introduced minor
//      differences (typos, missing characters). Compares character bigrams
//      and removes if overlap >= 70%.

const normalize = (text: string) => text.replace(/\s+/g, ' ').trim().toLowerCase();

const isDuplicateOfCaption = (captionText: string, textContent: string): boolean => {
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

const deduplicateCaptionText = (blocks: ContentBlock[]): ContentBlock[] =>
  blocks.filter((block, i) => {
    if (i === 0 || block.type !== BlockType.TEXT) return true;
    const prev = blocks[i - 1];
    if (prev.type !== BlockType.FIGURE_CAPTION) return true;
    return !isDuplicateOfCaption(prev.text, block.text);
  });

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
    base64Image, apiKey, READING_ORDER_PROMPT,
    userText, 'reading_order', READING_ORDER_SCHEMA,
  );

  const reordered = isValidOrder(result.order, contentBlocks.length)
    ? result.order.map((i) => contentBlocks[i])
    : contentBlocks;

  return deduplicateCaptionText(snapCaptionsToFigures(reordered));
};
