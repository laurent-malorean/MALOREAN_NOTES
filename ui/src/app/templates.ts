// Modèles de note : le dossier des modèles de l'espace de travail, et la note créée depuis un modèle.
import type { MessageKind } from "./messages";
import type * as Bridge from "../bridge";
import { openPicker } from "../screens/picker";
import { loadingTemplatesFolderGroup } from "../screens/templates-setting";
import { notePlaced } from "../state/columns";
import { matchingNotes } from "../state/quick-open";
import { currentFolder } from "../state/screen";
import {
  forgetTemplatesFolders,
  type KeyedStorage,
  storedTemplatesFolders,
  templatesIn,
} from "../state/templates-folder";
import type { OpenColumns } from "./columns";
import type { CurrentScreen } from "./current-screen";
import type { Workspace } from "./workspace";

export interface TemplatesDeps {
  readonly backend: Pick<
    typeof Bridge,
    | "listAllNotes"
    | "createNoteFromTemplate"
    | "templatesFolder"
    | "setTemplatesFolder"
    | "importTemplatesFolders"
    | "errorMessage"
  >;
  /** Le stockage de la page, où l'interface gardait le dossier des modèles avant qu'il passe au moteur. */
  readonly storage: KeyedStorage;
  readonly screen: CurrentScreen;
  readonly columns: Pick<OpenColumns, "flushedPath" | "update" | "activePane">;
  readonly workspace: Pick<Workspace, "refreshList" | "refreshTags">;
  /** La fenêtre de choix au clavier. */
  readonly picker: HTMLDialogElement;
  /** Montre un message quelques secondes. */
  show(message: string, kind?: MessageKind): void;
  run(action: Promise<unknown>): void;
}

export interface Templates {
  /** Fait choisir un modèle, puis crée la note dans le dossier affiché et l'ouvre dans un nouvel onglet. */
  newNote(): Promise<void>;
  /** La partie des réglages qui choisit le dossier des modèles ; rien sans espace de travail ouvert. */
  settingsGroups(): HTMLElement[];
  /**
   * Au lancement, avant de rouvrir l'espace de travail : passe au moteur les dossiers des modèles
   * que l'interface gardait autrefois, puis les efface d'ici. Une erreur est dite ; les clés
   * restent alors pour le prochain lancement. Ne rejette jamais.
   */
  migrate(): Promise<void>;
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
  const folder = await deps.backend.templatesFolder();
  if (folder === null)
    return deps.show("Aucun dossier des modèles : choisissez-en un dans les réglages.", "info");
  const templates = templatesIn(await deps.backend.listAllNotes(), folder);
  if (templates.length === 0)
    return deps.show(`Le dossier des modèles « ${folder} » ne contient aucune note.`, "info");
  openPicker(deps.picker, {
    label: "Nouvelle note depuis un modèle",
    placeholder: "Titre du modèle",
    empty: "Aucun modèle ne correspond",
    entries: (query) => matchingNotes(templates, query),
    describe: (template) => ({ label: template.title }),
    choose: (template) => deps.run(createFrom(deps, template.path)),
  });
}

/** Reprend ce que l'interface gardait autrefois (fiche 0077), sans jamais empêcher le lancement. */
async function migrate(deps: TemplatesDeps) {
  const stored = storedTemplatesFolders(deps.storage);
  if (stored.length === 0) return;
  try {
    await deps.backend.importTemplatesFolders(
      stored.map(({ location, folder }) => ({ location, folder })),
    );
    forgetTemplatesFolders(
      deps.storage,
      stored.map(({ key }) => key),
    );
  } catch (error) {
    deps.show(deps.backend.errorMessage(error), "error");
  }
}

export function createTemplates(deps: TemplatesDeps): Templates {
  return {
    newNote: () => newNote(deps),
    migrate: () => migrate(deps),
    settingsGroups: () => {
      const screen = deps.screen.get();
      if (screen.kind !== "workspace") return [];
      const current = deps.backend.templatesFolder();
      deps.run(current);
      return [
        loadingTemplatesFolderGroup(screen.folders, current, (folder) =>
          deps.run(deps.backend.setTemplatesFolder(folder)),
        ),
      ];
    },
  };
}
