import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { fileToUpload } from "#/lib/fileBase64";
import { CATEGORIES, MOMENTS, OTHER_CATEGORY } from "#/lib/reviewContext";
import { analyzeAndPersistReport } from "#/server/analyze";
import {
  flowReducer,
  initialFlowState,
  missingStepTwoField,
  validatePickedFiles,
  type FlowFields,
} from "./review-flow";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
}

function scrollToExample() {
  document
    .querySelector("#ejemplo")
    ?.scrollIntoView({ behavior: "smooth" });
  document
    .querySelector<HTMLElement>('[data-example="cliente"]')
    ?.focus({ preventScroll: true });
}

export function ReviewDialog({ open, onClose }: ReviewDialogProps) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [files, setFiles] = useState<File[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);
  const requestIdRef = useRef(0);

  // Opening resets the flow and shows the modal; closing returns focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) return;
    openerRef.current = document.activeElement;
    requestIdRef.current += 1;
    dispatch({ type: "open" });
    setFiles([]);
    setAnalysisError(null);
    setAnalyzing(false);
    if (!dialog.open) dialog.showModal();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
      requestIdRef.current += 1;
      (openerRef.current as HTMLElement | null)?.focus?.();
      onClose();
    };
    dialog.addEventListener("close", handleClose);
    return () => dialog.removeEventListener("close", handleClose);
  }, [onClose]);

  // Keep the step title focused and the dialog scrolled to top on step change.
  useEffect(() => {
    if (!open) return;
    dialogRef.current?.querySelector<HTMLElement>("#flow-title")?.focus({
      preventScroll: true,
    });
    if (dialogRef.current) dialogRef.current.scrollTop = 0;
  }, [open, state.step]);

  function pickFiles(picked: readonly File[]) {
    const result = validatePickedFiles(picked);
    if ("error" in result) {
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = "";
      dispatch({ type: "fail", error: result.error });
      return;
    }
    setFiles([...picked]);
    dispatch({ type: "setFile", fileName: result.fileName });
  }

  function update(field: keyof FlowFields, value: string) {
    dispatch({ type: "update", field, value });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.step === 2) {
      const missing = missingStepTwoField(state, files.length > 0);
      if (missing === "file") {
        fileInputRef.current?.focus();
      } else if (missing) {
        dialogRef.current
          ?.querySelector<HTMLElement>(`[name="${missing}"]`)
          ?.focus();
      }
    }
    dispatch({ type: "next", hasFile: files.length > 0 });
  }

  // The POC simulates payment approval, then persists and opens the report.
  async function runAnalysis() {
    if (files.length === 0 || analyzing) return;
    const category = CATEGORIES.find((value) => value === state.category);
    const moment = MOMENTS.find((value) => value === state.moment);
    if (!category || !moment) {
      setAnalysisError("Completa la categoría y el momento antes de analizar.");
      return;
    }
    const requestId = ++requestIdRef.current;
    const fileSnapshot = [...files];
    const contextSnapshot = {
      category,
      other: state.other,
      amount: state.amount,
      moment,
      concern: state.concern,
    };
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const uploads = await Promise.all(fileSnapshot.map(fileToUpload));
      const nextResult = await analyzeAndPersistReport({
        data: {
          files: uploads,
          perspective: "customer",
          context: contextSnapshot,
        },
      });
      if (requestIdRef.current !== requestId) return;
      if (nextResult.status === "COMPLETED") {
        await navigate({
          to: "/r/$token",
          params: { token: nextResult.report_token },
        });
        return;
      }
      setAnalysisError(nextResult.message);
    } catch (err) {
      if (requestIdRef.current === requestId) {
        setAnalysisError(
          err instanceof Error
            ? err.message
            : "No se pudo solicitar el análisis.",
        );
      }
    } finally {
      if (requestIdRef.current === requestId) setAnalyzing(false);
    }
  }

  const showOther = state.category === OTHER_CATEGORY;

  return (
    <dialog
      ref={dialogRef}
      id="review-dialog"
      aria-labelledby="flow-title"
      onClick={(e) => {
        if (e.target === dialogRef.current) dialogRef.current?.close();
      }}
    >
      <div className="dialog-head">
        <a
          className="brand"
          href="#"
          id="dialog-brand"
          onClick={(e) => {
            e.preventDefault();
            dialogRef.current?.close();
          }}
        >
          Cotiza<span>Lupa</span>
        </a>
        <button
          type="button"
          className="close"
          aria-label="Cerrar formulario"
          onClick={() => dialogRef.current?.close()}
        >
          ×
        </button>
      </div>
      <div className="flow-top">
        <span id="step-label">PASO {state.step} DE 3</span>
        <span>Una revisión · S/39</span>
      </div>
      <div className="flow-progress">
        <i style={{ width: `${(state.step / 3) * 100}%` }} />
      </div>
      <form id="review-form" noValidate onSubmit={submit}>
        <div id="flow-content">
          {state.step === 1 && (
            <>
              <h2 id="flow-title" tabIndex={-1}>
                Revisa tu cotización como cliente
              </h2>
              <p>
                Una revisión enfocada en tu próxima decisión: aceptar o pagar.
              </p>
              <input type="hidden" name="role" value="cliente" />
              <p className="soon-note">
                ¿Eres proveedor? Esa perspectiva llega pronto.
              </p>
              <p className="privacy-note">
                Demo interactiva: puedes recorrer el formulario sin crear una
                cuenta. Aún no se realizan cobros.
              </p>
            </>
          )}
          {state.step === 2 && (
            <>
              <h2 id="flow-title" tabIndex={-1}>
                Cuéntanos lo justo.
              </h2>
              <p>Para enfocar la revisión en tu próxima decisión.</p>
              <label className="field">
                ¿Qué estás cotizando?
                <select
                  name="category"
                  required
                  value={state.category}
                  onChange={(e) => update("category", e.target.value)}
                >
                  <option value="">Elige el tipo de servicio</option>
                  {CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label
                className={`field${showOther ? "" : " hidden"}`}
                id="other-field"
              >
                Describe el servicio
                <input
                  name="other"
                  maxLength={160}
                  value={state.other}
                  required={showOther}
                  placeholder="Por ejemplo, mantenimiento de equipos"
                  onChange={(e) => update("other", e.target.value)}
                />
              </label>
              <label
                className="upload"
                id="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  pickFiles([...e.dataTransfer.files]);
                }}
              >
                <span className="upload-icon">↥</span>
                <strong>Sube tu cotización</strong>
                <span id="file-label">
                  {state.fileName ?? "Selecciona o arrastra un archivo"}
                </span>
                <span>1 PDF o hasta 10 imágenes · máximo 25 MB en total</span>
                <input
                  type="file"
                  multiple
                  id="file"
                  ref={fileInputRef}
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  aria-label="Seleccionar cotización"
                  onChange={(e) => pickFiles([...(e.target.files ?? [])])}
                />
              </label>
              <p className="privacy-note">
                Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones. El
                archivo se usa solo para generar el reporte y CotizaLupa no lo
                guarda en esta demo. Cuando el análisis usa IA, se envía a
                OpenAI, que puede conservar datos según su configuración y sus
                políticas.
              </p>
              <label className="field">
                Monto aproximado en soles <small>· opcional</small>
                <input
                  name="amount"
                  type="number"
                  min={0}
                  max={999999999}
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Ej. 5000"
                  value={state.amount}
                  onChange={(e) => update("amount", e.target.value)}
                />
              </label>
              <label className="field">
                ¿En qué momento estás?
                <select
                  name="moment"
                  required
                  value={state.moment}
                  onChange={(e) => update("moment", e.target.value)}
                >
                  <option value="">Elige una opción</option>
                  {MOMENTS.map((moment) => (
                    <option key={moment} value={moment}>
                      {moment}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                ¿Qué te preocupa especialmente? <small>· opcional</small>
                <textarea
                  name="concern"
                  maxLength={800}
                  placeholder="Ej. Necesito que esté instalado antes de mudarme."
                  value={state.concern}
                  onChange={(e) => update("concern", e.target.value)}
                />
              </label>
            </>
          )}
          {state.step === 3 && (
            <>
              <h2 id="flow-title" tabIndex={-1}>
                Una revisión. Sin suscripción.
              </h2>
              <p>Este sería el resumen antes de pagar.</p>
              <div className="summary-row">
                <span>Perspectiva</span>
                <b>Soy cliente</b>
              </div>
              <div className="summary-row">
                <span>Servicio</span>
                <b>
                  {state.category === OTHER_CATEGORY
                    ? state.other
                    : state.category}
                </b>
              </div>
              <div className="summary-row">
                <span>Documento</span>
                <b>{state.fileName ?? ""}</b>
              </div>
              <div className="summary-row">
                <span>Incluye</span>
                <b>Reporte, 3 prioridades y textos para copiar</b>
              </div>
              <div className="summary-row summary-total">
                <span>Total por revisión</span>
                <b>S/39</b>
              </div>
              <div className="demo-banner">
                <strong>Esta demostración no realiza ningún cobro.</strong>
                <br />
                El botón simula la confirmación del pago y abre tu reporte.
                Cuando el análisis usa IA, el archivo se envía a OpenAI.
                CotizaLupa no lo guarda en esta demo.
              </div>
              <button
                type="button"
                className="flow-demo-link"
                onClick={() => {
                  dialogRef.current?.close();
                  scrollToExample();
                }}
              >
                Ver reporte de ejemplo →
              </button>
              {analysisError && (
                <p className="privacy-note" role="alert">
                  No se pudo analizar: {analysisError}
                </p>
              )}
            </>
          )}
        </div>
        <div id="flow-error" role="alert">
          {state.error}
        </div>
        <div className="flow-actions">
          <button
            type="button"
            className={`button outline${state.step === 1 ? " hidden" : ""}`}
            id="back"
            disabled={analyzing}
            onClick={() => {
              setAnalysisError(null);
              dispatch({ type: "back" });
            }}
          >
            Atrás
          </button>
          {state.step === 3 ? (
            <button
              type="button"
              className="button blue"
              id="next"
              disabled={files.length === 0 || analyzing}
              onClick={runAnalysis}
            >
              {analyzing
                ? "Preparando reporte…"
                : "Simular pago y ver mi reporte"}
            </button>
          ) : (
            <button type="submit" className="button blue" id="next">
              Continuar <span>→</span>
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
