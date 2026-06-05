import { describe, expect, it, vi } from 'vitest';
import type { HttpClient } from '../../src/client/HttpClient';
import { ValidationError } from '../../src/errors/InstagramError';
import { MediaApi } from '../../src/features/media/MediaApi';

type MockHttpClient = Pick<HttpClient, 'get'>;

const createHttpClient = (): MockHttpClient => ({
  get: vi.fn(),
});

describe('MediaApi', () => {
  it('lists user media with pagination and expected fields', async () => {
    const httpClient = createHttpClient();
    const api = new MediaApi(httpClient as HttpClient);
    const response = { data: [{ id: 'media-1' }] };
    vi.mocked(httpClient.get).mockResolvedValue(response);

    await expect(api.list(12, 'cursor')).resolves.toBe(response);

    expect(httpClient.get).toHaveBeenCalledWith('/me/media', {
      params: {
        limit: 12,
        after: 'cursor',
        fields:
          'id,caption,media_type,media_url,permalink,timestamp,username,comments_count,like_count',
      },
    });
  });

  it('gets a single media object', async () => {
    const httpClient = createHttpClient();
    const api = new MediaApi(httpClient as HttpClient);
    const media = { id: 'media-1' };
    vi.mocked(httpClient.get).mockResolvedValue(media);

    await expect(api.get('media-1')).resolves.toBe(media);

    expect(httpClient.get).toHaveBeenCalledWith('/media-1', {
      params: {
        fields:
          'id,caption,media_type,media_url,permalink,timestamp,username,comments_count,like_count',
      },
    });
  });

  it('normalizes media insights and defaults missing metrics to zero', async () => {
    const httpClient = createHttpClient();
    const api = new MediaApi(httpClient as HttpClient);
    vi.mocked(httpClient.get).mockResolvedValue({
      data: [
        { name: 'impressions', values: [{ value: 100 }] },
        { name: 'reach', values: [{ value: 80 }] },
        { name: 'engagement', values: [{ value: 12 }] },
        { name: 'saved', values: [] },
      ],
    });

    await expect(api.getInsights('media-1')).resolves.toEqual({
      impressions: 100,
      reach: 80,
      engagement: 12,
      saved: 0,
    });

    expect(httpClient.get).toHaveBeenCalledWith('/media-1/insights', {
      params: {
        metric: 'impressions,reach,engagement,saved',
      },
    });
  });

  it('gets carousel children', async () => {
    const httpClient = createHttpClient();
    const api = new MediaApi(httpClient as HttpClient);
    const response = { data: [{ id: 'child-1' }] };
    vi.mocked(httpClient.get).mockResolvedValue(response);

    await expect(api.getChildren('media-1')).resolves.toBe(response);

    expect(httpClient.get).toHaveBeenCalledWith('/media-1/children', {
      params: {
        fields: 'id,media_type,media_url,permalink,timestamp',
      },
    });
  });

  it('validates required media ids', async () => {
    const api = new MediaApi(createHttpClient() as HttpClient);

    await expect(api.get('')).rejects.toMatchObject(
      new ValidationError('mediaId is required', 'mediaId')
    );
    await expect(api.getInsights('')).rejects.toMatchObject(
      new ValidationError('mediaId is required', 'mediaId')
    );
    await expect(api.getChildren('')).rejects.toMatchObject(
      new ValidationError('mediaId is required', 'mediaId')
    );
  });
});
