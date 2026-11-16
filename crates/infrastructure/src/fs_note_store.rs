//! Bibliothèque Markdown sur disque : un fichier `.md` par note, rangé dans des dossiers.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use application::{
    AttachmentLocation, LibraryLocation, LibraryOpener, NoteStore, StoreError, StoredNote,
    TrashContents,
};
use domain::{AttachmentName, FileName, Folder, FolderName, Modified, NotePath};

const TEMPORARY_PREFIX: &str = ".";
const TEMPORARY_SUFFIX: &str = ".enregistrement";
/// La corbeille : un dossier caché à la racine, comme dans Obsidian ; elle n'est donc jamais
/// listée parmi les dossiers de la bibliothèque.
const TRASH_FOLDER: &str = ".trash";
const HIDDEN_PREFIX: char = '.';

/// Les notes d'un dossier de la bibliothèque.
#[derive(Debug)]
pub struct FsNoteStore {
    root: PathBuf,
}

impl FsNoteStore {
    /// Les notes du dossier `root`.
    #[must_use]
    pub fn new(root: PathBuf) -> Self {
        Self { root }
    }

    fn folder_path(&self, folder: &Folder) -> PathBuf {
        let mut path = self.root.clone();
        path.extend(folder.names().iter().map(FolderName::as_str));
        path
    }

    /// Écrit un fichier temporaire puis le met à la place de la note : jamais de note à moitié
    /// écrite. Avec `date`, le fichier garde cette date de modification.
    fn write_atomically(
        &self,
        note: &NotePath,
        content: &str,
        date: Option<SystemTime>,
    ) -> Result<(), StoreError> {
        let temporary = self.folder_path(note.folder()).join(format!(
            "{TEMPORARY_PREFIX}{}{TEMPORARY_SUFFIX}",
            note.name().as_str()
        ));
        let written = fs::write(&temporary, content)
            .and_then(|()| match date {
                Some(date) => fs::File::options()
                    .write(true)
                    .open(&temporary)?
                    .set_modified(date),
                None => Ok(()),
            })
            .and_then(|()| fs::rename(&temporary, self.path(note)));
        written.map_err(|error| {
            // Nettoyage best-effort : l'erreur d'origine est celle que l'on rapporte.
            if let Err(cleanup) = fs::remove_file(&temporary) {
                tracing::debug!(%cleanup, "fichier temporaire déjà absent");
            }
            unavailable(error)
        })
    }

    fn path(&self, note: &NotePath) -> PathBuf {
        self.folder_path(note.folder()).join(note.name().as_str())
    }

    fn attachment_path(&self, note: &NotePath) -> PathBuf {
        self.folder_path(note.folder())
            .join(note.name().attachment_folder())
    }

