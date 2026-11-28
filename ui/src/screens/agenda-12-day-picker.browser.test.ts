import { beforeAll, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { createDayPicker, type DayPickerOptions } from "./agenda-12-day-picker";
import "../theme.css";
import "../style.css";
import "./agenda-12.css";

beforeAll(() => page.viewport(1000, 700));

function mount(
  over: Partial<DayPickerOptions> = {},
  shown: number | null = 13,
  hostStyle = "padding:40px;width:700px",
) {
  const chosen: (number | null)[] = [];
  const picker = createDayPicker({
    label: "Jour",
    title: "Choisir le jour",
    available: () => true,
    choose: (day) => chosen.push(day),
    ...over,
  });
  picker.show(shown);
  const host = document.createElement("div");
  host.className = "agenda-band";
  host.style.cssText = hostStyle;
  host.append(picker.element);
  document.body.replaceChildren(host);
  return { picker, chosen, host };
}

const popup = () => document.querySelector<HTMLElement>(".agenda-day-popup");
const days = () => [...document.querySelectorAll<HTMLButtonElement>(".agenda-day")];
const day = (n: number) => days()[n - 1] as HTMLButtonElement;
const clear = () => document.querySelector(".agenda-day-clear") as HTMLButtonElement;
const trigger = () => document.querySelector(".agenda-day-trigger") as HTMLButtonElement;
const box = (e: Element) => e.getBoundingClientRect();
const key = (name: string, target: Element = document.activeElement as Element) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true }),
  );

describe("sélecteur de jour : le champ", () => {
  it("montre le jour choisi, ou « — », avec son nom et son état pour les lecteurs d'écran", () => {
    mount({ label: "Fin : jour" }, 7);
    expect(trigger().textContent).toBe("7");
    expect(trigger().getAttribute("aria-label")).toBe("Fin : jour");
    expect(trigger().getAttribute("role")).toBe("combobox");
    expect(trigger().getAttribute("aria-haspopup")).toBe("dialog");
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(box(trigger()).height).toBe(36);
    expect(popup()).toBeNull();
  });

  it("sans jour, il montre « — »", () => {
    const { picker } = mount({}, null);
    expect(trigger().textContent).toBe("—");
    picker.show(21);
    expect(trigger().textContent).toBe("21");
    picker.show(null);
    expect(trigger().textContent).toBe("—");
  });
});

describe("sélecteur de jour : la grille", () => {
  it("s'ouvre au clic : une fenêtre nommée, 31 jours et « Aucun jour »", () => {
    mount({ title: "Choisir le jour de fin" });
    trigger().click();
    expect(popup()?.getAttribute("role")).toBe("dialog");
    expect(popup()?.getAttribute("aria-label")).toBe("Choisir le jour de fin");
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(days().map((d) => d.textContent)).toEqual(
      Array.from({ length: 31 }, (_, i) => String(i + 1)),
    );
    expect(clear().textContent).toBe("Aucun jour");
  });

  it("a 4 lignes dont 3 de 10 cases, 1 à 10, 11 à 20, 21 à 30, puis 31", () => {
    mount();
    trigger().click();
    const tops = new Set(days().map((d) => box(d).top));
    expect([...tops]).toHaveLength(4);
    for (const [from, to] of [
      [1, 10],
      [11, 20],
      [21, 30],
    ] as const) {
      const row = days().slice(from - 1, to);
      expect(new Set(row.map((d) => box(d).top)).size).toBe(1);
      expect(row.map((d) => box(d).left)).toEqual(
        [...row.map((d) => box(d).left)].sort((a, b) => a - b),
      );
    }
    expect(box(day(1)).top).toBeLessThan(box(day(11)).top);
    expect(box(day(11)).top).toBeLessThan(box(day(21)).top);
    expect(box(day(21)).top).toBeLessThan(box(day(31)).top);
    expect(box(day(31)).top).toBeGreaterThan(box(day(30)).top);
  });

  it("aligne les colonnes et fait des cases carrées de même taille", () => {
    mount();
    trigger().click();
    for (const column of [1, 2, 5, 10]) {
      const lefts = [0, 10, 20].map((row) => box(day(row + column)).left);
      expect(new Set(lefts.map((left) => Math.round(left))).size).toBe(1);
    }
    expect(box(day(31)).left).toBe(box(day(1)).left);
    const sizes = new Set(
      days().map((d) => `${String(Math.round(box(d).width))}x${String(Math.round(box(d).height))}`),
    );
    expect(sizes.size).toBe(1);
    const { width, height } = box(day(1));
    expect(Math.abs(width - height)).toBeLessThan(1);
  });

  it("met « Aucun jour » sur la 4e ligne, à droite du 31, à sa hauteur", () => {
    mount();
    trigger().click();
    expect(box(clear()).top).toBe(box(day(31)).top);
    expect(box(clear()).left).toBeGreaterThan(box(day(31)).right);
    expect(box(clear()).height).toBe(box(day(31)).height);
    expect(box(clear()).right).toBeLessThanOrEqual(box(day(10)).right + 0.5);
  });

  it("met le jour choisi en évidence à la couleur d'accent du thème", () => {
    mount({}, 13);
    trigger().click();
    const probe = document.createElement("i");
    probe.style.background = "var(--accent)";
    document.body.append(probe);
    const accent = getComputedStyle(probe).backgroundColor;
    probe.remove();
    expect(day(13).getAttribute("aria-pressed")).toBe("true");
    expect(getComputedStyle(day(13)).backgroundColor).toBe(accent);
    expect(day(14).getAttribute("aria-pressed")).toBe("false");
    expect(getComputedStyle(day(14)).backgroundColor).not.toBe(accent);
  });

  it("grise les jours impossibles, sans effet au clic", () => {
    const { chosen } = mount({ available: (d) => d <= 28 && d !== 5 }, null);
    trigger().click();
    for (const impossible of [5, 29, 30, 31]) {
      expect(day(impossible).disabled).toBe(true);
      expect(Number(getComputedStyle(day(impossible)).opacity)).toBeLessThan(0.6);
      day(impossible).click();
    }
    expect(day(6).disabled).toBe(false);
    expect(chosen).toEqual([]);
    expect(popup()).not.toBeNull();
  });
});

