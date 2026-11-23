//! Propriétés vérifiées sur des milliers de textes générés au hasard.

use domain::attachments::relink;
use domain::conflict::conflict_copy_name;
use domain::front_matter::{is_pinned, pinned, split, unpinned};
use domain::search::{ExcerptPart, SearchQuery, search};
use domain::title::displayed_title;
use domain::{AttachmentName, FileName, Fingerprint, Folder, Moment, NotePath, Title};
use proptest::prelude::*;

/// Une ligne de note plausible : titres, blocs de code, délimiteurs d'en-tête, texte libre.
fn markdown_line() -> impl Strategy<Value = String> {
    prop_oneof![
        any::<String>().prop_map(|t| format!("# {t}")),
        any::<String>().prop_map(|t| format!("## {t}")),
        Just("```".to_owned()),
        Just("~~~".to_owned()),
        Just("---".to_owned()),
        "[ #\t\r*_a-zé🚀]{0,12}",
        any::<String>(),
    ]
}

/// Une note plausible, avec des fins de ligne Unix ou Windows.
fn markdown_note() -> impl Strategy<Value = String> {
    (prop::collection::vec(markdown_line(), 0..10), any::<bool>())
        .prop_map(|(lines, windows)| lines.join(if windows { "\r\n" } else { "\n" }))
}

