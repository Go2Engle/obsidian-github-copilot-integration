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

// ── Module-level callbacks for the active diff review ─────────────────────────

let activeDiffCallbacks: {
  onKeep: () => void;
  onUndo: () => void;
  keydownHandler: (e: KeyboardEvent) => void;
} | null = null;

// ── Diff Review Widget (new text + toolbar buttons) ───────────────────────────

class DiffReviewWidget extends WidgetType {
  constructor(private text: string) {
    super();
  }

  eq(other: DiffReviewWidget): boolean {
    return other.text === this.text;
  }

  toDOM(): HTMLElement {
    const wrapper = createDiv({ cls: 'copilot-diff-review' });

    // New text block
    const textEl = createDiv({ cls: 'copilot-diff-new-text' });
    textEl.textContent = this.text;

    // Toolbar row
    const toolbar = createDiv({ cls: 'copilot-diff-toolbar' });

    const keepBtn = createEl('button', {
      cls: 'copilot-diff-toolbar-btn copilot-diff-keep',
      text: 'Keep',
    });
    keepBtn.createSpan({ cls: 'copilot-diff-shortcut', text: 'Tab' });
    keepBtn.addEventListener('click', () => activeDiffCallbacks?.onKeep());

    const undoBtn = createEl('button', {
      cls: 'copilot-diff-toolbar-btn copilot-diff-undo',
      text: 'Undo',
    });
    undoBtn.createSpan({ cls: 'copilot-diff-shortcut', text: 'Esc' });
    undoBtn.addEventListener('click', () => activeDiffCallbacks?.onUndo());

    toolbar.appendChild(keepBtn);
    toolbar.appendChild(undoBtn);

    wrapper.appendChild(textEl);
    wrapper.appendChild(toolbar);
    return wrapper;
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
            widget: new DiffReviewWidget(newText),
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

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Shows an inline diff (old text with strikethrough + new text as green block)
 * with Keep/Undo buttons that scroll with the content.
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
    const editorDocument = editorView.dom.doc;
    const cleanup = (decision: 'keep' | 'undo') => {
      // Remove keyboard listener
      if (activeDiffCallbacks) {
        editorDocument.removeEventListener(
          'keydown',
          activeDiffCallbacks.keydownHandler,
          true,
        );
        activeDiffCallbacks = null;
      }
      // Clear decorations
      editorView.dispatch({ effects: clearDiffEffect.of(undefined) });
      resolve(decision);
    };

    // Capture-phase keydown to intercept before the global Escape handler
    const keydownHandler = (e: KeyboardEvent) => {
      if (e.key === 'Tab' || e.key === 'Enter') {
        e.preventDefault();
        e.stopPropagation();
        cleanup('keep');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup('undo');
      }
    };

    // Set module-level callbacks so the widget buttons can access them
    activeDiffCallbacks = {
      onKeep: () => cleanup('keep'),
      onUndo: () => cleanup('undo'),
      keydownHandler,
    };

    editorDocument.addEventListener('keydown', keydownHandler, true);

    // Show diff decorations (widget includes toolbar buttons)
    editorView.dispatch({
      effects: showDiffEffect.of({ from, to, newText }),
    });
  });
}
