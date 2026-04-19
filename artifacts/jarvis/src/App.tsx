import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "./lib/api";

type AssistantOutcome = "executed" | "blocked" | "not_found" | "error";
type AssistantStatus = "Idle" | "Listening" | "Thinking" | "Speaking" | "Executing";

type CommandResponse = {
  reply: string;
  intent: string;
  outcome: AssistantOutcome;
  metadata?: Record<string, unknown>;
};

type HistoryItem = {
  id: string;
  input: string;
  intent: string;
  outcome: string;
  source: "text" | "voice";
  timestamp: string;
};

type AllowedApp = {
  id: string;
  displayName: string;
  aliases: string[];
  executablePath: string;
};

type VoiceProfile = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

type PersonalityProfile = {
  style: "friendly" | "focused" | "professional";
  customSystemNote: string;
};

type AssistantSettings = {
  version: number;
  startWithWindows: boolean;
  startMinimizedToTray: boolean;
  pushToTalkHotkey: string;
  commandPaletteHotkey: string;
  voiceEnabled: boolean;
  onboardingCompleted: boolean;
  microphoneDeviceId: string | null;
  voiceProfile: VoiceProfile;
  personalityProfile: PersonalityProfile;
  allowedApps: AllowedApp[];
};

type StructuredMemory = {
  version: number;
  preferences: Record<string, string | number | boolean>;
  appUsage: Array<{
    appId: string;
    displayName: string;
    count: number;
    lastUsedAt: string;
  }>;
  contextData: Array<{
    id: string;
    key: string;
    value: string;
    updatedAt: string;
  }>;
};

type NoteItem = {
  id: string;
  text: string;
  createdAt: string;
};

type Reminder = {
  id: string;
  title: string;
  message: string;
  at: string;
  enabled: boolean;
  repeat: "none" | "daily" | "weekdays";
  action: {
    type: "none" | "open_app" | "command";
    target: string;
  };
  lastTriggeredAt: string | null;
};

type OnboardingStep = 0 | 1 | 2 | 3;

const defaultSettings: AssistantSettings = {
  version: 2,
  startWithWindows: false,
  startMinimizedToTray: true,
  pushToTalkHotkey: "CommandOrControl+Shift+Space",
  commandPaletteHotkey: "CommandOrControl+Shift+P",
  voiceEnabled: true,
  onboardingCompleted: false,
  microphoneDeviceId: null,
  voiceProfile: {
    voiceURI: null,
    rate: 1,
    pitch: 1,
    volume: 1
  },
  personalityProfile: {
    style: "friendly",
    customSystemNote: ""
  },
  allowedApps: []
};

const defaultStructuredMemory: StructuredMemory = {
  version: 1,
  preferences: {},
  appUsage: [],
  contextData: []
};

const quickSuggestions = [
  "apri chrome",
  "crea una nota: compra il pane",
  "che ore sono",
  "timer 25 minuti"
];

