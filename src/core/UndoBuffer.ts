import type { TextCell, UndoState } from '../types.js';

export class UndoBuffer {
  private stack: UndoState[] = [];
  private index: number = -1;
  private readonly maxSize: number;

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize;
  }

  push(state: UndoState): void {
    // Remove any redo states
    if (this.index < this.stack.length - 1) {
      this.stack = this.stack.slice(0, this.index + 1);
    }

    // Add new state
    this.stack.push(state);
    this.index = this.stack.length - 1;

    // Trim to max size
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
      this.index--;
    }
  }

  undo(): UndoState | null {
    if (!this.canUndo()) {
      return null;
    }
    this.index--;
    return this.cloneState(this.stack[this.index]!);
  }

  redo(): UndoState | null {
    if (!this.canRedo()) {
      return null;
    }
    this.index++;
    return this.cloneState(this.stack[this.index]!);
  }

  canUndo(): boolean {
    return this.index > 0;
  }

  canRedo(): boolean {
    return this.index < this.stack.length - 1;
  }

  get length(): number {
    return this.stack.length;
  }

  get currentIndex(): number {
    return this.index;
  }

  clear(): void {
    this.stack = [];
    this.index = -1;
  }

  // Clone state to avoid mutations
  private cloneState(state: UndoState): UndoState {
    return {
      pixelData: new Uint8ClampedArray(state.pixelData),
      textLayer: new Map(state.textLayer)
    };
  }

  // Create state from document data
  static createState(pixelData: Uint8ClampedArray, textLayer: Map<string, TextCell>): UndoState {
    return {
      pixelData: new Uint8ClampedArray(pixelData),
      textLayer: new Map(textLayer)
    };
  }
}
