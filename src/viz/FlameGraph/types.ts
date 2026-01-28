/**
 * Types for the FlameGraph visualization
 */

/**
 * Raw call trace from debug_traceTransaction with callTracer
 */
export interface CallTrace {
  type: 'CALL' | 'DELEGATECALL' | 'STATICCALL' | 'CREATE' | 'CREATE2';
  from: string;
  to: string;
  value?: string;
  gas: string;
  gasUsed: string;
  input: string;
  output?: string;
  error?: string;
  revertReason?: string;
  calls?: CallTrace[];
}

/**
 * Contract type classification for color coding
 */
export type ContractType =
  | 'dex'
  | 'nft'
  | 'bridge'
  | 'lending'
  | 'stablecoin'
  | 'token'
  | 'oracle'
  | 'governance'
  | 'proxy'
  | 'unknown';

/**
 * Flattened frame for rendering
 */
export interface FlameFrame {
  id: string;
  address: string;
  functionSig: string;
  functionName?: string;

  // Normalized layout (0-1)
  x: number;
  width: number;
  depth: number;

  // Gas metrics
  gasUsed: number;
  gasTotal: number;
  gasPercent: number;
  selfGas: number;        // Gas used by this call only (excluding children)
  selfGasPercent: number; // Percentage of total tx gas for self only

  // Classification
  contractType: ContractType;
  callType: CallTrace['type'];
  hasError: boolean;

  // Pixel positions (computed by layout)
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  color: number;

  // Interaction state
  isHovered: boolean;
  isSelected: boolean;
}

/**
 * Processed trace result
 */
export interface TraceResult {
  txHash: string;
  frames: FlameFrame[];
  rootCall: CallTrace;
  totalGas: number;
  maxDepth: number;
  contractCount: number;
  timestamp: number;
}

/**
 * View state for zoom/pan
 */
export interface ViewState {
  offsetX: number;
  scale: number;
  focusedFrame?: FlameFrame;
}

/**
 * Flame graph configuration
 */
export interface FlameGraphOptions {
  width: number;
  height: number;
  frameHeight?: number;
  minFrameWidth?: number;
  maxDepth?: number;
  colorScheme?: Partial<Record<ContractType, string>>;
}
