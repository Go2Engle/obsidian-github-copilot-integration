import { StateEffect, StateField, RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  WidgetType,
} from '@codemirror/view';

// ── State Effects ─────────────────────────────────────────────────────────────

interface DiffState {
  from: number;
  to: number;
  newText: string;
}

const showDiffEffect = StateEffect.define<DiffState>();
const clearDiffEffect = StateEffect.define<void>();

// ── New Text Widget ───────────────────────────────────────────────────────────

class DiffNewTextWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  eq(other: DiffNewTextWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const el = document.createElement('div');
    el.className = 'copilot-diff-new-text';
    el.textContent = this.text;
    return el;
  }
}

// ── StateField for Diff Decorations ───────────────────────────────────────────

export const inlineDiffField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(value, tr) {
    value = value.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(showDiffEffect)) {
        const { from, to, newText } = effect.value;
        const builder = new RangeSetBuilder<Decoration>();
        if (from < to) {
          builder.add(
            from,
            to,
            Decoration.mark({ class: 'copilot-diff-old-text' }),
          );
        }
        builder.add(
          to,
          to,
          Decoration.widget({
            widget: new DiffNewTextWidget(newText),
            side: 1,
            block: true,
          }),
        );
        value = builder.finish();
      }
      if (effect.is(clearDiffEffect)) {
        value = Decoration.none;
      }
    }

    return value;
  },
  provide: (f) => EditorView.decorations.from(f),
});

// ── Diff Toolbar ──────────────────────────────────────────────────────────────

class DiffToolbar {
  private container: HTMLElement;
  private keydownHandler: (e: KeyboardEvent) => void;

  constructor(
    private editorView: EditorView,
    diffFrom: number,
    private onKeep: () => void,
    private onUndo: () => void,
  ) {
    this.container = document.createElement('div');
    this.container.className = 'copilot-diff-toolbar';

    // Keep button
    const keepBtn = document.createElement('button');
    keepBtn.className = 'copilot-diff-toolbar-btn copilot-diff-keep';
    keepBtn.innerHTML = 'Keep <span class="copilot-diff-shortcut">Tab</span>';
    keepBtn.addEventListener('click', () => this.handleKeep());

    // Undo button
    const undoBtn = document.createElement('button');
    undoBtn.className = 'copilot-diff-toolbar-btn copilot-diff-undo';
    undoBtn.innerHTML = 'Undo <span class="copilot-diff-shortcut">Esc</span>';
    undoBtn.addEventListener('click', () => this.handleUndo());

    this.container.appendChild(keepBtn);
    this.container.appendChild(undoBtn);

    // Position above the diff start
    const coords = editorView.coordsAtPos(diffFrom);
    if (coords) {
      const parentRect = editorView.dom.getBoundingClientRect();
      this.container.style.bottom = `${parentRect.bottom - coords.top + 4}px`;
      this.container.style.left = `${coords.left - parentRect.left}px`;
    }

    // Capture-phase keydown to intercept before the global Escape handler
    this.keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        this.handleKeep();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.handleUndo();
      }
    };
    document.addEventListener('keydown', this.keydownHandler, true);
  }

  show(): void {
    this.editorView.dom.appendChild(this.container);
  }

  dismiss(): void {
    document.removeEventListener('keydown', this.keydownHandler, true);
    this.container.remove();
  }

  private handleKeep(): void {
    this.dismiss();
    this.onKeep();
  }

  private handleUndo(): void {
    this.dismiss();
    this.onUndo();
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Shows an inline diff (old text with strikethrough + new text as green block)
 * and a floating toolbar with Keep/Undo buttons.
 *
 * Returns a promise that resolves to 'keep' or 'undo' based on user choice.
 * Only used for replace-mode inline edits.
 */
export function showInlineDiff(
  editorView: EditorView,
  from: number,
  to: number,
  newText: string,
): Promise<'keep' | 'undo'> {
  return new Promise((resolve) => {
    // Show diff decorations
    editorView.dispatch({
      effects: showDiffEffect.of({ from, to, newText }),
    });

    const cleanup = (decision: 'keep' | 'undo') => {
      editorView.dispatch({ effects: clearDiffEffect.of(undefined) });
      resolve(decision);
    };

    // Create and show toolbar
    const toolbar = new DiffToolbar(
      editorView,
      from,
      () => cleanup('keep'),
      () => cleanup('undo'),
    );
    toolbar.show();
  });
}
