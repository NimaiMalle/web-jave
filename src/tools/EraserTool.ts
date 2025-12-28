import { BaseTool } from './Tool.js';
import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks } from '../types.js';
import { erase3x3, eraseCell } from '../utils/geometry.js';

export class EraserTool extends BaseTool {
  readonly name = 'Eraser';
  readonly cursor = 'crosshair';
  readonly icon = '🧹';

  private isErasing = false;
  private lastX = 0;
  private lastY = 0;
  private hasErased = false;

  onMouseDown(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    this.isErasing = true;
    this.lastX = e.pixelX;
    this.lastY = e.pixelY;
    this.hasErased = false;

    this.eraseAt(e, doc, callbacks);
  }

  onMouseMove(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    callbacks.setCursor(e.cellCol, e.cellRow, e.snappedToCenter);

    if (!this.isErasing) {
      callbacks.requestRender();
      return;
    }

    // Interpolate between last and current position for smooth erasing
    const dx = e.pixelX - this.lastX;
    const dy = e.pixelY - this.lastY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(this.lastX + dx * t);
      const y = Math.round(this.lastY + dy * t);
      const interpolatedEvent: CanvasMouseEvent = {
        ...e,
        pixelX: x,
        pixelY: y,
        cellCol: Math.floor(x / doc.dimensions.tileWidth),
        cellRow: Math.floor(y / doc.dimensions.tileHeight)
      };
      this.eraseAt(interpolatedEvent, doc, callbacks);
    }

    this.lastX = e.pixelX;
    this.lastY = e.pixelY;
  }

  onMouseUp(_e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    if (this.isErasing && this.hasErased) {
      callbacks.pushUndo();
    }
    this.isErasing = false;
    this.hasErased = false;
  }

  private eraseAt(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    const canvas = callbacks.getPixelCanvas();

    if (e.altKey) {
      // Erase whole cell (Alt/Option held)
      eraseCell(
        canvas,
        e.cellCol,
        e.cellRow,
        doc.dimensions.tileWidth,
        doc.dimensions.tileHeight,
        doc.bgValue
      );
      // Also clear text layer for this cell
      callbacks.clearTextCell(e.cellCol, e.cellRow);
    } else {
      // Erase 3x3 pixel area
      erase3x3(canvas, e.pixelX, e.pixelY, doc.bgValue);
    }

    callbacks.setPixelCanvas(canvas);
    this.hasErased = true;

    callbacks.requestRender();
    callbacks.requestConversion();
  }

  deactivate(_doc: Document, _callbacks: ToolCallbacks): void {
    this.isErasing = false;
    this.hasErased = false;
  }
}
