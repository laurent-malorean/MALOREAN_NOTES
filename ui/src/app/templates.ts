// Modèles de note : le dossier des modèles de l'espace de travail, et la note créée depuis un modèle.
import type * as Bridge from "../bridge";
import { openPicker } from "../screens/picker";
import { templatesFolderGroup } from "../screens/templates-setting";
import { notePlaced } from "../state/columns";
import type { PreferenceStorage } from "../state/focus-preference";
import { matchingNotes } from "../state/quick-open";
import { currentFolder } from "../state/screen";
import { loadTemplatesFolder, saveTemplatesFolder, templatesIn } from "../state/templates-folder";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Workspace } from "./workspace";

export interface TemplatesDeps {
  readonly backend: Pick<typeof Bridge, "listAllNotes" | "createNoteFromTemplate">;
  /** Où le dossier des modèles de chaque espace de travail est gardé. */
  readonly storage: PreferenceStorage;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "flushedPath" | "update" | "activePane">;
  readonly workspace: Pick<Workspace, "path" | "refreshList" | "refreshTags">;
  /** La fenêtre de choix au clavier. */
  readonly picker: HTMLDialogElement;
  /** Montre un message quelques secondes. */
  show(message: string): void;
  run(action: Promise<unknown>): void;
}

export interface Templates {
  /** Fait choisir un modèle, puis crée la note dans le dossier affiché et l'ouvre dans un nouvel onglet. */
  newNote(): Promise<void>;
  /** La partie des réglages qui choisit le dossier des modèles ; rien sans espace de travail ouvert. */
  settingsGroups(): HTMLElement[];
}

/** La note tirée du modèle, le modèle enregistré d'abord s'il est ouvert et modifié. */
async function createFrom(deps: TemplatesDeps, template: string) {
  const source = await deps.columns.flushedPath(template);
  const created = await deps.backend.createNoteFromTemplate(
    source,
    currentFolder(deps.screen.get()),
  );
  await deps.workspace.refreshList();
  // Un modèle peut porter des étiquettes.
  await deps.workspace.refreshTags();
  await deps.columns.update((now) => notePlaced(now, created.path, "newTab"));
  deps.columns.activePane().editor.focus();
}

async function newNote(deps: TemplatesDeps) {
  if (deps.screen.get().kind !== "workspace") return;
  const folder = loadTemplatesFolder(deps.storage, deps.workspace.path());
  if (folder === null)
    return deps.show("Aucun dossier des modèles : choisissez-en un dans les réglages.");
  const templates = templatesIn(await deps.backend.listAllNotes(), folder);
  if (templates.length === 0)
    return deps.show(`Le dossier des modèles « ${folder} » ne contient aucune note.`);
  openPicker(deps.picker, {
    label: "Nouvelle note depuis un modèle",
    placeholder: "Titre du modèle",
    empty: "Aucun modèle ne correspond",
    entries: (query) => matchingNotes(templates, query),
    describe: (template) => ({ label: template.title }),
    choose: (template) => deps.run(createFrom(deps, template.path)),
  });
}

export function createTemplates(deps: TemplatesDeps): Templates {
  return {
    newNote: () => newNote(deps),
    settingsGroups: () => {
      const screen = deps.screen.get();
      if (screen.kind !== "workspace") return [];
      const workspace = deps.workspace.path();
      return [
        templatesFolderGroup(
          screen.folders,
          loadTemplatesFolder(deps.storage, workspace),
          (folder) => saveTemplatesFolder(deps.storage, workspace, folder),
        ),
      ];
    },
  };
}
