// Essai de l'application réelle (fiche 0054) : un canvas fait de bout en bout dans la vraie application :
// une carte image (fichier du Mac), une flèche, la fermeture et la réouverture.
import { fileChoice } from "../../app/canvas-host";
import type { CanvasFileItem } from "../../bridge";
import type { Scenario, Trial } from "../runner";
import { until } from "../wait";
import {
  type Env,
  buttonNamed,
  centreOf,
  dropFromBar,
  find,
  findAll,
  fixtureImage,
  loadedImage,
  notesFolder,
  pointer,
  rectOf,
  shownMessages,
  step,
} from "./env";

const CANVAS_TITLE = "Essai canvas";
const WAIT = 8_000;
const OTHER_CARD = "Autre carte";

/** Un point de la surface du canvas, en fractions de sa largeur et de sa hauteur. */
function surfacePoint(fx: number, fy: number) {
  const surface = find<HTMLElement>(".canvas-surface");
  if (surface === null) throw new Error("le canvas n'est pas affiché");
  const box = rectOf(surface);
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

function barButton(name: string): HTMLButtonElement {
  const button = buttonNamed(name);
  if (button === null) throw new Error(`le bouton « ${name} » est absent de la barre du canvas`);
  return button;
}

const savedCanvas = (env: Env, path: string): Promise<CanvasFileItem> =>
  env.bridge.readCanvas(path);

function canvasPath(env: Env): string {
  if (env.shared.canvas === undefined) {
    throw new Error("pas de canvas : le scénario de la carte image ne l'a pas créé");
  }
  return env.shared.canvas;
}

/** Ajoute une carte image : le fichier de l'essai est « choisi » à la place de la fenêtre du Mac. */
async function addImageCard(env: Env): Promise<void> {
  const chosen = new File([(await fixtureImage(env)) as BlobPart], "image.png", {
    type: "image/png",
  });
  const original = fileChoice.pick;
  fileChoice.pick = () => Promise.resolve(chosen);
  try {
    dropFromBar(barButton("Ajouter un média"), surfacePoint(0.68, 0.6));
    const appeared = () => find(".canvas-card img");
    await until("une carte image dans le canvas", appeared, WAIT).catch(() => null);
  } finally {
    fileChoice.pick = original;
  }
}

async function imageCard(env: Env, trial: Trial): Promise<void> {
  const { path } = await step("création du canvas", () =>
    env.bridge.createCanvas("", CANVAS_TITLE),
  );
  env.shared.canvas = path;
  env.open(path);
  await until("le canvas affiché", () => find(".canvas-world"), WAIT);
  await addImageCard(env);
  const { cards } = (await savedCanvas(env, path)).canvas;
  const stored = cards.find((c) => c.kind === "file" && /\.png$/i.test(c.file ?? ""));
  const files = JSON.stringify(cards.map((c) => c.file));
  trial.check(
    "le fichier .canvas contient une carte image",
    stored !== undefined,
    `cartes : ${files} ; messages affichés : ${shownMessages() || "aucun"}`,
  );
  const image = find<HTMLImageElement>(".canvas-card img");
  const shown = findAll(".canvas-card").length;
  trial.check("la carte image est dans la fenêtre", image !== null, `cartes affichées : ${shown}`);
  const width = image?.naturalWidth ?? 0;
  trial.check("l'image est affichée (naturalWidth > 0)", width > 0, `naturalWidth = ${width}`);
  const address = env.bridge.fileAddress(`${notesFolder(env)}/${stored?.file ?? ""}`);
  const copied = stored === undefined ? null : await loadedImage(address);
  trial.check(
    "le fichier image est copié à côté du canvas, sur le disque",
    copied !== null,
    `${stored?.file ?? "aucun fichier"} : ${JSON.stringify(copied)}`,
  );
}

/** Ajoute une carte texte à gauche et en haut, et y écrit `text` comme au clavier. */
async function addTextCard(env: Env, path: string, text: string): Promise<void> {
  dropFromBar(barButton("Ajouter une carte texte"), surfacePoint(0.2, 0.2));
  const editor = await until(
    "la saisie de la carte texte",
    () => find<HTMLTextAreaElement>(".canvas-editor"),
    WAIT,
  );
  editor.value = text;
  editor.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
  );
  const written = async () =>
    (await savedCanvas(env, path)).canvas.cards.some((c) => c.text === text) ? true : null;
  await until("la carte texte enregistrée", written, WAIT);
}

