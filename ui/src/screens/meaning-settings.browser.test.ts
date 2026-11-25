import { describe, expect, it } from "vitest";
import type { ModelRow } from "../state/meaning";
import { meaningSettingsFrame, renderMeaningSettings } from "./meaning-settings";

const small: ModelRow = {
  ...{ model: "e5-small", label: "E5 petit", weight: "449 Mo", status: "téléchargé" },
  ...{ downloaded: true, used: true, downloading: false, progress: null },
};
const large: ModelRow = {
  ...{ model: "e5-large", label: "E5 grand", weight: "2 136 Mo", status: "non téléchargé" },
  ...{ downloaded: false, used: false, downloading: false, progress: null },
};

function render(
  rows: readonly ModelRow[],
  lines: readonly string[] = [],
  percent: number | null = null,
) {
  const fieldset = meaningSettingsFrame();
  document.body.replaceChildren(fieldset);
  const asked: string[] = [];
  renderMeaningSettings(
    fieldset,
    { rows, lines, percent },
    {
      choose: (model) => asked.push(`choisir ${model}`),
      download: (model) => asked.push(`télécharger ${model}`),
      cancelDownload: () => asked.push("annuler"),
      remove: (model, label) => asked.push(`supprimer ${model} (${label})`),
      rebuild: () => asked.push("reconstruire"),
    },
  );
  const byLabel = (name: string) =>
    fieldset.querySelector<HTMLButtonElement>(`[aria-label="${name}"]`);
  return { fieldset, asked, byLabel };
}

