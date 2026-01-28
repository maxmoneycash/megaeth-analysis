/**
 * Type definitions for Aptos-style data fetching architecture
 */

/**
 * Block data with transaction count and metadata
 */
export interface MegaBlock {
  blockNumber: number;
  timestamp: number;
  txCount: number;
  /** Block time in ms (difference from previous block) */
  blockTime?: number;
}

/**
 * Full block with transaction details
 */
export interface MegaBlockWithTxs extends MegaBlock {
  transactions: MegaBlockTransaction[];
}

/**
 * Transaction within a block
 */
export interface MegaBlockTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gasUsed: number;
}

/**
 * Aggregated metrics emitted by the polling stream
 */
export interface MegaMetrics {
  /** Current block height */
  blockHeight: number;
  /** Current TPS (30-second rolling window) */
  tps: number;
  /** Peak TPS observed */
  peakTps: number;
  /** Average block time in ms (over last 20 blocks) */
  avgBlockTime: number;
  /** Current E2E latency estimate in ms (avgBlockTime * 5) */
  e2eLatency: number;
  /** p50 latency in ms */
  latencyP50: number;
  /** p95 latency in ms */
  latencyP95: number;
  /** Connection status */
  connected: boolean;
  /** Whether backfill is in progress */
  isBackfilling: boolean;
  /** Timestamp of this metrics snapshot */
  timestamp: number;
  /** Number of poll cycles completed */
  pollCount: number;
}

/**
 * TPS data point for history tracking
 */
export interface TPSDataPoint {
  timestamp: number;
  tps: number;
  blockNumber: number;
}

/**
 * Latency sample for E2E tracking
 */
export interface LatencySample {
  timestamp: number;
  /** Derived E2E latency in ms */
  latencyMs: number;
  /** Average block time used for derivation */
  avgBlockTime: number;
}

/**
 * Polling stream configuration options
 */
export interface MegaPollingOptions {
  /** Primary RPC URL (default: https://carrot.megaeth.com/rpc) */
  rpcUrl?: string;
  /** Fallback RPC URL (default: https://6342.rpc.thirdweb.com) */
  fallbackUrl?: string;
  /** Polling interval in ms (default: 100 = 10 updates/sec) */
  pollInterval?: number;
  /** Number of blocks to fetch on init (default: 350) */
  backfillCount?: number;
  /** Batch size for parallel backfill (default: 100) */
  backfillBatchSize?: number;
  /** Number of parallel batches during backfill (default: 2) */
  backfillParallelBatches?: number;
  /** TPS calculation window in ms (default: 30000 = 30 seconds) */
  tpsWindowMs?: number;
  /** Max TPS history length (default: 100) */
  tpsHistorySize?: number;
  /** Max blocks to keep in memory (default: 500) */
  maxBlocks?: number;
  /** Max blocks to fetch per poll (default: 20) */
  maxBlocksPerPoll?: number;
  /** Fetch timeout in ms (default: 8000) */
  fetchTimeout?: number;
}

/**
 * Latency tracker configuration options
 */
export interface LatencyTrackerOptions {
  /** Sample interval in ms (default: 2000 = 2 seconds) */
  sampleInterval?: number;
  /** Max samples to keep (default: 150 = ~5 minutes at 2-second intervals) */
  maxSamples?: number;
  /** localStorage key for persistence */
  storageKey?: string;
  /** E2E latency multiplier (default: 5 for Raptr 4-hop consensus) */
  latencyMultiplier?: number;
}

/**
 * Latency stats emitted to subscribers
 */
export interface LatencyStats {
  /** Most recent latency value */
  latest: number;
  /** 50th percentile */
  p50: number;
  /** 95th percentile */
  p95: number;
  /** Number of samples */
  sampleCount: number;
  /** Timestamp of this update */
  timestamp: number;
}
