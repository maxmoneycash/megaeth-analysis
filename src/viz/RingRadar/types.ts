/**
 * Types for the Ring Radar visualization
 */

// MegaETH protocol limits
export interface ProtocolLimits {
  gas: number;
  kvUpdates: number;
  txSize: number;
  daSize: number;
  dataSize: number;
  stateGrowth: number;
}

// Raw block metrics from API
export interface BlockMetrics {
  blockNumber: number;
  timestamp: number;
  totalGas: number;
  kvUpdates: number;
  txSize: number;
  daSize: number;
  dataSize: number;
  stateGrowth: number;
  txCount: number;
}

// Percentile statistics for a single metric
export interface PercentileStats {
  p10: number;
  p25: number;
  median: number;
  p75: number;
  p90: number;
  iqr: number; // p75 - p25
  min: number;
  max: number;
  count: number;
}

// All percentile stats for baseline
export interface BaselineStats {
  gas: PercentileStats;
  kvUpdates: PercentileStats;
  txSize: PercentileStats;
  daSize: PercentileStats;
  dataSize: PercentileStats;
  stateGrowth: PercentileStats;
}

// Normalized metric value (-100 to +100)
export interface NormalizedMetric {
  raw: number;
  score: number; // -100 to +100
  utilizationPct: number; // 0 to 100
  limit: number;
}

// All normalized metrics for a block
export interface NormalizedBlockMetrics {
  gas: NormalizedMetric;
  kvUpdates: NormalizedMetric;
  txSize: NormalizedMetric;
  daSize: NormalizedMetric;
  dataSize: NormalizedMetric;
  stateGrowth: NormalizedMetric;
}

// Radar axis configuration
export interface RadarAxis {
  label: string;
  metric: keyof NormalizedBlockMetrics;
  angle: number; // Radians
  color: string;
}

// Ring radar rendering options
export interface RingRadarOptions {
  radius?: number;
  strokeWidth?: number;
  animationSpeed?: number;
  showLabels?: boolean;
  showGrid?: boolean;
  windowMs?: number; // Rolling window for baseline
  maxSamples?: number; // Max samples for reservoir
}

// Radar state for animation
export interface RadarState {
  currentMetrics: NormalizedBlockMetrics | null;
  targetMetrics: NormalizedBlockMetrics | null;
  animProgress: number;
  lastUpdate: number;
}
