import type { ContractType } from './types';

/**
 * Function selector patterns for contract type classification
 */
const FUNCTION_PATTERNS: Array<{ selector: string; type: ContractType; name?: string }> = [
  // DEX patterns (Uniswap, SushiSwap, etc.)
  { selector: '0x38ed1739', type: 'dex', name: 'swapExactTokensForTokens' },
  { selector: '0x7ff36ab5', type: 'dex', name: 'swapExactETHForTokens' },
  { selector: '0x18cbafe5', type: 'dex', name: 'swapExactTokensForETH' },
  { selector: '0xfb3bdb41', type: 'dex', name: 'swapETHForExactTokens' },
  { selector: '0x8803dbee', type: 'dex', name: 'swapTokensForExactTokens' },
  { selector: '0x5c11d795', type: 'dex', name: 'swapExactTokensForTokensSupportingFee' },
  { selector: '0x791ac947', type: 'dex', name: 'swapExactTokensForETHSupportingFee' },
  { selector: '0x128acb08', type: 'dex', name: 'swap' },
  { selector: '0x022c0d9f', type: 'dex', name: 'swap' },
  { selector: '0x6a627842', type: 'dex', name: 'mint' },
  { selector: '0x89afcb44', type: 'dex', name: 'burn' },
  { selector: '0x3593564c', type: 'dex', name: 'execute' },
  { selector: '0x5ae401dc', type: 'dex', name: 'multicall' },
  { selector: '0xac9650d8', type: 'dex', name: 'multicall' },
  { selector: '0x04e45aaf', type: 'dex', name: 'exactInputSingle' },
  { selector: '0xc04b8d59', type: 'dex', name: 'exactInput' },
  { selector: '0x5023b4df', type: 'dex', name: 'exactOutputSingle' },
  { selector: '0xf28c0498', type: 'dex', name: 'exactOutput' },
  { selector: '0xe449022e', type: 'dex', name: 'uniswapV3Swap' },
  { selector: '0x0502b1c5', type: 'dex', name: 'unoswap' },
  { selector: '0x2e95b6c8', type: 'dex', name: 'unoswap' },
  { selector: '0xbc80f1a8', type: 'dex', name: 'fillOtcOrderForEth' },
  { selector: '0xd9627aa4', type: 'dex', name: 'sellToUniswap' },
  { selector: '0x415565b0', type: 'dex', name: 'transformERC20' },
  { selector: '0xfff6cae9', type: 'dex', name: 'sync' },
  { selector: '0xbc25cf77', type: 'dex', name: 'skim' },

  // NFT patterns (ERC721, ERC1155)
  { selector: '0x42842e0e', type: 'nft', name: 'safeTransferFrom' },
  { selector: '0xb88d4fde', type: 'nft', name: 'safeTransferFrom' },
  { selector: '0xa22cb465', type: 'nft', name: 'setApprovalForAll' },
  { selector: '0x40c10f19', type: 'nft', name: 'mint' },
  { selector: '0xa0712d68', type: 'nft', name: 'mint' },
  { selector: '0x1249c58b', type: 'nft', name: 'mint' },
  { selector: '0x6352211e', type: 'nft', name: 'ownerOf' },
  { selector: '0x70a08231', type: 'token', name: 'balanceOf' },
  { selector: '0xe985e9c5', type: 'nft', name: 'isApprovedForAll' },
  { selector: '0x081812fc', type: 'nft', name: 'getApproved' },
  { selector: '0xf242432a', type: 'nft', name: 'safeTransferFrom (ERC1155)' },
  { selector: '0x2eb2c2d6', type: 'nft', name: 'safeBatchTransferFrom' },

  // Token patterns (ERC20)
  { selector: '0xa9059cbb', type: 'token', name: 'transfer' },
  { selector: '0x23b872dd', type: 'token', name: 'transferFrom' },
  { selector: '0x095ea7b3', type: 'token', name: 'approve' },
  { selector: '0xdd62ed3e', type: 'token', name: 'allowance' },
  { selector: '0x18160ddd', type: 'token', name: 'totalSupply' },
  { selector: '0x313ce567', type: 'token', name: 'decimals' },
  { selector: '0x06fdde03', type: 'token', name: 'name' },
  { selector: '0x95d89b41', type: 'token', name: 'symbol' },
  { selector: '0xd505accf', type: 'token', name: 'permit' },
  { selector: '0x2e1a7d4d', type: 'token', name: 'withdraw' },
  { selector: '0xd0e30db0', type: 'token', name: 'deposit' },

  // Bridge patterns
  { selector: '0x9c307de6', type: 'bridge', name: 'bridgeAsset' },
  { selector: '0x0f5287b0', type: 'bridge', name: 'depositFor' },
  { selector: '0xe9e05c42', type: 'bridge', name: 'depositTransaction' },
  { selector: '0x8b7bfd70', type: 'bridge', name: 'sendMessage' },
  { selector: '0xcb2dce16', type: 'bridge', name: 'relayMessage' },
  { selector: '0x32b7006d', type: 'bridge', name: 'bridgeToken' },

  // Lending patterns (Aave, Compound)
  { selector: '0x617ba037', type: 'lending', name: 'supply' },
  { selector: '0xa415bcad', type: 'lending', name: 'borrow' },
  { selector: '0x573ade81', type: 'lending', name: 'repay' },
  { selector: '0x69328dec', type: 'lending', name: 'withdraw' },
  { selector: '0xe8eda9df', type: 'lending', name: 'deposit' },
  { selector: '0xab9c4b5d', type: 'lending', name: 'flashLoan' },
  { selector: '0xc37b8b80', type: 'lending', name: 'flashLoan' },
  { selector: '0x0c53c51c', type: 'lending', name: 'executeMetaTransaction' },
  { selector: '0xc5ebeaec', type: 'lending', name: 'borrow' },
  { selector: '0x0e752702', type: 'lending', name: 'repayBorrow' },
  { selector: '0x1a0b287e', type: 'lending', name: 'liquidateBorrow' },
  { selector: '0xa0712d68', type: 'lending', name: 'mint' },
  { selector: '0xdb006a75', type: 'lending', name: 'redeem' },
  { selector: '0x852a12e3', type: 'lending', name: 'redeemUnderlying' },

  // Stablecoin patterns
  { selector: '0x40c10f19', type: 'stablecoin', name: 'mint' },
  { selector: '0x42966c68', type: 'stablecoin', name: 'burn' },
  { selector: '0x9dc29fac', type: 'stablecoin', name: 'burn' },

  // Oracle patterns (Chainlink)
  { selector: '0x50d25bcd', type: 'oracle', name: 'latestAnswer' },
  { selector: '0xfeaf968c', type: 'oracle', name: 'latestRoundData' },
  { selector: '0x9a6fc8f5', type: 'oracle', name: 'getRoundData' },
  { selector: '0x8205bf6a', type: 'oracle', name: 'latestTimestamp' },
  { selector: '0xb5ab58dc', type: 'oracle', name: 'getAnswer' },
  { selector: '0xb633620c', type: 'oracle', name: 'getTimestamp' },

  // Governance patterns
  { selector: '0xda95691a', type: 'governance', name: 'propose' },
  { selector: '0x56781388', type: 'governance', name: 'castVote' },
  { selector: '0x2656227d', type: 'governance', name: 'execute' },
  { selector: '0x5c19a95c', type: 'governance', name: 'delegate' },
  { selector: '0x160cbed7', type: 'governance', name: 'queue' },
  { selector: '0x43859632', type: 'governance', name: 'castVoteWithReason' },
  { selector: '0x3bccf4fd', type: 'governance', name: 'castVoteBySig' },

  // Proxy patterns
  { selector: '0x3659cfe6', type: 'proxy', name: 'upgradeTo' },
  { selector: '0x4f1ef286', type: 'proxy', name: 'upgradeToAndCall' },
  { selector: '0xf851a440', type: 'proxy', name: 'admin' },
  { selector: '0x5c60da1b', type: 'proxy', name: 'implementation' },
  { selector: '0x8f283970', type: 'proxy', name: 'changeAdmin' },

  // Common utility patterns
  { selector: '0x00000000', type: 'unknown', name: '(fallback)' },
  { selector: '0x8da5cb5b', type: 'unknown', name: 'owner' },
  { selector: '0x715018a6', type: 'unknown', name: 'renounceOwnership' },
  { selector: '0xf2fde38b', type: 'unknown', name: 'transferOwnership' },
  { selector: '0x01ffc9a7', type: 'unknown', name: 'supportsInterface' },
  { selector: '0x150b7a02', type: 'unknown', name: 'onERC721Received' },
  { selector: '0xf23a6e61', type: 'unknown', name: 'onERC1155Received' },
  { selector: '0xbc197c81', type: 'unknown', name: 'onERC1155BatchReceived' },
];

