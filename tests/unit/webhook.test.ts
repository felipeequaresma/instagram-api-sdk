import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import { WebhookVerificationError } from '../../src/errors/InstagramError';
import { WebhookHandler } from '../../src/webhooks/WebhookHandler';

describe('WebhookHandler', () => {
  const config = {
    verifyToken: 'test_verify_token',
    appSecret: 'test_app_secret',
  };

  const signPayload = (payload: string): string => {
    const hmac = createHmac('sha256', config.appSecret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  };

  it('should handle verification challenge', () => {
    const webhook = new WebhookHandler(config);
    
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'test_verify_token',
      'hub.challenge': 'challenge_string',
    };
    
    const result = webhook.handleVerification(query);
    expect(result).toBe('challenge_string');
  });

  it('should reject invalid verify token', () => {
    const webhook = new WebhookHandler(config);
    
    const query = {
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong_token',
      'hub.challenge': 'challenge_string',
    };
    
    const result = webhook.handleVerification(query);
    expect(result).toBeNull();
  });

  it('should verify webhook signature', () => {
    const webhook = new WebhookHandler(config);
    
    const payload = JSON.stringify({ test: 'data' });
    const signature = signPayload(payload);
    
    const isValid = webhook.verifySignature(payload, signature);
    expect(isValid).toBe(true);
  });

  it('should reject invalid signature', () => {
    const webhook = new WebhookHandler(config);
    
    const payload = JSON.stringify({ test: 'data' });
    const signature = 'sha256=invalid_signature';
    
    const isValid = webhook.verifySignature(payload, signature);
    expect(isValid).toBe(false);
  });

  it('should reject missing and malformed signatures', () => {
    const webhook = new WebhookHandler(config);

    expect(webhook.verifySignature('{}', '')).toBe(false);
    expect(webhook.verifySignature('{}', 'sha1=abc')).toBe(false);
    expect(webhook.verifySignature('{}', 'sha256=abc=extra')).toBe(false);
  });

  it('should emit message and reaction webhook events once', () => {
    const webhook = new WebhookHandler(config);
    const messageHandler = vi.fn();
    const reactionHandler = vi.fn();
    webhook.on('messages', messageHandler);
    webhook.on('message_reactions', reactionHandler);

    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          time: 123,
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: 'recipient-1' },
              timestamp: 1000,
              message: { mid: 'message-1', text: 'Hello' },
            },
            {
              sender: { id: 'sender-2' },
              recipient: { id: 'recipient-1' },
              timestamp: 1001,
              reaction: { mid: 'message-1', action: 'react', emoji: 'like' },
            },
          ],
        },
      ],
    });

    webhook.processEvent(payload, signPayload(payload));
    webhook.processEvent(payload, signPayload(payload));

    expect(messageHandler).toHaveBeenCalledTimes(1);
    expect(messageHandler).toHaveBeenCalledWith(
      expect.objectContaining({ sender: { id: 'sender-1' } })
    );
    expect(reactionHandler).toHaveBeenCalledTimes(1);
    expect(reactionHandler).toHaveBeenCalledWith(
      expect.objectContaining({ sender: { id: 'sender-2' } })
    );
  });

  it('should emit change webhook events and ignore unknown fields', () => {
    const webhook = new WebhookHandler(config);
    const commentsHandler = vi.fn();
    const mentionsHandler = vi.fn();
    const storyHandler = vi.fn();
    webhook.on('comments', commentsHandler);
    webhook.on('mentions', mentionsHandler);
    webhook.on('story_insights', storyHandler);

    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          time: 123,
          changes: [
            { field: 'comments', value: { id: 'comment-1' } },
            { field: 'mentions', value: { id: 'mention-1' } },
            { field: 'story_insights', value: { id: 'story-1' } },
            { field: 'unknown', value: { id: 'unknown-1' } },
          ],
        },
      ],
    });

    webhook.processEvent(payload, signPayload(payload));

    expect(commentsHandler).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'comments' })
    );
    expect(mentionsHandler).toHaveBeenCalledWith(
      expect.objectContaining({ field: 'mentions' })
    );
    expect(storyHandler).toHaveBeenCalledWith(expect.objectContaining({ field: 'story_insights' }));
  });

  it('should deduplicate repeated change webhook events', () => {
    const webhook = new WebhookHandler(config);
    const commentsHandler = vi.fn();
    webhook.on('comments', commentsHandler);

    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          time: 123,
          changes: [{ field: 'comments', value: { id: 'comment-1' } }],
        },
      ],
    });

    webhook.processEvent(payload, signPayload(payload));
    webhook.processEvent(payload, signPayload(payload));

    expect(commentsHandler).toHaveBeenCalledTimes(1);
  });

  it('should trim processed event cache when it exceeds the size limit', () => {
    const webhook = new WebhookHandler(config);
    const internals = webhook as unknown as {
      processedEvents: Set<string>;
      addProcessedEvent: (eventId: string) => void;
    };
    internals.processedEvents = new Set([
      '',
      ...Array.from({ length: 1000 }, (_, index) => `event-${index}`),
    ]);

    internals.addProcessedEvent('new-event');

    expect(internals.processedEvents.size).toBe(1001);
    expect(internals.processedEvents.has('new-event')).toBe(true);
    expect(internals.processedEvents.has('')).toBe(true);
    expect(internals.processedEvents.has('event-0')).toBe(false);
  });

  it('should clear processed event deduplication state', () => {
    const webhook = new WebhookHandler(config);
    const messageHandler = vi.fn();
    webhook.on('messages', messageHandler);

    const payload = JSON.stringify({
      object: 'instagram',
      entry: [
        {
          id: 'entry-1',
          time: 123,
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: 'recipient-1' },
              timestamp: 1000,
              message: { mid: 'message-1', text: 'Hello' },
            },
          ],
        },
      ],
    });

    webhook.processEvent(payload, signPayload(payload));
    webhook.clearProcessedEvents();
    webhook.processEvent(payload, signPayload(payload));

    expect(messageHandler).toHaveBeenCalledTimes(2);
  });

  it('should reject invalid signatures and invalid JSON payloads', () => {
    const webhook = new WebhookHandler(config);

    expect(() => webhook.processEvent('{}', 'sha256=invalid')).toThrow(WebhookVerificationError);

    const invalidPayload = '{not-valid-json';
    expect(() => webhook.processEvent(invalidPayload, signPayload(invalidPayload))).toThrow(
      WebhookVerificationError
    );
  });

  it('should ignore non-Instagram webhook objects', () => {
    const webhook = new WebhookHandler(config);
    const messageHandler = vi.fn();
    webhook.on('messages', messageHandler);

    const payload = JSON.stringify({
      object: 'page',
      entry: [
        {
          id: 'entry-1',
          time: 123,
          messaging: [
            {
              sender: { id: 'sender-1' },
              recipient: { id: 'recipient-1' },
              timestamp: 1000,
              message: { mid: 'message-1', text: 'Hello' },
            },
          ],
        },
      ],
    });

    webhook.processEvent(payload, signPayload(payload));

    expect(messageHandler).not.toHaveBeenCalled();
  });
});
