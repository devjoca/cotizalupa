import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  AiInvalidOutput,
  AiRefused,
  AiRequestFailed,
  analyzeQuotation,
  type AnalysisInputFile,
} from "./ai";
import { reviewsDisabled } from "./reviews.server";
import { analysisGuard } from "./analysisGuard";
import { captureOperationalError } from "./monitoring";
import {
  MechanicalValidationError,
  validateAnalysisFiles,
} from "./validation";
import {
  PerspectiveSchema,
  ReviewContextInputSchema,
  isAnalyzable,
} from "#/lib/schemas";
import {
  MAX_BASE64_LENGTH,
  MAX_IMAGE_FILES,
  MAX_ORDER_BYTES,
} from "#/lib/uploadLimits";
import { getDb } from "#/db/client";
import { createCompletedDemoReport } from "#/db/orders";

const FilesInput = z.strictObject({
  files: z
    .array(
      z.strictObject({
        name: z.string().min(1).max(255),
        mime: z.string().min(1).max(100),
        dataBase64: z.string().max(MAX_BASE64_LENGTH),
      }),
    )
    .min(1)
    .max(MAX_IMAGE_FILES)
    .superRefine((files, context) => {
      const estimatedDecodedBytes = files.reduce(
        (total, file) =>
          total +
          Math.floor((file.dataBase64.length * 3) / 4) -
          (file.dataBase64.endsWith("==")
            ? 2
            : file.dataBase64.endsWith("=")
              ? 1
              : 0),
        0,
      );
      if (estimatedDecodedBytes > MAX_ORDER_BYTES) {
        context.addIssue({
          code: "custom",
          message: "Los archivos superan el máximo total de 25 MB.",
        });
      }
    }),
  perspective: PerspectiveSchema.default("customer"),
  context: ReviewContextInputSchema,
});

async function runAnalysis(data: z.infer<typeof FilesInput>) {
  if (reviewsDisabled()) {
    return {
      status: "REVIEWS_DISABLED" as const,
      message: "Las revisiones aún no están disponibles. No se ha generado ningún reporte ni realizado ningún cobro.",
    };
  }

  const clientIp = getRequestIP({ xForwardedFor: true }) ?? "unknown";
  if (!analysisGuard.takeRateLimit(clientIp)) {
    return {
      status: "RATE_LIMITED" as const,
      message:
        "Alcanzaste el límite de 10 análisis por hora. Inténtalo más tarde.",
    };
  }

  let files: AnalysisInputFile[];
  try {
    files = await validateAnalysisFiles(data.files);
  } catch (error) {
    if (error instanceof MechanicalValidationError) {
      return {
        status: "INVALID_UPLOAD" as const,
        code: error.code,
        message: error.message,
      };
    }
    throw error;
  }

  const release = analysisGuard.tryAcquire();
  if (!release) {
    return {
      status: "BUSY" as const,
      message:
        "Hay varias revisiones en curso. Espera un momento e inténtalo de nuevo.",
    };
  }

  try {
    const result = await analyzeQuotation(files, {
      context: data.context,
      perspective: data.perspective,
    });
    if (!isAnalyzable(result.analysis)) {
      return {
        status: "DOCUMENT_REJECTED" as const,
        message:
          result.analysis.document.rejection_reason ??
          "No podemos analizar este documento como una sola cotización.",
      };
    }
    return {
      status: "COMPLETED" as const,
      analysis: result.analysis,
      usage: result.usage,
      latency_ms: result.latency_ms,
      model: result.model,
      prompt_version: result.prompt_version,
    };
  } catch (error) {
    if (error instanceof AiRefused) {
      captureOperationalError("analysis_refused", error);
      return {
        status: "AI_REFUSED" as const,
        message: "El modelo no pudo revisar el contenido de este documento.",
      };
    }
    if (error instanceof AiInvalidOutput) {
      captureOperationalError("analysis_invalid_output", error);
      return {
        status: "MODEL_INVALID_OUTPUT" as const,
        message: "El análisis no produjo un reporte válido. Inténtalo de nuevo.",
      };
    }
    if (error instanceof AiRequestFailed) {
      captureOperationalError("analysis_provider_failure", error, {
        retryable: error.retryable,
        status: error.status,
      });
      return {
        status: "PROVIDER_FAILURE" as const,
        retryable: error.retryable,
        message: error.retryable
          ? "El servicio de análisis no está disponible por el momento. Inténtalo de nuevo."
          : "El servicio de análisis no está configurado correctamente.",
      };
    }
    captureOperationalError("analysis_unexpected_failure", error);
    throw error;
  } finally {
    release();
  }
}

export const analyzeAndPersistReport = createServerFn({ method: "POST" })
  .validator(FilesInput)
  .handler(async ({ data }) => {
    const analyzed = await runAnalysis(data);
    if (analyzed.status !== "COMPLETED") return analyzed;

    const { quotation_facts, ...report } = analyzed.analysis;
    if (!quotation_facts) {
      captureOperationalError("demo_report_missing_facts");
      return {
        status: "PERSISTENCE_FAILURE" as const,
        message: "No pudimos preparar el reporte. Inténtalo de nuevo.",
      };
    }

    try {
      const saved = await createCompletedDemoReport(getDb(), {
        perspective: data.perspective,
        category: data.context.service_category,
        moment: data.context.moment,
        amountCents: data.context.approximate_amount_cents,
        result: report,
        quotationFacts: quotation_facts,
        model: analyzed.model,
        promptVersion: analyzed.prompt_version,
        inputTokens: analyzed.usage.input_tokens,
        outputTokens: analyzed.usage.output_tokens,
        latencyMs: analyzed.latency_ms,
      });
      return {
        status: "COMPLETED" as const,
        report_token: saved.reportToken,
      };
    } catch (error) {
      captureOperationalError("demo_report_persist_failed", error);
      return {
        status: "PERSISTENCE_FAILURE" as const,
        message: "No pudimos guardar el reporte. Inténtalo de nuevo.",
      };
    }
  });
