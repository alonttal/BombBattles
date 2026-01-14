// Pixel Font System
// 5x7 bitmap font for retro-style text rendering

type CharPattern = string[];

// 5x7 pixel character patterns
const CHAR_PATTERNS: Record<string, CharPattern> = {
  // Numbers
  '0': [
    '.XXX.',
    'X...X',
    'X..XX',
    'X.X.X',
    'XX..X',
    'X...X',
    '.XXX.',
  ],
  '1': [
    '..X..',
    '.XX..',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '.XXX.',
  ],
  '2': [
    '.XXX.',
    'X...X',
    '....X',
    '..XX.',
    '.X...',
    'X....',
    'XXXXX',
  ],
  '3': [
    '.XXX.',
    'X...X',
    '....X',
    '..XX.',
    '....X',
    'X...X',
    '.XXX.',
  ],
  '4': [
    '...X.',
    '..XX.',
    '.X.X.',
    'X..X.',
    'XXXXX',
    '...X.',
    '...X.',
  ],
  '5': [
    'XXXXX',
    'X....',
    'XXXX.',
    '....X',
    '....X',
    'X...X',
    '.XXX.',
  ],
  '6': [
    '.XXX.',
    'X....',
    'X....',
    'XXXX.',
    'X...X',
    'X...X',
    '.XXX.',
  ],
  '7': [
    'XXXXX',
    '....X',
    '...X.',
    '..X..',
    '.X...',
    '.X...',
    '.X...',
  ],
  '8': [
    '.XXX.',
    'X...X',
    'X...X',
    '.XXX.',
    'X...X',
    'X...X',
    '.XXX.',
  ],
  '9': [
    '.XXX.',
    'X...X',
    'X...X',
    '.XXXX',
    '....X',
    '....X',
    '.XXX.',
  ],

  // Uppercase letters
  'A': [
    '.XXX.',
    'X...X',
    'X...X',
    'XXXXX',
    'X...X',
    'X...X',
    'X...X',
  ],
  'B': [
    'XXXX.',
    'X...X',
    'X...X',
    'XXXX.',
    'X...X',
    'X...X',
    'XXXX.',
  ],
  'C': [
    '.XXX.',
    'X...X',
    'X....',
    'X....',
    'X....',
    'X...X',
    '.XXX.',
  ],
  'D': [
    'XXXX.',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'XXXX.',
  ],
  'E': [
    'XXXXX',
    'X....',
    'X....',
    'XXXX.',
    'X....',
    'X....',
    'XXXXX',
  ],
  'F': [
    'XXXXX',
    'X....',
    'X....',
    'XXXX.',
    'X....',
    'X....',
    'X....',
  ],
  'G': [
    '.XXX.',
    'X...X',
    'X....',
    'X.XXX',
    'X...X',
    'X...X',
    '.XXX.',
  ],
  'H': [
    'X...X',
    'X...X',
    'X...X',
    'XXXXX',
    'X...X',
    'X...X',
    'X...X',
  ],
  'I': [
    '.XXX.',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '.XXX.',
  ],
  'J': [
    '..XXX',
    '...X.',
    '...X.',
    '...X.',
    '...X.',
    'X..X.',
    '.XX..',
  ],
  'K': [
    'X...X',
    'X..X.',
    'X.X..',
    'XX...',
    'X.X..',
    'X..X.',
    'X...X',
  ],
  'L': [
    'X....',
    'X....',
    'X....',
    'X....',
    'X....',
    'X....',
    'XXXXX',
  ],
  'M': [
    'X...X',
    'XX.XX',
    'X.X.X',
    'X.X.X',
    'X...X',
    'X...X',
    'X...X',
  ],
  'N': [
    'X...X',
    'XX..X',
    'X.X.X',
    'X..XX',
    'X...X',
    'X...X',
    'X...X',
  ],
  'O': [
    '.XXX.',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    '.XXX.',
  ],
  'P': [
    'XXXX.',
    'X...X',
    'X...X',
    'XXXX.',
    'X....',
    'X....',
    'X....',
  ],
  'Q': [
    '.XXX.',
    'X...X',
    'X...X',
    'X...X',
    'X.X.X',
    'X..X.',
    '.XX.X',
  ],
  'R': [
    'XXXX.',
    'X...X',
    'X...X',
    'XXXX.',
    'X.X..',
    'X..X.',
    'X...X',
  ],
  'S': [
    '.XXX.',
    'X...X',
    'X....',
    '.XXX.',
    '....X',
    'X...X',
    '.XXX.',
  ],
  'T': [
    'XXXXX',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
  ],
  'U': [
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    '.XXX.',
  ],
  'V': [
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    'X...X',
    '.X.X.',
    '..X..',
  ],
  'W': [
    'X...X',
    'X...X',
    'X...X',
    'X.X.X',
    'X.X.X',
    'XX.XX',
    'X...X',
  ],
  'X': [
    'X...X',
    'X...X',
    '.X.X.',
    '..X..',
    '.X.X.',
    'X...X',
    'X...X',
  ],
  'Y': [
    'X...X',
    'X...X',
    '.X.X.',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
  ],
  'Z': [
    'XXXXX',
    '....X',
    '...X.',
    '..X..',
    '.X...',
    'X....',
    'XXXXX',
  ],

  // Symbols
  ' ': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
  ],
  ':': [
    '.....',
    '..X..',
    '..X..',
    '.....',
    '..X..',
    '..X..',
    '.....',
  ],
  '!': [
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '..X..',
    '.....',
    '..X..',
  ],
  '?': [
    '.XXX.',
    'X...X',
    '....X',
    '..XX.',
    '..X..',
    '.....',
    '..X..',
  ],
  '.': [
    '.....',
    '.....',
    '.....',
    '.....',
    '.....',
    '..X..',
    '..X..',
  ],
  ',': [
    '.....',
    '.....',
    '.....',
    '.....',
    '..X..',
    '..X..',
    '.X...',
  ],
  '-': [
    '.....',
    '.....',
    '.....',
    'XXXXX',
    '.....',
    '.....',
    '.....',
  ],
  '+': [
    '.....',
    '..X..',
    '..X..',
    'XXXXX',
    '..X..',
    '..X..',
    '.....',
  ],
  '*': [
    '.....',
    'X.X.X',
    '.XXX.',
    'XXXXX',
    '.XXX.',
    'X.X.X',
    '.....',
  ],
  '/': [
    '....X',
    '...X.',
    '...X.',
    '..X..',
    '.X...',
    '.X...',
    'X....',
  ],
  '(': [
    '..X..',
    '.X...',
    'X....',
    'X....',
    'X....',
    '.X...',
    '..X..',
  ],
  ')': [
    '..X..',
    '...X.',
    '....X',
    '....X',
    '....X',
    '...X.',
    '..X..',
  ],
  '#': [
    '.X.X.',
    '.X.X.',
    'XXXXX',
    '.X.X.',
    'XXXXX',
    '.X.X.',
    '.X.X.',
  ],
  '%': [
    'XX..X',
    'XX.X.',
    '..X..',
    '..X..',
    '..X..',
    '.X.XX',
    'X..XX',
  ],
  'x': [
    '.....',
    '.....',
    'X...X',
    '.X.X.',
    '..X..',
    '.X.X.',
    'X...X',
  ],
};

