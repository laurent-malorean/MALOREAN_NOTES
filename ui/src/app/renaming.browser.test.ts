import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane, settle } from "../../test-support/app-fixture";
import type { SaveResult } from "../bridge";
import { columnsStarted, noteOpened } from "../state/columns";
import { createNoteRenaming } from "./renaming";

const NOTES: Record<string, { content: string; title: string }> = {
  "courses.md": { content: "# Courses\n- pain", title: "Courses" },
  "Travail/clients.md": { content: "---\ntype: crm\n---\n# Clients\n", title: "Clients" },
  "Travail/clients/personnes/jean.md": {
    content: "---\ntype: crm-personne\n---\n# Jean\n",
    title: "Jean",
  },
  "Travail/clients/actions/devis.md": {
    content: "---\ntype: crm-action\n---\n# Devis\n",
    title: "Devis",
  },
  "plan.canvas": { content: "{}", title: "plan" },
};

function setup() {
  const log: string[] = [];
  const columns = fakeColumns(
    noteOpened(noteOpened(columnsStarted, "courses.md"), "Travail/clients.md"),
  );
  const dialog = document.createElement("dialog");
  document.body.replaceChildren(dialog);
  const failures: string[] = [];
  let renamed: SaveResult = {
    path: "nouveau.md",
    title: "Nouveau",
    fingerprint: "f",
    conflictCopy: null,
    tagsChanged: false,
  };
  const renaming = createNoteRenaming({
    backend: {
      readNote: async (path) => {
        log.push(`lire ${path}`);
        const note = NOTES[path];
        if (!note) throw { message: "absente" };
        return { path, fingerprint: "f0", ...note };
      },
      renameNote: async (path, title) => {
        log.push(`renommer ${path} → ${title}`);
        if (failures.length > 0) throw { message: failures.shift() };
        return renamed;
      },
      errorMessage: (error) => (error as { message: string }).message,
    },
    columns: columns.open,
    recent: { moved: (rename) => log.push(`récentes ${rename("courses.md")}`) },
    workspace: {
      refreshList: async () => void log.push("liste"),
      refreshFolders: async () => void log.push("dossiers"),
    },
    dialog,
    run: (action) => void action.catch((error: unknown) => log.push(`erreur ${String(error)}`)),
  });
  const field = () => dialog.querySelector<HTMLInputElement>("input");
  const button = (text: string) =>
    [...dialog.querySelectorAll("button")].find((b) => b.textContent === text);
  return {
    ...{ renaming, log, columns, failures, dialog, field },
    /** Tape ce titre dans la fenêtre ouverte et clique « Renommer ». */
    validate: async (title: string) => {
      (field() as HTMLInputElement).value = title;
      button("Renommer")?.click();
      await settle();
    },
    cancel: () => button("Annuler")?.click(),
    willGive: (result: Partial<SaveResult>) => void (renamed = { ...renamed, ...result }),
  };
}

