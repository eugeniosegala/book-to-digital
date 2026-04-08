# Repository Guidelines

## Project Structure & Module Organization
Core code lives in `src/`. Use `src/cli.ts` as the entry point and `src/pipeline.ts` for the end-to-end flow. Stage-specific logic is grouped under `src/agents/` (`scanner/`, `ocr/`, `vision/`, `document/`, `translation/`). External service wrappers live in `src/clients/`, shared settings in `src/config/`, and shared interfaces in `src/types.ts` plus `src/types/`. Tests mirror the source layout under `tests/`; reusable fixtures and helpers live in `tests/fixtures/` and `tests/support/`. Demo assets for the README are in `assets/`.

## Build, Test, and Development Commands
- `npm test` runs the full Vitest suite once.
- `npm run test:watch` reruns tests during active development.
- `npm run lint` runs `tsc --noEmit` for strict type checking.
- `npm run build` compiles the CLI to `dist/`.
- `npx tsx src/cli.ts <input-folder> -o output/book.docx` runs the pipeline locally.

## Coding Style & Naming Conventions
Write strict TypeScript with ES modules. Match the existing style: 2-space indentation, double quotes, trailing commas where Prettier adds them, and `.js` import suffixes inside `.ts` files. Use `camelCase` for functions and variables, `PascalCase` for types and interfaces, and descriptive filenames such as `page-analyzer.ts` or `layout-parser.test.ts`. Keep modules focused on one pipeline responsibility.

## Testing Guidelines
Vitest is the test runner. Add tests under the mirrored path in `tests/`, for example `src/agents/ocr/layout-parser.ts` maps to `tests/agents/ocr/layout-parser.test.ts`. Prefer focused unit tests with fixtures from `tests/fixtures/` and helpers from `tests/support/`. Run `npm test` before opening a PR; use `npx vitest run tests/agents/ocr/layout-parser.test.ts` for a single file.

## Commit & Pull Request Guidelines
Recent history uses concise Conventional Commit prefixes such as `feat:` and `fix:`. Keep commit subjects imperative and specific, for example `fix: preserve page-number fallback`. PRs should explain the behavior change, list validation commands run, and note any input samples or generated document changes. Include screenshots or output excerpts when document layout or figure handling changes.

## Security & Configuration Tips
Do not commit `.env` or credentials. Copy `.env.example` locally and provide `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, and `OPENROUTER_API_KEY` as needed. Treat debug output under `debug/` as local-only unless it has been reviewed for sensitive content.
