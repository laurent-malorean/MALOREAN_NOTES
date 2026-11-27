use std::sync::Arc;

use domain::{Folder, Moment};

use super::*;
use crate::testing::{FakePreferences, FixedClock, InMemoryNoteStore};
use crate::{IndexedStore, MemoryHistory, MemoryIndex, Workspace, WorkspaceLocation, Workspaces};

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn name() -> WorkspaceName {
    WorkspaceName::new("Notes").unwrap()
}

/// Un espace de travail « Notes » avec ses notes, son index qui suit les écritures, son
/// historique et ses préférences.
struct Setup {
    files: Arc<InMemoryNoteStore>,
    store: IndexedStore,
    index: Arc<MemoryIndex>,
    history: MemoryHistory,
    preferences: FakePreferences,
    clock: FixedClock,
    name: WorkspaceName,
}

fn workspace(notes: &[(&str, &str)]) -> Setup {
    let files = Arc::new(InMemoryNoteStore::with_notes(notes));
    let index = Arc::new(MemoryIndex::default());
    crate::indexed_store::refresh(&*files, &*index).unwrap();
    let preferences = FakePreferences::default();
    preferences
        .save_workspaces(
            &Workspaces::default()
                .added(Workspace {
                    name: name(),
                    location: WorkspaceLocation::new("/notes").unwrap(),
                })
                .unwrap(),
        )
        .unwrap();
    Setup {
        store: IndexedStore::new(files.clone(), index.clone()),
        files,
        index,
        history: MemoryHistory::default(),
        preferences,
        clock: FixedClock::at(Moment::new(2026, 11, 27, 10, 0).unwrap()),
        name: name(),
    }
}

/// Un espace de travail dont la note des favoris `favoris.md` (texte `text`) est choisie.
fn with_favorites(text: &str, others: &[(&str, &str)]) -> Setup {
    let mut notes = vec![("favoris.md", text)];
    notes.extend_from_slice(others);
    let workspace = workspace(&notes);
    workspace.manage().choose(&path("favoris.md")).unwrap();
    workspace
}

impl Setup {
    fn manage(&self) -> ManageFavoritesNote<'_> {
        ManageFavoritesNote::new(&self.preferences, &self.name, &self.store)
    }

    fn favorites(&self) -> Favorites<'_> {
        Favorites::new(
            &self.preferences,
            &self.name,
            &self.store,
            &*self.index,
            &self.history,
            &self.clock,
        )
    }

    fn text(&self, note: &str) -> String {
        self.files.read(&path(note)).unwrap().content
    }
}

use crate::NoteStore;

const NOTES: [(&str, &str); 3] = [
    ("courses.md", "# Courses"),
    ("agenda.md", "# Agenda"),
    ("plan.canvas", "{}"),
];

#[test]
fn a_workspace_has_no_favorites_note_at_first() {
    let workspace = workspace(&NOTES);
    assert_eq!(workspace.manage().current().unwrap(), None);
}

#[test]
fn a_chosen_note_is_the_favorites_note_with_its_title() {
    let workspace = workspace(&[("a/liste.md", "# Mes favoris\n")]);
    let chosen = workspace.manage().choose(&path("a/liste.md")).unwrap();
    let expected = FavoritesNote {
        path: path("a/liste.md"),
        title: "Mes favoris".to_owned(),
    };
    assert_eq!(chosen, expected);
    assert_eq!(workspace.manage().current().unwrap(), Some(expected));
}

#[test]
fn only_a_simple_note_can_be_chosen() {
    let workspace = workspace(&[
        ("carte.md", "---\ntype: carte-mentale\n---\n# Carte"),
        ("cahier.md", "---\ntype: cahier-de-recherche\n---\n# Cahier"),
        ("crm.md", "---\ntype: crm\n---\n# CRM"),
        ("fiche.md", "---\ntype: crm-personne\n---\n# Léa"),
        ("plan.canvas", "{}"),
    ]);
    for note in ["carte.md", "cahier.md", "crm.md", "fiche.md", "plan.canvas"] {
        assert_eq!(
            workspace.manage().choose(&path(note)),
            Err(AppError::NotAFavoritesNote),
            "{note}"
        );
    }
    assert_eq!(workspace.manage().current().unwrap(), None);
}

#[test]
fn a_note_that_does_not_exist_cannot_be_chosen() {
    let workspace = workspace(&NOTES);
    assert_eq!(
        workspace.manage().choose(&path("absente.md")),
        Err(AppError::NoteNotFound(path("absente.md")))
    );
}

