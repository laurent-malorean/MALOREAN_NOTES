/** Les éléments de la fenêtre, cherchés une seule fois. */
export interface Layout {
  readonly welcome: HTMLElement;
  readonly mainArea: HTMLElement;
  /** Le sélecteur d'espace de travail : le nom de l'espace ouvert, en tête des dossiers. */
  readonly workspaceSwitcher: HTMLButtonElement;
  /** Le titre de la liste des notes : dossier, étiquette, Récentes ou Corbeille. */
  readonly listHeading: HTMLElement;
  readonly foldersList: HTMLElement;
  /** L'entrée Récentes, entre les dossiers et la liste des étiquettes. */
  readonly recentButton: HTMLButtonElement;
  /** La liste des étiquettes, sous les dossiers. */
  readonly tagsList: HTMLElement;
  /** La barre du filtre par étiquette, au-dessus de la liste des notes. */
  readonly tagFilter: HTMLElement;
  /** Le choix du tri de la liste, au-dessus de la liste des notes. */
  readonly noteOrder: HTMLSelectElement;
  readonly newFolderButton: HTMLButtonElement;
  readonly trashButton: HTMLButtonElement;
  /** Le champ de recherche, dans la bande du haut, entre la barre de mise en forme et les boutons Focus, Plan… */
  readonly searchField: HTMLInputElement;
  /** La fenêtre de recherche : les résultats, en deux colonnes. */
  readonly searchWindow: HTMLDialogElement;
  readonly searchClose: HTMLButtonElement;
  /** Colonne « Recherche match » : les notes qui contiennent les mots tapés. */
  readonly matchResults: HTMLElement;
  /** Colonne « Recherche idées » : les notes dont le sens est le plus proche, ou pourquoi le sens manque. */
  readonly ideasResults: HTMLElement;
  /** Où en est le calcul du sens, en tête de la colonne « idées ». */
  readonly ideasCompute: HTMLElement;
  readonly notesList: HTMLElement;
  readonly editor: HTMLElement;
  /** La barre de mise en forme, au centre de la bande du haut, à gauche des boutons Focus, Plan… */
  readonly formatBar: HTMLElement;
  readonly focusButton: HTMLButtonElement;
  readonly typewriterButton: HTMLButtonElement;
  readonly outlineButton: HTMLButtonElement;
  readonly outline: HTMLElement;
  /** La zone des colonnes d'édition, à gauche du plan. */
  readonly columns: HTMLElement;
  readonly fullScreenButton: HTMLButtonElement;
  readonly sidePanelsButton: HTMLButtonElement;
  /** Le bouton qui affiche ou masque la colonne Claude Code. */
  readonly claudeButton: HTMLButtonElement;
  /** La colonne Claude Code, à droite des colonnes d'édition. */
  readonly claudeColumn: HTMLElement;
  readonly status: HTMLElement;
  /** Sur l'accueil : ajouter un premier espace de travail. */
  readonly addButton: HTMLButtonElement;
  /** Sous la liste des notes : passer à un autre espace de travail. */
  readonly switchButton: HTMLButtonElement;
  readonly newNoteButton: HTMLButtonElement;
  /** Le chevron à côté du « + » de la liste des notes : il ouvre le menu de création. */
  readonly newContentButton: HTMLButtonElement;
  readonly settingsButton: HTMLButtonElement;
  readonly settings: HTMLDialogElement;
  /** La fenêtre de choix au clavier : ouverture rapide, palette de commandes. */
  readonly picker: HTMLDialogElement;
  readonly confirmation: HTMLDialogElement;
  /** La feuille d'impression : cachée à l'écran, seule visible à l'impression. */
  readonly printSheet: HTMLElement;
}

