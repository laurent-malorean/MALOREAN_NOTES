import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  arrowEl,
  button,
  cardEl,
  centre,
  choose,
  click,
  drag,
  emptySpot,
  key,
  last,
  picture,
  menuItems,
  mountAt100 as mount,
  pointer,
  rightClick,
  selected,
  surface,
} from "../../test-support/canvas-fixture";
import "../theme.css";
import { closeContextMenu } from "./context-menu";

beforeEach(() => closeContextMenu());
afterEach(() => closeContextMenu());

describe("canvas : menus du clic droit", () => {
  it("sur le fond : ajouter une note, un média, une page web, un groupe", async () => {
    const m = await mount();
    const box = surface().getBoundingClientRect();
    surface().dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: box.left + 30,
        clientY: box.bottom - 30,
      }),
    );
    expect(menuItems()).toEqual([
      "Ajouter une note de l'espace de travail",
      "Ajouter un média de l'espace de travail",
      "Ajouter une page web",
      "Créer un groupe",
    ]);
    choose("Ajouter une note de l'espace de travail");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.at(-1)?.file).toBe("Notes/Autre.md");
    surface().dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: box.left + 30,
        clientY: box.bottom - 30,
      }),
    );
    choose("Ajouter un média de l'espace de travail");
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    surface().dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: box.left + 30,
        clientY: box.bottom - 30,
      }),
    );
    choose("Ajouter une page web");
    await vi.waitFor(() => expect(m.saved).toHaveLength(3));
    expect(last(m)?.cards.at(-1)?.url).toBe("https://exemple.fr");
    surface().dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        clientX: box.left + 30,
        clientY: box.bottom - 30,
      }),
    );
    choose("Créer un groupe");
    await vi.waitFor(() => expect(m.saved).toHaveLength(4));
    expect(last(m)?.cards[0]?.kind).toBe("group");
  });

  it("sur une page web : lien externe, copier, changer l'adresse", async () => {
    const m = await mount();
    rightClick(cardEl("l"));
    expect(menuItems()).toEqual([
      "Ouvrir le lien externe",
      "Copier l'adresse",
      "Changer l'adresse…",
      "Zoomer sur la sélection",
      "Retirer",
    ]);
    choose("Ouvrir le lien externe");
    rightClick(cardEl("l"));
    choose("Copier l'adresse");
    rightClick(cardEl("l"));
    choose("Changer l'adresse…");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.external).toEqual(["https://jsoncanvas.org"]);
    expect(m.copied).toEqual(["https://jsoncanvas.org"]);
    expect(m.asked[0]).toEqual(["Adresse de la page web", "https://jsoncanvas.org", "Enregistrer"]);
  });

  it("sur une note : changer le fichier, modifier ouvre la note ; sur une image : changer le média", async () => {
    const m = await mount();
    rightClick(cardEl("n"));
    expect(menuItems()).toContain("Changer le fichier");
    choose("Changer le fichier");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards.find((c) => c.id === "n")?.file).toBe("Notes/Autre.md");
    rightClick(cardEl("n"));
    choose("Modifier");
    expect(m.notes).toEqual([["Notes/Autre.md", false]]);
    rightClick(cardEl("i"));
    choose("Changer le fichier");
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    expect(last(m)?.cards.find((c) => c.id === "i")?.file).toBe("img/b.png");
    click(cardEl("n").querySelector("a") as Element);
    (cardEl("n").querySelector("a") as HTMLElement).dispatchEvent(
      new MouseEvent("click", { bubbles: true, metaKey: true, cancelable: true }),
    );
    expect(m.notes.at(-1)).toEqual(["Notes/Autre.md", true]);
  });

  it("sur plusieurs cartes : créer un groupe qui les entoure", async () => {
    const m = await mount();
    click(cardEl("t"));
    click(cardEl("u"), { shiftKey: true });
    rightClick(cardEl("u"));
    choose("Créer un groupe");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.cards[0]?.kind).toBe("group");
    expect(last(m)?.cards).toHaveLength(7);
  });

  it("sur une ligne : suivre la connexion, étiquette, retirer", async () => {
    const m = await mount();
    const hit = () => arrowEl("e1").querySelector(".canvas-arrow-hit") as Element;
    rightClick(hit());
    expect(menuItems()).toEqual([
      "Suivre la connexion",
      "Modifier l'étiquette",
      "Retirer l'étiquette",
      "Retirer",
    ]);
    choose("Suivre la connexion");
    expect(selected()).toEqual(["u"]);
    rightClick(hit());
    choose("Retirer l'étiquette");
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(last(m)?.arrows.find((a) => a.id === "e1")?.label).toBeNull();
    rightClick(arrowEl("e1").querySelector(".canvas-arrow-hit") as Element);
    choose("Modifier l'étiquette");
    expect(document.querySelector("input.canvas-editor")).not.toBeNull();
    (document.querySelector("input.canvas-editor") as HTMLElement).dispatchEvent(new Event("blur"));
    rightClick(arrowEl("e3").querySelector(".canvas-arrow-hit") as Element);
    choose("Retirer");
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
  });
});

