export type AllowedApp = {
  id: string;
  displayName: string;
  aliases: string[];
  executablePath: string;
};

export type AssistantVoiceProfile = {
  voiceURI: string | null;
  rate: number;
  pitch: number;
  volume: number;
};

export type AssistantPersonalityProfile = {
  style: "friendly" | "focused" | "professional";
  customSystemNote: string;
};

export type AssistantSettings = {
  version: number;
  startWithWindows: boolean;
  startMinimizedToTray: boolean;
  pushToTalkHotkey: string;
  commandPaletteHotkey: string;
  voiceEnabled: boolean;
  onboardingCompleted: boolean;
  microphoneDeviceId: string | null;
  voiceProfile: AssistantVoiceProfile;
  personalityProfile: AssistantPersonalityProfile;
  allowedApps: AllowedApp[];
};

export const SETTINGS_VERSION = 2;

export const DEFAULT_SETTINGS: AssistantSettings = {
  version: SETTINGS_VERSION,
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