#[test]
fn choosing_another_note_replaces_the_choice_and_stopping_clears_it_without_deleting_the_note() {
    let workspace = workspace(&NOTES);
    workspace.manage().choose(&path("courses.md")).unwrap();
    workspace.manage().choose(&path("agenda.md")).unwrap();
    assert_eq!(
        workspace.manage().current().unwrap().unwrap().path,
        path("agenda.md")
    );
    workspace.manage().stop_using().unwrap();
    assert_eq!(workspace.manage().current().unwrap(), None);
    assert_eq!(workspace.text("agenda.md"), "# Agenda");
}

#[test]
fn the_choice_is_kept_in_the_preferences_and_not_in_the_workspace_folder() {
    let workspace = workspace(&NOTES);
    workspace.manage().choose(&path("courses.md")).unwrap();
    let kept = workspace.preferences.workspaces().unwrap();
    assert_eq!(kept.favorites_note(&name()), Some(&path("courses.md")));
    assert_eq!(workspace.text("courses.md"), "# Courses");
}

#[test]
fn a_chosen_note_that_has_disappeared_is_no_favorites_note() {
    let workspace = workspace(&NOTES);
    workspace.manage().choose(&path("courses.md")).unwrap();
    workspace
        .files
        .trash_note(&path("courses.md"), &path("courses.md"))
        .unwrap();
    assert_eq!(workspace.manage().current().unwrap(), None);
}

#[test]
fn the_favorites_note_is_created_with_its_title_in_the_folder_and_chosen() {
    let workspace = workspace(&NOTES);
    workspace
        .files
        .create_folder(&Folder::parse("Perso").unwrap())
        .unwrap();
    let created = workspace
        .manage()
        .create("  Mes   favoris ", &Folder::parse("Perso").unwrap())
        .unwrap();
    assert_eq!(created.path, path("Perso/mes-favoris.md"));
    assert_eq!(created.title, "Mes favoris");
    assert_eq!(workspace.text("Perso/mes-favoris.md"), "# Mes favoris\n");
    assert_eq!(workspace.manage().current().unwrap(), Some(created));
}

#[test]
fn a_favorites_note_created_at_the_root_takes_the_first_free_name() {
    let workspace = workspace(&[("favoris.md", "# Favoris\nautre note")]);
    let created = workspace
        .manage()
        .create("Favoris", &Folder::root())
        .unwrap();
    assert_eq!(created.path, path("favoris-2.md"));
    assert_eq!(workspace.text("favoris.md"), "# Favoris\nautre note");
}

#[test]
fn a_favorites_note_without_a_title_or_in_a_missing_folder_is_not_created() {
    let workspace = workspace(&NOTES);
    assert_eq!(
        workspace.manage().create("   ", &Folder::root()),
        Err(AppError::EmptyTitle)
    );
    assert!(
        workspace
            .manage()
            .create("Favoris", &Folder::parse("Nulle part").unwrap())
            .is_err()
    );
    assert_eq!(workspace.manage().current().unwrap(), None);
}

#[test]
fn without_a_favorites_note_nothing_is_a_favorite_and_the_other_operations_say_so() {
    let workspace = workspace(&NOTES);
    let favorites = workspace.favorites();
    assert!(!favorites.is_favorite(&path("courses.md")).unwrap());
    assert_eq!(
        favorites.add(&path("courses.md")),
        Err(AppError::NoFavoritesNote)
    );
    assert_eq!(
        favorites.remove(&path("courses.md")),
        Err(AppError::NoFavoritesNote)
    );
    assert_eq!(favorites.restore(&[]), Err(AppError::NoFavoritesNote));
    assert_eq!(favorites.list(), Err(AppError::NoFavoritesNote));
    assert_eq!(
        AppError::NoFavoritesNote.to_string(),
        "Aucune note des favoris n'est choisie."
    );
}

#[test]
fn a_content_is_added_at_the_end_of_the_favorites_note() {
    let workspace = with_favorites("# Favoris\n\n- [[Agenda]]\n", &NOTES);
    let favorites = workspace.favorites();
    assert!(!favorites.is_favorite(&path("courses.md")).unwrap());
    favorites.add(&path("courses.md")).unwrap();
    assert_eq!(
        workspace.text("favoris.md"),
        "# Favoris\n\n- [[Agenda]]\n- [[Courses]]\n"
    );
    assert!(favorites.is_favorite(&path("courses.md")).unwrap());
    assert!(!favorites.is_favorite(&path("plan.canvas")).unwrap());
}

