import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";

import { ReportView, type AnalyzeResult } from "../components/ReportView";
import { fileToUpload } from "../lib/fileBase64";
import { CATEGORIES, MOMENTS } from "../lib/reviewContext";
import { analyzeFiles } from "../server/analyze";

// Prompt-validation scaffolding, not product UI: bare form (file → report)
// so the analysis prompt can be judged before the DB and upload flow exist.
export const Route = createFileRoute("/analyze")({
  component: AnalyzePage,
});

function AnalyzePage() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AnalyzeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setResult(null);
    setError(null);
    try {
      const form = e.currentTarget;
      const formData = new FormData(form);
      const input = form.querySelector('input[type="file"]') as HTMLInputElement;
      const perspective =
        formData.get("perspective") === "provider" ? "provider" : "customer";
      const category = CATEGORIES.find(
        (value) => value === formData.get("category"),
      );
      const moment = MOMENTS.find(
        (value) => value === formData.get("moment"),
      );
      if (!category || !moment) {
        throw new Error("Completa el contexto del análisis.");
      }
      const files = await Promise.all([...(input.files ?? [])].map(fileToUpload));
      setResult(
        await analyzeFiles({
          data: {
            files,
            perspective,
            context: {
              category,
              other: "",
              amount: String(formData.get("amount") ?? ""),
              moment,
              concern: String(formData.get("concern") ?? ""),
            },
          },
        }),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "request failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: 720,
        margin: "2rem auto",
        padding: "0 1rem",
        fontFamily: "system-ui",
      }}
    >
      <h1>Analizar cotización (validación del prompt)</h1>
      <form onSubmit={onSubmit}>
        <input
          type="file"
          required
          multiple
          accept="application/pdf,image/jpeg,image/png"
        />
        <label>
          Perspectiva{" "}
          <select name="perspective" defaultValue="customer">
            <option value="customer">Cliente (voy a aceptar)</option>
            <option value="provider">Proveedor (voy a enviar)</option>
          </select>
        </label>
        <label>
          Categoría{" "}
          <select name="category" defaultValue={CATEGORIES[0]}>
            {CATEGORIES.filter((category) => category !== "Otro").map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label>
          Momento{" "}
          <select name="moment" defaultValue={MOMENTS[0]}>
            {MOMENTS.map((moment) => (
              <option key={moment} value={moment}>
                {moment}
              </option>
            ))}
          </select>
        </label>
        <label>
          Monto aproximado{" "}
          <input name="amount" type="number" min="0" step="0.01" />
        </label>
        <label>
          Preocupación <textarea name="concern" maxLength={800} />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? "Analizando…" : "Enviar y analizar"}
        </button>
      </form>
      {error && <p style={{ color: "crimson" }}>{error}</p>}
      {result && <ReportView result={result} />}
    </main>
  );
}
