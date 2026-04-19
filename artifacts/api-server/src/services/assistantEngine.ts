import type {
  AssistantCommandResponse,
  AssistantIntent,
  AssistantOutcome,
  HistoryOutcome
} from "../types/assistant.js";
import type { AllowedApp } from "../types/settings.js";
import { normalizeText } from "../utils/normalization.js";
import { commandHistoryStore } from "./commandHistoryStore.js";
import { memoryStore } from "./memoryStore.js";
import { noteStore } from "./noteStore.js";
import { settingsStore } from "./settingsStore.js";
import { structuredMemoryStore } from "./structuredMemoryStore.js";

type ProcessInput = {
  text: string;
  source: "text" | "voice";
};

function classifyIntent(text: string): AssistantIntent {
  const normalized = normalizeText(text);

  if (/^(ciao|hey|salve)\b/.test(normalized)) {
    return "greeting";
  }
  if (/\b(aiuto|cosa puoi fare|help)\b/.test(normalized)) {
    return "help";
  }
  if (/\b(che ora|che giorno|time|date)\b/.test(normalized)) {
    return "time";
  }
  if (/\bmi chiamo\b/.test(normalized)) {
    return "set_name";
  }
  if (/\b(salva nota|save note)\b/.test(normalized)) {
    return "save_note";
  }
  if (/\b(mostra.*note|leggi note|show notes)\b/.test(normalized)) {
    return "show_notes";
  }
  if (/\b(modalita studio|attiva studio|study mode on)\b/.test(normalized)) {
    return "study_on";
  }
  if (/\b(disattiva studio|fine studio|study mode off)\b/.test(normalized)) {
    return "study_off";
  }
  if (/\b(cronologia|ultimi comandi|history)\b/.test(normalized)) {
    return "history";
  }
  if (/\b(apri|avvia|lancia|open|launch)\b/.test(normalized)) {
    return "open_app";
  }

  return "unknown";
}

function extractName(text: string): string | undefined {
  const match = text.match(/mi chiamo\s+(.+)$/i);
  return match?.[1]?.trim();
}

function extractNote(text: string): string | undefined {
  const match = text.match(/salva nota[:\-\s]+(.+)$/i);
  return match?.[1]?.trim();
}

function extractAppName(text: string): string | undefined {
  const match = text.match(/(?:apri|avvia|lancia|open|launch)\s+(.+)$/i);
  return match?.[1]?.trim();
}

function nowItalianTime(): string {
  const now = new Date();
  const date = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
  const time = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit"
  });
  return `${date}, ${time}`;
}

function saveHistory(
  input: ProcessInput,
  intent: AssistantIntent,
  outcome: HistoryOutcome
): void {
  commandHistoryStore.add({
    input: input.text,
    intent,
    outcome,
    source: input.source
  });
}

function applyPersonality(rawReply: string): string {
  const style = settingsStore.getSettings().personalityProfile.style;
  switch (style) {
    case "focused":
      return rawReply;
    case "professional":
      return `Ricevuto. ${rawReply}`;
    default:
      return `Certo. ${rawReply}`;
  }
}

function openAppFromWhitelist(
  appName: string
): AssistantCommandResponse & { historyOutcome: HistoryOutcome; app?: AllowedApp } {
  const app = settingsStore.resolveAllowedApp(appName);
  if (!app) {
    return {
      intent: "open_app",
      outcome: "blocked",
      reply:
        "L'app non è nella whitelist. Apri Impostazioni -> App autorizzate e aggiungila prima.",
      metadata: { appName },
      historyOutcome: "not_whitelisted"
    };
  }

  const launchResult = settingsStore.launchAllowedApp(app.id);
  if (!launchResult.ok) {
    return {
      intent: "open_app",
      outcome: launchResult.reason === "not_whitelisted" ? "blocked" : "error",
      reply: `Non riesco ad aprire ${app.displayName}. Motivo: ${launchResult.reason}.`,
      metadata: { appId: app.id, reason: launchResult.reason },
      historyOutcome:
        launchResult.reason === "not_whitelisted" ? "not_whitelisted" : "error"
    };
  }

  return {
    intent: "open_app",
    outcome: "executed",
    reply: `Apro ${app.displayName}.`,
    metadata: { appId: app.id },
    historyOutcome: "success",
    app
  };
}

