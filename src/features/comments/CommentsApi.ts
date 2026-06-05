import type { HttpClient } from '../../client/HttpClient';
import { ValidationError } from '../../errors/InstagramError';
import type { Comment, CreateCommentReplyOptions, PaginatedResponse } from '../../types/index';
import { logger } from '../../utils/logger';

/**
 * Instagram Comments API
 */
export class CommentsApi {
  constructor(private readonly httpClient: HttpClient) {}

  /**
   * List comments on a media object
   */
  async list(
    mediaId: string,
    limit: number = 25,
    after?: string
  ): Promise<PaginatedResponse<Comment>> {
    if (!mediaId) {
      throw new ValidationError('mediaId is required', 'mediaId');
    }

    logger.debug('Fetching comments', { mediaId, limit });

    const response = await this.httpClient.get<PaginatedResponse<Comment>>(`/${mediaId}/comments`, {
      params: {
        limit,
        ...(after && { after }),
        fields: 'id,text,timestamp,from,like_count,hidden,parent_id',
      },
    });

    return response;
  }

  /**
   * Get a specific comment
   */
  async get(commentId: string): Promise<Comment> {
    if (!commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    logger.debug('Fetching comment', { commentId });

    const response = await this.httpClient.get<Comment>(`/${commentId}`, {
      params: {
        fields: 'id,text,timestamp,from,like_count,hidden,parent_id',
      },
    });

    return response;
  }

  /**
   * Get replies to a comment
   */
  async getReplies(commentId: string, limit: number = 25): Promise<PaginatedResponse<Comment>> {
    if (!commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    logger.debug('Fetching comment replies', { commentId, limit });

    const response = await this.httpClient.get<PaginatedResponse<Comment>>(
      `/${commentId}/replies`,
      {
        params: {
          limit,
          fields: 'id,text,timestamp,from,like_count,hidden',
        },
      }
    );

    return response;
  }

  /**
   * Reply to a comment
   */
  async reply(options: CreateCommentReplyOptions): Promise<{ commentId: string }> {
    if (!options.commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    if (!options.message) {
      throw new ValidationError('message is required', 'message');
    }

    logger.debug('Creating comment reply', { commentId: options.commentId });

    const response = await this.httpClient.post<{ id: string }>(`/${options.commentId}/replies`, {
      message: options.message,
    });

    logger.info('Comment reply created', { commentId: response.id });

    return { commentId: response.id };
  }

  /**
   * Hide a comment
   */
  async hide(commentId: string): Promise<{ success: boolean }> {
    if (!commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    logger.debug('Hiding comment', { commentId });

    await this.httpClient.post(`/${commentId}`, {
      hide: true,
    });

    logger.info('Comment hidden', { commentId });

    return { success: true };
  }

  /**
   * Unhide a comment
   */
  async unhide(commentId: string): Promise<{ success: boolean }> {
    if (!commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    logger.debug('Unhiding comment', { commentId });

    await this.httpClient.post(`/${commentId}`, {
      hide: false,
    });

    logger.info('Comment unhidden', { commentId });

    return { success: true };
  }

  /**
   * Delete a comment
   */
  async delete(commentId: string): Promise<{ success: boolean }> {
    if (!commentId) {
      throw new ValidationError('commentId is required', 'commentId');
    }

    logger.debug('Deleting comment', { commentId });

    await this.httpClient.delete(`/${commentId}`);

    logger.info('Comment deleted', { commentId });

    return { success: true };
  }
}
