import { BaseTool } from './Tool.js';
import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks } from '../types.js';
import { bresenhamLine, setPixel } from '../utils/geometry.js';

export class PencilTool extends BaseTool {
  readonly name = 'Pencil';
  readonly cursor = 'crosshair';
  readonly icon = '✏️';

  private isDrawing = false;
  private lastX = 0;
  private lastY = 0;
  private hasDrawn = false;
  private drawnPixels: Array<{ x: number; y: number }> = [];

  onMouseDown(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    this.isDrawing = true;
    this.lastX = e.pixelX;
    this.lastY = e.pixelY;
    this.hasDrawn = false;
    this.drawnPixels = [];

    // Draw initial pixel
    const canvas = callbacks.getPixelCanvas();
    setPixel(canvas, e.pixelX, e.pixelY, doc.inkValue);
    this.drawnPixels.push({ x: e.pixelX, y: e.pixelY });
    callbacks.setPixelCanvas(canvas);
    callbacks.requestRender();
    callbacks.requestConversion();
    this.hasDrawn = true;
  }

  onMouseMove(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    // Always update cursor cell highlight (pass snappedToCenter for crosshair display)
    callbacks.setCursor(e.cellCol, e.cellRow, e.snappedToCenter);
    callbacks.requestRender();

    if (!this.isDrawing) return;

    // Draw line from last position to current
    const canvas = callbacks.getPixelCanvas();
    for (const pt of bresenhamLine(this.lastX, this.lastY, e.pixelX, e.pixelY)) {
      setPixel(canvas, pt.x, pt.y, doc.inkValue);
      this.drawnPixels.push(pt);
    }
    callbacks.setPixelCanvas(canvas);

    this.lastX = e.pixelX;
    this.lastY = e.pixelY;
    this.hasDrawn = true;

    callbacks.requestRender();
    callbacks.requestConversion();
  }

  onMouseUp(_e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    if (this.isDrawing && this.hasDrawn) {
      // Clear text in cells that were drawn over
      callbacks.clearTextInPixelRegion(this.drawnPixels);
      callbacks.pushUndo();
    }
    this.isDrawing = false;
    this.hasDrawn = false;
    this.drawnPixels = [];
  }

  deactivate(_doc: Document, _callbacks: ToolCallbacks): void {
    this.isDrawing = false;
    this.hasDrawn = false;
    this.drawnPixels = [];
  }
}
