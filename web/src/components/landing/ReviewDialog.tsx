import { useEffect, useReducer, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { Icon } from "./Icon";
import { extensionToMime } from "#/lib/uploadLimits";
import { beginCheckout, prepareReview } from "#/lib/api";
import { currentMetaFBC } from "#/lib/adAttribution";
import {
  MAX_CONCERN_LENGTH,
  cleanConcern,
  flowReducer,
  initialFlowState,
  missingFirstStepField,
  validatePickedFiles,
  type FlowFields,
} from "./review-flow";

interface ReviewDialogProps {
  open: boolean;
  onClose: () => void;
}

function FilePreview({ file, onRemove, disabled }: {
  file: File;
  onRemove: () => void;
  disabled: boolean;
}) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  const isImage = (file.type || extensionToMime(file.name))?.startsWith("image/");
  return (
    <li className="file-preview">
      {url && isImage && <img src={url} alt={`Vista previa de ${file.name}`} />}
      <div className="file-preview-actions">
        {url ? (
          <a href={url} target="_blank" rel="noreferrer">
            {isImage ? "Ampliar imagen" : "Abrir PDF"}: {file.name}
          </a>
        ) : <span>{file.name}</span>}
        <button type="button" disabled={disabled} onClick={onRemove} aria-label={`Quitar ${file.name}`}>
          Quitar
        </button>
      </div>
    </li>
  );
}

function scrollToExample() {
  document
    .querySelector("#ejemplo")
    ?.scrollIntoView({ behavior: "smooth" });
  document
    .querySelector<HTMLElement>("#ejemplo [data-example]")
    ?.focus({ preventScroll: true });
}

