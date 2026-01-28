/**
 * Tab switcher for inline visualizations
 * Renders [Flame] [Tree] [Replay] tabs + [Expand] button
 */

import type { VizType, VizTab, TabHitBox } from './types';

const TABS: VizTab[] = [
  { type: 'flame', label: 'Flame' },
  { type: 'tree', label: 'Tree' },
  { type: 'replay', label: 'Replay' },
];

const TAB_HEIGHT = 24;
const TAB_PADDING = 8;
const TAB_GAP = 4;
const EXPAND_WIDTH = 70;

export class VizSwitcher {
  private activeTab: VizType = 'flame';
  private hoveredTab: VizType | null = null;
  private hoveredExpand = false;
  private tabHitBoxes: TabHitBox[] = [];
  private expandHitBox = { x: 0, y: 0, width: 0, height: 0 };
  private onTabChange?: (tab: VizType) => void;
  private onExpandClick?: () => void;

  /**
   * Set callback for tab changes
   */
  setOnTabChange(callback: (tab: VizType) => void): void {
    this.onTabChange = callback;
  }

  /**
   * Set callback for expand button click
   */
  setOnExpandClick(callback: () => void): void {
    this.onExpandClick = callback;
  }

  /**
   * Set the active tab programmatically
   */
  setActiveTab(tab: VizType): void {
    this.activeTab = tab;
  }

  /**
   * Get current active tab
   */
  getActiveTab(): VizType {
    return this.activeTab;
  }

  /**
   * Render the tab switcher
   */
  render(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    availableWidth: number
  ): number {
    this.tabHitBoxes = [];

    // Calculate tab widths
    ctx.font = '11px monospace';
    let tabX = x;

    for (const tab of TABS) {
      const textWidth = ctx.measureText(tab.label).width;
      const tabWidth = textWidth + TAB_PADDING * 2;
      const isActive = this.activeTab === tab.type;
      const isHovered = this.hoveredTab === tab.type;

      // Draw tab background
      if (isActive) {
        ctx.fillStyle = '#00D9A5';
      } else if (isHovered) {
        ctx.fillStyle = 'rgba(0, 217, 165, 0.3)';
      } else {
        ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
      }

      this.roundRect(ctx, tabX, y, tabWidth, TAB_HEIGHT, 4);
      ctx.fill();

      // Draw tab text
      ctx.fillStyle = isActive ? '#0a0a0a' : '#888';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tab.label, tabX + tabWidth / 2, y + TAB_HEIGHT / 2);

      // Store hit box
      this.tabHitBoxes.push({
        type: tab.type,
        x: tabX,
        y,
        width: tabWidth,
        height: TAB_HEIGHT,
      });

      tabX += tabWidth + TAB_GAP;
    }

    // Draw expand button on the right
    const expandX = x + availableWidth - EXPAND_WIDTH;

    ctx.fillStyle = this.hoveredExpand
      ? 'rgba(0, 217, 165, 0.3)'
      : 'rgba(255, 255, 255, 0.1)';
    this.roundRect(ctx, expandX, y, EXPAND_WIDTH, TAB_HEIGHT, 4);
    ctx.fill();

    // Draw border
    ctx.strokeStyle = 'rgba(0, 217, 165, 0.5)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, expandX, y, EXPAND_WIDTH, TAB_HEIGHT, 4);
    ctx.stroke();

    // Draw expand text with arrow
    ctx.fillStyle = this.hoveredExpand ? '#00D9A5' : '#888';
    ctx.textAlign = 'center';
    ctx.fillText('Expand ↗', expandX + EXPAND_WIDTH / 2, y + TAB_HEIGHT / 2);

    // Store expand hit box
    this.expandHitBox = {
      x: expandX,
      y,
      width: EXPAND_WIDTH,
      height: TAB_HEIGHT,
    };

    return TAB_HEIGHT;
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(mx: number, my: number): boolean {
    let changed = false;

    // Check tabs
    let newHovered: VizType | null = null;
    for (const hitBox of this.tabHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        newHovered = hitBox.type;
        break;
      }
    }

    if (newHovered !== this.hoveredTab) {
      this.hoveredTab = newHovered;
      changed = true;
    }

    // Check expand button
    const overExpand =
      mx >= this.expandHitBox.x &&
      mx <= this.expandHitBox.x + this.expandHitBox.width &&
      my >= this.expandHitBox.y &&
      my <= this.expandHitBox.y + this.expandHitBox.height;

    if (overExpand !== this.hoveredExpand) {
      this.hoveredExpand = overExpand;
      changed = true;
    }

    return changed;
  }

  /**
   * Handle click - returns true if click was handled
   */
  handleClick(mx: number, my: number): boolean {
    // Check tabs
    for (const hitBox of this.tabHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        if (hitBox.type !== this.activeTab) {
          this.activeTab = hitBox.type;
          this.onTabChange?.(hitBox.type);
        }
        return true;
      }
    }

    // Check expand button
    if (
      mx >= this.expandHitBox.x &&
      mx <= this.expandHitBox.x + this.expandHitBox.width &&
      my >= this.expandHitBox.y &&
      my <= this.expandHitBox.y + this.expandHitBox.height
    ) {
      this.onExpandClick?.();
      return true;
    }

    return false;
  }

  /**
   * Check if point is within switcher bounds
   */
  containsPoint(mx: number, my: number): boolean {
    // Check all hit boxes
    for (const hitBox of this.tabHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        return true;
      }
    }

    return (
      mx >= this.expandHitBox.x &&
      mx <= this.expandHitBox.x + this.expandHitBox.width &&
      my >= this.expandHitBox.y &&
      my <= this.expandHitBox.y + this.expandHitBox.height
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
