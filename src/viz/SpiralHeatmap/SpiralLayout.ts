import type { ContractActivity, SpiralSquare, LayoutOptions } from './types';

const PHI = 1.618033988749895; // Golden ratio

type Direction = 'right' | 'down' | 'left' | 'up';
const DIRECTIONS: Direction[] = ['right', 'down', 'left', 'up'];

interface PlacedSquare {
  x: number;
  y: number;
  size: number;
}

/**
 * Golden ratio spiral layout algorithm.
 * Places squares in a Fibonacci spiral pattern with sizes decreasing by PHI.
 */
export class SpiralLayout {
  private options: LayoutOptions;

  constructor(options?: Partial<LayoutOptions>) {
    this.options = {
      centerX: 0,
      centerY: 0,
      baseSize: 200,
      maxSquares: 50,
      padding: 4,
      ...options,
    };
  }

  /**
   * Update layout dimensions (call on resize)
   */
  setCenter(x: number, y: number): void {
    this.options.centerX = x;
    this.options.centerY = y;
  }

  setBaseSize(size: number): void {
    this.options.baseSize = size;
  }

  /**
   * Generate Fibonacci-based sizes for squares
   */
  private generateSizes(count: number): number[] {
    const sizes: number[] = [];
    let size = this.options.baseSize;

    for (let i = 0; i < count; i++) {
      sizes.push(Math.max(20, size)); // Minimum size of 20px
      size = size / PHI;
    }

    return sizes;
  }

  /**
   * Calculate positions for all squares in golden ratio spiral
   */
  calculatePositions(contracts: ContractActivity[]): SpiralSquare[] {
    const count = Math.min(contracts.length, this.options.maxSquares);
    if (count === 0) return [];

    const sizes = this.generateSizes(count);
    const placed: PlacedSquare[] = [];
    const squares: SpiralSquare[] = [];
    const padding = this.options.padding;

    for (let i = 0; i < count; i++) {
      const contract = contracts[i];
      const size = sizes[i];
      let x: number, y: number;

      if (i === 0) {
        // First square: center of canvas
        x = this.options.centerX - size / 2;
        y = this.options.centerY - size / 2;
      } else {
        // Subsequent squares: attach in spiral pattern
        const direction = DIRECTIONS[i % 4];
        const pos = this.getNextPosition(placed, size, direction, padding);
        x = pos.x;
        y = pos.y;
      }

      placed.push({ x, y, size });

      squares.push({
        address: contract.address,
        x,
        y,
        size,
        targetX: x,
        targetY: y,
        targetSize: size,
        heat: contract.heat,
        animProgress: 1, // Start fully placed
      });
    }

    return squares;
  }

  /**
   * Calculate next square position based on direction and existing squares
   */
  private getNextPosition(
    placed: PlacedSquare[],
    size: number,
    direction: Direction,
    padding: number
  ): { x: number; y: number } {
    if (placed.length === 0) {
      return { x: this.options.centerX - size / 2, y: this.options.centerY - size / 2 };
    }

    // Get bounding box of all placed squares
    const bounds = this.getBounds(placed);

    switch (direction) {
      case 'right':
        return {
          x: bounds.maxX + padding,
          y: bounds.minY,
        };
      case 'down':
        return {
          x: bounds.minX,
          y: bounds.maxY + padding,
        };
      case 'left':
        return {
          x: bounds.minX - size - padding,
          y: bounds.minY,
        };
      case 'up':
        return {
          x: bounds.maxX - size,
          y: bounds.minY - size - padding,
        };
    }
  }

  /**
   * Get bounding box of placed squares
   */
  private getBounds(placed: PlacedSquare[]): {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } {
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;

    for (const sq of placed) {
      minX = Math.min(minX, sq.x);
      minY = Math.min(minY, sq.y);
      maxX = Math.max(maxX, sq.x + sq.size);
      maxY = Math.max(maxY, sq.y + sq.size);
    }

    return { minX, minY, maxX, maxY };
  }

  /**
   * Calculate optimal base size based on canvas dimensions
   */
  static calculateOptimalBaseSize(
    width: number,
    height: number,
    contractCount: number
  ): number {
    // The spiral will roughly fit in a square region
    const minDimension = Math.min(width, height);

    // Base size should allow the spiral to fit comfortably
    // First few squares take up most space due to Fibonacci sizing
    const baseSize = minDimension * 0.35;

    // Adjust based on contract count
    const countFactor = Math.max(0.5, 1 - (contractCount - 10) * 0.01);

    return Math.max(80, Math.min(300, baseSize * countFactor));
  }
}
