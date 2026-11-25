import { describe, expect, it, vi } from "vitest";
import type { LinkableItem } from "../bridge";
import type { LinkSite } from "../editor/links/link-site";
import { linkChooser } from "./link-chooser";
import "../theme.css";
import "../style.css";

const PLAN: LinkableItem = {
  path: "Plan.canvas",
  title: "Plan",
  folder: "",
  contentType: "canvas",
  link: "Plan.canvas",
};

function setup(listLinkable = vi.fn(async () => [PLAN])) {
  const picker = document.createElement("dialog");
  document.body.replaceChildren(picker);
  const site: LinkSite = { text: "plan", insertContent: vi.fn(), insertWeb: vi.fn() };
  const error = vi.fn();
  const choose = linkChooser({ backend: { listLinkable }, picker, error });
  choose(site);
  return { picker, site, error, listLinkable };
}

const entries = (picker: HTMLElement) =>
  [...picker.querySelectorAll(".picker-option")].map((option) => option.textContent);
const click = (picker: HTMLElement, index: number) =>
  (picker.querySelectorAll(".picker-option")[index] as HTMLElement).click();

describe("bouton « Lien »", () => {
  it("propose « Une note ou un contenu » et « Une page web »", () => {
    const { picker } = setup();
    expect(picker.open).toBe(true);
    expect(picker.getAttribute("aria-label")).toBe("Insérer un lien");
    expect(entries(picker)).toEqual(["Une note ou un contenu", "Une page web"]);
  });

  it("filtre les deux choix à chaque lettre", () => {
    const { picker } = setup();
    const input = picker.querySelector("input") as HTMLInputElement;
    input.value = "web";
    input.dispatchEvent(new Event("input"));
    expect(entries(picker)).toEqual(["Une page web"]);
    input.value = "zzz";
    input.dispatchEvent(new Event("input"));
    expect(picker.querySelector(".picker-empty")?.textContent).toBe(
      "Aucun type de lien ne correspond",
    );
  });

  it("« Une page web » pose un lien vers une page web, sans chercher de contenu", () => {
    const { picker, site, listLinkable } = setup();
    click(picker, 1);
    expect(site.insertWeb).toHaveBeenCalledTimes(1);
    expect(site.insertContent).not.toHaveBeenCalled();
    expect(listLinkable).not.toHaveBeenCalled();
  });

  it("« Une note ou un contenu » ouvre la recherche de contenus, et le choix devient le lien", async () => {
    const { picker, site } = setup();
    click(picker, 0);
    await vi.waitFor(() => expect(picker.getAttribute("aria-label")).toBe("Lier une note"));
    expect(picker.open).toBe(true);
    expect(entries(picker)).toEqual(["Plan"]);
    click(picker, 0);
    await vi.waitFor(() => expect(site.insertContent).toHaveBeenCalledWith(PLAN));
    expect(site.insertWeb).not.toHaveBeenCalled();
  });

  it("annuler la recherche n'écrit rien", async () => {
    const { picker, site } = setup();
    click(picker, 0);
    await vi.waitFor(() => expect(picker.getAttribute("aria-label")).toBe("Lier une note"));
    picker.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(site.insertContent).not.toHaveBeenCalled();
    expect(site.insertWeb).not.toHaveBeenCalled();
  });

  it("dit l'erreur quand la liste ne peut pas être lue", async () => {
    const failure = new Error("liste perdue");
    const { picker, error, site } = setup(vi.fn(() => Promise.reject(failure)));
    click(picker, 0);
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith(failure));
    expect(site.insertContent).not.toHaveBeenCalled();
  });
});
