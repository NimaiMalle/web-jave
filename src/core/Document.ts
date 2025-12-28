import type {
  DocumentConfig,
  TileDimensions,
  GlyphCell,
  TextCell,
  Selection
} from '../types.js';
import { cellKey } from '../types.js';

export class Document {
  // Immutable configuration
  readonly config: DocumentConfig;
  readonly dimensions: TileDimensions;

  // Mutable state
  private _pixelCanvas: ImageData;
  private _glyphLayer: GlyphCell[][];
  private _textLayer: Map<string, TextCell>;
  private _selection: Selection | null = null;
  private _cursor: { col: number; row: number; snappedToCenter: boolean } | null = null;

  constructor(config: DocumentConfig, dimensions: TileDimensions) {
    this.config = config;
    this.dimensions = dimensions;

    // Initialize pixel canvas (all zeros = black for light-on-dark)
    this._pixelCanvas = new ImageData(
      dimensions.canvasWidth,
      dimensions.canvasHeight
    );
    // Fill with appropriate background based on polarity
    if (config.polarity === 'dark-on-light') {
      const data = this._pixelCanvas.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255;     // R
        data[i + 1] = 255; // G
        data[i + 2] = 255; // B
        data[i + 3] = 255; // A
      }
    } else {
      // light-on-dark: black background
      const data = this._pixelCanvas.data;
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 0;       // R
        data[i + 1] = 0;   // G
        data[i + 2] = 0;   // B
        data[i + 3] = 255; // A
      }
    }

    // Initialize glyph layer (all spaces)
    this._glyphLayer = [];
    for (let row = 0; row < config.rows; row++) {
      const rowData: GlyphCell[] = [];
      for (let col = 0; col < config.cols; col++) {
        rowData.push({ char: ' ', flipX: false, flipY: false });
      }
      this._glyphLayer.push(rowData);
    }

    // Initialize empty text layer
    this._textLayer = new Map();
  }

  // Pixel canvas accessors
  get pixelCanvas(): ImageData {
    return this._pixelCanvas;
  }

  setPixelCanvas(data: ImageData): void {
    this._pixelCanvas = data;
  }

  // Create a copy of pixel data for undo
  clonePixelData(): Uint8ClampedArray {
    return new Uint8ClampedArray(this._pixelCanvas.data);
  }

  // Restore pixel data from undo
  restorePixelData(data: Uint8ClampedArray): void {
    this._pixelCanvas.data.set(data);
  }

  // Glyph layer accessors
  get glyphLayer(): GlyphCell[][] {
    return this._glyphLayer;
  }

  setGlyphLayer(glyphs: GlyphCell[][]): void {
    this._glyphLayer = glyphs;
  }

  getGlyph(col: number, row: number): GlyphCell | null {
    if (row < 0 || row >= this.config.rows || col < 0 || col >= this.config.cols) {
      return null;
    }
    return this._glyphLayer[row]![col]!;
  }

  // Text layer accessors
  get textLayer(): Map<string, TextCell> {
    return this._textLayer;
  }

  cloneTextLayer(): Map<string, TextCell> {
    return new Map(this._textLayer);
  }

  restoreTextLayer(layer: Map<string, TextCell>): void {
    this._textLayer = new Map(layer);
  }

  getTextCell(col: number, row: number): TextCell | null {
    return this._textLayer.get(cellKey(col, row)) ?? null;
  }

  setTextCell(col: number, row: number, char: string): void {
    this._textLayer.set(cellKey(col, row), { char });
  }

  clearTextCell(col: number, row: number): void {
    this._textLayer.delete(cellKey(col, row));
  }

  // Get the final character at a cell (text layer takes priority)
  getFinalChar(col: number, row: number): { char: string; flipX: boolean; flipY: boolean; isText: boolean } {
    const text = this.getTextCell(col, row);
    if (text) {
      return { char: text.char, flipX: false, flipY: false, isText: true };
    }
    const glyph = this.getGlyph(col, row);
    if (glyph) {
      return { char: glyph.char, flipX: glyph.flipX, flipY: glyph.flipY, isText: false };
    }
    return { char: ' ', flipX: false, flipY: false, isText: false };
  }

  // Selection accessors
  get selection(): Selection | null {
    return this._selection;
  }

  setSelection(sel: Selection | null): void {
    this._selection = sel;
  }

  // Cursor accessors
  get cursor(): { col: number; row: number } | null {
    return this._cursor;
  }

  setCursor(col: number, row: number, snappedToCenter: boolean = false): void {
    if (col >= 0 && col < this.config.cols && row >= 0 && row < this.config.rows) {
      this._cursor = { col, row, snappedToCenter };
    }
  }

  clearCursor(): void {
    this._cursor = null;
  }

  // Coordinate helpers
  pixelToCell(pixelX: number, pixelY: number): { col: number; row: number } {
    const col = Math.floor(pixelX / this.dimensions.tileWidth);
    const row = Math.floor(pixelY / this.dimensions.tileHeight);
    return {
      col: Math.max(0, Math.min(this.config.cols - 1, col)),
      row: Math.max(0, Math.min(this.config.rows - 1, row))
    };
  }

  cellToPixel(col: number, row: number): { x: number; y: number } {
    return {
      x: col * this.dimensions.tileWidth,
      y: row * this.dimensions.tileHeight
    };
  }

  // Check if coordinates are in bounds
  isInBounds(col: number, row: number): boolean {
    return col >= 0 && col < this.config.cols && row >= 0 && row < this.config.rows;
  }

  isPixelInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.dimensions.canvasWidth && y >= 0 && y < this.dimensions.canvasHeight;
  }

  // Get ink/background colors based on polarity
  get inkValue(): number {
    return this.config.polarity === 'light-on-dark' ? 255 : 0;
  }

  get bgValue(): number {
    return this.config.polarity === 'light-on-dark' ? 0 : 255;
  }
}
