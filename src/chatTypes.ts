// ── Chat Types and Interfaces ─────────────────────────────────────────────────

export const VIEW_TYPE_COPILOT_CHAT = 'copilot-chat';

export type MessageRole = 'user' | 'assistant' | 'system';

/** 'read' = vault tools can only read; 'write' = vault tools may also create/modify notes. */
export type ChatAccessMode = 'read' | 'write';

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
  /** Undefined on threads created before this option existed; treated as 'read'. */
  accessMode?: ChatAccessMode;
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
  defaultChatModel: 'auto',
  autoIncludeContext: true,
};
