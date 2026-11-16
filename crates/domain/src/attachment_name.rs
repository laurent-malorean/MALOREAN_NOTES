//! Nom d'une pièce jointe collée ou glissée dans une note, et lien Markdown vers elle.

use std::fmt;

use crate::FileName;

/// Nom donné à un fichier glissé dont il ne reste rien de lisible.
const FALLBACK_STEM: &str = "piece-jointe";
const PASTED_IMAGE_STEM: &str = "image";
const PASTED_DOCUMENT_STEM: &str = "document";
const FIRST_DUPLICATE_SUFFIX: u32 = 2;
/// Au-delà, le nom est coupé : un nom trop long dépasse ce que le disque accepte.
const MAX_STEM_CHARS: usize = 100;
/// Caractères remplacés dans un nom : ils couperaient le chemin, le lien Markdown ou l'adresse.
const UNSAFE_CHARS: [char; 9] = ['/', '\\', '#', '?', '%', '[', ']', '<', '>'];
/// Caractères encodés dans la cible d'un lien, pour qu'il reste un seul lien valide.
const ENCODED_IN_LINK: [char; 3] = [' ', '(', ')'];

/// Ce que l'on peut joindre à une note.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttachmentKind {
    /// Une image, affichée dans la note.
    Image,
    /// Un document PDF, ouvert par l'application du Mac.
    Pdf,
}

/// Extensions acceptées, avec leur sorte et le type de fichier d'un contenu collé.
const KNOWN_TYPES: [(&str, AttachmentKind, &str); 9] = [
    ("png", AttachmentKind::Image, "image/png"),
    ("jpg", AttachmentKind::Image, "image/jpeg"),
    ("jpeg", AttachmentKind::Image, "image/jpeg"),
    ("gif", AttachmentKind::Image, "image/gif"),
    ("webp", AttachmentKind::Image, "image/webp"),
    ("heic", AttachmentKind::Image, "image/heic"),
    ("tiff", AttachmentKind::Image, "image/tiff"),
    ("svg", AttachmentKind::Image, "image/svg+xml"),
    ("pdf", AttachmentKind::Pdf, "application/pdf"),
];

/// Date et heure locales à la minute, telles que les donne l'horloge.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Moment {
    year: i32,
    month: u32,
    day: u32,
    hour: u32,
    minute: u32,
}

/// Moment refusé : un mois, un jour, une heure ou une minute hors de ses bornes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidMoment;

impl fmt::Display for InvalidMoment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str("moment invalide")
    }
}

impl std::error::Error for InvalidMoment {}

impl Moment {
    /// Le moment donné par une horloge.
    ///
    /// # Errors
    ///
    /// [`InvalidMoment`] si le mois n'est pas entre 1 et 12, le jour entre 1 et 31,
    /// l'heure entre 0 et 23 ou la minute entre 0 et 59.
    pub fn new(
        year: i32,
        month: u32,
        day: u32,
        hour: u32,
        minute: u32,
    ) -> Result<Self, InvalidMoment> {
        let valid =
            (1..=12).contains(&month) && (1..=31).contains(&day) && hour < 24 && minute < 60;
        if valid {
            Ok(Self {
                year,
                month,
                day,
                hour,
                minute,
            })
        } else {
            Err(InvalidMoment)
        }
    }

    /// Le moment tel qu'on le lit : `2026-11-16 18h30`.
    pub(crate) fn label(&self) -> String {
        format!(
            "{:04}-{:02}-{:02} {:02}h{:02}",
            self.year, self.month, self.day, self.hour, self.minute
        )
    }
}

/// Fichier refusé comme pièce jointe.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusedAttachment {
    /// Ni une image ni un PDF ; porte l'extension ou le type reçu.
    UnsupportedType(String),
}

impl fmt::Display for RefusedAttachment {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let Self::UnsupportedType(kind) = self;
        write!(
            f,
            "« {kind} » ne peut pas être joint à une note : seulement les images (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) et les PDF"
        )
    }
}

impl std::error::Error for RefusedAttachment {}

/// Nom du fichier d'une pièce jointe : un seul élément de chemin, image ou PDF.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AttachmentName {
    stem: String,
    extension: String,
    kind: AttachmentKind,
}

