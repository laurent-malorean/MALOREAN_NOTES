//! Une personne (spécification §§ 4.4 et 5.2) : un nom entier, quatre champs facultatifs, une
//! entreprise à la fois (ou NODATA) et son parcours.

use super::day::Day;
use super::header::{self, Style};
use super::kind::{CrmKind, Unreadable, read_title};
use super::name::Name;
use super::reference::Reference;
use super::under_title::{notes_of, text, with_text, written_notes};

const COMPANY_KEY: &str = "entreprise";
const CAREER_KEY: &str = "parcours";
/// Sépare l'entreprise des jours dans un passage : `[[acme]] · 2026-03-01 →`.
const SEPARATOR: char = '·';
/// Sépare le jour d'arrivée du jour de départ.
const ARROW: char = '→';

/// Les champs facultatifs d'une personne.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PersonField {
    /// Sa fonction (`fonction`).
    Role,
    /// Son e-mail (`email`).
    Email,
    /// Son téléphone (`telephone`).
    Phone,
    /// Son profil LinkedIn (`linkedin`).
    LinkedIn,
}

impl PersonField {
    /// La propriété de l'en-tête qui porte ce champ.
    #[must_use]
    pub fn key(self) -> &'static str {
        match self {
            Self::Role => "fonction",
            Self::Email => "email",
            Self::Phone => "telephone",
            Self::LinkedIn => "linkedin",
        }
    }
}

/// Un passage dans une entreprise : le jour d'arrivée et le jour de départ, vide tant que la
/// personne y est.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Passage {
    /// L'entreprise.
    pub company: Reference,
    /// Le jour d'arrivée.
    pub from: Day,
    /// Le jour de départ ; rien pour le passage en cours.
    pub to: Option<Day>,
}

impl Passage {
    /// Le passage que dit une ligne du parcours : `[[entreprise]] · 2026-03-01 → 2026-06-30`, ou
    /// sans jour de départ pour un passage en cours.
    #[must_use]
    pub fn parse(line: &str) -> Option<Self> {
        let (company, days) = line.split_once(SEPARATOR)?;
        let (from, to) = days.split_once(ARROW)?;
        let to = to.trim();
        Some(Self {
            company: Reference::parse(company)?,
            from: Day::parse(from.trim()).ok()?,
            to: if to.is_empty() {
                None
            } else {
                Some(Day::parse(to).ok()?)
            },
        })
    }

    /// La ligne du parcours qui écrit ce passage.
    #[must_use]
    pub fn line(&self) -> String {
        let to = self.to.map(|day| format!(" {day}")).unwrap_or_default();
        format!("{} {SEPARATOR} {} {ARROW}{to}", self.company, self.from)
    }
}

/// Une personne lue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Person {
    /// Son nom entier (prénom et nom) : le titre de la fiche.
    pub name: String,
    /// Sa fonction.
    pub role: Option<String>,
    /// Son entreprise ; rien si elle est dans NODATA.
    pub company: Option<Reference>,
    /// Son parcours : ses passages, dans l'ordre écrit ; une ligne illisible est laissée de côté.
    pub career: Vec<Passage>,
    /// Son e-mail.
    pub email: Option<String>,
    /// Son téléphone.
    pub phone: Option<String>,
    /// Son profil LinkedIn.
    pub linkedin: Option<String>,
    /// Ses notes libres, en Markdown : le texte sous le titre.
    pub notes: String,
}

impl Person {
    /// La personne que dit `content`.
    ///
    /// # Errors
    ///
    /// [`Unreadable`] si ce n'est pas une fiche `type: crm-personne` ou si elle n'a pas de titre.
    pub fn parse(content: &str) -> Result<Self, Unreadable> {
        let name = read_title(content, CrmKind::Person)?;
        let field = |field: PersonField| header::scalar(content, field.key());
        Ok(Self {
            name,
            role: field(PersonField::Role),
            company: header::scalar(content, COMPANY_KEY).and_then(|text| Reference::parse(&text)),
            career: header::items(content, CAREER_KEY)
                .iter()
                .filter_map(|line| Passage::parse(line))
                .collect(),
            email: field(PersonField::Email),
            phone: field(PersonField::Phone),
            linkedin: field(PersonField::LinkedIn),
            notes: notes_of(text(content)),
        })
    }

    /// Le texte d'une fiche neuve. Créée depuis la fiche d'une entreprise, la personne y entre le
    /// jour `today` et son parcours le dit ; créée ailleurs (`company` vide), elle est dans NODATA.
    #[must_use]
    pub fn new_content(name: &Name, company: Option<&Reference>, today: Day) -> String {
        let start = format!("---\ntype: {}\n", CrmKind::Person.name());
        let career = company.map(|company| {
            let passage = Passage {
                company: company.clone(),
                from: today,
                to: None,
            };
            let company = header::scalar_line(COMPANY_KEY, &company.to_string(), Style::Always);
            let career = header::items_line(CAREER_KEY, &[passage.line()], Style::Always);
            format!("{company}\n{career}\n")
        });
        format!(
            "{start}{}---\n# {}\n",
            career.unwrap_or_default(),
            name.as_str()
        )
    }
}

/// Le texte de la personne avec ce champ : la propriété réécrite à sa place, retirée si la valeur
/// est vide, le reste du fichier inchangé.
#[must_use]
pub fn with_field(content: &str, field: PersonField, value: &str) -> String {
    header::with_scalar(content, field.key(), Some(value), Style::Line)
}

/// Le texte de la personne avec ces notes libres sous son titre, rien d'autre ne changeant.
#[must_use]
pub fn with_notes(content: &str, notes: &str) -> String {
    with_text(content, &written_notes(notes))
}

/// Le texte de la personne une fois qu'elle a changé d'entreprise le jour `day` (« Changer
/// d'entreprise », ou l'entreprise supprimée) : son passage en cours est fermé à ce jour, un
/// passage dans `company` s'ouvre à ce jour, et la propriété `entreprise` désigne la nouvelle
/// (retirée pour NODATA). Le reste du fichier est inchangé ; une personne qui est déjà dans cette
/// entreprise ne change pas.
#[must_use]
pub fn with_company(content: &str, company: Option<&Reference>, day: Day) -> String {
    let current = header::scalar(content, COMPANY_KEY).and_then(|text| Reference::parse(&text));
    if current.as_ref() == company {
        return content.to_owned();
    }
    let mut lines = header::items(content, CAREER_KEY);
    let open = lines
        .iter()
        .rposition(|line| Passage::parse(line).is_some_and(|passage| passage.to.is_none()));
    if let Some(at) = open
        && let Some(passage) = Passage::parse(&lines[at])
    {
        lines[at] = Passage {
            to: Some(day),
            ..passage
        }
        .line();
    }
    if let Some(company) = company {
        lines.push(
            Passage {
                company: company.clone(),
                from: day,
                to: None,
            }
            .line(),
        );
    }
    let company = company.map(ToString::to_string);
    let with_company = header::with_scalar(content, COMPANY_KEY, company.as_deref(), Style::Always);
    header::with_items(&with_company, CAREER_KEY, &lines, Style::Always)
}

#[cfg(test)]
#[path = "person_tests.rs"]
mod tests;
