// Essai de l'application réelle (fiches 0054 et 0063) : les onglets Personnes, Entreprises et Projets et
// la fiche d'une personne, dans la vraie fenêtre. Une personne, une entreprise et un projet sont créés par
// les boutons de l'écran, vérifiés dans les fichiers du disque ; l'arbre se déplie ; les rectangles et la
// cible d'un clic sont mesurés.
import type { CrmItem } from "../../bridge";
import { NO_FILTERS } from "../../state/crm";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { type Env, centreOf, find, findAll, notesFolder, readDisk, rectOf } from "./env";

const WAIT = 20_000;
const PALETTE_SIZE = 10;

const tab = (id: string) => find<HTMLElement>(`.crm-tab[data-tab="${id}"]`);
const button = (text: string) =>
  findAll<HTMLButtonElement>("button").find((b) => b.textContent === text) ?? null;

/** Un élément mesuré à l'écran : son rectangle a une surface, et le pointeur l'atteint en son centre. */
function reachable(trial: Trial, name: string, element: Element | null): void {
  const rect = element === null ? null : rectOf(element);
  const centre = rect === null ? null : centreOf(rect);
  const hit = centre === null ? null : document.elementFromPoint(centre.x, centre.y);
  const ok = element !== null && rect !== null && rect.width > 0 && rect.height > 0;
  trial.check(
    `${name} : a une surface et reçoit le clic`,
    ok && hit !== null && element.contains(hit),
    rect === null
      ? "absent"
      : `${String(Math.round(rect.width))}x${String(Math.round(rect.height))}`,
  );
}

/** Tape un nom dans le champ ouvert et valide, comme l'utilisateur. */
async function typeAndSubmit(selector: string, name: string): Promise<void> {
  const input = await until("le champ du nom", () => find<HTMLInputElement>(selector), WAIT);
  input.value = name;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.form?.requestSubmit();
}

