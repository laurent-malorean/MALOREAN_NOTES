//! Nom de fichier d'une note : le titre en kebab-case, suivi de `.md` (ou de `.canvas` pour un canvas,
//! fiche 0052).

use std::fmt;

use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

use crate::Title;

const EXTENSION: &str = ".md";
const CANVAS_EXTENSION: &str = ".canvas";
const UNTITLED_STEM: &str = "sans-titre";
const ATTACHMENT_SUFFIX: &str = ".assets";
const FIRST_DUPLICATE_SUFFIX: u32 = 2;

/// Nom d'un fichier de note : un seul élément de chemin, se terminant par `.md` ou, pour un canvas,
/// par `.canvas`.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct FileName(String);

/// Nom refusé : vide, caché, hors dossier, ou qui n'est ni un fichier Markdown ni un canvas.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidFileName(pub String);

impl fmt::Display for InvalidFileName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "nom de note invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidFileName {}

impl FileName {
    /// Accepte un nom existant s'il est sûr : pas de séparateur, pas caché, extension `.md` ou
    /// `.canvas`.
    ///
    /// # Errors
    ///
    /// [`InvalidFileName`] si le nom est vide, caché, contient un séparateur de dossier
    /// ou ne se termine ni par `.md` ni par `.canvas`.
    pub fn parse(name: &str) -> Result<Self, InvalidFileName> {
        // `.md` seul est refusé par la règle des fichiers cachés : pas besoin de l'exclure ici.
        let is_safe = !name.starts_with('.') && !name.contains(['/', '\\', '\0']);
        if is_safe && extension_of(name).is_some() {
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

    /// Le nom d'un canvas tiré du titre `title`, en kebab-case ; `sans-titre.canvas` sans titre
    /// utilisable.
    #[must_use]
    pub fn canvas_from_title(title: &str) -> Self {
        let stem = kebab_case(title);
        let stem = if stem.is_empty() {
            UNTITLED_STEM
        } else {
            &stem
        };
        Self(format!("{stem}{CANVAS_EXTENSION}"))
    }

    /// Le nom tiré d'un texte quelconque, en kebab-case ; `sans-titre.md` sans mot utilisable.
    #[must_use]
    pub fn from_text(text: &str) -> Self {
        let stem = kebab_case(text);
        let stem = if stem.is_empty() {
            UNTITLED_STEM
        } else {
            &stem
        };
        Self(format!("{stem}{EXTENSION}"))
    }

    /// Vrai pour le nom d'un canvas (`.canvas`).
    #[must_use]
    pub fn is_canvas(&self) -> bool {
        extension_of(&self.0).is_some_and(|e| e.eq_ignore_ascii_case(CANVAS_EXTENSION))
    }

    /// Ce nom, ou le premier `-2`, `-3`… qui n'est pas déjà pris.
    #[must_use]
    pub fn deduplicated(self, mut is_taken: impl FnMut(&Self) -> bool) -> Self {
        if !is_taken(&self) {
            return self;
        }
        (FIRST_DUPLICATE_SUFFIX..)
            .map(|n| Self(format!("{}-{n}{}", self.stem(), self.extension())))
            .find(|candidate| !is_taken(candidate))
            .unwrap_or(self)
    }

    /// Nom du dossier qui contient les pièces jointes de la note.
    #[must_use]
    pub fn attachment_folder(&self) -> String {
        format!("{}{ATTACHMENT_SUFFIX}", self.stem())
    }

    /// Le nom d'une note neuve ou sans titre : `sans-titre`, ou son premier suffixe `-2`, `-3`…
    #[must_use]
    pub fn is_untitled(&self) -> bool {
        self.stem().strip_prefix(UNTITLED_STEM).is_some_and(|rest| {
            rest.is_empty()
                || rest
                    .strip_prefix('-')
                    .is_some_and(|n| !n.is_empty() && n.chars().all(|c| c.is_ascii_digit()))
        })
    }

    /// Le nom sans son extension (`.md` ou `.canvas`).
    #[must_use]
    pub fn stem(&self) -> &str {
        &self.0[..self.0.len() - self.extension().len()]
    }

    fn extension(&self) -> &str {
        extension_of(&self.0).unwrap_or(EXTENSION)
    }

    /// Le nom complet, extension comprise.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// L'extension reconnue qui termine `name`, majuscules ignorées, telle qu'écrite.
fn extension_of(name: &str) -> Option<&str> {
    [EXTENSION, CANVAS_EXTENSION]
        .into_iter()
        .find_map(|extension| {
            let start = name.len().checked_sub(extension.len())?;
            name.get(start..)
                .filter(|written| written.eq_ignore_ascii_case(extension))
        })
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
    fn a_name_comes_from_any_text_in_kebab_case() {
        let name = |text| FileName::from_text(text).as_str().to_owned();
        assert_eq!(
            name("2026-11-24 Demande de devis"),
            "2026-11-24-demande-de-devis.md"
        );
        assert_eq!(name("Acme, S.A."), "acme-s-a.md");
        assert_eq!(name("  !? "), "sans-titre.md");
        assert_eq!(name(""), "sans-titre.md");
    }

    #[test]
    fn only_the_name_of_a_new_note_is_untitled() {
        let untitled = |name: &str| FileName::parse(name).unwrap().is_untitled();
        assert!(untitled("sans-titre.md"));
        assert!(untitled("sans-titre-2.md"));
        assert!(untitled("sans-titre-12.md"));
        assert!(!untitled("sans-titre-final.md"));
        assert!(!untitled("sans-titre-.md"));
        assert!(!untitled("sans-titres.md"));
        assert!(!untitled("Sans titre.md"));
        assert!(!untitled("idee.md"));
    }

    #[test]
    fn a_refused_name_is_quoted_in_the_message() {
        assert_eq!(
            InvalidFileName("a/b.md".to_owned()).to_string(),
            "nom de note invalide : « a/b.md »"
        );
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
    fn a_canvas_name_is_accepted_and_kept_apart() {
        let canvas = FileName::parse("Plan.canvas").unwrap();
        assert!(canvas.is_canvas());
        assert_eq!(canvas.stem(), "Plan");
        assert!(FileName::parse("Plan.CANVAS").unwrap().is_canvas());
        assert_eq!(FileName::parse("Plan.CANVAS").unwrap().stem(), "Plan");
        assert!(!FileName::parse("plan.md").unwrap().is_canvas());
        assert!(FileName::parse(".plan.canvas").is_err());
        assert!(FileName::parse("a/b.canvas").is_err());
        assert!(FileName::parse(".canvas").is_err());
    }

    #[test]
    fn a_canvas_name_comes_from_its_title_and_is_numbered_when_taken() {
        let name = FileName::canvas_from_title("Mon idée du jour");
        assert_eq!(name.as_str(), "mon-idee-du-jour.canvas");
        assert_eq!(
            FileName::canvas_from_title("📝").as_str(),
            "sans-titre.canvas"
        );
        let taken = ["mon-idee-du-jour.canvas"];
        let next = name.deduplicated(|candidate| taken.contains(&candidate.as_str()));
        assert_eq!(next.as_str(), "mon-idee-du-jour-2.canvas");
        assert_eq!(next.attachment_folder(), "mon-idee-du-jour-2.assets");
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
