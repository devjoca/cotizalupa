import { useEffect, useReducer, useRef, useState } from "react";

import { CATEGORIES, MOMENTS, OTHER_CATEGORY } from "./content";
import {
  flowReducer,
  initialFlowState,
  validatePickedFile,
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
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [file, setFile] = useState<File | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<Element | null>(null);

  // Opening resets the flow and shows the modal; closing returns focus.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) return;
    openerRef.current = document.activeElement;
    dispatch({ type: "open" });
    setFile(null);
    if (!dialog.open) dialog.showModal();
  }, [open ]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const handleClose = () => {
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

  function pickFile(picked: File | null | undefined) {
    const result = validatePickedFile(picked);
    if ("error" in result) {
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      dispatch({ type: "fail", error: result.error });
      return;
    }
    setFile(picked as File);
    dispatch({ type: "setFile", fileName: result.fileName });
  }

  function update(field: keyof FlowFields, value: string) {
    dispatch({ type: "update", field, value });
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.step === 2 && !file) {
      fileInputRef.current?.focus();
    }
    dispatch({ type: "next", hasFile: file !== null });
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
      <form onSubmit={submit}>
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
                cuenta. Aún no se realizan cobros ni análisis reales.
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
                  pickFile(e.dataTransfer.files[0]);
                }}
              >
                <span className="upload-icon">↥</span>
                <strong>Sube tu cotización</strong>
                <span id="file-label">
                  {state.fileName ?? "Selecciona o arrastra un archivo"}
                </span>
                <span>PDF, JPG o PNG · máximo 10 MB</span>
                <input
                  type="file"
                  id="file"
                  ref={fileInputRef}
                  accept="application/pdf,image/jpeg,image/png,.pdf,.jpg,.jpeg,.png"
                  aria-label="Seleccionar cotización"
                  onChange={(e) => pickFile(e.target.files?.[0])}
                />
              </label>
              <p className="privacy-note">
                Puedes ocultar nombres, teléfonos, DNI/RUC y direcciones. En
                esta demo el archivo no sale de tu dispositivo.
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
                <strong>Esta es una demostración.</strong>
                <br />
                El pago y el análisis real todavía no están habilitados. No se
                enviará tu archivo ni se te cobrará. Puedes ver un reporte
                ilustrativo de muebles a medida; no corresponde a tu documento.
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
            onClick={() => dispatch({ type: "back" })}
          >
            Atrás
          </button>
          <button
            type="submit"
            className="button blue"
            id="next"
            disabled={state.step === 3}
          >
            {state.step === 3 ? (
              "Pago aún no disponible"
            ) : (
              <>
                Continuar <span>→</span>
              </>
            )}
          </button>
        </div>
      </form>
    </dialog>
  );
}
