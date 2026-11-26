//! Les fiches d'un CRM suivent son fichier : mis à la corbeille, restauré ou déplacé, un CRM
//! emporte avec lui le dossier qui porte son nom (fiche 0091).

use crate::{FileName, Folder, FolderName, NotePath, NoteSummary};

/// Le dossier des fiches du CRM `crm` : `clients/` pour `clients.md`, à côté de lui.
#[must_use]
pub fn fiches_folder(crm: &NotePath) -> Option<Folder> {
    let stem = FolderName::parse(crm.name().stem()).ok()?;
    Some(crm.folder().join(stem))
}

/// Ce que ce chemin devient quand le dossier `from` est déplacé en `to`.
#[must_use]
pub fn retargeted(path: &NotePath, from: &Folder, to: &Folder) -> NotePath {
    NotePath::new(path.folder().moved(from, to), path.name().clone())
}

/// Les noms de fichier que prennent, dans `parent`, les dossiers de `folders` : un CRM ne peut pas
/// prendre l'un d'eux, son dossier des fiches se confondrait avec ce dossier.
#[must_use]
pub fn names_of_folders_in(folders: &[Folder], parent: &Folder) -> Vec<FileName> {
    folders
        .iter()
        .filter(|folder| folder.parent().as_ref() == Some(parent))
        .filter_map(|folder| FileName::parse(&format!("{}.md", folder.name()?.as_str())).ok())
        .collect()
}

/// Les fiches d'un CRM : celles qui partent, reviennent ou se déplacent avec lui.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrmFiches {
    folder: Folder,
    fiches: Vec<NotePath>,
    only_fiches: bool,
}

impl CrmFiches {
    /// Les fiches du CRM `crm` parmi `notes`, les notes de son dossier (sous-dossiers compris).
    /// Une fiche est une entreprise, une personne, une action ou un projet rangé dans le dossier
    /// de sa sorte de ce CRM ; la fiche d'un autre CRM rangé dedans n'en est pas une.
    /// Rien si le nom du CRM ne donne pas de dossier.
    #[must_use]
    pub fn of(crm: &NotePath, notes: &[NoteSummary]) -> Option<Self> {
        let folder = fiches_folder(crm)?;
        let inside: Vec<&NoteSummary> = notes
            .iter()
            .filter(|note| note.path().folder().is_within(&folder))
            .collect();
        let fiches: Vec<NotePath> = inside
            .iter()
            .filter(|note| note.container() == Some(crm))
            .map(|note| note.path().clone())
            .collect();
        Some(Self {
            only_fiches: inside.len() == fiches.len(),
            folder,
            fiches,
        })
    }

    /// Les mêmes fiches une fois leur CRM passé du chemin `from` au chemin `to` : leur dossier
    /// porte le nom de `to`. Rien si `to` ne donne pas de dossier.
    #[must_use]
    pub fn relocated(&self, from: &NotePath, to: &NotePath) -> Option<Self> {
        let (old, new) = (fiches_folder(from)?, fiches_folder(to)?);
        Some(Self {
            fiches: self
                .fiches
                .iter()
                .map(|path| retargeted(path, &old, &new))
                .collect(),
            folder: new,
            only_fiches: self.only_fiches,
        })
    }

    /// Le dossier des fiches.
    #[must_use]
    pub fn folder(&self) -> &Folder {
        &self.folder
    }

    /// Les chemins des fiches, dans l'ordre où elles ont été données.
    #[must_use]
    pub fn paths(&self) -> &[NotePath] {
        &self.fiches
    }

    /// Le nombre de fiches.
    #[must_use]
    pub fn count(&self) -> usize {
        self.fiches.len()
    }

