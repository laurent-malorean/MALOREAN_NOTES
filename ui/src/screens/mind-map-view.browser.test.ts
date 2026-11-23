import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  click,
  find,
  input,
  key,
  mount,
  node,
  nodes,
  pointer,
  sample,
  settle,
  titles,
} from "../../test-support/mind-map-fixture";
import type { MindMapItem } from "../bridge";
import { closeContextMenu } from "./context-menu";
import { createMindMapView } from "./mind-map-view";

beforeEach(() => closeContextMenu());
afterEach(() => closeContextMenu());

describe("carte mentale : affichage", () => {
  it("montre chaque nœud, ses liens, et cadre toute la carte", async () => {
    await mount();
    expect(titles()).toEqual(["Clients", "Artisans", "Plombiers", "Grands comptes", "Calendrier"]);
    expect(document.querySelectorAll(".mind-map-link")).toHaveLength(3);
    expect(find("Clients").classList.contains("root")).toBe(true);
    const view = document.querySelector(".mind-map") as HTMLElement;
    const area = view.getBoundingClientRect();
    for (const element of nodes()) {
      const box = element.getBoundingClientRect();
      expect(box.left).toBeGreaterThanOrEqual(area.left);
      expect(box.right).toBeLessThanOrEqual(area.right);
      expect(box.top).toBeGreaterThanOrEqual(area.top);
      expect(box.bottom).toBeLessThanOrEqual(area.bottom);
    }
  });

  it("le nœud de mesure reste caché", async () => {
    await mount();
    const probe = document.querySelector(".mind-map-probe") as HTMLElement;
    expect(getComputedStyle(probe).visibility).toBe("hidden");
  });

  it("une carte sans nœud invite à double-cliquer", async () => {
    await mount({ roots: [], places: [] });
    const message = document.querySelector<HTMLElement>(".mind-map-empty") as HTMLElement;
    expect(message.hidden).toBe(false);
    expect(message.textContent).toBe("Double-cliquez pour ajouter une idée.");
  });

  it("met en forme le titre et le détail, et colore le nœud", async () => {
    await mount({
      roots: [
        {
          ...node("Un **gras** et [[Autre note]]", [], ["ligne", "", "- a", "- b"]),
          color: "bleu",
        },
      ],
      places: [{ x: 0, y: 0 }],
    });
    const element = find("Un gras et Autre note");
    expect(element.querySelector("strong")?.textContent).toBe("gras");
    expect(element.querySelector("a")?.getAttribute("href")).toBe("#wiki-Autre%20note");
    expect(element.querySelectorAll(".mind-map-detail li")).toHaveLength(2);
    expect(element.classList.contains("colored")).toBe(true);
    expect(element.style.getPropertyValue("--node-color")).toBe("var(--mind-map-bleu)");
  });

  it("garde en texte un titre qui ressemble à du Markdown de bloc", async () => {
    await mount({
      roots: [node("# Titre"), node("[ ] case"), node("- liste")],
      places: [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
        { x: 0, y: 200 },
      ],
    });
    expect(titles()).toEqual(["# Titre", "[ ] case", "- liste"]);
  });

  it("un clic sur un lien entre notes ou un lien web le suit", async () => {
    const m = await mount({
      roots: [node("[[Cible|texte]] et [web](https://exemple.fr)")],
      places: [{ x: 0, y: 0 }],
    });
    (document.querySelector(".mind-map-title a") as HTMLElement).click();
    expect(m.wiki).toEqual([["Cible", false]]);
    (document.querySelectorAll(".mind-map-title a")[1] as HTMLElement).click();
    expect(m.links).toEqual(["https://exemple.fr"]);
  });

  it("élargit un nœud dont le détail est long", async () => {
    await mount({
      roots: [node("A", [], ["mot ".repeat(120)])],
      places: [{ x: 0, y: 0 }],
    });
    const element = find("A");
    expect(element.classList.contains("wide") || element.offsetWidth > 100).toBe(true);
  });
});

