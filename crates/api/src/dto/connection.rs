//! Données de « Brancher une IA » échangées avec l'interface (fiche 0056).

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Où en est le branchement : sans clé de branchement, rien à montrer qu'un bouton pour en créer
/// une.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionInfo {
    /// La clé de branchement qui existe, s'il y en a une.
    pub key: Option<ConnectionKeyItem>,
}

/// La clé de branchement, et ce qu'il faut coller dans une IA extérieure pour la brancher.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct ConnectionKeyItem {
    /// Le secret de la clé, que l'utilisateur peut copier.
    pub secret: String,
    /// Le jour de sa création, en toutes lettres : `25 novembre 2026`.
    pub created_on: String,
    /// Le bloc de configuration pour Claude (extension VS Code, Claude Code hors de l'application).
    pub claude_config: String,
    /// Le bloc de configuration pour Codex.
    pub codex_config: String,
}

/// Un espace de travail de l'utilisateur et sa case « autorisé pour les IA » (fiche 0074).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct AiWorkspaceItem {
    /// Le nom de l'espace de travail.
    pub name: String,
    /// Vrai quand l'utilisateur l'a coché : les IA branchées le voient et peuvent le viser.
    pub allowed: bool,
}