#[test]
fn a_canvas_is_added_with_its_file_name_and_twins_with_their_folder() {
    let workspace = with_favorites(
        "",
        &[
            ("plan.canvas", "{}"),
            ("A/idee.md", "# Idée"),
            ("B/idee.md", "# Idée"),
        ],
    );
    let favorites = workspace.favorites();
    favorites.add(&path("plan.canvas")).unwrap();
    favorites.add(&path("B/idee.md")).unwrap();
    assert_eq!(
        workspace.text("favoris.md"),
        "- [[plan.canvas]]\n- [[B/Idée]]\n"
    );
    assert!(favorites.is_favorite(&path("B/idee.md")).unwrap());
    assert!(!favorites.is_favorite(&path("A/idee.md")).unwrap());
}

#[test]
fn a_notebook_a_mind_map_and_a_crm_can_be_added() {
    let workspace = with_favorites(
        "",
        &[
            ("cahier.md", "---\ntype: cahier-de-recherche\n---\n# Cahier"),
            ("carte.md", "---\ntype: carte-mentale\n---\n# Carte"),
            ("crm.md", "---\ntype: crm\n---\n# Clients"),
        ],
    );
    for note in ["cahier.md", "carte.md", "crm.md"] {
        workspace.favorites().add(&path(note)).unwrap();
    }
    assert_eq!(
        workspace.text("favoris.md"),
        "- [[Cahier]]\n- [[Carte]]\n- [[Clients]]\n"
    );
}

#[test]
fn a_crm_fiche_has_no_star() {
    let workspace = with_favorites(
        "",
        &[
            ("fiche.md", "---\ntype: crm-entreprise\n---\n# Acme"),
            ("action.md", "---\ntype: crm-action\n---\n# Relance"),
        ],
    );
    for note in ["fiche.md", "action.md"] {
        assert_eq!(
            workspace.favorites().add(&path(note)),
            Err(AppError::FicheHasNoStar),
            "{note}"
        );
    }
    assert_eq!(workspace.text("favoris.md"), "");
}

#[test]
fn an_agenda_12_has_a_star_but_not_its_events() {
    let workspace = with_favorites(
        "",
        &[
            ("salons.md", "---\ntype: agenda-12\n---\n# Salons"),
            (
                "salons/x.md",
                "---\ntype: agenda-12-evenement\nmois: 2\n---\n# X",
            ),
        ],
    );
    workspace.favorites().add(&path("salons.md")).unwrap();
    assert_eq!(workspace.text("favoris.md"), "- [[Salons]]\n");
    assert_eq!(
        workspace.favorites().add(&path("salons/x.md")),
        Err(AppError::EventHasNoStar)
    );
    assert_eq!(workspace.text("favoris.md"), "- [[Salons]]\n");
}

#[test]
fn the_favorites_note_is_not_its_own_favorite() {
    let workspace = with_favorites("# Favoris\n- [[Favoris]]\n", &[]);
    let favorites = workspace.favorites();
    assert_eq!(
        favorites.add(&path("favoris.md")),
        Err(AppError::FavoritesNoteIsNoFavorite)
    );
    assert!(!favorites.is_favorite(&path("favoris.md")).unwrap());
}

#[test]
fn a_missing_content_cannot_be_added() {
    let workspace = with_favorites("", &NOTES);
    assert_eq!(
        workspace.favorites().add(&path("absente.md")),
        Err(AppError::NoteNotFound(path("absente.md")))
    );
    assert_eq!(workspace.text("favoris.md"), "");
}

