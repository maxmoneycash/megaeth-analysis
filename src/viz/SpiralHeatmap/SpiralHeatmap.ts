import type { Renderer } from '../../core/Renderer';
import type {
  ContractActivity,
  MiniBlock,
  RecentTransaction,
  SpiralSquare,
  SpiralHeatmapOptions,
} from './types';
import { ContractTracker } from './ContractTracker';
import { SpiralLayout } from './SpiralLayout';
import { HeatmapColors } from './HeatmapColors';
import { DetailPanel } from './DetailPanel';
import { smoothstep, lerp } from '../../utils/math';

const DEFAULT_OPTIONS: Required<SpiralHeatmapOptions> = {
  maxContracts: 50,
  baseSquareSize: 180,
  animationSpeed: 4,
  windowMs: 60000,
  colors: {},
};

/**
 * Golden Ratio Spiral Heatmap visualization.
 * Shows trending contracts with squares sized by Fibonacci sequence.
 */
export class SpiralHeatmap {
  private tracker: ContractTracker;
  private layout: SpiralLayout;
  private colors: HeatmapColors;
  private detailPanel: DetailPanel;
  private squares: SpiralSquare[] = [];
  private hoveredSquare: SpiralSquare | null = null;
  private options: Required<SpiralHeatmapOptions>;
  private lastLayoutHash = '';
  private pulsePhase = 0;

  constructor(options?: SpiralHeatmapOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    this.tracker = new ContractTracker({
      maxContracts: this.options.maxContracts,
      windowMs: this.options.windowMs,
      recentTxLimit: 20,
    });

    this.layout = new SpiralLayout({
      baseSize: this.options.baseSquareSize,
      maxSquares: this.options.maxContracts,
    });

    this.colors = new HeatmapColors(this.options.colors);
    this.detailPanel = new DetailPanel();
  }

  /**
   * Process incoming miniBlock data
   */
  processMiniBlock(block: MiniBlock): void {
    this.tracker.processMiniBlock(block);
  }

  /**
   * Main render loop
   */
  render(renderer: Renderer, dt: number): void {
    const ctx = renderer.context;
    const width = renderer.width;
    const height = renderer.height;

    // Update pulse animation
    this.pulsePhase += dt * 2;

    // Update layout center
    this.layout.setCenter(width / 2, height / 2);

    // Get current top contracts
    const contracts = this.tracker.getTopContracts(this.options.maxContracts);

    // Check if layout needs recalculation
    const layoutHash = contracts.map((c) => c.address + c.rank).join(',');
    if (layoutHash !== this.lastLayoutHash) {
      this.updateLayout(contracts, width, height);
      this.lastLayoutHash = layoutHash;
    }

    // Update square heat values and animations
    this.updateSquares(contracts, dt);

    // Clear canvas
    renderer.clear('#0a0a0a');

    // Draw squares (back to front for proper layering)
    const sortedSquares = [...this.squares].sort((a, b) => a.size - b.size);
    for (const square of sortedSquares) {
      this.drawSquare(ctx, square);
    }

    // Draw glow effects (separate pass with blend mode)
    ctx.globalCompositeOperation = 'screen';
    for (const square of this.squares) {
      if (square.heat > 0.3) {
        this.drawGlow(ctx, square);
      }
    }
    ctx.globalCompositeOperation = 'source-over';

    // Draw hover effect
    if (this.hoveredSquare && !this.detailPanel.isOpen) {
      this.drawHoverHighlight(ctx, this.hoveredSquare);
    }

    // Draw detail panel
    this.detailPanel.render(ctx, dt, width, height);

    // Draw stats overlay
    this.drawStats(ctx, contracts.length);
  }

  private updateLayout(contracts: ContractActivity[], width: number, height: number): void {
    // Calculate optimal base size
    const baseSize = SpiralLayout.calculateOptimalBaseSize(
      width,
      height,
      contracts.length
    );
    this.layout.setBaseSize(baseSize);

    // Get new positions
    const newPositions = this.layout.calculatePositions(contracts);

    // Update existing squares or create new ones
    for (const newPos of newPositions) {
      const existing = this.squares.find((s) => s.address === newPos.address);
      if (existing) {
        // Animate to new position
        existing.targetX = newPos.x;
        existing.targetY = newPos.y;
        existing.targetSize = newPos.size;
        if (existing.animProgress >= 1) {
          existing.animProgress = 0;
        }
      } else {
        // New square - start from center
        this.squares.push({
          ...newPos,
          x: width / 2,
          y: height / 2,
          size: 0,
          animProgress: 0,
        });
      }
    }

    // Remove squares that fell out of top N
    this.squares = this.squares.filter((s) =>
      newPositions.some((p) => p.address === s.address)
    );
  }

  private updateSquares(contracts: ContractActivity[], dt: number): void {
    const speed = this.options.animationSpeed;

    for (const square of this.squares) {
      // Update heat from tracker
      const contract = contracts.find((c) => c.address === square.address);
      if (contract) {
        square.heat = contract.heat;
      }

      // Animate position/size
      if (square.animProgress < 1) {
        square.animProgress = Math.min(1, square.animProgress + dt * speed);
        const t = smoothstep(0, 1, square.animProgress);

        square.x = lerp(square.x, square.targetX, t);
        square.y = lerp(square.y, square.targetY, t);
        square.size = lerp(square.size, square.targetSize, t);
      }
    }
  }

