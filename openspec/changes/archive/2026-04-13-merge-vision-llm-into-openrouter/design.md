## Context

`src/clients/` has two files that together form the OpenRouter client surface:

- `openrouter.ts` — generic JSON-schema-enforced LLM call with retries
- `vision-llm.ts` — thin wrapper that prepends a base64 image to the user message, then calls `callOpenRouter`

`vision-llm.ts` is 37 lines of which ~20 are the function signature and imports. It owns no logic beyond message formatting. Four vision agents (`figures`, `orientation`, `page-number`, `reading-order`) each import it.

## Goals / Non-Goals

**Goals:**
- Consolidate `callVisionOpenRouter` into `openrouter.ts` so the client module is self-contained
- Remove `vision-llm.ts` entirely
- Zero behaviour change — callers only update their import path

**Non-Goals:**
- Changing the public signature or behaviour of `callVisionOpenRouter` or `callOpenRouter`
- Refactoring the vision agents themselves

## Decisions

### openrouter.ts becomes the provider facade via OpenRouterClient

After this change `openrouter.ts` is the single entry point for all OpenRouter API calls. The implementation is structured as an `OpenRouterClient` class:

- `constructor(apiKey: string)` — holds the API key as private state
- `complete<T>(options)` — text/JSON completion with retry loop and structured-output parsing
- `completeVision<T>(image, ...)` — multimodal completion; builds the multipart message and delegates to `complete`
- Private static helpers (`isRetryableStatus`, `buildReasoning`, `parseStructuredContent`, `unwrapStructuredContent`) encapsulate internal logic

The module-level `callOpenRouter` and `callVisionOpenRouter` are thin backward-compatible wrappers that instantiate `OpenRouterClient` per call. Callers swap `"../clients/vision-llm.js"` for `"../clients/openrouter.js"` — one-line change per file. No caller changes otherwise required.

**Alternative considered**: export from a barrel (`src/clients/index.ts`). Rejected — the project has no client barrel and adding one is out of scope.

**Alternative considered**: rename `vision-llm.ts` → `openrouter-vision.ts` to keep a layer boundary. Rejected — `callVisionOpenRouter` is 17 lines of message formatting with no independent logic; a dedicated file for it is not worth the navigation overhead.

### No new abstraction

The image-formatting logic is trivial; introducing a `buildVisionMessages` helper or similar would be speculative complexity.

## Risks / Trade-offs

- **[Risk]** A future caller imports from the old path → **Mitigation**: `vision-llm.ts` is deleted (not kept as a re-export), so the compiler will catch stale imports immediately.
- **[Trade-off]** `openrouter.ts` now imports `VisionImageSource` from `types/image.ts` in addition to its existing `ThinkingEffort` import — minor increase in file dependencies, acceptable.

## Migration Plan

1. Copy `callVisionOpenRouter` into `openrouter.ts`; add `VisionImageSource` import
2. Delete `src/clients/vision-llm.ts`
3. Update imports in the four vision agents
4. Run `npm run lint` and `npm test` to confirm no regressions
