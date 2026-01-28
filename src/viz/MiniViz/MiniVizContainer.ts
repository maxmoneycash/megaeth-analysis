/**
 * Container for inline mini-visualizations
 * Manages switching between different viz types and loading state
 */

import type { TraceResult } from '../FlameGraph/types';
import type { VizType, VizBounds, MiniVizState, OnTraceRequest, MiniFlameFrame } from './types';
import { VizSwitcher } from './VizSwitcher';
import { MiniFlameGraph } from './MiniFlameGraph';

const VIZ_GAP = 8;

export class MiniVizContainer {
  private state: MiniVizState = {
    activeViz: 'flame',
    trace: null,
    isLoading: false,
    error: null,
    selectedTxHash: null,
  };

  private switcher = new VizSwitcher();
  private miniFlame = new MiniFlameGraph();
  private loadingPhase = 0;
  private onExpandClick?: () => void;
  private onFrameClick?: (frame: MiniFlameFrame) => void;
  private traceRequester?: OnTraceRequest;

  // Bounds for hit detection
  private containerBounds: VizBounds = { x: 0, y: 0, width: 0, height: 0 };
  private vizBounds: VizBounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor() {
    // Wire up switcher callbacks
    this.switcher.setOnTabChange((tab) => {
      this.state.activeViz = tab;
    });

    this.switcher.setOnExpandClick(() => {
      this.onExpandClick?.();
    });

    // Wire up flame graph callbacks
    this.miniFlame.setOnFrameClick((frame) => {
      this.onFrameClick?.(frame);
    });
  }

  /**
   * Set callback for expand button
   */
  setOnExpandClick(callback: () => void): void {
    this.onExpandClick = callback;
  }

  /**
   * Set callback for frame clicks
   */
  setOnFrameClick(callback: (frame: MiniFlameFrame) => void): void {
    this.onFrameClick = callback;
  }

  /**
   * Set the trace request function
   */
  setTraceRequester(requester: OnTraceRequest): void {
    this.traceRequester = requester;
  }

  /**
   * Load trace for a transaction
   */
  async loadTrace(txHash: string): Promise<void> {
    if (!this.traceRequester) {
      this.state.error = 'No trace requester configured';
      return;
    }

    // Don't reload if already loaded
    if (this.state.selectedTxHash === txHash && this.state.trace) {
      return;
    }

    this.state.selectedTxHash = txHash;
    this.state.isLoading = true;
    this.state.error = null;

    try {
      const trace = await this.traceRequester(txHash);
      if (trace) {
        this.state.trace = trace;
        // Reload the mini flame graph with new trace
        this.miniFlame.loadTrace(trace, this.vizBounds);
      } else {
        this.state.error = 'Failed to load trace';
      }
    } catch (e) {
      this.state.error = e instanceof Error ? e.message : 'Unknown error';
    } finally {
      this.state.isLoading = false;
    }
  }

  /**
   * Clear the current trace
   */
  clearTrace(): void {
    this.state.trace = null;
    this.state.selectedTxHash = null;
    this.state.error = null;
    this.miniFlame.clear();
  }

  /**
   * Get current active visualization type
   */
  getActiveViz(): VizType {
    return this.state.activeViz;
  }

  /**
   * Get current trace if loaded
   */
  getTrace(): TraceResult | null {
    return this.state.trace;
  }

  /**
   * Render the container and active visualization
   */
  render(
    ctx: CanvasRenderingContext2D,
    bounds: VizBounds,
    dt: number
  ): void {
    this.containerBounds = bounds;

    // Update loading animation
    if (this.state.isLoading) {
      this.loadingPhase += dt * 2;
    }

    // Calculate switcher position
    const switcherY = bounds.y;

    // Render tab switcher
    const switcherHeight = this.switcher.render(
      ctx,
      bounds.x,
      switcherY,
      bounds.width
    );

    // Calculate viz bounds
    this.vizBounds = {
      x: bounds.x,
      y: switcherY + switcherHeight + VIZ_GAP,
      width: bounds.width,
      height: bounds.height - switcherHeight - VIZ_GAP,
    };

    // Render based on state
    if (this.state.isLoading) {
      this.renderLoadingState(ctx, this.vizBounds);
    } else if (this.state.error) {
      this.renderErrorState(ctx, this.vizBounds);
    } else if (!this.state.trace) {
      this.renderEmptyState(ctx, this.vizBounds);
    } else {
      this.renderActiveViz(ctx, this.vizBounds, dt);
    }
  }

