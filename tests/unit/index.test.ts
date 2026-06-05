import { describe, expect, it } from 'vitest';
import * as sdk from '../../src';

describe('public exports', () => {
  it('exports runtime SDK entry points', () => {
    expect(sdk.InstagramClient).toBeTypeOf('function');
    expect(sdk.FileTokenStorage).toBeTypeOf('function');
    expect(sdk.MemoryTokenStorage).toBeTypeOf('function');
    expect(sdk.DatabaseTokenStorage).toBeTypeOf('function');
    expect(sdk.WebhookHandler).toBeTypeOf('function');
    expect(sdk.logger).toBeDefined();
    expect(sdk.LogLevel.DEBUG).toBe(0);
  });

  it('exports all custom error classes', () => {
    expect(new sdk.InstagramError('base').name).toBe('InstagramError');
    expect(new sdk.AuthenticationError('auth').name).toBe('AuthenticationError');
    expect(new sdk.NetworkError('network').name).toBe('NetworkError');
    expect(new sdk.RateLimitError('rate').name).toBe('RateLimitError');
    expect(new sdk.ValidationError('validation').name).toBe('ValidationError');
    expect(new sdk.WebhookVerificationError('webhook').name).toBe('WebhookVerificationError');
    expect(
      new sdk.ApiError({
        message: 'api',
        type: 'OAuthException',
        code: 190,
      }).name
    ).toBe('ApiError');
  });
});
