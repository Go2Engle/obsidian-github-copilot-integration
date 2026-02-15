import { CopilotSession } from '@github/copilot-sdk';
import type CopilotPlugin from './main';
import { ChatThread } from './chatTypes';

// ── Chat Session Manager ───────────────────────────────────────────────────────

export class ChatSessionManager {
  private plugin: CopilotPlugin;
  private activeSessions: Map<string, CopilotSession>;
  private activeMessageId: number = 0;
  private handlerRegistered: Set<string> = new Set();
  private _currentDeltaHandler: ((event: any) => void) | null = null;

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
      const session = await this.plugin.copilotClient.createSession({
        model: thread.model,
        streaming: true,
        systemMessage: {
          content: 'You are a helpful AI assistant integrated into Obsidian. When helping users with their documents, provide suggestions, explanations, and content they can use. Never attempt to create, modify, or save files yourself - only provide the content or suggestions. If the user asks you to make changes to their document, provide the modified content that they can review and apply.',
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
      session.on('assistant.message_delta', (event: any) => {
        if (this._currentDeltaHandler) {
          this._currentDeltaHandler(event);
        }
      });
      this.handlerRegistered.add(thread.id);
    }

    // Set the current handler — old ones are replaced, not stacked
    this._currentDeltaHandler = (event: any) => {
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
        await session.destroy();
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
