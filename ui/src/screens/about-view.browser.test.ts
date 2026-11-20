import { describe, expect, it } from "vitest";
import packageInfo from "../../package.json";
import { MALOREAN_SITE, openAbout } from "./about-view";

function dialog() {
  const element = document.createElement("dialog");
  document.body.replaceChildren(element);
  return element;
}

describe("fenêtre « À propos »", () => {
  it("montre l'icône, le nom, la version, l'auteur et le site", () => {
    const element = dialog();
    openAbout(element, () => undefined);
    expect(element.open).toBe(true);
    expect(element.className).toBe("about");
    expect(element.getAttribute("aria-label")).toBe("À propos de MALOREAN Notes");
    const icon = element.querySelector<HTMLImageElement>(".about-icon");
    expect(icon?.getAttribute("alt")).toBe("");
    expect(icon?.getAttribute("src")).toMatch(/app-icon/);
    expect(element.querySelector(".about-name")?.textContent).toBe("MALOREAN Notes");
    expect(element.querySelector(".about-version")?.textContent).toBe(
      `Version ${packageInfo.version}`,
    );
    expect(element.querySelector(".about-author")?.textContent).toBe(
      "Réalisée par Laurent Deséchalliers",
    );
    const site = element.querySelector<HTMLAnchorElement>(".about-site");
    expect(site?.textContent).toBe("Malorean.net");
    expect(site?.getAttribute("href")).toBe("https://malorean.net");
  });

  it("le site s'ouvre dans le navigateur, pas dans l'application", () => {
    const element = dialog();
    const opened: string[] = [];
    openAbout(element, (address) => opened.push(address));
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    element.querySelector(".about-site")?.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(opened).toEqual([MALOREAN_SITE]);
    expect(MALOREAN_SITE).toBe("https://malorean.net");
  });

  it("« OK » ferme la fenêtre", () => {
    const element = dialog();
    openAbout(element, () => undefined);
    const ok = element.querySelector<HTMLButtonElement>(".about-buttons button");
    expect(ok?.textContent).toBe("OK");
    expect(document.activeElement).toBe(ok);
    ok?.click();
    expect(element.open).toBe(false);
  });

  it("un clic dans la fenêtre, hors du lien et de « OK », la laisse ouverte, même après un choix", () => {
    const element = dialog();
    element.onclick = () => element.close();
    openAbout(element, () => undefined);
    element.click();
    expect(element.open).toBe(true);
  });
});
