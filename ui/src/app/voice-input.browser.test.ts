import { beforeEach, describe, expect, it, vi } from "vitest";
import { settle } from "../../test-support/app-fixture";
import type { VoiceEventItem, VoiceInputStatusItem } from "../bridge";
import type { Editor } from "../editor/editor";
import { buildFormatBar } from "../screens/format-bar";
import { microphoneButton } from "../screens/microphone";
import { columnsStarted, noteOpened, notesMoved } from "../state/columns";
import { createVoiceInput, type VoiceInputDeps } from "./voice-input";
import "../theme.css";
import "../style.css";

const FRENCH = { id: "fr-FR", name: "français (France)", ready: true };
const ENGLISH = { id: "en-US", name: "anglais (États-Unis)", ready: false };

const allowed = (changes: Partial<Extract<VoiceInputStatusItem, { kind: "available" }>> = {}) =>
  ({
    kind: "available",
    access: "allowed",
    language: "fr-FR",
    languageName: "français (France)",
    usingMacLanguage: true,
    languages: [ENGLISH, FRENCH],
    listening: false,
    ...changes,
  }) as VoiceInputStatusItem;

const columns = noteOpened(columnsStarted, "a.md");

function setup(initial: VoiceInputStatusItem = allowed(), failures: Record<string, unknown> = {}) {
  const bar = document.createElement("div");
  document.body.replaceChildren(bar);
  buildFormatBar(bar, () => undefined);
  let status = initial;
  let emit: (event: VoiceEventItem) => void = () => undefined;
  const calls: string[] = [];
  const shown: {
    message: string;
    kind?: string;
    action?: { label: string; run: () => Promise<unknown> };
  }[] = [];
  const errors: unknown[] = [];
  const dictation = {
    begin: vi.fn(),
    provisional: vi.fn(),
    fixed: vi.fn(),
    end: vi.fn(),
    drop: vi.fn(),
    listening: vi.fn(),
  };
  const editor = { dictation } as unknown as Editor;
  const state = {
    editor: editor as Editor | null,
    note: "a.md",
    failures,
  };
  const call = (name: string) => async () => {
    calls.push(name);
    if (name in state.failures) throw state.failures[name];
    return null;
  };
  const backend = {
    voiceInputStatus: async () => {
      calls.push("état");
      if ("état" in state.failures) throw state.failures["état"];
      return status;
    },
    startVoiceInput: call("démarrer"),
    stopVoiceInput: call("arrêter"),
    openVoicePrivacySettings: call("réglages macOS"),
    chooseVoiceLanguage: async (language: string | null) => {
      calls.push(`choisir ${language}`);
      if ("choisir" in state.failures) throw state.failures.choisir;
      return null;
    },
    prepareVoiceLanguage: async (language: string) => {
      calls.push(`préparer ${language}`);
      if ("préparer" in state.failures) throw state.failures["préparer"];
      return null;
    },
    onVoiceInputEvent: async (handler: (event: VoiceEventItem) => void) => {
      emit = handler;
      return () => undefined;
    },
    errorMessage: (error: unknown) => (error as { message: string }).message,
  };
  const pane = { textEditor: () => state.editor, note: () => state.note };
  const deps: VoiceInputDeps = {
    backend,
    columns: { activePane: () => pane as never, current: () => columns },
    bar,
    show: (message, kind, action) => void shown.push({ message, kind, action }),
    error: (error) => void errors.push(error),
    run: (action) => void action.catch((error: unknown) => errors.push(error)),
  };
  const voice = createVoiceInput(deps);
  const button = () => microphoneButton(bar) as HTMLButtonElement;
  return {
    voice,
    button,
    dictation,
    calls,
    shown,
    errors,
    state,
    setStatus: (next: VoiceInputStatusItem) => void (status = next),
    send: (event: VoiceEventItem) => emit(event),
  };
}

/** Le contenu est prêt (le moteur a répondu, la colonne a montré sa note) ; le micro est au repos. */
async function ready(initial?: VoiceInputStatusItem) {
  const s = setup(initial);
  await settle();
  s.voice.refresh();
  return s;
}

