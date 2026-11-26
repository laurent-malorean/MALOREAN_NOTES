// Essai de l'application réelle (fiche 0054) : l'écran des Réglages dans la vraie fenêtre. Ses onglets s'ouvrent
// par un clic ; les rectangles réels disent ce qui se voit (barres de l'onglet « Index »).
import type { ConnectionInfo } from "../../bridge";
import { renderConnectionSettings } from "../../screens/connection-settings";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { type Env, find, findAll, type Rect, rectOf } from "./env";

const WAIT = 20_000;
const PIXEL = 1.5;
const MIN_HEIGHT = 28;
const COPY_BUTTONS = 3;
const CORNER = 40;

const dialog = () => find<HTMLDialogElement>("dialog.settings[open]");

/** Ouvre les Réglages par leur bouton, comme l'utilisateur. */
async function openSettings(): Promise<HTMLDialogElement> {
  find<HTMLElement>("[data-settings]")?.click();
  return until("la fenêtre des Réglages", dialog, WAIT);
}

/** Montre l'onglet de ce nom d'un clic sur lui. */
async function showTab(window: HTMLElement, name: string): Promise<HTMLElement> {
  const tab = findAll<HTMLElement>("[role=tab]", window).find((t) => t.textContent === name);
  if (!tab) throw new Error(`onglet « ${name} » introuvable`);
  tab.click();
  const panel = document.getElementById(tab.getAttribute("aria-controls") ?? "");
  return until(
    `le panneau de l'onglet « ${name} »`,
    () => (panel?.hidden === false ? panel : null),
    WAIT,
  );
}

function closeSettings(window: HTMLElement): void {
  findAll<HTMLButtonElement>("button", window)
    .find((b) => b.textContent === "Fermer")
    ?.click();
}

/** La barre de l'index de ce nom : son cadre `.index-bar`, celui de la piste qui porte ce nom accessible. */
function barNamed(panel: HTMLElement, name: string): HTMLElement | null {
  const track = findAll<HTMLElement>("[role=progressbar]", panel).find(
    (t) => t.getAttribute("aria-label") === name,
  );
  return track?.closest<HTMLElement>(".index-bar") ?? null;
}

/** La barre d'un index : visible, et remplie à son pourcentage (rectangles réels) ; `expected` : ce qu'elle écrit. */
function checkBar(
  trial: Trial,
  panel: HTMLElement,
  name: string,
  expected: (written: string, percent: number) => boolean,
): void {
  const bar = barNamed(panel, name);
  const track = bar && find<HTMLElement>("[role=progressbar]", bar);
  const fill = bar && find<HTMLElement>(".index-bar-fill", bar);
  trial.check(`la barre « ${name} » est à l'écran`, track !== null && track !== undefined);
  if (!bar || !track || !fill) return;
  const written = find(".index-bar-percent", bar)?.textContent ?? "";
  const trackBox = rectOf(track);
  const fillBox = rectOf(fill);
  const percent = Number(track.getAttribute("aria-valuenow"));
  trial.measure(`barre ${name}`, { piste: trackBox, remplie: fillBox, écrit: written });
  trial.check(
    `la piste de la barre « ${name} » a une surface`,
    trackBox.width > 0 && trackBox.height > 0,
    `${Math.round(trackBox.width)}x${Math.round(trackBox.height)}`,
  );
  trial.check(
    `la largeur remplie de « ${name} » correspond au pourcentage`,
    Math.abs(fillBox.width - (trackBox.width * percent) / 100) <= PIXEL,
    `${Math.round(fillBox.width)} sur ${Math.round(trackBox.width)} pour ${percent} %`,
  );
  trial.check(
    `le pourcentage de « ${name} » est écrit à côté`,
    expected(written, percent),
    written,
  );
  const probe = document.createElement("span");
  probe.style.color = "var(--palette-orange)";
  document.body.append(probe);
  const orange = getComputedStyle(probe).color;
  probe.remove();
  const colour = getComputedStyle(fill).backgroundColor;
  trial.check(
    `le remplissage de « ${name} » est orange, celui de la palette`,
    colour === orange,
    colour,
  );
}

