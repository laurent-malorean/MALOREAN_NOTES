//! Faux presse-papiers, en mémoire (voir `clipboard_contract`).

use std::sync::{Mutex, PoisonError};

use crate::{Clipboard, StoreError};

/// Presse-papiers en mémoire : garde la dernière copie, ses deux formats.
#[derive(Debug, Default)]
pub struct InMemoryClipboard {
    copied: Mutex<Option<(String, String)>>,
}

impl InMemoryClipboard {
    /// La dernière copie : le texte mis en forme, puis le texte brut ; rien avant la première.
    pub fn copied(&self) -> Option<(String, String)> {
        self.copied
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

impl Clipboard for InMemoryClipboard {
    fn copy_rich_text(&self, html: &str, text: &str) -> Result<(), StoreError> {
        *self.copied.lock().unwrap_or_else(PoisonError::into_inner) =
            Some((html.to_owned(), text.to_owned()));
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::clipboard_contract::{ReadableClipboard, clipboard_contract};

    impl ReadableClipboard for InMemoryClipboard {
        fn read(&self) -> Option<(String, String)> {
            self.copied()
        }
    }

    #[test]
    fn honours_the_clipboard_contract() {
        let clipboard = InMemoryClipboard::default();
        assert_eq!(clipboard.copied(), None);
        clipboard_contract(&clipboard);
    }
}
