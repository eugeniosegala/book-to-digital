import {
  OPENROUTER_URL,
  OPENROUTER_MODEL,
  OPENROUTER_MAX_RETRIES,
  OPENROUTER_RETRY_DELAYS,
} from "../config.js";
import * as log from "../utils/logger.js";

interface ChatMessage {
  role: string;
  content: string | Array<Record<string, unknown>>;
}

export interface CompletionOptions {
  apiKey: string;
  messages: ChatMessage[];
  schemaName: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}

export interface CompletionResult<T> {
  data: T;
  finishReason?: string;
}

class OpenRouterHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const sanitizeJson = (text: string): string =>
  text
    .replace(/\/\/[^\n]*/g, "") // single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, "") // multi-line comments
    .replace(/(\d)\s*\n\s*(\d)/g, "$1,\n$2") // missing commas between numbers
    .replace(/,\s*([\]}])/g, "$1"); // trailing commas

export const callOpenRouter = async <T>(
  options: CompletionOptions,
): Promise<CompletionResult<T>> => {
  let lastError: Error | undefined;
  const isRetryableStatus = (status: number) =>
    status === 408 || status === 409 || status === 429 || status >= 500;

  for (let attempt = 0; attempt <= OPENROUTER_MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      await sleep(OPENROUTER_RETRY_DELAYS[attempt - 1]);
    }

    try {
      const response = await fetch(OPENROUTER_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: OPENROUTER_MODEL,
          messages: options.messages,
          response_format: {
            type: "json_schema",
            json_schema: {
              name: options.schemaName,
              strict: true,
              schema: options.schema,
            },
          },
          temperature: 0,
          ...(options.maxTokens && { max_tokens: options.maxTokens }),
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        const short = body
          .replace(/<[^>]*>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
        throw new OpenRouterHttpError(
          `${options.schemaName}: OpenRouter ${response.status}: ${short}`,
          response.status,
        );
      }

      const json = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };

      const choice = json.choices?.[0];
      const content = choice?.message?.content;
      if (!content) {
        throw new Error("Empty response from OpenRouter");
      }

      return {
        data: JSON.parse(sanitizeJson(content)) as T,
        finishReason: choice?.finish_reason,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      const status =
        err instanceof OpenRouterHttpError ? err.status : undefined;
      const shouldRetry = status === undefined || isRetryableStatus(status);
      if (attempt < OPENROUTER_MAX_RETRIES && shouldRetry) {
        const delay = OPENROUTER_RETRY_DELAYS[attempt] / 1000;
        log.warn(
          `OpenRouter retry ${attempt + 1}/${OPENROUTER_MAX_RETRIES + 1} in ${delay}s: ${lastError.message}`,
        );
      } else if (
        attempt < OPENROUTER_MAX_RETRIES &&
        status !== undefined &&
        !shouldRetry
      ) {
        break;
      }
    }
  }

  throw lastError!;
};