/** Le clic sur le micro, et ce qu'il déclenche. */
async function click(s: Awaited<ReturnType<typeof ready>>) {
  s.voice.toggle();
  await settle();
}

beforeEach(() => document.body.replaceChildren());

describe("saisie vocale : le micro au repos", () => {
  it("est actif, avec son raccourci, quand le moteur répond et qu'un éditeur de texte est ouvert", async () => {
    const s = await ready();
    expect(s.button().disabled).toBe(false);
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
    expect(s.calls).toEqual(["état"]);
  });

  it("est grisé sans éditeur de texte, et un clic dit « ouvrez une note »", async () => {
    const s = await ready();
    s.state.editor = null;
    s.voice.refresh();
    expect(s.button().disabled).toBe(true);
    expect(s.button().title).toBe("Saisie vocale : ouvrez une note");
    await click(s);
    expect(s.shown).toEqual([{ message: "Saisie vocale : ouvrez une note", kind: "info" }]);
    expect(s.calls).not.toContain("démarrer");
  });

  it("est grisé sur un macOS trop ancien, avec la raison du moteur dans la bulle", async () => {
    const s = await ready({
      kind: "unavailable",
      code: "systemTooOld",
      message: "Saisie vocale : macOS 26 minimum",
    });
    expect(s.button().disabled).toBe(true);
    expect(s.button().title).toBe("Saisie vocale : macOS 26 minimum");
    await click(s);
    expect(s.shown[0]?.message).toBe("Saisie vocale : macOS 26 minimum");
    expect(s.calls).not.toContain("démarrer");
  });

  it("dit l'erreur si l'état du moteur est illisible", async () => {
    const s = setup(allowed(), { état: { message: "préférences illisibles" } });
    await settle();
    expect(s.errors).toEqual([{ message: "préférences illisibles" }]);
  });
});

describe("saisie vocale : démarrer, écouter, arrêter", () => {
  it("un clic démarre l'écoute au curseur de l'éditeur actif, le micro passe en préparation puis en écoute", async () => {
    const s = await ready();
    await click(s);
    expect(s.dictation.begin).toHaveBeenCalledTimes(1);
    expect(s.calls).toContain("démarrer");
    expect(s.button().dataset.icon).toBe("spinner");
    s.send({ kind: "preparing" });
    expect(s.button().title).toBe("Saisie vocale : préparation de la langue…");
    s.send({ kind: "listening" });
    expect(s.button().title).toBe("Arrêter la saisie vocale");
    expect(s.button().getAttribute("aria-pressed")).toBe("true");
    s.send({ kind: "level", value: 0.7 });
    expect(
      (s.button().querySelector(".voice-level") as HTMLElement).style.getPropertyValue(
        "--voice-level",
      ),
    ).toBe("0.7");
  });

  it("le texte provisoire et le texte fixé vont à l'éditeur, tels que le moteur les envoie", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.send({ kind: "provisional", text: "bon" });
    s.send({ kind: "provisional", text: "bonjour" });
    s.send({ kind: "fixed", text: "Bonjour." });
    expect(s.dictation.provisional.mock.calls).toEqual([["bon"], ["bonjour"]]);
    expect(s.dictation.fixed.mock.calls).toEqual([["Bonjour."]]);
  });

  it("un deuxième clic arrête l'écoute ; `ended` ramène le micro au repos et clôt l'écriture", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    await click(s);
    expect(s.calls).toContain("arrêter");
    expect(s.button().disabled).toBe(true);
    await click(s);
    expect(s.calls.filter((c) => c === "arrêter")).toHaveLength(1);
    s.send({ kind: "fixed", text: "Fin." });
    s.send({ kind: "ended" });
    expect(s.dictation.fixed).toHaveBeenCalledWith("Fin.");
    expect(s.dictation.end).toHaveBeenCalledTimes(1);
    expect(s.button().disabled).toBe(false);
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
    expect((s.button().querySelector(".voice-level") as HTMLElement).hidden).toBe(true);
  });

  it("ne relance qu'après `ended`, puis relance", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.voice.escape();
    await click(s);
    expect(s.calls.filter((c) => c === "démarrer")).toHaveLength(1);
    s.send({ kind: "ended" });
    await click(s);
    expect(s.calls.filter((c) => c === "démarrer")).toHaveLength(2);
  });

  it("Échap arrête l'écoute en cours et rend vrai ; sans écoute, il rend faux", async () => {
    const s = await ready();
    expect(s.voice.escape()).toBe(false);
    await click(s);
    s.send({ kind: "listening" });
    expect(s.voice.escape()).toBe(true);
    await settle();
    expect(s.calls).toContain("arrêter");
    expect(s.voice.escape()).toBe(false);
  });

  it("une erreur au démarrage est dite, l'écoute est abandonnée et le micro revient au repos", async () => {
    const s = await ready();
    s.state.failures["démarrer"] = { message: "La saisie vocale est déjà en cours." };
    await click(s);
    expect(s.errors).toEqual([{ message: "La saisie vocale est déjà en cours." }]);
    expect(s.dictation.drop).toHaveBeenCalled();
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
  });

  it("une erreur à l'arrêt est dite, puis le moteur dit s'il écoute encore", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.state.failures["arrêter"] = { message: "arrêt impossible" };
    s.setStatus(allowed({ listening: true }));
    await click(s);
    await settle();
    expect(s.errors).toEqual([{ message: "arrêt impossible" }]);
    expect(s.button().title).toBe("Arrêter la saisie vocale");
    s.setStatus(allowed());
    await click(s);
    await settle();
    expect(s.button().title).toBe("Saisie vocale (Ctrl+Maj+D)");
    expect(s.dictation.end).toHaveBeenCalled();
  });
});

