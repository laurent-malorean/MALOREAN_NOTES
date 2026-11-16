//! Dossiers de la bibliothèque : un nom par niveau, choisi par l'utilisateur.

use std::fmt;

use crate::FileName;

const SEPARATOR: char = '/';
const ATTACHMENT_SUFFIX: &str = ".assets";
const FIRST_DUPLICATE_NUMBER: u32 = 2;

/// Nom d'un dossier : un seul élément de chemin, tel que l'utilisateur l'a écrit.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct FolderName(String);

/// Nom ou chemin de dossier refusé : vide, caché, hors bibliothèque, ou dossier de pièces jointes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InvalidFolderName(pub String);

impl fmt::Display for InvalidFolderName {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "nom de dossier invalide : « {} »", self.0)
    }
}

impl std::error::Error for InvalidFolderName {}

impl FolderName {
    /// Accepte un nom de dossier s'il est sûr ; les espaces autour sont retirés.
    ///
    /// # Errors
    ///
    /// [`InvalidFolderName`] si le nom est vide, caché, contient un séparateur
    /// ou désigne un dossier de pièces jointes (`….assets`).
    pub fn parse(name: &str) -> Result<Self, InvalidFolderName> {
        let trimmed = name.trim();
        let is_safe = !trimmed.is_empty()
            && !trimmed.starts_with('.')
            && !trimmed.contains(['/', '\\', '\0'])
            && !trimmed.to_lowercase().ends_with(ATTACHMENT_SUFFIX);
        if is_safe {
            Ok(Self(trimmed.to_owned()))
        } else {
            Err(InvalidFolderName(name.to_owned()))
        }
    }

    /// Le nom, tel qu'il a été écrit.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Un dossier de la bibliothèque, désigné par son chemin depuis la racine (la bibliothèque elle-même).
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Folder(Vec<FolderName>);

impl Folder {
    /// La racine : la bibliothèque elle-même.
    #[must_use]
    pub fn root() -> Self {
        Self(Vec::new())
    }

    /// Le dossier désigné par `a/b/c` ; la chaîne vide désigne la racine.
    ///
    /// # Errors
    ///
    /// [`InvalidFolderName`] (avec le chemin entier) si l'un des noms est refusé.
    pub fn parse(path: &str) -> Result<Self, InvalidFolderName> {
        if path.is_empty() {
            return Ok(Self::root());
        }
        path.split(SEPARATOR)
            .map(|part| match FolderName::parse(part) {
                Ok(name) if name.as_str() == part => Ok(name),
                _ => Err(InvalidFolderName(path.to_owned())),
            })
            .collect::<Result<_, _>>()
            .map(Self)
    }

    /// Le sous-dossier `name` de ce dossier.
    #[must_use]
    pub fn join(&self, name: FolderName) -> Self {
        let mut names = self.0.clone();
        names.push(name);
        Self(names)
    }

    /// Le dossier qui contient celui-ci ; aucun pour la racine.
    #[must_use]
    pub fn parent(&self) -> Option<Self> {
        let (_, parent) = self.0.split_last()?;
        Some(Self(parent.to_vec()))
    }

    /// Le nom du dossier ; aucun pour la racine.
    #[must_use]
    pub fn name(&self) -> Option<&FolderName> {
        self.0.last()
    }

    /// Les noms des dossiers traversés depuis la racine.
    #[must_use]
    pub fn names(&self) -> &[FolderName] {
        &self.0
    }

    /// Vrai si ce dossier est `other` ou se trouve quelque part dedans.
    #[must_use]
    pub fn is_within(&self, other: &Self) -> bool {
        self.0.starts_with(&other.0)
    }

    /// Ce dossier, une fois `from` déplacé en `to` : inchangé s'il n'est pas dans `from`.
    #[must_use]
    pub fn moved(&self, from: &Self, to: &Self) -> Self {
        match self.0.strip_prefix(from.0.as_slice()) {
            Some(rest) => Self([to.0.as_slice(), rest].concat()),
            None => self.clone(),
        }
    }

