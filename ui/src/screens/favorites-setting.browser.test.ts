import { describe, expect, it } from "vitest";
import { favoritesGroup, PROPOSED_TITLE } from "./favorites-setting";
import "../theme.css";
import "../style.css";

function mount(folders: readonly string[] = ["Notes", "Notes/Travail"]) {
  const log: string[] = [];
  const group = favoritesGroup({
    folders,
    choose: () => log.push("choisir"),
    create: (title, folder) => log.push(`créer « ${title} » dans « ${folder} »`),
    stop: () => log.push("arrêter"),
  });
  document.body.replaceChildren(group.element);
  const button = (name: string) =>
    [...group.element.querySelectorAll("button")].find(
      (b) => b.textContent === name,
    ) as HTMLButtonElement;
  const input = () =>
    group.element.querySelector<HTMLInputElement>("#setting-favoritesName") as HTMLInputElement;
  const form = () => group.element.querySelector<HTMLElement>(".favorites-new") as HTMLElement;
  return { group, log, button, input, form };
}

describe("réglages : l'onglet « Favoris »", () => {
  it("s'intitule « Favoris » et dit « Aucune » sans note des favoris, « Arrêter » étant alors inutilisable", () => {
    const m = mount();
    m.group.show(null);
    expect(m.group.element.querySelector("legend")?.textContent).toBe("Favoris");
    expect(m.group.element.querySelector("output")?.textContent).toBe("Aucune");
    expect(m.button("Ne plus utiliser de note des favoris").disabled).toBe(true);
  });

  it("montre le titre de la note des favoris, son chemin en bulle, et laisse « Ne plus utiliser » possible", () => {
    const m = mount();
    m.group.show({ path: "Perso/Favoris.md", title: "Mes favoris" });
    const value = m.group.element.querySelector("output") as HTMLOutputElement;
    expect(value.textContent).toBe("Mes favoris");
    expect(value.title).toBe("Perso/Favoris.md");
    expect(m.button("Ne plus utiliser de note des favoris").disabled).toBe(false);
    m.group.show(null);
    expect(value.title).toBe("");
  });

  it("chaque action a son bouton visible, et « Choisir » et « Ne plus utiliser » la lancent", () => {
    const m = mount();
    m.group.show({ path: "F.md", title: "F" });
    m.button("Choisir une note").click();
    m.button("Ne plus utiliser de note des favoris").click();
    expect(m.log).toEqual(["choisir", "arrêter"]);
    expect(
      [...m.group.element.querySelectorAll(".favorites-actions button")].map((b) => b.textContent),
    ).toEqual([
      "Choisir une note",
      "Créer la note des favoris",
      "Ne plus utiliser de note des favoris",
    ]);
  });

  it("« Créer » demande un nom (proposé « Favoris ») et un dossier (proposé : la racine)", () => {
    const m = mount();
    expect(m.form().hidden).toBe(true);
    m.button("Créer la note des favoris").click();
    expect(m.form().hidden).toBe(false);
    expect(m.input().value).toBe("Favoris");
    expect(PROPOSED_TITLE).toBe("Favoris");
    const folder = m.group.element.querySelector<HTMLSelectElement>(
      "#setting-favoritesFolder",
    ) as HTMLSelectElement;
    expect([...folder.options].map((o) => o.text)).toEqual(["Racine", "Notes", "⎿ Travail"]);
    expect(folder.value).toBe("");
    expect(document.activeElement).toBe(m.input());
  });

  it("crée à la racine avec le nom proposé, puis referme le formulaire", () => {
    const m = mount();
    m.button("Créer la note des favoris").click();
    m.button("Créer").click();
    expect(m.log).toEqual(["créer « Favoris » dans «  »"]);
    expect(m.form().hidden).toBe(true);
  });

  it("crée avec le nom tapé et le dossier choisi", () => {
    const m = mount();
    m.button("Créer la note des favoris").click();
    m.input().value = "Mes favoris";
    const folder = m.group.element.querySelector<HTMLSelectElement>(
      "#setting-favoritesFolder",
    ) as HTMLSelectElement;
    folder.value = "Notes/Travail";
    folder.dispatchEvent(new Event("change"));
    m.button("Créer").click();
    expect(m.log).toEqual(["créer « Mes favoris » dans « Notes/Travail »"]);
  });

  it("au clavier : Entrée crée, Échap annule, sans fermer la fenêtre des réglages", () => {
    const m = mount();
    const press = (key: string) => {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      m.input().dispatchEvent(event);
      return event;
    };
    m.button("Créer la note des favoris").click();
    expect(press("Escape").defaultPrevented).toBe(true);
    expect(m.form().hidden).toBe(true);
    expect(m.log).toEqual([]);
    m.button("Créer la note des favoris").click();
    const enter = press("Enter");
    expect(enter.defaultPrevented).toBe(true);
    expect(m.log).toEqual(["créer « Favoris » dans «  »"]);
    m.button("Créer la note des favoris").click();
    expect(press("a").defaultPrevented).toBe(false);
  });

  it("« Annuler » referme le formulaire sans rien créer", () => {
    const m = mount();
    m.button("Créer la note des favoris").click();
    m.button("Annuler").click();
    expect(m.form().hidden).toBe(true);
    expect(m.log).toEqual([]);
  });
});
