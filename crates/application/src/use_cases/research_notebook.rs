//! Cahier de recherche (fiche 0041) : en créer un, ajouter une entrée (jamais rien changer
//! d'autre), lister les cahiers de l'espace de travail et les entrées d'un cahier.

use domain::note::{NoteOrder, sorted};
use domain::research_notebook::{
    Entry, RefusedEntry, entries, new_notebook, with_correction, with_entry,
};
use domain::{ContentType, Folder, NotePath, NoteSummary};

use crate::use_cases::CreateNote;
use crate::{AppError, Clock, NoteIndex, NoteStore};

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

    /// L'entrée ajoutée au cahier `notebook` : `text`, ou, avec `corrected`, une correction de
    /// l'entrée de cette ancre. Rend l'entrée telle que le cahier l'écrit.
    ///
    /// # Errors
    ///
    /// [`AppError::EntryRefused`] si la note n'est pas un cahier, si l'entrée est vide ou si
    /// l'entrée à corriger n'y est pas ; [`AppError::NoteNotFound`] si le cahier n'existe pas ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        notebook: &NotePath,
        text: &str,
        corrected: Option<&str>,
    ) -> Result<Entry, AppError> {
        let stored = self.store.read(notebook)?;
        let now = self.clock.now();
        let content = match corrected {
            Some(anchor) => with_correction(&stored.content, &now, text, anchor),
            None => with_entry(&stored.content, &now, text),
        }?;
        self.store.write(notebook, &content)?;
        entries(&content)
            .pop()
            .ok_or_else(|| unreachable!("le cahier a au moins l'entrée ajoutée"))
    }
}

/// Les cahiers de recherche de l'espace de travail, et les entrées de chacun.
#[derive(Debug)]
pub struct ListResearchNotebooks<'a> {
    index: &'a dyn NoteIndex,
    store: &'a dyn NoteStore,
}

impl<'a> ListResearchNotebooks<'a> {
    /// Le cas d'usage, branché sur l'index et le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex, store: &'a dyn NoteStore) -> Self {
        Self { index, store }
    }

    /// Les cahiers de tout l'espace de travail, par titre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn notebooks(&self) -> Result<Vec<NoteSummary>, AppError> {
        let all = self.index.all_notes()?;
        let notebooks = all
            .into_iter()
            .filter(|note| note.content_type() == ContentType::ResearchNotebook)
            .collect();
        Ok(sorted(notebooks, NoteOrder::Title))
    }

    /// Les entrées du cahier `notebook`, de la plus ancienne à la plus récente.
    ///
    /// # Errors
    ///
    /// [`AppError::EntryRefused`] si la note n'est pas un cahier ; [`AppError::NoteNotFound`]
    /// s'il n'existe pas ; [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn entries(&self, notebook: &NotePath) -> Result<Vec<Entry>, AppError> {
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
    use crate::testing::{FixedClock, InMemoryNoteStore, indexed};

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
            .execute(&path("levures.md"), "Levure A", None)
            .unwrap();
        assert_eq!(entry.anchor(), "2026-11-16-09h42");
        assert_eq!(entry.text(), "Levure A");
        assert_eq!(
            store.read(&path("levures.md")).unwrap().content,
            format!("{NOTEBOOK}\n## 2026\n\n### Novembre\n\n#### Lundi 16\n\n- 09:42 - Levure A\n")
        );
    }

    #[test]
    fn a_correction_is_added_with_a_link_to_the_corrected_entry() {
        let store = InMemoryNoteStore::with_notes(&[("levures.md", NOTEBOOK)]);
        let notebook = path("levures.md");
        AddEntry::new(&store, &clock(9, 42))
            .execute(&notebook, "Levure A", None)
            .unwrap();
        let correction = AddEntry::new(&store, &clock(10, 0))
            .execute(&notebook, "Levure B", Some("2026-11-16-09h42"))
            .unwrap();
        assert_eq!(
            correction.text(),
            "Correction de [l'entrée du 16 novembre 2026 à 09:42](#2026-11-16-09h42) : Levure B"
        );
    }

    #[test]
    fn an_entry_is_refused_by_a_note_that_is_not_a_notebook_and_nothing_is_written() {
        let store = InMemoryNoteStore::with_notes(&[("note.md", "# Note")]);
        let at = clock(9, 42);
        let add = AddEntry::new(&store, &at);
        assert_eq!(
            add.execute(&path("note.md"), "texte", None),
            Err(AppError::EntryRefused(RefusedEntry::NotANotebook))
        );
        assert_eq!(
            add.execute(&path("absente.md"), "texte", None),
            Err(AppError::NoteNotFound(path("absente.md")))
        );
        assert_eq!(store.read(&path("note.md")).unwrap().content, "# Note");
        assert_eq!(
            AppError::EntryRefused(RefusedEntry::Empty).to_string(),
            "l'entrée est vide"
        );
    }

    #[test]
    fn notebooks_are_listed_by_title_and_their_entries_oldest_first() {
        let store = InMemoryNoteStore::with_notes(&[
            ("b.md", &NOTEBOOK.replace("Levures", "Bières")),
            ("a.md", NOTEBOOK),
            ("note.md", "# Note"),
        ]);
        let index = indexed(&store);
        let list = ListResearchNotebooks::new(&index, &store);
        let titles: Vec<String> = list
            .notebooks()
            .unwrap()
            .iter()
            .map(|n| n.title().to_owned())
            .collect();
        assert_eq!(titles, ["Bières", "Levures"]);
        AddEntry::new(&store, &clock(9, 0))
            .execute(&path("a.md"), "un", None)
            .unwrap();
        AddEntry::new(&store, &clock(9, 5))
            .execute(&path("a.md"), "deux", None)
            .unwrap();
        let texts: Vec<String> = list
            .entries(&path("a.md"))
            .unwrap()
            .iter()
            .map(|e| e.text().to_owned())
            .collect();
        assert_eq!(texts, ["un", "deux"]);
        assert_eq!(
            list.entries(&path("note.md")),
            Err(AppError::EntryRefused(RefusedEntry::NotANotebook))
        );
    }
}
