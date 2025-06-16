type KVNamespace = {
  get: <T>(key: string, type?: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: unknown;
  error?: Error;
}

interface Env {
  KV: KVNamespace;
}

export class PushLogger {
  private static readonly LOG_KEY = 'push:logs';
  private static readonly MAX_LOGS = 1000; // Keep last 1000 logs

  constructor(private env: Env) {}

  /**
   * Log a debug message
   */
  async debug(message: string, data?: unknown): Promise<void> {
    await this.log('debug', message, data);
  }

  /**
   * Log an info message
   */
  async info(message: string, data?: unknown): Promise<void> {
    await this.log('info', message, data);
  }

  /**
   * Log a warning message
   */
  async warn(message: string, data?: unknown): Promise<void> {
    await this.log('warn', message, data);
  }

  /**
   * Log an error message
   */
  async error(message: string, error?: Error, data?: unknown): Promise<void> {
    await this.log('error', message, data, error);
  }

  /**
   * Get recent logs
   */
  async getLogs(level?: LogLevel, limit = 100): Promise<LogEntry[]> {
    const logs = await this.env.KV.get<LogEntry[]>(PushLogger.LOG_KEY, 'json') || [];
    
    let filtered = logs;
    if (level) {
      filtered = logs.filter(log => log.level === level);
    }
    
    return filtered.slice(-limit);
  }

  /**
   * Clear logs
   */
  async clearLogs(): Promise<void> {
    await this.env.KV.delete(PushLogger.LOG_KEY);
  }

  private async log(level: LogLevel, message: string, data?: unknown, error?: Error): Promise<void> {
    const logs = await this.env.KV.get<LogEntry[]>(PushLogger.LOG_KEY, 'json') || [];
    
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack
      } : undefined
    };

    logs.push(entry);

    // Keep only the last MAX_LOGS
    if (logs.length > PushLogger.MAX_LOGS) {
      logs.splice(0, logs.length - PushLogger.MAX_LOGS);
    }

    await this.env.KV.put(PushLogger.LOG_KEY, JSON.stringify(logs));

    // Also log to console for development
    if (process.env.NODE_ENV === 'development') {
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[${level.toUpperCase()}] ${message}`, data || '', error || '');
    }
  }
} 