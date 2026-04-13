import { describe, expect, it } from "vitest";
import {
  callOpenRouter,
  callVisionOpenRouter,
} from "../../src/clients/openrouter.js";
import {
  okCompletionResponse,
  setupMockFetch,
} from "../support/openrouter-mocks.js";

const mockFetch = setupMockFetch();

const options = {
  apiKey: "test-key",
  messages: [{ role: "user", content: "translate this" }],
  schemaName: "test_schema",
  schema: {
    type: "object",
    properties: { value: { type: "string" } },
    required: ["value"],
    additionalProperties: false,
  },
};

describe("callOpenRouter", () => {
  it("parses structured JSON responses directly", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    const result = await callOpenRouter<{ value: string }>(options);

    expect(result.data.value).toBe("ok");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("accepts JSON wrapped in markdown code fences", async () => {
    mockFetch.mockResolvedValueOnce(
      okCompletionResponse('```json\n{"value":"wrapped"}\n```'),
    );

    const result = await callOpenRouter<{ value: string }>(options);

    expect(result.data.value).toBe("wrapped");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("fails on malformed JSON instead of repairing the payload", async () => {
    mockFetch.mockResolvedValue(okCompletionResponse('{"value":"broken",}'));

    await expect(callOpenRouter<{ value: string }>(options)).rejects.toThrow(
      "Invalid JSON response from OpenRouter",
    );
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("includes reasoning.effort when thinkingEffort is set", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "high",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("omits reasoning when thinkingEffort is not set", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>(options);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toBeUndefined();
  });

  it("omits reasoning when thinkingEffort is none", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "none",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toBeUndefined();
  });

  it("passes effort level string directly for low", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"value":"ok"}'));

    await callOpenRouter<{ value: string }>({
      ...options,
      thinkingEffort: "low",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "low" });
  });
});

const image = { base64: "abc123", mimeType: "image/jpeg" as const };
const schema = {
  type: "object",
  properties: { label: { type: "string" } },
  required: ["label"],
  additionalProperties: false,
};

describe("callVisionOpenRouter", () => {
  it("sends the image as a base64 data URI in the user message", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"label":"cat"}'));

    await callVisionOpenRouter(
      image,
      "test-key",
      "system prompt",
      "describe this",
      "test",
      schema,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userContent = body.messages[1].content;
    expect(userContent[0]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,abc123" },
    });
  });

  it("includes the text part in the user message", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"label":"dog"}'));

    await callVisionOpenRouter(
      image,
      "test-key",
      "system prompt",
      "what is this?",
      "test",
      schema,
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const userContent = body.messages[1].content;
    expect(userContent[1]).toEqual({ type: "text", text: "what is this?" });
  });

  it("forwards thinkingEffort to the request body", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"label":"bird"}'));

    await callVisionOpenRouter(
      image,
      "test-key",
      "system prompt",
      "describe",
      "test",
      schema,
      "high",
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.reasoning).toEqual({ effort: "high" });
  });

  it("returns the parsed response data", async () => {
    mockFetch.mockResolvedValueOnce(okCompletionResponse('{"label":"fish"}'));

    const result = await callVisionOpenRouter<{ label: string }>(
      image,
      "test-key",
      "system prompt",
      "describe",
      "test",
      schema,
    );

    expect(result).toEqual({ label: "fish" });
  });
});
