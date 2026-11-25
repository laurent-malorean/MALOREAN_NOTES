//! Liens entre notes, à la Obsidian, par le nom seul : `[[titre]]` écrit dans une note désigne la
//! note qui porte ce titre, sans tenir compte des majuscules, des accents ni des espaces en trop.
//!
//! - `[[nom.canvas]]` désigne le canvas dont le nom de fichier est `nom.canvas` ; un titre seul ne
//!   désigne jamais un canvas.
//! - `[[Dossier/titre]]` précise le dossier quand plusieurs contenus portent le même nom.
//! - Un nom porté par plusieurs contenus, sans dossier pour les départager, est un lien ambigu :
//!   il n'ouvre aucun des contenus au hasard ([`Resolution::Ambiguous`]).

use crate::NotePath;
use unicode_normalization::UnicodeNormalization;
use unicode_normalization::char::is_combining_mark;

const OPENING: &str = "[[";
const CLOSING: &str = "]]";
/// Sépare le titre visé du texte montré : `[[titre|texte]]`.
const SHOWN_TEXT: char = '|';
/// Sépare le dossier du nom dans un lien : `[[Dossier/titre]]`.
const FOLDER_SEPARATOR: char = '/';
/// L'extension qui fait d'un nom celui d'un canvas : `[[nom.canvas]]`.
const CANVAS_EXTENSION: &str = ".canvas";

/// Les cibles des liens du texte (le titre, le nom de canvas ou le chemin écrit entre les
/// crochets), dans l'ordre où elles apparaissent.
///
/// `[[titre|texte]]` vise `titre`. Un lien vide ou coupé par un retour à la ligne n'en est pas un.
#[must_use]
pub fn linked_targets(content: &str) -> Vec<&str> {
    let mut titles = Vec::new();
    let mut rest = content;
    while let Some(end) = rest.find(CLOSING) {
        let before = &rest[..end];
        if let Some(start) = before.rfind(OPENING) {
            let inside = &before[start + OPENING.len()..];
            let target = inside.split(SHOWN_TEXT).next().unwrap_or_default().trim();
            if !target.is_empty() && !inside.contains('\n') {
                titles.push(target);
            }
        }
        rest = &rest[end + CLOSING.len()..];
    }
    titles
}

/// Vrai si les deux titres désignent la même note : mêmes mots, majuscules et accents ignorés.
#[must_use]
pub fn same_title(a: &str, b: &str) -> bool {
    folded(a) == folded(b)
}

/// Ce que désigne un lien écrit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Resolution {
    /// Un seul contenu porte ce nom : le lien l'ouvre.
    Found(NotePath),
    /// Plusieurs contenus portent ce nom : le lien n'en ouvre aucun ; ils sont donnés dans
    /// l'ordre reçu, pour que l'utilisateur précise le dossier.
    Ambiguous(Vec<NotePath>),
    /// Aucun contenu ne porte ce nom.
    Missing,
}

/// Un contenu qu'un lien peut désigner, tel que le nom, le dossier et le type le rendent.
#[derive(Debug, Clone)]
struct Linkable {
    path: NotePath,
    /// Le nom tel qu'on l'écrit dans un lien : le titre, ou `nom.canvas` pour un canvas.
    written: String,
    /// Le nom, ramené à des mots sans majuscule ni accent.
    name: Vec<String>,
    /// Les dossiers du chemin, de la même façon.
    folder: Vec<String>,
    canvas: bool,
}

/// Une cible de lien lue : son dossier s'il est écrit, son nom, et si c'est un canvas.
struct Target {
    folder: Option<Vec<String>>,
    name: Vec<String>,
    /// Le texte entier, dossier compris, quand le titre d'un contenu contient lui-même un `/`.
    whole: Vec<String>,
    canvas: bool,
}

impl Target {
    fn parse(text: &str) -> Self {
        let text = text.trim();
        let (without_extension, canvas) = strip_canvas(text);
        let (folder, name) = match without_extension.rsplit_once(FOLDER_SEPARATOR) {
            Some((folder, name)) => (Some(folded_path(folder)), name),
            None => (None, without_extension),
        };
        Self {
            folder,
            name: folded(name),
            whole: folded(without_extension),
            canvas,
        }
    }
}

