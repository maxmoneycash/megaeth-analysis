/**
 * Types for the Spiral Heatmap visualization
 */

// Transaction from MegaETH miniBlock
export interface MiniBlockTransaction {
  hash: string;
  from: string;
  to: string | null; // null = contract creation
  value: string;
  gasUsed: number;
}

// MegaETH miniBlock data
export interface MiniBlock {
  blockNumber: number;
  transactions: MiniBlockTransaction[];
  timestamp: number;
}

// Recent transaction for detail view
export interface RecentTransaction {
  hash: string;
  from: string;
  timestamp: number;
  value?: string;
  gasUsed?: number;
}

// Contract activity tracking
export interface ContractActivity {
  address: string;
  txCount: number;
  recentTxs: RecentTransaction[];
  velocity: number; // tx/second over rolling window
  rank: number;
  prevRank: number;
  lastSeen: number;
  heat: number; // 0-1 normalized heat value
}

// Spiral square for rendering
export interface SpiralSquare {
  address: string;
  x: number;
  y: number;
  size: number;
  targetX: number;
  targetY: number;
  targetSize: number;
  heat: number;
  animProgress: number; // 0-1 animation interpolation
}

// Detail panel state
export interface DetailState {
  isOpen: boolean;
  contract: ContractActivity | null;
  animProgress: number;
  position: { x: number; y: number };
}

// Spiral layout options
export interface LayoutOptions {
  centerX: number;
  centerY: number;
  baseSize: number;
  maxSquares: number;
  padding: number;
}

// Heatmap color configuration
export interface HeatmapColorConfig {
  cold: string;
  warm: string;
  hot: string;
  glow: string;
}

// Main heatmap options
export interface SpiralHeatmapOptions {
  maxContracts?: number;
  baseSquareSize?: number;
  animationSpeed?: number;
  windowMs?: number; // Rolling window for tx counting
  colors?: Partial<HeatmapColorConfig>;
}

// Contract tracker options
export interface TrackerOptions {
  maxContracts: number;
  windowMs: number;
  recentTxLimit: number;
}
