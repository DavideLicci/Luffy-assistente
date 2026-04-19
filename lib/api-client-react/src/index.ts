export type AssistantCommandRequest = {
  text: string;
  source?: "text" | "voice";
};

export type AssistantCommandResponse = {
  reply: string;
  intent: string;
  outcome: "executed" | "blocked" | "not_found" | "error";
  metadata?: Record<string, unknown>;
};
