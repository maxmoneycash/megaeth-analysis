import type { FlameFrame, FlameGraphOptions, ViewState } from './types';

const DEFAULT_FRAME_HEIGHT = 24;
const DEFAULT_MIN_FRAME_WIDTH = 2;
const DEFAULT_MAX_DEPTH = 50;

/**
 * Layout manager for flame graph frames
 * Converts normalized coordinates to pixel positions and handles zoom/pan
 */
export class FlameGraphLayout {
  private width: number;
  private height: number;
  private frameHeight: number;
  private minFrameWidth: number;
  private maxDepth: number;

  constructor(options: FlameGraphOptions) {
    this.width = options.width;
    this.height = options.height;
    this.frameHeight = options.frameHeight ?? DEFAULT_FRAME_HEIGHT;
    this.minFrameWidth = options.minFrameWidth ?? DEFAULT_MIN_FRAME_WIDTH;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  /**
   * Compute pixel positions for all frames based on current viewport
   */
  computePixelPositions(
    frames: FlameFrame[],
    viewState: ViewState = { offsetX: 0, scale: 1 }
  ): void {
    const { scale, offsetX } = viewState;

    for (const frame of frames) {
      // Apply zoom/pan transform
      frame.pixelX = (frame.x * this.width - offsetX) * scale;
      frame.pixelY = frame.depth * this.frameHeight;
      frame.pixelWidth = frame.width * this.width * scale;
      frame.pixelHeight = this.frameHeight;
    }
  }

  /**
   * Check if a frame is visible in the current viewport
   */
  isFrameVisible(frame: FlameFrame): boolean {
    // Check horizontal visibility
    if (frame.pixelX + frame.pixelWidth < 0) return false;
    if (frame.pixelX > this.width) return false;

    // Check if wide enough to render
    if (frame.pixelWidth < this.minFrameWidth) return false;

    // Check vertical visibility
    if (frame.pixelY + frame.pixelHeight < 0) return false;
    if (frame.pixelY > this.height) return false;

    // Check max depth
    if (frame.depth > this.maxDepth) return false;

    return true;
  }

  /**
   * Get visible frames sorted by depth (back to front)
   */
  getVisibleFrames(frames: FlameFrame[], viewState?: ViewState): FlameFrame[] {
    this.computePixelPositions(frames, viewState);
    return frames.filter((f) => this.isFrameVisible(f)).sort((a, b) => a.depth - b.depth);
  }

  /**
   * Find frame at given pixel coordinates
   */
  getFrameAt(frames: FlameFrame[], x: number, y: number): FlameFrame | null {
    // Search in reverse order (top-most first)
    for (let i = frames.length - 1; i >= 0; i--) {
      const frame = frames[i];
      if (
        x >= frame.pixelX &&
        x <= frame.pixelX + frame.pixelWidth &&
        y >= frame.pixelY &&
        y <= frame.pixelY + frame.pixelHeight
      ) {
        return frame;
      }
    }
    return null;
  }

  /**
   * Calculate view state to zoom into a specific frame
   */
  zoomToFrame(frame: FlameFrame): ViewState {
    // Calculate scale to fit frame width to 90% of viewport
    const targetWidth = frame.width * this.width;
    const newScale = Math.max(1, Math.min(100, (this.width * 0.9) / targetWidth));

    // Calculate offset to center the frame
    const frameCenter = frame.x * this.width;
    const offsetX = frameCenter * newScale - this.width / 2;

    return {
      scale: newScale,
      offsetX: Math.max(0, offsetX),
      focusedFrame: frame,
    };
  }

  /**
   * Apply wheel zoom at cursor position
   */
  applyWheelZoom(
    currentState: ViewState,
    deltaY: number,
    mouseX: number
  ): ViewState {
    const zoomFactor = deltaY > 0 ? 0.9 : 1.1;
    const newScale = Math.max(1, Math.min(100, currentState.scale * zoomFactor));

    // Zoom towards mouse position
    const scaleChange = newScale / currentState.scale;
    const newOffsetX = mouseX - (mouseX - currentState.offsetX) * scaleChange;

    return {
      scale: newScale,
      offsetX: this.clampOffset(newOffsetX, newScale),
    };
  }

  /**
   * Apply pan movement
   */
  applyPan(currentState: ViewState, deltaX: number): ViewState {
    const newOffsetX = currentState.offsetX - deltaX;
    return {
      ...currentState,
      offsetX: this.clampOffset(newOffsetX, currentState.scale),
    };
  }

  /**
   * Clamp offset to valid bounds
   */
  private clampOffset(offsetX: number, scale: number): number {
    const maxOffset = this.width * scale - this.width;
    return Math.max(0, Math.min(maxOffset, offsetX));
  }

  /**
   * Reset to default view
   */
  resetView(): ViewState {
    return { offsetX: 0, scale: 1 };
  }

  /**
   * Update dimensions on resize
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /**
   * Get the total height needed for all frames
   */
  getTotalHeight(maxDepth: number): number {
    return (maxDepth + 1) * this.frameHeight;
  }

  /**
   * Getters
   */
  get viewportWidth(): number {
    return this.width;
  }

  get viewportHeight(): number {
    return this.height;
  }

  get frameCellHeight(): number {
    return this.frameHeight;
  }
}