const SENSE_BAR = "Index de sens";
const NOTES_BAR = "Index des notes";
const NOTES_WRITTEN = /^([\d\u202f\u00a0 ]+) sur ([\d\u202f\u00a0 ]+), (\d+) %$/;

/** « 631 sur 645, 97 % » : le pourcentage écrit est celui de la piste, et les notes faites ne dépassent pas le total. */
function notesWritten(written: string, percent: number): boolean {
  const found = NOTES_WRITTEN.exec(written);
  if (found === null) return false;
  const [done, total] = [found[1], found[2]].map((n) => Number((n ?? "").replace(/\D/g, "")));
  return Number(found[3]) === percent && (done ?? 0) <= (total ?? 0) && (total ?? 0) > 0;
}

async function indexTab(trial: Trial): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Index");
  await until("la barre de l'index de sens", () => barNamed(panel, SENSE_BAR), WAIT);
  await until("la barre de l'index des notes", () => barNamed(panel, NOTES_BAR), WAIT);
  checkBar(trial, panel, SENSE_BAR, (written, percent) => written === `${percent} %`);
  checkBar(trial, panel, NOTES_BAR, notesWritten);
  // Une reconstruction réelle : la barre des notes se redessine et finit pleine, sur le vrai index.
  findAll<HTMLButtonElement>("button", panel)
    .find((b) => b.textContent === "Reconstruire l'index")
    ?.click();
  await until(
    "la fin de la reconstruction de l'index des notes",
    () =>
      findAll("p", panel).some((p) => {
        const text = p.textContent ?? "";
        return text.startsWith("Dernière reconstruction") && !text.includes("aucune");
      })
        ? true
        : null,
    WAIT,
  );
  checkBar(trial, panel, NOTES_BAR, notesWritten);
  const rebuilt = barNamed(panel, NOTES_BAR)?.querySelector("[role=progressbar]");
  trial.check(
    "après la reconstruction, la barre de l'index des notes est pleine",
    rebuilt?.getAttribute("aria-valuenow") === "100",
    String(rebuilt?.getAttribute("aria-valuenow")),
  );
  closeSettings(window);
}

/** Une clé de branchement factice : l'essai ne crée pas de vraie clé, qui ouvrirait une prise dans le dossier personnel. */
const FAKE_KEY: ConnectionInfo = {
  key: {
    secret: "cle-d-essai",
    createdOn: "25 novembre 2026",
    claudeConfig: '{\n  "mcpServers": {}\n}',
    codexConfig: "[mcp_servers.malorean]",
  },
};

/** Dessine dans l'onglet réel la clé factice et ses blocs, et rend les trois boutons « Copier ». */
async function drawnKeyButtons(panel: HTMLElement): Promise<HTMLButtonElement[]> {
  const frame = await until(
    "la partie « Brancher une IA »",
    // Une fois l'état lu par l'application, pour qu'elle ne redessine pas la partie par-dessus la clé factice.
    () =>
      find("button", panel) === null ? null : find<HTMLElement>(".connection-settings", panel),
    WAIT,
  );
  renderConnectionSettings(frame, FAKE_KEY, [], {
    create: () => undefined,
    revoke: () => undefined,
    allow: () => undefined,
    copy: () => Promise.resolve(true),
  });
  const found = findAll<HTMLButtonElement>(".connection-copyable button", frame);
  if (found.length !== COPY_BUTTONS) throw new Error(`${found.length} boutons « Copier »`);
  return found;
}

/** Les mesures du bouton « Copier » : sa taille, sa place par rapport au texte du bloc. */
function checkCopyButtonBox(trial: Trial, panel: HTMLElement, first: HTMLButtonElement): void {
  const normal = findAll<HTMLButtonElement>("button", panel).find(
    (b) => b.textContent === "Révoquer la clé",
  );
  const box = rectOf(first);
  const text = find(".connection-text", first.parentElement ?? panel);
  trial.measure("boutonCopier", { bouton: box, texte: text === null ? null : rectOf(text) });
  trial.check(
    "le bouton « Copier » est plus haut que 28 points",
    box.height > MIN_HEIGHT,
    `${Math.round(box.height)} points`,
  );
  trial.check(
    "le bouton « Copier » a la hauteur des autres boutons des Réglages",
    normal !== undefined && Math.abs(rectOf(normal).height - box.height) <= PIXEL,
    `${Math.round(box.height)} contre ${normal === undefined ? "?" : Math.round(rectOf(normal).height)}`,
  );
  trial.check(
    "le bouton ne recouvre pas le texte du bloc",
    text !== null && box.y >= rectOf(text).y + rectOf(text).height,
    `bouton à ${Math.round(box.y)}`,
  );
}

