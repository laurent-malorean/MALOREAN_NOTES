//! La note du jour sur le disque : le journal et ses dossiers parents sont créés au besoin.

use std::fs;

use application::testing::FixedClock;
use application::use_cases::CreateDailyNote;
use domain::Folder;
use infrastructure::FsNoteStore;
use tempfile::TempDir;

#[test]
fn the_daily_note_creates_its_missing_journal_folders_then_is_reused() {
    let dir = TempDir::new().unwrap();
    fs::create_dir(dir.path().join("Perso")).unwrap();
    let store = FsNoteStore::new(dir.path().to_path_buf());
    let clock = FixedClock::default();
    let journal = Folder::parse("Perso/Vie/Journal").unwrap();

    let created = CreateDailyNote::new(&store, &clock)
        .execute(&journal, None)
        .unwrap();
    let file = dir.path().join("Perso/Vie/Journal/2026-11-16.md");
    assert_eq!(created.to_path(), "Perso/Vie/Journal/2026-11-16.md");
    assert_eq!(fs::read_to_string(&file).unwrap(), "# 16 novembre 2026\n");

    fs::write(&file, "gardé").unwrap();
    let again = CreateDailyNote::new(&store, &clock)
        .execute(&journal, None)
        .unwrap();
    assert_eq!(again, created);
    assert_eq!(fs::read_to_string(&file).unwrap(), "gardé");
}
