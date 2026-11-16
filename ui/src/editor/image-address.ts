// Où trouver une image citée dans une note : sur le web, ou dans le dossier de la bibliothèque.

const KEPT_AS_IS = /^(?:https?:|data:image\/)/i;
const OTHER_PROTOCOL = /^[a-z][a-z0-9+.-]*:/i;
const ANGLE_BRACKETS = /^<(.*)>$/;

function decoded(path: string): string {
  try {
    return decodeURI(path);
  } catch {
    return path;
  }
}

/**
 * L'adresse que la fenêtre peut charger pour l'image `src` d'une note de la bibliothèque.
 * Vide pour un protocole non pris en charge : rien n'est chargé.
 */
export function imageAddress(
  src: string,
  libraryPath: string,
  toAssetUrl: (path: string) => string,
): string {
  const address = src.replace(ANGLE_BRACKETS, "$1");
  if (KEPT_AS_IS.test(address)) return address;
  if (OTHER_PROTOCOL.test(address)) return "";
  const path = decoded(address);
  return toAssetUrl(path.startsWith("/") ? path : `${libraryPath}/${path}`);
}
