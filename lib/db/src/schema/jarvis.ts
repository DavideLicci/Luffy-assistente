import { z } from "zod";

export const memoryEntrySchema = z.object({
  key: z.string(),
  value: z.unknown()
});

export const noteSchema = z.object({
  id: z.string(),
  text: z.string(),
  createdAt: z.string()
});

export const commandHistorySchema = z.object({
  id: z.string(),
  input: z.string(),
  intent: z.string(),
  outcome: z.string(),
  timestamp: z.string()
});

export const routineSchema = z.object({
  id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  payload: z.record(z.unknown())
});
