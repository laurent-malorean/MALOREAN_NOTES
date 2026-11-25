//! Les sortes de notes du CRM, déclarées par la propriété `type:` de l'en-tête, et les dossiers
//! où un CRM range ses fiches (spécification § 4.1).

use std::fmt;

use crate::front_matter::declared_type;
use crate::title::Title;

/// La sorte de note du CRM qu'un en-tête déclare.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum CrmKind {
    /// Le CRM lui-même : `type: crm`.
    Crm,
    /// Une fiche d'entreprise : `type: crm-entreprise`.
    Company,
    /// Une fiche de personne : `type: crm-personne`.
    Person,
    /// Une fiche d'action : `type: crm-action`.
    Action,
    /// Une fiche de projet : `type: crm-projet`.
    Project,
}

impl CrmKind {
    /// Toutes les sortes, le CRM d'abord.
    pub const ALL: [Self; 5] = [
        Self::Crm,
        Self::Company,
        Self::Person,
        Self::Action,
        Self::Project,
    ];

    /// Le nom du type, tel que l'écrit la propriété `type:`.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Crm => "crm",
            Self::Company => "crm-entreprise",
            Self::Person => "crm-personne",
            Self::Action => "crm-action",
            Self::Project => "crm-projet",
        }
    }

    /// La sorte que déclare l'en-tête de `content` (seule compte la première propriété `type:`) ;
    /// rien pour une note ordinaire ou un type inconnu.
    #[must_use]
    pub fn of(content: &str) -> Option<Self> {
        let declared = declared_type(content)?;
        Self::ALL.into_iter().find(|kind| kind.name() == declared)
    }

    /// Le dossier où un CRM range cette sorte de fiche : `entreprises`, `personnes`, `actions`
    /// ou `projets` ; rien pour le CRM, qui n'est pas une fiche.
    #[must_use]
    pub fn folder(self) -> Option<&'static str> {
        match self {
            Self::Crm => None,
            Self::Company => Some("entreprises"),
            Self::Person => Some("personnes"),
            Self::Action => Some("actions"),
            Self::Project => Some("projets"),
        }
    }

    /// Le chemin du dossier de cette sorte de fiche pour le CRM dont le nom de fichier (sans
    /// extension) est `crm_stem` : `clients/personnes`, relatif au dossier du CRM. Rien pour le CRM.
    #[must_use]
    pub fn folder_of(self, crm_stem: &str) -> Option<String> {
        self.folder().map(|folder| format!("{crm_stem}/{folder}"))
    }
}

/// Pourquoi une fiche est laissée de côté par le CRM : jamais effacée, seulement non lue.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Unreadable {
    /// L'en-tête ne déclare pas la sorte de fiche attendue.
    WrongKind,
    /// La fiche n'a pas de titre `#`.
    NoTitle,
}

impl fmt::Display for Unreadable {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::WrongKind => "Ce fichier n'est pas une fiche de ce type.",
            Self::NoTitle => "Cette fiche n'a pas de titre.",
        })
    }
}

impl std::error::Error for Unreadable {}

/// Le titre de la fiche `content` de la sorte `kind`.
///
/// # Errors
///
/// [`Unreadable`] si l'en-tête ne déclare pas cette sorte, ou si la fiche n'a pas de titre.
pub(crate) fn read_title(content: &str, kind: CrmKind) -> Result<String, Unreadable> {
    if CrmKind::of(content) != Some(kind) {
        return Err(Unreadable::WrongKind);
    }
    Title::of(content)
        .map(|title| title.as_str().to_owned())
        .ok_or(Unreadable::NoTitle)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn each_kind_has_the_name_its_header_writes() {
        let names: Vec<_> = CrmKind::ALL.map(CrmKind::name).into();
        assert_eq!(
            names,
            [
                "crm",
                "crm-entreprise",
                "crm-personne",
                "crm-action",
                "crm-projet"
            ]
        );
    }

    #[test]
    fn a_header_declares_its_kind_by_its_first_type_property() {
        for kind in CrmKind::ALL {
            let content = format!("---\ntype: {}\n---\n# T\n", kind.name());
            assert_eq!(CrmKind::of(&content), Some(kind));
        }
        assert_eq!(CrmKind::of("---\ntype: 'crm'\n---\n"), Some(CrmKind::Crm));
        assert_eq!(
            CrmKind::of("---\ntype: crm\ntype: crm-action\n---\n"),
            Some(CrmKind::Crm)
        );
        assert_eq!(CrmKind::of("---\ntype: carte-mentale\n---\n"), None);
        assert_eq!(CrmKind::of("---\ntype: crm-\n---\n"), None);
        assert_eq!(CrmKind::of("---\ntags: [crm]\n---\n"), None);
        assert_eq!(CrmKind::of("# crm\n"), None);
    }

    #[test]
    fn a_title_is_read_only_from_a_fiche_of_the_kind_asked() {
        let company = "---\ntype: crm-entreprise\n---\n# Acme\n";
        assert_eq!(read_title(company, CrmKind::Company), Ok("Acme".to_owned()));
        assert_eq!(
            read_title(company, CrmKind::Person),
            Err(Unreadable::WrongKind)
        );
        assert_eq!(
            read_title("# Acme\n", CrmKind::Company),
            Err(Unreadable::WrongKind)
        );
        assert_eq!(
            read_title("---\ntype: crm-entreprise\n---\ntexte\n", CrmKind::Company),
            Err(Unreadable::NoTitle)
        );
        assert_eq!(
            Unreadable::WrongKind.to_string(),
            "Ce fichier n'est pas une fiche de ce type."
        );
        assert_eq!(
            Unreadable::NoTitle.to_string(),
            "Cette fiche n'a pas de titre."
        );
    }

    #[test]
    fn each_kind_of_fiche_has_its_folder_in_the_crm_folder() {
        assert_eq!(CrmKind::Crm.folder_of("clients"), None);
        assert_eq!(
            CrmKind::Company.folder_of("clients"),
            Some("clients/entreprises".to_owned())
        );
        assert_eq!(
            CrmKind::Person.folder_of("clients"),
            Some("clients/personnes".to_owned())
        );
        assert_eq!(
            CrmKind::Action.folder_of("clients"),
            Some("clients/actions".to_owned())
        );
        assert_eq!(
            CrmKind::Project.folder_of("clients"),
            Some("clients/projets".to_owned())
        );
        assert_eq!(CrmKind::Project.folder(), Some("projets"));
        assert_eq!(CrmKind::Crm.folder(), None);
    }
}
