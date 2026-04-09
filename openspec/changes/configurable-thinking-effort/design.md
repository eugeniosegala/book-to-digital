## Context

All five LLM call sites (`orientation`, `figures`, `page-number`, `reading-order`, `translation`) share identical model parameters through `callOpenRouter`: temperature 0, no token budget, no reasoning controls. The pipeline uses Gemini 3.1 Pro via OpenRouter, which supports thinking budget configuration through provider-specific parameters. Currently, simple classification tasks (page number detection) and complex reasoning tasks (translation with cross-page context) receive the same treatment.

The `CompletionOptions` interface already has an unused `maxTokens` field, establishing precedent for optional per-call parameter overrides. Config is centralized in `src/config/clients.ts` with task-specific thresholds living in their respective config files (e.g., `ORIENTATION_LLM_MIN_CONFIDENCE` in `src/config/image.ts`).

## Goals / Non-Goals

**Goals:**
- Allow each pipeline task to specify a thinking effort level that controls model reasoning depth
- Provide sensible per-task defaults that optimize the cost/quality tradeoff
- Expose a CLI flag for users to override the global effort level
- Keep the implementation model-agnostic so switching providers doesn't require call-site changes

**Non-Goals:**
- Per-page or per-block effort adjustment (effort is per-task-type, not per-invocation)
- Dynamic effort scaling based on content complexity (future work)
- Support for multiple models simultaneously (one model per run)
- Exposing raw token budgets to end users (abstracted behind named levels)

## Decisions

### 1. Named effort levels over raw token budgets

**Decision**: Define a `ThinkingEffort` type as `"none" | "low" | "medium" | "high"` rather than exposing raw thinking token counts.

**Rationale**: Named levels are stable across model changes. If we switch from Gemini to another provider, the mapping changes but call sites don't. Raw budgets would leak model-specific details into every caller.

**Alternatives considered**:
- Raw token numbers: More precise but fragile across model changes and opaque to users.
- Boolean on/off: Too coarse — the gap between "no thinking" and "full thinking" is large.

### 2. Centralized effort-to-budget mapping in config

**Decision**: Store the `ThinkingEffort → number` mapping as a config constant in `src/config/clients.ts`. The mapping translates named levels to provider-specific thinking token budgets.

```
none → 0 (or omitted — disables thinking entirely)
low → 1024
medium → 4096
high → 16384
```

**Rationale**: Single place to tune when the model changes or when empirical testing reveals better budget values. Keeps `callOpenRouter` clean — it just does a lookup.

**Alternatives considered**:
- Per-task custom budgets: Over-engineers the initial implementation. Named levels cover the 80% case; raw `maxTokens` already exists for edge cases.

### 3. Per-task defaults in a dedicated config map

**Decision**: Add a `TASK_THINKING_EFFORT` record in `src/config/clients.ts` mapping task identifiers to default effort levels:

```
page-number    → "low"
orientation    → "low"
figures        → "medium"
reading-order  → "medium"
translation    → "high"
```

**Rationale**: Co-locates all thinking effort config. Task identifiers reuse existing `schemaName` values where possible, keeping the mapping intuitive.

**Alternatives considered**:
- Distribute defaults into each task's own config file: Matches the pattern for `ORIENTATION_LLM_MIN_CONFIDENCE`, but scatters related config across 5+ files making tuning harder.
- No defaults (always require explicit): Breaks the current zero-config experience.

### 4. Extend CompletionOptions with optional thinkingEffort

**Decision**: Add `thinkingEffort?: ThinkingEffort` to `CompletionOptions`. When provided, `callOpenRouter` maps it to the provider-specific request body parameter. When omitted, no thinking parameters are sent (preserving current behavior as the default).

**Rationale**: Optional field means zero changes required for callers that don't care about thinking effort. The `callVisionLLM` wrapper gains a matching optional parameter and passes it through.

### 5. Provider-specific parameter injection in callOpenRouter

**Decision**: `callOpenRouter` translates the effort level to Gemini's thinking budget format via OpenRouter's provider passthrough:

```json
{
  "provider": {
    "google": {
      "thinkingConfig": {
        "thinkingBudget": <mapped-token-count>
      }
    }
  }
}
```

When `thinkingEffort` is `"none"` or the mapped budget is 0, omit the provider block entirely.

**Rationale**: OpenRouter's provider passthrough is the documented way to send model-specific parameters. This keeps the main request body clean and makes switching providers a config-only change (update the mapping function).

**Alternatives considered**:
- Use OpenRouter's generic `reasoning_effort` field: Not all models support it; provider passthrough is more reliable for Gemini specifically.

### 6. CLI flag with global override semantics

**Decision**: Add `--thinking-effort <level>` CLI option (values: `none`, `low`, `medium`, `high`). When set, it overrides all per-task defaults with the given level. Passed through `PipelineConfig` to the pipeline.

**Rationale**: Users who want to minimize cost can set `--thinking-effort none`; users who want maximum quality can set `--thinking-effort high`. Per-task defaults remain the sweet spot for most runs.

**Alternatives considered**:
- Per-task CLI flags (`--orientation-effort low`): Too many flags for a niche need.
- Config file: Adds complexity; CLI flag covers the primary use case.

## Risks / Trade-offs

- **[Budget values are empirical guesses]** → The initial `low=1024 / medium=4096 / high=16384` values are starting points. Mitigated by centralizing them in one config constant — easy to tune after real-world testing.
- **[Provider lock-in in the mapping]** → The Gemini-specific `provider.google.thinkingConfig` format ties the mapping to one provider. Mitigated by isolating the mapping to a single function in `callOpenRouter` — switching providers means changing one code path.
- **[Global CLI override is coarse]** → `--thinking-effort low` sets all tasks to low, even translation which benefits from high effort. Mitigated by this being opt-in; the per-task defaults are the recommended path.
- **[Thinking tokens add cost]** → Higher effort levels increase token usage and API cost. Mitigated by defaulting simple tasks to `low`/`none` and only using `high` for translation.
