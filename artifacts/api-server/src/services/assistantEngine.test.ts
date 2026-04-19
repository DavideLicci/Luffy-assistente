import assert from "node:assert/strict";
import test from "node:test";

import { assistantEngine } from "./assistantEngine.js";

test("classify open app intent in italian", () => {
  assert.equal(assistantEngine.classifyIntent("Apri Chrome"), "open_app");
});

test("classify time intent", () => {
  assert.equal(assistantEngine.classifyIntent("Che ora è?"), "time");
});

test("returns blocked when app is not in whitelist", () => {
  const output = assistantEngine.processAssistantCommand({
    text: "Apri AppCheNonEsiste",
    source: "text"
  });
  assert.equal(output.intent, "open_app");
  assert.equal(output.outcome, "blocked");
});
