export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AgentRequest {
  messages: ChatMessage[];
  userAddress?: string;
}

export interface ToolCallRecord {
  name: string;
  input: unknown;
  output: unknown;
}

export interface AgentResponse {
  reply: string;
  toolCalls?: ToolCallRecord[];
}
