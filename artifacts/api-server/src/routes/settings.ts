import { Router } from "express";
import { z } from "zod";

import { settingsStore } from "../services/settingsStore.js";

const settingsPatchSchema = z
  .object({
    startWithWindows: z.boolean().optional(),
    startMinimizedToTray: z.boolean().optional(),
    pushToTalkHotkey: z.string().min(1).optional(),
    commandPaletteHotkey: z.string().min(1).optional(),
    voiceEnabled: z.boolean().optional(),
    onboardingCompleted: z.boolean().optional(),
    microphoneDeviceId: z.string().min(1).nullable().optional(),
    voiceProfile: z
      .object({
        voiceURI: z.string().min(1).nullable().optional(),
        rate: z.number().optional(),
        pitch: z.number().optional(),
        volume: z.number().optional()
      })
      .optional(),
    personalityProfile: z
      .object({
        style: z.enum(["friendly", "focused", "professional"]).optional(),
        customSystemNote: z.string().optional()
      })
      .optional()
  })
  .strict();

const allowedAppSchema = z.object({
  id: z.string().optional(),
  displayName: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  executablePath: z.string().min(1)
});

export const settingsRouter = Router();

settingsRouter.get("/", (_request, response) => {
  return response.json(settingsStore.getSettings());
});

settingsRouter.patch("/", (request, response) => {
  const parsed = settingsPatchSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }

  const next = settingsStore.updateSettings(parsed.data);
  return response.json(next);
});

settingsRouter.post("/allowed-apps", (request, response) => {
  const parsed = allowedAppSchema.safeParse(request.body);
  if (!parsed.success) {
    return response.status(400).json({ error: parsed.error.flatten() });
  }

  try {
    const next = settingsStore.upsertAllowedApp(parsed.data);
    return response.json(next);
  } catch (error) {
    return response.status(400).json({
      error: error instanceof Error ? error.message : "Unknown validation error."
    });
  }
});

settingsRouter.delete("/allowed-apps/:id", (request, response) => {
  const next = settingsStore.removeAllowedApp(request.params.id);
  return response.json(next);
});

settingsRouter.post("/allowed-apps/:id/test-launch", (request, response) => {
  const launched = settingsStore.launchAllowedApp(request.params.id);
  return response.json(launched);
});
