import { Document } from './core/Document.js';
import { UndoBuffer } from './core/UndoBuffer.js';
import { GlyphProcessor } from './core/GlyphProcessor.js';
import { Renderer, type TextCursorState } from './core/Renderer.js';
import type { Tool } from './tools/Tool.js';
import { PencilTool } from './tools/PencilTool.js';
import { LineTool } from './tools/LineTool.js';
import { RectangleTool } from './tools/RectangleTool.js';
import { OvalTool } from './tools/OvalTool.js';
import { EraserTool } from './tools/EraserTool.js';
import { TextTool } from './tools/TextTool.js';
import { MarqueeTool } from './tools/MarqueeTool.js';
import type { DocumentConfig, CanvasMouseEvent, ToolCallbacks, ConversionSettings } from './types.js';
import { DEFAULT_CONVERSION_SETTINGS } from './types.js';
import { EXTENDED_CHARSET } from 'drascii';
import { showNewDocumentDialog } from './ui/NewDocumentDialog.js';
import { SettingsPanel } from './ui/SettingsPanel.js';
import { MagnifierPanel } from './ui/MagnifierPanel.js';
import { saveDocument, exportGlyphs, exportText, exportSourcePng, importSourcePng, createFileInput, loadDocument, autosaveDocument, loadAutosave, type LoupeState } from './utils/storage.js';
import { loadSettings, saveSettings } from './utils/settings.js';
import { preloadIcons, getToolIcon, getActionIcon, createIconElement, TOOL_HOTKEYS } from './utils/icons.js';
import { loadFont } from './utils/fonts.js';

export class App {
  private document: Document | null = null;
  private undoBuffer: UndoBuffer;
  private glyphProcessor: GlyphProcessor | null = null;
  private renderer: Renderer;

  private tools: Tool[];
  private currentTool: Tool;
  private previewCanvas: ImageData | null = null;

  private displayCanvas: HTMLCanvasElement;
  private toolbar: HTMLElement;
  private statusBar: HTMLElement;
  private settingsPanel: SettingsPanel | null = null;
  private magnifierPanel: MagnifierPanel | null = null;

  private isDrawing = false;
  private settingsBeforePreview: ConversionSettings | null = null;
  private charsetBeforePreview: string[] | null = null;

  // Pan state
  private panX = 0;
  private panY = 0;
  private canvasContainer: HTMLElement;

  // Autosave state
  private autosaveTimer: number | null = null;
  private readonly autosaveDelay = 1000; // 1 second debounce

  // Text cursor blinking state
  private textCursorVisible = true;
  private textCursorBlinkTimer: number | null = null;
  private readonly textCursorBlinkInterval = 530; // Standard cursor blink rate

  // Track last mouse position for Alt key cursor update
  private lastMouseEvent: MouseEvent | null = null;

  constructor() {
    // Get DOM elements
    this.displayCanvas = document.getElementById('display-canvas') as HTMLCanvasElement;
    this.toolbar = document.getElementById('toolbar') as HTMLElement;
    this.statusBar = document.getElementById('status-bar') as HTMLElement;
    this.canvasContainer = document.getElementById('canvas-container') as HTMLElement;

    if (!this.displayCanvas || !this.toolbar || !this.statusBar || !this.canvasContainer) {
      throw new Error('Required DOM elements not found');
    }

    // Initialize renderer
    this.renderer = new Renderer(this.displayCanvas);

    // Initialize undo buffer
    this.undoBuffer = new UndoBuffer(50);

    // Initialize tools
    this.tools = [
      new PencilTool(),
      new LineTool(),
      new RectangleTool(),
      new OvalTool(),
      new EraserTool(),
      new TextTool(),
      new MarqueeTool()
    ];

    // Restore active tool from settings
    const settings = loadSettings();
    const savedTool = this.tools.find(t => t.name === settings.activeTool);
    this.currentTool = savedTool ?? this.tools[0]!;

    // Set up UI (icons loaded async)
    this.setupToolbar();
    this.setupStatusBar();
    this.setupEventListeners();

    // Set initial cursor for restored tool
    this.displayCanvas.style.cursor = this.currentTool.cursor;

    // Preload icons and update toolbar
    preloadIcons().then(() => this.updateToolbarIcons());
  }

  async createDocument(config: Partial<DocumentConfig> = {}): Promise<void> {
    const fullConfig: DocumentConfig = {
      cols: config.cols ?? 40,
      rows: config.rows ?? 20,
      fontFamily: config.fontFamily ?? 'monospace',
      fontSize: config.fontSize ?? 16,
      polarity: config.polarity ?? 'light-on-dark',
      allowedCharset: config.allowedCharset ?? [...EXTENDED_CHARSET]
    };

    // Reset text tool state if active
    this.resetTextToolState();

    // Show loading state
    this.setStatus('Loading font...');

    // Load font (from Google Fonts if not available locally)
    const fontLoaded = await loadFont(fullConfig.fontFamily, fullConfig.fontSize);
    if (!fontLoaded) {
      console.warn(`Font "${fullConfig.fontFamily}" not available, falling back to monospace`);
      fullConfig.fontFamily = 'monospace';
    }

    this.setStatus('Initializing...');

    // Initialize glyph processor
    this.glyphProcessor = new GlyphProcessor(
      fullConfig.fontFamily,
      fullConfig.fontSize,
      fullConfig.allowedCharset
    );

    const { tileWidth, tileHeight, baseline } = await this.glyphProcessor.initialize();

    console.log(`Document dimensions: tileWidth=${tileWidth}, tileHeight=${tileHeight}, baseline=${baseline}`);

    // Create document with computed dimensions
    this.document = new Document(fullConfig, {
      tileWidth,
      tileHeight,
      canvasWidth: fullConfig.cols * tileWidth,
      canvasHeight: fullConfig.rows * tileHeight,
      baseline
    });

    // Resize renderer
    this.renderer.resize(
      this.document.dimensions.canvasWidth,
      this.document.dimensions.canvasHeight
    );

    // Clear undo buffer and push initial state
    this.undoBuffer.clear();
    this.pushUndoState();

    // Initial render
    this.render();
    this.setStatus(`${fullConfig.cols}×${fullConfig.rows} | ${fullConfig.fontFamily}`);

    // Refresh magnifier with new document (unpin if pinned cell is out of bounds)
    if (this.magnifierPanel?.isVisible()) {
      const pinned = this.magnifierPanel.getPinnedCell();
      if (pinned && (pinned.col >= fullConfig.cols || pinned.row >= fullConfig.rows)) {
        this.magnifierPanel.unpin();
      }
      this.updateMagnifier(0, 0);
    }
  }

