//! Joindre un fichier collé ou glissé à une note, et ouvrir une pièce jointe.

use domain::{AttachmentName, NotePath};

use crate::{AppError, AttachmentLocation, Clock, NoteStore};

/// Taille au-delà de laquelle un fichier n'est pas joint, en mégaoctets.
pub const MAX_ATTACHMENT_MEGABYTES: usize = 50;
const BYTES_PER_MEGABYTE: usize = 1024 * 1024;

/// D'où vient le fichier à joindre : son nom en dépend.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachmentSource<'a> {
    /// Collé depuis le presse-papiers (capture d'écran…) : seul son type est connu.
    Pasted {
        /// Le type du contenu, par exemple `image/png`.
        media_type: &'a str,
    },
    /// Glissé depuis le Finder : il garde son nom.
    Dropped {
        /// Le nom du fichier glissé.
        file_name: &'a str,
    },
}

/// Copie un fichier dans le dossier de pièces jointes d'une note et rend le lien à insérer.
#[derive(Debug)]
pub struct AttachFile<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> AttachFile<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le lien Markdown vers la pièce jointe écrite ; un nom pris reçoit le premier suffixe
    /// `-2`, `-3`… libre.
    ///
    /// # Errors
    ///
    /// [`AppError::AttachmentTooLarge`] au-delà de [`MAX_ATTACHMENT_MEGABYTES`],
    /// [`AppError::AttachmentRefused`] si ce n'est ni une image ni un PDF,
    /// [`AppError::NoteNotFound`] si la note n'existe pas,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(
        &self,
        note: &NotePath,
        source: AttachmentSource<'_>,
        bytes: &[u8],
    ) -> Result<String, AppError> {
        if bytes.len() > MAX_ATTACHMENT_MEGABYTES * BYTES_PER_MEGABYTE {
            return Err(AppError::AttachmentTooLarge {
                limit_megabytes: MAX_ATTACHMENT_MEGABYTES,
            });
        }
        let wanted = match source {
            AttachmentSource::Pasted { media_type } => {
                AttachmentName::pasted(media_type, &self.clock.now())
            }
            AttachmentSource::Dropped { file_name } => AttachmentName::dropped(file_name),
        }
        .map_err(AppError::AttachmentRefused)?;
        let existing = self.store.attachment_names(note)?;
        let name = wanted
            .deduplicated(|candidate| existing.iter().any(|taken| taken.same_file_as(candidate)));
        self.store.write_attachment(note, &name, bytes)?;
        Ok(name.markdown_link(note.name()))
    }
}

/// Retrouve la pièce jointe que vise un lien de la note, pour l'ouvrir.
#[derive(Debug)]
pub struct OpenAttachment<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> OpenAttachment<'a> {
    /// Le cas d'usage, branché sur la bibliothèque ouverte.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// L'emplacement de la pièce jointe visée par `target`, la cible d'un lien de la note.
    /// Seules les pièces jointes de la note s'ouvrent ainsi.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAnAttachment`] si le lien ne vise pas une pièce jointe de la note,
    /// [`AppError::AttachmentNotFound`] si elle n'existe pas,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, note: &NotePath, target: &str) -> Result<AttachmentLocation, AppError> {
        let name = AttachmentName::in_link(note.name(), target)
            .ok_or_else(|| AppError::NotAnAttachment(target.to_owned()))?;
        Ok(self.store.attachment_location(note, &name)?)
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

    fn clock() -> FixedClock {
        FixedClock::at(Moment::new(2026, 11, 16, 18, 30).unwrap())
    }

    fn attached(
        store: &InMemoryNoteStore,
        source: AttachmentSource<'_>,
    ) -> Result<String, AppError> {
        AttachFile::new(store, &clock()).execute(&path("voyage.md"), source, b"x")
    }

    #[test]
    fn a_pasted_screenshot_is_named_after_the_moment_and_linked() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let link = attached(
            &store,
            AttachmentSource::Pasted {
                media_type: "image/png",
            },
        );
        assert_eq!(
            link.unwrap(),
            "![](voyage.assets/image-2026-11-16-1830.png)"
        );
    }

    #[test]
    fn a_dropped_pdf_keeps_its_name_and_reads_as_a_link() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let link = attached(
            &store,
            AttachmentSource::Dropped {
                file_name: "Billet.pdf",
            },
        );
        assert_eq!(link.unwrap(), "[Billet.pdf](voyage.assets/Billet.pdf)");
    }

    #[test]
    fn a_taken_name_gets_the_first_free_suffix_whatever_its_case() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let photo = AttachmentSource::Dropped {
            file_name: "Photo.png",
        };
        attached(&store, photo).unwrap();
        let second = attached(
            &store,
            AttachmentSource::Dropped {
                file_name: "photo.PNG",
            },
        );
        assert_eq!(second.unwrap(), "![](voyage.assets/photo-2.png)");
    }

    #[test]
    fn other_files_are_refused() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let refused = attached(&store, AttachmentSource::Dropped { file_name: "a.txt" });
        assert!(matches!(refused, Err(AppError::AttachmentRefused(_))));
        let pasted = attached(
            &store,
            AttachmentSource::Pasted {
                media_type: "text/html",
            },
        );
        assert!(matches!(pasted, Err(AppError::AttachmentRefused(_))));
    }

    #[test]
    fn a_file_over_the_limit_is_refused_and_one_at_the_limit_is_kept() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let limit = MAX_ATTACHMENT_MEGABYTES * BYTES_PER_MEGABYTE;
        let source = AttachmentSource::Dropped { file_name: "a.png" };
        let too_big = AttachFile::new(&store, &clock()).execute(
            &path("voyage.md"),
            source,
            &vec![0; limit + 1],
        );
        assert_eq!(
            too_big,
            Err(AppError::AttachmentTooLarge {
                limit_megabytes: 50
            })
        );
        let at_limit =
            AttachFile::new(&store, &clock()).execute(&path("voyage.md"), source, &vec![0; limit]);
        assert!(at_limit.is_ok());
    }

    #[test]
    fn a_missing_note_gets_no_attachment() {
        let store = InMemoryNoteStore::default();
        let result = attached(&store, AttachmentSource::Dropped { file_name: "a.png" });
        assert_eq!(result, Err(AppError::NoteNotFound(path("voyage.md"))));
    }

    #[test]
    fn a_link_to_an_attachment_of_the_note_leads_to_its_location() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        attached(
            &store,
            AttachmentSource::Dropped {
                file_name: "Billet 1.pdf",
            },
        )
        .unwrap();
        let location = OpenAttachment::new(&store)
            .execute(&path("voyage.md"), "voyage.assets/Billet%201.pdf")
            .unwrap();
        assert_eq!(location.as_str(), "mémoire://voyage.md/Billet 1.pdf");
    }

    #[test]
    fn other_links_do_not_open() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let open = OpenAttachment::new(&store);
        assert_eq!(
            open.execute(&path("voyage.md"), "../secret.pdf"),
            Err(AppError::NotAnAttachment("../secret.pdf".into()))
        );
        assert_eq!(
            open.execute(&path("voyage.md"), "voyage.assets/absent.pdf"),
            Err(AppError::AttachmentNotFound("absent.pdf".into()))
        );
    }
}
