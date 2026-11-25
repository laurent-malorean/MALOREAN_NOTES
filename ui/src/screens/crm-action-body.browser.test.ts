import { describe, expect, it, vi } from "vitest";
import {
  buttonIn,
  changedCrm,
  commit,
  control,
  field,
  openedWindow,
  sent,
  tick,
  waitForGesture,
} from "../../test-support/crm-window-fixture";
import { press, type } from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";

const body = (change: object) => ({ kind: "body", change });
const texts = (selector: string) =>
  [...document.querySelectorAll(`.crm-aw ${selector}`)].map((e) => e.textContent);

describe("fenêtre d'une action : listes à cocher", () => {
  it("montre chaque liste avec son nom, ses éléments et son avancement en pourcentage", async () => {
    await openedWindow();
    expect(texts(".crm-aw-progress")).toEqual(["50 %", "0 %"]);
    expect(
      [...document.querySelectorAll<HTMLInputElement>(".crm-aw-list-name")].map((i) => i.value),
    ).toEqual(["Préparation", "Envoi"]);
    const items = [...document.querySelectorAll<HTMLInputElement>(".crm-aw-item-text")];
    expect(items.map((i) => i.value)).toEqual(["Relire", "Chiffrer"]);
    const boxes = [...document.querySelectorAll<HTMLInputElement>(".crm-aw-check")];
    expect(boxes.map((b) => b.checked)).toEqual([true, false]);
  });

  it("coche et décoche un élément, désigné par la place de sa liste et la sienne", async () => {
    const m = await openedWindow();
    control<HTMLInputElement>("Cocher Chiffrer").click();
    control<HTMLInputElement>("Cocher Relire").click();
    await waitForGesture(m, 2);
    expect(sent(m)).toEqual([
      body({ kind: "checkItem", list: 0, item: 1, done: true }),
      body({ kind: "checkItem", list: 0, item: 0, done: false }),
    ]);
  });

  it("modifie un élément en le quittant ; un texte vidé ou inchangé reprend sa valeur", async () => {
    const m = await openedWindow();
    const item = control<HTMLInputElement>("Élément Chiffrer");
    commit(item, "  Chiffrer 3 postes ");
    commit(control("Élément Relire"), "   ");
    expect(control<HTMLInputElement>("Élément Relire").value).toBe("Relire");
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([
      body({ kind: "editItem", list: 0, item: 1, text: "Chiffrer 3 postes" }),
    ]);
  });

  it("retire un élément par « × »", async () => {
    const m = await openedWindow();
    buttonIn("Retirer Relire").click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([body({ kind: "removeItem", list: 0, item: 0 })]);
  });

  it("ajoute un élément à Entrée dans le champ de sa liste ; un champ vide ne fait rien", async () => {
    const m = await openedWindow();
    const add = field<HTMLInputElement>("item-new-1");
    type(add, "  Poster ");
    press(add, "Enter");
    type(field("item-new-1"), "   ");
    press(field("item-new-1"), "Enter");
    await waitForGesture(m, 1);
    await tick();
    expect(sent(m)).toEqual([body({ kind: "addItem", list: 1, text: "Poster" })]);
    expect(field<HTMLInputElement>("item-new-1").value).toBe("");
  });

  it("renomme une liste en la quittant", async () => {
    const m = await openedWindow();
    commit(control("Nom de la liste Envoi"), "Expédition");
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([body({ kind: "renameChecklist", list: 1, name: "Expédition" })]);
    commit(control("Nom de la liste Préparation"), "");
    expect(control<HTMLInputElement>("Nom de la liste Préparation").value).toBe("Préparation");
  });

  it("supprime une liste", async () => {
    const m = await openedWindow();
    buttonIn("Supprimer la liste Envoi").click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([body({ kind: "removeChecklist", list: 1 })]);
  });

  it("ajoute une liste à Entrée dans le champ « Ajouter une liste »", async () => {
    const m = await openedWindow();
    type(field("list-new"), " Courrier ");
    press(field("list-new"), "Enter");
    type(field("list-new"), "");
    press(field("list-new"), "Enter");
    await waitForGesture(m, 1);
    await tick();
    expect(sent(m)).toEqual([body({ kind: "addChecklist", name: "Courrier" })]);
  });
});

