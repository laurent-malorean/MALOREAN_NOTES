// Pièces jointes et images exportées simulées pour les parcours : même nommage que Rust, en plus
// simple. Le contenu arrive en base64, comme par Rust.

export interface Files {
  attachments: Record<string, number>;
  exportedImages: Record<string, Uint8Array>;
}

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

export interface AttachArgs {
  note: string;
  fileName?: string;
  mediaType?: string;
  content: string;
}

export function attachFile(backend: Files, args: AttachArgs) {
  const { note } = args;
  const bytes = Uint8Array.from(atob(args.content), (c) => c.charCodeAt(0));
  const wanted = args.fileName ?? PASTED_NAMES[args.mediaType ?? ""] ?? "";
  if (!ATTACHABLE.test(wanted)) throw { message: `« ${wanted} » ne peut pas être joint` };
  const stem = note.replace(/^.*\//, "").replace(/\.[^.]*$/, "");
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
