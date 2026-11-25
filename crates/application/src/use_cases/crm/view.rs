//! Ce que la lecture d'un CRM rend (spécification §§ 7.1 à 7.5) : ses fiches lues et tout ce que le
//! domaine en calcule, pour que l'interface l'affiche sans le recalculer.

use domain::NotePath;
use domain::crm::kanban::{self, sort_most_recent_first};
use domain::crm::{
    Action, Company, Day, Filters, Person, Project, Reference, Stages, Status, Tally, Week,
    crm_tags, name_order, sort_most_late_first,
};

use super::files::Fiches;

/// Une colonne du Kanban : ses nombres sont ceux de toutes ses cartes, ses cartes sont celles que
/// les filtres laissent voir.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ColumnView {
    /// Le statut de la colonne.
    pub status: Status,
    /// Le nombre de cartes de la colonne, filtres ou non.
    pub count: usize,
    /// Le nombre de cartes en retard, filtres ou non.
    pub late: usize,
    /// Les cartes visibles, dans l'ordre de la colonne : une colonne terminée les garde toutes, et
    /// l'interface n'en montre que les [`kanban::CLOSED_PAGE`] premières, puis dix de plus à chaque clic.
    pub cards: Vec<Reference>,
}

/// « Ma semaine » : les cartes que les filtres laissent voir.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WeekView {
    /// Le lundi.
    pub monday: Day,
    /// Le dimanche.
    pub sunday: Day,
    /// « En retard » : les actions ouvertes datées d'avant le lundi, la plus ancienne d'abord.
    pub late: Vec<Reference>,
    /// Les sept jours, chacun avec ses actions ouvertes.
    pub days: Vec<(Day, Vec<Reference>)>,
}

/// Une entreprise lue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CompanyEntry {
    /// Sa référence.
    pub name: Reference,
    /// Ce que dit sa fiche.
    pub company: Company,
    /// Ses personnes (celles dont l'entreprise est la sienne), par ordre alphabétique.
    pub people: Vec<Reference>,
    /// Les actions de ses personnes d'alors : une action ne compte qu'une fois.
    pub tally: Tally,
}

/// NODATA : l'absence d'entreprise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NoDataEntry {
    /// Les personnes sans entreprise, par ordre alphabétique.
    pub people: Vec<Reference>,
    /// Les actions des personnes sans entreprise, et celles qui n'ont pas de personne.
    pub tally: Tally,
}

/// Une personne lue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PersonEntry {
    /// Sa référence.
    pub name: Reference,
    /// Ce que dit sa fiche.
    pub person: Person,
    /// Ses actions ouvertes, la plus en retard d'abord.
    pub open_actions: Vec<Reference>,
    /// Ses actions terminées, la plus récente d'abord.
    pub closed_actions: Vec<Reference>,
    /// Ses actions ouvertes, en retard, à faire aujourd'hui.
    pub tally: Tally,
}

/// Un projet lu.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ProjectEntry {
    /// Sa référence.
    pub name: Reference,
    /// Ce que dit sa fiche.
    pub project: Project,
    /// Ses actions ouvertes, la plus en retard d'abord.
    pub open_actions: Vec<Reference>,
    /// Ses actions ouvertes, en retard, à faire aujourd'hui.
    pub tally: Tally,
}

/// Un CRM lu, le jour `today`.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CrmView {
    /// Le titre du CRM.
    pub title: String,
    /// Ses étapes.
    pub stages: Stages,
    /// Le jour du Mac.
    pub today: Day,
    /// NODATA, toujours montrée en premier.
    pub nodata: NoDataEntry,
    /// Ses entreprises, par ordre alphabétique.
    pub companies: Vec<CompanyEntry>,
    /// Ses personnes, par ordre alphabétique.
    pub people: Vec<PersonEntry>,
    /// Ses projets, par ordre alphabétique.
    pub projects: Vec<ProjectEntry>,
    /// Toutes ses actions, par nom de fichier (l'ordre de création).
    pub actions: Vec<Action>,
    /// Les colonnes du Kanban.
    pub columns: Vec<ColumnView>,
    /// Ma semaine.
    pub week: WeekView,
    /// Les étiquettes de ses actions, par ordre alphabétique.
    pub tags: Vec<String>,
    /// Les fiches illisibles, laissées de côté et jamais effacées.
    pub unreadable: Vec<NotePath>,
}

