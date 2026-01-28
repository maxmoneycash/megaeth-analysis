/**
 * GasAnalytics - Tracks gas consumption patterns over multiple time windows
 * Provides per-contract and per-function gas breakdowns
 */

export interface FunctionGasStats {
  selector: string;
  name: string;
  totalGas: number;
  callCount: number;
  avgGas: number;
  percentOfContract: number;
}

export interface ContractGasStats {
  address: string;
  totalGas: number;
  txCount: number;
  avgGasPerTx: number;
  percentOfTotal: number;
  functionBreakdown: FunctionGasStats[];
  firstSeen: number;
  lastSeen: number;
}

export interface TimeWindowStats {
  windowMs: number;
  windowLabel: string;
  totalGas: number;
  totalTxCount: number;
  contracts: ContractGasStats[];
  topFunctions: FunctionGasStats[];
}

interface GasEntry {
  timestamp: number;
  contractAddress: string;
  functionSelector: string;
  functionName: string;
  gasUsed: number;
  txHash: string;
}

// Time windows
const WINDOWS = {
  '1m': 60 * 1000,
  '1h': 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
};

export class GasAnalytics {
  private entries: GasEntry[] = [];
  private maxEntries = 100000; // Limit memory usage
  private functionNames = new Map<string, string>();

  constructor() {
    // Common function selectors
    this.initFunctionNames();
  }

  private initFunctionNames(): void {
    const names: Record<string, string> = {
      '0xa9059cbb': 'transfer',
      '0x23b872dd': 'transferFrom',
      '0x095ea7b3': 'approve',
      '0x38ed1739': 'swapExactTokensForTokens',
      '0x7ff36ab5': 'swapExactETHForTokens',
      '0x18cbafe5': 'swapExactTokensForETH',
      '0x3593564c': 'execute',
      '0x5ae401dc': 'multicall',
      '0x313ce567': 'decimals',
      '0xfeaf968c': 'latestRoundData',
      '0x70a08231': 'balanceOf',
      '0xdd62ed3e': 'allowance',
      '0x06fdde03': 'name',
      '0x95d89b41': 'symbol',
      '0x18160ddd': 'totalSupply',
      '0xd505accf': 'permit',
      '0x2e1a7d4d': 'withdraw',
      '0xd0e30db0': 'deposit',
      '0x022c0d9f': 'swap',
      '0x128acb08': 'swap (v3)',
      '0x0902f1ac': 'getReserves',
      '0x1698ee82': 'getPool',
      '0xc45a0155': 'factory',
      '0x0dfe1681': 'token0',
      '0xd21220a7': 'token1',
      '0x3850c7bd': 'slot0',
    };
    for (const [sel, name] of Object.entries(names)) {
      this.functionNames.set(sel.toLowerCase(), name);
    }
  }

