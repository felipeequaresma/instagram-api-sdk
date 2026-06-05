import axios from 'axios';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HttpClient } from '../../src/client/HttpClient';
import { ApiError, NetworkError, RateLimitError } from '../../src/errors/InstagramError';

vi.mock('axios', () => ({
  default: {
    create: vi.fn(),
    isAxiosError: vi.fn(),
  },
}));

type InterceptorHandler = (value: Record<string, unknown>) => unknown;
type InterceptorErrorHandler = (error: unknown) => unknown;

describe('HttpClient', () => {
  let requestFulfilled: InterceptorHandler;
  let requestRejected: InterceptorErrorHandler;
  let responseFulfilled: InterceptorHandler;
  let responseRejected: InterceptorErrorHandler;
  let axiosInstance: {
    get: ReturnType<typeof vi.fn>;
    post: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    request: ReturnType<typeof vi.fn>;
    interceptors: {
      request: { use: ReturnType<typeof vi.fn> };
      response: { use: ReturnType<typeof vi.fn> };
    };
  };

  beforeEach(() => {
    axiosInstance = {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
      request: vi.fn(),
      interceptors: {
        request: {
          use: vi.fn((onFulfilled: InterceptorHandler, onRejected: InterceptorErrorHandler) => {
            requestFulfilled = onFulfilled;
            requestRejected = onRejected;
          }),
        },
        response: {
          use: vi.fn((onFulfilled: InterceptorHandler, onRejected: InterceptorErrorHandler) => {
            responseFulfilled = onFulfilled;
            responseRejected = onRejected;
          }),
        },
      },
    };

    vi.mocked(axios.create).mockReturnValue(axiosInstance as never);
    vi.mocked(axios.isAxiosError).mockReturnValue(false);
  });

  it('configures axios with the requested API version and timeout', () => {
    new HttpClient({ apiVersion: 'v22.0', timeout: 1234 });

    expect(axios.create).toHaveBeenCalledWith({
      baseURL: 'https://graph.instagram.com/v22.0',
      timeout: 1234,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });

  it('injects access tokens and waits for rate limiting in requests', async () => {
    const rateLimiter = { acquire: vi.fn().mockResolvedValue(undefined) };
    const client = new HttpClient({ rateLimiter: rateLimiter as never, accessToken: 'token-1' });

    client.setAccessToken('token-2');

    const config = await requestFulfilled({
      method: 'get',
      url: '/me',
      params: { fields: 'id' },
    });

    expect(rateLimiter.acquire).toHaveBeenCalled();
    expect(config).toMatchObject({
      params: {
        fields: 'id',
        access_token: 'token-2',
      },
    });
  });

  it('leaves requests unchanged when no rate limiter or access token is configured', async () => {
    new HttpClient();

    const config = await requestFulfilled({
      method: 'get',
      url: '/me',
    });

    expect(config).toEqual({
      method: 'get',
      url: '/me',
    });
  });

  it('returns response data for convenience HTTP methods', async () => {
    const client = new HttpClient();
    axiosInstance.get.mockResolvedValue({ data: { ok: 'get' } });
    axiosInstance.post.mockResolvedValue({ data: { ok: 'post' } });
    axiosInstance.delete.mockResolvedValue({ data: { ok: 'delete' } });

    await expect(client.get('/resource', { params: { limit: 1 } })).resolves.toEqual({ ok: 'get' });
    await expect(client.post('/resource', { value: true })).resolves.toEqual({ ok: 'post' });
    await expect(client.delete('/resource')).resolves.toEqual({ ok: 'delete' });

    expect(axiosInstance.get).toHaveBeenCalledWith('/resource', { params: { limit: 1 } });
    expect(axiosInstance.post).toHaveBeenCalledWith('/resource', { value: true }, undefined);
    expect(axiosInstance.delete).toHaveBeenCalledWith('/resource', undefined);
  });

  it('passes raw requests through without retry wrapping', async () => {
    const client = new HttpClient();
    const response = { data: { ok: true }, status: 200 };
    axiosInstance.request.mockResolvedValue(response);

    await expect(client.request({ url: '/raw', method: 'PATCH' })).resolves.toBe(response);

    expect(axiosInstance.request).toHaveBeenCalledWith({ url: '/raw', method: 'PATCH' });
  });

  it('returns successful responses from the response interceptor', () => {
    new HttpClient();
    const response = { status: 200, config: { url: '/me' } };

    expect(responseFulfilled(response)).toBe(response);
  });

  it('transforms API rate limit errors', async () => {
    new HttpClient();
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    await expect(
      responseRejected({
        response: {
          data: {
            error: {
              message: 'Application request limit reached',
              type: 'OAuthException',
              code: 4,
            },
          },
          headers: {
            'retry-after': '15',
          },
        },
      })
    ).rejects.toBeInstanceOf(RateLimitError);
  });

  it('uses the default retry-after value for rate limit errors without a header', async () => {
    new HttpClient();
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    await expect(
      responseRejected({
        response: {
          data: {
            error: {
              message: 'Too many calls',
              type: 'OAuthException',
              code: 17,
            },
          },
          headers: {},
        },
      })
    ).rejects.toMatchObject({
      retryAfter: 60,
    });
  });

  it('transforms API, generic HTTP, network, and unknown errors', async () => {
    new HttpClient();
    vi.mocked(axios.isAxiosError).mockReturnValue(true);

    await expect(
      responseRejected({
        response: {
          data: {
            error: {
              message: 'Invalid token',
              type: 'OAuthException',
              code: 190,
            },
          },
          headers: {},
        },
      })
    ).rejects.toBeInstanceOf(ApiError);

    await expect(
      responseRejected({
        response: {
          status: 502,
          statusText: 'Bad Gateway',
          data: {},
          headers: {},
        },
      })
    ).rejects.toBeInstanceOf(NetworkError);

    await expect(responseRejected({ message: 'ECONNRESET' })).rejects.toBeInstanceOf(NetworkError);

    vi.mocked(axios.isAxiosError).mockReturnValue(false);
    await expect(responseRejected(new Error('plain error'))).rejects.toThrow('plain error');
    await expect(responseRejected('unknown')).rejects.toThrow('Unknown error occurred');
  });

  it('propagates request interceptor errors', async () => {
    new HttpClient();
    const error = new Error('bad request interceptor');

    await expect(requestRejected(error)).rejects.toBe(error);
    await expect(requestRejected('string error')).rejects.toThrow('string error');
  });
});