    /// Ce dossier, ou le premier `Nom 2`, `Nom 3`… qui n'est pas pris (comme le Finder).
    /// La racine reste la racine.
    #[must_use]
    pub fn deduplicated(self, mut is_taken: impl FnMut(&Self) -> bool) -> Self {
        let (Some(parent), Some(name)) = (self.parent(), self.name()) else {
            return self;
        };
        if !is_taken(&self) {
            return self;
        }
        (FIRST_DUPLICATE_NUMBER..)
            .map(|n| parent.join(FolderName(format!("{} {n}", name.as_str()))))
            .find(|candidate| !is_taken(candidate))
            .unwrap_or(self)
    }

    /// Le chemin `a/b/c` ; vide pour la racine.
    #[must_use]
    pub fn to_path(&self) -> String {
        let names: Vec<&str> = self.0.iter().map(FolderName::as_str).collect();
        names.join("/")
    }
}

/// Les dossiers dans l'ordre de l'arbre : chaque dossier suivi de ses sous-dossiers,
/// les frères par ordre alphabétique sans tenir compte de la casse.
#[must_use]
pub fn sort_for_display(mut folders: Vec<Folder>) -> Vec<Folder> {
    let key = |folder: &Folder| -> Vec<(String, String)> {
        folder
            .names()
            .iter()
            .map(|n| (n.as_str().to_lowercase(), n.as_str().to_owned()))
            .collect()
    };
    folders.sort_by_cached_key(key);
    folders
}

/// Une note désignée par son dossier et son nom de fichier.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct NotePath {
    folder: Folder,
    name: FileName,
}

impl NotePath {
    /// La note `name` du dossier `folder`.
    #[must_use]
    pub fn new(folder: Folder, name: FileName) -> Self {
        Self { folder, name }
    }

    /// La note désignée par `a/b/note.md`, ou `note.md` à la racine.
    ///
    /// # Errors
    ///
    /// [`crate::InvalidFileName`] (avec le chemin entier) si le nom de fichier ou l'un des
    /// dossiers est refusé.
    pub fn parse(path: &str) -> Result<Self, crate::InvalidFileName> {
        let invalid = || crate::InvalidFileName(path.to_owned());
        let (folder, name) = match path.rsplit_once(SEPARATOR) {
            Some(("", _)) => return Err(invalid()),
            Some((folder, name)) => (Folder::parse(folder).map_err(|_| invalid())?, name),
            None => (Folder::root(), path),
        };
        let name = FileName::parse(name).map_err(|_| invalid())?;
        Ok(Self { folder, name })
    }

    /// Le dossier de la note.
    #[must_use]
    pub fn folder(&self) -> &Folder {
        &self.folder
    }

    /// Le nom de fichier de la note.
    #[must_use]
    pub fn name(&self) -> &FileName {
        &self.name
    }

    /// La même note sous un autre nom, dans le même dossier.
    #[must_use]
    pub fn renamed(&self, name: FileName) -> Self {
        Self::new(self.folder.clone(), name)
    }

