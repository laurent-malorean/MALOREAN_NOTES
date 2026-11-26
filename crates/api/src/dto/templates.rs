//! Le dossier des modèles que l'interface gardait avant la fiche 0077, à reprendre.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Un dossier des modèles que l'interface avait gardé : le dossier de l'espace de travail sur le
/// disque, tel que l'interface le connaît, et le dossier des modèles depuis sa racine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct TemplatesFolderItem {
    /// Le dossier de l'espace de travail sur le disque.
    pub location: String,
    /// Le dossier des modèles, depuis la racine de l'espace (`Perso/Modèles`).
    pub folder: String,
}
