import { describe, expect, it, vi } from "vitest";
import { TODAY } from "../../test-support/crm-fixture";
import { callsTo, card, dayColumn, mountCrm, press } from "../../test-support/crm-view-fixture";
import {
  buttonIn,
  changedCrm,
  choose,
  commit,
  control,
  field,
  found,
  labels,
  openedWindow,
  optionTexts,
  panel,
  root,
  sent,
  waitForGesture,
  windowCrm,
} from "../../test-support/crm-window-fixture";
import "../theme.css";
import "../style.css";
import { CLOSE_TEXT, DELETE_TEXT, EXISTING_TITLE } from "./crm-action-window";

const text = (selector: string) => found(selector)?.textContent ?? null;

describe("fenêtre d'une action : ouverture et fermeture", () => {
  it("s'ouvre d'un clic sur une carte du Kanban, sur l'action de la carte", async () => {
    await openedWindow("appel");
    expect(text(".crm-aw-heading")).toBe(EXISTING_TITLE);
    expect(EXISTING_TITLE).toBe("Action");
    expect(field<HTMLInputElement>("title").value).toBe("Appeler Marie");
    expect(panel().getAttribute("aria-label")).toBe("Action");
  });

  it("s'ouvre d'un clic sur une carte de Ma semaine", async () => {
    await mountCrm({ crm: windowCrm(), tab: "week" });
    card("appel").click();
    expect(field<HTMLInputElement>("title").value).toBe("Appeler Marie");
  });

  it("n'est pas ouverte avant le clic, et un clic sur une autre carte la remplace", async () => {
    const m = await mountCrm({ crm: windowCrm() });
    expect(document.querySelector(".crm-aw")).toBeNull();
    card("devis").click();
    card("appel").click();
    expect(document.querySelectorAll(".crm-aw")).toHaveLength(1);
    expect(field<HTMLInputElement>("title").value).toBe("Appeler Marie");
    expect(callsTo(m, "changeCrmAction")).toHaveLength(0);
  });

  it("occupe la droite de la fenêtre sur toute sa hauteur, 600 points au plus", async () => {
    await openedWindow();
    const box = panel().getBoundingClientRect();
    const around = root().getBoundingClientRect();
    expect(box.right).toBe(around.right);
    expect(box.height).toBe(around.height);
    expect(box.width).toBeLessThanOrEqual(600);
    expect(getComputedStyle(root()).position).toBe("fixed");
    expect(getComputedStyle(found(".crm-aw-body") as HTMLElement).overflowY).toBe("auto");
  });

  it("se ferme par « Fermer », par Échap, par un clic à côté, jamais par un clic dedans", async () => {
    await openedWindow();
    expect(CLOSE_TEXT).toBe("Fermer");
    panel().click();
    field<HTMLElement>("title").click();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
    buttonIn("Fermer").click();
    expect(document.querySelector(".crm-aw")).toBeNull();
    await openedWindow();
    press(field("title"), "Escape");
    expect(document.querySelector(".crm-aw")).toBeNull();
    await openedWindow();
    (found(".crm-aw-backdrop") as HTMLElement).click();
    expect(document.querySelector(".crm-aw")).toBeNull();
    await openedWindow();
    press(field("title"), "a");
    expect(document.querySelector(".crm-aw")).not.toBeNull();
  });

  it("donne le curseur au panneau pour une action existante, et au titre pour une nouvelle", async () => {
    await openedWindow();
    expect(document.activeElement).toBe(panel());
    await mountCrm({ crm: windowCrm(), tab: "week" });
    (dayColumn("2026-11-27").querySelector(".crm-add-action") as HTMLButtonElement).click();
    expect(document.activeElement).toBe(field("title"));
  });

  it("se ferme avec la colonne du CRM", async () => {
    const m = await openedWindow();
    m.view.destroy();
    expect(document.querySelector(".crm-aw")).toBeNull();
  });
});

