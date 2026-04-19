const fs = require("node:fs");
const path = require("node:path");
const { EventEmitter } = require("node:events");

class VoskVoiceService extends EventEmitter {
  constructor({ modelPath }) {
    super();
    this.modelPath = modelPath;
    this.model = null;
    this.recognizer = null;
    this.started = false;
    this.vosk = null;
    this.lastEmittedText = "";
  }

  async start() {
    if (this.started) {
      return;
    }

    try {
      this.vosk = require("vosk");
    } catch (error) {
      this.emit("error", {
        code: "VOSK_LOAD_ERROR",
        message:
          (error instanceof Error ? error.message : "Impossibile caricare Vosk.") +
          " Installa Visual Studio con Desktop development with C++ e reinstalla `desktop`."
      });
      return;
    }

    if (!fs.existsSync(this.modelPath)) {
      this.emit("error", {
        code: "MODEL_NOT_FOUND",
        message:
          `Modello Vosk non trovato in ${this.modelPath}. ` +
          "Scarica `vosk-model-small-it-0.22` e imposta VOSK_MODEL_PATH."
      });
      return;
    }

    try {
      this.vosk.setLogLevel(0);
      if (!this.model) {
        this.model = new this.vosk.Model(this.modelPath);
      }
      this.recognizer = new this.vosk.Recognizer({
        model: this.model,
        sampleRate: 16000
      });
      this.started = true;
    } catch (error) {
      this.emit("error", {
        code: "VOICE_START_ERROR",
        message: error instanceof Error ? error.message : "Errore avvio riconoscimento."
      });
      this.stop();
    }
  }

  processChunk(bufferLike) {
    if (!this.started || !this.recognizer) {
      return;
    }
    const chunk = Buffer.isBuffer(bufferLike)
      ? bufferLike
      : Buffer.from(bufferLike ?? []);

    if (chunk.length === 0) {
      return;
    }

    try {
      const accepted = this.recognizer.acceptWaveform(chunk);
      if (accepted) {
        const result = this.recognizer.result();
        const text = String(result.text || "").trim();
        if (text) {
          this.lastEmittedText = text;
          this.emit("result", {
            text,
            confidence: Number(result.confidence || 0)
          });
        }
      }
    } catch (error) {
      this.emit("error", {
        code: "VOICE_CHUNK_ERROR",
        message: error instanceof Error ? error.message : "Errore elaborazione audio."
      });
    }
  }

  stop() {
    if (this.recognizer) {
      try {
        const final = this.recognizer.finalResult();
        const text = String(final.text || "").trim();
        if (text && text !== this.lastEmittedText) {
          this.lastEmittedText = text;
          this.emit("result", {
            text,
            confidence: Number(final.confidence || 0)
          });
        }
      } catch {
        // no-op
      }
      this.recognizer.free();
      this.recognizer = null;
    }
    this.started = false;
    this.lastEmittedText = "";
  }

  dispose() {
    this.stop();
    if (this.model) {
      this.model.free();
      this.model = null;
    }
  }
}

function defaultModelPath() {
  if (process.env.VOSK_MODEL_PATH) {
    return path.resolve(process.env.VOSK_MODEL_PATH);
  }
  const home = process.env.USERPROFILE || process.env.HOME || ".";
  return path.join(home, ".luffy-assistant", "models", "vosk-model-small-it-0.22");
}

module.exports = {
  VoskVoiceService,
  defaultModelPath
};