describe("fenêtre d'une action : commentaires", () => {
  it("montre le plus récent d'abord, avec son moment", async () => {
    await openedWindow();
    expect(texts(".crm-aw-comment-at")).toEqual(["2026-11-24 10:32", "2026-11-23 09:00"]);
    expect(texts(".crm-aw-comment-text")[1]).toBe("Premier appel");
    expect(texts(".crm-aw-comment-text")[0]).toBe("Voir https://acme.fr/devis.\nRetenter jeudi");
  });

  it("montre une adresse en lien cliquable, ouvert dans le navigateur et non dans la page", async () => {
    const m = await openedWindow();
    const link = document.querySelector<HTMLAnchorElement>(".crm-aw-comment-link");
    expect(link?.textContent).toBe("https://acme.fr/devis");
    expect(link?.getAttribute("href")).toBe("https://acme.fr/devis");
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    link?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(m.addresses).toEqual(["https://acme.fr/devis"]));
    expect(
      getComputedStyle(document.querySelector(".crm-aw-comment-text") as HTMLElement).whiteSpace,
    ).toBe("pre-wrap");
  });

  it("ajoute un commentaire par le bouton ; un texte vide ne fait rien", async () => {
    const m = await openedWindow();
    buttonIn("Ajouter le commentaire").click();
    type(control("Ajouter un commentaire"), "  Rappeler lundi ");
    buttonIn("Ajouter le commentaire").click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([body({ kind: "addComment", text: "Rappeler lundi" })]);
    expect(control<HTMLTextAreaElement>("Ajouter un commentaire").value).toBe("");
  });

  it("supprime un commentaire, désigné par sa place dans l'ordre écrit", async () => {
    const m = await openedWindow();
    buttonIn("Supprimer le commentaire du 2026-11-24 10:32").click();
    buttonIn("Supprimer le commentaire du 2026-11-23 09:00").click();
    await waitForGesture(m, 2);
    expect(sent(m)).toEqual([
      body({ kind: "removeComment", comment: 1 }),
      body({ kind: "removeComment", comment: 0 }),
    ]);
  });

  it("modifie un commentaire : champ rempli, enregistrer l'envoie, annuler le garde", async () => {
    const m = await openedWindow();
    buttonIn("Modifier le commentaire du 2026-11-23 09:00").click();
    const edit = control<HTMLTextAreaElement>("Modifier le commentaire");
    expect(edit.value).toBe("Premier appel");
    expect(document.querySelectorAll(".crm-aw-comment-edit")).toHaveLength(1);
    buttonIn("Annuler").click();
    expect(document.querySelector(".crm-aw-comment-edit")).toBeNull();
    buttonIn("Modifier le commentaire du 2026-11-23 09:00").click();
    type(control("Modifier le commentaire"), "  Premier appel, sans réponse ");
    buttonIn("Enregistrer le commentaire").click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([
      body({ kind: "editComment", comment: 0, text: "Premier appel, sans réponse" }),
    ]);
    expect(document.querySelector(".crm-aw-comment-edit")).toBeNull();
  });

  it("ne remplace pas un commentaire par un texte vide", async () => {
    const m = await openedWindow();
    buttonIn("Modifier le commentaire du 2026-11-23 09:00").click();
    type(control("Modifier le commentaire"), "  ");
    buttonIn("Enregistrer le commentaire").click();
    await tick();
    expect(sent(m)).toEqual([]);
    expect(document.querySelector(".crm-aw-comment-edit")).not.toBeNull();
  });

  it("garde le texte d'un commentaire en cours de modification quand la fenêtre se redessine", async () => {
    const m = await openedWindow();
    buttonIn("Modifier le commentaire du 2026-11-23 09:00").click();
    type(control("Modifier le commentaire"), "Brouillon");
    (document.activeElement as HTMLElement).blur();
    m.disk.crm = changedCrm({ tags: ["nouveau"] });
    await m.view.reload();
    await vi.waitFor(() =>
      expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("nouveau×"),
    );
    expect(control<HTMLTextAreaElement>("Modifier le commentaire").value).toBe("Brouillon");
  });
});
