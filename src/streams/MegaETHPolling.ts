import { RingBuffer } from './RingBuffer';
import type {
  MegaBlock,
  MegaMetrics,
  TPSDataPoint,
  MegaPollingOptions,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

const DEFAULT_RPC = 'https://carrot.megaeth.com/rpc';
const FALLBACK_RPC = 'https://6342.rpc.thirdweb.com';

const DEFAULT_POLL_INTERVAL = 100;        // 100ms = 10 updates/sec
const DEFAULT_BACKFILL_COUNT = 350;       // ~35 seconds of blocks
const DEFAULT_BACKFILL_BATCH_SIZE = 100;  // 100 blocks per batch
const DEFAULT_BACKFILL_PARALLEL = 2;      // 2 batches in parallel
const DEFAULT_TPS_WINDOW_MS = 30000;      // 30-second rolling window
const DEFAULT_TPS_HISTORY_SIZE = 100;     // 10 seconds at 100ms intervals
const DEFAULT_MAX_BLOCKS = 500;           // Keep 500 blocks in memory
const DEFAULT_MAX_BLOCKS_PER_POLL = 20;   // Max 20 blocks per poll
const DEFAULT_FETCH_TIMEOUT = 8000;       // 8 second timeout

// =============================================================================
// TYPES
// =============================================================================

type BlockHandler = (block: MegaBlock) => void;
type MetricsHandler = (metrics: MegaMetrics) => void;
type InitHandler = (blocks: MegaBlock[]) => void;

interface BlockMapEntry {
  block: MegaBlock;
  addedAt: number;
}

// =============================================================================
// RAW BLOCK TYPES FROM JSON-RPC
// =============================================================================

interface RawBlock {
  number: string;
  timestamp: string;
  transactions: (RawTransaction | string)[];
}

interface RawTransaction {
  hash: string;
  from: string;
  to: string | null;
  value: string;
  gas: string;
}

// =============================================================================
// MEGAETH POLLING CLASS
// =============================================================================

/**
 * MegaETH polling stream with Aptos-style architecture:
 * - Historical backfill on init (350 blocks in parallel batches)
 * - 100ms polling (10 updates/second)
 * - TPS calculation over 30-second rolling window
 * - Block Map for O(1) lookups
 * - Visibility detection for performance
 */
export class MegaETHPolling {
  // Configuration
  private readonly rpcUrl: string;
  private readonly fallbackUrl: string;
  private readonly pollInterval: number;
  private readonly tpsWindowMs: number;
  private readonly maxBlocks: number;
  private readonly backfillCount: number;
  private readonly backfillBatchSize: number;
  private readonly backfillParallelBatches: number;
  private readonly maxBlocksPerPoll: number;
  private readonly fetchTimeout: number;

  // Block storage
  private blockMap = new Map<number, BlockMapEntry>();
  private recentBlocks: MegaBlock[] = [];
  private tpsHistory: RingBuffer<TPSDataPoint>;
  private blockTimesHistory: number[] = [];

  // State
  private lastBlockNumber = 0;
  private peakTps = 0;
  private pollCount = 0;
  private isInitialized = false;
  private isBackfilling = false;
  private isPolling = false;
  private connected = false;

  // Polling control
  private pollIntervalId: ReturnType<typeof setInterval> | null = null;
  private abortController: AbortController | null = null;

  // Visibility
  private isVisible = true;

  // Subscribers
  private blockHandlers = new Set<BlockHandler>();
  private metricsHandlers = new Set<MetricsHandler>();
  private initHandlers = new Set<InitHandler>();

  constructor(options?: MegaPollingOptions) {
    this.rpcUrl = options?.rpcUrl ?? DEFAULT_RPC;
    this.fallbackUrl = options?.fallbackUrl ?? FALLBACK_RPC;
    this.pollInterval = options?.pollInterval ?? DEFAULT_POLL_INTERVAL;
    this.tpsWindowMs = options?.tpsWindowMs ?? DEFAULT_TPS_WINDOW_MS;
    this.maxBlocks = options?.maxBlocks ?? DEFAULT_MAX_BLOCKS;
    this.backfillCount = options?.backfillCount ?? DEFAULT_BACKFILL_COUNT;
    this.backfillBatchSize = options?.backfillBatchSize ?? DEFAULT_BACKFILL_BATCH_SIZE;
    this.backfillParallelBatches = options?.backfillParallelBatches ?? DEFAULT_BACKFILL_PARALLEL;
    this.maxBlocksPerPoll = options?.maxBlocksPerPoll ?? DEFAULT_MAX_BLOCKS_PER_POLL;
    this.fetchTimeout = options?.fetchTimeout ?? DEFAULT_FETCH_TIMEOUT;
    this.tpsHistory = new RingBuffer<TPSDataPoint>(options?.tpsHistorySize ?? DEFAULT_TPS_HISTORY_SIZE);
  }

  // ===========================================================================
  // PUBLIC API
  // ===========================================================================

  /**
   * Start polling with historical backfill
   */
  async start(): Promise<void> {
    if (this.pollIntervalId !== null) {
      console.warn('[MegaETHPolling] Already started');
      return;
    }

    this.abortController = new AbortController();

    // Phase 1: Historical backfill
    await this.backfill();
    this.isInitialized = true;

    // Phase 2: Continuous polling at 100ms
    this.startPolling();
  }

  /**
   * Stop polling
   */
  stop(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    if (this.pollIntervalId !== null) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }

    this.isPolling = false;
  }

  /**
   * Set visibility state (pause polling when off-screen)
   */
  setVisible(visible: boolean): void {
    this.isVisible = visible;
    if (visible && this.isInitialized && !this.isPolling) {
      this.poll();
    }
  }

  // ===========================================================================
  // SUBSCRIPTION API
  // ===========================================================================

  /**
   * Subscribe to new blocks
   */
  onBlock(handler: BlockHandler): () => void {
    this.blockHandlers.add(handler);
    return () => this.blockHandlers.delete(handler);
  }

  /**
   * Subscribe to metrics updates
   */
  onMetrics(handler: MetricsHandler): () => void {
    this.metricsHandlers.add(handler);
    return () => this.metricsHandlers.delete(handler);
  }

  /**
   * Subscribe to initialization complete (backfill done)
   */
  onInit(handler: InitHandler): () => void {
    this.initHandlers.add(handler);
    // If already initialized, call immediately
    if (this.isInitialized) {
      handler(this.recentBlocks);
    }
    return () => this.initHandlers.delete(handler);
  }

  // ===========================================================================
  // GETTERS
  // ===========================================================================

  /**
   * Get block by number (O(1) lookup)
   */
  getBlock(blockNumber: number): MegaBlock | undefined {
    return this.blockMap.get(blockNumber)?.block;
  }

  /**
   * Get recent blocks array
   */
  getRecentBlocks(): MegaBlock[] {
    return [...this.recentBlocks];
  }

  /**
   * Get TPS history as array
   */
  getTPSHistory(): TPSDataPoint[] {
    return this.tpsHistory.toArray();
  }

  /**
   * Get current block height
   */
  get currentBlockHeight(): number {
    return this.lastBlockNumber;
  }

  /**
   * Get connection state
   */
  get isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get peak TPS
   */
  get currentPeakTps(): number {
    return this.peakTps;
  }

  // ===========================================================================
  // BACKFILL - Fetch historical blocks on init
  // ===========================================================================

  /**
   * Historical backfill - fetch 350 blocks in parallel batches
   * Aptos pattern: 2 batches of 100 blocks each, processed in rounds
   */
  private async backfill(): Promise<void> {
    this.isBackfilling = true;
    const signal = this.abortController?.signal;

    try {
      console.log('[MegaETHPolling] Starting historical block fetch...');

      // Get current block height
      const currentHeight = await this.fetchBlockNumber(signal);
      if (currentHeight === null) {
        console.error('[MegaETHPolling] Failed to get block number for backfill');
        this.isBackfilling = false;
        return;
      }

      const totalBlocks = Math.min(this.backfillCount, currentHeight);
      console.log(`[MegaETHPolling] Current height: ${currentHeight}, fetching last ${totalBlocks} blocks`);

      // Generate heights to fetch (newest first)
      const heights = Array.from(
        { length: totalBlocks },
        (_, i) => currentHeight - i
      ).filter(h => h > 0);

      // Create batches
      const batches: number[][] = [];
      for (let i = 0; i < heights.length; i += this.backfillBatchSize) {
        batches.push(heights.slice(i, i + this.backfillBatchSize));
      }

      // Fetch in parallel batches (limit to backfillParallelBatches concurrent)
      const allBlocks: MegaBlock[] = [];
      const totalBatches = batches.length;

      for (let roundStart = 0; roundStart < totalBatches; roundStart += this.backfillParallelBatches) {
        if (signal?.aborted) return;

        const batchPromises = batches
          .slice(roundStart, roundStart + this.backfillParallelBatches)
          .map(batch => this.fetchBlockBatch(batch, signal));

        const batchResults = await Promise.all(batchPromises);
        for (const result of batchResults) {
          allBlocks.push(...result);
        }

        const completedBatches = Math.min(roundStart + this.backfillParallelBatches, totalBatches);
        const progress = Math.round((completedBatches / totalBatches) * 100);
        console.log(`[MegaETHPolling] ${completedBatches}/${totalBatches} batches complete (${progress}%)`);
      }

      if (signal?.aborted) return;

      // Sort by block number ascending for block time calculation
      const sortedAsc = [...allBlocks].sort((a, b) => a.blockNumber - b.blockNumber);

      // Build block map and calculate block times
      for (let i = 0; i < sortedAsc.length; i++) {
        const block = sortedAsc[i];
        this.blockMap.set(block.blockNumber, { block, addedAt: Date.now() });

        // Calculate block time from previous block
        if (i > 0) {
          const prevBlock = sortedAsc[i - 1];
          const blockTime = block.timestamp - prevBlock.timestamp;
          if (blockTime > 0 && blockTime < 10000) {
            block.blockTime = blockTime;
            this.blockTimesHistory.push(blockTime);
          }
        }
      }

      // Keep only last 50 block times
      this.blockTimesHistory = this.blockTimesHistory.slice(-50);

      // Store sorted descending (newest first)
      this.recentBlocks = [...sortedAsc].reverse().slice(0, this.maxBlocks);
      this.lastBlockNumber = currentHeight;
      this.connected = true;

      // Calculate initial TPS
      const initialTps = this.calculateTPS();

      // Initialize TPS history with initial value
      for (let i = 0; i < this.tpsHistory['capacity']; i++) {
        this.tpsHistory.push({
          timestamp: Date.now(),
          tps: initialTps,
          blockNumber: currentHeight,
        });
      }

      const avgBlockTime = this.calculateAvgBlockTime();
      console.log(`[MegaETHPolling] Backfill complete! ${allBlocks.length} blocks, TPS: ${initialTps}, Avg block time: ${avgBlockTime}ms`);

      // Notify init handlers
      this.initHandlers.forEach(h => h(this.recentBlocks));

      // Emit initial metrics
      this.emitMetrics();

    } catch (e) {
      if (signal?.aborted) return;
      console.error('[MegaETHPolling] Backfill error:', e);
    } finally {
      this.isBackfilling = false;
    }
  }

  /**
   * Fetch a batch of blocks in parallel
   */
  private async fetchBlockBatch(blockNumbers: number[], signal?: AbortSignal): Promise<MegaBlock[]> {
    const results = await Promise.allSettled(
      blockNumbers.map(num => this.fetchBlock(num, signal))
    );

    return results
      .filter((r): r is PromiseFulfilledResult<MegaBlock | null> =>
        r.status === 'fulfilled' && r.value !== null
      )
      .map(r => r.value!);
  }

  // ===========================================================================
  // POLLING
  // ===========================================================================

  /**
   * Start continuous polling at 100ms
   */
  private startPolling(): void {
    if (this.pollIntervalId !== null) return;

    this.pollIntervalId = setInterval(() => {
      if (!this.isVisible) return; // Skip when off-screen
      this.poll();
    }, this.pollInterval);

    // Immediate first poll
    this.poll();
  }

  /**
   * Single poll iteration - fetch up to 20 new blocks
   */
  private async poll(): Promise<void> {
    if (this.isPolling) return;
    this.isPolling = true;

    const signal = this.abortController?.signal;

    try {
      this.pollCount++;

      // Fetch latest block number
      const currentHeight = await this.fetchBlockNumber(signal);
      if (currentHeight === null) {
        this.connected = false;
        return;
      }

      // Check for new blocks
      const blocksToFetch = Math.min(
        this.maxBlocksPerPoll,
        currentHeight - this.lastBlockNumber
      );

      if (blocksToFetch > 0) {
        // Generate block numbers to fetch
        const blockNumbers = Array.from(
          { length: blocksToFetch },
          (_, i) => currentHeight - i
        ).filter(n => n > this.lastBlockNumber);

        // Fetch in parallel
        const results = await Promise.allSettled(
          blockNumbers.map(num => this.fetchBlock(num, signal))
        );

        // Process new blocks
        const newBlocks: MegaBlock[] = [];
        for (const result of results) {
          if (result.status === 'fulfilled' && result.value !== null) {
            const block = result.value;

            // Calculate block time using Map (O(1) lookup)
            const prevBlock = this.blockMap.get(block.blockNumber - 1)?.block;
            if (prevBlock && prevBlock.timestamp > 0) {
              const blockTime = block.timestamp - prevBlock.timestamp;
              if (blockTime > 0 && blockTime < 10000) {
                block.blockTime = blockTime;
                this.blockTimesHistory = [blockTime, ...this.blockTimesHistory].slice(0, 50);
              }
            }

            // Add to block map
            this.blockMap.set(block.blockNumber, { block, addedAt: Date.now() });
            newBlocks.push(block);

            // Notify block handlers
            this.blockHandlers.forEach(h => h(block));
          }
        }

        // Update recent blocks (prepend new, keep max)
        newBlocks.sort((a, b) => b.blockNumber - a.blockNumber);
        this.recentBlocks = [...newBlocks, ...this.recentBlocks].slice(0, this.maxBlocks);
        this.lastBlockNumber = currentHeight;

        // Prune old blocks from map
        this.pruneBlockMap();
      }

      this.connected = true;

      // Calculate and emit metrics
      const tps = this.calculateTPS();
      this.tpsHistory.push({
        timestamp: Date.now(),
        tps,
        blockNumber: this.lastBlockNumber,
      });

      this.emitMetrics();

    } catch (e) {
      if (signal?.aborted) return;
      console.error('[MegaETHPolling] Poll error:', e);
      this.connected = false;
    } finally {
      this.isPolling = false;
    }
  }

  // ===========================================================================
  // TPS CALCULATION
  // ===========================================================================

  /**
   * Calculate TPS over 30-second rolling window
   * Aptos pattern: sum transactions in window / time span
   */
  private calculateTPS(): number {
    if (this.recentBlocks.length < 2) return 0;

    const now = Date.now();
    const windowStart = now - this.tpsWindowMs;

    // Filter blocks within window
    const windowBlocks = this.recentBlocks.filter(b => b.timestamp >= windowStart);
    if (windowBlocks.length < 2) return 0;

    // Sum transactions
    const totalTx = windowBlocks.reduce((sum, b) => sum + b.txCount, 0);

    // Calculate actual time span
    const newestTimestamp = windowBlocks[0].timestamp;
    const oldestTimestamp = windowBlocks[windowBlocks.length - 1].timestamp;
    const actualWindowSec = (newestTimestamp - oldestTimestamp) / 1000;

    if (actualWindowSec < 1) return 0;

    // TPS = total transactions / 30 seconds (full window, like Aptos Explorer)
    const tps = Math.round(totalTx / (this.tpsWindowMs / 1000));

    // Update peak (filter out unrealistic spikes)
    if (tps > 0 && tps < 100000 && tps > this.peakTps) {
      this.peakTps = tps;
    }

    return tps > 100000 ? 0 : tps;
  }

  /**
   * Calculate average block time over last 20 blocks
   */
  private calculateAvgBlockTime(): number {
    if (this.blockTimesHistory.length === 0) return 0;
    const recent = this.blockTimesHistory.slice(0, 20);
    return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
  }

  // ===========================================================================
  // METRICS
  // ===========================================================================

  /**
   * Emit aggregated metrics to subscribers
   */
  private emitMetrics(): void {
    const latestTpsPoint = this.tpsHistory.get(this.tpsHistory.size - 1);
    const tps = latestTpsPoint?.tps ?? 0;
    const avgBlockTime = this.calculateAvgBlockTime();

    const metrics: MegaMetrics = {
      blockHeight: this.lastBlockNumber,
      tps,
      peakTps: this.peakTps,
      avgBlockTime,
      e2eLatency: avgBlockTime * 5, // Derived: 5x avg block time (Raptr 4-hop)
      latencyP50: 0, // Filled by LatencyTracker
      latencyP95: 0, // Filled by LatencyTracker
      connected: this.connected,
      isBackfilling: this.isBackfilling,
      timestamp: Date.now(),
      pollCount: this.pollCount,
    };

    this.metricsHandlers.forEach(h => h(metrics));
  }

  // ===========================================================================
  // BLOCK MAP MANAGEMENT
  // ===========================================================================

  /**
   * Prune old entries from block map to prevent memory bloat
   */
  private pruneBlockMap(): void {
    if (this.blockMap.size <= this.maxBlocks * 2) return;

    const cutoff = this.lastBlockNumber - this.maxBlocks;
    for (const [blockNum] of this.blockMap) {
      if (blockNum < cutoff) {
        this.blockMap.delete(blockNum);
      }
    }
  }

  // ===========================================================================
  // RPC METHODS
  // ===========================================================================

  /**
   * Fetch current block number
   */
  private async fetchBlockNumber(signal?: AbortSignal): Promise<number | null> {
    try {
      const result = await this.rpcCall('eth_blockNumber', [], this.rpcUrl, signal);
      return result !== null ? parseInt(result, 16) : null;
    } catch {
      // Try fallback
      try {
        const result = await this.rpcCall('eth_blockNumber', [], this.fallbackUrl, signal);
        return result !== null ? parseInt(result, 16) : null;
      } catch {
        return null;
      }
    }
  }

  /**
   * Fetch a single block by number
   */
  private async fetchBlock(blockNumber: number, signal?: AbortSignal): Promise<MegaBlock | null> {
    const hex = '0x' + blockNumber.toString(16);
    try {
      const result = await this.rpcCall('eth_getBlockByNumber', [hex, false], this.rpcUrl, signal);
      return result ? this.transformBlock(result) : null;
    } catch {
      // Try fallback
      try {
        const result = await this.rpcCall('eth_getBlockByNumber', [hex, false], this.fallbackUrl, signal);
        return result ? this.transformBlock(result) : null;
      } catch {
        return null;
      }
    }
  }

  /**
   * Make JSON-RPC call with timeout
   */
  private async rpcCall(
    method: string,
    params: unknown[],
    url: string,
    signal?: AbortSignal
  ): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.fetchTimeout);

    // Combine signals
    const combinedSignal = signal
      ? this.combineAbortSignals(signal, controller.signal)
      : controller.signal;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method,
          params,
        }),
        signal: combinedSignal,
        cache: 'no-store',
      });

      if (!response.ok) {
        throw new Error(`RPC error: ${response.status}`);
      }

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error.message);
      }

      return data.result;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Combine multiple abort signals into one
   */
  private combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
    const controller = new AbortController();
    for (const signal of signals) {
      if (signal.aborted) {
        controller.abort();
        break;
      }
      signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
    return controller.signal;
  }

  /**
   * Transform raw block data to MegaBlock format
   */
  private transformBlock(raw: RawBlock): MegaBlock {
    const txCount = Array.isArray(raw.transactions)
      ? raw.transactions.length
      : 0;

    return {
      blockNumber: parseInt(raw.number, 16),
      timestamp: parseInt(raw.timestamp, 16) * 1000, // Convert to ms
      txCount,
    };
  }
}