describe("saisie vocale : l'écoute s'arrête quand le contenu change", () => {
  it("autre note dans la colonne : le texte provisoire est fixé dans la note quittée, le moteur n'écrit plus", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.voice.follow(noteOpened(columns, "b.md"));
    await settle();
    expect(s.dictation.end).toHaveBeenCalledTimes(1);
    expect(s.calls).toContain("arrêter");
    s.send({ kind: "provisional", text: "perdu" });
    s.send({ kind: "fixed", text: "perdu" });
    s.send({ kind: "ended" });
    expect(s.dictation.provisional).not.toHaveBeenCalled();
    expect(s.dictation.fixed).not.toHaveBeenCalled();
    expect(s.dictation.end).toHaveBeenCalledTimes(1);
    expect(s.button().disabled).toBe(false);
  });

  it("autre colonne active, ou colonne fermée : même chose", async () => {
    for (const next of [
      { ...columns, active: 5 },
      { ...columns, list: [] },
    ]) {
      const s = await ready();
      await click(s);
      s.send({ kind: "listening" });
      s.voice.follow(next);
      await settle();
      expect(s.dictation.end).toHaveBeenCalledTimes(1);
      expect(s.calls).toContain("arrêter");
    }
  });

  it("la même note, même renommée en cours de dictée (le titre a changé), ne l'arrête pas", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.voice.follow(columns);
    s.state.note = "titre.md";
    s.voice.follow(notesMoved(columns, () => "titre.md"));
    await settle();
    expect(s.calls).not.toContain("arrêter");
    expect(s.dictation.end).not.toHaveBeenCalled();
  });

  it("ne fait rien sans écoute", async () => {
    const s = await ready();
    s.voice.follow(noteOpened(columns, "b.md"));
    await settle();
    expect(s.calls).toEqual(["état"]);
  });
});