  private drawSquare(ctx: CanvasRenderingContext2D, square: SpiralSquare): void {
    const { x, y, size, heat } = square;
    if (size < 1) return;

    const color = this.colors.getColor(heat);
    const isHovered = this.hoveredSquare === square;
    const pulseAmount = heat > 0.7 ? Math.sin(this.pulsePhase) * 2 : 0;
    const drawSize = size + (isHovered ? 4 : 0) + pulseAmount;
    const drawX = x - (drawSize - size) / 2;
    const drawY = y - (drawSize - size) / 2;

    // Draw filled square with rounded corners
    ctx.fillStyle = color;
    this.roundRect(ctx, drawX, drawY, drawSize, drawSize, Math.min(8, drawSize * 0.1));
    ctx.fill();

    // Draw subtle inner border
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1;
    this.roundRect(ctx, drawX + 1, drawY + 1, drawSize - 2, drawSize - 2, Math.min(7, drawSize * 0.1));
    ctx.stroke();

    // Draw address label if square is large enough
    if (size > 70) {
      this.drawLabel(ctx, square, x, y, size);
    }
  }

  private drawLabel(
    ctx: CanvasRenderingContext2D,
    square: SpiralSquare,
    x: number,
    y: number,
    size: number
  ): void {
    const address = square.address;
    const truncated = `${address.slice(0, 6)}...${address.slice(-4)}`;

    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.font = `${Math.min(12, size * 0.12)}px monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Add text shadow for readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(truncated, x + size / 2, y + size / 2);
    ctx.restore();
  }

  private drawGlow(ctx: CanvasRenderingContext2D, square: SpiralSquare): void {
    const glow = this.colors.getGlow(square.heat);
    if (glow.alpha === 0) return;

    const { x, y, size } = square;
    const centerX = x + size / 2;
    const centerY = y + size / 2;
    const radius = size * 0.7;

    const gradient = ctx.createRadialGradient(
      centerX,
      centerY,
      size * 0.2,
      centerX,
      centerY,
      radius
    );
    gradient.addColorStop(0, glow.color);
    gradient.addColorStop(1, 'transparent');

    ctx.fillStyle = gradient;
    ctx.globalAlpha = glow.alpha * (0.5 + Math.sin(this.pulsePhase) * 0.2);
    ctx.fillRect(x - radius / 2, y - radius / 2, size + radius, size + radius);
    ctx.globalAlpha = 1;
  }

  private drawHoverHighlight(ctx: CanvasRenderingContext2D, square: SpiralSquare): void {
    const { x, y, size } = square;

    ctx.strokeStyle = '#00D9A5';
    ctx.lineWidth = 3;
    this.roundRect(ctx, x - 2, y - 2, size + 4, size + 4, Math.min(10, size * 0.1));
    ctx.stroke();
  }

  private drawStats(ctx: CanvasRenderingContext2D, contractCount: number): void {
    ctx.save();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.font = '12px monospace';
    ctx.fillText(`Tracking ${contractCount} contracts`, 20, 30);
    ctx.fillText(`MegaETH Testnet`, 20, 48);
    ctx.restore();
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

  /**
   * Get square at mouse position (for click/hover detection)
   */
  getSquareAt(mouseX: number, mouseY: number): SpiralSquare | null {
    // Check from front to back (larger squares first)
    for (const square of this.squares) {
      const { x, y, size } = square;
      if (
        mouseX >= x &&
        mouseX <= x + size &&
        mouseY >= y &&
        mouseY <= y + size
      ) {
        return square;
      }
    }
    return null;
  }

  /**
   * Handle click event
   */
  handleClick(x: number, y: number): void {
    // Check if clicking inside detail panel - don't close panel for any click inside
    if (this.detailPanel.containsPoint(x, y)) {
      // Handle click within panel (transactions, mini viz, etc.)
      this.detailPanel.handleClick(x, y);
      // Always return - never close panel when clicking inside it
      return;
    }

    // Clicking outside the panel
    const square = this.getSquareAt(x, y);

    if (square) {
      const contract = this.tracker.getContract(square.address);
      if (contract) {
        this.detailPanel.open(contract, { x: x + 20, y: y + 20 });
      }
    } else {
      // Only close when clicking outside panel AND not on a square
      this.detailPanel.close();
    }
  }

  /**
   * Handle mouse move for hover effects
   */
  handleMouseMove(x: number, y: number): void {
    this.hoveredSquare = this.getSquareAt(x, y);

    // Also check for tx hover in detail panel
    if (this.detailPanel.containsPoint(x, y)) {
      this.detailPanel.handleMouseMove(x, y);
    }
  }

  /**
   * Set callback for when a transaction is clicked in the detail panel
   */
  onTransactionClick(callback: (tx: RecentTransaction) => void): void {
    this.detailPanel.onTransactionClick(callback);
  }

  /**
   * Set trace requester for inline visualization
   */
  setTraceRequester(requester: (txHash: string) => Promise<import('../FlameGraph/types').TraceResult | null>): void {
    this.detailPanel.setTraceRequester(requester);
  }

  /**
   * Set callback for expand button in mini viz
   */
  onMiniVizExpand(callback: () => void): void {
    this.detailPanel.onExpandClick(callback);
  }

  /**
   * Get tracker for external access
   */
  getTracker(): ContractTracker {
    return this.tracker;
  }

  /**
   * Get current trace from mini viz (for modal expansion)
   */
  getMiniVizTrace(): import('../FlameGraph/types').TraceResult | null {
    return this.detailPanel.getTrace();
  }
}
