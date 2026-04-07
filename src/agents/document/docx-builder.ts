import {
  Document,
  Paragraph,
  TextRun,
  BorderStyle,
  Packer,
  SectionType,
} from 'docx';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { ProcessedPage } from '../../types.js';
import { contentBlockToDocxElements } from './page-elements.js';
import { sanitizeDocxText } from './text-sanitizer.js';

const separator = (): Paragraph =>
  new Paragraph({
    border: {
      bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC', space: 1 },
    },
    spacing: { before: 300, after: 300 },
  });

const buildPageSection = (page: ProcessedPage, isLast: boolean): Paragraph[] => {
  const elements: Paragraph[] = [];

  // Page caption
  elements.push(
    new Paragraph({
      children: [
        new TextRun({
          text: sanitizeDocxText(
            `— Page ${page.bookPageNumber ?? page.pageNumber} · ${path.basename(page.filePath)} —`,
          ),
          italics: true,
          size: 16,
          color: '999999',
        }),
      ],
      spacing: { after: 200 },
    }),
  );

  // Content blocks
  for (const block of page.contentBlocks) {
    elements.push(...contentBlockToDocxElements(block));
  }

  // Error placeholders
  for (const err of page.errors) {
    elements.push(
      new Paragraph({
        children: [
          new TextRun({
            text: sanitizeDocxText(`[Error: ${err}]`),
            italics: true,
            color: 'CC0000',
            size: 18,
          }),
        ],
      }),
    );
  }

  // Thin separator between pages (no hard page break)
  if (!isLast) {
    elements.push(separator());
  }

  return elements;
};

export const buildDocument = async (pages: ProcessedPage[]): Promise<Buffer> => {
  const allChildren: Paragraph[] = [];

  for (let i = 0; i < pages.length; i++) {
    allChildren.push(...buildPageSection(pages[i], i === pages.length - 1));
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          type: SectionType.CONTINUOUS,
        },
        children: allChildren,
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(doc));
};

export const writeDocument = async (
  pages: ProcessedPage[],
  outputPath: string,
): Promise<void> => {
  const buffer = await buildDocument(pages);
  await fs.writeFile(outputPath, buffer);
};
