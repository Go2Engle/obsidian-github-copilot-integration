import { RangeSetBuilder } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  PluginValue,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

// ── Loader Widget (animated spinner) ───────────────────────────────────────────

class LoaderWidget extends WidgetType {
  toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.addClasses(["copilot-loading", "copilot-dots"]);
    return span;
  }
}

// ── Content Widget (streaming text preview) ────────────────────────────────────

class ContentWidget extends WidgetType {
  private dom: HTMLElement | null = null;

  constructor(private text: string) {
    super();
  }

  eq(other: ContentWidget) {
    return other.text === this.text;
  }

  updateText(newText: string) {
    if (this.dom && this.text !== newText) {
      const previousText = this.text;
      this.text = newText;

      // If new text extends previous text, only append the new chunk with animation
      if (newText.startsWith(previousText)) {
        const addedText = newText.slice(previousText.length);
        if (addedText) {
          // Keep existing text, append new chunk in animated span
          this.dom.textContent = newText.slice(0, -addedText.length);
          const span = document.createElement("span");
          span.addClass("copilot-stream-chunk");
          span.textContent = addedText;
          this.dom.appendChild(span);
        }
      } else {
        this.dom.textContent = newText;
      }
    }
  }

  toDOM(): HTMLElement {
    if (!this.dom) {
      this.dom = document.createElement("div");
      this.dom.addClass("copilot-content");
      this.dom.textContent = this.text;
    }
    return this.dom;
  }
}

// ── Spinner Plugin (CM6 ViewPlugin) ────────────────────────────────────────────

export class SpinnerPlugin implements PluginValue {
  decorations: DecorationSet;
  private entries: Map<
    string,
    { position: number; isEndOfLine: boolean; widget: WidgetType }
  >;
  private positionToId: Map<number, string>;
  private idCounter = 0;

  constructor(private editorView: EditorView) {
    this.entries = new Map();
    this.positionToId = new Map();
    this.decorations = Decoration.none;
  }

  show(position: number): () => void {
    const isEndOfLine = this.isPositionAtEndOfLine(position);
    const id = `spinner-${++this.idCounter}`;
    this.entries.set(id, {
      position,
      isEndOfLine,
      widget: new LoaderWidget(),
    });
    this.positionToId.set(position, id);
    this.updateDecorations();
    return () => this.hide(id);
  }

  hide(id: string) {
    const entry = this.entries.get(id);
    if (entry) {
      this.positionToId.delete(entry.position);
      this.entries.delete(id);
      this.updateDecorations();
    }
  }

  processText(
    text: string,
    processFunc?: (text: string) => string,
    position?: number,
  ) {
    if (text.trim()) {
      const displayText = processFunc ? processFunc(text) : text;
      this.updateContent(displayText, position);
    }
  }

  updateContent(text: string, originalPosition?: number) {
    let updated = false;
    const updateEntry = (data: { widget: WidgetType }) => {
      if (data.widget instanceof LoaderWidget) {
        data.widget = new ContentWidget(text);
        updated = true;
      } else if (data.widget instanceof ContentWidget) {
        data.widget.updateText(text);
        updated = true;
      }
    };

    if (originalPosition !== undefined) {
      const id = this.positionToId.get(originalPosition);
      const data = id ? this.entries.get(id) : undefined;
      if (data) updateEntry(data);
    } else {
      this.entries.forEach(updateEntry);
    }

    if (updated) {
      this.updateDecorations();
    }
  }

  update(update: ViewUpdate) {
    if (update.docChanged) {
      this.entries.forEach((data) => {
        data.position = update.changes.mapPos(data.position);
        data.isEndOfLine = this.isPositionAtEndOfLine(data.position);
      });
    }

    if (update.docChanged || update.viewportChanged) {
      this.updateDecorations();
    }
  }

  private updateDecorations() {
    const builder = new RangeSetBuilder<Decoration>();
    const sorted = [...this.entries.values()].sort(
      (a, b) => a.position - b.position,
    );
    for (const data of sorted) {
      builder.add(
        data.position,
        data.position,
        Decoration.widget({
          widget: data.widget,
          side: data.isEndOfLine ? 1 : -1,
        }),
      );
    }
    this.decorations = builder.finish();
    this.editorView.requestMeasure();
  }

  private isPositionAtEndOfLine(position: number): boolean {
    return position === this.editorView.state.doc.lineAt(position).to;
  }
}

export const spinnerPlugin = ViewPlugin.fromClass(SpinnerPlugin, {
  decorations: (v) => v.decorations,
});
