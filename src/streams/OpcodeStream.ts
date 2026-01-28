/**
 * OpcodeStream - Fetches and aggregates opcode-level trace data
 * Uses debug_traceTransaction with default (structLog) tracer
 * for detailed opcode breakdown
 */

export interface OpcodeEntry {
  op: string;
  gas: number;
  gasCost: number;
  depth: number;
  pc: number;
}

export interface OpcodeCategory {
  name: string;
  description: string;
  color: string;
  gasUsed: number;
  percent: number;
  count: number;
  opcodes: string[];
}

export interface OpcodeBreakdown {
  txHash: string;
  categories: OpcodeCategory[];
  topOpcodes: Array<{ op: string; gasUsed: number; count: number; percent: number }>;
  totalGas: number;
  opcodeCount: number;
  timestamp: number;
}

/**
 * Opcode category definitions
 */
const OPCODE_CATEGORIES: Record<string, { name: string; description: string; color: string; opcodes: string[] }> = {
  storage: {
    name: 'Storage',
    description: 'Reading/writing contract storage',
    color: '#EF4444', // Red
    opcodes: ['SLOAD', 'SSTORE', 'TLOAD', 'TSTORE'],
  },
  calls: {
    name: 'External Calls',
    description: 'Calling other contracts',
    color: '#F59E0B', // Amber
    opcodes: ['CALL', 'DELEGATECALL', 'STATICCALL', 'CALLCODE', 'CREATE', 'CREATE2', 'SELFDESTRUCT'],
  },
  memory: {
    name: 'Memory',
    description: 'Memory read/write operations',
    color: '#3B82F6', // Blue
    opcodes: ['MLOAD', 'MSTORE', 'MSTORE8', 'MSIZE', 'MCOPY'],
  },
  stack: {
    name: 'Stack',
    description: 'Stack manipulation',
    color: '#8B5CF6', // Purple
    opcodes: [
      'POP', 'DUP1', 'DUP2', 'DUP3', 'DUP4', 'DUP5', 'DUP6', 'DUP7', 'DUP8',
      'DUP9', 'DUP10', 'DUP11', 'DUP12', 'DUP13', 'DUP14', 'DUP15', 'DUP16',
      'SWAP1', 'SWAP2', 'SWAP3', 'SWAP4', 'SWAP5', 'SWAP6', 'SWAP7', 'SWAP8',
      'SWAP9', 'SWAP10', 'SWAP11', 'SWAP12', 'SWAP13', 'SWAP14', 'SWAP15', 'SWAP16',
    ],
  },
  crypto: {
    name: 'Crypto',
    description: 'Hashing and signature operations',
    color: '#EC4899', // Pink
    opcodes: ['SHA3', 'KECCAK256'],
  },
  arithmetic: {
    name: 'Arithmetic',
    description: 'Math and comparison operations',
    color: '#10B981', // Emerald
    opcodes: [
      'ADD', 'SUB', 'MUL', 'DIV', 'SDIV', 'MOD', 'SMOD', 'ADDMOD', 'MULMOD', 'EXP', 'SIGNEXTEND',
      'LT', 'GT', 'SLT', 'SGT', 'EQ', 'ISZERO', 'AND', 'OR', 'XOR', 'NOT', 'BYTE', 'SHL', 'SHR', 'SAR',
    ],
  },
  environment: {
    name: 'Environment',
    description: 'Block and transaction data',
    color: '#6366F1', // Indigo
    opcodes: [
      'ADDRESS', 'BALANCE', 'ORIGIN', 'CALLER', 'CALLVALUE', 'CALLDATALOAD', 'CALLDATASIZE',
      'CALLDATACOPY', 'CODESIZE', 'CODECOPY', 'GASPRICE', 'EXTCODESIZE', 'EXTCODECOPY',
      'RETURNDATASIZE', 'RETURNDATACOPY', 'EXTCODEHASH', 'BLOCKHASH', 'COINBASE', 'TIMESTAMP',
      'NUMBER', 'PREVRANDAO', 'GASLIMIT', 'CHAINID', 'SELFBALANCE', 'BASEFEE', 'BLOBHASH', 'BLOBBASEFEE',
    ],
  },
  control: {
    name: 'Control Flow',
    description: 'Jumps, returns, and reverts',
    color: '#14B8A6', // Teal
    opcodes: ['STOP', 'JUMP', 'JUMPI', 'PC', 'GAS', 'JUMPDEST', 'RETURN', 'REVERT', 'INVALID'],
  },
  log: {
    name: 'Logging',
    description: 'Event emission',
    color: '#A855F7', // Violet
    opcodes: ['LOG0', 'LOG1', 'LOG2', 'LOG3', 'LOG4'],
  },
  push: {
    name: 'Push Constants',
    description: 'Pushing values to stack',
    color: '#6B7280', // Gray
    opcodes: [
      'PUSH0', 'PUSH1', 'PUSH2', 'PUSH3', 'PUSH4', 'PUSH5', 'PUSH6', 'PUSH7', 'PUSH8',
      'PUSH9', 'PUSH10', 'PUSH11', 'PUSH12', 'PUSH13', 'PUSH14', 'PUSH15', 'PUSH16',
      'PUSH17', 'PUSH18', 'PUSH19', 'PUSH20', 'PUSH21', 'PUSH22', 'PUSH23', 'PUSH24',
      'PUSH25', 'PUSH26', 'PUSH27', 'PUSH28', 'PUSH29', 'PUSH30', 'PUSH31', 'PUSH32',
    ],
  },
};