describe("réglages de la recherche par le sens", () => {
  it("est une partie nommée de l'écran de réglages", () => {
    const { fieldset } = render([small]);
    expect(fieldset.tagName).toBe("FIELDSET");
    expect(fieldset.className).toBe("meaning-settings");
    expect(fieldset.querySelector("legend")?.textContent).toBe("Recherche par le sens");
  });

  it("dit que l'état se lit tant qu'il n'y a pas de modèle à montrer", () => {
    const { fieldset } = render([]);
    expect(fieldset.querySelector("p.setting-help")?.textContent).toBe(
      "Lecture de l'état du sens…",
    );
    expect(fieldset.querySelector("button")).toBeNull();
  });

  it("décrit chaque modèle : nom, poids, état, et « utilisé » pour le choisi", () => {
    const { fieldset } = render([small, large]);
    const lines = [...fieldset.querySelectorAll(".meaning-model")];
    expect(lines.map((line) => line.querySelector("label")?.textContent)).toEqual([
      "E5 petit",
      "E5 grand",
    ]);
    expect(lines.map((line) => line.querySelector(".meaning-weight")?.textContent)).toEqual([
      "449 Mo",
      "2 136 Mo",
    ]);
    expect(lines.map((line) => line.querySelector(".meaning-status")?.textContent)).toEqual([
      "téléchargé",
      "non téléchargé",
    ]);
    expect(lines.map((line) => line.querySelector(".meaning-used")?.textContent ?? null)).toEqual([
      "utilisé",
      null,
    ]);
  });

  it("choisit le modèle au clic sur son bouton radio, relié à son nom", () => {
    const { fieldset, asked } = render([small, large]);
    const radios = [...fieldset.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(radios.map((r) => r.name)).toEqual(["meaning-model", "meaning-model"]);
    expect(
      fieldset.querySelector<HTMLLabelElement>("label[for=meaning-model-e5-large]"),
    ).not.toBeNull();
    radios[1]?.click();
    expect(asked).toEqual(["choisir e5-large"]);
  });

  it("propose de supprimer un modèle téléchargé, et de télécharger les autres", () => {
    const { byLabel, asked } = render([small, large]);
    expect(byLabel("Télécharger « E5 petit »")).toBeNull();
    expect(byLabel("Supprimer « E5 grand »")).toBeNull();
    byLabel("Supprimer « E5 petit »")?.click();
    byLabel("Télécharger « E5 grand »")?.click();
    expect(asked).toEqual(["supprimer e5-small (E5 petit)", "télécharger e5-large"]);
    expect(byLabel("Supprimer « E5 petit »")?.textContent).toBe("Supprimer");
    expect(byLabel("Télécharger « E5 grand »")?.textContent).toBe("Télécharger");
  });

  it("montre la progression d'un téléchargement, qu'on peut annuler", () => {
    const { fieldset, asked, byLabel } = render([
      small,
      {
        ...large,
        downloading: true,
        progress: { text: "1 068 Mo sur 2 136 Mo (50 %)", percent: 50 },
      },
    ]);
    expect(fieldset.querySelector("progress")?.value).toBe(50);
    expect(fieldset.querySelector(".download-text")?.textContent).toBe(
      "1 068 Mo sur 2 136 Mo (50 %)",
    );
    expect(byLabel("Télécharger « E5 grand »")).toBeNull();
    fieldset.querySelector<HTMLButtonElement>(".download-progress button")?.click();
    expect(asked).toEqual(["annuler"]);
  });

  it("propose d'annuler un téléchargement dont on ne connaît pas l'avancement", () => {
    const { fieldset, byLabel, asked } = render([small, { ...large, downloading: true }]);
    expect(fieldset.querySelector("progress")).toBeNull();
    byLabel("Annuler le téléchargement « E5 grand »")?.click();
    expect(asked).toEqual(["annuler"]);
  });

  it("a des boutons ordinaires, du style des autres outils, qui n'envoient aucun formulaire", () => {
    const { fieldset } = render([small, large], ["Notes : 12"]);
    const buttons = [...fieldset.querySelectorAll("button")];
    expect(buttons).toHaveLength(3);
    expect(buttons.map((b) => b.type)).toEqual(["button", "button", "button"]);
    expect(buttons.map((b) => b.className)).toEqual(["tool", "tool", "tool"]);
  });

  it("dit l'état de l'index de sens et reconstruit l'index à la demande", () => {
    const { fieldset, asked } = render([small], ["Notes : 12", "Segments : 411"]);
    const paragraphs = [...fieldset.querySelectorAll(".meaning-index p")];
    expect(paragraphs.map((p) => p.textContent)).toEqual(["Notes : 12", "Segments : 411"]);
    expect(paragraphs.map((p) => p.className)).toEqual(["setting-help", "setting-help"]);
    const rebuild = [...fieldset.querySelectorAll("button")].find(
      (b) => b.textContent === "Reconstruire l'index de sens",
    );
    rebuild?.click();
    expect(asked).toEqual(["reconstruire"]);
  });

  it("montre une barre de progression de l'index de sens, avant ses chiffres, quand l'avancement est lu", () => {
    const { fieldset } = render([small], ["Segments calculés : 120 sur 411"], 29);
    const index = fieldset.querySelector(".meaning-index");
    expect(index?.children[0]?.className).toBe("index-bar");
    const bar = index?.querySelector("[role=progressbar]");
    expect([bar?.getAttribute("aria-label"), bar?.getAttribute("aria-valuenow")]).toEqual([
      "Index de sens",
      "29",
    ]);
    expect(index?.querySelector(".index-bar-percent")?.textContent).toBe("29 %");
    expect(index?.children[1]?.textContent).toBe("Segments calculés : 120 sur 411");
  });

  it("n'en montre pas tant que l'avancement n'est pas lu, et la montre vide à 0 %", () => {
    expect(render([small], [], null).fieldset.querySelector(".index-bar")).toBeNull();
    expect(render([small], [], 0).fieldset.querySelector(".index-bar-percent")?.textContent).toBe(
      "0 %",
    );
  });

  it("remplace ce qu'elle montrait", () => {
    const { fieldset } = render([small, large]);
    renderMeaningSettings(
      fieldset,
      { rows: [small], lines: [], percent: null },
      {
        choose() {},
        download() {},
        cancelDownload() {},
        remove() {},
        rebuild() {},
      },
    );
    expect(fieldset.querySelectorAll(".meaning-model")).toHaveLength(1);
    expect(fieldset.querySelectorAll("legend")).toHaveLength(1);
  });
});
