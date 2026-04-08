import { describe, expect, it } from "vitest";
import {
  buildSystemPrompt,
  buildUserMessage,
  TRANSLATION_SCHEMA,
} from "../../../src/agents/translation/prompts.js";

describe("translation prompts", () => {
  it("builds a system prompt with resolved language names and strict mode", () => {
    const prompt = buildSystemPrompt("en", 3, { strict: true });

    expect(prompt).toContain("British English");
    expect(prompt).toContain('Return exactly 3 translations in the "translations" array');
    expect(prompt).toContain("A previous attempt left source-language wording behind");
  });

  it("builds a user message with before and after context sections", () => {
    const message = buildUserMessage(
      ["1: text", "2: more text"],
      ["previous page line"],
      ["next page line"],
    );

    expect(message).toContain("[BEFORE");
    expect(message).toContain("B1: previous page line");
    expect(message).toContain("[TRANSLATE");
    expect(message).toContain("1: 1: text");
    expect(message).toContain("[AFTER");
    expect(message).toContain("A1: next page line");
  });

  it("omits empty context sections", () => {
    const message = buildUserMessage(["Only block"], [], []);

    expect(message).not.toContain("[BEFORE");
    expect(message).not.toContain("[AFTER");
    expect(message).toContain("[TRANSLATE");
  });

  it("keeps the translation schema stable", () => {
    expect(TRANSLATION_SCHEMA.required).toEqual(["translations"]);
    expect(TRANSLATION_SCHEMA.additionalProperties).toBe(false);
    expect(TRANSLATION_SCHEMA.properties.translations.type).toBe("array");
  });
});