impl AttachmentName {
    /// Le nom d'un fichier glissé : son propre nom, rendu sûr.
    ///
    /// # Errors
    ///
    /// [`RefusedAttachment::UnsupportedType`] si ce n'est ni une image ni un PDF.
    pub fn dropped(original: &str) -> Result<Self, RefusedAttachment> {
        let file = original.rsplit(['/', '\\']).next().unwrap_or(original);
        let (stem, extension) = file.rsplit_once('.').unwrap_or((file, ""));
        let (extension, kind) = known_extension(extension)
            .ok_or_else(|| RefusedAttachment::UnsupportedType(file.to_owned()))?;
        Ok(Self {
            stem: safe_stem(stem),
            extension,
            kind,
        })
    }

    /// Le nom d'un contenu collé, d'après son type et le moment : `image-2026-11-16-1830.png`.
    ///
    /// # Errors
    ///
    /// [`RefusedAttachment::UnsupportedType`] si ce n'est ni une image ni un PDF.
    pub fn pasted(media_type: &str, at: &Moment) -> Result<Self, RefusedAttachment> {
        let (extension, kind) = KNOWN_TYPES
            .iter()
            .find(|(_, _, media)| media.eq_ignore_ascii_case(media_type))
            .map(|(extension, kind, _)| ((*extension).to_owned(), *kind))
            .ok_or_else(|| RefusedAttachment::UnsupportedType(media_type.to_owned()))?;
        let prefix = match kind {
            AttachmentKind::Image => PASTED_IMAGE_STEM,
            AttachmentKind::Pdf => PASTED_DOCUMENT_STEM,
        };
        let stem = format!(
            "{prefix}-{:04}-{:02}-{:02}-{:02}{:02}",
            at.year, at.month, at.day, at.hour, at.minute
        );
        Ok(Self {
            stem,
            extension,
            kind,
        })
    }

    /// Accepte le nom d'un fichier déjà présent s'il est sûr tel quel : un seul élément,
    /// pas caché, image ou PDF.
    #[must_use]
    pub fn existing(name: &str) -> Option<Self> {
        let (stem, extension) = name.rsplit_once('.')?;
        let (_, kind) = known_extension(extension)?;
        let is_safe =
            !stem.is_empty() && !stem.starts_with('.') && !name.contains(['/', '\\', '\0']);
        is_safe.then(|| Self {
            stem: stem.to_owned(),
            extension: extension.to_owned(),
            kind,
        })
    }

    /// Ce nom, ou le premier `-2`, `-3`… qui n'est pas déjà pris.
    #[must_use]
    pub fn deduplicated(self, mut is_taken: impl FnMut(&Self) -> bool) -> Self {
        if !is_taken(&self) {
            return self;
        }
        (FIRST_DUPLICATE_SUFFIX..)
            .map(|n| Self {
                stem: format!("{}-{n}", self.stem),
                ..self.clone()
            })
            .find(|candidate| !is_taken(candidate))
            .unwrap_or(self)
    }

    /// Vrai si les deux noms désignent le même fichier sur un disque qui ignore la casse.
    #[must_use]
    pub fn same_file_as(&self, other: &Self) -> bool {
        self.to_name().eq_ignore_ascii_case(&other.to_name())
    }

    /// Image ou PDF.
    #[must_use]
    pub fn kind(&self) -> AttachmentKind {
        self.kind
    }

    /// Le nom complet, extension comprise.
    #[must_use]
    pub fn to_name(&self) -> String {
        format!("{}.{}", self.stem, self.extension)
    }

    /// Le lien Markdown à insérer dans la note `note` : une image s'affiche, un PDF se lit
    /// par son nom.
    #[must_use]
    pub fn markdown_link(&self, note: &FileName) -> String {
        let name = self.to_name();
        let target = format!("{}/{}", encoded(&note.attachment_folder()), encoded(&name));
        match self.kind {
            AttachmentKind::Image => format!("![]({target})"),
            AttachmentKind::Pdf => format!("[{name}]({target})"),
        }
    }

    /// La pièce jointe de la note `note` que vise la cible d'un lien, si c'en est une.
    #[must_use]
    pub fn in_link(note: &FileName, target: &str) -> Option<Self> {
        let target = target
            .strip_prefix('<')
            .and_then(|t| t.strip_suffix('>'))
            .unwrap_or(target);
        let decoded = decoded(target)?;
        let rest = decoded.strip_prefix(&format!("{}/", note.attachment_folder()))?;
        Self::existing(rest)
    }
}