/** Les boutons « Copier » : à la taille des boutons des Réglages, sous le texte ; un clic les passe au vert, « ✓ Copié ». */
async function connectionTab(trial: Trial): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Brancher une IA");
  const copies = await drawnKeyButtons(panel);
  const first = copies[0] as HTMLButtonElement;
  checkCopyButtonBox(trial, panel, first);
  const before = getComputedStyle(first).color;
  first.click();
  await until("« ✓ Copié »", () => (first.textContent === "✓ Copié" ? true : null), WAIT);
  const probe = document.createElement("span");
  probe.style.color = "var(--success)";
  document.body.append(probe);
  const green = getComputedStyle(probe).color;
  probe.remove();
  trial.check(
    "le bouton passe au vert de la palette après la copie",
    getComputedStyle(first).color === green && before !== green,
    getComputedStyle(first).color,
  );
  await until("« Copier » de nouveau", () => (first.textContent === "Copier" ? true : null), WAIT);
  closeSettings(window);
}

const NEW_FOLDER = "Nouveau dossier…";

/** Ce que le stockage de la vraie fenêtre garde pour ce réglage (une clé par espace de travail). */
function stored(prefix: string): string | null {
  const key = Object.keys(localStorage).find((k) => k.startsWith(prefix));
  return key === undefined ? null : localStorage.getItem(key);
}

/** Choisit une entrée de la liste, comme un choix dans son menu : la valeur change, puis « change » part. */
function choose(select: HTMLSelectElement, label: string): void {
  const option = [...select.options].find((o) => o.text === label);
  if (!option) throw new Error(`entrée « ${label} » introuvable`);
  select.value = option.value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

const lineOf = (panel: HTMLElement, label: string) =>
  findAll<HTMLLabelElement>("label", panel).find((l) => l.textContent === label)?.control;

interface Lists {
  readonly window: HTMLElement;
  readonly panel: HTMLElement;
  readonly templates: HTMLSelectElement;
  readonly journal: HTMLSelectElement;
}

const texts = (select: HTMLSelectElement) => [...select.options].map((o) => o.text);

/** Les deux listes : ce qu'elles proposent (arborescence, retraits) et leurs rectangles réels. */
function checkLists(trial: Trial, { window, templates, journal }: Lists): void {
  trial.measure("entréesModèles", texts(templates));
  trial.measure("entréesJournal", texts(journal));
  const nested = texts(templates).indexOf("⎿ Sous");
  trial.check(
    "les modèles : « Aucun » en tête, puis l'arborescence avec ses retraits",
    texts(templates)[0] === "Aucun" && nested > 0 && texts(templates)[nested - 1] === "Essai",
    texts(templates).join(" | "),
  );
  const forJournal = texts(journal);
  trial.check(
    "le journal : l'arborescence, « Journal » même absent, « Nouveau dossier… » à la fin",
    forJournal.includes("Journal") &&
      forJournal.includes("⎿ Sous") &&
      forJournal.at(-1) === NEW_FOLDER,
    forJournal.join(" | "),
  );
  const [a, b] = [rectOf(templates), rectOf(journal)];
  trial.measure("listes", { modèles: a, journal: b });
  const frame = rectOf(window);
  const inside = (r: typeof a) => r.x >= frame.x && r.x + r.width <= frame.x + frame.width;
  trial.check(
    "les deux listes sont visibles, de même largeur et dans la fenêtre",
    a.width > 0 && a.height > 0 && Math.abs(a.width - b.width) <= PIXEL && inside(a) && inside(b),
    `${Math.round(a.width)}x${Math.round(a.height)} / ${Math.round(b.width)}x${Math.round(b.height)}`,
  );
}

/** « Nouveau dossier… » : le champ sous la liste, un nom refusé, puis un nom et un chemin imbriqué acceptés et gardés. */
async function checkNewFolder(trial: Trial, { panel, journal }: Lists): Promise<void> {
  choose(journal, NEW_FOLDER);
  const input = await until(
    "le champ du nom",
    () => find<HTMLInputElement>(".folder-new-input", panel),
    WAIT,
  );
  const under = rectOf(journal).y + rectOf(journal).height - PIXEL;
  trial.check(
    "le champ du nom est visible sous la liste",
    rectOf(input).width > 0 && rectOf(input).y >= under,
  );
  input.value = "a//b";
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  trial.check("un nom invalide est refusé", find(".setting-error:not([hidden])", panel) !== null);
  input.value = "Carnet";
  findAll<HTMLButtonElement>("button", panel)
    .find((b) => b.textContent === "Créer")
    ?.click();
  trial.check(
    "« Nouveau dossier… » enregistre le nouveau dossier comme dossier du journal",
    (stored("malorean.journal:") ?? "").includes('"folder":"Carnet"') && journal.value === "Carnet",
    String(stored("malorean.journal:")),
  );
  choose(journal, NEW_FOLDER);
  input.value = "A/B";
  input.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
  );
  trial.check(
    "« Nouveau dossier… » accepte un chemin imbriqué (A/B) et le garde tel quel",
    (stored("malorean.journal:") ?? "").includes('"folder":"A/B"') && journal.value === "A/B",
    String(stored("malorean.journal:")),
  );
}