proptest! {
    #[test]
    fn a_dropped_file_name_always_becomes_a_safe_name_its_link_leads_back_to(
        stem in any::<String>(),
        extension in prop::sample::select(vec!["png", "JPG", "pdf", "Svg"]),
    ) {
        let name = AttachmentName::dropped(&format!("{stem}.{extension}")).unwrap();
        let text = name.to_name();
        let existing = AttachmentName::existing(&text);
        prop_assert_eq!(existing.as_ref(), Some(&name));
        let note = FileName::parse("note.md").unwrap();
        let link = name.markdown_link(&note);
        let target = link.rsplit_once("](").unwrap().1.strip_suffix(')').unwrap();
        prop_assert!(!target.contains([' ', '(', ')']));
        prop_assert_eq!(AttachmentName::in_link(&note, target), Some(name));
    }

    #[test]
    fn pinning_and_unpinning_never_touch_the_title(content in markdown_note()) {
        let title = displayed_title(&content);
        let pinned_note = pinned(&content);
        prop_assert!(is_pinned(&pinned_note));
        prop_assert_eq!(displayed_title(&pinned_note), title.clone());
        prop_assert_eq!(pinned(&pinned_note), pinned_note.clone());
        let unpinned_note = unpinned(&pinned_note);
        prop_assert!(!is_pinned(&unpinned_note));
        prop_assert_eq!(displayed_title(&unpinned_note), title);
    }

    #[test]
    fn pinning_keeps_the_body_of_the_note(content in markdown_note()) {
        let (_, body) = split(&content);
        let pinned_note = pinned(&content);
        prop_assert_eq!(split(&pinned_note).1, body);
    }

    #[test]
    fn pinning_then_unpinning_a_note_without_header_gives_it_back(content in markdown_note()) {
        if split(&content).0.is_none() && !content.starts_with("---") {
            prop_assert_eq!(unpinned(&pinned(&content)), content);
        }
    }

    #[test]
    fn a_title_always_gives_a_safe_kebab_case_file_name(content in markdown_note()) {
        let name = FileName::from_title(Title::of(&content).as_ref());
        prop_assert!(is_kebab_file_name(name.as_str()), "nom produit : {}", name.as_str());
        prop_assert_eq!(FileName::parse(name.as_str()), Ok(name.clone()));
    }

    #[test]
    fn a_file_name_never_leaves_the_workspace_folder(name in any::<String>()) {
        if let Ok(parsed) = FileName::parse(&name) {
            prop_assert!(!parsed.as_str().contains(['/', '\\', '\0']));
            prop_assert!(!parsed.as_str().starts_with('.'));
            prop_assert!(parsed.as_str().to_ascii_lowercase().ends_with(".md"));
        }
    }

    #[test]
    fn a_folder_path_reads_back_as_written(path in "([A-Za-zé0-9]([A-Za-zé0-9 ]{0,5}[A-Za-zé0-9])?/){0,3}[A-Za-zé0-9]{1,6}") {
        let folder = Folder::parse(&path).unwrap();
        prop_assert_eq!(folder.to_path(), path.clone());
        let note = NotePath::parse(&format!("{path}/note.md")).unwrap();
        prop_assert_eq!(note.folder(), &folder);
        prop_assert_eq!(note.to_path(), format!("{path}/note.md"));
    }

    #[test]
    fn a_folder_or_note_path_never_leaves_the_workspace(path in any::<String>()) {
        if let Ok(folder) = Folder::parse(&path) {
            prop_assert!(folder.names().iter().all(|n| !n.as_str().starts_with('.') && !n.as_str().contains(['/', '\\', '\0'])));
            prop_assert_eq!(folder.to_path(), path.clone());
        }
        if let Ok(note) = NotePath::parse(&path) {
            prop_assert_eq!(note.to_path(), path);
        }
    }

    #[test]
    fn a_deduplicated_name_is_never_taken(stem in "[a-z]{1,8}", taken_count in 0usize..6) {
        let taken: Vec<String> = (0..taken_count)
            .map(|i| if i == 0 { format!("{stem}.md") } else { format!("{stem}-{}.md", i + 1) })
            .collect();
        let name = FileName::parse(&format!("{stem}.md")).unwrap()
            .deduplicated(|candidate| taken.iter().any(|t| t == candidate.as_str()));
        prop_assert!(!taken.iter().any(|t| t == name.as_str()));
    }

    #[test]
    fn a_title_never_contains_line_breaks_nor_is_empty(content in markdown_note()) {
        if let Some(title) = Title::of(&content) {
            prop_assert!(!title.as_str().is_empty());
            prop_assert!(!title.as_str().contains(['\n', '\r']));
            prop_assert_eq!(title.as_str().trim(), title.as_str());
        }
        prop_assert!(!displayed_title(&content).is_empty());
    }

    #[test]
    fn splitting_front_matter_loses_nothing(content in markdown_note()) {
        let (front_matter, body) = split(&content);
        prop_assert!(content.ends_with(body));
        if let Some(yaml) = front_matter {
            prop_assert!(content.contains(yaml));
        } else {
            prop_assert_eq!(body, content.as_str());
        }
    }

    #[test]
    fn relinking_to_the_same_name_changes_nothing(content in any::<String>(), stem in "[a-z]{1,8}") {
        let name = FileName::parse(&format!("{stem}.md")).unwrap();
        prop_assert_eq!(relink(&content, &name, &name), content);
    }

    #[test]
    fn relinking_there_and_back_restores_the_links(text in "[a-z ]{0,20}", a in "[a-z]{1,6}", b in "[A-Z]{1,6}") {
        let (old, new) = (FileName::parse(&format!("{a}.md")).unwrap(), FileName::parse(&format!("{b}.md")).unwrap());
        let content = format!("{text}![x]({a}.assets/img.png) [y](<{a}.assets/doc.pdf>)");
        let moved = relink(&content, &old, &new);
        let old_link = format!("({a}.assets/");
        prop_assert!(!moved.contains(&old_link));
        prop_assert_eq!(relink(&moved, &new, &old), content);
    }
}

/// `mots-en-minuscules-ou-chiffres.md`, sans tiret au début, à la fin ni doublé.
fn is_kebab_file_name(name: &str) -> bool {
    let Some(stem) = name.strip_suffix(".md") else {
        return false;
    };
    stem.split('-').all(|part| {
        !part.is_empty()
            && part
                .bytes()
                .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit())
    })
}

/// Un mot cherchable : des lettres, avec ou sans accent.
fn word() -> impl Strategy<Value = String> {
    "[a-zA-Zéèàçôœ]{1,8}"
}

fn excerpt_text(parts: &[ExcerptPart]) -> String {
    parts
        .iter()
        .map(|p| match p {
            ExcerptPart::Text(t) | ExcerptPart::Match(t) => t.as_str(),
        })
        .collect()
}

