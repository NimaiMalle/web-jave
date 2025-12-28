import {
  GlyphGenerator,
  GlyphLibrary,
  AsciiCanvas,
  EXTENDED_CHARSET,
  type GeneratedGlyphLibrary
} from 'drascii';
import type { GlyphCell, ConversionSettings } from '../types.js';
import { DEFAULT_CONVERSION_SETTINGS } from '../types.js';

export class GlyphProcessor {
  private library: GlyphLibrary;
  private generatedLibrary: GeneratedGlyphLibrary | null = null;  // Cache full glyph data
  private ascii: AsciiCanvas | null = null;
  private debounceTimer: number | null = null;
  private isProcessing: boolean = false;
  private pendingCallback: ((glyphs: GlyphCell[][]) => void) | null = null;

  private readonly fontFamily: string;
  private readonly fontSize: number;
  private _charset: string[];
  private readonly debounceMs: number;

  private _tileWidth: number = 0;
  private _tileHeight: number = 0;
  private _baseline: number = 0;
  private _initialized: boolean = false;
  private _settings: ConversionSettings;

  constructor(
    fontFamily: string,
    fontSize: number,
    charset: string[],
    debounceMs: number = 250,
    settings?: ConversionSettings
  ) {
    this.fontFamily = fontFamily;
    this.fontSize = fontSize;
    this._charset = charset;
    this.debounceMs = debounceMs;
    this._settings = settings ?? { ...DEFAULT_CONVERSION_SETTINGS };
    this.library = new GlyphLibrary();
  }

  async initialize(): Promise<{ tileWidth: number; tileHeight: number; baseline: number }> {
    // Generate glyph library from font using EXTENDED_CHARSET (full set)
    // We cache this and filter by allowedChars when loading
    const generator = new GlyphGenerator();
    this.generatedLibrary = generator.generate(this.fontFamily, {
      fontSize: this.fontSize,
      charset: EXTENDED_CHARSET,
      forceEvenDimensions: true,  // Ensures symmetric ellipse/shape drawing
    });

    // Load into library with current charset filter
    const allowedChars = new Set(this._charset);
    this.library.loadFromGenerated(this.generatedLibrary, allowedChars);

    // Create ASCII converter with current settings
    this.ascii = new AsciiCanvas(this.library, this.settingsToOptions());

    // Store dimensions and baseline
    const dims = this.ascii.getTileDimensions();
    this._tileWidth = dims.width;
    this._tileHeight = dims.height;
    this._baseline = this.generatedLibrary.baseline;
    this._initialized = true;

    return { tileWidth: this._tileWidth, tileHeight: this._tileHeight, baseline: this._baseline };
  }

  // Convert settings to AsciiCanvas options format
  private settingsToOptions() {
    return {
      maxOffset: this._settings.maxOffset,
      testFlips: this._settings.testFlips,
      missingInkWeight: this._settings.missingInkWeight,
      extraInkWeight: this._settings.extraInkWeight,
      offsetPenalty: this._settings.offsetPenalty,
      centroidWeight: this._settings.centroidWeight,
      flipPenalty: this._settings.flipPenalty,
      inkThreshold: this._settings.inkThreshold
    };
  }

  // Update conversion settings and recreate AsciiCanvas
  updateSettings(settings: ConversionSettings): void {
    this._settings = { ...settings };
    if (this._initialized) {
      this.ascii = new AsciiCanvas(this.library, this.settingsToOptions());
    }
  }

  // Get current settings
  getSettings(): ConversionSettings {
    return { ...this._settings };
  }

  // Get current charset
  getCharset(): string[] {
    return [...this._charset];
  }

  // Update charset by reloading from cached glyph data with new filter
  updateCharset(newCharset: string[]): void {
    if (!this.generatedLibrary) return;

    this._charset = [...newCharset];

    // Reload library from cached data with new charset filter
    const allowedChars = new Set(newCharset);
    this.library.loadFromGenerated(this.generatedLibrary, allowedChars);

    // Recreate ASCII converter
    this.ascii = new AsciiCanvas(this.library, this.settingsToOptions());
  }

  get initialized(): boolean {
    return this._initialized;
  }

  get tileWidth(): number {
    return this._tileWidth;
  }

  get tileHeight(): number {
    return this._tileHeight;
  }

  get baseline(): number {
    return this._baseline;
  }

  getTileDimensions(): { width: number; height: number } {
    return { width: this._tileWidth, height: this._tileHeight };
  }

  // Debounced conversion - call frequently, executes after pause
  requestConversion(
    pixelCanvas: ImageData,
    callback: (glyphs: GlyphCell[][]) => void
  ): void {
    // Cancel any pending conversion
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
    }

    this.pendingCallback = callback;

    this.debounceTimer = window.setTimeout(() => {
      this.debounceTimer = null;
      this.executeConversion(pixelCanvas);
    }, this.debounceMs);
  }

  // Immediate conversion (for commit or preview)
  convertImmediate(pixelCanvas: ImageData): GlyphCell[][] {
    if (!this.ascii) {
      throw new Error('GlyphProcessor not initialized');
    }

    const result = this.ascii.convertImageData(pixelCanvas);
    return this.resultToGlyphLayer(result);
  }

  // Cancel pending conversion
  cancel(): void {
    if (this.debounceTimer !== null) {
      window.clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.pendingCallback = null;
  }

  private executeConversion(pixelCanvas: ImageData): void {
    if (!this.ascii || this.isProcessing || !this.pendingCallback) {
      return;
    }

    this.isProcessing = true;
    const callback = this.pendingCallback;
    this.pendingCallback = null;

    try {
      const result = this.ascii.convertImageData(pixelCanvas);
      const glyphs = this.resultToGlyphLayer(result);
      callback(glyphs);
    } finally {
      this.isProcessing = false;
    }
  }

  private resultToGlyphLayer(result: ReturnType<AsciiCanvas['convertImageData']>): GlyphCell[][] {
    const glyphs: GlyphCell[][] = [];

    for (let row = 0; row < result.rows; row++) {
      const rowData: GlyphCell[] = [];
      for (let col = 0; col < result.cols; col++) {
        const cell = result.get(col, row);
        if (cell) {
          rowData.push({
            char: cell.char,
            flipX: cell.flipX,
            flipY: cell.flipY
          });
        } else {
          rowData.push({ char: ' ', flipX: false, flipY: false });
        }
      }
      glyphs.push(rowData);
    }

    return glyphs;
  }

  // Get library for serialization if needed
  getLibrary(): GlyphLibrary {
    return this.library;
  }
}
