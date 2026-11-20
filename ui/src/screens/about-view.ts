// À propos : la fenêtre ouverte par le menu de l'application. Icône, nom, version, auteur, et le
// site de MALOREAN, ouvert dans le navigateur.
import icon from "../assets/app-icon.png";
import packageInfo from "../../package.json";

/** Le site de MALOREAN. */
export const MALOREAN_SITE = "https://malorean.net";

function paragraph(className: string, text: string): HTMLParagraphElement {
  const element = document.createElement("p");
  element.className = className;
  element.textContent = text;
  return element;
}

/** Ouvre la fenêtre « À propos » dans `dialog` ; `openWebAddress` ouvre le site dans le navigateur. */
export function openAbout(dialog: HTMLDialogElement, openWebAddress: (address: string) => void) {
  const image = document.createElement("img");
  image.className = "about-icon";
  image.src = icon;
  image.alt = "";
  const site = document.createElement("a");
  site.className = "about-site";
  site.href = MALOREAN_SITE;
  site.textContent = "Malorean.net";
  site.addEventListener("click", (event) => {
    event.preventDefault();
    openWebAddress(MALOREAN_SITE);
  });
  const ok = document.createElement("button");
  ok.textContent = "OK";
  const buttons = document.createElement("div");
  buttons.className = "about-buttons";
  buttons.append(ok);
  // Le bouton d'un formulaire « dialog » ferme la fenêtre, comme Échap.
  const form = document.createElement("form");
  form.method = "dialog";
  form.append(
    image,
    paragraph("about-name", "MALOREAN Notes"),
    paragraph("about-version", `Version ${packageInfo.version}`),
    paragraph("about-author", "Réalisée par Laurent Deséchalliers"),
    site,
    buttons,
  );
  // La fenêtre de choix, qui partage ce dialogue, se ferme d'un clic sur son fond : pas celle-ci.
  dialog.onclick = null;
  dialog.className = "about";
  dialog.setAttribute("aria-label", "À propos de MALOREAN Notes");
  dialog.replaceChildren(form);
  dialog.showModal();
  ok.focus();
}
