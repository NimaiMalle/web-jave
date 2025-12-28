import type { Document } from './Document.js';
import type { Selection } from '../types.js';
import type { GlyphLibrary } from 'drascii';
import { normalizeSelection, cellKey } from '../types.js';

export interface RenderOptions {
  showGlyphs: boolean;
  showGrid: boolean;
  pixelOpacity: number;  // 0, 0.5, or 1.0
  glyphOpacity: number;
  gridOpacity: number;
}

export interface TextCursorState {
  col: number;
  row: number;
  visible: boolean;  // For blinking animation
}

export class Renderer {
  private displayCanvas: HTMLCanvasElement;
  private displayCtx: CanvasRenderingContext2D;
  private offscreenCanvas: OffscreenCanvas;
  private offscreenCtx: OffscreenCanvasRenderingContext2D;

  // DOM-based glyph grid overlay
  private glyphGrid: HTMLDivElement | null = null;
  private glyphCells: HTMLSpanElement[][] = [];
  private currentCols = 0;
  private currentRows = 0;

  private options: RenderOptions = {
    showGlyphs: true,
    showGrid: false,
    pixelOpacity: 0.5,  // Default 50%
    glyphOpacity: 1.0,
    gridOpacity: 0.15
  };

  constructor(canvas: HTMLCanvasElement) {
    this.displayCanvas = canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get 2D context');
    }
    this.displayCtx = ctx;

    // Create offscreen canvas for compositing
    this.offscreenCanvas = new OffscreenCanvas(1, 1);
    const offCtx = this.offscreenCanvas.getContext('2d');
    if (!offCtx) {
      throw new Error('Failed to get offscreen 2D context');
    }
    this.offscreenCtx = offCtx;

