import type { Document } from '../core/Document.js';
import type { GlyphLibrary } from 'drascii';

export class MagnifierPanel {
  private panel: HTMLElement;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private headerText: HTMLElement;
  private pinBtn: HTMLElement;
  private closeBtn: HTMLElement;

  private isOpen = false;
  private isPinned = false;
  private pinnedCol = 0;
  private pinnedRow = 0;

  // Magnification scale (pixels per source pixel)
  private readonly scale = 8;
  // Extra pixels around cell to show (based on maxOffset)
  private padding = 3;

  constructor() {
    this.panel = this.createPanel();
    this.canvas = this.panel.querySelector('canvas')!;
    this.ctx = this.canvas.getContext('2d')!;
    this.headerText = this.panel.querySelector('.magnifier-header-text')!;
    this.pinBtn = this.panel.querySelector('.magnifier-pin')!;
    this.closeBtn = this.panel.querySelector('.magnifier-close')!;

    this.pinBtn.addEventListener('click', () => {
      if (this.isPinned) {
        this.unpin();
      }
    });
    this.closeBtn.addEventListener('click', () => this.close());

    document.body.appendChild(this.panel);
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'magnifier-panel';
    panel.innerHTML = `
      <div class="magnifier-header">
        <span class="magnifier-header-text">Cell 0, 0</span>
        <button class="magnifier-pin" title="Unpin">📌</button>
        <button class="magnifier-close" title="Close">&times;</button>
      </div>
      <div class="magnifier-canvas-container">
        <canvas></canvas>
      </div>
      <div class="magnifier-footer">
        <span class="magnifier-glyph-info"></span>
        <span class="magnifier-hint">⌘/Ctrl+click to pin</span>
      </div>
    `;
    return panel;
  }

  open(): void {
    if (this.isOpen) return;
    this.panel.classList.add('open');
    this.isOpen = true;
    this.isPinned = false;
  }

