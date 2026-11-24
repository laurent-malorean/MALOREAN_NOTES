// Essai de l'application réelle (fiche 0054) : l'export en PNG d'un canvas et d'une carte mentale par le vrai
// chemin (image faite dans la fenêtre, envoyée en base64 par l'IPC de Tauri, écrite par Rust), puis relue.
import type { CanvasCardItem, CanvasItem } from "../../bridge";
import { canvasFrame } from "../../state/canvas-image";
import { IMAGE_MARGIN, IMAGE_SCALE, type ImageFrame } from "../../state/mind-map-image";
import {
  DRAWN_MINIMUM,
  type PixelRect,
  type Pixels,
  drawnPoints,
  pixelRect,
  pngSize,
} from "../png";
import { type Scenario, type Trial, messageOf } from "../runner";
import { until } from "../wait";
import {
  type Env,
  buttonNamed,
  find,
  findAll,
  notesFolder,
  pixelsOf,
  readDisk,
  shownMessages,
  step,
  setExportDestination,
} from "./env";

const WAIT = 20_000;
/** Les rectangles du DOM sont arrondis au point : l'image peut différer d'un point (2 pixels), comme dans le test e2e. */
const PIXEL_TOLERANCE = 2;
/** Une image dont moins que cela de la zone a changé de couleur n'est pas dessinée (une image est colorée presque partout). */
const PICTURE_SHARE = 0.5;

const card = (id: string, box: [number, number, number, number], own: Partial<CanvasCardItem>) => ({
  ...{ id, kind: "text", text: null, file: null, subpath: null, url: null, label: null },
  ...{ background: null, backgroundStyle: null, color: null, palette: null, extra: [] },
  ...{ x: box[0], y: box[1], width: box[2], height: box[3] },
  ...own,
});

/** Un canvas dont on connaît chaque carte : deux textes, une image du dossier de l'espace, une flèche. */
function exportedCanvas(): CanvasItem {
  return {
    cards: [
      card("a1a1a1a1a1a1a1a1", [0, 0, 260, 110], { text: "Premier texte" }),
      card("b2b2b2b2b2b2b2b2", [420, 20, 260, 110], { text: "Second texte", palette: "rouge" }),
      card("c3c3c3c3c3c3c3c3", [60, 260, 240, 160], { kind: "file", file: "Fixtures/image.png" }),
    ],
    arrows: [
      {
        ...{ id: "d4d4d4d4d4d4d4d4", from: "a1a1a1a1a1a1a1a1", fromSide: "right" },
        ...{ to: "b2b2b2b2b2b2b2b2", toSide: "left", fromEnd: "none", toEnd: "arrow" },
        ...{ color: null, palette: null, label: null, extra: [] },
      },
    ],
    extra: [],
  };
}

interface Measured {
  readonly width: number;
  readonly height: number;
}

/** Attend le fichier écrit par Rust et en relit la signature et la taille. */
async function writtenPng(path: string, trial: Trial): Promise<Uint8Array | null> {
  const bytes = await until(
    "le fichier PNG écrit par Rust",
    async () => {
      const read = await readDisk(path);
      return read !== null && read.length > 0 ? read : null;
    },
    WAIT,
  ).catch(() => null);
  trial.check(
    "le fichier PNG existe sur le disque",
    bytes !== null,
    `${path} ; messages affichés : ${shownMessages() || "aucun"}`,
  );
  return bytes;
}

function checkPng(trial: Trial, bytes: Uint8Array, expected: Measured): void {
  const size = pngSize(bytes);
  trial.measure("octetsDuPng", bytes.length);
  trial.check(
    "le fichier porte la signature PNG",
    size !== null,
    `${bytes.length} octets, début ${[...bytes.subarray(0, 8)].join(",")}`,
  );
  trial.check(
    "la taille de l'image est celle du cadre (carte + 40 points de marge de chaque côté, 2 pixels par point)",
    size !== null &&
      Math.abs(size.width - expected.width) <= PIXEL_TOLERANCE &&
      Math.abs(size.height - expected.height) <= PIXEL_TOLERANCE,
    `image ${size?.width}x${size?.height}, attendue ${expected.width}x${expected.height}`,
  );
}

/** Ouvre un canvas dont on connaît chaque carte, et attend que son image soit affichée. */
async function showExportedCanvas(env: Env, content: CanvasItem): Promise<void> {
  const { path } = await step("création du canvas", () =>
    env.bridge.createCanvas("", "Essai export"),
  );
  const read = await step("lecture du canvas", () => env.bridge.readCanvas(path));
  await step("écriture du canvas d'essai", () => env.bridge.saveCanvas(path, read.text, content));
  env.open(path);
  const loaded = () => {
    const image = find<HTMLImageElement>(".canvas-card img");
    return image !== null && image.naturalWidth > 0 ? image : null;
  };
  await until("l'image de la carte image affichée", loaded, WAIT);
}

/** Ce que l'image doit montrer d'une carte : un fichier-image est coloré presque partout, un texte a au moins sa bordure. */
function drawnEnough(
  card: CanvasCardItem,
  zone: PixelRect,
  drawn: number,
): { ok: boolean; wanted: number } {
  const sampled = Math.ceil(zone.width / 2) * Math.ceil(zone.height / 2);
  const wanted = card.kind === "file" ? sampled * PICTURE_SHARE : DRAWN_MINIMUM;
  return { ok: drawn >= wanted, wanted: Math.round(wanted) };
}

