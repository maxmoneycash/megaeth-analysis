/**
 * AnalyticsModal - Full-screen modal for detailed gas analytics
 * Shows time-based breakdowns and per-contract function analysis
 */

import type { GasAnalytics, TimeWindowStats } from './GasAnalytics';

type TimeWindow = '1m' | '1h' | '24h' | '7d';

interface TabHitBox {
  window: TimeWindow;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ContractHitBox {
  address: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnalyticsModalCallbacks {
  onClose: () => void;
}

/**
 * Format gas to human readable
 */
function formatGas(gas: number): string {
  if (gas >= 1e9) return `${(gas / 1e9).toFixed(2)}B`;
  if (gas >= 1e6) return `${(gas / 1e6).toFixed(2)}M`;
  if (gas >= 1e3) return `${(gas / 1e3).toFixed(1)}K`;
  return gas.toString();
}

/**
 * Format address for display
 */
function truncateAddress(addr: string): string {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

export class AnalyticsModal {
  private isOpen = false;
  private analytics: GasAnalytics | null = null;
  private callbacks: AnalyticsModalCallbacks | null = null;
  private animProgress = 0;

  private activeWindow: TimeWindow = '1h';
  private selectedContract: string | null = null;
  private stats: TimeWindowStats | null = null;

  private tabHitBoxes: TabHitBox[] = [];
  private contractHitBoxes: ContractHitBox[] = [];
  private closeButtonHitBox = { x: 0, y: 0, width: 0, height: 0 };
  private modalBounds = { x: 0, y: 0, width: 0, height: 0 };

  private hoveredTab: TimeWindow | null = null;
  private hoveredContract: string | null = null;
  private isCloseHovered = false;

  private readonly HEADER_HEIGHT = 60;
  private readonly TAB_HEIGHT = 36;
  private readonly PADDING = 16;

  setCallbacks(callbacks: AnalyticsModalCallbacks): void {
    this.callbacks = callbacks;
  }

  setAnalytics(analytics: GasAnalytics): void {
    this.analytics = analytics;
  }

  open(): void {
    this.isOpen = true;
    this.animProgress = 0;
    this.selectedContract = null;
    this.refreshStats();
  }

  close(): void {
    this.isOpen = false;
    this.callbacks?.onClose();
  }

  get isVisible(): boolean {
    return this.isOpen || this.animProgress > 0.01;
  }

  private refreshStats(): void {
    if (this.analytics) {
      this.stats = this.analytics.getStats(this.activeWindow);
    }
  }

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

    // Refresh stats periodically when open
    if (this.isOpen && Math.random() < 0.02) {
      this.refreshStats();
    }

    // Clear hit boxes
    this.tabHitBoxes = [];
    this.contractHitBoxes = [];

    // Draw backdrop
    ctx.fillStyle = `rgba(0, 0, 0, ${0.85 * this.animProgress})`;
    ctx.fillRect(0, 0, width, height);

    // Modal dimensions (larger than VizModal)
    const margin = 30;
    const modalWidth = Math.min(1000, width - margin * 2);
    const modalHeight = Math.min(700, height - margin * 2);

    const scale = 0.9 + this.animProgress * 0.1;
    const scaledWidth = modalWidth * scale;
    const scaledHeight = modalHeight * scale;
    const scaledX = (width - scaledWidth) / 2;
    const scaledY = (height - scaledHeight) / 2;

    this.modalBounds = { x: scaledX, y: scaledY, width: scaledWidth, height: scaledHeight };

    ctx.save();
    ctx.globalAlpha = this.animProgress;

    // Modal background
    ctx.fillStyle = '#0a0a0f';
    this.roundRect(ctx, scaledX, scaledY, scaledWidth, scaledHeight, 12);
    ctx.fill();

    // Border
    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 2;
    this.roundRect(ctx, scaledX, scaledY, scaledWidth, scaledHeight, 12);
    ctx.stroke();

    if (this.animProgress > 0.5) {
      this.renderHeader(ctx, scaledX, scaledY, scaledWidth);
      this.renderTabs(ctx, scaledX, scaledY + this.HEADER_HEIGHT, scaledWidth);

      const contentY = scaledY + this.HEADER_HEIGHT + this.TAB_HEIGHT;
      const contentHeight = scaledHeight - this.HEADER_HEIGHT - this.TAB_HEIGHT;

      if (this.selectedContract) {
        this.renderContractDetail(ctx, scaledX, contentY, scaledWidth, contentHeight);
      } else {
        this.renderOverview(ctx, scaledX, contentY, scaledWidth, contentHeight);
      }
    }

    ctx.restore();
  }

  private renderHeader(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 18px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Gas Analytics', x + this.PADDING, y + this.HEADER_HEIGHT / 2);

    // Stats summary
    if (this.stats) {
      ctx.fillStyle = '#888';
      ctx.font = '12px monospace';
      ctx.fillText(
        `${formatGas(this.stats.totalGas)} gas | ${this.stats.totalTxCount} txns | ${this.stats.contracts.length} contracts`,
        x + 180,
        y + this.HEADER_HEIGHT / 2
      );
    }

    // Close button
    const closeSize = 28;
    const closeX = x + width - this.PADDING - closeSize;
    const closeY = y + (this.HEADER_HEIGHT - closeSize) / 2;
    this.closeButtonHitBox = { x: closeX, y: closeY, width: closeSize, height: closeSize };

    ctx.fillStyle = this.isCloseHovered ? '#EF4444' : '#666';
    ctx.font = 'bold 20px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('×', closeX + closeSize / 2, closeY + closeSize / 2);

    // Back button if viewing contract detail
    if (this.selectedContract) {
      ctx.fillStyle = '#00D9A5';
      ctx.font = '12px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('← Back to overview', x + this.PADDING, y + this.HEADER_HEIGHT - 12);
    }
  }

  private renderTabs(ctx: CanvasRenderingContext2D, x: number, y: number, width: number): void {
    const windows: TimeWindow[] = ['1m', '1h', '24h', '7d'];
    const labels: Record<TimeWindow, string> = {
      '1m': 'Last Minute',
      '1h': 'Last Hour',
      '24h': 'Last 24 Hours',
      '7d': 'Last 7 Days',
    };

    let tabX = x + this.PADDING;
    const tabY = y + 4;
    const tabHeight = this.TAB_HEIGHT - 8;

    for (const win of windows) {
      const isActive = this.activeWindow === win;
      const isHovered = this.hoveredTab === win;

      ctx.font = '11px monospace';
      const textWidth = ctx.measureText(labels[win]).width;
      const tabWidth = textWidth + 20;

      this.tabHitBoxes.push({ window: win, x: tabX, y: tabY, width: tabWidth, height: tabHeight });

      if (isActive) {
        ctx.fillStyle = '#00D9A5';
        this.roundRect(ctx, tabX, tabY, tabWidth, tabHeight, 4);
        ctx.fill();
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.2)';
        this.roundRect(ctx, tabX, tabY, tabWidth, tabHeight, 4);
        ctx.fill();
      }

      ctx.fillStyle = isActive ? '#000' : isHovered ? '#00D9A5' : '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(labels[win], tabX + tabWidth / 2, tabY + tabHeight / 2);

      tabX += tabWidth + 8;
    }

    // Separator
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + this.TAB_HEIGHT);
    ctx.lineTo(x + width, y + this.TAB_HEIGHT);
    ctx.stroke();
  }

