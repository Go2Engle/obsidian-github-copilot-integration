// ── Chat Types and Interfaces ─────────────────────────────────────────────────

export const VIEW_TYPE_COPILOT_CHAT = 'copilot-chat';

export type MessageRole = 'user' | 'assistant' | 'system';

/** 'read' = vault tools can only read; 'write' = vault tools may also create/modify notes. */
export type ChatAccessMode = 'read' | 'write';

/** Live progress from a running request, shown in the chat panel but not saved with the thread. */
export type ChatActivity =
  | { kind: 'thinking'; text: string }
  | { kind: 'tool'; name: string; phase: 'start' | 'done' };

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
  /** Show the model's reasoning and tool-call status while a reply is generated. */
  showThinking: boolean;
}

export const DEFAULT_CHAT_SETTINGS: CopilotChatSettings = {
  threads: [],
  currentThreadId: null,
  defaultChatModel: 'auto',
  autoIncludeContext: true,
  showThinking: true,
};
