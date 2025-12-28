// Local storage keys
const STORAGE_KEY = 'web-jave-settings';

export interface AppSettings {
  showGrid: boolean;
  pixelOpacity: number;  // 0, 0.5, or 1.0
  activeTool: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  showGrid: false,
  pixelOpacity: 0.5,  // Default to 50% opacity
  activeTool: 'Pencil'
};

export function loadSettings(): AppSettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch (e) {
    console.warn('Failed to load settings:', e);
  }
  return { ...DEFAULT_SETTINGS };
}

export function saveSettings(settings: Partial<AppSettings>): void {
  try {
    const current = loadSettings();
    const updated = { ...current, ...settings };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch (e) {
    console.warn('Failed to save settings:', e);
  }
}
