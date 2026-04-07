# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

book-to-digital converts photos of physical books into clean, structured, fully translated digital Word documents — preserving layout, images, and meaning. Takes a folder of page photos, runs OCR + vision LLM analysis in parallel, and outputs formatted `.docx` files with optional translation.

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
- **Tests**: Vitest with globals enabled (no imports needed for `describe`/`it`/`expect`)
- **External services**: AWS Textract (OCR), OpenRouter → Gemini 3.1 Pro (vision + translation)
- **Key libraries**: `sharp` (images), `docx` (Word generation), `commander` (CLI), `p-limit` (concurrency)

## Architecture

The pipeline processes book photos through a linear flow: **scan → OCR + vision → parse → build document → (optional) translate**.

### Core flow (`src/pipeline.ts`)

`processBook()` orchestrates the full pipeline:
1. `scanForImages()` finds and sorts page photos in the input directory
2. Pages are processed in parallel (bounded by `--concurrency`):
   - `readImage()` loads and auto-rotates via EXIF
   - **AWS Textract** and **Vision LLM** run in parallel per page
   - `parseLayoutBlocks()` merges OCR + vision results, crops figures, fixes column-split text
3. `writeDocument()` assembles all pages into a formatted `.docx`
4. If `--translate` is set, `translatePages()` produces a second `.docx` with context-aware translation

### Module organization

- **`src/agents/`** — Pipeline stages, each with a single responsibility:
  - `scanner/` — Find and sort image files
  - `ocr/` — Parse Textract response into `ContentBlock[]`, merge multi-column text
  - `vision/` — LLM-based figure detection + page number detection (orchestrated by `page-analyzer.ts`)
  - `document/` — Map content blocks to docx elements and write the final file
  - `translation/` — Page-by-page LLM translation with cross-page context overlap
- **`src/clients/`** — External service wrappers (Textract, OpenRouter, vision LLM message formatting)
- **`src/utils/`** — Shared helpers (image I/O, concurrency, logging, error conversion)
- **`src/types.ts`** — All shared interfaces (`ContentBlock`, `ProcessedPage`, `PipelineConfig`, etc.)

### Key design decisions

- **Graceful degradation**: Vision LLM is optional. If the OpenRouter API key is missing or calls fail, the pipeline falls back to Textract-only results.
- **Structured LLM output**: Vision and translation calls use JSON schemas to enforce response structure.
- **Column merging**: `parseLayoutBlocks()` detects and repairs text split across columns (hyphenated words, mid-sentence breaks).
- **Translation context**: The translator passes trailing blocks from previous pages as read-only context so the LLM maintains continuity across page boundaries.
- **Error resilience**: Individual page failures are logged and shown as placeholders in the output — they don't stop the pipeline.

## Environment Variables

Defined in `.env` (see `.env.example`):
- `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_REGION` — AWS credentials (or use `~/.aws/credentials`)
- `OPENROUTER_API_KEY` — Enables vision LLM features and translation
