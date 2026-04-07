import type { AnalyzeDocumentResponse, Block } from '@aws-sdk/client-textract';
import { BlockType, type ContentBlock, type BoundingBox, type VisionAnalysis } from '../../types.js';
import { TEXTRACT_BLOCK_TYPE_MAP, SKIP_BLOCK_TYPES } from '../../config.js';
import { cropRegion, type ImageData } from '../../utils/image.js';
import * as log from '../../utils/logger.js';

export interface ParseResult {
  contentBlocks: ContentBlock[];
  bookPageNumber?: string;
}

// ── Textract helpers ────────────────────────────────────────────────

const toBoundingBox = (block: Block): BoundingBox => {
  const geo = block.Geometry?.BoundingBox;
  return {
    top: geo?.Top ?? 0,
    left: geo?.Left ?? 0,
    width: geo?.Width ?? 0,
    height: geo?.Height ?? 0,
  };
};

const resolveChildText = (block: Block, blockMap: Map<string, Block>): string => {
  const childIds = block.Relationships
    ?.filter((r) => r.Type === 'CHILD')
    .flatMap((r) => r.Ids ?? []) ?? [];

  const lines: string[] = [];
  for (const id of childIds) {
    const child = blockMap.get(id);
    if (child?.BlockType === 'LINE') {
      lines.push(child.Text ?? '');
    }
  }

  return lines.join('\n');
};

// ── Vision helpers ──────────────────────────────────────────────────

const buildFigureBlock = async (
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  box: BoundingBox,
  isFullPage: boolean,
): Promise<ContentBlock> => {
  let imageData: ImageData;
  if (isFullPage) {
    imageData = { buffer: imageBuffer, width: imageWidth, height: imageHeight };
  } else {
    imageData = await cropRegion(imageBuffer, imageWidth, imageHeight, box);
  }

  return {
    type: BlockType.FIGURE,
    text: '',
    confidence: 100,
    boundingBox: box,
    imageBuffer: imageData.buffer,
    imageDimensions: { width: imageData.width, height: imageData.height },
  };
};

const buildVisionFigureBlocks = async (
  fig: VisionAnalysis['figures'][number],
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
): Promise<ContentBlock[]> => {
  const { boundingBox: box } = fig;
  const result: ContentBlock[] = [];

  const invalidBox = box.width <= 0 || box.height <= 0 || box.left >= 1 || box.top >= 1;
  if (invalidBox) {
    log.warn(`Invalid bounding box, using full-page image: ${JSON.stringify(box)}`);
  }

  const isFullPage = fig.type === 'full_page' || invalidBox;
  result.push(await buildFigureBlock(imageBuffer, imageWidth, imageHeight, box, isFullPage));

  if (fig.caption) {
    result.push({ type: BlockType.FIGURE_CAPTION, text: fig.caption, confidence: 100, boundingBox: box });
  }

  return result;
};

// Match each Textract LAYOUT_FIGURE to the vision figure with the closest vertical position
const findClosestVisionFigure = (
  textractTop: number,
  figures: VisionAnalysis['figures'],
  unmatched: Set<number>,
): number => {
  let closest = -1;
  let minDist = Infinity;
  for (const idx of unmatched) {
    const dist = Math.abs(figures[idx].boundingBox.top - textractTop);
    if (dist < minDist) {
      minDist = dist;
      closest = idx;
    }
  }
  return closest;
};

// ── Main parser ─────────────────────────────────────────────────────
// Textract provides reading order and text extraction.
// Vision provides figure detection, captions, and page numbers.
// Textract LAYOUT_FIGURE positions are used as anchors to slot vision
// figures into the correct reading-order position.

export const parseLayoutBlocks = async (
  response: AnalyzeDocumentResponse,
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  vision: VisionAnalysis,
): Promise<ParseResult> => {
  const blocks = response.Blocks ?? [];
  const blockMap = new Map<string, Block>();
  for (const block of blocks) {
    if (block.Id) blockMap.set(block.Id, block);
  }

  const layoutBlocks = blocks.filter(
    (b) => b.BlockType && (b.BlockType as string) in TEXTRACT_BLOCK_TYPE_MAP,
  );

  const contentBlocks: ContentBlock[] = [];
  const unmatchedFigures = new Set(vision.figures.map((_, i) => i));

  for (const block of layoutBlocks) {
    const type = TEXTRACT_BLOCK_TYPE_MAP[block.BlockType as string];
    if (!type) continue;

    if (SKIP_BLOCK_TYPES.has(type)) continue;

    // Use Textract LAYOUT_FIGURE as positional anchor, replace with closest vision figure
    if (type === BlockType.FIGURE) {
      const textractTop = toBoundingBox(block).top;
      const closestIdx = findClosestVisionFigure(textractTop, vision.figures, unmatchedFigures);
      if (closestIdx !== -1) {
        unmatchedFigures.delete(closestIdx);
        contentBlocks.push(...await buildVisionFigureBlocks(
          vision.figures[closestIdx], imageBuffer, imageWidth, imageHeight,
        ));
      }
      continue;
    }

    // Skip Textract captions — vision captions are inserted with their figure above
    if (type === BlockType.FIGURE_CAPTION) continue;

    const boundingBox = toBoundingBox(block);
    const text = resolveChildText(block, blockMap);
    contentBlocks.push({ type, text, confidence: block.Confidence ?? 0, boundingBox });
  }

  // Append vision figures that didn't match any Textract figure
  for (const idx of unmatchedFigures) {
    contentBlocks.push(...await buildVisionFigureBlocks(
      vision.figures[idx], imageBuffer, imageWidth, imageHeight,
    ));
  }

  const bookPageNumber = vision.pageNumber ?? undefined;

  return { contentBlocks, bookPageNumber };
};