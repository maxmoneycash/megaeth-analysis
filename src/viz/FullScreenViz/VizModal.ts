/**
 * VizModal - Full-screen modal for expanded transaction visualization
 * Contains tabs for Flame Graph and Opcodes views
 */

import type { TraceResult } from '../FlameGraph/types';
import type { OpcodeBreakdown } from '../../streams/OpcodeStream';
import { OpcodeView } from './OpcodeView';

export type ModalTab = 'flame' | 'opcodes';

interface TabHitBox {
  tab: ModalTab;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VizModalCallbacks {
  onClose: () => void;
  onRequestOpcodes: (txHash: string) => Promise<OpcodeBreakdown | null>;
}

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

export class VizModal {
  private isOpen = false;
  private activeTab: ModalTab = 'flame';
  private trace: TraceResult | null = null;
  private opcodeView = new OpcodeView();
  private callbacks: VizModalCallbacks | null = null;
  private animProgress = 0;
  private tabHitBoxes: TabHitBox[] = [];
  private closeButtonHitBox = { x: 0, y: 0, width: 0, height: 0 };
  private hoveredTab: ModalTab | null = null;
  private isCloseHovered = false;

  private readonly HEADER_HEIGHT = 50;
  private readonly TAB_HEIGHT = 32;
  private readonly PADDING = 20;

  // Track modal bounds for click-outside detection
  private modalBounds = { x: 0, y: 0, width: 0, height: 0 };

  /**
   * Set callbacks for modal actions
   */
  setCallbacks(callbacks: VizModalCallbacks): void {
    this.callbacks = callbacks;
  }

  /**
   * Open the modal with a trace
   */
  open(trace: TraceResult): void {
    this.isOpen = true;
    this.trace = trace;
    this.animProgress = 0;
    this.activeTab = 'flame';
    this.opcodeView.clear();
  }

  /**
   * Close the modal
   */
  close(): void {
    this.isOpen = false;
    this.trace = null;
    this.opcodeView.clear();
    this.callbacks?.onClose();
  }

  /**
   * Check if modal is open
   */
  get isVisible(): boolean {
    return this.isOpen || this.animProgress > 0.01;
  }

