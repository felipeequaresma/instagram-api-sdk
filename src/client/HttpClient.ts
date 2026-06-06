import axios, { type AxiosInstance, type AxiosRequestConfig, type AxiosResponse } from 'axios';
import { ApiError, NetworkError, RateLimitError } from '../errors/InstagramError';
import type { InstagramApiError } from '../types/index';
import { logger } from '../utils/logger';
import { RateLimiter } from '../utils/rateLimit';
import { retry } from '../utils/retry';

export interface HttpClientConfig {
  timeout?: number;
  rateLimiter?: RateLimiter;
  accessToken?: string;
  apiVersion?: string;
}

/**
 * HTTP client for Instagram Graph API with retry logic and error handling
 */
export class HttpClient {
  private readonly client: AxiosInstance;
  private readonly rateLimiter?: RateLimiter;
  private accessToken?: string;
  private readonly apiVersion: string;

  constructor(config: HttpClientConfig = {}) {
    this.rateLimiter = config.rateLimiter;
    this.accessToken = config.accessToken;
    this.apiVersion = config.apiVersion || 'v21.0';

    this.client = axios.create({
      baseURL: `https://graph.instagram.com/${this.apiVersion}`,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set access token for authenticated requests
   */
  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  /**
   * Setup request and response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // Apply rate limiting
        if (this.rateLimiter) {
          await this.rateLimiter.acquire();
        }

        // Inject access token
        if (this.accessToken) {
          config.params = {
            ...(config.params as Record<string, unknown>),
            access_token: this.accessToken,
          };
        }

        logger.debug(`HTTP ${config.method?.toUpperCase()} ${config.url}`, {
          params: config.params as Record<string, unknown>,
        });

        return config;
      },
      (error) => {
        const rejection = error instanceof Error ? error : new Error(String(error));
        logger.error('Request interceptor error', rejection);
        return Promise.reject(rejection);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        logger.debug(`HTTP ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        return Promise.reject(this.transformError(error));
      }
    );
  }

  /**
   * Transform axios error to custom error types
   */
  private transformError(error: unknown): Error {
    if (axios.isAxiosError(error)) {
      // Network error
      if (!error.response) {
        logger.error('Network error', error.message);
        return new NetworkError(error.message, error);
      }

      // API error response
      const response = error.response;
      const responseData = response.data as { error?: InstagramApiError } | undefined;
      const apiError = responseData?.error;

      if (apiError) {
        logger.error('API error', apiError);

        // Rate limit error
        if (apiError.code === 4 || apiError.code === 17 || apiError.code === 32) {
          const retryAfter = parseInt((response.headers['retry-after'] as string) || '60', 10);
          return new RateLimitError(apiError.message, retryAfter);
        }

        return new ApiError(apiError);
      }

      // Generic error
      return new NetworkError(`HTTP ${response.status}: ${response.statusText}`, error);
    }

    // Unknown error
    if (error instanceof Error) {
      return error;
    }

    return new Error('Unknown error occurred');
  }

  /**
   * GET request with retry logic
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return retry(async () => {
      const response = await this.client.get<T>(url, config);
      return response.data;
    });
  }

  /**
   * POST request with retry logic
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    return retry(async () => {
      const response = await this.client.post<T>(url, data, config);
      return response.data;
    });
  }

  /**
   * DELETE request with retry logic
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    return retry(async () => {
      const response = await this.client.delete<T>(url, config);
      return response.data;
    });
  }

  /**
   * Make a raw request without retry
   */
  async request<T>(config: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.client.request<T>(config);
  }
}
