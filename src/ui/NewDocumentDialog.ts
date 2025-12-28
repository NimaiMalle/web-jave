import { showDialog, createFormField, createNumberInput, createSelect } from './Dialog.js';
import { getFontOptions } from '../utils/fontDetection.js';

const SIZE_PRESETS = [
  { value: 'custom', label: 'Custom' },
  { value: '80x24', label: '80 × 24 (Standard Terminal)' },
  { value: '80x40', label: '80 × 40 (Extended)' },
  { value: '120x40', label: '120 × 40 (Wide)' },
  { value: '40x20', label: '40 × 20 (Small)' },
];

export interface NewDocumentOptions {
  cols: number;
  rows: number;
  fontFamily: string;
  fontSize: number;
  polarity: 'light-on-dark' | 'dark-on-light';
}

export function showNewDocumentDialog(
  onConfirm: (options: NewDocumentOptions) => void,
  defaults?: Partial<NewDocumentOptions>
): void {
  const content = document.createElement('div');
  content.className = 'dialog-content';

  // Size preset
  const presetSelect = createSelect(SIZE_PRESETS, 'custom');
  content.appendChild(createFormField('Size Preset', presetSelect));

  // Columns
  const colsInput = createNumberInput(defaults?.cols ?? 40, 10, 200);
  content.appendChild(createFormField('Columns', colsInput));

  // Rows
  const rowsInput = createNumberInput(defaults?.rows ?? 20, 5, 100);
  content.appendChild(createFormField('Rows', rowsInput));

  // Link preset to inputs
  presetSelect.addEventListener('change', () => {
    const val = presetSelect.value;
    if (val !== 'custom') {
      const [cols, rows] = val.split('x').map(Number);
      colsInput.value = String(cols);
      rowsInput.value = String(rows);
    }
  });

  // Update preset when manual input changes
  const updatePreset = () => {
    const cols = colsInput.value;
    const rows = rowsInput.value;
    const match = SIZE_PRESETS.find(p => p.value === `${cols}x${rows}`);
    presetSelect.value = match ? match.value : 'custom';
  };
  colsInput.addEventListener('input', updatePreset);
  rowsInput.addEventListener('input', updatePreset);

  // Font family (detect available fonts)
  const fontOptions = getFontOptions();
  const fontSelect = createSelect(fontOptions, defaults?.fontFamily ?? 'monospace');
  content.appendChild(createFormField('Font', fontSelect));

  // Font size
  const fontSizeInput = createNumberInput(defaults?.fontSize ?? 16, 8, 32);
  content.appendChild(createFormField('Font Size', fontSizeInput));

  // Polarity
  const polaritySelect = createSelect([
    { value: 'light-on-dark', label: 'Light on Dark' },
    { value: 'dark-on-light', label: 'Dark on Light' },
  ], defaults?.polarity ?? 'light-on-dark');
  content.appendChild(createFormField('Polarity', polaritySelect));

  let closeDialog: () => void;

  const { close } = showDialog('New Document', content, [
    {
      label: 'Cancel',
      action: () => closeDialog()
    },
    {
      label: 'Create',
      primary: true,
      action: () => {
        onConfirm({
          cols: parseInt(colsInput.value, 10) || 40,
          rows: parseInt(rowsInput.value, 10) || 20,
          fontFamily: fontSelect.value,
          fontSize: parseInt(fontSizeInput.value, 10) || 16,
          polarity: polaritySelect.value as 'light-on-dark' | 'dark-on-light'
        });
        closeDialog();
      }
    }
  ]);

  closeDialog = close;

  // Focus first input
  colsInput.focus();
  colsInput.select();

  // Handle Enter key
  content.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm({
        cols: parseInt(colsInput.value, 10) || 40,
        rows: parseInt(rowsInput.value, 10) || 20,
        fontFamily: fontSelect.value,
        fontSize: parseInt(fontSizeInput.value, 10) || 16,
        polarity: polaritySelect.value as 'light-on-dark' | 'dark-on-light'
      });
      closeDialog();
    }
  });
}
