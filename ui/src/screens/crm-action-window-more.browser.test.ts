import { describe, expect, it, vi } from "vitest";
import { action, crm } from "../../test-support/crm-fixture";
import {
  buttonIn,
  changedCrm,
  choose,
  commit,
  control,
  field,
  found,
  openedWindow,
  panel,
  sent,
  tick,
  waitForGesture,
  windowCrm,
} from "../../test-support/crm-window-fixture";
import {
  callsTo,
  card,
  column,
  dayColumn,
  mountCrm,
  press,
  type,
} from "../../test-support/crm-view-fixture";
import "../theme.css";
import "../style.css";
import { EMAILS_COPIED, NEW_TITLE, SAVE_TEXT } from "./crm-action-window";

const entered = (input: HTMLElement) => press(input, "Enter");
const typedIn = (name: string, value: string) => {
  const input = control<HTMLInputElement>(name);
  type(input, value);
  entered(input);
};

describe("fenêtre d'une action : étiquettes", () => {
  it("ajoute une étiquette à Entrée, le champ se vide, les doublons et le vide sont refusés", async () => {
    const m = await openedWindow();
    typedIn("Ajouter une étiquette", " vip ");
    await waitForGesture(m, 1);
    expect(sent(m)[0]).toEqual({ kind: "tags", tags: ["urgent", "salon", "vip"] });
    expect(control<HTMLInputElement>("Ajouter une étiquette").value).toBe("");
    typedIn("Ajouter une étiquette", "SALON");
    typedIn("Ajouter une étiquette", "   ");
    await tick();
    expect(sent(m)).toHaveLength(1);
  });

  it("retire une étiquette par « × »", async () => {
    const m = await openedWindow();
    buttonIn("Retirer l'étiquette urgent").click();
    await waitForGesture(m, 1);
    expect(sent(m)[0]).toEqual({ kind: "tags", tags: ["salon"] });
  });

  it("garde l'étiquette en cours de saisie quand la fenêtre se redessine", async () => {
    const m = await openedWindow();
    type(control<HTMLInputElement>("Ajouter une étiquette"), "vi");
    choose(control("Statut"), "Done");
    m.disk.crm = changedCrm({ tags: ["urgent"] });
    await m.view.reload();
    await vi.waitFor(() => expect(document.querySelectorAll(".crm-aw-tag")).toHaveLength(1));
    expect(control<HTMLInputElement>("Ajouter une étiquette").value).toBe("vi");
  });
});

describe("fenêtre d'une action : notes liées", () => {
  it("ouvre la note d'un clic sur son titre", async () => {
    const m = await openedWindow();
    (found(".crm-aw-note-link") as HTMLElement).click();
    expect(m.opened).toEqual(["Cahier des charges"]);
  });

  it("délie une note par « × »", async () => {
    const m = await openedWindow();
    buttonIn("Délier Cahier des charges").click();
    await waitForGesture(m, 1);
    expect(sent(m)[0]).toEqual({ kind: "linkedNotes", notes: [] });
  });

  it("lie la note choisie par la recherche de notes ; annuler ou choisir une note déjà liée ne fait rien", async () => {
    const m = await openedWindow();
    m.chosenNote.value = "Plan de la salle";
    buttonIn("+ Lier une note").click();
    await waitForGesture(m, 1);
    expect(sent(m)[0]).toEqual({
      kind: "linkedNotes",
      notes: ["Cahier des charges", "Plan de la salle"],
    });
    m.chosenNote.value = null;
    buttonIn("+ Lier une note").click();
    m.chosenNote.value = "Cahier des charges";
    buttonIn("+ Lier une note").click();
    await tick();
    expect(sent(m)).toHaveLength(1);
  });
});

