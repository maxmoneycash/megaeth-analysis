import { Application, Graphics, Text, TextStyle, Container } from 'pixi.js';
import type {
  BlockMetrics,
  NormalizedBlockMetrics,
  RingRadarOptions,
  RadarState,
} from './types';
import { MetricsNormalizer, PROTOCOL_LIMITS } from './MetricsNormalizer';

/**
 * 12 endpoints - 6 metrics with HIGH on one side, LOW opposite
 */
const ENDPOINTS = [
  { label: 'High Gas', angle: 0, metric: 'gas' as const, isHigh: true },
  { label: 'High Tx Size', angle: 30, metric: 'txSize' as const, isHigh: true },
  { label: 'High DA', angle: 60, metric: 'daSize' as const, isHigh: true },
  { label: 'High KV Updates', angle: 90, metric: 'kvUpdates' as const, isHigh: true },
  { label: 'High State Growth', angle: 120, metric: 'stateGrowth' as const, isHigh: true },
  { label: 'High Data Size', angle: 150, metric: 'dataSize' as const, isHigh: true },
  { label: 'Low Gas', angle: 180, metric: 'gas' as const, isHigh: false },
  { label: 'Low Tx Size', angle: 210, metric: 'txSize' as const, isHigh: false },
  { label: 'Low DA', angle: 240, metric: 'daSize' as const, isHigh: false },
  { label: 'Low KV Updates', angle: 270, metric: 'kvUpdates' as const, isHigh: false },
  { label: 'Low State Growth', angle: 300, metric: 'stateGrowth' as const, isHigh: false },
  { label: 'Low Data Size', angle: 330, metric: 'dataSize' as const, isHigh: false },
];

const DEFAULT_OPTIONS: Required<RingRadarOptions> = {
  radius: 200,
  strokeWidth: 2.5,
  animationSpeed: 0.025,
  showLabels: true,
  showGrid: true,
  windowMs: 10 * 60 * 1000,
  maxSamples: 2000,
};

/**
 * Ring Radar visualization for MegaETH block metrics.
 * Displays 6 metrics on a radar with HIGH/LOW endpoints opposite each other.
 * Values are normalized to -100 to +100 scale using rolling window percentiles.
 */
export class RingRadar {
  private app: Application;
  private options: Required<RingRadarOptions>;
  private normalizer: MetricsNormalizer;

  // Graphics layers
  private gridGraphics: Graphics;
  private ribbonGraphics: Graphics;
  private labelsContainer: Container;

  // State
  private state: RadarState = {
    currentMetrics: null,
    targetMetrics: null,
    animProgress: 0,
    lastUpdate: 0,
  };

  // Trail history for ribbon effect
  private trailHistory: NormalizedBlockMetrics[] = [];
  private trailCount = 10;
  private phase = 0;

  // Dimensions
  private minRadius = 50;
  private maxRadius: number;
  private gridRadius: number;

  constructor(options?: RingRadarOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.maxRadius = this.options.radius;
    this.gridRadius = this.maxRadius + 30;
    this.normalizer = new MetricsNormalizer(this.options.windowMs, this.options.maxSamples);

    this.app = new Application();
    this.gridGraphics = new Graphics();
    this.ribbonGraphics = new Graphics();
    this.labelsContainer = new Container();
  }

  /**
   * Initialize the visualization
   */
  async init(container: HTMLElement): Promise<void> {
    await this.app.init({
      width: container.clientWidth,
      height: container.clientHeight,
      backgroundColor: 0x0a0a0f,
      antialias: true,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });

    container.appendChild(this.app.canvas);

    // Add layers
    this.app.stage.addChild(this.gridGraphics);
    this.app.stage.addChild(this.ribbonGraphics);
    this.app.stage.addChild(this.labelsContainer);

    // Create labels
    if (this.options.showLabels) {
      this.createLabels();
    }

    // Start animation loop
    this.app.ticker.add(() => this.render());

    // Handle resize
    window.addEventListener('resize', () => {
      this.app.renderer.resize(container.clientWidth, container.clientHeight);
    });
  }

