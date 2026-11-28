import { EditorView } from "@codemirror/view";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agenda12Item } from "../bridge";
import { agendaItem, COUNTRIES, detailOf, eventItem } from "../../test-support/agenda-12-fixture";
import { fakeBackend, manualScheduler } from "../../test-support/pane-fixture";
import type { Agenda12Deps } from "./agenda-12-pane";
import { createPane } from "./note-pane";
import { createSharedNotes } from "./shared-notes";
import "../theme.css";
import "../style.css";

const AGENDA_NOTE = "---\ntype: agenda-12\n---\n# Salons\n";
const EVENT_NOTE = "---\ntype: agenda-12-evenement\nmois: 2\n---\n# Salon Embedded World\n\nBudget";
const EVENT = "pro/salons/embedded.md";

afterEach(() => document.body.replaceChildren());

function mount(withAgenda = true) {
  const element = document.createElement("section");
  element.className = "column";
  element.style.cssText = "width:1400px;height:700px;display:flex;flex-direction:column";
  const star = document.createElement("button");
  const backlinks = document.createElement("nav");
  const related = document.createElement("nav");
  const tags = document.createElement("div");
  element.append(tags, star, backlinks, related);
  document.body.replaceChildren(element);
  const fake = fakeBackend({
    "pro/salons.md": AGENDA_NOTE,
    [EVENT]: EVENT_NOTE,
    "autre.md": "# Autre\n\ntexte",
  });
  const calls: string[] = [];
  const errors: unknown[] = [];
  const state = { agenda: (): Agenda12Item => agendaItem([eventItem()]), failRead: false };
  const ignore = () => {};
  const shared = createSharedNotes({
    backend: fake.backend,
    scheduler: manualScheduler().scheduler,
    events: { saved: ignore, titled: ignore, deleted: ignore, error: ignore },
  });
  const agenda12: Agenda12Deps = {
    errorText: (error) => (error as { message: string }).message,
    askClosing: async () => "alone",
    trashEvent: async (event) => void calls.push(`corbeille ${event.path}`),
    open: async (path, focusTitle) => void calls.push(`ouvrir ${path} ${focusTitle}`),
    backend: {
      readAgenda12: async (path, tag) => {
        calls.push(`lire agenda ${path} ${tag}`);
        if (state.failRead) throw new Error("agenda illisible");
        return state.agenda();
      },
      changeAgenda12Columns: async () => null,
      changeAgenda12Layout: async () => null,
      createAgenda12Event: async () => ({ path: "x.md" }),
      reopenAgenda12Event: async () => ({ path: "x.md" }),
      readAgenda12Event: async (path) => {
        calls.push(`lire événement ${path}`);
        return detailOf();
      },
      changeAgenda12Event: async (path, change) => {
        calls.push(`changer ${path} ${change.kind}`);
        return null;
      },
      closeAgenda12Event: async () => ({ closed: "a", successor: null }),
      listCountries: async () => COUNTRIES,
    },
  };
  const pane = createPane(
    { element, star, tags, backlinks, related },
    {
      backend: fake.backend,
      favorites: { state: async () => "empty", toggle: async () => {} },
      shared,
      events: { openNote: ignore, openLink: ignore, error: (e) => errors.push(e) },
      resolveImage: (src) => src,
      ...(withAgenda ? { agenda12 } : {}),
    },
  );
  return { pane, element, star, calls, errors, state, notes: fake.notes };
}

const grid = (element: HTMLElement) => element.querySelector(".agenda-grid");
const band = (element: HTMLElement) => element.querySelector(".agenda-band");

