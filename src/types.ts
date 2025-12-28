// Document configuration (immutable after creation)
export interface DocumentConfig {
  cols: number;
  rows: number;
  fontFamily: string;
  fontSize: number;
  polarity: 'light-on-dark' | 'dark-on-light';
  allowedCharset: string[];
}

// Conversion settings (adjustable at runtime)
// Matches AsciiCanvasConfig from drascii
export interface ConversionSettings {
  maxOffset: number;
  testFlips: boolean;
  missingInkWeight: number;
  extraInkWeight: number;
  offsetPenalty: number;
  centroidWeight: number;
  flipPenalty: number;
  inkThreshold: number;
}

// Default conversion settings
export const DEFAULT_CONVERSION_SETTINGS: ConversionSettings = {
  maxOffset: 2,
  testFlips: true,
  missingInkWeight: 2,
  extraInkWeight: 2,
  offsetPenalty: 3,
  centroidWeight: 2,
  flipPenalty: 1,
  inkThreshold: 64
};

// Derived dimensions from glyph library
export interface TileDimensions {
  tileWidth: number;
  tileHeight: number;
  canvasWidth: number;
  canvasHeight: number;
  baseline: number;  // Distance from top of cell to text baseline
}

// Glyph cell with flip information
export interface GlyphCell {
  char: string;
  flipX: boolean;
  flipY: boolean;
}

// Text layer cell (user-typed characters)
export interface TextCell {
  char: string;
}

// Selection rectangle (cell coordinates)
export interface Selection {
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
}

// Normalized selection (start <= end)
export interface NormalizedSelection {
  minCol: number;
  minRow: number;
  maxCol: number;
  maxRow: number;
}

// Mouse event with pixel and cell coordinates
export interface CanvasMouseEvent {
  pixelX: number;
  pixelY: number;
  cellCol: number;
  cellRow: number;
  altKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  buttons: number;
  snappedToCenter: boolean;  // Alt/Option snaps to cell center
}

// Tool callbacks for document mutations
export interface ToolCallbacks {
  getPixelCanvas(): ImageData;
  setPixelCanvas(data: ImageData): void;
  getTextLayer(): Map<string, TextCell>;
  setTextCell(col: number, row: number, char: string | null): void;
  clearTextCell(col: number, row: number): void;
  clearTextInPixelRegion(pixels: Iterable<{ x: number; y: number }>): void;
  pushUndo(): void;
  requestRender(): void;
  requestConversion(): void;
  setPreviewCanvas(data: ImageData | null): void;
  getSelection(): Selection | null;
  setSelection(selection: Selection | null): void;
  setCursor(col: number, row: number, snappedToCenter?: boolean): void;
  getCursor(): { col: number; row: number; snappedToCenter?: boolean } | null;
}

// Undo state snapshot
export interface UndoState {
  pixelData: Uint8ClampedArray;
  textLayer: Map<string, TextCell>;
  conversionSettings?: ConversionSettings;
}

// File metadata for save/load
export interface DocumentMetadata {
  version: number;
  cols: number;
  rows: number;
  fontFamily: string;
  fontSize: number;
  polarity: 'light-on-dark' | 'dark-on-light';
  allowedCharset: string[];
  textLayer: Array<{ col: number; row: number; char: string }>;
  conversionSettings?: ConversionSettings;
}

// Export format for glyphs
export interface GlyphExport {
  cols: number;
  rows: number;
  glyphs: GlyphCell[][];
}

// Helper to normalize selection bounds
export function normalizeSelection(sel: Selection): NormalizedSelection {
  return {
    minCol: Math.min(sel.startCol, sel.endCol),
    minRow: Math.min(sel.startRow, sel.endRow),
    maxCol: Math.max(sel.startCol, sel.endCol),
    maxRow: Math.max(sel.startRow, sel.endRow)
  };
}

// Helper to create text layer key
export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

// Helper to parse text layer key
export function parseKey(key: string): { col: number; row: number } {
  const [col, row] = key.split(',').map(Number);
  return { col: col!, row: row! };
}

// Charset preset identifiers
export type CharsetPreset = 'basic' | 'extended' | 'box-drawing' | 'minimal' | 'custom';

// Charset preset definitions
export const CHARSET_PRESETS: Record<Exclude<CharsetPreset, 'custom'>, { label: string; description: string }> = {
  'basic': {
    label: 'Basic ASCII',
    description: 'Printable ASCII characters (space through ~)'
  },
  'extended': {
    label: 'Extended',
    description: 'ASCII + box drawing + block elements'
  },
  'box-drawing': {
    label: 'Box Drawing Only',
    description: 'Box drawing and line characters'
  },
  'minimal': {
    label: 'Minimal',
    description: 'Basic shapes and punctuation'
  }
};

// Minimal charset for simple drawings
export const MINIMAL_CHARSET = [
  ' ', '.', ',', '\'', '`', '-', '_', '|', '/', '\\',
  '+', '*', '#', '@', 'o', 'O', '0', '(', ')', '[', ']'
];

// Helper to dedupe charset and ensure space is included
export function normalizeCharset(chars: string[]): string[] {
  const set = new Set(chars);
  set.add(' '); // Always include space
  return [...set];
}
