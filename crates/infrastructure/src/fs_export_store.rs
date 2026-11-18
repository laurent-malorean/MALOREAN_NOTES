//! Écriture des exports sur le disque du Mac, hors de l'espace de travail.

use std::fs;
use std::path::Path;

use application::{ExportStore, ExportedAttachment, StoreError};
use domain::export::ExportDestination;

/// Écrit les fichiers exportés à l'emplacement choisi dans la fenêtre d'enregistrement.
#[derive(Debug, Clone, Copy, Default)]
pub struct FsExportStore;

fn unavailable(error: &std::io::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}

impl ExportStore for FsExportStore {
    fn write_markdown(
        &self,
        destination: &ExportDestination,
        text: &str,
        attachments: &[ExportedAttachment],
    ) -> Result<(), StoreError> {
        fs::write(destination.location(), text).map_err(|e| unavailable(&e))?;
        if attachments.is_empty() {
            return Ok(());
        }
        let folder = Path::new(destination.folder()).join(destination.attachment_folder());
        fs::create_dir_all(&folder).map_err(|e| unavailable(&e))?;
        for attachment in attachments {
            fs::write(folder.join(attachment.name.to_name()), &attachment.bytes)
                .map_err(|e| unavailable(&e))?;
        }
        Ok(())
    }
}