    /// Les noms exacts des notes : la casse compte, même sur un disque qui l'ignore.
    fn note_names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        let mut names = Vec::new();
        for entry in fs::read_dir(self.folder_path(folder)).map_err(unavailable)? {
            let entry = entry.map_err(unavailable)?;
            let is_file = entry.file_type().map_err(unavailable)?.is_file();
            let parsed = entry.file_name().to_str().map(FileName::parse);
            if let (true, Some(Ok(name))) = (is_file, parsed) {
                names.push(name);
            }
        }
        Ok(names)
    }

    /// Les noms exacts des sous-dossiers de `folder` : ni cachés, ni pièces jointes, ni liens.
    fn sub_folders(&self, folder: &Folder) -> Result<Vec<Folder>, StoreError> {
        let mut folders = Vec::new();
        for entry in fs::read_dir(self.folder_path(folder)).map_err(unavailable)? {
            let entry = entry.map_err(unavailable)?;
            let is_dir = entry.file_type().map_err(unavailable)?.is_dir();
            let name = entry.file_name();
            let parsed = name.to_str().map(|n| (n, FolderName::parse(n)));
            if let (true, Some((written, Ok(name)))) = (is_dir, parsed)
                && name.as_str() == written
            {
                folders.push(folder.join(name));
            }
        }
        Ok(folders)
    }

    /// Vrai si le dossier existe sous ce nom exact (la casse compte).
    fn has_folder(&self, folder: &Folder) -> Result<bool, StoreError> {
        match folder.parent() {
            None => Ok(true),
            Some(parent) => {
                Ok(self.has_folder(&parent)? && self.sub_folders(&parent)?.contains(folder))
            }
        }
    }

    /// La corbeille, vue comme une petite bibliothèque rangée dans le dossier caché.
    fn trash_store(&self) -> Self {
        Self::new(self.root.join(TRASH_FOLDER))
    }

    fn exists(&self) -> bool {
        self.root.is_dir()
    }

    fn has_note(&self, note: &NotePath) -> Result<bool, StoreError> {
        Ok(
            self.has_folder(note.folder())?
                && self.note_names(note.folder())?.contains(note.name()),
        )
    }

    /// Le dossier n'a rien de visible : les fichiers cachés (`.DS_Store` du Finder) ne comptent pas.
    fn is_empty_folder(&self, folder: &Folder) -> Result<bool, StoreError> {
        for entry in fs::read_dir(self.folder_path(folder)).map_err(unavailable)? {
            let name = entry.map_err(unavailable)?.file_name();
            if !name.to_string_lossy().starts_with(HIDDEN_PREFIX) {
                return Ok(false);
            }
        }
        Ok(true)
    }

    /// Retire `folder` et ses parents, tant qu'ils n'ont rien de visible ; la racine reste.
    fn prune(&self, folder: &Folder) -> Result<(), StoreError> {
        let mut current = folder.clone();
        while let Some(parent) = current.parent() {
            if !self.is_empty_folder(&current)? {
                return Ok(());
            }
            fs::remove_dir_all(self.folder_path(&current)).map_err(unavailable)?;
            current = parent;
        }
        Ok(())
    }

    /// Toutes les notes, à toute profondeur.
    fn all_notes(&self, folders: &[Folder]) -> Result<Vec<StoredNote>, StoreError> {
        let mut notes = self.list(&Folder::root())?;
        for folder in folders {
            notes.extend(self.list(folder)?);
        }
        Ok(notes)
    }

    /// Le contenu et la date de la note ; en erreur, la version lisible d'un contenu qui n'est pas en UTF-8.
    fn read_raw(&self, name: &NotePath) -> Result<(Result<String, String>, Modified), StoreError> {
        let path = self.path(name);
        let bytes = fs::read(&path).map_err(|e| not_found_or(name, e))?;
        let modified = modified(&path).map_err(|e| not_found_or(name, e))?;
        let content = String::from_utf8(bytes)
            .map_err(|e| String::from_utf8_lossy(e.as_bytes()).into_owned());
        Ok((content, modified))
    }
}

impl NoteStore for FsNoteStore {
    /// Une note qui n'est pas en UTF-8 reste listée, avec un titre tiré de ce qui est lisible.
    fn list(&self, folder: &Folder) -> Result<Vec<StoredNote>, StoreError> {
        let mut notes = Vec::new();
        for name in self.note_names(folder)? {
            let name = NotePath::new(folder.clone(), name);
            let (content, modified) = self.read_raw(&name)?;
            let content = content.unwrap_or_else(|lossy| lossy);
            notes.push(StoredNote {
                path: name,
                content,
                modified,
            });
        }
        Ok(notes)
    }

    fn read(&self, name: &NotePath) -> Result<StoredNote, StoreError> {
        if !self.note_names(name.folder())?.contains(name.name()) {
            return Err(StoreError::NotFound(name.clone()));
        }
        let (content, modified) = self.read_raw(name)?;
        let content = content.map_err(|_| StoreError::Unreadable(name.clone()))?;
        Ok(StoredNote {
            path: name.clone(),
            content,
            modified,
        })
    }

    fn write(&self, name: &NotePath, content: &str) -> Result<(), StoreError> {
        self.write_atomically(name, content, None)
    }

    fn write_keeping_date(&self, note: &NotePath, content: &str) -> Result<(), StoreError> {
        if !self.note_names(note.folder())?.contains(note.name()) {
            return Err(StoreError::NotFound(note.clone()));
        }
        let date = fs::metadata(self.path(note))
            .and_then(|metadata| metadata.modified())
            .map_err(|e| not_found_or(note, e))?;
        self.write_atomically(note, content, Some(date))
    }

