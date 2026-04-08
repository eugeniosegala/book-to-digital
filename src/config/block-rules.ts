import { BlockType } from "../types/content.js";

export const TEXTRACT_BLOCK_TYPE_MAP: Record<string, BlockType> = {
  LAYOUT_TITLE: BlockType.TITLE,
  LAYOUT_SECTION_HEADER: BlockType.SECTION_HEADER,
  LAYOUT_TEXT: BlockType.TEXT,
  LAYOUT_LIST: BlockType.LIST,
  LAYOUT_HEADER: BlockType.HEADER,
  LAYOUT_FOOTER: BlockType.FOOTER,
  LAYOUT_PAGE_NUMBER: BlockType.PAGE_NUMBER,
  LAYOUT_FIGURE: BlockType.FIGURE,
  LAYOUT_FIGURE_CAPTION: BlockType.FIGURE_CAPTION,
  LAYOUT_TABLE: BlockType.TABLE,
};

export const SKIP_BLOCK_TYPES = new Set<BlockType>([
  BlockType.HEADER,
  BlockType.FOOTER,
]);

export const TRANSLATABLE_BLOCK_TYPES = new Set<BlockType>([
  BlockType.TITLE,
  BlockType.SECTION_HEADER,
  BlockType.TEXT,
  BlockType.LIST,
  BlockType.FIGURE_CAPTION,
  BlockType.TABLE,
]);