  private setupToolbar(): void {
    this.toolbar.innerHTML = '';

    const isMac = navigator.platform.includes('Mac');
    const modKey = isMac ? '⌘' : 'Ctrl+';

    // File operations (icons-only)
    const newBtn = document.createElement('button');
    newBtn.dataset.action = 'new';
    newBtn.title = `New Document (${modKey}N)`;
    newBtn.addEventListener('click', () => this.showNewDocumentDialog());
    this.toolbar.appendChild(newBtn);

    const saveBtn = document.createElement('button');
    saveBtn.dataset.action = 'save';
    saveBtn.title = `Save Document (${modKey}S)`;
    saveBtn.addEventListener('click', () => this.saveDocument());
    this.toolbar.appendChild(saveBtn);

    const loadBtn = document.createElement('button');
    loadBtn.dataset.action = 'load';
    loadBtn.title = `Load Document (${modKey}O)`;
    loadBtn.addEventListener('click', () => this.loadDocument());
    this.toolbar.appendChild(loadBtn);

    const exportBtn = document.createElement('button');
    exportBtn.dataset.action = 'export';
    exportBtn.title = 'Export as Text/JSON';
    exportBtn.addEventListener('click', () => this.showExportMenu(exportBtn));
    this.toolbar.appendChild(exportBtn);

    // Separator
    const fileSep = document.createElement('div');
    fileSep.className = 'separator';
    this.toolbar.appendChild(fileSep);

    // Tool buttons (icons-only with hotkeys in tooltip)
    for (const tool of this.tools) {
      const btn = document.createElement('button');
      btn.dataset.tool = tool.name;
      const hotkey = TOOL_HOTKEYS[tool.name];
      btn.title = hotkey ? `${tool.name} (${hotkey})` : tool.name;

      if (tool === this.currentTool) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', () => this.selectTool(tool));
      this.toolbar.appendChild(btn);
    }

    // Separator
    const sep = document.createElement('div');
    sep.className = 'separator';
    this.toolbar.appendChild(sep);

    // Undo/Redo buttons (icons-only)
    const undoBtn = document.createElement('button');
    undoBtn.dataset.action = 'undo';
    undoBtn.title = `Undo (${modKey}Z)`;
    undoBtn.addEventListener('click', () => this.undo());
    this.toolbar.appendChild(undoBtn);

    const redoBtn = document.createElement('button');
    redoBtn.dataset.action = 'redo';
    redoBtn.title = `Redo (${modKey}${isMac ? '⇧Z' : 'Y'})`;
    redoBtn.addEventListener('click', () => this.redo());
    this.toolbar.appendChild(redoBtn);

    // Clear button
    const clearBtn = document.createElement('button');
    clearBtn.dataset.action = 'clear';
    clearBtn.title = 'Clear Canvas';
    clearBtn.addEventListener('click', () => this.clearCanvas());
    this.toolbar.appendChild(clearBtn);

    // Settings separator
    const settingsSep = document.createElement('div');
    settingsSep.className = 'separator';
    this.toolbar.appendChild(settingsSep);

    // Settings button
    const settingsBtn = document.createElement('button');
    settingsBtn.dataset.action = 'settings';
    settingsBtn.title = 'Conversion Settings';
    settingsBtn.addEventListener('click', () => this.toggleSettingsPanel());
    this.toolbar.appendChild(settingsBtn);
  }

  private async updateToolbarIcons(): Promise<void> {
    const iconSize = 20;

    // Update action buttons (icons only)
    for (const btn of this.toolbar.querySelectorAll('button[data-action]')) {
      const action = (btn as HTMLElement).dataset.action!;
      const svg = await getActionIcon(action);
      if (svg) {
        btn.innerHTML = '';
        btn.appendChild(createIconElement(svg, iconSize));
      }
    }

    // Update tool buttons (icons only)
    for (const btn of this.toolbar.querySelectorAll('button[data-tool]')) {
      const toolName = (btn as HTMLElement).dataset.tool!;
      const svg = await getToolIcon(toolName);
      if (svg) {
        btn.innerHTML = '';
        btn.appendChild(createIconElement(svg, iconSize));
      }
    }
  }

