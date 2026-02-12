# GitHub Copilot Integration

> **Disclaimer:** This entire plugin was vibe coded using GitHub Copilot. Use at your own risk!

GitHub Copilot Integration is an Obsidian plugin that integrates GitHub Copilot with Obsidian, allowing you to generate notes, rewrite text, and more using AI directly from your vault.

<img src="demo.gif" width="600">

## Features

- **Action Palette**: Quick access to all AI actions via fuzzy search (Cmd+P → "Action Palette")
- **Streaming Output**: See AI-generated text appear in real-time with a visual indicator
- **6 Built-in Actions**:
  - 🪄 General help — Professional editing for readability and flow
  - ✍️ Continue writing — Continues text in the same tone/style
  - 🍭 Summarize — Concise summary of key points
  - 📖 Fix spelling and grammar — Proofreads and corrects
  - ✅ Find action items — Extracts tasks/to-dos as clickable checkboxes
  - 🔄 Rewrite selection — Improves clarity, grammar, and style
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
4. **Direct Commands**: Each action is also available as a standalone command in the command palette.
5. **With Selection**: Select text before running an action to rewrite/transform it. For summarization and action items, results are appended after your selection.
6. **Without Selection**: Run an action to generate new content at your cursor.


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

## Streaming Preview

When an action is running, you'll see:
- Animated spinner at your cursor position
- Text appearing in a muted preview as it's generated
- Each new chunk fades in smoothly
- Final text inserted with a single undo step

## Releasing as a Community Plugin

To submit this plugin to the Obsidian Community Plugins directory:

1. Ensure you have the following files in your repository root:
   - `README.md` (this file)
   - `LICENSE` (choose an open source license, e.g. MIT)
   - `manifest.json` (see [Manifest reference](https://docs.obsidian.md/Reference/Manifest))
2. Push your code to a public GitHub repository.
3. Create a new release on GitHub. The release must include:
   - `main.js`
   - `manifest.json`
   - `styles.css` (optional)
   - The release tag must match the version in `manifest.json` (format: `x.y.z`)
4. Submit your plugin for review by editing [`community-plugins.json`](https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json) in the `obsidian-releases` repo. Add your plugin entry and create a pull request.
5. Wait for review and address any feedback from the Obsidian team.

For full details, see the [official submission guide](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin).

## License

MIT

