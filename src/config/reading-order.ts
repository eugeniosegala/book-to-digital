export const READING_ORDER_MAX_PREVIEW_LENGTH = 80;
export const CAPTION_DUPLICATE_LOOKAHEAD_TEXT_BLOCKS = 3;

export const SAME_COLUMN_MIN_OVERLAP_RATIO = 0.6;
export const SAME_COLUMN_MAX_LEFT_DELTA = 0.08;
export const SAME_COLUMN_MAX_VERTICAL_GAP_FACTOR = 0.75;

export const COLUMN_WRAP_MAX_OVERLAP_RATIO = 0.15;
export const COLUMN_WRAP_MIN_WIDTH_SIMILARITY = 0.65;
export const COLUMN_WRAP_MIN_LEFT_SHIFT = 0.2;
export const COLUMN_WRAP_TOP_RESET_THRESHOLD = 0.25;
export const COLUMN_WRAP_PREVIOUS_BOTTOM_THRESHOLD = 0.55;
export const COLUMN_WRAP_MIN_HEIGHT_FALLBACK = 0.04;

export const TEXT_CONTINUATION_MIN_SCORE = 2;

export const CONTINUATION_END_WORDS = new Set([
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