  /**
   * Process a new block and update the visualization
   */
  processBlock(metrics: BlockMetrics): void {
    // Add to normalizer for baseline calculation
    this.normalizer.addSample(metrics);

    // Normalize the block
    const normalized = this.normalizer.normalizeBlock(metrics);

    // Update state
    this.state.targetMetrics = normalized;
    this.state.lastUpdate = Date.now();

    // Add to trail history
    this.trailHistory.unshift(normalized);
    if (this.trailHistory.length > this.trailCount) {
      this.trailHistory.pop();
    }
  }

  /**
   * Create endpoint labels
   */
  private createLabels(): void {
    const labelStyle = new TextStyle({
      fontFamily: 'monospace',
      fontSize: 10,
      fill: 0x445566,
      align: 'center',
    });

    for (const ep of ENDPOINTS) {
      const angleRad = ((ep.angle - 90) * Math.PI) / 180;
      const label = new Text({ text: ep.label, style: labelStyle.clone() });
      label.anchor.set(0.5);
      label.x = Math.cos(angleRad) * (this.gridRadius + 35);
      label.y = Math.sin(angleRad) * (this.gridRadius + 35);
      (label as any).userData = { endpoint: ep };
      this.labelsContainer.addChild(label);
    }
  }

  /**
   * Main render loop
   */
  private render(): void {
    this.phase += this.options.animationSpeed;

    const cx = this.app.screen.width / 2;
    const cy = this.app.screen.height / 2;

    // Draw grid
    if (this.options.showGrid) {
      this.drawGrid(cx, cy);
    }

    // Position labels container at center
    this.labelsContainer.x = cx;
    this.labelsContainer.y = cy;

    // Update label colors based on current metrics
    this.updateLabelColors();

    // Draw ribbon trails
    this.drawRibbonTrails(cx, cy);
  }

  /**
   * Draw the background grid
   */
  private drawGrid(cx: number, cy: number): void {
    this.gridGraphics.clear();

    // Concentric circles
    for (let i = 1; i <= 4; i++) {
      const r = this.minRadius + (this.maxRadius - this.minRadius) * (i / 4);
      this.gridGraphics.circle(cx, cy, r);
      this.gridGraphics.stroke({ width: 1, color: 0x1a1a2a, alpha: 0.6 });
    }

    // Radial lines
    for (const ep of ENDPOINTS) {
      const angleRad = ((ep.angle - 90) * Math.PI) / 180;
      this.gridGraphics.moveTo(cx, cy);
      this.gridGraphics.lineTo(
        cx + Math.cos(angleRad) * this.gridRadius,
        cy + Math.sin(angleRad) * this.gridRadius
      );
      this.gridGraphics.stroke({ width: 1, color: 0x1a1a2a, alpha: 0.4 });
    }
  }

  /**
   * Update label colors based on metric activity
   */
  private updateLabelColors(): void {
    if (this.trailHistory.length === 0) return;

    const current = this.trailHistory[0];
    for (const label of this.labelsContainer.children) {
      const ep = (label as any).userData?.endpoint;
      if (!ep) continue;

      const metric = current[ep.metric as keyof NormalizedBlockMetrics];
      const score = metric.score;

      // Map score to activity (0-1)
      const activity = ep.isHigh ? (score + 100) / 200 : (100 - score) / 200;

      (label as Text).style.fill = activity > 0.6 ? 0xffaa44 : 0x445566;
    }
  }

  /**
   * Draw ribbon trails showing metric history
   */
  private drawRibbonTrails(cx: number, cy: number): void {
    this.ribbonGraphics.clear();

    if (this.trailHistory.length === 0) return;

    // Draw trails: oldest first (underneath), newest last (on top)
    for (let i = this.trailHistory.length - 1; i >= 0; i--) {
      const metrics = this.trailHistory[i];
      const shape = this.calculateBlobShape(cx, cy, metrics, this.phase - i * 0.25);

      const color = this.getTrailColor(i, this.trailHistory.length);
      const alpha = 0.95 - (i / this.trailCount) * 0.85;
      const lineWidth = this.options.strokeWidth - (i / this.trailCount) * 2;

      this.ribbonGraphics.moveTo(shape[0].x, shape[0].y);
      for (let j = 1; j < shape.length; j++) {
        this.ribbonGraphics.lineTo(shape[j].x, shape[j].y);
      }
      this.ribbonGraphics.lineTo(shape[0].x, shape[0].y);
      this.ribbonGraphics.stroke({ width: Math.max(0.5, lineWidth), color, alpha });
    }
  }

