import { afterEach, describe, expect, it, vi } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimit';
import { RateLimitError } from '../../src/errors/InstagramError';

describe('RateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('should allow requests within rate limit', async () => {
    const limiter = new RateLimiter({ requestsPerHour: 100 });
    
    // Should not throw
    await limiter.acquire();
    await limiter.acquire();
    
    expect(limiter.getAvailableTokens()).toBeLessThan(100);
  });

  it('should track available tokens', () => {
    const limiter = new RateLimiter({ requestsPerHour: 100 });
    
    const initial = limiter.getAvailableTokens();
    expect(initial).toBe(100);
  });

  it('should reset tokens', async () => {
    const limiter = new RateLimiter({ requestsPerHour: 100 });
    
    await limiter.acquire();
    expect(limiter.getAvailableTokens()).toBeLessThan(100);
    
    limiter.reset();
    expect(limiter.getAvailableTokens()).toBe(100);
  });

  it('should wait for a token when the bucket is empty', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const limiter = new RateLimiter({ requestsPerHour: 1 });
    const internals = limiter as unknown as {
      refillRate: number;
    };

    await limiter.acquire();
    internals.refillRate = 1;

    const pendingAcquire = limiter.acquire();
    await vi.advanceTimersByTimeAsync(1);

    await expect(pendingAcquire).resolves.toBeUndefined();
  });

  it('should throw when the bucket is still empty after waiting', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);

    const limiter = new RateLimiter({ requestsPerHour: 3_600_000 });
    const internals = limiter as unknown as {
      tokens: number;
      refillRate: number;
      sleep: (ms: number) => Promise<void>;
    };
    internals.tokens = 0;
    internals.refillRate = 1;
    vi.spyOn(internals, 'sleep').mockResolvedValue(undefined);

    await expect(limiter.acquire()).rejects.toBeInstanceOf(RateLimitError);
  });
});