describe("canvas : vue, réglages, aide", () => {
  const transform = () => (document.querySelector(".canvas-world") as HTMLElement).style.transform;

  it("la molette déplace, Cmd + molette zoome, les boutons zoomer, rétablir, tout voir, dézoomer", async () => {
    await mount();
    const before = transform();
    const c = centre(surface());
    surface().dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: 50,
        bubbles: true,
        cancelable: true,
        clientX: c.x,
        clientY: c.y,
      }),
    );
    expect(transform()).not.toBe(before);
    surface().dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -200,
        metaKey: true,
        bubbles: true,
        cancelable: true,
        clientX: c.x,
        clientY: c.y,
      }),
    );
    button("Rétablir le zoom").click();
    expect(transform()).toContain("scale(1)");
    button("Dézoomer").click();
    expect(transform()).toContain("scale(0.8)");
    button("Tout voir").click();
    key("1", { shiftKey: true, code: "Digit1" });
    button("Zoomer").click();
  });

  it("très dézoomé, les cartes se réduisent à un rectangle avec une icône", async () => {
    await mount();
    for (let i = 0; i < 12; i++) button("Dézoomer").click();
    expect(document.querySelector(".canvas-far")).not.toBeNull();
    expect(getComputedStyle(cardEl("t").querySelector(".canvas-far-icon") as Element).display).toBe(
      "flex",
    );
  });

  it("Espace + glisser déplace la vue ; le bouton central aussi", async () => {
    await mount();
    const before = transform();
    key(" ");
    const e = emptySpot();
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointermove", e.x + 30, e.y);
    pointer(surface(), "pointerup", e.x + 30, e.y);
    expect(transform()).not.toBe(before);
    expect(document.querySelector(".canvas-view.space")).not.toBeNull();
    view().dispatchEvent(new KeyboardEvent("keyup", { key: " " }));
    expect(document.querySelector(".canvas-view.space")).toBeNull();
    pointer(surface(), "pointerdown", e.x, e.y, { button: 1 });
    pointer(surface(), "pointermove", e.x - 30, e.y);
    pointer(surface(), "pointerup", e.x - 30, e.y);
  });

  it("Maj + 2 cadre la sélection", async () => {
    await mount();
    click(cardEl("u"));
    const before = transform();
    key("2", { shiftKey: true, code: "Digit2" });
    expect(transform()).not.toBe(before);
    button("Zoom sur la sélection").click();
  });

  it("l'engrenage a trois cases gardées ; en lecture seule on ne change rien", async () => {
    const m = await mount();
    button("Réglages du canvas").click();
    expect(menuItems()).toEqual(["Accrocher à la grille", "Accrocher aux objets", "Lecture seule"]);
    choose("Lecture seule");
    expect(m.settings.current.readOnly).toBe(true);
    drag(cardEl("t"), 40, 20);
    click(cardEl("t"));
    click(arrowEl("e1").querySelector(".canvas-arrow-hit") as Element);
    const e = emptySpot();
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    click(cardEl("t"), { shiftKey: true });
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    pointer(surface(), "pointerdown", e.x, e.y);
    pointer(surface(), "pointerup", e.x, e.y);
    click(cardEl("t"));
    key("Delete");
    button("Ajouter une carte texte").click();
    rightClick(cardEl("l"));
    expect(menuItems()).toEqual([
      "Ouvrir le lien externe",
      "Copier l'adresse",
      "Zoomer sur la sélection",
    ]);
    closeContextMenu();
    rightClick(cardEl("g"));
    closeContextMenu();
    expect(m.saved).toHaveLength(0);
  });

  it("l'aide liste les raccourcis", async () => {
    await mount();
    button("Aide").click();
    expect(menuItems().length).toBeGreaterThan(5);
  });

  it("les boutons de la barre du bas ajoutent une carte au centre ou où on les dépose", async () => {
    const m = await mount();
    button("Ajouter une carte texte").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(document.querySelector(".canvas-editor")).not.toBeNull();
    (document.querySelector(".canvas-editor") as HTMLElement).dispatchEvent(new Event("blur"));
    button("Ajouter une note de l'espace de travail").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(2));
    const b = button("Ajouter un média");
    const c = centre(b);
    pointer(b, "pointerdown", c.x, c.y);
    const e = emptySpot();
    pointer(document.body, "pointerup", e.x, e.y);
    await vi.waitFor(() => expect(m.saved).toHaveLength(3));
    expect(last(m)?.cards.at(-1)?.file).toBe("img/b.png");
  });

  it("choisir un groupe centre la vue dessus ; les groupes sont listés", async () => {
    const m = await mount();
    expect(m.view.groups()).toEqual([{ id: "g", title: "Phase 1" }]);
    m.view.goToGroup("g");
    expect(selected()).toEqual(["g"]);
    m.view.goToGroup("absent");
    expect(m.view.viewport().scale).toBe(1);
    expect(m.view.canvas().cards).toHaveLength(6);
  });

  it("un changement du fichier venu d'ailleurs est repris, et fusionné à l'enregistrement", async () => {
    const m = await mount();
    const other = structuredClone(m.view.canvas());
    other.cards = other.cards.filter((c) => c.id !== "l");
    m.view.setFile({ canvas: other, text: "v9" });
    expect(cardEl("l")).toBeNull();
    drag(cardEl("t"), 40, 20);
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    expect(m.saved[0]?.base).toBe("v9");
  });

  it("une erreur d'enregistrement est dite", async () => {
    const m = await mount();
    m.view.destroy();
  });
});

