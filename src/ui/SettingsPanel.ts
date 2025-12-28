import type { ConversionSettings, CharsetPreset } from '../types.js';
import { DEFAULT_CONVERSION_SETTINGS, CHARSET_PRESETS, MINIMAL_CHARSET, normalizeCharset } from '../types.js';
import { DEFAULT_CHARSET, EXTENDED_CHARSET, BOX_DRAWING_CHARSET } from 'drascii';

export interface SettingsPanelCallbacks {
  onSettingsChange: (settings: ConversionSettings) => void;
  onCharsetChange: (charset: string[]) => void;
  onApply: (settings: ConversionSettings, charset: string[]) => void;
  onCancel: () => void;
  getCurrentSettings: () => ConversionSettings;
  getCurrentCharset: () => string[];
}

interface SliderConfig {
  key: keyof ConversionSettings;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

const SLIDER_CONFIGS: SliderConfig[] = [
  {
    key: 'inkThreshold',
    label: 'Ink Threshold',
    min: 0,
    max: 255,
    step: 1,
    description: 'Pixel brightness threshold for detecting ink (0-255)'
  },
  {
    key: 'maxOffset',
    label: 'Max Offset',
    min: 0,
    max: 5,
    step: 1,
    description: 'Pixel offset search range for alignment'
  },
  {
    key: 'missingInkWeight',
    label: 'Missing Ink Weight',
    min: 0,
    max: 10,
    step: 0.5,
    description: 'Penalty for glyph ink not in source'
  },
  {
    key: 'extraInkWeight',
    label: 'Extra Ink Weight',
    min: 0,
    max: 10,
    step: 0.5,
    description: 'Penalty for source ink not in glyph'
  },
  {
    key: 'offsetPenalty',
    label: 'Offset Penalty',
    min: 0,
    max: 10,
    step: 0.5,
    description: 'Penalty per pixel of offset'
  },
  {
    key: 'centroidWeight',
    label: 'Centroid Weight',
    min: 0,
    max: 10,
    step: 0.5,
    description: 'Weight for centroid alignment'
  },
  {
    key: 'flipPenalty',
    label: 'Flip Penalty',
    min: 0,
    max: 10,
    step: 0.5,
    description: 'Penalty for using flipped glyphs'
  }
];

export class SettingsPanel {
  private panel: HTMLElement;
  private callbacks: SettingsPanelCallbacks;
  private currentSettings: ConversionSettings;
  private originalSettings: ConversionSettings;
  private currentCharset: string[];
  private originalCharset: string[];
  private sliderInputs: Map<keyof ConversionSettings, HTMLInputElement> = new Map();
  private valueDisplays: Map<keyof ConversionSettings, HTMLSpanElement> = new Map();
  private testFlipsCheckbox: HTMLInputElement | null = null;
  private charsetPresetSelect: HTMLSelectElement | null = null;
  private charsetTextarea: HTMLTextAreaElement | null = null;
  private charsetCountSpan: HTMLSpanElement | null = null;
  private charsetDebounceTimer: number | null = null;
  private isOpen = false;

  constructor(callbacks: SettingsPanelCallbacks) {
    this.callbacks = callbacks;
    this.originalSettings = { ...callbacks.getCurrentSettings() };
    this.currentSettings = { ...this.originalSettings };
    this.originalCharset = [...callbacks.getCurrentCharset()];
    this.currentCharset = [...this.originalCharset];
    this.panel = this.createPanel();
    document.body.appendChild(this.panel);
  }

  private createPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.className = 'settings-panel';
    panel.innerHTML = `
      <div class="settings-header">
        <h3>Conversion Settings</h3>
        <button class="settings-close" title="Close">&times;</button>
      </div>
      <div class="settings-content"></div>
      <div class="settings-footer">
        <button class="settings-reset">Reset to Defaults</button>
        <div class="settings-actions">
          <button class="settings-cancel">Cancel</button>
          <button class="settings-apply primary">Apply</button>
        </div>
      </div>
    `;

    // Build content
    const content = panel.querySelector('.settings-content')!;

    // Add sliders
    for (const config of SLIDER_CONFIGS) {
      content.appendChild(this.createSlider(config));
    }

    // Add testFlips checkbox
    content.appendChild(this.createCheckbox());

    // Add charset section
    content.appendChild(this.createCharsetSection());

    // Wire up buttons
    panel.querySelector('.settings-close')!.addEventListener('click', () => this.close());
    panel.querySelector('.settings-cancel')!.addEventListener('click', () => this.cancel());
    panel.querySelector('.settings-apply')!.addEventListener('click', () => this.apply());
    panel.querySelector('.settings-reset')!.addEventListener('click', () => this.resetToDefaults());

