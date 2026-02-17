import { EditorView } from '@codemirror/view';

export type InlineEditMode = 'replace' | 'append';

export class InlineEditPopup {
  private container: HTMLElement;
  private input: HTMLInputElement;
  private onSubmitCallback: (instruction: string, mode: InlineEditMode, model: string) => void;
  private onDismissCallback: () => void;
  private editorView: EditorView;
  private keydownHandler: (e: KeyboardEvent) => void;
  private mode: InlineEditMode = 'append';
  private modelSelect: HTMLSelectElement;

  constructor(
    editorView: EditorView,
    selectionFrom: number,
    selectionTo: number,
    availableModels: { id: string; name: string }[],
    defaultModel: string,
    onSubmit: (instruction: string, mode: InlineEditMode, model: string) => void,
    onDismiss: () => void,
  ) {
    this.editorView = editorView;
    this.onSubmitCallback = onSubmit;
    this.onDismissCallback = onDismiss;

    // Build DOM
    this.container = document.createElement('div');
    this.container.className = 'copilot-inline-edit-popup';

    // Top row: input + submit button
    const inputRow = document.createElement('div');
    inputRow.className = 'copilot-inline-edit-row';

    this.input = document.createElement('input');
    this.input.type = 'text';
    this.input.className = 'copilot-inline-edit-input';
    this.input.placeholder = 'Describe your edit...';

    const submitBtn = document.createElement('button');
    submitBtn.className = 'copilot-inline-edit-submit';
    submitBtn.textContent = 'Go';
    submitBtn.addEventListener('click', () => this.handleSubmit());

    inputRow.appendChild(this.input);
    inputRow.appendChild(submitBtn);

    // Middle row: mode selector
    const modeRow = document.createElement('div');
    modeRow.className = 'copilot-inline-edit-mode-row';

    const modes: { value: InlineEditMode; label: string }[] = [
      { value: 'append', label: 'Append' },
      { value: 'replace', label: 'Replace' },
    ];

    for (const m of modes) {
      const btn = document.createElement('button');
      btn.className = 'copilot-inline-edit-mode-btn';
      if (m.value === this.mode) btn.classList.add('is-active');
      btn.textContent = m.label;
      btn.addEventListener('click', () => {
        this.mode = m.value;
        modeRow.querySelectorAll('.copilot-inline-edit-mode-btn').forEach(
          (el) => el.classList.remove('is-active'),
        );
        btn.classList.add('is-active');
      });
      modeRow.appendChild(btn);
    }

    // Model selector (on the same row as mode buttons, pushed right)
    this.modelSelect = document.createElement('select');
    this.modelSelect.className = 'copilot-model-select';
    for (const model of availableModels) {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = model.name;
      this.modelSelect.appendChild(option);
    }
    // Ensure default model is selectable even if not in the fetched list
    if (defaultModel && !availableModels.some((m) => m.id === defaultModel)) {
      const option = document.createElement('option');
      option.value = defaultModel;
      option.textContent = defaultModel;
      this.modelSelect.appendChild(option);
    }
    this.modelSelect.value = defaultModel;

    modeRow.appendChild(this.modelSelect);

    this.container.appendChild(inputRow);
    this.container.appendChild(modeRow);

    // Keyboard handling
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        this.handleSubmit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.onDismissCallback();
      }
    };
    this.input.addEventListener('keydown', this.keydownHandler);

    // Position above the selection, centered horizontally
    const fromCoords = editorView.coordsAtPos(selectionFrom);
    const toCoords = editorView.coordsAtPos(selectionTo);
    if (fromCoords && toCoords) {
      const parentRect = editorView.dom.getBoundingClientRect();
      // Place above the top of the selection
      this.container.style.bottom = `${parentRect.bottom - fromCoords.top + 4}px`;
      // Center between selection start and end
      const selMidX = (fromCoords.left + toCoords.right) / 2;
      this.container.style.left = `${selMidX - parentRect.left}px`;
      this.container.style.transform = 'translateX(-50%)';
    }
  }

  show(): void {
    this.editorView.dom.appendChild(this.container);
    // Focus after a microtask so the DOM is ready
    requestAnimationFrame(() => this.input.focus());
  }

  dismiss(): void {
    this.input.removeEventListener('keydown', this.keydownHandler);
    this.container.remove();
  }

  private handleSubmit(): void {
    const instruction = this.input.value.trim();
    if (instruction) {
      this.onSubmitCallback(instruction, this.mode, this.modelSelect.value);
    }
  }
}
