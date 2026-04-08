import {
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
} from "docx";
import {
  DOCX_COLORS,
  DOCX_FONT_SIZES,
  DOCX_SPACING,
  MAX_IMAGE_WIDTH_PTS,
} from "../../config/document.js";
import { BlockType, type ContentBlock } from "../../types/content.js";
import { sanitizeDocxText } from "./text-sanitizer.js";

const scaledDimensions = (
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } => {
  if (width <= maxWidth) return { width, height };
  const ratio = maxWidth / width;
  return { width: maxWidth, height: Math.round(height * ratio) };
};

export const contentBlockToDocxElements = (
  block: ContentBlock,
): Paragraph[] => {
  switch (block.type) {
    case BlockType.TITLE:
      return [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [
            new TextRun({
              text: sanitizeDocxText(block.text),
              bold: true,
              size: DOCX_FONT_SIZES.title,
            }),
          ],
          spacing: { after: DOCX_SPACING.titleAfter },
        }),
      ];

    case BlockType.SECTION_HEADER:
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [
            new TextRun({
              text: sanitizeDocxText(block.text),
              bold: true,
              size: DOCX_FONT_SIZES.sectionHeader,
            }),
          ],
          spacing: {
            before: DOCX_SPACING.sectionHeaderBefore,
            after: DOCX_SPACING.sectionHeaderAfter,
          },
        }),
      ];

    case BlockType.TEXT:
      return [
        new Paragraph({
          children: [
            new TextRun({
              text: sanitizeDocxText(block.text).replace(/\n/g, " "),
              size: DOCX_FONT_SIZES.body,
            }),
          ],
          spacing: { after: DOCX_SPACING.paragraphAfter },
        }),
      ];

    case BlockType.LIST:
      return sanitizeDocxText(block.text)
        .split("\n")
        .map(
          (line) =>
            new Paragraph({
              children: [new TextRun({ text: line, size: DOCX_FONT_SIZES.body })],
              bullet: { level: 0 },
              spacing: { after: DOCX_SPACING.listAfter },
            }),
        );

    case BlockType.FIGURE: {
      if (!block.imageBuffer || !block.imageDimensions) {
        return [
          new Paragraph({
            children: [
              new TextRun({
                text: "[Figure: image not available]",
                italics: true,
                color: DOCX_COLORS.missingFigure,
              }),
            ],
          }),
        ];
      }

      const { width, height } = scaledDimensions(
        block.imageDimensions.width,
        block.imageDimensions.height,
        MAX_IMAGE_WIDTH_PTS,
      );

      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new ImageRun({
              data: block.imageBuffer,
              transformation: { width, height },
              type: "jpg",
            }),
          ],
          spacing: {
            before: DOCX_SPACING.figureBefore,
            after: DOCX_SPACING.figureAfter,
          },
        }),
      ];
    }

    case BlockType.FIGURE_CAPTION:
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({
              text: sanitizeDocxText(block.text),
              italics: true,
              size: DOCX_FONT_SIZES.figureCaption,
              color: DOCX_COLORS.figureCaption,
            }),
          ],
          spacing: { after: DOCX_SPACING.figureCaptionAfter },
        }),
      ];

    case BlockType.TABLE:
      return sanitizeDocxText(block.text)
        .split("\n")
        .map(
          (line) =>
            new Paragraph({
              children: [
                new TextRun({
                  text: line,
                  font: "Courier New",
                  size: DOCX_FONT_SIZES.table,
                }),
              ],
              spacing: { after: DOCX_SPACING.tableAfter },
            }),
        );

    default:
      return [];
  }
};
