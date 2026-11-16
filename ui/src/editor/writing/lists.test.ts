import { describe, expect, it } from "vitest";
import { isEmptyItem } from "./lists";

describe("élément de liste ou de citation vide", () => {
  it("reconnaît une puce, un numéro, une tâche ou une citation sans texte", () => {
    for (const line of [
      "- ",
      "* ",
      "+ ",
      "1. ",
      "12) ",
      "- [ ] ",
      "- [x] ",
      "> ",
      ">",
      "> > ",
      "  - ",
    ]) {
      expect(isEmptyItem(line), line).toBe(true);
    }
  });

  it("ne confond pas un élément qui a du texte, ni une ligne ordinaire", () => {
    for (const line of ["- a", "1. a", "- [ ] a", "> a", "", "texte", "-", "1.", "--- ", "a - "]) {
      expect(isEmptyItem(line), line).toBe(false);
    }
  });
});
