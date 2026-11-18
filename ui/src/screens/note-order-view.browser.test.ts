import { describe, expect, it } from "vitest";
import type { NoteOrder } from "../state/note-order";
import { renderNoteOrder } from "./note-order-view";

function choice() {
  const label = document.createElement("label");
  const select = document.createElement("select");
  label.append(select);
  document.body.replaceChildren(label);
  return { label, select };
}

describe("choix du tri de la liste", () => {
  it("propose les trois tris, une seule fois, et montre celui de la liste", () => {
    const { label, select } = choice();
    renderNoteOrder(select, "modified", () => {});
    renderNoteOrder(select, "title", () => {});
    const options = [...select.options].map((option) => [option.value, option.textContent]);
    expect(options).toEqual([
      ["modified", "Date de modification"],
      ["title", "Titre"],
    ]);
    expect(select.value).toBe("title");
    expect(label.hidden).toBe(false);
  });

  it("en choisir un autre le demande", () => {
    const { select } = choice();
    const asked: NoteOrder[] = [];
    renderNoteOrder(select, "modified", () => asked.push("modified"));
    renderNoteOrder(select, "modified", (order) => asked.push(order));
    select.value = "title";
    select.dispatchEvent(new Event("change"));
    expect(asked).toEqual(["title"]);
  });

  it("est caché quand la liste n'a pas de tri, sans oublier le dernier", () => {
    const { label, select } = choice();
    renderNoteOrder(select, "title", () => {});
    renderNoteOrder(select, null, () => {});
    expect(label.hidden).toBe(true);
    expect(select.value).toBe("title");
  });
});