describe("sélecteur de jour : choisir", () => {
  it("un clic sur un jour le choisit, ferme la fenêtre et rend le curseur au champ", () => {
    const { chosen } = mount();
    trigger().click();
    day(20).click();
    expect(chosen).toEqual([20]);
    expect(popup()).toBeNull();
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger());
  });

  it("choisir le jour déjà choisi ferme sans rien dire", () => {
    const { chosen } = mount();
    trigger().click();
    day(13).click();
    expect(chosen).toEqual([]);
    expect(popup()).toBeNull();
  });

  it("« Aucun jour » efface le jour ; sans jour, il ne dit rien", () => {
    const first = mount();
    trigger().click();
    clear().click();
    expect(first.chosen).toEqual([null]);
    const second = mount({}, null);
    trigger().click();
    clear().click();
    expect(second.chosen).toEqual([]);
  });

  it("un deuxième clic sur le champ ferme la fenêtre", () => {
    mount();
    trigger().click();
    trigger().click();
    expect(popup()).toBeNull();
  });
});

describe("sélecteur de jour : le clavier", () => {
  it("Entrée sur le champ ouvre la fenêtre, le curseur sur le jour choisi", async () => {
    mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    expect(popup()).not.toBeNull();
    expect(document.activeElement).toBe(day(13));
  });

  it("Espace et la flèche du bas ouvrent aussi ; sans jour, le curseur va sur le premier jour possible", async () => {
    mount({ available: (d) => d >= 4 }, null);
    trigger().focus();
    await userEvent.keyboard(" ");
    expect(document.activeElement).toBe(day(4));
    key("Escape");
    expect(popup()).toBeNull();
    key("ArrowDown", trigger());
    expect(popup()).not.toBeNull();
  });

  it("gauche et droite passent d'un jour possible à l'autre, haut et bas d'une ligne", () => {
    mount({ available: (d) => d !== 14 && d !== 24 }, 13);
    trigger().click();
    key("ArrowRight");
    expect(document.activeElement).toBe(day(15));
    key("ArrowLeft");
    expect(document.activeElement).toBe(day(13));
    key("ArrowDown");
    expect(document.activeElement).toBe(day(23));
    key("ArrowUp");
    key("ArrowUp");
    expect(document.activeElement).toBe(day(3));
    key("ArrowUp");
    expect(document.activeElement).toBe(day(3));
    key("ArrowLeft");
    key("ArrowLeft");
    key("ArrowLeft");
    expect(document.activeElement).toBe(day(1));
    key("ArrowLeft");
    expect(document.activeElement).toBe(day(1));
  });

  it("la flèche du bas descend du 21 sur le 31 ; des autres jours de la dernière ligne, sur « Aucun jour »", () => {
    mount({}, 21);
    trigger().click();
    key("ArrowDown");
    expect(document.activeElement).toBe(day(31));
    key("ArrowDown");
    expect(document.activeElement).toBe(day(31));
    key("ArrowUp");
    expect(document.activeElement).toBe(day(21));
    key("ArrowRight");
    key("ArrowDown");
    expect(document.activeElement).toBe(clear());
    key("ArrowDown");
    expect(document.activeElement).toBe(clear());
    key("ArrowRight");
    expect(document.activeElement).toBe(clear());
    key("ArrowUp");
    expect(document.activeElement).toBe(day(30));
  });

  it("la droite après le 31 va sur « Aucun jour », la gauche en revient ; sans 31, depuis le 30", () => {
    mount({ available: (d) => d <= 30 }, 30);
    trigger().click();
    key("ArrowRight");
    expect(document.activeElement).toBe(clear());
    key("ArrowLeft");
    expect(document.activeElement).toBe(day(30));
  });

  it("sans aucun jour possible, le curseur va sur « Aucun jour »", () => {
    mount({ available: () => false }, null);
    trigger().click();
    expect(document.activeElement).toBe(clear());
    key("Home");
    key("End");
    expect(document.activeElement).toBe(clear());
  });

  it("Début et Fin vont au premier et au dernier jour possible", () => {
    mount({ available: (d) => d >= 3 && d <= 30 }, 13);
    trigger().click();
    key("End");
    expect(document.activeElement).toBe(day(30));
    key("Home");
    expect(document.activeElement).toBe(day(3));
  });

  it("Entrée et Espace choisissent le jour du curseur", async () => {
    const { chosen } = mount();
    trigger().focus();
    await userEvent.keyboard("{Enter}");
    key("ArrowRight");
    await userEvent.keyboard("{Enter}");
    expect(chosen).toEqual([14]);
    expect(document.activeElement).toBe(trigger());
    await userEvent.keyboard("{Enter}");
    key("ArrowLeft");
    await userEvent.keyboard(" ");
    expect(chosen).toEqual([14, 12]);
  });

  it("Échap ferme, rend le curseur au champ, et ne remonte pas", () => {
    mount();
    const seen = vi.fn();
    document.addEventListener("keydown", seen);
    trigger().click();
    key("Escape");
    document.removeEventListener("keydown", seen);
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(trigger());
    expect(seen).not.toHaveBeenCalled();
  });

  it("quand le curseur sort du sélecteur (Tab), la fenêtre se ferme ; passer d'une case à l'autre ne la ferme pas", () => {
    mount();
    const after = document.createElement("button");
    document.body.append(after);
    trigger().click();
    clear().focus();
    expect(popup()).not.toBeNull();
    after.focus();
    expect(popup()).toBeNull();
    expect(document.activeElement).toBe(after);
  });

  it("une autre touche ne fait rien", () => {
    mount();
    trigger().click();
    key("a");
    expect(popup()).not.toBeNull();
    expect(document.activeElement).toBe(day(13));
  });
});

