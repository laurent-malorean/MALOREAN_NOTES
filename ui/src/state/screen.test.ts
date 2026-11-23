import { describe, expect, it } from "vitest";
import type { MeaningSearchItem, NoteListItem, SearchResultItem } from "../bridge";
import {
  currentFolder,
  folderFolded,
  folderMoved,
  folderRevealed,
  folderSelected,
  foldersRefreshed,
  workspaceOpened,
  noteSelected,
  notesRefreshed,
  SEARCH_MIN_LENGTH,
  searchable,
  ideasAnswered,
  searchAnswered,
  searchedQuery,
  searchTyped,
  selectedNote,
  trashShown,
  welcome,
} from "./screen";

const workspace = { name: "Notes", path: "/Users/moi/Notes" };
const note = (path: string, modified: number): NoteListItem => ({
  path,
  title: path,
  modified,
  pinned: false,
  tags: [],
});

describe("état de l'écran", () => {
  it("commence par l'accueil", () => {
    expect(welcome).toEqual({ kind: "welcome" });
  });

  it("ouvre un espace de travail sur sa note la plus récente", () => {
    const screen = workspaceOpened(workspace, [], [note("recente.md", 2), note("vieille.md", 1)]);
    expect(screen).toEqual({
      kind: "workspace",
      workspace,
      folders: [],
      folder: "",
      notes: [note("recente.md", 2), note("vieille.md", 1)],
      selected: "recente.md",
      search: null,
      trash: null,
      folded: [],
      tag: null,
      tags: [],
      order: "modified",
      recent: false,
    });
  });

  it("ouvre un espace de travail vide sans note sélectionnée", () => {
    expect(workspaceOpened(workspace, [], [])).toEqual({
      kind: "workspace",
      workspace,
      folders: [],
      folder: "",
      notes: [],
      selected: null,
      search: null,
      trash: null,
      folded: [],
      tag: null,
      tags: [],
      order: "modified",
      recent: false,
    });
  });

  it("sélectionne la note choisie", () => {
    const screen = noteSelected(
      workspaceOpened(workspace, [], [note("a.md", 2), note("b.md", 1)]),
      "b.md",
    );
    expect(screen).toEqual({
      kind: "workspace",
      workspace,
      folders: [],
      folder: "",
      notes: [note("a.md", 2), note("b.md", 1)],
      selected: "b.md",
      search: null,
      trash: null,
      folded: [],
      tag: null,
      tags: [],
      order: "modified",
      recent: false,
    });
  });

  it("remplace la liste sans toucher à la sélection", () => {
    const screen = notesRefreshed(workspaceOpened(workspace, [], [note("a.md", 1)]), [
      note("b.md", 2),
      note("a.md", 1),
    ]);
    expect(screen).toEqual({
      kind: "workspace",
      workspace,
      folders: [],
      folder: "",
      notes: [note("b.md", 2), note("a.md", 1)],
      selected: "a.md",
      search: null,
      trash: null,
      folded: [],
      tag: null,
      tags: [],
      order: "modified",
      recent: false,
    });
  });

  it("ignore les actions sur les notes tant que l'accueil est affiché", () => {
    expect(folderSelected(welcome, "a", [])).toBe(welcome);
    expect(foldersRefreshed(welcome, ["a"])).toBe(welcome);
    expect(folderMoved(welcome, "a", "b")).toBe(welcome);
    expect(folderFolded(welcome, "a")).toBe(welcome);
    expect(folderRevealed(welcome, "a")).toBe(welcome);
    expect(noteSelected(welcome, "a.md")).toBe(welcome);
    expect(notesRefreshed(welcome, [note("a.md", 1)])).toBe(welcome);
    expect(searchTyped(welcome, "pain")).toBe(welcome);
    expect(searchAnswered(welcome, "pain", [])).toBe(welcome);
  });
});

describe("note sélectionnée", () => {
  it("est celle de l'espace de travail ouvert", () => {
    expect(selectedNote(workspaceOpened(workspace, [], [note("a.md", 1)]))).toBe("a.md");
  });

  it("n'existe pas sur l'accueil", () => {
    expect(selectedNote(welcome)).toBeNull();
  });
});

