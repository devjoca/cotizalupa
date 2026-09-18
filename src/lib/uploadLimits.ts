export const MAX_ORDER_BYTES = 25 * 1024 * 1024;
export const MAX_ORDER_FILES = 5;
export const MAX_PDF_PAGES = 10;

export const ALLOWED_MIMES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export const MAX_BASE64_LENGTH = Math.ceil(MAX_ORDER_BYTES / 3) * 4;

export function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIMES as readonly string[]).includes(value);
}

// Single owner of the mime ↔ extension mapping. Every layer (client picker,
// mechanical validation, bucket reads, upload naming) goes through these so
// the pairs cannot drift apart.
export function mimeToExtension(mime: AllowedMime): "pdf" | "jpg" | "png" {
  if (mime === "application/pdf") return "pdf";
  return mime === "image/jpeg" ? "jpg" : "png";
}

export function extensionToMime(name: string): AllowedMime | null {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  return null;
}

