// Mechanical validation, server-side after upload to presigned URL.
// See PLAN.md "Validación mecánica": real MIME via `file-type`, 25 MB max,
// `unpdf` for pages/encryption (>10 pages reject), >10 images reject,
// `sha256` computed on the server, never sent by the client.
// TODO: phase 1.
export {};
