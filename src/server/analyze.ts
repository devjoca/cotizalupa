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
import { analysisGuard } from "./analysisGuard";
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

export const analyzeFiles = createServerFn({ method: "POST" })
  .validator(FilesInput)
  .handler(async ({ data }) => {
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
        return {
          status: "AI_REFUSED" as const,
          message: "El modelo no pudo revisar el contenido de este documento.",
        };
      }
      if (error instanceof AiInvalidOutput) {
        return {
          status: "MODEL_INVALID_OUTPUT" as const,
          message: "El análisis no produjo un reporte válido. Inténtalo de nuevo.",
        };
      }
      if (error instanceof AiRequestFailed) {
        return {
          status: "PROVIDER_FAILURE" as const,
          retryable: error.retryable,
          message: error.retryable
            ? "El servicio de análisis no está disponible por el momento. Inténtalo de nuevo."
            : "El servicio de análisis no está configurado correctamente.",
        };
      }
      throw error;
    } finally {
      release();
    }
  });
