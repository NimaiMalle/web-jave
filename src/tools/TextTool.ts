import { BaseTool } from './Tool.js';
import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks } from '../types.js';

export class TextTool extends BaseTool {
  readonly name = 'Text';
  readonly cursor = 'text';
  readonly icon = 'T';

  private cursorCol = 0;
  private cursorRow = 0;
  private isActive = false;
  private startCol = 0;  // Column where typing started (for Enter key)

  onMouseDown(e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    // Position cursor at clicked cell
    this.cursorCol = e.cellCol;
    this.cursorRow = e.cellRow;
    this.startCol = e.cellCol;  // Remember starting column for Enter
    this.isActive = true;

    callbacks.setCursor(this.cursorCol, this.cursorRow);
    callbacks.requestRender();
  }

  onMouseMove(e: CanvasMouseEvent, _doc: Document, callbacks: ToolCallbacks): void {
    // Only update cursor if not actively typing (cursor stays pinned during text entry)
    if (!this.isActive) {
      callbacks.setCursor(e.cellCol, e.cellRow);
      callbacks.requestRender();
    }
    // When active, cursor is managed by App's text cursor blinking system
  }

  onMouseUp(_e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {
    // Nothing to do
  }

  onKeyDown(e: KeyboardEvent, doc: Document, callbacks: ToolCallbacks): void {
    if (!this.isActive) return;

    const { cols, rows } = doc.config;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        if (this.cursorCol > 0) {
          this.cursorCol--;
        }
        break;

      case 'ArrowRight':
        e.preventDefault();
        if (this.cursorCol < cols - 1) {
          this.cursorCol++;
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (this.cursorRow > 0) {
          this.cursorRow--;
        }
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (this.cursorRow < rows - 1) {
          this.cursorRow++;
        }
        break;

      case 'Escape':
        e.preventDefault();
        // Exit active text entry (stay on Text tool)
        this.isActive = false;
        return;

      case 'Enter':
        e.preventDefault();
        if (e.metaKey || e.ctrlKey) {
          // Cmd/Ctrl+Enter: same as Escape - exit active text entry
          this.isActive = false;
          return;
        }
        // Move to starting column on next row (typewriter-style carriage return)
        this.cursorCol = this.startCol;
        if (this.cursorRow < rows - 1) {
          this.cursorRow++;
        }
        break;

      case 'Backspace':
        e.preventDefault();
        // Move back and clear
        if (this.cursorCol > 0) {
          this.cursorCol--;
          callbacks.clearTextCell(this.cursorCol, this.cursorRow);
          callbacks.pushUndo();
        } else if (this.cursorRow > 0) {
          this.cursorRow--;
          this.cursorCol = cols - 1;
          callbacks.clearTextCell(this.cursorCol, this.cursorRow);
          callbacks.pushUndo();
        }
        break;

      case 'Delete':
        e.preventDefault();
        // Clear current cell
        callbacks.clearTextCell(this.cursorCol, this.cursorRow);
        callbacks.pushUndo();
        break;

      case 'v':
        // Handle Cmd/Ctrl+V paste
        if (e.metaKey || e.ctrlKey) {
          e.preventDefault();
          this.handlePaste(doc, callbacks);
        }
        break;

      default:
        // Single printable character
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          callbacks.setTextCell(this.cursorCol, this.cursorRow, e.key);
          callbacks.pushUndo();

          // Advance cursor
          if (this.cursorCol < cols - 1) {
            this.cursorCol++;
          } else if (this.cursorRow < rows - 1) {
            this.cursorCol = 0;
            this.cursorRow++;
          }
        }
        break;
    }

    callbacks.setCursor(this.cursorCol, this.cursorRow);
    callbacks.requestRender();
  }

  activate(_doc: Document, _callbacks: ToolCallbacks): void {
    // Don't activate text entry - wait for user to click
    this.isActive = false;
  }

  deactivate(_doc: Document, _callbacks: ToolCallbacks): void {
    this.isActive = false;
  }

  // Get current cursor position for external use (blinking cursor in App)
  getCursorPosition(): { col: number; row: number } {
    return { col: this.cursorCol, row: this.cursorRow };
  }

  // Check if text tool is actively accepting input
  isActivelyTyping(): boolean {
    return this.isActive;
  }

  private async handlePaste(doc: Document, callbacks: ToolCallbacks): Promise<void> {
    try {
      const text = await navigator.clipboard.readText();
      if (!text) return;

      const { cols, rows } = doc.config;
      const lines = text.split('\n');

      let row = this.cursorRow;
      let col = this.cursorCol;

      for (const line of lines) {
        for (const char of line) {
          if (row >= rows) break;

          // Only insert printable characters
          if (char.length === 1 && char >= ' ') {
            callbacks.setTextCell(col, row, char);
          }

          // Advance cursor
          col++;
          if (col >= cols) {
            col = 0;
            row++;
          }
        }

        // Move to next line after each line of pasted text
        if (lines.length > 1) {
          col = 0;
          row++;
        }
      }

      // Update cursor position
      this.cursorCol = Math.min(col, cols - 1);
      this.cursorRow = Math.min(row, rows - 1);

      callbacks.pushUndo();
      callbacks.setCursor(this.cursorCol, this.cursorRow);
      callbacks.requestRender();
    } catch (err) {
      console.warn('Failed to paste:', err);
    }
  }
}
