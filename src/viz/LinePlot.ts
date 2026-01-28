import type { Renderer } from '../core/Renderer';
import { RingBuffer } from '../streams/RingBuffer';

export interface PlotOptions {
  color?: string;
  lineWidth?: number;
  maxPoints?: number;
  minY?: number;
  maxY?: number;
  padding?: number;
}

export class LinePlot {
  private buffer: RingBuffer<number>;
  private options: Required<PlotOptions>;

  constructor(options?: PlotOptions) {
    this.options = {
      color: '#00ff88',
      lineWidth: 2,
      maxPoints: 500,
      minY: -1,
      maxY: 1,
      padding: 40,
      ...options,
    };
    this.buffer = new RingBuffer(this.options.maxPoints);
  }

  push(value: number) {
    this.buffer.push(value);
  }

  clear() {
    this.buffer.clear();
  }

  render(renderer: Renderer) {
    const ctx = renderer.context;
    const { color, lineWidth, minY, maxY, padding } = this.options;

    const width = renderer.width - padding * 2;
    const height = renderer.height - padding * 2;
    const points = this.buffer.toArray();

    if (points.length < 2) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();

    for (let i = 0; i < points.length; i++) {
      const x = padding + (i / (this.options.maxPoints - 1)) * width;
      const normalizedY = (points[i] - minY) / (maxY - minY);
      const y = padding + (1 - normalizedY) * height;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
  }
}