  /**
   * Render the modal
   */
  render(ctx: CanvasRenderingContext2D, width: number, height: number, dt: number): void {
    // Animate open/close
    const targetProgress = this.isOpen ? 1 : 0;
    if (this.animProgress !== targetProgress) {
      const diff = targetProgress - this.animProgress;
      this.animProgress += diff * dt * 8;
      if (Math.abs(diff) < 0.01) {
        this.animProgress = targetProgress;
      }
    }

    if (this.animProgress < 0.01) return;

    // Clear hit boxes
    this.tabHitBoxes = [];

    // Draw backdrop
    ctx.fillStyle = `rgba(0, 0, 0, ${0.8 * this.animProgress})`;
    ctx.fillRect(0, 0, width, height);

    // Modal dimensions (centered, with margin)
    const margin = 40;
    const modalWidth = Math.min(800, width - margin * 2);
    const modalHeight = Math.min(600, height - margin * 2);

    // Apply animation scale
    const scale = 0.9 + this.animProgress * 0.1;
    const scaledWidth = modalWidth * scale;
    const scaledHeight = modalHeight * scale;
    const scaledX = (width - scaledWidth) / 2;
    const scaledY = (height - scaledHeight) / 2;

    // Store bounds for click-outside detection
    this.modalBounds = { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight };

    ctx.save();
    ctx.globalAlpha = this.animProgress;

    // Modal background
    ctx.fillStyle = '#0f0f14';
    this.roundRect(ctx, scaledX, scaledY, scaledWidth, scaledHeight, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 2;
    this.roundRect(ctx, scaledX, scaledY, scaledWidth, scaledHeight, 12);
    ctx.stroke();

    // Only draw content when mostly visible
    if (this.animProgress > 0.5) {
      this.renderHeader(ctx, scaledX, scaledY, scaledWidth);
      this.renderTabs(ctx, scaledX, scaledY + this.HEADER_HEIGHT, scaledWidth);
      this.renderContent(ctx, scaledX, scaledY + this.HEADER_HEIGHT + this.TAB_HEIGHT, scaledWidth, scaledHeight - this.HEADER_HEIGHT - this.TAB_HEIGHT, dt);
    }

    ctx.restore();
  }

  private renderHeader(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const padding = this.PADDING;

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const title = this.trace
      ? `Transaction: ${this.trace.txHash.slice(0, 10)}...${this.trace.txHash.slice(-8)}`
      : 'Transaction Details';
    ctx.fillText(title, x + padding, y + this.HEADER_HEIGHT / 2);

    // Gas info
    if (this.trace) {
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.fillText(
        `${formatGas(this.trace.totalGas)} gas | ${this.trace.frames.length} calls | Depth: ${this.trace.maxDepth}`,
        x + padding + 350,
        y + this.HEADER_HEIGHT / 2
      );
    }

    // Close button
    const closeSize = 24;
    const closeX = x + width - padding - closeSize;
    const closeY = y + (this.HEADER_HEIGHT - closeSize) / 2;
    this.closeButtonHitBox = { x: closeX, y: closeY, width: closeSize, height: closeSize };

    ctx.fillStyle = this.isCloseHovered ? '#EF4444' : '#666';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('✕', closeX + closeSize / 2, closeY + closeSize / 2);
  }

  private renderTabs(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const padding = this.PADDING;
    const tabs: Array<{ id: ModalTab; label: string }> = [
      { id: 'flame', label: 'Flame Graph' },
      { id: 'opcodes', label: 'Opcodes' },
    ];

    let tabX = x + padding;
    const tabY = y + 4;
    const tabHeight = this.TAB_HEIGHT - 8;

    for (const tab of tabs) {
      const isActive = this.activeTab === tab.id;
      const isHovered = this.hoveredTab === tab.id;

      ctx.font = '12px monospace';
      const textWidth = ctx.measureText(tab.label).width;
      const tabWidth = textWidth + 24;

      // Store hit box
      this.tabHitBoxes.push({
        tab: tab.id,
        x: tabX,
        y: tabY,
        width: tabWidth,
        height: tabHeight,
      });

      // Draw tab background
      if (isActive) {
        ctx.fillStyle = '#00D9A5';
        this.roundRect(ctx, tabX, tabY, tabWidth, tabHeight, 4);
        ctx.fill();
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.2)';
        this.roundRect(ctx, tabX, tabY, tabWidth, tabHeight, 4);
        ctx.fill();
      }

      // Draw tab text
      ctx.fillStyle = isActive ? '#000' : isHovered ? '#00D9A5' : '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.label, tabX + tabWidth / 2, tabY + tabHeight / 2);

      tabX += tabWidth + 8;
    }

    // Separator line
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + this.TAB_HEIGHT);
    ctx.lineTo(x + width, y + this.TAB_HEIGHT);
    ctx.stroke();
  }

  private renderContent(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    width: number,
    height: number,
    dt: number
  ): void {
    const contentBounds = {
      x: x + this.PADDING,
      y: y + this.PADDING,
      width: width - this.PADDING * 2,
      height: height - this.PADDING * 2,
    };

    switch (this.activeTab) {
      case 'flame':
        this.renderFlameTab(ctx, contentBounds);
        break;
      case 'opcodes':
        this.opcodeView.render(ctx, contentBounds, dt);
        break;
    }
  }

