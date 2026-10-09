import {
  MAX_ORDER_BYTES,
  MAX_ORDER_FILES,
  extensionToMime,
  isAllowedMime,
} from "#/lib/uploadLimits";
// Review-flow state. The dialog is cliente-only: the role is
// fixed, so the reducer owns step, fields, file label, and error.

export interface FlowFields {
  email: string;
  concern: string;
}

// Mirrors minConcernRunes/maxConcernRunes in the API.
export const MIN_CONCERN_LENGTH = 10;
export const MAX_CONCERN_LENGTH = 800;

export interface FlowState extends FlowFields {
  step: 1 | 2;
  fileName: string | null;
  error: string | null;
}

export const initialFlowState: FlowState = {
  step: 1,
  email: "",
  concern: "",
  fileName: null,
  error: null,
};

export type FlowAction =
  | { type: "open" }
  | { type: "update"; field: keyof FlowFields; value: string }
  | { type: "setFile"; fileName: string | null }
  | { type: "fail"; error: string }
  | { type: "next"; hasFile: boolean }
  | { type: "back" };

export const MISSING_FILE_ERROR =
  "Selecciona una cotización para continuar.";

export const INVALID_FILE_ERROR =
  "Elige hasta 5 archivos PDF, JPG o PNG, no vacíos y de hasta 25 MB en total.";

export type MissingFirstStepField = "file" | "concern" | "email";

// Same whitespace collapsing the API applies before counting characters.
export function cleanConcern(value: string): string {
  return value.normalize("NFKC").trim().split(/\s+/).filter(Boolean).join(" ");
}

export function missingFirstStepField(
  state: FlowFields,
  hasFile: boolean,
): MissingFirstStepField | null {
  if (!hasFile) return "file";
  const concernLength = [...cleanConcern(state.concern)].length;
  if (concernLength < MIN_CONCERN_LENGTH || concernLength > MAX_CONCERN_LENGTH) return "concern";
  if (state.email.length > 254 || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(state.email.trim())) return "email";
  return null;
}

function missingFirstStepError(field: MissingFirstStepField): string {
  if (field === "email") return "Ingresa un correo válido para recibir tu reporte.";
  if (field === "concern") return "Cuéntanos en pocas palabras tu situación con esta cotización.";
  return MISSING_FILE_ERROR;
}

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case "open":
      return initialFlowState;
    case "update":
      return { ...state, [action.field]: action.value, error: null };
    case "setFile":
      return { ...state, fileName: action.fileName, error: null };
    case "fail":
      return { ...state, error: action.error };
    case "back":
      return state.step === 2 ? { ...state, step: 1, error: null } : state;
    case "next":
      if (state.step === 1) {
        const missing = missingFirstStepField(state, action.hasFile);
        if (missing)
          return { ...state, error: missingFirstStepError(missing) };
        return { ...state, step: 2, error: null };
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
  if (!files?.length || files.length > MAX_ORDER_FILES)
    return { error: INVALID_FILE_ERROR };

  let totalBytes = 0;
  for (const file of files) {
    const extensionMime = extensionToMime(file.name);
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
  }

  if (totalBytes > MAX_ORDER_BYTES) return { error: INVALID_FILE_ERROR };

  return {
    fileName:
      files.length === 1
        ? files[0]!.name
        : `${files.length} archivos seleccionados`,
  };
}
