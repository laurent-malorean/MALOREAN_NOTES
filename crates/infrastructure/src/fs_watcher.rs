//! Surveillance du dossier de la bibliothèque sur disque (FSEvents sur le Mac).

use std::fs;
use std::path::{Component, Path};
use std::sync::Mutex;
use std::time::Duration;

use application::{
    ChangeListener, LibraryChange, LibraryLocation, LibraryWatcher, StoreError, Watching,
};
use domain::NotePath;
use notify_debouncer_mini::notify::{RecommendedWatcher, RecursiveMode};
use notify_debouncer_mini::{DebounceEventResult, Debouncer, new_debouncer};

/// Les changements qui se suivent de près sont annoncés ensemble.
const GROUPING_DELAY: Duration = Duration::from_millis(300);
const HIDDEN_PREFIX: &str = ".";
const ATTACHMENT_SUFFIX: &str = ".assets";

/// Surveille les bibliothèques sur disque.
#[derive(Debug)]
pub struct FsLibraryWatcher;

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

impl LibraryWatcher for FsLibraryWatcher {
    fn watch(
        &self,
        location: &LibraryLocation,
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
                        if let Some(change) = library_change(&announced_root, paths) {
                            listener(change);
                        }
                    }
                    Err(error) => tracing::warn!(%error, "surveillance de la bibliothèque"),
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
/// dossiers de pièces jointes, chemins hors de la bibliothèque.
fn library_change<'a>(root: &Path, paths: impl Iterator<Item = &'a Path>) -> Option<LibraryChange> {
    let mut relevant = false;
    let mut notes: Vec<NotePath> = Vec::new();
    for path in paths {
        let Some(parts) = library_parts(root, path) else {
            continue;
        };
        relevant = true;
        if let Ok(note) = NotePath::parse(&parts.join("/"))
            && !notes.contains(&note)
        {
            notes.push(note);
        }
    }
    relevant.then_some(LibraryChange { notes })
}

/// Les éléments du chemin depuis la racine, s'il compte pour la bibliothèque.
fn library_parts(root: &Path, path: &Path) -> Option<Vec<String>> {
    let relative = path.strip_prefix(root).ok()?;
    let parts: Vec<String> = relative
        .components()
        .map(|component| match component {
            Component::Normal(name) => name.to_string_lossy().into_owned(),
            _ => HIDDEN_PREFIX.to_owned(),
        })
        .collect();
    let ignored = parts.is_empty()
        || parts
            .iter()
            .any(|part| part.starts_with(HIDDEN_PREFIX) || part.ends_with(ATTACHMENT_SUFFIX));
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
        library_change(&root, paths.iter().map(PathBuf::as_path))
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
    fn hidden_files_trash_and_attachments_are_ignored() {
        assert_eq!(
            change(&[
                "/Users/moi/Notes/.a.md.enregistrement",
                "/Users/moi/Notes/.trash/a.md",
                "/Users/moi/Notes/voyage.assets/mer.png",
                "/Users/moi/Notes/voyage.assets",
                "/Users/moi/Notes",
                "/Users/moi/Autre/a.md",
                "/Users/moi/Notes/../Autre/a.md",
            ]),
            None
        );
    }
}
