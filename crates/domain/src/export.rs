//! Export d'une note hors de l'espace de travail : le nom proposé, le fichier exporté et le
//! texte d'un export Markdown, dont les liens suivent les pièces jointes copiées.

use std::fmt;

use crate::FileName;
use crate::attachment_name::encoded;

/// Ce qu'un nom de fichier du Mac ne peut pas contenir, remplacé dans le nom proposé.
const REFUSED_IN_NAME: [char; 2] = ['/', ':'];
const NAME_REPLACEMENT: &str = "-";
const UNTITLED_NAME: &str = "Sans titre";
const ATTACHMENT_SUFFIX: &str = ".assets";

/// Le format d'un fichier exporté.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ExportFormat {
    /// La note mise en forme, en pages.
    Pdf,
    /// Le fichier de la note tel quel.
    Markdown,
}

impl ExportFormat {
    /// L'extension du fichier exporté, sans le point.
    #[must_use]
    pub fn extension(self) -> &'static str {
        match self {
            Self::Pdf => "pdf",
            Self::Markdown => "md",
        }
    }
}

/// Le nom proposé pour le fichier exporté : le titre de la note, sans les caractères que le
/// Mac refuse dans un nom (`/`, `:`), suivi de l'extension du format.
#[must_use]
pub fn export_file_name(title: &str, format: ExportFormat) -> String {
    let name = title.replace(REFUSED_IN_NAME, NAME_REPLACEMENT);
    let name = name.trim();
    let name = if name.is_empty() { UNTITLED_NAME } else { name };
    format!("{name}.{}", format.extension())
}

/// Le fichier écrit par un export, désigné par son emplacement complet sur le Mac.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ExportDestination {
    location: String,
    /// Où commence le nom du fichier dans l'emplacement.
    name_start: usize,
}

/// Emplacement refusé : pas un chemin complet vers un fichier.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidExportDestination(pub String);

impl fmt::Display for InvalidExportDestination {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "emplacement d'export invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidExportDestination {}

impl ExportDestination {
    /// Accepte un chemin complet vers un fichier : commence par `/`, sans élément `..`, avec
    /// un nom de fichier.
    ///
    /// # Errors
    ///
    /// [`InvalidExportDestination`] si le chemin est relatif, remonte d'un dossier (`..`)
    /// ou ne nomme pas un fichier.
    pub fn parse(location: &str) -> Result<Self, InvalidExportDestination> {
        let refused = || InvalidExportDestination(location.to_owned());
        let rest = location.strip_prefix('/').ok_or_else(refused)?;
        if rest.split('/').any(|part| part == "..") {
            return Err(refused());
        }
        let name_start = location.rfind('/').ok_or_else(refused)? + 1;
        let name = &location[name_start..];
        if name.is_empty() || name == "." {
            return Err(refused());
        }
        Ok(Self {
            location: location.to_owned(),
            name_start,
        })
    }

    /// L'emplacement complet du fichier exporté.
    #[must_use]
    pub fn location(&self) -> &str {
        &self.location
    }

    /// Le dossier qui contient le fichier exporté, sans `/` final (`/` pour la racine du disque).
    #[must_use]
    pub fn folder(&self) -> &str {
        match &self.location[..self.name_start - 1] {
            "" => "/",
            folder => folder,
        }
    }

    /// Le nom du fichier exporté.
    #[must_use]
    pub fn name(&self) -> &str {
        &self.location[self.name_start..]
    }

