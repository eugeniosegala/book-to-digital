import type { ImageDimensions } from "./image.js";

export enum BlockType {
  TITLE = "TITLE",
  SECTION_HEADER = "SECTION_HEADER",
  TEXT = "TEXT",
  LIST = "LIST",
  HEADER = "HEADER",
  FOOTER = "FOOTER",
  PAGE_NUMBER = "PAGE_NUMBER",
  FIGURE = "FIGURE",
  FIGURE_CAPTION = "FIGURE_CAPTION",
  TABLE = "TABLE",
}

export interface BoundingBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

export interface ContentBlock {
  type: BlockType;
  text: string;
  confidence: number;
  boundingBox: BoundingBox;
  imageBuffer?: Buffer;
  imageDimensions?: ImageDimensions;
}

export interface ProcessedPage {
  pageNumber: number;
  bookPageNumber?: string;
  filePath: string;
  contentBlocks: ContentBlock[];
  errors: string[];
}
