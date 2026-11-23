import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, type Settings } from "../state/settings";
import { resolvedAppearance, showDisplay } from "./display";
import "../theme.css";
import "../style.css";

const root = document.documentElement;
const variable = (name: string) => getComputedStyle(root).getPropertyValue(name).trim();

function show(changes: Partial<Settings>, systemDark = false) {
  showDisplay(root, { ...DEFAULT_SETTINGS, ...changes }, systemDark);
}

afterEach(() => {
  for (const name of ["data-font", "data-text-size", "data-text-width", "data-appearance"])
    root.removeAttribute(name);
});

describe("apparence claire ou sombre", () => {
  it("suit le Mac en automatique, sinon le choix de l'utilisateur", () => {
    expect(resolvedAppearance("auto", false)).toBe("light");
    expect(resolvedAppearance("auto", true)).toBe("dark");
    expect(resolvedAppearance("light", true)).toBe("light");
    expect(resolvedAppearance("dark", false)).toBe("dark");
  });

  it("prend les couleurs sombres du thème, et les contrôles du Mac suivent", () => {
    show({});
    const light = variable("--bg");
    expect(getComputedStyle(root).colorScheme).toBe("light");
    show({ appearance: "dark" });
    expect(root.dataset.appearance).toBe("dark");
    expect(variable("--bg")).not.toBe(light);
    expect(getComputedStyle(root).colorScheme).toBe("dark");
    show({}, true);
    expect(root.dataset.appearance).toBe("dark");
    show({ appearance: "light" }, true);
    expect(variable("--bg")).toBe(light);
  });
});

describe("réglages d'affichage du texte", () => {
  it("prennent la police choisie parmi celles du thème", () => {
    show({});
    expect(variable("--text-font")).toBe(variable("--serif"));
    show({ font: "sans" });
    expect(variable("--text-font")).toBe(variable("--sans"));
    show({ font: "mono" });
    expect(variable("--text-font")).toBe(variable("--mono"));
  });

  it("prennent la taille choisie parmi celles du thème", () => {
    const sizes = ["small", "medium", "large", "larger"] as const;
    const seen = sizes.map((textSize) => (show({ textSize }), variable("--text-size")));
    expect(seen).toEqual(sizes.map((size) => variable(`--text-size-${size}`)));
    expect(new Set(seen).size).toBe(4);
  });

  it("prennent la largeur choisie parmi celles du thème", () => {
    const widths = ["narrow", "medium", "wide", "wider"] as const;
    const seen = widths.map((textWidth) => (show({ textWidth }), variable("--text-width")));
    expect(seen).toEqual(widths.map((width) => variable(`--text-width-${width}`)));
    expect(new Set(seen).size).toBe(4);
  });

  it("s'appliquent au texte de la note", () => {
    const editor = document.createElement("main");
    editor.className = "editor";
    editor.innerHTML = `<div class="cm-editor"><div class="cm-scroller"><div class="cm-content">x</div></div></div>`;
    document.body.replaceChildren(editor);
    show({ font: "mono", textSize: "larger", textWidth: "narrow" });
    const scroller = getComputedStyle(editor.querySelector(".cm-scroller") as HTMLElement);
    const content = getComputedStyle(editor.querySelector(".cm-content") as HTMLElement);
    expect(scroller.fontSize).toBe(variable("--text-size-larger"));
    expect(scroller.fontFamily).toContain("Menlo");
    const remInPixels = parseFloat(getComputedStyle(root).fontSize);
    expect(content.maxWidth).toBe(`${parseFloat(variable("--text-width-narrow")) * remInPixels}px`);
    document.body.replaceChildren();
  });
});
