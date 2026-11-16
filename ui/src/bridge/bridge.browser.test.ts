import { clearMocks, mockConvertFileSrc, mockIPC } from "@tauri-apps/api/mocks";
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

describe("pont vers Rust : chaque fonction appelle sa commande", () => {
  it("rouvre la dernière bibliothèque", async () => {
    const calls = recordCalls({ name: "Notes", path: "/n" });
    expect(await bridge.reopenLastLibrary()).toEqual({ name: "Notes", path: "/n" });
    expect(calls).toEqual([{ command: "reopen_last_library", args: {} }]);
  });

  it("fait choisir une bibliothèque", async () => {
    const calls = recordCalls(null);
    expect(await bridge.chooseLibrary()).toBeNull();
    expect(calls).toEqual([{ command: "choose_library", args: {} }]);
  });

  it("liste les notes", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listNotes("Travail")).toEqual([]);
    expect(calls).toEqual([{ command: "list_notes", args: { folder: "Travail" } }]);
  });

  it("lit une note par son nom de fichier", async () => {
    const calls = recordCalls({ path: "a.md", content: "# A" });
    await bridge.readNote("a.md");
    expect(calls).toEqual([{ command: "read_note", args: { path: "a.md" } }]);
  });

  it("enregistre une note avec son nom et son contenu", async () => {
    const calls = recordCalls({ path: "b.md" });
    expect(await bridge.saveNote("a.md", "# B")).toEqual({ path: "b.md" });
    expect(calls).toEqual([{ command: "save_note", args: { path: "a.md", content: "# B" } }]);
  });

  it("crée une note", async () => {
    const calls = recordCalls({ path: "sans-titre.md" });
    await bridge.createNote("Travail");
    expect(calls).toEqual([{ command: "create_note", args: { folder: "Travail" } }]);
  });
});

describe("pont vers Rust : message d'erreur", () => {
  it("prend le message d'une erreur rendue par Rust", () => {
    expect(bridge.errorMessage({ message: "disque plein" })).toBe("disque plein");
  });

  it("prend le texte de toute autre erreur", () => {
    expect(bridge.errorMessage(new Error("réseau"))).toBe("réseau");
    expect(bridge.errorMessage("panne")).toBe("panne");
    expect(bridge.errorMessage(null)).toBe("null");
  });
});

describe("pont vers Rust : fichiers de la bibliothèque", () => {
  it("donne l'adresse qui charge un fichier du disque dans la fenêtre", () => {
    mockConvertFileSrc("macos");
    expect(bridge.fileAddress("/Users/moi/Notes/a b.png")).toBe(
      "asset://localhost/%2FUsers%2Fmoi%2FNotes%2Fa%20b.png",
    );
  });
});
