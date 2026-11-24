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
  it("rouvre le dernier espace de travail", async () => {
    const calls = recordCalls({ name: "Notes", path: "/n" });
    expect(await bridge.reopenLastWorkspace()).toEqual({ name: "Notes", path: "/n" });
    expect(calls).toEqual([{ command: "reopen_last_workspace", args: {} }]);
  });

  it("fait choisir le dossier d'un nouvel espace de travail", async () => {
    const calls = recordCalls(null);
    expect(await bridge.chooseWorkspaceFolder()).toBeNull();
    expect(calls).toEqual([{ command: "choose_workspace_folder", args: {} }]);
  });

  it("désigne chaque espace de travail par son nom", async () => {
    const calls = recordCalls(null);
    await bridge.listWorkspaces();
    await bridge.addWorkspace("Travail", "/t");
    await bridge.openWorkspace("Notes");
    await bridge.renameWorkspace("Travail", "Bureau");
    await bridge.removeWorkspace("Bureau");
    expect(calls).toEqual([
      { command: "list_workspaces", args: {} },
      { command: "add_workspace", args: { name: "Travail", folder: "/t" } },
      { command: "open_workspace", args: { name: "Notes" } },
      { command: "rename_workspace", args: { name: "Travail", newName: "Bureau" } },
      { command: "remove_workspace", args: { name: "Bureau" } },
    ]);
  });

  it("liste les notes d'une étiquette, et les étiquettes", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listTaggedNotes("perso", "title")).toEqual([]);
    expect(await bridge.listTags()).toEqual([]);
    expect(calls).toEqual([
      { command: "list_tagged_notes", args: { tag: "perso", order: "title" } },
      { command: "list_tags", args: {} },
    ]);
  });

  it("reconstruit l'index de l'espace de travail ouvert", async () => {
    const calls = recordCalls(null);
    expect(await bridge.rebuildIndex()).toBeNull();
    expect(calls).toEqual([{ command: "rebuild_index", args: {} }]);
  });

  it("lit l'état de l'index de mots", async () => {
    const calls = recordCalls({ notes: 2, rebuilt: null });
    expect(await bridge.indexOverview()).toEqual({ notes: 2, rebuilt: null });
    expect(calls).toEqual([{ command: "index_overview", args: {} }]);
  });

  it("liste les notes récentes par leurs chemins", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listRecentNotes(["b.md", "a.md"])).toEqual([]);
    expect(calls).toEqual([{ command: "list_recent_notes", args: { paths: ["b.md", "a.md"] } }]);
  });

  it("liste les notes dans l'ordre du tri", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listNotes("Travail", "title")).toEqual([]);
    expect(calls).toEqual([{ command: "list_notes", args: { folder: "Travail", order: "title" } }]);
  });

  it("cherche dans tout l'espace de travail, dans l'ordre du tri", async () => {
    const calls = recordCalls([]);
    expect(await bridge.searchNotes("pain", "modified")).toEqual([]);
    expect(calls).toEqual([
      { command: "search_notes", args: { query: "pain", order: "modified" } },
    ]);
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

  it("liste toutes les notes de l'espace de travail", async () => {
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

  it("crée un cahier de recherche, y ajoute une entrée, liste ses entrées", async () => {
    const calls = recordCalls({ path: "levures.md" });
    expect(await bridge.createResearchNotebook("Labo", "Levures")).toEqual({ path: "levures.md" });
    expect(await bridge.addEntry("levures.md", "un")).toEqual({ path: "levures.md" });
    expect(await bridge.listEntries("levures.md")).toEqual({ path: "levures.md" });
    expect(calls).toEqual([
      { command: "create_research_notebook", args: { folder: "Labo", title: "Levures" } },
      { command: "add_entry", args: { path: "levures.md", text: "un" } },
      { command: "list_entries", args: { path: "levures.md" } },
    ]);
  });

  it("demande la note du jour, avec ou sans modèle", async () => {
    const calls = recordCalls({ path: "Journal/2026-11-18.md" });
    expect(await bridge.createDailyNote("Journal", "Modèles/journal.md")).toEqual({
      path: "Journal/2026-11-18.md",
    });
    await bridge.createDailyNote("Journal", null);
    expect(calls).toEqual([
      {
        command: "create_daily_note",
        args: { journal: "Journal", template: "Modèles/journal.md" },
      },
      { command: "create_daily_note", args: { journal: "Journal", template: null } },
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

describe("pont vers Rust : fichiers de l'espace de travail", () => {
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
  it("transmet chaque changement de l'espace de travail annoncé par Rust", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const received: string[][] = [];
    await bridge.onWorkspaceChanged((change) => received.push(change.notes));
    await emit("workspace-changed", { notes: ["Travail/lundi.md"] });
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

  it("liste, compare, garde et restaure les versions d'une note", async () => {
    const calls = recordCalls([]);
    expect(await bridge.listVersions("a.md")).toEqual([]);
    expect(await bridge.compareVersion("a.md", "2026-11-18 14h30")).toEqual([]);
    expect(await bridge.keepVersion("a.md")).toEqual([]);
    expect(await bridge.restoreVersion("a.md", "2026-11-18 14h30")).toEqual([]);
    const version = { path: "a.md", version: "2026-11-18 14h30" };
    expect(calls).toEqual([
      { command: "list_versions", args: { path: "a.md" } },
      { command: "compare_version", args: version },
      { command: "keep_version", args: { path: "a.md" } },
      { command: "restore_version", args: version },
    ]);
  });
});

describe("pont vers Rust : pièces jointes", () => {
  const link = { markdown: "![](a.assets/x.png)" };

  it("envoie un fichier glissé en base64 dans des arguments JSON, sans corps brut ni en-tête", async () => {
    const calls = recordCalls(link);
    const file = new File(["PDF"], "billet d'été.pdf");
    const attached = await bridge.attachFile("Voyages/été.md", file, {
      kind: "dropped",
      fileName: file.name,
    });
    expect(attached).toEqual(link);
    expect(calls).toEqual([
      {
        command: "attach_file",
        args: { note: "Voyages/été.md", fileName: "billet d'été.pdf", content: "UERG" },
      },
    ]);
  });

  it("envoie un contenu collé avec son type", async () => {
    const calls = recordCalls(link);
    await bridge.attachFile("a.md", new Blob(["x"]), { kind: "pasted", mediaType: "image/png" });
    expect(calls).toEqual([
      { command: "attach_file", args: { note: "a.md", mediaType: "image/png", content: "eA==" } },
    ]);
  });

  it("demande d'ouvrir une pièce jointe de la note", async () => {
    const calls = recordCalls(null);
    await bridge.openLinkTarget("a.md", "a.assets/b.pdf");
    expect(calls).toEqual([
      { command: "open_link_target", args: { path: "a.md", target: "a.assets/b.pdf" } },
    ]);
  });

  it("demande d'ouvrir une adresse web dans le navigateur", async () => {
    const calls = recordCalls(null);
    await bridge.openWebAddress("https://malorean.net");
    expect(calls).toEqual([
      { command: "open_web_address", args: { address: "https://malorean.net" } },
    ]);
  });

  it("exporte une note : fichier choisi, puis Markdown ou PDF", async () => {
    const calls = recordCalls(null);
    await bridge.chooseExportFile("Lundi", "pdf", null);
    await bridge.chooseExportFile("Carte", "png", "/Docs", "idées/Carte.md");
    await bridge.exportMarkdown("a.md", "/Docs/Lundi.md");
    await bridge.exportPdf("/Docs/Lundi.pdf");
    expect(calls).toEqual([
      {
        command: "choose_export_file",
        args: { title: "Lundi", format: "pdf", folder: null, near: null },
      },
      {
        command: "choose_export_file",
        args: { title: "Carte", format: "png", folder: "/Docs", near: "idées/Carte.md" },
      },
      { command: "export_markdown", args: { path: "a.md", destination: "/Docs/Lundi.md" } },
      { command: "export_pdf", args: { destination: "/Docs/Lundi.pdf" } },
    ]);
  });

  it("ouvre la fenêtre d'impression sur l'interface", async () => {
    const calls = recordCalls(null);
    await bridge.printPage();
    expect(calls).toEqual([{ command: "print_page", args: {} }]);
  });

  it("pose la copie mise en forme dans le presse-papiers, en HTML et en texte brut", async () => {
    const calls = recordCalls(null);
    await bridge.copyRichText("<p>a</p>", "a");
    expect(calls).toEqual([{ command: "copy_rich_text", args: { html: "<p>a</p>", text: "a" } }]);
  });

  it("pose le texte Markdown dans le presse-papiers, en texte brut seul", async () => {
    const calls = recordCalls(null);
    await bridge.copyPlainText("# a\n");
    expect(calls).toEqual([{ command: "copy_plain_text", args: { text: "# a\n" } }]);
  });
});

describe("pont vers Rust : aide à l'écriture", () => {
  it("demande si l'assistant d'écriture peut répondre", async () => {
    const calls = recordCalls({ kind: "available" });
    expect(await bridge.assistantStatus()).toEqual({ kind: "available" });
    expect(calls).toEqual([{ command: "assistant_status", args: {} }]);
  });

  it("demande la proposition pour une sélection, avec l'action", async () => {
    const proposal = { text: "Une faute.", differences: [] };
    const calls = recordCalls(proposal);
    expect(await bridge.proposeRewriting("correct", "Une fote.")).toEqual(proposal);
    expect(calls).toEqual([
      { command: "propose_rewriting", args: { action: "correct", selection: "Une fote." } },
    ]);
  });
});

describe("pont vers Rust : colonne Claude Code", () => {
  it("demande si Claude Code est installé et connecté", async () => {
    const calls = recordCalls({ kind: "ready" });
    expect(await bridge.claudeStatus()).toEqual({ kind: "ready" });
    expect(calls).toEqual([{ command: "claude_status", args: {} }]);
  });

  it("envoie un message dans la conversation de l'onglet, puis arrête le tour", async () => {
    const calls = recordCalls(null);
    await bridge.sendToClaude(
      "Range mes notes",
      "c1",
      { model: "opus", effort: "extraHigh" },
      true,
      "Modèles",
    );
    await bridge.sendToClaude("Bonjour", null, { model: null, effort: null }, false, null);
    await bridge.stopClaude();
    expect(calls).toEqual([
      {
        command: "send_to_claude",
        args: {
          message: "Range mes notes",
          conversation: "c1",
          settings: { model: "opus", effort: "extraHigh" },
          changesAllowed: true,
          templates: "Modèles",
        },
      },
      {
        command: "send_to_claude",
        args: {
          message: "Bonjour",
          conversation: null,
          settings: { model: null, effort: null },
          changesAllowed: false,
          templates: null,
        },
      },
      { command: "stop_claude", args: {} },
    ]);
  });

  it("transmet chaque événement de Claude annoncé par Rust", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const received: string[] = [];
    await bridge.onClaudeEvent((event) => received.push(event.kind));
    await emit("claude-event", { kind: "changedNote", path: "plan.md" });
    expect(received).toEqual(["changedNote"]);
  });

  it("déconnecte et connecte Claude Code, et transmet l'adresse de connexion", async () => {
    const calls = recordCalls(null);
    await bridge.logOutOfClaude();
    await bridge.logInToClaude();
    expect(calls).toEqual([
      { command: "log_out_of_claude", args: {} },
      { command: "log_in_to_claude", args: {} },
    ]);
    mockIPC(() => null, { shouldMockEvents: true });
    const addresses: string[] = [];
    await bridge.onClaudeSignIn((address) => addresses.push(address));
    await emit("claude-sign-in", "https://claude.ai/x");
    expect(addresses).toEqual(["https://claude.ai/x"]);
  });
});

describe("pont vers Rust : outils de l'application", () => {
  it("transmet les notes à montrer et les demandes de ce que l'utilisateur regarde, puis y répond", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const heard: string[] = [];
    await bridge.onClaudeShowsNote((path) => heard.push(`montrer ${path}`));
    await bridge.onClaudeAsksView((request) => heard.push(`demande ${request}`));
    await emit("claude-shows-note", "Travail/a.md");
    await emit("claude-asks-view", 4);
    expect(heard).toEqual(["montrer Travail/a.md", "demande 4"]);
    const calls = recordCalls(null);
    await bridge.answerView(4, "Travail/a.md", "du pain");
    expect(calls).toEqual([
      {
        command: "answer_view",
        args: { request: 4, note: "Travail/a.md", selection: "du pain" },
      },
    ]);
  });
});

describe("pont vers Rust : barre des menus", () => {
  it("fait construire la barre des menus, puis griser ou activer ses éléments", async () => {
    const calls = recordCalls(null);
    const menus = [{ title: "Fichier", role: null, entries: [{ kind: "separator" as const }] }];
    await bridge.installMenu(menus);
    await bridge.enableMenuItems(["close-tab"], false);
    expect(calls).toEqual([
      { command: "install_menu", args: { menus } },
      { command: "enable_menu_items", args: { ids: ["close-tab"], enabled: false } },
    ]);
  });

  it("transmet chaque élément de menu choisi, par l'identifiant de sa commande", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const received: string[] = [];
    await bridge.onMenuCommand((id) => received.push(id));
    await emit("menu-command", "close-tab");
    expect(received).toEqual(["close-tab"]);
  });
  it("appelle chaque commande du sens, un modèle désigné par son nom", async () => {
    const calls = recordCalls(null);
    await bridge.meaningOverview();
    await bridge.chooseMeaningModel("e5-large");
    await bridge.downloadMeaningModel("e5-small");
    await bridge.cancelModelDownload();
    await bridge.removeMeaningModel("e5-small");
    await bridge.rebuildMeaning();
    await bridge.searchNotesByMeaning("dessert aux pommes");
    await bridge.relatedNotes("tarte.md");
    expect(calls).toEqual([
      { command: "meaning_overview", args: {} },
      { command: "choose_meaning_model", args: { model: "e5-large" } },
      { command: "download_meaning_model", args: { model: "e5-small" } },
      { command: "cancel_model_download", args: {} },
      { command: "remove_meaning_model", args: { model: "e5-small" } },
      { command: "rebuild_meaning", args: {} },
      { command: "search_notes_by_meaning", args: { query: "dessert aux pommes" } },
      { command: "related_notes", args: { path: "tarte.md" } },
    ]);
  });

  it("transmet l'avancement du calcul du sens et du téléchargement d'un modèle", async () => {
    mockIPC(() => null, { shouldMockEvents: true });
    const heard: string[] = [];
    await bridge.onMeaningProgress((item) => heard.push(`calcul ${item.kind}`));
    await bridge.onModelDownload((item) => heard.push(`téléchargement ${item.kind}`));
    await emit("meaning-progress", { kind: "progress", done: 1, total: 2, model: "e5-small" });
    await emit("model-download", { kind: "finished", model: "e5-small" });
    expect(heard).toEqual(["calcul progress", "téléchargement finished"]);
  });
});
