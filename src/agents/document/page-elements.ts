import {
  Paragraph,
  TextRun,
  ImageRun,
  HeadingLevel,
  AlignmentType,
} from 'docx';
import { MAX_IMAGE_WIDTH_PTS } from '../../config.js';
import { BlockType, type ContentBlock } from '../../types.js';
import { sanitizeDocxText } from './text-sanitizer.js';

const scaledDimensions = (
  width: number,
  height: number,
  maxWidth: number,
): { width: number; height: number } => {
  if (width <= maxWidth) return { width, height };
  const ratio = maxWidth / width;
  return { width: maxWidth, height: Math.round(height * ratio) };
};

export const contentBlockToDocxElements = (block: ContentBlock): Paragraph[] => {
  switch (block.type) {
    case BlockType.TITLE:
      return [
        new Paragraph({
          heading: HeadingLevel.TITLE,
          children: [new TextRun({ text: sanitizeDocxText(block.text), bold: true, size: 32 })],
          spacing: { after: 200 },
        }),
      ];

    case BlockType.SECTION_HEADER:
      return [
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: sanitizeDocxText(block.text), bold: true, size: 26 })],
          spacing: { before: 300, after: 150 },
        }),
      ];

    case BlockType.TEXT:
      return [
        new Paragraph({
          children: [new TextRun({ text: sanitizeDocxText(block.text).replace(/\n/g, ' '), size: 22 })],
          spacing: { after: 120 },
        }),
      ];

    case BlockType.LIST:
      return sanitizeDocxText(block.text).split('\n').map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, size: 22 })],
            bullet: { level: 0 },
            spacing: { after: 60 },
          }),
      );

    case BlockType.FIGURE: {
      if (!block.imageBuffer || !block.imageDimensions) {
        return [
          new Paragraph({
            children: [
              new TextRun({ text: '[Figure: image not available]', italics: true, color: '888888' }),
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
              type: 'jpg',
            }),
          ],
          spacing: { before: 200, after: 100 },
        }),
      ];
    }

    case BlockType.FIGURE_CAPTION:
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [
            new TextRun({ text: sanitizeDocxText(block.text), italics: true, size: 18, color: '555555' }),
          ],
          spacing: { after: 200 },
        }),
      ];

    case BlockType.TABLE:
      return sanitizeDocxText(block.text).split('\n').map(
        (line) =>
          new Paragraph({
            children: [new TextRun({ text: line, font: 'Courier New', size: 20 })],
            spacing: { after: 40 },
          }),
      );

    default:
      return [];
  }
};
