// Nom coupé : un nom de dossier ou un titre de note trop long pour la largeur de son panneau se
// termine par « … » ; son nom complet s'affiche au survol, et seulement s'il est coupé.

/** Au survol, montre le texte complet de `element` s'il ne tient pas dans sa largeur. */
export function showFullNameWhenTruncated(element: HTMLElement): void {
  element.addEventListener("pointerenter", () => {
    if (element.scrollWidth > element.clientWidth) element.title = element.textContent;
    else element.removeAttribute("title");
  });
}
