export type DataHandler<T> = (data: T) => void;
export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface StreamOptions<T = unknown> {
  /** WebSocket URL (optional - polling-first strategy) */
  wsUrl?: string;
  /** Polling URL for fetching data */
  pollUrl?: string;
  /** Polling function for custom fetch logic */
  pollFn?: () => Promise<T | null>;
  /** Polling interval in ms (default: 500) */
  pollInterval?: number;
  /** Enable auto-reconnect (default: true) */
  reconnect?: boolean;
  /** Max backoff delay in ms (default: 5000) */
  maxBackoff?: number;
}

interface StreamState {
  errorCount: number;
  lastSuccessTime: number;
  isPolling: boolean;
}

/**
 * Hybrid data stream with polling + WebSocket support.
 * Uses polling as primary (reliable) with optional WebSocket enhancement.
 * Adapted from aptos-consensus-visualizer patterns.
 */
export class DataStream<T = unknown> {
  private ws: WebSocket | null = null;
  private handlers = new Set<DataHandler<T>>();
  private stateHandlers = new Set<DataHandler<ConnectionState>>();
  private options: Required<Omit<StreamOptions<T>, 'wsUrl' | 'pollUrl' | 'pollFn'>> & StreamOptions<T>;
  private pollIntervalId: number | null = null;
  private reconnectTimeout: number | null = null;
  private state: StreamState = {
    errorCount: 0,
    lastSuccessTime: Date.now(),
    isPolling: false,
  };
  private _connectionState: ConnectionState = 'disconnected';

  constructor(options: StreamOptions<T>) {
    this.options = {
      pollInterval: 500,
      reconnect: true,
      maxBackoff: 5000,
      ...options,
    };
  }

  get connectionState() {
    return this._connectionState;
  }

  private setConnectionState(state: ConnectionState) {
    if (this._connectionState !== state) {
      this._connectionState = state;
      this.stateHandlers.forEach((h) => h(state));
    }
  }

  /** Start streaming data */
  start() {
    // Polling is primary - always start it
    if (this.options.pollFn || this.options.pollUrl) {
      this.startPolling();
    }

    // WebSocket is optional enhancement
    if (this.options.wsUrl) {
      this.connectWebSocket();
    }
  }

  private async poll() {
    if (this.state.isPolling) return;
    this.state.isPolling = true;

    try {
      let data: T | null = null;

      if (this.options.pollFn) {
        data = await this.options.pollFn();
      } else if (this.options.pollUrl) {
        const res = await fetch(this.options.pollUrl, { cache: 'no-store' });
        if (res.ok) {
          data = await res.json();
        }
      }

      if (data !== null) {
        this.emit(data);
        this.state.errorCount = 0;
        this.state.lastSuccessTime = Date.now();
        this.setConnectionState('connected');
      }
    } catch (e) {
      console.error('[DataStream] Poll error:', e);
      this.state.errorCount++;

      if (this.state.errorCount >= 3) {
        this.setConnectionState('error');
      }

      // Exponential backoff
      const backoffMs = Math.min(
        this.state.errorCount * 500,
        this.options.maxBackoff
      );
      await new Promise((r) => setTimeout(r, backoffMs));
    } finally {
      this.state.isPolling = false;
    }
  }

  private startPolling() {
    if (this.pollIntervalId) return;

    this.setConnectionState('connecting');
    this.poll();

    this.pollIntervalId = window.setInterval(
      () => this.poll(),
      this.options.pollInterval
    );
  }

  private stopPolling() {
    if (this.pollIntervalId) {
      clearInterval(this.pollIntervalId);
      this.pollIntervalId = null;
    }
  }

  private connectWebSocket() {
    if (!this.options.wsUrl) return;
    if (this.ws?.readyState === WebSocket.OPEN) return;

    this.ws = new WebSocket(this.options.wsUrl);

    this.ws.onopen = () => {
      console.log('[DataStream] WebSocket connected');
      this.setConnectionState('connected');
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as T;
        this.emit(data);
        this.state.lastSuccessTime = Date.now();
      } catch (e) {
        console.error('[DataStream] Parse error:', e);
      }
    };

    this.ws.onclose = () => {
      console.log('[DataStream] WebSocket disconnected');
      if (this.options.reconnect && !this.pollIntervalId) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = () => {
      console.error('[DataStream] WebSocket error');
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimeout) return;
    const delay = Math.min(this.state.errorCount * 1000, this.options.maxBackoff);
    this.reconnectTimeout = window.setTimeout(() => {
      this.reconnectTimeout = null;
      this.connectWebSocket();
    }, delay);
  }

  private emit(data: T) {
    this.handlers.forEach((handler) => handler(data));
  }

  /** Subscribe to data updates */
  subscribe(handler: DataHandler<T>): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  /** Subscribe to connection state changes */
  onStateChange(handler: DataHandler<ConnectionState>): () => void {
    this.stateHandlers.add(handler);
    return () => this.stateHandlers.delete(handler);
  }

  /** Send data via WebSocket (if connected) */
  send(data: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  /** Stop streaming and cleanup */
  stop() {
    this.stopPolling();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    this.ws?.close();
    this.ws = null;

    this.setConnectionState('disconnected');
  }
}