    /// Vrai si le dossier ne contient que ces fiches : il part alors tout entier, avec ses
    /// sous-dossiers vides et ses pièces jointes. Sinon seules les fiches partent.
    #[must_use]
    pub fn holds_only_fiches(&self) -> bool {
        self.only_fiches
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::Modified;

    fn note(path: &str, kind: &str) -> NoteSummary {
        let content = format!("---\ntype: {kind}\n---\n# Titre\n");
        NoteSummary::new(NotePath::parse(path).unwrap(), &content, Modified(1))
    }

    fn plain(path: &str) -> NoteSummary {
        NoteSummary::new(NotePath::parse(path).unwrap(), "# Titre\n", Modified(1))
    }

    fn crm(path: &str) -> NotePath {
        NotePath::parse(path).unwrap()
    }

    fn paths(fiches: &CrmFiches) -> Vec<String> {
        fiches.paths().iter().map(NotePath::to_path).collect()
    }

    #[test]
    fn the_folder_of_the_fiches_sits_beside_the_crm_under_its_name() {
        assert_eq!(
            fiches_folder(&crm("toto/crm1.md")).unwrap().to_path(),
            "toto/crm1"
        );
        assert_eq!(fiches_folder(&crm("crm1.md")).unwrap().to_path(), "crm1");
    }

    #[test]
    fn each_kind_of_fiche_in_its_folder_is_a_fiche_of_the_crm() {
        let notes = [
            note("c/entreprises/e.md", "crm-entreprise"),
            note("c/personnes/p.md", "crm-personne"),
            note("c/actions/a.md", "crm-action"),
            note("c/projets/j.md", "crm-projet"),
        ];
        let fiches = CrmFiches::of(&crm("c.md"), &notes).unwrap();
        assert_eq!(fiches.count(), 4);
        assert!(fiches.holds_only_fiches());
        assert_eq!(fiches.folder().to_path(), "c");
    }

    #[test]
    fn an_ordinary_note_is_not_a_fiche_and_keeps_the_folder() {
        let notes = [note("c/actions/a.md", "crm-action"), plain("c/ma-note.md")];
        let fiches = CrmFiches::of(&crm("c.md"), &notes).unwrap();
        assert_eq!(paths(&fiches), ["c/actions/a.md"]);
        assert!(!fiches.holds_only_fiches());
    }

    #[test]
    fn a_fiche_out_of_the_folder_of_its_kind_is_not_a_fiche_of_the_crm() {
        let notes = [note("c/autre/a.md", "crm-action")];
        let fiches = CrmFiches::of(&crm("c.md"), &notes).unwrap();
        assert_eq!(fiches.count(), 0);
        assert!(!fiches.holds_only_fiches());
    }

    #[test]
    fn a_crm_inside_the_folder_keeps_its_own_fiches() {
        let notes = [
            note("c/actions/a.md", "crm-action"),
            note("c/b.md", "crm"),
            note("c/b/actions/x.md", "crm-action"),
        ];
        let outer = CrmFiches::of(&crm("c.md"), &notes).unwrap();
        assert_eq!(paths(&outer), ["c/actions/a.md"]);
        assert!(!outer.holds_only_fiches());
        let inner = CrmFiches::of(&crm("c/b.md"), &notes).unwrap();
        assert_eq!(paths(&inner), ["c/b/actions/x.md"]);
        assert!(inner.holds_only_fiches());
    }

    #[test]
    fn a_crm_without_notes_in_its_folder_has_no_fiches() {
        let fiches = CrmFiches::of(&crm("c.md"), &[plain("d/x.md")]).unwrap();
        assert_eq!(fiches.count(), 0);
        assert!(fiches.holds_only_fiches());
    }

    #[test]
    fn notes_outside_the_folder_are_ignored() {
        let notes = [
            note("autre/actions/a.md", "crm-action"),
            plain("c.md"),
            plain("cc/x.md"),
        ];
        let fiches = CrmFiches::of(&crm("c.md"), &notes).unwrap();
        assert_eq!(fiches.count(), 0);
        assert!(fiches.holds_only_fiches());
    }

    #[test]
    fn relocated_fiches_follow_the_new_name_of_their_crm() {
        let notes = [note("a/c/actions/x.md", "crm-action"), plain("a/c/n.md")];
        let fiches = CrmFiches::of(&crm("a/c.md"), &notes).unwrap();
        let moved = fiches.relocated(&crm("a/c.md"), &crm("b/d.md")).unwrap();
        assert_eq!(paths(&moved), ["b/d/actions/x.md"]);
        assert_eq!(moved.folder().to_path(), "b/d");
        assert!(!moved.holds_only_fiches());
    }

    #[test]
    fn a_path_follows_its_folder() {
        let moved = retargeted(
            &crm("a/c/actions/x.md"),
            &Folder::parse("a/c").unwrap(),
            &Folder::parse("b/c-2").unwrap(),
        );
        assert_eq!(moved.to_path(), "b/c-2/actions/x.md");
    }

    #[test]
    fn the_folders_of_a_folder_are_names_a_crm_cannot_take() {
        let folders = ["a", "a/c", "a/c/d", "b/e"].map(|f| Folder::parse(f).unwrap());
        let names = names_of_folders_in(&folders, &Folder::parse("a").unwrap());
        assert_eq!(
            names.iter().map(FileName::as_str).collect::<Vec<_>>(),
            ["c.md"]
        );
        let at_root = names_of_folders_in(&folders, &Folder::root());
        assert_eq!(at_root.len(), 1);
    }
}