#[test]
fn adding_a_content_already_in_favorites_changes_nothing_and_keeps_no_version() {
    let workspace = with_favorites("- [[Courses]]\n", &NOTES);
    workspace.favorites().add(&path("courses.md")).unwrap();
    assert_eq!(workspace.text("favoris.md"), "- [[Courses]]\n");
    assert!(
        workspace
            .history
            .versions(&path("favoris.md"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_link_inside_a_sentence_does_not_make_a_favorite_so_the_content_is_added() {
    let workspace = with_favorites("Voir [[Courses]] demain\n", &NOTES);
    let favorites = workspace.favorites();
    assert!(!favorites.is_favorite(&path("courses.md")).unwrap());
    favorites.add(&path("courses.md")).unwrap();
    assert_eq!(
        workspace.text("favoris.md"),
        "Voir [[Courses]] demain\n- [[Courses]]\n"
    );
}

#[test]
fn the_text_before_a_change_is_kept_as_a_version() {
    let workspace = with_favorites("# Favoris", &NOTES);
    workspace.favorites().add(&path("courses.md")).unwrap();
    let versions = workspace.history.versions(&path("favoris.md")).unwrap();
    assert_eq!(versions.len(), 1);
    assert_eq!(
        workspace
            .history
            .read_version(&path("favoris.md"), &versions[0])
            .unwrap(),
        "# Favoris"
    );
}

#[test]
fn the_index_follows_the_change_of_the_favorites_note() {
    let workspace = with_favorites("# Favoris", &NOTES);
    workspace.favorites().add(&path("courses.md")).unwrap();
    assert_eq!(
        workspace
            .index
            .content(&path("favoris.md"))
            .unwrap()
            .as_deref(),
        Some("# Favoris\n- [[Courses]]\n")
    );
}

#[test]
fn removing_takes_off_every_line_that_designates_the_content_and_gives_them_back() {
    let text = "# Favoris\n- [[Courses]]\n- [[Agenda]]\n1. [[courses]]\nvoir [[Courses]]\n";
    let workspace = with_favorites(text, &NOTES);
    let removed = workspace.favorites().remove(&path("courses.md")).unwrap();
    assert_eq!(
        workspace.text("favoris.md"),
        "# Favoris\n- [[Agenda]]\nvoir [[Courses]]\n"
    );
    assert_eq!(removed.len(), 2);
    assert!(
        !workspace
            .favorites()
            .is_favorite(&path("courses.md"))
            .unwrap()
    );

    workspace.favorites().restore(&removed).unwrap();
    assert_eq!(workspace.text("favoris.md"), text);
    assert!(
        workspace
            .favorites()
            .is_favorite(&path("courses.md"))
            .unwrap()
    );
}

#[test]
fn removing_a_content_that_is_not_a_favorite_writes_and_keeps_nothing() {
    let workspace = with_favorites("- [[Agenda]]\n", &NOTES);
    let removed = workspace.favorites().remove(&path("courses.md")).unwrap();
    assert!(removed.is_empty());
    assert_eq!(workspace.text("favoris.md"), "- [[Agenda]]\n");
    assert!(
        workspace
            .history
            .versions(&path("favoris.md"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn restoring_nothing_writes_and_keeps_nothing() {
    let workspace = with_favorites("- [[Agenda]]\n", &NOTES);
    workspace.favorites().restore(&[]).unwrap();
    assert!(
        workspace
            .history
            .versions(&path("favoris.md"))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_removal_keeps_the_text_before_it_as_a_version() {
    let workspace = with_favorites("- [[Courses]]\n", &NOTES);
    workspace.favorites().remove(&path("courses.md")).unwrap();
    let versions = workspace.history.versions(&path("favoris.md")).unwrap();
    assert_eq!(
        workspace
            .history
            .read_version(&path("favoris.md"), &versions[0])
            .unwrap(),
        "- [[Courses]]\n"
    );
}

#[test]
fn the_favorites_are_listed_in_the_order_of_the_note_with_their_title_and_type() {
    let workspace = with_favorites(
        "# Favoris\n\n## Dessins\n- [[plan.canvas]]\n\n## Travail\n- [[Agenda]]\n- [[Inconnu]]\nvoir [[Courses]]\n- [[agenda]]\n",
        &NOTES,
    );
    let list = workspace.favorites().list().unwrap();
    assert_eq!(list.note.path, path("favoris.md"));
    assert_eq!(list.note.title, "Favoris");
    assert_eq!(
        list.contents,
        [
            FavoriteContent {
                path: path("plan.canvas"),
                title: "plan".to_owned(),
                content_type: ContentType::Canvas,
            },
            FavoriteContent {
                path: path("agenda.md"),
                title: "Agenda".to_owned(),
                content_type: ContentType::Note,
            },
        ]
    );
}

#[test]
fn a_content_sent_to_the_trash_stays_on_its_line_without_being_listed_or_removed() {
    let workspace = with_favorites("- [[Courses]]\n- [[Agenda]]\n", &NOTES);
    workspace
        .store
        .trash_note(&path("courses.md"), &path("courses.md"))
        .unwrap();
    assert!(workspace.favorites().list().unwrap().contents.len() == 1);
    assert!(
        workspace
            .favorites()
            .remove(&path("courses.md"))
            .unwrap()
            .is_empty()
    );
    assert_eq!(
        workspace.text("favoris.md"),
        "- [[Courses]]\n- [[Agenda]]\n"
    );
}
