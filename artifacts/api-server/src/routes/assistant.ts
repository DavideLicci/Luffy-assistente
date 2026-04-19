import { Router } from "express";
import { z } from "zod";

import { commandHistoryStore } from "../services/commandHistoryStore.js";
import { assistantEngine } from "../services/assistantEngine.js";

const commandSchema = z.object({
  text: z.string().min(1),
  source: z.enum(["text", "voice"]).default("text")
});

export const assistantRouter = Router();

assistantRouter.post("/command", (request, response) => {
  const parsed = commandSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({
      error: "Invalid payload.",
      details: parsed.error.flatten()
    });
  }

  const result = assistantEngine.processAssistantCommand(parsed.data);
  return response.json(result);
});

assistantRouter.get("/history", (request, response) => {
  const limit = Number(request.query.limit ?? 30);
  const safeLimit = Number.isNaN(limit) ? 30 : Math.min(Math.max(limit, 1), 100);
  return response.json({
    items: commandHistoryStore.list(safeLimit)
  });
});
