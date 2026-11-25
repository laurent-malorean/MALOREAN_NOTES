// Essai de l'application réelle (fiche 0054) : les scénarios, dans l'ordre où ils se jouent. Les cinq premiers
// partagent l'espace de travail `notes` (le canvas fait par le premier sert aux deux suivants) ; le dernier
// ouvre l'espace de travail `recherche`.
import type { Scenario } from "../runner";
import { canvasScenariosFor } from "./canvas";
import { crmScenarios } from "./crm";
import { crmTabsScenarios } from "./crm-tabs";
import { crmActionScenarios } from "./crm-action";
import type { Env } from "./env";
import { exportScenarios } from "./export";
import { newContentMenuScenarios } from "./new-content-menu";
import { noteScenarios } from "./notes";
import { searchScenarios } from "./search";

export function scenariosFor(env: Env): Scenario[] {
  return [
    ...canvasScenariosFor(env),
    ...exportScenarios(env),
    ...noteScenarios(env),
    ...crmScenarios(env),
    ...crmTabsScenarios(env),
    ...crmActionScenarios(env),
    ...newContentMenuScenarios(env),
    ...searchScenarios(env),
  ];
}
