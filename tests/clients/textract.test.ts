import { describe, it, expect, vi } from "vitest";

vi.mock("@aws-sdk/client-textract", () => {
  const mockSend = vi.fn().mockResolvedValue({ Blocks: [] });
  const MockTextractClient = vi
    .fn()
    .mockImplementation(() => ({ send: mockSend }));
  const AnalyzeDocumentCommand = vi
    .fn()
    .mockImplementation((input: unknown) => input);
  return {
    TextractClient: MockTextractClient,
    AnalyzeDocumentCommand,
    mockSend,
  };
});

import { analyzePageImage } from "../../src/clients/textract.js";
import { AnalyzeDocumentCommand } from "@aws-sdk/client-textract";

describe("analyzePageImage", () => {
  it("sends image bytes with LAYOUT feature", async () => {
    const buffer = Buffer.from("fake-image-data");
    await analyzePageImage(buffer, "eu-central-1");

    expect(AnalyzeDocumentCommand).toHaveBeenCalledWith({
      Document: { Bytes: buffer },
      FeatureTypes: ["LAYOUT"],
    });
  });

  it("returns the Textract response", async () => {
    const buffer = Buffer.from("fake-image-data");
    const result = await analyzePageImage(buffer, "eu-central-1");
    expect(result).toHaveProperty("Blocks");
  });
});