export function processAssistantCommand(input: ProcessInput): AssistantCommandResponse {
  const intent = classifyIntent(input.text);
  let response: AssistantCommandResponse;
  let historyOutcome: HistoryOutcome = "success";

  switch (intent) {
    case "greeting": {
      response = {
        intent,
        outcome: "executed",
        reply: "Ciao, sono Luffy. Dimmi pure cosa vuoi fare."
      };
      break;
    }
    case "help": {
      response = {
        intent,
        outcome: "executed",
        reply:
          "Puoi chiedermi ora/data, salvare note, vedere cronologia, attivare studio o aprire app autorizzate."
      };
      break;
    }
    case "time": {
      response = {
        intent,
        outcome: "executed",
        reply: `Sono le ${nowItalianTime()}.`
      };
      break;
    }
    case "set_name": {
      const name = extractName(input.text);
      if (!name) {
        response = {
          intent,
          outcome: "blocked",
          reply: "Dimmi il nome con il formato: Mi chiamo Davide."
        };
        historyOutcome = "blocked";
        break;
      }
      memoryStore.set("userName", name);
      response = {
        intent,
        outcome: "executed",
        reply: `Perfetto, da ora ti chiamerò ${name}.`
      };
      break;
    }
    case "save_note": {
      const note = extractNote(input.text);
      if (!note) {
        response = {
          intent,
          outcome: "blocked",
          reply: "Usa: Salva nota: testo della nota."
        };
        historyOutcome = "blocked";
        break;
      }
      noteStore.add(note);
      response = {
        intent,
        outcome: "executed",
        reply: "Nota salvata."
      };
      break;
    }
    case "show_notes": {
      const notes = noteStore.list(5);
      if (notes.length === 0) {
        response = {
          intent,
          outcome: "executed",
          reply: "Non ho note salvate al momento."
        };
      } else {
        const body = notes.map((note) => `- ${note.text}`).join("\n");
        response = {
          intent,
          outcome: "executed",
          reply: `Ultime note:\n${body}`
        };
      }
      break;
    }
    case "study_on": {
      memoryStore.set("studyMode", true);
      response = {
        intent,
        outcome: "executed",
        reply: "Modalità studio attivata."
      };
      break;
    }
    case "study_off": {
      memoryStore.set("studyMode", false);
      response = {
        intent,
        outcome: "executed",
        reply: "Modalità studio disattivata."
      };
      break;
    }
    case "history": {
      const history = commandHistoryStore.list(5);
      const formatted =
        history.length === 0
          ? "Nessun comando registrato."
          : history.map((entry) => `- ${entry.input} (${entry.outcome})`).join("\n");
      response = {
        intent,
        outcome: "executed",
        reply: `Cronologia recente:\n${formatted}`
      };
      break;
    }
    case "open_app": {
      const appName = extractAppName(input.text);
      if (!appName) {
        response = {
          intent,
          outcome: "blocked",
          reply: "Specifica il nome app, ad esempio: Apri Chrome."
        };
        historyOutcome = "blocked";
        break;
      }
      const launchResponse = openAppFromWhitelist(appName);
      historyOutcome = launchResponse.historyOutcome;
      if (launchResponse.outcome === "executed" && launchResponse.app) {
        structuredMemoryStore.trackAppUsage(
          launchResponse.app.id,
          launchResponse.app.displayName
        );
      }
      response = {
        intent: launchResponse.intent,
        outcome: launchResponse.outcome,
        reply: launchResponse.reply,
        metadata: launchResponse.metadata
      };
      break;
    }
    default: {
      response = {
        intent: "unknown",
        outcome: "blocked",
        reply: "Comando non riconosciuto. Scrivi Aiuto per vedere le opzioni."
      };
      historyOutcome = "blocked";
      break;
    }
  }

  response = {
    ...response,
    reply: applyPersonality(response.reply)
  };

  saveHistory(input, intent, historyOutcome);
  return response;
}

export const assistantEngine = {
  classifyIntent,
  processAssistantCommand
};
