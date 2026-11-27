import { describe, expect, it } from "vitest";
import { fakeColumns, fakePane, recordedScreen, settle } from "../../test-support/app-fixture";
import type { FavoritesNoteItem, LinkableItem, RemovedLineItem } from "../bridge";
import { welcome, workspaceOpened } from "../state/screen";
import { createFavorites } from "./favorites";
import "../theme.css";
import "../style.css";

const LINE: RemovedLineItem = { index: 3, text: "- [[A]]\n" };
const NOTE: FavoritesNoteItem = { path: "Favoris.md", title: "Favoris" };
const linkable = (title: string, contentType: LinkableItem["contentType"]): LinkableItem => ({
  path: `${title}.md`,
  title,
  folder: "",
  contentType,
  link: title,
});

interface Options {
  note?: FavoritesNoteItem | null;
  removed?: RemovedLineItem[];
  failing?: string;
}

function setup(options: Options = {}) {
  let note: FavoritesNoteItem | null = options.note === undefined ? NOTE : options.note;
  const log: string[] = [];
  const messages: { text: string; kind?: string; action?: () => Promise<unknown> }[] = [];
  const errors: string[] = [];
  const { screen } = recordedScreen(
    workspaceOpened({ name: "Notes", path: "/lib" }, ["Notes", "Notes/Travail"], []),
  );
  const columns = fakeColumns();
  const picker = document.createElement("dialog");
  document.body.replaceChildren(picker);
  const fail = (name: string) => {
    if (options.failing === name) throw { message: `${name} refusé` };
  };
  const favorites = createFavorites({
    backend: {
      favoritesNote: async () => (log.push("note des favoris"), note),
      chooseFavoritesNote: async (path) => {
        log.push(`choisir ${path}`);
        fail("choisir");
        return (note = { path, title: path });
      },
      createFavoritesNote: async (title, folder) => {
        log.push(`créer « ${title} » dans « ${folder} »`);
        fail("créer");
        return (note = { path: `${folder}/${title}.md`.replace(/^\//, ""), title });
      },
      stopUsingFavoritesNote: async () => (log.push("arrêter"), (note = null)),
      isFavorite: async (path) => (log.push(`favori ? ${path}`), path === "a.md"),
      addFavorite: async (path) => (fail("ajouter"), log.push(`ajouter ${path}`), null),
      removeFavorite: async (path) => (log.push(`retirer ${path}`), options.removed ?? [LINE]),
      restoreFavorites: async (removed) => (
        fail("restaurer"),
        log.push(`restaurer ${JSON.stringify(removed)}`),
        null
      ),
      listLinkable: async () => [
        linkable("Courses", "note"),
        linkable("Plan", "canvas"),
        linkable("Favoris", "note"),
      ],
    },
    screen,
    columns: columns.open,
    workspace: { refreshList: async () => void log.push("liste") },
    settings: { openTab: (name) => log.push(`réglages ${name}`) },
    picker,
    open: (path) => log.push(`ouvrir ${path}`),
    show: (text, kind, action) =>
      messages.push({ text, kind, action: action && (() => action.run()) }),
    run: (action) => void action.catch((error: { message: string }) => errors.push(error.message)),
  });
  const pane = fakePane("Favoris.md", log);
  const other = fakePane("a.md", log);
  columns.panes.set(1, pane);
  columns.panes.set(2, other);
  return {
    favorites,
    log,
    messages,
    errors,
    picker,
    pane,
    other,
    setNote: (n: typeof note) => (note = n),
  };
}

describe("favoris : l'état de l'étoile", () => {
  it("est cachée sur la note des favoris, sans demander si elle est en favori", async () => {
    const t = setup();
    expect(await t.favorites.star.state("Favoris.md")).toBe("hidden");
    expect(t.log).toEqual(["note des favoris"]);
  });

  it("est creuse sans note des favoris, sans rien demander de plus", async () => {
    const t = setup({ note: null });
    expect(await t.favorites.star.state("a.md")).toBe("empty");
    expect(t.log).toEqual(["note des favoris"]);
  });

  it("est pleine sur un favori, creuse sinon", async () => {
    const t = setup();
    expect(await t.favorites.star.state("a.md")).toBe("filled");
    expect(await t.favorites.star.state("b.md")).toBe("empty");
  });
});

describe("favoris : un clic sur l'étoile", () => {
  it("creuse : ajoute aux favoris, le dit, relit l'étoile de chaque colonne et la note des favoris ouverte", async () => {
    const t = setup();
    await t.favorites.star.toggle("b.md", "empty");
    expect(t.messages).toEqual([
      { text: "Ajouté aux favoris", kind: undefined, action: undefined },
    ]);
    expect(t.log).toEqual([
      "note des favoris",
      "ajouter b.md",
      "étoile Favoris.md",
      "étoile a.md",
      "note des favoris",
      "relire Favoris.md",
    ]);
  });

  it("pleine : retire sans confirmation, et propose « Annuler » qui remet les lignes telles quelles", async () => {
    const t = setup();
    await t.favorites.star.toggle("a.md", "filled");
    expect(t.messages).toHaveLength(1);
    expect(t.messages[0]?.text).toBe("Retiré des favoris");
    expect(t.messages[0]?.kind).toBe("success");
    expect(t.log).toEqual([
      "retirer a.md",
      "étoile Favoris.md",
      "étoile a.md",
      "note des favoris",
      "relire Favoris.md",
    ]);
    t.log.length = 0;
    await t.messages[0]?.action?.();
    expect(t.log).toEqual([
      `restaurer ${JSON.stringify([LINE])}`,
      "étoile Favoris.md",
      "étoile a.md",
      "note des favoris",
      "relire Favoris.md",
    ]);
  });

  it("pleine mais plus en favori : relit l'étoile, sans message ni « Annuler »", async () => {
    const t = setup({ removed: [] });
    await t.favorites.star.toggle("a.md", "filled");
    expect(t.messages).toEqual([]);
    expect(t.log).toContain("étoile a.md");
  });

  it("sans note des favoris : ouvre les réglages sur « Favoris », sans rien ajouter", async () => {
    const t = setup({ note: null });
    await t.favorites.star.toggle("b.md", "empty");
    expect(t.log).toEqual(["note des favoris", "réglages Favoris"]);
    expect(t.messages).toEqual([]);
  });

  it("une erreur du moteur remonte telle quelle à l'appelant", async () => {
    const t = setup({ failing: "ajouter" });
    await expect(t.favorites.star.toggle("b.md", "empty")).rejects.toEqual({
      message: "ajouter refusé",
    });
    expect(t.messages).toEqual([]);
  });

  it("une erreur en annulant est dite, jamais passée sous silence", async () => {
    const t = setup({ failing: "restaurer" });
    await t.favorites.star.toggle("a.md", "filled");
    await expect(t.messages[0]?.action?.()).rejects.toEqual({ message: "restaurer refusé" });
  });
});

describe("favoris : l'entrée de la liste des dossiers", () => {
  it("ouvre la note des favoris", async () => {
    const t = setup();
    await t.favorites.open();
    expect(t.log).toEqual(["note des favoris", "ouvrir Favoris.md"]);
  });

  it("sans note des favoris, ouvre les réglages sur l'onglet « Favoris »", async () => {
    const t = setup({ note: null });
    await t.favorites.open();
    expect(t.log).toEqual(["note des favoris", "réglages Favoris"]);
  });
});

const button = (group: HTMLElement, name: string) =>
  [...group.querySelectorAll("button")].find((b) => b.textContent === name) as HTMLButtonElement;

describe("favoris : l'onglet des réglages", () => {
  async function opened(options: Options = {}) {
    const t = setup(options);
    const [group] = t.favorites.settingsGroups();
    document.body.append(group as HTMLElement);
    await settle();
    t.log.length = 0;
    return { ...t, group: group as HTMLElement };
  }

  it("montre la note des favoris, ou « Aucune » ; rien sans espace de travail", async () => {
    const t = await opened();
    expect(t.group.querySelector("output")?.textContent).toBe("Favoris");
    const none = await opened({ note: null });
    expect(none.group.querySelector("output")?.textContent).toBe("Aucune");
  });

  it("n'a rien à montrer sans espace de travail ouvert", () => {
    const t = setup();
    const accueil = createFavorites({
      ...({ backend: {} } as unknown as Parameters<typeof createFavorites>[0]),
      screen: recordedScreen(welcome).screen,
    });
    expect(accueil.settingsGroups()).toEqual([]);
    expect(t.favorites.settingsGroups()).toHaveLength(1);
  });

  it("« Choisir une note » liste les notes seules, filtrées, et choisit celle qu'on clique", async () => {
    const t = await opened();
    button(t.group, "Choisir une note").click();
    await expect.poll(() => t.picker.open).toBe(true);
    expect(t.picker.getAttribute("aria-label")).toBe("Choisir une note");
    const options = () => [...t.picker.querySelectorAll(".picker-option")];
    expect(options().map((o) => o.textContent)).toEqual([
      expect.stringContaining("Courses"),
      expect.stringContaining("Favoris"),
    ]);
    t.log.length = 0;
    (options()[0] as HTMLElement).click();
    await settle();
    expect(t.log).toEqual([
      "choisir Courses.md",
      "étoile Favoris.md",
      "étoile a.md",
      "note des favoris",
    ]);
    expect(t.group.querySelector("output")?.textContent).toBe("Courses.md");
  });

  it("annuler le choix d'une note ne change rien", async () => {
    const t = await opened();
    button(t.group, "Choisir une note").click();
    await expect.poll(() => t.picker.open).toBe(true);
    t.log.length = 0;
    t.picker.close();
    await settle();
    expect(t.log).toEqual(["note des favoris"]);
  });

  it("« Créer la note des favoris » crée à la racine sous le nom proposé, relit la liste et l'ouvre", async () => {
    const t = await opened({ note: null });
    button(t.group, "Créer la note des favoris").click();
    button(t.group, "Créer").click();
    await settle();
    expect(t.log).toEqual([
      "créer « Favoris » dans «  »",
      "liste",
      "ouvrir Favoris.md",
      "étoile Favoris.md",
      "étoile a.md",
      "note des favoris",
    ]);
    expect(t.group.querySelector("output")?.textContent).toBe("Favoris");
  });

  it("« Ne plus utiliser de note des favoris » retire le choix et relit les étoiles", async () => {
    const t = await opened();
    button(t.group, "Ne plus utiliser de note des favoris").click();
    await settle();
    expect(t.log).toEqual(["arrêter", "étoile Favoris.md", "étoile a.md", "note des favoris"]);
    expect(t.group.querySelector("output")?.textContent).toBe("Aucune");
  });

  it("une erreur du moteur est dite, la note affichée ne change pas", async () => {
    const t = await opened({ failing: "créer" });
    button(t.group, "Créer la note des favoris").click();
    button(t.group, "Créer").click();
    await settle();
    expect(t.errors).toEqual(["créer refusé"]);
    expect(t.group.querySelector("output")?.textContent).toBe("Favoris");
  });

  it("ouvert par l'étoile sans note des favoris : la note choisie reçoit aussitôt le contenu cliqué", async () => {
    const t = setup({ note: null });
    await t.favorites.star.toggle("b.md", "empty");
    const [group] = t.favorites.settingsGroups();
    await settle();
    t.log.length = 0;
    button(group as HTMLElement, "Choisir une note").click();
    await expect.poll(() => t.picker.open).toBe(true);
    (t.picker.querySelector(".picker-option") as HTMLElement).click();
    await settle();
    expect(t.log).toContain("ajouter b.md");
    expect(t.messages.map((m) => m.text)).toEqual(["Ajouté aux favoris"]);
    // Une fois seulement : une autre ouverture des réglages n'ajoute rien.
    const [again] = t.favorites.settingsGroups();
    await settle();
    t.log.length = 0;
    button(again as HTMLElement, "Ne plus utiliser de note des favoris").click();
    await settle();
    expect(t.log).not.toContain("ajouter b.md");
  });

  it("ouvert par l'étoile : créer la note ajoute aussi le contenu cliqué", async () => {
    const t = setup({ note: null });
    await t.favorites.star.toggle("b.md", "empty");
    const [group] = t.favorites.settingsGroups();
    await settle();
    t.log.length = 0;
    button(group as HTMLElement, "Créer la note des favoris").click();
    button(group as HTMLElement, "Créer").click();
    await settle();
    expect(t.log).toContain("ajouter b.md");
  });
});
