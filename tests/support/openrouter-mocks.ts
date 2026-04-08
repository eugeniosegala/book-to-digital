import { afterEach, beforeEach, vi } from "vitest";

export const setupMockFetch = () => {
  const mockFetch = vi.fn();

  beforeEach(() => {
    mockFetch.mockReset();
    vi.stubGlobal("fetch", mockFetch);
    vi.spyOn(global, "setTimeout").mockImplementation((fn: () => void) => {
      fn();
      return 0 as unknown as NodeJS.Timeout;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  return mockFetch;
};

export const okCompletionResponse = (content: string, finishReason = "stop") => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content }, finish_reason: finishReason }],
  }),
});

export const okJsonSchemaResponse = (payload: unknown, finishReason = "stop") =>
  okCompletionResponse(JSON.stringify(payload), finishReason);
