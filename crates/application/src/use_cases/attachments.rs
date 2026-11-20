//! Joindre un fichier collé ou glissé à une note, et ouvrir la cible d'un lien Markdown.

use domain::attachments::with_link_appended;
use domain::{AttachmentName, Folder, NotePath, RefusedAttachment, WebAddress};

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
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
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

/// Joint à une note un fichier de l'espace de travail (image ou PDF) : copié dans son dossier de
/// pièces jointes, son lien ajouté à la fin de la note ; le fichier d'origine reste où il est.
#[derive(Debug)]
pub struct AttachWorkspaceFile<'a> {
    store: &'a dyn NoteStore,
    clock: &'a dyn Clock,
}

impl<'a> AttachWorkspaceFile<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert et l'horloge.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore, clock: &'a dyn Clock) -> Self {
        Self { store, clock }
    }

    /// Le lien ajouté à la note `note` vers sa nouvelle pièce jointe, copie du fichier
    /// `file_name` du dossier `folder`.
    ///
    /// # Errors
    ///
    /// [`AppError::AttachmentRefused`] si ce n'est ni une image ni un PDF,
    /// [`AppError::AttachmentNotFound`] si le fichier n'existe pas, et les erreurs de
    /// [`AttachFile::execute`].
    pub fn execute(
        &self,
        note: &NotePath,
        folder: &Folder,
        file_name: &str,
    ) -> Result<String, AppError> {
        let name = AttachmentName::existing(file_name).ok_or_else(|| {
            let kind = file_name
                .rsplit_once('.')
                .map_or(file_name, |(_, kind)| kind);
            AppError::AttachmentRefused(RefusedAttachment::UnsupportedType(kind.to_owned()))
        })?;
        let content = self.store.read(note)?.content;
        let bytes = self.store.read_file(folder, &name)?;
        let link = AttachFile::new(self.store, self.clock).execute(
            note,
            AttachmentSource::Dropped { file_name },
            &bytes,
        )?;
        self.store
            .write(note, &with_link_appended(&content, &link))?;
        Ok(link)
    }
}

/// Ce que vise la cible d'un lien Markdown de la note.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LinkDestination {
    /// Une adresse web, à ouvrir dans le navigateur du Mac.
    Web(WebAddress),
    /// Une pièce jointe de la note, à ouvrir avec l'application du Mac.
    Attachment(AttachmentLocation),
}

/// Retrouve ce que vise un lien Markdown de la note, pour l'ouvrir.
#[derive(Debug)]
pub struct OpenLinkTarget<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> OpenLinkTarget<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Ce que vise `target`, la cible d'un lien de la note : une adresse web, sinon une pièce
    /// jointe de la note. Rien d'autre ne s'ouvre ainsi.
    ///
    /// # Errors
    ///
    /// [`AppError::NotAnAttachment`] si le lien ne vise ni une adresse web ni une pièce jointe
    /// de la note, [`AppError::AttachmentNotFound`] si la pièce jointe n'existe pas,
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, note: &NotePath, target: &str) -> Result<LinkDestination, AppError> {
        if let Some(address) = WebAddress::in_link(target) {
            return Ok(LinkDestination::Web(address));
        }
        let name = AttachmentName::in_link(note.name(), target)
            .ok_or_else(|| AppError::NotAnAttachment(target.to_owned()))?;
        Ok(LinkDestination::Attachment(
            self.store.attachment_location(note, &name)?,
        ))
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
        // 50 Mo, comptés en octets : 50 × 1 048 576.
        let limit = 52_428_800;
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
        let destination = OpenLinkTarget::new(&store)
            .execute(&path("voyage.md"), "voyage.assets/Billet%201.pdf")
            .unwrap();
        let LinkDestination::Attachment(location) = destination else {
            panic!("pas une pièce jointe : {destination:?}");
        };
        assert_eq!(location.as_str(), "mémoire://voyage.md/Billet 1.pdf");
    }

    #[test]
    fn a_web_address_is_opened_as_it_is_written() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let destination =
            OpenLinkTarget::new(&store).execute(&path("voyage.md"), "<https://a.fr/b>");
        assert_eq!(
            destination,
            Ok(LinkDestination::Web(
                WebAddress::in_link("https://a.fr/b").unwrap()
            ))
        );
    }

    #[test]
    fn other_links_do_not_open() {
        let store = InMemoryNoteStore::with_notes(&[("voyage.md", "# Voyage")]);
        let open = OpenLinkTarget::new(&store);
        assert_eq!(
            open.execute(&path("voyage.md"), "../secret.pdf"),
            Err(AppError::NotAnAttachment("../secret.pdf".into()))
        );
        assert_eq!(
            open.execute(&path("voyage.md"), "voyage.assets/absent.pdf"),
            Err(AppError::AttachmentNotFound("absent.pdf".into()))
        );
    }

    #[test]
    fn a_file_of_the_workspace_is_copied_as_an_attachment_and_linked_at_the_end_of_the_note() {
        let store = InMemoryNoteStore::with_notes(&[("a.md", "# A\ntexte")]).with_file(
            "Documents",
            "plan.pdf",
            b"PDF",
        );
        let note = NotePath::parse("a.md").unwrap();
        let documents = Folder::parse("Documents").unwrap();
        let clock = FixedClock::default();
        let attaching = AttachWorkspaceFile::new(&store, &clock);
        let link = attaching.execute(&note, &documents, "plan.pdf").unwrap();
        assert_eq!(link, "[plan.pdf](a.assets/plan.pdf)");
        assert_eq!(
            store.read(&note).unwrap().content,
            "# A\ntexte\n\n[plan.pdf](a.assets/plan.pdf)\n"
        );
        let copied = AttachmentName::existing("plan.pdf").unwrap();
        assert_eq!(store.read_attachment(&note, &copied).unwrap(), b"PDF");
        assert_eq!(store.read_file(&documents, &copied).unwrap(), b"PDF");
    }

    #[test]
    fn only_an_existing_image_or_pdf_is_attached_to_an_existing_note() {
        let store =
            InMemoryNoteStore::with_notes(&[("a.md", "# A")]).with_file("", "liste.txt", b"x");
        let note = NotePath::parse("a.md").unwrap();
        let clock = FixedClock::default();
        let attaching = AttachWorkspaceFile::new(&store, &clock);
        assert_eq!(
            attaching.execute(&note, &Folder::root(), "liste.txt"),
            Err(AppError::AttachmentRefused(
                RefusedAttachment::UnsupportedType("txt".into())
            ))
        );
        assert_eq!(
            attaching.execute(&note, &Folder::root(), "absent.png"),
            Err(AppError::AttachmentNotFound("absent.png".into()))
        );
        let other = NotePath::parse("b.md").unwrap();
        assert!(
            attaching
                .execute(&other, &Folder::root(), "absent.png")
                .is_err()
        );
        assert_eq!(store.read(&note).unwrap().content, "# A");
    }
}