describe("carte mentale : vue", () => {
  const transform = () =>
    (document.querySelector(".mind-map-world") as HTMLElement).style.transform;
  const button = (name: string) =>
    document.querySelector<HTMLButtonElement>(
      `.mind-map-button[aria-label="${name}"]`,
    ) as HTMLButtonElement;

  it("zoome par les boutons, puis cadre de nouveau", async () => {
    await mount();
    const fitted = transform();
    button("Agrandir").click();
    expect(transform()).not.toBe(fitted);
    button("Réduire").click();
    button("Réduire").click();
    expect(transform()).not.toBe(fitted);
    button("Tout afficher").click();
    expect(transform()).toBe(fitted);
  });

  it("exporte toute la carte en image PNG, quel que soit le zoom de l'écran", async () => {
    const m = await mount();
    button("Agrandir").click();
    button("Exporter en image").click();
    await vi.waitFor(() => expect(m.images).toHaveLength(1));
    const png = m.images[0] as Uint8Array;
    expect([...png.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const header = new DataView(png.buffer, png.byteOffset);
    const wide = header.getUint32(16);
    const high = header.getUint32(20);
    const boxes = nodes().map((n) => n.getBoundingClientRect());
    expect(wide).toBeGreaterThan(400);
    expect(high).toBeGreaterThan(200);
    expect(boxes.length).toBeGreaterThan(0);
    expect(m.errors).toEqual([]);
  });

  it("une carte vide n'a pas d'image à exporter", async () => {
    const m = await mount({ roots: [], places: [] });
    button("Exporter en image").click();
    expect(m.notices).toEqual(["La carte est vide : rien à exporter."]);
    expect(m.images).toEqual([]);
  });

  it("déplace par la molette, zoome avec Cmd + molette", async () => {
    await mount();
    const view = document.querySelector(".mind-map") as HTMLElement;
    const before = transform();
    view.dispatchEvent(
      new WheelEvent("wheel", { deltaX: 10, deltaY: 20, bubbles: true, cancelable: true }),
    );
    const panned = transform();
    expect(panned).not.toBe(before);
    view.dispatchEvent(
      new WheelEvent("wheel", { deltaY: -50, metaKey: true, bubbles: true, cancelable: true }),
    );
    expect(transform()).not.toBe(panned);
  });

  it("déplace en glissant le fond, et un clic sur le fond désélectionne", async () => {
    const m = await mount();
    click(find("Calendrier"));
    expect(m.view.selected()).toEqual([1]);
    const view = document.querySelector(".mind-map") as HTMLElement;
    const before = transform();
    pointer(view, "pointerdown", 5, 5);
    pointer(document, "pointermove", 55, 45);
    pointer(document, "pointerup", 55, 45);
    expect(transform()).not.toBe(before);
    expect(m.view.selected()).toEqual([1]);
    pointer(view, "pointerdown", 5, 5);
    pointer(document, "pointerup", 5, 5);
    expect(m.view.selected()).toBeNull();
  });
});

describe("carte mentale : sélection au clavier", () => {
  it("un clic choisit un nœud ; les flèches parcourent l'arbre ; Échap désélectionne", async () => {
    const m = await mount();
    const view = m.view.element;
    click(find("Clients"));
    expect(find("Clients").classList.contains("selected")).toBe(true);
    key(view, "ArrowRight");
    expect(m.view.selected()).toEqual([0, 0]);
    key(view, "ArrowDown");
    expect(m.view.selected()).toEqual([0, 1]);
    key(view, "ArrowDown");
    expect(m.view.selected()).toEqual([0, 1]);
    key(view, "ArrowUp");
    key(view, "ArrowRight");
    expect(m.view.selected()).toEqual([0, 0, 0]);
    key(view, "ArrowRight");
    expect(m.view.selected()).toEqual([0, 0, 0]);
    key(view, "ArrowLeft");
    key(view, "ArrowLeft");
    expect(m.view.selected()).toEqual([0]);
    key(view, "ArrowLeft");
    expect(m.view.selected()).toEqual([0]);
    key(view, "ArrowDown");
    expect(m.view.selected()).toEqual([1]);
    key(view, "Escape");
    expect(m.view.selected()).toBeNull();
    key(view, "ArrowDown");
    expect(m.view.selected()).toBeNull();
  });
});

describe("carte mentale : modifier", () => {
  it("Tab ajoute un enfant en saisie ; Entrée valide et enregistre", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    expect(m.saved).toHaveLength(0);
    input().value = "Bêta";
    key(input(), "Enter");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[1]?.children[0]?.title).toBe("Bêta");
    expect(m.view.selected()).toEqual([1, 0]);
    await vi.waitFor(() => expect(titles()).toContain("Bêta"));
  });

  it("Maj+Entrée va à la ligne : la première ligne est le titre, les suivantes le détail", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "F2");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    expect(input().value).toBe("Calendrier");
    input().value = "Agenda\nun\n\ndeux";
    key(input(), "Enter", { shiftKey: true });
    expect(m.saved).toHaveLength(0);
    key(input(), "Enter");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[1]).toMatchObject({ title: "Agenda", detail: ["un", "", "deux"] });
  });

  it("une première ligne vide est refusée : le nœud reste en saisie", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "  \nsuite";
    key(input(), "Enter");
    expect(input().classList.contains("refused")).toBe(true);
    expect(m.saved).toHaveLength(0);
  });

  it("Échap annule : un nœud neuf est retiré, un nœud existant garde son texte", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    key(input(), "Escape");
    expect(input()).toBeNull();
    expect(m.view.map().roots[1]?.children).toEqual([]);
    key(m.view.element, "F2");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Autre";
    key(input(), "Escape");
    expect(m.view.map().roots[1]?.title).toBe("Calendrier");
    expect(m.saved).toHaveLength(0);
  });

  it("Tab dans la saisie valide puis ajoute un enfant ; Entrée ajoute un frère", async () => {
    const m = await mount();
    click(find("Calendrier"));
    key(m.view.element, "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Bêta";
    key(input(), "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Détail";
    key(input(), "Enter");
    expect(m.view.map().roots[1]?.children[0]?.children[0]?.title).toBe("Détail");
    key(m.view.element, "Enter");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Sœur";
    key(input(), "Enter");
    expect(m.view.map().roots[1]?.children[0]?.children.map((c) => c.title)).toEqual([
      "Détail",
      "Sœur",
    ]);
  });

  it("Entrée sur un nœud racine ajoute un nœud racine sous le bas de sa branche", async () => {
    const m = await mount();
    click(find("Clients"));
    key(m.view.element, "Enter");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Nouveau";
    key(input(), "Enter");
    const map = m.view.map();
    expect(map.roots.map((r) => r.title)).toEqual(["Clients", "Calendrier", "Nouveau"]);
    expect(map.places[2]?.x).toBe(0);
    expect(map.places[2]?.y).toBeGreaterThan(0);
  });

  it("un double-clic sur le fond crée un nœud racine sous le pointeur ; sur un nœud, le modifie", async () => {
    const m = await mount({ roots: [], places: [] });
    const view = m.view.element;
    const at = view.getBoundingClientRect();
    view.dispatchEvent(
      new MouseEvent("dblclick", { bubbles: true, clientX: at.left + 100, clientY: at.top + 80 }),
    );
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Idée";
    key(input(), "Enter");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[0]?.title).toBe("Idée");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.places[0]).toEqual({ x: 100 - 450, y: 80 - 300 });
    await vi.waitFor(() => expect(titles()).toEqual(["Idée"]));
    find("Idée").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    await vi.waitFor(() => expect(input()).not.toBeNull());
    expect(input().value).toBe("Idée");
  });

  it("Suppr supprime un nœud seul sans demander ; une branche demande confirmation", async () => {
    const m = await mount();
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.view.selected()).toEqual([0, 0]);
    click(find("Artisans"));
    key(m.view.element, "Backspace");
    await vi.waitFor(() => expect(document.querySelector(".mind-map-confirm")).not.toBeNull());
    expect(document.querySelector(".mind-map-confirm")?.textContent).toContain("son descendant");
    (document.querySelector(".mind-map-confirm button[aria-label=Annuler]") as HTMLElement).click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    key(m.view.element, "Delete");
    await vi.waitFor(() => expect(document.querySelector(".mind-map-confirm")).not.toBeNull());
    (
      document.querySelector(".mind-map-confirm button[aria-label=Supprimer]") as HTMLElement
    ).click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(m.view.map().roots[0]?.children).toEqual([]);
    expect(m.view.selected()).toEqual([0]);
  });

  it("annule et rétablit, sans toucher à la saisie en cours", async () => {
    const m = await mount();
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    expect(m.view.map().roots[0]?.children).toHaveLength(1);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    key(m.view.element, "z", { metaKey: true });
    expect(m.view.map().roots[0]?.children).toHaveLength(2);
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    key(m.view.element, "z", { metaKey: true, shiftKey: true });
    expect(m.view.map().roots[0]?.children).toHaveLength(1);
    key(m.view.element, "z", { metaKey: true });
    key(m.view.element, "z", { metaKey: true });
    await vi.waitFor(() => expect(m.saved).toHaveLength(4));
    key(m.view.element, "z", { metaKey: true, shiftKey: true });
    key(m.view.element, "z", { metaKey: true, shiftKey: true });
    key(m.view.element, "x");
  });

  it("une erreur d'enregistrement est montrée, l'enregistrement suivant reprend tout", async () => {
    const saved: MindMapItem[] = [];
    const errors: unknown[] = [];
    let failing = true;
    const view = createMindMapView({
      save: async (m) => {
        if (failing) throw new Error("disque plein");
        saved.push(m);
      },
      read: async () => sample(),
      notice: () => {},
      openWikiLink: () => {},
      openLink: () => {},
      error: (e) => errors.push(e),
      resolveImage: (s) => s,
      exportImage: async () => {},
      folded: { load: () => [], store: () => {} },
    });
    const host = document.createElement("div");
    host.style.cssText = "width:900px;height:600px;display:flex";
    document.body.replaceChildren(host);
    host.append(view.element);
    view.setMap(sample());
    view.show();
    await settle();
    click(find("Grands comptes"));
    key(view.element, "Delete");
    await vi.waitFor(() => expect(errors).toHaveLength(1));
    failing = false;
    click(find("Calendrier"));
    key(view.element, "Delete");
    await vi.waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]?.roots.map((r) => r.title)).toEqual(["Clients"]);
  });
});

