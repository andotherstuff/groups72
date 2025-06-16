type KVNamespace = {
  get: <T>(key: string, type?: 'text' | 'json') => Promise<T | null>;
  put: (key: string, value: string, options?: { expirationTtl?: number }) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: (options?: { prefix?: string }) => Promise<{ keys: { name: string }[] }>;
};

interface MetricsData {
  totalSent: number;
  successfulDeliveries: number;
  failedDeliveries: number;
  invalidSubscriptions: number;
  averageDeliveryTime: number;
  deliveryTimes: number[];
  errors: {
    [key: string]: number;
  };
  lastUpdated: number;
}

export class PushMetrics {
  private static readonly METRICS_KEY = 'push:metrics';
  private static readonly MAX_DELIVERY_TIMES = 1000; // Keep last 1000 delivery times

  constructor(private env: { KV: KVNamespace }) {}

  /**
   * Record a successful notification delivery
   */
  async recordSuccess(deliveryTime: number): Promise<void> {
    const metrics = await this.getMetrics();
    
    metrics.totalSent++;
    metrics.successfulDeliveries++;
    metrics.deliveryTimes.push(deliveryTime);
    
    // Keep only the last MAX_DELIVERY_TIMES
    if (metrics.deliveryTimes.length > PushMetrics.MAX_DELIVERY_TIMES) {
      metrics.deliveryTimes = metrics.deliveryTimes.slice(-PushMetrics.MAX_DELIVERY_TIMES);
    }
    
    // Update average delivery time
    metrics.averageDeliveryTime = metrics.deliveryTimes.reduce((a, b) => a + b, 0) / metrics.deliveryTimes.length;
    
    metrics.lastUpdated = Date.now();
    await this.saveMetrics(metrics);
  }

  /**
   * Record a failed notification delivery
   */
  async recordFailure(error: string): Promise<void> {
    const metrics = await this.getMetrics();
    
    metrics.totalSent++;
    metrics.failedDeliveries++;
    metrics.errors[error] = (metrics.errors[error] || 0) + 1;
    
    metrics.lastUpdated = Date.now();
    await this.saveMetrics(metrics);
  }

  /**
   * Record an invalid subscription
   */
  async recordInvalidSubscription(): Promise<void> {
    const metrics = await this.getMetrics();
    
    metrics.invalidSubscriptions++;
    metrics.lastUpdated = Date.now();
    await this.saveMetrics(metrics);
  }

  /**
   * Get current metrics
   */
  async getMetrics(): Promise<MetricsData> {
    const metrics = await this.env.KV.get<MetricsData>(PushMetrics.METRICS_KEY, 'json');
    
    if (!metrics) {
      return {
        totalSent: 0,
        successfulDeliveries: 0,
        failedDeliveries: 0,
        invalidSubscriptions: 0,
        averageDeliveryTime: 0,
        deliveryTimes: [],
        errors: {},
        lastUpdated: Date.now()
      };
    }
    
    return metrics;
  }

  /**
   * Reset metrics
   */
  async resetMetrics(): Promise<void> {
    await this.env.KV.delete(PushMetrics.METRICS_KEY);
  }

  /**
   * Get delivery success rate
   */
  async getSuccessRate(): Promise<number> {
    const metrics = await this.getMetrics();
    if (metrics.totalSent === 0) return 0;
    return (metrics.successfulDeliveries / metrics.totalSent) * 100;
  }

  /**
   * Get top errors
   */
  async getTopErrors(limit = 5): Promise<Array<{ error: string; count: number }>> {
    const metrics = await this.getMetrics();
    return Object.entries(metrics.errors)
      .map(([error, count]) => ({ error, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private async saveMetrics(metrics: MetricsData): Promise<void> {
    await this.env.KV.put(PushMetrics.METRICS_KEY, JSON.stringify(metrics));
  }
} 