async function disk(env: Env, relative: string): Promise<string | null> {
  const bytes = await readDisk(`${notesFolder(env)}/${relative}`);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/** Crée un CRM avec une personne, un projet et une action qui les relie, par le vrai pont, et l'ouvre. */
async function openedCrm(env: Env): Promise<{ path: string; folder: string }> {
  const { path } = await env.bridge.createCrm("", "Essai onglets");
  const person = await env.bridge.createCrmPerson(path, "Marie Durand", null);
  const project = await env.bridge.createCrmProject(path, "Refonte");
  await env.bridge.createCrmAction(path, {
    ...{ title: "Appeler Marie", status: null, date: "2026-11-24", people: [person] },
    ...{ channel: null, project, color: null, tags: [], linkedNotes: [], description: "" },
  });
  env.open(path);
  await until(
    "la carte du nouveau CRM à l'écran",
    () => findAll(".crm-card-title").find((t) => t.textContent === "Appeler Marie") ?? null,
    WAIT,
  );
  return { path, folder: path.replace(/\.md$/, "") };
}

async function peopleTab(env: Env, trial: Trial, folder: string): Promise<void> {
  tab("people")?.click();
  await until("la liste des personnes", () => find(".crm-people .crm-table"), WAIT);
  reachable(trial, "le tableau des personnes", find(".crm-table"));
  trial.check("une personne dans le tableau", findAll(".crm-row").length === 1);
  const add = button("Nouvelle personne");
  reachable(trial, "« Nouvelle personne »", add);
  add?.click();
  await typeAndSubmit(".crm-new-name", "Léa Roy");
  await until("deux personnes", () => (findAll(".crm-row").length === 2 ? true : null), WAIT);
  const written = await disk(env, `${folder}/personnes/lea-roy.md`);
  trial.check(
    "la personne créée est écrite sur le disque",
    written !== null && written.includes("type: crm-personne") && written.includes("# Léa Roy"),
    written ?? "absent",
  );
  const unfold = find<HTMLElement>(".crm-row .crm-unfold");
  reachable(trial, "« ▸ » d'une personne", unfold);
  unfold?.click();
  const line = await until("l'action de la personne", () => find(".crm-sub .crm-line"), WAIT);
  reachable(trial, "la ligne d'action d'une personne", line);
}

async function companiesTab(env: Env, trial: Trial, folder: string): Promise<void> {
  tab("companies")?.click();
  await until("l'arbre des entreprises", () => find(".crm-tree"), WAIT);
  trial.check(
    "NODATA est la première ligne",
    find(".crm-tree .crm-name")?.textContent === "NODATA",
  );
  button("Nouvelle entreprise")?.click();
  await typeAndSubmit(".crm-new-name", "Globex");
  await until(
    "l'entreprise créée",
    () => (findAll(".crm-node-company").length === 2 ? true : null),
    WAIT,
  );
  const written = await disk(env, `${folder}/entreprises/globex.md`);
  trial.check(
    "l'entreprise créée est écrite sur le disque",
    written !== null && written.includes("type: crm-entreprise"),
    written ?? "absent",
  );
  const unfold = find<HTMLElement>(".crm-node-company .crm-unfold");
  reachable(trial, "« ▸ » de NODATA", unfold);
  unfold?.click();
  const person = await until("une personne de NODATA", () => find(".crm-node-person"), WAIT);
  reachable(trial, "une personne dans l'arbre", person.querySelector(".crm-unfold"));
  find<HTMLElement>(".crm-node-person .crm-unfold")?.click();
  const line = await until(
    "une action dans l'arbre",
    () => find(".crm-node-person .crm-line"),
    WAIT,
  );
  reachable(trial, "la ligne d'action de l'arbre", line);
}

/** Le choix de couleur d'un projet : les 10 couleurs, mesurées ; un clic change la couleur dans le fichier. */
async function colorChoice(env: Env, trial: Trial, folder: string): Promise<void> {
  find<HTMLElement>(".crm-swatch")?.click();
  const colors = findAll<HTMLElement>(".crm-palette-color");
  trial.check(
    "le choix de couleur montre les 10 couleurs",
    colors.length === PALETTE_SIZE,
    String(colors.length),
  );
  trial.measure(
    "largeursDesCouleurs",
    colors.map((c) => Math.round(rectOf(c).width)),
  );
  reachable(trial, "une couleur du choix", colors[1] ?? null);
  colors[1]?.click();
  await until(
    "la couleur changée",
    async () => {
      const text = await disk(env, `${folder}/projets/refonte.md`);
      return text?.includes("couleur: orange") === true ? true : null;
    },
    WAIT,
  ).catch(() => null);
  const refonte = await disk(env, `${folder}/projets/refonte.md`);
  trial.check(
    "changer la couleur est écrit sur le disque",
    refonte?.includes("couleur: orange") === true,
    refonte ?? "absent",
  );
}

async function projectsTab(env: Env, trial: Trial, folder: string): Promise<void> {
  tab("projects")?.click();
  await until("la liste des projets", () => find(".crm-projects"), WAIT);
  button("Nouveau projet")?.click();
  await typeAndSubmit(".crm-new-name", "Salon");
  await until("deux projets", () => (findAll(".crm-project").length === 2 ? true : null), WAIT);
  const written = await disk(env, `${folder}/projets/salon.md`);
  trial.check(
    "le projet créé est écrit sur le disque avec une couleur de la palette",
    written !== null && written.includes("type: crm-projet") && /couleur:\s*\w+/.test(written),
    written ?? "absent",
  );
  await colorChoice(env, trial, folder);
}

/** Un clic sur le nom d'une personne ouvre sa fiche à la place de l'éditeur ; un champ s'y modifie. */
async function ficheScenario(env: Env, trial: Trial, path: string, folder: string): Promise<void> {
  tab("people")?.click();
  await until("la liste des personnes", () => find(".crm-people .crm-table"), WAIT);
  const crm: CrmItem = await env.bridge.readCrm(path, NO_FILTERS, null);
  const marie = crm.people.find((p) => p.title === "Marie Durand");
  const name = findAll<HTMLElement>(".crm-row .crm-name").find(
    (n) => n.textContent === "Marie Durand",
  );
  reachable(trial, "le nom d'une personne", name ?? null);
  name?.click();
  const title = await until("la fiche de la personne", () => find(".crm-fiche-title"), WAIT);
  trial.check("la fiche dit le nom", title.textContent === "Marie Durand", title.textContent ?? "");
  const editor = find<HTMLElement>(".cm-editor");
  trial.check(
    "la fiche remplace l'éditeur de texte",
    editor === null || getComputedStyle(editor).display === "none",
  );
  reachable(trial, "le titre de la fiche", title);
  const role = find<HTMLElement>('.crm-fiche-field[data-field="fonction"] button');
  reachable(trial, "le champ Fonction", role);
  role?.click();
  const input = await until(
    "le champ ouvert",
    () => find<HTMLInputElement>(".crm-fiche-input"),
    WAIT,
  );
  input.value = "Directrice";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  const file = `${folder}/personnes/${marie?.name ?? "marie-durand"}.md`;
  const text = await until(
    "la fonction écrite",
    async () => {
      const written = await disk(env, file);
      return written?.includes("fonction: Directrice") === true ? written : null;
    },
    WAIT,
  ).catch(() => null);
  trial.check("la fonction modifiée est écrite sur le disque", text !== null, text ?? "absente");
}

async function tabsScenario(env: Env, trial: Trial): Promise<void> {
  const { path, folder } = await openedCrm(env);
  await peopleTab(env, trial, folder);
  await companiesTab(env, trial, folder);
  await projectsTab(env, trial, folder);
  await ficheScenario(env, trial, path, folder);
}

export const crmTabsScenarios = (env: Env): Scenario[] => [
  {
    name: "CRM : onglets Personnes, Entreprises, Projets et fiche d'une personne",
    run: (t) => tabsScenario(env, t),
  },
];
