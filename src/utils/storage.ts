import type { Document } from '../core/Document.js';
import type { DocumentMetadata, GlyphExport, ConversionSettings } from '../types.js';
import { parseKey } from '../types.js';

// LocalStorage key for auto-save
const AUTOSAVE_KEY = 'web-jave-autosave';

// Loupe/magnifier state for autosave
export interface LoupeState {
  isOpen: boolean;
  pinnedCell: { col: number; row: number } | null;
}

// Auto-saved document state
export interface AutosaveData {
  metadata: DocumentMetadata;
  pixelData: string; // Base64-encoded PNG
  loupeState?: LoupeState;
}

// Save document as PNG + JSON metadata
export async function saveDocument(doc: Document, filename: string): Promise<void> {
  // Create PNG from pixel canvas
  const canvas = document.createElement('canvas');
  canvas.width = doc.dimensions.canvasWidth;
  canvas.height = doc.dimensions.canvasHeight;
  const ctx = canvas.getContext('2d')!;
  ctx.putImageData(doc.pixelCanvas, 0, 0);

  // Convert to blob
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  // Create metadata
  const metadata: DocumentMetadata = {
    version: 1,
    cols: doc.config.cols,
    rows: doc.config.rows,
    fontFamily: doc.config.fontFamily,
    fontSize: doc.config.fontSize,
    polarity: doc.config.polarity,
    allowedCharset: doc.config.allowedCharset,
    textLayer: []
  };

  // Convert text layer to array
  for (const [key, cell] of doc.textLayer) {
    const { col, row } = parseKey(key);
    metadata.textLayer.push({ col, row, char: cell.char });
  }

  // Download PNG
  downloadBlob(blob, `${filename}.png`);

  // Download metadata JSON
  const metaBlob = new Blob([JSON.stringify(metadata, null, 2)], { type: 'application/json' });
  downloadBlob(metaBlob, `${filename}.meta.json`);
}

// Load document from files
export async function loadDocument(
  pngFile: File,
  metaFile: File
): Promise<{ imageData: ImageData; metadata: DocumentMetadata }> {
  // Parse metadata
  const metaText = await metaFile.text();
  const metadata: DocumentMetadata = JSON.parse(metaText);

  // Load PNG
  const imageData = await loadPng(pngFile);

  return { imageData, metadata };
}

// Load PNG file to ImageData
async function loadPng(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Export glyphs as JSON
export function exportGlyphs(doc: Document): void {
  const exportData: GlyphExport = {
    cols: doc.config.cols,
    rows: doc.config.rows,
    glyphs: []
  };

  // Build glyph array with text layer priority
  for (let row = 0; row < doc.config.rows; row++) {
    const rowData = [];
    for (let col = 0; col < doc.config.cols; col++) {
      const { char, flipX, flipY } = doc.getFinalChar(col, row);
      rowData.push({ char, flipX, flipY });
    }
    exportData.glyphs.push(rowData);
  }

  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'ascii-export.json');
}

// Export source pixel canvas as 8-bit grayscale PNG
export async function exportSourcePng(doc: Document): Promise<void> {
  const { canvasWidth, canvasHeight } = doc.dimensions;
  const srcData = doc.pixelCanvas.data;

  // Create a canvas for the grayscale export
  const canvas = document.createElement('canvas');
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;
  const ctx = canvas.getContext('2d')!;

  // Create new ImageData with grayscale values converted to RGB
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  const dstData = imageData.data;

  for (let i = 0; i < srcData.length; i += 4) {
    // Source is grayscale stored in R channel
    const gray = srcData[i]!;
    dstData[i] = gray;     // R
    dstData[i + 1] = gray; // G
    dstData[i + 2] = gray; // B
    dstData[i + 3] = 255;  // A
  }

  ctx.putImageData(imageData, 0, 0);

  // Convert to blob and download
  const blob = await new Promise<Blob>((resolve) => {
    canvas.toBlob((b) => resolve(b!), 'image/png');
  });

  downloadBlob(blob, 'source-canvas.png');
}

// Import source PNG - returns grayscale ImageData and computed grid dimensions
export interface ImportedImage {
  imageData: ImageData;
  cols: number;
  rows: number;
}

