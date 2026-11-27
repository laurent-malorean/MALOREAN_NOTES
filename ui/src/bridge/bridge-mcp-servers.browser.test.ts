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

describe("pont vers Rust : les serveurs MCP extérieurs (fiche 0105)", () => {
  it("lit la liste des serveurs que Claude Code connaît", async () => {
    const listed = {
      kind: "listed",
      servers: [
        {
          name: "claude.ai Noota",
          displayName: "Noota",
          connector: true,
          state: "connected",
          allowed: true,
        },
      ],
    };
    const calls = recordCalls(listed);
    expect(await bridge.listMcpServers()).toEqual(listed);
    expect(calls).toEqual([{ command: "list_mcp_servers", args: {} }]);
  });

  it("coche et décoche un serveur par son nom tel que Claude Code le donne", async () => {
    const calls = recordCalls(null);
    await bridge.allowMcpServer("claude.ai Noota");
    await bridge.disallowMcpServer("claude.ai Noota");
    expect(calls).toEqual([
      { command: "allow_mcp_server", args: { name: "claude.ai Noota" } },
      { command: "disallow_mcp_server", args: { name: "claude.ai Noota" } },
    ]);
  });
});
