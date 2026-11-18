//! Les pièces jointes des notes de l'espace de travail ouvert, vues depuis la page.

use application::use_cases::{AttachFile, AttachmentSource, OpenAttachment};
use domain::NotePath;

use super::Session;
use crate::{ApiError, AttachedFile};

impl Session {
    /// Joint un fichier collé ou glissé à la note ; rend le lien Markdown à insérer.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, fichier trop
    /// gros, ni image ni PDF, note absente, stockage indisponible, aucun espace de travail ouvert.
    pub fn attach_file(
        &self,
        path: &str,
        source: AttachmentSource<'_>,
        bytes: &[u8],
    ) -> Result<AttachedFile, ApiError> {
        let store = self.store()?;
        let markdown = AttachFile::new(&*store, &*self.clock).execute(
            &NotePath::parse(path)?,
            source,
            bytes,
        )?;
        Ok(AttachedFile { markdown })
    }

    /// Où se trouve la pièce jointe visée par la cible d'un lien de la note, pour l'ouvrir.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, lien qui ne vise
    /// pas une pièce jointe de la note, pièce jointe absente, aucun espace de travail ouvert.
    pub fn attachment_location(&self, path: &str, target: &str) -> Result<String, ApiError> {
        let store = self.store()?;
        let location = OpenAttachment::new(&*store).execute(&NotePath::parse(path)?, target)?;
        Ok(location.as_str().to_owned())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::WorkspaceLocation;
    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;

    fn opened(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session
            .open_workspace(WorkspaceLocation::new("/Users/moi/Notes").unwrap())
            .unwrap();
        session
    }

    #[test]
    fn a_pasted_image_is_linked_with_the_moment_of_the_clock() {
        let session = opened(&[("voyage.md", "# Voyage")]);
        let pasted = AttachmentSource::Pasted {
            media_type: "image/png",
        };
        let attached = session.attach_file("voyage.md", pasted, b"x").unwrap();
        assert_eq!(
            attached.markdown,
            "![](voyage.assets/image-2026-11-16-1830.png)"
        );
    }

    #[test]
    fn an_attached_pdf_can_be_located_from_its_link() {
        let session = opened(&[("voyage.md", "# Voyage")]);
        let dropped = AttachmentSource::Dropped {
            file_name: "billet.pdf",
        };
        session.attach_file("voyage.md", dropped, b"x").unwrap();
        let location = session
            .attachment_location("voyage.md", "voyage.assets/billet.pdf")
            .unwrap();
        assert_eq!(location, "mémoire://voyage.md/billet.pdf");
    }

    #[test]
    fn refusals_reach_the_page_as_messages() {
        let session = opened(&[("voyage.md", "# Voyage")]);
        let dropped = AttachmentSource::Dropped { file_name: "a.txt" };
        let refused = session.attach_file("voyage.md", dropped, b"x").unwrap_err();
        assert!(
            refused.message.contains("« a.txt » ne peut pas être joint"),
            "{refused:?}"
        );
        let invalid = session.attach_file("../x.md", dropped, b"x").unwrap_err();
        assert_eq!(invalid.message, "nom de note invalide : « ../x.md »");
        let elsewhere = session
            .attachment_location("voyage.md", "../secret.pdf")
            .unwrap_err();
        assert_eq!(
            elsewhere.message,
            "« ../secret.pdf » n'est pas une pièce jointe de la note"
        );
    }
}
