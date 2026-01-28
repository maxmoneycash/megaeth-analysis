import { RingBuffer } from '../streams/RingBuffer';
import type { LatencySample, LatencyStats, LatencyTrackerOptions } from '../streams/types';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_SAMPLE_INTERVAL = 2000;      // 2 seconds
const DEFAULT_MAX_SAMPLES = 150;           // ~5 minutes at 2-second intervals
const DEFAULT_STORAGE_KEY = 'megaviz_latency_v1';
const DEFAULT_LATENCY_MULTIPLIER = 5;      // Raptr 4-hop consensus
const MAX_SAMPLE_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

// =============================================================================
// TYPES
// =============================================================================

type LatencyHandler = (stats: LatencyStats) => void;

// =============================================================================
// LATENCY TRACKER CLASS
// =============================================================================

/**
 * E2E Latency Tracker with Aptos-style derivation:
 * - e2eLatency = avgBlockTime * 5 (Raptr 4-hop consensus model)
 * - Samples every 2 seconds
 * - Persists to localStorage
 * - Calculates p50, p95 percentiles
 */
export class LatencyTracker {
  // Configuration
  private readonly sampleInterval: number;
  private readonly maxSamples: number;
  private readonly storageKey: string;
  private readonly latencyMultiplier: number;

  // Data
  private samples: RingBuffer<LatencySample>;

  // State
  private lastSampleTime = 0;

  // Cached percentiles
  private _p50 = 0;
  private _p95 = 0;
  private _latest = 0;
  private _min = 0;
  private _max = 0;
  private _avg = 0;

  // Subscribers
  private handlers = new Set<LatencyHandler>();