/// Le texte sans l'extension `.canvas` (majuscules ignorées), et vrai s'il l'avait.
fn strip_canvas(text: &str) -> (&str, bool) {
    let cut = text.len().saturating_sub(CANVAS_EXTENSION.len());
    match text.get(cut..) {
        Some(end) if cut > 0 && end.eq_ignore_ascii_case(CANVAS_EXTENSION) => (&text[..cut], true),
        _ => (text, false),
    }
}

/// Les dossiers d'un chemin écrit, chacun ramené à des mots ; les noms vides sont ignorés.
fn folded_path(path: &str) -> Vec<String> {
    path.split(FOLDER_SEPARATOR)
        .map(|name| folded(name).join(" "))
        .filter(|name| !name.is_empty())
        .collect()
}

/// Les contenus que les liens peuvent désigner : retrouve celui que désigne un lien écrit, et
/// donne le lien à écrire pour en désigner un.
#[derive(Debug, Clone, Default)]
pub struct LinkIndex {
    entries: Vec<Linkable>,
}

impl LinkIndex {
    /// Les contenus d'un espace de travail, chacun avec son titre affiché. Le nom d'un canvas est
    /// celui de son fichier, sans autre titre.
    #[must_use]
    pub fn new(contents: impl IntoIterator<Item = (NotePath, String)>) -> Self {
        let entries = contents
            .into_iter()
            .map(|(path, title)| {
                let canvas = path.name().is_canvas();
                let written = if canvas {
                    format!("{}{CANVAS_EXTENSION}", path.name().stem())
                } else {
                    title
                };
                let name = if canvas {
                    folded(path.name().stem())
                } else {
                    folded(&written)
                };
                let folder = path
                    .folder()
                    .names()
                    .iter()
                    .map(|name| folded(name.as_str()).join(" "))
                    .collect();
                Linkable {
                    path,
                    written,
                    name,
                    folder,
                    canvas,
                }
            })
            .collect();
        Self { entries }
    }

    /// Ce que désigne la cible `target` d'un lien : le contenu, plusieurs contenus, ou aucun.
    #[must_use]
    pub fn resolve(&self, target: &str) -> Resolution {
        let target = Target::parse(target);
        let mut found = self.matching(&target.name, target.folder.as_deref(), target.canvas);
        // Un titre qui contient un `/` n'est pas un dossier : le texte entier est alors le titre.
        if found.is_empty() && target.folder.is_some() {
            found = self.matching(&target.whole, None, target.canvas);
        }
        match found.as_slice() {
            [] => Resolution::Missing,
            [only] => Resolution::Found((*only).clone()),
            _ => Resolution::Ambiguous(found.into_iter().cloned().collect()),
        }
    }

    /// Le lien à écrire pour désigner le contenu `path` : son nom seul quand il est unique ;
    /// précédé de son dossier quand un autre contenu porte le même nom. `None` si `path` n'est
    /// pas un contenu connu.
    #[must_use]
    pub fn written(&self, path: &NotePath) -> Option<String> {
        let entry = self.entries.iter().find(|entry| entry.path == *path)?;
        let qualified = format!(
            "{}{FOLDER_SEPARATOR}{}",
            path.folder().to_path(),
            entry.written
        );
        let designates = |text: &str| self.resolve(text) == Resolution::Found(path.clone());
        Some(if designates(&entry.written) {
            entry.written.clone()
        } else {
            qualified
        })
    }

    fn matching(&self, name: &[String], folder: Option<&[String]>, canvas: bool) -> Vec<&NotePath> {
        self.entries
            .iter()
            .filter(|entry| {
                entry.canvas == canvas
                    && entry.name == name
                    && folder.is_none_or(|folder| entry.folder == folder)
            })
            .map(|entry| &entry.path)
            .collect()
    }
}

