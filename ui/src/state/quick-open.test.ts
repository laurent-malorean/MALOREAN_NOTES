import { describe, expect, it } from "vitest";
import type { LibraryNoteItem } from "../bridge";
import { MAX_QUICK_OPEN_RESULTS, matchingNotes } from "./quick-open";

const note = (title: string, folder = ""): LibraryNoteItem => ({
  path: `${folder ? `${folder}/` : ""}${title.toLowerCase()}.md`,
  title,
  folder,
});

const titles = (notes: readonly LibraryNoteItem[], query: string) =>
  matchingNotes(notes, query).map((n) => n.title);

describe("ouverture rapide : notes proposées", () => {
  const notes = [note("Réunion lundi", "Travail"), note("Courses"), note("Recette de crêpes")];

  it("propose toutes les notes, dans leur ordre, sans rien taper", () => {
    expect(titles(notes, "")).toEqual(["Réunion lundi", "Courses", "Recette de crêpes"]);
    expect(titles(notes, "   ")).toEqual(["Réunion lundi", "Courses", "Recette de crêpes"]);
  });

  it("propose d'abord les notes récentes sans rien taper, et seulement alors", () => {
    const recent = ["recette de crêpes.md", "courses.md"];
    const ordered = (query: string) => matchingNotes(notes, query, recent).map((n) => n.title);
    expect(ordered("")).toEqual(["Recette de crêpes", "Courses", "Réunion lundi"]);
    expect(ordered(" ")).toEqual(["Recette de crêpes", "Courses", "Réunion lundi"]);
    expect(ordered("r")).toEqual(["Réunion lundi", "Recette de crêpes", "Courses"]);
  });

  it("garde les notes dont le titre contient chaque mot tapé, majuscules et accents ignorés", () => {
    expect(titles(notes, "CREPE")).toEqual(["Recette de crêpes"]);
    expect(titles(notes, "re de")).toEqual(["Recette de crêpes"]);
    expect(titles(notes, "recette  de")).toEqual(["Recette de crêpes"]);
    expect(titles(notes, "lundi travail")).toEqual([]);
  });

  it("met d'abord les titres qui commencent par ce qui est tapé", () => {
    expect(titles(notes, "re")).toEqual(["Réunion lundi", "Recette de crêpes"]);
    expect(titles([note("Une recette"), note("Recette")], "rec")).toEqual([
      "Recette",
      "Une recette",
    ]);
    expect(titles([note("Une recette"), note("Recette")], "  rec  ")).toEqual([
      "Recette",
      "Une recette",
    ]);
    expect(titles([note("Une recette de x"), note("Recette de crêpes")], "recette de")).toEqual([
      "Recette de crêpes",
      "Une recette de x",
    ]);
  });

  it("n'en propose pas plus que la limite", () => {
    const many = Array.from({ length: MAX_QUICK_OPEN_RESULTS + 5 }, (_, i) => note(`Note ${i}`));
    expect(matchingNotes(many, "")).toHaveLength(MAX_QUICK_OPEN_RESULTS);
    expect(MAX_QUICK_OPEN_RESULTS).toBe(50);
  });
});