describe("fenêtre d'une action : ce qu'elle montre", () => {
  it("montre les parties dans l'ordre du § 8", async () => {
    await openedWindow();
    expect(labels()).toEqual([
      ...["Titre", "Statut", "Date", "Canal", "Personnes", "Projet", "Couleur", "Description"],
      ...["Checklists", "Étiquettes", "Notes liées", "Commentaires"],
    ]);
    const order = [...document.querySelectorAll(".crm-aw-body > section")].map((s) => s.className);
    expect(order.map((c) => c.replace("crm-aw-section ", ""))).toEqual([
      ...["crm-aw-title-section", "crm-aw-status", "crm-aw-people-section", "crm-aw-project"],
      ...["crm-aw-color", "crm-aw-description-section", "crm-aw-checklists"],
      ...["crm-aw-tags-section", "crm-aw-notes-section", "crm-aw-comments-section"],
    ]);
    expect(buttonIn(DELETE_TEXT)).not.toBeUndefined();
    expect(DELETE_TEXT).toBe("Supprimer");
    expect(document.querySelector(".crm-aw-save-action")).toBeNull();
  });

  it("montre chaque personne « Nom · Entreprise », sans entreprise pour NODATA", async () => {
    await openedWindow();
    const rows = [...document.querySelectorAll(".crm-aw-person")].map((r) => r.textContent);
    expect(rows).toEqual(["Jean Dupont · Acme×", "Marie Durand×"]);
  });

  it("montre l'entreprise du moment où la personne a été donnée, pas celle d'aujourd'hui", async () => {
    const m = await mountCrm({ crm: windowCrm() });
    m.disk.crm = changedCrm({ people: [{ person: "jean-dupont", company: "globex" }] });
    await m.view.reload();
    card("devis").click();
    expect(text(".crm-aw-person")).toBe("Jean Dupont · Globex×");
  });

  it("laisse de côté une personne dont la fiche n'existe plus", async () => {
    await mountCrm({ crm: changedCrm({ people: [{ person: "disparu", company: "acme" }] }) });
    card("devis").click();
    expect(document.querySelectorAll(".crm-aw-person")).toHaveLength(0);
  });

  it("montre le statut (les colonnes du CRM), la date et le canal côte à côte", async () => {
    await openedWindow();
    const status = control<HTMLSelectElement>("Statut");
    expect(optionTexts(status)).toEqual(["TODO", "Progress", "WaitingFor", "Done", "Cancel"]);
    expect(status.value).toBe("TODO");
    const date = control<HTMLInputElement>("Date");
    expect([date.type, date.value]).toEqual(["date", "2026-11-22"]);
    const channel = control<HTMLSelectElement>("Canal");
    expect(optionTexts(channel)).toEqual([
      ...["Sans canal", "appel", "e-mail", "rendez-vous", "courrier", "salon"],
      ...["réseau social", "autre"],
    ]);
    expect(channel.value).toBe("appel");
    const row = found(".crm-aw-row") as HTMLElement;
    expect(row.querySelectorAll("select, input")).toHaveLength(3);
    const [a, b] = [status, date].map((e) => e.getBoundingClientRect().top);
    expect(a).toBe(b);
  });

  it("montre « Sans canal » pour une action sans canal", async () => {
    await openedWindow("appel");
    expect(control<HTMLSelectElement>("Canal").value).toBe("");
    expect(control<HTMLInputElement>("Date").value).toBe(TODAY);
    expect(control<HTMLSelectElement>("Statut").value).toBe("Progress");
  });

  it("montre le projet, « Sans projet » en tête", async () => {
    await openedWindow();
    const project = control<HTMLSelectElement>("Projet");
    expect(optionTexts(project)).toEqual(["Sans projet", "Refonte du site", "Salon"]);
    expect(project.value).toBe("refonte");
  });

  it("montre « Sans projet » quand le projet de l'action n'existe plus", async () => {
    await mountCrm({ crm: changedCrm({ project: "disparu" }) });
    card("devis").click();
    expect(control<HTMLSelectElement>("Projet").value).toBe("");
  });

  it("montre une pastille par couleur de la palette, dans l'ordre, et « Sans couleur »", async () => {
    await openedWindow();
    const swatches = [...document.querySelectorAll<HTMLElement>(".crm-aw-swatch")];
    expect(swatches.map((s) => s.getAttribute("aria-label"))).toEqual([
      ...["rouge", "orange", "jaune", "vert", "turquoise"],
      ...["bleu", "violet", "rose", "marron", "ardoise"],
    ]);
    expect(swatches.map((s) => s.getAttribute("aria-pressed"))).toEqual(
      swatches.map((s) => String(s.getAttribute("aria-label") === "violet")),
    );
    expect(swatches[0]?.style.getPropertyValue("--swatch-color")).toBe("var(--palette-rouge)");
    expect(getComputedStyle(swatches[0] as HTMLElement).backgroundColor).not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    expect(buttonIn("Sans couleur").getAttribute("aria-pressed")).toBe("false");
  });

  it("marque « Sans couleur » pour une action sans couleur", async () => {
    await openedWindow("appel");
    expect(buttonIn("Sans couleur").getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector('.crm-aw-swatch[aria-pressed="true"]')).toBeNull();
  });

  it("montre le titre, la description, les étiquettes, les notes liées", async () => {
    await openedWindow();
    expect(field<HTMLInputElement>("title").value).toBe("Demande de devis");
    expect(control<HTMLTextAreaElement>("Description").value).toBe("Pour 3 postes");
    const tags = [...document.querySelectorAll(".tag-chip")].map((t) => t.textContent);
    expect(tags).toEqual(["urgent×", "salon×"]);
    expect((found(".tag-chip") as HTMLElement).style.getPropertyValue("--label-color")).toBe(
      "var(--palette-orange)",
    );
    expect(text(".crm-aw-note-link")).toBe("Cahier des charges");
    expect(buttonIn("Lier une note")).not.toBeUndefined();
    const suggestions = [...document.querySelectorAll(".crm-aw datalist option")].map(
      (o) => (o as HTMLOptionElement).value,
    );
    // « urgent » et « salon » sont déjà sur l'action : seules celles qu'elle n'a pas sont proposées.
    expect(suggestions).toEqual(["vip"]);
    expect(control<HTMLInputElement>("Ajouter une étiquette").getAttribute("list")).toBe(
      found("datalist")?.id,
    );
  });
});

