import { describe, expect, it } from "vitest";
import { contentTypeLabel, placeLabel } from "./content-type";

describe("type de contenu", () => {
  it("chaque type a son nom", () => {
    expect(contentTypeLabel("note")).toBe("Note");
    expect(contentTypeLabel("researchNotebook")).toBe("Cahier de recherche");
    expect(contentTypeLabel("entry")).toBe("Entrée");
  });

  it("le CRM et ses fiches ont leur nom", () => {
    expect(contentTypeLabel("crm")).toBe("CRM");
    expect(contentTypeLabel("crmCompany")).toBe("Entreprise");
    expect(contentTypeLabel("crmPerson")).toBe("Personne");
    expect(contentTypeLabel("crmAction")).toBe("Action");
    expect(contentTypeLabel("crmProject")).toBe("Projet");
  });

  it("l'agenda 12 et ses événements ont leur nom", () => {
    expect(contentTypeLabel("agenda12")).toBe("Agenda 12");
    expect(contentTypeLabel("agenda12Event")).toBe("Événement");
  });

  it("un événement est suivi du titre de son agenda 12", () => {
    expect(placeLabel("agenda12Event", "Salons")).toBe("Événement · Salons");
  });

  it("une fiche est suivie du titre de son CRM", () => {
    expect(placeLabel("crmPerson", "Clients")).toBe("Personne · Clients");
  });

  it("une entrée est suivie du titre de son cahier, une note de rien", () => {
    expect(placeLabel("entry", "Levures")).toBe("Entrée · Levures");
    expect(placeLabel("note", null)).toBe("Note");
  });
});
