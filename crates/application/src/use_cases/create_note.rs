//! Créer une note : vide, depuis un modèle, ou la note du jour du journal.

use domain::journal::{daily_note, daily_note_name};
use domain::saving::{created_note_name, new_note_name};
use domain::template::{note_from_template, titled_note_from_template};
use domain::{Folder, NotePath};

use crate::{AppError, Clock, NoteStore};

/// Une nouvelle note vide, sans titre, qui n'écrase aucune autre note.
#[derive(Debug)]
pub struct CreateNote<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin de la note créée dans `folder`.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder) -> Result<NotePath, AppError> {
        let existing = self.store.names(folder)?;
        let note = NotePath::new(folder.clone(), new_note_name(&existing));
        self.store.write(&note, "")?;
        Ok(note)
    }

    /// Le chemin de la note créée dans `folder` avec le texte `content`, sous le nom tiré de son
    /// titre (avec le premier suffixe libre si ce nom est pris).
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn with_content(&self, folder: &Folder, content: &str) -> Result<NotePath, AppError> {
        let existing = self.store.names(folder)?;
        let note = NotePath::new(folder.clone(), created_note_name(content, &existing));
        self.store.write(&note, content)?;
        Ok(note)
    }
}

/// Une nouvelle note tirée d'un modèle : son texte, variables remplacées, sous le nom de son titre.
#[derive(Debug)]
pub struct CreateNoteFromTemplate<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CreateNoteFromTemplate<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le chemin de la note créée dans `folder` depuis le modèle `template`.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si le modèle n'existe plus ;
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, template: &NotePath, folder: &Folder) -> Result<NotePath, AppError> {
        let content = note_from_template(&self.store.read(template)?.content, &self.clock.now());
        CreateNote::new(self.store).with_content(folder, &content)
    }

    /// Le chemin de la note titrée `title` créée dans `folder` depuis le modèle `template` :
    /// `{{title}}` et son titre `#` prennent `title`.
    ///
    /// # Errors
    ///
    /// Les mêmes que [`Self::execute`].
    pub fn titled(
        &self,
        template: &NotePath,
        folder: &Folder,
        title: &str,
    ) -> Result<NotePath, AppError> {
        let template = self.store.read(template)?.content;
        let content = titled_note_from_template(&template, &self.clock.now(), title);
        CreateNote::new(self.store).with_content(folder, &content)
    }
}

