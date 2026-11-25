import { describe, expect, it } from "vitest";
import type { LinkableItem } from "../bridge";
import { linkEntry } from "./link-entry";

const item = (extra: Partial<LinkableItem>): LinkableItem => ({
  path: "Travail/plan.canvas",
  title: "Plan",
  folder: "Travail",
  contentType: "canvas",
  link: "Plan.canvas",
  ...extra,
});

describe("ligne d'un contenu liable", () => {
  it("montre le titre, le dossier et une icône décorative", () => {
    const entry = linkEntry(item({}));
    expect(entry.label).toBe("Plan");
    expect(entry.detail).toBe("Travail");
    expect(entry.icon?.tagName).toBe("svg");
    expect(entry.icon?.getAttribute("aria-hidden")).toBe("true");
  });

  it("dessine l'icône du type de contenu", () => {
    const paths = (type: LinkableItem["contentType"]) =>
      linkEntry(item({ contentType: type })).icon?.innerHTML;
    expect(paths("canvas")).not.toBe(paths("note"));
    expect(paths("mindMap")).not.toBe(paths("note"));
    expect(paths("crmPerson")).toBe(paths("crm"));
  });
});
