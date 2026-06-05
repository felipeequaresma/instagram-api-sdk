import type { RetryOptions } from '../types/index';
import { logger } from './logger';

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  maxDelay: 10000,
  backoffMultiplier: 2,
};

/**
 * Retry a function with exponential backoff
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: unknown;
  let delay = opts.initialDelay;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Check if error is retryable
      if (!isRetryableError(error)) {
        throw error;
      }

      logger.debug(`Retry attempt ${attempt + 1}/${opts.maxRetries} after ${delay}ms`, error);

      // Wait before retrying
      await sleep(delay);

      // Increase delay for next attempt (exponential backoff)
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is retryable
 */
function isRetryableError(error: unknown): boolean {
  // Network errors are retryable
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('econnreset') ||
      message.includes('enotfound') ||
      message.includes('econnrefused')
    ) {
      return true;
    }
  }

  // HTTP 5xx errors are retryable
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = error.response as { status?: number };
    if (response.status && response.status >= 500 && response.status < 600) {
      return true;
    }
  }

  return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