    fn move_note(&self, from: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        if !self.note_names(from.folder())?.contains(from.name()) {
            return Err(StoreError::NotFound(from.clone()));
        }
        if !self.has_folder(to.folder())? {
            return Err(StoreError::FolderNotFound(to.folder().clone()));
        }
        let new_assets = self.attachment_path(to);
        if self.note_names(to.folder())?.contains(to.name()) || new_assets.exists() {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        fs::rename(self.path(from), self.path(to)).map_err(|e| not_found_or(from, e))?;
        let old_assets = self.attachment_path(from);
        if old_assets.is_dir() {
            fs::rename(old_assets, new_assets).map_err(unavailable)?;
        }
        Ok(())
    }

    fn names(&self, folder: &Folder) -> Result<Vec<FileName>, StoreError> {
        self.note_names(folder)
    }

    fn folders(&self) -> Result<Vec<Folder>, StoreError> {
        let mut found = Vec::new();
        let mut to_visit = vec![Folder::root()];
        while let Some(folder) = to_visit.pop() {
            for sub in self.sub_folders(&folder)? {
                to_visit.push(sub.clone());
                found.push(sub);
            }
        }
        Ok(found)
    }

    fn create_folder(&self, folder: &Folder) -> Result<(), StoreError> {
        let parent = folder.parent().unwrap_or_else(Folder::root);
        if !self.has_folder(&parent)? {
            return Err(StoreError::FolderNotFound(parent));
        }
        fs::create_dir(self.folder_path(folder)).map_err(|error| {
            if error.kind() == io::ErrorKind::AlreadyExists {
                StoreError::FolderAlreadyExists(folder.clone())
            } else {
                unavailable(error)
            }
        })
    }

    /// Un dossier renommé en changeant seulement la casse (`travail` → `Travail`) n'est pas
    /// un dossier pris, même sur un disque qui ignore la casse.
    fn move_folder(&self, from: &Folder, to: &Folder) -> Result<(), StoreError> {
        let parent = to.parent().unwrap_or_else(Folder::root);
        if !self.has_folder(from)? {
            return Err(StoreError::FolderNotFound(from.clone()));
        }
        if !self.has_folder(&parent)? {
            return Err(StoreError::FolderNotFound(parent));
        }
        let target = self.folder_path(to);
        let same_entry =
            fs::canonicalize(&target).ok() == fs::canonicalize(self.folder_path(from)).ok();
        if target.exists() && !same_entry {
            return Err(StoreError::FolderAlreadyExists(to.clone()));
        }
        fs::rename(self.folder_path(from), target).map_err(unavailable)
    }

    fn trash(&self) -> Result<TrashContents, StoreError> {
        let trash = self.trash_store();
        if !trash.exists() {
            return Ok(TrashContents::default());
        }
        let folders = trash.folders()?;
        let notes = trash.all_notes(&folders)?;
        Ok(TrashContents { folders, notes })
    }

    fn trash_note(&self, note: &NotePath, at: &NotePath) -> Result<(), StoreError> {
        if !self.has_note(note)? {
            return Err(StoreError::NotFound(note.clone()));
        }
        let trash = self.trash_store();
        if trash.path(at).exists() || trash.attachment_path(at).exists() {
            return Err(StoreError::AlreadyExists(at.clone()));
        }
        fs::create_dir_all(trash.folder_path(at.folder())).map_err(unavailable)?;
        move_with_attachments(
            (self.path(note), self.attachment_path(note)),
            (trash.path(at), trash.attachment_path(at)),
        )
        .map_err(|e| not_found_or(note, e))
    }

    fn trash_folder(&self, folder: &Folder, at: &Folder) -> Result<(), StoreError> {
        if !self.has_folder(folder)? {
            return Err(StoreError::FolderNotFound(folder.clone()));
        }
        let target = self.trash_store().folder_path(at);
        if target.exists() {
            return Err(StoreError::FolderAlreadyExists(at.clone()));
        }
        move_into_place(&self.folder_path(folder), &target).map_err(unavailable)
    }

    fn restore_note(&self, at: &NotePath, to: &NotePath) -> Result<(), StoreError> {
        let trash = self.trash_store();
        if !trash.exists() || !trash.has_note(at)? {
            return Err(StoreError::NotFound(at.clone()));
        }
        if self.has_note(to)? || self.attachment_path(to).exists() {
            return Err(StoreError::AlreadyExists(to.clone()));
        }
        fs::create_dir_all(self.folder_path(to.folder())).map_err(unavailable)?;
        move_with_attachments(
            (trash.path(at), trash.attachment_path(at)),
            (self.path(to), self.attachment_path(to)),
        )
        .map_err(|e| not_found_or(at, e))?;
        trash.prune(at.folder())
    }

    fn restore_folder(&self, at: &Folder, to: &Folder) -> Result<(), StoreError> {
        let trash = self.trash_store();
        if at.parent().is_none() || !trash.exists() || !trash.has_folder(at)? {
            return Err(StoreError::FolderNotFound(at.clone()));
        }
        if self.has_folder(to)? {
            if !trash.is_empty_folder(at)? {
                return Err(StoreError::FolderAlreadyExists(to.clone()));
            }
            return trash.prune(at);
        }
        move_into_place(&trash.folder_path(at), &self.folder_path(to)).map_err(unavailable)?;
        trash.prune(&at.parent().unwrap_or_else(Folder::root))
    }

    fn empty_trash(&self) -> Result<(), StoreError> {
        let trash = self.trash_store();
        if !trash.exists() {
            return Ok(());
        }
        fs::remove_dir_all(&trash.root).map_err(unavailable)
    }

    fn attachment_names(&self, note: &NotePath) -> Result<Vec<AttachmentName>, StoreError> {
        let entries = match fs::read_dir(self.attachment_path(note)) {
            Ok(entries) => entries,
            Err(error) if error.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(error) => return Err(unavailable(error)),
        };
        let mut names = Vec::new();
        for entry in entries {
            let entry = entry.map_err(unavailable)?;
            let is_file = entry.file_type().map_err(unavailable)?.is_file();
            let name = entry
                .file_name()
                .to_str()
                .and_then(AttachmentName::existing);
            if let (true, Some(name)) = (is_file, name) {
                names.push(name);
            }
        }
        Ok(names)
    }

    /// Écrit un fichier temporaire, puis le lie sous son nom : le lien échoue si le nom est
    /// pris (casse comprise sur un disque qui l'ignore), donc rien n'est jamais écrasé.
    fn write_attachment(
        &self,
        note: &NotePath,
        name: &AttachmentName,
        bytes: &[u8],
    ) -> Result<(), StoreError> {
        if !self.has_note(note)? {
            return Err(StoreError::NotFound(note.clone()));
        }
        let folder = self.attachment_path(note);
        if !folder.is_dir() {
            fs::create_dir(&folder).map_err(unavailable)?;
        }
        let file_name = name.to_name();
        let temporary = folder.join(format!("{TEMPORARY_PREFIX}{file_name}{TEMPORARY_SUFFIX}"));
        let linked = fs::write(&temporary, bytes)
            .and_then(|()| fs::hard_link(&temporary, folder.join(&file_name)));
        // Le fichier temporaire part dans tous les cas : seul le lien sous le vrai nom reste.
        if let Err(cleanup) = fs::remove_file(&temporary) {
            tracing::debug!(%cleanup, "fichier temporaire déjà absent");
        }
        linked.map_err(|error| match error.kind() {
            io::ErrorKind::AlreadyExists => StoreError::AttachmentAlreadyExists(file_name),
            _ => unavailable(error),
        })
    }

    fn attachment_location(
        &self,
        note: &NotePath,
        name: &AttachmentName,
    ) -> Result<AttachmentLocation, StoreError> {
        let path = self.attachment_path(note).join(name.to_name());
        if !path.is_file() {
            return Err(StoreError::AttachmentNotFound(name.to_name()));
        }
        path.to_str()
            .map(|p| AttachmentLocation::new(p.to_owned()))
            .ok_or_else(|| {
                StoreError::Unavailable(format!("chemin illisible : {}", path.display()))
            })
    }
}

/// Déplace un fichier de note et, s'il existe, son dossier de pièces jointes.
fn move_with_attachments(
    (note, attachments): (PathBuf, PathBuf),
    (to_note, to_attachments): (PathBuf, PathBuf),
) -> io::Result<()> {
    fs::rename(note, to_note)?;
    if attachments.is_dir() {
        fs::rename(attachments, to_attachments)?;
    }
    Ok(())
}

/// Déplace un dossier à `target`, en créant les dossiers qui manquent au-dessus.
fn move_into_place(folder: &Path, target: &Path) -> io::Result<()> {
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::rename(folder, target)
}

/// Ouvre une bibliothèque : un dossier existant sur le disque.
#[derive(Debug)]
pub struct FsLibraryOpener;

impl LibraryOpener for FsLibraryOpener {
    fn open(&self, location: &LibraryLocation) -> Result<Arc<dyn NoteStore>, StoreError> {
        let root = PathBuf::from(location.as_str());
        if !root.is_dir() {
            return Err(StoreError::Unavailable(format!(
                "le dossier « {} » est introuvable",
                location.as_str()
            )));
        }
        Ok(Arc::new(FsNoteStore::new(root)))
    }
}

fn modified(path: &Path) -> io::Result<Modified> {
    let since_epoch = fs::metadata(path)?
        .modified()?
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    Ok(Modified(
        u64::try_from(since_epoch.as_millis()).unwrap_or(u64::MAX),
    ))
}

fn not_found_or(name: &NotePath, error: io::Error) -> StoreError {
    if error.kind() == io::ErrorKind::NotFound {
        StoreError::NotFound(name.clone())
    } else {
        unavailable(error)
    }
}

fn unavailable(error: io::Error) -> StoreError {
    StoreError::Unavailable(error.to_string())
}
