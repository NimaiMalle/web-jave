export interface DialogButton {
  label: string;
  primary?: boolean;
  action: () => void;
}

export function showDialog(
  title: string,
  content: HTMLElement,
  buttons: DialogButton[]
): { close: () => void } {
  const overlay = document.createElement('div');
  overlay.className = 'dialog-overlay';

  const dialog = document.createElement('div');
  dialog.className = 'dialog';

  const titleEl = document.createElement('h2');
  titleEl.textContent = title;
  dialog.appendChild(titleEl);

  dialog.appendChild(content);

  const buttonRow = document.createElement('div');
  buttonRow.className = 'button-row';

  for (const btn of buttons) {
    const button = document.createElement('button');
    button.textContent = btn.label;
    if (btn.primary) {
      button.classList.add('primary');
    }
    button.addEventListener('click', () => {
      btn.action();
    });
    buttonRow.appendChild(button);
  }

  dialog.appendChild(buttonRow);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);

  // Close on overlay click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      close();
    }
  });

  // Close on Escape
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      close();
    }
  };
  document.addEventListener('keydown', handleKeyDown);

  function close() {
    document.removeEventListener('keydown', handleKeyDown);
    overlay.remove();
  }

  return { close };
}

export function createFormField(
  label: string,
  input: HTMLElement
): HTMLElement {
  const container = document.createElement('div');
  container.className = 'form-field';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  container.appendChild(labelEl);
  container.appendChild(input);

  return container;
}

export function createNumberInput(
  value: number,
  min?: number,
  max?: number
): HTMLInputElement {
  const input = document.createElement('input');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.pattern = '[0-9]*';
  input.value = String(value);

  // Validate and clamp on blur
  input.addEventListener('blur', () => {
    let num = parseInt(input.value, 10);
    if (isNaN(num)) {
      num = value; // Reset to default
    } else {
      if (min !== undefined && num < min) num = min;
      if (max !== undefined && num > max) num = max;
    }
    input.value = String(num);
  });

  return input;
}

export function createSelect(
  options: { value: string; label: string }[],
  selectedValue: string
): HTMLSelectElement {
  const select = document.createElement('select');
  for (const opt of options) {
    const option = document.createElement('option');
    option.value = opt.value;
    option.textContent = opt.label;
    if (opt.value === selectedValue) {
      option.selected = true;
    }
    select.appendChild(option);
  }
  return select;
}
