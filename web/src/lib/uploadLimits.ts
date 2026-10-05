// Client-side mirror of the server limits in internal/app/reviews.go, so bad
// picks fail fast in the dialog. The server remains the authority.
export const MAX_ORDER_BYTES = 25 * 1024 * 1024;
export const MAX_ORDER_FILES = 5;

const ALLOWED_MIMES = ["application/pdf", "image/jpeg", "image/png"] as const;

export type AllowedMime = (typeof ALLOWED_MIMES)[number];

export function isAllowedMime(value: string): value is AllowedMime {
  return (ALLOWED_MIMES as readonly string[]).includes(value);
}

export function extensionToMime(name: string): AllowedMime | null {
  if (/\.pdf$/i.test(name)) return "application/pdf";
  if (/\.jpe?g$/i.test(name)) return "image/jpeg";
  if (/\.png$/i.test(name)) return "image/png";
  return null;
}

