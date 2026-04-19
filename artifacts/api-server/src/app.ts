import path from "node:path";

import cors from "cors";
import express from "express";

import { assistantRouter } from "./routes/assistant.js";
import { memoryRouter } from "./routes/memory.js";
import { notesRouter } from "./routes/notes.js";
import { settingsRouter } from "./routes/settings.js";

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({ ok: true, service: "luffy-api" });
  });

  app.use("/api/assistant", assistantRouter);
  app.use("/api/settings", settingsRouter);
  app.use("/api/notes", notesRouter);
  app.use("/api/memory", memoryRouter);

  if (process.env.SERVE_STATIC === "true") {
    const staticDir =
      process.env.STATIC_DIR ??
      path.resolve(process.cwd(), "../jarvis/dist/public");
    app.use(express.static(staticDir));

    app.get("*", (_request, response) => {
      response.sendFile(path.join(staticDir, "index.html"));
    });
  }

  return app;
}
