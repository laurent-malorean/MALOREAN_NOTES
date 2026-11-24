import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { afterEach, describe, expect, it } from "vitest";
import * as bridge from "./index";

interface Call {
  readonly command: string;
  readonly args: unknown;
}

function recordCalls(): Call[] {
  const calls: Call[] = [];
  mockIPC((command, args) => {
    calls.push({ command, args });
    return null;
  });
  return calls;
}

afterEach(() => clearMocks());

describe("pont vers Rust : image d'une carte", () => {
  it("envoie l'image en base64 dans des arguments JSON, destination comprise", async () => {
    const calls = recordCalls();
    await bridge.exportImage("/Notes/Carte été.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
    expect(calls).toEqual([
      {
        command: "export_image",
        args: { destination: "/Notes/Carte été.png", png: "iVBORw==" },
      },
    ]);
  });

  it("encode une grande image sans dépasser la pile d'appels", () => {
    const big = new Uint8Array(3_000_000).fill(255);
    expect(atob(bridge.base64(big)).length).toBe(3_000_000);
    expect(bridge.base64(new Uint8Array([]))).toBe("");
  });
});
