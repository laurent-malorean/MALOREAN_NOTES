//! Le presse-papiers du Mac (`NSPasteboard`), où la note copiée est posée en HTML et en texte brut,
//! ou en texte Markdown seul (fiche 0027).

use application::{Clipboard, StoreError};
use objc2::rc::Retained;
use objc2_app_kit::NSPasteboard;
use objc2_foundation::NSString;

/// Le type du texte mis en forme, que lisent Mail, Pages, Word ou Notes.
const HTML_TYPE: &str = "public.html";
/// Le type du texte brut, que lit toute application qui accepte du texte.
const TEXT_TYPE: &str = "public.utf8-plain-text";

/// Un presse-papiers du Mac : le presse-papiers général, celui de Cmd+C et Cmd+V, ou un
/// presse-papiers nommé, à part (pour les tests).
#[derive(Debug, Clone, Default)]
pub struct MacClipboard {
    /// Le nom du presse-papiers ; aucun pour le presse-papiers général.
    name: Option<String>,
}

impl MacClipboard {
    /// Le presse-papiers à part qui porte ce nom, que le reste du Mac ne lit pas.
    #[must_use]
    pub fn named(name: &str) -> Self {
        Self {
            name: Some(name.to_owned()),
        }
    }

    fn pasteboard(&self) -> Retained<NSPasteboard> {
        match &self.name {
            Some(name) => NSPasteboard::pasteboardWithName(&NSString::from_str(name)),
            None => NSPasteboard::generalPasteboard(),
        }
    }

    /// Vide le presse-papiers, puis y pose chaque texte sous son type.
    fn put(&self, formats: &[(&str, &str)]) -> Result<(), StoreError> {
        let pasteboard = self.pasteboard();
        pasteboard.clearContents();
        let refused = formats.iter().any(|(content, kind)| {
            !pasteboard.setString_forType(&NSString::from_str(content), &NSString::from_str(kind))
        });
        if refused {
            return Err(StoreError::Unavailable(
                "le presse-papiers a refusé la copie".to_owned(),
            ));
        }
        Ok(())
    }
}

impl Clipboard for MacClipboard {
    fn copy_rich_text(&self, html: &str, text: &str) -> Result<(), StoreError> {
        self.put(&[(html, HTML_TYPE), (text, TEXT_TYPE)])
    }

    fn copy_plain_text(&self, text: &str) -> Result<(), StoreError> {
        self.put(&[(text, TEXT_TYPE)])
    }
}

#[cfg(test)]
mod tests {
    use application::testing::clipboard_contract::{ReadableClipboard, clipboard_contract};

    use super::*;

    impl ReadableClipboard for MacClipboard {
        fn read(&self) -> Option<(Option<String>, String)> {
            let pasteboard = self.pasteboard();
            let read = |kind: &str| pasteboard.stringForType(&NSString::from_str(kind));
            let html = read(HTML_TYPE).map(|html| html.to_string());
            Some((html, read(TEXT_TYPE)?.to_string()))
        }
    }

    #[test]
    fn a_named_clipboard_honours_the_clipboard_contract() {
        // Un presse-papiers à part : celui de l'utilisateur n'est pas touché.
        clipboard_contract(&MacClipboard::named("org.malorean.notes.tests.clipboard"));
    }

    #[test]
    fn the_default_clipboard_is_the_general_one() {
        assert_eq!(
            MacClipboard::default().pasteboard().name().to_string(),
            "Apple CFPasteboard general"
        );
    }
}
