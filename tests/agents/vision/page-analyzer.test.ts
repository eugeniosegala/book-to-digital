import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { analyzePageVision } from "../../../src/agents/vision/page-enrichment.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  vi.spyOn(global, "setTimeout").mockImplementation((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const okResponse = (content: string) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content } }] }),
});

const mockBothCalls = (pageNumber: string | null, figures: unknown[] = []) => {
  // First call: page number, second call: figures
  mockFetch
    .mockResolvedValueOnce(okResponse(JSON.stringify({ pageNumber })))
    .mockResolvedValueOnce(okResponse(JSON.stringify({ figures })));
};

describe("analyzePageVision", () => {
  it("combines page number and figures from separate calls", async () => {
    mockBothCalls("42", [
      {
        boundingBox: { top: 0.1, left: 0.1, width: 0.4, height: 0.6 },
        caption: "Abb. 1: Test figure",
        type: "illustration",
      },
    ]);

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    expect(result.pageNumber).toBe("42");
    expect(result.figures).toHaveLength(1);
    expect(result.figures[0].caption).toBe("Abb. 1: Test figure");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("handles pages with no figures", async () => {
    mockBothCalls("10", []);

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    expect(result.pageNumber).toBe("10");
    expect(result.figures).toEqual([]);
  });

  it("handles null page number", async () => {
    mockBothCalls(null, []);

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    expect(result.pageNumber).toBeNull();
  });

  it("clamps bounding boxes to valid range", async () => {
    mockBothCalls("1", [
      {
        boundingBox: { top: -0.1, left: 0.9, width: 0.5, height: 1.5 },
        caption: null,
        type: "inline",
      },
    ]);

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    const box = result.figures[0].boundingBox;
    expect(box.top).toBe(0);
    expect(box.left).toBe(0.9);
    expect(box.width).toBeCloseTo(0.1);
    expect(box.height).toBeCloseTo(1);
  });

  it("gracefully handles page number call failure", async () => {
    // Both calls run in parallel — page number fails all retries, figures succeeds
    const errorResponse = { ok: false, status: 500, text: async () => "error" };
    mockFetch.mockResolvedValue(errorResponse);
    // Override first successful call for figures (runs concurrently)
    mockFetch.mockResolvedValueOnce(errorResponse);
    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ figures: [] })),
    );

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    expect(result.pageNumber).toBeNull();
    expect(result.figures).toEqual([]);
  });

  it("gracefully handles figures call failure", async () => {
    const errorResponse = { ok: false, status: 500, text: async () => "error" };
    mockFetch.mockResolvedValue(errorResponse);
    mockFetch.mockResolvedValueOnce(
      okResponse(JSON.stringify({ pageNumber: "5" })),
    );
    mockFetch.mockResolvedValueOnce(errorResponse);

    const result = await analyzePageVision(Buffer.from("fake"), "test-key");
    expect(result.pageNumber).toBe("5");
    expect(result.figures).toEqual([]);
  });

  it("sends separate requests with correct schemas", async () => {
    mockBothCalls(null, []);

    await analyzePageVision(Buffer.from("test"), "my-key");

    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, opts1] = mockFetch.mock.calls[0];
    const body1 = JSON.parse(opts1.body);
    expect(body1.response_format.json_schema.name).toBe("page_number");

    const [, opts2] = mockFetch.mock.calls[1];
    const body2 = JSON.parse(opts2.body);
    expect(body2.response_format.json_schema.name).toBe("page_figures");
  });
});
