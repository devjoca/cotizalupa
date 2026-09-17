import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { createHash } from "node:crypto";

import type { Db } from "#/db/client";
import {
  createOrder,
  hashReportToken,
  newReportToken,
  recordFile,
  transition,
} from "#/db/orders";
import { orderFiles, orders } from "#/db/schema";
import { loadAnalysisFiles, sweepDueOriginals } from "#/server/storage";
import { and, eq, isNull } from "drizzle-orm";
import { setupTestDb } from "./db";

let db: Db;
let close: () => Promise<void>;

beforeEach(async () => {
  ({ db, close } = await setupTestDb());
});

afterEach(async () => {
  await close();
  vi.unstubAllEnvs();
});

describe("original deletion", () => {
  it("marks a file deleted only after bucket deletion succeeds", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const file = await recordFile(db, {
      orderId: order.id,
      position: 0,
      blobPath: `orders/${order.id}/quote.pdf`,
      mime: "application/pdf",
      sizeBytes: 10,
      sha256: "abc",
    });
    await transition(db, order.id, "CREATED", "EXPIRED", {
      deleteAfter: new Date(Date.now() - 1_000),
    });
    const remove = vi.fn(async () => undefined);

    expect(await sweepDueOriginals(db, remove)).toEqual({
      deleted: [file.id],
      failed: [],
    });
    expect(remove).toHaveBeenCalledOnce();
    expect(
      await db
        .select()
        .from(orderFiles)
        .where(and(eq(orderFiles.id, file.id), isNull(orderFiles.deletedAt))),
    ).toHaveLength(0);
  });

  it("keeps metadata retryable when bucket deletion fails", async () => {
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const file = await recordFile(db, {
      orderId: order.id,
      position: 0,
      blobPath: `orders/${order.id}/quote.pdf`,
      mime: "application/pdf",
      sizeBytes: 10,
      sha256: "abc",
    });
    await db
      .update(orders)
      .set({ status: "EXPIRED", deleteAfter: new Date(Date.now() - 1_000) })
      .where(eq(orders.id, order.id));

    expect(
      await sweepDueOriginals(db, async () => {
        throw new Error("bucket unavailable");
      }),
    ).toEqual({ deleted: [], failed: [file.id] });
    const [stored] = await db
      .select()
      .from(orderFiles)
      .where(eq(orderFiles.id, file.id));
    expect(stored?.deletedAt).toBeNull();
  });

  it("reads, verifies, and deletes an original through local MinIO", async () => {
    vi.stubEnv("AWS_ENDPOINT_URL", "http://127.0.0.1:59000");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "cotizalupa-local");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "cotizalupa-local-secret");
    vi.stubEnv("AWS_S3_BUCKET_NAME", "cotizalupa");
    vi.stubEnv("AWS_DEFAULT_REGION", "auto");
    vi.stubEnv("AWS_S3_URL_STYLE", "path");
    const client = new S3Client({
      endpoint: "http://127.0.0.1:59000",
      region: "auto",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "cotizalupa-local",
        secretAccessKey: "cotizalupa-local-secret",
      },
    });
    const bytes = Buffer.from("synthetic quotation bytes");
    const order = await createOrder(db, {
      reportTokenHash: hashReportToken(newReportToken()),
    });
    const blobPath = `tests/${order.id}/quote.pdf`;
    await client.send(
      new PutObjectCommand({ Bucket: "cotizalupa", Key: blobPath, Body: bytes }),
    );
    const file = await recordFile(db, {
      orderId: order.id,
      position: 0,
      blobPath,
      mime: "application/pdf",
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });

    expect(await loadAnalysisFiles(db, order.id)).toEqual([
      {
        name: "cotizacion-1.pdf",
        mime: "application/pdf",
        dataBase64: bytes.toString("base64"),
      },
    ]);
    await transition(db, order.id, "CREATED", "EXPIRED", {
      deleteAfter: new Date(Date.now() - 1_000),
    });
    expect(await sweepDueOriginals(db)).toEqual({
      deleted: [file.id],
      failed: [],
    });
    await expect(
      client.send(new GetObjectCommand({ Bucket: "cotizalupa", Key: blobPath })),
    ).rejects.toMatchObject({ name: "NoSuchKey" });
    client.destroy();
  });
});
