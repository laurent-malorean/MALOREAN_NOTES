//! Garde-fou du web (fiche 0032) : une fois que Claude a lu le web pendant un tour, ses créations
//! et modifications de fichiers sont retenues jusqu'à l'accord de l'utilisateur, car une page web
//! lue pourrait cacher des instructions. Deux crochets de Claude Code, passés pour ce seul tour par
//! `--settings`, le font : avant toute recherche ou lecture
//! web, le premier pose une marque dans un dossier jetable du tour ; avant toute création ou
//! modification, le second la cherche et, s'il la trouve, refuse l'action. Les sous-agents passent
//! par les mêmes crochets, et les outils de l'application qui changent une note aussi.

use std::io;
use std::path::{Path, PathBuf};

use domain::app_tools::AppTool;
use serde_json::json;
use tempfile::TempDir;

/// Ce que Claude lit quand le garde-fou retient une création ou une modification ; l'adaptateur
/// reconnaît une modification retenue à ce texte dans l'issue de l'action.
pub(crate) const HELD_BACK: &str = "MALOREAN Notes a retenu cette modification : du web a été \
     lu pendant cette réponse, et une page pourrait cacher des instructions. Ne la faites pas \
     autrement : dites en une phrase ce que vous vouliez modifier ; l’utilisateur peut \
     l’autoriser d’un clic.";

/// Les outils qui lisent le web.
const WEB_TOOLS: &str = "WebSearch|WebFetch";

/// Les outils de Claude Code qui créent ou modifient un fichier.
const FILE_CHANGE_TOOLS: &str = "Write|Edit";

/// Les outils qui créent ou modifient une note : ceux de Claude Code pour les fichiers, et ceux
/// de l'application qui créent, changent, déplacent ou jettent une note (fiche 0040).
fn change_tools() -> String {
    AppTool::ALL
        .iter()
        .filter(|tool| tool.changes_notes())
        .fold(FILE_CHANGE_TOOLS.to_owned(), |tools, tool| {
            format!("{tools}|{}", tool.full_name())
        })
}

/// Le garde-fou d'un tour : son dossier jetable, effacé avec lui à la fin du tour.
#[derive(Debug)]
pub(crate) struct WebGuard {
    folder: TempDir,
}

/// `text` entre apostrophes pour le shell, qui le prend tel quel.
fn quoted(text: &str) -> String {
    format!("'{}'", text.replace('\'', r"'\''"))
}

impl WebGuard {
    /// Un garde-fou neuf, dont le dossier est rangé dans les fichiers temporaires.
    pub(crate) fn new() -> io::Result<Self> {
        Self::within(&std::env::temp_dir())
    }

    /// Un garde-fou neuf, dont le dossier est rangé dans `parent`.
    pub(crate) fn within(parent: &Path) -> io::Result<Self> {
        let folder = tempfile::Builder::new()
            .prefix("malorean-web-guard-")
            .tempdir_in(parent)?;
        Ok(Self { folder })
    }

    /// La marque posée à la première lecture du web.
    fn mark(&self) -> PathBuf {
        self.folder.path().join("web-read")
    }

    /// Les réglages de Claude Code qui posent les deux crochets, pour `--settings`.
    pub(crate) fn settings(&self) -> String {
        let mark = quoted(&self.mark().display().to_string());
        let refusal = json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": HELD_BACK,
            }
        });
        let refuse = quoted(&refusal.to_string());
        json!({
            "hooks": {
                "PreToolUse": [
                    {
                        "matcher": WEB_TOOLS,
                        "hooks": [{ "type": "command", "command": format!("touch {mark}") }],
                    },
                    {
                        "matcher": change_tools(),
                        "hooks": [{
                            "type": "command",
                            "command": format!("if [ -e {mark} ]; then printf '%s' {refuse}; fi"),
                        }],
                    },
                ]
            }
        })
        .to_string()
    }
}

#[cfg(test)]
#[path = "web_guard_tests.rs"]
mod tests;
