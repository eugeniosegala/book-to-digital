import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reorderBlocks } from '../../../src/agents/vision/reading-order.js';
import { BlockType, type ContentBlock } from '../../../src/types.js';

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  vi.spyOn(global, 'setTimeout').mockImplementation((fn: () => void) => { fn(); return 0 as unknown as NodeJS.Timeout; });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const okResponse = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

const makeBlock = (type: BlockType, text: string, top: number, left: number): ContentBlock => ({
  type,
  text,
  confidence: 99,
  boundingBox: { top, left, width: 0.4, height: 0.05 },
});

describe('reorderBlocks', () => {
  it('reorders blocks according to LLM response', async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, 'Second column text', 0.1, 0.55),
      makeBlock(BlockType.TEXT, 'First column text', 0.1, 0.05),
      makeBlock(BlockType.TITLE, 'Page title', 0.02, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [2, 1, 0] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result).toHaveLength(3);
    expect(result[0].text).toBe('Page title');
    expect(result[1].text).toBe('First column text');
    expect(result[2].text).toBe('Second column text');
  });

  it('returns original order when LLM returns wrong number of indices', async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, 'Block A', 0.1, 0.05),
      makeBlock(BlockType.TEXT, 'Block B', 0.2, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [1] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result[0].text).toBe('Block A');
    expect(result[1].text).toBe('Block B');
  });

  it('returns original order when LLM returns duplicate indices', async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, 'Block A', 0.1, 0.05),
      makeBlock(BlockType.TEXT, 'Block B', 0.2, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 0] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result[0].text).toBe('Block A');
    expect(result[1].text).toBe('Block B');
  });

  it('returns original order when LLM returns out-of-range indices', async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, 'Block A', 0.1, 0.05),
      makeBlock(BlockType.TEXT, 'Block B', 0.2, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 5] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result[0].text).toBe('Block A');
    expect(result[1].text).toBe('Block B');
  });

  it('returns empty array for empty input without calling LLM', async () => {
    const result = await reorderBlocks('base64img', [], 'test-key');

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('returns single block without calling LLM', async () => {
    const blocks = [makeBlock(BlockType.TITLE, 'Only block', 0.05, 0.05)];

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe('Only block');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('snaps caption to its nearest figure after reordering', async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, 'Intro text', 0.05, 0.05),
      makeBlock(BlockType.FIGURE, '', 0.20, 0.50),
      makeBlock(BlockType.TEXT, 'Middle text', 0.40, 0.05),
      makeBlock(BlockType.FIGURE_CAPTION, 'Abb. 1', 0.38, 0.50),
    ];

    // LLM puts caption far from its figure: [0, 2, 3, 1]
    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 2, 3, 1] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    // Caption should be snapped right after the nearest figure
    const figIdx = result.findIndex((b) => b.type === BlockType.FIGURE);
    expect(result[figIdx + 1].type).toBe(BlockType.FIGURE_CAPTION);
    expect(result[figIdx + 1].text).toBe('Abb. 1');
  });

  it('snaps caption to closest figure when multiple figures exist', async () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, '', 0.10, 0.05),
      makeBlock(BlockType.FIGURE, '', 0.60, 0.05),
      makeBlock(BlockType.FIGURE_CAPTION, 'Caption for fig 2', 0.65, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 2, 1] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    // Caption is closer to the second figure (top=0.60) than the first (top=0.10)
    expect(result[0].type).toBe(BlockType.FIGURE);
    expect(result[0].boundingBox.top).toBe(0.10);
    expect(result[1].type).toBe(BlockType.FIGURE);
    expect(result[1].boundingBox.top).toBe(0.60);
    expect(result[2].type).toBe(BlockType.FIGURE_CAPTION);
    expect(result[2].text).toBe('Caption for fig 2');
  });

  it('removes TEXT block that duplicates the preceding FIGURE_CAPTION', async () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, '', 0.10, 0.25),
      makeBlock(BlockType.FIGURE_CAPTION, 'Abb. 2. Elternhaus Gregor Erharts in Ulm (Lange Straße 34, A301)', 0.10, 0.25),
      makeBlock(BlockType.TEXT, 'Abb. 2. Elternhaus Gregor Erharts\nin Ulm (Lange Straße 34, A301)', 0.69, 0.07),
      makeBlock(BlockType.TEXT, 'Some other paragraph', 0.80, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 1, 2, 3] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result).toHaveLength(3);
    expect(result.find((b) => b.text.startsWith('Abb. 2') && b.type === BlockType.TEXT)).toBeUndefined();
    expect(result[2].text).toBe('Some other paragraph');
  });

  it('keeps TEXT block after caption when content is different', async () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, '', 0.10, 0.25),
      makeBlock(BlockType.FIGURE_CAPTION, 'Abb. 1. A painting', 0.10, 0.25),
      makeBlock(BlockType.TEXT, 'Completely unrelated paragraph text', 0.50, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 1, 2] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    expect(result).toHaveLength(3);
    expect(result[2].text).toBe('Completely unrelated paragraph text');
  });

  it('removes partial TEXT duplicate of caption when overlap is high', async () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, '', 0.05, 0.08),
      makeBlock(BlockType.FIGURE_CAPTION, 'Abb. 2. Elternhaus Gregor Erharts in Ulm', 0.05, 0.08),
      makeBlock(BlockType.TEXT, 'Elternhaus Gregor Erharts in Ulm', 0.86, 0.30),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 1, 2] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    // "Elternhaus Gregor Erharts in Ulm" (32 chars) is contained in caption (40 chars) → 80% ratio
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.type !== BlockType.TEXT)).toBe(true);
  });

  it('removes short TEXT fragment that is a substring of caption', async () => {
    const blocks = [
      makeBlock(BlockType.FIGURE, '', 0.05, 0.08),
      makeBlock(BlockType.FIGURE_CAPTION, 'Abb. 1. Jörg Syrlin d. Ä.: Riss zum Ulmer Münsterhochaltar. Stuttgart, Landesmuseum Württemberg', 0.05, 0.08),
      makeBlock(BlockType.TEXT, 'rhochaltar. Stuttgart, Landesmuseum', 0.86, 0.30),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 1, 2] })),
    );

    const result = await reorderBlocks('base64img', blocks, 'test-key');

    // Fragment is contained in caption text — removed as duplicate
    expect(result).toHaveLength(2);
    expect(result.every((b) => b.type !== BlockType.TEXT)).toBe(true);
  });

  it('sends block summaries with correct schema name', async () => {
    const blocks = [
      makeBlock(BlockType.TITLE, 'A title here', 0.02, 0.05),
      makeBlock(BlockType.TEXT, 'Some paragraph text', 0.15, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ order: [0, 1] })),
    );

    await reorderBlocks('base64img', blocks, 'test-key');

    const [, opts] = mockFetch.mock.calls[0];
    const body = JSON.parse(opts.body);

    expect(body.response_format.json_schema.name).toBe('reading_order');

    const userContent = body.messages[1].content;
    const textPart = userContent.find((p: { type: string }) => p.type === 'text');
    expect(textPart.text).toContain('[0] TITLE');
    expect(textPart.text).toContain('[1] TEXT');
    expect(textPart.text).toContain('A title here');
    expect(textPart.text).toContain('Some paragraph text');
  });
});
