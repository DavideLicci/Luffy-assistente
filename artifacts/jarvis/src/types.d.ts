export {};

declare global {
  interface Window {
    desktop?: {
      voice: {
        start: () => Promise<void>;
        stop: () => Promise<void>;
        pushChunk: (chunk: Uint8Array) => void;
        onResult: (
          handler: (payload: { text: string; confidence: number }) => void
        ) => () => void;
        onError: (
          handler: (payload: { code: string; message: string }) => void
        ) => () => void;
      };
      settings: {
        sync: (settings: {
          startWithWindows: boolean;
          startMinimizedToTray: boolean;
          pushToTalkHotkey: string;
          commandPaletteHotkey: string;
          voiceEnabled: boolean;
          onboardingCompleted: boolean;
        }) => Promise<{ ok: boolean; settings: unknown }>;
      };
      hotkey: {
        onPushToTalk: (handler: () => void) => () => void;
      };
      launcher: {
        open: (payload: { appId: string }) => Promise<{ ok: boolean; reason?: string }>;
      };
      notify: {
        show: (payload: {
          title?: string;
          body?: string;
          silent?: boolean;
        }) => Promise<{ ok: boolean }>;
      };
      overlay: {
        show: () => Promise<{ ok: boolean }>;
        hide: () => Promise<{ ok: boolean }>;
      };
      scheduler: {
        list: () => Promise<
          Array<{
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
          }>
        >;
        upsert: (payload: unknown) => Promise<unknown>;
        remove: (id: string) => Promise<unknown>;
        runNow: (id: string) => Promise<{ ok: boolean }>;
        onTriggered: (
          handler: (payload: {
            id: string;
            title: string;
            message: string;
          }) => void
        ) => () => void;
      };
    };
  }
}
