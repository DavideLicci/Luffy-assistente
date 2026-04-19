import { Router } from "express";
import { z } from "zod";

import { noteStore } from "../services/noteStore.js";

const notePayloadSchema = z.object({
  text: z.string().min(1)
});

export const notesRouter = Router();

notesRouter.get("/", (_request, response) => {
  return response.json({
    items: noteStore.list(100)
  });
});

notesRouter.post("/", (request, response) => {
  const parsed = notePayloadSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }
  return response.status(201).json(noteStore.add(parsed.data.text));
});
