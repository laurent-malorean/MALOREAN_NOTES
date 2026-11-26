//! Ce que Claude lit de chaque outil de l'application : son nom, ce qu'il fait, et ce qu'il
//! attend (schéma JSON de son entrée), dans les mots de l'application (fiche 0040).

use domain::app_tools::AppTool;
use serde_json::{Value, json};

mod canvas;

/// Un champ texte de l'entrée d'un outil, décrit pour Claude.
fn text(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

/// Le chemin d'une note, tel que les outils l'attendent.
fn note_path() -> Value {
    text("Chemin de la note depuis l'espace de travail : `dossier/nom.md`.")
}

/// Un dossier depuis l'espace de travail, la racine par défaut.
fn folder() -> Value {
    text("Le dossier depuis l'espace de travail : `Travail/Projets` ; la racine si absent.")
}

/// L'identifiant d'une version.
fn version() -> Value {
    text("L'identifiant de la version, tel que `list_versions` le donne : `2026-11-18 14h30`.")
}

/// Une liste d'étiquettes.
fn tag_list() -> Value {
    json!({
        "type": "array",
        "items": { "type": "string" },
        "description": "Les étiquettes, sans `#` : `[\"maison\", \"jardin\"]`.",
    })
}

/// L'entrée d'un outil : ses champs, et ceux qu'il exige.
fn input(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

/// Ce que fait un outil, et l'entrée qu'il attend.
type Described = (&'static str, Value);

fn list_workspaces() -> Described {
    (
        "Les espaces de travail que l'utilisateur a autorisés pour les IA (cases à cocher de \
         l'onglet « Brancher une IA » des Réglages), par leur nom : `name`, et `open` pour celui \
         qui est ouvert chez l'utilisateur. Aucun autre espace n'est visible. Si la liste est \
         vide, `message` dit que l'utilisateur doit en cocher un. Les autres outils visent \
         l'espace ouvert ; pour en viser un autre de cette liste, donnez son nom dans leur \
         paramètre `workspace`.",
        input(json!({}), &[]),
    )
}

fn search_notes() -> Described {
    (
        "Cherche des notes de l'espace de travail avec l'index de MALOREAN Notes, sans \
         parcourir les fichiers : les notes qui contiennent tous les mots de `query` \
         (majuscules et accents ignorés), et/ou qui portent l'étiquette `tag`, et/ou rangées \
         dans `folder` (sous-dossiers compris), et/ou d'un type de contenu (`note`, \
         `cahier-de-recherche`, `carte-mentale`, `crm` ou une fiche d'un CRM : `crm-entreprise`, \
         `crm-personne`, `crm-action`, `crm-projet`). Rend 100 notes au plus : chemin, titre, \
         dossier, étiquettes, et un extrait autour des mots trouvés ; pour un CRM ou une fiche, \
         aussi `type` et, pour une fiche, `crm`, le chemin de son CRM.",
        input(
            json!({
                "query": text("Les mots cherchés dans le texte des notes."),
                "tag": text("Une étiquette que les notes doivent porter."),
                "folder": text("Un dossier depuis l'espace de travail : `Travail/Projets`."),
                "content_type": text(
                    "Un type de contenu : `note`, `cahier-de-recherche`, `carte-mentale`, `crm`, \
                     `crm-entreprise`, `crm-personne`, `crm-action` ou `crm-projet`."
                ),
            }),
            &[],
        ),
    )
}

fn search_by_meaning() -> Described {
    (
        "Cherche des notes par ce qu'elles disent, pas par leurs mots exacts : à utiliser quand \
         on ne connaît pas les mots employés dans les notes (une idée, une question, un \
         synonyme). `question` s'écrit en une phrase naturelle. Rend les notes les plus proches, \
         la mieux classée d'abord : chemin, titre, et l'extrait trouvé (titre de la section, \
         puis le début de son texte) ; pour un CRM ou une fiche d'un CRM, aussi `type` et, pour \
         une fiche, `crm`, le chemin de son CRM. Si le sens n'est pas disponible (modèle non téléchargé, \
         calcul pas fini), la recherche par mots répond seule, et `reason` dit pourquoi : \
         dis-le à l'utilisateur.",
        input(
            json!({
                "question": text("Ce qu'on cherche, en une phrase : `comment j'ai décidé du budget`."),
                "limit": json!({
                    "type": "integer",
                    "description": "Combien de notes au plus (10 par défaut, 100 au plus).",
                }),
            }),
            &["question"],
        ),
    )
}

fn list_tags() -> Described {
    (
        "Liste les étiquettes de l'espace de travail, chacune avec son nombre de notes.",
        input(json!({}), &[]),
    )
}

fn list_folders() -> Described {
    (
        "L'arbre des dossiers de l'espace de travail : `folders`, les chemins de tous les \
         dossiers depuis la racine de l'espace (`Animaux`, `Animaux/Chiens`), dans l'ordre de \
         l'arbre de MALOREAN Notes (chaque dossier suivi de ses sous-dossiers, par ordre \
         alphabétique), sans la racine ; un dossier vide y est aussi. Les dossiers cachés, les \
         dossiers de pièces jointes (`….assets`), `node_modules` et la corbeille n'en font pas \
         partie. Les notes d'un dossier se listent avec `search_notes` (paramètre `folder`).",
        input(json!({}), &[]),
    )
}

fn linking_notes() -> Described {
    (
        "Les liens entrants d'une note : les notes dont un lien `[[titre]]` la désigne ; une \
         action d'un CRM la désigne par ses notes liées, sa description ou un commentaire. Pour \
         une fiche d'un CRM, `type` et `crm` (le chemin de son CRM) s'ajoutent.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn read_note() -> Described {
    (
        "Le texte entier d'une note simple, pour le lire ou en recopier un texte exact (par \
         exemple l'`old_text` de `replace_in_note`). Rend `path`, `title`, `header` (l'en-tête, \
         c'est-à-dire les propriétés, tel qu'il est écrit dans le fichier, lignes `---` \
         comprises ; vide si la note n'en a pas), `body` (tout le reste ; `header` suivi de `body` \
         redonne le fichier à l'identique), `characters` (le nombre de caractères du corps entier) \
         et `truncated`. Un corps de plus de 60 000 caractères est coupé à la fin d'une ligne : \
         `truncated` vaut alors true et `message` le dit, la suite ne se lit pas avec cet outil \
         (cherchez-la avec `search_notes`). Refusé, avec une erreur qui dit quoi faire, pour un \
         cahier de recherche (on y ajoute des entrées avec `add_entry` ; `search_notes` retrouve \
         ses entrées), une carte mentale, un CRM ou une fiche de CRM, une note \
         introuvable ; un canvas se lit avec `read_canvas`.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn list_templates() -> Described {
    (
        "Les noms des modèles de note (les notes du dossier des modèles choisi par \
         l'utilisateur), sans leur texte.",
        input(json!({}), &[]),
    )
}

fn list_versions() -> Described {
    (
        "L'historique des versions d'une note : chaque version gardée par MALOREAN Notes, \
         la plus récente d'abord, avec son identifiant et sa date.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn read_version() -> Described {
    (
        "Le texte d'une version d'une note, désignée par l'identifiant que donne \
         `list_versions` (`2026-11-18 14h30`).",
        input(
            json!({
                "path": note_path(),
                "version": version(),
            }),
            &["path", "version"],
        ),
    )
}

fn create_note() -> Described {
    (
        "Crée une note selon les règles de MALOREAN Notes : titre `# title` en tête, nom du \
         fichier tiré du titre (sans écraser une autre note), dans `folder` (la racine par \
         défaut ; créé avec ses parents s'il n'existe pas), avec `text` sous le titre. Rend son chemin.",
        input(
            json!({
                "title": text("Le titre de la note."),
                "folder": folder(),
                "text": text("Le texte de la note, en Markdown, sous son titre."),
            }),
            &["title"],
        ),
    )
}

fn create_folder() -> Described {
    (
        "Crée un dossier dans l'espace de travail, avec chacun des dossiers qui manquent sur son \
         chemin ; un dossier qui existe déjà est laissé tel quel. À appeler avant `create_note` \
         pour un dossier neuf. Rend son chemin.",
        input(
            json!({
                "path": text(
                    "Le chemin du dossier depuis la racine de l'espace de travail, séparé par `/` \
                     (`Animaux/Chiens`).",
                ),
            }),
            &["path"],
        ),
    )
}

/// Le chemin d'un dossier, tel que les outils de dossier l'attendent.
fn folder_path() -> Value {
    text(
        "Le chemin du dossier depuis la racine de l'espace de travail, séparé par `/` : `Animaux/Chiens`.",
    )
}

fn rename_folder() -> Described {
    (
        "Renomme un dossier : il reste à sa place, avec tout ce qu'il contient (notes, sous-dossiers, \
         pièces jointes, historique des versions ; l'index de recherche suit). Les liens \
         `[[Dossier/titre]]` qui l'écrivent ne sont pas réécrits, comme dans l'application : le \
         dossier n'y est qu'une précision, le lien reste valable tant que le titre est unique. \
         Refusé, sans rien changer, avec le message de l'application : nom vide, caché (commence \
         par `.`), terminé par `.assets`, `node_modules`, contenant `/` ou `\\` ; nom déjà pris par \
         un dossier voisin ; dossier introuvable ; la racine de l'espace (chemin vide). Rend le \
         nouveau chemin du dossier.",
        input(
            json!({
                "path": folder_path(),
                "name": text("Le nouveau nom du dossier, sans `/` : `Chiens de chasse`."),
            }),
            &["path", "name"],
        ),
    )
}

fn move_folder() -> Described {
    (
        "Déplace un dossier dans un autre, avec tout ce qu'il contient (notes, sous-dossiers, pièces \
         jointes, historique des versions ; l'index de recherche suit). Il garde son nom. Les liens \
         `[[Dossier/titre]]` ne sont pas réécrits (voir `rename_folder`). Refusé, sans rien \
         changer : dossier introuvable ou dossier d'arrivée introuvable ; dossier d'arrivée qui \
         est le dossier lui-même ou l'un de ses sous-dossiers ; un dossier du même nom déjà dans \
         le dossier d'arrivée ; la racine de l'espace. Rend le nouveau chemin du dossier.",
        input(
            json!({
                "path": folder_path(),
                "folder": text("Le dossier d'arrivée depuis la racine de l'espace de travail ; `` pour la racine."),
            }),
            &["path", "folder"],
        ),
    )
}

fn trash_folder() -> Described {
    (
        "Met un dossier, avec tout ce qu'il contient (notes, sous-dossiers, pièces jointes, \
         historique), à la corbeille de MALOREAN Notes, à son chemin d'origine (`Nom 2` s'il y est \
         déjà) : jamais effacé, l'utilisateur peut le restaurer. Refusé : dossier introuvable ; la \
         racine de l'espace (chemin vide). Rend `trashed`, son chemin dans la corbeille.",
        input(json!({ "path": folder_path() }), &["path"]),
    )
}

fn create_note_from_template() -> Described {
    (
        "Crée une note depuis un modèle de note : MALOREAN Notes applique le modèle (date, \
         heure et titre remplacés) ; inutile de lire le modèle. `template` est le nom que \
         donne `list_templates`. Rend son chemin.",
        input(
            json!({
                "template": text("Le nom du modèle, tel que `list_templates` le donne."),
                "title": text("Le titre de la nouvelle note."),
                "folder": folder(),
            }),
            &["template", "title"],
        ),
    )
}

fn trash_note() -> Described {
    (
        "Met une note à la corbeille de MALOREAN Notes (jamais effacée : l'utilisateur peut \
         la restaurer), avec ses pièces jointes et son historique.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn rename_note() -> Described {
    (
        "Change le titre d'une note : son fichier et son dossier de pièces jointes sont \
         renommés, ses liens vers ses pièces jointes suivent. Rend son nouveau chemin et les \
         notes dont un lien `[[ancien titre]]` la visait (à reprendre avec vos outils de \
         fichiers si besoin).",
        input(
            json!({ "path": note_path(), "title": text("Le nouveau titre.") }),
            &["path", "title"],
        ),
    )
}

fn move_note() -> Described {
    (
        "Range une note dans un autre dossier, avec ses pièces jointes et son historique ; un \
         nom pris reçoit un suffixe. Rend son nouveau chemin.",
        input(
            json!({ "path": note_path(), "folder": text("Le dossier d'arrivée depuis l'espace de travail ; `` pour la racine.") }),
            &["path", "folder"],
        ),
    )
}

fn restore_version() -> Described {
    (
        "Remet dans une note le texte d'une de ses versions (identifiant de `list_versions`) ; \
         son texte actuel est d'abord gardé comme version.",
        input(
            json!({ "path": note_path(), "version": version() }),
            &["path", "version"],
        ),
    )
}

fn replace_in_note() -> Described {
    (
        "Remplace un texte par un autre dans le texte d'une note simple, avec les règles de \
         MALOREAN Notes : le texte d'avant est gardé dans l'historique des versions, l'index de \
         recherche suit, l'en-tête (propriétés) et le reste de la note ne bougent pas. \
         `old_text` est recopié à l'identique (majuscules, accents, espaces, retours à la ligne ; \
         jamais un motif) et cherché dans tout le fichier, en-tête compris : lisez d'abord la \
         note avec `read_note` pour le recopier exactement. Pour insérer, \
         remplacez une ligne par elle-même suivie du nouveau texte ; pour supprimer, donnez un \
         `new_text` vide. Refusé, sans rien changer, avec une erreur qui dit quoi faire : \
         `old_text` introuvable ou vide ou identique à `new_text` ; `old_text` répété (l'erreur \
         donne le nombre d'occurrences et leurs lignes : ajoutez du texte autour pour qu'il \
         n'apparaisse qu'une fois, ou passez `replace_all` à true pour toutes les remplacer) ; la \
         note est un cahier de recherche (utilisez `add_entry`), une carte mentale, un canvas \
         (utilisez `read_canvas` et les outils du canvas) ou un CRM. Si le remplacement change le titre `# …`, le fichier est renommé d'après le \
         nouveau titre : utilisez ensuite le `path` rendu, et pensez aux notes qui la lient (voir \
         `rename_note`). Rend `path`, `title` et `replacements` (le nombre de remplacements).",
        input(
            json!({
                "path": note_path(),
                "old_text": text("Le texte à remplacer, exact, sur une ou plusieurs lignes ; jamais vide."),
                "new_text": text("Le nouveau texte ; vide pour supprimer `old_text`."),
                "replace_all": json!({
                    "type": "boolean",
                    "description": "true pour remplacer toutes les occurrences de `old_text` ; false (par défaut) refuse un texte qui apparaît plusieurs fois.",
                }),
            }),
            &["path", "old_text", "new_text"],
        ),
    )
}

fn add_tags() -> Described {
    (
        "Ajoute des étiquettes dans l'en-tête d'une note, sans toucher au reste.",
        input(
            json!({ "path": note_path(), "tags": tag_list() }),
            &["path", "tags"],
        ),
    )
}

fn remove_tags() -> Described {
    (
        "Retire des étiquettes de l'en-tête d'une note, sans toucher au reste.",
        input(
            json!({ "path": note_path(), "tags": tag_list() }),
            &["path", "tags"],
        ),
    )
}

fn pin_note() -> Described {
    (
        "Épingle une note en tête de la liste des notes.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn unpin_note() -> Described {
    (
        "Désépingle une note.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn add_attachment() -> Described {
    (
        "Ajoute à une note, comme pièce jointe, une image ou un PDF déjà rangé dans l'espace \
         de travail : il est copié dans le dossier de pièces jointes de la note (le fichier \
         d'origine reste où il est) et son lien est ajouté à la fin de la note.",
        input(
            json!({
                "path": note_path(),
                "file": text("Le fichier à joindre, depuis l'espace de travail : `Documents/plan.pdf`."),
            }),
            &["path", "file"],
        ),
    )
}

fn add_entry() -> Described {
    (
        "Ajoute une entrée à la fin d'un cahier de recherche (une note dont l'en-tête porte \
         `type: cahier-de-recherche`), à l'heure qu'il est, sous les titres d'année, de mois et \
         de jour qui manquent. C'est la seule façon d'écrire dans un cahier : il ne se modifie \
         jamais, ni par cet outil ni par vos outils de fichiers. Une erreur se \
         rectifie par une nouvelle entrée. Rend l'entrée ajoutée : ancre, moment et texte.",
        input(
            json!({
                "path": text("Chemin du cahier depuis l'espace de travail : `dossier/nom.md`."),
                "text": text("Le texte de l'entrée ; plusieurs lignes permises."),
            }),
            &["path", "text"],
        ),
    )
}

fn create_mind_map() -> Described {
    (
        "Crée une carte mentale (une note dont l'en-tête porte `type: carte-mentale`) selon les \
         règles de MALOREAN Notes : titre `# title` en tête, nom du fichier tiré du titre (sans \
         écraser une autre note), dans `folder` (la racine par défaut ; créé avec ses parents \
         s'il n'existe pas). `content`, facultatif, est la liste de départ : une puce `- ` par \
         nœud, 2 espaces de retrait par niveau, `> texte` sous une puce pour son détail, \
         ` <!-- couleur: rouge -->` au bout d'une puce pour sa couleur (rouge, orange, jaune, \
         vert, turquoise, bleu, violet, rose, marron, ardoise). Rend son chemin. Ensuite, la \
         carte se lit et s'écrit avec vos outils de fichiers : n'écrivez dans la liste que des \
         puces et des lignes de détail, et ne touchez jamais à la propriété `racines` de \
         l'en-tête (elle est tenue par l'application).",
        input(
            json!({
                "title": text("Le titre de la carte."),
                "folder": folder(),
                "content": text("La liste à puces de départ ; une carte vide si absent."),
            }),
            &["title"],
        ),
    )
}

fn create_crm() -> Described {
    (
        "Crée un CRM (une note dont l'en-tête porte `type: crm`) selon les règles de MALOREAN \
         Notes : titre `# title` en tête, nom du fichier tiré du titre (sans écraser une autre \
         note), dans `folder` (la racine par défaut ; créé avec ses parents s'il n'existe pas). \
         Le titre tient sur une ligne et n'est pas vide. Rend son chemin. Ensuite, ses entreprises, \
         personnes, actions et projets sont des fiches (des notes) rangées dans des dossiers qui \
         portent le nom du fichier du CRM : vous les lisez et les écrivez avec vos outils de \
         fichiers, selon la consigne donnée à la présentation du serveur.",
        input(
            json!({
                "title": text("Le titre du CRM."),
                "folder": folder(),
            }),
            &["title"],
        ),
    )
}

fn viewed_note() -> Described {
    (
        "Ce que l'utilisateur regarde dans MALOREAN Notes : la note ouverte dans la colonne \
         active (chemin et titre, ou rien) et le texte qu'il y a sélectionné (vide s'il n'y en a \
         pas), avec le nom de l'espace de travail. Utile quand il parle de « cette note » ou de \
         « ce passage ».",
        input(json!({}), &[]),
    )
}

fn show_note() -> Described {
    (
        "Montre une note à l'utilisateur : MALOREAN Notes l'ouvre dans la colonne active (par \
         exemple la note que vous venez de créer ou de trouver).",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

/// Ce que fait l'outil, et l'entrée qu'il attend.
fn described(tool: AppTool) -> Described {
    match tool {
        AppTool::ListWorkspaces => list_workspaces(),
        AppTool::SearchNotes => search_notes(),
        AppTool::SearchByMeaning => search_by_meaning(),
        AppTool::ListTags => list_tags(),
        AppTool::ListFolders => list_folders(),
        AppTool::LinkingNotes => linking_notes(),
        AppTool::ReadNote => read_note(),
        AppTool::ReadCanvas => canvas::read_canvas(),
        AppTool::ListTemplates => list_templates(),
        AppTool::ListVersions => list_versions(),
        AppTool::ReadVersion => read_version(),
        AppTool::CreateNote => create_note(),
        AppTool::CreateFolder => create_folder(),
        AppTool::RenameFolder => rename_folder(),
        AppTool::MoveFolder => move_folder(),
        AppTool::TrashFolder => trash_folder(),
        AppTool::CreateNoteFromTemplate => create_note_from_template(),
        AppTool::TrashNote => trash_note(),
        AppTool::RenameNote => rename_note(),
        AppTool::MoveNote => move_note(),
        AppTool::RestoreVersion => restore_version(),
        AppTool::ReplaceInNote => replace_in_note(),
        AppTool::AddCanvasCard => canvas::add_canvas_card(),
        AppTool::ChangeCanvasCard => canvas::change_canvas_card(),
        AppTool::MoveCanvasCard => canvas::move_canvas_card(),
        AppTool::ResizeCanvasCard => canvas::resize_canvas_card(),
        AppTool::RemoveCanvasCard => canvas::remove_canvas_card(),
        AppTool::AddCanvasArrow => canvas::add_canvas_arrow(),
        AppTool::ChangeCanvasArrow => canvas::change_canvas_arrow(),
        AppTool::RemoveCanvasArrow => canvas::remove_canvas_arrow(),
        AppTool::AddCanvasGroup => canvas::add_canvas_group(),
        AppTool::ChangeCanvasGroup => canvas::change_canvas_group(),
        AppTool::AddTags => add_tags(),
        AppTool::RemoveTags => remove_tags(),
        AppTool::PinNote => pin_note(),
        AppTool::UnpinNote => unpin_note(),
        AppTool::AddAttachment => add_attachment(),
        AppTool::AddEntry => add_entry(),
        AppTool::CreateMindMap => create_mind_map(),
        AppTool::CreateCrm => create_crm(),
        AppTool::ViewedNote => viewed_note(),
        AppTool::ShowNote => show_note(),
    }
}

/// Le paramètre facultatif qui choisit l'espace de travail d'un outil (fiche 0074).
fn workspace() -> Value {
    text(
        "Le nom d'un espace de travail autorisé pour les IA (voir `list_workspaces`) ; l'espace \
         ouvert chez l'utilisateur si absent. Un nom inconnu ou non autorisé est refusé.",
    )
}

/// L'outil tel que `tools/list` le donne à Claude : tout outil qui vise un espace de travail
/// accepte le paramètre `workspace`.
pub(super) fn tool_description(tool: AppTool) -> Value {
    let (description, mut input_schema) = described(tool);
    if tool.aims_at_a_workspace() {
        input_schema["properties"]["workspace"] = workspace();
    }
    json!({ "name": tool.name(), "description": description, "inputSchema": input_schema })
}

#[cfg(test)]
#[path = "catalog_tests.rs"]
mod tests;
