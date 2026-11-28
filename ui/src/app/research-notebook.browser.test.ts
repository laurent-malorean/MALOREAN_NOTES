import { describe, expect, it } from "vitest";
import {
  fakeColumns,
  fakePane,
  recordedScreen,
  settle,
  workspaceScreen,
} from "../../test-support/app-fixture";
import type { EntryItem } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { welcome } from "../state/screen";
import { createResearchNotebooks } from "./research-notebook";

const ADDED: EntryItem = {
  anchor: "2026-11-16-18h30",
  label: "",
  text: "un",
  line: 2,
  number: 1,
};

function setup(open = "a.md") {
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
      addEntry: async (path, text) => {
        log.push(`ajouter à ${path} : ${text}`);
        if (text === "refusé") throw new Error("l'entrée est vide");
        return ADDED;
      },
      copyPlainText: async (text) => {
        if (text === "refusé") throw new Error("presse-papiers indisponible");
        log.push(`copier ${text}`);
        return null;
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
    show: (message, kind) => shown.push(kind ? `[${kind}] ${message}` : message),
    error: (error) => shown.push(`erreur ${String(error)}`),
  });
  return { notebooks: notebooks$, log, screen, columns, pane, other, dialog, shown };
}

const button = (dialog: HTMLDialogElement, label: string) =>
  [...dialog.querySelectorAll<HTMLButtonElement>("button")].find(
    (b) => b.textContent === label,
  ) as HTMLButtonElement;

describe("cahiers de recherche", () => {
  it("ajoute l'entrée au cahier de la colonne, relit chaque colonne qui le montre et montre l'entrée", async () => {
    const s = setup("Labo/levures.md");
    expect(await s.notebooks.add("Labo/levures.md", "un")).toBe(true);
    expect(s.log).toEqual(["ajouter à Labo/levures.md : un", "liste"]);
    expect(s.pane.followDisk).toHaveBeenCalled();
    expect(s.other.followDisk).toHaveBeenCalled();
    const at = "# Levures\n\n".length;
    expect(s.pane.editor.restore).toHaveBeenCalledWith({
      anchor: at,
      head: at,
      top: at,
      offset: 0,
    });
    expect(s.shown).toEqual(["Entrée ajoutée au cahier"]);
  });

  it("une colonne d'une autre note ne relit rien et ne bouge pas", async () => {
    const s = setup();
    expect(await s.notebooks.add("bieres.md", "deux")).toBe(true);
    expect(s.log).toContain("ajouter à bieres.md : deux");
    expect(s.pane.followDisk).not.toHaveBeenCalled();
    expect(s.other.followDisk).not.toHaveBeenCalled();
    expect(s.pane.editor.restore).not.toHaveBeenCalled();
    expect(s.shown).toEqual(["Entrée ajoutée au cahier"]);
  });

  it("un refus est affiché et rend faux : le texte saisi est gardé", async () => {
    const s = setup();
    expect(await s.notebooks.add("bieres.md", "refusé")).toBe(false);
    expect(s.shown).toEqual(["erreur Error: l'entrée est vide"]);
    expect(s.log).toEqual(["ajouter à bieres.md : refusé"]);
  });

  it("un nouveau cahier est titré d'abord, créé dans le dossier affiché, puis ouvert", async () => {
    const s = setup();
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

  it("copie la référence d'une entrée en texte brut et le dit", async () => {
    const s = setup();
    await s.notebooks.copyReference("[[Levures#0007]]");
    expect(s.log).toEqual(["copier [[Levures#0007]]"]);
    expect(s.shown).toEqual(["Référence copiée"]);
  });

  it("une copie refusée est affichée, sans dire « copiée »", async () => {
    const s = setup();
    await s.notebooks.copyReference("refusé");
    expect(s.shown).toEqual(["erreur Error: presse-papiers indisponible"]);
  });

  it("rien sans espace de travail ouvert", async () => {
    const s = setup();
    s.screen.show(welcome);
    expect(await s.notebooks.add("a.md", "un")).toBe(false);
    await s.notebooks.create();
    expect(s.dialog.open).toBe(false);
    expect(s.shown).toEqual([]);
  });
});