function speakWithProfile(
  text: string,
  profile: VoiceProfile,
  voices: SpeechSynthesisVoice[]
): Promise<void> {
  return new Promise((resolve) => {
    const synth = window.speechSynthesis;
    if (!synth) {
      resolve();
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "it-IT";
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = profile.volume;

    const selectedVoice =
      (profile.voiceURI && voices.find((voice) => voice.voiceURI === profile.voiceURI)) ||
      voices[0];
    if (selectedVoice) {
      utterance.voice = selectedVoice;
      utterance.lang = selectedVoice.lang;
    }

    utterance.onend = () => resolve();
    utterance.onerror = () => resolve();
    synth.speak(utterance);
  });
}

function downsampleTo16kHz(input: Float32Array, inputSampleRate: number): Int16Array {
  const targetRate = 16000;
  if (inputSampleRate === targetRate) {
    const direct = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      direct[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return direct;
  }

  const ratio = inputSampleRate / targetRate;
  const outputLength = Math.max(1, Math.round(input.length / ratio));
  const result = new Int16Array(outputLength);
  let outputIndex = 0;
  let inputIndex = 0;

  while (outputIndex < outputLength) {
    const nextInputIndex = Math.round((outputIndex + 1) * ratio);
    let sum = 0;
    let count = 0;
    for (let index = inputIndex; index < nextInputIndex && index < input.length; index += 1) {
      sum += input[index];
      count += 1;
    }

    const sample = count > 0 ? sum / count : 0;
    const clamped = Math.max(-1, Math.min(1, sample));
    result[outputIndex] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    outputIndex += 1;
    inputIndex = nextInputIndex;
  }

  return result;
}

function toDatetimeLocalValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function addMinutes(date: Date, minutes: number): Date {
  return new Date(date.getTime() + minutes * 60_000);
}

export function App() {
  const isOverlayMode = useMemo(
    () => new URLSearchParams(window.location.search).get("overlay") === "1",
    []
  );

  const [status, setStatus] = useState<AssistantStatus>("Idle");
  const [command, setCommand] = useState("");
  const [reply, setReply] = useState("Pronto. Scrivi o parla per iniziare.");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [settings, setSettings] = useState<AssistantSettings>(defaultSettings);
  const [structuredMemory, setStructuredMemory] = useState<StructuredMemory>(
    defaultStructuredMemory
  );
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [listening, setListening] = useState(false);
  const [saving, setSaving] = useState(false);
  const [italianVoices, setItalianVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(0);

  const [appForm, setAppForm] = useState({
    displayName: "",
    aliases: "",
    executablePath: ""
  });

  const [prefForm, setPrefForm] = useState({
    key: "",
    value: "",
    valueType: "string" as "string" | "number" | "boolean"
  });

  const [contextForm, setContextForm] = useState({
    key: "",
    value: ""
  });

  const [reminderForm, setReminderForm] = useState({
    id: "",
    title: "",
    message: "",
    at: toDatetimeLocalValue(addMinutes(new Date(), 30)),
    repeat: "none" as "none" | "daily" | "weekdays",
    actionType: "none" as "none" | "open_app" | "command",
    actionTarget: ""
  });

  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const statusClass = useMemo(() => {
    return `status status-${status.toLowerCase()}`;
  }, [status]);

  const speakAssistant = useCallback(
    async (text: string) => {
      if (!settings.voiceEnabled) {
        return;
      }
      setStatus("Speaking");
      await speakWithProfile(text, settings.voiceProfile, italianVoices);
      setStatus("Idle");
    },
    [italianVoices, settings.voiceEnabled, settings.voiceProfile]
  );

  const loadVoices = useCallback(() => {
    const allVoices = window.speechSynthesis?.getVoices() ?? [];
    const filtered = allVoices.filter((voice) => voice.lang.toLowerCase().startsWith("it"));
    setItalianVoices(filtered);
  }, []);

  const loadMicrophones = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      setMicrophones(devices.filter((device) => device.kind === "audioinput"));
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Permesso microfono negato.");
    }
  }, []);

  const refreshHistory = useCallback(async () => {
    const data = await apiRequest<{ items: HistoryItem[] }>("/api/assistant/history");
    setHistory(data.items);
  }, []);

  const refreshSettings = useCallback(async () => {
    const next = await apiRequest<AssistantSettings>("/api/settings");
    setSettings(next);
  }, []);

  const refreshStructuredMemory = useCallback(async () => {
    const next = await apiRequest<StructuredMemory>("/api/memory/structured");
    setStructuredMemory(next);
  }, []);

  const refreshNotes = useCallback(async () => {
    const next = await apiRequest<{ items: NoteItem[] }>("/api/notes");
    setNotes(next.items);
  }, []);

  const refreshReminders = useCallback(async () => {
    if (!window.desktop?.scheduler) {
      setReminders([]);
      return;
    }
    const next = await window.desktop.scheduler.list();
    setReminders(next as Reminder[]);
  }, []);

  const createTimerReminder = useCallback(async (minutes: number) => {
    if (!window.desktop?.scheduler) {
      return false;
    }
    const now = new Date();
    const at = addMinutes(now, minutes).toISOString();
    await window.desktop.scheduler.upsert({
      title: `Timer ${minutes} minuti`,
      message: `Il timer da ${minutes} minuti è terminato.`,
      at,
      enabled: true,
      repeat: "none",
      action: { type: "none", target: "" }
    });
    await refreshReminders();
    return true;
  }, [refreshReminders]);

  const submitCommand = useCallback(
    async (text: string, source: "text" | "voice") => {
      const clean = text.trim();
      if (!clean) {
        return;
      }

      const timerMatch = clean.match(/^timer\s+(\d+)\s*(minuti|min|minutes?)$/i);
      if (timerMatch) {
        const minutes = Number(timerMatch[1]);
        if (minutes > 0) {
          const created = await createTimerReminder(minutes);
          if (created) {
            const timerReply = `Timer creato: ti avviserò tra ${minutes} minuti.`;
            setReply(timerReply);
            await speakAssistant(timerReply);
            return;
          }
        }
      }

      setStatus("Thinking");
      const payload = await apiRequest<CommandResponse>("/api/assistant/command", {
        method: "POST",
        body: JSON.stringify({ text: clean, source })
      });
      setReply(payload.reply);
      await Promise.all([refreshHistory(), refreshStructuredMemory()]);

      if (payload.intent === "open_app") {
        if (payload.outcome === "executed") {
          await window.desktop?.notify.show({
            title: "Luffy",
            body: "Azione confermata: apertura app avviata."
          });
        } else if (payload.outcome === "error") {
          await window.desktop?.notify.show({
            title: "Luffy",
            body: "Errore importante: non sono riuscito ad aprire l'app."
          });
        }
      }

      await speakAssistant(payload.reply);
      setStatus("Idle");
    },
    [createTimerReminder, refreshHistory, refreshStructuredMemory, speakAssistant]
  );

  const stopAudioCapture = useCallback(async () => {
    if (processorRef.current) {
      processorRef.current.onaudioprocess = null;
      processorRef.current.disconnect();
      processorRef.current = null;
    }
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }
  }, []);

  const startAudioCapture = useCallback(async () => {
    const desktop = window.desktop;
    if (!desktop) {
      throw new Error("Desktop bridge non disponibile.");
    }

    const audioConstraints: MediaTrackConstraints | boolean = settings.microphoneDeviceId
      ? { deviceId: { exact: settings.microphoneDeviceId } }
      : true;

    const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const processor = context.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (event) => {
      const data = event.inputBuffer.getChannelData(0);
      const pcm16 = downsampleTo16kHz(data, context.sampleRate);
      desktop.voice.pushChunk(new Uint8Array(pcm16.buffer));
    };

    source.connect(processor);
    processor.connect(context.destination);

    mediaStreamRef.current = stream;
    audioContextRef.current = context;
    sourceNodeRef.current = source;
    processorRef.current = processor;
  }, [settings.microphoneDeviceId]);

  const stopListeningSession = useCallback(async () => {
    await stopAudioCapture();
    if (window.desktop) {
      await window.desktop.voice.stop();
    }
    setListening(false);
    setStatus("Idle");
  }, [stopAudioCapture]);

  const startListeningSession = useCallback(async () => {
    const desktop = window.desktop;
    if (!desktop) {
      setReply("La funzione voce è disponibile solo nella desktop app.");
      return;
    }
    try {
      await desktop.voice.start();
      await startAudioCapture();
      setListening(true);
      setStatus("Listening");
    } catch (error) {
      await stopAudioCapture();
      await desktop.voice.stop();
      setReply(error instanceof Error ? error.message : "Errore avvio microfono.");
      setListening(false);
      setStatus("Idle");
      await desktop.notify.show({
        title: "Luffy",
        body: "Errore importante: microfono non disponibile."
      });
    }
  }, [startAudioCapture, stopAudioCapture]);

  const saveGeneralSettings = useCallback(async () => {
    setSaving(true);
    try {
      const next = await apiRequest<AssistantSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          startWithWindows: settings.startWithWindows,
          startMinimizedToTray: settings.startMinimizedToTray,
          pushToTalkHotkey: settings.pushToTalkHotkey,
          commandPaletteHotkey: settings.commandPaletteHotkey,
          voiceEnabled: settings.voiceEnabled,
          onboardingCompleted: settings.onboardingCompleted,
          microphoneDeviceId: settings.microphoneDeviceId,
          voiceProfile: settings.voiceProfile,
          personalityProfile: settings.personalityProfile
        })
      });
      setSettings(next);
      if (window.desktop) {
        await window.desktop.settings.sync({
          startWithWindows: next.startWithWindows,
          startMinimizedToTray: next.startMinimizedToTray,
          pushToTalkHotkey: next.pushToTalkHotkey,
          commandPaletteHotkey: next.commandPaletteHotkey,
          voiceEnabled: next.voiceEnabled,
          onboardingCompleted: next.onboardingCompleted
        });
      }
      setReply("Impostazioni salvate.");
    } catch (error) {
      setReply(error instanceof Error ? error.message : "Errore salvataggio.");
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const completeOnboarding = useCallback(
    async (markCompleted: boolean) => {
      const nextSettings = {
        ...settings,
        onboardingCompleted: markCompleted
      };
      setSettings(nextSettings);
      setOnboardingOpen(false);
      setOnboardingStep(0);
      const persisted = await apiRequest<AssistantSettings>("/api/settings", {
        method: "PATCH",
        body: JSON.stringify(nextSettings)
      });
      setSettings(persisted);
      await window.desktop?.settings.sync({
        startWithWindows: persisted.startWithWindows,
        startMinimizedToTray: persisted.startMinimizedToTray,
        pushToTalkHotkey: persisted.pushToTalkHotkey,
        commandPaletteHotkey: persisted.commandPaletteHotkey,
        voiceEnabled: persisted.voiceEnabled,
        onboardingCompleted: persisted.onboardingCompleted
      });
    },
    [settings]
  );

  const addAllowedApp = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      await apiRequest<AssistantSettings>("/api/settings/allowed-apps", {
        method: "POST",
        body: JSON.stringify({
          displayName: appForm.displayName,
          aliases: appForm.aliases
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean),
          executablePath: appForm.executablePath
        })
      });
      setAppForm({ displayName: "", aliases: "", executablePath: "" });
      await refreshSettings();
    },
    [appForm, refreshSettings]
  );

  const removeAllowedApp = useCallback(
    async (appId: string) => {
      await apiRequest<AssistantSettings>(`/api/settings/allowed-apps/${appId}`, {
        method: "DELETE"
      });
      await refreshSettings();
    },
    [refreshSettings]
  );

  const testLaunchAllowedApp = useCallback(async (appId: string) => {
    const response = await apiRequest<{ ok: boolean; reason?: string }>(
      `/api/settings/allowed-apps/${appId}/test-launch`,
      { method: "POST" }
    );
    setReply(
      response.ok
        ? "Launch test inviato."
        : `Launch fallito: ${response.reason ?? "errore sconosciuto"}`
    );
  }, []);

  const savePreference = useCallback(async () => {
    if (!prefForm.key.trim() || !prefForm.value.trim()) {
      return;
    }
    let value: string | number | boolean = prefForm.value.trim();
    if (prefForm.valueType === "number") {
      value = Number(prefForm.value);
    } else if (prefForm.valueType === "boolean") {
      value = prefForm.value.toLowerCase() === "true";
    }
    await apiRequest<StructuredMemory>("/api/memory/structured/preferences", {
      method: "POST",
      body: JSON.stringify({
        key: prefForm.key.trim(),
        value
      })
    });
    setPrefForm({ key: "", value: "", valueType: "string" });
    await refreshStructuredMemory();
  }, [prefForm, refreshStructuredMemory]);

  const removePreference = useCallback(
    async (key: string) => {
      await apiRequest<StructuredMemory>(
        `/api/memory/structured/preferences/${encodeURIComponent(key)}`,
        { method: "DELETE" }
      );
      await refreshStructuredMemory();
    },
    [refreshStructuredMemory]
  );

  const saveContextItem = useCallback(async () => {
    if (!contextForm.key.trim() || !contextForm.value.trim()) {
      return;
    }
    await apiRequest<StructuredMemory>("/api/memory/structured/context", {
      method: "POST",
      body: JSON.stringify({
        key: contextForm.key.trim(),
        value: contextForm.value.trim()
      })
    });
    setContextForm({ key: "", value: "" });
    await refreshStructuredMemory();
  }, [contextForm, refreshStructuredMemory]);

  const removeContextItem = useCallback(
    async (id: string) => {
      await apiRequest<StructuredMemory>(`/api/memory/structured/context/${id}`, {
        method: "DELETE"
      });
      await refreshStructuredMemory();
    },
    [refreshStructuredMemory]
  );

  const upsertReminder = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!window.desktop?.scheduler) {
        setReply("Scheduler disponibile solo nella desktop app.");
        return;
      }
      await window.desktop.scheduler.upsert({
        id: reminderForm.id || undefined,
        title: reminderForm.title || "Promemoria Luffy",
        message: reminderForm.message,
        at: new Date(reminderForm.at).toISOString(),
        enabled: true,
        repeat: reminderForm.repeat,
        action: {
          type: reminderForm.actionType,
          target: reminderForm.actionTarget
        }
      });
      setReminderForm({
        id: "",
        title: "",
        message: "",
        at: toDatetimeLocalValue(addMinutes(new Date(), 30)),
        repeat: "none",
        actionType: "none",
        actionTarget: ""
      });
      await refreshReminders();
    },
    [refreshReminders, reminderForm]
  );

  const removeReminder = useCallback(
    async (id: string) => {
      if (!window.desktop?.scheduler) {
        return;
      }
      await window.desktop.scheduler.remove(id);
      await refreshReminders();
    },
    [refreshReminders]
  );

  const runReminderNow = useCallback(
    async (id: string) => {
      if (!window.desktop?.scheduler) {
        return;
      }
      await window.desktop.scheduler.runNow(id);
      await refreshReminders();
    },
    [refreshReminders]
  );

  useEffect(() => {
    const synth = window.speechSynthesis;
    loadVoices();
    if (synth) {
      synth.onvoiceschanged = loadVoices;
    }
    return () => {
      if (synth) {
        synth.onvoiceschanged = null;
      }
    };
  }, [loadVoices]);

  useEffect(() => {
    void Promise.all([
      refreshHistory(),
      refreshSettings(),
      refreshStructuredMemory(),
      refreshNotes(),
      refreshReminders(),
      loadMicrophones()
    ]);
  }, [
    loadMicrophones,
    refreshHistory,
    refreshNotes,
    refreshReminders,
    refreshSettings,
    refreshStructuredMemory
  ]);

  useEffect(() => {
    if (isOverlayMode) {
      return;
    }
    if (!settings.onboardingCompleted) {
      setOnboardingOpen(true);
    }
  }, [isOverlayMode, settings.onboardingCompleted]);

  useEffect(() => {
    if (!settings.voiceProfile.voiceURI && italianVoices.length > 0) {
      const defaultItalianVoice = italianVoices[0];
      setSettings((prev) => ({
        ...prev,
        voiceProfile: {
          ...prev.voiceProfile,
          voiceURI: defaultItalianVoice.voiceURI
        }
      }));
    }
  }, [italianVoices, settings.voiceProfile.voiceURI]);

  useEffect(() => {
    const desktop = window.desktop;
    if (!desktop) {
      return;
    }

    const offResult = desktop.voice.onResult((payload) => {
      setCommand(payload.text);
      void (async () => {
        await stopListeningSession();
        await submitCommand(payload.text, "voice");
      })();
    });

    const offError = desktop.voice.onError((payload) => {
      setReply(`Errore voce (${payload.code}): ${payload.message}`);
      void stopListeningSession();
    });

    const offHotkey = desktop.hotkey.onPushToTalk(() => {
      void (listening ? stopListeningSession() : startListeningSession());
    });

    const offReminder = desktop.scheduler.onTriggered((payload) => {
      setReply(`Reminder: ${payload.title}`);
      void refreshReminders();
    });

    return () => {
      offResult();
      offError();
      offHotkey();
      offReminder();
    };
  }, [
    listening,
    refreshReminders,
    startListeningSession,
    stopListeningSession,
    submitCommand
  ]);

  useEffect(() => {
    return () => {
      void stopAudioCapture();
    };
  }, [stopAudioCapture]);

  useEffect(() => {
    if (!isOverlayMode) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void window.desktop?.overlay.hide();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOverlayMode]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const value = command.trim();
    setCommand("");
    await submitCommand(value, "text");
    if (isOverlayMode) {
      await window.desktop?.overlay.hide();
    }
  };

  const toggleListening = async () => {
    if (listening) {
      await stopListeningSession();
      return;
    }
    await startListeningSession();
  };

  if (isOverlayMode) {
    return (
      <div className="overlay-shell">
        <form onSubmit={onSubmit} className="overlay-form">
          <input
            autoFocus
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Comando rapido: apri chrome, crea nota, timer 25 minuti..."
          />
        </form>
        <div className="overlay-suggestions">
          {quickSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => {
                setCommand(suggestion);
                void submitCommand(suggestion, "text");
                void window.desktop?.overlay.hide();
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="layout">
      <section className="panel">
        <h2>Luffy Assistant</h2>
        <div className={statusClass}>
          <span className="status-indicator" />
          Stato: {status}
        </div>

        <form className="cmd-row" onSubmit={onSubmit}>
          <textarea
            rows={3}
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Scrivi un comando: Apri Chrome, Salva nota: ..., Che ora è?"
          />
          <div className="row">
            <button type="submit">Invia comando</button>
            <button className="secondary" onClick={toggleListening} type="button">
              {listening ? "Stop microfono" : "Push-to-talk"}
            </button>
          </div>
        </form>
        <p className="hint">
          Hotkey voce: {settings.pushToTalkHotkey} | Palette: {settings.commandPaletteHotkey}
        </p>

        <div className="reply-box">{reply}</div>

        <h3>Cronologia</h3>
        <ul className="history-list">
          {history.map((entry) => (
            <li key={entry.id}>
              [{entry.source}] {entry.input} {"->"} {entry.outcome}
            </li>
          ))}
        </ul>

        <h3>Reminder Scheduler</h3>
        <form onSubmit={upsertReminder}>
          <div>
            <label>Titolo</label>
            <input
              value={reminderForm.title}
              onChange={(event) =>
                setReminderForm((prev) => ({ ...prev, title: event.target.value }))
              }
              placeholder="Sessione studio"
            />
          </div>
          <div>
            <label>Messaggio</label>
            <input
              value={reminderForm.message}
              onChange={(event) =>
                setReminderForm((prev) => ({ ...prev, message: event.target.value }))
              }
              placeholder="È ora della pausa."
            />
          </div>
          <div className="row">
            <input
              type="datetime-local"
              value={reminderForm.at}
              onChange={(event) =>
                setReminderForm((prev) => ({ ...prev, at: event.target.value }))
              }
            />
            <select
              value={reminderForm.repeat}
              onChange={(event) =>
                setReminderForm((prev) => ({
                  ...prev,
                  repeat: event.target.value as "none" | "daily" | "weekdays"
                }))
              }
            >
              <option value="none">Una volta</option>
              <option value="daily">Ogni giorno</option>
              <option value="weekdays">Solo feriali</option>
            </select>
          </div>
          <div className="row">
            <select
              value={reminderForm.actionType}
              onChange={(event) =>
                setReminderForm((prev) => ({
                  ...prev,
                  actionType: event.target.value as "none" | "open_app" | "command"
                }))
              }
            >
              <option value="none">Nessuna azione</option>
              <option value="open_app">Apri app whitelist</option>
              <option value="command">Esegui comando</option>
            </select>
            <input
              value={reminderForm.actionTarget}
              onChange={(event) =>
                setReminderForm((prev) => ({ ...prev, actionTarget: event.target.value }))
              }
              placeholder="appId o testo comando"
            />
          </div>
          <button type="submit">Salva reminder</button>
        </form>
        <div className="reminders-list">
          {reminders.map((reminder) => (
            <div key={reminder.id} className="allowed-item">
              <strong>{reminder.title}</strong>
              <div className="hint">
                {new Date(reminder.at).toLocaleString("it-IT")} | repeat: {reminder.repeat}
              </div>
              <div className="row">
                <button type="button" className="secondary" onClick={() => runReminderNow(reminder.id)}>
                  Esegui ora
                </button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => removeReminder(reminder.id)}
                >
                  Elimina
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Impostazioni</h2>
        <div className="subpanel">
          <h3>Desktop</h3>
          <label>
            <input
              type="checkbox"
              checked={settings.startWithWindows}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  startWithWindows: event.target.checked
                }))
              }
            />{" "}
            Avvia con Windows
          </label>
          <label>
            <input
              type="checkbox"
              checked={settings.startMinimizedToTray}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  startMinimizedToTray: event.target.checked
                }))
              }
            />{" "}
            Avvio silenzioso in tray
          </label>
          <div>
            <label>Hotkey push-to-talk</label>
            <input
              value={settings.pushToTalkHotkey}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  pushToTalkHotkey: event.target.value
                }))
              }
            />
          </div>
          <div>
            <label>Hotkey command palette</label>
            <input
              value={settings.commandPaletteHotkey}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  commandPaletteHotkey: event.target.value
                }))
              }
            />
          </div>
        </div>

        <div className="subpanel">
          <h3>Voce (TTS)</h3>
          <p className="hint">
            TTS e personalità sono separati: qui regoli solo la resa vocale.
          </p>
          <label>
            <input
              type="checkbox"
              checked={settings.voiceEnabled}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  voiceEnabled: event.target.checked
                }))
              }
            />{" "}
            Voce attiva
          </label>
          <div>
            <label>Voce italiana</label>
            <select
              value={settings.voiceProfile.voiceURI ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  voiceProfile: {
                    ...prev.voiceProfile,
                    voiceURI: event.target.value || null
                  }
                }))
              }
            >
              {italianVoices.map((voice) => (
                <option key={voice.voiceURI} value={voice.voiceURI}>
                  {voice.name} ({voice.lang})
                </option>
              ))}
            </select>
          </div>
          <div>
            <label>Velocità: {settings.voiceProfile.rate.toFixed(2)}</label>
            <input
              type="range"
              min={0.5}
              max={1.7}
              step={0.05}
              value={settings.voiceProfile.rate}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  voiceProfile: {
                    ...prev.voiceProfile,
                    rate: Number(event.target.value)
                  }
                }))
              }
            />
          </div>
          <div>
            <label>Tono: {settings.voiceProfile.pitch.toFixed(2)}</label>
            <input
              type="range"
              min={0.5}
              max={1.7}
              step={0.05}
              value={settings.voiceProfile.pitch}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  voiceProfile: {
                    ...prev.voiceProfile,
                    pitch: Number(event.target.value)
                  }
                }))
              }
            />
          </div>
          <div>
            <label>Volume: {settings.voiceProfile.volume.toFixed(2)}</label>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={settings.voiceProfile.volume}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  voiceProfile: {
                    ...prev.voiceProfile,
                    volume: Number(event.target.value)
                  }
                }))
              }
            />
          </div>
          <button
            type="button"
            className="secondary"
            onClick={() =>
              void speakWithProfile(
                "Ciao, sono Luffy. Questa è la tua anteprima voce.",
                settings.voiceProfile,
                italianVoices
              )
            }
          >
            Anteprima voce
          </button>
        </div>

        <div className="subpanel">
          <h3>Personalità assistant</h3>
          <p className="hint">Questa sezione cambia tono/comportamento testuale, non la voce.</p>
          <select
            value={settings.personalityProfile.style}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                personalityProfile: {
                  ...prev.personalityProfile,
                  style: event.target.value as "friendly" | "focused" | "professional"
                }
              }))
            }
          >
            <option value="friendly">Calda e amichevole</option>
            <option value="focused">Diretta e breve</option>
            <option value="professional">Professionale</option>
          </select>
          <textarea
            rows={2}
            value={settings.personalityProfile.customSystemNote}
            onChange={(event) =>
              setSettings((prev) => ({
                ...prev,
                personalityProfile: {
                  ...prev.personalityProfile,
                  customSystemNote: event.target.value
                }
              }))
            }
            placeholder="Nota personalità opzionale (es. tono più motivazionale)."
          />
        </div>

        <div className="subpanel">
          <h3>Microfono</h3>
          <div className="row">
            <select
              value={settings.microphoneDeviceId ?? ""}
              onChange={(event) =>
                setSettings((prev) => ({
                  ...prev,
                  microphoneDeviceId: event.target.value || null
                }))
              }
            >
              <option value="">Predefinito di sistema</option>
              {microphones.map((device) => (
                <option key={device.deviceId} value={device.deviceId}>
                  {device.label || `Microfono ${device.deviceId.slice(0, 6)}`}
                </option>
              ))}
            </select>
            <button type="button" className="secondary" onClick={() => void loadMicrophones()}>
              Aggiorna lista
            </button>
          </div>
          <button type="button" className="secondary" onClick={() => void startListeningSession()}>
            Test audio
          </button>
        </div>

        <div className="subpanel">
          <h3>App autorizzate</h3>
          <form onSubmit={addAllowedApp}>
            <input
              value={appForm.displayName}
              onChange={(event) =>
                setAppForm((prev) => ({ ...prev, displayName: event.target.value }))
              }
              placeholder="Google Chrome"
              required
            />
            <input
              value={appForm.aliases}
              onChange={(event) =>
                setAppForm((prev) => ({ ...prev, aliases: event.target.value }))
              }
              placeholder="chrome, google chrome"
            />
            <input
              value={appForm.executablePath}
              onChange={(event) =>
                setAppForm((prev) => ({ ...prev, executablePath: event.target.value }))
              }
              placeholder="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"
              required
            />
            <button type="submit">Aggiungi whitelist</button>
          </form>
          {settings.allowedApps.map((appEntry) => (
            <div className="allowed-item" key={appEntry.id}>
              <strong>{appEntry.displayName}</strong>
              <div className="hint">{appEntry.executablePath}</div>
              <div className="row">
                <button
                  className="secondary"
                  type="button"
                  onClick={() => testLaunchAllowedApp(appEntry.id)}
                >
                  Test launch
                </button>
                <button
                  className="secondary"
                  type="button"
                  onClick={() => removeAllowedApp(appEntry.id)}
                >
                  Rimuovi
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="subpanel">
          <h3>Memoria strutturata</h3>
          <div className="memory-grid">
            <div>
              <h4>Preferenze</h4>
              <div className="row">
                <input
                  value={prefForm.key}
                  onChange={(event) =>
                    setPrefForm((prev) => ({ ...prev, key: event.target.value }))
                  }
                  placeholder="chiave"
                />
                <select
                  value={prefForm.valueType}
                  onChange={(event) =>
                    setPrefForm((prev) => ({
                      ...prev,
                      valueType: event.target.value as "string" | "number" | "boolean"
                    }))
                  }
                >
                  <option value="string">String</option>
                  <option value="number">Number</option>
                  <option value="boolean">Boolean</option>
                </select>
              </div>
              <input
                value={prefForm.value}
                onChange={(event) =>
                  setPrefForm((prev) => ({ ...prev, value: event.target.value }))
                }
                placeholder="valore"
              />
              <button type="button" className="secondary" onClick={() => void savePreference()}>
                Salva preferenza
              </button>
              <ul className="memory-list">
                {Object.entries(structuredMemory.preferences).map(([key, value]) => (
                  <li key={key}>
                    {key}: {String(value)}
                    <button type="button" onClick={() => void removePreference(key)}>
                      x
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h4>Contesto</h4>
              <input
                value={contextForm.key}
                onChange={(event) =>
                  setContextForm((prev) => ({ ...prev, key: event.target.value }))
                }
                placeholder="es. progetto attuale"
              />
              <input
                value={contextForm.value}
                onChange={(event) =>
                  setContextForm((prev) => ({ ...prev, value: event.target.value }))
                }
                placeholder="valore contesto"
              />
              <button type="button" className="secondary" onClick={() => void saveContextItem()}>
                Salva contesto
              </button>
              <ul className="memory-list">
                {structuredMemory.contextData.map((entry) => (
                  <li key={entry.id}>
                    {entry.key}: {entry.value}
                    <button type="button" onClick={() => void removeContextItem(entry.id)}>
                      x
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <h4>App frequenti</h4>
          <ul className="memory-list">
            {structuredMemory.appUsage.map((entry) => (
              <li key={entry.appId}>
                {entry.displayName}: {entry.count} utilizzi
              </li>
            ))}
          </ul>

          <h4>Note</h4>
          <ul className="memory-list">
            {notes.map((note) => (
              <li key={note.id}>{note.text}</li>
            ))}
          </ul>
        </div>

        <div className="row">
          <button disabled={saving} type="button" onClick={() => void saveGeneralSettings()}>
            {saving ? "Salvataggio..." : "Salva impostazioni"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setOnboardingOpen(true);
              setOnboardingStep(0);
            }}
          >
            Riapri onboarding
          </button>
        </div>
      </section>

      {onboardingOpen && (
        <div className="modal-backdrop">
          <div className="modal-card">
            <h2>Onboarding Luffy</h2>
            {onboardingStep === 0 && (
              <div>
                <p>
                  Ciao, sono Luffy. Posso aiutarti con comandi vocali, apertura app, note,
                  memoria e reminder.
                </p>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void speakWithProfile(
                      "Ciao, sono Luffy. Ti aiuto a partire in pochi passaggi.",
                      settings.voiceProfile,
                      italianVoices
                    )
                  }
                >
                  Ascolta introduzione
                </button>
              </div>
            )}
            {onboardingStep === 1 && (
              <div>
                <p>Feature principali:</p>
                <ul>
                  <li>comandi vocali e hotkey push-to-talk</li>
                  <li>apertura app autorizzate</li>
                  <li>memoria e note strutturate</li>
                  <li>scheduler locale con notifiche native Windows</li>
                </ul>
              </div>
            )}
            {onboardingStep === 2 && (
              <div>
                <p>Setup rapido</p>
                <div className="row">
                  <select
                    value={settings.microphoneDeviceId ?? ""}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        microphoneDeviceId: event.target.value || null
                      }))
                    }
                  >
                    <option value="">Microfono predefinito</option>
                    {microphones.map((device) => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Mic ${device.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="secondary" onClick={() => void loadMicrophones()}>
                    Aggiorna mic
                  </button>
                </div>
                <button type="button" className="secondary" onClick={() => void startListeningSession()}>
                  Test audio microfono
                </button>
                <select
                  value={settings.voiceProfile.voiceURI ?? ""}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      voiceProfile: {
                        ...prev.voiceProfile,
                        voiceURI: event.target.value || null
                      }
                    }))
                  }
                >
                  {italianVoices.map((voice) => (
                    <option key={voice.voiceURI} value={voice.voiceURI}>
                      {voice.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    void speakWithProfile(
                      "Questa è la tua anteprima durante l'onboarding.",
                      settings.voiceProfile,
                      italianVoices
                    )
                  }
                >
                  Test voce
                </button>
                <input
                  value={settings.pushToTalkHotkey}
                  onChange={(event) =>
                    setSettings((prev) => ({
                      ...prev,
                      pushToTalkHotkey: event.target.value
                    }))
                  }
                  placeholder="Hotkey push-to-talk"
                />
                <label>
                  <input
                    type="checkbox"
                    checked={settings.startWithWindows}
                    onChange={(event) =>
                      setSettings((prev) => ({
                        ...prev,
                        startWithWindows: event.target.checked
                      }))
                    }
                  />{" "}
                  Avvia con Windows
                </label>
                <p className="hint">Whitelist iniziale app</p>
                <input
                  value={appForm.displayName}
                  onChange={(event) =>
                    setAppForm((prev) => ({ ...prev, displayName: event.target.value }))
                  }
                  placeholder="Nome app (es. Chrome)"
                />
                <input
                  value={appForm.executablePath}
                  onChange={(event) =>
                    setAppForm((prev) => ({ ...prev, executablePath: event.target.value }))
                  }
                  placeholder="Percorso .exe"
                />
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      if (!appForm.displayName || !appForm.executablePath) {
                        return;
                      }
                      await apiRequest<AssistantSettings>("/api/settings/allowed-apps", {
                        method: "POST",
                        body: JSON.stringify({
                          displayName: appForm.displayName,
                          aliases: appForm.aliases
                            .split(",")
                            .map((entry) => entry.trim())
                            .filter(Boolean),
                          executablePath: appForm.executablePath
                        })
                      });
                      setAppForm({ displayName: "", aliases: "", executablePath: "" });
                      await refreshSettings();
                    })()
                  }
                >
                  Aggiungi app autorizzata
                </button>
              </div>
            )}
            {onboardingStep === 3 && (
              <div>
                <p>Demo finale: prova uno di questi comandi.</p>
                <div className="overlay-suggestions">
                  {quickSuggestions.slice(0, 3).map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        setCommand(item);
                        void submitCommand(item, "text");
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void completeOnboarding(true)}
              >
                Salta
              </button>
              <button
                type="button"
                className="secondary"
                disabled={onboardingStep === 0}
                onClick={() =>
                  setOnboardingStep((prev) => Math.max(0, prev - 1) as OnboardingStep)
                }
              >
                Indietro
              </button>
              {onboardingStep < 3 ? (
                <button
                  type="button"
                  onClick={() =>
                    setOnboardingStep((prev) => Math.min(3, prev + 1) as OnboardingStep)
                  }
                >
                  Avanti
                </button>
              ) : (
                <button type="button" onClick={() => void completeOnboarding(true)}>
                  Completa onboarding
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
