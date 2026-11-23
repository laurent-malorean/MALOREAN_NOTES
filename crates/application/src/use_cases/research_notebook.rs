//! Cahier de recherche (fiche 0041) : en créer un, ajouter une entrée (jamais rien changer
//! d'autre), lister les entrées d'un cahier.

use domain::research_notebook::{Entry, RefusedEntry, entries, new_notebook, with_entry};
use domain::{ContentType, Folder, NotePath};

use crate::use_cases::CreateNote;
use crate::{AppError, Clock, NoteStore};

/// Un nouveau cahier de recherche, sans entrée, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateResearchNotebook<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateResearchNotebook<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin du cahier titré `title` créé dans `folder`, sous le nom tiré de son titre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        CreateNote::new(self.store).with_content(folder, &new_notebook(title))
    }
}

/// Une entrée ajoutée à la fin d'un cahier de recherche, à l'heure de l'horloge : le seul
/// changement qu'un cahier reçoit.
#[derive(Debug)]
pub struct AddEntry<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> AddEntry<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// L'entrée `text` ajoutée au cahier `notebook`. Rend l'entrée telle que le cahier l'écrit.
    ///
    /// # Errors
    ///
    /// [`AppError::EntryRefused`] si la note n'est pas un cahier, si l'entrée est vide ; [`AppError::NoteNotFound`] si le cahier n'existe pas ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, notebook: &NotePath, text: &str) -> Result<Entry, AppError> {
        let stored = self.store.read(notebook)?;
        let now = self.clock.now();
        let content = with_entry(&stored.content, &now, text)?;
        self.store.write(notebook, &content)?;
        entries(&content)
            .pop()
            .ok_or_else(|| unreachable!("le cahier a au moins l'entrée ajoutée"))
    }
}

/// Les entrées d'un cahier de recherche.
#[derive(Debug)]
pub struct ListEntries<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ListEntries<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Les entrées du cahier `notebook`, de la plus ancienne à la plus récente.
    ///
    /// # Errors
    ///
    /// [`AppError::EntryRefused`] si la note n'est pas un cahier ; [`AppError::NoteNotFound`]
    /// s'il n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, notebook: &NotePath) -> Result<Vec<Entry>, AppError> {
        let content = self.store.read(notebook)?.content;
        if ContentType::of(&content) != ContentType::ResearchNotebook {
            return Err(RefusedEntry::NotANotebook.into());
        }
        Ok(entries(&content))
    }
}

#[cfg(test)]
mod tests {
    use domain::Moment;

    use super::*;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn clock(hour: u32, minute: u32) -> FixedClock {
        FixedClock::at(Moment::new(2026, 11, 16, hour, minute).unwrap())
    }

    const NOTEBOOK: &str = "---\ntype: cahier-de-recherche\n---\n# Levures\n";

    #[test]
    fn a_notebook_is_created_under_the_name_of_its_title() {
        let store = InMemoryNoteStore::with_notes(&[("Labo/levures.md", "# Autre")]);
        let created = CreateResearchNotebook::new(&store)
            .execute(&Folder::parse("Labo").unwrap(), "Levures")
            .unwrap();
        assert_eq!(created, path("Labo/levures-2.md"));
        assert_eq!(store.read(&created).unwrap().content, NOTEBOOK);
    }

    #[test]
    fn an_entry_is_added_at_the_clock_time_and_given_back() {
        let store = InMemoryNoteStore::with_notes(&[("levures.md", NOTEBOOK)]);
        let at = clock(9, 42);
        let entry = AddEntry::new(&store, &at)
            .execute(&path("levures.md"), "Levure A")
            .unwrap();
        assert_eq!(entry.anchor(), "2026-11-16-09h42");
        assert_eq!(entry.text(), "Levure A");
        assert_eq!(
            store.read(&path("levures.md")).unwrap().content,
            format!("{NOTEBOOK}\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 09:42 - Levure A\n")
        );
    }

    #[test]
    fn an_entry_is_refused_by_a_note_that_is_not_a_notebook_and_nothing_is_written() {
        let store = InMemoryNoteStore::with_notes(&[("note.md", "# Note")]);
        let at = clock(9, 42);
        let add = AddEntry::new(&store, &at);
        assert_eq!(
            add.execute(&path("note.md"), "texte"),
            Err(AppError::EntryRefused(RefusedEntry::NotANotebook))
        );
        assert_eq!(
            add.execute(&path("absente.md"), "texte"),
            Err(AppError::NoteNotFound(path("absente.md")))
        );
        assert_eq!(store.read(&path("note.md")).unwrap().content, "# Note");
        assert_eq!(
            AppError::EntryRefused(RefusedEntry::Empty).to_string(),
            "l'entrée est vide"
        );
    }

    #[test]
    fn the_entries_of_a_notebook_are_listed_oldest_first_and_a_note_has_none() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", NOTEBOOK), ("note.md", "# Note")]);
        AddEntry::new(&store, &clock(9, 0))
            .execute(&path("a.md"), "un")
            .unwrap();
        AddEntry::new(&store, &clock(9, 5))
            .execute(&path("a.md"), "deux")
            .unwrap();
        let list = ListEntries::new(&store);
        let texts: Vec<String> = list
            .execute(&path("a.md"))
            .unwrap()
            .iter()
            .map(|e| e.text().to_owned())
            .collect();
        assert_eq!(texts, ["un", "deux"]);
        assert_eq!(
            list.execute(&path("note.md")),
            Err(AppError::EntryRefused(RefusedEntry::NotANotebook))
        );
    }
}
