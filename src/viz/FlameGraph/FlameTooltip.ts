import type { FlameFrame } from './types';

const TOOLTIP_PADDING = 12;
const TOOLTIP_WIDTH = 280;
const LINE_HEIGHT = 16;

/**
 * Canvas 2D tooltip overlay for flame graph hover details
 */
export class FlameTooltip {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private currentFrame: FlameFrame | null = null;
  private x = 0;
  private y = 0;
  private isVisible = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context for tooltip');
    this.ctx = ctx;
  }

  /**
   * Show tooltip for a frame
   */
  show(frame: FlameFrame, x: number, y: number): void {
    this.currentFrame = frame;
    this.x = x;
    this.y = y;
    this.isVisible = true;
    this.render();
  }

  /**
   * Update tooltip position
   */
  updatePosition(x: number, y: number): void {
    if (!this.isVisible) return;
    this.x = x;
    this.y = y;
    this.render();
  }

  /**
   * Hide the tooltip
   */
  hide(): void {
    this.currentFrame = null;
    this.isVisible = false;
    this.clear();
  }

  private clear(): void {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  private render(): void {
    if (!this.currentFrame || !this.isVisible) return;

    this.clear();

    const frame = this.currentFrame;
    const lines = this.buildTooltipLines(frame);

    const tooltipHeight = lines.length * LINE_HEIGHT + TOOLTIP_PADDING * 2;

    // Position tooltip (avoid edges)
    let drawX = this.x + 15;
    let drawY = this.y + 15;

    if (drawX + TOOLTIP_WIDTH > this.canvas.width - 10) {
      drawX = this.x - TOOLTIP_WIDTH - 15;
    }
    if (drawY + tooltipHeight > this.canvas.height - 10) {
      drawY = this.canvas.height - tooltipHeight - 10;
    }
    drawX = Math.max(10, drawX);
    drawY = Math.max(10, drawY);

    // Draw background
    this.ctx.fillStyle = 'rgba(15, 15, 20, 0.95)';
    this.roundRect(drawX, drawY, TOOLTIP_WIDTH, tooltipHeight, 8);
    this.ctx.fill();

    // Draw border
    this.ctx.strokeStyle = frame.hasError ? '#EF4444' : '#00D9A5';
    this.ctx.lineWidth = 1;
    this.roundRect(drawX, drawY, TOOLTIP_WIDTH, tooltipHeight, 8);
    this.ctx.stroke();

    // Draw text
    this.ctx.font = '11px monospace';
    let textY = drawY + TOOLTIP_PADDING + LINE_HEIGHT - 4;

    for (const line of lines) {
      if (line.type === 'separator') {
        this.ctx.fillStyle = '#333';
        this.ctx.fillText('─'.repeat(32), drawX + TOOLTIP_PADDING, textY);
      } else if (line.type === 'error') {
        this.ctx.fillStyle = '#EF4444';
        this.ctx.font = 'bold 11px monospace';
        this.ctx.fillText(line.text, drawX + TOOLTIP_PADDING, textY);
        this.ctx.font = '11px monospace';
      } else if (line.type === 'label') {
        this.ctx.fillStyle = '#888';
        this.ctx.fillText(line.text, drawX + TOOLTIP_PADDING, textY);
      } else {
        this.ctx.fillStyle = '#fff';
        this.ctx.fillText(line.text, drawX + TOOLTIP_PADDING, textY);
      }
      textY += LINE_HEIGHT;
    }
  }

  private buildTooltipLines(
    frame: FlameFrame
  ): Array<{ type: 'text' | 'label' | 'separator' | 'error'; text: string }> {
    const lines: Array<{ type: 'text' | 'label' | 'separator' | 'error'; text: string }> = [];

    // Contract address
    const truncatedAddr = `${frame.address.slice(0, 10)}...${frame.address.slice(-8)}`;
    lines.push({ type: 'label', text: 'Contract' });
    lines.push({ type: 'text', text: truncatedAddr });

    // Function
    const funcDisplay = frame.functionName || frame.functionSig;
    lines.push({ type: 'label', text: 'Function' });
    lines.push({ type: 'text', text: funcDisplay.length > 30 ? funcDisplay.slice(0, 27) + '...' : funcDisplay });

    // Type
    lines.push({ type: 'label', text: 'Type' });
    lines.push({ type: 'text', text: frame.contractType.toUpperCase() });

    lines.push({ type: 'separator', text: '' });

    // Gas metrics
    lines.push({ type: 'label', text: 'Gas Used' });
    lines.push({ type: 'text', text: frame.gasUsed.toLocaleString() });

    lines.push({ type: 'label', text: 'Gas Total (incl. children)' });
    lines.push({ type: 'text', text: frame.gasTotal.toLocaleString() });

    lines.push({ type: 'label', text: 'Gas %' });
    lines.push({ type: 'text', text: `${frame.gasPercent.toFixed(2)}%` });

    lines.push({ type: 'separator', text: '' });

    // Call info
    lines.push({ type: 'label', text: 'Call Type' });
    lines.push({ type: 'text', text: frame.callType });

    lines.push({ type: 'label', text: 'Stack Depth' });
    lines.push({ type: 'text', text: frame.depth.toString() });

    // Error
    if (frame.hasError) {
      lines.push({ type: 'separator', text: '' });
      lines.push({ type: 'error', text: 'REVERTED' });
    }

    return lines;
  }

  private roundRect(x: number, y: number, w: number, h: number, r: number): void {
    this.ctx.beginPath();
    this.ctx.moveTo(x + r, y);
    this.ctx.lineTo(x + w - r, y);
    this.ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    this.ctx.lineTo(x + w, y + h - r);
    this.ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    this.ctx.lineTo(x + r, y + h);
    this.ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    this.ctx.lineTo(x, y + r);
    this.ctx.quadraticCurveTo(x, y, x + r, y);
    this.ctx.closePath();
  }

  /**
   * Resize the tooltip canvas
   */
  resize(width: number, height: number): void {
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = width * ratio;
    this.canvas.height = height * ratio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.scale(ratio, ratio);
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clear();
  }
}
