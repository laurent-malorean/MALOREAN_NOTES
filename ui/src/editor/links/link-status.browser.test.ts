import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LinkResolutionItem } from "../../bridge";
import { createEditor } from "../editor";
import { AMBIGUOUS_HINT, LINK_CHECK_DELAY_MS } from "./link-status";
import "../../theme.css";
import "../../style.css";

/** Ce que Rust répond : « Courses » est ambigu, « Plan » absent, le reste trouvé. */
const answer = (targets: readonly string[]): LinkResolutionItem[] =>
  targets.map((target) =>
    target === "Courses"
      ? { kind: "ambiguous", paths: ["a.md", "b.md"] }
      : target === "Plan"
        ? { kind: "missing" }
        : { kind: "found", path: `${target}.md` },
  );

function mount(content: string, resolve = vi.fn(async (t: readonly string[]) => answer(t))) {
  const parent = document.createElement("div");
  parent.className = "editor";
  document.body.replaceChildren(parent);
  const editor = createEditor(parent, () => {}, {
    openLink: () => {},
    links: { contents: async () => [], row: (item) => ({ label: item.title }), resolve },
  });
  editor.show(content);
  const view = EditorView.findFromDOM(parent.querySelector(".cm-editor") as HTMLElement);
  if (!view) throw new Error("éditeur introuvable");
  return { editor, view, parent, resolve };
}

const ambiguous = (parent: HTMLElement) =>
  [...parent.querySelectorAll(".cm-note-link-ambiguous")].map((e) => e.textContent);

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("liens ambigus dans l'éditeur", () => {
  it("souligne les liens dont Rust dit qu'ils sont ambigus, et eux seuls, avec une bulle d'aide", async () => {
    const { parent } = mount("Voir [[Courses]], [[Agenda]] et [[Plan]] puis [[Courses|la liste]].");
    await vi.waitFor(() => expect(ambiguous(parent)).toEqual(["Courses", "la liste"]));
    expect(parent.querySelector(".cm-note-link-ambiguous")?.getAttribute("title")).toBe(
      AMBIGUOUS_HINT,
    );
    expect(parent.querySelectorAll(".cm-note-link")).toHaveLength(4);
  });

  it("ne demande à Rust que les cibles différentes, une fois chacune", async () => {
    const { resolve, parent } = mount("[[Courses]] [[Agenda]] [[Courses|ma liste]] [[ Agenda ]]");
    await vi.waitFor(() => expect(ambiguous(parent)).toHaveLength(2));
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(resolve).toHaveBeenCalledWith(["Courses", "Agenda"]);
  });

  it("ne demande rien quand la note n'a aucun lien", async () => {
    vi.useFakeTimers();
    const { resolve } = mount("du texte sans lien");
    await vi.advanceTimersByTimeAsync(LINK_CHECK_DELAY_MS * 2);
    expect(resolve).not.toHaveBeenCalled();
  });

  it("redemande après une pause de frappe, pas à chaque lettre", async () => {
    vi.useFakeTimers();
    const { view, resolve } = mount("[[Agenda]]");
    await vi.advanceTimersByTimeAsync(0);
    expect(resolve).toHaveBeenCalledTimes(1);
    view.dispatch({ changes: { from: 10, insert: " [[Cour" } });
    await vi.advanceTimersByTimeAsync(LINK_CHECK_DELAY_MS - 1);
    view.dispatch({ changes: { from: 17, insert: "ses]]" } });
    await vi.advanceTimersByTimeAsync(LINK_CHECK_DELAY_MS - 1);
    expect(resolve).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(resolve).toHaveBeenCalledTimes(2);
    expect(resolve).toHaveBeenLastCalledWith(["Agenda", "Courses"]);
  });

  it("un lien devenu ambigu au fil de la frappe est souligné, un lien corrigé ne l'est plus", async () => {
    const { view, parent } = mount("[[Agenda]]");
    await vi.waitFor(() => expect(parent.querySelectorAll(".cm-note-link")).toHaveLength(1));
    view.dispatch({ changes: { from: 2, to: 8, insert: "Courses" } });
    await vi.waitFor(() => expect(ambiguous(parent)).toEqual(["Courses"]));
    view.dispatch({ changes: { from: 2, to: 9, insert: "Vieux/Courses" } });
    await vi.waitFor(() => expect(ambiguous(parent)).toEqual([]));
  });

  it("redemande quand l'éditeur reprend le focus : une note a pu être créée entre-temps", async () => {
    const { view, resolve, parent } = mount("[[Courses]]");
    await vi.waitFor(() => expect(ambiguous(parent)).toEqual(["Courses"]));
    const before = resolve.mock.calls.length;
    view.focus();
    await vi.waitFor(() => expect(resolve.mock.calls.length).toBeGreaterThan(before));
  });

  it("garde le texte comme avant quand Rust ne répond pas", async () => {
    const failing = vi.fn(async () => Promise.reject(new Error("illisible")));
    const { parent } = mount("[[Courses]]", failing);
    await vi.waitFor(() => expect(failing).toHaveBeenCalled());
    await Promise.resolve();
    expect(ambiguous(parent)).toEqual([]);
    expect(parent.querySelectorAll(".cm-note-link")).toHaveLength(1);
  });

  it("ne dessine rien et ne demande rien après la destruction de l'éditeur", async () => {
    vi.useFakeTimers();
    const { editor, resolve } = mount("[[Courses]]");
    editor.destroy();
    await vi.advanceTimersByTimeAsync(LINK_CHECK_DELAY_MS * 2);
    expect(resolve).not.toHaveBeenCalled();
  });
});
