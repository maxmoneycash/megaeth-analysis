/**
 * Compact Canvas2D flame graph for inline display
 * Shows call stack with function names, gas breakdown, and helpful context
 */

import type { TraceResult, ContractType } from '../FlameGraph/types';
import type { VizBounds, MiniFlameFrame, MiniFlameOptions } from './types';

const DEFAULT_OPTIONS: MiniFlameOptions = {
  maxDepth: 8,
  frameHeight: 14,
  minFrameWidth: 2,
  padding: 2,
  headerHeight: 12,
  legendHeight: 16,
};

/**
 * Color palette for contract types (Canvas hex strings)
 */
const COLORS: Record<ContractType, string> = {
  dex: '#22C55E',
  nft: '#A855F7',
  bridge: '#3B82F6',
  lending: '#F59E0B',
  stablecoin: '#10B981',
  governance: '#6366F1',
  oracle: '#EC4899',
  token: '#8B5CF6',
  proxy: '#6B7280',
  unknown: '#374151',
};

const ERROR_COLOR = '#EF4444';
const SELF_GAS_COLOR = '#3B82F6';
const SUBCALL_GAS_COLOR = '#10B981';

/**
 * Format gas number to human readable string
 */
function formatGas(gas: number): string {
  if (gas >= 1000000) {
    return `${(gas / 1000000).toFixed(1)}M`;
  } else if (gas >= 1000) {
    return `${(gas / 1000).toFixed(0)}K`;
  }
  return gas.toString();
}

export class MiniFlameGraph {
  private frames: MiniFlameFrame[] = [];
  private hoveredFrame: MiniFlameFrame | null = null;
  private options: MiniFlameOptions;
  private onFrameClick?: (frame: MiniFlameFrame) => void;
  private lastBounds: VizBounds = { x: 0, y: 0, width: 0, height: 0 };
  private trace: TraceResult | null = null;

