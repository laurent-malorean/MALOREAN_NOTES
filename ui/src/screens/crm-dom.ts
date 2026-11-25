// Petits outils de dessin du CRM (fiche 0060) : un élément, un bouton.

/** Un élément de cette balise et de cette classe, avec son texte s'il y en a un. */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

/** La donnée `data-<key>` d'un élément que le CRM a dessiné lui-même : elle y est toujours. */
export const datum = (element: Element, key: string): string =>
  (element as HTMLElement).dataset[key] as string;

/** Un bouton qui ne soumet aucun formulaire. */
export function actionButton(className: string, text: string, label?: string): HTMLButtonElement {
  const element = h("button", className, text);
  element.type = "button";
  if (label !== undefined) element.setAttribute("aria-label", label);
  return element;
}
