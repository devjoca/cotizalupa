import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import type { Db } from "#/db/client";
import {
  dueForDeletion,
  filesForOrder,
  markFileDeleted,
  type OrderFile,
} from "#/db/orders";
import { isAllowedMime, mimeToExtension } from "#/lib/uploadLimits";
import type { AnalysisInputFile } from "./ai";
import { captureOperationalError } from "./monitoring";

// Deterministic order data: no retry will fix a missing file, a bad stored
// MIME, or an integrity mismatch, so the caller fails the order immediately
// instead of burning attempts. Transport errors (S3, DB) stay plain Errors
// and keep the retry path.
export class InvalidOrderData extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidOrderData";
  }
}

type BucketConfig = {
  bucket: string;
  client: S3Client;
};

let shared: BucketConfig | undefined;

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`missing ${name}`);
  return value;
}

function bucketConfig(): BucketConfig {
  if (shared) return shared;
  shared = {
    bucket: requiredEnv("AWS_S3_BUCKET_NAME"),
    client: new S3Client({
      endpoint: requiredEnv("AWS_ENDPOINT_URL"),
      region: process.env.AWS_DEFAULT_REGION ?? "auto",
      forcePathStyle: process.env.AWS_S3_URL_STYLE === "path",
      credentials: {
        accessKeyId: requiredEnv("AWS_ACCESS_KEY_ID"),
        secretAccessKey: requiredEnv("AWS_SECRET_ACCESS_KEY"),
      },
    }),
  };
  return shared;
}

async function objectBytes(blobPath: string): Promise<Uint8Array> {
  const { bucket, client } = bucketConfig();
  const object = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: blobPath }),
  );
  if (!object.Body) throw new Error("bucket object has no body");
  return object.Body.transformToByteArray();
}

export async function loadAnalysisFiles(
  db: Db,
  orderId: string,
): Promise<AnalysisInputFile[]> {
  const files = await filesForOrder(db, orderId);
  if (files.length === 0) throw new InvalidOrderData("order has no files");

  return Promise.all(
    files.map(async (file, index) => {
      if (!isAllowedMime(file.mime))
        throw new InvalidOrderData("stored MIME is invalid");
      const bytes = await objectBytes(file.blobPath);
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      if (bytes.byteLength !== file.sizeBytes || sha256 !== file.sha256) {
        throw new InvalidOrderData("stored object does not match validated metadata");
      }
      return {
        name: `cotizacion-${index + 1}.${mimeToExtension(file.mime)}`,
        mime: file.mime,
        dataBase64: Buffer.from(bytes).toString("base64"),
      };
    }),
  );
}

async function deleteOriginal(file: OrderFile): Promise<void> {
  const { bucket, client } = bucketConfig();
  await client.send(
    new DeleteObjectCommand({ Bucket: bucket, Key: file.blobPath }),
  );
}

export async function sweepDueOriginals(
  db: Db,
  remove: (file: OrderFile) => Promise<void> = deleteOriginal,
): Promise<{ deleted: string[]; failed: string[] }> {
  const deleted: string[] = [];
  const failed: string[] = [];
  for (const file of await dueForDeletion(db)) {
    try {
      await remove(file);
      await markFileDeleted(db, file.id);
      deleted.push(file.id);
    } catch (error) {
      failed.push(file.id);
      captureOperationalError("storage_delete_failed", error, {
        file_id: file.id,
        order_id: file.orderId,
      });
    }
  }
  return { deleted, failed };
}