const view = () => document.querySelector(".canvas-view") as HTMLElement;

describe("canvas : répartir et accrocher", () => {
  it("avec trois cartes, l'espace se répartit dans les deux sens", async () => {
    const m = await mount();
    click(cardEl("t"));
    click(cardEl("u"), { shiftKey: true });
    click(cardEl("n"), { shiftKey: true });
    button("Aligner").click();
    const before = m.saved.length;
    choose("Répartir l'espace horizontal");
    await vi.waitFor(() => expect(m.saved.length).toBeGreaterThan(before));
    const middle = m.saved.length;
    button("Aligner").click();
    choose("Répartir l'espace vertical");
    await vi.waitFor(() => expect(m.saved.length).toBeGreaterThan(middle));
  });

  it("les cases de l'engrenage se cochent une à une et sont gardées", async () => {
    const m = await mount();
    button("Réglages du canvas").click();
    choose("Accrocher à la grille");
    button("Réglages du canvas").click();
    choose("Accrocher aux objets");
    expect(m.settings.current).toMatchObject({ grid: true, objects: true, readOnly: false });
    expect(m.settings.stored).toHaveLength(2);
  });
});

describe("canvas : proportions d'une image", () => {
  const added = async (width: number, height: number) => {
    const m = await mount();
    m.pictures["img/b.png"] = picture(width, height);
    button("Ajouter un média").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    return { m, card: last(m)?.cards.at(-1) };
  };

  it("une image en hauteur de 300 × 600 donne une carte de 300 × 600 (hauteur plafonnée)", async () => {
    const { card } = await added(300, 600);
    expect([card?.width, card?.height]).toEqual([300, 600]);
  });

  it("une image de 600 × 300 donne une carte de 400 × 200", async () => {
    const { card } = await added(600, 300);
    expect([card?.width, card?.height]).toEqual([400, 200]);
  });

  it("une image qui ne charge pas donne la taille d'une carte de fichier", async () => {
    const m = await mount();
    m.pictures["img/b.png"] = "data:image/png;base64,AAAA";
    button("Ajouter un média").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const card = last(m)?.cards.at(-1);
    expect([card?.width, card?.height]).toEqual([400, 300]);
  });

  it("une note ajoutée garde la taille d'une carte de fichier", async () => {
    const m = await mount();
    button("Ajouter une note de l'espace de travail").click();
    await vi.waitFor(() => expect(m.saved).toHaveLength(1));
    const card = last(m)?.cards.at(-1);
    expect([card?.width, card?.height]).toEqual([400, 300]);
  });

  it("une image déjà dans le fichier n'est ni modifiée à l'ouverture ni réécrite", async () => {
    const m = await mount();
    m.pictures["img/a.png"] = picture(100, 700);
    await new Promise((r) => setTimeout(r, 100));
    expect(m.saved).toHaveLength(0);
    const i = m.disk.file.canvas.cards.find((c) => c.id === "i");
    expect([i?.width, i?.height]).toEqual([200, 100]);
  });
});