/** Le choix de dossier : l'arborescence, le choix gardé, « Nouveau dossier… ». */
async function folderChoices(trial: Trial, env: Env): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Écriture");
  // La ligne des modèles paraît quand le moteur a dit le choix en cours (fiche 0077).
  const templates = await until(
    "la liste du dossier des modèles",
    () => lineOf(panel, "Dossier des modèles") as HTMLSelectElement | undefined,
    WAIT,
  );
  const journal = lineOf(panel, "Dossier du journal") as HTMLSelectElement | undefined;
  if (!templates || !journal) throw new Error("liste des dossiers introuvable");
  const lists = { window, panel, templates, journal };
  checkLists(trial, lists);
  choose(templates, "⎿ Sous");
  const kept = await until(
    "le dossier des modèles gardé par le moteur",
    async () => (await env.bridge.templatesFolder()) ?? undefined,
    WAIT,
  );
  trial.check(
    "choisir un dossier l'enregistre dans les préférences, côté moteur",
    kept === "Essai/Sous",
    String(kept),
  );
  trial.check(
    "l'interface n'en garde plus de copie dans le stockage de la fenêtre",
    stored("malorean.templates:") === null,
  );
  choose(templates, "Aucun");
  await until(
    "le dossier des modèles effacé par le moteur",
    async () => ((await env.bridge.templatesFolder()) === null ? true : undefined),
    WAIT,
  );
  trial.check("choisir « Aucun » l'efface", (await env.bridge.templatesFolder()) === null);
  await checkNewFolder(trial, lists);
  closeSettings(window);
}

const TABS = ["Affichage", "Écriture", "Claude", "Index", "Brancher une IA"];

/** Les rectangles réels de la fenêtre, de son titre, de la rangée d'onglets et de « Fermer ». */
function windowBoxes(window: HTMLElement) {
  const close = findAll<HTMLButtonElement>("button", window).find(
    (b) => b.textContent === "Fermer",
  );
  const part = (element: Element | null | undefined) => (element ? rectOf(element) : null);
  return {
    fenêtre: rectOf(window),
    titre: part(find("h2", window)),
    onglets: part(find("[role=tablist]", window)),
    fermer: part(close),
  };
}

const sameBox = (a: Rect | null, b: Rect | null) =>
  a !== null &&
  b !== null &&
  (["x", "y", "width", "height"] as const).every((side) => Math.abs(a[side] - b[side]) <= PIXEL);