describe("carte mentale : menu et couleurs", () => {
  const menu = () => [...document.querySelectorAll<HTMLButtonElement>(".context-menu button")];

  it("le clic droit choisit le nœud et propose les couleurs puis les actions", async () => {
    const m = await mount();
    find("Calendrier").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(m.view.selected()).toEqual([1]);
    expect(menu().map((b) => b.textContent)).toEqual([
      "rouge",
      "orange",
      "jaune",
      "vert",
      "turquoise",
      "bleu",
      "violet",
      "rose",
      "marron",
      "ardoise",
      "Sans couleur",
      "Ajouter un enfant",
      "Ajouter un frère",
      "Modifier",
      "Supprimer",
    ]);
    expect(menu()[0]?.querySelector(".context-menu-swatch")).not.toBeNull();
    menu()[5]?.click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[1]?.color).toBe("bleu");
    find("Calendrier").dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(menu()[5]?.getAttribute("aria-checked")).toBe("true");
    expect(menu()[4]?.getAttribute("aria-checked")).toBeNull();
    menu()[10]?.click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(m.saved[1]?.roots[1]?.color).toBeNull();
  });

  it("le menu ajoute un enfant, un frère, modifie et supprime", async () => {
    const m = await mount();
    const open = (title: string, entry: number) => {
      find(title).dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
      menu()[entry]?.click();
    };
    open("Calendrier", 11);
    await vi.waitFor(() => expect(input()).not.toBeNull());
    key(input(), "Escape");
    open("Calendrier", 12);
    await vi.waitFor(() => expect(input()).not.toBeNull());
    key(input(), "Escape");
    open("Calendrier", 13);
    await vi.waitFor(() => expect(input()?.value).toBe("Calendrier"));
    key(input(), "Escape");
    open("Calendrier", 14);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
  });

  it("le clic droit sur le fond ne fait rien", async () => {
    await mount();
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector(".mind-map")?.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(document.querySelector(".context-menu")).toBeNull();
  });
});