  /**
   * Calculate blob shape from normalized metrics
   */
  private calculateBlobShape(
    cx: number,
    cy: number,
    metrics: NormalizedBlockMetrics,
    phase: number
  ): Array<{ x: number; y: number }> {
    const controlPoints: Array<{ x: number; y: number; angle: number; radius: number }> = [];

    for (const ep of ENDPOINTS) {
      const angleRad = ((ep.angle - 90) * Math.PI) / 180;
      const metric = metrics[ep.metric as keyof NormalizedBlockMetrics];

      // Convert score (-100 to +100) to extension (0 to 1)
      // High endpoint: positive score = extend outward
      // Low endpoint: negative score = extend outward
      const normalizedScore = (metric.score + 100) / 200; // 0 to 1
      const extension = ep.isHigh ? normalizedScore : 1 - normalizedScore;

      const baseRadius = this.minRadius + (this.maxRadius - this.minRadius) * extension;

      // Add subtle organic wobble
      const wobble = Math.sin(phase * 0.5 + ep.angle * 0.1) * 5;
      const radius = baseRadius + wobble;

      controlPoints.push({
        angle: angleRad,
        radius,
        x: cx + Math.cos(angleRad) * radius,
        y: cy + Math.sin(angleRad) * radius,
      });
    }

    // Generate smooth curve using Catmull-Rom spline
    return this.smoothCurve(controlPoints);
  }

  /**
   * Generate smooth curve through control points using Catmull-Rom spline
   */
  private smoothCurve(
    controlPoints: Array<{ x: number; y: number }>
  ): Array<{ x: number; y: number }> {
    const smoothPoints: Array<{ x: number; y: number }> = [];
    const segments = 12;

    for (let i = 0; i < controlPoints.length; i++) {
      const p0 = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length];
      const p1 = controlPoints[i];
      const p2 = controlPoints[(i + 1) % controlPoints.length];
      const p3 = controlPoints[(i + 2) % controlPoints.length];

      for (let t = 0; t < segments; t++) {
        const s = t / segments;
        smoothPoints.push(this.catmullRom(p0, p1, p2, p3, s));
      }
    }

    return smoothPoints;
  }

  /**
   * Catmull-Rom spline interpolation
   */
  private catmullRom(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    t: number
  ): { x: number; y: number } {
    const t2 = t * t;
    const t3 = t2 * t;

    const x =
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

    const y =
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    return { x, y };
  }

  /**
   * Get trail color: bright yellow (newest) -> orange -> dark red (oldest)
   */
  private getTrailColor(index: number, total: number): number {
    const t = index / (total - 1 || 1);

    if (t < 0.3) {
      return this.lerpColor(0xffff88, 0xffcc44, t / 0.3);
    } else if (t < 0.6) {
      return this.lerpColor(0xffcc44, 0xff7722, (t - 0.3) / 0.3);
    } else {
      return this.lerpColor(0xff7722, 0x992200, (t - 0.6) / 0.4);
    }
  }

  /**
   * Linear interpolation between two colors
   */
  private lerpColor(c1: number, c2: number, t: number): number {
    const r1 = (c1 >> 16) & 0xff,
      g1 = (c1 >> 8) & 0xff,
      b1 = c1 & 0xff;
    const r2 = (c2 >> 16) & 0xff,
      g2 = (c2 >> 8) & 0xff,
      b2 = c2 & 0xff;
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);
    return (r << 16) | (g << 8) | b;
  }

  /**
   * Get the metrics normalizer for external access
   */
  getNormalizer(): MetricsNormalizer {
    return this.normalizer;
  }

  /**
   * Get current sample count in baseline window
   */
  getSampleCount(): number {
    return this.normalizer.sampleCount;
  }

  /**
   * Destroy the visualization
   */
  destroy(): void {
    this.app.destroy(true);
  }
}
