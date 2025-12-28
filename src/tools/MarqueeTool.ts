import { BaseTool } from './Tool.js';
import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks, Selection } from '../types.js';
import { normalizeSelection } from '../types.js';

export class MarqueeTool extends BaseTool {
  readonly name = 'Marquee';
  readonly cursor = 'crosshair';
  readonly icon = '⬚';

  private isSelecting = false;
  private startCol = 0;
  private startRow = 0;

  onMouseDown(e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    this.isSelecting = true;
    this.startCol = e.cellCol;
    this.startRow = e.cellRow;

    // Start selection at single cell
    callbacks.setSelection({
      startCol: e.cellCol,
      startRow: e.cellRow,
      endCol: e.cellCol,
      endRow: e.cellRow
    });
    callbacks.requestRender();
  }

  onMouseMove(e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    callbacks.setCursor(e.cellCol, e.cellRow);

    if (this.isSelecting) {
      callbacks.setSelection({
        startCol: this.startCol,
        startRow: this.startRow,
        endCol: e.cellCol,
        endRow: e.cellRow
      });
    }

    callbacks.requestRender();
  }

  onMouseUp(_e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {
    this.isSelecting = false;
  }

  onKeyDown(e: KeyboardEvent, doc: Document, callbacks: ToolCallbacks): void {
    const selection = callbacks.getSelection();

    // Cmd/Ctrl+C to copy
    if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
      if (selection) {
        e.preventDefault();
        this.copySelection(doc, selection);
      }
      return;
    }

    // Cmd/Ctrl+A to select all
    if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
      e.preventDefault();
      callbacks.setSelection({
        startCol: 0,
        startRow: 0,
        endCol: doc.config.cols - 1,
        endRow: doc.config.rows - 1
      });
      callbacks.requestRender();
      return;
    }

    // Escape to deselect
    if (e.key === 'Escape') {
      e.preventDefault();
      callbacks.setSelection(null);
      callbacks.requestRender();
      return;
    }

    // Delete/Backspace to clear selection
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selection) {
        e.preventDefault();
        this.clearSelection(doc, selection, callbacks);
        callbacks.setSelection(null);
        callbacks.pushUndo();
        callbacks.requestRender();
        callbacks.requestConversion();
      }
    }
  }

  private clearSelection(doc: Document, selection: Selection, callbacks: ToolCallbacks): void {
    const norm = normalizeSelection(selection);
    const canvas = callbacks.getPixelCanvas();
    const { tileWidth, tileHeight } = doc.dimensions;

    // Clear pixels in selected region
    for (let row = norm.minRow; row <= norm.maxRow; row++) {
      for (let col = norm.minCol; col <= norm.maxCol; col++) {
        // Clear pixel region for this cell
        const startX = col * tileWidth;
        const startY = row * tileHeight;
        for (let y = startY; y < startY + tileHeight; y++) {
          for (let x = startX; x < startX + tileWidth; x++) {
            if (x < canvas.width && y < canvas.height) {
              const idx = (y * canvas.width + x) * 4;
              canvas.data[idx] = doc.bgValue;
              canvas.data[idx + 1] = doc.bgValue;
              canvas.data[idx + 2] = doc.bgValue;
              canvas.data[idx + 3] = 255;
            }
          }
        }
        // Clear text layer for this cell
        callbacks.clearTextCell(col, row);
      }
    }
  }

  private copySelection(doc: Document, selection: Selection): void {
    const norm = normalizeSelection(selection);
    const lines: string[] = [];

    for (let row = norm.minRow; row <= norm.maxRow; row++) {
      let line = '';
      for (let col = norm.minCol; col <= norm.maxCol; col++) {
        const { char } = doc.getFinalChar(col, row);
        line += char;
      }
      lines.push(line);
    }

    const text = lines.join('\n');

    // Copy to clipboard
    navigator.clipboard.writeText(text).catch(err => {
      console.error('Failed to copy to clipboard:', err);
    });
  }

  deactivate(_doc: Document, callbacks: ToolCallbacks): void {
    this.isSelecting = false;
    // Clear selection when switching away from Marquee tool
    callbacks.setSelection(null);
  }
}
