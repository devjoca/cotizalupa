import { randomUUID } from "node:crypto";
import type { Db } from "#/db/client";
import { hashReportToken, newReportToken, rejectOrder, transition } from "#/db/orders";
import { orderFiles, orders } from "#/db/schema";
import type { ReviewRequest } from "#/lib/reviewRequest";
import { mimeToExtension } from "#/lib/uploadLimits";
import { captureOperationalError } from "./monitoring";
import { writeOriginal } from "./storage";
import { MechanicalValidationError, validateAnalysisFiles } from "./validation";

export async function prepareOrder(
  data: ReviewRequest,
  dependencies: {
    getDatabase: () => Db;
    write?: typeof writeOriginal;
  },
) {
  let files;
  try {
    files = await validateAnalysisFiles(data.files);
  } catch (error) {
    if (error instanceof MechanicalValidationError) {
      return { status: "INVALID_UPLOAD" as const, message: error.message };
    }
    throw error;
  }

  const token = newReportToken();
  const orderId = randomUUID();
  const db = dependencies.getDatabase();
  // Persist the entire manifest before touching the bucket. CREATED is internal
  // staging, never a checkout-ready state. No model runs before payment.
  const manifest = await db.transaction(async (tx) => {
    await tx.insert(orders).values({
      id: orderId,
      status: "CREATED",
      reportTokenHash: hashReportToken(token),
      perspective: data.perspective,
      category: data.context.service_category,
      moment: data.context.moment,
      userContext: data.context.concern,
      amountCents: data.context.approximate_amount_cents,
    });
    return tx.insert(orderFiles)
      .values(files.map((file, position) => ({
        id: randomUUID(),
        orderId,
        position,
        blobPath: `orders/${orderId}/${position}.${mimeToExtension(file.mime)}`,
        mime: file.mime,
        sizeBytes: file.sizeBytes,
        sha256: file.sha256,
        pages: file.pages,
      })))
      .returning();
  });
  try {
    for (const entry of manifest) {
      await (dependencies.write ?? writeOriginal)(entry, files[entry.position]!);
    }
    const ready = await transition(db, orderId, "CREATED", "READY_FOR_PAYMENT");
    if (!ready) throw new Error("order could not become ready");
  } catch (error) {
    // The drain deletes every tracked key, including writes with unknown outcomes.
    await rejectOrder(db, orderId, "CREATED");
    captureOperationalError("order_upload_failed", error, { order_id: orderId });
    return {
      status: "STORAGE_FAILED" as const,
      message: "No pudimos guardar la cotización. Inténtalo de nuevo. No se realizó ningún cobro.",
    };
  }
  return { status: "READY_FOR_PAYMENT" as const, report_token: token };
}
