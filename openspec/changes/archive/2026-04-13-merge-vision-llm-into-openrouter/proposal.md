## Why

`vision-llm.ts` is a 37-line file that does nothing but format a multipart image+text message and delegate to `callOpenRouter`. The abstraction adds indirection without earning its own module.

## What Changes

- Move `callVisionOpenRouter` into `openrouter.ts` as a named export alongside `callOpenRouter`
- Delete `src/clients/vision-llm.ts`
- Update the four vision agents that import from `vision-llm.ts` to import from `openrouter.ts` instead

## Capabilities

### New Capabilities

_(none)_

### Modified Capabilities

- `openrouter-client`: `callVisionOpenRouter` becomes part of the OpenRouter client module; no behavioural change, only file consolidation

## Impact

- **Removed**: `src/clients/vision-llm.ts`
- **Modified**: `src/clients/openrouter.ts` — gains `callVisionOpenRouter` export
- **Modified imports** (callers updated, no logic change):
  - `src/agents/vision/figures.ts`
  - `src/agents/vision/orientation.ts`
  - `src/agents/vision/page-number.ts`
  - `src/agents/vision/reading-order.ts`
- **Tests**: any test that imports or mocks `vision-llm.ts` must be redirected to `openrouter.ts`
