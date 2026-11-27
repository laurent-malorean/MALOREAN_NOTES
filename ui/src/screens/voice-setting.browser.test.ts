import { describe, expect, it } from "vitest";
import type { VoiceLanguageItem } from "../bridge";
import { type VoiceSettingState, voiceGroup } from "./voice-setting";
import "../theme.css";
import "../style.css";

const FRENCH: VoiceLanguageItem = { id: "fr-FR", name: "français (France)", ready: true };
const ENGLISH: VoiceLanguageItem = { id: "en-US", name: "anglais (États-Unis)", ready: false };

type Ready = Extract<VoiceSettingState, { kind: "ready" }>;

const ready = (changes: Partial<Ready> = {}): Ready => ({
  kind: "ready",
  languages: [ENGLISH, FRENCH],
  chosen: null,
  used: "fr-FR",
  usedName: "français (France)",
  preparing: null,
  failure: null,
  ...changes,
});

function mount() {
  const log: string[] = [];
  const group = voiceGroup({
    choose: (language) => log.push(`choisir ${language}`),
    prepare: (language) => log.push(`préparer ${language}`),
  });
  document.body.replaceChildren(group.element);
  const select = () => group.element.querySelector("select") as HTMLSelectElement;
  const buttons = () => [...group.element.querySelectorAll("button")].map((b) => b.textContent);
  const status = () => group.element.querySelector(".voice-status")?.textContent;
  const failure = () => group.element.querySelector<HTMLElement>(".setting-error") as HTMLElement;
  return { group, log, select, buttons, status, failure };
}

describe("réglages : l'onglet « Saisie vocale »", () => {
  it("s'intitule « Saisie vocale », dit que le son reste sur le Mac, et attend la réponse du moteur", () => {
    const m = mount();
    expect(m.group.element.querySelector("legend")?.textContent).toBe("Saisie vocale");
    expect(m.group.element.textContent).toContain(
      "Le son reste sur le Mac : il est traité par macOS, jamais envoyé ni enregistré.",
    );
    expect(m.status()).toBe("Lecture de l'état de la saisie vocale…");
    expect(m.group.element.querySelector<HTMLElement>(".setting")?.hidden).toBe(true);
  });

  it("propose la langue du Mac par défaut (nommée), puis chaque langue avec l'état de son modèle", () => {
    const m = mount();
    m.group.show(ready());
    expect([...m.select().options].map((o) => o.text)).toEqual([
      "La langue du Mac (français (France))",
      "anglais (États-Unis) (à télécharger)",
      "français (France) (prête)",
    ]);
    expect(m.select().value).toBe("");
    expect(m.select().labels?.[0]?.textContent).toBe("Langue");
    expect(m.select().getAttribute("aria-describedby")).toBe("setting-voiceLanguage-help");
    expect(m.status()).toBe("français (France) : prête");
    expect(m.buttons()).toEqual([]);
  });

  it("montre la langue choisie, et la nomme « La langue du Mac » sans la nommer elle-même", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US", usedName: "anglais (États-Unis)" }));
    expect(m.select().value).toBe("en-US");
    expect(m.select().options[0]?.text).toBe("La langue du Mac");
    expect(m.status()).toBe("anglais (États-Unis) : à télécharger");
  });

  it("choisir une langue, ou revenir à celle du Mac, appelle le choix", () => {
    const m = mount();
    m.group.show(ready());
    m.select().value = "en-US";
    m.select().dispatchEvent(new Event("change", { bubbles: true }));
    m.select().value = "";
    m.select().dispatchEvent(new Event("change", { bubbles: true }));
    expect(m.log).toEqual(["choisir en-US", "choisir null"]);
  });

  it("un modèle manquant a son bouton « Télécharger le modèle de langue », qui prépare la langue utilisée", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US" }));
    expect(m.buttons()).toEqual(["Télécharger le modèle de langue"]);
    (m.group.element.querySelector("button") as HTMLButtonElement).click();
    expect(m.log).toEqual(["préparer en-US"]);
  });

  it("pendant la préparation : l'état le dit, le choix est bloqué, aucun bouton", () => {
    const m = mount();
    m.group.show(ready({ chosen: "en-US", used: "en-US", preparing: "en-US" }));
    expect(m.status()).toBe("Préparation de la langue…");
    expect(m.select().disabled).toBe(true);
    expect(m.buttons()).toEqual([]);
  });

  it("après un échec : le message du moteur et « Réessayer »", () => {
    const m = mount();
    const message =
      "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.";
    m.group.show(ready({ chosen: "en-US", used: "en-US", failure: message }));
    expect(m.failure().hidden).toBe(false);
    expect(m.failure().textContent).toBe(message);
    expect(m.failure().getAttribute("role")).toBe("alert");
    expect(m.buttons()).toEqual(["Réessayer"]);
    (m.group.element.querySelector("button") as HTMLButtonElement).click();
    expect(m.log).toEqual(["préparer en-US"]);
    m.group.show(ready());
    expect(m.failure().hidden).toBe(true);
    expect(m.select().disabled).toBe(false);
  });

  it("dit pourquoi le moteur ne répond pas, sans liste de langues", () => {
    const m = mount();
    m.group.show({ kind: "unavailable", message: "Saisie vocale : macOS 26 minimum" });
    expect(m.status()).toBe("Saisie vocale : macOS 26 minimum");
    expect(m.group.element.querySelector<HTMLElement>(".setting")?.hidden).toBe(true);
    expect(m.buttons()).toEqual([]);
  });

  it("dit quand le Mac ne propose aucune langue", () => {
    const m = mount();
    m.group.show(ready({ languages: [], used: null, usedName: null }));
    expect(m.status()).toBe("Le Mac ne propose aucune langue de transcription.");
    expect(m.buttons()).toEqual([]);
  });
});