  // Colors for different contract types
  private readonly FLAME_COLORS: Record<string, string> = {
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

  private renderFlameTab(
    ctx: CanvasRenderingContext2D,
    bounds: { x: number; y: number; width: number; height: number }
  ): void {
    if (!this.trace) {
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No trace loaded', bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
      return;
    }

    const frames = this.trace.frames;
    const frameHeight = 22;
    const padding = 2;
    const maxVisibleDepth = Math.floor(bounds.height / frameHeight);

    // Draw each frame
    for (const frame of frames) {
      // Skip if too deep to fit
      if (frame.depth >= maxVisibleDepth) continue;

      // Calculate pixel position
      const pixelX = bounds.x + frame.x * bounds.width;
      const pixelWidth = frame.width * bounds.width;
      const pixelY = bounds.y + frame.depth * frameHeight;

      // Skip frames too narrow to see
      if (pixelWidth < 2) continue;

      // Draw frame background
      const color = frame.hasError ? '#EF4444' : (this.FLAME_COLORS[frame.contractType] || '#374151');
      ctx.fillStyle = color;
      this.roundRect(ctx, pixelX, pixelY + padding, pixelWidth - 1, frameHeight - padding * 2, 3);
      ctx.fill();

      // Draw label if wide enough
      if (pixelWidth > 40) {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';

        // Clip to frame bounds
        ctx.save();
        ctx.beginPath();
        ctx.rect(pixelX + 4, pixelY, pixelWidth - 8, frameHeight);
        ctx.clip();

        const label = frame.functionName || frame.functionSig.slice(0, 10);
        const gasLabel = frame.selfGasPercent > 1 ? ` ${frame.selfGasPercent.toFixed(0)}%` : '';
        ctx.fillText(`${label}${gasLabel}`, pixelX + 4, pixelY + frameHeight / 2);

        ctx.restore();
      }
    }

    // Draw info bar at bottom
    const infoY = bounds.y + bounds.height - 20;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(bounds.x, infoY, bounds.width, 20);

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      `${frames.length} frames | Max depth: ${this.trace.maxDepth} | Total gas: ${formatGas(this.trace.totalGas)}`,
      bounds.x + bounds.width / 2,
      infoY + 10
    );
  }

  /**
   * Handle mouse move
   */
  handleMouseMove(mx: number, my: number): boolean {
    let changed = false;

    // Check close button
    const wasCloseHovered = this.isCloseHovered;
    this.isCloseHovered =
      mx >= this.closeButtonHitBox.x &&
      mx <= this.closeButtonHitBox.x + this.closeButtonHitBox.width &&
      my >= this.closeButtonHitBox.y &&
      my <= this.closeButtonHitBox.y + this.closeButtonHitBox.height;
    if (wasCloseHovered !== this.isCloseHovered) changed = true;

    // Check tabs
    let newHoveredTab: ModalTab | null = null;
    for (const hitBox of this.tabHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        newHoveredTab = hitBox.tab;
        break;
      }
    }
    if (newHoveredTab !== this.hoveredTab) {
      this.hoveredTab = newHoveredTab;
      changed = true;
    }

    // Check opcode view
    if (this.activeTab === 'opcodes') {
      if (this.opcodeView.handleMouseMove(mx, my)) {
        changed = true;
      }
    }

    return changed;
  }

  /**
   * Handle click
   */
  handleClick(mx: number, my: number): boolean {
    // Check if click is outside modal bounds (click-to-close backdrop)
    const isOutside =
      mx < this.modalBounds.x ||
      mx > this.modalBounds.x + this.modalBounds.width ||
      my < this.modalBounds.y ||
      my > this.modalBounds.y + this.modalBounds.height;

    if (isOutside) {
      this.close();
      return true;
    }

    // Check close button
    if (this.isCloseHovered) {
      this.close();
      return true;
    }

    // Check tabs
    for (const hitBox of this.tabHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        this.setActiveTab(hitBox.tab);
        return true;
      }
    }

    return true; // Consume click inside modal
  }

  /**
   * Set active tab
   */
  private async setActiveTab(tab: ModalTab): Promise<void> {
    if (this.activeTab === tab) return;

    this.activeTab = tab;

    // Load opcodes if switching to that tab and we have a trace
    if (tab === 'opcodes' && this.trace && this.callbacks) {
      this.opcodeView.setLoading(true);
      try {
        const breakdown = await this.callbacks.onRequestOpcodes(this.trace.txHash);
        if (breakdown) {
          this.opcodeView.setBreakdown(breakdown);
        } else {
          this.opcodeView.setError('Failed to load opcode trace');
        }
      } catch (e) {
        this.opcodeView.setError(e instanceof Error ? e.message : 'Unknown error');
      }
    }
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
