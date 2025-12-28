import type { Document } from '../core/Document.js';
import type { CanvasMouseEvent, ToolCallbacks } from '../types.js';

export interface Tool {
  readonly name: string;
  readonly cursor: string;
  readonly icon: string;

  // Mouse events
  onMouseDown(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void;
  onMouseMove(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void;
  onMouseUp(e: CanvasMouseEvent, doc: Document, callbacks: ToolCallbacks): void;

  // Keyboard events (optional)
  onKeyDown?(e: KeyboardEvent, doc: Document, callbacks: ToolCallbacks): void;

  // Lifecycle
  activate?(doc: Document, callbacks: ToolCallbacks): void;
  deactivate?(doc: Document, callbacks: ToolCallbacks): void;

  // Preview rendering (optional, for shape tools)
  getPreviewCanvas?(): ImageData | null;
}

export abstract class BaseTool implements Tool {
  abstract readonly name: string;
  abstract readonly cursor: string;
  abstract readonly icon: string;

  onMouseDown(_e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {}
  onMouseMove(_e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {}
  onMouseUp(_e: CanvasMouseEvent, _doc: Document, _callbacks: ToolCallbacks): void {}
  onKeyDown?(_e: KeyboardEvent, _doc: Document, _callbacks: ToolCallbacks): void {}
  activate?(_doc: Document, _callbacks: ToolCallbacks): void {}
  deactivate?(_doc: Document, _callbacks: ToolCallbacks): void {}
  getPreviewCanvas?(): ImageData | null { return null; }
}
