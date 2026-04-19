import { Router } from "express";
import { z } from "zod";

import { memoryStore } from "../services/memoryStore.js";
import { structuredMemoryStore } from "../services/structuredMemoryStore.js";

const setMemorySchema = z.object({
  key: z.string().min(1),
  value: z.unknown()
});

const preferenceSchema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number(), z.boolean()])
});

const contextSchema = z.object({
  key: z.string().min(1),
  value: z.string().min(1)
});

export const memoryRouter = Router();

memoryRouter.get("/", (_request, response) => {
  return response.json(memoryStore.getAll());
});

memoryRouter.put("/", (request, response) => {
  const parsed = setMemorySchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }
  return response.json(memoryStore.set(parsed.data.key, parsed.data.value));
});

memoryRouter.get("/structured", (_request, response) => {
  return response.json(structuredMemoryStore.get());
});

memoryRouter.post("/structured/preferences", (request, response) => {
  const parsed = preferenceSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }
  return response.json(
    structuredMemoryStore.setPreference(parsed.data.key, parsed.data.value)
  );
});

memoryRouter.delete("/structured/preferences/:key", (request, response) => {
  return response.json(structuredMemoryStore.removePreference(request.params.key));
});

memoryRouter.post("/structured/context", (request, response) => {
  const parsed = contextSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }
  return response.json(
    structuredMemoryStore.upsertContext(parsed.data.key, parsed.data.value)
  );
});

memoryRouter.delete("/structured/context/:id", (request, response) => {
  return response.json(structuredMemoryStore.removeContext(request.params.id));
});
