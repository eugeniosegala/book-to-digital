import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { translatePages } from "../../../src/agents/translation/translator.js";
import { OPENROUTER_MODEL, OPENROUTER_URL } from "../../../src/config.js";
import { BlockType, type ProcessedPage } from "../../../src/types.js";

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  // Make retry delays instant in tests
  vi.spyOn(global, "setTimeout").mockImplementation((fn: () => void) => {
    fn();
    return 0 as unknown as NodeJS.Timeout;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const okResponse = (translations: string[]) => ({
  ok: true,
  json: async () => ({
    choices: [{ message: { content: JSON.stringify({ translations }) } }],
  }),
});

const makePage = (
  pageNumber: number,
  blocks: { type: BlockType; text: string }[],
): ProcessedPage => ({
  pageNumber,
  filePath: `page${pageNumber}.jpg`,
  contentBlocks: blocks.map((b) => ({
    type: b.type,
    text: b.text,
    confidence: 99,
    boundingBox: { top: 0, left: 0, width: 1, height: 1 },
  })),
  errors: [],
});

const opts = { apiKey: "test-key", targetLanguage: "English" };

describe("translatePages", () => {
  it("translates text blocks across multiple pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["Title EN"]))
      .mockResolvedValueOnce(okResponse(["Para EN"]));

    const pages = [
      makePage(1, [{ type: BlockType.TITLE, text: "Titel DE" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Absatz DE" }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result).toHaveLength(2);
    expect(result[0].contentBlocks[0].text).toBe("Title EN");
    expect(result[1].contentBlocks[0].text).toBe("Para EN");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("includes context from previous page in second call", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["Title EN"]))
      .mockResolvedValueOnce(okResponse(["Para EN"]));

    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Kontext Absatz" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Nächster Absatz" }]),
    ];

    await translatePages(pages, opts);

    // Second call should include before-context from page 1
    const [, opts2] = mockFetch.mock.calls[1];
    const body2 = JSON.parse(opts2.body);
    const userMsg = body2.messages[1].content as string;
    expect(userMsg).toContain("[BEFORE");
    expect(userMsg).toContain("Kontext Absatz");
  });

  it("first page has no context section", async () => {
    mockFetch.mockResolvedValueOnce(okResponse(["Title EN"]));

    const pages = [makePage(1, [{ type: BlockType.TITLE, text: "Titel" }])];

    await translatePages(pages, opts);

    const [, opts1] = mockFetch.mock.calls[0];
    const body1 = JSON.parse(opts1.body);
    const userMsg = body1.messages[1].content as string;
    expect(userMsg).not.toContain("[BEFORE");
  });

  it("skips non-translatable blocks (FIGURE)", async () => {
    const imgBuffer = Buffer.from("fake-image");
    mockFetch.mockResolvedValueOnce(okResponse(["Caption EN"]));

    const pages: ProcessedPage[] = [
      {
        pageNumber: 1,
        filePath: "p1.jpg",
        contentBlocks: [
          {
            type: BlockType.FIGURE,
            text: "",
            confidence: 99,
            boundingBox: { top: 0, left: 0, width: 1, height: 1 },
            imageBuffer: imgBuffer,
            imageDimensions: { width: 800, height: 600 },
          },
          {
            type: BlockType.FIGURE_CAPTION,
            text: "Abb. 1: Beschreibung",
            confidence: 99,
            boundingBox: { top: 0.9, left: 0, width: 1, height: 0.1 },
          },
        ],
        errors: [],
      },
    ];

    const result = await translatePages(pages, opts);

    // FIGURE block untouched
    expect(result[0].contentBlocks[0].imageBuffer).toBe(imgBuffer);
    expect(result[0].contentBlocks[0].text).toBe("");
    // FIGURE_CAPTION translated
    expect(result[0].contentBlocks[1].text).toBe("Caption EN");
    // Only one translatable block sent
    const [, reqOpts] = mockFetch.mock.calls[0];
    const body = JSON.parse(reqOpts.body);
    const userMsg = body.messages[1].content as string;
    expect(userMsg).not.toContain("FIGURE");
    expect(userMsg).toContain("Abb. 1: Beschreibung");
  });

  it("skips pages with no translatable blocks", async () => {
    mockFetch.mockResolvedValueOnce(okResponse(["Text EN"]));

    const pages: ProcessedPage[] = [
      {
        pageNumber: 1,
        filePath: "p1.jpg",
        contentBlocks: [
          {
            type: BlockType.FIGURE,
            text: "",
            confidence: 99,
            boundingBox: { top: 0, left: 0, width: 1, height: 1 },
            imageBuffer: Buffer.from("img"),
          },
        ],
        errors: [],
      },
      makePage(2, [{ type: BlockType.TEXT, text: "Absatz" }]),
    ];

    const result = await translatePages(pages, opts);

    // Only one LLM call (for page 2)
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(result[0].contentBlocks[0].text).toBe("");
    expect(result[1].contentBlocks[0].text).toBe("Text EN");
  });

  it("handles LLM failure gracefully — keeps original text", async () => {
    const errorResponse = {
      ok: false,
      status: 500,
      text: async () => "server error",
    };
    mockFetch
      .mockResolvedValueOnce(okResponse(["Title EN"]))
      // Provide enough error responses for all retry attempts
      .mockResolvedValue(errorResponse);

    const pages = [
      makePage(1, [{ type: BlockType.TITLE, text: "Titel" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Original bleibt" }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("Title EN");
    expect(result[1].contentBlocks[0].text).toBe("Original bleibt");
    expect(result[1].errors).toHaveLength(1);
    expect(result[1].errors[0]).toContain("Translation failed");
  });

  it("handles mismatched translation count — falls back to per-block", async () => {
    // Batch returns wrong count → fallback translates individually
    mockFetch
      .mockResolvedValueOnce(okResponse(["Only one"])) // batch fails (1 instead of 2)
      .mockResolvedValueOnce(okResponse(["Block one EN"])) // fallback block 1
      .mockResolvedValueOnce(okResponse(["Block two EN"])); // fallback block 2

    const pages = [
      makePage(1, [
        { type: BlockType.TEXT, text: "Block eins" },
        { type: BlockType.TEXT, text: "Block zwei" },
      ]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("Block one EN");
    expect(result[0].contentBlocks[1].text).toBe("Block two EN");
    expect(result[0].errors).toHaveLength(0);
    expect(mockFetch).toHaveBeenCalledTimes(3); // 1 batch + 2 individual
  });

  it("retries a block when a source-language span remains in the translation", async () => {
    const sourceText =
      "Die Stadt war damals sehr reich und überaus mächtig in der ganzen Region bekannt.";
    const badTranslation =
      "The city was damals sehr reich und überaus mächtig in the whole region.";
    const goodTranslation =
      "The city was at that time very rich and exceedingly powerful, known throughout the entire region.";

    mockFetch
      .mockResolvedValueOnce(okResponse([badTranslation]))
      .mockResolvedValueOnce(okResponse([goodTranslation]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: sourceText }])];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(goodTranslation);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const [, retryOpts] = mockFetch.mock.calls[1];
    const retryBody = JSON.parse(retryOpts.body);
    expect(retryBody.messages[0].content).toContain(
      "A previous attempt left source-language wording behind",
    );
  });

  it("retries only the block with untranslated text in a multi-block page", async () => {
    const source1 =
      "Der Künstler wurde im Jahre vierzehnhundertsiebzig in der kleinen Stadt geboren.";
    const source2 =
      "Seine Werke sind heute noch in vielen bedeutenden europäischen Museen ausgestellt und bewundert.";
    const good1 =
      "The artist was born in the year fourteen seventy in the small town.";
    const bad2 =
      "His works are heute noch in vielen bedeutenden europäischen Museen exhibited and admired.";
    const good2 =
      "His works are still exhibited and admired in many important European museums today.";

    mockFetch
      .mockResolvedValueOnce(okResponse([good1, bad2])) // batch: block 1 ok, block 2 bad
      .mockResolvedValueOnce(okResponse([good2])); // retry block 2 only

    const pages = [
      makePage(1, [
        { type: BlockType.TEXT, text: source1 },
        { type: BlockType.TEXT, text: source2 },
      ]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(good1);
    expect(result[0].contentBlocks[1].text).toBe(good2);
    expect(mockFetch).toHaveBeenCalledTimes(2); // 1 batch + 1 retry for block 2
  });

  it("retries when untranslated span appears at the start of translation", async () => {
    const source =
      "Die berühmte gotische Kathedrale wurde im dreizehnten Jahrhundert erbaut und später erweitert.";
    const bad =
      "Die berühmte gotische Kathedrale wurde built in the thirteenth century and later expanded.";
    const good =
      "The famous Gothic cathedral was built in the thirteenth century and later expanded.";

    mockFetch
      .mockResolvedValueOnce(okResponse([bad]))
      .mockResolvedValueOnce(okResponse([good]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: source }])];
    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(good);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("retries when untranslated span appears at the end of translation", async () => {
    const source =
      "The monastery was founded by monks who wanderten durch die weiten unbekannten Gebiete des Landes.";
    const bad =
      "The monastery was founded by monks who wanderten durch die weiten unbekannten Gebiete des Landes.";
    const good =
      "The monastery was founded by monks who wandered through the vast unknown territories of the land.";

    mockFetch
      .mockResolvedValueOnce(okResponse([bad]))
      .mockResolvedValueOnce(okResponse([good]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: source }])];
    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(good);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("keeps retry result even if retry still contains untranslated text", async () => {
    const source =
      "Das Kloster wurde von den wandernden Mönchen gegründet die durch das weite unbekannte Land zogen.";
    const bad =
      "The monastery was von den wandernden Mönchen gegründet die durch das weite unbekannte Land founded.";
    const stillBad =
      "The monastery was founded by the wandernden Mönchen who travelled through the vast unknown land.";

    mockFetch
      .mockResolvedValueOnce(okResponse([bad]))
      .mockResolvedValueOnce(okResponse([stillBad]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: source }])];
    const result = await translatePages(pages, opts);

    // Only retries once — keeps whatever the retry returns
    expect(result[0].contentBlocks[0].text).toBe(stillBad);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("does not retry when source text is too short to trigger detection", async () => {
    // "Manuel Teget-Welz" is only 3 words — below the 5-word minimum
    mockFetch.mockResolvedValueOnce(okResponse(["Manuel Teget-Welz"]));

    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Manuel Teget-Welz" }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("Manuel Teget-Welz");
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry
  });

  it("does not retry when source is non-Latin short text", async () => {
    // Cyrillic/mixed garbage from OCR — too few words to trigger detection
    mockFetch.mockResolvedValueOnce(okResponse(["SEW C E E"]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: "СЕШ C E E" }])];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("SEW C E E");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not retry when untranslated span is mostly proper nouns", async () => {
    // All words are capitalised — the capital-majority filter skips these spans
    const source = "Ingeniosus Magister Der Augsburger Bildhauer Gregor Erhart";
    const translation =
      "Ingeniosus Magister Der Augsburger Bildhauer Gregor Erhart";

    mockFetch.mockResolvedValueOnce(okResponse([translation]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: source }])];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(translation);
    expect(mockFetch).toHaveBeenCalledTimes(1); // no retry — all spans are majority-capitalised
  });

  it("does not retry when lowercase words in span are fewer than 3", async () => {
    // 5-word span but only 2 lowercase words — below the threshold
    const source =
      "Kaiser Friedrich der Große regierte Preußen mit eiserner Hand";
    const translation =
      "Kaiser Friedrich der Große ruled Prussia with an iron hand";

    mockFetch.mockResolvedValueOnce(okResponse([translation]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: source }])];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe(translation);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("does not mutate the original pages array", async () => {
    mockFetch.mockResolvedValueOnce(okResponse(["Translated"]));

    const pages = [makePage(1, [{ type: BlockType.TEXT, text: "Original" }])];

    const result = await translatePages(pages, opts);

    result[0].contentBlocks[0].text = "Modified";
    expect(pages[0].contentBlocks[0].text).toBe("Original");
  });

  it("carries context forward past all-figure pages", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["Page 1 EN"]))
      .mockResolvedValueOnce(okResponse(["Page 3 EN"]));

    const pages: ProcessedPage[] = [
      makePage(1, [{ type: BlockType.TEXT, text: "Kontext von Seite 1" }]),
      {
        pageNumber: 2,
        filePath: "p2.jpg",
        contentBlocks: [
          {
            type: BlockType.FIGURE,
            text: "",
            confidence: 99,
            boundingBox: { top: 0, left: 0, width: 1, height: 1 },
            imageBuffer: Buffer.from("img"),
          },
        ],
        errors: [],
      },
      makePage(3, [{ type: BlockType.TEXT, text: "Seite 3 Absatz" }]),
    ];

    await translatePages(pages, opts);

    // Page 3's call should include context from page 1 (page 2 had no text)
    const [, opts3] = mockFetch.mock.calls[1];
    const body3 = JSON.parse(opts3.body);
    const userMsg = body3.messages[1].content as string;
    expect(userMsg).toContain("Kontext von Seite 1");
  });

  it("sends correct model and structured output format", async () => {
    mockFetch.mockResolvedValueOnce(okResponse(["EN"]));

    await translatePages(
      [makePage(1, [{ type: BlockType.TEXT, text: "DE" }])],
      opts,
    );

    const [url, reqOpts] = mockFetch.mock.calls[0];
    expect(url).toBe(OPENROUTER_URL);
    const body = JSON.parse(reqOpts.body);
    expect(body.model).toBe(OPENROUTER_MODEL);
    expect(body.response_format.type).toBe("json_schema");
    expect(body.response_format.json_schema.name).toBe("page_translation");
    expect(body.temperature).toBe(0);
    expect(reqOpts.headers.Authorization).toBe("Bearer test-key");
  });

  it("merges hyphenated words across page boundaries", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["the sculptor"]))
      .mockResolvedValueOnce(okResponse(["sculpture was renowned."]));

    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "der Bild-" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "hauerei war berühmt." }]),
    ];

    const result = await translatePages(pages, opts);

    // Fragment moved from page 1 to page 2 before translation
    // Page 1 should have the fragment removed, page 2 gets the merged word
    expect(result[0].contentBlocks[0].text).toBe("the sculptor");
    expect(result[1].contentBlocks[0].text).toBe("sculpture was renowned.");

    // Verify page 2's LLM call received the merged text
    const [, opts2] = mockFetch.mock.calls[1];
    const body2 = JSON.parse(opts2.body);
    const userMsg = body2.messages[1].content as string;
    expect(userMsg).toContain("Bildhauerei war berühmt.");
  });

  it("handles hyphen at end of multi-word block", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["He lived in the"]))
      .mockResolvedValueOnce(okResponse(["Cistercian monastery courtyard."]));

    const pages = [
      makePage(1, [
        { type: BlockType.TEXT, text: "Er wohnte im Zisterzienser-" },
      ]),
      makePage(2, [{ type: BlockType.TEXT, text: "klosterhof der Stadt." }]),
    ];

    const result = await translatePages(pages, opts);

    // Verify the merge: "Zisterzienser-" fragment removed from page 1
    const [, opts1] = mockFetch.mock.calls[0];
    const body1 = JSON.parse(opts1.body);
    const userMsg1 = body1.messages[1].content as string;
    expect(userMsg1).toContain("Er wohnte im");
    expect(userMsg1).not.toContain("Zisterzienser");

    // Page 2 received merged word
    const [, opts2] = mockFetch.mock.calls[1];
    const body2 = JSON.parse(opts2.body);
    const userMsg2 = body2.messages[1].content as string;
    expect(userMsg2).toContain("Zisterzienserklosterhof der Stadt.");
  });

  it("does not merge when page does not end with hyphen", async () => {
    mockFetch
      .mockResolvedValueOnce(okResponse(["First paragraph."]))
      .mockResolvedValueOnce(okResponse(["Second paragraph."]));

    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Erster Absatz." }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Zweiter Absatz." }]),
    ];

    const result = await translatePages(pages, opts);

    expect(result[0].contentBlocks[0].text).toBe("First paragraph.");
    expect(result[1].contentBlocks[0].text).toBe("Second paragraph.");
  });
});
