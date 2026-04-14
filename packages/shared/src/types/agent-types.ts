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

export type AgentEvent =
  | { type: "iteration"; index: number }
  | { type: "text_delta"; delta: string }
  | { type: "tool_use_start"; id: string; name: string; input: unknown }
  | { type: "tool_result"; id: string; name: string; ok: boolean; summary: string }
  | { type: "done"; reply: string; toolCalls?: ToolCallRecord[] }
  | { type: "error"; message: string; where: "model" | "tool" | "abort" };
