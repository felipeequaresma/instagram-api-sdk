import { createHmac } from 'crypto';
import EventEmitter from 'eventemitter3';
import { WebhookVerificationError } from '../errors/InstagramError';
import type {
  MessagingEvent,
  WebhookChange,
  WebhookConfig,
  WebhookEvent,
  WebhookVerificationRequest,
} from '../types/index';
import { logger } from '../utils/logger';

interface WebhookEventHandlers {
  messages: (event: MessagingEvent) => void;
  message_reactions: (event: MessagingEvent) => void;
  comments: (change: WebhookChange) => void;
  mentions: (change: WebhookChange) => void;
  story_insights: (change: WebhookChange) => void;
}

/**
 * Webhook handler for Instagram events
 */
export class WebhookHandler extends EventEmitter<WebhookEventHandlers> {
  private readonly config: WebhookConfig;
  private processedEvents: Set<string> = new Set();
  private readonly maxProcessedEvents = 1000;

  constructor(config: WebhookConfig) {
    super();
    this.config = config;
  }

  /**
   * Handle webhook verification challenge
   */
  handleVerification(query: WebhookVerificationRequest): string | null {
    logger.debug('Handling webhook verification', {
      mode: query['hub.mode'],
      token: query['hub.verify_token'],
    });

    if (
      query['hub.mode'] === 'subscribe' &&
      query['hub.verify_token'] === this.config.verifyToken
    ) {
      logger.info('Webhook verification successful');
      return query['hub.challenge'];
    }

    logger.warn('Webhook verification failed: invalid verify token');
    return null;
  }

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string): boolean {
    if (!signature) {
      logger.warn('No signature provided');
      return false;
    }

    // Signature format: sha256=<hash>
    const signatureParts = signature.split('=');
    if (signatureParts.length !== 2 || signatureParts[0] !== 'sha256') {
      logger.warn('Invalid signature format');
      return false;
    }

    const expectedHash = signatureParts[1];
    const hmac = createHmac('sha256', this.config.appSecret);
    hmac.update(payload);
    const calculatedHash = hmac.digest('hex');

    const isValid = calculatedHash === expectedHash;

    if (!isValid) {
      logger.warn('Webhook signature verification failed');
    }

    return isValid;
  }

  /**
   * Process webhook event
   */
  processEvent(payload: string, signature: string): void {
    // Verify signature
    if (!this.verifySignature(payload, signature)) {
      throw new WebhookVerificationError('Invalid webhook signature');
    }

    let event: WebhookEvent;
    try {
      event = JSON.parse(payload) as WebhookEvent;
    } catch (error) {
      logger.error('Failed to parse webhook payload', error);
      throw new WebhookVerificationError('Invalid webhook payload');
    }

    logger.debug('Processing webhook event', { object: event.object });

    if (event.object !== 'instagram') {
      logger.warn('Ignoring non-Instagram webhook event', { object: event.object });
      return;
    }

    // Process each entry
    for (const entry of event.entry) {
      // Process messaging events
      if (entry.messaging) {
        for (const messagingEvent of entry.messaging) {
          this.processMessagingEvent(messagingEvent);
        }
      }

      // Process changes (comments, mentions, story_insights)
      if (entry.changes) {
        for (const change of entry.changes) {
          this.processChange(change);
        }
      }
    }
  }

  /**
   * Process messaging event (messages, reactions)
   */
  private processMessagingEvent(event: MessagingEvent): void {
    const eventId = `${event.timestamp}-${event.sender.id}`;

    // Deduplicate events
    if (this.processedEvents.has(eventId)) {
      logger.debug('Skipping duplicate event', { eventId });
      return;
    }

    this.addProcessedEvent(eventId);

    // Emit message event
    if (event.message) {
      logger.debug('Emitting message event', { senderId: event.sender.id });
      this.emit('messages', event);
    }

    // Emit reaction event
    if (event.reaction) {
      logger.debug('Emitting reaction event', { senderId: event.sender.id });
      this.emit('message_reactions', event);
    }
  }

  /**
   * Process change event (comments, mentions, story_insights)
   */
  private processChange(change: WebhookChange): void {
    const eventId = `${change.field}-${JSON.stringify(change.value)}`;

    // Deduplicate events
    if (this.processedEvents.has(eventId)) {
      logger.debug('Skipping duplicate change', { field: change.field });
      return;
    }

    this.addProcessedEvent(eventId);

    logger.debug('Emitting change event', { field: change.field });

    // Emit appropriate event based on field
    switch (change.field) {
      case 'comments':
        this.emit('comments', change);
        break;
      case 'mentions':
        this.emit('mentions', change);
        break;
      case 'story_insights':
        this.emit('story_insights', change);
        break;
      default:
        logger.warn('Unknown change field', { field: change.field });
    }
  }

  /**
   * Add event to processed set with size limit
   */
  private addProcessedEvent(eventId: string): void {
    this.processedEvents.add(eventId);

    // Limit size of processed events set
    if (this.processedEvents.size > this.maxProcessedEvents) {
      const toDelete = this.processedEvents.size - this.maxProcessedEvents;
      const iterator = this.processedEvents.values();
      for (let i = 0; i < toDelete; i++) {
        const value = iterator.next().value;
        if (value) {
          this.processedEvents.delete(value);
        }
      }
    }
  }

  /**
   * Clear processed events cache
   */
  clearProcessedEvents(): void {
    this.processedEvents.clear();
  }
}