/** Tire une flèche du rond haut de la carte `from` jusqu'à la carte `to`, à la souris. */
function dragArrow(from: string, to: string): void {
  const dot = find<HTMLElement>(`.canvas-card[data-id="${from}"] .canvas-link-dot-top`);
  const target = find<HTMLElement>(`.canvas-card[data-id="${to}"]`);
  const surface = find<HTMLElement>(".canvas-surface");
  if (dot === null || target === null || surface === null) {
    throw new Error("cartes ou rond de départ introuvables à l'écran");
  }
  const end = centreOf(rectOf(target));
  pointer(dot, "pointerdown", centreOf(rectOf(dot)));
  pointer(surface, "pointermove", end);
  pointer(surface, "pointerup", end);
}

async function arrow(env: Env, trial: Trial): Promise<void> {
  const path = canvasPath(env);
  await addTextCard(env, path, OTHER_CARD);
  const { cards } = (await savedCanvas(env, path)).canvas;
  const image = cards.find((c) => c.kind === "file");
  const other = cards.find((c) => c.text === OTHER_CARD);
  trial.check(
    "la carte image existe avant de tracer la flèche",
    image !== undefined,
    "aucune carte image dans le fichier : l'ajout d'une image n'a rien ajouté, la flèche ne peut pas partir d'elle",
  );
  if (image === undefined || other === undefined) return;
  dragArrow(image.id, other.id);
  const withArrow = async () => {
    const file = await savedCanvas(env, path);
    return file.canvas.arrows.length > 0 ? file : null;
  };
  const written = await until("la flèche écrite dans le fichier", withArrow, WAIT).catch(
    () => null,
  );
  const made = written?.canvas.arrows[0];
  trial.check(
    "la flèche est écrite dans le fichier .canvas",
    made !== undefined,
    `flèches : ${written?.canvas.arrows.length ?? 0}`,
  );
  trial.check(
    "elle relie la carte image à l'autre carte",
    made?.from === image.id && made.to === other.id,
    JSON.stringify(made),
  );
  const again = await savedCanvas(env, path);
  trial.check(
    "la relecture du fichier est identique",
    JSON.stringify(again) === JSON.stringify(written),
    `texte de ${again.text.length} caractères`,
  );
  const drawn = findAll(".canvas-arrow-line").length;
  trial.check("la flèche est dessinée dans la fenêtre", drawn === 1, `lignes dessinées : ${drawn}`);
}

/** Ferme le canvas en ouvrant une autre note, puis le rouvre. */
async function closeAndReopen(env: Env, path: string): Promise<void> {
  const other = await env.bridge.createNote("");
  env.open(other.path);
  await until("le canvas fermé", () => (find(".canvas-world") === null ? true : null), WAIT);
  env.open(path);
  await until("le canvas rouvert", () => (find(".canvas-card") === null ? null : true), WAIT);
}

async function reopen(env: Env, trial: Trial): Promise<void> {
  const path = canvasPath(env);
  const before = await savedCanvas(env, path);
  const { cards, arrows } = before.canvas;
  trial.check(
    "le canvas contient la carte image à rouvrir",
    cards.some((c) => c.kind === "file"),
    `cartes : ${cards.length}`,
  );
  trial.check(
    "le canvas contient la flèche à rouvrir",
    arrows.length > 0,
    `flèches : ${arrows.length}`,
  );
  await closeAndReopen(env, path);
  const after = await savedCanvas(env, path);
  trial.check(
    "le fichier est identique après la réouverture",
    JSON.stringify(after) === JSON.stringify(before),
    `avant ${before.text.length} caractères, après ${after.text.length}`,
  );
  const shown = findAll(".canvas-card").length;
  trial.check(
    "toutes les cartes sont de nouveau affichées",
    shown === cards.length,
    `${shown} affichées, ${cards.length} dans le fichier`,
  );
  const images = findAll<HTMLImageElement>(".canvas-card img").map((i) => i.naturalWidth);
  trial.check(
    "l'image est de nouveau affichée",
    images.length > 0 && images.every((w) => w > 0),
    `largeurs : ${images.join(", ") || "aucune image"}`,
  );
}

/** Les scénarios du canvas, liés à l'application de l'essai. */
export function canvasScenariosFor(env: Env): Scenario[] {
  return [
    {
      name: "Canvas : ajouter une carte image à partir d'un fichier",
      run: (t) => imageCard(env, t),
    },
    {
      name: "Canvas : tracer une flèche entre la carte image et une autre carte",
      run: (t) => arrow(env, t),
    },
    { name: "Canvas : fermer et rouvrir", run: (t) => reopen(env, t) },
  ];
}