  private renderActiveViz(
    ctx: CanvasRenderingContext2D,
    bounds: VizBounds,
    dt: number
  ): void {
    // Draw background for all active viz types
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 4);
    ctx.fill();

    switch (this.state.activeViz) {
      case 'flame':
        // Ensure trace is loaded into mini flame graph
        if (this.state.trace) {
          this.miniFlame.loadTrace(this.state.trace, bounds);
        }
        this.miniFlame.render(ctx, bounds, dt);
        break;

      case 'tree':
        // TODO: Implement MiniCallTree
        this.renderPlaceholder(ctx, bounds, 'Call Tree');
        break;

      case 'replay':
        // TODO: Implement replay view
        this.renderPlaceholder(ctx, bounds, 'Execution Replay');
        break;
    }
  }

  private renderLoadingState(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 4);
    ctx.fill();

    // Draw pulsing loading indicator
    const pulse = Math.sin(this.loadingPhase) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(0, 217, 165, ${pulse})`;
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Loading trace...',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );

    // Draw spinning dots
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2 + 20;
    const radius = 15;

    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + this.loadingPhase;
      const dotX = centerX + Math.cos(angle) * radius;
      const dotY = centerY + Math.sin(angle) * radius;
      const alpha = (i / 8) * 0.8 + 0.2;

      ctx.fillStyle = `rgba(0, 217, 165, ${alpha})`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderErrorState(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 4);
    ctx.fill();

    // Draw error message
    ctx.fillStyle = '#EF4444';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this.state.error || 'Error loading trace',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  }

  private renderEmptyState(ctx: CanvasRenderingContext2D, bounds: VizBounds): void {
    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    this.roundRect(ctx, bounds.x, bounds.y, bounds.width, bounds.height, 4);
    ctx.fill();

    // Draw instruction
    ctx.fillStyle = '#666';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Click a transaction below to view trace',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  }

  private renderPlaceholder(
    ctx: CanvasRenderingContext2D,
    bounds: VizBounds,
    label: string
  ): void {
    // Background is drawn by renderActiveViz
    // Draw coming soon message
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${label} (coming soon)`,
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(mx: number, my: number): boolean {
    let changed = false;

    // Check switcher
    if (this.switcher.handleMouseMove(mx, my)) {
      changed = true;
    }

    // Check active viz
    if (
      this.state.activeViz === 'flame' &&
      this.state.trace &&
      this.miniFlame.containsPoint(mx, my)
    ) {
      if (this.miniFlame.handleMouseMove(mx, my)) {
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Handle click - returns true if click was handled
   */
  handleClick(mx: number, my: number): boolean {
    // Check switcher first
    if (this.switcher.containsPoint(mx, my)) {
      return this.switcher.handleClick(mx, my);
    }

    // Check active viz
    if (
      this.state.activeViz === 'flame' &&
      this.state.trace &&
      this.miniFlame.containsPoint(mx, my)
    ) {
      return this.miniFlame.handleClick(mx, my);
    }

    return false;
  }

  /**
   * Check if point is within container bounds
   */
  containsPoint(mx: number, my: number): boolean {
    return (
      mx >= this.containerBounds.x &&
      mx <= this.containerBounds.x + this.containerBounds.width &&
      my >= this.containerBounds.y &&
      my <= this.containerBounds.y + this.containerBounds.height
    );
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
