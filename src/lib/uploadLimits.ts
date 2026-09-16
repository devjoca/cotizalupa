export const MAX_ORDER_BYTES = 25 * 1024 * 1024;
export const MAX_IMAGE_FILES = 10;
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