describe("fenêtre d'une action existante : enregistrement à chaque geste", () => {
  it("change le statut, la date, le canal, le projet, la couleur dès qu'on les change", async () => {
    const m = await openedWindow();
    choose(control("Statut"), "Done");
    commit(control("Date"), "2026-12-01");
    choose(control("Canal"), "salon");
    choose(control("Projet"), "salon");
    (document.querySelector('.crm-aw-swatch[aria-label="rouge"]') as HTMLElement).click();
    await waitForGesture(m, 5);
    expect(sent(m)).toEqual([
      { kind: "status", status: "Done" },
      { kind: "date", date: "2026-12-01" },
      { kind: "channel", channel: "salon" },
      { kind: "project", project: "salon" },
      { kind: "color", color: "rouge" },
    ]);
    expect(callsTo(m, "changeCrmAction")[0]?.slice(1, 3)).toEqual(["clients.md", "devis"]);
  });

  it("retire le canal, le projet et la couleur", async () => {
    const m = await openedWindow();
    choose(control("Canal"), "");
    choose(control("Projet"), "");
    buttonIn("Sans couleur").click();
    await waitForGesture(m, 3);
    expect(sent(m)).toEqual([
      { kind: "channel", channel: null },
      { kind: "project", project: null },
      { kind: "color", color: null },
    ]);
  });

  it("relit le CRM après chaque geste, réussi ou refusé", async () => {
    const m = await openedWindow();
    const reads = callsTo(m, "readCrm").length;
    m.fail.next = "Refusé";
    choose(control("Statut"), "Done");
    await vi.waitFor(() => expect(callsTo(m, "readCrm")).toHaveLength(reads + 1));
    expect(m.errors).toEqual([{ message: "Refusé" }]);
  });

  it("enregistre le titre en le quittant, sans espaces autour ; un titre vidé reprend sa valeur", async () => {
    const m = await openedWindow();
    commit(field("title"), "  Nouveau titre ");
    await waitForGesture(m, 1);
    expect(sent(m)[0]).toEqual({ kind: "title", title: "Nouveau titre" });
    expect(field<HTMLInputElement>("title").value).toBe("Nouveau titre");
    commit(field("title"), "   ");
    expect(field<HTMLInputElement>("title").value).toBe("Nouveau titre");
    commit(field("title"), "Nouveau titre");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sent(m)).toHaveLength(1);
  });

  it("enregistre le titre à Entrée, une seule fois même en quittant le champ ensuite", async () => {
    const m = await openedWindow();
    const title = field<HTMLInputElement>("title");
    title.value = "Par Entrée";
    const enter = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
    title.dispatchEvent(enter);
    expect(enter.defaultPrevented).toBe(true);
    title.dispatchEvent(new Event("change", { bubbles: true }));
    await waitForGesture(m, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sent(m)).toEqual([{ kind: "title", title: "Par Entrée" }]);
    press(title, "a");
    expect(sent(m)).toHaveLength(1);
  });

  it("enregistre la description en quittant le champ, une description inchangée n'envoie rien", async () => {
    const m = await openedWindow();
    commit(control("Description"), "Pour 3 postes");
    commit(control("Description"), "Pour 4 postes\n\n- liste");
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([
      { kind: "body", change: { kind: "description", text: "Pour 4 postes\n\n- liste" } },
    ]);
  });

  it("une date vidée reprend sa valeur", async () => {
    const m = await openedWindow();
    commit(control("Date"), "");
    expect(control<HTMLInputElement>("Date").value).toBe("2026-11-22");
    commit(control("Date"), "2026-11-22");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sent(m)).toEqual([]);
  });

  it("fermer enregistre le titre, la description et la date qui ne le sont pas encore", async () => {
    const m = await openedWindow();
    field<HTMLInputElement>("title").value = "Titre tapé";
    field<HTMLTextAreaElement>("description").value = "Texte tapé";
    buttonIn("Fermer").click();
    await waitForGesture(m, 2);
    expect(sent(m)).toEqual([
      { kind: "title", title: "Titre tapé" },
      { kind: "body", change: { kind: "description", text: "Texte tapé" } },
    ]);
  });

  it("fermer sans rien changer n'envoie rien", async () => {
    const m = await openedWindow();
    buttonIn("Fermer").click();
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sent(m)).toEqual([]);
  });

  it("ajoute une personne avec une liste qui écarte celles déjà présentes", async () => {
    const m = await openedWindow();
    const add = control<HTMLSelectElement>("+ Ajouter une personne");
    expect(optionTexts(add)).toEqual(["+ Ajouter une personne", "Paul Martin · Globex"]);
    choose(add, "paul-martin");
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([{ kind: "addPerson", person: "paul-martin" }]);
    choose(add, "");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(sent(m)).toHaveLength(1);
  });

  it("retire une personne par « × »", async () => {
    const m = await openedWindow();
    buttonIn("Retirer Marie Durand").click();
    await waitForGesture(m, 1);
    expect(sent(m)).toEqual([{ kind: "removePerson", person: "marie-durand" }]);
  });

  it("propose le lien vers la fiche d'une personne quand l'application sait l'ouvrir", async () => {
    const m = await openedWindow("devis", { withPersonLink: true });
    buttonIn("Fiche de Jean Dupont").click();
    expect(m.people).toEqual(["jean-dupont"]);
  });

  it("ne propose pas de lien vers la fiche quand l'application ne sait pas l'ouvrir", async () => {
    await openedWindow();
    expect(document.querySelector(".crm-aw-person-name.link")).toBeNull();
    expect(document.querySelector(".crm-aw-person button.link")).toBeNull();
  });
});