type Boxes = ReturnType<typeof windowBoxes>;

/** « Fermer » : entièrement dans la fenêtre de l'application, et en bas à droite de la fenêtre des Réglages. */
function checkClose(trial: Trial, { fermer, fenêtre }: Boxes): void {
  const inside =
    fermer !== null &&
    fermer.x >= 0 &&
    fermer.y >= 0 &&
    fermer.x + fermer.width <= globalThis.innerWidth &&
    fermer.y + fermer.height <= globalThis.innerHeight;
  trial.check("« Fermer » est entièrement dans la fenêtre de l'application", inside);
  const corner =
    fermer !== null &&
    Math.abs(fermer.x + fermer.width - (fenêtre.x + fenêtre.width)) < CORNER &&
    Math.abs(fermer.y + fermer.height - (fenêtre.y + fenêtre.height)) < CORNER;
  trial.check("« Fermer » est en bas à droite de la fenêtre", corner, JSON.stringify(fermer));
}

/** La fenêtre des Réglages garde la même taille et la même place sur les cinq onglets, « Fermer » dans l'écran. */
async function fixedSize(trial: Trial): Promise<void> {
  const window = await openSettings();
  const first = await showTab(window, TABS[0] as string).then(() => windowBoxes(window));
  for (const name of TABS) {
    await showTab(window, name);
    const boxes = windowBoxes(window);
    trial.measure(`fenêtre des Réglages, onglet ${name}`, boxes);
    for (const part of ["fenêtre", "titre", "onglets", "fermer"] as const) {
      trial.check(
        `onglet « ${name} » : ${part} à la même place et à la même taille que sur le premier`,
        sameBox(boxes[part], first[part]),
        JSON.stringify(boxes[part]),
      );
    }
  }
  checkClose(trial, first);
  closeSettings(window);
}

/** Les cases des espaces de travail de l'onglet : les cases lues dans la vraie fenêtre, leur état gardé par le vrai Rust. */
async function allowedWorkspacesTab(trial: Trial, env: Env): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Brancher une IA");
  const boxes = () => findAll<HTMLInputElement>(".allowed-workspace input", panel);
  await until(
    "les cases des espaces de travail",
    () => (boxes().length > 0 ? boxes() : null),
    WAIT,
  );
  const names = findAll<HTMLElement>(".allowed-workspace", panel).map((label) => label.textContent);
  const kept = async () => (await env.bridge.listAiWorkspaces()).map((w) => w.allowed);
  trial.measure("espaces de travail et cases", { names, cochées: await kept() });
  trial.check(
    "une case par espace de travail de l'utilisateur, toutes décochées au départ",
    boxes().length === names.length && boxes().every((box) => !box.checked),
    JSON.stringify(names),
  );
  trial.check(
    "les cases de la fenêtre sont celles que Rust garde",
    (await kept()).length === boxes().length && (await kept()).every((allowed) => !allowed),
  );
  const first = boxes()[0] as HTMLInputElement;
  first.click();
  await until(
    "la case cochée gardée par Rust",
    async () => ((await kept())[0] ? true : null),
    WAIT,
  );
  trial.check("la case reste cochée une fois Rust répondu", boxes()[0]?.checked === true);
  boxes()[0]?.click();
  await until(
    "la case décochée gardée par Rust",
    async () => ((await kept())[0] ? null : true),
    WAIT,
  );
  trial.check("la case décochée est gardée décochée", boxes()[0]?.checked === false);
  closeSettings(window);
}

export const settingsScenarios = (env: Env): Scenario[] => [
  { name: "Réglages : onglet Index, barre de progression", run: (t) => indexTab(t) },
  { name: "Réglages : onglet Brancher une IA, boutons Copier", run: (t) => connectionTab(t) },
  {
    name: "Réglages : onglet Brancher une IA, cases des espaces de travail",
    run: (t) => allowedWorkspacesTab(t, env),
  },
  { name: "Réglages : même fenêtre sur les cinq onglets", run: (t) => fixedSize(t) },
  { name: "Réglages : choix de dossier (modèles, journal)", run: (t) => folderChoices(t, env) },
];
