import { describe, expect, it } from 'vitest';
import {
    ApiError,
    AuthenticationError,
    InstagramError,
    RateLimitError,
    ValidationError
} from '../../src/errors/InstagramError';

describe('Error Classes', () => {
  it('should create InstagramError', () => {
    const error = new InstagramError('Test error');
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Test error');
    expect(error.name).toBe('InstagramError');
  });

  it('should create AuthenticationError', () => {
    const error = new AuthenticationError('Auth failed');
    expect(error).toBeInstanceOf(InstagramError);
    expect(error.name).toBe('AuthenticationError');
  });

  it('should create RateLimitError with retry time', () => {
    const error = new RateLimitError('Rate limit exceeded', 60);
    expect(error).toBeInstanceOf(InstagramError);
    expect(error.retryAfter).toBe(60);
  });

  it('should create ValidationError with field', () => {
    const error = new ValidationError('Invalid field', 'email');
    expect(error).toBeInstanceOf(InstagramError);
    expect(error.field).toBe('email');
  });

  it('should create ApiError from API response', () => {
    const apiError = {
      message: 'Invalid token',
      type: 'OAuthException',
      code: 190,
      fbtraceId: 'trace123',
    };
    
    const error = new ApiError(apiError);
    expect(error).toBeInstanceOf(InstagramError);
    expect(error.code).toBe(190);
    expect(error.type).toBe('OAuthException');
    expect(error.isTokenError()).toBe(true);
  });

  it('should detect rate limit errors', () => {
    const error = new ApiError({
      message: 'Rate limit',
      type: 'RateLimitError',
      code: 4,
    });
    
    expect(error.isRateLimitError()).toBe(true);
  });

  it('should detect token, rate limit, and permission variants', () => {
    expect(
      new ApiError({
        message: 'OAuth token issue',
        type: 'OAuthException',
        code: 999,
      }).isTokenError()
    ).toBe(true);

    expect(
      new ApiError({
        message: 'Not token related',
        type: 'GraphMethodException',
        code: 999,
      }).isTokenError()
    ).toBe(false);

    expect(new ApiError({ message: 'Rate limit', type: 'RateLimitError', code: 17 }).isRateLimitError()).toBe(
      true
    );
    expect(new ApiError({ message: 'Rate limit', type: 'RateLimitError', code: 32 }).isRateLimitError()).toBe(
      true
    );
    expect(new ApiError({ message: 'Not rate limit', type: 'ApiError', code: 999 }).isRateLimitError()).toBe(
      false
    );

    expect(new ApiError({ message: 'Permission', type: 'ApiError', code: 10 }).isPermissionError()).toBe(true);
    expect(new ApiError({ message: 'Permission', type: 'ApiError', code: 200 }).isPermissionError()).toBe(true);
    expect(
      new ApiError({ message: 'Permission', type: 'OAuthException', code: 999 }).isPermissionError()
    ).toBe(true);
    expect(new ApiError({ message: 'No permission issue', type: 'ApiError', code: 999 }).isPermissionError()).toBe(
      false
    );
  });
});
