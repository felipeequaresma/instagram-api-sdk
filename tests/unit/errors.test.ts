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
});