describe("saisie vocale : l'application passe à l'arrière-plan", () => {
  it("arrête l'écoute (la fenêtre perd le focus), pas pendant la préparation ni au repos", async () => {
    const s = await ready();
    window.dispatchEvent(new Event("blur"));
    await click(s);
    s.send({ kind: "preparing" });
    window.dispatchEvent(new Event("blur"));
    await settle();
    expect(s.calls).not.toContain("arrêter");
    s.send({ kind: "listening" });
    window.dispatchEvent(new Event("blur"));
    await settle();
    expect(s.calls.filter((c) => c === "arrêter")).toHaveLength(1);
  });

  it("arrête aussi l'écoute quand la page devient cachée", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    hidden.mockRestore();
    await settle();
    expect(s.calls).toContain("arrêter");
  });
});

describe("saisie vocale : messages et erreurs", () => {
  it("le silence est dit en un bref message", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "listening" });
    s.send({ kind: "silence", message: "Saisie vocale arrêtée : silence" });
    expect(s.shown).toEqual([{ message: "Saisie vocale arrêtée : silence", kind: "info" }]);
    expect(s.button().disabled).toBe(true);
    s.send({ kind: "ended" });
    expect(s.button().disabled).toBe(false);
  });

  it("une erreur du moteur est montrée telle quelle, l'état est relu une fois l'écoute finie", async () => {
    const s = await ready();
    await click(s);
    s.send({ kind: "failed", reason: "noMicrophone", message: "Aucun micro disponible." });
    expect(s.shown).toEqual([
      { message: "Aucun micro disponible.", kind: "error", action: undefined },
    ]);
    const reads = s.calls.filter((c) => c === "état").length;
    s.send({ kind: "ended" });
    await settle();
    expect(s.calls.filter((c) => c === "état")).toHaveLength(reads + 1);
    expect(s.button().disabled).toBe(false);
  });

  it("accès refusé : le message avec « Ouvrir les réglages de macOS », le micro grisé mais cliquable", async () => {
    const s = await ready();
    await click(s);
    s.send({
      kind: "failed",
      reason: "accessDenied",
      message: "La saisie vocale a besoin du micro et de la reconnaissance vocale.",
    });
    s.setStatus(allowed({ access: "denied" }));
    s.send({ kind: "ended" });
    await settle();
    const [message] = s.shown;
    expect(message?.message).toBe(
      "La saisie vocale a besoin du micro et de la reconnaissance vocale.",
    );
    expect(message?.kind).toBe("error");
    expect(message?.action?.label).toBe("Ouvrir les réglages de macOS");
    await message?.action?.run();
    expect(s.calls).toContain("réglages macOS");
    expect(s.button().title).toBe("Saisie vocale : accès au micro refusé");
    expect(s.button().disabled).toBe(false);
    expect(s.button().classList.contains("voice-unavailable")).toBe(true);
  });

  it("un clic sur le micro refusé rouvre le message, sans démarrer ; accordé entre-temps, il démarre", async () => {
    const s = await ready(allowed({ access: "denied" }));
    const starts = () => s.calls.filter((c) => c === "démarrer").length;
    await click(s);
    expect(s.shown).toHaveLength(1);
    expect(s.shown[0]?.action?.label).toBe("Ouvrir les réglages de macOS");
    expect(starts()).toBe(0);
    s.setStatus(allowed());
    await click(s);
    expect(starts()).toBe(1);
    expect(s.shown).toHaveLength(1);
  });

  it("modèle de langue non téléchargé : le message du moteur et « Réessayer », qui relance l'écoute", async () => {
    const s = await ready();
    await click(s);
    const message =
      "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.";
    s.send({ kind: "failed", reason: "languageDownload", message });
    s.send({ kind: "ended" });
    await settle();
    expect(s.shown[0]?.message).toBe(message);
    expect(s.shown[0]?.action?.label).toBe("Réessayer");
    await s.shown[0]?.action?.run();
    expect(s.calls.filter((c) => c === "démarrer")).toHaveLength(2);
    expect(s.dictation.begin).toHaveBeenCalledTimes(2);
  });
});