    /// Le chemin `a/b/note.md` depuis la racine de la bibliothèque.
    #[must_use]
    pub fn to_path(&self) -> String {
        if self.folder == Folder::root() {
            self.name.as_str().to_owned()
        } else {
            format!("{}/{}", self.folder.to_path(), self.name.as_str())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_free_folder_keeps_its_name() {
        assert_eq!(
            folder("a/Projets").deduplicated(|_| false),
            folder("a/Projets")
        );
    }

    #[test]
    fn a_taken_folder_gets_the_first_free_number_like_the_finder() {
        let taken = [folder("a/Projets"), folder("a/Projets 2")];
        assert_eq!(
            folder("a/Projets").deduplicated(|f| taken.contains(f)),
            folder("a/Projets 3")
        );
    }

    #[test]
    fn the_root_is_never_renamed() {
        assert_eq!(Folder::root().deduplicated(|_| true), Folder::root());
    }

    fn folder(path: &str) -> Folder {
        Folder::parse(path).unwrap()
    }

    #[test]
    fn a_folder_name_keeps_the_spelling_of_the_user() {
        assert_eq!(
            FolderName::parse("  Projets perso ").unwrap().as_str(),
            "Projets perso"
        );
    }

    #[test]
    fn unsafe_folder_names_are_refused() {
        for bad in [
            "",
            "  ",
            ".git",
            "a/b",
            "a\\b",
            "x\0",
            "voyage.assets",
            "V.ASSETS",
        ] {
            assert_eq!(
                FolderName::parse(bad),
                Err(InvalidFolderName(bad.to_owned())),
                "{bad:?}"
            );
        }
    }

    #[test]
    fn a_refused_folder_name_says_so() {
        assert_eq!(
            InvalidFolderName(".git".into()).to_string(),
            "nom de dossier invalide : « .git »"
        );
    }

    #[test]
    fn the_empty_path_is_the_root() {
        assert_eq!(folder(""), Folder::root());
        assert_eq!(Folder::root().to_path(), "");
        assert_eq!(Folder::root().parent(), None);
        assert_eq!(Folder::root().name(), None);
    }

    #[test]
    fn a_nested_folder_is_read_and_written_as_a_path() {
        let nested = folder("Travail/Réunions");
        assert_eq!(nested.to_path(), "Travail/Réunions");
        assert_eq!(nested.parent(), Some(folder("Travail")));
        assert_eq!(nested.name().map(FolderName::as_str), Some("Réunions"));
        assert_eq!(nested.names().len(), 2);
    }

    #[test]
    fn a_path_with_a_bad_or_padded_part_is_refused_whole() {
        for bad in ["a//b", "a/../b", "/a", "a/", "a/ b", "a/x.assets"] {
            assert_eq!(Folder::parse(bad), Err(InvalidFolderName(bad.to_owned())));
        }
    }

    #[test]
    fn a_sub_folder_is_joined_to_its_parent() {
        let name = FolderName::parse("b").unwrap();
        assert_eq!(folder("a").join(name), folder("a/b"));
    }

    #[test]
    fn a_folder_is_within_itself_and_its_ancestors_only() {
        assert!(folder("a/b").is_within(&folder("a/b")));
        assert!(folder("a/b").is_within(&folder("a")));
        assert!(folder("a/b").is_within(&Folder::root()));
        assert!(!folder("a").is_within(&folder("a/b")));
        assert!(!folder("ab").is_within(&folder("a")));
    }

    #[test]
    fn moving_a_folder_moves_what_it_contains() {
        let (from, to) = (folder("a"), folder("x/y"));
        assert_eq!(folder("a/b").moved(&from, &to), folder("x/y/b"));
        assert_eq!(folder("a").moved(&from, &to), folder("x/y"));
        assert_eq!(folder("c").moved(&from, &to), folder("c"));
    }

    #[test]
    fn folders_are_shown_as_a_tree_in_alphabetical_order() {
        let sorted = sort_for_display(vec![
            folder("b"),
            folder("A/z"),
            folder("a"),
            folder("A"),
            folder("A/b"),
        ]);
        let paths: Vec<String> = sorted.iter().map(Folder::to_path).collect();
        assert_eq!(paths, ["A", "A/b", "A/z", "a", "b"]);
    }

    #[test]
    fn a_note_path_is_read_and_written() {
        let note = NotePath::parse("Travail/Réunions/lundi.md").unwrap();
        assert_eq!(note.folder(), &folder("Travail/Réunions"));
        assert_eq!(note.name().as_str(), "lundi.md");
        assert_eq!(note.to_path(), "Travail/Réunions/lundi.md");
        let at_root = NotePath::parse("idee.md").unwrap();
        assert_eq!(at_root.folder(), &Folder::root());
        assert_eq!(at_root.to_path(), "idee.md");
    }

    #[test]
    fn a_renamed_note_stays_in_its_folder() {
        let note = NotePath::parse("a/x.md").unwrap();
        let renamed = note.renamed(FileName::parse("y.md").unwrap());
        assert_eq!(renamed.to_path(), "a/y.md");
    }

    #[test]
    fn a_dangerous_note_path_is_refused_whole() {
        for bad in [
            "../secret.md",
            "a/../b.md",
            ".cache/a.md",
            "a/b.txt",
            "/a.md",
            "",
        ] {
            assert_eq!(
                NotePath::parse(bad),
                Err(crate::InvalidFileName(bad.to_owned())),
                "{bad:?}"
            );
        }
    }
}
