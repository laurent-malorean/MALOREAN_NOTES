/** Les éléments de la fenêtre, cherchés une seule fois. */
export interface Layout {
  readonly welcome: HTMLElement;
  readonly workspace: HTMLElement;
  readonly libraryName: HTMLElement;
  readonly notesList: HTMLElement;
  readonly editor: HTMLElement;
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
      <aside class="sidebar">
        <header class="sidebar-header">
          <span class="library-name"></span>
          <button class="icon" data-new title="Nouvelle note">＋</button>
        </header>
        <nav class="notes-list"></nav>
        <footer class="sidebar-footer"><button class="link" data-choose>Changer de dossier</button></footer>
      </aside>
      <main class="editor"></main>
    </section>
    <div class="status" role="status"></div>`;
  const find = <T extends HTMLElement>(selector: string) => root.querySelector(selector) as T;
  return {
    welcome: find(".welcome"),
    workspace: find(".workspace"),
    libraryName: find(".library-name"),
    notesList: find(".notes-list"),
    editor: find(".editor"),
    status: find(".status"),
    chooseButtons: [...root.querySelectorAll<HTMLButtonElement>("[data-choose]")],
    newNoteButton: find("[data-new]"),
  };
}
