import { describe, expect, it } from "vitest";
import { connectSearchField } from "./search-field";

function field() {
  const input = document.createElement("input");
  document.body.replaceChildren(input);
  const typed: string[] = [];
  connectSearchField(input, (query) => typed.push(query));
  return { input, typed };
}

describe("champ de recherche", () => {
  it("signale chaque frappe avec tout le texte du champ", () => {
    const { input, typed } = field();
    input.value = "pa";
    input.dispatchEvent(new Event("input"));
    input.value = "pain";
    input.dispatchEvent(new Event("input"));
    expect(typed).toEqual(["pa", "pain"]);
  });

  it("Échap vide le champ et arrête la recherche", () => {
    const { input, typed } = field();
    input.value = "pain";
    const escape = new KeyboardEvent("keydown", { key: "Escape", cancelable: true });
    input.dispatchEvent(escape);
    expect(input.value).toBe("");
    expect(typed).toEqual([""]);
    expect(escape.defaultPrevented).toBe(true);
  });

  it("ignore les autres touches", () => {
    const { input, typed } = field();
    input.value = "pain";
    const enter = new KeyboardEvent("keydown", { key: "Enter", cancelable: true });
    input.dispatchEvent(enter);
    expect(input.value).toBe("pain");
    expect(typed).toEqual([]);
    expect(enter.defaultPrevented).toBe(false);
  });
});
