import { clearMocks, mockConvertFileSrc, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
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

  it("liste les notes d'une étiquette, et les étiquettes", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listTaggedNotes("perso")).toEqual([]);
    expect(await bridge.listTags()).toEqual([]);
    expect(calls).toEqual([
      { command: "list_tagged_notes", args: { tag: "perso" } },
      { command: "list_tags", args: {} },
    ]);
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

  it("suit un lien entre notes par son titre, et liste les liens entrants d'une note", async () => {
    const calls = recordCalls(null);
    expect(await bridge.resolveLink("Courses")).toBeNull();
    await bridge.listBacklinks("courses.md");
    expect(calls).toEqual([
      { command: "resolve_link", args: { title: "Courses" } },
      { command: "list_backlinks", args: { path: "courses.md" } },
    ]);
  });

  it("liste toutes les notes de la bibliothèque", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listAllNotes()).toEqual([]);
    expect(calls).toEqual([{ command: "list_all_notes", args: {} }]);
  });

  it("lit une note par son nom de fichier", async () => {
    const calls = recordCalls({ path: "a.md", content: "# A" });
    await bridge.readNote("a.md");
    expect(calls).toEqual([{ command: "read_note", args: { path: "a.md" } }]);
  });

  it("enregistre une note avec son nom, son contenu et l'empreinte connue", async () => {
    const answer = {
      path: "b.md",
      title: "B",
      fingerprint: "f2",
      conflictCopy: null,
      tagsChanged: false,
    };
    const calls = recordCalls(answer);
    expect(await bridge.saveNote("a.md", "# B", "f1")).toEqual(answer);
    expect(calls).toEqual([
      { command: "save_note", args: { path: "a.md", content: "# B", fingerprint: "f1" } },
    ]);
  });

  it("crée une note", async () => {
    const calls = recordCalls({ path: "sans-titre.md" });
    await bridge.createNote("Travail");
    expect(calls).toEqual([{ command: "create_note", args: { folder: "Travail" } }]);
  });

  it("crée une note depuis un modèle", async () => {
    const calls = recordCalls({ path: "Travail/reunion.md" });
    expect(await bridge.createNoteFromTemplate("Modèles/reunion.md", "Travail")).toEqual({
      path: "Travail/reunion.md",
    });
    expect(calls).toEqual([
      {
        command: "create_note_from_template",
        args: { template: "Modèles/reunion.md", folder: "Travail" },
      },
    ]);
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
  it("épingle une note et rend son nouveau contenu", async () => {
    const calls = recordCalls({ path: "a.md", content: "---\npinned: true\n---\n# A" });
    expect(await bridge.pinNote("a.md")).toEqual({
      path: "a.md",
      content: "---\npinned: true\n---\n# A",
    });
    expect(calls).toEqual([{ command: "pin_note", args: { path: "a.md" } }]);
  });

  it("désépingle une note et rend son nouveau contenu", async () => {
    const calls = recordCalls({ path: "a.md", content: "# A" });
    expect(await bridge.unpinNote("a.md")).toEqual({ path: "a.md", content: "# A" });
    expect(calls).toEqual([{ command: "unpin_note", args: { path: "a.md" } }]);
  });

  it("déplace une note dans un dossier et rend son nouveau chemin", async () => {
    const calls = recordCalls({ path: "Perso/a.md" });
    expect(await bridge.moveNote("a.md", "Perso")).toEqual({ path: "Perso/a.md" });
    expect(calls).toEqual([{ command: "move_note", args: { path: "a.md", into: "Perso" } }]);
  });
});

describe("pont vers Rust : fenêtre", () => {
  it("passe la fenêtre en plein écran et l'en fait sortir", async () => {
    mockWindows("main");
    const calls = recordCalls(null);
    await bridge.setFullScreen(true);
    await bridge.setFullScreen(false);
    expect(calls).toEqual([
      { command: "plugin:window|set_fullscreen", args: { label: "main", value: true } },
      { command: "plugin:window|set_fullscreen", args: { label: "main", value: false } },
    ]);
  });

  it("demande si la fenêtre est en plein écran", async () => {
    mockWindows("main");
    const calls = recordCalls(true);
    expect(await bridge.isFullScreen()).toBe(true);
    expect(calls).toEqual([{ command: "plugin:window|is_fullscreen", args: { label: "main" } }]);
  });

  it("prévient quand la fenêtre change de taille", async () => {
    mockWindows("main");
    const calls = recordCalls(1);
    await bridge.onWindowResized(() => {});
    expect(calls[0]?.command).toBe("plugin:event|listen");
    expect(calls[0]?.args).toMatchObject({ event: "tauri://resize" });
  });
});

