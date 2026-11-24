// Essai de l'application réelle (fiche 0054) : lire une image PNG exportée et la comparer à ce que la
// fenêtre montrait. Rien ici ne touche au DOM : les scénarios passent les pixels, ces fonctions comptent.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
/** La première partie d'un PNG, `IHDR`, porte la taille : signature (8) + longueur (4) + nom (4) + 8 octets. */
const HEADER_LENGTH = 24;
const WIDTH_AT = 16;
const HEIGHT_AT = 20;

export interface PngSize {
  readonly width: number;
  readonly height: number;
}

/** La taille en pixels d'un PNG ; `null` si ce n'en est pas un (signature ou en-tête manquants). */
export function pngSize(bytes: Uint8Array): PngSize | null {
  if (bytes.length < HEADER_LENGTH) return null;
  if (!SIGNATURE.every((byte, i) => bytes[i] === byte)) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return { width: view.getUint32(WIDTH_AT), height: view.getUint32(HEIGHT_AT) };
}

/** Une zone, en pixels de l'image. */
export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Les pixels d'une image décodée : 4 octets (rouge, vert, bleu, alpha) par point, ligne après ligne. */
export interface Pixels {
  readonly width: number;
  readonly height: number;
  readonly data: ArrayLike<number>;
}

/** Au-dessous de cet écart (sur 255) un point est tenu pour de la couleur du fond. */
export const GROUND_TOLERANCE = 6;
/** Une zone qui compte moins de points différents du fond est tenue pour non dessinée. */
export const DRAWN_MINIMUM = 20;

/** La zone de `area` (en points de la carte) dans l'image dont le coin haut gauche est `frame` et qui a `scale` pixels par point. */
export function pixelRect(
  area: { x: number; y: number; width: number; height: number },
  frame: { x: number; y: number },
  scale: number,
): PixelRect {
  return {
    x: Math.round((area.x - frame.x) * scale),
    y: Math.round((area.y - frame.y) * scale),
    width: Math.round(area.width * scale),
    height: Math.round(area.height * scale),
  };
}

/** Le nombre de points de `zone` (échantillonnés un sur `step`) qui diffèrent du fond, le point en haut à gauche de l'image. */
export function drawnPoints(image: Pixels, zone: PixelRect, step = 2): number {
  const colourAt = (x: number, y: number) => {
    const i = (y * image.width + x) * 4;
    return [image.data[i] ?? 0, image.data[i + 1] ?? 0, image.data[i + 2] ?? 0];
  };
  const ground = colourAt(0, 0);
  let other = 0;
  for (let dy = 0; dy < zone.height; dy += step) {
    for (let dx = 0; dx < zone.width; dx += step) {
      const x = zone.x + dx;
      const y = zone.y + dy;
      if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
      if (colourAt(x, y).some((v, k) => Math.abs(v - (ground[k] ?? 0)) > GROUND_TOLERANCE)) other++;
    }
  }
  return other;
}
