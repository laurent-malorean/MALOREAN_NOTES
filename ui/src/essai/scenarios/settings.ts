// Essai de l'application réelle (fiche 0054) : l'écran des Réglages dans la vraie fenêtre. Ses onglets s'ouvrent
// par un clic ; les rectangles réels disent ce qui se voit (barres de l'onglet « Index »).
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

/** Les boutons « Copier » : à la taille des boutons des Réglages, sous le texte ; un clic les passe au vert, « ✓ Copié ». */
async function connectionTab(trial: Trial): Promise<void> {
  const window = await openSettings();
  const panel = await showTab(window, "Brancher une IA");
  const create = await until(
    "le bouton de création de la clé",
    () =>
      findAll<HTMLButtonElement>("button", panel).find(
        (b) => b.textContent === "Créer une clé de branchement",
      ),
    WAIT,
  );
  create.click();
  const copies = await until(
    "les trois boutons « Copier »",
    () => {
      const found = findAll<HTMLButtonElement>(".connection-copyable button", panel);
      return found.length === COPY_BUTTONS ? found : null;
    },
    WAIT,
  );
  const normal = findAll<HTMLButtonElement>("button", panel).find(
    (b) => b.textContent === "Révoquer la clé",
  );
  const first = copies[0] as HTMLButtonElement;
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

export const settingsScenarios = (): Scenario[] => [
  { name: "Réglages : onglet Index, barre de progression", run: (t) => indexTab(t) },
  { name: "Réglages : onglet Brancher une IA, boutons Copier", run: (t) => connectionTab(t) },
];
