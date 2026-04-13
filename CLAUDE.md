# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Cartopia converts photos of physical books into clean, structured, fully translated digital Word documents — preserving layout, images, and meaning. Takes a folder of page photos, runs OCR + vision LLM analysis in parallel, and outputs formatted `.docx` files with optional translation.

## Commands

```bash
npm test              # Run all tests (vitest run)
npm run test:watch    # Watch mode
npx vitest run tests/agents/ocr/layout-parser.test.ts   # Run a single test file
npm run lint          # Type check only (tsc --noEmit)
npm run build         # Compile to dist/
npx tsx src/cli.ts <input-folder> [options]              # Run the CLI
```

## Tech Stack

- **Runtime**: Node.js 24+ (Volta-managed), ES modules (`"type": "module"`)
- **Language**: TypeScript (strict mode, ES2024 target, NodeNext modules)
- **Tests**: Vitest with globals enabled (no imports needed for `describe`/`it`/`expect`), 10s timeout
- **External services**: AWS Textract (OCR), OpenRouter → Gemini 3.1 Pro (vision + translation)
- **Key libraries**: `sharp` (images), `docx` (Word generation), `commander` (CLI), `p-limit` (concurrency)

## Architecture

The pipeline processes book photos through a linear flow: **scan → OCR + vision → parse → reorder → build document → (optional) translate**.

### Core flow (`src/pipeline.ts`)

`processBook()` orchestrates the full pipeline:

1. `scanForImages()` finds and sorts page photos in the input directory
2. Pages are processed in parallel (bounded by `--concurrency`, default 5):
   - `readImage()` loads and auto-rotates via EXIF
   - `normalizePageOrientation()` uses LLM to detect/correct rotation
   - **AWS Textract** and **Vision LLM** (`analyzePageVision`) run in parallel per page
   - `parseLayoutBlocks()` merges OCR + vision results, crops figures, attaches captions
   - `reorderBlocks()` uses LLM to fix reading order on multi-column/complex pages
3. `writeDocument()` assembles all pages into a formatted `.docx`
4. If `--translate` is set, `translatePages()` produces a second `.docx` with context-aware translation

### Module organization

- **`src/agents/`** — Pipeline stages, each with a single responsibility:
  - `scanner/` — Find and sort image files
  - `ocr/` — Parse Textract response into `ContentBlock[]`, merge with vision results
  - `vision/` — LLM-based analysis orchestrated by `page-analyzer.ts`:
    - `orientation.ts` — Rotation detection/correction (portrait only, ≥0.9 confidence)
    - `figures.ts` — Figure detection with bounding boxes, captions, type classification; retries on degenerate boxes
    - `page-number.ts` — Printed page number extraction (distinguishes from chapter numbers, annotations)
    - `reading-order.ts` — LLM-based block reordering for multi-column layouts; falls back to original order
    - `reading-order-postprocess.ts` — Caption snapping, duplicate removal (Dice ≥0.7), text continuation merging
  - `document/` — Map content blocks to docx elements and write the final file
  - `translation/` — Page-by-page LLM translation with:
    - `context.ts` — Before/after context from neighboring pages (2 blocks each direction)
    - `prompts.ts` — System/user prompts with `[BEFORE]`/`[TRANSLATE]`/`[AFTER]` message structure
    - `detector.ts` — Detects untranslated source spans (≥3 words, ≥20 chars) to trigger retries
    - `hyphenation.ts` — Repairs cross-page hyphen splits before translation
    - `clone.ts` — Deep-copies pages so originals are preserved
    - `translator.ts` — Orchestrates batch translation (size 5) with retry: batch → per-block → fail
- **`src/clients/`** — External service wrappers:
  - `openrouter.ts` — Provider facade for all OpenRouter calls: `callOpenRouter` (text completions) and `callVisionOpenRouter` (multimodal image+text). JSON-schema-enforced, retries on 408/409/429/5xx with exponential backoff (1s→2s→4s, max 3)
  - `textract.ts` — AWS Textract with LAYOUT feature, client pooled by region
- **`src/config/`** — Constants split by concern (block-rules, clients, document styling, image params, languages, pipeline defaults, reading-order heuristics, runtime env). Barrel-exported via `src/config.ts`.
- **`src/types/`** — Interfaces split by domain (content, image, pipeline, vision). Barrel-exported via `src/types.ts`.
- **`src/utils/`** — Shared helpers (image I/O, bounding-box math, concurrency, logging, error conversion)

### Key design decisions

- **Graceful degradation**: Vision LLM is optional. If the OpenRouter API key is missing or calls fail, the pipeline falls back to Textract-only results. Reading order correction and orientation detection also degrade gracefully.
- **Structured LLM output**: All LLM calls enforce JSON schemas via OpenRouter's `json_schema` response format with temperature 0.
- **Column merging**: Reading-order postprocessing detects and merges text split across columns using heuristics (gap, overlap, case, punctuation, vocabulary scoring).
- **Translation context**: The translator passes trailing blocks from previous pages and leading blocks from next pages as read-only context so the LLM maintains continuity across page boundaries.
- **Error resilience**: Individual page failures are logged and shown as placeholders in the output — they don't stop the pipeline.

### Test conventions

- Test factories in `tests/support/content-factories.ts` (`makeBlock()`, `makePage()`) — always use these for test data
- OpenRouter/fetch mocking via `tests/support/openrouter-mocks.ts` (`setupMockFetch()`)
- Tests verify LLM message structure (system prompt content, user message format) not just outputs

## Environment Variables

Defined in `.env` (see `.env.example`):

- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` — AWS credentials (or use `~/.aws/credentials`)
- `OPENROUTER_API_KEY` — Enables vision LLM features and translation
