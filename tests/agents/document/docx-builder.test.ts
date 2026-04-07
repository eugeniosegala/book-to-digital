import JSZip from 'jszip';
import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../src/agents/document/docx-builder.js';
import { BlockType, type ProcessedPage } from '../../../src/types.js';

const makePage = (pageNumber: number, text = 'Sample text'): ProcessedPage => ({
  pageNumber,
  filePath: `/tmp/page_${pageNumber}.jpg`,
  contentBlocks: [
    {
      type: BlockType.TEXT,
      text,
      confidence: 99,
      boundingBox: { top: 0.1, left: 0.1, width: 0.8, height: 0.1 },
    },
  ],
  errors: [],
});

describe('buildDocument', () => {
  it('produces a valid docx buffer', async () => {
    const pages = [makePage(1), makePage(2)];
    const buffer = await buildDocument(pages);

    // DOCX files are ZIP archives — they start with PK signature
    expect(buffer[0]).toBe(0x50); // P
    expect(buffer[1]).toBe(0x4b); // K
    expect(buffer.length).toBeGreaterThan(100);
  });

  it('handles single page', async () => {
    const buffer = await buildDocument([makePage(1)]);
    expect(buffer[0]).toBe(0x50);
  });

  it('handles pages with errors', async () => {
    const page: ProcessedPage = {
      ...makePage(1),
      errors: ['OCR failed for this page'],
    };
    const buffer = await buildDocument([page]);
    expect(buffer[0]).toBe(0x50);
  });

  it('handles empty pages array', async () => {
    const buffer = await buildDocument([]);
    expect(buffer[0]).toBe(0x50);
  });

  it('removes XML-illegal control characters from document text', async () => {
    const buffer = await buildDocument([
      {
        ...makePage(15),
        contentBlocks: [
          {
            type: BlockType.FIGURE_CAPTION,
            text: 'Abb. 2. Veit Sto\x11: Darbringung im Tempel.',
            confidence: 100,
            boundingBox: { top: 0.1, left: 0.1, width: 0.8, height: 0.1 },
          },
        ],
      },
    ]);

    const zip = await JSZip.loadAsync(buffer);
    const documentXml = await zip.file('word/document.xml')?.async('string');

    expect(documentXml).toBeDefined();
    expect(documentXml).not.toContain('\x11');
    expect(documentXml).toContain('Abb. 2. Veit Sto: Darbringung im Tempel.');
  });
});
