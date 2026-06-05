import type { HttpClient } from '../../client/HttpClient';
import { ValidationError } from '../../errors/InstagramError';
import type { Media, MediaInsights, PaginatedResponse } from '../../types/index';
import { logger } from '../../utils/logger';

/**
 * Instagram Media API
 */
export class MediaApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * Get user's media
   */
  async list(limit: number = 25, after?: string): Promise<PaginatedResponse<Media>> {
    logger.debug('Fetching user media', { limit });

    const response = await this.httpClient.get<PaginatedResponse<Media>>('/me/media', {
      params: {
        limit,
        ...(after && { after }),
        fields:
          'id,caption,media_type,media_url,permalink,timestamp,username,comments_count,like_count',
      },
    });

    return response;
  }

  /**
   * Get a specific media object
   */
  async get(mediaId: string): Promise<Media> {
    if (!mediaId) {
      throw new ValidationError('mediaId is required', 'mediaId');
    }

    logger.debug('Fetching media', { mediaId });

    const response = await this.httpClient.get<Media>(`/${mediaId}`, {
      params: {
        fields:
          'id,caption,media_type,media_url,permalink,timestamp,username,comments_count,like_count',
      },
    });

    return response;
  }

  /**
   * Get media insights
   */
  async getInsights(mediaId: string): Promise<MediaInsights> {
    if (!mediaId) {
      throw new ValidationError('mediaId is required', 'mediaId');
    }

    logger.debug('Fetching media insights', { mediaId });

    const response = await this.httpClient.get<{
      data: Array<{ name: string; values: Array<{ value: number }> }>;
    }>(`/${mediaId}/insights`, {
      params: {
        metric: 'impressions,reach,engagement,saved',
      },
    });

    // Transform API response to simplified format
    const insights: MediaInsights = {
      impressions: 0,
      reach: 0,
      engagement: 0,
      saved: 0,
    };

    for (const metric of response.data) {
      const value = metric.values[0]?.value || 0;
      if (metric.name === 'impressions') insights.impressions = value;
      if (metric.name === 'reach') insights.reach = value;
      if (metric.name === 'engagement') insights.engagement = value;
      if (metric.name === 'saved') insights.saved = value;
    }

    return insights;
  }

  /**
   * Get children of a carousel album
   */
  async getChildren(mediaId: string): Promise<PaginatedResponse<Media>> {
    if (!mediaId) {
      throw new ValidationError('mediaId is required', 'mediaId');
    }

    logger.debug('Fetching media children', { mediaId });

    const response = await this.httpClient.get<PaginatedResponse<Media>>(`/${mediaId}/children`, {
      params: {
        fields: 'id,media_type,media_url,permalink,timestamp',
      },
    });

    return response;
  }
}