/**
 * Classify contracts by function selector and known addresses
 */
export class ContractClassifier {
  private selectorMap = new Map<string, { type: ContractType; name?: string }>();
  private knownContracts = new Map<string, ContractType>();
  private cache = new Map<string, { type: ContractType; name?: string }>();

  constructor(knownContracts?: Record<string, ContractType>) {
    // Build selector lookup map
    for (const pattern of FUNCTION_PATTERNS) {
      this.selectorMap.set(pattern.selector.toLowerCase(), {
        type: pattern.type,
        name: pattern.name,
      });
    }

    // Add known contracts
    if (knownContracts) {
      for (const [addr, type] of Object.entries(knownContracts)) {
        this.knownContracts.set(addr.toLowerCase(), type);
      }
    }
  }

  /**
   * Classify a contract call
   */
  classify(address: string, calldata: string): { type: ContractType; name?: string } {
    const lowerAddr = address.toLowerCase();
    const selector = calldata.slice(0, 10).toLowerCase();
    const cacheKey = lowerAddr + selector;

    // Check cache
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    // Check known contracts first
    if (this.knownContracts.has(lowerAddr)) {
      const result = { type: this.knownContracts.get(lowerAddr)! };
      this.cache.set(cacheKey, result);
      return result;
    }

    // Match function selector
    const matched = this.selectorMap.get(selector);
    if (matched) {
      this.cache.set(cacheKey, matched);
      return matched;
    }

    // Unknown
    const result = { type: 'unknown' as ContractType };
    this.cache.set(cacheKey, result);
    return result;
  }

  /**
   * Get function name from selector (returns formatted selector if unknown)
   */
  getFunctionName(calldata: string): string {
    if (!calldata || calldata.length < 10) {
      return '(fallback)';
    }
    const selector = calldata.slice(0, 10).toLowerCase();
    const matched = this.selectorMap.get(selector);
    if (matched?.name) {
      return matched.name;
    }
    // Return formatted selector for unknown functions
    return selector;
  }

  /**
   * Add a known contract address
   */
  addKnownContract(address: string, type: ContractType): void {
    this.knownContracts.set(address.toLowerCase(), type);
    // Clear cache entries for this address
    for (const key of this.cache.keys()) {
      if (key.startsWith(address.toLowerCase())) {
        this.cache.delete(key);
      }
    }
  }
}

/**
 * Singleton instance
 */
export const defaultClassifier = new ContractClassifier();
