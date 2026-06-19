import { logger } from "./logger.js";

interface RetryOptions {
  operationName: string;
  retries?: number;
  baseDelayMs?: number;
}

function getStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

function getRetryAfterMs(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;

  const response = (error as { response?: { headers?: Record<string, string | undefined> } }).response;
  const retryAfter = response?.headers?.["retry-after"];
  if (retryAfter && Number.isFinite(Number(retryAfter))) {
    return Number(retryAfter) * 1000;
  }

  const rateLimitReset = response?.headers?.["x-ratelimit-reset"];
  if (rateLimitReset && Number.isFinite(Number(rateLimitReset))) {
    return Math.max(Number(rateLimitReset) * 1000 - Date.now(), 0);
  }

  return undefined;
}

function shouldRetry(error: unknown): boolean {
  const status = getStatus(error);
  return status === 429 || status === 403 || (typeof status === "number" && status >= 500);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withRetry<T>(operation: () => Promise<T>, options: RetryOptions): Promise<T> {
  const retries = options.retries ?? 2;
  const baseDelayMs = options.baseDelayMs ?? 500;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= retries || !shouldRetry(error)) {
        throw error;
      }

      const retryAfterMs = getRetryAfterMs(error);
      const backoffMs = retryAfterMs ?? baseDelayMs * 2 ** attempt;
      logger.warn(`${options.operationName} failed; retrying in ${backoffMs}ms`, error);
      await delay(backoffMs);
    }
  }

  throw new Error(`${options.operationName} failed after retries`);
}
