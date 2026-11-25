import { afterEach, describe, expect, it } from "vitest";
import { closeContextMenu } from "./context-menu";
import { connectWorkspaceSwitcher } from "./workspace-switcher";

// Sans la feuille de style de l'application, un menu occuperait toute la largeur de la page.
const style = document.createElement("style");
style.textContent =
  ".context-menu { position: fixed; width: 12rem; display: flex; flex-direction: column; }";
document.head.append(style);

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const menu = () => document.querySelector<HTMLElement>(".context-menu");

function switcher() {
  const button = document.createElement("button");
  button.textContent = "Notes";
  button.style.cssText = "position: fixed; left: 30px; top: 10px; height: 20px";
  document.body.replaceChildren(button);
  return button;
}

afterEach(() => {
  closeContextMenu();
  document.body.replaceChildren();
});

describe("sélecteur d'espace de travail", () => {
  it("un clic ouvre le menu juste sous le nom, avec les choix du moment", async () => {
    const button = switcher();
    let calls = 0;
    connectWorkspaceSwitcher(
      button,
      async () => (calls++, [{ label: `Travail ${calls}`, run: () => {} }]),
      () => {},
    );
    button.click();
    await settle();
    expect(menu()?.textContent).toBe("Travail 1");
    expect(menu()?.style.left).toBe("30px");
    expect(menu()?.style.top).toBe("30px");
    button.click();
    await settle();
    expect(menu()?.textContent).toBe("Travail 2");
  });

  it("la barre du pied ouvre le menu au-dessus d'elle, aussi large qu'elle, le focus dans le menu", async () => {
    const button = switcher();
    button.style.cssText = "position: fixed; left: 30px; top: 400px; width: 240px; height: 30px";
    connectWorkspaceSwitcher(
      button,
      async () => [
        { label: "Notes", checked: true, stateName: "ouvert", run: () => {} },
        { label: "Travail", run: () => {} },
      ],
      () => {},
      "above",
    );
    button.click();
    await settle();
    const box = (menu() as HTMLElement).getBoundingClientRect();
    expect(box.bottom).toBe(396);
    expect(box.left).toBe(30);
    expect(box.width).toBeGreaterThanOrEqual(240);
    expect(document.activeElement?.textContent).toContain("Notes");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(menu()).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it("le menu du nom en tête prend le focus aussi, et ne s'élargit pas", async () => {
    const button = switcher();
    connectWorkspaceSwitcher(
      button,
      async () => [{ label: "Notes", run: () => {} }],
      () => {},
    );
    button.click();
    await settle();
    expect(document.activeElement?.textContent).toBe("Notes");
    expect(menu()?.style.minWidth).toBe("");
  });

  it("un échec à lire la liste est signalé, sans menu", async () => {
    const button = switcher();
    const errors: unknown[] = [];
    connectWorkspaceSwitcher(
      button,
      () => Promise.reject(new Error("préférences illisibles")),
      (error) => errors.push(error),
    );
    button.click();
    await settle();
    expect(menu()).toBeNull();
    expect(String(errors[0])).toContain("préférences illisibles");
  });
});
