import { beforeAll, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { dateField, type DateFieldOptions } from "./date-picker";
import "../theme.css";
import "../style.css";

beforeAll(() => page.viewport(1000, 800));

const TODAY = "2026-11-25";

function mount(over: Partial<DateFieldOptions> = {}, host?: HTMLElement) {
  const changes: string[] = [];
  const field = dateField({
    ...{ value: "2026-11-22", label: "Date", today: TODAY, clearable: false },
    change: (date) => changes.push(date),
    ...over,
  });
  const parent = host ?? document.createElement("div");
  if (host === undefined) {
    parent.style.cssText = "padding:40px;width:300px";
    document.body.replaceChildren(parent);
  }
  parent.append(field.element);
  return { ...field, changes, parent };
}
const popup = () => document.querySelector<HTMLElement>(".date-popup");
const day = (iso: string) =>
  document.querySelector<HTMLButtonElement>(`.date-day[data-date="${iso}"]`) as HTMLButtonElement;
const key = (target: HTMLElement, name: string) => {
  const event = new KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
  target.dispatchEvent(event);
  return event;
};
const opener = () => document.querySelector(".date-open") as HTMLButtonElement;
const month = () => document.querySelector(".date-month")?.textContent;

describe("sélecteur de date : le champ", () => {
  it("montre la date « JJ/MM/AAAA », un nom pour les lecteurs d'écran et un bouton visible", () => {
    const { input } = mount();
    expect(input.value).toBe("22/11/2026");
    expect(input.placeholder).toBe("JJ/MM/AAAA");
    expect(input.getAttribute("aria-label")).toBe("Date");
    expect(opener().getAttribute("aria-label")).toBe("Ouvrir le calendrier");
    expect(opener().getBoundingClientRect().height).toBe(36);
    expect(input.getBoundingClientRect().height).toBe(36);
    expect(popup()).toBeNull();
  });

  it("est vide sans date, et porte les données et la classe demandées", () => {
    const { input } = mount({ value: "", className: "mon-champ", data: { field: "date" } });
    expect(input.value).toBe("");
    expect(input.classList.contains("mon-champ")).toBe(true);
    expect(input.dataset.field).toBe("date");
  });
});

describe("sélecteur de date : le calendrier", () => {
  it("s'ouvre par le bouton, en français : mois en lettres, semaine commençant le lundi", () => {
    const { input } = mount();
    opener().click();
    expect(popup()?.getAttribute("role")).toBe("dialog");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    expect(month()).toBe("novembre 2026");
    expect([...document.querySelectorAll(".date-weekday")].map((d) => d.textContent)).toEqual([
      ..."LMMJVSD",
    ]);
    expect(
      [...document.querySelectorAll(".date-weekday")].map((d) => d.getAttribute("title"))[2],
    ).toBe("mercredi");
    const days = [...document.querySelectorAll<HTMLElement>(".date-day")];
    expect(days).toHaveLength(42);
    expect(days[0]?.dataset.date).toBe("2026-10-26");
    expect(days[6]?.textContent).toBe("1");
    expect(day("2026-11-25").getAttribute("aria-label")).toBe("mercredi 25 novembre 2026");
  });

  it("repère le jour d'aujourd'hui et marque le jour choisi", () => {
    mount();
    opener().click();
    expect(day("2026-11-25").classList.contains("today")).toBe(true);
    expect(day("2026-11-22").getAttribute("aria-pressed")).toBe("true");
    expect(day("2026-11-23").getAttribute("aria-pressed")).toBe("false");
    expect(day("2026-11-22").classList.contains("today")).toBe(false);
    expect(day("2026-10-26").classList.contains("outside")).toBe(true);
    expect(day("2026-11-02").classList.contains("outside")).toBe(false);
  });

  it("est grand : 308 points de large, des jours de 36 de haut, des flèches de 36", () => {
    mount();
    opener().click();
    expect(popup()?.getBoundingClientRect().width).toBe(308);
    expect(day("2026-11-25").getBoundingClientRect().height).toBe(36);
    expect(day("2026-11-25").getBoundingClientRect().width).toBeGreaterThan(36);
    expect(document.querySelector(".date-nav")?.getBoundingClientRect().height).toBe(36);
    expect(getComputedStyle(popup() as HTMLElement).fontSize).toBe("15px");
  });

  it("change de mois avec les flèches", () => {
    mount();
    opener().click();
    (document.querySelector('[aria-label="Mois suivant"]') as HTMLElement).click();
    expect(month()).toBe("décembre 2026");
    expect(day("2026-12-31")).not.toBeNull();
    (document.querySelector('[aria-label="Mois précédent"]') as HTMLElement).click();
    (document.querySelector('[aria-label="Mois précédent"]') as HTMLElement).click();
    expect(month()).toBe("octobre 2026");
  });

  it("choisit un jour d'un clic : la date est donnée, le champ la montre, le calendrier se ferme", () => {
    const { input, changes } = mount();
    opener().click();
    day("2026-11-30").click();
    expect(changes).toEqual(["2026-11-30"]);
    expect(input.value).toBe("30/11/2026");
    expect(popup()).toBeNull();
    expect(input.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(input);
  });

  it("choisit un jour d'un autre mois montré dans la grille", () => {
    const { changes } = mount();
    opener().click();
    day("2026-12-02").click();
    expect(changes).toEqual(["2026-12-02"]);
  });

  it("ne redonne pas la date qui n'a pas changé", () => {
    const { changes } = mount();
    opener().click();
    day("2026-11-22").click();
    expect(changes).toEqual([]);
  });

  it("« Aujourd'hui » choisit le jour d'aujourd'hui ; « Effacer » n'est là que si la date peut être vide", () => {
    const first = mount();
    opener().click();
    expect(document.querySelector(".date-clear")).toBeNull();
    (document.querySelector(".date-today") as HTMLElement).click();
    expect(first.changes).toEqual([TODAY]);
    const second = mount({ clearable: true });
    opener().click();
    expect([...document.querySelectorAll(".date-foot button")].map((b) => b.textContent)).toEqual([
      "Effacer",
      "Aujourd'hui",
    ]);
    (document.querySelector(".date-clear") as HTMLElement).click();
    expect(second.changes).toEqual([""]);
    expect(second.input.value).toBe("");
  });

  it("n'empêche pas le champ de garder le curseur quand on clique dans le calendrier", () => {
    mount();
    opener().click();
    const down = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
    day("2026-11-24").dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});

describe("sélecteur de date : ouverture et fermeture", () => {
  it("s'ouvre à un clic dans le champ, à la saisie et à la flèche du bas ; le bouton le referme", () => {
    const { input } = mount();
    input.click();
    expect(popup()).not.toBeNull();
    opener().click();
    expect(popup()).toBeNull();
    key(input, "ArrowDown");
    expect(popup()).not.toBeNull();
    opener().click();
    input.value = "2";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(popup()).not.toBeNull();
    input.click();
    expect(document.querySelectorAll(".date-popup")).toHaveLength(1);
  });

  it("se ferme par Échap sans laisser passer la touche ; sans calendrier, Échap passe", () => {
    const { input, parent } = mount();
    const seen: string[] = [];
    parent.addEventListener("keydown", (event) => seen.push(event.key));
    opener().click();
    key(input, "Escape");
    expect(popup()).toBeNull();
    expect(seen).toEqual([]);
    key(input, "Escape");
    expect(seen).toEqual(["Escape"]);
  });

  it("se ferme à un clic à côté, mais pas à un clic dedans", () => {
    mount();
    opener().click();
    day("2026-11-24").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).not.toBeNull();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).toBeNull();
  });

  it("se ferme quand le champ quitte la page et qu'on clique ailleurs", () => {
    mount();
    opener().click();
    document.body.replaceChildren();
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(popup()).toBeNull();
  });

  it("se ferme à Tab et au défilement de la page, pas à celui du calendrier", () => {
    const { input } = mount();
    opener().click();
    key(input, "Tab");
    expect(popup()).toBeNull();
    opener().click();
    popup()?.dispatchEvent(new Event("scroll"));
    expect(popup()).not.toBeNull();
    document.body.dispatchEvent(new Event("scroll"));
    expect(popup()).toBeNull();
  });
});

describe("sélecteur de date : au clavier", () => {
  it("les flèches changent de jour et de semaine, PageHaut et PageBas de mois, Entrée valide", () => {
    const { input, changes } = mount();
    opener().click();
    const cursor = () => document.querySelector<HTMLElement>(".date-day.cursor")?.dataset.date;
    expect(cursor()).toBe("2026-11-22");
    expect(key(input, "ArrowRight").defaultPrevented).toBe(true);
    expect(cursor()).toBe("2026-11-23");
    key(input, "ArrowDown");
    expect(cursor()).toBe("2026-11-30");
    key(input, "ArrowDown");
    expect(cursor()).toBe("2026-12-07");
    expect(month()).toBe("décembre 2026");
    key(input, "ArrowLeft");
    key(input, "ArrowUp");
    expect(cursor()).toBe("2026-11-29");
    key(input, "PageDown");
    expect(cursor()).toBe("2026-12-29");
    key(input, "PageUp");
    key(input, "PageUp");
    expect(cursor()).toBe("2026-10-29");
    expect(key(input, "a").defaultPrevented).toBe(false);
    const enter = key(input, "Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(changes).toEqual(["2026-10-29"]);
    expect(input.value).toBe("29/10/2026");
    expect(popup()).toBeNull();
  });

  it("ne bouge pas quand le calendrier est fermé : Entrée prend le texte écrit et laisse passer la touche", () => {
    const { input, changes } = mount();
    input.value = "05/12/2026";
    const enter = key(input, "Enter");
    expect(enter.defaultPrevented).toBe(false);
    expect(changes).toEqual(["2026-12-05"]);
    expect(key(input, "ArrowLeft").defaultPrevented).toBe(false);
  });
});

describe("sélecteur de date : ce qu'on écrit", () => {
  it("suit une date valide écrite : le calendrier s'ouvre sur son mois, Entrée la prend", () => {
    const { input, changes } = mount();
    input.value = "14/02/2027";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(month()).toBe("février 2027");
    expect(document.querySelector(".date-day.cursor")?.getAttribute("data-date")).toBe(
      "2027-02-14",
    );
    key(input, "Enter");
    expect(changes).toEqual(["2027-02-14"]);
  });

  it("garde le calendrier sur son mois tant que ce qui est écrit n'est pas une date", () => {
    const { input } = mount();
    input.value = "14/0";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(month()).toBe("novembre 2026");
  });

  it("prend la date en quittant le champ ; une date fausse ou vide reprend la valeur d'avant", () => {
    const { input, changes } = mount();
    input.value = "31/02/2026";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("22/11/2026");
    input.value = "";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("22/11/2026");
    input.value = "1/12/2026";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(input.value).toBe("01/12/2026");
    expect(changes).toEqual(["2026-12-01"]);
  });

  it("efface la date quand elle peut être vide", () => {
    const { input, changes } = mount({ clearable: true });
    input.value = "  ";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(changes).toEqual([""]);
    expect(input.value).toBe("");
  });
});

describe("sélecteur de date : emplacement", () => {
  it("s'ouvre sous le champ, sans sortir de la fenêtre", () => {
    const { input } = mount();
    opener().click();
    const field = input.getBoundingClientRect();
    const box = (popup() as HTMLElement).getBoundingClientRect();
    expect(box.top).toBe(field.bottom + 4);
    expect(box.left).toBe(field.left);
    expect(box.right).toBeLessThanOrEqual(window.innerWidth);
  });

  it("se décale à gauche quand le champ est au bord droit", () => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:800px;top:20px;width:190px";
    document.body.replaceChildren(host);
    mount({}, host);
    opener().click();
    const box = (popup() as HTMLElement).getBoundingClientRect();
    expect(box.right).toBe(window.innerWidth - 4);
  });

  it("passe au-dessus du champ quand il n'y a pas la place dessous", () => {
    const host = document.createElement("div");
    host.style.cssText = "position:absolute;left:20px;top:740px;width:190px";
    document.body.replaceChildren(host);
    const { input } = mount({}, host);
    opener().click();
    const box = (popup() as HTMLElement).getBoundingClientRect();
    expect(box.bottom).toBe(input.getBoundingClientRect().top - 4);
    vi.restoreAllMocks();
  });
});