  /**
   * Record a gas entry from a transaction
   */
  recordGas(
    contractAddress: string,
    functionSelector: string,
    gasUsed: number,
    txHash: string,
    timestamp?: number
  ): void {
    const entry: GasEntry = {
      timestamp: timestamp ?? Date.now(),
      contractAddress: contractAddress.toLowerCase(),
      functionSelector: functionSelector.toLowerCase(),
      functionName: this.getFunctionName(functionSelector),
      gasUsed,
      txHash,
    };

    this.entries.push(entry);

    // Prune old entries if too many
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries / 2);
    }
  }

  /**
   * Record gas from a trace result
   */
  recordFromTrace(
    trace: { txHash: string; totalGas: number; frames: Array<{
      address: string;
      functionSig: string;
      functionName?: string;
      selfGas: number;
    }> },
    timestamp?: number
  ): void {
    const ts = timestamp ?? Date.now();

    for (const frame of trace.frames) {
      this.recordGas(
        frame.address,
        frame.functionSig,
        frame.selfGas,
        trace.txHash,
        ts
      );

      // Learn function name if we don't have it
      if (frame.functionName && !frame.functionName.startsWith('0x')) {
        this.functionNames.set(frame.functionSig.toLowerCase(), frame.functionName);
      }
    }
  }

  /**
   * Get function name from selector
   */
  getFunctionName(selector: string): string {
    const sel = selector.toLowerCase().slice(0, 10);
    return this.functionNames.get(sel) || sel;
  }

  /**
   * Get stats for a specific time window
   */
  getStats(windowKey: keyof typeof WINDOWS): TimeWindowStats {
    const windowMs = WINDOWS[windowKey];
    const windowLabel = windowKey;
    const cutoff = Date.now() - windowMs;

    // Filter entries to window
    const windowEntries = this.entries.filter(e => e.timestamp >= cutoff);

    // Aggregate by contract
    const contractMap = new Map<string, {
      totalGas: number;
      txHashes: Set<string>;
      functions: Map<string, { gas: number; count: number }>;
      firstSeen: number;
      lastSeen: number;
    }>();

    let totalGas = 0;
    const allTxHashes = new Set<string>();

    for (const entry of windowEntries) {
      totalGas += entry.gasUsed;
      allTxHashes.add(entry.txHash);

      let contract = contractMap.get(entry.contractAddress);
      if (!contract) {
        contract = {
          totalGas: 0,
          txHashes: new Set(),
          functions: new Map(),
          firstSeen: entry.timestamp,
          lastSeen: entry.timestamp,
        };
        contractMap.set(entry.contractAddress, contract);
      }

      contract.totalGas += entry.gasUsed;
      contract.txHashes.add(entry.txHash);
      contract.firstSeen = Math.min(contract.firstSeen, entry.timestamp);
      contract.lastSeen = Math.max(contract.lastSeen, entry.timestamp);

      // Track function breakdown
      const fnKey = entry.functionSelector;
      const fn = contract.functions.get(fnKey) || { gas: 0, count: 0 };
      fn.gas += entry.gasUsed;
      fn.count += 1;
      contract.functions.set(fnKey, fn);
    }

    // Build contract stats
    const contracts: ContractGasStats[] = [];
    for (const [address, data] of contractMap) {
      const functionBreakdown: FunctionGasStats[] = [];
      for (const [selector, fn] of data.functions) {
        functionBreakdown.push({
          selector,
          name: this.getFunctionName(selector),
          totalGas: fn.gas,
          callCount: fn.count,
          avgGas: fn.count > 0 ? Math.round(fn.gas / fn.count) : 0,
          percentOfContract: data.totalGas > 0 ? (fn.gas / data.totalGas) * 100 : 0,
        });
      }
      // Sort by gas desc
      functionBreakdown.sort((a, b) => b.totalGas - a.totalGas);

      contracts.push({
        address,
        totalGas: data.totalGas,
        txCount: data.txHashes.size,
        avgGasPerTx: data.txHashes.size > 0 ? Math.round(data.totalGas / data.txHashes.size) : 0,
        percentOfTotal: totalGas > 0 ? (data.totalGas / totalGas) * 100 : 0,
        functionBreakdown,
        firstSeen: data.firstSeen,
        lastSeen: data.lastSeen,
      });
    }

    // Sort contracts by gas desc
    contracts.sort((a, b) => b.totalGas - a.totalGas);

    // Aggregate top functions across all contracts
    const globalFunctions = new Map<string, { gas: number; count: number }>();
    for (const entry of windowEntries) {
      const key = entry.functionSelector;
      const fn = globalFunctions.get(key) || { gas: 0, count: 0 };
      fn.gas += entry.gasUsed;
      fn.count += 1;
      globalFunctions.set(key, fn);
    }

    const topFunctions: FunctionGasStats[] = [];
    for (const [selector, fn] of globalFunctions) {
      topFunctions.push({
        selector,
        name: this.getFunctionName(selector),
        totalGas: fn.gas,
        callCount: fn.count,
        avgGas: fn.count > 0 ? Math.round(fn.gas / fn.count) : 0,
        percentOfContract: totalGas > 0 ? (fn.gas / totalGas) * 100 : 0,
      });
    }
    topFunctions.sort((a, b) => b.totalGas - a.totalGas);

    return {
      windowMs,
      windowLabel,
      totalGas,
      totalTxCount: allTxHashes.size,
      contracts,
      topFunctions: topFunctions.slice(0, 20),
    };
  }

  /**
   * Get all time window stats
   */
  getAllStats(): Record<keyof typeof WINDOWS, TimeWindowStats> {
    return {
      '1m': this.getStats('1m'),
      '1h': this.getStats('1h'),
      '24h': this.getStats('24h'),
      '7d': this.getStats('7d'),
    };
  }

  /**
   * Get entry count for debugging
   */
  getEntryCount(): number {
    return this.entries.length;
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.entries = [];
  }
}
