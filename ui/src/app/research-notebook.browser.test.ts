import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  recordedScreen,
  settle,
  workspaceScreen,
} from "../../test-support/app-fixture";
import type { EntryItem, WorkspaceNoteItem } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { welcome } from "../state/screen";
import { createResearchNotebooks, NO_NOTEBOOK } from "./research-notebook";

const LEVURES: WorkspaceNoteItem = { path: "Labo/levures.md", title: "Levures", folder: "Labo" };
const BIERES: WorkspaceNoteItem = { path: "bieres.md", title: "Bières", folder: "" };
const ADDED: EntryItem = { anchor: "2026-11-16-18h30", label: "", text: "un", line: 2 };

function setup(notebooks: WorkspaceNoteItem[], open = "a.md") {
  const log: string[] = [];
  const { screen } = recordedScreen(workspaceScreen());
  const columns = fakeColumns([open].reduce(noteOpened, columnsStarted));
  const pane = fakePane(open);
  Object.assign(pane.editor, { content: () => "# Levures\n\n- 18:30 - un\n" });
  const other = fakePane("Labo/levures.md");
  columns.panes.set(columns.columns().active, pane);
  columns.panes.set(99, other);
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const shown: string[] = [];
  const notebooks$ = createResearchNotebooks({
    backend: {
      listResearchNotebooks: async () => notebooks,
      listEntries: async (path) => (log.push(`entrées de ${path}`), []),
      addEntry: async (path, text, corrected) => {
        log.push(`ajouter à ${path} : ${text} (${String(corrected)})`);
        return ADDED;
      },
      createResearchNotebook: async (folder, title) => {
        log.push(`créer « ${title} » dans « ${folder} »`);
        return { path: "cahier.md" };
      },
    },
    screen,
    columns: columns.open,
    workspace: { refreshList: async () => void log.push("liste") },
    dialog,
    show: (message) => shown.push(message),
    error: (error) => shown.push(`erreur ${String(error)}`),
  });
  return { notebooks: notebooks$, log, screen, columns, pane, other, dialog, shown };
}

const button = (dialog: HTMLDialogElement, label: string) =>
  [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;

function type(dialog: HTMLDialogElement, text: string) {
  const field = dialog.querySelector<HTMLTextAreaElement>(".entry-text") as HTMLTextAreaElement;
  field.value = text;
}

describe("cahiers de recherche", () => {
  it("sans cahier dans l'espace de travail, dit comment en créer un", async () => {
    const s = setup([]);
    await s.notebooks.add();
    expect(s.shown).toEqual([NO_NOTEBOOK]);
    expect(NO_NOTEBOOK).toContain("« Nouveau cahier de recherche » en crée un");
    expect(s.dialog.open).toBe(false);
  });

  it("propose les cahiers, celui de la colonne active d'abord, puis ajoute l'entrée et la montre", async () => {
    const s = setup([BIERES, LEVURES], "Labo/levures.md");
    const adding = s.notebooks.add();
    await settle();
    expect(s.dialog.open).toBe(true);
    const select = s.dialog.querySelector<HTMLSelectElement>(".entry-notebook");
    expect(select?.value).toBe("Labo/levures.md");
    type(s.dialog, "un");
    button(s.dialog, "Ajouter").click();
    await adding;
    expect(s.log).toEqual([
      "entrées de Labo/levures.md",
      "ajouter à Labo/levures.md : un (null)",
      "liste",
    ]);
    expect(s.pane.followDisk).toHaveBeenCalled();
    expect(s.other.followDisk).toHaveBeenCalled();
    const at = "# Levures\n\n".length;
    expect(s.pane.editor.restore).toHaveBeenCalledWith({
      anchor: at,
      head: at,
      top: at,
      offset: 0,
    });
    expect(s.shown).toEqual(["Entrée ajoutée à « Levures »"]);
  });

  it("sans cahier dans la colonne active, propose le premier ; une colonne d'une autre note ne relit rien", async () => {
    const s = setup([BIERES, LEVURES]);
    const adding = s.notebooks.add();
    await settle();
    expect(s.dialog.querySelector<HTMLSelectElement>(".entry-notebook")?.value).toBe("bieres.md");
    type(s.dialog, "deux");
    button(s.dialog, "Ajouter").click();
    await adding;
    expect(s.log).toContain("ajouter à bieres.md : deux (null)");
    expect(s.pane.followDisk).not.toHaveBeenCalled();
    expect(s.other.followDisk).not.toHaveBeenCalled();
    expect(s.pane.editor.restore).not.toHaveBeenCalled();
    expect(s.shown).toEqual(["Entrée ajoutée à « Bières »"]);
  });

  it("le « + » d'un cahier ne propose que lui, même s'il n'est pas encore dans l'index", async () => {
    const s = setup([BIERES, LEVURES]);
    const adding = s.notebooks.add("neuf.md");
    await settle();
    expect(s.dialog.querySelector(".entry-notebook")).toBeNull();
    type(s.dialog, "trois");
    button(s.dialog, "Ajouter").click();
    await adding;
    expect(s.log).toContain("ajouter à neuf.md : trois (null)");
    expect(s.shown).toEqual(["Entrée ajoutée à « neuf.md »"]);
    const fromLevures = s.notebooks.add(LEVURES.path);
    await settle();
    expect(s.dialog.querySelector(".entry-notebook")).toBeNull();
    type(s.dialog, "quatre");
    button(s.dialog, "Ajouter").click();
    await fromLevures;
    expect(s.log).toContain("ajouter à Labo/levures.md : quatre (null)");
    expect(s.shown.at(-1)).toBe("Entrée ajoutée à « Levures »");
    const cancelled = s.notebooks.add(LEVURES.path);
    await settle();
    button(s.dialog, "Annuler").click();
    await cancelled;
    expect(s.log.filter((line) => line.startsWith("ajouter"))).toHaveLength(2);
  });

  it("un nouveau cahier est titré d'abord, créé dans le dossier affiché, puis ouvert", async () => {
    const s = setup([]);
    const creating = s.notebooks.create();
    await settle();
    const field = s.dialog.querySelector<HTMLInputElement>("input") as HTMLInputElement;
    expect(field.value).toBe("Cahier de recherche");
    expect(s.dialog.getAttribute("aria-label")).toBe("Titre du nouveau cahier de recherche");
    field.value = "Levures";
    button(s.dialog, "Créer").click();
    await creating;
    expect(s.log).toEqual(["créer « Levures » dans «  »", "liste"]);
    expect(s.columns.log).toContain("ouvrir cahier.md");
    const cancelled = s.notebooks.create();
    await settle();
    button(s.dialog, "Annuler").click();
    await cancelled;
    expect(s.log).toHaveLength(2);
  });

  it("rien sans espace de travail ouvert", async () => {
    const s = setup([LEVURES]);
    s.screen.show(welcome);
    await s.notebooks.add();
    await s.notebooks.create();
    expect(s.dialog.open).toBe(false);
    expect(s.shown).toEqual([]);
  });
});
