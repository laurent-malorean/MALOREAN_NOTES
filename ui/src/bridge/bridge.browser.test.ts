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

  it("cherche dans toute la bibliothèque", async () => {
    const calls = recordCalls([]);
    expect(await bridge.searchNotes("pain")).toEqual([]);
    expect(calls).toEqual([{ command: "search_notes", args: { query: "pain" } }]);
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

describe("pont vers Rust : dossiers", () => {
  it("liste les dossiers", async () => {
    const calls = recordCalls(["Travail"]);
    expect(await bridge.listFolders()).toEqual(["Travail"]);
    expect(calls).toEqual([{ command: "list_folders", args: {} }]);
  });

  it("crée, renomme et déplace un dossier", async () => {
    const calls = recordCalls("x");
    await bridge.createFolder("Travail", "Projets");
    await bridge.renameFolder("Travail", "Boulot");
    await bridge.moveFolder("Boulot", "Perso");
    expect(calls).toEqual([
      { command: "create_folder", args: { parent: "Travail", name: "Projets" } },
      { command: "rename_folder", args: { path: "Travail", name: "Boulot" } },
      { command: "move_folder", args: { path: "Boulot", into: "Perso" } },
    ]);
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

describe("pont vers Rust : déplacer une note", () => {
  it("déplace une note dans un dossier et rend son nouveau chemin", async () => {
    const calls = recordCalls({ path: "Perso/a.md" });
    expect(await bridge.moveNote("a.md", "Perso")).toEqual({ path: "Perso/a.md" });
    expect(calls).toEqual([{ command: "move_note", args: { path: "a.md", into: "Perso" } }]);
  });
});
