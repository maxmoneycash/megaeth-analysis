import type {
  ContractActivity,
  MiniBlock,
  RecentTransaction,
  TrackerOptions,
} from './types';

const DEFAULT_OPTIONS: TrackerOptions = {
  maxContracts: 100,
  windowMs: 60000, // 1 minute rolling window
  recentTxLimit: 20,
};

/**
 * Tracks contract activity with a sliding time window.
 * Maintains transaction counts and calculates velocity for heat mapping.
 */
export class ContractTracker {
  private contracts = new Map<string, ContractActivity>();
  private txTimestamps = new Map<string, number[]>(); // For sliding window
  private options: TrackerOptions;
  private lastPruneTime = 0;
  private maxVelocity = 1; // Track max for normalization

  constructor(options?: Partial<TrackerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Process incoming miniBlock and update contract activity
   */
  processMiniBlock(block: MiniBlock): void {
    const now = block.timestamp || Date.now();

    for (const tx of block.transactions) {
      // Skip if no 'to' address (contract creation) - we track called contracts
      if (!tx.to) continue;

      const address = tx.to.toLowerCase();
      this.recordTransaction(address, {
        hash: tx.hash,
        from: tx.from,
        timestamp: now,
        value: tx.value,
        gasUsed: tx.gasUsed,
      });
    }

    // Prune old data periodically (every 1 second)
    if (now - this.lastPruneTime > 1000) {
      this.prune(now);
      this.lastPruneTime = now;
    }
  }

  private recordTransaction(address: string, tx: RecentTransaction): void {
    // Get or create contract activity
    let activity = this.contracts.get(address);
    if (!activity) {
      activity = {
        address,
        txCount: 0,
        recentTxs: [],
        velocity: 0,
        rank: 0,
        prevRank: 0,
        lastSeen: tx.timestamp,
        heat: 0,
      };
      this.contracts.set(address, activity);
      this.txTimestamps.set(address, []);
    }

    // Add timestamp for sliding window
    const timestamps = this.txTimestamps.get(address)!;
    timestamps.push(tx.timestamp);

    // Update activity
    activity.txCount = timestamps.length;
    activity.lastSeen = tx.timestamp;

    // Add to recent transactions (keep limited)
    activity.recentTxs.unshift(tx);
    if (activity.recentTxs.length > this.options.recentTxLimit) {
      activity.recentTxs.pop();
    }

    // Recalculate velocity
    this.updateVelocity(address);
  }

  private updateVelocity(address: string): void {
    const activity = this.contracts.get(address);
    const timestamps = this.txTimestamps.get(address);
    if (!activity || !timestamps || timestamps.length === 0) return;

    // Calculate velocity as tx/second over the window
    const windowSeconds = this.options.windowMs / 1000;
    const newVelocity = timestamps.length / windowSeconds;

    // Exponential smoothing to prevent flickering
    const alpha = 0.3;
    activity.velocity = alpha * newVelocity + (1 - alpha) * activity.velocity;

    // Track max velocity for normalization
    if (activity.velocity > this.maxVelocity) {
      this.maxVelocity = activity.velocity;
    }

    // Update heat (normalized 0-1)
    activity.heat = Math.min(1, activity.velocity / Math.max(1, this.maxVelocity));
  }

  /**
   * Remove transactions older than the sliding window
   */
  prune(now: number = Date.now()): void {
    const cutoff = now - this.options.windowMs;

    for (const [address, timestamps] of this.txTimestamps) {
      // Filter to only keep recent timestamps
      const filtered = timestamps.filter((t) => t > cutoff);
      this.txTimestamps.set(address, filtered);

      // Update txCount
      const activity = this.contracts.get(address);
      if (activity) {
        activity.txCount = filtered.length;
        this.updateVelocity(address);

        // Remove inactive contracts
        if (filtered.length === 0) {
          this.contracts.delete(address);
          this.txTimestamps.delete(address);
        }
      }
    }

    // Decay max velocity over time
    this.maxVelocity = Math.max(1, this.maxVelocity * 0.99);
  }

  /**
   * Get top N contracts sorted by transaction count
   */
  getTopContracts(n: number): ContractActivity[] {
    const sorted = Array.from(this.contracts.values())
      .sort((a, b) => b.txCount - a.txCount)
      .slice(0, n);

    // Update ranks
    sorted.forEach((contract, index) => {
      contract.prevRank = contract.rank;
      contract.rank = index + 1;
    });

    return sorted;
  }

  /**
   * Get a specific contract's activity
   */
  getContract(address: string): ContractActivity | undefined {
    return this.contracts.get(address.toLowerCase());
  }

  /**
   * Get total number of tracked contracts
   */
  get size(): number {
    return this.contracts.size;
  }

  /**
   * Clear all tracking data
   */
  clear(): void {
    this.contracts.clear();
    this.txTimestamps.clear();
    this.maxVelocity = 1;
  }
}
