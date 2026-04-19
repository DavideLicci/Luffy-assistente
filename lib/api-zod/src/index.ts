import { z } from "zod";

export const assistantCommandRequestSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["text", "voice"]).optional()
});

export const assistantCommandResponseSchema = z.object({
  reply: z.string(),
  intent: z.string(),
  outcome: z.enum(["executed", "blocked", "not_found", "error"]),
  metadata: z.record(z.unknown()).optional()
});
