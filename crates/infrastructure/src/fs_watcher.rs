//! Surveillance du dossier de l'espace de travail sur disque (FSEvents sur le Mac).

use std::fs;
use std::path::{Component, Path};
use std::sync::Mutex;
use std::time::Duration;

use application::{
    ChangeListener, StoreError, Watching, WorkspaceChange, WorkspaceLocation, WorkspaceWatcher,
};
use domain::{FolderName, NotePath};
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};

/// Les changements qui se suivent de près sont annoncés ensemble.
const GROUPING_DELAY: Duration = Duration::from_millis(300);
/// Remplace un élément de chemin qui n'est pas un nom (`..`) : un nom caché, donc ignoré.
const HIDDEN_PREFIX: &str = ".";

/// Surveille les espaces de travail sur disque.
#[derive(Debug)]
pub struct FsWorkspaceWatcher;

/// Une surveillance en cours ; la lâcher arrête d'écouter le disque.
/// Le verrou ne sert qu'à la partager entre fils.
struct FsWatching {
    _debouncer: Mutex<Debouncer<RecommendedWatcher>>,
}

impl std::fmt::Debug for FsWatching {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("FsWatching")
    }
}

impl Watching for FsWatching {}

impl WorkspaceWatcher for FsWorkspaceWatcher {
    fn watch(
        &self,
        location: &WorkspaceLocation,
        listener: ChangeListener,
    ) -> Result<Box<dyn Watching>, StoreError> {
        // Le disque annonce des chemins sans lien symbolique (/private/var et non /var).
        let root = fs::canonicalize(location.as_str()).map_err(unavailable)?;
        let announced_root = root.clone();
        let mut debouncer =
            new_debouncer(
                GROUPING_DELAY,
                move |result: DebounceEventResult| match result {
                    Ok(events) => {
                        let paths = events.iter().map(|event| event.path.as_path());
                        if let Some(change) = workspace_change(&announced_root, paths) {
                            listener(change);
                        }
                    }
                    Err(error) => tracing::warn!(%error, "surveillance de l'espace de travail"),
                },
            )
            .map_err(unavailable)?;
        debouncer
            .watcher()
            .watch(&root, RecursiveMode::Recursive)
            .map_err(unavailable)?;
        Ok(Box::new(FsWatching {
            _debouncer: Mutex::new(debouncer),
        }))
    }
}

/// Ce qu'il faut annoncer pour ces chemins changés ; rien s'ils sont tous à ignorer :
/// fichiers ou dossiers cachés (corbeille, fichiers d'enregistrement en cours),
/// dossiers de pièces jointes ou de dépendances, chemins hors de l'espace de travail.
fn workspace_change<'a>(
    root: &Path,
    paths: impl Iterator<Item = &'a Path>,
) -> Option<WorkspaceChange> {
    let mut relevant = false;
    let mut notes: Vec<NotePath> = Vec::new();
    for path in paths {
        let Some(parts) = workspace_parts(root, path) else {
            continue;
        };
        relevant = true;
        if let Ok(note) = NotePath::parse(&parts.join("/"))
            && !notes.contains(&note)
        {
            notes.push(note);
        }
    }
    relevant.then_some(WorkspaceChange { notes })
}

/// Les éléments du chemin depuis la racine, s'il compte pour l'espace de travail.
fn workspace_parts(root: &Path, path: &Path) -> Option<Vec<String>> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|component| match component {
            Component::Normal(name) => name.to_string_lossy().into_owned(),
            _ => HIDDEN_PREFIX.to_owned(),
        })
        .collect();
    // Les règles d'un nom de dossier sont celles de tout l'espace de travail : un élément
    // caché, de pièces jointes ou de dépendances met le chemin hors de l'espace.
    let ignored = parts.is_empty() || parts.iter().any(|part| FolderName::parse(part).is_err());
    (!ignored).then_some(parts)
}

fn unavailable(error: impl std::fmt::Display) -> StoreError {
    StoreError::Unavailable(format!("surveillance impossible : {error}"))
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use super::*;

    fn change(paths: &[&str]) -> Option<Vec<String>> {
        let root = PathBuf::from("/Users/moi/Notes");
        let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
        workspace_change(&root, paths.iter().map(PathBuf::as_path))
            .map(|c| c.notes.iter().map(NotePath::to_path).collect())
    }

    #[test]
    fn a_changed_note_is_announced_by_its_path() {
        assert_eq!(
            change(&["/Users/moi/Notes/Travail/lundi.md", "/Users/moi/Notes/a.md"]),
            Some(vec!["Travail/lundi.md".to_owned(), "a.md".to_owned()])
        );
    }

    #[test]
    fn a_note_changed_twice_is_announced_once() {
        assert_eq!(
            change(&["/Users/moi/Notes/a.md", "/Users/moi/Notes/a.md"]),
            Some(vec!["a.md".to_owned()])
        );
    }

    #[test]
    fn a_folder_change_is_announced_without_notes() {
        assert_eq!(change(&["/Users/moi/Notes/Travail"]), Some(vec![]));
    }

    #[test]
    fn hidden_files_trash_history_attachments_and_dependencies_are_ignored() {
        assert_eq!(
            change(&[
                "/Users/moi/Notes/.a.md.enregistrement",
                "/Users/moi/Notes/.trash/a.md",
                "/Users/moi/Notes/.history/a.md/2026-11-18 14h30.md",
                "/Users/moi/Notes/.trash/.history/b.md/2026-11-18 14h30.md",
                "/Users/moi/Notes/voyage.assets/mer.png",
                "/Users/moi/Notes/voyage.assets",
                "/Users/moi/Notes/Projet/node_modules/paquet/README.md",
                "/Users/moi/Notes/Projet/node_modules",
                "/Users/moi/Notes",
                "/Users/moi/Autre/a.md",
                "/Users/moi/Notes/../Autre/a.md",
            ]),
            None
        );
    }
}
