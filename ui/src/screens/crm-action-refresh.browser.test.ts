import { describe, expect, it, vi } from "vitest";
import {
  buttonIn,
  changedCrm,
  control,
  field,
  openedWindow,
  sent,
  waitForGesture,
  windowCrm,
} from "../../test-support/crm-window-fixture";
import { press, type } from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";

const devis = () => windowCrm().actions[0] as ReturnType<typeof windowCrm>["actions"][number];
const names = () =>
  [...document.querySelectorAll<HTMLInputElement>(".crm-aw-list-name")].map((i) => i.value);

/** Le curseur est dans le champ d'ajout : Entrée l'enregistre, Rust écrit, la fenêtre doit le montrer sans que le curseur en sorte. */
describe("fenêtre d'une action : chaque geste se voit aussitôt, curseur resté dans le champ", () => {
  it("une checklist créée apparaît dès Entrée", async () => {
    const m = await openedWindow();
    buttonIn("Ajouter une checklist").click();
    const add = field<HTMLInputElement>("list-new");
    type(add, "Courrier");
    m.disk.crm = changedCrm({
      checklists: [...devis().checklists, { name: "Courrier", done: 0, items: [] }],
    });
    press(add, "Enter");
    await waitForGesture(m, 1);
    await vi.waitFor(() => expect(names()).toEqual(["Préparation", "Envoi", "Courrier"]));
    expect(document.activeElement).toBe(field("list-new"));
    expect(field<HTMLInputElement>("list-new").value).toBe("");
  });

  it("un élément ajouté apparaît dès Entrée", async () => {
    const m = await openedWindow();
    buttonIn("Ajouter un élément").click();
    const add = field<HTMLInputElement>("item-new-0");
    type(add, "Poster");
    const lists = devis().checklists;
    m.disk.crm = changedCrm({
      checklists: lists.map((list, at) =>
        at === 0 ? { ...list, items: [{ done: false, text: "Poster" }] } : list,
      ),
    });
    press(add, "Enter");
    await waitForGesture(m, 1);
    await vi.waitFor(() => expect(control("Élément Poster")).not.toBeNull());
  });

  it("une étiquette ajoutée apparaît dès Entrée", async () => {
    const m = await openedWindow();
    const add = field<HTMLInputElement>("tag");
    add.focus();
    type(add, "vip");
    m.disk.crm = changedCrm({ tags: ["urgent", "salon", "vip"] });
    press(add, "Enter");
    await waitForGesture(m, 1);
    await vi.waitFor(() => expect(document.querySelectorAll(".crm-aw .tag-chip")).toHaveLength(3));
    expect(sent(m)).toEqual([{ kind: "tags", tags: ["urgent", "salon", "vip"] }]);
  });
});

describe("fenêtre d'une action : le sélecteur de date", () => {
  it("choisit un jour au calendrier de l'application : un geste « date » part, la fenêtre reste ouverte", async () => {
    const m = await openedWindow();
    (document.querySelector(".crm-aw .date-open") as HTMLElement).click();
    expect(document.querySelector(".crm-aw .date-popup")).not.toBeNull();
    (document.querySelector('.date-day[data-date="2026-11-30"]') as HTMLElement).click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([{ kind: "date", date: "2026-11-30" }]);
    expect(control<HTMLInputElement>("Date").value).toBe("30/11/2026");
    expect(document.querySelector(".crm-aw")).not.toBeNull();
  });

  it("Échap ferme d'abord le calendrier, puis la fenêtre", async () => {
    await openedWindow();
    const date = control<HTMLInputElement>("Date");
    date.focus();
    date.click();
    press(date, "Escape");
    expect(document.querySelector(".date-popup")).toBeNull();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
    press(date, "Escape");
    expect(document.querySelector(".crm-aw")).toBeNull();
  });

  it("enregistre une date écrite et pas encore validée quand la fenêtre se ferme", async () => {
    const m = await openedWindow();
    control<HTMLInputElement>("Date").value = "03/12/2026";
    (document.querySelector(".crm-aw-close") as HTMLElement).click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([{ kind: "date", date: "2026-12-03" }]);
  });

  it("garde la date et le curseur dans le champ quand la fenêtre se redessine", async () => {
    const m = await openedWindow();
    const date = control<HTMLInputElement>("Date");
    date.focus();
    m.disk.crm = changedCrm({ tags: ["vip"] });
    await m.view.reload();
    date.blur();
    await vi.waitFor(() => expect(document.querySelector(".tag-chip")?.textContent).toBe("vip×"));
    expect(control<HTMLInputElement>("Date").value).toBe("22/11/2026");
  });
});