/** La fenêtre : accueil, dossiers, liste des notes, outils et colonnes d'édition, message, réglages. */
const TEMPLATE = `
    <section class="welcome">
      <h1>MALOREAN Notes</h1>
      <p>Vos notes sont de simples fichiers Markdown, dans le dossier de votre choix.</p>
      <button class="primary" data-add>Choisir un dossier de notes</button>
    </section>
    <section class="main-area" hidden>
      <aside class="folders">
        <header class="side-panel-header">
          <button class="workspace-switcher" aria-haspopup="menu" title="Changer d'espace de travail (Cmd+Maj+E)"></button>
          <button class="icon" data-new-folder title="Nouveau dossier">＋</button>
        </header>
        <nav class="folders-list"></nav>
        <button class="recent-item" data-recent title="Les notes ouvertes le plus récemment">Récentes</button>
        <nav class="tags-list" aria-label="Étiquettes" hidden></nav>
        <footer class="side-panel-footer">
          <button class="trash-item" data-trash>Corbeille</button>
          <button class="trash-item" data-settings title="Réglages (Cmd+,)">Réglages</button>
        </footer>
      </aside>
      <aside class="notes-panel">
        <header class="side-panel-header">
          <span class="list-heading"></span>
          <span class="new-content">
            <button class="icon" data-new title="Nouvelle note (Cmd+N) ; maintenir pour choisir un autre contenu">＋</button>
            <button class="icon new-content-chevron" data-new-menu aria-label="Nouveau contenu" aria-haspopup="menu" aria-expanded="false" title="Nouveau contenu : note, modèle, cahier, carte mentale, canvas, CRM"></button>
          </span>
        </header>
        <div class="tag-filter" hidden></div>
        <label class="note-order">Trier par <select aria-label="Trier la liste"></select></label>
        <nav class="notes-list"></nav>
        <footer class="side-panel-footer"><button class="link" data-switch>Changer d'espace de travail</button></footer>
      </aside>
      <main class="editor">
        <div class="editor-tools">
          <div class="format-bar"></div>
          <input class="search-field" type="search" placeholder="Rechercher dans toutes les notes" aria-label="Rechercher" spellcheck="false" />
          <div class="display-tools">
            <button class="tool" data-focus title="Mode focus (Cmd+Maj+F)">Focus</button>
            <button class="tool" data-outline title="Plan de la note (Cmd+Maj+O)" aria-pressed="false">Plan</button>
            <button class="tool" data-typewriter title="Mode machine à écrire (Cmd+Maj+T)" aria-pressed="false">Machine à écrire</button>
            <button class="tool" data-side-panels title="Panneaux latéraux : dossiers et notes (Cmd+0)" aria-pressed="true">Panneaux</button>
            <button class="tool" data-full-screen title="Plein écran (Ctrl+Cmd+F)">Plein écran</button>
            <button class="tool" data-claude title="Colonne Claude Code (Ctrl+Cmd+L)" aria-pressed="false">Claude</button>
          </div>
        </div>
        <div class="columns"></div>
        <nav class="outline" aria-label="Plan de la note" hidden></nav>
      </main>
      <section class="claude-column" aria-label="Claude Code" hidden></section>
    </section>
    <div class="status" role="status"></div>
    <dialog class="search-window" aria-label="Résultats de la recherche">
      <button class="icon search-window-close" aria-label="Fermer la recherche" title="Fermer (Échap)">×</button>
      <div class="search-columns">
        <section class="search-column" aria-labelledby="search-match-title">
          <h2 id="search-match-title">Recherche match</h2>
          <div class="search-column-results match-results"></div>
        </section>
        <section class="search-column" aria-labelledby="search-ideas-title">
          <h2 id="search-ideas-title">Recherche idées</h2>
          <p class="search-column-note ideas-compute" hidden></p>
          <div class="search-column-results ideas-results"></div>
        </section>
      </div>
    </dialog>
    <dialog class="settings" aria-label="Réglages"></dialog>
    <dialog class="picker"></dialog>
    <dialog class="confirmation"></dialog>
    <article class="print-sheet" aria-hidden="true"></article>`;

export function createLayout(root: HTMLElement): Layout {
  root.innerHTML = TEMPLATE;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
  return {
    welcome: find(".welcome"),
    mainArea: find(".main-area"),
    workspaceSwitcher: find(".workspace-switcher"),
    listHeading: find(".list-heading"),
    foldersList: find(".folders-list"),
    recentButton: find("[data-recent]"),
    tagsList: find(".tags-list"),
    tagFilter: find(".tag-filter"),
    noteOrder: find(".note-order select"),
    newFolderButton: find("[data-new-folder]"),
    trashButton: find("[data-trash]"),
    searchField: find(".search-field"),
    searchWindow: find(".search-window"),
    searchClose: find(".search-window-close"),
    matchResults: find(".match-results"),
    ideasResults: find(".ideas-results"),
    ideasCompute: find(".ideas-compute"),
    notesList: find(".notes-list"),
    editor: find(".editor"),
    formatBar: find(".format-bar"),
    focusButton: find("[data-focus]"),
    typewriterButton: find("[data-typewriter]"),
    outlineButton: find("[data-outline]"),
    outline: find(".outline"),
    columns: find(".columns"),
    fullScreenButton: find("[data-full-screen]"),
    sidePanelsButton: find("[data-side-panels]"),
    claudeButton: find("[data-claude]"),
    claudeColumn: find(".claude-column"),
    status: find(".status"),
    addButton: find("[data-add]"),
    switchButton: find("[data-switch]"),
    newNoteButton: find("[data-new]"),
    newContentButton: find("[data-new-menu]"),
    settingsButton: find("[data-settings]"),
    settings: find(".settings"),
    picker: find(".picker"),
    confirmation: find(".confirmation"),
    printSheet: find(".print-sheet"),
  };
}
