/**
 * OpcodeView - Renders opcode gas breakdown in the expanded modal
 * Shows categorized gas usage with horizontal bars
 */

import type { OpcodeBreakdown, OpcodeCategory } from '../../streams/OpcodeStream';

export interface OpcodeViewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Format gas number to human readable string
 */
function formatGas(gas: number): string {
  if (gas >= 1000000) {
    return `${(gas / 1000000).toFixed(1)}M`;
  } else if (gas >= 1000) {
    return `${(gas / 1000).toFixed(1)}K`;
  }
  return gas.toString();
}

export class OpcodeView {
  private breakdown: OpcodeBreakdown | null = null;
  private isLoading = false;
  private error: string | null = null;
  private loadingPhase = 0;
  private hoveredCategory: OpcodeCategory | null = null;
  private categoryHitBoxes: Array<{ category: OpcodeCategory; x: number; y: number; width: number; height: number }> = [];

  /**
   * Set the opcode breakdown data
   */
  setBreakdown(breakdown: OpcodeBreakdown | null): void {
    this.breakdown = breakdown;
    this.error = null;
    this.isLoading = false;
  }

  /**
   * Set loading state
   */
  setLoading(loading: boolean): void {
    this.isLoading = loading;
  }

  /**
   * Set error message
   */
  setError(error: string | null): void {
    this.error = error;
    this.isLoading = false;
  }

  /**
   * Render the opcode view
   */
  render(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds, dt: number): void {
    // Update loading animation
    if (this.isLoading) {
      this.loadingPhase += dt * 2;
    }

    // Clear hit boxes
    this.categoryHitBoxes = [];

    // Draw background
    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(bounds.x, bounds.y, bounds.width, bounds.height);

    if (this.isLoading) {
      this.renderLoading(ctx, bounds);
      return;
    }

    if (this.error) {
      this.renderError(ctx, bounds);
      return;
    }

    if (!this.breakdown) {
      this.renderEmpty(ctx, bounds);
      return;
    }

    this.renderBreakdown(ctx, bounds);
  }

  private renderBreakdown(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds): void {
    const breakdown = this.breakdown!;
    const padding = 20;
    let y = bounds.y + padding;

    // Title
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('OPCODE GAS BREAKDOWN', bounds.x + padding, y);
    y += 30;

    // Summary stats
    ctx.fillStyle = '#888';
    ctx.font = '12px monospace';
    ctx.fillText(
      `Total Gas: ${formatGas(breakdown.totalGas)} | Opcodes Executed: ${breakdown.opcodeCount.toLocaleString()}`,
      bounds.x + padding,
      y
    );
    y += 30;

    // Category bars
    const barMaxWidth = bounds.width - padding * 2 - 200; // Leave space for labels
    const barHeight = 24;
    const barGap = 8;

    for (const category of breakdown.categories) {
      if (category.percent < 0.5) continue; // Skip tiny categories

      const barWidth = Math.max(2, (category.percent / 100) * barMaxWidth);
      const isHovered = this.hoveredCategory === category;

      // Store hit box
      this.categoryHitBoxes.push({
        category,
        x: bounds.x + padding,
        y,
        width: bounds.width - padding * 2,
        height: barHeight,
      });

      // Category name
      ctx.fillStyle = isHovered ? '#fff' : '#ccc';
      ctx.font = '11px monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(category.name, bounds.x + padding, y + barHeight / 2);

      // Bar background
      ctx.fillStyle = '#1a1a1a';
      this.roundRect(ctx, bounds.x + padding + 120, y + 2, barMaxWidth, barHeight - 4, 3);
      ctx.fill();

      // Bar fill
      ctx.fillStyle = isHovered ? this.lightenColor(category.color) : category.color;
      if (barWidth > 0) {
        this.roundRect(ctx, bounds.x + padding + 120, y + 2, barWidth, barHeight - 4, 3);
        ctx.fill();
      }

      // Percentage and gas
      ctx.fillStyle = isHovered ? '#fff' : '#888';
      ctx.textAlign = 'right';
      ctx.fillText(
        `${category.percent.toFixed(1)}% ${formatGas(category.gasUsed)}`,
        bounds.x + bounds.width - padding,
        y + barHeight / 2
      );

      y += barHeight + barGap;
    }

    y += 20;

    // Top opcodes section
    if (y < bounds.y + bounds.height - 150) {
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'left';
      ctx.fillText('TOP GAS CONSUMERS', bounds.x + padding, y);
      y += 25;

      ctx.font = '11px monospace';
      for (let i = 0; i < Math.min(5, breakdown.topOpcodes.length); i++) {
        const opcode = breakdown.topOpcodes[i];

        ctx.fillStyle = '#00D9A5';
        ctx.fillText(`${i + 1}.`, bounds.x + padding, y);

        ctx.fillStyle = '#fff';
        ctx.fillText(opcode.op, bounds.x + padding + 25, y);

        ctx.fillStyle = '#888';
        ctx.fillText(
          `${formatGas(opcode.gasUsed)} gas (${opcode.percent.toFixed(1)}%) - ${opcode.count.toLocaleString()} calls`,
          bounds.x + padding + 120,
          y
        );

        y += 20;
      }
    }

    // Hovered category tooltip
    if (this.hoveredCategory) {
      this.renderCategoryTooltip(ctx, bounds);
    }
  }

