/**
 * Debug logger utility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

class Logger {
  private level: LogLevel = LogLevel.NONE;
  private prefix = '[Instagram SDK]';

  setLevel(level: LogLevel): void {
    this.level = level;
  }

  enable(): void {
    this.level = LogLevel.DEBUG;
  }

  disable(): void {
    this.level = LogLevel.NONE;
  }

  debug(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.DEBUG) {
      console.log(`${this.prefix} [DEBUG]`, message, ...this.sanitize(args));
    }
  }

  info(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.INFO) {
      console.log(`${this.prefix} [INFO]`, message, ...this.sanitize(args));
    }
  }

  warn(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.WARN) {
      console.warn(`${this.prefix} [WARN]`, message, ...this.sanitize(args));
    }
  }

  error(message: string, ...args: unknown[]): void {
    if (this.level <= LogLevel.ERROR) {
      console.error(`${this.prefix} [ERROR]`, message, ...this.sanitize(args));
    }
  }

  /**
   * Sanitize sensitive data from logs
   */
  private sanitize(args: unknown[]): unknown[] {
    return args.map((arg) => {
      if (typeof arg === 'string') {
        // Redact tokens and secrets
        return arg.replace(/(access_token|token|secret|password)=([^&\s]+)/gi, '$1=***');
      }
      if (typeof arg === 'object' && arg !== null) {
        return this.sanitizeObject(arg);
      }
      return arg;
    });
  }

  private sanitizeObject(obj: unknown): unknown {
    if (Array.isArray(obj)) {
      return obj.map((item) => this.sanitizeObject(item));
    }

    if (typeof obj === 'object' && obj !== null) {
      const sanitized: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        if (['accessToken', 'token', 'secret', 'password', 'appSecret'].includes(key)) {
          sanitized[key] = '***';
        } else if (typeof value === 'object') {
          sanitized[key] = this.sanitizeObject(value);
        } else {
          sanitized[key] = value;
        }
      }
      return sanitized;
    }

    return obj;
  }
}

export const logger = new Logger();