describe("pont vers Rust : changements hors de l'application", () => {
  it("transmet chaque changement de la bibliothèque annoncé par Rust", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const received: string[][] = [];
    await bridge.onLibraryChanged((change) => received.push(change.notes));
    await emit("library-changed", { notes: ["Travail/lundi.md"] });
    expect(received).toEqual([["Travail/lundi.md"]]);
  });
});

describe("pont vers Rust : corbeille", () => {
  it("place une note dans la corbeille", async () => {
    const calls = recordCalls("a/b.md");
    expect(await bridge.trashNote("a/b.md")).toBe("a/b.md");
    expect(calls).toEqual([{ command: "trash_note", args: { path: "a/b.md" } }]);
  });

  it("place un dossier dans la corbeille", async () => {
    const calls = recordCalls("a");
    expect(await bridge.trashFolder("a")).toBe("a");
    expect(calls).toEqual([{ command: "trash_folder", args: { path: "a" } }]);
  });

  it("liste la corbeille", async () => {
    const trash = { folders: ["a"], notes: [{ path: "a/b.md", title: "B" }] };
    const calls = recordCalls(trash);
    expect(await bridge.listTrash()).toEqual(trash);
    expect(calls).toEqual([{ command: "list_trash", args: {} }]);
  });

  it("restaure une note", async () => {
    const calls = recordCalls({ path: "a/b-2.md" });
    expect(await bridge.restoreNote("a/b.md")).toEqual({ path: "a/b-2.md" });
    expect(calls).toEqual([{ command: "restore_note", args: { path: "a/b.md" } }]);
  });

  it("restaure un dossier", async () => {
    const calls = recordCalls("a");
    expect(await bridge.restoreFolder("a")).toBe("a");
    expect(calls).toEqual([{ command: "restore_folder", args: { path: "a" } }]);
  });

  it("vide la corbeille", async () => {
    const calls = recordCalls(null);
    expect(await bridge.emptyTrash()).toBeNull();
    expect(calls).toEqual([{ command: "empty_trash", args: {} }]);
  });
});

interface SentFile {
  readonly command: string;
  readonly bytes: unknown;
  readonly headers: unknown;
}

/** Note ce que le pont envoie, en-têtes compris (le simulateur de Tauri les ignore). */
function recordSentFiles(answer: unknown): SentFile[] {
  recordCalls(answer);
  const sent: SentFile[] = [];
  type Invoke = (command: string, args: unknown, options?: { headers?: unknown }) => unknown;
  const internals = (window as unknown as { __TAURI_INTERNALS__: { invoke: Invoke } })
    .__TAURI_INTERNALS__;
  const invoke = internals.invoke;
  internals.invoke = (command, bytes, options) => {
    sent.push({ command, bytes, headers: options?.headers });
    return invoke(command, bytes, options);
  };
  return sent;
}

describe("pont vers Rust : pièces jointes", () => {
  const link = { markdown: "![](a.assets/x.png)" };

  it("envoie un fichier glissé en octets, avec la note et son nom encodés", async () => {
    const sent = recordSentFiles(link);
    const file = new File(["PDF"], "billet d'été.pdf");
    const attached = await bridge.attachFile("Voyages/été.md", file, {
      kind: "dropped",
      fileName: file.name,
    });
    expect(attached).toEqual(link);
    expect(sent).toEqual([
      {
        command: "attach_file",
        bytes: new Uint8Array([80, 68, 70]),
        headers: {
          "x-note": "Voyages%2F%C3%A9t%C3%A9.md",
          "x-file-name": "billet%20d'%C3%A9t%C3%A9.pdf",
        },
      },
    ]);
  });

  it("envoie un contenu collé avec son type", async () => {
    const sent = recordSentFiles(link);
    await bridge.attachFile("a.md", new Blob(["x"]), { kind: "pasted", mediaType: "image/png" });
    expect(sent[0]?.headers).toEqual({ "x-note": "a.md", "x-media-type": "image%2Fpng" });
  });

  it("demande d'ouvrir une pièce jointe de la note", async () => {
    const calls = recordCalls(null);
    await bridge.openAttachment("a.md", "a.assets/b.pdf");
    expect(calls).toEqual([
      { command: "open_attachment", args: { path: "a.md", target: "a.assets/b.pdf" } },
    ]);
  });
});
