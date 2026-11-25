// La fenêtre d'une action dans une page de test (fiche 0062) : de quoi l'ouvrir, lire ses contrôles
// et leur faire faire un geste, comme au clavier et à la souris.
import { expect, vi } from "vitest";
import type { CrmActionChangeItem, CrmActionItem, CrmItem } from "../src/bridge";
import { action, company, crm, person, project, TODAY } from "./crm-fixture";
import { callsTo, card, type MountedCrm, mountCrm, type MountOptions } from "./crm-view-fixture";

/** Un CRM où l'action « devis » a deux personnes (dont une avec un e-mail), un projet, une couleur, des étiquettes. */
export function windowCrm(): CrmItem {
  return crm({
    companies: [company("acme", "Acme"), company("globex", "Globex")],
    people: [
      { ...person("jean-dupont", "Jean Dupont", "acme"), email: "jean@acme.fr" },
      person("marie-durand", "Marie Durand"),
      { ...person("paul-martin", "Paul Martin", "globex"), email: "paul@globex.fr" },
    ],
    projects: [project("refonte", "Refonte du site", "bleu"), project("salon", "Salon", "rose")],
    tags: ["salon", "urgent", "vip"],
    actions: [
      action("devis", {
        ...{ title: "Demande de devis", date: "2026-11-22", urgency: { kind: "late", days: 3 } },
        ...{ project: "refonte", color: "violet", tags: ["urgent", "salon"], channel: "appel" },
        people: [
          { person: "jean-dupont", company: "acme" },
          { person: "marie-durand", company: null },
        ],
        description: "Pour 3 postes",
        linkedNotes: ["Cahier des charges"],
        checklists: [
          {
            name: "Préparation",
            done: 1,
            items: [
              { done: true, text: "Relire" },
              { done: false, text: "Chiffrer" },
            ],
          },
          { name: "Envoi", done: 0, items: [] },
        ],
        comments: [
          { at: "2026-11-23 09:00", text: "Premier appel" },
          { at: "2026-11-24 10:32", text: "Voir https://acme.fr/devis.\nRetenter jeudi" },
        ],
      }),
      action("appel", { title: "Appeler Marie", status: "Progress", date: TODAY }),
    ],
  });
}

/** `windowCrm()` où l'action « devis » est changée comme si Claude, Obsidian ou iCloud l'avaient modifiée. */
export function changedCrm(over: Partial<CrmActionItem>): CrmItem {
  const data = windowCrm();
  data.actions = data.actions.map((a) => (a.name === "devis" ? { ...a, ...over } : a));
  return data;
}

/** Un CRM monté, avec `windowCrm()`, et la fenêtre de l'action `name` ouverte d'un clic sur sa carte. */
export async function openedWindow(
  name = "devis",
  options: MountOptions = {},
): Promise<MountedCrm> {
  const mounted = await mountCrm({ crm: windowCrm(), ...options });
  card(name).click();
  expect(document.querySelector(".crm-aw")).not.toBeNull();
  return mounted;
}

export const root = () => document.querySelector<HTMLElement>(".crm-aw") as HTMLElement;
export const panel = () => document.querySelector<HTMLElement>(".crm-aw-panel") as HTMLElement;
export const found = (selector: string) =>
  document.querySelector<HTMLElement>(`.crm-aw ${selector}`);
export const control = <T extends HTMLElement>(label: string): T =>
  document.querySelector<T>(`.crm-aw [aria-label="${label}"]`) as T;
export const field = <T extends HTMLElement>(name: string): T =>
  document.querySelector<T>(`.crm-aw [data-field="${name}"]`) as T;
export const labels = () =>
  [
    ...document.querySelectorAll(
      ".crm-aw .crm-aw-section > .crm-aw-label, .crm-aw .crm-aw-field > .crm-aw-label",
    ),
  ].map((e) => e.textContent);
export const optionTexts = (select: HTMLSelectElement) =>
  [...select.options].map((o) => o.textContent);
export const buttonIn = (text: string) =>
  [...document.querySelectorAll<HTMLButtonElement>(".crm-aw button")].find(
    (b) => b.textContent === text || b.getAttribute("aria-label") === text,
  ) as HTMLButtonElement;

/** Choisit `value` dans une liste, comme à la souris. */
export function choose(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Pose `value` dans un champ de texte et le quitte (l'événement « change »). */
export function commit(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

/** Les gestes envoyés à Rust sur une action, dans l'ordre. */
export const sent = (mounted: MountedCrm): CrmActionChangeItem[] =>
  callsTo(mounted, "changeCrmAction").map((call) => call[3] as CrmActionChangeItem);

/** Attend qu'un geste de plus soit parti. */
export const waitForGesture = (mounted: MountedCrm, count: number) =>
  vi.waitFor(() => expect(sent(mounted)).toHaveLength(count));

/** Laisse passer les mises à jour qui attendaient un tour de boucle. */
export const tick = () => new Promise((resolve) => setTimeout(resolve, 20));
