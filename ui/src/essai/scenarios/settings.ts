// Essai de l'application réelle (fiche 0054) : l'écran des Réglages dans la vraie fenêtre. Ses onglets s'ouvrent
// par un clic ; les rectangles réels disent ce qui se voit (barres de l'onglet « Index »).
import type { ConnectionInfo } from "../../bridge";
import { renderConnectionSettings } from "../../screens/connection-settings";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import { find, findAll, rectOf } from "./env";

const WAIT = 20_000;
const PIXEL = 1.5;
const MIN_HEIGHT = 28;
const COPY_BUTTONS = 3;

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

/** La barre d'un index : visible, et remplie à son pourcentage (rectangles réels). */
function checkBar(trial: Trial, panel: HTMLElement): void {
  const bar = find<HTMLElement>(".index-bar", panel);
  const track = find<HTMLElement>("[role=progressbar]", panel);
  const fill = find<HTMLElement>(".index-bar-fill", panel);
  const written = find(".index-bar-percent", panel)?.textContent ?? "";
  trial.check("la barre de l'index de sens est à l'écran", bar !== null && track !== null);
  if (bar === null || track === null || fill === null) return;
  const trackBox = rectOf(track);
  const fillBox = rectOf(fill);
  const percent = Number(track.getAttribute("aria-valuenow"));
  trial.measure("barreDeSens", { piste: trackBox, remplie: fillBox, écrit: written });
  trial.check(
    "la piste de la barre a une surface",
    trackBox.width > 0 && trackBox.height > 0,
    `${Math.round(trackBox.width)}x${Math.round(trackBox.height)}`,
  );
  trial.check(
    "la largeur remplie correspond au pourcentage",
    Math.abs(fillBox.width - (trackBox.width * percent) / 100) <= PIXEL,
    `${Math.round(fillBox.width)} sur ${Math.round(trackBox.width)} pour ${percent} %`,
  );
  trial.check("le pourcentage est écrit à côté", written === `${percent} %`, written);
  const probe = document.createElement("span");
  probe.style.color = "var(--palette-orange)";
  document.body.append(probe);
  const orange = getComputedStyle(probe).color;
  probe.remove();
  const colour = getComputedStyle(fill).backgroundColor;
  trial.check("le remplissage est orange, celui de la palette", colour === orange, colour);
}

async function indexTab(trial: Trial): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Index");
  await until("la barre de l'index de sens", () => find(".index-bar", panel), WAIT);
  checkBar(trial, panel);
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
  renderConnectionSettings(frame, FAKE_KEY, {
    create: () => undefined,
    revoke: () => undefined,
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

/** « Nouveau dossier… » : le champ sous la liste, un nom refusé, puis un nom accepté et gardé. */
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
  input.value = "a/b";
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
}

/** Le choix de dossier : l'arborescence, le choix gardé, « Nouveau dossier… ». */
async function folderChoices(trial: Trial): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Écriture");
  const templates = lineOf(panel, "Dossier des modèles") as HTMLSelectElement | undefined;
  const journal = lineOf(panel, "Dossier du journal") as HTMLSelectElement | undefined;
  if (!templates || !journal) throw new Error("liste des dossiers introuvable");
  const lists = { window, panel, templates, journal };
  checkLists(trial, lists);
  choose(templates, "⎿ Sous");
  const kept = stored("malorean.templates:");
  trial.check(
    "choisir un dossier l'enregistre (stockage de la fenêtre)",
    kept === "Essai/Sous",
    String(kept),
  );
  choose(templates, "Aucun");
  trial.check("choisir « Aucun » l'efface", stored("malorean.templates:") === null);
  await checkNewFolder(trial, lists);
  closeSettings(window);
}

export const settingsScenarios = (): Scenario[] => [
  { name: "Réglages : onglet Index, barre de progression", run: (t) => indexTab(t) },
  { name: "Réglages : onglet Brancher une IA, boutons Copier", run: (t) => connectionTab(t) },
  { name: "Réglages : choix de dossier (modèles, journal)", run: (t) => folderChoices(t) },
];
