# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Obsidian plugin that integrates GitHub Copilot for AI-powered text generation. Desktop-only. Uses the `@github/copilot-sdk` to communicate with a locally-installed Copilot CLI, streaming responses into the editor via CodeMirror 6 decorations.

## Build Commands

```bash
npm install              # Install dependencies
npm run build            # Build + copy to local Obsidian vault (requires copy-to-obsidian.sh)
npm run build:release    # Production build only (used by CI)
npm run dev              # Watch mode with auto-copy to vault
```

Build uses esbuild (`build.js`): entry `src/main.ts` → `dist/main.js` (CommonJS, ES2018 target). External deps not bundled: `obsidian`, `electron`, `@codemirror/state`, `@codemirror/view`.

No test suite exists (`npm test` is a no-op stub).

## Platform Support

The plugin works on **Windows, macOS, and Linux**. Copilot CLI detection includes:
- **Windows**: winget (`%LOCALAPPDATA%\Microsoft\WinGet\Packages\GitHub.Copilot_*`), npm global, fallback to `where copilot`
- **macOS**: Homebrew (ARM/Intel), user local bin, fallback to `which copilot`
- **Linux**: Common install paths, fallback to `which copilot`

SDK communication mode is platform-specific:
- **Windows**: TCP mode (`useStdio: false`) to avoid process spawning issues
- **Unix/macOS**: stdio mode (`useStdio: true`) for better performance

## Architecture

### Source Files

- **`src/main.ts`** — Plugin entry point. Contains `CopilotPlugin` class (extends Obsidian `Plugin`), settings tab, action modal, and the core `executeAction()` streaming logic. Manages Copilot CLI detection, SDK client lifecycle, session creation, and text insertion. Also registers the inline edit command and right-click "Send to Copilot Chat" context menu.
- **`src/inlineEditPopup.ts`** — Floating inline edit popup UI. Positioned above the selection using `EditorView.coordsAtPos()`. Contains a text input, submit button, and append/replace mode toggle. Keyboard: Enter submits, Escape dismisses.
- **`src/chatView.ts`** — Sidebar chat panel (`ItemView`). Manages chat threads, message rendering (via `MarkdownRenderer`), streaming responses, and selection context chips. `setContextAndFocus()` accepts text from the right-click menu and shows a dismissible context chip above the input.
- **`src/chatSession.ts`** — Manages `CopilotSession` instances for chat threads. Uses a delegation pattern for `assistant.message_delta` handlers to avoid stacking on reused sessions.
- **`src/chatTypes.ts`** — Type definitions and constants for the chat system (`ChatMessage`, `ChatThread`, `CopilotChatSettings`).
- **`src/spinnerPlugin.ts`** — CM6 ViewPlugin that renders animated spinner and streaming text preview as editor decorations. `LoaderWidget` (braille spinner) and `ContentWidget` (streamed text) are Decoration widgets.
- **`src/requestPositionTracker.ts`** — CM6 StateField that tracks cursor/selection ranges through document changes. Uses StateEffects to register, query, and release tracked ranges so insertions land at the correct position even as the document mutates during streaming.
- **`src/export.js`** — CommonJS wrapper exporting the plugin class.

### Data Flow

1. User triggers action (command palette or direct command) → `executeAction()`
2. Copilot session created with system prompt + user selection/context
3. SDK streams `assistant.message_delta` events → text chunks accumulated
4. `spinnerPlugin.processText()` updates CM6 decorations for live preview
5. On completion (or Escape abort), final text inserted as single undo step
6. Session destroyed, decorations cleared

### Key Patterns

- **Streaming preview**: Text is shown via CM6 decorations (non-destructive) during streaming, then committed as an actual editor transaction on completion.
- **Position tracking**: `requestPositionTracker` maps selection ranges through concurrent document changes so the final insertion targets the correct location.
- **Abort handling**: AbortController + Escape keydown listener. All in-flight requests tracked in array for cleanup on plugin unload.
- **Action system**: Actions are `{name, icon, system, prompt, replaceSelection}` objects. Eight defaults provided; users can add custom actions in settings. Each action registers as both a palette item and a standalone Obsidian command.
- **Inline edit**: Floating popup (`InlineEditPopup`) triggered by command, positioned above the selection. User types instructions, chooses append/replace mode, and the result streams via `executeAction()`. Reuses the full streaming/decoration infrastructure.
- **Chat context injection**: Right-click "Send to Copilot Chat" stores selected text as `pendingSelectionContext`, shown as a dismissible chip. The context is injected into the prompt via `buildPromptWithContext()` when the user sends their message.
- **Session event delegation**: Chat sessions register a single `assistant.message_delta` handler that delegates to a replaceable `_currentDeltaHandler`, preventing handler stacking on reused sessions.

## Release Process

GitHub Actions workflow (`.github/workflows/main.yml`): push a git tag → builds with `npm run build:release` → creates draft release with `dist/main.js`, `manifest.json`, `styles.css`.

## Local Development Setup

Copy `copy-to-obsidian.sh.sample` to `copy-to-obsidian.sh` and edit the vault path. This script copies build artifacts into your Obsidian plugins folder. Then use `npm run dev` for watch mode.
