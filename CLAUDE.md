# Web ASCII Art Editor (web-jave)

A web application for drawing ASCII art using a pixel canvas that converts to ASCII characters in real-time using the `drascii` npm package.

## Architecture

### Three-Layer Model

```
┌─────────────────────────────────────────┐
│           Display Canvas                │  ← What user sees (composite render)
├─────────────────────────────────────────┤
│  Text Layer (priority)                  │  ← User-typed characters (sparse)
│  Glyph Layer (derived)                  │  ← ASCII from pixel conversion
│  Pixel Canvas (source)                  │  ← 8-bit grayscale drawing surface
└─────────────────────────────────────────┘
```

1. **Pixel Canvas** - 8-bit grayscale `ImageData`, drawing tools operate here
2. **Glyph Layer** - Derived from Pixel Canvas via drascii, stores `{char, flipX, flipY}` per cell
3. **Text Layer** - Sparse map of user-typed characters, takes priority over Glyph Layer

## Project Structure

```
web-jave/
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── src/
│   ├── main.ts                 # Entry point
│   ├── App.ts                  # Main application class
│   ├── types.ts                # Shared TypeScript interfaces
│   │
│   ├── core/
│   │   ├── Document.ts         # Document model and state
│   │   ├── UndoBuffer.ts       # Undo/redo stack management
│   │   ├── GlyphProcessor.ts   # drascii integration, debounced conversion
│   │   └── Renderer.ts         # Canvas rendering (all layers → display)
│   │
│   ├── tools/
│   │   ├── Tool.ts             # Base tool interface
│   │   ├── PencilTool.ts       # Freehand drawing
│   │   ├── LineTool.ts         # Click-drag lines
│   │   ├── RectangleTool.ts    # Rectangle outlines
│   │   ├── OvalTool.ts         # Oval/ellipse outlines
│   │   ├── EraserTool.ts       # 3x3 or cell-erase modes
│   │   ├── TextTool.ts         # Character input, cursor management
│   │   └── MarqueeTool.ts      # Rectangular selection
│   │
│   ├── ui/
│   │   ├── Dialog.ts           # Modal dialog utilities
│   │   ├── NewDocumentDialog.ts # Document creation form
│   │   ├── SettingsPanel.ts    # Conversion settings panel
│   │   └── MagnifierPanel.ts   # Pixel inspection loupe
│   │
│   └── utils/
│       ├── geometry.ts         # Line, rect, oval algorithms
│       ├── storage.ts          # Save/Load PNG + metadata, autosave
│       ├── settings.ts         # User settings persistence
│       ├── fonts.ts            # Google Fonts loading
│       ├── fontDetection.ts    # System font detection
│       └── icons.ts            # Icon loading utilities
│
└── styles/
    └── main.css
```

## Key Features

- **Drawing Tools**: Pencil, Line, Rectangle, Oval with real-time ASCII preview
- **Eraser**: 3×3 pixel erase (default) or Alt+click for full cell erase
- **Text Tool**: Direct character input with cursor, Enter for next row
- **Marquee Selection**: Select regions, Cmd/Ctrl+C to copy as text
- **Undo/Redo**: Full history with Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z
- **Magnifier Panel**: Pixel-level inspection with pin support
- **Settings Panel**: Adjust max offset, allowed charset, live preview
- **File Operations**: Save/Load as PNG with metadata sidecar, Export as JSON
- **Autosave**: Automatic saving to localStorage

## Keyboard Shortcuts

### Tools
- `P` - Pencil
- `L` - Line
- `R` - Rectangle
- `O` - Oval
- `E` - Eraser
- `T` - Text
- `M` - Marquee

### Actions
- `Cmd/Ctrl+Z` - Undo
- `Cmd/Ctrl+Shift+Z` or `Cmd/Ctrl+Y` - Redo
- `Cmd/Ctrl+N` - New Document
- `Cmd/Ctrl+S` - Save
- `Cmd/Ctrl+O` - Open
- `Cmd/Ctrl+A` - Select All
- `Cmd/Ctrl+C` - Copy selection as text
- `Cmd/Ctrl+0` - Center canvas (or browser zoom reset if already centered)
- `Home` or `0` - Center canvas
- `Escape` - Clear selection / Exit text input mode

### Drawing Modifiers
- `Alt+click` - Snap to cell center
- `Shift` (with Line tool) - Constrain to 45° angles

## Development

```bash
npm install
npm run dev     # Start dev server on port 3000
npm run build   # Build for production
```

## Dependencies

- `drascii` - ASCII art conversion library (local package at `../drascii`)
- `vite` - Build tool and dev server
- `typescript` - Type checking
