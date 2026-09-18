import { createHash } from "node:crypto";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
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
import type { ValidatedAnalysisFile } from "./validation";

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

export type StorageSettings = {
  bucket: string;
  endpoint: string;
  region: string;
  forcePathStyle: boolean;
  accessKeyId: string;
  secretAccessKey: string;
};

const LOCAL_STORAGE_SETTINGS: StorageSettings = {
  bucket: "cotizalupa",
  endpoint: "http://127.0.0.1:59000",
  region: "auto",
  forcePathStyle: true,
  accessKeyId: "cotizalupa-local",
  secretAccessKey: "cotizalupa-local-secret",
};

let shared: BucketConfig | undefined;

type StorageEnv = Partial<Pick<
  NodeJS.ProcessEnv,
  | "AWS_S3_BUCKET_NAME"
  | "AWS_ENDPOINT_URL"
  | "AWS_ACCESS_KEY_ID"
  | "AWS_SECRET_ACCESS_KEY"
  | "AWS_DEFAULT_REGION"
  | "AWS_S3_URL_STYLE"
  | "NODE_ENV"
>>;

export function resolveStorageSettings(
  env: StorageEnv = process.env,
): StorageSettings {
  const configured = [
    env.AWS_S3_BUCKET_NAME,
    env.AWS_ENDPOINT_URL,
    env.AWS_ACCESS_KEY_ID,
    env.AWS_SECRET_ACCESS_KEY,
  ];
  const hasConfiguredStorage = configured.some(Boolean);

  if (hasConfiguredStorage && configured.every(Boolean)) {
    return {
      bucket: env.AWS_S3_BUCKET_NAME!,
      endpoint: env.AWS_ENDPOINT_URL!,
      region: env.AWS_DEFAULT_REGION ?? "auto",
      forcePathStyle: env.AWS_S3_URL_STYLE === "path",
      accessKeyId: env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY!,
    };
  }

  if (hasConfiguredStorage) {
    throw new Error("storage configuration is incomplete");
  }

  if (env.NODE_ENV === "production") {
    throw new Error("storage configuration is required");
  }

  return LOCAL_STORAGE_SETTINGS;
}

function bucketConfig(): BucketConfig {
  if (shared) return shared;
  const settings = resolveStorageSettings();
  shared = {
    bucket: settings.bucket,
    client: new S3Client({
      endpoint: settings.endpoint,
      region: settings.region,
      forcePathStyle: settings.forcePathStyle,
      credentials: {
        accessKeyId: settings.accessKeyId,
        secretAccessKey: settings.secretAccessKey,
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

// The order and manifest must be committed before this write. Even a crashed
// request then leaves a tracked object for the monthly drain.
export async function writeOriginal(file: OrderFile, validated: ValidatedAnalysisFile) {
  const { bucket, client } = bucketConfig();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: file.blobPath,
    Body: Buffer.from(validated.dataBase64, "base64"),
    ContentType: validated.mime,
    IfNoneMatch: "*",
  }));
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
