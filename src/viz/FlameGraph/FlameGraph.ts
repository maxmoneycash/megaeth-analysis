import { Application, Graphics, Container, Text, TextStyle } from 'pixi.js';
import type { FlameFrame, FlameGraphOptions, ViewState, TraceResult } from './types';
import { FlameGraphLayout } from './FlameGraphLayout';
import { FlameGraphColors } from './FlameGraphColors';
import { FlameTooltip } from './FlameTooltip';

const DEFAULT_OPTIONS: Required<Omit<FlameGraphOptions, 'width' | 'height'>> = {
  frameHeight: 24,
  minFrameWidth: 2,
  maxDepth: 50,
  colorScheme: {},
};

/**
 * PixiJS-based flame graph visualization
 */
export class FlameGraph {
  private app: Application | null = null;
  private graphics: Graphics | null = null;
  private textContainer: Container | null = null;
  private layout: FlameGraphLayout;
  private colors: FlameGraphColors;
  private tooltip: FlameTooltip;

  private frames: FlameFrame[] = [];
  private viewState: ViewState = { offsetX: 0, scale: 1 };
  private hoveredFrame: FlameFrame | null = null;
  private options: Required<FlameGraphOptions>;

  private isLoading = false;
  private isInitialized = false;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartOffset = 0;

  private pixiCanvas: HTMLCanvasElement;
  private onCloseCallback?: () => void;

  constructor(
    pixiCanvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
    options: FlameGraphOptions
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.pixiCanvas = pixiCanvas;

    // Initialize helpers (non-PixiJS)
    this.layout = new FlameGraphLayout(this.options);
    this.colors = new FlameGraphColors(this.options.colorScheme);
    this.tooltip = new FlameTooltip(overlayCanvas);
    this.tooltip.resize(options.width, options.height);

    // Start async PixiJS initialization
    this.initPixi();
  }

  /**
   * Async PixiJS v8 initialization
   */
  private async initPixi(): Promise<void> {
    try {
      console.log('[FlameGraph] Initializing PixiJS...');

      this.app = new Application();
      await this.app.init({
        canvas: this.pixiCanvas,
        width: this.options.width,
        height: this.options.height,
        backgroundColor: 0x0a0a0a,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      });

      // Create containers
      this.graphics = new Graphics();
      this.textContainer = new Container();
      this.app.stage.addChild(this.graphics);
      this.app.stage.addChild(this.textContainer);

      // Setup interactions
      this.setupInteractions(this.pixiCanvas);

      this.isInitialized = true;
      console.log('[FlameGraph] PixiJS initialized successfully');

      // If we have pending state (loading or frames), render now
      if (this.isLoading) {
        this.renderLoadingState();
      } else if (this.frames.length > 0) {
        this.render();
      }
    } catch (e) {
      console.error('[FlameGraph] Failed to initialize PixiJS:', e);
    }
  }

  /**
   * Load trace data and render
   */
  loadTrace(result: TraceResult): void {
    this.frames = result.frames;
    this.viewState = { offsetX: 0, scale: 1 };
    this.isLoading = false;

    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Show loading state
   */
  showLoading(): void {
    this.isLoading = true;
    this.frames = [];

    if (this.isInitialized) {
      this.renderLoadingState();
    }
    // If not initialized yet, initPixi will render loading when ready
  }

  /**
   * Internal method to render loading state (requires initialization)
   */
  private renderLoadingState(): void {
    if (!this.graphics || !this.textContainer || !this.app) return;

    this.graphics.clear();
    this.textContainer.removeChildren();

    // Draw loading text
    const text = new Text({
      text: 'Loading trace...',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 16,
        fill: 0x888888,
      }),
    });
    text.anchor.set(0.5);
    text.x = this.options.width / 2;
    text.y = this.options.height / 2;
    this.textContainer.addChild(text);

