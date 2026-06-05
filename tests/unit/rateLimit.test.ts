import { describe, expect, it } from 'vitest';
import { RateLimiter } from '../../src/utils/rateLimit';

describe('RateLimiter', () => {
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
});
