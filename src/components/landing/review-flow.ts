import {
  MAX_ORDER_BYTES,
  MAX_ORDER_FILES,
  extensionToMime,
  isAllowedMime,
} from "#/lib/uploadLimits";
import { OTHER_CATEGORY } from "#/lib/reviewContext";

// Review-flow state. The dialog is cliente-only: the role is
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
  | { type: "setFile"; fileName: string | null }
  | { type: "fail"; error: string }
  | { type: "next"; hasFile: boolean }
  | { type: "back" };

export const MISSING_FILE_ERROR =
  "Selecciona una cotización para continuar.";

export const MISSING_CATEGORY_ERROR = "Elige qué estás cotizando.";
export const MISSING_OTHER_ERROR = "Describe el servicio.";
export const MISSING_MOMENT_ERROR = "Elige en qué momento estás.";

export const INVALID_FILE_ERROR =
  "Elige hasta 5 archivos PDF, JPG o PNG, no vacíos y de hasta 25 MB en total.";

export type MissingStepTwoField = "category" | "other" | "file" | "moment";

export function missingStepTwoField(
  state: FlowFields,
  hasFile: boolean,
): MissingStepTwoField | null {
  if (!state.category) return "category";
  if (state.category === OTHER_CATEGORY && !state.other.trim()) return "other";
  if (!hasFile) return "file";
  if (!state.moment) return "moment";
  return null;
}

function missingStepTwoError(field: MissingStepTwoField): string {
  if (field === "category") return MISSING_CATEGORY_ERROR;
  if (field === "other") return MISSING_OTHER_ERROR;
  if (field === "moment") return MISSING_MOMENT_ERROR;
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
      return state.step > 1
        ? { ...state, step: (state.step - 1) as 1 | 2, error: null }
        : state;
    case "next":
      if (state.step === 1) return { ...state, step: 2, error: null };
      if (state.step === 2) {
        const missing = missingStepTwoField(state, action.hasFile);
        if (missing)
          return { ...state, error: missingStepTwoError(missing) };
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
