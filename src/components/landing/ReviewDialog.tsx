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
  reviewsDisabled: boolean;
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

export function ReviewDialog({ open, onClose, reviewsDisabled }: ReviewDialogProps) {
  const navigate = useNavigate();
  const [serverDisabled, setServerDisabled] = useState(false);
  const disabled = reviewsDisabled || serverDisabled;
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

  function addFiles(picked: readonly File[]) {
    const replacingPdf =
      files.length === 1 &&
      /\.pdf$/i.test(files[0]!.name) &&
      picked.length === 1 &&
      /\.pdf$/i.test(picked[0]!.name);
    const nextFiles = replacingPdf ? [...picked] : [...files, ...picked];
    const result = validatePickedFiles(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if ("error" in result) {
      dispatch({ type: "fail", error: result.error });
      return;
    }
    setFiles(nextFiles);
    dispatch({ type: "setFile", fileName: result.fileName });
  }

  function removeFile(indexToRemove: number) {
    const nextFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (nextFiles.length === 0) {
      dispatch({ type: "setFile", fileName: null });
      return;
    }
    const result = validatePickedFiles(nextFiles);
    if ("fileName" in result) {
      dispatch({ type: "setFile", fileName: result.fileName });
    }
  }

  function update(field: keyof FlowFields, value: string) {
    dispatch({ type: "update", field, value });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.step === 2) {
      const missing = missingStepTwoField(state, disabled || files.length > 0);
      if (missing === "file") {
        fileInputRef.current?.focus();
      } else if (missing) {
        dialogRef.current
          ?.querySelector<HTMLElement>(`[name="${missing}"]`)
          ?.focus();
      }
    }
    dispatch({ type: "next", hasFile: disabled || files.length > 0 });
  }

  // The free POC persists and opens the report without a payment.
  async function runAnalysis() {
    if (disabled || files.length === 0 || analyzing) return;
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
      if (nextResult.status === "REVIEWS_DISABLED") setServerDisabled(true);
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
  const hasPdf = files.length === 1 && /\.pdf$/i.test(files[0]!.name);
  const uploadTitle =
    files.length === 0
      ? "Sube tu cotización"
      : hasPdf
        ? "Cambia el PDF"
        : "Agrega otra imagen";
  const uploadPrompt =
    files.length === 0
      ? "Selecciona o arrastra un archivo"
      : hasPdf
        ? "Selecciona o arrastra otro PDF"
        : "Selecciona o arrastra más imágenes";

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
        <span>Precio de lanzamiento · $12 USD</span>
      </div>
      <div className="flow-progress">
        <i style={{ width: `${(state.step / 3) * 100}%` }} />
      </div>
      <form id="review-form" noValidate onSubmit={submit}>
        <div id="flow-content">
          {disabled && (
            <p className="demo-banner" role="status">
              Las revisiones aún no están disponibles. Puedes explorar el formulario
              y ver el reporte de ejemplo. Los archivos que selecciones no se enviarán.
            </p>
          )}
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
                  addFiles([...e.dataTransfer.files]);
                }}
              >
                <span className="upload-icon">↥</span>
                <strong>{uploadTitle}</strong>
                <span id="file-label">{uploadPrompt}</span>
                <span>1 PDF o hasta 10 imágenes · máximo 25 MB en total</span>
                <input
                  type="file"
                  multiple
                  id="file"
                  ref={fileInputRef}
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  aria-label="Seleccionar cotización"
                  onChange={(e) => addFiles([...(e.target.files ?? [])])}
                />
              </label>
              {files.length > 0 && (
                <div className="selected-files" aria-live="polite">
                  <div className="selected-files-head">
                    <strong>
                      {files.length === 1
                        ? "Archivo seleccionado"
                        : `${files.length} archivos seleccionados`}
                    </strong>
                  </div>
                  <ul>
                    {files.map((file, index) => (
                      <li
                        key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      >
                        <span>{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          aria-label={`Quitar ${file.name}`}
                        >
                          Quitar
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="privacy-note">
                Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones. El
                archivo se usa solo para generar el reporte y CotizaLupa no lo
                guarda en esta demo. Al generar el reporte, enviamos el archivo y el
                contexto a OpenAI. Conservamos el reporte y los datos extraídos.
                OpenAI puede conservar datos según su configuración y sus políticas.
                Consulta la <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</a>
                {" "}y los <a href="/terminos" target="_blank" rel="noreferrer">términos de uso</a>.
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
                Confirma tu revisión
              </h2>
              <p>
                {disabled
                  ? "Así será el resumen de tu revisión. La generación está deshabilitada."
                  : "Revisa los datos antes de generar tu reporte gratuito."}
              </p>
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
                <b>{state.fileName ?? "Ningún archivo seleccionado"}</b>
              </div>
              <div className="summary-row">
                <span>Incluye</span>
                <b>Reporte, 3 prioridades y textos para copiar</b>
              </div>
              <div className="summary-row summary-total">
                <span>Precio previsto al habilitar pagos</span>
                <b>$12 USD</b>
              </div>
              <div className="demo-banner">
                <strong>Esta demostración no realiza ningún cobro.</strong>
                <br />
                {disabled
                  ? "La generación de reportes está deshabilitada."
                  : "Al generar el reporte, enviamos el archivo y el contexto a OpenAI para analizarlos con IA. CotizaLupa no guarda el archivo original ni tu preocupación escrita; conserva el reporte y los datos extraídos."}
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
              disabled={disabled || files.length === 0 || analyzing}
              onClick={runAnalysis}
            >
              {disabled
                ? "Revisiones no disponibles"
                : analyzing
                  ? "Preparando reporte…"
                  : "Generar mi reporte gratis"}
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