    this.app.render();
  }

  /**
   * Show error state
   */
  showError(message: string): void {
    this.isLoading = false;
    this.frames = [];

    if (!this.graphics || !this.textContainer || !this.app) return;

    this.graphics.clear();
    this.textContainer.removeChildren();

    const text = new Text({
      text: message,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0xef4444,
      }),
    });
    text.anchor.set(0.5);
    text.x = this.options.width / 2;
    text.y = this.options.height / 2;
    this.textContainer.addChild(text);

    this.app.render();
  }

  /**
   * Main render function
   */
  render(): void {
    if (this.isLoading) return;
    if (!this.graphics || !this.textContainer || !this.app) return;

    this.graphics.clear();
    this.textContainer.removeChildren();

    if (this.frames.length === 0) {
      this.drawEmptyState();
      this.app.render();
      return;
    }

    // Get visible frames
    const visibleFrames = this.layout.getVisibleFrames(this.frames, this.viewState);

    // Draw frames
    for (const frame of visibleFrames) {
      this.drawFrame(frame);
    }

    // Draw close button
    this.drawCloseButton();

    // Draw info bar
    this.drawInfoBar();

    this.app.render();
  }

  private drawFrame(frame: FlameFrame): void {
    if (!this.graphics || !this.textContainer) return;

    const { pixelX, pixelY, pixelWidth, pixelHeight } = frame;

    // Skip if too small
    if (pixelWidth < this.options.minFrameWidth) return;

    // Determine color
    let color = frame.color;
    if (frame.isHovered) {
      color = this.colors.getLighterColor(frame.contractType, frame.hasError);
    } else if (frame.isSelected) {
      color = this.colors.getDarkerColor(frame.contractType, frame.hasError);
    }

    // Draw rectangle (PixiJS v8 API)
    this.graphics.rect(pixelX, pixelY, pixelWidth - 1, pixelHeight - 1);
    this.graphics.fill(color);

    // Draw border for hovered/selected
    if (frame.isHovered || frame.isSelected) {
      this.graphics.rect(pixelX, pixelY, pixelWidth - 1, pixelHeight - 1);
      this.graphics.stroke({ width: 2, color: 0x00d9a5 });
    }

    // Draw label if wide enough
    if (pixelWidth > 50) {
      const label = frame.functionName || frame.functionSig;
      const maxChars = Math.floor((pixelWidth - 8) / 7);
      const truncated = label.length > maxChars ? label.slice(0, maxChars - 2) + '..' : label;

      const text = new Text({
        text: truncated,
        style: new TextStyle({
          fontFamily: 'monospace',
          fontSize: 10,
          fill: 0xffffff,
        }),
      });
      text.x = pixelX + 4;
      text.y = pixelY + (pixelHeight - text.height) / 2;

      this.textContainer.addChild(text);
    }
  }

  private drawEmptyState(): void {
    if (!this.textContainer) return;

    const text = new Text({
      text: 'Click a transaction to view its call stack',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 14,
        fill: 0x666666,
      }),
    });
    text.anchor.set(0.5);
    text.x = this.options.width / 2;
    text.y = this.options.height / 2;
    this.textContainer.addChild(text);
  }

  private drawCloseButton(): void {
    if (!this.graphics || !this.textContainer) return;

    const size = 32;
    const x = this.options.width - size - 10;
    const y = 10;

    // Background (PixiJS v8 API)
    this.graphics.roundRect(x, y, size, size, 6);
    this.graphics.fill(0x1a1a1a);

    // Border
    this.graphics.roundRect(x, y, size, size, 6);
    this.graphics.stroke({ width: 1, color: 0x333333 });

    // X
    const text = new Text({
      text: '×',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 20,
        fill: 0x888888,
      }),
    });
    text.anchor.set(0.5);
    text.x = x + size / 2;
    text.y = y + size / 2;
    this.textContainer.addChild(text);
  }

  private drawInfoBar(): void {
    if (!this.graphics || !this.textContainer) return;
    if (this.frames.length === 0) return;

    const barHeight = 30;
    const y = this.options.height - barHeight;

    // Background (PixiJS v8 API)
    this.graphics.rect(0, y, this.options.width, barHeight);
    this.graphics.fill({ color: 0x1a1a1a, alpha: 0.9 });

    // Info text
    const zoomText = `Zoom: ${this.viewState.scale.toFixed(1)}x`;
    const frameText = `${this.frames.length} frames`;
    const infoText = `${frameText}  |  ${zoomText}  |  Scroll to zoom, drag to pan, double-click to reset`;

    const text = new Text({
      text: infoText,
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 11,
        fill: 0x888888,
      }),
    });
    text.x = 10;
    text.y = y + (barHeight - text.height) / 2;
    this.textContainer.addChild(text);
  }

  private setupInteractions(canvas: HTMLCanvasElement): void {
    // Mouse move
    canvas.addEventListener('mousemove', (e) => {
      const { x, y } = this.getCanvasCoords(e, canvas);

      if (this.isDragging) {
        const deltaX = x - this.dragStartX;
        this.viewState = this.layout.applyPan(
          { ...this.viewState, offsetX: this.dragStartOffset },
          deltaX
        );
        this.render();
        return;
      }

      this.handleMouseMove(x, y);
    });

    // Mouse down (start drag)
    canvas.addEventListener('mousedown', (e) => {
      const { x } = this.getCanvasCoords(e, canvas);
      this.isDragging = true;
      this.dragStartX = x;
      this.dragStartOffset = this.viewState.offsetX;
      canvas.style.cursor = 'grabbing';
    });

    // Mouse up (end drag)
    canvas.addEventListener('mouseup', () => {
      this.isDragging = false;
      canvas.style.cursor = 'pointer';
    });

    canvas.addEventListener('mouseleave', () => {
      this.isDragging = false;
      canvas.style.cursor = 'pointer';
      this.tooltip.hide();
    });

    // Click
    canvas.addEventListener('click', (e) => {
      if (this.isDragging) return;
      const { x, y } = this.getCanvasCoords(e, canvas);
      this.handleClick(x, y);
    });

    // Double click (reset zoom)
    canvas.addEventListener('dblclick', () => {
      this.viewState = this.layout.resetView();
      this.render();
    });

    // Wheel (zoom)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const { x } = this.getCanvasCoords(e, canvas);
      this.viewState = this.layout.applyWheelZoom(this.viewState, e.deltaY, x);
      this.render();
    });
  }

  private getCanvasCoords(
    e: MouseEvent,
    canvas: HTMLCanvasElement
  ): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  private handleMouseMove(x: number, y: number): void {
    // Update layout positions for hit testing
    this.layout.computePixelPositions(this.frames, this.viewState);

    const frame = this.layout.getFrameAt(this.frames, x, y);

    if (frame !== this.hoveredFrame) {
      // Clear previous hover
      if (this.hoveredFrame) {
        this.hoveredFrame.isHovered = false;
      }

      // Set new hover
      this.hoveredFrame = frame;
      if (frame) {
        frame.isHovered = true;
        this.tooltip.show(frame, x, y);
      } else {
        this.tooltip.hide();
      }

      this.render();
    } else if (frame) {
      this.tooltip.updatePosition(x, y);
    }
  }

  private handleClick(x: number, y: number): void {
    // Check close button
    const closeSize = 32;
    const closeX = this.options.width - closeSize - 10;
    const closeY = 10;
    if (x >= closeX && x <= closeX + closeSize && y >= closeY && y <= closeY + closeSize) {
      this.onCloseCallback?.();
      return;
    }

    // Check frame click
    this.layout.computePixelPositions(this.frames, this.viewState);
    const frame = this.layout.getFrameAt(this.frames, x, y);

    if (frame) {
      this.viewState = this.layout.zoomToFrame(frame);
      this.render();
    }
  }

  /**
   * Set close button callback
   */
  onClose(callback: () => void): void {
    this.onCloseCallback = callback;
  }

  /**
   * Resize the flame graph
   */
  resize(width: number, height: number): void {
    this.options.width = width;
    this.options.height = height;

    if (this.app) {
      this.app.renderer.resize(width, height);
    }

    this.layout.resize(width, height);
    this.tooltip.resize(width, height);

    if (this.isInitialized) {
      this.render();
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this.app) {
      this.app.destroy(true, { children: true });
    }
    this.tooltip.destroy();
  }
}
