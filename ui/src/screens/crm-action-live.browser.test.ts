import { describe, expect, it, vi } from "vitest";
import {
  buttonIn,
  changedCrm,
  choose,
  commit,
  control,
  field,
  found,
  openedWindow,
  root,
  sent,
  tick,
  windowCrm,
} from "../../test-support/crm-window-fixture";
import { callsTo, card, mountCrm, type MountedCrm } from "../../test-support/crm-view-fixture";
import type { CrmActionItem } from "../bridge";
import "../theme.css";
import "../style.css";

/** Le CRM sur le disque, où l'action « devis » change : Claude, Obsidian ou iCloud l'ont modifiée. */
async function changedElsewhere(m: MountedCrm, over: Partial<CrmActionItem>) {
  m.disk.crm = changedCrm(over);
  await m.view.reload();
}

describe("fenêtre d'une action : mise à jour en direct (§ 10)", () => {
  it("montre aussitôt un changement venu d'ailleurs", async () => {
    const m = await openedWindow();
    await changedElsewhere(m, {
      ...{ title: "Titre d'ailleurs", status: "Done", date: "2026-12-05", color: "rouge" },
      ...{ description: "Autre texte", tags: ["vip"], linkedNotes: [], channel: "salon" },
    });
    await vi.waitFor(() => expect(field<HTMLInputElement>("title").value).toBe("Titre d'ailleurs"));
    expect(control<HTMLSelectElement>("Statut").value).toBe("Done");
    expect(control<HTMLInputElement>("Date").value).toBe("2026-12-05");
    expect(control<HTMLSelectElement>("Canal").value).toBe("salon");
    expect(control<HTMLTextAreaElement>("Description").value).toBe("Autre texte");
    expect(
      document.querySelector('.crm-aw-swatch[aria-pressed="true"]')?.getAttribute("aria-label"),
    ).toBe("rouge");
    expect(document.querySelectorAll(".crm-aw-tag")).toHaveLength(1);
    expect(document.querySelectorAll(".crm-aw-note")).toHaveLength(0);
  });

  it("attend la fin d'une saisie : le champ qui a le curseur n'est pas touché, la mise à jour s'applique en le quittant", async () => {
    const m = await openedWindow();
    const title = field<HTMLInputElement>("title");
    title.focus();
    title.value = "Titre en cours de frappe";
    await changedElsewhere(m, { title: "Titre d'ailleurs", description: "Autre texte" });
    await tick();
    expect(field<HTMLInputElement>("title")).toBe(title);
    expect(title.value).toBe("Titre en cours de frappe");
    expect(control<HTMLTextAreaElement>("Description").value).toBe("Pour 3 postes");
    title.blur();
    await vi.waitFor(() =>
      expect(control<HTMLTextAreaElement>("Description").value).toBe("Autre texte"),
    );
    expect(field<HTMLInputElement>("title").value).toBe("Titre d'ailleurs");
  });

  it("attend aussi pendant la saisie d'un commentaire, et ne perd pas ce qui y est tapé", async () => {
    const m = await openedWindow();
    const area = control<HTMLTextAreaElement>("Ajouter un commentaire");
    area.focus();
    area.value = "À moitié écrit";
    area.dispatchEvent(new Event("input", { bubbles: true }));
    await changedElsewhere(m, { tags: ["vip"] });
    await tick();
    expect(document.querySelectorAll(".crm-aw-tag")).toHaveLength(2);
    expect(document.querySelectorAll(".crm-aw-tag")[0]?.textContent).toBe("urgent×");
    area.blur();
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
    expect(control<HTMLTextAreaElement>("Ajouter un commentaire").value).toBe("À moitié écrit");
  });

  it("n'attend pas quand le curseur est dans une liste ou sur une case", async () => {
    const m = await openedWindow();
    control<HTMLSelectElement>("Statut").focus();
    await changedElsewhere(m, { tags: ["vip"] });
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
  });

  it("attend la fin d'un clic en cours avant de redessiner, pour ne pas perdre le clic", async () => {
    const m = await openedWindow();
    found(".crm-aw-body")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await changedElsewhere(m, { tags: ["vip"] });
    await tick();
    expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("urgent×");
    document.dispatchEvent(new PointerEvent("pointerup"));
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
  });

  it("une mise à jour annulée par le pointeur s'applique aussi", async () => {
    const m = await openedWindow();
    found(".crm-aw-body")?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await changedElsewhere(m, { tags: ["vip"] });
    document.dispatchEvent(new PointerEvent("pointercancel"));
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
  });

  it("ne se redessine pas quand la lecture ne change rien à ce qu'elle montre", async () => {
    const m = await openedWindow();
    const title = field<HTMLInputElement>("title");
    await m.view.reload();
    await m.view.reload();
    expect(field<HTMLInputElement>("title")).toBe(title);
  });

  it("ne se redessine pas quand Rust confirme le titre qu'on vient d'enregistrer", async () => {
    const m = await openedWindow();
    const select = control<HTMLSelectElement>("Statut");
    commit(field("title"), "Enregistré");
    choose(select, "Done");
    await vi.waitFor(() => expect(sent(m)).toHaveLength(2));
    await changedElsewhere(m, { title: "Enregistré", status: "Done" });
    expect(control<HTMLSelectElement>("Statut")).toBe(select);
    expect(field<HTMLInputElement>("title").value).toBe("Enregistré");
  });

  it("retrouve la valeur de Rust quand un geste est refusé", async () => {
    const m = await openedWindow();
    m.fail.next = "Cette fiche n'existe plus.";
    commit(field("title"), "Refusé");
    await vi.waitFor(() => expect(m.errors).toHaveLength(1));
    await vi.waitFor(() => expect(field<HTMLInputElement>("title").value).toBe("Demande de devis"));
  });

  it("garde le curseur dans la liste redessinée, au même champ", async () => {
    const m = await openedWindow();
    control<HTMLSelectElement>("Statut").focus();
    await changedElsewhere(m, { tags: ["vip"] });
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
    expect(document.activeElement).toBe(control("Statut"));
  });

  it("rend le curseur et la sélection d'un champ de texte redessiné après la saisie", async () => {
    const m = await openedWindow();
    const add = control<HTMLInputElement>("Ajouter une étiquette");
    add.focus();
    add.value = "abcdef";
    add.dispatchEvent(new Event("input", { bubbles: true }));
    add.setSelectionRange(2, 4);
    await changedElsewhere(m, { tags: ["vip"] });
    add.blur();
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
    expect(control<HTMLInputElement>("Ajouter une étiquette").value).toBe("abcdef");
  });

  it("garde le défilement du panneau quand elle se redessine", async () => {
    const m = await openedWindow();
    const body = found(".crm-aw-body") as HTMLElement;
    body.style.height = "120px";
    body.scrollTop = 80;
    const before = body.scrollTop;
    expect(before).toBeGreaterThan(0);
    await changedElsewhere(m, { tags: ["vip"] });
    await vi.waitFor(() => expect(document.querySelector(".crm-aw-tag")?.textContent).toBe("vip×"));
    expect((found(".crm-aw-body") as HTMLElement).scrollTop).toBe(before);
  });
});

