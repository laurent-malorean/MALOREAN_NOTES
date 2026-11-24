// Pièces jointes et images exportées simulées pour les parcours : même nommage que Rust, en plus
// simple. Les en-têtes de la commande viennent de `fake-backend.ts` (le simulateur de Tauri ne les
// transmet pas).

export interface Files {
  attachments: Record<string, number>;
  exportedImages: Record<string, Uint8Array>;
}
export type Header = (name: string) => string | undefined;

/** Pièces jointes : même nommage que Rust, en plus simple (moment figé). */
const PASTED_NAMES: Record<string, string> = {
  "image/png": "image-2026-11-16-1830.png",
  "application/pdf": "document-2026-11-16-1830.pdf",
};
const ATTACHABLE = /\.(png|jpe?g|gif|webp|heic|tiff|svg|pdf)$/i;
const encodedInLink = (text: string) =>
  text.replaceAll(" ", "%20").replaceAll("(", "%28").replaceAll(")", "%29");
/** Le nom que prend le fichier dans `assets` : le sien, ou un suffixe libre. */
function freeAttachmentName(backend: Files, assets: string, wanted: string) {
  const [base = "", extension = ""] = /^(.*)\.([^.]+)$/.exec(wanted)?.slice(1) ?? [];
  let name = wanted;
  for (let n = 2; `${assets}${name}` in backend.attachments; n++)
    name = `${base}-${n}.${extension}`;
  return name;
}

export function attachFile(backend: Files, header: Header, bytes: Uint8Array) {
  const note = header("x-note") ?? "";
  const wanted = header("x-file-name") ?? PASTED_NAMES[header("x-media-type") ?? ""] ?? "";
  if (!ATTACHABLE.test(wanted)) throw { message: `« ${wanted} » ne peut pas être joint` };
  const stem = note.replace(/^.*\//, "").replace(/\.md$/, "");
  const assets = `${note.replace(/[^/]*$/, "")}${stem}.assets/`;
  const name = freeAttachmentName(backend, assets, wanted);
  backend.attachments[`${assets}${name}`] = bytes.length;
  const target = `${stem}.assets/${encodedInLink(name)}`;
  return { markdown: /\.pdf$/i.test(name) ? `[${name}](${target})` : `![](${target})` };
}

export interface ExportImageArgs {
  destination: string;
  png: string;
}

/** L'image PNG d'une carte (reçue en base64, comme par Rust), gardée à son emplacement. */
export function keepImage(backend: Files, { destination, png }: ExportImageArgs) {
  backend.exportedImages[destination] = Uint8Array.from(atob(png), (c) => c.charCodeAt(0));
  return null;
}
