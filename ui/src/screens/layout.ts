/** Les éléments de la fenêtre, cherchés une seule fois. */
export interface Layout {
  readonly welcome: HTMLElement;
  readonly workspace: HTMLElement;
  readonly libraryName: HTMLElement;
  readonly foldersList: HTMLElement;
  readonly newFolderButton: HTMLButtonElement;
  readonly searchField: HTMLInputElement;
  readonly notesList: HTMLElement;
  readonly editor: HTMLElement;
  readonly focusButton: HTMLButtonElement;
  readonly fullScreenButton: HTMLButtonElement;
  readonly status: HTMLElement;
  readonly chooseButtons: readonly HTMLButtonElement[];
  readonly newNoteButton: HTMLButtonElement;
}

export function createLayout(root: HTMLElement): Layout {
  root.innerHTML = `
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
      </aside>
      <aside class="sidebar">
        <header class="sidebar-header">
          <span class="library-name"></span>
          <button class="icon" data-new title="Nouvelle note">＋</button>
        </header>
        <input class="search-field" type="search" placeholder="Rechercher dans toutes les notes" aria-label="Rechercher" spellcheck="false" />
        <nav class="notes-list"></nav>
        <footer class="sidebar-footer"><button class="link" data-choose>Changer de dossier</button></footer>
      </aside>
      <main class="editor">
        <div class="editor-tools">
          <button class="tool" data-focus title="Mode focus (Cmd+Maj+F)">Focus</button>
          <button class="tool" data-full-screen title="Plein écran (Ctrl+Cmd+F)">Plein écran</button>
        </div>
      </main>
    </section>
    <div class="status" role="status"></div>`;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
  return {
    welcome: find(".welcome"),
    workspace: find(".workspace"),
    libraryName: find(".library-name"),
    foldersList: find(".folders-list"),
    newFolderButton: find("[data-new-folder]"),
    searchField: find(".search-field"),
    notesList: find(".notes-list"),
    editor: find(".editor"),
    focusButton: find("[data-focus]"),
    fullScreenButton: find("[data-full-screen]"),
    status: find(".status"),
    chooseButtons: [...root.querySelectorAll<HTMLButtonElement>("[data-choose]")],
    newNoteButton: find("[data-new]"),
  };
}
