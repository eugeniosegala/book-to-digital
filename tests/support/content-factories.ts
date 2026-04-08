import { BlockType, type ContentBlock, type ProcessedPage } from "../../src/types.js";

export const makeBlock = (
  type: BlockType = BlockType.TEXT,
  text = "Test text",
  top = 0,
  left = 0,
  width = 1,
  height = 0.1,
  overrides: Partial<ContentBlock> = {},
): ContentBlock => ({
  type,
  text,
  confidence: 99,
  boundingBox: { top, left, width, height },
  ...overrides,
});

export const makePage = (
  pageNumber: number,
  blocks: Array<
    {
      type: BlockType;
      text: string;
      top?: number;
      left?: number;
      width?: number;
      height?: number;
    } & Partial<ContentBlock>
  > = [{ type: BlockType.TEXT, text: "Sample text" }],
  overrides: Partial<ProcessedPage> = {},
): ProcessedPage => ({
  pageNumber,
  filePath: `page${pageNumber}.jpg`,
  contentBlocks: blocks.map((block) => {
    const {
      top,
      left,
      width,
      height,
      ...contentOverrides
    } = block;

    return makeBlock(
      block.type,
      block.text,
      top ?? 0,
      left ?? 0,
      width ?? 1,
      height ?? 0.1,
      contentOverrides,
    );
  }),
  errors: [],
  ...overrides,
});
