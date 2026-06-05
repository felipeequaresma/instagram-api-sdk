import { describe, expect, it, vi } from 'vitest';
import { retry } from '../../src/utils/retry';

describe('retry', () => {
  it('returns the first successful result without retrying', async () => {
    const fn = vi.fn().mockResolvedValue('ok');

    await expect(retry(fn, { maxRetries: 3, initialDelay: 1 })).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries retryable network errors with exponential backoff', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValue('ok');

    await expect(
      retry(fn, {
        maxRetries: 3,
        initialDelay: 1,
        maxDelay: 2,
        backoffMultiplier: 2,
      })
    ).resolves.toBe('ok');

    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('retries HTTP 5xx response errors', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValue('recovered');

    await expect(
      retry(fn, {
        maxRetries: 1,
        initialDelay: 1,
        maxDelay: 1,
        backoffMultiplier: 2,
      })
    ).resolves.toBe('recovered');

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not retry non-retryable errors', async () => {
    const error = new Error('validation failed');
    const fn = vi.fn().mockRejectedValue(error);

    await expect(retry(fn, { maxRetries: 3, initialDelay: 1 })).rejects.toBe(error);

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('does not retry non-5xx HTTP response errors', async () => {
    const clientError = { response: { status: 400 } };
    const missingStatus = { response: {} };
    const fn = vi.fn().mockRejectedValueOnce(clientError).mockRejectedValueOnce(missingStatus);

    await expect(retry(fn, { maxRetries: 3, initialDelay: 1 })).rejects.toBe(clientError);
    await expect(retry(fn, { maxRetries: 3, initialDelay: 1 })).rejects.toBe(missingStatus);

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('throws the last retryable error after max retries', async () => {
    const firstError = new Error('network error one');
    const secondError = new Error('network error two');
    const fn = vi.fn().mockRejectedValueOnce(firstError).mockRejectedValueOnce(secondError);

    await expect(
      retry(fn, {
        maxRetries: 1,
        initialDelay: 1,
        maxDelay: 1,
        backoffMultiplier: 2,
      })
    ).rejects.toBe(secondError);

    expect(fn).toHaveBeenCalledTimes(2);
  });
});
