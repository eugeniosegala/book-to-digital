export const MAX_IMAGE_WIDTH_PTS = 432; // 6 inches

export const DOCX_FONT_SIZES = {
  title: 32,
  sectionHeader: 26,
  body: 22,
  pageLabel: 16,
  figureCaption: 18,
  table: 20,
  error: 18,
} as const;

export const DOCX_SPACING = {
  titleAfter: 200,
  sectionHeaderBefore: 300,
  sectionHeaderAfter: 150,
  paragraphAfter: 120,
  listAfter: 60,
  figureBefore: 200,
  figureAfter: 100,
  figureCaptionAfter: 200,
  tableAfter: 40,
  pageLabelAfter: 200,
  separatorBefore: 300,
  separatorAfter: 300,
} as const;

export const DOCX_COLORS = {
  missingFigure: "888888",
  figureCaption: "555555",
  pageLabel: "999999",
  pageSeparator: "CCCCCC",
  error: "CC0000",
} as const;
