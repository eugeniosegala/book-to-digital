import { describe, expect, it } from "vitest";
import {
  buildAfterContextPerPage,
  buildBeforeContextPerPage,
  getLeadingContext,
  getTrailingContext,
  getTranslatableEntries,
  splitTranslationChunks,
} from "../../../src/agents/translation/context.js";
import { BlockType } from "../../../src/types.js";
import { makePage } from "../../support/content-factories.js";

describe("translation context helpers", () => {
  it("returns leading and trailing translatable context only", () => {
    const page = makePage(1, [
      { type: BlockType.FIGURE, text: "" },
      { type: BlockType.TEXT, text: "first paragraph" },
      { type: BlockType.FIGURE_CAPTION, text: "caption" },
      { type: BlockType.TEXT, text: "last paragraph" },
    ]);

    expect(getLeadingContext(page)).toEqual(["first paragraph", "caption"]);
    expect(getTrailingContext(page)).toEqual(["caption", "last paragraph"]);
  });

  it("builds before and after context while skipping pages with no translatable text", () => {
    const pages = [
      makePage(1, [{ type: BlockType.TEXT, text: "Kontext von Seite 1" }]),
      makePage(2, [{ type: BlockType.FIGURE, text: "" }]),
      makePage(3, [{ type: BlockType.TEXT, text: "Seite 3 Absatz" }]),
    ];

    expect(buildBeforeContextPerPage(pages)).toEqual([
      [],
      ["Kontext von Seite 1"],
      ["Kontext von Seite 1"],
    ]);
    expect(buildAfterContextPerPage(pages)).toEqual([
      ["Seite 3 Absatz"],
      ["Seite 3 Absatz"],
      [],
    ]);
  });

  it("returns indexed translatable entries and skips empty or non-translatable blocks", () => {
    const page = makePage(1, [
      { type: BlockType.TEXT, text: "eins" },
      { type: BlockType.FIGURE, text: "" },
      { type: BlockType.TEXT, text: "   " },
      { type: BlockType.FIGURE_CAPTION, text: "zwei" },
    ]);

    expect(getTranslatableEntries(page).map(({ idx, block }) => [idx, block.text])).toEqual([
      [0, "eins"],
      [3, "zwei"],
    ]);
  });

  it("splits translatable entries into stable chunks", () => {
    const entries = getTranslatableEntries(
      makePage(1, [
        { type: BlockType.TEXT, text: "one" },
        { type: BlockType.TEXT, text: "two" },
        { type: BlockType.TEXT, text: "three" },
        { type: BlockType.TEXT, text: "four" },
        { type: BlockType.TEXT, text: "five" },
        { type: BlockType.TEXT, text: "six" },
      ]),
    );

    const chunks = splitTranslationChunks(entries, 4);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].texts).toEqual(["one", "two", "three", "four"]);
    expect(chunks[1].entries.map(({ idx }) => idx)).toEqual([4, 5]);
  });
});