  private renderOverview(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    if (!this.stats) {
      ctx.fillStyle = '#666';
      ctx.font = '14px monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('No data yet. Activity will appear as transactions flow in.', x + width / 2, y + height / 2);
      return;
    }

    const leftWidth = width * 0.55;
    const rightWidth = width * 0.45 - this.PADDING;

    // Left: Top Contracts
    this.renderContractList(ctx, x + this.PADDING, y + this.PADDING, leftWidth - this.PADDING * 2, height - this.PADDING * 2);

    // Right: Top Functions
    this.renderFunctionList(ctx, x + leftWidth, y + this.PADDING, rightWidth, height - this.PADDING * 2);
  }

  private renderContractList(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.fillStyle = '#00D9A5';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TOP CONTRACTS BY GAS', x, y);

    const contracts = this.stats?.contracts.slice(0, 15) || [];
    const rowHeight = 32;
    let rowY = y + 24;

    for (const contract of contracts) {
      if (rowY + rowHeight > y + height) break;

      const isHovered = this.hoveredContract === contract.address;

      // Background on hover
      if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.1)';
        ctx.fillRect(x - 4, rowY - 2, width + 8, rowHeight);
      }

      this.contractHitBoxes.push({
        address: contract.address,
        x: x - 4,
        y: rowY - 2,
        width: width + 8,
        height: rowHeight,
      });

