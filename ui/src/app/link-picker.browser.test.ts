import { describe, expect, it } from "vitest";
import type { LinkableItem } from "../bridge";
import { chooseLinkable } from "./link-picker";
import "../theme.css";
import "../style.css";

const item = (title: string, contentType: LinkableItem["contentType"]): LinkableItem => ({
  path: `${title}.md`,
  title,
  folder: "",
  contentType,
  link: title,
});
const ITEMS = [item("Courses", "note"), item("Plan", "canvas"), item("Recettes", "note")];

function setup() {
  const picker = document.createElement("dialog");
  document.body.replaceChildren(picker);
  return picker;
}

const entries = (picker: HTMLElement) =>
  [...picker.querySelectorAll(".picker-option")].map((option) => option.textContent);

describe("recherche de contenus à lier", () => {
  it("propose tous les contenus, sous le nom « Lier une note », et rend celui qu'on choisit", async () => {
    const picker = setup();
    const choosing = chooseLinkable({ listLinkable: async () => ITEMS }, picker);
    await expect.poll(() => picker.open).toBe(true);
    expect(picker.getAttribute("aria-label")).toBe("Lier une note");
    expect(entries(picker)).toHaveLength(3);
    (picker.querySelectorAll(".picker-option")[1] as HTMLElement).click();
    expect(await choosing).toEqual(ITEMS[1]);
  });

  it("ne garde que ce qu'on lui demande de garder, sous le nom donné ; annulée, elle rend rien", async () => {
    const picker = setup();
    const choosing = chooseLinkable({ listLinkable: async () => ITEMS }, picker, {
      label: "Choisir une note",
      keep: (found) => found.contentType === "note",
    });
    await expect.poll(() => picker.open).toBe(true);
    expect(picker.getAttribute("aria-label")).toBe("Choisir une note");
    expect(entries(picker).join("|")).toMatch(/^Courses.*\|Recettes/);
    expect(entries(picker)).toHaveLength(2);
    picker.close();
    expect(await choosing).toBeNull();
  });
});
