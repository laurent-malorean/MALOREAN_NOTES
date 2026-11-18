//! Faux fichiers exportés, en mémoire (voir `export_contract`).

use std::collections::BTreeMap;
use std::sync::{Mutex, PoisonError};

use domain::export::ExportDestination;

use crate::{ExportStore, ExportedAttachment, StoreError};

/// Fichiers exportés en mémoire, rangés par emplacement complet, comme sur le disque.
#[derive(Debug, Default)]
pub struct InMemoryExportStore {
    files: Mutex<BTreeMap<String, Vec<u8>>>,
}

impl InMemoryExportStore {
    /// Le contenu du fichier écrit à cet emplacement, s'il y en a un.
    pub fn file(&self, location: &str) -> Option<Vec<u8>> {
        self.files
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .get(location)
            .cloned()
    }
}

impl ExportStore for InMemoryExportStore {
    fn write_markdown(
        &self,
        destination: &ExportDestination,
        text: &str,
        attachments: &[ExportedAttachment],
    ) -> Result<(), StoreError> {
        let mut files = self.files.lock().unwrap_or_else(PoisonError::into_inner);
        files.insert(destination.location().to_owned(), text.as_bytes().to_vec());
        let folder = format!(
            "{}/{}",
            destination.folder().trim_end_matches('/'),
            destination.attachment_folder()
        );
        for attachment in attachments {
            let location = format!("{folder}/{}", attachment.name.to_name());
            files.insert(location, attachment.bytes.clone());
        }
        Ok(())
    }
}
