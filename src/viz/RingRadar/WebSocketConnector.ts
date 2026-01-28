/**
 * WebSocket connector for RingRadar visualization.
 * Connects to MegaViz API and streams real-time block data.
 */
import type { BlockMetrics } from './types';
import type { RingRadar } from './RingRadar';

// API response format (snake_case)
interface ApiBlockMetrics {
  block_number: number;
  block_hash: string;
  timestamp: string;
  tx_count: number;
  total_gas: number;
  compute_gas: number;
  storage_gas: number;
  tx_size: number;
  da_size: number;
  data_size: number;
  kv_updates: number;
  state_growth: number;
  gas_limit: number;
}

interface ApiBlockEvent {
  block: ApiBlockMetrics;
}

export interface WebSocketConnectorOptions {
  url?: string;
  reconnectDelayMs?: number;
  maxReconnectAttempts?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  onBlock?: (block: BlockMetrics) => void;
}

/**
 * Transforms API response (snake_case) to BlockMetrics (camelCase)
 */
function transformBlock(apiBlock: ApiBlockMetrics): BlockMetrics {
  return {
    blockNumber: apiBlock.block_number,
    timestamp: new Date(apiBlock.timestamp).getTime(),
    totalGas: apiBlock.total_gas,
    kvUpdates: apiBlock.kv_updates,
    txSize: apiBlock.tx_size,
    daSize: apiBlock.da_size,
    dataSize: apiBlock.data_size,
    stateGrowth: apiBlock.state_growth,
    txCount: apiBlock.tx_count,
  };
}

export class WebSocketConnector {
  private ws: WebSocket | null = null;
  private radar: RingRadar;
  private options: Required<WebSocketConnectorOptions>;
  private reconnectAttempts = 0;
  private reconnectTimer: number | null = null;
  private isDestroyed = false;

  constructor(radar: RingRadar, options?: WebSocketConnectorOptions) {
    this.radar = radar;
    this.options = {
      url: 'ws://localhost:3001/ws/blocks',
      reconnectDelayMs: 2000,
      maxReconnectAttempts: 10,
      onConnect: () => {},
      onDisconnect: () => {},
      onError: () => {},
      onBlock: () => {},
      ...options,
    };
  }

  /**
   * Start the WebSocket connection
   */
  connect(): void {
    if (this.isDestroyed) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    console.log(`[RingRadar] Connecting to ${this.options.url}...`);
    this.ws = new WebSocket(this.options.url);

    this.ws.onopen = () => {
      console.log('[RingRadar] WebSocket connected');
      this.reconnectAttempts = 0;
      this.options.onConnect();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as ApiBlockEvent;
        const metrics = transformBlock(data.block);

        // Process the block in the radar
        this.radar.processBlock(metrics);
        this.options.onBlock(metrics);
      } catch (error) {
        console.error('[RingRadar] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (event) => {
      console.error('[RingRadar] WebSocket error:', event);
      this.options.onError(event);
    };

    this.ws.onclose = () => {
      console.log('[RingRadar] WebSocket closed');
      this.options.onDisconnect();
      this.scheduleReconnect();
    };
  }

  /**
   * Schedule a reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.isDestroyed) return;
    if (this.reconnectAttempts >= this.options.maxReconnectAttempts) {
      console.log('[RingRadar] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.options.reconnectDelayMs * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`[RingRadar] Reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimer = window.setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Disconnect and stop reconnecting
   */
  disconnect(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.disconnect();
  }

  /**
   * Check if connected
   */
  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