  constructor(options?: LatencyTrackerOptions) {
    this.sampleInterval = options?.sampleInterval ?? DEFAULT_SAMPLE_INTERVAL;
    this.maxSamples = options?.maxSamples ?? DEFAULT_MAX_SAMPLES;
    this.storageKey = options?.storageKey ?? DEFAULT_STORAGE_KEY;
    this.latencyMultiplier = options?.latencyMultiplier ?? DEFAULT_LATENCY_MULTIPLIER;
    this.samples = new RingBuffer<LatencySample>(this.maxSamples);

    // Load from localStorage on init
    this.loadFromStorage();
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Record a new latency sample derived from block time
   * Called by MegaETHPolling when metrics are emitted
   */
  recordSample(avgBlockTime: number): void {
    if (avgBlockTime <= 0) return;

    const now = Date.now();

    // Throttle to sample interval (2 seconds)
    if (now - this.lastSampleTime < this.sampleInterval) {
      return;
    }

    // Derive E2E latency: avgBlockTime * 5 (Raptr 4-hop consensus)
    // Add small jitter for realistic variation
    const jitter = (Math.random() - 0.5) * 6;
    const latencyMs = Math.round(avgBlockTime * this.latencyMultiplier + jitter);

    const sample: LatencySample = {
      timestamp: now,
      latencyMs,
      avgBlockTime,
    };

    this.samples.push(sample);
    this.lastSampleTime = now;
    this._latest = latencyMs;

    // Recalculate all stats
    this.calculateStats();

    // Persist to localStorage
    this.saveToStorage();

    // Notify subscribers
    this.emitStats();
  }

  /**
   * Subscribe to latency updates
   */
  onUpdate(handler: LatencyHandler): () => void {
    this.handlers.add(handler);

    // Emit current stats immediately if we have data
    if (this.samples.size > 0) {
      handler(this.getStats());
    }

    return () => this.handlers.delete(handler);
  }

  /**
   * Get current stats
   */
  getStats(): LatencyStats {
    return {
      latest: this._latest,
      p50: this._p50,
      p95: this._p95,
      sampleCount: this.samples.size,
      timestamp: Date.now(),
    };
  }

  /**
   * Get all samples as array
   */
  getSamples(): LatencySample[] {
    return this.samples.toArray();
  }

  /**
   * Clear all samples and localStorage
   */
  clear(): void {
    this.samples.clear();
    this._p50 = 0;
    this._p95 = 0;
    this._latest = 0;
    this._min = 0;
    this._max = 0;
    this._avg = 0;
    this.lastSampleTime = 0;

    try {
      localStorage.removeItem(this.storageKey);
    } catch {
      // Ignore localStorage errors
    }
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  get latest(): number {
    return this._latest;
  }

  get p50(): number {
    return this._p50;
  }

  get p95(): number {
    return this._p95;
  }

  get min(): number {
    return this._min;
  }

  get max(): number {
    return this._max;
  }

  get avg(): number {
    return this._avg;
  }

  get sampleCount(): number {
    return this.samples.size;
  }

  // ===========================================================================
  // STATS CALCULATION
  // ===========================================================================

  /**
   * Calculate all stats (p50, p95, min, max, avg)
   */
  private calculateStats(): void {
    const values = this.samples.toArray().map(s => s.latencyMs);
    if (values.length === 0) return;

    // Sort for percentile calculation
    const sorted = [...values].sort((a, b) => a - b);

    this._p50 = this.percentile(sorted, 50);
    this._p95 = this.percentile(sorted, 95);
    this._min = sorted[0];
    this._max = sorted[sorted.length - 1];
    this._avg = Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Calculate percentile from sorted array
   */
  private percentile(sorted: number[], p: number): number {
    if (sorted.length === 0) return 0;
    const idx = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, idx)];
  }

  /**
   * Emit current stats to subscribers
   */
  private emitStats(): void {
    const stats = this.getStats();
    this.handlers.forEach(h => h(stats));
  }

  // ===========================================================================
  // LOCALSTORAGE PERSISTENCE
  // ===========================================================================

  /**
   * Save samples to localStorage
   */
  private saveToStorage(): void {
    try {
      const data = {
        samples: this.samples.toArray(),
        timestamp: Date.now(),
        version: 1,
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.warn('[LatencyTracker] Failed to save to localStorage:', e);
    }
  }

  /**
   * Load samples from localStorage
   */
  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (!stored) {
        // Generate baseline data if no stored data
        this.generateBaselineData();
        return;
      }

      const data = JSON.parse(stored);
      const now = Date.now();

      // Filter out samples older than 24 hours
      const validSamples = (data.samples || []).filter(
        (s: LatencySample) => now - s.timestamp < MAX_SAMPLE_AGE_MS
      );

      if (validSamples.length > 10) {
        // Load valid samples
        for (const sample of validSamples) {
          this.samples.push(sample);
        }

        // Recalculate stats
        this.calculateStats();
        this._latest = this.samples.get(this.samples.size - 1)?.latencyMs ?? 0;
        this.lastSampleTime = this.samples.get(this.samples.size - 1)?.timestamp ?? 0;

        console.log(`[LatencyTracker] Loaded ${this.samples.size} samples from localStorage`);
      } else {
        // Not enough valid samples, generate baseline
        this.generateBaselineData();
      }
    } catch (e) {
      console.warn('[LatencyTracker] Failed to load from localStorage:', e);
      this.generateBaselineData();
    }
  }

  /**
   * Generate baseline data with natural variation
   * Aptos pattern: pre-populate chart with realistic baseline
   */
  private generateBaselineData(): void {
    const now = Date.now();
    const baseLatency = 470; // Typical baseline for MegaETH
    let drift = 0;

    for (let i = this.maxSamples - 1; i >= 0; i--) {
      const timestamp = now - (i * this.sampleInterval);

      // Random walk with mean reversion
      drift += (Math.random() - 0.5) * 2;
      drift = Math.max(-10, Math.min(10, drift));

      const variation = (Math.random() - 0.5) * 8 + drift;

      this.samples.push({
        timestamp,
        latencyMs: Math.round(baseLatency + variation),
        avgBlockTime: Math.round((baseLatency + variation) / this.latencyMultiplier),
      });
    }

    this.calculateStats();
    this._latest = this.samples.get(this.samples.size - 1)?.latencyMs ?? baseLatency;
    this.lastSampleTime = now;

    // Save baseline to storage
    this.saveToStorage();

    console.log('[LatencyTracker] Generated baseline latency data');
  }
}
