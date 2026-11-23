import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fakeMeaning,
  meaningLayout,
  overviewOf,
  SMALL_BYTES,
  withDownloaded,
} from "../../test-support/meaning-fixture";
import type { Pane } from "../screens/note-pane";
import { createMeaning } from "./meaning";

function setup(start = overviewOf()) {
  const fake = fakeMeaning(start);
  const layout = meaningLayout();
  const shown: string[] = [];
  const errors: string[] = [];
  const searched: string[] = [];
  const panes = new Map<number, Pane>();
  const refreshed: string[] = [];
  const meaning = createMeaning({
    backend: fake.backend,
    layout,
    columns: { panes: () => panes },
    show: (message, kind) => void shown.push(`${kind ?? "success"} ${message}`),
    run: (action) => void action.catch((error: Error) => errors.push(error.message)),
    searchAgain: () => void searched.push("encore"),
  });
  const pane = { showRelated: async () => void refreshed.push("proches") } as unknown as Pane;
  panes.set(1, pane);
  meaning.start();
  const buttons = () => [...layout.searchMode.querySelectorAll("button")];
  const button = (name: string) => buttons().find((b) => b.textContent === name);
  const text = () => layout.searchMode.textContent;
  return { ...fake, layout, meaning, shown, errors, searched, refreshed, button, buttons, text };
}

beforeEach(() => document.body.replaceChildren());

describe("recherche par le sens : choix du mode", () => {
  it("lit l'aperçu au démarrage, grise « Par le sens » et propose le téléchargement", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    expect(t.calls).toEqual(["aperçu"]);
    expect((t.button("Par le sens") as HTMLButtonElement).disabled).toBe(true);
    expect(t.button("Par les mots")?.getAttribute("aria-pressed")).toBe("true");
    expect(t.text()).toContain(
      "Le modèle « E5 petit » n'est pas téléchargé : la recherche par le sens en a besoin.",
    );
    expect(t.meaning.mode()).toBe("words");
  });

  it("télécharge le modèle, montre la progression, puis choisit « Par le sens » à la fin", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    t.button("Télécharger le modèle (449 Mo)")?.click();
    expect(t.calls).toContain("télécharger e5-small");
    expect(t.button("Télécharger le modèle (449 Mo)")).toBeUndefined();
    t.downloading({ kind: "progress", model: "e5-small", done: 235_318_708, total: SMALL_BYTES });
    expect(t.text()).toContain("224 Mo sur 449 Mo (50 %)");
    expect(t.layout.searchMode.querySelector("progress")?.value).toBe(50);
    t.setOverview(withDownloaded(overviewOf(), { "e5-small": true }));
    t.endDownload();
    await vi.waitFor(() =>
      expect(t.button("Par le sens")?.getAttribute("aria-pressed")).toBe("true"),
    );
    expect((t.button("Par le sens") as HTMLButtonElement).disabled).toBe(false);
    expect(t.layout.searchMode.querySelector("progress")).toBeNull();
    expect(t.meaning.mode()).toBe("meaning");
    expect(t.searched).toEqual(["encore"]);
    expect(t.errors).toEqual([]);
  });

  it("annule le téléchargement, qui rend la main avec son message", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    t.button("Télécharger le modèle (449 Mo)")?.click();
    t.downloading({ kind: "progress", model: "e5-small", done: 1, total: SMALL_BYTES });
    t.button("Annuler le téléchargement")?.click();
    await vi.waitFor(() => expect(t.errors).toEqual(["Téléchargement annulé."]));
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    expect(t.calls).toContain("annuler");
    expect(t.meaning.mode()).toBe("words");
  });

  it("garde « Par les mots » quand le téléchargement échoue, et le dit", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    t.button("Télécharger le modèle (449 Mo)")?.click();
    t.endDownload("Réseau indisponible.");
    await vi.waitFor(() => expect(t.errors).toEqual(["Réseau indisponible."]));
    await vi.waitFor(() => expect(t.button("Télécharger le modèle (449 Mo)")).toBeDefined());
    expect(t.meaning.mode()).toBe("words");
  });

  it("change de mode au clic quand le sens est prêt, et refait la recherche", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() =>
      expect((t.button("Par le sens") as HTMLButtonElement).disabled).toBe(false),
    );
    t.button("Par le sens")?.click();
    expect(t.meaning.mode()).toBe("meaning");
    expect(t.button("Par le sens")?.getAttribute("aria-pressed")).toBe("true");
    expect(t.searched).toEqual(["encore"]);
    t.button("Par les mots")?.click();
    expect(t.meaning.mode()).toBe("words");
    expect(t.searched).toEqual(["encore", "encore"]);
  });

  it("veut le mode « par le sens » même avant le téléchargement : il sert dès que le sens le peut", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    t.meaning.chooseMode("meaning");
    expect(t.meaning.mode()).toBe("words");
    t.setOverview(withDownloaded(overviewOf(), { "e5-small": true }));
    t.endDownload();
    t.computing({ kind: "finished", model: "e5-small" });
    await vi.waitFor(() => expect(t.meaning.mode()).toBe("meaning"));
  });

  it("dit où en est le calcul, en mode « par le sens », puis relance la recherche à la fin", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() =>
      expect((t.button("Par le sens") as HTMLButtonElement).disabled).toBe(false),
    );
    t.button("Par le sens")?.click();
    t.searched.length = 0;
    t.computing({ kind: "progress", done: 120, total: 411, model: "e5-small" });
    expect(t.text()).toContain("Calcul du sens : 120 / 411 segments");
    t.computing({ kind: "finished", model: "e5-small" });
    expect(t.text()).not.toContain("Calcul du sens");
    expect(t.searched).toEqual(["encore"]);
    expect(t.refreshed).toEqual(["proches"]);
    await vi.waitFor(() => expect(t.calls.filter((c) => c === "aperçu")).toHaveLength(2));
  });

  it("ne refait pas la recherche par les mots quand le calcul finit", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    t.computing({ kind: "finished", model: "e5-small" });
    expect(t.searched).toEqual([]);
  });

  it("dit l'échec du calcul, et relit l'aperçu", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    t.computing({ kind: "failed", message: "Le calcul a échoué." });
    expect(t.shown).toEqual(["error Le calcul a échoué."]);
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu", "aperçu"]));
  });

  it("ne redessine pas le choix quand rien n'a changé", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.buttons()).toHaveLength(2));
    const first = t.buttons()[0];
    t.computing({ kind: "failed", message: "x" });
    await vi.waitFor(() => expect(t.calls).toHaveLength(2));
    expect(t.buttons()[0]).toBe(first);
  });
});

