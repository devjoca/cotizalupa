import { createHash } from "node:crypto";

import { fileTypeFromBuffer } from "file-type";
import { getDocumentProxy } from "unpdf";

import {
  MAX_BASE64_LENGTH,
  MAX_IMAGE_FILES,
  MAX_ORDER_BYTES,
  MAX_PDF_PAGES,
  type AllowedMime,
  isAllowedMime,
} from "#/lib/uploadLimits";

export type AnalysisUpload = {
  name: string;
  mime: string;
  dataBase64: string;
};

export type ValidatedAnalysisFile = {
  name: string;
  mime: AllowedMime;
  dataBase64: string;
  sizeBytes: number;
  sha256: string;
  pages: number | null;
};

export type MechanicalValidationCode =
  | "INVALID_FILE_COUNT"
  | "INVALID_BASE64"
  | "EMPTY_FILE"
  | "ORDER_TOO_LARGE"
  | "UNSUPPORTED_TYPE"
  | "MIME_MISMATCH"
  | "MIXED_FILE_TYPES"
  | "INVALID_PDF"
  | "PDF_TOO_LONG";

const MESSAGES: Record<MechanicalValidationCode, string> = {
  INVALID_FILE_COUNT: "Sube un PDF o entre 1 y 10 imágenes.",
  INVALID_BASE64: "No se pudo leer uno de los archivos.",
  EMPTY_FILE: "Uno de los archivos está vacío.",
  ORDER_TOO_LARGE: "Los archivos superan el máximo total de 25 MB.",
  UNSUPPORTED_TYPE: "Solo aceptamos archivos PDF, JPG o PNG.",
  MIME_MISMATCH: "El contenido de un archivo no coincide con su tipo declarado.",
  MIXED_FILE_TYPES: "Sube un solo PDF o un grupo de imágenes, sin mezclarlos.",
  INVALID_PDF: "El PDF está dañado, cifrado o protegido con contraseña.",
  PDF_TOO_LONG: "El PDF supera el máximo de 10 páginas.",
};

export class MechanicalValidationError extends Error {
  readonly code: MechanicalValidationCode;

  constructor(code: MechanicalValidationCode) {
    super(MESSAGES[code]);
    this.name = "MechanicalValidationError";
    this.code = code;
  }
}

function isBase64Character(code: number): boolean {
  return (
    (code >= 48 && code <= 57) ||
    (code >= 65 && code <= 90) ||
    (code >= 97 && code <= 122) ||
    code === 43 ||
    code === 47
  );
}

function isValidBase64(value: string): boolean {
  if (value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const contentLength = value.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (!isBase64Character(value.charCodeAt(index))) return false;
  }
  for (let index = contentLength; index < value.length; index += 1) {
    if (value.charCodeAt(index) !== 61) return false;
  }
  return true;
}

function decodeBase64(value: string): Buffer {
  if (
    value.length === 0 ||
    value.length > MAX_BASE64_LENGTH ||
    !isValidBase64(value)
  ) {
    throw new MechanicalValidationError("INVALID_BASE64");
  }
  return Buffer.from(value, "base64");
}

async function pdfPages(buffer: Buffer): Promise<number> {
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>> | null = null;
  try {
    pdf = await getDocumentProxy(new Uint8Array(buffer));
    return pdf.numPages;
  } catch {
    throw new MechanicalValidationError("INVALID_PDF");
  } finally {
    const runtimePdf = pdf as null | {
      destroy?: () => void | Promise<void>;
    };
    if (typeof runtimePdf?.destroy === "function") {
      await runtimePdf.destroy();
    }
  }
}

function safeAttachmentName(mime: AllowedMime, index: number): string {
  if (mime === "application/pdf") return "cotizacion.pdf";
  const extension = mime === "image/jpeg" ? "jpg" : "png";
  return `cotizacion-${index + 1}.${extension}`;
}

export async function validateAnalysisFiles(
  uploads: readonly AnalysisUpload[],
): Promise<ValidatedAnalysisFile[]> {
  if (uploads.length === 0 || uploads.length > MAX_IMAGE_FILES) {
    throw new MechanicalValidationError("INVALID_FILE_COUNT");
  }

  const decoded = [] as Array<{
    upload: AnalysisUpload;
    buffer: Buffer;
    mime: AllowedMime;
  }>;
  let totalBytes = 0;

  for (const upload of uploads) {
    if (!isAllowedMime(upload.mime)) {
      throw new MechanicalValidationError("UNSUPPORTED_TYPE");
    }
    const buffer = decodeBase64(upload.dataBase64);
    if (buffer.length === 0) {
      throw new MechanicalValidationError("EMPTY_FILE");
    }
    totalBytes += buffer.length;
    if (totalBytes > MAX_ORDER_BYTES) {
      throw new MechanicalValidationError("ORDER_TOO_LARGE");
    }

    const detected = await fileTypeFromBuffer(buffer);
    if (!detected || !isAllowedMime(detected.mime)) {
      throw new MechanicalValidationError("UNSUPPORTED_TYPE");
    }
    if (detected.mime !== upload.mime) {
      throw new MechanicalValidationError("MIME_MISMATCH");
    }
    decoded.push({ upload, buffer, mime: detected.mime });
  }

  const pdfCount = decoded.filter(
    ({ mime }) => mime === "application/pdf",
  ).length;
  if (pdfCount > 1 || (pdfCount === 1 && decoded.length > 1)) {
    throw new MechanicalValidationError("MIXED_FILE_TYPES");
  }

  return Promise.all(
    decoded.map(async ({ upload, buffer, mime }, index) => {
      const pages = mime === "application/pdf" ? await pdfPages(buffer) : null;
      if (pages !== null && pages > MAX_PDF_PAGES) {
        throw new MechanicalValidationError("PDF_TOO_LONG");
      }
      return {
        name: safeAttachmentName(mime, index),
        mime,
        dataBase64: upload.dataBase64,
        sizeBytes: buffer.length,
        sha256: createHash("sha256").update(buffer).digest("hex"),
        pages,
      };
    }),
  );
}
