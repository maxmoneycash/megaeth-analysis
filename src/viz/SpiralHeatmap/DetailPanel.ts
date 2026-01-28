import type { ContractActivity, DetailState, RecentTransaction } from './types';
import { easeOutCubic } from '../../utils/easing';
import { MiniVizContainer } from '../MiniViz';
import type { OnTraceRequest, MiniFlameFrame } from '../MiniViz';

const PANEL_WIDTH = 320;
const PANEL_HEIGHT = 580;
const BORDER_RADIUS = 12;
const MINI_VIZ_HEIGHT = 150;

interface TxHitBox {
  tx: RecentTransaction;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Animated detail panel that appears when clicking a contract square.
 * Shows contract address, transaction count, velocity, and recent transactions.
 */
export class DetailPanel {
  private state: DetailState = {
    isOpen: false,
    contract: null,
    animProgress: 0,
    position: { x: 0, y: 0 },
  };
  private animSpeed = 5; // Animation speed multiplier
  private txHitBoxes: TxHitBox[] = [];
  private onTxClickCallback?: (tx: RecentTransaction) => void;
  private hoveredTxHash: string | null = null;
  private miniViz = new MiniVizContainer();
  private onExpandCallback?: () => void;
  private onFrameClickCallback?: (frame: MiniFlameFrame) => void;
  // Actual rendered position (after screen bounds adjustment)
  private renderedX = 0;
  private renderedY = 0;

  constructor() {
    // Wire up mini viz callbacks
    this.miniViz.setOnExpandClick(() => {
      this.onExpandCallback?.();
    });

    this.miniViz.setOnFrameClick((frame) => {
      this.onFrameClickCallback?.(frame);
    });
  }

  /**
   * Open the panel for a contract
   */
  open(contract: ContractActivity, position: { x: number; y: number }): void {
    this.state = {
      isOpen: true,
      contract,
      animProgress: 0,
      position,
    };
  }

  /**
   * Close the panel
   */
  close(): void {
    this.state.isOpen = false;
    this.miniViz.clearTrace();
  }

  /**
   * Set the trace requester for loading transaction traces
   */
  setTraceRequester(requester: OnTraceRequest): void {
    this.miniViz.setTraceRequester(requester);
  }

  /**
   * Get current trace from mini viz
   */
  getTrace(): import('../FlameGraph/types').TraceResult | null {
    return this.miniViz.getTrace();
  }

  /**
   * Set callback for expand button click
   */
  onExpandClick(callback: () => void): void {
    this.onExpandCallback = callback;
  }

  /**
   * Set callback for frame click in mini viz
   */
  onFrameClick(callback: (frame: MiniFlameFrame) => void): void {
    this.onFrameClickCallback = callback;
  }

  /**
   * Load trace for a transaction (called when tx is clicked)
   */
  loadTraceForTx(txHash: string): void {
    this.miniViz.loadTrace(txHash);
  }

  /**
   * Check if panel is currently open
   */
  get isOpen(): boolean {
    return this.state.isOpen || this.state.animProgress > 0.01;
  }

  /**
   * Check if a point is inside the panel
   */
  containsPoint(x: number, y: number): boolean {
    if (!this.state.isOpen || this.state.animProgress < 0.5) return false;

    // Use the actual rendered position (adjusted for screen bounds)
    return (
      x >= this.renderedX &&
      x <= this.renderedX + PANEL_WIDTH &&
      y >= this.renderedY &&
      y <= this.renderedY + PANEL_HEIGHT
    );
  }

  /**
   * Set callback for transaction clicks
   */
  onTransactionClick(callback: (tx: RecentTransaction) => void): void {
    this.onTxClickCallback = callback;
  }