    return panel;
  }

  private createSlider(config: SliderConfig): HTMLElement {
    const container = document.createElement('div');
    container.className = 'settings-slider';

    const labelRow = document.createElement('div');
    labelRow.className = 'slider-label-row';

    const label = document.createElement('label');
    label.textContent = config.label;
    label.title = config.description;

    const valueDisplay = document.createElement('span');
    valueDisplay.className = 'slider-value';
    valueDisplay.textContent = String(this.currentSettings[config.key]);
    this.valueDisplays.set(config.key, valueDisplay);

    labelRow.appendChild(label);
    labelRow.appendChild(valueDisplay);

    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = String(config.min);
    slider.max = String(config.max);
    slider.step = String(config.step);
    slider.value = String(this.currentSettings[config.key]);
    this.sliderInputs.set(config.key, slider);

    slider.addEventListener('input', () => {
      const value = parseFloat(slider.value);
      (this.currentSettings[config.key] as number) = value;
      valueDisplay.textContent = String(value);
      this.callbacks.onSettingsChange({ ...this.currentSettings });
    });

    container.appendChild(labelRow);
    container.appendChild(slider);

    return container;
  }

  private createCheckbox(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'settings-checkbox';

    const label = document.createElement('label');

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.currentSettings.testFlips;
    this.testFlipsCheckbox = checkbox;

    checkbox.addEventListener('change', () => {
      this.currentSettings.testFlips = checkbox.checked;
      this.callbacks.onSettingsChange({ ...this.currentSettings });
    });

    const text = document.createElement('span');
    text.textContent = 'Test Flipped Variants';
    text.title = 'Try horizontally and vertically flipped glyph variants';

    label.appendChild(checkbox);
    label.appendChild(text);
    container.appendChild(label);

    return container;
  }

  private createCharsetSection(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'settings-charset';

    // Section header
    const header = document.createElement('div');
    header.className = 'charset-header';
    header.innerHTML = '<h4>Character Set</h4>';
    container.appendChild(header);

    // Preset selector
    const presetRow = document.createElement('div');
    presetRow.className = 'charset-preset-row';

    const presetLabel = document.createElement('label');
    presetLabel.textContent = 'Preset:';

    const select = document.createElement('select');
    select.className = 'charset-preset-select';
    this.charsetPresetSelect = select;

    // Add preset options
    for (const [key, preset] of Object.entries(CHARSET_PRESETS)) {
      const option = document.createElement('option');
      option.value = key;
      option.textContent = preset.label;
      option.title = preset.description;
      select.appendChild(option);
    }
    // Add custom option
    const customOption = document.createElement('option');
    customOption.value = 'custom';
    customOption.textContent = 'Custom';
    select.appendChild(customOption);

    select.addEventListener('change', () => {
      this.applyCharsetPreset(select.value as CharsetPreset);
    });

    presetRow.appendChild(presetLabel);
    presetRow.appendChild(select);
    container.appendChild(presetRow);

    // Textarea for custom characters
    const textareaLabel = document.createElement('label');
    textareaLabel.className = 'charset-textarea-label';
    textareaLabel.textContent = 'Characters (paste or edit):';
    container.appendChild(textareaLabel);

    const textarea = document.createElement('textarea');
    textarea.className = 'charset-textarea';
    textarea.rows = 4;
    textarea.spellcheck = false;
    textarea.value = this.currentCharset.join('');
    this.charsetTextarea = textarea;

    textarea.addEventListener('input', () => {
      this.handleCharsetInput();
    });

    container.appendChild(textarea);

    // Character count
    const countRow = document.createElement('div');
    countRow.className = 'charset-count';
    const countSpan = document.createElement('span');
    countSpan.textContent = `${this.currentCharset.length} characters`;
    this.charsetCountSpan = countSpan;
    countRow.appendChild(countSpan);
    container.appendChild(countRow);

    // Detect current preset
    this.detectCurrentPreset();

    return container;
  }

  private applyCharsetPreset(preset: CharsetPreset): void {
    let chars: string[];
    switch (preset) {
      case 'basic':
        chars = [...DEFAULT_CHARSET];
        break;
      case 'extended':
        chars = [...EXTENDED_CHARSET];
        break;
      case 'box-drawing':
        chars = [...BOX_DRAWING_CHARSET];
        break;
      case 'minimal':
        chars = [...MINIMAL_CHARSET];
        break;
      case 'custom':
        // Keep current charset when switching to custom
        return;
      default:
        chars = [...EXTENDED_CHARSET];
    }

    this.currentCharset = normalizeCharset(chars);
    if (this.charsetTextarea) {
      this.charsetTextarea.value = this.currentCharset.join('');
    }
    this.updateCharsetCount();
    this.callbacks.onCharsetChange([...this.currentCharset]);
  }