  close(): void {
    this.panel.classList.remove('open');
    this.isOpen = false;
    this.isPinned = false;
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  pin(col: number, row: number): void {
    this.isPinned = true;
    this.pinnedCol = col;
    this.pinnedRow = row;
    this.panel.classList.add('pinned');
    this.pinBtn.classList.add('active');
  }

  unpin(): void {
    this.isPinned = false;
    this.panel.classList.remove('pinned');
    this.pinBtn.classList.remove('active');
  }

  togglePin(col: number, row: number): void {
    if (this.isPinned && col === this.pinnedCol && row === this.pinnedRow) {
      // Click on already-pinned cell: unpin
      this.unpin();
    } else {
      // Click on new cell (or not pinned): pin to this cell
      this.pin(col, row);
    }
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  isPinnedState(): boolean {
    return this.isPinned;
  }

  getPinnedCell(): { col: number; row: number } | null {
    if (!this.isPinned) return null;
    return { col: this.pinnedCol, row: this.pinnedRow };
  }

  setMaxOffset(maxOffset: number): void {
    this.padding = maxOffset + 1;
  }

  update(
    col: number,
    row: number,
    document: Document,
    glyphLibrary: GlyphLibrary | null
  ): void {
    if (!this.isOpen) return;

    // Use pinned cell if pinned
    const targetCol = this.isPinned ? this.pinnedCol : col;
    const targetRow = this.isPinned ? this.pinnedRow : row;

    // Update header
    const pinnedIndicator = this.isPinned ? ' [pinned]' : '';
    this.headerText.textContent = `Cell ${targetCol}, ${targetRow}${pinnedIndicator}`;

    // Get text layer and glyph layer info for this cell
    const textCell = document.getTextCell(targetCol, targetRow);
    const glyph = document.getGlyph(targetCol, targetRow);
    const glyphInfoEl = this.panel.querySelector('.magnifier-glyph-info') as HTMLElement;

    // Determine what to display - text layer takes priority
    const displayChar = textCell?.char ?? glyph?.char;
    const isFromTextLayer = !!textCell;

    if (displayChar && displayChar !== ' ') {
      if (isFromTextLayer) {
        glyphInfoEl.textContent = `Text: ${displayChar}`;
      } else {
        const flipIndicators = (glyph!.flipX ? '↔' : '') + (glyph!.flipY ? '↕' : '');
        const flipStr = flipIndicators ? `  ${flipIndicators}` : '';
        glyphInfoEl.textContent = `Glyph: ${displayChar}${flipStr}`;
      }
    } else {
      glyphInfoEl.textContent = 'Glyph: (none)';
    }

    // Calculate canvas size
    const tileW = document.dimensions.tileWidth;
    const tileH = document.dimensions.tileHeight;
    const viewW = tileW + this.padding * 2;
    const viewH = tileH + this.padding * 2;

    this.canvas.width = viewW * this.scale;
    this.canvas.height = viewH * this.scale;

    // Clear canvas
    this.ctx.fillStyle = '#1a1a1a';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // Get source pixel region
    const cellX = targetCol * tileW;
    const cellY = targetRow * tileH;
    const startX = cellX - this.padding;
    const startY = cellY - this.padding;

    const pixelCanvas = document.pixelCanvas;

    // Draw source pixels
    for (let dy = 0; dy < viewH; dy++) {
      for (let dx = 0; dx < viewW; dx++) {
        const srcX = startX + dx;
        const srcY = startY + dy;

        // Check bounds
        if (srcX >= 0 && srcX < pixelCanvas.width && srcY >= 0 && srcY < pixelCanvas.height) {
          const idx = (srcY * pixelCanvas.width + srcX) * 4;
          const r = pixelCanvas.data[idx]!;

          // Draw as grayscale
          if (r > 0) {
            const brightness = r / 255;
            this.ctx.fillStyle = `rgba(255, 255, 255, ${brightness})`;
            this.ctx.fillRect(dx * this.scale, dy * this.scale, this.scale, this.scale);
          }
        }
      }
    }

    // Draw glyph overlay (red mask)
    // For text layer: show the glyph pixels for that character (no flips)
    // For glyph layer: show the matched glyph with flips applied
    if (displayChar && displayChar !== ' ' && glyphLibrary) {
      const glyphData = glyphLibrary.get(displayChar);
      if (glyphData) {
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.4)';

        for (let gy = 0; gy < tileH; gy++) {
          for (let gx = 0; gx < tileW; gx++) {
            // Apply flip transforms only for glyph layer (not text layer)
            let srcGx = gx;
            let srcGy = gy;
            if (!isFromTextLayer && glyph) {
              if (glyph.flipX) srcGx = tileW - 1 - gx;
              if (glyph.flipY) srcGy = tileH - 1 - gy;
            }

            const glyphIdx = srcGy * tileW + srcGx;
            const glyphPixel = glyphData.pixels[glyphIdx]!;

            if (glyphPixel > 0) {
              // Position within magnified view (offset by padding)
              const drawX = (this.padding + gx) * this.scale;
              const drawY = (this.padding + gy) * this.scale;
              this.ctx.fillRect(drawX, drawY, this.scale, this.scale);
            }
          }
        }
      }
    }

    // Draw grid lines
    this.ctx.strokeStyle = 'rgba(100, 100, 100, 0.3)';
    this.ctx.lineWidth = 1;

    // Pixel grid
    for (let x = 0; x <= viewW; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * this.scale + 0.5, 0);
      this.ctx.lineTo(x * this.scale + 0.5, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y <= viewH; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * this.scale + 0.5);
      this.ctx.lineTo(this.canvas.width, y * this.scale + 0.5);
      this.ctx.stroke();
    }

    // Cell boundary (thicker, brighter)
    this.ctx.strokeStyle = 'rgba(74, 158, 255, 0.8)';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(
      this.padding * this.scale,
      this.padding * this.scale,
      tileW * this.scale,
      tileH * this.scale
    );
  }

  destroy(): void {
    this.panel.remove();
  }
}
