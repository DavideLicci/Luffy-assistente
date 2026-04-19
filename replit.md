# Workspace

## Overview

pnpm workspace monorepo using TypeScript. This is the Jarvis AI Assistant — a futuristic, dark-themed personal AI assistant web app with Italian-language command support, voice interaction, local memory, notes, study mode, command history, and a sleek cyberpunk HUD interface.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Frontend**: React + Vite + Tailwind CSS + Framer Motion
- **Voice**: Web Speech API (SpeechRecognition + SpeechSynthesis, Italian)

## Jarvis Features

- **Text + Voice command input** — type or hold mic for push-to-talk (Italian)
- **Intent classification** — routes commands to the right skill
- **Assistant state indicator** — Idle / Listening / Thinking / Speaking / Executing with animations
- **Notes system** — save, list, delete notes via natural language or UI
- **Memory system** — key-value store for user name, preferences, app config
- **Command history** — full log of all interactions with intent classification
- **Routines** — saved routines (study mode, morning routine, etc.)
- **Study mode** — activate/deactivate via command or UI
- **App launcher** — command "Apri Chrome" etc. (runs locally on Windows)
- **Safe confirmation layer** — risky actions require explicit confirmation
- **Settings** — configure user name, preferences

## Italian Commands (examples)

- "Che ora è?" — current time
- "Salva nota: testo..." — save a note
- "Mostra le mie note" — list notes
- "Modalità studio attivata" — enable study mode
- "Apri Chrome" — open app
- "Mi chiamo Marco" — set user name
- "Ciao Jarvis" — greeting
- "Aiuto" / "Cosa puoi fare?" — help

## Architecture

```
artifacts/
  jarvis/          — React frontend (dark HUD UI)
  api-server/      — Express backend (all routes)
    src/routes/
      assistant.ts  — command processing, state, summary, confirmation
      memory.ts     — key-value memory CRUD
      notes.ts      — notes CRUD
      commands.ts   — command history
      routines.ts   — routines CRUD
lib/
  db/src/schema/
    jarvis.ts       — memory, notes, command_history, routines tables
  api-spec/
    openapi.yaml    — API contract (source of truth)
  api-client-react/ — generated React Query hooks
  api-zod/          — generated Zod validation schemas
```

## Adding New Skills

To add a new command/skill to Jarvis:
1. Open `artifacts/api-server/src/routes/assistant.ts`
2. Add a new case in the `classifyIntent()` function with Italian/English keywords
3. Add the corresponding case in the `executeIntent()` switch statement
4. Return a response string in Italian

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally
- `pnpm --filter @workspace/jarvis run dev` — run Jarvis frontend locally