describe("dossiers", () => {
  const opened = workspaceOpened(workspace, ["Travail", "Travail/Réunions"], [note("a.md", 1)]);

  it("ouvre un espace de travail sur sa racine, avec ses dossiers", () => {
    expect(opened).toMatchObject({ folders: ["Travail", "Travail/Réunions"], folder: "" });
    expect(currentFolder(opened)).toBe("");
    expect(currentFolder(welcome)).toBe("");
  });

  it("choisit un dossier et sa note la plus récente", () => {
    const screen = folderSelected(opened, "Travail", [note("Travail/b.md", 2)]);
    expect(screen).toMatchObject({
      folder: "Travail",
      notes: [note("Travail/b.md", 2)],
      selected: "Travail/b.md",
    });
    expect(currentFolder(screen)).toBe("Travail");
  });

  it("remplace la liste des dossiers", () => {
    expect(foldersRefreshed(opened, ["Perso"])).toMatchObject({ folders: ["Perso"] });
  });

  it("suit le dossier affiché et la note ouverte quand leur dossier est déplacé", () => {
    const inside = folderSelected(opened, "Travail/Réunions", [note("Travail/Réunions/l.md", 1)]);
    expect(folderMoved(inside, "Travail", "Perso/Travail")).toMatchObject({
      folder: "Perso/Travail/Réunions",
      selected: "Perso/Travail/Réunions/l.md",
    });
  });

  it("ne touche à rien quand un autre dossier est déplacé", () => {
    const empty = folderSelected(opened, "Perso", []);
    expect(folderMoved(empty, "Travail", "x/Travail")).toMatchObject({
      folder: "Perso",
      selected: null,
      search: null,
      trash: null,
    });
  });
});

describe("recherche", () => {
  const result = (path: string): SearchResultItem => ({
    path,
    title: path,
    folder: "",
    contentType: "note",
    container: null,
    containerTitle: null,
    node: null,
    modified: 1,
    excerpt: [{ text: "pain", matched: true }],
  });
  const opened = () => workspaceOpened(workspace, [], [note("a.md", 1)]);
  const searchOf = (screen: ReturnType<typeof opened>) =>
    screen.kind === "workspace" ? screen.search : undefined;

  it("donne les mots cherchés seulement s'ils sont assez longs pour une recherche", () => {
    expect(searchedQuery(welcome)).toBeNull();
    expect(searchedQuery(opened())).toBeNull();
    expect(searchedQuery(searchTyped(opened(), "be"))).toBeNull();
    expect(searchedQuery(searchTyped(opened(), "beagle"))).toBe("beagle");
    expect(searchedQuery(searchTyped(opened(), "123"))).toBe("123");
  });

  it("commence une recherche dès qu'on tape, sans résultat encore", () => {
    expect(searchOf(searchTyped(opened(), "pain"))).toEqual({ query: "pain", results: null });
  });

  it("montre les notes trouvées pour la recherche en cours", () => {
    const screen = searchAnswered(searchTyped(opened(), "pain"), "pain", [result("a.md")]);
    expect(searchOf(screen)).toEqual({ query: "pain", results: [result("a.md")] });
  });

  it("garde la réponse de la recherche par le sens avec les notes trouvées par les mots", () => {
    const ideas: MeaningSearchItem = { results: [result("b.md")], meaning: { kind: "used" } };
    const answered = ideasAnswered(
      searchAnswered(searchTyped(opened(), "pain"), "pain", [result("a.md")]),
      "pain",
      ideas,
    );
    expect(searchOf(answered)).toEqual({ query: "pain", results: [result("a.md")], ideas });
    const reversed = searchAnswered(
      ideasAnswered(searchTyped(opened(), "pain"), "pain", ideas),
      "pain",
      [result("a.md")],
    );
    expect(searchOf(reversed)).toEqual(searchOf(answered));
  });

  it("garde aussi la réponse du sens pendant qu'on continue de taper, et l'oublie sous le seuil", () => {
    const ideas: MeaningSearchItem = {
      results: [],
      meaning: { kind: "failed", message: "raté" },
    };
    const answered = ideasAnswered(searchTyped(opened(), "pai"), "pai", ideas);
    expect(searchOf(searchTyped(answered, "pain"))).toEqual({
      query: "pain",
      results: null,
      ideas,
    });
    expect(searchOf(searchTyped(answered, "pa"))).toEqual({ query: "pa", results: null });
  });

  it("ignore la réponse du sens d'une recherche dépassée ou finie", () => {
    const ideas: MeaningSearchItem = { results: [], meaning: { kind: "used" } };
    const typed = searchTyped(searchTyped(opened(), "pai"), "pain");
    expect(ideasAnswered(typed, "pai", ideas)).toBe(typed);
    expect(ideasAnswered(opened(), "pain", ideas)).toEqual(opened());
    expect(ideasAnswered(welcome, "pain", ideas)).toBe(welcome);
  });

  it("garde les résultats précédents pendant qu'on continue de taper", () => {
    const answered = searchAnswered(searchTyped(opened(), "pai"), "pai", [result("a.md")]);
    expect(searchOf(searchTyped(answered, "pain"))).toEqual({
      query: "pain",
      results: [result("a.md")],
    });
  });

  it("ignore la réponse d'une recherche déjà dépassée", () => {
    const typed = searchTyped(searchTyped(opened(), "pai"), "pain");
    expect(searchAnswered(typed, "pai", [result("a.md")])).toBe(typed);
  });

  it("ignore une réponse arrivée après la fin de la recherche", () => {
    expect(searchAnswered(opened(), "pain", [result("a.md")])).toEqual(opened());
  });

  it("garde un texte trop court sans résultat, et oublie ceux d'avant", () => {
    const answered = searchAnswered(searchTyped(opened(), "pain"), "pain", [result("a.md")]);
    expect(searchOf(searchTyped(answered, "pa"))).toEqual({ query: "pa", results: null });
  });

  it("ne cherche qu'à partir de trois caractères, sauf pour un nombre", () => {
    expect(SEARCH_MIN_LENGTH).toBe(3);
    expect(searchable("pai")).toBe(true);
    expect(searchable(" pa ")).toBe(false);
    expect(searchable("a b")).toBe(true);
    expect(searchable("4")).toBe(true);
    expect(searchable("42")).toBe(true);
    expect(searchable("4a")).toBe(false);
    expect(searchable("a4")).toBe(false);
    expect(searchable("")).toBe(false);
  });

  it("revient à la liste du dossier quand le champ est vidé", () => {
    expect(searchOf(searchTyped(searchTyped(opened(), "pain"), "  "))).toBeNull();
  });

  it("revient à la liste quand on choisit un dossier", () => {
    const screen = folderSelected(searchTyped(opened(), "pain"), "Travail", []);
    expect(searchOf(screen)).toBeNull();
  });
});

