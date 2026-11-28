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

describe("pont vers Rust : l'agenda 12 (fiche 0104)", () => {
  it("crée, lit et règle un agenda 12 avec les noms d'arguments de Rust", async () => {
    const calls = recordCalls(null);
    await bridge.createAgenda12("pro", "Salons");
    await bridge.readAgenda12("pro/salons.md", null);
    await bridge.readAgenda12("pro/salons.md", "salon");
    await bridge.changeAgenda12Columns("pro/salons.md", 6);
    await bridge.changeAgenda12Layout("pro/salons.md", "list");
    expect(calls).toEqual([
      { command: "create_agenda_12", args: { folder: "pro", title: "Salons" } },
      { command: "read_agenda_12", args: { path: "pro/salons.md", tag: null } },
      { command: "read_agenda_12", args: { path: "pro/salons.md", tag: "salon" } },
      { command: "change_agenda_12_columns", args: { path: "pro/salons.md", columns: 6 } },
      { command: "change_agenda_12_layout", args: { path: "pro/salons.md", layout: "list" } },
    ]);
  });

  it("crée, lit, change, clôt, rouvre et supprime un événement", async () => {
    const calls = recordCalls(null);
    await bridge.createAgenda12Event("pro/salons.md", 2);
    await bridge.readAgenda12Event("pro/salons/a.md");
    await bridge.changeAgenda12Event("pro/salons/a.md", { kind: "day", day: 12 });
    await bridge.closeAgenda12Event("pro/salons/a.md", "withSuccessor");
    await bridge.reopenAgenda12Event("pro/salons/archives/a.md");
    await bridge.deleteAgenda12Event("pro/salons/a.md");
    await bridge.listCountries();
    expect(calls).toEqual([
      { command: "create_agenda_12_event", args: { agenda: "pro/salons.md", month: 2 } },
      { command: "read_agenda_12_event", args: { path: "pro/salons/a.md" } },
      {
        command: "change_agenda_12_event",
        args: { path: "pro/salons/a.md", change: { kind: "day", day: 12 } },
      },
      {
        command: "close_agenda_12_event",
        args: { path: "pro/salons/a.md", closing: "withSuccessor" },
      },
      { command: "reopen_agenda_12_event", args: { path: "pro/salons/archives/a.md" } },
      { command: "delete_agenda_12_event", args: { path: "pro/salons/a.md" } },
      { command: "list_countries", args: {} },
    ]);
  });
});
