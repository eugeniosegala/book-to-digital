export enum BlockType {
  TITLE = 'TITLE',
  SECTION_HEADER = 'SECTION_HEADER',
  TEXT = 'TEXT',
  LIST = 'LIST',
  HEADER = 'HEADER',
  FOOTER = 'FOOTER',
  PAGE_NUMBER = 'PAGE_NUMBER',
  FIGURE = 'FIGURE',
  FIGURE_CAPTION = 'FIGURE_CAPTION',
  TABLE = 'TABLE',
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
  imageDimensions?: { width: number; height: number };
}

export interface ProcessedPage {
  pageNumber: number;
  bookPageNumber?: string;
  filePath: string;
  contentBlocks: ContentBlock[];
  errors: string[];
}

export type FigureType = 'full_page' | 'illustration' | 'inline';

export interface FigureInfo {
  boundingBox: BoundingBox;
  caption: string | null;
  type: FigureType;
}

export interface VisionAnalysis {
  pageNumber: string | null;
  figures: FigureInfo[];
}

export type SortOrder = 'name' | 'date';

export interface PipelineConfig {
  inputDir: string;
  outputPath: string;
  concurrency: number;
  awsRegion: string;
  sortOrder: SortOrder;
  maxPages?: number;
  translateLanguage?: string;
  verbose: boolean;
}
