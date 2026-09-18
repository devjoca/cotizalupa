import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { getDb } from "#/db/client";
import { ReviewRequestSchema } from "#/lib/reviewRequest";
import { analysisGuard } from "./analysisGuard";
import { captureOperationalError } from "./monitoring";
import { prepareOrder } from "./prepareOrder";
import { reviewsDisabled } from "./reviews.server";

export const prepareReview = createServerFn({ method: "POST" })
  .validator(ReviewRequestSchema)
  .handler(async ({ data }) => {
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
        message: "Alcanzaste el límite de 10 solicitudes por hora. Inténtalo más tarde.",
      };
    }
    // Bound decoding, PDF validation and bucket writes together.
    const release = analysisGuard.tryAcquire();
    if (!release) {
      return {
        status: "BUSY" as const,
        message: "Hay varias revisiones en curso. Espera un momento e inténtalo de nuevo.",
      };
    }
    try {
      return await prepareOrder(data, { getDatabase: getDb });
    } catch (error) {
      captureOperationalError("order_prepare_failed", error);
      return {
        status: "PREPARATION_FAILED" as const,
        message: "No pudimos preparar la revisión. Inténtalo de nuevo. No se realizó ningún cobro.",
      };
    } finally {
      release();
    }
  });
