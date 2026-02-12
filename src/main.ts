import { App, Editor, Plugin, PluginSettingTab, Setting, Notice, FuzzySuggestModal, EditorPosition } from 'obsidian';
import { CopilotClient, CopilotSession } from '@github/copilot-sdk';
import { exec } from 'child_process';
import { promisify } from 'util';
import { spinnerPlugin, SpinnerPlugin } from './spinnerPlugin';
import {
  requestPositionTracker,
  trackSelectionRange,
  getTrackedRange,
  releaseTrackedRange,
} from './requestPositionTracker';

const execAsync = promisify(exec);

// ── Utilities ──────────────────────────────────────────────────────────────────

async function getCopilotCliPath(): Promise<string | null> {
  const possiblePaths = [
    '/opt/homebrew/bin/copilot',  // macOS (Homebrew ARM)
    '/usr/local/bin/copilot',      // macOS (Homebrew Intel) / Linux
    process.env.HOME + '/.local/bin/copilot',  // Linux user install
  ];

  // Try known paths first
  for (const path of possiblePaths) {
    try {
      const { stdout } = await execAsync(`test -x "${path}" && echo "${path}"`);
      if (stdout.trim()) {
        return stdout.trim();
      }
    } catch (error) {
      // Path doesn't exist, continue
    }
  }

  // Fallback to 'which copilot'
  try {
    const { stdout } = await execAsync('which copilot');
    return stdout.trim() || null;
  } catch (error) {
    return null;
  }
}

// ── Interfaces ─────────────────────────────────────────────────────────────────

interface CopilotAction {
  name: string;
  icon: string;
  system: string;
  prompt: string;
  replaceSelection?: boolean; // If true, replaces selection; if false, appends after
}

interface CopilotPluginSettings {
  actions: CopilotAction[];
  defaultModel: string;
}

// ── Default actions ────────────────────────────────────────────────────────────

const DEFAULT_ACTIONS: CopilotAction[] = [
  {
    name: 'General help',
    icon: '🪄',
    system: 'You are an assistant helping a user write more content in a document based on a prompt. Output in Markdown.',
    prompt: 'Act as a professional editor with many years of experience as a writer. Carefully finalize the following text, and improve it for readability and flow.',
    replaceSelection: true,
  },
  {
    name: 'Continue writing',
    icon: '✍️',
    system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
    prompt: 'Continue writing the following text naturally, maintaining the same tone and style.',
    replaceSelection: false,
  },
  {
    name: 'Summarize',
    icon: '🍭',
    system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
    prompt: 'Make a concise summary of the key points of the following text.',
    replaceSelection: false,
  },
  {
    name: 'Fix spelling and grammar',
    icon: '📖',
    system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
    prompt: 'Proofread the below for spelling and grammar. Return only the corrected text.',
    replaceSelection: true,
  },
  {
    name: 'Find action items',
    icon: '✅',
    system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
    prompt: 'Act as an assistant helping find action items inside a document. An action item is an extracted task or to-do found in the text. Format each item as a Markdown checkbox: - [ ] item text',
    replaceSelection: false,
  },
  {
    name: 'Rewrite selection',
    icon: '🔄',
    system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
    prompt: 'Rewrite the following text to improve clarity, grammar, and style. Return only the rewritten text.',
    replaceSelection: true,
  },
];

const DEFAULT_SETTINGS: CopilotPluginSettings = {
  actions: DEFAULT_ACTIONS,
  defaultModel: 'gpt-4o',
};

// ── Action Palette Modal ───────────────────────────────────────────────────────

class CopilotActionModal extends FuzzySuggestModal<CopilotAction> {
  private actions: CopilotAction[];
  private onChooseAction: (action: CopilotAction) => void;

  constructor(app: App, actions: CopilotAction[], onChoose: (action: CopilotAction) => void) {
    super(app);
    this.actions = actions;
    this.onChooseAction = onChoose;
    this.setPlaceholder('Choose a Copilot action...');
  }

  getItems(): CopilotAction[] {
    return this.actions;
  }

  getItemText(action: CopilotAction): string {
    return action.icon + ' ' + action.name;
  }

  onChooseItem(action: CopilotAction): void {
    this.onChooseAction(action);
  }
}

// ── Main Plugin ────────────────────────────────────────────────────────────────

export default class CopilotPlugin extends Plugin {
  settings!: CopilotPluginSettings;
  copilotClient: CopilotClient | null = null;
  private abortControllers: AbortController[] = [];
  private escapeHandler: (event: KeyboardEvent) => void;

