import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import type { AnalyzeDocumentResponse } from '@aws-sdk/client-textract';
import { parseLayoutBlocks } from '../../../src/agents/ocr/layout-parser.js';
import type { VisionAnalysis } from '../../../src/types.js';

const loadFixture = async (): Promise<AnalyzeDocumentResponse> => {
  const raw = await fs.readFile(
    path.join(import.meta.dirname, '../../fixtures/textract-response.json'),
    'utf-8',
  );
  return JSON.parse(raw);
};

const createTestImage = async (width: number, height: number): Promise<Buffer> =>
  sharp({ create: { width, height, channels: 3, background: { r: 128, g: 128, b: 128 } } })
    .jpeg()
    .toBuffer();

const emptyVision: VisionAnalysis = { pageNumber: null, figures: [] };

describe('parseLayoutBlocks (text extraction)', () => {
  it('extracts text blocks in correct order', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);
    const { contentBlocks } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, emptyVision);

    const textTypes = contentBlocks
      .filter((b) => b.type !== 'FIGURE' && b.type !== 'FIGURE_CAPTION')
      .map((b) => b.type);
    expect(textTypes).toContain('TITLE');
    expect(textTypes).toContain('TEXT');
  });

  it('resolves title text from LINE children', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);
    const { contentBlocks } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, emptyVision);

    const title = contentBlocks.find((b) => b.type === 'TITLE');
    expect(title?.text).toBe('Chapter 1: Introduction');
  });

  it('handles empty response', async () => {
    const imgBuffer = await createTestImage(800, 1200);
    const { contentBlocks, bookPageNumber } = await parseLayoutBlocks({ Blocks: [] }, imgBuffer, 800, 1200, emptyVision);
    expect(contentBlocks).toEqual([]);
    expect(bookPageNumber).toBeUndefined();
  });
});

describe('parseLayoutBlocks (with vision)', () => {
  it('uses vision LLM figures instead of Textract figures', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: '42',
      figures: [
        {
          boundingBox: { top: 0.1, left: 0.1, width: 0.4, height: 0.6 },
          caption: 'Abb. 1: A test figure',
          type: 'illustration',
        },
      ],
    };

    const { contentBlocks } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, vision);

    const figures = contentBlocks.filter((b) => b.type === 'FIGURE');
    const captions = contentBlocks.filter((b) => b.type === 'FIGURE_CAPTION');
    expect(figures).toHaveLength(1);
    expect(figures[0].imageBuffer).toBeDefined();
    expect(captions).toHaveLength(1);
    expect(captions[0].text).toBe('Abb. 1: A test figure');
  });

  it('prefers vision page number over Textract', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: '99',
      figures: [],
    };

    const { bookPageNumber } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, vision);
    expect(bookPageNumber).toBe('99');
  });

  it('trusts vision null page number — does not fall back to Textract', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: null,
      figures: [],
    };

    const { bookPageNumber } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, vision);
    expect(bookPageNumber).toBeUndefined();
  });

  it('uses full page image for full_page figures', async () => {
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: null,
      figures: [
        {
          boundingBox: { top: 0.02, left: 0.02, width: 0.96, height: 0.96 },
          caption: null,
          type: 'full_page',
        },
      ],
    };

    const { contentBlocks } = await parseLayoutBlocks({ Blocks: [] }, imgBuffer, 800, 1200, vision);
    const figure = contentBlocks.find((b) => b.type === 'FIGURE');
    expect(figure?.imageDimensions?.width).toBe(800);
    expect(figure?.imageDimensions?.height).toBe(1200);
  });

  it('crops illustration figures', async () => {
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: null,
      figures: [
        {
          boundingBox: { top: 0.2, left: 0.1, width: 0.4, height: 0.5 },
          caption: null,
          type: 'illustration',
        },
      ],
    };

    const { contentBlocks } = await parseLayoutBlocks({ Blocks: [] }, imgBuffer, 800, 1200, vision);
    const figure = contentBlocks.find((b) => b.type === 'FIGURE');
    expect(figure?.imageDimensions?.width).not.toBe(800);
  });

  it('skips Textract figures when vision is provided', async () => {
    const response = await loadFixture();
    const imgBuffer = await createTestImage(800, 1200);

    const vision: VisionAnalysis = {
      pageNumber: '42',
      figures: [],
    };

    const { contentBlocks } = await parseLayoutBlocks(response, imgBuffer, 800, 1200, vision);
    const figures = contentBlocks.filter((b) => b.type === 'FIGURE');
    expect(figures).toHaveLength(0);
  });
});

