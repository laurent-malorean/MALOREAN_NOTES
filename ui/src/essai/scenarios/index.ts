// Essai de l'application réelle (fiche 0054) : les scénarios, dans l'ordre où ils se jouent. Les cinq premiers
// partagent l'espace de travail `notes` (le canvas fait par le premier sert aux deux suivants) ; le dernier
// ouvre l'espace de travail `recherche` ; celui du sélecteur d'espace de travail ajoute `essai-bis` avant lui.
import type { Scenario } from "../runner";
import { canvasScenariosFor } from "./canvas";
import { crmScenarios } from "./crm";
import { crmTabsScenarios } from "./crm-tabs";
import { crmActionScenarios } from "./crm-action";
import { displayToolsScenarios } from "./display-tools";
import type { Env } from "./env";
import { exportScenarios } from "./export";
import { foldersHeightScenarios } from "./folders-height";
import { linkMenuScenarios } from "./link-menu";
import { newContentMenuScenarios } from "./new-content-menu";
import { noteScenarios } from "./notes";
import { searchScenarios } from "./search";
import { settingsScenarios } from "./settings";
import { tagFieldScenarios } from "./tag-field";
import { workspaceSwitcherScenarios } from "./workspace-switcher";

export function scenariosFor(env: Env): Scenario[] {
  return [
    ...canvasScenariosFor(env),
    ...exportScenarios(env),
    ...noteScenarios(env),
    ...crmScenarios(env),
    ...crmTabsScenarios(env),
    ...crmActionScenarios(env),
    ...newContentMenuScenarios(env),
    ...linkMenuScenarios(env),
    ...tagFieldScenarios(env),
    ...settingsScenarios(env),
    ...displayToolsScenarios(),
    ...workspaceSwitcherScenarios(env),
    ...foldersHeightScenarios(),
    ...searchScenarios(env),
  ];
}
