/**
 * Types for inline mini-visualizations
 */

import type { TraceResult } from '../FlameGraph/types';

/**
 * Supported visualization types for the switcher
 */
export type VizType = 'flame' | 'tree' | 'replay';

/**
 * Bounds for rendering within the detail panel
 */
export interface VizBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * State for the viz container
 */
export interface MiniVizState {
  activeViz: VizType;
  trace: TraceResult | null;
  isLoading: boolean;
  error: string | null;
  selectedTxHash: string | null;
}

/**
 * Tab configuration for VizSwitcher
 */
export interface VizTab {
  type: VizType;
  label: string;
  icon?: string;
}

/**
 * Hit box for tab click detection
 */
export interface TabHitBox {
  type: VizType;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Mini flame graph frame (simplified for compact rendering)
 */
export interface MiniFlameFrame {
  id: string;
  address: string;
  functionSig: string;
  functionName: string;
  depth: number;
  gasPercent: number;
  selfGas: number;
  selfGasPercent: number;
  gasTotal: number;
  pixelX: number;
  pixelY: number;
  pixelWidth: number;
  pixelHeight: number;
  color: string;
  hasError: boolean;
  isHovered: boolean;
  callType: string;
}

/**
 * Options for mini flame graph rendering
 */
export interface MiniFlameOptions {
  maxDepth: number;
  frameHeight: number;
  minFrameWidth: number;
  padding: number;
  headerHeight: number;
  legendHeight: number;
}

/**
 * Callback for when a frame is clicked
 */
export type OnFrameClick = (frame: MiniFlameFrame) => void;

/**
 * Callback for requesting trace data
 */
export type OnTraceRequest = (txHash: string) => Promise<TraceResult | null>;

/**
 * Animation constants for mini-viz
 */
export const MINI_VIZ_ANIMATION = {
  TAB_SWITCH_DURATION: 0.25,
  FADE_IN_DURATION: 0.3,
  LOADING_PULSE_SPEED: 2,
} as const;
