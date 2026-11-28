// Montrer une entrée d'un cahier de recherche par son numéro d'entrée (fiche 0107) : l'éditeur
// y défile, y place le curseur et la met brièvement en évidence.
import { EditorView } from "@codemirror/view";
import { describe, expect, it } from "vitest";
import { createEditor } from "./editor";
import "../theme.css";
import "../style.css";

const FILLER = Array.from(
  { length: 40 },
  (_, n) => `- 09:${String(n).padStart(2, "0")} - ligne ${n}`,
);
const NOTEBOOK = [
  "---",
  "type: cahier-de-recherche",
  "---",
  "# Levures",
  "",
  "- 08:00 - première",
  "  suite de la première",
  "",
  "  paragraphe de la première",
  "- 08:30 - seconde",
  ...FILLER,
  "",
].join("\n");

function mount(content: string) {
  const parent = document.createElement("div");
  parent.className = "editor";
  parent.style.height = "300px";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {}, { copyReference: () => {} });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { parent, editor, view };
}

/** Le texte de chaque ligne en évidence, sans le numéro d'entrée ni la puce que l'aperçu y ajoute. */
const flashed = (parent: HTMLElement) =>
  [...parent.querySelectorAll(".cm-line.entry-flash")].map((line) =>
    (line.textContent ?? "").replace(/^\d+•?/, "").trim(),
  );

describe("montrer une entrée par son numéro", () => {
  it("place le curseur au début de l'entrée et met en évidence toutes ses lignes", () => {
    const { parent, editor, view } = mount(NOTEBOOK);
    expect(editor.revealEntry(1)).toBe(true);
    expect(view.state.selection.main.head).toBe(NOTEBOOK.indexOf("- 08:00"));
    expect(flashed(parent)).toEqual([
      "08:00 - première",
      "suite de la première",
      "",
      "paragraphe de la première",
    ]);
  });

  it("défile jusqu'à une entrée lointaine, qui se place en haut, et ne met en évidence que celle-là", async () => {
    const { parent, editor, view } = mount(NOTEBOOK);
    expect(editor.revealEntry(30)).toBe(true);
    expect(view.state.selection.main.head).toBe(NOTEBOOK.indexOf("- 09:27"));
    expect(flashed(parent)).toEqual(["09:27 - ligne 27"]);
    const target = () => parent.querySelector(".cm-line.entry-flash") as HTMLElement;
    const frame = view.scrollDOM;
    await expect.poll(() => frame.scrollTop).toBeGreaterThan(0);
    await expect
      .poll(() => target().getBoundingClientRect().top - frame.getBoundingClientRect().top)
      .toBeLessThan(80);
  });

  it("l'évidence s'éteint à la fin de son animation", () => {
    const { parent, editor } = mount(NOTEBOOK);
    editor.revealEntry(2);
    const line = parent.querySelector(".cm-line.entry-flash") as HTMLElement;
    line.dispatchEvent(new Event("animationend", { bubbles: true }));
    expect(flashed(parent)).toEqual([]);
  });

  it("une entrée qui n'existe pas (0 ou au-delà de la dernière) ne change rien", () => {
    const { parent, editor, view } = mount(NOTEBOOK);
    const before = view.state.selection.main.head;
    for (const number of [0, 43, -1, 1.5]) expect(editor.revealEntry(number)).toBe(false);
    expect(view.state.selection.main.head).toBe(before);
    expect(flashed(parent)).toEqual([]);
  });

  it("une note ordinaire n'a pas d'entrée", () => {
    const { editor } = mount("# Note\n\n- 08:00 - une puce\n");
    expect(editor.revealEntry(1)).toBe(false);
  });

  it("la couleur et la durée de l'évidence viennent du thème", () => {
    const { parent, editor } = mount(NOTEBOOK);
    editor.revealEntry(1);
    const line = parent.querySelector(".cm-line.entry-flash") as HTMLElement;
    const style = getComputedStyle(line);
    const root = getComputedStyle(document.documentElement);
    expect(root.getPropertyValue("--entry-flash").trim()).not.toBe("");
    expect(root.getPropertyValue("--entry-flash-duration").trim()).not.toBe("");
    expect(style.animationName).toBe("entry-flash");
    expect(Number.parseFloat(style.animationDuration)).toBeGreaterThan(0);
  });
});
