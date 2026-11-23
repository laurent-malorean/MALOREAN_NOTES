//! Contrat de l'écriture des exports : joué à l'identique sur le faux et sur le vrai disque.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use domain::AttachmentName;
use domain::export::ExportDestination;

use crate::{ExportStore, ExportedAttachment};

/// L'écriture des exports dans un dossier, et de quoi relire ce qui y a été écrit.
pub trait ExportFolder: ExportStore {
    /// L'emplacement complet, sans `/` final, du dossier qui reçoit les fichiers exportés.
    fn location(&self) -> String;
    /// Le contenu du fichier écrit à cet emplacement complet, s'il y en a un.
    fn read(&self, location: &str) -> Option<Vec<u8>>;
}

fn image(name: &str, bytes: &[u8]) -> ExportedAttachment {
    ExportedAttachment {
        name: AttachmentName::existing(name).unwrap(),
        bytes: bytes.to_vec(),
    }
}

/// Joue tout le contrat ; `fresh` fabrique à chaque appel l'écriture dans un dossier vide.
pub fn export_contract<F: ExportFolder>(fresh: impl Fn() -> F) {
    the_text_is_written_at_the_destination(&fresh());
    an_existing_file_is_replaced(&fresh());
    attachments_go_in_the_attachment_folder_of_the_export(&fresh());
    an_image_is_written_as_is_and_replaces_an_existing_one(&fresh());
}

fn an_image_is_written_as_is_and_replaces_an_existing_one(folder: &impl ExportFolder) {
    let location = format!("{}/Carte.png", folder.location());
    let destination = ExportDestination::parse(&location).unwrap();
    folder.write_image(&destination, b"\x89PNG-1").unwrap();
    folder.write_image(&destination, b"\x89PNG-2").unwrap();
    assert_eq!(folder.read(&location), Some(b"\x89PNG-2".to_vec()));
}

fn the_text_is_written_at_the_destination(folder: &impl ExportFolder) {
    let location = format!("{}/Note.md", folder.location());
    let destination = ExportDestination::parse(&location).unwrap();
    folder.write_markdown(&destination, "# Note", &[]).unwrap();
    assert_eq!(folder.read(&location), Some(b"# Note".to_vec()));
    assert_eq!(
        folder.read(&format!("{}/Note.assets", folder.location())),
        None
    );
}

fn an_existing_file_is_replaced(folder: &impl ExportFolder) {
    let location = format!("{}/Note.md", folder.location());
    let destination = ExportDestination::parse(&location).unwrap();
    folder
        .write_markdown(&destination, "# Ancienne", &[])
        .unwrap();
    folder
        .write_markdown(&destination, "# Nouvelle", &[])
        .unwrap();
    assert_eq!(folder.read(&location), Some(b"# Nouvelle".to_vec()));
}

fn attachments_go_in_the_attachment_folder_of_the_export(folder: &impl ExportFolder) {
    let destination = ExportDestination::parse(&format!("{}/Mon voyage.md", folder.location()));
    let attachments = [image("vue mer.png", b"PNG"), image("plan.pdf", b"PDF")];
    folder
        .write_markdown(&destination.unwrap(), "# Voyage", &attachments)
        .unwrap();
    let copied = format!("{}/Mon voyage.assets", folder.location());
    assert_eq!(
        folder.read(&format!("{copied}/vue mer.png")),
        Some(b"PNG".to_vec())
    );
    assert_eq!(
        folder.read(&format!("{copied}/plan.pdf")),
        Some(b"PDF".to_vec())
    );
}

#[cfg(test)]
mod tests {
    use super::ExportFolder;
    use crate::testing::InMemoryExportStore;

    impl ExportFolder for InMemoryExportStore {
        fn location(&self) -> String {
            "/Users/moi/Documents".to_owned()
        }

        fn read(&self, location: &str) -> Option<Vec<u8>> {
            self.file(location)
        }
    }

    #[test]
    fn in_memory_exports_honour_the_export_contract() {
        super::export_contract(InMemoryExportStore::default);
    }
}