  constructor(options?: Partial<MiniFlameOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Set callback for frame clicks
   */
  setOnFrameClick(callback: (frame: MiniFlameFrame) => void): void {
    this.onFrameClick = callback;
  }

  /**
   * Load trace data and compute layout
   * Ensures at least one frame per depth level is shown for complex transactions
   */
  loadTrace(trace: TraceResult, bounds: VizBounds): void {
    this.frames = [];
    this.lastBounds = bounds;
    this.trace = trace;

    const { padding, frameHeight, minFrameWidth, maxDepth, headerHeight, legendHeight } = this.options;
    const contentWidth = bounds.width - padding * 2;

    // Vertical space available for frames (minus header and legend)
    const framesStartY = bounds.y + headerHeight + padding;
    const framesEndY = bounds.y + bounds.height - legendHeight - padding;
    const maxFrameRows = Math.floor((framesEndY - framesStartY) / frameHeight);
    const effectiveMaxDepth = Math.min(maxDepth, maxFrameRows);

    // Group frames by depth level
    const framesByDepth = new Map<number, typeof trace.frames>();
    for (const frame of trace.frames) {
      if (frame.depth >= effectiveMaxDepth) continue;
      const existing = framesByDepth.get(frame.depth) || [];
      existing.push(frame);
      framesByDepth.set(frame.depth, existing);
    }

    // For each depth level, select frames to display
    for (const [depth, depthFrames] of framesByDepth) {
      // Sort by gas (widest first)
      const sortedByGas = [...depthFrames].sort((a, b) => b.gasTotal - a.gasTotal);

      // Track which frames we'll render
      const framesToRender: typeof trace.frames = [];
      let aggregatedCount = 0;
      let aggregatedGas = 0;

      for (const frame of sortedByGas) {
        const pixelWidth = frame.width * contentWidth;

        // Always include if wide enough
        if (pixelWidth >= minFrameWidth) {
          framesToRender.push(frame);
        } else {
          // Aggregate narrow frames, but always keep at least the widest one per depth
          if (framesToRender.length === 0 && aggregatedCount === 0) {
            // This is the widest frame at this depth - force include it
            framesToRender.push(frame);
          } else {
            aggregatedCount++;
            aggregatedGas += frame.gasTotal;
          }
        }
      }

      // Convert to MiniFlameFrames
      for (const frame of framesToRender) {
        const pixelX = bounds.x + padding + frame.x * contentWidth;
        const pixelWidth = Math.max(minFrameWidth, frame.width * contentWidth);
        const pixelY = framesStartY + depth * frameHeight;

        const miniFrame: MiniFlameFrame = {
          id: frame.id,
          address: frame.address,
          functionSig: frame.functionSig,
          functionName: frame.functionName || frame.functionSig,
          depth: frame.depth,
          gasPercent: frame.gasPercent,
          selfGas: frame.selfGas,
          selfGasPercent: frame.selfGasPercent,
          gasTotal: frame.gasTotal,
          pixelX,
          pixelY,
          pixelWidth,
          pixelHeight: frameHeight - 2, // 2px gap between rows
          color: frame.hasError ? ERROR_COLOR : COLORS[frame.contractType],
          hasError: frame.hasError,
          isHovered: false,
          callType: frame.callType,
        };

        this.frames.push(miniFrame);
      }

      // Add aggregated indicator if there are hidden frames
      if (aggregatedCount > 0) {
        const lastFrame = framesToRender[framesToRender.length - 1];
        const indicatorX = bounds.x + padding + contentWidth - 20;
        const pixelY = framesStartY + depth * frameHeight;

        // Create a "..." indicator frame
        const aggregatedFrame: MiniFlameFrame = {
          id: `aggregated-${depth}`,
          address: '...',
          functionSig: '...',
          functionName: `+${aggregatedCount} more`,
          depth,
          gasPercent: (aggregatedGas / trace.totalGas) * 100,
          selfGas: aggregatedGas,
          selfGasPercent: (aggregatedGas / trace.totalGas) * 100,
          gasTotal: aggregatedGas,
          pixelX: indicatorX,
          pixelY,
          pixelWidth: 18,
          pixelHeight: frameHeight - 2,
          color: '#555555',
          hasError: false,
          isHovered: false,
          callType: lastFrame?.callType || 'CALL',
        };

        this.frames.push(aggregatedFrame);
      }
    }

    console.log(`[MiniFlameGraph] Loaded ${this.frames.length} visible frames from ${trace.frames.length} total (maxDepth: ${trace.maxDepth})`);
  }

  /**
   * Render the mini flame graph
   */
  render(ctx: CanvasRenderingContext2D, bounds: VizBounds, _dt: number): void {
    // Update stored bounds
    this.lastBounds = bounds;

    // Don't render anything if no trace - container handles empty state
    if (!this.trace || this.frames.length === 0) {
      return;
    }

    // Draw header
    this.renderHeader(ctx, bounds);

    // Draw frames from back to front (deeper first)
    const sortedFrames = [...this.frames].sort((a, b) => b.depth - a.depth);
    for (const frame of sortedFrames) {
      this.drawFrame(ctx, frame);
    }

    // Draw legend
    this.renderLegend(ctx, bounds);

    // Draw simple transaction note if applicable (based on actual trace depth, not rendered frames)
    if (this.trace && this.trace.maxDepth <= 1) {
      this.renderSimpleTransactionNote(ctx, bounds);
    }

    // Draw hovered frame tooltip
    if (this.hoveredFrame) {
      this.drawTooltip(ctx, this.hoveredFrame, bounds);
    }
  }

  private renderHeader(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    if (!this.trace) return;

    const callCount = this.trace.frames.length;
    const totalGas = this.trace.totalGas;
    const gasStr = formatGas(totalGas);

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(
      `Call Stack (${callCount} call${callCount === 1 ? '' : 's'}, ${gasStr} gas)`,
      bounds.x + this.options.padding,
      bounds.y + 2
    );
  }

  private renderLegend(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    if (!this.trace) return;

    const { padding, legendHeight } = this.options;
    const y = bounds.y + bounds.height - legendHeight;
    const barWidth = bounds.width - padding * 2;
    const barHeight = 8;
    const barY = y + 4;

    // Calculate self vs subcall gas from root frame
    const rootFrame = this.trace.frames.find(f => f.depth === 0);
    const selfGas = rootFrame?.selfGas || 0;
    const subcallGas = this.trace.totalGas - selfGas;

    const selfRatio = this.trace.totalGas > 0 ? selfGas / this.trace.totalGas : 0;
    const selfBarWidth = barWidth * selfRatio;
    const subcallBarWidth = barWidth - selfBarWidth;

    // Draw bar background
    ctx.fillStyle = '#1a1a1a';
    this.roundRect(ctx, bounds.x + padding, barY, barWidth, barHeight, 2);
    ctx.fill();

    // Draw self gas portion (blue)
    if (selfBarWidth > 0) {
      ctx.fillStyle = SELF_GAS_COLOR;
      this.roundRect(ctx, bounds.x + padding, barY, selfBarWidth, barHeight, 2);
      ctx.fill();
    }

    // Draw subcall gas portion (teal)
    if (subcallBarWidth > 0) {
      ctx.fillStyle = SUBCALL_GAS_COLOR;
      ctx.fillRect(bounds.x + padding + selfBarWidth, barY, subcallBarWidth, barHeight);
    }

    // Draw labels below bar
    ctx.fillStyle = '#666';
    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    const labelY = barY + barHeight + 2;
    ctx.fillStyle = SELF_GAS_COLOR;
    ctx.fillText(`Self: ${formatGas(selfGas)}`, bounds.x + padding, labelY);

    ctx.fillStyle = SUBCALL_GAS_COLOR;
    const subcallLabel = `Subcalls: ${formatGas(subcallGas)}`;
    const subcallLabelWidth = ctx.measureText(subcallLabel).width;
    ctx.fillText(subcallLabel, bounds.x + bounds.width - padding - subcallLabelWidth, labelY);
  }

  private renderSimpleTransactionNote(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    // Position below legend area
    const noteY = bounds.y + bounds.height - 4;

    ctx.fillStyle = '#555';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(
      'Simple tx - no complex subcalls',
      bounds.x + bounds.width / 2,
      noteY
    );
  }

  private drawFrame(ctx: CanvasRenderingContext2D, frame: MiniFlameFrame): void {
    const { pixelX, pixelY, pixelWidth, pixelHeight, color, isHovered } = frame;

    // Draw fill
    ctx.fillStyle = isHovered ? this.lightenColor(color) : color;
    this.roundRect(ctx, pixelX, pixelY, pixelWidth, pixelHeight, 2);
    ctx.fill();

    // Draw border on hover
    if (isHovered) {
      ctx.strokeStyle = '#00D9A5';
      ctx.lineWidth = 1;
      this.roundRect(ctx, pixelX, pixelY, pixelWidth, pixelHeight, 2);
      ctx.stroke();
    }

    // Draw label with function name + percentage
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    ctx.save();
    ctx.beginPath();
    ctx.rect(pixelX, pixelY, pixelWidth, pixelHeight);
    ctx.clip();

    if (pixelWidth > 100) {
      // Full label: functionName() XX%
      const fnName = this.truncateFunctionName(frame.functionName, 12);
      const label = `${fnName}() ${frame.selfGasPercent.toFixed(0)}%`;
      ctx.fillText(label, pixelX + 3, pixelY + pixelHeight / 2);
    } else if (pixelWidth > 50) {
      // Short label: functionName()
      const fnName = this.truncateFunctionName(frame.functionName, 6);
      ctx.fillText(`${fnName}()`, pixelX + 3, pixelY + pixelHeight / 2);
    } else if (pixelWidth > 25) {
      // Just percentage
      ctx.fillText(`${frame.selfGasPercent.toFixed(0)}%`, pixelX + 3, pixelY + pixelHeight / 2);
    }

    ctx.restore();
  }

  private truncateFunctionName(name: string, maxLen: number): string {
    // Remove parentheses if present
    const cleanName = name.replace(/\(\)$/, '');
    if (cleanName.length <= maxLen) return cleanName;
    return cleanName.slice(0, maxLen - 1) + '…';
  }

  private drawTooltip(
    ctx: CanvasRenderingContext2D,
    frame: MiniFlameFrame,
    bounds: VizBounds
  ): void {
    const tooltipWidth = 180;
    const tooltipHeight = frame.hasError ? 85 : 70;
    const padding = 6;
    const lineHeight = 12;

    // Position tooltip above frame, or below if no room
    let tooltipX = frame.pixelX;
    let tooltipY = frame.pixelY - tooltipHeight - 4;

    if (tooltipY < bounds.y) {
      tooltipY = frame.pixelY + frame.pixelHeight + 4;
    }

    // Keep within horizontal bounds
    if (tooltipX + tooltipWidth > bounds.x + bounds.width) {
      tooltipX = bounds.x + bounds.width - tooltipWidth;
    }

    // Draw tooltip background
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    this.roundRect(ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.fill();

    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 1;
    this.roundRect(ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, 4);
    ctx.stroke();

    // Draw tooltip content
    let y = tooltipY + padding;

    // Function name
    ctx.fillStyle = '#00D9A5';
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`${frame.functionName}()`, tooltipX + padding, y);
    y += lineHeight;

    // Address
    ctx.fillStyle = '#666';
    ctx.font = '9px monospace';
    const truncAddr = `${frame.address.slice(0, 8)}...${frame.address.slice(-4)}`;
    ctx.fillText(truncAddr, tooltipX + padding, y);
    y += lineHeight;

    // Call type
    ctx.fillStyle = '#888';
    ctx.fillText(`Type: ${frame.callType}`, tooltipX + padding, y);
    y += lineHeight + 2;

    // Gas breakdown
    ctx.fillStyle = SELF_GAS_COLOR;
    ctx.fillText(
      `Self: ${formatGas(frame.selfGas)} (${frame.selfGasPercent.toFixed(1)}%)`,
      tooltipX + padding,
      y
    );
    y += lineHeight;

    ctx.fillStyle = '#fff';
    ctx.fillText(
      `Total: ${formatGas(frame.gasTotal)} (${frame.gasPercent.toFixed(1)}%)`,
      tooltipX + padding,
      y
    );

    // Error indicator
    if (frame.hasError) {
      y += lineHeight;
      ctx.fillStyle = ERROR_COLOR;
      ctx.fillText('⚠ Call reverted', tooltipX + padding, y);
    }
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(mx: number, my: number): boolean {
    let changed = false;
    let foundHovered: MiniFlameFrame | null = null;

    // Check from front to back (shallower frames first)
    const sortedFrames = [...this.frames].sort((a, b) => a.depth - b.depth);

    for (const frame of sortedFrames) {
      if (
        mx >= frame.pixelX &&
        mx <= frame.pixelX + frame.pixelWidth &&
        my >= frame.pixelY &&
        my <= frame.pixelY + frame.pixelHeight
      ) {
        foundHovered = frame;
        break;
      }
    }

    // Update hover states
    for (const frame of this.frames) {
      const shouldBeHovered = frame === foundHovered;
      if (frame.isHovered !== shouldBeHovered) {
        frame.isHovered = shouldBeHovered;
        changed = true;
      }
    }

    if (this.hoveredFrame !== foundHovered) {
      this.hoveredFrame = foundHovered;
      changed = true;
    }

    return changed;
  }

  /**
   * Handle click - returns true if a frame was clicked
   */
  handleClick(_mx: number, _my: number): boolean {
    if (this.hoveredFrame) {
      this.onFrameClick?.(this.hoveredFrame);
      return true;
    }
    return false;
  }

  /**
   * Check if point is within flame graph bounds
   */
  containsPoint(mx: number, my: number): boolean {
    return (
      mx >= this.lastBounds.x &&
      mx <= this.lastBounds.x + this.lastBounds.width &&
      my >= this.lastBounds.y &&
      my <= this.lastBounds.y + this.lastBounds.height
    );
  }

  /**
   * Clear loaded data
   */
  clear(): void {
    this.frames = [];
    this.hoveredFrame = null;
    this.trace = null;
  }

  private lightenColor(hex: string): string {
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + 40);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + 40);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + 40);
    return `rgb(${r}, ${g}, ${b})`;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
