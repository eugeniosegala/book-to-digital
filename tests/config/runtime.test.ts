import { describe, expect, it } from "vitest";
import { resolveRuntimeDependencies } from "../../src/config/runtime.js";

describe("resolveRuntimeDependencies", () => {
  it("returns the OpenRouter key when present", () => {
    expect(
      resolveRuntimeDependencies({
        OPENROUTER_API_KEY: " test-key ",
      } as NodeJS.ProcessEnv),
    ).toEqual({
      openRouterApiKey: "test-key",
    });
  });

  it("throws when the OpenRouter key is missing", () => {
    expect(() =>
      resolveRuntimeDependencies({} as NodeJS.ProcessEnv),
    ).toThrow("OPENROUTER_API_KEY is required");
  });
});
