import { describe, expect, it } from "vitest";
import { hasSuspiciousUntranslatedSpan } from "../../../src/agents/translation/detector.js";

describe("hasSuspiciousUntranslatedSpan", () => {
  it("detects untranslated source wording left in a translation", () => {
    const source =
      "Die Stadt war damals sehr reich und überaus mächtig in der ganzen Region bekannt.";
    const translation =
      "The city was damals sehr reich und überaus mächtig in the whole region.";

    expect(hasSuspiciousUntranslatedSpan(source, translation)).toBe(true);
  });

  it("detects untranslated spans at the start of a translation", () => {
    const source =
      "Die berühmte gotische Kathedrale wurde im dreizehnten Jahrhundert erbaut und später erweitert.";
    const translation =
      "Die berühmte gotische Kathedrale wurde built in the thirteenth century and later expanded.";

    expect(hasSuspiciousUntranslatedSpan(source, translation)).toBe(true);
  });

  it("detects untranslated spans at the end of a translation", () => {
    const source =
      "The monastery was founded by monks who wanderten durch die weiten unbekannten Gebiete des Landes.";
    const translation =
      "The monastery was founded by monks who wanderten durch die weiten unbekannten Gebiete des Landes.";

    expect(hasSuspiciousUntranslatedSpan(source, translation)).toBe(true);
  });

  it("ignores short source text", () => {
    expect(
      hasSuspiciousUntranslatedSpan("Manuel Teget-Welz", "Manuel Teget-Welz"),
    ).toBe(false);
  });

  it("ignores spans that are mostly proper nouns", () => {
    const source = "Ingeniosus Magister Der Augsburger Bildhauer Gregor Erhart";
    const translation =
      "Ingeniosus Magister Der Augsburger Bildhauer Gregor Erhart";

    expect(hasSuspiciousUntranslatedSpan(source, translation)).toBe(false);
  });

  it("ignores spans with too few lowercase words", () => {
    const source =
      "Kaiser Friedrich der Große regierte Preußen mit eiserner Hand";
    const translation =
      "Kaiser Friedrich der Große ruled Prussia with an iron hand";

    expect(hasSuspiciousUntranslatedSpan(source, translation)).toBe(false);
  });
});
