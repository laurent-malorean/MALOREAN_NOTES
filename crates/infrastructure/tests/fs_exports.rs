//! Exports sur disque : contrat, et règles propres aux fichiers.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;

use application::testing::export_contract::{ExportFolder, export_contract};
use application::{ExportStore, ExportedAttachment, StoreError};
use domain::AttachmentName;
use domain::export::ExportDestination;
use infrastructure::FsExportStore;
use tempfile::TempDir;

/// Un dossier temporaire où le vrai disque reçoit les exports.
#[derive(Debug)]
struct DiskFolder(TempDir);

impl ExportStore for DiskFolder {
    fn write_markdown(
        &self,
        destination: &ExportDestination,
        text: &str,
        attachments: &[ExportedAttachment],
    ) -> Result<(), StoreError> {
        FsExportStore.write_markdown(destination, text, attachments)
    }

    fn write_image(&self, destination: &ExportDestination, bytes: &[u8]) -> Result<(), StoreError> {
        FsExportStore.write_image(destination, bytes)
    }
}

impl ExportFolder for DiskFolder {
    fn location(&self) -> String {
        self.0.path().to_str().unwrap().to_owned()
    }

    fn read(&self, location: &str) -> Option<Vec<u8>> {
        fs::read(location).ok()
    }
}

#[test]
fn disk_exports_honour_the_export_contract() {
    export_contract(|| DiskFolder(TempDir::new().unwrap()));
}

#[test]
fn an_export_into_a_missing_folder_says_why_it_failed() {
    let dir = TempDir::new().unwrap();
    let location = format!("{}/absent/Note.md", dir.path().to_str().unwrap());
    let written =
        FsExportStore.write_markdown(&ExportDestination::parse(&location).unwrap(), "# N", &[]);
    assert!(
        matches!(written, Err(StoreError::Unavailable(_))),
        "{written:?}"
    );
}

#[test]
fn attachments_that_cannot_be_copied_are_reported() {
    let dir = TempDir::new().unwrap();
    let root = dir.path().to_str().unwrap();
    // Un fichier occupe la place du dossier de pièces jointes de l'export.
    fs::write(format!("{root}/Note.assets"), "").unwrap();
    let attachment = ExportedAttachment {
        name: AttachmentName::existing("a.png").unwrap(),
        bytes: b"PNG".to_vec(),
    };
    let destination = ExportDestination::parse(&format!("{root}/Note.md")).unwrap();
    let written = FsExportStore.write_markdown(&destination, "# N", &[attachment]);
    assert!(
        matches!(written, Err(StoreError::Unavailable(_))),
        "{written:?}"
    );
}

#[test]
fn an_image_into_a_missing_folder_says_why_it_failed() {
    let dir = TempDir::new().unwrap();
    let location = format!("{}/absent/Carte.png", dir.path().to_str().unwrap());
    let written = FsExportStore.write_image(&ExportDestination::parse(&location).unwrap(), b"PNG");
    assert!(
        matches!(written, Err(StoreError::Unavailable(_))),
        "{written:?}"
    );
}