/// La note du jour dans le journal : créée si elle n'existe pas encore, jamais en double.
#[derive(Debug)]
pub struct CreateDailyNote<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> CreateDailyNote<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le chemin de la note du jour dans le dossier `journal`, créé au besoin avec ses parents.
    /// Si elle existe, elle est gardée telle quelle ; sinon elle est écrite depuis `template`,
    /// ou avec son seul titre.
    ///
    /// # Errors
    ///
    /// [`AppError::NoteNotFound`] si le modèle n'existe plus ;
    /// [`AppError::StorageUnavailable`] si le journal ne peut pas être créé, lu ou écrit.
    pub fn execute(
        &self,
        journal: &Folder,
        template: Option<&NotePath>,
    ) -> Result<NotePath, AppError> {
        let now = self.clock.now();
        let note = NotePath::new(journal.clone(), daily_note_name(&now));
        self.create_folders(journal)?;
        if self.store.names(journal)?.contains(note.name()) {
            return Ok(note);
        }
        let template = template.map(|path| self.store.read(path)).transpose()?;
        let content = daily_note(template.as_ref().map(|t| t.content.as_str()), &now);
        self.store.write(&note, &content)?;
        Ok(note)
    }

    /// Crée `folder` et ceux qui le contiennent, s'ils n'existent pas encore.
    fn create_folders(&self, folder: &Folder) -> Result<(), AppError> {
        let existing = self.store.folders()?;
        let mut current = Folder::root();
        for name in folder.names() {
            current = current.join(name.clone());
            if !existing.contains(&current) {
                self.store.create_folder(&current)?;
            }
        }
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{FixedClock, InMemoryNoteStore};

    #[test]
    fn a_note_with_content_is_named_after_its_title_without_taking_a_name() {
        let store = InMemoryNoteStore::with_notes(&[("Travail/plan.md", "# Plan")]);
        let folder = Folder::parse("Travail").unwrap();
        let creating = CreateNote::new(&store);
        let created = creating.with_content(&folder, "# Plan\ntexte").unwrap();
        assert_eq!(created.to_path(), "Travail/plan-2.md");
        assert_eq!(store.read(&created).unwrap().content, "# Plan\ntexte");
        assert_eq!(
            creating
                .with_content(&Folder::root(), "")
                .unwrap()
                .to_path(),
            "sans-titre.md"
        );
    }

    #[test]
    fn a_titled_note_from_a_template_takes_the_title_given() {
        let store =
            InMemoryNoteStore::with_notes(&[("Modèles/r.md", "# Réunion du {{date}}\n{{title}}")]);
        let template = NotePath::parse("Modèles/r.md").unwrap();
        let created = CreateNoteFromTemplate::new(&store, &FixedClock::default())
            .titled(&template, &Folder::root(), "Point équipe")
            .unwrap();
        assert_eq!(created.to_path(), "point-equipe.md");
        assert_eq!(
            store.read(&created).unwrap().content,
            "# Point équipe\nPoint équipe"
        );
    }

    #[test]
    fn new_note_is_an_empty_untitled_file() {
        let store = InMemoryNoteStore::default();
        let name = CreateNote::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(name.to_path(), "sans-titre.md");
        assert_eq!(store.read(&name).unwrap().content, "");
    }

    fn from_template(store: &InMemoryNoteStore, template: &str, folder: &str) -> NotePath {
        let clock = FixedClock::default();
        CreateNoteFromTemplate::new(store, &clock)
            .execute(
                &NotePath::parse(template).unwrap(),
                &Folder::parse(folder).unwrap(),
            )
            .unwrap()
    }

    #[test]
    fn a_note_from_a_template_is_named_after_its_title_in_the_folder() {
        let store = InMemoryNoteStore::with_notes(&[
            (
                "Modèles/reunion.md",
                "---\ntags: [a]\npinned: true\n---\n# Réunion du {{date}}\n{{time}}",
            ),
            ("Travail/budget.md", "# Budget"),
        ]);
        let created = from_template(&store, "Modèles/reunion.md", "Travail");
        assert_eq!(created.to_path(), "Travail/reunion-du-16-novembre-2026.md");
        assert_eq!(
            store.read(&created).unwrap().content,
            "---\ntags: [a]\n---\n# Réunion du 16 novembre 2026\n18:30"
        );
    }

    #[test]
    fn a_note_from_a_template_never_overwrites_another_note() {
        let store = InMemoryNoteStore::with_notes(&[
            ("Modèles/journal.md", "# Journal"),
            ("journal.md", "garde-moi"),
        ]);
        let created = from_template(&store, "Modèles/journal.md", "");
        assert_eq!(created.to_path(), "journal-2.md");
        let kept = NotePath::parse("journal.md").unwrap();
        assert_eq!(store.read(&kept).unwrap().content, "garde-moi");
    }

    #[test]
    fn a_missing_template_creates_nothing() {
        let store = InMemoryNoteStore::default();
        let clock = FixedClock::default();
        let missing = NotePath::parse("Modèles/absent.md").unwrap();
        let result = CreateNoteFromTemplate::new(&store, &clock).execute(&missing, &Folder::root());
        assert!(result.is_err());
        assert!(store.names(&Folder::root()).unwrap().is_empty());
    }

    #[test]
    fn new_note_never_overwrites_another_untitled_note() {
        let store = InMemoryNoteStore::with_notes(&[("sans-titre.md", "garde-moi")]);
        let name = CreateNote::new(&store).execute(&Folder::root()).unwrap();
        assert_eq!(name.to_path(), "sans-titre-2.md");
        let kept = NotePath::parse("sans-titre.md").unwrap();
        assert_eq!(store.read(&kept).unwrap().content, "garde-moi");
    }

    fn daily(store: &InMemoryNoteStore, folder: &str, template: Option<&str>) -> NotePath {
        let template = template.map(|path| NotePath::parse(path).unwrap());
        CreateDailyNote::new(store, &FixedClock::default())
            .execute(&Folder::parse(folder).unwrap(), template.as_ref())
            .unwrap()
    }

    #[test]
    fn the_daily_note_is_created_in_the_journal_under_its_date() {
        let store = InMemoryNoteStore::default();
        let created = daily(&store, "Perso/Journal", None);
        assert_eq!(created.to_path(), "Perso/Journal/2026-11-16.md");
        assert_eq!(
            store.read(&created).unwrap().content,
            "# 16 novembre 2026\n"
        );
        let folders = store.folders().unwrap();
        assert!(folders.contains(&Folder::parse("Perso/Journal").unwrap()));
    }

    #[test]
    fn the_daily_note_is_created_from_the_journal_template() {
        let store =
            InMemoryNoteStore::with_notes(&[("Modèles/journal.md", "# Journal\n## {{time}}\n")]);
        let created = daily(&store, "Journal", Some("Modèles/journal.md"));
        assert_eq!(
            store.read(&created).unwrap().content,
            "# 16 novembre 2026\n## 18:30\n"
        );
    }

    #[test]
    fn an_existing_daily_note_is_kept_as_it_is() {
        let store = InMemoryNoteStore::with_notes(&[("Journal/2026-11-16.md", "écrit ce matin")]);
        let created = daily(&store, "Journal", None);
        assert_eq!(created.to_path(), "Journal/2026-11-16.md");
        assert_eq!(store.read(&created).unwrap().content, "écrit ce matin");
        assert_eq!(store.names(created.folder()).unwrap().len(), 1);
    }

    #[test]
    fn a_missing_journal_template_creates_nothing() {
        let store = InMemoryNoteStore::default();
        let missing = NotePath::parse("Modèles/absent.md").unwrap();
        let result = CreateDailyNote::new(&store, &FixedClock::default())
            .execute(&Folder::parse("Journal").unwrap(), Some(&missing));
        assert!(result.is_err());
        let journal = Folder::parse("Journal").unwrap();
        assert!(store.names(&journal).unwrap().is_empty());
    }
}
