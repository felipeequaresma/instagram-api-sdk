import { RateLimitError } from '../errors/InstagramError';
import type { RateLimitConfig } from '../types/index';
import { logger } from './logger';

/**
 * Token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillRate: number; // tokens per millisecond

  constructor(config: RateLimitConfig) {
    this.maxTokens = config.requestsPerHour;
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
    // Refill rate: requestsPerHour tokens over 1 hour (3600000 ms)
    this.refillRate = config.requestsPerHour / 3600000;
  }

  /**
   * Wait until a token is available, then consume it
   */
  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      logger.debug(`Rate limiter: consumed token, ${this.tokens.toFixed(2)} remaining`);
      return;
    }

    // Calculate how long to wait for next token
    const tokensNeeded = 1 - this.tokens;
    const waitTime = Math.ceil(tokensNeeded / this.refillRate);

    logger.warn(`Rate limit reached, waiting ${waitTime}ms for next token`);

    await this.sleep(waitTime);
    this.refill();

    if (this.tokens < 1) {
      throw new RateLimitError('Rate limit exceeded', waitTime);
    }

    this.tokens -= 1;
  }

  /**
   * Refill tokens based on elapsed time
   */
  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const tokensToAdd = elapsed * this.refillRate;

    this.tokens = Math.min(this.maxTokens, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get current token count
   */
  getAvailableTokens(): number {
    this.refill();
    return this.tokens;
  }

  /**
   * Reset the rate limiter
   */
  reset(): void {
    this.tokens = this.maxTokens;
    this.lastRefill = Date.now();
  }
}