// Smaller 3x5 font for compact displays
const SMALL_CHAR_PATTERNS: Record<string, string[]> = {
  '0': ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'],
  '1': ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
  '2': ['XXX', '..X', 'XXX', 'X..', 'XXX'],
  '3': ['XXX', '..X', '.XX', '..X', 'XXX'],
  '4': ['X.X', 'X.X', 'XXX', '..X', '..X'],
  '5': ['XXX', 'X..', 'XXX', '..X', 'XXX'],
  '6': ['XXX', 'X..', 'XXX', 'X.X', 'XXX'],
  '7': ['XXX', '..X', '..X', '..X', '..X'],
  '8': ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'],
  '9': ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  ':': ['.', 'X', '.', 'X', '.'],
  ' ': ['...', '...', '...', '...', '...'],
};

export class PixelFont {
  private static CHAR_WIDTH = 5;
  private static CHAR_HEIGHT = 7;
  private static CHAR_SPACING = 1;

  /**
   * Draw text with pixel-perfect rendering
   */
  static drawText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number = 1,
    color: string = '#ffffff',
    shadowColor?: string
  ): void {
    const upperText = text.toUpperCase();

    // Draw shadow first if specified
    if (shadowColor) {
      this.renderText(ctx, upperText, x + scale, y + scale, scale, shadowColor);
    }

    // Draw main text
    this.renderText(ctx, upperText, x, y, scale, color);
  }

  private static renderText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number,
    color: string
  ): void {
    ctx.fillStyle = color;
    let offsetX = 0;

    for (const char of text) {
      const pattern = CHAR_PATTERNS[char];
      if (pattern) {
        this.drawChar(ctx, pattern, x + offsetX, y, scale);
        offsetX += (this.CHAR_WIDTH + this.CHAR_SPACING) * scale;
      } else {
        // Unknown character - add space
        offsetX += (this.CHAR_WIDTH + this.CHAR_SPACING) * scale;
      }
    }
  }

  private static drawChar(
    ctx: CanvasRenderingContext2D,
    pattern: CharPattern,
    x: number,
    y: number,
    scale: number
  ): void {
    for (let row = 0; row < pattern.length; row++) {
      const line = pattern[row];
      for (let col = 0; col < line.length; col++) {
        if (line[col] === 'X') {
          ctx.fillRect(
            Math.floor(x + col * scale),
            Math.floor(y + row * scale),
            Math.ceil(scale),
            Math.ceil(scale)
          );
        }
      }
    }
  }

  /**
   * Draw smaller 3x5 text for compact displays
   */
  static drawSmallText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    scale: number = 1,
    color: string = '#ffffff'
  ): void {
    ctx.fillStyle = color;
    let offsetX = 0;

    for (const char of text) {
      const pattern = SMALL_CHAR_PATTERNS[char];
      if (pattern) {
        for (let row = 0; row < pattern.length; row++) {
          const line = pattern[row];
          for (let col = 0; col < line.length; col++) {
            if (line[col] === 'X') {
              ctx.fillRect(
                Math.floor(x + offsetX + col * scale),
                Math.floor(y + row * scale),
                Math.ceil(scale),
                Math.ceil(scale)
              );
            }
          }
        }
        offsetX += 4 * scale; // 3 width + 1 spacing
      } else {
        offsetX += 4 * scale;
      }
    }
  }

  /**
   * Measure text width in pixels
   */
  static measureText(text: string, scale: number = 1): number {
    const charCount = text.length;
    if (charCount === 0) return 0;
    return (
      charCount * this.CHAR_WIDTH * scale +
      (charCount - 1) * this.CHAR_SPACING * scale
    );
  }

  /**
   * Measure small text width
   */
  static measureSmallText(text: string, scale: number = 1): number {
    const charCount = text.length;
    if (charCount === 0) return 0;
    return charCount * 4 * scale - scale; // 3 width + 1 spacing, minus final spacing
  }

  /**
   * Get text height
   */
  static getHeight(scale: number = 1): number {
    return this.CHAR_HEIGHT * scale;
  }

  /**
   * Get small text height
   */
  static getSmallHeight(scale: number = 1): number {
    return 5 * scale;
  }

  /**
   * Draw centered text
   */
  static drawTextCentered(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    y: number,
    scale: number = 1,
    color: string = '#ffffff',
    shadowColor?: string
  ): void {
    const width = this.measureText(text, scale);
    this.drawText(ctx, text, centerX - width / 2, y, scale, color, shadowColor);
  }

  /**
   * Draw text with outline
   */
  static drawTextWithOutline(
    ctx: CanvasRenderingContext2D,
    text: string,
    centerX: number,
    y: number,
    scale: number = 1,
    color: string = '#ffffff',
    outlineColor: string = '#000000'
  ): void {
    // Center the text
    const width = this.measureText(text, scale);
    const x = centerX - width / 2;

    // Draw outline in 8 directions
    const offsets = [
      [-1, -1], [0, -1], [1, -1],
      [-1, 0],          [1, 0],
      [-1, 1],  [0, 1],  [1, 1]
    ];

    for (const [ox, oy] of offsets) {
      this.drawText(ctx, text, x + ox * scale, y + oy * scale, scale, outlineColor);
    }

    // Draw main text
    this.drawText(ctx, text, x, y, scale, color);
  }
}
