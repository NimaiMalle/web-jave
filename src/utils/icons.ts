// Icon loading utility
// SVG icons are loaded from /src/assets/icons/

const iconCache: Map<string, string> = new Map();

// Map tool names to icon file names
export const TOOL_ICONS: Record<string, string> = {
  'Pencil': 'pen',
  'Line': 'minus',
  'Rectangle': 'rectangle-arcade',
  'Oval': 'oval-arcade',
  'Eraser': 'eraser',
  'Text': 'letter-t',
  'Marquee': 'square-dashed'
};

// Map action names to icon file names
export const ACTION_ICONS: Record<string, string> = {
  'new': 'file',
  'save': 'floppy-disk',
  'load': 'folder',
  'export': 'open-rect-arrow-out',
  'undo': 'undo-arcade',
  'redo': 'redo-arcade',
  'clear': 'trash',
  'settings': 'slider'
};

// Tool hotkeys (single letter, no modifier)
export const TOOL_HOTKEYS: Record<string, string> = {
  'Pencil': 'P',
  'Line': 'L',
  'Rectangle': 'R',
  'Oval': 'O',
  'Eraser': 'E',
  'Text': 'T',
  'Marquee': 'M'
};

export async function loadIcon(name: string): Promise<string> {
  if (iconCache.has(name)) {
    return iconCache.get(name)!;
  }

  try {
    const response = await fetch(`/src/assets/icons/${name}.svg`);
    if (!response.ok) {
      console.warn(`Failed to load icon: ${name}`);
      return '';
    }
    const svg = await response.text();
    iconCache.set(name, svg);
    return svg;
  } catch (e) {
    console.warn(`Failed to load icon: ${name}`, e);
    return '';
  }
}

// Preload common icons
export async function preloadIcons(): Promise<void> {
  const allIcons = [
    ...Object.values(TOOL_ICONS),
    ...Object.values(ACTION_ICONS)
  ];
  await Promise.all(allIcons.map(loadIcon));
}

// Get icon by tool name
export async function getToolIcon(toolName: string): Promise<string> {
  const iconName = TOOL_ICONS[toolName];
  if (!iconName) return '';
  return loadIcon(iconName);
}

// Get icon by action name
export async function getActionIcon(actionName: string): Promise<string> {
  const iconName = ACTION_ICONS[actionName];
  if (!iconName) return '';
  return loadIcon(iconName);
}

// Create an icon element from SVG string
export function createIconElement(svg: string, size: number = 16): HTMLElement {
  const wrapper = document.createElement('span');
  wrapper.className = 'icon';
  wrapper.innerHTML = svg;

  // Style the SVG
  const svgEl = wrapper.querySelector('svg');
  if (svgEl) {
    svgEl.setAttribute('width', String(size));
    svgEl.setAttribute('height', String(size));
    svgEl.style.display = 'block';
  }

  return wrapper;
}