describe("fenêtre d'une action : copier les e-mails", () => {
  it("copie les e-mails des personnes qui en ont, séparés par « , », et le dit", async () => {
    const m = await openedWindow();
    buttonIn("Copier les e-mails").click();
    await vi.waitFor(() => expect(m.notices).toEqual([EMAILS_COPIED]));
    expect(m.copied).toEqual(["jean@acme.fr"]);
    expect(EMAILS_COPIED).toBe("E-mails copiés.");
    choose(control("+ Ajouter une personne"), "paul-martin");
    const people = windowCrm().actions[0]?.people ?? [];
    m.disk.crm = changedCrm({ people: [...people, { person: "paul-martin", company: "globex" }] });
    await m.view.reload();
    await vi.waitFor(() => expect(document.querySelectorAll(".crm-aw-person")).toHaveLength(3));
    buttonIn("Copier les e-mails").click();
    await vi.waitFor(() =>
      expect(m.copied).toEqual(["jean@acme.fr", "jean@acme.fr, paul@globex.fr"]),
    );
  });

  it("n'apparaît que si l'une des personnes a un e-mail", async () => {
    await openedWindow("appel");
    expect(document.querySelector(".crm-aw-copy")).toBeNull();
    await mountCrm({ crm: changedCrm({ people: [{ person: "marie-durand", company: null }] }) });
    card("devis").click();
    expect(document.querySelector(".crm-aw-copy")).toBeNull();
  });

  it("dit l'erreur, sans dire « copiés », quand la copie échoue", async () => {
    const m = await openedWindow();
    m.fail.next = "Copie impossible";
    buttonIn("Copier les e-mails").click();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "Copie impossible" }]));
    expect(m.notices).toEqual([]);
    expect(m.copied).toEqual([]);
  });
});

describe("fenêtre d'une action : supprimer", () => {
  it("demande confirmation, supprime, ferme", async () => {
    const m = await openedWindow();
    (document.querySelector(".crm-aw-delete") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(callsTo(m, "deleteCrmAction")).toHaveLength(1));
    expect(m.questions).toEqual(["Placer « Demande de devis » dans la corbeille ?"]);
    expect(callsTo(m, "deleteCrmAction")[0]).toEqual(["deleteCrmAction", "clients.md", "devis"]);
    await vi.waitFor(() => expect(document.querySelector(".crm-aw")).toBeNull());
  });

  it("ne supprime rien quand on refuse", async () => {
    const m = await openedWindow();
    m.answer.value = false;
    (document.querySelector(".crm-aw-delete") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(m.questions).toHaveLength(1));
    await tick();
    expect(callsTo(m, "deleteCrmAction")).toHaveLength(0);
    expect(document.querySelector(".crm-aw")).not.toBeNull();
  });

  it("reste ouverte, avec le message, quand la suppression échoue", async () => {
    const m = await openedWindow();
    m.fail.next = "Cette fiche n'existe plus.";
    (document.querySelector(".crm-aw-delete") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "Cette fiche n'existe plus." }]));
    await tick();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
  });
});

