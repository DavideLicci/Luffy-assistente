export type AssistantIntent =
  | "greeting"
  | "help"
  | "time"
  | "set_name"
  | "save_note"
  | "show_notes"
  | "study_on"
  | "study_off"
  | "history"
  | "open_app"
  | "unknown";

export type AssistantOutcome = "executed" | "blocked" | "not_found" | "error";

export type HistoryOutcome = "success" | "blocked" | "not_whitelisted" | "error";

export type AssistantCommandResponse = {
  reply: string;
  intent: AssistantIntent;
  outcome: AssistantOutcome;
  metadata?: Record<string, unknown>;
};
