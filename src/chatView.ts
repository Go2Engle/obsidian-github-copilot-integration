import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice, MarkdownView } from 'obsidian';
import type CopilotPlugin from './main';
import { ChatSessionManager } from './chatSession';
import {
  VIEW_TYPE_COPILOT_CHAT,
  ChatMessage,
  ChatThread,
  CopilotChatSettings,
  DEFAULT_CHAT_SETTINGS,
} from './chatTypes';

// ── Copilot Chat View ──────────────────────────────────────────────────────────

export class CopilotChatView extends ItemView {
  plugin: CopilotPlugin;
  sessionManager: ChatSessionManager;
  settings: CopilotChatSettings;

  private messagesContainer: HTMLElement | null = null;
  private inputElement: HTMLTextAreaElement | null = null;
  private sendButton: HTMLElement | null = null;
  private messageElements: Map<string, HTMLElement> = new Map();
  private abortController: AbortController | null = null;
  private pendingSelectionContext: { text: string; sourceFile: string } | null = null;
  private selectionContextChip: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: CopilotPlugin) {
    super(leaf);
    this.plugin = plugin;
    this.sessionManager = new ChatSessionManager(plugin);
    this.settings = { ...DEFAULT_CHAT_SETTINGS };
  }

  getViewType(): string {
    return VIEW_TYPE_COPILOT_CHAT;
  }

  getDisplayText(): string {
    return 'Copilot Chat';
  }

  getIcon(): string {
    return 'message-square';
  }

  async onOpen(): Promise<void> {
    // Load chat settings
    await this.loadSettings();

    // Build UI
    this.buildUI();

    // Create initial thread if none exists
    if (this.settings.threads.length === 0) {
      this.createNewThread();
    } else if (this.settings.currentThreadId) {
      // Restore current thread
      this.renderMessages();
    }

    // Listen for file changes to update context
    this.registerEvent(
      this.app.workspace.on('file-open', () => {
        this.updateContextDisplay();
      })
    );

    // Listen for file changes to update context
    this.registerEvent(
      this.app.workspace.on('editor-change', () => {
        this.updateContextDisplay();
      })
    );
  }

  async onClose(): Promise<void> {
    // Save settings
    await this.saveSettings();

    // Cleanup sessions
    await this.sessionManager.destroyAllSessions();

    // Abort any in-flight requests
    if (this.abortController) {
      this.abortController.abort();
    }
  }

  private buildUI(): void {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass('copilot-chat-view');

    // Toolbar
    const toolbar = container.createDiv({ cls: 'copilot-chat-toolbar' });

    // New thread button
    const newButton = toolbar.createEl('button', {
      cls: 'clickable-icon',
      attr: { 'aria-label': 'New conversation' },
    });
    newButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
    newButton.addEventListener('click', () => this.createNewThread());

    // Context indicator
    const contextIndicator = toolbar.createDiv({ cls: 'copilot-chat-context' });
    this.updateContextIndicator(contextIndicator);

    // Messages container
    this.messagesContainer = container.createDiv({ cls: 'copilot-chat-messages' });

    // Input container
    const inputContainer = container.createDiv({ cls: 'copilot-chat-input-container' });

    // Selection context chip (hidden by default)
    this.selectionContextChip = inputContainer.createDiv({ cls: 'copilot-chat-selection-context' });
    this.selectionContextChip.style.display = 'none';

    // Input row (textarea + send button side by side)
    const inputRow = inputContainer.createDiv({ cls: 'copilot-chat-input-row' });

    // Input field
    this.inputElement = inputRow.createEl('textarea', {
      cls: 'copilot-chat-input',
      attr: { placeholder: 'Type a message...', rows: '1' },
    });

    // Auto-resize textarea
    this.inputElement.addEventListener('input', () => {
      if (this.inputElement) {
        this.inputElement.style.height = 'auto';
        this.inputElement.style.height = this.inputElement.scrollHeight + 'px';
      }
    });

    // Handle Enter key (send) and Shift+Enter (newline)
    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        void this.handleSendMessage();
      } else if (e.key === 'Escape') {
        this.handleAbort();
      }
    });

    // Send button
    this.sendButton = inputRow.createEl('button', {
      cls: 'mod-cta copilot-chat-send',
      text: 'Send',
    });
    this.sendButton.addEventListener('click', () => this.handleSendMessage());
  }

  private updateContextIndicator(container: HTMLElement): void {
    container.empty();

    const currentThread = this.getCurrentThread();
    const parts: string[] = [];

    if (currentThread?.contextFile) {
      parts.push(`📄 ${currentThread.contextFile}`);
    } else if (this.settings.autoIncludeContext) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        parts.push(`📄 ${activeFile.basename}`);
      }
    }

    if (parts.length > 0) {
      container.setText(parts.join(' '));
    }
  }

  private updateContextDisplay(): void {
    const toolbar = this.containerEl.querySelector('.copilot-chat-toolbar');
    const contextIndicator = toolbar?.querySelector('.copilot-chat-context');
    if (contextIndicator instanceof HTMLElement) {
      this.updateContextIndicator(contextIndicator);
    }
  }

  private toggleContextAttachment(): void {
    const currentThread = this.getCurrentThread();
    const activeFile = this.app.workspace.getActiveFile();

    if (!currentThread) return;

    if (currentThread.contextFile) {
      // Remove context
      currentThread.contextFile = undefined;
      new Notice('Document context removed');
    } else if (activeFile) {
      // Add context
      currentThread.contextFile = activeFile.basename;
      new Notice(`Attached: ${activeFile.basename}`);
    }

    void this.saveSettings();
    const toolbar = this.containerEl.querySelector('.copilot-chat-toolbar');
    const contextIndicator = toolbar?.querySelector('.copilot-chat-context');
    if (contextIndicator instanceof HTMLElement) {
      this.updateContextIndicator(contextIndicator);
    }
  }

  private getCurrentThread(): ChatThread | null {
    if (!this.settings.currentThreadId) return null;
    return this.settings.threads.find((t) => t.id === this.settings.currentThreadId) || null;
  }

  private createNewThread(): void {
    const thread: ChatThread = {
      id: Date.now().toString(),
      messages: [],
      model: this.settings.defaultChatModel,
      created: Date.now(),
      updated: Date.now(),
    };

    this.settings.threads.push(thread);
    this.settings.currentThreadId = thread.id;

    this.messageElements.clear();
    this.renderMessages();
    void this.saveSettings();

    new Notice('New conversation started');
  }

  private renderMessages(): void {
    if (!this.messagesContainer) return;

    this.messagesContainer.empty();
    this.messageElements.clear();

    const currentThread = this.getCurrentThread();
    if (!currentThread) return;

    for (const message of currentThread.messages) {
      const messageEl = this.renderMessage(message);
      this.messagesContainer.appendChild(messageEl);
      this.messageElements.set(message.id, messageEl);
    }

    this.scrollToBottom();
  }

  private renderMessage(message: ChatMessage): HTMLElement {
    const messageEl = document.createElement('div');
    messageEl.addClass('copilot-message', message.role);

    if (message.streaming) {
      messageEl.addClass('copilot-message-streaming');
    }

    const contentEl = messageEl.createDiv({ cls: 'copilot-message-content' });

    if (message.role === 'assistant') {
      if (message.streaming) {
        // Show raw text during streaming for smooth updates
        contentEl.textContent = message.content || '...';
      } else {
        // Render markdown only when complete
        MarkdownRenderer.render(
          this.app,
          message.content || '...',
          contentEl,
          '',
          this
        );

        // Add action buttons for completed assistant messages
        if (message.content) {
          this.addMessageActions(messageEl, message);
        }
      }
    } else {
      contentEl.textContent = message.content;
    }

    // Add timestamp (optional, can be toggled in settings)
    const timestamp = messageEl.createDiv({ cls: 'copilot-message-timestamp' });
    timestamp.textContent = new Date(message.timestamp).toLocaleTimeString();

    return messageEl;
  }

  private addMessageActions(messageEl: HTMLElement, message: ChatMessage): void {
    const actionsEl = messageEl.createDiv({ cls: 'copilot-message-actions' });

    // Copy button
    const copyBtn = actionsEl.createEl('button', {
      cls: 'copilot-message-action-btn',
      text: 'Copy',
    });
    copyBtn.addEventListener('click', () => {
      navigator.clipboard.writeText(message.content);
      new Notice('Copied to clipboard');
    });

    // Insert into document button
    const insertBtn = actionsEl.createEl('button', {
      cls: 'copilot-message-action-btn mod-cta',
      text: 'Insert into document',
    });
    insertBtn.addEventListener('click', () => {
      this.insertIntoDocument(message.content);
    });
  }

  private insertIntoDocument(content: string): void {
    // Try to get active markdown view first
    let markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);

    // If chat is active, find any open markdown view
    if (!markdownView) {
      const leaves = this.app.workspace.getLeavesOfType('markdown');
      if (leaves.length > 0) {
        markdownView = leaves[0].view as MarkdownView;
      }
    }

    if (!markdownView) {
      new Notice('No document open. Please open a markdown file.');
      return;
    }

    const editor = markdownView.editor;
    const cursor = editor.getCursor();

    // Insert content at cursor position
    editor.replaceRange('\n' + content + '\n', cursor);

    new Notice('Content inserted into document');
  }

  private updateMessageContent(messageId: string, content: string, isStreaming = true): void {
    const messageEl = this.messageElements.get(messageId);
    if (!messageEl) return;

    const contentEl = messageEl.querySelector('.copilot-message-content');
    if (contentEl) {
      if (isStreaming) {
        // During streaming, just update text content for smooth updates
        contentEl.textContent = content || '...';
      } else {
        // When complete, render as markdown
        contentEl.empty();
        MarkdownRenderer.render(
          this.app,
          content || '...',
          contentEl as HTMLElement,
          '',
          this
        );

        // Add action buttons when rendering is complete
        const currentThread = this.getCurrentThread();
        const message = currentThread?.messages.find(m => m.id === messageId);
        if (message && content) {
          // Remove existing actions if any
          const existingActions = messageEl.querySelector('.copilot-message-actions');
          if (existingActions) {
            existingActions.remove();
          }
          this.addMessageActions(messageEl, message);
        }
      }
    }

    this.scrollToBottom();
  }

  private async handleSendMessage(): Promise<void> {
    if (!this.inputElement || !this.messagesContainer) return;

    const content = this.inputElement.value.trim();
    if (!content) return;

    const currentThread = this.getCurrentThread();
    if (!currentThread) {
      new Notice('No active conversation');
      return;
    }

    if (!this.plugin.copilotClient) {
      new Notice('Copilot client not initialized');
      return;
    }

    // Capture and clear selection context before sending
    const selectionContext = this.pendingSelectionContext;
    this.clearSelectionContext();

    // Clear input
    this.inputElement.value = '';
    this.inputElement.style.height = 'auto';

    // Disable send button
    if (this.sendButton) {
      this.sendButton.disabled = true;
    }

    // Add user message
    const userMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: Date.now(),
    };

    currentThread.messages.push(userMessage);
    const userMessageEl = this.renderMessage(userMessage);
    this.messagesContainer.appendChild(userMessageEl);
    this.messageElements.set(userMessage.id, userMessageEl);

    // Create assistant message placeholder
    const assistantMessage: ChatMessage = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      streaming: true,
    };

    currentThread.messages.push(assistantMessage);
    const assistantMessageEl = this.renderMessage(assistantMessage);
    this.messagesContainer.appendChild(assistantMessageEl);
    this.messageElements.set(assistantMessage.id, assistantMessageEl);

    this.scrollToBottom();

    // Set up abort controller
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    // Build prompt with context
    const promptWithContext = await this.buildPromptWithContext(content, selectionContext);

    // Stream response
    let accumulatedText = '';

    try {
      await this.sessionManager.sendMessage(
        currentThread,
        promptWithContext,
        (deltaContent: string) => {
          if (signal.aborted) return;
          accumulatedText += deltaContent;
          assistantMessage.content = accumulatedText;
          this.updateMessageContent(assistantMessage.id, accumulatedText);
        },
        signal
      );

      // Mark streaming complete
      assistantMessage.streaming = false;
      assistantMessageEl.removeClass('copilot-message-streaming');

      // Render final message with markdown
      this.updateMessageContent(assistantMessage.id, accumulatedText, false);

      // Update thread timestamp
      currentThread.updated = Date.now();

      // Save settings
      await this.saveSettings();
    } catch (error) {
      if (!signal.aborted) {
        console.error('Error sending message:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        new Notice(`Error: ${errorMessage}`);

        // Update message with error
        assistantMessage.content = `_Error: ${errorMessage}_`;
        assistantMessage.streaming = false;
        this.updateMessageContent(assistantMessage.id, assistantMessage.content, false);
      }
    } finally {
      // Re-enable send button
      if (this.sendButton) {
        this.sendButton.disabled = false;
      }
      this.abortController = null;
    }
  }

  private handleAbort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
      new Notice('Request aborted');

      // Re-enable send button
      if (this.sendButton) {
        this.sendButton.disabled = false;
      }
    }
  }

  private async buildPromptWithContext(
    userPrompt: string,
    selectionContext?: { text: string; sourceFile: string } | null,
  ): Promise<string> {
    const currentThread = this.getCurrentThread();
    if (!currentThread) return userPrompt;

    let finalPrompt = userPrompt;
    const parts: string[] = [];

    // Check if we should include full document context
    const shouldIncludeContext =
      currentThread.contextFile || this.settings.autoIncludeContext;

    if (shouldIncludeContext) {
      const activeFile = this.app.workspace.getActiveFile();
      if (activeFile) {
        try {
          const content = await this.app.vault.read(activeFile);
          parts.push(`Full document:\nFile: ${activeFile.basename}\nContent:\n"""\n${content}\n"""`);
        } catch (error) {
          console.error('Error reading file for context:', error);
        }
      }
    }

    // Include referenced selection if present
    if (selectionContext) {
      parts.push(`Referenced selection from "${selectionContext.sourceFile}":\n"""\n${selectionContext.text}\n"""`);
    }

    // Build final prompt with context
    if (parts.length > 0) {
      finalPrompt = `${parts.join('\n\n')}\n\nUser question: ${userPrompt}`;
    }

    return finalPrompt;
  }

  private scrollToBottom(): void {
    if (this.messagesContainer) {
      this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }
  }

  public setContextAndFocus(selectedText: string, sourceFile: string): void {
    if (!this.inputElement || !this.selectionContextChip) return;

    this.pendingSelectionContext = { text: selectedText, sourceFile };
    this.showSelectionContextChip();
    this.inputElement.focus();
  }

  private showSelectionContextChip(): void {
    if (!this.selectionContextChip || !this.pendingSelectionContext) return;

    this.selectionContextChip.empty();
    this.selectionContextChip.style.display = 'flex';

    const label = this.selectionContextChip.createSpan({ cls: 'copilot-chat-selection-label' });
    const preview = this.pendingSelectionContext.text.length > 60
      ? this.pendingSelectionContext.text.slice(0, 60) + '...'
      : this.pendingSelectionContext.text;
    label.setText(`\u{1F4CE} "${this.pendingSelectionContext.sourceFile}" — ${preview}`);

    const dismissBtn = this.selectionContextChip.createSpan({ cls: 'copilot-chat-selection-dismiss' });
    dismissBtn.setText('\u00D7');
    dismissBtn.addEventListener('click', () => this.clearSelectionContext());
  }

  private clearSelectionContext(): void {
    this.pendingSelectionContext = null;
    if (this.selectionContextChip) {
      this.selectionContextChip.style.display = 'none';
      this.selectionContextChip.empty();
    }
  }

  async loadSettings(): Promise<void> {
    const data = await this.plugin.loadData();
    if (data?.chatSettings) {
      this.settings = { ...DEFAULT_CHAT_SETTINGS, ...data.chatSettings };
    }
  }

  async saveSettings(): Promise<void> {
    const data = await this.plugin.loadData();
    await this.plugin.saveData({ ...data, chatSettings: this.settings });
  }
}

export { VIEW_TYPE_COPILOT_CHAT };
