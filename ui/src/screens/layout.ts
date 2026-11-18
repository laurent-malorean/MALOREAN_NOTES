/** Les éléments de la fenêtre, cherchés une seule fois. */
export interface Layout {
  readonly welcome: HTMLElement;
  readonly workspace: HTMLElement;
  readonly libraryName: HTMLElement;
  readonly foldersList: HTMLElement;
  /** La liste des étiquettes, sous les dossiers. */
  readonly tagsList: HTMLElement;
  /** La barre du filtre par étiquette, au-dessus de la liste des notes. */
  readonly tagFilter: HTMLElement;
  /** Le choix du tri de la liste, au-dessus de la liste des notes. */
  readonly noteOrder: HTMLSelectElement;
  readonly newFolderButton: HTMLButtonElement;
  readonly trashButton: HTMLButtonElement;
  readonly searchField: HTMLInputElement;
  readonly notesList: HTMLElement;
  readonly editor: HTMLElement;
  readonly focusButton: HTMLButtonElement;
  readonly typewriterButton: HTMLButtonElement;
  readonly outlineButton: HTMLButtonElement;
  readonly outline: HTMLElement;
  /** La zone des colonnes d'édition, à gauche du plan. */
  readonly columns: HTMLElement;
  readonly fullScreenButton: HTMLButtonElement;
  readonly sidePanelsButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly chooseButtons: readonly HTMLButtonElement[];
  readonly newNoteButton: HTMLButtonElement;
  readonly settingsButton: HTMLButtonElement;
  readonly settings: HTMLDialogElement;
  /** La fenêtre de choix au clavier : ouverture rapide, palette de commandes. */
  readonly picker: HTMLDialogElement;
  readonly confirmation: HTMLDialogElement;
}

/** La fenêtre : accueil, dossiers, liste des notes, outils et colonnes d'édition, message, réglages. */
const TEMPLATE = `
    <section class="welcome">
      <h1>MALOREAN Notes</h1>
      <p>Vos notes sont de simples fichiers Markdown, dans le dossier de votre choix.</p>
      <button class="primary" data-choose>Choisir un dossier de notes</button>
    </section>
    <section class="workspace" hidden>
      <aside class="folders">
        <header class="sidebar-header">
          <span>Dossiers</span>
          <button class="icon" data-new-folder title="Nouveau dossier">＋</button>
        </header>
        <nav class="folders-list"></nav>
        <nav class="tags-list" aria-label="Étiquettes" hidden></nav>
        <footer class="sidebar-footer">
          <button class="trash-item" data-trash>Corbeille</button>
          <button class="trash-item" data-settings title="Réglages (Cmd+,)">Réglages</button>
        </footer>
      </aside>
      <aside class="sidebar">
        <header class="sidebar-header">
          <span class="library-name"></span>
          <button class="icon" data-new title="Nouvelle note">＋</button>
        </header>
        <input class="search-field" type="search" placeholder="Rechercher dans toutes les notes" aria-label="Rechercher" spellcheck="false" />
        <div class="tag-filter" hidden></div>
        <label class="note-order">Trier par <select aria-label="Trier la liste"></select></label>
        <nav class="notes-list"></nav>
        <footer class="sidebar-footer"><button class="link" data-choose>Changer de dossier</button></footer>
      </aside>
      <main class="editor">
        <div class="editor-tools">
          <button class="tool" data-focus title="Mode focus (Cmd+Maj+F)">Focus</button>
          <button class="tool" data-outline title="Plan de la note (Cmd+Maj+O)" aria-pressed="false">Plan</button>
          <button class="tool" data-typewriter title="Mode machine à écrire (Cmd+Maj+T)" aria-pressed="false">Machine à écrire</button>
          <button class="tool" data-side-panels title="Panneaux latéraux : dossiers et notes (Ctrl+Cmd+S)" aria-pressed="true">Panneaux</button>
          <button class="tool" data-full-screen title="Plein écran (Ctrl+Cmd+F)">Plein écran</button>
        </div>
        <div class="columns"></div>
        <nav class="outline" aria-label="Plan de la note" hidden></nav>
      </main>
    </section>
    <div class="status" role="status"></div>
    <dialog class="settings" aria-label="Réglages"></dialog>
    <dialog class="picker"></dialog>
    <dialog class="confirmation"></dialog>`;

export function createLayout(root: HTMLElement): Layout {
  root.innerHTML = TEMPLATE;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
  return {
    welcome: find(".welcome"),
    workspace: find(".workspace"),
    libraryName: find(".library-name"),
    foldersList: find(".folders-list"),
    tagsList: find(".tags-list"),
    tagFilter: find(".tag-filter"),
    noteOrder: find(".note-order select"),
    newFolderButton: find("[data-new-folder]"),
    trashButton: find("[data-trash]"),
    searchField: find(".search-field"),
    notesList: find(".notes-list"),
    editor: find(".editor"),
    focusButton: find("[data-focus]"),
    typewriterButton: find("[data-typewriter]"),
    outlineButton: find("[data-outline]"),
    outline: find(".outline"),
    columns: find(".columns"),
    fullScreenButton: find("[data-full-screen]"),
    sidePanelsButton: find("[data-side-panels]"),
    status: find(".status"),
    chooseButtons: [...root.querySelectorAll<HTMLButtonElement>("[data-choose]")],
    newNoteButton: find("[data-new]"),
    settingsButton: find("[data-settings]"),
    settings: find(".settings"),
    picker: find(".picker"),
    confirmation: find(".confirmation"),
  };
}
