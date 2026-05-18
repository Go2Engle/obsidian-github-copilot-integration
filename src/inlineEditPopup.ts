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
    this.container = createDiv({ cls: 'copilot-inline-edit-popup' });

    // Top row: input + submit button
    const inputRow = createDiv({ cls: 'copilot-inline-edit-row' });

    this.input = createEl('input', {
      cls: 'copilot-inline-edit-input',
      attr: { type: 'text', placeholder: 'Describe your edit...' },
    });
    this.input.type = 'text';

    const submitBtn = createEl('button', {
      cls: 'copilot-inline-edit-submit',
      text: 'Go',
    });
    submitBtn.addEventListener('click', () => this.handleSubmit());

    inputRow.appendChild(this.input);
    inputRow.appendChild(submitBtn);

    // Middle row: mode selector
    const modeRow = createDiv({ cls: 'copilot-inline-edit-mode-row' });

    const modes: { value: InlineEditMode; label: string }[] = [
      { value: 'append', label: 'Append' },
      { value: 'replace', label: 'Replace' },
    ];

    for (const m of modes) {
      const btn = createEl('button', {
        cls: 'copilot-inline-edit-mode-btn',
        text: m.label,
      });
      if (m.value === this.mode) btn.classList.add('is-active');
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
    this.modelSelect = createEl('select', { cls: 'copilot-model-select' });
    for (const model of availableModels) {
      const option = createEl('option');
      option.value = model.id;
      option.textContent = model.name;
      this.modelSelect.appendChild(option);
    }
    // Ensure default model is selectable even if not in the fetched list
    if (defaultModel && !availableModels.some((m) => m.id === defaultModel)) {
      const option = createEl('option');
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

    // Position above the selection, centered horizontally.
    // Coords from coordsAtPos are viewport-relative, matching position:fixed.
    const fromCoords = editorView.coordsAtPos(selectionFrom);
    const toCoords = editorView.coordsAtPos(selectionTo);
    if (fromCoords && toCoords) {
      const win = editorView.dom.ownerDocument.defaultView!;
      // Place above the top of the selection
      const bottom = `${win.innerHeight - fromCoords.top + 4}px`;
      // Center between selection start and end
      const left = `${(fromCoords.left + toCoords.right) / 2}px`;
      this.container.setCssProps({
        '--copilot-inline-edit-bottom': bottom,
        '--copilot-inline-edit-left': left,
      });
    }
  }

  show(): void {
    this.editorView.dom.ownerDocument.body.appendChild(this.container);
    // Focus after a microtask so the DOM is ready
    this.editorView.dom.ownerDocument.defaultView!.requestAnimationFrame(() => this.input.focus());
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