  /**
   * Handle click at coordinates - returns true if a tx was clicked
   */
  handleClick(x: number, y: number): boolean {
    // Check mini viz first
    if (this.miniViz.containsPoint(x, y)) {
      if (this.miniViz.handleClick(x, y)) {
        return true;
      }
    }

    // Check transaction list
    for (const hitBox of this.txHitBoxes) {
      if (
        x >= hitBox.x &&
        x <= hitBox.x + hitBox.width &&
        y >= hitBox.y &&
        y <= hitBox.y + hitBox.height
      ) {
        // Load trace for clicked transaction
        this.loadTraceForTx(hitBox.tx.hash);
        this.onTxClickCallback?.(hitBox.tx);
        return true;
      }
    }
    return false;
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(x: number, y: number): string | null {
    // Check mini viz
    this.miniViz.handleMouseMove(x, y);

    // Check transaction list
    for (const hitBox of this.txHitBoxes) {
      if (
        x >= hitBox.x &&
        x <= hitBox.x + hitBox.width &&
        y >= hitBox.y &&
        y <= hitBox.y + hitBox.height
      ) {
        this.hoveredTxHash = hitBox.tx.hash;
        return hitBox.tx.hash;
      }
    }
    this.hoveredTxHash = null;
    return null;
  }

  /**
   * Render the detail panel
   */
  render(ctx: CanvasRenderingContext2D, dt: number, canvasWidth: number, canvasHeight: number): void {
    // Update animation
    const targetProgress = this.state.isOpen ? 1 : 0;
    if (this.state.animProgress !== targetProgress) {
      const diff = targetProgress - this.state.animProgress;
      this.state.animProgress += diff * dt * this.animSpeed;

      // Snap to target when close
      if (Math.abs(diff) < 0.01) {
        this.state.animProgress = targetProgress;
      }
    }

    if (this.state.animProgress < 0.01 || !this.state.contract) return;

    const progress = easeOutCubic(this.state.animProgress);
    const contract = this.state.contract;

    // Calculate panel position (keep within bounds)
    let x = this.state.position.x;
    let y = this.state.position.y;

    // Adjust to stay on screen
    if (x + PANEL_WIDTH > canvasWidth - 20) {
      x = canvasWidth - PANEL_WIDTH - 20;
    }
    if (y + PANEL_HEIGHT > canvasHeight - 20) {
      y = canvasHeight - PANEL_HEIGHT - 20;
    }
    x = Math.max(20, x);
    y = Math.max(20, y);

    // Store rendered position for hit testing
    this.renderedX = x;
    this.renderedY = y;

    // Scale from center during animation
    const scale = 0.8 + progress * 0.2;
    const width = PANEL_WIDTH * scale;
    const height = PANEL_HEIGHT * scale;
    const offsetX = (PANEL_WIDTH - width) / 2;
    const offsetY = (PANEL_HEIGHT - height) / 2;

    ctx.save();
    ctx.globalAlpha = progress;

    // Draw backdrop shadow
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;

    // Draw panel background
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    this.roundRect(ctx, x + offsetX, y + offsetY, width, height, BORDER_RADIUS * scale);
    ctx.fill();

    ctx.shadowColor = 'transparent';

    // Draw border
    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 2;
    this.roundRect(ctx, x + offsetX, y + offsetY, width, height, BORDER_RADIUS * scale);
    ctx.stroke();

    // Only draw content when mostly visible
    if (progress > 0.5) {
      // Clear hit boxes before redrawing
      this.txHitBoxes = [];
      this.drawContent(ctx, contract, x + offsetX, y + offsetY, width, height, progress);
    }

    ctx.restore();
  }

  private drawContent(
    ctx: CanvasRenderingContext2D,
    contract: ContractActivity,
    x: number,
    y: number,
    width: number,
    _height: number,
    alpha: number
  ): void {
    const padding = 20;
    const contentX = x + padding;
    let contentY = y + padding;

    ctx.globalAlpha = alpha;

    // Title
    ctx.fillStyle = '#00D9A5';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('CONTRACT DETAILS', contentX, contentY + 12);
    contentY += 35;

    // Address
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText('Address', contentX, contentY);
    contentY += 18;

    ctx.fillStyle = '#fff';
    ctx.font = '12px monospace';
    const truncatedAddr = `${contract.address.slice(0, 10)}...${contract.address.slice(-8)}`;
    ctx.fillText(truncatedAddr, contentX, contentY);
    contentY += 30;

    // Stats row
    this.drawStat(ctx, contentX, contentY, 'Transactions', contract.txCount.toString());
    this.drawStat(ctx, contentX + 120, contentY, 'Velocity', `${contract.velocity.toFixed(2)}/s`);
    this.drawStat(ctx, contentX + 240, contentY, 'Rank', `#${contract.rank}`);
    contentY += 50;

    // Heat bar
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.fillText('Activity Heat', contentX, contentY);
    contentY += 15;

    // Heat bar background
    const barWidth = width - padding * 2;
    const barHeight = 8;
    ctx.fillStyle = '#222';
    this.roundRect(ctx, contentX, contentY, barWidth, barHeight, 4);
    ctx.fill();

    // Heat bar fill
    const gradient = ctx.createLinearGradient(contentX, 0, contentX + barWidth, 0);
    gradient.addColorStop(0, '#3B82F6');
    gradient.addColorStop(0.5, '#F59E0B');
    gradient.addColorStop(1, '#EF4444');
    ctx.fillStyle = gradient;
    this.roundRect(ctx, contentX, contentY, barWidth * contract.heat, barHeight, 4);
    ctx.fill();

    contentY += 20;

    // Mini visualization container
    const miniVizBounds = {
      x: contentX,
      y: contentY,
      width: width - padding * 2,
      height: MINI_VIZ_HEIGHT,
    };
    // Save canvas state before mini viz (it changes textAlign, etc.)
    ctx.save();
    ctx.globalAlpha = 1;
    this.miniViz.render(ctx, miniVizBounds, 0.016); // Approximate 60fps dt
    ctx.restore();
    // Restore alpha after mini viz
    ctx.globalAlpha = alpha;
    contentY += MINI_VIZ_HEIGHT + 15;

    // Recent transactions header
    ctx.fillStyle = '#888';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('Recent Transactions', contentX, contentY);
    contentY += 20;

    // Recent transactions list
    ctx.font = '10px monospace';
    const maxTxs = Math.min(4, contract.recentTxs.length);

    for (let i = 0; i < maxTxs; i++) {
      const tx = contract.recentTxs[i];
      const txHash = `${tx.hash.slice(0, 10)}...${tx.hash.slice(-6)}`;
      const from = `${tx.from.slice(0, 8)}...`;
      const isHovered = this.hoveredTxHash === tx.hash;

      // Draw hover background
      if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.1)';
        this.roundRect(ctx, contentX - 4, contentY - 12, width - padding * 2 + 8, 16, 3);
        ctx.fill();
      }

      // Draw tx hash (clickable)
      ctx.fillStyle = isHovered ? '#00D9A5' : '#888';
      ctx.fillText(txHash, contentX, contentY);

      ctx.fillStyle = '#444';
      ctx.fillText(`from ${from}`, contentX + 150, contentY);

      // Store hit box for click detection
      this.txHitBoxes.push({
        tx,
        x: contentX - 4,
        y: contentY - 12,
        width: width - padding * 2 + 8,
        height: 16,
      });

      contentY += 18;
    }

    if (contract.recentTxs.length === 0) {
      ctx.fillStyle = '#444';
      ctx.fillText('No recent transactions', contentX, contentY);
    }
  }

  private drawStat(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    label: string,
    value: string
  ): void {
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.fillText(value, x, y + 20);
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