export function ReviewDialog({ open, onClose }: ReviewDialogProps) {
  const navigate = useNavigate();
  const [state, dispatch] = useReducer(flowReducer, initialFlowState);
  const [files, setFiles] = useState<File[]>([]);
  const [filesConfirmed, setFilesConfirmed] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [preparationError, setPreparationError] = useState<string | null>(null);
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
    setFilesConfirmed(false);
    setPreparationError(null);
    setPreparing(false);
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
    const nextFiles = [...files, ...picked];
    const result = validatePickedFiles(nextFiles);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if ("error" in result) {
      dispatch({ type: "fail", error: result.error });
      return;
    }
    setFiles(nextFiles);
    setFilesConfirmed(false);
    dispatch({ type: "setFile", fileName: result.fileName });
  }

  function removeFile(indexToRemove: number) {
    const nextFiles = files.filter((_, index) => index !== indexToRemove);
    setFiles(nextFiles);
    setFilesConfirmed(false);
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
    if (state.step === 1) {
      const missing = missingFirstStepField(state, files.length > 0);
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

  // Preparation returns the private link later used for checkout and report.
  async function createReviewOrder() {
    if (files.length === 0 || preparing) return;
    if (!filesConfirmed) {
      setPreparationError("Confirma que revisaste todos los archivos antes de continuar.");
      return;
    }
    const requestId = ++requestIdRef.current;
    const fileSnapshot = [...files];
    const contextSnapshot = {
      email: state.email.trim(),
      concern: cleanConcern(state.concern),
      ad_fbc: currentMetaFBC(),
    };
    setPreparing(true);
    setPreparationError(null);
    try {
      const nextResult = await prepareReview({
        files: fileSnapshot,
        context: contextSnapshot,
      });
      if (requestIdRef.current !== requestId) return;
      if (nextResult.status === "READY_FOR_PAYMENT") {
        // Go straight to Polar. Any other checkout outcome lands on the
        // report page, which renders the order state and a pay button.
        const checkout = await beginCheckout({
          data: { token: nextResult.report_token },
        }).catch(() => null);
        if (requestIdRef.current !== requestId) return;
        if (checkout?.status === "CHECKOUT") {
          window.location.assign(checkout.url);
          return;
        }
        await navigate({
          to: "/r/$token",
          params: { token: nextResult.report_token },
        });
        return;
      }
      setPreparationError(nextResult.message);
    } catch {
      if (requestIdRef.current === requestId) {
        setPreparationError(
          "No pudimos preparar la orden. Inténtalo de nuevo. No se realizó ningún cobro.",
        );
      }
    } finally {
      if (requestIdRef.current === requestId) setPreparing(false);
    }
  }

  const uploadTitle =
    files.length === 0 ? "Sube tu cotización" : "Agrega más archivos";
  const uploadPrompt =
    files.length === 0
      ? "Selecciona o arrastra archivos"
      : "Selecciona o arrastra más archivos";

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
        <span id="step-label">PASO {state.step} DE 2</span>
        <span>Precio de lanzamiento · $9.99 USD</span>
      </div>
      <div className="flow-progress">
        <i style={{ width: `${(state.step / 2) * 100}%` }} />
      </div>
      <form id="review-form" noValidate onSubmit={submit}>
        <div id="flow-content">
          {state.step === 1 && (
            <>
              <h2 id="flow-title" tabIndex={-1}>
                Sube tu cotización
              </h2>
              <p className="privacy-note">
                Elige el PDF o las fotos de una sola propuesta de un proveedor.
                Incluye todas sus páginas y comprueba que textos y montos se lean.
              </p>
              <label
                className="upload"
                id="drop-zone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  addFiles([...e.dataTransfer.files]);
                }}
              >
                <Icon name="upload" className="upload-icon" />
                <strong>{uploadTitle}</strong>
                <span id="file-label">{uploadPrompt}</span>
                <span>Hasta 5 archivos PDF, JPG o PNG · máximo 25 MB en total</span>
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
                archivo se guardará temporalmente al crear la orden.
                CotizaLupa lo analizará después del pago.
                Eliminamos los originales elegibles en una limpieza mensual.
                Consulta la <a href="/privacidad" target="_blank" rel="noreferrer">política de privacidad</a>
                {" "}y los <a href="/terminos" target="_blank" rel="noreferrer">términos de uso</a>.
              </p>
              <label className="field">
                Cuéntanos tu situación
                <textarea
                  name="concern"
                  required
                  maxLength={MAX_CONCERN_LENGTH}
                  aria-describedby="concern-help"
                  placeholder="Ej. Estoy por pagar un adelanto del 50% y necesito que esté instalado antes de mudarme."
                  value={state.concern}
                  onChange={(e) => update("concern", e.target.value)}
                />
                <small id="concern-help">¿Ya aceptaste o pagaste algo? ¿Qué te preocupa? Unas líneas bastan.</small>
              </label>
              <label className="field">
                Correo para recibir tu reporte
                <input name="email" type="email" autoComplete="email" required maxLength={254}
                  value={state.email} onChange={(e) => update("email", e.target.value)}
                  aria-describedby="report-email-help" placeholder="tu@correo.com" />
                <small id="report-email-help">Te enviaremos el enlace privado cuando el reporte esté listo. Revisa que el correo esté bien escrito.</small>
              </label>
            </>
          )}
          {state.step === 2 && (
            <>
              <h2 id="flow-title" tabIndex={-1}>
                Revisa antes de pagar
              </h2>
              <p>
                Abre cada archivo y comprueba que todas las páginas sean de una sola cotización, de un proveedor, y que los textos y montos se lean. La revisión se basará en lo que envíes.
              </p>
              {open && files.length > 0 ? (
                <ul className="file-previews">
                  {files.map((file, index) => (
                    <FilePreview
                      key={`${file.name}-${file.size}-${file.lastModified}-${index}`}
                      file={file}
                      disabled={preparing}
                      onRemove={() => { removeFile(index); setPreparationError(null); }}
                    />
                  ))}
                </ul>
              ) : <p>No hay archivos seleccionados. Vuelve atrás para agregarlos.</p>}
              <button
                type="button"
                className="flow-demo-link"
                disabled={preparing}
                onClick={() => { setPreparationError(null); setFilesConfirmed(false); dispatch({ type: "back" }); }}
              >
                Agregar o reemplazar archivos
              </button>
              <label className="confirm-documents">
                <input
                  type="checkbox"
                  checked={filesConfirmed}
                  disabled={preparing || files.length === 0}
                  onChange={(e) => { setFilesConfirmed(e.target.checked); setPreparationError(null); }}
                />
                Confirmo que abrí todos los archivos, puedo leer textos y montos, incluí las páginas necesarias y corresponden a una sola propuesta de un proveedor.
              </label>
              <p className="privacy-note">
                Antes del pago solo validamos el formato, tamaño y páginas de los
                archivos, no su contenido. CotizaLupa los analizará después del pago.
                Recibirás un reporte de mejor esfuerzo según los archivos que
                envíes. Si el servicio falla y no podemos entregar el reporte,
                gestionaremos el reembolso manual. <a href="/reembolsos" target="_blank" rel="noreferrer">Ver condiciones</a>.
              </p>
              <div className="summary-row">
                <span>Perspectiva</span>
                <b>Soy cliente</b>
              </div>
              <div className="summary-row">
                <span>Documento</span>
                <b>{state.fileName ?? "Ningún archivo seleccionado"}</b>
              </div>
              <div className="summary-row">
                <span>Incluye</span>
                <b>Reporte, 3 prioridades y textos para copiar</b>
              </div>
              <div className="summary-row">
                <span>Correo del reporte</span>
                <b>{state.email.trim()}</b>
              </div>
              <div className="summary-row summary-total">
                <span>Precio de la revisión</span>
                <b>$9.99 USD</b>
              </div>
              <div className="demo-banner">
                <strong>Crear la orden no realiza ningún cobro.</strong>
                <br />
                Guardaremos tus archivos y te daremos un enlace privado. Desde allí podrás abrir el pago. El análisis comenzará después de que Polar confirme el pago.
              </div>
              <button
                type="button"
                className="flow-demo-link"
                onClick={() => {
                  dialogRef.current?.close();
                  scrollToExample();
                }}
              >
                Ver reporte de ejemplo <Icon name="arrow-right" />
              </button>
              {preparationError && (
                <p className="privacy-note" role="alert">
                  {preparationError}
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
            disabled={preparing}
            onClick={() => {
              setPreparationError(null);
              dispatch({ type: "back" });
            }}
          >
            Atrás
          </button>
          {state.step === 2 ? (
            <button
              type="button"
              className="button blue"
              id="next"
              disabled={files.length === 0 || !filesConfirmed || preparing}
              onClick={createReviewOrder}
            >
              {preparing ? "Abriendo el pago…" : "Continuar al pago"}
            </button>
          ) : (
            <button type="submit" className="button blue" id="next">
              Revisar archivos <Icon name="arrow-right" />
            </button>
          )}
        </div>
      </form>
    </dialog>
  );
}
