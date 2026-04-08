import type { ContentBlock, ProcessedPage } from "../../types/content.js";

export const cloneBlock = (block: ContentBlock): ContentBlock => ({
  type: block.type,
  text: block.text,
  confidence: block.confidence,
  boundingBox: { ...block.boundingBox },
  imageBuffer: block.imageBuffer,
  imageDimensions: block.imageDimensions,
});

export const clonePage = (page: ProcessedPage): ProcessedPage => ({
  pageNumber: page.pageNumber,
  bookPageNumber: page.bookPageNumber,
  filePath: page.filePath,
  contentBlocks: page.contentBlocks.map(cloneBlock),
  errors: [...page.errors],
});
