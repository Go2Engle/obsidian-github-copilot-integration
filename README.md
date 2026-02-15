# GitHub Copilot Integration

![Build](https://github.com/Go2Engle/obsidian-github-copilot-integration/actions/workflows/main.yml/badge.svg)
![Latest Release](https://img.shields.io/github/v/release/Go2Engle/obsidian-github-copilot-integration)
![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22github-copilot-integration%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)
![License](https://img.shields.io/github/license/Go2Engle/obsidian-github-copilot-integration)

GitHub Copilot Integration is an Obsidian plugin that integrates GitHub Copilot with Obsidian, allowing you to chat with your documents, generate notes, rewrite text, and more using AI directly from your vault.

<img src="demo.gif" width="600">

## Features

- **💬 Chat Interface**: Interactive sidebar chat with your documents
  - Real-time streaming responses
  - Automatic document context inclusion
  - Persistent conversation history
  - Copy or insert AI responses directly into your documents
  - Native Obsidian theming support
- **✏️ Inline Edit**: Select text and trigger the inline edit command to get a floating input popup — type instructions and have Copilot append or replace content directly in your document
- **📋 Send to Chat**: Right-click selected text to send it as context to the Copilot Chat sidebar, then ask follow-up questions about it
- **Action Palette**: Quick access to all AI actions via fuzzy search (Cmd+P → "Action Palette")
- **Streaming Output**: See AI-generated text appear in real-time with a visual indicator
- **8 Built-in Actions**:
  - 🪄 General help — Professional editing for readability and flow
  - ✍️ Continue writing — Continues text in the same tone/style
  - 🍭 Summarize — Concise summary of key points
  - 📖 Fix spelling and grammar — Proofreads and corrects
  - ✅ Find action items — Extracts tasks/to-dos as clickable checkboxes
  - 🔄 Rewrite selection — Improves clarity, grammar, and style
  - 💻 Generate code — Generates code in a fenced code block from a description
  - 🧠 Plan — Generates a detailed project spec from provided context
- **Fully Customizable**: Edit or create new actions with custom prompts in Settings
- **Cross-Platform**: Works on macOS, Windows, and Linux

## Requirements

- Obsidian Desktop (v1.0.0+)
- **Latest version** of GitHub Copilot CLI installed and accessible from your system PATH
  - Install: `npm install -g @github/copilot` (npm) or `winget install GitHub.Copilot` (Windows)
  - Update: `copilot update` or `npm update -g @github/copilot`
  - Verify: `copilot --version` (should be v0.0.409 or newer)
- Active GitHub Copilot subscription
- GitHub Copilot CLI authenticated: `copilot login`


## How to Use

### Getting Started

1. **Install**: Place the plugin folder in your vault's `.obsidian/plugins` directory, or install from the Community Plugins browser (after approval).
2. **Enable**: Go to Settings → Community Plugins → Enable GitHub Copilot Integration.

### Using the Chat Interface

1. **Open Chat**: Click the message icon (💬) in the left ribbon, or use the command palette (Cmd+P / Ctrl+P) and search for "Open chat".
2. **Ask Questions**: Type your question or request in the input field and press Enter (Shift+Enter for newline).
3. **Automatic Context**: The chat automatically includes the content of your active document as context.
4. **Insert Responses**: Hover over any AI response and click "Insert into document" to add it to your active note.
5. **New Conversation**: Click the "+" button in the chat toolbar to start a fresh conversation.
6. **Abort Streaming**: Press Escape to stop an in-progress response.

### Using Inline Edit

1. **Select Text**: Highlight the text you want to edit (or place your cursor where you want new content).
2. **Trigger**: Open the command palette and search for "Inline edit", or bind it to a hotkey for quick access.
3. **Describe Your Edit**: A floating input box appears above your selection — type what you want (e.g., "convert to bullet list", "add error handling", "translate to Spanish").
4. **Choose Mode**: Toggle between **Append** (adds content after selection) and **Replace** (replaces selection) using the buttons below the input.
5. **Submit**: Press Enter or click "Go". The AI response streams directly into your document.

### Send Selection to Chat

1. **Select Text**: Highlight text in your document.
2. **Right-Click**: A context menu appears with "Send to Copilot Chat".
3. **Ask Questions**: The chat sidebar opens with your selection attached as context (shown as a chip above the input). Type your question and send.

### Using Quick Actions

1. **Action Palette**: Press Cmd+P (or Ctrl+P), type "Action Palette", and select an action.
2. **(Optional) Set a Hotkey**: For quick access, bind the Action Palette to a keyboard shortcut. Go to Settings → Hotkeys, search for "Action Palette", and assign a keybind (e.g., Cmd+M / Ctrl+M).
3. **Direct Commands**: Each action is also available as a standalone command in the command palette.
4. **With Selection**: Select text before running an action to rewrite/transform it. For summarization and action items, results are appended after your selection.
5. **Without Selection**: Run an action to generate new content at your cursor.


## Installation (Developers)

1. Clone this repository.
2. Run `mv copy-to-obsidian.sh.sample copy-to-obsidian.sh` and update the `OBSIDIAN_PLUGIN_DIR=` variable to point to your `github-copilot-integration` directory inside the plugins folder within your Obsidian vault.
3. Run `npm install` to install dependencies.
4. Run `npm run build` to build the plugin and copy files to your Obsidian plugins folder automatically.
5. (Optional) Run `npm run dev` to watch for changes and auto-copy files on every modification.
6. You can also run `bash ./copy-to-obsidian.sh` to copy files manually.



## Technical Details

This plugin uses the official [@github/copilot-sdk](https://github.com/github/copilot-sdk) for TypeScript/Node.js. Key features:

- **CopilotClient**: Manages the connection to GitHub Copilot CLI
- **Session Management**:
  - Persistent sessions for chat conversations (one session per thread)
  - Isolated sessions for quick actions
- **Streaming Support**: Real-time text generation using `assistant.message_delta` events
- **Chat Architecture**:
  - Native Obsidian `ItemView` integration for sidebar panel
  - Persistent conversation history stored in plugin data
  - Automatic document context injection
  - CodeMirror 6 decorations for inline streaming (actions)
  - MarkdownRenderer for formatted chat messages
- **Model Configuration**: Configurable model selection (gpt-4o, claude-sonnet-4.5, etc.)
- **Error Handling**: Proper cleanup and error recovery for interrupted requests

The SDK automatically handles:
- CLI process lifecycle (start, restart, stop)
- Authentication with GitHub Copilot
- Message formatting and protocol communication
- Streaming chunk buffering and delivery

## License

MIT

---

> **Disclaimer:** This entire plugin was vibe coded using GitHub Copilot. Use at your own risk!

