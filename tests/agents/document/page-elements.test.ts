import { describe, it, expect } from 'vitest';
import { Paragraph } from 'docx';
import sharp from 'sharp';
import { contentBlockToDocxElements } from '../../../src/agents/document/page-elements.js';
import { BlockType, type ContentBlock } from '../../../src/types.js';

const baseBlock = (overrides: Partial<ContentBlock>): ContentBlock => ({
  type: BlockType.TEXT,
  text: 'Test text',
  confidence: 99,
  boundingBox: { top: 0, left: 0, width: 1, height: 0.1 },
  ...overrides,
});

describe('contentBlockToDocxElements', () => {
  it('converts TITLE to heading paragraph', () => {
    const elements = contentBlockToDocxElements(baseBlock({ type: BlockType.TITLE, text: 'My Title' }));
    expect(elements).toHaveLength(1);
    expect(elements[0]).toBeInstanceOf(Paragraph);
  });

  it('converts SECTION_HEADER to heading paragraph', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.SECTION_HEADER, text: '2.3 Section' }),
    );
    expect(elements).toHaveLength(1);
  });

  it('converts TEXT to a single flowing paragraph', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.TEXT, text: 'Line one\nLine two\nLine three' }),
    );
    expect(elements).toHaveLength(1);
  });

  it('converts LIST to bullet paragraphs', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.LIST, text: 'Item A\nItem B' }),
    );
    expect(elements).toHaveLength(2);
  });

  it('converts FIGURE with image buffer to image paragraph', async () => {
    const imgBuffer = await sharp({
      create: { width: 200, height: 300, channels: 3, background: { r: 0, g: 0, b: 0 } },
    })
      .jpeg()
      .toBuffer();

    const elements = contentBlockToDocxElements(
      baseBlock({
        type: BlockType.FIGURE,
        imageBuffer: imgBuffer,
        imageDimensions: { width: 200, height: 300 },
      }),
    );
    expect(elements).toHaveLength(1);
  });

  it('converts FIGURE without buffer to placeholder', () => {
    const elements = contentBlockToDocxElements(baseBlock({ type: BlockType.FIGURE }));
    expect(elements).toHaveLength(1);
  });

  it('converts FIGURE_CAPTION to italic paragraph', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.FIGURE_CAPTION, text: 'Fig. 1: A test caption' }),
    );
    expect(elements).toHaveLength(1);
  });

  it('converts TABLE to monospace paragraphs', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.TABLE, text: 'Col1  Col2\nA     B' }),
    );
    expect(elements).toHaveLength(2);
  });

  it('returns empty for unknown types', () => {
    const elements = contentBlockToDocxElements(
      baseBlock({ type: BlockType.HEADER as ContentBlock['type'] }),
    );
    expect(elements).toHaveLength(0);
  });
});
