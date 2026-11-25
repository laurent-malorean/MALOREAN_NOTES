//! Le texte d'une action sous son titre (spécification § 4.5) : la description, les listes à cocher
//! et les commentaires. Ils peuvent se suivre dans n'importe quel ordre ; le CRM les écrit dans
//! l'ordre description, listes, commentaires, et ne réécrit que la partie touchée.

use super::day::DayTime;

const CHECKLIST_HEADER: &str = "#### Liste à cocher";
const COMMENTS_HEADER: &str = "#### Commentaires";
const NAME_MARK: char = ':';
const COMMENT_MARK: &str = "- ";
const COMMENT_SEPARATOR: char = '·';
/// Le retrait des lignes qui suivent la première d'un commentaire.
const COMMENT_INDENT: &str = "  ";
const BULLETS: [char; 3] = ['-', '*', '+'];
const CODE_FENCES: [&str; 2] = ["```", "~~~"];

/// Un élément à cocher d'une liste à cocher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChecklistItem {
    /// Vrai s'il est coché.
    pub done: bool,
    /// Son texte, d'une ligne.
    pub text: String,
}

/// Une liste nommée d'éléments à cocher.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checklist {
    /// Son nom, d'une ligne.
    pub name: String,
    /// Ses éléments, dans l'ordre.
    pub items: Vec<ChecklistItem>,
}

impl Checklist {
    /// L'avancement : le nombre d'éléments cochés et le nombre d'éléments.
    #[must_use]
    pub fn progress(&self) -> (usize, usize) {
        let done = self.items.iter().filter(|item| item.done).count();
        (done, self.items.len())
    }
}

/// Un texte daté ajouté à une action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Comment {
    /// Le moment de l'ajout, heure du Mac.
    pub at: DayTime,
    /// Son texte, Markdown, sur une ou plusieurs lignes.
    pub text: String,
}

/// Ce qu'une action dit sous son titre.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Body {
    /// La description : le texte hors listes à cocher et commentaires, Markdown, liens entre notes
    /// compris. Elle garde, à sa fin, les lignes qui n'avaient pas leur place dans une autre partie.
    pub description: String,
    /// Les listes à cocher, dans l'ordre.
    pub checklists: Vec<Checklist>,
    /// Les commentaires, dans l'ordre écrit.
    pub comments: Vec<Comment>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Kind {
    Checklist,
    Comments,
}

/// Une partie telle qu'écrite : son titre `####` puis ses lignes, sans ligne vide à la fin.
#[derive(Debug, Clone)]
struct Part {
    kind: Kind,
    lines: Vec<String>,
}

/// Le texte coupé en parties, avant d'en lire le sens.
#[derive(Debug, Default)]
struct Raw {
    description: Vec<String>,
    parts: Vec<Part>,
}

fn header_kind(line: &str) -> Option<Kind> {
    let line = line.trim_end();
    if line == COMMENTS_HEADER {
        return Some(Kind::Comments);
    }
    let rest = line.strip_prefix(CHECKLIST_HEADER)?;
    (rest.is_empty() || rest.trim_start().starts_with(NAME_MARK)).then_some(Kind::Checklist)
}

fn is_fence(line: &str) -> bool {
    CODE_FENCES
        .iter()
        .any(|fence| line.trim_start().starts_with(fence))
}

fn is_blank(line: &str) -> bool {
    line.trim().is_empty()
}

/// L'élément à cocher que dit une ligne `- [ ] texte` ou `- [x] texte`.
fn item_of(line: &str) -> Option<ChecklistItem> {
    let rest = line.trim_start().strip_prefix(BULLETS)?;
    let rest = rest.strip_prefix(' ')?.trim_start().strip_prefix('[')?;
    let (mark, text) = rest.split_once(']')?;
    let done = match mark {
        " " => false,
        "x" | "X" => true,
        _ => return None,
    };
    Some(ChecklistItem {
        done,
        text: text.trim().to_owned(),
    })
}

/// Le début d'un commentaire que dit une ligne `- 2026-11-24 10:32 · texte` : son moment et la
/// première ligne de son texte.
fn comment_start(line: &str) -> Option<(DayTime, &str)> {
    let rest = line.trim_end().strip_prefix(COMMENT_MARK)?;
    let (moment, text) = rest.split_once(COMMENT_SEPARATOR)?;
    let text = text.strip_prefix(' ').unwrap_or(text);
    Some((DayTime::parse(moment.trim())?, text))
}

fn is_indented(line: &str) -> bool {
    line.starts_with([' ', '\t'])
}

impl Part {
    /// Cette ligne a sa place dans la partie.
    fn accepts(&self, line: &str) -> bool {
        if is_blank(line) {
            return true;
        }
        match self.kind {
            Kind::Checklist => item_of(line).is_some(),
            Kind::Comments => {
                comment_start(line).is_some()
                    || (is_indented(line) && self.lines.iter().skip(1).any(|l| !is_blank(l)))
            }
        }
    }

    /// Le texte de la partie sans ses lignes vides finales.
    fn trimmed(mut self) -> Self {
        while self.lines.last().is_some_and(|line| is_blank(line)) {
            self.lines.pop();
        }
        self
    }

    fn checklist(&self) -> Checklist {
        let name = self
            .lines
            .first()
            .and_then(|header| header.trim().strip_prefix(CHECKLIST_HEADER))
            .map(|rest| rest.trim_start().strip_prefix(NAME_MARK).unwrap_or(rest))
            .unwrap_or_default();
        Checklist {
            name: name.trim().to_owned(),
            items: self.lines.iter().filter_map(|l| item_of(l)).collect(),
        }
    }

