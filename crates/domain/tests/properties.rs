//! Propriétés vérifiées sur des milliers de textes générés au hasard.

use domain::attachments::relink;
use domain::front_matter::split;
use domain::title::displayed_title;
use domain::{FileName, Title};
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
    fn a_title_always_gives_a_safe_kebab_case_file_name(content in markdown_note()) {
        let name = FileName::from_title(Title::of(&content).as_ref());
        prop_assert!(is_kebab_file_name(name.as_str()), "nom produit : {}", name.as_str());
        prop_assert_eq!(FileName::parse(name.as_str()), Ok(name.clone()));
    }

    #[test]
    fn a_file_name_never_leaves_the_library_folder(name in any::<String>()) {
        if let Ok(parsed) = FileName::parse(&name) {
            prop_assert!(!parsed.as_str().contains(['/', '\\', '\0']));
            prop_assert!(!parsed.as_str().starts_with('.'));
            prop_assert!(parsed.as_str().to_ascii_lowercase().ends_with(".md"));
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
