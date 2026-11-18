import { describe, expect, it } from "vitest";
import {
  folderSelected,
  libraryOpened,
  noteOrder,
  orderChosen,
  type Screen,
  searchTyped,
  tagSelected,
  welcome,
} from "./screen";

const library = { name: "Notes", path: "/Users/moi/Notes" };
const library_ = (screen: Screen) => screen as Extract<Screen, { kind: "library" }>;

describe("tri de la liste à l'écran", () => {
  it("une bibliothèque s'ouvre sur le tri par date de modification, sauf tri gardé", () => {
    expect(noteOrder(libraryOpened(library, [], []))).toBe("modified");
    expect(noteOrder(libraryOpened(library, [], [], [], "title"))).toBe("title");
  });

  it("le tri choisi est gardé quand on change de dossier, d'étiquette ou de recherche", () => {
    const sorted = orderChosen(libraryOpened(library, ["Travail"], []), "title");
    expect(noteOrder(sorted)).toBe("title");
    expect(noteOrder(folderSelected(sorted, "Travail", []))).toBe("title");
    expect(noteOrder(tagSelected(sorted, "perso", []))).toBe("title");
    expect(noteOrder(searchTyped(sorted, "pain"))).toBe("title");
  });

  it("choisir un tri ne change rien d'autre", () => {
    const opened = libraryOpened(library, ["Travail"], []);
    expect(library_(orderChosen(opened, "title"))).toEqual({ ...library_(opened), order: "title" });
  });

  it("l'accueil n'a pas de tri à choisir", () => {
    expect(orderChosen(welcome, "title")).toBe(welcome);
    expect(noteOrder(welcome)).toBe("modified");
  });
});