  private renderCategoryTooltip(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds): void {
    const category = this.hoveredCategory!;
    const hitBox = this.categoryHitBoxes.find(h => h.category === category);
    if (!hitBox) return;

    const tooltipWidth = 250;
    const tooltipHeight = 80;
    let tooltipX = hitBox.x + hitBox.width / 2 - tooltipWidth / 2;
    let tooltipY = hitBox.y + hitBox.height + 8;

    // Keep in bounds
    tooltipX = Math.max(bounds.x + 10, Math.min(tooltipX, bounds.x + bounds.width - tooltipWidth - 10));
    if (tooltipY + tooltipHeight > bounds.y + bounds.height - 10) {
      tooltipY = hitBox.y - tooltipHeight - 8;
    }

    // Draw tooltip
    ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    this.roundRect(ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, 6);
    ctx.fill();

    ctx.strokeStyle = category.color;
    ctx.lineWidth = 2;
    this.roundRect(ctx, tooltipX, tooltipY, tooltipWidth, tooltipHeight, 6);
    ctx.stroke();

    const padding = 10;
    let y = tooltipY + padding;

    ctx.fillStyle = category.color;
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(category.name, tooltipX + padding, y);
    y += 18;

    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(category.description, tooltipX + padding, y);
    y += 16;

    ctx.fillStyle = '#fff';
    ctx.fillText(
      `${category.count.toLocaleString()} operations | ${formatGas(category.gasUsed)} gas`,
      tooltipX + padding,
      y
    );
    y += 16;

    ctx.fillStyle = '#666';
    ctx.fillText(
      `Opcodes: ${category.opcodes.slice(0, 5).join(', ')}${category.opcodes.length > 5 ? '...' : ''}`,
      tooltipX + padding,
      y
    );
  }

  private renderLoading(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds): void {
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;

    // Pulsing text
    const pulse = Math.sin(this.loadingPhase) * 0.3 + 0.7;
    ctx.fillStyle = `rgba(0, 217, 165, ${pulse})`;
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Loading opcode trace...', centerX, centerY - 20);

    // Spinning dots
    const radius = 20;
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2 + this.loadingPhase;
      const dotX = centerX + Math.cos(angle) * radius;
      const dotY = centerY + 20 + Math.sin(angle) * radius;
      const alpha = (i / 8) * 0.8 + 0.2;

      ctx.fillStyle = `rgba(0, 217, 165, ${alpha})`;
      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private renderError(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds): void {
    ctx.fillStyle = '#EF4444';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      this.error || 'Error loading opcode trace',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  }

  private renderEmpty(ctx: CanvasRenderingContext2D, bounds: OpcodeViewBounds): void {
    ctx.fillStyle = '#666';
    ctx.font = '14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      'Select a transaction to view opcode breakdown',
      bounds.x + bounds.width / 2,
      bounds.y + bounds.height / 2
    );
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(mx: number, my: number): boolean {
    let newHovered: OpcodeCategory | null = null;

    for (const hitBox of this.categoryHitBoxes) {
      if (
        mx >= hitBox.x &&
        mx <= hitBox.x + hitBox.width &&
        my >= hitBox.y &&
        my <= hitBox.y + hitBox.height
      ) {
        newHovered = hitBox.category;
        break;
      }
    }

    if (newHovered !== this.hoveredCategory) {
      this.hoveredCategory = newHovered;
      return true;
    }

    return false;
  }

  /**
   * Clear state
   */
  clear(): void {
    this.breakdown = null;
    this.error = null;
    this.isLoading = false;
    this.hoveredCategory = null;
    this.categoryHitBoxes = [];
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