describe("corbeille", () => {
  const trash = { folders: ["Travail"], notes: [{ path: "Travail/lundi.md", title: "Lundi" }] };
  const opened = () => workspaceOpened(workspace, ["Travail"], [note("a.md", 1)]);

  it("montre la corbeille à la place des notes du dossier", () => {
    const screen = trashShown(opened(), trash);
    expect(screen.kind === "workspace" && screen.trash).toEqual(trash);
  });

  it("ne montre rien sur l'accueil", () => {
    expect(trashShown(welcome, trash)).toBe(welcome);
  });

  it("quitte la corbeille quand on choisit un dossier", () => {
    const screen = folderSelected(trashShown(opened(), trash), "Travail", []);
    expect(screen.kind === "workspace" && screen.trash).toBeNull();
  });

  it("quitte la corbeille quand on cherche", () => {
    const screen = searchTyped(trashShown(opened(), trash), "lundi");
    expect(screen.kind === "workspace" && screen.trash).toBeNull();
  });
});

describe("dossiers pliés", () => {
  const folders = ["Perso", "Travail", "Travail/Réunions", "Travail/Réunions/2026"];
  const opened = workspaceOpened(workspace, folders, [], ["Travail", "Travail/Réunions"]);

  it("un espace de travail s'ouvre avec ses dossiers pliés gardés, ou tous dépliés", () => {
    expect(opened).toMatchObject({ folded: ["Travail", "Travail/Réunions"] });
    expect(workspaceOpened(workspace, folders, [])).toMatchObject({ folded: [] });
  });

  it("plie ou déplie un dossier sans le choisir", () => {
    expect(folderFolded(opened, "Travail")).toMatchObject({
      folder: "",
      folded: ["Travail/Réunions"],
    });
    expect(folderFolded(opened, "Perso")).toMatchObject({
      folded: ["Travail", "Travail/Réunions", "Perso"],
    });
  });

  it("choisir un dossier déplie ceux qui le contiennent", () => {
    const screen = folderSelected(opened, "Travail/Réunions/2026", []);
    expect(screen).toMatchObject({ folder: "Travail/Réunions/2026", folded: [] });
    expect(folderSelected(opened, "Travail/Réunions", [])).toMatchObject({
      folded: ["Travail/Réunions"],
    });
  });

  it("un dossier qui reçoit une note déplie ceux qui le contiennent, sans être choisi", () => {
    expect(folderRevealed(opened, "Travail/Réunions/2026")).toMatchObject({
      folder: "",
      folded: [],
    });
  });

  it("les dossiers pliés suivent un dossier déplacé ; le dossier affiché reste visible", () => {
    const inside = { ...folderSelected(opened, "Travail", []), folded: ["Perso", "Travail"] };
    expect(folderMoved(inside, "Travail", "Perso/Travail")).toMatchObject({
      folder: "Perso/Travail",
      folded: ["Perso/Travail"],
    });
    expect(folderMoved(opened, "Travail/Réunions", "Perso/Réunions")).toMatchObject({
      folded: ["Travail", "Perso/Réunions"],
    });
  });
});