describe("sélecteur de jour : fermer et placer", () => {
  it("un clic à côté ferme la fenêtre, un clic dedans non", () => {
    mount();
    trigger().click();
    popup()?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).toBeNull();
  });

  it("un défilement ailleurs la ferme, un défilement dedans non", () => {
    mount();
    trigger().click();
    popup()?.dispatchEvent(new Event("scroll"));
    expect(popup()).not.toBeNull();
    document.dispatchEvent(new Event("scroll"));
    expect(popup()).toBeNull();
  });

  it("s'ouvre sous le champ, à son bord gauche, dans la fenêtre", () => {
    mount();
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.top).toBeGreaterThan(box(trigger()).bottom);
    expect(p.left).toBe(box(trigger()).left);
    expect(p.right).toBeLessThanOrEqual(window.innerWidth);
    expect(p.bottom).toBeLessThanOrEqual(window.innerHeight);
  });

  it("s'ouvre au-dessus du champ quand il n'y a pas la place dessous", () => {
    mount({}, 13, "padding:40px;width:300px;margin-top:560px");
    window.scrollTo(0, 0);
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.bottom).toBeLessThanOrEqual(box(trigger()).top);
    expect(p.top).toBeGreaterThanOrEqual(0);
  });

  it("ne déborde pas du bord droit de la fenêtre", () => {
    mount({}, 13, "padding:40px;width:300px;margin-left:760px");
    trigger().click();
    const p = box(popup() as HTMLElement);
    expect(p.right).toBeLessThanOrEqual(window.innerWidth);
    expect(p.left).toBeGreaterThanOrEqual(0);
  });

  it("reste dans une colonne étroite de 420 points : elle se replace et se rétrécit", () => {
    const { host } = mount({}, 13, "padding:0 16px;width:388px;margin-left:200px");
    const field = host.querySelector(".agenda-day-picker") as HTMLElement;
    field.style.marginLeft = "250px";
    trigger().click();
    const column = box(host);
    const p = box(popup() as HTMLElement);
    expect(p.left).toBeGreaterThanOrEqual(column.left);
    expect(p.right).toBeLessThanOrEqual(column.right);
    expect(box(day(10)).right).toBeLessThanOrEqual(p.right);
    expect(box(day(1)).width).toBeGreaterThan(24);
  });

  it("garde sa taille normale quand la colonne est large", () => {
    mount({}, 13, "padding:40px;width:900px");
    trigger().click();
    expect(box(popup() as HTMLElement).width).toBeGreaterThan(330);
    expect(box(popup() as HTMLElement).width).toBeLessThan(420);
  });
});