    fn comments(&self) -> Vec<Comment> {
        let mut comments: Vec<(DayTime, Vec<String>)> = Vec::new();
        let mut pending_blanks = 0;
        for line in self.lines.iter().skip(1) {
            if let Some((at, first)) = comment_start(line) {
                comments.push((at, vec![first.to_owned()]));
                pending_blanks = 0;
            } else if is_blank(line) {
                pending_blanks += 1;
            } else if let Some((_, text)) = comments.last_mut() {
                text.extend(std::iter::repeat_n(String::new(), pending_blanks));
                let indent = line.strip_prefix(COMMENT_INDENT).unwrap_or(line);
                text.push(indent.trim_start_matches('\t').trim_end().to_owned());
                pending_blanks = 0;
            }
        }
        comments
            .into_iter()
            .map(|(at, text)| Comment {
                at,
                text: text.join("\n").trim_end().to_owned(),
            })
            .collect()
    }
}

/// Le texte coupé en parties : chaque ligne d'une partie qui n'a pas sa place dans celle-ci est
/// gardée dans la description, à sa fin.
fn read_raw(text: &str) -> Raw {
    let mut raw = Raw::default();
    let mut strays = Vec::new();
    let mut in_fence = false;
    for line in text.lines() {
        let fence = is_fence(line);
        let kind = if in_fence { None } else { header_kind(line) };
        in_fence ^= fence;
        if let Some(kind) = kind {
            raw.parts.push(Part {
                kind,
                lines: vec![line.to_owned()],
            });
        } else if let Some(part) = raw.parts.last_mut() {
            if !fence && !in_fence && part.accepts(line) {
                part.lines.push(line.to_owned());
            } else {
                strays.push(line.to_owned());
            }
        } else {
            raw.description.push(line.to_owned());
        }
    }
    raw.description.extend(strays);
    raw.parts = raw.parts.into_iter().map(Part::trimmed).collect();
    raw
}

/// La description : les lignes sans les lignes vides du début et de la fin.
fn description_of(lines: &[String]) -> String {
    let first = lines.iter().position(|line| !is_blank(line));
    let last = lines.iter().rposition(|line| !is_blank(line));
    match (first, last) {
        (Some(first), Some(last)) => lines[first..=last].join("\n"),
        _ => String::new(),
    }
}

impl Raw {
    fn body(&self) -> Body {
        let of_kind = |kind| self.parts.iter().filter(move |part| part.kind == kind);
        Body {
            description: description_of(&self.description),
            checklists: of_kind(Kind::Checklist).map(Part::checklist).collect(),
            comments: of_kind(Kind::Comments).flat_map(Part::comments).collect(),
        }
    }
}

impl Body {
    /// Ce que dit le texte `text` qui suit le titre d'une action.
    #[must_use]
    pub fn parse(text: &str) -> Self {
        read_raw(text).body()
    }
}

fn single_line(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn rendered_checklist(checklist: &Checklist) -> String {
    let name = single_line(&checklist.name);
    let header = if name.is_empty() {
        format!("{CHECKLIST_HEADER} {NAME_MARK}")
    } else {
        format!("{CHECKLIST_HEADER} {NAME_MARK} {name}")
    };
    let items = checklist.items.iter().map(|item| {
        let mark = if item.done { 'x' } else { ' ' };
        format!("- [{mark}] {}", single_line(&item.text))
    });
    std::iter::once(header)
        .chain(items)
        .collect::<Vec<_>>()
        .join("\n")
}

fn rendered_comments(comments: &[Comment]) -> String {
    let mut lines = vec![COMMENTS_HEADER.to_owned()];
    for comment in comments {
        let mut text = comment.text.trim_end().lines();
        let first = text.next().unwrap_or_default();
        lines.push(format!(
            "{COMMENT_MARK}{} {COMMENT_SEPARATOR} {first}",
            comment.at
        ));
        lines.extend(text.map(|line| {
            if line.trim().is_empty() {
                String::new()
            } else {
                format!("{COMMENT_INDENT}{line}")
            }
        }));
    }
    lines.join("\n")
}

/// Le texte qui suit le titre une fois que l'action dit `new` : la description, les listes à cocher
/// puis les commentaires, chaque partie séparée par une ligne vide. Une partie que `new` ne change
/// pas garde son texte tel qu'il était écrit dans `text` (le texte qui suivait le titre) ; seule la
/// partie touchée est réécrite.
#[must_use]
pub(crate) fn rewritten(text: &str, new: &Body) -> String {
    let raw = read_raw(text);
    let old = raw.body();
    let mut blocks = vec![new.description.trim_matches(['\n', '\r']).to_owned()];
    let mut unused: Vec<(Checklist, &Part)> = raw
        .parts
        .iter()
        .filter(|part| part.kind == Kind::Checklist)
        .map(|part| (part.checklist(), part))
        .collect();
    for checklist in &new.checklists {
        let same = unused.iter().position(|(old, _)| old == checklist);
        blocks.push(match same {
            Some(at) => unused.remove(at).1.lines.join("\n"),
            None => rendered_checklist(checklist),
        });
    }
    if new.comments == old.comments {
        let comments = raw.parts.iter().filter(|part| part.kind == Kind::Comments);
        blocks.extend(comments.map(|part| part.lines.join("\n")));
    } else if !new.comments.is_empty() {
        blocks.push(rendered_comments(&new.comments));
    }
    blocks.retain(|block| !block.trim().is_empty());
    if blocks.is_empty() {
        String::new()
    } else {
        format!("\n{}\n", blocks.join("\n\n"))
    }
}

#[cfg(test)]
#[path = "action_body_tests.rs"]
mod tests;
