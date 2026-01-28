import type { ContractType } from './types';

/**
 * Default color scheme for contract types
 */
const DEFAULT_COLORS: Record<ContractType, string> = {
  dex: '#22C55E',        // Green - trading/swaps
  nft: '#A855F7',        // Purple - collectibles
  bridge: '#3B82F6',     // Blue - cross-chain
  lending: '#F59E0B',    // Amber - DeFi lending
  stablecoin: '#10B981', // Teal - stable value
  governance: '#6366F1', // Indigo - voting
  oracle: '#EC4899',     // Pink - data feeds
  token: '#8B5CF6',      // Violet - ERC20
  proxy: '#6B7280',      // Gray - infrastructure
  unknown: '#374151',    // Dark gray - unclassified
};

/**
 * Error state color
 */
const ERROR_COLOR = '#EF4444';

/**
 * Color utilities for flame graph frames
 */
export class FlameGraphColors {
  private colors: Record<ContractType, number>;
  private errorColor: number;

  constructor(overrides?: Partial<Record<ContractType, string>>) {
    const merged = { ...DEFAULT_COLORS, ...overrides };
    this.colors = {} as Record<ContractType, number>;

    for (const [type, hex] of Object.entries(merged)) {
      this.colors[type as ContractType] = this.hexToNumber(hex);
    }

    this.errorColor = this.hexToNumber(ERROR_COLOR);
  }

  /**
   * Get color for a contract type (PixiJS hex number format)
   */
  getColor(type: ContractType, hasError = false): number {
    if (hasError) return this.errorColor;
    return this.colors[type] ?? this.colors.unknown;
  }

  /**
   * Get hex string for a contract type
   */
  getHexColor(type: ContractType, hasError = false): string {
    const color = this.getColor(type, hasError);
    return '#' + color.toString(16).padStart(6, '0');
  }

  /**
   * Get lighter version for hover state
   */
  getLighterColor(type: ContractType, hasError = false): number {
    const base = this.getColor(type, hasError);
    const r = Math.min(255, ((base >> 16) & 0xff) + 40);
    const g = Math.min(255, ((base >> 8) & 0xff) + 40);
    const b = Math.min(255, (base & 0xff) + 40);
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Get darker version for selected state
   */
  getDarkerColor(type: ContractType, hasError = false): number {
    const base = this.getColor(type, hasError);
    const r = Math.max(0, ((base >> 16) & 0xff) - 30);
    const g = Math.max(0, ((base >> 8) & 0xff) - 30);
    const b = Math.max(0, (base & 0xff) - 30);
    return (r << 16) | (g << 8) | b;
  }

  private hexToNumber(hex: string): number {
    return parseInt(hex.replace('#', ''), 16);
  }
}

/**
 * Singleton instance with default colors
 */
export const defaultColors = new FlameGraphColors();
