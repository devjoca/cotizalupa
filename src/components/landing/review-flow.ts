// Demo review-flow state. The dialog is cliente-only (iteration 1): the role is
// fixed, so the reducer owns step, fields, file name, and error — no role branch.

export const MAX_FILE_BYTES = 10 * 1024 * 1024;

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
  "Elige un PDF, JPG o PNG válido, no vacío y de hasta 10 MB.";

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

export function validatePickedFile(
  file: PickedFile | null | undefined,
): { fileName: string } | { error: string } {
  if (!file) return { error: INVALID_FILE_ERROR };
  const goodExt = /\.(pdf|jpe?g|png)$/i.test(file.name);
  const goodMime = ["application/pdf", "image/jpeg", "image/png", ""].includes(
    file.type,
  );
  if (!goodExt || !goodMime || file.size > MAX_FILE_BYTES || file.size === 0)
    return { error: INVALID_FILE_ERROR };
  return { fileName: file.name };
}