  private handleCharsetInput(): void {
    if (!this.charsetTextarea) return;

    // Parse characters from textarea (each character is a separate entry)
    const text = this.charsetTextarea.value;
    const chars = [...text].filter(c => c.length === 1);
    this.currentCharset = normalizeCharset(chars);

    this.updateCharsetCount();

    // Switch to custom preset when user edits
    if (this.charsetPresetSelect) {
      this.charsetPresetSelect.value = 'custom';
    }

    // Debounce the charset change callback while typing
    if (this.charsetDebounceTimer !== null) {
      window.clearTimeout(this.charsetDebounceTimer);
    }
    this.charsetDebounceTimer = window.setTimeout(() => {
      this.charsetDebounceTimer = null;
      this.callbacks.onCharsetChange([...this.currentCharset]);
    }, 300);
  }

  private updateCharsetCount(): void {
    if (this.charsetCountSpan) {
      this.charsetCountSpan.textContent = `${this.currentCharset.length} characters`;
    }
  }

  private detectCurrentPreset(): void {
    if (!this.charsetPresetSelect) return;

    const current = new Set(this.currentCharset);
    const presets: [CharsetPreset, string[]][] = [
      ['basic', DEFAULT_CHARSET],
      ['extended', EXTENDED_CHARSET],
      ['box-drawing', BOX_DRAWING_CHARSET],
      ['minimal', MINIMAL_CHARSET]
    ];

    for (const [name, chars] of presets) {
      const presetSet = new Set(normalizeCharset([...chars]));
      if (current.size === presetSet.size && [...current].every(c => presetSet.has(c))) {
        this.charsetPresetSelect.value = name;
        return;
      }
    }

    this.charsetPresetSelect.value = 'custom';
  }

  open(): void {
    if (this.isOpen) return;

    // Refresh settings from document
    this.originalSettings = { ...this.callbacks.getCurrentSettings() };
    this.currentSettings = { ...this.originalSettings };
    this.originalCharset = [...this.callbacks.getCurrentCharset()];
    this.currentCharset = [...this.originalCharset];
    this.updateUI();

    this.panel.classList.add('open');
    this.isOpen = true;
  }

  close(): void {
    // Clear any pending debounce timer
    if (this.charsetDebounceTimer !== null) {
      window.clearTimeout(this.charsetDebounceTimer);
      this.charsetDebounceTimer = null;
    }
    this.panel.classList.remove('open');
    this.isOpen = false;
  }

  private cancel(): void {
    // Restore original settings and charset
    this.currentSettings = { ...this.originalSettings };
    this.currentCharset = [...this.originalCharset];
    this.callbacks.onCancel();
    this.close();
  }

  private apply(): void {
    this.originalSettings = { ...this.currentSettings };
    this.originalCharset = [...this.currentCharset];
    this.callbacks.onApply({ ...this.currentSettings }, [...this.currentCharset]);
    this.close();
  }

  private resetToDefaults(): void {
    this.currentSettings = { ...DEFAULT_CONVERSION_SETTINGS };
    this.currentCharset = normalizeCharset([...EXTENDED_CHARSET]);
    this.updateUI();
    this.callbacks.onSettingsChange({ ...this.currentSettings });
    this.callbacks.onCharsetChange([...this.currentCharset]);
  }

  private updateUI(): void {
    // Update all sliders
    for (const config of SLIDER_CONFIGS) {
      const slider = this.sliderInputs.get(config.key);
      const valueDisplay = this.valueDisplays.get(config.key);
      if (slider && valueDisplay) {
        slider.value = String(this.currentSettings[config.key]);
        valueDisplay.textContent = String(this.currentSettings[config.key]);
      }
    }

    // Update checkbox
    if (this.testFlipsCheckbox) {
      this.testFlipsCheckbox.checked = this.currentSettings.testFlips;
    }

    // Update charset UI
    if (this.charsetTextarea) {
      this.charsetTextarea.value = this.currentCharset.join('');
    }
    this.updateCharsetCount();
    this.detectCurrentPreset();
  }

  toggle(): void {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  isVisible(): boolean {
    return this.isOpen;
  }

  destroy(): void {
    this.panel.remove();
  }
}
