//! Une entreprise (spécification §§ 4.3 et 5.1) : un titre, quatre champs facultatifs et des notes
//! libres. NODATA, l'entreprise des personnes qui n'en ont pas, n'est pas une fiche.

use super::header::{self, Style};
use super::kind::{CrmKind, Unreadable, read_title};
use super::name::Name;
use super::under_title::{notes_of, text, with_text, written_notes};

/// Le nom d'affichage de NODATA : l'absence d'entreprise. Il existe toujours dans un CRM, ne se
/// renomme pas et ne se supprime pas.
pub const NODATA: &str = "NODATA";

/// Les champs facultatifs d'une entreprise.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CompanyField {
    /// L'adresse du site web (`site`).
    Site,
    /// Le secteur d'activité (`secteur`).
    Sector,
    /// L'adresse postale (`adresse`).
    Address,
    /// Le téléphone (`telephone`).
    Phone,
}

impl CompanyField {
    /// La propriété de l'en-tête qui porte ce champ.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Self::Site => "site",
            Self::Sector => "secteur",
            Self::Address => "adresse",
            Self::Phone => "telephone",
        }
    }
}

/// Une entreprise lue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Company {
    /// Son nom : le titre de la fiche.
    pub name: String,
    /// Son site web.
    pub site: Option<String>,
    /// Son secteur.
    pub sector: Option<String>,
    /// Son adresse.
    pub address: Option<String>,
    /// Son téléphone.
    pub phone: Option<String>,
    /// Ses notes libres, en Markdown : le texte sous le titre.
    pub notes: String,
}

impl Company {
    /// L'entreprise que dit `content`.
    ///
    /// # Errors
    ///
    /// [`Unreadable`] si ce n'est pas une fiche `type: crm-entreprise` ou si elle n'a pas de titre.
    pub fn parse(content: &str) -> Result<Self, Unreadable> {
        let name = read_title(content, CrmKind::Company)?;
        let field = |field: CompanyField| header::scalar(content, field.key());
        Ok(Self {
            name,
            site: field(CompanyField::Site),
            sector: field(CompanyField::Sector),
            address: field(CompanyField::Address),
            phone: field(CompanyField::Phone),
            notes: notes_of(text(content)),
        })
    }

    /// Le texte d'une fiche neuve : l'en-tête et le titre.
    #[must_use]
    pub fn new_content(name: &Name) -> String {
        format!(
            "---\ntype: {}\n---\n# {}\n",
            CrmKind::Company.name(),
            name.as_str()
        )
    }
}

/// Le texte de l'entreprise avec ce champ : la propriété réécrite à sa place, retirée si la valeur
/// est vide, le reste du fichier inchangé.
#[must_use]
pub fn with_field(content: &str, field: CompanyField, value: &str) -> String {
    header::with_scalar(content, field.key(), Some(value), Style::Line)
}

/// Le texte de l'entreprise avec ces notes libres sous son titre, rien d'autre ne changeant.
#[must_use]
pub fn with_notes(content: &str, notes: &str) -> String {
    with_text(content, &written_notes(notes))
}

#[cfg(test)]
mod tests {
    use super::*;

    const ACME: &str = "---\ntype: crm-entreprise\nsite: https://acme.fr\nsecteur: Industrie\nadresse: 12 rue des Lilas, Lyon\ntelephone: 01 23 45 67 89\n---\n# Acme\n\nNotes libres sur l'entreprise, en [[Markdown]].\n";

    #[test]
    fn a_company_is_read_with_its_fields_and_its_notes() {
        let company = Company::parse(ACME).unwrap();
        assert_eq!(company.name, "Acme");
        assert_eq!(company.site.as_deref(), Some("https://acme.fr"));
        assert_eq!(company.sector.as_deref(), Some("Industrie"));
        assert_eq!(company.address.as_deref(), Some("12 rue des Lilas, Lyon"));
        assert_eq!(company.phone.as_deref(), Some("01 23 45 67 89"));
        assert_eq!(
            company.notes,
            "Notes libres sur l'entreprise, en [[Markdown]]."
        );
    }

    #[test]
    fn only_the_title_of_a_company_is_required() {
        let company = Company::parse("---\ntype: crm-entreprise\n---\n# Acme\n").unwrap();
        assert_eq!(
            company,
            Company {
                name: "Acme".to_owned(),
                site: None,
                sector: None,
                address: None,
                phone: None,
                notes: String::new(),
            }
        );
        assert_eq!(
            Company::parse("---\ntype: crm-entreprise\n---\n"),
            Err(Unreadable::NoTitle)
        );
        assert_eq!(
            Company::parse("---\ntype: crm-personne\n---\n# A\n"),
            Err(Unreadable::WrongKind)
        );
    }

    #[test]
    fn a_company_has_four_optional_fields() {
        let keys = [
            CompanyField::Site,
            CompanyField::Sector,
            CompanyField::Address,
            CompanyField::Phone,
        ]
        .map(CompanyField::key);
        assert_eq!(keys, ["site", "secteur", "adresse", "telephone"]);
    }

    #[test]
    fn a_new_company_has_its_header_and_its_title() {
        let name = Name::parse("Acme").unwrap();
        assert_eq!(
            Company::new_content(&name),
            "---\ntype: crm-entreprise\n---\n# Acme\n"
        );
        assert_eq!(
            Company::parse(&Company::new_content(&name)).unwrap().name,
            "Acme"
        );
    }

    #[test]
    fn changing_a_field_changes_only_that_field() {
        let changed = with_field(ACME, CompanyField::Sector, "Services");
        assert_eq!(changed, ACME.replace("Industrie", "Services"));
        let removed = with_field(ACME, CompanyField::Site, "");
        assert_eq!(removed, ACME.replace("site: https://acme.fr\n", ""));
        let added = with_field(
            "---\ntype: crm-entreprise\naliases: [a]\n---\n# Acme\n",
            CompanyField::Phone,
            "06 12",
        );
        assert_eq!(
            added,
            "---\ntype: crm-entreprise\naliases: [a]\ntelephone: 06 12\n---\n# Acme\n"
        );
    }

    #[test]
    fn changing_the_notes_changes_only_the_text_under_the_title() {
        assert_eq!(
            with_notes(ACME, "Autres notes.\n\nSur deux paragraphes."),
            ACME.replace(
                "Notes libres sur l'entreprise, en [[Markdown]].",
                "Autres notes.\n\nSur deux paragraphes."
            )
        );
        let emptied = with_notes(ACME, "  ");
        assert_eq!(
            emptied,
            ACME.replace("\nNotes libres sur l'entreprise, en [[Markdown]].\n", "")
        );
        assert_eq!(Company::parse(&emptied).unwrap().notes, "");
    }

    #[test]
    fn nodata_is_the_absence_of_company() {
        assert_eq!(NODATA, "NODATA");
    }
}
