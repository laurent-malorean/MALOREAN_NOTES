// Le CRM à l'écran (fiche 0060) : ce que l'interface sait d'une note CRM sans écran. Les règles
// (colonnes, ordre, retard, semaine) sont calculées par Rust ; ici, seulement ce qui se lit et se
// formate pour l'affichage.
import { declaredType } from "./declared-type";

/** La valeur de `type:` d'un CRM, comme Rust l'écrit. */
const CRM_TYPE = "crm";

/** La note est un CRM : son en-tête le déclare, comme Rust le lit (guillemets permis). */
export function isCrmContent(content: string): boolean {
  return declaredType(content) === CRM_TYPE;
}