fn folded(title: &str) -> Vec<String> {
    title
        .split_whitespace()
        .map(|word| {
            word.chars()
                .flat_map(char::to_lowercase)
                .nfd()
                .filter(|c| !is_combining_mark(*c))
                .collect()
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use proptest::prelude::*;

    #[test]
    fn every_link_of_the_text_is_found_in_order() {
        assert_eq!(
            linked_targets("Voir [[Courses]] et [[Recette de crêpes]].\n[[Agenda]]"),
            ["Courses", "Recette de crêpes", "Agenda"]
        );
    }

    #[test]
    fn a_link_with_a_shown_text_targets_its_title() {
        assert_eq!(linked_targets("[[Courses|la liste]]"), ["Courses"]);
    }

    #[test]
    fn spaces_around_the_title_are_ignored() {
        assert_eq!(linked_targets("[[  Courses  ]]"), ["Courses"]);
    }

    #[test]
    fn empty_or_broken_links_are_not_links() {
        assert!(linked_targets("[[]] [[ ]] [[|texte]] [[a\nb]] [[sans fin").is_empty());
        assert!(linked_targets("fin]] sans début").is_empty());
    }

    #[test]
    fn the_innermost_opening_starts_the_link() {
        assert_eq!(linked_targets("[[a [[Courses]]"), ["Courses"]);
        assert_eq!(linked_targets("[[Un]]]] [[Deux]]"), ["Un", "Deux"]);
    }

    #[test]
    fn titles_match_whatever_the_case_accents_and_spacing() {
        assert!(same_title("Recette de crêpes", "recette  DE crepes "));
        assert!(!same_title("Recette de crêpes", "Recette de galettes"));
        assert!(!same_title("Recettes", "Recette"));
    }

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn index(contents: &[(&str, &str)]) -> LinkIndex {
        LinkIndex::new(
            contents
                .iter()
                .map(|(path_text, title)| (path(path_text), (*title).to_owned())),
        )
    }

    fn found(text: &str) -> Resolution {
        Resolution::Found(path(text))
    }

    fn ambiguous(texts: &[&str]) -> Resolution {
        Resolution::Ambiguous(texts.iter().map(|text| path(text)).collect())
    }

    #[test]
    fn a_title_leads_to_the_note_with_that_title_in_any_folder() {
        let index = index(&[
            ("a.md", "Agenda"),
            ("Cuisine/crepes.md", "Recette de crêpes"),
        ]);
        assert_eq!(
            index.resolve("recette  DE crepes "),
            found("Cuisine/crepes.md")
        );
        assert_eq!(index.resolve("Agenda"), found("a.md"));
        assert_eq!(index.resolve("Recette"), Resolution::Missing);
        assert_eq!(index.resolve(""), Resolution::Missing);
    }

    #[test]
    fn two_notes_with_the_same_title_make_the_link_ambiguous() {
        let index = index(&[
            ("a.md", "Courses"),
            ("Vieux/b.md", "Courses"),
            ("c.md", "Agenda"),
        ]);
        assert_eq!(index.resolve("courses"), ambiguous(&["a.md", "Vieux/b.md"]));
    }

    #[test]
    fn a_folder_before_the_title_tells_two_notes_apart() {
        let index = index(&[
            ("a.md", "Courses"),
            ("Vieux/b.md", "Courses"),
            ("Vieux/Archives/c.md", "Courses"),
        ]);
        assert_eq!(index.resolve("Vieux/Courses"), found("Vieux/b.md"));
        assert_eq!(index.resolve("vieux / COURSES"), found("Vieux/b.md"));
        assert_eq!(
            index.resolve("Vieux/Archives/Courses"),
            found("Vieux/Archives/c.md")
        );
        assert_eq!(index.resolve("/Courses"), found("a.md"));
        assert_eq!(index.resolve("Autre/Courses"), Resolution::Missing);
    }

    #[test]
    fn a_title_with_a_slash_is_still_found_whole() {
        let index = index(&[("a.md", "Oui/Non")]);
        assert_eq!(index.resolve("Oui/Non"), found("a.md"));
    }

    #[test]
    fn a_canvas_is_linked_by_its_file_name_with_its_extension() {
        let index = index(&[
            ("Plan du projet.canvas", "Sans titre"),
            ("Idées/Plan.canvas", "Sans titre"),
            ("plan.md", "Plan du projet"),
        ]);
        assert_eq!(
            index.resolve("Plan du projet.canvas"),
            found("Plan du projet.canvas")
        );
        assert_eq!(
            index.resolve("plan DU projet.CANVAS"),
            found("Plan du projet.canvas")
        );
        assert_eq!(
            index.resolve("Idées/Plan.canvas"),
            found("Idées/Plan.canvas")
        );
        assert_eq!(index.resolve("Plan.canvas"), found("Idées/Plan.canvas"));
        assert_eq!(index.resolve("Plan du projet"), found("plan.md"));
        assert_eq!(index.resolve("Autre.canvas"), Resolution::Missing);
        assert_eq!(index.resolve(".canvas"), Resolution::Missing);
    }

    #[test]
    fn a_title_alone_never_leads_to_a_canvas() {
        let index = index(&[("Plan.canvas", "Sans titre")]);
        assert_eq!(index.resolve("Plan"), Resolution::Missing);
        assert_eq!(index.resolve("Sans titre"), Resolution::Missing);
    }

    #[test]
    fn two_canvases_of_the_same_name_are_ambiguous_until_the_folder_is_given() {
        let index = index(&[("A/Plan.canvas", ""), ("B/Plan.canvas", "")]);
        assert_eq!(
            index.resolve("Plan.canvas"),
            ambiguous(&["A/Plan.canvas", "B/Plan.canvas"])
        );
        assert_eq!(index.resolve("B/Plan.canvas"), found("B/Plan.canvas"));
    }

    #[test]
    fn the_written_link_is_the_name_alone_when_it_is_unique() {
        let index = index(&[
            ("a.md", "Agenda"),
            ("Cuisine/crepes.md", "Recette de crêpes"),
            ("Plan du projet.canvas", "Sans titre"),
        ]);
        assert_eq!(index.written(&path("a.md")).as_deref(), Some("Agenda"));
        assert_eq!(
            index.written(&path("Cuisine/crepes.md")).as_deref(),
            Some("Recette de crêpes")
        );
        assert_eq!(
            index.written(&path("Plan du projet.canvas")).as_deref(),
            Some("Plan du projet.canvas")
        );
        assert_eq!(index.written(&path("absente.md")), None);
    }

    #[test]
    fn the_written_link_carries_the_folder_when_the_name_is_shared() {
        let index = index(&[
            ("a.md", "Courses"),
            ("Vieux/b.md", "Courses"),
            ("A/Plan.canvas", ""),
            ("B/Plan.canvas", ""),
        ]);
        assert_eq!(index.written(&path("a.md")).as_deref(), Some("/Courses"));
        assert_eq!(
            index.written(&path("Vieux/b.md")).as_deref(),
            Some("Vieux/Courses")
        );
        assert_eq!(
            index.written(&path("B/Plan.canvas")).as_deref(),
            Some("B/Plan.canvas")
        );
        for written in ["/Courses", "Vieux/Courses", "B/Plan.canvas"] {
            assert!(
                matches!(index.resolve(written), Resolution::Found(_)),
                "{written}"
            );
        }
    }

    #[test]
    fn the_written_link_of_a_title_with_a_slash_still_leads_to_its_note() {
        let index = index(&[("a.md", "Oui/Non"), ("Oui/Non.md", "Autre")]);
        let written = index.written(&path("a.md")).unwrap();
        assert_eq!(index.resolve(&written), found("a.md"));
    }

    proptest! {
        #[test]
        fn any_title_written_in_a_link_is_found(title in "[a-zA-Zéè]{1,8}( [a-zA-Zéè]{1,8}){0,3}") {
            let text = format!("avant [[{title}]] après");
            prop_assert_eq!(linked_targets(&text), [title.as_str()]);
            let index = index(&[("note.md", &title)]);
            prop_assert_eq!(index.resolve(&title.to_uppercase()), found("note.md"));
        }
    }
}