proptest! {
    #[test]
    fn a_note_containing_every_word_is_found_whatever_the_case(
        before in any::<String>(), wanted in word(), after in any::<String>(),
    ) {
        let content = format!("{before} {wanted} {after}");
        let query = SearchQuery::parse(&wanted.to_uppercase()).unwrap();
        prop_assert!(search(&query, &content).is_some());
    }

    #[test]
    fn a_note_missing_a_word_is_never_found(content in "[a-m \n]{0,80}", missing in "[n-z]{1,5}") {
        let query = SearchQuery::parse(&missing).unwrap();
        prop_assert_eq!(search(&query, &content), None);
    }

    #[test]
    fn an_excerpt_is_one_short_line_of_the_note(content in markdown_note(), wanted in word()) {
        let content = format!("{content}\n{wanted}");
        let query = SearchQuery::parse(&wanted).unwrap();
        let excerpt = search(&query, &content).unwrap();
        let text = excerpt_text(excerpt.parts());
        prop_assert!(!text.contains(['\n', '\r']), "extrait : {text:?}");
        prop_assert!(text.chars().count() <= domain::search::EXCERPT_LENGTH + 2);
    }

    #[test]
    fn every_highlighted_part_is_a_searched_word(
        before in "[a-z ]{0,20}", wanted in word(), after in "[a-z ]{0,20}",
    ) {
        let content = format!("{before} {wanted} {after}");
        let query = SearchQuery::parse(&wanted).unwrap();
        let excerpt = search(&query, &content).unwrap();
        let matches: Vec<_> = excerpt.parts().iter().filter_map(|p| match p {
            ExcerptPart::Match(m) => Some(m.clone()),
            ExcerptPart::Text(_) => None,
        }).collect();
        prop_assert!(!matches.is_empty());
        prop_assert!(matches.iter().any(|m| m.to_lowercase().contains(&wanted.to_lowercase())));
    }

    #[test]
    fn a_fingerprint_changes_with_the_content(a in any::<String>(), b in any::<String>()) {
        prop_assume!(a != b);
        prop_assert_ne!(Fingerprint::of(&a), Fingerprint::of(&b));
        prop_assert_eq!(Fingerprint::parse(Fingerprint::of(&a).as_str()), Ok(Fingerprint::of(&a)));
    }

    #[test]
    fn a_conflict_copy_never_takes_an_existing_name(
        stem in "[a-zé 0-9-]{1,20}", copies in 0usize..4, hour in 0u32..24, minute in 0u32..60,
    ) {
        let original = FileName::parse(&format!("{stem}.md")).unwrap();
        let at = Moment::new(2026, 11, 16, hour, minute).unwrap();
        let mut existing = vec![original.clone()];
        for _ in 0..copies {
            existing.push(conflict_copy_name(&original, &at, &existing));
        }
        let copy = conflict_copy_name(&original, &at, &existing);
        prop_assert!(!existing.contains(&copy));
        let expected_start = format!("{stem} (conflit 2026-11-16 ");
        prop_assert!(copy.as_str().starts_with(&expected_start));
        prop_assert_eq!(FileName::parse(copy.as_str()), Ok(copy.clone()));
    }
}

/// Une note parmi un petit alphabet, pour que les listes se recoupent.
fn small_note() -> impl Strategy<Value = NotePath> {
    prop::sample::select(vec!["a", "b", "c", "d", "e", "f"])
        .prop_filter_map("nom de note valide", |name| {
            NotePath::parse(&format!("{name}.md")).ok()
        })
}

proptest! {
    #[test]
    fn fusing_lists_loses_no_note_and_invents_none(
        lists in prop::collection::vec(prop::collection::vec(small_note(), 0..8), 0..5),
    ) {
        let fused = domain::ranking::fuse(&lists);
        let given: std::collections::HashSet<_> = lists.iter().flatten().collect();
        let got: std::collections::HashSet<_> = fused.iter().collect();
        prop_assert_eq!(given, got);
        prop_assert_eq!(fused.len(), fused.iter().collect::<std::collections::HashSet<_>>().len());
    }

    #[test]
    fn a_note_at_the_head_of_every_list_heads_the_fusion(
        head in small_note(),
        tails in prop::collection::vec(prop::collection::vec(small_note(), 0..8), 1..5),
    ) {
        let lists: Vec<Vec<NotePath>> = tails
            .into_iter()
            .map(|tail| {
                let mut list = vec![head.clone()];
                list.extend(tail.into_iter().filter(|note| *note != head));
                list
            })
            .collect();
        let fused = domain::ranking::fuse(&lists);
        prop_assert_eq!(fused.first(), Some(&head));
    }
}
