import { describe, expect, it } from "vitest";
import { reorderBlocks } from "../../../src/agents/vision/reading-order.js";
import { BlockType } from "../../../src/types.js";
import { makeBlock } from "../../support/content-factories.js";
import {
  okJsonSchemaResponse,
  setupMockFetch,
} from "../../support/openrouter-mocks.js";

const mockFetch = setupMockFetch();

describe("reorderBlocks", () => {
  it("reorders blocks according to the LLM response", async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, "Second column text", 0.1, 0.55, 0.4, 0.05),
      makeBlock(BlockType.TEXT, "First column text", 0.1, 0.05, 0.4, 0.05),
      makeBlock(BlockType.TITLE, "Page title", 0.02, 0.05, 0.4, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(okJsonSchemaResponse({ order: [2, 1, 0] }));

    const result = await reorderBlocks("base64img", blocks, "test-key");

    expect(result.map((block) => block.text)).toEqual([
      "Page title",
      "First column text",
      "Second column text",
    ]);
  });

  it("returns the original order when the LLM response length is wrong", async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, "Block A", 0.1, 0.05, 0.4, 0.05),
      makeBlock(BlockType.TEXT, "Block B", 0.2, 0.05, 0.4, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(okJsonSchemaResponse({ order: [1] }));

    const result = await reorderBlocks("base64img", blocks, "test-key");

    expect(result.map((block) => block.text)).toEqual(["Block A", "Block B"]);
  });

  it("returns the original order when the LLM response contains duplicate indices", async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, "Block A", 0.1, 0.05, 0.4, 0.05),
      makeBlock(BlockType.TEXT, "Block B", 0.2, 0.05, 0.4, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(okJsonSchemaResponse({ order: [0, 0] }));

    const result = await reorderBlocks("base64img", blocks, "test-key");

    expect(result.map((block) => block.text)).toEqual(["Block A", "Block B"]);
  });

  it("returns the original order when the LLM response contains out-of-range indices", async () => {
    const blocks = [
      makeBlock(BlockType.TEXT, "Block A", 0.1, 0.05, 0.4, 0.05),
      makeBlock(BlockType.TEXT, "Block B", 0.2, 0.05, 0.4, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(okJsonSchemaResponse({ order: [0, 5] }));

    const result = await reorderBlocks("base64img", blocks, "test-key");

    expect(result.map((block) => block.text)).toEqual(["Block A", "Block B"]);
  });

  it("returns empty input without calling the LLM", async () => {
    const result = await reorderBlocks("base64img", [], "test-key");

    expect(result).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns a single block without calling the LLM", async () => {
    const blocks = [makeBlock(BlockType.TITLE, "Only block", 0.05, 0.05)];

    const result = await reorderBlocks("base64img", blocks, "test-key");

    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Only block");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("sends block summaries with the reading-order schema", async () => {
    const blocks = [
      makeBlock(BlockType.TITLE, "A title here", 0.02, 0.05),
      makeBlock(BlockType.TEXT, "Some paragraph text", 0.15, 0.05),
    ];

    mockFetch.mockResolvedValueOnce(okJsonSchemaResponse({ order: [0, 1] }));

    await reorderBlocks("base64img", blocks, "test-key");

    const [, request] = mockFetch.mock.calls[0];
    const body = JSON.parse(request.body);

    expect(body.response_format.json_schema.name).toBe("reading_order");

    const userContent = body.messages[1].content;
    const textPart = userContent.find(
      (part: { type: string }) => part.type === "text",
    );
    expect(textPart.text).toContain("[0] TITLE");
    expect(textPart.text).toContain("[1] TEXT");
    expect(textPart.text).toContain("A title here");
    expect(textPart.text).toContain("Some paragraph text");
  });
});