describe("fenêtre d'une action : fiche disparue (§ 10)", () => {
  it("se ferme quand l'action est supprimée ailleurs, sans rien enregistrer", async () => {
    const m = await openedWindow();
    field<HTMLInputElement>("title").value = "Tapé avant la suppression";
    const data = windowCrm();
    data.actions = data.actions.filter((a) => a.name !== "devis");
    m.disk.crm = data;
    await m.view.reload();
    expect(document.querySelector(".crm-aw")).toBeNull();
    await tick();
    expect(callsTo(m, "changeCrmAction")).toHaveLength(0);
  });

  it("dit « Cette fiche n'existe plus. » quand le geste est abandonné, et se ferme à la relecture", async () => {
    const m = await openedWindow();
    m.fail.next = "Cette fiche n'existe plus.";
    const data = windowCrm();
    data.actions = data.actions.filter((a) => a.name !== "devis");
    m.disk.crm = data;
    choose(control("Statut"), "Done");
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "Cette fiche n'existe plus." }]));
    await vi.waitFor(() => expect(document.querySelector(".crm-aw")).toBeNull());
  });

  it("la fenêtre d'une nouvelle action reste ouverte quand le CRM est relu", async () => {
    const m = await mountCrm({ crm: windowCrm(), tab: "week" });
    (document.querySelector(".crm-week .crm-add-action") as HTMLButtonElement).click();
    await m.view.reload();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
    expect(root()).not.toBeNull();
  });

  it("met à jour la liste des personnes d'une nouvelle action quand le CRM change", async () => {
    const m = await mountCrm({ crm: windowCrm(), tab: "week" });
    (document.querySelector(".crm-week .crm-add-action") as HTMLButtonElement).click();
    expect(control<HTMLSelectElement>("+ Ajouter une personne").options).toHaveLength(4);
    const data = windowCrm();
    data.people = data.people.slice(0, 2);
    m.disk.crm = data;
    await m.view.reload();
    await tick();
    // Le titre a le curseur (une nouvelle action commence par lui) : la mise à jour attend.
    expect(control<HTMLSelectElement>("+ Ajouter une personne").options).toHaveLength(4);
    field<HTMLInputElement>("title").blur();
    await vi.waitFor(() =>
      expect(control<HTMLSelectElement>("+ Ajouter une personne").options).toHaveLength(3),
    );
    expect(buttonIn("Enregistrer")).not.toBeUndefined();
  });

  it("se redessine à chaque lecture pendant que la carte du Kanban derrière est à jour", async () => {
    const m = await openedWindow();
    await changedElsewhere(m, { title: "Titre d'ailleurs" });
    await vi.waitFor(() =>
      expect(card("devis").querySelector(".crm-card-title")?.textContent).toBe("Titre d'ailleurs"),
    );
  });
});
