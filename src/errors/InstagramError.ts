import type { InstagramApiError } from '../types/index';

/**
 * Base error class for all Instagram SDK errors
 */
export class InstagramError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InstagramError';
    Object.setPrototypeOf(this, InstagramError.prototype);
  }
}

/**
 * Authentication and authorization errors
 */
export class AuthenticationError extends InstagramError {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, AuthenticationError.prototype);
  }
}

/**
 * Rate limit exceeded error
 */
export class RateLimitError extends InstagramError {
  constructor(
    message: string,
    public readonly retryAfter?: number
  ) {
    super(message);
    this.name = 'RateLimitError';
    Object.setPrototypeOf(this, RateLimitError.prototype);
  }
}

/**
 * Validation error for invalid parameters
 */
export class ValidationError extends InstagramError {
  constructor(
    message: string,
    public readonly field?: string
  ) {
    super(message);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Instagram API error
 */
export class ApiError extends InstagramError {
  public readonly code: number;
  public readonly type: string;
  public readonly errorSubcode?: number;
  public readonly fbtraceId?: string;

  constructor(apiError: InstagramApiError) {
    super(apiError.message);
    this.name = 'ApiError';
    this.code = apiError.code;
    this.type = apiError.type;
    this.errorSubcode = apiError.errorSubcode;
    this.fbtraceId = apiError.fbtraceId;
    Object.setPrototypeOf(this, ApiError.prototype);
  }

  /**
   * Check if error is due to invalid or expired token
   */
  isTokenError(): boolean {
    return this.code === 190 || this.type === 'OAuthException';
  }

  /**
   * Check if error is due to rate limiting
   */
  isRateLimitError(): boolean {
    return this.code === 4 || this.code === 17 || this.code === 32;
  }

  /**
   * Check if error is due to insufficient permissions
   */
  isPermissionError(): boolean {
    return this.code === 10 || this.code === 200 || this.type === 'OAuthException';
  }
}

/**
 * Webhook verification error
 */
export class WebhookVerificationError extends InstagramError {
  constructor(message: string) {
    super(message);
    this.name = 'WebhookVerificationError';
    Object.setPrototypeOf(this, WebhookVerificationError.prototype);
  }
}

/**
 * Network or connection error
 */
export class NetworkError extends InstagramError {
  constructor(
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message);
    this.name = 'NetworkError';
    Object.setPrototypeOf(this, NetworkError.prototype);
  }
}