    /// Le dossier, à côté du fichier exporté, qui reçoit les pièces jointes copiées :
    /// `<nom sans extension>.assets`.
    #[must_use]
    pub fn attachment_folder(&self) -> String {
        let name = self.name();
        let stem = name.rsplit_once('.').map_or(name, |(stem, _)| stem);
        let stem = if stem.is_empty() { name } else { stem };
        format!("{stem}{ATTACHMENT_SUFFIX}")
    }
}

/// Le texte d'un export Markdown de la note `note` : le fichier tel quel, en-tête compris,
/// dont les liens vers son dossier de pièces jointes visent le dossier copié à côté du
/// fichier exporté.
#[must_use]
pub fn exported_markdown(
    content: &str,
    note: &FileName,
    destination: &ExportDestination,
) -> String {
    let from = note.attachment_folder();
    let to = destination.attachment_folder();
    content
        .replace(&format!("](<{from}/"), &format!("](<{to}/"))
        .replace(&format!("]({from}/"), &format!("]({}/", encoded(&to)))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn destination(location: &str) -> ExportDestination {
        ExportDestination::parse(location).unwrap()
    }

    #[test]
    fn the_proposed_name_is_the_title_with_the_extension_of_the_format() {
        assert_eq!(
            export_file_name("Réunion du lundi", ExportFormat::Pdf),
            "Réunion du lundi.pdf"
        );
        assert_eq!(
            export_file_name("Réunion du lundi", ExportFormat::Markdown),
            "Réunion du lundi.md"
        );
    }

    #[test]
    fn the_proposed_name_has_no_character_the_mac_refuses() {
        assert_eq!(
            export_file_name(" Budget 2026/2027 : bilan ", ExportFormat::Pdf),
            "Budget 2026-2027 - bilan.pdf"
        );
    }

    #[test]
    fn an_empty_title_gives_an_untitled_name() {
        assert_eq!(
            export_file_name("  ", ExportFormat::Markdown),
            "Sans titre.md"
        );
    }

    #[test]
    fn a_destination_knows_its_folder_and_its_name() {
        let exported = destination("/Users/moi/Documents/Réunion.pdf");
        assert_eq!(exported.location(), "/Users/moi/Documents/Réunion.pdf");
        assert_eq!(exported.folder(), "/Users/moi/Documents");
        assert_eq!(exported.name(), "Réunion.pdf");
        assert_eq!(destination("/Réunion.pdf").folder(), "/");
    }

    #[test]
    fn a_destination_is_a_complete_path_to_a_file() {
        for refused in [
            "",
            "Documents/a.md",
            "/Users/moi/",
            "/Users/moi/.",
            "/Users/../a.md",
        ] {
            assert_eq!(
                ExportDestination::parse(refused),
                Err(InvalidExportDestination(refused.to_owned())),
                "{refused}"
            );
        }
    }

    #[test]
    fn a_refused_destination_says_which_one() {
        assert_eq!(
            InvalidExportDestination("a.md".to_owned()).to_string(),
            "emplacement d'export invalide : « a.md »"
        );
    }

    #[test]
    fn attachments_go_next_to_the_exported_file_under_its_name() {
        assert_eq!(
            destination("/Docs/Mon voyage.md").attachment_folder(),
            "Mon voyage.assets"
        );
        assert_eq!(
            destination("/Docs/v1.2.notes.md").attachment_folder(),
            "v1.2.notes.assets"
        );
        assert_eq!(
            destination("/Docs/notes").attachment_folder(),
            "notes.assets"
        );
        assert_eq!(
            destination("/Docs/.notes").attachment_folder(),
            ".notes.assets"
        );
    }

    #[test]
    fn the_exported_text_links_to_the_copied_attachments() {
        let note = FileName::parse("voyage.md").unwrap();
        let content = "---\ntags: [a]\n---\n# Voyage\n![](voyage.assets/vue.png)\n\
            [billet](<voyage.assets/billet 1.pdf>)\n[site](https://voyage.assets/x)";
        assert_eq!(
            exported_markdown(content, &note, &destination("/Docs/Mon voyage (1).md")),
            "---\ntags: [a]\n---\n# Voyage\n![](Mon%20voyage%20%281%29.assets/vue.png)\n\
            [billet](<Mon voyage (1).assets/billet 1.pdf>)\n[site](https://voyage.assets/x)"
        );
    }
}
