// L'onglet Projets (fiche 0063, spécification § 7.5) : « Nouveau projet », puis la liste (pastille de
// couleur, nom, actions ouvertes et en retard). Un projet se déplie sur ses actions ouvertes, la plus
// en retard d'abord ; ses compteurs ouvrent le Kanban filtré sur lui. On le renomme, on change sa
// couleur (les couleurs déjà prises sont grisées, mais choisissables) et on le supprime.
import type { CrmProjectItem } from "../bridge";
import { countText, takenColors } from "../state/crm-lists";
import { PALETTE } from "../state/palette";
import { actionButton, h } from "./crm-dom";
import {
  actionsOf,
  countElement,
  listHead,
  type ListsContext,
  newBar,
  unfoldButton,
} from "./crm-lists-ui";

const unfoldKey = (project: CrmProjectItem) => `projects:${project.name}`;

/** Le choix de couleur : les 10 de la palette ; celles d'un autre projet sont grisées mais se choisissent. */
function paletteChoice(ctx: ListsContext, project: CrmProjectItem): HTMLElement {
  const taken = takenColors(ctx.crm.projects, project.name);
  const element = h("div", "crm-palette");
  element.setAttribute("role", "group");
  element.setAttribute("aria-label", `Couleur de ${project.title}`);
  for (const color of PALETTE) {
    const used = taken.has(color);
    const button = actionButton("crm-palette-color", "", used ? `${color} (déjà prise)` : color);
    button.dataset.color = color;
    button.setAttribute("aria-pressed", String(color === project.color));
    button.classList.toggle("taken", used);
    button.style.setProperty("--label-color", `var(--palette-${color})`);
    button.addEventListener("click", () => {
      ctx.state.palette = null;
      void ctx.act.gesture(() =>
        ctx.backend.changeCrmProject(ctx.path, project.name, { kind: "color", color }),
      );
    });
    element.append(button);
  }
  return element;
}

/** Le champ du nouveau nom : Entrée valide, Échap ou quitter le champ abandonne. */
function renameField(ctx: ListsContext, project: CrmProjectItem, value: string): HTMLInputElement {
  const input = h("input", "crm-project-rename");
  input.setAttribute("aria-label", `Nom du projet ${project.title}`);
  input.dataset.keep = "rename";
  input.spellcheck = false;
  input.value = value;
  const stop = () => {
    ctx.state.renaming = null;
    ctx.act.redraw();
  };
  input.addEventListener(
    "input",
    () => void (ctx.state.renaming = { project: project.name, value: input.value }),
  );
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void commitRename(ctx, project, input.value.trim());
    if (event.key === "Escape") {
      event.stopPropagation();
      stop();
    }
  });
  // Le dessin de l'écran retire le champ : ce n'est pas un départ de l'utilisateur.
  input.addEventListener("blur", () => ctx.act.redrawing() || !input.isConnected || stop());
  return input;
}

async function commitRename(ctx: ListsContext, project: CrmProjectItem, name: string) {
  if (name !== "" && name !== project.title) {
    const done = await ctx.act.gesture(() =>
      ctx.backend.changeCrmProject(ctx.path, project.name, { kind: "rename", name }),
    );
    if (!done) return;
  }
  ctx.state.renaming = null;
  ctx.act.redraw();
}

/** « Supprimer » : une confirmation dit que les actions du projet passent à « Sans projet ». */
async function removeProject(ctx: ListsContext, project: CrmProjectItem): Promise<void> {
  const count = ctx.crm.actions.filter((action) => action.project === project.name).length;
  const effect =
    count === 0
      ? ""
      : count === 1
        ? " Son action passe à « Sans projet »."
        : ` Ses ${String(count)} actions passent à « Sans projet ».`;
  if (!(await ctx.act.confirm(`Supprimer le projet « ${project.title} » ?${effect}`, "Supprimer")))
    return;
  await ctx.act.gesture(() => ctx.backend.deleteCrmProject(ctx.path, project.name));
}

/** La pastille : un clic ouvre ou ferme le choix de couleur. */
function swatch(ctx: ListsContext, project: CrmProjectItem): HTMLButtonElement {
  const button = actionButton(
    "crm-swatch",
    "",
    `Changer la couleur de ${project.title} (${project.color})`,
  );
  button.title = "Changer la couleur";
  button.style.setProperty("--label-color", `var(--palette-${project.color})`);
  button.setAttribute("aria-expanded", String(ctx.state.palette === project.name));
  button.addEventListener("click", () => {
    ctx.state.palette = ctx.state.palette === project.name ? null : project.name;
    ctx.act.redraw();
  });
  return button;
}

/** Les compteurs : un clic ouvre le Kanban filtré sur ce projet. */
function counters(ctx: ListsContext, project: CrmProjectItem): HTMLButtonElement {
  const label = `Voir les actions de ${project.title}`;
  const button = actionButton("crm-project-show", "", label);
  button.title = label;
  button.append(countElement("crm-open-count", countText(project.tally.open, "ouverte")));
  if (project.tally.late > 0)
    button.append(countElement("crm-badge late", `${String(project.tally.late)} en retard`));
  button.addEventListener("click", () => ctx.act.showProject(project.name));
  return button;
}

function projectButtons(ctx: ListsContext, project: CrmProjectItem): HTMLButtonElement[] {
  const rename = actionButton("crm-project-rename-button", "Renommer", `Renommer ${project.title}`);
  rename.addEventListener("click", () => {
    ctx.state.renaming = { project: project.name, value: project.title };
    ctx.act.focus("rename");
    ctx.act.redraw();
  });
  const remove = actionButton("crm-project-remove", "Supprimer", `Supprimer ${project.title}`);
  remove.addEventListener("click", () => void removeProject(ctx, project));
  return [rename, remove];
}

function projectItem(ctx: ListsContext, project: CrmProjectItem): HTMLElement {
  const item = h("li", "crm-project");
  item.dataset.project = project.name;
  const { renaming } = ctx.state;
  const name =
    renaming?.project === project.name
      ? renameField(ctx, project, renaming.value)
      : h("span", "crm-project-name", project.title);
  const row = h("div", "crm-project-row");
  row.append(
    unfoldButton(ctx, unfoldKey(project), project.title),
    swatch(ctx, project),
    name,
    counters(ctx, project),
    ...projectButtons(ctx, project),
  );
  item.append(row);
  if (ctx.state.palette === project.name) item.append(paletteChoice(ctx, project));
  if (ctx.state.unfolded.has(unfoldKey(project)))
    item.append(actionsOf(ctx, project.openActions, "project", "Aucune action ouverte."));
  return item;
}

/** Ce que montre l'onglet Projets. */
export function projectsTab(ctx: ListsContext): HTMLElement {
  const add = newBar(ctx, "project", { button: "Nouveau projet", field: "Nom du projet" }, (name) =>
    ctx.act.gesture(() => ctx.backend.createCrmProject(ctx.path, name)),
  );
  const list = h("div", "crm-list crm-projects");
  list.append(...listHead([add.button], add.form));
  if (ctx.crm.projects.length === 0) list.append(h("p", "crm-list-empty", "Aucun projet."));
  else {
    const items = h("ul", "crm-project-list");
    items.append(...ctx.crm.projects.map((project) => projectItem(ctx, project)));
    list.append(items);
  }
  return list;
}
