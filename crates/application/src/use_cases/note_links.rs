//! Suivre les liens entre notes : ouvrir la note qu'un `[[titre]]` désigne, et trouver les
//! notes qui pointent vers une note.

use domain::crm::action_links;
use domain::links::{links_to, same_title};
use domain::title::displayed_title_of_note;
use domain::{ContentType, Folder, Modified, NotePath, NoteSummary};

use crate::{AppError, NoteStore, StoredNote};

/// Une note dont un lien désigne la note ouverte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkingNote {
    /// Le dossier et le nom de fichier de la note.
    pub path: NotePath,
    /// Le titre affiché.
    pub title: String,
    /// La date de dernière modification.
    pub modified: Modified,
    /// Son type de contenu : le CRM et ses fiches se distinguent d'une note.
    pub content_type: ContentType,
    /// Pour une fiche d'un CRM, le chemin de son CRM.
    pub container: Option<NotePath>,
}

/// Vrai si la note de texte `content` a un lien vers la note de titre `title` : une action du CRM
/// n'en a que par ses notes liées, sa description et ses commentaires (spécification du CRM,
/// § 12), les autres notes par tout leur texte.
fn links_title(content: &str, title: &str) -> bool {
    match action_links(content) {
        Some(titles) => titles.iter().any(|linked| same_title(linked, title)),
        None => links_to(content, title),
    }
}