      // Gas bar
      const barWidth = (contract.percentOfTotal / 100) * (width - 200);
      ctx.fillStyle = isHovered ? '#00D9A5' : '#1a4a3a';
      ctx.fillRect(x, rowY + 4, Math.max(2, barWidth), 8);

      // Address
      ctx.fillStyle = isHovered ? '#00D9A5' : '#ccc';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(truncateAddress(contract.address), x, rowY + 16);

      // Gas amount
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(`${formatGas(contract.totalGas)} (${contract.percentOfTotal.toFixed(1)}%)`, x + width - 80, rowY + 4);

      // Tx count
      ctx.fillStyle = '#666';
      ctx.fillText(`${contract.txCount} txns`, x + width, rowY + 16);

      rowY += rowHeight;
    }

    if (contracts.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No contract activity yet', x + width / 2, y + 60);
    }
  }

  private renderFunctionList(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    ctx.fillStyle = '#F59E0B';
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('TOP FUNCTIONS BY GAS', x, y);

    const functions = this.stats?.topFunctions.slice(0, 15) || [];
    const rowHeight = 28;
    let rowY = y + 24;

    for (const fn of functions) {
      if (rowY + rowHeight > y + height) break;

      // Gas bar
      const barWidth = (fn.percentOfContract / 100) * (width - 120);
      ctx.fillStyle = '#4a3a1a';
      ctx.fillRect(x, rowY + 2, Math.max(2, barWidth), 6);

      // Function name
      ctx.fillStyle = '#F59E0B';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      const displayName = fn.name.length > 20 ? fn.name.slice(0, 18) + '...' : fn.name;
      ctx.fillText(displayName, x, rowY + 12);

      // Gas and count
      ctx.fillStyle = '#888';
      ctx.textAlign = 'right';
      ctx.fillText(`${formatGas(fn.totalGas)} (${fn.callCount}x)`, x + width, rowY + 12);

      rowY += rowHeight;
    }

    if (functions.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '11px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('No function data yet', x + width / 2, y + 60);
    }
  }

  private renderContractDetail(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
    const contract = this.stats?.contracts.find(c => c.address === this.selectedContract);
    if (!contract) {
      this.selectedContract = null;
      return;
    }

    // Contract header
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`Contract: ${contract.address}`, x + this.PADDING, y + this.PADDING);

    // Stats row
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Total Gas: ${formatGas(contract.totalGas)} | Transactions: ${contract.txCount} | Avg Gas/Tx: ${formatGas(contract.avgGasPerTx)}`,
      x + this.PADDING,
      y + this.PADDING + 24
    );

    // Function breakdown
    ctx.fillStyle = '#00D9A5';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('FUNCTION BREAKDOWN', x + this.PADDING, y + this.PADDING + 56);

    const functions = contract.functionBreakdown;
    const rowHeight = 36;
    let rowY = y + this.PADDING + 80;
    const barMaxWidth = width - this.PADDING * 2 - 250;

    for (const fn of functions) {
      if (rowY + rowHeight > y + height - this.PADDING) break;

      // Gas bar
      const barWidth = (fn.percentOfContract / 100) * barMaxWidth;
      ctx.fillStyle = '#1a4a3a';
      ctx.fillRect(x + this.PADDING, rowY, Math.max(2, barWidth), 12);

      // Percentage inside bar
      if (barWidth > 30) {
        ctx.fillStyle = '#00D9A5';
        ctx.font = '9px monospace';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${fn.percentOfContract.toFixed(1)}%`, x + this.PADDING + 4, rowY + 6);
      }

      // Function name and selector
      ctx.fillStyle = '#fff';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(fn.name, x + this.PADDING, rowY + 16);

      ctx.fillStyle = '#666';
      ctx.font = '9px monospace';
      ctx.fillText(fn.selector, x + this.PADDING + 150, rowY + 17);

      // Stats
      ctx.fillStyle = '#888';
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${formatGas(fn.totalGas)}`, x + width - this.PADDING - 100, rowY + 4);
      ctx.fillText(`${fn.callCount} calls`, x + width - this.PADDING - 100, rowY + 18);

      ctx.fillStyle = '#666';
      ctx.fillText(`avg ${formatGas(fn.avgGas)}`, x + width - this.PADDING, rowY + 4);

      rowY += rowHeight;
    }
  }

  handleMouseMove(mx: number, my: number): boolean {
    let changed = false;

    // Close button
    const wasCloseHovered = this.isCloseHovered;
    this.isCloseHovered =
      mx >= this.closeButtonHitBox.x &&
      mx <= this.closeButtonHitBox.x + this.closeButtonHitBox.width &&
      my >= this.closeButtonHitBox.y &&
      my <= this.closeButtonHitBox.y + this.closeButtonHitBox.height;
    if (wasCloseHovered !== this.isCloseHovered) changed = true;

    // Tabs
    let newHoveredTab: TimeWindow | null = null;
    for (const hitBox of this.tabHitBoxes) {
      if (mx >= hitBox.x && mx <= hitBox.x + hitBox.width &&
          my >= hitBox.y && my <= hitBox.y + hitBox.height) {
        newHoveredTab = hitBox.window;
        break;
      }
    }
    if (newHoveredTab !== this.hoveredTab) {
      this.hoveredTab = newHoveredTab;
      changed = true;
    }

    // Contracts
    let newHoveredContract: string | null = null;
    for (const hitBox of this.contractHitBoxes) {
      if (mx >= hitBox.x && mx <= hitBox.x + hitBox.width &&
          my >= hitBox.y && my <= hitBox.y + hitBox.height) {
        newHoveredContract = hitBox.address;
        break;
      }
    }
    if (newHoveredContract !== this.hoveredContract) {
      this.hoveredContract = newHoveredContract;
      changed = true;
    }

    return changed;
  }

  handleClick(mx: number, my: number): boolean {
    // Click outside to close
    const isOutside =
      mx < this.modalBounds.x ||
      mx > this.modalBounds.x + this.modalBounds.width ||
      my < this.modalBounds.y ||
      my > this.modalBounds.y + this.modalBounds.height;

    if (isOutside) {
      this.close();
      return true;
    }

    // Close button
    if (this.isCloseHovered) {
      this.close();
      return true;
    }

    // Back button (if in contract detail)
    if (this.selectedContract) {
      const backX = this.modalBounds.x + this.PADDING;
      const backY = this.modalBounds.y + this.HEADER_HEIGHT - 20;
      if (mx >= backX && mx <= backX + 150 && my >= backY && my <= backY + 20) {
        this.selectedContract = null;
        return true;
      }
    }

    // Tabs
    for (const hitBox of this.tabHitBoxes) {
      if (mx >= hitBox.x && mx <= hitBox.x + hitBox.width &&
          my >= hitBox.y && my <= hitBox.y + hitBox.height) {
        this.activeWindow = hitBox.window;
        this.refreshStats();
        return true;
      }
    }

    // Contracts
    if (!this.selectedContract) {
      for (const hitBox of this.contractHitBoxes) {
        if (mx >= hitBox.x && mx <= hitBox.x + hitBox.width &&
            my >= hitBox.y && my <= hitBox.y + hitBox.height) {
          this.selectedContract = hitBox.address;
          return true;
        }
      }
    }

    return true;
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
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
