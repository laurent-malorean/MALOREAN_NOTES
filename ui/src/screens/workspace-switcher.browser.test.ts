import { afterEach, describe, expect, it } from "vitest";
import { closeContextMenu } from "./context-menu";
import { connectWorkspaceSwitcher } from "./workspace-switcher";

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