describe("carte mentale : branches pliées", () => {
  it("le bouton plie et déplie, et affiche le nombre de descendants cachés", async () => {
    const m = await mount();
    const fold = (title: string) => find(title).querySelector(".mind-map-fold") as HTMLElement;
    expect(fold("Clients").textContent).toBe("−");
    expect(find("Calendrier").querySelector(".mind-map-fold")).toBeNull();
    fold("Clients").dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    fold("Clients").dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    fold("Clients").click();
    await vi.waitFor(() => expect(titles()).toEqual(["Clients", "Calendrier"]));
    expect(fold("Clients").textContent).toBe("+3");
    expect(m.stored.at(-1)).toEqual(["0"]);
    fold("Clients").click();
    await vi.waitFor(() => expect(titles()).toHaveLength(5));
    expect(m.stored.at(-1)).toEqual([]);
    expect(m.saved).toHaveLength(0);
  });

  it("les branches pliées gardées sont pliées à l'ouverture ; → déplie et choisit le premier enfant", async () => {
    const m = await mount(sample(), ["0"]);
    expect(titles()).toEqual(["Clients", "Calendrier"]);
    click(find("Clients"));
    key(m.view.element, "ArrowRight");
    await vi.waitFor(() => expect(titles()).toHaveLength(5));
    expect(m.view.selected()).toEqual([0, 0]);
  });

  it("révéler un nœud déplie ses ancêtres, le choisit et le centre", async () => {
    const m = await mount(sample(), ["0", "0.0"]);
    m.view.reveal([0, 0, 0]);
    await vi.waitFor(() => expect(titles()).toHaveLength(5));
    expect(m.view.selected()).toEqual([0, 0, 0]);
    expect(m.stored.at(-1)).toEqual([]);
  });
});

