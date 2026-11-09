import { CopilotSession, approveAll, type SessionEvent } from '@github/copilot-sdk';
import type CopilotPlugin from './main';
import { ChatThread, type ChatAccessMode } from './chatTypes';
import { buildVaultTools } from './vaultTools';

const READ_ONLY_PROMPT =
  'You are a helpful AI assistant integrated into Obsidian. You can read notes in the user\'s vault with the provided tools: list_notes, search_notes, read_note, follow_links, and get_backlinks. Use them to find and follow related notes instead of asking the user to paste content. You cannot create, modify, or save files; if the user asks for changes, provide the modified content for them to review and apply.';

const WRITE_PROMPT =
  'You are a helpful AI assistant integrated into Obsidian. You can read notes in the user\'s vault with list_notes, search_notes, read_note, follow_links, and get_backlinks, and you can change them with create_note, replace_note, and append_to_note. Read a note before replacing it so you keep its existing content. Only write when the user asks you to, and say which notes you created or changed.';

function systemPromptFor(mode: ChatAccessMode): string {
  return mode === 'write' ? WRITE_PROMPT : READ_ONLY_PROMPT;
}

// ── Chat Session Manager ───────────────────────────────────────────────────────

type AssistantMessageDeltaEvent = Extract<SessionEvent, { type: 'assistant.message_delta' }>;

type DisconnectableSession = CopilotSession & {
  disconnect?: () => Promise<void>;
};

async function disconnectSession(session: CopilotSession): Promise<void> {
  const disconnectableSession = session as DisconnectableSession;
  if (typeof disconnectableSession.disconnect === 'function') {
    await disconnectableSession.disconnect();
    return;
  }

  await (session as unknown as { destroy: () => Promise<void> }).destroy();
}

export class ChatSessionManager {
  private plugin: CopilotPlugin;
  private activeSessions: Map<string, CopilotSession>;
  private activeMessageId: number = 0;
  private handlerRegistered: Set<string> = new Set();
  private _currentDeltaHandler: ((event: AssistantMessageDeltaEvent) => void) | null = null;

  constructor(plugin: CopilotPlugin) {
    this.plugin = plugin;
    this.activeSessions = new Map();
  }

  /**
   * Get or create a Copilot session for a thread
   */
  async getOrCreateSession(thread: ChatThread): Promise<CopilotSession | null> {
    if (!this.plugin.copilotClient) {
      console.error('Copilot client not initialized');
      return null;
    }

    // Return existing session if available
    if (this.activeSessions.has(thread.id)) {
      return this.activeSessions.get(thread.id)!;
    }

    try {
      // Create new session
      const mode: ChatAccessMode = thread.accessMode ?? 'read';
      const session = await this.plugin.copilotClient.createSession({
        model: thread.model,
        streaming: true,
        includeSubAgentStreamingEvents: false,
        onPermissionRequest: approveAll,
        tools: buildVaultTools(this.plugin.app, mode),
        systemMessage: {
          content: systemPromptFor(mode),
        },
      });

      this.activeSessions.set(thread.id, session);
      return session;
    } catch (error) {
      console.error('Failed to create Copilot session:', error);
      return null;
    }
  }

  /**
   * Send a message and handle streaming response
   */
  async sendMessage(
    thread: ChatThread,
    content: string,
    onDelta: (deltaContent: string) => void,
    signal?: AbortSignal
  ): Promise<void> {
    const session = await this.getOrCreateSession(thread);
    if (!session) {
      throw new Error('Failed to create session');
    }

    // Use a message ID to ensure only the current handler processes deltas
    const messageId = ++this.activeMessageId;

    // Only register one handler per session — subsequent calls reuse it
    if (!this.handlerRegistered.has(thread.id)) {
      session.on('assistant.message_delta', (event) => {
        if (this._currentDeltaHandler) {
          this._currentDeltaHandler(event);
        }
      });
      this.handlerRegistered.add(thread.id);
    }

    // Set the current handler — old ones are replaced, not stacked
    this._currentDeltaHandler = (event: AssistantMessageDeltaEvent) => {
      if (messageId !== this.activeMessageId) return;
      if (signal?.aborted) return;
      const deltaContent = event.data.deltaContent || '';
      onDelta(deltaContent);
    };

    await session.sendAndWait({ prompt: content });
  }

  /**
   * Destroy a specific session
   */
  async destroySession(threadId: string): Promise<void> {
    const session = this.activeSessions.get(threadId);
    if (session) {
      try {
        await disconnectSession(session);
      } catch (error) {
        console.error('Error destroying session:', error);
      }
      this.activeSessions.delete(threadId);
    }
  }

  /**
   * Destroy all active sessions
   */
  async destroyAllSessions(): Promise<void> {
    const destroyPromises = Array.from(this.activeSessions.keys()).map((threadId) =>
      this.destroySession(threadId)
    );
    await Promise.all(destroyPromises);
    this.activeSessions.clear();
  }

  /**
   * Check if a session exists for a thread
   */
  hasSession(threadId: string): boolean {
    return this.activeSessions.has(threadId);
  }
}
