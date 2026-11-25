// Barre de progression d'un index : son nom, une piste grise remplie en orange du pourcentage fait,
// et ce pourcentage écrit à côté (« 62 % », ou un texte plus complet : « 631 sur 645, 97 % »).

/** La barre d'un index qui en est à `percent` % (0 à 100), nommée `name` ; `written` remplace « 62 % » à côté. */
export function indexBar(name: string, percent: number, written = `${percent} %`): HTMLElement {
  const label = document.createElement("span");
  label.className = "index-bar-name";
  label.textContent = name;
  const fill = document.createElement("span");
  fill.className = "index-bar-fill";
  fill.style.width = `${percent}%`;
  const track = document.createElement("span");
  track.className = "index-bar-track";
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", name);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  track.setAttribute("aria-valuenow", String(percent));
  track.setAttribute("aria-valuetext", written);
  track.append(fill);
  const value = document.createElement("span");
  value.className = "index-bar-percent";
  value.textContent = written;
  const element = document.createElement("div");
  element.className = "index-bar";
  element.append(label, track, value);
  return element;
}
