import { BlockType } from './types.js';

// --- Block type mappings ---

// Textract uses a LAYOUT_ prefix — this maps to our enum
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

// Block type categories — single source of truth for subsets used across modules
export const SKIP_BLOCK_TYPES = new Set<BlockType>([
  BlockType.HEADER, BlockType.FOOTER, BlockType.PAGE_NUMBER,
]);
export const TRANSLATABLE_BLOCK_TYPES = new Set<BlockType>([
  BlockType.TITLE, BlockType.SECTION_HEADER, BlockType.TEXT,
  BlockType.LIST, BlockType.FIGURE_CAPTION, BlockType.TABLE,
]);

// --- Language mappings ---

export const LANGUAGE_MAP: Record<string, string> = {
  en: 'British English',
  de: 'German',
  it: 'Italian',
  fr: 'French',
  es: 'Spanish',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  cs: 'Czech',
  ru: 'Russian',
  ja: 'Japanese',
  zh: 'Chinese',
};

// --- Client config ---

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_MODEL = 'google/gemini-3.1-pro-preview';
export const OPENROUTER_RETRY_DELAYS = [1000, 2000, 4000] as const;
export const OPENROUTER_MAX_RETRIES = OPENROUTER_RETRY_DELAYS.length;


export const TEXTRACT_MAX_ATTEMPTS = 5;

// --- Pipeline config ---

export const DEFAULT_CONCURRENCY = 5;
export const TRANSLATION_CONTEXT_BLOCKS = 2;
export const TRANSLATION_BATCH_SIZE = 5;

// --- Image processing ---

export const CROP_PADDING = 0.05;
export const FIGURE_CROP_MARGIN = 0.1;
export const JPEG_OUTPUT_QUALITY = 90;
export const MAX_IMAGE_WIDTH_PTS = 432; // 6 inches
export const ORIENTATION_LLM_MIN_CONFIDENCE = 0.9;