describe("fenêtre d'une nouvelle action", () => {
  const openForDay = async () => {
    const m = await mountCrm({ crm: windowCrm(), tab: "week" });
    (dayColumn("2026-11-27").querySelector(".crm-add-action") as HTMLButtonElement).click();
    return m;
  };

  it("s'ouvre depuis un jour de Ma semaine, à la date du jour, statut TODO, un bouton « Enregistrer »", async () => {
    await openForDay();
    expect(found(".crm-aw-heading")?.textContent).toBe(NEW_TITLE);
    expect(NEW_TITLE).toBe("Nouvelle action");
    expect(control<HTMLInputElement>("Date").value).toBe("2026-11-27");
    expect(control<HTMLSelectElement>("Statut").value).toBe("TODO");
    expect(field<HTMLInputElement>("title").value).toBe("");
    expect(buttonIn(SAVE_TEXT)).not.toBeUndefined();
    expect(SAVE_TEXT).toBe("Enregistrer");
    expect(document.querySelector(".crm-aw-delete")).toBeNull();
    expect(panel().getAttribute("aria-label")).toBe("Nouvelle action");
  });

  it("n'a ni liste à cocher ni commentaire", async () => {
    await openForDay();
    expect(document.querySelector(".crm-aw-checklists, .crm-aw-comments-section")).toBeNull();
  });

  it("garde un brouillon : aucun geste n'est envoyé tant qu'elle n'est pas enregistrée", async () => {
    const m = await openForDay();
    choose(control("Statut"), "Progress");
    choose(control("Canal"), "appel");
    choose(control("Projet"), "salon");
    commit(control("Date"), "2026-12-01");
    (document.querySelector('.crm-aw-swatch[aria-label="bleu"]') as HTMLElement).click();
    choose(control("+ Ajouter une personne"), "jean-dupont");
    typedIn("Ajouter une étiquette", "vip");
    m.chosenNote.value = "Plan";
    buttonIn("+ Lier une note").click();
    await vi.waitFor(() => expect(document.querySelectorAll(".crm-aw-note")).toHaveLength(1));
    expect(document.querySelectorAll(".crm-aw-person")).toHaveLength(1);
    expect(document.querySelectorAll(".crm-aw-tag")).toHaveLength(1);
    expect(callsTo(m, "changeCrmAction")).toHaveLength(0);
    expect(callsTo(m, "createCrmAction")).toHaveLength(0);
  });

  it("crée l'action avec ce qui est rempli, puis se ferme", async () => {
    const m = await openForDay();
    commit(field("title"), "  Relancer Jean ");
    commit(field("description"), "Avant vendredi");
    choose(control("Statut"), "Progress");
    choose(control("Canal"), "appel");
    choose(control("Projet"), "salon");
    commit(control("Date"), "2026-12-01");
    (document.querySelector('.crm-aw-swatch[aria-label="bleu"]') as HTMLElement).click();
    choose(control("+ Ajouter une personne"), "jean-dupont");
    typedIn("Ajouter une étiquette", "vip");
    m.chosenNote.value = "Plan";
    buttonIn("+ Lier une note").click();
    await vi.waitFor(() => expect(document.querySelectorAll(".crm-aw-note")).toHaveLength(1));
    buttonIn("Enregistrer").click();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]).toEqual([
      "createCrmAction",
      "clients.md",
      {
        ...{ title: "Relancer Jean", status: "Progress", date: "2026-12-01" },
        ...{ people: ["jean-dupont"], channel: "appel", project: "salon", color: "bleu" },
        ...{ tags: ["vip"], linkedNotes: ["Plan"], description: "Avant vendredi" },
      },
    ]);
    await vi.waitFor(() => expect(document.querySelector(".crm-aw")).toBeNull());
  });

  it("crée aussi l'action à Entrée dans le titre, une seule fois", async () => {
    const m = await openForDay();
    field<HTMLInputElement>("title").value = "Par Entrée";
    entered(field("title"));
    entered(field("title"));
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    await tick();
    expect(callsTo(m, "createCrmAction")).toHaveLength(1);
    expect((callsTo(m, "createCrmAction")[0]?.[2] as { date: string }).date).toBe("2026-11-27");
  });

  it("retire une personne ou une étiquette du brouillon", async () => {
    await openForDay();
    choose(control("+ Ajouter une personne"), "jean-dupont");
    choose(control("+ Ajouter une personne"), "marie-durand");
    buttonIn("Retirer Jean Dupont").click();
    expect([...document.querySelectorAll(".crm-aw-person")].map((p) => p.textContent)).toEqual([
      "Marie Durand×",
    ]);
    typedIn("Ajouter une étiquette", "vip");
    buttonIn("Retirer l'étiquette vip").click();
    expect(document.querySelectorAll(".crm-aw-tag")).toHaveLength(0);
  });

  it("reste ouverte, avec le message de Rust, quand la création est refusée", async () => {
    const m = await openForDay();
    m.fail.next = "Le titre est obligatoire.";
    buttonIn("Enregistrer").click();
    await vi.waitFor(() => expect(m.errors).toEqual([{ message: "Le titre est obligatoire." }]));
    await tick();
    expect(document.querySelector(".crm-aw")).not.toBeNull();
  });

  it("n'enregistre rien quand on la ferme : le brouillon est abandonné", async () => {
    const m = await openForDay();
    field<HTMLInputElement>("title").value = "Abandonnée";
    press(field("title"), "Escape");
    await tick();
    expect(document.querySelector(".crm-aw")).toBeNull();
    expect(callsTo(m, "createCrmAction")).toHaveLength(0);
    expect(callsTo(m, "changeCrmAction")).toHaveLength(0);
  });

  it("garde un titre vide tel quel (Rust refuse la création) et une date vidée reprend sa valeur", async () => {
    await openForDay();
    commit(field("title"), "   ");
    expect(field<HTMLInputElement>("title").value).toBe("");
    commit(control("Date"), "");
    expect(control<HTMLInputElement>("Date").value).toBe("2026-11-27");
  });
});

