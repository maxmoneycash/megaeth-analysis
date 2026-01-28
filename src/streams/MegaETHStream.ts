import { DataStream } from './DataStream';
import type { MiniBlock, MiniBlockTransaction } from '../viz/SpiralHeatmap/types';

export interface MegaETHStreamOptions {
  rpcUrl?: string;
  wsUrl?: string;
  pollInterval?: number;
}

const DEFAULT_RPC = 'https://carrot.megaeth.com/rpc';
const DEFAULT_WS = 'wss://carrot.megaeth.com/wss';
const FALLBACK_RPC = 'https://6342.rpc.thirdweb.com';

/**
 * MegaETH-specific data stream for fetching miniBlocks.
 * Uses WebSocket subscription when available, falls back to polling.
 */
export class MegaETHStream extends DataStream<MiniBlock> {
  private rpcUrl: string;
  private lastBlockNumber = 0;

  constructor(options?: MegaETHStreamOptions) {
    const rpcUrl = options?.rpcUrl ?? DEFAULT_RPC;
    const wsUrl = options?.wsUrl ?? DEFAULT_WS;
    const pollInterval = options?.pollInterval ?? 500;

    super({
      wsUrl,
      pollInterval,
      pollFn: async () => this.fetchLatestBlock(),
      reconnect: true,
      maxBackoff: 5000,
    });

    this.rpcUrl = rpcUrl;
  }

  /**
   * Fetch the latest block via JSON-RPC
   */
  private async fetchLatestBlock(): Promise<MiniBlock | null> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest', true], // true = include full transactions
        }),
        cache: 'no-store',
      });

      if (!response.ok) {
        // Try fallback RPC
        return this.fetchFromFallback();
      }

      const result = await response.json();
      if (!result.result) return null;

      return this.transformBlock(result.result);
    } catch (e) {
      console.error('[MegaETHStream] Fetch error:', e);
      return this.fetchFromFallback();
    }
  }

  private async fetchFromFallback(): Promise<MiniBlock | null> {
    try {
      const response = await fetch(FALLBACK_RPC, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_getBlockByNumber',
          params: ['latest', true],
        }),
        cache: 'no-store',
      });

      if (!response.ok) return null;

      const result = await response.json();
      if (!result.result) return null;

      return this.transformBlock(result.result);
    } catch (e) {
      console.error('[MegaETHStream] Fallback fetch error:', e);
      return null;
    }
  }

  /**
   * Transform raw block data to MiniBlock format
   */
  private transformBlock(rawBlock: RawBlock): MiniBlock | null {
    const blockNumber = parseInt(rawBlock.number, 16);

    // Skip if we've already seen this block
    if (blockNumber <= this.lastBlockNumber) {
      return null;
    }
    this.lastBlockNumber = blockNumber;

    const transactions: MiniBlockTransaction[] = (rawBlock.transactions || [])
      .filter((tx): tx is RawTransaction => typeof tx === 'object')
      .map((tx) => ({
        hash: tx.hash,
        from: tx.from,
        to: tx.to,
        value: tx.value,
        gasUsed: parseInt(tx.gas, 16) || 0,
      }));

    return {
      blockNumber,
      transactions,
      timestamp: parseInt(rawBlock.timestamp, 16) * 1000, // Convert to ms
    };
  }
}

// Raw block types from JSON-RPC
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
