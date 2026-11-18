//! Contrat du presse-papiers : joué à l'identique sur le faux et sur le vrai presse-papiers du Mac.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use crate::Clipboard;

/// Un presse-papiers, et de quoi relire ce qui y a été posé.
pub trait ReadableClipboard: Clipboard {
    /// Le texte mis en forme, puis le texte brut, posés en dernier ; rien s'il n'y en a pas.
    fn read(&self) -> Option<(String, String)>;
}

/// Joue tout le contrat sur `clipboard`.
pub fn clipboard_contract(clipboard: &impl ReadableClipboard) {
    both_formats_are_put_together(clipboard);
    a_copy_replaces_the_last_one(clipboard);
}

fn both_formats_are_put_together(clipboard: &impl ReadableClipboard) {
    clipboard
        .copy_rich_text("<p><strong>Été</strong></p>", "Été")
        .unwrap();
    assert_eq!(
        clipboard.read(),
        Some(("<p><strong>Été</strong></p>".to_owned(), "Été".to_owned()))
    );
}

fn a_copy_replaces_the_last_one(clipboard: &impl ReadableClipboard) {
    clipboard.copy_rich_text("<p>un</p>", "un").unwrap();
    clipboard.copy_rich_text("<p>deux</p>", "deux").unwrap();
    assert_eq!(
        clipboard.read(),
        Some(("<p>deux</p>".to_owned(), "deux".to_owned()))
    );
}