  private setupStatusBar(): void {
    // Load persisted settings
    const settings = loadSettings();

    // Left side: info
    const leftGroup = document.createElement('div');
    leftGroup.className = 'status-group status-left';
    leftGroup.innerHTML = `
      <span class="status-item">
        <span class="status-label">Cell:</span>
        <span id="status-cell">0, 0</span>
      </span>
      <span class="status-item">
        <span class="status-label">Pixel:</span>
        <span id="status-pixel">0, 0</span>
      </span>
      <span class="status-item" id="status-processing" style="display: none;">
        <span class="processing">Processing...</span>
      </span>
    `;
    this.statusBar.appendChild(leftGroup);

    // Right side: view toggles
    const rightGroup = document.createElement('div');
    rightGroup.className = 'status-group status-right';

    // Grid toggle
    const gridBtn = document.createElement('button');
    gridBtn.className = 'status-toggle';
    gridBtn.textContent = 'Grid';
    gridBtn.title = 'Toggle cell grid overlay';
    if (settings.showGrid) {
      gridBtn.classList.add('active');
    }
    gridBtn.addEventListener('click', () => {
      gridBtn.classList.toggle('active');
      const showGrid = gridBtn.classList.contains('active');
      this.setRenderOptions({ showGrid });
      saveSettings({ showGrid });
    });
    rightGroup.appendChild(gridBtn);

    // Pixels toggle (cycles: 100% -> 50% -> 0% -> 100%)
    const pixelsBtn = document.createElement('button');
    pixelsBtn.className = 'status-toggle';
    pixelsBtn.id = 'pixels-toggle';
    const updatePixelsBtn = (opacity: number) => {
      if (opacity === 1) {
        pixelsBtn.textContent = 'Pixels 100%';
        pixelsBtn.classList.add('active');
      } else if (opacity === 0.5) {
        pixelsBtn.textContent = 'Pixels 50%';
        pixelsBtn.classList.add('active');
      } else {
        pixelsBtn.textContent = 'Pixels Off';
        pixelsBtn.classList.remove('active');
      }
    };
    updatePixelsBtn(settings.pixelOpacity);
    pixelsBtn.title = 'Cycle pixel layer opacity (100% → 50% → Off)';
    pixelsBtn.addEventListener('click', () => {
      // Cycle: 1.0 -> 0.5 -> 0 -> 1.0
      const current = this.renderer.getOptions().pixelOpacity;
      let next: number;
      if (current === 1) {
        next = 0.5;
      } else if (current === 0.5) {
        next = 0;
      } else {
        next = 1;
      }
      this.setRenderOptions({ pixelOpacity: next });
      saveSettings({ pixelOpacity: next });
      updatePixelsBtn(next);
    });
    rightGroup.appendChild(pixelsBtn);

    // Center button
    const centerBtn = document.createElement('button');
    centerBtn.className = 'status-toggle';
    centerBtn.textContent = 'Center';
    centerBtn.title = 'Re-center canvas (Home / 0 / ⌘0)';
    centerBtn.addEventListener('click', () => this.centerCanvas());
    rightGroup.appendChild(centerBtn);

    // Loupe/Magnifier toggle
    const loupeBtn = document.createElement('button');
    loupeBtn.className = 'status-toggle';
    loupeBtn.id = 'loupe-toggle';
    loupeBtn.textContent = 'Loupe';
    loupeBtn.title = 'Toggle magnifier (click canvas to pin/unpin)';
    loupeBtn.addEventListener('click', () => this.toggleMagnifier());
    rightGroup.appendChild(loupeBtn);

    this.statusBar.appendChild(rightGroup);

    // Apply loaded settings to renderer
    this.renderer.setOptions({
      showGrid: settings.showGrid,
      pixelOpacity: settings.pixelOpacity
    });
  }

  private setupEventListeners(): void {
    // Canvas mouse events
    this.displayCanvas.addEventListener('mousedown', this.handleMouseDown.bind(this));
    this.displayCanvas.addEventListener('mousemove', this.handleMouseMove.bind(this));
    this.displayCanvas.addEventListener('mouseup', this.handleMouseUp.bind(this));
    this.displayCanvas.addEventListener('mouseleave', this.handleMouseLeave.bind(this));

    // Wheel event for panning (two-finger scroll on trackpad)
    this.canvasContainer.addEventListener('wheel', this.handleWheel.bind(this), { passive: false });

    // Keyboard events
    document.addEventListener('keydown', this.handleKeyDown.bind(this));
    document.addEventListener('keyup', this.handleKeyUp.bind(this));

    // Prevent context menu on canvas
    this.displayCanvas.addEventListener('contextmenu', e => e.preventDefault());
  }

  private selectTool(tool: Tool): void {
    // Stop text cursor blinking if leaving Text tool
    if (this.currentTool.name === 'Text') {
      this.stopTextCursorBlink();
    }

    // Deactivate current tool
    this.currentTool.deactivate?.(this.document!, this.getCallbacks());

    // Update toolbar UI
    for (const btn of this.toolbar.querySelectorAll('button[data-tool]')) {
      btn.classList.toggle('active', (btn as HTMLElement).dataset.tool === tool.name);
    }

    // Activate new tool
    this.currentTool = tool;
    this.currentTool.activate?.(this.document!, this.getCallbacks());

    // Start text cursor blinking if entering Text tool
    if (tool.name === 'Text') {
      this.startTextCursorBlink();
    }

    // Update cursor
    this.displayCanvas.style.cursor = tool.cursor;

    // Save active tool to settings
    saveSettings({ activeTool: tool.name });

    // Re-render to reflect tool change (e.g., cleared selection)
    this.render();
  }

