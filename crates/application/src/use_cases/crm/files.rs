//! Les fichiers d'un CRM : où sont ses fiches, comment on les lit, comment on en crée une.

use domain::crm::{Action, Company, Crm, CrmKind, Person, Project, Reference, Stages};
use domain::{FileName, Folder, FolderName, NotePath};

use crate::{AppError, NoteStore, StoreError};

/// Le CRM ouvert : sa note, lue, et les dossiers de ses fiches.
#[derive(Debug)]
pub(super) struct CrmFiles<'a> {
    pub(super) store: &'a dyn NoteStore,
    /// Le texte du CRM, tel que lu.
    pub(super) content: String,
    pub(super) crm: Crm,
    /// Le dossier qui porte le nom de fichier du CRM et contient un dossier par sorte de fiche.
    base: Folder,
}

/// Une fiche lue sur le disque : sa référence, son chemin, son texte.
#[derive(Debug, Clone)]
pub(super) struct FicheText {
    pub(super) name: Reference,
    pub(super) path: NotePath,
    pub(super) content: String,
}

/// Toutes les fiches lisibles d'un CRM : celles dont le texte ne se lit pas sont laissées de côté.
#[derive(Debug, Default)]
pub(super) struct Fiches {
    pub(super) companies: Vec<(FicheText, Company)>,
    pub(super) people: Vec<(FicheText, Person)>,
    pub(super) actions: Vec<(FicheText, Action)>,
    pub(super) projects: Vec<(FicheText, Project)>,
    /// Les fiches illisibles, laissées de côté et jamais effacées.
    pub(super) unreadable: Vec<NotePath>,
}

impl<'a> CrmFiles<'a> {
    /// Ouvre le CRM de la note `path`.
    pub(super) fn open(store: &'a dyn NoteStore, path: &NotePath) -> Result<Self, AppError> {
        let content = store.read(path)?.content;
        let crm = Crm::parse(&content).ok_or(AppError::NotACrm)?;
        let stem = FolderName::parse(path.name().stem()).map_err(|_| AppError::NotACrm)?;
        Ok(Self {
            store,
            content,
            crm,
            base: path.folder().join(stem),
        })
    }

    pub(super) fn stages(&self) -> &Stages {
        &self.crm.stages
    }

    /// Le dossier où ce CRM range les fiches de cette sorte.
    pub(super) fn folder(&self, kind: CrmKind) -> Folder {
        kind.folder()
            .and_then(|name| FolderName::parse(name).ok())
            .map_or_else(|| self.base.clone(), |name| self.base.join(name))
    }

    /// Le chemin de la fiche `name` de cette sorte.
    pub(super) fn fiche_path(&self, kind: CrmKind, name: &Reference) -> Result<NotePath, AppError> {
        let file = FileName::parse(&format!("{}.md", name.as_str()))
            .map_err(|_| AppError::InvalidReference(name.as_str().to_owned()))?;
        Ok(NotePath::new(self.folder(kind), file))
    }

    /// Le texte de la fiche `name` de cette sorte, tel qu'il est maintenant sur le disque.
    ///
    /// # Errors
    ///
    /// [`AppError::FicheGone`] si la fiche n'existe plus ou n'a plus le `type:` de sa sorte.
    pub(super) fn read(&self, kind: CrmKind, name: &Reference) -> Result<FicheText, AppError> {
        let path = self.fiche_path(kind, name)?;
        let content = match self.store.read(&path) {
            Ok(note) => note.content,
            Err(StoreError::NotFound(_) | StoreError::FolderNotFound(_)) => {
                return Err(AppError::FicheGone);
            }
            Err(error) => return Err(error.into()),
        };
        if CrmKind::of(&content) != Some(kind) {
            return Err(AppError::FicheGone);
        }
        Ok(FicheText {
            name: name.clone(),
            path,
            content,
        })
    }

    /// Les fiches de cette sorte : un dossier qui n'existe pas encore n'en a aucune.
    fn read_all(&self, kind: CrmKind) -> Result<Vec<FicheText>, AppError> {
        let folder = self.folder(kind);
        let notes = match self.store.list(&folder) {
            Ok(notes) => notes,
            Err(StoreError::FolderNotFound(_)) => return Ok(Vec::new()),
            Err(error) => return Err(error.into()),
        };
        let mut fiches: Vec<FicheText> = notes
            .into_iter()
            .filter(|note| !note.path.name().is_canvas())
            .filter(|note| CrmKind::of(&note.content) == Some(kind))
            .filter_map(|note| {
                let name = Reference::to(note.path.name().stem())?;
                Some(FicheText {
                    name,
                    path: note.path,
                    content: note.content,
                })
            })
            .collect();
        fiches.sort_by(|a, b| a.name.cmp(&b.name));
        Ok(fiches)
    }

    /// Toutes les fiches du CRM, lues.
    pub(super) fn load(&self) -> Result<Fiches, AppError> {
        let mut fiches = Fiches::default();
        for fiche in self.read_all(CrmKind::Company)? {
            match Company::parse(&fiche.content) {
                Ok(company) => fiches.companies.push((fiche, company)),
                Err(_) => fiches.unreadable.push(fiche.path),
            }
        }
        for fiche in self.read_all(CrmKind::Person)? {
            match Person::parse(&fiche.content) {
                Ok(person) => fiches.people.push((fiche, person)),
                Err(_) => fiches.unreadable.push(fiche.path),
            }
        }
        for fiche in self.read_all(CrmKind::Action)? {
            match Action::parse(fiche.name.clone(), &fiche.content, self.stages()) {
                Ok(action) => fiches.actions.push((fiche, action)),
                Err(_) => fiches.unreadable.push(fiche.path),
            }
        }
        for fiche in self.read_all(CrmKind::Project)? {
            match Project::parse(&fiche.content) {
                Ok(project) => fiches.projects.push((fiche, project)),
                Err(_) => fiches.unreadable.push(fiche.path),
            }
        }
        Ok(fiches)
    }

    /// Les noms de fichier déjà pris dans le dossier de cette sorte : aucun s'il n'existe pas encore.
    pub(super) fn names(&self, kind: CrmKind) -> Result<Vec<FileName>, AppError> {
        match self.store.names(&self.folder(kind)) {
            Err(StoreError::FolderNotFound(_)) => Ok(Vec::new()),
            names => Ok(names?),
        }
    }

    /// Écrit une fiche neuve de cette sorte sous ce nom de fichier, et rend sa référence ; le
    /// dossier de la sorte (et celui du CRM) naît avec sa première fiche.
    pub(super) fn write_new(
        &self,
        kind: CrmKind,
        file: &FileName,
        content: &str,
    ) -> Result<Reference, AppError> {
        let reference = Reference::to(file.stem())
            .ok_or_else(|| AppError::InvalidReference(file.stem().to_owned()))?;
        let folder = self.folder(kind);
        self.ensure(&folder)?;
        self.store
            .write(&NotePath::new(folder, file.clone()), content)?;
        Ok(reference)
    }

    /// Crée le dossier et ceux qui le contiennent, s'ils n'existent pas encore.
    fn ensure(&self, folder: &Folder) -> Result<(), AppError> {
        let existing = self.store.folders()?;
        let mut current = Folder::root();
        for name in folder.names() {
            current = current.join(name.clone());
            if !existing.contains(&current) {
                self.store.create_folder(&current)?;
            }
        }
        Ok(())
    }
}
