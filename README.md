# Luffy AI Assistant

A minimal, modern personal AI assistant desktop app inspired by *One Piece*.  
Responds to Italian (and English) voice/text commands with local memory, notes, study mode, command history, and saved routines.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33 |
| Frontend | React 19 + Vite 7 + Tailwind CSS 4 |
| Backend | Express 5 + Node.js |
| Database | PostgreSQL + Drizzle ORM |
| Language | TypeScript (compiled with esbuild / tsc) |

---

## Prerequisites

- **Node.js 20+** — https://nodejs.org
- **pnpm 9+** — `npm install -g pnpm`
- **PostgreSQL** — local install or a free cloud instance (Neon, Supabase, etc.)

---

## First-Time Setup

### 1 — Install workspace packages

```bash
pnpm install
```

### 2 — Configure environment variables

Create a `.env` file in the project root:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/luffy
SESSION_SECRET=any-long-random-string-here
```

### 3 — Push the schema to the database

```bash
pnpm db:push
```

---

## Running as a Desktop App (Electron)

The Electron desktop wrapper lives in the `desktop/` folder.  
Because it contains Electron (a large binary), its packages are installed separately:

```bash
cd desktop
pnpm install
```

### Development — hot-reload with DevTools

```bash
# Run from inside the desktop/ folder
pnpm dev
```

This starts three processes at once:

| Name | What it does |
|---|---|
| **api** | Express backend on `http://localhost:8080` |
| **web** | Vite frontend with hot-reload on `http://localhost:3000` |
| **app** | Electron window — opens automatically once the frontend is ready |

Press **Ctrl+C** to stop everything.

### Package a distributable installer

```bash
# Windows .exe installer
pnpm package:win

# macOS .dmg
pnpm package:mac

# Linux .AppImage
pnpm package:linux
```

Output is written to `desktop/release/`.  
Before packaging, both the API server and frontend must be built (the `package:*` scripts do this automatically).

---

## Running in the Browser (No Electron)

If you only need the web version locally:

```bash
# From the project root
pnpm dev
```

Then open `http://localhost:3000` in Chrome or Edge.

---

## Available Scripts

### Project root

| Script | Description |
|---|---|
| `pnpm dev` | Start API server + Vite frontend together |
| `pnpm dev:api` | Start API server only on port 8080 |
| `pnpm dev:web` | Start frontend only on port 3000 |
| `pnpm db:push` | Sync the database schema |
| `pnpm build` | Full production build of all packages |
| `pnpm typecheck` | Type-check all packages |

### `desktop/` folder

| Script | Description |
|---|---|
| `pnpm dev` | Start everything + open Electron window (development) |
| `pnpm package:win` | Build Windows NSIS installer |
| `pnpm package:mac` | Build macOS DMG |
| `pnpm package:linux` | Build Linux AppImage |

---

## Italian Commands

| Command | Action |
|---|---|
| `Mi chiamo [nome]` | Save your name to memory |
| `Salva nota: [testo]` | Save a note |
| `Mostra le note` / `Leggi note` | List your most recent notes |
| `Modalità studio` / `Attiva studio` | Toggle study mode on |
| `Disattiva studio` / `Fine studio` | Toggle study mode off |
| `Che ora è?` / `Che giorno è?` | Show the current time and date |
| `Cronologia` / `Ultimi comandi` | Show recent command history |
| `Ciao Luffy` / `Hey Luffy` | Greet Luffy |
| `Aiuto` / `Cosa puoi fare?` | List all available commands |

Commands also work in English for most intents.

---

## Project Structure

```
.
├── artifacts/
│   ├── api-server/          Express backend (port 8080)
│   │   └── src/
│   │       ├── app.ts       Express app (SERVE_STATIC support for desktop)
│   │       └── routes/      API route handlers
│   └── jarvis/              React + Vite frontend (port 3000 in dev)
│       └── src/
│           ├── pages/       Home, Notes, Memory, History, Routines, Settings
│           └── components/  Layout, sidebar
├── desktop/                 Electron desktop wrapper (standalone package)
│   ├── src/
│   │   ├── main.js          Electron main process
│   │   └── preload.js       Sandboxed preload
│   ├── assets/
│   │   └── luffy_icon.png   App icon
│   └── electron-builder.yml Packaging config
├── lib/
│   ├── db/                  Drizzle schema + migrations
│   ├── api-client-react/    Generated React Query hooks
│   └── api-zod/             Generated Zod validation schemas
└── pnpm-workspace.yaml
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for session signing |
| `PORT` | Set by scripts | Port the server listens on |
| `API_PORT` | Optional | Override API port for Vite proxy (default: 8080) |
| `SERVE_STATIC` | Production | Set to `true` to serve the built frontend from Express |
| `STATIC_DIR` | Production | Path to built frontend (default: `artifacts/jarvis/dist/public`) |

---

## Voice Input / Output

- **Push-to-talk**: click the microphone button or use the global hotkey (`Ctrl+Shift+Space` by default)
- **Offline STT**: Vosk runs in Electron main process; renderer streams raw mic PCM frames via IPC
- **Voice responses**: Luffy speaks Italian via browser speech synthesis API (voice selectable)
- **Voice controls**: choose voice, rate, pitch, volume, plus voice preview button
- **Personality split**: text/personality profile is managed separately from TTS voice profile
- **No cloud API required**: fully local voice pipeline
- **Desktop prerequisite for Vosk**: install Visual Studio 2019/2022 with **Desktop development with C++**
- **Model path**: set `VOSK_MODEL_PATH` or place `vosk-model-small-it-0.22` in `%USERPROFILE%\\.luffy-assistant\\models\\`

---

## UX Features

- **First-run onboarding**:
  - Guided setup with intro, features, microphone, voice, hotkeys, startup toggle, and initial app whitelist
  - Can be skipped, is persisted as completed, and can be reopened from Settings
- **Quick Command Palette**:
  - Global hotkey (`Ctrl+Shift+P` default)
  - Lightweight overlay for rapid text command execution with suggestions
- **Native Windows notifications**:
  - Reminder notifications
  - Action confirmations (for example app launch)
  - Important errors (voice/microphone/scheduler)
- **Structured memory panel**:
  - Preferences, contextual notes, frequent apps, and recent notes
- **Local scheduler**:
  - One-shot and recurring reminders (`none`, `daily`, `weekdays`)
  - Optional scheduled actions (`open_app` or assistant command)

---

## Safety Rules

- Luffy never deletes files
- Luffy never sends messages or emails  
- Any "risky" actions require explicit confirmation before execution