  constructor(app: App, manifest: any) {
    super(app, manifest);
    this.escapeHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        this.abortControllers.forEach((ac) => ac.abort());
        this.abortControllers = [];
      }
    };
  }

  async onload() {
    await this.loadSettings();
    this.addSettingTab(new CopilotSettingTab(this.app, this));

    // Register CM6 editor extensions for decoration-based streaming
    this.registerEditorExtension(spinnerPlugin);
    this.registerEditorExtension(requestPositionTracker);

    // Listen for Escape to abort streaming
    this.registerDomEvent(document, 'keydown', this.escapeHandler);

    // Initialize Copilot SDK client
    try {
      const cliPath = await getCopilotCliPath();
      if (!cliPath) {
        throw new Error('GitHub Copilot CLI not found. Please install it first.');
      }

      this.copilotClient = new CopilotClient({
        cliPath,
        useStdio: true,
        autoStart: true,
        autoRestart: true,
      });
      await this.copilotClient.start();
    } catch (error) {
      console.error('Failed to initialize Copilot SDK client:', error);
      new Notice('Failed to initialize GitHub Copilot. Make sure the Copilot CLI is installed.');
    }

    // Action Palette
    this.addCommand({
      id: 'copilot-action-palette',
      name: 'Action palette',
      editorCallback: (editor: Editor) => {
        new CopilotActionModal(this.app, this.settings.actions, (action) => {
          this.executeAction(editor, action);
        }).open();
      },
    });

    // Register individual action commands
    this.registerActionCommands();
  }

  async onunload() {
    // Abort any in-flight requests
    this.abortControllers.forEach((ac) => ac.abort());
    this.abortControllers = [];

    // Clean up Copilot SDK client
    if (this.copilotClient) {
      try {
        await this.copilotClient.stop();
      } catch (error) {
        console.error('Error stopping Copilot SDK client:', error);
      }
    }
  }

  private registerActionCommands() {
    for (const action of this.settings.actions) {
      const id = 'copilot-' + action.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      this.addCommand({
        id,
        name: action.icon + ' ' + action.name,
        editorCallback: (editor: Editor) => this.executeAction(editor, action),
      });
    }
  }

  async executeAction(editor: Editor, action: CopilotAction) {
    if (!this.copilotClient) {
      new Notice('Copilot SDK client not initialized. Please reload the plugin.');
      return;
    }

    const selection = editor.getSelection();

    // Access the CM6 EditorView
    // @ts-expect-error - editor.cm is not typed in Obsidian's API
    const editorView = editor.cm;

    // Track cursor positions
    const cursorPositionFrom = editor.getCursor('from');
    const cursorPositionTo = editor.getCursor('to');
    const cursorOffsetFrom = editor.posToOffset(cursorPositionFrom);
    const cursorOffsetTo = editor.posToOffset(cursorPositionTo);

    // Set up abort controller
    const abortController = new AbortController();
    this.abortControllers.push(abortController);

    // Track the selection range through document changes
    let selectionTrackerId = trackSelectionRange(
      editorView,
      cursorOffsetFrom,
      cursorOffsetTo,
    );
    const releaseTracker = () => {
      if (selectionTrackerId) {
        releaseTrackedRange(editorView, selectionTrackerId);
        selectionTrackerId = null;
      }
    };
    abortController.signal.addEventListener('abort', releaseTracker);

    // Show spinner decoration at cursor position
    const spinner = editorView.plugin(spinnerPlugin) as SpinnerPlugin | undefined;
    const hideSpinner = spinner?.show(cursorOffsetTo);
    this.app.workspace.updateOptions();

    abortController.signal.addEventListener('abort', () => {
      hideSpinner?.();
      this.app.workspace.updateOptions();
    });

    // Set up the onUpdate callback for streaming text into the decoration
    const onUpdate = (updatedString: string) => {
      if (!spinner) return;
      spinner.processText(
        updatedString,
        (text: string) => this.processText(text, selection || ''),
        cursorOffsetTo,
      );
      this.app.workspace.updateOptions();
    };

    let session: CopilotSession | null = null;
    let accumulatedText = '';

    try {
      // Create a new session with streaming enabled
      session = await this.copilotClient.createSession({
        model: this.settings.defaultModel,
        streaming: true,
        systemMessage: {
          content: action.system,
        },
      });

      // Set up event handlers for streaming into decoration (not document)
      session.on('assistant.message_delta', (event) => {
        if (abortController.signal.aborted) return;
        const deltaContent = event.data.deltaContent || '';
        accumulatedText += deltaContent;
        onUpdate(accumulatedText);
      });

      session.on('assistant.message', () => {
        // Final message received - handled by finally block
      });

      // Send the prompt and wait
      await session.sendAndWait({ prompt: action.prompt + (selection ? '\n\n' + selection : '') });

    } catch (error: any) {
      if (!abortController.signal.aborted) {
        console.error('Copilot SDK error:', error);
        new Notice('Copilot error: ' + (error.message || 'Unknown error'));
      }
    } finally {
      // Remove spinner decoration
      hideSpinner?.();
      this.app.workspace.updateOptions();

      // Clean up session
      if (session) {
        try {
          await session.destroy();
        } catch (error) {
          console.error('Error destroying session:', error);
        }
      }

      // Remove this abort controller from the list
      this.abortControllers = this.abortControllers.filter((ac) => ac !== abortController);

      // If aborted, skip text insertion
      if (abortController.signal.aborted) {
        releaseTracker();
        return;
      }

      // Insert the final accumulated text into the document (single undo step)
      const finalText = accumulatedText.trim();
      if (finalText) {
        const trackedRange = selectionTrackerId
          ? getTrackedRange(editorView, selectionTrackerId)
          : null;
        const mappedRange = trackedRange || {
          from: cursorOffsetFrom,
          to: cursorOffsetTo,
          insertAfter: cursorOffsetTo,
        };

        if (action.replaceSelection && selection) {
          // Replace the selection with the result
          const fromPos = editor.offsetToPos(mappedRange.from);
          const toPos = editor.offsetToPos(mappedRange.to);
          editor.replaceRange(finalText, fromPos, toPos);
        } else {
          // Insert after selection
          const insertOffset = mappedRange.insertAfter;
          const insertPos = editor.offsetToPos(insertOffset);
          const isLastLine = editor.lastLine() === insertPos.line;
          const text = this.processText(finalText, selection || '');
          editor.replaceRange(isLastLine ? '\n' + text : text, {
            ch: 0,
            line: insertPos.line + 1,
          });
        }

        new Notice(action.icon + ' ' + action.name + ' - done!');
      }

      releaseTracker();
    }
  }

  private processText(text: string, selectedText: string): string {
    if (!text.trim()) return '';
    const cleanText = text.trim();
    return ['\n', cleanText.replace(selectedText, '').trim(), '\n'].join('');
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

// ── Settings Tab ───────────────────────────────────────────────────────────────

class CopilotSettingTab extends PluginSettingTab {
  plugin: CopilotPlugin;

  constructor(app: App, plugin: CopilotPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // Default model setting
    new Setting(containerEl)
      .setName('Default model')
      .setDesc('The model to use for Copilot requests (e.g., gpt-4o, claude-sonnet-4.5)')
      .addText((text) =>
        text
          .setValue(this.plugin.settings.defaultModel)
          .setPlaceholder('gpt-4o')
          .onChange(async (value) => {
            this.plugin.settings.defaultModel = value || 'gpt-4o';
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName('Actions')
      .setDesc('Configure the actions available in the Copilot action palette. Each action has a system prompt and a user prompt.')
      .setHeading();

    this.plugin.settings.actions.forEach((action, index) => {
      const wrapper = containerEl.createDiv({ cls: 'copilot-action-block' });

      const header = wrapper.createDiv({ cls: 'copilot-action-header' });

      header.createEl('h3', { text: action.icon + ' ' + action.name });

      const deleteBtn = header.createEl('button', { text: 'Delete', cls: 'copilot-action-delete' });
      deleteBtn.addEventListener('click', async () => {
        this.plugin.settings.actions.splice(index, 1);
        await this.plugin.saveSettings();
        this.display();
      });

      new Setting(wrapper)
        .setName('Name')
        .addText((text) =>
          text.setValue(action.name).onChange(async (value) => {
            this.plugin.settings.actions[index].name = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wrapper)
        .setName('Icon')
        .setDesc('Emoji or short label')
        .addText((text) =>
          text.setValue(action.icon).onChange(async (value) => {
            this.plugin.settings.actions[index].icon = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wrapper)
        .setName('Replace selection')
        .setDesc('If enabled, replaces selected text. If disabled, adds result after selection.')
        .addToggle((toggle) =>
          toggle.setValue(action.replaceSelection ?? false).onChange(async (value) => {
            this.plugin.settings.actions[index].replaceSelection = value;
            await this.plugin.saveSettings();
          })
        );

      new Setting(wrapper)
        .setName('System prompt')
        .addTextArea((ta) => {
          ta.setValue(action.system).onChange(async (value) => {
            this.plugin.settings.actions[index].system = value;
            await this.plugin.saveSettings();
          });
          ta.inputEl.rows = 3;
          ta.inputEl.style.width = '100%';
        });

      new Setting(wrapper)
        .setName('Prompt')
        .addTextArea((ta) => {
          ta.setValue(action.prompt).onChange(async (value) => {
            this.plugin.settings.actions[index].prompt = value;
            await this.plugin.saveSettings();
          });
          ta.inputEl.rows = 3;
          ta.inputEl.style.width = '100%';
        });
    });

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText('+ Add Action')
        .setCta()
        .onClick(async () => {
          this.plugin.settings.actions.push({
            name: 'New Action',
            icon: '🧠',
            system: 'You are an AI assistant that follows instruction extremely well. Help as much as you can.',
            prompt: '',
            replaceSelection: false,
          });
          await this.plugin.saveSettings();
          this.display();
        })
    );
  }
}
