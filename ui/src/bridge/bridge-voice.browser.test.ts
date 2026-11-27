import { emit } from "@tauri-apps/api/event";
import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as bridge from "./index";

interface Call {
  readonly command: string;
  readonly args: unknown;
}

function recordCalls(answer: unknown = null): Call[] {
  const calls: Call[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return answer;
  });
  return calls;
}

afterEach(() => clearMocks());

describe("pont vers Rust : la saisie vocale (fiche 0103)", () => {
  it("lit l'état, choisit et prépare la langue", async () => {
    const calls = recordCalls(null);
    await bridge.voiceInputStatus();
    await bridge.chooseVoiceLanguage("en-US");
    await bridge.chooseVoiceLanguage(null);
    await bridge.prepareVoiceLanguage("en-US");
    expect(calls).toEqual([
      { command: "voice_input_status", args: {} },
      { command: "choose_voice_language", args: { language: "en-US" } },
      { command: "choose_voice_language", args: { language: null } },
      { command: "prepare_voice_language", args: { language: "en-US" } },
    ]);
  });

  it("démarre, arrête et ouvre les réglages de confidentialité de macOS", async () => {
    const calls = recordCalls(null);
    await bridge.startVoiceInput();
    await bridge.stopVoiceInput();
    await bridge.openVoicePrivacySettings();
    expect(calls).toEqual([
      { command: "start_voice_input", args: {} },
      { command: "stop_voice_input", args: {} },
      { command: "open_voice_privacy_settings", args: {} },
    ]);
  });

  it("transmet les événements de la saisie vocale sous le nom que Rust émet", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const heard: string[] = [];
    await bridge.onVoiceInputEvent((item) => heard.push(item.kind));
    await emit("voice-input-event", { kind: "provisional", text: "bon" });
    await emit("voice-input-event", { kind: "ended" });
    expect(heard).toEqual(["provisional", "ended"]);
  });
});