describe("renommer un contenu", () => {
  it("la fenêtre est préremplie avec le titre actuel ; ce qui est tapé est enregistré d'abord", async () => {
    const t = setup();
    t.renaming.start("courses.md");
    await settle();
    expect(t.dialog.open).toBe(true);
    expect(t.dialog.getAttribute("aria-label")).toBe("Nouveau titre");
    expect(t.field()?.value).toBe("Courses");
    expect(t.columns.log).toEqual(["enregistrer courses.md"]);
    expect(t.log).toEqual(["lire courses.md"]);
  });

  it("annuler ne change rien", async () => {
    const t = setup();
    t.renaming.start("courses.md");
    await settle();
    t.cancel();
    await settle();
    expect(t.dialog.open).toBe(false);
    expect(t.log).toEqual(["lire courses.md"]);
    expect(t.columns.log).toEqual(["enregistrer courses.md"]);
  });

  it("valider renomme : les onglets prennent le nouveau chemin et le nouveau titre, la liste suit", async () => {
    const t = setup();
    t.renaming.start("courses.md");
    await settle();
    await t.validate("Nouveau");
    expect(t.dialog.open).toBe(false);
    expect(t.log).toEqual([
      "lire courses.md",
      "renommer courses.md → Nouveau",
      "récentes nouveau.md",
      "liste",
    ]);
    const tabs = t.columns.columns().list.flatMap((column) => column.tabs);
    expect(tabs.map((tab) => [tab.note, tab.title])).toEqual([
      ["nouveau.md", "Nouveau"],
      ["Travail/clients.md", null],
    ]);
  });

  it("la colonne qui montre le contenu renommé relit son nouveau texte", async () => {
    const t = setup();
    const pane = fakePane("nouveau.md", t.log);
    const other = fakePane("Travail/clients.md", t.log);
    t.columns.panes.set(0, pane);
    t.columns.panes.set(1, other);
    t.renaming.start("courses.md");
    await settle();
    await t.validate("Nouveau");
    expect(pane.followDisk).toHaveBeenCalledTimes(1);
    expect(other.followDisk).not.toHaveBeenCalled();
  });

  it("un titre refusé reste dans la fenêtre : message en français avec une majuscule et un point, rien ne change", async () => {
    const t = setup();
    t.failures.push("une note de ce dossier porte déjà ce titre", "Déjà dit !");
    t.renaming.start("courses.md");
    await settle();
    const alert = () => t.dialog.querySelector(".name-prompt-error")?.textContent;
    await t.validate("Idée");
    expect(alert()).toBe("Une note de ce dossier porte déjà ce titre.");
    expect(t.dialog.open).toBe(true);
    await t.validate("Idée");
    expect(alert()).toBe("Déjà dit !");
    expect(t.columns.log).toEqual(["enregistrer courses.md"]);
    expect(t.log).not.toContain("liste");
    // Un titre accepté ensuite renomme et ferme la fenêtre.
    await t.validate("Nouveau");
    expect(t.dialog.open).toBe(false);
    expect(t.log).toContain("liste");
  });

  it("un CRM emmène les onglets de ses fiches, et la liste des dossiers est relue", async () => {
    const t = setup();
    t.willGive({ path: "Travail/prospects.md", title: "Prospects" });
    await t.columns.open.update((now) =>
      noteOpened(noteOpened(now, "Travail/clients/personnes/jean.md"), "Travail/clients-bis.md"),
    );
    t.renaming.start("Travail/clients.md");
    await settle();
    await t.validate("Prospects");
    const notes = t.columns.columns().list.flatMap((column) => column.tabs.map((tab) => tab.note));
    expect(notes).toEqual([
      "courses.md",
      "Travail/prospects.md",
      "Travail/prospects/personnes/jean.md",
      "Travail/clients-bis.md",
    ]);
    expect(t.log.slice(-3)).toEqual(["récentes courses.md", "dossiers", "liste"]);
  });

  it("une note simple n'emmène pas les notes d'un dossier de même nom", async () => {
    const t = setup();
    t.willGive({ path: "autre.md", title: "Autre" });
    await t.columns.open.update((now) => noteOpened(now, "courses/idee.md"));
    t.renaming.start("courses.md");
    await settle();
    await t.validate("Autre");
    const notes = t.columns.columns().list.flatMap((column) => column.tabs.map((tab) => tab.note));
    expect(notes).toContain("courses/idee.md");
    expect(t.log).not.toContain("dossiers");
  });

  it("un titre inchangé ne touche ni aux onglets ni à la liste", async () => {
    const t = setup();
    t.willGive({ path: "courses.md", title: "Courses" });
    t.renaming.start("courses.md");
    await settle();
    await t.validate("Courses");
    expect(t.columns.log).toEqual(["enregistrer courses.md"]);
    expect(t.log).toEqual(["lire courses.md", "renommer courses.md → Courses"]);
  });

  it("une lecture qui échoue est dite, sans fenêtre", async () => {
    const t = setup();
    t.renaming.start("absente.md");
    await settle();
    expect(t.dialog.open).toBe(false);
    expect(t.log).toContain("erreur [object Object]");
  });
});

describe("le choix « Renommer… » du menu", () => {
  it("est offert pour une note, un canvas et un CRM", async () => {
    const t = setup();
    expect(await t.renaming.available("courses.md")).toBe(true);
    expect(await t.renaming.available("plan.canvas")).toBe(true);
    expect(await t.renaming.available("Travail/clients.md")).toBe(true);
  });

  it("n'est pas offert pour une fiche de CRM, ni pour une note qu'on ne peut pas lire", async () => {
    const t = setup();
    expect(await t.renaming.available("Travail/clients/personnes/jean.md")).toBe(false);
    expect(await t.renaming.available("Travail/clients/actions/devis.md")).toBe(false);
    expect(await t.renaming.available("absente.md")).toBe(false);
  });

  it("n'a pas besoin de lire un canvas", async () => {
    const t = setup();
    await t.renaming.available("plan.canvas");
    expect(t.log).not.toContain("lire plan.canvas");
  });
});
