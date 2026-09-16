import {
  MAX_IMAGE_FILES,
  MAX_ORDER_BYTES,
  isAllowedMime,
} from "#/lib/uploadLimits";

// Demo review-flow state. The dialog is cliente-only (iteration 1): the role is
// fixed, so the reducer owns step, fields, file label, and error.

export interface FlowFields {
  category: string;
  other: string;
  amount: string;
  moment: string;
  concern: string;
}

export interface FlowState extends FlowFields {
  step: 1 | 2 | 3;
  fileName: string | null;
  error: string | null;
}

export const initialFlowState: FlowState = {
  step: 1,
  category: "",
  other: "",
  amount: "",
  moment: "",
  concern: "",
  fileName: null,
  error: null,
};

export type FlowAction =
  | { type: "open" }
  | { type: "update"; field: keyof FlowFields; value: string }
  | { type: "setFile"; fileName: string }
  | { type: "fail"; error: string }
  | { type: "next"; hasFile: boolean }
  | { type: "back" };

export const MISSING_FILE_ERROR =
  "Selecciona una cotización para recorrer la demostración.";

export const INVALID_FILE_ERROR =
  "Elige un PDF o hasta 10 imágenes JPG/PNG, no vacíos y de hasta 25 MB en total.";

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "open":
      return initialFlowState;
    case "update":
      return { ...state, [action.field]: action.value, error: null };
    case "setFile":
      return { ...state, fileName: action.fileName, error: null };
    case "fail":
      return { ...state, fileName: null, error: action.error };
    case "back":
      return state.step > 1
        ? { ...state, step: (state.step - 1) as 1 | 2, error: null }
        : state;
    case "next":
      if (state.step === 1) return { ...state, step: 2, error: null };
      if (state.step === 2) {
        if (!action.hasFile)
          return { ...state, error: MISSING_FILE_ERROR };
        return { ...state, step: 3, error: null };
      }
      return state;
  }
}

interface PickedFile {
  name: string;
  type: string;
  size: number;
}

export function validatePickedFiles(
  files: readonly PickedFile[] | null | undefined,
): { fileName: string } | { error: string } {
  if (!files?.length || files.length > MAX_IMAGE_FILES)
    return { error: INVALID_FILE_ERROR };

  let totalBytes = 0;
  let pdfs = 0;
  for (const file of files) {
    const extensionMime = /\.pdf$/i.test(file.name)
      ? "application/pdf"
      : /\.jpe?g$/i.test(file.name)
        ? "image/jpeg"
        : /\.png$/i.test(file.name)
          ? "image/png"
          : null;
    const mime = file.type === "" ? extensionMime : file.type;
    if (
      !extensionMime ||
      !mime ||
      !isAllowedMime(mime) ||
      mime !== extensionMime
    )
      return { error: INVALID_FILE_ERROR };
    if (file.size === 0) return { error: INVALID_FILE_ERROR };
    totalBytes += file.size;
    if (mime === "application/pdf") pdfs += 1;
  }

  if (
    totalBytes > MAX_ORDER_BYTES ||
    pdfs > 1 ||
    (pdfs === 1 && files.length > 1)
  )
    return { error: INVALID_FILE_ERROR };

  return {
    fileName:
      files.length === 1
        ? files[0]!.name
        : `${files.length} imágenes seleccionadas`,
  };
}

export function validatePickedFile(
  file: PickedFile | null | undefined,
): { fileName: string } | { error: string } {
  return validatePickedFiles(file ? [file] : file);
}
