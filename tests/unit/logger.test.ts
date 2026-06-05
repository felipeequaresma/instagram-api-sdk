import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { logger, LogLevel } from '../../src/utils/logger';

describe('Logger', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logger.disable();
    vi.restoreAllMocks();
  });

  it('should sanitize access tokens', () => {
    logger.setLevel(LogLevel.DEBUG);
    
    // Should not throw and should sanitize sensitive data
    logger.debug('Test', { accessToken: 'secret123' });
    logger.info('Test', { token: 'secret456' });

    expect(logSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [DEBUG]',
      'Test',
      expect.objectContaining({ accessToken: '***' })
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [INFO]',
      'Test',
      expect.objectContaining({ token: '***' })
    );
  });

  it('should respect log levels', () => {
    logger.setLevel(LogLevel.ERROR);
    
    // These should not throw even though they won't log
    logger.debug('Debug message');
    logger.info('Info message');
    logger.warn('Warn message');
    logger.error('Error message');

    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('should enable and disable logging', () => {
    logger.enable();
    logger.debug('Enabled message');
    logger.disable();
    
    logger.debug('Disabled message');

    expect(logSpy).toHaveBeenCalledTimes(1);
  });

  it('should sanitize strings, arrays, nested objects, nulls, and primitives', () => {
    logger.setLevel(LogLevel.DEBUG);

    logger.debug('String', 'access_token=abc&secret=def token=ghi password=jkl');
    logger.debug('Array', [{ appSecret: 'secret', visible: true }]);
    logger.debug('Nested', {
      keep: 'value',
      nested: {
        password: 'secret',
      },
      nullable: null,
    });
    logger.debug('Primitive', 123, null);
    logger.warn('Warning', { appSecret: 'secret' });

    expect(logSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [DEBUG]',
      'String',
      'access_token=***&secret=*** token=*** password=***'
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [DEBUG]',
      'Array',
      [expect.objectContaining({ appSecret: '***', visible: true })]
    );
    expect(logSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [DEBUG]',
      'Nested',
      expect.objectContaining({
        keep: 'value',
        nested: { password: '***' },
        nullable: null,
      })
    );
    expect(logSpy).toHaveBeenCalledWith('[Instagram SDK] [DEBUG]', 'Primitive', 123, null);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Instagram SDK] [WARN]',
      'Warning',
      expect.objectContaining({ appSecret: '***' })
    );
  });
});
