// Essai de l'application réelle (fiche 0054) : joindre une image à une note, par la vraie commande
// `attach_file`, et la voir dans l'éditeur.
import { attachedPath } from "../../app/canvas-host";
import { type PngSize, pngSize } from "../png";
import { type Scenario, type Trial, messageOf } from "../runner";
import { until } from "../wait";
import { type Env, find, fixtureImage, loadedImage, notesFolder, readDisk } from "./env";

const WAIT = 20_000;

/** Le lien qu'on écrit quand la jointure échoue : le fichier de l'essai, déjà dans l'espace de travail. */
const FALLBACK_LINK = "![image](Fixtures/image.png)";

/** Joint l'image de l'essai à une note neuve, par la vraie commande ; l'échec de la commande est une vérification ratée. */
async function attached(env: Env, trial: Trial) {
  const { bridge } = env;
  const note = await bridge.createNote("");
  const source = await fixtureImage(env);
  const file = new File([source as BlobPart], "image.png", { type: "image/png" });
  const link = await bridge
    .attachFile(note.path, file, { kind: "dropped", fileName: "image.png" })
    .catch((error: unknown) => ({ failure: messageOf(error) }));
  const failure = "failure" in link ? link.failure : null;
  trial.check(
    "attach_file rend le lien Markdown de la pièce jointe",
    failure === null,
    failure ?? ("markdown" in link ? link.markdown : ""),
  );
  return { note, markdown: "markdown" in link ? link.markdown : null, original: pngSize(source) };
}

async function checkFile(env: Env, trial: Trial, target: string, original: PngSize | null) {
  const path = `${notesFolder(env)}/${target}`;
  const stored = await readDisk(path);
  trial.check(
    "le fichier joint est sur le disque, à côté de la note",
    stored !== null && stored.length > 0,
    `${path} : ${stored?.length ?? "absent"} octets`,
  );
  const size = stored === null ? null : pngSize(stored);
  trial.check(
    "le fichier joint est un PNG de la taille de l'original",
    size !== null && size.width === original?.width && size.height === original.height,
    `joint ${JSON.stringify(size)}, original ${JSON.stringify(original)}`,
  );
  const direct = await loadedImage(env.bridge.fileAddress(path));
  trial.check(
    "le protocole des fichiers sert l'image jointe",
    direct !== null && direct.width > 0,
    JSON.stringify(direct),
  );
}

/** Écrit le lien dans la note, l'ouvre, et mesure l'image que l'éditeur en montre. */
async function checkEditor(env: Env, trial: Trial, path: string, markdown: string): Promise<void> {
  const content = await env.bridge.readNote(path);
  const text = `${content.content}\n\n${markdown}\n\nFin de la note.`;
  await env.bridge.saveNote(path, text, content.fingerprint);
  env.open(path);
  const image = () => find<HTMLImageElement>(".cm-content img.cm-lp-image");
  const shown = await until("l'image dans l'éditeur", image, WAIT).catch(() => null);
  trial.check(
    "l'éditeur montre l'image",
    shown !== null,
    shown === null ? "aucune image dans l'éditeur" : "image présente dans l'éditeur",
  );
  const loaded = () => (shown?.complete === true ? true : null);
  await until("le chargement de l'image de l'éditeur", loaded, WAIT).catch(() => null);
  const width = shown?.naturalWidth ?? 0;
  trial.check(
    "l'image de l'éditeur est chargée (naturalWidth > 0)",
    width > 0,
    `naturalWidth = ${width}`,
  );
}

async function attachImage(env: Env, trial: Trial): Promise<void> {
  const { note, markdown, original } = await attached(env, trial);
  const target = markdown === null ? null : attachedPath(note.path, markdown);
  if (target !== null) await checkFile(env, trial, target, original);
  else
    trial.note(
      "jointure ratée : l'éditeur est mesuré avec le fichier déjà présent dans l'espace de travail",
    );
  await checkEditor(env, trial, note.path, markdown ?? FALLBACK_LINK);
}

export const noteScenarios = (env: Env): Scenario[] => [
  { name: "Notes : joindre une image à une note", run: (t) => attachImage(env, t) },
];
