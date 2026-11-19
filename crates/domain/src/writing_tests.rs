use super::*;

use WritingAction::{Correct, Rephrase, Summarize};

fn framed(text: &str) -> String {
    format!("<texte>\n{text}\n</texte>")
}

fn answers(texts: &[&str]) -> Vec<String> {
    texts.iter().map(|t| (*t).to_owned()).collect()
}

#[test]
fn each_action_has_its_own_short_french_instructions() {
    assert!(Correct.instructions().starts_with("Corrige l'orthographe"));
    assert!(Rephrase.instructions().starts_with("Reformule le texte"));
    assert!(
        Summarize
            .instructions()
            .starts_with("Résume en une ou deux phrases")
    );
}

#[test]
fn a_passage_is_sent_framed_so_it_is_never_taken_as_instructions() {
    assert_eq!(
        Passages::of(Correct, "Bonjour.").prompts(),
        [framed("Bonjour.")]
    );
}

#[test]
fn correcting_sends_each_paragraph_alone_and_keeps_what_separates_them() {
    let passages = Passages::of(Correct, "Un.\n\n  \nDeux\ntrois.\n");
    assert_eq!(passages.prompts(), [framed("Un."), framed("Deux\ntrois.")]);
    assert_eq!(
        passages.rejoined(&answers(&["UN.", "DEUX\nTROIS."])),
        "UN.\n\n  \nDEUX\nTROIS.\n"
    );
}

#[test]
fn the_spaces_around_the_selection_stay_as_they_were() {
    let passages = Passages::of(Rephrase, "  \n un  \n");
    assert_eq!(passages.prompts(), [framed("un")]);
    assert_eq!(passages.rejoined(&answers(&[" Un "])), "  \n Un  \n");
}

#[test]
fn a_blank_selection_sends_nothing_and_stays_as_it_was() {
    let passages = Passages::of(Correct, " \n ");
    assert_eq!(passages.prompts(), Vec::<String>::new());
    assert_eq!(passages.rejoined(&[]), " \n ");
}

#[test]
fn summarizing_sends_neighbouring_paragraphs_together() {
    let passages = Passages::of(Summarize, "Un.\n\nDeux.");
    assert_eq!(passages.prompts(), [framed("Un.\n\nDeux.")]);
    assert_eq!(passages.rejoined(&answers(&["Résumé."])), "Résumé.");
}

#[test]
fn summarizing_starts_a_new_passage_when_the_next_paragraph_would_not_fit() {
    let paragraph = "a".repeat(749);
    let text = format!("{paragraph}\n\n{paragraph}\n\n{paragraph}");
    let passages = Passages::of(Summarize, &text);
    assert_eq!(
        passages.prompts(),
        [
            framed(&format!("{paragraph}\n\n{paragraph}")),
            framed(&paragraph)
        ]
    );
    assert_eq!(passages.rejoined(&answers(&["X", "Y"])), "X\n\nY");
}

#[test]
fn a_paragraph_too_long_is_cut_between_its_sentences() {
    let sentence = format!("{} {}.", "a".repeat(99), "a".repeat(499));
    let text = format!("{sentence} {sentence}  {sentence}");
    let passages = Passages::of(Correct, &text);
    assert_eq!(
        passages.prompts(),
        [framed(&format!("{sentence} {sentence}")), framed(&sentence)]
    );
    assert_eq!(passages.rejoined(&answers(&["X", "Y"])), "X  Y");
}

#[test]
fn a_sentence_too_long_is_cut_between_its_words() {
    let word = "b".repeat(999);
    let passages = Passages::of(Correct, &format!("{word}\t{word}"));
    assert_eq!(passages.prompts(), [framed(&word), framed(&word)]);
    assert_eq!(passages.rejoined(&answers(&["X", "Y"])), "X\tY");
}

#[test]
fn a_word_too_long_is_cut_anywhere_without_breaking_a_character() {
    let passages = Passages::of(Correct, &"é".repeat(MAX_PASSAGE_CHARS + 1));
    assert_eq!(
        passages.prompts(),
        [framed(&"é".repeat(MAX_PASSAGE_CHARS)), framed("é")]
    );
    assert_eq!(passages.rejoined(&answers(&["X", "Y"])), "XY");
}

#[test]
fn a_passage_just_at_the_limit_is_sent_whole() {
    let text = "c".repeat(MAX_PASSAGE_CHARS);
    assert_eq!(Passages::of(Correct, &text).prompts(), [framed(&text)]);
}

#[test]
fn line_marks_are_set_aside_and_put_back_on_each_line_of_the_answer() {
    let passages = Passages::of(Correct, "- [ ] acheté du pain\n- apeler maman");
    assert_eq!(passages.prompts(), [framed("acheté du pain\napeler maman")]);
    assert_eq!(
        passages.rejoined(&answers(&["acheté du pain\n\n appeler maman"])),
        "- [ ] acheté du pain\n- appeler maman"
    );
}

#[test]
fn every_kind_of_line_mark_is_set_aside() {
    let text = "## Titre\n> cité\n12. douze\n3) trois\n  * retrait\n1. [x] fait\n+ [X] plus";
    assert_eq!(
        Passages::of(Correct, text).prompts(),
        [framed("Titre\ncité\ndouze\ntrois\nretrait\nfait\nplus")]
    );
}

#[test]
fn what_only_looks_like_a_line_mark_is_sent() {
    let text = "####### sept\n#collé\n-collé\n1.collé\n1234567890. long\n[ ] seule\n>collé\n\tpas de marque";
    assert_eq!(
        Passages::of(Correct, text).prompts(),
        [framed(
            "####### sept\n#collé\n-collé\n1.collé\n1234567890. long\n[ ] seule\n>collé\n\tpas de marque"
        )]
    );
}

#[test]
fn an_answer_with_another_number_of_lines_is_taken_as_it_is() {
    let passages = Passages::of(Rephrase, "- un\n- deux");
    assert_eq!(passages.rejoined(&answers(&["Un et deux."])), "Un et deux.");
}

#[test]
fn a_line_mark_the_model_kept_is_not_doubled() {
    let passages = Passages::of(Correct, "1. un");
    assert_eq!(passages.rejoined(&answers(&["- Un"])), "1. Un");
}

#[test]
fn the_frame_copied_by_the_model_is_removed() {
    let passages = Passages::of(Correct, "Bonjour.");
    assert_eq!(
        passages.rejoined(&answers(&[" <texte>\nBonjour !\n</texte>\n"])),
        "Bonjour !"
    );
}

#[test]
fn a_summary_keeps_its_line_marks_in_the_text_sent() {
    let passages = Passages::of(Summarize, "- un\n- deux");
    assert_eq!(passages.prompts(), [framed("- un\n- deux")]);
    assert_eq!(
        passages.rejoined(&answers(&["Deux choses."])),
        "Deux choses."
    );
}

#[test]
fn a_passage_without_answer_stays_as_it_was() {
    let passages = Passages::of(Correct, "- Un.\n\nDeux.");
    assert_eq!(passages.rejoined(&answers(&["UN."])), "- UN.\n\nDeux.");
}
