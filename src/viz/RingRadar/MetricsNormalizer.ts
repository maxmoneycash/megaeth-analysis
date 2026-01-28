import type {
  BlockMetrics,
  PercentileStats,
  BaselineStats,
  NormalizedMetric,
  NormalizedBlockMetrics,
  ProtocolLimits,
} from './types';

/**
 * MegaETH protocol limits (from mega-evm constants)
 */
export const PROTOCOL_LIMITS: ProtocolLimits = {
  gas: 30_000_000,
  kvUpdates: 500_000,
  txSize: 1_000_000,
  daSize: 1_000_000,
  dataSize: 10_000_000,
  stateGrowth: 100_000,
};

interface MetricSample {
  timestamp: number;
  totalGas: number;
  kvUpdates: number;
  txSize: number;
  daSize: number;
  dataSize: number;
  stateGrowth: number;
}

/**
 * Normalizes block metrics to -100 to +100 scale using
 * Hybrid Sigmoid + Capacity Warning algorithm.
 *
 * Based on rolling window percentile calculation.
 */
export class MetricsNormalizer {
  private windowMs: number;
  private maxSamples: number;
  private samples: MetricSample[] = [];

  constructor(windowMs = 10 * 60 * 1000, maxSamples = 2000) {
    this.windowMs = windowMs;
    this.maxSamples = maxSamples;
  }

  /**
   * Add a block sample to the rolling window
   */
  addSample(metrics: BlockMetrics): void {
    this.evictOld();

    // Reservoir sampling if at capacity
    if (this.samples.length >= this.maxSamples) {
      this.samples.shift();
    }

    this.samples.push({
      timestamp: Date.now(),
      totalGas: metrics.totalGas,
      kvUpdates: metrics.kvUpdates,
      txSize: metrics.txSize,
      daSize: metrics.daSize,
      dataSize: metrics.dataSize,
      stateGrowth: metrics.stateGrowth,
    });
  }

  /**
   * Remove samples older than window duration
   */
  private evictOld(): void {
    const cutoff = Date.now() - this.windowMs;
    while (this.samples.length > 0 && this.samples[0].timestamp < cutoff) {
      this.samples.shift();
    }
  }

  /**
   * Get number of samples in current window
   */
  get sampleCount(): number {
    return this.samples.length;
  }

  /**
   * Compute percentile statistics for all metrics
   */
  computeStats(): BaselineStats {
    if (this.samples.length === 0) {
      return {
        gas: this.emptyStats(),
        kvUpdates: this.emptyStats(),
        txSize: this.emptyStats(),
        daSize: this.emptyStats(),
        dataSize: this.emptyStats(),
        stateGrowth: this.emptyStats(),
      };
    }

    return {
      gas: this.computePercentiles((s) => s.totalGas),
      kvUpdates: this.computePercentiles((s) => s.kvUpdates),
      txSize: this.computePercentiles((s) => s.txSize),
      daSize: this.computePercentiles((s) => s.daSize),
      dataSize: this.computePercentiles((s) => s.dataSize),
      stateGrowth: this.computePercentiles((s) => s.stateGrowth),
    };
  }

  private emptyStats(): PercentileStats {
    return { p10: 0, p25: 0, median: 0, p75: 0, p90: 0, iqr: 0, min: 0, max: 0, count: 0 };
  }

  /**
   * Compute percentiles for a single metric
   */
  private computePercentiles(extractor: (s: MetricSample) => number): PercentileStats {
    const values = this.samples.map(extractor).sort((a, b) => a - b);
    const n = values.length;

    if (n === 0) return this.emptyStats();

    const p10 = values[Math.floor(n * 0.1)];
    const p25 = values[Math.floor(n * 0.25)];
    const median = values[Math.floor(n * 0.5)];
    const p75 = values[Math.floor(n * 0.75)];
    const p90 = values[Math.floor(n * 0.9)];

    return {
      p10,
      p25,
      median,
      p75,
      p90,
      iqr: p75 - p25,
      min: values[0],
      max: values[n - 1],
      count: n,
    };
  }

  /**
   * Normalize a block's metrics to -100 to +100 scores
   */
  normalizeBlock(metrics: BlockMetrics): NormalizedBlockMetrics {
    const stats = this.computeStats();

    return {
      gas: this.normalizeMetric(metrics.totalGas, stats.gas, PROTOCOL_LIMITS.gas),
      kvUpdates: this.normalizeMetric(metrics.kvUpdates, stats.kvUpdates, PROTOCOL_LIMITS.kvUpdates),
      txSize: this.normalizeMetric(metrics.txSize, stats.txSize, PROTOCOL_LIMITS.txSize),
      daSize: this.normalizeMetric(metrics.daSize, stats.daSize, PROTOCOL_LIMITS.daSize),
      dataSize: this.normalizeMetric(metrics.dataSize, stats.dataSize, PROTOCOL_LIMITS.dataSize),
      stateGrowth: this.normalizeMetric(metrics.stateGrowth, stats.stateGrowth, PROTOCOL_LIMITS.stateGrowth),
    };
  }

  /**
   * Normalize a single metric using Hybrid Sigmoid + Capacity Warning
   *
   * Formula:
   * 1. Base score = tanh((value - median) / (IQR * 1.5)) * 100
   * 2. If utilization > 50%, override: score = max(score, utilization * 100)
   */
  private normalizeMetric(value: number, stats: PercentileStats, limit: number): NormalizedMetric {
    const utilization = value / limit;
    const utilizationPct = utilization * 100;

    // Handle edge case: no data or no spread
    if (stats.count === 0 || stats.iqr === 0) {
      return {
        raw: value,
        score: Math.max(-100, Math.min(100, utilization * 200 - 100)),
        utilizationPct,
        limit,
      };
    }

    // Sigmoid normalization centered on median
    const spread = stats.iqr * 1.5;
    const x = (value - stats.median) / spread;
    let score = Math.tanh(x) * 100;

    // Capacity warning: if approaching protocol limit, force towards +100
    if (utilization > 0.5) {
      const capacityScore = utilization * 100;
      score = Math.max(score, capacityScore);
    }

    return {
      raw: value,
      score: Math.max(-100, Math.min(100, score)),
      utilizationPct,
      limit,
    };
  }
}
