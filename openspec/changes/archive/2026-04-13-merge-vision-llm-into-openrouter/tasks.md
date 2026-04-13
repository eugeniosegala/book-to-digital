## 1. Merge callVisionOpenRouter into openrouter.ts

- [x] 1.1 Add `VisionImageSource` import to `src/clients/openrouter.ts`
- [x] 1.2 Copy `callVisionOpenRouter` function from `src/clients/vision-llm.ts` into `src/clients/openrouter.ts` as a named export

## 2. Remove vision-llm.ts

- [x] 2.1 Delete `src/clients/vision-llm.ts`

## 3. Update callers

- [x] 3.1 Update import in `src/agents/vision/figures.ts` from `vision-llm.js` to `openrouter.js`
- [x] 3.2 Update import in `src/agents/vision/orientation.ts` from `vision-llm.js` to `openrouter.js`
- [x] 3.3 Update import in `src/agents/vision/page-number.ts` from `vision-llm.js` to `openrouter.js`
- [x] 3.4 Update import in `src/agents/vision/reading-order.ts` from `vision-llm.js` to `openrouter.js`

## 4. Tests and docs

- [x] 4.1 Add unit tests in `tests/clients/openrouter.test.ts` for `callVisionOpenRouter`: assert the `image_url` block is formatted as a base64 data URI, the text part is present, and `thinkingEffort` is forwarded to the request body
- [x] 4.2 Update `CLAUDE.md` — replace the `vision-llm.ts` entry under `src/clients/` with a note that `callVisionOpenRouter` is now exported from `openrouter.ts`

## 5. Verify

- [x] 5.1 Run `npm run lint` — confirm zero type errors
- [x] 5.2 Run `npm test` — confirm all tests pass