export async function importSourcePng(
  file: File,
  tileWidth: number,
  tileHeight: number
): Promise<ImportedImage> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      // Calculate grid dimensions (round down to whole cells)
      const cols = Math.floor(img.width / tileWidth);
      const rows = Math.floor(img.height / tileHeight);

      if (cols === 0 || rows === 0) {
        reject(new Error('Image too small for current cell size'));
        return;
      }

      // Canvas size is exact multiple of tile dimensions
      const canvasWidth = cols * tileWidth;
      const canvasHeight = rows * tileHeight;

      const canvas = document.createElement('canvas');
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d')!;

      // Draw image at 1:1, cropping any excess
      ctx.drawImage(img, 0, 0);

      // Get the drawn image data
      const srcData = ctx.getImageData(0, 0, canvasWidth, canvasHeight);

      // Convert to grayscale (store in all RGB channels)
      const data = srcData.data;
      for (let i = 0; i < data.length; i += 4) {
        // Luminance formula
        const gray = Math.round(0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!);
        data[i] = gray;
        data[i + 1] = gray;
        data[i + 2] = gray;
        // Alpha stays at 255
      }

      resolve({ imageData: srcData, cols, rows });
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

// Export as plain text
export function exportText(doc: Document): void {
  const lines: string[] = [];

  for (let row = 0; row < doc.config.rows; row++) {
    let line = '';
    for (let col = 0; col < doc.config.cols; col++) {
      const { char } = doc.getFinalChar(col, row);
      line += char;
    }
    // Trim trailing spaces but keep the line
    lines.push(line.trimEnd());
  }

  // Remove trailing empty lines
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
  downloadBlob(blob, 'ascii-export.txt');
}

// Helper to download a blob
function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Create file input for loading
export function createFileInput(
  accept: string,
  multiple: boolean,
  onFiles: (files: FileList) => void
): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.multiple = multiple;
  input.addEventListener('change', () => {
    if (input.files && input.files.length > 0) {
      onFiles(input.files);
    }
  });
  input.click();
}

// Auto-save document to localStorage
export async function autosaveDocument(
  doc: Document,
  conversionSettings?: ConversionSettings,
  loupeState?: LoupeState
): Promise<void> {
  try {
    // Create PNG from pixel canvas
    const canvas = document.createElement('canvas');
    canvas.width = doc.dimensions.canvasWidth;
    canvas.height = doc.dimensions.canvasHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.putImageData(doc.pixelCanvas, 0, 0);

    // Convert to base64
    const pixelData = canvas.toDataURL('image/png');

    // Create metadata
    const metadata: DocumentMetadata = {
      version: 1,
      cols: doc.config.cols,
      rows: doc.config.rows,
      fontFamily: doc.config.fontFamily,
      fontSize: doc.config.fontSize,
      polarity: doc.config.polarity,
      allowedCharset: doc.config.allowedCharset,
      textLayer: [],
      conversionSettings
    };

    // Convert text layer to array
    for (const [key, cell] of doc.textLayer) {
      const { col, row } = parseKey(key);
      metadata.textLayer.push({ col, row, char: cell.char });
    }

    const autosaveData: AutosaveData = { metadata, pixelData, loupeState };
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(autosaveData));
  } catch (e) {
    console.warn('Failed to autosave document:', e);
  }
}

// Load auto-saved document from localStorage
export async function loadAutosave(): Promise<{
  imageData: ImageData;
  metadata: DocumentMetadata;
  loupeState?: LoupeState;
} | null> {
  try {
    const stored = localStorage.getItem(AUTOSAVE_KEY);
    if (!stored) return null;

    const autosaveData: AutosaveData = JSON.parse(stored);

    // Load PNG from base64
    const imageData = await loadBase64Png(autosaveData.pixelData);

    return {
      imageData,
      metadata: autosaveData.metadata,
      loupeState: autosaveData.loupeState
    };
  } catch (e) {
    console.warn('Failed to load autosave:', e);
    return null;
  }
}

// Load PNG from base64 data URL
async function loadBase64Png(dataUrl: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      resolve(ctx.getImageData(0, 0, img.width, img.height));
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}