export interface OpcodeStreamOptions {
  rpcUrl: string;
  cacheSize?: number;
}

export class OpcodeStream {
  private rpcUrl: string;
  private cache = new Map<string, OpcodeBreakdown>();
  private cacheOrder: string[] = [];
  private cacheSize: number;
  private pendingRequests = new Map<string, Promise<OpcodeBreakdown | null>>();

  constructor(options: OpcodeStreamOptions) {
    this.rpcUrl = options.rpcUrl;
    this.cacheSize = options.cacheSize ?? 20;
  }

  /**
   * Get opcode breakdown for a transaction (with caching and deduplication)
   */
  async getOpcodeBreakdown(txHash: string): Promise<OpcodeBreakdown | null> {
    // Check cache
    if (this.cache.has(txHash)) {
      return this.cache.get(txHash)!;
    }

    // Deduplicate concurrent requests
    if (this.pendingRequests.has(txHash)) {
      return this.pendingRequests.get(txHash)!;
    }

    const promise = this.fetchOpcodeBreakdown(txHash);
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

  private async fetchOpcodeBreakdown(txHash: string): Promise<OpcodeBreakdown | null> {
    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'debug_traceTransaction',
          params: [txHash, { disableStorage: true, disableMemory: true, disableStack: true }],
        }),
      });

      if (!response.ok) {
        console.error('[OpcodeStream] HTTP error:', response.status);
        return null;
      }

      const json = await response.json();
      if (json.error) {
        console.error('[OpcodeStream] RPC error:', json.error);
        return null;
      }

      return this.processStructLog(txHash, json.result.structLogs || []);
    } catch (e) {
      console.error('[OpcodeStream] Fetch error:', e);
      return null;
    }
  }

  private processStructLog(
    txHash: string,
    structLogs: Array<{ op: string; gas: number; gasCost: number; depth: number; pc: number }>
  ): OpcodeBreakdown {
    // Aggregate gas by opcode
    const opcodeGas = new Map<string, { gasUsed: number; count: number }>();
    let totalGas = 0;

    for (const log of structLogs) {
      const existing = opcodeGas.get(log.op) || { gasUsed: 0, count: 0 };
      existing.gasUsed += log.gasCost;
      existing.count += 1;
      opcodeGas.set(log.op, existing);
      totalGas += log.gasCost;
    }

    // Build category breakdown
    const categoryGas = new Map<string, { gasUsed: number; count: number; opcodes: Set<string> }>();

    for (const [op, stats] of opcodeGas) {
      const categoryKey = this.getCategoryForOpcode(op);
      const existing = categoryGas.get(categoryKey) || { gasUsed: 0, count: 0, opcodes: new Set() };
      existing.gasUsed += stats.gasUsed;
      existing.count += stats.count;
      existing.opcodes.add(op);
      categoryGas.set(categoryKey, existing);
    }

    // Build categories array
    const categories: OpcodeCategory[] = [];
    for (const [key, stats] of categoryGas) {
      const categoryDef = OPCODE_CATEGORIES[key] || {
        name: 'Other',
        description: 'Miscellaneous operations',
        color: '#6B7280',
        opcodes: [],
      };

      categories.push({
        name: categoryDef.name,
        description: categoryDef.description,
        color: categoryDef.color,
        gasUsed: stats.gasUsed,
        percent: totalGas > 0 ? (stats.gasUsed / totalGas) * 100 : 0,
        count: stats.count,
        opcodes: Array.from(stats.opcodes),
      });
    }

    // Sort by gas used descending
    categories.sort((a, b) => b.gasUsed - a.gasUsed);

    // Build top opcodes list
    const topOpcodes = Array.from(opcodeGas.entries())
      .map(([op, stats]) => ({
        op,
        gasUsed: stats.gasUsed,
        count: stats.count,
        percent: totalGas > 0 ? (stats.gasUsed / totalGas) * 100 : 0,
      }))
      .sort((a, b) => b.gasUsed - a.gasUsed)
      .slice(0, 10);

    return {
      txHash,
      categories,
      topOpcodes,
      totalGas,
      opcodeCount: structLogs.length,
      timestamp: Date.now(),
    };
  }

  private getCategoryForOpcode(op: string): string {
    for (const [key, category] of Object.entries(OPCODE_CATEGORIES)) {
      if (category.opcodes.includes(op)) {
        return key;
      }
    }
    return 'other';
  }

  private addToCache(txHash: string, result: OpcodeBreakdown): void {
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
   * Check if a breakdown is cached
   */
  isCached(txHash: string): boolean {
    return this.cache.has(txHash);
  }
}