describe("colonne : un agenda 12", () => {
  it("montre sa grille à la place de l'éditeur, puis l'éditeur pour une note ordinaire", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    expect(m.element.classList.contains("agenda-shown")).toBe(true);
    await vi.waitFor(() => expect(grid(m.element)).not.toBeNull());
    expect(getComputedStyle(m.element.querySelector(".cm-editor") as HTMLElement).display).toBe(
      "none",
    );
    await m.pane.load("autre.md");
    expect(m.element.classList.contains("agenda-shown")).toBe(false);
    expect(m.element.querySelector(".agenda")).toBeNull();
    await m.pane.load(null);
    expect(m.element.querySelector(".agenda")).toBeNull();
  });

  it("l'étoile des favoris reste sur l'agenda 12", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    await vi.waitFor(() => expect(m.star.hidden).toBe(false));
  });

  it("suit un changement du disque sur la note, ou sur l'un de ses événements, archives comprises", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    await m.pane.followDisk();
    expect(m.calls).toHaveLength(2);
    await m.pane.followCrm(["pro/salons/embedded.md"]);
    expect(m.calls).toHaveLength(3);
    await m.pane.followCrm(["pro/salons/archives/vieux.md"]);
    expect(m.calls).toHaveLength(4);
  });

  it("ne relit pas la grille pour un fichier qui n'est pas l'un de ses événements", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    await vi.waitFor(() => expect(m.calls).toHaveLength(1));
    await m.pane.followCrm(["pro/salons-2/a.md", "autre.md"]);
    expect(m.calls).toHaveLength(1);
  });

  it("une erreur de lecture de la grille est annoncée", async () => {
    const m = mount();
    m.state.failRead = true;
    await m.pane.load("pro/salons.md");
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
  });

  it("ouvre un événement de la grille par la colonne, le curseur sur son titre à la création", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    await vi.waitFor(() => expect(grid(m.element)).not.toBeNull());
    m.element.querySelector<HTMLElement>(".agenda-line")?.click();
    expect(m.calls).toContain(`ouvrir ${EVENT} false`);
  });

  it("détruire la colonne retire la grille", async () => {
    const m = mount();
    await m.pane.load("pro/salons.md");
    m.pane.destroy();
    expect(m.element.querySelector(".agenda")).toBeNull();
  });

  it("sans agenda 12 branché, la note reste du texte", async () => {
    const m = mount(false);
    await m.pane.load("pro/salons.md");
    await m.pane.load(EVENT);
    expect(m.element.classList.contains("agenda-shown")).toBe(false);
    expect(band(m.element)).toBeNull();
    await m.pane.followCrm(["pro/salons/a.md"]);
    m.pane.focusEventTitle();
    expect(m.calls).toEqual([]);
  });
});

describe("colonne : un événement d'un agenda 12", () => {
  it("montre sa bande au-dessus du texte de sa note, qui reste dans l'éditeur", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    const editor = m.element.querySelector(".cm-editor") as HTMLElement;
    expect(getComputedStyle(editor).display).not.toBe("none");
    const above = (band(m.element) as HTMLElement).getBoundingClientRect().bottom;
    expect(above).toBeLessThanOrEqual(editor.getBoundingClientRect().top);
    expect(EditorView.findFromDOM(editor)?.state.doc.toString()).toBe(EVENT_NOTE);
    await m.pane.load("autre.md");
    expect(band(m.element)).toBeNull();
  });

  it("n'a pas d'étoile : seul l'agenda 12 entier se met en favori", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    await m.pane.showStar();
    expect(m.star.hidden).toBe(true);
    await m.pane.load("autre.md");
    await vi.waitFor(() => expect(m.star.hidden).toBe(false));
  });

  it("met le curseur sur le titre de la bande", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    m.pane.focusEventTitle();
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Titre");
  });

  it("un geste d'un champ relit le texte de la note et la bande", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    const city = m.element.querySelector("[aria-label='Ville']") as HTMLInputElement;
    city.value = "Hanovre";
    city.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(m.calls).toContain(`changer ${EVENT} city`));
    await vi.waitFor(() =>
      expect(m.calls.filter((c) => c === `lire événement ${EVENT}`).length).toBeGreaterThan(1),
    );
  });

  it("une note enregistrée relit la bande : son titre est celui du texte", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    const before = m.calls.filter((c) => c.startsWith("lire événement")).length;
    const editor = EditorView.findFromDOM(m.element.querySelector(".cm-editor") as HTMLElement);
    editor?.dispatch({ changes: { from: editor.state.doc.length, insert: " de plus" } });
    await m.pane.flush();
    await vi.waitFor(() =>
      expect(m.calls.filter((c) => c.startsWith("lire événement")).length).toBe(before + 1),
    );
  });

  it("suit un changement du disque sur sa note", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    const before = m.calls.length;
    await m.pane.followDisk();
    expect(m.calls.length).toBeGreaterThan(before);
  });

  it("détruire la colonne retire la bande", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await vi.waitFor(() => expect(band(m.element)).not.toBeNull());
    m.pane.destroy();
    expect(band(m.element)).toBeNull();
  });

  it("une note de type événement montrée d'une colonne à l'autre garde une seule bande", async () => {
    const m = mount();
    await m.pane.load(EVENT);
    await m.pane.followDisk();
    await vi.waitFor(() => expect(m.element.querySelectorAll(".agenda-band")).toHaveLength(1));
  });
});