function checkCard(trial: Trial, card: CanvasCardItem, frame: ImageFrame, image: Pixels): void {
  const name = card.text ?? card.file ?? card.id;
  const element = find<HTMLElement>(`.canvas-card[data-id="${card.id}"]`);
  const wide = element?.offsetWidth ?? -1;
  const high = element?.offsetHeight ?? -1;
  const sized = Math.abs(wide - card.width) <= 1 && Math.abs(high - card.height) <= 1;
  trial.check(
    `la carte ${name} a dans la fenêtre la taille du fichier`,
    sized,
    `fenêtre ${wide}x${high}, fichier ${card.width}x${card.height}`,
  );
  const zone = pixelRect(card, frame, IMAGE_SCALE);
  const drawn = drawnPoints(image, zone);
  const enough = drawnEnough(card, zone, drawn);
  trial.check(
    `la carte ${name} est dessinée dans l'image`,
    enough.ok,
    `${drawn} points différents du fond, au moins ${enough.wanted} attendus`,
  );
}

/** L'export du canvas relit chaque image affichée par `fetch` : le protocole des fichiers doit le laisser faire. */
async function checkFetchOfImages(env: Env, trial: Trial): Promise<void> {
  const address = env.bridge.fileAddress(`${notesFolder(env)}/Fixtures/image.png`);
  const result = await fetch(address)
    .then((response) => `réponse ${response.status}, ${response.headers.get("content-type")}`)
    .catch((error: unknown) => `refusé : ${messageOf(error)}`);
  trial.check(
    "`fetch` lit une image par le protocole des fichiers (l'export du canvas en a besoin)",
    result.startsWith("réponse 200"),
    result,
  );
}

async function exportCanvas(env: Env, trial: Trial): Promise<void> {
  const content = exportedCanvas();
  await showExportedCanvas(env, content);
  await checkFetchOfImages(env, trial);
  const destination = `${notesFolder(env)}/Exports/canvas.png`;
  await setExportDestination(destination);
  await env.exportCanvasImage();
  const bytes = await writtenPng(destination, trial);
  const frame = canvasFrame(content);
  if (bytes === null || frame === null) return;
  checkPng(trial, bytes, { width: frame.pixelsWide, height: frame.pixelsHigh });
  const image = await pixelsOf(bytes);
  const shown = findAll(".canvas-card").length;
  trial.check(
    "chaque carte du fichier est affichée dans la fenêtre",
    shown === content.cards.length,
    `${shown} affichées, ${content.cards.length} dans le fichier`,
  );
  for (const card of content.cards) checkCard(trial, card, frame, image);
}

/** Les nœuds affichés de la carte mentale, à leur place dans le monde de la carte. */
function shownNodes() {
  return findAll<HTMLElement>(".mind-map-node[data-path]").map((node) => ({
    text: (node.textContent ?? "").slice(0, 12),
    ...{
      x: node.offsetLeft,
      y: node.offsetTop,
      width: node.offsetWidth,
      height: node.offsetHeight,
    },
  }));
}

async function exportMindMap(env: Env, trial: Trial): Promise<void> {
  env.open("toto.md");
  await until(
    "les nœuds de la carte mentale",
    () => find(".mind-map-node:not(.mind-map-probe)"),
    WAIT,
  );
  const nodes = shownNodes();
  const destination = `${notesFolder(env)}/Exports/carte.png`;
  await setExportDestination(destination);
  const exportButton = buttonNamed("Exporter en image");
  if (exportButton === null)
    throw new Error("le bouton « Exporter en image » est absent de la carte");
  exportButton.click();
  const bytes = await writtenPng(destination, trial);
  if (bytes === null) return;
  const left = Math.min(...nodes.map((n) => n.x));
  const top = Math.min(...nodes.map((n) => n.y));
  const width = Math.max(...nodes.map((n) => n.x + n.width)) - left + 2 * IMAGE_MARGIN;
  const height = Math.max(...nodes.map((n) => n.y + n.height)) - top + 2 * IMAGE_MARGIN;
  checkPng(trial, bytes, { width: width * IMAGE_SCALE, height: height * IMAGE_SCALE });
  const image = await pixelsOf(bytes);
  const frame = { x: left - IMAGE_MARGIN, y: top - IMAGE_MARGIN };
  trial.measure("nœudsAffichés", nodes.length);
  const missing = nodes.filter(
    (n) => drawnPoints(image, pixelRect(n, frame, IMAGE_SCALE)) < DRAWN_MINIMUM,
  );
  trial.check(
    "chaque nœud affiché est dessiné dans l'image",
    nodes.length > 0 && missing.length === 0,
    `${nodes.length} nœuds, non dessinés : ${missing.map((n) => n.text).join(" | ") || "aucun"}`,
  );
}

export const exportScenarios = (env: Env): Scenario[] => [
  { name: "Canvas : exporter en PNG", run: (t) => exportCanvas(env, t) },
  { name: "Carte mentale : exporter en PNG", run: (t) => exportMindMap(env, t) },
];
