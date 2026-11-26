//! Les modèles de note de l'espace de travail ouvert, vus depuis l'interface.

use application::WorkspaceLocation;
use application::use_cases::CreateNoteFromTemplate;
use domain::{Folder, NotePath};

use super::Session;
use crate::{ApiError, SavedNote, TemplatesFolderItem};

impl Session {
    /// Le dossier des modèles de l'espace de travail ouvert (ou, pour un outil, de l'espace visé),
    /// s'il en a choisi un (fiche 0077) ; relu dans les préférences à chaque appel.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles, aucun espace
    /// de travail ouvert.
    pub fn templates_folder(&self) -> Result<Option<Folder>, ApiError> {
        let opened = self.opened()?;
        Ok(self.manage().templates_folder(&opened.name)?)
    }

    /// Choisit le dossier des modèles de l'espace de travail ouvert ; aucun pour `None` ou un nom
    /// vide (la racine ne peut pas être un dossier des modèles).
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; dossier invalide, préférences
    /// impossibles à écrire, aucun espace de travail ouvert.
    pub fn set_templates_folder(&self, folder: Option<&str>) -> Result<(), ApiError> {
        let folder = folder
            .filter(|path| !path.trim().is_empty())
            .map(Folder::parse)
            .transpose()?;
        let opened = self.opened()?;
        Ok(self
            .manage()
            .choose_templates_folder(&opened.name, folder)?)
    }

    /// Reprend les dossiers des modèles que l'interface gardait avant la fiche 0077 : chacun va à
    /// l'espace de travail qui a ce dossier sur le disque, sans écraser un choix déjà gardé. Un
    /// dossier invalide ou vide est ignoré. Rend le nombre d'espaces repris.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; préférences illisibles ou
    /// impossibles à écrire.
    pub fn import_templates_folders(
        &self,
        chosen: &[TemplatesFolderItem],
    ) -> Result<usize, ApiError> {
        let chosen: Vec<(WorkspaceLocation, Folder)> = chosen
            .iter()
            .filter_map(|item| {
                let folder = item.folder.trim();
                if folder.is_empty() {
                    return None;
                }
                Some((
                    WorkspaceLocation::new(&item.location).ok()?,
                    Folder::parse(folder).ok()?,
                ))
            })
            .collect();
        Ok(self.manage().import_templates_folders(&chosen)?)
    }

    /// Crée une note dans `folder` depuis le modèle `template` ; rend son chemin.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin ou dossier invalide,
    /// modèle absent, stockage indisponible, aucun espace de travail ouvert.
    pub fn create_note_from_template(
        &self,
        template: &str,
        folder: &str,
    ) -> Result<SavedNote, ApiError> {
        let store = self.store()?;
        let created = CreateNoteFromTemplate::new(&*store, &*self.clock)
            .execute(&NotePath::parse(template)?, &Folder::parse(folder)?)?;
        Ok(SavedNote {
            path: created.to_path(),
        })
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn session(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        )
    }

    #[test]
    fn a_note_is_created_from_a_template_in_the_folder() {
        let session = session(&[("Modèles/journal.md", "# Journal du {{date}}")]);
        assert!(
            session
                .create_note_from_template("Modèles/journal.md", "")
                .is_err()
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        let created = session
            .create_note_from_template("Modèles/journal.md", "Modèles")
            .unwrap();
        assert_eq!(created.path, "Modèles/journal-du-16-novembre-2026.md");
        assert_eq!(
            session.read_note(&created.path).unwrap().content,
            "# Journal du 16 novembre 2026"
        );
        assert!(session.create_note_from_template("../x.md", "").is_err());
        assert!(
            session
                .create_note_from_template("Modèles/journal.md", "../x")
                .is_err()
        );
    }
}
