import { describe, expect, it } from "vitest";
import type { ContentTypeItem, LinkableItem } from "../bridge";
import { MAX_QUICK_OPEN_RESULTS } from "./quick-open";
import { linkIcon, matchingLinkable, writtenLink } from "./link-choice";

const item = (title: string, extra: Partial<LinkableItem> = {}): LinkableItem => ({
  path: `${title}.md`,
  title,
  folder: "",
  contentType: "note",
  link: title,
  ...extra,
});

describe("liste des contenus liables", () => {
  const items = [
    item("Réunion lundi", { folder: "Travail" }),
    item("Plan", { contentType: "canvas", link: "Plan.canvas", path: "Plan.canvas" }),
    item("Courses"),
  ];
  const titles = (query: string) => matchingLinkable(items, query).map((i) => i.title);

  it("propose tout, dans l'ordre reçu, sans rien taper", () => {
    expect(titles("")).toEqual(["Réunion lundi", "Plan", "Courses"]);
  });

  it("filtre à chaque lettre, majuscules et accents ignorés", () => {
    expect(titles("reu")).toEqual(["Réunion lundi"]);
    expect(titles("COURS")).toEqual(["Courses"]);
    expect(titles("zzz")).toEqual([]);
  });

  it("retrouve un canvas par son nom de fichier et un contenu par son dossier", () => {
    expect(titles("plan.can")).toEqual(["Plan"]);
    expect(titles("travail")).toEqual(["Réunion lundi"]);
  });

  it("met d'abord les titres qui commencent par ce qui est tapé", () => {
    const more = [item("Le plan B"), item("Plan A")];
    expect(matchingLinkable(more, "plan").map((i) => i.title)).toEqual(["Plan A", "Le plan B"]);
  });

  it("propose au plus la limite de l'ouverture rapide", () => {
    const many = Array.from({ length: MAX_QUICK_OPEN_RESULTS + 5 }, (_, n) => item(`N${n}`));
    expect(matchingLinkable(many, "")).toHaveLength(MAX_QUICK_OPEN_RESULTS);
  });
});

describe("lien écrit", () => {
  const plan = item("Plan", { link: "Plan.canvas" });

  it("écrit le lien de la liste entre crochets", () => {
    expect(writtenLink(item("Courses"))).toBe("[[Courses]]");
    expect(writtenLink(plan)).toBe("[[Plan.canvas]]");
    expect(writtenLink(item("Courses", { link: "Vieux/Courses" }))).toBe("[[Vieux/Courses]]");
  });

  it("garde le texte sélectionné comme texte montré, sauf s'il est vide ou identique", () => {
    expect(writtenLink(item("Courses"), "ma liste")).toBe("[[Courses|ma liste]]");
    expect(writtenLink(item("Courses"), "  ma liste  ")).toBe("[[Courses|ma liste]]");
    expect(writtenLink(item("Courses"), "")).toBe("[[Courses]]");
    expect(writtenLink(item("Courses"), "   ")).toBe("[[Courses]]");
    expect(writtenLink(item("Courses"), "Courses")).toBe("[[Courses]]");
  });
});

describe("icône d'un contenu liable", () => {
  it("donne le dessin du type de contenu", () => {
    const icons: Record<ContentTypeItem, string> = {
      note: "note",
      researchNotebook: "notebook",
      mindMap: "mind-map",
      canvas: "canvas",
      entry: "note",
      node: "note",
      crm: "crm",
      crmCompany: "crm",
      crmPerson: "crm",
      crmAction: "crm",
      crmProject: "crm",
    };
    for (const [type, icon] of Object.entries(icons)) {
      expect(linkIcon(item("x", { contentType: type as ContentTypeItem }))).toBe(icon);
    }
  });
});
