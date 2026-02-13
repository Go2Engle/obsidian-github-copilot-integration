// ── Chat Types and Interfaces ─────────────────────────────────────────────────

export const VIEW_TYPE_COPILOT_CHAT = 'copilot-chat';

export type MessageRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  timestamp: number;
  streaming?: boolean;
}

export interface ChatThread {
  id: string;
  messages: ChatMessage[];
  model: string;
  contextFile?: string;
  created: number;
  updated: number;
}

export interface CopilotChatSettings {
  threads: ChatThread[];
  currentThreadId: string | null;
  defaultChatModel: string;
  autoIncludeContext: boolean;
}

export const DEFAULT_CHAT_SETTINGS: CopilotChatSettings = {
  threads: [],
  currentThreadId: null,
  defaultChatModel: 'gpt-4o',
  autoIncludeContext: true,
};
