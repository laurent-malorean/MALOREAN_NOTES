import { describe, expect, it } from "vitest";
import { EXPORT_FORMATS, loadExportFolder, saveExportFolder } from "./export";

function memoryStorage(values: Record<string, string> = {}) {
  return {
    values,
    getItem: (key: string) => values[key] ?? null,
    setItem: (key: string, value: string) => void (values[key] = value),
    removeItem: (key: string) => void Reflect.deleteProperty(values, key),
  };
}

const refused = {
  getItem: () => {
    throw new Error("refusé");
  },
  setItem: () => {
    throw new Error("refusé");
  },
  removeItem: () => {
    throw new Error("refusé");
  },
};

describe("export d'une note", () => {
  it("propose le PDF puis le Markdown", () => {
    expect(EXPORT_FORMATS).toEqual([
      { format: "pdf", label: "PDF" },
      { format: "markdown", label: "Markdown" },
    ]);
  });

  it("garde le dossier du dernier export, pour toute l'application", () => {
    const storage = memoryStorage();
    expect(loadExportFolder(storage)).toBeNull();
    saveExportFolder(storage, "/Users/moi/Bureau");
    expect(storage.values).toEqual({ "malorean.export-folder": "/Users/moi/Bureau" });
    expect(loadExportFolder(storage)).toBe("/Users/moi/Bureau");
  });

  it("se passe du stockage s'il est refusé", () => {
    expect(() => saveExportFolder(refused, "/a")).not.toThrow();
    expect(loadExportFolder(refused)).toBeNull();
  });
});
