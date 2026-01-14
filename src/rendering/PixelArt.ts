// Pixel Art Utility Module
// Provides primitives for retro-style pixel art rendering

export type SpritePattern = string[][];
export type ColorPalette = Record<string, string>;

export class PixelArt {
  /**
   * Draw a pixel-perfect rectangle (no anti-aliasing)
   */
  static drawPixelRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
  }

  /**
   * Draw a sprite from a 2D pattern array
   * Pattern uses single characters mapped to colors via palette
   * '.' or ' ' = transparent
   *
   * Example pattern:
   * [
   *   '..XX..',
   *   '.XXXX.',
   *   'XXXXXX',
   * ]
   */
  static drawSprite(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pattern: string[],
    palette: ColorPalette,
    pixelSize: number = 4,
    flipX: boolean = false,
    flipY: boolean = false
  ): void {
    const height = pattern.length;
    const width = pattern[0]?.length || 0;

    for (let py = 0; py < height; py++) {
      const row = pattern[flipY ? height - 1 - py : py];
      for (let px = 0; px < width; px++) {
        const char = row[flipX ? width - 1 - px : px];
        if (char === '.' || char === ' ') continue;

        const color = palette[char];
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(x + px * pixelSize),
          Math.floor(y + py * pixelSize),
          pixelSize,
          pixelSize
        );
      }
    }
  }

  /**
   * Draw a sprite with scaling (for squash/stretch effects)
   */
  static drawSpriteScaled(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    pattern: string[],
    palette: ColorPalette,
    pixelSize: number = 4,
    scaleX: number = 1,
    scaleY: number = 1,
    flipX: boolean = false,
    flipY: boolean = false
  ): void {
    const height = pattern.length;
    const width = pattern[0]?.length || 0;
    const totalWidth = width * pixelSize * scaleX;
    const totalHeight = height * pixelSize * scaleY;
    const startX = centerX - totalWidth / 2;
    const startY = centerY - totalHeight / 2;

    const scaledPixelW = pixelSize * scaleX;
    const scaledPixelH = pixelSize * scaleY;

    for (let py = 0; py < height; py++) {
      const row = pattern[flipY ? height - 1 - py : py];
      for (let px = 0; px < width; px++) {
        const char = row[flipX ? width - 1 - px : px];
        if (char === '.' || char === ' ') continue;

        const color = palette[char];
        if (!color) continue;

        ctx.fillStyle = color;
        ctx.fillRect(
          Math.floor(startX + px * scaledPixelW),
          Math.floor(startY + py * scaledPixelH),
          Math.ceil(scaledPixelW),
          Math.ceil(scaledPixelH)
        );
      }
    }
  }

  /**
   * Draw a 1px outline around a rectangle
   */
  static drawOutline(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string = '#000000',
    thickness: number = 1
  ): void {
    ctx.fillStyle = color;
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fw = Math.floor(w);
    const fh = Math.floor(h);

    // Top
    ctx.fillRect(fx, fy, fw, thickness);
    // Bottom
    ctx.fillRect(fx, fy + fh - thickness, fw, thickness);
    // Left
    ctx.fillRect(fx, fy, thickness, fh);
    // Right
    ctx.fillRect(fx + fw - thickness, fy, thickness, fh);
  }

  /**
   * Draw scanlines overlay for CRT effect
   */
  static drawScanlines(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    intensity: number = 0.08,
    spacing: number = 2
  ): void {
    ctx.fillStyle = `rgba(0, 0, 0, ${intensity})`;
    for (let y = 0; y < height; y += spacing) {
      ctx.fillRect(0, y, width, 1);
    }
  }

  /**
   * Create a dithered pattern between two colors
   */
  static drawDitheredRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color1: string,
    color2: string,
    pattern: 'checker' | 'horizontal' | 'vertical' = 'checker'
  ): void {
    const fx = Math.floor(x);
    const fy = Math.floor(y);
    const fw = Math.floor(w);
    const fh = Math.floor(h);

    for (let py = 0; py < fh; py++) {
      for (let px = 0; px < fw; px++) {
        let useColor1: boolean;
        switch (pattern) {
          case 'checker':
            useColor1 = (px + py) % 2 === 0;
            break;
          case 'horizontal':
            useColor1 = py % 2 === 0;
            break;
          case 'vertical':
            useColor1 = px % 2 === 0;
            break;
        }
        ctx.fillStyle = useColor1 ? color1 : color2;
        ctx.fillRect(fx + px, fy + py, 1, 1);
      }
    }
  }

  /**
   * Lighten a hex color by a percentage
   */
  static lightenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.min(255, (num >> 16) + amt);
    const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
    const B = Math.min(255, (num & 0x0000ff) + amt);
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  }

  /**
   * Darken a hex color by a percentage
   */
  static darkenColor(color: string, percent: number): string {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = Math.max(0, (num >> 16) - amt);
    const G = Math.max(0, ((num >> 8) & 0x00ff) - amt);
    const B = Math.max(0, (num & 0x0000ff) - amt);
    return `#${((1 << 24) + (R << 16) + (G << 8) + B).toString(16).slice(1)}`;
  }

  /**
   * Draw a pixel circle (Bresenham's algorithm)
   */
  static drawPixelCircle(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    radius: number,
    color: string,
    filled: boolean = true,
    pixelSize: number = 1
  ): void {
    ctx.fillStyle = color;
    const cx = Math.floor(centerX);
    const cy = Math.floor(centerY);
    const r = Math.floor(radius);

    if (filled) {
      // Filled circle
      for (let y = -r; y <= r; y++) {
        for (let x = -r; x <= r; x++) {
          if (x * x + y * y <= r * r) {
            ctx.fillRect(
              cx + x * pixelSize,
              cy + y * pixelSize,
              pixelSize,
              pixelSize
            );
          }
        }
      }
    } else {
      // Circle outline using Bresenham
      let x = r;
      let y = 0;
      let err = 0;

      while (x >= y) {
        const points = [
          [cx + x, cy + y], [cx + y, cy + x],
          [cx - y, cy + x], [cx - x, cy + y],
          [cx - x, cy - y], [cx - y, cy - x],
          [cx + y, cy - x], [cx + x, cy - y]
        ];
        for (const [px, py] of points) {
          ctx.fillRect(px * pixelSize, py * pixelSize, pixelSize, pixelSize);
        }

        y++;
        if (err <= 0) {
          err += 2 * y + 1;
        }
        if (err > 0) {
          x--;
          err -= 2 * x + 1;
        }
      }
    }
  }

  /**
   * Draw a pixel line (Bresenham's algorithm)
   */
  static drawPixelLine(
    ctx: CanvasRenderingContext2D,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    color: string,
    pixelSize: number = 1
  ): void {
    ctx.fillStyle = color;
    let sx = Math.floor(x0);
    let sy = Math.floor(y0);
    const ex = Math.floor(x1);
    const ey = Math.floor(y1);

    const dx = Math.abs(ex - sx);
    const dy = Math.abs(ey - sy);
    const stepX = sx < ex ? 1 : -1;
    const stepY = sy < ey ? 1 : -1;
    let err = dx - dy;

    while (true) {
      ctx.fillRect(sx * pixelSize, sy * pixelSize, pixelSize, pixelSize);
      if (sx === ex && sy === ey) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        sx += stepX;
      }
      if (e2 < dx) {
        err += dx;
        sy += stepY;
      }
    }
  }
}