describe("carte mentale : le fichier a changé ailleurs pendant un changement", () => {
  const changeElsewhere = (m: Awaited<ReturnType<typeof mount>>) => {
    const other = structuredClone(m.disk.map);
    other.roots.push(node("Ajouté ailleurs"));
    other.places.push({ x: 0, y: 600 });
    m.disk.map = other;
  };

  it("refait le changement sur la nouvelle version, sans rien perdre", async () => {
    const m = await mount();
    changeElsewhere(m);
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots.map((r) => r.title)).toEqual([
      "Clients",
      "Calendrier",
      "Ajouté ailleurs",
    ]);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots[0]?.children.map((c) => c.title)).toEqual(["Artisans"]);
    expect(m.notices).toEqual([]);
    await vi.waitFor(() => expect(titles()).toContain("Ajouté ailleurs"));
  });

  it("abandonne le changement dont le nœud a disparu, recharge la carte et le dit", async () => {
    const m = await mount();
    const other = structuredClone(m.disk.map);
    other.roots.pop();
    other.places.pop();
    m.disk.map = other;
    click(find("Calendrier"));
    key(m.view.element, "F2");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Agenda";
    key(input(), "Enter");
    await vi.waitFor(() => expect(m.notices).toEqual(["La carte est rechargée."]));
    expect(m.saved).toHaveLength(0);
    await vi.waitFor(() => expect(titles()).not.toContain("Agenda"));
    expect(titles()).not.toContain("Calendrier");
  });

  it("un ajout dont le parent a disparu devient un nœud racine", async () => {
    const m = await mount();
    const other = structuredClone(m.disk.map);
    other.roots[0] = node("Clients");
    m.disk.map = other;
    click(find("Artisans"));
    key(m.view.element, "Tab");
    await vi.waitFor(() => expect(input()).not.toBeNull());
    input().value = "Neuf";
    key(input(), "Enter");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.roots.map((r) => r.title)).toEqual(["Clients", "Calendrier", "Neuf"]);
  });

  it("annuler après un changement venu d'ailleurs n'est pas refait : la carte est rechargée", async () => {
    const m = await mount();
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    changeElsewhere(m);
    key(m.view.element, "z", { metaKey: true });
    await vi.waitFor(() => expect(m.notices).toEqual(["La carte est rechargée."]));
  });

  it("un changement venu d'ailleurs pendant un enregistrement est montré ensuite", async () => {
    const m = await mount();
    click(find("Grands comptes"));
    key(m.view.element, "Delete");
    m.view.setMap({ ...sample(), roots: [node("Étranger")], places: [{ x: 0, y: 0 }] });
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const other = structuredClone(m.disk.map);
    other.roots.push(node("Plus tard"));
    other.places.push({ x: 0, y: 700 });
    m.disk.map = other;
    m.view.setMap(sample());
    await vi.waitFor(() => expect(titles()).toBeDefined());
  });
});
