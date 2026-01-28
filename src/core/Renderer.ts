import { observeVisibility } from './visibility';

export interface RenderOptions {
  width: number;
  height: number;
  pixelRatio?: number;
  targetFPS?: number;
  pauseWhenHidden?: boolean;
}

export class Renderer {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private animationId: number | null = null;
  private lastTime = 0;
  private lastFrameTime = 0;
  private frameInterval: number;
  private isVisible = true;
  private unobserveVisibility: (() => void) | null = null;
  private _pixelRatio: number;

  constructor(canvas: HTMLCanvasElement, options?: Partial<RenderOptions>) {
    this.canvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to get 2D context');
    this.ctx = ctx;

    // Frame throttling: default 30 FPS (looks smooth, 2x performance vs 60)
    const targetFPS = options?.targetFPS ?? 30;
    this.frameInterval = 1000 / targetFPS;
    this._pixelRatio = options?.pixelRatio ?? window.devicePixelRatio ?? 1;

    this.resize(options);

    // Visibility-based pause (massive perf gains when off-screen)
    if (options?.pauseWhenHidden !== false) {
      this.unobserveVisibility = observeVisibility(canvas, (visible) => {
        this.isVisible = visible;
      });
    }
  }

  resize(options?: Partial<RenderOptions>) {
    const pixelRatio = options?.pixelRatio ?? this._pixelRatio;
    const width = options?.width ?? window.innerWidth;
    const height = options?.height ?? window.innerHeight;

    this._pixelRatio = pixelRatio;
    this.canvas.width = width * pixelRatio;
    this.canvas.height = height * pixelRatio;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }

  get context() {
    return this.ctx;
  }

  get width() {
    return this.canvas.width / this._pixelRatio;
  }

  get height() {
    return this.canvas.height / this._pixelRatio;
  }

  get pixelRatio() {
    return this._pixelRatio;
  }

  clear(color = '#0a0a0a') {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(0, 0, this.width, this.height);
  }

  start(renderFn: (dt: number, t: number) => void) {
    const loop = (time: number) => {
      this.animationId = requestAnimationFrame(loop);

      // Skip render if not visible (major perf optimization)
      if (!this.isVisible) return;

      // Frame throttling - skip if not enough time has passed
      if (time - this.lastFrameTime < this.frameInterval) return;

      const dt = Math.min((time - this.lastTime) / 1000, 0.1); // Cap dt to 100ms
      this.lastTime = time;
      this.lastFrameTime = time;

      renderFn(dt, time / 1000);
    };

    this.lastTime = performance.now();
    this.lastFrameTime = this.lastTime;
    this.animationId = requestAnimationFrame(loop);
  }

  stop() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  destroy() {
    this.stop();
    if (this.unobserveVisibility) {
      this.unobserveVisibility();
      this.unobserveVisibility = null;
    }
  }
}
