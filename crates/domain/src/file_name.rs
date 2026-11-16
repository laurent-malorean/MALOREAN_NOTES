//! Nom de fichier d'une note : le titre en kebab-case, suivi de `.md`.

use std::fmt;

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use crate::Title;

const EXTENSION: &str = ".md";
const UNTITLED_STEM: &str = "sans-titre";
const ATTACHMENT_SUFFIX: &str = ".assets";
const FIRST_DUPLICATE_SUFFIX: u32 = 2;

/// Nom d'un fichier de note : un seul élément de chemin, se terminant par `.md`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct FileName(String);

/// Nom refusé : vide, caché, hors dossier, ou qui n'est pas un fichier Markdown.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidFileName(pub String);

impl fmt::Display for InvalidFileName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "nom de note invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidFileName {}

impl FileName {
    /// Accepte un nom existant s'il est sûr : pas de séparateur, pas caché, extension `.md`.
    pub fn parse(name: &str) -> Result<Self, InvalidFileName> {
        let has_md_extension = name.len() > EXTENSION.len()
            && name.is_char_boundary(name.len() - EXTENSION.len())
            && name[name.len() - EXTENSION.len()..].eq_ignore_ascii_case(EXTENSION);
        let is_safe = !name.starts_with('.') && !name.contains(['/', '\\', '\0']);
        if has_md_extension && is_safe {
            Ok(Self(name.to_owned()))
        } else {
            Err(InvalidFileName(name.to_owned()))
        }
    }

    /// Le nom tiré du titre, en kebab-case ; `sans-titre.md` sans titre utilisable.
    #[must_use]
    pub fn from_title(title: Option<&Title>) -> Self {
        let stem = title.map(|t| kebab_case(t.as_str())).unwrap_or_default();
        let stem = if stem.is_empty() {
            UNTITLED_STEM.to_owned()
        } else {
            stem
        };
        Self(format!("{stem}{EXTENSION}"))
    }

    /// Ce nom, ou le premier `-2`, `-3`… qui n'est pas déjà pris.
    #[must_use]
    pub fn deduplicated(self, mut is_taken: impl FnMut(&Self) -> bool) -> Self {
        if !is_taken(&self) {
            return self;
        }
        (FIRST_DUPLICATE_SUFFIX..)
            .map(|n| Self(format!("{}-{n}{EXTENSION}", self.stem())))
            .find(|candidate| !is_taken(candidate))
            .unwrap_or(self)
    }

    /// Nom du dossier qui contient les pièces jointes de la note.
    #[must_use]
    pub fn attachment_folder(&self) -> String {
        format!("{}{ATTACHMENT_SUFFIX}", self.stem())
    }

    #[must_use]
    pub fn stem(&self) -> &str {
        &self.0[..self.0.len() - EXTENSION.len()]
    }

    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

fn kebab_case(text: &str) -> String {
    let ascii: String = text
        .nfd()
        .filter(|c| !is_combining_mark(*c))
        .map(|c| {
            if c.is_ascii_alphanumeric() {
                c.to_ascii_lowercase()
            } else {
                ' '
            }
        })
        .collect();
    ascii.split_whitespace().collect::<Vec<_>>().join("-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Title;

    fn from_title(content: &str) -> String {
        FileName::from_title(Title::of(content).as_ref())
            .as_str()
            .to_owned()
    }

    #[test]
    fn title_becomes_kebab_case_without_accents() {
        assert_eq!(from_title("# Mon idée du jour"), "mon-idee-du-jour.md");
    }

    #[test]
    fn signs_are_removed_and_separators_collapsed() {
        assert_eq!(
            from_title("# Caractères spéciaux : é, à, ç & co !"),
            "caracteres-speciaux-e-a-c-co.md"
        );
        assert_eq!(
            from_title("# Idées pour le week-end"),
            "idees-pour-le-week-end.md"
        );
        assert_eq!(from_title("# L'été 2026"), "l-ete-2026.md");
    }

    #[test]
    fn note_without_usable_title_is_untitled() {
        assert_eq!(from_title("texte seul"), "sans-titre.md");
        assert_eq!(from_title("# 📝 !!"), "sans-titre.md");
    }

    #[test]
    fn taken_name_gets_a_numbered_suffix() {
        let taken = ["note.md", "note-2.md"];
        let name = FileName::parse("note.md")
            .unwrap()
            .deduplicated(|candidate| taken.contains(&candidate.as_str()));
        assert_eq!(name.as_str(), "note-3.md");
    }

    #[test]
    fn free_name_is_kept() {
        let name = FileName::parse("note.md").unwrap().deduplicated(|_| false);
        assert_eq!(name.as_str(), "note.md");
    }

    #[test]
    fn existing_markdown_file_names_are_accepted() {
        assert!(FileName::parse("Ma Note.md").is_ok());
        assert!(FileName::parse("notes.MD").is_ok());
    }

    #[test]
    fn unsafe_or_non_markdown_names_are_rejected() {
        for bad in [
            "",
            ".md",
            "../evil.md",
            "a/b.md",
            "note.txt",
            ".cache.md",
            "a\\b.md",
        ] {
            assert_eq!(
                FileName::parse(bad),
                Err(InvalidFileName(bad.to_owned())),
                "{bad}"
            );
        }
    }

    #[test]
    fn attachment_folder_is_named_after_the_note() {
        let name = FileName::parse("voyage.md").unwrap();
        assert_eq!(name.attachment_folder(), "voyage.assets");
    }
}