describe("recherche par le sens : notes proches", () => {
  it("affiche ou masque la liste dans chaque colonne, masquée au départ", () => {
    const t = setup();
    expect(t.meaning.enabled()).toBe(false);
    t.meaning.toggleRelated();
    expect(t.meaning.enabled()).toBe(true);
    expect(t.refreshed).toEqual(["proches"]);
    t.meaning.toggleRelated();
    expect(t.meaning.enabled()).toBe(false);
    expect(t.refreshed).toEqual(["proches", "proches"]);
  });

  it("lit les notes proches d'une note par Rust", async () => {
    const t = setup();
    t.related["a.md"] = [{ path: "b.md", title: "B", modified: 0, pinned: false, tags: [] }];
    expect(await t.meaning.notes("a.md")).toEqual(t.related["a.md"]);
    expect(t.calls).toContain("proches a.md");
  });
});

function settingsOf(t: ReturnType<typeof setup>) {
  const [group] = t.meaning.settingsGroups();
  const frame = group as HTMLElement;
  document.body.append(frame);
  const text = () => frame.textContent ?? "";
  const button = (name: string) => frame.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
  const named = (name: string) =>
    [...frame.querySelectorAll("button")].find((b) => b.textContent === name);
  return { frame, text, button, named };
}

describe("recherche par le sens : réglages", () => {
  it("montre chaque modèle et l'état de l'index, relus à l'ouverture", async () => {
    const t = setup(withDownloaded(overviewOf({ withVector: 100 }), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu", "aperçu"]));
    expect(s.frame.className).toBe("meaning-settings");
    expect(s.text()).toContain("E5 petit");
    expect(s.text()).toContain("utilisé");
    expect(s.text()).toContain("Segments calculés : 100 sur 411");
  });

  it("se redessine aux événements, tant qu'elle est à l'écran", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    t.computing({ kind: "progress", done: 5, total: 411, model: "e5-small" });
    expect(s.text()).toContain("Calcul du sens : 5 / 411 segments");
    t.downloading({
      kind: "progress",
      model: "e5-large",
      done: 1_120_000_000,
      total: 2_240_000_000,
    });
    expect(s.text()).toContain("(50 %)");
    s.frame.remove();
    t.computing({ kind: "progress", done: 9, total: 411, model: "e5-small" });
    expect(s.text()).not.toContain("9 / 411");
    // Une trame retirée de l'écran est oubliée : la remettre ne la fait pas redessiner.
    document.body.append(s.frame);
    t.computing({ kind: "progress", done: 12, total: 411, model: "e5-small" });
    expect(s.text()).not.toContain("12 / 411");
  });

  it("choisit un modèle : Rust le garde, l'aperçu est relu, la recherche refaite", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.frame.querySelector<HTMLInputElement>("#meaning-model-e5-large")?.click();
    await vi.waitFor(() => expect(t.calls).toContain("choisir e5-large"));
    await vi.waitFor(() => expect(t.searched).toEqual(["encore"]));
    expect(t.refreshed).toEqual(["proches"]);
    await vi.waitFor(() =>
      expect(s.frame.querySelector<HTMLInputElement>("#meaning-model-e5-large")?.checked).toBe(
        true,
      ),
    );
  });

  it("télécharge un modèle sans changer le mode de recherche, et l'annule", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.button("Télécharger « E5 grand »")?.click();
    expect(t.calls).toContain("télécharger e5-large");
    expect(s.text()).toContain("0 Mo sur 0 Mo (0 %)");
    s.named("Annuler le téléchargement")?.click();
    await vi.waitFor(() => expect(t.errors).toEqual(["Téléchargement annulé."]));
    expect(t.meaning.mode()).toBe("words");
  });

  it("nomme dans la confirmation le modèle qu'on supprime", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true, "e5-large": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.button("Supprimer « E5 grand »")?.click();
    expect(t.layout.confirmation.textContent).toContain(
      "Supprimer le modèle « E5 grand » du Mac ?",
    );
    t.layout.confirmation.querySelector<HTMLButtonElement>("button.link")?.click();
  });

  it("télécharge depuis les réglages sans passer la recherche « par le sens », même une fois fini", async () => {
    const t = setup();
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.button("Télécharger « E5 petit »")?.click();
    t.setOverview(withDownloaded(overviewOf(), { "e5-small": true }));
    t.endDownload();
    await vi.waitFor(() => expect(t.button("Par le sens")?.disabled).toBe(false));
    expect(t.button("Par les mots")?.getAttribute("aria-pressed")).toBe("true");
    expect(t.meaning.mode()).toBe("words");
  });

  it("supprime un modèle après confirmation, et rien si on refuse", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.button("Supprimer « E5 petit »")?.click();
    const dialog = t.layout.confirmation;
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain("Supprimer le modèle « E5 petit » du Mac ?");
    expect(dialog.querySelector("button.danger")?.textContent).toBe("Supprimer");
    dialog.querySelector<HTMLButtonElement>("button.link")?.click();
    await vi.waitFor(() => expect(dialog.open).toBe(false));
    expect(t.calls).not.toContain("supprimer e5-small");
    s.button("Supprimer « E5 petit »")?.click();
    dialog.querySelector<HTMLButtonElement>("button.danger")?.click();
    await vi.waitFor(() => expect(t.calls).toContain("supprimer e5-small"));
    await vi.waitFor(() => expect(s.text()).toContain("non téléchargé"));
    expect(t.searched).toEqual(["encore"]);
  });

  it("reconstruit l'index de sens et le dit", async () => {
    const t = setup(withDownloaded(overviewOf(), { "e5-small": true }));
    await vi.waitFor(() => expect(t.calls).toEqual(["aperçu"]));
    const s = settingsOf(t);
    s.named("Reconstruire l'index de sens")?.click();
    await vi.waitFor(() => expect(t.calls).toContain("reconstruire"));
    expect(t.shown).toEqual(["info Index de sens à reconstruire : le calcul repart."]);
  });
});
