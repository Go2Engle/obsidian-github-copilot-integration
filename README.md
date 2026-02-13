# GitHub Copilot Integration

![Build](https://github.com/Go2Engle/obsidian-github-copilot-integration/actions/workflows/main.yml/badge.svg)
![Latest Release](https://img.shields.io/github/v/release/Go2Engle/obsidian-github-copilot-integration)
![Obsidian Downloads](https://img.shields.io/badge/dynamic/json?logo=obsidian&color=%23483699&label=downloads&query=%24%5B%22github-copilot-integration%22%5D.downloads&url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json)
![License](https://img.shields.io/github/license/Go2Engle/obsidian-github-copilot-integration)

GitHub Copilot Integration is an Obsidian plugin that integrates GitHub Copilot with Obsidian, allowing you to generate notes, rewrite text, and more using AI directly from your vault.

<img src="demo.gif" width="600">

## Features

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
- GitHub Copilot CLI installed and accessible from your system PATH
  - Install: `npm install -g @github/copilot-cli` or via GitHub CLI
- Active GitHub Copilot subscription


## How to Use

1. **Install**: Place the plugin folder in your vault's `.obsidian/plugins` directory, or install from the Community Plugins browser (after approval).
2. **Enable**: Go to Settings → Community Plugins → Enable GitHub Copilot Integration.
3. **Action Palette**: Press Cmd+P (or Ctrl+P), type "Action Palette", and select an action.
4. **(Optional) Set a Hotkey**: For quick access, bind the Action Palette to a keyboard shortcut. Go to Settings → Hotkeys, search for "Action Palette", and assign a keybind (e.g., Cmd+M / Ctrl+M).
5. **Direct Commands**: Each action is also available as a standalone command in the command palette.
6. **With Selection**: Select text before running an action to rewrite/transform it. For summarization and action items, results are appended after your selection.
7. **Without Selection**: Run an action to generate new content at your cursor.


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
- **Session Management**: Creates isolated sessions for each action request
- **Streaming Support**: Real-time text generation using `assistant.message_delta` events
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