    // Create DOM glyph grid overlay
    this.createGlyphGrid();
  }

  private createGlyphGrid(): void {
    this.glyphGrid = document.createElement('div');
    this.glyphGrid.className = 'glyph-grid';
    // Insert after canvas in the same container
    this.displayCanvas.parentElement?.appendChild(this.glyphGrid);
  }

  private ensureGlyphCells(cols: number, rows: number, tileWidth: number, tileHeight: number, fontFamily: string, fontSize: number, _baseline: number): void {
    if (!this.glyphGrid) return;

    // Only rebuild if dimensions changed
    if (cols === this.currentCols && rows === this.currentRows) return;

    this.currentCols = cols;
    this.currentRows = rows;

    // Clear existing cells
    this.glyphGrid.innerHTML = '';
    this.glyphCells = [];

    // Set up grid styles
    this.glyphGrid.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      pointer-events: none;
      display: grid;
      grid-template-columns: repeat(${cols}, ${tileWidth}px);
      grid-template-rows: repeat(${rows}, ${tileHeight}px);
      gap: 0;
      font-family: "${fontFamily}";
      font-size: ${fontSize}px;
    `;

    // Create cell elements
    // Position text so baseline matches drascii's rendering
    // drascii uses: ctx.fillText(char, 0, baseline) with textBaseline='alphabetic'
    // This places the character's alphabetic baseline at y=baseline from the top.
    //
    // To match this in CSS, we use a span positioned so its baseline aligns with
    // the same position. With line-height: 0, the inline box has no height and
    // the baseline of the text is at the top of that zero-height box.
    // We then use padding-top to push it down to the desired baseline position.

    for (let row = 0; row < rows; row++) {
      const rowCells: HTMLSpanElement[] = [];
      for (let col = 0; col < cols; col++) {
        const cell = document.createElement('span');
        cell.className = 'glyph-cell';
        // Simple approach: let the browser handle text positioning naturally
        // with line-height matching the cell height for vertical centering
        cell.style.cssText = `
          display: block;
          width: ${tileWidth}px;
          height: ${tileHeight}px;
          line-height: ${tileHeight}px;
          text-align: left;
          overflow: visible;
        `;
        this.glyphGrid.appendChild(cell);
        rowCells.push(cell);
      }
      this.glyphCells.push(rowCells);
    }
  }

  resize(width: number, height: number): void {
    this.displayCanvas.width = width;
    this.displayCanvas.height = height;
    this.offscreenCanvas = new OffscreenCanvas(width, height);
    const ctx = this.offscreenCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to get offscreen 2D context');
    }
    this.offscreenCtx = ctx;

    // Reset grid on resize (will be rebuilt on next render)
    this.currentCols = 0;
    this.currentRows = 0;
  }

  setOptions(options: Partial<RenderOptions>): void {
    this.options = { ...this.options, ...options };
  }

  getOptions(): RenderOptions {
    return { ...this.options };
  }

  render(doc: Document, previewCanvas: ImageData | null = null, isDrawing: boolean = false, _glyphLibrary: GlyphLibrary | null = null, textCursor: TextCursorState | null = null): void {
    const { canvasWidth, canvasHeight, tileWidth, tileHeight } = doc.dimensions;
    const ctx = this.offscreenCtx;

    // Clear to background
    ctx.fillStyle = doc.config.polarity === 'light-on-dark' ? '#000' : '#fff';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);

    // When drawing (or previewing), always show pixels at 100%
    // When not drawing, use the configured pixelOpacity (0, 0.5, or 1.0)
    const effectiveOpacity = (isDrawing || previewCanvas) ? 1.0 : this.options.pixelOpacity;

    // Draw pixel layer
    // Note: putImageData ignores globalAlpha, so we need to use drawImage via a temp canvas
    if (effectiveOpacity > 0) {
      const tempCanvas = new OffscreenCanvas(canvasWidth, canvasHeight);
      const tempCtx = tempCanvas.getContext('2d')!;
      tempCtx.putImageData(doc.pixelCanvas, 0, 0);

      // Draw preview overlay if present
      if (previewCanvas) {
        tempCtx.putImageData(previewCanvas, 0, 0);
      }

      ctx.globalAlpha = effectiveOpacity;
      ctx.drawImage(tempCanvas, 0, 0);
      ctx.globalAlpha = 1.0;
    }

    // Draw grid (on canvas)
    if (this.options.showGrid) {
      this.renderGrid(ctx, doc, tileWidth, tileHeight);
    }

    // Draw selection (on canvas)
    if (doc.selection) {
      this.renderSelection(ctx, doc.selection, tileWidth, tileHeight);
    }

    // Draw cursor highlight (on canvas)
    // If text cursor is active, use that instead of doc.cursor
    if (textCursor) {
      this.renderTextCursor(ctx, textCursor, tileWidth, tileHeight, doc.config.polarity);
    } else if (doc.cursor) {
      this.renderCursor(ctx, doc.cursor, tileWidth, tileHeight, doc.config.polarity);
    }

    // Copy to display canvas
    this.displayCtx.drawImage(this.offscreenCanvas, 0, 0);

    // Update DOM glyph layer
    if (this.options.showGlyphs) {
      this.renderGlyphsDOM(doc, tileWidth, tileHeight);
      if (this.glyphGrid) {
        this.glyphGrid.style.opacity = String(this.options.glyphOpacity);
        this.glyphGrid.style.display = 'grid';
      }
    } else {
      if (this.glyphGrid) {
        this.glyphGrid.style.display = 'none';
      }
    }
  }

  private renderGrid(
    ctx: OffscreenCanvasRenderingContext2D,
    doc: Document,
    tileWidth: number,
    tileHeight: number
  ): void {
    const { canvasWidth, canvasHeight } = doc.dimensions;
    const { cols, rows, polarity } = doc.config;

    ctx.strokeStyle = polarity === 'light-on-dark'
      ? `rgba(255, 255, 255, ${this.options.gridOpacity})`
      : `rgba(0, 0, 0, ${this.options.gridOpacity})`;
    ctx.lineWidth = 1;

    ctx.beginPath();

    // Vertical lines
    for (let col = 1; col < cols; col++) {
      const x = col * tileWidth + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasHeight);
    }

    // Horizontal lines
    for (let row = 1; row < rows; row++) {
      const y = row * tileHeight + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(canvasWidth, y);
    }

    ctx.stroke();
  }

  private renderGlyphsDOM(
    doc: Document,
    tileWidth: number,
    tileHeight: number
  ): void {
    const { cols, rows, fontFamily, fontSize, polarity } = doc.config;
    const { baseline } = doc.dimensions;
    const textLayer = doc.textLayer;
    const glyphLayer = doc.glyphLayer;

    // Ensure grid cells exist
    this.ensureGlyphCells(cols, rows, tileWidth, tileHeight, fontFamily, fontSize, baseline);

    const fgColor = polarity === 'light-on-dark' ? '#fff' : '#000';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = this.glyphCells[row]?.[col];
        if (!cell) continue;

        // Check text layer first (priority)
        const textCell = textLayer.get(cellKey(col, row));
        if (textCell) {
          cell.textContent = textCell.char;
          cell.style.color = fgColor;
          cell.style.transform = 'none';
          continue;
        }

        // Draw glyph from glyph layer
        const glyph = glyphLayer[row]?.[col];
        if (glyph && glyph.char !== ' ') {
          cell.textContent = glyph.char;
          cell.style.color = fgColor;

          // Apply CSS transforms for flips
          if (glyph.flipX || glyph.flipY) {
            const scaleX = glyph.flipX ? -1 : 1;
            const scaleY = glyph.flipY ? -1 : 1;
            cell.style.transform = `scale(${scaleX}, ${scaleY})`;
          } else {
            cell.style.transform = 'none';
          }
        } else {
          cell.textContent = '';
          cell.style.transform = 'none';
        }
      }
    }
  }

  private renderSelection(
    ctx: OffscreenCanvasRenderingContext2D,
    selection: Selection,
    tileWidth: number,
    tileHeight: number
  ): void {
    const norm = normalizeSelection(selection);
    const x = norm.minCol * tileWidth;
    const y = norm.minRow * tileHeight;
    const w = (norm.maxCol - norm.minCol + 1) * tileWidth;
    const h = (norm.maxRow - norm.minRow + 1) * tileHeight;

    // Selection highlight
    ctx.fillStyle = 'rgba(74, 158, 255, 0.2)';
    ctx.fillRect(x, y, w, h);

    // Selection border
    ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
    ctx.setLineDash([]);
  }

  private renderCursor(
    ctx: OffscreenCanvasRenderingContext2D,
    cursor: { col: number; row: number; snappedToCenter?: boolean },
    tileWidth: number,
    tileHeight: number,
    polarity: 'light-on-dark' | 'dark-on-light'
  ): void {
    const x = cursor.col * tileWidth;
    const y = cursor.row * tileHeight;
    const centerX = x + tileWidth / 2;
    const centerY = y + tileHeight / 2;

    const color = polarity === 'light-on-dark'
      ? 'rgba(255, 255, 255, 0.5)'
      : 'rgba(0, 0, 0, 0.5)';

    ctx.strokeStyle = color;
    ctx.lineWidth = 1;

    if (cursor.snappedToCenter) {
      // Draw crosshair at cell center for snap mode
      const crossSize = Math.min(tileWidth, tileHeight) * 0.4;

      ctx.beginPath();
      // Horizontal line
      ctx.moveTo(centerX - crossSize, centerY + 0.5);
      ctx.lineTo(centerX + crossSize, centerY + 0.5);
      // Vertical line
      ctx.moveTo(centerX + 0.5, centerY - crossSize);
      ctx.lineTo(centerX + 0.5, centerY + crossSize);
      ctx.stroke();

      // Also draw cell border (thinner)
      ctx.strokeStyle = polarity === 'light-on-dark'
        ? 'rgba(255, 255, 255, 0.3)'
        : 'rgba(0, 0, 0, 0.3)';
      ctx.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, tileHeight - 1);
    } else {
      // Standard cell highlight
      ctx.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, tileHeight - 1);
    }
  }

  private renderTextCursor(
    ctx: OffscreenCanvasRenderingContext2D,
    cursor: TextCursorState,
    tileWidth: number,
    tileHeight: number,
    polarity: 'light-on-dark' | 'dark-on-light'
  ): void {
    const x = cursor.col * tileWidth;
    const y = cursor.row * tileHeight;

    // Always draw the cell border
    const borderColor = polarity === 'light-on-dark'
      ? 'rgba(255, 255, 255, 0.7)'
      : 'rgba(0, 0, 0, 0.7)';
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, tileHeight - 1);

    // Draw blinking caret on left edge of cell when visible
    if (cursor.visible) {
      const caretColor = polarity === 'light-on-dark' ? '#fff' : '#000';
      ctx.fillStyle = caretColor;
      // Vertical line caret, 2px wide
      ctx.fillRect(x + 1, y + 2, 2, tileHeight - 4);
    }
  }

  // Render cell highlight for tool hover
  renderCellHighlight(col: number, row: number, doc: Document): void {
    const { tileWidth, tileHeight } = doc.dimensions;
    const ctx = this.displayCtx;
    const x = col * tileWidth;
    const y = row * tileHeight;

    ctx.strokeStyle = 'rgba(74, 158, 255, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, tileWidth - 1, tileHeight - 1);
  }

  // Update the transform for panning (applies to glyph grid overlay)
  setTransform(x: number, y: number): void {
    if (this.glyphGrid) {
      this.glyphGrid.style.transform = `translate(${x}px, ${y}px)`;
    }
  }
}
