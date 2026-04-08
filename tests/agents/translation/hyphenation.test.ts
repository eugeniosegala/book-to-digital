import { describe, expect, it } from "vitest";
import { mergeCrossPageHyphens } from "../../../src/agents/translation/hyphenation.js";
import { BlockType } from "../../../src/types.js";
import { makePage } from "../../support/content-factories.js";

describe("mergeCrossPageHyphens", () => {
  it("merges hyphenated words across page boundaries", () => {
    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "der Bild-" }]),
      makePage(2, [{ type: BlockType.TEXT, text: "hauerei war berühmt." }]),
    ];

    mergeCrossPageHyphens(pages);

    expect(pages[0].contentBlocks[0].text).toBe("der");
    expect(pages[1].contentBlocks[0].text).toBe("Bildhauerei war berühmt.");
  });

  it("handles a hyphen at the end of a multi-word block", () => {
    const pages = [
      makePage(1, [
        { type: BlockType.TEXT, text: "Er wohnte im Zisterzienser-" },
      ]),
      makePage(2, [{ type: BlockType.TEXT, text: "klosterhof der Stadt." }]),
    ];

    mergeCrossPageHyphens(pages);

    expect(pages[0].contentBlocks[0].text).toBe("Er wohnte im");
    expect(pages[1].contentBlocks[0].text).toBe(
      "Zisterzienserklosterhof der Stadt.",
    );
  });

  it("does not merge when the previous page does not end with a hyphen", () => {
    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Erster Absatz." }]),
      makePage(2, [{ type: BlockType.TEXT, text: "Zweiter Absatz." }]),
    ];

    mergeCrossPageHyphens(pages);

    expect(pages[0].contentBlocks[0].text).toBe("Erster Absatz.");
    expect(pages[1].contentBlocks[0].text).toBe("Zweiter Absatz.");
  });

  it("does not merge into a page with no translatable text", () => {
    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "der Bild-" }]),
      makePage(2, [{ type: BlockType.FIGURE, text: "" }]),
    ];

    mergeCrossPageHyphens(pages);

    expect(pages[0].contentBlocks[0].text).toBe("der Bild-");
    expect(pages[1].contentBlocks[0].text).toBe("");
  });
});
