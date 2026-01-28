import type { CallTrace, TraceResult, FlameFrame } from '../viz/FlameGraph/types';
import { ContractClassifier } from '../viz/FlameGraph/ContractClassifier';
import { FlameGraphColors } from '../viz/FlameGraph/FlameGraphColors';

export interface TraceStreamOptions {
  rpcUrl: string;
  cacheSize?: number;
}

/**
 * Fetches and caches debug_traceTransaction data
 */
export class TraceStream {
  private rpcUrl: string;
  private cache = new Map<string, TraceResult>();
  private cacheOrder: string[] = [];
  private cacheSize: number;
  private pendingRequests = new Map<string, Promise<TraceResult | null>>();
  private classifier = new ContractClassifier();
  private colors = new FlameGraphColors();

  constructor(options: TraceStreamOptions) {
    this.rpcUrl = options.rpcUrl;
    this.cacheSize = options.cacheSize ?? 50;
  }

  /**
   * Fetch trace for a transaction (with caching and deduplication)
   */
  async getTrace(txHash: string): Promise<TraceResult | null> {
    // Check cache
    if (this.cache.has(txHash)) {
      return this.cache.get(txHash)!;
    }

    // Deduplicate concurrent requests
    if (this.pendingRequests.has(txHash)) {
      return this.pendingRequests.get(txHash)!;
    }

    const promise = this.fetchTrace(txHash);
    this.pendingRequests.set(txHash, promise);

    try {
      const result = await promise;
      if (result) {
        this.addToCache(txHash, result);
      }
      return result;
    } finally {
      this.pendingRequests.delete(txHash);
    }
  }

  private async fetchTrace(txHash: string): Promise<TraceResult | null> {
    try {
      console.log(`[TraceStream] Fetching trace for ${txHash}...`);

      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [txHash, { tracer: 'callTracer' }],
        }),
      });

      if (!response.ok) {
        console.error('[TraceStream] HTTP error:', response.status);
        return null;
      }

      const json = await response.json();
      if (json.error) {
        console.error('[TraceStream] RPC error:', json.error);
        return null;
      }

      // Log the raw call trace structure
      const rootCall = json.result as CallTrace;
      console.log('[TraceStream] Raw trace response:', {
        txHash,
        type: rootCall.type,
        from: rootCall.from,
        to: rootCall.to,
        gasUsed: rootCall.gasUsed,
        hasNestedCalls: !!rootCall.calls,
        nestedCallCount: rootCall.calls?.length || 0,
        error: rootCall.error,
      });

      // Log nested call tree summary
      this.logCallTree(rootCall, 0);

      return this.processTrace(txHash, rootCall);
    } catch (e) {
      console.error('[TraceStream] Fetch error:', e);
      return null;
    }
  }

  /**
   * Log the call tree structure for debugging
   */
  private logCallTree(call: CallTrace, depth: number): void {
    const indent = '  '.repeat(depth);
    const fnSig = (call.input || '0x').slice(0, 10);
    const fnName = this.classifier.getFunctionName(call.input || '0x');
    console.log(
      `${indent}[${depth}] ${call.type} to=${call.to?.slice(0, 10)}... fn=${fnName} (${fnSig}) gas=${call.gasUsed}${call.error ? ' ERROR' : ''}`
    );

    if (call.calls && call.calls.length > 0) {
      for (const child of call.calls) {
        this.logCallTree(child, depth + 1);
      }
    }
  }

  private processTrace(txHash: string, rootCall: CallTrace): TraceResult {
    const frames: FlameFrame[] = [];
    const totalGas = this.calculateTotalGas(rootCall);
    let maxDepth = 0;
    const contracts = new Set<string>();

    // Flatten the call tree into frames
    this.flattenTrace(rootCall, 0, 1, 0, totalGas, frames, contracts, (d) => {
      maxDepth = Math.max(maxDepth, d);
    });

    const result = {
      txHash,
      frames,
      rootCall,
      totalGas,
      maxDepth,
      contractCount: contracts.size,
      timestamp: Date.now(),
    };

    // Log processed result summary
    console.log('[TraceStream] Processed trace:', {
      txHash: txHash.slice(0, 18) + '...',
      totalFrames: frames.length,
      maxDepth,
      totalGas,
      contractCount: contracts.size,
      framesSummary: frames.map(f => ({
        depth: f.depth,
        fn: f.functionName,
        selfGas: f.selfGas,
        gasPercent: f.gasPercent.toFixed(1) + '%',
      })),
    });

    return result;
  }

  private flattenTrace(
    call: CallTrace,
    xStart: number,
    xWidth: number,
    depth: number,
    totalGas: number,
    frames: FlameFrame[],
    contracts: Set<string>,
    updateMaxDepth: (d: number) => void
  ): void {
    updateMaxDepth(depth);

    const gasUsed = parseInt(call.gasUsed, 16) || 0;
    const gasTotal = this.calculateTotalGas(call);
    const frameWidth = totalGas > 0 ? (gasTotal / totalGas) * xWidth : 0;

    const address = call.to || '0x0000000000000000000000000000000000000000';
    contracts.add(address);

    const { type: contractType } = this.classifier.classify(
      address,
      call.input || '0x'
    );
    const functionName = this.classifier.getFunctionName(call.input || '0x');

    // selfGas is gas used by this call only (excluding children)
    const selfGas = gasUsed;
    const selfGasPercent = totalGas > 0 ? (selfGas / totalGas) * 100 : 0;

    const frame: FlameFrame = {
      id: `${address}-${depth}-${xStart.toFixed(6)}`,
      address,
      functionSig: (call.input || '0x').slice(0, 10),
      functionName,
      x: xStart,
      width: frameWidth,
      depth,
      gasUsed,
      gasTotal,
      gasPercent: totalGas > 0 ? (gasTotal / totalGas) * 100 : 0,
      selfGas,
      selfGasPercent,
      contractType,
      callType: call.type,
      hasError: !!call.error,
      pixelX: 0,
      pixelY: 0,
      pixelWidth: 0,
      pixelHeight: 24,
      color: this.colors.getColor(contractType, !!call.error),
      isHovered: false,
      isSelected: false,
    };

    frames.push(frame);

    // Process children
    if (call.calls && call.calls.length > 0) {
      let childX = xStart;
      for (const childCall of call.calls) {
        const childGas = this.calculateTotalGas(childCall);
        const childWidth = totalGas > 0 ? (childGas / totalGas) * xWidth : 0;

        this.flattenTrace(
          childCall,
          childX,
          childWidth,
          depth + 1,
          totalGas,
          frames,
          contracts,
          updateMaxDepth
        );

        childX += childWidth;
      }
    }
  }

  private calculateTotalGas(call: CallTrace): number {
    let total = parseInt(call.gasUsed, 16) || 0;
    if (call.calls) {
      for (const child of call.calls) {
        total += this.calculateTotalGas(child);
      }
    }
    return total;
  }

  private addToCache(txHash: string, result: TraceResult): void {
    // LRU eviction
    if (this.cache.size >= this.cacheSize) {
      const oldest = this.cacheOrder.shift();
      if (oldest) this.cache.delete(oldest);
    }

    this.cache.set(txHash, result);
    this.cacheOrder.push(txHash);
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
    this.cacheOrder = [];
  }

  /**
   * Check if a trace is cached
   */
  isCached(txHash: string): boolean {
    return this.cache.has(txHash);
  }
}
