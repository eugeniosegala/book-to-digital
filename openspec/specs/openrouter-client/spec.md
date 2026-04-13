# OpenRouter Client

## Purpose

Wraps all communication with the OpenRouter API. Provides structured LLM completion calls with JSON-schema enforcement, retry logic, and vision (multipart image+text) support.

---

## Requirements

### Requirement: Vision LLM call
The OpenRouter client module SHALL expose a `callVisionOpenRouter` function that accepts a base64-encoded image alongside a system prompt, user text, and JSON schema, and returns a structured response of the requested type.

The function MUST construct a multipart user message containing an `image_url` block (base64 data URI) followed by a `text` block, then delegate to the OpenRouter client's completion logic with the same retry and structured-output guarantees.

#### Scenario: Successful vision call
- **WHEN** `callVisionOpenRouter` is invoked with a valid image, prompts, and schema
- **THEN** the function returns the parsed, schema-validated response without error

#### Scenario: Image encoded as data URI
- **WHEN** `callVisionOpenRouter` builds the request
- **THEN** the user message MUST include an `image_url` block whose `url` is formatted as `data:<mimeType>;base64,<base64>`

#### Scenario: Vision call inherits retry behaviour
- **WHEN** the upstream OpenRouter API returns a retryable error (408/409/429/5xx)
- **THEN** `callVisionOpenRouter` retries with the same backoff policy as `callOpenRouter`
