import { describe, expect, it } from "vitest";

import {
  INVALID_FILE_ERROR,
  MISSING_CATEGORY_ERROR,
  MISSING_FILE_ERROR,
  MISSING_MOMENT_ERROR,
  MISSING_OTHER_ERROR,
  flowReducer,
  initialFlowState,
  validatePickedFile,
  validatePickedFiles,
} from "../src/components/landing/review-flow";

describe("review flow", () => {
  it("opens at step 1 with empty fields", () => {
    const state = flowReducer(
      { ...initialFlowState, step: 3, category: "Otro" },
      { type: "open" },
    );
    expect(state).toEqual(initialFlowState);
  });

  it("advances from step 1 to step 2 without a file", () => {
    const state = flowReducer(initialFlowState, {
      type: "next",
      hasFile: false,
    });
    expect(state.step).toBe(2);
    expect(state.error).toBeNull();
  });

  it("blocks step 2 without a file and keeps fields", () => {
    const before = {
      ...initialFlowState,
      step: 2 as const,
      category: "Remodelación",
      moment: "Antes de aceptar",
    };
    const state = flowReducer(before, { type: "next", hasFile: false });
    expect(state.step).toBe(2);
    expect(state.error).toBe(MISSING_FILE_ERROR);
    expect(state.category).toBe("Remodelación");
  });

  it("validates required context in form order", () => {
    const stepTwo = { ...initialFlowState, step: 2 as const };
    expect(flowReducer(stepTwo, { type: "next", hasFile: false }).error).toBe(
      MISSING_CATEGORY_ERROR,
    );
    expect(
      flowReducer(
        { ...stepTwo, category: "Otro" },
        { type: "next", hasFile: true },
      ).error,
    ).toBe(MISSING_OTHER_ERROR);
    expect(
      flowReducer(
        { ...stepTwo, category: "Remodelación" },
        { type: "next", hasFile: true },
      ).error,
    ).toBe(MISSING_MOMENT_ERROR);
  });

  it("advances from step 2 to step 3 with a file", () => {
    const state = flowReducer(
      {
        ...initialFlowState,
        step: 2,
        category: "Remodelación",
        moment: "Antes de aceptar",
        fileName: "cotizacion.pdf",
      },
      { type: "next", hasFile: true },
    );
    expect(state.step).toBe(3);
    expect(state.error).toBeNull();
  });

  it("goes back one step and keeps fields", () => {
    const state = flowReducer(
      {
        ...initialFlowState,
        step: 3,
        category: "Otro",
        other: "Mantenimiento de equipos",
      },
      { type: "back" },
    );
    expect(state.step).toBe(2);
    expect(state.other).toBe("Mantenimiento de equipos");
  });

  it("stays at step 1 on back", () => {
    expect(flowReducer(initialFlowState, { type: "back" }).step).toBe(1);
  });

  it("records an invalid file without advancing", () => {
    const state = flowReducer(
      { ...initialFlowState, step: 2 },
      { type: "fail", error: INVALID_FILE_ERROR },
    );
    expect(state.step).toBe(2);
    expect(state.fileName).toBeNull();
    expect(state.error).toBe(INVALID_FILE_ERROR);
  });

  it("keeps an existing file when a new selection is invalid", () => {
    const state = flowReducer(
      {
        ...initialFlowState,
        step: 2,
        fileName: "cotizacion.pdf",
      },
      { type: "fail", error: INVALID_FILE_ERROR },
    );
    expect(state.fileName).toBe("cotizacion.pdf");
    expect(state.error).toBe(INVALID_FILE_ERROR);
  });

  it("clears the file label after the last file is removed", () => {
    const state = flowReducer(
      { ...initialFlowState, step: 2, fileName: "cotizacion.pdf" },
      { type: "setFile", fileName: null },
    );
    expect(state.fileName).toBeNull();
    expect(state.error).toBeNull();
  });
});

describe("validatePickedFile", () => {
  it("accepts pdf, jpg, and png within 25 MB", () => {
    for (const file of [
      { name: "coti.pdf", type: "application/pdf", size: 1024 },
      { name: "foto.JPG", type: "image/jpeg", size: 25 * 1024 * 1024 },
      { name: "captura.png", type: "", size: 512 },
    ]) {
      expect(validatePickedFile(file)).toEqual({ fileName: file.name });
    }
  });

  it("rejects wrong extension, wrong mime, oversize, and empty files", () => {
    for (const file of [
      { name: "coti.exe", type: "", size: 1024 },
      { name: "coti.pdf", type: "text/plain", size: 1024 },
      { name: "coti.pdf", type: "application/pdf", size: 25 * 1024 * 1024 + 1 },
      { name: "coti.pdf", type: "application/pdf", size: 0 },
      null,
    ]) {
      expect(validatePickedFile(file)).toEqual({ error: INVALID_FILE_ERROR });
    }
  });

  it("accepts up to ten images within the combined limit", () => {
    const files = Array.from({ length: 10 }, (_, index) => ({
      name: `foto-${index}.jpg`,
      type: "image/jpeg",
      size: 2 * 1024 * 1024,
    }));
    expect(validatePickedFiles(files)).toEqual({
      fileName: "10 imágenes seleccionadas",
    });
  });

  it("rejects mixed PDF/image uploads and a combined oversize", () => {
    expect(
      validatePickedFiles([
        { name: "coti.pdf", type: "application/pdf", size: 1024 },
        { name: "foto.jpg", type: "image/jpeg", size: 1024 },
      ]),
    ).toEqual({ error: INVALID_FILE_ERROR });
    expect(
      validatePickedFiles([
        { name: "uno.jpg", type: "image/jpeg", size: 13 * 1024 * 1024 },
        { name: "dos.jpg", type: "image/jpeg", size: 13 * 1024 * 1024 },
      ]),
    ).toEqual({ error: INVALID_FILE_ERROR });
  });
});