  private startTextCursorBlink(): void {
    // Reset to visible and start timer
    this.textCursorVisible = true;
    this.stopTextCursorBlink(); // Clear any existing timer

    this.textCursorBlinkTimer = window.setInterval(() => {
      this.textCursorVisible = !this.textCursorVisible;
      this.render();
    }, this.textCursorBlinkInterval);
  }

  private stopTextCursorBlink(): void {
    if (this.textCursorBlinkTimer !== null) {
      clearInterval(this.textCursorBlinkTimer);
      this.textCursorBlinkTimer = null;
    }
  }

  private resetTextCursorBlink(): void {
    // Reset cursor to visible and restart timer (called on keystroke)
    this.textCursorVisible = true;
    if (this.currentTool.name === 'Text' && (this.currentTool as TextTool).isActivelyTyping()) {
      this.startTextCursorBlink();
    }
  }

  private resetTextToolState(): void {
    // Stop blinking cursor
    this.stopTextCursorBlink();

    // Deactivate text tool if it's active
    if (this.currentTool.name === 'Text') {
      (this.currentTool as TextTool).deactivate(this.document!, this.getCallbacks());
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    if (!this.document) return;

    const canvasEvent = this.createCanvasEvent(e);

    // Cmd/Ctrl+click to toggle pin on magnifier
    if ((e.metaKey || e.ctrlKey) && this.magnifierPanel?.isVisible()) {
      this.magnifierPanel.togglePin(canvasEvent.cellCol, canvasEvent.cellRow);
      this.updateMagnifier(canvasEvent.cellCol, canvasEvent.cellRow);
      this.requestAutosave();
      return;
    }

    this.isDrawing = true;
    this.currentTool.onMouseDown(canvasEvent, this.document, this.getCallbacks());

    // Start text cursor blink when clicking into text mode
    if (this.currentTool.name === 'Text') {
      this.startTextCursorBlink();
    }
  }

  private handleMouseMove(e: MouseEvent): void {
    if (!this.document) return;

    // Store for Alt key cursor updates
    this.lastMouseEvent = e;

    const canvasEvent = this.createCanvasEvent(e);
    this.currentTool.onMouseMove(canvasEvent, this.document, this.getCallbacks());

    // Update status bar
    this.updateStatusBar(canvasEvent);

    // Update magnifier
    this.updateMagnifier(canvasEvent.cellCol, canvasEvent.cellRow);
  }

  private handleMouseUp(e: MouseEvent): void {
    if (!this.document) return;

    const canvasEvent = this.createCanvasEvent(e);
    this.currentTool.onMouseUp(canvasEvent, this.document, this.getCallbacks());
    this.isDrawing = false;
    this.render(); // Re-render to potentially hide pixels
  }

  private handleMouseLeave(_e: MouseEvent): void {
    if (!this.document) return;
    this.document.clearCursor();
    this.render();
  }

  private handleWheel(e: WheelEvent): void {
    // Prevent default scrolling behavior
    e.preventDefault();

    // Pan the canvas
    this.panX -= e.deltaX;
    this.panY -= e.deltaY;

    this.updateCanvasPosition();
  }

  private updateCanvasPosition(): void {
    this.displayCanvas.style.transform = `translate(${this.panX}px, ${this.panY}px)`;
    this.renderer.setTransform(this.panX, this.panY);
  }

  private centerCanvas(): void {
    this.panX = 0;
    this.panY = 0;
    this.updateCanvasPosition();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.document) return;

    // Check if user is typing in an input field
    const isTypingInInput = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

    // Global shortcuts with modifier
    if (e.metaKey || e.ctrlKey) {
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        this.undo();
        return;
      }
      if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault();
        this.redo();
        return;
      }
      if (e.key === 's') {
        e.preventDefault();
        this.saveDocument();
        return;
      }
      if (e.key === 'n') {
        e.preventDefault();
        this.showNewDocumentDialog();
        return;
      }
      if (e.key === 'o') {
        e.preventDefault();
        this.loadDocument();
        return;
      }
      // Cmd/Ctrl+0 to center canvas (if not already centered, let browser handle zoom reset)
      if (e.key === '0') {
        if (this.panX !== 0 || this.panY !== 0) {
          e.preventDefault();
          this.centerCanvas();
        }
        return;
      }
      // Cmd/Ctrl+A to select all (works from any tool, but not when in input)
      if (e.key === 'a' && !isTypingInInput) {
        e.preventDefault();
        this.selectAll();
        return;
      }
    }

    // Home or 0 (without modifier) to center canvas - but not when typing in an input
    if (e.key === 'Home' || (e.key === '0' && !e.metaKey && !e.ctrlKey && !e.altKey && this.currentTool.name !== 'Text' && !isTypingInInput)) {
      e.preventDefault();
      this.centerCanvas();
      return;
    }

    // Tool hotkeys (single letter, no modifier, not when typing in text tool)
    if (!e.metaKey && !e.ctrlKey && !e.altKey) {
      const key = e.key.toUpperCase();
      const toolName = Object.entries(TOOL_HOTKEYS).find(([_, hotkey]) => hotkey === key)?.[0];
      if (toolName && this.currentTool.name !== 'Text') {
        const tool = this.tools.find(t => t.name === toolName);
        if (tool) {
          e.preventDefault();
          this.selectTool(tool);
          return;
        }
      }
    }

    // Track if text tool was actively typing before handling key
    const wasActivelyTyping = this.currentTool.name === 'Text' && (this.currentTool as TextTool).isActivelyTyping();

    // Tool-specific handling
    this.currentTool.onKeyDown?.(e, this.document, this.getCallbacks());

    // Handle text mode state changes
    if (this.currentTool.name === 'Text') {
      const isNowActivelyTyping = (this.currentTool as TextTool).isActivelyTyping();

      if (wasActivelyTyping && !isNowActivelyTyping) {
        // Exited active mode (Escape or Cmd+Enter) - stop blinking and re-render
        this.stopTextCursorBlink();
        this.render();
      } else if (isNowActivelyTyping) {
        // Reset cursor blink on any keystroke while in active text mode
        this.resetTextCursorBlink();

        // Update magnifier to show the current text cursor cell
        const pos = (this.currentTool as TextTool).getCursorPosition();
        this.updateMagnifier(pos.col, pos.row);
      }
    }

    // Alt key pressed - update cursor to show crosshair (snap-to-center indicator)
    if (e.key === 'Alt' && this.lastMouseEvent) {
      this.updateCursorFromLastMouse(true);
    }
  }

  private handleKeyUp(e: KeyboardEvent): void {
    // Alt key released - update cursor to hide crosshair
    if (e.key === 'Alt' && this.lastMouseEvent) {
      this.updateCursorFromLastMouse(false);
    }
  }

  private updateCursorFromLastMouse(snappedToCenter: boolean): void {
    if (!this.document || !this.lastMouseEvent) return;

    const rect = this.displayCanvas.getBoundingClientRect();
    const pixelX = Math.floor(this.lastMouseEvent.clientX - rect.left);
    const pixelY = Math.floor(this.lastMouseEvent.clientY - rect.top);

    const { tileWidth, tileHeight } = this.document.dimensions;

    let cellCol = Math.floor(pixelX / tileWidth);
    let cellRow = Math.floor(pixelY / tileHeight);

    // Clamp cell coordinates
    cellCol = Math.max(0, Math.min(cellCol, this.document.config.cols - 1));
    cellRow = Math.max(0, Math.min(cellRow, this.document.config.rows - 1));

    this.document.setCursor(cellCol, cellRow, snappedToCenter);
    this.render();
  }

  private createCanvasEvent(e: MouseEvent): CanvasMouseEvent {
    const rect = this.displayCanvas.getBoundingClientRect();
    // Account for pan offset when calculating pixel coordinates
    let pixelX = Math.floor(e.clientX - rect.left);
    let pixelY = Math.floor(e.clientY - rect.top);

    const { tileWidth, tileHeight } = this.document?.dimensions ?? { tileWidth: 1, tileHeight: 1 };

    let cellCol = Math.floor(pixelX / tileWidth);
    let cellRow = Math.floor(pixelY / tileHeight);

    // Clamp cell coordinates
    cellCol = Math.max(0, Math.min(cellCol, (this.document?.config.cols ?? 1) - 1));
    cellRow = Math.max(0, Math.min(cellRow, (this.document?.config.rows ?? 1) - 1));

    // Alt/Option key snaps to cell center
    const snappedToCenter = e.altKey;
    if (snappedToCenter && this.document) {
      pixelX = cellCol * tileWidth + Math.floor(tileWidth / 2);
      pixelY = cellRow * tileHeight + Math.floor(tileHeight / 2);
    }

    return {
      pixelX,
      pixelY,
      cellCol,
      cellRow,
      altKey: e.altKey,
      shiftKey: e.shiftKey,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      buttons: e.buttons,
      snappedToCenter
    };
  }

  private updateStatusBar(e: CanvasMouseEvent): void {
    const cellEl = document.getElementById('status-cell');
    const pixelEl = document.getElementById('status-pixel');
    if (cellEl) cellEl.textContent = `${e.cellCol}, ${e.cellRow}`;
    if (pixelEl) pixelEl.textContent = `${e.pixelX}, ${e.pixelY}`;
  }

  private setStatus(_text: string): void {
    // Update any status display if needed
  }

  private getCallbacks(): ToolCallbacks {
    return {
      getPixelCanvas: () => this.document!.pixelCanvas,
      setPixelCanvas: (data) => this.document!.setPixelCanvas(data),
      getTextLayer: () => this.document!.textLayer,
      setTextCell: (col, row, char) => {
        if (char) {
          this.document!.setTextCell(col, row, char);
        }
      },
      clearTextCell: (col, row) => this.document!.clearTextCell(col, row),
      clearTextInPixelRegion: (pixels) => this.clearTextInPixelRegion(pixels),
      pushUndo: () => this.pushUndoState(),
      requestRender: () => this.render(),
      requestConversion: () => this.requestConversion(),
      setPreviewCanvas: (data) => { this.previewCanvas = data; },
      getSelection: () => this.document!.selection,
      setSelection: (sel) => this.document!.setSelection(sel),
      setCursor: (col, row, snappedToCenter) => this.document!.setCursor(col, row, snappedToCenter),
      getCursor: () => this.document!.cursor
    };
  }

  // Clear text layer entries for cells that contain any of the given pixels
  private clearTextInPixelRegion(pixels: Iterable<{ x: number; y: number }>): void {
    if (!this.document) return;

    const { tileWidth, tileHeight } = this.document.dimensions;
    const clearedCells = new Set<string>();

    for (const { x, y } of pixels) {
      const col = Math.floor(x / tileWidth);
      const row = Math.floor(y / tileHeight);
      const key = `${col},${row}`;

      if (!clearedCells.has(key)) {
        clearedCells.add(key);
        this.document.clearTextCell(col, row);
      }
    }
  }

  private pushUndoState(): void {
    if (!this.document) return;

    this.undoBuffer.push(
      UndoBuffer.createState(
        this.document.clonePixelData(),
        this.document.cloneTextLayer()
      )
    );

    // Trigger autosave
    this.requestAutosave();
  }

  private undo(): void {
    if (!this.document) return;

    const state = this.undoBuffer.undo();
    if (state) {
      this.document.restorePixelData(state.pixelData);
      this.document.restoreTextLayer(state.textLayer);
      this.requestConversion();
      this.render();
      this.requestAutosave();
    }
  }

  private redo(): void {
    if (!this.document) return;

    const state = this.undoBuffer.redo();
    if (state) {
      this.document.restorePixelData(state.pixelData);
      this.document.restoreTextLayer(state.textLayer);
      this.requestConversion();
      this.render();
      this.requestAutosave();
    }
  }

  private clearCanvas(): void {
    if (!this.document) return;

    // Reset text tool state if active
    this.resetTextToolState();

    // Clear pixel canvas to background color
    const bgValue = this.document.bgValue;
    const pixelData = this.document.pixelCanvas.data;

    for (let i = 0; i < pixelData.length; i += 4) {
      pixelData[i] = bgValue;
      pixelData[i + 1] = bgValue;
      pixelData[i + 2] = bgValue;
      pixelData[i + 3] = 255;
    }

    // Clear text layer
    this.document.restoreTextLayer(new Map());

    // Push to undo and re-render
    this.pushUndoState();
    this.requestConversion();
    this.render();
  }

  private selectAll(): void {
    if (!this.document) return;

    // Switch to Marquee tool if not already
    const marqueeTool = this.tools.find(t => t.name === 'Marquee');
    if (marqueeTool && this.currentTool !== marqueeTool) {
      this.selectTool(marqueeTool);
    }

    // Select entire canvas
    this.document.setSelection({
      startCol: 0,
      startRow: 0,
      endCol: this.document.config.cols - 1,
      endRow: this.document.config.rows - 1
    });
    this.render();
  }

  private requestConversion(): void {
    if (!this.glyphProcessor || !this.document) return;

    // Show processing indicator
    const processingEl = document.getElementById('status-processing');
    if (processingEl) processingEl.style.display = 'block';

    // Get the canvas to convert (with preview if present)
    let canvasToConvert = this.document.pixelCanvas;
    if (this.previewCanvas) {
      // Composite preview onto copy of pixel canvas
      canvasToConvert = this.compositePreview();
    }

    this.glyphProcessor.requestConversion(canvasToConvert, (glyphs) => {
      if (this.document) {
        this.document.setGlyphLayer(glyphs);
        this.render();
        this.refreshMagnifier();
      }

      // Hide processing indicator
      if (processingEl) processingEl.style.display = 'none';
    });
  }

  // Refresh magnifier with current pinned cell or last known position
  private refreshMagnifier(): void {
    if (!this.magnifierPanel?.isVisible()) return;

    const pinned = this.magnifierPanel.getPinnedCell();
    if (pinned) {
      this.updateMagnifier(pinned.col, pinned.row);
    } else if (this.lastMouseEvent && this.document) {
      // Use last mouse position
      const rect = this.displayCanvas.getBoundingClientRect();
      const pixelX = Math.floor(this.lastMouseEvent.clientX - rect.left);
      const pixelY = Math.floor(this.lastMouseEvent.clientY - rect.top);
      const { tileWidth, tileHeight } = this.document.dimensions;
      const col = Math.floor(pixelX / tileWidth);
      const row = Math.floor(pixelY / tileHeight);
      this.updateMagnifier(col, row);
    }
  }

  // Immediate conversion (for settings/charset changes that need instant feedback)
  private convertImmediate(): void {
    if (!this.glyphProcessor || !this.document) return;

    const glyphs = this.glyphProcessor.convertImmediate(this.document.pixelCanvas);
    this.document.setGlyphLayer(glyphs);
    this.render();
    this.refreshMagnifier();
  }

  private compositePreview(): ImageData {
    if (!this.document || !this.previewCanvas) {
      return this.document!.pixelCanvas;
    }

    const base = this.document.pixelCanvas;
    const overlay = this.previewCanvas;
    const result = new ImageData(
      new Uint8ClampedArray(base.data),
      base.width,
      base.height
    );

    // Simple max composite for ink
    for (let i = 0; i < result.data.length; i += 4) {
      result.data[i] = Math.max(result.data[i]!, overlay.data[i]!);
      result.data[i + 1] = Math.max(result.data[i + 1]!, overlay.data[i + 1]!);
      result.data[i + 2] = Math.max(result.data[i + 2]!, overlay.data[i + 2]!);
    }

    return result;
  }

  private render(): void {
    if (!this.document) return;

    // Get text cursor state if in active text mode
    let textCursor: TextCursorState | null = null;
    if (this.currentTool.name === 'Text' && (this.currentTool as TextTool).isActivelyTyping()) {
      const pos = (this.currentTool as TextTool).getCursorPosition();
      textCursor = {
        col: pos.col,
        row: pos.row,
        visible: this.textCursorVisible
      };
    }

    this.renderer.render(
      this.document,
      this.previewCanvas,
      this.isDrawing,
      this.glyphProcessor?.getLibrary() ?? null,
      textCursor
    );
  }

  // Public method to update renderer options
  setRenderOptions(options: {
    showGrid?: boolean;
    gridOpacity?: number;
    pixelOpacity?: number;
  }): void {
    this.renderer.setOptions(options);
    this.render();
  }

  // File operations
  private showNewDocumentDialog(): void {
    const currentConfig = this.document?.config;
    showNewDocumentDialog(
      async (options) => {
        await this.createDocument({
          cols: options.cols,
          rows: options.rows,
          fontFamily: options.fontFamily,
          fontSize: options.fontSize,
          polarity: options.polarity,
          allowedCharset: [...EXTENDED_CHARSET]
        });
      },
      currentConfig ? {
        cols: currentConfig.cols,
        rows: currentConfig.rows,
        fontFamily: currentConfig.fontFamily,
        fontSize: currentConfig.fontSize,
        polarity: currentConfig.polarity
      } : undefined
    );
  }

  private saveDocument(): void {
    if (!this.document) return;

    const filename = prompt('Enter filename:', 'ascii-art');
    if (filename) {
      saveDocument(this.document, filename);
    }
  }

  private loadDocument(): void {
    createFileInput('.png,.json', true, async (files) => {
      // Find PNG and JSON files
      let pngFile: File | null = null;
      let jsonFile: File | null = null;

      for (const file of Array.from(files)) {
        if (file.name.endsWith('.png')) {
          pngFile = file;
        } else if (file.name.endsWith('.json')) {
          jsonFile = file;
        }
      }

      if (!pngFile || !jsonFile) {
        alert('Please select both a .png file and a .meta.json file');
        return;
      }

      try {
        const { imageData, metadata } = await loadDocument(pngFile, jsonFile);

        // Create document with loaded config
        await this.createDocument({
          cols: metadata.cols,
          rows: metadata.rows,
          fontFamily: metadata.fontFamily,
          fontSize: metadata.fontSize,
          polarity: metadata.polarity,
          allowedCharset: metadata.allowedCharset
        });

        // Restore pixel data
        if (this.document) {
          this.document.pixelCanvas.data.set(imageData.data);

          // Restore text layer
          for (const { col, row, char } of metadata.textLayer) {
            this.document.setTextCell(col, row, char);
          }

          // Push to undo and convert
          this.pushUndoState();
          this.requestConversion();
          this.render();
        }
      } catch (err) {
        console.error('Failed to load document:', err);
        alert('Failed to load document. Check console for details.');
      }
    });
  }

  private importSourcePng(): void {
    if (!this.document || !this.glyphProcessor) return;

    createFileInput('.png,.jpg,.jpeg,.gif,.webp', false, async (files) => {
      const file = files[0];
      if (!file) return;

      try {
        const { tileWidth, tileHeight } = this.document!.dimensions;
        const { imageData, cols, rows } = await importSourcePng(file, tileWidth, tileHeight);

        // Create new document with imported dimensions (keeps current font settings)
        const currentConfig = this.document!.config;
        await this.createDocument({
          cols,
          rows,
          fontFamily: currentConfig.fontFamily,
          fontSize: currentConfig.fontSize,
          polarity: currentConfig.polarity,
          allowedCharset: currentConfig.allowedCharset
        });

        // Replace pixel canvas data with imported image
        this.document!.pixelCanvas.data.set(imageData.data);

        // Push to undo so it's undoable
        this.pushUndoState();
        this.requestConversion();
        this.render();
      } catch (err) {
        console.error('Failed to import PNG:', err);
        alert('Failed to import image. Check console for details.');
      }
    });
  }

  private toggleMagnifier(): void {
    if (!this.magnifierPanel) {
      this.magnifierPanel = new MagnifierPanel();
    }

    this.magnifierPanel.toggle();

    // Update button state
    const loupeBtn = document.getElementById('loupe-toggle');
    if (loupeBtn) {
      loupeBtn.classList.toggle('active', this.magnifierPanel.isVisible());
    }

    // Initialize with Cell 0,0 when opening
    if (this.magnifierPanel.isVisible()) {
      this.updateMagnifier(0, 0);
    }

    // Save loupe state
    this.requestAutosave();
  }

  private updateMagnifier(col: number, row: number): void {
    if (!this.magnifierPanel || !this.magnifierPanel.isVisible() || !this.document) return;

    // Update maxOffset from current settings
    const settings = this.glyphProcessor?.getSettings();
    if (settings) {
      this.magnifierPanel.setMaxOffset(settings.maxOffset);
    }

    this.magnifierPanel.update(
      col,
      row,
      this.document,
      this.glyphProcessor?.getLibrary() ?? null
    );
  }

  private toggleSettingsPanel(): void {
    if (!this.settingsPanel) {
      this.settingsPanel = new SettingsPanel({
        getCurrentSettings: () => {
          return this.glyphProcessor?.getSettings() ?? { ...DEFAULT_CONVERSION_SETTINGS };
        },
        getCurrentCharset: () => {
          return this.glyphProcessor?.getCharset() ?? [...EXTENDED_CHARSET];
        },
        onSettingsChange: (settings: ConversionSettings) => {
          // Store original settings on first change for cancel
          if (!this.settingsBeforePreview) {
            this.settingsBeforePreview = this.glyphProcessor?.getSettings() ?? null;
          }
          // Apply settings immediately for live preview
          this.glyphProcessor?.updateSettings(settings);
          this.convertImmediate();
          // Update magnifier if pinned
          if (this.magnifierPanel?.isPinnedState()) {
            const pinned = this.magnifierPanel.getPinnedCell();
            if (pinned) {
              this.updateMagnifier(pinned.col, pinned.row);
            }
          }
        },
        onCharsetChange: (charset: string[]) => {
          // Store original charset on first change for cancel
          if (!this.charsetBeforePreview) {
            this.charsetBeforePreview = this.glyphProcessor?.getCharset() ?? null;
          }
          // Apply charset change (reloads from cached glyph data)
          this.glyphProcessor?.updateCharset(charset);
          // Also update the document config
          if (this.document) {
            (this.document.config as { allowedCharset: string[] }).allowedCharset = [...charset];
          }
          this.convertImmediate();
          // Update magnifier if pinned
          if (this.magnifierPanel?.isPinnedState()) {
            const pinned = this.magnifierPanel.getPinnedCell();
            if (pinned) {
              this.updateMagnifier(pinned.col, pinned.row);
            }
          }
        },
        onApply: (_settings: ConversionSettings, _charset: string[]) => {
          // Push undo state with new settings
          this.pushUndoState();
          this.settingsBeforePreview = null;
          this.charsetBeforePreview = null;
        },
        onCancel: () => {
          // Restore original settings
          if (this.settingsBeforePreview) {
            this.glyphProcessor?.updateSettings(this.settingsBeforePreview);
          }
          // Restore original charset
          if (this.charsetBeforePreview) {
            this.glyphProcessor?.updateCharset(this.charsetBeforePreview);
            if (this.document) {
              (this.document.config as { allowedCharset: string[] }).allowedCharset = [...this.charsetBeforePreview];
            }
          }
          if (this.settingsBeforePreview || this.charsetBeforePreview) {
            this.convertImmediate();
          }
          this.settingsBeforePreview = null;
          this.charsetBeforePreview = null;
        }
      });
    }
    this.settingsPanel.toggle();
  }

  private showExportMenu(button: HTMLElement): void {
    // Simple dropdown menu
    const existing = document.querySelector('.export-menu');
    if (existing) {
      existing.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'export-menu dropdown-menu';

    const textOption = document.createElement('button');
    textOption.textContent = 'Export as Text (.txt)';
    textOption.addEventListener('click', () => {
      if (this.document) {
        exportText(this.document);
      }
      menu.remove();
    });
    menu.appendChild(textOption);

    const jsonOption = document.createElement('button');
    jsonOption.textContent = 'Export as JSON (.json)';
    jsonOption.addEventListener('click', () => {
      if (this.document) {
        exportGlyphs(this.document);
      }
      menu.remove();
    });
    menu.appendChild(jsonOption);

    const pngOption = document.createElement('button');
    pngOption.textContent = 'Export Source PNG (.png)';
    pngOption.addEventListener('click', () => {
      if (this.document) {
        exportSourcePng(this.document);
      }
      menu.remove();
    });
    menu.appendChild(pngOption);

    // Separator
    const separator = document.createElement('div');
    separator.className = 'menu-separator';
    menu.appendChild(separator);

    const importPngOption = document.createElement('button');
    importPngOption.textContent = 'Import Source PNG...';
    importPngOption.addEventListener('click', () => {
      menu.remove();
      this.importSourcePng();
    });
    menu.appendChild(importPngOption);

    // Position below button
    const rect = button.getBoundingClientRect();
    menu.style.position = 'absolute';
    menu.style.top = `${rect.bottom + 4}px`;
    menu.style.left = `${rect.left}px`;

    document.body.appendChild(menu);

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (!menu.contains(e.target as Node) && e.target !== button) {
        menu.remove();
        document.removeEventListener('click', closeHandler);
      }
    };
    setTimeout(() => document.addEventListener('click', closeHandler), 0);
  }

  // Try to load autosaved document, returns true if loaded
  async tryLoadAutosave(): Promise<boolean> {
    try {
      const saved = await loadAutosave();
      if (!saved) return false;

      const { imageData, metadata, loupeState } = saved;

      // Create document with saved config
      await this.createDocument({
        cols: metadata.cols,
        rows: metadata.rows,
        fontFamily: metadata.fontFamily,
        fontSize: metadata.fontSize,
        polarity: metadata.polarity,
        allowedCharset: metadata.allowedCharset
      });

      // Restore pixel data
      if (this.document) {
        this.document.pixelCanvas.data.set(imageData.data);

        // Restore text layer
        for (const { col, row, char } of metadata.textLayer) {
          this.document.setTextCell(col, row, char);
        }

        // Restore conversion settings if present
        if (metadata.conversionSettings && this.glyphProcessor) {
          this.glyphProcessor.updateSettings(metadata.conversionSettings);
        }

        // Restore loupe state if present
        if (loupeState?.isOpen) {
          this.toggleMagnifier(); // Opens the magnifier
          if (loupeState.pinnedCell && this.magnifierPanel) {
            this.magnifierPanel.pin(loupeState.pinnedCell.col, loupeState.pinnedCell.row);
          }
        }

        // Push to undo and convert
        this.pushUndoState();
        this.requestConversion();
        this.render();
      }

      return true;
    } catch (e) {
      console.warn('Failed to load autosave:', e);
      return false;
    }
  }

  // Request autosave (debounced)
  private requestAutosave(): void {
    if (this.autosaveTimer !== null) {
      clearTimeout(this.autosaveTimer);
    }

    this.autosaveTimer = window.setTimeout(() => {
      this.autosaveTimer = null;
      if (this.document) {
        autosaveDocument(
          this.document,
          this.glyphProcessor?.getSettings(),
          this.getLoupeState()
        );
      }
    }, this.autosaveDelay);
  }

  // Get current loupe state for autosave
  private getLoupeState(): LoupeState | undefined {
    if (!this.magnifierPanel) return undefined;
    return {
      isOpen: this.magnifierPanel.isVisible(),
      pinnedCell: this.magnifierPanel.getPinnedCell()
    };
  }
}
