// La progression d'un téléchargement : une barre, ce qui est reçu sur ce qu'il faut recevoir, et de quoi annuler.
import type { Progress } from "../state/meaning";

/** Une barre de progression, son texte (« 120 Mo sur 449 Mo (27 %) ») et « Annuler le téléchargement ». */
export function downloadProgress(progress: Progress, cancel: () => void): HTMLElement {
  const bar = document.createElement("progress");
  bar.max = 100;
  bar.value = progress.percent;
  bar.setAttribute("aria-label", "Téléchargement du modèle");
  const text = document.createElement("span");
  text.className = "download-text";
  text.textContent = progress.text;
  const stop = document.createElement("button");
  stop.className = "link";
  stop.textContent = "Annuler le téléchargement";
  stop.addEventListener("click", cancel);
  const element = document.createElement("div");
  element.className = "download-progress";
  element.append(bar, text, stop);
  return element;
}
