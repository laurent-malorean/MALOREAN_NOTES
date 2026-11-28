import { describe, expect, it } from "vitest";
import type { Agenda12LineItem } from "../bridge";
import { LINE_SEPARATOR, lineParts } from "./agenda-12-line";
import "../theme.css";
import "./agenda-12.css";

const line = (overrides: Partial<Agenda12LineItem>): Agenda12LineItem => ({
  ...{ date: null, year: null, yearTone: null, flag: null, city: null, title: "Audit ISO" },
  ...{ text: "", ...overrides },
});

/** La ligne dessinée, comme elle se lit. */
function rendered(item: Agenda12LineItem) {
  const span = document.createElement("span");
  span.append(...lineParts(item));
  return span;
}

describe("agenda 12 : une ligne d'événement", () => {
  it("montre la date, l'année en pastille, le drapeau, la ville et le titre, séparés", () => {
    const span = rendered(
      line({
        ...{ date: "10–13/02", year: 2027, yearTone: "next", flag: "🇩🇪", city: "Nuremberg" },
        title: "Salon Embedded World",
      }),
    );
    expect(span.textContent).toBe("10–13/02 2027 – 🇩🇪 (Nuremberg) – Salon Embedded World");
    expect(LINE_SEPARATOR).toBe(" – ");
    expect(span.querySelector(".agenda-year")?.textContent).toBe("2027");
    expect(span.querySelector<HTMLElement>(".agenda-year")?.dataset.tone).toBe("next");
    expect(span.querySelector(".agenda-flag")?.textContent).toBe("🇩🇪");
  });

  it("chaque séparateur est son propre élément : le texte le garde, l'écran peut l'effacer", () => {
    const span = rendered(line({ date: "15/01", flag: "🇫🇷", title: "Audit" }));
    const separators = [...span.querySelectorAll(".agenda-sep")].map((e) => e.textContent);
    expect(separators).toEqual([LINE_SEPARATOR, LINE_SEPARATOR]);
  });

  it("sans jour : la pastille de l'année seule, puis le titre", () => {
    const span = rendered(line({ year: 2029, yearTone: "later", title: "Renouveler malorean.fr" }));
    expect(span.textContent).toBe("2029 – Renouveler malorean.fr");
    expect(span.querySelector<HTMLElement>(".agenda-year")?.dataset.tone).toBe("later");
  });

  it("sans année : le jour et le mois seuls, sans pastille", () => {
    const span = rendered(line({ date: "15/01" }));
    expect(span.textContent).toBe("15/01 – Audit ISO");
    expect(span.querySelector(".agenda-year")).toBeNull();
  });

  it("la ville seule, sans pays, est entre parenthèses aussi", () => {
    expect(rendered(line({ city: "Lyon" })).textContent).toBe("(Lyon) – Audit ISO");
  });

  it("le drapeau seul, sans ville, n'a pas de parenthèses", () => {
    expect(rendered(line({ flag: "🇫🇷" })).textContent).toBe("🇫🇷 – Audit ISO");
  });

  it("sans rien d'autre, la ligne est le titre seul", () => {
    expect(rendered(line({})).textContent).toBe("Audit ISO");
  });

  it("une année sans couleur donnée est neutre : passée", () => {
    const span = rendered(line({ year: 2020 }));
    expect(span.querySelector<HTMLElement>(".agenda-year")?.dataset.tone).toBe("past");
  });

  it("la pastille est verte, orange, marron ou neutre selon l'année, par les couleurs du thème", () => {
    const colors = (tone: "current" | "next" | "later" | "past") => {
      const span = rendered(line({ year: 2026, yearTone: tone }));
      document.body.replaceChildren(span);
      return getComputedStyle(span.querySelector(".agenda-year") as Element).backgroundColor;
    };
    expect(new Set([colors("current"), colors("next"), colors("later"), colors("past")]).size).toBe(
      4,
    );
  });
});