fn known_extension(extension: &str) -> Option<(String, AttachmentKind)> {
    let lower = extension.to_ascii_lowercase();
    KNOWN_TYPES
        .iter()
        .find(|(known, _, _)| *known == lower)
        .map(|(_, kind, _)| (lower, *kind))
}

fn safe_stem(stem: &str) -> String {
    let replaced: String = stem
        .chars()
        .map(|c| {
            if c.is_control() || UNSAFE_CHARS.contains(&c) {
                '-'
            } else {
                c
            }
        })
        .take(MAX_STEM_CHARS)
        .collect();
    let trimmed = replaced.trim().trim_start_matches('.').trim();
    if trimmed.is_empty() {
        FALLBACK_STEM.to_owned()
    } else {
        trimmed.to_owned()
    }
}

fn encoded(text: &str) -> String {
    text.chars()
        .map(|c| {
            if ENCODED_IN_LINK.contains(&c) {
                format!("%{:02X}", u32::from(c))
            } else {
                c.to_string()
            }
        })
        .collect()
}

/// Le texte dont les `%XX` sont décodés ; rien si l'encodage est invalide.
fn decoded(text: &str) -> Option<String> {
    let mut bytes = Vec::with_capacity(text.len());
    let mut rest = text.as_bytes();
    while let Some((&first, tail)) = rest.split_first() {
        if first == b'%' {
            let hex = tail.get(..2)?;
            let value = std::str::from_utf8(hex).ok()?;
            bytes.push(u8::from_str_radix(value, 16).ok()?);
            rest = tail.get(2..)?;
        } else {
            bytes.push(first);
            rest = tail;
        }
    }
    String::from_utf8(bytes).ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn moment() -> Moment {
        Moment::new(2026, 11, 16, 18, 5).unwrap()
    }

    fn note(name: &str) -> FileName {
        FileName::parse(name).unwrap()
    }

    #[test]
    fn a_pasted_screenshot_is_named_after_the_moment() {
        let name = AttachmentName::pasted("image/png", &moment()).unwrap();
        assert_eq!(name.to_name(), "image-2026-11-16-1805.png");
        assert_eq!(name.kind(), AttachmentKind::Image);
    }

    #[test]
    fn a_pasted_pdf_is_a_document() {
        let name = AttachmentName::pasted("Application/PDF", &moment()).unwrap();
        assert_eq!(name.to_name(), "document-2026-11-16-1805.pdf");
        assert_eq!(name.kind(), AttachmentKind::Pdf);
    }

    #[test]
    fn a_pasted_jpeg_gets_its_usual_extension() {
        let name = AttachmentName::pasted("image/jpeg", &moment()).unwrap();
        assert_eq!(name.to_name(), "image-2026-11-16-1805.jpg");
    }

    #[test]
    fn pasted_text_is_refused() {
        assert_eq!(
            AttachmentName::pasted("text/plain", &moment()),
            Err(RefusedAttachment::UnsupportedType("text/plain".into()))
        );
    }

    #[test]
    fn a_dropped_file_keeps_its_name_with_a_lowercase_extension() {
        let name = AttachmentName::dropped("Vacances à la mer.JPG").unwrap();
        assert_eq!(name.to_name(), "Vacances à la mer.jpg");
        assert_eq!(
            AttachmentName::dropped("rapport.pdf").unwrap().kind(),
            AttachmentKind::Pdf
        );
    }

    #[test]
    fn a_dropped_name_is_made_safe() {
        let name = AttachmentName::dropped("/Users/moi/../a#b?c%d[e]<f>\u{7}.png").unwrap();
        assert_eq!(name.to_name(), "a-b-c-d-e--f--.png");
        assert_eq!(
            AttachmentName::dropped("C:\\x\\.cache.png")
                .unwrap()
                .to_name(),
            "cache.png"
        );
        assert_eq!(
            AttachmentName::dropped(" .. .png").unwrap().to_name(),
            "piece-jointe.png"
        );
    }

    #[test]
    fn a_very_long_dropped_name_is_shortened() {
        let long = format!("{}.png", "é".repeat(300));
        let name = AttachmentName::dropped(&long).unwrap();
        assert_eq!(
            name.to_name(),
            format!("{}.png", "é".repeat(MAX_STEM_CHARS))
        );
    }

    #[test]
    fn other_dropped_files_are_refused() {
        assert_eq!(
            AttachmentName::dropped("/tmp/notes.txt"),
            Err(RefusedAttachment::UnsupportedType("notes.txt".into()))
        );
        assert!(AttachmentName::dropped("sans-extension").is_err());
    }

    #[test]
    fn the_refusal_says_what_can_be_attached() {
        assert_eq!(
            RefusedAttachment::UnsupportedType("a.txt".into()).to_string(),
            "« a.txt » ne peut pas être joint à une note : seulement les images (PNG, JPEG, GIF, WebP, HEIC, TIFF, SVG) et les PDF"
        );
    }

    #[test]
    fn a_taken_name_gets_a_numbered_suffix() {
        let taken = ["photo.png", "photo-2.png"];
        let name = AttachmentName::dropped("photo.png")
            .unwrap()
            .deduplicated(|c| taken.contains(&c.to_name().as_str()));
        assert_eq!(name.to_name(), "photo-3.png");
        let free = AttachmentName::dropped("photo.png")
            .unwrap()
            .deduplicated(|_| false);
        assert_eq!(free.to_name(), "photo.png");
    }

    #[test]
    fn names_differing_only_by_case_are_the_same_file() {
        let a = AttachmentName::existing("Photo.PNG").unwrap();
        let b = AttachmentName::dropped("photo.png").unwrap();
        assert!(a.same_file_as(&b));
        assert!(!a.same_file_as(&AttachmentName::dropped("photo2.png").unwrap()));
    }

    #[test]
    fn existing_names_must_be_safe_attachments() {
        assert!(AttachmentName::existing("a.png").is_some());
        for bad in [
            ".a.png", ".png", "a/b.png", "a\\b.png", "a.txt", "png", "a\0.png",
        ] {
            assert!(AttachmentName::existing(bad).is_none(), "{bad}");
        }
    }

    #[test]
    fn an_image_link_shows_the_image_from_the_note_attachment_folder() {
        let name = AttachmentName::dropped("vue (mer).png").unwrap();
        assert_eq!(
            name.markdown_link(&note("voyage.md")),
            "![](voyage.assets/vue%20%28mer%29.png)"
        );
    }

    #[test]
    fn a_pdf_link_reads_as_its_name() {
        let name = AttachmentName::dropped("Facture 12.pdf").unwrap();
        assert_eq!(
            name.markdown_link(&note("achats.md")),
            "[Facture 12.pdf](achats.assets/Facture%2012.pdf)"
        );
    }

    #[test]
    fn a_link_target_leads_back_to_the_attachment() {
        let found = AttachmentName::in_link(&note("achats.md"), "achats.assets/Facture%2012.pdf");
        assert_eq!(found.map(|n| n.to_name()), Some("Facture 12.pdf".into()));
        let angled = AttachmentName::in_link(&note("achats.md"), "<achats.assets/a b.pdf>");
        assert_eq!(angled.map(|n| n.to_name()), Some("a b.pdf".into()));
    }

    #[test]
    fn only_attachments_of_the_note_are_found_in_links() {
        let note = note("achats.md");
        for target in [
            "autre.assets/a.pdf",
            "achats.assets/../../secret.pdf",
            "achats.assets/sous/a.pdf",
            "https://example.com/a.pdf",
            "achats.assets/a.txt",
            "achats.assets/%ZZ.pdf",
            "achats.assets/%4",
            "achats.assets/%FF.pdf",
        ] {
            assert!(AttachmentName::in_link(&note, target).is_none(), "{target}");
        }
    }

    #[test]
    fn a_moment_out_of_bounds_is_refused() {
        assert!(Moment::new(2026, 12, 31, 23, 59).is_ok());
        assert!(Moment::new(2026, 1, 1, 0, 0).is_ok());
        for (month, day, hour, minute) in [
            (0, 1, 0, 0),
            (13, 1, 0, 0),
            (1, 0, 0, 0),
            (1, 32, 0, 0),
            (1, 1, 24, 0),
            (1, 1, 0, 60),
        ] {
            assert_eq!(
                Moment::new(2026, month, day, hour, minute),
                Err(InvalidMoment)
            );
        }
    }
}
