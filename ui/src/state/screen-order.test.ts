import { describe, expect, it } from "vitest";
import {
  folderSelected,
  workspaceOpened,
  noteOrder,
  orderChosen,
  type Screen,
  searchTyped,
  tagSelected,
  welcome,
} from "./screen";

const workspace = { name: "Notes", path: "/Users/moi/Notes" };
const workspace_ = (screen: Screen) => screen as Extract<Screen, { kind: "workspace" }>;

describe("tri de la liste à l'écran", () => {
  it("un espace de travail s'ouvre sur le tri par date de modification, sauf tri gardé", () => {
    expect(noteOrder(workspaceOpened(workspace, [], []))).toBe("modified");
    expect(noteOrder(workspaceOpened(workspace, [], [], [], "title"))).toBe("title");
  });

  it("le tri choisi est gardé quand on change de dossier, d'étiquette ou de recherche", () => {
    const sorted = orderChosen(workspaceOpened(workspace, ["Travail"], []), "title");
    expect(noteOrder(sorted)).toBe("title");
    expect(noteOrder(folderSelected(sorted, "Travail", []))).toBe("title");
    expect(noteOrder(tagSelected(sorted, "perso", []))).toBe("title");
    expect(noteOrder(searchTyped(sorted, "pain"))).toBe("title");
  });

  it("choisir un tri ne change rien d'autre", () => {
    const opened = workspaceOpened(workspace, ["Travail"], []);
    expect(workspace_(orderChosen(opened, "title"))).toEqual({
      ...workspace_(opened),
      order: "title",
    });
  });

  it("l'accueil n'a pas de tri à choisir", () => {
    expect(orderChosen(welcome, "title")).toBe(welcome);
    expect(noteOrder(welcome)).toBe("modified");
  });
});