/// Les liens entre les notes de l'espace de travail.
///
/// Comme la recherche, chaque demande relit toutes les notes (fiche de décision 0016).
#[derive(Debug)]
pub struct NoteLinks<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> NoteLinks<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Toutes les notes, la plus récemment modifiée en premier.
    fn all_notes(&self) -> Result<Vec<StoredNote>, AppError> {
        let mut notes = Vec::new();
        for folder in std::iter::once(Folder::root()).chain(self.store.folders()?) {
            notes.extend(self.store.list(&folder)?);
        }
        // Tri stable : à date égale, l'ordre des dossiers est gardé.
        notes.sort_by_key(|note| std::cmp::Reverse(note.modified));
        Ok(notes)
    }

    /// La note désignée par `[[title]]` : celle qui porte ce titre ; la plus récente si
    /// plusieurs le portent ; aucune si aucune ne le porte.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'espace de travail ne peut pas être lue.
    pub fn resolve(&self, title: &str) -> Result<Option<NotePath>, AppError> {
        Ok(self
            .all_notes()?
            .into_iter()
            .find(|note| {
                same_title(
                    &displayed_title_of_note(&note.content, note.path.name()),
                    title,
                )
            })
            .map(|note| note.path))
    }

    /// Les liens entrants de la note `path` : les autres notes dont un lien désigne son titre,
    /// la plus récente en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si la note n'existe pas, [`AppError::StorageUnavailable`]
    /// si l'espace de travail ne peut pas être lue.
    pub fn backlinks(&self, path: &NotePath) -> Result<Vec<LinkingNote>, AppError> {
        let title = displayed_title_of_note(&self.store.read(path)?.content, path.name());
        Ok(self
            .all_notes()?
            .into_iter()
            .filter(|note| note.path != *path && links_title(&note.content, &title))
            .map(|note| {
                let summary = NoteSummary::new(note.path.clone(), &note.content, note.modified);
                LinkingNote {
                    title: displayed_title_of_note(&note.content, note.path.name()),
                    content_type: summary.content_type(),
                    container: summary.container().cloned(),
                    path: note.path,
                    modified: note.modified,
                }
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn resolved(store: &InMemoryNoteStore, title: &str) -> Option<String> {
        NoteLinks::new(store)
            .resolve(title)
            .unwrap()
            .map(|p| p.to_path())
    }

    fn backlinks(store: &InMemoryNoteStore, note: &str) -> Vec<String> {
        NoteLinks::new(store)
            .backlinks(&path(note))
            .unwrap()
            .into_iter()
            .map(|n| format!("{} | {}", n.path.to_path(), n.title))
            .collect()
    }

    #[test]
    fn a_link_in_a_node_links_the_map_and_a_link_to_a_map_resolves_to_it() {
        let store = InMemoryNoteStore::with_notes(&[
            (
                "Idees/carte.md",
                "---\ntype: carte-mentale\n---\n# Ma carte\n\n- Idée\n  > voir [[Courses]]\n- [[Autre]]\n",
            ),
            ("courses.md", "# Courses"),
            ("autre.md", "# Autre\nrenvoie à [[Ma carte]]"),
        ]);
        assert_eq!(
            backlinks(&store, "courses.md"),
            ["Idees/carte.md | Ma carte"]
        );
        assert_eq!(backlinks(&store, "autre.md"), ["Idees/carte.md | Ma carte"]);
        assert_eq!(backlinks(&store, "Idees/carte.md"), ["autre.md | Autre"]);
        assert_eq!(
            resolved(&store, "ma carte").as_deref(),
            Some("Idees/carte.md")
        );
    }

    #[test]
    fn an_action_links_the_notes_it_lists_or_quotes_but_not_the_files_it_refers_to() {
        let store = InMemoryNoteStore::with_notes(&[
            (
                "c/actions/2026-11-24-devis.md",
                "---\ntype: crm-action\npersonnes: ['[[jean-dupont]] · [[acme]]']\nprojet: '[[refonte]]'\nnotes: ['[[Cahier des charges]]']\n---\n# Devis\n\nVoir [[Plan]].\n\n#### Commentaires\n- 2026-11-24 10:32 · Vu [[Compte rendu]].\n",
            ),
            ("cahier.md", "# Cahier des charges"),
            ("plan.md", "# Plan"),
            ("cr.md", "# Compte rendu"),
            ("acme.md", "# Acme"),
            ("refonte.md", "# Refonte"),
            ("jean.md", "# Jean-Dupont"),
        ]);
        for linked in ["cahier.md", "plan.md", "cr.md"] {
            assert_eq!(
                backlinks(&store, linked),
                ["c/actions/2026-11-24-devis.md | Devis"],
                "{linked}"
            );
        }
        for referred in ["acme.md", "refonte.md", "jean.md"] {
            assert!(backlinks(&store, referred).is_empty(), "{referred}");
        }
    }

    #[test]
    fn a_linking_note_says_its_type_and_the_crm_of_a_card() {
        let store = InMemoryNoteStore::with_notes(&[
            ("cahier.md", "# Cahier des charges"),
            (
                "c/actions/devis.md",
                "---\ntype: crm-action\nnotes: ['[[Cahier des charges]]']\n---\n# Devis",
            ),
            ("autre.md", "# Autre\n[[Cahier des charges]]"),
        ]);
        let linking = NoteLinks::new(&store)
            .backlinks(&path("cahier.md"))
            .unwrap();
        let described: Vec<_> = linking
            .iter()
            .map(|note| {
                (
                    note.path.to_path(),
                    note.content_type,
                    note.container.as_ref().map(NotePath::to_path),
                )
            })
            .collect();
        assert_eq!(described.len(), 2);
        assert!(described.contains(&("autre.md".to_owned(), ContentType::Note, None)));
        assert!(described.contains(&(
            "c/actions/devis.md".to_owned(),
            ContentType::CrmAction,
            Some("c.md".to_owned())
        )));
    }

    #[test]
    fn a_link_leads_to_the_note_with_that_title_in_any_folder() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Agenda"),
            ("Cuisine/crepes.md", "# Recette de crêpes\nfarine"),
        ]);
        assert_eq!(
            resolved(&store, "recette de crepes").as_deref(),
            Some("Cuisine/crepes.md")
        );
    }

    #[test]
    fn the_most_recent_note_wins_when_several_share_the_title() {
        let store =
            InMemoryNoteStore::with_notes(&[("a.md", "# Courses"), ("Vieux/b.md", "# Courses")]);
        assert_eq!(resolved(&store, "Courses").as_deref(), Some("Vieux/b.md"));
    }

    #[test]
    fn a_link_to_a_missing_title_leads_nowhere() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# Agenda")]);
        assert_eq!(resolved(&store, "Courses"), None);
    }

    #[test]
    fn backlinks_are_the_other_notes_linking_to_the_title_most_recent_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("courses.md", "# Courses\n[[Courses]] elle-même"),
            ("a.md", "# Lundi\nacheter, voir [[courses]]"),
            ("Travail/b.md", "# Réunion\nrien à voir avec Courses"),
            ("Travail/c.md", "# Mardi\n[[Courses|la liste]]"),
        ]);
        assert_eq!(
            backlinks(&store, "courses.md"),
            ["Travail/c.md | Mardi", "a.md | Lundi"]
        );
    }

    #[test]
    fn backlinks_of_a_missing_note_are_refused() {
        let store = InMemoryNoteStore::with_notes(&[]);
        assert!(matches!(
            NoteLinks::new(&store).backlinks(&path("absente.md")),
            Err(AppError::NoteNotFound(_))
        ));
    }
}
