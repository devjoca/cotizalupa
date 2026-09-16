import { describe, expect, it } from "vitest";

import {
  MechanicalValidationError,
  validateAnalysisFiles,
} from "#/server/validation";

const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);
const onePagePdf = Buffer.from(
  "JVBERi0xLjQKMSAwIG9iago8PCAvVHlwZSAvQ2F0YWxvZyAvUGFnZXMgMiAwIFIgPj4KZW5kb2JqCjIgMCBvYmoKPDwgL1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDEgPj4KZW5kb2JqCjMgMCBvYmoKPDwgL1R5cGUgL1BhZ2UgL1BhcmVudCAyIDAgUiAvTWVkaWFCb3ggWzAgMCA2MTIgNzkyXSA+PgplbmRvYmoKeHJlZgowIDQKMDAwMDAwMDAwMCA2NTUzNSBmIAowMDAwMDAwMDA5IDAwMDAwIG4gCjAwMDAwMDAwNTggMDAwMDAgbiAKMDAwMDAwMDExNSAwMDAwMCBuIAp0cmFpbGVyCjw8IC9TaXplIDQgL1Jvb3QgMSAwIFIgPj4Kc3RhcnR4cmVmCjE4NgolJUVPRgo=",
  "base64",
);

function upload(
  buffer: Buffer,
  mime = "image/png",
  name = "quote.png",
) {
  return { name, mime, dataBase64: buffer.toString("base64") };
}

describe("mechanical analysis validation", () => {
  it("accepts a valid PDF even when the runtime proxy has no destroy method", async () => {
    const [result] = await validateAnalysisFiles([
      upload(onePagePdf, "application/pdf", "quote.pdf"),
    ]);
    expect(result).toMatchObject({
      name: "cotizacion.pdf",
      mime: "application/pdf",
      pages: 1,
    });
  });

  it("detects MIME, computes sha256, and does not retain the original name", async () => {
    const [result] = await validateAnalysisFiles([upload(png)]);
    expect(result).toMatchObject({
      name: "cotizacion-1.png",
      mime: "image/png",
      sizeBytes: png.length,
      pages: null,
    });
    expect(result?.sha256).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects a claimed MIME that does not match the bytes", async () => {
    await expect(
      validateAnalysisFiles([upload(png, "application/pdf", "quote.pdf")]),
    ).rejects.toMatchObject<Partial<MechanicalValidationError>>({
      code: "MIME_MISMATCH",
    });
  });

  it("rejects more than 25 MB across the order before model work", async () => {
    const oversize = Buffer.alloc(25 * 1024 * 1024 + 1, 1);
    await expect(
      validateAnalysisFiles([upload(oversize)]),
    ).rejects.toMatchObject<Partial<MechanicalValidationError>>({
      code: "ORDER_TOO_LARGE",
    });
  });

  it("rejects invalid base64", async () => {
    await expect(
      validateAnalysisFiles([
        { name: "quote.png", mime: "image/png", dataBase64: "%%%" },
      ]),
    ).rejects.toMatchObject<Partial<MechanicalValidationError>>({
      code: "INVALID_BASE64",
    });
  });

  it("rejects bytes that claim to be a PDF but cannot be parsed", async () => {
    const brokenPdf = Buffer.from("%PDF-1.7\nnot-a-real-pdf");
    await expect(
      validateAnalysisFiles([
        upload(brokenPdf, "application/pdf", "quote.pdf"),
      ]),
    ).rejects.toMatchObject<Partial<MechanicalValidationError>>({
      code: "INVALID_PDF",
    });
  });
});