describe("saisie vocale : l'onglet des réglages", () => {
  const open = async () => {
    const s = await ready();
    const [element] = s.voice.settingsGroups();
    document.body.append(element as HTMLElement);
    await settle();
    return { s, element: element as HTMLElement };
  };
  const select = (element: HTMLElement) => element.querySelector("select") as HTMLSelectElement;
  const buttonLabelled = (element: HTMLElement, label: string) =>
    [...element.querySelectorAll("button")].find((b) => b.textContent === label);

  it("relit l'état du moteur à l'ouverture et montre les langues", async () => {
    const { s, element } = await open();
    expect(s.calls.filter((c) => c === "état")).toHaveLength(2);
    expect(element.querySelector("legend")?.textContent).toBe("Saisie vocale");
    expect([...select(element).options].map((o) => o.text)).toEqual([
      "La langue du Mac (français (France))",
      "anglais (États-Unis) (à télécharger)",
      "français (France) (prête)",
    ]);
  });

  it("choisir une langue la garde, puis relit l'état", async () => {
    const { s, element } = await open();
    s.setStatus(
      allowed({ language: "en-US", languageName: "anglais (États-Unis)", usingMacLanguage: false }),
    );
    select(element).value = "en-US";
    select(element).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(s.calls).toContain("choisir en-US");
    expect(select(element).value).toBe("en-US");
    expect(element.querySelector("output")?.textContent).toBe(
      "anglais (États-Unis) : à télécharger",
    );
  });

  it("changer de langue pendant l'écoute est refusé : le message du moteur est dit, le choix reste le même", async () => {
    const { s, element } = await open();
    s.state.failures.choisir = { message: "Arrêtez la saisie vocale avant de changer de langue." };
    select(element).value = "en-US";
    select(element).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    expect(s.errors).toEqual([{ message: "Arrêtez la saisie vocale avant de changer de langue." }]);
    expect(select(element).value).toBe("");
  });

  it("télécharge le modèle de la langue : « préparation » pendant l'attente, puis l'état relu", async () => {
    const { s, element } = await open();
    const english = {
      language: "en-US",
      languageName: "anglais (États-Unis)",
      usingMacLanguage: false,
    };
    s.setStatus(allowed(english));
    select(element).value = "en-US";
    select(element).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    s.setStatus(allowed({ ...english, languages: [{ ...ENGLISH, ready: true }, FRENCH] }));
    buttonLabelled(element, "Télécharger le modèle de langue")?.click();
    expect(element.querySelector("output")?.textContent).toBe("Préparation de la langue…");
    await settle();
    expect(s.calls).toContain("préparer en-US");
    expect(element.querySelector("output")?.textContent).toBe("anglais (États-Unis) : prête");
    expect(buttonLabelled(element, "Télécharger le modèle de langue")).toBeUndefined();
  });

  it("échec du téléchargement : le message du moteur et « Réessayer », qui relance", async () => {
    const { s, element } = await open();
    s.setStatus(
      allowed({ language: "en-US", languageName: "anglais (États-Unis)", usingMacLanguage: false }),
    );
    s.state.failures["préparer"] = {
      message:
        "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.",
    };
    select(element).value = "en-US";
    select(element).dispatchEvent(new Event("change", { bubbles: true }));
    await settle();
    buttonLabelled(element, "Télécharger le modèle de langue")?.click();
    await settle();
    expect(element.querySelector(".setting-error")?.textContent).toBe(
      "Le modèle de la langue n'a pas pu être téléchargé : vérifiez la connexion, puis réessayez.",
    );
    delete s.state.failures["préparer"];
    buttonLabelled(element, "Réessayer")?.click();
    await settle();
    expect(s.calls.filter((c) => c === "préparer en-US")).toHaveLength(2);
    expect(element.querySelector(".setting-error")?.hasAttribute("hidden")).toBe(true);
  });

  it("dit la raison quand le moteur est indisponible", async () => {
    const s = await ready({
      kind: "unavailable",
      code: "engineMissing",
      message: "Le moteur de la saisie vocale est introuvable : réinstallez l'application.",
    });
    const [element] = s.voice.settingsGroups();
    await settle();
    expect(element?.querySelector("output")?.textContent).toBe(
      "Le moteur de la saisie vocale est introuvable : réinstallez l'application.",
    );
  });
});
