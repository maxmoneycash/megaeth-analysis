import type { HeatmapColorConfig } from './types';

interface HSL {
  h: number;
  s: number;
  l: number;
}

const DEFAULT_COLORS: HeatmapColorConfig = {
  cold: '#3B82F6', // Blue
  warm: '#F59E0B', // Amber
  hot: '#EF4444', // Red
  glow: '#00D9A5', // Teal
};

/**
 * Heatmap color utilities for the spiral visualization.
 * Provides smooth gradients from cold (inactive) to hot (active).
 */
export class HeatmapColors {
  private cold: HSL;
  private warm: HSL;
  private hot: HSL;
  private glow: HSL;

  constructor(config?: Partial<HeatmapColorConfig>) {
    const colors = { ...DEFAULT_COLORS, ...config };
    this.cold = hexToHsl(colors.cold);
    this.warm = hexToHsl(colors.warm);
    this.hot = hexToHsl(colors.hot);
    this.glow = hexToHsl(colors.glow);
  }

  /**
   * Get color for heat value (0-1)
   * 0 = cold (blue), 0.5 = warm (amber), 1 = hot (red)
   */
  getColor(heat: number): string {
    const h = Math.max(0, Math.min(1, heat));

    if (h <= 0.5) {
      // Interpolate cold → warm
      const t = h * 2;
      return hslToHex(lerpHsl(this.cold, this.warm, t));
    } else {
      // Interpolate warm → hot
      const t = (h - 0.5) * 2;
      return hslToHex(lerpHsl(this.warm, this.hot, t));
    }
  }

  /**
   * Get glow effect parameters based on heat
   */
  getGlow(heat: number): { color: string; blur: number; alpha: number } {
    // Only show glow for hotter contracts
    if (heat < 0.3) {
      return { color: 'transparent', blur: 0, alpha: 0 };
    }

    // Interpolate glow intensity
    const intensity = (heat - 0.3) / 0.7; // 0-1 for heat 0.3-1.0
    const glow = { ...this.glow };

    // Make glow brighter for hotter contracts
    glow.l = Math.min(70, glow.l + intensity * 20);

    return {
      color: hslToHex(glow),
      blur: 10 + intensity * 20,
      alpha: 0.3 + intensity * 0.4,
    };
  }

  /**
   * Get background color with slight heat tint
   */
  getBackground(heat: number): string {
    const baseL = 6; // Very dark
    const tintAmount = heat * 0.1;
    const color = this.getColor(heat);
    const hsl = hexToHsl(color);

    return hslToHex({
      h: hsl.h,
      s: hsl.s * tintAmount,
      l: baseL + tintAmount * 2,
    });
  }
}

/**
 * Convert hex color to HSL
 */
function hexToHsl(hex: string): HSL {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return { h: 0, s: 0, l: 0 };

  const r = parseInt(result[1], 16) / 255;
  const g = parseInt(result[2], 16) / 255;
  const b = parseInt(result[3], 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;

  let h = 0,
    s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }

  return { h: h * 360, s: s * 100, l: l * 100 };
}

/**
 * Convert HSL to hex color
 */
function hslToHex(hsl: HSL): string {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p: number, q: number, t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (x: number) => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Linear interpolation between two HSL colors
 */
function lerpHsl(a: HSL, b: HSL, t: number): HSL {
  // Handle hue wrapping (shortest path around color wheel)
  let h: number;
  const hueDiff = b.h - a.h;

  if (Math.abs(hueDiff) > 180) {
    if (b.h > a.h) {
      h = a.h + (hueDiff - 360) * t;
    } else {
      h = a.h + (hueDiff + 360) * t;
    }
  } else {
    h = a.h + hueDiff * t;
  }

  // Normalize hue
  if (h < 0) h += 360;
  if (h >= 360) h -= 360;

  return {
    h,
    s: a.s + (b.s - a.s) * t,
    l: a.l + (b.l - a.l) * t,
  };
}

// Export utilities for external use
export { hexToHsl, hslToHex, lerpHsl };