describe("« + Ajouter une action » d'une colonne du Kanban", () => {
  it("ouvre la ligne d'ajout rapide quand le CRM a des personnes, pas la fenêtre", async () => {
    await mountCrm({ crm: windowCrm() });
    (column("Progress").querySelector(".crm-add-action") as HTMLButtonElement).click();
    expect(document.querySelector(".crm-quick-add")).not.toBeNull();
    expect(document.querySelector(".crm-aw")).toBeNull();
  });

  it("ouvre directement la fenêtre, au statut de la colonne, quand le CRM n'a aucune personne", async () => {
    await mountCrm({ crm: crm({ actions: [action("a")] }) });
    (column("Progress").querySelector(".crm-add-action") as HTMLButtonElement).click();
    expect(document.querySelector(".crm-quick-add")).toBeNull();
    expect(control<HTMLSelectElement>("Statut").value).toBe("Progress");
    expect(control<HTMLInputElement>("Date").value).toBe("2026-11-25");
  });

  it("« Plus de détails » ouvre la fenêtre avec le titre, la personne et le statut de la colonne, et ferme la ligne", async () => {
    await mountCrm({ crm: windowCrm() });
    (column("Progress").querySelector(".crm-add-action") as HTMLButtonElement).click();
    type(document.querySelector<HTMLInputElement>(".crm-quick-title") as HTMLInputElement, "Idée");
    const who = document.querySelector<HTMLSelectElement>(".crm-quick-person") as HTMLSelectElement;
    choose(who, "marie-durand");
    (document.querySelector(".crm-quick-details") as HTMLButtonElement).click();
    expect(document.querySelector(".crm-quick-add")).toBeNull();
    expect(field<HTMLInputElement>("title").value).toBe("Idée");
    expect(control<HTMLSelectElement>("Statut").value).toBe("Progress");
    expect([...document.querySelectorAll(".crm-aw-person")].map((p) => p.textContent)).toEqual([
      "Marie Durand×",
    ]);
    expect(control<HTMLInputElement>("Date").value).toBe("2026-11-25");
    expect(found(".crm-aw-heading")?.textContent).toBe("Nouvelle action");
  });

  it("« Plus de détails » sans personne choisie ni titre ouvre une fenêtre sans personne", async () => {
    await mountCrm({ crm: windowCrm() });
    (column("TODO").querySelector(".crm-add-action") as HTMLButtonElement).click();
    (document.querySelector(".crm-quick-details") as HTMLButtonElement).click();
    expect(document.querySelectorAll(".crm-aw-person")).toHaveLength(0);
    expect(field<HTMLInputElement>("title").value).toBe("");
    expect(control<HTMLSelectElement>("Statut").value).toBe("TODO");
  });
});

describe("fenêtre d'une nouvelle action : le texte tapé n'est pas perdu", () => {
  it("prend le titre et la description tapés sans avoir quitté le champ quand on enregistre", async () => {
    const m = await mountCrm({ crm: windowCrm(), tab: "week" });
    (dayColumn("2026-11-27").querySelector(".crm-add-action") as HTMLButtonElement).click();
    field<HTMLInputElement>("title").value = "Tapé";
    field<HTMLTextAreaElement>("description").value = "Aussi tapé";
    buttonIn("Enregistrer").click();
    await vi.waitFor(() => expect(callsTo(m, "createCrmAction")).toHaveLength(1));
    expect(callsTo(m, "createCrmAction")[0]?.[2]).toMatchObject({
      title: "Tapé",
      description: "Aussi tapé",
    });
  });

  it("garde le titre tapé quand une personne est ajoutée sans avoir quitté le champ", async () => {
    await mountCrm({ crm: windowCrm(), tab: "week" });
    (dayColumn("2026-11-27").querySelector(".crm-add-action") as HTMLButtonElement).click();
    field<HTMLInputElement>("title").value = "Tapé";
    field<HTMLTextAreaElement>("description").value = "Aussi tapé";
    choose(control("+ Ajouter une personne"), "jean-dupont");
    expect(field<HTMLInputElement>("title").value).toBe("Tapé");
    expect(field<HTMLTextAreaElement>("description").value).toBe("Aussi tapé");
  });
});
