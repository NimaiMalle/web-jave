import { BaseTool } from './Tool.js';
import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks } from '../types.js';
import { ellipseOutline, setPixel } from '../utils/geometry.js';

export class OvalTool extends BaseTool {
  readonly name = 'Oval';
  readonly cursor = 'crosshair';
  readonly icon = '⭕';

  private isDrawing = false;
  private startX = 0;
  private startY = 0;
  private endX = 0;
  private endY = 0;
  private previewCanvas: ImageData | null = null;

  onMouseDown(e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {
    this.isDrawing = true;
    this.startX = e.pixelX;
    this.startY = e.pixelY;
    this.endX = e.pixelX;
    this.endY = e.pixelY;
  }

  onMouseMove(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    callbacks.setCursor(e.cellCol, e.cellRow, e.snappedToCenter);

    if (!this.isDrawing) {
      callbacks.requestRender();
      return;
    }

    this.endX = e.pixelX;
    this.endY = e.pixelY;

    // Create preview canvas
    this.previewCanvas = new ImageData(
      doc.dimensions.canvasWidth,
      doc.dimensions.canvasHeight
    );
    for (const pt of ellipseOutline(this.startX, this.startY, this.endX, this.endY)) {
      setPixel(this.previewCanvas, pt.x, pt.y, doc.inkValue);
    }

    callbacks.setPreviewCanvas(this.previewCanvas);
    callbacks.requestRender();
    callbacks.requestConversion();
  }

  onMouseUp(_e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void {
    if (!this.isDrawing) return;

    // Commit ellipse to pixel canvas and track drawn pixels
    const canvas = callbacks.getPixelCanvas();
    const drawnPixels: Array<{ x: number; y: number }> = [];
    for (const pt of ellipseOutline(this.startX, this.startY, this.endX, this.endY)) {
      setPixel(canvas, pt.x, pt.y, doc.inkValue);
      drawnPixels.push(pt);
    }
    callbacks.setPixelCanvas(canvas);

    // Clear text in cells that were drawn over
    callbacks.clearTextInPixelRegion(drawnPixels);
    callbacks.pushUndo();

    // Clear preview
    this.previewCanvas = null;
    callbacks.setPreviewCanvas(null);

    this.isDrawing = false;
    callbacks.requestRender();
    callbacks.requestConversion();
  }

  deactivate(_doc: Document, callbacks: ToolCallbacks): void {
    this.isDrawing = false;
    this.previewCanvas = null;
    callbacks.setPreviewCanvas(null);
  }

  getPreviewCanvas(): ImageData | null {
    return this.previewCanvas;
  }
}
