import { beforeEach, describe, expect, it } from "vitest";
import { LIMIT_EXPLAINED, NO_LOAD } from "../state/claude-load";
import { createInputBarView, type InputBarView } from "./claude-input-bar-view";

let chips: HTMLElement;
let view: InputBarView;

const find = (selector: string) => chips.querySelector(selector) as HTMLElement;
const MINUTE = 60_000;
const NOW = 1_795_138_261_000;

beforeEach(() => {
  chips = document.createElement("div");
  document.body.replaceChildren(chips);
  view = createInputBarView(chips, {
    chooseSettings: () => undefined,
    showAgentMap: () => undefined,
    attach: () => undefined,
    detach: () => undefined,
  });
  view.showSettings({ model: null, effort: "medium" });
});

describe("barre de saisie : la charge annoncée par Claude Code", () => {
  it("après une réponse, la version du modèle, la limite et le contexte se montrent", () => {
    view.showLoad(
      {
        model: "claude-opus-5-5",
        limits: {
          reached: false,
          windows: [{ period: "session", percent: 16, resetsAt: (NOW + 59 * MINUTE) / 1000 }],
        },
        context: { used: 420, size: 1000 },
      },
      NOW,
    );
    expect(find(".claude-settings-chip").textContent).toBe("Opus 5.5 · Medium");
    const limit = find(".claude-limit");
    expect(limit.hidden).toBe(false);
    expect(limit.textContent).toBe("Session 16 % · 59 min");
    expect(limit.title.split("\n")[0]).toBe(LIMIT_EXPLAINED);
    expect(limit.dataset["level"]).toBe("normal");
    const context = find(".claude-context");
    expect(context.hidden).toBe(false);
    expect(context.textContent).toBe("Contexte 42 %");
    expect(context.title).toMatch(/^Contexte de la conversation rempli à 42 %/);
    expect(context.dataset["level"]).toBe("normal");
    expect([limit, context].map((chip) => chip.className)).toEqual([
      "claude-chip claude-limit",
      "claude-chip claude-context",
    ]);
    // Rangées après la durée de la réponse, avant les notes jointes.
    expect(limit.previousElementSibling?.className).toBe("claude-chip claude-elapsed");
    expect(context.nextElementSibling?.className).toBe("claude-attachments");
  });

  it("près de la limite, les pastilles prennent la couleur d'alerte", () => {
    view.showLoad(
      {
        model: null,
        limits: { reached: true, windows: [] },
        context: { used: 900, size: 1000 },
      },
      NOW,
    );
    expect(find(".claude-limit").dataset["level"]).toBe("reached");
    expect(find(".claude-limit").textContent).toBe("Limite atteinte");
    expect(find(".claude-context").dataset["level"]).toBe("close");
  });

  it("une conversation neuve cache le contexte et remet le nom de la famille choisie", () => {
    view.showLoad({ model: "claude-opus-5-5", limits: null, context: { used: 1, size: 2 } }, NOW);
    view.showSettings({ model: "haiku", effort: null });
    expect(find(".claude-settings-chip").textContent).toBe("Haiku");
    view.showSettings({ model: "opus", effort: null });
    expect(find(".claude-settings-chip").textContent).toBe("Opus 5.5");
    view.showLoad(NO_LOAD, NOW);
    const context = find(".claude-context");
    expect(context.hidden).toBe(true);
    expect(context.textContent).toBe("");
    expect(context.title).toBe("");
    expect(context.dataset["level"]).toBe("normal");
    expect(find(".claude-limit").hidden).toBe(true);
    expect(find(".claude-settings-chip").textContent).toBe("Opus");
  });
});
