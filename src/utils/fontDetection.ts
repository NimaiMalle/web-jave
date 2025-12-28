// Comprehensive list of known monospace fonts to scan for
const ALL_MONOSPACE_FONTS = [
  // macOS system fonts
  'Menlo', 'Monaco', 'SF Mono', 'Andale Mono', 'Courier', 'Courier New', 'PT Mono',
  // Windows system fonts
  'Consolas', 'Lucida Console', 'Lucida Sans Typewriter',
  // Linux system fonts
  'DejaVu Sans Mono', 'Liberation Mono', 'Ubuntu Mono', 'Noto Mono', 'FreeMono',
  'Nimbus Mono L', 'Bitstream Vera Sans Mono',
  // Popular programming fonts
  'JetBrains Mono', 'JetBrains Mono NL', 'Fira Code', 'Fira Mono',
  'Source Code Pro', 'Hack', 'IBM Plex Mono', 'Cascadia Code', 'Cascadia Mono',
  'Inconsolata', 'Roboto Mono', 'Anonymous Pro', 'Droid Sans Mono',
  'Input Mono', 'Iosevka', 'Victor Mono', 'Fantasque Sans Mono',
  'Hasklig', 'Monoid', 'Space Mono', 'Overpass Mono', 'Oxygen Mono',
  'Share Tech Mono', 'Nova Mono', 'Cousine', 'Cutive Mono',
  'B612 Mono', 'Azeret Mono', 'Red Hat Mono', 'Martian Mono',
  'Commit Mono', 'Monaspace Neon', 'Monaspace Argon', 'Monaspace Xenon',
  'Monaspace Radon', 'Monaspace Krypton', 'Geist Mono', 'Berkeley Mono',
  'Comic Mono', 'Recursive Mono', 'Intel One Mono', 'Maple Mono',
  // Classic/vintage fonts
  'OCR A', 'OCR B', 'Terminus', 'Fixedsys', 'Fixedsys Excelsior',
  'IBM 3270', 'Glass TTY VT220', 'VT323',
  // Adobe fonts
  'Adobe Courier', 'Letter Gothic Std',
  // Other
  'Akkurat Mono', 'Apercu Mono', 'Atlas Typewriter', 'Cartograph',
  'Dank Mono', 'Gintronic', 'GT America Mono', 'Operator Mono',
  'Pitch', 'PragmataPro', 'Söhne Mono', "Suisse Int'l Mono",
];

// Shared canvas for font detection
let detectionCanvas: HTMLCanvasElement | null = null;
let detectionCtx: CanvasRenderingContext2D | null = null;

function getDetectionContext(): CanvasRenderingContext2D {
  if (!detectionCanvas) {
    detectionCanvas = document.createElement('canvas');
    detectionCtx = detectionCanvas.getContext('2d', { willReadFrequently: true });
  }
  return detectionCtx!;
}

// Detect if a font is available by comparing canvas measurements
function isFontAvailable(fontName: string): boolean {
  const ctx = getDetectionContext();
  const testString = 'mmmmmmmmmmlli';
  const baseFont = 'monospace';
  const testSize = '72px';

  ctx.font = `${testSize} ${baseFont}`;
  const baseWidth = ctx.measureText(testString).width;

  ctx.font = `${testSize} "${fontName}", ${baseFont}`;
  const testWidth = ctx.measureText(testString).width;

  return baseWidth !== testWidth;
}

// Measure font dimensions at a reference size and return width/height
function measureFontDimensions(fontName: string): { width: number; height: number } {
  const ctx = getDetectionContext();
  const fontSize = 100; // Use large size for accurate measurement

  ctx.font = `${fontSize}px "${fontName}"`;

  // Width: measure a single character
  const width = ctx.measureText('M').width;

  // Height: use font metrics
  const metrics = ctx.measureText('Mgy|');
  const height = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;

  return { width, height };
}

// Get aspect ratio as "1:X.X" where X.X is height/width rounded to 1 decimal
function getAspectRatioLabel(width: number, height: number): string {
  const ratio = height / width;
  const rounded = Math.round(ratio * 10) / 10;
  return `1:${rounded.toFixed(1)}`;
}

export interface DetectedFont {
  name: string;
  available: boolean;
}

// Detect all available monospace fonts
export function detectAvailableFonts(): string[] {
  const available: string[] = [];

  for (const fontName of ALL_MONOSPACE_FONTS) {
    if (isFontAvailable(fontName)) {
      available.push(fontName);
    }
  }

  // Sort alphabetically
  available.sort((a, b) => a.localeCompare(b));

  return available;
}

// Get font options for a dropdown, with system monospace as fallback
export function getFontOptions(): { value: string; label: string }[] {
  const detected = detectAvailableFonts();

  // Always include system monospace as first option
  const options: { value: string; label: string }[] = [
    { value: 'monospace', label: 'System Monospace' }
  ];

  // Add detected fonts with aspect ratio annotations
  for (const fontName of detected) {
    const dims = measureFontDimensions(fontName);
    const ratio = getAspectRatioLabel(dims.width, dims.height);
    options.push({ value: fontName, label: `${fontName} (${ratio})` });
  }

  return options;
}