impl CrmView {
    /// La vue de ces fiches pour un CRM titré `title` qui a ces `stages`, le jour `today`, avec ces
    /// filtres et la semaine qui contient `week_day`.
    pub(super) fn new(
        (title, stages): (String, Stages),
        fiches: Fiches,
        (today, week_day): (Day, Day),
        filters: &Filters,
    ) -> Self {
        let Fiches {
            companies,
            people,
            actions,
            projects,
            unreadable,
        } = fiches;
        let actions: Vec<Action> = actions.into_iter().map(|(_, action)| action).collect();
        let people: Vec<(Reference, Person)> = people
            .into_iter()
            .map(|(fiche, person)| (fiche.name, person))
            .collect();
        Self {
            nodata: nodata(&people, &actions, today),
            companies: sorted_by_name(companies.into_iter().map(|(f, c)| (f.name, c)), |c| &c.name)
                .into_iter()
                .map(|(name, company)| company_entry(name, company, &people, &actions, today))
                .collect(),
            projects: sorted_by_name(projects.into_iter().map(|(f, p)| (f.name, p)), |p| &p.name)
                .into_iter()
                .map(|(name, project)| project_entry(name, project, &actions, today))
                .collect(),
            columns: columns(&stages, &actions, filters, today),
            week: week(&actions, filters, week_day),
            tags: crm_tags(&actions),
            people: sorted_by_name(people.iter().cloned(), |p| &p.name)
                .into_iter()
                .map(|(name, person)| person_entry(name, person, &actions, today))
                .collect(),
            title,
            stages,
            today,
            actions,
            unreadable,
        }
    }
}

fn sorted_by_name<T>(
    items: impl Iterator<Item = (Reference, T)>,
    shown: impl Fn(&T) -> &String,
) -> Vec<(Reference, T)> {
    let mut items: Vec<(Reference, T)> = items.collect();
    items.sort_by(|(_, a), (_, b)| name_order(shown(a), shown(b)));
    items
}

fn people_of(people: &[(Reference, Person)], company: Option<&Reference>) -> Vec<Reference> {
    let mut found: Vec<&(Reference, Person)> = people
        .iter()
        .filter(|(_, person)| person.company.as_ref() == company)
        .collect();
    found.sort_by(|(_, a), (_, b)| name_order(&a.name, &b.name));
    found.into_iter().map(|(name, _)| name.clone()).collect()
}

fn nodata(people: &[(Reference, Person)], actions: &[Action], today: Day) -> NoDataEntry {
    let of_nodata = actions.iter().filter(|a| a.companies().contains(&None));
    NoDataEntry {
        people: people_of(people, None),
        tally: Tally::of(of_nodata, today),
    }
}

fn company_entry(
    name: Reference,
    company: Company,
    people: &[(Reference, Person)],
    actions: &[Action],
    today: Day,
) -> CompanyEntry {
    let key = Some(name.clone());
    CompanyEntry {
        people: people_of(people, Some(&name)),
        tally: Tally::of(
            actions.iter().filter(|a| a.companies().contains(&key)),
            today,
        ),
        name,
        company,
    }
}

/// Les actions ouvertes de `of`, la plus en retard d'abord.
fn open_actions<'a>(of: impl Iterator<Item = &'a Action>) -> Vec<&'a Action> {
    let mut open: Vec<&Action> = of.filter(|action| action.is_open()).collect();
    sort_most_late_first(&mut open);
    open
}

fn names(actions: &[&Action]) -> Vec<Reference> {
    actions.iter().map(|action| action.name.clone()).collect()
}

fn person_entry(name: Reference, person: Person, actions: &[Action], today: Day) -> PersonEntry {
    let of_person = || {
        actions
            .iter()
            .filter(|a| a.people.iter().any(|p| p.person == name))
    };
    let mut closed: Vec<&Action> = of_person().filter(|action| action.is_closed()).collect();
    sort_most_recent_first(&mut closed);
    PersonEntry {
        open_actions: names(&open_actions(of_person())),
        closed_actions: names(&closed),
        tally: Tally::of(of_person(), today),
        name,
        person,
    }
}

fn project_entry(
    name: Reference,
    project: Project,
    actions: &[Action],
    today: Day,
) -> ProjectEntry {
    let of_project = || actions.iter().filter(|a| a.project.as_ref() == Some(&name));
    ProjectEntry {
        open_actions: names(&open_actions(of_project())),
        tally: Tally::of(of_project(), today),
        name,
        project,
    }
}

fn columns(stages: &Stages, actions: &[Action], filters: &Filters, today: Day) -> Vec<ColumnView> {
    kanban::columns(stages, actions)
        .into_iter()
        .map(|column| ColumnView {
            count: column.count(),
            late: column.late_count(today),
            cards: column
                .cards
                .iter()
                .filter(|card| filters.matches(card))
                .map(|card| card.name.clone())
                .collect(),
            status: column.status,
        })
        .collect()
}

fn week(actions: &[Action], filters: &Filters, day: Day) -> WeekView {
    let visible: Vec<Action> = actions
        .iter()
        .filter(|action| filters.matches(action))
        .cloned()
        .collect();
    let week = Week::containing(day);
    let columns = week.columns(&visible);
    WeekView {
        monday: week.monday(),
        sunday: week.sunday(),
        late: names(&columns.late),
        days: columns
            .days
            .iter()
            .map(|(day, cards)| (*day, names(cards)))
            .collect(),
    }
}
